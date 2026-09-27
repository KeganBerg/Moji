import { useState } from 'react'

interface Props {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

/**
 * A number input that lets you type freely (clearing it, or typing "64" one
 * digit at a time) and only clamps to min..max when you leave the field.
 * Values already in range apply as you type.
 */
export function NumberField({ value, min, max, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))))
    setDraft(null)
  }
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft ?? value}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max) onChange(n)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
}
