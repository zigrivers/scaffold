/**
 * E2E tests for command-level logic modules — exercises validation, dependency
 * resolution, and config loading against real temporary directories.
 *
 * No mocking of the modules under test. Only file I/O is exercised via real
 * temp directories.
 */

import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { runValidation } from '../validation/index.js'
import { loadConfig } from '../config/loader.js'
import { discoverMetaPrompts } from '../core/assembly/meta-prompt-loader.js'
import { buildGraph } from '../core/dependency/graph.js'
import { computeEligible } from '../core/dependency/eligibility.js'
import { detectCycles } from '../core/dependency/dependency.js'
import type { StepStateEntry } from '../types/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpDirs: string[] = []

function makeTempDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-e2e-commands-'))
  tmpDirs.push(d)
  return d
}

function makeProjectRoot(opts: {
  configContent?: string
  stateContent?: string
  pipelineFiles?: Array<{ name: string; subdir?: string; content: string }>
} = {}): string {
  const root = makeTempDir()
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })

  if (opts.configContent !== undefined) {
    fs.writeFileSync(path.join(root, '.scaffold', 'config.yml'), opts.configContent, 'utf8')
  }
  if (opts.stateContent !== undefined) {
    fs.writeFileSync(path.join(root, '.scaffold', 'state.json'), opts.stateContent, 'utf8')
  }
  if (opts.pipelineFiles !== undefined && opts.pipelineFiles.length > 0) {
    for (const f of opts.pipelineFiles) {
      const dir = f.subdir
        ? path.join(root, 'pipeline', f.subdir)
        : path.join(root, 'pipeline')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, f.name), f.content, 'utf8')
    }
  }
  return root
}

const validConfig = `version: 2
methodology: mvp
platforms:
  - claude-code
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

function validFrontmatter(name: string, extras = ''): string {
  return `---
name: ${name}
description: A test step
phase: pre
order: 1
dependencies: []
outputs:
  - docs/${name}.md
---
# ${name}

Step body.
${extras}
`
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Validation E2E tests
// ---------------------------------------------------------------------------

describe('validation E2E', () => {
  // Test 1: runValidation passes for valid config + pipeline
  it('runValidation passes for valid config', () => {
    const root = makeProjectRoot({
      configContent: validConfig,
      stateContent: validState,
      pipelineFiles: [
        { name: 'my-step.md', content: validFrontmatter('my-step') },
      ],
    })

    const result = runValidation(root, ['config'])
    expect(result.errors).toHaveLength(0)
    expect(result.scopes).toEqual(['config'])
  })

  // Test 2: runValidation fails when methodology is missing
  it('runValidation fails for config missing methodology', () => {
    const badConfig = `version: 2
platforms:
  - claude-code
`
    const root = makeProjectRoot({ configContent: badConfig })

    const result = runValidation(root, ['config'])
    expect(result.errors.length).toBeGreaterThan(0)
    const codes = result.errors.map(e => e.code)
    expect(codes).toContain('FIELD_MISSING')
  })

  // Test 3: runValidation fails when config.yml is missing entirely
  it('runValidation fails when config.yml is absent', () => {
    const root = makeProjectRoot({ stateContent: validState })

    const result = runValidation(root, ['config'])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.code === 'CONFIG_MISSING')).toBe(true)
  })

  // Test 4: runValidation detects invalid frontmatter name
  it('runValidation detects invalid frontmatter names', () => {
    const badFrontmatter = `---
name: INVALID NAME WITH SPACES
description: Bad step
phase: pre
order: 1
dependencies: []
outputs:
  - out.md
---
`
    const root = makeProjectRoot({
      configContent: validConfig,
      stateContent: validState,
      pipelineFiles: [{ name: 'bad-step.md', content: badFrontmatter }],
    })

    const result = runValidation(root, ['frontmatter'])
    expect(result.errors.length).toBeGreaterThan(0)
  })

  // Test 5: runValidation detects dependency cycles
  it('runValidation detects dependency cycles', () => {
    const stepA = `---
