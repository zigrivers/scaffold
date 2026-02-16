# Scaffold v2 — Product Requirements Document

## 1. Product Overview

Scaffold v2 is a modular, profile-based prompt pipeline for scaffolding new software projects with Claude Code. It replaces the rigid 25-prompt linear sequence of v1 with a dependency-graph engine that lets users select a **profile** (e.g., `web-app`, `cli-tool`, `mobile`, `minimal`) and automatically resolves which prompts to run, in what order, based on declared dependencies. Users can override any built-in prompt, add custom prompts, and create their own profiles — all while preserving the high-quality prompt content that makes v1 effective.

Scaffold v2 is for solo developers and small teams who use Claude Code as their primary development tool and want to go from a raw product idea to a fully documented, task-tracked, CI-configured project in under an hour — without running prompts that don't apply to their project type.

## 2. User Personas

### Solo AI-First Developer ("Alex")

- **Goals**: Scaffold a new project quickly, get to implementation fast, use Claude Code agents (single or multi-agent) for all coding work. Wants every document and configuration to be AI-optimized so agents can work autonomously.
- **Pain points with v1**: Has to manually skip optional prompts (Playwright, Maestro, Design System) by remembering which ones don't apply. Runs the full pipeline even for a CLI tool that doesn't need half the prompts. No way to customize prompts that don't quite fit their workflow.
- **Context of use**: Works alone, uses Claude Code CLI daily, launches 1-3 agents in worktrees for implementation. Projects range from web apps to CLI tools to APIs. Comfortable with the terminal. Has used Scaffold v1 on 2+ projects and understands the pipeline concept.

### Team Lead Adopting AI Workflows ("Jordan")

- **Goals**: Standardize how the team scaffolds projects. Wants a shared profile that includes team-specific prompts (e.g., company coding standards, custom CI templates, internal design system). Needs the pipeline to be repeatable and consistent across team members.
- **Pain points with v1**: Can't customize built-in prompts without forking the repo. No way to share a custom pipeline configuration. Team members run prompts in slightly different orders or skip different ones, leading to inconsistent project setups.
- **Context of use**: Leads a 3-5 person team, all using Claude Code. Wants to create a team profile once and have everyone use it. Evaluates tools on customizability, consistency, and low maintenance overhead.

### First-Time Scaffold User ("Sam")

- **Goals**: Try Scaffold on a new project idea. Doesn't want to read documentation — just wants to run a command and answer questions. Wants the tool to figure out which prompts to run based on the project type.
- **Pain points**: The v1 pipeline is intimidating — 25+ prompts with ordering constraints. Doesn't know which optional prompts apply. Afraid of running things in the wrong order.
- **Context of use**: Has Claude Code installed, heard about Scaffold, wants to try it on a side project. May not know what Beads is. Needs a guided entry point that handles complexity automatically.

## 3. Core User Flows

### Flow 1: Initialize a New Project (`scaffold init`)

This is the primary entry point for all new projects.

**Happy path:**

1. User runs `/scaffold:init` (or `/scaffold:init <idea>` with inline description).
2. Scaffold checks if the current directory already has scaffold artifacts (`.scaffold/config.json`). If found, warns: "This directory already has a scaffold configuration. Run `/scaffold:resume` to continue the existing pipeline, or pass `--force` to reinitialize." Flow stops unless `--force` is provided.
3. Scaffold presents a profile selection using `AskUserQuestion`:
   - **Web App** — Full-stack web application (includes: design system, Playwright, frontend standards)
   - **CLI Tool** — Command-line tool or library (skips: design system, Playwright, Maestro, multi-model review)
   - **Mobile** — React Native / Expo mobile app (includes: Maestro, design system; skips: Playwright)
   - **API Service** — Backend API / microservice (skips: design system, Playwright, Maestro)
   - **Minimal** — Just PRD + tech stack + coding standards + implementation (fewest prompts)
   - **Custom** — I'll choose which prompts to include
4. If user selects "Custom," Scaffold displays all available prompts grouped by phase with checkboxes (via `AskUserQuestion` with `multiSelect: true`). Dependencies are auto-included: if the user selects "Coding Standards," "Tech Stack" is automatically included because it's a dependency. Scaffold shows which prompts were auto-included and why.
5. Scaffold creates `.scaffold/config.json` with the selected profile and resolved prompt list.
6. Scaffold displays the resolved pipeline: a numbered list of prompts that will run, with dependencies visualized. Example:
   ```
   Scaffold pipeline for profile "web-app" (18 prompts):

   Phase 1 — Product Definition
     1. create-prd
     2. prd-gap-analysis

   Phase 2 — Project Foundation
     3. beads
     4. tech-stack
     5. claude-code-permissions
     6. coding-standards
     7. tdd
     8. project-structure

   Phase 3 — Development Environment
     9.  dev-env-setup
     10. design-system
     11. git-workflow

   Phase 4 — Testing Integration
     12. add-playwright

   Phase 5 — Stories & Planning
     13. user-stories
     14. user-stories-gaps

   Phase 6 — Consolidation
     15. claude-md-optimization
     16. workflow-audit

   Phase 7 — Implementation
     17. implementation-plan
     18. implementation-plan-review
   ```
7. Scaffold asks: "Ready to start? The first prompt is `create-prd`." User confirms.
8. Scaffold begins executing the first prompt (`create-prd`). If the user provided `<idea>` in step 1, it's passed as the argument.

**Error/edge cases:**

- **No profile matches**: If the user selects "Custom" but selects zero prompts, Scaffold shows: "At least one prompt must be selected. The minimal viable pipeline is: `create-prd` → `tech-stack` → `implementation-plan`."
- **Dependency conflicts in custom selection**: If the user deselects a prompt that other selected prompts depend on, Scaffold shows the conflict: "`coding-standards` requires `tech-stack`. Include `tech-stack`?" and auto-resolves by adding the dependency.
- **Directory not empty but no scaffold config**: Scaffold proceeds normally — the user may be adding Scaffold to an existing project.
- **User cancels during profile selection**: Pipeline is not created. No files written.

