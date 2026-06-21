import { describe, expect, it, vi } from 'vitest'
import {
  assembleSynthesisPrompt, parseSynthesisOutput, synthesizeCritique,
} from '../../src/core/critique-synthesis.js'
import type { ReconciledCritiqueItem } from '../../src/types/critique.js'

const items: ReconciledCritiqueItem[] = [
  { id: 'C-001', kind: 'concern', theme: 'scaling', observation: 'polling will not scale', sources: ['codex', 'claude'], agreement: 'consensus' },
  { id: 'C-002', kind: 'alternative', theme: 'queue', observation: 'use a durable queue', sources: ['codex'], agreement: 'unique' },
  { id: 'C-003', kind: 'alternative', theme: 'queue', observation: 'a queue is premature; use cron', sources: ['claude'], agreement: 'unique' },
]

describe('assembleSynthesisPrompt', () => {
  it('lists the item ids and the editorial rules', () => {
    const p = assembleSynthesisPrompt(items)
    expect(p).toContain('C-001')
    expect(p).toContain('C-003')
    expect(p.toLowerCase()).toContain('crux')
    expect(p.toLowerCase()).toMatch(/cite|item ids/)
    expect(p.toLowerCase()).toMatch(/never (pick|resolve|decide)/)
  })
})

describe('parseSynthesisOutput', () => {
  it('parses splits + synthesis (incl. a claude envelope)', () => {
    const inner = JSON.stringify({
      splits: [{
        theme: 'queue',
        positions: [
          { stance: 'add a queue', item_ids: ['C-002'], sources: ['codex'] },
          { stance: 'use cron', item_ids: ['C-003'], sources: ['claude'] },
        ],
        crux: 'what is the real throughput target?',
      }],
      synthesis: 'Polling is the main risk (C-001).',
    })
    const out = parseSynthesisOutput(JSON.stringify({ type: 'result', result: inner }))
    expect(out.splits).toHaveLength(1)
    expect(out.splits[0].positions).toHaveLength(2)
    expect(out.splits[0].crux).toMatch(/throughput/)
    expect(out.synthesis).toMatch(/C-001/)
  })

  it('never throws — bad input yields empty', () => {
    expect(parseSynthesisOutput('garbage')).toEqual({ splits: [], synthesis: '' })
  })
})

describe('synthesizeCritique', () => {
  it('skips (no runner call) with fewer than 2 items', async () => {
    const runner = vi.fn()
    const out = await synthesizeCritique([items[0]], runner)
    expect(runner).not.toHaveBeenCalled()
    expect(out).toEqual({ splits: [], synthesis: '' })
  })

  it('skips when no runner is provided', async () => {
    expect(await synthesizeCritique(items)).toEqual({ splits: [], synthesis: '' })
  })

  it('runs the injected runner and parses its output', async () => {
    const runner = vi.fn().mockResolvedValue('{"splits":[],"synthesis":"polling is the risk"}')
    const out = await synthesizeCritique(items, runner)
    expect(runner).toHaveBeenCalledOnce()
    expect(out.synthesis).toBe('polling is the risk')
  })

  it('degrades gracefully when the runner throws', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('claude down'))
    expect(await synthesizeCritique(items, runner)).toEqual({ splits: [], synthesis: '' })
  })
})
