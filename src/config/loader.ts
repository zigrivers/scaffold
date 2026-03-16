// src/config/loader.ts

import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { ScaffoldConfig } from '../types/index.js'
import type { ScaffoldError, ScaffoldWarning } from '../utils/errors.js'
import { fileExists } from '../utils/fs.js'
import {
  configMissing,
  configEmpty,
  configParseError,
  configNotObject,
  configUnknownField,
  fieldWrongType,
  fieldInvalidDepth,
  fieldInvalidMethodology,
} from '../utils/errors.js'
import { findClosestMatch } from '../utils/levenshtein.js'
import { ConfigSchema } from './schema.js'
import { migrateV1 } from './migration.js'

/** Known valid top-level fields in a v2 config. */
const KNOWN_FIELDS = new Set(['version', 'methodology', 'custom', 'platforms', 'project'])

/** Valid methodology values. */
const VALID_METHODOLOGIES = ['deep', 'mvp', 'custom']

/** Result of loadConfig. */
interface LoadResult {
  config: ScaffoldConfig | null
  errors: ScaffoldError[]
  warnings: ScaffoldWarning[]
}

/**
 * Load and validate .scaffold/config.yml.
 *
 * Implements a 6-phase validation pipeline:
 * - Phase 1: File existence (short-circuit)
 * - Phase 2: YAML parse + shape check (short-circuit)
 * - Phase 3: Version check + v1 migration (short-circuit)
 * - Phase 4: Required fields validation (accumulate)
 * - Phase 5: Unknown top-level fields → warnings (accumulate)
 * - Phase 6: Cross-field validation (accumulate)
 */
export function loadConfig(projectRoot: string, knownSteps: string[]): LoadResult {
  const configPath = path.join(projectRoot, '.scaffold', 'config.yml')
  const errors: ScaffoldError[] = []
  const warnings: ScaffoldWarning[] = []

  // Phase 1: File existence
  if (!fileExists(configPath)) {
    return { config: null, errors: [configMissing(configPath)], warnings: [] }
  }

  // Phase 2: YAML parse + shape check
  let raw: unknown
  const content = fs.readFileSync(configPath, 'utf8')

  if (content.trim() === '') {
    return { config: null, errors: [configEmpty(configPath)], warnings: [] }
  }

  try {
    raw = yaml.load(content)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { config: null, errors: [configParseError(configPath, detail)], warnings: [] }
  }

  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return { config: null, errors: [configNotObject(configPath)], warnings: [] }
  }

  let obj = raw as Record<string, unknown>

  // Phase 3: Version check + v1 migration
  const version = obj['version']

  if (version === 1 || version === undefined) {
    // Auto-migrate v1 config
    obj = migrateV1(obj) as unknown as Record<string, unknown>
  } else if (version !== 2) {
    // Unexpected version
    return {
      config: null,
      errors: [fieldWrongType('version', '2', String(version), configPath)],
      warnings: [],
    }
  }

  // Phase 4: Required fields validation (accumulate errors)
  const methodology = obj['methodology']

  if (methodology === undefined || methodology === null) {
    errors.push({
      code: 'FIELD_MISSING',
      message: 'Required field "methodology" is missing',
      exitCode: 1,
      recovery: `Add "methodology" to ${configPath}`,
      context: { file: configPath, field: 'methodology' },
    })
  } else if (typeof methodology !== 'string' || !VALID_METHODOLOGIES.includes(methodology)) {
    const suggestion = typeof methodology === 'string'
      ? findClosestMatch(methodology, VALID_METHODOLOGIES)
      : null
    errors.push(fieldInvalidMethodology(String(methodology), suggestion, configPath))
  }

  const platforms = obj['platforms']

  if (platforms === undefined || platforms === null) {
    errors.push({
      code: 'FIELD_MISSING',
      message: 'Required field "platforms" is missing',
      exitCode: 1,
      recovery: `Add "platforms" to ${configPath}`,
      context: { file: configPath, field: 'platforms' },
    })
  } else if (!Array.isArray(platforms) || platforms.length === 0) {
    errors.push({
      code: 'FIELD_EMPTY_VALUE',
      message: 'Field "platforms" must not be empty',
      exitCode: 1,
      context: { file: configPath, field: 'platforms' },
    })
  }

  // Validate custom section depths via Zod
  const zodResult = ConfigSchema.safeParse(obj)
  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      const fieldPath = issue.path.join('.')
      // Depth violations
      if (fieldPath.includes('depth')) {
        const depthValue = getNestedValue(obj, issue.path)
        errors.push(fieldInvalidDepth(depthValue, configPath))
      }
      // Platforms type issues not already captured above
    }
  }

  // Short-circuit if Phase 4 produced errors
  if (errors.length > 0) {
    return { config: null, errors, warnings }
  }

  // Phase 5: Unknown top-level fields → warnings (accumulate)
  for (const key of Object.keys(obj)) {
    if (!KNOWN_FIELDS.has(key)) {
      warnings.push(configUnknownField(key, configPath))
    }
  }

  // Phase 6: Cross-field validation (accumulate)
  if (methodology === 'custom' && knownSteps.length > 0) {
    const custom = obj['custom'] as Record<string, unknown> | undefined
    if (custom !== undefined) {
      const steps = custom['steps'] as Record<string, unknown> | undefined
      if (steps !== undefined) {
        for (const stepName of Object.keys(steps)) {
          if (!knownSteps.includes(stepName)) {
            errors.push({
              code: 'FIELD_INVALID_VALUE',
              message: `Unknown step "${stepName}" in custom.steps`,
              exitCode: 1,
              recovery: `Valid steps: ${knownSteps.join(', ')}`,
              context: { file: configPath, field: 'custom.steps', value: stepName },
            })
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { config: null, errors, warnings }
  }

  // Success — return config with unknown fields preserved (ADR-033)
  const config = obj as unknown as ScaffoldConfig
  return { config, errors: [], warnings }
}

/** Safely retrieve a nested value by path array. */
function getNestedValue(obj: Record<string, unknown>, pathArr: Array<string | number>): unknown {
  let current: unknown = obj
  for (const key of pathArr) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[key]
  }
  return current
}
