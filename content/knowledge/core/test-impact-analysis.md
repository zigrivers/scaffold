---
name: test-impact-analysis
description: >-
  Affected-only testing (test-impact analysis) for the merge gate: per-stack
  selection mechanisms, force-full-run triggers, cross-worktree result caching,
  and the post-merge safety net that keeps a cheap gate honest
topics:
  - testing
  - test-impact-analysis
  - affected-tests
  - caching
  - merge-queue
  - monorepo
volatility: fast-moving
last-reviewed: 2026-07-17
version-pin: null
sources:
  - url: https://vitest.dev/guide/cli
    anchor: '#changed'
    hash: sha256:a5f4e7042cc6f51f6786b21a20116e4f5f2e5706df4a21ccab786c0d7947d9de
    retrieved: 2026-07-17
  - url: https://turborepo.com/docs/reference/run
    anchor: '#--affected'
    hash: sha256:fe93ae9ad25116e1721d38f75592bab9d6226f082ef114c1ce42008101f0723e
    retrieved: 2026-07-17
  - url: https://testmon.org/
    hash: sha256:67d77ee40d460ae06c402e04475bad5862c7227166305ce4d1a991b06f91c3f1
    retrieved: 2026-07-17
---

# Test-Impact Analysis (the cheap merge gate)

## Summary

The merge gate runs only the tests a diff can affect (`make check-affected`,
2–5 min); the full suite (`make check`) runs post-merge and nightly as the
safety net. Selection mechanism by stack: Vitest `--changed <base>` +
`forceRerunTriggers` (single-package TS), Turborepo `--affected` with declared
task `inputs` (multi-package TS — its cache is shared across git worktrees
automatically), pytest-testmon (Python — coverage-DB selection that survives
dynamic imports), moon (polyglot). Non-negotiables: e2e never runs in the
merge gate (tagged smoke subset at most); lockfiles, gate/tool config, shared
test utils, global setup, env files, and DB migrations always force a FULL
run; caches are accelerators, never truth — the post-merge run is uncached.
Quarantined flaky tests (`.mq/quarantine.txt`) are excluded from the gate and
still run post-merge.

## Deep Guidance

### The contract `make check-affected` must satisfy

- Selects tests affected relative to `${MQ_AFFECTED_BASE:-origin/main}` (the
  merge-queue daemon exports `MQ_AFFECTED_BASE`; default it for direct use).
- Falls back to the FULL `make check` when it cannot classify the change —
  any touched path matching the force-full list below, or the selector
  erroring, downgrades to full. Failing closed is what keeps a cheap gate
  trustworthy.
- On failure, MAY write failing test ids (one per line) to
  `.mq-failed-tests.txt` in the working directory — the merge queue reruns
  exactly those once to detect flakes; honoring `MQ_RETRY_TESTS` (comma-joined
  ids) on the rerun makes the retry cheap, ignoring it and rerunning the whole
  selection is also correct.
- Excludes test ids listed in `.mq/quarantine.txt` (one per line) from the MERGE
  gate (`check-affected`) when the file exists — quarantine is a mute, not a
  delete; a quarantined test that goes reliably green again should be
  un-quarantined. Note the asymmetry: the POST-MERGE full gate is a separate
  command (`make check` on the CI runner / poller) and does NOT read the
  quarantine list by default, so a quarantined flake failing there still holds
  the queue. To keep a KNOWN flake from pausing post-merge, make the full-gate
  command itself skip or soft-fail quarantined ids (a project responsibility);
  the durable fix is to repair or delete the flake, not to leave it quarantined
  forever.

### Force-full-run triggers (every stack)

Dependency manifests AND lockfiles (`package.json`, `pyproject.toml`,
`Cargo.toml`, `go.mod`; `package-lock.json`, `pnpm-lock.yaml`, `uv.lock`,
`Cargo.lock`) — a dependency bump can change any test's behavior. Compiler /
test-runner / build-tool / TIA-tool config (`tsconfig*.json`, `.swcrc`,
`vitest.config.*`, `turbo.json`, `pytest.ini`, `Makefile`). Generated /
non-source inputs that impact tools track by import, not by data read, so an edit
looks like "nothing changed" (SQL, `**/*.proto`, templates, JSON/YAML fixtures,
codegen outputs). Shared test utilities and fixtures (`src/test-utils/**`,
`conftest.py`), global setup files, `.env*`, `migrations/**`, and CI/workflow
files. When in doubt, add the glob — a false force-full costs time; a false
narrow costs a landed regression.

