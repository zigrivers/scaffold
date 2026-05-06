import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { runProgress, runAudit } from './api.js'
import { ensureIdentity } from './identity.js'
import { writeEvent } from './ledger-writer.js'
import { harvestWorktree } from './harvester.js'

describe('api.runProgress', () => {
  let primary: string
  let wt: string
  beforeEach(async () => {
    primary = mkdtempSync(join(tmpdir(), 'observe-api-pri-'))
    wt = mkdtempSync(join(tmpdir(), 'observe-api-wt-'))
    execSync('git init -q', { cwd: primary })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: primary, shell: '/bin/sh' })
    ensureIdentity(wt, 'agent-alice')
    await writeEvent(wt, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wt })
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  })

  it('produces an EngineOutput with availability + snapshot + ledger summary', async () => {
    const out = await runProgress({
      primaryRoot: primary,
      sinceHours: 24,
      ghBin: '/no/such/gh',
      bdBin: '/no/such/bd',
    })
    expect(out.schema_version).toBe('1.0')
    expect(out.invocation.command).toBe('progress')
    expect(out.availability.git.status).toBe('available')
    expect(out.availability.ledger.events_read).toBe(1)
    expect(out.snapshot?.in_flight[0].task_id).toBe('T-1')
    expect(out.findings).toEqual([])
    expect(out.summary.total).toBe(0)
    expect(out.verdict).toBe('pass')
    expect(out.fix_threshold).toBe('P2')
  })
})

