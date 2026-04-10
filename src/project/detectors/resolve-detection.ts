// src/project/detectors/resolve-detection.ts
import type { DetectionMatch } from './types.js'
import type { ProjectType } from '../../types/index.js'
import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import { ExitCode } from '../../types/enums.js'
import { disambiguate, type DisambiguateOptions } from './disambiguate.js'

export interface ResolveDetectionInput {
  readonly matches: readonly DetectionMatch[]
  readonly explicitProjectType?: ProjectType
  readonly opts: DisambiguateOptions
}

export interface ResolveDetectionResult {
  readonly chosen: DetectionMatch | null
  readonly error?: ScaffoldError
  readonly warnings: readonly ScaffoldWarning[]
}

/** Synthesize an empty detection match for an explicitly-specified projectType. */
export function synthesizeEmptyMatch(projectType: ProjectType): DetectionMatch {
  return {
    projectType,
    confidence: 'high',
    partialConfig: {} as never,
    evidence: [{ signal: 'user-specified', note: '--project-type flag' }],
  } as DetectionMatch
}

export async function resolveDetection(
  input: ResolveDetectionInput,
): Promise<ResolveDetectionResult> {
  const warnings: ScaffoldWarning[] = []

  // Case G: user passed --project-type → short-circuits Cases A-F
  if (input.explicitProjectType) {
    return {
      chosen: synthesizeEmptyMatch(input.explicitProjectType),
      warnings,
    }
  }

  const high = input.matches.filter(m => m.confidence === 'high')
  const medium = input.matches.filter(m => m.confidence === 'medium')
  const low = input.matches.filter(m => m.confidence === 'low')

  // Case A: no matches
  if (input.matches.length === 0) {
    return { chosen: null, warnings }
  }

  // Case B: single high match
  if (high.length === 1) {
    if (medium.length > 0 || low.length > 0) {
      warnings.push({
        code: 'ADOPT_SECONDARY_MATCHES',
        message: `Committed ${high[0].projectType}; runners-up: `
          + `${[...medium, ...low].map(m => m.projectType).join(', ')}`,
        context: {
          winner: high[0].projectType,
          runners_up: [...medium, ...low].map(m => m.projectType).join(','),
        },
      })
    }
    return { chosen: high[0], warnings }
  }

  // Case C: multiple high matches → disambiguate (pass ALL eligible matches so runners-up are visible)
  if (high.length >= 2) {
    const eligible = [...high, ...medium, ...low]   // user sees the full picture
    // Override acceptLowConfidence: true when runners-up include low tier,
    // so disambiguate.filterEligible doesn't drop them from the picker
    const opts = low.length > 0
      ? { ...input.opts, acceptLowConfidence: true }
      : input.opts
    const result = await disambiguate(eligible, opts)
    if (result.nonTtyFallback) {
      warnings.push({
        code: 'ADOPT_NON_TTY',
        message: 'Non-TTY environment detected; disambiguation skipped (treated as --auto)',
      })
    }
    if (result.chosen) return { chosen: result.chosen, warnings }
    if (result.skipReason === 'auto') {
      return {
        chosen: null,
        error: {
          code: 'ADOPT_AMBIGUOUS',
          message: 'Detection found multiple plausible project types: '
            + `${high.map(m => m.projectType).join(', ')}. `
            + 'Re-run with --project-type <type> to choose.',
          exitCode: ExitCode.Ambiguous,
        },
        warnings,
      }
    }
    if (result.skipReason === 'user-cancelled') {
      // User Ctrl-C is a deliberate cancellation; surface as exit code 4
      return {
        chosen: null,
        error: {
          code: 'ADOPT_USER_CANCELLED',
          message: 'User cancelled the disambiguation prompt',
          exitCode: ExitCode.UserCancellation,
        },
        warnings,
      }
    }
    return { chosen: null, warnings }
  }

  // Case D: single medium match
  if (medium.length === 1) {
    if (low.length > 0) {
      warnings.push({
        code: 'ADOPT_SECONDARY_MATCHES',
        message: `Committed ${medium[0].projectType}; `
          + `low-confidence runners-up: ${low.map(m => m.projectType).join(', ')}`,
      })
    }
    return { chosen: medium[0], warnings }
  }

  // Case E: multiple medium matches → disambiguate (pass medium + low so runners-up are visible)
  if (medium.length >= 2) {
    const eligible = [...medium, ...low]
    // Override acceptLowConfidence: true when runners-up include low tier
    const opts = low.length > 0
      ? { ...input.opts, acceptLowConfidence: true }
      : input.opts
    const result = await disambiguate(eligible, opts)
    if (result.nonTtyFallback) {
      warnings.push({
        code: 'ADOPT_NON_TTY',
        message: 'Non-TTY environment detected; disambiguation skipped (treated as --auto)',
      })
    }
    if (result.chosen) return { chosen: result.chosen, warnings }
    if (result.skipReason === 'auto') {
      return {
        chosen: null,
        error: {
          code: 'ADOPT_AMBIGUOUS',
          message: 'Detection found multiple plausible project types: '
            + `${medium.map(m => m.projectType).join(', ')}. `
            + 'Re-run with --project-type <type> to choose.',
          exitCode: ExitCode.Ambiguous,
        },
        warnings,
      }
    }
    if (result.skipReason === 'user-cancelled') {
      return {
        chosen: null,
        error: {
          code: 'ADOPT_USER_CANCELLED',
          message: 'User cancelled the disambiguation prompt',
          exitCode: ExitCode.UserCancellation,
        },
        warnings,
      }
    }
    return { chosen: null, warnings }
  }

  // Case F: only low matches — route through disambiguate so non-TTY/CI fallback is consistent
  if (low.length > 0) {
    const result = await disambiguate(low, { ...input.opts, acceptLowConfidence: true })
    if (result.nonTtyFallback) {
      warnings.push({
        code: 'ADOPT_NON_TTY',
        message: 'Non-TTY environment detected; low-tier disambiguation skipped',
      })
    }
    if (result.chosen) return { chosen: result.chosen, warnings }
    if (result.skipReason === 'auto') {
      // No interactive prompt available — emit ADOPT_LOW_ONLY warning + no commit
      warnings.push({
        code: 'ADOPT_LOW_ONLY',
        message: `Only low-confidence matches found: ${low.map(m => m.projectType).join(', ')}`,
      })
      return { chosen: null, warnings }
    }
    if (result.skipReason === 'user-cancelled') {
      return {
        chosen: null,
        error: {
          code: 'ADOPT_USER_CANCELLED',
          message: 'User cancelled the disambiguation prompt',
          exitCode: ExitCode.UserCancellation,
        },
        warnings,
      }
    }
    return { chosen: null, warnings }
  }

  return { chosen: null, warnings }
}
