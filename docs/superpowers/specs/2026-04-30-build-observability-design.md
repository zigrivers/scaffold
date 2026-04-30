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

1. **Ledger writer** — exposed as `scaffold observe event <type> --key=value …`. Build-command meta-prompts (`single-agent-start`, `multi-agent-start`, both `*-resume` variants, `review-pr`, `review-code`) gain explicit instruction blocks telling the executing agent to invoke this command at named workflow points: after claiming a task (`task_claimed`), after completion (`task_completed`), when recording a decision (`decision_recorded`), when hitting a blocker (`blocker_hit`), and after opening a PR (`pr_opened`). The ledger captures *agent-driven workflow events* — the narrative spine of what the team did. **Tool-emitted signals** (MMR completions, scaffold-step state transitions, PR merges) stay in their existing artifacts (`.mmr/jobs/`, `.scaffold/state.json`, GitHub) and are surfaced into the engine output by the corresponding source adapters as synthesized replay events. The one exception is `decision_recorded`, which is shared: agents call it from meta-prompts; CLI code (`decision-logger`) calls the same writer directly when invoked from a TypeScript path. Multi-worktree concurrency model in the next subsection.
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

## Section 2 — Data Model

The design's contracts: the schemas that flow between components. Everything in the engine speaks JSON. Renderers, downstream tools, and tests bind to these shapes.

### 2.1 Allowed event types

Eight event types in v1, declared in `src/observability/engine/event-schemas.ts`. Each has an allowlisted payload schema; fields outside the allowlist are dropped at write time. **Note:** `task_id`, `actor_label`, `branch`, `worktree_id`, `event_id`, `ts`, `type` live on the `BaseEvent` envelope (see 2.2). The "Payload" column lists fields that are *not* on the envelope.

| Type | Emitted by | task_id | Payload (allowlisted) |
|---|---|---|---|
| `task_claimed` | Build-command meta-prompts (single/multi-agent-start, resume) | optional (`null` for ad-hoc/unplanned work) | `task_title`, `story_id?`, `wave?`, `unplanned?: boolean` |
| `task_completed` | Same | optional (must match `task_claimed` if set) | `outcome` ∈ `pr_submitted \| dropped \| superseded`, `pr_number?`, `commit_sha?` |
| `decision_recorded` | Same; also `decision-logger` directly | optional (allowed when made during a task) | `key`, `summary` (≤ 500 chars), `affects` (string[], file globs or doc paths), `links?` (string[] of repo-relative paths or PR numbers) |
| `blocker_hit` | Build-command meta-prompts | optional | `kind` ∈ `dependency \| ambiguity \| external \| environment`, `summary` (≤ 500 chars) |
| `blocker_resolved` | Same | optional | `summary` (≤ 500 chars), `references` (event_id[]) |
| `pr_opened` | Build-command meta-prompts | optional | `pr_number` |
| `progress_heartbeat` | Optional; emitted by long shell-command wrappers | optional | `note` (≤ 200 chars) |
| `finding_acknowledged` | `scaffold observe ack <finding-id>` (CLI command) | null | `finding_id`, `status` ∈ `acknowledged \| open`, `note?` (≤ 200 chars) |

`finding_acknowledged` is what agents and humans use to transition findings out of the default `open` state. The engine reads these events when computing current finding status; the latest `finding_acknowledged` event for a given `finding_id` wins. The user-writable status values are `acknowledged` (excluded from blocking_findings) and `open` (revoke a prior acknowledgment). The `skipped` status is engine-set only — emitted by lenses that lack the adapter data they need — and is *never* written via a `finding_acknowledged` event. There is no `fixed` status: a finding that's been resolved simply does not reappear in the next run's `findings[]` (which is a current-state snapshot, not a history).

**Terminal PR status** (`pr_merged`, `pr_closed`) is **not** a ledger event — it's surfaced by the `gh` adapter as a synthesized replay event. Agents reporting `task_completed` typically use `outcome: "pr_submitted"`; the actual merge state is observable from `gh` later. This separates "what the agent did" (workflow) from "what the world reported back" (state).

**Tool-emitted signals** (PR merges, MMR completions, scaffold-step state transitions, test runs) are **not** ledger event types. They live in their existing artifacts (`gh`, `.mmr/jobs/`, `.scaffold/state.json`, test runners) and are surfaced by the corresponding source adapters as **synthesized replay events** at report time (see 2.7). Source adapters remain read-only; they never write to the ledger. This keeps the ledger lean (agent-driven narrative only) and avoids duplicating data that already has authoritative storage elsewhere.

