# Design: Slim `review-pr` + `review-code` to MMR-dispatch core

**Date:** 2026-07-11
**Status:** Approved (pending spec review)
**Supersedes/completes:** PR #759 (`chore(review): slim review-pr meta-prompt to MMR dispatch core`)
**Related:** `docs/superpowers/plans/2026-05-22-mmr-t2j-wrapper-stopgap.md` (the wrapper-hash stopgap this retires)

## Problem

`content/tools/review-pr.md` (676 lines) and `content/tools/review-code.md` (821
lines) are meta-prompts an AI agent must **hand-execute**. `scaffold run
review-pr` is a pure prompt printer — it does zero orchestration; every channel
dispatch, the Superpowers subagent dance, reconciliation, verdict derivation,
and ~230 lines of embedded 3-strike hash bash are steps the agent is told to
perform. That is why review has been unreliable: agents skip steps, half-run the
bash, or background a channel and capture empty output.

Meanwhile the bundled MMR CLI (v3.1.0) now does this work natively:
`mmr review --sync --format json` performs multi-channel dispatch (codex +
claude + grok + antigravity), reconciliation, transient-failure compensating
passes, and verdict + exit codes; `--session/--max-rounds` gives native
round-bounding with a stable `finding_key` that uses the *same* identity
components as the wrapper hash. PR #759 correctly moved review-pr toward "run one
`mmr review`," but it (a) breaks CI, (b) drops the Superpowers channel to
optional, (c) removes the 3-strike rule without wiring the native replacement,
and (d) references nibble-only files. It also left review-code untouched,
creating drift.

## Goal

Make both review meta-prompts reliable by delegating dispatch / reconcile /
verdict / round-bounding to the MMR CLI, **while preserving**:
- 5-source coverage on Claude Code (4 MMR CLIs + the Superpowers agent channel),
- native 3-round bounding (replacing the deleted wrapper-hash stopgap),
- the existing scope-detection logic (review-code's committed + staged +
  unstaged bundle),
- the arg-parsing contract guarded by `tests/arg-passthrough-content.bats`.

Out of scope: `content/tools/post-implementation-review.md` (a genuinely
different two-phase per-story workflow).

## Design

### A. `content/tools/review-pr.md` — slim to the MMR core

Keep the good parts of #759 and fix its gaps:

1. **One binding invocation** with native round-bounding:
   ```bash
   mmr review --pr "$PR_NUMBER" --session "pr-$PR_NUMBER" --max-rounds 3 \
     --sync --format json ${FIX_THRESHOLD:+--fix-threshold "$FIX_THRESHOLD"}
   ```
   `--session` + `--max-rounds 3` is the **native replacement** for the deleted
   `.scaffold/review-attempts/` 3-strike bookkeeping. MMR enforces it engine-side
   using its stable `finding_key`.
2. **Superpowers channel: mandatory, but one crisp step.** After the `mmr review`
   call: dispatch `superpowers:code-reviewer`, write its findings (MMR schema:
   `severity`, `location`, `description`) to a temp file, and
   `mmr reconcile "$JOB_ID" --channel superpowers --input <file>`. One tightly
   marked step — not the three sprawling steps of today, and not "optional." Note
   inline that non-Claude harnesses (e.g. the Codex recipe) run the 4 CLI
   channels only, by design.
3. **Preserve the arg contract** (guarded by `arg-passthrough-content.bats`):
   the EXECUTE preamble string (`You are now executing the ...review-pr...
   workflow`), the `<arguments>$ARGUMENTS</arguments>` delimiter, and the
   `--fix-threshold[[:space:]=]+(P[0-3])` parsing regex.
4. **Keep** the diff-contamination cross-check
   (`gh pr diff "$PR_NUMBER" --name-only`) and verdict handling (never merge on
   `blocked` / `needs-user-decision`; exit codes 0 / 2 / 3).
5. **Fix references:** fix-loop policy → `docs/review-standards.md` (created in
   §C); replace the nibble `scripts/cli-pr-review.sh` fallback with the Scaffold
   `multi-model-review-dispatch` knowledge entry (which exists).

