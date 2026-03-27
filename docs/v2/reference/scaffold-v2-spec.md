**Status: Superseded** by `docs/v2/scaffold-v2-prd.md`. Architecture, pipeline, config, and CLI sections replaced by meta-prompt architecture. Non-conflicting content carried forward into the PRD. This document is preserved as historical reference.

---

# Scaffold v2: Modular, Cross-Platform Pipeline

**Date:** 2026-03-12
**Status:** Draft
**Author:** Ken Allred + Claude

## Revision History

| Date | Change |
|------|--------|
| 2026-03-12 | Initial draft |
| 2026-03-12 | Address spec review: decomposition strategy, optional prompts, reconfiguration, error handling, prompt classification, resolve open questions |
| 2026-03-12 | Integrate features from plan.md: runtime orchestration, UX commands, prompt customization, brownfield mode, personas, NFRs, metrics, risks |
| 2026-03-12 | Integrate agent ergonomics audit: structured CLI output, state.json redesign, prompt structure conventions, interaction-style adaptation, artifact schemas, session continuity, merge-safe formats |

## User Personas

### Solo AI-First Developer ("Alex")

- **Goals**: Scaffold a new project quickly, get to implementation fast, use Claude Code or Codex agents for all coding work. Wants every document and configuration to be AI-optimized so agents can work autonomously.
- **Pain points with v1**: Has to manually skip optional prompts by remembering which ones don't apply. Runs the full pipeline even for a CLI tool that doesn't need half the prompts. Locked into Claude Code — can't use Codex.
- **Scaffold v2 value**: Pick a methodology preset, get exactly the prompts needed at the right depth, run from either tool.

### Team Lead Adopting AI Workflows ("Jordan")

- **Goals**: Standardize how the team scaffolds projects. Wants a shared configuration that includes team-specific prompts (company coding standards, custom CI templates, internal design system). Pipeline must be repeatable and consistent across team members.
- **Pain points with v1**: Can't customize built-in prompts without forking the repo. No way to share a custom pipeline configuration. Team members run prompts in different orders.
- **Scaffold v2 value**: Commit `.scaffold/config.yml` with custom prompt overrides; every team member gets the same pipeline.

### First-Time Scaffold User ("Sam")

- **Goals**: Try Scaffold on a new project idea. Doesn't want to read documentation — just wants to run a command and answer questions. Wants the tool to figure out what to do.
- **Pain points**: The v1 pipeline is intimidating — 29 prompts with ordering constraints. Doesn't know which optional prompts apply.
- **Scaffold v2 value**: `scaffold init` asks a few questions, resolves everything automatically.

## Problem Statement

Scaffold is currently a monolithic 29-prompt pipeline tightly coupled to Claude Code and opinionated about tooling (Beads, worktrees, strict TDD). This limits adoption across several dimensions:

- **Audience**: Solo devs doing a weekend hack don't need the same pipeline as teams running parallel agents
- **Opinionation**: Some users want lighter guidance they can adapt
- **Tool dependencies**: Requiring Beads limits adoption
- **Scale**: Not every project needs 29 prompts across 7 phases
- **Methodology**: The current process is one approach; DDD, Lean MVP, and others are valid alternatives
- **Platform**: Only works with Claude Code; users want to use Codex (and potentially other AI tools) alongside or instead of Claude Code

## Goals

1. **Flavor system**: Different versions of Scaffold with different prompts, methodologies, and configurations
2. **Composability**: Official curated methodology presets with configurable depth; power users can create custom presets
3. **Cross-platform**: Run the scaffold pipeline from both Claude Code and Codex, and generate project artifacts that work with either tool
4. **Backward compatibility**: Existing users who never opt in get current behavior unchanged

## Non-Goals

- Building a general-purpose project scaffolding tool (stays focused on AI-assisted development)
- Supporting every possible AI tool at launch (Claude Code + Codex first, others later)
- Community marketplace for methodologies (future consideration, not v2 scope)

## Architecture

> **Note:** This section originally described a three-layer prompt resolution system (base prompts, methodology overrides/extensions, mixin injection). That architecture was superseded by the meta-prompt architecture defined in ADR-041, ADR-043, and ADR-044. The sections below have been updated to reflect the current design. See `docs/v2/scaffold-v2-prd.md` Section 4 for the authoritative architecture description.

### High-Level Flow

```
User runs: scaffold init
         |
         v
Interactive wizard (methodology preset -> project traits -> platforms)
         |
         v
Writes: .scaffold/config.yml
         |
         v
User runs: scaffold run <step>
         |
         v
Runtime assembly: meta-prompt + knowledge base + project context + user instructions + depth
         |
         v
AI generates and executes a working prompt tailored to project + methodology
         |
         v
Platform adapters deliver:
  +-- Claude Code plugin commands (thin wrappers around `scaffold run`)
  +-- AGENTS.md sections     (Codex instructions)
  +-- prompts/*.md           (Plain markdown, universal)
```

### Meta-Prompt Architecture

The system uses three core components that are assembled at runtime into a tailored prompt:

#### Meta-Prompts (pipeline/)

36 files in `pipeline/`, one per pipeline step. Each is a compact declaration (30-80 lines) of what the step should accomplish: purpose, inputs, outputs, quality criteria, and methodology-scaling rules. Meta-prompts do NOT contain the actual prompt text the AI executes — they declare intent and the assembly engine constructs the working prompt at runtime.

#### Knowledge Base (knowledge/)

37 files in `knowledge/`, organized by topic. Contains domain expertise: what makes a good PRD, how to review an architecture document, what failure modes to check in API contracts, etc. Reusable across steps — multiple meta-prompts can reference the same knowledge entry via their `knowledge-base` frontmatter field.

#### Methodology Configuration (methodology/)

3 YAML preset files controlling which pipeline steps are active and the depth level (1-5) for each step. Three presets:
- **Deep Domain Modeling** — all steps active, depth 5
- **MVP** — minimal steps, depth 1
- **Custom** — user picks steps and depth per step

**How they interact (runtime assembly):**

When `scaffold run <step>` is invoked:
1. Load the meta-prompt for that step (`pipeline/<step>.md`)
2. Check prerequisites (dependencies, completion, lock)
3. Load relevant knowledge base entries (from meta-prompt frontmatter)
4. Gather project context (prior artifacts, config, state, decisions)
5. Load user instructions (global, per-step, and inline via `--instructions`)
6. Determine depth from methodology config
7. Assemble everything into a single 7-section prompt
8. AI generates a working prompt tailored to project + methodology
9. AI executes the working prompt, producing output artifacts
10. CLI updates pipeline state

**Pipeline step classification:**

Each pipeline step is defined as a meta-prompt in `pipeline/`. The methodology preset controls which steps are active and at what depth. Steps that were deeply methodology-specific in the original spec (e.g., Beads Setup, Implementation Plan) are now handled by meta-prompts whose knowledge base references and depth scaling adapt to the active methodology.

