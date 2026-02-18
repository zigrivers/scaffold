# Scaffold

A guided AI pipeline that takes you from "I have an idea" to working software. Scaffold walks you through 27 structured prompts — run them in order, and Claude Code handles the research, planning, and implementation for you.

By the end, you'll have a fully planned, standards-documented, implementation-ready project with working code.

## What is Scaffold?

Scaffold is a pipeline of AI-powered prompts designed for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Anthropic's command-line coding tool. If you have an idea for a software project but don't know where to start — or you want to make sure your project is set up with solid architecture, standards, and tests from day one — Scaffold guides you through every step.

Here's how it works: you install Scaffold, then run slash commands like `/scaffold:create-prd` in Claude Code. Each command is a carefully structured prompt that tells Claude exactly what to research, what decisions to make, and what files to create. You don't need to write the prompts yourself — just run the commands and answer Claude's questions along the way.

Each step in the pipeline produces a specific artifact — a planning document, a configuration file, a standards guide, or actual code — and then tells you exactly which command to run next. You follow the chain from defining your product all the way through to a working implementation.

## Prerequisites

Before using Scaffold, you'll need the following tools installed:

### Required

**Node.js** (v18 or later)
Needed for Beads and most modern JavaScript/TypeScript projects.
- Install: https://nodejs.org or `brew install node`
- Verify: `node --version`

**Git**
Needed for version control and Beads task tracking.
- Install: https://git-scm.com or `brew install git`
- Verify: `git --version`

**Claude Code**
The AI coding assistant that runs the Scaffold prompts. Claude Code is a command-line tool from Anthropic — it's not the same as the Claude web chat.
- Install: `npm install -g @anthropic-ai/claude-code`
- Verify: `claude --version`
- Docs: https://docs.anthropic.com/en/docs/claude-code

**Beads**
A git-backed task tracker designed for AI agents. Scaffold uses Beads (`bd`) to create and manage the task graph that drives implementation. Think of it as a to-do list that both you and Claude can read and update.
- Install: `npm install -g @beads/bd`
- Verify: `bd --version`
- Repo: https://github.com/steveyegge/beads

### Optional

**Playwright MCP** (web apps only)
Lets Claude control a real browser for visual testing and screenshots. MCP (Model Context Protocol) is a way for Claude to use external tools — in this case, a headless browser.
- Install: `claude mcp add playwright npx @playwright/mcp@latest`
- Only needed if your project has a web frontend

**ChatGPT subscription** (for multi-model review)
One optional step (`multi-model-review`) sets up automated code review using both Claude and OpenAI's Codex. This requires a ChatGPT subscription (Plus, Pro, or Team) — reviews use credits (~25 per review) with weekly limits that vary by plan. You can skip this step entirely if you don't have one.

**Codex CLI and/or Gemini CLI** (for user stories multi-model review)
One optional step (`user-stories-multi-model-review`) runs independent AI reviewers against your user stories to catch gaps a single model might miss. You need at least one of: Codex CLI (requires ChatGPT subscription) or Gemini CLI (free tier available). See [Multi-Model Stories Review Setup](docs/multi-model-stories-review-setup.md) for detailed instructions.

## Installation

There are two ways to install Scaffold. Both give you the same commands — the only difference is the prefix you type.

### Option 1: Claude Code Plugin (recommended)

Open Claude Code and run:

```
/plugin marketplace add zigrivers/scaffold
```

Then install the plugin:

```
/plugin install scaffold@zigrivers-scaffold
```

After installing, commands are available as `/scaffold:command-name` (for example, `/scaffold:create-prd`).

**What's a plugin?** Claude Code plugins are add-on command packages. When you install one, its commands become available as slash commands you can run in any Claude Code session. The plugin prefix (`/scaffold:`) keeps them organized and separate from other commands.

### Option 2: User Commands (shorter prefix)

If you prefer a shorter prefix, clone the repo and run the install script:

```bash
git clone https://github.com/zigrivers/scaffold
cd scaffold && ./scripts/install.sh
```

Commands are available as `/user:command-name` (for example, `/user:create-prd`).

To uninstall later: `./scripts/uninstall.sh`

### Verify Installation

After installing, open Claude Code and run:

```
/scaffold:prompt-pipeline
```

(or `/user:prompt-pipeline` if you used Option 2)

This prints the full pipeline reference. If you see a table of phases and commands, you're all set.

## Updating

When new prompts or fixes are released, update to get the latest versions.

### Plugin installs

From a Claude Code session:

```
/scaffold:update
```

Or update the plugin directly:

```
/plugin marketplace update zigrivers-scaffold
```

### User command installs

