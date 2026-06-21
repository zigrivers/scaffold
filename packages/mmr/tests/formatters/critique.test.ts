import { describe, expect, it } from 'vitest'
import { formatCritiqueText, formatCritiqueJson } from '../../src/formatters/critique.js'
import type { CritiqueReport } from '../../src/types/critique.js'

const report: CritiqueReport = {
  kind: 'design-critique',
  job_id: 'mmr-abc',
  artifact_source: 'design.md',
  items: [
    { id: 'C-001', kind: 'concern', theme: 'scaling', observation: 'polling will not scale', recommendation: 'use SSE', sources: ['claude', 'codex'], agreement: 'consensus' },
    { id: 'C-002', kind: 'alternative', theme: 'queue', observation: 'consider a durable queue', sources: ['codex'], agreement: 'unique' },
  ],
  per_channel: {
    codex: { status: 'completed', item_count: 2 },
    claude: { status: 'completed', item_count: 1 },
  },
  summary: '2 items across 2 channels',
  metadata: { channels_dispatched: 2, channels_completed: 2, total_elapsed: '4s' },
}

describe('formatCritiqueText', () => {
  it('renders an advisory report grouped by agreement, with no gate/verdict', () => {
    const out = formatCritiqueText(report)
    expect(out).toMatch(/CRITIQUE/)
    expect(out.toLowerCase()).toContain('advisory')
    expect(out).not.toMatch(/PASS|BLOCK|verdict/i)
    // consensus item surfaces with its sources and kind
    expect(out).toContain('polling will not scale')
    expect(out).toContain('consensus')
    expect(out).toContain('claude')
    // summary present
    expect(out).toContain('2 items across 2 channels')
  })
})

describe('formatCritiqueJson', () => {
  it('round-trips the report', () => {
    const parsed = JSON.parse(formatCritiqueJson(report))
    expect(parsed.kind).toBe('design-critique')
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0].agreement).toBe('consensus')
  })
})
