// src/validation/dependency-validator.ts

import type { ScaffoldError, ScaffoldWarning } from '../types/index.js'
import { discoverMetaPrompts } from '../core/assembly/meta-prompt-loader.js'
import { buildGraph } from '../core/dependency/graph.js'
import { detectCycles } from '../core/dependency/dependency.js'

/**
 * Load all meta-prompts from pipelineDir, build the dependency graph,
 * and detect cycles / missing targets / self-references.
 */
export function validateDependencies(pipelineDir: string): {
  errors: ScaffoldError[]
  warnings: ScaffoldWarning[]
} {
  const errors: ScaffoldError[] = []
  const warnings: ScaffoldWarning[] = []

  // Discover meta-prompts (skips files with invalid frontmatter with a warning)
  let metaPrompts: ReturnType<typeof discoverMetaPrompts>
  try {
    metaPrompts = discoverMetaPrompts(pipelineDir)
  } catch {
    // If discovery fails entirely (e.g. pipelineDir unreadable), skip
    return { errors, warnings }
  }

  if (metaPrompts.size === 0) {
    return { errors, warnings }
  }

  // Build frontmatter list for graph construction
  const frontmatters = [...metaPrompts.values()].map(mp => mp.frontmatter)

  // Build graph with all steps enabled (no preset filtering during validation)
  const allEnabled = new Map(frontmatters.map(fm => [fm.name, { enabled: true }]))
  const graph = buildGraph(frontmatters, allEnabled)

  // Detect cycles, self-references, missing targets
  const cycleErrors = detectCycles(graph)
  errors.push(...cycleErrors)

  return { errors, warnings }
}
