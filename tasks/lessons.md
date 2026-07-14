# Lessons Learned

Patterns and anti-patterns discovered during development. Review before starting new tasks.

## Patterns (Do This)

<!-- Add patterns as you discover them -->

## Anti-Patterns (Avoid This)

<!-- Add anti-patterns as you discover them -->

- **A CLI channel error message must name the ACTUAL cause, not the last failed step.**
  grok often cancels a review mid-run under heavy concurrent load (`stopReason:
  "Cancelled"`, ack-only `$.text`, no findings). MMR's `unwrap-jsonpath` parser only
  read `$.text`, so it threw the *symptom* ("No JSON object found in output") and hid
  the *cause* (the run was cancelled). Fix: give `unwrap-jsonpath` an optional
  `incomplete` guard (`status_path` + `values` + `message`) that inspects the envelope's
  terminal-status field on a parse failure and reports the honest cause. When debugging
  a "parser" failure, check whether the upstream run even COMPLETED before blaming the
  parser. Also: do NOT salvage findings from a cancelled run's `thought` field — partial
  findings from an interrupted review could wrongly approve a PR. Ruled out along the way:
  `track-cli` (transparent `exec`, no signals/timeout) and MMR's dispatch timeout (300s;
  a timeout yields `status: timeout`, not a `Cancelled` envelope). Isolated small reviews
  complete fine — cancellation is grok-runtime preemption on longer multi-turn reviews
  under load, already mitigated by MMR's `compensating-grok` pass (a `failed` channel
  triggers compensation).

- **A `--tools` allowlist does NOT stop grok from BUILDING the other built-in tools.**
  grok 0.2.99 (auto-updated ~2026-07-11) shipped a self-inconsistent default for its
  built-in `run_terminal_cmd` tool (`auto_background_on_timeout: true` while
  `enabled_background: false`), and grok validates *every* built-in tool at session-build
  time — *before* applying `--tools web_search,web_fetch`. Result: EVERY headless
  `grok -p` / `--prompt-file` run aborts with `Couldn't create session: ... agent
  building failed: ... RequirementError { tool: GrokBuild:run_terminal_cmd, ... }` and
  exit 1, degrading MMR's grok channel. Fix: pass `--disallowed-tools run_terminal_cmd`
  so grok never builds the broken tool. Reproduces in a real HOME too, so it is a
  grok-side regression, not an MMR neutral-posture bug. When a CLI review channel breaks
  "in the last couple of days," suspect a silent CLI auto-update (grok has
  `auto_update = true` + weekly stable releases) and REPRODUCE the raw CLI invocation
  before touching MMR wiring — a one-word `--output-format json` smoke test surfaces the
  exact error and confirms the JSON envelope (reply still at `$.text`; v0.2.97 added
  additive `usage`/`modelUsage` fields that do not break the parser).

- After a refactor that swaps out a helper (e.g. `os.homedir()` → `resolveSessionRoot()`),
  re-run the FULL package gate (`npm run check`), not just the targeted test. A removed last-use
  leaves a dead import that the focused test won't catch but ESLint (and CI) will. Caught on
  PR #413 / Task 17: dropping `os.homedir()` from `review.ts` orphaned `import os from 'node:os'`.

- After merging a task PR you land back on `main` (the merge/pull leaves you there). CREATE THE
  NEXT TASK'S BRANCH **before** writing or committing anything — `git checkout -b feat/...` first.
  On v3.30 Task 26 I committed a test straight to `main` and pushed it; `ci.yml` triggers only on
  `pull_request`, so that push bypassed CI entirely (caught it, it was test-only + locally green +
  reviewed). Habit: first action of every task = branch.

