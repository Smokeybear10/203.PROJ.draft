import { DRAFT_STORAGE_KEY, emptyResume, parseStoredResume, type Resume } from './resume.ts'

export const WORKSPACE_STORAGE_KEY = 'draft.workspace.v2'
export const MAX_DOCUMENTS = 50
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024
export const MAX_POSTING_LENGTH = 30_000

export type ResumeTarget = { company: string; role: string; posting: string; manualPhrases: string[] }
export type ResumeDocument = {
  id: string
  title: string
  target: ResumeTarget
  resume: Resume
  createdAt: string
  updatedAt: string
}
export type Workspace = { version: 2; activeDocumentId: string; documents: ResumeDocument[] }
export type DocumentUpdate = { title?: string; target?: Partial<ResumeTarget>; resume?: Resume }
export type WorkspaceResult = { ok: true; workspace: Workspace } | { ok: false; message: string }
export type WorkspaceStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type WorkspaceSave = { ok: true; raw: string } | { ok: false; reason: 'conflict' | 'storage' }
export type SavedWorkspaceRecovery = { key: typeof WORKSPACE_STORAGE_KEY | typeof DRAFT_STORAGE_KEY; raw: string; workspaceRaw: string | null }
export type WorkspaceRecovery = { ok: true; workspace: Workspace; raw: string } | { ok: false; reason: 'conflict' | 'storage' | 'backup-required' }

const emptyTarget: ResumeTarget = { company: '', role: '', posting: '', manualPhrases: [] }
const fail = (message: string): WorkspaceResult => ({ ok: false, message })
const byteLength = (value: string) => new TextEncoder().encode(value).byteLength
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
const isDate = (value: unknown): value is string => typeof value === 'string' && value.length <= 30 && Number.isFinite(Date.parse(value))

function documentFromResume(resume: Resume, title = 'Untitled resume'): ResumeDocument {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), title, target: structuredClone(emptyTarget), resume: structuredClone(resume), createdAt: now, updatedAt: now }
}

export function createWorkspace(resume: Resume = emptyResume): Workspace {
  const document = documentFromResume(resume)
  return { version: 2, activeDocumentId: document.id, documents: [document] }
}

