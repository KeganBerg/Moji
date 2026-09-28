import type { KeyboardEvent } from 'react'

interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}

export function Segmented<T extends string>({ label, options, value, onChange, size = 'md' }: Props<T>) {
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  // Radio group keyboard pattern: one tab stop, arrow keys move and select.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const step: Record<string, number> = {
      ArrowRight: rtl ? -1 : 1,
      ArrowLeft: rtl ? 1 : -1,
      ArrowDown: 1,
      ArrowUp: -1,
    }
    // Move from the focused option, which can differ from the selected one.
    const buttons = [...e.currentTarget.children]
    const focused = buttons.indexOf(document.activeElement as Element)
    const from = focused >= 0 ? focused : current
    let next: number
    if (e.key in step) next = (from + step[e.key] + options.length) % options.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    else return
    e.preventDefault()
    onChange(options[next].value)
    ;(e.currentTarget.children[next] as HTMLElement | undefined)?.focus()
  }

  return (
    <div className={`segmented segmented-${size}`} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={i === current ? 0 : -1}
          className={value === o.value ? 'is-active' : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
