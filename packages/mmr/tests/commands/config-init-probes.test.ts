import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('mmr config init OSS probing (T1-D)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-init-probes-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('emits the ollama example when ollama is detected', async () => {
    vi.resetModules()
    vi.doMock('../../src/core/runtime-probe.js', () => ({
      probeRuntime: async (cmd: string) =>
        cmd === 'ollama' ? { detected: true } : { detected: false },
    }))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    await configCommand.handler({ action: 'init', _: ['config'], $0: 'mmr' } as never)
    cwdSpy.mockRestore()
    exitSpy.mockRestore()

    const written = fs.readFileSync(path.join(tmpDir, '.mmr.yaml'), 'utf-8')
    expect(written).toMatch(/# example: ollama/m)
    expect(written).not.toMatch(/# example: lms/m)
    vi.doUnmock('../../src/core/runtime-probe.js')
  })

  it('does not emit ollama example when ollama is missing', async () => {
    vi.resetModules()
    vi.doMock('../../src/core/runtime-probe.js', () => ({
      probeRuntime: async () => ({ detected: false }),
    }))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    await configCommand.handler({ action: 'init', _: ['config'], $0: 'mmr' } as never)
    cwdSpy.mockRestore()
    exitSpy.mockRestore()

    const written = fs.readFileSync(path.join(tmpDir, '.mmr.yaml'), 'utf-8')
    expect(written).not.toMatch(/# example: ollama/m)
    vi.doUnmock('../../src/core/runtime-probe.js')
  })
})
