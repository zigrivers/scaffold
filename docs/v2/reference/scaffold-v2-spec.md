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
| 2026-03-12 | Integrate agent ergonomics audit: structured CLI output, state.json redesign, prompt structure conventions, interaction-style mixin, artifact schemas, session continuity, merge-safe formats |

## User Personas

### Solo AI-First Developer ("Alex")

- **Goals**: Scaffold a new project quickly, get to implementation fast, use Claude Code or Codex agents for all coding work. Wants every document and configuration to be AI-optimized so agents can work autonomously.
- **Pain points with v1**: Has to manually skip optional prompts by remembering which ones don't apply. Runs the full pipeline even for a CLI tool that doesn't need half the prompts. Locked into Claude Code — can't use Codex.
- **Scaffold v2 value**: Pick a methodology + mixins, get exactly the prompts needed, run from either tool.

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
2. **Composability**: Official curated presets built from composable modules; power users can compose their own
3. **Cross-platform**: Run the scaffold pipeline from both Claude Code and Codex, and generate project artifacts that work with either tool
4. **Backward compatibility**: Existing users who never opt in get current behavior unchanged

## Non-Goals

- Building a general-purpose project scaffolding tool (stays focused on AI-assisted development)
- Supporting every possible AI tool at launch (Claude Code + Codex first, others later)
- Community marketplace for methodologies (future consideration, not v2 scope)

## Architecture

### High-Level Flow

```
User runs: scaffold init
         |
         v
Interactive wizard (methodology -> axes -> platforms)
         |
         v
Writes: .scaffold/config.yml
         |
         v
User runs: scaffold build
         |
         v
Resolves: base prompts + methodology overrides + mixin injections
         |
         v
Adapters generate:
  +-- commands/*.md          (Claude Code slash commands)
  +-- AGENTS.md sections     (Codex instructions)
  +-- prompts/*.md           (Plain markdown, universal)
```

### Layered Prompt System

Three layers resolve into a final prompt set:

#### Layer 1: Base Prompts

Prompts that are shared across methodologies. Base prompts are written using **abstract task verbs** rather than tool-specific commands. Concrete tool commands are injected via mixins at build time.

**Abstract task verb convention:**

Base prompts use generic verbs that mixins replace with concrete commands:

| Abstract Verb | Beads Mixin | GitHub Issues Mixin | None Mixin |
|---------------|-------------|---------------------|------------|
| `<!-- scaffold:task-create "Title" priority=N -->` | `bd create "Title" -p N` | `gh issue create --title "Title" --label "priority:N"` | Add to TODO.md |
| `<!-- scaffold:task-list -->` | `bd list` | `gh issue list` | Review TODO.md |
| `<!-- scaffold:task-ready -->` | `bd ready` | `gh issue list --label "ready"` | Check TODO.md for unblocked items |
| `<!-- scaffold:task-claim ID -->` | `bd update ID --claim` | `gh issue edit ID --add-assignee @me` | Mark as in-progress in TODO.md |
| `<!-- scaffold:task-close ID -->` | `bd close ID` | `gh issue close ID` | Strike through in TODO.md |
| `<!-- scaffold:task-dep-add CHILD PARENT -->` | `bd dep add CHILD PARENT` | Add "blocked by #PARENT" to CHILD | Note dependency in TODO.md |
| `<!-- scaffold:task-show ID -->` | `bd show ID` | `gh issue view ID` | Read TODO.md entry |
| `<!-- scaffold:task-sync -->` | `bd sync` | _(no-op, GitHub is remote)_ | `git add TODO.md && git commit` |

HTML comments are universally ignored by execution engines, shells, and AI agent tool-use parsers. An agent encountering an unresolved marker will skip it rather than attempting to execute it. The `scaffold:` prefix makes it immediately identifiable as a scaffold system marker.

During `scaffold build`, the mixin injection replaces these abstract verbs with concrete commands. This means:
- Base prompts never reference `bd`, `gh issue`, or any specific tool directly
- A single base prompt works with any task-tracking mixin
- Prompts that are deeply methodology-specific (like execution loops) remain as methodology overrides/extensions, not base prompts

**Prompt classification — which prompts are base vs. override vs. extension:**

Not all current prompts can be base prompts. Prompts that are deeply intertwined with a specific methodology's workflow (e.g., the current Implementation Plan with its 20+ `bd` references and Beads-specific dependency graph logic) must be methodology overrides or extensions. The classification:

