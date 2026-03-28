import type { DepthLevel } from './enums.js'

/** Status of a step within a rework session. */
export type ReworkStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'

/** A single step tracked in the rework session. */
export interface ReworkStep {
  name: string
  phase: number
  status: ReworkStepStatus
  completed_at: string | null
  error: string | null
}

/** Configuration for a rework session, captured from CLI flags. */
export interface ReworkConfig {
  phases: number[]
  depth: DepthLevel | null
  fix: boolean
  fresh: boolean
  auto: boolean
}

/** Aggregate stats for the rework session. */
export interface ReworkStats {
  total: number
  completed: number
  skipped: number
  failed: number
}

/** Persistent rework session stored in .scaffold/rework.json. */
export interface ReworkSession {
  schema_version: 1
  created: string
  config: ReworkConfig
  steps: ReworkStep[]
  current_step: string | null
  stats: ReworkStats
}
