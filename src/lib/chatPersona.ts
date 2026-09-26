/**
 * Made-up people for the chat previews, so every new image shows up in a
 * fresh-looking conversation. Picks are seeded, so a given image always gets
 * the same pair and switching back through history doesn't reshuffle them.
 */
const NAMES = [
  'Maya Chen',
  'Jordan Reyes',
  'Priya Nair',
  'Sam Okafor',
  'Lena Novak',
  'Diego Alvarez',
  'Hana Sato',
  'Theo Martin',
  'Ava Brooks',
  'Kofi Mensah',
  'Iris Lindqvist',
  'Noah Kim',
  'Zara Ahmed',
  'Luca Rossi',
  'Mila Petrova',
  'Omar Haddad',
  'Ruby Walsh',
  'Ezra Cohen',
  'Nia Johnson',
  'Felix Wagner',
]
const HANDLES = [
  'pixelpanda',
  'nightowl',
  'tacotuesday',
  'glitchgoblin',
  'moonbeam',
  'captaincoffee',
  'lofi_lynx',
  'sparkplug',
  'bytebandit',
  'mossy',
  'neonfox',
  'sleepyhead',
  'waffles',
  'starfish',
  'turbo_turtle',
]
const LIGHT_MESSAGES = [
  'shipped it',
  'deploy is green',
  'lunch?',
  'PR approved',
  'we hit the goal',
  'standup in 5',
  'bug squashed',
  'happy friday',
  'new hire starts monday',
  'demo went great',
]
const DARK_MESSAGES = ['gg', 'raid tonight?', 'lets goooo', 'who is on', 'new map dropped', 'clutch']
const GRADIENTS = [
  ['#f59e0b', '#ef4444'],
  ['#22d3ee', '#6366f1'],
  ['#a3e635', '#16a34a'],
  ['#f472b6', '#8b5cf6'],
  ['#fb923c', '#e11d48'],
  ['#38bdf8', '#0ea5e9'],
  ['#facc15', '#f97316'],
  ['#34d399', '#0891b2'],
  ['#c084fc', '#db2777'],
  ['#94a3b8', '#475569'],
]

export interface Persona {
  name: string
  initials: string
  gradient: string
  message: string
  time: string
}

// Small deterministic PRNG (mulberry32).
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)]

function initialsOf(name: string) {
  return name
    .split(/[\s_]+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
}

export function personasFor(seed: number): { light: Persona; dark: Persona } {
  const r = rng(seed * 9973 + 17)
  const hour = 8 + Math.floor(r() * 10)
  const minute = String(Math.floor(r() * 60)).padStart(2, '0')
  const [la, lb] = pick(r, GRADIENTS)
  const [da, db] = pick(r, GRADIENTS)
  const lightName = pick(r, NAMES)
  const darkName = pick(r, HANDLES)
  return {
    light: {
      name: lightName,
      initials: initialsOf(lightName),
      gradient: `linear-gradient(135deg, ${la}, ${lb})`,
      message: pick(r, LIGHT_MESSAGES),
      time: `${hour > 12 ? hour - 12 : hour}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`,
    },
    dark: {
      name: darkName,
      initials: initialsOf(darkName),
      gradient: `linear-gradient(135deg, ${da}, ${db})`,
      message: pick(r, DARK_MESSAGES),
      time: `Today at ${hour}:${minute}`,
    },
  }
}
