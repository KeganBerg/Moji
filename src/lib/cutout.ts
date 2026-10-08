/**
 * Background removal for uploads, done in the browser. It finds the colors
 * that dominate the image's border, then flood-fills inward from the edges
 * through pixels close to any of them and makes them transparent. Filling from
 * the edges (rather than removing those colors everywhere) keeps dark or light
 * details inside the subject, like the shadows on a moon. Works best on a
 * plain or near-plain background, which is what most emoji sources have.
 *
 * Two things make it hold up on messier sources:
 * - The border can have more than one color. Logos saved from the web often
 *   have a "transparent" checkerboard baked into the pixels, and a single
 *   background color only matches one of its two tones.
 * - After the fill, it tidies what's left: streaky, see-through smears around
 *   the subject's solid body (a brushstroke or grunge texture behind a badge),
 *   the crumbs they shed, and lone specks in the removed area go too.
 */

/** Default cutout strength, 0 to 100. */
export const DEFAULT_STRENGTH = 30

/** How far (0 to 1, as a share of the RGB cube's diagonal) a color may be from the background and still count as it. */
const toleranceFor = (strength: number) => 0.02 + (strength / 100) * 0.3

const MAX_DIST = Math.sqrt(3 * 255 * 255)

type Rgb = [number, number, number]

function dist(d: Uint8ClampedArray, i: number, bg: Rgb) {
  const r = d[i] - bg[0]
  const g = d[i + 1] - bg[1]
  const b = d[i + 2] - bg[2]
  return Math.sqrt(r * r + g * g + b * b) / MAX_DIST
}

/** Distance to the nearest of the background colors. */
function distAny(d: Uint8ClampedArray, i: number, bgs: Rgb[]) {
  let best = Infinity
  for (const bg of bgs) best = Math.min(best, dist(d, i, bg))
  return best
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

/**
 * The colors that make up the border, most common first. Usually that's one
 * color; a baked-in "transparent" checkerboard gives two close tones that
 * keep swapping along the edge. A second color that's far off, or that only
 * shows up in long runs (the subject touching the edge), doesn't count.
 */
function borderPalette(d: Uint8ClampedArray, width: number, height: number): Rgb[] {
  const ring = ringIndices(width, height)
  const [main, ...rest] = palette(d, ring, 0.15, 3)
  if (!main) return []
  const out: Rgb[] = [main]
  for (const tone of rest) {
    if (Math.hypot(tone[0] - main[0], tone[1] - main[1], tone[2] - main[2]) / MAX_DIST > 0.3) continue
    // Count how often the edge switches between the two tones.
    let prev = -1,
      swaps = 0
    for (const p of ring) {
      const i = p * 4
      const a = dist(d, i, main),
        b = dist(d, i, tone)
      const cur = Math.min(a, b) > 0.06 ? -1 : a <= b ? 0 : 1
      if (cur < 0) continue
      if (prev >= 0 && cur !== prev) swaps++
      prev = cur
    }
    if (swaps >= 16) out.push(tone)
  }
  return out
}

/** The border pixels in order around the image, so neighbors in the list are neighbors in the image. */
function ringIndices(width: number, height: number): number[] {
  const out: number[] = []
  for (let x = 0; x < width; x++) out.push(x)
  for (let y = 1; y < height; y++) out.push(y * width + width - 1)
  if (height > 1) for (let x = width - 2; x >= 0; x--) out.push((height - 1) * width + x)
  if (width > 1) for (let y = height - 2; y >= 1; y--) out.push(y * width)
  return out
}

/**
 * The main colors among some pixels (by 4-bit bins, averaged within each bin),
 * most common first: the top one plus any covering at least `share` of them.
 */
function palette(d: Uint8ClampedArray, pixels: number[], share: number, max: number): Rgb[] {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  let total = 0
  for (const p of pixels) {
    const i = p * 4
    if (d[i + 3] < 128) continue
    total++
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bin.n++
    bin.r += d[i]
    bin.g += d[i + 1]
    bin.b += d[i + 2]
    bins.set(key, bin)
  }
  const sorted = [...bins.values()].sort((a, b) => b.n - a.n)
  return sorted
    .filter((bin, k) => k === 0 || bin.n >= total * share)
    .slice(0, max)
    .map((bin) => [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n] as Rgb)
}

/**
 * Whether an image looks like a subject on a plain background: it has no
 * transparency of its own and most of its border is one color (or a
 * two-tone checkerboard).
 */
export function suggestCutout(d: Uint8ClampedArray, width: number, height: number): boolean {
  let transparent = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) transparent++
  if (transparent > (d.length / 4) * 0.01) return false
  const bgs = borderPalette(d, width, height)
  if (!bgs.length) return false
  const tol = toleranceFor(DEFAULT_STRENGTH)
  const border = borderIndices(width, height)
  const matching = border.filter((p) => distAny(d, p * 4, bgs) <= tol).length
  return matching / border.length >= 0.8
}

