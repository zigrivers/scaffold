# Merge Queue Bead Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make merge-queue bead closeout observable, retryable, and able to recover landed PRs whose Beads issues were created after the daemon started.

**Architecture:** Journal every post-merge bead close attempt and outcome beside the existing PR state. The daemon will fairly retry failed or legacy-unacknowledged `LANDED` entries in bounded batches, while an in-memory key prevents duplicate work during one process lifetime. Commands time out, and a fixed attempt cap prevents permanent failures from growing the journal indefinitely. `Closes <id>` remains canonical; `Bead: <id>` is a logged compatibility fallback for already-landed PRs.

**Tech Stack:** TypeScript, Node child processes, Vitest, scaffold merge-queue JSONL journal.

---

### Task 1: Model bead synchronization receipts

**Files:**
- Modify: `src/merge-queue/types.ts`
- Modify: `src/merge-queue/state.ts`
- Test: `src/merge-queue/daemon.test.ts`

- [ ] **Step 1: Write a failing state test through the daemon harness**

Add a daemon test that journals a successful close receipt and proves a later
reconciliation does not execute the same close again.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- --run src/merge-queue/daemon.test.ts
```

Expected: the new receipt assertion fails because `bead_sync` is not yet a
supported journal event.

- [ ] **Step 3: Add the minimal journal and reduced-state types**

Add a `bead_sync` event with PR, action, optional bead ID, result, timestamp,
and optional note. Add per-PR closeout state to `QueueState`, and fold the
latest event in `reduceState`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- --run src/merge-queue/daemon.test.ts
```

Expected: the receipt state is reduced without changing existing queue state.

### Task 2: Close, record, and retry beads

**Files:**
- Modify: `src/merge-queue/daemon.ts`
- Test: `src/merge-queue/daemon.test.ts`

- [ ] **Step 1: Write failing closeout tests**

Add tests proving:

1. A bead created after daemon construction is closed when its PR lands.
2. A failed `bd close` is logged, journaled, and succeeds on the next pass.
3. A terminal `LANDED` entry without a receipt is replayed during reconciliation.
4. A successful receipt prevents another close.
5. A missing mapping is surfaced once and recorded as skipped.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- --run src/merge-queue/daemon.test.ts
```

Expected: failures show that close commands have no injectable seam, outcomes
are not journaled, and terminal `LANDED` entries are not replayed.

- [ ] **Step 3: Implement the minimal closeout state machine**

Add an injectable Promise-returning bead-command runner with a production
default backed by `execFile`. Parse canonical `Closes <id>` first, accept
`Bead: <id>` as a logged fallback, journal `attempted` followed by
`succeeded` or `failed`, and record missing mappings as `skipped`.

Retry failed or unacknowledged `LANDED` entries fairly, prioritising
never-attempted and then least-recently-attempted entries, with a fixed per-pass
limit and an in-memory in-flight key. Bound command duration and total attempts.
Invoke retry during startup reconciliation and at the beginning of unpaused
cycles so failures have an automatic retry path without violating an operator
pause.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- --run src/merge-queue/daemon.test.ts
```

Expected: all daemon tests pass, including the new session-created-bead
integration scenario.

### Task 3: Document and verify the behavior

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md` only if the user-facing merge-queue contract is described there

- [ ] **Step 1: Add a concise changelog entry**

Document that landed Bead closeout is now journaled and retried, and that
legacy `Bead:` mappings are recovered while `Closes` remains canonical.

- [ ] **Step 2: Run the complete gate**

Run:

```bash
make check-all
```

Expected: lint, type-check, unit tests, integration tests, and evaluation gates
all pass.

- [ ] **Step 3: Review the exact diff**

Run:

```bash
git diff --check
git status --short
```

Expected: only the plan, merge-queue implementation/tests/types, and required
user-facing release note are changed.
