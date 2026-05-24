import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('mmr config channels', () => {
  let tmpDir: string
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-config-channels-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    logSpy.mockRestore()
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('does not redact commands only because harmless flag names contain secret words', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mmr.yaml'),
      [
        'version: 1',
        'channels:',
        '  local:',
        '    command: "review --session-dir /tmp/mmr --token-limit 4096 --auth-type none"',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    const channels = JSON.parse(output) as Array<{ name: string; command: string }>
    expect(channels.find((channel) => channel.name === 'local')?.command).toBe(
      'review --session-dir /tmp/mmr --token-limit 4096 --auth-type none',
    )
  })

  it('redacts commands with inline secret key/value arguments', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mmr.yaml'),
      [
        'version: 1',
        'channels:',
        '  local:',
        '    command: "review --api-key=sk-live --model qwen"',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    const channels = JSON.parse(output) as Array<{ name: string; command: string }>
    expect(channels.find((channel) => channel.name === 'local')?.command).toBe('<redacted>')
  })
})
