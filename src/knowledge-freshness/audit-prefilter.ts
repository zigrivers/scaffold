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
      const ageDays = Math.floor((opts.now.getTime() - new Date(e.lastReviewed).getTime()) / 86400000)
      const window = WINDOW_DAYS[e.volatility]
      if (ageDays > window) { select = true; priority = 50 + ageDays }
      else {
        for (const s of e.sources) {
          if (!s.hash) continue
          // Fetch errors must not crash the whole cron. Treat any error as
          // "could not verify" — leave the entry alone this run; the next
          // cadence-window expiry will pick it up.
          let hash: string
          try { ({ hash } = await opts.fetch(s.url)) }
          catch (err) {
            console.warn(`[knowledge-freshness] fetch failed for ${s.url} (entry ${e.name}): ${(err as Error).message}`)
            continue
          }
          if (hash !== s.hash) { select = true; priority = 75; break }
        }
      }
    }
    if (select) candidates.push({ entry: e, priority })
  }
  candidates.sort((a, b) => b.priority - a.priority)
  return candidates.slice(0, opts.max).map(c => c.entry)
}
