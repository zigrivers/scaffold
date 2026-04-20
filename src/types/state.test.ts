import { describe, it, expect } from 'vitest'
import type { PipelineState } from './state.js'

describe('PipelineState cache-version fields (Eligible-Cache v2)', () => {
  it('PipelineState literal accepts save_counter, next_eligible_hash, next_eligible_root_counter as optional', () => {
    const state: PipelineState = {
      'schema-version': 3,
      'scaffold-version': '1.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-04-20T00:00:00.000Z',
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
      // NEW optional fields — must compile:
      save_counter: 5,
      next_eligible_hash: 'abc123',
      next_eligible_root_counter: 4,
    }
    expect(state.save_counter).toBe(5)
    expect(state.next_eligible_hash).toBe('abc123')
    expect(state.next_eligible_root_counter).toBe(4)
  })

  it('PipelineState literal compiles without the new fields (backward compat)', () => {
    const state: PipelineState = {
      'schema-version': 3,
      'scaffold-version': '1.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-04-20T00:00:00.000Z',
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
    }
    expect(state.save_counter).toBeUndefined()
  })
})
