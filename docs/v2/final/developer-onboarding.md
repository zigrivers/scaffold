# Scaffold v2 — Developer Onboarding Guide

**Phase**: final
**Depends on**: All frozen phase artifacts
**Last updated**: 2026-03-16
**Status**: draft

---

## 1. Purpose

Scaffold v2 is a TypeScript CLI tool that assembles tailored prompts at runtime to scaffold software projects with AI. It replaces v1's monolithic 29 hard-coded prompts with a composable system: **meta-prompts** (30–80 line intent declarations) combine with **knowledge base** files and **methodology configuration** to produce context-aware prompts on every invocation.

The two core insights driving v2 are: (1) AI can generate prompts at runtime from intent declarations — no need to maintain hundreds of lines of hard-coded prompt text; and (2) users need methodology tiers — a hackathon project and an enterprise system need fundamentally different preparation levels.

Three user personas shape the design: **Alex** (solo AI-first developer wanting fast MVP scaffolding), **Jordan** (team lead standardizing AI workflows across engineers), and **Sam** (experienced engineer building production-quality solo projects who needs selective depth).

## 2. Architecture Overview

### 2a. The Big Idea

Scaffold v2 is a **runtime assembly engine**. Each pipeline step is defined by a meta-prompt (30–80 lines declaring intent, inputs, outputs, and quality criteria) rather than containing executable prompt text. At runtime, the CLI combines the meta-prompt with relevant knowledge base entries, project context (prior artifacts, state, decisions), methodology settings (depth 1–5), and user instructions to construct a complete 7-section prompt. The AI then generates and executes a working prompt from that assembled input. Nothing is hard-coded.

### 2b. Component Inventory

| Component | Role |
|-----------|------|
| **CLI Shell** | Command dispatch (15 commands), argument parsing, output formatting (interactive / JSON / auto modes) |
| **Assembly Engine** | Core orchestrator — executes the 9-step runtime assembly sequence |
| **Runtime Engine** | State manager (atomic writes to `state.json`), lock manager (advisory `lock.json`), decision logger (append-only `decisions.jsonl`) |
| **Meta-Prompt Library** | 36 frontmatter files in `pipeline/` declaring step intent, dependencies, outputs, and scaling rules |
| **Knowledge Base** | 37 domain expertise files in `knowledge/` organized by topic, reusable across steps |
| **Methodology Configs** | 3 YAML presets (`deep.yml`, `mvp.yml`, `custom-defaults.yml`) controlling step enablement and depth |
| **Platform Adapters** | Thin delivery wrappers for Claude Code, Codex, and universal markdown |

### 2c. The 9-Step Execution Sequence

Here's what happens when a user runs `scaffold run create-prd`:

1. **Load meta-prompt** — Read `pipeline/pre/create-prd.md`. Extract frontmatter: purpose, dependencies, outputs, knowledge-base references, methodology scaling rules.

2. **Check prerequisites** — Verify dependencies are satisfied (no prior steps needed for `create-prd`). Check no other step is `in_progress` (lock contention). Confirm the step is enabled in the current methodology.

3. **Load knowledge base entries** — Read the knowledge base files listed in the meta-prompt's `knowledge-base` frontmatter field (e.g., `knowledge/product/prd-craft.md`).

4. **Gather project context** — Collect completed artifacts from prior steps (none yet for `create-prd`), `.scaffold/config.yml` (methodology, platforms, project metadata), `.scaffold/state.json` (pipeline status), and `.scaffold/decisions.jsonl` (prior decisions).

5. **Load user instructions** — Read `.scaffold/instructions/global.md` (applies to all steps), `.scaffold/instructions/create-prd.md` (step-specific), and the `--instructions` flag value (inline). Later layers override earlier ones.

6. **Determine depth** — Resolve the depth level (1–5) via the precedence chain: CLI `--depth` flag > per-step override in `config.yml` > custom default depth > preset default depth.

7. **Construct assembled prompt** — Build the 7-section prompt: System framing → Meta-prompt content → Knowledge base entries → Project context → Methodology (depth + scaling guidance) → User instructions → Execution instruction.

8. **AI generates and executes** — The AI reads the assembled prompt, generates a working prompt tailored to this project's context and methodology, and executes it in a single turn.

