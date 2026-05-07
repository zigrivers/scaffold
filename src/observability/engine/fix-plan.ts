import type { Finding, Severity } from './types'
import { severityRank } from './types'

export function buildFixPlan(findings: Finding[], fixThreshold: Severity): Finding[] {
  const thresholdRank = severityRank(fixThreshold)
  return findings
    .filter((f) => f.status === 'open' && severityRank(f.severity) <= thresholdRank)
    .sort((a, b) => {
      const sevDiff = severityRank(a.severity) - severityRank(b.severity)
      if (sevDiff !== 0) return sevDiff
      return a.lens_id < b.lens_id ? -1 : a.lens_id > b.lens_id ? 1 : 0
    })
}
