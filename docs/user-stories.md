<!-- scaffold:user-stories v1 2026-02-17 -->
<!-- scaffold:user-stories-gaps v1 2026-02-17 -->
# User Stories — Scaffold v2

User stories for Scaffold v2, derived from the [Product Requirements Document](plan.md). Every PRD feature (F-PE-\*, F-PR-\*, F-PS-\*, F-UX-\*, F-V1-\*, F-SC-\*) maps to at least one story. All 6 user flows are covered. Stories are grouped by epic.

## Best Practices

- **AI-consumable format**: Every acceptance criterion uses explicit Given/When/Then with file paths, JSON structures, and exit codes — not vague "returns success."
- **Scope boundaries**: Each story explicitly states what it does NOT include to prevent scope creep.
- **INVEST criteria**: Stories are Independent, Non-ambiguous, Valuable, Estimable, Scoped, and Testable.
- **Size target**: No story is so large it couldn't be implemented in 1–3 focused Claude Code sessions.
- **MoSCoW priorities**: Must-have, Should-have, Could-have, Won't-have — mapped from PRD Section 4 priorities.
- **Actionable error messages**: Every error AC includes three parts: (1) what went wrong, (2) the exact command or action to fix it, (3) a pointer to further help (e.g., `/scaffold:validate`). No error message is a dead end.

## User Personas

### Alex — Solo AI-First Developer

Scaffolds projects quickly, uses Claude Code agents for all coding work. Has used Scaffold v1 on 2+ projects. Comfortable with the terminal. Wants AI-optimized documents so agents work autonomously.

### Jordan — Team Lead Adopting AI Workflows

Standardizes how the team scaffolds projects. Wants shared profiles with team-specific prompts. Needs repeatable, consistent pipelines across team members.

### Sam — First-Time Scaffold User

Trying Scaffold on a new project idea. Doesn't want to read docs. Wants the tool to figure out which prompts to run. Needs a guided entry point.

---

## Epic 1: Pipeline Initialization

Covers: F-UX-1, F-UX-7, Flow 1

### US-1.1: Initialize a New Project with a Built-in Profile

**As** Sam (first-time user), **I want to** run a single command to set up my project pipeline, **so that** I don't have to figure out which prompts to run or in what order.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** an empty directory with no `.scaffold/` directory,
   **When** the user runs `/scaffold:init`,
   **Then** Scaffold presents a two-question profile selection flow:
   - Question 1: "What type of project?" with options: **Web App**, **Mobile**, **Backend (CLI/API)**, **Other**
   - Question 2 (varies by Q1 answer):
     - Web App → confirms `web-app` or offers **Custom**
     - Mobile → confirms `mobile` or offers **Custom**
     - Backend → "Which backend type?" with options: **CLI Tool**, **API Service**, **Minimal**, **Custom**
     - Other → "Which profile?" with options: **Minimal**, **Custom**

2. **Given** the user selects "Web App" then confirms `web-app`,
   **When** profile resolution completes,
   **Then** Scaffold creates `.scaffold/config.json` with:
   ```json
   {
     "scaffold-version": "2.0.0",
     "profile": "web-app",
     "mode": "greenfield",
     "created": "<ISO-8601-timestamp>",
     "prompts": ["create-prd", "prd-gap-analysis", "beads", "tech-stack", ...],
     "completed": [],
     "skipped": [],
     "extra-prompts": [],
     "resolved-overrides": {},
     "custom-config": {}
   }
   ```

3. **Given** config.json is written,
   **When** Scaffold displays the pipeline,
   **Then** output shows a numbered, phase-grouped prompt list:
   ```
   Scaffold pipeline for profile "web-app" (18 prompts):

   Phase 1 — Product Definition
     1. create-prd
     2. prd-gap-analysis
   ...
   ```

4. **Given** the pipeline is displayed,
   **When** Scaffold asks "Ready to start? The first prompt is `create-prd`" and the user confirms,
   **Then** Scaffold executes the `create-prd` prompt.

5. **Given** config.json is created with a `custom-config` field,
   **When** Scaffold writes the initial config,
   **Then** `custom-config` is an empty object `{}`. The field is a free-form object preserved across reads/writes — prompts can write to it during execution and read it back in later sessions.

6. **Given** the user's session is interrupted during any `AskUserQuestion` interaction in the init flow (profile selection, confirmation, etc.),
   **When** Scaffold resumes or the user runs init again,
   **Then** no `.scaffold/` directory or files were created — interrupted `AskUserQuestion` flows result in no state change. This applies to all interactive stories (US-1.4, US-1.5, US-3.5, US-3.6, US-7.1).

**Scope Boundary**: Does NOT cover: custom profile selection (US-1.5), idea text analysis (US-1.7), brownfield detection (US-7.1), or prompt execution mechanics (US-2.5).

**Data/State Requirements**:
- Input: None (empty directory)
- Output: `.scaffold/config.json` with resolved prompt list
- Tool: `AskUserQuestion` with 2–4 options per question

**UI/UX Notes**:
- Profile selection uses exactly 2 sequential `AskUserQuestion` calls (two-question flow per PRD Flow 1, step 4)
- Each question has 2–4 options (AskUserQuestion limit)
- Built-in profiles are shown first in selection, custom profiles after

**PRD Trace**: F-UX-1, Flow 1 (steps 1–9)

---

### US-1.2: Initialize with Idea Text

**As** Sam, **I want to** provide my project idea inline with the init command, **so that** Scaffold can auto-start the PRD creation without asking me to describe it again.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the user runs `/scaffold:init Build a CLI tool for managing dotfiles`,
   **When** profile selection completes and the user confirms the pipeline,
   **Then** Scaffold stores the idea text and passes it as `$ARGUMENTS` to the `create-prd` prompt.

2. **Given** the idea text "Build a CLI tool for managing dotfiles" is provided,
   **When** the `create-prd` prompt executes,
   **Then** `$ARGUMENTS` in the prompt content is replaced with "Build a CLI tool for managing dotfiles".

3. **Given** no idea text is provided (`/scaffold:init` with no arguments),
   **When** the `create-prd` prompt executes,
   **Then** `$ARGUMENTS` is replaced with an empty string and the prompt asks the user to describe their project.

**Scope Boundary**: Does NOT cover: smart profile suggestion from idea text (US-1.7) — that story handles using the idea text to recommend a profile. This story only covers passing the text through.

**Data/State Requirements**:
- Input: `$ARGUMENTS` string from user command invocation
- Output: Idea text stored for `create-prd` execution

**UI/UX Notes**: The idea text is displayed back to the user during init: "Project idea: Build a CLI tool for managing dotfiles"

**PRD Trace**: F-UX-1 (step 1, step 9), F-PE-4, F-PS-1 (`$ARGUMENTS`)

---

### US-1.3: Detect Existing Scaffold Configuration

**As** Alex, **I want to** be warned if I accidentally run init on an already-scaffolded project, **so that** I don't lose my pipeline state.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** `.scaffold/config.json` exists in the current directory,
   **When** the user runs `/scaffold:init`,
   **Then** Scaffold displays: "This directory already has a scaffold configuration. Run `/scaffold:resume` to continue the existing pipeline, or pass `--force` to reinitialize."

2. **Given** `.scaffold/config.json` exists,
   **When** the warning is shown,
   **Then** init stops — no files are written, no profile selection occurs.

3. **Given** the directory has no `.scaffold/config.json` but has other files (e.g., `README.md`, `src/`),
   **When** the user runs `/scaffold:init`,
   **Then** init proceeds normally — existing files don't block initialization (the user may be adding Scaffold to an existing project).

**Scope Boundary**: Does NOT cover: `--force` reinitialize (US-1.4), brownfield detection (US-7.1), or v1 project detection (US-7.3).

**Data/State Requirements**:
- Check: File existence of `.scaffold/config.json`

**PRD Trace**: F-UX-1 (step 2), Flow 1 error cases

---

### US-1.4: Force Reinitialize Existing Project

**As** Alex, **I want to** start over with a fresh pipeline while keeping my custom prompts and profiles, **so that** I can change my profile selection without losing customizations.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** `.scaffold/config.json` exists,
   **When** the user runs `/scaffold:init --force`,
   **Then** Scaffold shows what will be reset:
   ```
   Resetting pipeline state. Custom prompts and profiles will be preserved. Proceed?
   ```

2. **Given** the user confirms the reset,
   **When** Scaffold proceeds,
   **Then** it deletes `.scaffold/config.json`, `.scaffold/context.json`, and `.scaffold/decisions.json` but preserves `.scaffold/prompts/` and `.scaffold/profiles/`.

3. **Given** the state files are deleted,
   **When** init continues,
   **Then** the normal profile selection and pipeline creation flow runs (US-1.1).

4. **Given** the user declines the confirmation,
   **When** Scaffold stops,
   **Then** no files are modified.

**Scope Boundary**: Does NOT cover: `scaffold reset` command (US-3.6) — that's a separate command that only resets without re-running init.

**Data/State Requirements**:
- Deleted: `.scaffold/config.json`, `.scaffold/context.json`, `.scaffold/decisions.json`
- Preserved: `.scaffold/prompts/`, `.scaffold/profiles/`

**UI/UX Notes**: Confirmation via `AskUserQuestion` with options: **Yes, reinitialize** / **Cancel**

**PRD Trace**: F-UX-1 (step 2 `--force` path), Flow 1 error cases

---

### US-1.5: Custom Profile Selection (Per-Phase Prompt Picking)

**As** Alex, **I want to** hand-pick which prompts to include in my pipeline, **so that** I can create a project-specific pipeline without defining a reusable profile.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the user selects "Custom" during profile selection,
   **When** Scaffold enters custom mode,
   **Then** it walks through prompt selection one phase at a time using `AskUserQuestion` with `multiSelect: true`.

2. **Given** a phase has more than 4 prompts,
   **When** that phase is presented,
   **Then** it splits across multiple questions (groups of ≤4), each showing phase context: "Phase 2 — Project Foundation (1/2)".

3. **Given** the user selects "Coding Standards" but not "Tech Stack",
   **When** dependency resolution runs,
   **Then** Scaffold auto-includes "Tech Stack" and displays: "Auto-included `tech-stack` (required by `coding-standards`)."

4. **Given** the user selects zero prompts across all phases,
   **When** Scaffold checks the selection,
   **Then** it shows: "At least one prompt must be selected. The minimal viable pipeline is: `create-prd` → `tech-stack` → `implementation-plan`."

5. **Given** custom selection is complete,
   **When** dependencies are resolved and the pipeline is displayed,
   **Then** the resolved `prompts` array in `.scaffold/config.json` includes both user-selected and auto-included prompts in topological order.

