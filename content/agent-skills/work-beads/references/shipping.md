# Build, review, and ship

**2.2 Worktree:** `scripts/setup-agent-worktree.sh <name> --install --task "<bead title>" --bead <id>`
with `<name>` = your existing actor minus any `agent-` prefix
(`${BEADS_ACTOR#agent-}` — never a fresh `agent-name.sh` call here, which would
mint a DIFFERENT name and desync the worktree from your claims), then
`cd .worktrees/<name>`. The setup script persists your exported `BEADS_ACTOR`
into the worktree's `.agent-env` VERBATIM (only deriving `agent-<name>` when
none is exported), so resume and heartbeats always run as the same actor that
made the claim. The `--install` flag runs the
configured worktree setup commands (dependency installs) — omitting it is a
known `make check` breaker, because a plain invocation creates the worktree but
installs nothing. `--bead <id>` puts the bead id on the branch (below); an
older installed script without the flag errors on it — then drop the flag and
keep the rest of the convention. Need a live stack? `make staging-up` **from
the worktree** (never the primary).

**2.3 Build:** use the Superpowers discipline if available (brainstorm → plan →
TDD); otherwise write the failing test first. Commit and push frequently on
your branch. **Open a draft PR on the first push — the draft is the visible
claim.** Bead traceability (every surface a human scans carries the id):
- **Branch** = `agent/<name>/<bead-id>` (what `--bead` created): open branches
  read as the roster of in-flight beads.
- **Commit subjects** keep the normal Conventional-Commits form and append the
  bead id as a trailing tag — `type(scope): subject (<bead-id>)`
  (e.g. `feat(api): add webhook rate limiter (bd-a3f8)`). The type stays first,
  so commitlint/semantic-release work unchanged.
- **PR title** carries the same trailing `(<bead-id>)` — the squash-merge
  subject comes from the PR title, so this is what makes bead ids visible in
  `git log --oneline` on main.
- **PR body** carries `Closes <id>` — the CANONICAL machine-readable mapping
  (the stale-claim reaper and duplicate-work gates parse it); the title/branch
  copies are redundant human-first surfaces, never a substitute.

**Lease heartbeat + lost-claim check (§6.1, §5.2):** on each push, first re-read
your bead, then renew its lease. This is both the liveness signal AND your
self-heal against a wrongful reap:
1. **Re-read:** `bd show <id> --json`. If the assignee is no longer your
   `BEADS_ACTOR` (or the lease was cleared), your claim was reaped/reassigned out
   from under you — try to re-claim `bd update <id> --claim`: exit 0 = you have it
   back, keep going; **exit 1 = another agent now holds it, so STOP and report**
   (never double-work a bead someone else owns).
2. **Renew:** `bd update <id> --set-metadata lease_until=<now+TTL>`, computing the
   stamp as `date -u +%Y-%m-%dT%H:%M:%SZ` **plus your TTL** (default 4h) — always
   UTC, whole seconds, `...Z` (the exact form the reaper parses; avoid fractional
   seconds or numeric offsets). A renewed lease stays far beyond the reaper's grace
   margin, so a live agent is never evaluated as expired; a crashed agent stops
   renewing and its lease lapses, which frees the bead.

