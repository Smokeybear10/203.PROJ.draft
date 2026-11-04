import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyResume, serializeResume } from './resume.ts'
import {
  addWorkspaceDocument, createWorkspace, importWorkspace, MAX_BACKUP_BYTES, MAX_DOCUMENTS,
  parseWorkspace, recoverWorkspace, removeWorkspaceDocument, restoreWorkspace, saveWorkspace, selectWorkspaceDocument,
  serializeWorkspace, updateWorkspaceDocument, WORKSPACE_STORAGE_KEY,
} from './workspace.ts'

function unwrap(result) {
  assert.equal(result.ok, true, result.message)
  return result.workspace
}

function filledWorkspace() {
  const workspace = createWorkspace({ ...emptyResume, name: 'Zoë Nguyễn', email: 'zoe@example.com', summary: 'Built useful software.\nMade it accessible.' })
  return unwrap(updateWorkspaceDocument(workspace, workspace.activeDocumentId, {
    title: 'Frontend application', target: { company: 'Example', role: 'Frontend Engineer', posting: 'Build React and TypeScript interfaces.', manualPhrases: ['accessibility'] },
  }))
}

test('workspace backup round-trips resume content, target posting, phrases and selected version', () => {
  let workspace = filledWorkspace()
  workspace = unwrap(addWorkspaceDocument(workspace, workspace.activeDocumentId))
  assert.deepEqual(unwrap(parseWorkspace(serializeWorkspace(workspace))), workspace)
  assert.equal(workspace.documents.length, 2)
  assert.equal(workspace.documents[1].target.manualPhrases[0], 'accessibility')
})

test('editing a duplicate does not change its base resume or job target', () => {
  const base = filledWorkspace()
  const original = structuredClone(base.documents[0])
  let workspace = unwrap(addWorkspaceDocument(base, base.activeDocumentId))
  const copy = workspace.documents[1]
  assert.notEqual(copy.id, original.id)
  assert.notEqual(copy.resume, base.documents[0].resume)
  assert.notEqual(copy.target.manualPhrases, base.documents[0].target.manualPhrases)
  workspace = unwrap(updateWorkspaceDocument(workspace, copy.id, { resume: { ...copy.resume, summary: 'Changed for this job.' }, target: { company: 'Another company' } }))
  assert.deepEqual(workspace.documents[0], original)
  assert.equal(workspace.documents[1].target.posting, original.target.posting)
  assert.equal(workspace.documents[1].target.company, 'Another company')
})

test('legacy draft migration preserves every field and newer saved work takes precedence', () => {
  const legacyResume = filledWorkspace().documents[0].resume
  const legacyRaw = serializeResume(legacyResume)
  const migrated = restoreWorkspace(null, legacyRaw)
  assert.equal(migrated.source, 'migrated')
  assert.equal(migrated.workspace.documents[0].title, 'My resume')
  assert.deepEqual(migrated.workspace.documents[0].resume, legacyResume)
  assert.equal(legacyRaw, serializeResume(legacyResume))
  const current = filledWorkspace()
  const restored = restoreWorkspace(serializeWorkspace(current), '{broken legacy')
  assert.equal(restored.source, 'saved')
  assert.deepEqual(restored.workspace, current)
})

test('invalid saved workspace does not silently fall back to an older resume', () => {
  const legacy = serializeResume({ ...emptyResume, name: 'Old content' })
  const restored = restoreWorkspace('{broken current', legacy)
  assert.equal(restored.source, 'unreadable')
  assert.match(restored.message, /not been replaced/)
  assert.equal(restored.workspace.documents[0].resume.name, '')
  assert.equal(restoreWorkspace(null, '{broken legacy').source, 'unreadable')
})