6. **Given** the user cancels during any phase of custom prompt selection (e.g., closes the session or interrupts the `AskUserQuestion` flow),
   **When** Scaffold checks the filesystem,
   **Then** no `.scaffold/` directory or files are created — cancellation is a no-op.

**Scope Boundary**: Does NOT cover: back-navigation during selection (not supported — user must re-run init). Does NOT cover: creating a reusable profile (US-4.2).

**Data/State Requirements**:
- All built-in prompts with their `phase` and `depends-on` metadata
- `AskUserQuestion` with `multiSelect: true`, 2–4 options per question

**UI/UX Notes**:
- No back-navigation — user re-runs init to change
- Auto-included dependencies are shown clearly before confirmation

**PRD Trace**: F-UX-1 (step 5), Flow 1 error cases (zero prompts, dependency conflicts)

---

### US-1.6: Auto-Include Dependencies for Custom Selection

**As** Alex, **I want** dependencies to be automatically resolved when I pick prompts, **so that** my pipeline doesn't break from missing prerequisites.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the user selects `coding-standards` but deselects `tech-stack`,
   **When** dependency resolution runs,
   **Then** `tech-stack` is auto-included because `coding-standards` declares `depends-on: [tech-stack]`.

2. **Given** auto-included prompts exist,
   **When** Scaffold displays the resolved pipeline,
   **Then** each auto-included prompt shows a message: "Auto-included `tech-stack` (required by `coding-standards`)."

3. **Given** multiple transitive dependencies are missing (e.g., user selects `implementation-plan` which needs `workflow-audit` which needs `claude-md-optimization`),
   **When** resolution runs,
   **Then** all transitive dependencies are included and reported.

**Scope Boundary**: Does NOT cover: dependency resolution algorithm internals (US-2.1). This story covers the UX of auto-inclusion during init; US-2.1 covers the topological sort.

**Data/State Requirements**:
- `depends-on` fields from all prompt frontmatter
- Resolved prompt list written to `.scaffold/config.json`

**PRD Trace**: F-UX-1 (step 5), F-PE-1

---

### US-1.7: Smart Profile Suggestion from Idea Text

**As** Sam, **I want** Scaffold to recommend a profile based on my project idea, **so that** I don't have to understand all the profiles to pick the right one.

**Priority**: Should-have

**Acceptance Criteria**:

1. **Given** the user runs `/scaffold:init Build a REST API with PostgreSQL`,
   **When** Scaffold analyzes the idea text,
   **Then** keyword signals ("API", "REST", "PostgreSQL") match `api-service`.

2. **Given** a profile recommendation exists,
   **When** the profile selection question is shown,
   **Then** the recommended profile appears first with "(Recommended)" appended: "API Service (Recommended)".

3. **Given** the user runs `/scaffold:init` without idea text,
   **When** profile selection is shown,
   **Then** no profile is marked as recommended — all options appear equally.

4. **Given** the idea text contains "I want to build a mobile app with Expo",
   **When** keyword analysis runs,
   **Then** "mobile" and "Expo" signals match the `mobile` profile.

5. **Given** the idea text is ambiguous (e.g., "Build a tool"),
   **When** no clear signal is detected,
   **Then** no recommendation is made — options appear without "(Recommended)".

**Scope Boundary**: Does NOT cover: file-based signals (US-1.8). This story covers keyword analysis only.

**Data/State Requirements**:
- Keyword-to-profile mapping:
  - "web app", "website", "dashboard", "frontend", "React", "Next.js" → `web-app`
  - "CLI", "command-line", "terminal", "library", "npm package", "SDK" → `cli-tool`
  - "mobile", "iOS", "Android", "React Native", "Expo" → `mobile`
  - "API", "backend", "microservice", "REST", "GraphQL", "server" → `api-service`

**UI/UX Notes**: Recommendation is a suggestion only — the user must still explicitly select via `AskUserQuestion`. Reorders options so recommended appears first.

**PRD Trace**: F-UX-7

---

### US-1.8: Smart Profile Suggestion from Existing Files

**As** Alex, **I want** Scaffold to detect my existing project type from files on disk, **so that** it recommends the right profile even if my idea text is vague.

**Priority**: Should-have

**Acceptance Criteria**:

1. **Given** `package.json` exists with `"react"` or `"next"` in `dependencies`,
   **When** file-based analysis runs during init,
   **Then** the `web-app` profile is recommended.

2. **Given** `app.json` exists with `"expo"` key, or `app.config.js` exists,
   **When** file-based analysis runs,
   **Then** the `mobile` profile is recommended.

3. **Given** `package.json` exists with `"express"`, `"fastify"`, `"koa"`, or `"hono"` in dependencies,
   **When** file-based analysis runs,
   **Then** the `api-service` profile is recommended.

4. **Given** a `bin/` directory exists, or `package.json` has a `bin` field,
   **When** file-based analysis runs,
   **Then** the `cli-tool` profile is recommended.

5. **Given** idea text says "web app" but `package.json` has Express in dependencies,
   **When** both signals conflict,
   **Then** the file-based signal (`api-service`) overrides the keyword signal (`web-app`).

**Scope Boundary**: Does NOT cover: keyword-based suggestion (US-1.7). This story covers file-based signals only plus conflict resolution between the two.

**Data/State Requirements**:
- File detection checks: `package.json`, `app.json`, `app.config.js`, `bin/` directory
- Dependency name scanning via `jq` on `package.json`

**PRD Trace**: F-UX-7 (file-based signals)

---

## Epic 2: Pipeline Engine

Covers: F-PE-1 through F-PE-6

### US-2.1: Resolve Dependency Graph Using Topological Sort

