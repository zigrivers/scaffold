import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { MockInstance } from 'vitest'

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `scaffold-list-test-${crypto.randomUUID()}`)
  fs.mkdirSync(d, { recursive: true })
  tmpDirs.push(d)
  return d
}

const deepPreset = `name: deep
description: Comprehensive deep-dive methodology
default_depth: 5
steps:
  create-prd:
    enabled: true
`

const mvpPreset = `name: mvp
description: Minimal viable product methodology
default_depth: 2
steps:
  create-prd:
    enabled: true
`

const customPreset = `name: custom-defaults
description: Custom methodology with user overrides
default_depth: 3
steps:
  create-prd:
    enabled: true
`

function makeProjectRoot(opts: { hasMethodology?: boolean } = {}): string {
  const root = makeTmpDir()
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })

  if (opts.hasMethodology !== false) {
    fs.mkdirSync(path.join(root, 'methodology'), { recursive: true })
    fs.writeFileSync(path.join(root, 'methodology', 'deep.yml'), deepPreset, 'utf8')
    fs.writeFileSync(path.join(root, 'methodology', 'mvp.yml'), mvpPreset, 'utf8')
    fs.writeFileSync(path.join(root, 'methodology', 'custom-defaults.yml'), customPreset, 'utf8')
  }

  return root
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
  vi.restoreAllMocks()
})

async function runListHandler(argv: Record<string, unknown>): Promise<void> {
  const mod = await import('./list.js')
  const cmd = mod.default
  if (typeof cmd.handler === 'function') {
    await cmd.handler(argv as never)
  }
}

describe('list command — interactive mode', () => {
  let stdoutWrite: MockInstance
  let stderrWrite: MockInstance
  let exitSpy: MockInstance

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
  })

  it('default shows both methodologies and platforms sections', async () => {
    const root = makeProjectRoot({ hasMethodology: true })

    await runListHandler({
      root,
      section: undefined,
      format: undefined,
      auto: false,
    })

    const written = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    expect(written).toContain('Methodology')
    expect(written).toContain('Platform')
    expect(exitSpy).toHaveBeenCalled()
  })

  it('--section methodologies shows only methodologies', async () => {
    const root = makeProjectRoot({ hasMethodology: true })

    await runListHandler({
      root,
      section: 'methodologies',
      format: undefined,
      auto: false,
    })

    const written = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    expect(written).toContain('Methodology')
    // Should NOT show the platforms section header
    expect(written).not.toContain('Platform Adapters')
  })

  it('--section platforms shows only platforms', async () => {
    const root = makeProjectRoot({ hasMethodology: true })

    await runListHandler({
      root,
      section: 'platforms',
      format: undefined,
      auto: false,
    })

    const written = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    expect(written).toContain('Platform')
    // Should NOT show the methodology section header
    expect(written).not.toContain('Methodology Presets')
  })

  it('shows message when no presets are found', async () => {
    const root = makeProjectRoot({ hasMethodology: false })

    await runListHandler({
      root,
      section: 'methodologies',
      format: undefined,
      auto: false,
    })

    const written = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')

    expect(written).toContain('none found')
  })

  it('works without a project root (no .scaffold/ dir)', async () => {
    const dir = makeTmpDir()  // no .scaffold/

    await runListHandler({
      root: dir,
      section: undefined,
      format: undefined,
      auto: false,
    })

    // Should not throw, should exit cleanly
    expect(exitSpy).toHaveBeenCalled()
    const lastExitCode = exitSpy.mock.calls[exitSpy.mock.calls.length - 1]?.[0]
    expect(lastExitCode).not.toBe(1)
  })
})

describe('list command — JSON mode', () => {
  let stdoutWrite: MockInstance
  let exitSpy: MockInstance

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
  })

  it('returns methodologies array in JSON output', async () => {
    const root = makeProjectRoot({ hasMethodology: true })

    await runListHandler({
      root,
      section: undefined,
      format: 'json',
      auto: false,
    })

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as { success: boolean; data: Record<string, unknown> }

    expect(parsed.success).toBe(true)
    expect(Array.isArray(parsed.data['methodologies'])).toBe(true)
    const methodologies = parsed.data['methodologies'] as Array<{ name: string; depth: number }>
    expect(methodologies.length).toBeGreaterThan(0)
    const names = methodologies.map(m => m.name)
    expect(names).toContain('deep')
    expect(names).toContain('mvp')
    expect(exitSpy).toHaveBeenCalled()
  })
})
