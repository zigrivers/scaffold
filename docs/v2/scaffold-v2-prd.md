# Scaffold v2 — Product Requirements Document

**Date:** 2026-03-14
**Status:** Authoritative
**Authors:** Ken Allred + Claude

---

## Document Control

**This document is the SINGLE SOURCE OF TRUTH for scaffold v2.** All other v2 documents (domain models, ADRs, data schemas, API contracts, UX specs) are subordinate. When any v2 document conflicts with this PRD, this PRD wins.

### Supersedes

| Document | Disposition |
|----------|-------------|
| `docs/superpowers/specs/2026-03-12-scaffold-v2-modular-cross-platform-design.md` | Original v2 spec. Non-conflicting content (personas, NFRs, state management, brownfield, distribution, risks, success metrics) carried forward into this PRD. Architecture, pipeline, config, and CLI sections superseded by meta-prompt architecture. |
| `docs/superpowers/specs/2026-03-14-meta-prompt-architecture-design.md` | Meta-prompt architecture design. All architectural content carried forward as authoritative. This PRD consolidates and extends it. |

### Revision History

| Date | Change |
|------|--------|
| 2026-03-14 | Initial consolidated PRD merging original v2 spec with meta-prompt architecture |

---

## 1. Problem Statement

Scaffold v1 is a monolithic 29-prompt pipeline tightly coupled to Claude Code and opinionated about tooling (Beads, worktrees, strict TDD). This limits adoption across several dimensions:

- **Audience**: Solo devs doing a weekend hack don't need the same pipeline as teams running parallel agents.
- **Opinionation**: Some users want lighter guidance they can adapt.
- **Tool dependencies**: Requiring Beads limits adoption.
- **Scale**: Not every project needs 29 prompts across 7 phases.
- **Methodology**: The current process is one approach; deep domain modeling, lean MVP, and others are valid alternatives.
- **Platform**: Only works with Claude Code; users want to use Codex (and potentially other AI tools) alongside or instead of Claude Code.
- **Maintenance**: Hard-coded prompts in `prompts.md` are expensive to maintain, and the original v2 three-layer resolution system (base/override/extension with mixin injection) added architectural complexity without solving the core maintenance burden.

Two additional insights drive the v2 architecture:

1. **AI can generate prompts at runtime.** Instead of maintaining detailed hard-coded prompts, we describe the *intent* of each step and let AI generate the appropriate working prompt based on project context and methodology depth.
2. **Users need methodology tiers.** Not every project needs the same level of documentation rigor. A solo hackathon project and a complex enterprise system should go through fundamentally different levels of preparation.

---

## 2. Goals & Non-Goals

### Goals

1. **Methodology tiers**: Three presets (Deep Domain Modeling, MVP, Custom) controlling which pipeline steps are active and at what depth.
2. **Composability**: Meta-prompts + knowledge base + methodology configuration compose at runtime to produce tailored working prompts.
3. **Cross-platform**: Run the scaffold pipeline from Claude Code, Codex, or as standalone CLI output. Project artifacts work with any AI tool.
4. **Backward compatibility**: Existing v1 users can migrate via `scaffold init` or `scaffold adopt`.
5. **Reduced maintenance**: Meta-prompts (30-80 lines each) replace hard-coded prompts (200-500 lines each). Knowledge base improvements propagate to all methodologies automatically.

### Non-Goals

- Building a general-purpose project scaffolding tool (stays focused on AI-assisted development).
- Supporting every possible AI tool at launch (Claude Code + Codex first, others later).
- Community marketplace for methodologies (future consideration, not v2 scope).
- Automatic prompt execution without user confirmation in interactive mode.
- Prompt versioning or rollback within scaffold.
- Parallel step execution (steps run sequentially; parallel agents are for implementation, not pipeline setup).

---

## 3. User Personas

### Solo AI-First Developer ("Alex")

- **Goals**: Scaffold a new project quickly, get to implementation fast, use Claude Code or Codex agents for all coding work. Wants every document and configuration to be AI-optimized so agents can work autonomously.
- **Pain points with v1**: Has to manually skip optional prompts by remembering which ones don't apply. Runs the full pipeline even for a CLI tool that doesn't need half the prompts. Locked into Claude Code — can't use Codex.
- **Scaffold v2 value**: Pick MVP methodology (depth 1), get exactly the steps needed, run from either tool. Four steps to implementation handoff.

### Team Lead Adopting AI Workflows ("Jordan")

- **Goals**: Standardize how the team scaffolds projects. Wants a shared configuration that includes team-specific guidance (company coding standards, custom CI templates, internal design system). Pipeline must be repeatable and consistent across team members.
- **Pain points with v1**: No way to customize prompts or share configuration. Each team member runs the pipeline slightly differently. Onboarding is manual.
- **Scaffold v2 value**: Custom methodology with per-step depth. User instructions (global + per-step) inject team-specific guidance without forking scaffold. Config committed to git and shared.

### Experienced Engineer Going Solo ("Sam")

- **Goals**: Build a side project with production-quality architecture. Wants thorough design docs but doesn't need a team workflow. Uses AI agents heavily for implementation.
- **Pain points with v1**: The full pipeline is overkill for solo, but lite alternatives skip too much. No middle ground.
- **Scaffold v2 value**: Custom methodology: enable domain modeling and architecture at depth 3-4, skip team workflow steps, depth 1 for operations. Exactly the right level of preparation.

---

## 4. Architecture Overview

### Three Core Components

