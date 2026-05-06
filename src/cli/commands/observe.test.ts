import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { handleEvent, handleProgress, handleHarvest, handleAudit, handleAck } from './observe.js'
import { ensureIdentity } from '../../observability/engine/identity.js'
import { writeEvent } from '../../observability/engine/ledger-writer.js'
import { harvestWorktree } from '../../observability/engine/harvester.js'

describe('observe event subcommand', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-cli-'))
    ensureIdentity(dir, 'agent-alice')
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('writes a task_claimed event from CLI args', async () => {
    const exitCode = await handleEvent({
      cwd: dir,
      type: 'task_claimed',
      branch: 'feat',
      taskId: 'T-001',
      keyValues: { 'task-title': 'Hello world', 'wave': 'wave-2' },
    })
    expect(exitCode).toBe(0)
    const path = join(dir, '.scaffold/activity.jsonl')
    expect(existsSync(path)).toBe(true)
    const obj = JSON.parse(readFileSync(path, 'utf8').trim()) as Record<string, unknown>
    expect(obj.task_id).toBe('T-001')
    expect((obj.payload as Record<string, unknown>).task_title).toBe('Hello world')
    expect((obj.payload as Record<string, unknown>).wave).toBe('wave-2')
  })

  it('exits with code 2 on schema-invalid input (missing payload field)', async () => {
    const exitCode = await handleEvent({
      cwd: dir,
      type: 'task_claimed',
      branch: 'feat',
      taskId: 'T-001',
      keyValues: {},
    })
    expect(exitCode).toBe(2)
  })

  it('coerces pr-number to a number for pr_opened events', async () => {
    const exitCode = await handleEvent({
      cwd: dir,
      type: 'pr_opened',
      branch: 'feat',
      taskId: 'T-001',
      keyValues: { 'pr-number': '42' },
    })
    expect(exitCode).toBe(0)
    const raw = readFileSync(join(dir, '.scaffold/activity.jsonl'), 'utf8').trim()
    const obj = JSON.parse(raw) as Record<string, unknown>
    expect((obj.payload as Record<string, unknown>).pr_number).toBe(42)
  })
})