### Flow 2: Resume an In-Progress Pipeline

**Happy path:**

1. User opens a Claude Code session in a project that has `.scaffold/config.json`.
2. User runs `/scaffold:resume` (or the pipeline skill auto-detects and suggests it).
3. Scaffold reads `.scaffold/config.json`, determines which prompts have been completed (each prompt records completion in the config), and identifies the next prompt.
4. Scaffold displays: "Pipeline progress: 8/18 prompts complete. Next: `dev-env-setup`. Run it now?"
5. User confirms. Scaffold executes the next prompt.

**Error/edge cases:**

- **All prompts complete**: Scaffold shows: "Pipeline complete. Run `/scaffold:new-enhancement` to add features, or `/scaffold:single-agent-start` to begin implementation."
- **Config file corrupted or missing completion data**: Scaffold re-scans project artifacts (checks for `docs/plan.md`, `docs/tech-stack.md`, etc.) and infers which prompts have been completed based on their expected outputs. Updates the config accordingly.
- **User wants to re-run a completed prompt**: `/scaffold:resume --from <prompt-name>` re-runs from that prompt forward. Scaffold warns: "This will re-run `coding-standards` and may overwrite `docs/coding-standards.md`. Proceed?" Prompts downstream of the re-run are not automatically re-run — the user can continue with `/scaffold:resume` which picks up the next uncompleted prompt.

### Flow 3: Customize a Prompt

**Happy path:**

1. User wants to modify the `create-prd` prompt to include additional sections specific to their domain (e.g., regulatory compliance for healthtech).
2. User creates `.scaffold/prompts/create-prd.md` with their custom version. The file follows the same format as the built-in prompt (markdown with optional YAML frontmatter).
3. Next time the pipeline runs `create-prd`, Scaffold uses the project-level override instead of the built-in version. Scaffold shows: "Using project override for `create-prd` (.scaffold/prompts/create-prd.md)."

**Three-tier precedence (highest to lowest):**

1. **Project-level** (`.scaffold/prompts/<name>.md`) — Specific to this project
2. **User-level** (`~/.scaffold/prompts/<name>.md`) — Shared across all your projects
3. **Built-in** (`commands/<name>.md` from the plugin) — Default Scaffold prompts

**Adding a custom prompt (not overriding):**

1. User creates `.scaffold/prompts/security-audit.md` with YAML frontmatter declaring dependencies:
   ```yaml
   ---
   description: "Run security audit against OWASP top 10"
   depends-on: [coding-standards, tdd]
   phase: 6
   ---
   ```
2. User adds the prompt to their profile in `.scaffold/config.json` under the `extra-prompts` array, or the prompt's `phase` field causes it to appear in the appropriate pipeline position.
3. When the pipeline reaches Phase 6, Scaffold includes `security-audit` after its dependencies are satisfied.

**Error/edge cases:**

- **Custom prompt has invalid frontmatter**: Scaffold shows a clear error: "`.scaffold/prompts/security-audit.md` has invalid frontmatter: `depends-on` must be an array of prompt names. Valid names: [list]."
- **Circular dependency**: Scaffold detects the cycle during pipeline resolution and reports: "Circular dependency detected: `security-audit` → `compliance-check` → `security-audit`. Remove one dependency to proceed."
- **Custom prompt overrides a built-in but removes required sections**: Scaffold does not validate prompt content — it trusts the user. The override is used as-is. This is intentional: users own their customizations.

### Flow 4: Create and Share a Custom Profile

**Happy path:**

1. User runs `/scaffold:profile create healthtech-api` (or creates the file manually).
2. Scaffold creates `.scaffold/profiles/healthtech-api.json`:
   ```json
   {
     "name": "healthtech-api",
     "extends": "api-service",
     "description": "API service with HIPAA compliance and security audit",
     "add-prompts": ["security-audit", "compliance-check"],
     "remove-prompts": [],
     "prompt-overrides": {
       "create-prd": ".scaffold/prompts/create-prd-healthtech.md"
     }
   }
   ```
3. The profile extends `api-service` (inherits its prompt list and settings), adds two custom prompts, and overrides `create-prd` with a domain-specific version.
4. When another team member runs `/scaffold:init` in a project containing this profile, it appears as an option alongside the built-in profiles.

**Error/edge cases:**

- **Extended profile doesn't exist**: Scaffold shows: "Profile `healthtech-api` extends `api-service`, but `api-service` was not found. Available profiles: web-app, cli-tool, mobile, api-service, minimal."
- **Inheritance chain too deep**: Scaffold supports up to 3 levels of inheritance (e.g., `healthtech-api` → `api-service` → `minimal`). Deeper chains are rejected with: "Profile inheritance is limited to 3 levels. Flatten the chain by copying prompts from intermediate profiles."
- **Profile removes a prompt that added prompts depend on**: Same dependency resolution as custom selection — Scaffold warns and keeps the dependency.

### Flow 5: Dry Run / Preview

**Happy path:**

1. User runs `/scaffold:init --dry-run` (or `/scaffold:preview web-app`).
2. Scaffold resolves the full pipeline for the selected profile without executing anything.
3. Output shows:
   - Complete prompt list with ordering
   - Which prompts are built-in vs. overridden vs. custom
   - Expected output artifacts (files that will be created)
   - Estimated prompt count and phases
4. User reviews and can adjust profile selection before committing.

**Error/edge cases:**

- **Profile has resolution errors**: Dry run still shows the errors (missing dependencies, circular refs) — this is one of its primary purposes. Errors are shown inline next to the affected prompts.

### Flow 6: v1 Project Detection

**Happy path:**

