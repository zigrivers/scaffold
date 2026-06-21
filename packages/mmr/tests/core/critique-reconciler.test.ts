import { describe, expect, it } from 'vitest'
import { reconcileCritique } from '../../src/core/critique-reconciler.js'
import type { CritiqueItem } from '../../src/types/critique.js'

const concern = (theme: string, observation: string): CritiqueItem => ({ kind: 'concern', theme, observation })

describe('reconcileCritique', () => {
  it('clusters near-identical observations from two channels as consensus', () => {
    const items = reconcileCritique({
      codex: [concern('scaling', 'polling every thirty seconds will not scale to many users')],
      claude: [concern('scaling', 'polling every thirty seconds will not scale to many users at all')],
    })
    const scaling = items.find((i) => i.theme === 'scaling')
    expect(scaling).toBeDefined()
    expect(scaling!.sources.sort()).toEqual(['claude', 'codex'])
    expect(scaling!.agreement).toBe('consensus')
  })

  it('labels a clustered point with mixed kinds as majority', () => {
    const items = reconcileCritique({
      codex: [{ kind: 'concern', theme: 'retries', observation: 'no retry strategy for failed deliveries is described' }],
      claude: [{ kind: 'consideration', theme: 'retries', observation: 'no retry strategy for failed deliveries is described anywhere' }],
    })
    const retries = items.find((i) => i.theme === 'retries')
    expect(retries!.sources).toHaveLength(2)
    expect(retries!.agreement).toBe('majority')
  })

  it('keeps a single-channel point as unique', () => {
    const items = reconcileCritique({
      codex: [{ kind: 'alternative', theme: 'sse', observation: 'use server sent events instead of a polling loop' }],
    })
    expect(items).toHaveLength(1)
    expect(items[0].agreement).toBe('unique')
    expect(items[0].sources).toEqual(['codex'])
  })

  it('does not merge dissimilar observations', () => {
    const items = reconcileCritique({
      codex: [concern('a', 'the data model uses a single denormalized table for everything')],
      claude: [concern('b', 'authentication is handled client side which is insecure')],
    })
    expect(items).toHaveLength(2)
  })

  it('sorts consensus before unique and assigns deterministic ids', () => {
    const items = reconcileCritique({
      codex: [
        concern('shared', 'the proposed approach ignores backpressure entirely in the pipeline'),
        concern('solo', 'logging is not addressed in the design at all currently'),
      ],
      claude: [concern('shared', 'the proposed approach ignores backpressure entirely in the pipeline stage')],
    })
    expect(items[0].agreement).toBe('consensus')
    expect(items[0].id).toBe('C-001')
    expect(items[items.length - 1].agreement).toBe('unique')
  })
})
