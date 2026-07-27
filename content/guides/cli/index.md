---
title: Scaffold CLI Reference
topic: cli
description: Every scaffold command grouped by purpose — setup, navigation, observability, knowledge, validation, version
category: reference
order: 20
---

## Overview

This is a terse index of the whole `scaffold` command surface. It tells you
*which* command does *what* and points to the deep guides where a subsystem
earns its own page. For the full mental model of a subsystem, follow the links:

- **Pipeline navigation** (`next`, `run`, `complete`, `rework`, `skip`,
  `reset`, `check`) is the day-to-day loop — see the [Pipeline guide](../pipeline/index.md).
- **Observability** (`observe event｜progress｜harvest｜audit｜ack`) is its own
  large surface — see the [Build Observability guide](../observability/index.md).
- **Operations** (`doctor`, `agent-ops`, `hooks`, `mq`, `tia`, `sched`) is the
  opt-in parallel-agent kit — merge queue, test-impact analysis, scheduler,
  health checks. Documented [below](#operations--the-parallel-agent-kit); the
  worktree side lives in the [Multi-agent guide](../multi-agent/index.md).

All 30 commands are registered on a single yargs root
(:cite[src/cli/index.ts:116]) and every command accepts the global options
`--format json`, `--auto`, `--verbose`, `--root <dir>`, and `--force`
(:cite[src/cli/index.ts:146]).

## All commands at a glance

:::filter-table
| Command | Group | What it does |
| --- | --- | --- |
| `scaffold init` | Setup & adoption | Initialize scaffold for this project |
| `scaffold adopt` | Setup & adoption | Adopt an existing project into scaffold |
| `scaffold next` | Pipeline navigation | Show next eligible step(s) |
| `scaffold run <step>` | Pipeline navigation | Run a pipeline step (assemble + emit the prompt) |
| `scaffold complete <step>` | Pipeline navigation | Mark a step done (for steps run outside `scaffold run`) |
| `scaffold rework` | Pipeline navigation | Re-run steps by phase for depth/cleanup |
| `scaffold skip <step..>` | Pipeline navigation | Skip one or more steps |
| `scaffold reset [step]` | Pipeline navigation | Reset a step (or the whole pipeline) to pending |
| `scaffold check <step>` | Pipeline navigation | Check whether a conditional step applies here |
| `scaffold status` | Status & dashboard | Show pipeline progress and step statuses |
| `scaffold info [step]` | Status & dashboard | Show project info, or detail on one step |
| `scaffold list` | Status & dashboard | List methodologies, platform adapters, and tools |
| `scaffold decisions` | Status & dashboard | Show recorded decisions |
| `scaffold dashboard` | Status & dashboard | Open the visual pipeline dashboard in a browser |
| `scaffold observe event <type>` | Observability | Write a ledger event |
| `scaffold observe progress` | Observability | Show the build-progress snapshot (with `--replay`) |
| `scaffold observe audit` | Observability | Run the audit lenses and report findings |
| `scaffold observe ack <prefix-or-id>` | Observability | Acknowledge or reopen a finding by ID prefix |
| `scaffold observe harvest` | Observability | Flush a worktree ledger to the primary archive |
| `scaffold knowledge <subcommand>` | Knowledge | Manage knowledge entries (list｜show｜update｜reset) |
| `scaffold knowledge-freshness <command>` | Knowledge | Run knowledge-base freshness audits |
| `scaffold validate` | Validation | Validate meta-prompts and config |
| `scaffold validate-knowledge` | Validation | Validate frontmatter on all knowledge entries |
| `scaffold version` | Version & update | Show version and check for updates |
| `scaffold update` | Version & update | Check for and display CLI updates |
| `scaffold build` | Platform & skills | Generate platform adapter output files |
| `scaffold skill <action>` | Platform & skills | Manage scaffold skills for Claude Code / shared agents |
| `scaffold guides [topic]` | Platform & skills | Open, list, or build the reference guides |
| `scaffold doctor` | Operations | Health-check the installed surface (pipeline, beads, hooks, gate, queue, scheduler) |
| `scaffold agent-ops <action>` | Operations | Install or drift-check the agent-ops script bundle |
| `scaffold hooks install` | Operations | Register the Claude Code agent hooks into `.claude/settings.json` |
| `scaffold mq <action>` | Operations | Local batching merge queue — enqueue, daemon, status, stats |
| `scaffold tia <action>` | Operations | Test-impact analysis — coverage map + affected-test selection |
| `scaffold sched <action> [job]` | Operations | Manage local scheduler jobs (launchd / systemd user timers) |
:::

## Setup & adoption

Two entry points: `init` for a fresh project, `adopt` for an existing codebase.

- **`scaffold init`** (:cite[src/cli/commands/init.ts:151]) — scaffold a new
  project: writes `.scaffold/` state and config. `--force` backs up and
  reinitializes if `.scaffold/` already exists.
- **`scaffold adopt`** (:cite[src/cli/commands/adopt.ts:168]) — bring an
  existing project under scaffold. It **writes nothing by default**: it renders
  an Adoption Plan and stops. `--dry-run` is deprecated and does nothing, since
  plan mode is already the default.

```bash
scaffold init
scaffold adopt                              # render the plan, write nothing
scaffold adopt --apply --plan-key <sha256>  # execute the approved plan
```

## Pipeline navigation

The core loop. `next` tells you what's eligible, `run` emits the assembled
prompt, `complete` records work done outside the CLI, and `rework`/`skip`/`reset`
adjust state. See the [Pipeline guide](../pipeline/index.md) for phase ordering
and dependencies.

- **`scaffold next`** (:cite[src/cli/commands/next.ts:28]) — show the next
  eligible step(s) given current state and dependencies.
- **`scaffold run <step>`** (:cite[src/cli/commands/run.ts:45]) — assemble and
  emit a pipeline step's prompt. `--depth`, `--instructions`, and `--service`
  refine the run.
- **`scaffold complete <step>`** (:cite[src/cli/commands/complete.ts:28]) — mark
  a step completed for work executed outside `scaffold run` (this is the hook
  that fires phase-boundary audits — see the
  [Observability guide](../observability/index.md)).
- **`scaffold rework`** (:cite[src/cli/commands/rework.ts:39]) — re-run steps by
  phase for depth improvement or cleanup. `--phases`, `--through N`, `--exclude`.
- **`scaffold skip <step..>`** (:cite[src/cli/commands/skip.ts:35]) — skip one
  or more steps; `--reason` records why.
- **`scaffold reset [step]`** (:cite[src/cli/commands/reset.ts:32]) — reset one
  step, or the whole pipeline (guarded by `--confirm-reset`).
- **`scaffold check <step>`** (:cite[src/cli/commands/check.ts:115]) — report
  whether a conditional step applies to this project type.

```bash
scaffold next                 # what can I run now?
scaffold run user-stories     # emit the prompt for a step
scaffold rework --through 3   # re-run phases 1 through 3
```

## Status & dashboard

Read-only views of project and pipeline state.

- **`scaffold status`** (:cite[src/cli/commands/status.ts:80]) — pipeline
  progress and per-step status.
- **`scaffold info [step]`** (:cite[src/cli/commands/info.ts:26]) — project
  summary, or detail on a single step.
- **`scaffold list`** (:cite[src/cli/commands/list.ts:74]) — available
  methodologies, platform adapters, and tools.
- **`scaffold decisions`** (:cite[src/cli/commands/decisions.ts:23]) — recorded
  decisions for the project.
- **`scaffold dashboard`** (:cite[src/cli/commands/dashboard.ts:77]) — generate
  and open the visual pipeline dashboard.

## Observability — `scaffold observe …`

`observe` is the build-observability surface: a durable event ledger, a fused
progress timeline, a multi-lens audit, and worktree-ledger harvesting. It
demands a subcommand (:cite[src/cli/commands/observe.ts:398]). This guide only
lists the verbs — the [Build Observability guide](../observability/index.md)
documents the event schemas, the nine audit lenses, verdicts, stall signals,
and config.

:::filter-table
| Subcommand | What it does |
| --- | --- |
| `observe event <type> --branch <branch> [--task-id <id>] [payload flags]` | Write one ledger event (`task_claimed`, `decision_recorded`, `blocker_hit`, …); `--branch` is required |
| `observe progress` | Snapshot of in-flight/completed work; `--replay` fuses git/gh/mmr/state/tests |
| `observe audit` | Run the audit lenses; exits `1` when blocked |
| `observe ack <prefix-or-id>` | Acknowledge or reopen a finding by ID prefix |
| `observe harvest` | Flush a worktree ledger to the primary archive; `--recover` sweeps stale ones |
:::

```bash
scaffold observe progress --replay
scaffold observe audit --scope docs --profile full
scaffold observe ack 3a8c1f02 --status acknowledged --note "tracked in #412"
scaffold observe harvest --worktree ../wt-alice
```

## Knowledge

Two distinct command trees: `knowledge` manages the entries themselves;
`knowledge-freshness` audits them for staleness.

- **`scaffold knowledge <subcommand>`** (:cite[src/cli/commands/knowledge.ts:417])
  — `list`, `show <name>`, `update <target> [instructions..]`, `reset <name>`
  for global entries and local overrides.
- **`scaffold knowledge-freshness <command>`**
  (:cite[src/cli/commands/knowledge-freshness.ts:12]) — the freshness-audit
  family: `audit-prefilter`, `audit-run-entry`, `audit-apply`, `link-check`,
  `lint-unsourced`, `anti-over-rewrite`, `deep-guidance-check`, `bump-version`.

```bash
scaffold knowledge list
scaffold knowledge show react-state-management
```

## Validation

- **`scaffold validate`** (:cite[src/cli/commands/validate.ts:19]) — validate
  meta-prompt frontmatter and config (the `make validate` gate).
- **`scaffold validate-knowledge`** (:cite[src/cli/commands/validate-knowledge.ts:20])
  — validate frontmatter on all knowledge entries (volatility, last-reviewed,
  sources, version-pin).

## Version & update

- **`scaffold version`** (:cite[src/cli/commands/version.ts:78]) — show the
  installed version and check for a newer one.
- **`scaffold update`** (:cite[src/cli/commands/update.ts:93]) — check for and
  display available CLI updates.

## Platform & skills

- **`scaffold build`** (:cite[src/cli/commands/build.ts:40]) — generate the
  platform adapter output files from pipeline content.
- **`scaffold skill <action>`** (:cite[src/cli/commands/skill.ts:31]) — manage
  scaffold skills for Claude Code and shared agents.
- **`scaffold guides [topic]`** (:cite[src/cli/commands/guides.ts:57]) — open,
  list, or build the reference guides. `--list --format json` for discovery,
  `--markdown` / `--print-path` for agents, `--build` to regenerate the HTML.

```bash
scaffold guides --list --format json   # discover guides (agents)
scaffold guides cli --markdown         # read this guide's source
scaffold guides --build                # regenerate index.html (maintainer/CI)
```

:::callout{type=note}
**Agents read markdown, never HTML.** Use `scaffold guides <topic> --markdown`
or read the bundled `content/guides/<topic>/index.md` directly. The generated
`index.html` is for humans.
:::

## Operations — the parallel-agent kit

These six commands are orthogonal to the pipeline: they install and run the
machinery that lets several agents work one repo at once. None of them touch
pipeline state. They are opt-in — a project that never runs
`scaffold agent-ops install` never sees them.

:::filter-table
| Command | What it does |
| --- | --- |
| `scaffold doctor [--fix] [--json]` | Run every health check across the installed surface and print remediation for each. `--fix` applies only the safe ones. |
| `scaffold agent-ops install [--component <c>] [--force]` | Copy the agent-ops script bundle into the project and record a manifest. |
| `scaffold agent-ops check` | Drift-check the installed bundle against its manifest. |
| `scaffold hooks install` | Deep-merge the Claude Code agent hooks into `.claude/settings.json` — append-only and idempotent. |
| `scaffold mq <action>` | The local batching merge queue (see below). |
| `scaffold tia <action>` | Test-impact analysis: record a coverage map, select the affected tests. |
| `scaffold sched <action> [job]` | Install/inspect local scheduler jobs — launchd on macOS, systemd user timers on Linux. |
:::

### `scaffold doctor`

Ten checks across six sections — `pipeline` (completed steps actually produced
their outputs), `beads` (binary, live database, backup, guard), `hooks`
(registered scripts exist and are executable), `gate` (the `check` /
`check-affected` make targets resolve), `queue` (daemon lock, not paused), and
`scheduler` (the poller schedule is loaded)
(:cite[src/doctor/checks.ts:419]). Each check reports `ok` / `warn` / `error` /
`skip` with its own remediation line.

Three checks can self-heal under `--fix`: the live-Beads check delegates to
`bd doctor --fix`, hook registration re-runs the installer, and the scheduler
check reloads the job. Everything else still only *reports* its fix.

:::callout{type=warning}
**`doctor`'s exit code is a severity, not the usual envelope code.** It exits
`1` when any check warns and `2` when any check errors
(:cite[src/doctor/run.ts:89]) — so `2` here means "a check failed", not the
enum's `MissingDependency`. Branch on the `--json` report rather than the code
if you need per-check detail.
:::

### `scaffold agent-ops`

Installs the project-owned script bundle that worktree and merge-queue workflows
call. `--component` selects what lands:

| `--component` | Installs |
| --- | --- |
| `git` | Worktree setup/teardown, branch cleanup, main-sync, Beads guard + snapshot, claim reaping, `agent-ops.mk` |
| `staging` | Staging-env and Docker helper scripts under `scripts/ops/`, plus a compose env example |
| `merge-queue` | `scripts/mq-guard.sh`, the post-merge poller, and a `.mq/` gitignore entry |
| `ci` | Self-hosted-runner setup plus the `post-merge` and `nightly` workflows |
| `gate` | Seeds the project-owned `scripts/gate-check.sh` + `scripts/gate-check-affected.sh` (the merge-queue gate contract) |
| `all` *(default)* | `git` + `staging` only |

`all` deliberately does **not** include `merge-queue`, `ci`, or `gate` — each of
those changes how the repo merges or what CI runs, so they stay explicit
opt-ins. Seeded files (`gate`) are generated once and never overwritten without
`--force`. Every install writes `.scaffold/agent-ops-manifest.json` and
`.scaffold/agent-ops-version`; `scaffold agent-ops check` compares the tree
against that manifest and exits `1` on a stale version, a locally modified file,
or a missing file (files the manifest doesn't know about are reported but never
fail the check).

### `scaffold mq` — the merge queue

A local batching merge queue: PRs are enqueued, gated in batches, and merged in
order, so parallel agents don't each re-run the full suite against a moving
`main`.

| Action | What it does |
| --- | --- |
| `enqueue --pr <N>` | Add a PR to the queue (fire-and-forget; auto-starts the daemon) |
| `daemon [--foreground]` | Run the queue daemon; `--foreground` also logs to stdout |
| `status [--pr <N>] [--format json]` | Queue state, the paused banner, per-PR states |
| `eject --pr <N>` | Withdraw a PR from the queue |
| `release --pr <N>` | Return a `HELD_HUMAN` (overlap-zone) PR to the queue; it lands solo-gated |
| `stats` | Calibration metrics — arrivals, gate outcomes, median gate time, flakes, cache hits, TIA map age |
| `bootstrap --pr <N> [--finish]` | Guided FIRST merge for a repo installing the queue in its own PR; `--finish` resumes a partial run |
| `gate-cache` | Inspect the gate-result cache (skips a gate when this exact tree already ran green) |

Queue state lives under `.mq/` — an append-only `journal.jsonl` that the queue
state is a reduction of, plus the gate cache, logs, and the daemon lock.
Configuration is the `merge_queue:` block of `.scaffold/agent-ops.yaml`
(:cite[src/merge-queue/types.ts:95]); notable keys are `gate_command`
(default `make check-affected`), `full_gate_command` (default `make check`),
`batch_cap` (16), `ready_label` (`mq:ready`), `overlap_zones`, and
`overlap_zone_policy` (`solo` | `hold`).

### `scaffold tia` — test-impact analysis

| Action | What it does |
| --- | --- |
| `affected --base <ref>` | Print the selected test list plus a confidence verdict |
| `record-due` | Predicate: is a coverage-map recording due right now? |
| `ingest` | Fold a V8 coverage dump into `.mq/tia/map.json` |

:::callout{type=warning}
**Two exit codes here are answers, not failures.** `scaffold tia affected` exits
**3** to mean *"don't trust this selection — run the full suite"*, and it fails
closed: any uncertainty, and any thrown error, produces a 3
(:cite[src/cli/commands/tia.ts:115]). `scaffold tia record-due` exits **1** to
mean *"not due"* (:cite[src/cli/commands/tia.ts:136]) and prints nothing. Treat
a non-zero here as a routing decision, not an error.
:::

Recording cadence is `merge_queue.tia.record` in `.scaffold/agent-ops.yaml` —
`scheduled` (default; first green pass per UTC day), `always`, or `off`.

### `scaffold sched`

`install` / `uninstall` / `status` / `list` for local scheduler jobs, using
launchd on macOS and systemd user timers on Linux. One job ships today,
`post-merge-poller` (:cite[src/sched/jobs.ts:38]), which runs the merge queue's
post-merge full gate; `--interval <seconds>` sets its period on install
(default 600). It requires `scripts/ops/post-merge-poller.sh`, so run
`scaffold agent-ops install --component merge-queue` first. `sched status` exits
`1` when the job is not loaded, so it doubles as a liveness probe.

## See also

- [Pipeline guide](../pipeline/index.md) — phase ordering and the navigation loop.
- [Build Observability guide](../observability/index.md) — the full `observe`
  subsystem.

## Driving scaffold from an agent

Every command below is safe to run with no TTY. Pass `--format json` and read
stdout; human-readable progress goes to stderr and can be discarded.

### Exit codes

| Code | Name | Meaning |
|------|------|---------|
| 0 | `Success` | The command did what was asked. |
| 1 | `ValidationError` | Bad or missing input. `errors[0].recovery` names the fix. |
| 2 | `MissingDependency` | A required external tool is absent. |
| 3 | `StateCorruption` | `.scaffold/state.json` could not be read or migrated, or a lock could not be acquired. |
| 4 | `UserCancellation` | An interactive prompt was cancelled. |
| 5 | `BuildError` | Adapter generation failed. |
| 6 | `Ambiguous` | Operator action required, such as detection finding two equally plausible project types. Re-run with `--project-type`. |

Source of truth: `src/types/enums.ts`. A bats gate asserts this table and the
enum agree in both directions, so a code cannot change on one side only.

### The output envelope

Success:

```json
{"success": true, "data": {}, "errors": [], "warnings": [], "exit_code": 0}
```

Failure:

```json
{
  "success": false,
  "data": null,
  "errors": [
    {
      "code": "INIT_AUTO_FLAG_REQUIRED",
      "message": "--cli-interactivity is required in auto mode for cli projects",
      "exitCode": 1,
      "recovery": "Pass --cli-interactivity <args-only|interactive|hybrid>"
    }
  ],
  "warnings": [],
  "exit_code": 1
}
```

Branch on `success`. Where the envelope is emitted, it carries at least one
entry in `errors`, every entry carries a `recovery` string naming the flag or
command that fixes it, and `exit_code` always matches the process exit status.

Coverage is CLI-wide as of v3.53.0, and a static test fails the build if a
command reports a failure any other way.

:::callout{type=note}
**Deliberate exceptions — commands whose exit code is the answer.** A handful of
operations commands are predicates or severity reporters, not envelope emitters.
Read their code as a result, not as a failure:

| Command | Non-zero means |
| --- | --- |
| `scaffold tia record-due` | `1` = not due (`0` = due). Prints nothing, emits no envelope. |
| `scaffold tia affected` | `3` = don't trust the selection, run the full suite (fails closed on any error). |
| `scaffold doctor` | `1` = a check warned · `2` = a check errored. |
| `scaffold agent-ops check` | `1` = the installed bundle is stale, modified, or missing files. |
| `scaffold sched status` | `1` = the job is not loaded. |
| `scaffold mq gate-cache --check-tree` | `1` = cache miss (`0` = hit). |
| `scaffold observe audit` | `1` = verdict is `blocked` (see the [observability guide](../observability/index.md)). |
:::

### Choosing `init` or `adopt`

Run `scaffold adopt` when the directory already contains source code or docs.
Run `scaffold init` for an empty or brand-new directory.

`adopt` runs in two steps. Bare `scaffold adopt` **writes nothing** — it renders
an Adoption Plan and stops. `scaffold adopt --apply --plan-key <sha256>` then
executes it, and *that* step writes `.scaffold/` and selects the `brownfield`
methodology itself. So no separate `scaffold init` is needed either way — but
nothing is written until you approve the plan.

### Flags `--auto` cannot default

Nine project types need one flag chosen explicitly, because there is no
defensible default. They are annotated `[required with --auto]` in
`scaffold init --help`.

| `--project-type` | Required flag |
|---|---|
| `web-app` | `--web-rendering` |
| `backend` | `--backend-api-style` |
| `cli` | `--cli-interactivity` |
| `library` | `--lib-visibility` |
| `mobile-app` | `--mobile-platform` |
| `data-pipeline` | `--pipeline-processing` |
| `ml` | `--ml-phase` |
| `research` | `--research-driver` |
| `mcp-server` | `--mcp-language` |

`game`, `browser-extension`, `macos-native`, `data-science` and `web3` need
none. A type-specific flag implies its project type, so
`scaffold init --auto --cli-interactivity args-only` is sufficient on its own.

Any non-interactive mode implies `--auto`: a piped invocation, or `--format
json`, will refuse to invent an answer rather than silently choosing one.

### The driving loop

```bash
scaffold next --format json          # .data.eligible[].command is runnable as-is
scaffold run <slug>                  # prints the assembled meta-prompt on stdout
scaffold complete <slug> --format json
```

Repeat until `.data.pipeline_complete` is `true`.

### Adoption plan keys

`plan_key` is content-addressed: it hashes the plan's dispositions and
initialize payload, and deliberately excludes `project_root` and `generated_at`
(`src/project/adoption-plan.ts`). Two repos whose plans are identical therefore
share a key. Do not cache a key across repositories; always read the key from
the plan you just rendered.
