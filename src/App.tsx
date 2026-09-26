import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dropzone } from './components/Dropzone'
import { EmojiCanvas } from './components/EmojiCanvas'
import { ANIMATIONS, getAnimation } from './lib/animations'
import { exportGif, exportPng, type ExportResult } from './lib/export'
import { getGenerator } from './lib/generate'
import { PLATFORMS, formatBytes, sanitizeName, type PlatformId } from './lib/platforms'
import { DEFAULT_RENDER, loadImage, prepareSource, type Fit, type RenderOptions } from './lib/render'
import { saveEmoji, supabase } from './lib/supabase'

type SourceMode = 'upload' | 'prompt'

const STYLES = ['flat', '3d', 'pixel', 'sticker', 'hand-drawn']

export default function App() {
  const generator = useMemo(() => getGenerator(), [])

  const [mode, setMode] = useState<SourceMode>('upload')
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [trim, setTrim] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState(STYLES[0])
  const [generating, setGenerating] = useState(false)

  const [platformId, setPlatformId] = useState<PlatformId>('slack')
  const [customSize, setCustomSize] = useState(128)
  const [customKb, setCustomKb] = useState(256)
  const [animationId, setAnimationId] = useState('none')
  const [fit, setFit] = useState<Fit>(DEFAULT_RENDER.fit)
  const [padding, setPadding] = useState(DEFAULT_RENDER.padding)
  const [background, setBackground] = useState<string | null>(null)
  const [name, setName] = useState('')

  const [exported, setExported] = useState<{ key: object; result: ExportResult } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shared, setShared] = useState<{ key: object; url: string } | null>(null)
  const [sharing, setSharing] = useState(false)

  const platform = useMemo(() => {
    const base = PLATFORMS[platformId]
    return platformId === 'custom' ? { ...base, size: customSize, maxBytes: customKb * 1024 } : base
  }, [platformId, customSize, customKb])
  const animation = getAnimation(animationId)
  const options: RenderOptions = useMemo(() => ({ fit, padding, background }), [fit, padding, background])
  const source = useMemo(() => (image ? prepareSource(image, trim) : null), [image, trim])
  // New identity whenever anything that affects the exported file changes.
  const exportKey = useMemo(() => ({ source, options, animation, platform }), [source, options, animation, platform])
  const result = exported?.result ?? null
  const exporting = !!source && exported?.key !== exportKey
  const shareUrl = shared?.key === exportKey ? shared.url : null
  const fileName = `${sanitizeName(name || 'moji', platformId)}.${result?.extension ?? (animation.frames > 1 ? 'gif' : 'png')}`

  const onFile = useCallback(async (file: File, suggestedName?: string) => {
    setError(null)
    try {
      setImage(await loadImage(file))
      setName((prev) => prev || suggestedName || file.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const generate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setError(null)
    try {
      const blob = await generator.generate({ prompt, style })
      await onFile(new File([blob], 'generated.png', { type: blob.type }), prompt.split(/\s+/).slice(0, 3).join('_'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  // Re-export whenever anything changes so the size check is always current.
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
    }, 250)
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

  const share = async () => {
    if (!result) return
    setSharing(true)
    setError(null)
    try {
      setShared({ key: exportKey, url: await saveEmoji(result.blob, fileName) })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            ☺
          </span>
          <span>Moji</span>
        </div>
        <p className="tagline">Perfectly sized custom emoji for Slack, Discord, and anywhere else.</p>
      </header>

      <main className="layout">
        <section className="panel controls">
          <div className="step">
            <h2>
              <span className="num">1</span> Start with an image
            </h2>
            <div className="tabs" role="tablist">
              {(['upload', 'prompt'] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  className={mode === m ? 'active' : ''}
                  onClick={() => setMode(m)}
                >
                  {m === 'upload' ? 'Upload' : 'Describe it'}
                </button>
              ))}
            </div>
            {mode === 'upload' ? (
              <>
                <Dropzone onFile={onFile} />
                <label className="check">
                  <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                  Trim empty edges so the emoji fills the square
                </label>
              </>
            ) : (
              <div className="prompt">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="a tiny taco wearing sunglasses"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
                  }}
                />
                <div className="chips">
                  {STYLES.map((s) => (
                    <button key={s} className={`chip${style === s ? ' active' : ''}`} onClick={() => setStyle(s)}>
                      {s}
                    </button>
                  ))}
                </div>
                <button className="primary" onClick={generate} disabled={generating || !prompt.trim()}>
                  {generating ? 'Generating…' : 'Generate'}
                </button>
                {!generator.isReal && (
                  <p className="note">
                    AI generation isn't connected yet, so this makes a placeholder badge from your prompt. Everything
                    after this step works for real.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="step">
            <h2>
              <span className="num">2</span> Where is it going?
            </h2>
            <div className="segmented">
              {(Object.keys(PLATFORMS) as PlatformId[]).map((id) => (
                <button key={id} className={platformId === id ? 'active' : ''} onClick={() => setPlatformId(id)}>
                  {PLATFORMS[id].label}
                </button>
              ))}
            </div>
            {platformId === 'custom' ? (
              <div className="row">
                <label>
                  Size (px)
                  <input
                    type="number"
                    min={16}
                    max={512}
                    value={customSize}
                    onChange={(e) => setCustomSize(Math.min(512, Math.max(16, Number(e.target.value) || 128)))}
                  />
                </label>
                <label>
                  Max file size (KB)
                  <input
                    type="number"
                    min={8}
                    max={5120}
                    value={customKb}
                    onChange={(e) => setCustomKb(Math.min(5120, Math.max(8, Number(e.target.value) || 256)))}
                  />
                </label>
              </div>
            ) : (
              <ul className="specs">
                {platform.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="step">
            <h2>
              <span className="num">3</span> Add some motion
            </h2>
            <div className="animations">
              {ANIMATIONS.map((a) => (
                <button
                  key={a.id}
                  className={`anim${animationId === a.id ? ' active' : ''}`}
                  onClick={() => setAnimationId(a.id)}
                  aria-pressed={animationId === a.id}
                >
                  {source ? (
                    <EmojiCanvas source={source} animation={a} options={options} size={44} />
                  ) : (
                    <span className="anim-empty" />
                  )}
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          <details className="step">
            <summary>
              <h2>
                <span className="num">4</span> Fine-tune
              </h2>
            </summary>
            <div className="row">
              <label>
                Fit
                <select value={fit} onChange={(e) => setFit(e.target.value as Fit)}>
                  <option value="contain">Fit whole image</option>
                  <option value="cover">Fill and crop</option>
                </select>
              </label>
              <label>
                Background
                <span className="bg-picker">
                  <select
                    value={background === null ? 'none' : 'color'}
                    onChange={(e) => setBackground(e.target.value === 'none' ? null : '#ffffff')}
                  >
                    <option value="none">Transparent</option>
                    <option value="color">Solid color</option>
                  </select>
                  {background !== null && (
                    <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
                  )}
                </span>
              </label>
            </div>
            <label>
              Padding {Math.round(padding * 100)}%
              <input
                type="range"
                min={0}
                max={0.3}
                step={0.01}
                value={padding}
                onChange={(e) => setPadding(Number(e.target.value))}
              />
            </label>
          </details>
        </section>

        <section className="panel preview">
          {source ? (
            <>
              <div className="stage checker">
                <EmojiCanvas source={source} animation={animation} options={options} size={192} />
              </div>

              <div className="chat-previews">
                {(['light', 'dark'] as const).map((theme) => (
                  <div key={theme} className={`chat ${theme}`}>
                    <div className="msg">
                      <span className="avatar" aria-hidden />
                      <div>
                        <strong>you</strong>
                        <p>
                          shipped it{' '}
                          <EmojiCanvas
                            source={source}
                            animation={animation}
                            options={options}
                            size={platform.displaySizes[0]}
                            className="inline-emoji"
                          />
                        </p>
                      </div>
                    </div>
                    <EmojiCanvas
                      source={source}
                      animation={animation}
                      options={options}
                      size={platform.displaySizes[1]}
                      className="big-emoji"
                    />
                  </div>
                ))}
              </div>

              <div className="export">
                <label>
                  Emoji name
                  <div className="name-input">
                    <span>:</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => setName((n) => sanitizeName(n || 'moji', platformId))}
                      placeholder="party_parrot"
                    />
                    <span>:</span>
                  </div>
                </label>

                <div className={`status ${result && !exporting ? (result.withinLimit ? 'ok' : 'bad') : ''}`}>
                  {exporting || !result ? (
                    'Sizing for ' + platform.label + '…'
                  ) : (
                    <>
                      <strong>{result.withinLimit ? '✓ Ready for ' + platform.label : 'Over the size limit'}</strong>
                      <span>
                        {result.size}×{result.size} {result.extension.toUpperCase()} · {formatBytes(result.bytes)} of{' '}
                        {formatBytes(platform.maxBytes)}
                        {result.frames > 1 && ` · ${result.frames} frames`}
                        {result.colors && result.colors < 256 && ` · ${result.colors} colors`}
                      </span>
                      {!result.withinLimit && (
                        <span>Try Fill and crop, a simpler animation, or a solid background.</span>
                      )}
                    </>
                  )}
                </div>

                <div className="actions">
                  <button className="primary" onClick={download} disabled={!result || exporting}>
                    Download {fileName}
                  </button>
                  {supabase && (
                    <button onClick={share} disabled={!result || exporting || sharing}>
                      {sharing ? 'Uploading…' : 'Get a share link'}
                    </button>
                  )}
                </div>
                {shareUrl && (
                  <p className="share">
                    <a href={shareUrl} target="_blank" rel="noreferrer">
                      {shareUrl}
                    </a>
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="empty">
              <div className="stage checker" />
              <p>Upload an image or describe one to see your emoji here.</p>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      </main>

      <footer className="foot muted">
        Everything happens in your browser. Nothing is uploaded unless you ask for a share link.
      </footer>
    </div>
  )
}
