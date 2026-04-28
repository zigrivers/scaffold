import { describe, it, expect } from 'vitest'
import { pipelineStepsForReconcile } from './reconcile-input.js'
import type { PipelineContext, ResolvedPipeline } from './types.js'
import type { MetaPromptFile, MetaPromptFrontmatter } from '../../types/frontmatter.js'

function fm(name: string, outputs: string[] = []): MetaPromptFile {
  const frontmatter = {
    name,
    description: '',
    phase: 'pre',
    order: 1,
    dependencies: [],
    outputs,
    conditional: null,
    knowledgeBase: [],
    reads: [],
  } as unknown as MetaPromptFrontmatter
  return {
    frontmatter,
    stepName: name,
    filePath: `/fake/${name}.md`,
    body: '',
    sections: {},
  } as unknown as MetaPromptFile
}

function makeContext(
  metaPromptsList: Array<[string, MetaPromptFile]>,
  config: PipelineContext['config'] = null,
): PipelineContext {
  return {
    config,
    presets: { deep: null, mvp: null, custom: null },
    metaPrompts: new Map(metaPromptsList),
    methodologyDir: '/fake/methodology',
  } as unknown as PipelineContext
}

function makePipeline(
  enabled: Record<string, boolean>,
  globalSlugs: string[],
): ResolvedPipeline {
  const steps: Record<string, { enabled: boolean }> = {}
  for (const [slug, e] of Object.entries(enabled)) {
    steps[slug] = { enabled: e }
  }
  return {
    overlay: {
      steps, knowledge: {}, reads: {}, dependencies: {}, crossReads: {},
    },
    globalSteps: new Set(globalSlugs),
  } as unknown as ResolvedPipeline
}

describe('pipelineStepsForReconcile', () => {
  it('flat / single-project mode: includes every enabled meta-prompt, drops disabled', () => {
    const context = makeContext([
      ['enabled-step', fm('enabled-step', ['docs/enabled.md'])],
      ['disabled-step', fm('disabled-step', [])],
    ])
    const pipeline = makePipeline(
      { 'enabled-step': true, 'disabled-step': false },
      [],
    )
    const result = pipelineStepsForReconcile(context, pipeline, undefined)
    expect(result).toEqual([
      { slug: 'enabled-step', produces: ['docs/enabled.md'], enabled: true },
      { slug: 'disabled-step', produces: [], enabled: false },
    ])
  })

  it('service mode: excludes global steps (they belong to root state)', () => {
    const context = makeContext([
      ['service-step', fm('service-step')],
      ['global-step', fm('global-step')],
    ])
    const pipeline = makePipeline(
      { 'service-step': true, 'global-step': true },
      ['global-step'],
    )
    const result = pipelineStepsForReconcile(context, pipeline, 'api')
    expect(result.map(s => s.slug)).toEqual(['service-step'])
  })

  it('multi-service root mode: includes only globals (services[] but no --service)', () => {
    const context = makeContext(
      [
        ['service-step', fm('service-step')],
        ['global-step', fm('global-step')],
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { project: { services: [{ name: 'api' }] } } as any,
    )
    const pipeline = makePipeline(
      { 'service-step': true, 'global-step': true },
      ['global-step'],
    )
    const result = pipelineStepsForReconcile(context, pipeline, undefined)
    expect(result.map(s => s.slug)).toEqual(['global-step'])
  })

  it('flat single-project (no services[]): scope is unconstrained even without --service', () => {
    const context = makeContext([
      ['step-a', fm('step-a')],
      ['step-b', fm('step-b')],
    ])
    const pipeline = makePipeline(
      { 'step-a': true, 'step-b': true },
      [],
    )
    const result = pipelineStepsForReconcile(context, pipeline, undefined)
    expect(result.map(s => s.slug).sort()).toEqual(['step-a', 'step-b'])
  })
})
