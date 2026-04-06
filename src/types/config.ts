import type { MethodologyName, DepthLevel } from './enums.js'
import type { z } from 'zod'
import { ProjectTypeSchema, WebAppConfigSchema, BackendConfigSchema, CliConfigSchema } from '../config/schema.js'

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

/** Game engine options. */
export type GameEngine = 'unity' | 'unreal' | 'godot' | 'custom'

/** Game-specific configuration. Only valid when projectType === 'game'. */
export interface GameConfig {
  engine: GameEngine
  multiplayerMode: 'none' | 'local' | 'online' | 'hybrid'
  narrative: 'none' | 'light' | 'heavy'
  contentStructure: 'discrete' | 'open-world' | 'procedural' | 'endless' | 'mission-based'
  economy: 'none' | 'progression' | 'monetized' | 'both'
  onlineServices: Array<'leaderboards' | 'accounts' | 'matchmaking' | 'live-ops'>
  persistence: 'none' | 'settings-only' | 'profile' | 'progression' | 'cloud'
  targetPlatforms: Array<'pc' | 'web' | 'ios' | 'android' | 'ps5' | 'xbox' | 'switch' | 'vr' | 'ar'>
  supportedLocales: string[]
  hasModding: boolean
  npcAiComplexity: 'none' | 'simple' | 'complex'
}

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
