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
// Quality: every new image is checked (see fit.ts). One that comes back cut
// off at the edge, with its background left in, or blank is redrawn once with
// a stricter prompt before anyone sees it. That redraw doesn't count against
// the visitor, but it does count against DAILY_LIMIT_GLOBAL, so the total
// spend stays capped. Visitors also get FREE_RETRIES_PER_VISITOR free "Try
// again" redraws a day, only for prompts they were already shown today; after
// that, Try again spends a normal generation.
//
// Safety: every description goes through OpenAI's free moderation model
// before anything is looked up or drawn, and the image model runs with its
// own content filter on top.
//
// Secrets (Dashboard > Edge Functions > Secrets):
//   OPENAI_API_KEY            required
//   IMAGE_MODEL               default gpt-image-2
//   IMAGE_QUALITY             default low
//   DAILY_LIMIT_PER_VISITOR   default 15
//   DAILY_LIMIT_GLOBAL        default 300
//   FREE_RETRIES_PER_VISITOR  default 5

import { Image } from 'jsr:@matmen/imagescript@1.3.1'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { checkFit, fitPenalty, type FitReport } from './fit.ts'

const MODEL = Deno.env.get('IMAGE_MODEL') ?? 'gpt-image-2'
const FALLBACK_MODEL = 'gpt-image-1-mini'
const QUALITY = Deno.env.get('IMAGE_QUALITY') ?? 'low'
export const PER_VISITOR = Number(Deno.env.get('DAILY_LIMIT_PER_VISITOR') ?? 15)
const GLOBAL = Number(Deno.env.get('DAILY_LIMIT_GLOBAL') ?? 300)
export const FREE_RETRIES = Number(Deno.env.get('FREE_RETRIES_PER_VISITOR') ?? 5)
export const BUCKET = 'generation-cache'
export const MAX_PROMPT = 200
// Cached images served per visitor per day, as a multiple of PER_VISITOR.
const CACHE_HIT_FACTOR = 10

export const STYLES: Record<string, string> = {
  flat: 'flat vector emoji, clean solid shapes, subtle gradients, thin dark outline',
  '3d': 'glossy 3D emoji like Apple or Microsoft Fluent emoji, soft lighting, smooth rounded forms',
  pixel: 'crisp pixel art emoji on a 32x32 grid, limited palette, hard edges, no anti-aliasing',
  sticker: 'cartoon sticker with a thick white die-cut border, bold outlines, saturated colors',
  'hand-drawn': 'hand-drawn doodle emoji, confident ink lines, simple flat color fill',
}

// Asked of a Try again, so it doesn't come back as the same picture.
const VARIATIONS = [
  'Draw a fresh take: a different pose or angle than the most obvious one.',
  'Draw a fresh take: a different expression and composition than the most obvious one.',
  'Draw a fresh take: simplify the design and change the pose.',
  'Draw a fresh take: a different viewpoint, keeping the subject instantly recognizable.',
]

const MARGIN = 'Nothing touches or is cut off by the canvas edge.'
// After a cut-off or full-tile result: say it louder.
const STRICT_MARGIN =
  'The whole subject, outline included, must sit well inside the canvas: leave clear transparent space on all four sides, and nothing may touch or be cut off by the edge. Never fill the canvas with a background color.'

// The model draws exactly what is described and nothing else. Keeping the
// template strict (one subject, no scenery, no text) is what stops it from
// inventing extra objects or lettering. Exported for tests.
export function buildPrompt(
  subject: string,
  style: string,
  { strict = false, variation = -1 }: { strict?: boolean; variation?: number } = {},
): string {
  return [
    `A single custom chat emoji of: ${subject}.`,
    `Style: ${STYLES[style] ?? STYLES.flat}.`,
    'Show only the described subject, centered, filling about 85% of a square canvas with an even empty margin on every side.',
    strict ? STRICT_MARGIN : MARGIN,
    'Bold, simple silhouette that stays readable at 32 pixels. High contrast, vibrant colors.',
    'Fully transparent background. No scenery, no frame, no border box, no cast shadow on the background.',
    'Do not add text, letters or numbers unless the description asks for specific words; if it does, spell them exactly.',
    ...(variation >= 0 ? [VARIATIONS[variation % VARIATIONS.length]] : []),
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
  | {
      ok: true
      png: Uint8Array<ArrayBuffer>
      cacheKey: string
      cached: boolean
      remaining: number | null
      /** Free Try agains left today, when this request could have used one. */
      freeRetries: number | null
    }
  | { ok: false; status: number; error: string; reason?: 'visitor' | 'global' | 'uncached' }

// generation_log.cache_key prefixes for model calls that aren't a visitor's
// paid generation. Cache keys are hex, so a colon never appears otherwise.
const AUTO = 'auto:'
const RETRY = 'retry:'

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

// Moderation categories that block a description. Plain "violence" and
// "harassment" are left out so spooky or jokey emoji (a skull, a zombie, "rage
// quit") still work; the graphic and threatening versions are blocked.
const BLOCKED_CATEGORIES = [
  'sexual',
  'sexual/minors',
  'hate',
  'hate/threatening',
  'harassment/threatening',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
  'violence/graphic',
  'illicit/violent',
]

export const BLOCKED_MESSAGE = "That description can't be generated. Try wording it differently."
const UNAVAILABLE_MESSAGE = 'AI generation is unavailable right now. Uploads still work.'

/**
 * Checks the description. Fails closed: if moderation can't be reached, nothing
 * is generated, but the person is told the service is down rather than that
 * their words were blocked.
 */
async function moderate(subject: string): Promise<'ok' | 'blocked' | 'unavailable'> {
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: subject }),
    })
    if (!res.ok) {
      console.error('moderation error', res.status, await res.text())
      return 'unavailable'
    }
    const categories: Record<string, boolean> = (await res.json()).results?.[0]?.categories ?? {}
    const hits = BLOCKED_CATEGORIES.filter((c) => categories[c])
    if (hits.length) console.warn('description blocked by moderation', hits)
    return hits.length ? 'blocked' : 'ok'
  } catch (e) {
    console.error('moderation unreachable', e)
    return 'unavailable'
  }
}

