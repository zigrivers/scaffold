import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('../../project/detector.js', () => ({
  detectProjectMode: vi.fn(() => ({
    mode: 'brownfield',
    signals: [],
    methodologySuggestion: 'deep',
    sourceFileCount: 10,
  })),
}))

vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { runAdoption } from '../../project/adopt.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Windows CRLF handling', () => {
  let tmpDirs: string[]

  beforeEach(() => {
    tmpDirs = []
  })

  afterEach(() => {
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true })
    }
    tmpDirs = []
  })

  function tracked(dir: string): string {
    tmpDirs.push(dir)
    return dir
  }

  it('does not crash on CRLF line endings in existing config', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-crlf-'))
    tracked(dir)
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    const crlfContent =
      '# scaffold config\r\nversion: 2\r\nproject:\r\n'
      + '  projectType: game\r\n  gameConfig:\r\n    engine: unity\r\n'
    fs.writeFileSync(path.join(dir, '.scaffold', 'config.yml'), crlfContent)

    // Seed a Unity fixture so detection has something to find
    fs.mkdirSync(path.join(dir, 'Assets'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'Assets', 'foo.meta'), '')

    const result = await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(dir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: true,
      verbose: false,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.projectType).toBe('game')
  })

  it('does not crash on CRLF line endings in bare config (project: with no value)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-crlf-bare-'))
    tracked(dir)
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    const crlfContent = 'version: 2\r\nproject:\r\n'
    fs.writeFileSync(path.join(dir, '.scaffold', 'config.yml'), crlfContent)

    fs.mkdirSync(path.join(dir, 'Assets'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'Assets', 'foo.meta'), '')

    const result = await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(dir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: true,
      verbose: false,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.detectedConfig?.type).toBe('game')
  })

  it('CRLF in malformed YAML still reports CONFIG_PARSE_ERROR', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-crlf-bad-'))
    tracked(dir)
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    const crlfContent = '{unclosed\r\n'
    fs.writeFileSync(path.join(dir, '.scaffold', 'config.yml'), crlfContent)

    const result = await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(dir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: true,
      verbose: false,
    })

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].code).toBe('CONFIG_PARSE_ERROR')
  })
})