| Current Prompt | v2 Classification | Rationale |
|----------------|-------------------|-----------|
| PRD Creation | base | Methodology-agnostic product definition |
| PRD Gap Analysis | base | Methodology-agnostic analysis |
| Tech Stack | base | Universal concern |
| Coding Standards | base | Universal concern, mixin markers for TDD strictness |
| TDD Standards | base | Universal concern, mixin markers for strictness level |
| Project Structure | base | Universal concern |
| Dev Environment Setup | base | Universal concern |
| Design System | base (optional) | Universal for frontend projects |
| Git Workflow | base | Universal concern, mixin markers for workflow style |
| User Stories | base | Universal concern |
| User Stories Gaps | base | Universal concern |
| Add Playwright | base (optional) | Universal for web projects |
| Add Maestro | base (optional) | Universal for mobile projects |
| Beads Setup | deep extension | Beads-specific; other methodologies use different tracking setup |
| Implementation Plan | deep override | Deeply Beads-integrated; each methodology needs its own version |
| Implementation Plan Review | deep extension | Assumes Beads task graph structure |
| Claude.md Optimization | deep extension | Assumes CLAUDE.md structure from deep pipeline |
| Workflow Audit | deep extension | Verifies deep-specific doc set |
| Single Agent Start | deep extension | Assumes Beads execution loop |
| Multi Agent Start | deep extension | Assumes worktrees + Beads |
| Single Agent Resume | deep extension | Assumes Beads state |
| Multi Agent Resume | deep extension | Assumes worktrees + Beads |
| Claude Code Permissions | base | Universal Claude Code configuration |
| New Enhancement | deep extension | Assumes Beads for task creation |
| Quick Task | deep extension | Assumes Beads for tracking |
| Multi-Model Code Review | base (optional) | Universal, requires Codex/Gemini CLIs |
| User Stories Multi-Model Review | base (optional) | Universal review process |
| Implementation Plan Multi-Model Review | deep extension | Reviews Beads-specific task structure |
| Platform Parity Review | base (optional) | Universal for multi-platform |
| Session Analyzer | utility | Not part of pipeline; standalone analysis tool |

**Utility commands** (always available, not part of the pipeline manifest):

| Command | v2 Disposition |
|---------|----------------|
| version | CLI built-in (`scaffold version`) |
| version-bump | CLI built-in (`scaffold version-bump`) |
| release | CLI built-in (`scaffold release`) |
| update | CLI built-in (`scaffold update`) |
| prompt-pipeline | CLI built-in (`scaffold list --verbose`) |
| dashboard | CLI built-in (`scaffold dashboard`) |
| session-analyzer | CLI built-in (`scaffold analyze`) |

```
base/
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
  add-playwright.md
  add-maestro.md
  multi-model-review.md
  user-stories-multi-model-review.md
  platform-parity-review.md
```

Each base prompt contains **mixin insertion points** where axis-specific content gets injected. A single prompt may have multiple insertion points for the same axis (e.g., task-tracking referenced in both a "Setup" section and a "Workflow" section):

```markdown
## Task Tracking

<!-- mixin:task-tracking -->

...later in the same prompt...

## Closing a Task

<!-- mixin:task-tracking:close-workflow -->
```

#### Layer 2: Methodologies

Each methodology defines its own pipeline shape — which base prompts to include, which to override, and what new prompts to add.

```
methodologies/
  deep/
    manifest.yml
    overrides/
      implementation-plan.md
    extensions/
      beads-setup.md
      multi-agent-start.md
      single-agent-start.md
      multi-agent-resume.md
      single-agent-resume.md
      claude-md-optimization.md
      workflow-audit.md
  mvp/
    manifest.yml
    overrides/
      implementation-plan.md
    extensions/
      simple-tracking.md
  ddd/                           # Future
    manifest.yml
    overrides/
      create-prd.md
    extensions/
      domain-discovery.md
      bounded-contexts.md
      ubiquitous-language.md
```

**Manifest format** (`methodologies/deep/manifest.yml`):

