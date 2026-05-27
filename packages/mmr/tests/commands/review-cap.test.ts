import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mmrBin = path.resolve(__dirname, '../../dist/index.js')

function runMmr(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [mmrBin, ...args], { encoding: 'utf-8' })
    return { code: 0, stdout, stderr: '' }
  } catch (err: unknown) {
    const e = err as { status: number; stdout: string; stderr: string }
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

describe('review - cap enforcement (T2-F)', () => {
  it('rejects an invalid session id BEFORE any dispatch', () => {
    const { code, stderr } = runMmr(['review', '--diff', '/dev/null', '--session', '../../../etc'])
    expect(code).toBeGreaterThan(0)
    expect(stderr).toMatch(/invalid session id/i)
  })

  it('refuses dispatch when round > max-rounds', () => {
    const { code, stdout } = runMmr([
      'review',
      '--diff', '/dev/null',
      '--session', 'feat-foo',
      '--round', '6',
      '--max-rounds', '5',
      '--sync',
      '--format', 'json',
    ])
    expect(code).toBe(3)
    const parsed = JSON.parse(stdout)
    expect(parsed.verdict).toBe('needs-user-decision')
    expect(parsed.summary).toMatch(/max_rounds_exceeded/i)
  })

  it('accepts dispatch at round == max-rounds (boundary)', () => {
    const { code, stderr } = runMmr([
      'review',
      '--diff', '/dev/null',
      '--session', 'feat-foo',
      '--round', '5',
      '--max-rounds', '5',
    ])
    expect(code).toBe(1)
    expect(stderr).toMatch(/no diff content/i)
  })
})
