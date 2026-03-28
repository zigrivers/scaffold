// src/validation/frontmatter-validator.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { validateFrontmatter } from './frontmatter-validator.js'

// ---------------------------------------------------------------------------
// Tmp directory management
// ---------------------------------------------------------------------------

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `scaffold-fm-test-${crypto.randomUUID()}`)
  fs.mkdirSync(d, { recursive: true })
  tmpDirs.push(d)
  return d
}

function makePipelineDir(files: Array<{ name: string; content: string }>): string {
  const dir = makeTmpDir()
  for (const f of files) {
    const filePath = path.join(dir, f.name)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, f.content, 'utf8')
  }
  return dir
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Frontmatter content helpers
// ---------------------------------------------------------------------------

const validFm = (name: string, order = 1) => `---
name: ${name}
description: A test step
phase: modeling
order: ${order}
outputs:
  - ${name}.md
---
# ${name}
`

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateFrontmatter', () => {
  // ---- Valid inputs ----

  describe('valid inputs', () => {
    it('returns no errors for a single valid file', () => {
      const dir = makePipelineDir([
        { name: 'my-step.md', content: validFm('my-step') },
      ])
      const result = validateFrontmatter(dir)
      expect(result.errors).toHaveLength(0)
      expect(result.validFiles).toBe(1)
      expect(result.totalFiles).toBe(1)
    })

    it('returns no errors for multiple valid files', () => {
      const dir = makePipelineDir([
        { name: 'step-a.md', content: validFm('step-a', 1) },
        { name: 'step-b.md', content: validFm('step-b', 2) },
        { name: 'step-c.md', content: validFm('step-c', 3) },
      ])
      const result = validateFrontmatter(dir)
      expect(result.errors).toHaveLength(0)
      expect(result.validFiles).toBe(3)
      expect(result.totalFiles).toBe(3)
    })

    it('returns no errors for file with all optional fields', () => {
      const content = `---
name: full-step
description: A comprehensive step
phase: modeling
order: 5
dependencies:
  - step-a
outputs:
  - output.md
conditional: if-needed
knowledge-base:
  - domain-knowledge
reads:
  - step-a
---
# Full step
`
      const dir = makePipelineDir([
        { name: 'full-step.md', content },
      ])
      const result = validateFrontmatter(dir)
      expect(result.errors).toHaveLength(0)
      expect(result.validFiles).toBe(1)
    })
  })

  // ---- Name validation errors ----

  describe('name validation', () => {
    it('returns error for non-kebab-case name (spaces)', () => {
      const content = `---
name: INVALID NAME
description: Bad step
phase: modeling
order: 1
outputs:
  - out.md
---
`
      const dir = makePipelineDir([{ name: 'bad.md', content }])
      const result = validateFrontmatter(dir)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.validFiles).toBe(0)
      expect(result.totalFiles).toBe(1)
    })

    it('returns error for name starting with uppercase', () => {
      const content = `---
name: MyStep
description: Bad step
phase: modeling
order: 1
outputs:
  - out.md
---
`
      const dir = makePipelineDir([{ name: 'bad.md', content }])
      const result = validateFrontmatter(dir)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('returns error for name starting with a number', () => {
      const content = `---
name: 1-step
description: Bad step
phase: modeling
order: 1
outputs:
  - out.md
---
`
      const dir = makePipelineDir([{ name: 'bad.md', content }])
      const result = validateFrontmatter(dir)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  // ---- Missing required fields ----

  describe('missing required fields', () => {
    it('returns error when name is missing', () => {
      const content = `---
description: No name
phase: modeling
order: 1
outputs:
  - out.md
---
`
      const dir = makePipelineDir([{ name: 'no-name.md', content }])
      const result = validateFrontmatter(dir)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.validFiles).toBe(0)
    })

    it('returns error when description is missing', () => {
      const content = `---
name: no-desc
phase: modeling
order: 1
outputs:
  - out.md
---
`
      const dir = makePipelineDir([{ name: 'no-desc.md', content }])
      const result = validateFrontmatter(dir)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('returns error when phase is missing', () => {
      const content = `---
name: no-phase
description: Missing phase
order: 1
outputs:
  - out.md
---
`
      const dir = makePipelineDir([{ name: 'no-phase.md', content }])
      const result = validateFrontmatter(dir)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('returns error when order is missing', () => {
      const content = `---
name: no-order
description: Missing order
phase: modeling
outputs:
  - out.md
---
`
      const dir = makePipelineDir([{ name: 'no-order.md', content }])
      const result = validateFrontmatter(dir)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('returns error when outputs is missing', () => {
      const content = `---
name: no-outputs
description: Missing outputs
phase: modeling
order: 1
---
`
      const dir = makePipelineDir([{ name: 'no-outputs.md', content }])
      const result = validateFrontmatter(dir)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  // ---- Invalid phase ----

  describe('invalid phase', () => {
    it('returns error for unknown phase value', () => {
      const content = `---
name: bad-phase
description: Invalid phase
phase: unknown-phase
order: 1
outputs:
  - out.md
---
`
      const dir = makePipelineDir([{ name: 'bad-phase.md', content }])
      const result = validateFrontmatter(dir)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  // ---- Structural frontmatter issues ----

  describe('structural issues', () => {
    it('returns error when frontmatter delimiter is missing', () => {
      const content = `name: no-delimiter
description: No delimiter
phase: modeling
order: 1
outputs:
  - out.md
`
      const dir = makePipelineDir([{ name: 'no-delim.md', content }])
      const result = validateFrontmatter(dir)
      expect(result.errors.length).toBeGreaterThan(0)
      const hasMissing = result.errors.some(e => e.code === 'FRONTMATTER_MISSING')
      expect(hasMissing).toBe(true)
    })

    it('returns error when closing delimiter is missing', () => {
      const content = `---
name: unclosed
description: Unclosed
phase: modeling
order: 1
outputs:
  - out.md
`
      const dir = makePipelineDir([{ name: 'unclosed.md', content }])
      const result = validateFrontmatter(dir)
      expect(result.errors.length).toBeGreaterThan(0)
      const hasUnclosed = result.errors.some(e => e.code === 'FRONTMATTER_UNCLOSED')
      expect(hasUnclosed).toBe(true)
    })
  })

  // ---- Unknown fields produce warnings ----

  describe('unknown field warnings', () => {
    it('returns warnings for unknown frontmatter fields', () => {
      const content = `---
name: with-unknown
description: Has unknown field
phase: modeling
order: 1
outputs:
  - out.md
custom-field: some-value
---
# Body
`
      const dir = makePipelineDir([{ name: 'with-unknown.md', content }])
      const result = validateFrontmatter(dir)
      // The file itself should still be valid (unknown fields are warnings, not errors)
      const unknownWarning = result.warnings.find(w => w.code === 'FRONTMATTER_UNKNOWN_FIELD')
      expect(unknownWarning).toBeDefined()
    })
  })

  // ---- Accumulation across multiple files ----

  describe('accumulation', () => {
    it('accumulates errors from multiple invalid files', () => {
      const badA = `---
name: BAD A
description: Bad
phase: modeling
order: 1
outputs:
  - out.md
---
`
      const badB = `---
name: BAD B
description: Bad
phase: modeling
order: 2
outputs:
  - out.md
---
`
      const dir = makePipelineDir([
        { name: 'bad-a.md', content: badA },
        { name: 'bad-b.md', content: badB },
      ])
      const result = validateFrontmatter(dir)
      // Should have errors from both files
      expect(result.errors.length).toBeGreaterThanOrEqual(2)
      expect(result.validFiles).toBe(0)
      expect(result.totalFiles).toBe(2)
    })

    it('counts valid and invalid files correctly in mixed set', () => {
      const dir = makePipelineDir([
        { name: 'good.md', content: validFm('good-step') },
        { name: 'bad.md', content: '---\nname: BAD NAME\ndescription: Bad\n'
          + 'phase: modeling\norder: 1\noutputs:\n  - out.md\n---\n' },
      ])
      const result = validateFrontmatter(dir)
      expect(result.totalFiles).toBe(2)
      expect(result.validFiles).toBe(1)
    })
  })

  // ---- Recursive directory scanning ----

  describe('recursive directory scanning', () => {
    it('finds .md files in subdirectories', () => {
      const dir = makeTmpDir()
      const subDir = path.join(dir, 'phase-01')
      fs.mkdirSync(subDir, { recursive: true })
      fs.writeFileSync(path.join(subDir, 'nested-step.md'), validFm('nested-step'), 'utf8')

      const result = validateFrontmatter(dir)
      expect(result.totalFiles).toBe(1)
      expect(result.validFiles).toBe(1)
    })

    it('ignores non-.md files', () => {
      const dir = makePipelineDir([
        { name: 'step.md', content: validFm('step') },
        { name: 'readme.txt', content: 'not a pipeline file' },
        { name: 'data.json', content: '{}' },
      ])
      const result = validateFrontmatter(dir)
      expect(result.totalFiles).toBe(1) // Only the .md file
    })
  })

  // ---- Edge cases ----

  describe('edge cases', () => {
    it('returns zero counts for empty directory', () => {
      const dir = makePipelineDir([])
      const result = validateFrontmatter(dir)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
      expect(result.validFiles).toBe(0)
      expect(result.totalFiles).toBe(0)
    })

    it('returns zero counts for nonexistent directory', () => {
      const result = validateFrontmatter('/nonexistent/path/that/does/not/exist')
      expect(result.errors).toHaveLength(0)
      expect(result.validFiles).toBe(0)
      expect(result.totalFiles).toBe(0)
    })

    it('returns all four fields in the result object', () => {
      const dir = makePipelineDir([])
      const result = validateFrontmatter(dir)
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('warnings')
      expect(result).toHaveProperty('validFiles')
      expect(result).toHaveProperty('totalFiles')
    })
  })
})
