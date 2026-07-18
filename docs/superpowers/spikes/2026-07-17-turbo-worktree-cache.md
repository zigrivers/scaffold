# Spike 2: Turborepo cache under concurrent worktree writers (spec §10)

**Date run (UTC):** 2026-07-18 01:09:46
**turbo version:** 2.10.5 (`npm view turbo version`, matched by the scratch
repo's `"turbo": "^2"` devDependency resolving to the same latest 2.x)
**node version:** v24.16.0
**npm version:** 11.13.0
**Script:** `scripts/spikes/turbo-worktree-cache-spike.sh`

## Question

To share a cache across git worktrees, point every worktree's cache at ONE
directory (via `TURBO_CACHE_DIR` / `cacheDir`) — do NOT rely on Turbo's default
location being shared, which is resolved per workspace root and can leave
worktrees isolated. Given that shared cache, multiple agents in parallel
worktrees (per `docs/git-workflow.md` §7) write to it concurrently. Does a
single Turborepo cache stay correct under **concurrent writers** — no failed
runs, real cross-worktree cache hits, no corrupted cache artifacts — or does it
need to be avoided (per-worktree caches / a remote-cache container) instead?

## Method

The script built a throwaway npm workspace (`turbo-spike`) with three
packages (`alpha`, `beta`, `gamma`), each running a CPU-bound `test` script
(`turbo.json` task with `inputs: ["src/**"]`, no declared outputs — this
still exercises turbo's exec/hash/cache-record path even though there are no
output files to tar). It committed the base repo, then created four linked
git worktrees (`wt1`-`wt4`, each with its own copied `node_modules` so the
`turbo` binary resolves locally), and launched **8 concurrent** `npx turbo
run test` invocations — two per worktree, fired back-to-back with `&` — all
pointed at ONE shared cache directory via `TURBO_CACHE_DIR` (an absolute path
outside every worktree), so they genuinely race the same cache.

After the concurrent phase, it asserted:

- **(a) No run failed** — all 8 background PIDs exited 0.
- **(b) Cross-worktree cache correctness** — a fifth, brand-new worktree
  (`wt5`), which never ran `test` itself, ran `turbo run test` once and the
  output was checked for the literal string `FULL TURBO` (Turborepo's
  full-cache-hit marker), proving the cache entries written by the four
  concurrent worktrees are valid and replayable from an unrelated worktree.
- **(c) No corrupted artifacts** — `find .turbo/cache -type f -size 0`
  found no zero-byte files in the shared cache directory.

## Result

Run 1:

```
running 8 concurrent turbo test invocations across 4 worktrees…
VERDICT: SAFE — concurrent writers + cross-worktree FULL TURBO hit, no corrupt artifacts
```

Run 2 (repeated for confidence, exit code captured explicitly):

```
running 8 concurrent turbo test invocations across 4 worktrees…
VERDICT: SAFE — concurrent writers + cross-worktree FULL TURBO hit, no corrupt artifacts
SPIKE_EXIT_CODE: 0
```

Both runs completed with exit code 0 and printed the `SAFE` verdict — no
`UNSAFE` branch (failed concurrent run, missing `FULL TURBO` marker, or
zero-byte cache file) was hit in either run.

## Verdict

**SAFE — Turborepo's automatic git-worktree cache sharing stays correct
under concurrent writers.** All 8 concurrent `turbo run test` invocations
across 4 linked worktrees succeeded, a fifth, previously-idle worktree got a
`FULL TURBO` cache hit against artifacts written by the other four, and no
zero-byte/corrupt cache files were left in the shared `.turbo/cache`
directory.

Consumed by Plan 3 Task 4 (knowledge entry) and Task 6 (project-structure
doc): both should document turbo's worktree-shared cache as the default —
no per-worktree cache isolation or remote-cache container is required for
correctness under concurrent parallel-agent worktree usage.

## Caveats

- This is a small, synthetic workspace (3 packages, CPU-bound no-output
  tasks, 8 concurrent invocations across 4 worktrees) run once interactively
  on a single machine (macOS, APFS). It is strong evidence against gross
  corruption/races in turbo's cache-write path, not an exhaustive
  concurrency proof — much higher parallelism, tasks with large output
  artifacts, or a different filesystem (e.g. network-mounted worktrees)
  are untested.
- The `test` task declares no `outputs`, so this exercises turbo's
  hash/cache-record and log-replay path but not tarball-artifact writing
  under contention. Real projects with build outputs should still watch
  for cache issues, though turbo's cache writes are designed to be atomic
  (write-then-rename) regardless of output size.
