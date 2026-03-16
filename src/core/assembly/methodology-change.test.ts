import { describe, it, expect } from 'vitest'
import { detectMethodologyChange, detectDepthMismatches } from './methodology-change.js'
import type { PipelineState, ScaffoldConfig } from '../../types/index.js'

/** Helper to make a minimal PipelineState */
function makeState(
  steps: PipelineState['steps'] = {},
  configMethodology: PipelineState['config_methodology'] = 'deep',
): PipelineState {
  return {
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: configMethodology,
    'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z',
    in_progress: null,
    steps,
    next_eligible: [],
    'extra-steps': [],
  }
}

/** Helper to make a minimal ScaffoldConfig */
function makeConfig(methodology: ScaffoldConfig['methodology'] = 'deep'): ScaffoldConfig {
  return {
    version: 2,
    methodology,
    platforms: ['claude-code'],
  }
}

describe('detectMethodologyChange', () => {
  it('returns changed: false when methodology matches', () => {
    const state = makeState({}, 'deep')
    const config = makeConfig('deep')

    const result = detectMethodologyChange({ state, config })

    expect(result.changed).toBe(false)
    expect(result.warnings).toHaveLength(0)
    expect(result.stateMeta).toBe('deep')
    expect(result.configMeta).toBe('deep')
  })

  it('returns changed: true with warning when methodology changed', () => {
    const state = makeState({}, 'deep')
    const config = makeConfig('mvp')

    const result = detectMethodologyChange({ state, config })

    expect(result.changed).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].code).toBe('ASM_METHODOLOGY_CHANGED')
  })

  it('ASM_METHODOLOGY_CHANGED warning message includes both methodologies', () => {
    const state = makeState({}, 'deep')
    const config = makeConfig('mvp')

    const result = detectMethodologyChange({ state, config })

    const warning = result.warnings[0]
    expect(warning.message).toContain('deep')
    expect(warning.message).toContain('mvp')
  })
})

describe('detectDepthMismatches', () => {
  it('returns empty array when all steps completed at current depth', () => {
    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 3,
      },
      'review-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 3,
      },
    })

    const warnings = detectDepthMismatches({ state, currentDefaultDepth: 3 })

    expect(warnings).toHaveLength(0)
  })

  it('returns warnings for steps completed at lower depth than current default', () => {
    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 2,
      },
    })

    const warnings = detectDepthMismatches({ state, currentDefaultDepth: 4 })

    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('ASM_COMPLETED_AT_LOWER_DEPTH')
    expect(warnings[0].message).toContain('create-prd')
    expect(warnings[0].message).toContain('2')
    expect(warnings[0].message).toContain('4')
  })

  it('skips non-completed steps', () => {
    const state = makeState({
      'create-prd': {
        status: 'pending',
        source: 'pipeline',
      },
      'review-prd': {
        status: 'in_progress',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 1,
      },
    })

    const warnings = detectDepthMismatches({ state, currentDefaultDepth: 5 })

    expect(warnings).toHaveLength(0)
  })

  it('returns warning for each step completed at lower depth', () => {
    const state = makeState({
      'step-a': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 1,
      },
      'step-b': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 2,
      },
      'step-c': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 4,
      },
    })

    const warnings = detectDepthMismatches({ state, currentDefaultDepth: 4 })

    // step-a (1 < 4) and step-b (2 < 4) should warn; step-c (4 == 4) should not
    expect(warnings).toHaveLength(2)
    const slugs = warnings.map(w => w.message).join(' ')
    expect(slugs).toContain('step-a')
    expect(slugs).toContain('step-b')
  })

  it('does not warn for steps completed at equal or higher depth', () => {
    const state = makeState({
      'step-a': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 5,
      },
    })

    const warnings = detectDepthMismatches({ state, currentDefaultDepth: 3 })

    expect(warnings).toHaveLength(0)
  })
})