name: step-a
description: Step A
phase: pre
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
phase: pre
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

  // Test 6: runValidation passes with valid state file
  it('runValidation passes for valid state', () => {
    const root = makeProjectRoot({
      configContent: validConfig,
      stateContent: validState,
    })

    const result = runValidation(root, ['state'])
    expect(result.errors).toHaveLength(0)
  })

  // Test 7: runValidation accumulates errors from multiple files
  it('runValidation accumulates errors from multiple invalid files', () => {
    const badA = `---
name: BAD A
description: Bad
phase: pre
order: 1
outputs:
  - out.md
---
`
    const badB = `---
name: BAD B
description: Bad
phase: pre
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
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })

  // Test 8: loadConfig returns correct config for valid config.yml
  it('loadConfig returns correct config object', () => {
    const root = makeProjectRoot({ configContent: validConfig })
    const { config, errors } = loadConfig(root, [])

    expect(errors).toHaveLength(0)
    expect(config).not.toBeNull()
    expect(config!.methodology).toBe('mvp')
    expect(config!.version).toBe(2)
    expect(config!.platforms).toContain('claude-code')
  })

  // Test 9: loadConfig returns error for missing file
  it('loadConfig returns error for missing config.yml', () => {
    const root = makeTempDir()
    fs.mkdirSync(path.join(root, '.scaffold'))
    const { config, errors } = loadConfig(root, [])

    expect(config).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.code === 'CONFIG_MISSING')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Dependency resolution E2E tests
// ---------------------------------------------------------------------------

describe('dependency resolution E2E', () => {
  // Test 10: buildGraph returns correct nodes from real meta-prompt files
  it('buildGraph returns nodes from discovered meta-prompts', () => {
    const root = makeProjectRoot({
      pipelineFiles: [
        { name: 'step-a.md', content: validFrontmatter('step-a') },
        {
          name: 'step-b.md', content: `---
name: step-b
description: Step B
phase: pre
order: 2
dependencies:
  - step-a
outputs:
  - docs/step-b.md
---
# step-b
`,
        },
      ],
    })

    const pipelineDir = path.join(root, 'pipeline')
    const metaPrompts = discoverMetaPrompts(pipelineDir)
    expect(metaPrompts.size).toBe(2)

    const graph = buildGraph(
      [...metaPrompts.values()].map(mp => mp.frontmatter),
      new Map(),
    )

    expect(graph.nodes.has('step-a')).toBe(true)
    expect(graph.nodes.has('step-b')).toBe(true)

    // step-b depends on step-a
    const stepBNode = graph.nodes.get('step-b')
    expect(stepBNode?.dependencies).toContain('step-a')
  })

  // Test 11: computeEligible returns steps with no unmet dependencies
  it('computeEligible returns steps with all dependencies satisfied', () => {
    const root = makeProjectRoot({
      pipelineFiles: [
        { name: 'step-a.md', content: validFrontmatter('step-a') },
        {
          name: 'step-b.md', content: `---
name: step-b
description: Step B
phase: pre
order: 2
dependencies:
  - step-a
outputs:
  - docs/step-b.md
---
# step-b
`,
        },
      ],
    })

    const pipelineDir = path.join(root, 'pipeline')
    const metaPrompts = discoverMetaPrompts(pipelineDir)
    const graph = buildGraph(
      [...metaPrompts.values()].map(mp => mp.frontmatter),
      new Map(),
    )

    // With both steps pending, only step-a (no deps) should be eligible
    const steps: Record<string, StepStateEntry> = {
      'step-a': { status: 'pending', source: 'pipeline', produces: [] },
      'step-b': { status: 'pending', source: 'pipeline', produces: [] },
    }
    const eligible = computeEligible(graph, steps)
    expect(eligible).toContain('step-a')
    expect(eligible).not.toContain('step-b')
  })

  // Test 12: computeEligible unlocks dependent step after prerequisite completes
  it('computeEligible unlocks dependent step when prerequisite completes', () => {
    const root = makeProjectRoot({
      pipelineFiles: [
        { name: 'step-a.md', content: validFrontmatter('step-a') },
        {
          name: 'step-b.md', content: `---
name: step-b
description: Step B
phase: pre
order: 2
dependencies:
  - step-a
outputs:
  - docs/step-b.md
---
# step-b
`,
        },
      ],
    })

    const pipelineDir = path.join(root, 'pipeline')
    const metaPrompts = discoverMetaPrompts(pipelineDir)
    const graph = buildGraph(
      [...metaPrompts.values()].map(mp => mp.frontmatter),
      new Map(),
    )

    // After step-a completes, step-b becomes eligible
    const steps: Record<string, StepStateEntry> = {
      'step-a': { status: 'completed', source: 'pipeline', produces: [] },
      'step-b': { status: 'pending', source: 'pipeline', produces: [] },
    }
    const eligible = computeEligible(graph, steps)
    expect(eligible).toContain('step-b')
    expect(eligible).not.toContain('step-a')
  })

  // Test 13: detectCycles returns no errors for acyclic graph
  it('detectCycles returns no errors for acyclic graph', () => {
    const root = makeProjectRoot({
      pipelineFiles: [
        { name: 'step-a.md', content: validFrontmatter('step-a') },
        {
          name: 'step-b.md', content: `---
name: step-b
description: Step B
phase: pre
order: 2
dependencies:
  - step-a
outputs:
  - docs/step-b.md
---
# step-b
`,
        },
      ],
    })

    const pipelineDir = path.join(root, 'pipeline')
    const metaPrompts = discoverMetaPrompts(pipelineDir)
    const graph = buildGraph(
      [...metaPrompts.values()].map(mp => mp.frontmatter),
      new Map(),
    )

    const cycles = detectCycles(graph)
    expect(cycles).toHaveLength(0)
  })

  // Test 14: detectCycles returns errors for a cycle
  it('detectCycles returns DEP_CYCLE_DETECTED for a cycle', () => {
    const root = makeProjectRoot({
      pipelineFiles: [
        {
          name: 'step-a.md', content: `---
name: step-a
description: Step A
phase: pre
order: 1
dependencies:
  - step-b
outputs:
  - a.md
---
`,
        },
        {
          name: 'step-b.md', content: `---
name: step-b
description: Step B
phase: pre
order: 2
dependencies:
  - step-a
outputs:
  - b.md
---
`,
        },
      ],
    })

    const pipelineDir = path.join(root, 'pipeline')
    const metaPrompts = discoverMetaPrompts(pipelineDir)
    const graph = buildGraph(
      [...metaPrompts.values()].map(mp => mp.frontmatter),
      new Map(),
    )

    const cycles = detectCycles(graph)
    expect(cycles.length).toBeGreaterThan(0)
    expect(cycles.some(e => e.code === 'DEP_CYCLE_DETECTED')).toBe(true)
  })

  // Test 15: discoverMetaPrompts loads real pipeline directory
  it('discoverMetaPrompts loads real pipeline files from sub-directories', () => {
    const root = makeProjectRoot({
      pipelineFiles: [
        { name: 'create-prd.md', subdir: 'pre', content: `---
name: create-prd
description: Create PRD
phase: pre
order: 1
dependencies: []
outputs:
  - docs/prd.md
---
# Create PRD
` },
        { name: 'arch.md', subdir: 'architecture', content: `---
name: arch
description: Architecture
phase: architecture
order: 10
dependencies:
  - create-prd
outputs:
  - docs/arch.md
---
# Architecture
` },
      ],
    })

    const pipelineDir = path.join(root, 'pipeline')
    const metaPrompts = discoverMetaPrompts(pipelineDir)

    expect(metaPrompts.size).toBe(2)
    expect(metaPrompts.has('create-prd')).toBe(true)
    expect(metaPrompts.has('arch')).toBe(true)

    const arch = metaPrompts.get('arch')
    expect(arch?.frontmatter.dependencies).toContain('create-prd')
  })

  // Test 16: computeEligible handles skipped dependency as satisfied
  it('computeEligible treats skipped dependency as satisfied', () => {
    const root = makeProjectRoot({
      pipelineFiles: [
        { name: 'step-a.md', content: validFrontmatter('step-a') },
        {
          name: 'step-b.md', content: `---
name: step-b
description: Step B
phase: pre
order: 2
dependencies:
  - step-a
outputs:
  - docs/step-b.md
---
# step-b
`,
        },
      ],
    })

    const pipelineDir = path.join(root, 'pipeline')
    const metaPrompts = discoverMetaPrompts(pipelineDir)
    const graph = buildGraph(
      [...metaPrompts.values()].map(mp => mp.frontmatter),
      new Map(),
    )

    // With step-a skipped, step-b should be eligible
    const steps: Record<string, StepStateEntry> = {
      'step-a': { status: 'skipped', source: 'pipeline', produces: [] },
      'step-b': { status: 'pending', source: 'pipeline', produces: [] },
    }
    const eligible = computeEligible(graph, steps)
    expect(eligible).toContain('step-b')
  })

  // Test 17: Real scaffold pipeline directory loads without errors
  it('real scaffold pipeline directory loads without errors', () => {
    const repoRoot = path.resolve(import.meta.url.replace('file://', ''), '../../../..')
    // The real pipeline dir in the repo
    const pipelineDir = path.join(repoRoot, 'pipeline')

    if (!fs.existsSync(pipelineDir)) {
      // Skip if running outside repo context
      return
    }

    const metaPrompts = discoverMetaPrompts(pipelineDir)
    // Should load at least a few prompts
    expect(metaPrompts.size).toBeGreaterThan(0)

    // Build graph — should not throw
    const graph = buildGraph(
      [...metaPrompts.values()].map(mp => mp.frontmatter),
      new Map(),
    )
    expect(graph.nodes.size).toBeGreaterThan(0)

    // No cycles in the real pipeline
    const cycles = detectCycles(graph)
    expect(cycles).toHaveLength(0)
  })

  // Test 18: buildGraph handles empty pipeline gracefully
  it('buildGraph handles empty pipeline without error', () => {
    const graph = buildGraph([], new Map())
    expect(graph.nodes.size).toBe(0)
    expect(graph.edges.size).toBe(0)
  })
})