From a Claude Code session:

```
/user:update
```

Or from the terminal:

```bash
./scripts/update.sh
```

If you no longer have the repo cloned locally, the update command will fetch it automatically.

## Quick Start

Here's what the first few steps look like in practice:

**1. Create a new directory and open Claude Code**

```bash
mkdir my-project && cd my-project
git init
claude
```

**2. Define your product**

```
/scaffold:create-prd I want to build a recipe sharing app where users can save, organize, and share recipes with friends
```

Claude will ask you clarifying questions about your idea, research best practices, and produce `docs/plan.md` — a detailed product requirements document (PRD). This becomes the foundation that all later steps build on.

**3. Analyze the PRD for gaps**

```
/scaffold:prd-gap-analysis
```

Claude reviews the PRD it just created, identifies missing pieces, suggests innovations, and updates the plan with your approval.

**4. Set up task tracking**

```
/scaffold:beads
```

This initializes Beads in your project and creates the `CLAUDE.md` file — a configuration file that tells Claude how to work in your project.

**5. Keep following the chain**

Each command tells you what to run next when it finishes. Just follow the prompts through Phase 2 (project foundation), Phase 3 (dev environment), and beyond. The pipeline is designed so you never have to wonder "what's next?"

## The Full Pipeline

### Phase 0 — Prerequisites (one-time setup)

| Action | Command |
|--------|---------|
| Install Beads | `npm install -g @beads/bd` |
| Install Playwright MCP | `claude mcp add playwright npx @playwright/mcp@latest` **(optional — web apps only)** |

### Phase 1 — Product Definition

Define what you're building.

| # | Command | What It Does |
|---|---------|-------------|
| 1 | `/scaffold:create-prd` | Creates `docs/plan.md` — a detailed product requirements document from your idea |
| 2 | `/scaffold:prd-gap-analysis` | Reviews the PRD for missing pieces and suggests innovations |

### Phase 2 — Project Foundation

Establish the technical decisions and standards for your project.

| # | Command | What It Does |
|---|---------|-------------|
| 3 | `/scaffold:beads` | Initializes Beads task tracking and creates `CLAUDE.md` |
| 4 | `/scaffold:tech-stack` | Researches and documents technology choices in `docs/tech-stack.md` |
| 5 | `/scaffold:claude-code-permissions` | Configures permissions so Claude can work without asking for approval on every action |
| 6 | `/scaffold:coding-standards` | Creates `docs/coding-standards.md` with conventions, patterns, and linting rules |
| 7 | `/scaffold:tdd` | Creates `docs/tdd-standards.md` with test-driven development practices |
| 8 | `/scaffold:project-structure` | Defines and scaffolds the directory structure with `docs/project-structure.md` |

### Phase 3 — Development Environment

Get the dev server running and set up collaboration infrastructure.

| # | Command | What It Does | Notes |
|---|---------|-------------|-------|
| 9 | `/scaffold:dev-env-setup` | Sets up dev server, database, environment variables, and `docs/dev-setup.md` | |
| 10 | `/scaffold:design-system` | Creates a design system with components, colors, and typography | **Optional** — frontend projects only |
| 11 | `/scaffold:git-workflow` | Configures branching strategy, CI pipeline, and parallel agent worktrees in `docs/git-workflow.md` | |
| 11.5 | `/scaffold:multi-model-review` | Sets up automated code review using Claude and OpenAI Codex on PRs | **Optional** — requires ChatGPT subscription (credits) |

### Phase 4 — Testing Integration

Add end-to-end testing for your platform.

| # | Command | What It Does | Notes |
|---|---------|-------------|-------|
| 12 | `/scaffold:add-playwright` | Configures Playwright for browser-based visual testing | **Optional** — web apps only |
| 13 | `/scaffold:add-maestro` | Configures Maestro for mobile UI testing | **Optional** — Expo/mobile apps only |

### Phase 5 — Stories & Planning

Break the PRD down into implementable user stories.

| # | Command | What It Does | Notes |
|---|---------|-------------|-------|
| 14 | `/scaffold:user-stories` | Creates `docs/user-stories.md` with detailed stories for every PRD feature | |
| 15 | `/scaffold:user-stories-gaps` | Gap analysis and UX innovation pass on user stories | |
| 15.5 | `/scaffold:user-stories-multi-model-review` | Multi-model coverage audit with Codex/Gemini reviewers | **Optional** — requires Codex/Gemini CLI |
| 16 | `/scaffold:platform-parity-review` | Audits docs for platform coverage gaps | **Optional** — multi-platform projects only |

### Phase 6 — Consolidation & Verification

Make sure everything is consistent before implementation begins.

