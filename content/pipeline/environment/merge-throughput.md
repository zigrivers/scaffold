---
name: merge-throughput
description: Install the merge queue and day-one post-merge CI so many agents merge without livelock
summary: "Installs the merge-queue agent-ops component (batching daemon shims, mq-guard, local poller) and — by default — day-one post-merge/nightly CI on a $0 self-hosted runner, then generates docs/merge-queue.md: the enqueue flow, ejection handling, pause-on-red runbook, flake quarantine, and calibration guidance."
phase: "environment"
order: 335
dependencies: [git-workflow]
outputs: [docs/merge-queue.md]
conditional: "if-needed"
knowledge-base: [git-workflow-patterns, multi-agent-coordination, test-impact-analysis]
reads: [dev-env-setup, tdd]
---

## Purpose
Give the project merge throughput that scales with parallel agents: a local
merge-queue daemon that batch-tests and lands PRs (agents enqueue and move on),
and a post-merge/nightly full-suite safety net that runs from day one. Applies
when the project expects 3+ concurrent agents (the same signal that enables the
worktree machinery); skip for solo projects — `bd merge-slot` suffices there.

## Inputs
- docs/git-workflow.md (required) — the enqueue-based PR workflow this step's
  runbook extends
- docs/tdd-standards.md (required) — the two-gate contract (`check-affected` /
  `check`) the queue executes
- .scaffold/agent-ops.yaml (required) — extended here with the `merge_queue:`
  section
- CLAUDE.md (required) — Key Commands table gains the mq targets

## Expected Outputs
- docs/merge-queue.md — how the queue works (enqueue → batch → land/eject),
  ejection recovery, the pause-on-red runbook (fix forward vs revert decision
  tree), flake quarantine policy, calibration via `scaffold mq stats`, and the
  deliberate-direct-merge procedure (`MQ_DIRECT_MERGE_OK=1`, human-only)
- Installed `merge-queue` component (+ `ci` component unless
  `gate_executor: local-poller`)
