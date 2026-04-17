import path from 'node:path'
import fs from 'node:fs'
import type { ScaffoldConfig, StepEnablementEntry } from '../../types/index.js'
import type { MetaPromptFrontmatter } from '../../types/frontmatter.js'
import type { OutputContext } from '../../cli/output/context.js'
import { loadOverlay, loadSubOverlay, loadStructuralOverlay } from './overlay-loader.js'
import { applyOverlay } from './overlay-resolver.js'

export interface OverlayState {
  steps: Record<string, StepEnablementEntry>
  knowledge: Record<string, string[]>
  reads: Record<string, string[]>
  dependencies: Record<string, string[]>
}

/**
 * Resolve overlay state by building maps from meta-prompt frontmatter,
 * then optionally loading and applying a project-type overlay.
 *
 * Centralizes the logic previously inline in run.ts (Step 2b) so that
 * status, next, rework, and other commands can share the same resolution.
 */
export function resolveOverlayState(options: {
  config: ScaffoldConfig
  methodologyDir: string
  metaPrompts: Map<string, { frontmatter: MetaPromptFrontmatter }>
  presetSteps: Record<string, StepEnablementEntry>
  output: OutputContext
}): OverlayState {
  const { config, methodologyDir, metaPrompts, presetSteps, output } = options

  // Build maps from meta-prompt frontmatter
  const knowledgeMap: Record<string, string[]> = {}
  const readsMap: Record<string, string[]> = {}
  const dependencyMap: Record<string, string[]> = {}
  for (const [name, mp] of metaPrompts) {
    knowledgeMap[name] = [...(mp.frontmatter.knowledgeBase ?? [])]
    readsMap[name] = [...(mp.frontmatter.reads ?? [])]
    dependencyMap[name] = [...(mp.frontmatter.dependencies ?? [])]
  }

  // Start with preset defaults
  let overlaySteps = { ...presetSteps }
  let overlayKnowledge = knowledgeMap
  let overlayReads = readsMap
  let overlayDependencies = dependencyMap

  // Load and apply project-type overlay if configured
  const projectType = config.project?.projectType
  if (projectType) {
    const overlayPath = path.join(methodologyDir, `${projectType}-overlay.yml`)

    // Only attempt overlay loading when an overlay file actually exists.
    // Most project types (backend, cli, library, etc.) don't have overlays —
    // skip silently instead of emitting misleading warnings.
    if (fs.existsSync(overlayPath)) {
      const { overlay, errors: overlayErrors, warnings: overlayWarnings } = loadOverlay(overlayPath)
      for (const w of overlayWarnings) {
        output.warn(w)
      }
      // Overlay errors are non-fatal — warn but continue without overlay
      if (overlayErrors.length > 0) {
        for (const err of overlayErrors) {
          output.warn(`[${err.code}] ${err.message}${err.recovery ? ` — ${err.recovery}` : ''}`)
        }
      }
      if (overlay) {
        const merged = applyOverlay(
          overlaySteps,
          knowledgeMap,
          readsMap,
          dependencyMap,
          overlay,
        )
        overlaySteps = merged.steps
        overlayKnowledge = merged.knowledge
        overlayReads = merged.reads
        overlayDependencies = merged.dependencies
      }
    }

    // Generic domain sub-overlay: types with a 'domain' config field get sub-overlay injection
    const TYPE_DOMAIN_CONFIG: Partial<Record<string, string>> = {
      'research': 'researchConfig',
      'backend': 'backendConfig',
      // Future types with domain support can be added here
    }
    const domainConfigKey = TYPE_DOMAIN_CONFIG[projectType]
    if (domainConfigKey) {
      const typeConfig = config.project?.[domainConfigKey] as Record<string, unknown> | undefined
      if (typeConfig && typeof typeConfig.domain === 'string' && typeConfig.domain !== 'none') {
        const subOverlayPath = path.join(methodologyDir, `${projectType}-${typeConfig.domain}.yml`)
        if (fs.existsSync(subOverlayPath)) {
          const { overlay: subOverlay, errors: subErrors, warnings: subWarnings } = loadSubOverlay(subOverlayPath)
          for (const err of subErrors) output.warn(`[${err.code}] ${err.message}`)
          for (const w of subWarnings) output.warn(w)
          if (subOverlay) {
            // Apply knowledge-overrides only, starting from ALREADY-MERGED overlayKnowledge
            for (const [step, overrides] of Object.entries(subOverlay.knowledgeOverrides ?? {})) {
              if (step in overlayKnowledge) {
                const toAppend = overrides.append ?? []
                overlayKnowledge[step] = [...overlayKnowledge[step], ...toAppend]
              }
              // else: sub-overlay references a step not in the pipeline — silently skip
              // (common when domain overlays target optional steps that aren't enabled)
            }
          }
        }
      }
    }
  }

  // Structural overlay pass (gated on services[])
  if (config.project?.services?.length) {
    const msOverlayPath = path.join(methodologyDir, 'multi-service-overlay.yml')
    if (fs.existsSync(msOverlayPath)) {
      const {
        overlay: msOverlay,
        errors: msErrors,
        warnings: msWarnings,
      } = loadStructuralOverlay(msOverlayPath)
      for (const w of msWarnings) {
        output.warn(w)
      }
      if (msErrors.length > 0) {
        for (const err of msErrors) {
          output.warn(`[${err.code}] ${err.message}${err.recovery ? ` — ${err.recovery}` : ''}`)
        }
      }
      if (msOverlay) {
        // Step-override conflict detection
        for (const [step, override] of Object.entries(msOverlay.stepOverrides)) {
          if (step in overlaySteps && overlaySteps[step].enabled !== override.enabled) {
            output.warn(`Structural overlay overrides "${step}" enablement`)
          }
        }
        // Validate step targets exist in metaPrompts
        for (const step of Object.keys(msOverlay.stepOverrides)) {
          if (!metaPrompts.has(step)) {
            output.warn(`Structural overlay targets unknown step "${step}"`)
          }
        }
        const merged = applyOverlay(
          overlaySteps,
          overlayKnowledge,
          overlayReads,
          overlayDependencies,
          msOverlay,
        )
        overlaySteps = merged.steps
        overlayKnowledge = merged.knowledge
        overlayReads = merged.reads
        overlayDependencies = merged.dependencies
      }
    }
  }

  return {
    steps: overlaySteps,
    knowledge: overlayKnowledge,
    reads: overlayReads,
    dependencies: overlayDependencies,
  }
}