Target length: ~90–110 lines (from 676).

### B. `content/tools/review-code.md` — same slimming, keep scope detection

review-code already has a correct "Primary: MMR CLI + Agent Reconcile" block
(current lines 63–131) mapping each scope to the right `mmr review` call. **Keep
that scope logic** — it is the genuinely useful part:
- Default (no flags): synthesize the combined bundle (committed via merge-base +
  staged + unstaged) and pipe to `mmr review --diff -`.
- `--staged` → `mmr review --staged`.
- `--base`/`--head` → `mmr review --base … --head …`.

**Delete** everything after it that duplicates MMR: Step 4 manual per-channel
dispatch (Codex/Antigravity/Claude/Grok blocks), Step 5 embedded review-prompt
template, Step 7a hash bookkeeping, Step 7b Beads bridge, verbose reporting.

**Add** to the retained core: `--session` (derived as
`"$(git rev-parse --abbrev-ref HEAD)@${BASE_REF:-main}"`) + `--max-rounds 3`, and
the same crisp mandatory Superpowers reconcile step. Point the fix loop at
`docs/review-standards.md`.

Target length: ~120–150 lines (from 821). review-code stays longer than
review-pr because its scope detection is legitimately more complex.

### C. `docs/review-standards.md` — new, single source of review policy

Extract the review **policy** (currently sprawled across CLAUDE.md's "Mandatory
Code Review" section) into one concise doc the meta-prompts point to:
- fix threshold (project default `P2`, override via `.mmr.yaml` / `--fix-threshold`);
- verdict handling (proceed on `pass`/`degraded-pass`; stop on
  `blocked`/`needs-user-decision`);
- round budget (rounds 1–3 fix every real finding ≥ threshold; round 4+ fix
  P0/P1 and file P2/P3 as Beads) — now enforced by `--max-rounds`, not wrapper bash;
- verify-don't-dismiss, channel independence, foreground-only dispatch.

### D. `CLAUDE.md` — reconcile with the new mechanism

Surgical edits only:
- Replace the "3-round limit (per finding hash) / `.scaffold/review-attempts/`
  is the active mechanism" paragraphs with: round-bounding is now native
  (`mmr review --session … --max-rounds 3`); point to `docs/review-standards.md`.
- Keep channel descriptions and the entry-points table. The Superpowers channel
  stays described as mandatory (which the new crisp step keeps true).

### E. Tests

- **Delete** `tests/review-wrapper-hash.bats` (the helpers it extracts are
  removed from both tools).
- **Add** a guard test (`tests/review-mmr-core.bats`) asserting, for both
  `review-pr.md` and `review-code.md`: presence of `--sync`, `--session`,
  `--max-rounds`, and the mandatory Superpowers wiring (`mmr reconcile` +
  `--channel superpowers`). This prevents silent regression of the two things
  most easily lost in a slim (round-bounding + the 5th channel).
- **Verify** `tests/arg-passthrough-content.bats` still passes unchanged.

### F. `src/core/adapters/codex.ts` — sync the hardcoded recipe

The Codex executor recipes for `review-pr`/`review-code` are hand-maintained
copies that must track the meta-prompt. Update their `mmr review` flags to add
`--session`/`--max-rounds`. Keep their deliberate omission of the Superpowers
channel (Codex treats `scaffold run` stdout as a final result, not executable
steps).

## Verification (TDD)

1. Write the `review-mmr-core.bats` guard test first (red), then edit the
   prompts to green.
2. `make check-all` green (bash + TypeScript), including the drift gate.
3. Dogfood: run the review on the resulting PR itself
   (`mmr review --pr <this PR> --sync`) to prove the slimmed prompt works
   end-to-end and returns a verdict.

## Release

After merge, cut **one** release covering the merged knowledge-freshness batch
(#747–#756) **and** this review-tooling overhaul. This is a behavior change to
shipped tools → **minor** bump: **v3.41.0**. Update `CHANGELOG.md`; update
`README.md` only if user-facing install/usage guidance changed (likely not).
Tag `main`, create the GitHub release, verify npm + Homebrew per the maintainer
runbook.
