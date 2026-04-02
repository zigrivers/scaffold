import type { MethodologyName, DepthLevel } from './enums.js'

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

/** Project characteristics from config.yml. */
export interface ProjectConfig {
  name?: string
  platforms?: Array<'web' | 'mobile' | 'desktop'>
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
  steps: Record<string, { enabled: boolean; conditional?: 'if-needed' }>
}
