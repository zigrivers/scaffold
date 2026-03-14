# Scaffold v2 — Init Wizard UX Flow

**Phase**: 6 — UX Specification
**Depends on**: Phase 5 CLI contract (`scaffold init`), Domain model 14 (wizard state machine)
**Last updated**: 2026-03-13
**Status**: superseded

---

## Table of Contents

1. [Entry Points and Detection](#section-1-entry-points-and-detection)
2. [Smart Suggestion Display](#section-2-smart-suggestion-display)
3. [Wizard Question Flow](#section-3-wizard-question-flow)
4. [Build Handoff and Summary](#section-4-build-handoff-and-summary)
5. [Error States](#section-5-error-states)

---

## Section 1: Entry Points and Detection

The wizard begins by silently scanning the project directory and analyzing any idea text. Based on what it finds, the wizard presents one of four detection scenarios before proceeding to the interactive questions. All detection output appears before any interactive prompt.

### 1a: Greenfield (No Existing Project)

Triggered when `detectCodebase()` finds no package manifests with dependencies, no source directories with files, and no v1 tracking comments. This is the default path.

**Terminal output:**

```
  scaffold v2

  Welcome to Scaffold! Let's set up your project pipeline.

```

If idea text was provided (`scaffold init "I want to build..."`), the welcome line is followed immediately by the smart suggestion display (Section 2). If no idea text was provided, the wizard proceeds directly to the methodology selection question (Section 3, Screen 1).

**Interaction type**: None (automatic). No user input required.

**`--auto` behavior**: No output is displayed. The wizard proceeds silently to resolve all defaults and write config.

### 1b: Brownfield Detected (Existing Code, No V1 Artifacts)

Triggered when `detectCodebase()` finds package manifests with dependencies or source directories with files, but no v1 tracking comments or v1 scaffold artifacts.

**Terminal output:**

```
  scaffold v2

  Existing project detected:
    - package.json with 12 dependencies
    - src/ with 47 files
    - jest.config.ts (Jest test framework)
    - .github/workflows/ (CI/CD configuration)

  ? How should Scaffold treat this project?

    > Brownfield — adapt prompts to existing code
      Greenfield — start fresh, ignore existing code

```

The detection summary lists the specific signals found, grouped by category. Only `package-manifest` and `source-directory` signals trigger this screen; `documentation`, `test-config`, and `ci-config` signals are listed as informational context but do not by themselves trigger the brownfield prompt.

**Signal display rules:**

| Signal Category | Display Format | Example |
|-----------------|---------------|---------|
| `package-manifest` | `{filename} with {count} dependencies` | `package.json with 12 dependencies` |
| `source-directory` | `{dir} with {count} files` | `src/ with 47 files` |
| `documentation` | `docs/ with {count} markdown files` | `docs/ with 8 markdown files` |
| `test-config` | `{filename} ({framework} test framework)` | `jest.config.ts (Jest test framework)` |
| `ci-config` | `{path} (CI/CD configuration)` | `.github/workflows/ (CI/CD configuration)` |

**Interaction type**: Single-select (two options). Default: Brownfield.

**`--auto` behavior**: Brownfield is chosen automatically. No prompt is displayed. Detection signals are included in JSON output when `--format json` is used.

### 1c: V1 Project Detected

Triggered when `detectCodebase()` finds v1 tracking comments (`<!-- scaffold:* v* date -->`) or v1 scaffold artifacts (`.beads/` directory, known v1 file paths). V1 detection takes priority over brownfield detection per ADR-028.

**Terminal output:**

```
  scaffold v2

  Scaffold v1 project detected:
    - docs/plan.md (v1 tracking comment)
    - docs/tech-stack.md (v1 tracking comment)
    - docs/coding-standards.md (v1 tracking comment)
    - .beads/ directory
    - docs/tdd-standards.md
    ... and 3 more artifacts

  ? Migrate to Scaffold v2? Your existing files will NOT be modified.
    Scaffold will create .scaffold/config.yml and map existing artifacts
    to the v2 pipeline.

    > Yes, migrate to v2
      No, start fresh (greenfield)

```

When more than 6 artifacts are detected, the list is truncated with an "and N more artifacts" line. The full list appears in the summary screen (Section 4) after all questions are answered.

**Interaction type**: Single-select (two options). Default: Yes, migrate.

**Outcome if user chooses "Yes"**: `context.mode` is set to `v1-migration`. After config is written, the adopt scan runs automatically (domain 07, Algorithm 2) to map v1 artifacts to v2 prompts and pre-populate `state.json`.

**Outcome if user chooses "No"**: `context.mode` is set to `greenfield`. V1 artifacts are left untouched. Wizard proceeds as greenfield.

**`--auto` behavior**: V1 migration is chosen automatically only if at least one v1 tracking comment is detected (not just `.beads/` or `tasks/lessons.md`). Weak v1 signals in `--auto` mode fall through to brownfield detection. This prevents unexpected migrations in CI/scripting contexts.

### 1d: Existing `.scaffold/` Config Found

Triggered when `.scaffold/config.yml` already exists. This check runs before all other detection and blocks the wizard unless `--force` is provided.

**Terminal output (without `--force`):**

```
  Error: Project already initialized.

  .scaffold/config.yml already exists at this location.

  Options:
    scaffold run         Continue the existing pipeline
    scaffold init --force   Reinitialize (backs up existing config)
    scaffold status         View current pipeline state

```

**Exit code**: 1

**Terminal output (with `--force`):**

```
  scaffold v2

  Existing .scaffold/ backed up to .scaffold.backup/

  Welcome to Scaffold! Let's set up your project pipeline.

```

When `--force` is used, the existing `.scaffold/` directory is renamed to `.scaffold.backup/` before the wizard proceeds. The wizard then continues normally through detection and questions as if no prior config existed.

**Interaction type**: Without `--force` — error output, no interaction. With `--force` — informational notice, then standard wizard flow.

**`--auto` behavior without `--force`**: Error. Exit code 1.

**`--auto` behavior with `--force`**: Requires `--confirm-reset` flag. Without it, `--auto --force` still exits with error code 1 to prevent accidental overwrites in CI. With `--auto --force --confirm-reset`, the backup proceeds silently and all defaults are resolved automatically.

---

## Section 2: Smart Suggestion Display

When the user provides idea text (`scaffold init "I want to build a task management web app"`), the wizard analyzes the text for keyword signals and scans existing files for framework signals. The results are displayed as a recommendation before the methodology question.

### 2a: Standard Recommendation

Displayed when keyword analysis produces a clear suggestion (confidence: medium or high) and no file signals conflict.

**Terminal output:**

```
  Based on your project description:
    Keywords detected: "web app" (web), "task" (general)
    Recommended methodology: Scaffold Classic

```

The recommendation sets the default selection for the methodology question (Section 3, Screen 1). The word "(Recommended)" appears next to the suggested methodology in the selection list.

### 2b: File Signal Override

Displayed when file signals in the project directory contradict the keyword suggestion. Per ADR-027, file signals override keywords because concrete evidence outweighs aspirational text.

**Terminal output:**

```
  Based on your project description:
    Keywords detected: "cli tool" (cli)
    Keyword suggestion: Scaffold Lite

  However, file analysis found:
    - package.json: React dependency detected
    - next.config.ts: Next.js configuration

  Adjusted recommendation: Scaffold Classic
    (file evidence indicates a web project, overriding CLI keyword)

```

The adjusted recommendation becomes the default for the methodology question. The original keyword suggestion is still shown for transparency.

### 2c: No Signals Detected

Displayed when idea text is provided but no keywords match the keyword map.

**Terminal output:**

```
  Based on your project description:
    No specific project type detected from your description.
    Defaulting to Scaffold Classic.

```

### 2d: `--auto` Behavior for Smart Suggestions

In `--auto` mode, the smart suggestion result directly determines the methodology without displaying any output. The suggestion algorithm runs identically, but the result is applied as the final answer rather than as a default for an interactive question.

- **With idea text + signals**: Suggested methodology is used.
- **With idea text + no signals**: `classic` is used.
- **Without idea text**: `classic` is used.
- **File signal override**: File methodology wins, same as interactive mode.

In `--format json` mode, the full `MethodologySuggestion` object (sources, confidence, keyword list) is included in the response envelope for auditability.

---

## Section 3: Wizard Question Flow

The wizard presents 7 questions in a fixed sequence. Each question is documented as a screen with exact prompt text, options, defaults, adaptive rules, and `--auto` behavior. Questions use `@inquirer/prompts` — select for single-choice, checkbox for multi-select, confirm for yes/no.

All option values match the valid values defined in the config.yml schema (Section 2 of `config-yml-schema.md`).

### Screen 1: Methodology Selection

> **Note**: This screen has been superseded by PRD Section 13. The PRD defines three methodology tiers: Deep Domain Modeling, MVP, and Custom.

```
┌──────────────────────────────────────────────────────────────────┐
│  ? Choose a methodology:                                         │
│                                                                  │
│    > Deep Domain Modeling (Recommended)                          │
│      Comprehensive — all 32 steps at depth 5.                    │
│                                                                  │
│      MVP                                                         │
│      Get to code fast — 4 steps at depth 1.                      │
│                                                                  │
│      Custom                                                      │
│      Pick your own steps and depth levels.                       │
│                                                                  │
│  Default: Deep Domain Modeling                                   │
│  --auto: Smart suggestion result, or Deep Domain Modeling        │
│  Skipped when: --methodology flag is provided                    │
└──────────────────────────────────────────────────────────────────┘
```

**Question text**: `Choose a methodology:`

**Options**:

| Value | Label | Description |
|-------|-------|-------------|
| `deep` | Deep Domain Modeling | Comprehensive — all 32 steps at depth 5 |
| `mvp` | MVP | Get to code fast — 4 steps at depth 1 |
| `custom` | Custom | Pick your own steps and depth levels |

For Custom: the wizard presents the step list with toggle (enabled/disabled) and depth (1-5) per step. See PRD Section 13 for details.

**Default**: `deep` when no smart suggestion is available. When a smart suggestion exists, the suggested methodology is pre-selected and labeled "(Recommended)". The recommended option always appears first in the list.

**Adaptive rules**: This question is always asked (never skipped) unless the `--methodology` CLI flag pre-selects a value. For Custom methodology, a follow-up screen presents the full step list with per-step toggle and depth.

**`--auto` behavior**: Uses the smart suggestion methodology if available, otherwise `deep`. When `--methodology` flag is provided, uses that value directly.

### Screens 2-5: Mixin Axis Questions (REMOVED)

> **Superseded**: The five mixin axis questions (task-tracking, TDD, git-workflow, agent-mode, interaction-style) have been removed. The meta-prompt architecture (ADR-041) eliminates mixin axes. The AI adapts prompt content natively based on project context and methodology depth configuration. See PRD Section 13 for the current init wizard flow.
>
> For Custom methodology, the wizard presents a step list with toggle (enabled/disabled) and depth (1-5) per step instead of mixin axis questions.

### Screen 6: Target Platforms

```
┌──────────────────────────────────────────────────────────────────┐
│  ? Target platforms: (select all that apply)                     │
│                                                                  │
│    [x] Claude Code                                               │
│        Generate Claude Code slash commands in commands/           │
│                                                                  │
│    [ ] Codex                                                     │
│        Generate Codex-compatible prompts in codex-prompts/       │
│                                                                  │
│  Note: Universal prompts (prompts/) are always generated         │
│  regardless of platform selection.                               │
│                                                                  │
│  Default: Claude Code pre-selected; Codex pre-selected if        │
│    codex CLI is detected on PATH                                 │
│  --auto: Claude Code always; Codex if detected on PATH           │
│  Skipped when: never (always asked)                              │
└──────────────────────────────────────────────────────────────────┘
```

**Question text**: `Target platforms:` (with hint: "select all that apply")

**Options**:

| Value | Label | Description |
|-------|-------|-------------|
| `claude-code` | Claude Code | Generate Claude Code slash commands in `commands/` |
| `codex` | Codex | Generate Codex-compatible prompts in `codex-prompts/` |

**Default**: `claude-code` is always pre-selected. `codex` is pre-selected if the `codex` CLI is detected on PATH at init time.

**Validation**: At least one platform must be selected. If the user deselects all platforms, the prompt redisplays with an inline error: `At least one platform must be selected.`

**Adaptive rules**: This question is always asked. The selected platforms directly determine the `interaction-style` mixin value (resolved automatically after this question, not asked separately):

| Platform Selection | Derived `interaction-style` |
|---|---|
| `[claude-code]` only | `claude-code` |
| `[codex]` only | `codex` |
| `[claude-code, codex]` | `claude-code` (primary platform determines style) |
| No platform-specific match (fallback) | `universal` |

The `universal` fallback is defined by Algorithm 5 (resolveInteractionStyle) in the domain model. While unreachable with the current built-in platforms, third-party platform adapters could produce this value.

If `codex` is selected but the `codex` CLI is not found on PATH, a warning is displayed at the summary stage: `Codex CLI not found on PATH. Codex output will be generated but may not be usable until Codex is installed.`

**`--auto` behavior**: `claude-code` always selected. `codex` added if detected on PATH.

### Screen 7: Project Traits Confirmation

```
┌──────────────────────────────────────────────────────────────────┐
│  ? Project type — select the platforms your app targets:         │
│    (select all that apply)                                       │
│                                                                  │
│    [x] Web                                                       │
│        Includes design-system and add-playwright prompts.        │
│                                                                  │
│    [ ] Mobile                                                    │
│        Includes add-maestro prompt for mobile testing.           │
│                                                                  │
│    [ ] Desktop                                                   │
│        Reserved for future methodology extensions.               │
│                                                                  │
│  These selections control which optional prompts are included    │
│  in your pipeline.                                               │
│                                                                  │
│  Default: Pre-selected from smart suggestion traits and file     │
│    signal detection                                              │
│  --auto: Inferred from smart suggestion traits                   │
│  Skipped when: methodology has no optional prompts with trait    │
│    conditions (e.g., classic-lite)                                │
└──────────────────────────────────────────────────────────────────┘
```

**Question text**: `Project type — select the platforms your app targets:` (with hint: "select all that apply")

**Options**:

| Value | Label | Description | Derived Traits |
|-------|-------|-------------|----------------|
| `web` | Web | Includes design-system and add-playwright prompts. | `frontend`, `web` |
| `mobile` | Mobile | Includes add-maestro prompt for mobile testing. | `frontend`, `mobile` |
| `desktop` | Desktop | Reserved for future methodology extensions. | (none currently) |

Selecting both `web` and `mobile` additionally derives the `multi-platform` trait, which includes the `platform-parity-review` prompt.

**Default**: Options are pre-selected based on smart suggestion traits (from idea text keywords) and file signal detection (from existing framework files). For example, if `package.json` contains React, `web` is pre-selected. If `app.json` contains an "expo" key, `mobile` is pre-selected. If no signals exist, nothing is pre-selected (empty selection is valid for this question).

**Validation**: Empty selection is valid. Selecting no project platforms means no optional prompts with trait conditions are included in the pipeline.

**Adaptive rules**: This question is **skipped entirely** when the selected methodology has no optional prompts with trait conditions (`MethodologyInfo.hasOptionalPrompts === false`). For `classic-lite`, which has no optional prompts, this screen is never shown.

**`--auto` behavior**: Project platforms are inferred from smart suggestion traits. If suggestion traits include `web`, `web` is selected. If traits include `mobile`, `mobile` is selected. If no traits are detected, no project platforms are selected (empty array).

### Interaction Style Resolution (Automatic, Not a Screen)

After Screen 6 (or Screen 7 if shown), the `interaction-style` mixin value is computed automatically using Algorithm 5 (resolveInteractionStyle). The primary platform (first in the `platforms` array) determines the value:

- Primary platform `claude-code` -> `interaction-style: claude-code`
- Primary platform `codex` -> `interaction-style: codex`
- No platform-specific match -> `interaction-style: universal` (fallback; see Algorithm 5)

This is never presented as an interactive question. It appears in the summary (Section 4) for review but cannot be changed through the wizard. Users who need a different interaction style can edit `config.yml` after init.

Additionally, `multi-model-cli` is auto-detected by checking whether `codex` or `gemini` CLIs are available on PATH. This boolean is written to `project.multi-model-cli` in the config without user interaction.

---

## Section 4: Build Handoff and Summary

After all wizard questions are answered, the wizard displays a summary, asks for confirmation, writes the config, and automatically runs `scaffold build`.

### 4a: Summary Display

> **Note**: Summary updated per PRD Section 13. Mixin axis selections removed; replaced with methodology depth and step count.

```
  === Scaffold Configuration ===

  Methodology:   Deep Domain Modeling
  Mode:          greenfield
  Depth:         5
  Steps:         32 enabled (of 32 defined)

  Platforms:     Claude Code
  Conditional:   Database (enabled), API (enabled), UI/UX (enabled)

```

**Summary field formatting:**

| Field | Display Value |
|-------|---------------|
| Methodology | Display name (e.g., "Deep Domain Modeling", "MVP", "Custom") |
| Mode | `greenfield`, `brownfield`, or `v1-migration` |
| Depth | Depth level (1-5) for the methodology, or "per-step" for Custom |
| Steps | Enabled step count (of total defined) |
| Platforms | Comma-separated display names |
| Conditional | Conditional steps and their enabled/disabled status |

Warnings do not block confirmation. The user can proceed despite warnings.

**V1 migration additional section** (displayed only in v1-migration mode):

```
  === V1 Artifacts Detected ===

    - docs/plan.md (v1 tracking comment)
    - docs/tech-stack.md (v1 tracking comment)
    - docs/coding-standards.md (v1 tracking comment)
    - .beads/ directory
    - docs/tdd-standards.md
    - docs/project-structure.md
    - docs/dev-setup.md
    - docs/git-workflow.md

  These artifacts will be mapped to v2 prompts after config is written.
  Your existing files will NOT be modified.

```

### 4b: Confirmation Prompt

```
  ? Proceed with these settings? [Y/n]
```

**Interaction type**: Confirm. Default: Yes.

**If user confirms** (`Y` or Enter): Wizard proceeds to write config and run build.

**If user declines** (`n`): Wizard exits with message `Init cancelled. No files were created.` Exit code: 4.

**`--auto` behavior**: Confirmation is auto-accepted. No prompt is displayed.

### 4c: Config Written

```
  ✓ Config saved to .scaffold/config.yml
```

### 4d: V1 Adopt Scan (Conditional)

Displayed only when `context.mode === 'v1-migration'`. The adopt scan runs automatically after config is written.

```
  Scanning for v1 artifacts...

  Mapped 8 artifacts to v2 prompts:
    ✓ create-prd          ← docs/plan.md
    ✓ tech-stack           ← docs/tech-stack.md
    ✓ coding-standards     ← docs/coding-standards.md
    ✓ tdd                  ← docs/tdd-standards.md
    ✓ project-structure    ← docs/project-structure.md
    ✓ dev-env-setup        ← docs/dev-setup.md
    ✓ git-workflow         ← docs/git-workflow.md
    ✓ user-stories         ← docs/user-stories.md

  ✓ State saved to .scaffold/state.json (8 prompts pre-completed)
```

Partial matches are displayed with a warning indicator:

```
    ~ tech-stack           ← docs/tech-stack.md
      (missing required section "## Architecture Overview")
```

### 4e: Build Progress

After config (and optionally state) are written, `scaffold build` runs automatically to generate thin command wrappers.

```
  Running scaffold build...

  ✓ Config valid (methodology: deep, 32 steps)
  ✓ 32 steps resolved (29 enabled, 3 conditional disabled)
  ✓ Claude Code: 29 thin wrappers written to commands/
  ✓ Universal: 29 prompts written to prompts/
```

When multiple platforms are selected:

```
  ✓ Claude Code: 29 thin wrappers written to commands/
  ✓ Codex: 29 prompts written to codex-prompts/
  ✓ Universal: 29 prompts written to prompts/
```

### 4f: Pipeline Overview

The final output after a successful init + build.

**Greenfield:**

```
  === Your Pipeline ===

  Methodology: Scaffold Classic (22 resolved of 24 defined, 7 phases)
  Mode:        greenfield
  Platforms:   Claude Code

  Phase 0  Prerequisites       ░░░░░░░░░░  0/3
  Phase 1  Product Definition  ░░░░░░░░░░  0/4
  Phase 2  Technical Design    ░░░░░░░░░░  0/3
  Phase 3  Quality Standards   ░░░░░░░░░░  0/3
  Phase 4  Development Setup   ░░░░░░░░░░  0/4
  Phase 5  Planning            ░░░░░░░░░░  0/2
  Phase 6  Implementation      ░░░░░░░░░░  0/3

  Next step: Run scaffold run to start executing prompts.

```

**V1 Migration:**

```
  === Your Pipeline ===

  Methodology: Scaffold Classic (22 resolved of 24 defined, 7 phases)
  Mode:        v1-migration
  Platforms:   Claude Code

  Phase 0  Prerequisites       ██████░░░░  2/3
  Phase 1  Product Definition  ██████████  4/4
  Phase 2  Technical Design    █████░░░░░  1/3
  Phase 3  Quality Standards   ██████████  3/3
  Phase 4  Development Setup   █████░░░░░  2/4
  Phase 5  Planning            ░░░░░░░░░░  0/2
  Phase 6  Implementation      ░░░░░░░░░░  0/3

  Pre-completed: 8 prompts (from existing v1 artifacts)
  Remaining:     14 prompts
  Next eligible: dev-env-setup

  Next step: Run scaffold run to continue from where v1 left off.

```

**Brownfield:**

```
  === Your Pipeline ===

  Methodology: Scaffold Classic (22 resolved of 24 defined, 7 phases)
  Mode:        brownfield
  Platforms:   Claude Code

  Phase 0  Prerequisites       ░░░░░░░░░░  0/3
  Phase 1  Product Definition  ░░░░░░░░░░  0/4
  Phase 2  Technical Design    ░░░░░░░░░░  0/3
  Phase 3  Quality Standards   ░░░░░░░░░░  0/3
  Phase 4  Development Setup   ░░░░░░░░░░  0/4
  Phase 5  Planning            ░░░░░░░░░░  0/2
  Phase 6  Implementation      ░░░░░░░░░░  0/3

  Brownfield mode: 4 prompts will adapt to your existing code
    (create-prd, tech-stack, project-structure, dev-env-setup)

  Next step: Run scaffold run to start executing prompts.

```

### 4g: `--format json` Output

In JSON mode, no human-readable progress output is shown. The entire result is returned as a single JSON envelope:

```json
{
  "success": true,
  "command": "init",
  "data": {
    "configPath": ".scaffold/config.yml",
    "statePath": null,
    "methodology": "deep",
    "mode": "greenfield",
    "depth": 5,
    "platforms": ["claude-code"],
    "stepCount": 32,
    "enabledSteps": 29,
    "buildResult": {
      "stepCount": 29,
      "platforms": ["claude-code"],
      "generatedFiles": ["commands/*.md", "prompts/*.md"]
    }
  },
  "errors": [],
  "warnings": [],
  "exit_code": 0
}
```

For v1-migration, `statePath` is `.scaffold/state.json` and the `data` object includes `preCompleted` (count) and `nextEligible` (prompt slug).

---

## Section 5: Error States

Every error during `scaffold init` produces structured output with an error code, human-readable message, and recovery guidance. Errors use the global output contract from ADR-025.

### 5a: Detection Failure — Manifest Load Failed

Fires when the wizard cannot load methodology manifests at startup (corrupt installation, missing files).

**Terminal output:**

```
  Error: Failed to load methodology manifests.

  Could not read methodologies/classic/manifest.yml:
    ENOENT: no such file or directory

  Recovery:
    Run scaffold update to repair the installation, or reinstall
    scaffold globally: npm install -g @scaffold-cli/scaffold

```

**Error code**: `INIT_MANIFEST_LOAD_FAILED`
**Exit code**: 1

**`--auto` behavior**: Same error output. Exit code 1.

**`--format json` output:**

```json
{
  "success": false,
  "command": "init",
  "data": null,
  "errors": [{
    "code": "INIT_MANIFEST_LOAD_FAILED",
    "message": "Failed to load methodology manifests: ENOENT: methodologies/classic/manifest.yml not found",
    "recovery": "Run scaffold update to repair the installation."
  }],
  "warnings": [],
  "exit_code": 1
}
```

### 5b: Existing Config Conflict — `INIT_SCAFFOLD_EXISTS`

Fires when `.scaffold/config.yml` exists and `--force` is not set. This is the most common error users encounter on second runs.

**Terminal output:** See `error-messages.md` Section 3.1 for the canonical `INIT_SCAFFOLD_EXISTS` message template. The message includes recovery options pointing to `scaffold run`, `scaffold init --force`, and `scaffold status`.

**Error code**: `INIT_SCAFFOLD_EXISTS`
**Exit code**: 1

**`--auto` behavior**: Same error output. Exit code 1. Note that `--auto --force` without `--confirm-reset` also errors with exit code 1.

**`--format json` output:** See `error-messages.md` Section 3.1 for the canonical JSON error envelope for `INIT_SCAFFOLD_EXISTS`.

### 5c: Build Failure After Wizard

Fires when `scaffold build` fails after config has been successfully written. The init is considered partially successful: config exists, but no pipeline output was generated.

**Terminal output:**

```
  ✓ Config saved to .scaffold/config.yml

  Running scaffold build...

  Error: Build failed.

  manifest parse error in classic/manifest.yml: unexpected token at line 42

  Your config was saved successfully. The build step failed separately.

  Recovery:
    Run scaffold build to retry after fixing the issue.
    Your configuration in .scaffold/config.yml is intact.

```

**Error code**: `INIT_BUILD_FAILED`
**Exit code**: 5

The key UX decision here is that config write and build are treated as separate concerns. Config was written successfully, so the user does not need to re-run the wizard. They only need to fix the build issue and run `scaffold build`.

**`--auto` behavior**: Same error output. Exit code 5. Config file exists and is valid.

**`--format json` output:**

```json
{
  "success": true,
  "command": "init",
  "data": {
    "configPath": ".scaffold/config.yml",
    "statePath": null,
    "methodology": "classic",
    "mode": "greenfield",
    "buildResult": null
  },
  "errors": [{
    "code": "INIT_BUILD_FAILED",
    "message": "Build failed: manifest parse error in classic/manifest.yml.",
    "recovery": "Run scaffold build manually to retry."
  }],
  "warnings": [],
  "exit_code": 5
}
```

Note that `success` is `true` because the init operation (config write) succeeded. The build failure is reported as an error in the `errors` array with a different exit code.

### 5d: User Cancellation

Fires when the user declines at the confirmation prompt or presses Ctrl+C at any point during the wizard.

**Terminal output (declined at confirmation):**

```
  Init cancelled. No files were created.
```

**Terminal output (Ctrl+C during any question):**

```
  Init cancelled. No files were created.
```

**Error code**: `INIT_WIZARD_CANCELLED` (confirmation decline) or `USER_CANCELLED` (Ctrl+C)
**Exit code**: 4

No files are ever written before confirmation is accepted. The wizard accumulates answers in memory and only writes to disk after the user confirms. This guarantees a clean cancellation with no cleanup needed.

**`--auto` behavior**: N/A. Auto mode does not have a confirmation prompt and cannot be cancelled by the user (Ctrl+C produces a standard process termination).

**`--format json` output:**

```json
{
  "success": false,
  "command": "init",
  "data": null,
  "errors": [{
    "code": "INIT_WIZARD_CANCELLED",
    "message": "Init cancelled. No files were created.",
    "recovery": "Run scaffold init again."
  }],
  "warnings": [],
  "exit_code": 4
}
```

### 5e: Config Write Failed

Fires when the filesystem rejects the config write (permission denied, disk full, read-only filesystem).

**Terminal output:**

```
  Error: Failed to write config.

  Could not create .scaffold/config.yml:
    EACCES: permission denied, mkdir '.scaffold'

  Recovery:
    Check directory permissions and available disk space.
    Ensure you have write access to the current directory.

```

**Error code**: `INIT_CONFIG_WRITE_FAILED`
**Exit code**: 1

No files are left behind in a partial state. If `.scaffold/` was partially created, it is cleaned up before the error is reported.

**`--auto` behavior**: Same error output. Exit code 1.

### 5f: State Write Failed (V1 Migration)

Fires when config was written successfully but the `state.json` write for v1 migration fails.

**Terminal output:**

```
  ✓ Config saved to .scaffold/config.yml

  Scanning for v1 artifacts...

  Error: Failed to write pipeline state.

  Could not create .scaffold/state.json:
    ENOSPC: no space left on device

  Your config was saved successfully. The v1 migration state could
  not be written.

  Recovery:
    Free disk space, then run scaffold adopt to complete the migration.
    Your configuration in .scaffold/config.yml is intact.

```

**Error code**: `INIT_STATE_WRITE_FAILED`
**Exit code**: 1

**`--auto` behavior**: Same error output. Exit code 1.

### 5g: `--auto` Failures

In `--auto` mode, failures that would normally be resolved by user interaction become hard errors:

| Scenario | Interactive Behavior | `--auto` Behavior |
|----------|---------------------|-------------------|
| Existing `.scaffold/` without `--force` | Error with recovery options | Same error, exit 1 |
| `--force` without `--confirm-reset` | N/A (interactive mode does not need `--confirm-reset`) | Error: `--confirm-reset required with --auto --force`, exit 1 |
| No platforms detected | User selects manually | `claude-code` selected as default |
| No methodology manifests found | Error | Same error, exit 1 |
| Ambiguous v1 detection (weak signals) | User prompted for v1 or brownfield | Falls through to brownfield if weak signals, greenfield if no code signals |

**`--auto --force` without `--confirm-reset`:**

```
  Error: Confirmation required for destructive auto-init.

  --auto --force will overwrite the existing .scaffold/ directory.
  Add --confirm-reset to confirm this is intentional.

  Example: scaffold init --auto --force --confirm-reset

```

**Error code**: `INIT_SCAFFOLD_EXISTS`
**Exit code**: 1

### Error Summary Table

| Error Code | Exit Code | Trigger | Recovery |
|------------|-----------|---------|----------|
| `INIT_MANIFEST_LOAD_FAILED` | 1 | Cannot load methodology manifests | `scaffold update` or reinstall |
| `INIT_SCAFFOLD_EXISTS` | 1 | `.scaffold/` exists without `--force` | `scaffold run` or `scaffold init --force` |
| `INIT_CONFIG_WRITE_FAILED` | 1 | Filesystem error writing config | Check permissions and disk space |
| `INIT_STATE_WRITE_FAILED` | 1 | Filesystem error writing state (v1 migration) | `scaffold adopt` after fixing filesystem |
| `INIT_BUILD_FAILED` | 5 | Build fails after config written | `scaffold build` to retry |
| `INIT_WIZARD_CANCELLED` | 4 | User declines confirmation | `scaffold init` to restart |
| `USER_CANCELLED` | 4 | Ctrl+C during wizard | `scaffold init` to restart |
| `INIT_NO_PLATFORMS` | 1 | No platforms selected (multi-select validation) | Re-run wizard, select at least one |
| `INIT_METHODOLOGY_NOT_FOUND` | 1 | `--methodology` flag value not installed | `scaffold list` to see available options |
