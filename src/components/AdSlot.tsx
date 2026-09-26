const SHOW = import.meta.env.VITE_AD_SLOTS === 'show'

interface Props {
  /** IAB size: 300x250 sits under the inspector, 320x100 is the mobile banner. */
  format: 'rectangle' | 'banner'
}

/**
 * Space reserved for a future ad unit. The layout always leaves room for it
 * outside the editing flow, so turning ads on never shifts the controls.
 */
export function AdSlot({ format }: Props) {
  return (
    <aside className={`ad-slot ad-${format}${SHOW ? ' is-visible' : ''}`} aria-hidden={!SHOW}>
      {SHOW && <span>Advertisement</span>}
    </aside>
  )
}