- `.scaffold/agent-ops.yaml` gains a `merge_queue:` section
- CLAUDE.md Key Commands rows for `make mq-enqueue` / `mq-status` / `mq-stats`
- Registered mq-guard hook (via the git-workflow step's instruction 4)

## Quality Criteria
- (mvp) `scaffold agent-ops install --component merge-queue` completed clean and
  `scaffold agent-ops check` passes
- (mvp) docs/merge-queue.md documents: enqueue-and-move-on, ejection → bead
  reopened → any agent fixes, NEVER `gh pr merge` directly, `.mq/PAUSED`
  semantics (NRS violation vs partial landing vs post-merge red) with the
  recovery for each
- (mvp) Engine-behavior facts from Plan 1 execution documented: a PR whose diff
  is already on the base is CANCELLED with a "close the PR" comment (not
  ejected); the `mq:ready` label enqueues only PRs the queue has never seen (or
  previously landed) — after an ejection, RE-LABELING DOES NOT RE-ENQUEUE;
  recovery is `scaffold mq enqueue --pr <N>` (or `make mq-enqueue`) after the
  fix, which remote agents must route through a colocated agent until a
  label-removal protocol exists
- (mvp) gate_executor decision recorded: `gha-selfhosted` (default — `ci`
  component installed, runner registration in the day-one checklist) or
  `local-poller` (poller scheduled via cron/launchd, no workflows)
- (mvp) batch_cap set consciously: 16 when `gate_command` is the affected gate,
  8 when it is the full gate (single knob — spec Plan-1 note)
- (deep) Post-merge-red drill documented: a deliberate red landing walked
  through fix-forward and revert paths in docs/merge-queue.md
- (deep) Calibration ritual: revisit batch_cap and gate timings from
  `scaffold mq stats` after the first week of multi-agent work

## Methodology Scaling
- **deep**: Full runbook with the red drill, calibration ritual, and the
  remote-agent seam (`mq:ready` label) documented.
- **mvp**: Install + minimal runbook (enqueue flow, ejection, pause recovery).
- **custom:depth(1-5)**:
  - Depth 1: as mvp — install + minimal runbook (enqueue flow, ejection,
    pause recovery).
  - Depth 2: as mvp — no additional detail yet.
  - Depth 3: + gate_executor rationale and quarantine policy.
  - Depth 4: + the post-merge-red drill.
  - Depth 5: + the calibration ritual and the remote-agent seam
    (`mq:ready` label).

## Mode Detection
Update mode if docs/merge-queue.md exists. In update mode: re-run
`scaffold agent-ops install --component merge-queue` (and `ci` per
gate_executor) to refresh stale bundle files (`scaffold agent-ops check`
reports drift), preserve the project's tuned `merge_queue:` config values, and
re-generate only runbook sections whose upstream contracts changed.

## Update Mode Specifics
- **Detect prior artifact**: docs/merge-queue.md exists
- **Preserve**: tuned `merge_queue:` values (batch_cap, poll_seconds, timeouts,
  gate_executor), quarantine list contents, any project-specific red-drill notes
- **Triggers for update**: `scaffold agent-ops check` reports a stale bundle,
  gate commands renamed in dev-env-setup, gate_executor switched
- **Conflict resolution**: if the project still documents lease- or
  merge-slot-serialized merging as primary, flag the discrepancy and replace
  with the enqueue flow only on explicit confirmation (merge-slot remains
  documented as the no-component fallback)

## Instructions

### 1. Decide the gate executor
Default `gha-selfhosted` (day-one CI on the user's own Mac, $0). Choose
`local-poller` only when the user explicitly refuses `.github/workflows/` —
record the choice in `.scaffold/agent-ops.yaml`:
```yaml
merge_queue:
  gate_command: "make check-affected"
  full_gate_command: "make check"
  batch_cap: 16          # 8 if gate_command is the full gate
  gate_executor: gha-selfhosted   # or local-poller
```

### 2. Install the components
```bash
scaffold agent-ops install --component merge-queue
# unless gate_executor is local-poller:
scaffold agent-ops install --component ci
scaffold agent-ops check
```
Then register the mq-guard hook per the git-workflow step's instruction 4.

### 3. Wire the executor
- `gha-selfhosted`: put `scripts/ops/setup-gh-runner.sh` in the day-one
  checklist in docs/dev-setup.md (it needs the human's gh admin auth once);
  until the runner registers, pushed workflows simply queue.
- `local-poller`: schedule `make post-merge-watch` every ~10 minutes via
  cron/launchd and document the schedule in docs/dev-setup.md.

### 4. Generate docs/merge-queue.md
Synthesize from the knowledge entries and the ACTUAL installed commands (never
invent): the enqueue flow (`make mq-enqueue PR=<N>` after mmr review passes;
move to the next bead immediately), what landing looks like (PR comment, bead
closed by the daemon), ejection recovery (failing log comment, bead reopened,
NEEDS_REBASE vs EJECTED vs CANCELLED-already-applied; re-enqueue after the fix
— a lingering `mq:ready` label does NOT re-enqueue an ejected PR), `.mq/PAUSED`
semantics and recovery (NRS violation: investigate tree divergence before
unpausing; partial landing: verify the base with the post-merge suite first;
post-merge red: fix forward or revert, then `rm .mq/PAUSED`), flake quarantine (`.mq/quarantine.txt`, auto
bead, fix-SLA), calibration (`scaffold mq stats`), and the deliberate
direct-merge procedure (human-only). Close with a short **Alternatives**
note (spec D2): Mergify's free tier (private repos, ≤5 active contributors —
agents sharing one identity count once) offers a SaaS merge queue with
speculative batching for projects wanting GitHub-visible queue state or
multi-machine agents from day one; caveats — proprietary control plane in the
critical path, free-tier tolerance for continuous agent PR volume unverified —
which is why the local daemon is the default.

### 5. Update CLAUDE.md
Key Commands rows: `make mq-enqueue PR=<n>`, `make mq-status`, `make mq-stats`,
plus (local-poller only) `make post-merge-watch`. Cross-reference
docs/merge-queue.md from the Committing/PR Workflow section.
