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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-readopt-'))
}

function seedGameProject(dir: string): void {
  const assetsDir = path.join(dir, 'Assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  fs.writeFileSync(path.join(assetsDir, 'foo.meta'), '')
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
// Tests
// ---------------------------------------------------------------------------

describe('re-adoption gating', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // No existing projectType (fresh adoption)
  // -----------------------------------------------------------------------

  it('fresh adoption: detects game without existing config', async () => {
    seedGameProject(tmpDir)

    const result = await runAdoption({ ...baseOpts(tmpDir) })

    expect(result.projectType).toBe('game')
    expect(result.errors).toHaveLength(0)
    expect(result.warnings.every(
      w => w.code !== 'ADOPT_DETECTION_INCONCLUSIVE',
    )).toBe(true)
  })

  it('fresh adoption with explicit --project-type + required flag works', async () => {
    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'backend',
      flagOverrides: { type: 'backend', partial: { apiStyle: 'rest' } },
    })

    expect(result.projectType).toBe('backend')
    expect(result.errors).toHaveLength(0)
    expect(result.detectedConfig?.type).toBe('backend')
  })

  it('fresh adoption with explicit --project-type missing required field: MISSING_REQUIRED', async () => {
    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'backend',
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('ADOPT_MISSING_REQUIRED_FIELDS')
    expect(result.errors[0].message).toContain('apiStyle')
  })

  // -----------------------------------------------------------------------
  // Existing matching projectType
  // -----------------------------------------------------------------------

  it('re-adoption of matching type without --force: skips detection', async () => {
    seedGameProject(tmpDir)
    seedConfig(tmpDir, 'version: 2\nproject:\n  projectType: game\n')

    const result = await runAdoption({ ...baseOpts(tmpDir) })

    expect(result.projectType).toBe('game')
    expect(result.warnings.some(
      w => w.code === 'ADOPT_DETECTION_INCONCLUSIVE',
    )).toBe(true)
    // Detection skipped, so no detectedConfig
    expect(result.detectedConfig).toBeUndefined()
  })

  it('re-adoption of matching type with --force: runs detection', async () => {
    seedGameProject(tmpDir)
    seedConfig(tmpDir, 'version: 2\nproject:\n  projectType: game\n')

    const result = await runAdoption({
      ...baseOpts(tmpDir),
      force: true,
    })

    expect(result.projectType).toBe('game')
    expect(result.detectedConfig).toBeDefined()
    expect(result.errors).toHaveLength(0)
    // No ADOPT_DETECTION_INCONCLUSIVE since we forced
    expect(result.warnings.every(
      w => w.code !== 'ADOPT_DETECTION_INCONCLUSIVE',
    )).toBe(true)
  })

  it('re-adoption with --project-type same as existing: runs detection', async () => {
    seedGameProject(tmpDir)
    seedConfig(
      tmpDir,
      'version: 2\nproject:\n  projectType: game\n'
        + '  gameConfig:\n    engine: unity\n',
    )

    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'game',
    })

    expect(result.projectType).toBe('game')
    // Detection ran because explicit type bypasses re-adoption gating
    expect(result.detectedConfig).toBeDefined()
    expect(result.errors).toHaveLength(0)
  })

  // -----------------------------------------------------------------------
  // Existing mismatching projectType
  // -----------------------------------------------------------------------

  it('re-adoption with mismatching --project-type (no --force): TYPE_CONFLICT', async () => {
    seedConfig(tmpDir, 'version: 2\nproject:\n  projectType: game\n')

    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'backend',
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('ADOPT_TYPE_CONFLICT')
    expect(result.errors[0].message).toContain('game')
    expect(result.errors[0].message).toContain('backend')
  })

  it('re-adoption with mismatching --project-type + --force: succeeds', async () => {
    seedConfig(tmpDir, 'version: 2\nproject:\n  projectType: game\n')

    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'backend',
      force: true,
      // backend requires apiStyle — supply it via flag overrides
      flagOverrides: { type: 'backend', partial: { apiStyle: 'rest' } },
    })

    expect(result.projectType).toBe('backend')
    expect(result.errors).toHaveLength(0)
    // ADOPT_TYPE_CHANGED warning emitted
    expect(result.warnings.some(
      w => w.code === 'ADOPT_TYPE_CHANGED',
    )).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Merge pipeline: existing values win
  // -----------------------------------------------------------------------

  it('existing config values win over detected during merge', async () => {
    seedGameProject(tmpDir)
    seedConfig(
      tmpDir,
      'version: 2\nproject:\n  projectType: game\n'
      + '  gameConfig:\n    engine: unreal\n',
    )

    const result = await runAdoption({
      ...baseOpts(tmpDir),
      force: true,
    })

    // Detection finds unity (Assets/.meta), but existing says unreal
    // Existing wins per merge pipeline invariant
    expect(result.projectType).toBe('game')
    expect(result.detectedConfig?.config).toEqual(
      expect.objectContaining({ engine: 'unreal' }),
    )
    // Conflict warning emitted
    expect(result.warnings.some(
      w => w.code === 'ADOPT_FIELD_CONFLICT'
        && w.message.includes('engine'),
    )).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Flag overrides win over everything
  // -----------------------------------------------------------------------

  it('flag overrides win over existing and detected values', async () => {
    seedGameProject(tmpDir)
    seedConfig(
      tmpDir,
      'version: 2\nproject:\n  projectType: game\n'
      + '  gameConfig:\n    engine: unreal\n',
    )

    const result = await runAdoption({
      ...baseOpts(tmpDir),
      force: true,
      flagOverrides: {
        type: 'game',
        partial: { engine: 'godot' },
      },
    })

    expect(result.projectType).toBe('game')
    // Flag override (godot) wins over existing (unreal) and detected (unity)
    expect(result.detectedConfig?.config).toEqual(
      expect.objectContaining({ engine: 'godot' }),
    )
  })

  // -----------------------------------------------------------------------
  // Game deprecation alias
  // -----------------------------------------------------------------------

  it('game detection emits ADOPT_GAME_CONFIG_DEPRECATED warning', async () => {
    seedGameProject(tmpDir)

    const result = await runAdoption({ ...baseOpts(tmpDir) })

    expect(result.projectType).toBe('game')
    expect(result.gameConfig).toBeDefined()
    expect(result.warnings.some(
      w => w.code === 'ADOPT_GAME_CONFIG_DEPRECATED',
    )).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Config parse error
  // -----------------------------------------------------------------------

  it('returns CONFIG_PARSE_ERROR when config.yml is malformed YAML', async () => {
    seedConfig(tmpDir, '{unclosed')

    const result = await runAdoption({ ...baseOpts(tmpDir) })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('CONFIG_PARSE_ERROR')
  })

  // -----------------------------------------------------------------------
  // No detection match
  // -----------------------------------------------------------------------

  it('returns no projectType when empty dir and no explicit type', async () => {
    const result = await runAdoption({ ...baseOpts(tmpDir) })

    expect(result.projectType).toBeUndefined()
    expect(result.detectedConfig).toBeUndefined()
    expect(result.errors).toHaveLength(0)
  })
})
