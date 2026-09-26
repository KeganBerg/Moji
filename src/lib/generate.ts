import { supabase } from './supabase'

/**
 * Prompt-to-emoji generation. No image model has been picked yet, so the app
 * ships with a placeholder that draws the prompt as a badge; swap in a real
 * provider by implementing EmojiGenerator and returning it from getGenerator().
 *
 * The intended production path is SupabaseFunctionGenerator: the browser calls
 * the `generate-emoji` Edge Function, which holds the provider API key and
 * returns a PNG. See supabase/functions/generate-emoji.
 */
export interface GenerateRequest {
  prompt: string
  /** Style hint appended to the prompt, e.g. "flat", "3d", "pixel". */
  style: string
}

export interface EmojiGenerator {
  readonly id: string
  readonly label: string
  /** Whether the output is a real model image (false for the placeholder). */
  readonly isReal: boolean
  generate(req: GenerateRequest): Promise<Blob>
}

const BADGE_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa', '#f783ac']

function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) | 0
  return Math.abs(h)
}

/** Draws the prompt's first emoji (or initials) on a colored circle. Lets the whole flow work before a model is wired up. */
export class PlaceholderGenerator implements EmojiGenerator {
  readonly id = 'placeholder'
  readonly label = 'Placeholder (no AI model connected)'
  readonly isReal = false

  async generate({ prompt }: GenerateRequest): Promise<Blob> {
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
    ctx.font = `bold ${emoji ? 300 : 220}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
    ctx.fillText(label, size / 2, size / 2 + (emoji ? 12 : 8))
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw placeholder'))), 'image/png'),
    )
  }
}

/** Calls the generate-emoji Edge Function, which talks to the image model server-side. */
export class SupabaseFunctionGenerator implements EmojiGenerator {
  readonly id = 'supabase'
  readonly label = 'AI (Supabase Edge Function)'
  readonly isReal = true

  async generate(req: GenerateRequest): Promise<Blob> {
    if (!supabase) throw new Error('Supabase is not configured')
    const { data, error } = await supabase.functions.invoke('generate-emoji', { body: req })
    if (error) throw new Error(error.message)
    if (data instanceof Blob) return data
    throw new Error('Generator returned an unexpected response')
  }
}

export function getGenerator(): EmojiGenerator {
  const choice = import.meta.env.VITE_EMOJI_GENERATOR as string | undefined
  if (choice === 'supabase' && supabase) return new SupabaseFunctionGenerator()
  return new PlaceholderGenerator()
}
