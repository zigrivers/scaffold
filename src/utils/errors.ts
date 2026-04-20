// src/utils/errors.ts

import path from 'node:path'

/** Structured scaffold error. */
export interface ScaffoldError {
  code: string
  message: string
  exitCode: number
  recovery?: string
  context?: Record<string, string | number | undefined>
}

/** Non-fatal warning (never causes non-zero exit). */
export interface ScaffoldWarning {
  code: string
  message: string
  context?: Record<string, string | number | undefined>
}

// --- Error factories ---

export function configMissing(configPath: string): ScaffoldError {
  return {
    code: 'CONFIG_MISSING',
    message: `Config file not found at ${configPath}`,
    exitCode: 1,
    recovery: 'Run "scaffold init" to create a project configuration',
    context: { file: configPath },
  }
}

export function configEmpty(configPath: string): ScaffoldError {
  return {
    code: 'CONFIG_EMPTY',
    message: `Config file is empty: ${configPath}`,
    exitCode: 1,
    recovery: 'Run "scaffold init" to create a valid configuration',
    context: { file: configPath },
  }
}

export function configParseError(configPath: string, detail: string): ScaffoldError {
  return {
    code: 'CONFIG_PARSE_ERROR',
    message: `Failed to parse config file: ${detail}`,
    exitCode: 1,
    recovery: 'Check the YAML syntax in .scaffold/config.yml',
    context: { file: configPath, detail },
  }
}

export function configNotObject(configPath: string): ScaffoldError {
  return {
    code: 'CONFIG_NOT_OBJECT',
    message: 'Config file must contain a YAML object, not a scalar or array',
    exitCode: 1,
    recovery: 'Ensure .scaffold/config.yml contains a valid YAML mapping',
    context: { file: configPath },
  }
}

export function configUnknownField(field: string, configPath: string): ScaffoldWarning {
  return {
    code: 'CONFIG_UNKNOWN_FIELD',
    message: `Unknown field "${field}" in config file`,
    context: { file: configPath, field },
  }
}

export function fieldMissing(field: string, file: string): ScaffoldError {
  return {
    code: 'FIELD_MISSING',
    message: `Required field "${field}" is missing`,
    exitCode: 1,
    recovery: `Add "${field}" to ${file}`,
    context: { file, field },
  }
}

export function fieldWrongType(field: string, expected: string, actual: string, file: string): ScaffoldError {
  return {
    code: 'FIELD_WRONG_TYPE',
    message: `Field "${field}" must be ${expected}, got ${actual}`,
    exitCode: 1,
    context: { file, field, expected, actual },
  }
}

export function fieldEmptyValue(field: string, file: string): ScaffoldError {
  return {
    code: 'FIELD_EMPTY_VALUE',
    message: `Field "${field}" must not be empty`,
    exitCode: 1,
    context: { file, field },
  }
}

export function fieldInvalidDepth(value: unknown, file: string): ScaffoldError {
  return {
    code: 'FIELD_INVALID_DEPTH',
    message: `Depth must be an integer between 1 and 5, got ${value}`,
    exitCode: 1,
    recovery: 'Set depth to a value between 1 (minimal) and 5 (comprehensive)',
    context: { file, value: String(value) },
  }
}

export function fieldInvalidMethodology(value: string, suggestion: string | null, file: string): ScaffoldError {
  const recovery = suggestion
    ? `Unknown methodology "${value}". Did you mean "${suggestion}"? Valid options: deep, mvp, custom`
    : `Unknown methodology "${value}". Valid options: deep, mvp, custom`
  return {
    code: 'FIELD_INVALID_METHODOLOGY',
    message: `Unknown methodology "${value}"`,
    exitCode: 1,
    recovery,
    context: { file, value },
  }
}

export function frontmatterMissing(file: string): ScaffoldError {
  return {
    code: 'FRONTMATTER_MISSING',
    message: 'File does not start with frontmatter delimiter ---',
    exitCode: 1,
    context: { file },
  }
}

export function frontmatterUnclosed(file: string): ScaffoldError {
  return {
    code: 'FRONTMATTER_UNCLOSED',
    message: 'Frontmatter is not closed (missing closing ---)',
    exitCode: 1,
    context: { file },
  }
}

