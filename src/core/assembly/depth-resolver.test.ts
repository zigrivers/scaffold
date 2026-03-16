import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDepth } from './depth-resolver.js'
import { loadPreset } from './preset-loader.js'
import type { ScaffoldConfig, MethodologyPreset, DepthLevel } from '../../types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(__dirname, '../../../tests/fixtures/methodology')

function makeConfig(overrides: Partial<ScaffoldConfig> = {}): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    ...overrides,
  }
}

function loadFixturePreset(name: string): MethodologyPreset {
  const { preset } = loadPreset(path.join(fixtureDir, `${name}.yml`), [])
  if (!preset) throw new Error(`Failed to load preset: ${name}`)
  return preset
}

describe('resolveDepth', () => {
  it('CLI flag overrides everything', () => {
    const preset = loadFixturePreset('deep')
    const config = makeConfig({
      custom: {
        default_depth: 2,
        steps: { 'create-prd': { depth: 4 } },
      },
    })

    const result = resolveDepth('create-prd', config, preset, 1 as DepthLevel)
    expect(result.depth).toBe(1)
    expect(result.provenance).toBe('cli-flag')
  })

  it('step-override used when no CLI flag', () => {
    const preset = loadFixturePreset('deep')
    const config = makeConfig({
      custom: {
        default_depth: 2,
        steps: { 'create-prd': { depth: 4 } },
      },
    })

    const result = resolveDepth('create-prd', config, preset)
    expect(result.depth).toBe(4)
    expect(result.provenance).toBe('step-override')
  })

  it('custom-default used when no step-override', () => {
    const preset = loadFixturePreset('deep')
    const config = makeConfig({
      custom: {
        default_depth: 2,
      },
    })

    const result = resolveDepth('create-prd', config, preset)
    expect(result.depth).toBe(2)
    expect(result.provenance).toBe('custom-default')
  })

  it('preset-default used when no custom config', () => {
    const preset = loadFixturePreset('deep')
    const config = makeConfig()

    const result = resolveDepth('create-prd', config, preset)
    expect(result.depth).toBe(5)
    expect(result.provenance).toBe('preset-default')
  })

  it('returns DepthLevel 1-5 (MVP preset default_depth is 1)', () => {
    const preset = loadFixturePreset('mvp')
    const config = makeConfig({ methodology: 'mvp' })

    const result = resolveDepth('create-prd', config, preset)
    expect(result.depth).toBe(1)
    expect(result.provenance).toBe('preset-default')
  })

  it('MVP preset uses default_depth 1', () => {
    const preset = loadFixturePreset('mvp')
    const config = makeConfig({ methodology: 'mvp' })

    const result = resolveDepth('user-stories', config, preset)
    expect(result.depth).toBe(1)
    expect(result.provenance).toBe('preset-default')
  })

  it('Deep preset uses default_depth 5', () => {
    const preset = loadFixturePreset('deep')
    const config = makeConfig()

    const result = resolveDepth('create-prd', config, preset)
    expect(result.depth).toBe(5)
    expect(result.provenance).toBe('preset-default')
  })

  it('step without override falls through to custom-default', () => {
    const preset = loadFixturePreset('deep')
    const config = makeConfig({
      custom: {
        default_depth: 3,
        steps: { 'review-prd': { depth: 2 } },
      },
    })

    // create-prd has no step override, so falls through to custom-default
    const result = resolveDepth('create-prd', config, preset)
    expect(result.depth).toBe(3)
    expect(result.provenance).toBe('custom-default')
  })
})
