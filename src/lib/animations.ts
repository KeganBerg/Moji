/**
 * Preset animations. Each one maps a loop position t in [0, 1) to a transform
 * applied to the source image, so previews and GIF export draw identical frames.
 */
export interface FrameTransform {
  /** Radians. */
  rotate?: number
  scaleX?: number
  scaleY?: number
  /** Offsets as a fraction of the emoji size. */
  x?: number
  y?: number
  /** Party color, as a hue in degrees. Undefined means the image keeps its own colors. */
  hue?: number
  /** How strongly the Party color washes over the image, 0 to 1. */
  tint?: number
  /** Sparkle burst progress, 0 to 1. Undefined means no sparkles this frame. */
  burst?: number
}

export interface Animation {
  id: string
  label: string
  /** Loop length in ms. */
  duration: number
  /** Frames per loop in the exported GIF. */
  frames: number
  /** Whether the emoji needs to shrink a little so motion stays inside the canvas. */
  inset: number
  /**
   * Fewest frames per loop that still show the motion. Shake goes back and
   * forth twice a loop, so too few frames land only on its still points.
   */
  minFrames?: number
  at(t: number): FrameTransform
}

const TAU = Math.PI * 2

/**
 * A plucked spring: starts at rest, kicks out, then rings down to nearly
 * nothing by the end of the loop, so the GIF still loops cleanly. Rings
 * `ring` half swings; `damping` sets how quickly it settles.
 */
const spring = (t: number, ring: number, damping: number) => Math.exp(-damping * t) * Math.sin(Math.PI * ring * t)

/** Penner's back easing: overshoots the end and comes back. */
const BACK = 2.6
const easeOutBack = (x: number) => 1 + (BACK + 1) * (x - 1) ** 3 + BACK * (x - 1) ** 2
const easeInBack = (x: number) => (BACK + 1) * x ** 3 - BACK * x ** 2

