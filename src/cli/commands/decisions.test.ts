import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { appendDecision } from '../../state/decision-logger.js'
import * as projectRootModule from '../middleware/project-root.js'
import decisionsCommand from './decisions.js'

type HandlerFn = (argv: Record<string, unknown>) => Promise<void>

const tmpDirs: string[] = []

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-decisions-cmd-test-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  tmpDirs.push(dir)
  return dir
}

function makeProjectDir(): string {
  const dir = makeTempDir()
  fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
  return dir
}

const baseEntry = {
  prompt: 'create-prd',
  decision: 'Use PostgreSQL',
  at: '2024-01-01T00:00:00Z',
  completed_by: 'user',
  step_completed: true,
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
  vi.restoreAllMocks()
})

describe('decisions command', () => {
  let stdoutWrite: MockInstance<typeof process.stdout.write>
  let stderrWrite: MockInstance<typeof process.stderr.write>
  let exitSpy: MockInstance

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exits 1 when project root not found', async () => {
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(null)

    const handler = decisionsCommand.handler as HandlerFn
    await expect(
      handler({ format: undefined, auto: undefined, root: undefined, step: undefined, last: undefined }),
    ).rejects.toThrow('process.exit(1)')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('shows "No decisions recorded." when log is empty', async () => {
    const dir = makeProjectDir()
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    const handler = decisionsCommand.handler as HandlerFn
    await expect(
      handler({ format: undefined, auto: undefined, root: undefined, step: undefined, last: undefined }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).toContain('No decisions recorded.')
  })

  it('shows all decisions by default', async () => {
    const dir = makeProjectDir()
    appendDecision(dir, { ...baseEntry, prompt: 'create-prd', decision: 'First decision' })
    appendDecision(dir, { ...baseEntry, prompt: 'system-architecture', decision: 'Second decision' })
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    const handler = decisionsCommand.handler as HandlerFn
    await expect(
      handler({ format: undefined, auto: undefined, root: undefined, step: undefined, last: undefined }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).toContain('First decision')
    expect(allOutput).toContain('Second decision')
  })

  it('--step filters to that step decisions', async () => {
    const dir = makeProjectDir()
    appendDecision(dir, { ...baseEntry, prompt: 'create-prd', decision: 'PRD decision' })
    appendDecision(dir, { ...baseEntry, prompt: 'system-architecture', decision: 'Arch decision' })
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    const handler = decisionsCommand.handler as HandlerFn
    await expect(
      handler({ format: undefined, auto: undefined, root: undefined, step: 'create-prd', last: undefined }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).toContain('PRD decision')
    expect(allOutput).not.toContain('Arch decision')
  })

  it('--last 3 shows last 3 decisions', async () => {
    const dir = makeProjectDir()
    appendDecision(dir, { ...baseEntry, decision: 'Decision A' })
    appendDecision(dir, { ...baseEntry, decision: 'Decision B' })
    appendDecision(dir, { ...baseEntry, decision: 'Decision C' })
    appendDecision(dir, { ...baseEntry, decision: 'Decision D' })
    appendDecision(dir, { ...baseEntry, decision: 'Decision E' })
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    const handler = decisionsCommand.handler as HandlerFn
    await expect(
      handler({ format: undefined, auto: undefined, root: undefined, step: undefined, last: 3 }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).not.toContain('Decision A')
    expect(allOutput).not.toContain('Decision B')
    expect(allOutput).toContain('Decision C')
    expect(allOutput).toContain('Decision D')
    expect(allOutput).toContain('Decision E')
  })

  it('JSON mode returns decisions array with total', async () => {
    const dir = makeProjectDir()
    appendDecision(dir, { ...baseEntry, prompt: 'create-prd', decision: 'Use PostgreSQL' })
    appendDecision(dir, { ...baseEntry, prompt: 'system-architecture', decision: 'Microservices' })
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    const handler = decisionsCommand.handler as HandlerFn
    await expect(
      handler({ format: 'json', auto: undefined, root: undefined, step: undefined, last: undefined }),
    ).rejects.toThrow('process.exit(0)')

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as { success: boolean; data: { decisions: unknown[]; total: number } }
    expect(parsed.success).toBe(true)
    expect(parsed.data.decisions).toHaveLength(2)
    expect(parsed.data.total).toBe(2)
  })

  it('provisional decisions are flagged in JSON output when step_completed is false', async () => {
    const dir = makeProjectDir()
    appendDecision(dir, { ...baseEntry, step_completed: false, decision: 'Provisional decision' })
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    const handler = decisionsCommand.handler as HandlerFn
    await expect(
      handler({ format: 'json', auto: undefined, root: undefined, step: undefined, last: undefined }),
    ).rejects.toThrow('process.exit(0)')

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as {
      success: boolean
      data: { decisions: Array<{ provisional: boolean }> }
    }
    expect(parsed.data.decisions[0]?.provisional).toBe(true)
  })

  it('uses --root override instead of auto-detected root', async () => {
    const dir = makeProjectDir()
    appendDecision(dir, { ...baseEntry, decision: 'From explicit root' })
    const findRootSpy = vi.spyOn(projectRootModule, 'findProjectRoot')

    const handler = decisionsCommand.handler as HandlerFn
    await expect(
      handler({ format: undefined, auto: undefined, root: dir, step: undefined, last: undefined }),
    ).rejects.toThrow('process.exit(0)')

    expect(findRootSpy).not.toHaveBeenCalled()

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).toContain('From explicit root')
  })
})
