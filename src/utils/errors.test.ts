import { describe, it, expect } from 'vitest'
import {
  configMissing,
  configUnknownField,
  lockHeld,
  fieldInvalidMethodology,
  psmAlreadyInProgress,
  configEmpty,
  configParseError,
  configNotObject,
  fieldMissing,
  fieldWrongType,
  fieldEmptyValue,
  fieldInvalidDepth,
  frontmatterMissing,
  frontmatterUnclosed,
  frontmatterYamlError,
  frontmatterNameInvalid,
  frontmatterUnknownField,
  stateSchemaVersion,
  stateMissing,
  stateParseError,
  lockWriteFailed,
  lockStaleCleared,
  decisionParseError,
  presetMissing,
  presetParseError,
  presetInvalidStep,
  presetMissingStep,
  type ScaffoldError,
  type ScaffoldWarning,
} from './errors.js'

describe('error factories — shape', () => {
  it('all error objects have code, message, exitCode', () => {
    const errors: ScaffoldError[] = [
      configMissing('/path/config.yml'),
      configEmpty('/path/config.yml'),
      configParseError('/path/config.yml', 'bad yaml'),
      configNotObject('/path/config.yml'),
      fieldMissing('name', '/path/config.yml'),
      fieldWrongType('depth', 'number', 'string', '/path'),
      fieldEmptyValue('name', '/path'),
      fieldInvalidDepth(0, '/path'),
      fieldInvalidMethodology('deap', 'deep', '/path'),
      frontmatterMissing('/path/cmd.md'),
      frontmatterUnclosed('/path/cmd.md'),
      frontmatterYamlError('/path/cmd.md', 'bad yaml'),
      frontmatterNameInvalid('Bad Name', '/path/cmd.md'),
      stateSchemaVersion(1, 2, '/path/state.json'),
      stateMissing('/path/state.json'),
      stateParseError('/path/state.json', 'bad json'),
      psmAlreadyInProgress('step-b', 'step-a'),
      lockHeld('host', 1234, 'run'),
      lockWriteFailed('/path/lock', 'permission denied'),
      decisionParseError('/path/decisions.md', 10, 'bad entry'),
      presetMissing('mvp', '/path/preset.yml'),
      presetParseError('/path/preset.yml', 'bad yaml'),
      presetInvalidStep('unknown-step', 'mvp'),
    ]

    for (const err of errors) {
      expect(err).toHaveProperty('code')
      expect(err).toHaveProperty('message')
      expect(err).toHaveProperty('exitCode')
      expect(typeof err.code).toBe('string')
      expect(typeof err.message).toBe('string')
      expect(typeof err.exitCode).toBe('number')
    }
  })

  it('all warning objects have code and message but no exitCode', () => {
    const warnings: ScaffoldWarning[] = [
      configUnknownField('foo', '/path'),
      frontmatterUnknownField('bar', '/path/cmd.md'),
      lockStaleCleared('host', 1234),
      presetMissingStep('step-x', 'mvp'),
    ]

    for (const warn of warnings) {
      expect(warn).toHaveProperty('code')
      expect(warn).toHaveProperty('message')
      expect(warn).not.toHaveProperty('exitCode')
    }
  })
})

describe('configMissing', () => {
  it('returns CONFIG_MISSING with exitCode 1', () => {
    const err = configMissing('/path/config.yml')
    expect(err.code).toBe('CONFIG_MISSING')
    expect(err.exitCode).toBe(1)
  })
})

describe('configUnknownField', () => {
  it('returns CONFIG_UNKNOWN_FIELD warning with no exitCode', () => {
    const warn = configUnknownField('foo', '/path')
    expect(warn.code).toBe('CONFIG_UNKNOWN_FIELD')
    expect((warn as unknown as Record<string, unknown>)['exitCode']).toBeUndefined()
  })
})

describe('lockHeld', () => {
  it('returns LOCK_HELD with exitCode 3', () => {
    const err = lockHeld('host', 1234, 'run')
    expect(err.code).toBe('LOCK_HELD')
    expect(err.exitCode).toBe(3)
  })
})

describe('fieldInvalidMethodology', () => {
  it('includes "Did you mean" in recovery when suggestion is provided', () => {
    const err = fieldInvalidMethodology('deap', 'deep', '/path')
    expect(err.recovery).toContain('Did you mean')
  })

  it('does not include "Did you mean" in recovery when suggestion is null', () => {
    const err = fieldInvalidMethodology('xyz', null, '/path')
    expect(err.recovery).not.toContain('Did you mean')
  })
})

describe('psmAlreadyInProgress', () => {
  it('returns PSM_ALREADY_IN_PROGRESS with exitCode 3', () => {
    const err = psmAlreadyInProgress('step-b', 'step-a')
    expect(err.code).toBe('PSM_ALREADY_IN_PROGRESS')
    expect(err.exitCode).toBe(3)
  })
})