**As** the pipeline engine, **I need to** resolve prompt ordering from dependency declarations, **so that** prompts always run after their prerequisites.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** a set of prompts with `depends-on` declarations from the `web-app` profile,
   **When** the `init` orchestration command performs dependency resolution (using Kahn's algorithm as specified in the prompt instructions, with `scripts/resolve-deps.sh` available as a test utility),
   **Then** it produces a topologically sorted array where every prompt appears after all its dependencies.

2. **Given** the sorted output,
   **When** a verification step runs,
   **Then** it confirms every prompt in the list appears after all its `depends-on` entries. If verification fails, it reports the specific out-of-order pair.

3. **Given** prompts with no dependencies (e.g., `create-prd`, `beads`),
   **When** topological sort runs,
   **Then** they appear first, ordered by profile-defined sequence as tiebreaker.

4. **Given** multiple valid orderings exist within a phase,
   **When** Kahn's algorithm dequeues prompts with in-degree 0,
   **Then** the profile-defined order is used as the tiebreaker.

5. **Given** the `web-app` profile with 18 prompts,
   **When** resolution runs,
   **Then** it completes in under 1 second and the result is cached in `.scaffold/config.json`.

**Scope Boundary**: Does NOT cover: circular dependency detection (US-2.2) — that's a separate error-path story. Does NOT cover: profile resolution (Epic 4).

**Data/State Requirements**:
- Input: Array of prompt names + frontmatter `depends-on` fields
- Output: Sorted array written to `.scaffold/config.json` `prompts` field
- Algorithm: Kahn's algorithm per PRD F-PE-1
- Runtime: Implemented as natural-language instructions in orchestration command prompts (per PRD Section 6). Claude Code executes the algorithm using its tools.
- Test utility: `scripts/resolve-deps.sh` — standalone validation script for CI/testing; NOT the production runtime path
- Test: `tests/resolve-deps.bats`

**PRD Trace**: F-PE-1

---

### US-2.2: Detect and Report Circular Dependencies

**As** Jordan, **I want** Scaffold to catch circular dependencies at pipeline resolution time, **so that** I find config errors before running anything.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** prompt A depends on prompt B and prompt B depends on prompt A,
   **When** dependency resolution runs (via orchestration command prompt or `scripts/resolve-deps.sh` test utility),
   **Then** it reports an error: "Circular dependency detected: A → B → A. Remove one dependency to proceed."

2. **Given** a longer cycle: A → B → C → A,
   **When** resolution detects the cycle,
   **Then** the full cycle path is reported: "Circular dependency detected: A → B → C → A."

3. **Given** prompt X depends on prompt Y but Y is not in the current profile's prompt list,
   **When** resolution runs,
   **Then** it reports: "Prompt `X` depends on `Y`, but `Y` is not in this pipeline. Fix: add `Y` to your profile's `add-prompts`, or remove the dependency from `X`'s frontmatter. Run `/scaffold:validate` to check all dependencies."

4. **Given** `extra-prompts` references a prompt name with no file at any tier,
   **When** resolution runs,
   **Then** it reports: "Prompt `Z` referenced in extra-prompts but not found at .scaffold/prompts/Z.md, ~/.scaffold/prompts/Z.md, or built-in commands/Z.md. Fix: create the prompt file, or remove `Z` from `extra-prompts` in .scaffold/config.json."

**Scope Boundary**: Does NOT cover: valid topological sort (US-2.1). This story covers only error detection.

**Data/State Requirements**:
- Same input as US-2.1
- Exit code 1 on cycle detection, with full cycle path on stderr

**PRD Trace**: F-PE-1 (cycle detection, missing dependency detection)

---

### US-2.3: Record Prompt Completion in config.json

**As** the pipeline engine, **I need to** record when each prompt completes, **so that** `resume` knows where to pick up.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the `create-prd` prompt finishes executing,
   **When** the `resume` orchestrator records completion,
   **Then** `.scaffold/config.json` `completed` array contains:
   ```json
   { "prompt": "create-prd", "at": "2026-02-17T10:35:00Z" }
   ```

2. **Given** a prompt was previously completed and is re-run via `--from`,
   **When** the prompt completes again,
   **Then** the previous completion entry is replaced (not duplicated) with the new timestamp.

3. **Given** a prompt fails (user aborts or Claude errors out),
   **When** no completion is recorded,
   **Then** the prompt does NOT appear in the `completed` array — it remains pending.

4. **Given** the `completed` array says a prompt is done but its `produces` artifacts are missing,
   **When** `resume` loads the config,
   **Then** it warns: "Prompt `X` was marked complete but its output `Y` is missing. Re-run with `/scaffold:resume --from X`?"

5. **Given** config.json contains fields not recognized by the current Scaffold version (e.g., a field added by a newer version),
   **When** Scaffold reads and writes config.json,
   **Then** unknown fields are preserved — not stripped or overwritten. This enables forward compatibility so a newer Scaffold version can add fields that older versions won't destroy.

**Scope Boundary**: Does NOT cover: artifact-based detection (US-2.4). This story covers the orchestrator-recorded mechanism only.

**Data/State Requirements**:
- File: `.scaffold/config.json`
- JSON path: `.completed[]`
- Atomic write via `jq` + temp file + `mv`

**PRD Trace**: F-PE-2

---

### US-2.4: Artifact-Based Completion Detection

**As** the pipeline engine, **I need to** detect completed prompts by checking if their output artifacts exist, **so that** the pipeline recovers from session crashes.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the `create-prd` prompt has `produces: ["docs/plan.md"]` in frontmatter,
   **When** `scripts/detect-completion.sh` runs and `docs/plan.md` exists,
   **Then** `create-prd` is reported as complete.

2. **Given** a prompt has multiple `produces` entries (e.g., `["docs/plan.md", "CLAUDE.md"]`),
   **When** detection runs and ALL files exist,
   **Then** the prompt is marked complete. If ANY file is missing, the prompt is NOT marked complete.

3. **Given** artifacts exist on disk but the prompt is NOT in the `completed` array (session crash scenario),
   **When** `resume` reconciles artifact detection with config state,
   **Then** the artifact-based detection takes precedence — the prompt is treated as complete.

4. **Given** a custom prompt omits the `produces` field,
   **When** detection runs,
   **Then** the prompt cannot be artifact-detected — it relies solely on the `completed` array.

**Scope Boundary**: Does NOT cover: v1 project detection (US-7.3) — that reuses this mechanism but is a separate flow.

**Data/State Requirements**:
- Input: Prompt frontmatter `produces` fields
- Script: `scripts/detect-completion.sh`
- Test: `tests/detect-completion.bats`

**PRD Trace**: F-PE-2 (artifact-based detection), F-PE-4 (completion detection)

---

### US-2.5: Execute a Prompt with $ARGUMENTS Substitution

**As** the pipeline engine, **I need to** load a prompt, substitute `$ARGUMENTS`, and present it to Claude Code, **so that** prompts execute in the user's session with proper context.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the resolved prompt content for `create-prd` contains `$ARGUMENTS`,
   **When** the prompt is executed with idea text "Build a REST API",
   **Then** `$ARGUMENTS` is replaced with "Build a REST API" in the prompt body.

2. **Given** no arguments were provided,
   **When** the prompt is executed,
   **Then** `$ARGUMENTS` is replaced with an empty string.

3. **Given** the prompt file is resolved via the 4-tier precedence (US-5.2),
   **When** Scaffold loads the prompt,
   **Then** it always logs which source tier was used, using a consistent format:
   - `"Using built-in create-prd"` (Tier 4)
   - `"Using user override for create-prd (~/.scaffold/prompts/create-prd.md)"` (Tier 3)
   - `"Using project override for create-prd (.scaffold/prompts/create-prd.md)"` (Tier 2)
   - `"Using profile override for create-prd (.scaffold/prompts/create-prd-custom.md)"` (Tier 1)
   This transparency helps users understand which version of a prompt is running.

4. **Given** a prompt completes,
   **When** the engine records completion and identifies the next prompt,
   **Then** it displays: "Prompt `create-prd` complete. Next: `prd-gap-analysis`. Run it now?"

5. **Given** a prompt fails (user aborts mid-execution),
   **When** the engine checks state,
   **Then** the prompt is NOT marked complete, and `resume` will retry it. Partial completion is indistinguishable from no completion — the artifact check and self-report are the best available signals.

6. **Given** a prompt executes but produces no artifacts (e.g., a prompt that only configures settings, or a prompt whose `produces` list is empty),
   **When** the user confirms the prompt is done,
   **Then** the prompt is marked complete via the orchestrator-recorded mechanism (added to `completed` array in config.json).

**Scope Boundary**: Does NOT cover: pre-execution preview of file changes (US-6.3). Does NOT cover: prompt content itself — this is engine-level execution.

**Data/State Requirements**:
- Prompt content loaded via `scripts/resolve-prompt.sh`
- `$ARGUMENTS` is the only substitution variable
- Prompts execute one at a time, sequentially

**UI/UX Notes**: After each prompt, user must confirm before the next one runs.

**PRD Trace**: F-PE-4

---

### US-2.6: Verify Predecessor Artifacts Before Prompt Execution

**As** the pipeline engine, **I need to** check that predecessor prompts' output artifacts exist before running a prompt, **so that** prompts don't run against incomplete inputs.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the `coding-standards` prompt depends on `tech-stack`, and `tech-stack` has `produces: ["docs/tech-stack.md"]`,
   **When** `scripts/check-artifacts.sh` runs before `coding-standards`,
   **Then** it checks that `docs/tech-stack.md` exists.

2. **Given** `docs/tech-stack.md` is missing,
   **When** the artifact check fails,
   **Then** Scaffold shows:
   ```
   Prompt `coding-standards` expects `docs/tech-stack.md` (from `tech-stack`), but it's missing.
   ```
   With `AskUserQuestion` options: **Run tech-stack first** / **Proceed anyway** / **Cancel**

3. **Given** the user selects "Run tech-stack first",
   **When** `tech-stack` completes,
   **Then** Scaffold returns to execute `coding-standards`.

4. **Given** the user selects "Proceed anyway",
   **When** execution continues,
   **Then** the prompt runs without the missing artifact — handling missing inputs is the prompt's responsibility.

5. **Given** a predecessor prompt was skipped (in the `skipped` array),
   **When** artifact verification runs,
   **Then** the skipped prompt's artifacts are NOT required — the skip was intentional.

6. **Given** the user selects "Cancel",
   **When** the flow stops,
   **Then** no state changes — the prompt remains pending.

**Scope Boundary**: Does NOT cover: which artifacts each prompt produces — that's frontmatter metadata (US-5.1).

**Data/State Requirements**:
- Input: Predecessor prompts' `produces` fields from frontmatter
- Input: `skipped` array from `.scaffold/config.json`
- Script: `scripts/check-artifacts.sh`
- Test: `tests/check-artifacts.bats`

**UI/UX Notes**: `AskUserQuestion` with 3 options: **Run \<prompt\> first** / **Proceed anyway** / **Cancel**

**PRD Trace**: F-PE-5

---

### US-2.7: Pipeline Context Accumulation

**As** the pipeline engine, **I want** prompts to share structured data across sessions via a context file, **so that** later prompts can reference earlier decisions programmatically.

**Priority**: Should-have

**Acceptance Criteria**:

1. **Given** `/scaffold:init` creates the pipeline,
   **When** `.scaffold/context.json` is created,
   **Then** it contains an empty JSON object: `{}`.

2. **Given** the `tech-stack` prompt runs and writes context,
   **When** it updates `.scaffold/context.json`,
   **Then** the file contains:
   ```json
   {
     "tech-stack": {
       "language": "TypeScript",
       "framework": "Next.js",
       "test-runner": "Vitest"
     }
   }
   ```

3. **Given** the `coding-standards` prompt runs after `tech-stack`,
   **When** it reads `.scaffold/context.json`,
   **Then** it can access `tech-stack.language` to tailor its output.

4. **Given** `.scaffold/context.json` doesn't exist when a prompt tries to read it,
   **When** the read is attempted,
   **Then** the prompt sees an empty object `{}` — this is not an error.

5. **Given** a prompt writes to its own namespace (`"tech-stack"`),
   **When** it overwrites its own keys,
   **Then** the overwrite succeeds. A prompt cannot overwrite another prompt's namespace.

**Scope Boundary**: Does NOT cover: if this feature is deferred, prompts read predecessor output files directly (same as v1). This story is only implemented if F-PE-3 ships in v2.0.

**Data/State Requirements**:
- File: `.scaffold/context.json`
- Format: Top-level keys are prompt namespaces, values are objects
- Deleted by `scaffold reset` (US-3.6)

**PRD Trace**: F-PE-3

---

### US-2.8: Decision Log

**As** Alex, **I want** key decisions from each prompt to be logged persistently, **so that** future sessions and agents have cross-session context.

**Priority**: Should-have

**Acceptance Criteria**:

1. **Given** `/scaffold:init` creates the pipeline,
   **When** `.scaffold/decisions.json` is created,
   **Then** it contains an empty JSON array: `[]`.

2. **Given** the `tech-stack` prompt finishes and records a decision,
   **When** the decision is appended,
   **Then** `.scaffold/decisions.json` contains:
   ```json
   [
     { "prompt": "tech-stack", "decision": "Chose Vitest over Jest for speed", "at": "2026-02-17T10:40:00Z" }
   ]
   ```

3. **Given** `.scaffold/decisions.json` already has entries,
   **When** a new prompt appends decisions,
   **Then** existing entries are preserved — the log is append-only.

4. **Given** the `coding-standards` prompt reads the decision log,
   **When** it checks decisions from `tech-stack`,
   **Then** it can reference the Vitest decision to tailor coding standards.

5. **Given** `scaffold reset` runs (US-3.6),
   **When** state files are deleted,
   **Then** `.scaffold/decisions.json` is deleted.

6. **Given** `.scaffold/decisions.json` contains decisions from `tech-stack` and `coding-standards`,
   **When** `tdd` is about to execute (which depends on `coding-standards`),
   **Then** Scaffold displays relevant prior decisions before the prompt runs:
   ```
   Relevant decisions from prior prompts:
     • Chose Vitest over Jest for speed (tech-stack)
     • Adopted strict TypeScript with no-any rule (coding-standards)
   ```
   This gives Claude cross-session context automatically. Only decisions from direct and transitive dependencies are shown.

**Scope Boundary**: Does NOT cover: decision log entries are never modified or deleted except by reset. Each prompt optionally records 1–3 decisions.

**Data/State Requirements**:
- File: `.scaffold/decisions.json`
- Format: JSON array of `{ prompt, decision, at }` objects
- Committed to git

**PRD Trace**: F-PE-6

---

## Epic 3: Pipeline Navigation

Covers: F-UX-2, F-UX-4, F-UX-5, F-UX-6, F-UX-9, F-UX-11, Flow 2

### US-3.1: Resume Pipeline from Where It Left Off

**As** Alex, **I want to** continue my pipeline in a new Claude Code session, **so that** I don't have to remember which prompt I was on.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** `.scaffold/config.json` exists with `completed` showing 8 of 18 prompts done,
   **When** the user runs `/scaffold:resume`,
   **Then** Scaffold displays: "Pipeline progress: 8/18 prompts complete. Next: `dev-env-setup`. Run it now?"

2. **Given** the user confirms,
   **When** Scaffold executes `dev-env-setup`,
   **Then** the prompt runs in the current session with proper context.

3. **Given** all prompts are complete (18/18),
   **When** the user runs `/scaffold:resume`,
   **Then** Scaffold shows a completion summary:
   ```
   Pipeline complete (18/18). Profile: web-app.

   Artifacts created:
     docs/plan.md, docs/tech-stack.md, docs/coding-standards.md, ...
   Decisions logged: 12 (see .scaffold/decisions.json)
   Total time: 1h 23m (from init to last prompt)

   Next steps:
     /scaffold:new-enhancement — Add features
     /scaffold:single-agent-start — Begin implementation
   ```
   **Computation rules**: Artifact list = union of all completed prompts' `produces` fields. Decisions count = length of `.scaffold/decisions.json` array. Total time = last entry in `completed` array `.at` timestamp minus `config.json` `.created` timestamp, formatted as hours and minutes.

4. **Given** `.scaffold/config.json` doesn't exist,
   **When** the user runs `/scaffold:resume`,
   **Then** Scaffold shows: "No pipeline found. Run `/scaffold:init` to start."

5. **Given** config.json fails to parse (corrupt from session crash),
   **When** `resume` loads the config,
   **Then** it falls back to artifact-based completion detection (US-2.4), regenerates config.json from detected state, and reports what it found.

6. **Given** the user manually edited `.scaffold/config.json` between sessions (e.g., added prompts to `extra-prompts`, modified `completed` entries),
   **When** `resume` loads the config,
   **Then** Scaffold validates the modified config:
   - If `extra-prompts` references a prompt name with no file at any tier, reports: "Extra prompt `X` not found at .scaffold/prompts/X.md, ~/.scaffold/prompts/X.md, or built-in commands/X.md. Remove it from extra-prompts or create the prompt file."
   - If `completed` contains entries for prompt names not in the `prompts` array, ignores them silently.
   - If `prompts` array was modified (prompts added/removed), re-resolves dependencies for the updated list and reports any errors.

7. **Given** config.json has `scaffold-version` indicating a newer format than the running Scaffold version (e.g., config says `"3.0.0"` but Scaffold is `"2.0.0"`),
   **When** `resume` loads the config,
   **Then** Scaffold warns: "This config was created by Scaffold v3.0.0. You are running v2.0.0. Proceeding — some features may not be available." and continues operating.

**Scope Boundary**: Does NOT cover: `--from` flag (US-3.2), prompt execution mechanics (US-2.5).

**Data/State Requirements**:
- Input: `.scaffold/config.json` (`completed`, `prompts`, `skipped` arrays)
- Next prompt = first entry in `prompts` that is not in `completed` or `skipped`

**PRD Trace**: F-UX-2, Flow 2

---

### US-3.2: Resume from a Specific Prompt

**As** Alex, **I want to** re-run a specific prompt that I've already completed, **so that** I can update its outputs without resetting the whole pipeline.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** `coding-standards` is in the `completed` array,
   **When** the user runs `/scaffold:resume --from coding-standards`,
   **Then** Scaffold warns: "This will re-run `coding-standards` and may overwrite `docs/coding-standards.md`. Proceed?"

2. **Given** the user confirms,
   **When** `coding-standards` re-runs and completes,
   **Then** its completion entry in `completed` is replaced with the new timestamp (not duplicated).

3. **Given** `coding-standards` completes via `--from`,
   **When** `resume` continues,
   **Then** it picks up the next uncompleted prompt in normal pipeline order — downstream prompts are NOT automatically re-run.

4. **Given** the user runs `--from` with a prompt name that doesn't exist in the pipeline,
   **When** Scaffold checks the name,
   **Then** it shows: "Prompt `nonexistent` is not in this pipeline. Available prompts: [list]."

**Scope Boundary**: Does NOT cover: re-running all downstream prompts — that's explicitly out of scope per PRD. Each prompt must be `--from`'d individually.

**Data/State Requirements**:
- Input: `--from <prompt-name>` parsed from `$ARGUMENTS`
- Validates prompt name exists in `config.json` `prompts` array

**UI/UX Notes**: Warning before re-run mentions which files may be overwritten (from `produces` field).

**PRD Trace**: F-UX-2 (`--from`), Flow 2 error cases

---

### US-3.3: Display Pipeline Progress After Prompt Completion

**As** Sam, **I want to** see my progress after each prompt completes, **so that** I know how far along I am and what's next.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the `tech-stack` prompt just completed (prompt 4 of 18),
   **When** Scaffold shows progress,
   **Then** the output format matches the PRD-specified ASCII format:
   ```
   Pipeline: web-app (4/18 complete)
   Phase 2 — Project Foundation
   ✓ create-prd
   ✓ prd-gap-analysis
   ✓ beads
   ✓ tech-stack
   → claude-code-permissions (next)
     coding-standards
     tdd
     project-structure
     ...
   ```
   Specifically: completed prompts use `✓`, the next prompt uses `→` with `(next)`, pending prompts are indented with 2 spaces, and prompts are grouped under phase headers in the format `Phase N — Phase Name`.

2. **Given** a prompt was skipped,
   **When** progress is displayed,
   **Then** it shows as: `⊘ design-system (skipped)`

3. **Given** the progress is displayed after a prompt completes,
   **When** Scaffold identifies the next prompt,
   **Then** it shows elapsed time and asks: "Prompt `tech-stack` complete (3m 42s). Next: `claude-code-permissions`. Run it now?" Elapsed time is calculated from the prompt's start to its completion timestamp.

4. **Given** the initial pipeline display during `init` (before any prompts are run),
   **When** Scaffold shows the resolved pipeline,
   **Then** the format is:
   ```
   Scaffold pipeline for profile "web-app" (18 prompts):

   Phase 1 — Product Definition
     1. create-prd
     2. prd-gap-analysis
   ...
   ```
   With numbered prompts grouped by phase.

**Scope Boundary**: Does NOT cover: `scaffold status` (US-3.4) — status shows the same format but without the "Run it now?" prompt.

**Data/State Requirements**:
- `completed`, `skipped`, and `prompts` arrays from config.json
- Prompt `phase` values from frontmatter for grouping

**PRD Trace**: F-UX-4

---

### US-3.4: Show Pipeline Status Without Executing

**As** Alex, **I want to** quickly check where I am in the pipeline without being asked to run anything, **so that** I can orient myself before deciding what to do.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** `.scaffold/config.json` exists with 8/18 complete,
   **When** the user runs `/scaffold:status`,
   **Then** Scaffold displays the same progress format as US-3.3 but WITHOUT the "Run it now?" prompt.

2. **Given** `.scaffold/config.json` doesn't exist,
   **When** the user runs `/scaffold:status`,
   **Then** Scaffold shows: "No pipeline found. Run `/scaffold:init` to start."

3. **Given** all prompts are complete,
   **When** the user runs `/scaffold:status`,
   **Then** Scaffold shows: "Pipeline complete (18/18). Profile: web-app."

4. **Given** some prompts are skipped,
   **When** status is displayed,
   **Then** skipped prompts show as: `⊘ design-system (skipped)`.

**Scope Boundary**: Does NOT modify any state. Read-only command.

**Data/State Requirements**:
- Input: `.scaffold/config.json` (read-only)

**PRD Trace**: F-UX-5

---

### US-3.5: Skip a Prompt Mid-Pipeline

**As** Alex, **I want to** skip a prompt that doesn't apply to my project, **so that** the pipeline advances without running it.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** `design-system` is the next pending prompt,
   **When** the user runs `/scaffold:skip design-system`,
   **Then** Scaffold prompts via `AskUserQuestion`: "Skip `design-system`?" with options:
   - **Skip without reason** — records skip with empty reason
   - **Skip with reason** — user provides reason via "Other" free-text input
   If the `AskUserQuestion` interaction is interrupted, no state change occurs.

2. **Given** the user selects either option (with or without reason),
   **When** the skip is recorded,
   **Then** `.scaffold/config.json` `skipped` array contains:
   ```json
   { "prompt": "design-system", "at": "2026-02-17T11:00:00Z", "reason": "No frontend design needed" }
   ```

3. **Given** `design-system` is skipped,
   **When** a downstream prompt (`add-playwright`) depends on it,
   **Then** the downstream prompt can still run — skipped prompts are treated as "done" for dependency resolution.

4. **Given** `create-prd` is already in the `completed` array,
   **When** the user tries `/scaffold:skip create-prd`,
   **Then** Scaffold shows: "Cannot skip `create-prd` — it's already completed. Use `/scaffold:resume --from create-prd` to re-run it."

5. **Given** only one prompt remains in the pipeline,
   **When** the user tries to skip it,
   **Then** Scaffold shows: "Cannot skip the last remaining prompt. Just run it to complete the pipeline."

6. **Given** a prompt was previously skipped,
   **When** the user runs `/scaffold:resume --from design-system`,
   **Then** the prompt is removed from `skipped` and executed — effectively un-skipping it.

**Scope Boundary**: Does NOT cover: skipping multiple prompts at once. One skip per command invocation.

**Data/State Requirements**:
- File: `.scaffold/config.json` — `skipped` array
- Reason is optional (empty string if not provided)

**UI/UX Notes**: `AskUserQuestion` with text input for skip reason. The reason is stored but not enforced.

**PRD Trace**: F-UX-6

---

### US-3.6: Reset Pipeline State Preserving Customizations

**As** Alex, **I want to** start my pipeline over without losing my custom prompts and profiles, **so that** I can change my approach without recreating customizations.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** `.scaffold/config.json` exists,
   **When** the user runs `/scaffold:reset`,
   **Then** Scaffold shows:
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

2. **Given** the user confirms,
   **When** reset executes,
   **Then** only `config.json`, `context.json`, and `decisions.json` are deleted. The `.scaffold/prompts/` and `.scaffold/profiles/` directories (and their contents) are untouched.

3. **Given** the user declines,
   **When** no action is taken,
   **Then** all files remain unchanged.

4. **Given** `.scaffold/config.json` does NOT exist,
   **When** the user runs `/scaffold:reset`,
   **Then** Scaffold shows: "No pipeline state to reset."

**Scope Boundary**: Does NOT cover: re-running init after reset (user must run `/scaffold:init` separately). Does NOT cover: `--force` init (US-1.4) — that combines reset + init in one flow.

**Data/State Requirements**:
- Deleted: `.scaffold/config.json`, `.scaffold/context.json`, `.scaffold/decisions.json`
- Preserved: `.scaffold/prompts/`, `.scaffold/profiles/`

**UI/UX Notes**: Confirmation via `AskUserQuestion` with options: **Yes, reset** / **Cancel**

**PRD Trace**: F-UX-9

---

### US-3.7: Show Next Eligible Prompt Without Executing

**As** Alex, **I want to** see what's next in the pipeline without committing to run it, **so that** I can decide if I'm ready.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the pipeline has 8/18 prompts complete and `dev-env-setup` is next,
   **When** the user runs `/scaffold:next`,
   **Then** Scaffold shows context-rich information about the next prompt:
   ```
   Next: dev-env-setup (prompt 9/18)
   Description: Set up local dev environment with live reload
   Produces: docs/dev-setup.md, Makefile
   Reads: docs/project-structure.md, docs/tech-stack.md
   Source: [built-in]
   ```
   The `Reads` field shows which predecessor artifacts will feed into this prompt, and `Source` shows which tier the prompt resolves from.

2. **Given** multiple prompts are eligible (all dependencies satisfied within a phase),
   **When** `next` runs,
   **Then** all eligible prompts are listed.

3. **Given** all prompts are complete,
   **When** the user runs `/scaffold:next`,
   **Then** Scaffold shows: "Pipeline complete. All prompts have been executed."

4. **Given** `.scaffold/config.json` doesn't exist,
   **When** the user runs `/scaffold:next`,
   **Then** Scaffold shows: "No pipeline found. Run `/scaffold:init` to start."

**Scope Boundary**: Does NOT modify any state. Does NOT offer to execute prompts. Read-only.

**Data/State Requirements**:
- Input: `.scaffold/config.json` + prompt frontmatter (`description`, `produces`, `reads`)

**PRD Trace**: F-UX-11

---

## Epic 4: Profile System

Covers: F-PR-1, F-PR-2, F-PR-3, Flow 4

### US-4.1: Resolve Built-in Profile to Prompt List

**As** the pipeline engine, **I need to** resolve a built-in profile name to its ordered prompt list, **so that** init can create the pipeline.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the profile name `web-app`,
   **When** `scripts/resolve-profile.sh web-app` runs,
   **Then** it outputs the prompt list:
   ```json
   ["create-prd", "prd-gap-analysis", "beads", "tech-stack", "claude-code-permissions", "coding-standards", "tdd", "project-structure", "dev-env-setup", "design-system", "git-workflow", "add-playwright", "user-stories", "user-stories-gaps", "claude-md-optimization", "workflow-audit", "implementation-plan", "implementation-plan-review"]
   ```

2. **Given** the profile name `cli-tool`,
   **When** resolution runs,
   **Then** it outputs 16 prompts (excludes: design-system, add-playwright, add-maestro, multi-model-review, platform-parity-review).

3. **Given** the profile name `mobile`,
   **When** resolution runs,
   **Then** it outputs 18 prompts including `add-maestro` (not `add-playwright`).

4. **Given** the profile name `api-service`,
   **When** resolution runs,
   **Then** it outputs the same 16 prompts as `cli-tool`.

5. **Given** the profile name `minimal`,
   **When** resolution runs,
   **Then** it outputs 10 prompts: create-prd, beads, tech-stack, coding-standards, tdd, project-structure, dev-env-setup, git-workflow, user-stories, implementation-plan.

6. **Given** an unknown profile name `nonexistent`,
   **When** resolution runs,
   **Then** it exits with code 1 and reports: "Profile `nonexistent` not found. Available profiles: web-app, cli-tool, mobile, api-service, minimal."

**Scope Boundary**: Does NOT cover: custom profiles (US-4.2), profile inheritance (US-4.4). Built-in profiles are read-only.

**Data/State Requirements**:
- Built-in profile definitions (hardcoded in Scaffold plugin code or data file)
- Script: `scripts/resolve-profile.sh`
- Test: `tests/resolve-profile.bats`

**PRD Trace**: F-PR-1

---

### US-4.2: Create and Use a Project-Level Custom Profile

**As** Jordan, **I want to** create a custom profile for my team, **so that** every team member uses the same pipeline configuration.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** Jordan creates `.scaffold/profiles/healthtech-api.json`:
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
   **When** another team member runs `/scaffold:init` in the same project,
   **Then** "healthtech-api" appears as an option alongside built-in profiles.

2. **Given** the user selects "healthtech-api",
   **When** profile resolution runs,
   **Then** the resolved prompt list includes all `api-service` prompts plus `security-audit` and `compliance-check`.

3. **Given** `prompt-overrides` maps `create-prd` to a custom file,
   **When** `create-prd` executes,
   **Then** Scaffold loads `.scaffold/prompts/create-prd-healthtech.md` instead of the built-in.

**Scope Boundary**: Does NOT cover: user-level profiles at `~/.scaffold/profiles/` (same mechanism, different location). Does NOT cover: profile creation wizard — profiles are JSON files created manually.

**Data/State Requirements**:
- File: `.scaffold/profiles/<name>.json`
- Required fields: `name`, either `extends` or `prompts`
- Optional fields: `description`, `add-prompts`, `remove-prompts`, `prompt-overrides`

**PRD Trace**: F-PR-2, Flow 4

---

### US-4.3: Extend a Profile with Add/Remove Prompts

**As** Jordan, **I want to** extend a built-in profile by adding and removing specific prompts, **so that** I don't have to re-list all the prompts.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** a profile extends `web-app` with `add-prompts: ["security-audit"]` and `remove-prompts: ["design-system"]`,
   **When** profile resolution runs,
   **Then** the resolved list has 18 prompts: web-app's 18 minus design-system plus security-audit.

2. **Given** both `add-prompts` and `remove-prompts` are specified,
   **When** resolution applies them,
   **Then** adds happen first, then removes — this allows adding a prompt and removing one of the inherited prompts in a single profile.

3. **Given** `remove-prompts` includes a prompt that an `add-prompts` entry depends on,
   **When** resolution runs,
   **Then** the dependency conflict is surfaced: "`security-audit` depends on `coding-standards`. Cannot remove `coding-standards` from the profile."

**Scope Boundary**: Does NOT cover: `prompt-overrides` (US-4.2 handles that). Does NOT cover: creating a profile without `extends` — that requires a full `prompts` array.

**Data/State Requirements**:
- Profile JSON: `extends`, `add-prompts`, `remove-prompts`
- Resolution: inherit → add → remove → validate dependencies

**PRD Trace**: F-PR-2, F-PR-3

---

### US-4.4: Profile Inheritance Chain Resolution

**As** the pipeline engine, **I need to** resolve profile inheritance chains up to 3 levels deep, **so that** teams can create layered profile hierarchies.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** profile chain: `healthtech-api` extends `api-service` extends `minimal` (if `api-service` extended `minimal`),
   **When** `scripts/resolve-profile.sh healthtech-api` runs,
   **Then** it resolves the full chain: start with `minimal`'s prompts → apply `api-service`'s add/remove → apply `healthtech-api`'s add/remove.

2. **Given** a chain of depth 4 (A extends B extends C extends D),
   **When** resolution runs,
   **Then** it rejects with: "Profile inheritance is limited to 3 levels. Flatten the chain by copying prompts from intermediate profiles."

3. **Given** circular inheritance (A extends B, B extends A),
   **When** resolution runs,
   **Then** it detects and rejects: "Circular profile inheritance: A → B → A."

4. **Given** a profile's `extends` references a non-existent profile,
   **When** resolution runs,
   **Then** it reports: "Profile `healthtech-api` extends `nonexistent`, but `nonexistent` was not found. Available profiles: web-app, cli-tool, mobile, api-service, minimal."

**Scope Boundary**: Does NOT cover: more than 3 levels of inheritance — rejected by design.

**Data/State Requirements**:
- Script: `scripts/resolve-profile.sh`
- Test: `tests/resolve-profile.bats`

**PRD Trace**: F-PR-3

---

### US-4.5: Profile Discovery and Precedence

**As** the pipeline engine, **I need to** discover profiles from all locations with correct precedence, **so that** project-level profiles override user-level profiles.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** profiles exist at:
   - Built-in: `web-app`, `cli-tool`, `mobile`, `api-service`, `minimal`
   - Project-level: `.scaffold/profiles/team-api.json`
   - User-level: `~/.scaffold/profiles/my-api.json`
   **When** profile discovery runs during init,
   **Then** all profiles are available for selection.

2. **Given** a project-level profile and a user-level profile share the name `custom-api`,
   **When** discovery resolves the conflict,
   **Then** the project-level profile (`.scaffold/profiles/custom-api.json`) takes precedence.

3. **Given** profiles are discovered,
   **When** the selection UI is presented,
   **Then** built-in profiles appear first, followed by custom profiles alphabetically.

**Scope Boundary**: Does NOT cover: profile selection UX (US-1.1 handles that).

**Data/State Requirements**:
- Discovery order: built-in → project-level (`.scaffold/profiles/`) → user-level (`~/.scaffold/profiles/`)
- Precedence: project-level > user-level for same-name profiles

**PRD Trace**: F-UX-1 (profile discovery), F-PR-2

---

## Epic 5: Prompt System

Covers: F-PS-1, F-PS-2, F-PS-3, Flow 3

### US-5.1: Parse Prompt Frontmatter Fields

**As** the pipeline engine, **I need to** parse YAML frontmatter from prompt files, **so that** I can resolve dependencies, phases, and artifact metadata.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** a command file `commands/tech-stack.md` with frontmatter:
   ```yaml
   ---
   description: "Research and document tech stack decisions"
   depends-on: [create-prd, beads]
   phase: 2
   produces: ["docs/tech-stack.md"]
   reads: ["docs/plan.md"]
   argument-hint: "<tech constraints or preferences>"
   ---
   ```
   **When** `scripts/validate-frontmatter.sh` parses the file,
   **Then** it extracts all 6 fields correctly.

2. **Given** a custom prompt with only `description` in frontmatter (all other fields omitted),
   **When** parsing runs,
   **Then** defaults are applied:
   - `depends-on`: `[]` (no dependencies)
   - `phase`: `1` (if no dependencies) or `max(phase of each dependency)` — the highest phase number among all dependencies, ensuring the prompt appears in a phase at or after all its prerequisites
   - `produces`: `[]` (no artifact detection)
   - `reads`: `[]` (no auto-loading)
   - `argument-hint`: `""` (no hint)

3. **Given** a prompt file with invalid frontmatter (malformed YAML),
   **When** parsing runs,
   **Then** the script exits with code 1 and reports: "`.scaffold/prompts/security-audit.md` has invalid frontmatter: [specific YAML error]."

4. **Given** `depends-on` contains a value that is not an array,
   **When** validation runs,
   **Then** it reports: "`depends-on` must be an array of prompt names."

**Scope Boundary**: Does NOT cover: frontmatter content semantics (e.g., whether listed dependencies exist). That's dependency resolution (US-2.1, US-2.2).

**Data/State Requirements**:
- Script: `scripts/validate-frontmatter.sh`
- Test: `tests/validate-frontmatter.bats`
- YAML parsing via `sed`-based extraction or `python3 -c "import yaml"` fallback

**PRD Trace**: F-PS-1

---

### US-5.2: Resolve Prompt via 4-Tier Precedence

**As** the pipeline engine, **I need to** find the correct prompt file by checking 4 locations in precedence order, **so that** overrides work correctly.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the active profile maps `create-prd` to `.scaffold/prompts/create-prd-custom.md` via `prompt-overrides`,
   **When** `scripts/resolve-prompt.sh create-prd` runs,
   **Then** it returns `.scaffold/prompts/create-prd-custom.md` (Tier 1: profile override).

2. **Given** no profile override exists but `.scaffold/prompts/create-prd.md` exists,
   **When** resolution runs,
   **Then** it returns `.scaffold/prompts/create-prd.md` (Tier 2: project-level).

3. **Given** no project-level override exists but `~/.scaffold/prompts/create-prd.md` exists,
   **When** resolution runs,
   **Then** it returns `~/.scaffold/prompts/create-prd.md` (Tier 3: user-level).

4. **Given** no overrides exist at any tier,
   **When** resolution runs,
   **Then** it returns `commands/create-prd.md` from the plugin directory (Tier 4: built-in).

5. **Given** a profile override points to a non-existent file,
   **When** resolution runs,
   **Then** it exits with code 1 and reports: "Profile `web-app` overrides prompt `create-prd` with path `.scaffold/prompts/custom.md`, but that file does not exist."

6. **Given** resolution finds the prompt at Tier 2 (project-level),
   **When** the prompt is loaded,
   **Then** Scaffold logs: "Using project override for `create-prd` (.scaffold/prompts/create-prd.md)."

**Scope Boundary**: Does NOT cover: loading and executing the prompt content (US-2.5). This story resolves the file path only.

**Data/State Requirements**:
- Input: Prompt name, profile `resolved-overrides` from config.json
- Output: Absolute file path to stdout
- Script: `scripts/resolve-prompt.sh`
- Test: `tests/resolve-prompt.bats`

**PRD Trace**: F-PS-2

---

### US-5.3: Add a Custom Prompt to the Pipeline

**As** Jordan, **I want to** add a custom prompt that doesn't exist in the built-in set, **so that** my team's pipeline includes domain-specific steps.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** Jordan creates `.scaffold/prompts/security-audit.md` with frontmatter:
   ```yaml
   ---
   description: "Run security audit against OWASP top 10"
   depends-on: [coding-standards, tdd]
   phase: 6
   ---
   ```
   **When** the prompt is added to a profile via `add-prompts: ["security-audit"]`,
   **Then** `security-audit` appears in the resolved pipeline at Phase 6, after `coding-standards` and `tdd`.

2. **Given** a custom prompt is added via `extra-prompts` in `.scaffold/config.json`,
   **When** the pipeline resolves,
   **Then** the custom prompt is included alongside profile prompts.

3. **Given** a `.md` file exists in `.scaffold/prompts/` but is NOT referenced by any profile or `extra-prompts`,
   **When** the pipeline resolves,
   **Then** the prompt is NOT auto-included. Simply placing a file does NOT add it to the pipeline.

**Scope Boundary**: Does NOT cover: validating custom prompt content quality — Scaffold trusts user content. Does NOT cover: custom prompts depending on built-in prompts — that's standard dependency resolution (US-2.1).

**Data/State Requirements**:
- Custom prompt location: `.scaffold/prompts/<name>.md` or `~/.scaffold/prompts/<name>.md`
- Naming: lowercase, hyphenated, no `.md` in references
- Must be referenced by `add-prompts` in a profile or `extra-prompts` in config

**PRD Trace**: F-PS-3, Flow 3

---

### US-5.4: Override a Built-in Prompt at Project Level

**As** Alex, **I want to** replace a built-in prompt with my own version, **so that** I can customize specific pipeline steps without forking Scaffold.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** Alex creates `.scaffold/prompts/create-prd.md` with custom content,
   **When** the pipeline runs `create-prd`,
   **Then** Scaffold uses the project-level version instead of the built-in and logs: "Using project override for `create-prd` (.scaffold/prompts/create-prd.md)."

2. **Given** the override file has valid frontmatter with different `depends-on`,
   **When** dependency resolution runs,
   **Then** the override's `depends-on` is used (not the built-in's).

