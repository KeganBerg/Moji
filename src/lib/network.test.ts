import { describe, expect, it } from 'vitest'
import { limitKey } from '../../supabase/functions/generate-emoji/network'

describe('limitKey', () => {
  it('keeps IPv4 whole', () => {
    expect(limitKey('203.0.113.7')).toBe('203.0.113.7')
    expect(limitKey('::ffff:203.0.113.7')).toBe('203.0.113.7')
  })

  it('groups an IPv6 /64 together', () => {
    const a = limitKey('2001:db8:1:2::1')
    expect(a).toBe('2001:db8:1:2::/64')
    expect(limitKey('2001:0db8:0001:0002:ffff:eeee:dddd:cccc')).toBe(a)
    expect(limitKey('[2001:DB8:1:2::abcd%eth0]')).toBe(a)
    expect(limitKey('2001:db8:1:3::1')).not.toBe(a)
  })

  it('handles short and loopback forms', () => {
    expect(limitKey('::1')).toBe('0:0:0:0::/64')
    expect(limitKey('2001:db8::')).toBe('2001:db8:0:0::/64')
  })
})
