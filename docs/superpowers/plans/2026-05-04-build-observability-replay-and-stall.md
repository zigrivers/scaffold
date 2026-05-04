# Build Observability — Replay + Stall Implementation Plan (Plan 5 of N)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the fused replay timeline (`scaffold observe progress --replay`) and stall detection ("Needs Attention" surface) on top of Plans 1-4. The replay merges ledger events with synthesized events from git/gh/mmr/state/tests adapters using `correlation_id` for cross-source dedupe and `(ts, source_priority, sort_id)` for ordering. Stall detection runs at every command-execution boundary, surfaces in all three renderers, and consumes Plan 4's `lensSkippedStreaks` for the `lens_skipped_repeatedly` signal. Also lands the Lens G keyword-commit scan deferred from Plan 3.

**Architecture:** Each source adapter gains a `replayEvents()` method that returns `ReplayEvent[]` for a time window. A new `src/observability/engine/replay.ts` composer fuses them with the ledger event stream, applies `correlation_id` dedupe (ledger > mmr > gh > git > state > tests source priority), sorts by `(ts, source_priority, sort_id)`, and produces a `ReplayTimeline`. A new `src/observability/engine/stall.ts` evaluator takes the merged timeline + audit-history's `lensSkippedStreaks` + the latest audit sidecar's findings, and returns `NeedsAttentionItem[]`. Both are integrated into `runProgress`; the CLI gains `--replay` and `--no-stall-check` flags. The renderers (terminal, markdown, dashboard) gain replay sections and a "Needs Attention" surface.

**Tech Stack:** TypeScript (vitest, no new runtime deps — `minimatch` and `js-yaml` already pulled in by Plans 2+3), bats-core for end-to-end tests.

**Spec:** [`docs/superpowers/specs/2026-04-30-build-observability-design.md`](../specs/2026-04-30-build-observability-design.md)

**Depends on:** Plans 1, 2, 3, 4. Plan 5 reuses Plan 1's `ReplayEvent` and `NeedsAttentionItem` types (already in `engine/types.ts` from Plan 1 Task 1), Plan 4's `audit-history.lensSkippedStreaks()`, and the `progress_heartbeat` event type already validated by Plan 1's writer. It does not modify the `EngineOutput` shape.

**Subsequent plans:** Plan 6 — phase-boundary triggers + StateManager.markCompleted refactor. Plan 7 — MMR doc-conformance channel + Lens H full-profile LLM checks. Plan 8 — `--fix` flow + worktree teardown.

---

## Pre-flight

```bash
test -f src/observability/renderers/markdown.ts && \
  test -f src/observability/renderers/dashboard.ts && \
  test -f src/observability/renderers/sidecar.ts && \
  test -f src/observability/checks/lens-g-decisions.ts && \
  echo "Plans 1-4 present" || echo "missing — abort"
```

Worktree (recommended):

```bash
scripts/setup-agent-worktree.sh observability-replay-stall
cd ../scaffold-observability-replay-stall
```

No new dependencies.

---

## File Structure

```
src/observability/engine/
  replay.ts                      replay.test.ts             (new) composeReplay + dedupe
  stall.ts                       stall.test.ts              (new) evaluator over timeline + audit history
  api.ts                         (modify) wire replay + stall into runProgress

src/observability/adapters/
  git.ts                         (modify) add replayEvents()
  gh.ts                          (modify) add replayEvents() with correlation_id
  mmr.ts                         (modify) add replayEvents()
  state.ts                       (modify) add replayEvents()
  tests.ts                       (modify) add replayEvents()

src/observability/checks/
  lens-g-decisions.ts            (modify) implement decision-keyword commit scan (deferred from Plan 3)
  lens-g-decisions.test.ts       (modify) cover the new sub-check

src/observability/renderers/
  terminal.ts                    (modify) renderProgressTerminal extends with replay + needs-attention
  markdown.ts                    (modify) renderProgressMarkdown extends similarly
  dashboard.ts                   (modify) renderProgressFragment extends similarly
  _lib.ts                        (modify) shared "needs attention" formatter

src/cli/commands/observe.ts      (modify) --replay + --no-stall-check flags
src/cli/index.ts                 (modify) register the new flags
tests/observability/audit.bats   (modify) bats coverage for replay + needs-attention
```

---

## Task 1: Stall evaluator (pure function over timeline + audit history)

**Files:**
- Create: `src/observability/engine/stall.ts`
- Create: `src/observability/engine/stall.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/stall.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { evaluateStall } from './stall'
import type { Event, ReplayEvent, Finding } from './types'
import { DEFAULT_CONFIG } from './checks/observability-config'

const NOW = '2026-05-04T14:00:00Z'

function ledgerTaskClaimed(taskId: string, ts: string, actor = 'agent-alice'): Event {
  return {
    event_id: `ulid-${taskId}-${ts}`, worktree_id: 'wid-1', actor_label: actor,
    branch: 'feat', task_id: taskId, type: 'task_claimed', ts,
    payload: { task_title: taskId },
  } as Event
}
function ledgerHeartbeat(taskId: string, ts: string): Event {
  return {
    event_id: `ulid-hb-${ts}`, worktree_id: 'wid-1', actor_label: 'agent-alice',
    branch: 'feat', task_id: taskId, type: 'progress_heartbeat', ts,
    payload: { note: 'still working' },
  } as Event
}
function ledgerPrOpened(prNum: number, ts: string): Event {
  return {
    event_id: `ulid-pr-${prNum}-${ts}`, worktree_id: 'wid-1', actor_label: 'agent-alice',
    branch: 'feat', task_id: null, type: 'pr_opened', ts,
    payload: { pr_number: prNum },
  } as Event
}
function ledgerBlockerHit(taskId: string, ts: string): Event {
  return {
    event_id: `ulid-bh-${ts}`, worktree_id: 'wid-1', actor_label: 'agent-alice',
    branch: 'feat', task_id: taskId, type: 'blocker_hit', ts,
    payload: { kind: 'external', summary: 'vendor outage' },
  } as Event
}
function commitReplayEvent(sha: string, ts: string): ReplayEvent {
  return { sort_id: `git:${sha}`, correlation_id: null, ts, source: 'git', kind: 'commit', summary: 'work', actor_label: 'agent-alice' }
}
function prMergedReplayEvent(prNum: number, ts: string): ReplayEvent {
  return { sort_id: `gh:${prNum}:merged`, correlation_id: `pr:${prNum}:merged`, ts, source: 'gh', kind: 'pr_merged', summary: `PR #${prNum} merged` }
}

