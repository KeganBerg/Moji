// Supabase Edge Function: prompt -> transparent emoji PNG, for the website.
// Caching, limits and the model call live in ../_shared/generate.ts.
//
// Secrets (Dashboard > Edge Functions > Secrets), besides those in _shared:
//   ALLOWED_ORIGINS           comma list, default moji.locker + localhost
//                             (mojilocker.netlify.app and its previews are always allowed)

import { adminClient, cleanPrompt, generateEmoji, sha256 } from '../_shared/generate.ts'
import { limitKey } from './network.ts'

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
    'Access-Control-Expose-Headers': 'x-moji-cache, x-moji-remaining, x-moji-free-retries',
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
  // Supabase's Cloudflare edge sets cf-connecting-ip itself. The first
  // x-forwarded-for entry is whatever the client sent, so it can't be trusted
  // for limits (a random value per request would get a fresh daily quota).
  const ip =
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    (req.headers.get('x-forwarded-for') ?? '').split(',').at(-1)?.trim() ||
    'unknown'
  const visitor = await sha256(`${limitKey(ip)}|${day}`)
  // Links from the Slack app only ever show an emoji that's already cached, so
  // a link someone else crafted can't spend the visitor's paid generations.
  const cacheOnly = body.cacheOnly === true
  // Try again: a fresh variation of a prompt this visitor was already shown.
  const retry = body.retry === true && !cacheOnly

  const out = await generateEmoji(adminClient(), visitor, subject, style, { cacheOnly, retry })
  if (!out.ok) return json({ error: out.error, reason: out.reason }, out.status, headers)

  return new Response(out.png, {
    headers: {
      ...headers,
      'Content-Type': 'image/png',
      'x-moji-cache': out.cached ? 'hit' : 'miss',
      ...(out.remaining === null ? {} : { 'x-moji-remaining': String(out.remaining) }),
      ...(out.freeRetries === null ? {} : { 'x-moji-free-retries': String(out.freeRetries) }),
    },
  })
})
