// src/state/state-migration.ts

import type { PipelineState } from '../types/index.js'
import { fileExists } from '../utils/fs.js'
import path from 'node:path'

/**
 * Step name renames introduced in v2.2.0.
 * Keys are old names, values are new names.
 */
const STEP_RENAMES: Record<string, string> = {
  'testing-strategy': 'tdd',
  'implementation-tasks': 'implementation-plan',
  'review-tasks': 'implementation-plan-review',
}

/**
 * Artifact path aliases for backward compatibility.
 * Keys are old paths, values are canonical paths.
 * Applied to the `produces` array of each step.
 */
const ARTIFACT_ALIASES: Record<string, string> = {
  'docs/prd.md': 'docs/plan.md',
}

/**
 * Apply state migrations to handle step renames and artifact path changes.
 *
 * Called during loadState() after JSON parsing but before returning.
 * Migrations are idempotent — safe to run on already-migrated state.
 *
 * Returns true if any migration was applied (caller should persist).
 */
export function migrateState(state: PipelineState): boolean {
  let changed = false

  // Phase 1: Rename step keys
  for (const [oldName, newName] of Object.entries(STEP_RENAMES)) {
    if (state.steps[oldName] && !state.steps[newName]) {
      state.steps[newName] = state.steps[oldName]
      delete state.steps[oldName]
      changed = true
    }

    // Also fix in_progress record if it references the old name
    if (state.in_progress?.step === oldName) {
      state.in_progress.step = newName
      changed = true
    }
  }

  // Phase 2: Normalize artifact paths in produces arrays
  for (const step of Object.values(state.steps)) {
    if (step.produces) {
      for (let i = 0; i < step.produces.length; i++) {
        const canonical = ARTIFACT_ALIASES[step.produces[i]]
        if (canonical) {
          step.produces[i] = canonical
          changed = true
        }
      }
    }
  }

  return changed
}

/**
 * Resolve a PRD artifact path — returns whichever file actually exists.
 * Checks canonical path first (docs/plan.md), then aliases (docs/prd.md).
 *
 * Exported for use by the context gatherer and Mode Detection logic.
 */
export function resolvePrdPath(projectRoot: string): string {
  const candidates = ['docs/plan.md', 'docs/prd.md']
  for (const candidate of candidates) {
    if (fileExists(path.join(projectRoot, candidate))) {
      return candidate
    }
  }
  return 'docs/plan.md' // default if neither exists yet
}

/**
 * Resolve an artifact path, checking aliases if the canonical path doesn't exist.
 * Generalizes PRD resolution for any aliased artifact path.
 */
export function resolveArtifactPath(projectRoot: string, artifactPath: string): string {
  // Check if the path itself exists
  if (fileExists(path.join(projectRoot, artifactPath))) {
    return artifactPath
  }

  // Check reverse aliases (canonical → old)
  for (const [oldPath, canonicalPath] of Object.entries(ARTIFACT_ALIASES)) {
    if (artifactPath === canonicalPath && fileExists(path.join(projectRoot, oldPath))) {
      return oldPath
    }
    if (artifactPath === oldPath && fileExists(path.join(projectRoot, canonicalPath))) {
      return canonicalPath
    }
  }

  return artifactPath // return as-is if nothing found
}
