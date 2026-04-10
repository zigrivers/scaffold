import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Hoisted mocks — needed because runAdoption calls detectProjectMode and
// discoverMetaPrompts. We mock at the paths that adopt.ts imports from.
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
import { buildFlagOverrides, applyFlagFamilyValidation } from '../init-flag-families.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-flags-'))
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

describe('adopt CLI flag integration', () => {
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

  // -------------------------------------------------------------------------
  // buildFlagOverrides unit-level integration
  // -------------------------------------------------------------------------

  it('buildFlagOverrides returns undefined when no family flags present', () => {
    expect(buildFlagOverrides({})).toBeUndefined()
  })

  it('--backend-api-style graphql produces correct override shape', () => {
    const overrides = buildFlagOverrides({ 'backend-api-style': 'graphql' })
    expect(overrides?.type).toBe('backend')
    expect(overrides?.partial).toEqual(expect.objectContaining({ apiStyle: 'graphql' }))
  })

  it('--web-rendering ssr produces web-app override with renderingStrategy', () => {
    const overrides = buildFlagOverrides({ 'web-rendering': 'ssr' })
    expect(overrides?.type).toBe('web-app')
    expect(overrides?.partial).toEqual(expect.objectContaining({ renderingStrategy: 'ssr' }))
  })

  it('--engine unity produces game override with engine', () => {
    const overrides = buildFlagOverrides({ engine: 'unity' })
    expect(overrides?.type).toBe('game')
    expect(overrides?.partial).toEqual(expect.objectContaining({ engine: 'unity' }))
  })

  it('--ml-phase training produces ml override with projectPhase', () => {
    const overrides = buildFlagOverrides({ 'ml-phase': 'training' })
    expect(overrides?.type).toBe('ml')
    expect(overrides?.partial).toEqual(expect.objectContaining({ projectPhase: 'training' }))
  })

  it('--mobile-platform ios produces mobile-app override', () => {
    const overrides = buildFlagOverrides({ 'mobile-platform': 'ios' })
    expect(overrides?.type).toBe('mobile-app')
    expect(overrides?.partial).toEqual(expect.objectContaining({ platform: 'ios' }))
  })

  it('--ext-manifest 3 produces browser-extension override', () => {
    const overrides = buildFlagOverrides({ 'ext-manifest': '3' })
    expect(overrides?.type).toBe('browser-extension')
    expect(overrides?.partial).toEqual(expect.objectContaining({ manifestVersion: '3' }))
  })

  it('--pipeline-processing streaming produces data-pipeline override', () => {
    const overrides = buildFlagOverrides({ 'pipeline-processing': 'streaming' })
    expect(overrides?.type).toBe('data-pipeline')
    expect(overrides?.partial).toEqual(expect.objectContaining({ processingModel: 'streaming' }))
  })

  it('--lib-visibility public produces library override', () => {
    const overrides = buildFlagOverrides({ 'lib-visibility': 'public' })
    expect(overrides?.type).toBe('library')
    expect(overrides?.partial).toEqual(expect.objectContaining({ visibility: 'public' }))
  })

  it('--cli-interactivity hybrid produces cli override', () => {
    const overrides = buildFlagOverrides({ 'cli-interactivity': 'hybrid' })
    expect(overrides?.type).toBe('cli')
    expect(overrides?.partial).toEqual(expect.objectContaining({ interactivity: 'hybrid' }))
  })

  // -------------------------------------------------------------------------
  // Validation — mixed families and project-type mismatches
  // -------------------------------------------------------------------------

  it('mixed family flags throw during validation', () => {
    const argv = { 'web-rendering': 'ssr', 'backend-api-style': 'rest' }
    expect(() => applyFlagFamilyValidation(argv)).toThrow(/Cannot mix flags/)
  })

  it('--web-rendering with --project-type backend throws', () => {
    const argv = { 'project-type': 'backend', 'web-rendering': 'ssr' }
    expect(() => applyFlagFamilyValidation(argv)).toThrow(/--web-\* flags require --project-type web-app/)
  })

  it('--backend-api-style with --project-type web-app throws', () => {
    const argv = { 'project-type': 'web-app', 'backend-api-style': 'rest' }
    expect(() => applyFlagFamilyValidation(argv)).toThrow(/--backend-\* flags require --project-type backend/)
  })

  it('game flags with --project-type cli throws', () => {
    const argv = { 'project-type': 'cli', engine: 'unity' }
    expect(() => applyFlagFamilyValidation(argv)).toThrow(/Game flags .* require --project-type game/)
  })

  // -------------------------------------------------------------------------
  // Flag overrides flow through runAdoption
  // -------------------------------------------------------------------------

  it('--engine unity override flows through to runAdoption result', async () => {
    const dir = tracked(makeTmpProject({
      'Assets/foo.meta': '',
    }))
    const overrides = buildFlagOverrides({ engine: 'godot' })
    const result = await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(dir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: true,
      verbose: false,
      explicitProjectType: 'game',
      flagOverrides: overrides,
    })
    // Detection finds unity (Assets/.meta) but flag override says godot
    expect(result.projectType).toBe('game')
    expect((result.detectedConfig?.config as Record<string, unknown>)?.engine).toBe('godot')
  })

  it('--backend-api-style graphql with --project-type backend sets apiStyle', async () => {
    const dir = tracked(makeTmpProject({}))
    const overrides = buildFlagOverrides({ 'backend-api-style': 'graphql' })
    const result = await runAdoption({
      projectRoot: dir,
      metaPromptDir: path.join(dir, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: true,
      verbose: false,
      explicitProjectType: 'backend',
      flagOverrides: overrides,
    })
    expect(result.projectType).toBe('backend')
    expect((result.detectedConfig?.config as Record<string, unknown>)?.apiStyle).toBe('graphql')
  })
})
