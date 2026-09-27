import {
  ArrowUp,
  Download,
  FlipHorizontal2,
  Check,
  Images,
  BookmarkPlus,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ChatPreview } from './components/ChatPreview'
import { EmojiCanvas } from './components/EmojiCanvas'
import { Gallery } from './components/Gallery'
import { Segmented } from './components/Segmented'
import { SiteFooter, SiteHeader } from './components/SiteChrome'
import { ANIMATIONS, composeAnimations, getAnimation } from './lib/animations'
import { exportGif, exportPng, type ExportResult } from './lib/export'
import {
  deleteFromGallery,
  getAutoSave,
  listGallery,
  saveToGallery,
  setAutoSave,
  type GalleryItem,
} from './lib/gallery'
import { MAX_PROMPT, STYLES, getGenerator, type StyleId } from './lib/generate'
import { PLATFORMS, formatBytes, sanitizeName, type PlatformId } from './lib/platforms'
import { DEFAULT_STRENGTH } from './lib/cutout'
import { DEFAULT_RENDER, loadImage, looksCuttable, prepareSource, type Fit, type RenderOptions } from './lib/render'
import { DEFAULT_TUNE, TUNE_CONTROLS, applyTune, isNeutral, type Tune } from './lib/tune'

interface HistoryItem {
  id: number
  image: HTMLImageElement
  /** Cut the subject out of its background, chosen per image. */
  cutout: boolean
  cutoutStrength: number
  /** What the cutout was when the image arrived, for Reset. */
  cutoutDefault: boolean
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
  const canvasBox = useRef<HTMLDivElement>(null)
  const previewSize = usePreviewSize(canvasBox)
  const previewInView = useInView(canvasBox)
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
  const [rotation, setRotation] = useState(0)
  const [flip, setFlip] = useState(false)
  const [tune, setTune] = useState<Tune>(DEFAULT_TUNE)
  const [name, setName] = useState('')

  const [exported, setExported] = useState<{ key: object; result: ExportResult } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [autoSave, setAutoSaveState] = useState(getAutoSave)
  // The export last saved, so the button can say "Saved" until something changes.
  const [savedResult, setSavedResult] = useState<ExportResult | null>(null)

