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
  body: '## Purpose\nDefine the project goals.\n\n## Inputs\n- docs/prd.md\n\n## Expected Outputs\n- docs/goals.md',
  sections: { Purpose: 'Define the project goals.', Inputs: '- docs/prd.md', 'Expected Outputs': '- docs/goals.md' },
  knowledgeEntries: [],
  conditional: null,
  longDescription: 'Define the project goals and success criteria based on PRD requirements.',
  ...overrides,
})

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter()
  })

  it('initialize() returns success', () => {
    const result = adapter.initialize(makeContext())
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('generateStepWrapper creates file under .scaffold/generated/claude-code/commands/<slug>.md', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ slug: 'define-goals' }))
    expect(output.files).toHaveLength(1)
    expect(output.files[0].relativePath).toBe('.scaffold/generated/claude-code/commands/define-goals.md')
  })

  it('generated file has YAML frontmatter with description', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ description: 'Define project goals' }))
    expect(output.files[0].content).toContain('---')
    expect(output.files[0].content).toContain('description:')
    expect(output.files[0].content).toContain('Define project goals')
  })

  it('generated file includes meta-prompt body content', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({
      body: '## Purpose\nBuild the thing.\n\n## Inputs\n- docs/prd.md',
    }))
    expect(output.files[0].content).toContain('Build the thing')
    expect(output.files[0].content).toContain('## Inputs')
  })

  it('generated file includes long-description in frontmatter', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({
      longDescription: 'A detailed description of the step.',
    }))
    expect(output.files[0].content).toContain('long-description:')
    expect(output.files[0].content).toContain('A detailed description of the step')
  })

  it('generated file includes knowledge entries under Domain Knowledge heading', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({
      knowledgeEntries: [
        { name: 'testing-strategy', description: 'Test patterns', content: 'Use the test pyramid.' },
        { name: 'api-design', description: 'API patterns', content: 'REST best practices.' },
      ],
    }))
    const content = output.files[0].content
    expect(content).toContain('## Domain Knowledge')
    expect(content).toContain('### testing-strategy')
    expect(content).toContain('Use the test pyramid.')
    expect(content).toContain('### api-design')
    expect(content).toContain('REST best practices.')
  })

  it('generated file has no Domain Knowledge section when no entries', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ knowledgeEntries: [] }))
    expect(output.files[0].content).not.toContain('Domain Knowledge')
  })

  it('finalize() returns empty files array', () => {
    adapter.initialize(makeContext())
    const finalizeInput: AdapterFinalizeInput = { results: [] }
    const result = adapter.finalize(finalizeInput)
    expect(result.files).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('output is deterministic — same input produces same output', () => {
    adapter.initialize(makeContext())
    const input = makeStepInput()
    const out1 = adapter.generateStepWrapper(input)
    const out2 = adapter.generateStepWrapper(input)
    expect(out1.files[0].content).toBe(out2.files[0].content)
  })

  it('generateStepWrapper returns platformId "claude-code" and correct slug', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ slug: 'design-arch' }))
    expect(output.platformId).toBe('claude-code')
    expect(output.slug).toBe('design-arch')
    expect(output.success).toBe(true)
  })

  it('generates "After This Step" section when dependsOn is non-empty', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ dependsOn: ['step-a', 'step-b'] }))
    expect(output.files[0].content).toContain('After This Step')
    expect(output.files[0].content).toContain('/scaffold:step-a')
    expect(output.files[0].content).toContain('/scaffold:step-b')
  })

  it('omits "After This Step" section when dependsOn is empty', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput({ dependsOn: [] }))
    expect(output.files[0].content).not.toContain('After This Step')
  })

  it('file writeMode is "create"', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput())
    expect(output.files[0].writeMode).toBe('create')
  })
})
