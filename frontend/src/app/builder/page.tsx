'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import ExamButton from '@/components/booklet/ExamButton'
import ExamInput from '@/components/booklet/ExamInput'
import { emptyResume, resumeExportError, TEMPLATES, type Education, type Experience, type Project, type Resume, type Template } from './resume'
import { useWorkspace } from './useWorkspace'
import JobReview from './JobReview'
import './builder.css'

const SECTIONS = ['Job', 'Contact', 'Experience', 'Education', 'Projects', 'Skills'] as const
type Section = typeof SECTIONS[number]
const templateDescriptions: Record<Template, string> = {
  Modern: 'Clear headings with a blue accent', Classic: 'Serif type with a centered heading',
  Minimal: 'Compact and understated', Technical: 'Monospace section headings',
  Executive: 'Serif type with more space between sections',
}

function Description({ text }: { text: string }) {
  const lines = text.split('\n').map((line) => line.trim().replace(/^[-•]\s*/, '')).filter(Boolean)
  if (!lines.length) return null
  return <ul role="list">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
}

export default function BuilderPage() {
  const workspace = useWorkspace()
  const { activeDocument, ready } = workspace
  const { resume, target } = activeDocument
  const [activeSection, setActiveSection] = useState<Section>('Contact')
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
  const [panelView, setPanelView] = useState<'preview' | 'review'>('preview')
  const [exportError, setExportError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [importing, setImporting] = useState(false)
  const busy = downloading || importing
  const [downloaded, setDownloaded] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRecovery, setConfirmRecovery] = useState(false)
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false)
  const backupInput = useRef<HTMLInputElement>(null)
  const { name, email, phone, location, website, summary, skills, template, experiences, education, projects } = resume

  const resetTransient = () => {
    setConfirmClear(false)
    setConfirmDelete(false)
    setDownloaded('')
    setExportError('')
  }

  const updateResume = (update: (current: Resume) => Resume, undoMessage?: string) => {
    resetTransient()
    workspace.updateResume(update, undoMessage ? { undoMessage } : undefined)
  }

  const updateDocument = (update: Parameters<typeof workspace.updateDocument>[0]) => {
    resetTransient()
    workspace.updateDocument(update)
  }

  const navigateToEvidence = (section: Exclude<Section, 'Job'>, entryId?: string, field?: string) => {
    setActiveSection(section)
    setMobileView('edit')
    const fieldId = entryId ? `resume-entry-${entryId}-${field ?? 'description'}` : `resume-${field ?? (section === 'Skills' ? 'skills' : 'summary')}`
    requestAnimationFrame(() => (document.getElementById(fieldId) ?? document.getElementById('builder-section'))?.focus())
  }

  const selectDocument = (id: string) => {
    if (!workspace.selectDocument(id).ok) return
    resetTransient()
    setActiveSection('Contact')
    setMobileView('edit')
    setPanelView('preview')
  }

  const createDocument = (copy: boolean) => {
    const result = copy ? workspace.duplicateDocument() : workspace.newDocument()
    if (!result.ok) return
    resetTransient()
    setActiveSection(copy ? 'Job' : 'Contact')
    setMobileView('edit')
    setPanelView(copy ? 'review' : 'preview')
    requestAnimationFrame(() => document.getElementById(copy ? 'document-title' : 'resume-name')?.focus())
  }

  const updateField = (field: 'name' | 'email' | 'phone' | 'location' | 'website' | 'summary' | 'skills', value: string) => updateResume((current) => ({ ...current, [field]: value }))
  const upExp = (id: string, field: keyof Experience, value: string) => updateResume((current) => ({ ...current, experiences: current.experiences.map((entry) => entry.id === id ? { ...entry, [field]: value } : entry) }))
  const upEdu = (id: string, field: keyof Education, value: string) => updateResume((current) => ({ ...current, education: current.education.map((entry) => entry.id === id ? { ...entry, [field]: value } : entry) }))
  const upProj = (id: string, field: keyof Project, value: string) => updateResume((current) => ({ ...current, projects: current.projects.map((entry) => entry.id === id ? { ...entry, [field]: value } : entry) }))

  const removeEntry = (section: 'experiences' | 'education' | 'projects', id: string) => {
    updateResume((current) => ({ ...current, [section]: current[section].filter((entry) => entry.id !== id) }), 'Entry removed.')
  }

  const clearDraft = () => {
    updateResume(() => structuredClone(emptyResume), 'Resume cleared.')
    setActiveSection('Contact')
    setMobileView('edit')
  }

  const validateExport = () => {
    const invalid = resumeExportError(resume)
    if (!invalid) return true
    setExportError(invalid.message)
    setActiveSection(invalid.field === 'project' ? 'Projects' : 'Contact')
    setMobileView('edit')
    const fieldId = invalid.projectId ? `resume-project-${invalid.projectId}` : `resume-${invalid.field}`
    requestAnimationFrame(() => document.getElementById(fieldId)?.focus())
    return false
  }

  const downloadPdf = async () => {
    if (busy || !validateExport()) return
    setDownloading(true)
    setExportError('')
    setDownloaded('')
    try {
      const { downloadResumePdf } = await import('./pdf')
      await downloadResumePdf(resume, activeDocument.title)
      setDownloaded(activeDocument.title)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The PDF couldn’t be created. Your draft is still here; please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = SECTIONS.indexOf(activeSection)
    const next = event.key === 'ArrowRight' ? (index + 1) % SECTIONS.length : event.key === 'ArrowLeft' ? (index + SECTIONS.length - 1) % SECTIONS.length : event.key === 'Home' ? 0 : event.key === 'End' ? SECTIONS.length - 1 : null
    if (next === null) return
    event.preventDefault()
    setActiveSection(SECTIONS[next])
    document.getElementById(`section-${SECTIONS[next]}`)?.focus()
  }

  const filledExperiences = experiences.filter((entry) => [entry.company, entry.title, entry.description].some((value) => value.trim()))
  const filledEducation = education.filter((entry) => [entry.school, entry.degree, entry.field].some((value) => value.trim()))
  const filledProjects = projects.filter((entry) => [entry.name, entry.description, entry.link].some((value) => value.trim()))
  const contacts = [email.trim(), phone.trim(), location.trim(), website.trim()].filter(Boolean)
  const hasContent = Boolean(summary.trim() || skills.trim() || filledExperiences.length || filledEducation.length || filledProjects.length)
  const saveLabel = !ready ? 'Loading resumes…' : workspace.status === 'saving' ? 'Saving…' : workspace.status === 'error' ? 'Not saved' : 'Saved in this browser'

  return (
    <div className="resume-builder builder-workspace" aria-busy={!ready}>
      <header className="builder-top">
        <div><h1>Your resumes</h1><p>Keep your experience together. Make a version for each application.</p></div>
        <div className="builder-top-actions">
          <span className="builder-save-status" role="status">{saveLabel}</span>
          <ExamButton onClick={() => void downloadPdf()} variant="filled" disabled={!ready || busy}>{downloading ? 'Preparing PDF…' : 'Download PDF'}</ExamButton>
        </div>
      </header>
      {workspace.message && <p className="builder-notice" role="status">{workspace.message}</p>}
      {workspace.canRecover && <div className="workspace-recovery">
        <p>Save a copy of the unreadable data before starting again.</p>
        <button type="button" className="btn-exam-outline" onClick={() => { if (workspace.downloadSavedData().ok) setRecoveryDownloaded(true) }}>Download saved data</button>
        <button type="button" className="workspace-text-button" disabled={busy || !recoveryDownloaded} onClick={() => setConfirmRecovery(true)}>Start a fresh workspace</button>
        {confirmRecovery && <div role="group" aria-label="Replace unreadable workspace">
          <p>This replaces the saved workspace with an empty one. Keep the downloaded file for recovery.</p>
          <button type="button" className="btn-exam-outline" disabled={busy} onClick={() => { if (workspace.resetWorkspace({ backupDownloaded: recoveryDownloaded }).ok) { setConfirmRecovery(false); setRecoveryDownloaded(false); resetTransient() } }}>Confirm start fresh</button>
          <button type="button" className="workspace-text-button" onClick={() => setConfirmRecovery(false)}>Keep saved data</button>
        </div>}
      </div>}
      {importing && <p className="builder-download-message" role="status">Importing your backup…</p>}
      {workspace.error && <p className="builder-notice builder-error" role="alert">{workspace.error}</p>}
      {exportError && <p className="builder-notice builder-error" role="alert">{exportError}</p>}
      {downloaded && <p className="builder-download-message" role="status">Downloaded {downloaded}. Check your downloads.</p>}
      {workspace.canUndo && <div className="builder-undo" role="status"><span>{workspace.undoMessage}</span><button type="button" disabled={busy} onClick={() => workspace.undo()}>Undo</button></div>}
      <div className="workspace-toolbar">
        <div className="workspace-document-select">
          <label htmlFor="active-resume">Working on</label>
          <select id="active-resume" value={activeDocument.id} onChange={(event) => selectDocument(event.target.value)} disabled={!ready || busy}>
            {workspace.workspace.documents.map((document) => <option key={document.id} value={document.id}>{document.title.trim() || 'Untitled resume'}</option>)}
          </select>
        </div>
        <div className="workspace-document-actions">
          <button type="button" onClick={() => createDocument(true)} disabled={!ready || busy}>Make a copy</button>
          <button type="button" onClick={() => createDocument(false)} disabled={!ready || busy}>New resume</button>
          <details className="workspace-tools" onClick={(event) => { if (event.target instanceof HTMLButtonElement) event.currentTarget.open = false }}>
            <summary>Manage</summary>
            <div className="workspace-tools-menu">
              <button type="button" disabled={!ready || busy} onClick={() => { setActiveSection('Job'); setMobileView('edit'); requestAnimationFrame(() => document.getElementById('document-title')?.focus()) }}>Rename this version</button>
              <button type="button" disabled={!ready || busy} onClick={() => workspace.exportBackup()}>Download editable backup</button>
              <button type="button" disabled={!ready || busy} onClick={() => backupInput.current?.click()}>Import editable backup</button>
              <button type="button" disabled={!ready || busy} onClick={() => setConfirmDelete(true)}>Delete this version</button>
            </div>
          </details>
          <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file || busy) return
            setImporting(true)
            try {
              if ((await workspace.importBackup(file)).ok) { resetTransient(); setActiveSection('Contact'); setMobileView('edit'); setPanelView('preview') }
            } finally { setImporting(false) }
          }} />
        </div>
      </div>
      {confirmDelete && <div className="workspace-delete-confirmation" role="group" aria-label="Delete this version">
        <p>Delete “{activeDocument.title}”? Other resumes will stay as they are.</p>
        <button type="button" className="btn-exam-outline" disabled={busy} onClick={() => { if (workspace.removeDocument(activeDocument.id).ok) resetTransient() }}>Confirm delete version</button>
        <button type="button" className="workspace-text-button" onClick={() => setConfirmDelete(false)}>Keep version</button>
      </div>}
      <div className="builder-mobile-mode" role="group" aria-label="Builder view">
        <button type="button" aria-pressed={mobileView === 'edit'} onClick={() => setMobileView('edit')}>Edit</button>
        <button type="button" aria-pressed={mobileView === 'preview' && panelView === 'preview'} onClick={() => { setMobileView('preview'); setPanelView('preview') }}>Preview</button>
        <button type="button" aria-pressed={mobileView === 'preview' && panelView === 'review'} onClick={() => { setMobileView('preview'); setPanelView('review') }}>Job review</button>
      </div>
      <div className="builder-grid" data-mobile-view={mobileView}>
        <div className="builder-editor">
          <div className="builder-section-tabs" role="tablist" aria-label="Resume sections">
            {SECTIONS.map((section) => <button key={section} id={`section-${section}`} type="button" role="tab" aria-selected={activeSection === section} aria-controls="builder-section" tabIndex={activeSection === section ? 0 : -1} onKeyDown={onTabKeyDown} onClick={() => setActiveSection(section)}>{section}</button>)}
          </div>
          <div id="builder-section" role="tabpanel" aria-labelledby={`section-${activeSection}`} tabIndex={0}>
            <form onSubmit={(event) => { event.preventDefault(); void downloadPdf() }} noValidate>
              <fieldset className="builder-form-fields" disabled={!ready || busy}>
                <legend className="sr-only">{activeSection}</legend>
                {activeSection === 'Job' && <>
                  <div className="builder-section-heading"><h2>This application</h2><p>Paste the actual posting to compare it with your experience and projects. These details stay out of your PDF.</p></div>
                  <div className="builder-fields">
                    <ExamInput id="document-title" label="Resume name" value={activeDocument.title} onChange={(title) => updateDocument({ title })} placeholder="Base resume or company and role" className="builder-wide" />
                    <ExamInput id="target-company" label="Company" value={target.company} onChange={(company) => updateDocument({ target: { company } })} placeholder="Company name" />
                    <ExamInput id="target-role" label="Role" value={target.role} onChange={(role) => updateDocument({ target: { role } })} placeholder="Software engineering intern" />
                    <div className="builder-wide">
                      <label className="exam-input-label" htmlFor="target-posting">Job posting</label>
                      <textarea id="target-posting" className="exam-input" value={target.posting} maxLength={30000} rows={12} onChange={(event) => updateDocument({ target: { posting: event.target.value } })} placeholder="Paste the responsibilities and qualifications from the job posting." />
                      <p className="builder-field-note">The comparison runs in your browser. No resume or posting is sent to an AI service.</p>
                    </div>
                  </div>
                  <button type="button" className="btn-exam-outline job-review-action" onClick={() => { setPanelView('review'); setMobileView('preview') }}>Review this application</button>
                </>}
                {activeSection === 'Contact' && <>
                  <div className="builder-section-heading"><h2>Contact details</h2><p>Your name and email are needed to download. Everything else is optional.</p></div>
                  <div className="builder-fields">
                    <ExamInput id="resume-name" label="Full name" value={name} onChange={(value) => updateField('name', value)} placeholder="Your name" required />
                    <ExamInput id="resume-email" label="Email" value={email} onChange={(value) => updateField('email', value)} placeholder="you@example.com" type="email" required />
                    <ExamInput label="Phone" value={phone} onChange={(value) => updateField('phone', value)} placeholder="+1 555 000 0000" type="tel" />
                    <ExamInput label="Location" value={location} onChange={(value) => updateField('location', value)} placeholder="City, state or country" />
                    <ExamInput id="resume-website" label="Website or portfolio" value={website} onChange={(value) => updateField('website', value)} placeholder="https://example.com" type="url" className="builder-wide" />
                    <ExamInput id="resume-summary" label="Professional summary" value={summary} onChange={(value) => updateField('summary', value)} multiline rows={4} className="builder-wide" placeholder="A short description of your experience and the work you do." />
                  </div>
                </>}
                {activeSection === 'Experience' && <>
                  <div className="builder-section-heading"><h2>Work experience</h2><p>Start with your most recent role. Write one achievement per line.</p></div>
                  <div className="builder-entries">
                    {experiences.map((entry, index) => <fieldset key={entry.id} className="builder-entry"><legend>{entry.company.trim() || `Experience ${index + 1}`}</legend><button type="button" className="builder-remove" aria-label={`Remove experience ${index + 1}`} onClick={() => removeEntry('experiences', entry.id)}>Remove</button><div className="builder-fields">
                      <ExamInput id={`resume-entry-${entry.id}-company`} label="Company" value={entry.company} onChange={(value) => upExp(entry.id, 'company', value)} placeholder="Company name" />
                      <ExamInput id={`resume-entry-${entry.id}-title`} label="Job title" value={entry.title} onChange={(value) => upExp(entry.id, 'title', value)} placeholder="Your role" />
                      <ExamInput label="Start date" value={entry.startDate} onChange={(value) => upExp(entry.id, 'startDate', value)} placeholder="Jan 2023" />
                      <ExamInput label="End date" value={entry.endDate} onChange={(value) => upExp(entry.id, 'endDate', value)} placeholder="Present" />
                      <ExamInput id={`resume-entry-${entry.id}-description`} label="Achievements" value={entry.description} onChange={(value) => upExp(entry.id, 'description', value)} multiline rows={5} className="builder-wide" placeholder="What changed because of your work? Include specific results when you have them." />
                    </div></fieldset>)}
                    {!experiences.length && <p className="builder-field-note">Add a role, internship, or other relevant experience.</p>}
                  </div>
                  <button type="button" className="builder-add" onClick={() => updateResume((current) => ({ ...current, experiences: [...current.experiences, { id: crypto.randomUUID(), company: '', title: '', startDate: '', endDate: '', description: '' }] }))}>+ Add experience</button>
                </>}
                {activeSection === 'Education' && <>
                  <div className="builder-section-heading"><h2>Education</h2><p>Add your school, qualification, and graduation year.</p></div>
                  <div className="builder-entries">
                    {education.map((entry, index) => <fieldset key={entry.id} className="builder-entry"><legend>{entry.school.trim() || `Education ${index + 1}`}</legend><button type="button" className="builder-remove" aria-label={`Remove education ${index + 1}`} onClick={() => removeEntry('education', entry.id)}>Remove</button><div className="builder-fields">
                      <ExamInput id={`resume-entry-${entry.id}-school`} label="School" value={entry.school} onChange={(value) => upEdu(entry.id, 'school', value)} placeholder="School or university" />
                      <ExamInput id={`resume-entry-${entry.id}-degree`} label="Degree" value={entry.degree} onChange={(value) => upEdu(entry.id, 'degree', value)} placeholder="B.S." />
                      <ExamInput id={`resume-entry-${entry.id}-field`} label="Field of study" value={entry.field} onChange={(value) => upEdu(entry.id, 'field', value)} placeholder="Computer Science" />
                      <ExamInput label="Graduation year" value={entry.year} onChange={(value) => upEdu(entry.id, 'year', value)} placeholder="2026" />
                    </div></fieldset>)}
                    {!education.length && <p className="builder-field-note">Add education if it’s relevant to your application.</p>}
                  </div>
                  <button type="button" className="builder-add" onClick={() => updateResume((current) => ({ ...current, education: [...current.education, { id: crypto.randomUUID(), school: '', degree: '', field: '', year: '' }] }))}>+ Add education</button>
                </>}
                {activeSection === 'Projects' && <>
                  <div className="builder-section-heading"><h2>Projects</h2><p>Show your contribution and results. Put each point on a new line.</p></div>
                  <div className="builder-entries">
                    {projects.map((entry, index) => <fieldset key={entry.id} className="builder-entry"><legend>{entry.name.trim() || `Project ${index + 1}`}</legend><button type="button" className="builder-remove" aria-label={`Remove project ${index + 1}`} onClick={() => removeEntry('projects', entry.id)}>Remove</button><div className="builder-fields">
                      <ExamInput id={`resume-entry-${entry.id}-name`} label="Project name" value={entry.name} onChange={(value) => upProj(entry.id, 'name', value)} placeholder="Project name" />
                      <ExamInput id={`resume-project-${entry.id}`} label="Project link" value={entry.link} onChange={(value) => upProj(entry.id, 'link', value)} placeholder="https://example.com" type="url" />
                      <ExamInput id={`resume-entry-${entry.id}-description`} label="Project details" value={entry.description} onChange={(value) => upProj(entry.id, 'description', value)} multiline rows={5} className="builder-wide" placeholder="What did you build, and what was your role?" />
                    </div></fieldset>)}
                    {!projects.length && <p className="builder-field-note">Add a project to show your work beyond a job title.</p>}
                  </div>
                  <button type="button" className="builder-add" onClick={() => updateResume((current) => ({ ...current, projects: [...current.projects, { id: crypto.randomUUID(), name: '', description: '', link: '' }] }))}>+ Add project</button>
                </>}
                {activeSection === 'Skills' && <>
                  <div className="builder-section-heading"><h2>Skills</h2><p>List relevant tools, techniques, and languages you can work with.</p></div>
                  <ExamInput id="resume-skills" label="Relevant skills" value={skills} onChange={(value) => updateField('skills', value)} multiline rows={7} placeholder="TypeScript, React, Python…" />
                </>}
              </fieldset>
            </form>
          </div>
          <div className="builder-editor-footer">
            <p>Your details stay on this device.</p>
            {!confirmClear && <button id="clear-resume-draft" type="button" onClick={() => {
              setConfirmClear(true)
              requestAnimationFrame(() => document.getElementById('keep-resume-draft')?.focus())
            }} disabled={!ready || busy}>Clear draft</button>}
          </div>
          {confirmClear && (
            <div className="builder-clear-confirmation" role="group" aria-labelledby="clear-draft-question">
              <p id="clear-draft-question">Clear this draft?</p>
              <p>You can undo until your next edit or until you leave this page.</p>
              <div>
                <button type="button" className="btn-exam-outline" aria-label="Confirm clear draft" disabled={busy} onClick={clearDraft}>Clear draft</button>
                <button id="keep-resume-draft" type="button" className="btn-exam" onClick={() => {
                  setConfirmClear(false)
                  requestAnimationFrame(() => document.getElementById('clear-resume-draft')?.focus())
                }}>Keep draft</button>
              </div>
            </div>
          )}
        </div>
        <section className="builder-preview-panel" aria-label="Application preview and review">
          <div className="builder-panel-tabs" role="group" aria-label="Preview or review">
            <button type="button" aria-pressed={panelView === 'preview'} onClick={() => setPanelView('preview')}>Resume preview</button>
            <button type="button" aria-pressed={panelView === 'review'} onClick={() => setPanelView('review')}>For this job</button>
          </div>
          {panelView === 'review' && <div className="job-review-panel">
            {!target.posting.trim() && <button type="button" className="text-link" onClick={() => { setActiveSection('Job'); setMobileView('edit'); requestAnimationFrame(() => document.getElementById('target-posting')?.focus()) }}>Add a job posting →</button>}
            <fieldset className="job-review-fields" disabled={busy}><JobReview key={activeDocument.id} resume={resume} posting={target.posting} manualPhrases={target.manualPhrases} onManualPhrasesChange={(manualPhrases) => updateDocument({ target: { manualPhrases } })} onNavigate={navigateToEvidence} /></fieldset>
          </div>}
          <div className="builder-document-panel" hidden={panelView !== 'preview'}>
          <div className="builder-preview-toolbar"><h2>Preview</h2><div><label htmlFor="resume-template">Layout</label><select id="resume-template" value={template} onChange={(event) => updateResume((current) => ({ ...current, template: event.target.value as Template }))} disabled={!ready || busy}>{TEMPLATES.map((item) => <option key={item}>{item}</option>)}</select></div></div>
          <p className="builder-template-description">{templateDescriptions[template]}. Single-column layout.</p>
          <div className="builder-preview-scroll">
        <article className={`resume-document resume-${template.toLowerCase()}`} aria-label="Resume preview">
          <header className="resume-heading"><h2>{name.trim() || <span className="resume-placeholder">Your name</span>}</h2><p className="resume-contact">{contacts.join('  ·  ') || <span className="resume-placeholder">Your contact details</span>}</p></header>
          {!hasContent && <div className="resume-empty"><p>Your resume starts here.</p><span>Add your details on the left. The preview updates as you write.</span></div>}
          {summary.trim() && <section><h3>Summary</h3><p>{summary.trim()}</p></section>}
          {filledExperiences.length > 0 && (
            <section>
              <h3>Experience</h3>
              {filledExperiences.map((entry) => (
                <div className="resume-entry" key={entry.id}>
                  <h4>{entry.title.trim() || entry.company.trim()}</h4>
                  <p className="resume-entry-meta">{[
                    entry.title.trim() ? entry.company.trim() : '',
                    [entry.startDate.trim(), entry.endDate.trim()].filter(Boolean).join(' – '),
                  ].filter(Boolean).join('  |  ')}</p>
                  <Description text={entry.description} />
                </div>
              ))}
            </section>
          )}
          {filledEducation.length > 0 && (
            <section>
              <h3>Education</h3>
              {filledEducation.map((entry) => (
                <div className="resume-entry" key={entry.id}>
                  <h4>{entry.school.trim()}</h4>
                  <p>{[
                    [entry.degree.trim(), entry.field.trim()].filter(Boolean).join(', '),
                    entry.year.trim(),
                  ].filter(Boolean).join('  |  ')}</p>
                </div>
              ))}
            </section>
          )}
          {filledProjects.length > 0 && (
            <section>
              <h3>Projects</h3>
              {filledProjects.map((entry) => (
                <div className="resume-entry" key={entry.id}>
                  {entry.name.trim() && <h4>{entry.name.trim()}</h4>}
                  {entry.link.trim() && <p className="resume-project-link">{entry.link.trim()}</p>}
                  <Description text={entry.description} />
                </div>
              ))}
            </section>
          )}
          {skills.trim() && <section><h3>Skills</h3><p>{skills.trim()}</p></section>}
        </article>
          </div>
          <div className="builder-preview-footer"><span>Empty sections are left out. PDF page breaks may differ.</span><button type="button" onClick={() => { if (validateExport()) window.print() }} disabled={!ready || busy}>Print</button></div>
          </div>
        </section>
      </div>
    </div>
  )
}
