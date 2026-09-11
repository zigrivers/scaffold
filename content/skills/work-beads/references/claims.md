## Step 2 — Per-bead loop

**2.1 Claim first, then validate (atomic; from the primary checkout).** The bead
leaves `bd ready` the instant you claim it, so claim FIRST and evaluate it while
it is invisible to peers — this shrinks the collision window to zero.

a. **Claim** the ranked candidate: `bd update <id> --claim` — one atomic
   round-trip that sets assignee + `in_progress`, and fails (exit 1,
   `already claimed by <actor>`) if anyone else holds it. Never claim by editing
   the status field — a plain write cannot detect a concurrent claimant.
   - **exit 1 = LOST RACE** (normal traffic at high parallelism, not an error):
     add the ID to the SKIP-SET and take the next candidate. Do **not** retry it
     and do **not** defer it — it is another agent's LIVE claim; deferring would
     sabotage them.
   - **exit 0 = you hold it.** Immediately stamp a lease (§6.1) so a crash frees
     it: `bd update <id> --set-metadata lease_until=<now+TTL>` (default TTL 4h —
     compute the stamp as `date -u +%Y-%m-%dT%H:%M:%SZ` plus your TTL: UTC, whole
     seconds, `...Z`, the exact form the reaper parses; do NOT use `--defer` for
     the lease, which would only HIDE the bead instead of releasing it on expiry).
     Then run the validation gates in (b). If the project has build observability (a
     `.scaffold/` directory + the `scaffold` CLI), also
     `scaffold observe event claim --task <id>` — feature-detect, skip silently.

b. **Validation gates** (they read shared state, so they run AFTER the claim):
   - **stale-park re-check — run this FIRST; it is cheap and usually clears the
     bead.** If the bead carries a park/cooldown/`BLOCKED` note, RESOLVE every
     artifact that note names before you honor it: `gh pr view <n> --json state`
     for each cited PR, `bd show <id>` for each cited bead, `git worktree list`
     plus `gh pr list` for a cited peer worktree or branch. A park note is
     evidence about the moment it was written, not a standing verdict — once
     every cited PR is MERGED/CLOSED and every cited bead is closed, the park is
     STALE: append a dated unpark note recording what you verified, and proceed.
     **Never re-park a bead by restating an earlier note you did not
     re-verify** — that ratchet is what silently freezes a backlog, because each
     pass adds a "recheck: still parked" line that reads as fresh evidence to the
     next agent. A merged PR is not a conflict; a closed bead is not a blocker;
     a branch left behind by a squash-merge is not live work.
   - duplicate-work scan: `scripts/setup-agent-worktree.sh --preflight-only --task "<bead title>"`
   - open-PR-surface conflict: does any open/draft PR touch the same module,
     migration sequence, or shared single-writer code? (docs/git-workflow.md)
   - **epic-sibling re-poll (§6.3 — Window C / semantic-dup defense):** if the
     bead's parent/epic is under active work, re-poll `gh pr list` (open AND
     draft) for a PR referencing ANY sibling under the same parent (`bd dep tree`
     / `bd children <parent>`); a sibling PR on the same surface is a conflict.
     Re-poll again right before each rebase — siblings can appear mid-flight.

c. **On a gate REJECT** (you hold it, but it is a dup/conflict — a PERSISTENT
   condition that would reject the next agent too), cooldown-release in ONE
   command so the whole fleet backs off (prevents a claim→reject→release
   busy-loop).

   **Two hard rules before you write the release:**

   1. **Use `bd note` / `--append-notes`, NEVER `bd update --notes`.** `--notes`
      REPLACES the field — one batch release using it has destroyed the
      accumulated investigation history on 15 beads in a single command
      (recoverable only via `bd history <id> --json`). Notes are append-only in
      practice; treat `--notes` as reserved for a bead you just created.
   2. **The defer reason MUST name something a later agent can re-resolve** — a
      PR number, a bead id, a branch, a file path, or a command that fails.
      Write the re-check condition explicitly ("resume when #1306 merges"). A
      reason that cannot be checked cannot be cleared, so the bead never comes
      back. **Banned as standalone reasons:** "not autonomously shippable this
      session", "multi-session product/surface", "soft-park", "formalized out
      of ready". Those describe YOUR capacity right now, not the bead's state.
      If the bead is genuinely too big, **split it** (children under
      `--parent`); if it needs a human decision, say which decision and who
      owns it.

   Never mass-defer to drain `bd ready`. An empty queue is not the goal; a
   queue whose every entry has a checkable blocker is. If you are deferring
   more beads than you worked, stop and report instead.

   Then append a dated cooldown-release note naming the blocker, compute an
   ABSOLUTE UTC instant, and release:

   ```bash
   bd note <id> "cooldown-release ($BEADS_ACTOR): <what rejected it — PR/bead/surface>"
   until_ts="$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)"
   bd update <id> --assignee "" --defer "$until_ts" --unset-metadata lease_until
   ```

   That clears ownership + the lease AND leaves the bead `deferred` (out of
   `bd ready`). **bd itself NEVER wakes it** (through bd 1.1.2 —
   gastownhall/beads#5289): restore is the shipped sweeper —
   `make prune-merged` auto-applies `scripts/reap-lapsed-defers.sh` after every
   merge sweep, and report mode runs at orient — or a manual `bd undefer`. Do
   NOT add `--status open` to the release — it cancels the defer you just set
   (that cancellation is exactly what the sweeper's wake does later, on
   purpose). Do NOT pass a RELATIVE
   offset (`+1h`): bd (≤1.1.2) serializes it as local wall-clock stamped `Z`
   (gastownhall/beads#5233), so west of UTC the cooldown lands in the PAST (and
   `+30m` reads as 30 MONTHS). Add the ID to the SKIP-SET and take the next
   candidate.

   **Escalate instead of cycling:** if the bead ALREADY carries 2+ prior
   cooldown-release notes for the same cause, the condition is not going to
   clear on its own — do NOT re-defer. Append a `Wait:` note naming exactly
   what must change (`Wait: resolve duplicate against <id> — human triage`);
   the sweeper holds `Wait:` beads, so it stays parked deliberately. Report it
   in the Step 3 slots for human triage.

d. **All gates pass → this is your bead.** Go to worktree setup (2.2).

**Generic no-ranking path (§4.2):** for a bare `/work-beads` (or a materialized
plan queue via `--has-metadata-key plan_task_id`, or a label scope) you MAY
substitute the one-shot `bd ready --claim [filters] --json` for the
rank-then-claim of (a) — add `--exclude-label gt:slot`. This changes only HOW the
candidate is chosen; it does NOT skip validation: the claimed bead still stamps
the (a) lease, runs the (b) gates, and on reject follows the SAME single-command
cooldown-release in (c). It still requires a distinct `BEADS_ACTOR`.