describe('api.runAudit', () => {
  let project: string
  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'observe-aud-'))
    execSync('git init -q', { cwd: project })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: project, shell: '/bin/sh' })
    mkdirSync(join(project, 'docs'), { recursive: true })
    writeFileSync(join(project, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync(join(project, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(project, 'docs/user-stories.md'),
      '## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n')
    writeFileSync(join(project, 'docs/tdd-standards.md'), '# TDD\n')
  })
  afterEach(() => { rmSync(project, { recursive: true, force: true }) })

  it('produces an audit EngineOutput with findings + verdict + summary', async () => {
    const out = await runAudit({
      primaryRoot: project, profile: 'fast', scope: 'all', sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    expect(out.invocation.command).toBe('audit')
    expect(out.findings.length).toBeGreaterThan(0)
    expect(out.verdict).toBe('blocked')
    expect(out.summary.total).toBe(out.findings.length)
    expect(out.summary.blocking).toBeGreaterThan(0)
  })

  it('honors --lens to scope a single-lens run', async () => {
    const out = await runAudit({
      primaryRoot: project, profile: 'fast', scope: 'all', sinceHours: 24,
      lensIds: ['H-cross-doc'], ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    expect(out.findings.every((f) => f.lens_id === 'H-cross-doc')).toBe(true)
  })

  it('respects --fix-threshold for verdict + summary.blocking', async () => {
    const tight = await runAudit({
      primaryRoot: project, profile: 'fast', scope: 'all', sinceHours: 24,
      fixThresholdOverride: 'P0', ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    const lax = await runAudit({
      primaryRoot: project, profile: 'fast', scope: 'all', sinceHours: 24,
      fixThresholdOverride: 'P3', ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    expect(tight.summary.blocking).toBeLessThanOrEqual(lax.summary.blocking)
  })
})

describe('api.runAudit (Plan 3 — eight lenses)', () => {
  let project: string
  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'observe-aud8-'))
    execSync('git init -q', { cwd: project })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: project, shell: '/bin/sh' })
    mkdirSync(join(project, 'docs'), { recursive: true })
    mkdirSync(join(project, 'src/lib'), { recursive: true })
    writeFileSync(join(project, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync(join(project, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(project, 'docs/user-stories.md'),
      '## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n')
    writeFileSync(join(project, 'docs/tech-stack.md'),
      '## Frontend\n\n### React\n\npackage_or_url: react@18\n')
    writeFileSync(join(project, 'docs/coding-standards.md'),
      '### Rule: no-eval\n- forbidden: eval\n- match: src/**/*.ts\n- severity: P1\n')
    writeFileSync(join(project, 'src/lib/x.ts'),
      'import { uniq } from \'lodash\'\neval(\'1+1\')\n')
  })
  afterEach(() => { rmSync(project, { recursive: true, force: true }) })

  it('--scope=code runs A/B/C/D/E/F/G but not H', async () => {
    const out = await runAudit({
      primaryRoot: project, profile: 'fast', scope: 'code', sinceHours: 24,
      ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    const lensIds = new Set(out.findings.map((f) => f.lens_id))
    expect(lensIds.has('H-cross-doc')).toBe(false)
    expect(lensIds.has('C-standards')).toBe(true)
    expect(lensIds.has('D-stack')).toBe(true)
    expect(lensIds.has('G-decisions')).toBe(true)
  })

  it('--scope=docs runs only H', async () => {
    const out = await runAudit({
      primaryRoot: project, profile: 'fast', scope: 'docs', sinceHours: 24,
      ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    const lensIds = new Set(out.findings.map((f) => f.lens_id))
    expect(lensIds.has('H-cross-doc')).toBe(true)
    for (const id of ['A-tdd', 'B-ac-coverage', 'C-standards', 'D-stack', 'E-design', 'F-scope', 'G-decisions']) {
      expect(lensIds.has(id)).toBe(false)
    }
  })
})

describe('api.runProgress (Plan 5 — replay + stall)', () => {
  let project: string, wt: string
  beforeEach(async () => {
    project = mkdtempSync(join(tmpdir(), 'observe-prog5-pri-'))
    wt = mkdtempSync(join(tmpdir(), 'observe-prog5-wt-'))
    execSync('git init -q', { cwd: project })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: project, shell: '/bin/sh' })
    ensureIdentity(wt, 'agent-alice')
    await writeEvent(wt, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await harvestWorktree({ primaryRoot: project, worktreeRoot: wt })
  })
  afterEach(() => {
    rmSync(project, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  })

  it('runProgress with replay=true populates EngineOutput.replay with the ledger event', async () => {
    const out = await runProgress({
      primaryRoot: project, sinceHours: 24, replay: true, ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    expect(out.replay).not.toBeNull()
    expect(out.replay!.events.length).toBeGreaterThanOrEqual(1)
    expect(out.replay!.events[0].source).toBe('ledger')
    expect(out.replay!.events[0].kind).toBe('task_claimed')
  })

  it('runProgress without replay leaves replay null', async () => {
    const out = await runProgress({ primaryRoot: project, sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    expect(out.replay).toBeNull()
  })

  it('runProgress with stall check populates needs_attention when stall conditions trip', async () => {
    const { readFileSync: readFS } = await import('node:fs')
    const identity = JSON.parse(readFS(join(wt, '.scaffold/identity.json'), 'utf8'))
    const archived = join(project, '.scaffold/activity-archive/active', identity.worktree_id + '.jsonl')
    writeFileSync(archived, JSON.stringify({
      event_id: 'ulid-old', worktree_id: 'wid', actor_label: 'agent-alice', branch: 'a',
      task_id: 'T-OLD', type: 'task_claimed',
      ts: new Date(Date.now() - 6 * 3_600_000).toISOString(),
      payload: { task_title: 'old' },
    }) + '\n', { flag: 'a' })
    const out = await runProgress({ primaryRoot: project, sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    const stale = out.needs_attention.find((n) => n.signal === 'task_stale' && n.ref.id === 'T-OLD')
    expect(stale).toBeDefined()
  })

  it('--no-stall-check leaves needs_attention empty', async () => {
    const out = await runProgress({
      primaryRoot: project, sinceHours: 24, noStallCheck: true, ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    expect(out.needs_attention).toEqual([])
  })
})
