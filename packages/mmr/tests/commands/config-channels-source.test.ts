import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('mmr config channels — source provenance', () => {
  let tmp: string
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-src-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => {
    cwdSpy.mockRestore()
    logSpy.mockRestore()
    fs.rmSync(tmp, { recursive: true })
  })

  it('adds a source field; default JSON still parses', async () => {
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\nchannels:\n  grok:\n    enabled: false\n')
    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)
    const rows = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0])) as Array<{ name: string; source: string }>
    expect(rows.find((r) => r.name === 'grok')?.source).toBe('project')
    expect(rows.find((r) => r.name === 'claude')?.source).toBe('default')
  })

  it('renders a table with --format text', async () => {
    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', format: 'text', _: ['config'], $0: 'mmr' } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toMatch(/CHANNEL\s+STATUS\s+SOURCE/)
  })

  it('shows a channels_disabled channel as disabled in the table', async () => {
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\nchannels_disabled:\n  - codex\n')
    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', format: 'text', _: ['config'], $0: 'mmr' } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    const codexLine = out.split('\n').find((l) => l.startsWith('codex'))
    expect(codexLine).toMatch(/disabled/)
  })

  it('honors --no-redact: prints the raw command and a stderr warning', async () => {
    fs.writeFileSync(
      path.join(tmp, '.mmr.yaml'),
      'version: 1\nchannels:\n  local:\n    command: "review --api-key=sk-live --model qwen"\n',
    )
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', 'no-redact': true, _: ['config'], $0: 'mmr' } as never)
    const rows = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0])) as Array<{ name: string; command: string }>
    expect(rows.find((r) => r.name === 'local')?.command).toContain('sk-live')
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/no-redact/i)
    errSpy.mockRestore()
  })
})
