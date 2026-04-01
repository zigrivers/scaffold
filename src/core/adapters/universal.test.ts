import { describe, it, expect, beforeEach } from 'vitest'
import { UniversalAdapter } from './universal.js'
import type { AdapterContext, AdapterStepInput, AdapterFinalizeInput, AdapterStepOutput } from './adapter.js'

const makeContext = (overrides?: Partial<AdapterContext>): AdapterContext => ({
  projectRoot: '/projects/myapp',
  methodology: 'standard',
  allSteps: ['define-goals', 'design-arch'],
  ...overrides,
})

const makeStepInput = (overrides?: Partial<AdapterStepInput>): AdapterStepInput => ({
  slug: 'define-goals',
  description: 'Define project goals',
  phase: 'pre',
  dependsOn: [],
  produces: ['docs/goals.md'],
  pipelineIndex: 0,
  body: '## Purpose\nDefine the project goals.',
  sections: { Purpose: 'Define the project goals.' },
  knowledgeEntries: [],
  conditional: null,
  longDescription: 'Define the project goals.',
  ...overrides,
})

const makeFinalizeInput = (steps: AdapterStepOutput[]): AdapterFinalizeInput => ({
  results: steps,
})

describe('UniversalAdapter', () => {
  let adapter: UniversalAdapter

  beforeEach(() => {
    adapter = new UniversalAdapter()
  })

  // T-042 test 1: generateStepWrapper returns empty files (no-op)
  it('generateStepWrapper returns empty files array (no-op)', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput())
    expect(output.files).toEqual([])
  })

  // T-042 test 2: finalize() generates hidden prompts/README.md
  it('finalize() generates a single hidden prompts/README.md file', () => {
    adapter.initialize(makeContext())
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files).toHaveLength(1)
    expect(result.files[0].relativePath).toBe('.scaffold/generated/universal/prompts/README.md')
  })

  // T-042 test 3: README contains scaffold run commands for each step
  it('README contains scaffold run commands for each collected step', () => {
    adapter.initialize(makeContext())
    adapter.generateStepWrapper(makeStepInput({ slug: 'define-goals', description: 'Define project goals' }))
    adapter.generateStepWrapper(makeStepInput({ slug: 'design-arch', description: 'Design architecture' }))
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files[0].content).toContain('scaffold run define-goals')
    expect(result.files[0].content).toContain('scaffold run design-arch')
    expect(result.files[0].content).toContain('Define project goals')
    expect(result.files[0].content).toContain('Design architecture')
  })

  // T-042 test 4: Output is deterministic
  it('output is deterministic — same steps produce same README', () => {
    adapter.initialize(makeContext())
    adapter.generateStepWrapper(makeStepInput())
    const result1 = adapter.finalize(makeFinalizeInput([]))

    const adapter2 = new UniversalAdapter()
    adapter2.initialize(makeContext())
    adapter2.generateStepWrapper(makeStepInput())
    const result2 = adapter2.finalize(makeFinalizeInput([]))

    expect(result1.files[0].content).toBe(result2.files[0].content)
  })

  // T-042 test 5: generateStepWrapper collects steps for finalize
  it('generateStepWrapper collects steps so finalize can list them', () => {
    adapter.initialize(makeContext())
    adapter.generateStepWrapper(makeStepInput({ slug: 'step-x' }))
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files[0].content).toContain('scaffold run step-x')
  })

  // Additional: initialize() returns success
  it('initialize() returns success', () => {
    const result = adapter.initialize(makeContext())
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  })

  // Additional: finalize() returns empty errors
  it('finalize() returns empty errors array', () => {
    adapter.initialize(makeContext())
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.errors).toEqual([])
  })

  // Additional: platformId is 'universal'
  it('platformId is "universal"', () => {
    expect(adapter.platformId).toBe('universal')
  })

  // Additional: README has usage instructions
  it('README contains usage instructions', () => {
    adapter.initialize(makeContext())
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files[0].content).toContain('scaffold run')
    expect(result.files[0].content).toContain('Scaffold Pipeline')
  })

  // Additional: finalize with no steps shows placeholder
  it('README shows placeholder when no steps have been collected', () => {
    adapter.initialize(makeContext())
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files[0].content).toContain('(No steps configured)')
  })

  // Additional: file writeMode is 'create'
  it('README file writeMode is "create"', () => {
    adapter.initialize(makeContext())
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files[0].writeMode).toBe('create')
  })

  // Additional: generateStepWrapper returns correct metadata
  it('generateStepWrapper returns success true and platformId "universal"', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput())
    expect(output.success).toBe(true)
    expect(output.platformId).toBe('universal')
    expect(output.slug).toBe('define-goals')
  })

  // Additional: initialize() resets collected steps
  it('initialize() resets previously collected steps', () => {
    adapter.initialize(makeContext())
    adapter.generateStepWrapper(makeStepInput({ slug: 'old-step' }))
    adapter.initialize(makeContext())
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files[0].content).not.toContain('old-step')
    expect(result.files[0].content).toContain('(No steps configured)')
  })
})
