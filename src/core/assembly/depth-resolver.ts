import type { ScaffoldConfig, MethodologyPreset, DepthLevel } from '../../types/index.js'

export type DepthProvenance = 'cli-flag' | 'step-override' | 'custom-default' | 'preset-default'

/**
 * Resolve depth for a given step using the 4-level precedence chain:
 * CLI flag > step-override > custom-default > preset-default
 */
export function resolveDepth(
  step: string,
  config: ScaffoldConfig,
  preset: MethodologyPreset,
  cliDepth?: DepthLevel,
): { depth: DepthLevel; provenance: DepthProvenance } {
  // 1. CLI flag (highest priority)
  if (cliDepth !== undefined) {
    return { depth: cliDepth, provenance: 'cli-flag' }
  }

  // 2. Per-step override in config.custom.steps
  const stepOverride = config.custom?.steps?.[step]?.depth
  if (stepOverride !== undefined) {
    return { depth: stepOverride as DepthLevel, provenance: 'step-override' }
  }

  // 3. Custom default depth
  const customDefault = config.custom?.default_depth
  if (customDefault !== undefined) {
    return { depth: customDefault, provenance: 'custom-default' }
  }

  // 4. Preset default
  return { depth: preset.default_depth, provenance: 'preset-default' }
}
