import type { PipelineContext, ResolvedPipeline } from './types.js'

/**
 * Build the `pipelineSteps` argument for `StateManager.reconcileWithPipeline`,
 * scope-filtered for the active command invocation.
 *
 * Three modes (matches `computeEligible`'s scope arg semantics at
 * `src/core/dependency/eligibility.ts:33-37` and the read-side scope filter
 * in `scaffold status` / `scaffold next`):
 *
 * - **service mode** (`--service <name>`): exclude global steps; they belong
 *   to root state.
 * - **multi-service root mode** (config has `services[]` but no `--service`):
 *   include only global steps; service-local steps live in per-service state
 *   and shouldn't be added to root state.
 * - **flat / single-project mode**: include everything.
 *
 * Note: `StateManager.reconcileWithPipeline` already skips global steps in
 * service-scoped mode at `src/state/state-manager.ts:229`. The filter here is
 * still required for the multi-service-root case (no path-resolver flag for
 * "multi-service but operating at root") and is harmless redundancy for the
 * other two modes — keeping the scope decision in one place at the call site.
 */
export function pipelineStepsForReconcile(
  context: PipelineContext,
  pipeline: ResolvedPipeline,
  service: string | undefined,
): Array<{ slug: string; produces: string[]; enabled: boolean }> {
  const isMultiServiceRoot =
    !service && (context.config?.project?.services?.length ?? 0) > 0
  const inScope = (slug: string): boolean => {
    if (service) return !pipeline.globalSteps.has(slug)
    if (isMultiServiceRoot) return pipeline.globalSteps.has(slug)
    return true
  }
  return [...context.metaPrompts.values()]
    .filter(m => inScope(m.frontmatter.name))
    .map(m => ({
      slug: m.frontmatter.name,
      produces: m.frontmatter.outputs,
      enabled: pipeline.overlay.steps[m.frontmatter.name]?.enabled === true,
    }))
}
