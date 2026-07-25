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

  it('a satisfying mapped incumbent yields confirmed_complete with CONSISTENT evidence', () => {
    // When a mapped file satisfies the check, missingArtifacts must be cleared
    // and the mapped file reflected in presentArtifacts — no confirmed_complete
    // with a still-populated missingArtifacts (contradictory evidence).
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), '# house rules\n')
    const state = makeBaseState({
      steps: {
        'coding-standards': { status: 'completed', source: 'pipeline', produces: ['docs/coding-standards.md'] },
      },
    })
    const result = checkCompletion('coding-standards', state, dir, { 'coding-standards': 'CONTRIBUTING.md' })
    expect(result.status).toBe('confirmed_complete')
    expect(result.missingArtifacts).toEqual([])
    expect(result.presentArtifacts).toContain('CONTRIBUTING.md')
  })

  it('a mapped incumbent that is a DIRECTORY does not satisfy checkCompletion', () => {
    const dir = makeTempDir()
    fs.mkdirSync(path.join(dir, 'CONTRIBUTING.md'))
    const state = makeBaseState({
      steps: {
        'coding-standards': { status: 'completed', source: 'pipeline', produces: ['docs/coding-standards.md'] },
      },
    })
    const result = checkCompletion('coding-standards', state, dir, { 'coding-standards': 'CONTRIBUTING.md' })
    expect(result.status).toBe('conflict')
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

describe('artifact_map integration (D10a)', () => {
  it('detectCompletion accepts an existing mapped incumbent in place of outputs', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), '# Contributing\n')
    const state = makeBaseState()
    const result = detectCompletion(
      'coding-standards', state, ['docs/coding-standards.md'], dir, undefined,
      { 'coding-standards': 'CONTRIBUTING.md' },
    )
    expect(result.complete).toBe(true)
    expect(result.mappedArtifactUsed).toBe('CONTRIBUTING.md')
    expect(result.artifactsMissing).toHaveLength(0)
  })

  it('a stale mapping (mapped file missing) falls back to the normal all-outputs check', () => {
    const dir = makeTempDir()
    const state = makeBaseState()
    const result = detectCompletion(
      'coding-standards', state, ['docs/coding-standards.md'], dir, undefined,
      { 'coding-standards': 'CONTRIBUTING.md' },
    )
    expect(result.complete).toBe(false)
    expect(result.mappedArtifactUsed).toBeUndefined()
    expect(result.artifactsMissing).toEqual(['docs/coding-standards.md'])
  })

  it('own outputs win over the mapped incumbent when both are present (own-output-first invariant)', () => {
    const dir = makeTempDir()
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'docs/coding-standards.md'), '# Own doc\n')
    fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), '# Incumbent\n')
    const state = makeBaseState()
    const result = detectCompletion(
      'coding-standards', state, ['docs/coding-standards.md'], dir, undefined,
      { 'coding-standards': 'CONTRIBUTING.md' },
    )
    expect(result.complete).toBe(true)
    expect(result.artifactsPresent).toEqual(['docs/coding-standards.md'])
    expect(result.mappedArtifactUsed).toBeUndefined()
  })

  it('a mapped incumbent that is a DIRECTORY does not satisfy the check (must be a file)', () => {
    // A doc mapping must point at a file; a directory at the mapped path must
    // not mark the step complete (matches resolveAssemblyMode's .isFile() gate).
    const dir = makeTempDir()
    fs.mkdirSync(path.join(dir, 'CONTRIBUTING.md')) // a DIRECTORY named like a doc
    const state = makeBaseState()
    const result = detectCompletion(
      'coding-standards', state, ['docs/coding-standards.md'], dir, undefined,
      { 'coding-standards': 'CONTRIBUTING.md' },
    )
    expect(result.complete).toBe(false)
    expect(result.mappedArtifactUsed).toBeUndefined()
  })

  it('a mapping that escapes the project root is ignored', () => {
    const dir = makeTempDir()
    const state = makeBaseState()
    const result = detectCompletion(
      'coding-standards', state, ['docs/coding-standards.md'], dir, undefined,
      { 'coding-standards': '../outside.md' },
    )
    expect(result.complete).toBe(false)
    expect(result.mappedArtifactUsed).toBeUndefined()
  })

  // MMR round-2 (PR #786) finding: detectCompletion's mapped-incumbent
  // fallback was not service-gated, mirroring the bug fixed in
  // applyConflictOverrides (which gates on `!isServiceLocal`). detectCompletion
  // has no live production callers today, but this closes the gap so a future
  // caller cannot reintroduce a false-completion for a service-local step.
  describe('service scope (mirrors applyConflictOverrides)', () => {
    it('a ROOT artifact_map entry does NOT satisfy a service-local detectCompletion check', () => {
      const dir = makeTempDir()
      fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), '# house rules', 'utf8')
      const state = makeBaseState()
      const result = detectCompletion(
        'coding-standards', state, ['docs/coding-standards.md'], dir, 'api',
        { 'coding-standards': 'CONTRIBUTING.md' },
      )
      expect(result.complete).toBe(false)
      expect(result.mappedArtifactUsed).toBeUndefined()
    })

    it('a ROOT artifact_map entry DOES satisfy detectCompletion for a global step even in service scope', () => {
      const dir = makeTempDir()
      fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), '# house rules', 'utf8')
      const state = makeBaseState()
      const result = detectCompletion(
        'coding-standards', state, ['docs/coding-standards.md'], dir, 'api',
        { 'coding-standards': 'CONTRIBUTING.md' }, new Set(['coding-standards']),
      )
      expect(result.complete).toBe(true)
      expect(result.mappedArtifactUsed).toBe('CONTRIBUTING.md')
    })
  })

  it('checkCompletion reports confirmed_complete for completed + mapped incumbent present', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), '# Contributing\n')
    const state = makeBaseState({
      steps: {
        'coding-standards': {
          status: 'completed', source: 'pipeline',
          produces: ['docs/coding-standards.md'],
        },
      },
    })
    const result = checkCompletion('coding-standards', state, dir,
      { 'coding-standards': 'CONTRIBUTING.md' })
    expect(result.status).toBe('confirmed_complete')
  })

  it('verifyStep (the plan/doctor path) accepts a mapped incumbent — detect still gates', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), '# Contributing\n')
    const entry = {
      status: 'completed', source: 'pipeline', produces: ['docs/coding-standards.md'],
      verification: 'declared',
    } as StepStateEntry
    // Mapped incumbent present + detect passes → verified/done.
    const ok = verifyStep(
      'coding-standards', entry, ['docs/coding-standards.md'], { all: [{ cmd: 'exit 0' }] }, dir,
      { 'coding-standards': 'CONTRIBUTING.md' },
    )
    expect(ok.verification).toBe('verified')
    expect(ok.status).toBe('confirmed_complete')
    // Without the map the produced output is still missing → conflict.
    const missing = verifyStep(
      'coding-standards', entry, ['docs/coding-standards.md'], { all: [{ cmd: 'exit 0' }] }, dir,
    )
    expect(missing.status).toBe('conflict')
    // Mapping never bypasses detect: mapped present but detect fails → not verified.
    const detectFails = verifyStep(
      'coding-standards', entry, ['docs/coding-standards.md'], { all: [{ cmd: 'exit 1' }] }, dir,
      { 'coding-standards': 'CONTRIBUTING.md' },
    )
    expect(detectFails.verification).not.toBe('verified')
    expect(detectFails.status).toBe('conflict')
  })

  it('a mapped incumbent that is a DIRECTORY does not satisfy verifyStep (must be a file)', () => {
    const dir = makeTempDir()
    fs.mkdirSync(path.join(dir, 'CONTRIBUTING.md')) // a DIRECTORY, not a doc file
    const entry = {
      status: 'completed', source: 'pipeline', produces: ['docs/coding-standards.md'],
      verification: 'declared',
    } as StepStateEntry
    const v = verifyStep(
      'coding-standards', entry, ['docs/coding-standards.md'], null, dir,
      { 'coding-standards': 'CONTRIBUTING.md' },
    )
    // Directory doesn't satisfy the doc mapping → own output still missing → conflict.
    expect(v.status).toBe('conflict')
    expect(v.verification).not.toBe('verified')
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

  it('a completed mapped step whose original output is absent stays done, not conflict (D10a)', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), 'x', 'utf8')
    const steps: Record<string, StepStateEntry> = {
      'coding-standards': { status: 'completed', source: 'pipeline', produces: ['docs/coding-standards.md'] },
    }
    const result = applyConflictOverrides(
      steps, dir, undefined, undefined, undefined, { 'coding-standards': 'CONTRIBUTING.md' },
    )
    expect(result.conflicts).toEqual([])
    expect(result.steps['coding-standards'].status).toBe('completed')
    // Without the map, the same step demotes to pending as before.
    expect(applyConflictOverrides(steps, dir).conflicts).toEqual(['coding-standards'])
  })

  describe('service scope (mirrors detectCompletion)', () => {
    it('does NOT demote a service-local completed step whose output exists only under services/<svc>/', () => {
      const dir = makeTempDir()
      fs.mkdirSync(path.join(dir, 'services', 'api', 'docs'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'services', 'api', 'docs', 'tech-stack.md'), 'x', 'utf8')
      const steps: Record<string, StepStateEntry> = {
        'tech-stack': { status: 'completed', source: 'pipeline', produces: ['docs/tech-stack.md'] },
      }
      const result = applyConflictOverrides(steps, dir, undefined, 'api', new Set())
      expect(result.conflicts).toEqual([])
      expect(result.steps).toBe(steps)
    })

    it('DOES demote a service-local step whose service file is missing, even with a same-named root file', () => {
      // The exact false-complete scenario: the api service's own file was
      // deleted, but an unrelated root-level (or other-service) file with the
      // same relative name happens to exist. Without service scoping this
      // would incorrectly satisfy the check and report a broken step as
      // COMPLETE — the dishonesty D3/R1 removes.
      const dir = makeTempDir()
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'docs', 'tech-stack.md'), 'root file, not the service file', 'utf8')
      const steps: Record<string, StepStateEntry> = {
        'tech-stack': { status: 'completed', source: 'pipeline', produces: ['docs/tech-stack.md'] },
      }
      const result = applyConflictOverrides(steps, dir, undefined, 'api', new Set())
      expect(result.conflicts).toEqual(['tech-stack'])
      expect(result.steps['tech-stack'].status).toBe('pending')
    })

    it('checks global steps at the root (unprefixed) even in service scope', () => {
      const dir = makeTempDir()
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'x', 'utf8')
      const steps: Record<string, StepStateEntry> = {
        beads: { status: 'completed', source: 'pipeline', produces: ['CLAUDE.md'] },
      }
      const result = applyConflictOverrides(steps, dir, undefined, 'api', new Set(['beads']))
      expect(result.conflicts).toEqual([])
      expect(result.steps).toBe(steps)
    })

    it('is unaffected when service is omitted (root/flat projects behave exactly as before)', () => {
      const dir = makeTempDir()
      fs.mkdirSync(path.join(dir, 'services', 'api', 'docs'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'services', 'api', 'docs', 'tech-stack.md'), 'x', 'utf8')
      const steps: Record<string, StepStateEntry> = {
        'tech-stack': { status: 'completed', source: 'pipeline', produces: ['docs/tech-stack.md'] },
      }
      // No service arg — checked at the (unprefixed) root, which is absent, so it demotes.
      const result = applyConflictOverrides(steps, dir)
      expect(result.conflicts).toEqual(['tech-stack'])
    })

    it('a ROOT artifact_map entry does NOT mask a service-local missing artifact (mapping is root-only)', () => {
      // Multi-service project: the api service's own coding-standards doc is
      // missing, but a root-level CONTRIBUTING.md is mapped via artifact_map.
      // R3's artifact_map is root-scoped — it must NOT satisfy a --service check,
      // or `scaffold status --service api` would report a false completion.
      const dir = makeTempDir()
      fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), '# house rules', 'utf8')
      const steps: Record<string, StepStateEntry> = {
        'coding-standards': { status: 'completed', source: 'pipeline', produces: ['docs/coding-standards.md'] },
      }
      const artifactMap = { 'coding-standards': 'CONTRIBUTING.md' }
      // service scope: the root mapping is ignored → still a conflict.
      const svc = applyConflictOverrides(steps, dir, undefined, 'api', new Set(), artifactMap)
      expect(svc.conflicts).toEqual(['coding-standards'])
      expect(svc.steps['coding-standards'].status).toBe('pending')
      // root scope (service omitted): the mapping DOES satisfy → no conflict.
      const root = applyConflictOverrides(steps, dir, undefined, undefined, undefined, artifactMap)
      expect(root.conflicts).toEqual([])
    })
  })
})
