/**
 * The seasonal theme. Halloween runs from September 15 through October 31
 * in the visitor's local time, on by default, and a visitor can switch it off.
 */
import { useSyncExternalStore } from 'react'

const PREF_KEY = 'moji-season-off'

export function isHalloweenSeason(date: Date) {
  const month = date.getMonth()
  return (month === 8 && date.getDate() >= 15) || month === 9
}

function readOff() {
  try {
    return localStorage.getItem(PREF_KEY) === String(new Date().getFullYear())
  } catch {
    return false
  }
}

let off = readOff()
const listeners = new Set<() => void>()

function apply() {
  const on = isHalloweenSeason(new Date()) && !off
  if (on) document.documentElement.dataset.season = 'halloween'
  else delete document.documentElement.dataset.season
}

if (typeof document !== 'undefined') apply()

export function setSeasonOff(value: boolean) {
  off = value
  try {
    // Stored with the year, so switching it off this year doesn't hide next year's.
    if (value) localStorage.setItem(PREF_KEY, String(new Date().getFullYear()))
    else localStorage.removeItem(PREF_KEY)
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
  apply()
  listeners.forEach((l) => l())
}

/** Whether it's the season at all, and whether the theme is showing. */
export function useSeason() {
  const isOff = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => off,
    () => false,
  )
  const inSeason = isHalloweenSeason(new Date())
  return { inSeason, on: inSeason && !isOff }
}
