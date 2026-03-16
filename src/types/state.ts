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
  'schema-version': 1
  'scaffold-version': string  // semver
  init_methodology: MethodologyName
  config_methodology: MethodologyName
  'init-mode': 'greenfield' | 'brownfield' | 'v1-migration'
  created: string  // ISO 8601
  in_progress: InProgressRecord | null
  steps: Record<string, StepStateEntry>
  next_eligible: string[]  // Phase 2 cache; Phase 1 sets to []
  'extra-steps': ExtraStepEntry[]  // Phase 2; always [] in Phase 1
}
