import { describe, it, expect } from 'vitest'
import { KnowledgeUpdateAssembler } from './knowledge-update-assembler.js'

const TEMPLATE = `## Task
Write \`.scaffold/knowledge/{{name}}.md\`.
## Global Knowledge Entry (seed)
{{globalBody}}
{{#hasLocalOverride}}
## Existing Local Override
{{localOverrideContent}}
{{/hasLocalOverride}}
## Project Context
Methodology: {{methodology}}
{{#hasArtifacts}}
Artifacts:
{{artifacts}}
{{/hasArtifacts}}
{{#hasFocus}}
## Focus
{{focus}}
{{/hasFocus}}
## Output Instructions
- Write the complete file.`

describe('KnowledgeUpdateAssembler', () => {
  it('create mode: includes global body, no local override section', () => {
    const assembler = new KnowledgeUpdateAssembler(TEMPLATE)
    const result = assembler.assemble({
      name: 'api-design',
      globalBody: '# API Design\nUse REST.',
      localOverrideContent: null,
      methodology: 'deep',
      artifacts: [],
      focus: null,
    })
    expect(result).toContain('api-design')
    expect(result).toContain('# API Design')
    expect(result).toContain('Methodology: deep')
    expect(result).not.toContain('Existing Local Override')
    expect(result).not.toContain('## Focus')
  })

  it('update mode: includes local override section', () => {
    const assembler = new KnowledgeUpdateAssembler(TEMPLATE)
    const result = assembler.assemble({
      name: 'api-design',
      globalBody: '# API Design\nUse REST.',
      localOverrideContent: '# Custom API\nUse GraphQL.',
      methodology: 'deep',
      artifacts: [],
      focus: null,
    })
    expect(result).toContain('Existing Local Override')
    expect(result).toContain('# Custom API')
  })

  it('includes focus section when instructions provided', () => {
    const assembler = new KnowledgeUpdateAssembler(TEMPLATE)
    const result = assembler.assemble({
      name: 'api-design',
      globalBody: 'Body.',
      localOverrideContent: null,
      methodology: 'mvp',
      artifacts: [],
      focus: 'Focus on GraphQL patterns',
    })
    expect(result).toContain('## Focus')
    expect(result).toContain('Focus on GraphQL patterns')
  })

  it('includes artifacts when provided', () => {
    const assembler = new KnowledgeUpdateAssembler(TEMPLATE)
    const result = assembler.assemble({
      name: 'api-design',
      globalBody: 'Body.',
      localOverrideContent: null,
      methodology: 'deep',
      artifacts: ['# My API Spec\nEndpoints here.'],
      focus: null,
    })
    expect(result).toContain('Artifacts:')
    expect(result).toContain('# My API Spec')
  })

  it('local-only mode: uses local content as seed when global body is placeholder', () => {
    const assembler = new KnowledgeUpdateAssembler(TEMPLATE)
    const result = assembler.assemble({
      name: 'custom-entry',
      globalBody: '(no global seed — this entry exists only locally)',
      localOverrideContent: '# Custom\nLocal only.',
      methodology: 'deep',
      artifacts: [],
      focus: 'Expand with more detail',
    })
    expect(result).toContain('no global seed')
    expect(result).toContain('Existing Local Override')
  })
})
