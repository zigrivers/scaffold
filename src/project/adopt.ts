import fs from 'node:fs'
import path from 'node:path'
import { parseDocument, isMap, isScalar, type Document } from 'yaml'
import { z } from 'zod'
import type { ScaffoldError, ScaffoldWarning, ProjectType, GameConfig, DetectedConfig } from '../types/index.js'
import type { Confidence, DetectionEvidence } from './detectors/types.js'
import type { DetectionMatch } from './detectors/types.js'
import { assertNever } from './detectors/types.js'
import { detectProjectMode } from './detector.js'
import { discoverMetaPrompts } from '../core/assembly/meta-prompt-loader.js'
import { createSignalContext } from './detectors/context.js'
import { runDetectors } from './detectors/index.js'
import { resolveDetection } from './detectors/resolve-detection.js'
import {
  WebAppConfigSchema, BackendConfigSchema, CliConfigSchema, LibraryConfigSchema,
  MobileAppConfigSchema, DataPipelineConfigSchema, MlConfigSchema,
  BrowserExtensionConfigSchema, GameConfigSchema, ResearchConfigSchema,
} from '../config/schema.js'
import { ExitCode } from '../types/enums.js'
import { configParseError, configNotObject } from '../utils/errors.js'
import type { PartialConfigOverrides } from '../cli/init-flag-families.js'

// CRITICAL: project-type → typed-config-key mapping. Do NOT derive via string transforms
// — `'web-app'.replace('-','')` produces 'webapp', not 'webApp'.
const TYPE_KEY: Record<ProjectType, string> = {
  'web-app':           'webAppConfig',
  'mobile-app':        'mobileAppConfig',
  'backend':           'backendConfig',
  'cli':               'cliConfig',
  'library':           'libraryConfig',
  'game':              'gameConfig',
  'data-pipeline':     'dataPipelineConfig',
  'ml':                'mlConfig',
  'browser-extension': 'browserExtensionConfig',
  'research':          'researchConfig',
}

// Exported for use by CLI handler's writeOrUpdateConfig
export { TYPE_KEY }

