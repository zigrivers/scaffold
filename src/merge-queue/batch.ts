import { minimatch } from 'minimatch'
import type { PrEntry } from './types.js'

interface DiffSize { additions: number; deletions: number }

export function riskScore(entry: PrEntry, info: DiffSize): number {
  return info.additions + info.deletions + entry.queueFailures * 1000
}

export interface ComposeOpts {
  /** pr -> changed files. A pr mapped to (or defaulting to) null has an UNKNOWN
   *  file set and conservatively conflicts with everything (solo batch only).
   *  Omit the map entirely to disable conflict partitioning (legacy behavior). */
  files?: Map<number, string[] | null>
  /** minimatch globs (dot:true); a PR touching a zone is only ever batched solo. */
  overlapZones?: string[]
}

export function touchesOverlapZone(files: string[], zones: string[]): boolean {
  return files.some(f => zones.some(z => minimatch(f, z, { dot: true })))
}

/** D13: greedy conflict-aware batch composition, preserving low-risk-first
 *  order. The lowest-risk PR anchors the batch; each later PR joins only if its
 *  file set is known and disjoint from every member so far. Skipped PRs stay
 *  QUEUED for a later cycle — overlapping PRs NEVER share a batch (bisection
 *  cannot separate entangled diffs, and a mid-batch merge conflict would wedge
 *  the candidate). */
export function composeBatch(
  queued: PrEntry[],
  infos: Map<number, DiffSize>,
  cap: number,
  opts: ComposeOpts = {},
): number[] {
  const scored = queued.map(e => {
    const info = infos.get(e.pr)
    return { pr: e.pr, score: info ? riskScore(e, info) : Number.MAX_SAFE_INTEGER }
  }).sort((a, b) => a.score - b.score)
  const zones = opts.overlapZones ?? []
  // No files map at all -> every file set counts as known-empty (legacy path).
  const filesOf = (pr: number): string[] | null =>
    opts.files === undefined ? [] : opts.files.get(pr) ?? null
  const members: number[] = []
  const taken = new Set<string>()
  for (const { pr } of scored) {
    if (members.length >= cap) break
    const files = filesOf(pr)
    if (files === null || (zones.length > 0 && touchesOverlapZone(files, zones))) {
      // Unknown file set or overlap zone: this PR is only ever gated alone. It
      // can anchor an empty batch (and closes it) — otherwise it waits.
      if (members.length === 0) {
        members.push(pr)
        return members
      }
      continue
    }
    if (members.length === 0) {
      members.push(pr)
      for (const f of files) taken.add(f)
      continue
    }
    if (files.some(f => taken.has(f))) continue // overlaps a member — next cycle
    members.push(pr)
    for (const f of files) taken.add(f)
  }
  return members
}

export function splitBatch(members: number[]): [number[], number[]] {
  if (members.length < 2) throw new Error('cannot split a singleton batch — eject it instead')
  const mid = Math.floor(members.length / 2)
  return [members.slice(0, mid), members.slice(mid)]
}
