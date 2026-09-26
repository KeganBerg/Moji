import { useEffect, useRef } from 'react'
import type { Animation } from '../lib/animations'
import { drawFrame, type RenderOptions } from '../lib/render'
import { subscribe } from '../lib/ticker'

interface Props {
  source: HTMLCanvasElement
  animation: Animation
  options: RenderOptions
  /** CSS pixels. */
  size: number
  className?: string
  label?: string
}

/** Live, looping preview of the emoji drawn exactly the way export draws it. */
export function EmojiCanvas({ source, animation, options, size, className, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const px = Math.round(size * (window.devicePixelRatio || 1))
    canvas.width = canvas.height = px
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const draw = (now: number) => {
      const t = (now % animation.duration) / animation.duration
      drawFrame(ctx, source, px, options, animation.at(t), animation.inset)
    }
    draw(performance.now())
    if (animation.frames <= 1) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return
    return subscribe(draw)
  }, [source, animation, options, size])

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${animation.label} emoji preview`}
    />
  )
}
