// Supabase Edge Function: prompt -> transparent emoji PNG.
//
// Cost controls, cheapest first:
//   1. Cache: the same prompt + style returns the stored image for free.
//   2. Low quality: output is scaled to 128 px, so a low-quality 1024 px render
//      keeps all the detail that survives. Override with IMAGE_QUALITY.
//   3. Limits: DAILY_LIMIT_PER_VISITOR new images per visitor per day, and a
//      DAILY_LIMIT_GLOBAL cap on paid generations across everyone.
//
// Secrets (Dashboard > Edge Functions > Secrets):
//   OPENAI_API_KEY            required
//   IMAGE_MODEL               default gpt-image-2
//   IMAGE_QUALITY             default low
//   DAILY_LIMIT_PER_VISITOR   default 15
//   DAILY_LIMIT_GLOBAL        default 300
//   ALLOWED_ORIGINS           comma list, default moji.locker + localhost

import { createClient } from 'jsr:@supabase/supabase-js@2'

const MODEL = Deno.env.get('IMAGE_MODEL') ?? 'gpt-image-2'
const FALLBACK_MODEL = 'gpt-image-1-mini'
const QUALITY = Deno.env.get('IMAGE_QUALITY') ?? 'low'
const PER_VISITOR = Number(Deno.env.get('DAILY_LIMIT_PER_VISITOR') ?? 15)
const GLOBAL = Number(Deno.env.get('DAILY_LIMIT_GLOBAL') ?? 300)
const ALLOWED_ORIGINS = (
  Deno.env.get('ALLOWED_ORIGINS') ??
  'https://moji.locker,https://www.moji.locker,http://localhost:5173,http://localhost:4173'
)
  .split(',')
  .map((s) => s.trim())
const BUCKET = 'generation-cache'
const MAX_PROMPT = 200

const STYLES: Record<string, string> = {
  flat: 'flat vector emoji, clean solid shapes, subtle gradients, thin dark outline',
  '3d': 'glossy 3D emoji like Apple or Microsoft Fluent emoji, soft lighting, smooth rounded forms',
  pixel: 'crisp pixel art emoji on a 32x32 grid, limited palette, hard edges, no anti-aliasing',
  sticker: 'cartoon sticker with a thick white die-cut border, bold outlines, saturated colors',
  'hand-drawn': 'hand-drawn doodle emoji, confident ink lines, simple flat color fill',
}

// The model draws exactly what is described and nothing else. Keeping the
// template strict (one subject, no scenery, no text) is what stops it from
// inventing extra objects or lettering.
function buildPrompt(subject: string, style: string): string {
  return [
    `A single custom chat emoji of: ${subject}.`,
    `Style: ${STYLES[style] ?? STYLES.flat}.`,
    'Show only the described subject, centered, filling about 90% of a square canvas.',
    'Bold, simple silhouette that stays readable at 32 pixels. High contrast, vibrant colors.',
    'Fully transparent background. No scenery, no frame, no border box, no cast shadow on the background.',
    'Do not add text, letters or numbers unless the description asks for specific words; if it does, spell them exactly.',
  ].join(' ')
}

const encoder = new TextEncoder()
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
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

