// src/validation/state-validator.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { validateState } from './state-validator.js'
import { ExitCode } from '../types/index.js'

// ---------------------------------------------------------------------------
// Tmp directory management
// ---------------------------------------------------------------------------

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `scaffold-state-test-${crypto.randomUUID()}`)
  fs.mkdirSync(d, { recursive: true })
  tmpDirs.push(d)
  return d
}

function makeProjectRoot(stateContent?: string | null): string {
  const root = makeTmpDir()
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  if (stateContent !== undefined && stateContent !== null) {
    fs.writeFileSync(path.join(root, '.scaffold', 'state.json'), stateContent, 'utf8')
  }
  return root
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Valid state fixture
// ---------------------------------------------------------------------------

const validState = JSON.stringify({
  'schema-version': 1,
  'scaffold-version': '2.0.0',
  init_methodology: 'mvp',
  config_methodology: 'mvp',
  'init-mode': 'greenfield',
  created: '2024-01-01T00:00:00.000Z',
  in_progress: null,
  steps: {},
  next_eligible: [],
  'extra-steps': [],
})

function makeState(overrides: Record<string, unknown> = {}): string {
  const base = JSON.parse(validState)
  return JSON.stringify({ ...base, ...overrides })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateState', () => {
  // ---- Valid inputs ----

  describe('valid inputs', () => {
    it('returns no errors for a valid state file', () => {
      const root = makeProjectRoot(validState)
      const result = validateState(root)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    it('returns no errors for valid state with completed steps', () => {
      const state = makeState({
        steps: {
          'create-prd': { status: 'completed', completedAt: '2024-01-01' },
          'design-system': { status: 'pending' },
          'code-review': { status: 'skipped' },
        },
      })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors).toHaveLength(0)
    })

    it('accepts all valid status values', () => {
      const state = makeState({
        steps: {
          'step-pending': { status: 'pending' },
          'step-in-progress': { status: 'in_progress' },
          'step-completed': { status: 'completed' },
          'step-skipped': { status: 'skipped' },
        },
      })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors).toHaveLength(0)
    })
  })

  // ---- Missing state file ----

  describe('missing state file', () => {
    it('returns STATE_MISSING error when state.json does not exist', () => {
      const root = makeProjectRoot() // no state file written
      const result = validateState(root)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('STATE_MISSING')
      expect(result.errors[0].exitCode).toBe(ExitCode.ValidationError)
      expect(result.errors[0].recovery).toContain('scaffold init')
    })

    it('returns STATE_MISSING with correct file path in context', () => {
      const root = makeProjectRoot()
      const result = validateState(root)
      const expectedPath = path.join(root, '.scaffold', 'state.json')
      expect(result.errors[0].context?.file).toBe(expectedPath)
    })

    it('short-circuits after STATE_MISSING (no further validation)', () => {
      const root = makeProjectRoot()
      const result = validateState(root)
      expect(result.errors).toHaveLength(1) // Only the one error
      expect(result.warnings).toHaveLength(0)
    })
  })

  // ---- Parse errors ----

  describe('parse errors', () => {
    it('returns STATE_PARSE_ERROR for invalid JSON', () => {
      const root = makeProjectRoot('{ not valid json }}}')
      const result = validateState(root)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('STATE_PARSE_ERROR')
      expect(result.errors[0].exitCode).toBe(ExitCode.StateCorruption)
    })

    it('returns STATE_PARSE_ERROR for empty string content', () => {
      const root = makeProjectRoot('')
      const result = validateState(root)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('STATE_PARSE_ERROR')
    })

    it('short-circuits after parse error (no further validation)', () => {
      const root = makeProjectRoot('not json at all')
      const result = validateState(root)
      expect(result.errors).toHaveLength(1)
      expect(result.warnings).toHaveLength(0)
    })
  })

  // ---- Schema version validation ----

  describe('schema version validation', () => {
    it('returns STATE_SCHEMA_VERSION error when version is not 1', () => {
      const state = makeState({ 'schema-version': 2 })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('STATE_SCHEMA_VERSION')
      expect(result.errors[0].exitCode).toBe(ExitCode.StateCorruption)
    })

    it('returns STATE_SCHEMA_VERSION for version 0', () => {
      const state = makeState({ 'schema-version': 0 })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors[0].code).toBe('STATE_SCHEMA_VERSION')
    })

    it('returns STATE_SCHEMA_VERSION when schema-version is missing (undefined)', () => {
      const base = JSON.parse(validState)
      delete base['schema-version']
      const root = makeProjectRoot(JSON.stringify(base))
      const result = validateState(root)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('STATE_SCHEMA_VERSION')
    })

    it('returns STATE_SCHEMA_VERSION when schema-version is a string', () => {
      const state = makeState({ 'schema-version': '1' })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('STATE_SCHEMA_VERSION')
    })

    it('short-circuits after schema version error', () => {
      const state = makeState({ 'schema-version': 99 })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors).toHaveLength(1)
    })
  })

  // ---- Invalid step statuses ----

  describe('invalid step statuses', () => {
    it('returns FIELD_INVALID_VALUE for step with invalid status', () => {
      const state = makeState({
        steps: {
          'bad-step': { status: 'unknown-status' },
        },
      })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('FIELD_INVALID_VALUE')
      expect(result.errors[0].message).toContain('bad-step')
      expect(result.errors[0].message).toContain('unknown-status')
      expect(result.errors[0].exitCode).toBe(ExitCode.ValidationError)
    })

    it('returns errors for multiple steps with invalid statuses', () => {
      const state = makeState({
        steps: {
          'step-a': { status: 'invalid-a' },
          'step-b': { status: 'invalid-b' },
          'step-c': { status: 'completed' }, // valid
        },
      })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors).toHaveLength(2) // Only two invalid ones
    })

    it('includes recovery hint listing valid statuses', () => {
      const state = makeState({
        steps: {
          'bad-step': { status: 'garbage' },
        },
      })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors[0].recovery).toContain('pending')
      expect(result.errors[0].recovery).toContain('completed')
      expect(result.errors[0].recovery).toContain('skipped')
      expect(result.errors[0].recovery).toContain('in_progress')
    })

    it('includes context with field path and value', () => {
      const state = makeState({
        steps: {
          'my-step': { status: 'bad-value' },
        },
      })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors[0].context?.field).toBe('steps.my-step.status')
      expect(result.errors[0].context?.value).toBe('bad-value')
    })
  })

  // ---- in_progress warning ----

  describe('in_progress warning', () => {
    it('warns when in_progress is non-null', () => {
      const state = makeState({
        in_progress: { step: 'create-prd', started: '2024-01-01' },
      })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0].code).toBe('STATE_IN_PROGRESS')
      expect(result.warnings[0].message).toContain('create-prd')
    })

    it('does not warn when in_progress is null', () => {
      const state = makeState({ in_progress: null })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.warnings).toHaveLength(0)
    })

    it('uses "unknown" when in_progress.step is not a string', () => {
      const state = makeState({
        in_progress: { started: '2024-01-01' }, // no step field
      })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0].message).toContain('unknown')
    })

    it('includes context with file and step', () => {
      const state = makeState({
        in_progress: { step: 'my-step' },
      })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.warnings[0].context?.step).toBe('my-step')
      expect(result.warnings[0].context?.file).toBeDefined()
    })
  })

  // ---- Edge cases for steps field ----

  describe('steps field edge cases', () => {
    it('handles steps being null gracefully', () => {
      const state = makeState({ steps: null })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      // null is not an object, so the steps validation loop is skipped
      expect(result.errors).toHaveLength(0)
    })

    it('handles steps being undefined (missing) gracefully', () => {
      const base = JSON.parse(validState)
      delete base['steps']
      const root = makeProjectRoot(JSON.stringify(base))
      const result = validateState(root)
      // undefined steps should not cause errors
      expect(result.errors).toHaveLength(0)
    })

    it('handles steps being an array gracefully (skips validation)', () => {
      const state = makeState({ steps: ['a', 'b'] })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      // Array is filtered out by the typeof check
      expect(result.errors).toHaveLength(0)
    })

    it('handles empty steps object with no errors', () => {
      const state = makeState({ steps: {} })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      expect(result.errors).toHaveLength(0)
    })

    it('skips steps where status is not a string', () => {
      const state = makeState({
        steps: {
          'numeric-status': { status: 42 },
          'null-status': { status: null },
          'valid-step': { status: 'completed' },
        },
      })
      const root = makeProjectRoot(state)
      const result = validateState(root)
      // Non-string statuses are ignored by the typeof === 'string' check
      expect(result.errors).toHaveLength(0)
    })
  })

  // ---- Return type shape ----

  describe('return type', () => {
    it('always returns errors and warnings arrays (never undefined)', () => {
      const root = makeProjectRoot(validState)
      const result = validateState(root)
      expect(Array.isArray(result.errors)).toBe(true)
      expect(Array.isArray(result.warnings)).toBe(true)
    })
  })

  // ---- Nonexistent project root ----

  describe('nonexistent project root', () => {
    it('returns STATE_MISSING for nonexistent root directory', () => {
      const result = validateState('/nonexistent/path/that/does/not/exist')
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('STATE_MISSING')
    })
  })
})
