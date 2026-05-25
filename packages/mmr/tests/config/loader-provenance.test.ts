import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadConfigWithProvenance } from '../../src/config/loader.js'

describe('loadConfigWithProvenance (T1-E)', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-prov-'))
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('attributes builtin fields to "default"', () => {
    const { config, provenance } = loadConfigWithProvenance({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.claude.command).toBe('claude -p')
    expect(provenance.channels.claude.command).toBe('default')
  })

  it('attributes project-overridden fields to "project"', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  claude:',
      '    timeout: 600',
    ].join('\n'))
    const { provenance } = loadConfigWithProvenance({ projectRoot: tmpDir, userHome: tmpDir })
    expect(provenance.channels.claude.timeout).toBe('project')
    expect(provenance.channels.claude.command).toBe('default')
  })

  it('attributes user-overridden fields to "user" when project does not override', () => {
    const userDir = path.join(tmpDir, '.mmr')
    fs.mkdirSync(userDir)
    fs.writeFileSync(path.join(userDir, 'config.yaml'), [
      'channels:',
      '  claude:',
      '    timeout: 500',
    ].join('\n'))
    const { provenance } = loadConfigWithProvenance({ projectRoot: tmpDir, userHome: tmpDir })
    expect(provenance.channels.claude.timeout).toBe('user')
  })

  it('attributes inherited channel fields to the parent source', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  strict-claude:',
      '    extends: claude',
      '    timeout: 600',
    ].join('\n'))
    const { config, provenance } = loadConfigWithProvenance({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels['strict-claude']?.command).toBe('claude -p')
    expect(provenance.channels['strict-claude']?.command).toBe('default')
    expect(provenance.channels['strict-claude']?.timeout).toBe('project')
  })

  it('fills provenance for schema-defaulted fields on custom channels', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  local:',
      '    command: "local-review"',
    ].join('\n'))
    const { config, provenance } = loadConfigWithProvenance({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.local?.enabled).toBe(true)
    expect(config.channels.local?.flags).toEqual([])
    expect(provenance.channels.local?.command).toBe('project')
    expect(provenance.channels.local?.enabled).toBe('default')
    expect(provenance.channels.local?.flags).toBe('default')
  })

  it('tracks top-level defaults provenance', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'defaults:',
      '  timeout: 900',
    ].join('\n'))
    const { provenance } = loadConfigWithProvenance({ projectRoot: tmpDir, userHome: tmpDir })
    expect(provenance.defaults.timeout).toBe('project')
    expect(provenance.defaults.format).toBe('default')
  })
})
