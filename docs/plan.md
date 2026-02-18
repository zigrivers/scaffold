# Scaffold v2 — Product Requirements Document

## 1. Product Overview

Scaffold v2 is a modular, profile-based prompt pipeline for scaffolding new software projects with Claude Code. It replaces the rigid 25-prompt linear sequence of v1 with a dependency-graph engine that lets users select a **profile** (e.g., `web-app`, `cli-tool`, `mobile`, `api-service`, `minimal`) and automatically resolves which prompts to run, in what order, based on declared dependencies. Users can override any built-in prompt, add custom prompts, and create their own profiles — all while preserving the high-quality prompt content that makes v1 effective.

Scaffold v2 is for solo developers and small teams who use Claude Code as their primary development tool and want to go from a raw product idea to a fully documented, task-tracked, CI-configured project in under an hour — without running prompts that don't apply to their project type.

**Terminology**: A **prompt** is a pipeline step Claude executes to produce artifacts (e.g., `create-prd` produces `docs/plan.md`). A **command** is a user-invokable action (`/scaffold:<name>`). All prompts are commands, but orchestration commands (`init`, `resume`, `skip`, `validate`, `reset`, `status`, `next`) are not prompts — they manage the pipeline rather than produce project artifacts.

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
3. *(Conditional — only if F-UX-10 Brownfield Mode is implemented.)* If the directory has existing code artifacts (see F-UX-10 detection criteria) and `--brownfield` was not explicitly passed, Scaffold asks: "This directory has existing code. Would you like to scaffold around it (brownfield) or start fresh (greenfield)?" If the user chooses brownfield, `mode` is set to `"brownfield"` in config.json and prompts that support brownfield mode adapt their behavior (see F-UX-10). If F-UX-10 is not implemented, this step is skipped and `mode` defaults to `"greenfield"`.
4. If the user provided `<idea>` text, Scaffold analyzes it and recommends a profile (see F-UX-7). Profile selection uses a **two-question flow** to stay within AskUserQuestion's 2-4 option limit:
   - **Question 1** — "What type of project?" Options: **Web App**, **Mobile**, **Backend (CLI/API)**, **Other**
   - **Question 2** — Based on the answer:
     - Web App → confirms `web-app` profile or offers `Custom`
     - Mobile → confirms `mobile` profile or offers `Custom`
     - Backend → "Which backend type?" Options: **CLI Tool**, **API Service**, **Minimal**, **Custom**
     - Other → "Which profile?" Options: **Minimal**, **Custom**
   - The recommended profile (from F-UX-7 analysis) appears first with "(Recommended)" in the relevant question.
5. If user selects "Custom," Scaffold walks through prompt selection one phase at a time using `AskUserQuestion` with `multiSelect: true`. Phases with more than 4 prompts are split across multiple questions (groups of ≤4), with each question showing its phase context (e.g., "Phase 2 — Project Foundation (1/2)"). No back-navigation is supported — the user can re-run `init` to change selections. After all phases, Scaffold resolves dependencies — if the user selected "Coding Standards" but not "Tech Stack," Scaffold auto-includes "Tech Stack" and shows: "Auto-included `tech-stack` (required by `coding-standards`)."
6. Scaffold creates `.scaffold/config.json` with the selected profile and resolved prompt list.
7. Scaffold displays the resolved pipeline: a numbered list of prompts that will run, with dependencies visualized. Example:
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
8. Scaffold asks: "Ready to start? The first prompt is `create-prd`." User confirms.
9. Scaffold begins executing the first prompt (`create-prd`). If the user provided `<idea>` in step 1, it's passed as the argument.

**Error/edge cases:**

- **No profile matches**: If the user selects "Custom" but selects zero prompts, Scaffold shows: "At least one prompt must be selected. The minimal viable pipeline is: `create-prd` → `tech-stack` → `implementation-plan`."
- **Dependency conflicts in custom selection**: If the user deselects a prompt that other selected prompts depend on, Scaffold shows the conflict: "`coding-standards` requires `tech-stack`. Include `tech-stack`?" and auto-resolves by adding the dependency.
- **Directory not empty but no scaffold config**: Scaffold proceeds normally — the user may be adding Scaffold to an existing project.
- **User cancels during profile selection**: Pipeline is not created. No files written.
- **`--force` reinitialize**: When `--force` is used on an existing project, Scaffold deletes `.scaffold/config.json` and `.scaffold/context.json` (pipeline state) but preserves `.scaffold/prompts/` and `.scaffold/profiles/` (user customizations). The user is shown what will be reset: "Resetting pipeline state. Custom prompts and profiles will be preserved. Proceed?"

### Flow 2: Resume an In-Progress Pipeline

**Happy path:**

1. User opens a Claude Code session in a project that has `.scaffold/config.json`.
2. User runs `/scaffold:resume` (or the pipeline skill auto-detects and suggests it).
3. Scaffold reads `.scaffold/config.json`, determines which prompts have been completed (each prompt records completion in the config), and identifies the next prompt.
4. Scaffold displays: "Pipeline progress: 8/18 prompts complete. Next: `dev-env-setup`. Run it now?"
5. User confirms. Scaffold executes the next prompt.

**Error/edge cases:**

- **All prompts complete**: Scaffold shows: "Pipeline complete. Run `/scaffold:new-enhancement` to add features, or `/scaffold:single-agent-start` to begin implementation."
- **Config file corrupted or missing completion data**: Scaffold re-scans project artifacts (checks for `docs/plan.md`, `docs/tech-stack.md`, etc.) and infers which prompts have been completed based on their `produces` artifacts. Updates the config accordingly.
- **User manually edited config.json between sessions**: Scaffold validates config.json on load. If the `prompts` array was modified (prompts added/removed), Scaffold re-resolves dependencies for the updated list and reports any errors. If `extra-prompts` references a prompt that doesn't exist at any tier, Scaffold reports: "Extra prompt `X` not found at .scaffold/prompts/X.md, ~/.scaffold/prompts/X.md, or built-in commands/X.md. Remove it from extra-prompts or create the prompt file."
- **User wants to re-run a completed prompt**: `/scaffold:resume --from <prompt-name>` re-runs the specified prompt only (not all downstream prompts). Scaffold warns: "This will re-run `coding-standards` and may overwrite `docs/coding-standards.md`. Proceed?" After that prompt completes, `/scaffold:resume` picks up the next uncompleted prompt in the normal pipeline order. Downstream prompts are not invalidated or re-run unless the user explicitly `--from`s each one — the assumption is that re-running one prompt produces compatible outputs for what came after.

### Flow 3: Customize a Prompt

**Happy path:**

1. User wants to modify the `create-prd` prompt to include additional sections specific to their domain (e.g., regulatory compliance for healthtech).
2. User creates `.scaffold/prompts/create-prd.md` with their custom version. The file follows the same format as the built-in prompt (markdown with optional YAML frontmatter).
3. Next time the pipeline runs `create-prd`, Scaffold uses the project-level override instead of the built-in version. Scaffold shows: "Using project override for `create-prd` (.scaffold/prompts/create-prd.md)."

**Precedence (highest to lowest):**

