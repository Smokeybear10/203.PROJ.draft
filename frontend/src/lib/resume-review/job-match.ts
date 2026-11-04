import type { Resume } from '../../app/builder/resume'

export type ResumeSection = 'Contact' | 'Experience' | 'Education' | 'Projects' | 'Skills'
export type EvidenceSource = { section: ResumeSection; id?: string; field: string; label: string }
export type ResumeEvidence = { excerpt: string; source: EvidenceSource }
export type JobMatch = {
  phrase: string
  postingExcerpt: string
  evidence: ResumeEvidence[]
  status: 'experience' | 'listed' | 'missing'
  manual: boolean
}
export type WritingPrompt = { excerpt: string; question: string; source: EvidenceSource }
type Skill = { phrase: string; aliases: string[] }
type Fragment = { text: string; source: EvidenceSource; applied: boolean }

const skill = (phrase: string, ...aliases: string[]): Skill => ({ phrase, aliases: [phrase, ...aliases] })
const skills: Skill[] = [
  skill('TypeScript'), skill('JavaScript', 'ECMAScript'), skill('Python', 'Python3'), skill('Java'),
  skill('C++', 'C plus plus', 'C++11', 'C++14', 'C++17', 'C++20', 'C++23'), skill('C#', 'C sharp'), skill('C'), skill('R'),
  skill('Go', 'Golang'),
  skill('Rust'), skill('Ruby'), skill('PHP'), skill('Swift'), skill('Kotlin'), skill('Scala'), skill('Dart'),
  skill('SQL'), skill('HTML', 'HTML5'), skill('CSS', 'CSS3'), skill('Bash'), skill('PowerShell'), skill('MATLAB'),
  skill('React', 'React.js', 'ReactJS'), skill('React Native'), skill('Vue', 'Vue.js', 'VueJS'),
  skill('Angular'), skill('Next.js', 'NextJS'), skill('Nuxt', 'Nuxt.js'), skill('Svelte'),
  skill('Node.js', 'NodeJS'), skill('Express.js', 'ExpressJS'), skill('Django'), skill('Flask'), skill('FastAPI'),
  skill('Ruby on Rails', 'Rails'), skill('Laravel'), skill('Spring Boot'), skill('ASP.NET'), skill('.NET', 'dotnet'),
  skill('Flutter'), skill('Android'), skill('iOS'), skill('Tailwind CSS', 'Tailwind'), skill('Sass', 'SCSS'),
  skill('PostgreSQL', 'Postgres'), skill('MySQL'), skill('SQLite'), skill('MongoDB'), skill('Redis'),
  skill('Elasticsearch'), skill('DynamoDB'), skill('Firebase'), skill('Supabase'),
  skill('Docker'), skill('Kubernetes', 'K8s'), skill('Terraform'), skill('Ansible'),
  skill('AWS', 'Amazon Web Services'), skill('Azure', 'Microsoft Azure'), skill('Google Cloud', 'GCP', 'Google Cloud Platform'),
  skill('CI/CD', 'continuous integration', 'continuous delivery', 'continuous deployment'),
  skill('Git'), skill('GitHub Actions'), skill('GitLab CI'), skill('Jenkins'), skill('Linux'),
  skill('REST', 'RESTful'), skill('GraphQL'), skill('gRPC'), skill('WebSocket', 'WebSockets'),
  skill('OAuth', 'OAuth2', 'OAuth 2.0'), skill('OpenID Connect', 'OIDC'),
  skill('Jest'), skill('Vitest'), skill('Playwright'), skill('Cypress'), skill('pytest'), skill('JUnit'),
  skill('unit testing', 'unit tests'), skill('integration testing', 'integration tests'),
  skill('accessibility', 'WCAG'), skill('responsive design'), skill('Figma'),
  skill('TensorFlow'), skill('PyTorch'), skill('scikit-learn'), skill('pandas'), skill('NumPy'),
  skill('Apache Spark', 'PySpark'), skill('Kafka', 'Apache Kafka'), skill('Airflow', 'Apache Airflow'),
]

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')

function findPhrase(text: string, phrase: string, rejectNegated = false): { start: number; end: number } | null {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  if (!escaped) return null
  const lower = normalize(phrase)
  const before = lower === 'c' ? '[\\p{L}\\p{N}_+.#-]' : '[\\p{L}\\p{N}_]'
  const after = lower === 'c' ? '[\\p{L}\\p{N}_+#-]' : lower === 'r' ? '[\\p{L}\\p{N}_&]' : '[\\p{L}\\p{N}_]'
  const expression = new RegExp(`(?<!${before})${escaped}(?!${after})`, 'giu')
  for (const match of text.matchAll(expression)) {
    const start = match.index
    const end = start + match[0].length
    if (rejectNegated && isNegated(text, start)) continue
    if ((lower === 'c' || lower === 'r') && /\b(?:grade|rating|series|category|class)\s*$/iu.test(text.slice(Math.max(0, start - 25), start))) continue
    if (lower === 'react' && /^\s+(?:native|to|quickly|swiftly|positively|appropriately)\b/iu.test(text.slice(end))) continue
    if (lower === 'rest' && /^\s+(?:of|assured)\b/iu.test(text.slice(end))) continue
    if (lower === 'go') {
      const preceding = text.slice(Math.max(0, start - 55), start)
      const following = text.slice(end, end + 45)
      const languageContext = /\b(?:programming|languages?|skills|written|developed|built|using|use|proficien\w*|experience|knowledge)\b[^.!?\n]*$/iu.test(preceding)
        || /^\s+(?:programming|language|developer|engineer|experience)\b/iu.test(following)
        || /(?:^|[,;/])\s*$/u.test(preceding) && /^(?:\s*[,;/]|\s*$)/u.test(following)
      if (!languageContext || /^-to\b/iu.test(following)) continue
    }
    return { start, end }
  }
  return null
}

