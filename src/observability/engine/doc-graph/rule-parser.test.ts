import { describe, it, expect } from 'vitest'
import { parseRules } from './rule-parser.js'

describe('parseRules', () => {
  it('extracts H3 Rule blocks with structured fields', () => {
    const md = `# Coding Standards

## TypeScript

### Rule: no-console

Description: Avoid \`console.log\` in production source.

- pattern: \`console\\.log\\(\`
- match: src/**/*.ts
- language: typescript
- severity: P1
- enforce-via: linter

### Rule: prefer-const

Description: Use \`const\` for never-reassigned bindings.

- forbidden: let immutable, var
- language: typescript
`
    const rules = parseRules(md, 'docs/coding-standards.md')
    expect(rules).toHaveLength(2)
    expect(rules[0]).toMatchObject({
      id: 'rule:no-console',
      pattern: 'console\\.log\\(',
      match: 'src/**/*.ts',
      language: 'typescript',
      severity: 'P1',
      enforce_via: 'linter',
    })
    expect(rules[0].description).toContain('console.log')
    expect(rules[1].forbidden).toEqual(['let immutable', 'var'])
  })

  it('returns [] when no Rule headings exist', () => {
    const md = '# Coding Standards\n\n## TypeScript\n\nUse TypeScript everywhere.\n'
    expect(parseRules(md, 'docs/coding-standards.md')).toEqual([])
  })
})