  const active = history.find((h) => h.id === activeId) ?? null
  const platform = useMemo(() => {
    const base = PLATFORMS[platformId]
    return platformId === 'custom' ? { ...base, size: customSize, maxBytes: customKb * 1024 } : base
  }, [platformId, customSize, customKb])
  const animation = useMemo(() => composeAnimations(motionIds.map(getAnimation)), [motionIds])
  const toggleMotion = (id: string) =>
    setMotionIds((ids) => (id === 'none' ? [] : ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const options: RenderOptions = useMemo(
    () => ({ fit, padding, background, rotation, flip }),
    [fit, padding, background, rotation, flip],
  )
  const prepared = useMemo(
    () => (active ? prepareSource(active.image, trim, active.cutout ? active.cutoutStrength : null) : null),
    [active, trim],
  )
  const updateActive = (patch: Partial<HistoryItem>) =>
    setHistory((h) => h.map((item) => (item.id === activeId ? { ...item, ...patch } : item)))
  const source = useMemo(() => (prepared ? applyTune(prepared, tune) : null), [prepared, tune])
  const adjustChanged =
    fit !== DEFAULT_RENDER.fit ||
    padding !== DEFAULT_RENDER.padding ||
    background !== null ||
    !trim ||
    rotation !== 0 ||
    flip ||
    (!!active && (active.cutout !== active.cutoutDefault || active.cutoutStrength !== DEFAULT_STRENGTH))
  const resetAdjust = () => {
    setFit(DEFAULT_RENDER.fit)
    setPadding(DEFAULT_RENDER.padding)
    setBackground(null)
    setTrim(true)
    setRotation(0)
    setFlip(false)
    if (active) updateActive({ cutout: active.cutoutDefault, cutoutStrength: DEFAULT_STRENGTH })
  }
  // Back to the empty editor, as if the page had just loaded. The destination stays.
  const startOver = () => {
    abortRef.current?.abort()
    history.forEach((h) => URL.revokeObjectURL(h.thumb))
    setHistory([])
    setActiveId(null)
    setPrompt('')
    setName('')
    setMotionIds([])
    setTune(DEFAULT_TUNE)
    setError(null)
    resetAdjust()
  }
  // Quarter turns snap to the nearest 90° and wrap into -180..180.
  const turn = (dir: 1 | -1) =>
    setRotation((r) => {
      const next = Math.round(r / 90) * 90 + dir * 90
      return next > 180 ? next - 360 : next <= -180 ? next + 360 : next
    })
  const exportKey = useMemo(() => ({ source, options, animation, platform }), [source, options, animation, platform])
  const result = exported?.key === exportKey ? exported.result : null
  const exporting = !!source && !result
  const emojiName = sanitizeName(name || active?.name || 'moji', platformId)
  const extension = animation.frames > 1 ? 'gif' : 'png'
  const fileName = `${emojiName}.${extension}`

  const addImage = useCallback(async (blob: Blob, suggestedName: string, fromUpload: boolean) => {
    const image = await loadImage(blob)
    // Uploads on a plain background (a moon on black, a logo on white) get cut out
    // automatically. Generated images already come with a transparent background.
    const cutout = fromUpload && looksCuttable(image)
    const item: HistoryItem = {
      id: nextId.current++,
      image,
      cutout,
      cutoutDefault: cutout,
      cutoutStrength: DEFAULT_STRENGTH,
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
    // Rotation and tuning belong to the old image; start the new one clean.
    setRotation(0)
    setFlip(false)
    setTune(DEFAULT_TUNE)
  }, [])

  const onFile = useCallback(
    async (file: File) => {
      setError(null)
      try {
        await addImage(file, file.name.replace(/\.[^.]+$/, ''), true)
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
      await addImage(out.blob, text.split(/\s+/).slice(0, 3).join('_'), false)
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

  useEffect(() => {
    listGallery()
      .then(setGallery)
      .catch(() => {})
  }, [])

  const saveCurrent = async () => {
    if (!result || savedResult === result) return
    try {
      const item = await saveToGallery({
        name: emojiName,
        blob: result.blob,
        extension: result.extension,
        size: result.size,
        bytes: result.bytes,
        platform: platform.label,
      })
      setGallery((g) => [item, ...g])
      setSavedResult(result)
    } catch {
      setError("Couldn't save to the gallery. Your browser may be blocking storage.")
    }
  }

  const download = () => {
    if (!result) return
    downloadBlob(result.blob, fileName)
    if (autoSave) void saveCurrent()
  }

  const deleteSaved = async (item: GalleryItem) => {
    try {
      await deleteFromGallery(item.id)
      setGallery((g) => g.filter((i) => i.id !== item.id))
    } catch {
      setError("Couldn't delete that emoji.")
    }
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
      <SiteHeader>
        <button type="button" className="gallery-button" onClick={() => setGalleryOpen(true)}>
          <Images size={16} aria-hidden />
          Gallery
          {gallery.length > 0 && <span className="count">{gallery.length}</span>}
        </button>
      </SiteHeader>

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
          <div ref={canvasBox} className={`canvas checker${generating ? ' is-busy' : ''}`}>
            {source ? (
              <EmojiCanvas source={source} animation={animation} options={options} size={previewSize} />
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
              <div className="history-row">
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
                <button type="button" className="text-button start-over" onClick={startOver}>
                  <RotateCcw size={13} aria-hidden />
                  Start over
                </button>
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
              <div className="group-head">
                <h2>Adjust</h2>
                {adjustChanged && (
                  <button type="button" className="text-button" onClick={resetAdjust}>
                    Reset
                  </button>
                )}
              </div>
              <div className="setting">
                <span>Background</span>
                <Segmented
                  label="Background"
                  size="sm"
                  options={[
                    { value: 'keep', label: 'Keep' },
                    { value: 'remove', label: 'Remove' },
                  ]}
                  value={active?.cutout ? 'remove' : 'keep'}
                  onChange={(v) => updateActive({ cutout: v === 'remove' })}
                />
              </div>
              {active?.cutout && (
                <label className="setting">
                  <span>Strength</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={active.cutoutStrength}
                    onChange={(e) => updateActive({ cutoutStrength: Number(e.target.value) })}
                    onDoubleClick={() => updateActive({ cutoutStrength: DEFAULT_STRENGTH })}
                  />
                  <output>{active.cutoutStrength}</output>
                </label>
              )}
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
              <label className="setting">
                <span>Rotate</span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  onDoubleClick={() => setRotation(0)}
                />
                <output>{rotation}°</output>
              </label>
              <div className="setting">
                <span>Turn</span>
                <div className="icon-options">
                  <button type="button" className="icon-option" onClick={() => turn(-1)} title="Rotate left 90°">
                    <RotateCcw size={15} />
                  </button>
                  <button type="button" className="icon-option" onClick={() => turn(1)} title="Rotate right 90°">
                    <RotateCw size={15} />
                  </button>
                  <button
                    type="button"
                    className={`icon-option${flip ? ' is-active' : ''}`}
                    onClick={() => setFlip((f) => !f)}
                    aria-pressed={flip}
                    title="Flip horizontally"
                  >
                    <FlipHorizontal2 size={15} />
                  </button>
                </div>
              </div>
              <div className="setting">
                <span>Fill color</span>
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

            <div className="group">
              <div className="group-head">
                <h2>Tune</h2>
                {!isNeutral(tune) && (
                  <button type="button" className="text-button" onClick={() => setTune(DEFAULT_TUNE)}>
                    Reset
                  </button>
                )}
              </div>
              {TUNE_CONTROLS.map(({ key, label, min }) => (
                <label className="setting" key={key}>
                  <span>{label}</span>
                  <input
                    type="range"
                    min={min}
                    max={100}
                    step={1}
                    value={tune[key]}
                    onChange={(e) => setTune((t) => ({ ...t, [key]: Number(e.target.value) }))}
                    onDoubleClick={() => setTune((t) => ({ ...t, [key]: 0 }))}
                  />
                  <output>{tune[key] > 0 ? `+${tune[key]}` : tune[key]}</output>
                </label>
              ))}
            </div>

            <div className="group export">
              {source && (
                <div className="export-thumb checker" aria-hidden>
                  <EmojiCanvas source={source} animation={animation} options={options} size={44} />
                </div>
              )}
              <label className="field">
                <span>Name</span>
                <div className="input-affix">
                  <span>:</span>
                  {/* Sized to its text, so the closing colon sits right after the name. */}
                  <span className="affix-grow" data-value={name || emojiName}>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => name && setName(sanitizeName(name, platformId))}
                      placeholder={emojiName}
                      spellCheck={false}
                      size={1}
                    />
                  </span>
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
              <div className="save-row">
                <button
                  type="button"
                  className="text-button save-button"
                  onClick={saveCurrent}
                  disabled={!result || exporting || savedResult === result}
                >
                  {savedResult === result && result ? (
                    <>
                      <Check size={14} aria-hidden /> Saved to gallery
                    </>
                  ) : (
                    <>
                      <BookmarkPlus size={14} aria-hidden /> Save to gallery
                    </>
                  )}
                </button>
                <label className="auto-save">
                  <input
                    type="checkbox"
                    checked={autoSave}
                    onChange={(e) => {
                      setAutoSaveState(e.target.checked)
                      setAutoSave(e.target.checked)
                    }}
                  />
                  Save every download
                </label>
              </div>
            </div>
          </section>
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

      {source && !previewInView && (
        <div className="mini-preview checker" aria-hidden>
          <EmojiCanvas source={source} animation={animation} options={options} size={64} />
        </div>
      )}

      <Gallery
        open={galleryOpen}
        items={gallery}
        onClose={() => setGalleryOpen(false)}
        onDownload={(item) => downloadBlob(item.blob, `${item.name}.${item.extension}`)}
        onEdit={(item) => {
          setGalleryOpen(false)
          addImage(item.blob, item.name, false).catch((e) => setError((e as Error).message))
        }}
        onDelete={deleteSaved}
      />

      <SiteFooter />
    </div>
  )
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** The big preview grows with the space it has: about 60% of the box, between 160 and 384 px. */
function usePreviewSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState(208)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const next = Math.min(384, Math.max(160, Math.min(width, height) * 0.6))
      // Snap to 16 px steps so small resizes don't re-render every frame.
      setSize(Math.round(next / 16) * 16)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}

/** Whether most of an element is on screen, including inside scrolling panels. */
function useInView(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.intersectionRatio > 0.35), {
      threshold: [0, 0.35, 1],
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return inView
}
