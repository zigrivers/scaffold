import { createHash } from 'node:crypto'
import type { Finding } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'
import { loadObservabilityConfig } from '../engine/checks/observability-config.js'

const lensId = 'E-design'

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

export const lensEDesign: LensFn = async (graph) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()
  const config = loadObservabilityConfig(graph.cwd)
  const threshold = config.lenses['E-design']?.ad_hoc_token_threshold ?? 3

  const adHocByFile = new Map<string, number>()
  for (const e of graph.edges) {
    if (e.kind !== 'file_to_token_use') continue
    const to = (e as { kind: string; from: string; to: string }).to
    if (to !== 'ad_hoc') continue
    const from = (e as { kind: string; from: string; to: string }).from
    adHocByFile.set(from, (adHocByFile.get(from) ?? 0) + 1)
  }

  for (const [fileId, count] of adHocByFile) {
    if (count <= threshold) {
      // Still emit P0 must-priority finding if applicable
    } else {
      findings.push({
        id: makeFindingId([lensId, 'ad-hoc', fileId]),
        lens_id: lensId, severity: 'P1',
        title: `${count} ad-hoc design values in ${fileId.replace(/^file:/, '')} (threshold: ${threshold})`,
        description: `${fileId.replace(/^file:/, '')} has ${count} style values that don't resolve to design-system tokens.`,
        source_doc: 'docs/design-system.md',
        evidence: { kind: 'rule_violation', rule_id: 'design-ad-hoc-threshold', file: fileId },
        confidence: 'high', first_seen: now, last_seen: now, status: 'open',
        fix_hint: { kind: 'rename_token', target: fileId.replace(/^file:/, ''), prompt: `Replace ad-hoc values with design-system tokens in ${fileId.replace(/^file:/, '')}.` },
      })
    }

    // P0: must-priority token category used with an ad-hoc value
    const mustCategories = new Set(graph.tokens.filter((t) => t.priority === 'must').map((t) => t.category))
    if (mustCategories.size > 0 && count > 0) {
      findings.push({
        id: makeFindingId([lensId, 'must-priority', fileId]),
        lens_id: lensId, severity: 'P0',
        title: `must-priority token bypassed in ${fileId.replace(/^file:/, '')}`,
        description: `${fileId.replace(/^file:/, '')} has ad-hoc style values for property categories that include a must-priority token (${[...mustCategories].join(', ')}).`,
        source_doc: 'docs/design-system.md',
        evidence: { kind: 'rule_violation', rule_id: 'design-must-token', file: fileId },
        confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
        fix_hint: { kind: 'rename_token', target: fileId.replace(/^file:/, ''), prompt: `Replace ad-hoc values with the corresponding must-priority tokens in ${fileId.replace(/^file:/, '')}.` },
      })
    }
  }

  return findings
}