### 2.2 Event payload schemas (TypeScript sketch)

```ts
// src/observability/engine/event-schemas.ts (sketch)
export type EventType =
  | "task_claimed" | "task_completed"
  | "decision_recorded"
  | "blocker_hit" | "blocker_resolved"
  | "pr_opened"
  | "progress_heartbeat"
  | "finding_acknowledged";

export interface BaseEvent {
  event_id: string;          // ULID
  worktree_id: string;       // UUID from .scaffold/identity.json
  actor_label: string;
  branch: string;
  task_id: string | null;    // null for finding_acknowledged and unplanned work; optional for all others
  type: EventType;
  ts: string;                // ISO 8601 UTC
}

// Payloads exclude fields that live on BaseEvent (task_id, actor_label, branch, etc.).
export interface TaskClaimedPayload {
  task_title: string;
  story_id?: string;
  wave?: string;
  unplanned?: boolean;       // true when task_id is null and the work isn't tracked in the plan/playbook
}

export type Event =
  | (BaseEvent & { type: "task_claimed";        payload: TaskClaimedPayload })
  | (BaseEvent & { type: "task_completed";      payload: TaskCompletedPayload })
  | (BaseEvent & { type: "decision_recorded";   payload: DecisionRecordedPayload })
  | (BaseEvent & { type: "blocker_hit";         payload: BlockerHitPayload })
  | (BaseEvent & { type: "blocker_resolved";    payload: BlockerResolvedPayload })
  | (BaseEvent & { type: "pr_opened";           payload: PrOpenedPayload })
  | (BaseEvent & { type: "progress_heartbeat";  payload: HeartbeatPayload })
  | (BaseEvent & { type: "finding_acknowledged"; task_id: null; payload: FindingAckPayload });
```

`task_id` is `null | string` on every event. `task_claimed` with `task_id: null` requires `payload.unplanned: true` (writer-enforced) so unplanned work is explicit. `task_completed` events with `task_id` set must match a prior `task_claimed` with the same `task_id` from the same actor; orphan completions are rejected by the writer.

Schemas are also expressed as JSON Schema (`event-schemas.json`) for consumers outside TypeScript (e.g., `mmr-channel-doc-conformance` may be a separate package).

### 2.3 Doc-graph schema

The doc-graph is the typed object the audit and progress features both reason over. Built once per command invocation by `doc-graph.ts` from the source adapters' output.

```ts
// src/observability/engine/doc-graph.ts (sketch)
export interface DocGraph {
  features: Feature[];                     // from PRD
  stories: Story[];                        // from user-stories
  acceptance_criteria: AcceptanceCriterion[]; // child-of-story; flattened for graph queries
  plan_tasks: PlanTask[];                  // from implementation-plan
  playbook_tasks: PlaybookTask[];          // from implementation-playbook (precedence over plan)
  tests: Test[];                           // from story-tests-map + filesystem
  pull_requests: PullRequest[];            // from gh adapter; PR-level metadata
  files: FileNode[];                       // from PR diffs + git
  rules: Rule[];                           // from coding-standards, tdd-standards
  components: SanctionedComponent[];       // from tech-stack + architecture docs
  tokens: DesignToken[];                   // from design-system
  decisions: Decision[];                   // from decisions.jsonl + recent decision_recorded ledger events
  edges: Edge[];                           // typed edges, see below
  provenance: Record<NodeId, AdapterId>;   // per-node mapping: which adapter contributed this node
}

export type Edge =
  | { kind: "feature_to_story";        from: FeatureId;   to: StoryId }
  | { kind: "story_to_ac";             from: StoryId;     to: AcId }
  | { kind: "ac_to_test";              from: AcId;        to: TestId }
  | { kind: "story_to_plan_task";      from: StoryId;     to: PlanTaskId }
  | { kind: "plan_task_to_playbook";   from: PlanTaskId;  to: PlaybookTaskId }
  | { kind: "playbook_task_to_pr";     from: PlaybookTaskId; to: PrNumber }
  | { kind: "pr_to_file";              from: PrNumber;    to: FilePath }
  | { kind: "file_to_token_use";       from: FilePath;    to: TokenId | "ad_hoc" }
  | { kind: "file_to_component_use";   from: FilePath;    to: ComponentId | "unsanctioned" }
  | { kind: "decision_supersedes";     from: DecisionId;  to: DecisionId }
  | { kind: "decision_links_doc";      from: DecisionId;  to: DocAnchor }
  | { kind: "decision_to_file";        from: DecisionId;  to: FileNodeId };
```