- NEVER bundle `git push` with `gh pr merge` (or any merge that reads the remote branch) in the
  same step when the branch has unpushed commits. This repo's `pre-push` hook runs the full bats
  suite (minutes), so a backgrounded/slow `git push` may not have finished when the merge reads the
  remote ref — the unpushed commit silently won't be in the squash. Shipping v3.32.0 I bundled
  `git push && gh pr merge --squash` for the release-prep version-bump commit; the push lagged
  behind the hook, the squash merged the branch WITHOUT the bump, and `main` briefly carried the
  new feature at the OLD version string (3.31.1). Caught it immediately (`main` still showed
  3.31.1), redid release-prep on a clean branch (PR #464), then tagged — but it cost an extra
  release-prep PR. Habit: `git push` as its OWN step, CONFIRM the ref landed
  (`git ls-remote origin <branch>` shows your local HEAD SHA), THEN `gh pr merge`. Same caution for
  tag pushes feeding `publish.yml`. Related: the slow-push gotcha under "Common Gotchas".

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

- A slow/quiet `git push` in THIS repo is the `pre-push` hook running the full
  bats suite (85+ tests, several minutes), NOT a network/auth/credential hang.
  Do not kill it early or start diagnosing HTTP/credentials. Signs you're
  watching the hook, not a hang: output shows `1..N` then `ok 1 …` (bats TAP).
  If `make check-all` is already green on the exact commit, push with
  `git push --no-verify`; otherwise let it finish. A trailing
  `osxkeychain store: No such file or directory` line is a separate, NON-FATAL
  credential-CACHING warning (a broken `credential.helper = /usr/bin/osxkeychain`
  entry in `~/.gitconfig`); the working homebrew `osxkeychain` helper still
  authenticates, so it never blocks the push. Documented in CLAUDE.md +
  docs/git-workflow.md by commit d1817e8. I misdiagnosed this once and killed a
  healthy push (exit 144), then routed deletions through `gh api` unnecessarily.

- Historical docs may still mention Beads. Treat those references as stale unless the user explicitly asks to restore Beads support.

- When backfilling release notes for config surface changes (e.g. `loop_control.*` fields in mmr 1.4.0), verify runtime consumption (review.ts, results-pipeline, reconciler, etc.) — not just schema presence + tests. Schema-only or partial features must be described precisely ("config shape for future X; only Y is wired") rather than as delivered behavior. Caught in 3.29.0 / 1.4.0 release-prep round 2 review.

- Hardening the agentic grok review channel (2026-05-30): a grok review can answer
  from the wrong context via THREE independent vectors — (1) cross-session memory,
  (2) filesystem `read_file` roaming, (3) host-config injection (it auto-loads
  `~/.grok` skills/MCP/hooks/permissions + cwd `Claude.md`/`Agents.md`). A neutral
  `--cwd` clears ONLY projectInstructions; an isolated `HOME` (+`XDG_CONFIG_HOME`)
  is the lever that zeroes ALL of skills/MCP/hooks/permissions/instructions (verify
  with `grok inspect --json`). Verified hardened tuple on grok 0.2.11/grok-build:
  `--no-memory --tools web_search,web_fetch --no-subagents --no-plan` with
  `HOME`/`XDG_CONFIG_HOME` + neutral cwd pointed at a per-run temp dir. `--tools` is
  a deny-by-default allowlist: it genuinely denies `read_file` (a sentinel-file read
  returned NO_FILE_ACCESS) while keeping web search. `--no-subagents --no-plan` do
  NOT change the JSON envelope (`{"text":...}` parser unchanged). Auth survived
  isolated HOME on macOS (keychain-backed); on Linux/CI auth is file-based in
  `~/.grok/auth.json` so isolated HOME may break it — symlink just `auth.json` into
  the isolated dir if so (verify per platform before shipping). If a future grok
  rejects `--tools`, the fallback must FAIL CLOSED (disable the channel), never run
  FS-open. Spec + plan went through 10 rounds of 4-channel MMR review before a clean
  pass. See `docs/superpowers/specs/2026-05-30-mmr-grok-channel-hardening-design.md`.

## 2026-06-10 — Durable knowledge auto-merge/release workflow (trial-run findings)

- **Freshness PR author is `app/github-actions`, not `github-actions[bot]`.** The
  durable workflow `knowledge-auto-merge-release.yml` defaults
  `ALLOW_AUTHOR='github-actions[bot]'` with FAIL-CLOSED filters, so as shipped it
  would reject every real freshness PR. Fix the default (accept both author forms,
  or key on `is_bot` + branch prefix) before setting `RELEASE_BOT_TOKEN`. The
  in-session trial sweep caught this precisely because the manual path skips the
  author filter while the durable path enforces it. See memory
  `freshness-pr-author-login`.
- **Rapid batch merges undercount KB VERSION.** `knowledge-freshness-version-bump.yml`
  has a single global concurrency group; merging 9 PRs back-to-back cancelled most
  bump runs (KB VERSION 0.1.14 → 0.1.18, not +9). Cosmetic (VERSION lags), not a
  break. The durable workflow's per-merge `wait_version_bump_idle` serialization
  prevents this; the manual sweep does not — so expect VERSION undercount when
  merging a backlog by hand.
- **`gh` GraphQL 401s flap under burst usage.** During a 9-PR merge loop, `gh pr
  view`/`gh pr merge` (GraphQL) intermittently returned `HTTP 401: Requires
  authentication` while REST calls and the token (keyring) stayed valid; retried
  with backoff and all recovered. Treat a lone 401 mid-burst as transient — retry
  with `gh pr view --json state` confirming MERGED, don't escalate to re-auth.
- **Content-quality gate earns its keep:** the freshness automation produced a
  duplicated `## OWASP Top 10` section in security-best-practices (#566). The
  `gh pr diff` skim (Step 2) caught it; held the PR for a human. Watch the
  outlier-sized diff in a batch (+180 lines vs the usual +10).

## 2026-06-11 — Freshness automation fixes validated in production + first batched release

- **Replay catch-up (#2) works:** merging 9 refresh PRs in a rapid batch advanced
  KB VERSION 0.1.18 → **0.1.27 (+9 exact)**. The day before, the same 9-merge
  batch only reached +4 (concurrency-group cancellations). The version-bump
  workflow's replay (oldest→newest `git log --reverse | bump-version
  --replay-stdin`) recovered every cancelled bump. `git log` is newest-first by
  default — `--reverse` is REQUIRED because bumpSemverReplay is order-sensitive
  (a feat/minor mid-batch resets patch).
- **Branch auto-delete works:** after enabling `delete_branch_on_merge` + the
  glue's dupe-close `gh api DELETE`, the 9 merged branches were gone immediately;
  no manual prune needed.
- **First batched release fired on the surge valve:** 18 unreleased topics ≥ 10
  threshold → cut v3.34.1 (patch, content-only) mid-week (Thursday), not waiting
  for Sunday. kb-release-changelog.sh generated the 18-entry block cleanly;
  publish + homebrew + npm all green.
- **Author login is multi-form:** `gh --json author` → `app/github-actions`;
  REST `.user.login` → `github-actions[bot]` for the SAME bot, on consecutive
  days. The ALLOW_AUTHOR allowlist (#579) handles both; don't assume one form.
- **security-best-practices keeps producing flawed refreshes** (held #566 + #580)
  — see memory `security-best-practices-refresh-defect`. The +180 size is the
  tell; the automation adds a parallel OWASP-2025 section instead of updating in
  place and never reconciles version-pin.

## 2026-07-11 — Content edits near TODO/FIXME placeholder evals are fragile

- **Check eval regexes before rewording content** (from Task 12). Prompt/knowledge
  edits often sit next to eval checks that grep for literal placeholder tokens
  (`TODO`, `FIXME`, `<type>/<short-desc>`, ID-in-branch patterns). Rewording the
  surrounding prose can accidentally satisfy or trip a regex — e.g. an anti-pattern
  eval that greps `content/` for `feat/US-[0-9]` goes red the instant a doc adds
  such an example, and green only after the sweep. Before editing, grep
  `tests/evals/*.bats` for patterns that touch the file/line you're changing, and
  run the affected eval right after the edit rather than at the end of the batch.
