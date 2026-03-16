import type { PipelineState } from '../types/index.js'
import type { DecisionEntry } from '../types/index.js'
import { buildTemplate } from './template.js'

export interface DashboardData {
  generatedAt: string
  methodology: string
  steps: {
    slug: string
    status: 'pending' | 'in_progress' | 'completed' | 'skipped'
    phase: string | null
    depth: number | null
    completedAt: string | null
    completedBy: string | null
  }[]
  progress: {
    total: number
    completed: number
    skipped: number
    pending: number
    inProgress: number
    percentage: number
  }
  decisions: {
    id: string
    step: string
    decision: string
    timestamp: string
    provisional: boolean
  }[]
}

export interface GeneratorOptions {
  state: PipelineState
  decisions: DecisionEntry[]
  methodology: string
}

export function generateDashboardData(opts: GeneratorOptions): DashboardData {
  const { state, decisions, methodology } = opts

  const steps = Object.entries(state.steps).map(([slug, entry]) => ({
    slug,
    status: entry.status,
    phase: null as string | null,
    depth: entry.depth ?? null,
    completedAt: entry.at ?? null,
    completedBy: entry.completed_by ?? null,
  }))

  const completed = steps.filter(s => s.status === 'completed').length
  const skipped = steps.filter(s => s.status === 'skipped').length
  const pending = steps.filter(s => s.status === 'pending').length
  const inProgress = steps.filter(s => s.status === 'in_progress').length
  const total = steps.length

  return {
    generatedAt: new Date().toISOString(),
    methodology,
    steps,
    progress: {
      total,
      completed,
      skipped,
      pending,
      inProgress,
      percentage: total > 0 ? Math.round((completed + skipped) / total * 100) : 0,
    },
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
