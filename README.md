# Scaffold

A TypeScript CLI that assembles AI-powered prompts at runtime to guide you from "I have an idea" to working software. Scaffold walks you through 50 structured pipeline steps — organized into 14 phases — and Claude Code handles the research, planning, and implementation for you.

By the end, you'll have a fully planned, standards-documented, implementation-ready project with working code.

## What is Scaffold?

Scaffold is a composable meta-prompt pipeline built for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Anthropic's command-line coding tool. If you have an idea for a software project but don't know where to start — or you want to make sure your project is set up with solid architecture, standards, and tests from day one — Scaffold guides you through every step.

Here's how it works:

1. **Initialize** — run `scaffold init` in your project directory. The init wizard detects whether you're starting fresh (greenfield) or working with an existing codebase (brownfield), and lets you pick a methodology preset (deep, mvp, or custom).

2. **Run steps** — each step is a composable meta-prompt (a short intent declaration in `pipeline/`) that gets assembled at runtime into a full 7-section prompt. The assembly engine injects relevant knowledge base entries, project context from prior steps, methodology settings, and depth-appropriate instructions.

3. **Follow the dependency graph** — Scaffold tracks which steps are complete, which are eligible, and which are blocked. Run `scaffold next` to see what's unblocked, or `scaffold status` for the full picture. Each step produces a specific artifact — a planning document, architecture decision, specification, or actual code.

You can run steps two ways:

- **CLI**: `scaffold run create-prd` — the assembly engine builds a full prompt from the meta-prompt, knowledge base entries, and project context. Best for the structured pipeline with dependency tracking.
- **Slash commands**: `/scaffold:create-prd` in Claude Code — uses pre-rendered, self-contained prompts. Best for quick access to individual commands without the full pipeline ceremony.

Either way, Scaffold constructs the prompt and Claude does the work. The CLI tracks pipeline state and dependencies; slash commands are fire-and-forget.

## Key Concepts

**Meta-prompts** — Each pipeline step is defined as a short `.md` file in `pipeline/` with YAML frontmatter (dependencies, outputs, knowledge entries) and a markdown body describing the step's intent. These are *not* the prompts Claude sees — they're assembled into full prompts at runtime.

**Assembly engine** — At execution time, Scaffold builds a 7-section prompt from: system metadata, the meta-prompt, knowledge base entries, project context (artifacts from prior steps), methodology settings, layered instructions, and depth-specific execution guidance.

**Knowledge base** — 44 domain expertise entries in `knowledge/` covering testing strategy, domain modeling, API design, security best practices, eval craft, and more. These get injected into prompts based on each step's `knowledge-base` frontmatter field. Knowledge files with a `## Deep Guidance` section are optimized for CLI assembly — only the deep guidance content is loaded, avoiding redundancy with the prompt text. Teams can add project-local overrides in `.scaffold/knowledge/` that layer on top of the global entries.

**Methodology presets** — Three built-in presets control which steps run and how deep the analysis goes:
- **deep** (depth 5) — all steps enabled, exhaustive analysis
- **mvp** (depth 1) — 7 critical steps, get to code fast
- **custom** (depth 1-5) — you choose which steps to enable and how deep each one goes

**Depth scale** (1-5) — Controls how thorough each step's output is, from "focus on the core deliverable" (1) to "explore all angles, tradeoffs, and edge cases" (5). Depth resolves with 4-level precedence: CLI flag > step override > custom default > preset default.

