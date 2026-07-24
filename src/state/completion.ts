import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import type { PipelineState } from '../types/index.js'
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