```yaml
name: Scaffold Deep
description: Full pipeline with parallel agents, Beads tracking, and comprehensive standards
phases:
  - name: Product Definition
    prompts:
      - base:create-prd
      - base:review-prd
      - base:innovate-prd
  - name: Project Foundation
    prompts:
      - ext:beads-setup
      - base:tech-stack
      - base:claude-code-permissions
      - base:coding-standards
      - base:tdd
      - base:project-structure
  - name: Development Environment
    prompts:
      - base:dev-env-setup
      - base:design-system
        optional: { requires: frontend }
      - base:git-workflow
  - name: Testing Integration
    prompts:
      - base:add-playwright
        optional: { requires: web }
      - base:add-maestro
        optional: { requires: mobile }
  - name: Stories and Planning
    prompts:
      - base:user-stories
      - base:user-stories-gaps
      - base:user-stories-multi-model-review
        optional: { requires: multi-model-cli }
      - base:platform-parity-review
        optional: { requires: multi-platform }
  - name: Consolidation
    prompts:
      - ext:claude-md-optimization
      - ext:workflow-audit
  - name: Implementation
    prompts:
      - override:implementation-plan
      - ext:implementation-plan-review
      - ext:single-agent-start
      - ext:multi-agent-start
defaults:
  task-tracking: beads
  tdd: strict
  git-workflow: full-pr
  agent-mode: multi
dependencies:
  create-prd: []
  review-prd: [create-prd]
  innovate-prd: [review-prd]
  beads-setup: []
  tech-stack: [beads-setup]
  claude-code-permissions: [tech-stack]
  coding-standards: [tech-stack]
  tdd: [tech-stack]
  project-structure: [coding-standards, tdd]
  dev-env-setup: [project-structure]
  design-system: [dev-env-setup]
  git-workflow: [dev-env-setup]
  user-stories: [review-prd]
  user-stories-gaps: [user-stories]
  claude-md-optimization: [git-workflow]
  workflow-audit: [claude-md-optimization]
  implementation-plan: [user-stories, project-structure]
  implementation-plan-review: [implementation-plan]
```

**Resolution rules:**
- `base:<name>` — use prompt from `base/` directory
- `override:<name>` — use prompt from methodology's `overrides/` directory instead of base
- `ext:<name>` — use prompt from methodology's `extensions/` directory (no base equivalent)

**Optional prompt handling:**

Prompts can be marked `optional` with a `requires` condition. Valid conditions:

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

During `scaffold build`, optional prompts whose conditions are not met are excluded from the resolved set. Users can override by adding/removing traits in `config.yml`.

**Dependency graph is authoritative for ordering; phases are for grouping only.**

The `phases` section groups prompts for display (dashboard, pipeline reference). The `dependencies` section is authoritative for execution order — a prompt cannot run until all its dependencies are complete. If phases and dependencies conflict, dependencies win. All dependency keys use short names (matching the filename without extension); the namespace prefix (`base:`, `override:`, `ext:`) is only used in the `phases.prompts` list to specify resolution source.

#### Layer 3: Mixins

Small, focused content snippets injected at marked insertion points. Each axis has multiple options.

```
mixins/
  task-tracking/
    beads.md              # Beads CLI setup, bd commands, task lifecycle
    github-issues.md      # GitHub Issues integration, gh commands
    none.md               # Manual tracking guidance
  tdd/
    strict.md             # Test-first always, no exceptions
    relaxed.md            # Tests encouraged for critical paths
  git-workflow/
    full-pr.md            # Branches, PR review, squash merge
    simple.md             # Commit to main, lightweight
  agent-mode/
    multi.md              # Parallel worktrees, BD_ACTOR, task claiming
    single.md             # Single agent loop
    manual.md             # Human-driven, no agent loop
  interaction-style/
    claude-code.md        # AskUserQuestionTool, subagent delegation
    codex.md              # Autonomous decisions with NEEDS_USER_REVIEW tagging
    universal.md          # Present options as text, ask user to choose
```

**Injection mechanics:**

During `scaffold build`, the build step:
1. Reads the methodology manifest to determine which prompts to include
2. For each prompt, reads the source file (base, override, or extension)
3. Scans for `<!-- mixin:<axis-name> -->` markers
4. Replaces each marker with the content of the selected mixin file
5. Passes the resolved prompt to platform adapters

**interaction-style** — Controls how prompts interact with the user during execution.

| Option | Behavior |
|--------|----------|
| `claude-code` | Uses `AskUserQuestionTool` for decisions. Delegates parallel research to subagents via the `Agent` tool. Conversational multi-phase workflows with context carryover between phases. |
| `codex` | Makes autonomous best-judgment decisions based on project context and PRD. Tags high-stakes decisions (database choice, auth approach, infrastructure) with `NEEDS_USER_REVIEW` in `decisions.jsonl` for post-execution review. Performs research sequentially inline rather than via subagents. Includes explicit "carry forward" context summaries between prompt phases since Codex may not retain conversational memory. |
| `universal` | Presents options as numbered text lists. Asks the user to choose before proceeding. If running in an automated context, chooses options marked `(recommended)` and documents the choice. No tool-specific references. |