1. **Profile override** (explicit path in profile's `prompt-overrides`) — Per-pipeline customization
2. **Project-level** (`.scaffold/prompts/<name>.md`) — Specific to this project
3. **User-level** (`~/.scaffold/prompts/<name>.md`) — Shared across all your projects
4. **Built-in** (`commands/<name>.md` from the plugin) — Default Scaffold prompts

**Adding a custom prompt (not overriding):**

1. User creates `.scaffold/prompts/security-audit.md` with YAML frontmatter declaring dependencies:
   ```yaml
   ---
   description: "Run security audit against OWASP top 10"
   depends-on: [coding-standards, tdd]
   phase: 6
   ---
   ```
2. User adds the prompt to their profile via `add-prompts` in the profile JSON, or adds it to `extra-prompts` in `.scaffold/config.json`. Simply placing a file in `.scaffold/prompts/` does NOT auto-include it in the pipeline — it must be explicitly referenced by a profile or config. The `phase` field in frontmatter controls display positioning within the pipeline, not inclusion.
3. When the pipeline reaches Phase 6, Scaffold includes `security-audit` after its dependencies are satisfied.

**Error/edge cases:**

- **Custom prompt has invalid frontmatter**: Scaffold shows a clear error: "`.scaffold/prompts/security-audit.md` has invalid frontmatter: `depends-on` must be an array of prompt names. Valid names: [list]."
- **Circular dependency**: Scaffold detects the cycle during pipeline resolution and reports: "Circular dependency detected: `security-audit` → `compliance-check` → `security-audit`. Remove one dependency to proceed."
- **Custom prompt overrides a built-in but removes required sections**: Scaffold does not validate prompt content — it trusts the user. The override is used as-is. This is intentional: users own their customizations.

### Flow 4: Create and Share a Custom Profile

**Happy path:**

1. User creates `.scaffold/profiles/healthtech-api.json` manually (there is no `profile create` command — profiles are JSON files with a documented schema):
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
2. The profile extends `api-service` (inherits its prompt list and settings), adds two custom prompts, and overrides `create-prd` with a domain-specific version.
3. When another team member runs `/scaffold:init` in a project containing this profile, it appears as an option alongside the built-in profiles.

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
4. Scaffold infers the best-matching built-in profile based on which optional prompts' artifacts are present (e.g., if `docs/design-system.md` exists but no Maestro config, it's likely `web-app`). If the match is ambiguous, Scaffold presents the candidates via `AskUserQuestion` and lets the user choose.
5. Scaffold creates `.scaffold/config.json` with the inferred profile and completion state, and suggests: "Detected 14/18 prompts already completed (profile: web-app). Next uncompleted: `claude-md-optimization`. Run `/scaffold:resume` to continue."

**Error/edge cases:**

- **Partial v1 project**: Some artifacts exist, others don't. Scaffold only marks prompts as complete where the expected output artifact exists. It doesn't assume sequential completion — if `docs/tech-stack.md` exists but `docs/coding-standards.md` doesn't, only `tech-stack` is marked complete.
- **User declines v1 detection**: Scaffold proceeds with a fresh `init`, creating `.scaffold/config.json` without marking anything complete.

## 4. Feature Requirements

### Pipeline Engine

#### F-PE-1: Dependency Graph Resolution

- **What**: Prompts declare their dependencies via `depends-on` in frontmatter. The engine performs topological sort to determine execution order. Within a phase, prompts with satisfied dependencies can run in any order (the engine presents them in the order defined by the profile).
- **Why**: Replaces the brittle hardcoded ordering of v1. Allows custom prompts to be inserted anywhere in the pipeline without manual ordering.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Circular dependencies are detected at pipeline resolution time (before any prompt executes) and reported as errors with the full cycle path.
  - If a prompt declares a dependency that doesn't exist in the current profile's prompt list, it's a resolution error: "Prompt `X` depends on `Y`, but `Y` is not in this pipeline. Add `Y` to the profile or remove the dependency."
  - Dependencies are always on prompt names (strings), not on artifact files. This keeps the graph simple and inspectable.
  - If `extra-prompts` or `add-prompts` references a prompt name that doesn't exist at any tier (no file found at project, user, or built-in level), it's a resolution error: "Prompt `X` referenced in extra-prompts but not found at .scaffold/prompts/X.md, ~/.scaffold/prompts/X.md, or built-in commands/X.md."
  - **Topological sort algorithm**: The `init` command uses Kahn's algorithm to resolve prompt ordering:
    1. Build adjacency list and in-degree count from all `depends-on` declarations.
    2. Initialize a queue with all prompts that have in-degree 0 (no dependencies).
    3. While the queue is non-empty: dequeue a prompt, add it to the sorted list, decrement in-degree for all prompts that depend on it. If any reach 0, enqueue them (using profile-defined order as tiebreaker).
    4. If the sorted list length ≠ total prompt count, a cycle exists — report it.
    5. **Verification step**: After sorting, verify every prompt appears after all its dependencies in the final list. If verification fails, report the specific out-of-order pair.
  - Resolution happens once at `init` time and is cached in `.scaffold/config.json`. It's re-resolved when the profile or prompt list changes.

#### F-PE-2: Pipeline State Tracking

- **What**: `.scaffold/config.json` records which prompts have been completed, which are pending, and pipeline metadata (profile used, timestamps, scaffold version). Each prompt's completion is recorded when the prompt finishes executing (not when its output artifact exists).
- **Why**: Enables `resume`, `preview`, progress display, and v1 detection.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Completion is recorded by adding the prompt name to the `completed` array in config.json with a timestamp.
  - **Completion detection strategy**: Scaffold uses a two-mechanism approach:
    - **Primary (artifact-based)**: The `resume` command checks whether a prompt's `produces` artifacts exist on disk. If all files in the `produces` list exist, the prompt is considered complete. This is the same mechanism used for v1 detection and provides resilience against session crashes.
    - **Secondary (orchestrator-recorded)**: The `resume` command records completion of the most recently executed prompt by adding it to the `completed` array in config.json with a timestamp. This shifts responsibility from N individual prompts self-reporting to 1 orchestrator (`resume`) recording. Each prompt's "After This Step" section serves as a **fallback** instruction (not the primary mechanism) using canonical boilerplate: `"Add this prompt to the 'completed' array in .scaffold/config.json with the current timestamp if the resume command has not already done so."` This handles cases where the user runs prompts manually without `resume`.
    - When both mechanisms disagree (artifact exists but not in `completed` array), the artifact takes precedence — the prompt ran successfully even if the config wasn't updated (likely a session crash after the prompt finished but before the config write).
    - When `completed` says done but artifacts are missing, `resume` warns: "Prompt `X` was marked complete but its output `Y` is missing. Re-run with `/scaffold:resume --from X`?"
  - If a completed prompt is re-run (via `--from`), its previous completion entry is replaced with the new timestamp.
  - Config format:
    ```json
    {
      "scaffold-version": "2.0.0",
      "profile": "web-app",
      "mode": "greenfield",
      "created": "2026-02-15T10:30:00Z",
      "prompts": ["create-prd", "prd-gap-analysis", "beads", "..."],
      "completed": [
        { "prompt": "create-prd", "at": "2026-02-15T10:35:00Z" },
        { "prompt": "prd-gap-analysis", "at": "2026-02-15T10:42:00Z" }
      ],
      "skipped": [],
      "extra-prompts": [],
      "resolved-overrides": {},
      "custom-config": {}
    }
    ```

#### F-PE-3: Pipeline Context

