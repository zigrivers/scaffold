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
})