The interaction-style axis is distinct from tool-name mapping in the platform adapter. Tool mapping handles surface-level name translation (`Read tool` → `read the file`). The interaction-style mixin handles **behavioral differences**: how the agent makes decisions, whether it delegates to subagents, how it communicates with the user, and how it carries context across multi-phase workflows. Both mechanisms are needed — tool mapping catches incidental tool references in prose, while the interaction-style mixin shapes the instructional structure.

### Configuration

**`.scaffold/config.yml`** — the per-project configuration file:

```yaml
version: 1
methodology: deep
mixins:
  task-tracking: beads
  tdd: strict
  git-workflow: full-pr
  agent-mode: multi
  interaction-style: claude-code
platforms:
  - claude-code
  - codex
```

This file is:
- Written by `scaffold init` (interactive wizard)
- Editable by hand
- Read by `scaffold build` to resolve the prompt set
- Committed to the project repo (so all contributors use the same flavor)

### Rebuild Behavior

`scaffold build` is **idempotent** — it always regenerates platform outputs from scratch based on the current `config.yml`. It does not have its own "update mode."

**Mode Detection blocks in prompts pass through the build system unmodified.** Mode Detection operates at *runtime* (when the user executes a prompt and it checks whether `docs/plan.md` exists) — not at *build time*.

**Reconfiguration after initial build:**

Users may change `config.yml` at any time and re-run `scaffold build`. The build system:
1. Regenerates all platform outputs (commands, AGENTS.md, universal prompts)
2. Prints a diff summary: "Added 3 prompts, removed 2, modified 5"
3. **Does NOT modify project artifacts** that were created by running prompts (e.g., `docs/plan.md`, `docs/implementation-plan.md`, `CLAUDE.md`)

If the user changes methodology or task-tracking mixin after already running prompts, their existing project artifacts may reference the old tooling. This is expected — the Mode Detection in prompts handles this: when the user re-runs a prompt (e.g., `/scaffold:implementation-plan`), it detects the existing artifact, shows what changed, and updates in place.

**Changing methodology is supported but advisory:**

```
$ scaffold build
Warning: Methodology changed from 'deep' to 'mvp'.
Previously generated project artifacts may reference concepts from 'deep'.
Re-run affected prompts to update artifacts. Changed prompts:
  - implementation-plan (was: deep override, now: mvp override)
  - beads-setup (removed — not in mvp)
  + simple-tracking (added — new in mvp)
Proceed? [y/N]
```

### Error Handling

`scaffold build` validates the configuration before generating outputs:

**Config validation:**
- `methodology` must match an installed methodology directory
- Each `mixins.<axis>` value must match an installed mixin file (`mixins/<axis>/<value>.md`)
- Each `platforms` entry must match an installed adapter (`claude-code`, `codex`)
- `project` traits must be known condition names
- Each `extra-prompts` entry must resolve to an existing file (`.scaffold/prompts/<name>.md` or `~/.scaffold/prompts/<name>.md`) with valid YAML frontmatter. Missing files or invalid frontmatter are errors

**Manifest validation:**
- Every prompt reference (`base:X`, `override:X`, `ext:X`) must resolve to an existing file
- Every dependency key must match a prompt in the `phases` list
- No circular dependencies
- Optional prompt conditions must reference valid traits

**Mixin validation:**
- Every `<!-- mixin:<axis> -->` marker in a resolved prompt must have a corresponding axis in the config
- **Unresolved mixin markers are errors by default.** If a resolved prompt contains a `<!-- mixin:<axis> -->` marker that was not replaced during injection (because the axis is not configured or the mixin file has no matching section), `scaffold build` reports an error. An unresolved marker in a prompt that an agent executes would be silently ignored or misinterpreted — this is worse than a build failure. Use `--allow-unresolved-markers` to downgrade to warnings during development.
- Warn (not error) if a prompt has no markers for an axis that would logically apply — this is the inverse case (missing marker, not unresolved marker) and is less dangerous