1. User runs `/scaffold:init` in a directory that was scaffolded with v1 (has `docs/plan.md`, `docs/tech-stack.md`, `.beads/`, etc. but no `.scaffold/` directory).
2. Scaffold detects v1 artifacts and shows: "This project was scaffolded with Scaffold v1. I can create a v2 configuration based on what's already been done. No existing files will be modified."
3. Scaffold scans for existing artifacts and maps them to completed prompts:
   - `docs/plan.md` exists → `create-prd` and `prd-gap-analysis` marked complete
   - `docs/tech-stack.md` exists → `tech-stack` marked complete
   - `.beads/` exists → `beads` marked complete
   - etc.
4. Scaffold creates `.scaffold/config.json` with the inferred state and suggests: "Detected 14/18 prompts already completed. Next uncompleted: `claude-md-optimization`. Run `/scaffold:resume` to continue."

**Error/edge cases:**

- **Partial v1 project**: Some artifacts exist, others don't. Scaffold only marks prompts as complete where the expected output artifact exists. It doesn't assume sequential completion — if `docs/tech-stack.md` exists but `docs/coding-standards.md` doesn't, only `tech-stack` is marked complete.
- **User declines v1 detection**: Scaffold proceeds with a fresh `init`, creating `.scaffold/config.json` without marking anything complete.

## 4. Feature Requirements

### Pipeline Engine

#### F-PE-1: Dependency Graph Resolution

- **What**: Prompts declare their dependencies via `depends-on` in frontmatter. The engine performs topological sort to determine execution order. Within a phase, prompts with satisfied dependencies can run in any order (the engine presents them in the order defined by the profile).
- **Why**: Replaces the brittle hardcoded ordering of v1. Allows custom prompts to be inserted anywhere in the pipeline without manual ordering.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Circular dependencies are detected at pipeline resolution time (before any prompt executes) and reported as errors with the full cycle path.
  - If a prompt declares a dependency that doesn't exist in the current profile's prompt list, it's a resolution error: "Prompt `X` depends on `Y`, but `Y` is not in this pipeline. Add `Y` to the profile or remove the dependency."
  - Dependencies are always on prompt names (strings), not on artifact files. This keeps the graph simple and inspectable.
  - Resolution happens once at `init` time and is cached in `.scaffold/config.json`. It's re-resolved when the profile or prompt list changes.

#### F-PE-2: Pipeline State Tracking

- **What**: `.scaffold/config.json` records which prompts have been completed, which are pending, and pipeline metadata (profile used, timestamps, scaffold version). Each prompt's completion is recorded when the prompt finishes executing (not when its output artifact exists).
- **Why**: Enables `resume`, `preview`, progress display, and v1 detection.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Completion is recorded by adding the prompt name to the `completed` array in config.json with a timestamp.
  - A prompt is "completed" when the command finishes executing without the user aborting. Scaffold records this automatically — prompts don't need to self-report.
  - If a completed prompt is re-run (via `--from`), its previous completion entry is replaced with the new timestamp.
  - Config format:
    ```json
    {
      "scaffold-version": "2.0.0",
      "profile": "web-app",
      "created": "2026-02-15T10:30:00Z",
      "prompts": ["create-prd", "prd-gap-analysis", "beads", "..."],
      "completed": [
        { "prompt": "create-prd", "at": "2026-02-15T10:35:00Z" },
        { "prompt": "prd-gap-analysis", "at": "2026-02-15T10:42:00Z" }
      ],
      "extra-prompts": [],
      "prompt-overrides": {},
      "custom-config": {}
    }
    ```

#### F-PE-3: Pipeline Context

- **What**: A shared context object (`.scaffold/context.json`) accumulates data across prompts. Each prompt can read the context and write new entries. Context is key-value pairs with namespaced keys (e.g., `tech-stack.language`, `prd.personas`).
- **Why**: Enables prompts to reference outputs from earlier prompts programmatically. In v1, prompts read files on disk — context provides a structured supplement (not a replacement for file reads).
- **Priority**: Should-have (v1 if time)
- **Business rules**:
  - Context is append-only during normal execution. A prompt can overwrite its own namespace but not another prompt's.
  - Context is JSON. Values can be strings, numbers, booleans, arrays, or objects. No binary data.
  - Prompts access context by reading `.scaffold/context.json` directly. There's no special API — it's a plain file.
  - Example context after `tech-stack` runs:
    ```json
    {
      "tech-stack": {
        "language": "TypeScript",
        "framework": "Next.js",
        "database": "PostgreSQL",
        "test-runner": "Vitest"
      },
      "prd": {
        "project-type": "web-app",
        "has-auth": true,
        "has-realtime": false
      }
    }
    ```
  - If context.json doesn't exist when a prompt tries to read it, the prompt sees an empty object. This is not an error.

#### F-PE-4: Prompt Execution

- **What**: When a prompt is executed, Scaffold loads the prompt content (resolved via the 3-tier precedence), substitutes `$ARGUMENTS` if present, and presents it to Claude Code as a command. The prompt runs within the current Claude Code session.
- **Why**: Prompts are Claude Code commands — they must execute in the user's session where Claude has access to tools, files, and conversation context.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Prompts execute one at a time, sequentially. There is no automatic parallel prompt execution (agents parallelize during implementation, not during pipeline setup).
  - After a prompt completes, Scaffold records completion in config.json and displays: "Prompt `X` complete. Next: `Y`. Run it now?" The user must confirm before the next prompt runs.
  - If a prompt fails (user aborts, Claude errors out), it is NOT marked complete. The user can retry with `/scaffold:resume`.
  - Scaffold does not modify prompt content beyond `$ARGUMENTS` substitution. Prompts are responsible for their own behavior.

### Profiles

#### F-PR-1: Built-in Profiles