3. **Given** the override file has no frontmatter,
   **When** dependency resolution runs,
   **Then** it inherits `depends-on` and `phase` from the built-in prompt it overrides (US-5.5).

**Scope Boundary**: Does NOT cover: Scaffold does not validate prompt content quality — overrides are used as-is.

**Data/State Requirements**:
- File: `.scaffold/prompts/<name>.md` — same name as built-in
- Precedence: profile override > project-level > user-level > built-in

**PRD Trace**: F-PS-2, Flow 3

---

### US-5.5: Custom Prompt Inherits Metadata from Built-in

**As** Alex, **I want** my custom prompt override to inherit dependency/phase metadata from the built-in if I don't specify frontmatter, **so that** I can customize content without re-declaring metadata.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** `.scaffold/prompts/coding-standards.md` exists with NO frontmatter,
   **When** dependency resolution processes it,
   **Then** it inherits `depends-on: [tech-stack]` and `phase: 2` from the built-in `commands/coding-standards.md`.

2. **Given** `.scaffold/prompts/coding-standards.md` has frontmatter with `depends-on: [tech-stack, tdd]`,
   **When** resolution processes it,
   **Then** the override's `depends-on` is used, not the built-in's.

3. **Given** a completely new custom prompt (no matching built-in) with no frontmatter,
   **When** resolution processes it,
   **Then** it has no dependencies and defaults to Phase 1.