**ID conventions.** Every graph entity has an ID of the form `"<kind>:<stable-id>"` — `FeatureId`, `StoryId`, `AcId`, `PlanTaskId`, `PlaybookTaskId`, `TestId`, `PrId` (e.g., `"pr:42"`), `FileNodeId` (e.g., `"file:src/auth/login.ts"`), `RuleId`, `ComponentId`, `TokenId`, `DecisionId`, `DocAnchor` are all aliases of `NodeId`. Edge `from`/`to` always reference these IDs, never raw values. Where collections referenced raw types in earlier drafts (`PrNumber`, `FilePath`), the constructor normalizes to the kinded ID at graph build time.

`provenance` is a per-node map so audits can explain *why* a node exists ("this AC came from `docs/user-stories.md`") and *which adapter degraded* if a node is missing ("the `pull_requests` collection is empty because `gh` is unavailable"). `AdapterId` is the same identifier used in the `availability` map (e.g., `"plan_doc"`, `"gh"`).

The `decision_to_file` edge connects a decision to specific files. The `affects` payload of a `decision_recorded` event is a list of globs; at graph build time, the doc-graph constructor expands each glob against `files` to materialize concrete `decision_to_file` edges, one per matched file. Globs that match zero files are recorded under `provenance` as a `decision_unresolved_glob` annotation so lenses can flag stale `affects` patterns.

**Orphan and missing-edge detection.** Audit lenses operate on the graph by querying for orphan nodes (a `Story` with no `story_to_ac` outgoing edge, an `AC` with no `ac_to_test` outgoing edge, etc.) and unsanctioned uses (a `file_to_component_use` edge whose target is `"unsanctioned"`). Each lens declares which edges and node-types it requires; when those are absent because of an unavailable adapter, the lens emits `lens_skipped`.

**Stable IDs.** Every node has a stable ID derived from its source artifact (e.g., a story ID is `<doc-anchor-slug>` from the user-stories markdown). IDs are deterministic so trends across audit runs can be computed.

### 2.4 Finding schema

Findings are the audit's output — the unit that flows to fix-threshold logic, MMR reconcile, and renderers.

```ts
export interface Finding {
  id: string;                 // stable across runs; derivation below
  lens_id: string;            // e.g. "B-ac-coverage", "H-cross-doc"
  severity: "P0" | "P1" | "P2" | "P3";
  title: string;              // ≤ 80 chars
  description: string;        // ≤ 500 chars; full detail in evidence
  source_doc: string;         // repo-relative path or doc anchor that this audit grades against
  evidence: Evidence;
  fix_hint?: FixHint;         // optional, machine-readable
  confidence: "high" | "medium" | "low";
  first_seen: string;         // ISO date — when this finding's stable id first appeared
  last_seen: string;          // ISO date — most recent run that surfaced it
  status: "open" | "acknowledged" | "skipped";
  ack_note?: string;          // populated when status was set via finding_acknowledged event
}

export type Evidence =
  | { kind: "missing_node";     graph_query: string; expected: string }
  | { kind: "orphan_node";      graph_query: string; node_id: NodeId }
  | { kind: "rule_violation";   rule_id: RuleId; file: FileNodeId; lines?: [number, number] }
  | { kind: "ac_not_covered";   story_id: StoryId; ac_id: AcId; missing_tests: TestId[] }
  | { kind: "doc_disagreement"; left_doc: string; right_doc: string; conflict: string }
  | { kind: "lens_skipped";     reason: "adapter_unavailable" | "insufficient_data"; needed: string[] };

export interface FixHint {
  kind: "edit_doc" | "add_test" | "rename_token" | "record_decision" | "open_task";
  target: string;             // file path or task title
  patch?: string;             // unified diff if mechanically derivable
  prompt?: string;            // free-form prompt for an agent fix loop
}
```

**Stable ID derivation.** A finding's `id` is `sha256(lens_id || "" || normalized_source_anchor || "" || canonical_evidence)[0:16]`, where:
- `normalized_source_anchor` is the *symbolic* location, never a line number — for `rule_violation` it's `<file>::<symbol-path>` resolved via tree-sitter or a tag scan; for `ac_not_covered` it's `<story_id>::<ac_id>`; for `doc_disagreement` it's `<left_doc>::<right_doc>::<sorted-conflict-keys>`; for `missing_node`/`orphan_node`/`lens_skipped` it's the `graph_query` string verbatim.
- `canonical_evidence` is the JSON-stable serialization of `evidence` with line numbers stripped and arrays sorted.

