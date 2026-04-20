import { describe, it, expect, vi } from 'vitest'
import { resolvePipeline } from './resolver.js'
import { loadPipelineContext } from './context.js'
import type { StepStateEntry } from '../../types/state.js'
import type { MetaPromptFile } from '../../types/index.js'
import type { PipelineContext } from './types.js'
import type { OutputContext } from '../../cli/output/context.js'

function makeOutput(): OutputContext {
  return {
    success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    result: vi.fn(),
    supportsInteractivePrompts: vi.fn().mockReturnValue(false),
    prompt: vi.fn(), confirm: vi.fn(), select: vi.fn(),
    multiSelect: vi.fn(), multiInput: vi.fn(),
    startSpinner: vi.fn(), stopSpinner: vi.fn(),
    startProgress: vi.fn(), updateProgress: vi.fn(), stopProgress: vi.fn(),
  } as unknown as OutputContext
}

/** Build a minimal valid PipelineContext for the config=null path.
 *  Every field required by the PipelineContext interface is set — resolvePipeline
 *  dereferences `presets.deep` on line 54, so these cannot be omitted. */
function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    projectRoot: '/fake/root',
    metaPrompts: new Map(),
    config: null,
    configErrors: [],
    configWarnings: [],
    presets: { mvp: null, deep: null, custom: null },
    methodologyDir: '/fake/methodology',
    ...overrides,
  }
}

describe('resolvePipeline', () => {
  it('returns a DependencyGraph with nodes', () => {
    const ctx = loadPipelineContext(process.cwd())
    const pipeline = resolvePipeline(ctx)
    expect(pipeline.graph.nodes.size).toBeGreaterThan(50)
  })

  it('returns a preset matching the config methodology', () => {
    const ctx = loadPipelineContext(process.cwd())
    const pipeline = resolvePipeline(ctx)
    expect(pipeline.preset).not.toBeNull()
    expect(pipeline.preset.name).toBeDefined()
  })

  it('returns overlay with steps record', () => {
    const ctx = loadPipelineContext(process.cwd())
    const pipeline = resolvePipeline(ctx)
    expect(typeof pipeline.overlay.steps).toBe('object')
    expect(Object.keys(pipeline.overlay.steps).length).toBeGreaterThan(50)
  })

  it('returns stepMeta map keyed by step name', () => {
    const ctx = loadPipelineContext(process.cwd())
    const pipeline = resolvePipeline(ctx)
    expect(pipeline.stepMeta.has('create-prd')).toBe(true)
    expect(pipeline.stepMeta.get('create-prd')?.phase).toBe('pre')
  })

  it('returns computeEligible that accepts steps and returns string[]', () => {
    const ctx = loadPipelineContext(process.cwd())
    const pipeline = resolvePipeline(ctx)
    const eligible = pipeline.computeEligible({})
    expect(Array.isArray(eligible)).toBe(true)
    expect(eligible.length).toBeGreaterThan(0)
  })

  it('applies custom enablement overrides when config has custom steps', () => {
    const ctx = loadPipelineContext(process.cwd())
    if (ctx.config) {
      ctx.config.custom = {
        steps: { 'create-prd': { enabled: false } },
      }
    }
    const pipeline = resolvePipeline(ctx)
    const prdNode = pipeline.graph.nodes.get('create-prd')
    expect(prdNode?.enabled).toBe(false)
  })

  it('custom-enables a step absent from preset (e.g., mvp + custom enable review-prd)', () => {
    const ctx = loadPipelineContext(process.cwd())
    if (ctx.config) {
      ctx.config.methodology = 'mvp'
      ctx.config.custom = {
        steps: { 'review-prd': { enabled: true } },
      }
    }
    const pipeline = resolvePipeline(ctx)
    const node = pipeline.graph.nodes.get('review-prd')
    expect(node?.enabled).toBe(true)
  })

  it('graph nodes have overlay-appended deps (user-stories depends on review-gdd for game)', () => {
    const ctx = loadPipelineContext(process.cwd())
    if (ctx.config) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod defaults fill fields at runtime
      ctx.config.project = { projectType: 'game', gameConfig: { engine: 'custom' } } as any
    }
    const pipeline = resolvePipeline(ctx)
    const node = pipeline.graph.nodes.get('user-stories')
    expect(node?.dependencies).toContain('review-gdd')
  })

  it('graph nodes have overlay-replaced deps (platform-parity-review uses review-game-ui for game)', () => {
    const ctx = loadPipelineContext(process.cwd())
    if (ctx.config) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod defaults fill fields at runtime
      ctx.config.project = { projectType: 'game', gameConfig: { engine: 'custom' } } as any
    }
    const pipeline = resolvePipeline(ctx)
    const node = pipeline.graph.nodes.get('platform-parity-review')
    expect(node?.dependencies).toContain('review-game-ui')
    expect(node?.dependencies).not.toContain('review-ux')
  })

  it('computeEligible blocks user-stories when review-gdd is not completed (game project)', () => {
    const ctx = loadPipelineContext(process.cwd())
    if (ctx.config) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod defaults fill fields at runtime
      ctx.config.project = { projectType: 'game', gameConfig: { engine: 'custom' } } as any
    }
    const pipeline = resolvePipeline(ctx)
    const state: Record<string, StepStateEntry> = {
      'review-prd': { status: 'completed', source: 'pipeline' },
    }
    const eligible = pipeline.computeEligible(state)
    expect(eligible).not.toContain('user-stories')
  })

  it('handles null config gracefully (fallback to deep, frontmatter maps preserved)', () => {
    const ctx = loadPipelineContext(process.cwd())
    ctx.config = null
    const pipeline = resolvePipeline(ctx)
    expect(pipeline.preset).not.toBeNull()
    expect(pipeline.graph.nodes.size).toBeGreaterThan(50)
    expect(Object.keys(pipeline.overlay.knowledge).length).toBeGreaterThan(0)
  })
})

describe('resolvePipeline fallback (no config)', () => {
  it('builds overlay.crossReads from frontmatter even when ctx.config is null', () => {
    const metaPrompts = new Map<string, MetaPromptFile>([
      ['system-architecture', {
        stepName: 'system-architecture',
        filePath: '/fake/sa.md',
        frontmatter: {
          name: 'system-architecture',
          description: '', summary: null,
          phase: 'architecture', order: 700,
          dependencies: [], outputs: ['docs/arch.md'],
          conditional: null, knowledgeBase: [], reads: [],
          crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
          stateless: false, category: 'pipeline',
        },
        body: '', sections: {},
      }],
    ])
    const pipeline = resolvePipeline(
      makeCtx({ metaPrompts }),
      { output: makeOutput() },
    )
    expect(pipeline.overlay.crossReads['system-architecture']).toEqual([
      { service: 'shared-lib', step: 'api-contracts' },
    ])
  })
})
