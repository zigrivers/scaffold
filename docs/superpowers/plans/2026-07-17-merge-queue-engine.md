# Merge-Queue Engine (`scaffold mq`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `scaffold mq` local batching merge-queue daemon (spec §5 of `docs/superpowers/specs/2026-07-17-merge-throughput-design.md`) — fire-and-forget enqueue, batch-then-bisect testing, flake retry, squash landing with the Not-Rocket-Science tree check, JSONL write-ahead journal, crash recovery, and the CLI surface.

**Architecture:** New `src/merge-queue/` module: pure core (types, journal, state reducer, batch logic) + injectable adapters (gh CLI, git ops, gate runner) + a daemon orchestrator + a yargs CLI command. All state lives in `.mq/` at the primary checkout root (gitignored). One new config section (`merge_queue:`) in the existing agent-ops config loader. This plan is 1 of 3 (Plan 2: agent-ops component + day-one CI; Plan 3: pipeline/knowledge/work-beads content).

**Tech Stack:** TypeScript (strict, repo style: no semicolons, single quotes, 2-space indent), vitest (colocated `*.test.ts`), `proper-lockfile` (already a dependency), `ulid` (already a dependency), `gh` CLI at runtime (feature-detected), bash + ShellCheck for the spike script.

## Global Constraints

- **No new npm dependencies.** `proper-lockfile`, `ulid`, `js-yaml`, `yargs`, `zod` are already in package.json — use only what exists.
- **Never hardcode `main`**: resolve the default branch from `origin/HEAD` (spec/repo convention).
- **Feature-detect external tools**: `gh` missing → hard error with clear message (the queue cannot work without it); `bd` missing → graceful no-op (advisory features only).
- **`.mq/` layout** (primary checkout root, gitignored): `journal.jsonl`, `daemon.lock`, `quarantine.txt`, `PAUSED`, `gate/` (daemon-owned worktree), `logs/`.
- **Journal is write-ahead**: every transition is appended *before* the action it describes is attempted; replay must tolerate a torn final line (crash mid-write).
- **Idempotent landing**: check `gh pr view --json mergedAt` before every merge attempt.
- **Timestamps**: ISO-8601 UTC (`new Date().toISOString()`); injectable `now()` in the daemon for tests.
- **Repo gates**: `npm run check` (lint + type-check + vitest) green per task; `make check-all` green before the final commit. ShellCheck-clean bash (`make lint`).
- **Commit after every task** with a conventional message; do NOT push mid-plan.
- Branch: continue on `merge-throughput-design`.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/spikes/squash-tree-spike.sh` | Spike 1: live verification that `gh pr merge --squash` reproduces locally squash-applied trees |
| `docs/superpowers/spikes/2026-07-17-squash-tree-equality.md` | Recorded spike results + D9 verdict |
| `src/merge-queue/types.ts` | PR/batch state unions, journal event types, `MergeQueueConfig` |
| `src/merge-queue/journal.ts` | Append-only JSONL journal: `appendEvent`, `readJournal` |
| `src/merge-queue/state.ts` | Pure reducer journal → `QueueState`; `queuedPrs` ordering |
| `src/merge-queue/batch.ts` | Pure batch composition (risk-ordered) + bisection split |
| `src/merge-queue/gh.ts` | `GhClient` interface + `gh` CLI implementation (`MQ_GH_CMD` override) |
| `src/merge-queue/git.ts` | `GitOps`: primary root, candidate construction (squash-apply), tree hashes, gate worktree |
| `src/merge-queue/gate.ts` | `runGate`: spawn gate command with timeout, capture log + failed-tests contract |
| `src/merge-queue/flakes.ts` | Flake counting, quarantine-list append, advisory bead filing |
| `src/merge-queue/daemon.ts` | Orchestrator: reconcile, collect→construct→test→land cycle, bisection stack |
| `src/cli/commands/mq.ts` | `scaffold mq <action>` (enqueue/daemon/status/eject/stats), singleton lock, auto-start |
| `tests/merge-queue-e2e.test.ts` | Integration harness: scratch origin + stub `gh`, full cycles, kill-resume |

---

## Wave 0 — Spike (gates the landing design)

### Task 1: Spike 1 — squash-tree equality experiment

**Files:**
- Create: `scripts/spikes/squash-tree-spike.sh`
- Create: `docs/superpowers/spikes/2026-07-17-squash-tree-equality.md`

**Interfaces:**
- Consumes: `gh` CLI (authenticated), scratch GitHub repo (created + deleted by the script).
- Produces: a recorded verdict consumed by Task 10 (`landBatch` keeps `gh pr merge --squash` if trees match; otherwise Task 10's fallback note applies — landing by direct push).

**Why this is first:** spec D9 — the entire batch-then-land design asserts `origin/<base>^{tree}` equals the tested candidate tree after sequential `gh pr merge --squash`. If GitHub's squash trees ever differ from local squash-apply, landing must switch to direct push. Test three cases: (A) two clean PRs landed sequentially, (B) a PR containing a merge commit from main, (C) PRs touching different files landed as a batch.

- [ ] **Step 1: Write the spike script**

```bash
#!/usr/bin/env bash
# Spike 1 (spec D9): does sequential `gh pr merge --squash` reproduce the tree
# of locally squash-applying the same PRs in the same order onto the same base?
# Creates a throwaway PRIVATE repo under the authenticated user, runs 3 cases,
# prints a verdict, deletes the repo. Requires: gh auth with repo scope
# (deletion needs delete_repo scope: gh auth refresh -h github.com -s delete_repo).
set -euo pipefail

command -v gh >/dev/null 2>&1 || { echo "gh CLI required" >&2; exit 2; }

SUFFIX="$(date -u +%s)"
REPO_NAME="mq-squash-spike-${SUFFIX}"
OWNER="$(gh api user -q .login)"
WORK="$(mktemp -d)"
cleanup() {
  gh repo delete "${OWNER}/${REPO_NAME}" --yes 2>/dev/null || \
    echo "NOTE: could not delete ${OWNER}/${REPO_NAME} — delete manually (needs delete_repo scope)" >&2
  rm -rf "${WORK}"
}
trap cleanup EXIT INT TERM

gh repo create "${REPO_NAME}" --private --clone=false >/dev/null
git init -q "${WORK}/repo"
cd "${WORK}/repo"
git config user.name mq-spike
git config user.email mq-spike@example.invalid
echo base > base.txt
git add base.txt && git commit -qm "base"
git branch -M main
git remote add origin "https://github.com/${OWNER}/${REPO_NAME}.git"
git push -qu origin main

make_pr() { # name, file, content -> prints PR number
  local name="$1" file="$2" content="$3"
  git checkout -qb "${name}" main
  echo "${content}" > "${file}"
  git add "${file}" && git commit -qm "${name}"
  git push -qu origin "${name}"
  gh pr create --head "${name}" --title "${name}" --body "spike" >/dev/null
  gh pr view "${name}" --json number -q .number
  git checkout -q main
}

PR_A="$(make_pr pr-a a.txt alpha)"
PR_B="$(make_pr pr-b b.txt beta)"
# Case B: pr-c contains a merge commit from main (main moved after branching)
git checkout -qb pr-c main
echo gamma > c.txt
git add c.txt && git commit -qm "pr-c work"
git checkout -q main
echo moved > moved.txt
git add moved.txt && git commit -qm "main moves"
git push -q origin main
git checkout -q pr-c
git merge -q --no-edit main
git push -qu origin pr-c
gh pr create --head pr-c --title pr-c --body "spike" >/dev/null
PR_C="$(gh pr view pr-c --json number -q .number)"
git checkout -q main && git pull -q origin main

# Local candidate: squash-apply A, B, C in order onto current origin/main
git fetch -q origin
git checkout -qb candidate origin/main
for ref in pr-a pr-b pr-c; do
  git merge -q --squash "origin/${ref}"
  git commit -qm "squash ${ref}"
done
LOCAL_TREE="$(git rev-parse 'candidate^{tree}')"

# Land the same PRs the daemon's way, in the same order
for pr in "${PR_A}" "${PR_B}" "${PR_C}"; do
  gh pr merge "${pr}" --squash --delete-branch
done
git fetch -q origin
REMOTE_TREE="$(git rev-parse 'origin/main^{tree}')"

echo "local candidate tree:  ${LOCAL_TREE}"
echo "post-land origin tree: ${REMOTE_TREE}"
if [ "${LOCAL_TREE}" = "${REMOTE_TREE}" ]; then
  echo "VERDICT: MATCH — D9 landing design confirmed"
else
  echo "VERDICT: MISMATCH — use D9 fallback (direct-push landing)"
  exit 1
fi
```

- [ ] **Step 2: Lint it**

Run: `shellcheck scripts/spikes/squash-tree-spike.sh`
Expected: no output (clean).

- [ ] **Step 3: Run the spike**

Run: `bash scripts/spikes/squash-tree-spike.sh`
Expected: `VERDICT: MATCH — D9 landing design confirmed` (exit 0). If it prints MISMATCH, STOP — record the result, and Task 10 Step 5's landing implementation must use the documented fallback (push the candidate ref to the default branch, then close PRs with a comment); flag this loudly in the task's commit message and the results doc.

- [ ] **Step 4: Record the results**

Write `docs/superpowers/spikes/2026-07-17-squash-tree-equality.md` containing: the verdict line, both tree hashes, gh version (`gh --version`), date, and the sentence "Consumed by Task 10 of `2026-07-17-merge-queue-engine.md`: landing uses `gh pr merge --squash` + post-land tree assertion." (or the fallback sentence if MISMATCH).

- [ ] **Step 5: Commit**

```bash
git add scripts/spikes/squash-tree-spike.sh docs/superpowers/spikes/2026-07-17-squash-tree-equality.md
git commit -m "spike: verify gh squash-merge tree equality (D9)"
```

---

## Wave 1 — Pure core

### Task 2: Types + journal

**Files:**
- Create: `src/merge-queue/types.ts`
- Create: `src/merge-queue/journal.ts`
- Test: `src/merge-queue/journal.test.ts`

**Interfaces:**
- Consumes: nothing (leaf).
- Produces (imported by every later task):
  - `PrState`, `BatchState`, `PrEntry`, `BatchRecord`, `JournalEvent`, `QueueState`, `MergeQueueConfig`, `defaultMergeQueueConfig()`
  - `appendEvent(mqDir: string, event: JournalEvent): void`
  - `readJournal(mqDir: string): JournalEvent[]`
  - `JOURNAL_FILE = 'journal.jsonl'`

- [ ] **Step 1: Write the failing test**

```typescript
// src/merge-queue/journal.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appendEvent, readJournal, JOURNAL_FILE } from './journal.js'
import type { JournalEvent } from './types.js'

function tmpMqDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-journal-'))
}

const e1: JournalEvent = { type: 'enqueued', pr: 12, at: '2026-07-17T00:00:00.000Z' }
const e2: JournalEvent = {
  type: 'pr_state', pr: 12, state: 'IN_BATCH', batchId: 'b1', at: '2026-07-17T00:01:00.000Z',
}

