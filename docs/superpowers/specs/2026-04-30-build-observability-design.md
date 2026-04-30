# Build Observability Design

**Date:** 2026-04-30
**Status:** Drafting (section-by-section, MMR-reviewed)
**Owner:** Ken Allred

## Problem

During the build phase of a scaffold-bootstrapped project, AI agents work through implementation tasks defined by the pipeline (PRD → user stories → coding standards → implementation plan → task graph → execution). Today, a user who wants to know *what's happening* must cross-query several surfaces: `git worktree list`, `gh pr list`, `bd list` (if Beads is installed), `docs/implementation-plan.md` checkmarks, and the static-generated dashboard. None of these surfaces tell a coherent story, none capture decisions made along the way, and none verify that what's being built matches what the project's own documentation says should be built.

Two related capabilities are missing:

1. **Build progress reporting** — answer "where are we?" with file- and decision-level detail, scaling from minutes-gap (active pairing) to days-gap (autonomous-run check-in). Must work in single-agent and multi-agent (worktree) modes.
2. **Build conformance audit** — verify agents are building according to scaffold-generated documentation (PRD, stories, standards, TDD, plan, design system, tech-stack, decisions log). Eight lenses in v1 (TDD violations, AC completion, coding-standards drift, architectural drift, design-system drift, missing scope, undocumented decisions, cross-doc inconsistency).

The audit's cross-doc lens runs from the *documentation phases forward*, not just during build — catching e.g. "stories don't cover all PRD features" before the plan is written.

## Goals

1. Single observability layer underneath both features — one ledger, one doc-graph, one checks framework, three renderers.
2. Snapshot-first reporting with replay-on-demand for longer gaps. Decision-level detail on demand.
3. Eight audit lenses in v1, organized as a checks framework that supports adding lenses without touching the engine.
4. Two-layer audit: cross-doc lens runs throughout the pipeline; docs-vs-code lenses run during build phase.
5. MMR-shaped action loop: P0–P3 severity, configurable fix-threshold, advisory by default, pre-merge gate blocks, `--fix` flag dispatches an agent, Beads-aware when present.
6. Three surfaces: terminal stdout, persisted markdown reports, dashboard panels — all rendered from one engine JSON.
7. Stall detection at command-execution boundaries so the days-gap user sees what's stuck the moment they check in.
8. Beads and MMR are *enrichments*, not requirements.

## Non-Goals

- Background daemons or scheduled processes. Stall detection runs at command time.
- A scheduled digest (the `digest` subcommand surface is reserved but defers to v1.1).
- Replacing MMR. The audit's pre-merge gate registers as a 5th MMR channel and reuses MMR's reconcile/threshold plumbing.
- A live-streaming dashboard. The dashboard remains static-on-demand; observability commands trigger regeneration.
- Auto-documenting agent reasoning. The ledger captures *recorded* decisions, not inferred ones.
- A new severity scheme. Reuse MMR's P0–P3.

## Context

### What scaffold already has to build on

- **Pipeline-step state** in `.scaffold/state.json` — coarse, per-pipeline-step (not per-task) status tracking.
- **Beads** (optional) — installed only if the downstream project ran `/scaffold:beads`. Provides `bd list/show/dep/ready` over `.beads/`.
- **Implementation plan** (`docs/implementation-plan.md`) — the markdown source of truth for tasks, ACs, and dependencies. Beads, when present, indexes over this.
- **Worktrees** — `scripts/setup-agent-worktree.sh` creates one per agent at `../<project>-<agent-name>/`. Mapping is implicit (agent name → directory).
- **Dashboard** — `scripts/generate-dashboard.sh` builds `.scaffold/dashboard.html` on demand; already includes a Beads task panel with filters and a modal.
- **MMR** — multi-model review with three CLI channels (Codex, Gemini, Claude) plus the Superpowers code-reviewer subagent as a 4th channel via the `scaffold run review-*` wrappers. Severity tiers P0–P3. Configurable `fix_threshold`. PostToolUse hook on `gh pr create` already reminds agents to run review.
- **Post-implementation review** (`content/tools/post-implementation-review.md`) — full-codebase end-of-build review with three channels and severity-tiered fix commits. Different scope from this design (end-of-build, broad) but useful prior art for finding aggregation and fix loops.

### What scaffold does *not* have

