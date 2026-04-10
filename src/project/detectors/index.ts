// src/project/detectors/index.ts
import type { SignalContext } from './context.js'
import type { Detector, DetectionMatch } from './types.js'
import { detectGame } from './game.js'
import { detectBrowserExtension } from './browser-extension.js'
import { detectMobileApp } from './mobile-app.js'
import { detectDataPipeline } from './data-pipeline.js'
import { detectWebApp } from './web-app.js'
import { detectBackend } from './backend.js'
import { detectMl } from './ml.js'
import { detectCli } from './cli.js'
import { detectLibrary } from './library.js'

// Order is a PERFORMANCE optimization only. Correctness does NOT depend on order
// — all matches are collected and disambiguated per Section 3 Case A-G.
export const ALL_DETECTORS: readonly Detector[] = [
  // Tier 1: distinctive root-file detectors (cheap distinctive failures)
  detectGame, detectBrowserExtension, detectMobileApp, detectDataPipeline,
  // Tier 2: dep-heavy detectors
  detectWebApp, detectBackend, detectMl, detectCli,
  // Tier 3: catch-all
  detectLibrary,
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
