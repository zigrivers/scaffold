# ADR-027: Init Wizard with Smart Methodology Suggestion

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 14
**Phase**: 2 — Architecture Decision Records

---

## Context

First-time users need to configure `.scaffold/config.yml` — choosing a methodology, mixin values for each axis, platform targets, and project traits. This configuration drives every subsequent scaffold operation. The challenge is balancing ease of use (users shouldn't need to read documentation to get started) with flexibility (experienced users should be able to customize everything).

Three approaches were considered: a manual template (users copy and edit a config file), a guided wizard (interactive question flow), or pure auto-detection (analyze the codebase and infer everything). Additionally, the system must handle existing projects — v1 migration and brownfield adoption — which require different initialization behavior than greenfield projects.

Domain 14 models the complete wizard flow as a 22-state machine across three phases: detection, interactive questions, and confirmation. The smart suggestion algorithm is specified in domain 14, Section 4.

## Decision

`scaffold init` uses an interactive wizard powered by `@inquirer/prompts`. The wizard performs smart analysis of idea text and codebase files to suggest a methodology and mixin selections. After wizard completion, `scaffold build` runs automatically to generate the prompt pipeline.

The wizard operates in three phases:

1. **Detection phase** (automatic, no user interaction): parse CLI arguments, check for existing `.scaffold/config.yml`, analyze idea text for keywords, scan codebase files for framework signals
2. **Interactive questions**: methodology selection (with smart suggestion as default), mixin selections across 4 axes with adaptive defaults (later questions adapt to earlier answers), platform selection, and conditional project type questions
3. **Confirmation phase**: display summary of all selections, write config, trigger adoption scan (conditional, for v1/brownfield), run `scaffold build`, complete

A `--auto` mode resolves all questions with defaults and smart suggestions without displaying prompts, enabling non-interactive CI and scripting use cases.

## Rationale

**Interactive wizard over manual template**: Templates require users to understand all configuration options before they begin, which violates the "easy to get started" goal. A wizard presents one question at a time with explanations, defaults, and smart suggestions. Users who know what they want can accept defaults quickly; users who need guidance get it contextually. Domain 14, Section 1 identifies the wizard as the boundary between user intent and the pipeline engine.

**Smart suggestion over pure auto-detection**: Pure auto-detection produces a config without user confirmation, which can be wrong (especially for idea-text-only projects with no codebase to analyze). Smart suggestion combines analysis with user confirmation: "Based on your project description, I suggest 'deep' — is that right?" The user always has the final say. Domain 14, Section 4 specifies that file signals beat keywords (concrete evidence over aspirational text) and that the default methodology is `deep` when no signals are detected.

**@inquirer/prompts over raw readline**: inquirer provides consistent UX patterns (select lists, checkboxes, confirmations) across platforms, handles terminal edge cases, supports validation, and is the de facto standard for Node.js CLI wizards. Raw readline would require reimplementing all of this.

**Auto-run scaffold build after init**: The config file alone is not useful — users need the resolved prompt pipeline to start working. Making the user manually run `scaffold build` after `scaffold init` adds a step that every user must discover and execute. Auto-running it creates a seamless flow: answer questions, get a working pipeline. Domain 14, Section 8 specifies this handoff.

**Existing config without --force is an error**: Silently overwriting an existing config would destroy user choices. Requiring `--force` makes the destructive action explicit. With `--force`, the existing config is backed up before overwriting, providing a recovery path (domain 14, Section 6).

## Alternatives Considered

### Template/Boilerplate Config

- **Description**: Provide a starter `config.yml` that users copy into their project and edit manually. No wizard, no interactive questions.
- **Pros**: Familiar pattern (similar to `.eslintrc`, `tsconfig.json`). No CLI dependency for initialization. Users see the full config structure.
- **Cons**: Users must understand all options (methodology, axes, mixins) before they start. Copy-paste errors are common. No smart suggestion — users must research which methodology fits their project. No validation until `scaffold build` runs, which may be much later.

### Auto-Detection Only (No Wizard)

- **Description**: `scaffold init` analyzes the codebase and idea text, generates a complete config without any user interaction, and proceeds directly to build.
- **Pros**: Zero friction — one command, no questions. Fast for experienced users.
- **Cons**: Low confidence when codebase signals are ambiguous or absent (e.g., empty directory with only idea text). User cannot correct wrong inferences without editing the generated config. No opportunity to explain options or provide guidance. Removes user agency from a decision that significantly affects their workflow.

### Web-Based Configurator

- **Description**: A browser-based UI (similar to create-react-app's online configurator) that generates a config file for download.
- **Pros**: Rich UI — dropdowns, tooltips, visual pipeline preview. Can include documentation inline.
- **Cons**: Separate tool to build and maintain. Requires internet access (doesn't work offline). Disconnected from the actual project directory — user must manually place the downloaded file. Inconsistent with the CLI-first design philosophy.

### Scaffold Init --Preset Shorthand

- **Description**: Allow `scaffold init --preset deep` to skip the wizard entirely and use a predefined config.
- **Pros**: Fast for experienced users who know what they want. One-liner setup.
- **Cons**: Still needs the wizard for customization (preset doesn't cover axis selection). Presets are methodology-specific and would need to be maintained alongside methodologies. This is effectively `--auto` with a methodology override, which the current design supports via `scaffold init --auto --methodology deep`.

## Consequences

### Positive
- First-time users get guided, contextual help choosing a methodology and configuration options
- Smart suggestions reduce decision fatigue — the wizard does the analysis and presents a recommendation
- `--auto` mode enables non-interactive use in scripts, CI, and automated workflows
- Auto-running `scaffold build` creates a seamless init-to-pipeline flow with no manual steps
- Adaptive questions (methodology choice affects mixin defaults) prevent invalid combinations

### Negative
- Interactive wizard adds a dependency on `@inquirer/prompts` (and its transitive dependencies)
- The smart suggestion algorithm may produce incorrect recommendations for novel project types that don't match keyword or file signal patterns
- `--auto` mode with incorrect defaults may generate a suboptimal config that the user doesn't notice until deep in the pipeline
- The 22-state wizard is complex to maintain — adding a new axis or methodology requires updating the state machine

### Neutral
- The wizard is a one-time experience per project — users run `scaffold init` once, then work with the generated config. The quality of the wizard experience matters but does not affect ongoing usage
- Smart suggestion confidence levels (high, medium, low) are informational — the wizard always asks the question regardless of confidence, but adjusts the default selection and messaging

## Constraints and Compliance

- `scaffold init` MUST use `@inquirer/prompts` for interactive mode — no raw readline or custom prompt implementations
- Smart suggestions MUST be advisory — the user can override any suggestion, and the wizard always presents the question even when confidence is high
- Existing config MUST produce error `INIT_SCAFFOLD_EXISTS` without `--force` — no silent overwrite
- `scaffold build` MUST auto-run after init completes successfully (domain 14, Section 8)
- `--auto` mode MUST resolve all questions without user interaction, using smart suggestions and methodology defaults
- `--auto` methodology/mixin resolution: `deep` default when no signals detected, manifest defaults for axes, auto-detect platforms
- In smart methodology suggestion, file-based signals (existing `package.json`, Expo config, framework-specific files, etc.) MUST override keyword signals from the idea text when they conflict. A project with an Express `package.json` and idea text mentioning "mobile app" is classified based on the existing codebase, not the aspirational text.
- Smart suggestion algorithm: file signals MUST beat keyword signals when both are present (concrete evidence over aspirational text)
- See domain 14, Sections 3-5 for the complete wizard state machine, smart suggestion algorithm, and adaptive question logic

## Related Decisions

- [ADR-004](ADR-004-methodology-as-top-level-organizer.md) — Methodology is the first and most important wizard question
- [ADR-014](ADR-014-config-schema-versioning.md) — Config schema that the wizard produces
- [ADR-028](ADR-028-detection-priority.md) — Detection priority (v1 > brownfield > greenfield) consumed by the wizard
- Domain 14 ([14-init-wizard.md](../domain-models/14-init-wizard.md)) — Full specification of wizard flow, smart suggestion, and adaptive questions