describe('evaluateStall', () => {
  it('emits task_stale when task_claimed has no commits or completion past threshold', () => {
    const events = [ledgerTaskClaimed('T-001', '2026-05-04T08:00:00Z')] // 6h ago, threshold is 4h
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: [], findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    const stale = items.find((i) => i.signal === 'task_stale')
    expect(stale).toBeDefined()
    expect(stale?.ref.id).toBe('T-001')
    expect(stale?.age_hours).toBeGreaterThanOrEqual(6)
  })

  it('does not emit task_stale when a heartbeat is recent', () => {
    const events = [
      ledgerTaskClaimed('T-001', '2026-05-04T08:00:00Z'),
      ledgerHeartbeat('T-001', '2026-05-04T13:30:00Z'),  // 30 min ago
    ]
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: [], findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'task_stale')).toBeUndefined()
  })

  it('does not emit task_stale when commits are present on the branch since claim', () => {
    const events = [ledgerTaskClaimed('T-001', '2026-05-04T08:00:00Z')]
    const replay = [commitReplayEvent('abc', '2026-05-04T13:30:00Z')]
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: replay, findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'task_stale')).toBeUndefined()
  })

  it('emits pr_stale when pr_opened has no merge/commits past threshold', () => {
    const events = [ledgerPrOpened(42, '2026-05-02T00:00:00Z')] // 60h ago, threshold 48h
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: [], findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'pr_stale')).toBeDefined()
  })

  it('does not emit pr_stale when the PR has been merged', () => {
    const events = [ledgerPrOpened(42, '2026-05-02T00:00:00Z')]
    const replay = [prMergedReplayEvent(42, '2026-05-03T00:00:00Z')]
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: replay, findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'pr_stale')).toBeUndefined()
  })

  it('emits blocker_unaddressed when blocker_hit has no resolution past threshold', () => {
    const events = [ledgerBlockerHit('T-001', '2026-05-04T11:00:00Z')] // 3h ago, threshold 2h
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: [], findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'blocker_unaddressed')).toBeDefined()
  })

  it('emits audit_findings_unresolved when findings above threshold are open past 24h', () => {
    const oldFinding: Finding = {
      id: 'f1', lens_id: 'A-tdd', severity: 'P0',
      title: 't', description: 'd', source_doc: '',
      evidence: { kind: 'rule_violation', rule_id: 'r', file: 'f' },
      confidence: 'high',
      first_seen: '2026-05-03T00:00:00Z',  // 38h ago
      last_seen: '2026-05-04T13:00:00Z',
      status: 'open',
    }
    const items = evaluateStall({ now: NOW, ledgerEvents: [], replayEvents: [], findings: [oldFinding], config: DEFAULT_CONFIG, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'audit_findings_unresolved')).toBeDefined()
  })

  it('emits lens_skipped_repeatedly when a lens streak is ≥ 3', () => {
    const items = evaluateStall({ now: NOW, ledgerEvents: [], replayEvents: [], findings: [], config: DEFAULT_CONFIG, lensSkippedStreaks: { 'B-ac-coverage': 4 } })
    expect(items.find((i) => i.signal === 'lens_skipped_repeatedly')).toBeDefined()
  })

  it('does not emit a signal when its threshold is configured "off"', () => {
    const events = [ledgerTaskClaimed('T-001', '2026-05-04T08:00:00Z')]
    const config = { ...DEFAULT_CONFIG, stall: { ...DEFAULT_CONFIG.stall, task_stale: 'off' as const } }
    const items = evaluateStall({ now: NOW, ledgerEvents: events, replayEvents: [], findings: [], config, lensSkippedStreaks: {} })
    expect(items.find((i) => i.signal === 'task_stale')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/stall.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `stall.ts`**

Create `src/observability/engine/stall.ts`:

```typescript
import type { Event, ReplayEvent, Finding, NeedsAttentionItem, Severity } from './types'
import { severityRank } from './types'
import type { ObservabilityConfig } from './checks/observability-config'

export interface EvaluateStallInput {
  now: string
  ledgerEvents: Event[]
  replayEvents: ReplayEvent[]
  findings: Finding[]
  config: ObservabilityConfig
  lensSkippedStreaks: Record<string, number>
  fixThreshold?: Severity   // default P2
}

function parseHours(s: string | 'off' | undefined): number | null {
  if (!s || s === 'off') return null
  const m = s.match(/^(\d+(?:\.\d+)?)([hd])$/)
  if (!m) return null
  const n = Number(m[1])
  return m[2] === 'd' ? n * 24 : n
}

function ageHours(now: string, ts: string): number {
  return Math.max(0, (Date.parse(now) - Date.parse(ts)) / 3_600_000)
}

function round1(n: number): number { return Math.round(n * 10) / 10 }

export function evaluateStall(input: EvaluateStallInput): NeedsAttentionItem[] {
  const out: NeedsAttentionItem[] = []
  const now = input.now

  // Index ledger events by task and PR
  const lastClaimByTask = new Map<string, Event>()
  const lastResolutionByTask = new Map<string, Event>()
  const lastHeartbeatByTask = new Map<string, Event>()
  const openBlockersByTask = new Map<string, Event>()
  const prOpenedById = new Map<number, Event>()

  for (const e of input.ledgerEvents) {
    if (e.type === 'task_claimed' && e.task_id) {
      lastClaimByTask.set(e.task_id, e)
    } else if (e.type === 'task_completed' && e.task_id) {
      lastResolutionByTask.set(e.task_id, e)
    } else if (e.type === 'progress_heartbeat' && e.task_id) {
      const prev = lastHeartbeatByTask.get(e.task_id)
      if (!prev || prev.ts < e.ts) lastHeartbeatByTask.set(e.task_id, e)
    } else if (e.type === 'blocker_hit') {
      if (e.task_id) openBlockersByTask.set(e.task_id, e)
    } else if (e.type === 'blocker_resolved') {
      // Most recent resolution for any open blocker on the same task
      if (e.task_id) openBlockersByTask.delete(e.task_id)
    } else if (e.type === 'pr_opened') {
      const pn = (e.payload as { pr_number: number }).pr_number
      prOpenedById.set(pn, e)
    }
  }

  // Helper: latest commit ts on a given branch (from replay events) since a reference time
  function latestCommitOnBranchSince(branch: string, since: string): string | null {
    let latest: string | null = null
    for (const r of input.replayEvents) {
      if (r.source !== 'git' || r.kind !== 'commit') continue
      if (r.ts <= since) continue
      if (latest === null || r.ts > latest) latest = r.ts
    }
    return latest
  }

  // task_stale
  const taskStaleH = parseHours(input.config.stall.task_stale)
  if (taskStaleH !== null) {
    for (const [taskId, claim] of lastClaimByTask) {
      if (lastResolutionByTask.has(taskId)) continue
      const heartbeat = lastHeartbeatByTask.get(taskId)?.ts
      const branchCommit = latestCommitOnBranchSince(claim.branch, claim.ts)
      const lastActivityTs = [claim.ts, heartbeat, branchCommit].filter((x): x is string => Boolean(x)).sort().pop()!
      const age = ageHours(now, lastActivityTs)
      if (age <= taskStaleH) continue
      out.push({
        signal: 'task_stale',
        ref: { kind: 'task', id: taskId },
        age_hours: round1(age),
        threshold_hours: taskStaleH,
        summary: `task ${taskId} (${claim.actor_label}) claimed ${round1(age)}h ago, no recent activity`,
      })
    }
  }

  // pr_stale
  const prStaleH = parseHours(input.config.stall.pr_stale)
  if (prStaleH !== null) {
    for (const [pn, opened] of prOpenedById) {
      // Was the PR merged or closed since open?
      const merged = input.replayEvents.find((r) => r.source === 'gh' && r.correlation_id === `pr:${pn}:merged` && r.ts > opened.ts)
      const closed = input.replayEvents.find((r) => r.source === 'gh' && r.kind === 'pr_closed' && r.correlation_id === `pr:${pn}:closed` && r.ts > opened.ts)
      if (merged || closed) continue
      const age = ageHours(now, opened.ts)
      if (age <= prStaleH) continue
      out.push({
        signal: 'pr_stale',
        ref: { kind: 'pr', id: String(pn) },
        age_hours: round1(age),
        threshold_hours: prStaleH,
        summary: `PR #${pn} opened ${round1(age)}h ago, not merged or closed`,
      })
    }
  }

  // pr_review_stale — pr_opened with no successful MMR job since
  const prReviewStaleH = parseHours(input.config.stall.pr_review_stale)
  if (prReviewStaleH !== null) {
    for (const [pn, opened] of prOpenedById) {
      const mmrSince = input.replayEvents.find((r) => r.source === 'mmr' && r.kind === 'job_completed' && r.ts > opened.ts)
      if (mmrSince) continue
      const age = ageHours(now, opened.ts)
      if (age <= prReviewStaleH) continue
      out.push({
        signal: 'pr_review_stale',
        ref: { kind: 'pr', id: String(pn) },
        age_hours: round1(age),
        threshold_hours: prReviewStaleH,
        summary: `PR #${pn} has no completed MMR review in ${round1(age)}h`,
      })
    }
  }

  // blocker_unaddressed
  const blockerH = parseHours(input.config.stall.blocker_unaddressed)
  if (blockerH !== null) {
    for (const [taskId, blocker] of openBlockersByTask) {
      const age = ageHours(now, blocker.ts)
      if (age <= blockerH) continue
      const summary = (blocker.payload as { summary?: string }).summary ?? '(no summary)'
      out.push({
        signal: 'blocker_unaddressed',
        ref: { kind: 'task', id: taskId },
        age_hours: round1(age),
        threshold_hours: blockerH,
        summary: `${taskId} blocked ${round1(age)}h: ${summary}`,
      })
    }
  }

  // audit_findings_unresolved — findings above threshold, status=open, first_seen > threshold ago
  const findingsH = parseHours(input.config.stall.audit_findings_unresolved)
  const fixThreshold = input.fixThreshold ?? 'P2'
  if (findingsH !== null) {
    for (const f of input.findings) {
      if (f.status !== 'open') continue
      if (severityRank(f.severity) > severityRank(fixThreshold)) continue
      const age = ageHours(now, f.first_seen)
      if (age <= findingsH) continue
      out.push({
        signal: 'audit_findings_unresolved',
        ref: { kind: 'finding', id: f.id },
        age_hours: round1(age),
        threshold_hours: findingsH,
        summary: `${f.severity} finding [${f.id.slice(0, 8)}] open ${round1(age)}h: ${f.title}`,
      })
    }
  }

  // lens_skipped_repeatedly — streak ≥ 3, threshold not configurable ("always trips on 3rd" per spec)
  for (const [lensId, streak] of Object.entries(input.lensSkippedStreaks)) {
    if (streak < 3) continue
    out.push({
      signal: 'lens_skipped_repeatedly',
      ref: { kind: 'lens', id: lensId },
      age_hours: 0,                     // n/a — streak-based, not time-based
      threshold_hours: 3,               // streak count, surfaced via the same field for renderer simplicity
      summary: `lens ${lensId} skipped for ${streak} consecutive audits`,
    })
  }

  return out
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/stall.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/stall.ts src/observability/engine/stall.test.ts
git commit -m "observability: stall evaluator (task_stale, pr_stale, pr_review_stale, blocker_unaddressed, audit_findings_unresolved, lens_skipped_repeatedly)"
```

---

## Task 2: Git adapter — `replayEvents()` for commits

**Files:**
- Modify: `src/observability/adapters/git.ts`
- Modify: `src/observability/adapters/git.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/adapters/git.test.ts`:

```typescript
describe('git adapter — replayEvents', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-git-rep-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: dir, shell: '/bin/sh' })
    writeFileSync(join(dir, 'a.txt'), '1\n')
    execSync('git add a.txt && git commit -q -m "first"', { cwd: dir, shell: '/bin/sh' })
    writeFileSync(join(dir, 'b.txt'), '1\n')
    execSync('git add b.txt && git commit -q -m "second"', { cwd: dir, shell: '/bin/sh' })
  })
  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns ReplayEvent[] for commits in the time window', async () => {
    const events = await gitAdapter.replayEvents(dir, { sinceHours: 24 })
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events[0].source).toBe('git')
    expect(events[0].kind).toBe('commit')
    expect(events[0].sort_id).toMatch(/^git:[0-9a-f]{40}$/)
    expect(events[0].correlation_id).toBeNull()
    expect(events[0].summary.length).toBeGreaterThan(0)
    expect(typeof events[0].link).toBe('string')   // commit sha or anchor
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/git.test.ts
```

Expected: FAIL — `replayEvents` not exported.

- [ ] **Step 3: Add `replayEvents` to git adapter**

In `src/observability/adapters/git.ts`, append to the `gitAdapter` definition:

```typescript
import type { ReplayEvent } from '../engine/types'

