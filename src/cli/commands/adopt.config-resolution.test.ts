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
// Helpers
// ---------------------------------------------------------------------------

function makeTmpProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-write-'))
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

describe('adopt config write', () => {
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

  it('dry-run produces detectedConfig without writing files', async () => {
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
    expect(result.detectedConfig?.type).toBe('game')
    // No .scaffold/config.yml created in dry-run (runAdoption doesn't write files)
    expect(fs.existsSync(path.join(dir, '.scaffold', 'config.yml'))).toBe(false)
  })

  it('merge preserves existing config values over detection', async () => {
    const dir = tracked(makeTmpProject({
      'Assets/foo.meta': '',
      '.scaffold/config.yml': 'version: 2\nproject:\n  projectType: game\n  gameConfig:\n    engine: unreal\n',
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
    // Detection finds unity (Assets/.meta), but existing says unreal
    // Existing wins per merge pipeline invariant
    const config = result.detectedConfig?.config as Record<string, unknown>
    expect(config?.engine).toBe('unreal')
    // Should emit field conflict warning
    expect(result.warnings.some(w => w.code === 'ADOPT_FIELD_CONFLICT')).toBe(true)
  })

  it('existing config with bare project: (null scalar) does not crash', async () => {
    const dir = tracked(makeTmpProject({
      'Assets/foo.meta': '',
      '.scaffold/config.yml': 'version: 2\nproject:\n',
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
    expect(result.errors).toHaveLength(0)
    expect(result.detectedConfig?.type).toBe('game')
  })

  it('malformed YAML config produces an error', async () => {
    const dir = tracked(makeTmpProject({
      'Assets/foo.meta': '',
      '.scaffold/config.yml': '{unclosed',
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
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].code).toBe('CONFIG_PARSE_ERROR')
  })

  it('type conflict without --force returns error', async () => {
    const dir = tracked(makeTmpProject({
      'Assets/foo.meta': '',
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
    expect(result.errors.some(e => e.code === 'ADOPT_TYPE_CONFLICT')).toBe(true)
  })

  it('preserves YAML comments in existing config without crashing', async () => {
    const dir = tracked(makeTmpProject({
      'Assets/foo.meta': '',
      '.scaffold/config.yml':
        '# My config comment\nversion: 2\nproject:\n  projectType: game\n'
        + '  gameConfig:\n    engine: unity\n',
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
    expect(result.errors).toHaveLength(0)
    expect(result.projectType).toBe('game')
  })

  it('re-adoption without --force skips detection and returns ADOPT_DETECTION_INCONCLUSIVE', async () => {
    const dir = tracked(makeTmpProject({
      'Assets/foo.meta': '',
      '.scaffold/config.yml': 'version: 2\nproject:\n  projectType: game\n',
    }))
    const result = await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(dir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: false,
      verbose: false,
    })
    expect(result.projectType).toBe('game')
    expect(result.detectedConfig).toBeUndefined()
    expect(result.warnings.some(w => w.code === 'ADOPT_DETECTION_INCONCLUSIVE')).toBe(true)
  })

  it('type conflict with --force allows type change and emits ADOPT_TYPE_CHANGED', async () => {
    const dir = tracked(makeTmpProject({
      'Assets/foo.meta': '',
      '.scaffold/config.yml': 'version: 2\nproject:\n  projectType: backend\n  backendConfig:\n    apiStyle: rest\n',
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
    // Assets/.meta → detection wins with game
    expect(result.projectType).toBe('game')
    expect(result.errors).toHaveLength(0)
    expect(result.warnings.some(w => w.code === 'ADOPT_TYPE_CHANGED')).toBe(true)
  })

  it('explicit --project-type with matching existing config runs detection', async () => {
    const dir = tracked(makeTmpProject({
      'Assets/foo.meta': '',
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
      explicitProjectType: 'game',
    })
    // Detection ran because explicit type bypasses re-adoption gating
    expect(result.projectType).toBe('game')
    expect(result.detectedConfig).toBeDefined()
    expect(result.errors).toHaveLength(0)
  })
})