**Meta-Prompts** (32 files in `pipeline/`) — One per pipeline step. Each is a compact declaration (30-80 lines) of what the step should accomplish: purpose, inputs, outputs, quality criteria, and methodology-scaling rules. They do NOT contain the actual prompt text the AI executes.

**Knowledge Base** (32 files in `knowledge/`) — Domain expertise organized by topic. Contains what makes a good PRD, how to review an architecture document, what failure modes to check in API contracts, etc. Reusable across steps — multiple meta-prompts can reference the same knowledge entry.

**Methodology Configuration** (3 YAML preset files in `methodology/`) — Controls which pipeline steps are active and the depth level (1-5) for each. Three presets: Deep Domain Modeling (all steps, depth 5), MVP (minimal steps, depth 1), Custom (user picks steps and depth per step).

### Runtime Assembly (How They Interact)

```
User invokes: scaffold run <step> [--instructions "..."]
  -> CLI loads the meta-prompt for that step
  -> CLI checks prerequisites (dependencies, completion, lock)
  -> CLI loads relevant knowledge base entries (from meta-prompt frontmatter)
  -> CLI gathers project context (prior artifacts, config, state, decisions)
  -> CLI loads user instructions (global, per-step, and inline)
  -> CLI determines depth from methodology config
  -> CLI assembles everything into a single 7-section prompt
  -> AI generates a working prompt tailored to project + methodology
  -> AI executes the working prompt, producing output artifacts
  -> CLI updates pipeline state
```

### What This Replaces from the Original v2 Spec

| Original v2 Concept | Disposition |
|---------------------|-------------|
| Three-layer prompt resolution (base/override/extension) | **Replaced** by meta-prompt + knowledge base |
| Mixin injection (5 axes, marker replacement) | **Eliminated** — AI adapts natively from config + instructions |
| Build-time assembly (`scaffold build` resolving prompts) | **Replaced** by runtime assembly (`scaffold run` assembling on each invocation) |
| Abstract task verb markers | **Eliminated** — AI knows tool preferences from config |
| Methodology manifests with overrides/extensions | **Replaced** by simplified methodology YAML presets |
| Hard-coded prompt text in `prompts.md` and `commands/` | **Replaced** by meta-prompts declaring intent |

### What This Keeps from the Original v2 Spec

