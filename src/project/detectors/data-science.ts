import type { SignalContext } from './context.js'
import type { DataScienceMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectDataScience(ctx: SignalContext): DataScienceMatch | null {
  const ev: DetectionEvidence[] = []

  const hasMarimoToml = ctx.hasFile('.marimo.toml')
  const hasMarimoDep = ctx.hasAnyDep(['marimo'], 'py')

  // Marimo is the required DS-specific anchor. Without it we cannot
  // confidently distinguish DS from ML / research / data-pipeline repos,
  // which frequently also use DVC.
  const hasMarimoSignal = hasMarimoToml || hasMarimoDep
  if (!hasMarimoSignal) return null

  const hasDvcYaml = ctx.hasFile('dvc.yaml')
  const hasDvcConfig = ctx.hasFile('.dvc/config')
  const hasDvcDep = ctx.hasAnyDep(['dvc'], 'py')

  if (hasMarimoToml) ev.push(evidence('marimo-toml', '.marimo.toml'))
  if (hasMarimoDep) ev.push(evidence('marimo-dep'))
  if (hasDvcYaml) ev.push(evidence('dvc-yaml', 'dvc.yaml'))
  if (hasDvcConfig) ev.push(evidence('dvc-config', '.dvc/config'))
  if (hasDvcDep) ev.push(evidence('dvc-dep'))

  return {
    projectType: 'data-science',
    confidence: 'low',
    partialConfig: {},
    evidence: ev,
  }
}