/**
 * Makes the background transparent in place. Edge pixels that are only a bit
 * different from the background become partly transparent, so the outline
 * stays smooth instead of jagged. Returns how many pixels were removed.
 */
export function removeBackground(d: Uint8ClampedArray, width: number, height: number, strength: number): number {
  const bgs = borderPalette(d, width, height)
  if (!bgs.length) return 0
  const tol = toleranceFor(strength)
  const n = width * height
  const isBg = new Uint8Array(n)
  const queue = new Int32Array(n)
  let head = 0,
    tail = 0
  const visit = (p: number) => {
    if (isBg[p]) return
    const i = p * 4
    if (d[i + 3] < 8 || distAny(d, i, bgs) <= tol) {
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
  // Nothing left to tidy (a one-color image), or nothing removed at all.
  if (tail === 0 || tail === n) {
    for (let p = 0; p < tail; p++) d[queue[p] * 4 + 3] = 0
    return tail
  }

  dropDebris(d, isBg, width, height)

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
    const keep = Math.min(1, (distAny(d, i, bgs) - tol) / tol)
    d[i + 3] = Math.round(d[i + 3] * Math.max(0, keep))
  }
  let removed = 0
  for (let p = 0; p < n; p++)
    if (isBg[p]) {
      d[p * 4 + 3] = 0
      removed++
    }
  return removed
}

/**
 * Chamfer distance (3 per straight step, 4 per diagonal) from every pixel
 * where `inside` is set to the nearest pixel where it isn't. Pixels past the
 * image edge count as outside.
 */
function distanceInside(inside: Uint8Array, w: number, h: number): Int32Array {
  const BIG = 1 << 28
  const out = new Int32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (!inside[p]) continue
      let v = BIG
      v = Math.min(v, x > 0 ? out[p - 1] + 3 : 3)
      v = Math.min(v, y > 0 ? out[p - w] + 3 : 3)
      v = Math.min(v, x > 0 && y > 0 ? out[p - w - 1] + 4 : 4)
      v = Math.min(v, x < w - 1 && y > 0 ? out[p - w + 1] + 4 : 4)
      out[p] = v
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x
      if (!inside[p]) continue
      let v = out[p]
      v = Math.min(v, x < w - 1 ? out[p + 1] + 3 : 3)
      v = Math.min(v, y < h - 1 ? out[p + w] + 3 : 3)
      v = Math.min(v, x < w - 1 && y < h - 1 ? out[p + w + 1] + 4 : 4)
      v = Math.min(v, x > 0 && y < h - 1 ? out[p + w - 1] + 4 : 4)
      out[p] = v
    }
  }
  return out
}

/** Pixels within `r` (in chamfer units) of the mask. */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const n = w * h
  const outside = new Uint8Array(n)
  for (let p = 0; p < n; p++) outside[p] = mask[p] ? 0 : 1
  const dt = distanceInside(outside, w, h)
  const out = new Uint8Array(n)
  for (let p = 0; p < n; p++) out[p] = mask[p] || dt[p] <= r ? 1 : 0
  return out
}

/** Pixels at least `r` (in chamfer units) inside the mask. */
function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const dt = distanceInside(mask, w, h)
  const out = new Uint8Array(w * h)
  for (let p = 0; p < out.length; p++) out[p] = dt[p] > r ? 1 : 0
  return out
}

