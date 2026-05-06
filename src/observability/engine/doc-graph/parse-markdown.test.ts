import { describe, it, expect } from 'vitest'
import { parseMarkdown, headingsAtDepth, sectionAfterHeading, slugify, extractInlineTags } from './parse-markdown.js'

describe('parse-markdown', () => {
  const sample = `# Title

Some intro text.

## First Heading [priority: must]

Body of first section.

### Sub heading

More content.

## Second Heading [priority: should]

Final section.
`

  it('parseMarkdown returns a remark AST root', () => {
    const root = parseMarkdown(sample)
    expect(root.type).toBe('root')
    expect(root.children.length).toBeGreaterThan(0)
  })

  it('headingsAtDepth(2) returns the two ## headings with their text', () => {
    const root = parseMarkdown(sample)
    const h2s = headingsAtDepth(root, 2)
    expect(h2s.map((h) => h.textContent)).toEqual([
      'First Heading [priority: must]',
      'Second Heading [priority: should]',
    ])
  })

  it('sectionAfterHeading returns markdown text until the next same-or-higher heading', () => {
    const root = parseMarkdown(sample)
    const h2s = headingsAtDepth(root, 2)
    const body = sectionAfterHeading(root, h2s[0])
    expect(body).toContain('Body of first section.')
    expect(body).toContain('Sub heading')
    expect(body).not.toContain('Final section.')
  })

  it('extractInlineTags pulls [key: value] tags from a heading text', () => {
    const tags = extractInlineTags('First Heading [priority: must] [kind: ui]')
    expect(tags).toEqual({ priority: 'must', kind: 'ui' })
  })

  it('slugify produces stable kebab-case ids', () => {
    expect(slugify('First Heading [priority: must]')).toBe('first-heading')
    expect(slugify('User Auth — Login & Signup')).toBe('user-auth-login-signup')
  })
})
