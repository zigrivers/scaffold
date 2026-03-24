# Scaffold

A TypeScript CLI that assembles AI-powered prompts at runtime to guide you from "I have an idea" to working software. Scaffold walks you through 36 structured pipeline steps — organized into 9 phases — and Claude Code handles the research, planning, and implementation for you.

By the end, you'll have a fully planned, standards-documented, implementation-ready project with working code.

## What is Scaffold?

Scaffold is a composable meta-prompt pipeline built for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Anthropic's command-line coding tool. If you have an idea for a software project but don't know where to start — or you want to make sure your project is set up with solid architecture, standards, and tests from day one — Scaffold guides you through every step.

Here's how it works:

1. **Initialize** — run `scaffold init` in your project directory. The init wizard detects whether you're starting fresh (greenfield) or working with an existing codebase (brownfield), and lets you pick a methodology preset (deep, mvp, or custom).

2. **Run steps** — each step is a composable meta-prompt (a short intent declaration in `pipeline/`) that gets assembled at runtime into a full 7-section prompt. The assembly engine injects relevant knowledge base entries, project context from prior steps, methodology settings, and depth-appropriate instructions.

3. **Follow the dependency graph** — Scaffold tracks which steps are complete, which are eligible, and which are blocked. Run `scaffold next` to see what's unblocked, or `scaffold status` for the full picture. Each step produces a specific artifact — a planning document, architecture decision, specification, or actual code.

You can run steps via the CLI (`scaffold run create-prd`) or via slash commands in Claude Code (`/scaffold:create-prd`). Either way, Scaffold constructs the prompt and Claude does the work.

## Key Concepts

**Meta-prompts** — Each pipeline step is defined as a short `.md` file in `pipeline/` with YAML frontmatter (dependencies, outputs, knowledge entries) and a markdown body describing the step's intent. These are *not* the prompts Claude sees — they're assembled into full prompts at runtime.

**Assembly engine** — At execution time, Scaffold builds a 7-section prompt from: system metadata, the meta-prompt, knowledge base entries, project context (artifacts from prior steps), methodology settings, layered instructions, and depth-specific execution guidance.

**Knowledge base** — 38 domain expertise entries in `knowledge/` covering testing strategy, domain modeling, API design, security review, and more. These get injected into prompts based on each step's `knowledge-base` frontmatter field. Teams can add project-local overrides in `.scaffold/knowledge/` that layer on top of the global entries.

**Methodology presets** — Three built-in presets control which steps run and how deep the analysis goes:
- **deep** (depth 5) — all 36 steps, exhaustive analysis
- **mvp** (depth 1) — 7 critical steps, get to code fast
- **custom** (depth 1-5) — you choose which steps to enable and how deep each one goes

**Depth scale** (1-5) — Controls how thorough each step's output is, from "focus on the core deliverable" (1) to "explore all angles, tradeoffs, and edge cases" (5). Depth resolves with 4-level precedence: CLI flag > step override > custom default > preset default.

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

**Playwright MCP** (web apps only)
Lets Claude control a real browser for visual testing and screenshots.
- Install: `claude mcp add playwright npx @playwright/mcp@latest`

**ChatGPT subscription** (for multi-model review)
One optional step (`multi-model-review`) sets up automated code review using both Claude and OpenAI's Codex. Requires a ChatGPT subscription (Plus, Pro, or Team). Skip this step if you don't have one.

**Codex CLI and/or Gemini CLI** (for multi-model stories review)
One optional step (`user-stories-multi-model-review`) runs independent AI reviewers against your user stories. You need at least one of: Codex CLI (requires ChatGPT subscription) or Gemini CLI (free tier available). See [Multi-Model Stories Review Setup](docs/multi-model-stories-review-setup.md).

## Installation

### Option 1: npm (recommended)

```bash
npm install -g @zigrivers/scaffold
```

After installing, the `scaffold` CLI is available globally. Slash commands (`/scaffold:create-prd`, etc.) are also available in Claude Code via the plugin.

### Option 2: Homebrew

```bash
brew tap zigrivers/scaffold
brew install scaffold
```

### Option 3: Claude Code Plugin

If you only need slash commands inside Claude Code (no CLI):

```
/plugin marketplace add zigrivers/scaffold
/plugin install scaffold@zigrivers-scaffold
```

Commands are available as `/scaffold:command-name` (for example, `/scaffold:create-prd`).

