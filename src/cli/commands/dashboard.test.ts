import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import * as projectRootModule from '../middleware/project-root.js'

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `scaffold-dashboard-test-${crypto.randomUUID()}`)
  fs.mkdirSync(d, { recursive: true })
  tmpDirs.push(d)
  return d
}

function makeProjectDir(stateContent?: string): string {
  const dir = makeTmpDir()
  fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
  const state = stateContent ?? JSON.stringify({
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z',
    in_progress: null,
    steps: {
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-02T00:00:00.000Z',
        completed_by: 'claude',
        depth: 2,
        produces: ['docs/prd.md'],
      },
    },
    next_eligible: [],
    'extra-steps': [],
  })
  fs.writeFileSync(path.join(dir, '.scaffold', 'state.json'), state, 'utf8')
  return dir
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
  vi.restoreAllMocks()
})

async function runDashboardHandler(argv: Record<string, unknown>): Promise<void> {
  const mod = await import('./dashboard.js')
  const cmd = mod.default
  if (typeof cmd.handler === 'function') {
    await cmd.handler(argv as never)
  }
}

const BASE_ARGV = {
  root: undefined,
  format: undefined,
  auto: false,
  output: undefined as string | undefined,
  'no-open': true,
  'json-only': false,
}

describe('dashboard command', () => {
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

    await expect(
      runDashboardHandler({ ...BASE_ARGV }),
    ).rejects.toThrow('process.exit(1)')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('--json-only outputs JSON to stdout', async () => {
    const dir = makeProjectDir()
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    await expect(
      runDashboardHandler({ ...BASE_ARGV, format: 'json', 'json-only': true }),
    ).rejects.toThrow('process.exit(0)')

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as {
      success: boolean
      data: { methodology: string; steps: unknown[]; progress: unknown; decisions: unknown[] }
    }
    expect(parsed.success).toBe(true)
    expect(parsed.data).toHaveProperty('methodology')
    expect(parsed.data).toHaveProperty('steps')
    expect(parsed.data).toHaveProperty('progress')
    expect(parsed.data).toHaveProperty('decisions')
  })

  it('generates HTML file at specified --output path', async () => {
    const dir = makeProjectDir()
    const outDir = makeTmpDir()
    const outputPath = path.join(outDir, 'dashboard.html')
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    await expect(
      runDashboardHandler({ ...BASE_ARGV, output: outputPath }),
    ).rejects.toThrow('process.exit(0)')

    expect(fs.existsSync(outputPath)).toBe(true)
    const content = fs.readFileSync(outputPath, 'utf8')
    expect(content.trimStart().startsWith('<!DOCTYPE html>')).toBe(true)
  })

  it('creates parent directories for --output path', async () => {
    const dir = makeProjectDir()
    const outDir = makeTmpDir()
    const outputPath = path.join(outDir, 'nested', 'deep', 'dashboard.html')
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    await expect(
      runDashboardHandler({ ...BASE_ARGV, output: outputPath }),
    ).rejects.toThrow('process.exit(0)')

    expect(fs.existsSync(outputPath)).toBe(true)
  })

  it('--no-open generates HTML and exits 0 without attempting browser open', async () => {
    // When --no-open is true the handler must not invoke any browser opener.
    // We verify this by asserting the command succeeds cleanly even in a
    // headless environment where open/xdg-open would not be available.
    const dir = makeProjectDir()
    const outDir = makeTmpDir()
    const outputPath = path.join(outDir, 'dashboard.html')
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    await expect(
      runDashboardHandler({ ...BASE_ARGV, output: outputPath }),
    ).rejects.toThrow('process.exit(0)')

    // File exists, so the handler completed the write step
    expect(fs.existsSync(outputPath)).toBe(true)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('outputs success message with file path in interactive mode', async () => {
    const dir = makeProjectDir()
    const outDir = makeTmpDir()
    const outputPath = path.join(outDir, 'dashboard.html')
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    await expect(
      runDashboardHandler({ ...BASE_ARGV, output: outputPath }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).toContain('Dashboard generated')
    expect(allOutput).toContain(outputPath)
  })
})
