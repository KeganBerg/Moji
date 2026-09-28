import { Download, Pencil, Share, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type { GalleryItem } from '../lib/gallery'
import { useI18n } from '../lib/i18n'
import { formatBytes } from '../lib/platforms'

interface Props {
  open: boolean
  items: GalleryItem[]
  onClose: () => void
  onDownload: (item: GalleryItem) => void
  onEdit: (item: GalleryItem) => void
  onDelete: (item: GalleryItem) => void
}

const fileOf = (item: GalleryItem) =>
  new File([item.blob], `${item.name}.${item.extension}`, { type: item.blob.type || `image/${item.extension}` })

// Phones can hand the file to the share sheet, where "Save Image" puts it in Photos.
// A plain download on iOS only reaches the Files app.
const canSaveToPhotos = (item: GalleryItem) =>
  typeof navigator.canShare === 'function' &&
  window.matchMedia('(pointer: coarse)').matches &&
  navigator.canShare({ files: [fileOf(item)] })

async function saveToPhotos(item: GalleryItem) {
  try {
    await navigator.share({ files: [fileOf(item)] })
  } catch (e) {
    // Closing the share sheet isn't an error.
    if ((e as Error).name !== 'AbortError') throw e
  }
}

export function Gallery({ open, items, onClose, onDownload, onEdit, onDelete }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  // After a delete, keep keyboard focus in the list instead of dropping it to the page.
  const focusAfterDelete = useRef<number | null | undefined>(undefined)
  const canShare = useMemo(() => items.length > 0 && canSaveToPhotos(items[0]), [items])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const id = focusAfterDelete.current
    if (id === undefined) return
    focusAfterDelete.current = undefined
    const next = id !== null && ref.current?.querySelector<HTMLElement>(`[data-delete="${CSS.escape(String(id))}"]`)
    ;(next || closeButton.current)?.focus()
  }, [items])

  const remove = (index: number) => {
    const neighbour = items[index + 1] ?? items[index - 1]
    focusAfterDelete.current = neighbour ? neighbour.id : null
    onDelete(items[index])
  }

  // Saved GIFs animate on their own once they have a URL.
  const urls = useMemo(() => new Map(items.map((i) => [i.id, URL.createObjectURL(i.blob)])), [items])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  return (
    <dialog
      ref={ref}
      className="gallery"
      aria-labelledby="gallery-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="gallery-inner">
        <header className="gallery-head">
          <div>
            <h2 id="gallery-title">{t('gallery')}</h2>
            <p>{t('galleryIntro')}</p>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t('closeGallery')}
          >
            <X size={18} />
          </button>
        </header>

        <p className="gallery-warning" role="note">
          <TriangleAlert size={15} aria-hidden />
          <span>
            <strong>{t('galleryWarningTitle')}</strong> {t('galleryWarning')}{' '}
            {canShare ? t('galleryKeepShare') : t('galleryKeep')}
          </span>
        </p>

        {items.length === 0 ? (
          <p className="gallery-empty">{t('galleryEmpty')}</p>
        ) : (
          <ul className="gallery-grid">
            {items.map((item, index) => (
              <li key={item.id} className="gallery-card">
                <div className="gallery-thumb checker">
                  <img src={urls.get(item.id)} alt={item.name} />
                </div>
                <div className="gallery-meta">
                  <strong>:{item.name}:</strong>
                  <span>
                    {item.platform === 'Custom' ? t('custom') : item.platform} · {item.extension.toUpperCase()} ·{' '}
                    {formatBytes(item.bytes)}
                  </span>
                </div>
                <div className="gallery-actions">
                  {canShare && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => saveToPhotos(item).catch(() => onDownload(item))}
                      aria-label={t('saveNamedToPhotos', { name: item.name })}
                      title={t('saveToPhotos')}
                    >
                      <Share size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onDownload(item)}
                    aria-label={t('downloadNamed', { name: item.name })}
                    title={t('download')}
                  >
                    <Download size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onEdit(item)}
                    aria-label={t('editNamed', { name: item.name })}
                    title={t('openInEditor')}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    data-delete={item.id}
                    onClick={() => remove(index)}
                    aria-label={t('deleteNamed', { name: item.name })}
                    title={t('delete')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  )
}
