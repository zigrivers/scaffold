import type { PipelineState } from '../types/index.js'
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
): CompletionResult {
  const artifactsPresent: string[] = []
  const artifactsMissing: string[] = []

  for (const output of expectedOutputs) {
    const fullPath = resolveContainedArtifactPath(projectRoot, output)
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