A long build with no pushes could let the lease lapse — renew explicitly in 2.6
before a long-running gate. *([HOST] a project may wire the renew into a post-push
hook; the cadence is the host's to bind.)*

**2.4 Docs travel with the PR:** resolve the bead's `docs:` tail and update
every stale doc in this same PR. Check the project-invariants section of
AGENTS.md (if the project defines one) before shipping.

**2.5 Deliberate scope deferral = bead.** The acting agent may use evidence and
the original acceptance criteria to decide whether a verified defect is inside
the PR's required scope. File a bead only when the task owner explicitly removes
work from that scope or a verified defect is outside it, and only when the work
passes all five follow-up gates in 2.7. A verified defect inside required scope
is `fix-now` or `block`, never a follow-up. Suggestions, severity labels, and
unsupported or low-value findings do not create beads.
Review-origin work must not create recursive follow-up beads.

```bash
bd create "<imperative title>" -t task -p 2 --deps discovered-from:<id> \
  -d "<what, why, where (file/function)>; docs: <paths or none>"
```

A TODO comment, PR note, or mental note is NOT tracking.

**2.6 Verify yourself:** personally watched — a subagent's or reviewer's claim
doesn't count. On a merge-throughput project, `make check-affected` green on the
branch HEAD is the gate (the post-merge full suite is the net for anything it
skips). On a project WITHOUT the merge queue there is NO post-merge net, so the
gate is the full `make check`. Either way, run the full `make check` when you
touched gate config, shared test utils, env files, or migrations (the
force-full list in docs/tdd-standards.md) — and whenever in doubt. Docker contention (testcontainer timeouts, DockerException)
is not a code defect: `make docker-doctor` → `make tc-reap && make
staging-prune` → re-run. Never enqueue on a red gate. Never `docker system
prune`. Long local test loops run at reduced priority so the merge lane stays
fast on a saturated machine: `taskpolicy -c utility make check-affected`
(macOS; skip the wrapper where `taskpolicy` is absent).

**2.7 Review and merge:** `mmr review --pr <N> --session pr-<repo-id>-<N>-cycle-<C> --round <R> --max-rounds 3 --sync --format json`.
- Check the diff is uncontaminated first: `gh pr diff <N> --name-only` shows
  only your intended surface.
- Surface channel auth failures to the user with recovery commands; never
  silently skip a channel.
- The original bead, its acceptance criteria, and mandatory repository or
  product guardrails bound the PR's required scope.
- Mandatory guardrails include at minimum security, privacy, and data integrity
  (including preventing data loss or corruption), plus every repository or
  product safeguard required by project instructions.
- Group repeated findings by root cause. Record exactly one finite disposition:
  `fix-now`, `block`, `reject:<reason>`, or `follow-up:<bead-id>`.
- If a verified `reject:<reason>` still blocks MMR, copy the evidence to the PR
  ledger, run `mmr ack add <finding-key> --job <job-id> --scope job --reason
  "reject: <evidence>"`, then recompute with `mmr results <job-id>`. Never
  acknowledge a verified `fix-now` or `block`.
- A model's severity label never creates a bead. Create one follow-up per root cause
  only when the finding is reproducible, actionable, non-duplicate, worth scheduling,
  and outside the PR's required scope.
- Round 1 verifies root causes and fixes required defects. Rounds 2–3 review new
  changes and collapse repeats into the existing dispositions.
- Hard cap: a maximum of three rounds per review cycle. Review stops when every
  root cause has a disposition and no verified fix-now or block item remains.
  Do not rerun review merely to clear suggestions or obtain a cosmetically clean
  response.
- If round three finds a reproducible acceptance-criteria or required-safeguard
  defect, make a concrete repair, add or update focused regression proof, rerun
  the required gate, then start a new bounded cycle on the same PR. Reset to
  round one and review the new exact head. No owner approval is required for
  this in-scope remediation.
- Duplicate, stale, hypothetical, speculative, cosmetic, or already-dispositioned
  findings cannot start a new cycle. Collapse repeats into the existing ledger.
- A verified acceptance-criteria or mandatory-guardrail defect blocks merge
  regardless of its model-assigned severity. A follow-up bead cannot make the
  current PR safe.
- Stop when the user asks to stop. Otherwise stop only for a true external
  dependency, missing credentials or authority, a destructive action, a material
  product decision outside the acceptance criteria, or a demonstrated technical
  plateau after safe approaches are exhausted. Record exact evidence. An
  unresolved required safeguard is not a plateau; continue repairing it.
- Merge only when the final exact head has completed the configured MMR channel
  floor, required gates are green, every finding is dispositioned, and no
  verified blocker remains.
- **Merge queue installed** (`scripts/mq-guard.sh` exists — the
  merge-throughput step installs it): after the review passes, tear down
  staging first if you brought a stack up this bead (from INSIDE the worktree:
  `make staging-down`; skip when staging was never installed or never started —
  a non-zero exit then must not block the enqueue). Then **enqueue and move
  on**: `make mq-enqueue PR=<N>`. Do NOT merge, do NOT wait, do NOT rebase in
  a loop — the daemon batch-tests against latest main, lands green PRs
  (closing your bead and commenting on the PR), and on ejection comments the
  failing log and REOPENS the bead so any agent picks up the fix.
  `NEEDS_REBASE` ejection means your PR no longer applies onto main: rebase,
  push, re-enqueue. Queue state: `scaffold mq status` (a `.mq/PAUSED` banner
  means merges are held — read docs/merge-queue.md before touching anything).
  Never run `gh pr merge` yourself — the mq-guard hook blocks it; the
  deliberate-override procedure is in docs/merge-queue.md and is human-only.
- **No merge queue** (`scripts/mq-guard.sh` absent): fall back to the
  serialized manual merge. If the project has a merge slot (`bd merge-slot
  check` reports one), serialize EVERY merge: loop on `bd merge-slot acquire`
  until it succeeds (acquire does NOT block; `--wait` only queues you), then
  re-verify with `bd merge-slot check --json`, merge with `gh pr merge <N>
  --squash --delete-branch`, then `bd merge-slot release` — release even if
  the merge fails, with ONE holder identity across acquire → merge → release
  (a fresh per-command `$$` strands the slot). Tear down staging first from
  inside the worktree exactly as above. Then from the primary:
  `make main-sync && make prune-merged`.

**2.8 Close out:** With the merge queue, the DAEMON closes the bead when the
PR lands — do not `bd close` an enqueued bead yourself; confirm later via
`scaffold mq status --pr <N>` or `bd show <id>`, and treat a reopened bead as
the ejection signal. Without the queue (fallback path), close manually from
the primary after the merge is verified: `bd close <id>`. Noticed a repo-file
fix after merging? Micro follow-up PR; never edit the primary checkout
directly.
