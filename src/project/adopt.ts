import fs from 'node:fs'
import path from 'node:path'
import type { ScaffoldError, ScaffoldWarning, ProjectType, GameConfig } from '../types/index.js'
import { detectProjectMode } from './detector.js'
import { discoverMetaPrompts } from '../core/assembly/meta-prompt-loader.js'

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
export function runAdoption(options: {
  projectRoot: string
  metaPromptDir: string
  methodology: string
  dryRun: boolean
}): AdoptionResult {
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

  // 4. Game engine detection
  let detectedEngine: string | undefined
  if (fs.existsSync(path.join(projectRoot, 'Assets'))) {
    try {
      const assets = fs.readdirSync(path.join(projectRoot, 'Assets'))
      if (assets.some(f => f.endsWith('.meta'))) {
        detectedEngine = 'unity'
      }
    } catch { /* ignore read errors */ }
  }
  if (!detectedEngine) {
    try {
      const files = fs.readdirSync(projectRoot)
      if (files.some(f => f.endsWith('.uproject'))) {
        detectedEngine = 'unreal'
      }
    } catch { /* ignore */ }
  }
  if (!detectedEngine && fs.existsSync(path.join(projectRoot, 'project.godot'))) {
    detectedEngine = 'godot'
  }

  const result: AdoptionResult = {
    mode: detection.mode,
    artifactsFound: detectedArtifacts.length,
    detectedArtifacts,
    stepsCompleted,
    stepsRemaining,
    methodology,
    errors: [],
    warnings: [],
  }

  if (detectedEngine) {
    result.projectType = 'game'
    result.gameConfig = { engine: detectedEngine as GameConfig['engine'] }
  }

  return result
}
