import { describe, it, expect } from 'vitest'
import { resolvePipeline } from './resolver.js'
import type { PipelineContext } from './types.js'
import type { MethodologyPreset, ScaffoldConfig } from '../../types/index.js'

describe('resolvePipeline — brownfield preset selection (D11 R1)', () => {
  it('selects presets.brownfield when config.methodology is brownfield', () => {
    const brownfield: MethodologyPreset = {
      name: 'Brownfield', description: 'x', default_depth: 3,
      steps: { 'github-setup': { enabled: true } },
    }
    const context: PipelineContext = {
      projectRoot: '/tmp/does-not-matter',
      metaPrompts: new Map(),
      config: { version: 2, methodology: 'brownfield', platforms: ['claude-code'] } as ScaffoldConfig,
      configErrors: [],
      configWarnings: [],
      presets: { deep: null, mvp: null, custom: null, brownfield },
      methodologyDir: '/tmp/does-not-matter',
    }
    const pipeline = resolvePipeline(context, {})
    expect(pipeline.preset.name).toBe('Brownfield')
    expect(pipeline.overlay.steps['github-setup'].enabled).toBe(true)
  })
})
