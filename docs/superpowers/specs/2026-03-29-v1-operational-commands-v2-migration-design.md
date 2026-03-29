# V1 Operational Commands → V2 Migration Design

**Date**: 2026-03-29
**Status**: Approved

## Problem

13 operational commands in `commands/` are v1 holdovers with no corresponding `pipeline/` meta-prompt source files. They bypass the v2 build system (no knowledge-base injection, no adapter support, no frontmatter validation) and are manually maintained markdown files sitting alongside 54 build-generated commands.

**The orphaned commands:**

| Category | Commands |
|----------|----------|
| Execution | `single-agent-start`, `single-agent-resume`, `multi-agent-start`, `multi-agent-resume` |
| Task Management | `quick-task`, `new-enhancement` |
| Release Management | `version-bump`, `release`, `version` |
| Utilities | `update`, `dashboard`, `prompt-pipeline`, `session-analyzer` |

## Architecture: Hybrid Approach

Two new source locations, one unified build system.

### Build Phase (Phase 15)

6 execution/task management steps in `pipeline/build/`. These are the natural continuation of the pipeline — "you've finished planning, now build it."

### Tools Category

7 utility commands in `tools/`. These are orthogonal to the pipeline — usable at any time, not part of the sequential flow.

### Directory Structure

```
scaffold/
├── pipeline/
│   ├── vision/              # Phase 0 (existing)
│   ├── ...                  # Phases 1-14 (existing)
│   └── build/               # Phase 15 (NEW)
│       ├── single-agent-start.md
│       ├── single-agent-resume.md
│       ├── multi-agent-start.md
│       ├── multi-agent-resume.md
│       ├── quick-task.md
│       └── new-enhancement.md
│
├── tools/                   # NEW
│   ├── version-bump.md
│   ├── release.md
│   ├── version.md
│   ├── update.md
│   ├── dashboard.md
│   ├── prompt-pipeline.md
│   └── session-analyzer.md
│
├── knowledge/
│   ├── execution/           # NEW
│   │   ├── tdd-execution-loop.md
│   │   ├── worktree-management.md
│   │   ├── task-claiming-strategy.md
│   │   └── enhancement-workflow.md
│   └── tools/               # NEW
│       ├── release-management.md
│       ├── version-strategy.md
│       └── session-analysis.md
```

## Schema Changes

### PHASES Constant (`src/types/frontmatter.ts`)

Add one entry:

```typescript
{ number: 15, slug: 'build', displayName: 'Build' }
```

### MetaPromptFrontmatter — New Fields

```typescript
stateless: boolean          // default: false. When true, no completion state tracking.
category: 'pipeline' | 'tool'  // default: 'pipeline'. Source category.
```

**Why `stateless`?** These steps don't track pending→in_progress→completed state. They're invoked on-demand and always available. The name "stateless" is unambiguous and doesn't conflict with the existing rework/re-run semantics (which operate on stateful steps).

### Validation Changes (`src/project/frontmatter.ts`)

- `phase` becomes nullable — tools have `phase: null`
- `order` becomes nullable — tools have `order: null`
- When `category: 'tool'`: phase and order are optional/null
- When `category: 'pipeline'`: phase and order remain required
- `stateless` validated as boolean

## Build Phase Steps (Phase 15)

### Execution Steps

| Step | Order | Dependencies | Knowledge | Argument Hint |
|------|-------|-------------|-----------|---------------|
| `single-agent-start` | 1510 | `[implementation-playbook]` | `tdd-execution-loop`, `task-claiming-strategy` | — |
| `single-agent-resume` | 1520 | `[implementation-playbook]` | `tdd-execution-loop`, `task-claiming-strategy` | — |
| `multi-agent-start` | 1530 | `[implementation-playbook]` | `tdd-execution-loop`, `task-claiming-strategy`, `worktree-management` | `<agent-name>` |
| `multi-agent-resume` | 1540 | `[implementation-playbook]` | `tdd-execution-loop`, `task-claiming-strategy`, `worktree-management` | `<agent-name>` |

All four: `stateless: true`, `category: pipeline`, `phase: build`, `conditional: null`, `outputs: []` (these produce code in the target project, not scaffold artifacts)

### Task Management Steps

| Step | Order | Dependencies | Knowledge | Argument Hint |
|------|-------|-------------|-----------|---------------|
| `quick-task` | 1550 | `[implementation-playbook]` | `task-claiming-strategy` | `<task description>` |
| `new-enhancement` | 1560 | `[implementation-playbook]` | `enhancement-workflow`, `task-claiming-strategy` | `<enhancement description>` |

