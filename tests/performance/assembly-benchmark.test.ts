import { describe, it, expect } from 'vitest'
import { AssemblyEngine } from '../../src/core/assembly/engine.js'
import type { AssemblyOptions } from '../../src/types/index.js'
import type { MetaPromptFile } from '../../src/types/index.js'
import type { PipelineState } from '../../src/types/state.js'

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

describe('Assembly Engine Performance', () => {
  it('assembles prompt within 500ms budget (p95)', () => {
    const engine = new AssemblyEngine()
    const { step, options } = createRealisticOptions()

    // Warm up
    engine.assemble(step, options)

    // Measure 20 iterations
    const timings: number[] = []
    for (let i = 0; i < 20; i++) {
      const start = performance.now()
      const result = engine.assemble(step, options)
      const elapsed = performance.now() - start
      timings.push(elapsed)
      expect(result.success).toBe(true)
    }

    timings.sort((a, b) => a - b)
    const p50 = timings[Math.floor(timings.length * 0.5)]
    const p95 = timings[Math.floor(timings.length * 0.95)]
    const p99 = timings[Math.floor(timings.length * 0.99)]

    console.log(`Assembly p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms p99=${p99.toFixed(2)}ms`)

    expect(p95).toBeLessThan(500)  // PRD §18 budget
  })

  it('produces deterministic output', () => {
    const engine = new AssemblyEngine()
    const { step, options } = createRealisticOptions()
    const r1 = engine.assemble(step, options)
    const r2 = engine.assemble(step, options)
    expect(r1.prompt?.text).toBe(r2.prompt?.text)
  })
})
