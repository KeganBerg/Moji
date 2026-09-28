import {
  ArrowUp,
  Check,
  Copy,
  Download,
  ExternalLink,
  FlipHorizontal2,
  Hash,
  Ghost,
  Globe,
  Images,
  ImagePlus,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Save,
  SaveCheck,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ChatPreview } from './components/ChatPreview'
import { EmojiCanvas } from './components/EmojiCanvas'
import { setPaused } from './lib/ticker'
import { Gallery } from './components/Gallery'
import { Segmented } from './components/Segmented'
import { SiteFooter, SiteHeader } from './components/SiteChrome'
import {
  ANIMATIONS,
  INTENSITY,
  SPEED,
  SPIN_DIRECTIONS,
  composeAnimations,
  getAnimation,
  stepped,
  withIntensity,
  withSpeed,
  withSpinDirection,
  type Animation,
  type SpinDirection,
} from './lib/animations'
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
import { useSeason } from './lib/season'
import { DEFAULT_RENDER, loadImage, looksCuttable, prepareSource, type Fit, type RenderOptions } from './lib/render'
import { DEFAULT_TUNE, TUNE_CONTROLS, applyTune, isNeutral, type Tune } from './lib/tune'
import { I18nProvider } from './components/I18nProvider'
import { NumberField } from './components/NumberField'
import { LANGUAGES, setLanguage, useI18n, type LangCode, type MessageKey } from './lib/i18n'
import { errorText, toUiError, type UiError } from './lib/errors'

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

// Message keys for labels defined by id in lib/.
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const motionKey = (id: string) => `motion${capitalize(id)}` as MessageKey
const SPIN_LABELS: Record<SpinDirection, MessageKey> = { cw: 'spinCw', ccw: 'spinCcw', chaotic: 'spinChaotic' }
const STYLE_KEYS: Record<StyleId, MessageKey> = {
  flat: 'styleFlat',
  '3d': 'style3d',
  sticker: 'styleSticker',
  pixel: 'stylePixel',
  'hand-drawn': 'styleSketch',
}

function linkedPrompt(): { prompt: string; style: StyleId } | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const prompt = params.get('prompt')?.trim().slice(0, MAX_PROMPT)
  if (!prompt) return null
  return { prompt, style: STYLES.find((s) => s.id === params.get('style'))?.id ?? 'flat' }
}

export default function App() {
  return (
    <I18nProvider>
      <Editor />
    </I18nProvider>
  )
}