Both: `stateless: true`, `category: pipeline`, `phase: build`

Both get `reads: [create-prd, user-stories, coding-standards, tdd, project-structure]` to reference existing project docs.

### Enrichment from V1

**V1 problem**: Agent commands are ~10 lines saying "follow CLAUDE.md." If the project's CLAUDE.md is thin, agents flounder.

**V2 fix**: Knowledge entries inject deep execution expertise. Meta-prompt bodies include:
- Pre-flight verification checklist (git state, deps installed, test suite passes)
- Structured recovery procedures (stale branches, merge conflicts, failed CI)
- Conditional Beads support (detect `.beads/`, use `bd` commands if present, otherwise project task system)
- Agent resume steps: state check, PR sync, in-progress recovery

## Tools Category

### Tool Definitions

| Tool | Knowledge Entries | Argument Hint |
|------|------------------|---------------|
| `version-bump` | `version-strategy` | `<major\|minor\|patch\|--dry-run>` |
| `release` | `release-management`, `version-strategy` | `<version\|--dry-run\|rollback>` |
| `version` | — | — |
| `update` | — | — |
| `dashboard` | — | — |
| `prompt-pipeline` | — | — |
| `session-analyzer` | `session-analysis` | — |

### Tool Frontmatter Pattern

```yaml
name: release
description: Create a versioned release with changelog and GitHub release
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: [release-management, version-strategy]
argument-hint: "<version or --dry-run or rollback>"
```

### Enrichment

- `version-bump` & `release`: Extract domain expertise (semantic versioning, changelog best practices, conventional commit parsing) into knowledge entries.
- `version`, `update`, `dashboard`, `prompt-pipeline`: Lightweight utilities, no knowledge entries.
- `session-analyzer`: Extract session analysis patterns into knowledge entry.
- Conditional Beads support in `release` and `version-bump` for task cross-referencing in changelogs.

## Build System Changes

### Meta-Prompt Discovery (`src/core/assembly/meta-prompt-loader.ts`)

Extend to scan both directories:
```
pipeline/**/*.md  → category: 'pipeline' (existing)
tools/**/*.md     → category: 'tool' (new)
```

### Dependency Graph (`src/core/dependency/graph.ts`)

- Tools excluded from topological sort (no dependencies/order)
- Build phase steps included normally in the graph
- Both categories go through the same adapter output path → `commands/<slug>.md`

### State System

**Eligibility (`src/core/dependency/eligibility.ts`)**:
- Steps with `stateless: true` excluded from standard `scaffold next` results
- Build phase steps shown as "available (on-demand)" once their dependencies (phase 14) are met
- `scaffold status` shows build phase as "6 steps available (on-demand)" rather than "0/6 completed"

**State manager (`src/state/state-manager.ts`)**:
- `setStepStatus()` becomes a no-op for stateless steps
- `scaffold complete <stateless-step>` returns friendly message

### Navigation Behavior

| Category | `scaffold next` | `scaffold status` | State tracking |
|----------|----------------|-------------------|----------------|
| Pipeline (phases 0-14) | Shows when eligible + pending | Pending/in_progress/completed | Full |
| Build (phase 15) | Shows as "available" once deps met, always re-available | "Available (on-demand)" | None |
| Tools | Never shown | Not in pipeline progress | None |

**Resume step visibility**: `single-agent-resume` and `multi-agent-resume` conditionally shown in `scaffold next` — only when evidence of prior agent activity exists (feature branches, in-progress tasks).

## Knowledge Entries

### Execution Knowledge (`knowledge/execution/`)

**`tdd-execution-loop.md`**
- Topics: `[tdd, execution, testing, workflow]`
- Red-green-refactor cycle, commit timing, PR creation patterns, test-first discipline, handling flaky tests

**`task-claiming-strategy.md`**
- Topics: `[tasks, execution, agents, planning]`
- Task selection (lowest-ID unblocked), dependency awareness, multi-agent conflict avoidance, blocked task handling, conditional Beads integration

**`worktree-management.md`**
- Topics: `[git, worktrees, multi-agent, branching]`
- Setup, branching from `origin/main`, between-task cleanup, rebase strategy, worktree removal

**`enhancement-workflow.md`**
- Topics: `[enhancement, features, planning, discovery]`
- Impact analysis, documentation update strategy, innovation pass, task decomposition

### Tools Knowledge (`knowledge/tools/`)

**`release-management.md`**
- Topics: `[release, versioning, changelog, git]`
- Semantic versioning, conventional commit parsing, changelog format, quality gates, GitHub releases, rollback

