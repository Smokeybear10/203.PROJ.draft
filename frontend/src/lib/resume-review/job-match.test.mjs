import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeJobPosting } from './job-match.ts'
import { emptyResume } from '../../app/builder/resume.ts'

const resume = (changes = {}) => ({ ...structuredClone(emptyResume), ...changes })
const names = (posting) => analyzeJobPosting(posting, resume()).matches.map((match) => match.phrase)

test('technical terms respect boundaries and do not infer related languages', () => {
  const found = names('JavaScript, TypeScript, React Native, C++, C#, Objective-C, R&D, PostgreSQL, Next.js, and Node.js.')
  for (const phrase of ['JavaScript', 'TypeScript', 'React Native', 'C++', 'C#', 'PostgreSQL', 'Next.js', 'Node.js']) assert.ok(found.includes(phrase), phrase)
  for (const phrase of ['Java', 'C', 'R', 'SQL', 'React']) assert.ok(!found.includes(phrase), phrase)
})

test('short languages and spelling variants match without matching ordinary prose', () => {
  const found = names('Languages: c, r, java, sql. Experience with go. react.js, NEXTJS, Postgres, K8s, Amazon Web Services and CI/CD.')
  for (const phrase of ['C', 'R', 'Java', 'SQL', 'Go', 'React', 'Next.js', 'PostgreSQL', 'Kubernetes', 'AWS', 'CI/CD']) assert.ok(found.includes(phrase), phrase)
  assert.deepEqual(names('Go to the next stage. React to feedback and work with the rest of the team. Express your ideas.'), [])
  assert.deepEqual(names('Experience as a go-to person for customers.'), [])
  assert.deepEqual(names('Minimum grade C. Series C company. Class R license.'), [])
  assert.ok(names('C++17 is required.').includes('C++'))
  const go = analyzeJobPosting('Go to the office.\nGolang experience is welcome.', resume()).matches.find((match) => match.phrase === 'Go')
  assert.equal(go.postingExcerpt, 'Golang experience is welcome.')
})

test('every match cites original posting and exact resume text with an editable source', () => {
  const posting = 'Required experience\nBuild accessible interfaces with React and TypeScript.\nUse PostgreSQL for application data.'
  const draft = resume({
    experiences: [{ id: 'job-1', company: 'Example', title: 'Developer', startDate: '', endDate: '', description: 'Built a React dashboard for the support team.\nReduced load times by 30%.' }],
    skills: 'TypeScript, Python',
  })
  const result = analyzeJobPosting(posting, draft)
  const react = result.matches.find((match) => match.phrase === 'React')
  assert.equal(react.status, 'experience')
  assert.equal(react.postingExcerpt, 'Build accessible interfaces with React and TypeScript.')
  assert.deepEqual(react.evidence[0], { excerpt: 'Built a React dashboard for the support team.', source: { section: 'Experience', id: 'job-1', field: 'description', label: 'Example' } })
  assert.equal(result.matches.find((match) => match.phrase === 'TypeScript').status, 'listed')
  assert.equal(result.matches.find((match) => match.phrase === 'PostgreSQL').status, 'missing')
  assert.ok(result.matches.every((match) => posting.includes(match.postingExcerpt)))
})

test('applied project descriptions take priority over a skills-only mention', () => {
  const draft = resume({
    skills: 'Python',
    projects: [{ id: 'project-1', name: 'Data tool', description: 'Wrote a Python script to validate incoming data.', link: '' }],
  })
  const match = analyzeJobPosting('Python is useful.', draft).matches[0]
  assert.equal(match.status, 'experience')
  assert.equal(match.evidence[0].source.section, 'Projects')
  assert.equal(match.evidence[1].source.section, 'Skills')
})

test('company names, URLs, and explicit lack of experience are not skill evidence', () => {
  const draft = resume({
    website: 'https://react.example.com',
    experiences: [{ id: 'job-1', company: 'React Labs', title: 'Developer', startDate: '', endDate: '', description: 'No professional experience with React.\nHave not used PostgreSQL.' }],
  })
  const matches = analyzeJobPosting('React and PostgreSQL.', draft).matches
  assert.ok(matches.every((match) => match.status === 'missing'))
  assert.ok(matches.every((match) => match.evidence.length === 0))
})

test('a negated first occurrence does not hide later experience', () => {
  const draft = resume({ projects: [{ id: 'p', name: 'Tool', link: '', description: 'No experience with React. Built a React interface as a personal project.' }] })
  const match = analyzeJobPosting('React.', draft).matches[0]
  assert.equal(match.status, 'experience')
  assert.ok(match.evidence[0].excerpt.includes('Built a React interface'))
})

test('manual phrases come from the posting and remain tied to exact user text', () => {
  const draft = resume({ summary: 'I write technical documentation for internal teams.' })
  const result = analyzeJobPosting('You will write technical documentation and work with Postgres.', draft, ['technical documentation', 'TECHNICAL DOCUMENTATION', 'Postgres', 'invented requirement'])
  assert.equal(result.matches.filter((match) => match.phrase === 'technical documentation').length, 1)
  assert.equal(result.matches.filter((match) => match.phrase === 'PostgreSQL').length, 1)
  assert.equal(result.matches.find((match) => match.phrase === 'technical documentation').status, 'listed')
  assert.deepEqual(result.unmatchedManualPhrases, ['invented requirement'])
  assert.deepEqual(analyzeJobPosting('', draft, ['Python']).matches, [])
})

test('long excerpts stay exact and focused on the matched phrase', () => {
  const posting = `${'Company background. '.repeat(45)}Use PostgreSQL to manage application data. ${'Benefits and team culture. '.repeat(45)}`
  const match = analyzeJobPosting(posting, resume()).matches.find((match) => match.phrase === 'PostgreSQL')
  assert.ok(match.postingExcerpt.includes('PostgreSQL'))
  assert.ok(posting.includes(match.postingExcerpt))
  assert.ok(match.postingExcerpt.length <= 320)
})

test('writing prompts ask for missing context without generating accomplishments', () => {
  const draft = resume({ projects: [{ id: 'p', name: 'Website', link: '', description: 'Worked on a website.\nBuilt a React app.\nCreated a dashboard for the internal support team.\nReduced loading time by 30%.' }] })
  const result = analyzeJobPosting('React', draft)
  assert.equal(result.prompts.length, 3)
  assert.ok(result.prompts[0].question.includes('What part did you own'))
  assert.ok(result.prompts[1].question.includes('who used it'))
  assert.ok(result.prompts[2].question.includes('a number is not required'))
  assert.ok(result.prompts.every((prompt) => draft.projects[0].description.includes(prompt.excerpt)))
  assert.ok(result.prompts.every((prompt) => !/\d/.test(prompt.question)))
})