type Drawn = { ok: true; png: Uint8Array<ArrayBuffer> } | { ok: false; status: number; error: string }

/** One image from the model, logged against the generation_log row `slotId`. */
async function draw(admin: SupabaseClient, prompt: string, slotId: number): Promise<Drawn> {
  let res = await callModel(MODEL, prompt)
  let detail = res.ok ? '' : await res.text()
  if (res.status === 400 && MODEL !== FALLBACK_MODEL && /background/i.test(detail)) {
    // Transparent backgrounds are in preview on newer models; fall back rather than fail.
    console.warn('primary model rejected transparent background', detail)
    res = await callModel(FALLBACK_MODEL, prompt)
    detail = res.ok ? '' : await res.text()
    await admin.from('generation_log').update({ model: FALLBACK_MODEL }).eq('id', slotId)
  }
  if (!res.ok) {
    console.error('image model error', res.status, detail)
    const blocked = res.status === 400 && /safety|moderation|content_policy/i.test(detail)
    // Out of OpenAI credit or bad key: retrying won't help, so say so.
    const unavailable = res.status === 401 || /insufficient_quota|billing|credit/i.test(detail)
    return {
      ok: false,
      status: blocked ? 400 : unavailable ? 503 : 502,
      error: blocked ? BLOCKED_MESSAGE : unavailable ? UNAVAILABLE_MESSAGE : 'Generation failed. Try again.',
    }
  }
  const result = await res.json()
  const b64: string | undefined = result.data?.[0]?.b64_json
  if (!b64) return { ok: false, status: 502, error: 'Generation failed. Try again.' }
  return { ok: true, png: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) }
}

/** The fit check on a PNG, or null if it can't be decoded (then it's served as is). */
async function inspect(png: Uint8Array): Promise<FitReport | null> {
  try {
    const image = await Image.decode(png)
    return checkFit(image.bitmap, image.width, image.height)
  } catch (e) {
    console.error('could not check the generated image', e)
    return null
  }
}

/**
 * Returns the emoji for `subject` from the cache, or generates it if `visitor`
 * (a daily hash identifying the requester) and the site are under their limits.
 * `retry` skips the cache and draws a variation of a prompt the visitor was
 * already shown today, free while they have free retries left.
 */