/** Labels 8-connected regions of the mask from 1 up; returns the labels and each region's size (index 0 unused). */
function label(mask: Uint8Array, w: number, h: number): { labels: Int32Array; sizes: number[] } {
  const n = w * h
  const labels = new Int32Array(n)
  const sizes = [0]
  const stack = new Int32Array(n)
  for (let s = 0; s < n; s++) {
    if (!mask[s] || labels[s]) continue
    const id = sizes.length
    let size = 0
    let top = 0
    stack[top++] = s
    labels[s] = id
    while (top) {
      const p = stack[--top]
      size++
      const x = p % w
      const y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const q = yy * w + xx
          if (mask[q] && !labels[q]) {
            labels[q] = id
            stack[top++] = q
          }
        }
      }
    }
    sizes.push(size)
  }
  return { labels, sizes }
}

/**
 * How much each labeled region looks like brush streaks, 0 to 1. Streaks have
 * edges that all run one way (high coherence of the luminance structure
 * tensor) and the region stretches out along that same way, like the bristle
 * marks of a stroke. A line of text can have lined-up edges too (all those
 * upright stems), but it stretches across them, not along them, so it scores
 * low. Pixels in `skip` don't count.
 */
function streakiness(d: Uint8ClampedArray, labels: Int32Array, count: number, w: number, h: number, skip: Uint8Array) {
  const lum = (p: number) => d[p * 4] * 0.3 + d[p * 4 + 1] * 0.59 + d[p * 4 + 2] * 0.11
  // Per region: structure tensor (j*) and the spread of pixel positions (m*).
  const jxx = new Float64Array(count),
    jyy = new Float64Array(count),
    jxy = new Float64Array(count)
  const n0 = new Float64Array(count),
    mx = new Float64Array(count),
    my = new Float64Array(count),
    mxx = new Float64Array(count),
    myy = new Float64Array(count),
    mxy = new Float64Array(count)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      const id = labels[p]
      if (!id || skip[p]) continue
      const gx = lum(p + 1) - lum(p - 1)
      const gy = lum(p + w) - lum(p - w)
      jxx[id] += gx * gx
      jyy[id] += gy * gy
      jxy[id] += gx * gy
      n0[id]++
      mx[id] += x
      my[id] += y
      mxx[id] += x * x
      myy[id] += y * y
      mxy[id] += x * y
    }
  }
  const out = new Float64Array(count)
  for (let id = 1; id < count; id++) {
    const t = jxx[id] + jyy[id]
    if (!t || n0[id] < 2) continue
    const coherence = Math.hypot(jxx[id] - jyy[id], 2 * jxy[id]) / t
    // The main gradient direction; edges run across it.
    const angle = Math.atan2(2 * jxy[id], jxx[id] - jyy[id]) / 2
    const gx = Math.cos(angle),
      gy = Math.sin(angle)
    const k = n0[id]
    const cxx = mxx[id] / k - (mx[id] / k) ** 2
    const cyy = myy[id] / k - (my[id] / k) ** 2
    const cxy = mxy[id] / k - (mx[id] / k) * (my[id] / k)
    const alongGradient = gx * gx * cxx + 2 * gx * gy * cxy + gy * gy * cyy
    const alongEdges = gy * gy * cxx - 2 * gx * gy * cxy + gx * gx * cyy
    const stretch = Math.sqrt(alongEdges / Math.max(alongGradient, 1e-6))
    // Full marks once it's at least twice as long along the edges as across.
    out[id] = coherence * Math.min(1, Math.max(0, (stretch - 1) / 1))
  }
  return out
}

/**
 * Tidies what the flood fill left behind, marking more pixels as background.
 *
 * The subject's main body is what survives eroding the kept area by a few
 * percent of the image (thin strokes vanish), keeping only the big pieces.
 * When that body is most of the picture, the thin stuff around it is checked:
 *
 * 1. Smears. Split the thin stuff into regions. A region goes when it is both
 *    see-through (close its small gaps and much of the closed area was gaps)
 *    and streaky (its edges mostly run one way). A brushstroke or grunge
 *    texture is both; text is see-through at small sizes but its edges run
 *    every which way; a solid stick or tail has no gaps.
 * 2. Specks. Bits close together count as one (the letters of a word). A
 *    group goes when it is tiny next to the subject, or when it is small, thin
 *    and streaky (a stray wisp of a brushstroke).
 */
