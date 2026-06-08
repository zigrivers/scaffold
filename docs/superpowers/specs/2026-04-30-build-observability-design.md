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
   - `pipeline_docs` adapter — reads all scaffold-pipeline planning artifacts: `docs/prd.md`, `docs/user-stories.md`, `docs/tech-stack.md`, `docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/design-system.md`, `docs/implementation-plan.md`, `docs/implementation-playbook.md`, `docs/architecture/`, `docs/decisions/` (or canonical decisions doc), and `decisions.jsonl`. Returns parsed structured fields (frontmatter, headings, ID-anchored sections, tables) for the doc-graph builder. Each artifact is independently optional; missing artifacts are absent from the graph rather than failing the adapter. For execution-status precedence: playbook is authoritative when present, plan is authoritative for AC/dependency structure.
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
- **PostToolUse hook** on `gh pr create` already exists; the doc-conformance audit runs as a built-in MMR channel inside `scaffold run review-pr`, so no new hook trigger is needed. The existing hook's reminder text is updated to mention the audit (see Section 5.5 for hook details).
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
  adapters/                       git.ts, gh.ts, pipeline-docs.ts, tests.ts, state.ts, beads.ts, mmr.ts, audit-history.ts
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
  | { kind: "feature_to_story";          from: FeatureId;      to: StoryId }
  | { kind: "story_to_ac";               from: StoryId;        to: AcId }
  | { kind: "ac_to_test";                from: AcId;           to: TestId }
  | { kind: "test_to_file";              from: TestId;         to: FileNodeId }
  | { kind: "story_to_plan_task";        from: StoryId;        to: PlanTaskId }
  | { kind: "plan_task_to_playbook";     from: PlanTaskId;     to: PlaybookTaskId }
  | { kind: "playbook_task_to_story";    from: PlaybookTaskId; to: StoryId }
  | { kind: "playbook_task_to_pr";       from: PlaybookTaskId; to: PrId }
  | { kind: "pr_to_file";                from: PrId;           to: FileNodeId }
  | { kind: "file_to_token_use";         from: FileNodeId;     to: TokenId | "ad_hoc" }
  | { kind: "file_to_component_use";     from: FileNodeId;     to: ComponentId | "unsanctioned" }
  | { kind: "decision_supersedes";       from: DecisionId;     to: DecisionId }
  | { kind: "decision_links_doc";        from: DecisionId;     to: DocAnchor }
  | { kind: "decision_to_file";          from: DecisionId;     to: FileNodeId };
```

`test_to_file` connects each test node to the source file it lives in, derived from filesystem walking by `pipeline_docs` and `tests` adapters. `playbook_task_to_story` is a *direct* link useful for unplanned tasks (where no PlanTask exists) and for orphan-detection on the playbook side without traversing through plan tasks. `feature_to_story` and `playbook_task_to_pr` and `pr_to_file` use the kinded ID aliases.

**ID conventions.** Every graph entity has an ID of the form `"<kind>:<stable-id>"` — `FeatureId`, `StoryId`, `AcId`, `PlanTaskId`, `PlaybookTaskId`, `TestId`, `PrId` (e.g., `"pr:42"`), `FileNodeId` (e.g., `"file:src/auth/login.ts"`), `RuleId`, `ComponentId`, `TokenId`, `DecisionId`, `DocAnchor` are all aliases of `NodeId`. Edge `from`/`to` always reference these IDs, never raw values. Where collections referenced raw types in earlier drafts (`PrNumber`, `FilePath`), the constructor normalizes to the kinded ID at graph build time.

`provenance` is a per-node map so audits can explain *why* a node exists ("this AC came from `docs/user-stories.md`") and *which adapter degraded* if a node is missing ("the `pull_requests` collection is empty because `gh` is unavailable"). `AdapterId` is the same identifier used in the `availability` map (e.g., `"pipeline_docs"`, `"gh"`).

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
export type Verdict = "pass" | "degraded-pass" | "blocked";

export interface EngineOutput {
  schema_version: "1.0";                  // versioned starting in v1 so consumers can pin
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
  verdict: Verdict;                       // engine-computed; see derivation below
  summary: FindingsSummary;               // pre-computed counts for renderers; always present
}

export interface FindingsSummary {
  total: number;
  by_severity: { P0: number; P1: number; P2: number; P3: number };
  by_severity_status: {
    P0: { open: number; acknowledged: number; skipped: number };
    P1: { open: number; acknowledged: number; skipped: number };
    P2: { open: number; acknowledged: number; skipped: number };
    P3: { open: number; acknowledged: number; skipped: number };
  };
  blocking: number;        // count of findings where severityRank(severity) <= severityRank(fix_threshold) && status === "open"
  acknowledged: number;    // count of findings where status === "acknowledged"
  skipped_lenses: number;  // count of distinct lens_ids that emitted lens_skipped evidence
}
```

`summary` is computed by the engine immediately after findings are aggregated, so all three renderers and downstream consumers see the same counts. Renderers must never recompute these counts from `findings[]`; they always read from `summary`. The `by_severity_status` breakdown supports the per-severity Visible/Acknowledged tables in markdown reports and the "P2 (3) + acknowledged 1 hidden" terminal lines without touching `findings[]`.

**`verdict` derivation** (deterministic; computed by the engine, not by renderers):
- `progress` command: `verdict` is always `"pass"` (progress does not gate; it informs).
- `audit` command:
  - `"blocked"` if any finding has `severityRank(severity) <= severityRank(fix_threshold)` and `status === "open"` (i.e., at least one open blocking finding).
  - `"degraded-pass"` otherwise if any required adapter for an enabled lens is `unavailable` AND that lens emitted a `lens_skipped` evidence finding (i.e., the audit completed but with reduced confidence).
  - `"pass"` otherwise.

Renderers display the verdict; they don't compute it. Persisted JSON sidecars include the verdict verbatim.

`blocking_findings` is **not** carried in the JSON. It's a derived view: `findings.filter(f => severityRank(f.severity) <= severityRank(fix_threshold) && f.status === "open")`. Renderers compute it; the engine emits the inputs. This avoids redundant data and the inconsistency risk of two arrays that must agree.

Both commands produce the same shape with the same required fields; whichever fields don't apply to a given command are explicitly `null` (snapshot/replay) or `[]` (findings, needs_attention). Renderers handle nulls/empties uniformly: a missing snapshot just means that section is omitted from the rendered view.

`audit` may opt into a snapshot via `--include-snapshot` when the user wants a combined view (often paired with `--profile=full`). `progress` may opt into a replay via `--replay`; otherwise replay is `null`.

### 2.6 Availability map

