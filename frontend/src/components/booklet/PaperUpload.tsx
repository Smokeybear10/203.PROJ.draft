'use client'

import { useState, useRef, useId } from 'react'

type Props = { onFileSelect: (file: File | null) => void; accept?: string; disabled?: boolean }

export default function PaperUpload({ onFileSelect, accept = '.pdf,.docx', disabled = false }: Props) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()

  const handleFile = (file: File) => {
    if (disabled) return
    const issue = !/\.(pdf|docx)$/i.test(file.name) ? 'Choose a PDF or DOCX file.'
      : file.size === 0 ? 'This file is empty. Choose a resume with text in it.'
      : file.size > 4 * 1024 * 1024 ? 'Choose a file smaller than 4 MB.' : ''
    if (issue) {
      setError(issue)
      setFileName(null)
      onFileSelect(null)
      return
    }
    setError('')
    setFileName(file.name)
    onFileSelect(file)
  }

  return (
    <div>
      <div
        onDrop={(event) => { event.preventDefault(); setIsDragging(false); if (disabled) return; const file = event.dataTransfer.files[0]; if (file) handleFile(file) }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; if (!disabled) setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => { if (!disabled) inputRef.current?.click() }}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!disabled) inputRef.current?.click() } }}
        role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
        aria-label={fileName ? `${fileName}. Choose a different resume` : 'Choose a resume, PDF or DOCX'}
        aria-describedby={error ? errorId : undefined}
        className={`exam-upload ${isDragging && !disabled ? 'dragging' : ''} ${fileName ? 'has-file' : ''}`}
      >
        <input ref={inputRef} type="file" accept={accept} disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); event.target.value = '' }} hidden aria-hidden="true" tabIndex={-1} />
        <svg className="exam-upload-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" /></svg>
        <div><p className="upload-title">{fileName ?? 'Choose a resume or drop it here'}</p><p className="upload-hint">{fileName ? 'Click to choose a different file' : 'PDF or DOCX, up to 4 MB'}</p></div>
      </div>
      {fileName && <button type="button" className="analysis-text-button" disabled={disabled} onClick={() => { if (disabled) return; setFileName(null); setError(''); onFileSelect(null) }}>Remove file</button>}
      {error && <p id={errorId} role="alert" className="upload-error">{error}</p>}
    </div>
  )
}
