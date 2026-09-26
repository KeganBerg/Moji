import type { Animation } from '../lib/animations'
import type { RenderOptions } from '../lib/render'
import { EmojiCanvas } from './EmojiCanvas'

interface Props {
  source: HTMLCanvasElement
  animation: Animation
  options: RenderOptions
  name: string
}

/** The emoji at the sizes chat apps actually show it, on light and dark themes. */
export function ChatPreview({ source, animation, options, name }: Props) {
  const common = { source, animation, options }
  return (
    <div className="chat-preview">
      <div className="chat chat-light">
        <span className="chat-avatar" aria-hidden />
        <div className="chat-body">
          <div className="chat-meta">
            <strong>Alex</strong>
            <span>10:42 AM</span>
          </div>
          <p>
            shipped it <EmojiCanvas {...common} size={22} label={`:${name}: inline, light theme`} />
          </p>
          <span className="chat-reaction">
            <EmojiCanvas {...common} size={16} label={`:${name}: reaction`} /> 3
          </span>
        </div>
      </div>
      <div className="chat chat-dark">
        <span className="chat-avatar" aria-hidden />
        <div className="chat-body">
          <div className="chat-meta">
            <strong>Alex</strong>
            <span>Today at 10:42</span>
          </div>
          <EmojiCanvas {...common} size={48} label={`:${name}: large, dark theme`} />
        </div>
      </div>
    </div>
  )
}
