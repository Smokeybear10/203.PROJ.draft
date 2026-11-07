import { fileURLToPath } from 'node:url'
import { createElement, type ReactNode } from 'react'
import { Document, Font, Link, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import type { Resume } from './resume.ts'

async function loadFontFamily(family: string, extension: string, fontRoot: string) {
  const fontFamily = `${family}:${fontRoot}`
  if (!Font.getRegisteredFontFamilies().includes(fontFamily)) {
    Font.register({
      family: fontFamily,
      fonts: [
        { src: `${fontRoot}/${family}-Regular.${extension}`, fontWeight: 400 },
        { src: `${fontRoot}/${family}-Bold.${extension}`, fontWeight: 700 },
      ],
    })
  }
  const sources = [400, 700].map((fontWeight) => Font.getFont({ fontFamily, fontWeight }))
  const results = await Promise.allSettled(sources.map((source) => source.load()))
  if (results.some((result) => result.status === 'rejected')) {
    results.forEach((result, index) => {
      if (result.status === 'rejected') sources[index].loadResultPromise = null
    })
    throw new Error('The PDF fonts couldn’t be loaded. Check your connection and try again.')
  }
  return fontFamily
}

async function loadFonts(resume: Resume, fontRoot: string) {
  const content = [
    resume.name, resume.email, resume.phone, resume.location, resume.website, resume.summary, resume.skills,
    ...resume.experiences.flatMap((entry) => [entry.company, entry.title, entry.startDate, entry.endDate, entry.description]),
    ...resume.education.flatMap((entry) => [entry.school, entry.degree, entry.field, entry.year]),
    ...resume.projects.flatMap((entry) => [entry.name, entry.description, entry.link]),
  ].join('\n').normalize('NFC')
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303f\ufe30-\ufe4f\uff00-\uffef]/u
  if (content.split(/\s+/u).some((part) => part.length > 1000 && [...part].filter((character) => cjk.test(character)).length > 1000)) {
    throw new Error('One paragraph is too long to export safely. Add line breaks so each paragraph has at most 1,000 Chinese, Japanese, or Korean characters. Your draft has not changed.')
  }
  const primary = resume.template === 'Classic' || resume.template === 'Executive' ? 'NotoSerif' : 'NotoSans'
  const families = [await loadFontFamily(primary, 'ttf', fontRoot)]
  const characters = [...new Set([...content].filter((character) => !/\s/u.test(character)))]
  const isUnsupported = (character: string) => [400, 700].some((fontWeight) => !families.some((fontFamily) => (
    Font.getFont({ fontFamily, fontWeight }).data?.hasGlyphForCodePoint(character.codePointAt(0) ?? 0)
  )))
  const cjkRanges = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 31, 32]
  const requiredRanges = [...new Set(characters.filter((character) => cjk.test(character) && isUnsupported(character))
    .map((character) => Math.min(Math.floor((character.codePointAt(0) ?? 0) / 2048), 32)))].filter((range) => cjkRanges.includes(range))
  const fallbackResults = await Promise.allSettled(requiredRanges.map((range) => loadFontFamily(`NotoCJK-${range}`, 'woff', `${fontRoot}/cjk`)))
  for (const result of fallbackResults) {
    if (result.status === 'rejected') throw result.reason
    families.push(result.value)
  }
  const unsupported = characters.filter(isUnsupported)
  if (unsupported.length) {
    const details = unsupported.slice(0, 8).map((character) => `${character} (U+${character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')})`).join(', ')
    throw new Error(`PDF export does not support these characters yet: ${details}. Replace them before downloading; your draft has not changed.`)
  }
  return families
}

