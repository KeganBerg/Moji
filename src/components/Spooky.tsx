import { useSeason } from '../lib/season'

const Bat = () => (
  <svg viewBox="0 0 64 28" aria-hidden>
    <g className="bat-wing bat-wing-l">
      <path d="M30 14C24 6 14 4 2 8c6 2 8 6 8 10 3-3 7-3 10 0 2-3 6-4 10-4z" />
    </g>
    <g className="bat-wing bat-wing-r">
      <path d="M34 14c6-8 16-10 28-6-6 2-8 6-8 10-3-3-7-3-10 0-2-3-6-4-10-4z" />
    </g>
    <path d="M28 10l1-5 2 3h2l2-3 1 5c1 2 1 6-4 9-5-3-5-7-4-9z" />
  </svg>
)

const EMBERS = [
  { left: '6%', delay: '0s', duration: '19s' },
  { left: '18%', delay: '-7s', duration: '23s' },
  { left: '33%', delay: '-13s', duration: '21s' },
  { left: '52%', delay: '-4s', duration: '26s' },
  { left: '67%', delay: '-16s', duration: '20s' },
  { left: '81%', delay: '-9s', duration: '24s' },
  { left: '93%', delay: '-2s', duration: '22s' },
]

/** Background layer for the Halloween theme: drifting fog, a few bats, rising embers and a spider. */
export function Spooky() {
  const { on } = useSeason()
  if (!on) return null
  return (
    <div className="spooky" aria-hidden>
      <div className="fog fog-a" />
      <div className="fog fog-b" />
      <div className="bat bat-1">
        <Bat />
      </div>
      <div className="bat bat-2">
        <Bat />
      </div>
      <div className="bat bat-3">
        <Bat />
      </div>
      {EMBERS.map((e) => (
        <span
          key={e.left}
          className="ember"
          style={{ left: e.left, animationDelay: e.delay, animationDuration: e.duration }}
        />
      ))}
      <div className="spider">
        <span className="spider-thread" />
        <svg viewBox="0 0 24 24">
          <path d="M12 8a3 3 0 0 1 3 3v1a3 3 0 0 1-6 0v-1a3 3 0 0 1 3-3z" />
          <circle cx="12" cy="6.5" r="2" />
          <path
            d="M9.5 10 5 7M9.2 12 4 11.5M9.5 14 5 17M14.5 10 19 7M14.8 12 20 11.5M14.5 14 19 17"
            fill="none"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  )
}
