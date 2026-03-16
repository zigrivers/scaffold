import type { ProjectContext, ArtifactEntry, ExistingArtifact } from '../../types/index.js'
import type { PipelineState, ScaffoldConfig, DecisionEntry } from '../../types/index.js'
import { fileExists } from '../../utils/fs.js'
import { readDecisions } from '../../state/decision-logger.js'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Gather project context for assembly.
 * Collects artifacts from dependency chain + reads, config, state, decisions.
 */
export function gatherContext(options: {
  step: string
  state: PipelineState
  config: ScaffoldConfig
  projectRoot: string
  /** Step slugs to gather artifacts from (dependency chain + reads) */
  dependencyChain: string[]
  /** For update mode: include existing artifact */
  existingArtifact?: ExistingArtifact
}): ProjectContext {
  const { state, config, projectRoot, dependencyChain, existingArtifact } = options

  // 1. Gather artifacts from dependency chain steps
  const artifacts: ArtifactEntry[] = []
  for (const depStep of dependencyChain) {
    const stepEntry = state.steps[depStep]
    if (!stepEntry || stepEntry.status !== 'completed') continue
    const produces = stepEntry.produces ?? []
    for (const outputPath of produces) {
      const fullPath = path.resolve(projectRoot, outputPath)
      if (fileExists(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8')
          artifacts.push({ stepName: depStep, filePath: outputPath, content })
        } catch {
          // warn but continue — missing artifact gracefully handled
        }
      }
    }
  }

  // 2. Load decisions from decisions.jsonl
  const decisionEntries = readDecisions(projectRoot, { step: undefined })
  // Filter to decisions from completed dependency-chain steps
  const relevantDecisions = decisionEntries.filter(d => dependencyChain.includes(d.prompt))
  const decisions = formatDecisions(relevantDecisions)

  return {
    artifacts,
    config,
    state,
    decisions,
    existingOutput: existingArtifact,
  }
}

function formatDecisions(entries: DecisionEntry[]): string {
  if (entries.length === 0) return ''
  return entries.map(e => `${e.id}: ${e.decision} (${e.prompt})`).join('\n')
}