9. **Update state** — Mark `create-prd` as completed in `state.json`, record any decisions to `decisions.jsonl`, and display the next eligible step(s).

If `create-prd` had already been completed and the user re-runs it, the assembly engine detects **update mode**: the existing artifact is included in the context section so the AI can produce targeted updates rather than regenerating from scratch (see [ADR-048](../adrs/ADR-048-update-mode-diff-over-regeneration.md)).

### 2d. Key Architectural Decisions

| ADR | Decision |
|-----|----------|
| [ADR-001](../adrs/ADR-001-cli-implementation-language.md) | Node.js/TypeScript as the implementation language — npm distribution, full JS ecosystem |
| [ADR-003](../adrs/ADR-003-standalone-cli-source-of-truth.md) | CLI as source of truth — no server, no database, all state in local files |
| [ADR-009](../adrs/ADR-009-kahns-algorithm-dependency-resolution.md) | Kahn's algorithm with phase tiebreaker for deterministic dependency resolution |
| [ADR-012](../adrs/ADR-012-state-file-design.md) | File-based state — map-keyed JSON, git-committed, atomic writes |
| [ADR-041](../adrs/ADR-041-meta-prompt-architecture.md) | **Meta-prompt architecture** over hard-coded prompts — the pivotal shift that superseded 7 prior ADRs |
| [ADR-044](../adrs/ADR-044-runtime-prompt-generation.md) | Runtime generation over build-time — assembled prompts always reflect latest project state |
| [ADR-045](../adrs/ADR-045-assembled-prompt-structure.md) | Fixed 7-section assembled prompt structure — consistent, human-inspectable, precedence-respecting |
| [ADR-047](../adrs/ADR-047-user-instruction-three-layer-precedence.md) | Three-layer user instruction precedence — global, per-step, and inline with inline winning |
| [ADR-019](../adrs/ADR-019-advisory-locking.md) | Advisory file-based locking — PID-based stale detection, prevents concurrent execution |
| [ADR-055](../adrs/ADR-055-backward-compatibility-contract.md) | Backward compatibility contract — unknown fields produce warnings not errors, v1 migration supported |

Start with [ADR-041](../adrs/ADR-041-meta-prompt-architecture.md) — it explains why the entire layering/injection/marker architecture from the original v2 design was replaced.

## 3. Key Patterns

### 3a. File-Based State Management

All persistence is flat files in `.scaffold/`:

| File | Format | Purpose | Git |
|------|--------|---------|-----|
| `state.json` | Map-keyed JSON | Pipeline step statuses, completion timestamps, crash recovery marker | Committed |
| `config.yml` | YAML | Methodology, platforms, custom depth overrides | Committed |
| `decisions.jsonl` | JSONL (one object per line) | Append-only decision log with sequential IDs (`D-001`, `D-002`, ...) | Committed |
| `lock.json` | JSON | Advisory lock with PID, hostname, command | Gitignored |

**Atomic writes**: State changes write to a temp file then rename — prevents corruption if the process crashes mid-write. **Forward compatibility**: Unknown fields produce warnings, not errors ([ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md)). **Full schemas**: See [data/](../data/).

### 3b. Meta-Prompt Frontmatter

Every pipeline step is a markdown file with YAML frontmatter:

```yaml
---
name: create-prd
description: Create a product requirements document from an idea
phase: pre
order: 1
dependencies: []
outputs:
  - docs/prd.md
knowledge-base:
  - prd-craft
---
```

The body contains an **intent declaration** — purpose, inputs, expected outputs, quality criteria, and methodology scaling rules. It does NOT contain the full prompt text. The assembly engine combines this with knowledge base content at runtime. Full schema: [data/frontmatter-schema.md](../data/frontmatter-schema.md).

### 3c. Methodology and Depth

Three methodology presets control which steps are active and at what depth:

| Preset | Steps Enabled | Default Depth | Use Case |
|--------|---------------|---------------|----------|
| `deep` | All 36 | 5 | Comprehensive enterprise-grade scaffolding |
| `mvp` | ~7 core steps | 1 | Fast prototype scaffolding |
| `custom` | All 36 (user overrides) | 3 | Selective depth per step |

