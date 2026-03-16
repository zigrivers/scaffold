import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { gatherContext } from './context-gatherer.js'
import type { PipelineState, ScaffoldConfig, ExistingArtifact } from '../../types/index.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Helper to make a minimal PipelineState */
function makeState(
  steps: PipelineState['steps'] = {},
): PipelineState {
  return {
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z',
    in_progress: null,
    steps,
    next_eligible: [],
    'extra-steps': [],
  }
}

/** Helper to make a minimal ScaffoldConfig */
function makeConfig(): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
  }
}

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-gatherer-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('gatherContext', () => {
  it('gathers artifacts from completed steps in dependency chain', () => {
    // Create artifact file
    const outputPath = 'docs/prd.md'
    const fullPath = path.join(tmpDir, outputPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, '# PRD Content', 'utf8')

    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        produces: [outputPath],
      },
    })

    const { artifacts } = gatherContext({
      step: 'review-prd',
      state,
      config: makeConfig(),
      projectRoot: tmpDir,
      dependencyChain: ['create-prd'],
    })

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].stepName).toBe('create-prd')
    expect(artifacts[0].filePath).toBe(outputPath)
    expect(artifacts[0].content).toBe('# PRD Content')
  })

  it('skips artifact from step not completed', () => {
    const outputPath = 'docs/prd.md'
    const fullPath = path.join(tmpDir, outputPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, '# PRD Content', 'utf8')

    const state = makeState({
      'create-prd': {
        status: 'pending',
        source: 'pipeline',
        produces: [outputPath],
      },
    })

    const { artifacts } = gatherContext({
      step: 'review-prd',
      state,
      config: makeConfig(),
      projectRoot: tmpDir,
      dependencyChain: ['create-prd'],
    })

    expect(artifacts).toHaveLength(0)
  })

  it('handles missing artifact files gracefully (warns, continues)', () => {
    const outputPath = 'docs/missing.md'
    // File does NOT exist on disk

    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        produces: [outputPath],
      },
    })

    // Should not throw
    const { artifacts } = gatherContext({
      step: 'review-prd',
      state,
      config: makeConfig(),
      projectRoot: tmpDir,
      dependencyChain: ['create-prd'],
    })

    // File not found — artifact is skipped
    expect(artifacts).toHaveLength(0)
  })

  it('includes config in context', () => {
    const config = makeConfig()
    const state = makeState()

    const ctx = gatherContext({
      step: 'create-prd',
      state,
      config,
      projectRoot: tmpDir,
      dependencyChain: [],
    })

    expect(ctx.config).toBe(config)
    expect(ctx.config.methodology).toBe('deep')
  })

  it('includes state snapshot in context', () => {
    const state = makeState()
    const config = makeConfig()

    const ctx = gatherContext({
      step: 'create-prd',
      state,
      config,
      projectRoot: tmpDir,
      dependencyChain: [],
    })

    expect(ctx.state).toBe(state)
    expect(ctx.state['schema-version']).toBe(1)
  })

  it('includes formatted decision log summary', () => {
    // Write a decisions.jsonl file
    const scaffoldDir = path.join(tmpDir, '.scaffold')
    fs.mkdirSync(scaffoldDir, { recursive: true })
    const decisionsFile = path.join(scaffoldDir, 'decisions.jsonl')
    const entry = {
      id: 'D-001',
      prompt: 'create-prd',
      decision: 'Use REST API',
      at: '2024-01-01T00:00:00.000Z',
      completed_by: 'human',
      step_completed: true,
    }
    fs.writeFileSync(decisionsFile, JSON.stringify(entry) + '\n', 'utf8')

    const state = makeState({
      'create-prd': { status: 'completed', source: 'pipeline' },
    })

    const ctx = gatherContext({
      step: 'review-prd',
      state,
      config: makeConfig(),
      projectRoot: tmpDir,
      dependencyChain: ['create-prd'],
    })

    expect(ctx.decisions).toContain('D-001')
    expect(ctx.decisions).toContain('Use REST API')
    expect(ctx.decisions).toContain('create-prd')
  })

  it('includes existingOutput in update mode when provided', () => {
    const state = makeState()
    const config = makeConfig()
    const existingArtifact: ExistingArtifact = {
      filePath: 'docs/prd.md',
      content: '# Old PRD',
      previousDepth: 3,
      completionTimestamp: '2024-01-01T00:00:00.000Z',
    }

    const ctx = gatherContext({
      step: 'create-prd',
      state,
      config,
      projectRoot: tmpDir,
      dependencyChain: [],
      existingArtifact,
    })

    expect(ctx.existingOutput).toBeDefined()
    expect(ctx.existingOutput?.filePath).toBe('docs/prd.md')
    expect(ctx.existingOutput?.content).toBe('# Old PRD')
    expect(ctx.existingOutput?.previousDepth).toBe(3)
  })

  it('returns empty artifacts when dependency chain is empty', () => {
    const state = makeState()

    const ctx = gatherContext({
      step: 'create-prd',
      state,
      config: makeConfig(),
      projectRoot: tmpDir,
      dependencyChain: [],
    })

    expect(ctx.artifacts).toHaveLength(0)
  })

  it('gathers artifacts from multiple completed steps', () => {
    const files = [
      { step: 'step-a', outputPath: 'docs/a.md', content: '# A' },
      { step: 'step-b', outputPath: 'docs/b.md', content: '# B' },
    ]

    for (const { outputPath, content } of files) {
      const fullPath = path.join(tmpDir, outputPath)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content, 'utf8')
    }

    const state = makeState({
      'step-a': { status: 'completed', source: 'pipeline', produces: ['docs/a.md'] },
      'step-b': { status: 'completed', source: 'pipeline', produces: ['docs/b.md'] },
    })

    const { artifacts } = gatherContext({
      step: 'step-c',
      state,
      config: makeConfig(),
      projectRoot: tmpDir,
      dependencyChain: ['step-a', 'step-b'],
    })

    expect(artifacts).toHaveLength(2)
    expect(artifacts.map(a => a.stepName)).toContain('step-a')
    expect(artifacts.map(a => a.stepName)).toContain('step-b')
  })

  it('excludes decisions from steps not in dependency chain', () => {
    const scaffoldDir = path.join(tmpDir, '.scaffold')
    fs.mkdirSync(scaffoldDir, { recursive: true })
    const decisionsFile = path.join(scaffoldDir, 'decisions.jsonl')
    const relevant = {
      id: 'D-001',
      prompt: 'create-prd',
      decision: 'Use REST',
      at: '2024-01-01T00:00:00.000Z',
      completed_by: 'human',
      step_completed: true,
    }
    const irrelevant = {
      id: 'D-002',
      prompt: 'unrelated-step',
      decision: 'Use GraphQL',
      at: '2024-01-01T00:00:00.000Z',
      completed_by: 'human',
      step_completed: true,
    }
    fs.writeFileSync(
      decisionsFile,
      JSON.stringify(relevant) + '\n' + JSON.stringify(irrelevant) + '\n',
      'utf8',
    )

    const state = makeState({
      'create-prd': { status: 'completed', source: 'pipeline' },
    })

    const ctx = gatherContext({
      step: 'review-prd',
      state,
      config: makeConfig(),
      projectRoot: tmpDir,
      dependencyChain: ['create-prd'],
    })

    expect(ctx.decisions).toContain('D-001')
    expect(ctx.decisions).not.toContain('D-002')
    expect(ctx.decisions).not.toContain('GraphQL')
  })
})
