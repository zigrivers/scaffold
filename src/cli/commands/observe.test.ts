import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { handleEvent, handleProgress, handleHarvest } from './observe.js'
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