This means insertions/deletions above a finding don't change its ID; only the *nature* of the finding does. `first_seen` therefore tracks the actual lifetime of a drift, not the lifetime of a line offset.

**`findings[]` is a current-state snapshot, not a history.** Each audit run produces the set of findings *currently true* against the current code+docs. Findings that no longer hold simply don't appear. Trend data (when something first appeared, when it was acknowledged) lives in the `audit-history` adapter (JSON sidecars) and the ledger's `finding_acknowledged` events. The `findings[]` array therefore omits status `"fixed"` (which would be a historical artifact); fixed drift is gone, not "still in the array but marked".

**Status mutation.** Findings start `"open"` by default. Status values:
- `open` — the default; finding is currently detected and not acknowledged. Counted in blocking_findings.
- `acknowledged` — human or agent has accepted the finding as known/intentional. Excluded from blocking_findings.
- `skipped` — engine-set only; emitted by lenses that return `lens_skipped` evidence because a required adapter is unavailable.

Status is computed by `findings-aggregator.ts`: take the most recent applicable `finding_acknowledged` ledger event for each `finding_id`. If the latest event has `status: "acknowledged"`, the finding is acknowledged. If the latest event has `status: "open"`, acknowledgment is revoked (back to default). If no event exists for the finding_id, the finding is `open`. Lens-emitted `skipped` overrides anything from the ledger — adapter availability dictates this status, not user input.

The `scaffold observe ack` CLI command is the only user-facing way to mutate finding status. It writes a `finding_acknowledged` ledger event with `status: "acknowledged" | "open"`.

**Severity rubric (mirrors MMR):**
- **P0** — broken-by-design: tests skipped on production-critical paths; a sanctioned-stack item replaced with an alternative without a recorded decision; an entire user story has no implementation-plan task.
- **P1** — substantive drift: ACs without test coverage; design-system tokens bypassed in user-facing UI; coding-standards rules violated more than threshold occurrences in changed files.
- **P2** — soft drift: small standards inconsistencies; recently-introduced unsanctioned-but-trivial dependencies; documentation lag (e.g., decision recorded in code comment but not in decisions log).
- **P3** — advisory / nice-to-have: stylistic suggestions; opportunities to consolidate; lens skipped because of unavailable enrichment (Beads, MMR).

**Severity ordering.** `P0` is most severe, `P3` is least severe. The phrase "at or above threshold T" means severities whose rank is ≤ T's rank, where rank is `P0=0, P1=1, P2=2, P3=3`. So `fix_threshold=P2` blocks on `{P0, P1, P2}` (anything with rank ≤ 2). The engine and renderers use a `severityRank()` helper rather than naive string comparison.

**`fix_threshold` resolution order** (no dependency on MMR adapter availability — the threshold is a config read, not a job-result read):
1. CLI flag `--fix-threshold P0|P1|P2|P3` if provided.
2. `audit_fix_threshold` from `.mmr.yaml` if present.
3. `fix_threshold` from `.mmr.yaml` if present (shared with MMR).
4. Default `P2`.

`.mmr.yaml` is read by a small dedicated config loader inside the engine (not via the `mmr` adapter, which deals with job results). The threshold therefore resolves correctly whether or not MMR has ever run.

### 2.5 Engine output JSON shape

The single shape all renderers consume:

```ts
export interface EngineOutput {
  invocation: {
    command: "progress" | "audit";
    args: Record<string, unknown>;
    started_at: string;
    completed_at: string;
    scaffold_version: string;
  };
  availability: AvailabilityMap;          // see 2.6 — always present
  snapshot: Snapshot | null;              // see 2.7 — present for progress; null for audit unless --include-snapshot
  replay: ReplayTimeline | null;          // present when --replay (progress) or audit/full
  findings: Finding[];                    // present for audit; empty array for progress; current-state snapshot only
  needs_attention: NeedsAttentionItem[];  // stall detection output — always present (may be empty)
  graph_stats: GraphStats;                // node + edge counts by type — always present
  fix_threshold: "P0" | "P1" | "P2" | "P3";  // resolved per the order in 2.4; always present
}
```

