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
