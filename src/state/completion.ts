import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import type { PipelineState, StepStateEntry, VerificationLevel } from '../types/index.js'
import type { DetectSpec, DetectCheck } from '../types/frontmatter.js'
import { fileExists } from '../utils/fs.js'
import { resolveContainedArtifactPath } from '../utils/artifact-path.js'

export interface CompletionResult {
  complete: boolean
  artifactsPresent: string[]
  artifactsMissing: string[]
}

export interface CrashRecoveryAction {
  action: 'auto_complete' | 'recommend_rerun' | 'ask_user'
  presentArtifacts: string[]
  missingArtifacts: string[]
}

/** Check whether a step's expected outputs are present on disk. */
export function detectCompletion(
  step: string,
  state: PipelineState,
  expectedOutputs: string[],
  projectRoot: string,
  service?: string,
): CompletionResult {
  const artifactsPresent: string[] = []
  const artifactsMissing: string[] = []

  for (const output of expectedOutputs) {
    const relPath = service ? path.join('services', service, output) : output
    const fullPath = resolveContainedArtifactPath(projectRoot, relPath)
    if (fullPath !== null && fileExists(fullPath)) {
      artifactsPresent.push(output)
    } else {
      artifactsMissing.push(output)
    }
  }

  return {
    complete: artifactsMissing.length === 0,
    artifactsPresent,
    artifactsMissing,
  }
}

/** Check state vs artifact existence — returns status enum. */
export function checkCompletion(
  step: string,
  state: PipelineState,
  projectRoot: string,
): {
  status: 'confirmed_complete' | 'likely_complete' | 'conflict' | 'incomplete'
  presentArtifacts: string[]
  missingArtifacts: string[]
} {
  const stepEntry = state.steps[step]
  const expectedOutputs = stepEntry?.produces ?? []
  const stateCompleted = stepEntry?.status === 'completed'

  const presentArtifacts: string[] = []
  const missingArtifacts: string[] = []

  for (const output of expectedOutputs) {
    const fullPath = resolveContainedArtifactPath(projectRoot, output)
    if (fullPath !== null && fileExists(fullPath)) {
      presentArtifacts.push(output)
    } else {
      missingArtifacts.push(output)
    }
  }

  const allPresent = missingArtifacts.length === 0

  if (stateCompleted && allPresent) {
    return { status: 'confirmed_complete', presentArtifacts, missingArtifacts }
  } else if (!stateCompleted && allPresent) {
    return { status: 'likely_complete', presentArtifacts, missingArtifacts }
  } else if (stateCompleted && !allPresent) {
    return { status: 'conflict', presentArtifacts, missingArtifacts }
  } else {
    return { status: 'incomplete', presentArtifacts, missingArtifacts }
  }
}

/** Analyze a crashed session (non-null in_progress) and recommend recovery action. */
export function analyzeCrash(state: PipelineState, projectRoot: string): CrashRecoveryAction {
  const inProgress = state.in_progress
  if (!inProgress) {
    return { action: 'recommend_rerun', presentArtifacts: [], missingArtifacts: [] }
  }

  const step = inProgress.step
  const stepEntry = state.steps[step]
  const expectedOutputs = stepEntry?.produces ?? []

  const presentArtifacts: string[] = []
  const missingArtifacts: string[] = []

  for (const output of expectedOutputs) {
    const fullPath = resolveContainedArtifactPath(projectRoot, output)
    if (fullPath !== null && fileExists(fullPath)) {
      presentArtifacts.push(output)
    } else {
      missingArtifacts.push(output)
    }
  }

  if (missingArtifacts.length === 0 && presentArtifacts.length > 0) {
    return { action: 'auto_complete', presentArtifacts, missingArtifacts }
  } else if (presentArtifacts.length === 0) {
    return { action: 'recommend_rerun', presentArtifacts, missingArtifacts }
  } else {
    return { action: 'ask_user', presentArtifacts, missingArtifacts }
  }
}

export interface DetectCheckResult {
  kind: 'path' | 'cmd'
  target: string
  passed: boolean
}

export interface DetectResult {
  /** False when the step declares no detect block (vacuously passed). */
  evaluated: boolean
  passed: boolean
  checks: DetectCheckResult[]
}

const DEFAULT_DETECT_TIMEOUT_S = 10

function runDetectCheck(check: DetectCheck, projectRoot: string): DetectCheckResult {
  if (check.path !== undefined) {
    const full = resolveContainedArtifactPath(projectRoot, check.path)
    return { kind: 'path', target: check.path, passed: full !== null && fs.existsSync(full) }
  }
  const cmd = check.cmd ?? ''
  try {
    // Trust boundary (D4): cmd is a fixed string from the shipped pipeline
    // files — never project data. shell:true is required for compound
    // commands; cwd is the project root; all failures = not-detected.
    const res = spawnSync(cmd, {
      shell: true,
      cwd: projectRoot,
      timeout: (check.timeout ?? DEFAULT_DETECT_TIMEOUT_S) * 1000,
      stdio: 'ignore',
    })
    return { kind: 'cmd', target: cmd, passed: res.status === 0 && res.error === undefined }
  } catch {
    return { kind: 'cmd', target: cmd, passed: false }
  }
}

/** Execute a step's detect: contract (D4). Failures are never fatal. */
export function runDetect(
  detect: DetectSpec | null | undefined,
  projectRoot: string,
): DetectResult {
  if (!detect) return { evaluated: false, passed: true, checks: [] }
  const checks: DetectCheckResult[] = []
  let passed = true
  for (const check of detect.all ?? []) {
    const result = runDetectCheck(check, projectRoot)
    checks.push(result)
    if (!result.passed) passed = false
  }
  if (detect.any !== undefined) {
    const anyResults = detect.any.map((c) => runDetectCheck(c, projectRoot))
    checks.push(...anyResults)
    if (!anyResults.some((r) => r.passed)) passed = false
  }
  return { evaluated: true, passed, checks }
}

