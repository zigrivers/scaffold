import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

async function run(args: Record<string, unknown>) {
  const { configCommand } = await import('../../src/commands/config.js')
  await configCommand.handler({ _: ['config'], $0: 'mmr', ...args } as never)
}

describe('mmr config disable/enable', () => {
  let tmp: string
  let home: string
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let homeSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-toggle-'))
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-home-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp)
    homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(home)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => {
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    logSpy.mockRestore()
    fs.rmSync(tmp, { recursive: true })
    fs.rmSync(home, { recursive: true })
  })

  it('disables a channel to the project file with --project', async () => {
    await run({ action: 'disable', name: 'codex', project: true })
    const yaml = fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')
    expect(yaml).toMatch(/codex:[\s\S]*enabled: false/)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toContain('Disabled channel')
    expect(out).toContain('mmr config enable codex')
  })

  it('routes a not-installed channel disable to global with a notice', async () => {
    // Define a channel whose CLI is guaranteed absent on any machine, so the
    // not-installed → global routing (D1) is deterministic regardless of which
    // real review CLIs happen to be on PATH.
    fs.writeFileSync(
      path.join(tmp, '.mmr.yaml'),
      'version: 1\nchannels:\n  ghostcli:\n    command: "nonexistent-cli-xyz-123 review"\n',
    )
    await run({ action: 'disable', name: 'ghostcli' })
    const global = path.join(home, '.mmr', 'config.yaml')
    expect(fs.existsSync(global)).toBe(true)
    expect(fs.readFileSync(global, 'utf-8')).toMatch(/ghostcli:[\s\S]*enabled: false/)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out.toLowerCase()).toContain('not installed')
  })

  it('enable prunes a stale channels_disabled entry', async () => {
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\nchannels_disabled:\n  - codex\n')
    await run({ action: 'enable', name: 'codex', project: true })
    const yaml = fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')
    expect(yaml).not.toMatch(/-\s*codex/)
    expect(yaml).toMatch(/codex:[\s\S]*enabled: true/)
  })

  it('errors when no channel name is given', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ action: 'disable' })
    expect(errSpy).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)
    errSpy.mockRestore()
    exitSpy.mockRestore()
  })
})
