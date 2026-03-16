/** Methodology preset name. See config-yml-schema.md. */
export type MethodologyName = 'deep' | 'mvp' | 'custom'

/**
 * Depth level scale 1-5. 1=minimal, 5=comprehensive.
 * ADR-043: depth scale.
 */
export type DepthLevel = 1 | 2 | 3 | 4 | 5

/** Source of a pipeline step. 'extra' is Phase 2 (reserved). */
export type StepSource = 'pipeline' | 'extra'

/** Pipeline step lifecycle status. */
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

/** CLI process exit codes. ADR-025. */
export enum ExitCode {
  Success = 0,
  ValidationError = 1,
  MissingDependency = 2,
  StateCorruption = 3,
  UserCancellation = 4,
  BuildError = 5,
}

/** Output mode for CLI. */
export type OutputMode = 'interactive' | 'json' | 'auto'
