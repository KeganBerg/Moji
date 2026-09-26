import { useEffect, useRef } from 'react'

export const ADSENSE_CLIENT = 'ca-pub-8080930241819022'

// The AdSense ad unit id for the 300×250 slots. Until it's set, slots stay
// empty (and collapse on phones); VITE_AD_SLOTS=show draws a placeholder.
const UNIT = import.meta.env.VITE_ADSENSE_SLOT as string | undefined
const PLACEHOLDER = import.meta.env.VITE_AD_SLOTS === 'show'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

interface Props {
  /** "editor" sits under the settings panel; "article" sits inside guide pages. */
  placement: 'editor' | 'article'
}

/**
 * A reserved 300×250 ad space. It always keeps its size once ads are on, so an
 * ad loading never shifts the controls around it.
 */
export function AdSlot({ placement }: Props) {
  const ref = useRef<HTMLModElement>(null)

  useEffect(() => {
    if (!UNIT || !ref.current || ref.current.dataset.adsbygoogleStatus) return
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // Blocked by an ad blocker or not loaded yet: leave the space empty.
    }
  }, [])

  const active = Boolean(UNIT) || PLACEHOLDER
  return (
    <aside
      className={`ad-slot ad-${placement}${active ? ' is-active' : ''}${PLACEHOLDER && !UNIT ? ' is-placeholder' : ''}`}
      aria-label={active ? 'Advertisement' : undefined}
      aria-hidden={!active}
    >
      {UNIT ? (
        <ins
          ref={ref}
          className="adsbygoogle"
          style={{ display: 'inline-block', width: 300, height: 250 }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={UNIT}
        />
      ) : (
        PLACEHOLDER && <span>Advertisement</span>
      )}
    </aside>
  )
}