describe('journal', () => {
  it('appends and reads events round-trip in order', () => {
    const dir = tmpMqDir()
    appendEvent(dir, e1)
    appendEvent(dir, e2)
    expect(readJournal(dir)).toEqual([e1, e2])
  })

  it('creates the mq dir on first append', () => {
    const dir = path.join(tmpMqDir(), 'nested')
    appendEvent(dir, e1)
    expect(fs.existsSync(path.join(dir, JOURNAL_FILE))).toBe(true)
  })

  it('returns [] when no journal exists', () => {
    expect(readJournal(tmpMqDir())).toEqual([])
  })

  it('tolerates a torn final line (crash mid-write)', () => {
    const dir = tmpMqDir()
    appendEvent(dir, e1)
    fs.appendFileSync(path.join(dir, JOURNAL_FILE), '{"type":"pr_state","pr":13')
    expect(readJournal(dir)).toEqual([e1])
  })

  it('throws on a corrupt NON-final line (real corruption, not a crash)', () => {
    const dir = tmpMqDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, JOURNAL_FILE), 'garbage\n' + JSON.stringify(e1) + '\n')
    expect(() => readJournal(dir)).toThrow(/corrupt/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/merge-queue/journal.test.ts`
Expected: FAIL — `Cannot find module './journal.js'`

- [ ] **Step 3: Write types.ts**

```typescript
// src/merge-queue/types.ts
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
  }
}
```

- [ ] **Step 4: Write journal.ts**

```typescript
// src/merge-queue/journal.ts
import fs from 'node:fs'
import path from 'node:path'
import type { JournalEvent } from './types.js'

export const JOURNAL_FILE = 'journal.jsonl'

export function appendEvent(mqDir: string, event: JournalEvent): void {
  fs.mkdirSync(mqDir, { recursive: true })
  fs.appendFileSync(path.join(mqDir, JOURNAL_FILE), JSON.stringify(event) + '\n')
}

export function readJournal(mqDir: string): JournalEvent[] {
  const file = path.join(mqDir, JOURNAL_FILE)
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.length > 0)
  const events: JournalEvent[] = []
  for (let i = 0; i < lines.length; i++) {
    try {
      events.push(JSON.parse(lines[i]) as JournalEvent)
    } catch {
      // A torn FINAL line is an expected crash artifact (write-ahead append was
      // interrupted); anything earlier is real corruption and must fail loud.
      if (i === lines.length - 1) break
      throw new Error(`merge-queue journal corrupt at line ${i + 1}: ${file}`)
    }
  }
  return events
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/merge-queue/journal.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/merge-queue/types.ts src/merge-queue/journal.ts src/merge-queue/journal.test.ts
git commit -m "feat(mq): journal + core types for merge-queue engine"
```

### Task 3: State reducer

**Files:**
- Create: `src/merge-queue/state.ts`
- Test: `src/merge-queue/state.test.ts`

**Interfaces:**
- Consumes: `JournalEvent`, `QueueState`, `PrEntry` from `./types.js`.
- Produces (used by daemon, CLI status/stats, recovery):
  - `reduceState(events: JournalEvent[]): QueueState`
  - `queuedPrs(state: QueueState): PrEntry[]` — `REQUEUED_SPLIT` first (oldest first), then `QUEUED` (oldest first)
  - `TERMINAL_PR_STATES: ReadonlySet<PrState>` = `LANDED | EJECTED | NEEDS_REBASE | CANCELLED`

- [ ] **Step 1: Write the failing test**

```typescript
// src/merge-queue/state.test.ts
import { describe, expect, it } from 'vitest'
import { reduceState, queuedPrs, TERMINAL_PR_STATES } from './state.js'
import type { JournalEvent } from './types.js'

const at = (m: number) => `2026-07-17T00:${String(m).padStart(2, '0')}:00.000Z`

describe('reduceState', () => {
  it('creates a QUEUED entry on enqueued', () => {
    const s = reduceState([{ type: 'enqueued', pr: 1, at: at(0) }])
    expect(s.entries.get(1)).toEqual({ pr: 1, state: 'QUEUED', enqueuedAt: at(0), queueFailures: 0 })
  })

  it('ignores duplicate enqueue while non-terminal', () => {
    const s = reduceState([
      { type: 'enqueued', pr: 1, at: at(0) },
      { type: 'pr_state', pr: 1, state: 'IN_BATCH', batchId: 'b1', at: at(1) },
      { type: 'enqueued', pr: 1, at: at(2) },
    ])
    expect(s.entries.get(1)?.state).toBe('IN_BATCH')
    expect(s.entries.get(1)?.enqueuedAt).toBe(at(0))
  })

  it('re-enqueue after a terminal state resets state but keeps queueFailures', () => {
    const s = reduceState([
      { type: 'enqueued', pr: 1, at: at(0) },
      { type: 'pr_state', pr: 1, state: 'EJECTED', at: at(1), note: 'red' },
      { type: 'enqueued', pr: 1, at: at(2) },
    ])
    expect(s.entries.get(1)).toMatchObject({ state: 'QUEUED', enqueuedAt: at(2), queueFailures: 1 })
  })

  it('increments queueFailures only on EJECTED', () => {
    const s = reduceState([
      { type: 'enqueued', pr: 1, at: at(0) },
      { type: 'pr_state', pr: 1, state: 'REQUEUED_SPLIT', at: at(1) },
      { type: 'pr_state', pr: 1, state: 'EJECTED', at: at(2) },
    ])
    expect(s.entries.get(1)?.queueFailures).toBe(1)
  })

  it('tracks batches through their lifecycle', () => {
    const s = reduceState([
      { type: 'batch_created', batchId: 'b1', members: [1, 2], at: at(0) },
      { type: 'batch_state', batchId: 'b1', state: 'RUNNING', baseSha: 'abc', candidateTree: 'T', at: at(1) },
    ])
    expect(s.batches.get('b1')).toEqual({
      id: 'b1', state: 'RUNNING', members: [1, 2],
      candidateRef: 'refs/merge-queue/batch-b1', baseSha: 'abc', candidateTree: 'T',
    })
  })

  it('collects flake events', () => {
    const s = reduceState([{ type: 'flake', testId: 'src/a.test.ts', at: at(0) }])
    expect(s.flakes).toEqual([{ testId: 'src/a.test.ts', at: at(0) }])
  })

  it('ignores pr_state for unknown PRs (torn history) instead of crashing', () => {
    const s = reduceState([{ type: 'pr_state', pr: 9, state: 'TESTING', at: at(0) }])
    expect(s.entries.has(9)).toBe(false)
  })
})

describe('queuedPrs', () => {
  it('orders REQUEUED_SPLIT before QUEUED, each oldest-first', () => {
    const s = reduceState([
      { type: 'enqueued', pr: 1, at: at(0) },
      { type: 'enqueued', pr: 2, at: at(1) },
      { type: 'enqueued', pr: 3, at: at(2) },
      { type: 'pr_state', pr: 3, state: 'REQUEUED_SPLIT', at: at(3) },
    ])
    expect(queuedPrs(s).map(e => e.pr)).toEqual([3, 1, 2])
  })

  it('excludes terminal and in-flight states', () => {
    const s = reduceState([
      { type: 'enqueued', pr: 1, at: at(0) },
      { type: 'pr_state', pr: 1, state: 'LANDED', at: at(1) },
      { type: 'enqueued', pr: 2, at: at(2) },
      { type: 'pr_state', pr: 2, state: 'TESTING', at: at(3) },
    ])
    expect(queuedPrs(s)).toEqual([])
  })
})

describe('TERMINAL_PR_STATES', () => {
  it('contains exactly the four terminal states', () => {
    expect([...TERMINAL_PR_STATES].sort()).toEqual(['CANCELLED', 'EJECTED', 'LANDED', 'NEEDS_REBASE'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/merge-queue/state.test.ts`
Expected: FAIL — `Cannot find module './state.js'`

- [ ] **Step 3: Write state.ts**

```typescript
// src/merge-queue/state.ts
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
```

Note: `batch.parent` is optional on `BatchRecord` — the test's `toEqual` for `b1` has no `parent` key and `undefined` properties are treated as absent by vitest's `toEqual`. `gate_metrics` is journal-only data (consumed by `mq stats` in Task 13 directly from events, not from `QueueState`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/merge-queue/state.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/merge-queue/state.ts src/merge-queue/state.test.ts
git commit -m "feat(mq): journal state reducer + queue ordering"
```

### Task 4: Batch composition + bisection

**Files:**
- Create: `src/merge-queue/batch.ts`
- Test: `src/merge-queue/batch.test.ts`

**Interfaces:**
- Consumes: `PrEntry` from `./types.js`; `PrInfo` from `./gh.js` **type-only** — to keep this task a leaf, define the shape it needs structurally: `{ additions: number; deletions: number }`.
- Produces (used by daemon Task 10/11):
  - `riskScore(entry: PrEntry, info: { additions: number; deletions: number }): number`
  - `composeBatch(queued: PrEntry[], infos: Map<number, { additions: number; deletions: number }>, cap: number): number[]` — risk-ordered low→high (spec §5.2: low-risk-first so the first bisect split isolates likely culprits), capped
  - `splitBatch(members: number[]): [number[], number[]]`

- [ ] **Step 1: Write the failing test**

```typescript
// src/merge-queue/batch.test.ts
import { describe, expect, it } from 'vitest'
import { composeBatch, riskScore, splitBatch } from './batch.js'
import type { PrEntry } from './types.js'

const entry = (pr: number, queueFailures = 0): PrEntry => ({
  pr, state: 'QUEUED', enqueuedAt: '2026-07-17T00:00:00.000Z', queueFailures,
})

describe('riskScore', () => {
  it('is diff size plus a heavy penalty per prior queue failure', () => {
    expect(riskScore(entry(1), { additions: 10, deletions: 5 })).toBe(15)
    expect(riskScore(entry(1, 2), { additions: 10, deletions: 5 })).toBe(2015)
  })
})

describe('composeBatch', () => {
  it('orders low-risk first and respects the cap', () => {
    const infos = new Map([
      [1, { additions: 500, deletions: 0 }],
      [2, { additions: 5, deletions: 0 }],
      [3, { additions: 50, deletions: 0 }],
    ])
    expect(composeBatch([entry(1), entry(2), entry(3)], infos, 2)).toEqual([2, 3])
  })

  it('treats missing info as high risk (sorts last) rather than crashing', () => {
    const infos = new Map([[2, { additions: 5, deletions: 0 }]])
    expect(composeBatch([entry(1), entry(2)], infos, 5)).toEqual([2, 1])
  })
})

describe('splitBatch', () => {
  it('splits into two non-empty halves', () => {
    expect(splitBatch([1, 2, 3, 4])).toEqual([[1, 2], [3, 4]])
    expect(splitBatch([1, 2, 3])).toEqual([[1], [2, 3]])
    expect(splitBatch([1, 2])).toEqual([[1], [2]])
  })

  it('throws on fewer than 2 members (callers eject singletons instead)', () => {
    expect(() => splitBatch([1])).toThrow(/singleton/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/merge-queue/batch.test.ts`
Expected: FAIL — `Cannot find module './batch.js'`

- [ ] **Step 3: Write batch.ts**

```typescript
// src/merge-queue/batch.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/merge-queue/batch.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/merge-queue/batch.ts src/merge-queue/batch.test.ts
git commit -m "feat(mq): risk-ordered batch composition + bisection split"
```

---

## Wave 2 — Adapters

### Task 5: `merge_queue:` config section

**Files:**
- Modify: `src/core/agent-ops/config.ts` (add `merge_queue` to `AgentOpsConfig`, parse + validate)
- Test: `src/core/agent-ops/config.test.ts` (append a new describe block — do not modify existing tests)

**Interfaces:**
- Consumes: `MergeQueueConfig`, `defaultMergeQueueConfig` from `../../merge-queue/types.js`.
- Produces: `AgentOpsConfig.merge_queue: MergeQueueConfig` — ALWAYS present after `loadAgentOpsConfig` (defaults applied when the YAML section is absent). Daemon (Task 10) and CLI (Task 13) read it from here.

- [ ] **Step 1: Write the failing test (append to config.test.ts)**

```typescript
describe('merge_queue config', () => {
  it('applies defaults when the section is absent', () => {
    const cfg = loadAgentOpsConfig(tmpProject())
    expect(cfg.merge_queue).toEqual({
      gate_command: 'make check-affected',
      full_gate_command: 'make check',
      batch_cap: 16,
      poll_seconds: 60,
      gate_timeout_minutes: 45,
      quarantine_path: '.mq/quarantine.txt',
      ready_label: 'mq:ready',
    })
  })

  it('accepts overrides and keeps defaults for omitted keys', () => {
    const cfg = loadAgentOpsConfig(tmpProject(`
project_name: myapp
merge_queue:
  batch_cap: 4
  gate_command: "make quick"
`))
    expect(cfg.merge_queue.batch_cap).toBe(4)
    expect(cfg.merge_queue.gate_command).toBe('make quick')
    expect(cfg.merge_queue.poll_seconds).toBe(60)
  })

  it('fails loud on a non-integer batch_cap', () => {
    const bad = tmpProject(`
project_name: myapp
merge_queue:
  batch_cap: lots
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/batch_cap/)
  })

  it('fails loud on a non-positive poll_seconds', () => {
    const bad = tmpProject(`
project_name: myapp
merge_queue:
  poll_seconds: 0
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/poll_seconds/)
  })

  it('fails loud on an empty gate_command', () => {
    const bad = tmpProject(`
project_name: myapp
merge_queue:
  gate_command: ""
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/gate_command/)
  })
})
```

Note: `tmpProject` already exists at the top of `config.test.ts` (see repo). Reuse it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/agent-ops/config.test.ts`
Expected: FAIL — `cfg.merge_queue` is `undefined`.

- [ ] **Step 3: Implement in config.ts**

Add the import at the top, the field on the interface, and the parse block at the END of `loadAgentOpsConfig` (before `return cfg`), plus default population in `defaultAgentOpsConfig`:

```typescript
import { defaultMergeQueueConfig, type MergeQueueConfig } from '../../merge-queue/types.js'

// on AgentOpsConfig:
export interface AgentOpsConfig {
  project_name: string
  critical_labels: string[]
  worktree_setup_commands: string[]
  docker?: AgentOpsDocker
  merge_queue: MergeQueueConfig
}

// in defaultAgentOpsConfig(), add to the returned object:
    merge_queue: defaultMergeQueueConfig(),

// in loadAgentOpsConfig(), before `return cfg`:
  if (raw.merge_queue !== undefined) {
    if (raw.merge_queue === null || typeof raw.merge_queue !== 'object' || Array.isArray(raw.merge_queue)) {
      fail('merge_queue must be a mapping')
    }
    const mq = raw.merge_queue as Record<string, unknown>
    const strKeys = ['gate_command', 'full_gate_command', 'quarantine_path', 'ready_label'] as const
    for (const key of strKeys) {
      const v = mq[key]
      if (v === undefined) continue
      if (typeof v !== 'string' || v.trim() === '') fail(`merge_queue.${key} must be a non-empty string`)
      cfg.merge_queue[key] = v
    }
    const intKeys = ['batch_cap', 'poll_seconds', 'gate_timeout_minutes'] as const
    for (const key of intKeys) {
      const v = mq[key]
      if (v === undefined) continue
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
        fail(`merge_queue.${key} must be a positive integer, got ${JSON.stringify(v)}`)
      }
      cfg.merge_queue[key] = v
    }
  }
```

- [ ] **Step 4: Run the full config + agent-ops suites**

Run: `npx vitest run src/core/agent-ops/`
Expected: PASS (all existing tests still green — the new field has defaults, so no existing assertion changes; if an existing test asserts the exact shape of the whole config object with `toEqual`, extend that assertion with `merge_queue: defaultMergeQueueConfig()` rather than weakening it).

- [ ] **Step 5: Commit**

```bash
git add src/core/agent-ops/config.ts src/core/agent-ops/config.test.ts
git commit -m "feat(mq): merge_queue config section with loud validation"
```

### Task 6: gh adapter

**Files:**
- Create: `src/merge-queue/gh.ts`
- Test: `src/merge-queue/gh.test.ts`

**Interfaces:**
- Consumes: nothing internal (leaf adapter).
- Produces (daemon and CLI depend on these exact signatures):

```typescript
export interface PrInfo {
  number: number
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  headSha: string
  mergedAt: string | null
  additions: number
  deletions: number
  title: string
  body: string
}
export interface GhClient {
  viewPr(pr: number): PrInfo
  squashMerge(pr: number): void
  comment(pr: number, body: string): void
  listLabeled(label: string): number[]
  /** True when the latest post-merge workflow run on the default branch failed. False when unknown/absent. */
  postMergeRed(defaultBranch: string): boolean
}
export function createGhClient(cwd: string): GhClient
```

- The real client shells out via `execFileSync`. `MQ_GH_CMD` env var overrides the binary (used by the Task 14 harness stub); default `gh`. If the binary is missing at construction, `createGhClient` throws `merge-queue requires the gh CLI (not found)`.

- [ ] **Step 1: Write the failing test**

The test exercises the real client against a stub `gh` script — this proves argument construction and JSON parsing without network.

```typescript
// src/merge-queue/gh.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createGhClient } from './gh.js'

let stubDir: string

function writeStub(script: string): string {
  stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-gh-'))
  const stub = path.join(stubDir, 'gh-stub.sh')
  fs.writeFileSync(stub, `#!/usr/bin/env bash\nset -eu\n${script}`)
  fs.chmodSync(stub, 0o755)
  return stub
}

afterEach(() => {
  delete process.env.MQ_GH_CMD
})

describe('createGhClient', () => {
  it('parses viewPr JSON', () => {
    process.env.MQ_GH_CMD = writeStub(`
echo '{"number":7,"state":"OPEN","headRefOid":"abc123","mergedAt":null,"additions":3,"deletions":1,"title":"t","body":"Closes prj-x"}'
`)
    const pr = createGhClient(stubDir).viewPr(7)
    expect(pr).toEqual({
      number: 7, state: 'OPEN', headSha: 'abc123', mergedAt: null,
      additions: 3, deletions: 1, title: 't', body: 'Closes prj-x',
    })
  })

  it('records the args gh was invoked with for squashMerge', () => {
    process.env.MQ_GH_CMD = writeStub(`echo "$@" >> "${os.tmpdir()}/mq-gh-args.txt"`)
    fs.rmSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), { force: true })
    createGhClient(stubDir).squashMerge(12)
    const args = fs.readFileSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), 'utf8')
    expect(args).toContain('pr merge 12 --squash --delete-branch')
  })

  it('parses listLabeled numbers', () => {
    process.env.MQ_GH_CMD = writeStub(`echo '[{"number":4},{"number":9}]'`)
    expect(createGhClient(stubDir).listLabeled('mq:ready')).toEqual([4, 9])
  })

  it('postMergeRed returns false when the gh call fails (workflow absent)', () => {
    process.env.MQ_GH_CMD = writeStub('exit 1')
    expect(createGhClient(stubDir).postMergeRed('main')).toBe(false)
  })

  it('postMergeRed returns true on a failed latest run', () => {
    process.env.MQ_GH_CMD = writeStub(`echo '[{"conclusion":"failure"}]'`)
    expect(createGhClient(stubDir).postMergeRed('main')).toBe(true)
  })

  it('throws a clear error when the gh binary is missing', () => {
    process.env.MQ_GH_CMD = '/nonexistent/gh-binary'
    expect(() => createGhClient(stubDir)).toThrow(/gh CLI/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/merge-queue/gh.test.ts`
Expected: FAIL — `Cannot find module './gh.js'`

- [ ] **Step 3: Write gh.ts**

```typescript
// src/merge-queue/gh.ts
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

export interface PrInfo {
  number: number
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  headSha: string
  mergedAt: string | null
  additions: number
  deletions: number
  title: string
  body: string
}

export interface GhClient {
  viewPr(pr: number): PrInfo
  squashMerge(pr: number): void
  comment(pr: number, body: string): void
  listLabeled(label: string): number[]
  postMergeRed(defaultBranch: string): boolean
}

function resolveGhBin(): string {
  const bin = process.env.MQ_GH_CMD ?? 'gh'
  if (bin !== 'gh' && !fs.existsSync(bin)) {
    throw new Error(`merge-queue requires the gh CLI (not found: ${bin})`)
  }
  if (bin === 'gh') {
    try {
      execFileSync('gh', ['--version'], { stdio: 'ignore' })
    } catch {
      throw new Error('merge-queue requires the gh CLI (not found on PATH)')
    }
  }
  return bin
}

export function createGhClient(cwd: string): GhClient {
  const bin = resolveGhBin()
  const gh = (args: string[]): string =>
    execFileSync(bin, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })

  return {
    viewPr(pr) {
      const raw = JSON.parse(gh([
        'pr', 'view', String(pr), '--json',
        'number,state,headRefOid,mergedAt,additions,deletions,title,body',
      ])) as Record<string, unknown>
      return {
        number: raw.number as number,
        state: raw.state as PrInfo['state'],
        headSha: raw.headRefOid as string,
        mergedAt: (raw.mergedAt as string | null) ?? null,
        additions: (raw.additions as number) ?? 0,
        deletions: (raw.deletions as number) ?? 0,
        title: (raw.title as string) ?? '',
        body: (raw.body as string) ?? '',
      }
    },
    squashMerge(pr) {
      gh(['pr', 'merge', String(pr), '--squash', '--delete-branch'])
    },
    comment(pr, body) {
      gh(['pr', 'comment', String(pr), '--body', body])
    },
    listLabeled(label) {
      const raw = JSON.parse(gh([
        'pr', 'list', '--label', label, '--state', 'open', '--json', 'number',
      ])) as { number: number }[]
      return raw.map(r => r.number)
    },
    postMergeRed(defaultBranch) {
      try {
        const raw = JSON.parse(gh([
          'run', 'list', '--workflow', 'post-merge.yml', '--branch', defaultBranch,
          '--limit', '1', '--json', 'conclusion',
        ])) as { conclusion: string | null }[]
        return raw.length > 0 && raw[0].conclusion === 'failure'
      } catch {
        return false
      }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/merge-queue/gh.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/merge-queue/gh.ts src/merge-queue/gh.test.ts
git commit -m "feat(mq): gh CLI adapter with stub-override for tests"
```

### Task 7: Git operations (candidate construction, tree hashes, gate worktree)

**Files:**
- Create: `src/merge-queue/git.ts`
- Test: `src/merge-queue/git.test.ts`

**Interfaces:**
- Consumes: nothing internal (leaf adapter).
- Produces (daemon depends on these exact signatures):

```typescript
export interface CandidateResult { ref: string; applied: number[]; rejected: number[] }
export interface GitOps {
  primaryRoot(): string
  defaultBranch(): string
  fetchOrigin(): void
  originHeadSha(branch: string): string
  treeOf(ref: string): string
  ensureGateWorktree(): string
  constructCandidate(batchId: string, prs: { pr: number; headSha: string }[], base: string): CandidateResult
  deleteCandidate(batchId: string): void
  listCandidateRefs(): string[]
}
export function createGitOps(repoRoot: string): GitOps
```

- Mechanics: PR heads are fetched as `git fetch origin pull/<n>/head:refs/mq/pr-<n>` by the daemon *caller*? No — `constructCandidate` does its own fetching from the provided `headSha` (the SHA is already known from `gh pr view`; `git fetch origin <headSha>` works on GitHub). Candidate is built in the gate worktree: `git checkout -B mq-candidate <base>`, then per PR `git merge --squash <headSha>` + `git commit`; a PR whose squash-merge conflicts is `git merge --abort`-ed (via `git reset --hard` + `git checkout .`) and reported in `rejected`. On success the candidate is pinned as `refs/merge-queue/batch-<batchId>`.
- The gate worktree lives at `<primaryRoot>/.mq/gate` on branch `mq-candidate` (created with `git worktree add` if missing, force-reset otherwise).

- [ ] **Step 1: Write the failing test**

Tests run against a scratch repo pair (origin bare + clone) built by a helper — no network.

```typescript
// src/merge-queue/git.test.ts
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createGitOps } from './git.js'

function sh(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim()
}
function git(cwd: string, ...args: string[]): string { return sh(cwd, 'git', args) }

/** origin (bare) + working clone with an initial commit on main; returns { origin, clone } */
function scratchRepos(): { origin: string; clone: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-git-'))
  const origin = path.join(dir, 'origin.git')
  const clone = path.join(dir, 'clone')
  execFileSync('git', ['init', '--bare', '-b', 'main', origin])
  execFileSync('git', ['clone', origin, clone], { stdio: 'ignore' })
  git(clone, 'config', 'user.name', 'mq-test')
  git(clone, 'config', 'user.email', 'mq@test.invalid')
  fs.writeFileSync(path.join(clone, 'base.txt'), 'base\n')
  git(clone, 'add', 'base.txt')
  git(clone, 'commit', '-m', 'base')
  git(clone, 'push', '-u', 'origin', 'main')
  git(clone, 'remote', 'set-head', 'origin', 'main')
  return { origin, clone }
}

/** Create a branch with one commit touching `file`, push it, return its head SHA. */
function pushBranch(clone: string, name: string, file: string): string {
  git(clone, 'checkout', '-b', name, 'origin/main')
  fs.writeFileSync(path.join(clone, file), `${name}\n`)
  git(clone, 'add', file)
  git(clone, 'commit', '-m', name)
  git(clone, 'push', '-u', 'origin', name)
  const sha = git(clone, 'rev-parse', 'HEAD')
  git(clone, 'checkout', 'main')
  return sha
}

describe('createGitOps', () => {
  it('resolves the default branch from origin/HEAD', () => {
    const { clone } = scratchRepos()
    expect(createGitOps(clone).defaultBranch()).toBe('main')
  })

  it('primaryRoot resolves to the main checkout even from a linked worktree', () => {
    const { clone } = scratchRepos()
    const wt = path.join(path.dirname(clone), 'wt')
    git(clone, 'worktree', 'add', wt, '-b', 'agent/x', 'origin/main')
    expect(fs.realpathSync(createGitOps(wt).primaryRoot())).toBe(fs.realpathSync(clone))
  })

  it('constructs a candidate from two clean PRs and pins the batch ref', () => {
    const { clone } = scratchRepos()
    const shaA = pushBranch(clone, 'pr-a', 'a.txt')
    const shaB = pushBranch(clone, 'pr-b', 'b.txt')
    const ops = createGitOps(clone)
    ops.fetchOrigin()
    const res = ops.constructCandidate('b1', [
      { pr: 1, headSha: shaA }, { pr: 2, headSha: shaB },
    ], 'main')
    expect(res.applied).toEqual([1, 2])
    expect(res.rejected).toEqual([])
    expect(res.ref).toBe('refs/merge-queue/batch-b1')
    const tree = ops.treeOf(res.ref)
    expect(tree).toMatch(/^[0-9a-f]{40}$/)
    // candidate contains both files
    const files = git(clone, 'ls-tree', '--name-only', res.ref)
    expect(files).toContain('a.txt')
    expect(files).toContain('b.txt')
  })

  it('rejects a conflicting PR without killing the batch', () => {
    const { clone } = scratchRepos()
    const shaA = pushBranch(clone, 'pr-edit1', 'shared.txt')
    const shaB = pushBranch(clone, 'pr-edit2', 'shared.txt')
    const ops = createGitOps(clone)
    ops.fetchOrigin()
    const res = ops.constructCandidate('b2', [
      { pr: 1, headSha: shaA }, { pr: 2, headSha: shaB },
    ], 'main')
    expect(res.applied).toEqual([1])
    expect(res.rejected).toEqual([2])
    const files = git(clone, 'ls-tree', '--name-only', res.ref)
    expect(files).toContain('shared.txt')
  })

  it('deleteCandidate removes the ref; listCandidateRefs enumerates them', () => {
    const { clone } = scratchRepos()
    const shaA = pushBranch(clone, 'pr-del', 'd.txt')
    const ops = createGitOps(clone)
    ops.fetchOrigin()
    ops.constructCandidate('b3', [{ pr: 1, headSha: shaA }], 'main')
    expect(ops.listCandidateRefs()).toEqual(['refs/merge-queue/batch-b3'])
    ops.deleteCandidate('b3')
    expect(ops.listCandidateRefs()).toEqual([])
  })

  it('originHeadSha reflects remote movement after fetch', () => {
    const { clone } = scratchRepos()
    const ops = createGitOps(clone)
    const before = ops.originHeadSha('main')
    pushBranch(clone, 'pr-m', 'm.txt')
    git(clone, 'checkout', 'main')
    git(clone, 'merge', '--ff-only', 'origin/pr-m')
    // simulate an external merge landing on origin/main
    git(clone, 'push', 'origin', 'main')
    ops.fetchOrigin()
    expect(ops.originHeadSha('main')).not.toBe(before)
  })
})
```

Note the last test: `pushBranch` leaves the clone on `main`; merging `origin/pr-m` ff-only then pushing simulates a peer advancing origin. If `--ff-only` fails because local main lacks the branch point, use `git merge origin/pr-m` (a normal merge) — the assertion only needs origin/main's SHA to change.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/merge-queue/git.test.ts`
Expected: FAIL — `Cannot find module './git.js'`

- [ ] **Step 3: Write git.ts**

```typescript
// src/merge-queue/git.ts
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface CandidateResult { ref: string; applied: number[]; rejected: number[] }

export interface GitOps {
  primaryRoot(): string
  defaultBranch(): string
  fetchOrigin(): void
  originHeadSha(branch: string): string
  treeOf(ref: string): string
  ensureGateWorktree(): string
  constructCandidate(
    batchId: string,
    prs: { pr: number; headSha: string }[],
    base: string,
  ): CandidateResult
  deleteCandidate(batchId: string): void
  listCandidateRefs(): string[]
}

const CANDIDATE_PREFIX = 'refs/merge-queue/batch-'

export function createGitOps(repoRoot: string): GitOps {
  const git = (args: string[], cwd = repoRoot): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const gitAllowFail = (args: string[], cwd = repoRoot): boolean => {
    try {
      execFileSync('git', args, { cwd, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  function primaryRoot(): string {
    // .git common dir of the primary checkout; its parent is the primary root.
    const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'])
    return path.dirname(common)
  }

  function ensureGateWorktree(): string {
    const root = primaryRoot()
    const gate = path.join(root, '.mq', 'gate')
    if (!fs.existsSync(path.join(gate, '.git'))) {
      fs.mkdirSync(path.join(root, '.mq'), { recursive: true })
      git(['worktree', 'add', '--detach', gate], root)
    }
    return gate
  }

  return {
    primaryRoot,
    defaultBranch() {
      // e.g. "origin/main" -> "main"; never hardcode.
      const ref = git(['rev-parse', '--abbrev-ref', 'origin/HEAD'])
      return ref.replace(/^origin\//, '')
    },
    fetchOrigin() {
      git(['fetch', 'origin', '--prune'])
    },
    originHeadSha(branch) {
      return git(['rev-parse', `origin/${branch}`])
    },
    treeOf(ref) {
      return git(['rev-parse', `${ref}^{tree}`])
    },
    ensureGateWorktree,
    constructCandidate(batchId, prs, base) {
      const gate = ensureGateWorktree()
      const ref = `${CANDIDATE_PREFIX}${batchId}`
      // Make sure every PR head object is present locally.
      for (const { headSha } of prs) gitAllowFail(['fetch', 'origin', headSha])
      git(['checkout', '--detach', `origin/${base}`], gate)
      git(['reset', '--hard', `origin/${base}`], gate)
      const applied: number[] = []
      const rejected: number[] = []
      for (const { pr, headSha } of prs) {
        if (gitAllowFail(['merge', '--squash', headSha], gate)) {
          git(['commit', '--no-verify', '-m', `mq: squash PR #${pr}`], gate)
          applied.push(pr)
        } else {
          // Conflict: clear the failed squash and continue with the rest.
          git(['reset', '--hard', 'HEAD'], gate)
          rejected.push(pr)
        }
      }
      git(['update-ref', ref, 'HEAD'], gate)
      return { ref, applied, rejected }
    },
    deleteCandidate(batchId) {
      gitAllowFail(['update-ref', '-d', `${CANDIDATE_PREFIX}${batchId}`])
    },
    listCandidateRefs() {
      const out = git(['for-each-ref', '--format=%(refname)', 'refs/merge-queue/'])
      return out === '' ? [] : out.split('\n')
    },
  }
}
```

Implementation notes the engineer must keep: commits in the gate worktree need an identity — the daemon's gate worktree inherits the repo/user git config; if CI-less machines lack one, `git commit` fails loudly, which is acceptable (setup docs cover `git config`). `--no-verify` on the candidate commit is deliberate: pre-commit hooks already ran on the PR branches; the candidate commit is a scratch artifact whose correctness is established by the gate run itself.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/merge-queue/git.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/merge-queue/git.ts src/merge-queue/git.test.ts
git commit -m "feat(mq): git ops — candidate construction, tree hashes, gate worktree"
```

