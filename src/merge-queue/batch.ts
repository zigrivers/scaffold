import type { PrEntry } from './types.js'

interface DiffSize { additions: number; deletions: number }

export function riskScore(entry: PrEntry, info: DiffSize): number {
  return info.additions + info.deletions + entry.queueFailures * 1000
}

export function composeBatch(
  queued: PrEntry[],
  infos: Map<number, DiffSize>,
  cap: number,
): number[] {
  const scored = queued.map(e => {
    const info = infos.get(e.pr)
    return { pr: e.pr, score: info ? riskScore(e, info) : Number.MAX_SAFE_INTEGER }
  })
  return scored.sort((a, b) => a.score - b.score).slice(0, cap).map(s => s.pr)
}

export function splitBatch(members: number[]): [number[], number[]] {
  if (members.length < 2) throw new Error('cannot split a singleton batch — eject it instead')
  const mid = Math.floor(members.length / 2)
  return [members.slice(0, mid), members.slice(mid)]
}
