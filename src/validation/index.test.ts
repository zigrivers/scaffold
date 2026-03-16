import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Integration-style tests using real tmp directories
// ---------------------------------------------------------------------------

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `scaffold-validation-test-${crypto.randomUUID()}`)
  fs.mkdirSync(d, { recursive: true })
  tmpDirs.push(d)
  return d
}

function makeProjectRoot(opts: {
  configContent?: string | null
  stateContent?: string | null
  pipelineFiles?: Array<{ name: string; content: string }>
} = {}): string {
  const root = makeTmpDir()
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })

  if (opts.configContent !== undefined && opts.configContent !== null) {
    fs.writeFileSync(path.join(root, '.scaffold', 'config.yml'), opts.configContent, 'utf8')
  }

  if (opts.stateContent !== undefined && opts.stateContent !== null) {
    fs.writeFileSync(path.join(root, '.scaffold', 'state.json'), opts.stateContent, 'utf8')
  }

  if (opts.pipelineFiles !== undefined && opts.pipelineFiles.length > 0) {
    fs.mkdirSync(path.join(root, 'pipeline'), { recursive: true })
    for (const f of opts.pipelineFiles) {
      fs.writeFileSync(path.join(root, 'pipeline', f.name), f.content, 'utf8')
    }
  }

  return root
}

const validConfig = `version: 2
methodology: mvp
platforms:
  - web
`

const validState = JSON.stringify({
  'schema-version': 1,
  'scaffold-version': '2.0.0',
  init_methodology: 'mvp',
  config_methodology: 'mvp',
  'init-mode': 'greenfield',
  created: '2024-01-01T00:00:00.000Z',
  in_progress: null,
  steps: {},
  next_eligible: [],
  'extra-steps': [],
})

const validFrontmatter = (name: string) => `---
name: ${name}
description: A test step
phase: modeling
order: 1
outputs:
  - output.md
---
# Body
`

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Import under test (after tmp setup helpers)
// ---------------------------------------------------------------------------

import { runValidation } from './index.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runValidation', () => {
  // Test 1: Returns no errors for valid config + pipeline
  it('returns no errors for valid config, state, and pipeline', () => {
    const root = makeProjectRoot({
      configContent: validConfig,
      stateContent: validState,
      pipelineFiles: [
        { name: 'my-step.md', content: validFrontmatter('my-step') },
      ],
    })

    const result = runValidation(root)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.validFilesCount).toBe(1)
    expect(result.totalFilesCount).toBe(1)
  })

  // Test 2: Returns errors when config.yml is missing
  it('returns errors when config.yml is missing', () => {
    const root = makeProjectRoot({
      // no configContent — no file written
      stateContent: validState,
    })

    const result = runValidation(root, ['config'])
    expect(result.errors.length).toBeGreaterThan(0)
    const codes = result.errors.map(e => e.code)
    expect(codes.some(c => c === 'CONFIG_MISSING')).toBe(true)
  })

  // Test 3: Returns errors for invalid frontmatter
  it('returns errors for invalid frontmatter', () => {
    const badFrontmatter = `---
name: INVALID NAME WITH SPACES
description: Bad step
phase: modeling
order: 1
outputs:
  - output.md
---
`
    const root = makeProjectRoot({
      configContent: validConfig,
      stateContent: validState,
      pipelineFiles: [
        { name: 'bad-step.md', content: badFrontmatter },
      ],
    })

    const result = runValidation(root, ['frontmatter'])
    expect(result.errors.length).toBeGreaterThan(0)
  })

  // Test 4: Returns errors for dependency cycles
  it('returns errors for dependency cycles', () => {
    // step-a depends on step-b, step-b depends on step-a = cycle
    const stepA = `---
name: step-a
description: Step A
phase: modeling
order: 1
dependencies:
  - step-b
outputs:
  - a.md
---
`
    const stepB = `---
name: step-b
description: Step B
phase: modeling
order: 2
dependencies:
  - step-a
outputs:
  - b.md
---
`
    const root = makeProjectRoot({
      configContent: validConfig,
      stateContent: validState,
      pipelineFiles: [
        { name: 'step-a.md', content: stepA },
        { name: 'step-b.md', content: stepB },
      ],
    })

    const result = runValidation(root, ['dependencies'])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.code === 'DEP_CYCLE_DETECTED')).toBe(true)
  })

  // Test 5: Accumulates all errors before returning (multiple files with errors)
  it('accumulates errors from multiple invalid frontmatter files', () => {
    const badA = `---
name: INVALID A
description: Bad
phase: modeling
order: 1
outputs:
  - out.md
---
`
    const badB = `---
name: INVALID B
description: Bad
phase: modeling
order: 2
outputs:
  - out.md
---
`
    const root = makeProjectRoot({
      configContent: validConfig,
      stateContent: validState,
      pipelineFiles: [
        { name: 'bad-a.md', content: badA },
        { name: 'bad-b.md', content: badB },
      ],
    })

    const result = runValidation(root, ['frontmatter'])
    // Should have errors from both files, not short-circuited after first
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })

  // Test 6: --scope config only runs config validation
  it('scope config only runs config validation', () => {
    // No pipeline dir, no state — should only check config
    const root = makeProjectRoot({
      configContent: validConfig,
      // no state
    })

    const result = runValidation(root, ['config'])
    expect(result.scopes).toEqual(['config'])
    // No state errors because state scope not included
    const stateCodes = result.errors.filter(e => e.code.startsWith('STATE_'))
    expect(stateCodes).toHaveLength(0)
  })

  // Test 7: --scope frontmatter only runs frontmatter validation
  it('scope frontmatter only runs frontmatter validation', () => {
    const root = makeProjectRoot({
      // no config — config errors should not appear
      pipelineFiles: [
        { name: 'my-step.md', content: validFrontmatter('my-step') },
      ],
    })

    const result = runValidation(root, ['frontmatter'])
    expect(result.scopes).toEqual(['frontmatter'])
    // No config errors
    const configCodes = result.errors.filter(e => e.code.startsWith('CONFIG_'))
    expect(configCodes).toHaveLength(0)
  })

  // Test 8: validFilesCount matches actual valid file count
  it('validFilesCount counts only valid files', () => {
    const goodStep = validFrontmatter('good-step')
    const badStep = `---
name: BAD STEP
description: Bad
phase: modeling
order: 1
outputs:
  - out.md
---
`
    const root = makeProjectRoot({
      configContent: validConfig,
      stateContent: validState,
      pipelineFiles: [
        { name: 'good-step.md', content: goodStep },
        { name: 'bad-step.md', content: badStep },
      ],
    })

    const result = runValidation(root, ['frontmatter'])
    expect(result.totalFilesCount).toBe(2)
    expect(result.validFilesCount).toBe(1)
  })
})
