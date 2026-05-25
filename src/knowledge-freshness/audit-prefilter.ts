import type { KnowledgeEntry } from '../types/index.js'

export type FetchSourceFn = (url: string) => Promise<{ hash: string }>

const WINDOW_DAYS: Record<KnowledgeEntry['volatility'], number> = {
  'fast-moving': 14, evolving: 60, stable: 180,
}

interface Options { now: Date; max: number; fetch: FetchSourceFn }

export async function selectAuditCandidates(
  entries: KnowledgeEntry[],
  opts: Options,
): Promise<KnowledgeEntry[]> {
  const candidates: { entry: KnowledgeEntry; priority: number }[] = []
  for (const e of entries) {
    if (e.sources.length === 0) continue
    let select = false
    let priority = 0
    if (!e.lastReviewed) { select = true; priority = 100 }
    else {
      const parsed = new Date(e.lastReviewed).getTime()
      // If lastReviewed is malformed (e.g. "2026-99-99" passed the regex but
      // is not a real calendar date), `new Date()` yields NaN and the cadence
      // math would silently NOT select. Treat invalid dates as "needs audit
      // now" rather than skipping (round-3 F-002). The frontmatter validator
      // also rejects this on CI, but the runtime guard belongs here for the
      // case where validator and prefilter disagree.
      const ageDays = Number.isNaN(parsed)
        ? Number.POSITIVE_INFINITY
        : Math.floor((opts.now.getTime() - parsed) / 86400000)
      const window = WINDOW_DAYS[e.volatility]
      if (ageDays > window) { select = true; priority = 50 + (Number.isFinite(ageDays) ? ageDays : 1000) }
      else {
        // Round-7 F-004: fetch an entry's sources concurrently so a slow
        // upstream doesn't extend the per-entry hash-check phase linearly.
        // Concurrency is bounded by the small per-entry source count
        // (typically 1-3); we don't need a global limiter at Phase 1 scale.
        const hashedSources = await Promise.all(
          e.sources.map(async (s) => {
            if (!s.hash) return null
            // Match the audit meta-prompt's fetch shape: source.url + source.anchor.
            const fetchUrl = s.url + (s.anchor ?? '')
            try {
              const { hash } = await opts.fetch(fetchUrl)
              return { stored: s.hash, fetched: hash }
            } catch (err) {
              // Fetch errors must not crash the whole cron. Treat any error
              // as "could not verify" — leave the entry alone this run; the
              // next cadence-window expiry will pick it up.
              console.warn(
                `[knowledge-freshness] fetch failed for ${fetchUrl} (entry ${e.name}): ` +
                  (err as Error).message,
              )
              return null
            }
          }),
        )
        for (const h of hashedSources) {
          if (h && h.fetched !== h.stored) { select = true; priority = 75; break }
        }
      }
    }
    if (select) candidates.push({ entry: e, priority })
  }
  candidates.sort((a, b) => b.priority - a.priority)
  // Defensive: clamp max to a positive integer. Negative values would make
  // `slice(0, -n)` return all-but-n, silently bypassing the ceiling (round-2
  // F-003). The yargs CLI also rejects non-positive integers, but the library
  // is callable from tests and other CLIs, so the guard belongs here too.
  const ceiling = Number.isInteger(opts.max) && opts.max > 0 ? opts.max : 0
  return candidates.slice(0, ceiling).map(c => c.entry)
}
