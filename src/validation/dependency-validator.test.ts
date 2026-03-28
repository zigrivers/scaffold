// src/validation/dependency-validator.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { validateDependencies } from './dependency-validator.js'

// ---------------------------------------------------------------------------
// Tmp directory management
// ---------------------------------------------------------------------------

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `scaffold-dep-test-${crypto.randomUUID()}`)
  fs.mkdirSync(d, { recursive: true })
  tmpDirs.push(d)
  return d
}

function makePipelineDir(files: Array<{ name: string; content: string }>): string {
  const dir = makeTmpDir()
  for (const f of files) {
    const filePath = path.join(dir, f.name)
    // Ensure subdirectories exist if name has slashes
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
// Frontmatter helpers
// ---------------------------------------------------------------------------

function validStep(name: string, order: number, deps: string[] = []): string {
  const depsYaml = deps.length > 0
    ? `dependencies:\n${deps.map(d => `  - ${d}`).join('\n')}`
    : ''
  return `---
name: ${name}
description: Test step ${name}
phase: modeling
order: ${order}
${depsYaml}
outputs:
  - ${name}.md
---
# ${name}
`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateDependencies', () => {
  // ---- Valid inputs ----

  describe('valid inputs', () => {
    it('returns no errors for a valid acyclic dependency graph', () => {
      const dir = makePipelineDir([
        { name: 'step-a.md', content: validStep('step-a', 1) },
        { name: 'step-b.md', content: validStep('step-b', 2, ['step-a']) },
        { name: 'step-c.md', content: validStep('step-c', 3, ['step-a', 'step-b']) },
      ])
      const result = validateDependencies(dir)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    it('returns no errors for steps with no dependencies', () => {
      const dir = makePipelineDir([
        { name: 'step-a.md', content: validStep('step-a', 1) },
        { name: 'step-b.md', content: validStep('step-b', 2) },
      ])
      const result = validateDependencies(dir)
      expect(result.errors).toHaveLength(0)
    })

    it('returns no errors for a single step', () => {
      const dir = makePipelineDir([
        { name: 'only-step.md', content: validStep('only-step', 1) },
      ])
      const result = validateDependencies(dir)
      expect(result.errors).toHaveLength(0)
    })
  })

  // ---- Cycle detection ----

  describe('cycle detection', () => {
    it('detects a simple two-node cycle (DEP_CYCLE_DETECTED)', () => {
      const dir = makePipelineDir([
        { name: 'step-a.md', content: validStep('step-a', 1, ['step-b']) },
        { name: 'step-b.md', content: validStep('step-b', 2, ['step-a']) },
      ])
      const result = validateDependencies(dir)
      const cycleError = result.errors.find(e => e.code === 'DEP_CYCLE_DETECTED')
      expect(cycleError).toBeDefined()
      expect(cycleError?.message).toContain('step-a')
      expect(cycleError?.message).toContain('step-b')
    })

    it('detects a three-node cycle', () => {
      const dir = makePipelineDir([
        { name: 'step-a.md', content: validStep('step-a', 1, ['step-c']) },
        { name: 'step-b.md', content: validStep('step-b', 2, ['step-a']) },
        { name: 'step-c.md', content: validStep('step-c', 3, ['step-b']) },
      ])
      const result = validateDependencies(dir)
      const cycleError = result.errors.find(e => e.code === 'DEP_CYCLE_DETECTED')
      expect(cycleError).toBeDefined()
    })
  })

  // ---- Self-reference detection ----

  describe('self-reference detection', () => {
    it('detects a step that depends on itself (DEP_SELF_REFERENCE)', () => {
      const dir = makePipelineDir([
        { name: 'step-a.md', content: validStep('step-a', 1, ['step-a']) },
      ])
      const result = validateDependencies(dir)
      const selfError = result.errors.find(e => e.code === 'DEP_SELF_REFERENCE')
      expect(selfError).toBeDefined()
      expect(selfError?.context?.step).toBe('step-a')
    })
  })

  // ---- Missing target detection ----

  describe('missing target detection', () => {
    it('detects dependency on a nonexistent step (DEP_TARGET_MISSING)', () => {
      const dir = makePipelineDir([
        { name: 'step-a.md', content: validStep('step-a', 1, ['nonexistent']) },
      ])
      const result = validateDependencies(dir)
      const missingError = result.errors.find(e => e.code === 'DEP_TARGET_MISSING')
      expect(missingError).toBeDefined()
      expect(missingError?.context?.dependency).toBe('nonexistent')
    })

    it('detects multiple missing targets', () => {
      const dir = makePipelineDir([
        { name: 'step-a.md', content: validStep('step-a', 1, ['ghost-one', 'ghost-two']) },
      ])
      const result = validateDependencies(dir)
      const missingErrors = result.errors.filter(e => e.code === 'DEP_TARGET_MISSING')
      expect(missingErrors).toHaveLength(2)
    })
  })

  // ---- Empty / missing pipeline directory ----

  describe('empty or missing pipeline directory', () => {
    it('returns no errors for an empty pipeline directory', () => {
      const dir = makePipelineDir([])
      const result = validateDependencies(dir)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    it('returns no errors when pipeline directory does not exist', () => {
      const result = validateDependencies('/nonexistent/path/that/does/not/exist')
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })
  })

  // ---- Files with invalid frontmatter are skipped ----

  describe('invalid frontmatter files', () => {
    it('skips files with invalid frontmatter and validates remaining', () => {
      const dir = makePipelineDir([
        { name: 'good-step.md', content: validStep('good-step', 1) },
        { name: 'bad-step.md', content: '---\nname: BAD NAME\n---\n# bad\n' },
      ])
      const result = validateDependencies(dir)
      // The bad file is skipped during discovery; good step has no dep issues
      expect(result.errors).toHaveLength(0)
    })
  })

  // ---- Mixed errors ----

  describe('mixed errors', () => {
    it('accumulates cycle and missing-target errors together', () => {
      // step-a → step-b → step-a (cycle) AND step-a → nonexistent (missing)
      const stepA = `---
name: step-a
description: Step A
phase: modeling
order: 1
dependencies:
  - step-b
  - nonexistent
outputs:
  - a.md
---
# A
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
# B
`
      const dir = makePipelineDir([
        { name: 'step-a.md', content: stepA },
        { name: 'step-b.md', content: stepB },
      ])
      const result = validateDependencies(dir)
      const codes = result.errors.map(e => e.code)
      expect(codes).toContain('DEP_CYCLE_DETECTED')
      expect(codes).toContain('DEP_TARGET_MISSING')
    })
  })

  // ---- Return type shape ----

  describe('return type', () => {
    it('always returns errors and warnings arrays', () => {
      const dir = makePipelineDir([])
      const result = validateDependencies(dir)
      expect(Array.isArray(result.errors)).toBe(true)
      expect(Array.isArray(result.warnings)).toBe(true)
    })
  })
})
