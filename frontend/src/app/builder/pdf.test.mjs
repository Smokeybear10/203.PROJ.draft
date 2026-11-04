import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PDFParse } from 'pdf-parse'
import { createResumePdf, resumePdfFilename } from './pdf.ts'

const fontRoot = fileURLToPath(new URL('../../../public/fonts', import.meta.url))
const resume = {
  name: 'Zoë Nguyễn García', email: 'zoe@example.com', phone: '', location: 'Montréal', website: 'https://example.com',
  summary: 'Engineer working on accessible interfaces — with measurable results.', skills: 'TypeScript, React, C++', template: 'Modern',
  experiences: [{ id: 'experience-1', company: 'Example Studio', title: 'Engineer', startDate: '2022', endDate: 'Present', description: 'Built a reporting tool.\nReduced preparation from four hours to one.' }],
  education: [{ id: 'education-1', school: 'Université de Montréal', degree: 'B.S.', field: 'Computer Science', year: '2022' }],
  projects: [],
}

async function readPdf(data) {
  const blob = await createResumePdf(data, fontRoot)
  assert.equal(blob.type, 'application/pdf')
  const parser = new PDFParse({ data: new Uint8Array(await blob.arrayBuffer()) })
  try {
    return await parser.getText()
  } finally {
    await parser.destroy()
  }
}

for (const template of ['Modern', 'Classic', 'Minimal', 'Technical', 'Executive']) {
  test(`${template} exports selectable Unicode text and omits empty sections`, async () => {
    const result = await readPdf({ ...resume, template })
    assert.equal(result.total, 1)
    for (const text of [resume.name, 'Université de Montréal', 'C++', 'Built a reporting tool.', 'Reduced preparation from four hours to one.']) {
      assert.ok(result.text.includes(text), `Missing text: ${text}`)
    }
    assert.doesNotMatch(result.text, /projects/i)
  })
}

test('long resumes continue across pages without dropping entries', async () => {
  const experiences = Array.from({ length: 20 }, (_, index) => ({
    ...resume.experiences[0], id: `experience-${index}`, title: `Position ${index}`,
    description: Array.from({ length: 5 }, (_, bullet) => `Entry ${index} bullet ${bullet}: Improved a complex technical system with multiple teams through careful engineering, useful documentation, and maintenance.`).join('\n'),
  }))
  const result = await readPdf({ ...resume, experiences })
  assert.ok(result.total > 1)
  for (let index = 0; index < 20; index++) {
    for (let bullet = 0; bullet < 5; bullet++) assert.ok(result.text.includes(`Entry ${index} bullet ${bullet}:`))
  }
})

for (const template of ['Modern', 'Classic', 'Minimal', 'Technical', 'Executive']) {
  test(`${template} preserves Chinese names and mixed Latin, Japanese, and Korean text`, async () => {
    const result = await readPdf({
      ...resume, template, name: '王小明 — Zoë Nguyễn', location: '北京 · 臺灣 · 東京 · 서울',
      summary: '軟體工程師 building accessible software. 日本語のプロジェクト 한국어',
      projects: [{ id: 'project-1', name: '数据分析', description: 'Developed a dashboard for 王小明.', link: 'https://example.com' }],
    })
    for (const value of ['王小明', 'Zoë Nguyễn', '北京', '臺灣', '東京', '서울', '軟體工程師', '日本語のプロジェクト', '한국어', '数据分析']) {
      assert.ok(result.text.includes(value), `Missing text: ${value}`)
    }
  })
}

test('Chinese experience bullets continue across pages without losing text', async () => {
  const sentence = '通过设计可靠的软件系统帮助团队完成复杂项目并改善用户体验。'
  const experiences = Array.from({ length: 20 }, (_, index) => ({
    ...resume.experiences[0], id: `experience-${index}`, title: `工程師 ${index}`, company: '技术团队',
    description: Array.from({ length: 4 }, (_, bullet) => `项目 ${index}-${bullet}：${sentence}`).join('\n'),
  }))
  const result = await readPdf({ ...resume, name: '王小明', experiences })
  assert.ok(result.total > 1)
  assert.equal(result.text.replace(/\s/g, '').split(sentence).length - 1, 80)
  for (let index = 0; index < 20; index++) {
    for (let bullet = 0; bullet < 4; bullet++) assert.ok(result.text.includes(`项目 ${index}-${bullet}：`))
  }
})

