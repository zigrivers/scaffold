import { describe, it, expect } from 'vitest'
import { applyOverlay } from './overlay-resolver.js'
import type { PipelineOverlay, StepEnablementEntry } from '../../types/index.js'

function makeOverlay(overrides: Partial<PipelineOverlay> = {}): PipelineOverlay {
  return {
    name: 'test-overlay',
    description: 'Test overlay',
    projectType: 'game',
    stepOverrides: {},
    knowledgeOverrides: {},
    readsOverrides: {},
    dependencyOverrides: {},
    crossReadsOverrides: {},
    ...overrides,
  }
}

describe('applyOverlay', () => {
  describe('step overrides', () => {
    it('enables new steps and disables replaced steps', () => {
      const steps: Record<string, StepEnablementEntry> = {
        'design-system': { enabled: true },
        'create-prd': { enabled: true },
      }
      const overlay = makeOverlay({
        stepOverrides: {
          'design-system': { enabled: false },
          'game-design-document': { enabled: true },
        },
      })

      const result = applyOverlay(steps, {}, {}, {}, overlay)

      expect(result.steps['design-system']).toEqual({ enabled: false })
      expect(result.steps['game-design-document']).toEqual({ enabled: true })
      expect(result.steps['create-prd']).toEqual({ enabled: true })
    })

    it('merges step entries instead of replacing (preserves base conditional)', () => {
      const steps: Record<string, StepEnablementEntry> = {
        'step-a': { enabled: true, conditional: 'if-needed' },
      }
      const overlay = makeOverlay({
        stepOverrides: {
          'step-a': { enabled: false },
        },
      })

      const result = applyOverlay(steps, {}, {}, {}, overlay)

      expect(result.steps['step-a']).toEqual({ enabled: false, conditional: 'if-needed' })
    })

    it('preserves conditional field from overlay', () => {
      const steps: Record<string, StepEnablementEntry> = {
        'create-prd': { enabled: true },
      }
      const overlay = makeOverlay({
        stepOverrides: {
          'optional-step': { enabled: true, conditional: 'if-needed' },
        },
      })

      const result = applyOverlay(steps, {}, {}, {}, overlay)

      expect(result.steps['optional-step']).toEqual({ enabled: true, conditional: 'if-needed' })
    })
  })

  describe('knowledge overrides', () => {
    it('appends entries to existing knowledge', () => {
      const knowledgeMap: Record<string, string[]> = {
        'tech-stack': ['tech-stack-selection'],
      }
      const overlay = makeOverlay({
        knowledgeOverrides: {
          'tech-stack': { append: ['game-engine-selection'] },
        },
      })

      const result = applyOverlay({}, knowledgeMap, {}, {}, overlay)

      expect(result.knowledge['tech-stack']).toEqual([
        'tech-stack-selection',
        'game-engine-selection',
      ])
    })

    it('deduplicates when overlay appends an already-present entry', () => {
      const knowledgeMap: Record<string, string[]> = {
        'tech-stack': ['tech-stack-selection', 'game-engine-selection'],
      }
      const overlay = makeOverlay({
        knowledgeOverrides: {
          'tech-stack': { append: ['game-engine-selection'] },
        },
      })

      const result = applyOverlay({}, knowledgeMap, {}, {}, overlay)

      expect(result.knowledge['tech-stack']).toEqual([
        'tech-stack-selection',
        'game-engine-selection',
      ])
    })
  })

  describe('reads overrides', () => {
    it('replaces targets in existing reads', () => {
      const readsMap: Record<string, string[]> = {
        'story-tests': ['ux-spec', 'user-stories'],
      }
      const overlay = makeOverlay({
        readsOverrides: {
          'story-tests': { replace: { 'ux-spec': 'game-ui-spec' } },
        },
      })

      const result = applyOverlay({}, {}, readsMap, {}, overlay)

      expect(result.reads['story-tests']).toEqual(['game-ui-spec', 'user-stories'])
    })

    it('appends new reads entries', () => {
      const readsMap: Record<string, string[]> = {
        'story-tests': ['ux-spec'],
      }
      const overlay = makeOverlay({
        readsOverrides: {
          'story-tests': { append: ['game-mechanics'] },
        },
      })

      const result = applyOverlay({}, {}, readsMap, {}, overlay)

      expect(result.reads['story-tests']).toEqual(['ux-spec', 'game-mechanics'])
    })

    it('deduplicates after replace and append', () => {
      const readsMap: Record<string, string[]> = {
        'story-tests': ['ux-spec', 'user-stories'],
      }
      const overlay = makeOverlay({
        readsOverrides: {
          'story-tests': {
            replace: { 'ux-spec': 'user-stories' },  // replace ux-spec with user-stories (duplicate)
            append: ['user-stories'],                   // also append duplicate
          },
        },
      })

      const result = applyOverlay({}, {}, readsMap, {}, overlay)

      // user-stories should appear only once
      expect(result.reads['story-tests']).toEqual(['user-stories'])
    })
  })

  describe('dependency overrides', () => {
    it('appends new dependencies', () => {
      const dependencyMap: Record<string, string[]> = {
        'user-stories': ['review-prd'],
      }
      const overlay = makeOverlay({
        dependencyOverrides: {
          'user-stories': { append: ['review-gdd'] },
        },
      })

      const result = applyOverlay({}, {}, {}, dependencyMap, overlay)

      expect(result.dependencies['user-stories']).toEqual(['review-prd', 'review-gdd'])
    })

    it('replaces dependencies', () => {
      const dependencyMap: Record<string, string[]> = {
        'user-stories': ['review-prd'],
      }
      const overlay = makeOverlay({
        dependencyOverrides: {
          'user-stories': { replace: { 'review-prd': 'review-gdd' } },
        },
      })

      const result = applyOverlay({}, {}, {}, dependencyMap, overlay)

      expect(result.dependencies['user-stories']).toEqual(['review-gdd'])
    })

    it('deduplicates after replace and append', () => {
      const dependencyMap: Record<string, string[]> = {
        'user-stories': ['review-prd', 'review-gdd'],
      }
      const overlay = makeOverlay({
        dependencyOverrides: {
          'user-stories': {
            replace: { 'review-prd': 'review-gdd' },
            append: ['review-gdd'],
          },
        },
      })

      const result = applyOverlay({}, {}, {}, dependencyMap, overlay)

      expect(result.dependencies['user-stories']).toEqual(['review-gdd'])
    })
  })

  describe('empty overlay', () => {
    it('produces no changes when overlay has empty override objects', () => {
      const steps = { 'create-prd': { enabled: true } }
      const knowledge = { 'tech-stack': ['tech-stack-selection'] }
      const reads = { 'story-tests': ['ux-spec'] }
      const deps = { 'user-stories': ['review-prd'] }
      const overlay = makeOverlay()

      const result = applyOverlay(steps, knowledge, reads, deps, overlay)

      expect(result.steps).toEqual(steps)
      expect(result.knowledge).toEqual(knowledge)
      expect(result.reads).toEqual(reads)
      expect(result.dependencies).toEqual(deps)
    })
  })

  describe('unknown step in overlay', () => {
    it('silently adds step overrides for unknown steps', () => {
      const steps = { 'create-prd': { enabled: true } }
      const overlay = makeOverlay({
        stepOverrides: { 'totally-new-step': { enabled: true } },
      })

      const result = applyOverlay(steps, {}, {}, {}, overlay)

      expect(result.steps['totally-new-step']).toEqual({ enabled: true })
      expect(result.steps['create-prd']).toEqual({ enabled: true })
    })

    it('silently adds knowledge for unknown steps', () => {
      const overlay = makeOverlay({
        knowledgeOverrides: {
          'new-step': { append: ['new-knowledge'] },
        },
      })

      const result = applyOverlay({}, {}, {}, {}, overlay)

      expect(result.knowledge['new-step']).toEqual(['new-knowledge'])
    })

    it('silently adds reads for unknown steps', () => {
      const overlay = makeOverlay({
        readsOverrides: {
          'new-step': { append: ['some-doc'] },
        },
      })

      const result = applyOverlay({}, {}, {}, {}, overlay)

      expect(result.reads['new-step']).toEqual(['some-doc'])
    })

    it('silently adds dependencies for unknown steps', () => {
      const overlay = makeOverlay({
        dependencyOverrides: {
          'new-step': { append: ['some-dep'] },
        },
      })

      const result = applyOverlay({}, {}, {}, {}, overlay)

      expect(result.dependencies['new-step']).toEqual(['some-dep'])
    })
  })

  describe('immutability', () => {
    it('does not mutate the input maps', () => {
      const steps = { 'create-prd': { enabled: true } }
      const knowledge = { 'tech-stack': ['tech-stack-selection'] }
      const reads = { 'story-tests': ['ux-spec'] }
      const deps = { 'user-stories': ['review-prd'] }
      const overlay = makeOverlay({
        stepOverrides: { 'create-prd': { enabled: false } },
        knowledgeOverrides: { 'tech-stack': { append: ['new-entry'] } },
        readsOverrides: { 'story-tests': { append: ['new-read'] } },
        dependencyOverrides: { 'user-stories': { append: ['new-dep'] } },
      })

      applyOverlay(steps, knowledge, reads, deps, overlay)

      // Original inputs should be unchanged
      expect(steps).toEqual({ 'create-prd': { enabled: true } })
      expect(knowledge).toEqual({ 'tech-stack': ['tech-stack-selection'] })
      expect(reads).toEqual({ 'story-tests': ['ux-spec'] })
      expect(deps).toEqual({ 'user-stories': ['review-prd'] })
    })
  })
})
