import { createRequire } from 'node:module'
import type { PipelineState, DecisionEntry, MetaPromptFile } from '../types/index.js'
import { PHASES, PHASE_BY_SLUG } from '../types/frontmatter.js'
import { buildTemplate } from './template.js'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json') as { version: string }

export interface DashboardStep {
  slug: string
  status: 'completed' | 'skipped' | 'pending' | 'in_progress'
  phase: string | null
  depth: number | null
  completedAt: string | null
  completedBy: string | null
  description: string
  summary: string | null
  dependencies: string[]
  outputs: string[]
  order: number | null
  conditional: 'if-needed' | null
  metaPromptBody: string
}

export interface DashboardPhase {
  number: number
  slug: string
  displayName: string
  description: string
  steps: DashboardStep[]
  counts: { completed: number; skipped: number; pending: number; inProgress: number; total: number }
}

export interface DashboardDecision {
  id: string
  step: string
  decision: string
  timestamp: string
  provisional: boolean
}

export interface DashboardData {
  generatedAt: string
  methodology: string
  scaffoldVersion: string
  phases: DashboardPhase[]
  steps: DashboardStep[]  // backward compat flat list
  progress: {
    total: number
    completed: number
    skipped: number
    pending: number
    inProgress: number
    percentage: number
  }
  nextEligible: { slug: string; summary: string | null; description: string; command: string } | null
  decisions: DashboardDecision[]
}

export interface GeneratorOptions {
  state: PipelineState
  decisions: DecisionEntry[]
  methodology: string
  metaPrompts?: Map<string, MetaPromptFile>
}

function buildStep(
  slug: string,
  state: PipelineState,
  metaPrompts?: Map<string, MetaPromptFile>,
): DashboardStep {
  const entry = state.steps[slug]
  const meta = metaPrompts?.get(slug)
  const fm = meta?.frontmatter

  return {
    slug,
    status: entry.status,
    phase: fm?.phase ?? null,
    depth: entry.depth ?? null,
    completedAt: entry.at ?? null,
    completedBy: entry.completed_by ?? null,
    description: fm?.description ?? '',
    summary: fm?.summary ?? null,
    dependencies: fm?.dependencies ?? [],
    outputs: fm?.outputs ?? [],
    order: fm?.order ?? null,
    conditional: fm?.conditional ?? null,
    metaPromptBody: meta?.body ?? '',
  }
}

function buildPhases(
  steps: DashboardStep[],
): DashboardPhase[] {
  // Build a map from phase slug to steps in that phase
  const phaseStepMap = new Map<string, DashboardStep[]>()

  for (const step of steps) {
    const phaseSlug = step.phase
    if (phaseSlug && phaseSlug in PHASE_BY_SLUG) {
      const existing = phaseStepMap.get(phaseSlug) ?? []
      existing.push(step)
      phaseStepMap.set(phaseSlug, existing)
    }
  }

  return PHASES.map(p => {
    const phaseSteps = phaseStepMap.get(p.slug) ?? []
    // Sort by order within phase
    phaseSteps.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))

    const completed = phaseSteps.filter(s => s.status === 'completed').length
    const skipped = phaseSteps.filter(s => s.status === 'skipped').length
    const pending = phaseSteps.filter(s => s.status === 'pending').length
    const inProgress = phaseSteps.filter(s => s.status === 'in_progress').length

    return {
      number: p.number,
      slug: p.slug,
      displayName: p.displayName,
      description: p.description,
      steps: phaseSteps,
      counts: {
        completed,
        skipped,
        pending,
        inProgress,
        total: phaseSteps.length,
      },
    }
  })
}

function computeNextEligible(
  state: PipelineState,
  metaPrompts?: Map<string, MetaPromptFile>,
): DashboardData['nextEligible'] {
  const eligible = state.next_eligible
  if (!eligible || eligible.length === 0) return null

  const slug = eligible[0]
  const meta = metaPrompts?.get(slug)
  const fm = meta?.frontmatter

  return {
    slug,
    summary: fm?.summary ?? null,
    description: fm?.description ?? '',
    command: `/scaffold ${slug}`,
  }
}

export function generateDashboardData(opts: GeneratorOptions): DashboardData {
  const { state, decisions, methodology, metaPrompts } = opts

  const steps = Object.keys(state.steps).map(slug =>
    buildStep(slug, state, metaPrompts),
  )

  const phases = buildPhases(steps)

  const completed = steps.filter(s => s.status === 'completed').length
  const skipped = steps.filter(s => s.status === 'skipped').length
  const pending = steps.filter(s => s.status === 'pending').length
  const inProgress = steps.filter(s => s.status === 'in_progress').length
  const total = steps.length

  return {
    generatedAt: new Date().toISOString(),
    methodology,
    scaffoldVersion: pkg.version,
    phases,
    steps,
    progress: {
      total,
      completed,
      skipped,
      pending,
      inProgress,
      percentage: total > 0 ? Math.round((completed + skipped) / total * 100) : 0,
    },
    nextEligible: computeNextEligible(state, metaPrompts),
    decisions: decisions.map(d => ({
      id: d.id,
      step: d.prompt,
      decision: d.decision,
      timestamp: d.at,
      provisional: d.step_completed === false,
    })),
  }
}

export function generateHtml(data: DashboardData): string {
  const dataJson = JSON.stringify(data, null, 2)
  return buildTemplate(dataJson, data)
}
