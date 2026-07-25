import type { JournalEvent } from './types.js'

export type BootstrapStage = 'intent' | 'merged' | 'armed'

export interface BootstrapAttempt {
  bootstrapId: string
  pr: number
  gatedHeadSha: string
  mergeCommitSha: string | null
  stage: BootstrapStage
  /** Timestamp of the id's latest journaled event. */
  at: string
}

/** Fold the journal into per-id bootstrap attempts (D9). Events for an id
 *  arrive strictly intent → merged → armed; later stages win. An id with only
 *  an intent is either in-flight or aborted — planResume decides which via
 *  GitHub's authoritative PR state, never the journal alone. */
export function reduceBootstrapAttempts(events: JournalEvent[]): Map<string, BootstrapAttempt> {
  const attempts = new Map<string, BootstrapAttempt>()
  for (const e of events) {
    if (e.type !== 'bootstrap_intent' && e.type !== 'bootstrap_merged' && e.type !== 'bootstrap_armed') {
      continue
    }
    const base: BootstrapAttempt = attempts.get(e.bootstrapId) ?? {
      bootstrapId: e.bootstrapId, pr: e.pr, gatedHeadSha: e.gatedHeadSha,
      mergeCommitSha: null, stage: 'intent', at: e.at,
    }
    if (e.type === 'bootstrap_merged') {
      if (base.stage !== 'armed') base.stage = 'merged'
      base.mergeCommitSha = e.mergeCommitSha
    } else if (e.type === 'bootstrap_armed') {
      base.stage = 'armed'
    }
    base.at = e.at
    attempts.set(e.bootstrapId, base)
  }
  return attempts
}

/** Latest attempt for a PR — ULIDs sort lexicographically in creation order,
 *  so the max bootstrapId is the newest attempt. */
export function latestAttemptFor(events: JournalEvent[], pr: number): BootstrapAttempt | null {
  const forPr = [...reduceBootstrapAttempts(events).values()].filter(a => a.pr === pr)
  if (forPr.length === 0) return null
  forPr.sort((a, b) => (a.bootstrapId < b.bootstrapId ? -1 : 1))
  return forPr[forPr.length - 1]
}

export type ResumeDecision =
  | { kind: 'fresh' }
  | { kind: 'complete'; attempt: BootstrapAttempt }
  | { kind: 'arm-and-verify'; attempt: BootstrapAttempt }
  | { kind: 'record-merge-then-arm'; attempt: BootstrapAttempt }
  | { kind: 'rerun-merge'; attempt: BootstrapAttempt }
  | { kind: 'aborted'; attempt: BootstrapAttempt; reason: string }

/** Reconcile the journaled attempt against GitHub's AUTHORITATIVE PR state
 *  (D9): intent-without-merged while GitHub says MERGED is the crash window
 *  between the merge API call and the journal write — record retroactively,
 *  never re-merge. An aborted attempt is terminal for its id. */
export function planResume(
  attempt: BootstrapAttempt | null,
  gh: { state: 'OPEN' | 'MERGED' | 'CLOSED'; headSha: string },
): ResumeDecision {
  if (attempt === null) return { kind: 'fresh' }
  if (attempt.stage === 'armed') return { kind: 'complete', attempt }
  if (attempt.stage === 'merged') return { kind: 'arm-and-verify', attempt }
  // stage === 'intent': did the crash hit the merge-API/journal window?
  if (gh.state === 'MERGED') return { kind: 'record-merge-then-arm', attempt }
  if (gh.state === 'CLOSED') {
    return {
      kind: 'aborted', attempt,
      reason: `PR #${attempt.pr} was closed without merging — attempt ${attempt.bootstrapId} `
        + 'is terminal; reopen the PR and re-run scaffold mq bootstrap',
    }
  }
  if (gh.headSha !== attempt.gatedHeadSha) {
    return {
      kind: 'aborted', attempt,
      reason: `PR head moved (gated ${attempt.gatedHeadSha}, now ${gh.headSha}) — the gate no longer `
        + `covers this head; attempt ${attempt.bootstrapId} is terminal, re-run scaffold mq bootstrap `
        + `--pr ${attempt.pr} for a fresh gated attempt`,
    }
  }
  return { kind: 'rerun-merge', attempt }
}