describe('observe progress subcommand', () => {
  let primary: string
  let wt: string
  beforeEach(async () => {
    primary = mkdtempSync(join(tmpdir(), 'observe-progress-pri-'))
    wt = mkdtempSync(join(tmpdir(), 'observe-progress-wt-'))
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

  it('--json prints the EngineOutput JSON to stdout and exits 0', async () => {
    let captured = ''
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (s: string | Uint8Array) => { captured += String(s); return true }
    try {
      const code = await handleProgress({
        cwd: primary,
        json: true,
        sinceHours: 24,
        ghBin: '/no/such/gh',
        bdBin: '/no/such/bd',
      })
      expect(code).toBe(0)
    } finally {
      process.stdout.write = origWrite
    }
    const obj = JSON.parse(captured) as Record<string, unknown>
    expect(obj.schema_version).toBe('1.0')
    expect((obj.snapshot as Record<string, unknown[]>).in_flight[0]).toMatchObject({ task_id: 'T-1' })
  })
})

describe('observe harvest subcommand', () => {
  let primary: string
  let wt: string
  beforeEach(async () => {
    primary = mkdtempSync(join(tmpdir(), 'observe-h-pri-'))
    wt = mkdtempSync(join(tmpdir(), 'observe-h-wt-'))
    ensureIdentity(wt, 'agent-alice')
    await writeEvent(wt, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  })

  it('flushes a worktree ledger to the central archive', async () => {
    const code = await handleHarvest({ primaryRoot: primary, worktreeRoot: wt })
    expect(code).toBe(0)
    const id = JSON.parse(readFileSync(join(wt, '.scaffold/identity.json'), 'utf8')) as { worktree_id: string }
    const archived = join(primary, '.scaffold/activity-archive/active', `${id.worktree_id}.jsonl`)
    expect(existsSync(archived)).toBe(true)
  })

  it('returns 3 when worktree has no identity.json', async () => {
    const noid = mkdtempSync(join(tmpdir(), 'observe-noid-'))
    try {
      const code = await handleHarvest({ primaryRoot: primary, worktreeRoot: noid })
      expect(code).toBe(3)
    } finally {
      rmSync(noid, { recursive: true, force: true })
    }
  })
})

describe('observe audit subcommand', () => {
  let proj: string
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'observe-aud-cli-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync(join(proj, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(proj, 'docs/user-stories.md'),
      '## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n')
    writeFileSync(join(proj, 'docs/tdd-standards.md'), '# TDD\n')
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('--json prints EngineOutput and exits 1 when verdict=blocked', async () => {
    let captured = ''
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((s: string | Uint8Array) => { captured += String(s); return true }) as never
    try {
      const code = await handleAudit({
        cwd: proj, json: true, profile: 'fast', scope: 'all', sinceHours: 24,
        ghBin: '/no/such/gh', bdBin: '/no/such/bd',
      })
      expect(code).toBe(1)
    } finally {
      process.stdout.write = origWrite
    }
    const obj = JSON.parse(captured) as Record<string, unknown>
    expect(obj.verdict).toBe('blocked')
    expect((obj.findings as unknown[]).length).toBeGreaterThan(0)
  })

  it('exits 0 or 1 based on verdict after adding plan task', async () => {
    writeFileSync(join(proj, 'docs/implementation-plan.md'),
      '## Task T-001: t [story: s-1] [status: done]\n')
    const code = await handleAudit({
      cwd: proj, json: true, profile: 'fast', scope: 'all', sinceHours: 24,
      ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    expect([0, 1]).toContain(code)
  })
})

describe('observe ack subcommand', () => {
  let proj: string
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'observe-ack-cli-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    ensureIdentity(proj, 'primary')
    mkdirSync(join(proj, 'docs/audits'), { recursive: true })
    writeFileSync(join(proj, 'docs/audits/2026-04-30-fast-all.json'), JSON.stringify({
      report_id: 'audit-test',
      engine_output: {
        schema_version: '1.0',
        findings: [
          { id: 'aabbccdd11223344', lens_id: 'A-tdd', severity: 'P1', title: 'foo', description: '', source_doc: '',
            evidence: { kind: 'rule_violation', rule_id: 'r', file: 'f' }, confidence: 'high',
            first_seen: '2026-04-30T00:00:00Z', last_seen: '2026-04-30T00:00:00Z', status: 'open' },
          {
            id: 'aa00112233445566', lens_id: 'B-ac-coverage', severity: 'P2', title: 'bar',
            description: '', source_doc: '',
            evidence: { kind: 'orphan_node', graph_query: '', node_id: 'x' }, confidence: 'high',
            first_seen: '2026-04-30T00:00:00Z', last_seen: '2026-04-30T00:00:00Z', status: 'open',
          },
        ],
      },
    }))
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('writes a finding_acknowledged event when given a unique prefix', async () => {
    const code = await handleAck({ cwd: proj, prefixOrId: 'aabbccdd', status: 'acknowledged', note: 'known' })
    expect(code).toBe(0)
    const ledger = readFileSync(join(proj, '.scaffold/activity.jsonl'), 'utf8')
    const obj = JSON.parse(ledger.trim()) as Record<string, unknown>
    expect(obj.type).toBe('finding_acknowledged')
    expect((obj.payload as Record<string, unknown>).finding_id).toBe('aabbccdd11223344')
    expect((obj.payload as Record<string, unknown>).status).toBe('acknowledged')
    expect((obj.payload as Record<string, unknown>).note).toBe('known')
  })

  it('exits 2 when the prefix is ambiguous', async () => {
    const code = await handleAck({ cwd: proj, prefixOrId: 'a', status: 'acknowledged' })
    expect(code).toBe(2)
  })

  it('exits 2 when the prefix matches no finding', async () => {
    const code = await handleAck({ cwd: proj, prefixOrId: 'deadbeef', status: 'acknowledged' })
    expect(code).toBe(2)
  })

  it('exits 3 when no audit sidecars exist', async () => {
    rmSync(join(proj, 'docs/audits'), { recursive: true, force: true })
    const code = await handleAck({ cwd: proj, prefixOrId: 'aabbccdd', status: 'acknowledged' })
    expect(code).toBe(3)
  })
})

describe('observe progress + audit write markdown reports and sidecars', () => {
  let proj: string
  beforeEach(async () => {
    proj = mkdtempSync(join(tmpdir(), 'observe-md-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    ensureIdentity(proj, 'primary')
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync(join(proj, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(proj, 'docs/user-stories.md'),
      '## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n')
    writeFileSync(join(proj, 'docs/tdd-standards.md'), '# TDD\n')
    await writeEvent(proj, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('progress writes docs/build-status/<id>.md and .json', async () => {
    const code = await handleProgress({ cwd: proj, json: false, sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    expect(code).toBe(0)
    const files = readdirSync(join(proj, 'docs/build-status'))
    expect(files.find((f) => /^progress-.*\.md$/.test(f))).toBeDefined()
    expect(files.find((f) => /^progress-.*\.json$/.test(f))).toBeDefined()
  })

  it('audit writes docs/audits/<id>.md and .json', async () => {
    const code = await handleAudit({
      cwd: proj, json: false, profile: 'fast', scope: 'all', sinceHours: 24,
      ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    expect([0, 1]).toContain(code)
    const files = readdirSync(join(proj, 'docs/audits'))
    expect(files.find((f) => /^audit-.*\.md$/.test(f))).toBeDefined()
    expect(files.find((f) => /^audit-.*\.json$/.test(f))).toBeDefined()
  })

  it('--json still writes the sidecar (so audit-history has trend data)', async () => {
    let captured = ''
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((s: string | Uint8Array) => { captured += String(s); return true }) as never
    try {
      await handleAudit({ cwd: proj, json: true, profile: 'fast', scope: 'all', sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    } finally { process.stdout.write = origWrite }
    expect(JSON.parse(captured).schema_version).toBe('1.0')
    const files = readdirSync(join(proj, 'docs/audits'))
    expect(files.find((f) => /\.json$/.test(f))).toBeDefined()
  })

  it('--output=<path> overrides the markdown path but keeps the standard sidecar location', async () => {
    const customMd = join(proj, 'tmp-out.md')
    await handleProgress({ cwd: proj, json: false, sinceHours: 24, output: customMd, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    expect(existsSync(customMd)).toBe(true)
    expect(readdirSync(join(proj, 'docs/build-status')).find((f) => f.endsWith('.json'))).toBeDefined()
  })
})
