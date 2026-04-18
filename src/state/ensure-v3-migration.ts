import fs from 'node:fs'
import path from 'node:path'
import type { ScaffoldConfig } from '../types/index.js'
import { migrateV2ToV3 } from './state-migration-v3.js'
import { loadGlobalStepSlugs } from '../core/pipeline/global-steps.js'
import { getPackageMethodologyDir } from '../utils/fs.js'

/**
 * Ensure state is at v3 for multi-service projects.
 * Called by all commands before state access.
 * No-op for single-service or already-v3 projects.
 * Computes globalSteps from overlay if not provided.
 */
export function ensureV3Migration(
  projectRoot: string,
  config: ScaffoldConfig | null,
  globalSteps?: Set<string>,
): void {
  if (!config?.project?.services?.length) return

  const statePath = path.join(projectRoot, '.scaffold', 'state.json')
  if (!fs.existsSync(statePath)) return

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  } catch { return }

  if (raw['schema-version'] !== 2) return

  // Compute globalSteps if not provided (for commands that skip resolvePipeline)
  const effectiveGlobalSteps = globalSteps ?? loadGlobalStepSlugs(getPackageMethodologyDir())

  migrateV2ToV3({
    projectRoot,
    globalSteps: effectiveGlobalSteps,
    services: config.project.services as Array<{ name: string }>,
  })
}
