import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import type { PartialConfigOverrides } from '../cli/init-flag-families.js'

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-coupling-'))
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
// Coupling validator tests
// ---------------------------------------------------------------------------

describe('adopt coupling validator enforcement', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // macos-native: distribution vs sandboxed
  // -------------------------------------------------------------------------

  it('macos-native: mac-app-store without sandboxed:true → ADOPT_CONFIG_COUPLING_VIOLATION', async () => {
    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'macos-native',
      // mac-app-store requires sandboxed:true — deliberately violate it
      flagOverrides: {
        type: 'macos-native',
        partial: { distribution: 'mac-app-store', sandboxed: false },
      } as unknown as PartialConfigOverrides,
    })

    expect(result.errors).toHaveLength(1)
    const err = result.errors[0]
    expect(err.code).toBe('ADOPT_CONFIG_COUPLING_VIOLATION')
    expect(err.message).toMatch(/macos-native/)
    expect(err.message).toMatch(/sandboxed/)
    expect(err.exitCode).toBe(1) // ExitCode.ValidationError
  })

  it('macos-native: mac-app-store + sandboxed unset (defaults false) → coupling error', async () => {
    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'macos-native',
      // distribution defaults to developer-id normally; we pass mac-app-store
      // without sandboxed — it defaults to false, which violates the coupling rule
      flagOverrides: {
        type: 'macos-native',
        partial: { distribution: 'mac-app-store' },
      } as unknown as PartialConfigOverrides,
    })

    expect(result.errors).toHaveLength(1)
    const err = result.errors[0]
    expect(err.code).toBe('ADOPT_CONFIG_COUPLING_VIOLATION')
    expect(err.message).toMatch(/sandboxed/)
  })

  it('macos-native: mac-app-store + sandboxed:true → succeeds', async () => {
    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'macos-native',
      flagOverrides: {
        type: 'macos-native',
        partial: { distribution: 'mac-app-store', sandboxed: true },
      } as unknown as PartialConfigOverrides,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.projectType).toBe('macos-native')
    expect(result.detectedConfig?.type).toBe('macos-native')
    expect(result.detectedConfig?.config).toMatchObject({
      distribution: 'mac-app-store',
      sandboxed: true,
    })
  })

  it('macos-native: developer-id distribution (no sandboxed constraint) → succeeds', async () => {
    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'macos-native',
      flagOverrides: {
        type: 'macos-native',
        partial: { distribution: 'developer-id' },
      } as unknown as PartialConfigOverrides,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.projectType).toBe('macos-native')
  })

  // -------------------------------------------------------------------------
  // ml: servingPattern coupling
  // -------------------------------------------------------------------------

  it('ml: inference projectPhase with servingPattern:none → ADOPT_CONFIG_COUPLING_VIOLATION', async () => {
    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'ml',
      flagOverrides: {
        type: 'ml',
        partial: { projectPhase: 'inference', servingPattern: 'none' },
      } as unknown as PartialConfigOverrides,
    })

    expect(result.errors).toHaveLength(1)
    const err = result.errors[0]
    expect(err.code).toBe('ADOPT_CONFIG_COUPLING_VIOLATION')
    expect(err.message).toMatch(/ml/)
    expect(err.message).toMatch(/serving/)
    expect(err.exitCode).toBe(1) // ExitCode.ValidationError
  })

  it('ml: valid inference + realtime serving → succeeds', async () => {
    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'ml',
      flagOverrides: {
        type: 'ml',
        partial: { projectPhase: 'inference', servingPattern: 'realtime' },
      } as unknown as PartialConfigOverrides,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.projectType).toBe('ml')
    expect(result.detectedConfig?.config).toMatchObject({
      projectPhase: 'inference',
      servingPattern: 'realtime',
    })
  })

  it('ml: training projectPhase with servingPattern:none → succeeds', async () => {
    const result = await runAdoption({
      ...baseOpts(tmpDir),
      explicitProjectType: 'ml',
      flagOverrides: {
        type: 'ml',
        partial: { projectPhase: 'training', servingPattern: 'none' },
      } as unknown as PartialConfigOverrides,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.projectType).toBe('ml')
  })
})
