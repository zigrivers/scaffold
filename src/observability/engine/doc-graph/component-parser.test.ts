import { describe, it, expect } from 'vitest'
import { parseSanctionedComponents } from './component-parser.js'

describe('parseSanctionedComponents', () => {
  it('extracts components grouped by H2 layer when layer field is omitted', () => {
    const md = `# Tech Stack

## Frontend

### React

- package_or_url: react@18

### Tailwind CSS

- package_or_url: tailwindcss@3

## Backend

### PostgreSQL

- package_or_url: postgres@16
- layer: data
`
    const cs = parseSanctionedComponents(md)
    expect(cs).toHaveLength(3)
    expect(cs[0]).toMatchObject({
      id: 'component:react',
      package_or_url: 'react@18',
      layer: 'frontend',
      source_anchor: 'docs/tech-stack.md#react',
    })
    expect(cs[1].layer).toBe('frontend')
    expect(cs[2].layer).toBe('data')
  })

  it('skips H3 entries without package_or_url field', () => {
    const md = `## Frontend\n\n### Some Section Without Package\n\nProse only.\n`
    expect(parseSanctionedComponents(md)).toEqual([])
  })
})
