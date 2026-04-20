import type { PipelineState, StepStateEntry } from '../../types/index.js'
import type { ResolvedPipeline } from './types.js'

/**
 * Read the eligible-step list, preferring the cached list when valid for the
 * current pipeline graph, scope, and (for service scope) root state version.
 * Falls back to live `pipeline.computeEligible()` when any validity check
 * fails. Spec §4.
 *
 * @param state Loaded PipelineState (with optional cache fields)
 * @param pipeline ResolvedPipeline exposing getPipelineHash + computeEligible
 * @param scopeOptions Pass `{ scope: 'service', globalSteps }` for service-
 *        scoped queries; pass `undefined` (or `{ scope: 'global' }`) for global
 * @param rootCounterReader For service scope only: reads the current root
 *        save_counter on demand (spec §6). Absent for global scope.
 */
export function readEligible(
  state: PipelineState,
  pipeline: ResolvedPipeline,
  scopeOptions?: { scope?: 'global' | 'service'; globalSteps?: Set<string> },
  rootCounterReader?: () => number | null,
): string[] {
  const scope = scopeOptions?.scope === 'service' ? 'service' : 'global'
  const currentHash = pipeline.getPipelineHash(scope)
  if (state.next_eligible_hash !== currentHash) {
    return pipeline.computeEligible(
      state.steps as Record<string, StepStateEntry>,
      scopeOptions,
    )
  }
  if (scope === 'service') {
    const currentRootCounter = rootCounterReader?.() ?? null
    if (state.next_eligible_root_counter !== currentRootCounter) {
      return pipeline.computeEligible(
        state.steps as Record<string, StepStateEntry>,
        scopeOptions,
      )
    }
  }
  return state.next_eligible
}
