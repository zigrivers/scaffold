import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

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
  it('returns greenfield mode for empty directory', () => {
    mockDetectProjectMode.mockReturnValue({
      mode: 'greenfield',
      signals: [],
      methodologySuggestion: 'deep',
      sourceFileCount: 0,
    })

    const result = runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.mode).toBe('greenfield')
  })

  // Test 2: Detects artifact when produces path exists on disk
  it('detects artifact when output path exists on disk', () => {
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

    const result = runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.detectedArtifacts).toHaveLength(1)
    expect(result.detectedArtifacts[0].artifactPath).toBe(artifactPath)
    expect(result.detectedArtifacts[0].matchedStep).toBe('product-requirements')
  })

  // Test 3: Strategy is 'skip-recommended' when all outputs found
  it('uses skip-recommended strategy when all outputs found', () => {
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

    const result = runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    for (const artifact of result.detectedArtifacts) {
      expect(artifact.strategy).toBe('skip-recommended')
    }
  })

  // Test 4: Strategy is 'context-only' when only some outputs found
  it('uses context-only strategy when only some outputs found', () => {
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

    const result = runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.detectedArtifacts).toHaveLength(1)
    expect(result.detectedArtifacts[0].strategy).toBe('context-only')
  })

  // Test 5: stepsCompleted includes matched steps
  it('stepsCompleted includes matched steps', () => {
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

    const result = runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.stepsCompleted).toContain('product-requirements')
    expect(result.stepsCompleted).not.toContain('user-stories')
  })

  // Test 6: stepsRemaining includes unmatched steps
  it('stepsRemaining includes unmatched steps', () => {
    const metaPrompts = new Map([
      ['product-requirements', makeMetaPromptEntry('product-requirements', ['docs/prd.md'])],
      ['user-stories', makeMetaPromptEntry('user-stories', ['docs/user-stories.md'])],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as ReturnType<typeof discoverMetaPrompts>,
    )

    const result = runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.stepsRemaining).toContain('product-requirements')
    expect(result.stepsRemaining).toContain('user-stories')
  })

  // Test 7: dryRun mode doesn't write state.json
  it('dryRun mode does not write state.json', () => {
    const scaffoldDir = path.join(tmpDir, '.scaffold')
    fs.mkdirSync(scaffoldDir, { recursive: true })

    const result = runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'pipeline'),
      methodology: 'deep',
      dryRun: true,
    })

    const statePath = path.join(scaffoldDir, 'state.json')
    expect(fs.existsSync(statePath)).toBe(false)
    expect(result.mode).toBe('greenfield')
  })

  // Test 8: artifactsFound count matches detected artifacts
  it('artifactsFound count matches detected artifacts array length', () => {
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

    const result = runAdoption({
      projectRoot: tmpDir,
      metaPromptDir: path.join(tmpDir, 'pipeline'),
      methodology: 'deep',
      dryRun: false,
    })

    expect(result.artifactsFound).toBe(result.detectedArtifacts.length)
    expect(result.artifactsFound).toBe(2)
  })
})
