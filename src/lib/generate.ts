/**
 * Prompt-to-emoji generation.
 *
 * In production the browser calls the `generate-emoji` Supabase Edge Function,
 * which holds the OpenAI key, caches results and enforces daily limits (see
 * supabase/functions/generate-emoji). Without Supabase env vars, a local
 * placeholder draws the prompt as a badge so the rest of the flow still works.
 */
export const STYLES = [
  { id: 'flat', label: 'Flat' },
  { id: '3d', label: '3D' },
  { id: 'sticker', label: 'Sticker' },
  { id: 'pixel', label: 'Pixel' },
  { id: 'hand-drawn', label: 'Sketch' },
] as const

export type StyleId = (typeof STYLES)[number]['id']

export interface GenerateRequest {
  prompt: string
  style: StyleId
  /** Only return an already-cached emoji; never spend a paid generation. */
  cacheOnly?: boolean
}

export interface GenerateResult {
  blob: Blob
  cached: boolean
  /** Paid generations left today, when the server reports it. */
  remaining: number | null
}

export interface EmojiGenerator {
  readonly isReal: boolean
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult>
}

export const MAX_PROMPT = 200

const BADGE_COLORS = ['#f25f5c', '#f7a541', '#e9c46a', '#43aa8b', '#4d96ff', '#7b61ff', '#e76fbd']

function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) | 0
  return Math.abs(h)
}

/** Draws the prompt's first emoji (or initials) on a colored circle. */
export class PlaceholderGenerator implements EmojiGenerator {
  readonly isReal = false

  async generate({ prompt }: GenerateRequest): Promise<GenerateResult> {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    const text = prompt.trim() || '?'
    ctx.fillStyle = BADGE_COLORS[hash(text) % BADGE_COLORS.length]
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2)
    ctx.fill()
    const emoji = text.match(/\p{Extended_Pictographic}/u)?.[0]
    const label =
      emoji ??
      text
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => [...w][0]?.toUpperCase() ?? '')
        .join('')
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${emoji ? 300 : 220}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
    ctx.fillText(label, size / 2, size / 2 + (emoji ? 12 : 8))
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw placeholder'))), 'image/png'),
    )
    return { blob, cached: false, remaining: null }
  }
}

export class GenerationError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** A cache-only request for a prompt nobody has generated yet. */
export class NotCachedError extends Error {
  readonly name = 'NotCachedError'
  constructor() {
    super('Not generated yet')
  }
}

/** Calls the generate-emoji Edge Function with the project's publishable key. */
export class SupabaseFunctionGenerator implements EmojiGenerator {
  readonly isReal = true

  private readonly url: string
  private readonly key: string

  constructor(url: string, key: string) {
    this.url = url
    this.key = key
  }

  async generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult> {
    let res: Response
    try {
      res = await fetch(`${this.url}/functions/v1/generate-emoji`, {
        method: 'POST',
        headers: { apikey: this.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal,
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      throw new GenerationError('Could not reach the generator. Check your connection.', 0)
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      if (body?.reason === 'uncached') throw new NotCachedError()
      throw new GenerationError(body?.error ?? 'Generation failed. Try again.', res.status)
    }
    const remaining = res.headers.get('x-moji-remaining')
    return {
      blob: await res.blob(),
      cached: res.headers.get('x-moji-cache') === 'hit',
      remaining: remaining === null ? null : Number(remaining),
    }
  }
}

export function getGenerator(): EmojiGenerator {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
  return url && key ? new SupabaseFunctionGenerator(url, key) : new PlaceholderGenerator()
}
