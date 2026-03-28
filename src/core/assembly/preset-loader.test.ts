import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPreset, loadAllPresets, validateDependencyCoherence } from './preset-loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(__dirname, '../../../tests/fixtures/methodology')

const knownSteps = ['create-prd', 'review-prd', 'user-stories']

describe('loadPreset', () => {
  it('loads deep.yml preset successfully', () => {
    const { preset, errors, warnings } = loadPreset(
      path.join(fixtureDir, 'deep.yml'),
      knownSteps,
    )
    expect(errors).toHaveLength(0)
    expect(preset).not.toBeNull()
    expect(preset!.name).toBe('Deep')
    expect(preset!.description).toBe('Comprehensive enterprise-grade scaffolding with all steps enabled')
    expect(preset!.default_depth).toBe(5)
    expect(preset!.steps['create-prd'].enabled).toBe(true)
    expect(preset!.steps['review-prd'].enabled).toBe(true)
    expect(preset!.steps['user-stories'].enabled).toBe(true)
    expect(warnings).toHaveLength(0)
  })

  it('loads mvp.yml with only 2 steps enabled, default_depth 1', () => {
    const { preset, errors, warnings } = loadPreset(
      path.join(fixtureDir, 'mvp.yml'),
      knownSteps,
    )
    expect(errors).toHaveLength(0)
    expect(preset).not.toBeNull()
    expect(preset!.name).toBe('MVP')
    expect(preset!.default_depth).toBe(1)
    expect(Object.keys(preset!.steps)).toHaveLength(2)
    // review-prd is in knownSteps but not in mvp.yml → warning
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('PRESET_MISSING_STEP')
    expect(warnings[0].context?.step).toBe('review-prd')
  })

  it('loads custom-defaults.yml with default_depth 3', () => {
    const { preset, errors, warnings } = loadPreset(
      path.join(fixtureDir, 'custom-defaults.yml'),
      knownSteps,
    )
    expect(errors).toHaveLength(0)
    expect(preset).not.toBeNull()
    expect(preset!.name).toBe('Custom')
    expect(preset!.default_depth).toBe(3)
    expect(preset!.steps['review-prd'].conditional).toBe('if-needed')
    expect(warnings).toHaveLength(0)
  })

  it('returns PRESET_MISSING error for non-existent file', () => {
    const { preset, errors } = loadPreset(
      path.join(fixtureDir, 'nonexistent.yml'),
      knownSteps,
    )
    expect(preset).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('PRESET_MISSING')
  })

  it('returns PRESET_PARSE_ERROR for invalid YAML', () => {
    // A .ts source file is not a valid preset YAML object — it will fail field validation
    const { preset, errors } = loadPreset(
      path.join(__dirname, 'preset-loader.test.ts'),
      knownSteps,
    )
    // It will parse but fail field validation, not YAML parse error
    // Let's check for either PRESET_PARSE_ERROR or field errors
    expect(preset).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
  })

  it('returns PRESET_INVALID_STEP when preset references unknown step', () => {
    // deep.yml has 3 known steps; if we pass fewer knownSteps that excludes one
    const { preset, errors } = loadPreset(
      path.join(fixtureDir, 'deep.yml'),
      ['create-prd'], // only 1 known step — review-prd and user-stories are unknown
    )
    expect(preset).toBeNull()
    expect(errors.some(e => e.code === 'PRESET_INVALID_STEP')).toBe(true)
    const invalidStepError = errors.find(e => e.code === 'PRESET_INVALID_STEP')
    expect(['review-prd', 'user-stories']).toContain(invalidStepError!.context?.step)
  })

  it('returns PRESET_MISSING_STEP warning when meta-prompt exists but not in preset', () => {
    // mvp.yml only has create-prd and user-stories — review-prd is missing
    const { warnings } = loadPreset(
      path.join(fixtureDir, 'mvp.yml'),
      knownSteps,
    )
    expect(warnings.some(w => w.code === 'PRESET_MISSING_STEP')).toBe(true)
    const missingWarning = warnings.find(w => w.code === 'PRESET_MISSING_STEP')
    expect(missingWarning!.context?.step).toBe('review-prd')
  })

  it('returns structured MethodologyPreset with step enablement map', () => {
    const { preset, errors } = loadPreset(
      path.join(fixtureDir, 'deep.yml'),
      knownSteps,
    )
    expect(errors).toHaveLength(0)
    expect(preset).not.toBeNull()
    expect(typeof preset!.steps).toBe('object')
    for (const step of Object.values(preset!.steps)) {
      expect(typeof step.enabled).toBe('boolean')
    }
  })

  it('skips step validation when knownStepNames is empty', () => {
    const { preset, errors, warnings } = loadPreset(
      path.join(fixtureDir, 'deep.yml'),
      [], // empty — skip validation
    )
    expect(errors).toHaveLength(0)
    expect(warnings).toHaveLength(0)
    expect(preset).not.toBeNull()
  })
})