```ts
export interface AvailabilityMap {
  // one entry per source adapter
  git:           AdapterStatus;
  gh:            AdapterStatus;
  pipeline_docs: AdapterStatus;
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

// Doc-graph node types — minimal field set used by lenses
export interface Feature {
  id: FeatureId;
  title: string;
  priority: "must" | "should" | "could" | "wont";
  source_anchor: string;        // link back to docs/prd.md
  prose?: string;               // raw section text; optional, populated when full profile asks
}
export interface Story {
  id: StoryId;
  title: string;
  priority: "must" | "should" | "could" | "wont";
  kind?: "ui" | "api" | "data" | "infra" | "doc";
  feature_id?: FeatureId;       // direct backref when discoverable
  source_anchor: string;
}
export interface AcceptanceCriterion {
  id: AcId;
  story_id: StoryId;
  text: string;                 // ≤ 500 chars
  source_anchor: string;
}
export interface PlanTask {
  id: PlanTaskId;
  title: string;
  status: "todo" | "in_flight" | "done" | "skipped";
  story_id?: StoryId;
  wave?: string;
  source_anchor: string;
}
export interface PlaybookTask {
  id: PlaybookTaskId;
  title: string;
  status: "todo" | "in_flight" | "done" | "skipped";
  story_id?: StoryId;            // direct link supports unplanned tasks
  plan_task_id?: PlanTaskId;     // present when this playbook task tracks a plan task
  source_anchor: string;
}
export interface Test {
  id: TestId;
  name: string;
  file_path: string;             // raw path; canonical FileNodeId is "file:" + file_path
  framework?: string;            // e.g., vitest, pytest
  last_status?: "passing" | "failing" | "skipped" | "unknown";  // from tests adapter when available
}
export interface PullRequest {
  id: PrId;
  number: number;
  url: string;
  state: "open" | "merged" | "closed";
  branch: string;
  opened_at: string;
  merged_at?: string;
}
export interface FileNode {
  id: FileNodeId;
  path: string;
  language?: string;
}
export interface Rule {
  id: RuleId;
  description: string;
  pattern?: string;             // regex/AST query for fast deterministic match
  forbidden?: string[];         // forbidden imports/symbols/literals
  match?: string;               // glob/scope of files this rule applies to
  language?: string;             // language tag, when applicable
  severity?: "P0" | "P1" | "P2" | "P3";
  enforce_via?: "linter" | "engine" | "llm";
}
export interface SanctionedComponent {
  id: ComponentId;
  package_or_url: string;
  layer?: string;               // architectural layer this component belongs to
  source_anchor: string;
}
export interface DesignToken {
  id: TokenId;
  category: "color" | "spacing" | "typography" | "shadow" | "radius" | "motion";
  value: string;
  priority: "must" | "should" | "could" | "wont";  // governs lens E severity escalation
  source_anchor: string;
}
export interface Decision {
  id: DecisionId;
  key: string;
  summary: string;
  affects: string[];            // file globs
  superseded_by?: DecisionId;
  source_anchor: string;
  recorded_at: string;
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

## Section 3 — The Eight Audit Lenses

Each lens is a check module under `src/observability/checks/` exporting `(graph, code, ledger, availability) → finding[]`. A lens declares its required adapters; if any are `unavailable`, the lens emits a single `lens_skipped` finding (P3) and otherwise contributes nothing. This is how graceful degradation surfaces to the user — they see *which* lenses skipped and *why*.

### 3.1 Profile membership

Each lens belongs to one or both profiles:

- **fast** — cheap, deterministic, runs on every PR via the `mmr-channel-doc-conformance` channel. Bounded by graph traversal + regex/string matching; no LLM calls. Target wall-clock budget: ≤ 5 s per PR (small repos) / ≤ 30 s per PR (large repos).
- **full** — runs at phase boundaries and on-demand (`scaffold observe audit --profile=full`). May call LLMs for fuzzy judgments (e.g., "does this code's pattern actually match the rule's intent?"). No wall-clock budget; designed for human-paced review.

Every lens implements `fast` checks where possible. `full` mode adds judgment-based checks on top of `fast` results.

### 3.2 Lens A — TDD violations (`A-tdd`)

**Checks:**
- (fast) Walk PR diff. For every test file added or modified, look for a corresponding source file change in the same PR. For every source file added or modified outside test directories, look for a matching test file change. Emit findings on asymmetry that violates the project's TDD policy from `docs/tdd-standards.md`.
- (fast) Detect skipped tests (`it.skip`, `xit`, `@Disabled`, `[Ignore]`, language-appropriate forms) introduced or untouched in the PR. Emit P0 if the skip is on a test that maps (via `story-tests-map`) to a story with `priority: "must"`; P1 otherwise.
- (full) For each AC missing test coverage, ask the LLM whether the production change appears to implement that AC; high-confidence "yes" + "no test" combinations escalate from P1 to P0.

**Required adapters:** `git`, `pipeline_docs` (for `docs/tdd-standards.md`).
**Optional adapters:** `tests` (boosts evidence richness for full-profile severity escalation).

**Severity rubric:**
- P0 — skipped test on `priority: "must"` story; production-only PR (no test changes anywhere) when TDD policy requires test-first.
- P1 — AC without a test edge in the changed scope; new public function without a test file touched in the PR.
- P2 — TDD-policy phrasing-violation that doesn't change observable test coverage (e.g., refactoring tests *after* implementation when policy says "tests-first").
- P3 — `lens_skipped` when `docs/tdd-standards.md` is missing.

**Example finding:**
```
[P0] A-tdd: skipped test on critical story
source_doc: docs/tdd-standards.md
evidence: { kind: "rule_violation", rule_id: "tdd-no-skip", file: "file:src/auth/test.spec.ts", lines: [42, 42] }
fix_hint: { kind: "add_test", target: "src/auth/test.spec.ts", prompt: "Re-enable test 'rejects expired token' (story user-auth-1, AC 1.3)." }
```

### 3.3 Lens B — AC completion (`B-ac-coverage`)

**Checks:**
- (fast, structural) Graph query: every `AcceptanceCriterion` → outgoing `ac_to_test` edge. ACs with no `ac_to_test` edge produce P1 findings. This check is purely graph-structural and runs even when `tests` is unavailable.
- (fast, test-execution) For ACs that *do* have `ac_to_test` edges, when `tests` adapter is `available`: ACs whose tests are `failing` produce P0; ACs whose tests have status `unknown` (test exists but has not run in the time window) produce P1.
- (fast, task-coverage) For each `PlaybookTask` with status `done`: traverse `playbook_task_to_story` → `story_to_ac` → `ac_to_test` → `test_to_file` to get the set of test-files associated with the task's parent story. Independently, traverse `playbook_task_to_pr` → `pr_to_file` to get files touched by the task's PRs. The check then differentiates by execution evidence:
  - If `tests` adapter is `available` AND the task's story has at least one AC test that ran in the time window — irrespective of whether the test file appears in the PR diff — the task is considered covered. Bug fixes and refactors that don't add or modify tests are correctly *not* flagged.
  - If `tests` adapter is `available` and *no* AC test ran in the time window for this story → P1 ("task closed but no AC test exercised").
  - If `tests` adapter is `unavailable` and the intersection of test-files-with-AC-edges and PR-touched-files is empty → P2 (best-available signal: task closed and no test files were touched in the PR; without execution data, we can't be confident this is actually broken).
- (full) For ACs with tests but ambiguous coverage, LLM grades whether the test actually exercises the AC's behavior.

**Required adapters:** `pipeline_docs` (for stories + plan + playbook).
**Optional adapters:** `tests` (provides test execution status), `gh` (provides PR file lists for the task-coverage check; without it, that check is skipped — but the structural check still runs).

**Severity rubric:**
- P0 — AC's test is `failing` (only when `tests` adapter is available).
- P1 — AC with no `ac_to_test` edge; playbook task closed `done` with no AC test exercised in window (`tests` available); AC's test status is `unknown` (`tests` available).
- P2 — playbook task closed `done` with empty test-file intersection (only when `tests` is unavailable — degraded signal); full-profile LLM low-confidence "yes, test exercises AC."
- P3 — `lens_skipped` for the *task-coverage* sub-check when `gh` is unavailable (the structural sub-check still runs); `lens_skipped` for the entire lens when `docs/user-stories.md` is missing.

The downgrade rule is **scoped per sub-check**: if `tests` is unavailable, only test-execution-dependent findings are downgraded — failing-test P0 is suppressed entirely (we can't know it's failing without execution data), unknown-status P1 is suppressed, and task-coverage drops from P1 to P2 with a degraded-signal note. The structural "AC without `ac_to_test`" P1 stays at P1 regardless of `tests` availability — it's pure graph data.

### 3.4 Lens C — Coding-standards drift (`C-standards`)

**Checks:**
- (fast) Parse `docs/coding-standards.md` rules (declared as `## Rule: <id>` blocks with `pattern:`, `forbidden:`, or `match:` fields). For each rule, run a deterministic match against changed files in the PR. Emit findings on violations.
- (fast) Tooling integration: if the project's lint config (eslint/ruff/etc.) is referenced in coding-standards, run the linter on changed files and report violations against rules tagged `enforce-via: linter`.
- (full) For freeform-prose rules (rules without a deterministic `pattern:` field), feed the rule and the changed file region to the LLM with a "does this conform?" prompt.

**Required adapters:** `git`, `pipeline_docs` (for `docs/coding-standards.md`).
**Optional adapters:** `tests` (only relevant if a rule covers test code conventions).

**Severity rubric:**
- P0 — rule explicitly tagged `severity: P0` violated.
- P1 — multiple violations of the same rule in the same PR; rule tagged `severity: P1`.
- P2 — single violation of an untagged rule.
- P3 — `lens_skipped` when `docs/coding-standards.md` is missing.

### 3.5 Lens D — Tech-stack / architecture drift (`D-stack`)

**Checks:**
- (fast) For each `file_to_component_use` edge in the doc-graph, verify the target is a sanctioned `ComponentId` (not `"unsanctioned"`). Emit findings for unsanctioned uses.
- (fast) Imports/dependencies analysis: parse import statements (TypeScript, Python, Go, etc., per project) in changed files; cross-reference against the allowlist derived from `docs/tech-stack.md` and any `package.json`/`pyproject.toml`/`go.mod`/etc. dependency lists. Emit findings on imports of newly introduced packages that don't appear in the tech-stack doc.
- (fast) Architecture-doc cross-check: if changed files belong to architectural layers/services described in `docs/architecture/`, verify the change respects the documented inter-layer rules (e.g., "domain layer must not import from infra layer").
- (full) For ambiguous component categorizations (e.g., a generic utility that could be sanctioned or unsanctioned depending on context), LLM grades.

**Required adapters:** `git`, `pipeline_docs` (for tech-stack + architecture docs).
**Optional adapters:** none.

**Severity rubric:**
- P0 — unsanctioned dependency added without a `decision_recorded` event (or `docs/decisions/` entry) referencing the change.
- P1 — sanctioned component used outside its documented layer; inter-layer rule violation.
- P2 — tech-stack doc is older than the dependency manifest; dependency is in the manifest but not yet in the doc.
- P3 — `lens_skipped` when no tech-stack or architecture docs exist.

### 3.6 Lens E — Design-system drift (`E-design`)

**Checks:**
- (fast) For each `file_to_token_use` edge in the doc-graph, count occurrences targeting `"ad_hoc"`. Files with > N ad-hoc uses (default N = 3, configurable in `.scaffold/observability.yaml`) produce findings.
- (fast) For UI files (per project's `ui_glob` config, default `src/components/**/*.{tsx,jsx,vue,svelte}` and `src/styles/**/*.{css,scss}`), parse style sources via deterministic parsers:
  - CSS / SCSS — `postcss` AST: walk `Declaration` nodes, extract values for color-shaped (`color`, `background*`, `border-color`, `fill`, `stroke`), spacing-shaped (`margin*`, `padding*`, `gap`, `top|right|bottom|left`), and typography-shaped (`font-size`, `font-family`, `font-weight`, `line-height`) properties.
  - TSX / JSX — `@babel/parser` AST: walk JSX `style={...}` object expressions and `className` string-literal Tailwind/UnoCSS classes. For Tailwind, decode arbitrary-value syntax `bg-[#ff0]` into a literal value.
  - Vue / Svelte — language-specific parsers (`@vue/compiler-sfc`, `svelte/compiler`) extracting style blocks; values then go through the CSS parser.
  - Each extracted value is cross-referenced against the design-system token table; values that don't resolve to a token become `file_to_token_use → "ad_hoc"` edges in the graph and are subject to the ad-hoc threshold check above. Direct (per-property) findings are also emitted for explicitly-token-governed properties (those whose token is `priority: "must"` in `docs/design-system.md`).
- (full) For pattern-level drift (e.g., "this component reimplements `<Modal>` instead of using the design-system one"), LLM grades by comparing structural signatures.

**Required adapters:** `git`, `pipeline_docs` (for `docs/design-system.md`).

**Severity rubric:**
- P0 — production UI uses raw color/spacing values for a token-governed property whose token is `priority: "must"` in design-system.
- P1 — > N ad-hoc uses in the same file; reimplementation of an existing design-system component.
- P2 — single ad-hoc use in a non-critical-priority file.
- P3 — `lens_skipped` when `docs/design-system.md` is missing.

### 3.7 Lens F — Missing scope (`F-scope`)

**Checks:**
- (fast) Graph query: for every `Feature` whose `priority` is `must` or `should`, look for an outgoing `feature_to_story` edge. Missing → P1 (P0 if `priority: must`).
- (fast) Graph query: for every `Story` whose `priority` is `must` or `should`, look for either an outgoing `story_to_plan_task` edge OR an inbound `playbook_task_to_story` edge (the playbook side covers unplanned-but-tracked work). If neither exists → P0 for `must`, P1 for `should`.
- (fast) Graph query: every `Story` → status check via its `PlanTask`s or `PlaybookTask`s. If all tasks are `todo` *and* the ledger has no `task_claimed` event for any of those tasks within the project's wave/phase budget (per `.scaffold/state.json`'s phase progression) → P2 ("story has plan but no agent has touched it").
- (full) LLM cross-check between PRD prose and stories: features described in PRD prose that no story captures (beyond what the structured graph catches — e.g., features mentioned only in narrative sections).