Depth is an integer scale 1–5 where 1 = minimal and 5 = comprehensive. Per-step overrides are allowed via `config.yml`. Methodology is changeable mid-pipeline ([ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md)). Full model: [domain-models/16-methodology-depth-resolution.md](../domain-models/16-methodology-depth-resolution.md).

### 3d. Pipeline State Machine

Steps move through: `pending` → `in_progress` → `completed` (or `skipped`). Additional transitions support re-runs and crash recovery:

- `pending → skipped`: via `scaffold skip <step>`
- `in_progress → pending`: crash recovery when artifacts are absent
- `skipped → in_progress`: un-skip by running the step
- `completed → in_progress`: re-run for updates

**Crash recovery** uses dual completion detection: if `in_progress` is set when the CLI starts, it checks whether artifacts exist on disk. Artifacts present + state incomplete = auto-mark complete. Artifacts absent = recommend re-run. See [domain-models/03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md).

### 3e. Dependency Resolution

Kahn's algorithm produces the canonical execution order from `depends-on` declarations in meta-prompt frontmatter. Phase index is the primary tiebreaker; alphabetical slug is the secondary tiebreaker for determinism.

- Both `completed` and `skipped` steps satisfy dependencies
- Cycle detection → `DEP_CYCLE_DETECTED` error
- Missing targets → `DEP_TARGET_MISSING` error
- Parallel sets identify steps that can run concurrently

Full model: [domain-models/02-dependency-resolution.md](../domain-models/02-dependency-resolution.md).

### 3f. Error Handling

Errors use structured codes organized by component prefix (`CONFIG_*`, `FIELD_*`, `DEP_*`, `STATE_*`, `LOCK_*`, `STEP_*`, etc.). The pattern is:

1. Lead with **what went wrong** — "Unknown methodology 'clasic'"
2. Include the **specific value** and **file/location** — "in .scaffold/config.yml"
3. End with **how to fix** — "Valid options: deep, mvp, custom"
4. Suggest **fuzzy matches** for typos — "Did you mean 'classic'?" (Levenshtein distance ≤ 2)

Exit codes: 0 (success), 1 (validation/config error), 2 (dependency/prerequisite error), 3 (lock contention), 4 (user cancellation), 5 (assembly failure). Full catalog: [ux/error-messages.md](../ux/error-messages.md).

### 3g. CLI Output Contract

Three output modes:

| Mode | Flag | Behavior |
|------|------|----------|
| Interactive | (default) | Colored text, progress indicators, confirmation prompts |
| JSON | `--format json` | Machine-readable envelope: `{ success, command, data, errors, warnings }` |
| Auto | `--auto` | Suppresses prompts, uses safe defaults (does NOT imply `--force`) |

Human-readable output goes to stdout. Diagnostics and errors go to stderr. Full contract: [api/cli-contract.md](../api/cli-contract.md).

### 3h. Testing Pattern

TDD is mandatory: Red → Green → Refactor → Commit. The test stack:

| Tool | Purpose |
|------|---------|
| Vitest | Test runner, assertions, mocking |
| v8 provider | Code coverage (branch/statement/line) |
| Vitest benchmark | Performance testing against p95 budgets |

Unit tests are co-located (`*.test.ts` next to source). Integration tests live in `tests/integration/`. E2E tests in `tests/e2e/`. Shared helpers: `createTestProject()`, `createTestConfig()`, `createTestState()`, `createTestDecision()`. Full strategy: [testing-strategy.md](../testing-strategy.md).

## 4. Getting Started

### 4a. Prerequisites

- **Node.js 18+** (22+ recommended for Codex development) — check with `node --version`
- **npm 9+** — check with `npm --version`
- **Git 2.x+** — check with `git --version`

### 4b. Setup

```bash
git clone <repo-url>
cd scaffold
npm install
npm run build
npm test          # Verify everything works — all tests should pass
```