export const ANIMATIONS: Animation[] = [
  { id: 'none', label: 'Static', duration: 1000, frames: 1, inset: 1, at: () => ({}) },
  {
    id: 'spin',
    label: 'Spin',
    duration: 1200,
    frames: 24,
    inset: 0.82,
    at: (t) => ({ rotate: t * TAU }),
  },
  {
    id: 'bounce',
    label: 'Bounce',
    duration: 900,
    frames: 24,
    inset: 0.78,
    // A real hop: rises and falls on a gravity curve, stretches while moving
    // fast, then lands with a squash that springs back.
    at: (t) => {
      const air = 0.68
      // Keeps the bottom edge on the ground as the height stretches or squashes.
      const foot = (s: number) => 0.1 + (1 - s) * 0.36
      if (t < air) {
        const u = t / air
        const speed = (1 - 2 * u) ** 2
        const s = 1 + speed * 0.07
        return { y: foot(s) - 4 * u * (1 - u) * 0.22, scaleY: s, scaleX: 2 - s }
      }
      const s = 1.07 - spring((t - air) / (1 - air), 3, 2.5) * 0.3
      return { y: foot(s), scaleY: s, scaleX: 2 - s }
    },
  },
  {
    id: 'shake',
    label: 'Shake',
    duration: 500,
    frames: 10,
    minFrames: 8,
    inset: 0.88,
    at: (t) => ({ x: Math.sin(t * TAU * 2) * 0.05, rotate: Math.sin(t * TAU * 2) * 0.06 }),
  },
  {
    id: 'pulse',
    label: 'Pulse',
    duration: 900,
    frames: 18,
    inset: 0.86,
    at: (t) => {
      const s = 1 + Math.sin(t * TAU) * 0.08 + 0.08
      return { scaleX: s, scaleY: s }
    },
  },
  {
    id: 'wiggle',
    label: 'Wiggle',
    duration: 800,
    frames: 16,
    inset: 0.86,
    at: (t) => ({ rotate: Math.sin(t * TAU) * 0.26 }),
  },
  {
    id: 'party',
    label: 'Party',
    duration: 1000,
    frames: 20,
    inset: 1,
    at: (t) => ({ hue: t * 360, tint: 0.5 }),
  },
  {
    id: 'float',
    label: 'Float',
    duration: 1600,
    frames: 24,
    inset: 0.86,
    at: (t) => ({ y: Math.sin(t * TAU) * 0.06, rotate: Math.sin(t * TAU + 1) * 0.05 }),
  },
  {
    id: 'jiggle',
    label: 'Jiggle',
    duration: 900,
    frames: 22,
    inset: 0.78,
    // Flicked like jelly: a hard swing that wobbles down, swelling as it goes.
    at: (t) => {
      const swing = spring(t, 5, 3.2)
      const s = 1.02 + Math.abs(swing) * 0.14
      return { rotate: swing * 0.34, scaleX: s, scaleY: 2.04 - s }
    },
  },
  {
    id: 'heartbeat',
    label: 'Heartbeat',
    duration: 1000,
    frames: 20,
    inset: 0.84,
    // Two quick beats, then a rest.
    at: (t) => {
      const beat = (c: number) => Math.exp(-(((t - c) / 0.06) ** 2))
      const s = 1 + (beat(0.12) + beat(0.34) * 0.75) * 0.16
      return { scaleX: s, scaleY: s }
    },
  },
  {
    id: 'flip',
    label: 'Flip',
    duration: 1200,
    frames: 24,
    inset: 1,
    at: (t) => ({ scaleX: Math.cos(t * TAU) }),
  },
  {
    id: 'swing',
    label: 'Swing',
    duration: 1200,
    frames: 24,
    inset: 0.8,
    // Rotates around a pivot just above the emoji, like it's hanging from a nail.
    at: (t) => {
      const a = Math.sin(t * TAU) * 0.3
      const pivot = 0.42
      return { rotate: a, x: -Math.sin(a) * pivot, y: pivot - Math.cos(a) * pivot }
    },
  },
  {
    id: 'pop',
    label: 'Pop',
    duration: 1600,
    frames: 32,
    inset: 0.84,
    // Pops in with an overshoot and a burst of sparkles, holds, then pops out.
    // The loop starts mid-hold so the first frame (the one apps use as a
    // still) shows the whole emoji.
    at: (t) => {
      const p = (t + 0.5) % 1
      const s = p < 0.28 ? easeOutBack(p / 0.28) : p < 0.86 ? 1 : 1 - easeInBack((p - 0.86) / 0.14)
      const burst = p >= 0.08 && p < 0.72 ? (p - 0.08) / 0.64 : undefined
      return { scaleX: s, scaleY: s, rotate: p < 0.28 ? (s - 1) * 0.5 : 0, burst }
    },
  },
]

export function getAnimation(id: string): Animation {
  return ANIMATIONS.find((a) => a.id === id) ?? ANIMATIONS[0]
}

/**
 * Stacks several animations into one loop (e.g. Party + Bounce). The loop
 * runs as long as the slowest pick; faster ones repeat a whole number of
 * times inside it so the GIF still loops seamlessly. Transforms combine:
 * offsets, rotation and hue add up, scales multiply.
 */
export function composeAnimations(list: Animation[]): Animation {
  const moving = list.filter((a) => a.frames > 1)
  if (moving.length === 0) return ANIMATIONS[0]
  if (moving.length === 1) return moving[0]
  const duration = Math.max(...moving.map((a) => a.duration))
  const parts = moving.map((a) => ({ a, cycles: Math.max(1, Math.round(duration / a.duration)) }))
  return {
    id: moving.map((a) => a.id).join('+'),
    label: moving.map((a) => a.label).join(' + '),
    duration,
    frames: Math.max(...parts.map(({ a, cycles }) => a.frames * cycles)),
    minFrames: Math.max(...parts.map(({ a, cycles }) => (a.minFrames ?? 0) * cycles)),
    inset: Math.min(...moving.map((a) => a.inset)),
    at: (t) => {
      let rotate = 0,
        scaleX = 1,
        scaleY = 1,
        x = 0,
        y = 0
      let tint: number | undefined
      // Only color-cycling motions set hue, so "no hue" stays distinguishable from 0°.
      let hue: number | undefined
      let burst: number | undefined
      for (const { a, cycles } of parts) {
        const f = a.at((t * cycles) % 1)
        rotate += f.rotate ?? 0
        scaleX *= f.scaleX ?? 1
        scaleY *= f.scaleY ?? 1
        x += f.x ?? 0
        y += f.y ?? 0
        if (f.hue !== undefined) hue = (hue ?? 0) + f.hue
        if (f.tint !== undefined) tint = Math.max(tint ?? 0, f.tint)
        if (f.burst !== undefined) burst = f.burst
      }
      return { rotate, scaleX, scaleY, x, y, hue, tint, burst }
    },
  }
}

