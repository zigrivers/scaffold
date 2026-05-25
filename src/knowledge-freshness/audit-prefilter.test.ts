import { describe, it, expect, vi } from 'vitest'
import { selectAuditCandidates, type FetchSourceFn } from './audit-prefilter.js'
import type { KnowledgeEntry } from '../types/index.js'

const today = new Date('2026-05-24T00:00:00Z')

function entry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    name: 'x', description: '', topics: [], content: '',
    volatility: 'evolving', lastReviewed: null, versionPin: null, sources: [],
    ...overrides,
  }
}

describe('selectAuditCandidates', () => {
  it('skips entries with no sources', async () => {
    const fetch = vi.fn() as unknown as FetchSourceFn
    const out = await selectAuditCandidates([entry({ sources: [] })], { now: today, max: 10, fetch })
    expect(out).toEqual([])
  })

  it('selects entries that have never been reviewed', async () => {
    const fetch = vi.fn().mockResolvedValue({ hash: 'h1' }) as unknown as FetchSourceFn
    const out = await selectAuditCandidates(
      [entry({ name: 'a', sources: [{ url: 'https://x' }], lastReviewed: null })],
      { now: today, max: 10, fetch },
    )
    expect(out.map(c => c.name)).toEqual(['a'])
  })

  it('selects fast-moving entries last reviewed >14d ago', async () => {
    const fetch = vi.fn().mockResolvedValue({ hash: 'h1' }) as unknown as FetchSourceFn
    const out = await selectAuditCandidates(
      [entry({ name: 'a', volatility: 'fast-moving', lastReviewed: '2026-05-01', sources: [{ url: 'https://x', hash: 'h1' }] })],
      { now: today, max: 10, fetch },
    )
    expect(out.map(c => c.name)).toEqual(['a'])
  })

  it('selects entries whose source hash changed', async () => {
    const fetch = vi.fn().mockResolvedValue({ hash: 'h2' }) as unknown as FetchSourceFn
    const out = await selectAuditCandidates(
      [entry({ name: 'a', lastReviewed: '2026-05-23', sources: [{ url: 'https://x', hash: 'h1' }] })],
      { now: today, max: 10, fetch },
    )
    expect(out.map(c => c.name)).toEqual(['a'])
  })

  it('skips stable entries within their 180d window with matching hashes', async () => {
    const fetch = vi.fn().mockResolvedValue({ hash: 'h1' }) as unknown as FetchSourceFn
    const out = await selectAuditCandidates(
      [entry({ name: 'a', volatility: 'stable', lastReviewed: '2026-04-01', sources: [{ url: 'https://x', hash: 'h1' }] })],
      { now: today, max: 10, fetch },
    )
    expect(out).toEqual([])
  })

  it('respects max ceiling', async () => {
    const fetch = vi.fn().mockResolvedValue({ hash: 'new' }) as unknown as FetchSourceFn
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry({ name: `e${i}`, sources: [{ url: `https://x${i}`, hash: 'old' }], lastReviewed: null }),
    )
    const out = await selectAuditCandidates(entries, { now: today, max: 2, fetch })
    expect(out).toHaveLength(2)
  })
})
