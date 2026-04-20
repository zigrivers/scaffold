import type { StepStatus, StepSource, DepthLevel, MethodologyName } from './enums.js'

/** A single step's state entry in state.json. */
export interface StepStateEntry {
  status: StepStatus
  source: StepSource
  at?: string  // ISO 8601 timestamp (absent for pending)
  produces?: string[]  // expected output paths (set at init from frontmatter)
  artifacts_verified?: boolean
  completed_by?: string
  reason?: string  // only when skipped
  depth?: DepthLevel  // only when completed
}

/**
 * In-progress execution record. Non-null = either active or crashed.
 * See state-json-schema.md InProgressRecord.
 */
export interface InProgressRecord {
  step: string
  started: string  // ISO 8601
  partial_artifacts: string[]
  actor: string
}

/**
 * User-added custom step. Phase 2 — reserved as empty array in Phase 1.
 * See state-json-schema.md ExtraStepEntry.
 */
export interface ExtraStepEntry {
  slug: string
  path: string
  'depends-on'?: string[]
  phase?: string
}

/**
 * Complete pipeline state file (.scaffold/state.json).
 * See state-json-schema.md.
 */
export interface PipelineState {
  'schema-version': 1 | 2 | 3
  'scaffold-version': string  // semver
  init_methodology: MethodologyName
  config_methodology: MethodologyName
  'init-mode': 'greenfield' | 'brownfield' | 'v1-migration'
  created: string  // ISO 8601
  in_progress: InProgressRecord | null
  steps: Record<string, StepStateEntry>
  next_eligible: string[]  // Phase 2 cache; Phase 1 sets to []

  /**
   * Monotonic counter bumped on every root-state saveState. Used by service
   * state files to detect when root has mutated since the service cached
   * next_eligible. Present only in root state (service state files never
   * carry a save_counter of their own). Absent on legacy files.
   */
  save_counter?: number

  /**
   * Pipeline-graph hash recorded when `next_eligible` was written. Absent on
   * legacy files → treated as "always stale" on read → triggers live recompute.
   */
  next_eligible_hash?: string

  /**
   * SERVICE state only: root state's save_counter at cache-write time. If this
   * no longer matches the current root save_counter, the service cache is
   * invalidated (root mutation invalidates service eligibility because service
   * steps depend on global step completion through the merged state view).
   */
  next_eligible_root_counter?: number

  'extra-steps': ExtraStepEntry[]  // Phase 2; always [] in Phase 1
}
