/**
 * Assembly-level coverage for the `materialize-plan-to-beads` finalization step.
 *
 * Per the design spec's Testing Strategy (docs/superpowers/specs/
 * 2026-05-31-plan-to-beads-materialization-design.md), the assembled pipeline
 * must include `materialize-plan-to-beads` positioned after
 * `implementation-playbook` for a Beads-capable methodology, and must exclude it
 * when Beads is disabled (mvp). This exercises the REAL loaders the assembler
 * consumes (discoverMetaPrompts + loadPreset over the bundled content), not raw
 * YAML/frontmatter greps.
 */
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { discoverMetaPrompts } from './meta-prompt-loader.js'
import { loadPreset } from './preset-loader.js'
import { getPackagePipelineDir, getPackageMethodologyDir } from '../../utils/fs.js'
import type { MetaPromptFile } from '../../types/frontmatter.js'

const STEP = 'materialize-plan-to-beads'
const PLAYBOOK = 'implementation-playbook'

const prompts = discoverMetaPrompts(getPackagePipelineDir())
const knownSteps = [...prompts.keys()]

/** Pipeline steps always carry a numeric order (only tools have null). */
function orderOf(p: MetaPromptFile): number {
  const o = p.frontmatter.order
  if (o === null) throw new Error(`pipeline step '${p.stepName}' has null order`)
  return o
}

function loadRealPreset(file: string) {
  const { preset, errors } = loadPreset(
    path.join(getPackageMethodologyDir(), file),
    knownSteps,
  )
  expect(errors).toHaveLength(0)
  expect(preset).not.toBeNull()
  return preset!
}

/** Names of enabled steps in a given phase, sorted by frontmatter order. */
function enabledPhaseStepsInOrder(
  preset: ReturnType<typeof loadRealPreset>,
  phase: string,
): string[] {
  return [...prompts.values()]
    .filter((p) => p.frontmatter.phase === phase)
    .filter((p) => preset.steps[p.stepName]?.enabled === true)
    .sort((a, b) => orderOf(a) - orderOf(b))
    .map((p) => p.stepName)
}

describe('materialize-plan-to-beads assembly', () => {
  it('exists as a finalization step ordered between the playbook and the build phase', () => {
    const step = prompts.get(STEP)
    const playbook = prompts.get(PLAYBOOK)
    expect(step, `${STEP} should be a discovered pipeline step`).toBeDefined()
    expect(playbook).toBeDefined()

    expect(step!.frontmatter.phase).toBe('finalization')
    expect(step!.frontmatter.conditional).toBe('if-needed')
    expect(step!.frontmatter.dependencies).toContain(PLAYBOOK)

    // Positioned after the playbook (1430) and before any build-phase step (1500+).
    expect(orderOf(step!)).toBeGreaterThan(orderOf(playbook!))
    const minBuildOrder = Math.min(
      ...[...prompts.values()]
        .filter((p) => p.frontmatter.phase === 'build')
        .map(orderOf),
    )
    expect(orderOf(step!)).toBeLessThan(minBuildOrder)
  })

  it('is enabled (conditional) in Beads-capable deep + custom + mvp presets, immediately after the playbook', () => {
    // mvp raises its Beads floor (D5): beads, git-workflow, and materialize-plan-to-beads
    // are all enabled (conditional if-needed) alongside deep and custom-defaults.
    for (const file of ['deep.yml', 'custom-defaults.yml', 'mvp.yml']) {
      const preset = loadRealPreset(file)
      expect(preset.steps[STEP]?.enabled, `${file} should enable ${STEP}`).toBe(true)
      expect(preset.steps[STEP]?.conditional).toBe('if-needed')

      const ordered = enabledPhaseStepsInOrder(preset, 'finalization')
      expect(ordered, `${file} assembled finalization should include ${STEP}`).toContain(STEP)
      // The materializer assembles immediately after the playbook.
      expect(ordered.indexOf(STEP)).toBe(ordered.indexOf(PLAYBOOK) + 1)
    }
  })
})
