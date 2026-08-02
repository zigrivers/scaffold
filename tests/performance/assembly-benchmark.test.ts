import { describe, it, expect } from 'vitest'
import { AssemblyEngine } from '../../src/core/assembly/engine.js'
import type { AssemblyOptions } from '../../src/types/index.js'
import type { MetaPromptFile } from '../../src/types/index.js'
import type { PipelineState } from '../../src/types/state.js'
import { BUDGET_ASSEMBLY_MS, BUDGET_ASSEMBLY_HEAVY_MS } from './budgets.js'
import { perOpStatsMs } from './measure.js'

// Create a realistic mock of assembly inputs
function createRealisticOptions(): { step: string; options: AssemblyOptions } {
  const metaPrompt: MetaPromptFile = {
    stepName: 'create-prd',
    filePath: '/fake/pipeline/create-prd.md',
    frontmatter: {
      name: 'create-prd',
      description: 'Create a product requirements document',
      phase: 'pre',
      order: 1,
      dependencies: [],
      outputs: ['docs/prd.md'],
      conditional: null,
      knowledgeBase: ['prd-craft'],
      reads: [],
    },
    body: [
      '## Purpose\n\nCreate a comprehensive PRD.',
      '## Inputs\n\nProject idea.',
      '## Process\n\nGather requirements.',
    ].join('\n\n'),
    sections: {
      'Purpose': 'Create a comprehensive PRD.',
      'Inputs': 'Project idea.',
      'Process': 'Gather requirements.',
    },
  }

  const state: PipelineState = {
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: new Date().toISOString(),
    in_progress: null,
    steps: {},
    next_eligible: [],
    'extra-steps': [],
  }

  const options: AssemblyOptions = {
    config: {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {},
    },
    state,
    metaPrompt,
    knowledgeEntries: [
      {
        name: 'prd-craft',
        description: 'PRD writing expertise',
        topics: ['requirements', 'prd'],
        content: 'A '.repeat(500) + 'PRD craft content.',  // ~300 word KB entry
      },
    ],
    instructions: { global: null, perStep: null, inline: null },
    depth: 3,
    depthProvenance: 'preset-default',
    updateMode: false,
    artifacts: [],
    decisions: '',
  }

  return { step: 'create-prd', options }
}

// The heaviest realistic input: a full knowledge-base injection plus the
// artifacts an update-mode step reads back in. This fixture used to live in
// src/core/assembly/engine.test.ts, timed with a single Date.now() sample
// against a 500ms budget — a wall-clock assertion in the middle of the parallel
// correctness suite, which is the flake pattern documented in
// src/project/adoption-apply.write-cost.test.ts. The input was worth keeping;
// the measurement method was not. It lives here now, sampled in an unloaded
// process, and it earns its keep: it costs several times the light case, so a
// change that makes assembly scale badly with knowledge-base size moves this
// budget while leaving the light one alone.
function createHeavyOptions(): { step: string; options: AssemblyOptions } {
  const { step, options } = createRealisticOptions()
  return {
    step,
    options: {
      ...options,
      knowledgeEntries: Array.from({ length: 10 }, (_, i) => ({
        name: `entry-${i}`,
        description: `Entry ${i}`,
        topics: ['testing'],
        content: 'Some content '.repeat(100),
      })),
      artifacts: Array.from({ length: 5 }, (_, i) => ({
        stepName: 'create-prd',
        filePath: `docs/doc-${i}.md`,
        content: '# Doc '.repeat(200),
      })),
    },
  }
}

describe('Assembly Engine Performance', () => {
  it('assembles a realistic prompt within budget (p95)', () => {
    const engine = new AssemblyEngine()
    const { step, options } = createRealisticOptions()

    // Assert the work happened outside the timed region — an assemble that
    // failed fast would otherwise be the cheapest possible way to pass a
    // timing budget.
    expect(engine.assemble(step, options).success).toBe(true)

    const stats = perOpStatsMs(() => { engine.assemble(step, options) })
    console.log(`Assembly ${stats.summary}`)

    // budgets.ts explains why this is not the PRD's original 500ms.
    expect(stats.p95).toBeLessThan(BUDGET_ASSEMBLY_MS)
  })

  it('assembles a knowledge-heavy prompt within budget (p95)', () => {
    const engine = new AssemblyEngine()
    const { step, options } = createHeavyOptions()

    const result = engine.assemble(step, options)
    expect(result.success).toBe(true)
    // The heavy fixture must actually be heavy. If a refactor ever stopped
    // inlining knowledge entries into the prompt, this benchmark would quietly
    // become a duplicate of the light one.
    expect(result.prompt!.text.length, 'heavy fixture did not produce a large prompt')
      .toBeGreaterThan(15_000)

    const stats = perOpStatsMs(() => { engine.assemble(step, options) })
    console.log(`Assembly (heavy) ${stats.summary}`)
    expect(stats.p95).toBeLessThan(BUDGET_ASSEMBLY_HEAVY_MS)
  })

  it('produces deterministic output', () => {
    const engine = new AssemblyEngine()
    const { step, options } = createRealisticOptions()
    const r1 = engine.assemble(step, options)
    const r2 = engine.assemble(step, options)
    expect(r1.prompt?.text).toBe(r2.prompt?.text)
  })
})
