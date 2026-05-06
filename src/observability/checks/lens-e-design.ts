import { createHash } from 'node:crypto'
import type { Finding } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'
import { loadObservabilityConfig } from '../engine/checks/observability-config.js'

const lensId = 'E-design'

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

const COLOR_PROPS = new Set(['color', 'background', 'background-color', 'border-color', 'fill', 'stroke'])
const SPACING_PROPS = new Set(['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap', 'top', 'right', 'bottom', 'left'])
const TYPOGRAPHY_PROPS = new Set(['font-size', 'font-family', 'font-weight', 'line-height'])

function categoryOfProp(prop: string | undefined): 'color' | 'spacing' | 'typography' | null {
  if (!prop) return null
  if (COLOR_PROPS.has(prop)) return 'color'
  if (SPACING_PROPS.has(prop)) return 'spacing'
  if (TYPOGRAPHY_PROPS.has(prop)) return 'typography'
  return null
}

export const lensEDesign: LensFn = async (graph) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()
  const config = loadObservabilityConfig(graph.cwd)
  const threshold = config.lenses['E-design']?.ad_hoc_token_threshold ?? 3

  // (a) per-file ad-hoc threshold
  const adHocByFile = new Map<string, number>()
  for (const e of graph.edges) {
    if (e.kind !== 'file_to_token_use') continue
    if (!(e as { to: string }).to.startsWith('ad_hoc')) continue
    const fileId = (e as { from: string }).from
    adHocByFile.set(fileId, (adHocByFile.get(fileId) ?? 0) + 1)
  }
  for (const [fileId, count] of adHocByFile) {
    if (count <= threshold) continue
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

  // (b) per-property must-priority bypass — uses the `property` field on the edge
  const mustCategories = new Set(graph.tokens.filter((t) => t.priority === 'must').map((t) => t.category))
  if (mustCategories.size > 0) {
    for (const e of graph.edges) {
      if (e.kind !== 'file_to_token_use') continue
      if (!(e as { to: string }).to.startsWith('ad_hoc')) continue
      const ed = e as { from: string; to: string; property?: string }
      const cat = categoryOfProp(ed.property)
      if (!cat || !mustCategories.has(cat)) continue
      findings.push({
        id: makeFindingId([lensId, 'must-priority', ed.from, ed.property ?? '']),
        lens_id: lensId, severity: 'P0',
        title: `must-priority token bypassed in ${ed.from.replace(/^file:/, '')} (property: ${ed.property})`,
        description: `${ed.from.replace(/^file:/, '')} uses an ad-hoc value for property "${ed.property}" whose category (${cat}) has a must-priority token.`,
        source_doc: 'docs/design-system.md',
        evidence: { kind: 'rule_violation', rule_id: 'design-must-token', file: ed.from },
        confidence: 'high', first_seen: now, last_seen: now, status: 'open',
        fix_hint: { kind: 'rename_token', target: ed.from.replace(/^file:/, ''), prompt: `Replace the ad-hoc ${ed.property} value with the corresponding must-priority token.` },
      })
    }
  }

  return findings
}
