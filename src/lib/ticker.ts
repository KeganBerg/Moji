/** One shared requestAnimationFrame loop for every animated preview on the page. */
type Tick = (now: number) => void

const subscribers = new Set<Tick>()
let frame = 0
let paused = false

function loop(now: number) {
  subscribers.forEach((fn) => fn(now))
  frame = subscribers.size && !paused ? requestAnimationFrame(loop) : 0
}

export function subscribe(fn: Tick): () => void {
  subscribers.add(fn)
  if (!frame && !paused) frame = requestAnimationFrame(loop)
  return () => {
    subscribers.delete(fn)
  }
}

/** Stops or restarts every preview; each keeps showing its current frame while paused. */
export function setPaused(value: boolean) {
  paused = value
  if (paused && frame) {
    cancelAnimationFrame(frame)
    frame = 0
  } else if (!paused && !frame && subscribers.size) frame = requestAnimationFrame(loop)
}
