import fs from 'node:fs'
import path from 'node:path'
import type { ScaffoldError, ScaffoldWarning, ProjectType, GameConfig, DetectedConfig } from '../types/index.js'
import type { Confidence, DetectionEvidence } from './detectors/types.js'
import { detectProjectMode } from './detector.js'
import { discoverMetaPrompts } from '../core/assembly/meta-prompt-loader.js'
import { createSignalContext } from './detectors/context.js'
import { runDetectors } from './detectors/index.js'

export type AdaptationStrategy = 'update-mode' | 'skip-recommended' | 'context-only' | 'full-run'

export interface ArtifactMatch {
  artifactPath: string      // relative path of existing file
  matchedStep: string       // step slug
  strategy: AdaptationStrategy
}

export interface AdoptionResult {
  mode: 'greenfield' | 'brownfield' | 'v1-migration'
  artifactsFound: number
  detectedArtifacts: ArtifactMatch[]
  stepsCompleted: string[]   // steps auto-marked as completed
  stepsRemaining: string[]   // steps still to run
  methodology: string
  errors: ScaffoldError[]
  warnings: ScaffoldWarning[]
  projectType?: ProjectType
  /** @deprecated Use detectedConfig instead. Removed in v4.0. */
  gameConfig?: Partial<GameConfig>
  detectedConfig?: DetectedConfig
  detectionEvidence?: readonly DetectionEvidence[]
  detectionConfidence?: Confidence
}

/**
 * Scan projectRoot for existing artifacts, match to pipeline steps,
 * and pre-populate state.json.
 */
export async function runAdoption(options: {
  projectRoot: string
  metaPromptDir: string
  methodology: string
  dryRun: boolean
}): Promise<AdoptionResult> {
  const { projectRoot, metaPromptDir, methodology } = options

  // 1. Detect project mode
  const detection = detectProjectMode(projectRoot)

  // 2. Discover meta-prompts to get expected outputs per step
  const metaPrompts = discoverMetaPrompts(metaPromptDir)

  const detectedArtifacts: ArtifactMatch[] = []
  const stepsCompleted: string[] = []
  const stepsRemaining: string[] = []

  // 3. For each step, check if its expected outputs exist
  for (const [slug, mp] of metaPrompts.entries()) {
    const produces = mp.frontmatter.outputs ?? []
    if (produces.length === 0) continue

    const foundOutputs = produces.filter((relPath) => {
      return fs.existsSync(path.join(projectRoot, relPath))
    })

    if (foundOutputs.length > 0) {
      // Determine strategy based on how many outputs were found
      const strategy: AdaptationStrategy =
        foundOutputs.length === produces.length ? 'skip-recommended' : 'context-only'

      for (const p of foundOutputs) {
        detectedArtifacts.push({ artifactPath: p, matchedStep: slug, strategy })
      }
      stepsCompleted.push(slug)
    } else {
      stepsRemaining.push(slug)
    }
  }

  // 4. Project-type detection via SignalContext-backed detectors.
  //    Currently registers detectGame (Unity > Unreal > Godot > Bevy > Love2D > JS).
  //    Task 10/11 expand the result shape; Task 5 is behavior-preserving and only
  //    sets result.gameConfig when a game match exists.
  const ctx = createSignalContext(projectRoot)
  const matches = runDetectors(ctx)
  const gameMatch = matches.find((m) => m.projectType === 'game')

  const result: AdoptionResult = {
    mode: detection.mode,
    artifactsFound: detectedArtifacts.length,
    detectedArtifacts,
    stepsCompleted,
    stepsRemaining,
    methodology,
    errors: [],
    warnings: [...ctx.warnings],
  }

  if (gameMatch) {
    result.projectType = 'game'
    result.gameConfig = gameMatch.partialConfig           // deprecated alias (v4.0 removal)
    result.detectedConfig = { type: 'game', config: gameMatch.partialConfig }
    result.detectionEvidence = gameMatch.evidence
    result.detectionConfidence = gameMatch.confidence
  }

  return result
}

export interface FieldConflict {
  readonly field: string
  readonly existing: unknown
  readonly detected: unknown
}

/**
 * Shallow merge: existing values win on overlap, detected fills gaps.
 * Returns the merged object plus a list of FieldConflict records for any field
 * where detected and existing disagree (caller emits ADOPT_FIELD_CONFLICT warnings).
 *
 * Uses JSON.stringify for value equality so arrays and (future) nested objects
 * are compared by content, not reference.
 */
export function mergeRawConfig<T extends Record<string, unknown>>(
  detected: Partial<T>,
  existing: Record<string, unknown> | undefined,
): { merged: Record<string, unknown>; conflicts: FieldConflict[] } {
  const conflicts: FieldConflict[] = []
  const merged: Record<string, unknown> = { ...detected }

  if (existing) {
    for (const [key, existingVal] of Object.entries(existing)) {
      const detectedVal = detected[key as keyof T]
      if (detectedVal !== undefined) {
        // Compare by serialized form so arrays/objects aren't always "different"
        const detectedSerialized = JSON.stringify(detectedVal)
        const existingSerialized = JSON.stringify(existingVal)
        if (detectedSerialized !== existingSerialized) {
          conflicts.push({ field: key, existing: existingVal, detected: detectedVal })
        }
      }
      merged[key] = existingVal    // existing wins
    }
  }

  return { merged, conflicts }
}

export function applyFlagOverrides<T extends Record<string, unknown>>(
  base: Record<string, unknown>,
  overrides: Partial<T> | undefined,
): Record<string, unknown> {
  if (!overrides) return base
  return { ...base, ...overrides }   // flag values replace whatever was there
}

/**
 * Convert FieldConflict[] into ADOPT_FIELD_CONFLICT warnings for the orchestrator
 * to push onto result.warnings.
 */
export function emitFieldConflictWarnings(
  conflicts: readonly FieldConflict[],
  configKey: string,    // e.g. 'webAppConfig'
): import('../types/index.js').ScaffoldWarning[] {
  return conflicts.map(c => ({
    code: 'ADOPT_FIELD_CONFLICT',
    message: `${configKey}.${c.field}: existing value ` +
      `'${JSON.stringify(c.existing)}' wins over detected ` +
      `'${JSON.stringify(c.detected)}'. Pass --force --project-type <type> --<flag> to override.`,
    context: { field: c.field, existing: String(c.existing), detected: String(c.detected) },
  }))
}