- An append-only event ledger of build activity.
- A typed graph linking PRD features ↔ stories ↔ ACs ↔ plan-tasks ↔ files-changed-in-PRs.
- A per-PR doc-conformance gate (MMR reviews diff for code quality, not for doc fidelity).
- A narrative output that fuses agent ↔ worktree ↔ task ↔ branch ↔ PR.
- Cross-doc consistency checks during the documentation phases.

## Section 1 — Architecture Overview

**Working name: Build Observability.** Distributed as part of scaffold's pipeline so downstream projects pick it up via `scaffold update`.

### Surface

Two surfaces, layered so both humans and agents have a path in:

**Top-level CLI command** (TypeScript, registered in `src/cli/index.ts`, implemented under `src/cli/commands/observe.ts`):

```
scaffold observe progress [--since=<ref|time|"last-check">] [--replay] [--json]
scaffold observe audit    [--profile=fast|full] [--scope=docs|code|all]
                          [--lens=A,B,…] [--fix] [--report-only]
scaffold observe event    <event-type> [--key=value …]   # ledger-write entry point
scaffold observe digest   (v1.1 — combined digest; surface reserved)
```

This is a top-level CLI command, *not* a `scaffold run <step>` tool slug. `scaffold run` assembles meta-prompts for a single step; observability is engine code, so it lives directly under the CLI alongside `scaffold next`, `scaffold status`, etc.

**Tool meta-prompts** (markdown, agent-callable via the existing `scaffold run <slug>` pattern):

```
content/tools/observe-progress.md     # recipe: shells to `scaffold observe progress`
content/tools/observe-audit.md        # recipe: shells to `scaffold observe audit`
```

These meta-prompts give agents a documented procedure to run progress/audit, interpret findings, and act on them — same pattern as `content/tools/review-pr.md` wrapping the `mmr review` binary. Humans can also `scaffold run observe-progress` to get the same recipe (rendered to a prompt) if they want the agent to drive.

The `scaffold observe event` subcommand is the **ledger-write entry point** invoked from build-command meta-prompts (see Engine, point 1).

### Engine

Lives in `src/observability/` and has four parts:

1. **Ledger writer** — exposed as `scaffold observe event <type> --key=value …`. Build-command meta-prompts (`single-agent-start`, `multi-agent-start`, both `*-resume` variants, `review-pr`, `review-code`) gain explicit instruction blocks telling the executing agent to invoke this command at named workflow points: after claiming a task (`task_claimed`), after completion (`task_completed`), when recording a decision (`decision_recorded`), when hitting a blocker (`blocker_hit`), and after opening a PR (`pr_opened`). For events owned by CLI code rather than meta-prompts (e.g., MMR completion, scaffold-step state transitions), the writer is invoked directly from existing TypeScript components — `StateManager`, `decision-logger`, the MMR wrapper — so those events are captured even if no agent meta-prompt is involved. Multi-worktree concurrency model in the next subsection.
2. **Synthesizer** — at report time, fills gaps the ledger doesn't capture. Built as a set of *source adapters*, each returning structured `{ status: "available" | "degraded" | "unavailable", evidence: …, missing: […] }`:
   - `git` adapter — log, diff, branches, worktree listing. Degraded if working tree dirty in unexpected ways; unavailable if not a git repo.
   - `gh` adapter — PR list, view, checks. Degraded if `gh` is unauthenticated or rate-limited (still reports what it can from local refs); unavailable if `gh` is not installed.
   - `plan-doc` adapter — `docs/implementation-plan.md` and `docs/implementation-playbook.md` checkmarks; precedence: playbook is authoritative for execution status when present, plan is authoritative for AC/dependency structure.
   - `tests` adapter — runs `make test`/`pnpm test`/etc. when invoked with `--profile=full` or when the audit explicitly needs test results; otherwise reads cached test output from `.scaffold/last-test-run.json`.
   - `state` adapter — reads `.scaffold/state.json` at root and, when present, walks `.scaffold/services/<name>/state.json` for service-scoped multi-service projects, merging by step-slug.
   - `beads` adapter — `bd list/show/dep` when present; unavailable when `.beads/` doesn't exist, in which case Beads-specific enrichment fields are simply omitted from the engine output.
   - `mmr` adapter — most-recent MMR job results from `.mmr/jobs/`; unavailable if MMR has never run or `.mmr/` doesn't exist.
   - `audit-history` adapter — reads machine-readable summaries `docs/audits/<date>-<scope>.json` (written by the markdown renderer alongside each report) for trend data (e.g., which lenses have been `lens_skipped` for ≥ 3 consecutive runs, severity-tier trajectories over time). The JSON sidecar is the source of truth for trends; markdown is for humans. Unavailable if no JSON sidecars exist.

   The synthesizer composes evidence from whichever adapters are `available`, marks fields with `degraded` provenance when an adapter reports partial data, and includes an `availability` block in the engine JSON so renderers can show the user which sources contributed.
