# Scaffold v2: Modular, Cross-Platform Pipeline

**Date:** 2026-03-12
**Status:** Draft
**Author:** Ken Allred + Claude

## Revision History

| Date | Change |
|------|--------|
| 2026-03-12 | Initial draft |
| 2026-03-12 | Address spec review: decomposition strategy, optional prompts, reconfiguration, error handling, prompt classification, resolve open questions |

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
| `{task:create "Title" priority=N}` | `bd create "Title" -p N` | `gh issue create --title "Title" --label "priority:N"` | Add to TODO.md |
| `{task:list}` | `bd list` | `gh issue list` | Review TODO.md |
| `{task:ready}` | `bd ready` | `gh issue list --label "ready"` | Check TODO.md for unblocked items |
| `{task:claim ID}` | `bd update ID --claim` | `gh issue edit ID --add-assignee @me` | Mark as in-progress in TODO.md |
| `{task:close ID}` | `bd close ID` | `gh issue close ID` | Strike through in TODO.md |
| `{task:dep-add CHILD PARENT}` | `bd dep add CHILD PARENT` | Add "blocked by #PARENT" to CHILD | Note dependency in TODO.md |
| `{task:show ID}` | `bd show ID` | `gh issue view ID` | Read TODO.md entry |
| `{task:sync}` | `bd sync` | _(no-op, GitHub is remote)_ | `git add TODO.md && git commit` |

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
| Beads Setup | classic extension | Beads-specific; other methodologies use different tracking setup |
| Implementation Plan | classic override | Deeply Beads-integrated; each methodology needs its own version |
| Implementation Plan Review | classic extension | Assumes Beads task graph structure |
| Claude.md Optimization | classic extension | Assumes CLAUDE.md structure from classic pipeline |
| Workflow Audit | classic extension | Verifies classic-specific doc set |
| Single Agent Start | classic extension | Assumes Beads execution loop |
| Multi Agent Start | classic extension | Assumes worktrees + Beads |
| Single Agent Resume | classic extension | Assumes Beads state |
| Multi Agent Resume | classic extension | Assumes worktrees + Beads |
| Claude Code Permissions | base | Universal Claude Code configuration |
| New Enhancement | classic extension | Assumes Beads for task creation |
| Quick Task | classic extension | Assumes Beads for tracking |
| Multi-Model Code Review | base (optional) | Universal, requires Codex/Gemini CLIs |
| User Stories Multi-Model Review | base (optional) | Universal review process |
| Implementation Plan Multi-Model Review | classic extension | Reviews Beads-specific task structure |
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
  prd-gap-analysis.md
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
  classic/
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
  classic-lite/
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

**Manifest format** (`methodologies/classic/manifest.yml`):

```yaml
name: Scaffold Classic
description: Full pipeline with parallel agents, Beads tracking, and comprehensive standards
phases:
  - name: Product Definition
    prompts:
      - base:create-prd
      - base:prd-gap-analysis
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
  prd-gap-analysis: [create-prd]
  beads-setup: []
  tech-stack: [beads-setup]
  claude-code-permissions: [tech-stack]
  coding-standards: [tech-stack]
  tdd: [tech-stack]
  project-structure: [coding-standards, tdd]
  dev-env-setup: [project-structure]
  design-system: [dev-env-setup]
  git-workflow: [dev-env-setup]
  user-stories: [create-prd]
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
```

**Injection mechanics:**

During `scaffold build`, the build step:
1. Reads the methodology manifest to determine which prompts to include
2. For each prompt, reads the source file (base, override, or extension)
3. Scans for `<!-- mixin:<axis-name> -->` markers
4. Replaces each marker with the content of the selected mixin file
5. Passes the resolved prompt to platform adapters

### Configuration

**`.scaffold/config.yml`** — the per-project configuration file:

```yaml
version: 1
methodology: classic
mixins:
  task-tracking: beads
  tdd: strict
  git-workflow: full-pr
  agent-mode: multi
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
Warning: Methodology changed from 'classic' to 'classic-lite'.
Previously generated project artifacts may reference concepts from 'classic'.
Re-run affected prompts to update artifacts. Changed prompts:
  - implementation-plan (was: classic override, now: classic-lite override)
  - beads-setup (removed — not in classic-lite)
  + simple-tracking (added — new in classic-lite)
Proceed? [y/N]
```

### Error Handling

`scaffold build` validates the configuration before generating outputs:

**Config validation:**
- `methodology` must match an installed methodology directory
- Each `mixins.<axis>` value must match an installed mixin file (`mixins/<axis>/<value>.md`)
- Each `platforms` entry must match an installed adapter (`claude-code`, `codex`)
- `project` traits must be known condition names

**Manifest validation:**
- Every prompt reference (`base:X`, `override:X`, `ext:X`) must resolve to an existing file
- Every dependency key must match a prompt in the `phases` list
- No circular dependencies
- Optional prompt conditions must reference valid traits

**Mixin validation:**
- Every `<!-- mixin:<axis> -->` marker in a resolved prompt must have a corresponding axis in the config
- Warn (not error) if a prompt has no markers for an axis that would logically apply

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

Prompts may reference platform-specific tool names (e.g., "use the Read tool to examine the file"). The Codex adapter applies a mapping table to translate these references. The mapping lives in `adapters/codex/tool-map.yml`:

```yaml
# Claude Code tool -> Codex equivalent
Read: "read the file"           # Codex uses natural language file access
Edit: "edit the file"
Write: "write the file"
Glob: "find files matching"
Grep: "search for"
Bash: "run the command"
Agent: "use a subagent"         # Codex may not have equivalent; mapped to inline instruction
```

Mapping is applied as string replacement during the adapter's output generation step. Base prompts and mixins should prefer abstract language where possible (e.g., "examine the file" rather than "use the Read tool"), reserving tool-specific references for cases where the exact tool matters. The mapping handles cases where tool-specific language slips through.

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

#### `scaffold init` Wizard Flow

```
Welcome to Scaffold!

? Choose a methodology:
  > Scaffold Classic -- Full pipeline, parallel agents, comprehensive standards
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
- Users who never run `scaffold init` get current behavior unchanged (classic methodology, all defaults)
- The existing `commands/` directory in the scaffold repo serves as the "classic + all defaults" pre-built output

### Migration Path

#### Phase 1: Foundation

- Build the CLI shell (`scaffold init`, `scaffold build`, `scaffold list`, `scaffold info`)
- Decompose current `prompts.md` into `base/` + `methodologies/classic/`
- Identify and extract mixin insertion points from existing prompts
- Create mixin content files for each axis
- Build the mixin injection system (marker replacement)
- Build the Claude Code adapter (replacing `scripts/extract-commands.sh`)
- npm packaging and Homebrew formula
- Tests for CLI, resolution logic, and adapters

#### Phase 2: Cross-Platform

- Build the Codex adapter (AGENTS.md generation, tool-name mapping)
- Build the universal adapter (plain markdown output)
- Test both Claude Code and Codex consuming prompts in the same project
- Document cross-platform usage patterns

#### Phase 3: New Content

- Add `classic-lite` methodology (streamlined pipeline for solo devs)
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