- **What**: A shared context object (`.scaffold/context.json`) accumulates data across prompts. Each prompt can read the context and write new entries. Context is key-value pairs with namespaced keys (e.g., `tech-stack.language`, `prd.personas`).
- **Why**: Enables prompts to reference outputs from earlier prompts programmatically. In v1, prompts read files on disk — context provides a structured supplement (not a replacement for file reads).
- **Priority**: Should-have (v2.0 if time)
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
  - **If deferred**: If F-PE-3 is not implemented in v2.0, all references to `context.json` are removed: `init` does not create it, `reset` does not delete it, and brownfield detection uses the `config.json` `mode` field (not context). Prompts that would have read context instead read their predecessor's output files directly (same as v1 behavior).

#### F-PE-4: Prompt Execution

- **What**: When a prompt is executed, Scaffold loads the prompt content (resolved via the 3-tier precedence), substitutes `$ARGUMENTS` if present, and presents it to Claude Code as a command. The prompt runs within the current Claude Code session.
- **Why**: Prompts are Claude Code commands — they must execute in the user's session where Claude has access to tools, files, and conversation context.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Prompts execute one at a time, sequentially. There is no automatic parallel prompt execution (agents parallelize during implementation, not during pipeline setup).
  - **Pre-execution preview (should-have)**: Before a prompt runs, Scaffold shows which files will be created or modified based on the prompt's `produces` field and existing files on disk. For each file in `produces`: show "Create" if the file doesn't exist, "Update" if it does. Format: "This prompt will: Create `docs/tech-stack.md`, Update `CLAUDE.md`. Proceed?" This is informational — actual file changes depend on Claude's execution. The preview is based on `produces` metadata, not actual prompt behavior. The user confirms before execution proceeds.
  - After a prompt completes, Scaffold records completion in config.json and displays: "Prompt `X` complete. Next: `Y`. Run it now?" The user must confirm before the next prompt runs.
  - If a prompt fails (user aborts, Claude errors out), it is NOT marked complete. The user can retry with `/scaffold:resume`.
  - **Completion detection**: Prompt completion is determined by F-PE-2's dual mechanism (artifact-based + self-report). Prompts have no exit status. Partial completion is indistinguishable from no completion — the artifact check and self-report are the best available signals.
  - Scaffold does not modify prompt content beyond `$ARGUMENTS` substitution. Prompts are responsible for their own behavior.

#### F-PE-5: Predecessor Artifact Verification (Step Gating)

- **What**: Before a prompt executes, Scaffold verifies that all predecessor prompts' `produces` artifacts exist on disk. If any are missing, warns the user with options to proceed anyway or run the missing prompt first.
- **Why**: Prevents prompts from running against incomplete inputs, which produces lower-quality outputs. This is a safety net — not a hard gate — because users may have valid reasons to proceed (e.g., they produced the artifact manually).
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Verification uses the `produces` field from predecessor prompts' frontmatter. For each direct dependency of the about-to-run prompt, check that all files in the dependency's `produces` list exist.
  - If a predecessor was skipped (present in the `skipped` array in config.json), its artifacts are not required — the skip was intentional.
  - Warning format when artifacts are missing:
    ```
    Prompt `coding-standards` expects `docs/tech-stack.md` (from `tech-stack`), but it's missing.
    [Run tech-stack first / Proceed anyway / Cancel]
    ```
  - "Run tech-stack first" executes the missing prompt, then returns to the original prompt.
  - "Proceed anyway" continues execution — the prompt handles missing inputs as best it can.
  - "Cancel" aborts without state change.
  - Verification runs before `$ARGUMENTS` substitution and prompt loading — it's a pre-flight check.

#### F-PE-6: Decision Log

- **What**: A simple append-only JSON log (`.scaffold/decisions.json`) that persists key decisions across sessions. Each prompt can record decisions. Agents in future sessions read the log for context continuity.
- **Why**: Decisions made during `tech-stack` (e.g., "Chose Vitest over Jest for speed") are lost when the session ends. The decision log preserves cross-session context without requiring the full pipeline context (F-PE-3).
- **Priority**: Should-have (v2.0 if time)
- **Business rules**:
  - Format: `[{ "prompt": "tech-stack", "decision": "Chose Vitest over Jest for speed", "at": "2026-02-15T10:40:00Z" }]`
  - Append-only — entries are never modified or deleted.
  - Created by `init` as an empty array (`[]`).
  - Each prompt optionally records 1-3 key decisions after execution.
  - Read by subsequent prompts for context (e.g., `coding-standards` reads decisions from `tech-stack`).
  - Committed to git alongside other `.scaffold/` files.
  - `reset` deletes `.scaffold/decisions.json` along with config.json and context.json.

### Profiles

#### F-PR-1: Built-in Profiles

- **What**: Four built-in profiles ship with Scaffold v2, each defining a curated list of prompts optimized for that project type.
- **Why**: Most projects fit one of a few categories. Profiles eliminate the need to manually select prompts for common cases.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - **web-app**: All prompts from v1 pipeline except Maestro and Platform Parity Review. Includes: create-prd, prd-gap-analysis, beads, tech-stack, claude-code-permissions, coding-standards, tdd, project-structure, dev-env-setup, design-system, git-workflow, add-playwright, user-stories, user-stories-gaps, claude-md-optimization, workflow-audit, implementation-plan, implementation-plan-review. (18 prompts)
  - **cli-tool**: Focused set for CLI tools / libraries. Includes: create-prd, prd-gap-analysis, beads, tech-stack, claude-code-permissions, coding-standards, tdd, project-structure, dev-env-setup, git-workflow, user-stories, user-stories-gaps, claude-md-optimization, workflow-audit, implementation-plan, implementation-plan-review. Excludes: design-system, add-playwright, add-maestro, multi-model-review, platform-parity-review. (16 prompts)
  - **mobile**: For React Native / Expo apps. Includes: create-prd, prd-gap-analysis, beads, tech-stack, claude-code-permissions, coding-standards, tdd, project-structure, dev-env-setup, design-system, git-workflow, add-maestro, user-stories, user-stories-gaps, claude-md-optimization, workflow-audit, implementation-plan, implementation-plan-review. (18 prompts)
  - **api-service**: Backend API / microservice. Includes: create-prd, prd-gap-analysis, beads, tech-stack, claude-code-permissions, coding-standards, tdd, project-structure, dev-env-setup, git-workflow, user-stories, user-stories-gaps, claude-md-optimization, workflow-audit, implementation-plan, implementation-plan-review. Excludes: design-system, add-playwright, add-maestro, multi-model-review, platform-parity-review. (16 prompts — same prompt list as `cli-tool`. Differentiation comes from PRD content and profile name, which aids UX clarity, smart profile suggestion, and future profile-specific behavior.)
  - **minimal**: Fastest path to implementation. Includes: create-prd, beads, tech-stack, coding-standards, tdd, project-structure, dev-env-setup, git-workflow, user-stories, implementation-plan. Excludes: prd-gap-analysis, claude-code-permissions, design-system, add-playwright, add-maestro, multi-model-review, user-stories-gaps, platform-parity-review, claude-md-optimization, workflow-audit, implementation-plan-review. (10 prompts)
  - Built-in profiles are read-only. Users cannot modify them directly but can extend them via custom profiles.

#### F-PR-2: Custom Profiles

- **What**: Users can create profiles in `.scaffold/profiles/` (project-level) or `~/.scaffold/profiles/` (user-level) that define a custom prompt list, optionally extending a built-in or other custom profile.
- **Why**: Teams and power users need to standardize on a custom pipeline configuration without forking Scaffold.
- **Priority**: Must-have (v2.0)
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
  - Array order in `prompts` and `add-prompts` is preserved as a tiebreaker when the dependency graph allows multiple valid orderings. Within a phase, prompts appear in profile-defined order after dependency constraints are satisfied.
  - `prompt-overrides` maps prompt names to file paths. Paths resolve relative to the project root, regardless of profile file location. These take precedence over the 3-tier lookup for the specified prompts.
  - Custom profiles appear in the profile selection during `scaffold init` alongside built-in profiles.
  - Profiles at the project level (`.scaffold/profiles/`) take precedence over user-level (`~/.scaffold/profiles/`) profiles with the same name.

