import { describe, it, expect } from 'vitest'
import { CHANNEL_ALIASES, normalizeChannelName } from '../../src/config/channel-aliases.js'

describe('normalizeChannelName', () => {
  it('maps the agy alias to the canonical antigravity key', () => {
    expect(normalizeChannelName('agy')).toBe('antigravity')
  })

  it('returns the canonical name unchanged', () => {
    expect(normalizeChannelName('antigravity')).toBe('antigravity')
  })

  it('returns unknown / other channel names unchanged', () => {
    expect(normalizeChannelName('gemini')).toBe('gemini')
    expect(normalizeChannelName('totally-unknown')).toBe('totally-unknown')
  })

  it('exposes the agy→antigravity mapping in CHANNEL_ALIASES', () => {
    expect(CHANNEL_ALIASES.agy).toBe('antigravity')
  })

  it('maps the opc alias to the canonical opencode key', () => {
    expect(normalizeChannelName('opc')).toBe('opencode')
  })

  it('returns the canonical opencode name unchanged', () => {
    expect(normalizeChannelName('opencode')).toBe('opencode')
  })

  it('exposes the opc→opencode mapping in CHANNEL_ALIASES', () => {
    expect(CHANNEL_ALIASES.opc).toBe('opencode')
  })
})
