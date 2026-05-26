import { describe, it, expect } from 'vitest'
import { parseEntry } from './parse-entry.js'

describe('parseEntry', () => {
  it('extracts frontmatter, body, sources, and volatility', () => {
    const raw = [
      '---',
      'name: x',
      'volatility: stable',
      'sources:',
      '  - url: https://example.com/a',
      '  - url: https://example.com/b',
      '---',
      '',
      '## Summary',
      'hello',
    ].join('\n')
    const parsed = parseEntry(raw)
    expect(parsed.sourceUrls).toEqual(['https://example.com/a', 'https://example.com/b'])
    expect(parsed.volatility).toBe('stable')
    expect(parsed.body).toContain('## Summary')
  })

  it('returns null volatility for unknown values', () => {
    const raw = '---\nname: x\nvolatility: glacial\n---\nbody'
    expect(parseEntry(raw).volatility).toBeNull()
  })

  it('returns empty sourceUrls when sources key is missing', () => {
    const raw = '---\nname: x\n---\nbody'
    expect(parseEntry(raw).sourceUrls).toEqual([])
  })

  it('throws on missing frontmatter', () => {
    expect(() => parseEntry('no fm here')).toThrow(/frontmatter/)
  })
})
