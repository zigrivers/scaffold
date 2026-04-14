import type { DepthLevel } from '../../types/enums.js'
import type { PipelineState } from '../../types/state.js'
import type { ExistingArtifact } from '../../types/assembly.js'
import type { ScaffoldWarning } from '../../types/errors.js'
import fs from 'node:fs'
import { resolveContainedArtifactPath } from '../../utils/artifact-path.js'

export interface UpdateModeResult {
  isUpdateMode: boolean
  existingArtifact?: ExistingArtifact
  previousDepth?: DepthLevel
  currentDepth: DepthLevel
  depthIncreased?: boolean
  warnings: ScaffoldWarning[]
}

/**
 * Detect whether a step is being re-run (update mode).
 * Update mode is active when:
 *   1. The step status is 'completed', AND
 *   2. At least one artifact produced by the step exists on disk.
 */
export function detectUpdateMode(options: {
  step: string
  state: PipelineState
  currentDepth: DepthLevel
  projectRoot: string
}): UpdateModeResult {
  const { step, state, currentDepth, projectRoot } = options
  const stepEntry = state.steps[step]

  // Not completed — definitely not update mode
  if (!stepEntry || stepEntry.status !== 'completed') {
    return { isUpdateMode: false, currentDepth, warnings: [] }
  }

  const produces = stepEntry.produces ?? []

  // No artifacts listed — not update mode
  if (produces.length === 0) {
    return { isUpdateMode: false, currentDepth, warnings: [] }
  }

  // Find the first file artifact that exists on disk (skip directories).
  // Both relPath and its containment-checked fullPath are tracked together
  // so the downstream read site does not need a non-null assertion.
  let firstExisting: { relPath: string; fullPath: string } | undefined
  for (const relativePath of produces) {
    const fullPath = resolveContainedArtifactPath(projectRoot, relativePath)
    if (fullPath === null) continue // path escapes project root — skip
    try {
      const stat = fs.statSync(fullPath)
      if (stat.isFile()) {
        firstExisting = { relPath: relativePath, fullPath }
        break
      }
    } catch {
      // Path does not exist — skip
    }
  }

  // No artifacts exist on disk — not update mode
  if (firstExisting === undefined) {
    return { isUpdateMode: false, currentDepth, warnings: [] }
  }

  // Update mode triggered — read first artifact content.
  // TypeScript has narrowed `firstExisting` to non-undefined by this point
  // (the early-return for the not-found case runs above this line).
  const { relPath: firstExistingRelPath, fullPath } = firstExisting
  const content = fs.readFileSync(fullPath, 'utf8')
  const previousDepth = stepEntry.depth as DepthLevel | undefined
  const completionTimestamp = stepEntry.at ?? ''

  const existingArtifact: ExistingArtifact = {
    filePath: firstExistingRelPath,
    content,
    previousDepth: previousDepth as DepthLevel,
    completionTimestamp,
  }

  const warnings: ScaffoldWarning[] = []

  if (previousDepth !== undefined && previousDepth !== currentDepth) {
    warnings.push({
      code: 'ASM_DEPTH_CHANGED',
      message:
        `Step '${step}' was previously executed at depth ${previousDepth}` +
        `; now executing at depth ${currentDepth}`,
    })

    if (currentDepth < previousDepth) {
      warnings.push({
        code: 'ASM_DEPTH_DOWNGRADE',
        message:
          `Re-running step '${step}' at a lower depth (${currentDepth})` +
          ` than original execution (${previousDepth})`,
      })
    }
  }

  const depthIncreased =
    previousDepth !== undefined ? currentDepth > previousDepth : undefined

  return {
    isUpdateMode: true,
    existingArtifact,
    previousDepth,
    currentDepth,
    depthIncreased,
    warnings,
  }
}
