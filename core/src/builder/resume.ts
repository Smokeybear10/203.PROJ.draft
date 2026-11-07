export const TEMPLATES = ['Modern', 'Classic', 'Minimal', 'Technical', 'Executive'] as const

export type Template = typeof TEMPLATES[number]
export type Experience = { id: string; company: string; title: string; startDate: string; endDate: string; description: string }
export type Education = { id: string; school: string; degree: string; field: string; year: string }
export type Project = { id: string; name: string; description: string; link: string }
export type Resume = {
  name: string
  email: string
  phone: string
  location: string
  website: string
  summary: string
  skills: string
  template: Template
  experiences: Experience[]
  education: Education[]
  projects: Project[]
}

export const emptyResume: Resume = {
  name: '', email: '', phone: '', location: '', website: '', summary: '', skills: '', template: 'Modern',
  experiences: [{ id: 'experience-1', company: '', title: '', startDate: '', endDate: '', description: '' }],
  education: [{ id: 'education-1', school: '', degree: '', field: '', year: '' }],
  projects: [{ id: 'project-1', name: '', description: '', link: '' }],
}

export const DRAFT_STORAGE_KEY = 'draft.resume.v1'

const resumeFields = ['name', 'email', 'phone', 'location', 'website', 'summary', 'skills'] as const
const experienceFields = ['id', 'company', 'title', 'startDate', 'endDate', 'description'] as const
const educationFields = ['id', 'school', 'degree', 'field', 'year'] as const
const projectFields = ['id', 'name', 'description', 'link'] as const

function hasStrings<K extends string>(value: unknown, fields: readonly K[]): value is Record<K, string> {
  return typeof value === 'object' && value !== null && fields.every((field) => field in value && typeof value[field as keyof typeof value] === 'string')
}

function hasEntries<K extends string>(value: unknown, fields: readonly K[]): value is Record<K, string>[] {
  if (!Array.isArray(value) || !value.every((item) => hasStrings(item, fields))) return false
  const ids = value.map((item) => (item as Record<string, string>).id)
  return ids.every((id) => Boolean(id)) && new Set(ids).size === ids.length
}

export function parseStoredResume(raw: string): Resume | null {
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof stored !== 'object' || stored === null || !('version' in stored) || stored.version !== 1 || !('resume' in stored)) return null
  const resume = stored.resume
  if (!hasStrings(resume, resumeFields) || !('template' in resume) || !TEMPLATES.some((template) => template === resume.template)) return null
  if (!('experiences' in resume) || !hasEntries(resume.experiences, experienceFields)) return null
  if (!('education' in resume) || !hasEntries(resume.education, educationFields)) return null
  if (!('projects' in resume) || !hasEntries(resume.projects, projectFields)) return null
  return {
    name: resume.name, email: resume.email, phone: resume.phone, location: resume.location,
    website: resume.website, summary: resume.summary, skills: resume.skills,
    template: resume.template as Template,
    experiences: resume.experiences,
    education: resume.education,
    projects: resume.projects,
  }
}

export function serializeResume(resume: Resume): string {
  return JSON.stringify({ version: 1, resume })
}

function isWebUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value.trim()).protocol)
  } catch {
    return false
  }
}

export function resumeExportError(resume: Resume): { field: 'name' | 'email' | 'website' | 'project'; message: string; projectId?: string } | null {
  if (!resume.name.trim()) return { field: 'name', message: 'Add your name before exporting your resume.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resume.email.trim())) return { field: 'email', message: 'Add a valid email address before exporting your resume.' }
  if (resume.website.trim() && !isWebUrl(resume.website)) return { field: 'website', message: 'Use a complete website address starting with https:// or http://.' }
  const project = resume.projects.find((entry) => entry.link.trim() && !isWebUrl(entry.link))
  if (project) return { field: 'project', projectId: project.id, message: 'Use a complete project link starting with https:// or http://.' }
  return null
}
