import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

async function run(args: Record<string, unknown>) {
  const { configCommand } = await import('../../src/commands/config.js')
  await configCommand.handler({ _: ['config'], $0: 'mmr', ...args } as never)
}

describe('mmr config set / unset', () => {
  let tmp: string
  let home: string
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let homeSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-set-'))
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-home-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp)
    homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(home)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmp, { recursive: true })
    fs.rmSync(home, { recursive: true })
  })

  it('sets a dotted value (coerced) to the project file', async () => {
    await run({ action: 'set', name: 'defaults.fix_threshold', target: 'P1', project: true })
    const yaml = fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')
    expect(yaml).toMatch(/fix_threshold: P1/)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toContain('mmr config unset defaults.fix_threshold --project')
  })

  it('coerces a numeric value to a number scalar', async () => {
    await run({ action: 'set', name: 'channels.codex.timeout', target: '600', project: true })
    const yaml = fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')
    expect(yaml).toMatch(/timeout: 600\b/)
    expect(yaml).not.toContain('"600"')
  })

  it('refuses a set that would make config invalid, and does not write', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ action: 'set', name: 'defaults.fix_threshold', target: 'NOPE', project: true })
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(fs.existsSync(path.join(tmp, '.mmr.yaml'))).toBe(false)
    errSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('rolls back an existing file when the new value is invalid', async () => {
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\ndefaults:\n  fix_threshold: P2\n')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ action: 'set', name: 'defaults.fix_threshold', target: 'NOPE', project: true })
    // original content preserved
    expect(fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')).toMatch(/fix_threshold: P2/)
    errSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('validates a --global set in global-only scope (a project override cannot mask it)', async () => {
    // The project masks fix_threshold with a VALID value, so the merged config
    // would look fine — but the global write itself is invalid and must be
    // rejected so it can't break other repos.
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\ndefaults:\n  fix_threshold: P2\n')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ action: 'set', name: 'defaults.fix_threshold', target: 'NOPE', global: true })
    expect(exitSpy).toHaveBeenCalledWith(1)
    const global = path.join(home, '.mmr', 'config.yaml')
    const globalText = fs.existsSync(global) ? fs.readFileSync(global, 'utf-8') : ''
    expect(globalText).not.toContain('NOPE')
    errSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('unsets a project override and reports the inherited default', async () => {
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\ndefaults:\n  timeout: 999\n')
    await run({ action: 'unset', name: 'defaults.timeout', project: true })
    expect(fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')).not.toMatch(/timeout: 999/)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toMatch(/inherits.*300/)
  })

  it('reports a no-op unset when the key is not set', async () => {
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\n')
    await run({ action: 'unset', name: 'defaults.timeout', project: true })
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toMatch(/nothing to unset/)
    expect(out).not.toMatch(/✓ unset/)
  })

  it('errors when set is missing a value', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ action: 'set', name: 'defaults.timeout', project: true })
    expect(errSpy).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)
    errSpy.mockRestore()
    exitSpy.mockRestore()
  })
})
