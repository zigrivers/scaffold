import { describe, it, expect, vi } from 'vitest'
import { reviewCommand } from '../../src/commands/review.js'

class ExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`)
  }
}

async function runReview(args: Record<string, unknown>): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = []
  const stderr: string[] = []
  const previousExitCode = process.exitCode
  process.exitCode = undefined
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...values) => {
    stdout.push(values.join(' '))
  })
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...values) => {
    stderr.push(values.join(' '))
  })
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
    throw new ExitError(typeof code === 'number' ? code : 0)
  }) as never)
  try {
    await reviewCommand.handler({
      ...args,
      _: ['review'],
      $0: 'mmr',
    } as never)
    const code = typeof process.exitCode === 'number' ? process.exitCode : 0
    return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
  } catch (err: unknown) {
    if (err instanceof ExitError) {
      return { code: err.code, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
    }
    throw err
  } finally {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    exitSpy.mockRestore()
    process.exitCode = previousExitCode
  }
}

describe('review - cap enforcement (T2-F)', () => {
  it('rejects an invalid session id BEFORE any dispatch', async () => {
    const { code, stderr } = await runReview({ diff: '/dev/null', session: '../../../etc' })
    expect(code).toBeGreaterThan(0)
    expect(stderr).toMatch(/invalid session id/i)
  })

  it('refuses dispatch when round > max-rounds', async () => {
    const { code, stdout } = await runReview({
      diff: '/dev/null',
      session: 'feat-foo',
      round: 6,
      'max-rounds': 5,
      sync: true,
      format: 'json',
    })
    expect(code).toBe(3)
    const parsed = JSON.parse(stdout)
    expect(parsed.verdict).toBe('needs-user-decision')
    expect(parsed.summary).toMatch(/max_rounds_exceeded/i)
  })

  it('refuses dispatch when programmatic callers pass camelCase maxRounds', async () => {
    const { code, stdout } = await runReview({
      diff: '/dev/null',
      session: 'feat-foo',
      round: 6,
      maxRounds: 5,
      sync: true,
      format: 'json',
    })
    expect(code).toBe(3)
    const parsed = JSON.parse(stdout)
    expect(parsed.verdict).toBe('needs-user-decision')
    expect(parsed.summary).toMatch(/max_rounds_exceeded/i)
  })

  it('accepts dispatch at round == max-rounds (boundary)', async () => {
    const { code, stderr } = await runReview({
      diff: '/dev/null',
      session: 'feat-foo',
      round: 5,
      'max-rounds': 5,
    })
    expect(code).toBe(1)
    expect(stderr).toMatch(/no diff content/i)
  })
})
