import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { parseFrontmatter, parseAndValidate } from './frontmatter.js'

const tmpFiles: string[] = []

function tmpPath(ext = '.md') {
  const p = path.join(os.tmpdir(), `scaffold-fm-test-${crypto.randomUUID()}${ext}`)
  tmpFiles.push(p)
  return p
}

function writeTmp(content: string, ext = '.md') {
  const p = tmpPath(ext)
  fs.writeFileSync(p, content, 'utf8')
  return p
}

afterEach(() => {
  for (const f of tmpFiles) {
    try { fs.rmSync(f, { force: true }) } catch { /* ignore */ }
  }
  tmpFiles.length = 0
})

const validFrontmatter = `---
name: create-prd
description: Create a product requirements document
phase: pre
order: 1
outputs:
  - docs/prd.md
knowledge-base:
  - prd-craft
reads: []
---

This is the body.
`

describe('parseFrontmatter', () => {
  it('parses valid frontmatter and returns typed object', () => {
    const p = writeTmp(validFrontmatter)
    const result = parseFrontmatter(p)
    expect(result.name).toBe('create-prd')
    expect(result.description).toBe('Create a product requirements document')
    expect(result.phase).toBe('pre')
    expect(result.order).toBe(1)
    expect(result.outputs).toEqual(['docs/prd.md'])
    expect(result.knowledgeBase).toEqual(['prd-craft'])
    expect(result.reads).toEqual([])
    expect(result.dependencies).toEqual([])
    expect(result.conditional).toBeNull()
  })

  it('rejects file without opening --- on line 1 (FRONTMATTER_MISSING)', () => {
    const p = writeTmp('name: create-prd\n---\n')
    expect(() => parseFrontmatter(p)).toThrowError(
      expect.objectContaining({ code: 'FRONTMATTER_MISSING' }),
    )
  })

  it('rejects unclosed frontmatter (FRONTMATTER_UNCLOSED)', () => {
    const p = writeTmp('---\nname: create-prd\ndescription: foo\n')
    expect(() => parseFrontmatter(p)).toThrowError(
      expect.objectContaining({ code: 'FRONTMATTER_UNCLOSED' }),
    )
  })

  it('rejects invalid YAML (FRONTMATTER_YAML_ERROR)', () => {
    const p = writeTmp('---\n: invalid: yaml: [\n---\n')
    expect(() => parseFrontmatter(p)).toThrowError(
      expect.objectContaining({ code: 'FRONTMATTER_YAML_ERROR' }),
    )
  })

  it('validates name is kebab-case — rejects "Create PRD" (FRONTMATTER_NAME_INVALID)', () => {
    const invalid = '---\nname: Create PRD\ndescription: desc\nphase: pre\norder: 1\noutputs:\n  - docs/prd.md\n---\n'
    const p = writeTmp(invalid)
    expect(() => parseFrontmatter(p)).toThrowError(
      expect.objectContaining({ code: 'FRONTMATTER_NAME_INVALID' }),
    )
  })

  it('requires outputs field to be present and non-empty', () => {
    const p = writeTmp('---\nname: create-prd\ndescription: desc\nphase: pre\norder: 1\n---\n')
    expect(() => parseFrontmatter(p)).toThrow()
  })
})