export const gitAdapter: BaseAdapter & {
  // ... existing methods
  replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]>
} = {
  // ... existing fields and methods

  async replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]> {
    const commits = await gitAdapter.recentCommits(cwd, opts)
    return commits.map((c) => ({
      sort_id: `git:${c.sha}`,
      correlation_id: null,
      ts: c.ts,
      source: 'git' as const,
      kind: 'commit',
      actor_label: c.author,
      summary: `${c.subject.slice(0, 200)} (${c.sha.slice(0, 7)})`,
      link: c.sha,
    }))
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/git.test.ts
```

Expected: PASS, all git adapter tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/git.ts src/observability/adapters/git.test.ts
git commit -m "observability: git adapter — replayEvents() for commits"
```

---

## Task 3: GH adapter — `replayEvents()` for PR open + merge with `correlation_id`

**Files:**
- Modify: `src/observability/adapters/gh.ts`
- Modify: `src/observability/adapters/gh.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/adapters/gh.test.ts`:

```typescript
describe('gh adapter — replayEvents', () => {
  it('returns [] when gh is unavailable (no throw)', async () => {
    const events = await ghAdapter.replayEvents('.', { sinceHours: 24, ghBin: '/no/such/gh' })
    expect(events).toEqual([])
  })

  it('shapes PR open + merge events with correlation_id pr:<n>:opened|merged', async () => {
    // Stub gh with a fake binary that emits canned JSON. We use the same shell-based stubbing pattern
    // as the other gh tests in this file; here, the canned JSON is one open PR + one merged PR.
    const stub = `cat <<'EOF'
[
  { "number": 42, "url": "https://example/pr/42", "state": "open",   "headRefName": "feat-a", "createdAt": "2026-05-04T09:00:00Z" },
  { "number": 41, "url": "https://example/pr/41", "state": "merged", "headRefName": "feat-b", "createdAt": "2026-05-03T09:00:00Z", "mergedAt": "2026-05-03T18:00:00Z" }
]
EOF`
    // We can't easily inject custom argv per-call here; instead test the mapping with a hand-built input via a helper.
    // (Implementation calls listOpenPRs + listMergedPRs internally — the next test exercises the mapping.)
    expect(typeof ghAdapter.replayEvents).toBe('function')
    void stub
  })

  it('maps a fixture PrInfo[] into ReplayEvents with correct correlation_ids', () => {
    const prs = [
      { number: 42, url: 'https://example/pr/42', state: 'open' as const, branch: 'feat-a', opened_at: '2026-05-04T09:00:00Z' },
      { number: 41, url: 'https://example/pr/41', state: 'merged' as const, branch: 'feat-b', opened_at: '2026-05-03T09:00:00Z', merged_at: '2026-05-03T18:00:00Z' },
    ]
    const events = ghAdapter._prsToReplayEvents(prs, { sinceHours: 24 })
    const open = events.find((e) => e.kind === 'pr_opened' && e.correlation_id === 'pr:42:opened')
    const merged = events.find((e) => e.kind === 'pr_merged' && e.correlation_id === 'pr:41:merged')
    expect(open).toBeDefined()
    expect(merged).toBeDefined()
    expect(open?.sort_id).toBe('gh:42:opened')
    expect(merged?.sort_id).toBe('gh:41:merged')
    expect(open?.link).toBe('https://example/pr/42')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/gh.test.ts
```

Expected: FAIL — `replayEvents` and `_prsToReplayEvents` not exported.

- [ ] **Step 3: Add `replayEvents` + helper to gh adapter**

In `src/observability/adapters/gh.ts`:

```typescript
import type { ReplayEvent } from '../engine/types'

export const ghAdapter: BaseAdapter & {
  // ... existing methods
  replayEvents(cwd: string, opts: { sinceHours: number; ghBin?: string }): Promise<ReplayEvent[]>
  _prsToReplayEvents(prs: PrInfo[], opts: { sinceHours: number }): ReplayEvent[]
} = {
  // ... existing fields and methods

  _prsToReplayEvents(prs: PrInfo[], opts: { sinceHours: number }): ReplayEvent[] {
    const cutoff = new Date(Date.now() - opts.sinceHours * 3_600_000).toISOString()
    const out: ReplayEvent[] = []
    for (const p of prs) {
      if (p.opened_at >= cutoff) {
        out.push({
          sort_id: `gh:${p.number}:opened`,
          correlation_id: `pr:${p.number}:opened`,
          ts: p.opened_at, source: 'gh', kind: 'pr_opened',
          summary: `PR #${p.number} opened on ${p.branch}`,
          link: p.url,
        })
      }
      if (p.state === 'merged' && p.merged_at && p.merged_at >= cutoff) {
        out.push({
          sort_id: `gh:${p.number}:merged`,
          correlation_id: `pr:${p.number}:merged`,
          ts: p.merged_at, source: 'gh', kind: 'pr_merged',
          summary: `PR #${p.number} merged`,
          link: p.url,
        })
      }
    }
    return out
  },

  async replayEvents(cwd: string, opts: { sinceHours: number; ghBin?: string }): Promise<ReplayEvent[]> {
    const probe = await ghAdapter.probe(cwd, { ghBin: opts.ghBin })
    if (probe.status === 'unavailable') return []
    // Reuse listOpenPRs to get open PRs; merged PRs require a separate query.
    const open = await ghAdapter.listOpenPRs(cwd, { ghBin: opts.ghBin })
    let merged: PrInfo[] = []
    try {
      const bin = opts.ghBin ?? 'gh'
      const since = new Date(Date.now() - opts.sinceHours * 3_600_000).toISOString().slice(0, 10)
      const { stdout } = await execFile(bin, [
        'pr', 'list', '--state', 'merged', '--search', `merged:>=${since}`, '--json',
        'number,url,state,headRefName,createdAt,mergedAt',
      ], { cwd })
      merged = (JSON.parse(stdout) as Array<{ number: number; url: string; state: string; headRefName: string; createdAt: string; mergedAt?: string }>)
        .map((p) => ({ number: p.number, url: p.url, state: 'merged', branch: p.headRefName, opened_at: p.createdAt, merged_at: p.mergedAt }))
    } catch { /* gh not authed for the merged query, fall through */ }
    return ghAdapter._prsToReplayEvents([...open, ...merged], opts)
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/gh.test.ts
```

Expected: PASS, all gh adapter tests including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/gh.ts src/observability/adapters/gh.test.ts
git commit -m "observability: gh adapter — replayEvents with correlation_id (pr_opened + pr_merged)"
```

---

## Task 4: MMR adapter — `replayEvents()` for completed jobs

**Files:**
- Modify: `src/observability/adapters/mmr.ts`
- Modify: `src/observability/adapters/mmr.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/adapters/mmr.test.ts`:

```typescript
describe('mmr adapter — replayEvents', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-mmr-rep-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns ReplayEvent[] for completed MMR jobs', async () => {
    const a = join(dir, '.mmr/jobs/job-a'); mkdirSync(a, { recursive: true })
    writeFileSync(join(a, 'result.json'), JSON.stringify({ verdict: 'pass', completed_at: '2026-05-04T13:00:00Z', fix_threshold: 'P2' }))
    const b = join(dir, '.mmr/jobs/job-b'); mkdirSync(b, { recursive: true })
    writeFileSync(join(b, 'result.json'), JSON.stringify({ verdict: 'blocked', completed_at: '2026-05-04T12:00:00Z' }))
    const events = await mmrAdapter.replayEvents(dir, { sinceHours: 24 })
    expect(events).toHaveLength(2)
    expect(events[0].source).toBe('mmr')
    expect(events[0].kind).toBe('job_completed')
    expect(events.find((e) => e.sort_id === 'mmr:job-a')?.summary).toContain('pass')
    expect(events.find((e) => e.sort_id === 'mmr:job-b')?.summary).toContain('blocked')
  })

  it('returns [] when no jobs in window', async () => {
    expect(await mmrAdapter.replayEvents(dir, { sinceHours: 24 })).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/mmr.test.ts
```

Expected: FAIL — `replayEvents` not exported.

- [ ] **Step 3: Add `replayEvents` to mmr adapter**

Append to `src/observability/adapters/mmr.ts`:

```typescript
import type { ReplayEvent } from '../engine/types'

export const mmrAdapter: BaseAdapter & {
  // ... existing methods
  replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]>
} = {
  // ... existing fields and methods

  async replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]> {
    const dir = join(cwd, JOBS_DIR)
    if (!existsSync(dir)) return []
    const cutoff = new Date(Date.now() - opts.sinceHours * 3_600_000).toISOString()
    const out: ReplayEvent[] = []
    for (const sub of readdirSync(dir)) {
      const p = join(dir, sub, 'result.json')
      if (!existsSync(p)) continue
      let job: MmrJobResult
      try { job = JSON.parse(readFileSync(p, 'utf8')) as MmrJobResult } catch { continue }
      if (!job.completed_at || job.completed_at < cutoff) continue
      out.push({
        sort_id: `mmr:${sub}`,
        correlation_id: null,
        ts: job.completed_at,
        source: 'mmr', kind: 'job_completed',
        summary: `MMR job ${sub} verdict=${job.verdict}`,
      })
    }
    return out
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/mmr.test.ts
```

Expected: PASS, all mmr adapter tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/mmr.ts src/observability/adapters/mmr.test.ts
git commit -m "observability: mmr adapter — replayEvents (job_completed in window)"
```

---

## Task 5: State adapter — `replayEvents()` for step transitions

**Files:**
- Modify: `src/observability/adapters/state.ts`
- Modify: `src/observability/adapters/state.test.ts`

`.scaffold/state.json` doesn't natively timestamp transitions. To produce replay events, we read the file's mtime as a coarse "last touched" timestamp and emit one event per step in `completed`/`in_progress` status. This is degraded data — Plan 6 introduces a real per-step timestamp via the StateManager refactor — but it's enough to surface the synthetic source in the timeline.

- [ ] **Step 1: Append the failing test**

Append to `src/observability/adapters/state.test.ts`:

```typescript
describe('state adapter — replayEvents', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-st-rep-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns ReplayEvents for completed and in_progress steps using state.json mtime', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/state.json'), JSON.stringify({
      version: '1.0', methodology: 'deep',
      steps: {
        'user-stories':       { status: 'completed',   source: 'pipeline' },
        'tech-stack':         { status: 'in_progress', source: 'pipeline' },
        'coding-standards':   { status: 'pending',     source: 'pipeline' },
      },
    }))
    const events = await stateAdapter.replayEvents(dir, { sinceHours: 24 })
    const slugs = events.map((e) => e.kind)
    expect(slugs).toContain('step_completed')
    expect(slugs).toContain('step_in_progress')
    expect(slugs).not.toContain('step_pending')
    expect(events[0].source).toBe('state')
    expect(events.find((e) => e.kind === 'step_completed')?.sort_id).toBe('state:user-stories:completed')
  })

  it('returns [] when state.json does not exist', async () => {
    expect(await stateAdapter.replayEvents(dir, { sinceHours: 24 })).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/state.test.ts
```

Expected: FAIL — `replayEvents` not exported.

- [ ] **Step 3: Add `replayEvents` to state adapter**

Append to `src/observability/adapters/state.ts`:

```typescript
import type { ReplayEvent } from '../engine/types'

export const stateAdapter: BaseAdapter & {
  // ... existing methods
  replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]>
} = {
  // ... existing fields and methods

  async replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]> {
    const path = join(cwd, ROOT_STATE)
    if (!existsSync(path)) return []
    const mtimeIso = statSync(path).mtime.toISOString()
    const cutoff = new Date(Date.now() - opts.sinceHours * 3_600_000).toISOString()
    if (mtimeIso < cutoff) return []
    const merged = await stateAdapter.readMergedState(cwd)
    const out: ReplayEvent[] = []
    for (const [slug, entry] of Object.entries(merged.steps)) {
      if (entry.status !== 'completed' && entry.status !== 'in_progress') continue
      const kind = entry.status === 'completed' ? 'step_completed' : 'step_in_progress'
      out.push({
        sort_id: `state:${slug}:${entry.status}`,
        correlation_id: null,
        ts: mtimeIso,
        source: 'state', kind,
        summary: `pipeline step ${slug} → ${entry.status}`,
      })
    }
    return out
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/state.test.ts
```

Expected: PASS, all state adapter tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/state.ts src/observability/adapters/state.test.ts
git commit -m "observability: state adapter — replayEvents (step_completed + step_in_progress; mtime-based)"
```

---

## Task 6: Tests adapter — `replayEvents()` for cached runs

**Files:**
- Modify: `src/observability/adapters/tests.ts`
- Modify: `src/observability/adapters/tests.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/adapters/tests.test.ts`:

```typescript
describe('tests adapter — replayEvents', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-t-rep-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns one ReplayEvent per cached test run (failed runs noted)', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/last-test-run.json'), JSON.stringify({
      ran_at: '2026-05-04T13:00:00Z',
      passed: 100, failed: 2,
      results: [
        { name: 'login passes', file_path: 'src/a.test.ts', status: 'passing' },
        { name: 'reset broken', file_path: 'src/b.test.ts', status: 'failing' },
      ],
    }))
    const events = await testsAdapter.replayEvents(dir, { sinceHours: 24 })
    expect(events).toHaveLength(2) // run + first-failure summary
    const run = events.find((e) => e.kind === 'test_run_completed')
    const failure = events.find((e) => e.kind === 'test_run_failed')
    expect(run).toBeDefined()
    expect(failure).toBeDefined()
    expect(run?.summary).toContain('100 passed')
    expect(failure?.summary).toContain('reset broken')
  })

  it('returns [] when no cached run exists', async () => {
    expect(await testsAdapter.replayEvents(dir, { sinceHours: 24 })).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/tests.test.ts
```

Expected: FAIL — `replayEvents` not exported.

- [ ] **Step 3: Add `replayEvents` to tests adapter**

Append to `src/observability/adapters/tests.ts`:

```typescript
import type { ReplayEvent } from '../engine/types'

export const testsAdapter: BaseAdapter & {
  // ... existing methods
  replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]>
} = {
  // ... existing fields and methods

  async replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]> {
    const run = await testsAdapter.lastRun(cwd)
    if (!run) return []
    const cutoff = new Date(Date.now() - opts.sinceHours * 3_600_000).toISOString()
    if (run.ran_at < cutoff) return []
    const out: ReplayEvent[] = [{
      sort_id: `tests:run:${run.ran_at}`,
      correlation_id: null,
      ts: run.ran_at,
      source: 'tests', kind: 'test_run_completed',
      summary: `tests: ${run.passed} passed, ${run.failed} failed`,
    }]
    if (run.failed > 0) {
      const firstFail = run.results.find((r) => r.status === 'failing')
      if (firstFail) {
        out.push({
          sort_id: `tests:fail:${firstFail.file_path}:${firstFail.name}`,
          correlation_id: null,
          ts: run.ran_at,
          source: 'tests', kind: 'test_run_failed',
          summary: `failing: ${firstFail.name} (${firstFail.file_path})`,
        })
      }
    }
    return out
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/tests.test.ts
```

Expected: PASS, all tests adapter tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/tests.ts src/observability/adapters/tests.test.ts
git commit -m "observability: tests adapter — replayEvents (test_run_completed + test_run_failed)"
```

---

## Task 7: Synthesizer — `composeReplay()` (fused timeline + correlation_id dedupe)

**Files:**
- Modify: `src/observability/engine/synthesizer.ts`
- Modify: `src/observability/engine/synthesizer.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/engine/synthesizer.test.ts`:

```typescript
import { composeReplay } from './synthesizer'
import type { Event, ReplayEvent } from './types'

describe('synthesizer.composeReplay', () => {
  it('merges ledger events + adapter replay events sorted by (ts, source_priority, sort_id)', () => {
    const ledger: Event[] = [{
      event_id: 'ulid-A', worktree_id: 'wid', actor_label: 'alice', branch: 'b', task_id: 'T-1',
      type: 'task_claimed', ts: '2026-05-04T10:00:00Z', payload: { task_title: 'A' },
    } as Event]
    const adapterReplay: ReplayEvent[] = [
      { sort_id: 'git:abc', correlation_id: null, ts: '2026-05-04T11:00:00Z', source: 'git', kind: 'commit', summary: 'work' },
      { sort_id: 'mmr:job-1', correlation_id: null, ts: '2026-05-04T10:30:00Z', source: 'mmr', kind: 'job_completed', summary: 'pass' },
    ]
    const out = composeReplay({ ledgerEvents: ledger, adapterEvents: adapterReplay, window: { from: '2026-05-04T00:00:00Z', to: '2026-05-04T23:59:00Z' } })
    expect(out.events.map((e) => e.sort_id)).toEqual(['ledger:ulid-A', 'mmr:job-1', 'git:abc'])
  })

  it('dedupes cross-source events sharing a correlation_id (ledger > gh > git priority)', () => {
    const ledger: Event[] = [{
      event_id: 'ulid-X', worktree_id: 'wid', actor_label: 'alice', branch: 'b', task_id: null,
      type: 'pr_opened', ts: '2026-05-04T09:00:00Z', payload: { pr_number: 42 },
    } as Event]
    const adapterReplay: ReplayEvent[] = [
      { sort_id: 'gh:42:opened', correlation_id: 'pr:42:opened', ts: '2026-05-04T09:00:00Z', source: 'gh', kind: 'pr_opened', summary: 'PR #42' },
      { sort_id: 'gh:42:merged', correlation_id: 'pr:42:merged', ts: '2026-05-04T17:00:00Z', source: 'gh', kind: 'pr_merged', summary: 'PR #42 merged' },
    ]
    const out = composeReplay({ ledgerEvents: ledger, adapterEvents: adapterReplay, window: { from: '2026-05-04T00:00:00Z', to: '2026-05-04T23:59:00Z' } })
    // ledger pr_opened wins for the open; gh pr_merged passes through
    expect(out.events.map((e) => e.kind)).toEqual(['pr_opened', 'pr_merged'])
    expect(out.events[0].source).toBe('ledger')
  })

  it('filters events outside the time window', () => {
    const ledger: Event[] = [{
      event_id: 'ulid-old', worktree_id: 'wid', actor_label: 'alice', branch: 'b', task_id: 'T-1',
      type: 'task_claimed', ts: '2026-04-01T00:00:00Z', payload: { task_title: 'old' },
    } as Event]
    const out = composeReplay({ ledgerEvents: ledger, adapterEvents: [], window: { from: '2026-05-04T00:00:00Z', to: '2026-05-04T23:59:00Z' } })
    expect(out.events).toEqual([])
  })

  it('ledger events get sort_id "ledger:<event_id>"', () => {
    const ledger: Event[] = [{
      event_id: 'ulid-Z', worktree_id: 'wid', actor_label: 'alice', branch: 'b', task_id: 'T-1',
      type: 'task_claimed', ts: '2026-05-04T10:00:00Z', payload: { task_title: 'Z' },
    } as Event]
    const out = composeReplay({ ledgerEvents: ledger, adapterEvents: [], window: { from: '2026-05-04T00:00:00Z', to: '2026-05-04T23:59:00Z' } })
    expect(out.events[0].sort_id).toBe('ledger:ulid-Z')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/synthesizer.test.ts
```

Expected: FAIL — `composeReplay` not exported.

- [ ] **Step 3: Implement `composeReplay`**

Append to `src/observability/engine/synthesizer.ts`:

```typescript
import type { ReplayEvent, ReplayTimeline } from './types'

export interface ComposeReplayInput {
  ledgerEvents: Event[]
  adapterEvents: ReplayEvent[]
  window: { from: string; to: string }
}

const SOURCE_PRIORITY: Record<ReplayEvent['source'], number> = {
  ledger: 0, mmr: 1, gh: 2, git: 3, state: 4, tests: 5,
}

function ledgerEventToReplay(e: Event): ReplayEvent {
  let kind: string = e.type
  let summary = ''
  let task_id: string | undefined
  if (e.task_id) task_id = e.task_id
  let correlation_id: string | null = null
  if (e.type === 'task_claimed') summary = `${e.task_id} claimed: ${(e.payload as { task_title: string }).task_title}`
  else if (e.type === 'task_completed') summary = `${e.task_id} completed (${(e.payload as { outcome: string }).outcome})`
  else if (e.type === 'decision_recorded') summary = `decision recorded: ${(e.payload as { key: string }).key}`
  else if (e.type === 'blocker_hit') summary = `blocker on ${e.task_id ?? '(no task)'}: ${(e.payload as { summary: string }).summary}`
  else if (e.type === 'blocker_resolved') summary = `blocker resolved on ${e.task_id ?? '(no task)'}`
  else if (e.type === 'pr_opened') {
    const pn = (e.payload as { pr_number: number }).pr_number
    summary = `PR #${pn} opened`
    correlation_id = `pr:${pn}:opened`
    kind = 'pr_opened'
  }
  else if (e.type === 'progress_heartbeat') summary = `heartbeat on ${e.task_id ?? '(no task)'}: ${(e.payload as { note: string }).note}`
  else if (e.type === 'finding_acknowledged') summary = `finding ${(e.payload as { finding_id: string }).finding_id} → ${(e.payload as { status: string }).status}`
  return {
    sort_id: `ledger:${e.event_id}`,
    correlation_id,
    ts: e.ts, source: 'ledger', kind,
    actor_label: e.actor_label, task_id,
    summary,
  }
}

export function composeReplay(input: ComposeReplayInput): ReplayTimeline {
  const allEvents: ReplayEvent[] = [
    ...input.ledgerEvents.map(ledgerEventToReplay),
    ...input.adapterEvents,
  ].filter((e) => e.ts >= input.window.from && e.ts <= input.window.to)

  // Dedupe by correlation_id, keeping highest-priority source (lowest priority number)
  const byCorrelation = new Map<string, ReplayEvent>()
  const passthrough: ReplayEvent[] = []
  for (const e of allEvents) {
    if (e.correlation_id === null) { passthrough.push(e); continue }
    const prev = byCorrelation.get(e.correlation_id)
    if (!prev) { byCorrelation.set(e.correlation_id, e); continue }
    if (SOURCE_PRIORITY[e.source] < SOURCE_PRIORITY[prev.source]) {
      byCorrelation.set(e.correlation_id, e)
    } else if (SOURCE_PRIORITY[e.source] === SOURCE_PRIORITY[prev.source] && e.ts < prev.ts) {
      byCorrelation.set(e.correlation_id, e)
    }
  }
  const merged = [...passthrough, ...byCorrelation.values()]
  merged.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1
    const pri = SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
    if (pri !== 0) return pri
    return a.sort_id < b.sort_id ? -1 : 1
  })
  return { window: input.window, events: merged }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/synthesizer.test.ts
```

Expected: PASS, all synthesizer tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/synthesizer.ts src/observability/engine/synthesizer.test.ts
git commit -m "observability: synthesizer composeReplay (ledger + adapters fused; correlation_id dedupe; sort by ts + source priority)"
```

---

## Task 8: Wire `composeReplay` + `evaluateStall` into `runProgress`

**Files:**
- Modify: `src/observability/engine/api.ts`
- Modify: `src/observability/engine/api.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/engine/api.test.ts`:

```typescript
describe('api.runProgress (Plan 5 — replay + stall)', () => {
  let project: string, wt: string
  beforeEach(async () => {
    project = mkdtempSync(join(tmpdir(), 'observe-prog5-pri-'))
    wt = mkdtempSync(join(tmpdir(), 'observe-prog5-wt-'))
    execSync('git init -q', { cwd: project })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: project, shell: '/bin/sh' })
    ensureIdentity(wt, 'agent-alice')
    await writeEvent(wt, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await harvestWorktree({ primaryRoot: project, worktreeRoot: wt })
  })
  afterEach(() => {
    rmSync(project, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  })

  it('runProgress with replay=true populates EngineOutput.replay with the ledger event', async () => {
    const out = await runProgress({ primaryRoot: project, sinceHours: 24, replay: true, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    expect(out.replay).not.toBeNull()
    expect(out.replay!.events.length).toBeGreaterThanOrEqual(1)
    expect(out.replay!.events[0].source).toBe('ledger')
    expect(out.replay!.events[0].kind).toBe('task_claimed')
  })

  it('runProgress without replay leaves replay null', async () => {
    const out = await runProgress({ primaryRoot: project, sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    expect(out.replay).toBeNull()
  })

  it('runProgress with stall check populates needs_attention when stall conditions trip', async () => {
    // Simulate a 6-hour-old task by writing an event with a back-dated timestamp into the archive directly
    const archived = join(project, '.scaffold/activity-archive/active', JSON.parse(readFileSync(join(wt, '.scaffold/identity.json'), 'utf8')).worktree_id + '.jsonl')
    writeFileSync(archived, JSON.stringify({
      event_id: 'ulid-old', worktree_id: 'wid', actor_label: 'agent-alice', branch: 'a',
      task_id: 'T-OLD', type: 'task_claimed',
      ts: new Date(Date.now() - 6 * 3_600_000).toISOString(),
      payload: { task_title: 'old' },
    }) + '\n')
    const out = await runProgress({ primaryRoot: project, sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    const stale = out.needs_attention.find((n) => n.signal === 'task_stale' && n.ref.id === 'T-OLD')
    expect(stale).toBeDefined()
  })

  it('--no-stall-check leaves needs_attention empty', async () => {
    const out = await runProgress({ primaryRoot: project, sinceHours: 24, noStallCheck: true, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    expect(out.needs_attention).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/api.test.ts
```

Expected: FAIL — `replay` and `noStallCheck` options not yet in `RunProgressInput`.

- [ ] **Step 3: Update `runProgress`**

In `src/observability/engine/api.ts`, extend `RunProgressInput` and `runProgress`:

```typescript
import { composeReplay } from './synthesizer'
import { evaluateStall } from './stall'
import { loadObservabilityConfig } from './checks/observability-config'
import { gitAdapter } from '../adapters/git'
import { ghAdapter } from '../adapters/gh'
import { mmrAdapter } from '../adapters/mmr'
import { stateAdapter } from '../adapters/state'
import { testsAdapter } from '../adapters/tests'
import { auditHistoryAdapter } from '../adapters/audit-history'

export interface RunProgressInput {
  primaryRoot: string
  sinceHours: number
  replay?: boolean
  noStallCheck?: boolean
  ghBin?: string
  bdBin?: string
  args?: Record<string, unknown>
}

export async function runProgress(input: RunProgressInput): Promise<EngineOutput> {
  const started_at = new Date().toISOString()
  const merged = await readMergedLedger(input.primaryRoot)
  const availability = await composeAvailability(input.primaryRoot, { ghBin: input.ghBin, bdBin: input.bdBin })
  availability.ledger = merged.summary

  const snapshot = composeSnapshot({
    events: merged.events,
    sinceHours: input.sinceHours,
    currentPhase: 'build',
  })

  // ---- Replay ----
  let replay = null as EngineOutput['replay']
  if (input.replay) {
    const window = {
      from: new Date(Date.now() - input.sinceHours * 3_600_000).toISOString(),
      to: started_at,
    }
    const adapterEvents = (await Promise.all([
      gitAdapter.replayEvents(input.primaryRoot, { sinceHours: input.sinceHours }),
      ghAdapter.replayEvents(input.primaryRoot, { sinceHours: input.sinceHours, ghBin: input.ghBin }),
      mmrAdapter.replayEvents(input.primaryRoot, { sinceHours: input.sinceHours }),
      stateAdapter.replayEvents(input.primaryRoot, { sinceHours: input.sinceHours }),
      testsAdapter.replayEvents(input.primaryRoot, { sinceHours: input.sinceHours }),
    ])).flat()
    replay = composeReplay({ ledgerEvents: merged.events, adapterEvents, window })
  }

  // ---- Stall ----
  let needs_attention: EngineOutput['needs_attention'] = []
  if (!input.noStallCheck) {
    const config = loadObservabilityConfig(input.primaryRoot)
    const skippedStreaks = await auditHistoryAdapter.lensSkippedStreaks(input.primaryRoot)
    const adapterEventsForStall = replay?.events ?? (await Promise.all([
      gitAdapter.replayEvents(input.primaryRoot, { sinceHours: input.sinceHours }),
      ghAdapter.replayEvents(input.primaryRoot, { sinceHours: input.sinceHours, ghBin: input.ghBin }),
      mmrAdapter.replayEvents(input.primaryRoot, { sinceHours: input.sinceHours }),
    ])).flat()
    needs_attention = evaluateStall({
      now: started_at,
      ledgerEvents: merged.events,
      replayEvents: adapterEventsForStall,
      findings: [],   // progress doesn't run audit; stall reads findings from latest sidecar (via audit-history adapter; deferred to renderer side)
      config,
      lensSkippedStreaks: skippedStreaks,
    })
  }

  const fix_threshold: Severity = 'P2'
  const verdict: Verdict = 'pass'

  return {
    schema_version: '1.0',
    invocation: { command: 'progress', args: input.args ?? {}, started_at, completed_at: new Date().toISOString(), scaffold_version: scaffoldVersion() },
    availability,
    snapshot,
    replay,
    findings: [],
    needs_attention,
    graph_stats: { nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0 },
    fix_threshold,
    verdict,
    summary: EMPTY_SUMMARY,
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/api.test.ts
```

Expected: PASS, all api tests including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/api.ts src/observability/engine/api.test.ts
git commit -m "observability: runProgress wires replay + stall (--replay, --no-stall-check)"
```

---

## Task 9: CLI flags for `--replay` and `--no-stall-check`

**Files:**
- Modify: `src/cli/commands/observe.ts`
- Modify: `src/cli/commands/observe.test.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/cli/commands/observe.test.ts`:

```typescript
describe('observe progress --replay + --no-stall-check', () => {
  let proj: string
  beforeEach(async () => {
    proj = mkdtempSync(join(tmpdir(), 'observe-cli5-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    ensureIdentity(proj, 'primary')
    await writeEvent(proj, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('--replay --json includes replay.events in stdout', async () => {
    let captured = ''
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((s: string | Uint8Array) => { captured += String(s); return true }) as never
    try {
      await handleProgress({ cwd: proj, json: true, sinceHours: 24, replay: true, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    } finally { process.stdout.write = orig }
    const obj = JSON.parse(captured)
    expect(obj.replay).not.toBeNull()
    expect(obj.replay.events.length).toBeGreaterThan(0)
  })

  it('--no-stall-check produces empty needs_attention regardless of conditions', async () => {
    let captured = ''
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((s: string | Uint8Array) => { captured += String(s); return true }) as never
    try {
      await handleProgress({ cwd: proj, json: true, sinceHours: 24, noStallCheck: true, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    } finally { process.stdout.write = orig }
    expect(JSON.parse(captured).needs_attention).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: FAIL — `replay` and `noStallCheck` not threaded through.

- [ ] **Step 3: Update handler + CLI registration**

In `src/cli/commands/observe.ts`, extend `HandleProgressInput`:

```typescript
export interface HandleProgressInput {
  // ... existing fields
  replay?: boolean
  noStallCheck?: boolean
}
```

Pass through in the `runProgress(...)` call:

```typescript
const out = await runProgress({
  primaryRoot: input.cwd, sinceHours: input.sinceHours,
  replay: input.replay, noStallCheck: input.noStallCheck,
  ghBin: input.ghBin, bdBin: input.bdBin,
  args: { sinceHours: input.sinceHours, replay: input.replay },
})
```

In `src/cli/index.ts`, add to the `progress` builder:

```typescript
.option('replay', { type: 'boolean', default: false, describe: 'Include the replay timeline in EngineOutput' })
.option('no-stall-check', { type: 'boolean', default: false, describe: 'Suppress stall detection' })
```

And thread through to handler:

```typescript
replay: !!argv.replay,
noStallCheck: !!argv.noStallCheck,
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: PASS, all CLI tests.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/observe.ts src/cli/commands/observe.test.ts src/cli/index.ts
git commit -m "cli: --replay + --no-stall-check flags wired into handleProgress"
```

---

## Task 10: Terminal renderer — replay block + Needs Attention banner

**Files:**
- Modify: `src/observability/renderers/terminal.ts`
- Modify: `src/observability/renderers/terminal.test.ts`
- Modify: `src/observability/renderers/_lib.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/renderers/terminal.test.ts`:

```typescript
describe('renderProgressTerminal — replay + needs_attention', () => {
  it('prepends a "needs attention" banner when needs_attention is non-empty', () => {
    const out = JSON.parse(JSON.stringify(fixtureOutput)) as EngineOutput
    out.needs_attention = [{
      signal: 'task_stale', ref: { kind: 'task', id: 'T-031' },
      age_hours: 5.2, threshold_hours: 4,
      summary: 'task T-031 (agent-alice) claimed 5h ago, no recent activity',
    }]
    const text = renderProgressTerminal(out)
    expect(text).toMatch(/⚠ needs attention/i)
    expect(text).toContain('T-031')
    expect(text).toContain('5.2h')
  })

  it('prints a timeline section when replay is populated', () => {
    const out = JSON.parse(JSON.stringify(fixtureOutput)) as EngineOutput
    out.replay = {
      window: { from: '2026-05-04T13:00:00Z', to: '2026-05-04T14:00:00Z' },
      events: [
        { sort_id: 'ledger:ulid-A', correlation_id: null, ts: '2026-05-04T13:55:00Z', source: 'ledger', kind: 'task_claimed', actor_label: 'agent-alice', task_id: 'T-031', summary: 'T-031 claimed: refresh token rotation' },
        { sort_id: 'git:abc', correlation_id: null, ts: '2026-05-04T13:50:00Z', source: 'git', kind: 'commit', summary: 'wip', actor_label: 'agent-alice' },
      ],
    }
    const text = renderProgressTerminal(out)
    expect(text).toMatch(/timeline/i)
    expect(text).toContain('T-031 claimed')
    expect(text).toContain('git')
    expect(text).toContain('commit')
  })

  it('omits the timeline section when replay is null', () => {
    const out = JSON.parse(JSON.stringify(fixtureOutput)) as EngineOutput
    out.replay = null
    const text = renderProgressTerminal(out)
    expect(text).not.toMatch(/^timeline/im)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/renderers/terminal.test.ts
```

Expected: FAIL — banner + timeline rendering not implemented.

- [ ] **Step 3: Update renderer + helper**

In `src/observability/renderers/_lib.ts`, add a shared formatter:

```typescript
import type { NeedsAttentionItem } from '../engine/types'

export function needsAttentionLines(items: NeedsAttentionItem[]): string[] {
  if (items.length === 0) return []
  const lines: string[] = [`⚠ needs attention (${items.length})`]
  for (const i of items) {
    const ageStr = i.signal === 'lens_skipped_repeatedly' ? `${i.threshold_hours}× streak` : `${i.age_hours}h`
    lines.push(`  • ${i.summary} [${ageStr}]`)
  }
  return lines
}
```

In `src/observability/renderers/terminal.ts`, modify `renderProgressTerminal`:

```typescript
import { needsAttentionLines } from './_lib'

export function renderProgressTerminal(out: EngineOutput): string {
  const lines: string[] = []
  const sinceHours = Number(out.invocation.args.sinceHours ?? 24)
  lines.push(`build observability — progress (last ${sinceHours}h · phase: ${out.snapshot?.current_phase ?? 'unknown'})`)
  lines.push('')

  // Needs Attention banner (top-of-output)
  const banner = needsAttentionLines(out.needs_attention)
  if (banner.length > 0) {
    lines.push(...banner)
    lines.push('')
  }

  const snap = out.snapshot
  // ... existing active_agents / in_flight / completed_in_window / recent_decisions sections ...

  // Timeline (replay)
  if (out.replay && out.replay.events.length > 0) {
    lines.push(`timeline (${out.replay.events.length} events · ${out.replay.window.from} – ${out.replay.window.to})`)
    for (const e of out.replay.events.slice(0, 50)) {  // cap at 50 for terminal
      const ts = e.ts.replace('T', ' ').replace(/:\d{2}\.\d+Z$/, '').replace(/Z$/, '')
      const actor = e.actor_label ? ` · ${e.actor_label}` : ''
      lines.push(`  ${ts}  ${e.source.padEnd(7)} ${e.kind.padEnd(20).slice(0, 20)} ${e.summary}${actor}`)
    }
    lines.push('')
  }

  lines.push(`availability: ${availabilityLine(out.availability)}`)
  lines.push(`                              (✓ available  · ~ degraded  · — unavailable)`)

  return scrubSecrets(lines.join('\n'))
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/renderers/terminal.test.ts
```

Expected: PASS, all terminal tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/renderers/terminal.ts src/observability/renderers/terminal.test.ts src/observability/renderers/_lib.ts
git commit -m "observability: terminal renderer — needs-attention banner + timeline section"
```

---

## Task 11: Markdown renderer — replay section + Needs Attention table

**Files:**
- Modify: `src/observability/renderers/markdown.ts`
- Modify: `src/observability/renderers/markdown.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/renderers/markdown.test.ts`:

```typescript
describe('renderProgressMarkdown — replay + needs_attention', () => {
  it('prepends a "Needs Attention" table when needs_attention is non-empty', () => {
    const out = JSON.parse(JSON.stringify(fixture)) as EngineOutput
    out.needs_attention = [{
      signal: 'pr_stale', ref: { kind: 'pr', id: '42' },
      age_hours: 67, threshold_hours: 48,
      summary: 'PR #42 opened 67h ago, not merged or closed',
    }]
    const md = renderProgressMarkdown(out)
    expect(md).toContain('## Needs Attention')
    expect(md).toMatch(/\| pr_stale \| .*PR #42/)
  })

  it('appends a "Timeline" section when replay is populated', () => {
    const out = JSON.parse(JSON.stringify(fixture)) as EngineOutput
    out.replay = {
      window: { from: '2026-05-04T13:00:00Z', to: '2026-05-04T14:00:00Z' },
      events: [{
        sort_id: 'ledger:ulid-A', correlation_id: null, ts: '2026-05-04T13:55:00Z',
        source: 'ledger', kind: 'task_claimed', actor_label: 'agent-alice', task_id: 'T-031',
        summary: 'T-031 claimed',
      }],
    }
    const md = renderProgressMarkdown(out)
    expect(md).toContain('## Timeline')
    expect(md).toMatch(/\| .*ledger.* \| .*task_claimed.* \|/)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/renderers/markdown.test.ts
```

Expected: FAIL — sections not yet emitted.

- [ ] **Step 3: Update `renderProgressMarkdown`**

Add helper functions to `markdown.ts`:

```typescript
function needsAttentionSection(out: EngineOutput): string {
  if (out.needs_attention.length === 0) return ''
  const rows = out.needs_attention.map((i) => {
    const ageStr = i.signal === 'lens_skipped_repeatedly' ? `${i.threshold_hours}× streak` : `${i.age_hours}h`
    return `| ${i.signal} | ${i.summary} | ${ageStr} |`
  })
  return ['## Needs Attention', '', '| Signal | Item | Age |', '|---|---|---|', ...rows].join('\n')
}

function timelineSection(out: EngineOutput): string {
  if (!out.replay || out.replay.events.length === 0) return ''
  const rows = out.replay.events.slice(0, 100).map((e) =>
    `| ${e.ts} | ${e.source} | ${e.kind} | ${e.summary} |`
  )
  return ['## Timeline', '', `Window: ${out.replay.window.from} – ${out.replay.window.to}`, '',
    '| Time | Source | Kind | Summary |', '|---|---|---|---|', ...rows].join('\n')
}
```

In `renderProgressMarkdown`, insert `needsAttentionSection(out)` after the header block (top-of-doc, immediately after the metadata lines and `**Phase:**` line, before `activeAgentsSection`), and `timelineSection(out)` after `decisionsSection(out)` but before `availabilityTable`:

```typescript
export function renderProgressMarkdown(out: EngineOutput): string {
  const sinceHours = Number(out.invocation.args.sinceHours ?? 24)
  const windowEnd = fmtDate(out.invocation.started_at)
  const sections = [
    header(out, 'Progress'),
    '',
    `**Window:** last ${sinceHours} hours (ending ${windowEnd})`,
    `**Phase:** ${out.snapshot?.current_phase ?? '(unknown)'}`,
    '',
    needsAttentionSection(out),
    activeAgentsSection(out),
    inFlightSection(out),
    completedSection(out),
    decisionsSection(out),
    timelineSection(out),
    availabilityTable(out.availability),
    '',
    ledgerSummary(out.availability),
  ].filter(Boolean)
  return scrubSecrets(sections.join('\n\n')) + '\n'
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/renderers/markdown.test.ts
```

Expected: PASS, all markdown tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/renderers/markdown.ts src/observability/renderers/markdown.test.ts
git commit -m "observability: markdown renderer — Needs Attention + Timeline sections"
```

---

## Task 12: Dashboard fragment — Needs Attention aside + replay details

**Files:**
- Modify: `src/observability/renderers/dashboard.ts`
- Modify: `src/observability/renderers/dashboard.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/renderers/dashboard.test.ts`:

```typescript
describe('renderProgressFragment — needs-attention + replay', () => {
  it('emits an <aside class="needs-attention"> when needs_attention is non-empty', () => {
    const out = JSON.parse(JSON.stringify(baseOut)) as EngineOutput
    out.needs_attention = [{
      signal: 'task_stale', ref: { kind: 'task', id: 'T-031' },
      age_hours: 5, threshold_hours: 4, summary: 'task T-031 stale',
    }]
    const html = renderProgressFragment(out)
    expect(html).toContain('class="needs-attention"')
    expect(html).toContain('T-031')
    expect(html).toMatch(/role="alert"/)
  })

  it('emits a <details><summary>Timeline</summary> when replay is populated', () => {
    const out = JSON.parse(JSON.stringify(baseOut)) as EngineOutput
    out.replay = {
      window: { from: '2026-05-04T13:00:00Z', to: '2026-05-04T14:00:00Z' },
      events: [{ sort_id: 'ledger:ulid-A', correlation_id: null, ts: '2026-05-04T13:55:00Z', source: 'ledger', kind: 'task_claimed', actor_label: 'agent-alice', task_id: 'T-031', summary: 'T-031 claimed' }],
    }
    const html = renderProgressFragment(out)
    expect(html).toMatch(/<details>\s*<summary>Timeline/)
    expect(html).toContain('T-031 claimed')
  })

  it('omits both sections when needs_attention is empty and replay is null', () => {
    const html = renderProgressFragment(baseOut)
    expect(html).not.toContain('needs-attention')
    expect(html).not.toMatch(/<summary>Timeline/)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/renderers/dashboard.test.ts
```

Expected: FAIL — neither section yet emitted by the renderer.

- [ ] **Step 3: Update `renderProgressFragment`**

Modify `renderProgressFragment` in `src/observability/renderers/dashboard.ts`:

```typescript
function needsAttentionAside(out: EngineOutput): string {
  if (out.needs_attention.length === 0) return ''
  const items = out.needs_attention.map((i) => {
    const ageStr = i.signal === 'lens_skipped_repeatedly' ? `${i.threshold_hours}× streak` : `${i.age_hours}h`
    return `<li><strong>${escape(i.signal)}</strong> · ${escape(i.summary)} <em>(${escape(ageStr)})</em></li>`
  }).join('')
  return `<aside class="needs-attention" role="alert" style="border-left: 4px solid var(--sev-p1)">
  <h3>⚠ Needs Attention (${out.needs_attention.length})</h3>
  <ul>${items}</ul>
</aside>`
}

function timelineDetails(out: EngineOutput): string {
  if (!out.replay || out.replay.events.length === 0) return ''
  const rows = out.replay.events.slice(0, 100).map((e) =>
    `<tr><td>${escape(e.ts)}</td><td>${escape(e.source)}</td><td>${escape(e.kind)}</td><td>${escape(e.summary)}</td></tr>`
  ).join('')
  return `<details>
  <summary>Timeline (${out.replay.events.length} events)</summary>
  <table><thead><tr><th>Time</th><th>Source</th><th>Kind</th><th>Summary</th></tr></thead><tbody>${rows}</tbody></table>
</details>`
}

export function renderProgressFragment(out: EngineOutput): string {
  const snap = out.snapshot
  const agents = (snap?.active_agents ?? []).map((a) => {
    const task = a.current_task ? `${escape(a.current_task.id ?? '(unplanned)')} — ${escape(a.current_task.title)}` : '<em>idle</em>'
    return `<li><code>${escape(a.actor_label)}</code> · ${escape(a.branch)} · ${task}</li>`
  }).join('') || '<li><em>none</em></li>'
  const decisions = (snap?.recent_decisions ?? []).slice(0, 5).map((d) =>
    `<li><code>${escape(d.key)}</code>: ${escape(d.summary)}</li>`
  ).join('') || '<li><em>none</em></li>'

  const fragment = `<section id="build-progress" class="panel">
  <header>
    <h2>Build Progress</h2>
    <span class="meta">last 24h · phase: ${escape(snap?.current_phase ?? '(unknown)')}</span>
  </header>
  ${needsAttentionAside(out)}
  <div class="grid grid-2">
    <div class="card"><h3>Active Agents</h3><ul>${agents}</ul></div>
    <div class="card"><h3>Recent Decisions</h3><ul>${decisions}</ul></div>
  </div>
  ${timelineDetails(out)}
</section>`
  return redactRendered(fragment)
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/renderers/dashboard.test.ts
```

Expected: PASS, all dashboard tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/renderers/dashboard.ts src/observability/renderers/dashboard.test.ts
git commit -m "observability: dashboard fragment — Needs Attention aside + Timeline details"
```

---

## Task 13: Lens G — decision-keyword commit scan (deferred from Plan 3)

**Files:**
- Modify: `src/observability/checks/lens-g-decisions.ts`
- Modify: `src/observability/checks/lens-g-decisions.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/checks/lens-g-decisions.test.ts`:

```typescript
import { gitAdapter } from '../adapters/git'

describe('lensGDecisions — decision-keyword commit scan', () => {
  it('emits P2 for commits with decision-keyword messages that lack matching event/doc', async () => {
    // Simulate a recent commit by passing an availability that includes git as available, plus a stub graph
    // and a fake recentCommits result via monkey-patch.
    const orig = gitAdapter.recentCommits
    gitAdapter.recentCommits = async () => [{
      sha: 'a'.repeat(40), branch: null, ts: new Date().toISOString(),
      author: 'alice', subject: 'decided to migrate to Postgres',
    }]
    try {
      const findings = await lensGDecisions(emptyGraph(), { events: [] }, baseAvail, [], new Set(['G-decisions']))
      const f = findings.find((x) => /decision-keyword commit/i.test(x.title))
      expect(f?.severity).toBe('P2')
    } finally {
      gitAdapter.recentCommits = orig
    }
  })

  it('does not emit when a matching ledger event covers the commit subject', async () => {
    const orig = gitAdapter.recentCommits
    gitAdapter.recentCommits = async () => [{
      sha: 'b'.repeat(40), branch: null, ts: new Date().toISOString(),
      author: 'alice', subject: 'decided to migrate to Postgres',
    }]
    try {
      const events = [decisionEvent('migrate-to-postgres', 'switched to postgres')]
      const findings = await lensGDecisions(emptyGraph(), { events }, baseAvail, [], new Set(['G-decisions']))
      expect(findings.find((x) => /decision-keyword commit/i.test(x.title))).toBeUndefined()
    } finally {
      gitAdapter.recentCommits = orig
    }
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/checks/lens-g-decisions.test.ts
```

Expected: FAIL — sub-check not implemented.

- [ ] **Step 3: Implement the keyword-scan sub-check**

In `src/observability/checks/lens-g-decisions.ts`, add the implementation right before the final `return findings`:

```typescript
import { gitAdapter } from '../adapters/git'

// ... inside lensGDecisions:

  // (d) Decision-keyword commit scan
  if (_availability.git.status === 'available') {
    const cwd = process.cwd()
    const keywords = loadKeywords(cwd)
    const keywordRe = new RegExp(`\\b(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i')
    const eventKeys = new Set([...eventsByKey.keys(), ...graph.decisions.map((d) => d.key)])
    let recentCommits
    try { recentCommits = await gitAdapter.recentCommits(cwd, { sinceHours: 24 * 7 }) } catch { recentCommits = [] }
    for (const c of recentCommits) {
      if (!keywordRe.test(c.subject)) continue
      // Heuristic: derive a slug from the subject and see if any event/doc key matches.
      const slug = c.subject.toLowerCase().replace(/[^\w\s-]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 64)
      const covered = [...eventKeys].some((k) => slug.includes(k) || k.includes(slug.slice(0, 24)))
      if (covered) continue
      findings.push({
        id: makeFindingId([lensId, 'decision-keyword-commit', c.sha]),
        lens_id: lensId, severity: 'P2',
        title: `decision-keyword commit without matching event/doc: ${c.sha.slice(0, 7)}`,
        description: `Commit ${c.sha.slice(0, 7)} ("${c.subject.slice(0, 100)}") looks like a decision but has no matching ledger event or decisions-doc entry.`,
        source_doc: 'decisions.jsonl',
        evidence: { kind: 'doc_disagreement', left_doc: 'git log', right_doc: 'decisions.jsonl', conflict: c.subject.slice(0, 100) },
        confidence: 'low', first_seen: now, last_seen: now, status: 'open',
        fix_hint: { kind: 'record_decision', target: 'decisions.jsonl', prompt: `Record a decision for: "${c.subject.slice(0, 100)}".` },
      })
    }
  }
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/checks/lens-g-decisions.test.ts
```

Expected: PASS, all lens G tests including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/observability/checks/lens-g-decisions.ts src/observability/checks/lens-g-decisions.test.ts
git commit -m "observability: lens G — decision-keyword commit scan (P2 for keyword-shaped commits without matching event/doc)"
```

---

## Task 14: Bats end-to-end coverage for replay + needs-attention

**Files:**
- Modify: `tests/observability/audit.bats`

- [ ] **Step 1: Append cases**

Append to `tests/observability/audit.bats`:

```bash
@test "observe progress --replay --json includes a non-empty replay.events array" {
    $BIN observe event task_claimed --branch=main --task-id=T-001 --task-title="hello"
    $BIN observe harvest --worktree="$SANDBOX"

    run $BIN observe progress --replay --json --since-hours=24
    [ "$status" -eq 0 ]
    [[ "$output" == *'"replay"'* ]]
    [[ "$output" == *'"task_claimed"'* ]]
    [[ "$output" == *'"source":"ledger"'* ]]
}

@test "observe progress --no-stall-check returns empty needs_attention" {
    $BIN observe event task_claimed --branch=main --task-id=T-001 --task-title="hello"
    $BIN observe harvest --worktree="$SANDBOX"

    run $BIN observe progress --no-stall-check --json --since-hours=24
    [ "$status" -eq 0 ]
    [[ "$output" == *'"needs_attention":[]'* ]]
}
```

- [ ] **Step 2: Run the bats suite**

```bash
npm run build && bats tests/observability/audit.bats
```

Expected: PASS — all original cases + 2 new ones.

- [ ] **Step 3: Commit**

```bash
git add tests/observability/audit.bats
git commit -m "observability: bats coverage for --replay + --no-stall-check"
```

---

## Task 15: `make check-all` and CLAUDE.md update

- [ ] **Step 1: Run the gate**

```bash
make check-all
```

Common Plan 5 issues:
- Coverage drop in stall paths — add tests for `task_stale` with branch-commit override and for the `lens_skipped_repeatedly` zero-streak case.
- bats failing because `dist/cli/index.js` doesn't exist — `npm run build` first.
- `gh pr list --search` syntax differences across `gh` versions — wrap in try/catch (already done) but add a comment in the adapter explaining the fall-through behavior.

- [ ] **Step 2: Update CLAUDE.md**

Append to the existing observability paragraph (last edited by Plan 4):

> Plan 5 ships replay + stall: `scaffold observe progress --replay` fuses the ledger with synthesized git/gh/mmr/state/tests events (correlation_id dedupe, ledger > mmr > gh > git > state > tests source priority); stall detection runs at every command-execution boundary, surfacing `task_stale | pr_stale | pr_review_stale | blocker_unaddressed | audit_findings_unresolved | lens_skipped_repeatedly` signals via the "Needs Attention" surface in all three renderers. Thresholds configurable via `.scaffold/observability.yaml` `stall:`. `--no-stall-check` suppresses the surface. Lens G's decision-keyword commit scan (deferred from Plan 3) is now active.

Add to the Key Commands table:

```markdown
| `scaffold observe progress --replay` | Fuse ledger + adapter events into a timeline |
| `scaffold observe progress --no-stall-check` | Suppress the "Needs Attention" surface |
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Plan 5 — replay + stall + Lens G keyword scan"
```

---

## Task 16: Self-review the plan against the spec

- [ ] **Step 1: Spec coverage matrix**

| Spec section | Implemented in |
|---|---|
| Stall detection signals + thresholds (§1 stall detection, §4.5) | Task 1 |
| `progress_heartbeat` resets `task_stale` clock (§1) | Task 1 |
| `lens_skipped_repeatedly` after 3rd skip (§4.5) | Task 1 (consumes Task 6 of Plan 4) |
| Configurable thresholds via observability.yaml (§3.11) | Task 1 (uses Plan 3's loader) |
| git adapter replayEvents (§2.7 source: 'git') | Task 2 |
| gh adapter replayEvents with correlation_id (§2.7) | Task 3 |
| mmr adapter replayEvents (§2.7 source: 'mmr') | Task 4 |
| state adapter replayEvents (§2.7 source: 'state') | Task 5 |
| tests adapter replayEvents (§2.7 source: 'tests') | Task 6 |
| composeReplay merges + dedupes by correlation_id + sorts by (ts, source priority, sort_id) (§2.7) | Task 7 |
| `--replay` and `--no-stall-check` CLI flags (§5.1) | Tasks 8, 9 |
| Terminal renderer Needs Attention banner + timeline (§4.1, §4.5) | Task 10 |
| Markdown renderer Needs Attention table + timeline section (§4.2, §4.5) | Task 11 |
| Dashboard fragment Needs Attention aside (role="alert") + timeline details (§4.3, §4.5) | Task 12 |
| Lens G decision-keyword commit scan (§3.8) | Task 13 |
| Bats coverage for replay + needs-attention (§6.3) | Task 14 |
| Quality gate + docs (§6.8) | Task 15 |

- [ ] **Step 2: Out-of-scope confirmations (deferred to subsequent plans)**

| Deferred capability | Plan |
|---|---|
| Phase-boundary triggers + StateManager.markCompleted refactor (state adapter's per-step timestamps come with that refactor) | Plan 6 |
| MMR `doc-conformance` channel | Plan 7 |
| Lens H full-profile prose checks (LLM-graded) | Plan 7 |
| `--fix` flow + worktree teardown script | Plan 8 |

- [ ] **Step 3: Type consistency final check**

```bash
grep -E '^export (type|interface) ' src/observability/engine/types.ts | sort | uniq -c | sort -rn | head -20
npx tsc --noEmit
```

Expected: no duplicate exports; tsc clean. Plan 5 does not modify `engine/types.ts` — `ReplayEvent` and `NeedsAttentionItem` were already declared in Plan 1 Task 1.

- [ ] **Step 4: Mark Plan 5 complete**

```bash
git add docs/superpowers/plans/2026-05-04-build-observability-replay-and-stall.md
git commit -m "plans: build-observability replay + stall — final self-review pass" --allow-empty
```

---

## Plan 5 — Self-review (built into the plan)

**Spec coverage:** every Plan-5-scoped requirement maps to a task. The replay timeline (§2.7) is fully implemented including correlation_id dedupe and source-priority ordering; all six stall signals from spec §1 are implemented; all three renderers gain Needs Attention surfaces and Plan 5 also lands the deferred Lens G keyword-commit scan.

**Placeholder scan:** plan grepped for `TBD|TODO|FIXME|fill in|appropriate error|Similar to Task` — none present.

**Type consistency:**
- `ReplayEvent`, `ReplayTimeline`, `NeedsAttentionItem` types are reused unchanged from Plan 1.
- `Severity` and `severityRank` reused from Plan 1 in `stall.ts`.
- All adapters' `replayEvents` methods share a uniform signature `(cwd, opts: { sinceHours, ghBin? }) → Promise<ReplayEvent[]>`.
- `composeReplay` consumes the same `ReplayEvent` shape produced by adapters and the converted-from-ledger events; ledger conversion handled in one place.

**Scope:** Plan 5 ships the replay timeline and stall detection on top of Plans 1-4. After Plan 5, the audit + progress feature pair is consumer-ready with full timeline visibility and proactive stall warnings; Plans 6-8 add operational integration (phase triggers, MMR channel, fix flow) but the user-facing observability surface is feature-complete.

---

**Plan 5 complete and saved to `docs/superpowers/plans/2026-05-04-build-observability-replay-and-stall.md`.**

Plans 1+2+3+4+5 produce a feature-complete observability layer from a user-visibility standpoint. Plans 6-8 remain optional integration:
- Plan 6 — phase-boundary triggers + StateManager.markCompleted refactor (replaces state adapter's mtime-based timestamps with real per-step timestamps).
- Plan 7 — MMR `doc-conformance` channel + Lens H full-profile LLM checks.
- Plan 8 — `--fix` flow + worktree teardown script.

**Three execution options for Plans 1–5:**

1. **Subagent-Driven (recommended)** — fresh subagent per task across all five plans (~110 tasks total).
2. **Inline Execution** — execute tasks here using `executing-plans` with checkpoints between plans.
3. **Pause and write Plans 6–8 first** — get the full design committed as plans before any code lands.

Which approach?
