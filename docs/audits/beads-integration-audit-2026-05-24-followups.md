# Beads Integration — PR #355 Follow-Up Findings

**Date:** 2026-05-24
**Source:** MMR review round 16 on PR #355 (https://github.com/zigrivers/scaffold/pull/355)
**Status:** Not blocking merge per hard-cap decision after 16 review rounds. File as follow-up Beads issues.

PR #355 went through 16 MMR review rounds. Earlier rounds caught structural and correctness issues that were fixed; later rounds caught a long tail of incomplete migration sweeps and polish items. Per the explicit "merge regardless" decision after round 16, the following findings ship as known issues to be addressed in a follow-up PR.

## Open findings (round 16)

### P1 — `eval-craft.md` task-ID regex out of sync with new convention

- **Location:** `content/knowledge/core/eval-craft.md:774` (and related at line 1019)
- **Issue:** The TODO/task-ID adherence eval filters with `grep -v '\[BD-'`, but the rest of this PR migrates the canonical TODO format to lowercase `[bd-<id>]`. A TODO written as `// TODO [bd-a3f8]: …` will fail the eval.
- **Suggested fix:** Update the regex to match either case: `grep -vE '\[bd-|\[BD-'`. Update the surrounding prose to document that the eval accepts both old and new formats during the migration window.
- **Why deferred:** Required carefully threading the migration through evaluator logic; out of scope for the closing rounds of this PR.

### P2 — Markdown table pipe escaping in `prompt-pipeline.md`

- **Location:** `content/tools/prompt-pipeline.md:30`
- **Issue:** The install-script entry uses `\|` to escape a pipe inside an inline-code cell. Some renderers display the backslash literally instead of interpreting it as an escape.
- **Suggested fix:** Use HTML-entity escape `&#124;` inside the cell, OR reformat the row so the install command lives outside the table cell.

### P2 — `secondary-formats.md` PR example still uses uppercase prefix

- **Location:** `docs/architecture/data/secondary-formats.md:717`
- **Issue:** The pr-integration example still creates PRs as `[BD-<id>] type(scope): …`. One more incomplete sweep from F-2.7.
- **Suggested fix:** Update to `[bd-<id>] type(scope): …`.

### P2 — Merge-slot release runs even on no-acquire paths

- **Location:** `content/pipeline/build/multi-agent-start.md:195` (and the matching block in `multi-agent-resume.md`)
- **Issue:** The post-PR release step `bd merge-slot release` runs whenever `[ -d .beads ]`, but the acquire block is gated on a 3+-agent decision the prompt leaves to the agent's judgment. An agent that decided not to acquire still hits the release call, which will fail when invoked by a holder who never acquired.
- **Suggested fix:** Track whether acquire actually ran (e.g., set a `slot_acquired=true` flag inside the acquire block), and gate the release on that flag.

### P3 — `.mmr.yaml` comment description out of sync with shipped impl

- **Location:** `.mmr.yaml:34`
- **Issue:** The commented-out template says `--external-ref "mmr-<job-id>"`, but the shipped Step 7b uses `mmr:$finding_hash` (no job ID) so dedupe across job IDs can work. Comment drift.
- **Suggested fix:** Update the comment to reflect the actual external-ref shape: `mmr:<finding-hash>`.

## How to address

Create a single follow-up Beads issue (or PR) titled something like "PR #355 round-16 follow-ups". Estimated effort: ~30-60 minutes of small edits. None are blocking real-world use of the integration that just landed.

## Earlier-round findings still open

The single upstream-MMR finding (`packages/mmr/src/config/schema.ts:16`) that surfaced in rounds 1-9 is resolved by the rebase onto main (T1-A → T1-D landed on main while PR #355 was being polished).