### Task 8: Gate runner

**Files:**
- Create: `src/merge-queue/gate.ts`
- Test: `src/merge-queue/gate.test.ts`

**Interfaces:**
- Consumes: nothing internal (leaf adapter).
- Produces (daemon depends on these exact signatures):

```typescript
export interface GateResult {
  result: 'green' | 'red' | 'timeout'
  seconds: number
  logPath: string
  /** Test ids from <cwd>/.mq-failed-tests.txt when the gate wrote it (contract); [] otherwise. */
  failedTests: string[]
}
export function runGate(opts: {
  cwd: string
  command: string
  timeoutMs: number
  logPath: string
  env?: Record<string, string>
}): GateResult
```

- **Failed-tests contract** (consumed by Plan 3's stack templates): a gate command MAY write one test id per line to `.mq-failed-tests.txt` in its cwd; the runner reads and deletes it. Retry runs receive `MQ_RETRY_TESTS=<comma-joined ids>` in env (templates that support it rerun only those; templates that ignore it rerun the whole gate — both are correct).
- The command runs via `bash -lc` in its own process group; on timeout the whole group gets SIGKILL.

- [ ] **Step 1: Write the failing test**

```typescript
// src/merge-queue/gate.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runGate } from './gate.js'

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-gate-')) }
function logIn(dir: string): string { return path.join(dir, 'gate.log') }

describe('runGate', () => {
  it('green on exit 0, captures the log', () => {
    const dir = tmp()
    const res = runGate({ cwd: dir, command: 'echo hello', timeoutMs: 10_000, logPath: logIn(dir) })
    expect(res.result).toBe('green')
    expect(fs.readFileSync(res.logPath, 'utf8')).toContain('hello')
    expect(res.failedTests).toEqual([])
  })

  it('red on non-zero exit, reads and clears the failed-tests contract file', () => {
    const dir = tmp()
    const res = runGate({
      cwd: dir,
      command: 'printf "src/a.test.ts\\nsrc/b.test.ts\\n" > .mq-failed-tests.txt; exit 1',
      timeoutMs: 10_000,
      logPath: logIn(dir),
    })
    expect(res.result).toBe('red')
    expect(res.failedTests).toEqual(['src/a.test.ts', 'src/b.test.ts'])
    expect(fs.existsSync(path.join(dir, '.mq-failed-tests.txt'))).toBe(false)
  })

  it('timeout kills the command', () => {
    const dir = tmp()
    const started = Date.now()
    const res = runGate({ cwd: dir, command: 'sleep 30', timeoutMs: 1_000, logPath: logIn(dir) })
    expect(res.result).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('passes env through (retry contract)', () => {
    const dir = tmp()
    const res = runGate({
      cwd: dir,
      command: 'test "$MQ_RETRY_TESTS" = "src/a.test.ts"',
      timeoutMs: 10_000,
      logPath: logIn(dir),
      env: { MQ_RETRY_TESTS: 'src/a.test.ts' },
    })
    expect(res.result).toBe('green')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/merge-queue/gate.test.ts`
Expected: FAIL — `Cannot find module './gate.js'`

- [ ] **Step 3: Write gate.ts**

```typescript
// src/merge-queue/gate.ts
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface GateResult {
  result: 'green' | 'red' | 'timeout'
  seconds: number
  logPath: string
  failedTests: string[]
}

const FAILED_TESTS_FILE = '.mq-failed-tests.txt'

export function runGate(opts: {
  cwd: string
  command: string
  timeoutMs: number
  logPath: string
  env?: Record<string, string>
}): GateResult {
  fs.mkdirSync(path.dirname(opts.logPath), { recursive: true })
  const started = Date.now()
  const proc = spawnSync('bash', ['-lc', opts.command], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    timeout: opts.timeoutMs,
    killSignal: 'SIGKILL',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const seconds = Math.round((Date.now() - started) / 1000)
  fs.writeFileSync(opts.logPath, (proc.stdout ?? '') + (proc.stderr ?? ''))

  const timedOut = proc.error !== undefined &&
    (proc.error as NodeJS.ErrnoException).code === 'ETIMEDOUT'

  const failedFile = path.join(opts.cwd, FAILED_TESTS_FILE)
  let failedTests: string[] = []
  if (fs.existsSync(failedFile)) {
    failedTests = fs.readFileSync(failedFile, 'utf8').split('\n').map(l => l.trim()).filter(l => l !== '')
    fs.rmSync(failedFile, { force: true })
  }

  return {
    result: timedOut ? 'timeout' : proc.status === 0 ? 'green' : 'red',
    seconds,
    logPath: opts.logPath,
    failedTests,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/merge-queue/gate.test.ts`
Expected: PASS (4 tests; the timeout test takes ~1s)

- [ ] **Step 5: Commit**

```bash
git add src/merge-queue/gate.ts src/merge-queue/gate.test.ts
git commit -m "feat(mq): gate runner with timeout + failed-tests contract"
```

### Task 9: Flake tracking + quarantine

**Files:**
- Create: `src/merge-queue/flakes.ts`
- Test: `src/merge-queue/flakes.test.ts`

**Interfaces:**
- Consumes: `QueueState` from `./types.js`, `appendEvent` from `./journal.js`.
- Produces (daemon Task 11 depends on):
  - `recordFlake(mqDir: string, testId: string, at: string): void` — journal `flake` event
  - `recentFlakeCount(state: QueueState, testId: string, now: Date): number` — events in the trailing 7 days
  - `addToQuarantine(projectRoot: string, quarantinePath: string, testId: string): boolean` — dedup append; true when newly added
  - `fileQuarantineBead(projectRoot: string, testId: string): void` — `bd create` advisory; silent no-op when `bd` missing (spec: feature-detect, never hard-fail)
  - `QUARANTINE_THRESHOLD = 3` (spec D8: 3 flake events in 7 days)

- [ ] **Step 1: Write the failing test**

```typescript
// src/merge-queue/flakes.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  QUARANTINE_THRESHOLD, addToQuarantine, fileQuarantineBead, recentFlakeCount, recordFlake,
} from './flakes.js'
import { readJournal } from './journal.js'
import { reduceState } from './state.js'

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-flakes-')) }

describe('flakes', () => {
  it('recordFlake appends a journal flake event', () => {
    const dir = tmp()
    recordFlake(dir, 'src/a.test.ts', '2026-07-17T00:00:00.000Z')
    expect(readJournal(dir)).toEqual([
      { type: 'flake', testId: 'src/a.test.ts', at: '2026-07-17T00:00:00.000Z' },
    ])
  })

  it('recentFlakeCount counts only the 7-day window for that test', () => {
    const dir = tmp()
    recordFlake(dir, 't1', '2026-07-01T00:00:00.000Z') // stale
    recordFlake(dir, 't1', '2026-07-15T00:00:00.000Z')
    recordFlake(dir, 't1', '2026-07-16T00:00:00.000Z')
    recordFlake(dir, 't2', '2026-07-16T00:00:00.000Z') // other test
    const state = reduceState(readJournal(dir))
    expect(recentFlakeCount(state, 't1', new Date('2026-07-17T00:00:00.000Z'))).toBe(2)
  })

  it('QUARANTINE_THRESHOLD is 3 (spec D8)', () => {
    expect(QUARANTINE_THRESHOLD).toBe(3)
  })

  it('addToQuarantine appends once and dedups', () => {
    const root = tmp()
    expect(addToQuarantine(root, '.mq/quarantine.txt', 'src/a.test.ts')).toBe(true)
    expect(addToQuarantine(root, '.mq/quarantine.txt', 'src/a.test.ts')).toBe(false)
    const body = fs.readFileSync(path.join(root, '.mq/quarantine.txt'), 'utf8')
    expect(body).toBe('src/a.test.ts\n')
  })

  it('fileQuarantineBead is a silent no-op when bd is missing', () => {
    const root = tmp()
    const oldPath = process.env.PATH
    process.env.PATH = root // nothing on PATH
    try {
      expect(() => fileQuarantineBead(root, 'src/a.test.ts')).not.toThrow()
    } finally {
      process.env.PATH = oldPath
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/merge-queue/flakes.test.ts`
Expected: FAIL — `Cannot find module './flakes.js'`

- [ ] **Step 3: Write flakes.ts**

```typescript
// src/merge-queue/flakes.ts
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { appendEvent } from './journal.js'
import type { QueueState } from './types.js'

export const QUARANTINE_THRESHOLD = 3
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function recordFlake(mqDir: string, testId: string, at: string): void {
  appendEvent(mqDir, { type: 'flake', testId, at })
}

export function recentFlakeCount(state: QueueState, testId: string, now: Date): number {
  const cutoff = now.getTime() - WINDOW_MS
  return state.flakes.filter(f => f.testId === testId && Date.parse(f.at) >= cutoff).length
}

export function addToQuarantine(
  projectRoot: string,
  quarantinePath: string,
  testId: string,
): boolean {
  const file = path.join(projectRoot, quarantinePath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const existing = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(l => l !== '')
    : []
  if (existing.includes(testId)) return false
  fs.appendFileSync(file, testId + '\n')
  return true
}

export function fileQuarantineBead(projectRoot: string, testId: string): void {
  try {
    execFileSync('bd', [
      'create',
      `Quarantined flaky test: ${testId}`,
      '-d',
      `Auto-filed by scaffold mq: ${QUARANTINE_THRESHOLD}+ flake events in 7 days. ` +
      'The test is excluded from the merge gate (see .mq/quarantine.txt) and still runs ' +
      'post-merge. Fix the flake, then remove it from the quarantine list.',
    ], { cwd: projectRoot, stdio: 'ignore' })
  } catch {
    // bd absent or errored — advisory only, never fatal (spec: feature-detect).
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/merge-queue/flakes.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/merge-queue/flakes.ts src/merge-queue/flakes.test.ts
git commit -m "feat(mq): flake tracking, quarantine list, advisory bead filing"
```

---

## Wave 3 — Daemon + CLI

### Task 10: Daemon orchestrator (cycle, bisection, landing, recovery)

> **AMENDMENT (post-Task-8, binding):** Task 8's review surfaced that a sync
> `spawnSync` gate cannot kill the process GROUP on timeout, so `runGate` is now
> **async**: `runGate(opts): Promise<GateResult>`. Apply these exact mechanical
> changes to this task's code blocks while implementing:
> 1. `DaemonDeps.runGate` type becomes
>    `(opts: { cwd: string; command: string; timeoutMs: number; logPath: string; env?: Record<string, string> }) => GateResult | Promise<GateResult>`
>    (union keeps the test fakes synchronous).
> 2. `cycle()` becomes `async cycle(): Promise<'idle' | 'worked'>`; `runBatch`
>    becomes `private async runBatch(...): Promise<BatchOutcome>`; `gateRun`
>    becomes `private async gateRun(...): Promise<GateResult>` (its body returns
>    `this.deps.runGate({...})` — async auto-wraps).
> 3. Await every call: `await this.cycle()` in `run()`,
>    `await this.runBatch(...)` in the bisection loop, `let gate = await
>    this.gateRun(...)` and `const retry = await this.gateRun(...)` in
>    `runBatch`.
> 4. In `daemon.test.ts`, every `it` that calls `cycle()` becomes `async`, and
>    every `h.daemon.cycle()` becomes `await h.daemon.cycle()` (assertions
>    unchanged, e.g. `expect(await h.daemon.cycle()).toBe('worked')`).
>    `reconcile()` stays synchronous.

> **AMENDMENT 2 (post-Task-10 review, binding):** three safety defects in this
> task's original code were found by review and fixed in-tree:
> 1. `cycle()`'s bisection `while` loop re-checks `this.paused()` at the top of
>    every iteration and breaks when paused — an NRS pause mid-stack must stop
>    the remaining halves from landing onto a flagged base.
> 2. `land()` wraps each per-PR merge in try/catch: a `viewPr`/`squashMerge`
>    throw mid-batch requeues the failed member + the unmerged tail
>    (REQUEUED_SPLIT), pauses with a "partial landing in batch …" reason, marks
>    the batch DONE with note `'partial land — paused'`, and returns without
>    running the NRS check (base is unverified; the pause says so).
> 3. `run()`'s catch calls `this.reconcile()` (itself try/caught) after logging
>    a cycle error, so a mid-cycle exception cannot strand in-flight PRs until
>    a manual restart.
> Three regression tests cover these (NRS-pause-stops-stack, partial-landing
> pause+requeue, cycle-error-triggers-reconcile).

**Files:**
- Create: `src/merge-queue/daemon.ts`
- Test: `src/merge-queue/daemon.test.ts`

**Interfaces:**
- Consumes: everything from Waves 1–2 (`journal`, `state`, `batch`, `flakes`, `GhClient`/`PrInfo`, `GitOps`, `runGate`/`GateResult`, `MergeQueueConfig`).
- Produces (CLI Task 12 depends on):
  - `DaemonDeps` (all adapters injectable — tests use fakes; CLI wires real ones)
  - `class MergeQueueDaemon { constructor(deps: DaemonDeps); reconcile(): void; cycle(): 'idle' | 'worked'; run(opts?: { once?: boolean }): Promise<void>; paused(): string | null }`
  - `PAUSED_FILE = 'PAUSED'`

**Semantics implemented here (spec §5.2–§5.4):** label absorption (`mq:ready` seam) → drop externally-closed PRs → risk-ordered batch → squash-apply candidate (`NEEDS_REBASE` ejection) → gate → timeout retried once whole (infra disambiguation) → flake retry of failed test files (quarantine at 3 events/7 days) → base-moved abort check → green: land sequentially + NRS tree assertion (pause on mismatch) → red: bisect via an in-cycle FIFO stack, singletons ejected with log + PR comment + advisory bead reopen. Startup `reconcile()`: dead in-flight batches → members re-queued unless GitHub says they merged; stale candidate refs swept.

- [ ] **Step 1: Write the failing test**

```typescript
// src/merge-queue/daemon.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MergeQueueDaemon, PAUSED_FILE, type DaemonDeps } from './daemon.js'
import { appendEvent, readJournal } from './journal.js'
import { reduceState, queuedPrs } from './state.js'
import { defaultMergeQueueConfig } from './types.js'
import type { GhClient, PrInfo } from './gh.js'
import type { CandidateResult, GitOps } from './git.js'
import type { GateResult } from './gate.js'

const AT = '2026-07-17T12:00:00.000Z'

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-daemon-')) }

function prInfo(n: number, over: Partial<PrInfo> = {}): PrInfo {
  return {
    number: n, state: 'OPEN', headSha: `sha${n}`, mergedAt: null,
    additions: n, deletions: 0, title: `pr${n}`, body: '', ...over,
  }
}

class FakeGh implements GhClient {
  infos = new Map<number, PrInfo>()
  merged: number[] = []
  comments: { pr: number; body: string }[] = []
  labeled: number[] = []
  red = false
  viewPr(pr: number): PrInfo {
    const info = this.infos.get(pr)
    if (!info) throw new Error(`no such PR ${pr}`)
    return info
  }
  squashMerge(pr: number): void {
    this.merged.push(pr)
    this.infos.set(pr, { ...this.viewPr(pr), state: 'MERGED', mergedAt: AT })
  }
  comment(pr: number, body: string): void { this.comments.push({ pr, body }) }
  listLabeled(): number[] { return this.labeled }
  postMergeRed(): boolean { return this.red }
}

class FakeGit implements GitOps {
  headShas: string[] = ['S1']          // FIFO, last value sticky
  trees: Record<string, string> = {}   // ref -> tree; default 'TREE'
  candidates: CandidateResult[] = []   // scripted per constructCandidate call
  constructed: { batchId: string; prs: number[] }[] = []
  deleted: string[] = []
  liveRefs: string[] = []
  constructor(private root: string) {}
  primaryRoot(): string { return this.root }
  defaultBranch(): string { return 'main' }
  fetchOrigin(): void { /* no-op */ }
  originHeadSha(): string {
    return this.headShas.length > 1 ? (this.headShas.shift() as string) : this.headShas[0]
  }
  treeOf(ref: string): string { return this.trees[ref] ?? 'TREE' }
  ensureGateWorktree(): string { return path.join(this.root, '.mq', 'gate') }
  constructCandidate(batchId: string, prs: { pr: number }[]): CandidateResult {
    this.constructed.push({ batchId, prs: prs.map(p => p.pr) })
    const scripted = this.candidates.shift()
    return scripted ?? {
      ref: `refs/merge-queue/batch-${batchId}`, applied: prs.map(p => p.pr), rejected: [],
    }
  }
  deleteCandidate(batchId: string): void { this.deleted.push(batchId) }
  listCandidateRefs(): string[] { return this.liveRefs }
}

function harness(over: Partial<DaemonDeps> = {}) {
  const root = tmp()
  const mqDir = path.join(root, '.mq')
  const gh = new FakeGh()
  const git = new FakeGit(root)
  const gateResults: GateResult[] = []
  const gateCalls: Parameters<DaemonDeps['runGate']>[0][] = []
  const deps: DaemonDeps = {
    gh, git,
    runGate: opts => {
      gateCalls.push(opts)
      const next = gateResults.shift()
      return next ?? { result: 'green', seconds: 1, logPath: '/dev/null', failedTests: [] }
    },
    config: defaultMergeQueueConfig(),
    mqDir, projectRoot: root,
    log: () => {},
    now: () => new Date(AT),
    ...over,
  }
  const daemon = new MergeQueueDaemon(deps)
  const enqueue = (pr: number) => {
    gh.infos.set(pr, prInfo(pr))
    appendEvent(mqDir, { type: 'enqueued', pr, at: AT })
  }
  const states = () => {
    const s = reduceState(readJournal(mqDir))
    return Object.fromEntries([...s.entries.values()].map(e => [e.pr, e.state]))
  }
  return { daemon, deps, gh, git, gateResults, gateCalls, enqueue, states, mqDir, root }
}

describe('MergeQueueDaemon.cycle', () => {
  it('lands a green batch of two and passes the NRS check', () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    expect(h.daemon.cycle()).toBe('worked')
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'LANDED' })
    expect(h.gh.merged).toEqual([1, 2])
    expect(h.daemon.paused()).toBeNull()
    expect(h.git.deleted.length).toBe(1)
  })

  it('passes MQ_AFFECTED_BASE to the gate and runs it in the gate worktree', () => {
    const h = harness()
    h.enqueue(1)
    h.daemon.cycle()
    expect(h.gateCalls[0].env?.MQ_AFFECTED_BASE).toBe('origin/main')
    expect(h.gateCalls[0].cwd).toBe(path.join(h.root, '.mq', 'gate'))
    expect(h.gateCalls[0].command).toBe('make check-affected')
  })

  it('absorbs label-enqueued PRs (remote seam)', () => {
    const h = harness()
    h.gh.labeled = [5]
    h.gh.infos.set(5, prInfo(5))
    expect(h.daemon.cycle()).toBe('worked')
    expect(h.states()[5]).toBe('LANDED')
  })

  it('cancels externally closed PRs instead of batching them', () => {
    const h = harness()
    h.enqueue(1)
    h.gh.infos.set(1, prInfo(1, { state: 'MERGED', mergedAt: AT }))
    expect(h.daemon.cycle()).toBe('worked')
    expect(h.states()[1]).toBe('CANCELLED')
    expect(h.gh.merged).toEqual([])
  })

  it('ejects a red singleton with the gate log in the PR comment', () => {
    const h = harness()
    h.enqueue(1)
    h.gateResults.push({ result: 'red', seconds: 2, logPath: '/logs/b.log', failedTests: [] })
    h.daemon.cycle()
    expect(h.states()[1]).toBe('EJECTED')
    expect(h.gh.comments[0].pr).toBe(1)
    expect(h.gh.comments[0].body).toContain('/logs/b.log')
    const entry = reduceState(readJournal(h.mqDir)).entries.get(1)
    expect(entry?.queueFailures).toBe(1)
  })

  it('bisects a red pair: green half lands, red half is ejected', () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    // parent(1,2) red -> split -> [1] green -> [2] red
    h.gateResults.push(
      { result: 'red', seconds: 2, logPath: '/l/p.log', failedTests: [] },
      { result: 'green', seconds: 1, logPath: '/l/l.log', failedTests: [] },
      { result: 'red', seconds: 1, logPath: '/l/r.log', failedTests: [] },
    )
    h.daemon.cycle()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'EJECTED' })
    expect(h.gh.merged).toEqual([1])
    expect(h.git.constructed.map(c => c.prs)).toEqual([[1, 2], [1], [2]])
  })

  it('flake retry: failed tests rerun once; green retry lands and records the flake', () => {
    const h = harness()
    h.enqueue(1)
    h.gateResults.push(
      { result: 'red', seconds: 2, logPath: '/l/a.log', failedTests: ['src/f.test.ts'] },
      { result: 'green', seconds: 1, logPath: '/l/a2.log', failedTests: [] },
    )
    h.daemon.cycle()
    expect(h.states()[1]).toBe('LANDED')
    expect(h.gateCalls[1].env?.MQ_RETRY_TESTS).toBe('src/f.test.ts')
    const flakes = reduceState(readJournal(h.mqDir)).flakes
    expect(flakes).toEqual([{ testId: 'src/f.test.ts', at: AT }])
  })

  it('quarantines a test on its 3rd flake event in 7 days', () => {
    const h = harness()
    appendEvent(h.mqDir, { type: 'flake', testId: 'src/f.test.ts', at: '2026-07-15T00:00:00.000Z' })
    appendEvent(h.mqDir, { type: 'flake', testId: 'src/f.test.ts', at: '2026-07-16T00:00:00.000Z' })
    h.enqueue(1)
    h.gateResults.push(
      { result: 'red', seconds: 2, logPath: '/l/a.log', failedTests: ['src/f.test.ts'] },
      { result: 'green', seconds: 1, logPath: '/l/a2.log', failedTests: [] },
    )
    h.daemon.cycle()
    const qFile = path.join(h.root, '.mq/quarantine.txt')
    expect(fs.readFileSync(qFile, 'utf8')).toBe('src/f.test.ts\n')
  })

  it('ejects NEEDS_REBASE members without killing the batch', () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    h.git.candidates.push({ ref: 'refs/merge-queue/batch-x', applied: [1], rejected: [2] })
    h.daemon.cycle()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'NEEDS_REBASE' })
    expect(h.gh.comments.some(c => c.pr === 2 && /rebase/i.test(c.body))).toBe(true)
  })

  it('aborts and requeues when the base moved during the gate', () => {
    const h = harness()
    h.enqueue(1)
    h.git.headShas = ['S1', 'S2'] // batch start sees S1; post-gate check sees S2
    h.daemon.cycle()
    expect(h.states()[1]).toBe('REQUEUED_SPLIT')
    expect(h.gh.merged).toEqual([])
    const s = reduceState(readJournal(h.mqDir))
    expect(queuedPrs(s).map(e => e.pr)).toEqual([1])
  })

  it('holds the queue while post-merge is red', () => {
    const h = harness()
    h.enqueue(1)
    h.gh.red = true
    expect(h.daemon.cycle()).toBe('idle')
    expect(h.states()[1]).toBe('QUEUED')
  })

  it('timeout is retried once whole, then treated as red', () => {
    const h = harness()
    h.enqueue(1)
    h.gateResults.push(
      { result: 'timeout', seconds: 99, logPath: '/l/t1.log', failedTests: [] },
      { result: 'timeout', seconds: 99, logPath: '/l/t2.log', failedTests: [] },
    )
    h.daemon.cycle()
    expect(h.states()[1]).toBe('EJECTED')
    expect(h.gateCalls.length).toBe(2)
  })

  it('pauses on an NRS tree mismatch after landing', () => {
    const h = harness()
    h.enqueue(1)
    h.git.trees['origin/main'] = 'DIFFERENT'
    h.daemon.cycle()
    expect(h.daemon.paused()).toMatch(/NRS violation/)
    expect(fs.existsSync(path.join(h.mqDir, PAUSED_FILE))).toBe(true)
    // paused daemon does nothing next cycle
    h.enqueue(2)
    expect(h.daemon.cycle()).toBe('idle')
  })
})

describe('MergeQueueDaemon.reconcile', () => {
  it('requeues members of a dead in-flight batch, marks crash-merged PRs LANDED, sweeps refs', () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    appendEvent(h.mqDir, { type: 'batch_created', batchId: 'dead', members: [1, 2], at: AT })
    appendEvent(h.mqDir, { type: 'pr_state', pr: 1, state: 'TESTING', batchId: 'dead', at: AT })
    appendEvent(h.mqDir, { type: 'pr_state', pr: 2, state: 'TESTING', batchId: 'dead', at: AT })
    appendEvent(h.mqDir, { type: 'batch_state', batchId: 'dead', state: 'RUNNING', at: AT })
    h.gh.infos.set(1, prInfo(1, { state: 'MERGED', mergedAt: AT })) // merged before crash
    h.git.liveRefs = ['refs/merge-queue/batch-dead']
    h.daemon.reconcile()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'REQUEUED_SPLIT' })
    expect(h.git.deleted).toContain('dead')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/merge-queue/daemon.test.ts`
Expected: FAIL — `Cannot find module './daemon.js'`

- [ ] **Step 3: Write daemon.ts**

> **SUPERSEDED — do not transcribe verbatim.** The block below is the original
> synchronous sketch. AMENDMENT (post-Task-8) and AMENDMENT 2 (post-Task-10)
> above are binding and change it materially: `cycle()`/`runBatch()`/`gateRun()`/
> `run()` are `async`, the bisection stack re-checks `paused()` each iteration, a
> partial landing pauses instead of running the NRS check, and `run()` reconciles
> on any cycle error. A later review round also added pre-land validation (a
> member ejected or pushed during the gate must not land — `land()` takes a
> `testedHeads` map and passes `--match-head-commit`) and `closeBead` on the
> reconcile-LANDED path. **The authoritative implementation is the shipped
> `src/merge-queue/daemon.ts` — read it, not this block, when in doubt.**

```typescript
// src/merge-queue/daemon.ts
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ulid } from 'ulid'
import { appendEvent, readJournal } from './journal.js'
import { TERMINAL_PR_STATES, queuedPrs, reduceState } from './state.js'
import { composeBatch, splitBatch } from './batch.js'
import {
  QUARANTINE_THRESHOLD, addToQuarantine, fileQuarantineBead, recentFlakeCount, recordFlake,
} from './flakes.js'
import type { GhClient, PrInfo } from './gh.js'
import type { GitOps } from './git.js'
import type { GateResult } from './gate.js'
import type { MergeQueueConfig, QueueState } from './types.js'

export interface DaemonDeps {
  gh: GhClient
  git: GitOps
  runGate: (opts: {
    cwd: string; command: string; timeoutMs: number; logPath: string
    env?: Record<string, string>
  }) => GateResult
  config: MergeQueueConfig
  mqDir: string
  projectRoot: string
  log: (msg: string) => void
  now: () => Date
}

export const PAUSED_FILE = 'PAUSED'

const IN_FLIGHT_BATCH_STATES = ['CONSTRUCTING', 'RUNNING', 'GREEN', 'LANDING', 'SPLITTING']

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

type BatchOutcome =
  | { kind: 'done' }
  | { kind: 'aborted' }
  | { kind: 'split'; batchId: string; left: number[]; right: number[] }

export class MergeQueueDaemon {
  constructor(private deps: DaemonDeps) {}

  private at(): string { return this.deps.now().toISOString() }
  private state(): QueueState { return reduceState(readJournal(this.deps.mqDir)) }

  paused(): string | null {
    const file = path.join(this.deps.mqDir, PAUSED_FILE)
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null
  }

  private pause(reason: string): void {
    fs.mkdirSync(this.deps.mqDir, { recursive: true })
    fs.writeFileSync(path.join(this.deps.mqDir, PAUSED_FILE), reason + '\n')
    this.deps.log(`PAUSED: ${reason}`)
  }

  async run(opts: { once?: boolean } = {}): Promise<void> {
    this.reconcile()
    for (;;) {
      let outcome: 'idle' | 'worked' = 'idle'
      try {
        outcome = this.cycle()
      } catch (err) {
        this.deps.log(`cycle error: ${String(err)}`)
      }
      if (opts.once) return
      if (outcome === 'idle') await sleep(this.deps.config.poll_seconds * 1000)
    }
  }

  cycle(): 'idle' | 'worked' {
    const { gh, git, config, mqDir, log } = this.deps
    if (this.paused() !== null) { log('paused — skipping cycle'); return 'idle' }
    git.fetchOrigin()
    const base = git.defaultBranch()
    if (gh.postMergeRed(base)) {
      log(`post-merge red on ${base} — holding the queue`)
      return 'idle'
    }

    // Remote-agent seam (spec D10): absorb PRs labeled mq:ready.
    const pre = this.state()
    for (const pr of gh.listLabeled(config.ready_label)) {
      const existing = pre.entries.get(pr)
      if (!existing || TERMINAL_PR_STATES.has(existing.state)) {
        appendEvent(mqDir, { type: 'enqueued', pr, at: this.at() })
      }
    }

    const queued = queuedPrs(this.state())
    if (queued.length === 0) return 'idle'

    const infos = new Map<number, PrInfo>()
    for (const entry of queued) {
      let info: PrInfo
      try {
        info = gh.viewPr(entry.pr)
      } catch (err) {
        log(`warn: cannot view PR #${entry.pr}: ${String(err)}`)
        continue
      }
      if (info.state !== 'OPEN') {
        appendEvent(mqDir, {
          type: 'pr_state', pr: entry.pr, state: 'CANCELLED', at: this.at(),
          note: `closed externally (${info.state})`,
        })
        continue
      }
      infos.set(entry.pr, info)
    }
    const eligible = queued.filter(e => infos.has(e.pr))
    if (eligible.length === 0) return 'worked'

    const members = composeBatch(eligible, infos, config.batch_cap)

    // Bisection stack — bors batch-then-bisect within the single lane. Halves
    // requeue AHEAD of new arrivals by construction (they run in this cycle).
    const stack: { members: number[]; parent?: string }[] = [{ members }]
    while (stack.length > 0) {
      const item = stack.shift()
      if (!item) break
      const outcome = this.runBatch(item.members, item.parent, infos, base)
      if (outcome.kind === 'split') {
        stack.unshift({ members: outcome.right, parent: outcome.batchId })
        stack.unshift({ members: outcome.left, parent: outcome.batchId })
      } else if (outcome.kind === 'aborted') {
        break
      }
    }
    return 'worked'
  }

  private runBatch(
    members: number[],
    parent: string | undefined,
    infos: Map<number, PrInfo>,
    base: string,
  ): BatchOutcome {
    const { git, config, mqDir, log } = this.deps
    const batchId = ulid().toLowerCase()
    appendEvent(mqDir, { type: 'batch_created', batchId, members, parent, at: this.at() })
    for (const pr of members) {
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'IN_BATCH', batchId, at: this.at() })
    }

    const baseSha = git.originHeadSha(base)
    const prs = members.map(pr => {
      const info = infos.get(pr)
      if (!info) throw new Error(`no PrInfo for batched PR #${pr}`)
      return { pr, headSha: info.headSha }
    })
    const { ref, applied, rejected } = git.constructCandidate(batchId, prs, base)
    for (const pr of rejected) {
      this.eject(pr, batchId, 'NEEDS_REBASE',
        `does not apply cleanly onto origin/${base} — rebase and re-enqueue`)
    }
    if (applied.length === 0) {
      appendEvent(mqDir, {
        type: 'batch_state', batchId, state: 'ABORTED', at: this.at(), note: 'no members applied',
      })
      git.deleteCandidate(batchId)
      return { kind: 'done' }
    }

    const candidateTree = git.treeOf(ref)
    appendEvent(mqDir, {
      type: 'batch_state', batchId, state: 'RUNNING', baseSha, candidateTree, at: this.at(),
    })
    for (const pr of applied) {
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'TESTING', batchId, at: this.at() })
    }

    let gate = this.gateRun(batchId, base)
    appendEvent(mqDir, {
      type: 'gate_metrics', batchId, seconds: gate.seconds, result: gate.result, at: this.at(),
    })

    // Timeout → infra-vs-test disambiguation: retry the whole batch once (spec §5.3).
    if (gate.result === 'timeout') {
      log(`batch ${batchId}: gate timeout — retrying once`)
      gate = this.gateRun(batchId, base)
      appendEvent(mqDir, {
        type: 'gate_metrics', batchId, seconds: gate.seconds, result: gate.result, at: this.at(),
      })
      if (gate.result === 'timeout') gate = { ...gate, result: 'red' }
    }

    // Flake protocol (spec D8): rerun failed test files once with identical config.
    if (gate.result === 'red' && gate.failedTests.length > 0) {
      for (const pr of applied) {
        appendEvent(mqDir, { type: 'pr_state', pr, state: 'FLAKE_RETRY', batchId, at: this.at() })
      }
      const retry = this.gateRun(batchId, base, gate.failedTests)
      if (retry.result === 'green') {
        for (const testId of gate.failedTests) {
          recordFlake(mqDir, testId, this.at())
          const count = recentFlakeCount(this.state(), testId, this.deps.now())
          if (count >= QUARANTINE_THRESHOLD &&
              addToQuarantine(this.deps.projectRoot, config.quarantine_path, testId)) {
            fileQuarantineBead(this.deps.projectRoot, testId)
            log(`quarantined flaky test ${testId} (${count} events/7d)`)
          }
        }
        gate = retry
      }
    }

    // Base moved during the gate → candidate tested against a stale base (spec §5.2 step 6).
    git.fetchOrigin()
    if (git.originHeadSha(base) !== baseSha) {
      appendEvent(mqDir, {
        type: 'batch_state', batchId, state: 'ABORTED', at: this.at(), note: 'base moved during gate',
      })
      for (const pr of applied) {
        appendEvent(mqDir, {
          type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId, at: this.at(), note: 'base moved',
        })
      }
      git.deleteCandidate(batchId)
      return { kind: 'aborted' }
    }

    if (gate.result === 'green') {
      this.land(batchId, applied, base, candidateTree)
      git.deleteCandidate(batchId)
      return { kind: 'done' }
    }

    // Red. Singleton → eject; otherwise bisect.
    if (applied.length === 1) {
      appendEvent(mqDir, { type: 'batch_state', batchId, state: 'RED', at: this.at() })
      this.eject(applied[0], batchId, 'EJECTED', `gate failed — log: ${gate.logPath}`)
      git.deleteCandidate(batchId)
      return { kind: 'done' }
    }
    appendEvent(mqDir, { type: 'batch_state', batchId, state: 'SPLITTING', at: this.at() })
    for (const pr of applied) {
      appendEvent(mqDir, {
        type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId, at: this.at(),
        note: 'bisecting red batch',
      })
    }
    const [left, right] = splitBatch(applied)
    git.deleteCandidate(batchId)
    return { kind: 'split', batchId, left, right }
  }

  private gateRun(batchId: string, base: string, retryTests?: string[]): GateResult {
    const { git, config, runGate, mqDir } = this.deps
    const env: Record<string, string> = { MQ_AFFECTED_BASE: `origin/${base}` }
    if (retryTests) env.MQ_RETRY_TESTS = retryTests.join(',')
    return runGate({
      cwd: git.ensureGateWorktree(),
      command: config.gate_command,
      timeoutMs: config.gate_timeout_minutes * 60_000,
      logPath: path.join(mqDir, 'logs', `${batchId}${retryTests ? '-retry' : ''}.log`),
      env,
    })
  }

  private land(batchId: string, members: number[], base: string, candidateTree: string): void {
    const { gh, git, mqDir, log } = this.deps
    appendEvent(mqDir, { type: 'batch_state', batchId, state: 'GREEN', at: this.at() })
    for (const pr of members) {
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'PASSED', batchId, at: this.at() })
    }
    appendEvent(mqDir, { type: 'batch_state', batchId, state: 'LANDING', at: this.at() })
    for (const pr of members) {
      // Write-ahead: LANDING before the merge attempt; idempotent via mergedAt.
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'LANDING', batchId, at: this.at() })
      if (gh.viewPr(pr).mergedAt === null) gh.squashMerge(pr)
      appendEvent(mqDir, { type: 'pr_state', pr, state: 'LANDED', batchId, at: this.at() })
      try {
        gh.comment(pr, `**merge-queue**: landed in batch ${batchId}`)
      } catch { /* comment is best-effort */ }
      this.closeBead(pr)
    }
    git.fetchOrigin()
    const landedTree = git.treeOf(`origin/${base}`)
    if (landedTree !== candidateTree) {
      // Not-Rocket-Science invariant (spec D9): what landed must be what was tested.
      this.pause(
        `NRS violation: origin/${base} tree ${landedTree} != tested candidate tree ` +
        `${candidateTree} (batch ${batchId}) — investigate before unpausing (rm .mq/PAUSED)`,
      )
      appendEvent(mqDir, {
        type: 'batch_state', batchId, state: 'DONE', at: this.at(), note: 'NRS MISMATCH — paused',
      })
      return
    }
    appendEvent(mqDir, { type: 'batch_state', batchId, state: 'DONE', at: this.at() })
    log(`batch ${batchId}: landed ${members.length} PR(s)`)
  }

  private eject(
    pr: number,
    batchId: string,
    state: 'EJECTED' | 'NEEDS_REBASE',
    reason: string,
  ): void {
    const { gh, mqDir, log } = this.deps
    appendEvent(mqDir, { type: 'pr_state', pr, state, batchId, at: this.at(), note: reason })
    try {
      gh.comment(pr, `**merge-queue**: ${state} — ${reason}`)
      this.reopenBead(pr)
    } catch (err) {
      log(`warn: could not comment/reopen for PR #${pr}: ${String(err)}`)
    }
  }

  /** Bead feedback loop (spec §5.5): reopen the bead named by "Closes <id>" in the PR body. */
  private reopenBead(pr: number): void {
    this.beadCmd(pr, ['update', '{id}', '--status', 'open'])
  }

  /** Fire-and-forget contract (spec §5.5): the DAEMON closes the bead on land —
   *  the enqueueing agent moved on and never returns to verify the merge. */
  private closeBead(pr: number): void {
    this.beadCmd(pr, ['close', '{id}'])
  }

  private beadCmd(pr: number, argTemplate: string[]): void {
    let body = ''
    try {
      body = this.deps.gh.viewPr(pr).body
    } catch {
      return
    }
    const match = body.match(/Closes ([a-z][a-z0-9-]*-[a-z0-9]+)/i)
    if (!match) return
    try {
      execFileSync('bd', argTemplate.map(a => a === '{id}' ? match[1] : a), {
        cwd: this.deps.projectRoot, stdio: 'ignore',
      })
    } catch { /* bd absent — advisory only */ }
  }

  /** Startup recovery (spec §5.4): journal vs refs vs GitHub. */
  reconcile(): void {
    const { gh, git, mqDir, log } = this.deps
    const state = this.state()
    for (const batch of state.batches.values()) {
      if (!IN_FLIGHT_BATCH_STATES.includes(batch.state)) continue
      appendEvent(mqDir, {
        type: 'batch_state', batchId: batch.id, state: 'ABORTED', at: this.at(),
        note: 'daemon restart',
      })
      for (const pr of batch.members) {
        const entry = state.entries.get(pr)
        if (!entry || TERMINAL_PR_STATES.has(entry.state)) continue
        let mergedAt: string | null = null
        try {
          mergedAt = gh.viewPr(pr).mergedAt
        } catch { /* treat as unmerged */ }
        appendEvent(mqDir, mergedAt !== null
          ? {
            type: 'pr_state', pr, state: 'LANDED', batchId: batch.id, at: this.at(),
            note: 'recovered: merged before crash',
          }
          : {
            type: 'pr_state', pr, state: 'REQUEUED_SPLIT', batchId: batch.id, at: this.at(),
            note: 'recovered: daemon restart',
          })
      }
    }
    // Sweep candidate refs that no longer belong to an active batch.
    const activeRefs = new Set(
      [...this.state().batches.values()]
        .filter(b => IN_FLIGHT_BATCH_STATES.includes(b.state))
        .map(b => b.candidateRef),
    )
    for (const ref of git.listCandidateRefs()) {
      if (!activeRefs.has(ref)) {
        git.deleteCandidate(ref.replace('refs/merge-queue/batch-', ''))
      }
    }
    log('reconcile complete')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/merge-queue/daemon.test.ts`
Expected: PASS (13 tests). Also run the whole module: `npx vitest run src/merge-queue/` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/merge-queue/daemon.ts src/merge-queue/daemon.test.ts
git commit -m "feat(mq): daemon orchestrator — batch/bisect/land/NRS/flakes/recovery"
```

### Task 11: Stats module

**Files:**
- Create: `src/merge-queue/stats.ts`
- Test: `src/merge-queue/stats.test.ts`

**Interfaces:**
- Consumes: `JournalEvent` from `./types.js`.
- Produces (CLI Task 12 depends on):

```typescript
export interface MqStats {
  arrivalsLast24h: number
  landedTotal: number
  gateRuns: { green: number; red: number; timeout: number }
  medianGateSeconds: number | null
  flakesLast7d: number
}
export function computeStats(events: JournalEvent[], now: Date): MqStats
```

- [ ] **Step 1: Write the failing test**

```typescript
// src/merge-queue/stats.test.ts
import { describe, expect, it } from 'vitest'
import { computeStats } from './stats.js'
import type { JournalEvent } from './types.js'

const NOW = new Date('2026-07-17T12:00:00.000Z')

describe('computeStats', () => {
  it('computes arrivals, landings, gate outcomes, median, flakes', () => {
    const events: JournalEvent[] = [
      { type: 'enqueued', pr: 1, at: '2026-07-17T01:00:00.000Z' },
      { type: 'enqueued', pr: 2, at: '2026-07-15T01:00:00.000Z' }, // > 24h ago
      { type: 'pr_state', pr: 1, state: 'LANDED', at: '2026-07-17T02:00:00.000Z' },
      { type: 'gate_metrics', batchId: 'a', seconds: 100, result: 'green', at: '2026-07-17T02:00:00.000Z' },
      { type: 'gate_metrics', batchId: 'b', seconds: 300, result: 'red', at: '2026-07-17T03:00:00.000Z' },
      { type: 'gate_metrics', batchId: 'c', seconds: 200, result: 'green', at: '2026-07-17T04:00:00.000Z' },
      { type: 'flake', testId: 't1', at: '2026-07-16T00:00:00.000Z' },
      { type: 'flake', testId: 't1', at: '2026-06-01T00:00:00.000Z' }, // stale
    ]
    expect(computeStats(events, NOW)).toEqual({
      arrivalsLast24h: 1,
      landedTotal: 1,
      gateRuns: { green: 2, red: 1, timeout: 0 },
      medianGateSeconds: 200,
      flakesLast7d: 1,
    })
  })

  it('returns null median with no gate runs', () => {
    expect(computeStats([], NOW).medianGateSeconds).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/merge-queue/stats.test.ts`
Expected: FAIL — `Cannot find module './stats.js'`

- [ ] **Step 3: Write stats.ts**

```typescript
// src/merge-queue/stats.ts
import type { JournalEvent } from './types.js'

export interface MqStats {
  arrivalsLast24h: number
  landedTotal: number
  gateRuns: { green: number; red: number; timeout: number }
  medianGateSeconds: number | null
  flakesLast7d: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export function computeStats(events: JournalEvent[], now: Date): MqStats {
  const t = now.getTime()
  let arrivalsLast24h = 0
  let landedTotal = 0
  const gateRuns = { green: 0, red: 0, timeout: 0 }
  const gateSeconds: number[] = []
  let flakesLast7d = 0
  for (const e of events) {
    switch (e.type) {
    case 'enqueued':
      if (Date.parse(e.at) >= t - DAY_MS) arrivalsLast24h += 1
      break
    case 'pr_state':
      if (e.state === 'LANDED') landedTotal += 1
      break
    case 'gate_metrics':
      gateRuns[e.result] += 1
      gateSeconds.push(e.seconds)
      break
    case 'flake':
      if (Date.parse(e.at) >= t - 7 * DAY_MS) flakesLast7d += 1
      break
    default:
      break
    }
  }
  gateSeconds.sort((a, b) => a - b)
  const medianGateSeconds = gateSeconds.length === 0
    ? null
    : gateSeconds[Math.floor((gateSeconds.length - 1) / 2)]
  return { arrivalsLast24h, landedTotal, gateRuns, medianGateSeconds, flakesLast7d }
}
```

Note: `landedTotal` counts LANDED `pr_state` events — a PR that lands once after a recovery double-write would double-count; acceptable for an advisory metric (documented by this note). Median of an even-length list takes the lower middle (100,200,300 → 200; the test pins this).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/merge-queue/stats.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/merge-queue/stats.ts src/merge-queue/stats.test.ts
git commit -m "feat(mq): calibration stats from the journal"
```

### Task 12: `scaffold mq` CLI command + singleton lock + auto-start

**Files:**
- Create: `src/cli/commands/mq.ts`
- Modify: `src/cli/index.ts` (import + `.command(mqCommand)` after `agentOpsCommand`)
- Test: `src/cli/commands/mq.test.ts`

**Interfaces:**
- Consumes: `MergeQueueDaemon`/`DaemonDeps`/`PAUSED_FILE` (Task 10), `createGhClient` (Task 6), `createGitOps` (Task 7), `runGate` (Task 8), `appendEvent`/`readJournal` (Task 2), `reduceState`/`queuedPrs` (Task 3), `computeStats` (Task 11), `loadAgentOpsConfig` (Task 5), `lock`/`checkSync` from `proper-lockfile` (already declared in `src/proper-lockfile.d.ts`).
- Produces: the user-facing surface — `scaffold mq enqueue --pr N | daemon [--foreground] [--once] | status [--pr N] | eject --pr N | stats`. Plan 2's make targets wrap exactly these.
- Locking contract: the daemon holds an async `lock(mqDir, { lockfilePath: <mqDir>/daemon.lock, stale: 60_000, update: 15_000 })`; `enqueue` uses `checkSync` with the same `lockfilePath`/`stale` to decide whether to auto-start. `MQ_NO_AUTOSTART=1` suppresses auto-start (tests, debugging).

- [ ] **Step 1: Write the failing test**

```typescript
// src/cli/commands/mq.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import mqCommand, { mqHandler } from './mq.js'
import { readJournal } from '../../merge-queue/journal.js'

function scratchRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-cli-'))
  execFileSync('git', ['init', '-b', 'main', dir])
  execFileSync('git', ['-C', dir, 'config', 'user.name', 't'])
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@t.invalid'])
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x\n')
  execFileSync('git', ['-C', dir, 'add', 'f.txt'])
  execFileSync('git', ['-C', dir, 'commit', '-m', 'base'])
  return dir
}

