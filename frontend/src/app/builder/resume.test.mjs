import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyResume, parseStoredResume, resumeExportError, serializeResume } from './resume.ts'

test('stored draft preserves every section, Unicode, line breaks and selected layout', () => {
  const resume = {
    ...emptyResume,
    name: 'Zoë 李', email: 'zoe@example.com', phone: '+1 555 0100', location: 'Montréal',
    website: 'https://example.com', summary: 'First line.\nSecond line.', skills: 'C++, TypeScript', template: 'Classic',
    experiences: [{ id: 'work', company: 'Example', title: 'Engineer', startDate: '2022', endDate: 'Present', description: 'Built tools.\nSaved 20 hours.' }],
    education: [{ id: 'school', school: 'Example University', degree: 'BSc', field: 'Computer Science', year: '2022' }],
    projects: [{ id: 'project', name: 'Tracker', description: 'Open-source project.', link: 'https://example.com/project' }],
  }
  assert.deepEqual(parseStoredResume(serializeResume(resume)), resume)
})

test('empty optional lists survive storage without reintroducing removed entries', () => {
  const resume = { ...emptyResume, experiences: [], education: [], projects: [] }
  assert.deepEqual(parseStoredResume(serializeResume(resume)), resume)
})

test('malformed and unsupported saved drafts are rejected without throwing', () => {
  for (const raw of ['{', 'null', '[]', '{}', JSON.stringify({ version: 2, resume: emptyResume }), JSON.stringify({ version: 1, resume: { name: 'Alex' } })]) {
    assert.equal(parseStoredResume(raw), null)
  }
})

test('corrupt field types, template names and duplicate entry ids are rejected', () => {
  for (const changes of [
    { skills: 4 }, { template: 'Unknown' }, { education: [{ id: 'a', school: 'Only one field' }] },
    { experiences: [emptyResume.experiences[0], emptyResume.experiences[0]] },
    { projects: [{ ...emptyResume.projects[0], id: '' }] },
  ]) {
    assert.equal(parseStoredResume(JSON.stringify({ version: 1, resume: { ...emptyResume, ...changes } })), null)
  }
})

test('export requires a real name and email but permits incomplete optional sections', () => {
  assert.equal(resumeExportError(emptyResume)?.field, 'name')
  assert.equal(resumeExportError({ ...emptyResume, name: '   ' })?.field, 'name')
  for (const email of ['', 'alex', 'alex@', 'alex@example', 'alex @example.com']) {
    assert.equal(resumeExportError({ ...emptyResume, name: 'Alex', email })?.field, 'email')
  }
  assert.equal(resumeExportError({ ...emptyResume, name: ' Alex ', email: 'alex+work@example.com' }), null)
})


test('export rejects broken or unsafe links and identifies the project to correct', () => {
  const resume = { ...emptyResume, name: 'Alex', email: 'alex@example.com' }
  for (const website of ['example.com', 'javascript:alert(1)', 'mailto:alex@example.com', 'https://']) {
    assert.equal(resumeExportError({ ...resume, website })?.field, 'website')
  }
  const project = { ...emptyResume.projects[0], id: 'target', link: 'example.com' }
  assert.equal(resumeExportError({ ...resume, projects: [project] })?.projectId, 'target')
  assert.equal(resumeExportError({ ...resume, website: 'https://example.com', projects: [{ ...project, link: 'https://example.com/work' }] }), null)
})
