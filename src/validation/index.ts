// src/validation/index.ts

import fs from 'node:fs'
import path from 'node:path'
import type { ScaffoldError, ScaffoldWarning } from '../types/index.js'
import { discoverMetaPrompts } from '../core/assembly/meta-prompt-loader.js'
import { getPackagePipelineDir } from '../utils/fs.js'
import { validateConfig } from './config-validator.js'
import { validateFrontmatter } from './frontmatter-validator.js'
import { validateState } from './state-validator.js'
import { validateDependencies } from './dependency-validator.js'

export { validateConfig } from './config-validator.js'
export { validateFrontmatter } from './frontmatter-validator.js'
export { validateState } from './state-validator.js'
export { validateDependencies } from './dependency-validator.js'

export interface ValidationResult {
  errors: ScaffoldError[]
  warnings: ScaffoldWarning[]
  scopes: string[]
  validFilesCount: number
  totalFilesCount: number
}

export type ValidationScope = 'config' | 'frontmatter' | 'state' | 'dependencies'

/**
 * Run validation across the requested scopes and accumulate all results.
 * Implements ADR-040 accumulate-and-report: all scopes run regardless of earlier failures.
 */
export function runValidation(
  projectRoot: string,
  scopes: ValidationScope[] = ['config', 'frontmatter', 'state', 'dependencies'],
): ValidationResult {
  const allErrors: ScaffoldError[] = []
  const allWarnings: ScaffoldWarning[] = []
  let validFiles = 0
  let totalFiles = 0

  const pipelineDir = getPackagePipelineDir(projectRoot)

  // Discover known steps for config cross-field validation
  const knownSteps: string[] = []
  try {
    const mps = discoverMetaPrompts(pipelineDir)
    knownSteps.push(...mps.keys())
    totalFiles = mps.size
    validFiles = mps.size
  } catch {
    // Ignore — pipeline dir may not exist
  }

  if (scopes.includes('config')) {
    const r = validateConfig(projectRoot, knownSteps)
    allErrors.push(...r.errors)
    allWarnings.push(...r.warnings)
  }

  if (scopes.includes('frontmatter')) {
    const r = validateFrontmatter(pipelineDir)
    allErrors.push(...r.errors)
    allWarnings.push(...r.warnings)
    // frontmatter validator gives us the authoritative file counts
    totalFiles = r.totalFiles
    validFiles = r.validFiles
  }

  if (scopes.includes('state')) {
    const r = validateState(projectRoot)
    allErrors.push(...r.errors)
    allWarnings.push(...r.warnings)

    // Validate service state files if they exist
    const servicesDir = path.join(projectRoot, '.scaffold', 'services')
    if (fs.existsSync(servicesDir)) {
      for (const entry of fs.readdirSync(servicesDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const serviceStatePath = path.join(servicesDir, entry.name, 'state.json')
          if (fs.existsSync(serviceStatePath)) {
            const sr = validateState(projectRoot, serviceStatePath)
            allErrors.push(...sr.errors)
            allWarnings.push(...sr.warnings)
          }
        }
      }
    }
  }

  if (scopes.includes('dependencies')) {
    const r = validateDependencies(pipelineDir)
    allErrors.push(...r.errors)
    allWarnings.push(...r.warnings)
  }

  return {
    errors: allErrors,
    warnings: allWarnings,
    scopes,
    validFilesCount: validFiles,
    totalFilesCount: totalFiles,
  }
}