**Incompatible combination warnings:**
- `agent-mode: manual` + `git-workflow: full-pr` — warn: full PR flow assumes automated agent execution
- `task-tracking: none` + `agent-mode: multi` — warn: parallel agents need shared task tracking to avoid conflicts
- These are warnings, not errors — users may have valid reasons to combine them

Error messages include the config path, the specific invalid value, and the list of valid options.

### Platform Adapters

Each adapter reads the resolved prompt set and packages it for a specific platform.

#### Claude Code Adapter

- Generates `commands/*.md` with YAML frontmatter (description, long-description, argument-hint)
- Generates/updates `CLAUDE.md` with methodology-appropriate agent guidance
- Generates "After This Step" navigation sections based on manifest phase ordering
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

Patterns are matched longest-first to avoid partial replacements. Each pattern is a complete phrase, not a single word — this prevents grammatically broken output. Base prompts and mixins should prefer abstract language where possible (e.g., "examine the file" rather than "use the Read tool"), reserving tool-specific references for cases where the exact tool matters. The mapping handles cases where tool-specific language slips through.

**MCP tool handling:** Prompts that reference MCP tools (Playwright MCP, etc.) are handled via the interaction-style mixin and platform adapter together. The Claude Code adapter preserves MCP references. The Codex adapter replaces MCP tool instructions with equivalent direct-command alternatives (e.g., Playwright MCP screenshot instructions become `npx playwright screenshot` CLI commands). If no equivalent exists, the adapter wraps the section in a comment: `<!-- Platform note: this section requires MCP tools not available in Codex. Skip or adapt manually. -->`.

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
scaffold build             # Config -> platform-specific outputs
scaffold list              # Show available methodologies and mixins
scaffold info              # Show current project's config and resolved prompt count
scaffold add <axis> <val>  # Add/change a mixin (e.g., scaffold add tdd relaxed)
scaffold update            # Pull latest scaffold version and rebuild
scaffold version           # Show installed version
```

#### Runtime Orchestration Commands

In addition to the build-time commands above, the CLI provides runtime commands for managing pipeline execution:

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
| 5 | Build error (mixin injection failed, adapter error) |

**Fuzzy matching in error messages** — When a value doesn't match any valid option (methodology names, mixin values, prompt names), the CLI computes Levenshtein distance and suggests the closest match if the distance is ≤ 2. Example:

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
      "source": "base",
      "at": "2026-03-12T10:35:00Z",
      "produces": ["docs/plan.md"],
      "artifacts_verified": true,
      "completed_by": "ken"
    },
    "review-prd": {
      "status": "completed",
      "source": "base",
      "at": "2026-03-12T10:42:00Z",
      "produces": ["docs/reviews/pre-review-prd.md"],
      "artifacts_verified": true,
      "completed_by": "ken"
    },
    "innovate-prd": {
      "status": "completed",
      "source": "base",
      "at": "2026-03-12T10:45:00Z",
      "produces": ["docs/prd-innovation.md"],
      "artifacts_verified": true,
      "completed_by": "ken",
      "conditional": "if-needed"
    },
    "design-system": {
      "status": "skipped",
      "source": "base",
      "at": "2026-03-12T11:00:00Z",
      "reason": "No frontend"
    },
    "dev-env-setup": {
      "status": "pending",
      "source": "base",
      "produces": ["docs/dev-setup.md", "Makefile"]
    }
  },
  "next_eligible": ["dev-env-setup"],
  "extra-prompts": []
}
```

Each prompt entry includes:
- `status`: One of `pending`, `in_progress`, `skipped`, `completed`
- `source`: Resolution source — `base`, `override`, or `ext`
- `at`: ISO 8601 timestamp (set when completed or skipped)
- `produces`: Copied from prompt frontmatter so agents don't need to load prompt files to verify artifacts
- `artifacts_verified`: Boolean, set after artifact existence check
- `completed_by`: Actor identity for multi-agent attribution
- `reason`: Explanation for skipped prompts

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

### Prompt Frontmatter

All prompts (base, override, extension) use YAML frontmatter declaring metadata used by the CLI for orchestration:

```yaml
---
description: "Research and document technology decisions"
depends-on: [create-prd, beads-setup]
phase: 2
argument-hint: "<tech constraints or preferences>"
produces: ["docs/tech-stack.md"]
reads: ["docs/plan.md"]
---
```