**Required adapters:** `pipeline_docs`.
**Optional adapters:** `tests` (informs status), `gh` (informs in-flight via PRs), `state` (provides phase budget for the wave-progression check; without it, the P2 "untouched story" check is skipped).

**Severity rubric:**
- P0 — `priority: must` story with no plan task and no playbook task.
- P1 — `priority: should` story without coverage; `priority: must` feature without a story.
- P2 — story planned but untouched past its expected wave/phase.
- P3 — `lens_skipped` when PRD or stories are missing.

### 3.8 Lens G — Undocumented decisions (`G-decisions`)

**Checks:**
- (fast) For each `decision_recorded` ledger event in the time window: confirm a corresponding entry exists in `docs/decisions/` (or the canonical decisions doc — discovered via doc-graph). Findings when ledger has decisions that aren't in the doc.
- (fast) Inverse: for each entry in `docs/decisions/`, confirm a matching `decision_recorded` ledger event exists (or that the entry pre-dates the ledger's earliest event). Findings when decisions are documented but never went through the ledger (suggesting missed instrumentation, not necessarily a bug).
- (fast) Heuristic scan of recent commits for "decision-shaped" commit messages. Patterns are loaded from `src/observability/checks/data/decision-keywords.txt` (engine asset, bundled with the package; users can override via `.scaffold/observability.yaml` `lenses.G-decisions.keywords_file`). Default patterns include `/(decided|chose|going with|will use|migrating to|adopting|switching to)\b/i`. Commits matching the patterns that lack a matching ledger event or doc entry → P2 candidates.
- (fast) **Cross-lens correlation:** when Lens D produces an `unsanctioned-dependency` finding for a file change in the same audit run, Lens G inspects the ledger for any `decision_recorded` event whose `affects` glob matches the changed file *and* whose summary mentions the dependency. If none exists, Lens G escalates to P0 ("unsanctioned dependency added without recorded decision"). This correlation is computed by the checks-runner after Lens D completes; Lens G sees Lens D's findings via the runner's shared findings buffer, not via re-running checks.
- (full) LLM scan of recent code changes for non-obvious choices (caching strategy, retry policy, schema shape, default values) that lack any documented rationale. High-judgment, lower-confidence findings.

**Required adapters:** `git`, `pipeline_docs` (for decisions doc).
**Optional adapters:** none — the ledger is always available even if other adapters degrade.

**Severity rubric:**
- P0 — Lens D unsanctioned-dependency finding with no corresponding `decision_recorded` event in the ledger.
- P1 — ledger/doc divergence (event without doc, or doc without event when both should exist).
- P2 — decision-keyword commit without matching event/doc.
- P3 — full-profile LLM-only findings; `lens_skipped` when no decisions doc exists *and* the ledger has zero decision events.

### 3.9 Lens H — Cross-doc inconsistency (`H-cross-doc`)

This is the audit's *only* lens that runs throughout the entire pipeline (not just build phase). It activates as soon as the second planning artifact exists.

**Checks (fast — fully deterministic over the doc-graph):**
- **Stories cover PRD features.** Every `Feature` with `priority: must`/`should` has at least one `feature_to_story` edge; reverse: every `Story` references a feature (orphan stories).
- **Plan covers stories.** Every `Story` with `priority: must` has at least one `story_to_plan_task` edge OR an inbound `playbook_task_to_story` edge (playbook covers unplanned-but-tracked work); P0 if missing for `must`, P1 if missing for `should`.
- **Playbook tracks plan.** Once playbook exists, every `PlanTask` has a `plan_task_to_playbook` edge; orphans on either side reported.
- **Coding-standards languages exist in tech-stack.** Each `Rule` with a `language` field must reference a language declared in tech-stack (sanctioned components or explicit language list); rules referencing unsanctioned languages are P1 ("standards reference language not in tech-stack").
- **Design-system covers stories' UI surfaces.** For each `Story` with `kind: "ui"`, at least one design-system token category (color, typography, spacing) must exist in the graph; if no tokens at all, P1.
- **Decisions log internally consistent.** No `decision_supersedes` edge points to a `Decision` that doesn't exist; no `decision_to_file` edge points to a `FileNode` that doesn't exist (uses unresolved-glob annotations from the doc-graph); a `Decision` that's been superseded must not appear as the latest version of its `key`.

**Checks (full — LLM-graded over prose):**
- **Tech-stack supports PRD constraints.** PRD prose contains constraints (perf budgets, platform targets, language policies, offline-availability, etc.) that aren't expressed as structured fields. The LLM reads PRD + tech-stack and flags conflicts ("PRD says 'must work offline' but tech-stack chose PostgreSQL with no offline mode"). Findings are P0 for direct contradictions, P2 for soft tensions.
- **PRD-to-stories semantic coverage.** LLM reads PRD prose and the structured story list; flags features described only in PRD prose that no story addresses. Complements the structural orphan-feature check.
- **Cross-doc terminology drift.** LLM grades whether the same concept is named consistently across PRD/stories/standards/design-system. P2 findings only.

**Required adapters:** `pipeline_docs` (for whichever planning artifacts exist; lens runs on whatever subset is present).

**Severity rubric:**
- P0 — direct contradiction surfaced by full-profile check (PRD says A, tech-stack says ¬A); decision supersedes nonexistent decision; `must`-priority story not covered by plan or playbook.
- P1 — orphan story; `should`-priority story not covered; standards reference language not in tech-stack; story tagged `ui` but no design-system tokens exist.
- P2 — soft inconsistencies (terminology drift, full-profile low-confidence findings).
- P3 — `lens_skipped` when fewer than two planning artifacts exist.

**Pipeline-phase activation.** This lens has *phase-aware subsets* — only the checks whose required artifacts exist run at any given phase boundary:

| After phase boundary | Lens H subset that runs |
|---|---|
| `user-stories` | stories-cover-PRD; orphan-stories |
| `tech-stack` | + tech-stack-supports-PRD |
| `coding-standards` | + standards-consistent-with-tech-stack |
| `design-system` | + design-system-covers-UI-stories |
| `implementation-plan` | + plan-covers-stories |
| `decisions` (any time `decisions.jsonl` is written) | + decisions-internally-consistent |
| `implementation-playbook` | + playbook-tracks-plan |
| Build phase | full lens, including LLM-graded prose conflicts when `--profile=full` |

This is what makes Lens H the audit's earliest-warning system: drift between docs gets caught before build phase even starts.

### 3.10 Lens registry

A central manifest declares profile membership, required/optional adapters, lens-to-lens dependencies, and severity defaults so the engine can introspect them and the dashboard can list them:

```ts
// src/observability/checks/registry.ts
export interface LensManifest {
  id: string;
  name: string;
  profiles: ("fast" | "full")[];
  required: AdapterId[];
  optional: AdapterId[];
  depends_on?: string[];   // lens IDs whose findings this lens reads via the runner's shared buffer
}

export const LENS_REGISTRY: LensManifest[] = [
  { id: "A-tdd",         name: "TDD violations",          profiles: ["fast", "full"],
    required: ["git", "pipeline_docs"], optional: ["tests"] },
  { id: "B-ac-coverage", name: "AC completion",           profiles: ["fast", "full"],
    required: ["pipeline_docs"], optional: ["tests", "gh"] },
  { id: "C-standards",   name: "Coding-standards drift",  profiles: ["fast", "full"],
    required: ["git", "pipeline_docs"], optional: ["tests"] },
  { id: "D-stack",       name: "Tech-stack drift",        profiles: ["fast", "full"],
    required: ["git", "pipeline_docs"], optional: [] },
  { id: "E-design",      name: "Design-system drift",     profiles: ["fast", "full"],
    required: ["git", "pipeline_docs"], optional: [] },
  { id: "F-scope",       name: "Missing scope",           profiles: ["fast", "full"],
    required: ["pipeline_docs"], optional: ["tests", "gh", "state"] },
  { id: "G-decisions",   name: "Undocumented decisions",  profiles: ["fast", "full"],
    required: ["git", "pipeline_docs"], optional: [],
    depends_on: ["D-stack"] },
  { id: "H-cross-doc",   name: "Cross-doc inconsistency", profiles: ["fast", "full"],
    required: ["pipeline_docs"], optional: [] },
];
```

The `checks-runner` (src/observability/engine/checks-runner.ts) topologically orders lenses by `depends_on` before running them. When a lens declares a dependency, it gets read access to that lens's already-emitted findings via the runner's shared findings buffer — but never write access. Cycles in `depends_on` are rejected at startup with a clear error.

### 3.11 Where lenses get configuration

Per-project knobs (rule severity overrides, ad-hoc-token thresholds, lens enable/disable, glob patterns for UI files, custom lint integrations) live in `.scaffold/observability.yaml` under a `lenses:` section:

```yaml
lenses:
  E-design:
    ad_hoc_token_threshold: 5
    ui_glob: "src/components/**/*.{tsx,vue}"
  C-standards:
    enforce_via_linter: true
    rule_overrides:
      no-console: P1
  H-cross-doc:
    skip_phase_subsets: ["design-system"]   # skip a specific phase subset if not relevant
```

Lenses read this config at startup; missing keys fall through to the registry defaults shown in 3.10.

## Section 4 — Renderers

Three renderers consume the engine's `EngineOutput` JSON and produce text/HTML. They share a common library (`src/observability/renderers/_lib.ts`) for severity badges, time formatting, redaction (render-time pass), and section ordering.

### 4.1 Terminal renderer

**Surface:** stdout, ≤ 80 columns by default (`COLUMNS` env-var or `--width=N`), markdown formatting suitable for direct read or piping to `glow`/`bat`.

**Progress snapshot** (`scaffold observe progress` with no flags, default 24-hour window):

```
build observability — progress (since 2026-04-29 14:00 · 24h)

⚠ needs attention (3)
  • PR #41 stale 67h — opened 2026-04-27, no commits, awaiting review
  • task T-031 (alice) claimed 5h — branch alice-feat-auth, no commits since
  • blocker on T-024 (bob) unaddressed 3h — kind=external (vendor outage)

active agents (2)
  alice  · T-031 user-auth: refresh token rotation       branch alice-feat-auth   PR pending
  bob    · T-024 billing: idempotent retry on 429        branch bob-billing       blocked

completed in window (4)
  ✓ T-029 (alice)  pr_submitted #40  src/auth/login.ts +124 -8        2026-04-29 19:14
  ✓ T-028 (charlie) pr_submitted #39  src/queue/worker.ts +48 -12      2026-04-29 17:02
  ✓ T-027 (alice)  pr_submitted #38  src/auth/session.ts +73 -2       2026-04-29 15:48
  ✓ T-026 (bob)    pr_submitted #37  src/billing/cents.ts +21 -4      2026-04-29 14:31

upcoming (next 5, dependency-ordered)
  T-032  user-auth: SSO callback handler              ready  · wave 2
  T-033  user-auth: session expiry tests              ready  · wave 2
  T-034  billing: refund flow                         blocked by T-024
  T-035  observability: emit task_claimed events      ready  · wave 3
  T-036  docs: update auth section                    ready  · wave 3

story coverage (top 3 by activity)
  user-auth-1   plan 4/5 done · ACs 4/4 with tests · 4/4 passing
  billing-2     plan 1/3 done · ACs 1/2 with tests · 1/1 passing
  observability plan 0/3 done · ACs 0/3 with tests · — (no run)

recent decisions (3)
  refresh-token-strategy   chose sliding-window over absolute  affects: src/auth/**
  idempotency-keys         use uuid-v7 for cross-service                affects: src/queue/**
  pii-redaction-defaults   block on regex pack v2 in prod       affects: src/**

availability: git ✓ · gh ✓ · pipeline_docs ✓ · tests ✓ · state ✓ · beads — · mmr ✓ · audit_history ✓
                                                       (— = unavailable, no enrichment from this source)

(rerun with --replay for the full timeline · --json for raw data)
```

**Progress replay** (`scaffold observe progress --replay`): adds a `timeline` section after `recent decisions`, with one event per line:

```
timeline (89 events · 24h window)
  2026-04-29 19:14  ledger  task_completed  T-029 (alice)  → PR #40
  2026-04-29 18:55  git     commit          alice/src/auth/login.ts (sha 4af2e1)
  2026-04-29 18:42  ledger  decision_recorded  refresh-token-strategy (alice)
  2026-04-29 18:11  mmr     job_completed   PR #38 verdict=pass
  2026-04-29 17:48  gh      pr_opened       PR #40 alice-feat-auth
  2026-04-29 17:02  ledger  task_completed  T-028 (charlie) → PR #39
  …

  ("ledger" in the source column refers to events from the activity ledger
   — the agent-driven workflow stream — and is intentionally distinct from
   the "state" adapter in availability, which surfaces .scaffold/state.json
   pipeline-step transitions as a separate replay source.)
```

**Audit findings** (`scaffold observe audit`):

Note on numbers below: `fix_threshold=P2` means severities `{P0, P1, P2}` are *blocking* (severityRank ≤ rank of threshold; "at or above"). P3 is advisory. So with 1 P0 + 2 P1 + 4 P2 + 0 P3, blocking = 7 and advisory = 0. The example uses a project that has set `fix_threshold=P1` (so only P0+P1 = 3 are blocking and the four P2s are advisory) to keep the example illustrative.

```
build observability — audit (profile=fast · scope=all · 24h window)

verdict: blocked  ·  fix_threshold: P1  ·  blocking findings: 3 (of 7 total · 1 acknowledged hidden)

P0 (1)
  [3a8c1f02] [B-ac-coverage] AC user-auth-1.3 has failing test
    docs/user-stories.md#user-auth-1
    src/auth/test/refresh.spec.ts::"rejects expired token"
    fix: investigate test failure; AC may not yet be implemented

P1 (2)
  [9d1e02f4] [A-tdd] new public function without test — src/auth/sso.ts::handleCallback
    docs/tdd-standards.md
    fix: add a test for handleCallback before merging
  [b471c8a9] [E-design] 4 ad-hoc color values in src/components/SsoButton.tsx (threshold: 3)
    docs/design-system.md
    fix: replace #4f46e5, #ef4444, rgba(0,0,0,0.1), #f3f4f6 with tokens

advisory P2 (3)  ·  P3 (0)  ·  skipped lenses: 0
acknowledged: 1  (1 P2 hidden — run with --show-acknowledged to see)

(finding IDs above [in brackets] are the first 8 chars of the stable Finding.id;
 use the full or truncated id with `scaffold observe ack <id>` to acknowledge)

next actions:
  scaffold observe audit --fix     # auto-fix above-threshold findings
  scaffold observe ack <id>        # acknowledge a finding to unblock
```

When `tests` is unavailable: the verdict line shows `verdict: degraded-pass · 1 lens skipped`; specific findings note `evidence: lens_skipped (tests adapter unavailable)`.

### 4.2 Markdown report renderer

**Files written:**
- Progress: `docs/build-status/<YYYY-MM-DD-HHmm>.md` + `<YYYY-MM-DD-HHmm>.json` sidecar
- Audit (multi-lens):  `docs/audits/<YYYY-MM-DD-HHmm>-<profile>-<scope>.md` + `.json` sidecar, where `<profile>` is `fast` or `full` and `<scope>` is `docs`, `code`, or `all` (matching the CLI flags in Section 1).
- Audit (single-lens):  `docs/audits/<YYYY-MM-DD-HHmm>-<profile>-lens-<lens-id>.md` + `.json` sidecar (e.g., `…-fast-lens-B-ac-coverage.json`).

The markdown is the human-readable rendering, intended to live in repo history and be cited from PR descriptions. The JSON sidecar is the durable machine record (read by the `audit-history` adapter and by future audit runs for trend analysis).

**Both** the markdown report and the JSON sidecar are *persisted renderer outputs* and run through the engine's render-time redaction pass before writing. The `audit-history` adapter therefore reads only redacted content; secrets cannot leak via sidecar even if they slipped past the write-time pass.

**Audit markdown report shape:**

```markdown
# Build Observability Audit — 2026-04-30 14:22

**Verdict:** blocked
**Profile:** fast
**Scope:** all
**Fix threshold:** P1
**Window:** 2026-04-29 14:22 – 2026-04-30 14:22 (24h)
**Job:** [`mmr-bdf04e1c`](../mmr/jobs/bdf04e1c.json)
<!-- when this audit was the doc-conformance MMR channel of a PR review -->

## Needs Attention

<!-- Section 4.5 — present only when needs_attention[] is non-empty.
     Same items as the terminal "⚠ needs attention" block, formatted as a table. -->

| Signal | Item | Age |
|---|---|---|
| pr_stale | PR #41 (alice-feat-auth) — opened, no commits, awaiting review | 67h |

## Summary

7 findings · 3 blocking (severities at or above P1, the project's fix_threshold) · 1 acknowledged (1 P2 hidden) · 0 skipped lenses.

| Severity | Total | Visible | Acknowledged |
|---|---|---|---|
| P0 | 1 | 1 | 0 |
| P1 | 2 | 2 | 0 |
| P2 | 4 | 3 | 1 |
| P3 | 0 | 0 | 0 |

## Findings

### [P0] B-ac-coverage — AC user-auth-1.3 has failing test

…

(one section per finding, with full evidence and fix-hint)

## Availability

| Adapter | Status | Reason / Notes |
|---|---|---|
| git | ✓ available | |
| gh | ✓ available | |
| pipeline_docs | ✓ available | |
| tests | ✓ available | last run 2026-04-30 13:58 |
| state | ✓ available | |
| beads | — unavailable | `.beads/` not present (project chose markdown-only tracking) |
| mmr | ✓ available | most-recent job 4 hours ago |
| audit_history | ✓ available | 12 prior reports |

## Acknowledged

| Finding | Acknowledged at | By | Note |
|---|---|---|---|
| `8a3b…f201` E-design — 1 ad-hoc color in src/components/Banner.tsx | 2026-04-28 09:14 | alice | Approved exception for legacy red until design refresh in wave 5 |
```

**JSON sidecar shape** (machine-readable; `audit-history` adapter reads only this). The sidecar is exactly the `EngineOutput` shape (Section 2.5) plus a small wrapper:

```json
{
  "report_id": "audit-2026-04-30-1422-fast-all",
  "engine_output": { /* full EngineOutput JSON, redacted */ }
}
```

`report_id` is the same string used in the filename (without extension). The sidecar is single-versioned via `engine_output.schema_version` (Section 2.5) — there is no separate envelope version. Future schema bumps (e.g., `"2.0"`) increment that field. Consumers should pin to a major version and tolerate added fields. Older sidecars (`schema_version: "1.0"`) stay readable by newer engines.

### 4.3 Dashboard panel renderer

**Surface:** HTML fragments injected into `.scaffold/dashboard.html` at named anchor comments by `scripts/generate-dashboard.sh`.

```html
<!-- existing dashboard sections (pipeline progress, beads tasks, etc.) -->

<!-- observe:progress -->
<section id="build-progress" class="panel">
  <header>
    <h2>Build Progress</h2>
    <!-- availability_summary is renderer-internal: a one-line "git ✓ · gh ✓ · …" string
         the dashboard renderer derives from EngineOutput.availability before rendering. -->
    <span class="meta">last 24h · {{availability_summary}}</span>
  </header>
  {{#if needs_attention}}
  <aside class="needs-attention" role="alert">
    <h3>⚠ Needs Attention ({{needs_attention.length}})</h3>
    <ul>{{#each needs_attention}}<li>{{summary}} ({{age_hours}}h)</li>{{/each}}</ul>
  </aside>
  {{/if}}
  <div class="grid grid-2">
    <div class="card"><h3>Active Agents</h3>{{> active-agents}}</div>
    <div class="card"><h3>Completed (24h)</h3>{{> completed-in-window}}</div>
    <div class="card"><h3>Upcoming</h3>{{> upcoming}}</div>
    <div class="card"><h3>Recent Decisions</h3>{{> recent-decisions}}</div>
  </div>
  <details><summary>Story coverage</summary>{{> story-coverage}}</details>
  <details><summary>Timeline (replay)</summary>{{> replay}}</details>
</section>
<!-- /observe:progress -->

<!-- observe:audit -->
<section id="build-audit" class="panel" data-verdict="{{verdict}}">
  <header>
    <h2>Audit</h2>
    <span class="badge severity-{{verdict}}">{{verdict}}</span>
    <span class="meta">{{summary.blocking}} blocking · threshold {{fix_threshold}}</span>
  </header>
  <div class="finding-filters">
    <button data-filter="all">All ({{summary.total}})</button>
    <button data-filter="blocking">Blocking ({{summary.blocking}})</button>
    <button data-filter="P0">P0 ({{summary.by_severity.P0}})</button>
    <button data-filter="P1">P1 ({{summary.by_severity.P1}})</button>
    <button data-filter="P2">P2 ({{summary.by_severity.P2}})</button>
    <button data-filter="P3">P3 ({{summary.by_severity.P3}})</button>
  </div>
  {{#if findings.length}}
  <ol class="findings">
    {{#each findings}}
    <li class="finding severity-{{severity}}" data-status="{{status}}">
      <header>
        <span class="badge">{{severity}}</span>
        <code class="finding-id" title="run scaffold observe ack {{id_short}} to acknowledge">{{id_short}}</code>
        <span class="lens">[{{lens_id}}]</span>
        <span class="title">{{title}}</span>
      </header>
      <p>{{description}}</p>
      <!-- id_short, evidence_json, fix_hint_json are renderer-internal:
           id_short = finding.id.slice(0, 8); evidence_json = JSON.stringify(finding.evidence);
           fix_hint_json = JSON.stringify(finding.fix_hint); each HTML-escaped. -->
      <details><summary>Evidence</summary><pre>{{evidence_json}}</pre></details>
      {{#if fix_hint}}<details><summary>Fix hint</summary><pre>{{fix_hint_json}}</pre></details>{{/if}}
    </li>
    {{/each}}
  </ol>
  {{else}}
  <p class="empty">No findings. <span class="meta">verdict: {{verdict}}</span></p>
  {{/if}}
</section>
<!-- /observe:audit -->
```

**Theme tokens.** Severity badges use `--sev-p0|p1|p2|p3` from `lib/dashboard-theme.css` (extended for this design — these tokens are added to the theme file). Light/dark variants follow the existing convention.

**Verdict-to-severity mapping** (used wherever a verdict needs a colored badge, e.g., the `data-verdict` attribute and the optional `severity-{verdict}` class on the audit panel):
- `blocked` → `--sev-p0` (red — same as P0 findings)
- `degraded-pass` → `--sev-p2` (yellow — same as P2 findings)
- `pass` → a neutral success token `--sev-pass` (green; new token, added alongside `--sev-p*`)

This mapping is implemented in `renderers/_lib.ts::verdictToSeverityToken()` and used uniformly by terminal (color codes), markdown (badge text), and dashboard (CSS class).

**Interaction.** Inline JS already used by the dashboard's Beads modal is reused for the finding-filter buttons. Filtering is client-side, no fetch.

### 4.4 Common rendering rules

- **Redaction.** All persisted renderers (markdown report, dashboard) run the engine's render-time redaction pass before writing. Terminal renderer applies secret-detection only (paths preserved for navigation; see Section 1's Redaction policy).
- **Severity badges.** All renderers map severity → display badge: P0 → red ●, P1 → orange ●, P2 → yellow ●, P3 → blue ◯. Color-blind-safe icons backstop color.
- **Empty states.** Each section/panel has a documented empty-state ("no upcoming tasks", "no audit findings", "no decisions in window"). Renderers do not show an empty `<ul>` or a bare heading.
- **Time formatting.** All times shown to users are local-timezone (read from `process.env.TZ` or system default), with UTC ISO retained in JSON outputs.
- **Truncation.** Long fields (decision summaries, finding descriptions) are truncated to ≤ 200 chars in default views with a `details/summary` (markdown/dashboard) or `…` (terminal) for full text.

