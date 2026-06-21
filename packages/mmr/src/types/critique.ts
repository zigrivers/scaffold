import type { ChannelStatus } from '../types.js'

/**
 * Design-critique types (the second-opinion engine's design kind). Deliberately
 * parallel to — never reusing — the code-review Finding/Severity types: a
 * critique is advisory, has no severity, and never gates. See the vision doc
 * docs/superpowers/specs/2026-06-20-mmr-second-opinion-engine-vision.html.
 */

/** The four item kinds (D1). No severity — items are sorted by agreement tier. */
export type CritiqueKind = 'concern' | 'alternative' | 'consideration' | 'open-question'

export const CRITIQUE_KINDS: readonly CritiqueKind[] = [
  'concern', 'alternative', 'consideration', 'open-question',
]

/** A single point one model raised about the artifact. */
export interface CritiqueItem {
  kind: CritiqueKind
  /** Short label for the point, e.g. "scaling". */
  theme: string
  /** The substance of the point. */
  observation: string
  /** Optional suggested direction (absent for pure open-questions). */
  recommendation?: string
}

/** How many independent channels raised a clustered item (D1/D2). */
export type CritiqueAgreement = 'consensus' | 'majority' | 'unique'

/** A cross-model clustered item with its provenance. */
export interface ReconciledCritiqueItem extends CritiqueItem {
  id: string
  /** Channels that independently raised this point. */
  sources: string[]
  agreement: CritiqueAgreement
  /** Char-5-gram set of the observation, for cross-round fuzzy match (Phase 4). */
  observation_shingle?: string[]
}

/** One side of a genuine cross-model disagreement (D2). */
export interface CritiqueSplitPosition {
  /** One-line statement of this side's recommendation. */
  stance: string
  /** The critique item ids supporting this side. */
  item_ids: string[]
  /** The channels holding this side. */
  sources: string[]
}

/** A first-class disagreement: the tool presents it, never resolves it (D2). */
export interface CritiqueSplit {
  theme: string
  positions: CritiqueSplitPosition[]
  /** The fact or assumption that, if known, would resolve the split. */
  crux: string
}

/** Output of the editorial synthesis pass (D6) — structures, never adjudicates. */
export interface CritiqueSynthesis {
  splits: CritiqueSplit[]
  /** Editorial prose that cites item ids and introduces no new opinion. */
  synthesis: string
}

/** Per-channel outcome in a critique run. */
export interface CritiqueChannelResult {
  status: ChannelStatus
  item_count: number
  /** The model's own one-line roll-up, when it provided one. */
  summary?: string
  /** Recovery command for a degraded channel, surfaced at the point of pain. */
  recovery?: string
}

/**
 * The advisory output of `mmr critique`. No verdict, no gate, no severity —
 * `kind: 'design-critique'` discriminates it from a code-review ReconciledResults.
 */
export interface CritiqueReport {
  kind: 'design-critique'
  job_id: string
  /** Where the critiqued artifact came from (a path or "stdin"). */
  artifact_source: string
  items: ReconciledCritiqueItem[]
  per_channel: Record<string, CritiqueChannelResult>
  /** Genuine cross-model disagreements, surfaced first-class (D2). */
  splits?: CritiqueSplit[]
  /** Editorial synthesis prose (D6); absent when the synthesis pass is skipped. */
  synthesis?: string
  /** Neutral count roll-up of the run. */
  summary: string
  metadata: {
    channels_dispatched: number
    channels_completed: number
    total_elapsed: string
  }
}
