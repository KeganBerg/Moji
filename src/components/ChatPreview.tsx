import { useMemo } from 'react'
import type { Animation } from '../lib/animations'
import { personasFor, type Avatar } from '../lib/chatPersona'
import type { RenderOptions } from '../lib/render'
import { EmojiCanvas } from './EmojiCanvas'

interface Props {
  source: HTMLCanvasElement
  animation: Animation
  options: RenderOptions
  name: string
  /** Changes per image, so each one gets new made-up people. */
  seed: number
}

/** The emoji at the sizes chat apps actually show it, on light and dark themes. */
export function ChatPreview({ source, animation, options, name, seed }: Props) {
  const common = { source, animation, options }
  const { light, dark } = useMemo(() => personasFor(seed), [seed])
  return (
    <div className="chat-preview">
      <div className="chat chat-light">
        <PersonaAvatar avatar={light.avatar} />
        <div className="chat-body">
          <div className="chat-meta">
            <strong>{light.name}</strong>
            <span>{light.time}</span>
          </div>
          <p>
            {light.message} <EmojiCanvas {...common} size={22} label={`:${name}: inline, light theme`} />
          </p>
          <span className="chat-reaction">
            <EmojiCanvas {...common} size={16} label={`:${name}: reaction`} /> {2 + (seed % 7)}
          </span>
        </div>
      </div>
      <div className="chat chat-dark">
        <PersonaAvatar avatar={dark.avatar} />
        <div className="chat-body">
          <div className="chat-meta">
            <strong>{dark.name}</strong>
            <span>{dark.time}</span>
          </div>
          <p>{dark.message}</p>
          <EmojiCanvas {...common} size={48} label={`:${name}: large, dark theme`} />
        </div>
      </div>
    </div>
  )
}

function PersonaAvatar({ avatar }: { avatar: Avatar }) {
  return (
    <span
      className={`chat-avatar${avatar.emoji ? ' is-emoji' : ''}`}
      style={{ background: avatar.background }}
      aria-hidden
    >
      {avatar.text}
    </span>
  )
}