### 4.5 The "Needs Attention" surface

Stall-detection output is rendered identically in spirit across surfaces but adapts to surface affordances:

- **Terminal**: `⚠ needs attention (N)` block at the top of `progress` and `audit` output. Lists items with age and summary.
- **Markdown report**: a `## Needs Attention` section near the top with a table of items.
- **Dashboard**: `<aside class="needs-attention" role="alert">` with the items as a list. The aside is colored with `--sev-p1` to draw the eye.

When `needs_attention[]` is empty, the surface is omitted entirely (no "no items needing attention" — silence is the signal).

### 4.6 The `--json` output

Both `progress` and `audit` accept `--json`, emitting the full `EngineOutput` shape to stdout (no wrapper — just the engine output object including its `schema_version` field). This is the canonical interchange format for any downstream consumer (e.g., a script that posts the audit verdict to Slack, or a custom dashboard). Renderers other than `--json` are derivations of this shape; nothing visible in the JSON is computed by a renderer (verdict and `summary` are engine-computed per 2.5).

**Redaction.** `--json` is a machine-readable format used by local automation, IDE integrations, and internal tools that often require unmasked paths to navigate. By default, `--json` therefore applies *secret-detection only* (same as the terminal renderer); paths and usernames pass through unmodified. Persisted artifacts (markdown reports under `docs/build-status/` and `docs/audits/`, JSON sidecars next to them, dashboard HTML) are unaffected — they always run the full persisted-output redaction including path/username masking.

