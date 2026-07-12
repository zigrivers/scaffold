# Scaffold

A TypeScript CLI that assembles AI-powered prompts at runtime to guide you from "I have an idea" to working software. Scaffold walks you through 60 structured pipeline steps — organized into 16 phases — plus 11 utility tools, and the supported AI tools handle the research, planning, and implementation for you.

By the end, you'll have a fully planned, standards-documented, implementation-ready project with working code.

## What is Scaffold?

Scaffold is a composable meta-prompt pipeline built for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and other supported AI coding tools. If you have an idea for a software project but don't know where to start — or you want to make sure your project is set up with solid architecture, standards, and tests from day one — Scaffold guides you through every step.

Here's how it works:

1. **Initialize** — run `scaffold init` in your project directory. The init wizard detects whether you're starting fresh (greenfield) or working with an existing codebase (brownfield), and lets you pick a methodology preset (deep, mvp, or custom). Every question shows inline descriptions and friendly labels — type `?` at any choice prompt for detailed help.

2. **Run steps** — each step is a composable meta-prompt (a short intent declaration in `content/pipeline/`) that gets assembled at runtime into a full 7-section prompt. The assembly engine injects relevant knowledge base entries, project context from prior steps, methodology settings, and depth-appropriate instructions.

3. **Follow the dependency graph** — Scaffold tracks which steps are complete, which are eligible, and which are blocked. Run `scaffold next` to see what's unblocked, or `scaffold status` for the full picture. Each step produces a specific artifact — a planning document, architecture decision, specification, or actual code.

You can run steps two ways:

- **CLI**: `scaffold run create-prd` — the assembly engine builds a full prompt from the meta-prompt, knowledge base entries, and project context. Best for the structured pipeline with dependency tracking.
- **Runner skill**: In Claude Code (or another agent host), the scaffold-runner skill provides an interactive wrapper that surfaces decision points (depth level, strictness, optional sections) before execution instead of letting the AI pick defaults silently.

Either way, Scaffold constructs the prompt and the target AI tool does the work. The CLI tracks pipeline state and dependencies; the runner skill adds interactive decision surfacing on top.

## Key Concepts

**Meta-prompts** — Each pipeline step is defined as a short `.md` file in `content/pipeline/` with YAML frontmatter (dependencies, outputs, knowledge entries) and a markdown body describing the step's intent. These are *not* the prompts Claude sees — they're assembled into full prompts at runtime.

**Assembly engine** — At execution time, Scaffold builds a 7-section prompt from: system metadata, the meta-prompt, knowledge base entries, project context (artifacts from prior steps), methodology settings, layered instructions, and depth-specific execution guidance.

**Knowledge base** — 278 domain expertise entries in `content/knowledge/` organized in twenty categories (core, product, review, validation, finalization, execution, tools, game, web-app, backend, cli, library, mobile-app, data-pipeline, ml, browser-extension, research, data-science, web3, mcp-server) covering testing strategy, domain modeling, API design, security best practices, eval craft, TDD execution, task claiming, worktree management, release management, rendering strategies, data stores, CLI patterns, game engines, library bundling, mobile deployment, batch and streaming pipelines, model training and serving, browser extension manifests and service workers, data-science reproducibility and notebook discipline, smart-contract security and audit workflow, MCP protocol fundamentals, tool and resource design, transport patterns, and more. These get injected into prompts based on each step's `knowledge-base` frontmatter field. Knowledge files with a `## Deep Guidance` section are optimized for CLI assembly — only the deep guidance content is loaded, avoiding redundancy with the prompt text. Teams can add project-local overrides in `.scaffold/knowledge/` that layer on top of the global entries.

A daily cron audits entries against their declared authoritative sources and opens refresh PRs when they drift — see `docs/knowledge-freshness/operations.md` for the operator guide (provider selection across Z.ai, DeepSeek, and Anthropic, the Z.ai→DeepSeek fallback, secret setup, manual overrides).

**Reference guides** — Human- and agent-readable reference guides live under `content/guides/<topic>/` (markdown source + generated HTML). Run `scaffold guides` to open the index or `scaffold guides <topic>` to open a specific guide in your browser; agents read the source via `scaffold guides <topic> --markdown` and discover topics with `scaffold guides --list --format json`.

**Methodology presets** — Three built-in presets control which steps run and how deep the analysis goes:
- **deep** (depth 5) — all steps enabled, exhaustive analysis
- **mvp** (depth 1) — 7 critical steps, get to code fast
- **custom** (depth 1-5) — you choose which steps to enable and how deep each one goes

**Depth scale** (1-5) — Controls how thorough each step's output is, from "focus on the core deliverable" (1) to "explore all angles, tradeoffs, and edge cases" (5). Depth resolves with 4-level precedence: CLI flag > step override > custom default > preset default.

