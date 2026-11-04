import roles from '@/lib/resume-review/roles.json'
import type { JobRoles } from '@/lib/resume-review/types'
import { extractResume, readUploadForm, ReviewInputError, validateFile } from '@/lib/resume-review/extract'
import { reviewResume } from '@/lib/resume-review/review'

export const runtime = 'nodejs'
export const maxDuration = 60
const profiles: JobRoles = roles
const headers = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  try {
    const form = await readUploadForm(request)
    const category = form.get('job_category')
    const role = form.get('job_role')
    if (typeof category !== 'string' || typeof role !== 'string'
      || !Object.hasOwn(profiles, category) || !Object.hasOwn(profiles[category], role)) {
      throw new ReviewInputError('Choose a valid field and role.')
    }
    const file = validateFile(form.get('file'))
    const { text, pageCount } = await extractResume(file)
    return Response.json(reviewResume(text, profiles[category][role].required_skills, pageCount), { headers })
  } catch (error) {
    if (error instanceof ReviewInputError) return Response.json({ detail: error.message }, { status: error.status, headers })
    return Response.json({ detail: 'We couldn’t complete the review. Please try again.' }, { status: 500, headers })
  }
}
