import fs from 'node:fs'
import path from 'node:path'
import type { ScaffoldError, ScaffoldWarning, ProjectType, GameConfig } from '../types/index.js'
import { detectProjectMode } from './detector.js'
import { discoverMetaPrompts } from '../core/assembly/meta-prompt-loader.js'
import { createSignalContext } from './detectors/context.js'
import { runDetectors } from './detectors/index.js'

export type AdaptationStrategy = 'update-mode' | 'skip-recommended' | 'context-only' | 'full-run'

export interface ArtifactMatch {
  artifactPath: string      // relative path of existing file
  matchedStep: string       // step slug
  strategy: AdaptationStrategy
}

export interface AdoptionResult {
  mode: 'greenfield' | 'brownfield' | 'v1-migration'
  artifactsFound: number
  detectedArtifacts: ArtifactMatch[]
  stepsCompleted: string[]   // steps auto-marked as completed
  stepsRemaining: string[]   // steps still to run
  methodology: string
  errors: ScaffoldError[]
  warnings: ScaffoldWarning[]
  projectType?: ProjectType
  gameConfig?: Partial<GameConfig>
}

/**
 * Scan projectRoot for existing artifacts, match to pipeline steps,
 * and pre-populate state.json.
 */
export async function runAdoption(options: {
  projectRoot: string
  metaPromptDir: string
  methodology: string
  dryRun: boolean
}): Promise<AdoptionResult> {
  const { projectRoot, metaPromptDir, methodology } = options

  // 1. Detect project mode
  const detection = detectProjectMode(projectRoot)

  // 2. Discover meta-prompts to get expected outputs per step
  const metaPrompts = discoverMetaPrompts(metaPromptDir)

  const detectedArtifacts: ArtifactMatch[] = []
  const stepsCompleted: string[] = []
  const stepsRemaining: string[] = []

  // 3. For each step, check if its expected outputs exist
  for (const [slug, mp] of metaPrompts.entries()) {
    const produces = mp.frontmatter.outputs ?? []
    if (produces.length === 0) continue

    const foundOutputs = produces.filter((relPath) => {
      return fs.existsSync(path.join(projectRoot, relPath))
    })

    if (foundOutputs.length > 0) {
      // Determine strategy based on how many outputs were found
      const strategy: AdaptationStrategy =
        foundOutputs.length === produces.length ? 'skip-recommended' : 'context-only'

      for (const p of foundOutputs) {
        detectedArtifacts.push({ artifactPath: p, matchedStep: slug, strategy })
      }
      stepsCompleted.push(slug)
    } else {
      stepsRemaining.push(slug)
    }
  }

  // 4. Project-type detection via SignalContext-backed detectors.
  //    Currently registers detectGame (Unity > Unreal > Godot > Bevy > Love2D > JS).
  //    Task 10/11 expand the result shape; Task 5 is behavior-preserving and only
  //    sets result.gameConfig when a game match exists.
  const ctx = createSignalContext(projectRoot)
  const matches = runDetectors(ctx)
  const gameMatch = matches.find((m) => m.projectType === 'game')

  const result: AdoptionResult = {
    mode: detection.mode,
    artifactsFound: detectedArtifacts.length,
    detectedArtifacts,
    stepsCompleted,
    stepsRemaining,
    methodology,
    errors: [],
    warnings: [...ctx.warnings],
  }

  if (gameMatch) {
    result.projectType = 'game'
    result.gameConfig = gameMatch.partialConfig
  }

  return result
}
