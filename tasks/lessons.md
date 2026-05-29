# Lessons Learned

Patterns and anti-patterns discovered during development. Review before starting new tasks.

## Patterns (Do This)

<!-- Add patterns as you discover them -->

## Anti-Patterns (Avoid This)

<!-- Add anti-patterns as you discover them -->

- After a refactor that swaps out a helper (e.g. `os.homedir()` → `resolveSessionRoot()`),
  re-run the FULL package gate (`npm run check`), not just the targeted test. A removed last-use
  leaves a dead import that the focused test won't catch but ESLint (and CI) will. Caught on
  PR #413 / Task 17: dropping `os.homedir()` from `review.ts` orphaned `import os from 'node:os'`.

- After merging a task PR you land back on `main` (the merge/pull leaves you there). CREATE THE
  NEXT TASK'S BRANCH **before** writing or committing anything — `git checkout -b feat/...` first.
  On v3.30 Task 26 I committed a test straight to `main` and pushed it; `ci.yml` triggers only on
  `pull_request`, so that push bypassed CI entirely (caught it, it was test-only + locally green +
  reviewed). Habit: first action of every task = branch.

- MMR tests must NOT execute `packages/mmr/dist/index.js` — CI runs the vitest suite WITHOUT
  building the mmr dist, so any `execFileSync('node', [dist/index.js, ...])` test passes locally
  (after a build) but fails CI with "Cannot find module …/dist/index.js". Exercise the command's
  exported `handler` directly instead (mock `process.exit`/`console`, set `process.env.HOME` and
  spy `process.cwd`), as `review-session-link.test.ts` does. Bit PR #427 (Task 21 ack-cli).

- When you change how ONE command resolves a shared on-disk path, audit EVERY command that
  constructs the same path and centralize them on one helper. PR #413 made only `review.ts`
  honor `MMR_HOME` for the jobs dir while `jobs`/`status`/`results`/`reconcile` still read
  hardcoded `~/.mmr/jobs` — a split-brain where linked jobs were invisible to the rest of the
  lifecycle. Grep for the hardcoded path (`grep -rn "homedir()" src/commands`) before assuming a
  path change is local. Two independent review channels (Gemini + Grok) caught this — cross-channel
  consensus is a strong real-bug signal; weight it above single-source style nits.

- Treat review findings as claims to verify, not orders. PR #413 round 5: Gemini raised a P1
  "createJob lacks session_id" — false (the call passes it and JobStore persists it). Verify
  against source before "fixing"; document the waiver with evidence. Also watch for a finding that
  recurs while the reviewer flip-flops on the fix (exit-strategy here oscillated process.exit vs
  exitCode+return across rounds 1/3/5) — settle it once on engineering merit (testability) and stop
  re-litigating regardless of later wording.

- Do not try to use Beads or `bd` commands in this repository's day-to-day workflow. Legacy `.beads/` artifacts and old docs may still exist, but current work should not assume Beads is an active dependency.

## Common Gotchas

<!-- Add gotchas specific to this project -->

- Historical docs may still mention Beads. Treat those references as stale unless the user explicitly asks to restore Beads support.