describe('parseAndValidate', () => {
  it('returns errors array empty on valid frontmatter', () => {
    const p = writeTmp(validFrontmatter)
    const result = parseAndValidate(p)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings.filter(w => w.code !== 'FRONTMATTER_UNKNOWN_FIELD')).toHaveLength(0)
  })

  it('returns body text after closing ---', () => {
    const p = writeTmp(validFrontmatter)
    const result = parseAndValidate(p)
    expect(result.body.trim()).toBe('This is the body.')
  })

  it('emits FRONTMATTER_UNKNOWN_FIELD warning for unknown fields', () => {
    const p = writeTmp(`---
name: create-prd
description: Create a product requirements document
phase: pre
order: 1
outputs:
  - docs/prd.md
unknown-field: some-value
---
`)
    const result = parseAndValidate(p)
    const unknownWarnings = result.warnings.filter(w => w.code === 'FRONTMATTER_UNKNOWN_FIELD')
    expect(unknownWarnings).toHaveLength(1)
    expect(unknownWarnings[0].context?.['field']).toBe('unknown-field')
  })

  it('converts knowledge-base YAML key to knowledgeBase TypeScript property', () => {
    const p = writeTmp(`---
name: create-prd
description: Create a product requirements document
phase: pre
order: 1
outputs:
  - docs/prd.md
knowledge-base:
  - prd-craft
  - architecture-guide
---
`)
    const result = parseAndValidate(p)
    expect(result.errors).toHaveLength(0)
    expect(result.frontmatter.knowledgeBase).toEqual(['prd-craft', 'architecture-guide'])
  })

  it('parses and returns reads field when present', () => {
    const p = writeTmp(`---
name: create-prd
description: Create a product requirements document
phase: pre
order: 1
outputs:
  - docs/prd.md
reads:
  - define-scope
  - create-goals
---
`)
    const result = parseAndValidate(p)
    expect(result.errors).toHaveLength(0)
    expect(result.frontmatter.reads).toEqual(['define-scope', 'create-goals'])
  })

  it('validates order field is present and in range 1-100', () => {
    const missingOrder = writeTmp(`---
name: create-prd
description: desc
phase: pre
outputs:
  - docs/prd.md
---
`)
    const res1 = parseAndValidate(missingOrder)
    expect(res1.errors.some(e => e.code === 'FIELD_MISSING')).toBe(true)

    const outOfRange = writeTmp(`---
name: create-prd
description: desc
phase: pre
order: 101
outputs:
  - docs/prd.md
---
`)
    const res2 = parseAndValidate(outOfRange)
    expect(res2.errors.length).toBeGreaterThan(0)
  })

  it('sets default empty arrays for dependencies, knowledgeBase, reads when absent', () => {
    const p = writeTmp(validFrontmatter.replace('knowledge-base:\n  - prd-craft\nreads: []\n', ''))
    const result = parseAndValidate(p)
    expect(result.frontmatter.dependencies).toEqual([])
    expect(result.frontmatter.knowledgeBase).toEqual([])
    expect(result.frontmatter.reads).toEqual([])
  })

  it('sets conditional to null when absent', () => {
    const p = writeTmp(validFrontmatter)
    const result = parseAndValidate(p)
    expect(result.frontmatter.conditional).toBeNull()
  })

  it('parses depends-on as alias for dependencies', () => {
    const p = writeTmp(`---
name: create-arch
description: Create architecture document
phase: architecture
order: 5
outputs:
  - docs/arch.md
depends-on:
  - create-prd
---
`)
    const result = parseAndValidate(p)
    expect(result.errors).toHaveLength(0)
    expect(result.frontmatter.dependencies).toEqual(['create-prd'])
  })

  it('returns errors array with FRONTMATTER_MISSING when no opening delimiter', () => {
    const p = writeTmp('name: create-prd\n---\n')
    const result = parseAndValidate(p)
    expect(result.errors.some(e => e.code === 'FRONTMATTER_MISSING')).toBe(true)
    expect(result.body).toBe('')
  })

  it('returns errors array with FRONTMATTER_UNCLOSED when no closing delimiter', () => {
    const p = writeTmp('---\nname: create-prd\n')
    const result = parseAndValidate(p)
    expect(result.errors.some(e => e.code === 'FRONTMATTER_UNCLOSED')).toBe(true)
    expect(result.body).toBe('')
  })

  it('accepts conditional: if-needed', () => {
    const p = writeTmp(`---
name: create-prd
description: desc
phase: pre
order: 1
outputs:
  - docs/prd.md
conditional: if-needed
---
`)
    const result = parseAndValidate(p)
    expect(result.errors).toHaveLength(0)
    expect(result.frontmatter.conditional).toBe('if-needed')
  })
})
