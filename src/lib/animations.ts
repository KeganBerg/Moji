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
  at(t: number): FrameTransform
}

const TAU = Math.PI * 2

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
    duration: 800,
    frames: 20,
    inset: 0.8,
    at: (t) => {
      const h = Math.abs(Math.sin(t * Math.PI))
      // Squash a little on landing.
      const squash = h < 0.15 ? 1 - (0.15 - h) * 0.8 : 1
      return { y: 0.1 - h * 0.2, scaleY: squash, scaleX: 2 - squash }
    },
  },
  {
    id: 'shake',
    label: 'Shake',
    duration: 500,
    frames: 10,
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
    at: (t) => ({ hue: t * 360 }),
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
    duration: 700,
    frames: 16,
    inset: 0.78,
    // A wiggle that swells at each end of the swing.
    at: (t) => {
      const swing = Math.sin(t * TAU)
      const s = 1.02 + Math.abs(swing) * 0.12
      return { rotate: swing * 0.28, scaleX: s, scaleY: s }
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
    inset: Math.min(...moving.map((a) => a.inset)),
    at: (t) => {
      let rotate = 0,
        scaleX = 1,
        scaleY = 1,
        x = 0,
        y = 0
      // Only color-cycling motions set hue, so "no hue" stays distinguishable from 0°.
      let hue: number | undefined
      for (const { a, cycles } of parts) {
        const f = a.at((t * cycles) % 1)
        rotate += f.rotate ?? 0
        scaleX *= f.scaleX ?? 1
        scaleY *= f.scaleY ?? 1
        x += f.x ?? 0
        y += f.y ?? 0
        if (f.hue !== undefined) hue = (hue ?? 0) + f.hue
      }
      return { rotate, scaleX, scaleY, x, y, hue }
    },
  }
}
