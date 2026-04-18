import fs from 'node:fs'
import type { PipelineState } from '../types/index.js'
import { StatePathResolver } from './state-path-resolver.js'
import { acquireLock, releaseLock } from './lock-manager.js'
import { atomicWriteFile } from '../utils/fs.js'

export interface MigrationV3Options {
  projectRoot: string
  globalSteps: Set<string>
  services: Array<{ name: string }>
}

/**
 * Migrate v2 root state to v3 service-sharded layout.
 * - Acquires global lock
 * - Rejects if in_progress is non-null
 * - Rejects if globalSteps is empty (prevents mis-sharding)
 * - Splits steps by globalSteps set
 * - Creates per-service state files (duplicates completed per-service steps to ALL services)
 * - Updates root state (global steps only, extra-steps preserved)
 * - Releases global lock
 *
 * Idempotent: no-op if root state is already v3.
 * Crash-safe: service files written first, root updated last.
 */
export function migrateV2ToV3(options: MigrationV3Options): void {
  const { projectRoot, globalSteps, services } = options
  const rootResolver = new StatePathResolver(projectRoot)

  // Check if already v3
  if (!fs.existsSync(rootResolver.statePath)) return
  const rootRaw = JSON.parse(fs.readFileSync(rootResolver.statePath, 'utf8')) as PipelineState
  if (rootRaw['schema-version'] === 3) return

  // Reject empty globalSteps (prevents mis-sharding)
  if (globalSteps.size === 0) {
    throw new Error('Cannot migrate: globalSteps is empty. Structural overlay may be missing.')
  }

  // Reject if in_progress
  if (rootRaw.in_progress) {
    throw new Error(
      `Cannot migrate to per-service state while step '${rootRaw.in_progress.step}' is in progress. `
      + 'Complete or reset it first.',
    )
  }

  // Acquire global lock
  const lockResult = acquireLock(projectRoot, 'migration', 'v2-to-v3')
  if (!lockResult.acquired) {
    throw new Error('Cannot acquire global lock for v2→v3 migration. Another process may be running.')
  }

  try {
    // Split steps
    const globalStepEntries: Record<string, (typeof rootRaw.steps)[string]> = {}
    const serviceStepEntries: Record<string, (typeof rootRaw.steps)[string]> = {}

    for (const [name, entry] of Object.entries(rootRaw.steps)) {
      if (globalSteps.has(name)) {
        globalStepEntries[name] = entry
      } else {
        serviceStepEntries[name] = entry
      }
    }

    // Create service state files (write FIRST for crash safety)
    for (const svc of services) {
      const serviceResolver = new StatePathResolver(projectRoot, svc.name)
      serviceResolver.ensureDir()
      const serviceState: PipelineState = {
        ...rootRaw,
        'schema-version': 3 as 1 | 2 | 3,
        steps: { ...serviceStepEntries },
        in_progress: null,
        next_eligible: [],
        'extra-steps': [],  // extra-steps stay in root only
      }
      atomicWriteFile(serviceResolver.statePath, JSON.stringify(serviceState, null, 2))
    }

    // Update root state LAST (crash recovery: if this fails, service files exist but root is v2 → re-run)
    const updatedRoot: PipelineState = {
      ...rootRaw,
      'schema-version': 3 as 1 | 2 | 3,
      steps: globalStepEntries,
      in_progress: null,
      next_eligible: [],
      // extra-steps preserved in root
    }
    atomicWriteFile(rootResolver.statePath, JSON.stringify(updatedRoot, null, 2))
  } finally {
    releaseLock(projectRoot)
  }
}
