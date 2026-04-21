import type { SignalContext } from './context.js'
import type { DataScienceMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectDataScience(ctx: SignalContext): DataScienceMatch | null {
  const ev: DetectionEvidence[] = []

  const hasDvcYaml = ctx.hasFile('dvc.yaml')
  const hasDvcConfig = ctx.hasFile('.dvc/config')
  const hasMarimoToml = ctx.hasFile('.marimo.toml')
  const hasMarimoDep = ctx.hasAnyDep(['marimo'], 'py')
  const hasDvcDep = ctx.hasAnyDep(['dvc'], 'py')

  if (!hasDvcYaml && !hasDvcConfig && !hasMarimoToml && !hasMarimoDep && !hasDvcDep) {
    return null
  }

  if (hasDvcYaml) ev.push(evidence('dvc-yaml', 'dvc.yaml'))
  if (hasDvcConfig) ev.push(evidence('dvc-config', '.dvc/config'))
  if (hasMarimoToml) ev.push(evidence('marimo-toml', '.marimo.toml'))
  if (hasMarimoDep) ev.push(evidence('marimo-dep'))
  if (hasDvcDep) ev.push(evidence('dvc-dep'))

  return {
    projectType: 'data-science',
    confidence: 'low',
    partialConfig: {},
    evidence: ev,
  }
}