test('import adds independent copies even when source identifiers match existing resumes', () => {
  const existing = filledWorkspace()
  const before = structuredClone(existing)
  const imported = unwrap(importWorkspace(existing, serializeWorkspace(existing)))
  assert.equal(imported.documents.length, 2)
  assert.deepEqual(imported.documents[0], before.documents[0])
  assert.notEqual(imported.documents[1].id, existing.activeDocumentId)
  assert.equal(imported.activeDocumentId, imported.documents[1].id)
  imported.documents[1].target.manualPhrases.push('testing')
  imported.documents[1].resume.education[0].school = 'New school'
  assert.deepEqual(existing, before)
  assert.deepEqual(imported.documents[0], before.documents[0])
})

test('document transitions retain a valid selection and never mutate the input snapshot', () => {
  const initial = filledWorkspace()
  const before = structuredClone(initial)
  const second = unwrap(addWorkspaceDocument(initial))
  const selected = unwrap(selectWorkspaceDocument(second, initial.activeDocumentId))
  assert.equal(selected.activeDocumentId, initial.activeDocumentId)
  const removed = unwrap(removeWorkspaceDocument(selected, initial.activeDocumentId))
  assert.equal(removed.documents.length, 1)
  assert.equal(removed.activeDocumentId, second.documents[1].id)
  const lastRemoved = unwrap(removeWorkspaceDocument(initial, initial.activeDocumentId))
  assert.equal(lastRemoved.documents.length, 1)
  assert.equal(lastRemoved.documents[0].resume.name, '')
  assert.notEqual(lastRemoved.activeDocumentId, initial.activeDocumentId)
  assert.deepEqual(initial, before)
  assert.equal(selectWorkspaceDocument(initial, 'missing').ok, false)
  assert.equal(removeWorkspaceDocument(initial, 'missing').ok, false)
})

test('backup validation rejects invalid versions, duplicate ids, missing selection and malformed nested fields', () => {
  const valid = filledWorkspace()
  for (const value of [
    { ...valid, version: 3 },
    { ...valid, documents: [] },
    { ...valid, activeDocumentId: 'missing' },
    { ...valid, documents: [valid.documents[0], valid.documents[0]] },
    { ...valid, documents: [{ ...valid.documents[0], target: { ...valid.documents[0].target, manualPhrases: null } }] },
    { ...valid, documents: [{ ...valid.documents[0], resume: { ...valid.documents[0].resume, experiences: [null] } }] },
    { ...valid, documents: [{ ...valid.documents[0], updatedAt: 'not a date' }] },
  ]) assert.equal(parseWorkspace(JSON.stringify(value)).ok, false)
  for (const raw of ['', '{', 'null', '[]']) assert.equal(parseWorkspace(raw).ok, false)
})

test('limits reject oversize backups, excessive documents, long postings and excessive phrases without partial imports', () => {
  assert.equal(parseWorkspace(' '.repeat(MAX_BACKUP_BYTES + 1)).ok, false)
  let full = createWorkspace()
  for (let i = 1; i < MAX_DOCUMENTS; i++) full = unwrap(addWorkspaceDocument(full))
  const before = serializeWorkspace(full)
  assert.equal(addWorkspaceDocument(full).ok, false)
  assert.equal(importWorkspace(full, serializeWorkspace(createWorkspace())).ok, false)
  assert.equal(serializeWorkspace(full), before)
  for (const target of [{ posting: 'x'.repeat(30_001) }, { manualPhrases: Array(21).fill('React') }, { manualPhrases: ['x'.repeat(81)] }, { company: 'x'.repeat(201) }]) {
    assert.equal(updateWorkspaceDocument(full, full.activeDocumentId, { target }).ok, false)
  }
})

test('a stale save cannot overwrite a newer tab, while an identical write is harmless', () => {
  const original = filledWorkspace()
  const expected = serializeWorkspace(original)
  const newer = unwrap(updateWorkspaceDocument(original, original.activeDocumentId, { title: 'Newer tab' }))
  let raw = serializeWorkspace(newer)
  let writes = 0
  const storage = { getItem: () => raw, setItem: (_key, value) => { writes++; raw = value } }
  assert.deepEqual(saveWorkspace(original, storage, expected), { ok: false, reason: 'conflict' })
  assert.equal(writes, 0)
  assert.equal(raw, serializeWorkspace(newer))
  assert.equal(saveWorkspace(newer, storage, expected).ok, true)
  assert.equal(writes, 1)
})