If a caller pipes `--json` to a destination that becomes shared (CI logs, committed file, posted to a service), they can opt into the stricter pass with `--mask-paths`. The flag exists at the engine level so it applies uniformly to whichever subcommand is invoked. Defaulting to safer paths-masked would be wrong here: it would silently break tooling that depends on path-aware navigation, and the audit's *durable* outputs (markdown + sidecars) are already always-masked.

Schema versioning: `schema_version: "1.0"` is present in the engine output from v1. Future breaking changes bump the version (e.g., `"2.0"`); non-breaking additions don't. Consumers should pin to a major version and tolerate added fields.

## Section 5 — Operational Integration

How the engine attaches to the rest of scaffold: CLI shape, phase-boundary triggers, MMR channel, `--fix` flow, hooks, and worktree lifecycle.

### 5.1 CLI surface — full flags, exit codes, help

```
scaffold observe progress [options]
  --since=<ref|time|"last-check">    time window for snapshot/replay; default "last 24h"
                                      ref: git commit/branch; time: ISO 8601 or "24h"/"3d";
                                      "last-check": stamp from last invocation in same repo
  --replay                            include replay timeline (default off)
  --json                              emit raw EngineOutput; secret-detection only by default
  --mask-paths                        with --json: also mask absolute paths and usernames
  --no-stall-check                    suppress "needs attention" section
  --width=<n>                         terminal width override (default $COLUMNS or 80)
  --output=<path>                     write markdown report to <path> instead of docs/build-status/

scaffold observe audit [options]
  --profile=fast|full                 default fast for PR gate, full for phase boundary / on-demand
  --scope=docs|code|all               default all; docs runs only Lens H, code runs A-G
  --lens=<id>[,<id>…]                 run only specified lenses (overrides --scope)
  --include-snapshot                  also produce a Snapshot in EngineOutput
  --replay                            include replay timeline
  --fix                               dispatch agent to fix above-threshold findings
  --report-only                       force advisory output even at PR gate
  --fix-threshold=P0|P1|P2|P3         override resolved fix-threshold (Section 2.4)
  --since=<ref|time|"last-check">     time window
  --json                              emit raw EngineOutput; secret-detection only by default
  --mask-paths                        with --json: also mask absolute paths and usernames
  --output=<path>                     write markdown report to <path> instead of docs/audits/
  --show-acknowledged                 include acknowledged findings in default views

scaffold observe event <type> [--key=value …]
  ledger-write entry point. Validates payload against allowlisted schema for <type>.
  Exits non-zero with a specific error code on schema violations.

scaffold observe ack <finding-id> [options]
  --status=acknowledged|open          default acknowledged; "open" revokes prior ack
  --note=<text>                       ≤ 200 chars; included in ack ledger event
  Accepts full id or any prefix ≥ 8 chars matching a single finding from the most-recent audit
  sidecar in docs/audits/. Errors if prefix is ambiguous.

scaffold observe harvest [options]
  --worktree=<path>                   harvest a specific worktree's ledger before teardown
  --recover                           scan stale active/* archives and re-flush

scaffold observe gc [options]
  --max-age-days=<n>                  rotate archives older than n days (default 90)
  --max-size-mib=<n>                  trigger threshold for ad-hoc rotation (default 50)
```

