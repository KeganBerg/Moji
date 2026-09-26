import { ArrowUp, Download, ImagePlus, LoaderCircle, Sparkles, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdSlot } from './components/AdSlot'
import { ChatPreview } from './components/ChatPreview'
import { EmojiCanvas } from './components/EmojiCanvas'
import { Segmented } from './components/Segmented'
import { ANIMATIONS, composeAnimations, getAnimation } from './lib/animations'
import { exportGif, exportPng, type ExportResult } from './lib/export'
import { MAX_PROMPT, STYLES, getGenerator, type StyleId } from './lib/generate'
import { PLATFORMS, formatBytes, sanitizeName, type PlatformId } from './lib/platforms'
import { DEFAULT_RENDER, loadImage, prepareSource, type Fit, type RenderOptions } from './lib/render'

interface HistoryItem {
  id: number
  image: HTMLImageElement
  thumb: string
  name: string
}

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml'
const HISTORY_LIMIT = 8
const PLATFORM_OPTIONS = (Object.keys(PLATFORMS) as PlatformId[]).map((id) => ({
  value: id,
  label: PLATFORMS[id].label,
}))

export default function App() {
  const generator = useMemo(() => getGenerator(), [])
  const fileInput = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const nextId = useRef(1)

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState<StyleId>('flat')
  const [generating, setGenerating] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const [platformId, setPlatformId] = useState<PlatformId>('slack')
  const [customSize, setCustomSize] = useState(128)
  const [customKb, setCustomKb] = useState(256)
  // Picked motions stack (e.g. Party + Bounce); an empty list means static.
  const [motionIds, setMotionIds] = useState<string[]>([])
  const [fit, setFit] = useState<Fit>(DEFAULT_RENDER.fit)
  const [padding, setPadding] = useState(DEFAULT_RENDER.padding)
  const [background, setBackground] = useState<string | null>(null)
  const [trim, setTrim] = useState(true)
  const [name, setName] = useState('')

  const [exported, setExported] = useState<{ key: object; result: ExportResult } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const active = history.find((h) => h.id === activeId) ?? null
  const platform = useMemo(() => {
    const base = PLATFORMS[platformId]
    return platformId === 'custom' ? { ...base, size: customSize, maxBytes: customKb * 1024 } : base
  }, [platformId, customSize, customKb])
  const animation = useMemo(() => composeAnimations(motionIds.map(getAnimation)), [motionIds])
  const toggleMotion = (id: string) =>
    setMotionIds((ids) => (id === 'none' ? [] : ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const options: RenderOptions = useMemo(() => ({ fit, padding, background }), [fit, padding, background])
  const source = useMemo(() => (active ? prepareSource(active.image, trim) : null), [active, trim])
  const exportKey = useMemo(() => ({ source, options, animation, platform }), [source, options, animation, platform])
  const result = exported?.key === exportKey ? exported.result : null
  const exporting = !!source && !result
  const emojiName = sanitizeName(name || active?.name || 'moji', platformId)
  const extension = animation.frames > 1 ? 'gif' : 'png'
  const fileName = `${emojiName}.${extension}`

  const addImage = useCallback(async (blob: Blob, suggestedName: string) => {
    const image = await loadImage(blob)
    const item: HistoryItem = {
      id: nextId.current++,
      image,
      thumb: URL.createObjectURL(blob),
      name: sanitizeName(suggestedName, 'discord'),
    }
    setHistory((h) => {
      const next = [item, ...h]
      next.slice(HISTORY_LIMIT).forEach((old) => URL.revokeObjectURL(old.thumb))
      return next.slice(0, HISTORY_LIMIT)
    })
    setActiveId(item.id)
    setName('')
  }, [])

  const onFile = useCallback(
    async (file: File) => {
      setError(null)
      try {
        await addImage(file, file.name.replace(/\.[^.]+$/, ''))
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [addImage],
  )

  const generate = async () => {
    const text = prompt.trim()
    if (!text || generating) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)
    setError(null)
    try {
      const out = await generator.generate({ prompt: text, style }, controller.signal)
      if (out.remaining !== null) setRemaining(out.remaining)
      await addImage(out.blob, text.split(/\s+/).slice(0, 3).join('_'))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      if (abortRef.current === controller) setGenerating(false)
    }
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  // Pasting an image anywhere loads it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) onFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onFile])

  // Re-export on every change so the size check is always current.
  useEffect(() => {
    if (!source) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const out =
          animation.frames > 1
            ? await exportGif(source, platform.size, options, animation, platform)
            : await exportPng(source, platform.size, options, platform)
        if (!cancelled) setExported({ key: exportKey, result: out })
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [source, options, animation, platform, exportKey])

  const download = () => {
    if (!result) return
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const specLine = [
    `${platform.size}×${platform.size}`,
    `under ${formatBytes(platform.maxBytes)}`,
    platform.maxFrames < 200 ? `GIF up to ${platform.maxFrames} frames` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Moji Locker home">
          <svg viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="9" />
            <circle cx="11.5" cy="13" r="2.2" />
            <circle cx="20.5" cy="13" r="2.2" />
            <path d="M10 19.5c1.6 2.6 3.8 3.9 6 3.9s4.4-1.3 6-3.9" />
          </svg>
          Moji Locker
        </a>
        <p className="topbar-tag">Custom emoji, sized right for Slack and Discord.</p>
      </header>

      <main className="workspace">
        <section
          className={`stage${dragging ? ' is-dragging' : ''}`}
          aria-label="Emoji preview"
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
            if (file) onFile(file)
          }}
        >
          <div className={`canvas checker${generating ? ' is-busy' : ''}`}>
            {source ? (
              <EmojiCanvas source={source} animation={animation} options={options} size={208} />
            ) : (
              <button type="button" className="empty" onClick={() => fileInput.current?.click()}>
                <span className="empty-icon">
                  <ImagePlus size={22} strokeWidth={1.75} />
                </span>
                <strong>Drop an image, or describe one below</strong>
                <span>PNG, JPG, GIF or WebP. Pasting works too.</span>
              </button>
            )}
            {generating && (
              <div className="busy" role="status">
                <LoaderCircle className="spin" size={18} />
                Generating
              </div>
            )}
          </div>

          {source && active && (
            <ChatPreview source={source} animation={animation} options={options} name={emojiName} seed={active.id} />
          )}

          <div className="composer-wrap">
            {history.length > 0 && (
              <div className="history" aria-label="Recent images">
                {history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className={`history-item checker${h.id === activeId ? ' is-active' : ''}`}
                    onClick={() => setActiveId(h.id)}
                    aria-label={`Use ${h.name}`}
                    aria-pressed={h.id === activeId}
                  >
                    <img src={h.thumb} alt="" />
                  </button>
                ))}
              </div>
            )}

            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault()
                generate()
              }}
            >
              <button
                type="button"
                className="icon-button"
                onClick={() => fileInput.current?.click()}
                aria-label="Upload an image"
                title="Upload an image"
              >
                <Upload size={18} />
              </button>
              <input
                className="composer-input"
                value={prompt}
                maxLength={MAX_PROMPT}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe an emoji, like a tiny taco wearing sunglasses"
                aria-label="Describe an emoji"
              />
              <select
                className="style-select"
                value={style}
                onChange={(e) => setStyle(e.target.value as StyleId)}
                aria-label="Style"
              >
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="send"
                disabled={!prompt.trim() || generating}
                aria-label="Generate"
                title="Generate"
              >
                {generating ? <LoaderCircle className="spin" size={18} /> : <ArrowUp size={18} />}
              </button>
            </form>
            <p className="composer-note">
              <Sparkles size={13} />
              {generator.isReal
                ? remaining !== null
                  ? `${remaining} AI generations left today`
                  : 'AI generation, with transparent backgrounds'
                : 'Offline preview: AI generation is not connected in this build'}
            </p>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFile(file)
              e.target.value = ''
            }}
          />
        </section>

        <div className="sidebar">
          <section className="inspector" aria-label="Settings">
            <div className="group">
              <h2>Destination</h2>
              <Segmented label="Destination" options={PLATFORM_OPTIONS} value={platformId} onChange={setPlatformId} />
              {platformId === 'custom' ? (
                <div className="field-row">
                  <label className="field">
                    <span>Size</span>
                    <div className="input-suffix">
                      <input
                        type="number"
                        min={16}
                        max={512}
                        value={customSize}
                        onChange={(e) => setCustomSize(Math.min(512, Math.max(16, Number(e.target.value) || 128)))}
                      />
                      <span>px</span>
                    </div>
                  </label>
                  <label className="field">
                    <span>Max file</span>
                    <div className="input-suffix">
                      <input
                        type="number"
                        min={8}
                        max={5120}
                        value={customKb}
                        onChange={(e) => setCustomKb(Math.min(5120, Math.max(8, Number(e.target.value) || 256)))}
                      />
                      <span>KB</span>
                    </div>
                  </label>
                </div>
              ) : (
                <p className="hint">{specLine}</p>
              )}
            </div>

            <div className="group">
              <div className="group-head">
                <h2>Motion</h2>
                <span className="hint">{motionIds.length > 1 ? animation.label : 'Pick one or combine a few'}</span>
              </div>
              <div className="motions" role="group" aria-label="Motion">
                {ANIMATIONS.map((a) => {
                  const on = a.id === 'none' ? motionIds.length === 0 : motionIds.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      className={`motion${on ? ' is-active' : ''}`}
                      onClick={() => toggleMotion(a.id)}
                    >
                      <span className="motion-thumb">
                        {source ? (
                          <EmojiCanvas source={source} animation={a} options={options} size={36} />
                        ) : (
                          <span className="motion-dot" style={{ animationName: `demo-${a.id}` }} />
                        )}
                      </span>
                      <span>{a.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="group">
              <h2>Adjust</h2>
              <div className="setting">
                <span>Framing</span>
                <Segmented
                  label="Framing"
                  size="sm"
                  options={[
                    { value: 'contain', label: 'Fit' },
                    { value: 'cover', label: 'Fill' },
                  ]}
                  value={fit}
                  onChange={setFit}
                />
              </div>
              <label className="setting">
                <span>Padding</span>
                <input
                  type="range"
                  min={0}
                  max={0.3}
                  step={0.01}
                  value={padding}
                  onChange={(e) => setPadding(Number(e.target.value))}
                />
                <output>{Math.round(padding * 100)}%</output>
              </label>
              <div className="setting">
                <span>Background</span>
                <div className="bg-options">
                  <button
                    type="button"
                    className={`swatch swatch-none checker${background === null ? ' is-active' : ''}`}
                    onClick={() => setBackground(null)}
                    aria-label="Transparent background"
                    aria-pressed={background === null}
                  />
                  <label
                    className={`swatch${background !== null ? ' is-active' : ''}`}
                    style={{ background: background ?? '#ffffff' }}
                    title="Solid color"
                  >
                    <input
                      type="color"
                      value={background ?? '#ffffff'}
                      onChange={(e) => setBackground(e.target.value)}
                      aria-label="Background color"
                    />
                  </label>
                </div>
              </div>
              <label className="setting toggle">
                <span>Trim empty edges</span>
                <input type="checkbox" role="switch" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
              </label>
            </div>

            <div className="group export">
              <label className="field">
                <span>Name</span>
                <div className="input-affix">
                  <span>:</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => name && setName(sanitizeName(name, platformId))}
                    placeholder={emojiName}
                    spellCheck={false}
                  />
                  <span>:</span>
                </div>
              </label>

              <div className={`status${result ? (result.withinLimit ? ' is-ok' : ' is-over') : ''}`} aria-live="polite">
                {!source ? (
                  'Add an image to export'
                ) : exporting || !result ? (
                  `Sizing for ${platform.label}…`
                ) : (
                  <>
                    <span className="status-dot" />
                    <span>
                      {result.withinLimit ? 'Ready' : 'Over limit'} · {result.size}×{result.size}{' '}
                      {result.extension.toUpperCase()} · {formatBytes(result.bytes)} of {formatBytes(platform.maxBytes)}
                    </span>
                  </>
                )}
              </div>
              {result && !result.withinLimit && (
                <p className="hint">Try Fill framing, a simpler motion, or a solid background.</p>
              )}

              <button type="button" className="primary" onClick={download} disabled={!result || exporting}>
                <Download size={16} />
                Download {fileName}
              </button>
            </div>
          </section>

          <AdSlot format="rectangle" />
        </div>
      </main>

      {error && (
        <div className="toast" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <AdSlot format="banner" />

      <footer className="footer">
        Images you upload never leave your browser. Descriptions are sent to the image model only when you generate.
      </footer>
    </div>
  )
}
