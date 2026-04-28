import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import yaml from 'js-yaml'

describe('mmr config init template', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-config-init-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('writes .mmr.yaml with explanatory comment block above fix_threshold', async () => {
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    await configCommand.handler({ action: 'init', _: ['config'], $0: 'mmr' } as never)

    cwdSpy.mockRestore()
    exitSpy.mockRestore()

    const written = fs.readFileSync(path.join(tmpDir, '.mmr.yaml'), 'utf-8')
    expect(written).toMatch(/# fix_threshold:/)
    expect(written).toMatch(/#\s+P0\b/)
    expect(written).toMatch(/#\s+P1\b/)
    expect(written).toMatch(/#\s+P2\b/)
    expect(written).toMatch(/#\s+P3\b/)
    expect(written).toMatch(/^\s*fix_threshold:\s*P2\s*$/m)

    // Round-trip through YAML loader to catch indentation/structural breakage.
    // Regex assertions above check for content; this checks the file is still valid YAML.
    const parsed = yaml.load(written) as { defaults: { fix_threshold: string } }
    expect(parsed.defaults.fix_threshold).toBe('P2')
  })
})
