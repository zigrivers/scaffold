import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('mmr config init template', () => {
  let tmpDir: string
  let originalCwd: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-config-init-'))
    originalCwd = process.cwd()
    process.chdir(tmpDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('writes .mmr.yaml with explanatory comment block above fix_threshold', async () => {
    const { configCommand } = await import('../../src/commands/config.js')
    // Avoid process.exit terminating the test run
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    await configCommand.handler({ action: 'init', _: ['config'], $0: 'mmr' } as never)

    exitSpy.mockRestore()

    const written = fs.readFileSync(path.join(tmpDir, '.mmr.yaml'), 'utf-8')
    expect(written).toMatch(/# fix_threshold:/)
    expect(written).toMatch(/#\s+P0\b/)
    expect(written).toMatch(/#\s+P1\b/)
    expect(written).toMatch(/#\s+P2\b/)
    expect(written).toMatch(/#\s+P3\b/)
    expect(written).toMatch(/^\s*fix_threshold:\s*P2\s*$/m)
  })
})
