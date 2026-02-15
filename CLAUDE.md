# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **prompt pipeline** — a curated sequence of structured prompts used to scaffold new software projects with Claude Code. The entire pipeline lives in a single file (`prompts.md`) and is designed to be run in order, with each prompt building on artifacts produced by earlier ones.

## Structure

This repo is a **Claude Code plugin** (installable via `/plugin marketplace add`) and also distributable as user commands.

### Source of Truth
`prompts.md` contains:
1. **Setup Order table** (top of file) — The execution sequence across 7 phases, from product definition through implementation
2. **Individual prompt sections** — Each marked with `# Prompt Name (Prompt)`, containing the full prompt text to paste into Claude Code sessions
3. **Migration prompts** — For updating projects created with older versions of the pipeline

### Plugin Structure
- `.claude-plugin/plugin.json` — Plugin manifest (name: `scaffold`)
- `commands/` — 25 individual command `.md` files with YAML frontmatter and "Next Steps" guidance, generated from `prompts.md`
- `skills/scaffold-pipeline/SKILL.md` — Auto-activated pipeline context skill
- `scripts/` — Install, uninstall, and extraction scripts

## Key Concepts

- **Phases are sequential**: Phase 0 (prerequisites) through Phase 7 (implementation), with dependency constraints documented in the "Key Dependencies Between Prompts" section
- **Beads** (`@beads/bd`) is the task tracking tool used throughout the pipeline
- **Worktrees** are used for parallel agent execution — the Git Workflow prompt sets up permanent worktrees for multiple Claude Code sessions
- **Optional prompts** are marked and only apply to specific project types (web apps, mobile/Expo, multi-platform)

## Editing Guidelines

When modifying prompts:
- Preserve the `# Name (Prompt)` heading convention — this is how prompts are identified
- Keep the Setup Order table at the top in sync with the actual prompt sections below
- Respect inter-prompt dependencies (documented in the dependency graph at line ~128)
- Each prompt's "Process" section at the end defines its execution rules — don't remove these
- After editing `prompts.md`, update the corresponding file in `commands/` to stay in sync (frontmatter + "After This Step" sections are maintained in `commands/` only, not in `prompts.md`)