**Exit codes** (uniform across subcommands; consumers can switch on these):
- `0` — success; for `audit`, equivalent to verdict `pass` or `degraded-pass`.
- `1` — `audit` only: verdict `blocked`.
- `2` — usage error (bad flags, unknown lens, ambiguous finding-id prefix).
- `3` — engine error (corrupted ledger, write-time payload schema violation, ack-without-prior-audit).
- `64–78` — reserved for adapter-specific failures, mirroring `sysexits.h` for shell-friendly handling.

**Help text** is generated from a single `commands/observe.commands.ts` definition file; the `scaffold observe --help` and per-subcommand `--help` outputs include the flag reference above plus the verdict-derivation summary, redaction note, and a link to the spec.

**Backward compatibility note** — `scaffold observe` is a new top-level command. It does not displace any existing CLI surface; the existing `scaffold next`, `scaffold status`, `scaffold run …`, and `scaffold dashboard` commands continue to work unchanged.

### 5.2 Phase-boundary triggers

The audit's cross-doc lens (H) runs automatically at the end of each pipeline phase that produces a planning artifact. Two scaffold code paths today complete a step: the centralized `StateManager.markCompleted(step, outputs, completedBy, depth)` method, and the `scaffold complete` command (`src/cli/commands/complete.ts`), which currently mutates state and calls `stateManager.saveState(state)` *without* going through `markCompleted`.

