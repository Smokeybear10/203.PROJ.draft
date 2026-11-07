import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { extractResume, MAX_UPLOAD_BYTES, readUploadForm, ReviewInputError } from './extract.ts'

function pdf(text, pageCount = 1) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  for (let index = 0; index < pageCount; index++) {
    const content = `BT /F1 12 Tf 50 750 Td (${text.replace(/[\\()]/g, '\\$&')}) Tj ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`)
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`)
  }
  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => { body += `${String(offset).padStart(10, '0')} 00000 n \n` })
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new File([body], 'resume.PDF', { type: 'application/pdf' })
}

async function docx(text, expandedExtra = 0) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escaped}</w:t></w:r></w:p></w:body></w:document>`)
  if (expandedExtra) zip.file('word/padding.bin', Buffer.alloc(expandedExtra))
  return new File([await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })], 'resume.DOCX')
}

const inputError = (error) => error instanceof ReviewInputError && error.status === 400

test('parses actual PDF and DOCX bytes with uppercase extensions', async () => {
  const pdfResult = await extractResume(pdf('Alex Example Resume - React Python'))
  assert.match(pdfResult.text, /Alex Example Resume/)
  assert.equal(pdfResult.pageCount, 1)
  const docxResult = await extractResume(await docx('Alex Example Resume - React Python'))
  assert.match(docxResult.text, /Alex Example Resume/)
  assert.equal(docxResult.pageCount, null)
})

test('rejects corrupt files, empty content, and unsupported formats', async () => {
  for (const file of [new File(['broken'], 'resume.pdf'), new File(['broken'], 'resume.docx'), new File(['resume'], 'resume.txt'), new File([], 'resume.pdf'), await docx(''), pdf('')]) {
    await assert.rejects(extractResume(file), inputError)
  }
})

test('rejects oversized uploads before parsing', async () => {
  const file = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'resume.pdf')
  await assert.rejects(extractResume(file), (error) => error instanceof ReviewInputError && error.status === 413)
})

test('rejects PDF page excess and excessive extracted text', async () => {
  await assert.rejects(extractResume(pdf('Resume', 21)), /up to 20 pages/)
  await assert.rejects(extractResume(await docx('x'.repeat(100_001))), /100,000 characters/)
})

test('rejects compressed DOCX expansion before Mammoth processes it', async () => {
  const file = await docx('Resume', 17 * 1024 * 1024)
  assert(file.size < MAX_UPLOAD_BYTES)
  await assert.rejects(extractResume(file), /expands beyond/)
})

test('bounds chunked multipart uploads without trusting Content-Length', async () => {
  const request = new Request('http://localhost/api/analyze', {
    method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_UPLOAD_BYTES + 70_000)); controller.close() } }), duplex: 'half',
  })
  await assert.rejects(readUploadForm(request), (error) => error instanceof ReviewInputError && error.status === 413)
})