| # | Command | What It Does |
|---|---------|-------------|
| 17 | `/scaffold:claude-md-optimization` | Restructures and optimizes `CLAUDE.md` as the single source of truth |
| 18 | `/scaffold:workflow-audit` | Verifies all docs are consistent on workflow, naming, and processes |

### Phase 7 — Implementation

Build the actual software.

| # | Command | What It Does |
|---|---------|-------------|
| 19 | `/scaffold:implementation-plan` | Creates a full task graph in Beads from user stories and standards |
| 20 | `/scaffold:implementation-plan-review` | Reviews task quality, coverage, dependencies, and sizing |
| 21 | `/scaffold:single-agent-start` | Starts the autonomous implementation loop — Claude picks up tasks and builds |

## Understanding the Pipeline Flow

Not every step applies to every project. Here's how to navigate the optional steps:

### Web App (React, Next.js, etc.)

Run the full pipeline including:
- `/scaffold:design-system` (Phase 3) — for your UI components
- `/scaffold:add-playwright` (Phase 4) — for browser testing

### Mobile App (Expo / React Native)

Run the full pipeline including:
- `/scaffold:design-system` (Phase 3) — for your UI components
- `/scaffold:add-maestro` (Phase 4) — for mobile UI testing

### Backend / CLI / API-only

Skip these optional steps:
- Skip `/scaffold:design-system` — no frontend to design
- Skip `/scaffold:add-playwright` — no browser to test
- Skip `/scaffold:add-maestro` — no mobile app to test

### Multi-platform (web + mobile)

Run everything above, including both Playwright and Maestro, plus:
- `/scaffold:platform-parity-review` (Phase 5) — ensures all platforms have equal feature coverage

### Other optional steps

- `/scaffold:multi-model-review` — requires a ChatGPT subscription (Plus/Pro/Team). Sets up a two-tier automated code review (Claude + OpenAI Codex) on every PR. Reviews use credits (~25 per review, weekly limits). Skip it if you don't have a ChatGPT subscription.
- `/scaffold:user-stories-multi-model-review` — runs independent Codex and/or Gemini reviews of your user stories against the PRD. Requires at least one of: Codex CLI (ChatGPT subscription) or Gemini CLI (free tier available). See [setup guide](docs/multi-model-stories-review-setup.md).
- `/scaffold:platform-parity-review` — only needed if your project targets multiple platforms (e.g., web + iOS + Android). Skip it for single-platform projects.

## After the Pipeline: Ongoing Commands

Once your project is scaffolded and you're building features, these commands are available anytime:

| Command | When to Use |
|---------|-------------|
| `/scaffold:new-enhancement` | You want to add a new feature to an already-scaffolded project. It updates the PRD, creates new user stories, and sets up Beads tasks with proper dependencies. |
| `/scaffold:quick-task` | You need a focused Beads task for a bug fix, refactor, performance improvement, or small refinement — work that needs clear acceptance criteria and a test plan but not full enhancement discovery. |
| `/scaffold:release` | You're ready to ship a new version. It analyzes your commits, suggests a version bump (major/minor/patch), updates the changelog, bumps the version number in your project files, and creates a Git tag and GitHub release. Supports `--dry-run` to preview changes and `rollback` to undo a bad release. |
| `/scaffold:single-agent-resume` | You closed Claude Code and want to pick up where you left off. It checks your current git state, finds in-progress tasks, and resumes the workflow. |
| `/scaffold:prompt-pipeline` | Quick reference — prints the full pipeline table so you can see where you are and what's next. |
| `/scaffold:implementation-plan-review` | Re-run after creating 5+ new tasks to audit quality and dependencies. |
| `/scaffold:platform-parity-review` | Re-run after adding platform-specific features to check for coverage gaps. |
| `/scaffold:multi-model-review` | Runs automatically on every PR once configured. |

## Releasing Your Project

Once you've built features and are ready to ship a version, use the release command:

### Create a release

```
/scaffold:release
```

Claude analyzes your commits since the last release, suggests whether this is a major, minor, or patch version bump (based on your commit messages), and walks you through:
1. Running your project's tests to make sure everything passes
2. Updating the version number in your project files (`package.json`, `pyproject.toml`, etc.)
3. Generating a changelog entry from your commit history
4. Creating a Git tag and GitHub release

You confirm each step before it happens.

### Preview without executing

```
/scaffold:release --dry-run
```

Shows you exactly what would happen — version bump, changelog preview, files that would change — without actually modifying anything. Use this when you want to check before committing.

### Specify the version bump

```
/scaffold:release minor
```

Skip the auto-suggestion and tell Claude exactly what type of bump you want: `major`, `minor`, or `patch`.

