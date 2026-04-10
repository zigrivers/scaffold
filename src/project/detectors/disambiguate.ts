// src/project/detectors/disambiguate.ts
import type { DetectionMatch, Confidence } from './types.js'
import type { ProjectType } from '../../types/index.js'

export interface DisambiguateOptions {
  readonly interactive: boolean             // false under --auto OR non-TTY OR CI env
  readonly acceptLowConfidence: boolean     // true when --force allows low-tier into picker
}

export interface DisambiguateResult {
  readonly chosen: DetectionMatch | null
  readonly skipReason?: 'auto' | 'user-skipped' | 'user-cancelled' | 'no-eligible-matches'
  readonly nonTtyFallback?: boolean
}

// skipReason values:
//   'auto'                — opts.interactive was false OR non-TTY/CI fallback
//   'user-skipped'        — user picked "None of these" in the prompt
//   'user-cancelled'      — user Ctrl-C'd the prompt (ExitPromptError)
//   'no-eligible-matches' — disambiguate() called with empty matches

const PROJECT_TYPE_PREFERENCE: readonly ProjectType[] = [
  'web-app', 'backend', 'cli', 'library', 'mobile-app',
  'data-pipeline', 'ml', 'browser-extension', 'game',
]

function tierRank(c: Confidence): number {
  return c === 'high' ? 2 : c === 'medium' ? 1 : 0
}

function sortMatches(matches: readonly DetectionMatch[]): DetectionMatch[] {
  return [...matches].sort((a, b) => {
    const tierDiff = tierRank(b.confidence) - tierRank(a.confidence)
    if (tierDiff !== 0) return tierDiff
    const evidenceDiff = b.evidence.length - a.evidence.length
    if (evidenceDiff !== 0) return evidenceDiff
    return PROJECT_TYPE_PREFERENCE.indexOf(a.projectType)
      - PROJECT_TYPE_PREFERENCE.indexOf(b.projectType)
  })
}

function filterEligible(
  matches: readonly DetectionMatch[],
  acceptLowConfidence: boolean,
): DetectionMatch[] {
  const highMed = matches.filter(m => m.confidence !== 'low')
  if (highMed.length > 0 && !acceptLowConfidence) return highMed
  return [...matches]    // include low if force OR if low is the only tier
}

function formatEvidence(match: DetectionMatch): string {
  const shown = match.evidence.slice(0, 5)
  const parts = shown.map(e => e.file ? `${e.signal} (${e.file})` : e.signal)
  if (match.evidence.length > 5) parts.push(`… (+${match.evidence.length - 5} more)`)
  return parts.join(', ')
}

export async function disambiguate(
  matches: readonly DetectionMatch[],
  opts: DisambiguateOptions,
): Promise<DisambiguateResult> {
  if (matches.length === 0) {
    return { chosen: null, skipReason: 'no-eligible-matches' }
  }

  const isCi = process.env.CI === 'true' || process.env.CI === '1'
  const isTty = process.stdin.isTTY === true && process.stdout.isTTY === true
  const interactive = opts.interactive && isTty && !isCi

  if (!interactive) {
    return {
      chosen: null,
      skipReason: 'auto',
      nonTtyFallback: opts.interactive,   // true means user wanted interactive but env didn't allow it
    }
  }

  const eligible = sortMatches(filterEligible(matches, opts.acceptLowConfidence))
  if (eligible.length === 0) {
    return { chosen: null, skipReason: 'no-eligible-matches' }
  }

  // Dynamic import to keep this module tree-shakable
  const { select } = await import('@inquirer/prompts')

  const header = eligible.every(m => m.confidence === 'low')
    ? 'We found weak signals for these project types but couldn\'t be confident:'
    : 'We detected multiple plausible project types:'

  const choices = eligible.map(m => ({
    name: `${m.projectType.padEnd(20)} [${m.confidence}]  ${formatEvidence(m)}`,
    value: m as DetectionMatch | null,
  }))
  choices.push({
    name: 'None of these — continue without a project type',
    value: null,
  })

  try {
    const choice = await select({
      message: header,
      choices,
      default: choices[0].value,
    })
    if (choice === null) {
      return { chosen: null, skipReason: 'user-skipped' }
    }
    return { chosen: choice }
  } catch (err) {
    if ((err as Error)?.name === 'ExitPromptError') {
      return { chosen: null, skipReason: 'user-cancelled' }
    }
    throw err
  }
}
