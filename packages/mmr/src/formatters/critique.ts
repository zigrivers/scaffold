import type {
  CritiqueReport, ReconciledCritiqueItem, CritiqueSplit, CritiqueKind,
} from '../types/critique.js'

export function formatCritiqueJson(report: CritiqueReport): string {
  return JSON.stringify(report, null, 2)
}

const KIND_HEADER: Record<CritiqueKind, string> = {
  concern: 'CONCERNS',
  alternative: 'ALTERNATIVES',
  consideration: 'CONSIDERATIONS',
  'open-question': 'OPEN QUESTIONS',
}
const KIND_ORDER: CritiqueKind[] = ['concern', 'alternative', 'consideration', 'open-question']

function renderConverged(item: ReconciledCritiqueItem, lensed: boolean): string {
  // Under lenses, agreement no longer means independent consensus (it could be
  // assigned-role overlap), so we label it "perspective" instead of the tier.
  const tag = lensed ? 'perspective' : item.agreement
  const lines = [`  • [${item.kind} · ${tag}] ${item.theme} — ${item.observation}`]
  if (item.recommendation) lines.push(`      ↳ ${item.recommendation}`)
  lines.push(`      sources: ${item.sources.join(', ')}`)
  return lines.join('\n')
}

function renderUnique(item: ReconciledCritiqueItem): string {
  const lines = [`  • ${item.theme} — ${item.observation}`]
  if (item.recommendation) lines.push(`      ↳ ${item.recommendation}`)
  lines.push(`      sources: ${item.sources.join(', ')}`)
  return lines.join('\n')
}

function renderSplit(split: CritiqueSplit): string {
  const lines = [`  ▲ ${split.theme}`]
  for (const pos of split.positions) {
    const ids = pos.item_ids.length ? ` [${pos.item_ids.join(', ')}]` : ''
    lines.push(`      - ${pos.stance} (sources: ${pos.sources.join(', ') || '—'})${ids}`)
  }
  if (split.crux) lines.push(`      ↳ crux: ${split.crux}`)
  return lines.join('\n')
}

/**
 * Render the advisory critique report (Phase 2 layout): CONVERGENCE (agreed
 * items) → DIVERGENCE (splits + crux, D2) → single-model items grouped by kind
 * → CHANNELS → editorial SYNTHESIS (D6). No verdict, no gate.
 */
export function formatCritiqueText(report: CritiqueReport): string {
  const out: string[] = []
  const lensed = !!(report.lenses && report.lenses.length > 0)
  const channelCount = Object.keys(report.per_channel).length
  const roundTag = report.round ? ` · round ${report.round}` : ''
  const lensTag = lensed ? ` · lenses: ${report.lenses!.join(', ')}` : ''
  out.push(`CRITIQUE · ${report.artifact_source} · ${channelCount} channels${roundTag}${lensTag} · advisory (no gate)`)
  out.push('')

  const converged = report.items.filter((i) => i.agreement !== 'unique')
  const unique = report.items.filter((i) => i.agreement === 'unique')

  if (converged.length > 0) {
    out.push(lensed
      ? 'PERSPECTIVES — raised under more than one lens'
      : 'CONVERGENCE — independent models agreed (high signal)')
    for (const item of converged) out.push(renderConverged(item, lensed))
    out.push('')
  }

  if (report.splits && report.splits.length > 0) {
    out.push('DIVERGENCE — models split (your judgment call)')
    for (const split of report.splits) out.push(renderSplit(split))
    out.push('')
  }

  for (const kind of KIND_ORDER) {
    const group = unique.filter((i) => i.kind === kind)
    if (group.length === 0) continue
    out.push(KIND_HEADER[kind])
    for (const item of group) out.push(renderUnique(item))
    out.push('')
  }

  if (report.items.length === 0 && (!report.splits || report.splits.length === 0)) {
    out.push('No critique items were returned.')
    out.push('')
  }

  if (report.context_used && report.context_used.length > 0) {
    out.push('CONTEXT USED — repo files the models judged the design against')
    out.push(`  ${report.context_used.join(', ')}`)
    out.push('')
  }

  out.push('CHANNELS')
  for (const [name, ch] of Object.entries(report.per_channel)) {
    const detail = ch.status === 'completed'
      ? `${ch.item_count} item(s)`
      : `${ch.status}${ch.recovery ? ` — ${ch.recovery}` : ''}`
    out.push(`  ${name}: ${detail}`)
  }
  out.push('')

  out.push('SYNTHESIS')
  if (report.synthesis) {
    out.push(`  ${report.synthesis}`)
    out.push(`  (${report.summary})`)
  } else {
    out.push(`  ${report.summary}`)
  }
  return out.join('\n')
}