#### F-PR-3: Profile Inheritance

- **What**: A profile can extend another profile, inheriting its prompt list and settings, then adding/removing prompts and overriding prompt files.
- **Why**: Avoids duplication. A team can create `web-app-plus-security` that extends `web-app` and adds security prompts, without re-listing all 18 web-app prompts.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Inheritance depth is limited to 3 levels. Deeper chains are rejected at resolution time.
  - Resolution order: start with the base profile's prompts → apply `add-prompts` → apply `remove-prompts` → apply `prompt-overrides`. Each level in the chain applies its modifications in this order.
  - If a child profile removes a prompt that a grandchild profile's added prompt depends on, the dependency conflict is surfaced at resolution time, not silently ignored.
  - Circular inheritance (A extends B extends A) is detected and rejected.

### Prompt System

#### F-PS-1: Prompt Format

- **What**: Prompts are Markdown files with optional YAML frontmatter. Frontmatter can declare: `description`, `depends-on`, `phase`, `argument-hint`, `produces` (list of output artifact paths), and `reads` (list of input file paths).
- **Why**: Consistent format enables the engine to resolve dependencies and display pipeline previews. Markdown body is the prompt content passed to Claude Code.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Frontmatter fields:
    - `description` (string, required): Short description shown in pipeline preview and help.
    - `depends-on` (array of strings, optional): Prompt names this prompt depends on. Defaults to empty (no dependencies).
    - `phase` (integer, optional): Phase number (1-7) for display grouping. Defaults to the phase of the last dependency, or 1 if no dependencies.
    - `argument-hint` (string, optional): Hint for `$ARGUMENTS` substitution, shown in help (e.g., `"<idea or @files>"`).
    - `produces` (array of strings, required for built-in prompts, optional for custom): Expected output file paths (e.g., `["docs/plan.md"]`). Used by completion detection and v1 project detection to infer which prompts have run. Not enforced at runtime — prompts may produce additional outputs beyond what's listed. Custom prompts that omit `produces` can still be tracked via the self-report mechanism (config.json `completed` array) but won't benefit from artifact-based completion detection.
    - `reads` (array of strings, optional): File paths this prompt needs as input (e.g., `["docs/plan.md"]`). Used by the auto-activated skill to pre-load predecessor documents into context before the prompt runs. If a file doesn't exist, it's skipped silently. This supplements, not replaces, prompts' own file-reading instructions.
  - All existing v1 prompts will have frontmatter added/updated to declare `depends-on` and `produces`. The dependency graph is derived from the existing "Key Dependencies Between Prompts" section in prompts.md:
    - `prd-gap-analysis` depends on `create-prd`
    - `tech-stack` depends on `create-prd`, `beads`
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
    - `beads` has no dependencies. `tech-stack` formally depends on `beads` (beads creates/updates CLAUDE.md, which tech-stack and downstream prompts reference). This replaces the v1 convention of "beads is prompt #3" with an explicit graph edge.
  - `$ARGUMENTS` is the only substitution variable. When a prompt is executed with arguments, `$ARGUMENTS` is replaced with the argument string. If no arguments are provided, `$ARGUMENTS` is replaced with an empty string. Prompts handle the empty case by asking the user for input (e.g., `create-prd` without an idea asks the user to describe their project).

#### F-PS-2: Prompt Precedence

- **What**: When Scaffold resolves a prompt by name, it checks up to four locations in order: (1) profile-level `prompt-overrides` (explicit path), (2) project-level (`.scaffold/prompts/<name>.md`), (3) user-level (`~/.scaffold/prompts/<name>.md`), (4) built-in (`commands/<name>.md` from the plugin directory). The first match wins.
- **Why**: Enables customization without forking. Profile overrides allow per-pipeline customization, project-level overrides apply to one project, user-level overrides apply to all projects for that user.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - **Resolution order** (first match wins):
    1. Profile `prompt-overrides` — if the active profile maps this prompt name to a file path, use that file. If the file at that path doesn't exist, it's a resolution error: "Profile `X` overrides prompt `Y` with path `Z`, but `Z` does not exist."
    2. `.scaffold/prompts/<name>.md` — project-level override
    3. `~/.scaffold/prompts/<name>.md` — user-level override
    4. `commands/<name>.md` — built-in from plugin
  - Scaffold logs which source was used when executing a prompt: "Using project override for `create-prd`" or "Using built-in `create-prd`". This appears in the pipeline progress output, not as a separate message.
  - Custom prompts at any tier must follow the same format (Markdown with optional YAML frontmatter). If the frontmatter declares `depends-on`, those dependencies are used. If a custom prompt omits frontmatter, it inherits the dependency and phase information from the built-in prompt it's overriding (if one exists). A completely new prompt with no frontmatter has no dependencies and defaults to Phase 1.

#### F-PS-3: Adding Custom Prompts

- **What**: Users can add prompts that don't exist in the built-in set. Custom prompts are placed in `.scaffold/prompts/` or `~/.scaffold/prompts/` and added to a profile via `add-prompts` or by declaring a `phase` in frontmatter.
- **Why**: Different project types need different prompts. A healthtech company needs compliance checks, a fintech company needs security audits, a design agency needs brand guidelines prompts.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Custom prompts are identified by filename (without `.md` extension). The name must be lowercase, use hyphens for spaces, and not conflict with built-in prompt names unless intentionally overriding.
  - Custom prompts appear in the pipeline at the position determined by their `phase` and `depends-on` declarations. Within a phase, custom prompts appear after built-in prompts with satisfied dependencies.
  - Custom prompts can declare dependencies on built-in prompts (e.g., a custom `security-audit` can depend on built-in `coding-standards`). Built-in prompts never depend on custom prompts — they ship independently. If a profile needs a built-in prompt to run after a custom prompt, use the profile's `add-prompts` ordering or add a wrapper prompt.

### Init and User Experience

#### UX Constraints

Claude Code's `AskUserQuestion` tool imposes design constraints that shape all interactive UX:

- Each question supports **2-4 options** (plus an automatic "Other" free-text option).
- `multiSelect: true` allows selecting multiple options from the same 2-4 limit.
- Any interrupted `AskUserQuestion` interaction results in **no state change** — the pipeline state is only updated after a complete, confirmed response.
- When a selection has more than 4 items, it must be split across multiple sequential questions with context carried forward.

These constraints are reflected throughout the init flow, profile selection, custom prompt selection, and skip/resume interactions.

#### F-UX-1: `scaffold init` Command

- **What**: A single entry-point command that handles profile selection, pipeline resolution, configuration creation, and optionally starts the first prompt.
- **Why**: Replaces the v1 experience of "read the docs, figure out which prompts to run, run them in order." One command handles everything.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Invoked as `/scaffold:init` or `/scaffold:init <idea>`.
  - If `<idea>` is provided, it's stored and passed as `$ARGUMENTS` to `create-prd`.
  - Creates `.scaffold/` directory with `config.json`.
  - If `.scaffold/config.json` already exists, warns and stops (unless `--force`).
  - After profile selection and pipeline display, asks user to confirm before starting the first prompt.
  - The `init` command itself is NOT a prompt in the pipeline — it's the orchestrator that sets up and launches the pipeline.
  - **Profile discovery**: Profiles are discovered in order: built-in → project-level (`.scaffold/profiles/`) → user-level (`~/.scaffold/profiles/`). Project-level takes precedence over user-level for profiles with the same name. In the selection UI, built-in profiles are shown first, then custom profiles alphabetically.

