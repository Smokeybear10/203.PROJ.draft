export function POST() {
  return Response.json(
    { detail: 'AI review is not enabled on this site. Standard review is available.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