**Scope Boundary**: Does NOT cover: inheriting prompt body content — only metadata (frontmatter fields) is inherited.

**Data/State Requirements**:
- Fallback lookup: if custom prompt lacks frontmatter, check for matching built-in at `commands/<name>.md`

**PRD Trace**: F-PS-2 (custom prompt without frontmatter inherits built-in metadata)

---

## Epic 6: Validation & Preview

Covers: F-UX-3, F-UX-8, Flow 5

### US-6.1: Dry Run to Preview Resolved Pipeline

**As** Alex, **I want to** preview what the pipeline would look like for a profile before committing, **so that** I can evaluate profiles without creating any files.

**Priority**: Should-have

**Acceptance Criteria**:

1. **Given** the user runs `/scaffold:init --dry-run` and selects the `web-app` profile,
   **When** Scaffold resolves the pipeline,
   **Then** it displays:
   - Complete prompt list with ordering and phases
   - Each prompt's source: `[built-in]`, `[project override]`, `[user override]`, or `[profile override]`
   - Expected output artifacts from `produces` fields
   - Total prompt count and phase count

2. **Given** the dry run completes,
   **When** the user checks the filesystem,
   **Then** NO `.scaffold/` directory or files were created.

3. **Given** the profile has resolution errors (missing deps, circular refs),
   **When** dry run displays the pipeline,
   **Then** errors are shown inline next to affected prompts — dry run is useful for debugging.

