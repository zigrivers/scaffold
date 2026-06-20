import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('mmr config path', () => {
  let tmp: string
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-cfgpath-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => {
    cwdSpy.mockRestore()
    logSpy.mockRestore()
    fs.rmSync(tmp, { recursive: true })
  })

  it('lists the search order and write target', async () => {
    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'path', _: ['config'], $0: 'mmr' } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toContain('.mmr.yaml')
    expect(out).toMatch(/config\.yaml/)
    expect(out.toLowerCase()).toContain('write target')
  })
})
