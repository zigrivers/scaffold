import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ackCommand } from '../../src/commands/ack.js'

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

describe('mmr ack CLI', () => {
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
})