4. **Given** the user runs `/scaffold:preview web-app` (alternative syntax),
   **When** Scaffold resolves,
   **Then** it shows the same output as `--dry-run` for the `web-app` profile.

**Scope Boundary**: Does NOT cover: actually creating the pipeline or executing prompts. Read-only. Can be run outside a project directory to preview built-in profiles.

**Data/State Requirements**:
- No file writes
- Profile resolution + dependency resolution + prompt metadata

**PRD Trace**: F-UX-3, Flow 5

---

### US-6.2: Validate Profiles and Prompts for Errors

**As** Jordan, **I want to** validate my custom profiles and prompts before sharing them with the team, **so that** I catch configuration errors early.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** the user runs `/scaffold:validate`,
   **When** validation runs on all profiles and prompts in the project,
   **Then** it performs all 7 checks:
   1. All profiles in `.scaffold/profiles/` and `~/.scaffold/profiles/` parse as valid JSON with required fields.
   2. All `extends` references resolve to existing profiles (no missing parents, no circular inheritance).
   3. All prompt names in profiles (`prompts`, `add-prompts`, `remove-prompts`, `prompt-overrides`) resolve to files at some tier.
   4. All `prompt-overrides` file paths point to existing files.
   5. All prompt files in `.scaffold/prompts/` have valid YAML frontmatter (if present).
   6. All `depends-on` references resolve to prompt names in the pipeline.
   7. No circular dependencies in the dependency graph.

2. **Given** all checks pass,
   **When** validation completes,
   **Then** output is: "All profiles and prompts are valid."

3. **Given** errors exist,
   **When** validation completes,
   **Then** errors are grouped by source file with actionable fix suggestions:
   ```
   .scaffold/profiles/healthtech-api.json:
     - extends: "nonexistent" — profile not found. Available: web-app, cli-tool, mobile, api-service, minimal
   .scaffold/prompts/security-audit.md:
     - depends-on: "missing-prompt" — prompt not in pipeline. Fix: add it to your profile's add-prompts or remove the dependency
   ```

4. **Given** the user runs `/scaffold:validate healthtech-api`,
   **When** validation runs,
   **Then** only the `healthtech-api` profile is validated (not all profiles).

5. **Given** validation runs,
   **When** it completes,
   **Then** no files are created or modified.

**Scope Boundary**: Does NOT cover: prompt content quality validation. Does NOT cover: running prompts to verify outputs.

**Data/State Requirements**:
- Scans: `.scaffold/profiles/`, `~/.scaffold/profiles/`, `.scaffold/prompts/`, `~/.scaffold/prompts/`, `commands/`
- Script: `scripts/validate-config.sh` (for JSON validation), `scripts/validate-frontmatter.sh` (for YAML)

**PRD Trace**: F-UX-8

---

### US-6.3: Pre-Execution Preview of File Changes

**As** Sam, **I want to** see which files will be created or updated before a prompt runs, **so that** I know what to expect.

**Priority**: Should-have

**Acceptance Criteria**:

1. **Given** the `tech-stack` prompt has `produces: ["docs/tech-stack.md"]`,
   **When** Scaffold prepares to execute it and `docs/tech-stack.md` does not exist,
   **Then** it shows: "This prompt will: **Create** `docs/tech-stack.md`. Proceed?"

