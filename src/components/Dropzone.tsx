import { useEffect, useRef, useState } from 'react'

interface Props {
  onFile: (file: File) => void
}

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml'

export function Dropzone({ onFile }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  // Pasting an image anywhere on the page loads it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) onFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onFile])

  return (
    <>
      <button
        type="button"
        className={`dropzone${over ? ' over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
          if (file) onFile(file)
        }}
      >
        <span className="dropzone-icon" aria-hidden>
          ⬆
        </span>
        <strong>Drop an image, paste, or click to upload</strong>
        <span className="muted">PNG with a transparent background works best</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </>
  )
}
