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

    it('keeps higher-priority status when new name already exists', () => {
      const state = makeState({
        'tdd': { status: 'completed' },
        'testing-strategy': { status: 'pending' }, // stale entry alongside new
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      // Should keep completed (higher priority) over pending
      expect(state.steps['tdd'].status).toBe('completed')
      // Old entry cleaned up
      expect(state.steps['testing-strategy']).toBeUndefined()
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

    it('renames add-playwright to add-e2e-testing', () => {
      const state = makeState({
        'add-playwright': { status: 'completed' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['add-e2e-testing']).toBeDefined()
      expect(state.steps['add-e2e-testing'].status).toBe('completed')
      expect(state.steps['add-playwright']).toBeUndefined()
    })

    it('renames add-maestro to add-e2e-testing', () => {
      const state = makeState({
        'add-maestro': { status: 'completed' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['add-e2e-testing']).toBeDefined()
      expect(state.steps['add-e2e-testing'].status).toBe('completed')
      expect(state.steps['add-maestro']).toBeUndefined()
    })

    it('when both add-playwright and add-maestro exist, prefers completed status', () => {
      const state = makeState({
        'add-playwright': { status: 'completed' },
        'add-maestro': { status: 'pending' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['add-e2e-testing']).toBeDefined()
      expect(state.steps['add-e2e-testing'].status).toBe('completed')
      expect(state.steps['add-playwright']).toBeUndefined()
      expect(state.steps['add-maestro']).toBeUndefined()
    })

    it('when both exist with in_progress and pending, prefers in_progress', () => {
      const state = makeState({
        'add-playwright': { status: 'pending' },
        'add-maestro': { status: 'in_progress' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['add-e2e-testing'].status).toBe('in_progress')
      expect(state.steps['add-playwright']).toBeUndefined()
      expect(state.steps['add-maestro']).toBeUndefined()
    })

    it('fixes in_progress referencing add-playwright to add-e2e-testing', () => {
      const state = makeState({
        'add-playwright': { status: 'in_progress' },
      })
      state.in_progress = {
        step: 'add-playwright',
        started: '2026-01-01T00:00:00.000Z',
        partial_artifacts: [],
        actor: 'scaffold-run',
      }

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.in_progress?.step).toBe('add-e2e-testing')
    })

    it('renames multi-model-review to automated-pr-review', () => {
      const state = makeState({
        'multi-model-review': { status: 'skipped' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['automated-pr-review']).toBeDefined()
      expect(state.steps['automated-pr-review'].status).toBe('skipped')
      expect(state.steps['multi-model-review']).toBeUndefined()
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

  describe('retired step deletion', () => {
    it('removes user-stories-multi-model-review when pending', () => {
      const state = makeState({
        'user-stories-multi-model-review': { status: 'pending' },
        'create-prd': { status: 'completed' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['user-stories-multi-model-review']).toBeUndefined()
      expect(state.steps['create-prd'].status).toBe('completed')
    })

    it('removes user-stories-multi-model-review when completed', () => {
      const state = makeState({
        'user-stories-multi-model-review': { status: 'completed' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['user-stories-multi-model-review']).toBeUndefined()
    })

    it('removes user-stories-multi-model-review when skipped', () => {
      const state = makeState({
        'user-stories-multi-model-review': { status: 'skipped' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['user-stories-multi-model-review']).toBeUndefined()
    })

    it('clears in_progress if it references a retired step', () => {
      const state = makeState({
        'user-stories-multi-model-review': { status: 'in_progress' },
      })
      state.in_progress = {
        step: 'user-stories-multi-model-review',
        started: '2026-01-01T00:00:00.000Z',
        partial_artifacts: [],
        actor: 'scaffold-run',
      }

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['user-stories-multi-model-review']).toBeUndefined()
      expect(state.in_progress).toBeNull()
    })

    it('does not affect other steps when removing retired step', () => {
      const state = makeState({
        'user-stories-multi-model-review': { status: 'pending' },
        'review-user-stories': { status: 'completed' },
        'user-stories': { status: 'completed' },
      })

      migrateState(state)

      expect(state.steps['review-user-stories'].status).toBe('completed')
      expect(state.steps['user-stories'].status).toBe('completed')
    })

    it('removes claude-code-permissions when pending', () => {
      const state = makeState({
        'claude-code-permissions': { status: 'pending' },
        'tech-stack': { status: 'completed' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['claude-code-permissions']).toBeUndefined()
      expect(state.steps['tech-stack'].status).toBe('completed')
    })

    it('removes claude-code-permissions when completed', () => {
      const state = makeState({
        'claude-code-permissions': { status: 'completed' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['claude-code-permissions']).toBeUndefined()
    })

    it('removes multi-model-review-tasks when pending', () => {
      const state = makeState({
        'multi-model-review-tasks': { status: 'pending' },
        'implementation-plan-review': { status: 'pending' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['multi-model-review-tasks']).toBeUndefined()
      expect(state.steps['implementation-plan-review'].status).toBe('pending')
    })

    it('removes multi-model-review-tasks when completed', () => {
      const state = makeState({
        'multi-model-review-tasks': { status: 'completed' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['multi-model-review-tasks']).toBeUndefined()
    })

    it('returns false when retired step is not present', () => {
      const state = makeState({
        'create-prd': { status: 'completed' },
        'tdd': { status: 'completed' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(false)
    })
  })

  describe('regression tests', () => {
    it('round-trip: migrate v1-shaped state → verify field integrity', () => {
      const state = makeState({
        'testing-strategy': { status: 'completed', produces: ['docs/prd.md', 'docs/tdd-standards.md'] },
        'implementation-tasks': { status: 'in_progress' },
        'review-tasks': { status: 'skipped' },
        'add-playwright': { status: 'completed' },
        'multi-model-review': { status: 'pending' },
        'user-stories-multi-model-review': { status: 'completed' },
        'claude-code-permissions': { status: 'pending' },
        'create-prd': { status: 'completed', produces: ['docs/plan.md'] },
      })
      state.in_progress = {
        step: 'implementation-tasks',
        started: '2026-01-15T10:00:00.000Z',
        partial_artifacts: ['docs/impl.md'],
        actor: 'scaffold-run',
      }

      const changed = migrateState(state)

      expect(changed).toBe(true)
      // Step renames applied
      expect(state.steps['tdd']).toBeDefined()
      expect(state.steps['tdd'].status).toBe('completed')
      expect(state.steps['tdd'].source).toBe('pipeline')
      expect(state.steps['tdd'].produces).toEqual(['docs/plan.md', 'docs/tdd-standards.md'])
      expect(state.steps['implementation-plan']).toBeDefined()
      expect(state.steps['implementation-plan'].status).toBe('in_progress')
      expect(state.steps['implementation-plan-review']).toBeDefined()
      expect(state.steps['implementation-plan-review'].status).toBe('skipped')
      expect(state.steps['add-e2e-testing']).toBeDefined()
      expect(state.steps['add-e2e-testing'].status).toBe('completed')
      expect(state.steps['automated-pr-review']).toBeDefined()
      expect(state.steps['automated-pr-review'].status).toBe('pending')
      // Retired steps removed
      expect(state.steps['user-stories-multi-model-review']).toBeUndefined()
      expect(state.steps['claude-code-permissions']).toBeUndefined()
      // Untouched steps preserved
      expect(state.steps['create-prd']).toBeDefined()
      expect(state.steps['create-prd'].status).toBe('completed')
      expect(state.steps['create-prd'].produces).toEqual(['docs/plan.md'])
      // in_progress updated to new name
      expect(state.in_progress?.step).toBe('implementation-plan')
      expect(state.in_progress?.started).toBe('2026-01-15T10:00:00.000Z')
      expect(state.in_progress?.partial_artifacts).toEqual(['docs/impl.md'])
      expect(state.in_progress?.actor).toBe('scaffold-run')
      // Top-level fields preserved
      expect(state['schema-version']).toBe(1)
      expect(state['scaffold-version']).toBe('2.1.2')
      expect(state.init_methodology).toBe('deep')
      expect(state['init-mode']).toBe('greenfield')
    })

    it('unknown step names in old state are preserved', () => {
      const state = makeState({
        'create-prd': { status: 'completed' },
        'some-future-step': { status: 'pending' },
        'another-unknown-step': { status: 'completed', produces: ['docs/something.md'] },
      })

      const changed = migrateState(state)

      expect(changed).toBe(false)
      expect(state.steps['some-future-step']).toBeDefined()
      expect(state.steps['some-future-step'].status).toBe('pending')
      expect(state.steps['another-unknown-step']).toBeDefined()
      expect(state.steps['another-unknown-step'].status).toBe('completed')
      expect(state.steps['another-unknown-step'].produces).toEqual(['docs/something.md'])
    })

    it('retired step mapping removes all three retired steps in one pass', () => {
      const state = makeState({
        'user-stories-multi-model-review': { status: 'completed' },
        'claude-code-permissions': { status: 'skipped' },
        'multi-model-review-tasks': { status: 'in_progress' },
        'create-prd': { status: 'completed' },
      })

      const changed = migrateState(state)

      expect(changed).toBe(true)
      expect(state.steps['user-stories-multi-model-review']).toBeUndefined()
      expect(state.steps['claude-code-permissions']).toBeUndefined()
      expect(state.steps['multi-model-review-tasks']).toBeUndefined()
      // Non-retired steps untouched
      expect(state.steps['create-prd']).toBeDefined()
      expect(state.steps['create-prd'].status).toBe('completed')
    })

    it('migration is idempotent — running twice produces same result', () => {
      const state = makeState({
        'testing-strategy': { status: 'completed' },
        'implementation-tasks': { status: 'pending' },
        'add-playwright': { status: 'completed' },
        'user-stories-multi-model-review': { status: 'skipped' },
        'create-prd': { status: 'completed', produces: ['docs/prd.md'] },
      })

      // First migration
      const changed1 = migrateState(state)
      expect(changed1).toBe(true)

      // Snapshot state after first migration
      const stepsAfterFirst = JSON.parse(JSON.stringify(state.steps))
      const inProgressAfterFirst = JSON.parse(JSON.stringify(state.in_progress))

      // Second migration — should be a no-op
      const changed2 = migrateState(state)
      expect(changed2).toBe(false)

      // State is identical after second pass
      expect(state.steps).toEqual(stepsAfterFirst)
      expect(state.in_progress).toEqual(inProgressAfterFirst)
    })

    it('preserves in_progress pointing to a non-renamed step', () => {
      const state = makeState({
        'create-prd': { status: 'in_progress' },
        'tdd': { status: 'completed' },
      })
      state.in_progress = {
        step: 'create-prd',
        started: '2026-03-01T08:00:00.000Z',
        partial_artifacts: ['docs/plan.md'],
        actor: 'user',
      }

      const changed = migrateState(state)

      expect(changed).toBe(false)
      expect(state.in_progress).not.toBeNull()
      expect(state.in_progress?.step).toBe('create-prd')
      expect(state.in_progress?.started).toBe('2026-03-01T08:00:00.000Z')
      expect(state.in_progress?.partial_artifacts).toEqual(['docs/plan.md'])
      expect(state.in_progress?.actor).toBe('user')
    })

    it('empty steps object — migration succeeds without error', () => {
      const state = makeState({})

      const changed = migrateState(state)

      expect(changed).toBe(false)
      expect(state.steps).toEqual({})
      expect(state.in_progress).toBeNull()
    })

    it('state with extra unknown fields is preserved (forward compatibility)', () => {
      const state = makeState({
        'create-prd': { status: 'completed' },
        'testing-strategy': { status: 'pending' },
      })
      // Add fields not in the current schema
      const raw = state as unknown as Record<string, unknown>
      raw['future-feature-flag'] = true
      raw['analytics'] = { runs: 42, last_run: '2026-03-28' }
      raw['custom-metadata'] = 'some value'

      const changed = migrateState(state)

      expect(changed).toBe(true)
      // Migration applied
      expect(state.steps['tdd']).toBeDefined()
      expect(state.steps['testing-strategy']).toBeUndefined()
      // Unknown fields survive
      expect(raw['future-feature-flag']).toBe(true)
      expect(raw['analytics']).toEqual({ runs: 42, last_run: '2026-03-28' })
      expect(raw['custom-metadata']).toBe('some value')
    })
  })
})
