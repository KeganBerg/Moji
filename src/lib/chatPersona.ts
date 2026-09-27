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
  'Aisha Bello',
  'Mateo Silva',
  'Grace Liu',
  'Ben Carter',
  'Sofia Moreau',
  'Kai Nakamura',
  'Chloe Dubois',
  'Arjun Mehta',
  'Freya Hansen',
  'Leo Fischer',
  'Amara Diallo',
  'Oscar Lindberg',
  'Yuna Park',
  'Isaac Levi',
  'Elena Popescu',
  'Tariq Rahman',
  'Nora Quinn',
  'Hugo Bernard',
  'Layla Hassan',
  'Max Schneider',
  'Camila Torres',
  "Finn O'Brien",
  'Mei Wong',
  'Jonah Price',
  'Sienna Clarke',
  'Rafael Costa',
  'Ingrid Berg',
  'Dev Patel',
  'Talia Rosen',
  'Wes Turner',
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
  'crunchwrap',
  'froggo',
  'voidwalker',
  'pancake.exe',
  'duckzilla',
  'saltybagel',
  'kiwi_kid',
  'noodlearm',
  'zapdos_fan',
  'cheesewizard',
  'midnightsnack',
  'grumpycat99',
  'loaf',
  'rngesus',
  'sirlagsalot',
  'bubbletea',
  'cosmic_carl',
  'yeehaw',
  'toastie',
  'spicy_pickle',
  'gremlin',
  'afk_again',
  'honkhonk',
  'marshmallow',
  'wumpus_jr',
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
  'can someone review my PR',
  'coffee run, who wants',
  'tests finally pass',
  'the client loved it',
  'offsite is booked',
  'who broke staging',
  'quarter closed',
  'thanks everyone',
  'retro at 3',
  'we are so back',
  'ok ship it',
  'meeting could have been an email',
]
const DARK_MESSAGES = [
  'gg',
  'raid tonight?',
  'lets goooo',
  'who is on',
  'new map dropped',
  'clutch',
  'one more game',
  'i am so cooked',
  'lag was insane',
  'patch notes are out',
  'movie night?',
  'nobody talk to me',
  'wait what',
  'first try btw',
  'vc in 10',
  'this server is unhinged',
  'ok that was sick',
  'brb snacks',
]
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
  ['#fda4af', '#f43f5e'],
  ['#5eead4', '#0d9488'],
  ['#fcd34d', '#84cc16'],
  ['#818cf8', '#1e3a8a'],
]
const ANIMALS = ['🦊', '🐸', '🐼', '🐙', '🦉', '🐧', '🦖', '🐝', '🦄', '🐢', '🐱', '🐶', '🦝', '🐨', '🦦', '🐳']
const PASTELS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa', '#a5f3fc', '#e5e7eb']

/** What the avatar shows: initials on a gradient, one letter, or an animal. */
export interface Avatar {
  text: string
  background: string
  /** Emoji avatars are drawn larger and without the text shadow. */
  emoji: boolean
}

export interface Persona {
  name: string
  avatar: Avatar
  message: string
  time: string
}

// A random offset per page load, so the first image isn't always the same pair of people.
const SESSION = Math.floor(Math.random() * 1e6)

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

function avatarFor(r: () => number, name: string): Avatar {
  const [a, b] = pick(r, GRADIENTS)
  const angle = Math.floor(r() * 360)
  const style = r()
  if (style < 0.4)
    return { text: initialsOf(name), background: `linear-gradient(${angle}deg, ${a}, ${b})`, emoji: false }
  if (style < 0.6) return { text: initialsOf(name).slice(0, 1), background: a, emoji: false }
  return { text: pick(r, ANIMALS), background: pick(r, PASTELS), emoji: true }
}

export function personasFor(seed: number): { light: Persona; dark: Persona } {
  const r = rng((seed + SESSION) * 9973 + 17)
  const hour = 8 + Math.floor(r() * 10)
  const minute = String(Math.floor(r() * 60)).padStart(2, '0')
  const lightName = pick(r, NAMES)
  const darkName = pick(r, HANDLES)
  return {
    light: {
      name: lightName,
      avatar: avatarFor(r, lightName),
      message: pick(r, LIGHT_MESSAGES),
      time: `${hour > 12 ? hour - 12 : hour}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`,
    },
    dark: {
      name: darkName,
      avatar: avatarFor(r, darkName),
      message: pick(r, DARK_MESSAGES),
      time: `Today at ${hour}:${minute}`,
    },
  }
}
