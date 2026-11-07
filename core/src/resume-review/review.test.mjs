import test from 'node:test'
import assert from 'node:assert/strict'
import { containsKeyword, detectSections, reviewResume } from './review.ts'

const resume = `Alex Example
alex@example.com
Summary
Developer building internal applications with product teams.
Work Experience
Example Company, 2022–2026
• Developed a React dashboard and reduced response time by 20 percent.
Education
Bachelor of Science, Example University
Technical Skills
JavaScript, React, Python, R, C++, C#, SQL`

test('skill matching respects word boundaries and punctuation', () => {
  assert.equal(containsKeyword('Senior researcher using React and JavaScript', 'R'), false)
  assert.equal(containsKeyword('R&D team', 'R'), false)
  assert.equal(containsKeyword('JavaScript engineer', 'Java'), false)
  assert.equal(containsKeyword('Python, R, SQL', 'R'), true)
  assert.equal(containsKeyword('C++, C#', 'C++'), true)
  assert.equal(containsKeyword('C++, C#', 'C#'), true)
  assert.equal(containsKeyword('machine\nlearning', 'Machine Learning'), true)
})

test('section recognition handles title case and does not count prose or substrings', () => {
  assert.equal(detectSections(resume).filter((section) => section.found).length, 4)
  assert.equal(detectSections('A developer with experience in education software and skills tooling.').some((section) => section.found), false)
  assert.equal(detectSections('Educationism\nExperience-based products\nSkilling').some((section) => section.found), false)
  assert.equal(detectSections(resume.replace('Education\nBachelor of Science, Example University\n', '')).find((section) => section.name === 'Education').found, false)
})

test('review reports file-derived evidence and changes keyword matches with input', () => {
  const relevant = reviewResume(resume, ['React', 'Java', 'R'], 1)
  const different = reviewResume(resume.replace('React', 'Vue').replace(', R,', ', Julia,'), ['React', 'Java', 'R'], 1)
  assert.deepEqual(relevant.keyword_match.found_skills, ['React', 'R'])
  assert.deepEqual(relevant.keyword_match.missing_skills, ['Java'])
  assert.notEqual(relevant.keyword_match.score, different.keyword_match.score)
  assert.equal(relevant.evidence.page_count, 1)
  assert.equal(relevant.evidence.extracted_text, resume)
  assert(relevant.evidence.word_count > 20)
})

test('Unicode bullet characters are recognized without requiring ASCII hyphens', () => {
  const result = reviewResume(resume, ['React'])
  assert.equal(result.suggestions.some((text) => text.startsWith('No bullet markers')), false)
})
