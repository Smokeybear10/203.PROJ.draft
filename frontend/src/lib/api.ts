import type { JobRoles, ResumeAnalysis, ReviewEvidence } from './resume-review/types'
export type { JobRole, JobRoles, ResumeAnalysis } from './resume-review/types'

const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ?? ''
const API_URL = configuredUrl ? (configuredUrl.endsWith('/api') ? configuredUrl : `${configuredUrl}/api`) : '/api'

export type AIResumeAnalysis = {
  resume_score: number
  ats_score: number
  analysis: string
  strengths: string[]
  weaknesses: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  init.signal?.addEventListener('abort', onAbort, { once: true })
  if (init.signal?.aborted) controller.abort()
  const timeout = setTimeout(() => controller.abort(), 90_000)

  try {
    let response: Response
    try {
      response = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal })
    } catch {
      if (init.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
      if (controller.signal.aborted) throw new Error('The review service took too long to respond. Please try again.')
      throw new Error('We couldn’t reach the review service. Please try again in a moment.')
    }

    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status === 400 && isRecord(payload) && typeof payload.detail === 'string') {
        throw new Error(payload.detail)
      }
      if (response.status === 413) throw new Error('This file is too large. Try a smaller PDF or DOCX file.')
      if (response.status === 422) throw new Error('Check the selected file and role, then try again.')
      if (path === '/analyze/ai') throw new Error('AI review is unavailable right now. You can still use Standard review.')
      throw new Error('The review service couldn’t complete this request. Please try again.')
    }
    return payload
  } finally {
    clearTimeout(timeout)
    init.signal?.removeEventListener('abort', onAbort)
  }
}

export async function getRoles(signal?: AbortSignal): Promise<JobRoles> {
  const data = await request('/roles', { signal })
  if (!isRecord(data) || Object.keys(data).length === 0) throw new Error('The list of roles is unavailable. Please try again.')

  const roles: JobRoles = {}
  for (const [category, entries] of Object.entries(data)) {
    if (!isRecord(entries) || Object.keys(entries).length === 0) throw new Error('The list of roles is unavailable. Please try again.')
    roles[category] = {}
    for (const [name, role] of Object.entries(entries)) {
      if (!isRecord(role) || typeof role.description !== 'string' || !isStringArray(role.required_skills)) {
        throw new Error('The list of roles is unavailable. Please try again.')
      }
      roles[category][name] = { description: role.description, required_skills: role.required_skills }
    }
  }
  return roles
}

export async function analyzeResume(file: File, category: string, role: string, signal?: AbortSignal): Promise<ResumeAnalysis> {
  const form = new FormData()
  form.append('file', file)
  form.append('job_category', category)
  form.append('job_role', role)
  const data = await request('/analyze', { method: 'POST', body: form, signal })

  if (!isRecord(data) || !isScore(data.ats_score) || !isScore(data.format_score) || !isScore(data.section_score)
    || !isStringArray(data.suggestions) || typeof data.document_type !== 'string'
    || !isRecord(data.keyword_match) || !isScore(data.keyword_match.score)
    || !isStringArray(data.keyword_match.found_skills) || !isStringArray(data.keyword_match.missing_skills)) {
    throw new Error('The review returned an incomplete result. Please try again.')
  }

  return {
    ats_score: data.ats_score,
    format_score: data.format_score,
    section_score: data.section_score,
    document_type: data.document_type,
    suggestions: data.suggestions,
    ...(isEvidence(data.evidence) ? { evidence: data.evidence } : {}),
    keyword_match: {
      score: data.keyword_match.score,
      found_skills: data.keyword_match.found_skills,
      missing_skills: data.keyword_match.missing_skills,
    },
  }
}

export async function analyzeResumeAI(file: File, role: string, jobDescription: string, signal?: AbortSignal): Promise<AIResumeAnalysis> {
  const form = new FormData()
  form.append('file', file)
  form.append('job_role', role)
  form.append('job_description', jobDescription)
  const data = await request('/analyze/ai', { method: 'POST', body: form, signal })

  if (!isRecord(data) || !isScore(data.resume_score) || !isScore(data.ats_score)
    || typeof data.analysis !== 'string' || !isStringArray(data.strengths) || !isStringArray(data.weaknesses)
    || (!data.analysis.trim() && data.strengths.length === 0 && data.weaknesses.length === 0)) {
    throw new Error('The AI review returned an incomplete result. Please try again.')
  }

  return {
    resume_score: data.resume_score,
    ats_score: data.ats_score,
    analysis: data.analysis,
    strengths: data.strengths,
    weaknesses: data.weaknesses,
  }
}

function isEvidence(value: unknown): value is ReviewEvidence {
  return isRecord(value) && typeof value.word_count === 'number' && Number.isInteger(value.word_count) && value.word_count >= 0
    && (value.page_count === null || (typeof value.page_count === 'number' && Number.isInteger(value.page_count) && value.page_count > 0))
    && typeof value.extracted_text === 'string' && Array.isArray(value.sections)
    && value.sections.every((section) => isRecord(section) && typeof section.name === 'string' && typeof section.found === 'boolean')
}

export async function getReviewCapabilities(signal?: AbortSignal): Promise<{ ai: boolean }> {
  try {
    const data = await request('/capabilities', { signal })
    return { ai: isRecord(data) && data.ai === true }
  } catch {
    return { ai: false }
  }
}
