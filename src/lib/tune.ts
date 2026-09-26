import { ctx2d, makeCanvas } from './render'

/** Color and detail adjustments, 0 meaning unchanged. Chaos runs 0 to 100, the rest -100 to 100. */
export interface Tune {
  brightness: number
  contrast: number
  saturation: number
  sharpness: number
  chaos: number
}

export const DEFAULT_TUNE: Tune = { brightness: 0, contrast: 0, saturation: 0, sharpness: 0, chaos: 0 }

export const TUNE_CONTROLS: { key: keyof Tune; label: string; min: number }[] = [
  { key: 'brightness', label: 'Brightness', min: -100 },
  { key: 'contrast', label: 'Contrast', min: -100 },
  { key: 'saturation', label: 'Saturation', min: -100 },
  { key: 'sharpness', label: 'Sharpness', min: -100 },
  { key: 'chaos', label: 'Chaos', min: 0 },
]

export const isNeutral = (t: Tune) => TUNE_CONTROLS.every(({ key }) => t[key] === 0)

/**
 * Applies a tune to straight-alpha RGBA pixels in place. Only Chaos changes
 * alpha (it warps the shape); everything else leaves edges exactly as they were.
 */
export function tunePixels(data: Uint8ClampedArray, width: number, height: number, t: Tune): void {
  if (t.sharpness !== 0) sharpen(data, width, height, t.sharpness > 0 ? (t.sharpness / 100) * 2 : t.sharpness / 100)
  adjustColor(data, t)
  if (t.chaos > 0) deepFry(data, width, height, t.chaos / 100)
}

function adjustColor(data: Uint8ClampedArray, t: Tune) {
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
 * Unsharp mask against a 3×3 blur, k times the difference (negative k softens). The blur
 * weighs neighbors by their alpha, so transparent pixels around the emoji
 * don't bleed dark halos into its edges.
 */
function sharpen(data: Uint8ClampedArray, width: number, height: number, k: number) {
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

/** Tiny deterministic noise per pixel, so Chaos grain doesn't shimmer between renders. */
function grain(p: number) {
  let h = Math.imul(p ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5
}

/** One fisheye bulge: where to sample from for an output offset (dx, dy) from its center. */
function bulgeAt(dx: number, dy: number, radius: number, power: number, twist: number): [number, number] {
  const r = Math.sqrt(dx * dx + dy * dy) / radius
  if (r >= 1) return [dx, dy]
  const scale = Math.pow(r, power - 1)
  const angle = twist * (1 - r) * (1 - r)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [(dx * cos - dy * sin) * scale, (dx * sin + dy * cos) * scale]
}

/**
 * The "deep-fried meme" look, scaled by c from 0 to 1. The shape is warped
 * (a big twisted fisheye, a second bulge on the upper left where eyes usually
 * are, and a wobble) but every part stays where you'd expect it, so the emoji
 * is still recognizable, just gloriously wrong. Then the colors get blown out,
 * pushed orange, crushed into a few levels, blocked like a tenth-generation
 * JPEG, grained and oversharpened until the edges crunch.
 */
function deepFry(data: Uint8ClampedArray, width: number, height: number, c: number) {
  const src = data.slice()
  const radius = Math.min(width, height) / 2
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const ex = width * 0.34
  const ey = height * 0.36
  const wobble = c * radius * 0.06
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let [sx, sy] = bulgeAt(x - cx, y - cy, radius, 1 + c * 2.4, c * 1.6)
      sx += cx
      sy += cy
      const [ox, oy] = bulgeAt(sx - ex, sy - ey, radius * 0.55, 1 + c * 1.8, -c * 0.8)
      sx = ex + ox + Math.sin((y / height) * Math.PI * 5) * wobble
      sy = ey + oy + Math.sin((x / width) * Math.PI * 4) * wobble
      const i =
        (Math.min(height - 1, Math.max(0, Math.round(sy))) * width + Math.min(width - 1, Math.max(0, Math.round(sx)))) *
        4
      const o = (y * width + x) * 4
      data[o] = src[i]
      data[o + 1] = src[i + 1]
      data[o + 2] = src[i + 2]
      data[o + 3] = src[i + 3]
    }
  }

  // Blocky "saved as JPEG forty times" smear: pull pixels toward their 8×8 block's average.
  const block = 8
  const smear = c * 0.45
  for (let by = 0; by < height; by += block) {
    for (let bx = 0; bx < width; bx += block) {
      let r = 0,
        g = 0,
        b = 0,
        n = 0
      for (let y = by; y < Math.min(height, by + block); y++)
        for (let x = bx; x < Math.min(width, bx + block); x++) {
          const i = (y * width + x) * 4
          if (data[i + 3] === 0) continue
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          n++
        }
      if (!n) continue
      r /= n
      g /= n
      b /= n
      for (let y = by; y < Math.min(height, by + block); y++)
        for (let x = bx; x < Math.min(width, bx + block); x++) {
          const i = (y * width + x) * 4
          data[i] += (r - data[i]) * smear
          data[i + 1] += (g - data[i + 1]) * smear
          data[i + 2] += (b - data[i + 2]) * smear
        }
    }
  }

  // Fry the colors.
  const saturation = 1 + c * 3.5
  const contrast = 1 + c * 1.8
  const levels = Math.max(4, Math.round(48 - c * 44))
  const step = 255 / (levels - 1)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    let r = data[i],
      g = data[i + 1],
      b = data[i + 2]
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    r = luma + (r - luma) * saturation
    g = luma + (g - luma) * saturation
    b = luma + (b - luma) * saturation
    const n = grain(i >> 2) * 120 * c
    r = (r - 128) * contrast + 128 + 70 * c + n
    g = (g - 128) * contrast + 128 + 10 * c + n
    b = (b - 128) * contrast + 128 - 70 * c + n
    data[i] = Math.round(Math.min(255, Math.max(0, r)) / step) * step
    data[i + 1] = Math.round(Math.min(255, Math.max(0, g)) / step) * step
    data[i + 2] = Math.round(Math.min(255, Math.max(0, b)) / step) * step
  }

  // Crunch.
  sharpen(data, width, height, c * 8)
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
