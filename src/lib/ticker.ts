/** One shared requestAnimationFrame loop for every animated preview on the page. */
type Tick = (now: number) => void

const subscribers = new Set<Tick>()
let frame = 0

function loop(now: number) {
  subscribers.forEach((fn) => fn(now))
  frame = subscribers.size ? requestAnimationFrame(loop) : 0
}

export function subscribe(fn: Tick): () => void {
  subscribers.add(fn)
  if (!frame) frame = requestAnimationFrame(loop)
  return () => {
    subscribers.delete(fn)
  }
}