2. **Given** the `coding-standards` prompt has `produces: ["docs/coding-standards.md"]`,
   **When** Scaffold prepares to execute it and `docs/coding-standards.md` already exists,
   **Then** it shows: "This prompt will: **Update** `docs/coding-standards.md`. Proceed?"

3. **Given** a prompt has multiple `produces` entries,
   **When** preview displays,
   **Then** each file shows its action: "This prompt will: Create `docs/plan.md`, Update `CLAUDE.md`. Proceed?"

4. **Given** the user confirms,
   **When** the prompt executes,
   **Then** actual file changes depend on Claude's execution — the preview is informational only.

**Scope Boundary**: Does NOT cover: actual file change tracking during execution. Preview is based on `produces` metadata, not actual prompt behavior.

**Data/State Requirements**:
- `produces` field from prompt frontmatter
- File existence checks for each path in `produces`

**UI/UX Notes**: User must confirm before execution proceeds. Preview appears before `$ARGUMENTS` substitution.

**PRD Trace**: F-PE-4 (pre-execution preview), F-UX-3

---

## Epic 7: Brownfield & Adoption

Covers: F-UX-10, F-UX-12, F-V1-1, Flow 6

### US-7.1: Detect Brownfield Project and Offer Mode Selection

**As** Alex, **I want** Scaffold to detect when I'm adding it to an existing codebase and adapt accordingly, **so that** prompts document what exists rather than creating from scratch.

**Priority**: Should-have

**Acceptance Criteria**:

1. **Given** the directory contains `package.json` with ≥1 dependency,
   **When** the user runs `/scaffold:init` (without `--brownfield`),
   **Then** Scaffold asks: "This directory has existing code. Would you like to scaffold around it (brownfield) or start fresh (greenfield)?"

2. **Given** the directory contains a `src/` or `lib/` directory with ≥1 source file,
   **When** init runs,
   **Then** the brownfield detection triggers the same question.

3. **Given** the user runs `/scaffold:init --brownfield` explicitly,
   **When** init proceeds,
   **Then** brownfield mode is set without prompting.

4. **Given** the user chooses brownfield mode,
   **When** config.json is created,
   **Then** it includes `"mode": "brownfield"`.

5. **Given** the user chooses greenfield (or F-UX-10 is not implemented),
   **When** config.json is created,
   **Then** it includes `"mode": "greenfield"` (the default).

6. **Given** other package manifests exist (`pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`) with ≥1 dependency,
   **When** detection runs,
   **Then** brownfield mode is offered.

**Scope Boundary**: Does NOT cover: prompt behavior changes in brownfield mode (US-7.2). This story covers only detection and config.

**Data/State Requirements**:
- Detection triggers: package manifests with dependencies, `src/` or `lib/` with source files
- Config field: `"mode": "brownfield"` or `"mode": "greenfield"`

**UI/UX Notes**: `AskUserQuestion` with options: **Brownfield (scaffold around existing code)** / **Greenfield (start fresh)**

**PRD Trace**: F-UX-10, Flow 1 (step 3)

---

### US-7.2: Adapt Prompts for Brownfield Mode

**As** Alex, **I want** brownfield-mode prompts to analyze my existing code and document it, **so that** I get accurate documentation instead of scaffolding templates.

**Priority**: Should-have

**Acceptance Criteria**:

1. **Given** `mode` is `"brownfield"` in config.json,
   **When** `create-prd` runs,
   **Then** it reads existing code, README, and config files to draft the PRD — asking the user to fill gaps.

2. **Given** brownfield mode,
   **When** `tech-stack` runs,
   **Then** it reads `package.json`/`tsconfig.json`/etc. and presents detected stack: "Detected: TypeScript, Next.js, Vitest, PostgreSQL. Correct?" User can override.

3. **Given** brownfield mode,
   **When** `project-structure` runs,
   **Then** it documents the existing directory structure rather than scaffolding a new one.

4. **Given** brownfield mode,
   **When** `dev-env-setup` runs,
   **Then** it documents existing dev commands (from `package.json` scripts, `Makefile`) rather than creating new ones.

5. **Given** brownfield mode,
   **When** `coding-standards` runs (or any non-adapted prompt),
   **Then** it runs normally — only 4 prompts have brownfield variants.

**Scope Boundary**: Does NOT cover: brownfield detection (US-7.1). Brownfield behavior is implemented as conditional sections within existing prompts, not separate files.

**Data/State Requirements**:
- Prompts detect mode by reading `.scaffold/config.json` `mode` field
- Only 4 prompts have brownfield variants: create-prd, tech-stack, project-structure, dev-env-setup

**PRD Trace**: F-UX-10 (brownfield pipeline adjustments)

---

### US-7.3: Detect v1 Project and Create v2 Configuration

**As** Alex, **I want** Scaffold to recognize my v1-scaffolded project and auto-create a v2 config, **so that** I can adopt v2 without re-running completed prompts.

**Priority**: Should-have

**Acceptance Criteria**:

1. **Given** a directory has `docs/plan.md`, `docs/tech-stack.md`, `.beads/`, but no `.scaffold/` directory,
   **When** the user runs `/scaffold:init`,
   **Then** Scaffold detects v1 artifacts and shows: "This project was scaffolded with Scaffold v1. I can create a v2 configuration based on what's already been done. No existing files will be modified."

2. **Given** the user confirms v1 detection,
   **When** Scaffold scans artifacts,
   **Then** it maps existing files to completed prompts using `produces` metadata:
   - `docs/plan.md` → `create-prd` marked complete
   - `docs/tech-stack.md` → `tech-stack` marked complete
   - `.beads/` → `beads` marked complete
   - etc.

3. **Given** artifact scanning is ambiguous for profile detection (e.g., `docs/design-system.md` exists but no Maestro config),
   **When** Scaffold can't determine the profile,
   **Then** it presents candidates via `AskUserQuestion`: "Detected artifacts suggest `web-app` or `cli-tool`. Which profile?"

4. **Given** scanning detects 14/18 artifacts,
   **When** config.json is created,
   **Then** it contains the inferred profile, 14 entries in `completed`, and suggests: "Detected 14/18 prompts already completed (profile: web-app). Next uncompleted: `claude-md-optimization`. Run `/scaffold:resume` to continue."

5. **Given** the user declines v1 detection,
   **When** init proceeds normally,
   **Then** config.json is created without marking anything complete — fresh pipeline.

