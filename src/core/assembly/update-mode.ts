import path from 'node:path'
import type { DepthLevel } from '../../types/enums.js'
import type { PipelineState } from '../../types/state.js'
import type { AssemblyMode, ExistingArtifact } from '../../types/assembly.js'
import type { ScaffoldWarning } from '../../types/errors.js'
import type { DetectSpec } from '../../types/frontmatter.js'
import fs from 'node:fs'
import { resolveContainedArtifactPath } from '../../utils/artifact-path.js'
import { verifyStep } from '../../state/completion.js'

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
  service?: string
}): UpdateModeResult {
  const { step, state, currentDepth, projectRoot, service } = options
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
    const outputPath = service ? path.join('services', service, relativePath) : relativePath
    const fullPath = resolveContainedArtifactPath(projectRoot, outputPath)
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

export interface AssemblyModeResult {
  mode: AssemblyMode
  /** Raw update-mode detection result (pre-verification gate). */
  updateDetection: UpdateModeResult
  existingArtifact?: ExistingArtifact
  previousDepth?: DepthLevel
  currentDepth: DepthLevel
  depthIncreased?: boolean
  warnings: ScaffoldWarning[]
}

/**
 * Resolve the assembly mode for a step per the D3 matrix (brownfield R3):
 *   - prior completion surviving as verification verified|declared → 'update'
 *   - no surviving completion + init-mode brownfield|v1-migration → 'adoption'
 *   - else → 'fresh'
 * A D10a artifact_map incumbent stands in as the prior artifact when the
 * step's own outputs are absent (fallback only — own outputs win).
 *
 * R1 carry-forward (live-conflict gate): a stored completion must survive a
 * LIVE check (verifyStep) before it can drive update mode or count as a
 * surviving completion — a completed step whose declared outputs are gone or
 * whose detect: contract now fails is conflicted, and its stale claim must
 * not enter update mode. It instead routes like a reopened step: adoption in
 * brownfield/v1-migration, else fresh.
 *
 * `stateless` (R3 whole-branch fix): a `category: tool` / `stateless: true`
 * step has no completion state to adopt — update mode is already impossible
 * for it (no stored entry), and it must never resolve to 'adoption' either.
 * Tools carry no `## Adoption Mode Specifics` block, and the adoption
 * preamble's "never propose rewrites of working code" framing is wrong for a
 * tool like review-code/review-pr/release. When `stateless === true`, the
 * adoption-routing branch is skipped entirely and the step resolves to
 * 'fresh' — greenfield-identical, regardless of init-mode.
 */
export function resolveAssemblyMode(options: {
  step: string
  state: PipelineState
  currentDepth: DepthLevel
  projectRoot: string
  service?: string
  artifactMap?: Record<string, string>
  expectedOutputs?: string[]
  detect?: DetectSpec | null
  /** True for `category: tool` / `stateless: true` steps — never routes to 'adoption'. */
  stateless?: boolean
}): AssemblyModeResult {
  const { step, state, currentDepth, projectRoot, artifactMap } = options
  const detection = detectUpdateMode(options)
  const entry = state.steps[step]
  const completed = entry?.status === 'completed'

  // R1 carry-forward (live-conflict gate): a stored completion must survive a
  // LIVE check before it can drive update mode OR count as a surviving
  // completion. A completed step whose declared outputs are gone OR whose
  // detect: contract now fails is conflicted (verifyStep → status 'conflict',
  // class 'state-claim'); its stale claim must not enter update mode, and it
  // routes like a reopened step — adoption in brownfield/v1, else fresh.
  // Gated on `completed` so the common adoption path (pending steps) never
  // spawns a detect: subprocess, and on `service === undefined` because R3
  // mapping/adoption is root-only and verifyStep does not service-prefix
  // outputs (a service-local completion would otherwise be a false conflict).
  const liveConflict =
    completed &&
    options.service === undefined &&
    verifyStep(
      step,
      entry,
      options.expectedOutputs ?? entry?.produces ?? [],
      options.detect ?? null,
      projectRoot,
      artifactMap,
    ).status === 'conflict'
  const completionSurvives = completed && !liveConflict

  // R1 (D3) verification enum. R1's contract is that an ABSENT value ≡
  // 'unverified' (Global Constraints). Migrated greenfield completions carry
  // 'declared' explicitly (artifacts_verified: true → 'declared' on load), so
  // update behavior is preserved through the field, not through the default.
  // Defaulting absent → 'declared' would let old adopt-created entries (which
  // never had artifacts_verified) regain update eligibility with no live check.
  const verification =
    (entry as { verification?: 'verified' | 'declared' | 'unverified' } | undefined)
      ?.verification ?? 'unverified'
  const updateEligible =
    completionSurvives && (verification === 'verified' || verification === 'declared')

  if (updateEligible && detection.isUpdateMode) {
    return {
      mode: 'update',
      updateDetection: detection,
      existingArtifact: detection.existingArtifact,
      previousDepth: detection.previousDepth,
      currentDepth,
      depthIncreased: detection.depthIncreased,
      warnings: detection.warnings,
    }
  }

  // D10a fallback: mapped incumbent as prior artifact (own outputs absent).
  // Note: artifact_map targets are project-root-relative; the service prefix
  // is not applied (root-level mapping only — multi-service mapping is out
  // of scope for R3).
  const mapped = artifactMap?.[step]
  if (updateEligible && mapped !== undefined) {
    const mappedFull = resolveContainedArtifactPath(projectRoot, mapped)
    if (mappedFull !== null) {
      try {
        if (fs.statSync(mappedFull).isFile()) {
          const existingArtifact: ExistingArtifact = {
            filePath: mapped,
            content: fs.readFileSync(mappedFull, 'utf8'),
            previousDepth: (entry?.depth ?? currentDepth) as DepthLevel,
            completionTimestamp: entry?.at ?? '',
          }
          return {
            mode: 'update',
            updateDetection: detection,
            existingArtifact,
            previousDepth: entry?.depth as DepthLevel | undefined,
            currentDepth,
            warnings: [],
          }
        }
      } catch {
        // mapped path unreadable — fall through
      }
    }
  }

  const initMode = state['init-mode']
  if (
    !completionSurvives &&
    !options.stateless &&
    (initMode === 'brownfield' || initMode === 'v1-migration')
  ) {
    return { mode: 'adoption', updateDetection: detection, currentDepth, warnings: [] }
  }

  return { mode: 'fresh', updateDetection: detection, currentDepth, warnings: [] }
}
