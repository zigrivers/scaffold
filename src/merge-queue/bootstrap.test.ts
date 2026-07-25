import { describe, expect, it } from 'vitest'
import {
  latestAttemptFor, planResume, reduceBootstrapAttempts,
} from './bootstrap.js'
import { reduceState } from './state.js'
import type { JournalEvent } from './types.js'

const T1 = '2026-07-19T10:00:00.000Z'
const T2 = '2026-07-19T10:01:00.000Z'
const T3 = '2026-07-19T10:02:00.000Z'

function intent(id: string, pr = 41, sha = 'SHA-A', at = T1): JournalEvent {
  return { type: 'bootstrap_intent', bootstrapId: id, pr, gatedHeadSha: sha, at }
}
function merged(id: string, pr = 41, sha = 'SHA-A', mergeSha = 'M1', at = T2): JournalEvent {
  return { type: 'bootstrap_merged', bootstrapId: id, pr, gatedHeadSha: sha, mergeCommitSha: mergeSha, at }
}
function armed(id: string, pr = 41, sha = 'SHA-A', at = T3): JournalEvent {
  return { type: 'bootstrap_armed', bootstrapId: id, pr, gatedHeadSha: sha, at }
}

describe('reduceBootstrapAttempts (D9 state machine)', () => {
  it('folds intent → merged → armed per id, carrying pr, gated SHA, and merge SHA', () => {
    const attempts = reduceBootstrapAttempts([intent('01A'), merged('01A'), armed('01A')])
    expect(attempts.get('01A')).toEqual({
      bootstrapId: '01A', pr: 41, gatedHeadSha: 'SHA-A',
      mergeCommitSha: 'M1', stage: 'armed', at: T3,
    })
  })
  it('an intent-only id stays at stage intent with no merge SHA', () => {
    const a = reduceBootstrapAttempts([intent('01A')]).get('01A')
    expect(a?.stage).toBe('intent')
    expect(a?.mergeCommitSha).toBeNull()
  })
  it('keeps attempts for different ids separate (a stale attempt can never arm a new one)', () => {
    const attempts = reduceBootstrapAttempts([
      intent('01A', 41, 'SHA-A'), // aborted attempt: intent only
      intent('01B', 41, 'SHA-B', T2), merged('01B', 41, 'SHA-B', 'M2', T3),
    ])
    expect(attempts.get('01A')?.stage).toBe('intent')
    expect(attempts.get('01B')?.stage).toBe('merged')
  })
  it('latestAttemptFor picks the newest id for the PR (ULIDs sort lexicographically)', () => {
    const events = [intent('01A'), armed('01A'), intent('01B', 41, 'SHA-B', T2)]
    expect(latestAttemptFor(events, 41)?.bootstrapId).toBe('01B')
    expect(latestAttemptFor(events, 99)).toBeNull()
  })
})

describe('planResume (GitHub-authoritative reconciliation, D9)', () => {
  const base = {
    bootstrapId: '01A', pr: 41, gatedHeadSha: 'SHA-A',
    mergeCommitSha: null as string | null, stage: 'intent' as const, at: T1,
  }
  it('no attempt ⇒ fresh', () => {
    expect(planResume(null, { state: 'OPEN', headSha: 'SHA-A' })).toEqual({ kind: 'fresh' })
  })
  it('armed attempt ⇒ complete (idempotent no-op)', () => {
    const a = { ...base, stage: 'armed' as const }
    expect(planResume(a, { state: 'MERGED', headSha: 'SHA-A' }).kind).toBe('complete')
  })
  it('merged-without-armed ⇒ arm-and-verify (exactly what --finish surfaces)', () => {
    const a = { ...base, stage: 'merged' as const, mergeCommitSha: 'M1' }
    expect(planResume(a, { state: 'MERGED', headSha: 'SHA-A' }).kind).toBe('arm-and-verify')
  })
  it('intent + GitHub MERGED ⇒ record-merge-then-arm (crash window; never re-merge)', () => {
    expect(planResume(base, { state: 'MERGED', headSha: 'SHA-A' }).kind).toBe('record-merge-then-arm')
  })
  it('intent + OPEN + head unchanged ⇒ rerun-merge under the SAME id', () => {
    expect(planResume(base, { state: 'OPEN', headSha: 'SHA-A' }).kind).toBe('rerun-merge')
  })
  it('intent + OPEN + head moved ⇒ aborted (terminal for the id; retry opens a new id)', () => {
    const d = planResume(base, { state: 'OPEN', headSha: 'SHA-NEW' })
    expect(d.kind).toBe('aborted')
    if (d.kind === 'aborted') expect(d.reason).toMatch(/head moved/)
  })
  it('intent + CLOSED ⇒ aborted', () => {
    expect(planResume(base, { state: 'CLOSED', headSha: 'SHA-A' }).kind).toBe('aborted')
  })
})

describe('journal compatibility', () => {
  it('reduceState ignores bootstrap events (queue state is unaffected)', () => {
    const events: JournalEvent[] = [
      { type: 'enqueued', pr: 7, at: T1 },
      intent('01A'), merged('01A'), armed('01A'),
    ]
    const state = reduceState(events)
    expect(state.entries.get(7)?.state).toBe('QUEUED')
    expect(state.entries.size).toBe(1)
  })
})
