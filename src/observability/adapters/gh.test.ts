import { describe, it, expect } from 'vitest'
import { ghAdapter } from './gh.js'

describe('gh adapter', () => {
  it('probe returns unavailable when gh binary is missing', async () => {
    const s = await ghAdapter.probe('.', { ghBin: '/no/such/binary' })
    expect(s.status).toBe('unavailable')
    expect(s.reason).toMatch(/not installed|ENOENT/)
  })

  it('probe returns degraded when gh prints auth-required message to stderr', async () => {
    const s = await ghAdapter.probe('.', { ghBin: 'sh', ghArgs: ['-c', 'echo "gh auth login required" >&2; exit 1'] })
    expect(s.status).toBe('degraded')
    expect(s.reason).toMatch(/auth/i)
  })

  it('probe returns available when gh exits zero', async () => {
    const s = await ghAdapter.probe('.', { ghBin: 'true' })
    expect(s.status).toBe('available')
  })

  it('listOpenPRs returns [] when gh is unavailable', async () => {
    const prs = await ghAdapter.listOpenPRs('.', { ghBin: '/no/such/binary' })
    expect(prs).toEqual([])
  })
})

describe('gh adapter — replayEvents', () => {
  it('returns [] when gh is unavailable (no throw)', async () => {
    const events = await ghAdapter.replayEvents('.', { sinceHours: 24, ghBin: '/no/such/gh' })
    expect(events).toEqual([])
  })

  it('maps a fixture PrInfo[] into ReplayEvents with correct correlation_ids', () => {
    const now = Date.now()
    const recentOpen = new Date(now - 2 * 3_600_000).toISOString()   // 2h ago — within 24h window
    const recentMerge = new Date(now - 1 * 3_600_000).toISOString()  // 1h ago — within 24h window
    const prs = [
      { number: 42, url: 'https://example/pr/42', state: 'open' as const,
        branch: 'feat-a', opened_at: recentOpen },
      { number: 41, url: 'https://example/pr/41', state: 'merged' as const,
        branch: 'feat-b', opened_at: recentOpen, merged_at: recentMerge },
    ]
    const events = ghAdapter._prsToReplayEvents(prs, { sinceHours: 24 })
    const open = events.find((e) => e.kind === 'pr_opened' && e.correlation_id === 'pr:42:opened')
    const merged = events.find((e) => e.kind === 'pr_merged' && e.correlation_id === 'pr:41:merged')
    expect(open).toBeDefined()
    expect(merged).toBeDefined()
    expect(open?.sort_id).toBe('gh:42:opened')
    expect(merged?.sort_id).toBe('gh:41:merged')
    expect(open?.link).toBe('https://example/pr/42')
  })

  it('typeof replayEvents is function', () => {
    expect(typeof ghAdapter.replayEvents).toBe('function')
  })

  it('emits pr_closed for a closed-unmerged PR within window', () => {
    const now = Date.now()
    const recentOpen = new Date(now - 3 * 3_600_000).toISOString()
    const recentClose = new Date(now - 1 * 3_600_000).toISOString()
    const prs = [
      {
        number: 99, url: 'https://example/pr/99', state: 'closed' as const,
        branch: 'feat-x', opened_at: recentOpen, closed_at: recentClose,
      },
    ]
    const events = ghAdapter._prsToReplayEvents(prs, { sinceHours: 24 })
    const closed = events.find((e) => e.kind === 'pr_closed')
    expect(closed).toBeDefined()
    expect(closed?.correlation_id).toBe('pr:99:closed')
    expect(closed?.sort_id).toBe('gh:99:closed')
  })

  it('does not emit pr_closed for a merged PR', () => {
    const now = Date.now()
    const recentTs = new Date(now - 1 * 3_600_000).toISOString()
    const prs = [
      {
        number: 100, url: 'https://example/pr/100', state: 'closed' as const,
        branch: 'feat-y', opened_at: recentTs, merged_at: recentTs, closed_at: recentTs,
      },
    ]
    const events = ghAdapter._prsToReplayEvents(prs, { sinceHours: 24 })
    expect(events.find((e) => e.kind === 'pr_closed')).toBeUndefined()
  })
})
