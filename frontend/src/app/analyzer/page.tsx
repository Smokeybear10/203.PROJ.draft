'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import ExamCard from '@/components/booklet/ExamCard'
import ExamButton from '@/components/booklet/ExamButton'
import PaperUpload from '@/components/booklet/PaperUpload'
import { analyzeResume, analyzeResumeAI, getRoles, getReviewCapabilities, type AIResumeAnalysis, type JobRoles, type ResumeAnalysis } from '@/lib/api'

type ReviewResult = { role: string; fileName: string } & (
  | { mode: 'standard'; data: ResumeAnalysis }
  | { mode: 'ai'; data: AIResumeAnalysis }
)

export default function AnalyzerPage() {
  const [mode, setMode] = useState<'standard' | 'ai'>('standard')
  const [roleMap, setRoleMap] = useState<JobRoles>({})
  const [rolesStatus, setRolesStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [aiAvailable, setAiAvailable] = useState(false)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [category, setCategory] = useState('')
  const [role, setRole] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reviewRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getRoles(controller.signal), getReviewCapabilities(controller.signal)])
      .then(([data, capabilities]) => {
        if (controller.signal.aborted) return
        setRoleMap(data)
        setAiAvailable(capabilities.ai)
        setRolesError(null)
        setRolesStatus('ready')
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setRolesError(cause instanceof Error ? cause.message : 'The list of roles is unavailable.')
        setRolesStatus('error')
      })
    return () => controller.abort()
  }, [retry])

  useEffect(() => () => reviewRequest.current?.abort(), [])

  const categories = Object.keys(roleMap)
  const availableRoles = Object.keys(roleMap[category] ?? {})

  const clearResult = () => { setResult(null); setError(null) }

  const handleAnalyze = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file || !category || !role || analyzing || rolesStatus !== 'ready' || (mode === 'ai' && !aiAvailable)) return
    const controller = new AbortController()
    reviewRequest.current = controller
    setAnalyzing(true)
    clearResult()

    try {
      if (mode === 'ai') {
        const data = await analyzeResumeAI(file, role, jobDescription.trim(), controller.signal)
        setResult({ mode, data, role, fileName: file.name })
      } else {
        const data = await analyzeResume(file, category, role, controller.signal)
        if (data.document_type !== 'resume') {
          setError('This file wasn’t recognized as a resume. Check that it contains selectable text, experience, education, and skills.')
          return
        }
        setResult({ mode, data, role, fileName: file.name })
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'We couldn’t complete the review. Please try again.')
      }
    } finally {
      setAnalyzing(false)
      reviewRequest.current = null
    }
  }

  return (
    <div className="tool-wrapper">
      <div className="tool-paper">
        <div className="tool-binding" aria-hidden />
        <div className="tool-header">
          <div className="tool-header-kicker">Review</div>
          <h1 className="tool-header-title">A second look at your resume.</h1>
          <p className="tool-description">Check the text, sections, and role-specific keywords in your PDF or DOCX.</p>
        </div>

        {rolesStatus !== 'ready' ? (
          <div className="analysis-notice" role="status">
            <h2>{rolesStatus === 'loading' ? 'Loading resume review…' : 'We couldn’t load the available roles.'}</h2>
            <p>{rolesStatus === 'loading' ? 'Loading the available roles.' : rolesError}</p>
            {rolesStatus === 'error' && (
              <ExamButton onClick={() => { setRolesStatus('loading'); setRetry((value) => value + 1) }}>Try again</ExamButton>
            )}
          </div>
        ) : (
          <>
            {aiAvailable && <div className="exam-tabs" aria-label="Review method">
              {(['standard', 'ai'] as const).map((tab) => (
                <button key={tab} type="button" disabled={analyzing} aria-pressed={mode === tab}
                  onClick={() => { setMode(tab); clearResult() }} className={`exam-tab ${mode === tab ? 'active' : ''}`}>
                  {tab === 'standard' ? 'Standard review' : 'AI review'}
                </button>
              ))}
            </div>}
            <p className="analysis-method-note">
              {mode === 'standard'
                ? 'Compare your resume with example keywords for a role. You don’t need every tool in the profile. No AI is used.'
                : aiAvailable ? 'Get writing feedback for a role or job posting. Your resume text and optional job description are sent to xAI for this review.' : 'AI review is optional. Standard review works without an AI service.'}
            </p>

            {mode === 'ai' && !aiAvailable ? (
              <div className="analysis-notice" role="status">
                <h2>AI review is not enabled on this site.</h2>
                <p>Standard review is available. It checks your document and role keywords without sending anything to an AI service.</p>
                <ExamButton onClick={() => { setMode('standard'); clearResult() }}>Use Standard review</ExamButton>
              </div>
            ) : <form onSubmit={handleAnalyze} aria-busy={analyzing}>
              <fieldset disabled={analyzing} className="review-fields">
                <legend className="sr-only">Resume and target role</legend>
                <div className="analysis-role-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 16, marginBottom: 16 }}>
                  <ExamCard title="Field">
                    <select value={category} onChange={(event) => { setCategory(event.target.value); setRole(''); clearResult() }}
                      className="exam-select" aria-label="Job category" required>
                      <option value="">Choose a field</option>
                      {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </ExamCard>
                  <ExamCard title="Target role">
                    <select value={role} onChange={(event) => { setRole(event.target.value); clearResult() }}
                      disabled={!category || analyzing} className="exam-select" aria-label="Job role" required>
                      <option value="">Choose a role</option>
                      {availableRoles.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </ExamCard>
                </div>

                {mode === 'ai' && (
                  <div className="analysis-job-description" style={{ marginBottom: 16 }}>
                    <label htmlFor="job-description" className="exam-label">Job description <span>(optional)</span></label>
                    <textarea id="job-description" value={jobDescription} rows={5} className="exam-input"
                      onChange={(event) => { setJobDescription(event.target.value); clearResult() }}
                      placeholder="Paste the posting to make the feedback more specific." />
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <PaperUpload disabled={analyzing} onFileSelect={(selected) => { if (!analyzing) { setFile(selected); clearResult() } }} />
                </div>
                <ExamButton type="submit" disabled={!file || !category || !role || analyzing} variant="filled" fullWidth>
                  {analyzing ? 'Reviewing your resume…' : 'Review resume'}
                </ExamButton>
              </fieldset>
              {analyzing && (
                <div className="analysis-progress" role="status">
                  <span>{mode === 'ai' ? 'AI feedback can take up to a minute.' : 'Reading your file and checking the selected role.'}</span>
                  <button type="button" className="analysis-text-button" onClick={() => reviewRequest.current?.abort()}>Cancel</button>
                </div>
              )}
            </form>}
          </>
        )}

        {error && <div className="analysis-error" role="alert"><p>{error}</p></div>}

        {result && (
          <section className="analysis-results" aria-label="Resume review results" aria-live="polite">
            <div className="analysis-result-heading">
              <div className="tool-header-kicker">{result.mode === 'standard' ? 'Standard review' : 'AI review'}</div>
              <h2>Your review</h2>
              <p>{result.fileName} · {result.role}</p>
            </div>

            {result.mode === 'standard' ? (
              <>
                <p className="analysis-method-note">
                  {result.data.evidence ? `${result.data.evidence.word_count.toLocaleString()} words read${result.data.evidence.page_count ? ` from ${result.data.evidence.page_count} ${result.data.evidence.page_count === 1 ? 'page' : 'pages'}` : ''}. ` : ''}
                  {result.data.keyword_match.found_skills.length} of {result.data.keyword_match.found_skills.length + result.data.keyword_match.missing_skills.length} example role keywords found.
                </p>
                <p className="analysis-method-note">This is a text check, not an employer’s ATS result. Use the actual job posting to decide which skills matter.</p>
                {result.data.evidence && (
                  <section className="analysis-result-section">
                    <h3>Sections found</h3>
                    <ul className="analysis-list">
                      {result.data.evidence.sections.map((section) => <li key={section.name}><strong>{section.name}</strong> — {section.found ? 'found' : 'not recognized'}</li>)}
                    </ul>
                  </section>
                )}
                {result.data.keyword_match.missing_skills.length > 0 && (
                  <section className="analysis-result-section">
                    <h3>Example keywords not found</h3>
                    <p>These are examples for this role, not a list of required tools. Include only skills relevant to the posting that reflect your experience.</p>
                    <div className="kw-grid">{result.data.keyword_match.missing_skills.map((skill) => <span key={skill} className="exam-tag">{skill}</span>)}</div>
                  </section>
                )}
                {result.data.keyword_match.found_skills.length > 0 && (
                  <section className="analysis-result-section">
                    <h3>Keywords found</h3>
                    <div className="kw-grid">{result.data.keyword_match.found_skills.map((skill) => <span key={skill} className="exam-tag">{skill}</span>)}</div>
                  </section>
                )}
                {result.data.suggestions.length > 0 && <section className="analysis-result-section">
                  <h3>Things to check</h3>
                  <ul className="analysis-list">{result.data.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>
                </section>}
                {result.data.evidence && (
                  <details className="analysis-result-section">
                    <summary>Check the extracted text</summary>
                    <p>Make sure your main content appears here. Visual layout, images, and Word’s automatic list markers are not assessed.</p>
                    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflowY: 'auto', font: 'inherit', lineHeight: 1.6, marginTop: 16 }}>{result.data.evidence.extracted_text}</pre>
                  </details>
                )}
              </>
            ) : (
              <>
                <p className="analysis-method-note">AI feedback can miss context. Check each suggestion against your experience before making changes.</p>
                {result.data.weaknesses.length > 0 && (
                  <section className="analysis-result-section">
                    <h3>What to improve</h3>
                    <ul className="analysis-list">{result.data.weaknesses.map((item, index) => <li key={index}>{item}</li>)}</ul>
                  </section>
                )}
                {result.data.strengths.length > 0 && (
                  <section className="analysis-result-section">
                    <h3>What’s working</h3>
                    <ul className="analysis-list">{result.data.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul>
                  </section>
                )}
                {result.data.analysis && (
                  <details className="analysis-result-section">
                    <summary>Full review</summary>
                    <div className="analysis-report">
                      {result.data.analysis.split(/\n\s*\n/).map((paragraph, index) => (
                        <p key={index} style={{ whiteSpace: 'pre-line' }}>{paragraph.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1')}</p>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
