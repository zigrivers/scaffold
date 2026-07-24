import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import {
  detectCompletion, checkCompletion, analyzeCrash, runDetect, verifyStep, applyConflictOverrides,
} from './completion.js'
import type { PipelineState, StepStateEntry } from '../types/index.js'

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

describe('verifyStep (D3)', () => {
  it('reports verified when all outputs exist and detect passes', () => {
    const dir = makeTempDir()
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'docs/tech-stack.md'), 'x', 'utf8')
    const entry = {
      status: 'completed', source: 'pipeline', produces: ['docs/tech-stack.md'], verification: 'declared',
    } as StepStateEntry
    const v = verifyStep('tech-stack', entry, ['docs/tech-stack.md'], { all: [{ cmd: 'exit 0' }] }, dir)
    expect(v.status).toBe('confirmed_complete')
    expect(v.verification).toBe('verified')
    expect(v.conflictClass).toBeNull()
  })

  it('reports a state-claim conflict when state says completed but outputs are missing', () => {
    const dir = makeTempDir()
    const entry = {
      status: 'completed', source: 'pipeline', produces: ['docs/x.md'], verification: 'declared',
    } as StepStateEntry
    const v = verifyStep('tdd', entry, ['docs/x.md'], null, dir)
    expect(v.status).toBe('conflict')
    expect(v.conflictClass).toBe('state-claim')
    expect(v.outputsMissing).toEqual(['docs/x.md'])
  })

  it('reports a state-claim conflict when outputs exist but detect fails', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'x', 'utf8')
    const entry = { status: 'completed', source: 'pipeline', produces: ['CLAUDE.md'] } as StepStateEntry
    const v = verifyStep('beads', entry, ['CLAUDE.md'], { all: [{ cmd: 'exit 1' }] }, dir)
    expect(v.status).toBe('conflict')
    expect(v.conflictClass).toBe('state-claim')
  })

  it('reports an artifact-only conflict for partial artifacts with no completion claim (the beads case)', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'x', 'utf8')
    const v = verifyStep('beads', undefined, ['.beads/', 'CLAUDE.md'], { all: [{ cmd: 'exit 1' }] }, dir)
    expect(v.status).toBe('conflict')
    expect(v.conflictClass).toBe('artifact-only')
    expect(v.outputsPresent).toEqual(['CLAUDE.md'])
  })

  it('never reports verified for an undetectable step (no outputs, no detect)', () => {
    const dir = makeTempDir()
    const entry = { status: 'completed', source: 'pipeline', produces: [], verification: 'verified' } as StepStateEntry
    const v = verifyStep('review-vision', entry, [], null, dir)
    expect(v.undetectable).toBe(true)
    expect(v.verification).toBe('declared')
    expect(v.status).toBe('confirmed_complete')
  })

  it('reports incomplete when nothing exists and there is no claim', () => {
    const dir = makeTempDir()
    const v = verifyStep('tech-stack', undefined, ['docs/tech-stack.md'], null, dir)
    expect(v.status).toBe('incomplete')
    expect(v.conflictClass).toBeNull()
    expect(v.verification).toBe('unverified')
  })
})

describe('applyConflictOverrides (D3 — fs-only eligibility demotion)', () => {
  it('demotes a completed step with missing outputs to pending without mutating the input', () => {
    const dir = makeTempDir()
    const steps: Record<string, StepStateEntry> = {
      beads: { status: 'completed', source: 'pipeline', produces: ['.beads/'] },
      tdd: { status: 'completed', source: 'pipeline', produces: [] },
    }
    const result = applyConflictOverrides(steps, dir)
    expect(result.conflicts).toEqual(['beads'])
    expect(result.steps['beads'].status).toBe('pending')
    expect(steps['beads'].status).toBe('completed')
    expect(result.steps['tdd'].status).toBe('completed')
  })

  it('returns the same steps object when nothing conflicts', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'x', 'utf8')
    const steps: Record<string, StepStateEntry> = {
      beads: { status: 'completed', source: 'pipeline', produces: ['CLAUDE.md'] },
    }
    const result = applyConflictOverrides(steps, dir)
    expect(result.conflicts).toEqual([])
    expect(result.steps).toBe(steps)
  })

  it('checks the CURRENT resolved outputs, not the historical produces (a package upgrade added an output)', () => {
    const dir = makeTempDir()
    // The step was completed when it only produced legacy.md (present on disk),
    // but the resolved pipeline now ALSO requires new.md (absent) — the step
    // must demote even though its stored produces is fully present.
    fs.writeFileSync(path.join(dir, 'legacy.md'), 'x', 'utf8')
    const steps: Record<string, StepStateEntry> = {
      'tech-stack': { status: 'completed', source: 'pipeline', produces: ['legacy.md'] },
    }
    const resolved = (slug: string): string[] | undefined =>
      slug === 'tech-stack' ? ['legacy.md', 'new.md'] : undefined
    const result = applyConflictOverrides(steps, dir, resolved)
    expect(result.conflicts).toEqual(['tech-stack'])
    expect(result.steps['tech-stack'].status).toBe('pending')
    // Without the resolver (historical produces only) the step would NOT demote.
    expect(applyConflictOverrides(steps, dir).conflicts).toEqual([])
  })
})