#### F-UX-2: `scaffold resume` Command

- **What**: Resumes an in-progress pipeline from where it left off.
- **Why**: Users stop and restart Claude Code sessions frequently. Resume picks up exactly where they left off.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Reads `.scaffold/config.json` to determine next uncompleted prompt.
  - Shows pipeline progress: "8/18 prompts complete."
  - Supports `--from <prompt-name>` to restart from a specific prompt.
  - If all prompts are complete, suggests next actions (enhancement, implementation).
  - If `.scaffold/config.json` doesn't exist, shows: "No pipeline found. Run `/scaffold:init` to start."

#### F-UX-3: Dry Run / Preview

- **What**: `/scaffold:init --dry-run` or `/scaffold:preview <profile-name>` resolves and displays the pipeline without executing anything or creating files.
- **Why**: Users want to see what they're committing to before starting. Useful for evaluating profiles and debugging custom configurations.
- **Priority**: Should-have (v2.0 if time)
- **Business rules**:
  - Shows the full resolved pipeline: prompt names, phases, dependencies, source tier (built-in/user/project), and expected output artifacts.
  - Shows any resolution errors (missing deps, circular refs) inline.
  - Does not create `.scaffold/` directory or any files.
  - Can be run outside a project directory to preview built-in profiles.

#### F-UX-4: Pipeline Progress Display

- **What**: Every time a prompt completes or the user runs `resume`, Scaffold shows a progress summary: completed/total prompts, current phase, and next prompt.
- **Why**: Keeps the user oriented in a multi-prompt pipeline. v1 relied on the skill auto-suggesting the next command, which was less informative.
- **Priority**: Must-have (v2.0)
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

#### F-UX-5: `scaffold status` Command

- **What**: A lightweight command (`/scaffold:status`) that displays pipeline progress without offering to run the next prompt. Shows completed/pending/skipped prompts, current phase, and profile name.
- **Why**: Users returning to a project after days away need quick orientation — "where am I in this pipeline?" — without committing to run anything. The `resume` command always offers to execute the next prompt, which creates unnecessary friction when the user just wants to check status.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Reads `.scaffold/config.json` and displays the same progress format as F-UX-4 but without the "Run it now?" prompt.
  - If `.scaffold/config.json` doesn't exist, shows: "No pipeline found. Run `/scaffold:init` to start."
  - If all prompts are complete, shows: "Pipeline complete (18/18). Profile: web-app."
  - Skipped prompts (see F-UX-6) show as `⊘ design-system (skipped)` in the progress display.

#### F-UX-6: `scaffold skip` Command

- **What**: Explicitly skip a prompt mid-pipeline: `/scaffold:skip <prompt-name>`. Records the prompt as skipped (distinct from completed) in config.json. The pipeline advances past it.
- **Why**: Users sometimes realize mid-pipeline that a prompt doesn't apply (e.g., they chose `web-app` but decide they don't need a design system). Currently there's no way to skip without `--force` reinitializing or manually editing config.json.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Adds the prompt to a `skipped` array in config.json: `{ "prompt": "design-system", "at": "2026-02-15T11:00:00Z", "reason": "No frontend design needed" }`.
  - Scaffold prompts the user for a brief reason (via `AskUserQuestion` with a text option) to aid future reference, but the reason is optional.
  - Skipped prompts are treated as "done" for dependency resolution — downstream prompts that depend on the skipped prompt can still run. The downstream prompt's content may reference the skipped prompt's output file; if that file doesn't exist, it's the prompt's responsibility to handle the missing input (same as v1 behavior with optional prompts).
  - A skipped prompt can be un-skipped and run later via `/scaffold:resume --from <prompt-name>`.
  - Cannot skip a prompt that has already been completed (use `--from` to re-run instead).
  - Cannot skip a prompt that is the only remaining prompt (pipeline would be done — just let it complete).

#### F-UX-7: Smart Profile Suggestion

- **What**: During `scaffold init`, after the user provides their idea (if any), Claude analyzes the idea text and recommends a profile before presenting the full selection. The recommendation appears as the first option in the profile selection with "(Recommended)" appended.
- **Why**: First-time users (persona "Sam") don't know which profile to pick. Analyzing the idea — "I want to build a CLI tool that..." → recommend `cli-tool` — removes a decision barrier and demonstrates that Scaffold understands their project.
- **Priority**: Should-have (v2.0 if time)
- **Business rules**:
  - Only applies when the user provides `<idea>` text with `/scaffold:init <idea>`. If no idea is provided, the profile selection shows all options without a recommendation.
  - The recommendation is based on keyword analysis of the idea text AND file-based detection of existing project artifacts:
    - **Keyword signals** (from idea text):
      - "web app", "website", "dashboard", "frontend", "React", "Next.js" → `web-app`
      - "CLI", "command-line", "terminal", "library", "npm package", "SDK" → `cli-tool`
      - "mobile", "iOS", "Android", "React Native", "Expo" → `mobile`
      - "API", "backend", "microservice", "REST", "GraphQL", "server" → `api-service`
    - **File-based signals** (from existing files in directory):
      - `package.json` with React/Next.js/Vue dependencies → `web-app`
      - Expo config (`app.json` with `expo`, `app.config.js`) → `mobile`
      - `package.json` with Express/Fastify/Koa/Hono dependencies → `api-service`
      - `bin/` directory or `package.json` `bin` field → `cli-tool`
    - File-based signals override keyword signals when they conflict (existing code is stronger evidence than idea text).
    - If no clear signal from either source, default to no recommendation (show all options equally).
  - The recommendation is a suggestion, not a default. The user must still explicitly select a profile via `AskUserQuestion`.
  - If Claude's analysis suggests a profile, the `AskUserQuestion` options are reordered so the recommended profile appears first with "(Recommended)" in its label.

#### F-UX-8: `scaffold validate` Command

- **What**: Validate profiles and prompt files for errors without running init or modifying any files. Reports missing dependencies, circular references, invalid frontmatter, missing prompt files, and profile inheritance errors.
- **Why**: Profile authors and teams need a way to test their configurations before sharing them. Running `init --dry-run` is close but also resolves and displays a pipeline — `validate` is focused purely on error detection.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Invoked as `/scaffold:validate` (validates everything in the current project) or `/scaffold:validate <profile-name>` (validates a specific profile).
  - Checks performed:
    1. All profiles in `.scaffold/profiles/` and `~/.scaffold/profiles/` parse as valid JSON with required fields.
    2. All `extends` references resolve to existing profiles (no missing parents, no circular inheritance).
    3. All prompt names referenced in profiles (`prompts`, `add-prompts`, `remove-prompts`, `prompt-overrides`) resolve to files at some tier.
    4. All `prompt-overrides` file paths point to existing files.
    5. All prompt files in `.scaffold/prompts/` have valid YAML frontmatter (if frontmatter is present).
    6. All `depends-on` references resolve to prompt names that exist in the pipeline.
    7. No circular dependencies in the prompt dependency graph.
  - Output format: list of errors grouped by source file. If no errors: "All profiles and prompts are valid."
  - Exit cleanly — no files created or modified.

