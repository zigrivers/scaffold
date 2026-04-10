import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('./detector.js', () => ({
  detectProjectMode: vi.fn(() => ({
    mode: 'brownfield',
    signals: [],
    methodologySuggestion: 'deep',
    sourceFileCount: 10,
  })),
}))

vi.mock('../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { runAdoption } from './adopt.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-err-msg-'))
}

function seedConfig(dir: string, content: string): void {
  const scaffoldDir = path.join(dir, '.scaffold')
  fs.mkdirSync(scaffoldDir, { recursive: true })
  fs.writeFileSync(path.join(scaffoldDir, 'config.yml'), content, 'utf8')
}

function baseOpts(dir: string) {
  return {
    projectRoot: dir,
    metaPromptDir: path.join(dir, 'content', 'pipeline'),
    methodology: 'deep',
    dryRun: true,
    auto: true,
  }
}

// ---------------------------------------------------------------------------
// Error message snapshot tests
// ---------------------------------------------------------------------------

describe('adoption error messages', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('ADOPT_TYPE_CONFLICT includes both types and recovery hint', async () => {
    seedConfig(tmpDir, 'version: 2\nproject:\n  projectType: game\n')

    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'web-app',
    })

    expect(result.errors).toHaveLength(1)
    const err = result.errors[0]
    expect(err.code).toBe('ADOPT_TYPE_CONFLICT')
    expect(err.message).toMatch(/game/)
    expect(err.message).toMatch(/web-app/)
    expect(err.message).toMatch(/--force/)
    expect(err.exitCode).toBe(6)  // ExitCode.Ambiguous
  })

  it('ADOPT_DETECTION_INCONCLUSIVE includes existing type', async () => {
    seedConfig(tmpDir, 'version: 2\nproject:\n  projectType: backend\n')

    const result = await runAdoption({ ...baseOpts(tmpDir) })

    const warning = result.warnings.find(
      w => w.code === 'ADOPT_DETECTION_INCONCLUSIVE',
    )
    expect(warning).toBeDefined()
    expect(warning!.message).toMatch(/backend/)
    expect(warning!.message).toMatch(/--force/)
    expect(warning!.message).toMatch(/--project-type/)
  })

  it('ADOPT_MISSING_REQUIRED_FIELDS includes type and missing fields', async () => {
    // web-app requires renderingStrategy (no default) — passing explicit
    // project-type with no flags triggers Zod validation failure
    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'web-app',
    })

    expect(result.errors).toHaveLength(1)
    const err = result.errors[0]
    expect(err.code).toBe('ADOPT_MISSING_REQUIRED_FIELDS')
    expect(err.message).toMatch(/web-app/)
    expect(err.message).toMatch(/renderingStrategy/)
    expect(err.exitCode).toBe(1) // ExitCode.ValidationError
  })

  it('ADOPT_GAME_CONFIG_DEPRECATED includes removal timeline', async () => {
    const assetsDir = path.join(tmpDir, 'Assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    fs.writeFileSync(path.join(assetsDir, 'foo.meta'), '')

    const result = await runAdoption({ ...baseOpts(tmpDir) })

    const warning = result.warnings.find(
      w => w.code === 'ADOPT_GAME_CONFIG_DEPRECATED',
    )
    expect(warning).toBeDefined()
    expect(warning!.message).toMatch(/gameConfig/)
    expect(warning!.message).toMatch(/detectedConfig/)
    expect(warning!.message).toMatch(/v4\.0/)
  })

  it('CONFIG_PARSE_ERROR includes file path', async () => {
    seedConfig(tmpDir, '{unclosed')

    const result = await runAdoption({ ...baseOpts(tmpDir) })

    expect(result.errors).toHaveLength(1)
    const err = result.errors[0]
    expect(err.code).toBe('CONFIG_PARSE_ERROR')
    expect(err.context?.file).toContain('config.yml')
  })
})
