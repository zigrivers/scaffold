---
title: Concepts & Glossary
topic: concepts
description: The shared vocabulary — worktrees, phases, lenses, verdicts, and the rest — that the other guides assume
category: concepts
order: 5
---

## How to read this guide

Scaffold's other guides each go deep on one system; this one is the **map of the
vocabulary** they share. Every term below gets a short definition and a link to
the guide that owns the full story. When two guides use the same word slightly
differently (a "verdict" in MMR vs. in the audit engine; a "lens" that lives in
the audit but reasons about the knowledge base), this guide is where the seam is
named.

Terms cluster into four families:

- **Pipeline** — how an idea becomes a build-ready spec.
- **Observability** — the durable record of what the build actually did.
- **Review** — how independent models gate changes.
- **Multi-agent** — how parallel worktrees coordinate without stepping on each other.

:::filter-table
| Term | Cluster | See also |
| --- | --- | --- |
| Phase | Pipeline | [pipeline](../pipeline/index.md) |
| Planning vs. build regime | Pipeline | [pipeline](../pipeline/index.md) |
| `dependencies` (hard gate) | Pipeline | [pipeline](../pipeline/index.md) |
| `reads` (soft reference) | Pipeline | [pipeline](../pipeline/index.md) |
| Conditional / `if-needed` | Pipeline | [pipeline](../pipeline/index.md) |
| Stateless step | Pipeline | [pipeline](../pipeline/index.md) |
| CREATE vs. UPDATE mode | Pipeline | [pipeline](../pipeline/index.md) |
| Methodology preset | Pipeline | [pipeline](../pipeline/index.md) |
| Depth (1–5) | Pipeline | [pipeline](../pipeline/index.md) |
| Overlay | Pipeline | [pipeline](../pipeline/index.md) |
| Ledger | Observability | [observability](../observability/index.md) |
| Event | Observability | [observability](../observability/index.md) |
| Adapter | Observability | [observability](../observability/index.md) |
| Lens (A–I) | Observability | [observability](../observability/index.md) · [knowledge-freshness](../knowledge-freshness/index.md) |
| Finding | Observability | [observability](../observability/index.md) |
| Audit verdict | Observability | [observability](../observability/index.md) |
| `fix_threshold` | Observability · Review | [observability](../observability/index.md) · [mmr](../mmr/index.md) |
| `--fix` flow | Observability | [observability](../observability/index.md) |
| Stall signal | Observability | [observability](../observability/index.md) |
| Phase-boundary audit | Observability · Pipeline | [observability](../observability/index.md) · [pipeline](../pipeline/index.md) |
| `doc-conformance` channel | Observability · Review | [observability](../observability/index.md) · [mmr](../mmr/index.md) |
| Knowledge entry | Knowledge | [knowledge-freshness](../knowledge-freshness/index.md) · [knowledge](../knowledge/index.md) |
| Volatility tier | Knowledge | [knowledge-freshness](../knowledge-freshness/index.md) |
| Knowledge-gap signal | Knowledge | [knowledge-freshness](../knowledge-freshness/index.md) |
| Channel | Review | [mmr](../mmr/index.md) · [review-workflow](../review-workflow/index.md) |
| Compensating pass | Review | [mmr](../mmr/index.md) |
| Reconcile | Review | [mmr](../mmr/index.md) |
| `finding_key` | Review | [mmr](../mmr/index.md) |
| MMR verdict | Review | [mmr](../mmr/index.md) |
| Worktree | Multi-agent | [multi-agent](../multi-agent/index.md) · [observability](../observability/index.md) |
| Worktree identity | Multi-agent | [observability](../observability/index.md) |
| Ledger harvest | Multi-agent | [observability](../observability/index.md) |
| Teardown | Multi-agent | [observability](../observability/index.md) |
:::

## Pipeline concepts

These describe the meta-prompt pipeline that turns an idea into a frozen,
build-ready spec. Full treatment: [the pipeline guide](../pipeline/index.md).