afterEach(() => {
  delete process.env.MQ_NO_AUTOSTART
})

describe('scaffold mq', () => {
  it('declares the five actions', () => {
    expect(mqCommand.command).toBe('mq <action>')
  })

  it('enqueue appends a journal event (autostart suppressed)', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'enqueue', pr: 12, root })
    const events = readJournal(path.join(root, '.mq'))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'enqueued', pr: 12 })
  })

  it('enqueue without --pr sets a failure exit code', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'enqueue', root })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })

  it('eject records CANCELLED for a queued PR', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'enqueue', pr: 7, root })
    await mqHandler({ action: 'eject', pr: 7, root })
    const events = readJournal(path.join(root, '.mq'))
    expect(events[1]).toMatchObject({ type: 'pr_state', pr: 7, state: 'CANCELLED' })
  })

  it('stats runs against an empty queue without throwing', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await expect(mqHandler({ action: 'stats', root })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/commands/mq.test.ts`
Expected: FAIL — `Cannot find module './mq.js'`

- [ ] **Step 3: Write mq.ts**

```typescript
// src/cli/commands/mq.ts
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { checkSync, lock } from 'proper-lockfile'
import type { Argv, CommandModule } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { loadAgentOpsConfig } from '../../core/agent-ops/config.js'
import { MergeQueueDaemon, PAUSED_FILE } from '../../merge-queue/daemon.js'
import { appendEvent, readJournal } from '../../merge-queue/journal.js'
import { reduceState } from '../../merge-queue/state.js'
import { computeStats } from '../../merge-queue/stats.js'
import { createGhClient } from '../../merge-queue/gh.js'
import { createGitOps } from '../../merge-queue/git.js'
import { runGate } from '../../merge-queue/gate.js'

export interface MqArgs {
  action: string
  pr?: number
  foreground?: boolean
  once?: boolean
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

const LOCK_STALE_MS = 60_000

function lockOpts(mqDir: string) {
  return { lockfilePath: path.join(mqDir, 'daemon.lock'), stale: LOCK_STALE_MS }
}

function daemonAlive(mqDir: string): boolean {
  try {
    return checkSync(mqDir, lockOpts(mqDir))
  } catch {
    return false
  }
}

function autostartDaemon(primary: string): void {
  const child = spawn(process.execPath, [process.argv[1], 'mq', 'daemon', '--root', primary], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

export async function mqHandler(argv: MqArgs): Promise<void> {
  const outputMode = resolveOutputMode(argv as Record<string, unknown>)
  const output = createOutputContext(outputMode)
  const startRoot = argv.root ?? process.cwd()
  const git = createGitOps(startRoot)
  const primary = git.primaryRoot()
  const mqDir = path.join(primary, '.mq')
  fs.mkdirSync(mqDir, { recursive: true })

  const needPr = (): number | null => {
    if (argv.pr === undefined || !Number.isInteger(argv.pr) || argv.pr < 1) {
      output.error(`mq ${argv.action}: --pr <number> is required`)
      process.exitCode = 1
      return null
    }
    return argv.pr
  }

  switch (argv.action) {
  case 'enqueue': {
    const pr = needPr()
    if (pr === null) return
    appendEvent(mqDir, { type: 'enqueued', pr, at: new Date().toISOString() })
    if (process.env.MQ_NO_AUTOSTART !== '1' && !daemonAlive(mqDir)) autostartDaemon(primary)
    output.success(
      `enqueued PR #${pr} — the daemon will land or eject it; watch: scaffold mq status`,
    )
    return
  }
  case 'eject': {
    const pr = needPr()
    if (pr === null) return
    appendEvent(mqDir, {
      type: 'pr_state', pr, state: 'CANCELLED', at: new Date().toISOString(),
      note: 'ejected by user',
    })
    output.success(`ejected PR #${pr} from the queue`)
    return
  }
  case 'status': {
    const state = reduceState(readJournal(mqDir))
    const pausedFile = path.join(mqDir, PAUSED_FILE)
    const paused = fs.existsSync(pausedFile) ? fs.readFileSync(pausedFile, 'utf8').trim() : null
    const entries = [...state.entries.values()]
      .filter(e => argv.pr === undefined || e.pr === argv.pr)
    if (argv.format === 'json') {
      output.result({ paused, daemonAlive: daemonAlive(mqDir), entries })
      return
    }
    if (paused !== null) output.warn(`QUEUE PAUSED: ${paused}`)
    output.info(`daemon: ${daemonAlive(mqDir) ? 'running' : 'not running'}`)
    if (entries.length === 0) {
      output.info('queue empty')
      return
    }
    for (const e of entries) {
      output.info(
        `#${e.pr}  ${e.state}${e.batchId ? `  batch=${e.batchId}` : ''}${e.note ? `  (${e.note})` : ''}`,
      )
    }
    return
  }
  case 'stats': {
    const stats = computeStats(readJournal(mqDir), new Date())
    if (argv.format === 'json') {
      output.result(stats)
      return
    }
    output.info(`arrivals (24h): ${stats.arrivalsLast24h}`)
    output.info(`landed (total): ${stats.landedTotal}`)
    output.info(
      `gate runs: ${stats.gateRuns.green} green / ${stats.gateRuns.red} red / ` +
      `${stats.gateRuns.timeout} timeout`,
    )
    output.info(`median gate: ${stats.medianGateSeconds ?? '—'} s`)
    output.info(`flake events (7d): ${stats.flakesLast7d}`)
    return
  }
  case 'daemon': {
    let release: (() => Promise<void>) | undefined
    try {
      release = await lock(mqDir, { ...lockOpts(mqDir), update: 15_000 })
    } catch {
      output.info('mq daemon already running — nothing to do')
      return
    }
    const logFile = path.join(mqDir, 'logs', 'daemon.log')
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    const log = (msg: string): void => {
      const line = `${new Date().toISOString()} ${msg}`
      fs.appendFileSync(logFile, line + '\n')
      if (argv.foreground) output.info(line)
    }
    const config = loadAgentOpsConfig(primary).merge_queue
    const daemon = new MergeQueueDaemon({
      gh: createGhClient(primary),
      git: createGitOps(primary),
      runGate,
      config,
      mqDir,
      projectRoot: primary,
      log,
      now: () => new Date(),
    })
    log(`daemon started (pid ${process.pid})`)
    try {
      await daemon.run({ once: argv.once })
    } finally {
      await release()
    }
    return
  }
  default:
    output.error(`unknown mq action "${argv.action}"`)
    process.exitCode = 1
  }
}

const mqCommand: CommandModule<Record<string, unknown>, MqArgs> = {
  command: 'mq <action>',
  describe: 'Local batching merge queue: enqueue PRs, run the daemon, inspect status',
  builder: (yargs: Argv) => {
    return yargs
      .positional('action', {
        describe: 'Action to perform',
        choices: ['enqueue', 'daemon', 'status', 'eject', 'stats'] as const,
        type: 'string',
        demandOption: true,
      })
      .option('pr', { type: 'number', describe: 'PR number (enqueue / eject / status filter)' })
      .option('foreground', {
        type: 'boolean', default: false, describe: 'Log to stdout as well as .mq/logs/daemon.log',
      })
      .option('once', { type: 'boolean', default: false, hidden: true })
  },
  handler: mqHandler,
}

export default mqCommand
```

- [ ] **Step 4: Register the command**

In `src/cli/index.ts` add (matching the existing import block and `.command(...)` chain):

```typescript
import mqCommand from './commands/mq.js'
// ...
    .command(mqCommand)
```

Place the import after `agentOpsCommand`'s import and the `.command(mqCommand)` after `.command(agentOpsCommand)`.

- [ ] **Step 5: Run tests + type-check**

Run: `npx vitest run src/cli/commands/mq.test.ts && npm run type-check`
Expected: PASS (5 tests), type-check clean.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/mq.ts src/cli/commands/mq.test.ts src/cli/index.ts
git commit -m "feat(mq): scaffold mq CLI — enqueue/daemon/status/eject/stats with singleton lock"
```

---

## Wave 4 — Integration + closeout

### Task 13: End-to-end harness (real git, stub gh, full cycles)

> **AMENDMENT (post-Task-8, binding):** `runGate` and `MergeQueueDaemon.cycle()`
> are async (see Task 10's amendment). In this task's test code, every
> `w.daemon.cycle()` call becomes `await w.daemon.cycle()` and the enclosing
> tests are already async-compatible (add `async` to the `it` callbacks that
> lack it). `reconcile()` stays synchronous.

**Files:**
- Test: `tests/merge-queue-e2e.test.ts`

**Interfaces:**
- Consumes: the real `MergeQueueDaemon` with real `createGitOps`, real `runGate`, and `createGhClient` pointed at a **python3 stub** via `MQ_GH_CMD`. No network.
- Produces: proof of the spec's success criterion mechanics — batch landing with the NRS assertion holding on *real* squash trees (this is the in-repo, offline twin of Spike 1), ejection round-trips, crash recovery.

**The stub:** a python3 script emulating the four `gh` surfaces the daemon uses, backed by a JSON registry file and a real bare origin. Its `pr merge --squash` does exactly what GitHub does mechanically: squash the PR branch onto the default branch in a scratch clone and push — so the NRS tree comparison is meaningful.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/merge-queue-e2e.test.ts
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MergeQueueDaemon, type DaemonDeps } from '../src/merge-queue/daemon.js'
import { appendEvent, readJournal } from '../src/merge-queue/journal.js'
import { reduceState } from '../src/merge-queue/state.js'
import { defaultMergeQueueConfig } from '../src/merge-queue/types.js'
import { createGhClient } from '../src/merge-queue/gh.js'
import { createGitOps } from '../src/merge-queue/git.js'
import { runGate } from '../src/merge-queue/gate.js'

const GH_STUB = `#!/usr/bin/env python3
"""gh stub for merge-queue e2e: registry-backed, lands squashes on a real bare origin."""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(HERE, 'prs.json')
ORIGIN = os.path.join(HERE, 'origin.git')

def load(): return json.load(open(REG))
def save(reg): json.dump(reg, open(REG, 'w'))
def sh(args, cwd=None): return subprocess.check_output(args, cwd=cwd, text=True).strip()

args = sys.argv[1:]

if args[:2] == ['pr', 'view']:
    pr = load()[args[2]]
    print(json.dumps({
        'number': int(args[2]), 'state': pr['state'], 'headRefOid': pr['headSha'],
        'mergedAt': pr['mergedAt'], 'additions': 1, 'deletions': 0,
        'title': pr['branch'], 'body': pr.get('body', ''),
    }))
elif args[:2] == ['pr', 'merge']:
    num = args[2]
    reg = load()
    pr = reg[num]
    work = os.path.join(HERE, 'land-' + num)
    sh(['git', 'clone', '-q', ORIGIN, work])
    sh(['git', '-C', work, 'config', 'user.name', 'gh-stub'])
    sh(['git', '-C', work, 'config', 'user.email', 'stub@test.invalid'])
    sh(['git', '-C', work, 'merge', '--squash', 'origin/' + pr['branch']])
    sh(['git', '-C', work, 'commit', '-q', '-m', pr['branch'] + ' (#' + num + ')'])
    sh(['git', '-C', work, 'push', '-q', 'origin', 'HEAD'])
    pr['state'] = 'MERGED'
    pr['mergedAt'] = '2026-07-17T00:00:00Z'
    save(reg)
elif args[:2] == ['pr', 'comment']:
    with open(os.path.join(HERE, 'comments.log'), 'a') as f:
        f.write(args[2] + ': ' + args[args.index('--body') + 1] + '\\n')
elif args[:2] == ['pr', 'list']:
    print('[]')
elif args[:2] == ['run', 'list']:
    sys.exit(1)  # no workflows -> postMergeRed() treats as green
else:
    sys.exit(1)
`

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

interface World {
  clone: string
  stubDir: string
  deps: DaemonDeps
  daemon: MergeQueueDaemon
  mqDir: string
  registerPr(num: number, branch: string, file: string): void
  enqueue(num: number): void
  originFiles(): string
  states(): Record<string, string>
}

function buildWorld(gateCommand: string): World {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-e2e-'))
  const stubDir = path.join(dir, 'stub')
  fs.mkdirSync(stubDir)
  const origin = path.join(stubDir, 'origin.git')
  const clone = path.join(dir, 'clone')
  execFileSync('git', ['init', '--bare', '-b', 'main', origin])
  execFileSync('git', ['clone', origin, clone], { stdio: 'ignore' })
  sh(clone, 'config', 'user.name', 'e2e')
  sh(clone, 'config', 'user.email', 'e2e@test.invalid')
  fs.writeFileSync(path.join(clone, 'base.txt'), 'base\n')
  sh(clone, 'add', 'base.txt')
  sh(clone, 'commit', '-m', 'base')
  sh(clone, 'push', '-u', 'origin', 'main')
  sh(clone, 'remote', 'set-head', 'origin', 'main')

  const stub = path.join(stubDir, 'gh')
  fs.writeFileSync(stub, GH_STUB)
  fs.chmodSync(stub, 0o755)
  fs.writeFileSync(path.join(stubDir, 'prs.json'), '{}')
  process.env.MQ_GH_CMD = stub

  const mqDir = path.join(clone, '.mq')
  const deps: DaemonDeps = {
    gh: createGhClient(clone),
    git: createGitOps(clone),
    runGate,
    config: { ...defaultMergeQueueConfig(), gate_command: gateCommand, gate_timeout_minutes: 1 },
    mqDir,
    projectRoot: clone,
    log: () => {},
    now: () => new Date(),
  }
  return {
    clone, stubDir, deps, mqDir,
    daemon: new MergeQueueDaemon(deps),
    registerPr(num, branch, file) {
      sh(clone, 'checkout', '-b', branch, 'origin/main')
      fs.writeFileSync(path.join(clone, file), `${branch}\n`)
      sh(clone, 'add', file)
      sh(clone, 'commit', '-m', branch)
      sh(clone, 'push', '-u', 'origin', branch)
      const headSha = sh(clone, 'rev-parse', 'HEAD')
      sh(clone, 'checkout', 'main')
      const reg = JSON.parse(fs.readFileSync(path.join(stubDir, 'prs.json'), 'utf8'))
      reg[String(num)] = { branch, headSha, state: 'OPEN', mergedAt: null, body: '' }
      fs.writeFileSync(path.join(stubDir, 'prs.json'), JSON.stringify(reg))
    },
    enqueue(num) {
      appendEvent(mqDir, { type: 'enqueued', pr: num, at: new Date().toISOString() })
    },
    originFiles() {
      sh(clone, 'fetch', 'origin')
      return sh(clone, 'ls-tree', '--name-only', 'origin/main')
    },
    states() {
      const s = reduceState(readJournal(mqDir))
      return Object.fromEntries([...s.entries.values()].map(e => [String(e.pr), e.state]))
    },
  }
}

describe('merge-queue e2e', () => {
  it('lands a two-PR batch on the real origin and the NRS check holds', { timeout: 60_000 }, () => {
    const w = buildWorld('true')
    w.registerPr(1, 'pr-a', 'a.txt')
    w.registerPr(2, 'pr-b', 'b.txt')
    w.enqueue(1)
    w.enqueue(2)
    expect(w.daemon.cycle()).toBe('worked')
    expect(w.states()).toEqual({ '1': 'LANDED', '2': 'LANDED' })
    expect(w.originFiles()).toContain('a.txt')
    expect(w.originFiles()).toContain('b.txt')
    expect(w.daemon.paused()).toBeNull() // real squash trees matched — the offline Spike-1 twin
  })

  it('ejects a red singleton and comments the log path', { timeout: 60_000 }, () => {
    const w = buildWorld('exit 1')
    w.registerPr(1, 'pr-red', 'r.txt')
    w.enqueue(1)
    w.daemon.cycle()
    expect(w.states()).toEqual({ '1': 'EJECTED' })
    const comments = fs.readFileSync(path.join(w.stubDir, 'comments.log'), 'utf8')
    expect(comments).toContain('EJECTED')
  })

  it('recovers a dead in-flight batch on reconcile', { timeout: 60_000 }, () => {
    const w = buildWorld('true')
    w.registerPr(1, 'pr-crash', 'c.txt')
    w.enqueue(1)
    const at = new Date().toISOString()
    appendEvent(w.mqDir, { type: 'batch_created', batchId: 'dead', members: [1], at })
    appendEvent(w.mqDir, { type: 'pr_state', pr: 1, state: 'TESTING', batchId: 'dead', at })
    appendEvent(w.mqDir, { type: 'batch_state', batchId: 'dead', state: 'RUNNING', at })
    w.daemon.reconcile()
    expect(w.states()).toEqual({ '1': 'REQUEUED_SPLIT' })
    // and the next cycle lands it
    expect(w.daemon.cycle()).toBe('worked')
    expect(w.states()).toEqual({ '1': 'LANDED' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails or passes honestly**

Run: `npx vitest run tests/merge-queue-e2e.test.ts`
Expected on first run after Tasks 2–12: PASS. If any test fails, that is the harness doing its job — debug the daemon (`superpowers:systematic-debugging`), do NOT weaken assertions. Two known environmental requirements: `python3` on PATH (macOS ships it) and `git` ≥2.31 (`--path-format=absolute` in `primaryRoot()`).

- [ ] **Step 3: Confirm the full suite is green**

Run: `npm run check`
Expected: lint + type-check + all vitest suites PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/merge-queue-e2e.test.ts
git commit -m "test(mq): e2e harness — real git origin + gh stub, land/eject/recover"
```

### Task 14: Docs, changelog, final gate

**Files:**
- Modify: `CLAUDE.md` (Key Commands table)
- Modify: `CHANGELOG.md` (Unreleased section)

**Interfaces:**
- Consumes: everything shipped in Tasks 1–13.
- Produces: the repo-facing record. (Generated-project docs are Plan 3's job, NOT this task.)

- [ ] **Step 1: Add Key Commands rows to CLAUDE.md**

Append to the Key Commands table (after the `mmr review --channels` row):

```markdown
| `scaffold mq enqueue --pr <N>` | Enqueue a PR into the local merge queue (fire-and-forget; auto-starts the daemon) |
| `scaffold mq daemon --foreground` | Run the merge-queue daemon in the foreground (debugging) |
| `scaffold mq status [--pr <N>] [--format json]` | Show queue state, paused banner, per-PR states |
| `scaffold mq eject --pr <N>` | Withdraw a PR from the queue |
| `scaffold mq stats` | Calibration metrics: arrivals, gate outcomes, median gate time, flakes |
```

- [ ] **Step 2: Add the CHANGELOG entry**

Under `## [Unreleased]` (create the section at the top if absent):

```markdown
### Added
- `scaffold mq` — local batching merge-queue engine for multi-agent projects:
  fire-and-forget enqueue, bors-style batch-then-bisect testing, flake retry with
  auto-quarantine, squash landing with the Not-Rocket-Science tree assertion,
  JSONL write-ahead journal with crash recovery, `mq:ready` label seam for remote
  agents. Spec: `docs/superpowers/specs/2026-07-17-merge-throughput-design.md`
  (Plan 1 of 3; agent-ops component + pipeline content land in follow-ups).
```

- [ ] **Step 3: Run the full repo gate**

Run: `make check-all`
Expected: bash gates (lint/validate/test/eval) + TypeScript gates all PASS. Fix anything red before proceeding (ShellCheck covers `scripts/spikes/squash-tree-spike.sh`).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs(mq): key commands + changelog for the merge-queue engine"
```

---

## Execution notes

- **Task order is dependency order**: 1 → 2 → 3 → 4 → (5–9 in any order) → 10 → 11 → 12 → 13 → 14. Tasks 5–9 are independent of each other and safe to parallelize across subagents.
- **One batch-cap knob, not two**: the spec's §5.1 "batch caps (8 full-gate / 16 affected-gate)" collapses to a single `merge_queue.batch_cap` (default 16, the affected-gate value) — a project whose `gate_command` is the full gate sets `batch_cap: 8` in `.scaffold/agent-ops.yaml`. Plan 3's generated docs state this. `full_gate_command` is carried in the config contract for Plan 2's local-poller and post-merge parity, not consumed by the daemon.
- **Spike 1 (Task 1) is a hard gate**: if it reports MISMATCH, Task 10's `land()` must instead push the candidate ref to the default branch and close PRs with a comment (D9 fallback) — stop and surface to the user before implementing that variant.
- The daemon deliberately checks base movement *after* the gate rather than polling mid-gate (spec §5.2 step 6 outcome is identical: the batch is rebuilt; we only lose the wasted gate minutes). `mq stats` will show whether mid-gate abort polling is worth adding later — YAGNI now.
- Nothing in this plan touches `content/` or generated projects; a scaffold release at the end of Plan 1 is possible but pointless — ship after Plan 2/3 wire it into projects.
- After this plan completes: run `mmr review` per the repo's mandatory-review flow when the PR opens (the PR should cover Plans 1–3 together or per-plan PRs — decided at execution time with the user).



