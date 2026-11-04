'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DRAFT_STORAGE_KEY, type Resume } from './resume.ts'
import {
  addWorkspaceDocument, importWorkspace, initialWorkspace, MAX_BACKUP_BYTES,
  recoverWorkspace, removeWorkspaceDocument, restoreWorkspace, saveWorkspace, selectWorkspaceDocument, serializeWorkspace,
  updateWorkspaceDocument, WORKSPACE_STORAGE_KEY,
  type DocumentUpdate, type SavedWorkspaceRecovery, type Workspace, type WorkspaceResult,
} from './workspace.ts'

export type WorkspaceAction = { ok: true; documentId?: string; count?: number } | { ok: false; message: string }
type WorkspaceState = {
  workspace: Workspace
  ready: boolean
  status: 'loading' | 'saving' | 'saved' | 'error'
  message: string
  error: string
  canRecover: boolean
}
type Checkpoint = { workspace: Workspace; message: string }

const conflictMessage = 'This workspace changed in another tab. Your work here is still on screen. Download a backup before reloading.'
const saveMessage = 'Your latest changes could not be saved in this browser. Download a backup before leaving. Switching resumes is paused to protect your work.'

function downloadJson(raw: string, filename: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>({ workspace: initialWorkspace, ready: false, status: 'loading', message: '', error: '', canRecover: false })
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
  const latest = useRef(initialWorkspace)
  const savedRaw = useRef<string | null>(null)
  const ready = useRef(false)
  const mounted = useRef(false)
  const lock = useRef<'conflict' | 'unreadable' | 'unavailable' | null>(null)
  const recovery = useRef<SavedWorkspaceRecovery | null>(null)
  const downloadedRecovery = useRef<string | null>(null)

  const persist = useCallback((workspace: Workspace): WorkspaceAction => {
    if (!ready.current) return { ok: false, message: 'Your saved resumes are still loading.' }
    if (lock.current) return { ok: false, message: lock.current === 'conflict' ? conflictMessage : 'Saved work is protected. Download a backup of your work here before reloading.' }
    try {
      const result = saveWorkspace(workspace, localStorage, savedRaw.current)
      if (!result.ok) {
        if (result.reason === 'conflict') lock.current = 'conflict'
        const message = result.reason === 'conflict' ? conflictMessage : saveMessage
        if (mounted.current) setState((value) => ({ ...value, status: 'error', message, canRecover: result.reason === 'conflict' ? false : value.canRecover }))
        return { ok: false, message }
      }
      savedRaw.current = result.raw
      if (mounted.current) setState((value) => ({ ...value, status: 'saved', message: '' }))
      return { ok: true }
    } catch {
      if (mounted.current) setState((value) => ({ ...value, status: 'error', message: saveMessage }))
      return { ok: false, message: saveMessage }
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    let restored = initialWorkspace
    let message = ''
    lock.current = null
    recovery.current = null
    downloadedRecovery.current = null
    try {
      const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY)
      savedRaw.current = raw
      const legacyRaw = raw === null ? localStorage.getItem(DRAFT_STORAGE_KEY) : null
      const loaded = restoreWorkspace(raw, legacyRaw)
      restored = loaded.workspace
      message = loaded.message
      if (loaded.source === 'unreadable') {
        lock.current = 'unreadable'
        recovery.current = raw !== null
          ? { key: WORKSPACE_STORAGE_KEY, raw, workspaceRaw: raw }
          : legacyRaw !== null ? { key: DRAFT_STORAGE_KEY, raw: legacyRaw, workspaceRaw: null } : null
      }
    } catch {
      restored = structuredClone(initialWorkspace)
      lock.current = 'unavailable'
      message = 'This browser is not allowing saved resumes. You can work in this tab and download a backup before leaving.'
    }
    latest.current = restored
    ready.current = true
    // Restore browser storage only after the matching server and client render.
    setState({ workspace: restored, ready: true, status: message ? 'error' : 'saving', message, error: '', canRecover: lock.current === 'unreadable' && recovery.current !== null })

    const flush = () => { if (!lock.current) persist(latest.current) }
    const visibility = () => { if (document.visibilityState === 'hidden') flush() }
    const storage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== null && event.key !== WORKSPACE_STORAGE_KEY)) return
      if (event.newValue === savedRaw.current) return
      if (event.newValue === serializeWorkspace(latest.current)) {
        savedRaw.current = event.newValue
        return
      }
      lock.current = 'conflict'
      setState((value) => ({ ...value, status: 'error', message: conflictMessage, canRecover: false }))
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('storage', storage)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false
      flush()
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('storage', storage)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [persist])

  useEffect(() => {
    if (!state.ready || lock.current) return
    const timer = window.setTimeout(() => persist(latest.current), 350)
    return () => window.clearTimeout(timer)
  }, [state.workspace, state.ready, persist])

  const reject = (message: string): WorkspaceAction => {
    setState((value) => ({ ...value, error: message }))
    return { ok: false, message }
  }

  const apply = (result: WorkspaceResult, options: { immediate?: boolean; undoMessage?: string } = {}): WorkspaceAction => {
    if (!ready.current || !mounted.current) return reject('Your saved resumes are still loading.')
    if (!result.ok) return reject(result.message)
    const previous = latest.current
    if (options.immediate) {
      const saved = persist(result.workspace)
      if (!saved.ok) return reject(saved.message)
    }
    latest.current = result.workspace
    setCheckpoint(options.undoMessage ? { workspace: previous, message: options.undoMessage } : null)
    setState((value) => ({
      ...value, workspace: result.workspace,
      status: lock.current ? 'error' : options.immediate ? 'saved' : 'saving',
      message: options.immediate ? '' : value.message, error: '',
    }))
    return { ok: true, documentId: result.workspace.activeDocumentId }
  }

  const updateResume = (update: (resume: Resume) => Resume, options: { undoMessage?: string } = {}): WorkspaceAction => {
    const workspace = latest.current
    const active = workspace.documents.find((document) => document.id === workspace.activeDocumentId)
    if (!active) return reject('This resume is no longer available.')
    const resume = update(structuredClone(active.resume))
    return apply(updateWorkspaceDocument(workspace, active.id, { resume }), options)
  }

  const updateDocument = (update: Omit<DocumentUpdate, 'resume'>): WorkspaceAction => apply(updateWorkspaceDocument(latest.current, latest.current.activeDocumentId, update))
  const selectDocument = (id: string): WorkspaceAction => {
    if (id === latest.current.activeDocumentId) return { ok: true, documentId: id }
    return apply(selectWorkspaceDocument(latest.current, id), { immediate: true })
  }
  const newDocument = (): WorkspaceAction => apply(addWorkspaceDocument(latest.current), { immediate: true })
  const duplicateDocument = (): WorkspaceAction => apply(addWorkspaceDocument(latest.current, latest.current.activeDocumentId), { immediate: true })
  const removeDocument = (id: string): WorkspaceAction => apply(removeWorkspaceDocument(latest.current, id), { immediate: true, undoMessage: 'Resume removed.' })

  const undo = (): WorkspaceAction => {
    if (!checkpoint) return { ok: false, message: 'There is no change to undo.' }
    const workspace = checkpoint.workspace
    if (!lock.current) {
      const saved = persist(workspace)
      if (!saved.ok && lock.current !== 'conflict') return reject(saved.message)
    }
    latest.current = workspace
    setCheckpoint(null)
    setState((value) => ({ ...value, workspace, status: lock.current ? 'error' : 'saved', error: '' }))
    return { ok: true, documentId: workspace.activeDocumentId }
  }

  const exportBackup = (): WorkspaceAction => {
    if (!ready.current) return reject('Your saved resumes are still loading.')
    downloadJson(serializeWorkspace(latest.current), `draft-backup-${new Date().toISOString().slice(0, 10)}.draft.json`)
    setState((value) => ({ ...value, error: '' }))
    return { ok: true }
  }

  const downloadSavedData = (): WorkspaceAction => {
    if (lock.current !== 'unreadable' || !recovery.current) return reject('There is no unreadable saved data to download.')
    downloadJson(recovery.current.raw, `draft-saved-data-${new Date().toISOString().slice(0, 10)}.json`)
    downloadedRecovery.current = recovery.current.raw
    setState((value) => ({ ...value, error: '' }))
    return { ok: true }
  }

  const resetWorkspace = (options: { backupDownloaded?: boolean } = {}): WorkspaceAction => {
    if (lock.current !== 'unreadable' || !recovery.current) return reject('This workspace does not need recovery. Reload before continuing.')
    let result
    try {
      result = recoverWorkspace(localStorage, recovery.current, options.backupDownloaded === true && downloadedRecovery.current === recovery.current.raw)
    } catch {
      return reject('This browser is not allowing recovery. Keep your downloaded saved data and try again when browser storage is available.')
    }
    if (!result.ok) {
      if (result.reason === 'conflict') {
        lock.current = 'conflict'
        setState((value) => ({ ...value, status: 'error', message: conflictMessage, canRecover: false }))
        return reject(conflictMessage)
      }
      return reject(result.reason === 'backup-required'
        ? 'There is not enough browser storage to preserve the original. Download the saved data first, then confirm the fresh workspace.'
        : 'The fresh workspace could not be saved. The original saved data has not been replaced. Keep your download and free browser storage before trying again.')
    }
    const previous = latest.current
    latest.current = result.workspace
    savedRaw.current = result.raw
    lock.current = null
    recovery.current = null
    downloadedRecovery.current = null
    setCheckpoint({ workspace: previous, message: 'Workspace restarted. Undo restores the work that was on screen.' })
    setState({ workspace: result.workspace, ready: true, status: 'saved', message: '', error: '', canRecover: false })
    return { ok: true, documentId: result.workspace.activeDocumentId }
  }

  const importBackup = async (file: File): Promise<WorkspaceAction> => {
    if (!file.size || file.size > MAX_BACKUP_BYTES) return reject('Choose a nonempty Draft backup smaller than 5 MB.')
    let raw: string
    try { raw = await file.text() } catch { return reject('The backup could not be read. Choose the file again.') }
    if (!mounted.current) return { ok: false, message: 'The workspace was closed before the import finished.' }
    const before = latest.current.documents.length
    const result = apply(importWorkspace(latest.current, raw), { immediate: true, undoMessage: 'Backup imported as new resumes.' })
    return result.ok ? { ...result, count: latest.current.documents.length - before } : result
  }

  const activeDocument = state.workspace.documents.find((document) => document.id === state.workspace.activeDocumentId) ?? state.workspace.documents[0]
  return {
    ...state, activeDocument, updateResume, updateDocument, selectDocument, newDocument, duplicateDocument,
    removeDocument, undo, canUndo: checkpoint !== null, undoMessage: checkpoint?.message ?? null,
    exportBackup, importBackup, downloadSavedData, resetWorkspace,
  }
}
