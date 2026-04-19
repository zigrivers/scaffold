import fs from 'node:fs'
import type { ScaffoldConfig, PipelineState, ArtifactEntry } from '../../types/index.js'
import type { OutputContext } from '../../cli/output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { StatePathResolver } from '../../state/state-path-resolver.js'
import { resolveContainedArtifactPath } from '../../utils/artifact-path.js'

/**
 * Resolve a single cross-read against a foreign service's state, with allowlist
 * check, per-service state cache, path containment, warning symmetry with the
 * existing `reads` loop in run.ts, and an optional runtime global-step guard.
 *
 * Returns { completed, artifacts } so transitive callers can gate recursion on
 * step completion rather than artifact count (aggregator steps may produce no
 * artifacts of their own but still have valid transitive cross-reads).
 */
export function resolveDirectCrossRead(
  cr: { service: string; step: string },
  config: ScaffoldConfig,
  projectRoot: string,
  output: OutputContext,
  foreignStateCache: Map<string, PipelineState | null>,
  globalSteps?: Set<string>,
): { completed: boolean; artifacts: ArtifactEntry[] } {
  // 1. Defense-in-depth: skip if cr.step is a global step. Parse-time refinement
  //    rejects this in service.exports, but the runtime guard protects against
  //    malformed configs or future overlay-override paths.
  if (globalSteps && globalSteps.has(cr.step)) {
    output.warn(`cross-reads: '${cr.step}' is a global step and cannot be cross-read`)
    return { completed: false, artifacts: [] }
  }

  // 2. Validate service exists in config
  const serviceEntry = config.project?.services?.find(s => s.name === cr.service)
  if (!serviceEntry) {
    output.warn(`cross-reads: service '${cr.service}' not found`)
    return { completed: false, artifacts: [] }
  }

  // 3. Check exports allowlist (closed by default)
  if (!serviceEntry.exports?.some(e => e.step === cr.step)) {
    output.warn(`cross-reads: '${cr.step}' not exported by '${cr.service}'`)
    return { completed: false, artifacts: [] }
  }

  // 4. Load foreign service state via read-only loader, cached per service
  let foreignState = foreignStateCache.get(cr.service)
  if (foreignState === undefined) {
    const foreignResolver = new StatePathResolver(projectRoot, cr.service)
    if (!fs.existsSync(foreignResolver.statePath)) {
      output.warn(`cross-reads: service '${cr.service}' not bootstrapped`)
      foreignStateCache.set(cr.service, null)
      return { completed: false, artifacts: [] }
    }
    try {
      foreignState = StateManager.loadStateReadOnly(projectRoot, foreignResolver)
      foreignStateCache.set(cr.service, foreignState)
    } catch {
      output.warn(`cross-reads: failed to load state for '${cr.service}'`)
      foreignStateCache.set(cr.service, null)
      return { completed: false, artifacts: [] }
    }
  }
  if (!foreignState) return { completed: false, artifacts: [] }

  // 5. Check step is completed
  const stepEntry = foreignState.steps?.[cr.step]
  if (!stepEntry || stepEntry.status !== 'completed') {
    return { completed: false, artifacts: [] }
  }

  // 6. Resolve artifacts with containment check + warning symmetry with run.ts reads loop
  const artifacts: ArtifactEntry[] = []
  for (const relPath of stepEntry.produces ?? []) {
    const fullPath = resolveContainedArtifactPath(projectRoot, relPath)
    if (fullPath === null) {
      output.warn({
        code: 'ARTIFACT_PATH_REJECTED',
        message:
          `Cross-read artifact '${relPath}' from '${cr.service}:${cr.step}' `
          + 'resolves outside project root — skipping',
      })
      continue
    }
    if (!fs.existsSync(fullPath)) continue
    try {
      artifacts.push({
        stepName: `${cr.service}:${cr.step}`,
        filePath: relPath,
        content: fs.readFileSync(fullPath, 'utf8'),
      })
    } catch (err) {
      output.warn({
        code: 'ARTIFACT_READ_ERROR',
        message:
          `Could not read cross-read artifact '${relPath}' from `
          + `'${cr.service}:${cr.step}': ${(err as Error).message}`,
      })
    }
  }
  return { completed: true, artifacts }
}
