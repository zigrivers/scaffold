import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// codex (a built-in) and absent-cli-xyz (a custom project channel) are "not
// installed"; everything else installs + auths fine.
vi.mock('../../src/core/auth.js', () => ({
  checkInstalled: async (cmd: string) => cmd !== 'codex' && cmd !== 'absent-cli-xyz',
  checkAuth: async () => ({ status: 'ok' }),
  checkHttpAuth: async () => ({ status: 'ok' }),
  deriveProbeUrl: () => undefined,
}))

async function run(args: Record<string, unknown>) {
  const { doctorCommand } = await import('../../src/commands/doctor.js')
  await doctorCommand.handler({ _: ['doctor'], $0: 'mmr', ...args } as never)
}

describe('mmr doctor', () => {
  let tmp: string
  let home: string
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let homeSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-doctor-'))
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

  it('reports a not-installed channel with a disable remediation and exits non-zero', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ format: 'text' })
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toMatch(/codex\s+not_installed/)
    expect(out).toContain('mmr config disable codex')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('--fix disables the not-installed channel in the global config and exits 0', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ format: 'text', fix: true })
    const global = path.join(home, '.mmr', 'config.yaml')
    expect(fs.existsSync(global)).toBe(true)
    expect(fs.readFileSync(global, 'utf-8')).toMatch(/codex:[\s\S]*enabled: false/)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('--fix routes a project-only not-installed channel to the project (not global)', async () => {
    fs.writeFileSync(
      path.join(tmp, '.mmr.yaml'),
      'version: 1\nchannels:\n  projbot:\n    command: "absent-cli-xyz review"\n',
    )
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ format: 'text', fix: true })
    // projbot is project-only → its disable stays in the project file
    expect(fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')).toMatch(/projbot:[\s\S]*enabled: false/)
    // codex is a built-in → routed to global; projbot must NOT be in global
    const global = path.join(home, '.mmr', 'config.yaml')
    const globalText = fs.existsSync(global) ? fs.readFileSync(global, 'utf-8') : ''
    expect(globalText).not.toMatch(/projbot/)
    exitSpy.mockRestore()
  })

  it('treats a channels_disabled channel as disabled (does not probe or fix it)', async () => {
    // codex would otherwise be not_installed; the legacy list turns it off.
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\nchannels_disabled:\n  - codex\n')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ format: 'json' })
    const rows = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0])) as Array<{ name: string; status: string }>
    expect(rows.find((r) => r.name === 'codex')?.status).toBe('disabled')
    exitSpy.mockRestore()
  })

  it('emits JSON with --format json', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await run({ format: 'json' })
    const rows = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0])) as Array<{ name: string; status: string }>
    expect(rows.find((r) => r.name === 'codex')?.status).toBe('not_installed')
  })
})