// Map project type to its Zod schema for parse/validation
function schemaForType(type: ProjectType): z.ZodType {
  switch (type) {
  case 'web-app':           return WebAppConfigSchema
  case 'backend':           return BackendConfigSchema
  case 'cli':               return CliConfigSchema
  case 'library':           return LibraryConfigSchema
  case 'mobile-app':        return MobileAppConfigSchema
  case 'data-pipeline':     return DataPipelineConfigSchema
  case 'ml':                return MlConfigSchema
  case 'browser-extension': return BrowserExtensionConfigSchema
  case 'game':              return GameConfigSchema
  case 'research':          return ResearchConfigSchema
  default: return assertNever(type as never)
  }
}

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
  auto?: boolean
  force?: boolean
  verbose?: boolean
  explicitProjectType?: ProjectType
  flagOverrides?: PartialConfigOverrides
}): Promise<AdoptionResult> {
  const { projectRoot, metaPromptDir, methodology } = options
  const auto = options.auto ?? false
  const force = options.force ?? false
  const explicitProjectType = options.explicitProjectType
  const flagOverrides = options.flagOverrides

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

  const result: AdoptionResult = {
    mode: detection.mode,
    artifactsFound: detectedArtifacts.length,
    detectedArtifacts,
    stepsCompleted,
    stepsRemaining,
    methodology,
    errors: [],
    warnings: [],
  }

  // 4. Project-type detection via SignalContext-backed detectors + resolveDetection pipeline.

  // Build SignalContext + run detectors
  const ctx = createSignalContext(projectRoot)
  const detectorMatches = runDetectors(ctx)

  // Re-adoption: read existing config.yml (if any) BEFORE Case A-G resolves
  const configPath = path.join(projectRoot, '.scaffold', 'config.yml')
  let existingDoc: Document | undefined
  let existingProjectType: ProjectType | undefined
  let existingTypedConfigRaw: Record<string, unknown> | undefined

  if (fs.existsSync(configPath)) {
    const text = fs.readFileSync(configPath, 'utf8')
    existingDoc = parseDocument(text)
    if (existingDoc.errors.length > 0) {
      result.errors.push(configParseError(configPath, existingDoc.errors[0].message))
      return result
    }
    const projectNode = existingDoc.get('project', true)
    // A null Scalar (YAML `project:` with no value) is fine — treated as empty project
    if (projectNode !== undefined && !isMap(projectNode) && !isScalar(projectNode)) {
      result.errors.push(configNotObject(configPath))
      return result
    }
    const projectJs = existingDoc.toJS()?.project as Record<string, unknown> | undefined
    existingProjectType = projectJs?.projectType as ProjectType | undefined
    if (existingProjectType) {
      existingTypedConfigRaw = projectJs?.[TYPE_KEY[existingProjectType]] as Record<string, unknown> | undefined
    }
  }

  // Re-adoption gating
  if (existingProjectType && !force && !explicitProjectType) {
    // SKIP detection — just re-run artifact scan (existing behavior)
    result.warnings.push({
      code: 'ADOPT_DETECTION_INCONCLUSIVE',
      message: `Project already adopted as '${existingProjectType}'. `
        + 'Pass --force to re-detect, or --project-type to switch.',
    })
    result.projectType = existingProjectType
    // Carry through context warnings
    result.warnings.push(...ctx.warnings)
    return result
  }

  // Project-type conflict check
  if (existingProjectType && explicitProjectType
      && explicitProjectType !== existingProjectType
      && !force) {
    result.errors.push({
      code: 'ADOPT_TYPE_CONFLICT',
      message: `Existing projectType is '${existingProjectType}' but `
        + `--project-type=${explicitProjectType} was passed. `
        + 'Re-run with --force to overwrite.',
      exitCode: ExitCode.Ambiguous,
    })
    return result
  }

  const decision = await resolveDetection({
    matches: detectorMatches,
    explicitProjectType,
    opts: {
      interactive: !auto,
      acceptLowConfidence: force,
    },
  })

  result.warnings.push(...ctx.warnings, ...decision.warnings)

  if (decision.error) {
    result.errors.push(decision.error)
    return result
  }

  if (decision.chosen) {
    // Type-changed warning if re-adoption picked a different type
    if (existingProjectType && existingProjectType !== decision.chosen.projectType) {
      result.warnings.push({
        code: 'ADOPT_TYPE_CHANGED',
        message: `Re-adoption changed projectType from '${existingProjectType}' to '${decision.chosen.projectType}'`,
        context: { from: existingProjectType, to: decision.chosen.projectType },
      })
    }

    try {
      const finalized = finalizeConfigFromMatch(
        decision.chosen,
        flagOverrides,
        // Only pass existing raw if same type (avoids merging across types)
        existingProjectType === decision.chosen.projectType ? existingTypedConfigRaw : undefined,
      )

      // Emit field-conflict warnings from the merge
      if (finalized.conflicts.length > 0) {
        result.warnings.push(...emitFieldConflictWarnings(
          finalized.conflicts,
          TYPE_KEY[decision.chosen.projectType],
        ))
      }

      result.projectType = decision.chosen.projectType
      result.detectedConfig = {
        type: decision.chosen.projectType,
        config: finalized.config,
      } as DetectedConfig
      result.detectionEvidence = decision.chosen.evidence
      result.detectionConfidence = decision.chosen.confidence

      // Dual-emit gameConfig (deprecation alias, removed v4.0)
      if (decision.chosen.projectType === 'game') {
        result.gameConfig = finalized.config as Partial<GameConfig>
        result.warnings.push({
          code: 'ADOPT_GAME_CONFIG_DEPRECATED',
          message: 'The \'gameConfig\' field is deprecated. '
            + 'Use \'detectedConfig\' (when type === \'game\'). Removed in v4.0.',
        })
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        const missing = err.errors.map(e => e.path.join('.')).join(', ')
        result.errors.push({
          code: 'ADOPT_MISSING_REQUIRED_FIELDS',
          message: `Schema validation failed for ${decision.chosen.projectType}: `
            + `missing or invalid fields [${missing}]. `
            + 'Run \'scaffold init --help\' to see the available flags.',
          exitCode: ExitCode.ValidationError,
          context: { type: decision.chosen.projectType, missing },
        })
        return result
      }
      throw err
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// finalizeConfigFromMatch — merge pipeline: existing → detected → flags → Zod
// ---------------------------------------------------------------------------

interface FinalizedResult {
  readonly config: unknown    // narrowed by caller via projectType
  readonly conflicts: readonly FieldConflict[]
}

function finalizeConfigFromMatch(
  match: DetectionMatch,
  flagOverrides: PartialConfigOverrides | undefined,
  existingTypedConfigRaw: Record<string, unknown> | undefined,
): FinalizedResult {
  // Step 1: pre-parse merge — existing wins over detected
  const { merged, conflicts } = mergeRawConfig(
    match.partialConfig as Record<string, unknown>,
    existingTypedConfigRaw,
  )

  // Step 2: apply flag overrides — flags replace whatever survived step 1
  const overridePartial = flagOverrides?.type === match.projectType
    ? (flagOverrides.partial as Record<string, unknown>)
    : undefined
  const flagged = applyFlagOverrides(merged, overridePartial)

  // Step 3: Zod.parse — applies defaults to fields still unset
  const schema = schemaForType(match.projectType)
  const config = schema.parse(flagged)

  return { config, conflicts }
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
