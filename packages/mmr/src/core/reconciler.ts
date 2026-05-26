import type { Finding, ReconciledFinding, Severity, Agreement, Confidence, Verdict, ChannelStatus } from '../types.js'
import { SEVERITY_ORDER } from '../types.js'
import { computeFindingKey, descriptionShingle, jaccardSimilarity, normalizeLocationForKey } from './stable-id.js'

interface AttributedFinding extends Finding {
  source: string
  finding_key: string
  normalized_location: string
  shingle: string[]
}

interface ReconcileGroup {
  finding_key: string
  normalized_location: string
  shingle: string[]
  findings: AttributedFinding[]
}

function higherSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER[a] <= SEVERITY_ORDER[b] ? a : b
}

/**
 * Reconcile findings from multiple channels into a unified list with
 * consensus scoring.
 *
 * 1. Flatten all findings with source attribution
 * 2. Group by stable finding identity
 * 3. For each group, determine agreement, confidence, and effective severity
 * 4. Sort by severity (P0 first)
 */
export function reconcile(channelFindings: Record<string, Finding[]>): ReconciledFinding[] {
  // Step 1: Flatten with source attribution and stable identity data
  const attributed: AttributedFinding[] = []
  for (const [source, findings] of Object.entries(channelFindings)) {
    for (const finding of findings) {
      attributed.push({
        ...finding,
        source,
        finding_key: computeFindingKey(finding),
        normalized_location: normalizeLocationForKey(finding.location),
        shingle: descriptionShingle(finding.description),
      })
    }
  }

  if (attributed.length === 0) return []

  // Step 2: Group by exact stable identity, then location-anchored fuzzy description match.
  const groups: ReconcileGroup[] = []
  const keyIndex = new Map<string, ReconcileGroup>()
  for (const finding of attributed) {
    const exact = keyIndex.get(finding.finding_key)
    if (exact !== undefined) {
      exact.findings.push(finding)
      continue
    }

    const fuzzy = groups.find((group) =>
      group.normalized_location === finding.normalized_location &&
      jaccardSimilarity(group.shingle, finding.shingle) >= 0.7,
    )
    if (fuzzy !== undefined) {
      fuzzy.findings.push(finding)
      continue
    }

    const group: ReconcileGroup = {
      finding_key: finding.finding_key,
      normalized_location: finding.normalized_location,
      shingle: finding.shingle,
      findings: [finding],
    }
    groups.push(group)
    keyIndex.set(finding.finding_key, group)
  }

  // Step 3: Reconcile each group
  const results: ReconciledFinding[] = []
  for (const group of groups) {
    const findings = group.findings
    const sources = [...new Set(findings.map((f) => f.source))]
    const severities = [...new Set(findings.map((f) => f.severity))]
    const effectiveSeverity = severities.reduce(higherSeverity)

    let agreement: Agreement
    let confidence: Confidence

    if (sources.length >= 2) {
      if (severities.length === 1) {
        // 2+ sources, same severity -> consensus, high
        agreement = 'consensus'
        confidence = 'high'
      } else {
        // 2+ sources, different severity -> majority, medium
        agreement = 'majority'
        confidence = 'medium'
      }
    } else {
      // Single source -> unique
      agreement = 'unique'
      const isCompensating = sources[0].startsWith('compensating-')
      confidence = effectiveSeverity === 'P0' ? 'high'
        : isCompensating ? 'low'
          : 'medium'
    }

    // Use the finding with the longest description as representative (deterministic)
    const representative = findings.reduce((best, current) =>
      current.description.length > best.description.length ? current : best,
    )

    results.push({
      severity: effectiveSeverity,
      location: representative.location,
      description: representative.description,
      suggestion: representative.suggestion,
      ...(representative.id !== undefined ? { id: representative.id } : {}),
      ...(representative.category !== undefined ? { category: representative.category } : {}),
      confidence,
      sources,
      agreement,
    })
  }

  // Step 4: Sort by severity (P0 first)
  results.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  // Auto-generate finding IDs (only backfill when absent)
  results.forEach((f, i) => {
    if (!f.id) {
      f.id = `F-${String(i + 1).padStart(3, '0')}`
    }
  })

  return results
}

/**
 * Evaluate the quality gate: passes if no finding has severity at or above
 * the threshold (i.e., no finding with SEVERITY_ORDER <= threshold order).
 */
export function evaluateGate(findings: ReconciledFinding[], threshold: Severity): boolean {
  const thresholdOrder = SEVERITY_ORDER[threshold]
  return findings.every((f) => SEVERITY_ORDER[f.severity] > thresholdOrder)
}

/**
 * Derive the review verdict from gate evaluation and channel health.
 *
 * Priority: blocked > needs-user-decision > degraded-pass > pass
 */
export function deriveVerdict(
  gatePassed: boolean,
  channelStatuses: Record<string, ChannelStatus>,
): Verdict {
  const statuses = Object.values(channelStatuses)
  const completedCount = statuses.filter(s => s === 'completed').length

  // No channels completed — can't make a determination
  if (completedCount === 0) return 'needs-user-decision'

  // Gate failed — findings at or above threshold
  if (!gatePassed) return 'blocked'

  // Gate passed but some channels didn't complete
  if (completedCount < statuses.length) return 'degraded-pass'

  return 'pass'
}
