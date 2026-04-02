# Gemini Runner Support Design

## Problem

Scaffold currently gives Claude Code a first-class interactive runner experience through project-local skills in `.claude/skills/`, and it gives Codex a partial project-local experience through `AGENTS.md` guidance. Gemini CLI does not get an equivalent integration path.

Today, a downstream project can use `scaffold run <step>` directly from a shell, but Gemini itself does not get a project-local runner surface that turns plain requests like `scaffold status` or `scaffold create-prd` into the Scaffold runner workflow. The repo also has no Gemini adapter output, no Gemini command generation, and no Gemini-specific context bridge.

## Goals

- Let downstream projects use Gemini CLI with Scaffold in a first-class, project-local way.
- Make plain Gemini prompts like `scaffold status` and `scaffold create-prd` route through Scaffold runner behavior instead of acting like unsupported free text.
- Add explicit Gemini-native slash commands for the same workflow, so the UX is both discoverable and direct.
- Keep Claude Code and Codex support working without regression.
- Keep the integration shared in the project repo, not user-home-only.

## Non-Goals

- Do not replace the existing Claude Code plugin or `.claude/skills/` workflow.
- Do not make Gemini support depend on user-scope `~/.gemini/...` state.
- Do not remove or weaken Beads as an optional downstream project feature.
- Do not make generic release or maintainer docs more Scaffold-specific than necessary.

## Decision Summary

Use a hybrid Gemini integration:

1. **Shared project-local agent skills** in `.agents/skills/`
2. **A managed root `GEMINI.md` import block** so Gemini always loads the runner/pipeline instructions
3. **Project-local Gemini custom commands** in `.gemini/commands/scaffold/`

This gives two entry paths:

- **Plain text**: `scaffold status`, `scaffold create-prd`, `what's next?`
  - Powered by `GEMINI.md` importing the shared runner instructions
- **Explicit Gemini slash commands**: `/scaffold:status`, `/scaffold:create-prd`
  - Powered by `.gemini/commands/scaffold/*.toml`

This is the closest correct Gemini-native UX:

- Gemini officially supports project-local `GEMINI.md` context and project-local `.gemini/commands/`
- Those two surfaces are stable, shareable, and check-in friendly
- The shared `.agents/skills/` files remain useful as the canonical cross-agent instruction content and continue to serve Codex-style environments

## Architecture

### 1. New `gemini` Platform Adapter

Add a new platform adapter `gemini` to the existing adapter registry.

Responsibilities:

- Generate Gemini custom command files under `.gemini/commands/scaffold/`
- Sync shared agent-skill files into `.agents/skills/`
- Ensure `GEMINI.md` contains a managed Scaffold section that imports those shared skills

This keeps Gemini support in the same build pipeline model as Claude/Codex/Universal instead of bolting it onto README-only setup.

### 2. Shared Agent Skill Source

Create a packaged, non-hidden source directory for cross-agent skill content:

- `agent-skills/scaffold-runner/SKILL.md`
- `agent-skills/scaffold-pipeline/SKILL.md`

Why a new packaged source:

- The published npm package currently includes `skills/` but not `.agents/skills/`
- Hidden repo-local `.agents/skills/` cannot be treated as the distributable source of truth
- Gemini/Codex shared content should not be forced to reuse the Claude-specific wording in `skills/`

The existing repo-local `.agents/skills/` content should become generated or synchronized copies from this packaged source, not an independent hand-maintained branch.

### 3. Managed `GEMINI.md`

Gemini CLI officially loads project-local `GEMINI.md` files and supports `@relative/path.md` imports.

Scaffold should manage a dedicated section in the project root `GEMINI.md`, analogous to how `CLAUDE.md` is already managed elsewhere in the codebase.

Managed section behavior:

- If `GEMINI.md` does not exist, create it
- If it exists, preserve user content and update only the Scaffold-managed block
- Import the shared project-local skills:
  - `@./.agents/skills/scaffold-runner/SKILL.md`
  - `@./.agents/skills/scaffold-pipeline/SKILL.md`

This is the bridge that makes plain-text Gemini requests work without requiring user-scope skill installation.

### 4. Gemini Custom Commands

Generate project-local TOML command files under:

- `.gemini/commands/scaffold/status.toml`
- `.gemini/commands/scaffold/next.toml`
- `.gemini/commands/scaffold/<step>.toml` for enabled pipeline steps and tools

Command naming:

- `.gemini/commands/scaffold/create-prd.toml` becomes `/scaffold:create-prd`
- `.gemini/commands/scaffold/status.toml` becomes `/scaffold:status`

