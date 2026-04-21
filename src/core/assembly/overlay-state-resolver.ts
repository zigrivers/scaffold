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
  /**
   * Cross-reads for each step (keyed by step slug). Populated via overlay-first
   * merge: `frontmatter.crossReads ∪ overlay.cross-reads-overrides` (spec §3.2).
   * Consumers can read `overlay.crossReads[slug]` as authoritative.
   */
  crossReads: Record<string, Array<{ service: string; step: string }>>
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
  const crossReadsMap: Record<string, Array<{ service: string; step: string }>> = {}
  for (const [name, mp] of metaPrompts) {
    knowledgeMap[name] = [...(mp.frontmatter.knowledgeBase ?? [])]
    readsMap[name] = [...(mp.frontmatter.reads ?? [])]
    dependencyMap[name] = [...(mp.frontmatter.dependencies ?? [])]
    crossReadsMap[name] = [...(mp.frontmatter.crossReads ?? [])]
  }

  // Start with preset defaults
  let overlaySteps = { ...presetSteps }
  let overlayKnowledge = knowledgeMap
  let overlayReads = readsMap
  let overlayDependencies = dependencyMap
  let overlayCrossReads = crossReadsMap

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
        // Use the tracked overlay* working variables uniformly (parity with the
        // structural-overlay pass below). At this point the working vars are
        // reference-identical to the frontmatter maps, so behavior is unchanged;
        // the symmetry avoids a footgun if a future pre-pass mutates the vars.
        const merged = applyOverlay(
          overlaySteps,
          overlayKnowledge,
          overlayReads,
          overlayDependencies,
          overlayCrossReads,
          overlay,
        )
        overlaySteps = merged.steps
        overlayKnowledge = merged.knowledge
        overlayReads = merged.reads
        overlayDependencies = merged.dependencies
        overlayCrossReads = merged.crossReads
      }
    }

    // Generic domain sub-overlay: types with a 'domain' config field get sub-overlay injection.
    // Supports both single-domain string and multi-domain array shapes (spec §2 v3.21.0).
    const TYPE_DOMAIN_CONFIG: Partial<Record<string, string>> = {
      'research': 'researchConfig',
      'backend': 'backendConfig',
      // Future types with domain support can be added here
    }
    const domainConfigKey = TYPE_DOMAIN_CONFIG[projectType]
    if (domainConfigKey) {
      const typeConfig = config.project?.[domainConfigKey] as Record<string, unknown> | undefined
      const rawDomain = typeConfig?.['domain'] as string | string[] | undefined
      const domains = normalizeDomains(rawDomain, output, `${domainConfigKey}.domain`)
      for (const domain of domains) {
        const subOverlayPath = path.join(methodologyDir, `${projectType}-${domain}.yml`)
        // Silent-skip missing files — packaging-integrity test is the backstop (spec §2.3, §5.5)
        if (!fs.existsSync(subOverlayPath)) continue
        const { overlay: subOverlay, errors: subErrors, warnings: subWarnings } =
          loadSubOverlay(subOverlayPath)
        for (const err of subErrors) {
          output.warn(`[${err.code}] ${err.message}${err.recovery ? ` — ${err.recovery}` : ''}`)
        }
        for (const w of subWarnings) output.warn(w)
        if (subOverlay) {
          // Apply knowledge-overrides only, starting from ALREADY-MERGED overlayKnowledge.
          // Append + dedup preserving first-occurrence order — matches applyOverlay contract
          // (overlay-resolver.ts:97-100). The prior single-domain path did plain append
          // without dedup, which multi-domain stacking would make observably wrong.
          for (const [step, overrides] of Object.entries(subOverlay.knowledgeOverrides ?? {})) {
            if (step in overlayKnowledge) {
              const toAppend = overrides.append ?? []
              overlayKnowledge[step] = [...new Set([...overlayKnowledge[step], ...toAppend])]
            }
            // else: sub-overlay references a step not in the pipeline — silently skip
            // (common when domain overlays target optional steps that aren't enabled)
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
          overlayCrossReads,
          msOverlay,
        )
        overlaySteps = merged.steps
        overlayKnowledge = merged.knowledge
        overlayReads = merged.reads
        overlayDependencies = merged.dependencies
        overlayCrossReads = merged.crossReads
      }
    }
  }

  return {
    steps: overlaySteps,
    knowledge: overlayKnowledge,
    reads: overlayReads,
    dependencies: overlayDependencies,
    crossReads: overlayCrossReads,
  }
}

/**
 * Normalize a raw domain config value (string | string[] | undefined) into an
 * iteration-ready list of domain names. Filters 'none' (treating it as
 * "no domain configured"), dedups with warning, and preserves declaration order.
 *
 * Spec §2.2. Not exported: the resolver is the only consumer today. If a second
 * consumer appears, export from this file.
 */
function normalizeDomains(
  raw: string | string[] | undefined,
  output: OutputContext,
  configKeyForMessages: string,
): string[] {
  if (raw === undefined || raw === 'none') return []
  const arr = Array.isArray(raw) ? raw : [raw]
  // Schema rejects 'none' inside arrays (spec §1.1), so no 'none' filter is
  // needed here. The resolver trusts the Zod-parsed shape.
  const deduped = [...new Set(arr)]
  if (deduped.length !== arr.length) {
    const dupes = [...new Set(arr.filter((d, i) => arr.indexOf(d) !== i))]
    output.warn(
      `Duplicate domain(s) in ${configKeyForMessages}: ${dupes.join(', ')} — deduplicated`,
    )
  }
  return deduped
}
