import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { loadMetaPrompt, discoverMetaPrompts } from './meta-prompt-loader.js'

const tmpDirs: string[] = []
const tmpFiles: string[] = []

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `scaffold-mpl-test-${crypto.randomUUID()}`)
  fs.mkdirSync(d, { recursive: true })
  tmpDirs.push(d)
  return d
}

function writeTmpFile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name)
  fs.writeFileSync(p, content, 'utf8')
  tmpFiles.push(p)
  return p
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
  tmpFiles.length = 0
})

const validMetaPromptContent = `---
name: create-prd
description: Create a product requirements document
phase: pre
order: 1
outputs:
  - docs/prd.md
knowledge-base:
  - prd-craft
---

## Purpose

Create a PRD from the project idea.

## Inputs

- Project idea description

## Expected Outputs

- docs/prd.md

## Quality Criteria

- PRD is complete and actionable

## Methodology Scaling

Depth 1: minimal PRD.
Depth 5: comprehensive PRD.
`

describe('loadMetaPrompt', () => {
  it('loads valid meta-prompt and returns MetaPromptFile', () => {
    const dir = makeTmpDir()
    const filePath = writeTmpFile(dir, 'create-prd.md', validMetaPromptContent)

    const result = loadMetaPrompt(filePath)

    expect(result.stepName).toBe('create-prd')
    expect(result.filePath).toBe(filePath)
    expect(result.frontmatter.name).toBe('create-prd')
    expect(result.frontmatter.description).toBe('Create a product requirements document')
    expect(result.frontmatter.phase).toBe('pre')
    expect(result.frontmatter.order).toBe(1)
    expect(result.frontmatter.outputs).toEqual(['docs/prd.md'])
    expect(result.frontmatter.knowledgeBase).toEqual(['prd-craft'])
    expect(result.body).toContain('## Purpose')
  })

  it('parses body sections by level-2 headings', () => {
    const dir = makeTmpDir()
    const filePath = writeTmpFile(dir, 'create-prd.md', validMetaPromptContent)

    const result = loadMetaPrompt(filePath)

    expect(Object.keys(result.sections)).toContain('Purpose')
    expect(Object.keys(result.sections)).toContain('Inputs')
    expect(Object.keys(result.sections)).toContain('Expected Outputs')
    expect(Object.keys(result.sections)).toContain('Quality Criteria')
    expect(Object.keys(result.sections)).toContain('Methodology Scaling')
  })

  it('returns sections map with heading → content', () => {
    const dir = makeTmpDir()
    const filePath = writeTmpFile(dir, 'create-prd.md', validMetaPromptContent)

    const result = loadMetaPrompt(filePath)

    expect(result.sections['Purpose']).toContain('Create a PRD from the project idea')
    expect(result.sections['Inputs']).toContain('Project idea description')
    expect(result.sections['Methodology Scaling']).toContain('Depth 1: minimal PRD')
    expect(result.sections['Methodology Scaling']).toContain('Depth 5: comprehensive PRD')
  })

  it('throws when file has invalid frontmatter', () => {
    const dir = makeTmpDir()
    const content = `---
name: INVALID NAME WITH SPACES
description: test
phase: pre
order: 1
outputs:
  - docs/prd.md
---

## Body
`
    const filePath = writeTmpFile(dir, 'bad-prompt.md', content)

    expect(() => loadMetaPrompt(filePath)).toThrow()
  })

  it('throws when file is missing', () => {
    expect(() => loadMetaPrompt('/nonexistent/path/file.md')).toThrow()
  })

  it('includes reads and conditional fields from frontmatter', () => {
    const dir = makeTmpDir()
    const content = `---
name: review-prd
description: Review the PRD for completeness
phase: pre
order: 2
outputs:
  - docs/prd-review.md
reads:
  - create-prd
conditional: if-needed
knowledge-base:
  - gap-analysis
---

## Purpose

Review the PRD.
`
    const filePath = writeTmpFile(dir, 'review-prd.md', content)

    const result = loadMetaPrompt(filePath)

    expect(result.frontmatter.reads).toEqual(['create-prd'])
    expect(result.frontmatter.conditional).toBe('if-needed')
    expect(result.frontmatter.knowledgeBase).toEqual(['gap-analysis'])
  })

  it('throws when frontmatter errors are present (missing required field)', () => {
    const dir = makeTmpDir()
    const content = `---
name: create-prd
description: Missing required fields like phase and order
outputs:
  - docs/prd.md
---

## Body
`
    const filePath = writeTmpFile(dir, 'create-prd.md', content)

    expect(() => loadMetaPrompt(filePath)).toThrow()
  })
})

describe('discoverMetaPrompts', () => {
  it('scans directory and returns map of step slug to MetaPromptFile', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'create-prd.md', validMetaPromptContent)

    const secondContent = `---
name: review-prd
description: Review the product requirements document
phase: pre
order: 2
outputs:
  - docs/prd-review.md
---

## Purpose

Review the PRD.
`
    writeTmpFile(dir, 'review-prd.md', secondContent)

    const result = discoverMetaPrompts(dir)

    expect(result.size).toBe(2)
    expect(result.has('create-prd')).toBe(true)
    expect(result.has('review-prd')).toBe(true)
    expect(result.get('create-prd')?.frontmatter.name).toBe('create-prd')
    expect(result.get('review-prd')?.frontmatter.name).toBe('review-prd')
  })

  it('returns empty map for empty directory', () => {
    const dir = makeTmpDir()
    const result = discoverMetaPrompts(dir)
    expect(result.size).toBe(0)
  })

  it('skips files with invalid frontmatter (warns, continues)', () => {
    const dir = makeTmpDir()
    // Valid file
    writeTmpFile(dir, 'create-prd.md', validMetaPromptContent)
    // Invalid file (missing required fields)
    writeTmpFile(dir, 'broken.md', 'Not valid frontmatter at all')

    const result = discoverMetaPrompts(dir)

    // Should still have the valid one
    expect(result.has('create-prd')).toBe(true)
    // Broken file should be skipped
    expect(result.size).toBe(1)
  })

  it('scans subdirectories recursively', () => {
    const dir = makeTmpDir()
    const subDir = path.join(dir, 'sub')
    fs.mkdirSync(subDir)

    writeTmpFile(dir, 'create-prd.md', validMetaPromptContent)

    const nestedContent = `---
name: user-stories
description: Create user stories
phase: modeling
order: 5
outputs:
  - docs/user-stories.md
---

## Purpose

Create user stories.
`
    writeTmpFile(subDir, 'user-stories.md', nestedContent)

    const result = discoverMetaPrompts(dir)

    expect(result.size).toBe(2)
    expect(result.has('create-prd')).toBe(true)
    expect(result.has('user-stories')).toBe(true)
  })

  it('ignores non-.md files', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'create-prd.md', validMetaPromptContent)
    writeTmpFile(dir, 'readme.txt', 'This is a readme')
    writeTmpFile(dir, 'config.yml', 'name: test')

    const result = discoverMetaPrompts(dir)

    expect(result.size).toBe(1)
  })
})