**`version-strategy.md`**
- Topics: `[versioning, packages, ecosystems]`
- Version file detection across ecosystems, lock file sync, first-version bootstrapping, mismatch detection

**`session-analysis.md`**
- Topics: `[analysis, automation, sessions]`
- Pattern detection, session history parsing, automation recommendations

## Scaffold-Runner Skill Updates

### New Activation Triggers

```
- User says "start building", "begin implementation", "run agent", "start agent"
- User asks about tools: "bump version", "create a release", "show version"
- User says "what can I build?" or "what tools are available?"
```

### Phase Reference Table Addition

```
| build | Build | single-agent-start, single-agent-resume, multi-agent-start,
|       |       | multi-agent-resume, quick-task, new-enhancement |
```

### New Section: Stateless Step Execution

When executing a step with `stateless: true` (build phase or tool):
- **Skip** `scaffold complete <step>` (no-op)
- **Skip** "show what's next" flow
- **Instead**: Show execution summary, offer to run another build step or tool
- Agent resume steps: conditionally offered when evidence of prior activity exists

### New Section: Tool Execution

- Tools skip the `scaffold next` eligibility check (always available)
- Tools still go through preview → decision extraction → execution
- Tools support argument passthrough: `scaffold run release --dry-run`

### Updated Navigation Entries

| User Says | Action |
|---|---|
| "Start building" / "Begin implementation" | `scaffold run single-agent-start` |
| "Start multi-agent" / "Set up agents" | `scaffold run multi-agent-start <agent-name>` |
| "Quick task" / "Bug fix" / "Small fix" | `scaffold run quick-task <description>` |
| "New feature" / "Add enhancement" | `scaffold run new-enhancement <description>` |
| "Bump version" / "Version bump" | `scaffold run version-bump` |
| "Create release" / "Release" | `scaffold run release` |
| "What tools are available?" | `scaffold list --tools` |
| "Show version" | `scaffold run version` |

### Scaffold-Pipeline Skill Update

Add phase 15 (Build) to the pipeline reference table so users see the full pipeline including the build phase.

## Deleted Files

The 13 manually-maintained `commands/*.md` files are replaced by build-generated versions:
- `commands/single-agent-start.md`
- `commands/single-agent-resume.md`
- `commands/multi-agent-start.md`
- `commands/multi-agent-resume.md`
- `commands/quick-task.md`
- `commands/new-enhancement.md`
- `commands/version-bump.md`
- `commands/release.md`
- `commands/version.md`
- `commands/update.md`
- `commands/dashboard.md`
- `commands/prompt-pipeline.md`
- `commands/session-analyzer.md`

These will be regenerated by `scaffold build` from the new `pipeline/build/` and `tools/` source files.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Hybrid (phase + tools) | Execution is a pipeline continuation; utilities are orthogonal |
| Phase number | 15 "Build" | Natural successor to phase 14 Finalization |
| State tracking flag | `stateless: true` | Unambiguous, doesn't conflict with rework/re-run |
| Tool source location | `tools/` directory | Architecturally distinct from sequential pipeline |
| Tool schema | Same as pipeline + `category` field | Unified build system, one loader, one validator |
| Agent enrichment | Full knowledge injection | Self-contained execution guides, not dependent on project CLAUDE.md quality |
| Beads support | Conditional (detect if present) | Matches existing pipeline step pattern |
| Build step navigation | In `scaffold next` once phase 14 complete | Natural "what's next" answer after documentation is done |
| Resume visibility | Conditional on prior activity | Smart UX — don't show resume when nothing to resume |

## Files Changed Summary

**New files (20):**
- `pipeline/build/` — 6 meta-prompt files
- `tools/` — 7 meta-prompt files
- `knowledge/execution/` — 4 knowledge entries
- `knowledge/tools/` — 3 knowledge entries

**Modified files (~8):**
- `src/types/frontmatter.ts` — PHASES constant + schema fields
- `src/project/frontmatter.ts` — validation for nullable fields, new fields
- `src/cli/commands/build.ts` — dual-directory scanning
- `src/core/assembly/meta-prompt-loader.ts` — scan `tools/` directory
- `src/core/dependency/eligibility.ts` — stateless handling, build phase in `next`
- `src/core/dependency/graph.ts` — exclude tools from topological sort
- `src/state/state-manager.ts` — no-op for stateless steps
- `skills/scaffold-runner/SKILL.md` — stateless step awareness, tool execution, new navigation entries
- `skills/scaffold-pipeline/SKILL.md` — add phase 15 reference

**Deleted files (13):**
- 13 manually-maintained `commands/*.md` files (replaced by build output)
