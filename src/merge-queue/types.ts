export type PrState =
  | 'QUEUED' | 'IN_BATCH' | 'TESTING' | 'FLAKE_RETRY' | 'PASSED' | 'LANDING' | 'LANDED'
  | 'REQUEUED_SPLIT' | 'EJECTED' | 'NEEDS_REBASE' | 'CANCELLED'

export type BatchState =
  | 'CONSTRUCTING' | 'RUNNING' | 'GREEN' | 'LANDING' | 'DONE'
  | 'RED' | 'SPLITTING' | 'ABORTED'

export interface PrEntry {
  pr: number
  state: PrState
  enqueuedAt: string
  batchId?: string
  /** Times this PR was ejected from a failing context (risk signal for ordering). */
  queueFailures: number
  note?: string
}

export interface BatchRecord {
  id: string
  state: BatchState
  members: number[]
  parent?: string
  candidateRef: string
  baseSha?: string
  candidateTree?: string
}

export type JournalEvent =
  | { type: 'enqueued'; pr: number; at: string }
  | {
      type: 'pr_state'; pr: number; state: PrState; at: string
      batchId?: string; note?: string
    }
  | { type: 'batch_created'; batchId: string; members: number[]; at: string; parent?: string }
  | {
      type: 'batch_state'; batchId: string; state: BatchState; at: string
      baseSha?: string; candidateTree?: string; note?: string
    }
  | { type: 'flake'; testId: string; at: string }
  | {
      type: 'gate_metrics'; batchId: string; seconds: number
      result: 'green' | 'red' | 'timeout'; at: string
    }
  | { type: 'gate_cached'; batchId: string; key: string; savedSeconds: number; at: string }
  | { type: 'full_gate_recorded'; tree: string; seconds: number; instrumented: boolean; at: string }
  // D9 bootstrap events: EVERY event carries bootstrapId (ULID) + pr + the
  // gated head SHA; bootstrap_merged additionally records the merge commit.
  | { type: 'bootstrap_intent'; bootstrapId: string; pr: number; gatedHeadSha: string; at: string }
  | {
      type: 'bootstrap_merged'; bootstrapId: string; pr: number; gatedHeadSha: string
      mergeCommitSha: string; at: string
    }
  | { type: 'bootstrap_armed'; bootstrapId: string; pr: number; gatedHeadSha: string; at: string }

export interface QueueState {
  entries: Map<number, PrEntry>
  batches: Map<string, BatchRecord>
  flakes: { testId: string; at: string }[]
}

export interface MergeQueueConfig {
  /** Fast merge gate; falls back to full when it cannot classify (spec D5). */
  gate_command: string
  /** Authoritative full gate (whole-batch infra retry, post-merge parity). */
  full_gate_command: string
  /** Batch cap when gate_command is the affected gate (spec §5.2). */
  batch_cap: number
  poll_seconds: number
  gate_timeout_minutes: number
  quarantine_path: string
  ready_label: string
  /** Who runs the post-merge/nightly full suite (spec D4′). Not read by the daemon. */
  gate_executor: 'gha-selfhosted' | 'local-poller'
  /** D12: size cap for .mq/gate-cache.json; 0 disables the gate-result cache. */
  gate_cache_max_entries: number
}

export function defaultMergeQueueConfig(): MergeQueueConfig {
  return {
    gate_command: 'make check-affected',
    full_gate_command: 'make check',
    batch_cap: 16,
    poll_seconds: 60,
    gate_timeout_minutes: 45,
    quarantine_path: '.mq/quarantine.txt',
    ready_label: 'mq:ready',
    gate_executor: 'gha-selfhosted',
    gate_cache_max_entries: 200,
  }
}