function dropDebris(d: Uint8ClampedArray, isBg: Uint8Array, w: number, h: number) {
  const n = w * h
  const kept = new Uint8Array(n)
  for (let p = 0; p < n; p++) kept[p] = isBg[p] ? 0 : 1
  const clear = (p: number) => {
    kept[p] = 0
    isBg[p] = 1
  }

  const size = Math.max(w, h)
  const coreR = Math.max(6, Math.round(size * 0.02) * 3)
  const gapR = Math.max(3, Math.round(size * 0.006) * 3)
  const core = erode(kept, w, h, coreR)
  const thick = dilate(core, w, h, coreR + 3)
  const cores = label(core, w, h)
  let biggest = 0
  for (const c of cores.sizes) biggest = Math.max(biggest, c)
  for (let p = 0; p < n; p++) if (core[p] && cores.sizes[cores.labels[p]] < biggest * 0.15) core[p] = 0
  const main = dilate(core, w, h, coreR + 3)
  let inMain = 0,
    total = 0
  for (let p = 0; p < n; p++)
    if (kept[p]) {
      total++
      if (main[p]) inMain++
    }
  // With no clear subject (a row of small text, a grid of icons) only lone specks go.
  const dominant = inMain >= total * 0.5
  const smeared = new Uint8Array(n)

  if (dominant) {
    const closed = erode(dilate(kept, w, h, gapR), w, h, gapR)
    const outer = new Uint8Array(n)
    for (let p = 0; p < n; p++) outer[p] = closed[p] && !main[p] ? 1 : 0
    const { labels, sizes } = label(outer, w, h)
    const thinArea = new Int32Array(sizes.length)
    const thinSolid = new Int32Array(sizes.length)
    const thickKept = new Int32Array(sizes.length)
    for (let p = 0; p < n; p++) {
      const id = labels[p]
      if (!id) continue
      if (thick[p]) {
        if (kept[p]) thickKept[id]++
        continue
      }
      thinArea[id]++
      if (kept[p]) thinSolid[id]++
    }
    const streaky = streakiness(d, labels, sizes.length, w, h, thick)
    // 2 drops the whole region; 1 only its thin parts, so a solid letter keeps
    // its place even when a faint shadow line beside it goes.
    const drop = new Uint8Array(sizes.length)
    for (let id = 1; id < sizes.length; id++)
      if (thinArea[id] >= 24 && thinSolid[id] / thinArea[id] < 0.8 && streaky[id] >= 0.3)
        drop[id] = thinArea[id] >= thickKept[id] ? 2 : 1
    for (let p = 0; p < n; p++)
      if (kept[p] && (drop[labels[p]] === 2 || (drop[labels[p]] === 1 && !thick[p]))) {
        clear(p)
        smeared[p] = 1
      }
  }

  // Lone specks: bits close together count as one (the letters of a word).
  const groups = label(dilate(kept, w, h, coreR), w, h)
  const groupSize = new Int32Array(groups.sizes.length)
  for (let p = 0; p < n; p++) if (kept[p]) groupSize[groups.labels[p]]++
  let largest = 0
  for (const s of groupSize) largest = Math.max(largest, s)
  const minGroup = Math.max(4, largest * 0.004)
  for (let p = 0; p < n; p++) if (kept[p] && groupSize[groups.labels[p]] < minGroup) clear(p)
  // The rest only follows a real smear, not a stray false alarm.
  let smearSize = 0
  for (let p = 0; p < n; p++) smearSize += smeared[p]
  if (smearSize < total * 0.03) return

  // Stubs: where streaks ran into the subject, their thin ends stay stuck to
  // its outline. Near the smear, keep only what the body's own shape (the
  // opening at the core size) covers.
  const nearSmear = dilate(smeared, w, h, coreR)
  const smearArea = dilate(smeared, w, h, coreR * 3)
  const shape = dilate(erode(kept, w, h, coreR), w, h, coreR)
  for (let p = 0; p < n; p++) if (kept[p] && nearSmear[p] && !shape[p]) clear(p)

  // A band of stroke lying flush along the outline has the body's shape, so
  // peel it by color instead: near the smear, outline pixels that match the
  // smear's colors and none of the body's main colors go, a layer at a time.
  const onEdge = (p: number) => {
    const x = p % w
    return (
      (x > 0 && !kept[p - 1]) || (x < w - 1 && !kept[p + 1]) || (p >= w && !kept[p - w]) || (p < n - w && !kept[p + w])
    )
  }
  // The body's colors: its inside, plus the main colors of its outline away
  // from the smear (an outline ring like a white rim is thin, so not inside).
  const smearPixels: number[] = []
  const insidePixels: number[] = []
  const outlinePixels: number[] = []
  for (let p = 0; p < n; p++) {
    if (smeared[p]) smearPixels.push(p)
    else if (kept[p] && core[p]) insidePixels.push(p)
    else if (kept[p] && !nearSmear[p]) outlinePixels.push(p)
  }
  const smearColors = palette(d, smearPixels, 0.003, 48)
  const bodyColors = [...palette(d, insidePixels, 0.02, 12), ...palette(d, outlinePixels, 0.05, 6)]
  // An outline ring hugs the body (within a few pixels of its solid colors)
  // and stays even when its colors look like the smear's; a band of stroke
  // lying on top of it sits farther out.
  const bodySolid = new Uint8Array(n)
  for (let p = 0; p < n; p++) bodySolid[p] = kept[p] && !onEdge(p) && distAny(d, p * 4, bodyColors) < 0.06 ? 1 : 0
  const hugging = dilate(bodySolid, w, h, 9)
  for (let layer = 0; layer < 4; layer++) {
    const peel: number[] = []
    for (let p = 0; p < n; p++)
      if (
        kept[p] &&
        smearArea[p] &&
        !hugging[p] &&
        onEdge(p) &&
        distAny(d, p * 4, smearColors) < 0.1 &&
        distAny(d, p * 4, bodyColors) > 0.22
      )
        peel.push(p)
    if (!peel.length) break
    for (const p of peel) clear(p)
  }

  // Crumbs: when a smear went, the loose bits it shed go too. Loose means not
  // attached to the body and nothing thick. Bits close together count as one
  // (so a word stays whole) and a group goes when it's tiny.
  const loose = new Uint8Array(n)
  for (let p = 0; p < n; p++) loose[p] = kept[p] && !main[p] ? 1 : 0
  const bits = label(loose, w, h)
  const attached = new Uint8Array(bits.sizes.length)
  for (let p = 0; p < n; p++) {
    const id = bits.labels[p]
    if (!id) continue
    const x = p % w
    if (
      thick[p] ||
      (x > 0 && main[p - 1]) ||
      (x < w - 1 && main[p + 1]) ||
      (p >= w && main[p - w]) ||
      (p < n - w && main[p + w])
    )
      attached[id] = 1
  }
  const near = dilate(loose, w, h, coreR)
  for (let p = 0; p < n; p++) if (main[p]) near[p] = 0
  const crumbs = label(near, w, h)
  const crumbSize = new Int32Array(crumbs.sizes.length)
  const solid = new Uint8Array(crumbs.sizes.length)
  for (let p = 0; p < n; p++) {
    if (!loose[p]) continue
    const id = crumbs.labels[p]
    crumbSize[id]++
    if (attached[bits.labels[p]]) solid[id] = 1
  }
  // Specks in the smear's area go even when they sit near something solid.
  const touch = new Uint8Array(bits.sizes.length)
  for (let p = 0; p < n; p++) if (bits.labels[p] && smearArea[p]) touch[bits.labels[p]] = 1
  for (let p = 0; p < n; p++) {
    if (!loose[p]) continue
    const id = crumbs.labels[p]
    const bit = bits.labels[p]
    const lone = !solid[id] && crumbSize[id] < total * 0.004
    const speck = !attached[bit] && touch[bit] && bits.sizes[bit] < total * 0.0015
    if (lone || speck) clear(p)
  }
}
