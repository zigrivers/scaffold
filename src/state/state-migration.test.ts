import { describe, it, expect } from 'vitest'
import { migrateState } from './state-migration.js'
import type { PipelineState } from '../types/index.js'

function makeState(steps: Record<string, { status: string; produces?: string[] }>): PipelineState {
  const state: Record<string, unknown> = {
    'schema-version': 1,
    'scaffold-version': '2.1.2',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2026-01-01T00:00:00.000Z',
    in_progress: null,
    steps: {} as Record<string, unknown>,
    next_eligible: [],
    'extra-steps': [],
  }

  const stepsObj = state['steps'] as Record<string, unknown>
  for (const [name, entry] of Object.entries(steps)) {
    stepsObj[name] = {
      status: entry.status,
      source: 'pipeline',
      produces: entry.produces ?? [],
    }
  }

  return state as unknown as PipelineState
}

describe('migrateState', () => {
  describe('step renames', () => {
    it('renames testing-strategy to tdd', () => {
      const state = makeState({
        'testing-strategy': { status: 'completed' },
        'create-prd': { status: 'completed' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['tdd']).toBeDefined()
      expect(state.steps['tdd'].status).toBe('completed')
      expect(state.steps['testing-strategy']).toBeUndefined()
      expect(state.steps['create-prd'].status).toBe('completed')
    })

    it('renames implementation-tasks to implementation-plan', () => {
      const state = makeState({
        'implementation-tasks': { status: 'pending' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['implementation-plan']).toBeDefined()
      expect(state.steps['implementation-plan'].status).toBe('pending')
      expect(state.steps['implementation-tasks']).toBeUndefined()
    })

    it('renames review-tasks to implementation-plan-review', () => {
      const state = makeState({
        'review-tasks': { status: 'skipped' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['implementation-plan-review']).toBeDefined()
      expect(state.steps['implementation-plan-review'].status).toBe('skipped')
      expect(state.steps['review-tasks']).toBeUndefined()
    })

    it('renames all three steps in one pass', () => {
      const state = makeState({
        'testing-strategy': { status: 'completed' },
        'implementation-tasks': { status: 'completed' },
        'review-tasks': { status: 'pending' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['tdd']).toBeDefined()
      expect(state.steps['implementation-plan']).toBeDefined()
      expect(state.steps['implementation-plan-review']).toBeDefined()
      expect(state.steps['testing-strategy']).toBeUndefined()
      expect(state.steps['implementation-tasks']).toBeUndefined()
      expect(state.steps['review-tasks']).toBeUndefined()
    })

    it('does not rename if new name already exists (idempotent)', () => {
      const state = makeState({
        'tdd': { status: 'completed' },
        'testing-strategy': { status: 'pending' }, // stale entry alongside new
      })

      const changed = migrateState(state)

      // Should NOT overwrite existing tdd entry
      expect(state.steps['tdd'].status).toBe('completed')
      // Old entry stays since new name exists — avoids data loss
      expect(state.steps['testing-strategy']).toBeDefined()
    })

    it('returns false when no migration needed', () => {
      const state = makeState({
        'tdd': { status: 'completed' },
        'implementation-plan': { status: 'pending' },
        'create-prd': { status: 'completed' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(false)
    })

    it('fixes in_progress record referencing old step name', () => {
      const state = makeState({
        'testing-strategy': { status: 'in_progress' },
      })
      state.in_progress = {
        step: 'testing-strategy',
        started: '2026-01-01T00:00:00.000Z',
        partial_artifacts: [],
        actor: 'user',
      }

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.in_progress?.step).toBe('tdd')
    })
  })

  describe('artifact path normalization', () => {
    it('normalizes docs/prd.md to docs/plan.md in produces', () => {
      const state = makeState({
        'create-prd': { status: 'completed', produces: ['docs/prd.md'] },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['create-prd'].produces).toEqual(['docs/plan.md'])
    })

    it('does not change docs/plan.md (already canonical)', () => {
      const state = makeState({
        'create-prd': { status: 'completed', produces: ['docs/plan.md'] },
      })

      const changed = migrateState(state)

      expect(changed).toBe(false)
    })

    it('normalizes artifact paths alongside step renames', () => {
      const state = makeState({
        'testing-strategy': { status: 'completed', produces: ['docs/prd.md', 'docs/tdd-standards.md'] },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['tdd']).toBeDefined()
      expect(state.steps['tdd'].produces).toEqual(['docs/plan.md', 'docs/tdd-standards.md'])
    })
  })
})