### Phase
One of the **16 ordered stages** the pipeline divides into, numbered 0 (vision)
through 15 (build). The phase list, slugs, numbers, and display names are defined
exactly once, in the `PHASES` constant
:cite[src/types/frontmatter.ts:6]; every doc, skill, and command resolves
against it. Steps within a phase run in `order` sequence (phase N occupies the
N00–N99 band). See [the pipeline guide](../pipeline/index.md#the-16-phases-at-a-glance).

### Planning vs. build regime
The pipeline splits into two regimes. **Planning** (phases 0–14) is *stateful*
and *sequential* — each step produces a durable artifact and is run roughly once,
in dependency order, working toward a frozen spec. **Build** (phase 15) is
*stateless* and *on-demand* — the execution loops you run repeatedly while
actually writing code. See [the pipeline guide](../pipeline/index.md#the-mental-model).

### `dependencies` (hard gate)
A step's frontmatter `dependencies` :cite[src/types/frontmatter.ts:114] are
**hard gates**: `scaffold run` refuses a step whose dependencies aren't
`completed` or `skipped`. Contrast `reads`. See
[Why a step is blocked](../pipeline/index.md#why-a-step-is-blocked).

### `reads` (soft reference)
A step's `reads` :cite[src/types/frontmatter.ts:122] are **soft references** — a
step uses an upstream artifact if it's present, but a missing read never blocks
execution (the assembler silently skips it). The
[pipeline guide](../pipeline/index.md#why-a-step-is-blocked) explains why
`reads ≠ dependencies` is a common trip-up.

### Conditional / `if-needed`
A step marked `conditional: 'if-needed'` :cite[src/types/frontmatter.ts:118] is
enabled but only *applies* to certain project shapes (e.g. `database-schema`
runs only if your project has a database layer). Conditional steps that don't
apply count as "satisfied" for dependency purposes. See
[Conditional steps](../pipeline/index.md#conditional-if-needed-steps).

### Stateless step
A phase-15 build step with `stateless: true` :cite[src/types/frontmatter.ts:126]
— it carries no completion state and can be run over and over (the agent loops,
resume commands, `quick-task`, `new-enhancement`). The pipeline never tracks or
gates these. See [the pipeline guide](../pipeline/index.md#the-mental-model).

### CREATE vs. UPDATE mode
Every document-creating prompt detects whether its output file already exists. On
first run it's **CREATE mode**; on a re-run it's **UPDATE mode**, which preserves
human/team customizations and changes only what genuinely needs to change. This
is what makes planning phases safe to iterate. See
[CREATE vs UPDATE mode](../pipeline/index.md#create-vs-update-mode).

### Methodology preset
*Which* steps are enabled. Three presets ship — `mvp`, `custom` (balanced), and
`deep` (the schema default and most thorough). Presets are layered with
**overlays**. See [Methodology & depth](../pipeline/index.md#methodology--depth).

### Depth (1–5)
*How thorough* each enabled step's output is, on a 1–5 scale from Minimal to
Exhaustive (depth 3 is the recommended default). Orthogonal to the preset:
the preset picks the steps, depth dials each one's detail. At depth 4–5 some
review/validation steps add external- or multi-model dispatch. See
[Depth](../pipeline/index.md#depth-1-5).

### Overlay
A project-type layer (`content/methodology/*-overlay.yml`) applied on top of a
preset. Most overlays only **inject domain knowledge** into existing steps
(web-app, mobile, CLI, library); a few **enable whole step families** (game,
multi-service). See
[Project-type playbooks](../pipeline/index.md#project-type-playbooks).

## Observability concepts

These describe Build Observability — the durable record of what the build did,
and the audit that checks it against the planning docs. Full treatment:
[the build observability guide](../observability/index.md).

### Ledger
The append-only `.scaffold/activity.jsonl` file where every durable observation
lands as one JSON object per line. Writes are lock-guarded so parallel worktrees
never corrupt it, each event is capped at 4 KiB, and secrets and home paths are
redacted on the way in and out. See [The ledger](../observability/index.md#the-ledger).

### Event
One typed entry in the ledger, written via `scaffold observe event <type> …`.
There are **nine event types** :cite[src/observability/engine/types.ts:9]
(`task_claimed`, `task_completed`, `decision_recorded`, `blocker_hit`,
`blocker_resolved`, `pr_opened`, `progress_heartbeat`, `finding_acknowledged`,
`knowledge_gap_signal`), each with its own payload allow-list. See
[The nine event types](../observability/index.md#the-nine-event-types).

### Adapter
A component that *synthesizes* events from the surrounding tools (git, GitHub,
MMR jobs, pipeline state, test runs) so the timeline reflects more than what
agents chose to record. Eight adapters exist
:cite[src/observability/engine/types.ts:69]; five emit replay events, three are
availability probes. See [Adapters](../observability/index.md#adapters).

### Lens (A–I)
An independent audit check function inside `scaffold observe audit`. The suite
runs **nine lenses, A through I** — TDD coverage, AC coverage, coding-standards
drift, tech-stack drift, design-system drift, scope, decisions, cross-doc
consistency, and knowledge gaps. Lenses A–G run under `--scope code`, H and I
under `--scope docs`. See
[The nine-lens audit](../observability/index.md#the-nine-lens-audit). **Lens I**
(`I-knowledge-gaps`) lives in the audit but reasons about the knowledge base —
its full behavior is in [the knowledge-freshness guide](../knowledge-freshness/index.md#lens-i-gap-detection--suppression).

### Finding
A single issue a lens reports, carrying a severity (`P0`–`P3`), a title, a
source doc, and an optional fix hint. Findings can be `open`, `acknowledged`
(silenced via `scaffold observe ack`), or `skipped` (a lens whose required
adapter was missing). See
[The nine-lens audit](../observability/index.md#the-nine-lens-audit).

### Audit verdict
The overall result of an audit run. The engine computes exactly **three**
verdicts :cite[src/observability/engine/types.ts:6]: `pass` (no blocking
findings, no skipped lenses), `degraded-pass` (no blocking findings but ≥1 lens
skipped), and `blocked` (≥1 open finding at or above `fix_threshold`). Note
this is **not** the same set as MMR's four verdicts — see [MMR verdict](#mmr-verdict).
See [Verdict taxonomy](../observability/index.md#verdict-taxonomy).

### `fix_threshold`
The severity cutoff that decides which findings count as *blocking*. A finding
blocks when its status is `open` and its severity is at or above the threshold
(default **P2**). The threshold never hides findings — it only decides which
ones drive a `blocked` verdict. The same name and default govern the MMR gate.
See [`fix_threshold`](../observability/index.md#fix_threshold) and the
[MMR gate](../mmr/index.md#the-gate--the-four-verdicts).

### `--fix` flow
`scaffold observe audit --fix` doesn't just report blocking findings — it
dispatches an agent to fix each one, verifies the fix with a single-lens
re-audit, and writes a post-fix report, all under abort-safe stashing. See
[The --fix flow](../observability/index.md#the---fix-flow).

### Stall signal
A staleness alert raised on the "Needs Attention" surface when
`scaffold observe progress` runs — e.g. a claimed task with no recent activity,
a PR that hasn't merged, an unaddressed blocker. Six signals are defined; five
fire today. Thresholds are configurable under `stall:` in
`.scaffold/observability.yaml`. See
[Stall detection](../observability/index.md#stall-detection--the-six-signals).

### Phase-boundary audit
A non-gating cross-document audit that fires automatically when a planning
document at a phase boundary is marked complete. It runs only the `H-cross-doc`
lens at `scope=docs`, prints a one-line summary, and never blocks the state
transition. The six boundary steps are `user-stories`, `tech-stack`,
`coding-standards`, `design-system`, `implementation-plan`, and
`implementation-playbook`. See
[Phase-boundary triggers](../observability/index.md#phase-boundary-triggers) and
the [pipeline view](../pipeline/index.md#phase-boundary-audits).

### `doc-conformance` channel
The seam where the audit plugs into multi-model review: a built-in MMR channel
that runs `scaffold observe audit --output-mode=mmr-findings` and emits findings
in MMR's `Finding` shape. Disabled by default; enable with
`--channels=doc-conformance`. See
[MMR doc-conformance channel](../observability/index.md#mmr-doc-conformance-channel)
and the [MMR channel architecture](../mmr/index.md#channel-architecture).

## Knowledge concepts

These describe the knowledge base and how it stays current. Full treatment:
[the knowledge-freshness guide](../knowledge-freshness/index.md) and
[the knowledge guide](../knowledge/index.md).

### Knowledge entry
A domain-expertise document under `content/knowledge/<category>/<slug>.md`,
injected into prompts during assembly. Each declares a `name`, `volatility`
tier, and a list of `sources`. See
[the knowledge guide](../knowledge/index.md) and
[Adding a new entry](../knowledge-freshness/index.md#adding-a-new-entry-to-the-kb).

### Volatility tier
How often an entry is expected to drift, on a three-tier scale — `fast-moving`,
`evolving` (default), `stable` — which sets the daily cron's re-audit cadence
(14 / 60 / 180 days). See
[the cadence model](../knowledge-freshness/index.md#cadence-model).

### Knowledge-gap signal
A `knowledge_gap_signal` ledger event emitted when an agent hits a topic the KB
doesn't cover. **Lens I** aggregates these over a rolling 90-day window into
P1/P2 findings, suppressing any topic an entry already covers. This is where the
observability and knowledge-freshness systems meet. See
[How a gap closes](../knowledge-freshness/index.md#how-a-gap-closes).

## Review concepts

These describe Multi-Model Review (MMR). Full treatment:
[the MMR guide](../mmr/index.md) and
[the review-workflow guide](../review-workflow/index.md).

### Channel
One independent AI reviewer in an MMR run — a separate subprocess given the same
prompt and run in isolation. The built-in channels are `codex`, `gemini`,
`claude`, `grok`, and the opt-in `doc-conformance`; the `scaffold run` wrappers
add a Superpowers code-reviewer *agent* channel. A channel is pure config data,
not per-channel code. See [Channel architecture](../mmr/index.md#channel-architecture).

### Compensating pass
When a channel is degraded (not installed, auth-failed, timed out), MMR runs a
`claude -p` pass focused on that channel's strength area, labeled e.g.
`[compensating: Grok-equivalent]`. These findings are single-source and
low-confidence. See [Degraded mode](../mmr/index.md#degraded-mode-compensation--auth).

### Reconcile
The step that groups every channel's findings by a stable key, de-duplicates
them, and scores each group for agreement and confidence — producing the single
list and verdict. Agreement *between* channels raises confidence; disagreement
surfaces ambiguity. `mmr reconcile` also folds an external agent channel's
findings into an existing job. See
[Findings, reconciliation & verdicts](../mmr/index.md#findings-reconciliation--verdicts).

### `finding_key`
The stable identity MMR computes for a finding so the same issue can be tracked
across rounds and acknowledgments. Line numbers are stripped from the location
and severity is excluded, so the same issue at P1 vs. P2 collapses to one key;
a character-5-gram shingle backs a fuzzy match for re-worded findings. See
[Stable identity](../mmr/index.md#stable-identity-finding_key).

### MMR verdict
The gate result of a review. MMR computes **four** verdicts: `pass`,
`degraded-pass`, `blocked`, and `needs-user-decision` (no channel completed).
Proceed only on `pass` or `degraded-pass`.

:::callout{type=warning}
**Two verdict vocabularies — don't conflate them.** The MMR review gate has
*four* verdicts (the fourth, `needs-user-decision`, fires when no channel
completes). The Build Observability audit engine emits only *three* —
`needs-user-decision` is **not** an audit-engine verdict. See
[the MMR gate](../mmr/index.md#the-gate--the-four-verdicts) and
[the audit verdict taxonomy](../observability/index.md#verdict-taxonomy).
:::

## Multi-agent concepts

These describe how parallel agents share a repo without colliding. Full
treatment: [the multi-agent guide](../multi-agent/index.md), with the durable
record covered in [the observability guide](../observability/index.md).

### Worktree
An isolated git working tree used for parallel agent execution, so multiple
agents (and humans) can build different parts of a project at once without
sharing a checkout. Each worktree has its own ledger. See
[the multi-agent guide](../multi-agent/index.md).

### Worktree identity
The stable per-worktree identity recorded in `.scaffold/identity.json` on first
write — a `worktree_id` (UUID), a `worktree_label`, and `created_at`. It's what
lets the harvester tell one worktree's events from another's, and what stamps
every event's `worktree_id`. See
[Worktree identity](../observability/index.md#worktree-identity).

### Ledger harvest
Copying a worktree's local ledger into the primary repo's archive *before* the
worktree is removed, so the build's reasoning survives teardown.
`harvest --recover` separately sweeps up ledgers whose worktrees vanished
without being harvested. See
[Harvest, recover & teardown](../observability/index.md#harvest-recover--teardown).

### Teardown
Removing a finished worktree the safe way — `scripts/teardown-agent-worktree.sh`
harvests the ledger first, then runs `git worktree remove`, then deletes the
workspace branch. Harvesting before removal is what closes the
decisions-die-at-teardown gap. See
[Harvest, recover & teardown](../observability/index.md#harvest-recover--teardown).

## See also

- [The Scaffold Pipeline](../pipeline/index.md) — phases, dependencies, presets, depth.
- [Build Observability](../observability/index.md) — ledger, events, the nine lenses, verdicts, `--fix`.
- [Knowledge Freshness](../knowledge-freshness/index.md) — volatility tiers, gap signals, Lens I.
- [MMR Reference](../mmr/index.md) — channels, reconciliation, the four verdicts.
- [Multi-agent](../multi-agent/index.md) — worktrees and parallel execution.
- [Review workflow](../review-workflow/index.md) — running reviews end to end.
- [CLI reference](../cli/index.md) — the full command surface.