### Verify Installation

```bash
scaffold version
```

Or in Claude Code:

```
/scaffold:prompt-pipeline
```

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

Each step tells you what to run next. Use `scaffold status` at any time to see the full pipeline state, or `scaffold dashboard` to open a visual progress dashboard in your browser.

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
| `review-user-stories` | Structured review of user stories for coverage and clarity |

### Phase 2 — Domain Modeling (modeling)

Understand the problem domain.

| Step | What It Does |
|------|-------------|
| `domain-modeling` | DDD analysis — bounded contexts, aggregates, value objects |
| `review-domain-modeling` | Review of domain model for correctness and completeness |

### Phase 3 — Architecture Decisions (decisions)

Record key technical decisions.

| Step | What It Does |
|------|-------------|
| `adrs` | Creates Architecture Decision Records for major choices |
| `review-adrs` | Review of ADRs for completeness and rationale |

### Phase 4 — System Architecture (architecture)

Design the system.

| Step | What It Does |
|------|-------------|
| `system-architecture` | Component design, layering, patterns, scalability |
| `review-architecture` | Structured architecture review |

### Phase 5 — Specifications (specification)

Detail the interfaces.

| Step | What It Does |
|------|-------------|
| `database-schema` | Database design — normalization, indexing, migrations |
| `review-database` | Review of database schema |
| `api-contracts` | REST/GraphQL contracts, versioning, error handling |
| `review-api` | Review of API contracts |
| `ux-spec` | Interaction design, usability, user flows |
| `review-ux` | Review of UX specification |

### Phase 6 — Quality (quality)

Plan for quality, security, and operations.

| Step | What It Does |
|------|-------------|
| `testing-strategy` | Test pyramid, patterns, coverage strategy |
| `review-testing` | Review of testing strategy |
| `security` | OWASP, threat modeling, security controls |
| `review-security` | Review of security practices |
| `operations` | CI/CD, deployment, monitoring, runbooks |
| `review-operations` | Review of operations plan |

### Phase 7 — Planning (planning)

Break work into implementable tasks.

| Step | What It Does |
|------|-------------|
| `implementation-tasks` | Decompose stories into a task graph with dependencies |
| `review-tasks` | Review task quality, coverage, and sizing |

### Phase 8 — Validation (validation)

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

### Phase 9 — Finalization (finalization)

Lock it down and start building.

| Step | What It Does |
|------|-------------|
| `implementation-playbook` | Step-by-step guide for the implementation phase |
| `developer-onboarding-guide` | Onboarding guide for new contributors |
| `apply-fixes-and-freeze` | Apply any remaining fixes and freeze the specification |

## Methodology Presets

Not every project needs all 36 steps. Choose a methodology when you run `scaffold init`:

### deep (depth 5)
All 36 steps enabled. Comprehensive analysis of every angle — domain modeling, ADRs, security review, traceability matrix, the works. Best for complex systems, team projects, or when you want thorough documentation.

### mvp (depth 1)
Only 7 critical steps: create-prd, review-prd, user-stories, review-user-stories, testing-strategy, implementation-tasks, and implementation-playbook. Minimal ceremony — get to code fast. Best for prototypes, hackathons, or solo projects.

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
| `scaffold skip <step>` | Mark a step as skipped with a reason |
| `scaffold reset <step>` | Reset a step back to pending |
| `scaffold status` | Show pipeline progress and eligibility |
| `scaffold next` | List next unblocked step(s) |
| `scaffold validate` | Validate meta-prompts, config, state, and dependency graph |
| `scaffold list` | List all steps with status |
| `scaffold info <step>` | Show full metadata for a step |
| `scaffold version` | Show Scaffold version |
| `scaffold update` | Update to the latest version |
| `scaffold dashboard` | Open a visual progress dashboard in your browser |
| `scaffold decisions` | Show all logged decisions |
| `scaffold knowledge` | Manage project-local knowledge base overrides |

## Knowledge System

Scaffold ships with 38 domain expertise entries organized in four categories:

- **core/** (12 entries) — testing strategy, domain modeling, API design, database design, system architecture, ADR craft, security review, operations, task decomposition, user stories, UX specification
- **product/** (3 entries) — PRD craft, PRD innovation, gap analysis
- **review/** (12 entries) — review methodologies for each domain area
- **validation/** (7 entries) — critical path analysis, cross-phase consistency, scope management, traceability, implementability
- **finalization/** (3 entries) — implementation playbook, developer onboarding, apply-fixes-and-freeze

Each pipeline step declares which knowledge entries it needs in its frontmatter. The assembly engine injects them automatically.

### Project-local overrides (v2.1)

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
| **Knowledge base** | 38 domain expertise entries that get injected into prompts. Can be extended with project-local overrides. |
| **MCP** | Model Context Protocol. A way for Claude to use external tools like a headless browser. |
| **Meta-prompt** | A short intent declaration in `pipeline/` that gets assembled into a full prompt at runtime. |
| **Methodology** | A preset (deep, mvp, custom) controlling which steps run and at what depth. |
| **PRD** | Product Requirements Document. The foundation for everything Scaffold builds. |
| **Slash commands** | Commands in Claude Code starting with `/`. For example, `/scaffold:create-prd`. |
| **Worktrees** | A git feature for multiple working copies. Scaffold uses these for parallel agent execution. |

## Troubleshooting / FAQ

**I ran a command and nothing happened.**
Make sure Scaffold is installed — run `scaffold version` or `/scaffold:prompt-pipeline` in Claude Code.

**Which steps can I skip?**
Use `scaffold skip <step> --reason "..."` to skip any step. The mvp preset only enables 7 critical steps by default. With the custom preset, you choose exactly which steps to run.

**Can I go back and re-run a step?**
Yes. Use `scaffold reset <step>` to reset it to pending, then `scaffold run <step>`. When re-running a completed step, Scaffold uses update mode — it loads the existing artifact and generates improvements rather than starting from scratch.

**Do I need to run every step in one sitting?**
No. Pipeline state is persisted in `.scaffold/state.json`. Run `scaffold status` when you come back to see where you left off, or `scaffold next` for what's unblocked.

**What if Claude asks me a question I don't know the answer to?**
Say you're not sure. Claude suggests reasonable defaults and explains the trade-offs. You can revisit decisions later.

**Can I use this for an existing project?**
Yes. Run `scaffold init` — the project detector will identify it as brownfield and suggest the `deep` methodology. Use `scaffold adopt` to bootstrap state from existing artifacts.

**How do I customize the knowledge base for my project?**
Use `scaffold knowledge update <name>` to create a project-local override in `.scaffold/knowledge/`. It layers over the global entry and is committable for team sharing.

## Architecture (for contributors)

The project is a TypeScript CLI (`@zigrivers/scaffold`) built with yargs, targeting ES2022/Node16 ESM.

### Source layout

```
src/
├── cli/commands/     # 16 CLI command implementations
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
- **State manager** (`src/state/state-manager.ts`) — Atomic writes via tmp + `fs.renameSync()`. Tracks step status, in-progress records, and next-eligible cache.
- **Dependency graph** (`src/core/dependency/`) — Kahn's algorithm topological sort with phase-aware ordering and cycle detection.
- **Platform adapters** (`src/core/adapters/`) — 3-step lifecycle (initialize → generateStepWrapper → finalize) producing Claude Code commands, Codex AGENTS.md, or universal markdown.
- **Project detector** (`src/project/detector.ts`) — Scans for file system signals to classify projects as greenfield, brownfield, or v1-migration.

### Content layout

```
pipeline/             # 36 meta-prompts organized by phase
knowledge/            # 38 domain expertise entries (core, product, review, validation, finalization)
methodology/          # 3 YAML presets (deep, mvp, custom)
commands/             # Generated Claude Code slash commands (from scaffold build)
skills/               # Claude Code plugin skill definition
```

### Testing

- **Vitest** for unit and E2E tests (60 test files)
- **Performance benchmarks** — assembly p95 < 500ms, state I/O p95 < 100ms, graph build p95 < 2s
- **Shell script tests** via bats
- Run: `npm test` (unit + E2E), `npm run test:bench` (benchmarks), `make check` (full CI gate)

### Contributing

1. Meta-prompt content lives in `pipeline/` — edit the relevant `.md` file
2. Run `scaffold build` to regenerate `commands/` from pipeline meta-prompts
3. Run `npm run check` (lint + type-check + test) before submitting
4. Knowledge entries live in `knowledge/` — follow the existing frontmatter schema
5. ADRs documenting architectural decisions are in `docs/v2/adrs/` (55 total)

## License

MIT