Each generated command should be a thin Gemini-native wrapper that tells Gemini to use the Scaffold runner behavior for the corresponding request, not a second independent workflow.

Example behavior:

- `/scaffold:create-prd` effectively says: handle the request `scaffold create-prd` using the imported Scaffold runner instructions
- `/scaffold:status` effectively says: handle the request `scaffold status` using the imported Scaffold runner instructions

The command files should stay small and stable so rebuild churn is predictable.

## UX Model

### Plain Text in Gemini

When a user types:

- `scaffold status`
- `scaffold create-prd`
- `what's next?`

Gemini sees the Scaffold runner instructions through `GEMINI.md` and should treat those as runner-activation phrases.

### Explicit Slash Commands in Gemini

When a user wants explicit Gemini-native commands, they can run:

- `/scaffold:status`
- `/scaffold:create-prd`
- `/scaffold:review-pr`

After file changes, Gemini users can refresh with:

- `/memory reload`
- `/commands reload`

## Config and Init Changes

Add `gemini` as a valid project platform in:

- config schema
- config types
- adapter registry
- wizard/platform selection

Init behavior:

- Keep Claude Code as the default existing platform
- Offer Gemini alongside Codex in interactive init
- Do not silently add Gemini to already-existing projects during migration

This keeps upgrades safe while making Gemini an explicit first-class option.

## Build Behavior

When `platforms` includes `gemini`, `scaffold build` should:

- write/update `.agents/skills/scaffold-runner/SKILL.md`
- write/update `.agents/skills/scaffold-pipeline/SKILL.md`
- write/update the Scaffold-managed section in `GEMINI.md`
- generate Gemini custom commands in `.gemini/commands/scaffold/`

When `platforms` does not include `gemini`, build should not generate Gemini files.

Universal output should still always be generated as it is today.

## `scaffold skill` Command Changes

The current `scaffold skill` command is Claude-only and writes only to `.claude/skills/`.

Update it so the command can also manage shared agent skills used by Gemini/Codex-style environments.

Command behavior:

- default install writes:
  - `.claude/skills/` from Claude-specific `skills/`
  - `.agents/skills/` from packaged shared `agent-skills/`
- list/remove report both locations clearly

This keeps the existing user entrypoint but makes it cross-agent aware.

The Gemini custom commands and `GEMINI.md` block remain build-owned, not skill-command-owned.

## File Ownership

### Build-owned, shareable project files

- `.agents/skills/scaffold-runner/SKILL.md`
- `.agents/skills/scaffold-pipeline/SKILL.md`
- `.gemini/commands/scaffold/*.toml`
- Scaffold-managed block inside `GEMINI.md`

These are intended to live in the project and be shareable through version control.

### Existing hidden generated files remain hidden

- `.scaffold/generated/claude-code/...`
- `.scaffold/generated/codex/...`
- `.scaffold/generated/universal/...`

Gemini is the exception because the CLI’s real integration surfaces are repo-visible by design.

## Documentation Changes

Update active docs to make the supported Gemini workflow explicit:

- `README.md`
  - explain plain-text Gemini support via `GEMINI.md`
  - explain explicit Gemini slash commands via `.gemini/commands/`
  - explain refresh commands (`/memory reload`, `/commands reload`)
- `docs/scaffold-overview.md` and `docs/v2/reference/scaffold-overview.md`
  - stop describing agent integration as Claude-only where that is no longer true
- any install/help text for `scaffold skill`
  - explain Claude vs shared agent skills correctly

Avoid claiming impossible parity. The docs should say:

- Plain `scaffold ...` works because Gemini loads project context from `GEMINI.md`
- Slash commands are `/scaffold:<name>`, not bare shell commands

## Tests

Add or update tests for:

- config schema accepts `gemini`
- wizard can include `gemini`
- adapter registry includes `gemini`
- `build` generates `.gemini/commands/scaffold/*.toml` when Gemini is configured
- `build` updates `GEMINI.md` without clobbering user content
- `build` writes `.agents/skills/` for Gemini projects
- `scaffold skill install/list/remove` handles both `.claude/skills` and `.agents/skills`
- no regression for Claude, Codex, or Universal outputs

## Acceptance Criteria

- A Scaffold project configured for Gemini gets project-local Gemini integration files after `scaffold build`
- Plain Gemini prompts like `scaffold status` and `scaffold create-prd` have the runner instructions in context via `GEMINI.md`
- Gemini slash commands like `/scaffold:status` and `/scaffold:create-prd` exist and are namespaced correctly
- Existing Claude Code and Codex support still works
- The published npm package includes the new shared skill source used to generate `.agents/skills/`