3. **Doc-graph** — parses planning artifacts into a typed graph (features ↔ stories ↔ ACs ↔ plan-tasks ↔ playbook-tasks ↔ tests ↔ files-changed-in-PRs). Inputs:
   - `docs/prd.md` (features)
   - `docs/user-stories.md` (stories, ACs)
   - `docs/implementation-plan.md` (planned tasks)
   - `docs/implementation-playbook.md` (executed tasks; precedence over plan for status)
   - `docs/coding-standards.md`, `docs/tdd-standards.md` (rule sources)
   - `docs/tech-stack.md`, architecture docs (sanctioned-component sources)
   - `docs/design-system.md` (token sources)
   - `docs/story-tests-map.md` (AC↔test traceability when present)
   - `decisions.jsonl` (decisions log)

   Doc inputs are discovered, not hardcoded. Discovery uses two signals together:
   - **Pipeline frontmatter** `outputs:` for each step that has run (the existing scaffold convention; see `content/pipeline/*/*.md`).
   - **Runtime state** `.scaffold/state.json` `steps[*].produces` for already-executed steps.

   Each artifact is mapped to a graph role (PRD, story, plan, playbook, standards, tech-stack, design-system, decisions, story-tests-map) by the **step slug** that produced it (the canonical mapping lives in `src/observability/engine/doc-roles.ts`, mirroring `src/types/frontmatter.ts`). Projects that customize their pipeline can extend the role map via `.scaffold/observability.yaml`. Missing artifacts are tolerated — graph nodes from a missing source are simply absent, and downstream checks that require them mark themselves `skipped`.
4. **Checks framework** — each of the 8 lenses is a check module exporting `(graph, code, ledger, availability) → finding[]`. A check inspects `availability` first; if its required adapters are unavailable, it returns a single P3 `lens_skipped` finding rather than failing or producing false positives. Findings have severity (P0–P3), source-doc reference, evidence, and an optional fix-hint. The framework runs requested checks, aggregates findings, and applies fix-threshold logic identical to MMR's.

### Multi-worktree concurrency model

In multi-agent mode, each agent works in a separate worktree at `../<project>-<agent>/`. Worktrees share `.git` but each has its own working tree, so each worktree has its own `.scaffold/` directory. Centralizing the ledger to a single shared file would require cross-worktree filesystem coordination; we instead use **per-worktree append-only ledgers** that are merged at report time.

**Ledger location** (all gitignored — these are local execution artifacts, never committed):
- Worktree-local working file: `.scaffold/activity.jsonl` (in each worktree). Append-only during build work.
- **Central archive** at the primary repo: `<primary>/.scaffold/activity-archive/active/<worktree-id>.jsonl` plus `<primary>/.scaffold/activity-archive/<YYYY-MM>.jsonl.gz` for closed periods. Worktree-local files are *not* the long-term home; they are short-term staging.
- Persisted markdown reports under `docs/build-status/` and `docs/audits/` *are* committed and shareable; they are produced by the renderer with render-time redaction. The raw ledger files are not.

**Worktree-id:** generated as a fresh UUIDv4 at worktree setup, persisted in `.scaffold/identity.json` inside the worktree. The setup script (`scripts/setup-agent-worktree.sh`) writes this file. The primary repo gets one too (created on first `scaffold observe event` call if absent). Path-derived hashes are explicitly *not* used: standardized CI paths (`/home/runner/...`) and shared dev servers would collide.

```json
// .scaffold/identity.json
{ "worktree_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "worktree_label": "agent-alice",
  "created_at": "2026-04-30T14:00:00Z" }
```

**Event schema** (one JSON object per line):
```json
{
  "event_id": "01HF5Z…",                  // ULID — globally unique, time-sortable
  "worktree_id": "f47ac10b-…",            // UUID from .scaffold/identity.json
  "actor_label": "agent-alice",            // human-readable; not load-bearing
  "branch": "alice-feat-auth",
  "task_id": "T-031",                      // optional; null for non-task events
  "type": "task_claimed",
  "ts": "2026-04-30T14:22:51Z",
  "payload": { … }                         // schema-restricted per event type
}
```

