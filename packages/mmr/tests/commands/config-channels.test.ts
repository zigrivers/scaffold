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
        '    command: "review --session-dir=/tmp/mmr --token-limit=4096 --auth-type=none"',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    const channels = JSON.parse(output) as Array<{ name: string; command: string }>
    expect(channels.find((channel) => channel.name === 'local')?.command).toBe(
      'review --session-dir=/tmp/mmr --token-limit=4096 --auth-type=none',
    )
  })

  it('redacts commands with equals-form secret arguments', async () => {
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

  it('redacts commands with space-separated secret arguments', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mmr.yaml'),
      [
        'version: 1',
        'channels:',
        '  local:',
        '    command: "review --api-key sk-live --model qwen"',
        '  token:',
        '    command: "review --token abc --model qwen"',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    const channels = JSON.parse(output) as Array<{ name: string; command: string }>
    expect(channels.find((channel) => channel.name === 'local')?.command).toBe('<redacted>')
    expect(channels.find((channel) => channel.name === 'token')?.command).toBe('<redacted>')
  })

  it('redacts commands with common compound secret flag names', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mmr.yaml'),
      [
        'version: 1',
        'channels:',
        '  pass:',
        '    command: "review --db-pass hunter2"',
        '  session:',
        '    command: "review --session-id abc"',
        '  sid:',
        '    command: "review --sid abc"',
        '  signature:',
        '    command: "review --signature abc"',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    const channels = JSON.parse(output) as Array<{ name: string; command: string }>
    expect(channels.find((channel) => channel.name === 'pass')?.command).toBe('<redacted>')
    expect(channels.find((channel) => channel.name === 'session')?.command).toBe('<redacted>')
    expect(channels.find((channel) => channel.name === 'sid')?.command).toBe('<redacted>')
    expect(channels.find((channel) => channel.name === 'signature')?.command).toBe('<redacted>')
  })

  it('redacts commands with provider-specific token and key flags', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mmr.yaml'),
      [
        'version: 1',
        'channels:',
        '  github:',
        '    command: "review --github-token ghp_live"',
        '  slack:',
        '    command: "review --slack-token xoxb-live"',
        '  openai:',
        '    command: "review --openai-key sk-live"',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    const channels = JSON.parse(output) as Array<{ name: string; command: string }>
    expect(channels.find((channel) => channel.name === 'github')?.command).toBe('<redacted>')
    expect(channels.find((channel) => channel.name === 'slack')?.command).toBe('<redacted>')
    expect(channels.find((channel) => channel.name === 'openai')?.command).toBe('<redacted>')
  })

  it('redacts nested key/value secrets inside flag values', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mmr.yaml'),
      [
        'version: 1',
        'channels:',
        '  header:',
        '    command: "curl --header=Authorization:Bearer-live"',
        '  env:',
        '    command: "docker run --env=OPENAI_API_KEY=sk-live image"',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    const channels = JSON.parse(output) as Array<{ name: string; command: string }>
    expect(channels.find((channel) => channel.name === 'header')?.command).toBe('<redacted>')
    expect(channels.find((channel) => channel.name === 'env')?.command).toBe('<redacted>')
  })

  it('redacts commands with single-dash space-separated secret arguments', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mmr.yaml'),
      [
        'version: 1',
        'channels:',
        '  token:',
        '    command: "review -token secret"',
        '  api:',
        '    command: "review -api-key sk-live"',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    const channels = JSON.parse(output) as Array<{ name: string; command: string }>
    expect(channels.find((channel) => channel.name === 'token')?.command).toBe('<redacted>')
    expect(channels.find((channel) => channel.name === 'api')?.command).toBe('<redacted>')
  })

  it('redacts space-separated header and env option values containing secrets', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mmr.yaml'),
      [
        'version: 1',
        'channels:',
        '  header:',
        '    command: "curl --header Authorization:Bearer-live"',
        '  short_header:',
        '    command: "curl -H Authorization:Bearer-live"',
        '  env:',
        '    command: "docker run --env OPENAI_API_KEY=sk-live image"',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    const channels = JSON.parse(output) as Array<{ name: string; command: string }>
    expect(channels.find((channel) => channel.name === 'header')?.command).toBe('<redacted>')
    expect(channels.find((channel) => channel.name === 'short_header')?.command).toBe('<redacted>')
    expect(channels.find((channel) => channel.name === 'env')?.command).toBe('<redacted>')
  })

  it('does not redact commands that only name env-var pointer flags', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mmr.yaml'),
      [
        'version: 1',
        'channels:',
        '  local:',
        '    command: "review --api-key-env OPENAI_API_KEY --auth-token-env AUTH_TOKEN"',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    const channels = JSON.parse(output) as Array<{ name: string; command: string }>
    expect(channels.find((channel) => channel.name === 'local')?.command).toBe(
      'review --api-key-env OPENAI_API_KEY --auth-token-env AUTH_TOKEN',
    )
  })

  it('does not redact commands with harmless words containing secret substrings', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.mmr.yaml'),
      [
        'version: 1',
        'channels:',
        '  keyboard:',
        '    command: "review --keyboard-layout qwerty"',
        '  monkey:',
        '    command: "review --monkey-mode false"',
      ].join('\n'),
    )

    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)

    const output = String(logSpy.mock.calls.at(-1)?.[0])
    const channels = JSON.parse(output) as Array<{ name: string; command: string }>
    expect(channels.find((channel) => channel.name === 'keyboard')?.command).toBe(
      'review --keyboard-layout qwerty',
    )
    expect(channels.find((channel) => channel.name === 'monkey')?.command).toBe(
      'review --monkey-mode false',
    )
  })
})
