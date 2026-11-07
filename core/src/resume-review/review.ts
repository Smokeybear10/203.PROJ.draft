import type { ResumeAnalysis, SectionCheck } from './types.ts'

const sectionPatterns = [
  { name: 'Experience', pattern: /^\s*(?:(?:professional|work|relevant|internship)\s+)?(?:experience|employment(?: history)?|work history|career history)\s*(?::[^\n]*)?$/im },
  { name: 'Education', pattern: /^\s*(?:education|academic(?: background| history| qualifications)?|qualifications)\s*(?::[^\n]*)?$/im },
  { name: 'Skills', pattern: /^\s*(?:(?:technical|professional|key|core)\s+)?(?:skills|technologies|tools|proficiencies|competencies|expertise)\s*(?::[^\n]*)?$/im },
]

export function containsKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  if (keyword.length === 1) return new RegExp(`(?:^|[\\s,;(|/])${escaped}(?=$|[\\s,;).|/])`, 'iu').test(text)
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(text)
}

export function detectSections(text: string): SectionCheck[] {
  const hasContact = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)
    || /(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]?\d{3}[ .-]?\d{4}\b/.test(text)
    || /linkedin\.com\/in\/[\w-]+/i.test(text)
  return [{ name: 'Contact details', found: hasContact }, ...sectionPatterns.map(({ name, pattern }) => ({ name, found: pattern.test(text) }))]
}

export function reviewResume(rawText: string, keywords: string[], pageCount: number | null = null): ResumeAnalysis {
  const text = rawText.normalize('NFKC').replace(/\r\n?/g, '\n').trim()
  const words = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []
  const sections = detectSections(text)
  const found = keywords.filter((keyword) => containsKeyword(text, keyword))
  const missing = keywords.filter((keyword) => !containsKeyword(text, keyword))
  const keywordScore = keywords.length ? Math.round((found.length / keywords.length) * 100) : 0
  const sectionScore = sections.filter((section) => section.found).length * 25
  const hasBullets = /^\s*(?:[•●▪‣◦⁃∙–—*\-]|\d+[.)])\s+\S/m.test(text)
  const readableChecks = [words.length >= 50, !text.includes('\uFFFD'), sections.some((section) => section.name !== 'Contact details' && section.found)]
  const formatScore = Math.round((readableChecks.filter(Boolean).length / readableChecks.length) * 100)
  const suggestions: string[] = []

  for (const section of sections.filter((item) => !item.found)) {
    suggestions.push(section.name === 'Contact details'
      ? 'No email address, phone number, or LinkedIn profile was found in the extracted text. Check that your contact details are readable.'
      : `No ${section.name.toLowerCase()} heading was recognized. If you include this section, use a clear heading so it is easy to find.`)
  }
  if (missing.length) suggestions.push('Compare the example keywords with the actual job posting. Mention relevant skills you have used; you do not need every tool in this profile.')
  if (words.length < 50) suggestions.push('Very little text was extracted. Open the extracted text below to check that your full resume was read.')
  if (text.includes('\uFFFD')) suggestions.push('Some characters could not be read. Re-export the file with selectable text and review it again.')
  if (!hasBullets) suggestions.push('No bullet markers appeared in the extracted text. If your descriptions are long paragraphs, consider shorter bullets. Word’s automatic list markers may not appear here.')

  return {
    ats_score: Math.round((keywordScore + sectionScore + formatScore) / 3),
    keyword_match: { score: keywordScore, found_skills: found, missing_skills: missing },
    format_score: formatScore,
    section_score: sectionScore,
    document_type: 'resume',
    suggestions,
    evidence: { word_count: words.length, page_count: pageCount, sections, extracted_text: text },
  }
}
