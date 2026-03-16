import type { DepthLevel } from '../../types/enums.js'
import type { PipelineState } from '../../types/state.js'
import type { ScaffoldConfig } from '../../types/config.js'
import type { ScaffoldWarning } from '../../types/errors.js'

export interface MethodologyChangeResult {
  changed: boolean
  stateMeta: string
  configMeta: string
  warnings: ScaffoldWarning[]
}

/**
 * Detect whether the methodology preset has changed since the pipeline was
 * initialised. Compares state.config_methodology to config.methodology.
 */
export function detectMethodologyChange(options: {
  state: PipelineState
  config: ScaffoldConfig
}): MethodologyChangeResult {
  const { state, config } = options
  const stateMeta = state.config_methodology
  const configMeta = config.methodology

  const warnings: ScaffoldWarning[] = []
  const changed = stateMeta !== configMeta

  if (changed) {
    warnings.push({
      code: 'ASM_METHODOLOGY_CHANGED',
      message: `Methodology changed from '${stateMeta}' (original) to '${configMeta}' (current config)`,
    })
  }

  return { changed, stateMeta, configMeta, warnings }
}

/**
 * Detect completed steps that were executed at a lower depth than the current
 * methodology default depth. Returns one warning per mismatched step.
 */
export function detectDepthMismatches(options: {
  state: PipelineState
  currentDefaultDepth: DepthLevel
}): ScaffoldWarning[] {
  const { state, currentDefaultDepth } = options
  const warnings: ScaffoldWarning[] = []

  for (const [slug, stepEntry] of Object.entries(state.steps)) {
    if (stepEntry.status !== 'completed') continue
    if (stepEntry.depth === undefined) continue
    if (stepEntry.depth < currentDefaultDepth) {
      warnings.push({
        code: 'ASM_COMPLETED_AT_LOWER_DEPTH',
        message:
          `Step '${slug}' was completed at depth ${stepEntry.depth}` +
          ` but current methodology default is depth ${currentDefaultDepth}`,
      })
    }
  }

  return warnings
}
