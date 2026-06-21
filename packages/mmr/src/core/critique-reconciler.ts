import { descriptionShingle, jaccardSimilarity, shingleSize } from './stable-id.js'
import {
  CRITIQUE_KINDS,
  type CritiqueItem,
  type CritiqueAgreement,
  type CritiqueKind,
  type ReconciledCritiqueItem,
} from '../types/critique.js'

/** Two observations cluster when their char-5-gram sets overlap at least this much. */
const CLUSTER_THRESHOLD = 0.4

interface AttributedItem extends CritiqueItem {
  source: string
  shingle: string[]
}

interface CritiqueGroup {
  items: AttributedItem[]
  shingle: string[]
}

const AGREEMENT_ORDER: Record<CritiqueAgreement, number> = { consensus: 0, majority: 1, unique: 2 }
const KIND_ORDER: Record<CritiqueKind, number> = {
  concern: 0, alternative: 1, consideration: 2, 'open-question': 3,
}

function bestKind(items: AttributedItem[]): CritiqueKind {
  // Representative kind = the most frequent; ties break by KIND_ORDER (concern first).
  const counts = new Map<CritiqueKind, number>()
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1)
  return [...CRITIQUE_KINDS].sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || KIND_ORDER[a] - KIND_ORDER[b],
  )[0]
}

/**
 * Cluster critique items across channels by observation similarity and label
 * each cluster by cross-model agreement (D1/D2). Unlike the code reconciler,
 * there is no shared file:line to anchor on, so clustering is purely textual
 * (char-5-gram Jaccard over the observation). No severity, no gate.
 */
export function reconcileCritique(channelItems: Record<string, CritiqueItem[]>): ReconciledCritiqueItem[] {
  // Flatten with source + shingle, in a deterministic order.
  const attributed: AttributedItem[] = []
  for (const source of Object.keys(channelItems).sort()) {
    for (const item of channelItems[source]) {
      attributed.push({ ...item, source, shingle: descriptionShingle(item.observation) })
    }
  }
  attributed.sort((a, b) => a.observation.localeCompare(b.observation) || a.source.localeCompare(b.source))

  // Greedy clustering against each group's representative shingle.
  const groups: CritiqueGroup[] = []
  for (const item of attributed) {
    let best: { group: CritiqueGroup; score: number } | undefined
    if (shingleSize(item.shingle) > 0) {
      for (const group of groups) {
        if (shingleSize(group.shingle) === 0) continue
        const score = jaccardSimilarity(item.shingle, group.shingle)
        if (score >= CLUSTER_THRESHOLD && (best === undefined || score > best.score)) {
          best = { group, score }
        }
      }
    }
    if (best) {
      best.group.items.push(item)
      // Representative shingle tracks the longest observation in the group.
      const longest = best.group.items.reduce((a, b) => (b.observation.length > a.observation.length ? b : a))
      best.group.shingle = longest.shingle
    } else {
      groups.push({ items: [item], shingle: item.shingle })
    }
  }

  // Reconcile each group.
  const results: ReconciledCritiqueItem[] = groups.map((group) => {
    const sources = [...new Set(group.items.map((i) => i.source))]
    const kinds = new Set(group.items.map((i) => i.kind))
    const agreement: CritiqueAgreement = sources.length >= 2
      ? (kinds.size === 1 ? 'consensus' : 'majority')
      : 'unique'
    const representative = group.items.reduce((a, b) => (b.observation.length > a.observation.length ? b : a))
    const recommendation = group.items.find((i) => i.recommendation)?.recommendation
    return {
      kind: bestKind(group.items),
      theme: representative.theme,
      observation: representative.observation,
      ...(recommendation ? { recommendation } : {}),
      id: '',
      sources: sources.sort(),
      agreement,
      observation_shingle: representative.shingle,
    }
  })

  // Sort consensus → majority → unique, then kind, then theme/observation; assign ids.
  results.sort((a, b) =>
    AGREEMENT_ORDER[a.agreement] - AGREEMENT_ORDER[b.agreement] ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    a.theme.localeCompare(b.theme) ||
    a.observation.localeCompare(b.observation),
  )
  results.forEach((item, i) => { item.id = `C-${String(i + 1).padStart(3, '0')}` })
  return results
}