test('an oversized unbroken CJK paragraph is rejected instead of exporting incomplete text', async () => {
  const sentence = '通过设计可靠的软件系统帮助团队完成复杂项目并改善用户体验。'
  const input = { ...resume, name: '王小明', summary: sentence.repeat(220) }
  const unchanged = structuredClone(input)
  await assert.rejects(createResumePdf(input, fontRoot), /paragraph.*1,000.*draft has not changed/)
  assert.deepEqual(input, unchanged)
})

test('the 1,000-character CJK boundary preserves every character in order', async () => {
  const sentence = '通过设计可靠的软件系统帮助团队完成复杂项目并改善用户体验。'
  const summary = sentence.repeat(Math.ceil(1000 / sentence.length)).slice(0, 1000)
  const result = await readPdf({ ...resume, summary })
  assert.equal(result.text.replace(/[^\p{Script=Han}。]/gu, ''), summary)
  await assert.rejects(createResumePdf({ ...resume, summary: `${summary}王` }, fontRoot), /paragraph.*1,000/)
})

test('unsupported characters are identified by code point instead of silently omitted', async () => {
  await assert.rejects(createResumePdf({ ...resume, name: '王小明 🧪' }, fontRoot), /🧪 \(U\+1F9EA\)/)
})

test('download names use document titles safely while preserving the default', () => {
  assert.equal(resumePdfFilename('Zoë Nguyễn García'), 'Zoë-Nguyễn-García-resume.pdf')
  assert.equal(resumePdfFilename('王小明', 'Acme — frontend engineer'), 'Acme-—-frontend-engineer.pdf')
  assert.equal(resumePdfFilename('王小明', ' Application.PDF  '), 'Application.pdf')
  assert.equal(resumePdfFilename('王小明', '../../Acme:/Engineer?*\u0000'), 'AcmeEngineer.pdf')
  assert.equal(resumePdfFilename('王小明', 'CON'), 'resume-CON.pdf')
  assert.equal(resumePdfFilename('王小明', '...'), '王小明-resume.pdf')
  assert.equal(resumePdfFilename('王小明', '\u202emypdf'), 'mypdf.pdf')
  assert.equal(resumePdfFilename('王小明', '𠮷'.repeat(100)), `${'𠮷'.repeat(80)}.pdf`)
})


test('Latin stays compact and Latin/CJK font download failures can be retried', () => {
  const moduleUrl = new URL('./pdf.ts', import.meta.url).href
  const script = `
    import assert from 'node:assert/strict'
    import { createServer } from 'node:http'
    import { readFile } from 'node:fs/promises'
    const { createResumePdf } = await import(${JSON.stringify(moduleUrl)})
    const resume = ${JSON.stringify(resume)}
    let failLatin = true
    let failCjk = true
    const requests = []
    const server = createServer(async (request, response) => {
      requests.push(request.url)
      if (request.url.includes('/cjk/') ? failCjk : failLatin) { response.writeHead(503); response.end(); return }
      response.writeHead(200, { 'Content-Type': 'font/ttf' })
      response.end(await readFile(${JSON.stringify(fontRoot)} + request.url))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const root = 'http://127.0.0.1:' + server.address().port
    try {
      await assert.rejects(createResumePdf(resume, root), /fonts.*loaded/)
      const previousRequests = requests.length
      failLatin = false
      const blob = await createResumePdf(resume, root)
      assert.ok(blob.size > 1000 && blob.size < 100000)
      assert.ok(requests.length > previousRequests)
      assert.ok(requests.every((url) => !url.includes('/cjk/')))
      await assert.rejects(createResumePdf({ ...resume, name: '王小明' }, root), /fonts.*loaded/)
      const failedCjkRequests = requests.filter((url) => url.includes('/cjk/')).length
      assert.equal(failedCjkRequests, 6)
      failCjk = false
      const cjkBlob = await createResumePdf({ ...resume, name: '王小明' }, root)
      assert.ok(cjkBlob.size > 1000 && cjkBlob.size < 100000)
      assert.equal(requests.filter((url) => url.includes('/cjk/')).length, failedCjkRequests * 2)
    } finally {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  `
  execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { timeout: 30000, stdio: 'pipe' })
})