function findSkill(text: string, item: Skill, rejectNegated = false) {
  return item.aliases.map((alias) => findPhrase(text, alias, rejectNegated)).filter((match) => match !== null).sort((a, b) => a.start - b.start)[0] ?? null
}

function excerpt(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const followingBreak = text.indexOf('\n', end)
  const lineEnd = followingBreak === -1 ? text.length : followingBreak
  if (lineEnd - lineStart <= 320) return text.slice(lineStart, lineEnd).trim()
  let from = Math.max(lineStart, start - 100)
  let to = Math.min(lineEnd, Math.max(end + 100, from + 260))
  if (from > lineStart) {
    const boundary = text.indexOf(' ', from)
    if (boundary !== -1 && boundary < start) from = boundary + 1
  }
  if (to < lineEnd) {
    const boundary = text.lastIndexOf(' ', to)
    if (boundary > end) to = boundary
  }
  return text.slice(from, to).trim()
}

function fragments(resume: Resume): Fragment[] {
  return [
    ...resume.experiences.flatMap((entry) => [
      { text: entry.description, source: { section: 'Experience' as const, id: entry.id, field: 'description', label: entry.company.trim() || entry.title.trim() || 'Work experience' }, applied: true },
      { text: entry.title, source: { section: 'Experience' as const, id: entry.id, field: 'title', label: entry.company.trim() || 'Work experience' }, applied: false },
    ]),
    ...resume.projects.flatMap((entry) => [
      { text: entry.description, source: { section: 'Projects' as const, id: entry.id, field: 'description', label: entry.name.trim() || 'Project' }, applied: true },
      { text: entry.name, source: { section: 'Projects' as const, id: entry.id, field: 'name', label: entry.name.trim() || 'Project' }, applied: false },
    ]),
    { text: resume.skills, source: { section: 'Skills', field: 'skills', label: 'Skills' }, applied: false },
    { text: resume.summary, source: { section: 'Contact', field: 'summary', label: 'Summary' }, applied: false },
    ...resume.education.flatMap((entry) => ['degree', 'field'].map((field) => ({ text: entry[field as 'degree' | 'field'], source: { section: 'Education' as const, id: entry.id, field, label: entry.school.trim() || 'Education' }, applied: false }))),
  ]
}

function isNegated(text: string, start: number) {
  const preceding = text.slice(Math.max(0, start - 65), start).split(/[.!?\n]/).at(-1) ?? ''
  return /(?:\bno\s+(?:(?:prior|professional|hands-on)\s+)?(?:experience|knowledge|exposure)\s+(?:with|in|of|using)\s*|\b(?:never|not|haven['’]t|have not|did not)\s+(?:used|worked with|learned)\s*)$/iu.test(preceding)
}

function writingPrompts(parts: Fragment[]): WritingPrompt[] {
  return parts.filter((part) => part.applied).flatMap((part) => part.text.split('\n').filter((line) => line.trim()).map((line) => {
    const plain = line.trim().replace(/^[-•]\s*/, '')
    const wordCount = plain.match(/[\p{L}\p{N}]+/gu)?.length ?? 0
    const vague = /^(?:responsible for|worked on|helped with|assisted with|involved in)\b/iu.test(plain)
    const outcome = /(?:\d|%|\b(?:reduc\w*|increas\w*|improv\w*|saved|enabled|supported|shipped|launched|used by|result\w*|so that|allow\w*)\b)/iu.test(plain)
    const question = vague ? 'What part did you own, and what did you build or change?'
      : wordCount <= 6 && !outcome ? 'What did this do, who used it, or what problem did it solve?'
        : !outcome ? 'What changed because of this work? Add an outcome you can support; a number is not required.' : null
    return question ? { excerpt: line.trim(), question, source: part.source } : null
  }).filter((prompt) => prompt !== null)).slice(0, 6)
}

export function analyzeJobPosting(posting: string, resume: Resume, manualPhrases: string[] = []): { matches: JobMatch[]; prompts: WritingPrompt[]; unmatchedManualPhrases: string[] } {
  const parts = fragments(resume)
  const found = skills.map((item) => ({ item, match: findSkill(posting, item), manual: false })).filter((item) => item.match !== null)
  const unmatchedManualPhrases: string[] = []
  const seenManual = new Set<string>()
  for (const rawPhrase of manualPhrases.slice(0, 20)) {
    const phrase = rawPhrase.trim().replace(/\s+/g, ' ')
    const normalized = normalize(phrase)
    if (!normalized || phrase.length > 80 || seenManual.has(normalized)) continue
    seenManual.add(normalized)
    const match = findPhrase(posting, phrase)
    if (!match) { unmatchedManualPhrases.push(phrase); continue }
    const existing = found.some(({ item }) => item.aliases.some((alias) => normalize(alias) === normalized))
    if (!existing) found.push({ item: skill(phrase), match, manual: true })
  }
  const matches = found.sort((a, b) => a.match.start - b.match.start).map(({ item, match, manual }): JobMatch => {
    const evidence = parts.flatMap((part) => {
      const occurrence = findSkill(part.text, item, true)
      if (!occurrence) return []
      return [{ excerpt: excerpt(part.text, occurrence.start, occurrence.end), source: part.source, applied: part.applied }]
    })
    return {
      phrase: item.phrase,
      postingExcerpt: excerpt(posting, match.start, match.end),
      status: evidence.some((item) => item.applied) ? 'experience' : evidence.length ? 'listed' : 'missing',
      evidence: evidence.slice(0, 3).map(({ excerpt, source }) => ({ excerpt, source })),
      manual,
    }
  })
  return { matches, prompts: writingPrompts(parts), unmatchedManualPhrases }
}
