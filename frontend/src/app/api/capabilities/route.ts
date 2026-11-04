export function GET() {
  return Response.json({ standard: true, ai: false }, { headers: { 'Cache-Control': 'no-store' } })
}
