// Prompt -> transparent emoji PNG, shared by the website (generate-emoji) and
// the Slack app (slack-command) so both use one cache and one set of limits.
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

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const MODEL = Deno.env.get('IMAGE_MODEL') ?? 'gpt-image-2'
const FALLBACK_MODEL = 'gpt-image-1-mini'
const QUALITY = Deno.env.get('IMAGE_QUALITY') ?? 'low'
export const PER_VISITOR = Number(Deno.env.get('DAILY_LIMIT_PER_VISITOR') ?? 15)
const GLOBAL = Number(Deno.env.get('DAILY_LIMIT_GLOBAL') ?? 300)
export const BUCKET = 'generation-cache'
export const MAX_PROMPT = 200

export const STYLES: Record<string, string> = {
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
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
}

/** Collapses whitespace; the result is what gets cached and generated. */
export const cleanPrompt = (text: string) => text.trim().replace(/\s+/g, ' ')

export type GenerateOutcome =
  | { ok: true; png: Uint8Array<ArrayBuffer>; cacheKey: string; cached: boolean; remaining: number | null }
  | { ok: false; status: number; error: string; reason?: 'visitor' | 'global' }

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

/**
 * Returns the emoji for `subject` from the cache, or generates it if `visitor`
 * (a daily hash identifying the requester) and the site are under their limits.
 */
export async function generateEmoji(
  admin: SupabaseClient,
  visitor: string,
  subject: string,
  style: string,
): Promise<GenerateOutcome> {
  if (!Deno.env.get('OPENAI_API_KEY')) return { ok: false, status: 503, error: 'AI generation is not set up yet' }
  if (!Object.hasOwn(STYLES, style)) style = 'flat'
  if (!subject) return { ok: false, status: 400, error: 'Describe the emoji you want' }
  if (subject.length > MAX_PROMPT) {
    return { ok: false, status: 400, error: `Keep the description under ${MAX_PROMPT} characters` }
  }

  const day = new Date().toISOString().slice(0, 10)
  const cacheKey = await sha256(`${MODEL}|${QUALITY}|${style}|${subject.toLowerCase()}`)
  const path = `${cacheKey}.png`
  const since = `${day}T00:00:00Z`

  // 1. Cache hit: free, and doesn't count against anyone's limit.
  const cached = await admin.storage.from(BUCKET).download(path)
  if (cached.data) {
    await admin
      .from('generation_log')
      .insert({ visitor_hash: visitor, cache_key: cacheKey, cache_hit: true, model: MODEL, quality: QUALITY })
    return { ok: true, png: new Uint8Array(await cached.data.arrayBuffer()), cacheKey, cached: true, remaining: null }
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
    return {
      ok: false,
      status: 429,
      error: `You've used today's ${PER_VISITOR} AI generations. Uploads still work.`,
      reason: 'visitor',
    }
  }
  if ((everyone ?? 0) >= GLOBAL) {
    return { ok: false, status: 429, error: 'AI generation is busy for today. Try again tomorrow.', reason: 'global' }
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
    // Out of OpenAI credit or bad key: retrying won't help, so say so.
    const unavailable = res.status === 401 || /insufficient_quota|billing|credit/i.test(detail)
    return {
      ok: false,
      status: blocked ? 400 : unavailable ? 503 : 502,
      error: blocked
        ? "That description can't be generated. Try wording it differently."
        : unavailable
          ? 'AI generation is unavailable right now. Uploads still work.'
          : 'Generation failed. Try again.',
    }
  }
  const result = await res.json()
  const b64: string | undefined = result.data?.[0]?.b64_json
  if (!b64) {
    await release()
    return { ok: false, status: 502, error: 'Generation failed. Try again.' }
  }
  const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

  await admin.storage.from(BUCKET).upload(path, png, { contentType: 'image/png', upsert: true })

  return { ok: true, png, cacheKey, cached: false, remaining: Math.max(0, PER_VISITOR - (mine ?? 0) - 1) }
}
