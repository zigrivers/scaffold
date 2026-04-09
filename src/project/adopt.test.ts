import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('./detector.js', () => ({
  detectProjectMode: vi.fn(() => ({
    mode: 'greenfield',
    signals: [],
    methodologySuggestion: 'deep',
    sourceFileCount: 0,
  })),
}))

vi.mock('../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { detectProjectMode } from './detector.js'
import { discoverMetaPrompts } from '../core/assembly/meta-prompt-loader.js'
import { runAdoption } from './adopt.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-adopt-test-'))
}

function makeMetaPromptEntry(name: string, outputs: string[]) {
  return {
    stepName: name,
    filePath: `/fake/${name}.md`,
    frontmatter: {
      name,
      description: `${name} step`,
      phase: 'modeling',
      order: 1,
      dependencies: [],
      outputs,
      conditional: null,
      knowledgeBase: [],
      reads: [],
      stateless: false,
      category: 'pipeline' as const,
    },
    body: '',
    sections: {},
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAdoption', () => {
  let tmpDir: string
  const mockDetectProjectMode = vi.mocked(detectProjectMode)
  const mockDiscoverMetaPrompts = vi.mocked(discoverMetaPrompts)

  beforeEach(() => {
    tmpDir = makeTempDir()
    // Reset to defaults
    mockDetectProjectMode.mockReturnValue({
      mode: 'greenfield',
      signals: [],
      methodologySuggestion: 'deep',
      sourceFileCount: 0,
    })
    mockDiscoverMetaPrompts.mockReturnValue(new Map())
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Returns 'greenfield' mode for empty directory
  it('returns greenfield mode for empty directory', async () => {
    mockDetectProjectMode.mockReturnValue({
      mode: 'greenfield',
      signals: [],
      methodologySuggestion: 'deep',
      sourceFileCount: 0,
    })

    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.mode).toBe('greenfield')
  })

  // Test 2: Detects artifact when produces path exists on disk
  it('detects artifact when output path exists on disk', async () => {
    const artifactPath = 'docs/prd.md'
    const fullPath = path.join(tmpDir, artifactPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, '# PRD')

    const metaPrompts = new Map([
      ['product-requirements', makeMetaPromptEntry('product-requirements', [artifactPath])],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as ReturnType<typeof discoverMetaPrompts>,
    )

    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.detectedArtifacts).toHaveLength(1)
    expect(result.detectedArtifacts[0].artifactPath).toBe(artifactPath)
    expect(result.detectedArtifacts[0].matchedStep).toBe('product-requirements')
  })

  // Test 3: Strategy is 'skip-recommended' when all outputs found
  it('uses skip-recommended strategy when all outputs found', async () => {
    const paths = ['docs/prd.md', 'docs/user-stories.md']
    for (const p of paths) {
      const full = path.join(tmpDir, p)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, '# content')
    }

    const metaPrompts = new Map([
      ['product-requirements', makeMetaPromptEntry('product-requirements', paths)],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as ReturnType<typeof discoverMetaPrompts>,
    )

    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    for (const artifact of result.detectedArtifacts) {
      expect(artifact.strategy).toBe('skip-recommended')
    }
  })

  // Test 4: Strategy is 'context-only' when only some outputs found
  it('uses context-only strategy when only some outputs found', async () => {
    const existingPath = 'docs/prd.md'
    const missingPath = 'docs/user-stories.md'
    const full = path.join(tmpDir, existingPath)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, '# PRD')

    const metaPrompts = new Map([
      ['product-requirements', makeMetaPromptEntry('product-requirements', [existingPath, missingPath])],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as ReturnType<typeof discoverMetaPrompts>,
    )

    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.detectedArtifacts).toHaveLength(1)
    expect(result.detectedArtifacts[0].strategy).toBe('context-only')
  })

  // Test 5: stepsCompleted includes matched steps
  it('stepsCompleted includes matched steps', async () => {
    const artifactPath = 'docs/prd.md'
    const full = path.join(tmpDir, artifactPath)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, '# PRD')

    const metaPrompts = new Map([
      ['product-requirements', makeMetaPromptEntry('product-requirements', [artifactPath])],
      ['user-stories', makeMetaPromptEntry('user-stories', ['docs/user-stories.md'])],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as ReturnType<typeof discoverMetaPrompts>,
    )

    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.stepsCompleted).toContain('product-requirements')
    expect(result.stepsCompleted).not.toContain('user-stories')
  })

  // Test 6: stepsRemaining includes unmatched steps
  it('stepsRemaining includes unmatched steps', async () => {
    const metaPrompts = new Map([
      ['product-requirements', makeMetaPromptEntry('product-requirements', ['docs/prd.md'])],
      ['user-stories', makeMetaPromptEntry('user-stories', ['docs/user-stories.md'])],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as ReturnType<typeof discoverMetaPrompts>,
    )

    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.stepsRemaining).toContain('product-requirements')
    expect(result.stepsRemaining).toContain('user-stories')
  })

  // Test 7: dryRun mode doesn't write state.json
  it('dryRun mode does not write state.json', async () => {
    const scaffoldDir = path.join(tmpDir, '.scaffold')
    fs.mkdirSync(scaffoldDir, { recursive: true })

    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: true,
    })

    const statePath = path.join(scaffoldDir, 'state.json')
    expect(fs.existsSync(statePath)).toBe(false)
    expect(result.mode).toBe('greenfield')
  })

  // Test 8: Detects Unity project (Assets/ with .meta files)
  it('detects Unity project when Assets/ contains .meta files', async () => {
    const assetsDir = path.join(tmpDir, 'Assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    fs.writeFileSync(path.join(assetsDir, 'foo.meta'), '')

    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.projectType).toBe('game')
    expect(result.gameConfig).toEqual({ engine: 'unity' })
  })

  // Test 9: Detects Unreal project (.uproject file)
  it('detects Unreal project when .uproject file exists', async () => {
    fs.writeFileSync(path.join(tmpDir, 'MyGame.uproject'), '{}')

    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.projectType).toBe('game')
    expect(result.gameConfig).toEqual({ engine: 'unreal' })
  })

  // Test 10: Detects Godot project (project.godot file)
  it('detects Godot project when project.godot exists', async () => {
    fs.writeFileSync(path.join(tmpDir, 'project.godot'), '[gd_scene]')

    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.projectType).toBe('game')
    expect(result.gameConfig).toEqual({ engine: 'godot' })
  })

  // Test 11: Non-game project returns no projectType
  it('returns no projectType for non-game project', async () => {
    // tmpDir is empty — no game engine files
    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.projectType).toBeUndefined()
    expect(result.gameConfig).toBeUndefined()
  })

  // Test 12: artifactsFound count matches detected artifacts
  it('artifactsFound count matches detected artifacts array length', async () => {
    const paths = ['docs/prd.md', 'docs/user-stories.md']
    for (const p of paths) {
      const full = path.join(tmpDir, p)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, '# content')
    }

    const metaPrompts = new Map([
      ['step-a', makeMetaPromptEntry('step-a', ['docs/prd.md'])],
      ['step-b', makeMetaPromptEntry('step-b', ['docs/user-stories.md'])],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as ReturnType<typeof discoverMetaPrompts>,
    )

    const result = await runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.artifactsFound).toBe(result.detectedArtifacts.length)
    expect(result.artifactsFound).toBe(2)
  })

  // Test 13: Unity wins precedence when multi-engine signatures coexist
  it('Unity wins precedence when multi-engine signatures coexist', async () => {
    // Regression test for Unity > Unreal > Godot precedence.
    // Fixture has Assets/*.meta + .uproject + project.godot simultaneously.
    // Pins existing inline logic in src/project/adopt.ts before Task 5
    // relocates detection to src/project/adopt/detectors/game.ts.
    const fixturePath = path.join(
      __dirname,
      '../../tests/fixtures/adopt/detectors/game/multi-engine',
    )

    const result = await runAdoption({
      projectRoot: fixturePath,
      metaPromptDir: path.join(fixturePath, 'content', 'pipeline'),
      methodology: 'deep',
      dryRun: true,
    })

    expect(result.projectType).toBe('game')
    expect(result.gameConfig).toEqual({ engine: 'unity' })
    // Unity must win because Assets/*.meta is detected first in adopt.ts:74-82
  })
})