| Pipeline Step | Depth Scaling | Notes |
|---------------|---------------|-------|
| PRD Creation | Depth controls detail level | Methodology-agnostic |
| PRD Gap Analysis | Depth controls rigor | Methodology-agnostic |
| Tech Stack | Depth controls evaluation thoroughness | Universal concern |
| Coding Standards | Depth controls strictness level | Universal concern |
| TDD Standards | Depth controls strictness level | Universal concern |
| Project Structure | Depth controls granularity | Universal concern |
| Dev Environment Setup | Depth controls completeness | Universal concern |
| Design System | Depth controls component coverage | Optional (frontend projects) |
| Git Workflow | Depth controls workflow complexity | Universal concern |
| User Stories | Depth controls story granularity | Universal concern |
| User Stories Gaps | Depth controls analysis depth | Universal concern |
| Add Playwright | Depth controls test coverage | Optional (web projects) |
| Add Maestro | Depth controls test coverage | Optional (mobile projects) |
| Tracking Setup | Depth scales tool integration level | Adapts to configured tracker |
| Implementation Plan | Depth controls task granularity | Adapts to configured tracker |
| Implementation Plan Review | Depth controls review thoroughness | Adapts to configured tracker |
| Claude.md Optimization | Depth controls optimization scope | Universal concern |
| Workflow Audit | Depth controls audit thoroughness | Universal concern |
| Single Agent Start | Depth controls guidance level | Adapts to configured tracker |
| Multi Agent Start | Depth controls coordination level | Adapts to configured tracker |
| Single Agent Resume | Depth controls recovery guidance | Adapts to configured tracker |
| Multi Agent Resume | Depth controls coordination level | Adapts to configured tracker |
| Claude Code Permissions | Minimal depth variation | Universal Claude Code config |
| New Enhancement | Depth controls process rigor | Universal concern |
| Quick Task | Minimal depth variation | Universal concern |
| Multi-Model Code Review | Depth controls review scope | Optional (multi-model CLI) |
| User Stories Multi-Model Review | Depth controls review scope | Optional (multi-model CLI) |
| Implementation Plan Multi-Model Review | Depth controls review scope | Optional (multi-model CLI) |
| Platform Parity Review | Depth controls comparison depth | Optional (multi-platform) |
| Session Analyzer | Utility (not in pipeline) | Standalone analysis tool |

**Utility commands** (always available, not part of the pipeline):

| Command | v2 Disposition |
|---------|----------------|
| version | CLI built-in (`scaffold version`) |
| version-bump | CLI built-in (`scaffold version-bump`) |
| release | CLI built-in (`scaffold release`) |
| update | CLI built-in (`scaffold update`) |
| prompt-pipeline | CLI built-in (`scaffold list --verbose`) |
| dashboard | CLI built-in (`scaffold dashboard`) |
| session-analyzer | CLI built-in (`scaffold analyze`) |

**Meta-prompt file structure:**

```
pipeline/
  create-prd.md
  review-prd.md
  innovate-prd.md
  tech-stack.md
  claude-code-permissions.md
  coding-standards.md
  tdd.md
  project-structure.md
  dev-env-setup.md
  design-system.md
  git-workflow.md
  user-stories.md
  user-stories-gaps.md
  add-e2e-testing.md
  tracking-setup.md
  implementation-plan.md
  implementation-plan-review.md
  claude-md-optimization.md
  workflow-audit.md
  single-agent-start.md
  multi-agent-start.md
  single-agent-resume.md
  multi-agent-resume.md
  automated-pr-review.md
  platform-parity-review.md
  ...
```

Each meta-prompt declares its knowledge base dependencies in YAML frontmatter. The assembly engine loads the referenced knowledge base files and includes their content in the assembled prompt:

```yaml
---
knowledge-base:
  - task-tracking
  - tdd-practices
depends-on: [tech-stack]
produces: ["docs/coding-standards.md"]
---
```

#### Methodology Presets

Methodology presets are simplified YAML files that control step enablement and depth:

```
methodology/
  deep.yml        # All steps, depth 5
  mvp.yml         # Minimal steps, depth 1
  custom.yml      # User-configured steps and depth
```

**Preset format** (`methodology/deep.yml`):

```yaml
name: Deep Domain Modeling
description: Full pipeline with comprehensive standards and maximum depth
steps:
  create-prd: { enabled: true, depth: 5 }
  review-prd: { enabled: true, depth: 5 }
  innovate-prd: { enabled: true, depth: 5 }
  tracking-setup: { enabled: true, depth: 5 }
  tech-stack: { enabled: true, depth: 5 }
  claude-code-permissions: { enabled: true, depth: 3 }
  coding-standards: { enabled: true, depth: 5 }
  tdd: { enabled: true, depth: 5 }
  project-structure: { enabled: true, depth: 5 }
  dev-env-setup: { enabled: true, depth: 5 }
  design-system: { enabled: true, depth: 5, optional: { requires: frontend } }
  git-workflow: { enabled: true, depth: 5 }
  add-e2e-testing: { enabled: true, depth: 5, optional: { requires: [web, mobile] } }
  user-stories: { enabled: true, depth: 5 }
  user-stories-gaps: { enabled: true, depth: 5 }
  platform-parity-review: { enabled: true, depth: 5, optional: { requires: multi-platform } }
  claude-md-optimization: { enabled: true, depth: 5 }
  workflow-audit: { enabled: true, depth: 5 }
  implementation-plan: { enabled: true, depth: 5 }
  implementation-plan-review: { enabled: true, depth: 5 }
  single-agent-start: { enabled: true, depth: 5 }
  multi-agent-start: { enabled: true, depth: 5 }
```

**Optional step handling:**

Steps can be marked `optional` with a `requires` condition. Valid conditions:

| Condition | Meaning | Set during |
|-----------|---------|------------|
| `frontend` | Project has a web or mobile UI | `scaffold init` |
| `web` | Project targets web browsers | `scaffold init` |
| `mobile` | Project targets mobile (Expo/React Native) | `scaffold init` |
| `multi-platform` | Project targets 2+ platforms | `scaffold init` |
| `multi-model-cli` | Codex and/or Gemini CLIs installed | `scaffold init` (auto-detected) |

These are stored in the config file under a `project` key:

```yaml
project:
  platforms: [web]          # Triggers: frontend, web
  multi-model-cli: true     # Auto-detected at init time
```

During `scaffold run`, optional steps whose conditions are not met are skipped. Users can override by adding/removing traits in `config.yml`.

**Dependency graph is authoritative for ordering; phases are for grouping only.**

Dependencies are declared in meta-prompt frontmatter (`depends-on` field) and resolved via Kahn's algorithm. Phase groupings in the methodology preset are for display purposes only (dashboard, pipeline reference). If phases and dependencies conflict, dependencies win.

**Interaction-style adaptation** — The assembly engine adapts prompt behavior to the target platform automatically. Rather than injecting platform-specific content, the AI natively adapts its interaction style based on the platform configuration in `config.yml`:

| Platform | Behavior |
|----------|----------|
| `claude-code` | Uses `AskUserQuestionTool` for decisions. Delegates parallel research to subagents via the `Agent` tool. Conversational multi-phase workflows with context carryover between phases. |
| `codex` | Makes autonomous best-judgment decisions based on project context and PRD. Tags high-stakes decisions (database choice, auth approach, infrastructure) with `NEEDS_USER_REVIEW` in `decisions.jsonl` for post-execution review. Performs research sequentially inline rather than via subagents. Includes explicit "carry forward" context summaries between prompt phases since Codex may not retain conversational memory. |
| `universal` | Presents options as numbered text lists. Asks the user to choose before proceeding. If running in an automated context, chooses options marked `(recommended)` and documents the choice. No tool-specific references. |

Platform adaptation is handled at two levels: the assembly engine includes platform context in the assembled prompt (so the AI adapts its behavior natively), and platform adapters handle surface-level delivery format differences (Claude Code plugin commands vs. AGENTS.md sections vs. plain markdown).

### Configuration

**`.scaffold/config.yml`** — the per-project configuration file:

```yaml
version: 1
methodology: deep
platforms:
  - claude-code
  - codex
project:
  platforms: [web]
  multi-model-cli: true
```

