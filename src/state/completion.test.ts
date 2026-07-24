import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { detectCompletion, checkCompletion, analyzeCrash, runDetect } from './completion.js'
import type { PipelineState } from '../types/index.js'

const tmpDirs: string[] = []

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-comp-test-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

function makeBaseState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: new Date().toISOString(),
    in_progress: null,
    steps: {},
    next_eligible: [],
    'extra-steps': [],
    ...overrides,
  }
}

describe('detectCompletion', () => {
  it('returns complete=true when all artifacts present', () => {
    const dir = makeTempDir()
    const artifactPath = 'docs/prd.md'
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, artifactPath), 'content', 'utf8')

    const state = makeBaseState()
    const result = detectCompletion('create-prd', state, [artifactPath], dir)

    expect(result.complete).toBe(true)
    expect(result.artifactsPresent).toEqual([artifactPath])
    expect(result.artifactsMissing).toEqual([])
  })

  it('returns complete=false when artifacts missing', () => {
    const dir = makeTempDir()
    const state = makeBaseState()
    const result = detectCompletion('create-prd', state, ['docs/prd.md'], dir)

    expect(result.complete).toBe(false)
    expect(result.artifactsPresent).toEqual([])
    expect(result.artifactsMissing).toEqual(['docs/prd.md'])
  })

  it('treats zero-byte files as present', () => {
    const dir = makeTempDir()
    const artifactPath = 'docs/empty.md'
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, artifactPath), '', 'utf8')

    const state = makeBaseState()
    const result = detectCompletion('create-prd', state, [artifactPath], dir)

    expect(result.complete).toBe(true)
    expect(result.artifactsPresent).toEqual([artifactPath])
    expect(result.artifactsMissing).toEqual([])
  })

  it('returns lists of present and missing artifacts', () => {
    const dir = makeTempDir()
    const presentPath = 'docs/prd.md'
    const missingPath = 'docs/arch.md'
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, presentPath), 'content', 'utf8')

    const state = makeBaseState()
    const result = detectCompletion('create-prd', state, [presentPath, missingPath], dir)

    expect(result.complete).toBe(false)
    expect(result.artifactsPresent).toEqual([presentPath])
    expect(result.artifactsMissing).toEqual([missingPath])
  })
})

describe('checkCompletion', () => {
  it('returns confirmed_complete when state=completed AND artifacts present', () => {
    const dir = makeTempDir()
    const artifactPath = 'docs/prd.md'
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, artifactPath), 'content', 'utf8')

    const state = makeBaseState({
      steps: {
        'create-prd': {
          status: 'completed',
          source: 'pipeline',
          produces: [artifactPath],
        },
      },
    })

    const result = checkCompletion('create-prd', state, dir)
    expect(result.status).toBe('confirmed_complete')
    expect(result.presentArtifacts).toEqual([artifactPath])
    expect(result.missingArtifacts).toEqual([])
  })

  it('returns likely_complete when state!=completed BUT artifacts exist', () => {
    const dir = makeTempDir()
    const artifactPath = 'docs/prd.md'
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, artifactPath), 'content', 'utf8')

    const state = makeBaseState({
      steps: {
        'create-prd': {
          status: 'pending',
          source: 'pipeline',
          produces: [artifactPath],
        },
      },
    })

    const result = checkCompletion('create-prd', state, dir)
    expect(result.status).toBe('likely_complete')
    expect(result.presentArtifacts).toEqual([artifactPath])
    expect(result.missingArtifacts).toEqual([])
  })

  it('returns conflict when state=completed BUT artifacts missing', () => {
    const dir = makeTempDir()

    const state = makeBaseState({
      steps: {
        'create-prd': {
          status: 'completed',
          source: 'pipeline',
          produces: ['docs/prd.md'],
        },
      },
    })

    const result = checkCompletion('create-prd', state, dir)
    expect(result.status).toBe('conflict')
    expect(result.presentArtifacts).toEqual([])
    expect(result.missingArtifacts).toEqual(['docs/prd.md'])
  })

  it('returns incomplete when state!=completed AND artifacts missing', () => {
    const dir = makeTempDir()

    const state = makeBaseState({
      steps: {
        'create-prd': {
          status: 'pending',
          source: 'pipeline',
          produces: ['docs/prd.md'],
        },
      },
    })

    const result = checkCompletion('create-prd', state, dir)
    expect(result.status).toBe('incomplete')
    expect(result.presentArtifacts).toEqual([])
    expect(result.missingArtifacts).toEqual(['docs/prd.md'])
  })
})

