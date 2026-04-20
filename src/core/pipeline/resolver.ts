import { resolveOverlayState } from '../assembly/overlay-state-resolver.js'
import { buildGraph } from '../dependency/graph.js'
import { computeEligible } from '../dependency/eligibility.js'
import * as graphHash from './graph-hash.js'
import { createOutputContext } from '../../cli/output/context.js'
import type { OutputContext } from '../../cli/output/context.js'
import type { StepEnablementEntry, ServiceConfig } from '../../types/config.js'
import type { DepthLevel } from '../../types/index.js'
import type { StepStateEntry } from '../../types/state.js'
import type { MetaPromptFrontmatter } from '../../types/frontmatter.js'
import type { OverlayState } from '../assembly/overlay-state-resolver.js'
import type { PipelineContext, ResolvedPipeline } from './types.js'
import { configKeyFor } from '../../config/validators/index.js'
import { loadStructuralOverlay } from '../assembly/overlay-loader.js'
import path from 'node:path'
import fs from 'node:fs'

export function resolvePipeline(
  context: PipelineContext,
  options?: { output?: OutputContext; serviceId?: string },
): ResolvedPipeline {
  const { config, presets, metaPrompts, methodologyDir } = context
  const output = options?.output ?? createOutputContext('auto')

  const serviceId = options?.serviceId
  let effectiveConfig = config

  if (serviceId && config?.project?.services?.length) {
    const service = (config.project.services as ServiceConfig[]).find(s => s.name === serviceId)
    if (service) {
      const typeConfigKey = configKeyFor(service.projectType)
      effectiveConfig = {
        ...config,
        project: {
          ...config.project,
          projectType: service.projectType,
          backendConfig: undefined,
          webAppConfig: undefined,
          cliConfig: undefined,
          libraryConfig: undefined,
          mobileAppConfig: undefined,
          dataPipelineConfig: undefined,
          mlConfig: undefined,
          browserExtensionConfig: undefined,
          gameConfig: undefined,
          researchConfig: undefined,
          [typeConfigKey]: (service as unknown as Record<string, unknown>)[typeConfigKey],
        },
      }
    }
  }

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
  if (effectiveConfig) {
    overlay = resolveOverlayState({
      config: effectiveConfig, methodologyDir, metaPrompts, presetSteps: mergedSteps, output,
    })
  } else {
    const knowledge: Record<string, string[]> = {}
    const reads: Record<string, string[]> = {}
    const dependencies: Record<string, string[]> = {}
    const crossReads: Record<string, Array<{ service: string; step: string }>> = {}
    for (const [name, mp] of metaPrompts) {
      knowledge[name] = [...(mp.frontmatter.knowledgeBase ?? [])]
      reads[name] = [...(mp.frontmatter.reads ?? [])]
      dependencies[name] = [...(mp.frontmatter.dependencies ?? [])]
      crossReads[name] = [...(mp.frontmatter.crossReads ?? [])]
    }
    overlay = { steps: mergedSteps, knowledge, reads, dependencies, crossReads }
  }

  // 4. Build graph (once)
  const frontmatters = [...metaPrompts.values()].map((mp) => mp.frontmatter)
  const presetStepsMap = new Map(
    Object.entries(overlay.steps).map(([k, v]) => [k, { enabled: v.enabled }]),
  )
  const graph = buildGraph(frontmatters, presetStepsMap, overlay.dependencies, overlay.crossReads)

  // 5. Build stepMeta
  const stepMeta = new Map<string, MetaPromptFrontmatter>()
  for (const [name, mp] of metaPrompts) {
    stepMeta.set(name, mp.frontmatter)
  }

  // 6. Compute globalSteps from multi-service overlay
  const globalSteps = new Set<string>()
  if (effectiveConfig?.project?.services?.length) {
    const msOverlayPath = path.join(methodologyDir, 'multi-service-overlay.yml')
    if (fs.existsSync(msOverlayPath)) {
      const { overlay: msOverlay } = loadStructuralOverlay(msOverlayPath)
      if (msOverlay) {
        for (const step of Object.keys(msOverlay.stepOverrides)) {
          globalSteps.add(step)
        }
      }
    }
  }

  // 7. Build computeEligible closure
  const computeEligibleFn = (
    steps: Record<string, StepStateEntry>,
    scopeOptions?: { scope?: 'global' | 'service'; globalSteps?: Set<string> },
  ): string[] => computeEligible(graph, steps, scopeOptions)

  // 8. Memoized pipeline-graph hash (spec §5).
  // Call computePipelineHash via the namespace import so ESM spying works
  // (test in resolver.test.ts depends on this).
  const hashCache = new Map<string, string>()
  const getPipelineHash = (scope: 'global' | 'service' | null): string => {
    // Normalize null → 'global' for the cache key (spec §2 normalization).
    const key = scope === 'service' ? 'service' : 'global'
    let hash = hashCache.get(key)
    if (hash === undefined) {
      hash = graphHash.computePipelineHash(graph, globalSteps, scope)
      hashCache.set(key, hash)
    }
    return hash
  }

  return { graph, preset: resolvedPreset, overlay, stepMeta, computeEligible: computeEligibleFn, globalSteps, getPipelineHash }
}
