import type { JournalEvent, PrEntry, PrState, QueueState } from './types.js'

export const TERMINAL_PR_STATES: ReadonlySet<PrState> = new Set<PrState>([
  'LANDED', 'EJECTED', 'NEEDS_REBASE', 'CANCELLED',
])

export function reduceState(events: JournalEvent[]): QueueState {
  const state: QueueState = { entries: new Map(), batches: new Map(), flakes: [] }
  for (const e of events) {
    switch (e.type) {
    case 'enqueued': {
      const existing = state.entries.get(e.pr)
      if (existing && !TERMINAL_PR_STATES.has(existing.state)) break
      state.entries.set(e.pr, {
        pr: e.pr, state: 'QUEUED', enqueuedAt: e.at,
        queueFailures: existing?.queueFailures ?? 0,
      })
      break
    }
    case 'pr_state': {
      const entry = state.entries.get(e.pr)
      if (!entry) break
      entry.state = e.state
      entry.batchId = e.batchId ?? entry.batchId
      entry.note = e.note ?? entry.note
      if (e.state === 'EJECTED') entry.queueFailures += 1
      break
    }
    case 'batch_created':
      state.batches.set(e.batchId, {
        id: e.batchId, state: 'CONSTRUCTING', members: e.members,
        parent: e.parent, candidateRef: `refs/merge-queue/batch-${e.batchId}`,
      })
      break
    case 'batch_state': {
      const batch = state.batches.get(e.batchId)
      if (!batch) break
      batch.state = e.state
      batch.baseSha = e.baseSha ?? batch.baseSha
      batch.candidateTree = e.candidateTree ?? batch.candidateTree
      break
    }
    case 'flake':
      state.flakes.push({ testId: e.testId, at: e.at })
      break
    case 'gate_metrics':
      break
    }
  }
  return state
}

export function queuedPrs(state: QueueState): PrEntry[] {
  const requeued: PrEntry[] = []
  const queued: PrEntry[] = []
  for (const entry of state.entries.values()) {
    if (entry.state === 'REQUEUED_SPLIT') requeued.push(entry)
    else if (entry.state === 'QUEUED') queued.push(entry)
  }
  const byAge = (a: PrEntry, b: PrEntry) => a.enqueuedAt.localeCompare(b.enqueuedAt)
  return [...requeued.sort(byAge), ...queued.sort(byAge)]
}
