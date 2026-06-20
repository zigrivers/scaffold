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

  it('routes a not-installed but globally-known channel disable to global with a notice', async () => {
    // The channel is defined in the GLOBAL config with an absent CLI, so the
    // not-installed → global routing (D1) is deterministic and safe (global
    // already carries its command).
    fs.mkdirSync(path.join(home, '.mmr'), { recursive: true })
    fs.writeFileSync(
      path.join(home, '.mmr', 'config.yaml'),
      'version: 1\nchannels:\n  ghostcli:\n    command: "nonexistent-cli-xyz-123 review"\n',
    )
    await run({ action: 'disable', name: 'ghostcli' })
    const global = path.join(home, '.mmr', 'config.yaml')
    expect(fs.readFileSync(global, 'utf-8')).toMatch(/ghostcli:[\s\S]*enabled: false/)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out.toLowerCase()).toContain('not installed')
  })

  it('does NOT stub a project-only not-installed channel into global config', async () => {
    // A project-only custom channel must stay in the project file even when its
    // CLI is absent — a global command-less stub would break config loading in
    // every other repo.
    fs.writeFileSync(
      path.join(tmp, '.mmr.yaml'),
      'version: 1\nchannels:\n  ghostcli:\n    command: "nonexistent-cli-xyz-123 review"\n',
    )
    await run({ action: 'disable', name: 'ghostcli' })
    expect(fs.existsSync(path.join(home, '.mmr', 'config.yaml'))).toBe(false)
    expect(fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')).toMatch(/ghostcli:[\s\S]*enabled: false/)
    // A different empty project still loads config cleanly (no broken global stub).
    const { loadConfig } = await import('../../src/config/loader.js')
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-other-'))
    expect(() => loadConfig({ projectRoot: other })).not.toThrow()
    fs.rmSync(other, { recursive: true })
  })

  it('accepts a channel alias at the front door (disable agy → antigravity)', async () => {
    await run({ action: 'disable', name: 'agy', project: true })
    const yaml = fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')
    expect(yaml).toMatch(/antigravity:[\s\S]*enabled: false/)
    expect(yaml).not.toMatch(/\bagy:/)
  })

  it('enable respects scope: does not mutate the global layer, warns instead', async () => {
    fs.mkdirSync(path.join(home, '.mmr'), { recursive: true })
    fs.writeFileSync(path.join(home, '.mmr', 'config.yaml'), 'version: 1\nchannels_disabled:\n  - codex\n')
    await run({ action: 'enable', name: 'codex', project: true })
    // The global channels_disabled entry is NOT silently removed by a --project
    // enable; the command warns that another layer still disables the channel.
    expect(fs.readFileSync(path.join(home, '.mmr', 'config.yaml'), 'utf-8')).toMatch(/-\s*codex/)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toMatch(/⚠|still disables/)
    expect(out).toMatch(/now\s+codex\s+disabled/)
  })

  it('keeps a project-only channel that extends a template in the project (not global)', async () => {
    // A global template carries the (missing) command; the project channel
    // inherits it via extends, so its command provenance is user-level — but the
    // channel KEY is project-only. Disabling it must stay in the project, or a
    // global stub would be an orphan in every other repo. (Equivalent to the
    // "project channel extends grok with grok missing" case.)
    fs.mkdirSync(path.join(home, '.mmr'), { recursive: true })
    fs.writeFileSync(
      path.join(home, '.mmr', 'config.yaml'),
      'version: 1\nchannels:\n  tmpl:\n    abstract: true\n    command: "nonexistent-cli-xyz-123 review"\n',
    )
    fs.writeFileSync(
      path.join(tmp, '.mmr.yaml'),
      'version: 1\nchannels:\n  my-x:\n    extends: tmpl\n',
    )
    await run({ action: 'disable', name: 'my-x' })
    // global config still only has the template (no my-x stub added)
    expect(fs.readFileSync(path.join(home, '.mmr', 'config.yaml'), 'utf-8')).not.toMatch(/my-x/)
    expect(fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')).toMatch(/my-x:[\s\S]*enabled: false/)
  })

  it('keeps a built-in disable in the project when its missing command is a project override', async () => {
    // codex is a built-in, but the project overrides its command to an absent
    // CLI. The not-installed-ness is project-specific, so the disable must NOT
    // leak to the global config.
    fs.writeFileSync(
      path.join(tmp, '.mmr.yaml'),
      'version: 1\nchannels:\n  codex:\n    command: "nonexistent-cli-xyz-123 exec"\n',
    )
    await run({ action: 'disable', name: 'codex' })
    expect(fs.existsSync(path.join(home, '.mmr', 'config.yaml'))).toBe(false)
    expect(fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')).toMatch(/codex:[\s\S]*enabled: false/)
  })

  it('rejects --global for a project-only channel (would orphan-stub other repos)', async () => {
    fs.writeFileSync(
      path.join(tmp, '.mmr.yaml'),
      'version: 1\nchannels:\n  projonly:\n    command: "some-cli review"\n',
    )
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ action: 'disable', name: 'projonly', global: true })
    expect(fs.existsSync(path.join(home, '.mmr', 'config.yaml'))).toBe(false)
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/only in the project|Use --project/)
    errSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('rejects passing both --global and --project', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ action: 'disable', name: 'codex', global: true, project: true })
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/only one of --global or --project/)
    expect(exitSpy).toHaveBeenCalledWith(1)
    errSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('enable prunes a stale channels_disabled entry', async () => {
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\nchannels_disabled:\n  - codex\n')
    await run({ action: 'enable', name: 'codex', project: true })
    const yaml = fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')
    expect(yaml).not.toMatch(/-\s*codex/)
    expect(yaml).toMatch(/codex:[\s\S]*enabled: true/)
  })

  it('rejects an unknown channel and writes nothing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ action: 'disable', name: 'cdoex', project: true })
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('Unknown channel')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(fs.existsSync(path.join(tmp, '.mmr.yaml'))).toBe(false)
    errSpy.mockRestore()
    exitSpy.mockRestore()
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
