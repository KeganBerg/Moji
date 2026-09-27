// Supabase Edge Function: prompt -> transparent emoji PNG, for the website.
// Caching, limits and the model call live in ../_shared/generate.ts.
//
// Secrets (Dashboard > Edge Functions > Secrets), besides those in _shared:
//   ALLOWED_ORIGINS           comma list, default moji.locker + localhost
//                             (mojilocker.netlify.app and its previews are always allowed)

import { adminClient, cleanPrompt, generateEmoji, sha256 } from '../_shared/generate.ts'

const ALLOWED_ORIGINS = (
  Deno.env.get('ALLOWED_ORIGINS') ??
  'https://moji.locker,https://www.moji.locker,http://localhost:5173,http://localhost:4173'
)
  .split(',')
  .map((s) => s.trim())

// The Netlify site itself and its deploy previews (deploy-preview-N--mojilocker).
const NETLIFY_ORIGIN = /^https:\/\/([a-z0-9-]+--)?mojilocker\.netlify\.app$/

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && (ALLOWED_ORIGINS.includes(origin) || NETLIFY_ORIGIN.test(origin))
  return {
    'Access-Control-Allow-Origin': allowed ? origin! : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Expose-Headers': 'x-moji-cache, x-moji-remaining',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = cors(origin)
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers)
  if (!origin || headers['Access-Control-Allow-Origin'] !== origin) {
    return json({ error: 'Origin not allowed' }, 403, headers)
  }

  const body = await req.json().catch(() => ({}))
  const subject = typeof body.prompt === 'string' ? cleanPrompt(body.prompt) : ''
  const style = typeof body.style === 'string' ? body.style : 'flat'

  const day = new Date().toISOString().slice(0, 10)
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const visitor = await sha256(`${ip}|${day}`)

  const out = await generateEmoji(adminClient(), visitor, subject, style)
  if (!out.ok) return json({ error: out.error, reason: out.reason }, out.status, headers)

  return new Response(out.png, {
    headers: {
      ...headers,
      'Content-Type': 'image/png',
      'x-moji-cache': out.cached ? 'hit' : 'miss',
      ...(out.remaining === null ? {} : { 'x-moji-remaining': String(out.remaining) }),
    },
  })
})
