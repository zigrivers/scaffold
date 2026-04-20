// src/core/pipeline/types.ts
import type { MetaPromptFile, MetaPromptFrontmatter } from '../../types/frontmatter.js'
import type {
  ScaffoldConfig, MethodologyPreset,
  DependencyGraph, ScaffoldError, ScaffoldWarning,
  StepStateEntry,
} from '../../types/index.js'
import type { OverlayState } from '../assembly/overlay-state-resolver.js'

export interface PipelineContext {
  projectRoot: string
  metaPrompts: Map<string, MetaPromptFile>
  config: ScaffoldConfig | null
  configErrors: ScaffoldError[]
  configWarnings: ScaffoldWarning[]
  presets: {
    mvp: MethodologyPreset | null
    deep: MethodologyPreset | null
    custom: MethodologyPreset | null
  }
  methodologyDir: string
}

export interface ResolvedPipeline {
  graph: DependencyGraph
  preset: MethodologyPreset
  overlay: OverlayState
  stepMeta: Map<string, MetaPromptFrontmatter>
  computeEligible: (
    steps: Record<string, StepStateEntry>,
    options?: { scope?: 'global' | 'service'; globalSteps?: Set<string> },
  ) => string[]
  globalSteps: Set<string>
  /**
   * Memoized pipeline-graph hash for cache invalidation. Spec §5.
   * `null` scope normalizes to `'global'` per spec §2.
   */
  getPipelineHash: (scope: 'global' | 'service' | null) => string
}
