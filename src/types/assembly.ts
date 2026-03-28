import type { DepthLevel } from './enums.js'
import type { MetaPromptFile } from './frontmatter.js'
import type { ScaffoldConfig } from './config.js'
import type { PipelineState } from './state.js'
import type { ScaffoldError, ScaffoldWarning } from './errors.js'

/** A knowledge base entry loaded from knowledge/. */
export interface KnowledgeEntry {
  name: string
  description: string
  topics: string[]
  content: string
}

/** An existing artifact from a completed step (for update mode). */
export interface ExistingArtifact {
  filePath: string
  content: string
  previousDepth: DepthLevel
  completionTimestamp: string
}

/** A single artifact entry from a completed step. */
export interface ArtifactEntry {
  stepName: string
  filePath: string
  content: string
}

/** Project context gathered for assembly. */
export interface ProjectContext {
  artifacts: ArtifactEntry[]
  config: ScaffoldConfig
  state: PipelineState
  decisions: string
  existingOutput?: ExistingArtifact
}

/** Resolved user instructions from three-layer precedence (ADR-047). */
export interface UserInstructions {
  global: string | null
  perStep: string | null
  inline: string | null
}

/** A single named section of an assembled prompt. */
export interface PromptSection {
  heading: string
  content: string
}

export type DepthProvenance = 'cli-flag' | 'step-override' | 'custom-default' | 'preset-default'

/** Assembly metadata recorded with each assembled prompt. */
export interface AssemblyMetadata {
  stepName: string
  depth: DepthLevel
  depthProvenance: DepthProvenance
  knowledgeBaseEntries: string[]
  instructionLayers: Array<'global' | 'per-step' | 'inline'>
  artifactCount: number
  decisionCount: number
  assemblyDurationMs: number
  assembledAt: string
  updateMode: boolean
  sectionsIncluded: string[]
}

/** The complete assembled prompt. */
export interface AssembledPrompt {
  text: string
  sections: PromptSection[]
  metadata: AssemblyMetadata
}

/** Options passed to AssemblyEngine.assemble(). */
export interface AssemblyOptions {
  config: ScaffoldConfig
  state: PipelineState
  metaPrompt: MetaPromptFile
  knowledgeEntries: KnowledgeEntry[]
  /** Pre-loaded artifacts from the dependency chain (caller is responsible for loading). */
  artifacts?: ArtifactEntry[]
  /** Pre-formatted decisions string (caller is responsible for loading). */
  decisions?: string
  instructions: UserInstructions
  depth: DepthLevel
  depthProvenance: DepthProvenance
  updateMode: boolean
  existingArtifact?: ExistingArtifact
  /** When true, inject auto-fix instructions for review steps in rework mode. */
  reworkFix?: boolean
}

/** Result from AssemblyEngine.assemble(). */
export interface AssemblyResult {
  success: boolean
  prompt?: AssembledPrompt
  errors: ScaffoldError[]
  warnings: ScaffoldWarning[]
}