**No absolute paths in events.** Path-shaped fields are rewritten to repo-relative form *at write time* by `ledger-writer.ts`, before the line hits disk. The `worktree_id` UUID is the canonical identity; absolute paths are unnecessary because the synthesizer can re-derive a worktree path from `git worktree list --porcelain` matched on `worktree_id` (read from each worktree's `identity.json`). This means the raw ledger is itself commit-safe even though we still gitignore it, and that the redactor's render-time path-rewriting becomes a defense-in-depth pass rather than the only line of defense.

**No per-actor sequence number is stored.** Total ordering is by `(ts, event_id)` — ULIDs are time-ordered to millisecond resolution and trailing entropy disambiguates same-millisecond events. Per-actor ordering, when needed for filtering or display, is `(worktree_id, ts, event_id)`. This honors the "writers never read" invariant — no writer-side counter or lock file is required.

**Event size limit (4 KiB).** Events larger than 4 KiB are **rejected** by `ledger-writer.ts`, which returns a non-zero exit and an error message instructing the caller to split or summarize. There is no payload-blob mechanism in v1 — it would require parallel storage, harvesting, and lifecycle management that adds risk without proportional benefit. Practical events (task claim, completion, decision summary, blocker note) fit easily in 4 KiB; longer artifacts belong in `docs/decisions/` or PR descriptions, not the ledger.

**Concurrent-write coordination:** POSIX does not guarantee single-`write(2)` atomicity on regular files (the `PIPE_BUF` guarantee applies to pipes/FIFOs only). Multiple `scaffold observe event` invocations from the same worktree could in principle interleave bytes mid-line. The writer therefore serializes appends with an **advisory lockfile** (`.scaffold/activity.jsonl.lock`, acquired via `flock(2)` on POSIX / `LockFileEx` on Windows; Node implementation via `proper-lockfile` or equivalent). The lock is held only for the duration of one `O_APPEND` write — typically < 1 ms — so concurrency is effectively non-blocking in practice. The lockfile is *separate* from the ledger, so the "writers never read the ledger" invariant holds; writers coordinate, they don't read history.

**Crash safety:** if a writer dies after acquiring the lock but before releasing it, `proper-lockfile` (or equivalent) treats stale locks (older than 30 s by default) as releasable. If a writer dies mid-write, JSONL line-at-a-time semantics tolerate partial-line recovery: the synthesizer skips any malformed trailing line and surfaces the count under `availability.ledger.malformed_lines`.

**Ledger harvesting (worktree → primary):**
- **Periodic flush:** every `task_completed`, `pr_opened`, and `decision_recorded` event triggers a best-effort copy of the worktree ledger to `<primary>/.scaffold/activity-archive/active/<worktree-id>.jsonl`. Writes use the **write-to-temp-then-rename** pattern (`<worktree-id>.jsonl.tmp.<pid>` followed by `rename(2)`), so a synthesizer reading mid-flush sees either the prior version or the new version, never a torn file. The same pattern is used by GC rotation when producing `<YYYY-MM>.jsonl.gz`.
- **Worktree teardown:** `scripts/setup-agent-worktree.sh` and any analogous teardown scripts gain a final `scaffold observe harvest --worktree=<path>` call before `git worktree remove`, ensuring the latest events are flushed even if the periodic flush missed the last few seconds.
- **Recovery:** if a worktree is deleted without harvest (manual `rm -rf`), reflog and `git worktree list` still know about it briefly; `scaffold observe harvest --recover` scans for stale `active/<worktree-id>.jsonl` files and the corresponding worktree paths to flush remaining events.

**Merge at report time:** the synthesizer reads `<primary>/.scaffold/activity-archive/active/*.jsonl`, the local worktree's `.scaffold/activity.jsonl` (in case of in-flight events not yet harvested), and the rotated archive `<YYYY-MM>.jsonl.gz` files relevant to the requested time window. Events are sorted by `(ts, event_id)` and deduped by `event_id`.

**Recovery / replay:** writers never read the ledger; IDs and timestamps are stable; archive files are append-only. The merge is idempotent.

**Garbage collection:** active archive files older than N days (default 90) are rotated to `<YYYY-MM>.jsonl.gz` by `scaffold observe gc`, invoked manually, by the dashboard generator when archive total size exceeds a threshold (default 50 MiB), or by a teardown hook on `scripts/setup-agent-worktree.sh`.

### Redaction policy

The engine enforces redaction at two boundaries:

- **Event-write time** (the strong line of defense):
  - Payload schemas are *allowlisted per event type* in `src/observability/engine/event-schemas.ts`. Fields not in the allowlist are dropped silently.
  - **Top-level event fields and payload fields are both scanned**, not just payloads. Path-shaped values are rewritten to repo-relative form. Username-shaped path segments (`/Users/<name>`, `/home/<name>`) are masked to `~`.
  - Free-form text fields (e.g., `decision_recorded.note`) are scanned with a secret-detector regex pack (AWS keys, GitHub tokens, generic high-entropy strings, `KEY=VALUE` patterns where KEY contains `secret|token|password|key`); matched substrings become `[REDACTED:<reason>]`.
  - Result: the on-disk ledger never contains absolute paths, usernames, or recognized secrets. This makes the ledger itself commit-safe even though policy still gitignores it.
- **Render time** (defense in depth, applied to persisted markdown reports and dashboard fragments only):
  - Re-runs the same secret-detector regex pack against the rendered output. Catches anything the write-time pass missed (e.g., a payload field that legitimately contained an interpolation that resolved to a secret at render time).
  - Terminal output applies secret detection but skips path masking (paths are useful in transient terminal output for navigation).

The redactor is a single module (`src/observability/engine/redact.ts`) shared between both passes. New event types must declare their payload schema and pass redactor tests before they can be emitted.

### Renderers

Three renderers consume the engine's single JSON output:

- **Terminal** (markdown to stdout) — quick check-in surface; leads with the snapshot, prepends a "Needs Attention" banner from stall detection, prints "rerun with `--replay` for the timeline" hint.
- **Markdown report** — persisted at `docs/build-status/<date>.md` (progress) and `docs/audits/<date>-<scope>.md` (audit). Becomes part of repo history; can be cited from PR descriptions and future audits. Render-time redaction (see Redaction policy) is applied unconditionally. A machine-readable sidecar `docs/audits/<date>-<scope>.json` is written alongside each audit report (and `docs/build-status/<date>.json` for progress reports), containing the engine's structured findings/snapshot. Trend analysis (e.g., the `audit-history` adapter) reads the JSON sidecars, not the markdown — markdown is for humans, JSON is the durable record.
- **Dashboard panels** — new "Build Progress" and "Audit" panels in `.scaffold/dashboard.html`. The TS renderer (`renderers/dashboard.ts`) emits self-contained HTML fragments. `scripts/generate-dashboard.sh` is updated with two named anchor comments (`<!-- observe:progress -->`, `<!-- observe:audit -->`) and shells out to `scaffold observe progress --render=dashboard-fragment` / `--render=dashboard-fragment-audit` to fetch the fragments at the right time. This keeps the dashboard's data path unified through the TS engine while limiting blast radius on the existing shell script. **Out of scope:** full migration of dashboard generation into TypeScript. That is a separate, future effort once these panels prove out the fragment-injection pattern.

### Stall detection

Stall detection runs whenever `observe progress`, `observe audit`, or `dashboard` is invoked, and prepends a "Needs Attention" section when any signal trips. Signals and default thresholds (all configurable in `.scaffold/observability.yaml`):

| Signal | Trips when | Default threshold |
|---|---|---|
| `task_stale` | A `task_claimed` event has no matching `task_completed`, `blocker_hit`, or commit on the actor's branch | > 4 hours |
| `pr_stale` | A `pr_opened` event has no `pr_merged` or new commits since open | > 48 hours |
| `pr_review_stale` | A `pr_opened` event with no successful MMR job since open | > 24 hours |
| `blocker_unaddressed` | A `blocker_hit` event with no resolution event since | > 2 hours |
| `audit_findings_unresolved` | Findings at or above fix-threshold in the most recent audit, with no fix or acknowledgment since | > 24 hours |
| `lens_skipped_repeatedly` | Same audit lens has reported `lens_skipped` for ≥ 3 consecutive runs | always trips on 3rd |

Long-running but actively-progressing work is *not* a stall — the synthesizer cross-checks with `git log` for recent commits on the actor's branch before tripping `task_stale`. Optionally, build-command meta-prompts may emit `progress_heartbeat` events during long shell commands; if present, heartbeats reset the `task_stale` clock. Heartbeats are not required, only honored when present.

Per-project overrides are written to `.scaffold/observability.yaml`:
```yaml
stall:
  task_stale: 8h
  pr_stale: 72h
  blocker_unaddressed: off
```

### Integration points

- **Build-command meta-prompts** (single-/multi-agent-start, both resume variants, review-pr, review-code) gain explicit instruction blocks telling the executing agent to invoke `scaffold observe event <type> --key=value …` at named workflow points. Each meta-prompt change is small (a paragraph plus the literal command) but unambiguous about *when* the agent should record events.
- **CLI-owned events** (MMR completion, scaffold-step state transitions, decision-log writes) call into the ledger writer directly from `StateManager`, the MMR wrapper, and `decision-logger` — no agent involvement required. This guarantees these events are captured even when work is happening outside a build-command meta-prompt.
- **MMR** gains a 5th channel: `doc-conformance`. Implements the cheap deterministic subset of the audit (the `fast` profile), reconciles into MMR's job format, uses MMR's fix-threshold, and blocks on the PR gate.
- **PostToolUse hook** on `gh pr create` already exists; we extend it so it also kicks off `scaffold observe audit --profile=fast` against the PR diff (or, equivalently, runs the doc-conformance MMR channel — same effect via a different surface).
- **Pipeline phases** that produce planning artifacts (stories, plan, tech-stack, design-system, decisions) gain an optional post-phase audit hook (advisory) that runs the relevant cross-doc lenses.
- **Dashboard generator** (`scripts/generate-dashboard.sh`) gains progress and audit panels.

### Key invariants

- The engine emits a single JSON shape; renderers are pure transforms over that JSON. Renderers do not read from the filesystem, git, or external CLIs — only from the engine JSON. They do *write* to their own output destinations (stdout, `docs/build-status/`, dashboard fragments), and those writes are subject to render-time redaction.
- The ledger is append-only. Ledger writers never read the ledger; only the synthesizer reads it, and only at report time. Worktree-local ledgers are harvested to the central archive (see Multi-worktree concurrency model) and merged by the synthesizer at report time.
- Every check module has the same signature: `(graph, code, ledger, availability) → finding[]`. Adding a 9th lens is a single new file under `src/observability/checks/`.
- **Graceful degradation is the default.** Beads, MMR, `gh`, and even `git` are *enrichments* — the engine probes for each via the corresponding source adapter, marks availability, and continues with whatever's present. Checks that need an unavailable adapter mark themselves `skipped` rather than producing false positives. The engine never *requires* Beads or MMR.
- **Filesystem-access boundaries** are explicit:
  - **Source adapters** own *read* access to data sources (git, gh, plan/playbook docs, state.json, .beads/, .mmr/).
  - **Ledger writer** owns *append-only write* access to `.scaffold/activity.jsonl` and the harvested archive.
  - **Persisted renderers** own *write* access to their report destinations (`docs/build-status/`, `docs/audits/`, `.scaffold/dashboard.html` fragments).
  - No other component touches the filesystem directly. Engine internals (synthesizer, doc-graph, checks framework) are pure functions over adapter output and ledger contents.

### Layout

```
src/observability/
  engine/
    ledger-writer.ts              append-only writer; payload-allowlist enforcement at write time
    synthesizer.ts                composes adapter output + ledger into engine JSON
    doc-graph.ts                  graph builder
    doc-roles.ts                  step-slug → graph-role mapping (extensible via .scaffold/observability.yaml)
    event-schemas.ts              allowlisted payload schemas per event type
    redact.ts                     write-time + render-time redaction (paths, secrets)
    stall.ts                      stall-signal evaluation
    checks-runner.ts              orchestrator for checks framework
  adapters/                       git.ts, gh.ts, plan-doc.ts, tests.ts, state.ts, beads.ts, mmr.ts, audit-history.ts
  checks/                         one file per lens (lens-a-tdd.ts … lens-h-cross-doc.ts)
  renderers/                      terminal.ts, markdown.ts, dashboard.ts
src/cli/commands/observe.ts       CLI entry; subcommands: progress, audit, event, harvest, gc, digest
content/tools/observe-progress.md tool meta-prompt (recipe for agents and humans)
content/tools/observe-audit.md    tool meta-prompt
scripts/setup-agent-worktree.sh   teardown extended to call `scaffold observe harvest`
scripts/generate-dashboard.sh     extended with named anchors; shells to TS for fragments
packages/mmr-channel-doc-conformance/   MMR channel wrapper; calls fast-profile audit, emits MMR findings
.scaffold/observability.yaml      per-project config (stall thresholds, role-map extensions)
```

<!-- Sections 2–N to follow -->