async function callModel(model: string, prompt: string): Promise<Response> {
  return fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: '1024x1024',
      quality: QUALITY,
      background: 'transparent',
      output_format: 'png',
    }),
  })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = cors(origin)
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers)
  if (!origin || headers['Access-Control-Allow-Origin'] !== origin) {
    return json({ error: 'Origin not allowed' }, 403, headers)
  }
  if (!Deno.env.get('OPENAI_API_KEY')) {
    return json({ error: 'AI generation is not set up yet' }, 503, headers)
  }

  const body = await req.json().catch(() => ({}))
  const subject = typeof body.prompt === 'string' ? body.prompt.trim().replace(/\s+/g, ' ') : ''
  const style = typeof body.style === 'string' && body.style in STYLES ? body.style : 'flat'
  if (!subject) return json({ error: 'Describe the emoji you want' }, 400, headers)
  if (subject.length > MAX_PROMPT) {
    return json({ error: `Keep the description under ${MAX_PROMPT} characters` }, 400, headers)
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const day = new Date().toISOString().slice(0, 10)
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const visitor = await sha256(`${ip}|${day}`)
  const cacheKey = await sha256(`${MODEL}|${QUALITY}|${style}|${subject.toLowerCase()}`)
  const path = `${cacheKey}.png`
  const since = `${day}T00:00:00Z`

  // 1. Cache hit: free, and doesn't count against anyone's limit.
  const cached = await admin.storage.from(BUCKET).download(path)
  if (cached.data) {
    await admin
      .from('generation_log')
      .insert({ visitor_hash: visitor, cache_key: cacheKey, cache_hit: true, model: MODEL, quality: QUALITY })
    return new Response(cached.data, { headers: { ...headers, 'Content-Type': 'image/png', 'x-moji-cache': 'hit' } })
  }

  // 2. Limits on paid generations.
  const [{ count: mine }, { count: everyone }] = await Promise.all([
    admin
      .from('generation_log')
      .select('id', { count: 'exact', head: true })
      .eq('visitor_hash', visitor)
      .eq('cache_hit', false)
      .gte('created_at', since),
    admin
      .from('generation_log')
      .select('id', { count: 'exact', head: true })
      .eq('cache_hit', false)
      .gte('created_at', since),
  ])
  if ((mine ?? 0) >= PER_VISITOR) {
    return json(
      { error: `You've used today's ${PER_VISITOR} AI generations. Uploads still work.`, reason: 'visitor' },
      429,
      headers,
    )
  }
  if ((everyone ?? 0) >= GLOBAL) {
    return json({ error: 'AI generation is busy for today. Try again tomorrow.', reason: 'global' }, 429, headers)
  }

  // 3. Reserve the slot before calling the model so parallel requests can't
  // slip past the limits; released again if generation fails.
  const { data: slot } = await admin
    .from('generation_log')
    .insert({ visitor_hash: visitor, cache_key: cacheKey, cache_hit: false, model: MODEL, quality: QUALITY })
    .select('id')
    .single()
  const release = () => slot && admin.from('generation_log').delete().eq('id', slot.id)

  // 4. Generate.
  const prompt = buildPrompt(subject, style)
  let res = await callModel(MODEL, prompt)
  let detail = res.ok ? '' : await res.text()
  if (res.status === 400 && MODEL !== FALLBACK_MODEL && /background/i.test(detail)) {
    // Transparent backgrounds are in preview on newer models; fall back rather than fail.
    console.warn('primary model rejected transparent background', detail)
    res = await callModel(FALLBACK_MODEL, prompt)
    detail = res.ok ? '' : await res.text()
    if (slot) await admin.from('generation_log').update({ model: FALLBACK_MODEL }).eq('id', slot.id)
  }
  if (!res.ok) {
    await release()
    console.error('image model error', res.status, detail)
    const blocked = res.status === 400 && /safety|moderation|content_policy/i.test(detail)
    return json(
      {
        error: blocked
          ? "That description can't be generated. Try wording it differently."
          : 'Generation failed. Try again.',
      },
      blocked ? 400 : 502,
      headers,
    )
  }
  const result = await res.json()
  const b64: string | undefined = result.data?.[0]?.b64_json
  if (!b64) {
    await release()
    return json({ error: 'Generation failed. Try again.' }, 502, headers)
  }
  const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

  await admin.storage.from(BUCKET).upload(path, png, { contentType: 'image/png', upsert: true })

  return new Response(png, {
    headers: {
      ...headers,
      'Content-Type': 'image/png',
      'x-moji-cache': 'miss',
      'x-moji-remaining': String(Math.max(0, PER_VISITOR - (mine ?? 0) - 1)),
    },
  })
})