### Undo a release

```
/scaffold:release rollback
```

Made a mistake? This deletes the GitHub release, removes the Git tag, and reverts the version bump commit. You'll need to confirm by typing the exact tag name as a safety measure.

### First release

If your project has never been released (no Git tags), the command detects this automatically and guides you through choosing an initial version number and setting up your changelog.

## Glossary

Terms you'll encounter throughout the pipeline:

| Term | What It Means |
|------|---------------|
| **Beads / `bd`** | A task tracker built for AI agents. Like a to-do list that Claude can read, create tasks in, and mark complete. Tasks are stored in git so they're versioned with your code. |
| **CLAUDE.md** | A configuration file in your project root that tells Claude Code how to work in your project — what commands to run, what conventions to follow, and how to handle git workflow. |
| **MCP** | Model Context Protocol. A way for Claude to use external tools. For example, the Playwright MCP lets Claude control a web browser for testing. |
| **PRD** | Product Requirements Document. The detailed plan for what you're building — features, user flows, data models, and success metrics. Created in Phase 1. |
| **Slash commands** | Commands you type in Claude Code that start with `/`. For example, `/scaffold:create-prd` runs the PRD creation prompt. |
| **TDD** | Test-Driven Development. A practice where you write a failing test first, then write code to make it pass. Scaffold sets up TDD standards in Phase 2. |
| **Worktrees** | A git feature that lets you have multiple working copies of your repo at the same time. Scaffold uses these to run multiple Claude Code agents in parallel without conflicts. |
| **Frontmatter** | The YAML metadata block at the top of command files, between `---` markers. Contains the command description and configuration. |

## Troubleshooting / FAQ

**I ran a command and nothing happened.**
Make sure the plugin is installed — run `/scaffold:prompt-pipeline` and check that it prints a table. If it says "unknown command," re-run the installation step.

**Which steps can I skip?**
Only the ones marked **optional** in the pipeline tables above. See [Understanding the Pipeline Flow](#understanding-the-pipeline-flow) for guidance on which optional steps apply to your project type.

**Can I go back and re-run a step?**
Yes. Most steps are idempotent — they'll update existing files rather than creating duplicates. This is especially useful for the gap analysis and review steps.

**Do I need to run every step in one sitting?**
No. You can stop after any step and come back later. When you return, use `/scaffold:single-agent-resume` if you're in the implementation phase, or just run the next command in the pipeline.

**What if Claude asks me a question I don't know the answer to?**
It's fine to say you're not sure. Claude will suggest reasonable defaults and explain the trade-offs. You can always revisit decisions later.

**How do I know which command to run next?**
Every command prints "After This Step" guidance when it finishes, telling you exactly what to run next (including which optional steps to skip based on your project type).

**How do I get the latest prompts?**
Run `/scaffold:update` (or `/user:update`) from a Claude Code session. This fetches the latest version and updates your command files. You can also run `./scripts/update.sh` from the terminal. See [Updating](#updating) for details.

**How do I create a release?**
Run `/scaffold:release`. It analyzes your commits, suggests a version number, and handles the changelog, Git tag, and GitHub release for you. Use `--dry-run` first if you want to preview what will happen.

**Can I use this for an existing project?**
Scaffold is designed for new projects. For existing projects, you can use `/scaffold:new-enhancement` to add features or `/scaffold:quick-task` for bug fixes and small improvements, both using the same structured approach. The full pipeline assumes a fresh start.

## How It Works (for contributors)

The pipeline lives in a few key places:

- **`prompts.md`** — The source of truth. Contains all 28 prompts in a single file with a setup order table at the top and individual prompt sections below.
- **`commands/`** — Individual `.md` files (one per command) with YAML frontmatter and "After This Step" guidance. These are what Claude Code actually executes when you run a slash command.
- **`.claude-plugin/plugin.json`** — Plugin manifest that tells Claude Code the plugin's name and metadata.
- **`skills/scaffold-pipeline/SKILL.md`** — Auto-activated skill that provides pipeline context.
- **`scripts/`** — Install, uninstall, and command extraction scripts.

The relationship between `prompts.md` and `commands/`: the prompt content comes from `prompts.md`, while frontmatter and "After This Step" sections are maintained only in the `commands/` files. If you edit a prompt, update both places.

## Contributing

1. Edit `prompts.md` (the source of truth for prompt content)
2. Update the corresponding file in `commands/` with any content changes
3. If adding a new command, update the frontmatter mapping in `scripts/extract-commands.sh`
4. Keep the setup order table at the top of `prompts.md` in sync with actual prompt sections

## License

MIT