**Multi-model validation** — At depth 4-5, all 15 review and validation steps can dispatch independent reviews to Codex and/or Gemini CLIs. Two independent models catch more blind spots than one. When both CLIs are available, findings are reconciled by confidence level (both agree = high confidence, single model P0 = still actionable). See the [Multi-Model Review](#multi-model-review) section.

**State management** — Pipeline progress is tracked in `.scaffold/state.json` with atomic file writes and crash recovery. An advisory lock prevents concurrent runs. Decisions are logged to an append-only `decisions.jsonl`.

**Dependency graph** — Steps declare their prerequisites in frontmatter. Scaffold builds a DAG, runs topological sort (Kahn's algorithm), detects cycles, and computes which steps are eligible at any point.

## Prerequisites

### Required

**Node.js** (v18 or later)
- Install: https://nodejs.org or `brew install node`
- Verify: `node --version`

**Git**
- Install: https://git-scm.com or `brew install git`
- Verify: `git --version`

**Claude Code**
The AI coding assistant that runs the assembled prompts. Claude Code is a command-line tool from Anthropic.
- Install: `npm install -g @anthropic-ai/claude-code`
- Verify: `claude --version`
- Docs: https://docs.anthropic.com/en/docs/claude-code

### Optional

**Codex CLI** (for multi-model review)
Independent code review from a different AI model. Used at depth 4-5 by all review steps.
- Install: `npm install -g @openai/codex`
- Requires: ChatGPT subscription (Plus/Pro/Team)
- Verify: `codex --version`

**Gemini CLI** (for multi-model review)
Independent review from Google's model. Can run alongside or instead of Codex.
- Install: `npm install -g @google/gemini-cli`
- Requires: Google account (free tier available)
- Verify: `gemini --version`

**Playwright MCP** (web apps only)
Lets Claude control a real browser for visual testing and screenshots.
- Install: `claude mcp add playwright npx @playwright/mcp@latest`

## Installation

Scaffold has two parts that install separately:

- **CLI** (`scaffold`) — the core tool. Install via npm or Homebrew. Use it from your terminal or from Claude Code with `! scaffold run <step>`.
- **Plugin** (`/scaffold:`) — optional slash commands for Claude Code. Lets you type `/scaffold:create-prd` instead of `! scaffold run create-prd`.

### Step 1: Install the CLI

Pick one:

**npm (recommended)**

```bash
npm install -g @zigrivers/scaffold
```

**Homebrew**

```bash
brew tap zigrivers/scaffold
brew install scaffold
```

Verify: `scaffold version`

### Step 2: Add the plugin (recommended)

Install the Scaffold plugin inside Claude Code for slash commands AND the interactive runner skill:

```
/plugin marketplace add zigrivers/scaffold
/plugin install scaffold@zigrivers-scaffold
```

This gives you:
- **Slash commands** (`/scaffold:create-prd`, `/scaffold:tdd`, etc.) — quick access to any pipeline step
- **Scaffold Runner skill** — intelligent interactive wrapper that surfaces decision points (depth level, strictness, optional sections) before execution instead of letting Claude pick defaults silently
- **Pipeline reference skill** — shows pipeline ordering, dependencies, and completion status
- **Multi-model dispatch skill** — correct invocation patterns for Codex and Gemini CLIs

**Usage** — just tell Claude Code what you want in natural language:
```
"Run the next scaffold step"          → previews prompt, asks decisions, executes
"Run scaffold create-prd"             → same for a specific step
"Where am I in the pipeline?"         → shows progress and next eligible steps
"What's left?"                        → compact view of remaining steps only
"Skip design-system and add-e2e-testing"  → batch skip with reason
"Is add-e2e-testing applicable?"      → checks platform detection without running
"Use depth 3 for everything"          → remembers preference for the session
```

The plugin is optional — everything it does can also be done with `scaffold run <step>` from the CLI. But you lose the interactive decision surfacing without the Scaffold Runner skill.

> **CLI-only users**: If you prefer not to install the plugin, add skills with one command:
> ```bash
> scaffold skill install
> ```
> This copies the Scaffold Runner, Pipeline Reference, and Multi-Model Dispatch skills to `.claude/skills/` in your project.

## Updating

### npm

```bash
npm update -g @zigrivers/scaffold
```

### Homebrew

```bash
brew upgrade scaffold
```

### Plugin

```
/scaffold:update
```

Or: `/plugin marketplace update zigrivers-scaffold`

### Existing projects

After upgrading the CLI, existing projects migrate automatically. Run `scaffold status` in your project directory — the state manager detects and renames old step keys, removes retired steps, normalizes artifact paths, and persists the changes atomically. No manual editing of `.scaffold/state.json` is needed.

**Step migrations handled automatically:**
- `add-playwright` / `add-maestro` → `add-e2e-testing`
- `multi-model-review` → `automated-pr-review`
- `user-stories-multi-model-review` → removed (folded into `review-user-stories`)
- `claude-code-permissions` → removed (folded into `git-workflow` + `tech-stack`)
- `testing-strategy` → `tdd`, `implementation-tasks` → `implementation-plan`, `review-tasks` → `implementation-plan-review`

The PRD is always created as `docs/plan.md`. If you have a legacy `docs/prd.md` from an older version, the context gatherer resolves aliased paths so downstream steps find your PRD regardless.

## Quick Start

**1. Create a new project and initialize Scaffold**

```bash
mkdir my-project && cd my-project
git init
scaffold init
```

The init wizard detects your project type and walks you through choosing a methodology preset. It creates `.scaffold/` with your config, state, and decisions log.

**2. Define your product**

```bash
scaffold run create-prd
```

Or in Claude Code:

```
/scaffold:create-prd I want to build a recipe sharing app where users can save, organize, and share recipes with friends
```

Claude asks clarifying questions about your idea, researches best practices, and produces a detailed product requirements document. This becomes the foundation that all later steps build on.

**3. See what's next**

```bash
scaffold next
```

Scaffold shows you which steps are now unblocked based on the dependency graph.

**4. Keep following the pipeline**

```bash
scaffold run review-prd
scaffold run user-stories
# ... and so on
```

Each step tells you what to run next. Use `scaffold status` at any time to see the full pipeline state, `scaffold status --compact` for just the remaining work, or `scaffold dashboard` to open a visual progress dashboard in your browser.

## The Pipeline

### Phase 1 — Product Definition (pre)

Define what you're building.

| Step | What It Does |
|------|-------------|
| `create-prd` | Creates a detailed product requirements document from your idea |
| `innovate-prd` | Reviews the PRD for missing pieces and suggests innovations |
| `review-prd` | Structured review of the PRD for completeness and quality |
| `user-stories` | Creates detailed user stories for every PRD feature |
| `innovate-user-stories` | Gap analysis and UX innovation pass on user stories |
| `review-user-stories` | Structured review with optional multi-model validation and requirements traceability at depth 4-5 |

### Phase 2 — Project Foundation (foundation)

Set up tooling, standards, and project structure.

| Step | What It Does |
|------|-------------|
| `beads` | Initialize Beads task tracking and create CLAUDE.md *(optional)* |
| `tech-stack` | Research and document technology choices; adds stack-specific safety rules |
| `coding-standards` | Create coding standards with linter/formatter configs |
| `project-structure` | Design and scaffold the directory layout |

### Phase 3 — Development Environment (environment)

Configure the working environment.

| Step | What It Does |
|------|-------------|
| `dev-env-setup` | Set up local dev environment with live reload |
| `design-system` | Create design tokens and component patterns *(web apps only)* |
| `git-workflow` | Configure branching, CI, worktree scripts, and project safety permissions |
| `automated-pr-review` | Agent-driven PR review with local CLI or external reviewers *(optional)* |
| `ai-memory-setup` | Configure AI memory: modular `.claude/rules/`, optional MCP memory server, external docs |

### Phase 4 — Testing Integration (integration)

Add E2E testing frameworks.

| Step | What It Does |
|------|-------------|
| `add-e2e-testing` | Auto-detects platform, configures Playwright (web) and/or Maestro (mobile) *(optional)* |

### Phase 5 — Domain Modeling (modeling)

Understand the problem domain.

| Step | What It Does |
|------|-------------|
| `domain-modeling` | DDD analysis — bounded contexts, aggregates, value objects |
| `review-domain-modeling` | Review of domain model for correctness and completeness |

### Phase 6 — Architecture Decisions (decisions)

Record key technical decisions.

| Step | What It Does |
|------|-------------|
| `adrs` | Creates Architecture Decision Records for major choices |
| `review-adrs` | Review of ADRs for completeness and rationale |

### Phase 7 — System Architecture (architecture)

Design the system.

| Step | What It Does |
|------|-------------|
| `system-architecture` | Component design, layering, patterns, scalability |
| `review-architecture` | Structured architecture review |

### Phase 8 — Specifications (specification)

Detail the interfaces.

| Step | What It Does |
|------|-------------|
| `database-schema` | Database design — normalization, indexing, migrations *(if applicable)* |
| `review-database` | Review of database schema *(if applicable)* |
| `api-contracts` | REST/GraphQL contracts, versioning, error handling *(if applicable)* |
| `review-api` | Review of API contracts *(if applicable)* |
| `ux-spec` | Interaction design, usability, user flows *(if applicable)* |
| `review-ux` | Review of UX specification *(if applicable)* |

### Phase 9 — Quality (quality)

Plan for quality, security, and operations.

| Step | What It Does |
|------|-------------|
| `tdd` | Test pyramid, patterns, coverage strategy |
| `review-testing` | Review of testing strategy |
| `create-evals` | Generate project-specific eval checks from standards docs |
| `security` | OWASP, threat modeling, security controls |
| `review-security` | Security review — **highest priority for multi-model validation** |
| `operations` | CI/CD, deployment, monitoring, runbooks |
| `review-operations` | Review of operations plan |

### Phase 10 — Stories & Reviews (stories)

Cross-platform checks.

| Step | What It Does |
|------|-------------|
| `platform-parity-review` | Audit platform coverage across docs *(multi-platform only)* |

### Phase 11 — Consolidation (consolidation)

Clean up and verify before planning implementation.

| Step | What It Does |
|------|-------------|
| `claude-md-optimization` | Consolidate and optimize CLAUDE.md |
| `workflow-audit` | Verify workflow consistency across all docs |

### Phase 12 — Planning (planning)

Break work into implementable tasks.

| Step | What It Does |
|------|-------------|
| `implementation-plan` | Decompose stories into a task graph with dependencies |
| `implementation-plan-review` | Review task quality, coverage, and sizing |
| `multi-model-review-tasks` | Multi-model review of implementation tasks *(optional)* |

### Phase 13 — Validation (validation)

Cross-phase audits before implementation.

| Step | What It Does |
|------|-------------|
| `scope-creep-check` | Detect scope drift from original PRD |
| `dependency-graph-validation` | Verify task graph integrity |
| `implementability-dry-run` | Can this actually be built as specified? |
| `decision-completeness` | Audit ADRs for missing decisions |
| `traceability-matrix` | Requirements → design → tasks mapping |
| `cross-phase-consistency` | Alignment check across all phases |
| `critical-path-walkthrough` | Identify the critical implementation path |

### Phase 14 — Finalization (finalization)

Lock it down and start building.

| Step | What It Does |
|------|-------------|
| `implementation-playbook` | Step-by-step guide for the implementation phase |
| `developer-onboarding-guide` | Onboarding guide for new contributors |
| `apply-fixes-and-freeze` | Apply any remaining fixes and freeze the specification |

## Multi-Model Review

At depth 4-5, all 18 review and validation steps can dispatch independent reviews to Codex and/or Gemini CLIs. This catches blind spots that a single model misses — what Claude considers correct, Codex or Gemini may flag as problematic.

### How It Works

1. Claude completes its own structured multi-pass review first
2. The artifact is bundled with upstream references into a review prompt
3. Each available CLI reviews the artifact independently (they don't see each other's output)
4. Findings are reconciled by confidence level:

| Scenario | Confidence | Action |
|----------|-----------|--------|
| Both models flag the same issue | **High** | Fix immediately |
| Both models approve | **High** | Proceed confidently |
| One flags P0, other approves | **High** | Fix it (P0 is critical) |
| One flags P1, other approves | **Medium** | Review before fixing |
| Models contradict each other | **Low** | Present both to user |

### Which Steps Support It

**All 11 domain review steps**: review-prd, review-domain-modeling, review-adrs, review-architecture, review-database, review-api, review-ux, review-testing, review-operations, review-security, implementation-plan-review

**All 4 validation steps**: cross-phase-consistency, traceability-matrix, critical-path-walkthrough, implementability-dry-run

**Plus 3 steps with built-in multi-model**: review-user-stories (depth 5), automated-pr-review (local CLI mode), multi-model-review-tasks

### CLI Invocation

The `multi-model-dispatch` skill documents the correct patterns:

```bash
# Codex (headless mode — use "exec", NOT bare "codex")
codex exec --skip-git-repo-check -s read-only --ephemeral "Review this artifact..." 2>/dev/null

# Gemini (headless mode — use "-p" flag)
gemini -p "Review this artifact..." --output-format json --approval-mode yolo 2>/dev/null
```

### Checking CLI Availability

```bash
scaffold check add-e2e-testing        # platform detection + brownfield
scaffold check automated-pr-review    # GitHub remote + CLI detection
scaffold check ai-memory-setup        # .claude/rules/, MCP servers, hooks
```

The `scaffold check` command reports which CLIs are available and recommends the appropriate review mode.

## Methodology Presets

Not every project needs all 50 steps. Choose a methodology when you run `scaffold init`:

### deep (depth 5)
All steps enabled. Comprehensive analysis of every angle — domain modeling, ADRs, security review, traceability matrix, the works. At depth 4-5, review steps dispatch to Codex/Gemini CLIs for multi-model validation. Best for complex systems, team projects, or when you want thorough documentation.

### mvp (depth 1)
Only 7 critical steps: create-prd, review-prd, user-stories, review-user-stories, tdd, implementation-plan, and implementation-playbook. Minimal ceremony — get to code fast. Best for prototypes, hackathons, or solo projects.

### custom (configurable)
You choose which steps to enable and set a default depth (1-5). You can also override depth per step. Best when you know which parts of the pipeline matter for your project.

You can change methodology mid-pipeline with `scaffold init --methodology <preset>`. Scaffold preserves your completed work and adjusts what's remaining.

## CLI Commands

| Command | What It Does |
|---------|-------------|
| `scaffold init` | Initialize `.scaffold/` with config, state, and decisions log |
| `scaffold run <step>` | Execute a pipeline step (assembles and outputs the full prompt) |
| `scaffold build` | Generate platform adapter output (commands/, AGENTS.md, etc.) |
| `scaffold adopt` | Bootstrap state from existing artifacts (brownfield projects) |
| `scaffold skip <step> [<step2>...]` | Skip one or more steps with a reason |
| `scaffold reset <step>` | Reset a step back to pending |
| `scaffold status [--compact]` | Show pipeline progress (`--compact` shows only remaining work) |
| `scaffold next` | List next unblocked step(s) |
| `scaffold check <step>` | Check if a conditional step applies to this project |
| `scaffold validate` | Validate meta-prompts, config, state, and dependency graph |
| `scaffold list` | List all steps with status |
| `scaffold info <step>` | Show full metadata for a step |
| `scaffold version` | Show Scaffold version |
| `scaffold update` | Update to the latest version |
| `scaffold dashboard` | Open a visual progress dashboard in your browser |
| `scaffold decisions` | Show all logged decisions |
| `scaffold knowledge` | Manage project-local knowledge base overrides |
| `scaffold skill install` | Install scaffold skills into the current project |
| `scaffold skill list` | Show available skills and installation status |
| `scaffold skill remove` | Remove scaffold skills from the current project |

### Examples

```bash
# Initialize a new project with deep methodology
scaffold init

# Run a specific step
scaffold run create-prd

# See what's next
scaffold next

# Check full pipeline status
scaffold status

# See only remaining work
scaffold status --compact

# Skip multiple steps at once
scaffold skip design-system add-e2e-testing --reason "backend-only project"

# Check if a step applies before running it
scaffold check add-e2e-testing
# → Applicable: yes | Platform: web | Brownfield: no | Mode: fresh

scaffold check automated-pr-review
# → Applicable: yes | GitHub remote: yes | Available CLIs: codex, gemini | Recommended: local-cli (dual-model)

scaffold check ai-memory-setup
# → Rules: no | MCP server: none | Hooks: none | Mode: fresh

# Re-run a completed step in update mode
scaffold reset review-prd --force
scaffold run review-prd

# Open the visual dashboard
scaffold dashboard
```

## Knowledge System

Scaffold ships with 44 domain expertise entries organized in five categories:

- **core/** (17 entries) — eval craft, testing strategy, domain modeling, API design, database design, system architecture, ADR craft, security best practices, operations, task decomposition, user stories, UX specification, design system tokens, user story innovation
- **product/** (3 entries) — PRD craft, PRD innovation, gap analysis
- **review/** (13 entries) — review methodology (shared), plus domain-specific review passes for PRD, user stories, domain modeling, ADRs, architecture, API contracts, database schema, UX spec, testing, security, operations, implementation tasks
- **validation/** (7 entries) — critical path analysis, cross-phase consistency, scope management, traceability, implementability, decision completeness, dependency validation
- **finalization/** (4 entries) — implementation playbook, developer onboarding, apply-fixes-and-freeze

Each pipeline step declares which knowledge entries it needs in its frontmatter. The assembly engine injects them automatically. Knowledge files with a `## Deep Guidance` section are optimized for the CLI — only the deep guidance content is loaded into the assembled prompt, skipping the summary to avoid redundancy with the prompt text.

### Project-local overrides

Teams can create project-specific knowledge entries in `.scaffold/knowledge/` that layer over the global entries:

```bash
scaffold knowledge update testing-strategy "We use Playwright for all E2E tests, Jest for unit tests"
scaffold knowledge list                    # See all entries (global + local)
scaffold knowledge show testing-strategy   # View effective content
scaffold knowledge reset testing-strategy  # Remove override, revert to global
```

Local overrides are committable — the whole team shares enriched, project-specific guidance.

## After the Pipeline: Ongoing Commands

Once your project is scaffolded and you're building features, these slash commands are available in Claude Code:

| Command | When to Use |
|---------|-------------|
| `/scaffold:new-enhancement` | Add a new feature to an already-scaffolded project. Updates the PRD, creates new user stories, and sets up tasks with dependencies. |
| `/scaffold:quick-task` | Create a focused task for a bug fix, refactor, or small improvement. |
| `/scaffold:version-bump` | Mark a milestone with a version number without the full release ceremony. |
| `/scaffold:release` | Ship a new version — changelog, Git tag, and GitHub release. Supports `--dry-run`, `current`, and `rollback`. |
| `/scaffold:single-agent-start` | Start the autonomous implementation loop — Claude picks up tasks and builds. |
| `/scaffold:single-agent-resume` | Resume where you left off after closing Claude Code. |
| `/scaffold:multi-agent-start` | Start parallel implementation with multiple agents in worktrees. |
| `/scaffold:multi-agent-resume` | Resume parallel agent work after a break. |
| `/scaffold:prompt-pipeline` | Print the full pipeline reference table. |

## Releasing Your Project

### Version bumps (development milestones)

```
/scaffold:version-bump
```

Bumps the version number and updates the changelog, but doesn't create tags, push, or publish a GitHub release. Think of it as a checkpoint.

### Creating a release

```
/scaffold:release
```

Claude analyzes your commits since the last release, suggests whether this is a major, minor, or patch version bump, and walks you through:
1. Running your project's tests
2. Updating the version number in your project files
3. Generating a changelog entry
4. Creating a Git tag and GitHub release

Options: `--dry-run` to preview, `minor`/`major`/`patch` to specify the bump, `current` to release an already-bumped version, `rollback` to undo.

## Glossary

| Term | What It Means |
|------|---------------|
| **Assembly engine** | The runtime system that constructs full 7-section prompts from meta-prompts, knowledge entries, project context, and methodology settings. |
| **CLAUDE.md** | A configuration file in your project root that tells Claude Code how to work in your project. |
| **Depth** | A 1-5 scale controlling how thorough each step's analysis is, from MVP-focused (1) to exhaustive (5). |
| **Frontmatter** | The YAML metadata block at the top of meta-prompt files, declaring dependencies, outputs, knowledge entries, and other configuration. |
| **Knowledge base** | 44 domain expertise entries that get injected into prompts. Can be extended with project-local overrides. |
| **MCP** | Model Context Protocol. A way for Claude to use external tools like a headless browser. |
| **Meta-prompt** | A short intent declaration in `pipeline/` that gets assembled into a full prompt at runtime. |
| **Methodology** | A preset (deep, mvp, custom) controlling which steps run and at what depth. |
| **Multi-model review** | Independent validation from Codex/Gemini CLIs at depth 4-5, catching blind spots a single model misses. |
| **PRD** | Product Requirements Document. The foundation for everything Scaffold builds. |
| **Slash commands** | Commands in Claude Code starting with `/`. For example, `/scaffold:create-prd`. |
| **Worktrees** | A git feature for multiple working copies. Scaffold uses these for parallel agent execution. |

## Troubleshooting / FAQ

**I ran a command and nothing happened.**
Make sure Scaffold is installed — run `scaffold version` or `/scaffold:prompt-pipeline` in Claude Code.

**Which steps can I skip?**
Use `scaffold skip <step> --reason "..."` to skip any step. You can skip multiple steps at once: `scaffold skip design-system add-e2e-testing --reason "backend-only"`. The mvp preset only enables 7 critical steps by default. With the custom preset, you choose exactly which steps to run.

**Can I go back and re-run a step?**
Yes. Use `scaffold reset <step> --force` to reset it to pending, then `scaffold run <step>`. When re-running a completed step, Scaffold uses update mode — it loads the existing artifact and generates improvements rather than starting from scratch.

**Do I need to run every step in one sitting?**
No. Pipeline state is persisted in `.scaffold/state.json`. Run `scaffold status` when you come back to see where you left off, or `scaffold next` for what's unblocked.

**What if Claude asks me a question I don't know the answer to?**
Say you're not sure. Claude suggests reasonable defaults and explains the trade-offs. You can revisit decisions later.

**Can I use this for an existing project?**
Yes. Run `scaffold init` — the project detector will identify it as brownfield and suggest the `deep` methodology. Use `scaffold adopt` to bootstrap state from existing artifacts.

**How do I customize the knowledge base for my project?**
Use `scaffold knowledge update <name>` to create a project-local override in `.scaffold/knowledge/`. It layers over the global entry and is committable for team sharing.

**How do I check if an optional step applies to my project?**
Run `scaffold check <step>`. For example, `scaffold check add-e2e-testing` detects whether your project has a web or mobile frontend. `scaffold check automated-pr-review` checks for a GitHub remote and available review CLIs.

**Codex CLI fails with "stdin is not a terminal"**
Use `codex exec "prompt"` (headless mode), not bare `codex "prompt"` (interactive TUI). The `multi-model-dispatch` skill documents the correct invocation patterns.

**Codex CLI fails with "Not inside a trusted directory"**
Add `--skip-git-repo-check` flag: `codex exec --skip-git-repo-check -s read-only --ephemeral "prompt"`. This is required when the project hasn't initialized git yet.

**Gemini CLI hangs on "Opening authentication page" or returns empty output**
Auth token expired mid-session. Run `! gemini -p "hello"` to re-authenticate interactively (the `!` prefix runs it in your terminal). For CI/headless: set `GEMINI_API_KEY` env var instead of OAuth.

**Codex CLI auth expired ("refresh token", "sign in again")**
Run `! codex login` to re-authenticate interactively. For CI/headless: set `CODEX_API_KEY` env var. Check auth status with `codex login status`.

**I upgraded and my pipeline shows old step names**
Run `scaffold status` — the state manager automatically migrates old step names (e.g., `add-playwright` → `add-e2e-testing`, `multi-model-review` → `automated-pr-review`) and removes retired steps.

## Architecture (for contributors)

The project is a TypeScript CLI (`@zigrivers/scaffold`) built with yargs, targeting ES2022/Node16 ESM.

### Source layout

```
src/
├── cli/commands/     # 17 CLI command implementations
├── cli/middleware/    # Project root detection, output mode resolution
├── cli/output/       # Output strategies (interactive, json, auto)
├── core/assembly/    # Assembly engine — meta-prompt → full prompt
├── core/adapters/    # Platform adapters (Claude Code, Codex, Universal)
├── core/dependency/  # DAG builder, topological sort, eligibility
├── core/knowledge/   # Knowledge update assembler
├── state/            # State manager, lock manager, decision logger
├── config/           # Config loading, migration, schema validation
├── project/          # Project detector, CLAUDE.md manager, adoption
├── wizard/           # Init wizard (interactive + --auto)
├── validation/       # Config, state, frontmatter validators
├── types/            # TypeScript types and enums
├── utils/            # FS helpers, errors, levenshtein
└── dashboard/        # HTML dashboard generator
```

### Key modules

- **Assembly engine** (`src/core/assembly/engine.ts`) — Pure orchestrator with no I/O. Constructs 7-section prompts from meta-prompt + knowledge + context + methodology + instructions + depth guidance.
- **State manager** (`src/state/state-manager.ts`) — Atomic writes via tmp + `fs.renameSync()`. Tracks step status, in-progress records, and next-eligible cache. Includes migration system for step renames and retired steps.
- **Dependency graph** (`src/core/dependency/`) — Kahn's algorithm topological sort with phase-aware ordering and cycle detection.
- **Platform adapters** (`src/core/adapters/`) — 3-step lifecycle (initialize → generateStepWrapper → finalize) producing Claude Code commands, Codex AGENTS.md, or universal markdown.
- **Project detector** (`src/project/detector.ts`) — Scans for file system signals to classify projects as greenfield, brownfield, or v1-migration.
- **Check command** (`src/cli/commands/check.ts`) — Applicability detection for conditional steps (platform detection, GitHub remote detection, CLI availability).

### Content layout

```
pipeline/             # 50 meta-prompts organized by 14 phases
knowledge/            # 44 domain expertise entries (core, product, review, validation, finalization)
methodology/          # 3 YAML presets (deep, mvp, custom)
commands/             # 66 Claude Code slash commands (50 pipeline + 16 utility)
skills/               # 3 Claude Code skills (pipeline reference, runner, multi-model dispatch)
```

### Testing

- **Vitest** for unit and E2E tests (66 test files, 753 tests)
- **Performance benchmarks** — assembly p95 < 500ms, state I/O p95 < 100ms, graph build p95 < 2s
- **Shell script tests** via bats
- Run: `npm test` (unit + E2E), `npm run test:bench` (benchmarks), `make check` (full CI gate)

### Contributing

1. Meta-prompt content lives in `pipeline/` — edit the relevant `.md` file
2. Run `scaffold build` to regenerate `commands/` from pipeline meta-prompts
3. Run `npm run check` (lint + type-check + test) before submitting
4. Knowledge entries live in `knowledge/` — follow the existing frontmatter schema
5. ADRs documenting architectural decisions are in `docs/v2/adrs/`

## License

MIT
