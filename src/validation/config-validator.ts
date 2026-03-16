// src/validation/config-validator.ts

import type { ScaffoldError, ScaffoldWarning } from '../types/index.js'
import { loadConfig } from '../config/loader.js'

/**
 * Validate .scaffold/config.yml for the given project root.
 * Delegates to loadConfig which implements the full 6-phase validation pipeline.
 */
export function validateConfig(
  projectRoot: string,
  knownSteps: string[],
): {
  errors: ScaffoldError[]
  warnings: ScaffoldWarning[]
} {
  const { errors, warnings } = loadConfig(projectRoot, knownSteps)
  return { errors, warnings }
}