**Required refactor (part of this design's implementation work):** centralize all completion transitions through `StateManager.markCompleted`. `src/cli/commands/complete.ts` is updated to call `markCompleted` instead of mutating state directly. Once centralized, the phase-audit hook is added to `markCompleted` itself — every completion path triggers the audit with no special-casing.

**Hook point:** `StateManager.markCompleted(step, outputs, completedBy, depth)` — after the state mutation persists, calls `await runPhaseAudit(step)` (added to the same module or imported as a peer; `markCompleted` becomes async). Errors from `runPhaseAudit` are caught and logged as `[audit] error: <message>` so a failing audit never breaks step completion.

**`runPhaseAudit(step)`** consults the slug-to-phase-subset map (from Section 3.9):
- User-stories → Lens H subset: stories-cover-PRD, orphan-stories.
- Tech-stack → adds tech-stack-supports-PRD (full-profile only).
- …etc per the table in 3.9.

It then invokes the audit engine **via a TypeScript API** (`runAudit({ profile: "fast", lens: ["H-cross-doc"], scope: "docs", outputMarkdownPath: "docs/audits/<auto>.md" })` exported from `src/observability/engine/api.ts`), not by shelling out to the `scaffold` binary. Calling the binary from inside `StateManager` would create runtime circularity (CLI → StateManager → CLI) and brittle PATH/installation dependencies; calling the engine library directly avoids both. The CLI command (`scaffold observe audit`) is itself a thin wrapper around the same `runAudit` API. Subset selection within Lens H is driven by the slug; the lens's check-runner skips checks whose required artifacts don't exist.

**Execution semantics — "non-gating, time-capped":**
- The state transition (writing `state.json` to disk) is *complete* before `runPhaseAudit` is invoked. The audit cannot fail-the-step; that's what "non-blocking" means here.
- The audit subprocess runs in the foreground with a configurable wall-clock cap (default 60s; `.scaffold/observability.yaml` `phase_audit.timeout_s`). When the cap fires, the subprocess is killed and a `[audit] timed out at 60s — partial findings written` message is logged. The CLI command that called `markCompleted` does block on the audit for up to that window before returning to the user; this is intentional so the user sees the audit's findings in the same terminal output that confirmed step completion, rather than getting back to the prompt and missing them.
- Projects that want non-blocking-on-the-CLI behavior set `phase_audit.detached: true`, which causes `runPhaseAudit` to fork-and-detach (the audit still runs; the CLI just doesn't wait). Default is `false` for visibility.

**Surfacing:** The audit prints a compact `[audit] N findings — see docs/audits/<file>.md` line at the end of `markCompleted`'s output.

**Opt-out:** `phase_audit.enabled: false` in `.scaffold/observability.yaml`. Intended for early prototyping only.

**Single audit code path:** there is one audit *implementation* — the `runAudit()` TypeScript API in `src/observability/engine/api.ts` — and several thin wrappers around it: `scaffold observe audit` (CLI), the MMR `doc-conformance` channel (which goes through the CLI because it lives in MMR's process), `runPhaseAudit` (which calls `runAudit()` directly from `StateManager`), and any future entry point. All wrappers normalize their inputs and delegate to the same library function, so changes to audit semantics happen in one place.

### 5.3 MMR channel — `doc-conformance`

The audit's PR-gate role is delivered as a 5th built-in MMR channel using MMR's existing **command-based channel architecture**.

**MMR's actual model** (from `packages/mmr/src/config/defaults.ts`): channels are `ChannelConfigParsed` entries in the `BUILTIN_CHANNELS` map. Each entry declares a `command:` string (e.g., `claude -p`, `codex exec`, `gemini`), an auth `check`/`recovery` pair, and an `output_parser:` (`'default'` | `'gemini'` | …). MMR's dispatcher spawns the channel's command via `child_process`, pipes the prompt to stdin, and parses stdout into MMR's internal `Finding[]` shape via the named parser. There is no `MmrChannel.run` interface today.

**Adding the doc-conformance channel:**
- Add a new `BUILTIN_CHANNELS["doc-conformance"]` entry with:
  - `command: 'scaffold observe audit --profile=fast --scope=all --json --output-mode=mmr-findings'`
  - `auth.check: 'scaffold version >/dev/null 2>&1'` (no external auth)
  - `auth.recovery: 'npm install -g @zigrivers/scaffold'`
  - `output_parser: 'doc-conformance'` (a new parser added to `packages/mmr/src/parsers/`)
- The new `--output-mode=mmr-findings` flag on `scaffold observe audit` emits the engine's `Finding[]` directly in MMR's `Finding` shape (location, severity, description, suggestion) as a JSON array on stdout. This avoids inventing a packaged channel interface and reuses MMR's existing dispatcher.
- **Parser registration:** the `doc-conformance` parser is added to MMR's in-process parser registry at `packages/mmr/src/core/parser.ts` (where `getParser(name)` resolves names to parser functions today). Without explicit registration there, `getParser('doc-conformance')` would silently fall back to the `default` parser, which expects free-form text and would emit zero findings — silently passing the PR gate. The parser receives the *captured stdout string* from MMR's dispatcher (not stdin); it `JSON.parse()`s the array and maps each entry to MMR's `ParsedOutput.findings`. Tests must cover both the registration path (`getParser('doc-conformance')` returns the new function, not the default) and the parse path (a JSON-array input produces the expected findings).

**Mapping engine `Finding` → MMR `Finding`:**
- **`location`** receives a *stable composite anchor* derived from the engine's stable id semantics: `<source_doc>::<lens_id>::<short_id>` (e.g., `docs/user-stories.md#user-auth-1::B-ac-coverage::3a8c1f02`). MMR's reconciler groups by `normalizeLocation(location)`, so this composite preserves identity across re-runs (the engine's `id` is part of the location string) while staying unique per finding. **This requires no changes to MMR's reconciler.**
- **`severity`** → severity (1:1; both use P0–P3).
- **`description`** ← `lens_id` + `title` (channel-prefixed: `[doc-conformance/<lens_id>] <title>`).
- **`suggestion`** ← `fix_hint.prompt || fix_hint.target`, rendered to text. Empty string when `fix_hint` is absent.

**Reconciliation:** MMR groups findings across channels by `normalizeLocation(location)`. Our location strings are deliberately unique per stable id, so the reconciler treats each as a distinct finding (no spurious cross-channel collapse). When the *same* doc-conformance finding appears in two MMR runs (e.g., before and after a fix attempt), the location string is identical, so MMR's reconciler treats them as the same finding and counts only once.

**Registration paths:**
- Built-in to MMR via the `BUILTIN_CHANNELS` map. Once MMR ships a version that includes this entry, every project picks it up automatically when MMR loads its config.
- Distribution: scaffold's release process bundles the MMR version that has `doc-conformance` in `BUILTIN_CHANNELS`. Existing projects pick it up when they `npm update -g @zigrivers/scaffold` (and the MMR major version is compatible).
- **No `scaffold update` config-file mutation.** The earlier draft incorrectly claimed `scaffold update` would add the channel to `~/.mmr/config.yaml`. It doesn't, and shouldn't — built-in channels live in MMR's source, not in user/project config files. User config files only opt OUT (via `channels_disabled` if they set it).

**Opt-out:** users who don't want doc-conformance gating set `channels_disabled: ["doc-conformance"]` in `~/.mmr/config.yaml` or `.mmr.yaml`.

### 5.4 The `--fix` flow

When `scaffold observe audit --fix` is invoked, the engine produces findings and then dispatches an agent to fix above-threshold ones. This mirrors MMR's existing `--fix` mode but operates on the audit's domain (doc/code conformance) rather than MMR's (code review).

**Phases:**
1. **Audit** — produce the EngineOutput as usual.
2. **Plan** — the engine constructs a fix plan: list of blocking findings, defined as `severityRank(severity) <= severityRank(fix_threshold) && status === "open"` (i.e., `summary.blocking`). Acknowledged and skipped findings are excluded. Plan order: severity rank ascending (P0 first), then `lens_id` lex order within a severity. Each finding's `fix_hint` (when present) becomes the prompt seed.
3. **Dispatch** — for each finding in plan order, the engine spawns the configured fix dispatcher subprocess with the finding's evidence and fix_hint inlined. The dispatcher command is configurable in `.scaffold/observability.yaml` `fix.dispatcher_command` (default `"claude -p"`); other reasonable values include `"codex exec --skip-git-repo-check -s ask --ephemeral"` or any agent CLI that accepts a prompt on stdin and exits when done. Following MMR's channel model, the value is a shell command string; the engine appends the prompt via stdin. The agent gets a deterministic working-directory and a short instruction set: "Fix this specific finding only. Do not do unrelated work. Stage the change. Exit when done."
4. **Verify** — after each fix attempt, re-run the relevant lens (a single-lens audit). If the finding ID no longer appears in `findings[]`, the fix is accepted and the engine moves on. If it still appears, retry up to 2 more times (3 total per finding, matching MMR's per-finding limit). After 3 failures, emit a `fix_failed` notice in the engine output and continue to the next finding.
5. **Final report** — a fresh audit run produces the post-fix report, written as an additional markdown report + sidecar (filename `…-postfix.md`).

**Index-and-worktree safety on abort.** The `--fix` flow needs a clean rollback semantics for Ctrl-C. The engine implements this with two pre-flight steps and one cleanup step:
- **Before any fix dispatches:** capture (a) the current `git stash create` (without applying or storing in stash list — just a snapshot ref), and (b) the list of files currently staged via `git diff --cached --name-only`.
- **During each fix:** the agent stages its changes with `git add <paths>`. The engine records each *newly* staged path (not already in pre-flight staged list) in an in-memory ledger.
- **On Ctrl-C / abort:**
  1. For each path the engine staged during this run: `git restore --staged --worktree <path>` to revert both index and working tree to the pre-fix state.
  2. Restore the pre-flight stash snapshot if it differs from current state (covers any working-tree changes the engine staged but the agent also modified mid-run).
  3. Files that were staged *before* `--fix` started are left as the user had them.
- **On successful exit:** the engine simply exits; user reviews staged changes and commits in their normal flow.

This is documented but cannot be silently relied on; the user is informed at start-of-fix-flow: "On Ctrl-C, the engine will restore the index and working tree to the state before --fix started. Do not edit files in this terminal during the fix flow."

**No auto-commit.** The `--fix` flow stages changes but never commits. Rationale: doc-vs-code drift fixes can be subtle (e.g., a coding-standards "rule" interpretation may be wrong), and human review is essential before commits land.

**Foreground only.** `--fix` runs synchronously; never spawns background agents. Long fix chains are user-visible at every step.

### 5.5 PostToolUse hook — informational only

The existing PostToolUse hook on `gh pr create` (configured in `.claude/settings.json`) already reminds agents to run `scaffold run review-pr`. The doc-conformance channel ships as a built-in MMR channel (see 5.3), so it runs automatically inside `scaffold run review-pr` alongside Codex, Gemini, Claude, and the Superpowers code-reviewer.

**No new hook.** We do *not* extend the PostToolUse hook to invoke `scaffold observe audit` separately. Doing so would cause double-runs (the hook would dispatch the audit, and `scaffold run review-pr` would dispatch it again via MMR's channel orchestration).

**Hook message extension:** the hook's existing reminder text gains one line:
> The doc-conformance audit runs automatically as a channel of `scaffold run review-pr`. To run audit standalone (e.g., for a deeper full-profile pass before the PR exists), use `scaffold observe audit --profile=full`.

**Section 1 alignment:** Section 1's integration-points bullet — "PostToolUse hook on `gh pr create` already exists; we extend it so it also kicks off `scaffold observe audit --profile=fast` against the PR diff (or, equivalently, runs the doc-conformance MMR channel — same effect via a different surface)" — is resolved by this section: we pick the channel-via-MMR path, not a separate hook trigger. The "(or, equivalently, …)" was the choice; we made it.

### 5.6 Worktree lifecycle integration

Per Section 1's multi-worktree concurrency model, the central archive needs to be flushed before a worktree is removed. **Today's `scripts/setup-agent-worktree.sh` only creates the worktree and branch; it does not write `.scaffold/identity.json`.** This design adds that step.

- **Setup additions to `scripts/setup-agent-worktree.sh` (new code, not existing):**
  - After `git worktree add`, write `.scaffold/identity.json` to the new worktree:
    ```bash
    mkdir -p "$worktree_dir/.scaffold"
    if [ ! -f "$worktree_dir/.scaffold/identity.json" ]; then
      uuid="$(uuidgen | tr 'A-Z' 'a-z')"
      printf '{"worktree_id":"%s","worktree_label":"%s","created_at":"%s"}\n' \
        "$uuid" "$agent_suffix" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        > "$worktree_dir/.scaffold/identity.json"
    fi
    ```
  - Existing identity files are preserved if the script is re-run on the same path (the `if [ ! -f ... ]` guard).
- **Teardown — new `scripts/teardown-agent-worktree.sh`:** today there is no teardown script; users invoke `git worktree remove` directly. This design adds the partner teardown script:
  ```bash
  worktree_dir="$1"
  # Read the actual branch from the worktree (do not guess from the suffix convention).
  branch_name="$(git -C "$worktree_dir" branch --show-current 2>/dev/null || true)"

  scaffold observe harvest --worktree="$worktree_dir"
  git worktree remove "$worktree_dir"

  # Optional branch cleanup, only if we can resolve the branch and it is not the
  # primary repo's checked-out branch (deleting the latter would fail anyway).
  if [ -n "$branch_name" ] && \
     [ "$branch_name" != "$(git -C "$REPO_DIR" branch --show-current)" ]; then
    git -C "$REPO_DIR" branch -D "$branch_name"
  fi
  ```
  Reading the branch from the worktree directly (`git branch --show-current` inside it) avoids hardcoding the `<agent>-workspace` naming convention — that convention may evolve, and worktrees created by other tooling may not follow it.
- **Crash recovery:** if a worktree directory is deleted without harvest (manual `rm -rf` or `git worktree remove` skipping the wrapper), the central archive's `active/<worktree-id>.jsonl` for that UUID still has the most recent flush. Run `scaffold observe harvest --recover` to scan for stale `active/*` files and re-flush remaining events from any still-existing worktrees.
- **Dashboard awareness:** the dashboard's "Active agents" panel reads `git worktree list --porcelain` for currently-attached worktrees and the central archive's `active/*.jsonl` for any stale entries; stale entries are highlighted with a "this worktree no longer exists; run `scaffold observe harvest --recover`" affordance.

## Section 6 — Testing Strategy

Testing follows scaffold's existing convention: TypeScript unit/integration tests via **vitest** (configured at the repo root), shell/CLI end-to-end tests via **bats-core** (`tests/*.bats`), and the project-wide `make check-all` gate that runs both. This section pins what each layer must cover so the implementation plan can sequence the work.

### 6.1 Unit tests (vitest)

**Engine internals** — `src/observability/engine/` (excluding adapters):

- `event-schemas.spec.ts` + `ledger-writer.spec.ts` (cross-event invariants live in the writer, since they need ledger context) — every event type's allowlist enforced (extra fields dropped, missing required fields rejected). Each event type's payload validation has at least one valid case and one invalid case per failure mode. **Writer-enforced cross-event invariants** (Section 2.2) are explicitly covered:
  - `task_claimed` with `task_id: null` is rejected unless `payload.unplanned === true`.
  - `task_completed` with a `task_id` is rejected if no prior `task_claimed` event from the same `actor_label`/`worktree_id` references that `task_id`.
  - `finding_acknowledged` is rejected if `task_id !== null`.
  - `task_completed` with `outcome: "pr_submitted"` requires `pr_number` to be present.
  - The 4 KiB size limit is enforced at the writer, not the schema layer; both layers tested.
- `redact.spec.ts` — secret-detector regex pack tested against an external fixture file `tests/fixtures/observability/secret-corpus.txt` containing labeled positive examples (must redact) and negative examples (must not). Path-rewriting tested for `/Users/<n>`, `/home/<n>`, repo-relative, and Windows path forms. Top-level + payload field coverage. Render-time vs write-time mode behaviors.
- `ledger-writer.spec.ts` — append atomicity under concurrent writes (spawn N child processes in parallel, each writing M events; assert N×M lines, no truncation, no interleaving). Lockfile stale-recovery (kill a writer mid-acquire, ensure next writer can proceed within stale-lock window). 4 KiB rejection path. Identity-file creation and reuse.
- `synthesizer.spec.ts` — adapter availability matrix (8 adapters × {available, degraded, unavailable}); for each combination, assert the resulting `EngineOutput.availability` map and that no missing-adapter case throws. Cross-source dedup using `correlation_id`. Sort-key tie-breaks at same-millisecond timestamps.
- `doc-graph.spec.ts` — graph build from synthetic doc fixtures (`tests/fixtures/observability/projects/<scenario>/`); assert expected node and edge counts, provenance per node, glob expansion for `decision_to_file` *including the zero-match path* (assertion: a `decision_unresolved_glob` provenance annotation is recorded and *no* invalid `decision_to_file` edge is created), missing-artifact tolerance, role-map application, and `.scaffold/observability.yaml` role-map override.
- `checks-runner.spec.ts` — topological ordering with `depends_on`, cycle rejection, shared findings buffer access, lens skip behavior when required adapters are unavailable.
- `findings-aggregator.spec.ts` — stable id derivation (no line-number leak across mutations), status computation from `finding_acknowledged` event ordering, `summary` totals/by-severity-status math.
- `stall.spec.ts` — each stall signal at and below threshold, heartbeat reset behavior, `state.json` fallback when the wave/phase budget data is missing.
- `verdict.spec.ts` — verdict derivation across all combinations of (open blocking findings, lens_skipped findings, no findings), confirming `pass`/`degraded-pass`/`blocked` per Section 2.5 rules.

**Lens checks** — `src/observability/checks/`:

- One spec per lens file (e.g., `lens-a-tdd.spec.ts`). Each spec uses the synthetic doc-graph and ledger fixtures from `tests/fixtures/observability/projects/<scenario>/` covering at minimum:
  - (a) clean state — no findings.
  - (b) one violation per severity tier the lens emits.
  - (c) `lens_skipped` when each *required* adapter is unavailable.
  - (d) per-sub-check behavior when an *optional* adapter is unavailable: explicitly cover Lens B's `tests`-driven downgrade (failing-test-P0 suppressed; structural P1 preserved) and `gh`-driven task-coverage skip; Lens F's `state`-driven untouched-story P2 skip; Lens A's `tests`-richness escalation; Lens E's threshold-config behavior; Lens C's linter-integration tag.
  - (e) cross-lens correlation: Lens G reading Lens D's findings produces P0 when D has emitted an unsanctioned-dep finding for the same file, P1 otherwise.
  - (f) **Lens H phase-aware subsets** — explicit cases for each row of the Section 3.9 phase-activation table (after `user-stories`, after `tech-stack`, … through build-phase full lens). Each subset's enabled checks are asserted; checks gated by missing artifacts are asserted skipped (not merely silent).

**Renderers** — `src/observability/renderers/`:

- `terminal.spec.ts` — snapshot tests of stdout for representative `EngineOutput` fixtures: progress (clean/with-stall/multi-agent), audit (zero/some/many findings, blocked/pass/degraded-pass verdicts).
- `markdown.spec.ts` — snapshot tests of the generated markdown report and the JSON sidecar for the same fixtures.
- `dashboard.spec.ts` — snapshot tests of the HTML fragment outputs.
- All snapshot tests run through the render-time redaction pass; fixtures intentionally include username-shaped paths and secret-shaped strings to verify nothing leaks to snapshots.

### 6.2 Integration tests (vitest, with fixture projects)

`tests/integration/observability/` runs end-to-end through the engine (no mocks) but inside isolated tmpdirs, against fully-populated fixture projects:

- **`progress.test.ts`** — single-agent and multi-agent fixture projects; spawns several `scaffold observe event` calls in sequence (and in parallel, for the multi-agent case), then runs `scaffold observe progress --json` and asserts the resulting `EngineOutput` matches expected snapshot/replay shape.
- **`audit-fast-clean.test.ts`** — fixture project with consistent docs and code; assert verdict `pass`, zero findings.
- **`audit-fast-drift.test.ts`** — fixture project with intentional drift in each lens family; assert each lens emits its expected findings (count + severity + lens_id), that `summary` is consistent with `findings`, that the verdict is `blocked`, and that fix_threshold gating math is correct.
- **`audit-full-llm-mock.test.ts`** — full-profile audit with the LLM dispatcher stubbed out (returns fixed JSON). Confirms the LLM-graded checks integrate correctly without making real network calls.
- **`harvest-recover.test.ts`** — create two worktrees, write events in both, delete one without harvest, run `harvest --recover`, assert the central archive captured the surviving worktree's events and the deleted worktree's `active/<id>.jsonl` was rotated to the archive.
- **`phase-boundary.test.ts`** — programmatically call `StateManager.markCompleted("user-stories", …)` on a fixture project; assert that `runAudit()` was invoked with the expected lens subset and that the markdown audit file was written.

Fixture projects live at `tests/fixtures/observability/projects/`:
- `clean-monorepo/` — three services, full PRD/stories/coding-standards/tdd-standards/tech-stack/architecture/design-system/decisions/implementation-plan/implementation-playbook plus tests with results, no drift, no missing artifacts. Designed so every enabled lens runs without a `lens_skipped` evidence (i.e., audit verdict is `pass`, not `degraded-pass`). Used by `audit-fast-clean.test.ts`.
- `drift-each-lens/` — same artifact set as `clean-monorepo` but with one intentional drift per lens, designed to trip exactly one finding per lens at known severities.
- `partial-pipeline/` — only PRD + user-stories exist (planning phase scenario for Lens H subsets). Audits here intentionally produce `degraded-pass` verdicts due to lens skips; the test asserts the *expected* skipped-lens set, not zero findings.
- `multi-worktree-active/` — two worktrees, in-flight task on each, used for harvest tests.
- `degraded-no-tests/` — clean docs but `tests` adapter missing; verifies Lens B optional-adapter downgrade.
- `degraded-no-gh/` — clean docs and tests but `gh` is not authenticated; verifies Lens B's task-coverage sub-check skip and Lens F's `gh`-informed checks.

### 6.3 End-to-end tests (bats-core)

`tests/observability.bats` — exercises the actual CLI binary in isolated tmpdirs:

- Each subcommand (`progress`, `audit`, `event`, `ack`, `harvest`, `gc`) at least once with a representative fixture project. Checks exit codes match Section 5.1 (`0`/`1`/`2`/`3`/`64–78`), and key strings appear in stdout (verdict, finding count, expected sections).
- `--json` mode: parse stdout JSON and validate against the schema (`schema_version: "1.0"`, expected fields present).
- `ack` flow: run audit → pick a finding id from the JSON → call `ack` with the 8-char prefix → re-run audit → assert finding's `status: acknowledged`, `summary.blocking` decreased by 1, and the finding no longer appears in the default-rendered terminal output (but appears with `--show-acknowledged`).
- `--fix` flow: run audit on a `drift-each-lens` fixture with the dispatcher set to a deterministic scripted-fix command (a tiny shell script that performs a known edit and exits); assert the post-fix audit shows fewer findings, that the working tree has staged changes, and that aborting mid-flow restores the pre-fix state.
- Phase-boundary trigger: run a no-op pipeline-step completion that calls `markCompleted`; assert a markdown audit file is created at the expected path.

### 6.4 MMR-channel tests

All MMR-channel tests must be **hermetic** — no live network, no real PR fetch, no real Codex/Gemini/Claude/Superpowers commands. The test harness:
- A pre-baked fixture PR diff at `tests/fixtures/observability/mmr/pr-diff.patch` plus a stub `gh` command on `$PATH` (a tiny shell script) that returns canned `gh pr view` JSON for the fixture PR number.
- A `tests/fixtures/observability/mmr/test-config.yaml` MMR config that overrides `BUILTIN_CHANNELS` for the test: each external channel (`codex`, `gemini`, `claude`, `superpowers`) is replaced with a deterministic shell script that emits a fixed findings payload via the channel's expected stdout format. The `doc-conformance` channel is the *real* one (the binary under test); only the other channels are stubbed.
- All `mmr review` invocations in the test pass `--config=tests/fixtures/observability/mmr/test-config.yaml` so they pick up the stubs.

Tests:
- **`packages/mmr/tests/parser-doc-conformance.spec.ts`** (vitest, no shell) — `getParser('doc-conformance')` does not return the default fallback. The parser parses a JSON-array payload into `ParsedOutput.findings`. Round-trip a representative engine output through the parser and assert the MMR finding shape matches Section 5.3's mapping table.
- **`tests/observability-mmr.bats`** (bats, hermetic harness):
  - `mmr review --diff tests/fixtures/observability/mmr/pr-diff.patch --channels=doc-conformance --sync --format=json --config=…` runs the channel against the fixture diff; assert exit zero and that the resulting findings match an oracle JSON produced by running `scaffold observe audit --json` directly on the same diff.
  - `mmr review --diff … --config=…` (all channels, with the other four stubbed) — confirm the doc-conformance channel reconciles alongside the four stubs without spurious cross-channel collapse and without losing findings.

No bats test invokes a live `gh pr view`, real `codex exec`, real `gemini`, or real `claude`; CI runs without these tools authenticated.

### 6.5 Concurrency / robustness tests

`tests/integration/observability/concurrency.test.ts` (vitest) — exercises edge cases that simple unit tests miss:

- 50 concurrent `scaffold observe event` invocations from the same worktree; assert no torn lines, no event loss, lockfile released after each.
- Synthesizer reading mid-flush (write-then-rename atomicity) — race a `gc` rotation against a `harvest --recover` and a `progress --replay` reader; assert all three exit zero and the reader sees a consistent snapshot.
- Stale lockfile recovery — kill a writer mid-`flock`, assert the next writer proceeds after the stale window.
- Crash mid-write — truncate the ledger file mid-line, assert the synthesizer recovers via the malformed-line skip path and `availability.ledger.malformed_lines` reports the count.

### 6.6 Performance budgets

These are tracked as test thresholds, not gates; failing them produces a warning, not a test failure (so CI doesn't flake on slow runners). Tracked in `tests/performance/observability/`:

- Fast-profile audit on the `drift-each-lens` fixture: ≤ 5 s on small repos, ≤ 30 s on the `clean-monorepo` fixture.
- Full-profile audit (LLM-mocked): ≤ 30 s on small repos.
- `progress` snapshot rendering: ≤ 1 s on a 90-day-deep ledger fixture (~10k events).
- Dashboard fragment regeneration: ≤ 2 s for both `observe:progress` and `observe:audit` panels.

### 6.7 Schema-version migration tests

When the engine bumps `schema_version` past `"1.0"` in a future release, a migration test suite verifies older sidecars stay readable:

- A pinned set of `tests/fixtures/observability/sidecars-v1/*.json` files (representative outputs from this v1 design) must continue to be parseable by the latest engine and must produce the same trend data via the `audit-history` adapter.
- New schema versions must declare their migration in `src/observability/engine/schema-migrations.ts` (a pure transform `(v_n, sidecar) => sidecar`), with tests asserting bidirectional compatibility within a major version and one-way migration across major versions.

### 6.8 Coverage targets

- Engine internals (`src/observability/engine/`): ≥ 90% line coverage; all error paths covered.
- Lens checks (`src/observability/checks/`): ≥ 85% line coverage; every severity tier reachable via fixtures.
- Adapters: ≥ 70% line coverage (lower because mocking external CLIs has diminishing returns; integration tests pick up the slack).
- Renderers: 100% snapshot-coverage of representative `EngineOutput` shapes. Snapshots required:
  - **Progress** (verdict is always `pass` per Section 2.5): one snapshot for the *clean* shape (no needs_attention, no degradation), one for *with-stall* (needs_attention populated), one for *multi-agent* (multiple worktrees in `active_agents`), one for *replay-included*.
  - **Audit**: one snapshot per verdict (`pass` / `degraded-pass` / `blocked`), per renderer.
- CLI entry (`src/cli/commands/observe.ts`): exit-code coverage for every documented code in Section 5.1.

Coverage is reported via vitest's built-in `--coverage` and surfaced in `make check-all` output. Drops below targets fail the gate.

<!-- end of design -->