### TS, single package — Vitest

`check-affected` runs `vitest run --changed "$BASE"`. Template
`forceRerunTriggers` so config-class changes escalate to a full suite:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    forceRerunTriggers: [
      '**/package-lock.json', '**/pnpm-lock.yaml', '**/vitest.config.*',
      '**/vite.config.*', '**/playwright.config.*', 'src/test-utils/**',
      '**/.env*', 'migrations/**',
    ],
  },
})
```

Known blind spots (why the post-merge net exists): non-literal dynamic
imports, env-driven behavior, data/asset files, snapshot inputs.

### TS, workspace (3–5 packages) — Turborepo

`check-affected` runs `npx turbo run test --affected` (with
`TURBO_SCM_BASE="$BASE"`). Declare `inputs` per task. Turborepo's cache is
content-addressed, so the same content hash always resolves to the same
artifact. To make worktrees SHARE that cache, don't rely on the default cache
location being shared (Turbo's default `.turbo/cache` is resolved per workspace
root, so linked worktrees can end up with isolated caches) — point every
worktree's `cacheDir` at ONE shared absolute path (or set `TURBO_CACHE_DIR`), so
one agent's green result is another worktree's instant hit. A shared cache under
concurrent writers is safe: a live spike ran 8 concurrent `turbo run test`
invocations across 4 worktrees against one cache dir with zero failed runs, zero
corrupted (zero-byte) artifacts, and a real cross-worktree `FULL TURBO` hit from
a fifth worktree that never ran the task (see
`docs/superpowers/spikes/2026-07-17-turbo-worktree-cache.md`). Treat a
localhost remote-cache container (e.g. `ducktors/turborepo-remote-cache`) as
something you reach for only past a single machine (self-hosted CI runners,
a cache too large for local disk) — for on-box worktrees the shared local
cache is simpler and already proven safe under concurrent writers. Keep the
graph honest with TypeScript project references (`tsc -b`) and
dependency-cruiser boundary rules (no cross-package deep imports, no cycles).

### Python — pytest-testmon

`check-affected` runs `pytest --testmon`; the wrapper forces plain full
`pytest` when any force-full trigger matched. Testmon's coverage DB
(`.testmondata`) is per-checkout, so a brand-new worktree with no DB would
otherwise force its first run to be full and un-narrowed. Seed it instead:
copy a warmed `.testmondata` into new worktrees via `worktree_setup_commands`
(the agent-ops worktree setup hook) — validated live: a fresh worktree seeded
with a warmed DB correctly narrowed selection to only the tests touched by a
real change (not stale-passing, not over/under-selected), and simulated
rebase-like history churn (files replaced wholesale rather than incrementally
edited) degraded gracefully to re-running the affected set rather than
crashing or silently skipping tests (see
`docs/superpowers/spikes/2026-07-17-testmon-seed.md`). Blind to static/data
files (SQL, templates, JSON fixtures) — cover those via the force-full list.

### Polyglot — moon

One task graph caches vitest, pytest, go test, cargo, and bats uniformly
(`toolchain: system` for anything). Declare explicit `inputs` per task
(default greedy `**/*` under-invalidates nothing but over-runs). Go's native
test cache stays enabled regardless — it is content-keyed and per-user.

### e2e and the gate

Playwright/e2e has no credible impact story: run a tagged smoke subset in the
gate at most; full e2e belongs post-merge/nightly.

### Before selecting less, make the suite faster

Profile once before tuning selection: worker/pool counts, moving e2e out of
`check`, splitting slow integration suites behind tags. 13k tests in 21
minutes often compresses 2–4x with zero selection risk.

### The `MQ_AFFECTED_BASE` contract

The merge queue owns "affected relative to what?" It exports
`MQ_AFFECTED_BASE=origin/<default-branch>` before invoking `make check-affected`,
and the target selects the tests reachable from the diff against that ref — NOT
against the worktree's local `HEAD` or a guessed base. Pin the contract so it is
identical whether a human runs the target locally or the daemon runs it in the
gate worktree:

```make
MQ_AFFECTED_BASE ?= origin/main            # queue overrides; local default
check-affected:
	@base="$(MQ_AFFECTED_BASE)"; \
	changed="$$(git diff --name-only "$$base"...HEAD)"; \
	# ...classify $$changed, run the selected subset or fall back to `check`
```

Three rules keep it honest:

- **Default, don't require.** `?=` lets a bare `make check-affected` work outside
  the queue (falls back to `origin/main`); the daemon always sets it explicitly.
- **Three-dot diff.** `$$base...HEAD` is the changes on this branch since it
  forked from base — not two-dot, which also counts base moving forward and
  over-selects after the queue advances the default branch mid-gate.
- **Empty diff ⇒ full run, not zero.** If the base ref is missing or the diff is
  empty for a reason you cannot explain, run `check`. A gate that selects *no*
  tests because it mis-resolved the base is worse than a slow gate.

### Failure modes: when affected-selection is unsafe

Selection is a performance optimization layered on a correctness invariant (the
FULL suite still runs post-merge and nightly). Inside the gate, these are the
ways narrowing goes wrong — every one is covered by routing to a full run:

- **Cross-cutting config.** Compiler/tsconfig, lint, CI, `Makefile`, lockfiles,
  and dependency manifests can change *any* test's outcome. They belong in the
  force-full trigger list, not in per-file impact graphs.
- **Generated / non-source inputs.** SQL, templates, JSON/YAML fixtures, protobuf,
  codegen outputs — most impact tools track imports, not data reads, so a fixture
  edit looks like "nothing changed." Force-full on their globs.
- **Non-hermetic tests.** A test that reads the clock, the network, or global
  state has no stable impact edge; selection can pass it while a real regression
  hides in the unselected set. Fix the hermeticity or exclude the suite from
  selection (always-run) rather than trusting its edges.
- **Stale coverage DB.** pytest-testmon and coverage-DB tools trust their last
  recorded edges; a corrupted or ancient `.testmondata` under-selects silently.
  Seed from a warm copy, and let history churn degrade to *more* running, never
  less (validated — see the testmon spike).

The affected gate is a performance optimization, NOT the correctness boundary —
be precise about what it does and doesn't prevent. A mis-selection passes the
cheap gate green, so the change *does land*; the post-merge full run then catches
it on the next run and pauses the queue (`.mq/PAUSED`), and a human reverts or
fixes forward. So a gate mis-selection costs a bounded, quickly-caught bad
landing on the default branch — not a regression that sits there undetected. (An
affected-gate failure the gate *does* catch is bisected and the culprit ejected,
costing at most one wasted batch.) The full suite running post-merge and nightly
is what makes trusting the cheap gate safe; without that net, do not narrow.

### Calibration: is the gate actually cheaper?

Measure before and after adopting selection — the win is real only if the
*affected fraction* is small and stable:

- **Affected fraction.** Log `selected_tests / total_tests` per gate run. Typical
  well-factored workspaces sit at 5–20%; if most PRs touch shared code and select
  60%+, the diff-classification overhead may cost more than it saves — invest in
  package boundaries (D6) first.
- **Gate wall-clock, p50 and p95.** The queue's throughput is bounded by p95, not
  p50 — one PR that force-fulls stalls its whole batch. Track how often
  force-full fires and why.
- **Escape rate.** Count regressions the affected gate passed but the post-merge
  full run caught. A non-zero-but-tiny rate is expected and healthy (that is what
  the safety net is for); a rising rate means the force-full list has a hole.

### Adopting TIA incrementally

Do not flip the merge gate to affected-only on day one. Stage it:

1. Ship `check` and `check-affected` side by side; keep the queue gate on `check`.
2. Run `check-affected` in *shadow* for a week — compare its verdict to `check`
   on every PR; every disagreement is a missing force-full trigger.
3. Once shadow agreement holds, switch the queue gate to `check-affected` and
   lean on the post-merge/nightly full run as the standing net.

This ordering means the cheap gate is only trusted after it has *earned* trust
against the full suite on real diffs — never before.
