import { getData } from 'pdf-parse/worker'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import JSZip from 'jszip'

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 64 * 1024
const MAX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024
const MAX_TEXT_CHARACTERS = 100_000
const MAX_PDF_PAGES = 20

PDFParse.setWorker(getData())

export class ReviewInputError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ReviewInputError'
    this.status = status
  }
}

export async function readUploadForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.startsWith('multipart/form-data')) throw new ReviewInputError('Upload a PDF or DOCX file using the review form.')
  if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) throw new ReviewInputError('Upload a file smaller than 4 MB.', 413)
  if (!request.body) throw new ReviewInputError('Choose a PDF or DOCX file.')

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel()
        throw new ReviewInputError('Upload a file smaller than 4 MB.', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  try {
    return await new Response(Buffer.concat(chunks), { headers: { 'content-type': contentType } }).formData()
  } catch {
    throw new ReviewInputError('The upload could not be read. Choose your file and try again.')
  }
}

export function validateFile(value: FormDataEntryValue | null): File {
  if (!(value instanceof File)) throw new ReviewInputError('Choose a PDF or DOCX file.')
  if (!/\.(pdf|docx)$/i.test(value.name)) throw new ReviewInputError('Unsupported file type. Upload PDF or DOCX.')
  if (!value.size) throw new ReviewInputError('This file is empty. Choose a PDF or DOCX with selectable text.')
  if (value.size > MAX_UPLOAD_BYTES) throw new ReviewInputError('Upload a file smaller than 4 MB.', 413)
  return value
}

async function checkDocxArchive(buffer: Buffer): Promise<void> {
  const archive = await JSZip.loadAsync(buffer)
  const entries = Object.values(archive.files).filter((entry) => !entry.dir)
  if (!archive.file('word/document.xml') || !archive.file('[Content_Types].xml')) throw new ReviewInputError('This file is not a valid DOCX document.')
  if (entries.length > 256) throw new ReviewInputError('This document is too complex to review. Export a simpler PDF or DOCX.')
  let expandedSize = 0
  for (const entry of entries) {
    const stream = (entry as JSZip.JSZipObject & {
      internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>
    }).internalStream('uint8array')
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk) => {
        expandedSize += chunk.byteLength
        if (expandedSize > MAX_UNCOMPRESSED_BYTES) {
          stream.pause()
          reject(new ReviewInputError('This document expands beyond the review limit. Export a simpler PDF or DOCX.'))
        }
      })
      stream.on('end', resolve)
      stream.on('error', reject)
      stream.resume()
    })
  }
}

export async function extractResume(file: File): Promise<{ text: string; pageCount: number | null }> {
  validateFile(file)
  const buffer = Buffer.from(await file.arrayBuffer())
  let text: string
  let pageCount: number | null = null

  try {
    if (/\.pdf$/i.test(file.name)) {
      if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new ReviewInputError('This file is not a valid PDF document.')
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      try {
        const info = await parser.getInfo()
        if (info.total > MAX_PDF_PAGES) throw new ReviewInputError('Resume review supports PDFs up to 20 pages.')
        const result = await parser.getText({ pageJoiner: '\n\n' })
        text = result.text
        pageCount = result.total
      } finally {
        await parser.destroy()
      }
    } else {
      await checkDocxArchive(buffer)
      text = (await mammoth.extractRawText({ buffer })).value
    }
  } catch (error) {
    if (error instanceof ReviewInputError) throw error
    throw new ReviewInputError('We couldn’t read this file. Upload a valid, unencrypted PDF or DOCX with selectable text.')
  }

  text = text.replace(/\u0000/g, '').trim()
  if (!text) throw new ReviewInputError('No readable text was found. Scanned images are not supported; export a PDF or DOCX with selectable text.')
  if (text.length > MAX_TEXT_CHARACTERS) throw new ReviewInputError('This document contains too much text for a resume review. Limit it to 100,000 characters.')
  return { text, pageCount }
}
