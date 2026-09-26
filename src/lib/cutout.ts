/**
 * Background removal for uploads, done in the browser. It finds the color that
 * dominates the image's border, then flood-fills inward from the edges through
 * pixels close to that color and makes them transparent. Filling from the
 * edges (rather than removing that color everywhere) keeps dark or light
 * details inside the subject, like the shadows on a moon. Works best on a
 * plain or near-plain background, which is what most emoji sources have.
 */

/** Default cutout strength, 0 to 100. */
export const DEFAULT_STRENGTH = 30

/** How far (0 to 1, as a share of the RGB cube's diagonal) a color may be from the background and still count as it. */
const toleranceFor = (strength: number) => 0.02 + (strength / 100) * 0.3

const MAX_DIST = Math.sqrt(3 * 255 * 255)

function dist(d: Uint8ClampedArray, i: number, bg: [number, number, number]) {
  const r = d[i] - bg[0]
  const g = d[i + 1] - bg[1]
  const b = d[i + 2] - bg[2]
  return Math.sqrt(r * r + g * g + b * b) / MAX_DIST
}

function borderIndices(width: number, height: number): number[] {
  const out: number[] = []
  for (let x = 0; x < width; x++) {
    out.push(x, (height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y++) {
    out.push(y * width, y * width + width - 1)
  }
  return out
}

/** The most common color along the border (by 4-bit bins), averaged within its bin. */
export function borderColor(d: Uint8ClampedArray, width: number, height: number): [number, number, number] | null {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (const p of borderIndices(width, height)) {
    const i = p * 4
    if (d[i + 3] < 128) continue
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bin.n++
    bin.r += d[i]
    bin.g += d[i + 1]
    bin.b += d[i + 2]
    bins.set(key, bin)
  }
  let best: { n: number; r: number; g: number; b: number } | null = null
  for (const bin of bins.values()) if (!best || bin.n > best.n) best = bin
  return best ? [best.r / best.n, best.g / best.n, best.b / best.n] : null
}

/**
 * Whether an image looks like a subject on a plain background: it has no
 * transparency of its own and most of its border is one color.
 */
export function suggestCutout(d: Uint8ClampedArray, width: number, height: number): boolean {
  let transparent = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) transparent++
  if (transparent > (d.length / 4) * 0.01) return false
  const bg = borderColor(d, width, height)
  if (!bg) return false
  const tol = toleranceFor(DEFAULT_STRENGTH)
  const border = borderIndices(width, height)
  const matching = border.filter((p) => dist(d, p * 4, bg) <= tol).length
  return matching / border.length >= 0.8
}

/**
 * Makes the background transparent in place. Edge pixels that are only a bit
 * different from the background become partly transparent, so the outline
 * stays smooth instead of jagged. Returns how many pixels were removed.
 */
export function removeBackground(d: Uint8ClampedArray, width: number, height: number, strength: number): number {
  const bg = borderColor(d, width, height)
  if (!bg) return 0
  const tol = toleranceFor(strength)
  const n = width * height
  const isBg = new Uint8Array(n)
  const queue = new Int32Array(n)
  let head = 0,
    tail = 0
  const visit = (p: number) => {
    if (isBg[p]) return
    const i = p * 4
    if (d[i + 3] < 8 || dist(d, i, bg) <= tol) {
      isBg[p] = 1
      queue[tail++] = p
    }
  }
  for (const p of borderIndices(width, height)) visit(p)
  while (head < tail) {
    const p = queue[head++]
    const x = p % width
    if (x > 0) visit(p - 1)
    if (x < width - 1) visit(p + 1)
    if (p >= width) visit(p - width)
    if (p < n - width) visit(p + width)
  }

  // Soften the ring of subject pixels that touch the removed background.
  for (let p = 0; p < n; p++) {
    if (isBg[p]) continue
    const x = p % width
    const touches =
      (x > 0 && isBg[p - 1]) ||
      (x < width - 1 && isBg[p + 1]) ||
      (p >= width && isBg[p - width]) ||
      (p < n - width && isBg[p + width])
    if (!touches) continue
    const i = p * 4
    const keep = Math.min(1, (dist(d, i, bg) - tol) / tol)
    d[i + 3] = Math.round(d[i + 3] * Math.max(0, keep))
  }
  for (let p = 0; p < n; p++) if (isBg[p]) d[p * 4 + 3] = 0
  return tail
}