Fields:
- `description` (required): Short description for pipeline display and help
- `depends-on` (optional): Prompt names this prompt depends on. Defaults to empty. **Note**: These supplement the manifest's `dependencies` section — if both declare dependencies for the same prompt, they are merged (union)
- `phase` (optional): Phase number for display grouping. Defaults to phase of last dependency, or 1
- `argument-hint` (optional): Hint for argument substitution, shown in help
- `produces` (required for built-in, optional for custom): Expected output file paths. Used by completion detection, v1 detection, and step gating
- `reads` (optional): Input file paths this prompt needs. Supports both full-file and section-level references. Used to pre-load predecessor documents into context before execution
- `artifact-schema` (optional): Defines the expected structure of produced artifacts for downstream validation
- `requires-capabilities` (optional): Declares platform capabilities the prompt needs

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

Mixins may inject content within existing sections but must not add new heading-level sections (`##` or above) to artifacts. This ensures that artifact schemas remain stable regardless of which mixins are active.

**`requires-capabilities`** — Declares platform capabilities the prompt needs:

```yaml
requires-capabilities:
  - user-interaction
  - filesystem-write
  - subagent
```

Valid capabilities: `user-interaction` (prompt asks the user questions), `filesystem-write` (prompt creates files), `subagent` (prompt delegates to subagents), `mcp` (prompt uses MCP tools), `git` (prompt runs git commands). The platform adapter checks declared capabilities against platform support. Missing capabilities produce a warning with adaptation guidance, not a hard error.

### Prompt Structure Convention

All prompts (base, override, extension) follow a standard section ordering convention that front-loads the most critical information for agent consumption:

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
1. Build adjacency list and in-degree count from all `depends-on` declarations (manifest + frontmatter, merged)
2. Initialize queue with all prompts that have in-degree 0 (no dependencies)
3. While queue is non-empty: dequeue, add to sorted list, decrement in-degree for dependents. If any reach 0, enqueue (using manifest phase order as tiebreaker)
4. If sorted list length != total prompt count, a cycle exists — report it
5. Verification step: confirm every prompt appears after all its dependencies in the final list

Resolution happens once at `scaffold build` time and is cached. Re-resolved when config or manifest changes.

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
- Validates config, manifests, and prompt files for errors without modifying anything
- Checks: valid methodology, mixin values, prompt references resolve, no circular deps, valid frontmatter, prompt-override paths exist
- Produced artifacts match their `artifact-schema` (required sections present with exact heading text, ID format matches regex, index table present if required)
- Tracking comments on line 1 of produced artifacts are well-formed
- No unresolved `<!-- scaffold:task-*` or `<!-- mixin:* -->` markers in produced artifacts
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
- Shows: prompt names, phases, dependencies, source (base/override/ext), expected output artifacts
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
3. Built-in prompt (resolved via methodology: base/override/ext)

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

