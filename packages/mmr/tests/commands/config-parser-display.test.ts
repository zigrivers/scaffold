import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('mmr config channels does not crash on object-form output_parser', () => {
  let tmpDir: string
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-cfg-display-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    logSpy.mockRestore()
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('formats an object-form parser as "<kind>" instead of a raw object', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mmr.yaml'),
      [
        'version: 1',
        'channels:',
        '  qwen:',
        '    command: ollama',
        "    auth: { check: 'true', failure_exit_codes: [1], recovery: 'noop' }",
        '    output_parser:',
        '      kind: unwrap-jsonpath',
        '      wrap: $.response',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    expect(output).not.toContain('[object Object]')
    const channels = JSON.parse(output) as Array<{ name: string; parser: unknown }>
    const qwen = channels.find((channel) => channel.name === 'qwen')
    expect(qwen?.parser).toBe('<unwrap-jsonpath>')
  })
})
