import { useLayoutEffect, type RefObject } from 'react'

const MIN_PX = 9

/**
 * Shrinks the font of each `selector` label inside `ref` until its longest
 * word fits on one line, so words like "Вечеринка" or "Herzschlag" aren't
 * split mid-word in narrow buttons. Labels need `overflow-wrap: normal` so an
 * overflowing word shows up in scrollWidth. Refits when the container resizes
 * or `key` (the language) changes.
 */
export function useFitLabels(ref: RefObject<HTMLElement | null>, selector: string, key: unknown) {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const fit = () => {
      for (const label of root.querySelectorAll<HTMLElement>(selector)) {
        label.style.fontSize = ''
        label.style.overflowWrap = ''
        let size = parseFloat(getComputedStyle(label).fontSize)
        while (label.scrollWidth > label.clientWidth + 0.5 && size > MIN_PX) {
          size = Math.max(MIN_PX, size - 0.5)
          label.style.fontSize = `${size}px`
        }
        // Still too long at the smallest size: let it break rather than spill out.
        if (label.scrollWidth > label.clientWidth + 0.5) label.style.overflowWrap = 'anywhere'
      }
    }
    fit()
    // The web font can load after the first fit and change every width.
    let live = true
    document.fonts?.ready.then(() => live && fit())
    const observer = new ResizeObserver(fit)
    observer.observe(root)
    return () => {
      live = false
      observer.disconnect()
    }
  }, [ref, selector, key])
}
