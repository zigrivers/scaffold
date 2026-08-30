import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ackCommand } from '../../src/commands/ack.js'
import { resultsCommand } from '../../src/commands/results.js'
import { JobStore } from '../../src/core/job-store.js'
import type { Finding } from '../../src/types.js'

// Invoked directly against the handler (not the built dist) because CI runs the
// vitest suite without building packages/mmr/dist — see commit history for the
// "run … without dist" convention.

const originalHome = process.env.HOME
const originalMmrHome = process.env.MMR_HOME

afterEach(() => {
  process.env.HOME = originalHome
  process.env.MMR_HOME = originalMmrHome
  vi.restoreAllMocks()
})

function runAck(args: Record<string, unknown>, dirs: { home: string; cwd: string }): {
  out: string[]
  err: string[]
  exited: number | undefined
} {
  process.env.HOME = dirs.home
  delete process.env.MMR_HOME
  const out: string[] = []
  const err: string[] = []
  let exited: number | undefined
  vi.spyOn(process, 'cwd').mockReturnValue(dirs.cwd)
  vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { out.push(String(m)) })
  vi.spyOn(console, 'error').mockImplementation((m?: unknown) => { err.push(String(m)) })
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exited = code ?? 0
    throw new Error('process.exit')
  }) as never)
  try {
    ;(ackCommand.handler as (a: unknown) => void)({ _: ['ack'], $0: 'mmr', ...args })
  } catch (e) {
    if ((e as Error).message !== 'process.exit') throw e
  }
  return { out, err, exited }
}

function runResults(jobId: string, dirs: { home: string; cwd: string }): {
  out: string[]
  exited: number | undefined
} {
  vi.restoreAllMocks()
  process.env.HOME = dirs.home
  delete process.env.MMR_HOME
  const out: string[] = []
  let exited: number | undefined
  vi.spyOn(process, 'cwd').mockReturnValue(dirs.cwd)
  vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { out.push(String(m)) })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exited = code ?? 0
    throw new Error('process.exit')
  }) as never)
  try {
    ;(resultsCommand.handler as (a: unknown) => void)({
      _: ['results'], $0: 'mmr', 'job-id': jobId, format: 'json', raw: false,
    })
  } catch (e) {
    if ((e as Error).message !== 'process.exit') throw e
  }
  return { out, exited }
}

describe('mmr ack CLI', () => {
  const JOB_ID = `mmr-${'b'.repeat(12)}`
  const FINDING_KEY = 'a'.repeat(40)

  function writeSourceFinding(home: string): void {
    const jobDir = path.join(home, '.mmr', 'jobs', JOB_ID)
    fs.mkdirSync(jobDir, { recursive: true })
    fs.writeFileSync(path.join(jobDir, 'results.json'), JSON.stringify({
      reconciled_findings: [{
        finding_key: FINDING_KEY,
        location: 'src/foo.ts:10',
        description_shingle: ['hello', 'ello '],
      }],
    }))
  }

  it('rejects an invalid finding-key BEFORE constructing a path', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-cli-'))
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-proj-'))
    try {
      const { err, exited } = runAck({ action: 'add', 'finding-key': '../../etc/passwd' }, { home, cwd })
      expect(exited).toBe(1)
      expect(err.join('\n')).toMatch(/invalid finding[_ ]key/i)
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
      fs.rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('rejects a path-traversal --job value before any filesystem read', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-cli-'))
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-proj-'))
    try {
      const { err, exited } = runAck(
        { action: 'add', 'finding-key': 'a'.repeat(40), job: '../../etc/passwd' },
        { home, cwd },
      )
      expect(exited).toBe(1)
      expect(err.join('\n')).toMatch(/invalid job id/i)
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
      fs.rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('list returns [] when no acks exist', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-cli-'))
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-proj-'))
    try {
      const { out, exited } = runAck({ action: 'list' }, { home, cwd })
      expect(exited).toBeUndefined()
      expect(JSON.parse(out.join('\n'))).toEqual([])
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
      fs.rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('stores a job-scoped rejection only inside the named review job', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-cli-'))
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-proj-'))
    try {
      writeSourceFinding(home)
      const { out, exited } = runAck({
        action: 'add',
        'finding-key': FINDING_KEY,
        job: JOB_ID,
        scope: 'job',
        reason: 'reject: verified duplicate',
      }, { home, cwd })
      expect(exited).toBeUndefined()
      expect(JSON.parse(out.join('\n'))).toMatchObject({ added: FINDING_KEY, scope: 'job', job: JOB_ID })
      expect(fs.existsSync(path.join(home, '.mmr', 'jobs', JOB_ID, 'acks', `${FINDING_KEY}.json`))).toBe(true)
      expect(fs.existsSync(path.join(home, '.mmr', 'acks', `${FINDING_KEY}.json`))).toBe(false)
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
      fs.rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('requires a reason when a job-scoped rejection is added', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-cli-'))
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-proj-'))
    try {
      writeSourceFinding(home)
      const { err, exited } = runAck({
        action: 'add',
        'finding-key': FINDING_KEY,
        job: JOB_ID,
        scope: 'job',
      }, { home, cwd })
      expect(exited).toBe(1)
      expect(err.join('\n')).toMatch(/job-scoped.*reason/i)
      expect(fs.existsSync(path.join(home, '.mmr', 'jobs', JOB_ID, 'acks', `${FINDING_KEY}.json`))).toBe(false)
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
      fs.rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('recomputes only the acknowledged job from blocked to pass', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-cli-'))
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-proj-'))
    try {
      const store = new JobStore(path.join(home, '.mmr', 'jobs'))
      const finding: Finding = {
        severity: 'P1', location: 'src/foo.ts:10', description: 'false positive', suggestion: 'none',
      }
      const createCompletedJob = (): string => {
        const job = store.createJob({
          fix_threshold: 'P2', format: 'json', channels: ['codex'], min_completed_channels: 1,
        })
        store.updateChannel(job.job_id, 'codex', {
          status: 'completed',
          started_at: '2026-08-30T00:00:00Z',
          completed_at: '2026-08-30T00:00:01Z',
          output_parser: 'default',
        })
        store.saveChannelOutput(job.job_id, 'codex', JSON.stringify({ findings: [finding] }))
        return job.job_id
      }

      const acknowledgedJob = createCompletedJob()
      const untouchedJob = createCompletedJob()
      const before = runResults(acknowledgedJob, { home, cwd })
      expect(before.exited).toBe(2)
      const beforeResult = JSON.parse(before.out.join('\n'))
      const findingKey = beforeResult.reconciled_findings[0].finding_key as string

      const added = runAck({
        action: 'add', 'finding-key': findingKey, job: acknowledgedJob,
        scope: 'job', reason: 'reject: verified false positive',
      }, { home, cwd })
      expect(added.exited).toBeUndefined()

      const after = runResults(acknowledgedJob, { home, cwd })
      expect(after.exited).toBe(0)
      const afterResult = JSON.parse(after.out.join('\n'))
      expect(afterResult.verdict).toBe('pass')
      expect(afterResult.reconciled_findings[0]).toMatchObject({
        acknowledged: true,
        ack_match: 'exact',
        ack_reason: 'reject: verified false positive',
      })

      const untouched = runResults(untouchedJob, { home, cwd })
      expect(untouched.exited).toBe(2)
      expect(JSON.parse(untouched.out.join('\n')).reconciled_findings[0].acknowledged).toBeUndefined()
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
      fs.rmSync(cwd, { recursive: true, force: true })
    }
  })
})
