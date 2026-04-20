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

// ---------- Multi-service dashboard ----------

export interface ServiceSummary {
  /** Service id from config (kebab-case). */
  name: string
  /** Project type — backend / web-app / library / etc. */
  projectType: string
  /** (completed + skipped) / total, 0-100. */
  percentage: number
  completed: number
  skipped: number
  pending: number
  inProgress: number
  total: number
  /** Lowest-numbered phase with at least one pending or in_progress step. Null if pipeline complete. */
  currentPhaseNumber: number | null
  /** Display name of the current phase. Null if complete. */
  currentPhaseName: string | null
  /** state.next_eligible[0] or null. */
  nextEligibleSlug: string | null
  /** Meta-prompt frontmatter.summary (fallback: description) of the next eligible step. */
  nextEligibleSummary: string | null
}

export interface MultiServiceAggregate {
  totalServices: number
  /** Mean of service percentages, rounded. 0 for empty input. */
  averagePercentage: number
  /** Count of services at 100%. */
  servicesComplete: number
  /**
   * Service count that has reached or passed each phase. A service "reached"
   * phase N if it has any step in phase N that is completed or skipped.
   */
  servicesByPhase: Array<{
    phaseSlug: string
    phaseName: string
    phaseNumber: number
    reachedCount: number
  }>
}

export interface MultiServiceDashboardData {
  generatedAt: string
  methodology: string
  scaffoldVersion: string
  /** Preserves input order. */
  services: ServiceSummary[]
  aggregate: MultiServiceAggregate
}

export interface MultiServiceGeneratorOptions {
  services: Array<{
    name: string
    projectType: string
    state: PipelineState
    metaPrompts?: Map<string, MetaPromptFile>
  }>
  methodology: string
}

function summarizeService(
  svc: MultiServiceGeneratorOptions['services'][number],
): ServiceSummary {
  const { name, projectType, state, metaPrompts } = svc
  const entries = Object.entries(state.steps)

  let completed = 0
  let skipped = 0
  let pending = 0
  let inProgress = 0

  // Track lowest phase number that has any pending or in_progress step.
  let currentPhaseNumber: number | null = null

  for (const [slug, entry] of entries) {
    switch (entry.status) {
      case 'completed': completed++; break
      case 'skipped': skipped++; break
      case 'pending': pending++; break
      case 'in_progress': inProgress++; break
    }

    if (entry.status === 'pending' || entry.status === 'in_progress') {
      const phaseSlug = metaPrompts?.get(slug)?.frontmatter.phase
      if (phaseSlug && phaseSlug in PHASE_BY_SLUG) {
        const phaseNum = PHASE_BY_SLUG[phaseSlug as keyof typeof PHASE_BY_SLUG].number
        if (currentPhaseNumber === null || phaseNum < currentPhaseNumber) {
          currentPhaseNumber = phaseNum
        }
      }
    }
  }

  const total = entries.length
  const percentage = total > 0 ? Math.round(((completed + skipped) / total) * 100) : 0

  const currentPhaseName =
    currentPhaseNumber === null
      ? null
      : PHASES.find(p => p.number === currentPhaseNumber)?.displayName ?? null

  const nextSlug = state.next_eligible?.[0] ?? null
  let nextSummary: string | null = null
  if (nextSlug) {
    const fm = metaPrompts?.get(nextSlug)?.frontmatter
    nextSummary = fm?.summary ?? fm?.description ?? null
  }

  return {
    name,
    projectType,
    percentage,
    completed,
    skipped,
    pending,
    inProgress,
    total,
    currentPhaseNumber,
    currentPhaseName,
    nextEligibleSlug: nextSlug,
    nextEligibleSummary: nextSummary,
  }
}

function buildServicesByPhase(
  services: MultiServiceGeneratorOptions['services'],
): MultiServiceAggregate['servicesByPhase'] {
  return PHASES.map(p => {
    let reached = 0
    for (const svc of services) {
      let hit = false
      for (const [slug, entry] of Object.entries(svc.state.steps)) {
        if (entry.status !== 'completed' && entry.status !== 'skipped') continue
        const phaseSlug = svc.metaPrompts?.get(slug)?.frontmatter.phase
        if (phaseSlug === p.slug) {
          hit = true
          break
        }
      }
      if (hit) reached++
    }
    return {
      phaseSlug: p.slug,
      phaseName: p.displayName,
      phaseNumber: p.number,
      reachedCount: reached,
    }
  })
}

export function generateMultiServiceDashboardData(
  opts: MultiServiceGeneratorOptions,
): MultiServiceDashboardData {
  const { services: input, methodology } = opts

  const services = input.map(summarizeService)

  const totalServices = services.length
  const averagePercentage =
    totalServices > 0
      ? Math.round(services.reduce((a, s) => a + s.percentage, 0) / totalServices)
      : 0
  const servicesComplete = services.filter(s => s.percentage === 100).length
  const servicesByPhase = buildServicesByPhase(input)

  return {
    generatedAt: new Date().toISOString(),
    methodology,
    scaffoldVersion: pkg.version,
    services,
    aggregate: {
      totalServices,
      averagePercentage,
      servicesComplete,
      servicesByPhase,
    },
  }
}
