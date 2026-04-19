import fs from 'node:fs'
import type {
  ScaffoldConfig, PipelineState, ArtifactEntry, MetaPromptFile,
} from '../../types/index.js'
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

/**
 * DFS-driven transitive cross-reads resolver with:
 *   - cycle detection via `visiting` set (gray nodes),
 *   - memoization via `resolved` map (black nodes) caching the FULL closure per service:step,
 *   - per-service foreign-state cache via `foreignStateCache`,
 *   - per-traversal dedup via a local Map<filePath, entry>,
 *   - skips foreign meta of category: 'tool' for transitive lookup.
 *
 * Gates transitive recursion on `direct.completed` (not artifact count) so
 * aggregator steps with empty `produces` still participate in the chain.
 */
export function resolveTransitiveCrossReads(
  crossReads: Array<{ service: string; step: string }>,
  config: ScaffoldConfig,
  projectRoot: string,
  metaPrompts: Map<string, MetaPromptFile>,
  output: OutputContext,
  visiting: Set<string>,
  resolved: Map<string, ArtifactEntry[]>,
  foreignStateCache: Map<string, PipelineState | null>,
  globalSteps?: Set<string>,
): ArtifactEntry[] {
  const closure = new Map<string, ArtifactEntry>()  // filePath → entry (dedup inside traversal)
  for (const cr of crossReads) {
    const key = `${cr.service}:${cr.step}`
    if (visiting.has(key)) continue  // cycle — skip silently
    if (resolved.has(key)) {
      for (const a of resolved.get(key)!) closure.set(a.filePath, a)
      continue
    }
    visiting.add(key)

    const direct = resolveDirectCrossRead(
      cr, config, projectRoot, output, foreignStateCache, globalSteps,
    )

    let transitive: ArtifactEntry[] = []
    if (direct.completed) {
      const foreignMeta = metaPrompts.get(cr.step)
      const isTool = foreignMeta?.frontmatter.category === 'tool'
      if (!isTool && foreignMeta?.frontmatter.crossReads?.length) {
        transitive = resolveTransitiveCrossReads(
          foreignMeta.frontmatter.crossReads,
          config, projectRoot, metaPrompts, output,
          visiting, resolved, foreignStateCache, globalSteps,
        )
      }
    }

    const fullClosure: ArtifactEntry[] = [...direct.artifacts, ...transitive]
    for (const a of fullClosure) closure.set(a.filePath, a)

    visiting.delete(key)
    resolved.set(key, fullClosure)  // cache FULL closure (direct + transitive)
  }
  return [...closure.values()]
}