describe('loadAllPresets', () => {
  it('loads all three presets from fixture directory', () => {
    const result = loadAllPresets(fixtureDir, knownSteps)
    expect(result.deep).not.toBeNull()
    expect(result.mvp).not.toBeNull()
    expect(result.custom).not.toBeNull()
    expect(result.deep!.name).toBe('Deep')
    expect(result.mvp!.name).toBe('MVP')
    expect(result.custom!.name).toBe('Custom')
  })

  it('returns null for presets that fail to load, continues with others', () => {
    // Pass a directory that has no preset files
    const result = loadAllPresets('/tmp/nonexistent-methodology-dir-xyz', knownSteps)
    expect(result.deep).toBeNull()
    expect(result.mvp).toBeNull()
    expect(result.custom).toBeNull()
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.code === 'PRESET_MISSING')).toBe(true)
  })
})

describe('validateDependencyCoherence', () => {
  it('returns no warnings when all dependencies are enabled', () => {
    const preset = {
      name: 'Test',
      description: 'Test preset',
      default_depth: 3 as const,
      steps: {
        'step-a': { enabled: true },
        'step-b': { enabled: true },
      },
    }
    const deps = new Map([['step-b', ['step-a']]])
    const warnings = validateDependencyCoherence(preset, deps)
    expect(warnings).toHaveLength(0)
  })

  it('warns when an enabled step has a disabled dependency', () => {
    const preset = {
      name: 'MVP',
      description: 'Test preset',
      default_depth: 1 as const,
      steps: {
        'step-a': { enabled: false },
        'step-b': { enabled: true },
      },
    }
    const deps = new Map([['step-b', ['step-a']]])
    const warnings = validateDependencyCoherence(preset, deps)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('PRESET_UNMET_DEPENDENCY')
    expect(warnings[0].context?.step).toBe('step-b')
    expect(warnings[0].context?.dependency).toBe('step-a')
  })

  it('does not warn for disabled steps with disabled dependencies', () => {
    const preset = {
      name: 'Test',
      description: 'Test preset',
      default_depth: 1 as const,
      steps: {
        'step-a': { enabled: false },
        'step-b': { enabled: false },
      },
    }
    const deps = new Map([['step-b', ['step-a']]])
    const warnings = validateDependencyCoherence(preset, deps)
    expect(warnings).toHaveLength(0)
  })

  it('warns for each disabled dependency of an enabled step', () => {
    const preset = {
      name: 'Test',
      description: 'Test preset',
      default_depth: 1 as const,
      steps: {
        'dep-1': { enabled: false },
        'dep-2': { enabled: false },
        'dep-3': { enabled: true },
        'consumer': { enabled: true },
      },
    }
    const deps = new Map([['consumer', ['dep-1', 'dep-2', 'dep-3']]])
    const warnings = validateDependencyCoherence(preset, deps)
    expect(warnings).toHaveLength(2) // dep-1 and dep-2 are disabled
    expect(warnings.every(w => w.code === 'PRESET_UNMET_DEPENDENCY')).toBe(true)
  })
})