This file is:
- Written by `scaffold init` (interactive wizard)
- Editable by hand
- Read by `scaffold run` to configure runtime assembly
- Committed to the project repo (so all contributors use the same methodology and depth)

### Reconfiguration Behavior

Users may change `config.yml` at any time. Because prompt assembly happens at runtime (not build time), the next `scaffold run` invocation picks up the new configuration automatically.

**Mode Detection** operates at runtime — the assembly engine checks whether artifacts exist and communicates fresh vs. update mode to the AI in the assembled prompt.

If the user changes methodology after already running steps, their existing project artifacts may reference the old methodology's depth level. This is expected — when the user re-runs a step (e.g., `scaffold run implementation-plan`), the assembly engine detects the existing artifact, shows what changed, and updates in place.

**Changing methodology is supported but advisory:**

```
$ scaffold run implementation-plan
Warning: Methodology changed from 'deep' to 'mvp' since this step last ran.
Previously generated artifacts may reflect depth 5; new methodology uses depth 1.
Re-run affected steps to update artifacts.
Proceed? [y/N]
```

### Error Handling

`scaffold run` validates the configuration before assembling prompts:

**Config validation:**
- `methodology` must match an installed methodology preset (`methodology/<name>.yml`)
- Each `platforms` entry must match an installed adapter (`claude-code`, `codex`)
- `project` traits must be known condition names
- Each `extra-prompts` entry must resolve to an existing file (`.scaffold/prompts/<name>.md` or `~/.scaffold/prompts/<name>.md`) with valid YAML frontmatter. Missing files or invalid frontmatter are errors

**Meta-prompt validation:**
- Every step referenced in the methodology preset must have a corresponding meta-prompt file in `pipeline/`
- Every `depends-on` key in meta-prompt frontmatter must reference an existing step
- Every `knowledge-base` entry must reference an existing file in `knowledge/`
- No circular dependencies
- Optional step conditions must reference valid traits
- Depth values must be integers 1-5

**Incompatible combination warnings:**
- These are warnings, not errors — users may have valid reasons for unusual configurations

Error messages include the config path, the specific invalid value, and the list of valid options.

### Platform Adapters

Platform adapters are thin delivery wrappers around the CLI. The assembly engine (runtime) does the heavy lifting; adapters handle packaging and delivery format.

#### Claude Code Adapter

- Thin wrapper: plugin commands invoke `scaffold run <step>`
- Generates/updates `CLAUDE.md` with methodology-appropriate agent guidance
- Registers as plugin or user commands (existing pattern preserved)

#### Codex Adapter

- Generates/updates `AGENTS.md` with prompt content and phase ordering
- Generates `codex-prompts/*.md` as reference files Codex can read when instructed
- Applies tool-name mappings (see below) to translate Claude Code tool references
- Adapts CLAUDE.md-style guidance into Codex-compatible instruction format

**Tool mapping concept:**

Prompts may reference platform-specific tool names (e.g., "use the Read tool to examine the file"). The Codex adapter applies a mapping table to translate these references. The mapping lives in `adapters/codex/tool-map.yml` and uses **phrase-level patterns** rather than single-word replacements to avoid grammatically broken output:

```yaml
# adapters/codex/tool-map.yml — phrase-level pattern matching
patterns:
  - match: "Use AskUserQuestionTool to"
    replace: "Present to the user and"
  - match: "use AskUserQuestionTool"
    replace: "ask the user"
  - match: "use the Read tool"
    replace: "read"
  - match: "Use the Edit tool"
    replace: "Edit"
  - match: "use the Write tool"
    replace: "write"
  - match: "use subagents to"
    replace: "research the following topics (sequentially if needed) to"
  - match: "spawn a review subagent"
    replace: "perform a review"
  - match: "Use the Bash tool to run"
    replace: "Run the command"
  - match: "Use the Glob tool"
    replace: "Find files matching"
  - match: "Use the Grep tool"
    replace: "Search for"
```

Patterns are matched longest-first to avoid partial replacements. Each pattern is a complete phrase, not a single word — this prevents grammatically broken output. Meta-prompts and knowledge base entries should prefer abstract language where possible (e.g., "examine the file" rather than "use the Read tool"), reserving tool-specific references for cases where the exact tool matters. The mapping handles cases where tool-specific language slips through.

**MCP tool handling:** Knowledge base entries that reference MCP tools (Playwright MCP, etc.) are handled via the assembly engine's platform context and the platform adapter together. The Claude Code adapter preserves MCP references. The Codex adapter replaces MCP tool instructions with equivalent direct-command alternatives (e.g., Playwright MCP screenshot instructions become `npx playwright screenshot` CLI commands). If no equivalent exists, the adapter wraps the section in a comment: `<!-- Platform note: this section requires MCP tools not available in Codex. Skip or adapt manually. -->`.

**AGENTS.md section structure** (one section per pipeline phase):

```markdown
## Phase 2 — Project Foundation

### tech-stack
**Produces:** docs/tech-stack.md
**Reads:** docs/plan.md
**Run:** `codex "Follow the instructions in codex-prompts/tech-stack.md"`

[Condensed prompt summary — first 500 tokens of the resolved prompt,
ending with "See codex-prompts/tech-stack.md for full instructions."]
```

Each section includes the run command, artifact references, and a condensed summary. Full prompt content lives in `codex-prompts/*.md`, not in AGENTS.md — this keeps AGENTS.md scannable.

#### Universal Adapter (always generated)

- Generates `prompts/*.md` — plain markdown files, copy-pasteable, works with any AI tool
- Generates `scaffold-pipeline.md` — phase ordering and dependency reference
- Serves as escape hatch for any current or future AI tool

### CLI Interface

```
scaffold init              # Interactive wizard -> .scaffold/config.yml
scaffold run <step>        # Assemble and execute a pipeline step
scaffold list              # Show available methodology presets and steps
scaffold info              # Show current project's config and pipeline progress
scaffold update            # Pull latest scaffold version
scaffold version           # Show installed version
```

#### Pipeline Orchestration Commands

The CLI provides commands for managing pipeline execution:

```
scaffold resume            # Resume pipeline from where it left off
scaffold resume --from X   # Re-run a specific prompt
scaffold status            # Show pipeline progress (read-only)
scaffold next              # Show next eligible prompt with context
scaffold skip <prompt>     # Skip a prompt mid-pipeline
scaffold validate          # Validate config, manifests, and prompts for errors
scaffold reset             # Reset pipeline state, preserve customizations
scaffold adopt             # Add scaffold to existing codebase
scaffold dashboard         # Generate and open visual HTML dashboard
scaffold preview           # Dry-run: resolve and display pipeline without executing
```

#### Agent-Friendly CLI Modes

Every CLI command supports two flags for agent consumption:

**`--format json`** — All output (success, errors, warnings, progress) is emitted as a single JSON object to stdout. Human-readable messages go to stderr only. The envelope format:

```json
{
  "success": true,
  "command": "resume",
  "data": { },
  "errors": [],
  "warnings": [],
  "exit_code": 0
}
```

**`--auto`** — Suppresses all interactive prompts. Decisions that would require user input are resolved automatically:
- Missing predecessor artifacts: run the dependency automatically
- Methodology change confirmation: proceed with warning in output
- Skip confirmation: skip without prompting
- Reset confirmation: requires explicit `--auto --confirm-reset` (destructive actions are never auto-confirmed without a second flag)

When `--auto` is used without `--format json`, the CLI still prints human-readable output but never blocks on interactive prompts.