#### F-UX-9: `scaffold reset` Command

- **What**: Reset pipeline state while preserving user customizations. Deletes `.scaffold/config.json` and `.scaffold/context.json` but keeps `.scaffold/prompts/` and `.scaffold/profiles/` intact.
- **Why**: Users who want to start over (changed their mind about the profile, pipeline went sideways) currently have to manually delete `.scaffold/` which also wipes custom prompts and profiles. A dedicated reset command is safer and more discoverable.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Invoked as `/scaffold:reset`.
  - Shows what will be deleted and what will be preserved:
    ```
    Will delete:
      .scaffold/config.json (pipeline state)
      .scaffold/context.json (pipeline context)
      .scaffold/decisions.json (decision log)

    Will preserve:
      .scaffold/prompts/ (custom prompts)
      .scaffold/profiles/ (custom profiles)

    Proceed?
    ```
  - Requires explicit user confirmation via `AskUserQuestion` before deleting anything.
  - After reset, the user runs `/scaffold:init` to start fresh.
  - If `.scaffold/config.json` doesn't exist, shows: "No pipeline state to reset."

#### F-UX-10: Brownfield Mode

- **What**: A mode for adding Scaffold to an existing codebase that already has code, dependencies, and structure but was not scaffolded with Scaffold v1 or v2. Activated via `/scaffold:init --brownfield` or detected when the directory has significant existing code (e.g., `package.json` with dependencies, `src/` directory with files).
- **Why**: Scaffold v1 was greenfield-only. Many developers discover Scaffold after they've already started a project and want to retroactively add the structure, standards, and workflow that Scaffold provides. Competitor tools like OpenSpec excel at brownfield scenarios — Scaffold should not cede this use case.
- **Priority**: Should-have (v2.0 if time)
- **Business rules**:
  - **Detection**: Brownfield detection triggers when ANY of: (1) a package manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`) exists with ≥1 dependency, OR (2) a `src/` or `lib/` directory exists with ≥1 source file. When triggered, Scaffold offers brownfield mode: "This directory has existing code. Would you like to scaffold around it (brownfield) or start fresh?"
  - **Brownfield pipeline adjustments (code-first workflow)**: When mode is brownfield, the 4 adapted prompts generate documentation FROM existing code ("document what exists + identify what's missing") rather than creating from scratch:
    - `create-prd`: Reads existing code, README, and config files to draft the PRD. Asks the user to fill gaps in what was detected (missing personas, unimplemented features, unclear scope).
    - `tech-stack`: Reads `package.json`/`tsconfig.json`/`pyproject.toml`/`go.mod`/`Cargo.toml` to pre-populate technology decisions. Presents detected stack for user confirmation: "Detected: TypeScript, Next.js, Vitest, PostgreSQL. Correct?" User can override any detection.
    - `project-structure`: Documents the existing directory structure rather than scaffolding a new one.
    - `dev-env-setup`: Documents existing dev commands (from `package.json` scripts, `Makefile`, etc.) rather than creating new ones.
    - All other prompts (coding-standards, tdd, git-workflow, etc.) run normally — they create new standards documents that reference the existing codebase.
  - **Brownfield config**: `.scaffold/config.json` includes `"mode": "brownfield"` to indicate the project was scaffolded in brownfield mode. This is informational only — it doesn't change engine behavior after init.
  - **Brownfield signal**: Prompts detect brownfield mode by reading `.scaffold/config.json` `mode` field (value `"brownfield"`). There is no dependency on pipeline context (F-PE-3) for brownfield detection.
  - **Which prompts change**: Only 4 prompts need brownfield variants (create-prd, tech-stack, project-structure, dev-env-setup). These are implemented as conditional sections within the existing prompts (not separate prompt files), triggered by the `mode: "brownfield"` value in `.scaffold/config.json`. The remaining prompts work identically in brownfield and greenfield modes.

#### F-UX-11: `scaffold next` Command

- **What**: A lightweight command (`/scaffold:next`) that shows only the next eligible prompt with context. Simpler than `resume` — it does not offer to run the prompt.
- **Why**: Users who want a quick "what's next?" without committing to execute anything. Complements `status` (which shows the full pipeline) and `resume` (which offers to execute).
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Shows the next prompt's name, description, what it produces (from `produces` frontmatter), and what predecessor artifacts it will read.
  - If multiple prompts are eligible (parallel within a phase — all dependencies satisfied), shows all eligible ones.
  - If all prompts are complete, shows: "Pipeline complete. All prompts have been executed."
  - If `.scaffold/config.json` doesn't exist, shows: "No pipeline found. Run `/scaffold:init` to start."
  - Does not modify any state or offer to execute prompts.

#### F-UX-12: `scaffold adopt` Command

- **What**: A dedicated entry point for adding Scaffold to an existing codebase. Analyzes existing code, identifies what documentation already exists, recommends which prompts to run, and which can be auto-generated from code.
- **Why**: Distinct from brownfield mode (which adapts prompts for existing code) and v1 detection (which detects previously-scaffolded projects). `adopt` is for projects that were never scaffolded and may already have partial documentation.
- **Priority**: Should-have (v2.0 if time)
- **Business rules**:
  - Invoked as `/scaffold:adopt`.
  - Scans for: package manifests, existing `docs/` directory, `README.md`, test configs (`jest.config.*`, `vitest.config.*`, `pytest.ini`, etc.), CI configs (`.github/workflows/`, `.gitlab-ci.yml`), and `.github/` directory.
  - Maps findings to Scaffold prompts: existing `docs/plan.md` → `create-prd` can be marked complete; existing test config → `tdd` may be partially complete.
  - Generates a `.scaffold/config.json` with pre-completed prompts where artifacts exist. Sets `mode: "brownfield"`.
  - Suggests running remaining prompts in brownfield mode: "Found 5/18 artifacts already in place. Remaining prompts will document your existing code. Run `/scaffold:resume` to continue."
  - User confirms before any config is created.

#### F-UX-13: `scaffold dashboard` Command

- **What**: A visual HTML dashboard (`/scaffold:dashboard`) that generates a self-contained HTML file and opens it in the browser, showing the full pipeline with completion status, descriptions, dependency indicators, and "what's next" guidance.
- **Why**: Users lose track of pipeline progress, especially first-timers (Sam) and team leads (Jordan). The text-based `prompt-pipeline` command lacks status detection and visual hierarchy. A browser-based dashboard provides an at-a-glance overview that serves all three personas.
- **Priority**: Should-have (v2.0)
- **Business rules**:
  - Invoked as `/scaffold:dashboard` or `bash scripts/generate-dashboard.sh`.
  - Generates a single self-contained HTML file (all CSS/JS/data inline, no external resources).
  - Opens in default browser via `open` (macOS) / `xdg-open` (Linux).
  - Zero new dependencies — only requires `bash` + `jq` (already required by Scaffold).
  - **Dual mode**: Without `.scaffold/` directory, shows full pipeline as a reference guide (all pending). With `.scaffold/`, shows actual progress from `config.json` and artifact detection.
  - Detects completion status via: (1) `.scaffold/config.json` completed/skipped arrays, (2) artifact file existence per SKILL.md completion detection table, (3) tracking comment presence.
  - Shows "What's Next" — the first pending prompt whose dependencies are all satisfied.
  - Integrates Beads task counts when `bd` is available.
  - Supports `--no-open`, `--json-only`, `--output FILE` flags.
  - Output written to `.scaffold/dashboard.html` (stable refreshable URL) or temp file if `.scaffold/` doesn't exist.
  - Automatic dark/light mode via `prefers-color-scheme`.

### v1 Compatibility

#### F-V1-1: v1 Project Detection

- **What**: When `scaffold init` runs in a directory with v1 artifacts but no `.scaffold/` directory, Scaffold detects the v1 project and offers to create a v2 configuration based on existing artifacts.
- **Why**: Users with v1-scaffolded projects should be able to adopt v2 without re-running prompts that already produced correct outputs.
- **Priority**: Should-have (v2.0 if time)
- **Business rules**:
  - Detection is based on the presence of expected output artifacts, not on a version marker file.
  - Artifact-to-prompt mapping uses the `produces` field from prompt frontmatter. For each built-in prompt, if all artifacts in its `produces` list exist, the prompt is marked as complete.
  - Scaffold never modifies existing v1 artifacts during detection. It only creates the `.scaffold/` directory and `config.json`.
  - The user is shown what was detected and asked to confirm before the config is created.
  - After detection, the pipeline continues with uncompleted prompts — it does not re-run already-completed ones.

#### F-V1-2: v1 Migration Prompts (Deprecated)

v1 deprecated migration prompts in favor of universal update mode (all document-creating prompts auto-detect fresh vs. update mode). v2 continues this pattern. No dedicated migration prompts are needed — users run the standard pipeline prompts in update mode on v1-scaffolded projects detected by F-V1-1.

### Standalone Commands

#### F-SC-1: Commands Outside the Pipeline

- **What**: Certain commands remain standalone and are not part of any profile's pipeline: `quick-task`, `new-enhancement`, `release`, `single-agent-start`, `single-agent-resume`, `multi-agent-start`, `multi-agent-resume`, `prompt-pipeline`, `update`, `version`, `status`, `next`, `skip`, `validate`, `reset`, `adopt`, and all migration commands. Additionally, `user-stories-multi-model-review` and `platform-parity-review` are available as opt-in pipeline prompts (addable via `add-prompts` in a profile or `extra-prompts` in config.json) but are not included in any built-in profile.
- **Why**: These are used after the pipeline completes or for ongoing project work. They don't belong in the scaffolding sequence.
- **Priority**: Must-have (v2.0)
- **Business rules**:
  - Standalone commands are accessible at any time via `/scaffold:<command-name>`.
  - They do not appear in the pipeline preview or progress display.
  - They do not require `.scaffold/config.json` to exist (except `resume`, which does).
  - `prompt-pipeline` is updated to show the resolved pipeline from config.json if it exists, or the built-in pipeline reference if not.
  - `update` and `version` commands are updated to reference the v2 plugin manifest and version scheme.

#### F-SC-2: Release Management

- **What**: A standalone command `/scaffold:release` that automates versioned releases. Analyzes conventional commits since the last tag to suggest a version bump (major/minor/patch), runs quality gates, generates a changelog, bumps version numbers in detected project files, creates a git tag, and publishes a GitHub release.
- **Why**: Users building projects with Scaffold have no standardized way to cut releases. Version bumping, changelog generation, git tagging, and GitHub release creation are all manual and error-prone. A guided release command fills this gap.
- **Priority**: Should-have (v2.x)
- **Business rules**:
  - Supports four modes: standard (auto-suggest bump), explicit (`major`/`minor`/`patch`), dry-run (`--dry-run` — analysis only, zero mutations), and rollback (undo the most recent release).
  - Auto-detects version files: `package.json`, `pyproject.toml`, `Cargo.toml`, `.claude-plugin/plugin.json`, `pubspec.yaml`, `setup.cfg`, `version.txt`.
  - Parses conventional commits (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE` → major) with highest-wins rule. Falls back to asking the user if no conventional commits are found.
  - Runs the project's quality gates (`make check`, `npm test`, `cargo test`, etc.) before proceeding. Blocks on failure unless the user explicitly forces.
  - Generates changelog in Keep a Changelog format, grouped by type (Added/Fixed/Changed/Other). Prepends to existing `CHANGELOG.md` or creates a new one.
  - If `.beads/` exists, cross-references closed Beads tasks with the commit range and includes them in release notes.
  - First-release bootstrapping: if no `v*` tags exist, guides the user through choosing an initial version and creates `CHANGELOG.md` from scratch.
  - Branch-aware flow: on `main`/`master`, tags and pushes directly; on feature branches, creates a release PR with post-merge tagging instructions.
  - Tag format is always `vX.Y.Z`.
  - Rollback requires the user to type the exact tag name (not just "yes") as a safety measure. Deletes GitHub release, removes tag (local + remote), reverts version bump commit.
  - Dry-run mode performs all analysis but makes zero file, git, or GitHub changes.

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
- **reads**: Optional array of file paths this prompt needs as input (see D1 skill integration). Used by the auto-activated skill to pre-load predecessor documents.
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
- **skipped**: Array of `{ prompt: string, at: string, reason: string }` entries recording when each prompt was explicitly skipped via `/scaffold:skip`. Skipped prompts are treated as "done" for dependency resolution.
- **mode**: Either `"greenfield"` (default) or `"brownfield"` — indicates how the project was initialized. Informational only after init.
- **extra-prompts**: Array of custom prompt names added outside the profile definition (must have corresponding prompt files at project, user, or built-in level).
- **resolved-overrides**: Map of prompt name → file path, merged from the profile's `prompt-overrides` at resolution time. This is a computed/cached field — the source of truth is the profile JSON. Stored for fast lookup during execution.
- **custom-config**: Free-form object for user/profile-specific configuration.

