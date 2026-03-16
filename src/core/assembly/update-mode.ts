import type { DepthLevel } from '../../types/enums.js'
import type { PipelineState } from '../../types/state.js'
import type { ExistingArtifact } from '../../types/assembly.js'
import type { ScaffoldWarning } from '../../types/errors.js'
import fs from 'node:fs'
import path from 'node:path'

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

  // Find the first artifact that exists on disk
  let firstExistingRelPath: string | undefined
  for (const relativePath of produces) {
    const fullPath = path.resolve(projectRoot, relativePath)
    if (fs.existsSync(fullPath)) {
      firstExistingRelPath = relativePath
      break
    }
  }

  // No artifacts exist on disk — not update mode
  if (firstExistingRelPath === undefined) {
    return { isUpdateMode: false, currentDepth, warnings: [] }
  }

  // Update mode triggered — read first artifact content
  const fullPath = path.resolve(projectRoot, firstExistingRelPath)
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