`blocking_findings` is **not** carried in the JSON. It's a derived view: `findings.filter(f => severityRank(f.severity) <= severityRank(fix_threshold) && f.status === "open")`. Renderers compute it; the engine emits the inputs. This avoids redundant data and the inconsistency risk of two arrays that must agree.

Both commands produce the same shape with the same required fields; whichever fields don't apply to a given command are explicitly `null` (snapshot/replay) or `[]` (findings, needs_attention). Renderers handle nulls/empties uniformly: a missing snapshot just means that section is omitted from the rendered view.

`audit` may opt into a snapshot via `--include-snapshot` when the user wants a combined view (often paired with `--profile=full`). `progress` may opt into a replay via `--replay`; otherwise replay is `null`.

### 2.6 Availability map

```ts
export interface AvailabilityMap {
  // one entry per source adapter
  git:           AdapterStatus;
  gh:            AdapterStatus;
  plan_doc:      AdapterStatus;
  tests:         AdapterStatus;
  state:         AdapterStatus;
  beads:         AdapterStatus;
  mmr:           AdapterStatus;
  audit_history: AdapterStatus;
  // ledger summary
  ledger: {
    events_read: number;
    malformed_lines: number;
    sources: { worktree_id: string; events: number; harvested_at?: string }[];
  };
}

export interface AdapterStatus {
  status: "available" | "degraded" | "unavailable";
  reason?: string;        // human-readable explanation when degraded/unavailable
  evidence_paths?: string[];  // which files/commands contributed
}
```

Renderers display the availability map prominently when any adapter is `degraded` or `unavailable`, so users know which inputs the report was built from.

### 2.7 Snapshot and replay shapes

```ts
export interface Snapshot {
  current_phase: string;                   // pipeline phase slug
  active_agents: ActiveAgent[];            // worktree_id → current task → branch → PR
  completed_in_window: TaskCompletion[];   // since `--since` or default 24h
  in_flight: TaskInFlight[];
  blocked: BlockedTask[];                  // each with reason + age
  upcoming: UpcomingTask[];                // dependency-ordered, plan/playbook
  recent_decisions: DecisionSummary[];     // top N from ledger + decisions log
  story_coverage: StoryCoverageRow[];      // story_id → {plan_tasks, playbook_tasks, ACs covered/missed}
}

export interface ReplayTimeline {
  window: { from: string; to: string };
  events: ReplayEvent[];                   // ledger events + synthesized git/PR events, time-sorted
}

export interface ReplayEvent {
  sort_id: string;                         // unique per event; deterministic ordering
  correlation_id: string | null;           // logical key for cross-source dedupe; null for non-correlatable events
  ts: string;
  source: "ledger" | "git" | "gh" | "tests" | "mmr" | "state";
  kind: string;                            // e.g., "task_completed", "commit", "pr_merged", "test_run_failed", "step_completed"
  actor_label?: string;
  task_id?: string;
  summary: string;                         // ≤ 200 chars; for terminal/markdown rendering
  link?: string;                           // PR URL, commit hash, file anchor
}
```

The replay stream is the *fused* timeline: ledger events provide the agent-driven narrative spine; the synthesizer interleaves commits, PR opens/merges, test runs, MMR completions, and scaffold-step state transitions from the source adapters at report time.