**Config versioning**: Unknown fields are preserved on read/write, and missing fields use defaults. If `scaffold-version` indicates a newer format than the running Scaffold version, Scaffold warns but does not refuse to operate. Schema migrations are handled by a future `scaffold migrate` command (out of scope for v2.0).

### Pipeline Context

Stored in `.scaffold/context.json`, this is the shared key-value store that accumulates across prompt execution.

- **Structure**: Top-level keys are prompt namespaces (e.g., `"tech-stack"`, `"prd"`). Values are objects with arbitrary structure.
- **Lifecycle**: Created empty by `init`. Each prompt can read the full context and write to its own namespace.
- **Persistence**: Plain JSON file, committed to git along with other scaffold configuration.

### Decision Log

Stored in `.scaffold/decisions.json`, this is an append-only log of key decisions made during pipeline execution.

- **Structure**: JSON array of `{ "prompt": string, "decision": string, "at": string }` entries.
- **Lifecycle**: Created as empty array (`[]`) by `init`. Each prompt optionally appends 1-3 key decisions after execution. Never modified or deleted (append-only). Deleted by `reset`.
- **Persistence**: Plain JSON file, committed to git alongside other scaffold configuration.

### Relationships

```
Profile  ──(extends)──>  Profile (0..1 parent)
Profile  ──(contains)──> Prompt[] (ordered list)
Prompt   ──(depends-on)──> Prompt[] (0..N dependencies)
Pipeline Config ──(uses)──> Profile (exactly 1)
Pipeline Config ──(tracks)──> Prompt[] completion state
Pipeline Context ──(written by)──> Prompt[] (each writes its namespace)
Decision Log ──(appended by)──> Prompt[] (each appends key decisions)
```

## 6. External Integrations

### Implementation Architecture

Scaffold v2's engine is **not compiled code** — it is a collection of Claude Code command prompts executed by Claude. All pipeline logic (dependency resolution, topological sort, config management, state tracking) is expressed as natural-language instructions within prompt files that Claude interprets and executes using its tools (Bash, Read, Write, Edit, AskUserQuestion).