export function frontmatterYamlError(file: string, detail: string): ScaffoldError {
  return {
    code: 'FRONTMATTER_YAML_ERROR',
    message: `Invalid YAML in frontmatter: ${detail}`,
    exitCode: 1,
    context: { file, detail },
  }
}

export function frontmatterNameInvalid(name: string, file: string): ScaffoldError {
  return {
    code: 'FRONTMATTER_NAME_INVALID',
    message: `Frontmatter "name" field must be kebab-case, got "${name}"`,
    exitCode: 1,
    recovery: 'Use lowercase letters, numbers, and hyphens only (e.g., "create-prd")',
    context: { file, name },
  }
}

export function frontmatterUnknownField(field: string, file: string): ScaffoldWarning {
  return {
    code: 'FRONTMATTER_UNKNOWN_FIELD',
    message: `Unknown frontmatter field "${field}"`,
    context: { file, field },
  }
}

export function stateSchemaVersion(
  expected: number | readonly number[],
  actual: number,
  file: string,
): ScaffoldError {
  const expectedDisplay = Array.isArray(expected)
    ? expected.join(' or ')
    : String(expected)
  return {
    code: 'STATE_SCHEMA_VERSION',
    message: `state.json schema version ${actual} is not supported (expected ${expectedDisplay})`,
    exitCode: 3,
    recovery: 'Run "scaffold reset" to reinitialize state, or upgrade scaffold',
    context: { file, expected: Array.isArray(expected) ? expected[0] : expected, actual },
  }
}

export function stateMissing(file: string): ScaffoldError {
  return {
    code: 'STATE_MISSING',
    message: `Pipeline state not found at ${file}`,
    exitCode: 1,
    recovery: 'Run "scaffold init" to initialize the pipeline',
    context: { file },
  }
}

export function stateParseError(file: string, detail: string): ScaffoldError {
  return {
    code: 'STATE_PARSE_ERROR',
    message: `Failed to parse state.json: ${detail}`,
    exitCode: 3,
    recovery: 'Run "scaffold reset" to reinitialize state',
    context: { file, detail },
  }
}

export function psmAlreadyInProgress(step: string, current: string): ScaffoldError {
  return {
    code: 'PSM_ALREADY_IN_PROGRESS',
    message: `Cannot set "${step}" to in_progress — "${current}" is already in progress`,
    exitCode: 3,
    recovery: 'Wait for the current step to complete or run "scaffold reset"',
    context: { step, current },
  }
}

export function lockHeld(holder: string, pid: number, command: string): ScaffoldError {
  return {
    code: 'LOCK_HELD',
    message: `Scaffold is already running (${command} by ${holder}, PID ${pid})`,
    exitCode: 3,
    recovery: 'Wait for the other scaffold process to finish, or use --force to override',
    context: { holder, pid, command },
  }
}

export function lockWriteFailed(file: string, detail: string): ScaffoldError {
  return {
    code: 'LOCK_WRITE_FAILED',
    message: `Failed to create lock file: ${detail}`,
    exitCode: 5,
    context: { file, detail },
  }
}

export function lockStaleCleared(holder: string, pid: number): ScaffoldWarning {
  return {
    code: 'LOCK_STALE_CLEARED',
    message: `Cleared stale lock from ${holder} (PID ${pid} is no longer running)`,
    context: { holder, pid },
  }
}

export function decisionParseError(file: string, line: number, detail: string): ScaffoldError {
  return {
    code: 'DECISION_PARSE_ERROR',
    message: `Failed to parse decision entry at line ${line}: ${detail}`,
    exitCode: 1,
    context: { file, line, detail },
  }
}

export function presetMissing(presetName: string, file: string): ScaffoldError {
  return {
    code: 'PRESET_MISSING',
    message: `Methodology preset "${presetName}" not found at ${file}`,
    exitCode: 1,
    recovery: 'Reinstall scaffold to restore built-in presets',
    context: { presetName, file },
  }
}

export function presetParseError(file: string, detail: string): ScaffoldError {
  return {
    code: 'PRESET_PARSE_ERROR',
    message: `Failed to parse methodology preset: ${detail}`,
    exitCode: 1,
    context: { file, detail },
  }
}