**`sort_id` derivation per source** (always unique per event; used for stable ordering):
- `ledger` → `"ledger:" + event_id` (the ULID)
- `git` → `"git:" + commit_sha`
- `gh` → `"gh:" + pr_number + ":" + event_kind` (e.g., `"gh:42:opened"`, `"gh:42:merged"`)
- `tests` → `"tests:" + run_id + ":" + test_name` (test runners that don't expose a run_id fall back to `"tests:" + sha256(file_path + test_name + ts)[0:12]`; `test_name` includes the suite path so collisions across same-named tests in different files are impossible)
- `mmr` → `"mmr:" + job_id`
- `state` → `"state:" + step_slug + ":" + state_transition_kind` (e.g., `"state:user-stories:completed"`)

**`correlation_id` derivation per logical event** (used for cross-source dedupe; same logical event from different sources gets the same `correlation_id`):
- PR-open events from `ledger` (`pr_opened`) and `gh` → `"pr:" + pr_number + ":opened"`
- PR-merge events from `gh` → `"pr:" + pr_number + ":merged"`
- Other events without a known cross-source twin → `null`

Sort key is `(ts, source_priority, sort_id)` with `ledger > mmr > gh > git > state > tests` as the tiebreak when timestamps collide.

**Dedupe** runs on `correlation_id` (skipping events with `correlation_id === null`): when multiple events share a `correlation_id`, the engine keeps exactly one — the highest-priority source wins, ties broken by earliest `ts`. Other events pass through unchanged. This is what makes a ledger `pr_opened` event suppress the matching synthesized `gh` PR-open replay event.

### 2.8 Auxiliary type definitions

Compact definitions for types referenced above. Field-level documentation lives in TypeScript JSDoc; this section pins the shapes so renderers and tests can bind to them.

```ts
// Event payload types (referenced by the union in 2.2)
export interface TaskCompletedPayload {
  outcome: "pr_submitted" | "dropped" | "superseded";
  pr_number?: number;
  commit_sha?: string;
}

export interface DecisionRecordedPayload {
  key: string;                  // stable slug, used as DecisionId
  summary: string;              // ≤ 500 chars
  affects: string[];            // file globs or doc paths
  links?: string[];             // repo-relative paths or PR numbers
}

export interface BlockerHitPayload {
  kind: "dependency" | "ambiguity" | "external" | "environment";
  summary: string;              // ≤ 500 chars
}

export interface BlockerResolvedPayload {
  summary: string;              // ≤ 500 chars
  references: string[];         // event_ids of related blocker_hit events
}

export interface PrOpenedPayload {
  pr_number: number;
}

export interface HeartbeatPayload {
  note: string;                 // ≤ 200 chars
}

export interface FindingAckPayload {
  finding_id: string;
  status: "acknowledged" | "open";
  note?: string;                // ≤ 200 chars
}

// Snapshot child types
export interface ActiveAgent {
  worktree_id: string;
  actor_label: string;
  branch: string;
  current_task: { id: string | null; title: string; claimed_at: string } | null;
  open_pr: { number: number; url: string; opened_at: string } | null;
}

export interface TaskCompletion {
  task_id: string | null;     // null for unplanned work
  task_title: string;
  outcome: "pr_submitted" | "merged" | "dropped" | "superseded";
  pr_number?: number;
  merged_at?: string;
  by: string;                 // actor_label
}

export interface TaskInFlight {
  task_id: string;
  task_title: string;
  story_id?: string;
  by: string;                 // actor_label
  claimed_at: string;
  age_hours: number;
  branch: string;
  pr_number?: number;
}

export interface BlockedTask {
  task_id: string;
  task_title: string;
  blocker_kind: "dependency" | "ambiguity" | "external" | "environment";
  reason: string;             // ≤ 200 chars
  blocked_at: string;
  age_hours: number;
}

export interface UpcomingTask {
  task_id: string;
  task_title: string;
  story_id?: string;
  ready: boolean;             // true when all dependencies are satisfied
  blocked_by: string[];       // task_ids of unsatisfied dependencies
  wave?: string;
}

export interface DecisionSummary {
  decision_id: DecisionId;
  key: string;
  summary: string;
  recorded_at: string;
  affects: string[];          // file globs
}

export interface StoryCoverageRow {
  story_id: StoryId;
  story_title: string;
  plan_tasks: { id: PlanTaskId; status: "todo" | "in_flight" | "done" }[];
  playbook_tasks: { id: PlaybookTaskId; status: "todo" | "in_flight" | "done" }[];
  acs_total: number;
  acs_with_tests: number;
  acs_test_passing: number;
}

// Stall detection
export interface NeedsAttentionItem {
  signal: "task_stale" | "pr_stale" | "pr_review_stale"
        | "blocker_unaddressed" | "audit_findings_unresolved"
        | "lens_skipped_repeatedly";
  ref: { kind: "task" | "pr" | "finding" | "lens"; id: string };
  age_hours: number;
  threshold_hours: number;
  summary: string;            // human-readable
}

// Graph stats
export interface GraphStats {
  nodes_by_kind: Record<string, number>;   // e.g., { story: 14, plan_task: 23, file: 156 }
  edges_by_kind: Record<string, number>;
  orphans_by_kind: Record<string, number>; // count of nodes with no inbound edges where one is expected
  unsanctioned_uses: number;               // file_to_component_use edges to "unsanctioned"
  ad_hoc_token_uses: number;               // file_to_token_use edges to "ad_hoc"
}
```

These auxiliary types are referenced by `Snapshot` (2.7), `EngineOutput` (2.5), and the stall-detection block in Section 1; their definitions are stable contracts that renderers, tests, and downstream consumers can rely on.

<!-- Sections 3–N to follow -->