### 4c. Key npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm test` | `vitest run` | Run all unit + integration tests |
| `npm run test:coverage` | `vitest run --coverage` | Tests with v8 coverage report |
| `npm run test:e2e` | `vitest run --config vitest.e2e.config.ts` | End-to-end tests |
| `npm run test:bench` | `vitest bench` | Performance benchmarks |
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm run lint` | `eslint src/` | Lint source files |
| `npm run type-check` | `tsc --noEmit` | Type-check without emit |
| `npm run check` | All gates combined | Local equivalent of full CI |

### 4d. Verification

Setup is successful when:
- `npm test` — all tests pass
- `npm run check` — exits 0 with no errors

## 5. Common Tasks

### 5a. Picking Up a Task

1. Read [implementation/task-breakdown.md](../implementation/task-breakdown.md) to understand the full 55-task graph across 8 phases
2. Identify unblocked tasks — check the dependency column; a task is unblocked when all its dependencies are completed
3. Read the task's acceptance criteria carefully — these map directly to test cases
4. Read all referenced docs: the task description links to domain models, ADRs, data schemas, and API contracts

### 5b. Implementing a New Component

For example, implementing the StateManager (T-007):

1. Read the domain model: [domain-models/03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md)
2. Read the TypeScript API spec: [api/internal-interfaces.md](../api/internal-interfaces.md) — find the `StateManager` class interface
3. Read the data schema: [data/state-json-schema.md](../data/state-json-schema.md) — understand the persistence format
4. Write failing tests first (TDD) using `createTestProject()` and `createTestState()` helpers
5. Implement to pass tests — use atomic writes (temp file + rename), validate schema on read
6. Run `npm run check` to verify all gates pass

### 5c. Adding a CLI Command

1. Read the command spec in [api/cli-contract.md](../api/cli-contract.md) — signatures, flags, exit codes
2. Read the command structure in [domain-models/09-cli-architecture.md](../domain-models/09-cli-architecture.md)
3. Read output formatting in [ux/cli-output-formats.md](../ux/cli-output-formats.md)
4. Read error codes in [ux/error-messages.md](../ux/error-messages.md)
5. Write tests covering: happy path, at least 1 error path with correct exit code, JSON output mode, auto mode behavior
6. Implement, verify with `npm run check`

### 5d. Working with Data Schemas

1. Read the relevant schema in [data/](../data/) (e.g., `state-json-schema.md`, `config-yml-schema.md`)
2. Use atomic write pattern for state mutations: write to `<file>.tmp`, then `fs.rename()` to `<file>`
3. Implement forward compatibility: unknown fields produce warnings, not errors ([ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md))
4. Write validation tests against edge cases: empty files, missing fields, extra fields, type mismatches

### 5e. Running Tests

```bash
npm test                                        # Full unit + integration suite
npx vitest run path/to/file.test.ts             # Single file
npx vitest path/to/file.test.ts                 # Watch mode (single file)
npm run test:coverage                           # With v8 coverage report
npm run test:e2e                                # End-to-end tests
npm run test:bench                              # Performance benchmarks
```

### 5f. Development Workflow

1. Branch from main: `git checkout -b type/short-description origin/main`
2. Write failing test → implement → refactor → commit (`type(scope): description`)
3. Run `npm run check` before pushing
4. Push and create PR: `git push -u origin HEAD && gh pr create`
5. Wait for CI, then squash-merge: `gh pr merge --squash --delete-branch`

See [../../git-workflow.md](../../git-workflow.md) for the full workflow including branch naming, commit format, and conflict prevention.

## 6. Where to Find Things

### 6a. Documentation Map

```
docs/v2/
├── scaffold-v2-prd.md              # Single source of truth — problem, goals, architecture, NFRs
├── README.md                       # Document conventions, cross-reference patterns
├── testing-strategy.md             # TDD approach, Vitest stack, coverage targets, quality gates
├── operations-runbook.md           # Dev setup, CI/CD pipeline, release process, npm distribution
├── security-practices.md           # Threat model (STRIDE), trust boundaries, dependency policy
│
├── domain-models/                  # Phase 1 — 13 current domain models (+ index)
│   ├── index.md                    # Domain model registry with status
│   ├── 02-dependency-resolution.md # Kahn's algorithm, cycle detection, eligibility
│   ├── 03-pipeline-state-machine.md# State transitions, crash recovery, completion detection
│   ├── 09-cli-architecture.md      # 15 CLI commands, output modes, exit codes
│   ├── 15-assembly-engine.md       # Core orchestrator — 9-step assembly sequence
│   ├── 16-methodology-depth-resolution.md # Presets, depth scale, precedence chains
│   └── ...                         # 8 more models (config, locking, frontmatter, etc.)
│
├── adrs/                           # Phase 2 — 55 Architecture Decision Records
│   ├── index.md                    # Full ADR index with dependency graph
│   ├── ADR-041-meta-prompt-architecture.md  # The pivotal shift — read this first
│   ├── ADR-044-runtime-prompt-generation.md # Runtime vs build-time
│   ├── ADR-045-assembled-prompt-structure.md # 7-section format
│   └── ...                         # 52 more ADRs
│
├── architecture/                   # Phase 3
│   └── system-architecture.md      # Component inventory, execution sequence, extension points
│
├── data/                           # Phase 4 — 8 data schema documents
│   ├── state-json-schema.md        # Pipeline state persistence
│   ├── config-yml-schema.md        # User configuration
│   ├── decisions-jsonl-schema.md   # Append-only decision log
│   ├── lock-json-schema.md         # Advisory lock format
│   ├── frontmatter-schema.md       # Meta-prompt YAML frontmatter
│   ├── manifest-yml-schema.md      # Methodology preset format
│   ├── knowledge-entry-schema.md   # Knowledge base entry format
│   └── secondary-formats.md        # Tracking comments, ownership markers
│
├── api/                            # Phase 5 — API contracts
│   ├── cli-contract.md             # Command signatures, flags, exit codes, JSON envelope
│   ├── internal-interfaces.md      # TypeScript public APIs (12 modules)
│   ├── adapter-interface.md        # Platform adapter contract
│   └── json-output-schemas.md      # Per-command JSON output shapes
│
├── ux/                             # Phase 6 — User experience specs
│   ├── error-messages.md           # Error code catalog (100+ codes, 18 components)
│   ├── cli-output-formats.md       # Interactive, JSON, auto mode formatting
│   ├── init-wizard-flow.md         # Init wizard question flow
│   ├── adopt-flow.md               # Brownfield adoption flow
│   └── dashboard-spec.md           # HTML dashboard specification
│
├── implementation/                 # Phase 7
│   └── task-breakdown.md           # 55 tasks, 8 phases, critical path, parallelism
│
├── validation/                     # Validation phase — 7 audit documents
│   ├── cross-phase-consistency.md
│   ├── traceability-matrix.md
│   ├── decision-completeness.md
│   ├── critical-path-walkthrough.md
│   ├── implementability-dry-run.md
│   ├── dependency-graph-validation.md
│   └── scope-creep-check.md
│
├── reference/                      # Historical reference documents
├── archive/                        # Superseded documents (domain models 01, 04, 12 + others)
└── final/                          # Finalization phase
    └── developer-onboarding.md     # This file
