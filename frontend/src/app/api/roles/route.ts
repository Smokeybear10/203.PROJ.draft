import roles from '@/lib/resume-review/roles.json'

export function GET() {
  return Response.json(roles)
}
