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
})
