import { describe, it, expect, beforeEach } from 'vitest'
import { ClaudeCodeAdapter } from './claude-code.js'
import type { AdapterContext, AdapterStepInput, AdapterFinalizeInput } from './adapter.js'

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
  ...overrides,
})

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter()
  })

  // T-040 test 1: initialize() returns success
  it('initialize() returns success', () => {
    const result = adapter.initialize(makeContext())
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  })

  // T-040 test 2: generateStepWrapper creates file at commands/<slug>.md
  it('generateStepWrapper creates file at commands/<slug>.md', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ slug: 'define-goals' }))
    expect(output.files).toHaveLength(1)
    expect(output.files[0].relativePath).toBe('commands/define-goals.md')
  })

  // T-040 test 3: File has YAML frontmatter with description
  it('generated file has YAML frontmatter with description', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ description: 'Define project goals' }))
    expect(output.files[0].content).toContain('---')
    expect(output.files[0].content).toContain('description: Define project goals')
  })

  // T-040 test 4: File body contains scaffold run <slug>
  it('generated file body contains scaffold run <slug>', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ slug: 'define-goals' }))
    expect(output.files[0].content).toContain('scaffold run define-goals')
  })

  // T-040 test 5: File body contains step index
  it('generated file body contains step index (1-based)', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ pipelineIndex: 2 }))
    expect(output.files[0].content).toContain('step 3')
  })

  // T-040 test 6: finalize() returns empty files
  it('finalize() returns empty files array', () => {
    adapter.initialize(makeContext())
    const finalizeInput: AdapterFinalizeInput = { results: [] }
    const result = adapter.finalize(finalizeInput)
    expect(result.files).toEqual([])
    expect(result.errors).toEqual([])
  })

  // T-040 test 7: Output is deterministic (same input → same output)
  it('output is deterministic — same input produces same output', () => {
    adapter.initialize(makeContext())
    const input = makeStepInput()
    const out1 = adapter.generateStepWrapper(input)
    const out2 = adapter.generateStepWrapper(input)
    expect(out1.files[0].content).toBe(out2.files[0].content)
  })

  // Additional: generateStepWrapper returns correct platformId and slug
  it('generateStepWrapper returns platformId "claude-code" and correct slug', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ slug: 'design-arch' }))
    expect(output.platformId).toBe('claude-code')
    expect(output.slug).toBe('design-arch')
    expect(output.success).toBe(true)
  })

  // Additional: dependsOn produces "After This Step" section
  it('generates "After This Step" section when dependsOn is non-empty', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ dependsOn: ['step-a', 'step-b'] }))
    expect(output.files[0].content).toContain('After This Step')
    expect(output.files[0].content).toContain('scaffold run step-a')
    expect(output.files[0].content).toContain('scaffold run step-b')
  })

  // Additional: no "After This Step" when dependsOn is empty
  it('omits "After This Step" section when dependsOn is empty', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ dependsOn: [] }))
    expect(output.files[0].content).not.toContain('After This Step')
  })

  // Additional: file writeMode is 'create'
  it('file writeMode is "create"', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput())
    expect(output.files[0].writeMode).toBe('create')
  })
})