export function presetInvalidStep(step: string, preset: string): ScaffoldError {
  return {
    code: 'PRESET_INVALID_STEP',
    message: `Preset "${preset}" references unknown step "${step}"`,
    exitCode: 1,
    context: { step, preset },
  }
}

export function presetMissingStep(step: string, preset: string): ScaffoldWarning {
  return {
    code: 'PRESET_MISSING_STEP',
    message: `Step "${step}" exists in pipeline but is not listed in preset "${preset}"`,
    context: { step, preset },
  }
}

export function presetUnmetDependency(step: string, dependency: string, preset: string): ScaffoldWarning {
  return {
    code: 'PRESET_UNMET_DEPENDENCY',
    message: `Step "${step}" is enabled in "${preset}" but dependency ` +
      `"${dependency}" is disabled — engine treats as satisfied.`,
    context: { step, dependency, preset },
  }
}

export function overlayMissing(name: string, path: string): ScaffoldError {
  return {
    code: 'OVERLAY_MISSING',
    message: `Project-type overlay "${name}" not found at ${path}`,
    exitCode: 1,
    recovery: 'Reinstall scaffold to restore built-in overlays',
    context: { name, file: path },
  }
}

export function overlayParseError(path: string, detail: string): ScaffoldError {
  return {
    code: 'OVERLAY_PARSE_ERROR',
    message: `Failed to parse project-type overlay: ${detail}`,
    exitCode: 1,
    context: { file: path, detail },
  }
}

export function overlayMalformedEntry(step: string, field: string, file: string): ScaffoldWarning {
  return {
    code: 'OVERLAY_MALFORMED_ENTRY',
    message: `Overlay entry "${step}" has invalid "${field}" — ignoring entry`,
    context: { step, field, file },
  }
}

export function overlayMalformedSection(section: string, file: string): ScaffoldWarning {
  return {
    code: 'OVERLAY_MALFORMED_SECTION',
    message: `Overlay section "${section}" must be a YAML object — ignoring`,
    context: { section, file },
  }
}

export function overlayMalformedAppendItem(
  step: string,
  index: number,
  file: string,
): ScaffoldWarning {
  return {
    code: 'OVERLAY_MALFORMED_APPEND_ITEM',
    message: `Overlay entry "${step}" append[${index}] is malformed — ignoring that item`,
    context: { step, index, file },
  }
}

export function overlayCrossReadsNotAllowed(file: string): ScaffoldWarning {
  return {
    code: 'OVERLAY_CROSS_READS_NOT_ALLOWED',
    message:
      'cross-reads-overrides is only valid in structural overlays — '
      + `stripping from ${path.basename(file)}`,
    context: { file },
  }
}

/**
 * Converts any thrown value into a well-formed ScaffoldError.
 * - Already-shaped ScaffoldError objects are returned unchanged (strict duck-type check).
 * - Error instances have their message extracted; stack included in context.
 * - String/null/undefined/other throws are wrapped with the fallback code.
 */
export function asScaffoldError(
  err: unknown,
  fallbackCode: string,
  fallbackExit: number,
): ScaffoldError {
  // Case 1: Already a fully-formed ScaffoldError
  if (err !== null && typeof err === 'object') {
    const o = err as Record<string, unknown>
    if (typeof o.code === 'string' && typeof o.message === 'string' && typeof o.exitCode === 'number') {
      return err as ScaffoldError
    }
  }

  // Case 2: Error instance
  if (err instanceof Error) {
    return {
      code: fallbackCode,
      message: err.message || 'Unknown error',
      exitCode: fallbackExit,
      context: err.stack
        ? ({ stack: err.stack.slice(0, 500), name: err.name } satisfies Record<string, string | number | undefined>)
        : undefined,
    }
  }

  // Case 3: non-Error throws
  return {
    code: fallbackCode,
    message: typeof err === 'string'
      ? err
      : err === null
        ? 'null error thrown'
        : err === undefined
          ? 'undefined error thrown'
          : `Non-Error thrown: ${String(err)}`,
    exitCode: fallbackExit,
  }
}