**Exit codes** (consistent across all commands):

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Validation error (bad config, invalid manifest, malformed frontmatter) |
| 2 | Missing dependency (predecessor artifact not found) |
| 3 | State corruption (state.json unreadable, artifact/state mismatch) |
| 4 | User cancellation (interactive prompt declined) |
| 5 | Assembly error (knowledge base load failed, adapter error) |

**Fuzzy matching in error messages** — When a value doesn't match any valid option (methodology names, step names), the CLI computes Levenshtein distance and suggests the closest match if the distance is ≤ 2. Example:

```
Error: methodology 'clasic' not found.
Did you mean 'deep'? Valid options: deep, mvp
```

In `--format json` mode, suggestions appear in the error object:
```json
{
  "code": "INVALID_METHODOLOGY",
  "field": "methodology",
  "value": "clasic",
  "suggestion": "deep",
  "valid_options": ["deep", "mvp"],
  "file": ".scaffold/config.yml",
  "line": 2
}
```

### Pipeline State Tracking

The CLI tracks pipeline execution state in `.scaffold/state.json` (separate from `config.yml` which is the build configuration):

```json
{
  "schema-version": 1,
  "scaffold-version": "2.0.0",
  "methodology": "deep",
  "init-mode": "greenfield",
  "created": "2026-03-12T10:30:00Z",
  "in_progress": null,
  "prompts": {
    "create-prd": {
      "status": "completed",
      "depth": 5,
      "at": "2026-03-12T10:35:00Z",
      "produces": ["docs/plan.md"],
      "artifacts_verified": true,
      "completed_by": "ken"
    },
    "review-prd": {
      "status": "completed",
      "depth": 5,
      "at": "2026-03-12T10:42:00Z",
      "produces": ["docs/reviews/pre-review-prd.md"],
      "artifacts_verified": true,
      "completed_by": "ken"
    },
    "innovate-prd": {
      "status": "completed",
      "depth": 5,
      "at": "2026-03-12T10:45:00Z",
      "produces": ["docs/prd-innovation.md"],
      "artifacts_verified": true,
      "completed_by": "ken",
      "conditional": "if-needed"
    },
    "design-system": {
      "status": "skipped",
      "at": "2026-03-12T11:00:00Z",
      "reason": "No frontend"
    },
    "dev-env-setup": {
      "status": "pending",
      "depth": 5,
      "produces": ["docs/dev-setup.md", "Makefile"]
    }
  },
  "next_eligible": ["dev-env-setup"],
  "extra-prompts": []
}
```

Each step entry includes:
- `status`: One of `pending`, `in_progress`, `skipped`, `completed`
- `depth`: Depth level (1-5) from the methodology preset at time of execution
- `at`: ISO 8601 timestamp (set when completed or skipped)
- `produces`: Copied from meta-prompt frontmatter so agents don't need to load meta-prompt files to verify artifacts
- `artifacts_verified`: Boolean, set after artifact existence check
- `completed_by`: Actor identity for multi-agent attribution
- `reason`: Explanation for skipped steps

The top-level `in_progress` field (nullable) tracks the currently executing prompt, its start time, and any partial artifacts written so far. This enables crash detection on resume.

#### State Schema Design Rationale

1. **Map-based for git merge safety** — prompt-keyed maps merge cleanly in git when two team members complete different prompts concurrently. Array-based schemas (append to `completed[]`) cause merge conflicts on the closing bracket.
2. **Self-describing for agent consumption** — an agent can determine what's been done, what's next, and which artifacts to verify without loading any other files or running dependency resolution.
3. **Crash-recoverable** — the `in_progress` field enables `scaffold resume` to detect exactly which prompt was interrupted and offer targeted recovery.

**Completion detection** uses a dual mechanism:
1. **Artifact-based** (primary): Check whether a prompt's `produces` artifacts exist on disk. If all files in the `produces` list exist, the prompt is considered complete.
2. **State-recorded** (secondary): The `scaffold resume` command records completion after a prompt finishes by updating the prompt's `status` to `completed`.

When both mechanisms disagree (artifact exists but status is not `completed`), the artifact takes precedence — the prompt succeeded even if state wasn't updated (likely a session crash). When status says `completed` but artifacts are missing, `resume` warns and offers to re-run.

When `in_progress` is non-null on resume, the CLI checks whether the in-progress prompt's `produces` artifacts all exist. If yes, mark completed and clear `in_progress`. If not, warn and offer to re-run.