export const initialWorkspace: Workspace = {
  version: 2,
  activeDocumentId: 'initial-draft',
  documents: [{ id: 'initial-draft', title: 'Untitled resume', target: emptyTarget, resume: emptyResume, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' }],
}

function readResume(value: unknown): Resume | null {
  const resume = parseStoredResume(JSON.stringify({ version: 1, resume: value }))
  if (!resume || [resume.experiences, resume.education, resume.projects].some((entries) => entries.length > 100)) return null
  return {
    name: resume.name, email: resume.email, phone: resume.phone, location: resume.location,
    website: resume.website, summary: resume.summary, skills: resume.skills, template: resume.template,
    experiences: resume.experiences.map(({ id, company, title, startDate, endDate, description }) => ({ id, company, title, startDate, endDate, description })),
    education: resume.education.map(({ id, school, degree, field, year }) => ({ id, school, degree, field, year })),
    projects: resume.projects.map(({ id, name, description, link }) => ({ id, name, description, link })),
  }
}

function readTarget(value: unknown): ResumeTarget | null {
  if (!isRecord(value) || !isText(value.company, 200) || !isText(value.role, 200) || !isText(value.posting, MAX_POSTING_LENGTH)) return null
  const phrases = value.manualPhrases === undefined ? [] : value.manualPhrases
  if (!Array.isArray(phrases) || phrases.length > 20 || !phrases.every((phrase) => isText(phrase, 80) && phrase.trim())) return null
  return { company: value.company, role: value.role, posting: value.posting, manualPhrases: [...new Set(phrases.map((phrase: string) => phrase.trim()))] }
}

function readDocument(value: unknown): ResumeDocument | null {
  if (!isRecord(value) || !isText(value.id, 128) || !value.id.trim() || !isText(value.title, 120)
    || !isDate(value.createdAt) || !isDate(value.updatedAt)) return null
  const target = readTarget(value.target)
  const resume = readResume(value.resume)
  if (!target || !resume) return null
  return { id: value.id, title: value.title, target, resume, createdAt: value.createdAt, updatedAt: value.updatedAt }
}

export function serializeWorkspace(workspace: Workspace): string {
  return JSON.stringify(workspace)
}

export function saveWorkspace(workspace: Workspace, storage: WorkspaceStorage, expectedRaw: string | null): WorkspaceSave {
  try {
    const current = storage.getItem(WORKSPACE_STORAGE_KEY)
    const raw = serializeWorkspace(workspace)
    if (current !== expectedRaw && current !== raw) return { ok: false, reason: 'conflict' }
    storage.setItem(WORKSPACE_STORAGE_KEY, raw)
    return { ok: true, raw }
  } catch {
    return { ok: false, reason: 'storage' }
  }
}

export function recoverWorkspace(storage: WorkspaceStorage, source: SavedWorkspaceRecovery, backupDownloaded = false): WorkspaceRecovery {
  try {
    const changed = () => storage.getItem(WORKSPACE_STORAGE_KEY) !== source.workspaceRaw || storage.getItem(source.key) !== source.raw
    if (changed()) return { ok: false, reason: 'conflict' }
    try {
      storage.setItem(`draft.recovery.${crypto.randomUUID()}`, source.raw)
    } catch {
      if (!backupDownloaded) return { ok: false, reason: 'backup-required' }
    }
    if (changed()) return { ok: false, reason: 'conflict' }
    const workspace = createWorkspace()
    const raw = serializeWorkspace(workspace)
    storage.setItem(WORKSPACE_STORAGE_KEY, raw)
    return { ok: true, workspace, raw }
  } catch {
    return { ok: false, reason: 'storage' }
  }
}

function bounded(workspace: Workspace): WorkspaceResult {
  if (workspace.documents.length > MAX_DOCUMENTS) return fail(`Keep up to ${MAX_DOCUMENTS} resumes in this browser. Download a backup before removing any.`)
  if (byteLength(serializeWorkspace(workspace)) > MAX_BACKUP_BYTES) return fail('This workspace is larger than 5 MB. Shorten long text or download a backup before removing older versions.')
  return { ok: true, workspace }
}

export function parseWorkspace(raw: string): WorkspaceResult {
  if (byteLength(raw) > MAX_BACKUP_BYTES) return fail('Choose a Draft backup smaller than 5 MB.')
  let value: unknown
  try { value = JSON.parse(raw) } catch { return fail('This file is not a readable Draft backup.') }
  if (!isRecord(value) || value.version !== 2) return fail('This backup uses an unsupported format or version.')
  if (!isText(value.activeDocumentId, 128) || !Array.isArray(value.documents) || !value.documents.length || value.documents.length > MAX_DOCUMENTS) {
    return fail('The backup must contain between 1 and 50 resumes.')
  }
  const documents = value.documents.map(readDocument)
  if (documents.some((document) => document === null)) return fail('A resume in this backup has invalid fields. Your existing work has not changed.')
  const validDocuments = documents as ResumeDocument[]
  if (new Set(validDocuments.map(({ id }) => id)).size !== validDocuments.length || !validDocuments.some(({ id }) => id === value.activeDocumentId)) {
    return fail('The backup has duplicate or missing resume identifiers.')
  }
  return bounded({ version: 2, activeDocumentId: value.activeDocumentId, documents: validDocuments })
}

export function restoreWorkspace(raw: string | null, legacyRaw: string | null): { workspace: Workspace; source: 'saved' | 'migrated' | 'new' | 'unreadable'; message: string } {
  if (raw !== null) {
    const parsed = parseWorkspace(raw)
    return parsed.ok
      ? { workspace: parsed.workspace, source: 'saved', message: '' }
      : { workspace: createWorkspace(), source: 'unreadable', message: 'Your saved workspace could not be read and has not been replaced. Download the saved data below before starting a fresh workspace.' }
  }
  if (legacyRaw !== null) {
    const legacy = byteLength(legacyRaw) <= MAX_BACKUP_BYTES ? parseStoredResume(legacyRaw) : null
    const resume = legacy ? readResume(legacy) : null
    if (!resume) return { workspace: createWorkspace(), source: 'unreadable', message: 'Your saved draft could not be read and has not been replaced. Download the saved data below before starting a fresh workspace.' }
    const workspace = createWorkspace(resume)
    workspace.documents[0].title = 'My resume'
    if (!bounded(workspace).ok) return { workspace: createWorkspace(), source: 'unreadable', message: 'Your saved draft is too large to migrate and has not been replaced.' }
    return { workspace, source: 'migrated', message: '' }
  }
  return { workspace: createWorkspace(), source: 'new', message: '' }
}

export function updateWorkspaceDocument(workspace: Workspace, id: string, update: DocumentUpdate): WorkspaceResult {
  const document = workspace.documents.find((item) => item.id === id)
  if (!document) return fail('This resume is no longer available. Reload the workspace before continuing.')
  if (update.title !== undefined && !isText(update.title, 120)) return fail('Keep the resume title within 120 characters.')
  const target = readTarget({ ...document.target, ...update.target })
  if (!target) return fail('Use up to 30,000 characters for the posting, 200 for company or role, and 20 phrases of up to 80 characters.')
  const resume = update.resume === undefined ? document.resume : readResume(update.resume)
  if (!resume) return fail('This resume contains invalid fields or more than 100 entries in a section.')
  const next = { ...document, title: update.title ?? document.title, target, resume, updatedAt: new Date().toISOString() }
  return bounded({ ...workspace, documents: workspace.documents.map((item) => item.id === id ? next : item) })
}

export function selectWorkspaceDocument(workspace: Workspace, id: string): WorkspaceResult {
  if (!workspace.documents.some((document) => document.id === id)) return fail('This resume is no longer available. Reload the workspace before continuing.')
  return { ok: true, workspace: { ...workspace, activeDocumentId: id } }
}

export function addWorkspaceDocument(workspace: Workspace, sourceId?: string): WorkspaceResult {
  const source = sourceId ? workspace.documents.find((document) => document.id === sourceId) : undefined
  if (sourceId && !source) return fail('This resume is no longer available to duplicate.')
  const document = documentFromResume(source?.resume ?? emptyResume, source ? `${source.title || 'Untitled resume'} copy`.slice(0, 120) : 'Untitled resume')
  if (source) document.target = structuredClone(source.target)
  return bounded({ ...workspace, activeDocumentId: document.id, documents: [...workspace.documents, document] })
}

export function removeWorkspaceDocument(workspace: Workspace, id: string): WorkspaceResult {
  if (!workspace.documents.some((document) => document.id === id)) return fail('This resume is no longer available to remove.')
  const remaining = workspace.documents.filter((document) => document.id !== id)
  if (!remaining.length) return { ok: true, workspace: createWorkspace() }
  return { ok: true, workspace: { ...workspace, activeDocumentId: workspace.activeDocumentId === id ? remaining[0].id : workspace.activeDocumentId, documents: remaining } }
}

export function importWorkspace(workspace: Workspace, raw: string): WorkspaceResult {
  const parsed = parseWorkspace(raw)
  if (!parsed.ok) return parsed
  const imported = parsed.workspace.documents.map((document) => {
    const copy = documentFromResume(document.resume, document.title)
    copy.target = structuredClone(document.target)
    return copy
  })
  const activeIndex = parsed.workspace.documents.findIndex((document) => document.id === parsed.workspace.activeDocumentId)
  return bounded({ ...workspace, activeDocumentId: imported[activeIndex].id, documents: [...workspace.documents, ...imported] })
}
