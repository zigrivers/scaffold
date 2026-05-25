import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../../src/config/loader.js'

describe('loader inline-secret warnings (T1-E)', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-inline-secret-'))
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('warns when a channel headers block contains Authorization', () => {
    // Even though kind:http does not exist in v3.28, users may pre-stage a
    // headers block under a subprocess channel awaiting v3.30. The loader
    // should already warn.
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  custom:',
      '    command: curl',
      '    headers:',
      '      Authorization: "Bearer literal-secret"',
      '    auth:',
      '      check: "true"',
      '      failure_exit_codes: [1]',
      '      recovery: "x"',
    ].join('\n'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    const warnOutput = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    warnSpy.mockRestore()

    expect(warnOutput).toMatch(/custom/)
    expect(warnOutput).toMatch(/Authorization/)
    expect(warnOutput).toMatch(/api_key_env/)
  })

  it('does not warn when headers contain only innocuous values', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  custom:',
      '    command: curl',
      '    headers:',
      '      X-Trace: "true"',
      '    auth:',
      '      check: "true"',
      '      failure_exit_codes: [1]',
      '      recovery: "x"',
    ].join('\n'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    const warnOutput = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    warnSpy.mockRestore()

    expect(warnOutput).not.toMatch(/Authorization/)
  })

  it('warns when headers contain api_key_env as a literal header key', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  custom:',
      '    command: curl',
      '    headers:',
      '      api_key_env: "sk-literal-secret"',
      '    auth:',
      '      check: "true"',
      '      failure_exit_codes: [1]',
      '      recovery: "x"',
    ].join('\n'))
    const warnings: string[] = []

    loadConfig({ projectRoot: tmpDir, userHome: tmpDir, onWarning: (message) => warnings.push(message) })

    expect(warnings.join('\n')).toMatch(/custom/)
    expect(warnings.join('\n')).toMatch(/api_key_env/)
  })

  it('routes inline-secret warnings through the configured warning sink', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  custom:',
      '    command: curl',
      '    headers:',
      '      Authorization: "Bearer literal-secret"',
      '    auth:',
      '      check: "true"',
      '      failure_exit_codes: [1]',
      '      recovery: "x"',
    ].join('\n'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const warnings: string[] = []

    loadConfig({ projectRoot: tmpDir, userHome: tmpDir, onWarning: (message) => warnings.push(message) })
    warnSpy.mockRestore()

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/Authorization/)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not preserve arbitrary forward-compatible channel fields', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  custom:',
      '    command: curl',
      '    future_secret_shape:',
      '      Authorization: "Bearer literal-secret"',
      '    auth:',
      '      check: "true"',
      '      failure_exit_codes: [1]',
      '      recovery: "x"',
    ].join('\n'))

    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })

    expect(config.channels.custom).not.toHaveProperty('future_secret_shape')
  })
})
