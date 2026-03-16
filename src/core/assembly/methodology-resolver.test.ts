import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveEnablement } from './methodology-resolver.js'
import { loadPreset } from './preset-loader.js'
import type { ScaffoldConfig, MethodologyPreset } from '../../types/index.js'

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

describe('resolveEnablement', () => {
  it('preset-default returns enabled from preset', () => {
    const preset = loadFixturePreset('deep')
    const config = makeConfig()

    const result = resolveEnablement('create-prd', config, preset)
    expect(result.enabled).toBe(true)
    expect(result.provenance).toBe('preset-default')
  })

  it('custom-override takes precedence over preset', () => {
    const preset = loadFixturePreset('deep')
    const config = makeConfig({
      custom: {
        steps: { 'create-prd': { enabled: false } },
      },
    })

    const result = resolveEnablement('create-prd', config, preset)
    expect(result.enabled).toBe(false)
    expect(result.provenance).toBe('custom-override')
  })

  it('custom-override can enable a step', () => {
    // Use a step that doesn't exist in mvp preset, then enable via custom
    const preset = loadFixturePreset('mvp')
    const config = makeConfig({
      methodology: 'mvp',
      custom: {
        steps: { 'review-prd': { enabled: true } },
      },
    })

    const result = resolveEnablement('review-prd', config, preset)
    expect(result.enabled).toBe(true)
    expect(result.provenance).toBe('custom-override')
  })

  it('step not in preset returns enabled=false', () => {
    const preset = loadFixturePreset('mvp')
    const config = makeConfig({ methodology: 'mvp' })

    // 'domain-modeling' not in mvp.yml fixture
    const result = resolveEnablement('domain-modeling', config, preset)
    expect(result.enabled).toBe(false)
    expect(result.provenance).toBe('preset-default')
  })

  it('MVP preset: create-prd enabled, domain-modeling disabled', () => {
    const preset = loadFixturePreset('mvp')
    const config = makeConfig({ methodology: 'mvp' })

    const createPrdResult = resolveEnablement('create-prd', config, preset)
    expect(createPrdResult.enabled).toBe(true)
    expect(createPrdResult.provenance).toBe('preset-default')

    const domainModelingResult = resolveEnablement('domain-modeling', config, preset)
    expect(domainModelingResult.enabled).toBe(false)
    expect(domainModelingResult.provenance).toBe('preset-default')
  })

  it('review-prd is enabled in deep preset', () => {
    const preset = loadFixturePreset('deep')
    const config = makeConfig()

    const result = resolveEnablement('review-prd', config, preset)
    expect(result.enabled).toBe(true)
    expect(result.provenance).toBe('preset-default')
  })

  it('step not in any preset returns enabled=false with preset-default provenance', () => {
    const preset = loadFixturePreset('deep')
    const config = makeConfig()

    const result = resolveEnablement('nonexistent-step', config, preset)
    expect(result.enabled).toBe(false)
    expect(result.provenance).toBe('preset-default')
  })
})
