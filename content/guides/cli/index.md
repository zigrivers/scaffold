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

Commands are registered on a single yargs root
(:cite[src/cli/index.ts:30]) and every command accepts the global options
`--format json`, `--auto`, `--verbose`, `--root <dir>`, and `--force`
(:cite[src/cli/index.ts:59]).

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
:::

## Setup & adoption

Two entry points: `init` for a fresh project, `adopt` for an existing codebase.

- **`scaffold init`** (:cite[src/cli/commands/init.ts:151]) — scaffold a new
  project: writes `.scaffold/` state and config. `--force` backs up and
  reinitializes if `.scaffold/` already exists.
- **`scaffold adopt`** (:cite[src/cli/commands/adopt.ts:168]) — bring an
  existing project under scaffold. `--dry-run` previews without writing.

```bash
scaffold init
scaffold adopt --dry-run    # preview what adoption would write
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

## See also

- [Pipeline guide](../pipeline/index.md) — phase ordering and the navigation loop.
- [Build Observability guide](../observability/index.md) — the full `observe`
  subsystem.
