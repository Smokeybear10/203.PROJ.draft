'use client'

import { useId, useMemo, useState, type FormEvent } from 'react'
import { analyzeJobPosting, type JobMatch, type ResumeSection } from '@/lib/resume-review/job-match'
import type { Resume } from './resume'
import './job-review.css'

type JobReviewProps = {
  resume: Resume
  posting: string
  manualPhrases: string[]
  onManualPhrasesChange: (phrases: string[]) => void
  onNavigate: (section: ResumeSection, entryId?: string, field?: string) => void
}

const statusLabel = { experience: 'In work or projects', listed: 'Listed elsewhere', missing: 'Not mentioned' }
const statusOrder = { missing: 0, listed: 1, experience: 2 }
type ReviewFilter = 'all' | 'missing' | 'listed'

function MatchRow({ match, onNavigate }: { match: JobMatch; onNavigate: JobReviewProps['onNavigate'] }) {
  const [open, setOpen] = useState(match.status !== 'experience')

  return <li className="job-review-match">
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="job-review-match-heading"><span className="job-review-phrase">{match.phrase}</span><span className="job-review-match-status">{statusLabel[match.status]}</span><span className="job-review-chevron" aria-hidden="true">›</span></summary>
      <div className="job-review-excerpts">
        <div><p className="job-review-caption">From the posting</p><blockquote>{match.postingExcerpt}</blockquote></div>
        <div><p className="job-review-caption">In your resume</p>
          {match.evidence.length ? match.evidence.map((evidence, index) => <div className="job-review-evidence" key={`${evidence.source.section}-${evidence.source.id ?? evidence.source.field}-${index}`}><blockquote>{evidence.excerpt}</blockquote><button type="button" onClick={() => onNavigate(evidence.source.section, evidence.source.id, evidence.source.field)}>Edit {evidence.source.label}<span className="sr-only"> — {match.phrase}</span> <span aria-hidden="true">→</span></button></div>) : <><p className="job-review-missing">No matching phrase. Add relevant experience only if you have it.</p><div className="job-review-edit-links"><button type="button" onClick={() => onNavigate('Experience')}>Review experience <span aria-hidden="true">→</span></button><button type="button" onClick={() => onNavigate('Projects')}>Review projects <span aria-hidden="true">→</span></button></div></>}
          {match.status === 'listed' && <p className="job-review-guidance">A work or project example could show how you used this, if you have one.</p>}
        </div>
      </div>
    </details>
  </li>
}

export default function JobReview({ resume, posting, manualPhrases, onManualPhrasesChange, onNavigate }: JobReviewProps) {
  const inputId = useId()
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const review = useMemo(() => analyzeJobPosting(posting, resume, manualPhrases), [posting, resume, manualPhrases])
  const filters: { value: ReviewFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: review.matches.length },
    { value: 'missing', label: 'Not mentioned', count: review.matches.filter((match) => match.status === 'missing').length },
    { value: 'listed', label: 'Listed only', count: review.matches.filter((match) => match.status === 'listed').length },
  ]
  const matches = review.matches.filter((match) => filter === 'all' || match.status === filter).sort((a, b) => statusOrder[a.status] - statusOrder[b.status])

  const addPhrase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = phrase.trim().replace(/\s+/g, ' ')
    if (!value) return
    if (manualPhrases.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase()) || review.matches.some((item) => item.phrase.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      setError('This phrase is already included.')
      return
    }
    if (analyzeJobPosting(posting, resume, [value]).unmatchedManualPhrases.length) {
      setError('Use a phrase that appears in this job posting.')
      return
    }
    onManualPhrasesChange([...manualPhrases, value])
    setPhrase('')
    setError('')
  }

  if (!posting.trim()) return <div className="job-review-empty"><h3>Compare your experience with the posting</h3><p>Add a job posting in the Job section. You’ll see the wording from the posting alongside the places your resume mentions it.</p></div>

  return <section className="job-review" aria-label="Job posting comparison">
    <header className="job-review-header"><h3>What your resume shows</h3><p>Compare the wording below before editing. A mention doesn’t verify a skill, and some skills in a posting may be optional.</p></header>
    {review.matches.length ? <>
      <div className="job-review-filters" role="group" aria-label="Filter phrases">{filters.map((item) => <button type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span>{item.count}</span></button>)}</div>
      {matches.length ? <ul className="job-review-matches">{matches.map((match) => <MatchRow key={`${match.phrase}-${match.status}`} match={match} onNavigate={onNavigate} />)}</ul> : <p className="job-review-filter-empty" role="status">{filter === 'missing' ? 'Every recognized phrase appears somewhere in your resume.' : 'No phrases are listed without a work or project example.'}</p>}
    </> : <p className="job-review-empty-note">No supported technical phrases were recognized. You can add wording from the posting below, including requirements outside software engineering.</p>}
    <div className="job-review-custom">
      <h4>Check another phrase</h4><p>Automatic matching covers common engineering tools. Add a short phrase from the posting for anything it missed.</p>
      <form onSubmit={addPhrase}><label className="sr-only" htmlFor={inputId}>Phrase from the job posting</label><input id={inputId} className="exam-input" value={phrase} maxLength={80} onChange={(event) => { setPhrase(event.target.value); setError('') }} placeholder="e.g. technical documentation" aria-describedby={error ? `${inputId}-error` : undefined} /><button type="submit" className="btn-exam-outline" disabled={!phrase.trim() || manualPhrases.length >= 20}>Add phrase</button></form>
      {error && <p id={`${inputId}-error`} className="job-review-error" role="alert">{error}</p>}
      {manualPhrases.length >= 20 && <p className="job-review-guidance">You can add up to 20 phrases. Remove one to add another.</p>}
      {manualPhrases.length > 0 && <ul className="job-review-custom-list" aria-label="Your added phrases">{manualPhrases.map((item) => <li key={item}><span>{item}{review.unmatchedManualPhrases.includes(item) && <span className="job-review-guidance"> — no longer in this posting</span>}</span><button type="button" aria-label={`Remove phrase ${item}`} onClick={() => onManualPhrasesChange(manualPhrases.filter((current) => current !== item))}>Remove</button></li>)}</ul>}
    </div>
    {review.prompts.length > 0 && <section className="job-review-writing"><h4>Questions for your next edit</h4><p>Use these only where they help explain your work. You don’t need a number in every bullet.</p><ul>{review.prompts.map((prompt, index) => <li key={`${prompt.source.id}-${index}`}><blockquote>{prompt.excerpt}</blockquote><p>{prompt.question}</p><button type="button" onClick={() => onNavigate(prompt.source.section, prompt.source.id, prompt.source.field)}>Edit {prompt.source.label} <span aria-hidden="true">→</span></button></li>)}</ul></section>}
    <p className="job-review-limit">Phrases are matched with a small list of spelling variants. Equivalent experience can be missed. This does not verify qualifications or predict hiring decisions.</p>
  </section>
}
