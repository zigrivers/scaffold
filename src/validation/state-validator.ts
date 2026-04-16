// src/validation/state-validator.ts

import fs from 'node:fs'
import path from 'node:path'
import type { ScaffoldError, ScaffoldWarning } from '../types/index.js'
import { ExitCode } from '../types/index.js'
import { stateSchemaVersion } from '../utils/errors.js'

const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'skipped'])

/**
 * Validate .scaffold/state.json for the given project root.
 *
 * - Returns STATE_MISSING error if file does not exist
 * - Returns STATE_PARSE_ERROR if file is not valid JSON
 * - Returns STATE_SCHEMA_VERSION error if schema-version is not 1 or 2
 * - Returns FIELD_INVALID_VALUE errors for steps with invalid status values
 * - Returns STATE_IN_PROGRESS warning if in_progress is non-null (potential crash)
 */
export function validateState(projectRoot: string): {
  errors: ScaffoldError[]
  warnings: ScaffoldWarning[]
} {
  const statePath = path.join(projectRoot, '.scaffold', 'state.json')
  const errors: ScaffoldError[] = []
  const warnings: ScaffoldWarning[] = []

  // Check existence
  if (!fs.existsSync(statePath)) {
    errors.push({
      code: 'STATE_MISSING',
      message: `Pipeline state not found at ${statePath}`,
      exitCode: ExitCode.ValidationError,
      recovery: 'Run "scaffold init" to initialize the pipeline',
      context: { file: statePath },
    })
    return { errors, warnings }
  }

  // Read file
  let raw: string
  try {
    raw = fs.readFileSync(statePath, 'utf8')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    errors.push({
      code: 'STATE_PARSE_ERROR',
      message: `Failed to read state.json: ${detail}`,
      exitCode: ExitCode.StateCorruption,
      recovery: 'Run "scaffold reset" to reinitialize state',
      context: { file: statePath, detail },
    })
    return { errors, warnings }
  }

  // Parse JSON
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    errors.push({
      code: 'STATE_PARSE_ERROR',
      message: `Failed to parse state.json: ${detail}`,
      exitCode: ExitCode.StateCorruption,
      recovery: 'Run "scaffold reset" to reinitialize state',
      context: { file: statePath, detail },
    })
    return { errors, warnings }
  }

  // Check schema version (Wave 3a: widened to accept 1 or 2)
  const schemaVersion = parsed['schema-version']
  if (schemaVersion !== 1 && schemaVersion !== 2) {
    errors.push(stateSchemaVersion([1, 2], schemaVersion as number, statePath))
    return { errors, warnings }
  }

  // Validate step statuses
  const steps = parsed['steps']
  if (steps !== null && steps !== undefined && typeof steps === 'object' && !Array.isArray(steps)) {
    for (const [slug, entry] of Object.entries(steps as Record<string, unknown>)) {
      const stepEntry = entry as Record<string, unknown>
      const status = stepEntry['status']
      if (typeof status === 'string' && !VALID_STATUSES.has(status)) {
        errors.push({
          code: 'FIELD_INVALID_VALUE',
          message: `Step "${slug}" has invalid status "${status}"`,
          exitCode: ExitCode.ValidationError,
          recovery: `Valid statuses: ${[...VALID_STATUSES].join(', ')}`,
          context: { file: statePath, field: `steps.${slug}.status`, value: status },
        })
      }
    }
  }

  // Warn if in_progress is non-null (potential crash recovery needed)
  const inProgress = parsed['in_progress']
  if (inProgress !== null && inProgress !== undefined) {
    const inProgressRecord = inProgress as Record<string, unknown>
    const step = typeof inProgressRecord['step'] === 'string' ? inProgressRecord['step'] : 'unknown'
    warnings.push({
      code: 'STATE_IN_PROGRESS',
      message: `Step "${step}" is marked in_progress — this may indicate a previous crash`,
      context: { file: statePath, step },
    })
  }

  return { errors, warnings }
}