test('failed storage writes preserve the last saved document and migration source', () => {
  const workspace = filledWorkspace()
  const before = serializeWorkspace(workspace)
  const changed = unwrap(addWorkspaceDocument(workspace))
  const data = new Map([[WORKSPACE_STORAGE_KEY, before], ['draft.resume.v1', serializeResume(workspace.documents[0].resume)]])
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: () => { throw new Error('QuotaExceededError') } }
  assert.deepEqual(saveWorkspace(changed, storage, before), { ok: false, reason: 'storage' })
  assert.equal(data.get(WORKSPACE_STORAGE_KEY), before)
  assert(data.has('draft.resume.v1'))
  assert.equal(saveWorkspace(changed, { getItem: () => { throw new Error('SecurityError') }, setItem: () => {} }, before).ok, false)
})

test('recovery preserves exact unreadable data before creating a valid fresh workspace', () => {
  const raw = ' {"version":2, broken Unicode Zoë\n'
  const data = new Map([[WORKSPACE_STORAGE_KEY, raw]])
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  const recovered = recoverWorkspace(storage, { key: WORKSPACE_STORAGE_KEY, raw, workspaceRaw: raw })
  assert.equal(recovered.ok, true)
  assert.equal(recovered.workspace.documents[0].resume.name, '')
  assert.equal(parseWorkspace(data.get(WORKSPACE_STORAGE_KEY)).ok, true)
  const archive = [...data.entries()].find(([key]) => key.startsWith('draft.recovery.'))
  assert.equal(archive[1], raw)
})

test('recovery refuses to overwrite changes made before or during the recovery attempt', () => {
  for (const when of ['before', 'during']) {
    const raw = '{broken'
    const newer = serializeWorkspace(filledWorkspace())
    const data = new Map([[WORKSPACE_STORAGE_KEY, when === 'before' ? newer : raw]])
    const storage = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value)
        if (key.startsWith('draft.recovery.')) data.set(WORKSPACE_STORAGE_KEY, newer)
      },
    }
    assert.deepEqual(recoverWorkspace(storage, { key: WORKSPACE_STORAGE_KEY, raw, workspaceRaw: raw }, true), { ok: false, reason: 'conflict' })
    assert.equal(data.get(WORKSPACE_STORAGE_KEY), newer)
  }
})

test('recovery requires a downloaded copy when local archiving fails', () => {
  const raw = '{broken'
  let saved = raw
  const storage = {
    getItem: (key) => key === WORKSPACE_STORAGE_KEY ? saved : null,
    setItem: (key, value) => {
      if (key.startsWith('draft.recovery.')) throw new Error('QuotaExceededError')
      saved = value
    },
  }
  const source = { key: WORKSPACE_STORAGE_KEY, raw, workspaceRaw: raw }
  assert.deepEqual(recoverWorkspace(storage, source), { ok: false, reason: 'backup-required' })
  assert.equal(saved, raw)
  assert.equal(recoverWorkspace(storage, source, true).ok, true)
  assert.equal(parseWorkspace(saved).ok, true)
})

test('legacy recovery checks the source as well as the new workspace slot', () => {
  const raw = '{old broken'
  const key = 'draft.resume.v1'
  const data = new Map([[key, raw]])
  const storage = { getItem: (name) => data.get(name) ?? null, setItem: (name, value) => data.set(name, value) }
  const source = { key, raw, workspaceRaw: null }
  data.set(key, 'changed in another tab')
  assert.deepEqual(recoverWorkspace(storage, source, true), { ok: false, reason: 'conflict' })
  assert.equal(data.has(WORKSPACE_STORAGE_KEY), false)
  data.set(key, raw)
  assert.equal(recoverWorkspace(storage, source).ok, true)
  assert.equal(data.get(key), raw)
})
