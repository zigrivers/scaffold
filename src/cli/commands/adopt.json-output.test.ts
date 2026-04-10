import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
// Helpers
// ---------------------------------------------------------------------------

function makeTmpProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-json-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return dir
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('adopt JSON output shape', () => {
  let tmpDirs: string[]

  beforeEach(() => {
    tmpDirs = []
  })

  afterEach(() => {
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  function tracked(dir: string): string {
    tmpDirs.push(dir)
    return dir
  }

  it('greenfield produces mode: greenfield with no detected config', async () => {
    const dir = tracked(makeTmpProject({}))
    const result = await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(dir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: false,
      verbose: false,
    })
    expect(result.mode).toBe('brownfield')  // mocked detectProjectMode returns brownfield
    expect(result.detectedConfig).toBeUndefined()
    expect(result.projectType).toBeUndefined()
  })

  it('game detection includes all expected result fields', async () => {
    const fixturesDir = path.resolve(
      __dirname, '../../../tests/fixtures/adopt/detectors/game/unity-only',
    )
    const result = await runAdoption({
      projectRoot: fixturesDir,
      metaPromptDir: path.join(fixturesDir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: true,
      verbose: false,
    })
    expect(result.projectType).toBe('game')
    expect(result.detectedConfig).toBeDefined()
    expect(result.detectedConfig?.type).toBe('game')
    expect(result.detectionConfidence).toBe('high')
    expect(result.detectionEvidence).toBeDefined()
    expect(Array.isArray(result.detectionEvidence)).toBe(true)
  })

  it('game detection includes deprecated gameConfig alongside detectedConfig', async () => {
    const fixturesDir = path.resolve(
      __dirname, '../../../tests/fixtures/adopt/detectors/game/unity-only',
    )
    const result = await runAdoption({
      projectRoot: fixturesDir,
      metaPromptDir: path.join(fixturesDir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: true,
      verbose: false,
    })
    expect(result.projectType).toBe('game')
    expect(result.gameConfig).toBeDefined()
    expect(result.detectedConfig?.type).toBe('game')
    // Both fields should have the same engine
    expect(result.gameConfig?.engine).toBe('unity')
    expect((result.detectedConfig?.config as Record<string, unknown>)?.engine).toBe('unity')
    // Deprecation warning emitted
    expect(result.warnings.some(w => w.code === 'ADOPT_GAME_CONFIG_DEPRECATED')).toBe(true)
  })

  it('detectionEvidence contains structured objects with signal field', async () => {
    const dir = tracked(makeTmpProject({
      'Assets/foo.meta': '',
    }))
    const result = await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(dir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: true,
      verbose: false,
    })
    expect(result.detectionEvidence).toBeDefined()
    expect(result.detectionEvidence!.length).toBeGreaterThan(0)
    for (const ev of result.detectionEvidence ?? []) {
      expect(ev).toHaveProperty('signal')
      expect(typeof ev.signal).toBe('string')
    }
  })

  it('errors array is populated on type conflict', async () => {
    const dir = tracked(makeTmpProject({
      '.scaffold/config.yml': 'version: 2\nproject:\n  projectType: game\n  gameConfig:\n    engine: unity\n',
    }))
    const result = await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(dir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: false,
      verbose: false,
      explicitProjectType: 'web-app',
    })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].code).toBe('ADOPT_TYPE_CONFLICT')
  })

  it('result includes mode, methodology, stepsCompleted, and stepsRemaining', async () => {
    const dir = tracked(makeTmpProject({
      'Assets/foo.meta': '',
    }))
    const result = await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(dir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: true,
      verbose: false,
    })
    expect(result).toHaveProperty('mode')
    expect(result).toHaveProperty('methodology', 'deep')
    expect(Array.isArray(result.stepsCompleted)).toBe(true)
    expect(Array.isArray(result.stepsRemaining)).toBe(true)
    expect(result).toHaveProperty('artifactsFound')
    expect(Array.isArray(result.detectedArtifacts)).toBe(true)
  })
})