describe('analyzeCrash', () => {
  it('returns auto_complete when all artifacts present after crash', () => {
    const dir = makeTempDir()
    const artifactPath = 'docs/prd.md'
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, artifactPath), 'content', 'utf8')

    const state = makeBaseState({
      in_progress: {
        step: 'create-prd',
        started: new Date().toISOString(),
        partial_artifacts: [],
        actor: 'agent-1',
      },
      steps: {
        'create-prd': {
          status: 'in_progress',
          source: 'pipeline',
          produces: [artifactPath],
        },
      },
    })

    const result = analyzeCrash(state, dir)
    expect(result.action).toBe('auto_complete')
    expect(result.presentArtifacts).toEqual([artifactPath])
    expect(result.missingArtifacts).toEqual([])
  })

  it('returns recommend_rerun when no artifacts present after crash', () => {
    const dir = makeTempDir()

    const state = makeBaseState({
      in_progress: {
        step: 'create-prd',
        started: new Date().toISOString(),
        partial_artifacts: [],
        actor: 'agent-1',
      },
      steps: {
        'create-prd': {
          status: 'in_progress',
          source: 'pipeline',
          produces: ['docs/prd.md'],
        },
      },
    })

    const result = analyzeCrash(state, dir)
    expect(result.action).toBe('recommend_rerun')
    expect(result.presentArtifacts).toEqual([])
    expect(result.missingArtifacts).toEqual(['docs/prd.md'])
  })

  it('returns ask_user when partial artifacts present after crash', () => {
    const dir = makeTempDir()
    const presentPath = 'docs/prd.md'
    const missingPath = 'docs/arch.md'
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, presentPath), 'content', 'utf8')

    const state = makeBaseState({
      in_progress: {
        step: 'create-prd',
        started: new Date().toISOString(),
        partial_artifacts: [],
        actor: 'agent-1',
      },
      steps: {
        'create-prd': {
          status: 'in_progress',
          source: 'pipeline',
          produces: [presentPath, missingPath],
        },
      },
    })

    const result = analyzeCrash(state, dir)
    expect(result.action).toBe('ask_user')
    expect(result.presentArtifacts).toEqual([presentPath])
    expect(result.missingArtifacts).toEqual([missingPath])
  })

  it('returns recommend_rerun when in_progress is null', () => {
    const dir = makeTempDir()

    const state = makeBaseState({
      in_progress: null,
      steps: {
        'create-prd': {
          status: 'pending',
          source: 'pipeline',
          produces: ['docs/prd.md'],
        },
      },
    })

    const result = analyzeCrash(state, dir)
    expect(result.action).toBe('recommend_rerun')
    expect(result.presentArtifacts).toEqual([])
    expect(result.missingArtifacts).toEqual([])
  })
})

describe('runDetect (D4)', () => {
  let root: string
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-run-')) })

  it('returns evaluated=false, passed=true when there is no detect block', () => {
    expect(runDetect(null, root)).toEqual({ evaluated: false, passed: true, checks: [] })
    expect(runDetect(undefined, root)).toEqual({ evaluated: false, passed: true, checks: [] })
  })

  it('passes an all-block when every path and cmd check passes', () => {
    fs.mkdirSync(path.join(root, '.beads'))
    const result = runDetect({ all: [{ path: '.beads/' }, { cmd: 'exit 0' }] }, root)
    expect(result.passed).toBe(true)
    expect(result.checks).toHaveLength(2)
  })

  it('fails an all-block when a cmd exits non-zero — failure is not fatal', () => {
    const result = runDetect({ all: [{ cmd: 'exit 3' }] }, root)
    expect(result.evaluated).toBe(true)
    expect(result.passed).toBe(false)
    expect(result.checks[0]).toEqual({ kind: 'cmd', target: 'exit 3', passed: false })
  })

  it('passes an any-block when at least one check passes', () => {
    fs.writeFileSync(path.join(root, 'playwright.config.ts'), '')
    const result = runDetect(
      { any: [{ path: 'playwright.config.ts' }, { path: 'maestro/' }] }, root,
    )
    expect(result.passed).toBe(true)
  })

  it('treats a timed-out cmd as not-detected', () => {
    const result = runDetect({ all: [{ cmd: 'sleep 30', timeout: 1 }] }, root)
    expect(result.passed).toBe(false)
  })

  it('treats a missing binary as not-detected', () => {
    const result = runDetect({ all: [{ cmd: 'definitely-not-a-real-binary-xyz' }] }, root)
    expect(result.passed).toBe(false)
  })
})
