// src/project/detectors/index.ts
import type { SignalContext } from './context.js'
import type { Detector, DetectionMatch } from './types.js'

// Ordering is a performance optimization only. Correctness does NOT depend on order —
// all matches are collected and disambiguated per Section 3 Case A-G. Reordering is
// behavior-preserving. Current order: specific-signature detectors first (cheap
// distinctive failures), dep-heavy detectors middle, catch-all library last.
export const ALL_DETECTORS: readonly Detector[] = [
  // Detectors added in Tasks 5-7 — empty in this commit
]

export function runDetectors(
  ctx: SignalContext,
  detectors: readonly Detector[] = ALL_DETECTORS,
): DetectionMatch[] {
  const matches: DetectionMatch[] = []
  for (const detect of detectors) {
    const match = detect(ctx)
    if (match) matches.push(match)
  }
  return matches
}