**Multi-model validation** — At depth 4-5, review and validation steps can dispatch independent reviews to the four MMR CLI channels (Codex, Claude, Grok, Antigravity) via the `mmr` CLI, plus the Superpowers code-reviewer agent as a complementary 5th channel on wrapper invocations (`scaffold run review-pr`, `scaffold run review-code`). The MMR-backed wrappers are the preferred path; some older depth-5 validation steps still dispatch Codex/Antigravity directly via the `multi-model-dispatch` skill (migration in progress). Multiple independent models catch more blind spots than one. Findings are reconciled by confidence level (multiple channels agree = high confidence, single channel P0 = still actionable). When Codex or Antigravity is unavailable, a compensating Claude self-review pass runs in its place (labeled `[compensating: Codex-equivalent]` or `[compensating: Antigravity-equivalent]`, single-source confidence); there is no compensating pass when Claude itself is unavailable — the review simply proceeds with the remaining channels. CLI commands must always run in the foreground — background execution produces empty output. `mmr review` also supports non-PR targets (staged changes, branch diff, specific files) — see the [Multi-Model Review](#multi-model-review) section.

**State management** — Pipeline progress is tracked in `.scaffold/state.json` with atomic file writes and crash recovery. An advisory lock prevents concurrent runs. Decisions are logged to an append-only `decisions.jsonl`. Pressing Ctrl+C during any command exits cleanly with an informative message — no stack traces, no orphaned locks, no corrupted state.

**Dependency graph** — Steps declare their prerequisites in frontmatter. Scaffold builds a DAG, runs topological sort (Kahn's algorithm), detects cycles, and computes which steps are eligible at any point.

### Parallel-Agent Operations Kit

Multiple AI agents working the same repo at once need worktree isolation, branch hygiene, and — for containerized projects — staging environments that don't collide on ports; `scaffold agent-ops install` sets all of it up in one pass. It installs a versioned bundle of git scripts (worktree setup, doctor, prune, main-sync) and, once the `staging-environments` step is enabled, per-worktree Docker Compose isolation with deterministic port bands. The `git-workflow` and `staging-environments` pipeline steps call it automatically, but you can also install or drift-check the bundle directly:

```bash
scaffold agent-ops install
```

## Prerequisites

### Required

**Node.js** (v18.17 or later)
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

**Antigravity CLI** (for multi-model review)
Independent review from Google's current agent CLI. Can run alongside or instead of Codex.
- Install and sign in through Google's Antigravity distribution
- Requires: Google account
- Verify: `agy --version`

**mmr** (multi-model review CLI)
Automates dispatching, monitoring, and reconciling code reviews across multiple AI model CLIs. Works standalone or with Scaffold.
- Install: `npm install -g @zigrivers/mmr`
- Verify: `mmr --help`
- Setup: `mmr config init` (auto-detects installed CLIs)
- See: [mmr — Multi-Model Review CLI](#mmr--multi-model-review-cli)

**Playwright MCP** (web apps only)
Lets Claude control a real browser for visual testing and screenshots.
- Install: `claude mcp add playwright npx @playwright/mcp@latest`

## Installation

Scaffold has two parts that install separately:

- **CLI** (`scaffold`) — the core tool. Install via npm or Homebrew. Use it from your terminal or from Claude Code with `! scaffold run <step>`.
- **Plugin** — optional Claude Code plugin that auto-activates the scaffold runner and pipeline reference skills for interactive guidance.

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

Install the Scaffold plugin inside Claude Code for auto-activated skills:

```
/plugin marketplace add zigrivers/scaffold
/plugin install scaffold@zigrivers-scaffold
```

This gives you:
- **Scaffold Runner skill** — intelligent interactive wrapper that surfaces decision points (depth level, strictness, optional sections) before execution instead of letting Claude pick defaults silently
- **Pipeline reference skill** — shows pipeline ordering, dependencies, and phase structure
- **Multi-model dispatch skill** — correct invocation patterns for Codex and Antigravity CLIs

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

> **CLI-only users**: If you prefer not to install the plugin, skills are installed automatically — `scaffold init` sets them up, and any subsequent CLI command keeps them current after upgrades. No manual `scaffold skill install` needed.

> **Other agent CLIs**: the auto-install covers Claude Code (`.claude/skills/`) and shared/OpenCode hosts (`.agents/skills/`). To install the scaffold skills in another CLI's native form, run `scaffold skill install --platform <codex|antigravity|cursor|opencode>` — it writes a managed `AGENTS.md` block (Codex/Antigravity), `.cursor/rules/*.mdc` (Cursor), or `.opencode/skills/` (OpenCode).

## Updating

### npm

```bash
npm update -g @zigrivers/scaffold
```

### Homebrew

```bash
brew upgrade scaffold
```

### mmr

```bash
npm update -g @zigrivers/mmr
```

### Plugin

```
/plugin marketplace update zigrivers-scaffold
```

### Existing projects

After upgrading the CLI, existing projects still get automatic state migrations. Run `scaffold status` in your project directory — the state manager detects and renames old step keys, removes retired steps, normalizes artifact paths, and persists the changes atomically. No manual editing of `.scaffold/state.json` is needed.

**Step migrations handled automatically:**
- `add-playwright` / `add-maestro` → `add-e2e-testing`
- `multi-model-review` → `automated-pr-review`
- `user-stories-multi-model-review` → removed (folded into `review-user-stories`)
- `claude-code-permissions` → removed (folded into `git-workflow` + `tech-stack`)
- `multi-model-review-tasks` → removed (folded into `implementation-plan-review`)
- `testing-strategy` → `tdd`, `implementation-tasks` → `implementation-plan`, `review-tasks` → `implementation-plan-review`

The PRD is always created as `docs/plan.md`. If you have a legacy `docs/prd.md` from an older version, the context gatherer resolves aliased paths so downstream steps find your PRD regardless.

### Generated output layout

Fresh `scaffold init` now creates committed project state under `.scaffold/` and auto-runs `scaffold build`, which writes inspectable adapter artifacts under `.scaffold/generated/`. Scaffold also manages a dedicated block in `.gitignore` so generated output, `.scaffold/lock.json`, and Scaffold temp files stay out of version control by default.

The canonical execution entrypoints are still `scaffold run <step>` and the installed Scaffold plugin. Files under `.scaffold/generated/` are internal build artifacts, not root-level project files.

### Migration for older projects

This release is a clean breaking change for generated adapter output. To migrate an existing project:

1. Upgrade Scaffold.
2. Remove old root-level generated Scaffold output if present: `prompts/`, `codex-prompts/`, `commands/`, and root `AGENTS.md` only if it was Scaffold-generated. Run `scaffold status` — it warns about any legacy output.
3. Run `scaffold build`.
4. Review the Scaffold-managed block in `.gitignore`.
5. Commit `.gitignore` plus the intended committed `.scaffold/` state files (`config.yml`, `state.json`, `decisions.jsonl`, `instructions/`).
6. Do not commit `.scaffold/generated/` or `.scaffold/lock.json`.

## Quick Start

The fastest way to use Scaffold is through natural language inside Claude Code. The Scaffold Runner skill handles pipeline navigation, surfaces decision points before Claude picks defaults, and tracks your progress automatically. The examples below show what you'd type in a Claude Code session.

### Starting a Brand New Project

Let's say you want to build a neighborhood tool lending library — an app where neighbors can list tools they own and borrow from each other. Here's how that looks end to end.

**Set up the project** (one-time, in your terminal):

```bash
mkdir tool-library && cd tool-library
git init
scaffold init
```

The init wizard detects that this is a brand new project and walks you through setup with friendly labels and inline descriptions for every option. Type `?` at any choice prompt for detailed guidance. Choose **mvp** if you want to get to working code fast — it runs only 7 critical steps instead of the full 60. You can always switch to `deep` or `custom` later.

**Open Claude Code in your project directory**, then start talking:

```
"I want to build a neighborhood tool lending library where neighbors can
list tools they own, browse what's available nearby, and request to borrow
items. Run the first scaffold step."
```

The runner picks up `create-vision` (the first eligible step), asks you a few strategic questions about your idea — who's the audience, what makes this different from existing apps, what does success look like — and produces `docs/vision.md`. This becomes the foundation everything else builds on.

```
"Run the next scaffold step"
```

Now it runs `create-prd`. Claude translates your vision into a detailed product requirements document with features, user personas, success criteria, and scope boundaries. The output lands in `docs/plan.md`.

```
"Next step"
```

`review-prd` — Claude reviews the PRD for gaps, ambiguity, and completeness, then suggests improvements. You decide which suggestions to accept.

```
"Keep going"
```

`user-stories` — Claude breaks the PRD into detailed user stories with acceptance criteria. Each story maps back to a specific requirement so nothing falls through the cracks.

```
"What's left?"
```

The runner shows your remaining steps and which ones are unblocked. With the `mvp` preset, you're almost there — just `review-user-stories`, `tdd`, `implementation-plan`, and `implementation-playbook` remain.

```
"Finish the remaining steps"
```

The runner executes each remaining step in order, pausing to surface decisions that need your input (testing framework preferences, depth level for reviews, etc.) rather than letting Claude guess silently.

Once the pipeline is complete:

```
"Start building"
```

Claude picks up the first implementation task and begins writing code using TDD — tests first, then implementation. Your project now has architecture docs, coding standards, a test strategy, and a task graph, all produced from your original idea.

> **CLI equivalent**: Everything above can also be done with `scaffold run create-vision`, `scaffold run create-prd`, `scaffold next`, etc. The runner skill adds interactive decision surfacing on top of these commands.

### Adding Scaffold to an Existing Project

Say you have a Next.js app with a handful of features built, but no documentation, formal test strategy, or architecture docs. Scaffold can backfill all of that.

**In your project root:**

```bash
cd ~/projects/my-nextjs-app
scaffold init
```

Scaffold detects that you already have code (package.json, source files, git history) and classifies the project as **brownfield**. It suggests the `deep` methodology since existing projects benefit from thorough documentation, but you can choose any preset.

If you already have docs that match Scaffold's expected outputs (a PRD, architecture doc, etc.), bootstrap your state:

```bash
scaffold adopt
```

This scans your project for existing artifacts and marks those pipeline steps as complete so you don't redo work.

**Now open Claude Code and skip what doesn't apply:**

```
"Skip create-vision and create-prd — I already know what I'm building"
```

The runner marks those steps as skipped with your reason logged.

```
"Run tech-stack"
```

Claude scans your existing dependencies, framework choices, and configuration, then documents everything in `docs/tech-stack.md` — formalizing decisions you've already made so future contributors (and AI agents) understand the rationale.

```
"Run tdd"
```

Claude sets up a testing strategy tailored to your existing stack — test runner config, coverage targets, TDD workflow conventions. If you already have some tests, it builds around them.

```
"Run coding-standards"
```

Claude analyzes your existing code patterns and creates `docs/coding-standards.md` with linter and formatter configs that match how you're already writing code.

Continue through whatever steps make sense — `git-workflow`, `security`, `implementation-plan` — and skip the rest.

**Later, when you want to add a new feature with full Scaffold rigor:**

```
"Run new-enhancement"
```

Claude walks you through adding a feature the right way — updating the PRD, creating new user stories, setting up tasks with dependencies, and kicking off implementation. All the planning docs stay in sync.

### Checking Your Progress

Scaffold persists your pipeline state in `.scaffold/state.json`, so you can close Claude Code, take a break, and pick up right where you left off.

**In Claude Code** (natural language):

```
"Where am I in the pipeline?"    → full progress view with phase breakdown
"What's next?"                   → shows the next unblocked step(s)
"What's left?"                   → compact view of remaining steps only
```

**From the terminal** (CLI):

```bash
scaffold status              # full pipeline progress
scaffold status --compact    # remaining work only
scaffold next                # next eligible step(s)
scaffold dashboard           # open a visual progress dashboard in your browser
```

### Tips for New Users

- **You don't need every step.** The `mvp` preset runs just 7 steps and gets you building fast. Start there and switch to `deep` or `custom` if you want more rigor.
- **"I'm not sure" is a valid answer.** When Claude asks a question you can't answer yet, say so — it'll suggest reasonable defaults and explain the trade-offs. You can revisit any decision later.
- **You can re-run any step.** If your thinking evolves, use `scaffold reset <step>` to reset it, then run it again. Scaffold uses update mode — it improves the existing artifact rather than starting from scratch.
- **Every step produces a real document.** Vision docs, PRDs, architecture decisions, test strategies — these all land in your project's `docs/` folder as markdown files. They're not throwaway; they're the source of truth your code is built from.
- **The pipeline is a guide, not a cage.** Skip steps that don't apply (`scaffold skip <step> --reason "..."`). Run them out of order if you know what you're doing. Scaffold tracks dependencies so it'll tell you if you're missing a prerequisite.
- **Depth controls thoroughness.** Each step runs at a depth from 1 (focused, fast) to 5 (exhaustive). The mvp preset defaults to depth 1; deep defaults to 5. You can override per step or per session: `"Use depth 3 for everything"`.

### Non-Interactive / CI Usage

Every `scaffold init` wizard question can be answered via CLI flags, making scaffold fully scriptable for CI pipelines, automation, and reproducible project setup.

#### General Flags

| Flag | Type | Description |
|------|------|-------------|
| `--methodology` | deep/mvp/custom | Methodology preset |
| `--depth` | 1-5 | Custom methodology depth (requires `--methodology custom`) |
| `--adapters` | comma-sep | AI adapters: claude-code, codex |
| `--traits` | comma-sep | Project traits: web, mobile, desktop |
| `--project-type` | string | web-app, mobile-app, backend, cli, library, game, data-pipeline, ml, browser-extension, research, data-science, web3, mcp-server, macos-native |
| `--auto` | boolean | Non-interactive mode (uses Zod defaults for unset flags) |

#### Web-App Config Flags (require `--project-type web-app` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--web-rendering` | string | spa, ssr, ssg, hybrid |
| `--web-deploy-target` | string | static, serverless, container, edge, long-running |
| `--web-realtime` | string | none, websocket, sse |
| `--web-auth-flow` | string | none, session, oauth, passkey |

#### Backend Config Flags (require `--project-type backend` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--backend-api-style` | string | rest, graphql, grpc, trpc, none |
| `--backend-data-store` | comma-sep | relational, document, key-value |
| `--backend-auth` | string | none, jwt, session, oauth, apikey |
| `--backend-messaging` | string | none, queue, event-driven |
| `--backend-deploy-target` | string | serverless, container, long-running |
| `--backend-domain` | string | none, fintech |

> The wizard and `--backend-domain` flag remain single-select in v1; multi-domain stacking requires hand-editing `.scaffold/config.yml` to use an array (e.g. `domain: ['fintech']`).

#### CLI Config Flags (require `--project-type cli` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--cli-interactivity` | string | args-only, interactive, hybrid |
| `--cli-distribution` | comma-sep | package-manager, system-package-manager, standalone-binary, container |
| `--cli-structured-output` | boolean | `--cli-structured-output` / `--no-cli-structured-output` |

#### Library Config Flags (require `--project-type library` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--lib-visibility` | string | public, internal |
| `--lib-runtime-target` | string | node, browser, isomorphic, edge |
| `--lib-bundle-format` | string | esm, cjs, dual, unbundled |
| `--lib-type-definitions` | boolean | `--lib-type-definitions` / `--no-lib-type-definitions` |
| `--lib-doc-level` | string | none, readme, api-docs, full-site |

#### Mobile-App Config Flags (require `--project-type mobile-app` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--mobile-platform` | string | ios, android, cross-platform |
| `--mobile-distribution` | string | public, private, mixed |
| `--mobile-offline` | string | none, cache, offline-first |
| `--mobile-push-notifications` | boolean | `--mobile-push-notifications` / `--no-mobile-push-notifications` |

#### Data Pipeline Config Flags (require `--project-type data-pipeline` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--pipeline-processing` | string | batch, streaming, hybrid |
| `--pipeline-orchestration` | string | none, dag-based, event-driven, scheduled |
| `--pipeline-quality` | string | none, validation, testing, observability |
| `--pipeline-schema` | string | none, schema-registry, contracts |
| `--pipeline-catalog` | boolean | `--pipeline-catalog` / `--no-pipeline-catalog` |

#### ML Config Flags (require `--project-type ml` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--ml-phase` | string | training, inference, both |
| `--ml-model-type` | string | classical, deep-learning, llm |
| `--ml-serving` | string | none, batch, realtime, edge |
| `--ml-experiment-tracking` | boolean | `--ml-experiment-tracking` / `--no-ml-experiment-tracking` |

#### Browser Extension Config Flags (require `--project-type browser-extension` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--ext-manifest` | string | 2, 3 |
| `--ext-ui-surfaces` | comma-sep | popup, options, newtab, devtools, sidepanel |
| `--ext-content-script` | boolean | `--ext-content-script` / `--no-ext-content-script` |
| `--ext-background-worker` | boolean | `--ext-background-worker` / `--no-ext-background-worker` |

#### Research Config Flags (require `--project-type research` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--research-driver` | string | code-driven, config-driven, api-driven, notebook-driven |
| `--research-interaction` | string | autonomous, checkpoint-gated, human-guided |
| `--research-domain` | string | none, quant-finance, ml-research, simulation |
| `--research-tracking` | boolean | `--research-tracking` / `--no-research-tracking` |

#### MCP Server Config Flags (require `--project-type mcp-server` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--mcp-language` | string | typescript, python |
| `--mcp-transport` | string | stdio, streamable-http, sse |
| `--mcp-primitives` | comma-sep | tools, resources, prompts |
| `--mcp-auth` | string | none, oauth, apikey |
| `--mcp-deployment` | string | local, hosted |
| `--mcp-stateful` | boolean | `--mcp-stateful` / `--no-mcp-stateful` |

#### macOS-Native Config Flags (require `--project-type macos-native` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--macos-ui-framework` | string | swiftui, appkit, hybrid |
| `--macos-app-style` | string | standard, menu-bar, agent |
| `--macos-min-version` | string | e.g. 14.0, 15.0 |
| `--macos-distribution` | string | developer-id, mac-app-store, both |
| `--macos-sandboxed` | boolean | `--macos-sandboxed` / `--no-macos-sandboxed` |
| `--macos-persistence` | string | none, sqlite, core-data, swiftdata |
| `--macos-auto-update` | string | none, sparkle |

The full `macosNativeConfig` object written to `.scaffold/config.yml`:

| Config field | Default | Notes |
|------|------|--------|
| `macosNativeConfig.uiFramework` | `swiftui` | UI toolkit: `swiftui`, `appkit`, or `hybrid` |
| `macosNativeConfig.appStyle` | `standard` | App style: `standard`, `menu-bar`, or `agent` |
| `macosNativeConfig.minMacosVersion` | `15.0` | Minimum macOS deployment target (string, e.g. `"15.0"`) |
| `macosNativeConfig.distribution` | `developer-id` | Distribution channel: `developer-id`, `mac-app-store`, or `both` |
| `macosNativeConfig.sandboxed` | `false` | Whether the App Sandbox is enabled |
| `macosNativeConfig.persistence` | `none` | Local persistence: `none`, `sqlite`, `core-data`, or `swiftdata` |
| `macosNativeConfig.autoUpdate` | `none` | Auto-update mechanism: `none` or `sparkle` |

**Coupling constraints:**
- `distribution: mac-app-store` or `both` → `sandboxed` is forced to `true` (Mac App Store requirement).
- `distribution: mac-app-store` → `autoUpdate` is forced to `none` (App Store builds cannot bundle Sparkle).
- `persistence: swiftdata` requires `minMacosVersion` ≥ 14.0 (SwiftData requires macOS 14+). The init wizard auto-bumps `minMacosVersion` to `14.0` when you pick swiftdata with a lower version; `adopt` / direct config validation rejects a swiftdata + `<14` combination (fail-closed).

#### Data Science Config (`--project-type data-science`)

Data science has one forward-compatible config field in the schema, defaulted automatically — no CLI flags are needed in v1:

| Config field | Values | Notes |
|------|------|--------|
| `dataScienceConfig.audience` | `solo` | Default (applied by the wizard and `--auto`). Covers the DS-1 audience (solo / small-team, local-first, prototyping). A future DS-2 release will extend the enum with `'platform'` (platform-engineered / larger-team DS) additively, without breaking existing configs. |

#### Web3 Config (`--project-type web3`)

Web3 has one forward-compatible config field in the schema, defaulted automatically — no CLI flags are needed in v1:

| Config field | Values | Notes |
|------|------|--------|
| `web3Config.scope` | `contracts` | Default (applied by the wizard and `--auto`). Covers the W3-1 audience (smart-contract / protocol projects on EVM chains — Foundry / Hardhat). A future W3-2 release will extend the enum with `'dapp'` (web3 application / dApp) additively, without breaking existing configs. |

#### Game Config Flags (require `--project-type game` or auto-set it)

| Flag | Type | Values |
|------|------|--------|
| `--engine` | string | unity, unreal, godot, custom |
| `--multiplayer` | string | none, local, online, hybrid |
| `--target-platforms` | comma-sep | pc, web, ios, android, ps5, xbox, switch, vr, ar |
| `--online-services` | comma-sep | leaderboards, accounts, matchmaking, live-ops |
| `--content-structure` | string | discrete, open-world, procedural, endless, mission-based |
| `--economy` | string | none, progression, monetized, both |
| `--narrative` | string | none, light, heavy |
| `--locales` | comma-sep | Locale codes: en, ja, fr-FR |
| `--npc-ai` | string | none, simple, complex |
| `--modding` | boolean | `--modding` / `--no-modding` |
| `--persistence` | string | none, settings-only, profile, progression, cloud |

> **Flag aliases**: Game flags have `--game-*` aliases for consistency with other project types (e.g., `--game-engine` is equivalent to `--engine`). Bare flags like `--engine` still work.

### Declarative init from a YAML manifest (`--from`)

For multi-service projects, use `scaffold init --from <file>` to provide a
full ScaffoldConfig as YAML instead of running the interactive wizard:

```bash
scaffold init --from services.yml --force
```

The file must be a complete ScaffoldConfig (with `version`, `methodology`,
`platforms`, and `project.services[]`). Pass `-` to read from stdin.

`--from` is exclusive with config-setting flags (`--methodology`, all
`--backend-*`, `--web-*`, etc.); combining them is an error. Operational
flags (`--root`, `--force`, `--auto`, `--verbose`, `--format`) still work.

**Multi-service execution (v3.17.0+)**: Multi-service projects are
fully executable. Every stateful command (`run`, `next`, `status`,
`skip`, `complete`, `info`, `dashboard`, `decisions`, `reset`,
`rework`) accepts `--service <name>` to target one service's pipeline.
State is sharded under `.scaffold/services/<name>/state.json` with a
merged global+service view; per-service locks are independent.
Services can expose artifacts for cross-service consumption via the
`exports` allowlist in config, and pipeline steps can declare
`cross-reads:` in their frontmatter to consume foreign artifacts
during assembly.

#### How Flags Interact

- **Flag > auto > interactive**: Flags always take highest precedence. `--auto --engine unreal` uses defaults for everything except engine.
- **Partial flags + interactive**: Provide some flags and the wizard asks only the remaining questions. `scaffold init --project-type game --engine unreal` prompts interactively for multiplayer, platforms, etc.
- **Type-specific flags auto-set project type**: `--engine unity` automatically sets `--project-type game`, `--web-rendering ssr` sets `--project-type web-app`, `--backend-api-style rest` sets `--project-type backend`, `--cli-interactivity hybrid` sets `--project-type cli`, `--lib-visibility public` sets `--project-type library`, `--mobile-platform ios` sets `--project-type mobile-app`, `--pipeline-processing batch` sets `--project-type data-pipeline`, `--ml-phase training` sets `--project-type ml`, `--ext-manifest 3` sets `--project-type browser-extension`, `--research-driver code-driven` sets `--project-type research`, `--mcp-language typescript` sets `--project-type mcp-server`. Error if conflicting type. (Data science and web3 currently have no dedicated CLI flags — pass `--project-type data-science` or `--project-type web3` directly.)
- **Cannot mix flag families**: `--web-rendering ssr --backend-api-style rest` is an error. Each flag family (`--web-*`, `--backend-*`, `--cli-*`, `--lib-*`, `--mobile-*`, `--pipeline-*`, `--ml-*`, `--research-*`, `--ext-*`, `--mcp-*`, game) is exclusive.
- **Validation**: `--depth` requires `--methodology custom`. `--online-services` requires `--multiplayer online` or `hybrid`. SSR/hybrid rendering is incompatible with static deploy target. Session auth requires server state (not static). ML inference projects must specify a serving pattern. Browser extensions must declare at least one capability (UI surface, content script, or background worker). Notebook-driven research cannot be fully autonomous. `stdio` transport cannot use network auth (`--mcp-auth` must be `none` with `--mcp-transport stdio`). `stdio` transport runs locally and cannot use hosted deployment (`--mcp-deployment` must be `local` with `--mcp-transport stdio`).

#### CI Examples

```bash
# Web-app project (SSR with serverless deploy)
scaffold init --auto --methodology deep --project-type web-app \
  --web-rendering ssr --web-deploy-target serverless

# Web-app with real-time features and OAuth
scaffold init --auto --methodology deep --project-type web-app \
  --web-rendering ssr --web-deploy-target container \
  --web-realtime websocket --web-auth-flow oauth

# Backend project (GraphQL with relational + key-value stores)
scaffold init --auto --methodology deep --project-type backend \
  --backend-api-style graphql --backend-data-store relational,key-value

# Backend with event-driven messaging and JWT auth
scaffold init --auto --methodology deep --project-type backend \
  --backend-api-style rest --backend-data-store relational \
  --backend-auth jwt --backend-messaging event-driven \
  --backend-deploy-target container

# CLI project (interactive with multiple distribution channels)
scaffold init --auto --methodology mvp --project-type cli \
  --cli-interactivity hybrid --cli-distribution package-manager,standalone-binary

# CLI with structured JSON output
scaffold init --auto --methodology deep --project-type cli \
  --cli-interactivity args-only --cli-distribution package-manager \
  --cli-structured-output

# Public library with full API docs and ESM bundle
scaffold init --auto --methodology deep --project-type library \
  --lib-visibility public --lib-runtime-target isomorphic \
  --lib-bundle-format esm --lib-doc-level api-docs

# Internal library (Node-only, no docs)
scaffold init --auto --methodology mvp --project-type library \
  --lib-visibility internal --lib-runtime-target node \
  --lib-bundle-format cjs --lib-doc-level none

# Cross-platform mobile app with offline support
scaffold init --auto --methodology deep --project-type mobile-app \
  --mobile-platform cross-platform --mobile-offline offline-first \
  --mobile-push-notifications

# iOS app with private distribution
scaffold init --auto --methodology mvp --project-type mobile-app \
  --mobile-platform ios --mobile-distribution private

# Streaming data pipeline with event-driven orchestration
scaffold init --auto --methodology deep --project-type data-pipeline \
  --pipeline-processing streaming --pipeline-orchestration event-driven \
  --pipeline-quality observability --pipeline-schema schema-registry

# Batch ETL pipeline with DAG orchestration
scaffold init --auto --methodology mvp --project-type data-pipeline \
  --pipeline-processing batch --pipeline-orchestration dag-based \
  --pipeline-quality validation

# LLM inference service with realtime serving
scaffold init --auto --methodology deep --project-type ml \
  --ml-phase inference --ml-model-type llm --ml-serving realtime

# Classical ML training pipeline (no serving)
scaffold init --auto --methodology mvp --project-type ml \
  --ml-phase training --ml-model-type classical \
  --no-ml-experiment-tracking

# MV3 browser extension with popup and content script
scaffold init --auto --methodology deep --project-type browser-extension \
  --ext-manifest 3 --ext-ui-surfaces popup,options \
  --ext-content-script --ext-background-worker

# Devtools-only browser extension
scaffold init --auto --methodology mvp --project-type browser-extension \
  --ext-manifest 3 --ext-ui-surfaces devtools \
  --no-ext-content-script

# Autonomous quant-finance research (trading strategy optimization)
scaffold init --auto --methodology deep --project-type research \
  --research-driver code-driven --research-interaction autonomous \
  --research-domain quant-finance

# Checkpoint-gated ML architecture search
scaffold init --auto --methodology deep --project-type research \
  --research-driver config-driven --research-interaction checkpoint-gated \
  --research-domain ml-research

# Solo / small-team data science project (reproducibility-first)
scaffold init --auto --methodology deep --project-type data-science

# Web3 smart-contract / protocol project (Foundry / Hardhat on EVM)
scaffold init --auto --methodology deep --project-type web3

# MCP server — TypeScript, streamable-http transport, tools + resources
scaffold init --auto --methodology deep --project-type mcp-server \
  --mcp-language typescript --mcp-transport streamable-http \
  --mcp-primitives tools,resources --mcp-auth oauth --mcp-deployment hosted

# MCP server — Python, stdio transport (local tooling, no auth)
scaffold init --auto --methodology mvp --project-type mcp-server \
  --mcp-language python --mcp-transport stdio --mcp-auth none

# Multiplayer mobile game with Unity
scaffold init --project-type game --methodology deep --auto \
  --engine unity --multiplayer online --target-platforms ios,android \
  --economy monetized --online-services matchmaking,leaderboards

# Simple puzzle game
scaffold init --project-type game --auto --engine godot

# Custom methodology at depth 3
scaffold init --methodology custom --depth 3 --auto

# AAA console game with full configuration
scaffold init --project-type game --methodology deep --auto \
  --engine unreal --multiplayer online --target-platforms ps5,xbox,pc \
  --economy both --online-services matchmaking,leaderboards,accounts,live-ops \
  --narrative heavy --locales en,ja,ko,zh-CN,fr,de,es \
  --npc-ai complex --modding --persistence cloud \
  --content-structure open-world
```

### Project-Type Overlays

Scaffold supports **project-type overlays** — domain-specific knowledge and pipeline customizations that activate based on your project type. When you set a project type during `scaffold init`, the corresponding overlay layers on top of your chosen methodology (mvp, deep, or custom):

- **Injects domain knowledge** into existing pipeline steps (e.g., SSR caching strategies into `tech-stack`, API pagination patterns into `coding-standards`)

The game overlay additionally adjusts step enablement, remaps artifact references, and adds dependency overrides (because game development has fundamentally different artifacts). Like the game overlay, the **mcp-server overlay** also adjusts step enablement — it disables the UI-focused steps (design-system, ux-spec, review-ux) since an MCP server has no UI, and marks database-schema/review-database as if-needed. The web-app, backend, CLI, library, mobile-app, data-pipeline, ML, browser-extension, research, data-science, and web3 overlays are **knowledge-only** — they inject domain expertise into existing steps without changing which steps run or how they depend on each other. The research type additionally supports **domain sub-overlays** (quant-finance, ml-research, simulation) that layer domain-specific knowledge on top of the core research overlay, and the backend type supports a `fintech` sub-overlay. Both research and backend accept `domain` as either a single string or an array (e.g. `domain: ['quant-finance', 'simulation']`) for stacking multiple sub-overlays; the wizard and CLI flags remain single-select in v1, so multi-domain stacking requires hand-editing `.scaffold/config.yml`.

Overlays are composable with methodology presets. An MVP web-app gets fewer steps at lower depth; a deep backend project gets exhaustive analysis of every architectural decision.

| Project Type | Overlay | Knowledge Entries | Config Options |
|-------------|---------|-------------------|----------------|
| `web-app` | `web-app-overlay.yml` | 17 entries (rendering, state management, auth, SSR, deploy targets, real-time, PWA, testing) | Rendering strategy, deploy target, real-time, auth flow |
| `backend` | `backend-overlay.yml` | 22 entries (API design, data stores, auth, messaging, observability, deploy, caching, rate limiting) | API style, data store(s), auth, messaging, deploy target |
| `cli` | `cli-overlay.yml` | 10 entries (argument parsing, config management, output formatting, distribution, testing, error handling) | Interactivity model, distribution channels, structured output |
| `library` | `library-overlay.yml` | 12 entries (API design, bundling, type definitions, versioning, documentation, testing, security) | Visibility, runtime target, bundle format, type definitions, documentation level |
| `mobile-app` | `mobile-app-overlay.yml` | 12 entries (architecture, offline patterns, push notifications, deployment, distribution, testing, security) | Platform, distribution model, offline support, push notifications |
| `data-pipeline` | `data-pipeline-overlay.yml` | 12 entries (architecture, batch and streaming patterns, orchestration, schema management, quality, testing, security) | Processing model, orchestration, data quality strategy, schema management, data catalog |
| `ml` | `ml-overlay.yml` | 12 entries (architecture, training and serving patterns, experiment tracking, model evaluation, observability, testing, security) | Project phase, model type, serving pattern, experiment tracking |
| `browser-extension` | `browser-extension-overlay.yml` | 12 entries (architecture, manifest configuration, service workers, content scripts, cross-browser, store submission, testing, security) | Manifest version, UI surfaces, content script, background worker |
| `research` | `research-overlay.yml` + domain sub-overlays | 25 entries (experiment loop, tracking, overfitting prevention, backtesting, risk metrics, architecture search, simulation) | Experiment driver, interaction mode, domain, experiment tracking |
| `data-science` | `data-science-overlay.yml` | 13 entries (reproducibility, experiment tracking, notebook discipline, model evaluation, data versioning, dev environment, observability, project structure, conventions, requirements, security, testing, architecture) | Audience (`solo` default; `platform` reserved for DS-2) |
| `web3` | `web3-overlay.yml` | 14 entries (Foundry tooling, smart-contract security, upgradeability, gas optimization, oracles, audit workflow, deployment, testing patterns, EVM fundamentals, ABI/interface design, event/log indexing, supply-chain) | Scope (`contracts` default; `dapp` reserved for W3-2) |
| `game` | `game-overlay.yml` | 25 entries (engines, networking, audio, VR/AR, economy, save systems, certification) | Engine, multiplayer, platforms, economy, narrative, and 6 more |
| `mcp-server` | `mcp-server-overlay.yml` | 12 entries (protocol fundamentals, tool design, resource design, transport patterns, SDK selection, auth, error handling, testing, observability, deployment, versioning, prompt primitives) | Language, transport, primitives, auth, deployment, stateful |
| `macos-native` | `macos-native-overlay.yml` | 20 entries (architecture, SwiftUI/AppKit patterns, accessibility, distribution, entitlements, sandboxing, testing, observability, security, conventions) | UI framework |

### Game Development

Scaffold fully supports game development projects. When you select `game` as your project type, a **project-type overlay** activates 24 game-specific pipeline steps and injects game domain expertise into existing steps — all while keeping the standard pipeline workflow (status, next, rework, multi-model review) fully functional.

#### Getting Started

```bash
# Interactive — the wizard asks about your engine, multiplayer, platforms, etc.
scaffold init

# Non-interactive with defaults (engine: custom, single-player, PC)
scaffold init --project-type game --auto

# Non-interactive with specific configuration
scaffold init --project-type game --methodology deep --auto \
  --engine unity --multiplayer online --target-platforms ios,android \
  --economy monetized --online-services matchmaking,leaderboards

# Adopt an existing game project (auto-detects Unity/Unreal/Godot)
scaffold adopt
```

#### How It Works

Game support uses a **project-type overlay** architecture. You choose your methodology normally (`mvp`, `deep`, or `custom`), then `projectType: game` layers on top:

- **Enables 24 game steps** — GDD, performance budgets, art bible, audio design, etc.
- **Disables 3 web-centric steps** — `design-system`, `ux-spec`, `review-ux` (replaced by `game-ui-spec`)
- **Injects 29 game knowledge entries** into existing steps (e.g., game engine evaluation into `tech-stack`, game testing patterns into `tdd`)
- **Remaps artifact references** so downstream steps read game-specific docs instead of web ones

A game jam project uses `mvp` + game overlay (fewer steps, lower depth). An AAA project uses `deep` + game overlay (all steps, max depth).

#### Game Configuration

During `scaffold init`, the wizard asks game-specific questions with progressive disclosure:

| Category | Questions |
|----------|-----------|
| **Core** (always asked) | Game engine (Unity/Unreal/Godot/custom), multiplayer mode (none/local/online/hybrid), target platforms (PC/console/mobile/VR/AR) |
| **Conditional** | Online services (if multiplayer), content structure (levels/open-world/procedural/endless), economy type (none/progression/monetized) |
| **Advanced** (opt-in) | Narrative depth, supported locales, NPC AI complexity, mod support, persistence model |

These answers control which conditional steps activate. A single-player puzzle game gets a different pipeline than a multiplayer live-service RPG.

#### Game Pipeline Steps

**Always enabled** (12 steps):

| Step | Phase | What It Produces |
|------|-------|-----------------|
| `game-design-document` | Pre | Game pillars, core loop, mechanics catalog, progression systems |
| `review-gdd` | Pre | Multi-pass review of GDD for pillar coherence, scope feasibility |
| `performance-budgets` | Foundation | Frame budgets, memory budgets, GPU limits, loading targets per platform |
| `game-accessibility` | Specification | XAG-aligned accessibility plan (visual, motor, cognitive, auditory) |
| `input-controls-spec` | Specification | Input bindings, rebinding, haptics, dead zones, cross-play fairness |
| `game-ui-spec` | Specification | HUD, menus, controller navigation, settings, FTUE/tutorial, UI states |
| `review-game-ui` | Specification | Multi-pass review of game UI for completeness and accessibility |
| `content-structure-design` | Specification | Level layouts, world regions, procedural rulesets, or mission templates |
| `art-bible` | Specification | Art style, asset specs, naming conventions, DCC pipeline, LOD strategy |
| `audio-design` | Specification | Audio direction, adaptive music, spatial audio, middleware config, VO |
| `playtest-plan` | Quality | Playtest types, schedule, feedback templates, balance testing |
| `analytics-telemetry` | Quality | Event taxonomy, crash telemetry, data pipeline, privacy compliance |

**Conditional** (12 steps — activated by your game configuration):

| Step | Activates When | What It Produces |
|------|---------------|-----------------|
| `narrative-bible` | Narrative is light/heavy | World lore, characters, dialogue systems, branching narrative |
| `netcode-spec` | Multiplayer is online/hybrid | Network topology, tick rate, prediction, lag compensation, anti-cheat |
| `review-netcode` | Netcode spec enabled | Latency tolerance, bandwidth, cheat resistance review |
| `ai-behavior-design` | NPC AI is simple/complex | Behavior trees, pathfinding, perception, difficulty scaling |
| `economy-design` | Economy is not none | Currencies, loot tables, monetization, legal compliance |
| `review-economy` | Economy design enabled | Inflation analysis, exploit detection, ethical monetization review |
| `online-services-spec` | Online services selected | Identity, leaderboards, matchmaking, moderation, cloud save |
| `modding-ugc-spec` | Mod support enabled | Mod API, sandboxing, distribution, content moderation |
| `save-system-spec` | Persistence is not none | Save format, cloud sync, corruption recovery, migration |
| `localization-plan` | Multiple locales | String management, fonts (CJK/RTL), VO localization, LQA |
| `live-ops-plan` | Live-ops selected | Content cadence, events, hotfix deployment, maintenance |
| `platform-cert-prep` | Console/mobile/VR targets | Sony TRC, Xbox XR, Nintendo Lotcheck, store compliance checklists |

#### Multi-type Detection

`scaffold adopt` detects 14 project types from manifest files and directory layouts:

| Type | Key Signals |
|------|-------------|
| `web-app` | `next.config.*`, `nuxt.config.*`, `app/` router dirs, SPA frameworks |
| `backend` | `routes/` or `controllers/`, ORM schemas, server deps |
| `cli` | `bin` field in manifest, `commander`/`yargs`/`clap` deps |
| `library` | `main`/`types` fields, peer dependencies, no `bin` |
| `mobile-app` | `app.json` (Expo), `ios/`/`android/` dirs, React Native deps |
| `game` | `Assets/*.meta` (Unity), `*.uproject` (Unreal), `project.godot` (Godot) |
| `data-pipeline` | `dags/` dir, Airflow/Prefect/Dagster deps, Spark configs |
| `ml` | `training/`/`models/` dirs, PyTorch/TensorFlow deps, MLflow configs |
| `browser-extension` | `manifest.json` with `manifest_version` field |
| `research` | `program.md` + `results.tsv`, backtest/strategy files with trading deps, optimization deps + experiment dirs, simulation framework deps |
| `data-science` | Marimo signals required (`marimo` dep or `.marimo.toml`); DVC (`dvc.yaml`, `.dvc/config`, `dvc` py dep) is supplementary evidence only. Low-tier; defers to `ml` / `research` / `data-pipeline` when those match at medium/high tier |
| `web3` | `foundry.toml` or `hardhat.config.{ts,js,cjs,mjs}` (medium-tier); `remappings.txt`, `lib/forge-std` are supplementary low-tier signals. EVM-only scope. Library-collision boundary pinned by tiebreak (high-tier `library` wins over medium-tier `web3` for published-library Hardhat projects) |
| `mcp-server` | `@modelcontextprotocol/sdk` / `mcp` / `fastmcp` dep = low (MCP clients share these deps — avoids mis-adopting a client as a server); dep + entrypoint registering tools/resources = high |
| `macos-native` | `*.xcodeproj` / `*.xcworkspace` + `.swift` sources = medium; `Package.swift` + `import AppKit`/`import SwiftUI` without mobile targets = high |

Each detector returns a confidence tier (high/medium/low) with evidence trails. Override detection with `--project-type <type>`.

#### Multi-type Disambiguation

When `scaffold adopt` finds signals matching multiple project types, you'll
see a radio prompt:

```
? Which best describes this project? (Use arrow keys)
> web-app    [high]    next-config (next.config.mjs), app-router-dir (app/page.tsx), public-dir (public/), react-dep
  backend    [high]    routes-dir (app/api), prisma-schema (prisma/schema.prisma), pg-dep
  library    [medium]  pkg-main-field (package.json), pkg-types-field (package.json), peer-deps (react)
  None of these — continue without a project type
```

The default selection is the highest-confidence match with the most evidence. Press Enter to accept, or use arrow keys to pick a different option.

For non-interactive use (CI, scripts), pass `--project-type <type>` explicitly:

```bash
scaffold adopt --auto --project-type web-app
```

If you run `scaffold adopt --auto` and detection is ambiguous, the command
exits with code 6 (`ExitCode.Ambiguous`) and lists the candidate types in the
error message.

## The Pipeline

### Phase 0 — Product Vision (vision)

You describe your idea and Claude turns it into a strategic vision document covering who it's for, what makes it different, and what success looks like. The review step stress-tests the vision for gaps, and the innovate step explores market positioning opportunities. Without this, later steps lack a clear North Star and features drift.

| Step | What It Does |
|------|-------------|
| `create-vision` | Claude asks about your idea — who it's for, what problem it solves, what makes it different — and produces a vision document with elevator pitch, target audience, competitive positioning, guiding principles, and success criteria. |
| `review-vision` | Claude stress-tests the vision across five dimensions — clarity, audience precision, competitive rigor, strategic coherence, and whether the PRD can be written from it without ambiguity — and fixes what it finds. |
| `innovate-vision` | Claude explores untapped opportunities — adjacent markets, AI-native capabilities, ecosystem partnerships, and contrarian positioning — and proposes innovations for your approval. *(optional)* |

### Phase 1 — Product Definition (pre)

Claude translates your vision into a detailed product requirements document (PRD) with features, user personas, constraints, and success criteria. Then it breaks the PRD into user stories — specific things users can do, each with testable acceptance criteria in Given/When/Then format. Review and innovation steps audit for gaps and suggest enhancements. Without this, you're building without a spec.

| Step | What It Does |
|------|-------------|
| `create-prd` | Claude translates your vision (or idea, if no vision exists) into a product requirements document with problem statement, user personas, prioritized feature list, constraints, non-functional requirements, and measurable success criteria. |
| `innovate-prd` | Claude analyzes the PRD for feature-level gaps — competitive blind spots, UX enhancements, AI-native possibilities — and proposes additions for your approval. *(optional)* |
| `review-prd` | Claude reviews the PRD across eight passes — problem rigor, persona coverage, feature scoping, success criteria, internal consistency, constraints, non-functional requirements — and fixes blocking issues. |
| `user-stories` | Claude breaks every PRD feature into user stories ("As a [persona], I want [action], so that [outcome]") organized by epic, each with testable acceptance criteria in Given/When/Then format. |
| `innovate-user-stories` | Claude identifies UX enhancement opportunities — progressive disclosure, smart defaults, accessibility improvements — and integrates approved changes into existing stories. *(optional)* |
| `review-user-stories` | Claude verifies every PRD feature maps to at least one story, checks that acceptance criteria are specific enough to test, validates story independence, and builds a requirements traceability index at higher depths. |

### Phase 2 — Project Foundation (foundation)

Claude researches and documents your technology choices (language, framework, database) with rationale, creates coding standards tailored to your stack with actual linter configs, defines your testing strategy and test pyramid, and designs a directory layout optimized for parallel AI agent work. Without this, agents guess at conventions and produce inconsistent code.

| Step | What It Does |
|------|-------------|
| `beads` | Sets up optional Beads task tracking for downstream projects Scaffold generates, with a lessons-learned file for cross-session learning, and creates the initial CLAUDE.md skeleton with core principles and workflow conventions. *(This is not Scaffold's own issue-tracking workflow.)* |
| `tech-stack` | Claude researches technology options for your project — language, framework, database, hosting, auth — evaluates each against your requirements, and documents every choice with rationale and alternatives considered. |
| `coding-standards` | Claude creates coding standards tailored to your tech stack — naming conventions, error handling patterns, import organization, AI-specific rules — and generates working linter and formatter config files. |
| `tdd` | Claude defines your testing approach — which types of tests to write at each layer, coverage targets, what to mock and what not to, test data patterns — so agents write the right tests from the start. |
| `project-structure` | Claude designs a directory layout optimized for parallel AI agent work (minimizing file conflicts), documents where each type of file belongs, and creates the actual directories in your project. |

### Phase 3 — Development Environment (environment)

Claude sets up your local dev environment with one-command startup and live reload, creates a design system with color palette, typography, and component patterns (web apps only), configures your git branching strategy with CI pipeline and worktree scripts for parallel agents, optionally sets up automated PR review with multi-model validation, and configures AI memory so conventions persist across sessions. Without this, you're manually configuring tooling instead of building.

| Step | What It Does |
|------|-------------|
| `dev-env-setup` | Claude configures your project so `make dev` (or equivalent) starts everything — dev server with live reload, local database, environment variables — and documents the setup in a getting-started guide. |
| `design-system` | Claude creates a visual language — color palette (WCAG-compliant), typography scale, spacing system, component patterns — and generates working theme config files for your frontend framework. *(web apps only)* |
| `git-workflow` | Claude sets up your branching strategy, commit message format, PR workflow, CI pipeline with lint and test jobs, and worktree scripts so multiple AI agents can work in parallel without conflicts. |
| `automated-pr-review` | Claude configures automated code review — three-CLI MMR dispatch (Codex, Antigravity, Claude) plus Superpowers code-reviewer as a complementary 4th channel via the scaffold wrappers, with severity definitions and review criteria tailored to your project. Covers PRs and non-PR targets (local code, diffs, files). *(optional)* |
| `ai-memory-setup` | Claude extracts conventions from your docs into path-scoped rule files that load automatically, optimizes CLAUDE.md with a pointer pattern, and optionally sets up persistent cross-session memory. |

### Phase 4 — Testing Integration (integration)

Claude auto-detects your platform (web or mobile) and configures end-to-end testing — Playwright for web apps, Maestro for mobile/Expo. Skips automatically for backend-only projects. Without this, your test pyramid has no top level.

| Step | What It Does |
|------|-------------|
| `add-e2e-testing` | Claude detects whether your project is web or mobile, then configures Playwright (web) or Maestro (mobile) with a working smoke test, baseline screenshots, and guidance on when to use E2E vs. unit tests. *(optional)* |

### Phase 5 — Domain Modeling (modeling)

Claude analyzes your user stories to identify all the core concepts in your project — the entities (things like Users, Orders, Tools), their relationships, the rules that must always be true, and the events that happen when state changes. This becomes the shared language between all your docs and code. Without this, different docs use different names for the same concept and agents create duplicate logic.

| Step | What It Does |
|------|-------------|
| `domain-modeling` | Claude analyzes your user stories to identify the core concepts in your project (entities, their relationships, the rules that must always hold true), and establishes a shared vocabulary that all docs and code will use. |
| `review-domain-modeling` | Claude verifies every PRD feature maps to a domain entity, checks that business rules are enforceable, and ensures the shared vocabulary is consistent across all project files. |

### Phase 6 — Architecture Decisions (decisions)

Claude documents every significant technology and design decision as an Architecture Decision Record (ADR) — what was decided, what alternatives were considered, and why. The review catches contradictions and missing decisions. Without this, future contributors (human or AI) don't know *why* things are the way they are.

| Step | What It Does |
|------|-------------|
| `adrs` | Claude documents every significant design decision — what was chosen, what alternatives were considered with pros and cons, and what consequences follow — so future contributors understand *why*, not just *what*. |
| `review-adrs` | Claude checks for contradictions between decisions, missing decisions implied by the architecture, and whether every choice has honest trade-off analysis. |

### Phase 7 — System Architecture (architecture)

Claude designs the system blueprint — which components exist, how data flows between them, where each piece of code lives, and how the system can be extended. This translates your domain model and decisions into a concrete structure that implementation will follow. Without this, agents make conflicting structural assumptions.

| Step | What It Does |
|------|-------------|
| `system-architecture` | Claude designs the system blueprint — which components exist, how data flows between them, where each module lives in the directory tree, and where extension points allow custom behavior. |
| `review-architecture` | Claude verifies every domain concept lands in a component, every decision constraint is respected, no components are orphaned from data flows, and the module structure minimizes merge conflicts. |

### Phase 8 — Specifications (specification)

Claude creates detailed interface specifications for each layer of your system. Database schema translates domain entities into tables with constraints that enforce business rules. API contracts define every endpoint with request/response shapes, error codes, and auth requirements. UX spec maps out user flows, interaction states, accessibility requirements, and responsive behavior. Each is conditional — only generated if your project has that layer. Without these, agents guess at interfaces and implementations don't align.

| Step | What It Does |
|------|-------------|
| `database-schema` | Claude translates your domain model into database tables with constraints that enforce business rules, indexes optimized for your API's query patterns, and a reversible migration strategy. *(if applicable)* |
| `review-database` | Claude verifies every domain entity has a table, constraints enforce business rules at the database level, and indexes cover all query patterns from the API contracts. *(if applicable)* |
| `api-contracts` | Claude specifies every API endpoint — request/response shapes, error codes with human-readable messages, auth requirements, pagination, and example payloads — so frontend and backend can be built in parallel. *(if applicable)* |
| `review-api` | Claude checks that every domain operation has an endpoint, error responses include domain-specific codes, and auth requirements are specified for every route. *(if applicable)* |
| `ux-spec` | Claude maps out every user flow with all interaction states (loading, error, empty, populated), defines accessibility requirements (WCAG level, keyboard nav), and specifies responsive behavior at each breakpoint. *(if applicable)* |
| `review-ux` | Claude verifies every user story has a flow, accessibility requirements are met, all error states are documented, and the design system is used consistently. *(if applicable)* |

### Phase 9 — Quality (quality)

Claude reviews your testing strategy for coverage gaps, generates test skeleton files from your user story acceptance criteria (one test per criterion, ready for TDD), creates automated eval checks that verify code meets your documented standards, designs your deployment pipeline with monitoring and incident response, and conducts a security review covering OWASP Top 10, threat modeling, and input validation rules. Without this, quality is an afterthought bolted on at the end.

| Step | What It Does |
|------|-------------|
| `review-testing` | Claude audits the testing strategy for coverage gaps by layer, verifies edge cases from domain invariants are tested, and checks that test environment assumptions match actual config. |
| `story-tests` | Claude generates a test skeleton file for each user story — one pending test case per acceptance criterion, tagged with story and criterion IDs — giving agents a TDD starting point for every feature. |
| `create-evals` | Claude generates automated checks that verify your code matches your documented standards — file placement, naming conventions, feature-to-test coverage, API contract alignment, and more — using your project's own test framework. |
| `operations` | Claude designs your deployment pipeline (build, test, deploy, verify, rollback), defines monitoring metrics with alert thresholds, and writes incident response procedures with rollback instructions. |
| `review-operations` | Claude verifies the full deployment lifecycle is documented, monitoring covers latency/errors/saturation, alert thresholds have rationale, and common failure scenarios have runbook entries. |
| `security` | Claude conducts a security review of your entire system — OWASP Top 10 coverage, input validation rules for every user-facing field, data classification, secrets management, CORS policy, rate limiting, and a threat model covering all trust boundaries. |
| `review-security` | Claude verifies OWASP coverage is complete, auth boundaries match API contracts, every secret is accounted for, and the threat model covers all trust boundaries. **Highest priority for multi-model review.** |

### Phase 10 — Platform Parity (parity)

For projects targeting multiple platforms (web + mobile, for example), Claude audits all documentation for platform-specific gaps — features that work on one platform but aren't specified for another, input pattern differences, and platform-specific testing coverage. Skips automatically for single-platform projects.

| Step | What It Does |
|------|-------------|
| `platform-parity-review` | Claude audits all documentation for platform-specific gaps — features missing on one platform, input pattern differences (touch vs. mouse), and platform-specific testing coverage. *(multi-platform only)* |

### Phase 11 — Consolidation (consolidation)

Claude optimizes your CLAUDE.md to stay under 200 lines with critical patterns front-loaded, then audits all workflow documentation for consistency — making sure commit formats, branch naming, PR workflows, and key commands match across every doc. Without this, agents encounter conflicting instructions.

| Step | What It Does |
|------|-------------|
| `claude-md-optimization` | Claude removes redundancy from CLAUDE.md, fixes terminology inconsistencies, front-loads critical patterns (TDD, commit format, worktrees), and keeps it under 200 lines so agents actually read and follow it. |
| `workflow-audit` | Claude audits every document that mentions workflow (CLAUDE.md, git-workflow, coding-standards, dev-setup) and fixes any inconsistencies in commit format, branch naming, PR steps, or key commands. |

### Phase 12 — Planning (planning)

Claude decomposes your user stories and architecture into concrete, implementable tasks — each scoped to ~150 lines of code, limited to 3 files, with clear acceptance criteria and no ambiguous decisions for agents to guess at. The review validates coverage (every feature has tasks), checks the dependency graph for cycles, and runs multi-model validation at higher depths. Without this, agents don't know what to build or in what order.

| Step | What It Does |
|------|-------------|
| `implementation-plan` | Claude breaks your user stories and architecture into concrete tasks — each scoped to ~150 lines of code and 3 files max, with clear acceptance criteria, no ambiguous decisions, and explicit dependencies. |
| `implementation-plan-review` | Claude verifies every feature has implementation tasks, no task is too large for one session, the dependency graph has no cycles, and every acceptance criterion maps to at least one task. |

### Phase 13 — Validation (validation)

Seven cross-cutting audits that catch problems before implementation begins. Without this phase, hidden spec problems surface during implementation as expensive rework.

| Step | What It Does |
|------|-------------|
| `scope-creep-check` | Claude compares everything that's been specified against the original PRD and flags anything that wasn't in the requirements — features, components, or tasks that crept in without justification. |
| `dependency-graph-validation` | Claude verifies the task dependency graph has no cycles (which would deadlock agents), no orphaned tasks, and no chains deeper than three sequential dependencies. |
| `implementability-dry-run` | Claude simulates picking up each task as an implementing agent and flags anything ambiguous — unclear acceptance criteria, missing input files, undefined error handling — that would force an agent to guess. |
| `decision-completeness` | Claude checks that every technology choice and architectural pattern has a recorded decision with rationale, and that no two decisions contradict each other. |
| `traceability-matrix` | Claude builds a map showing that every PRD requirement traces through to user stories, architecture components, implementation tasks, and test cases — with no gaps in either direction. |
| `cross-phase-consistency` | Claude traces every named concept (entities, fields, API endpoints) across all documents and flags any naming drift, terminology mismatches, or data shape inconsistencies. |
| `critical-path-walkthrough` | Claude walks the most important user journeys end-to-end across every spec layer — PRD to stories to UX to API to database to tasks — and flags any broken handoffs or missing layers. |

### Phase 14 — Finalization (finalization)

Claude applies all findings from the validation phase, freezes documentation (ready for implementation), creates a developer onboarding guide (the "start here" document for anyone joining the project), and writes the implementation playbook — the operational document agents reference during every coding session. Without this, there's no bridge between planning and building.

| Step | What It Does |
|------|-------------|
| `apply-fixes-and-freeze` | Claude applies all findings from the validation phase, fixes blocking issues, and freezes every document with a version marker — signaling that specs are implementation-ready. |
| `developer-onboarding-guide` | Claude synthesizes all your frozen docs into a single onboarding narrative — project purpose, architecture overview, top coding patterns, key commands, and a quick-start checklist — so anyone joining the project knows exactly where to begin. |
| `implementation-playbook` | Claude writes the playbook agents reference during every coding session — task execution order, which docs to read before each task, the TDD loop to follow, quality gates to pass, and the handoff format between agents. |

### Phase 15 — Build (build)

Stateless execution steps that can be run repeatedly once Phase 14 is complete. Single-agent and multi-agent modes start the TDD implementation loop (claim a task, write a failing test, make it pass, refactor, commit, repeat). Resume commands restore session context after breaks. Quick-task handles one-off bug fixes outside the main plan. New-enhancement adds a feature with full planning rigor.

| Step | What It Does |
|------|-------------|
| `single-agent-start` | Claude claims the next task, writes a failing test, implements until it passes, refactors, runs quality gates, commits, and repeats — following the implementation playbook. |
| `single-agent-resume` | Claude recovers context from the previous session — reads lessons learned, checks git state, reconciles merged PRs — and continues the TDD loop from where you left off. |
| `multi-agent-start` | Claude sets up a named agent in an isolated git worktree so multiple agents can implement tasks simultaneously without file conflicts, each following the same TDD loop. |
| `multi-agent-resume` | Claude verifies the worktree, syncs with main, reconciles completed tasks, and resumes the agent's TDD loop from the previous session. |
| `quick-task` | Claude takes a one-off request (bug fix, refactor, performance tweak) and creates a single well-scoped task with acceptance criteria and a test plan — for work outside the main implementation plan. |
| `new-enhancement` | Claude walks you through adding a feature the right way — updating the PRD, creating new user stories, running an innovation pass, and generating implementation tasks that integrate with your existing plan. |

## Multi-Model Review

Just like you'd want more than one person reviewing a pull request, multi-model review gets independent perspectives from different AI models. When Claude, Codex, and Antigravity independently flag the same issue, you know it's real. When they all approve, you can proceed with confidence.

### Why Multiple Models?

- **Different blind spots** — what Claude considers correct, another model may flag as problematic. Each model reasons differently about architecture, security, and edge cases.
- **Independent review** — each model reviews your work without seeing what the others said, preventing groupthink.
- **Confidence through agreement** — when two or three models flag the same issue, it's almost certainly real. When they all approve, you can move forward confidently.
- **Catches what single-model misses** — security gaps, inconsistent naming across docs, missing edge cases, and specification contradictions that one model overlooks.

### Quick Setup

Multi-model review is optional. It requires installing one or both of these additional CLI tools:

**Codex CLI** — OpenAI's command-line coding tool. Requires a ChatGPT subscription (Plus/Pro/Team).
```bash
npm install -g @openai/codex
```

**Antigravity CLI** — Google's current command-line agent tool.
```bash
agy --version
```

You don't need both — Scaffold works with whichever CLIs are available. Having both gives the strongest review (three independent perspectives). See [Prerequisites](#prerequisites) for auth setup and verification commands.

### mmr — Multi-Model Review CLI

`mmr` is a standalone CLI that automates multi-model code review. It solves the problems teams hit when manually orchestrating reviews across Claude, Codex, and Antigravity: timeouts, auth failures, inconsistent prompts, fragile output parsing, and manual reconciliation.

**The core problem it solves:** Without `mmr`, an AI agent dispatching multi-model reviews has to manually construct CLI commands for each model, handle per-tool auth quirks, improvise timeout handling, parse different output formats, and reconcile findings across channels. In practice, this takes 4-6+ minutes per review and frequently fails. `mmr` reduces this to three commands.

#### How mmr Works

```
# Recommended: single-command pipeline (--sync)
mmr review --pr 47 --sync    ──→  Dispatches to all channels
                                   Runs compensating passes for unavailable channels
                                   Parses outputs, reconciles findings
                                   Applies severity gate, derives verdict
                                   Exit code: 0=pass, 2=blocked, 3=needs-decision

# Alternative: step-by-step (for async workflows)
mmr review --pr 47           ──→  Dispatch and await all channels
mmr results mmr-a1b2c3       ──→  Reconcile findings, output verdict
```

**Key features:**

- **--sync mode** — single-command pipeline: dispatch, parse, reconcile, verdict. The recommended entry point for agents and CI.
- **Compensating passes** — when a channel is unavailable, a Claude-based review focused on that channel's strength area runs automatically.
- **Per-channel auth verification** — checks authentication before every dispatch. Auth failures are never silent — `mmr` tells you exactly what expired and the command to fix it.
- **Immutable core prompt** — every channel gets the same severity definitions (P0-P3), output format spec (JSON), and review criteria. No prompt drift between channels.
- **Automated reconciliation** — when two channels flag the same location, that's consensus (high confidence). When only one channel flags something, it's unique (medium confidence). P0 from any single source is always high confidence.
- **Configurable severity gate** — project default in `.mmr.yaml`, override per-review with `--fix-threshold`. Default: P2 (fix P0/P1/P2, skip P3).
- **Multiple output formats** — JSON (default, for machines), text (terminals), markdown (PR comments).

#### Installing mmr

**npm** (available now):
```bash
npm install -g @zigrivers/mmr
```

**Homebrew** (available after next scaffold release):
```bash
brew tap zigrivers/scaffold
brew install mmr
```

Verify: `mmr --help`

#### Enabling mmr in an Existing Project

**Step 1: Install the model CLIs you want to use**

You need at least one. More models = more diverse review perspectives.

```bash
# Claude Code (you probably already have this)
npm install -g @anthropic-ai/claude-code

# Codex CLI (requires ChatGPT Plus/Pro/Team subscription)
npm install -g @openai/codex

# Antigravity CLI
agy --version
```

**Step 2: Authenticate each CLI**

Each CLI needs a one-time interactive authentication:

```bash
# Claude — if not already logged in
claude login

# Codex — opens browser for OAuth
codex login

# Antigravity — prints the OAuth recovery flow when needed
agy -p "hello"
```

**Step 3: Initialize mmr in your project**

```bash
cd your-project
mmr config init
```

This auto-detects which CLIs are installed and generates `.mmr.yaml` in your project root:

```
Detected CLIs:
  ✓ claude (claude -p)
  ✓ antigravity (agy)
  ✗ codex (not found)

Generated .mmr.yaml with 2 enabled channels.
Run `mmr config test` to verify authentication.
```

**Step 4: Verify authentication**

```bash
mmr config test
```

```
  claude    ✓ installed    ✓ authenticated
  antigravity ✓ installed  ✓ authenticated
  codex     ✗ not installed (skipped)

  2/3 channels ready.
```

If any channel shows an auth failure, `mmr` tells you the exact command to fix it.

**Step 5: Commit the config**

```bash
git add .mmr.yaml
git commit -m "chore: add mmr multi-model review config"
```

This ensures your team shares the same channel configuration.

**Step 6 (optional): Customize review criteria**

Edit `.mmr.yaml` to add project-specific review criteria that get injected into every review prompt:

```yaml
review_criteria:
  - "Verify all database queries use parameterized statements"
  - "Check that error messages do not leak internal state"
  - "Ensure all API endpoints validate authentication"
```

You can also adjust per-channel timeouts, the default severity threshold, and named review templates for different review types (PR reviews, implementation plan reviews, etc.).

#### Using mmr Day-to-Day

**After creating a PR:**

```bash
# Recommended: single-command review
mmr review --pr 47 --sync --focus "auth flow, session handling"
# → Full review output with verdict and findings

# Or with text output for readability:
mmr review --pr 47 --sync --format text

# Step-by-step (when you want to continue working while review runs):
mmr review --pr 47 --focus "auth flow, session handling"
# → Job mmr-a1b2c3 started. 2/2 channels dispatched.
```

**Continue working, then check back:**

```bash
mmr status mmr-a1b2c3
# → claude: completed (47s) | antigravity: running (2m12s)

# Later:
mmr status mmr-a1b2c3
# → All channels complete.
```

**Collect reconciled results:**

```bash
mmr results mmr-a1b2c3
# → JSON output with gate_passed, reconciled_findings, per_channel details

mmr results mmr-a1b2c3 --format text
# → Human-readable terminal output

mmr results mmr-a1b2c3 --format markdown
# → Markdown table for PR comments
```

**Review staged changes before committing:**

```bash
mmr review --staged --focus "regression risk"
```

**Review a diff between branches:**

```bash
mmr review --base main --head feature/auth
```

**Override severity gate for a critical path:**

```bash
mmr review --pr 47 --fix-threshold P1    # Only fix P0 and P1
mmr review --pr 47 --fix-threshold P0    # Only fix critical/security issues
```

#### mmr Commands Reference

| Command | Purpose |
|---------|---------|
| `mmr review` | Dispatch a review job to all configured channels |
| `mmr status <job-id>` | Check progress of a running job |
| `mmr results <job-id>` | Collect, reconcile, and output findings |
| `mmr config init` | Auto-detect CLIs and generate `.mmr.yaml` |
| `mmr config test` | Verify all channels (installation + auth) |
| `mmr config channels` | List configured channels |
| `mmr jobs list` | Show recent review jobs |
| `mmr jobs prune` | Remove old jobs (default: older than 7 days) |

#### mmr Configuration (.mmr.yaml)

The config file controls channel definitions, defaults, and project-specific review criteria:

```yaml
version: 1

defaults:
  fix_threshold: P2        # P0/P1/P2 block the gate, P3 is informational
  timeout: 300             # Per-channel timeout in seconds
  format: json             # Default output format
  job_retention_days: 7    # Auto-prune old jobs

# Project-specific criteria appended to every review prompt
review_criteria:
  - "Check for SQL injection in all query builders"
  - "Verify RBAC rules match API contract"

# Channel definitions (auto-generated by mmr config init)
channels:
  claude:
    enabled: true
    command: claude -p
    auth:
      check: "claude -p 'respond with ok' 2>/dev/null"
      # Claude's auth probe is a full LLM round-trip (not a local status
      # check) and routinely takes 9-14s, so 20s is the realistic default.
      timeout: 20
      failure_exit_codes: [1]
      recovery: "Run: claude login"

  antigravity:
    enabled: true
    command: agy
    flags:
      - "--print"
      - "--sandbox"
      - "--dangerously-skip-permissions"
      - "--print-timeout"
      - "300s"
    env: {}
    auth:
      check: "agy -p 'respond with ok' --print-timeout 12s 2>&1 | grep -qiE 'authentication required|authentication timed out' && exit 41 || exit 0"
      timeout: 20
      failure_exit_codes: [41]
      recovery: "Run: agy -p 'hello'"
    timeout: 360

  codex:
    enabled: true
    command: codex exec
    flags:
      - "--skip-git-repo-check"
      - "-s read-only"
      - "--ephemeral"
    auth:
      check: "codex login status 2>/dev/null"
      timeout: 5
      failure_exit_codes: [1]
      recovery: "Run: codex login"
```

**User-level defaults** can be set in `~/.mmr/config.yaml` for settings that apply across all projects (e.g., which channels are installed on your machine). Project config overrides user config. CLI flags override everything.

**Adding a new model CLI** requires only a YAML config change — no code modifications to `mmr`. When a new model CLI ships, add its channel definition to `.mmr.yaml` and you're ready.

#### Severity Levels

mmr uses a standardized P0-P3 severity classification across all channels:

| Level | Name | Definition | Gate Default |
|-------|------|------------|-------------|
| **P0** | Critical | Will cause failure, data loss, security vulnerability, or fundamental architectural flaw | Blocks |
| **P1** | High | Will cause bugs in normal usage, inconsistency, or blocks downstream work | Blocks |
| **P2** | Medium | Improvement opportunity — style, naming, documentation, minor optimization | Blocks |
| **P3** | Trivial | Personal preference, trivial nits | Informational |

With the default `fix_threshold: P2`, any P0, P1, or P2 finding fails the gate. Only P3-only reviews pass.

#### Reconciliation Rules

When multiple channels return findings, mmr applies consensus rules:

| Scenario | Confidence | Action |
|----------|-----------|--------|
| 2+ channels flag same location, same severity | **High** | Report at agreed severity |
| 2+ channels flag same location, different severity | **Medium** | Report at higher severity |
| All channels approve (no findings) | **High** | Gate passed |
| One channel flags P0, others approve | **High** | Report P0 (critical from any source) |
| One channel flags P1/P2, others approve | **Medium** | Report with attribution |
| Channels contradict each other | **Low** | Present both for user adjudication |

### How It Works

1. **Claude reviews first** — completes its own structured multi-pass review using different review lenses (coverage, consistency, quality, downstream readiness)
2. **Independent external review** — the document being reviewed is sent to each available CLI. They don't see Claude's findings or each other's output — every review is independent.
3. **Findings are reconciled** — Scaffold (or `mmr`) merges all findings by confidence level:

| Scenario | Confidence | Action |
|----------|-----------|--------|
| 2+ channels flag the same issue | **High** | Fix immediately |
| All channels approve | **High** | Proceed confidently |
| One channel flags P0, others approve | **High** | Fix it (P0 is critical) |
| One channel flags P1, others approve | **Medium** | Review before fixing |
| Channels contradict each other | **Low** | Present all perspectives to user |
| Compensating-pass P0/P1/P2 finding | **Single-source** | Fix per normal thresholds, label as compensating |

Scaffold verifies CLI authentication before every dispatch. If a token has expired, it tells you and provides the command to re-authenticate — it never silently skips a review.

### When It Runs

Multi-model review activates automatically at **depth 4-5** during any review or validation step — that's 20 steps in total, including all domain reviews (review-prd, review-architecture, review-security, etc.) and all 7 validation checks (traceability, scope creep, implementability, etc.).

At depth 1-3, reviews are Claude-only — still thorough with multiple passes, but single-perspective. You control depth globally during `scaffold init`, per session (`"Use depth 5 for everything"`), or per step (`"Run review-security at depth 5"`).

### What You Need

- **Depth 4 or 5** — set during `scaffold init` or override per step
- **At least one additional CLI** — Codex, Antigravity, and/or Claude CLI. All three dispatched independently as MMR channels when available. Missing Codex or Antigravity channels fall back to compensating Claude passes (labeled `[compensating: Codex-equivalent]` / `[compensating: Antigravity-equivalent]`, single-source confidence); if Claude itself is unavailable, the review proceeds with the remaining channels — MMR does not compensate for a missing Claude channel.
- **Valid authentication** — Scaffold checks before every dispatch (run `mmr config test` to pre-flight all three at once) and tells you if credentials need refreshing

## Build Observability

Build observability gives you a live view of what is happening during a multi-agent implementation run — who claimed what task, which decisions were made, where work is stalled, and whether the codebase conforms to your standards. All data lives under `.scaffold/` and never interferes with the normal pipeline.

### Ledger events

```bash
scaffold observe event task_claimed   --task-id T-42 --task-title "Add auth flow"
scaffold observe event decision_made  --task-id T-42 --decision "Use JWT" --rationale "Stateless auth for microservices"
scaffold observe event task_completed --task-id T-42
scaffold observe event pr_opened      --pr-number 17
```

Events are written to `.scaffold/activity.jsonl` (append-only, lockfile-safe). Each event is stamped with a worktree ID, actor label, branch, and ISO-8601 timestamp.

### Progress snapshot

```bash
scaffold observe progress                       # terminal snapshot
scaffold observe progress --replay              # full timeline with git/PR/test events fused in
scaffold observe progress --no-stall-check      # suppress the Needs Attention surface
scaffold observe progress --output=docs/status.md  # write to a custom path
```

`--replay` fuses the ledger with six adapter event streams (git, GitHub, MMR, pipeline state, test results, pipeline docs) into a chronological timeline. The "Needs Attention" surface fires when work appears stalled — unclaimed tasks, unreviewed PRs, unresolved blockers, or repeated lens skips.

### Audit

```bash
scaffold observe audit                          # run all eight lenses (A–H)
scaffold observe audit --scope=code             # lenses A–G (code conformance only)
scaffold observe audit --scope=docs             # lens H (cross-document consistency only)
scaffold observe audit --profile=full           # include LLM-graded Lens H sub-checks
scaffold observe audit --lens G-decisions       # run a single lens
scaffold observe audit --output=docs/audit.md   # write to a custom path
```

Eight lenses cover TDD evidence (A), acceptance-criteria coverage (B), coding-standards compliance (C), stack conformance (D), design-token usage (E), scope coverage (F), decision-log completeness (G), and cross-document consistency (H). Findings get stable IDs for cross-run tracking:

```bash
scaffold observe ack abc123 --note "accepted, tracked in INFRA-77"
scaffold observe ack abc123 --status open       # reopen a previously acknowledged finding
```

`scaffold observe audit` exits 1 when the verdict is `blocked` (findings at or above `fix_threshold`). This makes it composable as a CI gate.

### Automated fix flow

```bash
scaffold observe audit --fix
```

After the initial audit, Scaffold dispatches an AI agent for each blocking finding, verifies the fix, and writes a post-fix report:

1. **Plan** — filter and sort blocking findings (P0 first, then by lens).
2. **Dispatch** — spawn the configured fix agent (default: `claude -p`) with the finding prompt on stdin. Output is live-streamed so you see what the agent is doing.
3. **Verify** — re-run the finding's lens to confirm the issue is resolved (up to `per_finding_max_attempts` retries).
4. **Report** — run a full post-fix audit and write `docs/audits/<id>-postfix.{md,json}`.

Press Ctrl-C at any time — Scaffold reverts any staged changes the fix agents made and re-applies your original WIP, leaving the working tree unchanged.

Configure via `.scaffold/observability.yaml`:
```yaml
fix:
  dispatcher_command: "claude -p"   # change to any CLI that reads stdin
  timeout_s: 300
  per_finding_max_attempts: 3
```

### Worktree harvest and teardown

When running parallel agents in separate worktrees, collect their activity before removing the worktree:

```bash
# Harvest a live worktree's ledger into the central archive
scaffold observe harvest --worktree=.worktrees/my-feature

# Rotate stale archive entries (worktrees that no longer exist)
scaffold observe harvest --recover

# Full teardown: harvest + remove worktree + delete branch
scripts/teardown-agent-worktree.sh ../my-feature-worktree
```

Harvested events accumulate in `.scaffold/activity-archive/`. `--recover` scans for entries whose worktree is gone and rotates them into monthly `YYYY-MM.jsonl` archives.

### Dashboard

```bash
scripts/generate-dashboard.sh
```

The generated dashboard includes "Build Progress" and "Audit" panels that refresh from the sidecar JSON files. Each panel shows stall signals, a timeline, findings by severity, and lens skip counts.

### Phase-boundary audits

`scaffold complete <step>` automatically runs a cross-document audit (Lens H) after completing any phase-boundary step — `user-stories`, `tech-stack`, `coding-standards`, `design-system`, `implementation-plan`, or `implementation-playbook`. The audit result is printed inline (`[audit] N findings (verdict=…) — see docs/audits/…`) but never blocks the state transition.

Configure via `.scaffold/observability.yaml`:
```yaml
phase_audit:
  enabled: true    # set false to disable
  timeout_s: 60
  detached: false  # true = fire-and-forget (non-blocking always)
```

### MMR `doc-conformance` channel

```bash
mmr review --channels=doc-conformance
```

Runs `scaffold observe audit` as a built-in MMR channel, mapping findings to MMR's Finding shape with stable composite location IDs (`<source_doc>::<lens_id>::<short_id>`). Disabled by default — enable per-project in `.mmr.yaml`:
```yaml
channels_enabled:
  - doc-conformance
```

## Methodology Presets

Not every project needs all 60 steps. Choose a methodology when you run `scaffold init`:

### deep (depth 5)
All steps enabled. Comprehensive analysis of every angle — domain modeling, ADRs, security review, traceability matrix, the works. At depth 4-5, review steps dispatch to the three MMR CLI channels (Codex, Antigravity, Claude) for multi-model validation, with the Superpowers code-reviewer agent added as a complementary 4th channel via the scaffold wrappers. Best for complex systems, team projects, or when you want thorough documentation.

### mvp (depth 1)
Only 7 critical steps: create-prd, review-prd, user-stories, review-user-stories, tdd, implementation-plan, and implementation-playbook. Minimal ceremony — get to code fast. Best for prototypes, hackathons, or solo projects.

### custom (configurable)
You choose which steps to enable and set a default depth (1-5). You can also override depth per step. Best when you know which parts of the pipeline matter for your project.

You can change methodology mid-pipeline with `scaffold init --methodology <preset>`. Scaffold preserves your completed work and adjusts what's remaining.

## CLI Commands

| Command | What It Does |
|---------|-------------|
| `scaffold init` | Initialize `.scaffold/` state, then auto-build hidden adapter artifacts |
| `scaffold run <step> [args…]` | Execute a pipeline step (assembles and outputs the full prompt). Trailing args bind to the step's `$ARGUMENTS` (e.g. `scaffold run review-pr 376 --fix-threshold P1`) |
| `scaffold build` | Generate hidden adapter output under `.scaffold/generated/` and update the managed `.gitignore` block |
| `scaffold adopt` | Bootstrap state from existing artifacts (brownfield projects) |
| `scaffold skip <step> [<step2>...]` | Skip one or more steps with a reason |
| `scaffold complete <step>` | Mark a step as completed (for steps executed outside `scaffold run`) |
| `scaffold reset <step>` | Reset a step back to pending |
| `scaffold status [--compact]` | Show pipeline progress (`--compact` shows only remaining work). Warns if generated adapter output is stale. |
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
| `scaffold skill install` | Install scaffold skills into the current project (automatic — rarely needed manually) |
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
# → Applicable: yes | GitHub remote: yes | Available CLIs: codex, antigravity, claude | Recommended: local-cli (three-CLI MMR review)
# (suffix is `(three-CLI MMR review)` / `(two-CLI MMR review)` / `(single-CLI review)` based on how many of codex/antigravity/claude are detected)

scaffold check ai-memory-setup
# → Rules: no | MCP server: none | Hooks: none | Mode: fresh

# Re-run a completed step in update mode
scaffold reset review-prd --force
scaffold run review-prd

# Open the visual dashboard
scaffold dashboard
```

## Knowledge System

Scaffold ships with 278 domain expertise entries organized in twenty categories:

- **core/** (35 entries) — eval craft, testing strategy, domain modeling, API design, database design, system architecture, ADR craft, security best practices, operations, task decomposition, user stories, UX specification, design system tokens, user story innovation, AI memory management, coding conventions, tech stack selection, project structure patterns, task tracking, CLAUDE.md patterns, multi-model review dispatch, review step template, dev environment, git workflow patterns, automated review tooling, vision craft
- **product/** (6 entries) — PRD craft, PRD innovation, gap analysis, vision craft, vision innovation
- **review/** (20 entries) — review methodology (shared), plus domain-specific review passes for PRD, user stories, domain modeling, ADRs, architecture, API design, database design, UX specification, testing, security, operations, implementation tasks, game design, game economy, game UI, netcode, and more
- **validation/** (7 entries) — critical path analysis, cross-phase consistency, scope management, traceability, implementability, decision completeness, dependency validation
- **finalization/** (3 entries) — implementation playbook, developer onboarding, apply-fixes-and-freeze
- **execution/** (5 entries) — TDD execution loop, task claiming strategy, worktree management, enhancement workflow
- **tools/** (4 entries) — release management, version strategy, session analysis, and more
- **game/** (25 entries) — game engines, networking/netcode, audio middleware, save systems, input patterns, VR/AR, localization, modding/UGC, live operations, platform certification, economy design, AI/behavior, level design, performance, accessibility
- **web-app/** (17 entries) — rendering strategies (SSR/SSG/SPA), state management, authentication, deploy targets, real-time patterns, PWA, performance, security, testing, session patterns, UX patterns, caching, API integration, accessibility
- **backend/** (22 entries) — API design patterns, data store selection, authentication mechanisms, messaging/event systems, observability, deploy strategies, caching, rate limiting, error handling, database migrations, testing, security
- **cli/** (10 entries) — argument parsing, config management, output formatting, distribution channels, testing patterns, error handling, plugin architecture, shell integration, structured output, interactive prompts
- **library/** (12 entries) — visibility (public/internal), bundle formats (ESM/CJS/dual), type definitions, documentation levels, semver discipline, supply chain security, runtime targets
- **mobile-app/** (12 entries) — platform-specific patterns (iOS/Android/cross-platform), distribution models (app store/enterprise), offline support, push notifications, mobile testing
- **data-pipeline/** (12 entries) — batch/streaming/hybrid patterns, orchestration (DAG/event-driven/scheduled), data quality, schema management, lineage, pipeline testing
- **ml/** (12 entries) — training and inference patterns, model types (classical/deep-learning/llm), serving patterns, experiment tracking, model evaluation, MLOps observability
- **browser-extension/** (12 entries) — Manifest V3, content scripts, service workers, cross-browser compatibility, extension security, store submission
- **research/** (25 entries) — experiment loop architecture, parameter optimization, overfitting prevention, experiment tracking, security/sandboxing; domain knowledge for quant-finance (backtesting, risk metrics, market data, strategy patterns), ML-research (architecture search, ablation studies, evaluation), and simulation (engine integration, parameter spaces, compute management)
- **data-science/** (13 entries) — reproducibility, experiment tracking, notebook discipline, model evaluation, data versioning, dev environment (Marimo/Jupyter/Hex), observability, project structure, conventions, requirements, security, testing, architecture
- **web3/** (14 entries) — Foundry tooling and dev environment, smart-contract security and common vulnerabilities, upgradeability patterns, gas optimization, oracles and external data, audit workflow, deployment and verification, testing patterns, access control, EVM/contract architecture, conventions, project structure, requirements
- **mcp-server/** (12 entries) — MCP protocol fundamentals, tool design patterns, resource design, transport patterns (stdio/SSE/HTTP), SDK selection (TypeScript/Python/FastMCP), authentication (OAuth 2.1/API keys), error handling, testing strategies, observability, deployment patterns, versioning and compatibility, prompt primitives

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

## After the Pipeline: Tools & Ongoing Commands

Once your project is scaffolded and you're building features, two categories of commands are available:

### Build Phase (Phase 15)

These are stateless pipeline steps — they appear in `scaffold next` once Phase 14 is complete and can be run repeatedly:

| Command | When to Use |
|---------|-------------|
| `scaffold run single-agent-start` | Start the autonomous implementation loop — Claude picks up tasks and builds. |
| `scaffold run single-agent-resume` | Resume where you left off after closing Claude Code. |
| `scaffold run multi-agent-start` | Start parallel implementation with multiple agents in worktrees. |
| `scaffold run multi-agent-resume` | Resume parallel agent work after a break. |
| `scaffold run quick-task` | Create a focused task for a bug fix, refactor, or small improvement. |
| `scaffold run new-enhancement` | Add a new feature to an already-scaffolded project. Updates the PRD, creates new user stories, and sets up tasks with dependencies. |

### Utility Tools

These are orthogonal to the pipeline — usable at any time, not tied to pipeline state. Defined in `content/tools/` with `category: tool` frontmatter. Run `scaffold list --section tools` for a complete listing (or `--verbose` for argument hints, `--format json` for machine-readable output):

| Command | When to Use |
|---------|-------------|
| `scaffold run version-bump` | Mark a milestone with a version number without the full release ceremony. |
| `scaffold run release` | Run your project's release ceremony — changelog plus whatever release artifacts that project defines. Supports `--dry-run`, `current`, and `rollback`. |
| `scaffold run version` | Show the current Scaffold version. |
| `scaffold run update` | Update Scaffold to the latest version. |
| `scaffold run dashboard` | Open a visual progress dashboard in your browser. |
| `scaffold run prompt-pipeline` | Print the full pipeline reference table. |
| `scaffold run review-code` | Run all 4 MMR CLI review channels (Codex CLI, Claude CLI, Grok CLI, Antigravity CLI) on tracked local code (committed branch diff + staged + unstaged — no untracked files) before commit or push, plus Superpowers code-reviewer as a complementary 5th channel. |
| `scaffold run review-pr` | Run all 4 MMR CLI review channels (Codex CLI, Claude CLI, Grok CLI, Antigravity CLI) on a PR, plus Superpowers code-reviewer as a complementary 5th channel. Also usable on non-PR targets (staged changes, branch diff, specific files) via `mmr review` directly. |
| `scaffold run post-implementation-review` | Full codebase review (Codex CLI + Antigravity CLI + Superpowers code-reviewer — note: does not currently include Claude CLI as a standard channel) after an AI agent completes all tasks — checks requirements coverage, security, architecture alignment, and more. |
| `scaffold run spark` | Explore and expand a raw project idea through Socratic questioning, competitive research, and innovation expansion. Produces a `docs/spark-brief.md` that feeds into `create-vision`. At depth 4+, dispatches to external models for independent research and adversarial red-teaming. |
| `scaffold run session-analyzer` | Analyze Claude Code session logs for patterns and insights. |

Use `scaffold run spark` before `create-vision` when you have a vague idea that needs sharpening. Use `scaffold run review-code` before commit or push when you want a local gate on the current delivery candidate. Use `scaffold run review-pr` after a GitHub PR exists.

> **Codex users:** the generated `AGENTS.md` ships direct `mmr review` shell recipes for `review-code` and `review-pr` (3-channel coverage: Codex CLI, Antigravity CLI, Claude CLI). The Superpowers `code-reviewer` 4th-channel reconcile requires a harness that can dispatch agent skills — Codex cannot do this directly, so run `scaffold run review-{code,pr}` from a Claude Code session when you need full 4-channel coverage.

Run any of these via the CLI or ask the scaffold runner skill in Claude Code or another agent host.

## Releasing Your Project

### Version bumps (development milestones)

```
scaffold run version-bump
```

Bumps the version number and updates the changelog, but doesn't create tags, push, or run the formal release ceremony. Think of it as a checkpoint.

### Creating a release

```
scaffold run release
```

The AI analyzes your commits since the last release, suggests whether this is a major, minor, or patch version bump, and walks you through:
1. Running your project's tests
2. Updating the version number in your project files
3. Generating a changelog entry
4. Executing the release artifacts your project defines

Depending on the target project, that may include a Git tag, hosted release,
package publish, deployment, registry update, or another project-specific
release step. `scaffold run release` is intentionally generic; it follows
the target project's own documented workflow rather than assuming npm or GitHub
for every project.

Options: `--dry-run` to preview, `minor`/`major`/`patch` to specify the bump, `current` to release an already-bumped version, `rollback` to undo.

## Glossary

| Term | What It Means |
|------|---------------|
| **Assembly engine** | The runtime system that constructs full 7-section prompts from meta-prompts, knowledge entries, project context, and methodology settings. |
| **CLAUDE.md** | A configuration file in your project root that tells Claude Code how to work in your project. |
| **Depth** | A 1-5 scale controlling how thorough each step's analysis is, from MVP-focused (1) to exhaustive (5). |
| **Frontmatter** | The YAML metadata block at the top of meta-prompt files, declaring dependencies, outputs, knowledge entries, and other configuration. |
| **Knowledge base** | 60 domain expertise entries that get injected into prompts. Can be extended with project-local overrides. |
| **MCP** | Model Context Protocol. A way for Claude to use external tools like a headless browser. |
| **Meta-prompt** | A short intent declaration in `content/pipeline/` that gets assembled into a full prompt at runtime. |
| **mmr** | Multi-Model Review CLI (`@zigrivers/mmr`). Standalone tool for async multi-model code review dispatch, reconciliation, and severity gating. |
| **Methodology** | A preset (deep, mvp, custom) controlling which steps run and at what depth. |
| **Multi-model review** | Independent validation from Codex/Antigravity CLIs at depth 4-5, catching blind spots a single model misses. |
| **PRD** | Product Requirements Document. The foundation for everything Scaffold builds. |
| **Runner skill** | Auto-activated agent-host skill (Claude Code, OpenCode, …) that surfaces decision points before executing pipeline steps. |
| **Worktrees** | A git feature for multiple working copies. Scaffold uses these for parallel agent execution. |

## Troubleshooting / FAQ

**I ran a command and nothing happened.**
Make sure Scaffold is installed — run `scaffold version` in your terminal.

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

**Antigravity auth expired**
Run `! agy -p "hello"` to re-authenticate interactively. `mmr config test` reports the recovery command when Antigravity credentials need attention.

**Codex CLI auth expired ("refresh token", "sign in again")**
Run `! codex login` to re-authenticate interactively. For CI/headless: set `CODEX_API_KEY` env var. Check auth status with `codex login status`.

**How does Scaffold invoke Codex/Antigravity under the hood?**
Scaffold handles CLI invocation automatically — you never need to type these commands. If you're debugging or curious, here are the headless invocation patterns:
```bash
# Codex (headless mode — use "exec", NOT bare "codex")
codex exec --skip-git-repo-check -s read-only --ephemeral "Review this artifact..." 2>/dev/null

# Antigravity (headless print mode)
printf '%s' "Review this artifact..." | agy --print --sandbox --dangerously-skip-permissions --print-timeout 300s 2>/dev/null
```
These are documented in detail in the `multi-model-dispatch` skill.

**mmr review dispatches but no channels return results**
Check auth: `mmr config test`. If channels show auth failures, re-authenticate with the recovery command shown. If channels are installed but the review hangs, check the per-channel timeout in `.mmr.yaml` — some models take 3-5 minutes for large diffs. Increase `timeout` to 360-600 seconds for large PRs.

**mmr results says "gate failed" but I disagree with the findings**
Use `mmr results <job-id> --format text` to see the full reconciled findings with source attribution and confidence scores. Single-source findings with "unique" agreement are less certain than "consensus" findings. Override the threshold for a specific review: `mmr review --pr 47 --fix-threshold P1` (only gate on P0 and P1).

**How do I add a new AI model CLI to mmr?**
Add a channel definition to `.mmr.yaml` with the command, auth check, and output parser. No code changes needed. See the [mmr Configuration](#mmr-configuration-mmryaml) section for the full schema.

**I upgraded and my pipeline shows old step names**
Run `scaffold status` — the state manager automatically migrates old step names (e.g., `add-playwright` → `add-e2e-testing`, `multi-model-review` → `automated-pr-review`) and removes retired steps.

## Architecture (for contributors)

The project is a TypeScript CLI (`@zigrivers/scaffold`) built with yargs, targeting ES2022/Node16 ESM.

### Source layout

```
src/
├── cli/commands/     # 19 CLI command implementations
├── cli/middleware/    # Project root detection, output mode resolution
├── cli/output/       # Output strategies (interactive, json, auto)
├── core/assembly/    # Assembly engine — meta-prompt → full prompt
├── core/adapters/    # Platform adapters (Claude Code, Codex, Universal)
├── core/dependency/  # DAG builder, topological sort, eligibility
├── core/knowledge/   # Knowledge update assembler
├── state/            # State manager, lock manager, decision logger
├── config/           # Config loading, migration, schema validation
├── project/          # Project detector, CLAUDE.md / AGENTS.md managers, adoption
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
- **Platform adapters** (`src/core/adapters/`) — 3-step lifecycle (initialize → generateStepWrapper → finalize) producing `.scaffold/generated/claude-code/commands/`, `.scaffold/generated/codex/AGENTS.md`, and `.scaffold/generated/universal/prompts/README.md`. Skills install separately to `.claude/skills/` and `.agents/skills/`.
- **Project detector** (`src/project/detector.ts`) — Scans for file system signals to classify projects as greenfield, brownfield, or v1-migration.
- **Check command** (`src/cli/commands/check.ts`) — Applicability detection for conditional steps (platform detection, GitHub remote detection, CLI availability).

### Content layout

All build inputs live under `content/`:

```
content/
├── pipeline/         # 90 meta-prompts organized by 16 phases (phases 0-15, including build)
├── tools/            # 12 tool meta-prompts (stateless, category: tool)
├── knowledge/        # 278 domain expertise entries (core, product, review, validation, finalization, execution, tools, game, web-app, backend, cli, library, mobile-app, data-pipeline, ml, browser-extension, research, data-science, web3, mcp-server)
├── methodology/      # 3 YAML presets (deep, mvp, custom)
└── skills/           # Skill templates with {{markers}} for multi-platform resolution (includes mmr)
```

### mmr package layout

`@zigrivers/mmr` lives in `packages/mmr/` as an independent workspace package:

```
packages/mmr/
├── src/
│   ├── commands/     # review, status, results, config, jobs (yargs)
│   ├── config/       # Zod schema, 4-layer config loader, builtin channel presets
│   ├── core/         # job-store, auth, prompt assembly, parser, reconciler, dispatcher
│   └── formatters/   # json, text, markdown output formatters
├── templates/        # Immutable core review prompt (severity defs, output format)
└── tests/            # 60 tests across 11 files
```

Generated output (gitignored):
```
skills/               # Resolved skills (built from content/skills/ templates)
dist/                 # Compiled TypeScript output
```

### Testing

- **Vitest** for unit and E2E tests (73 test files, 997 tests, 90% coverage)
- **Performance benchmarks** — assembly p95 < 500ms, state I/O p95 < 100ms, graph build p95 < 2s
- **Shell script tests** via bats (70 tests covering dashboard, worktree, frontmatter, install/uninstall)
- **Meta-evals** — 39 cross-system consistency checks validating pipeline ↔ command ↔ knowledge integrity
- **Coverage thresholds** — CI enforces 84/80/88/84 minimums (statements/branches/functions/lines)
- Run: `npm test` (unit + E2E), `npm run test:perf` (performance), `make check` (bash gates), `make check-all` (full CI gate)

### Contributing

1. Meta-prompt content lives in `content/pipeline/` — edit the relevant `.md` file
2. If you changed adapter behavior, run `scaffold build` in a test project and inspect the generated artifacts under `.scaffold/generated/` plus the installed skills under `.claude/skills/` and `.agents/skills/`.
3. Run `make check-all` (lint + type-check + test + evals) before submitting
4. Knowledge entries live in `content/knowledge/` — follow the existing frontmatter schema
5. ADRs documenting architectural decisions are in `docs/architecture/adrs/`
6. Run `make hooks` to install git hooks (ShellCheck, frontmatter validation)

## License

MIT