export const SPEED = { min: 0.25, max: 3, step: 0.25, default: 1 }

/**
 * Plays a loop faster or slower. Slower loops get more frames so they stay
 * smooth, faster ones fewer so no frame drops under the GIF's 20 ms floor.
 * The loop length is snapped to a whole number of 10 ms frames (an even
 * count, so halving frames for size still divides it), which keeps the
 * exported GIF exactly as fast as the preview.
 */
export function withSpeed(anim: Animation, speed: number): Animation {
  if (anim.frames <= 1 || speed === 1) return anim
  const target = anim.duration / speed
  const most = Math.max(anim.frames, 48)
  // Never fewer frames than the motion has (up to the 20 ms floor): faster
  // loops get shorter delays instead, or a quick shake lands only on its still
  // points. Among even counts near that, pick the one whose whole-10 ms delay
  // lands closest to the asked-for speed.
  const cap = Math.max(
    2,
    Math.min(Math.max(anim.frames, Math.round(anim.frames / speed)), most, Math.floor(target / 20)),
  )
  let frames = 2
  let delay = Math.max(20, Math.round(target / 2 / 10) * 10)
  let bestError = Infinity
  for (let f = cap - (cap % 2); f >= Math.max(2, Math.ceil(cap * 0.6)); f -= 2) {
    const d = Math.max(20, Math.round(target / f / 10) * 10)
    const error = Math.abs(d * f - target)
    if (error < bestError - 1e-9) {
      bestError = error
      frames = f
      delay = d
    }
    if (error / target < 0.05) break
  }
  return { ...anim, duration: delay * frames, frames }
}

export const INTENSITY = { min: 0.25, max: 2, step: 0.25, default: 1 }

/** Motions built from whole turns, which would break the loop if scaled. */
const WHOLE_TURNS = new Set(['spin', 'flip'])

/** Whether the Intensity slider changes this motion. */
export const takesIntensity = (id: string) => !WHOLE_TURNS.has(id)

/**
 * Makes a motion gentler or stronger: offsets, rotation and stretch scale by
 * `amount`, and Party's color wash gets lighter or heavier. The inset grows
 * with the motion so it still stays inside the canvas.
 */
export function withIntensity(anim: Animation, amount: number): Animation {
  if (anim.frames <= 1 || amount === 1) return anim
  const turns = WHOLE_TURNS.has(anim.id)
  return {
    ...anim,
    // Swing's reach grows faster than its angle (it hangs from a pivot), so it shrinks more.
    inset: turns
      ? anim.inset
      : Math.max(0.5, 1 - (1 - anim.inset) * amount * (anim.id === 'swing' && amount > 1 ? 1.3 : 1)),
    at: (t) => {
      const f = anim.at(t)
      if (turns) return f
      const stretch = (s: number | undefined) => (s === undefined ? undefined : 1 + (s - 1) * amount)
      return {
        rotate: f.rotate === undefined ? undefined : f.rotate * amount,
        scaleX: stretch(f.scaleX),
        scaleY: stretch(f.scaleY),
        x: f.x === undefined ? undefined : f.x * amount,
        y: f.y === undefined ? undefined : f.y * amount,
        hue: f.hue,
        tint: f.tint === undefined ? undefined : Math.min(0.8, f.tint * amount),
        burst: f.burst,
      }
    },
  }
}