- Dependency resolution and pipeline ordering (Kahn's algorithm)
- Pipeline state machine (completion tracking, crash recovery, resumption)
- Brownfield mode / `scaffold adopt`
- CLAUDE.md management (reserved sections, size budget, pointer pattern)
- Decision log lifecycle (append-only JSONL)
- Pipeline execution locking (advisory lock with PID liveness)
- CLI command architecture (core structure kept; commands updated)
- Config schema (simplified — methodology + depth replaces mixin axes)
- Init wizard (simplified — methodology selection replaces mixin configuration)
- Platform adapter (simplified — thin delivery wrappers)

---

## 5. Pipeline Definition

### Pipeline Goal

Get the user from idea to the point where AI agents can begin implementation with comprehensive context.

### Complete Pipeline (32 steps)

#### Pre-Pipeline: Project Definition

| Step | Description | Conditional |
|------|-------------|-------------|
| `create-prd` | Product requirements document | No |
| `prd-gap-analysis` | Find gaps in requirements | No |

#### Phase 1: Domain Modeling

| Step | Description | Conditional |
|------|-------------|-------------|
| `phase-01-domain-modeling` | Deep domain modeling — entities, aggregates, bounded contexts, domain events, invariants | No |
| `phase-01a-review-domain-modeling` | Review domain models for completeness, consistency, downstream readiness | No |

#### Phases 2-10: Core Documentation (each with review)

| Phase | Step | Review Step | Conditional |
|-------|------|-------------|-------------|
| 2 | Architecture Decision Records | 2a: Review ADRs | No |
| 3 | System Architecture Document | 3a: Review Architecture | No |
| 4 | Database Schema Design | 4a: Review Database | if-needed |
| 5 | API Contract Specification | 5a: Review API | if-needed |
| 6 | UI/UX Specification | 6a: Review UX | if-needed |
| 7 | Implementation Task Breakdown | 7a: Review Tasks | No |
| 8 | Testing & Quality Strategy | 8a: Review Testing | No |
| 9 | Operations & Deployment Runbook | 9a: Review Operations | No |
| 10 | Security Review and Document | 10a: Review Security | No |

#### Validation Phase (7 steps, can run in parallel)

| Step | Description |
|------|-------------|
| `cross-phase-consistency` | Naming, assumptions, data flows, interface contracts across all phases |
| `traceability-matrix` | Requirements through architecture to tasks |
| `decision-completeness` | All decisions recorded, justified, non-contradictory |
| `critical-path-walkthrough` | Critical user journeys end-to-end across all specs |
| `implementability-dry-run` | Specs dry-run as if you were the implementing agent |
| `dependency-graph-validation` | Acyclic, complete, correctly ordered |
| `scope-creep-check` | Specs aligned to PRD boundaries |

#### Finalization Phase (3 steps)

| Step | Description |
|------|-------------|
| `apply-fixes-and-freeze` | Address validation findings, mark docs as frozen |
| `developer-onboarding-guide` | Repo setup, architecture overview, key patterns |
| `implementation-playbook` | Task ordering, context for agents, handoff format, success criteria |

**Hand off to AI agents for implementation.**

### Conditional Step Evaluation

Steps marked `conditional: "if-needed"` (phases 4, 5, 6 and their reviews) are evaluated in two ways:

1. **Init wizard detection:** During `scaffold init`, the wizard examines project signals (existing database files, API routes, frontend frameworks, `project.platforms` config) and pre-sets conditional steps to enabled or disabled in config.
2. **User override:** Users can always manually enable or disable conditional steps via config. The wizard's detection is a suggestion, not a constraint.

Conditional steps that are disabled are skipped during `scaffold next` and `scaffold run` but remain visible in `scaffold list` (marked as skipped). Users can enable them later and run them at any point.

### Review Phase Pattern

Each review phase (1a through 10a) has its own meta-prompt and its own knowledge base entry encoding failure modes specific to that artifact type. Reviews are NOT generic — each targets the known ways that specific artifact type fails.

Each review:
1. Re-reads all artifacts from the phase
2. Checks against quality criteria from the phase's meta-prompt
3. Checks cross-references to prior phases' artifacts
4. Runs failure-mode-specific passes from the knowledge base
5. Identifies gaps, inconsistencies, ambiguities
6. Produces a prioritized issues list
7. Creates a fix plan
8. Executes fixes
9. Re-validates

### v1 Project Setup Steps: Folded Into Existing Phases

The v1 pipeline includes project-setup steps that are not separate phases in the new pipeline. They are folded into the phases where they naturally belong:

| v1 Step | Folded Into | Rationale |
|---------|-------------|-----------|
| Tech Stack | Phase 2: ADRs | Technology choices are architectural decisions |
| Coding Standards | Finalization: Implementation Playbook | Agents need these at implementation time |
| Project Structure | Phase 3: System Architecture | Directory layout is part of architecture |
| Dev Environment Setup | Phase 9: Operations & Deployment | Dev env is an operational concern |
| Git Workflow | Finalization: Implementation Playbook | Agents need branching/PR strategy when they start work |
| Design System | Phase 6: UI/UX Specification | Design system is part of UX spec (conditional, if-needed) |
| User Stories | Phase 7: Implementation Task Breakdown | Stories inform and become tasks |

---

## 6. Methodology System

### Three Presets

| | Deep Domain Modeling | MVP | Custom |
|---|---|---|---|
| **Who it's for** | Teams building complex/long-lived systems | Solo devs, hackathons, proofs of concept | Everyone else |
| **Steps** | All 32 steps active | 4 steps only | User chooses |
| **Depth** | 5 (maximum) at every step | 1 (minimum) at every step | User sets per step (1-5) |
| **Output volume** | Comprehensive docs, full analysis | Lean docs, just enough to start | Varies |

### Depth Scale (1-5)

| Depth | Name | Description |
|-------|------|-------------|
| 1 | MVP floor | Minimum viable artifact. Core decisions only, no alternatives analysis, brief rationale. |
| 2 | Lightweight | Key trade-offs noted but not explored in depth. |
| 3 | Balanced | Solid documentation. Alternatives considered for major decisions. Team-onboardable. |
| 4 | Thorough | Thorough analysis. Edge cases, risk assessment, detailed rationale. |
| 5 | Deep ceiling | Comprehensive. Full evaluation matrices, domain modeling, gap analysis, migration paths, operational considerations. |

### MVP Default Steps

**Enabled** (depth 1):
- `create-prd`
- `phase-07-implementation-tasks`
- `phase-08-testing-strategy`
- `implementation-playbook`

**Skipped**: All other steps (gap analysis, phases 1-6, all reviews, all validation, operations, security, developer onboarding, apply-fixes).

### Methodology is Changeable

Starting MVP does not lock you in. Users can:
- Re-run any step at a higher depth (triggers update mode)
- Enable previously skipped steps
- Switch methodologies entirely

The pipeline state tracks what is completed; re-running at higher depth triggers update mode in the meta-prompt.

---

## 7. Configuration

### `.scaffold/config.yml`

The build configuration file. Created by `scaffold init`, editable by hand, read by every CLI command. Committed to git.

```yaml
# .scaffold/config.yml
version: 2
methodology: deep | mvp | custom

# Only when methodology: custom
custom:
  default_depth: 3
  steps:
    create-prd:
      enabled: true
      depth: 4
    prd-gap-analysis:
      enabled: false
    phase-03-system-architecture:
      enabled: true
      depth: 2
    # Steps not listed inherit defaults

platforms: [claude-code]
project:
  name: "My Project"
  platforms: [web, mobile]       # Informs conditional steps
```

### Schema Changes from Original v2 Spec

| Removed | Reason |
|---------|--------|
| `mixins` object (5 axes) | Eliminated — AI adapts from config + instructions |
| `mixins.task-tracking` | User instructions or project config |
| `mixins.tdd` | User instructions |
| `mixins.git-workflow` | User instructions |
| `mixins.agent-mode` | User instructions |
| `mixins.interaction-style` | Derived from platform |

| Added | Purpose |
|-------|---------|
| `methodology` (deep/mvp/custom) | Top-level methodology selector |
| `custom` block | Per-step depth and enabled overrides |
| `project.platforms` | Informs conditional step detection |

### Write Strategy

Atomic (temp + rename). Unknown fields are preserved during write-back per ADR-033.

### Config Versioning

The `version` field (starting at 2 for the meta-prompt architecture) tracks the config schema version:
- Minor CLI updates do not change the config version — new optional fields may be added with defaults.
- Breaking config changes increment the version number.
- CLI checks the config version on every command: if old, auto-migrates; if newer than CLI supports, errors with "please update scaffold."

---

## 8. CLI Commands

### Primary Commands

| Command | Purpose | Lock |
|---------|---------|------|
| `scaffold init [idea]` | Methodology wizard (Deep/MVP/Custom), creates config + state | No |
| `scaffold run <step> [--instructions "..."]` | Assemble and execute a pipeline step | Yes |
| `scaffold next` | Show next unblocked step(s) | No |
| `scaffold status` | Show pipeline progress | No |
| `scaffold skip <step>` | Skip a step | Yes |
| `scaffold list` | Show full pipeline with status | No |
| `scaffold validate` | Check config, state, and artifacts | No |
| `scaffold build` | Generate thin command wrappers for platforms | No |
| `scaffold adopt` | Brownfield mode — scan existing codebase | Yes |
| `scaffold reset` | Reset pipeline state | Yes |
| `scaffold info <step>` | Show step details (meta-prompt, knowledge refs, depth) | No |
| `scaffold version` | Show version | No |
| `scaffold update` | Check for updates | No |
| `scaffold dashboard` | Generate HTML dashboard | No |
| `scaffold decisions` | Show decision log | No |

### Removed from Original v2 Spec

| Command | Reason |
|---------|--------|
| `scaffold add <axis> <value>` | Mixin axes eliminated |
| `scaffold resume` | Replaced by `scaffold run <step>` (explicit step selection) |
| `scaffold preview` | Assembly is transparent; `scaffold info` provides step details |

### Global Flags

| Flag | Description |
|------|-------------|
| `--format json` | Structured JSON output to stdout; human messages to stderr |
| `--auto` | Suppress interactive prompts; use safe defaults. Does NOT imply `--force` (ADR-036) |
| `--verbose` | Diagnostic output to stderr |
| `--root <path>` | Override project root detection |
| `--force` | Override advisory lock contention |
| `--help` | Show command usage |
| `--version` | Show version (alias for `scaffold version`) |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (warnings permitted) |
| 1 | Validation error (bad config, invalid frontmatter, bad arguments, dependency cycle) |
| 2 | Missing dependency (predecessor artifact not found, unmet dependency) |
| 3 | State corruption / lock contention |
| 4 | User cancellation |
| 5 | Build/assembly error |

### Output Modes

- **Interactive** (default): Colored text, progress indicators, confirmation prompts.
- **JSON** (`--format json`): Single JSON envelope to stdout. No interactive prompts — exits with code 4 if confirmation needed and `--auto` not set.
- **Auto** (`--auto`): Suppresses interactive prompts, resolves with safe defaults.
- **Combined** (`--auto --format json`): For CI pipelines and agent automation.

---

## 9. Assembly Engine

The assembly engine is the core runtime component. It replaces the build-time resolution system from the original v2 spec with runtime prompt construction.

### Execution Sequence

When `scaffold run <step>` is invoked:

**Step 1: Load meta-prompt.** Read `pipeline/<step>.md` — the step's purpose, inputs, outputs, quality criteria, methodology scaling rules.

**Step 2: Check prerequisites.**
- Pipeline state: Is the step already completed? (Offer re-run in update mode.)
- Dependencies: Are all prior steps completed?
- Lock: Is another step currently running?

**Step 3: Load knowledge base entries.** Read the knowledge base files listed in the meta-prompt's `knowledge-base` frontmatter field. Multiple meta-prompts can reference the same knowledge entry.

**Step 4: Gather project context.**
- Completed artifacts (docs/*.md, etc.)
- `.scaffold/config.yml` (methodology, depth, project metadata)
- `.scaffold/state.json` (completion status, prior steps)
- `.scaffold/decisions.jsonl` (prior decisions)

**Step 5: Load user instructions.**
- `.scaffold/instructions/global.md` (if exists)
- `.scaffold/instructions/<step>.md` (if exists)
- `--instructions` flag value (if provided)

**Step 6: Determine depth.** Look up the step's depth level from methodology config (preset default or custom override).

**Step 7: Construct assembled prompt.** Build the 7-section prompt structure defined in ADR-045:
1. System section — role and task framing
2. Meta-prompt section — purpose, inputs, outputs, quality criteria
3. Knowledge base section — relevant domain expertise
4. Context section — project artifacts and state
5. Methodology section — depth level + scaling guidance
6. Instructions section — global + per-step + inline
7. Execution instruction — "Generate the working prompt, then execute it."

**Step 8: AI generates and executes.** The AI reads the assembled prompt, generates a working prompt tailored to the project + methodology + instructions, and executes it in a single turn. No intermediate approval gate — the meta-prompt's quality criteria and knowledge base provide sufficient guardrails (ADR-045).

**Step 9: Update state.** Mark step completed in `state.json`. Record decisions in `decisions.jsonl`. Show next available step(s).

### Update Mode

When a step is re-run on existing artifacts, the assembled prompt includes the existing artifact as additional context, and the meta-prompt's Mode Detection section instructs the AI to diff and propose targeted updates rather than regenerating from scratch.

---

## 10. User Instructions

Three-layer system for user customization, all optional:

### Layers

| Layer | Location | Scope | Persistence |
|-------|----------|-------|-------------|
| Global | `.scaffold/instructions/global.md` | All steps | Persistent, committed to git |
| Per-step | `.scaffold/instructions/<step-name>.md` | Single step | Persistent, committed to git |
| Inline | `--instructions "..."` flag | Single invocation | Ephemeral |

### Assembly Order

Later layers override earlier on conflict:

```
Meta-prompt + Knowledge base + Project context
  + Global instructions
    + Per-step instructions
      + Inline instructions
```

### Use Cases

- **Global**: "We use hexagonal architecture", "All APIs must be REST, no GraphQL", "Company coding standard: 2-space indentation, no semicolons"
- **Per-step**: "For domain modeling, pay special attention to the billing bounded context", "For ADRs, include a cost analysis section"
- **Inline**: "Focus on the auth flow for this run", "Skip the mobile considerations"

---

## 11. State Management

### `state.json`

`.scaffold/state.json` is the pipeline state machine's persistence file. It records which steps have been completed, skipped, are pending, or were interrupted mid-execution.

**Key properties:**
- Map-keyed by step name (not array) — merge-safe in git when multiple team members complete different steps concurrently
- Committed to git — enables team sharing and pipeline resumption across machines
- Atomic writes (temp + rename) — crash cannot corrupt the file

**Per-step entry fields:**
- `status`: One of `pending`, `in_progress`, `skipped`, `completed`
- `at`: ISO 8601 timestamp (set when completed or skipped)
- `produces`: Output artifact paths (copied from meta-prompt frontmatter)
- `artifacts_verified`: Boolean, set after artifact existence check
- `completed_by`: Actor identity for multi-agent attribution
- `depth`: The depth level used for this execution
- `reason`: Explanation for skipped steps

**Completion detection** uses a dual mechanism:
1. **Artifact-based** (primary): Check whether a step's `outputs` artifacts exist on disk. If all files exist, the step is considered complete.
2. **State-recorded** (secondary): `scaffold run` records completion after a step finishes.

When both mechanisms disagree, the artifact takes precedence — the step succeeded even if state was not updated (likely a session crash). When status says `completed` but artifacts are missing, warn and offer to re-run.

**Crash recovery:** When `in_progress` is non-null on the next `scaffold run` or `scaffold next`, the CLI checks whether the in-progress step's `outputs` artifacts all exist. If yes, mark completed and clear `in_progress`. If not, warn and offer to re-run.

For the complete formal schema definition, see `docs/v2/data/state-json-schema.md`.

### `decisions.jsonl`

`.scaffold/decisions.jsonl` is an append-only JSONL log persisting key decisions across sessions. JSONL format ensures git merges are trivial when multiple team members append decisions concurrently.

Each entry includes:
- Sequential ID (`D-001`, `D-002`, ...)
- Step name that produced the decision
- Decision text
- ISO 8601 timestamp
- Actor identity
- `prompt_completed` flag (false = provisional, may be from crashed session)

Downstream steps treat `prompt_completed: false` decisions as provisional.

For the complete formal schema definition, see `docs/v2/data/decisions-jsonl-schema.md`.

### `lock.json`

`.scaffold/lock.json` is an advisory lock file (gitignored — local only) preventing concurrent step execution.

- On entry: check for lock. If held and PID still running, warn. If PID dead, clear stale lock and proceed.
- On step completion: delete lock file.
- On crash: lock file remains (stale PID). Next command detects the dead process and clears automatically.
- `--force` flag: override the lock.

For the complete formal schema definition, see `docs/v2/data/lock-json-schema.md`.

---

## 12. Platform Delivery

Platform adapters are thin wrappers around the assembly engine. They do NOT transform prompt content — they wrap the assembly trigger in platform-specific format.

### Claude Code Plugin

Command files in `commands/` trigger assembly:

```markdown
---
description: "Run phase 3: system architecture"
---
Execute: scaffold run phase-03-system-architecture
```

Generated by `scaffold build` from meta-prompt inventory. Each command is a thin wrapper that invokes the assembly engine.

### Codex

`AGENTS.md` entries point to the assembly pipeline:

```markdown
## System Architecture
Run `scaffold run phase-03-system-architecture` to design system architecture.
```

### Universal / Manual

`scaffold run <step>` outputs the assembled prompt to stdout or a file. Users can paste it into any AI tool.

### Platform-Neutral Assembly

The assembled prompt is platform-neutral. The delivery adapter determines how it reaches the AI, but the prompt content is identical across platforms. This means:
- Improving a meta-prompt or knowledge base entry improves output on all platforms.
- No platform-specific prompt variants to maintain.
- New platforms require only a new thin wrapper, not prompt adaptation.

---

## 13. Init Wizard & Brownfield Mode

### Init Wizard

`scaffold init` runs through three phases:

**1. Detection phase** (automatic):
- Parses the `idea` argument for keyword signals
- Scans codebase for framework signals (v1 tracking comments, package manifests, source directories)
- Determines greenfield / brownfield / v1-migration mode
- Makes smart methodology suggestion

**2. Methodology selection** (interactive):
```
? Choose a methodology:
  > Deep Domain Modeling -- Comprehensive, all 32 steps at depth 5
    MVP -- Get to code fast, 4 steps at depth 1
    Custom -- Pick your own steps and depth levels
```

For Custom: presents step list with toggle (enabled/disabled) and depth (1-5) per step.

**3. Conditional step detection:**
- Examines project signals to suggest which conditional steps (database, API, UI) to enable
- User confirms or overrides

**4. Confirmation and write:**
- Displays summary of all selections
- Writes `.scaffold/config.yml`
- Initializes `.scaffold/state.json`
- Creates `.scaffold/decisions.jsonl` (empty)
- Creates `.scaffold/instructions/` directory
- Runs `scaffold build` to generate platform wrappers

### Brownfield Mode

For adding scaffold to an existing codebase that already has code, dependencies, and structure.

**Detection:** During `scaffold init`, if the directory contains package manifests with dependencies or source directories, scaffold asks: "This directory has existing code. Scaffold around it (brownfield) or start fresh (greenfield)?"

**Behavior:** The meta-prompt + knowledge base architecture handles brownfield naturally. The assembly engine includes existing project context (existing code, configs, docs) in the assembled prompt. The AI adapts its output to document and extend the existing codebase rather than scaffolding from scratch. No brownfield-specific prompt variants are needed.

### `scaffold adopt`

Dedicated entry point for existing codebases:
- Scans for: package manifests, `docs/` directory, README, test configs, CI configs
- Maps findings to scaffold steps: existing `docs/prd.md` marks `create-prd` as completed
- Generates `state.json` with pre-completed steps where artifacts exist
- Sets `mode: brownfield` in config
- Suggests running remaining steps

### v1 Project Detection

When `scaffold init` runs in a directory with v1 artifacts but no `.scaffold/` directory:
- Detects v1 artifacts using the `outputs` field from meta-prompt frontmatter
- Maps existing files to completed steps
- Creates config + state with inferred completion state
- Never modifies existing v1 artifacts
- User confirms before config is created

---

## 14. CLAUDE.md Management

The CLAUDE.md file in the target project is the primary agent instruction file for Claude Code. It accumulates content from multiple pipeline steps.

### Size Budget

CLAUDE.md should not exceed approximately 2,000 tokens (approximately 1,500 words). The file is a quick-reference pointer, not comprehensive documentation. Detailed standards live in dedicated docs files.

### Reserved Structure

The first pipeline step that creates CLAUDE.md establishes all section headings. Later steps fill their reserved sections:

```markdown
# CLAUDE.md

## Core Principles
<!-- scaffold:managed by create-prd -->

## Project Architecture
<!-- scaffold:managed by phase-03-system-architecture -->

## Key Commands
<!-- scaffold:managed by phase-09-operations -->

## Coding Standards Summary
<!-- scaffold:managed by implementation-playbook -->

## Git Workflow
<!-- scaffold:managed by implementation-playbook -->

## Testing
<!-- scaffold:managed by phase-08-testing-strategy -->
```

### Rules

- Each section has a named owner (the step that fills it).
- Steps fill their sections with a concise summary (2-5 bullet points) and a pointer to the full document.
- No step may add new `##`-level sections — content goes under existing sections or into dedicated `docs/` files.
- `<!-- scaffold:managed -->` markers indicate scaffold-owned sections. Implementation agents should not modify content between these markers.
- The finalization phase enforces the size budget and consolidates any drift.

---

## 15. Distribution

### npm (primary)

```bash
npm install -g @scaffold-cli/scaffold
# or without global install:
npx @scaffold-cli/scaffold init
```

Package structure:
```
@scaffold-cli/scaffold/
  bin/scaffold             # CLI entry point
  pipeline/                # Meta-prompts (32 files)
  knowledge/               # Knowledge base (32 files)
  methodology/             # Methodology presets (3 files)
  adapters/                # Platform adapter logic
  lib/                     # Shared utilities (assembly engine, state manager, etc.)
  package.json
```

### Homebrew (secondary)

```bash
brew tap zigrivers/scaffold
brew install scaffold
```

Formula pulls from npm or GitHub releases.

### Requirements

- **Node.js**: 18+ (for CLI). Codex already requires Node.js 22+.
- **Operating systems**: macOS and Linux. Windows via WSL expected to work but not tested.

### Backward Compatibility

The existing Claude Code plugin continues to work:
- Plugin commands become thin wrappers that call `scaffold run <step>`
- Users who never run `scaffold init` get current behavior unchanged
- The existing `commands/` directory in the scaffold repo serves as the pre-built output

---

## 16. Domain Model Reference

14 domain models document the v2 system. The meta-prompt architecture transformed, retired, or kept each:

| # | Domain | Status | Notes |
|---|--------|--------|-------|
| 01 | Layered Prompt Resolution | **Superseded** | Replaced by meta-prompt + knowledge base (ADR-041) |
| 02 | Dependency Resolution & Pipeline Ordering | **Kept** | Steps still have dependencies; Kahn's algorithm still valid |
| 03 | Pipeline State Machine | **Kept** | Completion tracking, crash recovery, resumption unchanged |
| 04 | Abstract Task Verb System | **Superseded** | AI knows tool preferences from config; no markers needed (ADR-041) |
| 05 | Platform Adapter System | **Transformed** | Simplified to thin delivery wrappers |
| 06 | Config Schema & Validation | **Transformed** | Mixin axes removed; methodology + depth added (ADR-043) |
| 07 | Brownfield Mode | **Kept** | Artifact detection unchanged |
| 08 | Meta-Prompt Frontmatter Schema | **Transformed** | Rewritten for meta-prompt frontmatter; section targeting removed (ADR-045) |
| 09 | CLI Command Architecture | **Transformed** | Added `run`, removed `add`, modified `build`/`init` |
| 10 | CLAUDE.md Management | **Kept** | Orthogonal to meta-prompts |
| 11 | Decision Log Lifecycle | **Kept** | Unchanged |
| 12 | Mixin Injection Mechanics | **Superseded** | Completely replaced by AI adaptation (ADR-041) |
| 13 | Pipeline Execution Locking | **Kept** | Unchanged |
| 14 | Init Wizard & Methodology Selection | **Transformed** | Methodology selection instead of mixin configuration (ADR-043) |

**Summary: 3 superseded, 6 kept, 5 transformed.**

For full domain model definitions, see `docs/v2/domain-models/`.

---

## 17. ADR Reference

### Kept (applicable to meta-prompt architecture)

| ADR | Topic |
|-----|-------|
| ADR-001 | Node.js as CLI implementation language |
| ADR-002 | Distribution strategy (npm + Homebrew) |
| ADR-003 | Standalone CLI as source of truth |
| ADR-004 | Methodology as top-level organizer (principle preserved, mechanism updated) |
| ADR-009 | Kahn's algorithm for dependency resolution |
| ADR-012 | state.json design (map-keyed, git-committed, atomic writes) |
| ADR-013 | decisions.jsonl format (append-only JSONL) |
| ADR-014 | Config schema versioning |
| ADR-017 | Tracking comments for artifact provenance |
| ADR-018 | Completion detection and crash recovery |
| ADR-019 | Advisory locking |
| ADR-020 | Skip vs. exclude semantics |
| ADR-021 | Sequential prompt execution |
| ADR-025 | CLI output contract |
| ADR-026 | CLAUDE.md section registry |
| ADR-027 | Init wizard smart suggestion |
| ADR-028 | Detection priority (file signals over keyword signals) |
| ADR-033 | Forward compatibility (unknown fields preserved) |
| ADR-034 | Re-run without cascade |
| ADR-036 | --auto does not imply --force |
| ADR-040 | Error handling philosophy |

### Superseded

| ADR | Topic | Superseded By |
|-----|-------|---------------|
| ADR-005 | Three-layer prompt resolution | ADR-041 (meta-prompt architecture) |
| ADR-006 | Mixin injection over templating | ADR-041 |
| ADR-007 | Mixin markers and subsection targeting | ADR-041 |
| ADR-008 | Abstract task verbs | ADR-041 |
| ADR-010 | Build-time resolution | ADR-044 (runtime prompt generation) |
| ADR-015 | Prompt frontmatter schema | ADR-045 (assembled prompt structure) |
| ADR-016 | Methodology manifest format | ADR-043 (depth scale) |

### New (meta-prompt architecture)

| ADR | Topic |
|-----|-------|
| ADR-041 | Meta-prompt architecture over hard-coded prompts |
| ADR-042 | Knowledge base as domain expertise layer |
| ADR-043 | Depth scale (1-5) over methodology-specific prompt variants |
| ADR-044 | Runtime prompt generation over build-time resolution |
| ADR-045 | Assembled prompt structure (7-section format) |
| ADR-046 | Phase-specific review criteria over generic review template |

For full ADR text, see `docs/v2/adrs/`.

---

## 18. Non-Functional Requirements

### Performance

- **Assembly time**: `scaffold run` assembles the prompt in under 500ms (load meta-prompt + knowledge + context + instructions, construct assembled prompt).
- **Step listing**: `scaffold list`, `scaffold status`, `scaffold next` complete in under 200ms.
- **State reads/writes**: Reading/writing `state.json` completes in under 100ms (file is under 20KB).
- **No background processes**: All operations are synchronous. No daemons, watchers, or background services.
- **Build time**: `scaffold build` (generating thin wrappers) completes in under 2 seconds.

### Reliability

- **Crash recovery**: If a session crashes mid-step, no data is lost. The step is not marked complete. `scaffold run` picks up where it left off.
- **State integrity**: `state.json` is written atomically (temp + rename). If corrupted, the CLI falls back to artifact-based completion detection and regenerates state.
- **Idempotent assembly**: Assembling the same step with the same inputs produces identical assembled prompts. Running `scaffold run` twice triggers update mode on the second run.
- **Merge-safe file formats**: All scaffold state files are designed for conflict-free git merges: `state.json` (map-keyed), `decisions.jsonl` (append-only JSONL), `config.yml` (flat structure).

### Compatibility

- **Operating systems**: macOS and Linux. Windows via WSL expected to work but not tested.
- **Node.js**: 18+ (for CLI).
- **Claude Code**: Requires plugin support. Specific minimum version TBD.
- **Codex**: Compatible with current Codex CLI. Adapter will be updated as Codex evolves.

### Security

- **No credential storage**: Scaffold does not store API keys, tokens, or credentials.
- **No network access**: The CLI makes no network requests (except `scaffold update` which pulls from npm/GitHub).
- **File permissions**: `.scaffold/` directory and contents use default file permissions.
- **User instructions are local**: `.scaffold/instructions/` files are committed to git and visible to the team. No hidden instruction injection.

---

## 19. Risks

1. **Knowledge base quality is critical.** The 32 knowledge base documents are the highest-effort, highest-value artifacts. The quality of the entire system depends on the domain expertise encoded in these files. They must be written with the same rigor as domain models — comprehensive expertise documents, not summaries or checklists.
   - **Mitigation**: Extract content from existing `prompts.md` (which contains deep domain knowledge). Write knowledge base entries iteratively, testing output quality at each step.

2. **Runtime prompt generation variability.** Different AI models or even different runs of the same model may produce different working prompts from the same assembled prompt. Output quality could vary.
   - **Mitigation**: Meta-prompt quality criteria and knowledge base expertise provide strong guardrails. The 7-section assembled prompt structure gives the AI sufficient scaffolding. Monitor output quality across runs and tighten quality criteria where variance is observed.

3. **Complexity for first-time users.** v2 adds concepts (methodologies, depth levels, user instructions) that did not exist in v1.
   - **Mitigation**: The default experience (`scaffold init`) is simpler than v1 — choose a methodology and go. MVP methodology gets users to implementation in 4 steps. Advanced features are opt-in.

4. **Cross-platform prompt quality divergence.** Assembled prompts optimized for Claude Code's tool-use capabilities may work poorly when used with Codex.
   - **Mitigation**: Assembled prompts are platform-neutral. Test on both platforms. The knowledge base can encode platform-specific guidance when needed.

5. **npm package name conflict.** The "scaffold" name is generic and may conflict with existing packages.
   - **Mitigation**: Research npm namespace availability as a prerequisite. Have backup candidates ready (`@scaffold-pipeline/cli`, `@zigrivers/scaffold`).

6. **Prompt content drift during v2 engine work.** Building the CLI and writing 64 meta-prompt + knowledge files is substantial. If content and engine are developed in parallel, conflicts occur.
   - **Mitigation**: Build assembly engine first (with stub content), then write meta-prompts and knowledge base entries.

---

## 20. Success Metrics

### Adoption

- **v1-to-v2 migration rate**: 80%+ of active v1 users migrate within 3 months.
- **New user onboarding**: First-time users complete `scaffold init` and execute 3+ steps in their first session.
- **Cross-platform usage**: 20%+ of v2 projects use both Claude Code and Codex within 6 months.

### Efficiency

- **Time to first implementation task**: Under 30 minutes for MVP methodology, under 120 minutes for Deep Domain Modeling.
- **Zero manual step skipping**: When using a built-in methodology, users should never need to manually skip steps.

### Quality

- **Pipeline completion rate**: 70%+ of started pipelines reach completion (all enabled steps done).
- **No regression in output quality**: Output artifacts maintain or exceed v1 quality. User feedback is the signal.
- **Knowledge base reuse**: Average knowledge base entry referenced by 2+ meta-prompts (validates the topic-organized design).

---

## 21. Migration Path

### Phase 1: Assembly Engine CLI

Build the core CLI and assembly engine. This is what we build next.

- Assembly engine (load meta-prompt + knowledge + context + instructions, construct assembled prompt)
- Core CLI commands: `scaffold init`, `scaffold run`, `scaffold next`, `scaffold status`, `scaffold skip`, `scaffold list`, `scaffold info`, `scaffold reset`, `scaffold version`
- Pipeline state management (`state.json`, `decisions.jsonl`, `lock.json`)
- Methodology presets (3 YAML files)
- Stub meta-prompts and knowledge base entries (enough to test the engine end-to-end)
- Config schema and validation
- npm packaging

### Phase 2: Platform Adapters

- Claude Code adapter (`scaffold build` generating thin command wrappers)
- Codex adapter (AGENTS.md generation)
- Universal adapter (stdout/file output)
- `scaffold adopt` and brownfield mode
- `scaffold dashboard`
- `scaffold validate` (cross-artifact validation)
- Smart methodology suggestion in init wizard

### Phase 3: Content

- Write all 32 meta-prompt files (extracting structure from existing `prompts.md`)
- Write all 32 knowledge base documents (extracting expertise from existing `prompts.md` and domain models)
- Test each step end-to-end on real projects
- Write methodology authoring guide for future presets

---

## 22. File & Directory Structure

```
scaffold/
  pipeline/                           # Meta-prompts (one per step)
    pre/
      create-prd.md
      prd-gap-analysis.md
    phase-01-domain-modeling.md
    phase-01a-review-domain-modeling.md
    phase-02-adrs.md
    phase-02a-review-adrs.md
    phase-03-system-architecture.md
    phase-03a-review-architecture.md
    phase-04-database-schema.md
    phase-04a-review-database.md
    phase-05-api-contracts.md
    phase-05a-review-api.md
    phase-06-ux-spec.md
    phase-06a-review-ux.md
    phase-07-implementation-tasks.md
    phase-07a-review-tasks.md
    phase-08-testing-strategy.md
    phase-08a-review-testing.md
    phase-09-operations.md
    phase-09a-review-operations.md
    phase-10-security.md
    phase-10a-review-security.md
    validation/
      cross-phase-consistency.md
      traceability-matrix.md
      decision-completeness.md
      critical-path-walkthrough.md
      implementability-dry-run.md
      dependency-graph-validation.md
      scope-creep-check.md
    finalization/
      apply-fixes-and-freeze.md
      developer-onboarding-guide.md
      implementation-playbook.md

  knowledge/                          # Domain expertise
    core/
      domain-modeling.md
      adr-craft.md
      system-architecture.md
      database-design.md
      api-design.md
      ux-specification.md
      task-decomposition.md
      testing-strategy.md
      operations-runbook.md
      security-review.md
    review/
      review-methodology.md
      review-domain-modeling.md
      review-adr.md
      review-system-architecture.md
      review-database-schema.md
      review-api-contracts.md
      review-ux-spec.md
      review-implementation-tasks.md
      review-testing-strategy.md
      review-operations.md
      review-security.md
    validation/
      cross-phase-consistency.md
      traceability.md
      decision-completeness.md
      critical-path-analysis.md
      implementability-review.md
      dependency-validation.md
      scope-management.md
    product/
      prd-craft.md
      gap-analysis.md
    finalization/
      developer-onboarding.md
      implementation-playbook.md

  methodology/                        # Methodology presets
    deep.yml
    mvp.yml
    custom-defaults.yml

  commands/                           # Generated thin plugin wrappers
  docs/v2/                            # v2 design documentation
  prompts.md                          # v1 legacy (extraction source)
```

### Target Project Structure (created by scaffold)

```
target-project/
  .scaffold/
    config.yml                        # Methodology + project config
    state.json                        # Pipeline state (committed)
    decisions.jsonl                   # Decision log (committed)
    lock.json                         # Advisory lock (gitignored)
    instructions/
      global.md                       # Project-wide user instructions
      <step-name>.md                  # Per-step user instructions
  docs/                               # Generated artifacts land here
  CLAUDE.md                           # Agent instructions (managed sections)
```
