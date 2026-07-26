import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

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

  it('empty project with no detection signals produces no detected config', async () => {
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
    // D11 (R1): this file's detectProjectMode mock returns mode: 'brownfield'
    // (line 16 above), so methodology is now 'brownfield' — not the passed-in
    // 'deep' default — per the init-mode-drives-preset-selection change.
    expect(result).toHaveProperty('methodology', 'brownfield')
    expect(Array.isArray(result.stepsCompleted)).toBe(true)
    expect(Array.isArray(result.stepsRemaining)).toBe(true)
    expect(result).toHaveProperty('artifactsFound')
    expect(Array.isArray(result.detectedArtifacts)).toBe(true)
  })
})

describe('adopt failure envelope (Task 13)', () => {
  const DIST_CLI = fileURLToPath(new URL('../../../dist/index.js', import.meta.url))

  function brownfieldRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-adopt-fail-'))
    execFileSync('git', ['init', '-q'], { cwd: dir })
    fs.writeFileSync(path.join(dir, 'package.json'),
      JSON.stringify({ name: 'acme', dependencies: { express: '^4.19.0' } }))
    execFileSync('git', ['add', '-A'], { cwd: dir })
    execFileSync('git', ['-c', 'user.email=t@t.co', '-c', 'user.name=t', 'commit', '-qm', 'i'], { cwd: dir })
    return dir
  }

  function run(args: string[], cwd: string): { code: number; stdout: string } {
    try {
      const stdout = execFileSync(process.execPath, [DIST_CLI, ...args],
        { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
      return { code: 0, stdout }
    } catch (e) {
      const err = e as { status: number | null; stdout: string }
      return { code: err.status ?? 1, stdout: err.stdout ?? '' }
    }
  }

  it('emits a parseable envelope for a bare --apply', () => {
    const r = run(['adopt', '--auto', '--format', 'json', '--apply'], brownfieldRepo())
    expect(r.code).toBe(1)
    expect(r.stdout.trim(), 'stdout must not be empty').not.toBe('')
    const parsed = JSON.parse(r.stdout)
    expect(parsed.success).toBe(false)
    expect(parsed.errors[0].code).toBe('ADOPT_APPLY_NON_INTERACTIVE')
    expect(parsed.errors[0].recovery).toContain('--plan-key')
  }, 60_000)

  it('emits a parseable envelope for plan drift', () => {
    const r = run(['adopt', '--auto', '--format', 'json', '--apply', '--plan-key', 'deadbeef'],
      brownfieldRepo())
    expect(r.code).toBe(1)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.success).toBe(false)
    expect(parsed.errors[0].code).toBe('ADOPT_PLAN_DRIFT')
    expect(parsed.errors[0].recovery).toBeTruthy()
  }, 60_000)

  it('reports an exit_code in the envelope that matches the process status', () => {
    // The envelope's exit_code and the process status must agree. They can
    // diverge whenever a site hardcodes a constant instead of reading the
    // code off the error it just emitted: asScaffoldError passes an
    // already-formed ScaffoldError through untouched, so its exitCode is not
    // always ValidationError.
    for (const args of [
      ['adopt', '--auto', '--format', 'json', '--apply'],
      ['adopt', '--auto', '--format', 'json', '--apply', '--plan-key', 'deadbeef'],
    ]) {
      const r = run(args, brownfieldRepo())
      expect(r.code, `${args.join(' ')} should fail`).not.toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.exit_code, `${args.join(' ')} envelope vs process status`).toBe(r.code)
    }
  }, 60_000)

  // Static gate: the e2e cases above reach only two of the ten converted
  // sites, so this guards the rest against silently reverting to output.error.
  it('has converted every terminal-failure site in adopt.ts', () => {
    const src = fs.readFileSync(
      fileURLToPath(new URL('./adopt.ts', import.meta.url)), 'utf-8')
    expect(src.match(/output\.error\(/g) ?? []).toHaveLength(0)
    expect((src.match(/output\.fail\(/g) ?? []).length).toBeGreaterThanOrEqual(10)
  })
})