**Reserved structure:** The Beads/tracking setup prompt (or equivalent methodology extension) creates CLAUDE.md with all section headings pre-defined. Later prompts fill their reserved sections rather than appending new ones:

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
<!-- scaffold:<prompt-name> v<version> <date> <methodology>/<mixin-summary> -->
```

Example:
```
<!-- scaffold:tech-stack v1 2026-03-12 deep/strict-tdd/beads -->
```

The methodology and mixin context enable Mode Detection to handle artifacts created under a different configuration — if the user switched from `deep` to `mvp`, the update mode knows which sections may no longer apply.

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

**Adapted prompts:** Four base prompts have brownfield-aware behavior (triggered by reading `mode` from config):
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

? Choose a methodology:
  > Scaffold Deep -- Full pipeline, parallel agents, comprehensive standards
    Scaffold Lite -- Streamlined pipeline for solo developers
    (more added over time)

? Task tracking:
  > Beads (AI-native, git-backed)
    GitHub Issues
    None

? TDD approach:
  > Strict (test-first always)
    Relaxed (tests encouraged)

? Git workflow:
  > Full PR flow (branches, review, squash merge)
    Simple (commit to main)

? Agent mode:
  > Multi-agent (parallel worktrees)
    Single agent
    Manual (human-driven)

? Target platforms:
  [x] Claude Code
  [x] Codex

Config written to .scaffold/config.yml
Running scaffold build...
Generated 24 Claude Code commands
Generated AGENTS.md sections
Generated universal prompts

Run /scaffold:prompt-pipeline to see your pipeline.
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
  base/                    # Base prompts
  methodologies/           # Methodology definitions
  mixins/                  # Axis mixin content
  adapters/                # Platform adapter logic
  lib/                     # Shared utilities
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
- The existing `commands/` directory in the scaffold repo serves as the "deep + all defaults" pre-built output

### Migration Path

#### Phase 1: Foundation

**Build system:**
- Build the CLI shell (Node.js, `@inquirer/prompts`)
- Implement: `scaffold init`, `scaffold build`, `scaffold list`, `scaffold info`, `scaffold version`
- Decompose current `prompts.md` into `base/` + `methodologies/deep/`
- Add frontmatter (`produces`, `reads`, `depends-on`, `phase`) to all prompts
- Identify and extract mixin insertion points from existing prompts
- Create mixin content files for each axis
- Build the mixin injection system (marker replacement)
- Build dependency resolution (Kahn's algorithm)
- Build the Claude Code adapter (replacing `scripts/extract-commands.sh`)

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

- Add `mvp` methodology (streamlined pipeline for solo devs)
- Add additional mixin options as needed
- Write methodology authoring guide for future methodologies (DDD, Lean MVP, etc.)
- Add new methodologies

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Methodology as top-level organizer | Methodologies are coherent philosophies; mixing phases across them produces incoherent results |
| Manifest-driven phase ordering | Each methodology defines its own pipeline shape, not just content |
| Mixin injection over templating | Keeps prompt files clean; avoids conditional spaghetti in prompts |
| Config file over runtime flags | Stable per-project; both AI tools read the same config; committed to repo |
| Universal adapter always generated | Escape hatch for any AI tool, including future ones |
| Standalone CLI as source of truth | Platform integrations are thin wrappers, not primary interfaces |
| npm as primary distribution | Node already required for Codex; npx enables zero-install usage |
| Homebrew as secondary | Native macOS/Linux feel; no Node dependency for users who don't need Codex |

### Resolved Design Questions

These were open questions during brainstorming, now resolved:

1. **CLI implementation language: Node.js** — Node.js for the CLI shell, wizard (using `@inquirer/prompts`), build system, and adapters. Rationale: natural for npm distribution, required for Codex users anyway, better interactive prompt libraries than bash. This is a shift from the current all-bash convention and will require updating CLAUDE.md, coding-standards, and test infrastructure for the v2 codebase. Bash scripts may still be used for git/shell-heavy utilities where appropriate.

2. **Mixin granularity: Multiple markers per prompt allowed** — A single prompt may have multiple `<!-- mixin:<axis> -->` markers, and may also use `<!-- mixin:<axis>:<sub-section> -->` for targeted injection of subsections within a mixin. Each mixin file can contain named subsections delimited by `<!-- section:<name> -->` markers. If a prompt requests `<!-- mixin:task-tracking:close-workflow -->`, only the matching subsection is injected.

3. **Methodology versioning: Bundled with CLI** — Methodologies ship as part of the npm/Homebrew package. No independent versioning initially. Revisit when community contributions begin.

4. **Config inheritance: Deferred** — Global `~/.scaffold/defaults.yml` is a nice-to-have for a future release, not Phase 1-3 scope.

5. **npm package name: TBD, requires research** — Must be resolved before Phase 1 implementation begins. Candidates: `@scaffold-pipeline/cli`, `@zigrivers/scaffold`, `create-scaffold`. Research npm namespace availability as a Phase 1 prerequisite task.

### Config Versioning

The config file includes a `version` field (starting at `1`) that tracks the config schema version. Contract:

- **Minor CLI updates** do not change the config version — new optional fields may be added with defaults
- **Breaking config changes** increment the version number
- `scaffold build` checks the config version:
  - If current: proceeds normally
  - If old: runs `scaffold config migrate` automatically to upgrade the config format, shows diff, asks for confirmation
  - If newer than CLI supports: errors with "please update scaffold"
- Migration logic is forward-only (v1 -> v2 -> v3, no downgrades)

### Remaining Open Questions

1. **Exact npm package name** — requires namespace availability research (see Resolved #5)
2. **Codex command invocation pattern** — How does a Codex user "run" a scaffold prompt? Best current option: `codex "Follow the instructions in codex-prompts/create-prd.md to create a PRD for <idea>"`. Needs validation with real Codex usage patterns as they evolve.

## Non-Functional Requirements

### Performance

- **Build resolution**: `scaffold build` completes in under 2 seconds for up to 50 prompts (topological sort + mixin injection + adapter generation)
- **Prompt loading**: Loading any prompt from any tier completes in under 100ms
- **State reads/writes**: Reading/writing `state.json` completes in under 100ms (file is under 10KB)
- **No background processes**: All operations are synchronous. No daemons, watchers, or background services

### Reliability

- **Crash recovery**: If a session crashes mid-prompt, no data is lost. The prompt is not marked complete. `scaffold resume` picks up where it left off
- **State integrity**: `state.json` is written atomically (write to temp file, rename). If corrupted, `scaffold resume` falls back to artifact-based completion detection and regenerates state
- **Idempotent builds**: `scaffold build` produces identical output given identical inputs. Running it twice is safe
- **Idempotent prompts**: Running a prompt twice overwrites outputs cleanly (Mode Detection handles fresh vs. update)
- **Merge-safe file formats**: All scaffold state files (`state.json`, `decisions.jsonl`, `config.yml`) are designed for conflict-free git merges when multiple team members work concurrently. `state.json` uses a map-keyed-by-prompt-name structure. `decisions.jsonl` uses JSONL (one object per line, append-only). `config.yml` is a flat structure with no arrays that grow over time.

### Compatibility

- **Operating systems**: macOS and Linux. Windows via WSL expected to work but not tested
- **Node.js**: Requires Node.js 18+ (for CLI). Codex already requires Node.js 22+
- **Claude Code**: Requires plugin support. Specific minimum version TBD
- **Codex**: Compatible with current Codex CLI. Adapter will be updated as Codex evolves

### Security

- **No credential storage**: Scaffold does not store API keys, tokens, or credentials
- **No network access**: The CLI makes no network requests (except `scaffold update` which pulls from npm/GitHub)
- **File permissions**: `.scaffold/` directory and contents use default file permissions

## Risks

1. **Prompt content drift during v2 engine work.** Building the CLI, decomposing prompts, and writing adapters is substantial. If prompt content is also being improved in parallel, merge conflicts and content drift occur.
   - **Mitigation**: Freeze prompt content changes during v2 engine development. Port existing prompts as-is with only frontmatter additions and mixin marker insertion.

2. **Abstract task verb decomposition is harder than expected.** The 192 Beads-specific references may resist clean abstraction — some are deeply embedded in instructional flow, not just command invocations.
   - **Mitigation**: Accept that some prompts cannot be base prompts (the classification table already accounts for this). Start with the prompts classified as "base" and validate the abstraction works before attempting more.

3. **Cross-platform prompt quality divergence.** Prompts optimized for Claude Code's tool-use capabilities may work poorly when adapted for Codex, which has different strengths and constraints.
   - **Mitigation**: Test every prompt on both platforms during Phase 2. Maintain platform-specific testing in CI. Accept that some prompts may need platform-specific variants (handled via adapters).

4. **Complexity for first-time users.** v2 adds concepts (methodologies, mixins, platforms, state tracking) that didn't exist in v1.
   - **Mitigation**: The default experience (`scaffold init`) is simpler than v1 — answer a few questions and go. Advanced features (custom prompts, brownfield, manual mixin composition) are opt-in.

5. **npm package name conflict.** The "scaffold" name is generic and may conflict with existing packages.
   - **Mitigation**: Research npm namespace availability as a Phase 1 prerequisite. Have backup candidates ready.

6. **Agent ergonomics gaps in prompt design.** Prompts designed for human reading may not be optimally structured for AI agent execution — agents need front-loaded instructions, machine-checkable completion criteria, and minimal boilerplate.
   - **Mitigation**: Enforce the Prompt Structure Convention (What to Produce → Completion Criteria → Process → Specs → Update Mode) for all prompts during the v1-to-v2 prompt decomposition. Extract shared boilerplate (Mode Detection, After This Step navigation) into CLI behavior rather than prompt content. Validate prompt structure as part of `scaffold validate`.

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

- **Automatic prompt execution without confirmation**: Every prompt requires user confirmation. No unattended mode
- **Prompt versioning or rollback**: Users delete override files to revert. No version history within scaffold
- **Remote methodology registry**: Methodologies are shared via git or npm. No central marketplace
- **Parallel prompt execution**: Prompts run sequentially. Parallel agents are for implementation, not pipeline setup
- **Runtime prompt generation**: Prompts are static markdown with mixin injection at build time. No dynamic generation
- **Pipeline Context (context.json)**: Deferred from plan.md. Cross-prompt data sharing adds complexity; prompts read predecessor output files directly. May revisit in a future version
