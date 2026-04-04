import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../../src/config/loader.js'

describe('loadConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('returns defaults when no config files exist', () => {
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.defaults.fix_threshold).toBe('P2')
    expect(config.defaults.timeout).toBe(300)
  })

  it('loads project .mmr.yaml and merges with defaults', () => {
    const yaml = [
      'version: 1',
      'defaults:',
      '  fix_threshold: P1',
      'channels:',
      '  claude:',
      '    enabled: true',
      '    command: claude -p',
      '    auth:',
      '      check: "claude -p ok"',
      '      timeout: 5',
      '      failure_exit_codes: [1]',
      '      recovery: "Run: claude login"',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yaml)

    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.defaults.fix_threshold).toBe('P1')
    expect(config.defaults.timeout).toBe(300)
    expect(config.channels.claude.enabled).toBe(true)
  })

  it('CLI overrides take precedence over config file', () => {
    const yaml = [
      'version: 1',
      'defaults:',
      '  fix_threshold: P2',
      '  timeout: 300',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yaml)

    const config = loadConfig({
      projectRoot: tmpDir,
      userHome: tmpDir,
      cliOverrides: { fix_threshold: 'P0', timeout: 60 },
    })
    expect(config.defaults.fix_threshold).toBe('P0')
    expect(config.defaults.timeout).toBe(60)
  })

  it('merges user config with project config', () => {
    const userDir = path.join(tmpDir, '.mmr')
    fs.mkdirSync(userDir, { recursive: true })
    const userYaml = [
      'channels:',
      '  codex:',
      '    enabled: false',
      '    command: codex exec',
      '    auth:',
      '      check: "codex login status"',
      '      timeout: 5',
      '      failure_exit_codes: [1]',
      '      recovery: "Run: codex login"',
    ].join('\n')
    fs.writeFileSync(path.join(userDir, 'config.yaml'), userYaml)

    const projYaml = [
      'version: 1',
      'channels:',
      '  claude:',
      '    enabled: true',
      '    command: claude -p',
      '    auth:',
      '      check: "claude -p ok"',
      '      timeout: 5',
      '      failure_exit_codes: [1]',
      '      recovery: "Run: claude login"',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), projYaml)

    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.claude.enabled).toBe(true)
    expect(config.channels.codex.enabled).toBe(false)
  })
})