export async function generateEmoji(
  admin: SupabaseClient,
  visitor: string,
  subject: string,
  style: string,
  { cacheOnly = false, retry = false }: { cacheOnly?: boolean; retry?: boolean } = {},
): Promise<GenerateOutcome> {
  if (!Deno.env.get('OPENAI_API_KEY')) return { ok: false, status: 503, error: 'AI generation is not set up yet' }
  if (!Object.hasOwn(STYLES, style)) style = 'flat'
  if (!subject) return { ok: false, status: 400, error: 'Describe the emoji you want' }
  if (subject.length > MAX_PROMPT) {
    return { ok: false, status: 400, error: `Keep the description under ${MAX_PROMPT} characters` }
  }
  const moderation = await moderate(subject)
  if (moderation === 'blocked') return { ok: false, status: 400, error: BLOCKED_MESSAGE }
  if (moderation === 'unavailable') return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE }

  const day = new Date().toISOString().slice(0, 10)
  const cacheKey = await sha256(`${MODEL}|${QUALITY}|${style}|${subject.toLowerCase()}`)
  const path = `${cacheKey}.png`
  const since = `${day}T00:00:00Z`

  // own: the visitor's paid generations. retry: free Try agains. all: every row.
  const count = (paid: boolean, mineOnly: boolean, kind: 'own' | 'retry' | 'all' = 'all') => {
    let q = admin
      .from('generation_log')
      .select('id', { count: 'exact', head: true })
      .eq('cache_hit', !paid)
      .gte('created_at', since)
    if (mineOnly) q = q.eq('visitor_hash', visitor)
    if (kind === 'own') q = q.not('cache_key', 'like', '%:%')
    if (kind === 'retry') q = q.like('cache_key', `${RETRY}%`)
    return q.then(({ count }) => count ?? 0)
  }
  const reserve = async (key: string) => {
    const { data, error } = await admin
      .from('generation_log')
      .insert({ visitor_hash: visitor, cache_key: key, cache_hit: false, model: MODEL, quality: QUALITY })
      .select('id')
      .single()
    if (error || !data) console.error('could not reserve a generation slot', error)
    return (data?.id as number | undefined) ?? null
  }
  const release = (id: number) => admin.from('generation_log').delete().eq('id', id)

  // A Try again is free only for a prompt this visitor was shown today, so it
  // can't stand in for a first generation. (Hex keys need no escaping in LIKE.)
  let seen = false
  if (retry) {
    const { count: shown } = await admin
      .from('generation_log')
      .select('id', { count: 'exact', head: true })
      .eq('visitor_hash', visitor)
      .like('cache_key', `%${cacheKey}`)
      .gte('created_at', since)
    seen = !!shown
  } else {
    // 1. Cache hit: free, and doesn't count against the paid limit. Hits are
    // still capped per visitor so a script can't replay cached prompts forever.
    const cached = await admin.storage.from(BUCKET).download(path)
    if (cached.data) {
      if ((await count(false, true)) >= PER_VISITOR * CACHE_HIT_FACTOR) {
        return { ok: false, status: 429, error: "You've reached today's limit. Uploads still work.", reason: 'visitor' }
      }
      await admin
        .from('generation_log')
        .insert({ visitor_hash: visitor, cache_key: cacheKey, cache_hit: true, model: MODEL, quality: QUALITY })
      const freeRetries = Math.max(0, FREE_RETRIES - (await count(true, true, 'retry')))
      return {
        ok: true,
        png: new Uint8Array(await cached.data.arrayBuffer()),
        cacheKey,
        cached: true,
        remaining: null,
        freeRetries,
      }
    }
    if (cacheOnly) return { ok: false, status: 404, error: 'Not generated yet', reason: 'uncached' }
  }

  // 2. Reserve a slot first, then count including it, so parallel requests
  // can't all read the same count and slip past the limits. A slot over the
  // limit, or one whose generation fails, is released again. A Try again
  // takes a free retry slot while the visitor has some left, and otherwise
  // becomes an ordinary paid generation.
  const slot = await reserve(seen ? RETRY + cacheKey : cacheKey)
  if (slot === null) return { ok: false, status: 502, error: 'Generation failed. Try again.' }
  let free = false
  let retriesUsed = await count(true, true, 'retry')
  if (seen) {
    free = retriesUsed <= FREE_RETRIES
    if (!free) {
      await admin.from('generation_log').update({ cache_key: cacheKey }).eq('id', slot)
      retriesUsed--
    }
  }

  // 3. Limits on paid generations. Free retries skip the visitor's limit but
  // never the global one.
  const [mine, everyone] = await Promise.all([count(true, true, 'own'), count(true, false)])
  if (!free && mine > PER_VISITOR) {
    await release(slot)
    return {
      ok: false,
      status: 429,
      error: `You've used today's ${PER_VISITOR} AI generations. Uploads still work.`,
      reason: 'visitor',
    }
  }
  if (everyone > GLOBAL) {
    await release(slot)
    return { ok: false, status: 429, error: 'AI generation is busy for today. Try again tomorrow.', reason: 'global' }
  }

  // 4. Generate.
  const variation = retry ? Math.floor(Math.random() * 1000) : -1
  const first = await draw(admin, buildPrompt(subject, style, { variation }), slot)
  if (!first.ok) {
    await release(slot)
    return first
  }
  let png = first.png
  let report = await inspect(png)

  // 5. Cut off, background left in, or blank: redraw once with a stricter
  // prompt. The redraw takes its own slot under the global cap (never the
  // visitor's), and the better of the two is kept.
  if (report?.problem) {
    console.warn('redrawing a generated image', report)
    const extra = await reserve(AUTO + cacheKey)
    if (extra !== null && (await count(true, false)) <= GLOBAL) {
      const second = await draw(admin, buildPrompt(subject, style, { strict: true, variation }), extra)
      if (second.ok) {
        const check = await inspect(second.png)
        if (check && fitPenalty(check) < fitPenalty(report)) {
          png = second.png
          report = check
        }
      } else {
        await release(extra)
      }
    } else if (extra !== null) {
      await release(extra)
    }
  }

  // A Try again replaces the cached image, so the next person asking gets the newer one.
  await admin.storage.from(BUCKET).upload(path, png, { contentType: 'image/png', upsert: true })

  return {
    ok: true,
    png,
    cacheKey,
    cached: false,
    remaining: Math.max(0, PER_VISITOR - mine),
    freeRetries: Math.max(0, FREE_RETRIES - retriesUsed),
  }
}