```

### 6b. Key Files

These are the 10 documents you'll reference most often during implementation:

| Document | Why You Need It |
|----------|-----------------|
| [scaffold-v2-prd.md](../scaffold-v2-prd.md) | Single source of truth — problem, goals, architecture, NFRs |
| [implementation/task-breakdown.md](../implementation/task-breakdown.md) | What to build — 55 tasks with acceptance criteria and dependencies |
| [api/internal-interfaces.md](../api/internal-interfaces.md) | TypeScript API contracts for all 12 modules |
| [api/cli-contract.md](../api/cli-contract.md) | User-facing command specs — signatures, flags, exit codes |
| [domain-models/15-assembly-engine.md](../domain-models/15-assembly-engine.md) | Core orchestrator — the 9-step assembly sequence in detail |
| [data/state-json-schema.md](../data/state-json-schema.md) | State persistence format — step statuses, crash recovery marker |
| [data/config-yml-schema.md](../data/config-yml-schema.md) | User configuration — methodology, platforms, custom overrides |
| [testing-strategy.md](../testing-strategy.md) | How to write tests — TDD rules, helpers, coverage targets |
| [adrs/index.md](../adrs/index.md) | All 55 architectural decisions — find the "why" behind any design choice |
| [ux/error-messages.md](../ux/error-messages.md) | Error code catalog — codes, messages, exit codes by component |

### 6c. Reading Order for New Developers

1. **This onboarding guide** — you're here
2. **PRD sections 1–4** ([scaffold-v2-prd.md](../scaffold-v2-prd.md)) — problem, core insights, goals, architecture overview
3. **ADR-041** ([adrs/ADR-041-meta-prompt-architecture.md](../adrs/ADR-041-meta-prompt-architecture.md)) — the meta-prompt pivot that shaped the entire system
4. **Assembly engine** ([domain-models/15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — how prompts are constructed at runtime
5. **Task breakdown** ([implementation/task-breakdown.md](../implementation/task-breakdown.md)) — what you'll build, in what order
6. **Internal interfaces** ([api/internal-interfaces.md](../api/internal-interfaces.md)) — TypeScript APIs you'll implement
7. **Testing strategy** ([testing-strategy.md](../testing-strategy.md)) — how to write tests (TDD is mandatory)
8. **Relevant domain model for your first task** — found via task description cross-references

### 6d. When You Need to Look Something Up

| Question | Go To |
|----------|-------|
| What does command X do? | [api/cli-contract.md](../api/cli-contract.md) |
| What's the TypeScript API for component Y? | [api/internal-interfaces.md](../api/internal-interfaces.md) |
| What format is file Z? | [data/](../data/) (8 schema documents) |
| Why was decision D made? | [adrs/ADR-NNN-*.md](../adrs/) (55 ADRs) |
| How does domain concept C work? | [domain-models/NN-*.md](../domain-models/) (13 current models) |
| What error code should I use? | [ux/error-messages.md](../ux/error-messages.md) |
| What does the output look like? | [ux/cli-output-formats.md](../ux/cli-output-formats.md) |
| What are the acceptance criteria for task T? | [implementation/task-breakdown.md](../implementation/task-breakdown.md) |
| How do I branch, commit, create PRs? | [../../git-workflow.md](../../git-workflow.md) |

## 7. Troubleshooting

**Circular dependency errors in implementation** — Check [domain-models/02-dependency-resolution.md](../domain-models/02-dependency-resolution.md) for how Kahn's algorithm handles cycles. The `DEP_CYCLE_DETECTED` error includes the specific cycle chain. Verify your meta-prompt's `dependencies` field doesn't create a loop.

**Unclear which ADR applies** — Start from [adrs/index.md](../adrs/index.md). Each ADR has "Relates to" and "Superseded by" fields. If an ADR is marked as superseded, follow the chain to the current decision (often ADR-041).

**Conflict between two docs** — The PRD wins. Per [README.md](../README.md), `scaffold-v2-prd.md` is the single source of truth. If a domain model or ADR contradicts the PRD, the PRD takes precedence.

**Superseded domain models** — Domain models 01 (Prompt Resolution & Layer Merging), 04 (Mixin Architecture), and 12 (Platform Adapter Layer) are archived in `archive/domain-models/`. They were superseded by ADR-041's meta-prompt pivot. If you find references to three-layer resolution, mixin injection, or abstract task verbs, follow the ADR-041 trail instead.

**Missing data schema details** — Check [data/secondary-formats.md](../data/secondary-formats.md) for formats not covered by the 7 primary schema docs (tracking comments, ownership markers, tool-map configuration).

**Task dependency confusion** — The critical path is 10 tasks: T-001 → T-002 → T-004 → T-006 → T-012 → T-017 → T-018 → T-029 → T-052 → T-053. Parallelism notes in [implementation/task-breakdown.md](../implementation/task-breakdown.md) show which tasks can run concurrently within each phase (up to 5 in Phase 1, 10+ in Phase 4).

**Tests fail after setup** — Ensure Node.js 18+ is installed (`node --version`). Run `npm ci` (not `npm install`) to get deterministic dependency versions. If specific tests fail, check whether they depend on fixtures in `tests/fixtures/` that may need to be created by a prerequisite task.

**State corruption during development** — If `state.json` becomes malformed during testing, `scaffold reset` deletes it (preserving `config.yml`). For investigation, the state manager includes a regeneration algorithm that rebuilds state from filesystem artifacts, though it loses timestamps and actor attribution.