**State file is committed to git** — enables team sharing and pipeline resumption across machines. The `init-mode` field records whether the project was initialized as `greenfield` or `brownfield` (distinct from `config.yml`'s `mode` field which controls brownfield-adapted prompt behavior).

### Pipeline Execution Locking

`scaffold resume` acquires a lightweight advisory lock before executing a prompt. The lock prevents two team members from accidentally running the same prompt concurrently.

**Lock file:** `.scaffold/lock.json` (gitignored — local only):

```json
{
  "holder": "ken-macbook",
  "prompt": "dev-env-setup",
  "started": "2026-03-12T11:00:00Z",
  "pid": 12345
}
```

**Behavior:**
- On entry: check for `.scaffold/lock.json`. If it exists and the PID is still running, warn: 'Pipeline is in use by {holder} (running {prompt}). Use --force to override.' If the PID is dead, clear the stale lock and proceed.
- On prompt completion: delete the lock file.
- On crash: lock file remains (stale PID). Next `scaffold resume` detects the dead process and clears it automatically.
- `--force` flag: override the lock (for legitimate concurrent use or stuck locks).

**Git safety:** The lock file is listed in `.gitignore` — it is purely local and never committed. Cross-machine coordination relies on git's own merge behavior on `state.json` (which is map-based and merge-safe per the State Schema Design Rationale above).

### Decision Log

An append-only JSONL log (`.scaffold/decisions.jsonl`) persists key decisions across sessions. JSONL (one JSON object per line, no wrapping array) is used because it is append-only at the line level, which means git merges are trivial when multiple team members append decisions concurrently. JSON arrays conflict on every append because the closing bracket moves.

Each entry includes a sequential ID, actor identity, and a `prompt_completed` flag indicating whether the decision was logged after prompt completion or during execution (which may indicate a crashed session):

```
{"id":"D-001","prompt":"tech-stack","decision":"Chose Vitest over Jest for speed","at":"2026-03-12T10:40:00Z","completed_by":"ken","prompt_completed":true}
{"id":"D-002","prompt":"coding-standards","decision":"Using Biome instead of ESLint+Prettier","at":"2026-03-12T10:55:00Z","completed_by":"ken","prompt_completed":true}
```

Downstream prompts should treat `prompt_completed: false` decisions as provisional — they may be from a crashed session where the agent's reasoning was incomplete.

- Created as empty file by `scaffold init`
- Each prompt optionally records 1-3 key decisions after execution
- Read by subsequent prompts for cross-session context continuity
- Deleted by `scaffold reset`. Decisions from re-run prompts (`scaffold resume --from X`) are not removed — new decisions are appended with the same prompt name, and consumers use the latest entry per prompt.
- Committed to git

### Meta-Prompt Frontmatter

All meta-prompts use YAML frontmatter declaring metadata used by the CLI for orchestration:

```yaml
---
description: "Research and document technology decisions"
depends-on: [create-prd, tracking-setup]
phase: 2
knowledge-base: [tech-evaluation, decision-making]
argument-hint: "<tech constraints or preferences>"
produces: ["docs/tech-stack.md"]
reads: ["docs/plan.md"]
---
```

Fields:
- `description` (required): Short description for pipeline display and help
- `depends-on` (optional): Step names this step depends on. Defaults to empty
- `phase` (optional): Phase number for display grouping. Defaults to phase of last dependency, or 1
- `knowledge-base` (optional): List of knowledge base file names (without extension) to include in the assembled prompt
- `argument-hint` (optional): Hint for argument substitution, shown in help
- `produces` (required for built-in, optional for custom): Expected output file paths. Used by completion detection, v1 detection, and step gating
- `reads` (optional): Input file paths this step needs. Supports both full-file and section-level references. Used to pre-load predecessor documents into context before execution
- `artifact-schema` (optional): Defines the expected structure of produced artifacts for downstream validation
- `requires-capabilities` (optional): Declares platform capabilities the step needs

**`reads` with section targeting** — The `reads` field supports both full-file and section-level references:

```yaml
reads:
  - "docs/plan.md"
  - path: "docs/tech-stack.md"
    sections: ["Quick Reference"]
  - path: "docs/project-structure.md"
    sections: ["High-Contention Files", "Module Organization Strategy"]
  - path: "CLAUDE.md"
    sections: ["Key Commands"]
```

When section targeting is used, the CLI extracts only the specified sections (matched by heading text) and presents them as context before the prompt content. This reduces context window consumption for prompts that need specific data from large predecessor documents. The `implementation-plan` prompt, which reads 9 documents, benefits most — estimated reduction from ~15,000 tokens to ~5,000 tokens of predecessor context.

Plain string entries (`"docs/plan.md"`) load the full file (backward compatible with the existing spec).

**`artifact-schema`** — Defines the expected structure of produced artifacts so downstream agents and `scaffold validate` can verify them:

```yaml
artifact-schema:
  "docs/tech-stack.md":
    required-sections:
      - "## Architecture Overview"
      - "## Backend"
      - "## Database"
      - "## Frontend"
      - "## Infrastructure & DevOps"
      - "## Developer Tooling"
      - "## Third-Party Services"
      - "## Quick Reference"
    id-format: null
  "docs/user-stories.md":
    required-sections:
      - "## Best Practices Summary"
      - "## User Personas"
      - "## Story Index"
    id-format: "US-\\d{3}"
    index-table: true
```

Fields within each artifact entry:
- `required-sections`: Exact markdown heading strings (level and text) that must appear in the artifact. `scaffold validate` checks for their presence.
- `id-format`: Regex pattern for entity IDs within the artifact (e.g., `FR-\\d{3}` for PRD features, `US-\\d{3}` for user stories). Null if no IDs are expected.
- `index-table`: Boolean — if true, the artifact must contain a summary table within the first 50 lines listing all entities by ID.

Knowledge base entries contribute content within existing artifact sections but must not add new heading-level sections (`##` or above) to artifacts. This ensures that artifact schemas remain stable regardless of which knowledge base entries are included.

**`requires-capabilities`** — Declares platform capabilities the prompt needs:

```yaml
requires-capabilities:
  - user-interaction
  - filesystem-write
  - subagent
```

Valid capabilities: `user-interaction` (prompt asks the user questions), `filesystem-write` (prompt creates files), `subagent` (prompt delegates to subagents), `mcp` (prompt uses MCP tools), `git` (prompt runs git commands). The platform adapter checks declared capabilities against platform support. Missing capabilities produce a warning with adaptation guidance, not a hard error.

### Prompt Structure Convention

All meta-prompts follow a standard section ordering convention that front-loads the most critical information for agent consumption:

```markdown
---
(frontmatter)
---

## What to Produce
[The deliverable — 2-3 sentences maximum. The agent should know exactly
what file(s) to create and their purpose after reading this section.]

## Completion Criteria
- [ ] `docs/<artifact>.md` exists
- [ ] Contains required sections: [list from artifact-schema]
- [ ] Tracking comment present on line 1
- [ ] [Any additional machine-checkable criteria]

## Process
[Execution rules — what order to work in, how to handle decision points,
when to ask the user vs. decide autonomously. This section appears early
because it contains critical workflow constraints the agent must know
before starting detailed work.]

## Detailed Specifications
[The full specification — section-by-section content requirements,
formatting rules, examples. This is the bulk of the prompt.]

## Update Mode Specifics
[Only the per-prompt rules for update mode. The shared update mode
procedure (detect existing file, diff against structure, categorize
as ADD/RESTRUCTURE/PRESERVE, preview changes) is handled by the CLI
via `scaffold resume`, which tells the agent whether it's in fresh or
update mode and provides the diff. Prompts include only their unique
update rules here.]
```

**Rationale for this ordering:**

1. **What to Produce** first — the agent knows its goal in the first 50 tokens.
2. **Completion Criteria** second — the agent knows the finish line before starting. These criteria also feed `scaffold validate`.
3. **Process** third — execution constraints before detailed specs, so agents that start executing before reading the full prompt still follow the right workflow.
4. **Detailed Specifications** fourth — the bulk of the content, read as reference during execution.
5. **Update Mode Specifics** last — only relevant when updating, and the agent already knows from `scaffold resume` output whether it's in update mode.

**Removed from prompts (handled by CLI instead):**
- **Mode Detection block** (~300-400 tokens per prompt of identical boilerplate). The CLI determines fresh vs. update mode by checking artifact existence and communicates this to the agent in the `scaffold resume` output. Saves ~4,000 tokens across the full pipeline.
- **'After This Step' navigation** (~50 tokens per prompt). Replaced by `scaffold next`, which computes the next step dynamically from state. Saves ~800 tokens across the pipeline.

### Predecessor Artifact Verification (Step Gating)

Before a prompt executes, `scaffold resume` verifies that all predecessor prompts' `produces` artifacts exist on disk:

```
Prompt `coding-standards` expects `docs/tech-stack.md` (from `tech-stack`), but it's missing.
[Run tech-stack first / Proceed anyway / Cancel]
```

- If a predecessor was skipped, its artifacts are not required
- "Run tech-stack first" executes the missing prompt, then returns to the original
- "Proceed anyway" continues — the prompt handles missing inputs as best it can
- Verification runs before prompt loading — it's a pre-flight check

### Dependency Resolution Algorithm

The CLI uses Kahn's algorithm for topological sort:
1. Build adjacency list and in-degree count from all `depends-on` declarations in meta-prompt frontmatter
2. Initialize queue with all steps that have in-degree 0 (no dependencies)
3. While queue is non-empty: dequeue, add to sorted list, decrement in-degree for dependents. If any reach 0, enqueue (using phase order as tiebreaker)
4. If sorted list length != total step count, a cycle exists — report it
5. Verification step: confirm every step appears after all its dependencies in the final list

Resolution happens at startup and is cached. Re-resolved when config or meta-prompt frontmatter changes.

### UX Command Details

**`scaffold resume`:**
- Reads `.scaffold/state.json` to determine next uncompleted prompt
- `--from <prompt-name>` re-runs a specific prompt (marks previous completion as superseded)
- If all complete, suggests next actions (enhancement, implementation)

When `scaffold resume` runs, it first outputs a **session bootstrap summary** — a structured context block that tells the agent (or user) exactly what state the pipeline is in and which files to read:

```
=== Pipeline Status ===
Methodology: deep (8/18 complete, 2 skipped)
Last completed: project-structure (2026-03-12T10:42:00Z)
Next eligible: dev-env-setup

=== Context Files ===
Load these for session context:
  1. CLAUDE.md
  2. .scaffold/decisions.jsonl (2 decisions)
  3. docs/project-structure.md (predecessor output)

=== Recent Decisions ===
  - [tech-stack] Chose Vitest over Jest for speed
  - [coding-standards] Using Biome instead of ESLint+Prettier

=== Crash Recovery ===
  (none — last session completed cleanly)

Ready to run dev-env-setup? [Y/n]
```

In `--format json` mode, this becomes a structured object under `"data"`:

```json
{
  "success": true,
  "command": "resume",
  "data": {
    "pipeline_progress": { "completed": 8, "skipped": 2, "total": 18 },
    "last_completed": { "prompt": "project-structure", "at": "2026-03-12T10:42:00Z" },
    "next_eligible": ["dev-env-setup"],
    "context_files": ["CLAUDE.md", ".scaffold/decisions.jsonl", "docs/project-structure.md"],
    "recent_decisions": [
      {"id": "D-001", "prompt": "tech-stack", "decision": "Chose Vitest over Jest"},
      {"id": "D-002", "prompt": "coding-standards", "decision": "Using Biome"}
    ],
    "crash_recovery": null
  }
}
```

When `in_progress` is non-null in state.json (previous session crashed), the crash recovery section reports what was interrupted and which partial artifacts exist:

```
=== Crash Recovery ===
  Previous session crashed during: coding-standards
  Started at: 2026-03-12T10:55:00Z
  Partial artifacts found: docs/coding-standards.md (exists, possibly incomplete)
  Recommended action: Re-run coding-standards
```

**`scaffold status`:**
- Read-only progress display (no offer to execute):
  ```
  Pipeline: deep (9/19 complete)
  Phase 3 — Development Environment
  + create-prd
  + review-prd
  + innovate-prd
  + beads-setup
  + tech-stack
  + coding-standards
  + tdd
  + project-structure
  > dev-env-setup (next)
    design-system
    git-workflow
    ...
  ```

**`scaffold next`:**
- Shows only the next eligible prompt with context (name, description, produces, reads)
- If multiple prompts are eligible (parallel within a phase), shows all
- Does not modify state or offer to execute

**`scaffold skip <prompt>`:**
- Records prompt as skipped (distinct from completed) in `state.json`
- Skipped prompts are treated as "done" for dependency resolution
- Can be un-skipped via `scaffold resume --from <prompt>`
- Prompts for optional reason text

**`scaffold validate`:**
- Validates config, meta-prompts, and knowledge base files for errors without modifying anything
- Checks: valid methodology preset, step references resolve, no circular deps, valid frontmatter, knowledge base paths exist, depth values are 1-5
- Produced artifacts match their `artifact-schema` (required sections present with exact heading text, ID format matches regex, index table present if required)
- Tracking comments on line 1 of produced artifacts are well-formed
- `state.json` schema version matches CLI expectation
- All `decisions.jsonl` entries are valid JSON with required fields
- Output: list of errors grouped by source file, or "All valid"

**`scaffold reset`:**
- Deletes `.scaffold/state.json` and `.scaffold/decisions.jsonl`
- Preserves `.scaffold/config.yml` (build config) and `.scaffold/prompts/` (customizations)
- Requires explicit confirmation
- After reset, re-run `scaffold init` or `scaffold resume` to start fresh

**`scaffold preview`:**
- Resolves and displays the full pipeline without executing or creating files
- Shows: step names, phases, dependencies, depth levels, expected output artifacts
- Shows resolution errors inline
- Equivalent to `scaffold init --dry-run`

**`scaffold dashboard`:**
- Generates self-contained HTML file with pipeline visualization
- Shows completion status from `state.json` + artifact detection
- Supports `--no-open`, `--json-only`, `--output FILE`
- Light/dark mode
- "What's Next" guidance for first pending prompt with satisfied dependencies

### Prompt Customization Layer

Users can override built-in prompts or add custom prompts without forking scaffold.

**Prompt resolution precedence** (first match wins):
1. `.scaffold/prompts/<name>.md` — project-level override
2. `~/.scaffold/prompts/<name>.md` — user-level override
3. Built-in meta-prompt (from `pipeline/`)

**To override a built-in prompt:** Create `.scaffold/prompts/<name>.md` with the same name. It replaces the built-in entirely. If frontmatter includes `depends-on`, those are used; if omitted, inherits from the built-in.

**To add a custom prompt:** Create `.scaffold/prompts/<name>.md` with frontmatter declaring `depends-on` and `phase`. Add the prompt name to `extra-prompts` in `config.yml`:

```yaml
extra-prompts:
  - security-audit
  - compliance-check
```

Custom prompts are included in the pipeline at the position determined by their `depends-on` and `phase` declarations, resolved alongside built-in prompts.

### CLAUDE.md Management

The CLAUDE.md file in the target project is the primary agent instruction file for Claude Code. It accumulates content from multiple pipeline prompts, which creates two risks: unbounded growth (CLAUDE.md is loaded into every agent session, consuming context window) and structural drift (each prompt adds sections with ad-hoc naming).

**Size budget:** CLAUDE.md should not exceed ~2,000 tokens (~1,500 words). The file is a quick-reference pointer, not comprehensive documentation. Detailed standards live in their dedicated docs files.

**Reserved structure:** The tracking-setup step creates CLAUDE.md with all section headings pre-defined. Later steps fill their reserved sections rather than appending new ones:

```markdown
# CLAUDE.md

## Core Principles
<!-- Reserved for: tracking-setup -->

## Task Management
<!-- Reserved for: tracking-setup -->

## Key Commands
<!-- Reserved for: dev-env-setup -->

## Project Structure Quick Reference
<!-- Reserved for: project-structure -->

## Coding Standards Summary
<!-- Reserved for: coding-standards (brief — see docs/coding-standards.md) -->

## Git Workflow
<!-- Reserved for: git-workflow (brief — see docs/git-workflow.md) -->

## Testing
<!-- Reserved for: tdd (brief — see docs/tdd-standards.md) -->

## Design System
<!-- Reserved for: design-system (optional — only if frontend) -->

## Self-Improvement
<!-- Reserved for: tracking-setup -->
```

**Rules:**
- Each section has a named owner (the prompt that fills it).
- Prompts fill their sections with a concise summary (2-5 bullet points) and a pointer to the full document (`see docs/X.md`).
- No prompt may add new `##`-level sections to CLAUDE.md — if a prompt needs to add agent guidance, it goes under an existing section or into its own `docs/` file.
- The `claude-md-optimization` prompt (Phase 6) enforces the size budget and consolidates any drift.
- The `<!-- Reserved for: X -->` comments are replaced by actual content when the owning prompt runs. If a prompt is skipped, the placeholder is removed by `claude-md-optimization`.
- Implementation agents should treat `<!-- scaffold:managed -->` markers as read-only — scaffold owns those sections. Implementation agents add their own content only to unmarked sections or to a dedicated `## Project-Specific Notes` section at the bottom.

**Pipeline ordering info:** CLAUDE.md does NOT contain a pipeline reference table. Pipeline ordering is the CLI's responsibility (`scaffold status`, `scaffold next`). This avoids duplicating ordering info across manifest, state.json, CLAUDE.md, and the skill file.

### Artifact Ownership Markers

Artifacts produced by scaffold prompts include tracking comments on line 1 and may include section-level ownership markers. These serve both the Mode Detection system (for update mode) and implementation agents (to know which sections scaffold manages vs. which are safe to edit).

**Tracking comment format** (line 1 of every scaffold artifact):

```
<!-- scaffold:<step-name> v<version> <date> <methodology>/depth-<N> -->
```

Example:
```
<!-- scaffold:tech-stack v1 2026-03-12 deep/depth-5 -->
```

The methodology and depth context enable Mode Detection to handle artifacts created under a different configuration — if the user switched from `deep` to `mvp`, or changed depth levels, the update mode knows which sections may no longer apply.

Validation rule: tracking comments must match the regex `<!-- scaffold:[a-z-]+ v\d+ \d{4}-\d{2}-\d{2}( [a-z0-9/-]+)? -->`. Malformed tracking comments cause Mode Detection to warn rather than silently falling into legacy mode.

**Section ownership markers** (in CLAUDE.md and other multi-writer artifacts):

```markdown
<!-- scaffold:managed by coding-standards -->
## Coding Standards Summary
...content...
<!-- /scaffold:managed -->
```

Implementation agents should not modify content between `<!-- scaffold:managed -->` markers. They may add content outside managed blocks or in a dedicated unmanaged section.

### Brownfield Mode

For adding scaffold to an existing codebase that already has code, dependencies, and structure.

**Detection:** During `scaffold init`, if the directory contains a package manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`) with dependencies, or a `src/`/`lib/` directory with source files, scaffold asks: "This directory has existing code. Scaffold around it (brownfield) or start fresh (greenfield)?"

**Config:** `.scaffold/config.yml` includes `mode: brownfield` when activated.

**Adapted steps:** Four pipeline steps have brownfield-aware behavior (triggered by reading `mode` from config):
- `create-prd`: Reads existing code/README to draft PRD, asks user to fill gaps
- `tech-stack`: Reads package manifests to pre-populate decisions, presents for confirmation
- `project-structure`: Documents existing structure rather than scaffolding new
- `dev-env-setup`: Documents existing dev commands rather than creating new

All other prompts run normally — they create new standards documents that reference the existing codebase.

### `scaffold adopt` Command

Dedicated entry point for existing codebases (distinct from brownfield mode and v1 detection):

- Scans for: package manifests, `docs/` directory, README, test configs, CI configs
- Maps findings to scaffold prompts: existing `docs/plan.md` -> `create-prd` marked complete
- Generates `state.json` with pre-completed prompts where artifacts exist
- Sets `mode: brownfield` in config
- Suggests running remaining prompts: "Found 5/18 artifacts already in place. Run `scaffold resume` to continue."

### v1 Project Detection

When `scaffold init` runs in a directory with v1 artifacts (e.g., `docs/plan.md`, `docs/tech-stack.md`, `.beads/`) but no `.scaffold/` directory:

- Detects v1 artifacts using the `produces` field from prompt frontmatter
- Maps existing files to completed prompts
- Creates `.scaffold/config.yml` + `state.json` with inferred completion state
- Never modifies existing v1 artifacts
- User confirms before config is created
- Pipeline continues with uncompleted prompts only

### Smart Methodology Suggestion

During `scaffold init`, if the user provides an idea (`scaffold init "I want to build a CLI tool that..."`), the wizard analyzes it:

**Keyword signals** (from idea text):
- "web app", "dashboard", "frontend", "React" -> suggest web-focused options + `frontend` trait
- "CLI", "command-line", "library", "SDK" -> suggest minimal methodology
- "mobile", "iOS", "Android", "Expo" -> suggest mobile traits
- "API", "backend", "microservice" -> suggest backend-focused options

**File-based signals** (from existing files, override keywords when conflicting):
- `package.json` with React/Next.js -> suggest `frontend` + `web` traits
- Expo config -> suggest `mobile` trait
- `bin/` directory -> suggest CLI-focused options

The recommended methodology appears first in the selection with "(Recommended)".

#### `scaffold init` Wizard Flow

```
Welcome to Scaffold!

? Choose a methodology preset:
  > Deep Domain Modeling -- Full pipeline, all steps, depth 5
    MVP -- Minimal steps, depth 1
    Custom -- Pick steps and depth per step
    (more added over time)

? Target platforms:
  [x] Claude Code
  [x] Codex

? Project type (affects which optional steps are included):
  [x] Web
  [ ] Mobile
  [ ] Multi-platform

Config written to .scaffold/config.yml

Ready! Run `scaffold run create-prd` to start, or `scaffold next` to see what's next.
```

### Distribution

#### npm (primary)

```bash
npm install -g @scaffold-cli/scaffold
# or without global install:
npx @scaffold-cli/scaffold init
```

Package structure:
```
@scaffold-cli/scaffold/
  bin/scaffold             # CLI entry point
  pipeline/                # Meta-prompt files (one per step)
  knowledge/               # Knowledge base files (domain expertise)
  methodology/             # Methodology preset YAML files
  adapters/                # Platform adapter logic
  lib/                     # Shared utilities (assembly engine, etc.)
  package.json
```

#### Homebrew

```bash
brew tap zigrivers/scaffold
brew install scaffold
```

Formula pulls from npm or GitHub releases.

#### Backward Compatibility

The existing Claude Code plugin continues to work as-is:
- Plugin commands become thin wrappers: `/scaffold:init` calls `scaffold init`
- Users who never run `scaffold init` get current behavior unchanged (deep methodology, all defaults)
- The existing `commands/` directory in the scaffold repo serves as the "deep preset, depth 5" default output

### Migration Path

#### Phase 1: Foundation

**Core engine:**
- Build the CLI shell (Node.js, `@inquirer/prompts`)
- Implement: `scaffold init`, `scaffold run`, `scaffold list`, `scaffold info`, `scaffold version`
- Decompose current `prompts.md` into meta-prompts (`pipeline/`) + knowledge base (`knowledge/`)
- Add frontmatter (`produces`, `reads`, `depends-on`, `phase`, `knowledge-base`) to all meta-prompts
- Create methodology preset YAML files (`methodology/`)
- Build the runtime assembly engine (7-section prompt construction)
- Build dependency resolution (Kahn's algorithm)
- Build the Claude Code adapter (thin wrapper around `scaffold run`)

**Runtime orchestration:**
- Implement pipeline state tracking (`state.json`)
- Implement: `scaffold resume`, `scaffold status`, `scaffold next`, `scaffold skip`
- Implement: `scaffold validate`, `scaffold reset`, `scaffold preview`
- Implement decision log (`decisions.jsonl`)
- Implement predecessor artifact verification (step gating)
- Implement prompt customization layer (project/user override precedence)

**Distribution:**
- npm packaging and Homebrew formula
- v1 project detection (migration path for existing users)

**Testing:**
- Tests for CLI, resolution logic, state tracking, and adapters
- Integration tests for full init -> build -> resume flow

#### Phase 2: Cross-Platform

- Build the Codex adapter (AGENTS.md generation, tool-name mapping)
- Build the universal adapter (plain markdown output)
- Test every prompt on both Claude Code and Codex
- Document cross-platform usage patterns
- Implement brownfield mode and `scaffold adopt`
- Smart methodology suggestion (keyword + file analysis)
- Dashboard generation (`scaffold dashboard`)

#### Phase 3: New Content

- Add `mvp` methodology preset (streamlined pipeline for solo devs)
- Add additional knowledge base entries as needed
- Write methodology preset authoring guide for future presets (DDD, Lean MVP, etc.)
- Add new methodology presets

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Methodology preset as top-level organizer | Presets are coherent philosophies; mixing depth levels across them produces incoherent results |
| Meta-prompt + knowledge base separation | Intent declarations (meta-prompts) stay compact; domain expertise (knowledge base) is reusable across steps |
| Runtime assembly over build-time resolution | No build step needed; config changes take effect on next `scaffold run`; simpler mental model |
| Depth scale (1-5) over discrete configuration axes | Single dimension replaces multiple independent toggles; AI adapts natively from depth + knowledge base |
| Config file over runtime flags | Stable per-project; both AI tools read the same config; committed to repo |
| Universal adapter always generated | Escape hatch for any AI tool, including future ones |
| Standalone CLI as source of truth | Platform integrations are thin wrappers, not primary interfaces |
| npm as primary distribution | Node already required for Codex; npx enables zero-install usage |
| Homebrew as secondary | Native macOS/Linux feel; no Node dependency for users who don't need Codex |

### Resolved Design Questions

These were open questions during brainstorming, now resolved:

1. **CLI implementation language: Node.js** — Node.js for the CLI shell, wizard (using `@inquirer/prompts`), assembly engine, and adapters. Rationale: natural for npm distribution, required for Codex users anyway, better interactive prompt libraries than bash. This is a shift from the current all-bash convention and will require updating CLAUDE.md, coding-standards, and test infrastructure for the v2 codebase. Bash scripts may still be used for git/shell-heavy utilities where appropriate.

2. **Knowledge base granularity: Multiple entries per meta-prompt** — A single meta-prompt can reference multiple knowledge base files via its `knowledge-base` frontmatter field. The assembly engine loads all referenced entries and includes them in the assembled prompt's Knowledge Base section.

3. **Methodology versioning: Bundled with CLI** — Methodology presets ship as part of the npm/Homebrew package. No independent versioning initially. Revisit when community contributions begin.

4. **Config inheritance: Deferred** — Global `~/.scaffold/defaults.yml` is a nice-to-have for a future release, not Phase 1-3 scope.

5. **npm package name: `@scaffold-cli/scaffold`** — Resolved.

### Config Versioning

The config file includes a `version` field (starting at `1`) that tracks the config schema version. Contract:

- **Minor CLI updates** do not change the config version — new optional fields may be added with defaults
- **Breaking config changes** increment the version number
- `scaffold run` checks the config version on each invocation:
  - If current: proceeds normally
  - If old: runs `scaffold config migrate` automatically to upgrade the config format, shows diff, asks for confirmation
  - If newer than CLI supports: errors with "please update scaffold"
- Migration logic is forward-only (v1 -> v2 -> v3, no downgrades)

### Remaining Open Questions

1. **Codex command invocation pattern** — How does a Codex user "run" a scaffold step? Best current option: `codex "Follow the instructions in codex-prompts/create-prd.md to create a PRD for <idea>"`. Needs validation with real Codex usage patterns as they evolve.

## Non-Functional Requirements

### Performance

- **Runtime assembly**: `scaffold run` assembles a prompt in under 2 seconds (meta-prompt load + knowledge base load + context gathering + depth resolution)
- **Meta-prompt loading**: Loading any meta-prompt and its knowledge base entries completes in under 100ms
- **State reads/writes**: Reading/writing `state.json` completes in under 100ms (file is under 10KB)
- **No background processes**: All operations are synchronous. No daemons, watchers, or background services

### Reliability

- **Crash recovery**: If a session crashes mid-prompt, no data is lost. The prompt is not marked complete. `scaffold resume` picks up where it left off
- **State integrity**: `state.json` is written atomically (write to temp file, rename). If corrupted, `scaffold resume` falls back to artifact-based completion detection and regenerates state
- **Idempotent assembly**: `scaffold run` with the same inputs produces identical assembled prompts
- **Idempotent steps**: Running a step twice overwrites outputs cleanly (Mode Detection handles fresh vs. update)
- **Merge-safe file formats**: All scaffold state files (`state.json`, `decisions.jsonl`, `config.yml`) are designed for conflict-free git merges when multiple team members work concurrently. `state.json` uses a map-keyed-by-prompt-name structure. `decisions.jsonl` uses JSONL (one object per line, append-only). `config.yml` is a flat structure with no arrays that grow over time.

### Compatibility

- **Operating systems**: macOS and Linux. Windows via WSL expected to work but not tested
- **Node.js**: Requires Node.js 18+ (for CLI). Codex already requires Node.js 22+
- **Claude Code**: Requires plugin support. Specific minimum version to be determined closer to release (Claude Code plugin API is evolving)
- **Codex**: Compatible with current Codex CLI. Adapter will be updated as Codex evolves

### Security

- **No credential storage**: Scaffold does not store API keys, tokens, or credentials
- **No network access**: The CLI makes no network requests (except `scaffold update` which pulls from npm/GitHub)
- **File permissions**: `.scaffold/` directory and contents use default file permissions

## Risks

1. **Content drift during v2 engine work.** Building the CLI, decomposing prompts into meta-prompts + knowledge base, and writing adapters is substantial. If prompt content is also being improved in parallel, merge conflicts and content drift occur.
   - **Mitigation**: Freeze prompt content changes during v2 engine development. Port existing prompts as-is into meta-prompt + knowledge base format.

2. **Knowledge base granularity tuning.** Determining the right boundaries for knowledge base files — too coarse wastes context tokens, too fine creates maintenance burden.
   - **Mitigation**: Start with topic-level granularity (one file per domain topic) and split only when assembly produces prompts that exceed context budgets.

3. **Cross-platform prompt quality divergence.** Meta-prompts assembled for Claude Code's tool-use capabilities may produce different quality when the same assembly runs on Codex, which has different strengths and constraints.
   - **Mitigation**: Test every step on both platforms during Phase 2. Maintain platform-specific testing in CI. Accept that some steps may need platform-specific knowledge base entries (handled via assembly engine platform context).

4. **Complexity for first-time users.** v2 adds concepts (methodology presets, depth scale, knowledge base, state tracking) that didn't exist in v1.
   - **Mitigation**: The default experience (`scaffold init`) is simpler than v1 — pick a preset and go. Advanced features (custom presets, brownfield, per-step depth overrides) are opt-in.

5. **npm package name conflict.** The "scaffold" name is generic and may conflict with existing packages.
   - **Mitigation**: Using scoped package `@scaffold-cli/scaffold` to avoid conflicts.

6. **Agent ergonomics gaps in meta-prompt design.** Meta-prompts designed for human reading may not be optimally structured for AI agent execution — agents need front-loaded instructions, machine-checkable completion criteria, and minimal boilerplate.
   - **Mitigation**: Enforce the Prompt Structure Convention (What to Produce -> Completion Criteria -> Process -> Specs -> Update Mode) for all meta-prompts during the v1-to-v2 decomposition. Extract shared boilerplate (Mode Detection, After This Step navigation) into CLI behavior rather than meta-prompt content. Validate meta-prompt structure as part of `scaffold validate`.

## Success Metrics

### Adoption

- **v1-to-v2 migration rate**: 80%+ of active v1 users migrate within 3 months
- **New user onboarding**: First-time users complete `scaffold init` and execute 3+ prompts in their first session
- **Cross-platform usage**: 20%+ of v2 projects use both Claude Code and Codex within 6 months

### Efficiency

- **Time to first implementation task**: Under 60 minutes for lite methodologies, under 120 minutes for full deep
- **Zero manual prompt skipping**: When using a built-in methodology, users should never need to manually skip prompts

### Quality

- **Pipeline completion rate**: 70%+ of started pipelines reach completion
- **Resume usage**: 50%+ of multi-session pipelines use `scaffold resume`
- **No regression in prompt quality**: Output artifacts maintain v1 quality. User feedback is the signal

## Out of Scope

- **Automatic step execution without confirmation**: Every step requires user confirmation. No unattended mode
- **Meta-prompt versioning or rollback**: Users delete override files to revert. No version history within scaffold
- **Remote methodology registry**: Methodology presets are shared via git or npm. No central marketplace
- **Parallel step execution**: Steps run sequentially. Parallel agents are for implementation, not pipeline setup
- **Pipeline Context (context.json)**: Deferred from plan.md. Cross-step data sharing adds complexity; steps read predecessor output files directly. May revisit in a future version
