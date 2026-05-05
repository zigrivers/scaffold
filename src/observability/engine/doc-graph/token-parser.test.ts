import { describe, it, expect } from 'vitest'
import { parseDesignTokens } from './token-parser.js'

describe('parseDesignTokens', () => {
  it('extracts tokens from category tables', () => {
    const md = `# Design System

## Colors

| Token | Value | Priority |
|---|---|---|
| --color-primary | #4f46e5 | must |
| --color-danger | #ef4444 | must |
| --color-muted | #94a3b8 | should |

## Spacing

| Token | Value | Priority |
|---|---|---|
| --sp-1 | 4px | should |
| --sp-2 | 8px | should |
`
    const tokens = parseDesignTokens(md)
    expect(tokens).toHaveLength(5)
    expect(tokens[0]).toMatchObject({
      id: 'token:--color-primary',
      category: 'color',
      value: '#4f46e5',
      priority: 'must',
      source_anchor: 'docs/design-system.md#colors',
    })
    expect(tokens[3].category).toBe('spacing')
  })

  it('defaults priority to "should" when column is missing', () => {
    const md = `## Colors\n\n| Token | Value |\n|---|---|\n| --color-x | #fff |\n`
    const tokens = parseDesignTokens(md)
    expect(tokens[0].priority).toBe('should')
  })
})
