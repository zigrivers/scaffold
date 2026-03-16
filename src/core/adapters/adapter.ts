import type { ScaffoldError } from '../../types/index.js'

/** An output file to write during the build phase. */
export interface OutputFile {
  relativePath: string
  content: string
  writeMode: 'create' | 'section'
}

/** Context passed to adapter.initialize() */
export interface AdapterContext {
  projectRoot: string
  methodology: string
  allSteps: string[]
}

/** Result from initialize() */
export interface AdapterInitResult {
  success: boolean
  errors: ScaffoldError[]
}

/** Per-step input to generateStepWrapper() */
export interface AdapterStepInput {
  slug: string
  description: string
  phase: string | null
  dependsOn: string[]
  produces: string[]
  pipelineIndex: number  // position in sorted order
}

/** Output from generateStepWrapper() */
export interface AdapterStepOutput {
  slug: string
  platformId: string
  files: OutputFile[]
  success: boolean
}

/** Input to finalize() */
export interface AdapterFinalizeInput {
  results: AdapterStepOutput[]
}

/** Result from finalize() */
export interface AdapterFinalizeResult {
  files: OutputFile[]
  errors: ScaffoldError[]
}

/**
 * Platform adapter lifecycle:
 * 1. initialize(context) — called once before any steps
 * 2. generateStepWrapper(input) — called once per enabled step
 * 3. finalize(results) — called once after all steps
 */
export interface PlatformAdapter {
  readonly platformId: string
  initialize(context: AdapterContext): AdapterInitResult
  generateStepWrapper(input: AdapterStepInput): AdapterStepOutput
  finalize(input: AdapterFinalizeInput): AdapterFinalizeResult
}

/**
 * Factory that returns the adapter for the given platformId.
 * Throws UNKNOWN_PLATFORM error if platformId is not registered.
 */
export function createAdapter(platformId: string): PlatformAdapter {
  // Dynamic imports are NOT used — adapters are registered at build time.
  // This will be fully implemented once T-040, T-041, T-042 are done.
  // For now: throw for all platforms (none registered yet).
  throw Object.assign(new Error(`Unknown platform: ${platformId}`), {
    code: 'UNKNOWN_PLATFORM',
    exitCode: 1,
  })
}

/** Register of known platform IDs */
export const KNOWN_PLATFORMS = ['claude-code', 'codex', 'universal'] as const
export type KnownPlatformId = typeof KNOWN_PLATFORMS[number]
