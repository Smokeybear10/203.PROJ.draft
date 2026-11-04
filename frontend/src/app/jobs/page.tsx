'use client'

import { useState, type FormEvent } from 'react'
import ExamButton from '@/components/booklet/ExamButton'
import ExamInput from '@/components/booklet/ExamInput'
import styles from './jobs.module.css'

type Search = { query: string; location: string }

const getSearchLinks = ({ query, location }: Search) => [
  {
    name: 'LinkedIn',
    description: 'Roles, companies, and professional networks',
    url: `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords: query, location })}`,
  },
  {
    name: 'Indeed',
    description: 'Jobs across industries and experience levels',
    url: `https://www.indeed.com/jobs?${new URLSearchParams({ q: query, l: location })}`,
  },
  {
    name: 'Google',
    description: 'Search for openings across the web',
    url: `https://www.google.com/search?${new URLSearchParams({ q: [query, 'jobs', location].filter(Boolean).join(' ') })}`,
  },
]

export default function JobsPage() {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [search, setSearch] = useState<Search | null>(null)

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!query.trim()) return
    setSearch({ query: query.trim(), location: location.trim() })
  }

  return (
    <div className="tool-wrapper">
      <div className="tool-paper">
        <div className="tool-header">
          <h1 className="tool-header-title">Find your next role.</h1>
          <p className={styles.intro}>Use the same search terms on LinkedIn, Indeed, and Google.</p>
        </div>

        <form onSubmit={handleSearch} className={styles.form}>
          <div className={styles.fields}>
            <ExamInput
              label="Role or keywords"
              value={query}
              onChange={setQuery}
              placeholder="e.g. Software engineer"
              required
            />
            <ExamInput
              label="Location (optional)"
              value={location}
              onChange={setLocation}
              placeholder="City, country, or remote"
            />
          </div>
          <ExamButton type="submit" disabled={!query.trim()} variant="filled">Show search links</ExamButton>
        </form>

        <div aria-live="polite" aria-atomic="true" className={styles.searchSummary}>
          {search && <p>Search for <strong>{search.query}</strong>{search.location ? ` · ${search.location}` : ' · All locations'}</p>}
        </div>

        {search && (
          <section aria-label="Job board search links">
            <ul className={styles.boards}>
              {getSearchLinks(search).map((board) => (
                <li key={board.name}>
                  <a href={board.url} target="_blank" rel="noopener noreferrer" className={styles.board}>
                    <span>
                      <span className={styles.boardName}>{board.name}</span>
                      <span className={styles.boardDescription}>{board.description}</span>
                    </span>
                    <span className={styles.open}>Open search <span aria-hidden="true">↗</span></span>
                    <span className="sr-only"> in a new tab</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className={styles.note}>Each link opens the job board in a new tab. Listings and filters are managed there.</p>
          </section>
        )}
      </div>
    </div>
  )
}
