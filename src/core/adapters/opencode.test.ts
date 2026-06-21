import { describe, it, expect, beforeEach } from 'vitest'
import { OpenCodeAdapter } from './opencode.js'
import type { AdapterContext, AdapterStepInput } from './adapter.js'

const makeContext = (overrides?: Partial<AdapterContext>): AdapterContext => ({
  projectRoot: '/projects/myapp',
  methodology: 'standard',
  allSteps: ['define-goals', 'design-arch', 'create-spec'],
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

describe('OpenCodeAdapter', () => {
  let adapter: OpenCodeAdapter

  beforeEach(() => {
    adapter = new OpenCodeAdapter()
  })

  it('has the opencode platform id', () => {
    expect(adapter.platformId).toBe('opencode')
  })

  it('initialize() returns success', () => {
    expect(adapter.initialize(makeContext())).toEqual({ success: true, errors: [] })
  })

  it('writes a flat scaffold-prefixed command file under .opencode/commands/', () => {
    adapter.initialize(makeContext())
    const out = adapter.generateStepWrapper(makeStepInput())
    expect(out.success).toBe(true)
    expect(out.files).toHaveLength(1)
    expect(out.files[0].relativePath).toBe('.opencode/commands/scaffold-define-goals.md')
    expect(out.files[0].writeMode).toBe('create')
  })

  it('emits a description frontmatter and the $ARGUMENTS placeholder', () => {
    adapter.initialize(makeContext())
    const { content } = adapter.generateStepWrapper(makeStepInput()).files[0]
    expect(content).toMatch(/^---\ndescription: "Define project goals"\n---/)
    expect(content).toContain('Define the project goals.')
    expect(content).toContain('User request: $ARGUMENTS')
  })

  it('renders a Domain Knowledge section when entries are present', () => {
    adapter.initialize(makeContext())
    const input = makeStepInput({
      knowledgeEntries: [{ name: 'rest-apis', description: 'REST design', content: 'Use nouns.' }],
    })
    const { content } = adapter.generateStepWrapper(input).files[0]
    expect(content).toContain('## Domain Knowledge')
    expect(content).toContain('### rest-apis')
    expect(content).toContain('Use nouns.')
  })

  it('lists downstream steps in an After This Step section', () => {
    adapter.initialize(makeContext())
    const { content } = adapter.generateStepWrapper(makeStepInput({ dependsOn: ['design-arch'] })).files[0]
    expect(content).toContain('## After This Step')
    expect(content).toContain('`/scaffold-design-arch`')
  })

  it('finalize() returns no extra files', () => {
    expect(adapter.finalize({ results: [] })).toEqual({ files: [], errors: [] })
  })
})