function websiteUrl(value: string) {
  if (!value.trim()) return undefined
  try {
    const url = new URL(value.trim())
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

const clean = (value: string) => value.trim().normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
const lines = (value: string) => clean(value).split('\n').map((line) => line.trim().replace(/^[-•]\s*/, '')).filter(Boolean)
const h = createElement

export async function createResumePdf(resume: Resume, fontRoot = fileURLToPath(new URL('../../fonts', import.meta.url))): Promise<Blob> {
  const family = await loadFonts(resume, fontRoot)
  const minimal = resume.template === 'Minimal'
  const executive = resume.template === 'Executive'
  const classic = resume.template === 'Classic'
  const technical = resume.template === 'Technical'
  const accent = minimal || executive || classic ? '#20252a' : '#193d63'
  const styles = StyleSheet.create({
    page: { padding: 44, fontFamily: family, fontSize: minimal ? 9.5 : executive ? 11 : 10, lineHeight: executive ? 1.55 : 1.45, color: '#20252a' },
    heading: { marginBottom: 18, paddingBottom: minimal || technical ? 5 : 14, borderBottomWidth: minimal || technical ? 0 : 1.5, borderBottomColor: accent, borderTopWidth: technical ? 2 : 0, borderTopColor: accent, paddingTop: technical ? 12 : 0, textAlign: classic || executive ? 'center' : 'left' },
    name: { fontSize: executive ? 27 : minimal ? 23 : 25, fontWeight: minimal || executive ? 400 : 700, lineHeight: 1.2, color: accent, marginBottom: 7 },
    contact: { fontSize: 9, color: '#414a52', lineHeight: 1.6 },
    link: { color: '#414a52', textDecoration: 'none' },
    section: { marginBottom: executive ? 22 : minimal ? 12 : 16 },
    sectionTitle: { fontSize: executive ? 11.5 : 10.5, fontFamily: technical ? 'Courier-Bold' : family, fontWeight: 700, color: accent, marginBottom: 8, paddingBottom: classic ? 4 : 0, borderBottomWidth: classic ? 0.5 : 0, borderBottomColor: '#bfc5ca', letterSpacing: minimal || technical ? 0 : 0.7, textTransform: minimal || technical ? 'none' : 'uppercase' },
    entry: { marginBottom: 12 },
    entryTitle: { fontWeight: 700, marginBottom: 2 },
    entryMeta: { fontSize: 9, color: '#414a52', marginBottom: 4 },
    bullet: { paddingLeft: 10, marginBottom: 3 },
    projectLink: { marginBottom: 4, fontSize: 9, color: '#414a52' },
  })

  const text = (value: string, key: string) => h(Text, { key, orphans: 2, widows: 2 }, clean(value))
  const bullets = (value: string) => lines(value).map((line, index) => h(Text, { key: `bullet-${index}`, style: styles.bullet, orphans: 2, widows: 2 }, `• ${line}`))
  const section = (title: string, children: ReactNode[]) => h(View, { key: title, style: styles.section },
    h(Text, { style: styles.sectionTitle, minPresenceAhead: 30 }, title), ...children)

  const contacts: ReactNode[] = []
  const addContact = (value: string, url?: string) => {
    if (!clean(value)) return
    if (contacts.length) contacts.push('  ·  ')
    contacts.push(url ? h(Link, { key: value, src: url, style: styles.link }, clean(value)) : clean(value))
  }
  addContact(resume.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(resume.email)) ? `mailto:${encodeURIComponent(clean(resume.email)).replace('%40', '@')}` : undefined)
  const phoneNumber = clean(resume.phone).replace(/[\s().-]/g, '')
  addContact(resume.phone, /^\+?\d{3,15}$/.test(phoneNumber) ? `tel:${phoneNumber}` : undefined)
  addContact(resume.location)
  addContact(resume.website, websiteUrl(resume.website))

  const sections: ReactNode[] = []
  if (clean(resume.summary)) sections.push(section('Summary', [text(resume.summary, 'summary')]))

  const experiences = resume.experiences.filter((entry) => [entry.company, entry.title, entry.description].some((value) => clean(value)))
  if (experiences.length) sections.push(section('Experience', experiences.map((entry) => h(View, { key: entry.id, style: styles.entry },
    h(Text, { style: styles.entryTitle, minPresenceAhead: 24 }, clean(entry.title) || clean(entry.company)),
    h(Text, { style: styles.entryMeta, minPresenceAhead: lines(entry.description).length ? 14 : 0 }, [clean(entry.title) ? clean(entry.company) : '', [clean(entry.startDate), clean(entry.endDate)].filter(Boolean).join(' – ')].filter(Boolean).join('  |  ')),
    ...bullets(entry.description)))))

  const education = resume.education.filter((entry) => [entry.school, entry.degree, entry.field].some((value) => clean(value)))
  if (education.length) sections.push(section('Education', education.map((entry) => h(View, { key: entry.id, style: styles.entry },
    h(Text, { style: styles.entryTitle, minPresenceAhead: 16 }, clean(entry.school)),
    text([[clean(entry.degree), clean(entry.field)].filter(Boolean).join(', '), clean(entry.year)].filter(Boolean).join('  |  '), `${entry.id}-degree`)))))

  const projects = resume.projects.filter((entry) => [entry.name, entry.description, entry.link].some((value) => clean(value)))
  if (projects.length) sections.push(section('Projects', projects.map((entry) => h(View, { key: entry.id, style: styles.entry },
    clean(entry.name) ? h(Text, { style: styles.entryTitle, minPresenceAhead: 24 }, clean(entry.name)) : null,
    clean(entry.link) ? (websiteUrl(entry.link)
      ? h(Link, { src: websiteUrl(entry.link), style: [styles.link, styles.projectLink] }, clean(entry.link))
      : h(Text, { style: styles.projectLink }, clean(entry.link))) : null,
    ...bullets(entry.description)))))

  if (clean(resume.skills)) sections.push(section('Skills', [text(resume.skills, 'skills')]))

  return pdf(h(Document, { title: `${clean(resume.name)} — Resume`, author: clean(resume.name), creator: 'Draft', language: 'en' },
    h(Page, { size: 'A4', style: styles.page, wrap: true },
      h(View, { style: styles.heading },
        h(Text, { style: styles.name, minPresenceAhead: 20 }, clean(resume.name)),
        h(Text, { style: styles.contact }, ...contacts)),
      ...sections))).toBlob()
}

export function resumePdfFilename(name: string, filename?: string): string {
  const sanitize = (value: string) => [...clean(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, '-').replace(/^\.+|[.\s]+$/g, '')].slice(0, 80).join('')
  const title = sanitize(filename?.replace(/\.pdf\s*$/i, '') ?? '')
  const base = title || `${sanitize(name) || 'resume'}-resume`
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base) ? `resume-${base}` : base}.pdf`
}
