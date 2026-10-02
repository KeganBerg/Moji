// Checks whether a generated emoji fits its canvas: the whole subject inside
// the frame with a transparent background around it. Shared by the
// generate-emoji function (to redraw a bad result before anyone sees it) and
// the website (to offer a free Try again). Plain TypeScript, no Deno or DOM.

export type FitProblem = 'cropped' | 'no-background' | 'empty'

export interface FitReport {
  /** Null when the emoji fits. */
  problem: FitProblem | null
  /** Sides where the subject runs into the edge of the canvas. */
  sides: ('top' | 'right' | 'bottom' | 'left')[]
  /** Share of the canvas that is visible (alpha at least half). */
  coverage: number
}

/** How deep the edge band is, as a share of the side (at least 1 px). */
const BAND = 0.002
/**
 * A side counts as cut off when visible pixels cover this share of its edge
 * band. A round emoji just touching the edge (about 8%) or an antenna tip
 * doesn't; a head sliced flat does.
 */
const CROP_SHARE = 0.12

/** Checks an RGBA bitmap. */
export function checkFit(data: ArrayLike<number>, width: number, height: number): FitReport {
  const band = Math.max(1, Math.round(Math.min(width, height) * BAND))
  const hits = { top: 0, right: 0, bottom: 0, left: 0 }
  let visible = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 128) continue
      visible++
      if (y < band) hits.top++
      if (y >= height - band) hits.bottom++
      if (x < band) hits.left++
      if (x >= width - band) hits.right++
    }
  }
  const coverage = visible / (width * height)
  const sides = (['top', 'right', 'bottom', 'left'] as const).filter((side) => {
    const length = side === 'top' || side === 'bottom' ? width : height
    return hits[side] / (length * band) >= CROP_SHARE
  })
  // Background left in: the model drew a full tile instead of a cutout.
  const problem: FitProblem | null =
    coverage > 0.97 ? 'no-background' : coverage < 0.005 ? 'empty' : sides.length ? 'cropped' : null
  return { problem, sides: problem === 'cropped' ? sides : [], coverage }
}

/** Lower is better: used to keep the less broken of two bad results. */
export function fitPenalty(report: FitReport): number {
  if (!report.problem) return 0
  if (report.problem === 'cropped') return report.sides.length
  return 10
}
