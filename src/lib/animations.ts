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
  /** Degrees of hue rotation. */
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
]

export function getAnimation(id: string): Animation {
  return ANIMATIONS.find((a) => a.id === id) ?? ANIMATIONS[0]
}
