// src/validation/config-validator.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { validateConfig } from './config-validator.js'

// ---------------------------------------------------------------------------
// Tmp directory management
// ---------------------------------------------------------------------------

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `scaffold-config-test-${crypto.randomUUID()}`)
  fs.mkdirSync(d, { recursive: true })
  tmpDirs.push(d)
  return d
}

function makeProjectRoot(configContent?: string | null): string {
  const root = makeTmpDir()
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  if (configContent !== undefined && configContent !== null) {
    fs.writeFileSync(path.join(root, '.scaffold', 'config.yml'), configContent, 'utf8')
  }
  return root
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateConfig', () => {
  // ---- Valid inputs ----

  describe('valid inputs', () => {
    it('returns no errors for a valid minimal config', () => {
      const root = makeProjectRoot('version: 2\nmethodology: mvp\nplatforms:\n  - claude-code\n')
      const result = validateConfig(root, [])
      expect(result.errors).toHaveLength(0)
    })

    it('returns no errors for a valid full config', () => {
      const root = makeProjectRoot('version: 2\nmethodology: deep\nplatforms:\n  - claude-code\n  - codex\n')
      const result = validateConfig(root, [])
      expect(result.errors).toHaveLength(0)
    })

    it('returns no errors and no warnings when no unknown fields present', () => {
      const root = makeProjectRoot('version: 2\nmethodology: mvp\nplatforms:\n  - claude-code\n')
      const result = validateConfig(root, [])
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })
  })

  // ---- Missing config file ----

  describe('missing config file', () => {
    it('returns CONFIG_MISSING error when config.yml does not exist', () => {
      const root = makeProjectRoot() // no config written
      const result = validateConfig(root, [])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('CONFIG_MISSING')
      expect(result.errors[0].exitCode).toBe(1)
    })
  })

  // ---- Empty config file ----

  describe('empty config file', () => {
    it('returns CONFIG_EMPTY error for an empty file', () => {
      const root = makeProjectRoot('')
      const result = validateConfig(root, [])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('CONFIG_EMPTY')
    })

    it('returns CONFIG_EMPTY error for whitespace-only file', () => {
      const root = makeProjectRoot('   \n  \n')
      const result = validateConfig(root, [])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('CONFIG_EMPTY')
    })
  })

  // ---- Parse errors ----

  describe('parse errors', () => {
    it('returns CONFIG_PARSE_ERROR for invalid YAML', () => {
      const root = makeProjectRoot(':\n  - invalid:\nyaml: [unterminated')
      const result = validateConfig(root, [])
      expect(result.errors.length).toBeGreaterThan(0)
      const hasParseError = result.errors.some(e => e.code === 'CONFIG_PARSE_ERROR')
      expect(hasParseError).toBe(true)
    })

    it('returns CONFIG_NOT_OBJECT for scalar YAML content', () => {
      const root = makeProjectRoot('just a string')
      const result = validateConfig(root, [])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('CONFIG_NOT_OBJECT')
    })

    it('returns CONFIG_NOT_OBJECT for array YAML content', () => {
      const root = makeProjectRoot('- one\n- two\n')
      const result = validateConfig(root, [])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('CONFIG_NOT_OBJECT')
    })
  })

  // ---- Version validation ----

  describe('version validation', () => {
    it('auto-migrates v1 config (version: 1)', () => {
      // v1 configs get auto-migrated — result depends on migration output
      const root = makeProjectRoot('version: 1\nmethodology: mvp\nplatforms:\n  - claude-code\n')
      const result = validateConfig(root, [])
      // Should either succeed or have specific field errors, not a version error
      const versionError = result.errors.find(e => e.code === 'FIELD_WRONG_TYPE' && e.context?.field === 'version')
      expect(versionError).toBeUndefined()
    })

    it('auto-migrates config with no version field', () => {
      const root = makeProjectRoot('methodology: mvp\nplatforms:\n  - claude-code\n')
      const result = validateConfig(root, [])
      // no version field = treated as v1, auto-migrated
      const versionError = result.errors.find(e => e.code === 'FIELD_WRONG_TYPE' && e.context?.field === 'version')
      expect(versionError).toBeUndefined()
    })

    it('returns FIELD_WRONG_TYPE for unsupported version (e.g. version: 3)', () => {
      const root = makeProjectRoot('version: 3\nmethodology: mvp\nplatforms:\n  - claude-code\n')
      const result = validateConfig(root, [])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('FIELD_WRONG_TYPE')
    })
  })

  // ---- Required field validation ----

  describe('required field validation', () => {
    it('returns FIELD_MISSING when methodology is missing', () => {
      const root = makeProjectRoot('version: 2\nplatforms:\n  - claude-code\n')
      const result = validateConfig(root, [])
      const methodologyError = result.errors.find(
        e => e.code === 'FIELD_MISSING' && e.context?.field === 'methodology',
      )
      expect(methodologyError).toBeDefined()
    })

    it('returns FIELD_MISSING when platforms is missing', () => {
      const root = makeProjectRoot('version: 2\nmethodology: mvp\n')
      const result = validateConfig(root, [])
      const platformsError = result.errors.find(
        e => e.code === 'FIELD_MISSING' && e.context?.field === 'platforms',
      )
      expect(platformsError).toBeDefined()
    })

    it('returns FIELD_EMPTY_VALUE when platforms is empty array', () => {
      const root = makeProjectRoot('version: 2\nmethodology: mvp\nplatforms: []\n')
      const result = validateConfig(root, [])
      const emptyError = result.errors.find(e => e.code === 'FIELD_EMPTY_VALUE')
      expect(emptyError).toBeDefined()
    })

    it('accumulates multiple field errors', () => {
      const root = makeProjectRoot('version: 2\n')
      const result = validateConfig(root, [])
      // Missing both methodology and platforms
      expect(result.errors.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ---- Invalid methodology ----

  describe('invalid methodology', () => {
    it('returns FIELD_INVALID_METHODOLOGY for unknown methodology', () => {
      const root = makeProjectRoot('version: 2\nmethodology: extreme\nplatforms:\n  - claude-code\n')
      const result = validateConfig(root, [])
      const methodError = result.errors.find(e => e.code === 'FIELD_INVALID_METHODOLOGY')
      expect(methodError).toBeDefined()
    })
  })

  // ---- Unknown field warnings ----

  describe('unknown field warnings', () => {
    it('returns CONFIG_UNKNOWN_FIELD warning for unrecognized top-level keys', () => {
      const root = makeProjectRoot('version: 2\nmethodology: mvp\nplatforms:\n  - claude-code\nfuture_feature: true\n')
      const result = validateConfig(root, [])
      expect(result.errors).toHaveLength(0)
      const unknownWarning = result.warnings.find(w => w.code === 'CONFIG_UNKNOWN_FIELD')
      expect(unknownWarning).toBeDefined()
      expect(unknownWarning?.context?.field).toBe('future_feature')
    })
  })

  // ---- Cross-field validation (custom methodology + steps) ----

  describe('cross-field validation', () => {
    it('returns FIELD_INVALID_VALUE for unknown step in custom.steps', () => {
      const root = makeProjectRoot(
        'version: 2\nmethodology: custom\nplatforms:\n  - claude-code\n'
        + 'custom:\n  steps:\n    nonexistent-step:\n      enabled: true\n',
      )
      const result = validateConfig(root, ['known-step-a', 'known-step-b'])
      const invalidStep = result.errors.find(
        e => e.code === 'FIELD_INVALID_VALUE' && e.context?.value === 'nonexistent-step',
      )
      expect(invalidStep).toBeDefined()
    })

    it('no error for valid step names in custom.steps', () => {
      const root = makeProjectRoot(
        'version: 2\nmethodology: custom\nplatforms:\n  - claude-code\ncustom:\n  steps:\n    my-step:\n      enabled: true\n',
      )
      const result = validateConfig(root, ['my-step'])
      const invalidStep = result.errors.find(e => e.code === 'FIELD_INVALID_VALUE')
      expect(invalidStep).toBeUndefined()
    })

    it('skips cross-field validation when knownSteps is empty', () => {
      const root = makeProjectRoot(
        'version: 2\nmethodology: custom\nplatforms:\n  - claude-code\ncustom:\n  steps:\n    anything:\n      enabled: true\n',
      )
      const result = validateConfig(root, [])
      // With empty knownSteps, cross-field validation is skipped
      const invalidStep = result.errors.find(e => e.code === 'FIELD_INVALID_VALUE')
      expect(invalidStep).toBeUndefined()
    })
  })

  // ---- Edge cases ----

  describe('edge cases', () => {
    it('handles nonexistent project root directory', () => {
      const result = validateConfig('/nonexistent/path/that/does/not/exist', [])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('CONFIG_MISSING')
    })

    it('returns errors array and warnings array (never undefined)', () => {
      const root = makeProjectRoot('version: 2\nmethodology: mvp\nplatforms:\n  - claude-code\n')
      const result = validateConfig(root, [])
      expect(Array.isArray(result.errors)).toBe(true)
      expect(Array.isArray(result.warnings)).toBe(true)
    })
  })
})
