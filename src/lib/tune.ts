import { ctx2d, makeCanvas } from './render'

/** Color and detail adjustments, each from -100 to 100 with 0 meaning unchanged. */
export interface Tune {
  brightness: number
  contrast: number
  saturation: number
  sharpness: number
}

export const DEFAULT_TUNE: Tune = { brightness: 0, contrast: 0, saturation: 0, sharpness: 0 }

export const TUNE_CONTROLS: { key: keyof Tune; label: string }[] = [
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'sharpness', label: 'Sharpness' },
]

export const isNeutral = (t: Tune) => TUNE_CONTROLS.every(({ key }) => t[key] === 0)

/**
 * Applies a tune to straight-alpha RGBA pixels in place. Alpha is never
 * changed, so trimming and transparent edges behave the same afterwards.
 */
export function tunePixels(data: Uint8ClampedArray, width: number, height: number, t: Tune): void {
  if (t.sharpness !== 0) sharpen(data, width, height, t.sharpness)

  const brightness = (t.brightness / 100) * 96
  // Contrast pivots on mid-grey; the positive side goes further so +100 is punchy.
  const c = t.contrast / 100
  const contrast = c >= 0 ? 1 + c * 1.5 : 1 + c * 0.9
  const saturation = 1 + t.saturation / 100
  if (brightness === 0 && contrast === 1 && saturation === 1) return

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    let r = data[i],
      g = data[i + 1],
      b = data[i + 2]
    if (saturation !== 1) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      r = luma + (r - luma) * saturation
      g = luma + (g - luma) * saturation
      b = luma + (b - luma) * saturation
    }
    data[i] = (r - 128) * contrast + 128 + brightness
    data[i + 1] = (g - 128) * contrast + 128 + brightness
    data[i + 2] = (b - 128) * contrast + 128 + brightness
  }
}

/**
 * Unsharp mask against a 3×3 blur (negative amounts soften instead). The blur
 * weighs neighbors by their alpha, so transparent pixels around the emoji
 * don't bleed dark halos into its edges.
 */
function sharpen(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  const k = amount > 0 ? (amount / 100) * 2 : amount / 100
  const src = data.slice()
  const weights = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (src[i + 3] === 0) continue
      let sr = 0,
        sg = 0,
        sb = 0,
        sw = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = Math.min(height - 1, Math.max(0, y + dy))
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx))
          const j = (ny * width + nx) * 4
          const w = weights[(dy + 1) * 3 + dx + 1] * src[j + 3]
          sr += src[j] * w
          sg += src[j + 1] * w
          sb += src[j + 2] * w
          sw += w
        }
      }
      data[i] = src[i] + k * (src[i] - sr / sw)
      data[i + 1] = src[i + 1] + k * (src[i + 1] - sg / sw)
      data[i + 2] = src[i + 2] + k * (src[i + 2] - sb / sw)
    }
  }
}

/** A tuned copy of the source canvas, or the source itself when nothing changes. */
export function applyTune(source: HTMLCanvasElement, t: Tune): HTMLCanvasElement {
  if (isNeutral(t)) return source
  const out = makeCanvas(source.width, source.height)
  const ctx = ctx2d(out)
  ctx.drawImage(source, 0, 0)
  const img = ctx.getImageData(0, 0, out.width, out.height)
  tunePixels(img.data, out.width, out.height, t)
  ctx.putImageData(img, 0, 0)
  return out
}