- **What**: Four built-in profiles ship with Scaffold v2, each defining a curated list of prompts optimized for that project type.
- **Why**: Most projects fit one of a few categories. Profiles eliminate the need to manually select prompts for common cases.
- **Priority**: Must-have (v1)
- **Business rules**:
  - **web-app**: All prompts from v1 pipeline except Maestro and Platform Parity Review. Includes: create-prd, prd-gap-analysis, beads, tech-stack, claude-code-permissions, coding-standards, tdd, project-structure, dev-env-setup, design-system, git-workflow, add-playwright, user-stories, user-stories-gaps, claude-md-optimization, workflow-audit, implementation-plan, implementation-plan-review. (18 prompts)
  - **cli-tool**: Focused set for CLI tools / libraries. Includes: create-prd, prd-gap-analysis, beads, tech-stack, claude-code-permissions, coding-standards, tdd, project-structure, dev-env-setup, git-workflow, user-stories, user-stories-gaps, claude-md-optimization, workflow-audit, implementation-plan, implementation-plan-review. Excludes: design-system, add-playwright, add-maestro, multi-model-review, platform-parity-review. (16 prompts)
  - **mobile**: For React Native / Expo apps. Includes: create-prd, prd-gap-analysis, beads, tech-stack, claude-code-permissions, coding-standards, tdd, project-structure, dev-env-setup, design-system, git-workflow, add-maestro, user-stories, user-stories-gaps, claude-md-optimization, workflow-audit, implementation-plan, implementation-plan-review. (18 prompts)
  - **api-service**: Backend API / microservice. Includes: create-prd, prd-gap-analysis, beads, tech-stack, claude-code-permissions, coding-standards, tdd, project-structure, dev-env-setup, git-workflow, user-stories, user-stories-gaps, claude-md-optimization, workflow-audit, implementation-plan, implementation-plan-review. Excludes: design-system, add-playwright, add-maestro, multi-model-review, platform-parity-review. (16 prompts — same as cli-tool, but the prompts themselves produce different outputs based on PRD context)
  - **minimal**: Fastest path to implementation. Includes: create-prd, beads, tech-stack, coding-standards, tdd, project-structure, dev-env-setup, git-workflow, user-stories, implementation-plan. Excludes: prd-gap-analysis, claude-code-permissions, design-system, add-playwright, add-maestro, multi-model-review, user-stories-gaps, platform-parity-review, claude-md-optimization, workflow-audit, implementation-plan-review. (10 prompts)
  - Built-in profiles are read-only. Users cannot modify them directly but can extend them via custom profiles.

#### F-PR-2: Custom Profiles

- **What**: Users can create profiles in `.scaffold/profiles/` (project-level) or `~/.scaffold/profiles/` (user-level) that define a custom prompt list, optionally extending a built-in or other custom profile.
- **Why**: Teams and power users need to standardize on a custom pipeline configuration without forking Scaffold.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Profile format:
    ```json
    {
      "name": "my-profile",
      "extends": "web-app",
      "description": "Web app with security audit and compliance",
      "add-prompts": ["security-audit"],
      "remove-prompts": ["multi-model-review"],
      "prompt-overrides": {
        "create-prd": ".scaffold/prompts/create-prd-custom.md"
      }
    }
    ```
  - `extends` is optional. If omitted, the profile must include a full `prompts` array listing every prompt to run.
  - `add-prompts` and `remove-prompts` are applied after inheriting from the parent profile. Adds happen first, then removes.
  - `prompt-overrides` maps prompt names to file paths (relative to project root). These take precedence over the 3-tier lookup for the specified prompts.
  - Custom profiles appear in the profile selection during `scaffold init` alongside built-in profiles.
  - Profiles at the project level (`.scaffold/profiles/`) take precedence over user-level (`~/.scaffold/profiles/`) profiles with the same name.

#### F-PR-3: Profile Inheritance

- **What**: A profile can extend another profile, inheriting its prompt list and settings, then adding/removing prompts and overriding prompt files.
- **Why**: Avoids duplication. A team can create `web-app-plus-security` that extends `web-app` and adds security prompts, without re-listing all 18 web-app prompts.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Inheritance depth is limited to 3 levels. Deeper chains are rejected at resolution time.
  - Resolution order: start with the base profile's prompts → apply `add-prompts` → apply `remove-prompts` → apply `prompt-overrides`. Each level in the chain applies its modifications in this order.
  - If a child profile removes a prompt that a grandchild profile's added prompt depends on, the dependency conflict is surfaced at resolution time, not silently ignored.
  - Circular inheritance (A extends B extends A) is detected and rejected.

### Prompt System

#### F-PS-1: Prompt Format