6. **Given** partial v1 project (some artifacts exist, others don't),
   **When** detection runs,
   **Then** only prompts whose ALL `produces` artifacts exist are marked complete. No assumption of sequential completion.

**Scope Boundary**: Does NOT cover: modifying existing v1 artifacts — detection is read-only for project files.

**Data/State Requirements**:
- Detection: scan for files listed in built-in prompts' `produces` fields
- Config created: `.scaffold/config.json` with `completed` pre-populated
- Script: `scripts/detect-completion.sh` (reused from US-2.4)

**PRD Trace**: F-V1-1, Flow 6

---

### US-7.4: Adopt Existing Project with scaffold adopt

**As** Alex, **I want** a dedicated command to add Scaffold to a project that was never scaffolded, **so that** I get a tailored analysis of what already exists.

**Priority**: Should-have

**Acceptance Criteria**:

1. **Given** the user runs `/scaffold:adopt` in a directory with existing code,
   **When** Scaffold scans the directory,
   **Then** it checks for: package manifests, `docs/` directory, `README.md`, test configs (`jest.config.*`, `vitest.config.*`, `pytest.ini`), CI configs (`.github/workflows/`), `.github/` directory.

2. **Given** existing `docs/plan.md` is found,
   **When** mapping runs,
   **Then** `create-prd` is marked complete.

3. **Given** existing `jest.config.ts` is found but `docs/tdd-standards.md` does not exist,
   **When** mapping runs,
   **Then** `tdd` is NOT marked complete (binary completion — ALL `produces` artifacts must exist). The scan notes the existing test config as context for when `tdd` runs in brownfield mode.

4. **Given** scanning finds 5/18 artifacts,
   **When** config.json is generated,
   **Then** it sets `mode: "brownfield"`, marks 5 prompts complete, and suggests: "Found 5/18 artifacts already in place. Remaining prompts will document your existing code. Run `/scaffold:resume` to continue."

5. **Given** the user confirms,
   **When** config.json is created,
   **Then** a fresh `.scaffold/config.json` is written with pre-completed prompts.

6. **Given** the user does not confirm,
   **When** the flow stops,
   **Then** no files are created.

**Scope Boundary**: Distinct from brownfield mode (US-7.1, which adapts prompt behavior) and v1 detection (US-7.3, which detects Scaffold v1 specifically). `adopt` is for projects that were never scaffolded.

**Data/State Requirements**:
- Scans: package manifests, `docs/`, `README.md`, test configs, CI configs
- Output: `.scaffold/config.json` with `mode: "brownfield"` and pre-completed entries

**PRD Trace**: F-UX-12

---

## Epic 8: Auto-Activated Skill

Covers: Claude Code Skills integration

### US-8.1: Auto-Activated Skill Reads config.json for Pipeline State

**As** Alex, **I want** the auto-activated skill to show my actual pipeline progress instead of the hardcoded v1 table, **so that** Claude knows where I am without me explaining.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** `.scaffold/config.json` exists with a resolved pipeline,
   **When** the skill auto-activates (user asks about pipeline, next command, etc.),
   **Then** the skill reads config.json and shows the user's actual pipeline with progress.

2. **Given** `.scaffold/config.json` does NOT exist,
   **When** the skill activates,
   **Then** it falls back to showing available profiles and suggests: "Run `/scaffold:init` to start a pipeline."

3. **Given** the skill reads config.json with 8/18 complete,
   **When** it provides context to Claude,
   **Then** Claude can suggest the next prompt accurately without the user having to run `/scaffold:status` first.

**Scope Boundary**: Does NOT cover: skill auto-activation triggers (unchanged from v1). Does NOT cover: skill modifying pipeline state — read-only.

**Data/State Requirements**:
- File: `skills/scaffold-pipeline/SKILL.md` — updated to read `.scaffold/config.json`
- Falls back to profile list if no config exists

**PRD Trace**: Section 6 (Claude Code Skills System)

---

### US-8.2: Predecessor Document Loading via reads Field

**As** the pipeline engine, **I want** the skill to pre-load documents listed in a prompt's `reads` field before execution, **so that** Claude has the right context without prompts having to explicitly instruct file reads.

**Priority**: Should-have

**Acceptance Criteria**:

1. **Given** `tech-stack.md` frontmatter has `reads: ["docs/plan.md"]`,
   **When** `tech-stack` is about to execute,
   **Then** the skill ensures Claude has read `docs/plan.md` before the prompt runs.

2. **Given** a `reads` entry references a file that doesn't exist,
   **When** pre-loading runs,
   **Then** the missing file is skipped silently — no error.

3. **Given** a prompt has `reads: ["docs/plan.md", "docs/tech-stack.md", "CLAUDE.md"]`,
   **When** pre-loading runs,
   **Then** all 3 files are loaded (if they exist) before the prompt executes.

4. **Given** a prompt has no `reads` field,
   **When** execution proceeds,
   **Then** no pre-loading happens — the prompt handles its own file reads.

**Scope Boundary**: Supplements, not replaces, prompts' own file-reading instructions. Does NOT cover: full pipeline context (US-2.7).

**Data/State Requirements**:
- `reads` field from prompt frontmatter
- File existence check + Read tool invocation for each path

**PRD Trace**: F-PS-1 (`reads` field), Section 6 (predecessor document loading)

---

## Epic 9: Standalone Commands

Covers: F-SC-1

### US-9.1: Standalone Commands Accessible Without Pipeline

**As** Alex, **I want** to use commands like `quick-task`, `new-enhancement`, and `single-agent-start` without having a pipeline set up, **so that** I can use Scaffold for ongoing work after the pipeline completes.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** no `.scaffold/config.json` exists,
   **When** the user runs `/scaffold:quick-task`,
   **Then** the command executes normally — it does not require pipeline state.

2. **Given** no `.scaffold/config.json` exists,
   **When** the user runs `/scaffold:new-enhancement`,
   **Then** the command executes normally.

3. **Given** a list of standalone commands: `quick-task`, `new-enhancement`, `single-agent-start`, `single-agent-resume`, `multi-agent-start`, `multi-agent-resume`, `prompt-pipeline`, `update`, `version`,
   **When** any of them runs without `.scaffold/config.json`,
   **Then** they execute without error.

4. **Given** standalone commands,
   **When** the pipeline preview or progress display is shown,
   **Then** standalone commands do NOT appear — they're not part of the pipeline.

5. **Given** `/scaffold:prompt-pipeline` runs and `.scaffold/config.json` exists,
   **When** it displays the pipeline,
   **Then** it shows the resolved pipeline from config.json (not the old hardcoded table).

6. **Given** `/scaffold:prompt-pipeline` runs with no config,
   **When** it displays,
   **Then** it falls back to the built-in pipeline reference.

**Scope Boundary**: Does NOT cover: orchestration commands (`init`, `resume`, `status`, `next`, `skip`, `validate`, `reset`) — those ARE pipeline-aware but are not "prompts" in the pipeline.

**Data/State Requirements**:
- Standalone commands do not read or write `.scaffold/config.json`
- Exception: `prompt-pipeline` reads config.json if it exists (for display only)

**PRD Trace**: F-SC-1

---

### US-9.2: Opt-in Pipeline Prompts via add-prompts/extra-prompts

**As** Jordan, **I want to** include `multi-model-review` or `platform-parity-review` in my pipeline, **so that** my team gets these extra quality gates.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** a custom profile with `add-prompts: ["multi-model-review"]`,
   **When** the pipeline resolves,
   **Then** `multi-model-review` appears in the pipeline at the position determined by its `depends-on` and `phase`.

2. **Given** `extra-prompts: ["platform-parity-review"]` in `.scaffold/config.json`,
   **When** the pipeline resolves,
   **Then** `platform-parity-review` is included alongside profile prompts.

3. **Given** neither `add-prompts` nor `extra-prompts` references these prompts,
   **When** any built-in profile resolves,
   **Then** `multi-model-review`, `user-stories-multi-model-review`, and `platform-parity-review` are NOT included — they're opt-in only.

**Scope Boundary**: Does NOT cover: the execution behavior of these opt-in prompts — only their inclusion mechanism.

**Data/State Requirements**:
- Opt-in prompts exist as built-in commands (files in `commands/`) but are not in any built-in profile's prompt list
- Added via `add-prompts` (profile JSON) or `extra-prompts` (config.json)

**PRD Trace**: F-SC-1 (opt-in pipeline prompts)

---

## Epic 10: Non-Functional Compliance

Covers: Section 6 (Implementation Architecture), Section 7 (NFRs)

### US-10.1: Non-Functional Requirements Compliance

**As** a Scaffold maintainer, **I want** the system to satisfy all non-functional requirements from the PRD, **so that** Scaffold v2 is performant, reliable, compatible, maintainable, and secure by design.

**Priority**: Must-have

**Acceptance Criteria**:

1. **Given** all pipeline logic (dependency resolution, state tracking, prompt execution),
   **When** implementation is reviewed,
   **Then** it is expressed as natural-language instructions within command prompt files executed by Claude using its tools — not as compiled code or required runtime scripts. Helper scripts may exist as test utilities only. (REQ-185, REQ-186)

2. **Given** the plugin manifest (`.claude-plugin/plugin.json`),
   **When** v2 is released,
   **Then** it reflects the correct v2 version number, updated description, and lists all new commands. (REQ-187)

3. **Given** prompt resolution runs across all 4 tiers (profile override → project → user → built-in),
   **When** benchmarked,
   **Then** loading completes in under 100ms. (REQ-193)

4. **Given** `.scaffold/config.json` at expected size (under 10KB),
   **When** read/write operations are measured,
   **Then** they complete in under 100ms. (REQ-194)

5. **Given** any Scaffold command execution,
   **When** it finishes,
   **Then** no background processes, daemons, or watchers remain running. All operations are synchronous. (REQ-195)

6. **Given** any built-in prompt is run twice with identical inputs,
   **When** the second run completes,
   **Then** artifacts and config state are valid and non-duplicated — prompts are idempotent. (REQ-198)

7. **Given** a system without Node.js installed,
   **When** core Scaffold orchestration commands run,
   **Then** Scaffold operates correctly. Node.js is required only for Beads, not Scaffold core. (REQ-201)

8. **Given** Scaffold v2 requires Claude Code with plugin support,
   **When** the environment lacks plugin support,
   **Then** Scaffold warns with concrete upgrade guidance. macOS and Linux are supported; Windows via WSL is expected to work but untested. (REQ-199, REQ-200)

9. **Given** any single prompt file,
   **When** its content or frontmatter is modified (excluding `depends-on` changes),
   **Then** no changes are required to other prompt files, profiles, or the pipeline engine. Prompts are self-contained. (REQ-202)

10. **Given** the Scaffold plugin package,
    **When** runtime dependencies are audited,
    **Then** no external runtime dependencies are required. The plugin remains small with all logic in prompt files. (REQ-204)

**Scope Boundary**: This story consolidates non-functional requirements that are design constraints enforced during implementation review, not functional features requiring separate user-facing stories.

**Data/State Requirements**:
- Performance benchmarks in CI tests
- Architecture review checklist for prompt-driven design

**PRD Trace**: Section 6 (Implementation Architecture), Section 7 (Performance, Reliability, Compatibility, Maintainability, Security)

---

## Feature-to-Story Traceability Matrix

| PRD Feature | Stories | Priority |
|-------------|---------|----------|
| F-PE-1: Dependency Graph Resolution | US-2.1, US-2.2 | Must-have |
| F-PE-2: Pipeline State Tracking | US-2.3, US-2.4 | Must-have |
| F-PE-3: Pipeline Context | US-2.7 | Should-have |
| F-PE-4: Prompt Execution | US-2.5, US-6.3 | Must-have / Should-have |
| F-PE-5: Predecessor Artifact Verification | US-2.6 | Must-have |
| F-PE-6: Decision Log | US-2.8 | Should-have |
| F-PR-1: Built-in Profiles | US-4.1 | Must-have |
| F-PR-2: Custom Profiles | US-4.2, US-4.5 | Must-have |
| F-PR-3: Profile Inheritance | US-4.3, US-4.4 | Must-have |
| F-PS-1: Prompt Format | US-5.1 | Must-have |
| F-PS-2: Prompt Precedence | US-5.2, US-5.4, US-5.5 | Must-have |
| F-PS-3: Adding Custom Prompts | US-5.3 | Must-have |
| F-UX-1: scaffold init | US-1.1, US-1.2, US-1.3, US-1.4, US-1.5, US-1.6 | Must-have |
| F-UX-2: scaffold resume | US-3.1, US-3.2 | Must-have |
| F-UX-3: Dry Run / Preview | US-6.1 | Should-have |
| F-UX-4: Pipeline Progress Display | US-3.3 | Must-have |
| F-UX-5: scaffold status | US-3.4 | Must-have |
| F-UX-6: scaffold skip | US-3.5 | Must-have |
| F-UX-7: Smart Profile Suggestion | US-1.7, US-1.8 | Should-have |
| F-UX-8: scaffold validate | US-6.2 | Must-have |
| F-UX-9: scaffold reset | US-3.6 | Must-have |
| F-UX-10: Brownfield Mode | US-7.1, US-7.2 | Should-have |
| F-UX-11: scaffold next | US-3.7 | Must-have |
| F-UX-12: scaffold adopt | US-7.4 | Should-have |
| F-V1-1: v1 Project Detection | US-7.3 | Should-have |
| F-SC-1: Standalone Commands | US-9.1, US-9.2 | Must-have |
| Section 6: Implementation Architecture | US-10.1 | Must-have |
| Section 7: Non-Functional Requirements | US-10.1 | Must-have |

## User Flow Coverage

| PRD Flow | Stories |
|----------|---------|
| Flow 1: Initialize a New Project | US-1.1, US-1.2, US-1.3, US-1.4, US-1.5, US-1.6, US-1.7, US-1.8 |
| Flow 2: Resume In-Progress Pipeline | US-3.1, US-3.2, US-3.3 |
| Flow 3: Customize a Prompt | US-5.3, US-5.4, US-5.5 |
| Flow 4: Create and Share a Custom Profile | US-4.2, US-4.3, US-4.4 |
| Flow 5: Dry Run / Preview | US-6.1, US-6.2 |
| Flow 6: v1 Project Detection | US-7.3, US-7.4 |

## Priority Summary

| Priority | Count | Stories |
|----------|-------|---------|
| Must-have | 32 | US-1.1–1.6, US-2.1–2.6, US-3.1–3.7, US-4.1–4.5, US-5.1–5.5, US-6.2, US-8.1, US-9.1–9.2, US-10.1 |
| Should-have | 13 | US-1.7–1.8, US-2.7–2.8, US-6.1, US-6.3, US-7.1–7.4, US-8.2 |
