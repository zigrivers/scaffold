import type { ScaffoldConfig, MethodologyPreset } from '../../types/index.js'

export type EnablementProvenance = 'custom-override' | 'conditional-detection' | 'preset-default'

/**
 * Resolve whether a step is enabled using precedence:
 * custom-override > preset-default
 */
export function resolveEnablement(
  step: string,
  config: ScaffoldConfig,
  preset: MethodologyPreset,
): { enabled: boolean; provenance: EnablementProvenance } {
  // 1. Custom override in config
  const customStep = config.custom?.steps?.[step]
  if (customStep?.enabled !== undefined) {
    return { enabled: customStep.enabled, provenance: 'custom-override' }
  }

  // 2. Preset default
  const presetStep = preset.steps[step]
  if (presetStep !== undefined) {
    return { enabled: presetStep.enabled, provenance: 'preset-default' }
  }

  // 3. Not in preset — assume disabled
  return { enabled: false, provenance: 'preset-default' }
}