- **What**: Prompts are Markdown files with optional YAML frontmatter. Frontmatter can declare: `description`, `depends-on`, `phase`, `argument-hint`, and `produces` (list of output artifact paths).
- **Why**: Consistent format enables the engine to resolve dependencies and display pipeline previews. Markdown body is the prompt content passed to Claude Code.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Frontmatter fields:
    - `description` (string, required): Short description shown in pipeline preview and help.
    - `depends-on` (array of strings, optional): Prompt names this prompt depends on. Defaults to empty (no dependencies).
    - `phase` (integer, optional): Phase number (1-7) for display grouping. Defaults to the phase of the last dependency, or 1 if no dependencies.
    - `argument-hint` (string, optional): Hint for `$ARGUMENTS` substitution, shown in help (e.g., `"<idea or @files>"`).
    - `produces` (array of strings, optional): Expected output file paths (e.g., `["docs/plan.md"]`). Used by v1 detection to infer completion. Not enforced — prompts may produce additional outputs.
  - All existing v1 prompts will have frontmatter added/updated to declare `depends-on` and `produces`. The dependency graph is derived from the existing "Key Dependencies Between Prompts" section in prompts.md:
    - `prd-gap-analysis` depends on `create-prd`
    - `tech-stack` depends on `create-prd`
    - `claude-code-permissions` depends on `tech-stack`
    - `coding-standards` depends on `tech-stack`
    - `tdd` depends on `coding-standards`
    - `project-structure` depends on `tdd`
    - `dev-env-setup` depends on `project-structure`
    - `design-system` depends on `dev-env-setup`
    - `git-workflow` depends on `dev-env-setup`
    - `multi-model-review` depends on `git-workflow`
    - `add-playwright` depends on `tdd`
    - `add-maestro` depends on `tdd`
    - `user-stories` depends on `create-prd`
    - `user-stories-gaps` depends on `user-stories`
    - `platform-parity-review` depends on `user-stories-gaps`
    - `claude-md-optimization` depends on `git-workflow`, `user-stories-gaps`
    - `workflow-audit` depends on `claude-md-optimization`
    - `implementation-plan` depends on `workflow-audit`, `user-stories-gaps`
    - `implementation-plan-review` depends on `implementation-plan`
    - `beads` has no dependencies (but must run before any prompt that creates Beads tasks — enforced by convention in prompt content, not as a formal dependency, since Phase 1 prompts don't use Beads)
  - `$ARGUMENTS` is the only substitution variable. When a prompt is executed with arguments, `$ARGUMENTS` is replaced with the argument string. If no arguments are provided and the prompt contains `$ARGUMENTS`, the placeholder remains (the prompt is responsible for handling the empty case).

#### F-PS-2: Three-Tier Prompt Precedence

- **What**: When Scaffold resolves a prompt by name, it checks three locations in order: project-level (`.scaffold/prompts/<name>.md`), user-level (`~/.scaffold/prompts/<name>.md`), built-in (`commands/<name>.md` from the plugin directory).
- **Why**: Enables customization without forking. Project-level overrides apply to one project, user-level overrides apply to all projects for that user.
- **Priority**: Must-have (v1)
- **Business rules**:
  - First match wins. If `.scaffold/prompts/create-prd.md` exists, the built-in `commands/create-prd.md` is not used.
  - Scaffold logs which tier was used when executing a prompt: "Using project override for `create-prd`" or "Using built-in `create-prd`". This appears in the pipeline progress output, not as a separate message.
  - Custom prompts at any tier must follow the same format (Markdown with optional YAML frontmatter). If the frontmatter declares `depends-on`, those dependencies are used. If a custom prompt omits frontmatter, it inherits the dependency and phase information from the built-in prompt it's overriding (if one exists). A completely new prompt with no frontmatter has no dependencies and defaults to Phase 1.
  - Profile-level `prompt-overrides` take highest precedence, even above project-level `.scaffold/prompts/`. Precedence: profile override > project-level > user-level > built-in.

#### F-PS-3: Adding Custom Prompts

- **What**: Users can add prompts that don't exist in the built-in set. Custom prompts are placed in `.scaffold/prompts/` or `~/.scaffold/prompts/` and added to a profile via `add-prompts` or by declaring a `phase` in frontmatter.
- **Why**: Different project types need different prompts. A healthtech company needs compliance checks, a fintech company needs security audits, a design agency needs brand guidelines prompts.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Custom prompts are identified by filename (without `.md` extension). The name must be lowercase, use hyphens for spaces, and not conflict with built-in prompt names unless intentionally overriding.
  - Custom prompts appear in the pipeline at the position determined by their `phase` and `depends-on` declarations. Within a phase, custom prompts appear after built-in prompts with satisfied dependencies.
  - Custom prompts can depend on built-in prompts and vice versa (though built-in prompts will never depend on custom prompts — that would be done via profile configuration).

### Init and User Experience

#### F-UX-1: `scaffold init` Command

- **What**: A single entry-point command that handles profile selection, pipeline resolution, configuration creation, and optionally starts the first prompt.
- **Why**: Replaces the v1 experience of "read the docs, figure out which prompts to run, run them in order." One command handles everything.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Invoked as `/scaffold:init` or `/scaffold:init <idea>`.
  - If `<idea>` is provided, it's stored and passed as `$ARGUMENTS` to `create-prd`.
  - Creates `.scaffold/` directory with `config.json`.
  - If `.scaffold/config.json` already exists, warns and stops (unless `--force`).
  - After profile selection and pipeline display, asks user to confirm before starting the first prompt.
  - The `init` command itself is NOT a prompt in the pipeline — it's the orchestrator that sets up and launches the pipeline.

#### F-UX-2: `scaffold resume` Command

- **What**: Resumes an in-progress pipeline from where it left off.
- **Why**: Users stop and restart Claude Code sessions frequently. Resume picks up exactly where they left off.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Reads `.scaffold/config.json` to determine next uncompleted prompt.
  - Shows pipeline progress: "8/18 prompts complete."
  - Supports `--from <prompt-name>` to restart from a specific prompt.
  - If all prompts are complete, suggests next actions (enhancement, implementation).
  - If `.scaffold/config.json` doesn't exist, shows: "No pipeline found. Run `/scaffold:init` to start."

#### F-UX-3: Dry Run / Preview

- **What**: `/scaffold:init --dry-run` or `/scaffold:preview <profile-name>` resolves and displays the pipeline without executing anything or creating files.
- **Why**: Users want to see what they're committing to before starting. Useful for evaluating profiles and debugging custom configurations.
- **Priority**: Should-have (v1 if time)
- **Business rules**:
  - Shows the full resolved pipeline: prompt names, phases, dependencies, source tier (built-in/user/project), and expected output artifacts.
  - Shows any resolution errors (missing deps, circular refs) inline.
  - Does not create `.scaffold/` directory or any files.
  - Can be run outside a project directory to preview built-in profiles.

#### F-UX-4: Pipeline Progress Display

- **What**: Every time a prompt completes or the user runs `resume`, Scaffold shows a progress summary: completed/total prompts, current phase, and next prompt.
- **Why**: Keeps the user oriented in a multi-prompt pipeline. v1 relied on the skill auto-suggesting the next command, which was less informative.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Format:
    ```
    Pipeline: web-app (8/18 complete)
    Phase 3 — Development Environment
    ✓ create-prd
    ✓ prd-gap-analysis
    ✓ beads
    ✓ tech-stack
    ✓ claude-code-permissions
    ✓ coding-standards
    ✓ tdd
    ✓ project-structure
    → dev-env-setup (next)
      design-system
      git-workflow
      ...
    ```
  - The progress is displayed after each prompt completes and when `resume` is invoked.
  - Completed prompts show ✓, the next prompt shows →, pending prompts are indented.

### v1 Compatibility

#### F-V1-1: v1 Project Detection

- **What**: When `scaffold init` runs in a directory with v1 artifacts but no `.scaffold/` directory, Scaffold detects the v1 project and offers to create a v2 configuration based on existing artifacts.
- **Why**: Users with v1-scaffolded projects should be able to adopt v2 without re-running prompts that already produced correct outputs.
- **Priority**: Should-have (v1 if time)
- **Business rules**:
  - Detection is based on the presence of expected output artifacts, not on a version marker file.
  - Artifact-to-prompt mapping uses the `produces` field from prompt frontmatter. For each built-in prompt, if all artifacts in its `produces` list exist, the prompt is marked as complete.
  - Scaffold never modifies existing v1 artifacts during detection. It only creates the `.scaffold/` directory and `config.json`.
  - The user is shown what was detected and asked to confirm before the config is created.
  - After detection, the pipeline continues with uncompleted prompts — it does not re-run already-completed ones.

#### F-V1-2: v1 Migration Prompts

- **What**: The three existing migration prompts (Beads Migration, Workflow Migration, Permissions Migration) are preserved as standalone commands, not part of any profile's pipeline.
- **Why**: These are one-time migration tools for v1 projects, not part of the normal scaffolding flow.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Migration prompts remain as `/scaffold:beads-migration`, `/scaffold:workflow-migration`, `/scaffold:permissions-migration`.
  - They do not appear in any profile's prompt list.
  - They are not subject to dependency resolution — they run standalone.

### Standalone Commands

#### F-SC-1: Commands Outside the Pipeline

- **What**: Certain commands remain standalone and are not part of any profile's pipeline: `new-enhancement`, `single-agent-start`, `single-agent-resume`, `multi-agent-start`, `multi-agent-resume`, `prompt-pipeline`, `update`, `version`, and all migration commands.
- **Why**: These are used after the pipeline completes or for ongoing project work. They don't belong in the scaffolding sequence.
- **Priority**: Must-have (v1)
- **Business rules**:
  - Standalone commands are accessible at any time via `/scaffold:<command-name>`.
  - They do not appear in the pipeline preview or progress display.
  - They do not require `.scaffold/config.json` to exist (except `resume`, which does).
  - `prompt-pipeline` is updated to show the resolved pipeline from config.json if it exists, or the built-in pipeline reference if not.

## 5. Data Model Overview

### Profile

A profile defines which prompts to run for a project type.

- **name**: Unique identifier (lowercase, hyphenated). Built-in names: `web-app`, `cli-tool`, `mobile`, `api-service`, `minimal`.
- **extends**: Optional parent profile name. Inherits parent's prompt list and settings.
- **description**: Human-readable description shown during profile selection.
- **prompts**: Full ordered list of prompt names (only required if `extends` is not set).
- **add-prompts**: Prompts to add to the inherited list (only used with `extends`).
- **remove-prompts**: Prompts to remove from the inherited list (only used with `extends`).
- **prompt-overrides**: Map of prompt name → file path for prompt-level overrides.

Profiles live in:
- Built-in: Defined in Scaffold plugin code (not user-editable files).
- User-level: `~/.scaffold/profiles/<name>.json`
- Project-level: `.scaffold/profiles/<name>.json`

### Prompt

A prompt is a Markdown file that Claude Code executes as a command.

- **name**: Derived from filename (e.g., `create-prd` from `create-prd.md`).
- **description**: From YAML frontmatter.
- **depends-on**: Array of prompt names this prompt requires to have completed first.
- **phase**: Integer (1-7) for display grouping.
- **argument-hint**: Hint text for `$ARGUMENTS` (e.g., `"<idea or @files>"`).
- **produces**: Array of file paths this prompt is expected to create.
- **body**: Markdown content (the actual prompt text passed to Claude Code).

Prompts live in (precedence order):
1. Profile `prompt-overrides` (file path specified in profile)
2. `.scaffold/prompts/<name>.md` (project-level)
3. `~/.scaffold/prompts/<name>.md` (user-level)
4. `commands/<name>.md` (built-in from plugin)

### Pipeline Configuration

Stored in `.scaffold/config.json`, this is the runtime state of the pipeline for a project.

- **scaffold-version**: Scaffold version that created this config (e.g., `"2.0.0"`).
- **profile**: Name of the profile used (e.g., `"web-app"`).
- **created**: ISO 8601 timestamp of when `init` was run.
- **prompts**: Resolved ordered array of prompt names (the final pipeline after dependency resolution).
- **completed**: Array of `{ prompt: string, at: string }` entries recording when each prompt was completed.
- **extra-prompts**: Array of custom prompt names added outside the profile definition.
- **prompt-overrides**: Map of prompt name → file path for per-project prompt overrides.
- **custom-config**: Free-form object for user/profile-specific configuration.

### Pipeline Context

Stored in `.scaffold/context.json`, this is the shared key-value store that accumulates across prompt execution.

- **Structure**: Top-level keys are prompt namespaces (e.g., `"tech-stack"`, `"prd"`). Values are objects with arbitrary structure.
- **Lifecycle**: Created empty by `init`. Each prompt can read the full context and write to its own namespace.
- **Persistence**: Plain JSON file, committed to git along with other scaffold configuration.

### Relationships

```
Profile  ──(extends)──>  Profile (0..1 parent)
Profile  ──(contains)──> Prompt[] (ordered list)
Prompt   ──(depends-on)──> Prompt[] (0..N dependencies)
Pipeline Config ──(uses)──> Profile (exactly 1)
Pipeline Config ──(tracks)──> Prompt[] completion state
Pipeline Context ──(written by)──> Prompt[] (each writes its namespace)
```

## 6. External Integrations

### Claude Code Plugin System

- **What**: Scaffold v2 remains a Claude Code plugin, installable via `/plugin marketplace add scaffold`. Commands are exposed as `/scaffold:<command-name>`.
- **Integration details**: The plugin manifest (`.claude-plugin/plugin.json`) must be updated with the new version and description. New commands (`init`, `resume`, `preview`, `profile`) are added to the `commands/` directory. Existing commands remain for backward compatibility.
- **Requirements**: Claude Code plugin system must support commands with subcommand-style arguments (e.g., `/scaffold:init --dry-run`). If the plugin system doesn't support flags in arguments, the `--dry-run` flag is handled by parsing `$ARGUMENTS` within the prompt.

### Claude Code Skills System

- **What**: The auto-activated pipeline skill (`skills/scaffold-pipeline/SKILL.md`) is updated to reference the v2 pipeline resolution from `.scaffold/config.json` instead of the hardcoded v1 pipeline table.
- **Integration details**: The skill reads `.scaffold/config.json` to show the user's actual pipeline and progress. If the config doesn't exist, it falls back to showing available profiles and suggesting `/scaffold:init`.
- **Requirements**: Skill auto-activation triggers remain the same (keywords: scaffolding, pipeline, next command, etc.).

### Beads Task Tracking

- **What**: Scaffold v2 continues to integrate with Beads (`@beads/bd`) for task tracking. The `beads` prompt initializes Beads, and the implementation prompts create Beads tasks.
- **Integration details**: No changes to the Beads integration itself. Scaffold does not depend on Beads at the pipeline engine level — Beads is a tool used by individual prompts. If Beads is not installed when the `beads` prompt runs, that prompt handles the error.
- **Requirements**: Beads must be installed on the system (`npm install -g @beads/bd` or `brew install beads`). This is a prerequisite documented in Phase 0, not enforced by Scaffold.

### Git and GitHub

- **What**: Scaffold's git workflow prompts configure branch protection, CI, and PR workflows via `gh` CLI and git commands.
- **Integration details**: No changes to the git/GitHub integration. The `git-workflow` prompt handles all git configuration. Scaffold v2 doesn't add new git dependencies.
- **Requirements**: `git` and `gh` CLI must be installed and authenticated. This is a prerequisite for the `git-workflow` prompt, not for Scaffold itself.

### File System

- **What**: Scaffold v2 introduces the `.scaffold/` directory at the project root for configuration, context, custom prompts, and custom profiles. It also uses `~/.scaffold/` for user-level prompts and profiles.
- **Integration details**: `.scaffold/config.json` and `.scaffold/context.json` are committed to git (they're project state). `.scaffold/prompts/` and `.scaffold/profiles/` are committed to git (they're project customizations). `~/.scaffold/` is not committed — it's the user's personal configuration.
- **Requirements**: Write access to the project directory and `~/`.

## 7. Non-Functional Requirements

### Performance

- **Pipeline resolution**: Dependency graph resolution for up to 50 prompts must complete in under 1 second. The resolution is a topological sort on a small directed acyclic graph — this is computationally trivial.
- **Prompt loading**: Loading a prompt from any tier (project/user/built-in) must complete in under 100ms. This is a file read operation.
- **Config reads/writes**: Reading and writing `.scaffold/config.json` must complete in under 100ms. The file is small (under 10KB for any realistic pipeline).
- **No background processes**: Scaffold does not run background services, daemons, or watchers. All operations are synchronous and complete within the Claude Code command execution.

### Reliability

- **Crash recovery**: If a Claude Code session crashes mid-prompt, no data is lost. The prompt is simply not marked as complete. The user can `resume` and the prompt runs again.
- **Config integrity**: `.scaffold/config.json` is written atomically (write to temp file, rename). A partial write never corrupts the config.
- **Idempotent prompts**: Running a prompt twice should not produce corrupt state. Prompts are designed to overwrite their outputs cleanly (e.g., `create-prd` overwrites `docs/plan.md`, not appends to it).

### Compatibility

- **Claude Code version**: Scaffold v2 requires Claude Code with plugin support (the version that supports `/plugin marketplace add`). No specific minimum version is known at this time.
- **Operating systems**: macOS and Linux. Windows support via WSL is expected to work but not tested.
- **Node.js**: No Node.js dependency for Scaffold itself. Beads requires Node.js for `npm install -g @beads/bd`, but that's Beads' requirement, not Scaffold's.

### Maintainability

- **Prompt independence**: Each prompt is self-contained. Modifying one prompt does not require changes to the engine, other prompts, or the profile system.
- **Backward compatibility**: Scaffold v2 can work with v1-scaffolded projects (via detection). v2 config files are versioned (`scaffold-version` field) to enable future migrations.
- **Plugin size**: The plugin should remain small. All prompts, profiles, and engine logic fit in a single plugin with no external runtime dependencies.

### Security

- **No credential storage**: Scaffold does not store API keys, tokens, or credentials. Any secrets needed by prompts (e.g., `ANTHROPIC_API_KEY` for multi-model review) are managed by the user's environment.
- **No network access**: Scaffold's engine does not make network requests. Individual prompts may instruct Claude Code to fetch web content (e.g., competitive research), but that's Claude Code's behavior, not Scaffold's.
- **File permissions**: `.scaffold/` directory and contents have default file permissions (no elevated permissions needed).

## 8. Open Questions & Risks

### Open Questions

1. **How should `init` handle the `beads` prompt dependency?** Beads needs to be set up before any prompt that creates Beads tasks, but Phase 1 prompts (create-prd, prd-gap-analysis) don't use Beads and currently run before Beads setup. The current v1 approach (beads is prompt #3) works fine. In v2, beads has no formal `depends-on` because nothing in Phase 1 depends on it — the dependency is enforced by Phase ordering, not the graph. **Proposed resolution**: Keep beads as the first prompt in Phase 2 with no formal dependencies. Profiles ensure it appears before any prompt that uses Beads tasks. Document this as a "Phase dependency" vs. a "prompt dependency."

2. **Should the pipeline context (F-PE-3) be a v1 feature or deferred?** Context provides structured data sharing between prompts, but v1 prompts already work by reading files on disk. Context adds value for custom prompts that need programmatic access to earlier decisions. **Proposed resolution**: Ship as should-have. If time is limited, prompts work fine without it — they just read files directly as they do in v1.

3. **How should the `multi-model-review` prompt be handled?** It's optional in v1 and requires a ChatGPT Pro subscription. In v2, it's not included in any default profile. Should it be a standalone command or an opt-in profile addition? **Proposed resolution**: Keep it as a prompt that can be added to any profile via `add-prompts`. Not included in any built-in profile. Document it as an optional add-on.

4. **Should scaffold config files (`.scaffold/`) be committed to git?** Committing enables team sharing but adds files to the repo. **Proposed resolution**: Yes, commit `.scaffold/config.json`, `.scaffold/context.json`, `.scaffold/profiles/`, and `.scaffold/prompts/`. Add a comment in config.json explaining what it is. The `.scaffold/` directory is project configuration, like `.github/` or `.vscode/`.

### Risks

1. **Risk: Prompt content drift during v2 engine work.** Building the v2 engine (profiles, dependency resolution, config management) is a significant amount of work. If prompt content is also being improved in parallel (by v1 users or contributors), merge conflicts and content drift could occur.
   - **Mitigation**: Freeze prompt content changes during v2 engine development. Focus v2 work on the engine, and port existing prompts as-is with only frontmatter additions.

2. **Risk: Custom prompt quality.** Users writing custom prompts may not follow the quality standards of built-in prompts (specificity, no ambiguity, concrete examples). Poor custom prompts produce poor scaffolding outputs.
   - **Mitigation**: Provide a prompt authoring guide (`.scaffold/prompts/README.md` or a docs page) with examples and quality checklist. The engine does not enforce quality — that's a documentation concern.

3. **Risk: Profile proliferation.** Teams may create too many profiles with slight variations, making it hard to know which one to use.
   - **Mitigation**: Documentation recommends keeping profiles to 3-5 per team. Profile descriptions are shown during `init` selection — good descriptions help users choose.

4. **Risk: Complexity for first-time users.** v2 adds concepts (profiles, tiers, dependencies, context) that didn't exist in v1. First-time users may feel overwhelmed.
   - **Mitigation**: The default experience (`/scaffold:init`) is simpler than v1: choose a profile, confirm, and go. Advanced features (custom profiles, prompt overrides, context) are opt-in and not visible until needed.

## 9. Out of Scope

The following are explicitly NOT part of Scaffold v2:

- **Automatic prompt execution without confirmation**: Every prompt requires user confirmation before running. There is no "run all prompts unattended" mode. Prompts are interactive and require user input (especially create-prd and tech-stack).

- **Prompt versioning or rollback**: If a user overrides a prompt and wants to revert, they delete their override file. There's no version history for prompt content within Scaffold.

- **Remote profile registry**: Profiles are shared via git (commit `.scaffold/profiles/`). There is no central registry or marketplace for profiles.

- **GUI or web interface**: Scaffold is CLI-only, operating within Claude Code sessions.

- **Non-Claude Code environments**: Scaffold prompts are designed for Claude Code's tool-using capabilities (AskUserQuestion, Read, Write, Bash, etc.). They won't work in other AI assistants without modification.

- **Runtime prompt generation**: Prompts are static Markdown files. Scaffold does not dynamically generate prompt content based on project state (though prompts themselves can read project state and adapt their behavior).

- **Prompt marketplace**: No mechanism for discovering or installing third-party prompts. Users manually create prompt files.

- **Parallel prompt execution**: Prompts run sequentially. The implementation phase uses parallel agents for tasks, but the pipeline setup is sequential.

- **Breaking changes to prompt content**: v2 focuses on the engine/orchestration layer. Prompt content is preserved from v1 with only frontmatter additions. Content improvements are a separate effort.

- **Removing Beads dependency**: Scaffold v2 continues to use Beads for task tracking. Replacing Beads with an alternative task system is out of scope.

## 10. Success Metrics

### Adoption

- **v1-to-v2 migration rate**: 80%+ of active v1 users migrate to v2 within 3 months of release. Measured by v2 plugin installs relative to active v1 installs.
- **New user onboarding**: First-time users complete `scaffold init` and execute at least 3 pipeline prompts in their first session. Success indicates the init flow is not a barrier.

### Efficiency

- **Time to first implementation task**: Time from running `/scaffold:init` to the first `bd ready` output (pipeline complete, tasks created). Target: under 60 minutes for the `minimal` profile, under 120 minutes for `web-app`. Measured by timestamp difference between `init` and `implementation-plan` completion in config.json.
- **Prompt skip rate**: Percentage of prompts skipped via profile selection vs. v1's manual skipping. Target: zero manual prompt skipping needed when using a built-in profile (profiles should include exactly the right prompts).

### Customization Usage

- **Custom prompt adoption**: 20%+ of v2 projects use at least one custom prompt or prompt override within 6 months. Measured by presence of `.scaffold/prompts/` files.
- **Custom profile adoption**: 10%+ of v2 projects use a custom profile (not a built-in) within 6 months. Measured by profile name in config.json not matching a built-in name.

### Quality

- **Pipeline completion rate**: 70%+ of started pipelines reach completion (all prompts run). Measured by config.json completed array length vs. prompts array length. The 30% margin accounts for legitimate abandonment (user pivots, project cancelled).
- **Resume usage**: 50%+ of pipelines that span multiple sessions use `/scaffold:resume` at least once. Indicates the resume feature is discoverable and working.

### Satisfaction

- **No regression in prompt quality**: Output artifacts (docs/plan.md, docs/tech-stack.md, etc.) maintain the same quality as v1. Verified by user feedback — if users report that v2 outputs are worse than v1, the prompt content was inadvertently degraded.
- **Reduced support questions**: Fewer "which prompt do I run next?" and "do I need this prompt for my project type?" questions compared to v1. Profiles and auto-ordering should eliminate these.