This architecture has key implications:

1. **Instructions must be precise with verification steps.** Each command prompt includes explicit steps Claude follows, with verification checks (e.g., "After sorting, verify every prompt appears after all its dependencies"). Vague instructions produce inconsistent results.
2. **Complex operations use Claude's tools.** Operations like topological sorting, JSON manipulation, and file scanning are performed by Claude using Bash commands, Read/Write tools, and in-context reasoning — not by a runtime engine or compiled library.
3. **Reliability depends on prompt quality.** The engine's correctness is a function of prompt specificity, not of type-checked code. Ambiguous or under-specified prompts are bugs. Each orchestration command (init, resume, validate, etc.) must be written to the same standard as a code specification.

### Claude Code Plugin System

- **What**: Scaffold v2 remains a Claude Code plugin, installable via `/plugin marketplace add scaffold`. Commands are exposed as `/scaffold:<command-name>`.
- **Integration details**: The plugin manifest (`.claude-plugin/plugin.json`) must be updated with the new version and description. New commands (`init`, `resume`, `preview`, `profile`) are added to the `commands/` directory. Existing commands remain for backward compatibility.
- **Requirements**: Claude Code plugin system must support commands with subcommand-style arguments (e.g., `/scaffold:init --dry-run`). If the plugin system doesn't support flags in arguments, the `--dry-run` flag is handled by parsing `$ARGUMENTS` within the prompt.

### Claude Code Skills System

- **What**: The auto-activated pipeline skill (`skills/scaffold-pipeline/SKILL.md`) is updated to reference the v2 pipeline resolution from `.scaffold/config.json` instead of the hardcoded v1 pipeline table.
- **Integration details**: The skill reads `.scaffold/config.json` to show the user's actual pipeline and progress. If the config doesn't exist, it falls back to showing available profiles and suggesting `/scaffold:init`.
- **Requirements**: Skill auto-activation triggers remain the same (keywords: scaffolding, pipeline, next command, etc.).
- **Predecessor document loading (should-have)**: A new optional frontmatter field `reads` (array of file paths) declares which predecessor documents a prompt needs. When a prompt executes, the skill ensures Claude has read these files before the prompt runs. Example: `tech-stack.md` frontmatter includes `reads: ["docs/plan.md"]`. This supplements, not replaces, prompts' own file-reading instructions. If a file in `reads` doesn't exist, it's skipped silently (the prompt handles missing inputs). This provides automatic context loading without requiring the full pipeline context (F-PE-3).

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
- **Integration details**: `.scaffold/config.json`, `.scaffold/context.json`, and `.scaffold/decisions.json` are committed to git (they're project state). `.scaffold/prompts/` and `.scaffold/profiles/` are committed to git (they're project customizations). `~/.scaffold/` is not committed — it's the user's personal configuration.
- **Requirements**: Write access to the project directory and `~/`.

## 7. Non-Functional Requirements

### Performance

- **Pipeline resolution**: Dependency graph resolution for up to 50 prompts must complete in under 1 second. The resolution is a topological sort on a small directed acyclic graph — this is computationally trivial.
- **Prompt loading**: Loading a prompt from any tier (project/user/built-in) must complete in under 100ms. This is a file read operation.
- **Config reads/writes**: Reading and writing `.scaffold/config.json` must complete in under 100ms. The file is small (under 10KB for any realistic pipeline).
- **No background processes**: Scaffold does not run background services, daemons, or watchers. All operations are synchronous and complete within the Claude Code command execution.

### Reliability

- **Crash recovery**: If a Claude Code session crashes mid-prompt, no data is lost. The prompt is simply not marked as complete. The user can `resume` and the prompt runs again.
- **Config integrity**: `.scaffold/config.json` is small (under 10KB) and written in full on each update via Claude Code's Write tool. If a session crashes mid-write, the file may be incomplete. The `resume` command detects and recovers from this: if config.json fails to parse, Scaffold falls back to artifact-based completion detection (scanning `produces` files) and regenerates config.json from the detected state.
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

### Resolved Questions

1. **Beads dependency** → Resolved: `beads` has no formal `depends-on`, but `tech-stack` formally depends on `beads` (beads creates/updates CLAUDE.md, which tech-stack and downstream prompts reference). This makes the dependency explicit in the graph rather than relying on phase ordering convention. See F-PS-1 dependency list.

2. **Pipeline context timing** → Resolved: F-PE-3 (Pipeline Context) ships as should-have. If deferred, all references to `context.json` are removed: `init` does not create it, `reset` does not reference it, and brownfield detection uses `config.json` `mode` field. Prompts read predecessor output files directly (same as v1 behavior). See F-PE-3 "If deferred" note.

3. **Multi-model review handling** → Resolved: `multi-model-review`, `user-stories-multi-model-review`, and `platform-parity-review` are opt-in pipeline prompts available via `add-prompts` in a profile or `extra-prompts` in config.json. Not included in any built-in profile. See F-SC-1.

4. **Config committed to git** → Resolved: Yes. `.scaffold/config.json`, `.scaffold/context.json`, `.scaffold/decisions.json`, `.scaffold/profiles/`, and `.scaffold/prompts/` are all committed to git. The `.scaffold/` directory is project configuration, like `.github/` or `.vscode/`. Rationale: enables team sharing, pipeline resumption across machines, and version history of pipeline state.

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

- **v1-to-v2 migration rate**: 80%+ of active v1 users migrate to v2 within 3 months of release. Measured via user surveys, GitHub feedback, and community reports.
- **New user onboarding**: First-time users complete `scaffold init` and execute at least 3 pipeline prompts in their first session. Measured via user surveys, GitHub feedback, and community reports.

### Efficiency

- **Time to first implementation task**: Time from running `/scaffold:init` to the first `bd ready` output (pipeline complete, tasks created). Target: under 60 minutes for the `minimal` profile, under 120 minutes for `web-app`. Measured via user surveys, GitHub feedback, and community reports.
- **Prompt skip rate**: Percentage of prompts skipped via profile selection vs. v1's manual skipping. Target: zero manual prompt skipping needed when using a built-in profile. Measured via user surveys, GitHub feedback, and community reports.

### Customization Usage

- **Custom prompt adoption**: 20%+ of v2 projects use at least one custom prompt or prompt override within 6 months. Measured via user surveys, GitHub feedback, and community reports.
- **Custom profile adoption**: 10%+ of v2 projects use a custom profile (not a built-in) within 6 months. Measured via user surveys, GitHub feedback, and community reports.

### Quality

- **Pipeline completion rate**: 70%+ of started pipelines reach completion (all prompts run). The 30% margin accounts for legitimate abandonment (user pivots, project cancelled). Measured via user surveys, GitHub feedback, and community reports.
- **Resume usage**: 50%+ of pipelines that span multiple sessions use `/scaffold:resume` at least once. Measured via user surveys, GitHub feedback, and community reports.

### Satisfaction

- **No regression in prompt quality**: Output artifacts (docs/plan.md, docs/tech-stack.md, etc.) maintain the same quality as v1. Verified by user feedback — if users report that v2 outputs are worse than v1, the prompt content was inadvertently degraded.
- **Reduced support questions**: Fewer "which prompt do I run next?" and "do I need this prompt for my project type?" questions compared to v1. Profiles and auto-ordering should eliminate these.

<!-- scaffold:prd-gap-analysis v1 2026-02-16 -->
