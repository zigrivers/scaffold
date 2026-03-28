import type { MetaPromptFrontmatter } from '../../types/index.js'
import type { PipelineState } from '../../types/index.js'
import type { DependencyGraph } from '../../types/index.js'
import type { ReworkStep } from '../../types/index.js'
import { PHASES } from '../../types/frontmatter.js'
import { topologicalSort } from '../dependency/dependency.js'

const MIN_PHASE = Math.min(...PHASES.map(p => p.number))
const MAX_PHASE = Math.max(...PHASES.map(p => p.number))

/**
 * Parse --phases flag value into an array of phase numbers.
 * Supports: "1-5" (range), "1,3,5" (list), "1-3,5" (mixed).
 */
export function parsePhases(input: string): number[] {
  const result = new Set<number>()

  for (const segment of input.split(',')) {
    const trimmed = segment.trim()
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-')
      const start = Number(startStr)
      const end = Number(endStr)
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error(`Invalid phase range: "${trimmed}"`)
      }
      if (start > end) {
        throw new Error(`Invalid phase range: "${trimmed}" (start must be <= end)`)
      }
      validatePhaseNumber(start)
      validatePhaseNumber(end)
      for (let i = start; i <= end; i++) {
        result.add(i)
      }
    } else {
      const n = Number(trimmed)
      if (!Number.isInteger(n)) {
        throw new Error(`Invalid phase number: "${trimmed}"`)
      }
      validatePhaseNumber(n)
      result.add(n)
    }
  }

  return [...result].sort((a, b) => a - b)
}

/**
 * Parse --through flag: returns [1, 2, ..., N].
 */
export function parseThrough(n: number): number[] {
  validatePhaseNumber(n)
  return Array.from({ length: n - MIN_PHASE + 1 }, (_, i) => i + MIN_PHASE)
}

/**
 * Apply --exclude: remove excluded phase numbers from the list.
 */
export function applyExclusions(phases: number[], exclude: number[]): number[] {
  const excludeSet = new Set(exclude)
  return phases.filter(p => !excludeSet.has(p))
}

/**
 * Given selected phase numbers and the full pipeline,
 * return the steps belonging to those phases in topological order.
 * Filters out conditional steps that have status="skipped" in state.
 */
export function resolveStepsForPhases(
  phaseNumbers: number[],
  metaPrompts: MetaPromptFrontmatter[],
  state: PipelineState,
  graph: DependencyGraph,
): ReworkStep[] {
  // Map phase numbers to phase slugs
  const selectedSlugs = new Set(
    phaseNumbers
      .map(n => PHASES.find(p => p.number === n)?.slug)
      .filter(s => s != null) as string[],
  )

  // Get steps in these phases
  const stepsInPhases = new Set<string>(
    metaPrompts
      .filter(mp => selectedSlugs.has(mp.phase as string))
      .filter(mp => {
        // Filter out conditional steps that were skipped
        if (mp.conditional === 'if-needed') {
          const stepState = state.steps[mp.name]
          if (stepState?.status === 'skipped') return false
        }
        return true
      })
      .map(mp => mp.name),
  )

  // Use topological sort to get correct order, then filter to our phases
  const sorted = topologicalSort(graph)
  const orderedSteps = sorted.filter(slug => stepsInPhases.has(slug))

  // Build ReworkStep objects
  return orderedSteps.map(slug => {
    const mp = metaPrompts.find(m => m.name === slug)!
    const phaseNumber = PHASES.find(p => p.slug === mp.phase)!.number
    return {
      name: slug,
      phase: phaseNumber,
      status: 'pending' as const,
      completed_at: null,
      error: null,
    }
  })
}

function validatePhaseNumber(n: number): void {
  if (n < MIN_PHASE || n > MAX_PHASE) {
    throw new Error(`Phase number ${n} out of range (${MIN_PHASE}-${MAX_PHASE})`)
  }
}
