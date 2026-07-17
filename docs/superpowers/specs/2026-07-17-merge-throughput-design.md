# Merge-Throughput Architecture for Generated Projects — Design

**Date:** 2026-07-17
**Status:** Approved (user-reviewed brainstorm, 2026-07-17)
**Scope:** What Scaffold generates for new (and agent-ops-resynced existing) target projects so that 20+ colocated agents can merge without livelock. Scaffold's own repo process is out of scope. Nibble is not ported to; it can adopt via `scaffold agent-ops install` later.
**Amends:** D4 of `2026-07-10-nibble-agent-workflow-port-design.md` (see D4′ below).

## 1. Context and goal

The nibble project demonstrated the failure mode at scale: ~20 agents on one Mac, each required to run a ~21-minute full quality gate against current `main` before merging. Every merge invalidates every in-flight gate, so agents livelock (PR #1825: five gates invalidated in a row). Nibble's fix — a merge *lease* (fcntl-locked JSON file; one agent at a time holds the test-then-merge window) — converts livelock into a serialized queue, but caps throughput at ~3 merges/hour while ~20 producers feed the queue. Observed cost: 71 acquire attempts for one merge; the queue only grows.

Scaffold-generated projects have the same shape today: the gate is full `make check` + mmr review (CI deferred per nibble-port D4), and the only merge coordination is `bd merge-slot` — a lock, not a queue, with the identical throughput ceiling.

**Goal:** generated projects sustain 20+ agents with (a) a merge gate measured in single-digit minutes, (b) a queue that batches merges so throughput scales with batch size × gate rate (~15–30 merges/hour), (c) agents that enqueue and immediately move to the next bead, and (d) a post-merge safety net that keeps `main` effectively green.

**Why both tracks are one design (queueing math):** at 21 min/gate the machine performs ~2.9 gate runs/hour; sustaining 20 PRs/hour needs ~7 landed PRs per run, and at a realistic 10% per-PR failure rate bisection overhead caps effective throughput at ~7–11 PRs/hour — the queue diverges even with batching. With a 2–5-minute affected-tests gate, a batch of 4 at the same failure rate clears ~26 PRs/hour with headroom. The cheap gate is a hard prerequisite; the queue multiplies it. (Sources: bors batch-then-bisect; Uber SubmitQueue, EuroSys '19; M/G/1 analysis, arXiv 2508.08342.)

## 2. Decisions (user-approved)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Track coupling | **Cheap gate is a prerequisite of the queue**; both ship as one architecture. The in-queue gate is `make check-affected`; the full suite moves post-merge/nightly |
| D2 | Queue architecture | **Local batching merge-queue daemon** (default) replacing lease/merge-slot serialization; **Mergify free tier documented as opt-in** alternative; GitHub native merge queue rejected — unavailable on personal-account private repos (org-public or Enterprise Cloud only) |
| D3 | Daemon delivery | **Inside the scaffold CLI** (`scaffold mq …`, `src/merge-queue/`, vitest-tested). agent-ops bundle ships only thin shims: make targets, guard hook, config. Not a standalone script template — generated projects already depend on the CLI (`agent-ops check`), and this gets real tests + versioned upgrades |
| D4′ | CI timing (amends nibble-port D4) | **Day-one CI for post-merge + nightly only**, on a **self-hosted runner** ($0 — Actions minutes bill only on GitHub-hosted runners). The merge gate itself stays local. `gate_executor: gha-selfhosted \| local-poller` config with the launchd poller as pre-built fallback if GitHub revives self-hosted billing |
| D5 | Cheap-gate convention | **`make check-affected` required** alongside `make check` in generated Makefiles; stack-differentiated implementation (§4); falls back to full `make check` when it cannot classify a change. Full `make check` remains authoritative — post-merge runs it uncached |
| D6 | Default TS layout | **3–5-package pnpm workspace** (e.g. `app`/`core`/`ui`) becomes the default for new TS projects. Package boundaries are what make "affected" accurate; cheap at generation, expensive to retrofit |
| D7 | Enforcement model | **Convention + `mq-guard` hook** (bd-guard pattern: accident net, not a security boundary — documented limits, no override recipe in error text). Server-side enforcement is impossible on free-plan private repos (branch protection needs Pro/Team); generated docs note the $4/mo GitHub Pro upgrade as optional hardening |
| D8 | Flake policy | **Retry-once at test-file granularity inside the gate** (Chromium CQ protocol); 3 flake events in 7 days → daemon auto-files a quarantine bead and adds the test to a quarantine list that `check-affected` excludes and post-merge still runs. Mandatory before batching — one flake fails a whole batch |
| D9 | Landing invariant | **Squash-apply candidate refs + Not-Rocket-Science tree check**: land green batches via sequential `gh pr merge --squash`, then assert `origin/main`'s tree hash equals the tested candidate tree. Verified by an early spike; fallback if gh squash trees ever diverge: land by direct push of the candidate, PRs closed as review artifacts (viable — no branch protection exists to require PR merges) |
| D10 | Remote-agent seam | **Enqueue-by-label** (`mq:ready`): the daemon also polls `gh` for labeled PRs, so a future remote agent joins the queue with no protocol beyond GitHub. Nothing else distributed is built in v1 |
| D11 | merge-slot retirement | work-beads prefers `mq` when the merge-queue component is installed; **`bd merge-slot` remains the documented fallback** for projects without it (mvp preset) |

## 3. Research summary (verified 2026-07-17)

Eight-agent research pass (6 web dimensions + 2 repo recon + completeness critic); full results in the session workflow journal. Load-bearing verified facts:

- **GitHub native merge queue**: gated to org-owned public repos or GitHub Enterprise Cloud private repos (github/docs `gated-features/merge-queue`, current; Team-plan exclusion re-confirmed by community discussion #201908, 2026-07-14). Unavailable to scaffold's target shape at any sub-Enterprise price. Where available it is CI-agnostic (merge_group event; any checks/statuses satisfy it) — recorded for projects that later move to an org.
- **Branch protection / required status checks**: not available on private repos under the Free plan (public only; Pro/Team+ for private). No server-side merge enforcement is possible → D7.
- **Actions billing**: "GitHub Actions usage is free for self-hosted runners" (billing docs, current). The Dec 2025 announcement of a $0.002/min self-hosted charge was postponed indefinitely within a week — treated as a live reversal risk → D4′ fallback flag. Runner is NAT-proof (outbound HTTPS long-poll, no tunnel), macOS arm64 native, ~100–300 MB idle per registered runner.
- **OSS merge-bot landscape**: bors-ng and homu archived; rust-lang/bors active but needs GitHub App + public webhook endpoint + Postgres; Kodiak maintained but strictly serialized (automates the lease without raising its ceiling) and depends on branch protection we don't have; Zuul/Prow have the right semantics (Tide's poll-based batch merging is the closest prior art) but are disproportionate infrastructure for one Mac; Aviator/Trunk/Graphite queues are paid. **No off-the-shelf local merge-queue daemon exists — the niche is unfilled** (Overstory archived; agent-orchestrator has no test-gated queue).
- **Mergify**: free plan includes the full Merge Queue (speculative batching) for private repos, ≤5 active contributors, bots excluded; SaaS receives the webhooks; CI-agnostic — a local daemon can be the "CI" posting statuses. Unverified: ToS tolerance for continuous agent PR volume; 24 h CI-data retention vs queue timeouts → opt-in only, not default.
- **TIA (TS)**: Vitest `--changed` + `forceRerunTriggers` (config/lockfile escalate to full run); Turborepo `--affected` with **native git-worktree cache sharing** (linked worktrees automatically reuse the main worktree's cache — the exact 20-worktree win, zero config; concurrent-writer safety under 20 writers is undocumented → spike). Nx demoted: free self-hosted remote-cache plugins deprecated May 2026 after CVE-2025-36852; policy churn makes it a risky generator default.
- **TIA (Python)**: pytest-testmon 2.2.0 (coverage-DB selection — the only mechanism class that survives dynamic imports/DI); per-checkout DB needs a warm seed → copy into new worktrees; blind to static/data files → explicit full-run triggers. Single-maintainer cadence noted.
- **Polyglot**: moon task graph (`toolchain: system` caches anything incl. bats); Bazel/Pants correctness is gold but setup cost is wrong for small fresh projects; Go's native test cache is free and already cross-worktree.
- **Batching algorithms**: bors batch-then-bisect is the right base for a single CI lane (speculative parallel lanes pay only with elastic CI); Mergify dynamic batch sizing; Chromium CQ flake protocol; Uber SubmitQueue's transferable ideas (risk-ordered batch composition; affected-set overlap as conflict analysis).

## 4. Track 1 — the cheap gate (`make check-affected`)

A generated project's Makefile must define both `check` (full, authoritative) and `check-affected` (fast, merge-gate). `check-affected` computes affected tests relative to a base ref (default `origin/main`), runs only those, and **falls back to full `check`** when it cannot classify the change.

Stack-differentiated implementation, emitted by the pipeline at generation time:

| Project shape | Mechanism | Notes |
|---|---|---|
| TS multi-package (new default, D6) | Turborepo `--affected` with explicit per-task `inputs`/`outputs`, cached `test` task | Native worktree cache sharing: agent B replays agent A's green results at the same content hash. TS project references (`tsc -b`) + dependency-cruiser boundary rules (no cross-package deep imports, no cycles) keep the graph honest |
| TS single-package | Vitest `--changed <base>` | Templated `forceRerunTriggers`: lockfile, vite/vitest/playwright configs, `src/test-utils/**`, global setup, `.env*`, `migrations/**` → full run |
| Python | pytest-testmon | Warmed `.testmondata` copied in by `setup-agent-worktree.sh`; wrapper forces plain full pytest when lockfile/`pyproject.toml`/`conftest.py`/migrations/data files changed |
| Polyglot / Go / Rust | moon task graph | `toolchain: system` covers go test / cargo / bats uniformly; Go's native test cache stays enabled |

Universal rules, written into generated `docs/tdd-standards.md` and the git-workflow doc:

- **e2e/Playwright is never in the merge gate** (no credible TIA story): tagged smoke subset at most; full e2e post-merge/nightly.
- **Force-full-run triggers** (all stacks): lockfiles, test-runner/gate config, shared test utils/fixtures/conftest, global setup, env files, DB migrations, the TIA tool's own config.
- **Caches are accelerators, not truth**: the merge gate runs cached; post-merge/nightly runs uncached (`--force` / `--updateCache` equivalents) as the poisoning/under-declared-input backstop.
- **Gate profiling guidance**: before TIA even, 13k tests in 21 min often compresses 2–4× with worker/pool tuning and moving e2e out — generated docs include a short profiling checklist.

## 5. Track 2 — the merge-queue daemon (`scaffold mq`)

### 5.1 CLI surface and shims

New CLI namespace implemented in `src/merge-queue/` + `src/cli/commands/mq.ts`:

| Command | Behavior |
|---|---|
| `scaffold mq enqueue --pr <N>` | Append enqueue intent to the journal; auto-start the daemon if the singleton lock is free. Fire-and-forget — exits immediately |
| `scaffold mq daemon [--foreground]` | The queue runner (singleton via lockfile with PID + heartbeat staleness; background by default, foreground for debugging) |
| `scaffold mq status [--pr <N>] [--json]` | Queue contents, current batch, per-PR state |
| `scaffold mq eject --pr <N>` | Withdraw a PR (author or human) |
| `scaffold mq stats` | Calibration metrics from the journal: arrival rate, failure rate, gate durations, batch sizes, flake events |

agent-ops `merge-queue` component installs: `mq-enqueue`/`mq-status`/`mq-daemon` make targets wrapping the CLI, `mq-guard.sh`, the runner-setup script (§6), and `merge_queue:` config keys in `.scaffold/agent-ops.yaml` (batch caps, gate command, quarantine path, `gate_executor`) with the existing validate-loud style.

### 5.2 Queue algorithm

bors batch-then-bisect + Mergify dynamic sizing + Chromium flake layer, single lane:

1. **Collect**: when the lane frees, take everything queued (dynamic batch: min 1, cap 8 full-gate / 16 affected-gate; no wait timer — accumulation happens naturally while the gate runs). Order low-risk-first (diff size, author's recent queue failures, affected-set size) so the first bisect split isolates likely culprits.
2. **Construct**: squash-apply each PR in order onto latest `main` under `refs/merge-queue/batch-<id>` — reproducing the trees `gh pr merge --squash` will create. A PR that fails to apply is ejected `NEEDS_REBASE` without killing the batch.
3. **Test**: in a dedicated daemon-owned worktree, run `make check-affected AFFECTED_BASE=main` against the union of the batch's changes.
4. **Red** → retry failed test files once with identical config; still red → split in two, requeue both halves ahead of new arrivals; a failing singleton is ejected with its log.
5. **Green** → land sequentially via `gh pr merge --squash --delete-branch`; then assert `origin/main^{tree}` equals the tested candidate tree (D9). Mismatch → loud alert + pause; post-merge full suite is the backstop.
6. **Main moved externally** (human, remote agent) — detected by ~60 s polling: abort the gate, rebuild the candidate (GitLab cascade-cancel semantics). Rare, since the daemon is the sole local merger.

### 5.3 State machines

PR entry: `QUEUED → IN_BATCH → TESTING → PASSED → LANDING → LANDED`, with `TESTING → FLAKE_RETRY → {PASSED|FAILED}`, failed-batch members → `REQUEUED_SPLIT`, singleton failure → `EJECTED`, apply conflict → `NEEDS_REBASE`, withdrawal → `CANCELLED`.

Batch: `COLLECTING → CONSTRUCTING → RUNNING → {GREEN → LANDING → DONE | RED → SPLITTING | ABORTED → members requeued}`.

### 5.4 Durability and idempotency

Append-only JSONL write-ahead journal (every transition written before acted on) + candidate refs in the shared git dir + idempotent landing (`gh pr view --json mergedAt` before every merge attempt). Startup reconciles journal vs refs vs GitHub. Gate timeout → treated as RED but the batch retries once whole, to disambiguate infra failure from test failure.

### 5.5 Agent feedback loop (work-beads changes)

Step 2.7 of the ship loop becomes: mmr review pass → `make mq-enqueue PR=<N>` → **move to the next bead immediately**. On land, the daemon comments on the PR and the bead closes as today. On ejection, the daemon comments the failing log on the PR and reopens/annotates the bead so *any* agent picks up the fix — the enqueueing agent never waits in a lease loop. The lease-order lesson survives inverted: agents never rebase-then-wait; the daemon always constructs candidates from latest `main` at batch time.

### 5.6 Enforcement, opt-in SaaS, and the remote seam

- `mq-guard.sh` (dual-mode: Claude Code PreToolUse stdin-JSON + `--check "<cmd>"` for other harnesses) blocks direct `gh pr merge` unless invoked by the daemon (env token). Registered via the same jq deep-merge pattern as bd-guard; AGENTS.md prose is the fallback for hook-less harnesses.
- **Mergify opt-in** (documented, not default): Mergify's free-tier queue owns ordering/batching; the Mac daemon demotes to a gate-runner that polls Mergify's draft queue PRs and posts commit statuses via `gh api`. For projects that want GitHub-visible queue state or multi-machine from day one and accept a proprietary $0 SaaS.
- **Remote seam (D10)**: daemon polls for `mq:ready`-labeled PRs each collect cycle — a remote agent enqueues by labeling.

## 6. Day-one CI component (D4′)

Generated `.github/workflows/`:

- `post-merge.yml` — `on: push` to the default branch → `runs-on: [self-hosted]` → full uncached `make check`. Runs coalesce naturally (one runner, latest HEAD wins).
- `nightly.yml` — schedule → full suite + full e2e + flake/quarantine report.

Bundle script `setup-gh-runner.sh` registers 1–2 ephemeral self-hosted runners via `gh api` (registration token flow), with a launchd plist for start-at-login. Until the user runs it, workflows simply queue — generated docs make runner setup a day-one checklist item.

`gate_executor: local-poller` swaps both workflows for a launchd/cron job running the same make targets and posting commit statuses via `gh api` — the pre-built escape hatch if self-hosted billing returns (the Dec 2025 episode).

The old D4 language in `environment/git-workflow.md` §5 and `knowledge/core/git-workflow-patterns.md` ("no .github/workflows until launch") is replaced: *the merge gate stays local; post-merge verification is CI from day one; at launch, add deploy workflows to the same skeleton.* Update-mode rule preserved: existing generated projects with the old language get the discrepancy flagged, not silently rewritten.

## 7. Operational policies (generated docs)

- **Post-merge red runbook**: revert-or-fix-forward decision tree; the daemon pauses LANDING while the latest post-merge run on `main` is red (checked via `gh run list` / status API at collect time).
- **Resource governance**: the gate worktree runs at normal priority; agents' local dev test loops run under `taskpolicy -c utility` (documented in the work-beads skill) so the merge lane stays fast on a saturated Mac.
- **Calibration**: `scaffold mq stats` surfaces measured λ (arrivals), p (failure rate), and gate durations; generated docs state the defaults' assumptions (λ≈20/hr, p≈0.10) and when to adjust batch caps.

## 8. Scaffold integration map

| Area | Change |
|---|---|
| `src/merge-queue/`, `src/cli/commands/mq.ts` | New: daemon, journal, state machines, gh adapter (injectable for tests), `mq` CLI |
| `content/assets/agent-ops/merge-queue/` | New component: make fragment additions, `mq-guard.sh.tmpl`, `setup-gh-runner.sh.tmpl`, workflow YAML templates; registered in `AGENT_OPS_FILE_MAP` + `AgentOpsComponent` union + `resolveComponents` |
| `src/core/agent-ops/config.ts` | New `merge_queue:` + `gate_executor:` keys, validated loud |
| `content/pipeline/foundation/tdd.md` (240) | `check-affected` in quality-gate definitions; TIA safety-net rules |
| `content/pipeline/foundation/project-structure.md` (250) | D6 workspace-package default layout; boundary rules |
| `content/pipeline/environment/dev-env-setup.md` (310) | Makefile contract grows `check-affected` |
| `content/pipeline/environment/git-workflow.md` (330) | Merge procedure rewritten around `mq`; D4′ replaces the CI-deferral text; hook registration block for mq-guard |
| `content/pipeline/environment/merge-throughput.md` (new, order 335, conditional) | Installs merge-queue component, runner setup, workflows; for multi-agent projects (deep: enabled if-needed; mvp: disabled) — added to all presets per preset-loader rules |
| `content/pipeline/finalization/implementation-playbook.md` (1430) | Ship-loop reference updated |
| `content/agent-skills/work-beads/SKILL.md` | Steps 2.6/2.7: enqueue flow (mq installed) with merge-slot fallback branch (D11); regenerate via `scripts/generate-agent-skills.mjs` |
| `content/knowledge/` | New `core/test-impact-analysis.md`; extend `core/git-workflow-patterns.md`, `core/testing-strategy.md`, `execution/multi-agent-coordination.md`. CLAUDE.md counts updated |
| `consolidation/claude-md-optimization.md` | AGENTS.md operations-core: mq rules replace merge-slot prose when component installed |

Constraints honored: installer no-clobber semantics; `{{KEY}}` markers registered in `buildTemplateVars`; scripts `set -euo pipefail`, default branch from `origin/HEAD`, feature-detect `bd`/`gh`; Mode Detection + Update Mode Specifics blocks in the new pipeline step; new step present in every preset; bead-traceability conventions unchanged.

## 9. Testing

- **vitest** for `src/merge-queue/`: state-machine transitions, journal write-ahead + crash-recovery replay, bisection, flake counting, idempotent landing — gh adapter injected as a fake.
- **Integration harness**: a local bare repo as `origin` + scripted "PRs" (branches + stub gh shim via `MQ_GH_CMD`) driving full batch → land → NRS-check cycles, including crash-kill-resume.
- **bats** for bundle shims: mq-guard block/allow matrix (bd-guard's repro-matrix discipline), runner-setup dry-run, make-target guards.
- **Spike results recorded in-repo** (see §10) before dependent tasks start.
- Existing gates: `make check-all` green; preset/overlay vitest discovers the new step; knowledge validators pass.

## 10. Risks and early spikes

| Risk | Mitigation |
|---|---|
| `gh pr merge --squash` tree ≠ locally squash-applied tree (D9 depends on it) | **Spike 1 (first task)**: live experiment incl. PRs containing merge commits. Fallback: direct-push landing (D9) |
| Turborepo cache under 20 concurrent worktree writers (docs silent on locking) | **Spike 2**: stress test before making it the generated default |
| testmon warm-DB copy under rebase churn; single-maintainer cadence | **Spike 3**: pilot in a generated sample; wrapper degrades to full pytest on any testmon error |
| GitHub revives self-hosted-runner billing | `gate_executor: local-poller` pre-built (D4′) |
| Daemon is new always-on custom code | Journal-first design; `--foreground` debug mode; `mq stats` observability; post-merge full suite bounds the blast radius of any daemon bug |
| Mergify free-tier limits for agent fleets (opt-in path) | Documented as unverified in the opt-in guide; local daemon remains default |
| Flaky tests poison batches | D8 quarantine flow is mandatory in the same release, not a follow-up |

## 11. Success criteria

- A generated multi-agent project merges ≥15 PRs/hour sustained in the integration harness (vs ~3 baseline) with zero NRS-invariant violations.
- Agent ship-loop contains no waiting: enqueue → next bead; ejections round-trip through beads.
- `main` red time bounded by one post-merge cycle; every red produces a revert/fix-forward bead automatically per runbook.
- `scaffold agent-ops check` covers the new component; `make check-all` green; all presets load.

## Appendix A — Throughput model

Gate rate μ = 60/T_gate per hour (T=21 → 2.9; T=3 → 20). Batch of B lands ≤ B·μ/hr before failures. With per-PR failure probability p, batch pass probability (1−p)^B; expected extra bisect runs ≈ E·log₂B for E failures. At T=21, λ=20/hr, p=0.10: effective ~7–11/hr → divergent queue. At T=3, B=4, p=0.10: ~26/hr → stable with headroom. Defaults chosen from these curves; `mq stats` exists to replace assumptions with measurements.

## Appendix B — Research provenance

Session workflow `wf_6ce4fadf-3fd` (2026-07-17): 6 web-research agents (GitHub merge queue, OSS merge bots, lightweight CI, TIA js/python, polyglot caching, batching algorithms), 2 repo-recon agents, 1 completeness critic; 733k tokens, 211 tool calls. Key sources: github/docs `gated-features/merge-queue` + Actions billing docs; github.blog changelog 2022-08-18 (merge_group + external CI); community discussion #201908; bors-ng/homu archive states via GitHub API; rust-lang/bors README; kodiakhq self-hosting docs; mergify.com/pricing (fetched 2026-07-17); vitest.dev config/forcereruntriggers; testmon.org + PyPI 2.2.0; turbo.build worktree cache-sharing docs; moonrepo docs; bazel.build/remote/caching; "Keeping Master Green at Scale" (EuroSys '19) + arXiv 2501.03440 + arXiv 2508.08342; Chromium CQ flake docs; GitLab merge-trains docs.
