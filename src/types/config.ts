import type { MethodologyName, DepthLevel } from './enums.js'
import type { z } from 'zod'
import {
  ProjectTypeSchema, WebAppConfigSchema, BackendConfigSchema,
  CliConfigSchema, LibraryConfigSchema, MobileAppConfigSchema,
  DataPipelineConfigSchema, MlConfigSchema, BrowserExtensionConfigSchema,
  GameConfigSchema, ResearchConfigSchema,
} from '../config/schema.js'

/** Step enablement entry used in presets and overlays. */
export interface StepEnablementEntry {
  enabled: boolean
  conditional?: 'if-needed'
}

/** Per-step override in custom methodology config. */
export interface CustomStepConfig {
  enabled?: boolean
  depth?: DepthLevel
}

/** Custom methodology configuration object in config.yml. */
export interface CustomConfig {
  default_depth?: DepthLevel
  steps?: Record<string, CustomStepConfig>
}

/** Valid project types — derived from Zod schema (single source of truth). */
export type ProjectType = z.infer<typeof ProjectTypeSchema>

/** Web app configuration — derived from Zod schema (single source of truth). */
export type WebAppConfig = z.infer<typeof WebAppConfigSchema>

/** Backend configuration — derived from Zod schema (single source of truth). */
export type BackendConfig = z.infer<typeof BackendConfigSchema>

/** CLI tool configuration — derived from Zod schema (single source of truth). */
export type CliConfig = z.infer<typeof CliConfigSchema>

/** Library configuration — derived from Zod schema (single source of truth). */
export type LibraryConfig = z.infer<typeof LibraryConfigSchema>

/** Mobile app configuration — derived from Zod schema (single source of truth). */
export type MobileAppConfig = z.infer<typeof MobileAppConfigSchema>

/** Data pipeline configuration — derived from Zod schema (single source of truth). */
export type DataPipelineConfig = z.infer<typeof DataPipelineConfigSchema>

/** ML project configuration — derived from Zod schema (single source of truth). */
export type MlConfig = z.infer<typeof MlConfigSchema>

/** Browser extension configuration — derived from Zod schema (single source of truth). */
export type BrowserExtensionConfig = z.infer<typeof BrowserExtensionConfigSchema>

/** Research project configuration — derived from Zod schema (single source of truth). */
export type ResearchConfig = z.infer<typeof ResearchConfigSchema>

/**
 * Game-specific configuration — derived from Zod schema (single source of truth).
 * Only valid when projectType === 'game'.
 */
export type GameConfig = z.infer<typeof GameConfigSchema>

/** Game engine options — derived from GameConfig (single source of truth). */
export type GameEngine = GameConfig['engine']

/**
 * Discriminated union for detected project configuration (v3.10+).
 * Replaces the single `gameConfig` field with a polymorphic shape
 * so any project type's config can flow through the same channel.
 */
export type DetectedConfig =
  | { type: 'web-app'; config: WebAppConfig }
  | { type: 'backend'; config: BackendConfig }
  | { type: 'cli'; config: CliConfig }
  | { type: 'library'; config: LibraryConfig }
  | { type: 'mobile-app'; config: MobileAppConfig }
  | { type: 'data-pipeline'; config: DataPipelineConfig }
  | { type: 'ml'; config: MlConfig }
  | { type: 'browser-extension'; config: BrowserExtensionConfig }
  | { type: 'game'; config: GameConfig }
  | { type: 'research'; config: ResearchConfig }

/** Override entry for knowledge injection. */
export interface KnowledgeOverride {
  append: string[]
}

/** Override entry for reads remapping. */
export interface ReadsOverride {
  replace?: Record<string, string>
  append?: string[]
}

/** Override entry for dependency remapping. */
export interface DependencyOverride {
  replace?: Record<string, string>
  append?: string[]
}

/** Project-type overlay definition (e.g., game-overlay.yml). */
export interface ProjectTypeOverlay {
  name: string
  description: string
  projectType: ProjectType
  stepOverrides: Record<string, StepEnablementEntry>
  knowledgeOverrides: Record<string, KnowledgeOverride>
  readsOverrides: Record<string, ReadsOverride>
  dependencyOverrides: Record<string, DependencyOverride>
}

/** Project characteristics from config.yml. */
export interface ProjectConfig {
  name?: string
  platforms?: Array<'web' | 'mobile' | 'desktop'>
  projectType?: ProjectType
  gameConfig?: GameConfig
  webAppConfig?: WebAppConfig
  backendConfig?: BackendConfig
  cliConfig?: CliConfig
  libraryConfig?: LibraryConfig
  mobileAppConfig?: MobileAppConfig
  dataPipelineConfig?: DataPipelineConfig
  mlConfig?: MlConfig
  browserExtensionConfig?: BrowserExtensionConfig
  researchConfig?: ResearchConfig
  [key: string]: unknown  // forward compatibility
}

/**
 * Scaffold v2 project configuration (.scaffold/config.yml).
 * See config-yml-schema.md.
 */
export interface ScaffoldConfig {
  version: 2
  methodology: MethodologyName
  custom?: CustomConfig
  platforms: Array<'claude-code' | 'codex' | 'gemini'>
  project?: ProjectConfig
  [key: string]: unknown  // forward compatibility — unknown fields preserved per ADR-033
}

/** Methodology preset definition (from methodology/deep.yml, mvp.yml, custom-defaults.yml). */
export interface MethodologyPreset {
  name: string
  description: string
  default_depth: DepthLevel
  steps: Record<string, StepEnablementEntry>
}
