'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { label: 'Your resumes', href: '/builder' },
  { label: 'Review a file', href: '/analyzer' },
  { label: 'Job boards', href: '/jobs' },
  { label: 'About', href: '/about' },
]

export default function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <nav className="draft-nav" aria-label="Main navigation">
      <Link href="/" className="draft-brand" onClick={() => setOpen(false)}>Draft<span aria-hidden="true">.</span></Link>
      <button type="button" className="nav-toggle" aria-expanded={open} aria-controls="primary-links" onClick={() => setOpen(!open)}>
        {open ? 'Close' : 'Menu'}
      </button>
      <ul id="primary-links" className={`draft-nav-links ${open ? 'is-open' : ''}`}>
        {links.map(({ label, href }) => (
          <li key={href}>
            <Link href={href} aria-current={pathname === href ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
