/**
 * The part of an IP address that daily limits are keyed on. IPv4 addresses are
 * used whole. An IPv6 host usually owns a whole /64 (2^64 addresses), so keying
 * on the full address would give one machine a fresh quota per address; the
 * /64 prefix is what identifies it.
 */
export function limitKey(ip: string): string {
  if (!ip.includes(':')) return ip
  const addr = ip
    .replace(/^\[|\]$/g, '')
    .split('%')[0]
    .toLowerCase()
  // IPv4-mapped (::ffff:1.2.3.4) is really IPv4.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return mapped[1]
  const [head, tail] = addr.split('::')
  const left = head ? head.split(':') : []
  const right = tail === undefined ? [] : tail ? tail.split(':') : []
  const groups =
    tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
  return (
    groups
      .slice(0, 4)
      .map((g) => (parseInt(g, 16) || 0).toString(16))
      .join(':') + '::/64'
  )
}