function Editor() {
  const { t, lang, plural } = useI18n()
  const season = useSeason()
  const generator = useMemo(() => getGenerator(), [])
  const fileInput = useRef<HTMLInputElement>(null)
  const canvasBox = useRef<HTMLDivElement>(null)
  const previewSize = usePreviewSize(canvasBox)
  const previewInView = useInView(canvasBox)
  const exportBar = useRef<HTMLDivElement>(null)
  useHeightVar(exportBar, '--export-bar-h')
  const abortRef = useRef<AbortController | null>(null)
  const nextId = useRef(1)

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  // ?prompt=…&style=… (from the Slack app's Edit in Moji Locker button).
  const [linked] = useState(linkedPrompt)
  const [prompt, setPrompt] = useState(linked?.prompt ?? '')
  const [style, setStyle] = useState<StyleId>(linked?.style ?? 'flat')
  const [generating, setGenerating] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const [platformId, setPlatformId] = useState<PlatformId>('slack')
  const [customSize, setCustomSize] = useState(128)
  const [customKb, setCustomKb] = useState(256)
  // Picked motions stack (e.g. Party + Bounce); an empty list means static.
  const [motionIds, setMotionIds] = useState<string[]>([])
  const [speed, setSpeed] = useState(SPEED.default)
  const [intensity, setIntensity] = useState(INTENSITY.default)
  const [spinDirection, setSpinDirection] = useState<SpinDirection>('cw')
  const [fit, setFit] = useState<Fit>(DEFAULT_RENDER.fit)
  const [padding, setPadding] = useState(DEFAULT_RENDER.padding)
  const [background, setBackground] = useState<string | null>(null)
  const [trim, setTrim] = useState(true)
  const [rotation, setRotation] = useState(0)
  const [flip, setFlip] = useState(false)
  const [corners, setCorners] = useState(DEFAULT_RENDER.corners)
  const [tune, setTune] = useState<Tune>(DEFAULT_TUNE)
  const [name, setName] = useState('')

  const [exported, setExported] = useState<{ key: object; animation: Animation; result: ExportResult } | null>(null)
  const [error, setError] = useState<UiError | null>(null)

  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [paused, setPausedState] = useState(false)
  useEffect(() => {
    setPaused(paused)
    document.documentElement.toggleAttribute('data-paused', paused)
  }, [paused])
  const [autoSave, setAutoSaveState] = useState(getAutoSave)
  // The export last saved, so the button can say "Saved" until something changes.
  const [savedResult, setSavedResult] = useState<ExportResult | null>(null)

  const active = history.find((h) => h.id === activeId) ?? null
  const platform = useMemo(() => {
    const base = PLATFORMS[platformId]
    return platformId === 'custom' ? { ...base, size: customSize, maxBytes: customKb * 1024 } : base
  }, [platformId, customSize, customKb])
  // Instagram stickers don't animate, so that preset previews and exports a still.
  const animation = useMemo(
    () =>
      platform.staticOnly
        ? getAnimation('none')
        : withSpeed(
            composeAnimations(
              motionIds.map((id) => withIntensity(withSpinDirection(getAnimation(id), spinDirection), intensity)),
            ),
            speed,
          ),
    [motionIds, speed, intensity, spinDirection, platform.staticOnly],
  )
  // The motion picker's thumbnails play at the chosen speed, intensity and spin direction too, frame for frame.
  const motionThumbs = useMemo(
    () =>
      ANIMATIONS.map((a) => {
        const anim = withSpeed(withIntensity(withSpinDirection(a, spinDirection), intensity), speed)
        return stepped(anim, anim.frames)
      }),
    [speed, intensity, spinDirection],
  )
  const toggleMotion = (id: string) =>
    setMotionIds((ids) => (id === 'none' ? [] : ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const options: RenderOptions = useMemo(
    () => ({ fit, padding, background, rotation, flip, corners }),
    [fit, padding, background, rotation, flip, corners],
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
    corners !== DEFAULT_RENDER.corners ||
    (!!active && (active.cutout !== active.cutoutDefault || active.cutoutStrength !== DEFAULT_STRENGTH))
  const resetAdjust = () => {
    setFit(DEFAULT_RENDER.fit)
    setPadding(DEFAULT_RENDER.padding)
    setBackground(null)
    setTrim(true)
    setRotation(0)
    setFlip(false)
    setCorners(DEFAULT_RENDER.corners)
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
    setSpeed(SPEED.default)
    setIntensity(INTENSITY.default)
    setSpinDirection('cw')
    setTune(DEFAULT_TUNE)
    setError(null)
    resetAdjust()
  }
  // Switching images starts the new one clean, as a fresh upload does.
  const selectImage = (id: number) => {
    if (id === activeId) return
    setActiveId(id)
    setRotation(0)
    setFlip(false)
    setTune(DEFAULT_TUNE)
  }
  // Quarter turns go to the next multiple of 90° in that direction and wrap into -180..180.
  const turn = (dir: 1 | -1) =>
    setRotation((r) => {
      const next = dir > 0 ? Math.floor(r / 90) * 90 + 90 : Math.ceil(r / 90) * 90 - 90
      return next > 180 ? next - 360 : next <= -180 ? next + 360 : next
    })
  const exportKey = useMemo(() => ({ source, options, animation, platform }), [source, options, animation, platform])
  const result = exported?.key === exportKey ? exported.result : null
  // Previews step through the frames the GIF will have, so they show exactly
  // what downloads. While a new export runs they keep the last one's frame
  // count if the motion is the same, so the preview doesn't flicker.
  const exportedFrames = exported?.animation === animation ? exported.result.frames : animation.frames
  const preview = useMemo(() => stepped(animation, exportedFrames), [animation, exportedFrames])
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
        setError(toUiError(e))
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
      if ((e as Error).name !== 'AbortError') setError(toUiError(e))
    } finally {
      if (abortRef.current === controller) setGenerating(false)
    }
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  // Links from the Slack app open with that emoji already generated; it's a
  // cache hit, so it's free and doesn't use up the limit.
  const linkedRun = useRef(false)
  const generateRef = useRef(generate)
  useEffect(() => {
    generateRef.current = generate
  })
  useEffect(() => {
    if (!linked || linkedRun.current) return
    linkedRun.current = true
    window.history.replaceState(null, '', window.location.pathname)
    generateRef.current()
  }, [linked])

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
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const out =
          animation.frames > 1
            ? await exportGif(source, platform.size, options, animation, platform, controller.signal)
            : await exportPng(source, platform.size, options, platform, controller.signal)
        if (!cancelled) setExported({ key: exportKey, animation, result: out })
      } catch (e) {
        if (!cancelled) setError(toUiError(e))
      }
    }, 200)
    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [source, options, animation, platform, exportKey])

  useEffect(() => {
    listGallery()
      .then(setGallery)
      .catch(() => {})
  }, [])

  const saving = useRef<ExportResult | null>(null)
  const saveCurrent = async () => {
    if (!result || savedResult === result || saving.current === result) return
    saving.current = result
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
      setError({ key: 'saveFailed' })
    } finally {
      saving.current = null
    }
  }

  // A click while the file is still being sized downloads it once it's ready
  // (for the same image; picking another one cancels it).
  const downloadWanted = useRef<HTMLCanvasElement | null>(null)
  const download = () => {
    if (!result) {
      downloadWanted.current = source
      return
    }
    downloadBlob(result.blob, fileName)
    if (autoSave) void saveCurrent()
  }
  const downloadRef = useRef(download)
  useEffect(() => {
    downloadRef.current = download
  })
  useEffect(() => {
    if (!result || !downloadWanted.current) return
    const wanted = downloadWanted.current === source
    downloadWanted.current = null
    if (wanted) downloadRef.current()
  }, [result, source])

  // Instagram: copy the PNG so it can be pasted into a Story as a sticker.
  const canCopy = typeof window !== 'undefined' && 'ClipboardItem' in window && !!navigator.clipboard?.write
  const [copiedResult, setCopiedResult] = useState<ExportResult | null>(null)
  const copySticker = async () => {
    if (!result) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ [result.blob.type]: result.blob })])
      setCopiedResult(result)
    } catch {
      setError({ key: 'copyFailed' })
    }
  }
  // GIPHY: its upload page takes a file, so hand over the sticker and open it.
  const postToGiphy = () => {
    if (!result) return
    window.open('https://giphy.com/upload', '_blank', 'noopener')
    download()
  }
  // What GIPHY would reject: a still image, or a solid background.
  const stickerIssue = platform.stickerRules
    ? animation.frames < 2
      ? t('giphyNeedsMotion')
      : background !== null
        ? t('giphyNeedsClear')
        : null
    : null

  const deleteSaved = async (item: GalleryItem) => {
    try {
      await deleteFromGallery(item.id)
      setGallery((g) => g.filter((i) => i.id !== item.id))
    } catch {
      setError({ key: 'deleteFailed' })
    }
  }

  const specLine = [
    `${platform.size}×${platform.size}`,
    t('specUnder', { size: isolate(formatBytes(platform.maxBytes)) }),
    platform.maxFrames > 1 && platform.maxFrames < 200 ? t('specFrames', { n: platform.maxFrames }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const platformOption = (id: PlatformId) => ({ value: id, label: id === 'custom' ? t('custom') : PLATFORMS[id].label })
  const motionLabel = motionIds.map((id) => t(motionKey(id))).join(' + ')

  return (
    <div className="shell">
      <SiteHeader>
        <a className="slack-link" href="/slack" title={t('slackAppTitle')}>
          <Hash size={15} aria-hidden />
          {t('slackApp')}
        </a>
        <label className="icon-button language-picker" title={t('language')}>
          <Globe size={17} aria-hidden />
          <select
            value={lang}
            onChange={(e) => void setLanguage(e.target.value as LangCode)}
            aria-label={t('language')}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="gallery-button" onClick={() => setGalleryOpen(true)}>
          <Images size={16} aria-hidden />
          <span className="gallery-text">{t('gallery')}</span>
          {gallery.length > 0 && <span className="count">{gallery.length}</span>}
        </button>
      </SiteHeader>

      <main className="workspace">
        <h1 className="sr-only">Moji Locker</h1>
        <section
          className={`stage${dragging ? ' is-dragging' : ''}`}
          aria-label={t('emojiPreview')}
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
            const files = [...e.dataTransfer.files]
            const file = files.find((f) => f.type.startsWith('image/'))
            if (file) onFile(file)
            else if (files.length) setError({ key: 'errNotImage' })
          }}
        >
          <div ref={canvasBox} className={`canvas checker${generating ? ' is-busy' : ''}`}>
            {source ? (
              <EmojiCanvas
                source={source}
                animation={preview}
                options={options}
                size={previewSize}
                label={t('emojiPreview')}
              />
            ) : (
              <button type="button" className="empty" onClick={() => fileInput.current?.click()}>
                <span className={`empty-icon${season.on ? ' is-ghost' : ''}`}>
                  {season.on ? <Ghost size={22} strokeWidth={1.75} /> : <ImagePlus size={22} strokeWidth={1.75} />}
                </span>
                <strong>{t('dropTitle')}</strong>
                <span>{t('dropFormats')}</span>
              </button>
            )}
            {source && (
              <button
                type="button"
                className="icon-button pause-button"
                aria-pressed={paused}
                aria-label={t('pauseAnimations')}
                title={paused ? t('playAnimations') : t('pauseAnimations')}
                onClick={() => setPausedState(!paused)}
              >
                {paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
              </button>
            )}
            {generating && (
              <div className="busy" aria-hidden>
                <LoaderCircle className="spin" size={18} />
                {t('generating')}
              </div>
            )}
            <span className="sr-only" role="status">
              {generating ? t('generating') : ''}
            </span>
          </div>

          {source && active && (
            <ChatPreview source={source} animation={preview} options={options} name={emojiName} seed={active.id} />
          )}

          <div className="composer-wrap">
            {history.length > 0 && (
              <div className="history-row">
                <div className="history" aria-label={t('recentImages')}>
                  {history.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className={`history-item checker${h.id === activeId ? ' is-active' : ''}`}
                      onClick={() => selectImage(h.id)}
                      aria-label={t('useImage', { name: h.name })}
                      aria-pressed={h.id === activeId}
                    >
                      <img src={h.thumb} alt="" />
                    </button>
                  ))}
                </div>
                <button type="button" className="text-button start-over" onClick={startOver}>
                  <RotateCcw size={13} aria-hidden />
                  {t('startOver')}
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
                aria-label={t('uploadImage')}
                title={t('uploadImage')}
              >
                <Upload size={18} />
              </button>
              <input
                className="composer-input"
                value={prompt}
                maxLength={MAX_PROMPT}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('describePlaceholder')}
                aria-label={t('describeLabel')}
              />
              <select
                className="style-select"
                value={style}
                onChange={(e) => setStyle(e.target.value as StyleId)}
                aria-label={t('style')}
              >
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(STYLE_KEYS[s.id])}
                  </option>
                ))}
              </select>
              {active && (
                <button
                  type="button"
                  className={`icon-button save-button${savedResult === result && result ? ' is-saved' : ''}`}
                  onClick={saveCurrent}
                  disabled={!result || exporting || savedResult === result}
                  aria-label={savedResult === result && result ? t('savedToGallery') : t('saveToGallery')}
                  title={savedResult === result && result ? t('savedToGallery') : t('saveToGallery')}
                >
                  {savedResult === result && result ? <SaveCheck size={18} /> : <Save size={18} />}
                </button>
              )}
              <button
                type="submit"
                className="send"
                disabled={!prompt.trim() || generating}
                aria-label={t('generate')}
                title={t('generate')}
              >
                {generating ? <LoaderCircle className="spin" size={18} /> : <ArrowUp size={18} />}
              </button>
            </form>
            <p className="composer-note">
              <Sparkles size={13} />
              {generator.isReal
                ? remaining !== null
                  ? plural(remaining, 'generationsLeftOne', 'generationsLeft')
                  : t('aiNote')
                : t('offlineNote')}
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
          <section className="inspector" aria-label={t('settings')}>
            <div className="group">
              <h2>{t('destination')}</h2>
              {/* Two rows so every name fits: custom emoji apps, then sticker apps. */}
              <div className="setting">
                <span>{t('emoji')}</span>
                <Segmented
                  label={t('emoji')}
                  size="sm"
                  options={(['slack', 'discord', 'custom'] as const).map(platformOption)}
                  value={platformId}
                  onChange={setPlatformId}
                />
              </div>
              <div className="setting">
                <span>{t('stickers')}</span>
                <Segmented
                  label={t('stickers')}
                  size="sm"
                  options={(['giphy', 'instagram'] as const).map(platformOption)}
                  value={platformId}
                  onChange={setPlatformId}
                />
              </div>
              {platformId === 'custom' ? (
                <div className="field-row">
                  <label className="field">
                    <span>{t('size')}</span>
                    <div className="input-suffix">
                      <NumberField value={customSize} min={16} max={512} onChange={setCustomSize} />
                      <span>px</span>
                    </div>
                  </label>
                  <label className="field">
                    <span>{t('maxFile')}</span>
                    <div className="input-suffix">
                      <NumberField value={customKb} min={8} max={5120} onChange={setCustomKb} />
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
                <h2>{t('motion')}</h2>
                <span className="hint">
                  {platform.staticOnly
                    ? t('motionStill', { platform: platform.label })
                    : motionIds.length > 1
                      ? motionLabel
                      : t('motionHint')}
                </span>
              </div>
              <div className="motions" role="group" aria-label={t('motion')}>
                {motionThumbs.map((a) => {
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
                          <EmojiCanvas source={source} animation={a} options={options} size={36} decorative />
                        ) : (
                          <span className="motion-dot" style={{ animationName: `demo-${a.id}` }} />
                        )}
                      </span>
                      <span>{t(motionKey(a.id))}</span>
                    </button>
                  )
                })}
              </div>
              {motionIds.includes('spin') && (
                <div className="setting spin-direction">
                  <span>{t('spinDirection')}</span>
                  <Segmented
                    label={t('spinDirection')}
                    size="sm"
                    options={SPIN_DIRECTIONS.map((d) => ({ value: d, label: t(SPIN_LABELS[d]) }))}
                    value={spinDirection}
                    onChange={setSpinDirection}
                  />
                </div>
              )}
              {motionIds.length > 0 && (
                <label className="setting speed">
                  <span>{t('speed')}</span>
                  <input
                    type="range"
                    min={SPEED.min}
                    max={SPEED.max}
                    step={SPEED.step}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    onDoubleClick={() => setSpeed(SPEED.default)}
                    aria-valuetext={`${speed}×`}
                  />
                  <output aria-hidden>{speed}×</output>
                </label>
              )}
              {motionIds.length > 0 && (
                <label className="setting speed">
                  <span>{t('intensity')}</span>
                  <input
                    type="range"
                    min={INTENSITY.min}
                    max={INTENSITY.max}
                    step={INTENSITY.step}
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                    onDoubleClick={() => setIntensity(INTENSITY.default)}
                    aria-valuetext={`${Math.round(intensity * 100)}%`}
                  />
                  <output aria-hidden>{Math.round(intensity * 100)}%</output>
                </label>
              )}
            </div>

            <div className="group">
              <div className="group-head">
                <h2>{t('adjust')}</h2>
                {adjustChanged && (
                  <button type="button" className="text-button" onClick={resetAdjust}>
                    {t('reset')}
                  </button>
                )}
              </div>
              <div className="setting">
                <span>{t('background')}</span>
                <Segmented
                  label={t('background')}
                  size="sm"
                  options={[
                    { value: 'keep', label: t('keep') },
                    { value: 'remove', label: t('remove') },
                  ]}
                  value={active?.cutout ? 'remove' : 'keep'}
                  onChange={(v) => updateActive({ cutout: v === 'remove' })}
                />
              </div>
              {active?.cutout && (
                <label className="setting">
                  <span>{t('strength')}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={active.cutoutStrength}
                    onChange={(e) => updateActive({ cutoutStrength: Number(e.target.value) })}
                    onDoubleClick={() => updateActive({ cutoutStrength: DEFAULT_STRENGTH })}
                  />
                  <output aria-hidden>{active.cutoutStrength}</output>
                </label>
              )}
              <div className="setting">
                <span>{t('framing')}</span>
                <Segmented
                  label={t('framing')}
                  size="sm"
                  options={[
                    { value: 'contain', label: t('fit') },
                    { value: 'cover', label: t('fill') },
                  ]}
                  value={fit}
                  onChange={setFit}
                />
              </div>
              <label className="setting">
                <span>{t('scale')}</span>
                {/* Shown as how much of the frame the emoji fills; stored as padding on each side. */}
                <input
                  type="range"
                  min={0.4}
                  max={1}
                  step={0.01}
                  value={1 - padding * 2}
                  onChange={(e) => setPadding(Math.round((1 - Number(e.target.value)) * 50) / 100)}
                  aria-valuetext={`${Math.round((1 - padding * 2) * 100)}%`}
                />
                <output aria-hidden>{Math.round((1 - padding * 2) * 100)}%</output>
              </label>
              <label className="setting">
                <span>{t('corners')}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={corners}
                  onChange={(e) => setCorners(Number(e.target.value))}
                  onDoubleClick={() => setCorners(DEFAULT_RENDER.corners)}
                  aria-valuetext={`${Math.round(corners * 100)}%`}
                />
                <output aria-hidden>{Math.round(corners * 100)}%</output>
              </label>
              <label className="setting">
                <span>{t('rotate')}</span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  onDoubleClick={() => setRotation(0)}
                  aria-valuetext={`${rotation}°`}
                />
                <output aria-hidden>{rotation}°</output>
              </label>
              <div className="setting">
                <span>{t('turn')}</span>
                <div className="icon-options">
                  <button type="button" className="icon-option" onClick={() => turn(-1)} title={t('rotateLeft')}>
                    <RotateCcw size={15} />
                  </button>
                  <button type="button" className="icon-option" onClick={() => turn(1)} title={t('rotateRight')}>
                    <RotateCw size={15} />
                  </button>
                  <button
                    type="button"
                    className={`icon-option${flip ? ' is-active' : ''}`}
                    onClick={() => setFlip((f) => !f)}
                    aria-pressed={flip}
                    title={t('flipHorizontal')}
                  >
                    <FlipHorizontal2 size={15} />
                  </button>
                </div>
              </div>
              <div className="setting">
                <span>{t('fillColor')}</span>
                <div className="bg-options">
                  <button
                    type="button"
                    className={`swatch swatch-none checker${background === null ? ' is-active' : ''}`}
                    onClick={() => setBackground(null)}
                    aria-label={t('transparentBackground')}
                    aria-pressed={background === null}
                  />
                  <label
                    className={`swatch${background !== null ? ' is-active' : ''}`}
                    style={{ background: background ?? '#ffffff' }}
                    title={t('solidColor')}
                  >
                    <input
                      type="color"
                      value={background ?? '#ffffff'}
                      onChange={(e) => setBackground(e.target.value)}
                      aria-label={t('backgroundColor')}
                    />
                  </label>
                </div>
              </div>
              <label className="setting toggle">
                <span>{t('trimEdges')}</span>
                <input type="checkbox" role="switch" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
              </label>
            </div>

            <div className="group">
              <div className="group-head">
                <h2>{t('tune')}</h2>
                {!isNeutral(tune) && (
                  <button type="button" className="text-button" onClick={() => setTune(DEFAULT_TUNE)}>
                    {t('reset')}
                  </button>
                )}
              </div>
              {TUNE_CONTROLS.map(({ key, min }) => (
                <label className="setting" key={key}>
                  <span>{t(key)}</span>
                  <input
                    type="range"
                    min={min}
                    max={100}
                    step={1}
                    value={tune[key]}
                    onChange={(e) => setTune((t) => ({ ...t, [key]: Number(e.target.value) }))}
                    onDoubleClick={() => setTune((t) => ({ ...t, [key]: 0 }))}
                  />
                  <output aria-hidden>{tune[key] > 0 ? `+${tune[key]}` : tune[key]}</output>
                </label>
              ))}
            </div>

            <div className="group export" ref={exportBar}>
              {source && (
                <div className="export-thumb checker" aria-hidden>
                  <EmojiCanvas source={source} animation={preview} options={options} size={44} decorative />
                </div>
              )}
              <label className="field">
                <span>{t('name')}</span>
                <div className="input-affix">
                  <span aria-hidden>:</span>
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
                  <span aria-hidden>:</span>
                </div>
              </label>

              <div className={`status${result ? (result.withinLimit ? ' is-ok' : ' is-over') : ''}`} aria-live="polite">
                {!source ? (
                  t('addImageToExport')
                ) : exporting || !result ? (
                  platform.id === 'custom' ? (
                    t('sizing')
                  ) : (
                    t('sizingFor', { platform: platform.label })
                  )
                ) : (
                  <>
                    <span className="status-dot" />
                    <span>
                      {result.withinLimit ? t('ready') : t('overLimit')} ·{' '}
                      {isolate(`${result.size}×${result.size} ${result.extension.toUpperCase()}`)} ·{' '}
                      {t('sizeOf', {
                        size: isolate(formatBytes(result.bytes)),
                        max: isolate(formatBytes(platform.maxBytes)),
                      })}
                    </span>
                  </>
                )}
              </div>
              {result && !result.withinLimit && <p className="hint">{t('overLimitHint')}</p>}
              {stickerIssue && <p className="hint is-warning">{stickerIssue}</p>}

              <button type="button" className="primary" onClick={download} disabled={!source}>
                <Download size={16} aria-hidden />
                <DownloadLabel text={t('downloadFile', { file: '\u0000' })} base={emojiName} extension={extension} />
              </button>
              <div className="save-row">
                <label className="auto-save">
                  <input
                    type="checkbox"
                    checked={autoSave}
                    onChange={(e) => {
                      setAutoSaveState(e.target.checked)
                      setAutoSave(e.target.checked)
                    }}
                  />
                  {t('saveEveryDownload')}
                </label>
                {platform.id === 'instagram' && canCopy && (
                  <button type="button" className="text-button share-button" onClick={copySticker} disabled={!result}>
                    {copiedResult && copiedResult === result ? (
                      <Check size={14} aria-hidden />
                    ) : (
                      <Copy size={14} aria-hidden />
                    )}
                    {copiedResult && copiedResult === result ? t('stickerCopied') : t('copySticker')}
                  </button>
                )}
                {platform.id === 'giphy' && (
                  <button type="button" className="text-button share-button" onClick={postToGiphy} disabled={!result}>
                    <ExternalLink size={14} aria-hidden />
                    {t('postToGiphy')}
                  </button>
                )}
              </div>
              {platform.id === 'instagram' && (
                <p className="hint">{t(canCopy ? 'instagramHint' : 'instagramSaveHint')}</p>
              )}
              {platform.id === 'giphy' && <p className="hint">{t('giphyHint')}</p>}
            </div>
          </section>
        </div>
      </main>

      {error && (
        <div className="toast" role="alert">
          {errorText(error, t, lang)}
          <button type="button" onClick={() => setError(null)} aria-label={t('dismiss')}>
            ×
          </button>
        </div>
      )}

      {source && !previewInView && (
        <div className="mini-preview checker" aria-hidden>
          <EmojiCanvas source={source} animation={preview} options={options} size={64} decorative />
        </div>
      )}

      <Gallery
        open={galleryOpen}
        items={gallery}
        onClose={() => setGalleryOpen(false)}
        onDownload={(item) => downloadBlob(item.blob, `${item.name}.${item.extension}`)}
        onEdit={(item) => {
          setGalleryOpen(false)
          addImage(item.blob, item.name, false).catch((e) => setError(toUiError(e)))
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

/** Publishes an element's rendered height as a CSS variable on the page root, so the
    page can leave room under the phone Download bar however tall it grows. */
function useHeightVar(ref: RefObject<HTMLElement | null>, name: string) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const observer = new ResizeObserver(() => root.style.setProperty(name, `${el.offsetHeight}px`))
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty(name)
    }
  }, [ref, name])
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

/** Keeps numbers and Latin text in their own order inside right-to-left sentences. */
function isolate(text: string) {
  return `\u2068${text}\u2069`
}

/**
 * "Download name.gif" with only the name shortened when space runs out, so the
 * verb (which comes last in some languages) and the file type stay visible.
 */
function DownloadLabel({ text, base, extension }: { text: string; base: string; extension: string }) {
  const [before, after = ''] = text.split('\u0000')
  return (
    <span className="primary-label">
      {before && <span className="dl-fixed">{before}</span>}
      {/* File names read left to right even inside right-to-left text. */}
      <span className="dl-file" dir="ltr">
        <span className="dl-name">{base}</span>
        <span className="dl-fixed">.{extension}</span>
      </span>
      {after && <span className="dl-fixed">{after}</span>}
    </span>
  )
}
