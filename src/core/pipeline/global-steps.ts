import fs from 'node:fs'
import path from 'node:path'
import { loadStructuralOverlay } from '../assembly/overlay-loader.js'

/**
 * Load the set of global step slugs from multi-service-overlay.yml.
 * Lightweight alternative to full resolvePipeline() for commands
 * that only need the global/per-service classification.
 */
export function loadGlobalStepSlugs(methodologyDir: string): Set<string> {
  const overlayPath = path.join(methodologyDir, 'multi-service-overlay.yml')
  if (!fs.existsSync(overlayPath)) return new Set()
  const { overlay } = loadStructuralOverlay(overlayPath)
  if (!overlay) return new Set()
  return new Set(Object.keys(overlay.stepOverrides))
}
