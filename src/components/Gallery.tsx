import { Download, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type { GalleryItem } from '../lib/gallery'
import { formatBytes } from '../lib/platforms'

interface Props {
  open: boolean
  items: GalleryItem[]
  onClose: () => void
  onDownload: (item: GalleryItem) => void
  onEdit: (item: GalleryItem) => void
  onDelete: (item: GalleryItem) => void
}

export function Gallery({ open, items, onClose, onDownload, onEdit, onDelete }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

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
            <h2 id="gallery-title">Gallery</h2>
            <p>Saved in this browser only. Clearing your browser data removes them.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close gallery">
            <X size={18} />
          </button>
        </header>

        {items.length === 0 ? (
          <p className="gallery-empty">
            Nothing saved yet. Use <strong>Save to gallery</strong> under the download button to keep an emoji here.
          </p>
        ) : (
          <ul className="gallery-grid">
            {items.map((item) => (
              <li key={item.id} className="gallery-card">
                <div className="gallery-thumb checker">
                  <img src={urls.get(item.id)} alt={item.name} />
                </div>
                <div className="gallery-meta">
                  <strong>:{item.name}:</strong>
                  <span>
                    {item.platform} · {item.extension.toUpperCase()} · {formatBytes(item.bytes)}
                  </span>
                </div>
                <div className="gallery-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onDownload(item)}
                    aria-label={`Download ${item.name}`}
                    title="Download"
                  >
                    <Download size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onEdit(item)}
                    aria-label={`Edit ${item.name}`}
                    title="Open in the editor"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onDelete(item)}
                    aria-label={`Delete ${item.name}`}
                    title="Delete"
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
