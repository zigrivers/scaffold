import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('mmr config init --with-examples (T1-D)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-init-examples-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('emits every OSS example block even when no runtime is detected', async () => {
    vi.resetModules()
    vi.doMock('../../src/core/runtime-probe.js', () => ({
      probeRuntime: async () => ({ detected: false }),
    }))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    await configCommand.handler({
      action: 'init',
      'with-examples': true,
      _: ['config'],
      $0: 'mmr',
    } as never)
    cwdSpy.mockRestore()
    exitSpy.mockRestore()

    const written = fs.readFileSync(path.join(tmpDir, '.mmr.yaml'), 'utf-8')
    expect(written).toMatch(/# example: ollama/m)
    expect(written).toMatch(/# example: lms/m)
    expect(written).toMatch(/# example: llama-server/m)
    expect(written).toMatch(/# example: local-ai-delegate/m)
    vi.doUnmock('../../src/core/runtime-probe.js')
  })
})