export type ConflictClass = 'state-claim' | 'artifact-only'

export interface StepVerification {
  step: string
  verification: VerificationLevel
  status: 'confirmed_complete' | 'likely_complete' | 'conflict' | 'incomplete'
  conflictClass: ConflictClass | null
  /** True when the step has no outputs AND no detect block (D3) — never 'verified'. */
  undetectable: boolean
  outputsPresent: string[]
  outputsMissing: string[]
  detect: DetectResult
}

/**
 * The single D3 verification path: a step is 'verified' only when ALL declared
 * outputs exist on disk AND its detect: contract passes. Conflict classes:
 * 'state-claim' (state says completed, checks fail) and 'artifact-only'
 * (no claim, but partial artifacts disagree with live checks — the beads case).
 */
export function verifyStep(
  step: string,
  entry: StepStateEntry | undefined,
  expectedOutputs: string[],
  detect: DetectSpec | null | undefined,
  projectRoot: string,
): StepVerification {
  const outputsPresent: string[] = []
  const outputsMissing: string[] = []
  for (const output of expectedOutputs) {
    const fullPath = resolveContainedArtifactPath(projectRoot, output)
    if (fullPath !== null && fileExists(fullPath)) {
      outputsPresent.push(output)
    } else {
      outputsMissing.push(output)
    }
  }
  const detectResult = runDetect(detect, projectRoot)
  const stateCompleted = entry?.status === 'completed'
  // 'verified' is set only by a real check — a stored 'verified' claim that we
  // cannot re-confirm right now reports as at most 'declared'.
  const priorVerification: VerificationLevel =
    (entry?.verification ?? 'unverified') === 'verified' ? 'declared' : (entry?.verification ?? 'unverified')
  const base = { step, outputsPresent, outputsMissing, detect: detectResult }

  if (expectedOutputs.length === 0 && !detectResult.evaluated) {
    return {
      ...base,
      verification: priorVerification,
      status: stateCompleted ? 'confirmed_complete' : 'incomplete',
      conflictClass: null,
      undetectable: true,
    }
  }
  if (outputsMissing.length === 0 && detectResult.passed) {
    return {
      ...base,
      verification: 'verified',
      status: stateCompleted ? 'confirmed_complete' : 'likely_complete',
      conflictClass: null,
      undetectable: false,
    }
  }
  if (stateCompleted) {
    return {
      ...base, verification: priorVerification, status: 'conflict',
      conflictClass: 'state-claim', undetectable: false,
    }
  }
  if (outputsPresent.length > 0) {
    return {
      ...base, verification: 'unverified', status: 'conflict',
      conflictClass: 'artifact-only', undetectable: false,
    }
  }
  return { ...base, verification: priorVerification, status: 'incomplete', conflictClass: null, undetectable: false }
}

/**
 * D3: conflict overrides completed for eligibility. FS-only by design — this
 * runs on every `status`/`next`, so detect: cmds are never executed here.
 * Returns a shallow copy with conflicted steps demoted to pending; returns the
 * input object unchanged when nothing conflicts.
 *
 * `resolvedOutputs`, when supplied, provides each step's CURRENT output
 * contract from the resolved pipeline (preset + project-type overlays). Passing
 * it is important: a package upgrade can add or change a step's outputs after it
 * was completed, and checking only the stored `entry.produces` would let a
 * now-incomplete step stay `completed`. The stored `entry.produces` is used
 * only as a fallback for steps the resolver no longer knows (extra/removed).
 *
 * `service`/`globalSteps`, when supplied, mirror `detectCompletion`'s
 * service-scoping: a service-local step's outputs (any slug not in
 * `globalSteps`) are checked under `services/<service>/<output>` rather than
 * at the project root. Without this, `scaffold status --service api` would
 * check a service-local step's output at the ROOT (always absent), causing a
 * false conflict — or worse, a same-named root file could mask a genuinely
 * missing service file and report a broken step as complete. Global steps
 * (present in `globalSteps`) and callers that omit `service` stay unprefixed,
 * identical to today's behavior.
 */
export function applyConflictOverrides(
  steps: Record<string, StepStateEntry>,
  projectRoot: string,
  resolvedOutputs?: (slug: string) => string[] | undefined,
  service?: string,
  globalSteps?: ReadonlySet<string>,
): { steps: Record<string, StepStateEntry>; conflicts: string[] } {
  const conflicts: string[] = []
  let overridden: Record<string, StepStateEntry> | null = null
  for (const [slug, entry] of Object.entries(steps)) {
    if (entry.status !== 'completed') continue
    // Current resolved contract first; historical entry.produces only as a
    // fallback for steps the resolved pipeline no longer knows.
    const outputs = resolvedOutputs?.(slug) ?? entry.produces ?? []
    if (outputs.length === 0) continue
    const isServiceLocal = service !== undefined && !(globalSteps?.has(slug) ?? false)
    const anyMissing = outputs.some((output) => {
      const relPath = isServiceLocal ? path.join('services', service, output) : output
      const fullPath = resolveContainedArtifactPath(projectRoot, relPath)
      return fullPath === null || !fileExists(fullPath)
    })
    if (!anyMissing) continue
    conflicts.push(slug)
    if (overridden === null) overridden = { ...steps }
    overridden[slug] = { ...entry, status: 'pending' }
  }
  return { steps: overridden ?? steps, conflicts: conflicts.sort() }
}
