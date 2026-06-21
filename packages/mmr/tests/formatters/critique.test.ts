import { describe, expect, it } from 'vitest'
import { formatCritiqueText, formatCritiqueJson } from '../../src/formatters/critique.js'
import type { CritiqueReport } from '../../src/types/critique.js'

const report: CritiqueReport = {
  kind: 'design-critique',
  job_id: 'mmr-abc',
  artifact_source: 'design.md',
  items: [
    { id: 'C-001', kind: 'concern', theme: 'scaling', observation: 'polling will not scale', recommendation: 'use SSE', sources: ['claude', 'codex'], agreement: 'consensus' },
    { id: 'C-002', kind: 'alternative', theme: 'queue', observation: 'use a durable queue', sources: ['codex'], agreement: 'unique' },
    { id: 'C-003', kind: 'open-question', theme: 'scale', observation: 'what is the concurrency target?', sources: ['claude'], agreement: 'unique' },
  ],
  per_channel: {
    codex: { status: 'completed', item_count: 2 },
    claude: { status: 'completed', item_count: 2 },
  },
  splits: [{
    theme: 'queue',
    positions: [
      { stance: 'add a durable queue', item_ids: ['C-002'], sources: ['codex'] },
      { stance: 'a queue is premature; use cron', item_ids: ['C-004'], sources: ['claude'] },
    ],
    crux: 'what is the real throughput target?',
  }],
  synthesis: 'Polling is the main scaling risk (C-001); resolve the concurrency target first (C-003).',
  summary: '3 items across 2 channels',
  metadata: { channels_dispatched: 2, channels_completed: 2, total_elapsed: '4s' },
}

describe('formatCritiqueText (Phase 2 layout)', () => {
  const out = formatCritiqueText(report)

  it('keeps the advisory header, no verdict', () => {
    expect(out).toMatch(/CRITIQUE/)
    expect(out.toLowerCase()).toContain('advisory')
    expect(out).not.toMatch(/PASS|BLOCK|verdict/i)
  })

  it('renders CONVERGENCE for agreed items', () => {
    expect(out).toContain('CONVERGENCE')
    expect(out).toContain('polling will not scale')
  })

  it('renders DIVERGENCE with positions, sources, and the crux', () => {
    expect(out).toContain('DIVERGENCE')
    expect(out).toContain('add a durable queue')
    expect(out).toContain('a queue is premature')
    expect(out.toLowerCase()).toContain('crux:')
    expect(out).toContain('throughput target')
  })

  it('groups single-model items under kind headers', () => {
    expect(out).toContain('ALTERNATIVES')
    expect(out).toContain('OPEN QUESTIONS')
    expect(out).toContain('what is the concurrency target?')
  })

  it('renders the editorial SYNTHESIS prose', () => {
    expect(out).toContain('SYNTHESIS')
    expect(out).toContain('Polling is the main scaling risk (C-001)')
  })
})

describe('context disclosure', () => {
  it('renders CONTEXT USED when context_used is set, omits it otherwise', () => {
    expect(formatCritiqueText(report)).not.toContain('CONTEXT USED')
    const grounded = { ...report, context_used: ['package.json', 'src/notify.ts'] }
    const out = formatCritiqueText(grounded)
    expect(out).toContain('CONTEXT USED')
    expect(out).toContain('src/notify.ts')
  })
})

describe('formatCritiqueJson', () => {
  it('round-trips the report including splits + synthesis + context_used', () => {
    const parsed = JSON.parse(formatCritiqueJson({ ...report, context_used: ['a.ts'] }))
    expect(parsed.splits).toHaveLength(1)
    expect(parsed.splits[0].crux).toMatch(/throughput/)
    expect(parsed.synthesis).toMatch(/C-001/)
    expect(parsed.context_used).toEqual(['a.ts'])
  })
})
