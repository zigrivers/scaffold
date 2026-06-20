import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Force every channel to look installed with an auth-failure recovery string
// that embeds a secret, so we can assert config test redacts it before printing.
vi.mock('../../src/core/auth.js', () => ({
  checkInstalled: async () => true,
  checkAuth: async () => ({ status: 'failed', recovery: "curl -H 'Authorization: Bearer sk-secret-123'" }),
  checkHttpAuth: async () => ({ status: 'failed', recovery: "curl -H 'Authorization: Bearer sk-secret-123'" }),
  deriveProbeUrl: () => undefined,
}))

describe('mmr config test — recovery redaction', () => {
  let tmp: string
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-cfgtest-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmp, { recursive: true })
  })

  it('does not print a secret-bearing recovery command verbatim', async () => {
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\nchannels:\n  codex:\n    enabled: true\n')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'test', _: ['config'], $0: 'mmr' } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).not.toContain('sk-secret-123')
    expect(out).toContain('<redacted>')
    expect(exitSpy).toHaveBeenCalled()
  })

  it('probes an HTTP channel over the wire instead of reporting missing_command', async () => {
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  myhttp:',
      '    kind: http',
      '    endpoint: https://api.example.com/v1/chat/completions',
      '    model: gpt-4',
      '    endpoint_convention: openai-chat',
      '    api_key_env: MY_API_KEY',
    ].join('\n'))
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'test', _: ['config'], $0: 'mmr' } as never)
    const result = JSON.parse(logSpy.mock.calls.map((c) => String(c[0])).join('')) as Record<string, { auth: string }>
    expect(result.myhttp.auth).not.toBe('missing_command')
    expect(result.myhttp.auth).toBe('failed') // the mocked checkHttpAuth returns failed
    expect(exitSpy).toHaveBeenCalled()
  })
})
