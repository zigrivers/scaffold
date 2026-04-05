// src/utils/eligible.ts
// Shared helper: build a computeEligibleFn from a project root.
// Used by commands that mutate state (complete, skip, reset) to keep
// next_eligible accurate after each mutation.

import { discoverMetaPrompts } from '../core/assembly/meta-prompt-loader.js'
import { loadAllPresets } from '../core/assembly/preset-loader.js'
import { resolveOverlayState } from '../core/assembly/overlay-state-resolver.js'
import { buildGraph } from '../core/dependency/graph.js'
import { computeEligible } from '../core/dependency/eligibility.js'
import { loadConfig } from '../config/loader.js'
import { createOutputContext } from '../cli/output/context.js'
import { getPackagePipelineDir, getPackageMethodologyDir } from './fs.js'
import type { StepStateEntry } from '../types/index.js'

/**
 * Build a computeEligibleFn for the given project root.
 * Discovers meta-prompts, loads the methodology preset, applies project-type
 * overlay, and returns a function that computes next-eligible steps from
 * current state.steps.
 */
export function buildComputeEligibleFn(
  projectRoot: string,
): (steps: Record<string, StepStateEntry>) => string[] {
  const pipelineDir = getPackagePipelineDir(projectRoot)
  const metaPrompts = discoverMetaPrompts(pipelineDir)
  const knownSteps = [...metaPrompts.keys()]

  const { config } = loadConfig(projectRoot, knownSteps)
  const methodology = config?.methodology ?? 'deep'

  const methodologyDir = getPackageMethodologyDir(projectRoot)
  const presets = loadAllPresets(methodologyDir, knownSteps)
  const preset = methodology === 'mvp'
    ? presets.mvp
    : methodology === 'custom'
      ? presets.custom ?? presets.deep
      : presets.deep

  // Apply project-type overlay if configured
  const output = createOutputContext('auto')
  const overlayState = config
    ? resolveOverlayState({
      config,
      methodologyDir,
      metaPrompts,
      presetSteps: preset?.steps ?? {},
      output,
    })
    : { steps: preset?.steps ?? {} }

  const overlayStepsMap = new Map(Object.entries(overlayState.steps))
  const metaPromptList = [...metaPrompts.values()].map(m => m.frontmatter)

  return (steps: Record<string, StepStateEntry>) => {
    const graph = buildGraph(metaPromptList, overlayStepsMap)
    return computeEligible(graph, steps)
  }
}
