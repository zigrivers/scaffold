import { resolveOverlayState } from '../assembly/overlay-state-resolver.js'
import { buildGraph } from '../dependency/graph.js'
import { computeEligible } from '../dependency/eligibility.js'
import { createOutputContext } from '../../cli/output/context.js'
import type { OutputContext } from '../../cli/output/context.js'
import type { StepEnablementEntry } from '../../types/config.js'
import type { DepthLevel } from '../../types/index.js'
import type { StepStateEntry } from '../../types/state.js'
import type { MetaPromptFrontmatter } from '../../types/frontmatter.js'
import type { OverlayState } from '../assembly/overlay-state-resolver.js'
import type { PipelineContext, ResolvedPipeline } from './types.js'

export function resolvePipeline(
  context: PipelineContext,
  options?: { output?: OutputContext },
): ResolvedPipeline {
  const { config, presets, metaPrompts, methodologyDir } = context
  const output = options?.output ?? createOutputContext('auto')

  // 1. Select preset (fallback to deep)
  const methodology = config?.methodology ?? 'deep'
  const preset =
    (methodology === 'mvp' ? presets.mvp : methodology === 'custom' ? presets.custom : presets.deep) ??
    presets.deep
  const resolvedPreset = preset ?? {
    name: 'deep' as const,
    description: 'Default deep methodology',
    default_depth: 3 as DepthLevel,
    steps: {} as Record<string, StepEnablementEntry>,
  }

  // 2. Apply custom enablement overrides
  const mergedSteps: Record<string, StepEnablementEntry> = { ...resolvedPreset.steps }
  if (config?.custom?.steps) {
    for (const [name, customStep] of Object.entries(config.custom.steps)) {
      if (customStep.enabled !== undefined) {
        mergedSteps[name] = { ...(mergedSteps[name] ?? {}), enabled: customStep.enabled }
      }
    }
  }

  // 3. Resolve overlay
  let overlay: OverlayState
  if (config) {
    overlay = resolveOverlayState({ config, methodologyDir, metaPrompts, presetSteps: mergedSteps, output })
  } else {
    const knowledge: Record<string, string[]> = {}
    const reads: Record<string, string[]> = {}
    const dependencies: Record<string, string[]> = {}
    for (const [name, mp] of metaPrompts) {
      knowledge[name] = [...(mp.frontmatter.knowledgeBase ?? [])]
      reads[name] = [...(mp.frontmatter.reads ?? [])]
      dependencies[name] = [...(mp.frontmatter.dependencies ?? [])]
    }
    overlay = { steps: mergedSteps, knowledge, reads, dependencies }
  }

  // 4. Build graph (once)
  const frontmatters = [...metaPrompts.values()].map((mp) => mp.frontmatter)
  const presetStepsMap = new Map(
    Object.entries(overlay.steps).map(([k, v]) => [k, { enabled: v.enabled }]),
  )
  const graph = buildGraph(frontmatters, presetStepsMap, overlay.dependencies)

  // 5. Build stepMeta
  const stepMeta = new Map<string, MetaPromptFrontmatter>()
  for (const [name, mp] of metaPrompts) {
    stepMeta.set(name, mp.frontmatter)
  }

  // 6. Build computeEligible closure
  const computeEligibleFn = (steps: Record<string, StepStateEntry>): string[] =>
    computeEligible(graph, steps)

  return { graph, preset: resolvedPreset, overlay, stepMeta, computeEligible: computeEligibleFn }
}
