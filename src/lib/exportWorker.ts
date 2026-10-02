// Builds animated GIF exports off the page's thread (see exportGifOffThread).
import { buildMotion } from './animations'
import { exportGif, type GifJob, type GifJobReply } from './export'

self.onmessage = async (e: MessageEvent<GifJob>) => {
  const { source, size, opts, motion, platform } = e.data
  let reply: GifJobReply
  try {
    // Drawing code works on canvases, so copy the bitmap onto one.
    const canvas = new OffscreenCanvas(source.width, source.height)
    canvas.getContext('2d')!.drawImage(source, 0, 0)
    source.close()
    const result = await exportGif(canvas as unknown as HTMLCanvasElement, size, opts, buildMotion(motion), platform)
    reply = { ok: true, result }
  } catch (err) {
    reply = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(reply)
}
