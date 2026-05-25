import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('mmr config channels show <name> (T1-E)', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-show-'))
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('prints merged channel config with provenance comments', async () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  claude:',
      '    timeout: 600',
    ].join('\n'))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show:claude',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    logSpy.mockRestore()

    expect(output).toMatch(/^command: "claude -p"\s+# from default$/m)
    expect(output).toMatch(/^timeout: 600\s+# from project$/m)
  })

  it('redacts env values matching the secret regex (default ON)', async () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  claude:',
      '    env:',
      '      OPENAI_API_KEY: "sk-real-secret"',
      '      NO_BROWSER: "true"',
    ].join('\n'))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show:claude',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    logSpy.mockRestore()

    expect(output).toMatch(/OPENAI_API_KEY:\s*<redacted>/)
    expect(output).toMatch(/NO_BROWSER:\s*"true"/)
    expect(output).not.toMatch(/sk-real-secret/)
  })

  it('preserves auth object fields while redacting secret scalars', async () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  claude:',
      '    auth:',
      '      check: "claude auth status"',
      '      timeout: 8',
      '      failure_exit_codes: [1]',
      '      recovery: "claude login"',
    ].join('\n'))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show:claude',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    logSpy.mockRestore()

    expect(output).toMatch(/^auth:$/m)
    expect(output).toMatch(/^  check: "claude auth status"\s+# from project$/m)
    expect(output).toMatch(/^  timeout: 8\s+# from project$/m)
  })

  it('redacts inline command secrets by default', async () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  local:',
      '    command: "review --api-key sk-live --model qwen"',
    ].join('\n'))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show:local',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    logSpy.mockRestore()

    expect(output).toMatch(/^command: <redacted>\s+# from project$/m)
    expect(output).not.toMatch(/sk-live/)
  })

  it('redacts secret-bearing flags arrays by default', async () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  local:',
      '    command: local-review',
      '    flags: ["--api-key", "sk-real-secret", "--model", "qwen"]',
    ].join('\n'))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show:local',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    logSpy.mockRestore()

    expect(output).toMatch(/^flags: \["--api-key","<redacted>","--model","qwen"\]\s+# from project$/m)
    expect(output).not.toMatch(/sk-real-secret/)
  })

  it('redacts inline secrets in auth command-like fields', async () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  local:',
      '    command: local-review',
      '    auth:',
      '      check: "auth-check --api-key sk-real-secret"',
      '      timeout: 8',
      '      failure_exit_codes: [1]',
      '      recovery: "login --token secret-token"',
    ].join('\n'))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show:local',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    logSpy.mockRestore()

    expect(output).toMatch(/^  check: <redacted>\s+# from project$/m)
    expect(output).toMatch(/^  recovery: <redacted>\s+# from project$/m)
    expect(output).not.toMatch(/sk-real-secret|secret-token/)
  })

  it('quotes command values so provenance comments remain unambiguous', async () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  local:',
      '    command: "echo #literal"',
    ].join('\n'))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show:local',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    logSpy.mockRestore()

    expect(output).toMatch(/^command: "echo #literal"\s+# from project$/m)
  })

  it('supports conventional channels show <name> invocation shape', async () => {
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show',
      target: 'claude',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    logSpy.mockRestore()

    expect(output).toMatch(/# Channel: claude/)
  })

  it('does not redact harmless command substrings in show output', async () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  keyboard:',
      '    command: "review --keyboard-layout qwerty"',
    ].join('\n'))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show:keyboard',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    logSpy.mockRestore()

    expect(output).toMatch(/^command: "review --keyboard-layout qwerty"\s+# from project$/m)
  })

  it('escapes quoted string values in channel output', async () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  local:',
      '    command: local-review',
      '    prompt_wrapper: "Say \\"{{prompt}}\\""',
    ].join('\n'))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show:local',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    logSpy.mockRestore()

    expect(output).toMatch(/^prompt_wrapper: "Say \\"{{prompt}}\\""  # from project$/m)
  })

  it('--no-redact disables redaction but emits a warning banner', async () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  claude:',
      '    env:',
      '      OPENAI_API_KEY: "sk-real-secret"',
    ].join('\n'))
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show:claude',
      'no-redact': true,
      _: ['config'],
      $0: 'mmr',
    } as never)

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    const errOutput = errSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    logSpy.mockRestore()
    errSpy.mockRestore()

    expect(output).toMatch(/sk-real-secret/)
    expect(errOutput).toMatch(/WARNING.*--no-redact/i)
  })

  it('errors when the channel name is unknown', async () => {
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'show:no-such-channel',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const errOutput = errSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    errSpy.mockRestore()

    expect(errOutput).toMatch(/no-such-channel/)
  })

  it('errors when channels receives an unsupported target shape', async () => {
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await configCommand.handler({
      action: 'channels',
      name: 'claude',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const errOutput = errSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(exitSpy).toHaveBeenCalledWith(1)
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    errSpy.mockRestore()

    expect(errOutput).toMatch(/show:<channel>|show <channel>/)
  })

  it('errors when non-channel actions receive extra positionals', async () => {
    const { configCommand } = await import('../../src/commands/config.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await configCommand.handler({
      action: 'init',
      name: 'show',
      _: ['config'],
      $0: 'mmr',
    } as never)

    const errOutput = errSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(exitSpy).toHaveBeenCalledWith(1)
    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    errSpy.mockRestore()

    expect(errOutput).toMatch(/Unexpected argument/)
    expect(fs.existsSync(path.join(tmpDir, '.mmr.yaml'))).toBe(false)
  })
})
