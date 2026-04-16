# Changelog

All notable changes to Scaffold are documented here.

## [Unreleased]

### Added
- **Backend fintech domain sub-overlay** — `BackendConfig.domain` accepts `'none' | 'fintech'` (default `'none'`). Opt in via wizard prompt or `--backend-domain fintech` (both `scaffold init` and `scaffold adopt`). Fintech-specific guidance — compliance (PCI-DSS, SEC 17a-4, SOC 2), ledger design, broker integration, order lifecycle, risk management, testing, data modeling, observability — is appended to the relevant pipeline steps via `content/methodology/backend-fintech.yml` and 8 new knowledge docs under `content/knowledge/backend/backend-fintech-*.md`. Mirrors the existing `research-quant-finance` sub-overlay pattern.
- **Multi-service manifest schema**: `ProjectSchema.services[]` accepts an array of per-service configs (each with `name`, `projectType`, one matching per-type config, and optional `path`). Service names must be kebab-case.
- **Declarative init**: `scaffold init --from <file.yml>` reads a full ScaffoldConfig from YAML (or stdin via `-`) instead of running the wizard. Exclusive with config-setting flags.
- **Multi-service execution guard**: `scaffold run`, `next`, `complete`, `skip`, `status`, `rework`, `reset`, `info`, and `dashboard` reject configs containing `services[]` with a clear "lands in Wave 2" message until multi-service execution ships.
- **Cross-service pipeline content (Wave 2)** — 5 new pipeline steps and 8 restructured knowledge documents supporting multi-service projects:
  - **Pipeline steps**: `cross-service-ownership-map`, `cross-service-contracts`, `cross-service-auth`, `cross-service-observability`, `cross-service-test-plan` — each injects domain expertise into the appropriate pipeline phases for multi-service projects.
  - **Knowledge docs**: `multi-service-architecture`, `multi-service-data-ownership`, `multi-service-api-contracts`, `multi-service-auth`, `multi-service-observability`, `multi-service-testing`, `multi-service-resilience`, `multi-service-task-decomposition` — all restructured with a concise `## Summary` (≤80 lines) and full-depth `## Deep Guidance` section.
  - **`multi-service` preset**: registered in all three methodology YAMLs; enables the 5 cross-service steps while exempting them from phase-ordering and terminal-output constraints.
  - **`PipelineOverlay` structural overlay**: `loadStructuralOverlay()` injects cross-service steps when `services[]` is present; the overlay resolves after the project-type overlay in `resolveOverlayState()`.

### Changed
- **State `schema-version`**: widened from literal `1` to `1 | 2`. Projects with `services[]` initialize state at version 2; single-service projects stay at version 1. The v2 shape is identical to v1 for Wave 3a; Wave 3b will change the shape and bump to 3.
- **`ProjectSchema.superRefine` refactored**: per-type coupling validation moved into `src/config/validators/` modules shared by `ProjectSchema` and the new `ServiceSchema`. Behavior-preserving.
- **`runWizard()` split**: `collectWizardAnswers` + `materializeScaffoldProject` exported separately. `scaffold init --from` uses the materializer directly.
- **`scaffold init` exit code on existing `.scaffold/` without `--force`**: now exits with code 2 and a `ScaffoldUserError` diagnostic, consistent with the rest of the Wave 3a `--from` error surface. Previously exited with code 1 via the wizard's `WizardResult.errors` path. User-visible but trivial — the error message is clearer and the behavior is preserved.

## [3.16.0] — 2026-04-13

### Added
- **MMR CLI v0.2.0–v1.1.0** — 11 releases resolving all 45 audit findings plus the new `reconcile` command
- **`mmr reconcile` command** — inject external review findings (from agent skills, manual reviews) into existing MMR jobs for unified reconciliation
- **4-channel review flow** — 3 CLI channels via `mmr review` + agent skill via `mmr reconcile`
- **Verdict system** — `pass`/`degraded-pass`/`blocked`/`needs-user-decision` replaces binary gate
- **Compensating passes** — Claude-based review for unavailable channels
- **`--sync` mode** — single-command review pipeline for agents and CI

### Changed
- **Tool specs aligned with CLI-first architecture** — `review-pr`, `review-code`, `post-implementation-review` updated for MMR CLI + `mmr reconcile` 4-channel flow
- **Knowledge base updated** — `multi-model-review-dispatch`, `automated-review-tooling` match CLI implementation
- **CLAUDE.md MMR section** — CLI-first model, correct channel names, `mmr reconcile` quick reference
- **README.md** — MMR section updated with `--sync` as primary entry point, `reconcile` command documented

### Fixed
- MMR dispatcher: concurrent write race, stdin crash, timeout race, sequential dispatch, orphan cleanup
- MMR parser: string-aware brace counting, Gemini validation, markdown newline escaping
- MMR auth: POSIX-portable `command -v`, timeout retry, skipped channel recording
- MMR store: job ID collision risk, JSON validation, deterministic reconciliation

## [3.15.0] — 2026-04-12

### Added
- **Research project type** — scaffold's 10th project type, covering
  autonomous and semi-autonomous experiment loops where an LLM agent (or
  human-guided script) iterates through hypothesis → experiment → evaluation
  cycles.
  - **Three research domains** with deep knowledge bases: `quant-finance`
    (trading strategy backtesting, risk metrics, market data), `ml-research`
    (architecture search, ablation studies, experiment tracking), and
    `simulation` (physics/materials parameter optimization, compute
    management).
  - **Four experiment drivers**: `code-driven` (agent edits source files),
    `config-driven` (agent generates config files), `api-driven` (agent calls
    experiment APIs), `notebook-driven` (agent edits notebooks).
  - **Three interaction modes**: `autonomous` (run until interrupted),
    `checkpoint-gated` (pause for human review), `human-guided` (human
    decides, agent executes).
  - **Smart wizard filtering** — `autonomous` mode is automatically hidden
    when `notebook-driven` is selected (notebooks require human readability).
  - **25 domain knowledge files** injected into 21 pipeline steps via the
    overlay system.
  - **Tiered project detection** for `scaffold adopt` — detects autoresearch
    protocol files, trading/simulation/optimization framework deps, and
    academic research artifacts (.tex, .bib, paper/).
  - **CLI flags**: `--research-driver`, `--research-interaction`,
    `--research-domain`, `--research-tracking`.
- **Generic domain sub-overlay system** — project types can now define
  domain-specific knowledge overlays that layer on top of the core type
  overlay. The research type uses this for its three domains, but the
  mechanism is reusable by future types. Sub-overlays are knowledge-only
  (enforced at loader level).
- **Shared detector signal library** — `ML_FRAMEWORK_DEPS` and
  `EXPERIMENT_TRACKING_DEPS` extracted to `shared-signals.ts` for reuse
  across ML and research detectors.

## [3.14.0] — 2026-04-13

### Added
- **Graceful shutdown** — Ctrl+C now exits cleanly with informative messages
  instead of dumping stack traces. A centralized `ShutdownManager` handles
  signal cleanup across all CLI commands.
  - **Three-stage Ctrl+C** in TTY mode: first press runs cleanup and exits,
    second press warns "Press Ctrl+C again to force quit", third force-quits.
    Non-TTY (CI) gets immediate clean exit on first signal.
  - **`withPrompt()`** catches `@inquirer/prompts` `ExitPromptError` by name
    and triggers graceful shutdown — no more stack traces during interactive
    prompts.
  - **`withResource()`** provides idempotent cleanup guards for advisory locks
    and in-progress state. Cleanup runs exactly once whether triggered by
    shutdown or normal code path completion.
  - **`withContext()`** uses `AsyncLocalStorage` for phase-aware exit messages
    (e.g., "Cancelled. No changes were made." during wizard vs. "Partial output
    may exist." during build).
  - **Lock ownership guard** in `process.on('exit')` safety net prevents
    deleting another process's lock file (per ADR-019).
  - **`AbortSignal`** integration for HTTP request cancellation in `scaffold
    version` and `scaffold update`.
  - **Spinner auto-registration** — the spinner cleans up automatically on
    shutdown without command-level wiring.
  - **All 8 lock-holding commands integrated**: init, run, build, adopt, skip,
    complete, rework, reset.

### Changed
- **Exit code for user cancellation** changed from 130 (POSIX) to 4
  (`ExitCode.UserCancellation`) per ADR-025. This is a **breaking change** for
  automation that checks for exit code 130.
- `scaffold run` internally uses `process.exitCode` instead of `process.exit()`
  for all exit paths, enabling `withResource` cleanup to run.
- HTTP version-check timers in `version.ts` and `update.ts` now use `.unref()`
  so they don't block process exit during shutdown.

### Fixed
- **`scaffold run` Ctrl+C during confirmation prompts** no longer shows
  `RUN_UNEXPECTED_ERROR` — prompts are now wrapped in `withPrompt()`.
- **`scaffold build` Ctrl+C** no longer reports "Build complete" with partial
  output — exits with code 1 and skips success message.
- **Lock cleanup with `--force`** no longer claims ownership of locks that
  weren't acquired, preventing accidental deletion of another process's lock.

## [3.13.0] — 2026-04-12

### Added
- **Wizard helper text** — every `scaffold init` prompt now shows inline
  descriptions so users understand exactly what they're choosing.
  - **Per-option descriptions** on all `select`/`multiSelect` prompts with
    friendly labels (e.g., "Single-page app (SPA)" instead of raw `spa`) and
    hanging-indent one-line explanations beneath each option.
  - **`?` for long help** — typing `?` at any choice prompt shows a paragraph
    of recommendation/consequence guidance, then re-renders the options.
  - **Dim short hints** above `prompt`/`confirm`/`multiInput` calls when the
    question benefits from a one-line explanation.
  - **First-prompt banner** — "Tip: Type ? at any choice prompt to see help."
    appears once before the first select, suppressed in auto/non-interactive
    modes.
  - **Type-safe copy system** — helper text lives in `src/wizard/copy/` (one
    file per project type), derived from Zod config schemas via a
    `QuestionCopy<TValue>` conditional type. Adding an enum value to a schema
    without matching copy is a compile error.
  - **Label text accepted as input** — users can type the displayed label
    (case-insensitive) instead of the raw enum value.

### Fixed
- **`NO_COLOR` no longer disables interactivity** — previously, setting
  `NO_COLOR=1` silently skipped all prompts and used defaults. Now it only
  strips ANSI color codes, per the [no-color.org](https://no-color.org/) spec.
- **Piped stdin no longer crashes the wizard** — `isTTY()` was only checking
  stdout; now `canPrompt()` checks both stdin and stdout before entering
  interactive mode.
- **`select()` trims input before matching** — trailing whitespace (e.g.,
  `'spa '`) no longer causes silent fallback to the default.
- **`select()`/`multiSelect()` re-prompt on invalid input** — previously
  returned the default silently; now prints an error and re-prompts.
- **`multiSelect()` warns on partial invalid input** — mixed valid/invalid
  entries (e.g., `1, banana, 2`) now print "Ignored unrecognized: banana"
  instead of silently dropping the bad entry.
- **Ctrl-C exits cleanly** — `init` now catches `ExitPromptError` and exits
  with code 130 and a "Cancelled." message instead of dumping a stack trace.
- **Multi-model review pipeline hardened** — comprehensive overhaul of the MMR
  pipeline based on lessons learned during the spark tool implementation (v3.11.0).
  - **Foreground-only constraint** — Codex and Gemini CLIs must always run as
    foreground Bash calls. Background execution (`run_in_background`, `&`, `nohup`)
    produces empty output. This constraint is now enforced in all knowledge entries,
    CLAUDE.md, review tool prompts, and the multi-model-dispatch skill.
  - **Compensating passes** — when an external channel (Codex or Gemini) is
    unavailable, Claude runs a self-review pass focused on that channel's strength
    area (Codex: implementation correctness, security, API contracts; Gemini:
    architectural patterns, design reasoning, broad context). Findings are labeled
    `[compensating: Codex-equivalent]` or `[compensating: Gemini-equivalent]` and
    treated as single-source confidence.
  - **Four-verdict system** — review-code and review-pr tools now use formal verdicts
    (`pass`, `degraded-pass`, `blocked`, `needs-user-decision`) with precedence rules.
    post-implementation-review uses coverage indicators (`full-coverage`,
    `degraded-coverage`, `partial-coverage`) instead, as it is report-oriented.
  - **Canonical channel status vocabulary** — standardized across all files:
    `not_installed`, `auth_failed`, `auth_timeout`, `completed`, `failed`, plus
    `compensating (X-equivalent)` coverage labels. Two-track status model
    (root-cause + coverage label) for clear reporting.
  - **Scope delineation** — `multi-model-review-dispatch` owns dispatch mechanics,
    `automated-review-tooling` owns orchestration/verdicts/compensating passes,
    `review-methodology` owns severity definitions. Cross-references replace
    duplicated content.
  - **CLAUDE.md streamlined** — review section now references `scaffold run review-pr`
    as the entry point with a quick-reference escape hatch, instead of 35 lines of
    raw CLI commands.
  - **MMR CLI spec updated** — auth cache (5min TTL), global exit code table,
    compensation eligibility matrix, unified 8-row consensus table, expanded
    lifecycle state machine with preflight states, and `.meta.json` per-channel
    metadata schema.

## [3.11.0] — 2026-04-11

### Added
- **`scaffold run spark` — idea exploration and expansion tool** — a new stateless
  tool that takes a vague project idea ("a game about cats," "an app for tracking
  recipes") and turns it into a well-formed idea brief (`docs/spark-brief.md`)
  through Socratic questioning and active research. Spark is two things in one:
  an interviewer that asks hard questions AND a research companion that explores
  the problem space and brings back insights you haven't considered.
  - **6-phase conversational framework**: Seed (capture the idea) → Research
    (competitive landscape) → Expand (innovation and adjacent opportunities) →
    Challenge (stress-test assumptions and sharpen scope) → Synthesize (write the
    brief) → Red-Team (adversarial review at depth 4+).
  - **Depth-scaled behavior**: Depth 1 is knowledge-only (quick sanity check),
    depth 2-3 adds web research, depth 4 dispatches to one external model for
    independent competitive analysis, depth 5 does multi-model research with
    reconciliation plus adversarial red-teaming.
  - **Rerun support**: If `docs/spark-brief.md` already exists, spark offers
    update mode (deepen/revise existing brief) or fresh mode (start over).
  - **Feeds into create-vision**: The spark brief is automatically detected by
    `create-vision` as optional upstream context. Vision enters "accelerated
    mode" — using the brief as a baseline and asking targeted follow-up questions
    to deepen and validate hypotheses, rather than re-exploring from scratch.
  - **Game-aware**: When the game overlay is active (`projectType: game`), spark
    automatically gains game-specific ideation lenses — core loop identification,
    player fantasy, retention mechanics, session design, and monetization models.
- **3 new knowledge entries**:
  - `ideation-craft` — Socratic questioning techniques, competitive research
    methodology, lightweight expansion patterns, brief synthesis with confidence
    tagging, worked examples, and anti-patterns.
  - `multi-model-research-dispatch` — dispatch patterns for sending research
    and adversarial challenge to external AI models (Codex, Gemini) with
    reconciliation rules, single-model fallback (VC/competitor PM/skeptical
    user perspectives), timeout handling, and quality gates.
  - `game-ideation` — game-specific ideation techniques including core loop
    evaluation worksheet, player fantasy alignment tests, retention mechanics,
    session design by platform, monetization model guidance, scoping by project
    scale, and common game ideation anti-patterns.
- **`tech-stack` now consumes spark brief** — the Technology Opportunities
  section from the spark brief is available as supplementary input when
  researching technology options, with a freshness guard that ignores stale
  briefs.

### Changed
- Updated tool count references (10 → 11 tools, 61 → 64 knowledge entries)
  across CLAUDE.md, project-structure.md, and prompt-pipeline.md.

## [3.10.0] — 2026-04-10

### Added
- **Multi-type detection in `scaffold adopt`** — extends adoption beyond game projects
  to detect 8 new project types: web-app, mobile-app, backend, cli, library,
  data-pipeline, ml, browser-extension. Each type has its own detector with
  file/manifest-based signals and confidence tiers (high/medium/low). Game detection
  rewritten to use the same SignalContext API (behavior preserved, regression test
  added before relocation).
- **Interactive disambiguation** — when multiple project types match, scaffold adopt
  presents a single radio prompt showing all matches with their evidence. Under
  `--auto`, ambiguity exits with `ExitCode.Ambiguous = 6`.
- **`scaffold adopt` accepts all 32 init flags from R1-R3** — `--project-type`,
  `--web-rendering`, `--backend-api-style`, `--mobile-platform`, etc. Flags override
  detected values. Flag-family validation infrastructure extracted to a shared
  `src/cli/init-flag-families.ts` module.
- **`AdoptionResult.detectedConfig`** — discriminated union holding the finalized
  typed config (post-Zod-parse) for any of 9 project types.
- **`detectionEvidence` and `detectionConfidence`** fields on `AdoptionResult` for
  transparency into what triggered each detection.
- **Atomic config + state writes** — tmp + rename pattern eliminates partial-write
  corruption on POSIX and Windows.
- **Comment-preserving config edits** — adopt now uses the `yaml` package's
  `parseDocument` AST API to mutate `config.yml` in place, preserving user comments,
  blank lines, key order, and CRLF/LF line endings.
- **Re-adoption support** — running `scaffold adopt` on an already-adopted project:
  without `--force`, detection is skipped; with `--force`, detection re-runs and
  fills in missing typed-config fields without overwriting user-set values.
- **`--dry-run`** runs full detection + merge pipeline in memory and emits proposed
  changes without writing.
- **New `ExitCode.Ambiguous = 6`** for "operator action required" outcomes.

### Changed
- **`runAdoption` is now async** — necessary because the disambiguation prompt is
  async. All callers updated to await.
- Detection runs through a new `SignalContext` abstraction at
  `src/project/detectors/`. Game detection moved out of inline `adopt.ts` code.
- `scaffold adopt --force` now lets low-confidence matches participate in
  disambiguation (in addition to overriding existing `projectType`).
- New dependencies: `yaml ^2.8.3` (AST-based YAML mutation for adopt writes),
  `smol-toml ^1.6.1` (TOML parsing for pyproject.toml and Cargo.toml signals).
- `ConfigSchema` `methodology` and `platforms` fields now have explicit Zod defaults
  so a bootstrap config with only `version: 2` and `project: {}` is loadable.

### Deprecated
- **`AdoptionResult.gameConfig`** field — use `detectedConfig` (when
  `type === 'game'`) instead. Removed in v4.0.0.
- **JSON output `game_config` field** — use `detected_config.config` instead.
  Removed in v4.0.0.
- **JSON output top-level `project_type` field** — use `detected_config.type`
  instead. Removed in v4.0.0.

A one-time stderr notice fires on every game adoption to alert consumers.

### Fixed
- **Existing inline game detection** had no precedence regression test for the
  Unity > Unreal > Godot ordering. v3.10 adds the test before relocating the logic.
- `js-yaml.dump` calls in adopt's config-write path destroyed user comments and
  line endings. Replaced with `yaml.parseDocument` AST mutation.
- `scaffold adopt` no longer crashes on filesystem permission errors (`EACCES`,
  `ELOOP`, `ENOTDIR`) — gracefully degrades with warnings.
- `scaffold adopt` no longer hangs in non-TTY environments without `--auto` (CI
  runners, piped stdin) — disambiguation detects non-TTY and treats as `--auto`.
- Cross-platform: detection works on case-insensitive filesystems (macOS APFS,
  Windows NTFS) by using readdir-based exact-case matching.

### Migration

**Upgrading from v3.9.x to v3.10.0:** No code changes required. Existing
`config.yml` files written by v3.9.x continue to work. New `scaffold adopt` runs
on previously-adopted projects skip detection (info message); pass `--force` to
re-detect.

**Deprecated fields (removed in v4.0):** `AdoptionResult.gameConfig`, JSON
`game_config`, JSON top-level `project_type`. Use `detectedConfig` /
`detected_config` instead. Both old and new fields are emitted in v3.10.

**Project types not detected in v3.10** (deferred to v3.11+): Rails, Laravel,
Spring Boot, ASP.NET Core, Quarkus, Symfony, Sinatra (Ruby/PHP/JVM/.NET backends);
Maven/Gradle/.NET libraries; Vike, Qwik, Solid, Preact (web frameworks); Bun.serve,
Deno.serve, Cloudflare Workers (runtimes). Pass `--project-type <type>` manually.

## [3.9.2] — 2026-04-07

### Changed (internal)

- **`coerceCSV` extracted** from `src/cli/commands/init.ts` to `src/cli/utils/coerce.ts` as a reusable helper, with 8 unit tests covering CSV parsing edge cases.
- **`GameConfig` type derived from Zod** via `z.infer<typeof GameConfigSchema>`, matching the pattern used by all 8 newer config types. Eliminates drift risk between the manual interface and the Zod schema. `GameEngine` is now derived as `GameConfig['engine']`.
- **`WizardOptions` flag fields grouped by project type** — the 40+ flat type-specific fields are now organized into 9 per-type interfaces (`GameFlags`, `WebAppFlags`, `BackendFlags`, `CliFlags`, `LibraryFlags`, `MobileAppFlags`, `DataPipelineFlags`, `MlFlags`, `BrowserExtensionFlags`) extracted to `src/wizard/flags.ts`. Adding a new project type is now a focused change instead of editing 4+ disconnected places. No behavior changes — CLI flag names and field names within groups are unchanged.

## [3.9.1] — 2026-04-07

### Fixed

- **ML auto-init for inference projects**: `scaffold init --auto --project-type ml --ml-phase inference` (and `--ml-phase both`) now succeeds. Previously the wizard hard-coded `servingPattern: 'none'` under `--auto`, which the schema rejects when `projectPhase` is `inference` or `both`. The wizard now defaults `servingPattern` to `'realtime'` when phase is inference/both, matching the schema's cross-field validation.

## [3.9.0] — 2026-04-07

### Added

- **Data-pipeline, ML, and browser-extension project-type overlays** — three new overlay files (`data-pipeline-overlay.yml`, `ml-overlay.yml`, `browser-extension-overlay.yml`) inject domain-specific knowledge into existing pipeline steps based on project type. Data-pipeline overlay covers batch and streaming patterns, orchestration, schema management, data quality, and observability. ML overlay covers training and serving patterns, experiment tracking, model evaluation, MLOps observability, and security. Browser-extension overlay covers manifest configuration, content scripts, service workers, cross-browser compatibility, store submission, and security.
- **3 new `ProjectType` enum values** — `data-pipeline`, `ml`, and `browser-extension` are now valid project types in `ProjectTypeSchema`. Each type has a strict `*Config` Zod schema with cross-field validation derived as a TypeScript type.
- **13 new CLI flags for `scaffold init`** — non-interactive configuration for the three new project types:
  - **Data-pipeline flags** (auto-set `--project-type data-pipeline`): `--pipeline-processing` (batch/streaming/hybrid), `--pipeline-orchestration` (none/dag-based/event-driven/scheduled), `--pipeline-quality` (none/validation/testing/observability), `--pipeline-schema` (none/schema-registry/contracts), `--pipeline-catalog` (boolean)
  - **ML flags** (auto-set `--project-type ml`): `--ml-phase` (training/inference/both), `--ml-model-type` (classical/deep-learning/llm), `--ml-serving` (none/batch/realtime/edge), `--ml-experiment-tracking` (boolean)
  - **Browser-extension flags** (auto-set `--project-type browser-extension`): `--ext-manifest` (2/3), `--ext-ui-surfaces` (popup/options/newtab/devtools/sidepanel, comma-sep), `--ext-content-script` (boolean), `--ext-background-worker` (boolean)
  - Cross-family validation: cannot mix `--pipeline-*`, `--ml-*`, `--ext-*` flags with each other or with existing `--web-*`, `--backend-*`, `--cli-*`, `--lib-*`, `--mobile-*`, or game flag families.
  - Help text grouped into Data Pipeline / ML / Browser Extension Configuration sections.
- **36 domain knowledge entries** — 12 data-pipeline entries (architecture, batch patterns, streaming patterns, orchestration, schema management, quality, testing, conventions, project structure, dev environment, requirements, security), 12 ML entries (architecture, training patterns, serving patterns, experiment tracking, model evaluation, observability, testing, conventions, project structure, dev environment, requirements, security), 12 browser-extension entries (architecture, manifest, service workers, content scripts, cross-browser, store submission, testing, conventions, project structure, dev environment, requirements, security). Knowledge base now totals **194 entries in 16 categories**.
- **ML inference/serving cross-field validation** — `ConfigSchema` now rejects `mlConfig` when `projectPhase: inference` is paired with `servingPattern: none` (an inference project must specify how it serves predictions), and rejects `projectPhase: training` paired with any non-`none` serving pattern (training-only projects should not declare a serving pattern).
- **Browser-extension empty-capability validation** — `ConfigSchema` now rejects `browserExtensionConfig` when an extension declares zero UI surfaces, no content script, and no background worker — every extension must have at least one runtime capability.
- **Data-pipeline, ML, and browser-extension wizard questions** — progressive-disclosure wizard for each new project type. `--auto` mode requires `--pipeline-processing` (data-pipeline) and `--ml-phase` (ml); browser-extension has no required flag in `--auto` mode (all fields have safe defaults).

## [3.8.0] — 2026-04-06

### Added

- **Library and mobile-app project-type overlays** — two new overlay files (`library-overlay.yml`, `mobile-app-overlay.yml`) inject domain-specific knowledge into existing pipeline steps based on project type. Library overlay covers API design, bundling, type definitions, versioning, documentation, and testing. Mobile-app overlay covers architecture, offline patterns, push notifications, deployment, distribution, and platform-specific testing.
- **9 new CLI flags for `scaffold init`** — non-interactive configuration for the two new project types:
  - **Library flags** (auto-set `--project-type library`): `--lib-visibility` (public/internal), `--lib-runtime-target` (node/browser/isomorphic/edge), `--lib-bundle-format` (esm/cjs/dual/unbundled), `--lib-type-definitions` (boolean), `--lib-doc-level` (none/readme/api-docs/full-site)
  - **Mobile-app flags** (auto-set `--project-type mobile-app`): `--mobile-platform` (ios/android/cross-platform), `--mobile-distribution` (public/private/mixed), `--mobile-offline` (none/cache/offline-first), `--mobile-push-notifications` (boolean)
- **24 domain knowledge entries** — 12 library entries (architecture, API design, bundling, type definitions, versioning, documentation, testing, conventions, project structure, dev environment, requirements, security) and 12 mobile-app entries (architecture, offline patterns, push notifications, deployment, distribution, testing, conventions, project structure, dev environment, requirements, security, observability)
- **Public library + no docs cross-field validation** — `ConfigSchema` now rejects `visibility: public` with `documentationLevel: none` in `libraryConfig`, preventing contradictory configurations where a public library ships without documentation.

## [3.7.0] — 2026-04-06

### Added

- **Project-type overlays for web-app, backend, and CLI** — three new overlay files (`web-app-overlay.yml`, `backend-overlay.yml`, `cli-overlay.yml`) inject domain-specific knowledge into existing pipeline steps based on project type. Each overlay adjusts step enablement, knowledge injection, and artifact references without modifying methodology presets.
- **12 new CLI flags for `scaffold init`** — non-interactive configuration for the three new project types:
  - **Web-app flags** (auto-set `--project-type web-app`): `--web-rendering` (spa/ssr/ssg/hybrid), `--web-deploy-target` (static/serverless/container/edge/long-running), `--web-realtime` (none/websocket/sse), `--web-auth-flow` (none/session/oauth/passkey)
  - **Backend flags** (auto-set `--project-type backend`): `--backend-api-style` (rest/graphql/grpc/trpc/none), `--backend-data-store` (relational/document/key-value, comma-sep), `--backend-auth` (none/jwt/session/oauth/apikey), `--backend-messaging` (none/queue/event-driven), `--backend-deploy-target` (serverless/container/long-running)
  - **CLI flags** (auto-set `--project-type cli`): `--cli-interactivity` (args-only/interactive/hybrid), `--cli-distribution` (package-manager/system-package-manager/standalone-binary/container, comma-sep), `--cli-structured-output` (boolean)
  - Cross-family validation: cannot mix `--web-*`, `--backend-*`, `--cli-*`, and game flags
  - Cross-field validation: SSR/hybrid rendering rejects static deploy target; session auth rejects static deploy target
  - Help text grouped into Web-App / Backend / CLI / Game Configuration sections
- **`--game-*` flag aliases** — game config flags now have `--game-engine`, `--game-multiplayer`, `--game-target-platforms`, etc. aliases for consistency with other project type flag prefixes. Bare flags like `--engine` still work.
- **41 domain knowledge entries** — 17 web-app entries (rendering strategies, state management, auth, SSR, deploy targets, real-time, PWA, caching, testing, security, accessibility), 14 backend entries (API design, data stores, auth, messaging, observability, deploy, caching, rate limiting, error handling, migrations, testing, security), 10 CLI entries (argument parsing, config management, output formatting, distribution, testing, error handling, plugin architecture, shell integration)
- **Web-app, backend, and CLI wizard questions** — progressive-disclosure wizard for each new project type, with `--auto` mode requiring only the primary config flag (`--web-rendering`, `--backend-api-style`, `--cli-interactivity`)

### Changed

- **`ProjectType` derived from Zod schema** — `ProjectTypeSchema` is now the single source of truth; the `ProjectType` union type is derived via `z.infer`. Adding a new project type only requires updating the Zod enum.
- **`WizardAnswers` consolidated** — removed stale duplicate interface; the canonical definition now includes `webAppConfig`, `backendConfig`, and `cliConfig` fields alongside existing `gameConfig`.
- **`ProjectSchema` uses `.superRefine()` for cross-field validation** — project-type-specific config objects (`webAppConfig`, `backendConfig`, `cliConfig`) are validated against their project type, matching the existing `gameConfig` pattern.
- **Flag families are mutually exclusive** — `scaffold init` rejects mixing flags from different project types at the CLI validation layer.

## [3.6.0] — 2026-04-06

### Added

- **14 new CLI flags for `scaffold init`** — every wizard question can now be answered via CLI flags, enabling fully non-interactive CI/scripting workflows.
  - **General flags**: `--depth` (custom methodology depth 1-5), `--adapters` (AI platforms: claude-code, codex, gemini), `--traits` (project traits: web, mobile)
  - **Game config flags** (auto-set `--project-type game`): `--engine`, `--multiplayer`, `--target-platforms`, `--online-services`, `--content-structure`, `--economy`, `--narrative`, `--locales`, `--npc-ai`, `--modding` / `--no-modding`, `--persistence`
  - Comma-separated array values with auto-deduplication
  - CLI-layer validation: game flags require game project type, `--depth` requires `--methodology custom`, `--online-services` requires multiplayer online/hybrid, locale regex validation
  - Help text grouped into General / Configuration / Game Configuration sections
  - Flag-question skip: flags take highest precedence, then `--auto` defaults, then interactive wizard

### Fixed

- **`--traits` config mapping** — `scaffold init` wizard previously wrote traits to an untyped `project.traits` field (using `ProjectConfig`'s index signature). Now correctly writes to the typed `project.platforms` field matching the `ProjectConfig` interface.

### Changed

- **`--methodology` now validates choices** — rejects invalid values at the CLI layer (previously accepted any string and failed during config parsing).

## [3.5.3] — 2026-04-06

### Fixed

- **Overlay dependency overrides now integrated into dependency graph** — `computeEligible()`, cycle detection, and topological sort all see overlay-resolved dependencies. Previously, `next`/`status` could show a step as eligible when `run` would block it due to an overlay-added dependency (e.g., `user-stories` depending on `review-gdd` in game projects).
- **`run.ts` dep-check simplified** — replaced 3-level fallback chain with single source per step type (graph for pipeline steps, overlay for tools). Removed dead `topologicalSort()` call.

## [3.5.2] — 2026-04-05

### Changed

- **Centralized pipeline resolution** — new `ResolvedPipeline` abstraction (`loadPipelineContext` + `resolvePipeline`) replaces duplicated resolution code across 7 CLI commands. Pipeline resolution sequence (discover → load config → select preset → resolve overlay → build graph) now lives in `src/core/pipeline/` instead of being copy-pasted in each command.
  - 16 files changed, -106 net lines (388 added, 494 removed)
  - Graph built 1x per command instead of 2-6x (performance improvement)
  - Config validation now uses pipeline-only step names (tools no longer leak into validation scope)

### Fixed

- **Custom step enablement overrides now applied** — `config.custom.steps.{name}.enabled` was silently ignored because `resolveEnablement()` was never called by any command. The new `resolvePipeline()` applies custom enablement during preset resolution. Precedence: overlay > custom enablement > preset > disabled.

### Removed

- **`src/utils/eligible.ts`** — standalone factory that reimplemented the entire resolution pipeline; replaced by `resolvePipeline().computeEligible`
- **`src/core/assembly/methodology-resolver.ts`** — dead code (`resolveEnablement()` never called in production)

## [3.5.1] — 2026-04-05

### Fixed

- **P0: Artifact path mismatches in 4 game pipeline steps** — `performance-budgets` referenced `docs/game-design-document.md` (correct: `docs/game-design.md`), `save-system-spec` referenced `docs/domain-model.md` (correct: `docs/domain-models/`), `art-bible` and `audio-design` referenced `docs/content-structure-design.md` (correct: `docs/content-structure/`). All four would cause agents to fail to find required input artifacts.
- **P0: `review-game-ui` injected wrong knowledge domain** — the step's `knowledge-base` referenced `review-game-design` (GDD review passes: pillar coherence, core loop closure, mechanic ambiguity) instead of a game-UI-specific review entry. Created new `review-game-ui` knowledge entry with 7 UI-appropriate passes (HUD hierarchy, menu navigation, controller accessibility, settings coverage, FTUE, state machines, platform shell compliance).
- **P1: Unity runtime fee described as current** — rescinded September 2024; updated `game-engine-selection` to reflect seat-based licensing.
- **P1: ECS guidance ignored Unreal/Godot architectures** — `game-domain-patterns` presented pure ECS as universal; added engine-specific notes for Unreal's Actor-Component model and Godot's Node/Scene composition.
- **P1: Quest 3 GPU drastically underestimated** — `game-vr-ar-design` described it as "2018 mid-range phone GPU" (actual: Snapdragon XR2 Gen 2, ~2022 flagship class).
- **P1: Genre coverage gaps in AI, level design, and input** — `game-ai-patterns` now covers strategy AI, turn-based AI (MCTS/minimax), racing AI, and simulation AI. `game-level-content-design` now covers 2D platformer metrics, tile-based design, and non-spatial content. `game-input-systems` now covers touch/mobile, strategy, and turn-based input patterns.
- **P1: Review step pass names misaligned with knowledge entries** — `review-netcode` passes 5-7 and `review-economy` passes 6-7 now match their corresponding knowledge entry pass names.
- **P2: 12 additional content quality fixes** — GOAP attribution corrected (Shadow of Mordor → Tomb Raider 2013), Quixel Mixer discontinued → Quixel Bridge, Wwise licensing thresholds updated, PVRTC deprecated on iOS (ASTC-only), fixed-point math guidance added for lockstep netcode, Switch save limits clarified (32 MB default), engine-agnostic prose added around Unity-specific code examples (audio, UI, asset pipeline), per-engine DCC export axis settings, genre-specific core loop patterns (turn-based, narrative, management, puzzle), 2D performance budgets, mobile thermal targets.
- **P2: Pipeline step quality criteria and reads improvements** — art-bible style criterion made concrete (hex/RGB ranges), content-structure-design type-specific output criterion added, netcode-spec reads now includes GDD, review steps' empty reads fields populated, SFX variation QC added to audio-design, telemetry integration QC added to playtest-plan, feature priority matrix QC added to GDD, server-authoritative transaction QC added to economy-design.

### Added

- **`docs/game-content-audit-prompt.md`** — reusable 11-module domain quality audit prompt for game development content. Supports iterative passes with delta tracking, finding categories (INACCURATE/INCOMPLETE/SHALLOW/MISMATCHED/OUTDATED), parallelizable as subagents, and a structured final deliverable format. Modeled on the alignment audit prompt architecture.
- **`content/knowledge/review/review-game-ui.md`** — 7-pass game UI review knowledge entry (293 lines) with per-pass check lists, P0-P3 severity examples, and a Finding Template.

## [3.5.0] — 2026-04-05

### Added

- **Game development pipeline support** — new `game` project type with 24 pipeline steps, 29 knowledge entries, and a project-type overlay system. Scaffold can now produce comprehensive game documentation from GDD through platform certification.
  - **24 game-specific pipeline steps** across 5 phases: Game Design Document (GDD) with pillars and core loop, performance budgets (frame/memory/GPU), art bible with asset pipeline, audio design with adaptive music, game UI spec (replaces web design system), content structure design (levels/open-world/procedural), netcode spec, game accessibility (XAG-aligned), economy design, playtest plan, analytics/telemetry, platform certification prep, and 12 more
  - **29 game knowledge entries** providing domain expertise on game engines, networking, audio middleware, save systems, input patterns, VR/AR, localization, modding/UGC, live operations, platform certification, and more — injected into both new and existing pipeline steps
  - **Progressive-disclosure init wizard** — game configuration asks about engine (Unity/Unreal/Godot/custom), multiplayer mode, target platforms, online services, content structure, economy, narrative depth, locales, NPC AI, modding, and persistence
  - **`--project-type` CLI flag** — `scaffold init --project-type game --auto` for non-interactive game project setup in CI/scripts
  - **`scaffold adopt` game engine detection** — automatically detects Unity (.meta files), Unreal (.uproject), and Godot (project.godot) projects and configures the game overlay
  - **Enum-based game traits** — `multiplayerMode`, `narrative`, `contentStructure`, `economy`, `onlineServices`, `persistence`, `targetPlatforms`, `supportedLocales`, `npcAiComplexity`, `hasModding` control which conditional steps activate
- **Project-type overlay system** — new architecture enabling project-type-specific pipeline customization without modifying methodology presets.
  - `game-overlay.yml` layers step enablement, knowledge injection, reads remapping, and dependency adjustments on any methodology (mvp/deep/custom)
  - Extensible to future project types (data pipelines, embedded, etc.) by adding new overlay files
  - `overlay-state-resolver.ts` provides centralized resolution shared by all commands
  - `overlay-loader.ts` parses overlay YAML with graceful error handling
  - `overlay-resolver.ts` applies overlays via replace-then-append-then-dedup algorithm
- **Wizard UI primitives** — `select()`, `multiSelect()`, `multiInput()` methods on `OutputContext` for richer wizard interactions beyond yes/no prompts.
- **Reads assembly** — the `reads` frontmatter field is now wired into prompt assembly context. Steps can declare cross-cutting artifact references that are loaded non-blockingly (missing reads produce warnings, not errors).
- **Centralized overlay resolution** — all pipeline commands (`run`, `status`, `next`, `rework`, `complete`, `skip`, `reset`) are overlay-aware for game projects. Step enablement, knowledge injection, reads remapping, and dependency overrides apply consistently across every command.
- **`GameConfig` type and Zod validation** — full TypeScript type system for game configuration with runtime validation, cross-field rules (`gameConfig` only valid when `projectType === 'game'`), and sensible defaults for all fields.

### Changed

- **Config loader returns Zod-parsed data** — `loadConfig()` now returns `zodResult.data` instead of the raw YAML object, ensuring Zod defaults (including `GameConfig` field defaults) are applied at runtime.
- **Disabled dependencies treated as satisfied in run command** — aligns `run.ts` with `eligibility.ts` behavior, preventing `DEP_UNMET` errors when overlays disable steps.
- **Methodology presets updated** — all three presets (deep, mvp, custom-defaults) now include the 24 game steps as `enabled: false`, preventing `PRESET_MISSING_STEP` warnings. The game overlay enables them when active.

## [3.4.1] — 2026-04-05

### Added

- **Comprehensive mmr documentation in README** — step-by-step setup guide for existing projects, full commands reference, `.mmr.yaml` config schema, severity levels, reconciliation rules, troubleshooting entries, and architecture overview.
- **mmr Homebrew formula** — `brew tap zigrivers/scaffold && brew install mmr` available starting with this release.

### Fixed

- **npm publish workflow** — switched from OIDC trusted publishing to `NPM_TOKEN` secret for reliable automated publishing. Added mmr workspace publish step with graceful skip when version already exists.

## [3.4.0] — 2026-04-05

### Added

- **`@zigrivers/mmr` — Multi-Model Review CLI** — new workspace package (`packages/mmr/`) providing a standalone CLI for dispatching, monitoring, and reconciling multi-model code reviews. Install standalone via `npm install -g @zigrivers/mmr` or use it through Scaffold.
  - **Async job model** — `mmr review` dispatches all channels in background, `mmr status` polls progress, `mmr results` collects and reconciles findings. No more blocking for 4-6 minutes.
  - **Configurable channels** — `.mmr.yaml` defines review channels with per-channel auth checks, CLI flags, environment variables, and output parsers. Ship with builtin presets for Claude, Gemini, and Codex.
  - **Per-channel auth verification** — loud failures with recovery commands, never silent skips. `mmr config test` for pre-flight checks.
  - **Immutable core prompt** — consistent severity definitions (P0-P3) and JSON output format across all channels, with layered project criteria and per-review focus areas.
  - **Automated reconciliation** — consensus/majority/unique classification with confidence scoring. Findings from multiple channels are merged, not duplicated.
  - **Severity gate** — configurable per-project (`.mmr.yaml`) and per-invocation (`--fix-threshold`). Default P2 = fix P0/P1/P2, skip P3.
  - **Multiple output formats** — JSON (default, for machines), text (terminals), markdown (PR comments).
  - **60 tests across 11 files** in the mmr package.
- **Scaffold skill for mmr** — `content/skills/mmr/SKILL.md` provides native integration in Claude Code and other supported environments.
- **Makefile targets** — `mmr-build`, `mmr-test`, `mmr-check` wired into `check-all`.

## [3.3.0] — 2026-04-04

### Added

- **Project-local skills now auto-update on every CLI command** — when you upgrade Scaffold, the next `scaffold run`, `scaffold status`, or any other CLI command silently updates your project's `.claude/skills/` and `.agents/skills/` to match the installed version. No more manual `scaffold skill install` after upgrades.
- **`scaffold init` now installs skills automatically** — project-local skills are ready immediately after initialization, no separate install step needed.

### Changed

- **Skill resolution logic extracted to shared module** — `src/core/skills/sync.ts` is the single source of truth for skill targets, template resolution, and version checking. The `scaffold skill install` command now delegates to this module.
- **`.gitignore` fix**: `/skills/` now correctly ignores only the root-level generated skills directory, not `src/core/skills/`.

## [3.2.2] — 2026-04-04

### Fixed

- **Pipeline frontmatter correctness** — removed redundant `system-architecture` from `review-testing` reads, added undeclared outputs to `workflow-audit`, added missing `system-architecture` to `story-tests` reads.
- **Multi-model QC language standardized** — `tech-stack` now uses "findings synthesized" consistent with all other multi-model steps.
- **`innovate-vision` knowledge aligned with step scope** — replaced feature-scoped `prd-innovation` with new `vision-innovation` knowledge entry covering strategic innovation (market positioning, ecosystem plays, contrarian bets).
- **Test skeleton generation knowledge added** — new `test-skeleton-generation` knowledge entry for `story-tests` step, covering Given/When/Then to test framework translation, layer assignment heuristics, and story-tests-map format.

### Added

- **"After This Step" reference validation eval** — new eval verifies that pipeline step "After This Step" sections reference valid step/tool names.

## [3.2.1] — 2026-04-03

### Fixed

- **MVP implementation-playbook now waits for implementation-plan** — added `implementation-plan` as a direct dependency of `implementation-playbook`, fixing MVP mode where the entire intermediate dependency chain was disabled and the playbook became eligible before the plan existed.
- **Stale `docs/architecture.md` references fixed** — three files (post-implementation-review tool, enhancement-workflow knowledge, post-implementation-review-methodology knowledge) referenced `docs/architecture.md` instead of the correct `docs/system-architecture.md`.
- **Review step QC criteria now match methodology scaling** — `review-domain-modeling` and `review-adrs` MVP criteria no longer say "all passes executed" when methodology says "quick check only"; `implementation-plan-review` architecture coverage criterion re-tagged as `(deep)` since architecture is unavailable at MVP.
- **Vision phase added to pipeline reference tables** — `prompt-pipeline` tool and `scaffold-pipeline` skill Pipeline Order table now include `create-vision`, `review-vision`, and `innovate-vision` steps.
- **`design-system` frontmatter no longer hardcodes `tailwind.config.js`** — output varies by tech stack, so the stack-specific config file was removed from the declared outputs.
- **`implementation-playbook` reads field expanded** — added `git-workflow` and `user-stories` to improve data-flow traceability.

## [3.2.0] — 2026-04-03

### Changed

- **Project directory restructured: all build inputs now live under `content/`** — `pipeline/`, `tools/`, `knowledge/`, `methodology/` moved into `content/` to make the data flow visible: `content/` (build inputs) → `src/` (assembly engine) → `.scaffold/generated/` (adapter output).
- **Skills consolidated to single-source templates** — `skills/` and `agent-skills/` (3 copies each) merged into `content/skills/` with `{{INSTRUCTIONS_FILE}}` template markers resolved per platform during `scaffold build` and `scaffold skill install`.
- **Slash commands removed** — the `commands/` directory (73 pre-rendered command files) has been removed. Use `scaffold run <step>` via the CLI or the scaffold runner skill instead.
- **`dist/` and `skills/` are now gitignored** — build output and generated skills are no longer tracked in git. They are regenerated during `npm run build` and `scaffold build` respectively.
- **Documentation reorganized** — active architecture docs moved to `docs/architecture/`, historical artifacts archived to `docs/archive/`, `prompts.md` (v1 monolith) archived.

### Removed

- `commands/` directory (73 slash command files) — superseded by CLI + runner skill
- `agent-skills/` directory — consolidated into `content/skills/`
- `scripts/install.sh`, `scripts/uninstall.sh`, `scripts/extract-commands.sh` — dead code
- `.beads/` — legacy task tracker no longer used
- `prompts.md` — archived to `docs/archive/prompts-v1.md`

### Migration

If you are a **Scaffold contributor** (working on the Scaffold repo itself):
- Paths have changed: `pipeline/` → `content/pipeline/`, `tools/` → `content/tools/`, etc.
- `make install` and `make extract` targets have been removed
- Run `make check-all` to verify your environment works with the new layout

If you are a **downstream user** (using Scaffold to scaffold your own project):
- No action needed — the CLI and `scaffold skill install` continue to work as before
- The npm package layout changed but the public API is unchanged

## [3.1.0] — 2026-04-03

### Added

- **First-class Gemini CLI runner support for Scaffold projects** — `gemini` is now a supported platform in `.scaffold/config.yml`, the init wizard can enable it directly, and `scaffold build` now generates Gemini-native project output instead of leaving Gemini users without a runner path.
- **Gemini project-local command generation** — Scaffold now creates a managed root `GEMINI.md`, shared `.agents/skills/scaffold-runner/` and `.agents/skills/scaffold-pipeline/` installs, plus `.gemini/commands/scaffold/*.toml` wrappers so Gemini users can run flows like `scaffold status` and `scaffold create-prd` in-project.

### Changed

- **`scaffold skill install` now installs shared agent skills as well as Claude Code skills** — the CLI now copies the packaged runner/pipeline skills into both `.claude/skills/` and `.agents/skills/`, keeping Claude and Gemini project-local integrations aligned.
- **Gemini support is now packaged and documented as part of the normal Scaffold install/build flow** — `agent-skills/` is now shipped in the npm package, and the README/reference docs now describe the correct Gemini invocation model, generated files, and project structure.

## [3.0.2] — 2026-04-02

### Changed

- **`/scaffold:release` is now documented as a project-defined release ceremony** — `README.md`, `tools/release.md`, `commands/release.md`, the runner/pipeline skills, and reference docs now describe release artifacts as target-project-specific instead of assuming every project creates a GitHub release or publishes to npm.
- **`/scaffold:version-bump` now clearly stops short of the formal release ceremony** — companion docs now say it updates versions and changelog without tags, push, or any project-specific release artifacts.
- **Scaffold maintainer release docs now describe the real Scaffold release flow** — `AGENTS.md`, `CLAUDE.md`, and `docs/v2/operations-runbook.md` now distinguish generic downstream release behavior from Scaffold's own release process: review `README.md` when applicable, merge release prep to `main`, tag `vX.Y.Z`, create the GitHub release manually, and verify both npm publish and Homebrew update workflows.

## [3.0.1] — 2026-04-02

### Changed

- **Scaffold maintainer docs no longer imply the Scaffold repo uses Beads internally** — `AGENTS.md`, `CLAUDE.md`, `docs/git-workflow.md`, `docs/dev-setup.md`, `docs/v2/operations-runbook.md`, and `docs/v2/security-practices.md` now describe Scaffold's own maintainer workflow without `bd`, `.beads/`, or Beads-specific tracker assumptions, while keeping Beads available for downstream generated projects.
- **Maintainer quality-gate guidance is now consistent on `make check-all`** — repo entrypoints and supporting docs now distinguish `make check` as the bash-only gate and `make check-all` as the full pre-submit / pre-push gate, matching the current `Makefile` and CI workflow.
- **Product docs now explicitly separate downstream Beads support from Scaffold's own workflow** — `README.md` and `docs/v2/reference/scaffold-overview.md` frame Beads as an optional downstream feature, not the task-tracking workflow used to develop Scaffold itself.

### Fixed

- **`scaffold release` README docs now match the actual release behavior** — the release section now states that releases publish to npm in addition to creating a tag and GitHub release.
- **Knowledge E2E tests now bootstrap cleanly from a checkout without prebuilt `dist/` artifacts** — `src/e2e/knowledge.test.ts` now rebuilds when the CLI bundle or copied knowledge template is missing, and the regression harness passes the full lint/test gate.

## [3.0.0] — 2026-04-02

### Changed

- **Scaffold-generated adapter output now lives under `.scaffold/generated/`** — `scaffold init` and `scaffold build` no longer write root `commands/`, `prompts/`, `codex-prompts/`, or a Scaffold-generated root `AGENTS.md`. Generated Claude Code, Codex, and Universal artifacts now live under hidden `.scaffold/generated/<platform>/...` paths.
- **`scaffold init` now auto-runs `scaffold build`, and Scaffold manages a project `.gitignore` block** — fresh projects now get hidden generated output plus default ignore rules for `.scaffold/generated/`, `.scaffold/lock.json`, and Scaffold temp files, while keeping committed `.scaffold` state files visible.
- **This release is intentionally breaking for older projects** — existing projects must remove legacy root generated output and rebuild. See the README migration section for the exact steps.

### Fixed

- **Legacy-output migration warnings no longer flag a user-owned root `AGENTS.md`** — only a Scaffold-generated root `AGENTS.md` is treated as old generated output during migration.

## [2.45.0] — 2026-04-01

### Added

- **`scaffold run review-code`** — New local three-channel review tool for code that is ready to land but does not have a PR yet. Runs the `Codex CLI`, `Gemini CLI`, and `Superpowers` review paths against the local delivery candidate, supports `--base`, `--head`, `--staged`, and `--report-only`, and gives agents a single structured command for "review before commit/push" workflows.
- **Pre-push review gate in build flows** — `single-agent-start`, `single-agent-resume`, `multi-agent-start`, and `multi-agent-resume` now tell agents to run `scaffold run review-code` when the user or project workflow requires a local review pass before `git push`.

### Fixed

- **`review-code` fallback behavior now matches the shared multi-model review standard** — Codex and Gemini auth failures now surface recovery guidance, retry after re-auth, and degrade gracefully if recovery is not possible instead of blocking the whole review.
- **`review-code` CLI invocation guidance** — The tool now documents prompt passing via temporary files for both Codex and Gemini, avoiding brittle inline-command examples for large review prompts.

## [2.44.3] — 2026-03-31

### Fixed

- **`scaffold version` shows "(up to date)" when installed version is ahead of npm registry** — Added a third state: when the installed version is strictly newer than what the registry reports, the CLI now shows "(ahead of registry)" instead of the misleading "(up to date)".
- **`scaffold release` did not publish to npm** — The release tool's Phase 5 now includes an `npm publish` step after creating the GitHub release, so the npm `latest` tag is always updated as part of a release.

## [2.44.2] — 2026-03-31

### Fixed

- **`scaffold version` shows "update available" when installed version is ahead of npm registry** — Version comparison now uses semver ordering instead of string equality. When the installed version is newer than what npm's `latest` tag reports (e.g., installed 2.43.5, registry shows 2.38.1), the CLI now correctly shows "up to date" rather than "update available".
- **`scaffold run post-implementation-review` not recognized as a tool by scaffold-runner skill** — The skill's Tool Execution section had a hardcoded tool list that was missing `post-implementation-review`. Claude would fall through to pipeline eligibility checking, conclude the step didn't exist, and offer to run the knowledge methodology manually instead of executing the tool.

## [2.44.1] — 2026-03-31

### Fixed

- **`cli-contract.md` updated for `scaffold list --section tools`** — The API contract document now reflects the new `tools` section choice, `--verbose` flag, updated JSON shape (`data.tools.build` + `data.tools.utility`), and added examples. Caught by Codex code review as a P2 discrepancy.

## [2.44.0] — 2026-03-31

### Added

- **`scaffold list --section tools`** — Lists all scaffold tools in two grouped sections: Build Tools (stateless pipeline steps from `pipeline/build/`) and Utility Tools (from `tools/`). Completeness is guaranteed by filesystem scan — adding a tool file automatically includes it with no other changes required.
  - Compact text output by default
  - `--verbose` adds an Arguments column showing `argument-hint` values
  - `--format json` returns `{ tools: { build: [...], utility: [...] } }` for machine-readable use
- **`scaffold-runner` skill updated** — "What tools are available?" now calls `scaffold list --section tools --format json` and renders an enriched two-section display with "when to use" context. If the CLI returns a tool not in the skill's table, it falls back to the CLI's `description` field (graceful degradation).

## [2.43.5] — 2026-03-31

### Fixed

- **`tools/` missing from npm package** — The `tools/` directory (containing all utility tools like `post-implementation-review`, `version`, `release`, etc.) was not listed in `package.json` `files`, so globally installed scaffold had no tools directory and all `scaffold run <tool>` calls returned `STEP_NOT_FOUND`.
- **`scaffold version` showed wrong latest version** — `version.ts` was checking the `scaffold` package on npm instead of `@zigrivers/scaffold`, returning an unrelated package's version as the "latest".
- **URL encoding for scoped npm package names** — Registry lookups for `@zigrivers/scaffold` used the raw package name in the URL path, causing 404s. The `@` and `/` characters are now percent-encoded (`%40zigrivers%2Fscaffold`).

## [2.43.0] — 2026-03-30

### Added

- **`/scaffold:post-implementation-review` tool** — Systematic three-channel code review of an entire scaffold-generated codebase after an AI agent completes all implementation tasks. Unlike `review-pr` (which reviews a git diff), this tool reviews the full implemented codebase against requirements and coding standards. Two-phase approach: Phase 1 cross-cutting sweep (architecture, security, error handling, coverage, complexity, dependencies) runs across the whole codebase; Phase 2 parallel per-user-story review checks each story's acceptance criteria. Three modes: `review+fix` (default), `--report-only`, and auto-detected Update Mode (load prior report, skip re-review). All three channels run independently per phase; findings deduplicated and sorted P0→P1→P2→P3 before fix execution.
- **`post-implementation-review-methodology` knowledge entry** — Documents the two-phase review structure, context-bundling strategy for whole-codebase CLI review, deduplication logic, file-to-story mapping approach, grouping rules for small/large projects, and Update Mode shortcut.

## [2.42.1] — 2026-03-29

### Changed

- **Code reviews now fix P0/P1/P2 findings** — Previously only P0/P1 (blocking/important) findings were mandatory. Now P2 (improvement) findings are also required before proceeding. Updated across all 4 build steps, review-pr tool, multi-model-dispatch skill templates, automated-review-tooling knowledge base, hooks, and CLAUDE.md. Only P3 (trivial nits) are skipped.

## [2.42.0] — 2026-03-29

### Added

- **`/scaffold:review-pr` tool** — Single entry point for running all three code review channels (Codex CLI, Gemini CLI, Superpowers code-reviewer subagent) on a PR. Handles auth verification, independent dispatch, finding reconciliation, and fix loops with user override for unresolved findings. Agents call this once instead of remembering three separate invocations.
- **Mandatory review step in all 4 build commands** — `single-agent-start`, `single-agent-resume`, `multi-agent-start`, and `multi-agent-resume` all now require agents to run all 3 review channels after every PR. Instructions are install-method-agnostic (work for both CLI and plugin installs).
- **Review enforcement hook** — `automated-pr-review` now configures a Claude Code `PostToolUse` hook on `gh pr create` in target projects. The hook injects a self-contained reminder with exact CLI invocations, preventing context decay from causing missed reviews.
- **scaffold-runner updated** — `review-pr` added to the runner's tool list and navigation table (`scaffold run review-pr`).

### Fixed

- **3-round merge escape removed** — Unresolved P0/P1 findings after 3 fix rounds now require user override instead of auto-merging (caught by Codex + Gemini review).
- **Duplicate step numbering** in `multi-agent-resume` — two steps were numbered `4.` (caught by Superpowers code-reviewer).
- **Hook auth check** used pipe (`|`) instead of separate commands between Codex and Gemini auth checks (caught by Gemini review).

## [2.41.0] — 2026-03-29

### Added

- **Round 6 alignment audit** — `docs/comprehensive-alignment-audit-round-6.md` with 58 findings across 8 modules. Zero BROKEN findings (R5 regressions confirmed fixed). Identified systemic QC tagging gap.
- **New eval: depth-level-grouping.bats** — 3 tests preventing grouped depth levels (catches the recurring 2-R1 regression class)
- **New eval: mvp-path-simulation.bats** — 3 tests validating MVP preset dependency chain integrity and step count
- **Hardened build-drift.bats** — New test 3 validates QC phrase parity between pipeline and command files (78 total eval tests, up from 71)

### Fixed

- **93 untagged QC criteria** — Added depth tags (mvp/deep) to QC criteria across 32 pipeline steps. Agents at MVP depth can now distinguish required vs optional criteria.
- **UMS Detect path mismatches** — `review-prd` and `implementation-plan-review` had wrong file paths in Update Mode Specifics Detect field, causing update-mode detection to look for nonexistent files.
- **MVP input availability** — `implementation-plan-review` and `implementation-playbook` marked inputs as "required" that don't exist at MVP depth. Now correctly documented as "required at deep; optional — not available in MVP".
- **implementation-plan QC contradiction** — "Every architecture component has implementation tasks" changed to (deep); new (mvp) criterion "Every user story has implementation tasks" added.
- **new-enhancement gaps** — Added reads for architecture/domain/API/DB/UX docs for impact analysis; added implementation-plan.md to Inputs; added spec-layer artifact update guidance in After This Step; fixed premature version-bump in Phase 5.
- **Multi-model consensus standardization** — `tech-stack` and `platform-parity-review` aligned to Consensus/Majority/Divergent taxonomy (was non-standard phrasing).
- **Traceability language** — `scope-creep-check` changed "traces to" to standard "maps to".
- **Knowledge structure** — Added Summary + Deep Guidance to `critical-path-analysis` and `implementability-review` (now 60/60 entries with proper structure).
- **QC measurability** — Fixed vague "thorough" (new-enhancement), "addressed" (apply-fixes-and-freeze); removed redundant criteria (implementability-dry-run, workflow-audit); split mixed-depth criterion (developer-onboarding-guide).
- **Review scope conflicts** — "All review passes executed" tagged (deep) in review-prd, review-user-stories, review-vision to resolve conflict with MVP-scoped "passes 1-2 only".
- **Build step story-tests-map** — single-agent-start and multi-agent-start now reference docs/story-tests-map.md for test skeleton lookup.
- **innovate-user-stories outputs** — Added docs/user-stories.md to frontmatter outputs (matching pattern of other innovate steps).

## [2.40.1] — 2026-03-29

### Added

- **Stale command detection in `scaffold status`** — Compares modification timestamps of pipeline/knowledge sources against generated commands. Warns when commands are out of date with count and fix command. Also available in JSON output as `staleCommands` field.
- **Pre-commit hook for build drift** — New step 4 in the composite pre-commit hook blocks commits that stage `pipeline/` or `knowledge/` files without corresponding `commands/` changes. Prompts to run `scaffold build`.
- **Alignment audit prompt** — Reusable 8-module audit prompt at `docs/alignment-audit-prompt.md` for periodic pipeline quality audits.
- **Round 5 audit report** — `docs/comprehensive-alignment-audit-round-5.md` with 37 findings (down 57% from Round 4), including new End-to-End Path Simulation module.

### Fixed

- **Flaky `lock-manager.test.ts`** — Tests used wall-clock time for `processStartedAt` instead of actual process start time from `ps`. On slow CI runners, the >2s PID-recycling threshold triggered incorrectly. Now uses real process start time.
- **MVP task decomposition stuck point** — `implementation-plan.md` now has "MVP-Specific Guidance" section explaining layer-based task decomposition when no architecture document exists.
- **Depth regressions** — `operations.md` and `security.md` grouped depth levels (missed in Round 4 fix) expanded to per-level descriptions.

## [2.40.0] — 2026-03-29

### Changed

- **QC measurability** — Standardized traceability language to "maps to >= N" across all spec/planning steps; added framework fallbacks to tdd, coding-standards, story-tests, create-evals; added conditional fallbacks to 4 spec steps for missing domain models
- **Multi-model consensus** — All 19 multi-model steps now define Consensus/Majority/Divergent/Unique classification; multi-model-review-dispatch knowledge entry updated with consensus framework
- **Innovation approval** — 3 innovate steps now require approval status (approved/deferred/rejected) with timestamp
- **Implementation handoff** — Playbook knowledge deepened: story-tests-map in context table for all task types, dependency-failure recovery expanded (status check + 30min pivot + escalation), eval failure category-to-root-cause mapping added
- **Post-pipeline workflows** — new-enhancement now requires playbook update (was optional); quick-task explicitly references playbook quality gates
- **Command rebuild** — All 60 commands regenerated from updated pipeline sources via `scaffold build`

## [2.39.0] — 2026-03-29

### Added

- **New eval: quality-criteria-measurability.bats** — 2 tests validating that Quality Criteria use measurable language and multi-model criteria define consensus thresholds
- **New eval: knowledge-injection.bats** — 3 tests validating knowledge entry structure (Summary+Deep Guidance), reference resolution, and entry count limits
- **Handoff quality improvements** — Implementation playbook now reads domain-models, ADRs, vision, and project-structure; includes test skeleton discovery and dependency-failure recovery guidance

### Changed

- **Depth documentation** — All 45 pipeline steps with grouped depth levels (e.g., "Depth 1-2") now have explicit per-level descriptions (Depth 1 through Depth 5)
- **Quality Criteria measurability** — Fixed 3 BROKEN criteria (create-evals contradiction, implementation-playbook make eval at MVP, system-architecture directory structure duplication) and improved 30+ vague criteria across all phases with measurable thresholds
- **P0-P3 severity standardization** — All review steps now use consistent definitions: P0=Breaks downstream work, P1=Prevents quality milestone, P2=Known tech debt, P3=Polish
- **Mode Detection accuracy** — new-enhancement correctly labeled as "document-modifying" (was "stateless"); quick-task clarifies Beads vs inline persistence
- **Knowledge deepening** — eval-craft (per-category guidance), task-decomposition (critical path/wave planning), prd-craft (NFR quantification), testing-strategy (AC-to-test mapping)
- **Eval gate promotions** — prompt-quality depth tags (threshold 5→35), pipeline-completeness Update Mode Specifics (warning→hard fail), command-structure dead-ends (warning→max 3)

## [2.38.1] — 2026-03-29

### Fixed

- **`scaffold complete`** — Now records `at` timestamp and `completed_by: 'user'` when marking steps as completed. Previously these fields were missing, causing the dashboard to show "—" for completion date on manually completed steps.

## [2.38.0] — 2026-03-29

### Added

- **Phase descriptions** — All 16 phases in the PHASES constant now include a 2-3 sentence `description` field explaining what the phase accomplishes and why it matters.
- **Step summaries** — New optional `summary` frontmatter field (max 500 chars) on all 60 pipeline meta-prompts, providing action-oriented descriptions of what each step does and produces.
- **Dashboard v3** — Complete rewrite of the pipeline dashboard with phase-grouped layout, collapsible sections, step detail modals (with meta-prompt body), What's Next banner, decision log, dark/light theme, responsive design.
- **Dashboard step drill-down** — Click any step to see its summary, metadata (status, date, depth, dependencies, outputs), and the meta-prompt that drives it.

### Changed

- **README Quick Start** — Comprehensive rewrite for less technical users, featuring scaffold runner skill as primary interface with greenfield and brownfield examples.
- **README Pipeline section** — All 16 phase descriptions and 60 step descriptions rewritten in plain language explaining what Claude does and what the user gets.
- **README Multi-Model Review** — Tiered rewrite with code review analogy, quick setup guide, and streamlined structure. Raw CLI invocation moved to FAQ.
- **`scaffold next`** — Now shows step summary (falls back to description) for richer output.
- **`scaffold info`** — Now shows step summary in both human-readable and JSON output.
- **`scaffold build`** — Prefers step summary for longDescription in generated command files.
- **Scaffold Runner skill** — Phase reference table now includes descriptions; batch progress and rework pause templates use step summaries and phase descriptions.
- **Scaffold Pipeline skill** — Phases table now includes descriptions and missing Phase 0 (vision).
- **Dashboard generator** — Extended with phase grouping, enriched step metadata, next eligible computation, and scaffold version.
- **Dashboard template** — Replaced barebones flat list with full-featured phase-grouped UI.
- **Dashboard CLI** — Now loads meta-prompts to provide enriched data to the dashboard.
- **Dashboard tool meta-prompt** — Updated to reference v2 CLI instead of v1 bash script.

## [2.37.0] — 2026-03-29

### Added

- **Phase 15: Build** — New pipeline phase with 6 stateless execution steps (`single-agent-start`, `single-agent-resume`, `multi-agent-start`, `multi-agent-resume`, `quick-task`, `new-enhancement`). Appears in `scaffold next` once phase 14 is complete, always available for repeated use.
- **Tools category** — 7 utility commands (`version-bump`, `release`, `version`, `update`, `dashboard`, `prompt-pipeline`, `session-analyzer`) in new `tools/` directory. Orthogonal to the pipeline, usable at any time.
- **`stateless` frontmatter field** — Steps that don't track completion state. Used by build phase steps and tools.
- **`category` frontmatter field** — Distinguishes pipeline steps (`category: pipeline`) from utility tools (`category: tool`).
- **4 execution knowledge entries** — `tdd-execution-loop`, `task-claiming-strategy`, `worktree-management`, `enhancement-workflow` in `knowledge/execution/`.
- **3 tool knowledge entries** — `release-management`, `version-strategy`, `session-analysis` in `knowledge/tools/`.
- **Scaffold-runner: stateless step support** — Runner handles build phase and tool execution without completion tracking; resume steps conditionally visible.
- **Scaffold-runner: tool execution** — Tools skip eligibility checks, support argument passthrough.

### Changed

- **Build system** scans both `pipeline/` and `tools/` directories for meta-prompts.
- **Dependency graph** excludes tools from topological sort.
- **Eligibility system** shows build phase steps as "available (on-demand)" once dependencies met.
- **13 operational commands** migrated from manually-maintained v1 files to v2 build-generated output with knowledge injection.
- **Agent execution commands** enriched with deep TDD, task claiming, and worktree management knowledge (previously ~10 lines each).

### Fixed

- **V1/V2 parity gap** — 13 commands that bypassed the build system now flow through `scaffold build` with full knowledge-base injection, adapter support, and frontmatter validation.

## [2.36.0] — 2026-03-29

### Added

- **Agent Executability Heuristics** — Five formalized rules for AI-agent-friendly task sizing added to the `task-decomposition` knowledge base: Three-File Rule (max 3 application files), 150-Line Budget (~150 lines net-new code), Single-Concern Rule (no "and" connecting unrelated work), Decision-Free Execution (all design decisions resolved upfront), and Test Co-location (tests in the same task as the code they test). Hard rules with an escape hatch (`<!-- agent-size-exception: reason -->`).
- **Pass 8: Agent Executability** — New review pass in `implementation-plan-review` that evaluates every task against the 5 agent sizing rules. Flags oversized tasks with specific split recommendations. Severity: P0 for 6+ files or 300+ lines, P1 for rule violations without justification.

### Changed

- **Task sizing limits tightened** — `implementation-plan` quality criteria updated from "≤500 lines / 5 files" to "~150 lines / 3 files" with mandatory decision-free execution and test co-location requirements.
- **Implementation plan review** now includes agent executability as a quality gate at all methodology depths (mvp through deep).

## [2.35.0] — 2026-03-29

### Added

- **Round 3 alignment audit** — 119 findings (2 BROKEN, 18 MISALIGNED, 27 MISSING, 72 WEAK), all addressed. Health score improved from 7.5/10 to 8.5/10.
- **Quality Criteria depth tags** — All 54 pipeline steps now have `(mvp)`, `(deep)`, and `(depth 4+)` tags on Quality Criteria items, enabling agents to self-assess at the correct methodology depth
- **New evals: handoff-quality.bats** — 5 tests validating implementation handoff completeness (playbook reads, agent start command references)
- **New evals: methodology-content.bats** — 4 tests validating MVP/deep preset differences and depth tag coverage
- **Eval failure recovery** — Implementation playbook knowledge entry now includes eval-specific troubleshooting guide
- **Dependency failure protocol** — Playbook knowledge entry covers upstream task failure handling
- **Version release integration** — new-enhancement and quick-task commands now reference version-bump after changes
- **Freeze marker format** — Documented exact format in new-enhancement command
- **Conditional Evaluation** — platform-parity-review now documents when to enable/skip
- **Update Mode Specifics** — All 7 validation steps now have multi-model artifact handling guidance

### Changed

- **Quality Criteria measurability** — Replaced vague criteria in 15+ files (domain-modeling invariants, api-contracts errors, database-schema indexes, operations alerts, security validation, implementation-plan task sizing)
- **Quality Criteria completeness** — Added missing criteria to 14 pipeline files (ubiquitous language, decision dependencies, pagination schema, rollback safety, responsive design, RTO/RPO, secret rotation, task locality, test fixtures, eval false-positives)
- **Depth tag corrections** — create-prd NFR criterion moved from (deep) to (mvp); database-schema constraints moved from (deep) to (mvp)
- **Knowledge structure** — 20 knowledge entries (200+ lines) now have Summary + Deep Guidance headers for assembly optimization
- **Missing reads fields** — system-architecture, review-architecture, database-schema, implementation-playbook frontmatter now reflect body input requirements
- **Innovation criteria** — innovate-vision, innovate-prd, innovate-user-stories now have measurable approval documentation criteria
- **coding-standards triggers** — Update Mode now detects git-workflow.md commit format changes

### Fixed

- **review-user-stories path mismatch** — Update Mode Specifics Detect field corrected from `docs/reviews/review-user-stories.md` to `docs/reviews/pre-review-user-stories.md`

## [2.34.0] — 2026-03-29

### Added

- **Round 2 alignment audit** — Comprehensive 8-module audit with 203 findings (7 BROKEN, 38 MISALIGNED, 63 MISSING, 95 WEAK), all addressed
- **Vision steps in methodology presets** — All 3 vision steps now appear in mvp.yml, deep.yml, and custom-defaults.yml (Phase 0 section)
- **Methodology depth documentation** — New `methodology/README.md` explaining depth levels 1-5, preset philosophy, and depth tag semantics
- **Update Mode Specifics for 15 pipeline steps** — All 13 review steps and 3 finalization steps now have complete 4-field Update Mode Specifics blocks (Detect, Preserve, Triggers, Conflict resolution)
- **`review-vision` knowledge entry** — New knowledge entry with 5 vision-specific review passes, severity examples, and finding report template
- **Multi-model dispatch knowledge** — Added `multi-model-review-dispatch` to 9 pipeline steps (6 validation, 2 innovation, tech-stack) that reference depth 4+ dispatch
- **4 new eval tests** — `build-drift.bats` (command freshness), `exemption-audit.bats` (exemption list bounds), `preset-exhaustiveness.bats` (preset coverage), and phase-sync eval in pipeline-completeness
- **Data flow hard gate** — `data-flow.bats` promoted from warning-only to hard failure with phase-ordering exemption list
- **14 missing quality criteria** — Added output-to-criterion mappings for linter config validity, .gitkeep scaffolding, CI YAML validity, `make eval` execution, freeze markers, handoff format, and more

### Changed

- **MVP path coherence** — `implementation-plan` and `implementation-playbook` now have explicit MVP-mode instructions for working without architecture/domain models. Required inputs downgraded to optional where unavailable in MVP.
- **Agent start/resume commands** — All 4 commands now prioritize playbook over plan, reference onboarding guide, test skeletons, and `make eval` as quality gate
- **new-enhancement command** — Now updates implementation playbook and handles frozen artifact amendments
- **quick-task command** — Now references playbook quality gates and eval gate
- **8 After This Step corrections** — Commands now recommend review steps before specification steps (create-prd→review-prd, domain-modeling→review-domain-modeling, system-architecture→review-architecture, etc.)
- **13 commands gain depth note** — All 15 representative commands now carry "use pipeline engine with presets for lighter execution" note
- **19 methodology scaling sections** — Replaced generic "scale with depth" text with step-specific depth breakdowns for 4 finalization steps, 7 validation steps, 6 review steps, and 2 innovation steps
- **11 vague quality criteria replaced** — Measurable thresholds for vision conciseness, competitive honesty, guiding principles, anti-vision specificity, code review checklist actionability, and more
- **6 steps gain depth-tagged criteria** — create-prd, create-vision, user-stories, adrs, innovate-prd, innovate-user-stories now have (mvp)/(deep) tags
- **22 missing reads[] entries added** — Closes data flow gaps across dev-env-setup, project-structure, operations, workflow-audit, create-evals, tdd, story-tests, implementation-plan, security, ux-spec, and 10 more
- **Mode Detection alignment** — automated-pr-review and ai-memory-setup pipeline detection now matches command logic (existence-first, then tracking comment)
- **3 topic inconsistencies fixed** — `cicd`→`ci-cd`, `responsive`→`responsive-design`, `adrs`→`adr`
- **3 knowledge entries gain Summary/Deep Guidance** — gap-analysis, review-domain-modeling, review-system-architecture restructured for CLI assembly optimization
- **custom-defaults.yml comment** — Now accurately states "Most steps enabled by default" (was "All steps enabled")
- **Eval system hardened** — Dynamic FINALIZATION_COMMANDS derivation, `validate_exempt_terminal_outputs` now invoked, stemming in build-drift description matching

### Fixed

- **review-testing race condition** — Added `system-architecture` to dependencies (was only in reads, which doesn't enforce ordering in parallel execution)
- **innovate-prd missing output** — Added `docs/plan.md` to outputs array
- **platform-parity-review impossible input** — Marked `docs/implementation-plan.md` as unavailable (runs before implementation-plan)
- **review-domain-modeling had zero domain-specific criteria** — Added entity coverage, aggregate boundary, and ubiquitous language checks
- **platform-parity-review missing review-methodology** — Added to knowledge-base
- **platform-parity-review command missing Mode Detection** — Added full detection section with output path references

## [2.33.0] — 2026-03-29

### Added

- **Phase 0: Product Vision** — New pipeline phase with three steps (`create-vision`, `review-vision`, `innovate-vision`) that produce a strategic product vision document (`docs/vision.md`) before the PRD. The vision document establishes the product's purpose, target audience, competitive positioning, guiding principles, and success criteria — serving as the North Star for all downstream pipeline steps.
- **`create-vision` step** — Hybrid framework combining Geoffrey Moore's elevator pitch, Roman Pichler's Vision Board, Reforge's narrative approach, and Amazon's Working Backwards methodology. Supports fresh and update modes. Produces a 12-section comprehensive vision document.
- **`review-vision` step** — 5-pass structured review targeting vision-specific failure modes: vision clarity, audience precision, competitive rigor, strategic coherence, and downstream readiness.
- **`innovate-vision` step** (conditional) — Strategic innovation across 5 dimensions: market opportunity expansion, positioning alternatives, AI-native rethinking, ecosystem thinking, and contrarian bets. Updates `docs/vision.md` directly with approved innovations.
- **`vision-craft` knowledge base entry** — Product vision best practices synthesized from Geoffrey Moore, Roman Pichler, Marty Cagan, Reforge, and Amazon Working Backwards. Referenced by all three vision steps.

### Changed

- **`create-prd` now reads `docs/vision.md`** — When a vision document exists, the PRD step uses it as strategic foundation and skips its own vision discovery questions. The PRD works unchanged when no vision document exists (soft read, not hard dependency).
- **PHASES constant updated** — Added Phase 0 `vision` (display name: "Product Vision") to `src/types/frontmatter.ts`.
- **Zod phase enum derived from PHASES** — The frontmatter validation schema now derives its phase enum from the canonical PHASES constant instead of maintaining a separate hardcoded list.
- **Runner skill updated** — Phase name reference table includes the new vision phase for batch execution and navigation.

## [2.32.0] — 2026-03-28

### Fixed

- **Broken dependency chains in quality phase** — `review-testing` now declares `reads: [domain-modeling, system-architecture]`, `operations` declares `reads: [system-architecture, adrs]`, and `security` declares `reads: [system-architecture]`. Previously these steps required artifacts with no formal path to their producers.
- **Missing reads in consolidation/environment phase** — `claude-md-optimization` now declares `reads: [create-prd, tdd]`, `automated-pr-review` declares `reads: [tdd]`, and `design-system` declares `reads: [create-prd]`. Ensures formal data flow for all required inputs.
- **Malformed mvp bullets in 3 review steps** — `review-ux`, `review-operations`, and `review-security` had their `**mvp**` bullet indented under `**deep**`, making it invisible to methodology parsers. Now properly formatted as separate bullets.
- **Generic validation step quality criteria** — All 7 validation steps (`cross-phase-consistency`, `traceability-matrix`, `decision-completeness`, `critical-path-walkthrough`, `implementability-dry-run`, `dependency-graph-validation`, `scope-creep-check`) had identical copy-paste criteria ("analysis is comprehensive"). Replaced with step-specific, measurable criteria derived from each step's Purpose section.
- **Mode Detection mismatches** — Added Mode Detection sections to `commands/claude-md-optimization.md` and `commands/workflow-audit.md` (previously omitted entirely). Updated `apply-fixes-and-freeze` pipeline to acknowledge update mode (was "N/A"). Expanded stub Mode Detection in `developer-onboarding-guide` and `implementation-playbook` pipeline files.
- **Quality criteria depth tags** — Added `(mvp)`/`(deep)` tags to 9 pipeline steps: `operations`, `security`, `api-contracts`, `database-schema`, `ux-spec`, `design-system`, `system-architecture`, `domain-modeling`, `implementation-plan`. Criteria now clearly indicate which apply at which methodology depth.
- **Review step Pattern A normalization** — Added missing Pattern A criteria (P0-P3 categorization, fix plan, downstream readiness) to 6 Pattern C review steps: `review-api`, `review-database`, `review-ux`, `review-operations`, `review-security`, `review-testing`.
- **Implementation handoff improvements** — Added task-type minimum-context taxonomy, `make eval` quality gate, specification artifact inputs, error recovery documentation to playbook knowledge. Added `story-tests` and `create-evals` follow-up to `new-enhancement` command. Added `docs/onboarding-guide.md` to playbook inputs.

- **Deep Guidance optimization** — Added Summary/Deep Guidance structure to 10 large knowledge entries (527→321 lines each), improving assembly engine efficiency. Normalized topic names (`data-flows`→`data-flow`, `naming-conventions`→`naming`, `gaps`→`gap-analysis`).
- **Remaining findings sweep (WP10)** — Removed redundant reads entries, added conditional dependency handling for innovate steps, tightened Mode Detection false-positive logic, harmonized preserve rules, replaced 23 vague quality criteria with measurable thresholds, added missing criteria to 8 steps, added conditionality guidance and prerequisite warnings to commands, documented depth-5 limitation, replaced hardcoded npm commands with stack-agnostic placeholders, raised eval minimum from 2 to 4 lines, added self-validating exempt lists and dead-end detection.

### Added

- **Dependency coherence validation for presets** — New `validateDependencyCoherence()` function in preset-loader warns when enabled steps have disabled dependencies. The engine already treats disabled deps as satisfied (soft-dependency), but users now get explicit warnings about potential quality gaps.
- **Wired orphaned knowledge entries** — Added `multi-model-review-dispatch` and `review-step-template` to all 13 review steps + `traceability-matrix`. These entries existed but were unreferenced.
- **New knowledge entries** — Created `git-workflow-patterns` (branching, commits, PRs, merge policies, worktrees) and `automated-review-tooling` (dual-model CLI review, reconciliation, CI integration). Wired to `git-workflow` and `automated-pr-review` pipeline steps.
- **5 new meta-evals** (39 → 44 total) — Methodology scaling format check, quality criteria depth tag tracking, Update Mode Specifics companion check, data flow transitive dependency validation, orphan knowledge detection.
- **Fixed cross-channel.bats test 2 no-op** — Added actual assertions to the After This Step / dependency alignment check (was performing no assertions, always passing).
- **Consolidated exempt lists** — Extracted `COMMAND_EXEMPT`, `TERMINAL_OUTPUT_EXEMPT`, `TERMINAL_PATH_PATTERNS`, `AFTER_STEP_EXEMPT`, and `CONSOLIDATION_COMMANDS` into shared `tests/evals/exemptions.bash`.
- **`docs/comprehensive-alignment-audit.md`** — 8-module alignment audit covering dependency flow, methodology scaling, mode detection, quality criteria, knowledge system, command parity, implementation handoff, and meta-eval coverage.

## [2.31.0] — 2026-03-29

### Added

- **`scaffold rework` command** — Re-run all steps within selected phases at configurable depth. Supports `--phases`, `--through`, `--exclude` for phase selection, `--fix` for auto-fixing review step issues (default on), `--fresh` for clean re-runs, and persistent sessions (`.scaffold/rework.json`) that survive context resets. Session management via `--resume`, `--clear`, and `--advance` flags.
- **Rework mode in scaffold-runner skill** — Runner skill auto-detects active rework sessions, executes steps sequentially, pauses at phase boundaries, and supports natural language triggers ("rework phases 1-5", "resume rework", "rework status").
- **`reworkFix` assembly option** — Assembly engine injects auto-fix instructions for review steps during rework mode, directing Claude to apply fixes directly to artifacts instead of just listing issues.
- **41 new tests** — ReworkManager unit tests (17), phase-selector unit tests (18), E2E lifecycle tests (6), plus 11 CLI command tests and 3 assembly engine tests.

## [2.30.0] — 2026-03-28

### Fixed

- **`implementation-plan` disconnected from story-tests outputs** — Added `reads: [story-tests]` so implementation tasks reference test skeletons from `tests/acceptance/`. Tasks now include which pending tests to implement rather than generic "write tests" instructions.
- **`implementation-playbook` missing quality artifact references** — Added `reads: [story-tests, create-evals, implementation-plan]` and input references to `tests/acceptance/`, `docs/story-tests-map.md`, `tests/evals/`, and `docs/eval-standards.md`. Agents following the playbook now know about test skeletons and eval quality gates.
- **`traceability-matrix` didn't trace Stories → Test Cases** — Added `reads: [story-tests, create-evals]` and input references to `docs/story-tests-map.md`. Traceability now verifies the full chain: PRD → Stories → Test Cases → Tasks.
- **`output-consumption.bats` incorrectly exempted `story-tests`** — Removed from `TERMINAL_OUTPUT_EXEMPT` since `create-evals` consumes its outputs.
- **Generic quality criteria** in `traceability-matrix`, `implementation-plan`, and `implementation-playbook` strengthened with specific test/eval gate references.
- **`implementation-plan` command Required Reading** — Added `tests/acceptance/` and `docs/story-tests-map.md` to the table.

### Added

- **`docs/alignment-audit.md`** — Full audit of the test/eval/implementation artifact chain with dependency map, findings, and proposed changes.

## [2.29.0] — 2026-03-28

### Added

- **TypeScript tests in CI** — CI workflow now installs Node.js, runs `npm run lint`, `npm run type-check`, `npm test`, and `npm run build` on every PR. Previously only bash tests ran.
- **Coverage thresholds** — vitest enforces 84/80/88/84 (statements/branches/functions/lines) minimums. Any PR that drops coverage below these floors fails CI.
- **`make check-all` target** — Unified quality gate that runs both bash gates (`make check`) and TypeScript gates (`ts-check`) in one command.
- **4 new validation test files** — Dedicated tests for `config-validator.ts`, `dependency-validator.ts`, `frontmatter-validator.ts`, `state-validator.ts` (87 tests, 57% → 92% branch coverage).
- **3 new meta-eval files** — `output-consumption.bats` (pipeline outputs consumed downstream), `dependency-ordering.bats` (transitive ordering + cycle detection), `prompt-quality.bats` (section content, placeholders, Mode Detection phrasing). 7 new eval tests.
- **4 extended meta-evals** — `pipeline-completeness.bats` (conditional step validity), `command-structure.bats` (After This Step chain integrity), `cross-channel.bats` (knowledge-base reference quality).
- **`vitest.e2e.config.ts`** — Dedicated E2E test config. The `test:e2e` npm script was previously broken (referenced a missing file).
- **`tests/install-uninstall.bats`** — 15 tests for install.sh and uninstall.sh scripts using mocked HOME directory.
- **`tests/helpers/fixtures.ts`** — Shared test fixture factory for MetaPrompt, Config, State, Preset, DependencyGraph, and AssemblyResult types.
- **`src/core/dependency/graph.test.ts`** — 12 dedicated unit tests for DAG construction.
- **`src/wizard/suggestion.test.ts`** — 29 tests for methodology suggestion engine.

### Changed

- **Overall test coverage: 84% → 90%** — 997 TypeScript tests (was 772), 70 bats tests (was 54), 39 meta-evals (was 28).
- **`skill.ts` coverage: 47% → 96% branches** — 12 tests covering install/remove/list in all modes.
- **`run.ts` coverage: 68% → 86% branches** — 33 tests covering crash recovery, update mode, depth downgrade, interactive flows.
- **`reset.ts` coverage: 68% → 95% branches** — 29 tests covering interactive confirmation, lock failures, force overrides.
- **`validation/` coverage: 57% → 92% branches** — 4 dedicated test files with 87 tests.
- **`knowledge-loader.ts` coverage: 68% → 95% statements** — 47 tests covering Deep Guidance extraction, overrides, edge cases.
- **`update.ts` coverage: 57% → 91% statements** — 19 tests covering version checks, network errors, CLI auth.
- **`version.ts` coverage: 59% → 98% statements** — 16 tests covering JSON output, registry fetch, error handling.
- **Renamed `test:bench` to `test:perf`** in package.json (performance tests use `.test.ts`, not `.bench.ts`).

### Fixed

- **64 ESLint errors** — All fixed (unused vars, line length, `any` types, quotes, trailing commas). Zero lint errors remaining.
- **Broken `test:e2e` script** — Created missing `vitest.e2e.config.ts`.

## [2.28.1] — 2026-03-28

### Fixed

- **TypeScript build error in `status.test.ts`** — Fixed TS2352/TS2493 cast error on mock call args by routing through `unknown` first. Caused Homebrew install failure.

## [2.28.0] — 2026-03-28

### Fixed

- **`story-tests` missing from `scaffold status` in existing projects** — New `reconcileWithPipeline()` method in StateManager detects pipeline steps absent from the project's `state.json` and inserts them as pending. Called from both `status` and `next` commands.
- **`add-e2e-testing` wrong dependencies and outputs** — Added missing `tdd` dependency. Removed `docs/tdd-standards.md` from outputs (the step modifies it, not creates it). Added `reads: [tdd, coding-standards]` for soft artifact references.
- **`platform-parity-review` wrong directory and weak dependencies** — Moved from `pipeline/stories/` to `pipeline/parity/` to match the phase slug. Dependencies now include `review-architecture`, `review-database`, `review-api`, `review-ux` instead of just `user-stories`.

### Added

- **Depth 4+ outputs in review frontmatter** — 21 review step frontmatter files now declare multi-model outputs (`review-summary.md`, `codex-review.json`, `gemini-review.json`) for correct completion detection at higher depths.
- **`reads` field across pipeline** — 13 pipeline files now declare soft artifact references via the `reads` frontmatter field, making implicit cross-phase dependencies explicit without creating hard blocks.
- **Update Mode Specifics** — 27 creation steps now include `## Update Mode Specifics` sections explaining what to preserve, what triggers updates, and how to handle conflicts in brownfield/update mode.
- **Expanded Mode Detection** — Terse 1-line Mode Detection blocks in `tdd`, `database-schema`, `api-contracts`, `ux-spec`, consolidation steps, and others expanded to 4-8 lines with concrete guidance.
- **3 new knowledge entries** — `task-tracking` (Beads patterns), `claude-md-patterns` (CLAUDE.md structure and merge strategy across 7 steps), `multi-model-review-dispatch` (depth 4+ external model guidance).
- **`review-step-template` knowledge entry** — Shared template documenting the common structure across 15+ review pipeline steps.
- **Finding Disposition sections** — All 7 validation steps now include P0-P3 severity handling guidance (who decides, when to fix, how tasks reorder).
- **Conditional Evaluation sections** — 6 conditional steps now document the project signals that trigger enable/disable decisions.
- **Strengthened Quality Criteria** — `operations.md`, `security.md` now match the specificity of specification-phase criteria. `create-evals.md` criteria vary by depth (mvp vs deep).
- **`docs/glossary.md`** — 11 pipeline term definitions (greenfield, brownfield, depth levels, wave plan, conditional step, etc.).
- **`design-system-tokens.md` completed** — Expanded from 168 to 465 lines. WIP marker removed. Full coverage of color tokens, spacing, responsive breakpoints, accessibility, and all component patterns.
- **Knowledge cross-references** — 8 knowledge entries now include "See Also" sections linking to related entries.

### Changed

- **Knowledge entry renames** — `review-api-contracts` → `review-api-design`, `review-database-schema` → `review-database-design`, `review-ux-spec` → `review-ux-specification` (aligned with creation-step knowledge names).
- **CLAUDE.md cleanup** — Removed stale "Process" section reference (v1 artifact). Updated prompts.md sync guidance to v2-accurate `scaffold build` workflow.
- **`beads` and `claude-md-optimization`** now reference their new knowledge entries (`task-tracking`, `claude-md-patterns`).

## [2.27.0] — 2026-03-28

### Added

- **Multi-LLM verification across all review, validation, innovation, and research steps** — 21 pipeline steps now support depth-gated Codex/Gemini CLI dispatch (depth 4: one external model, depth 5: full multi-model reconciliation) with graceful fallback to Claude-only when CLIs are unavailable. Follows the established pattern from `review-user-stories` and `implementation-plan-review`. Covers 11 review steps, 7 validation steps, 2 innovation steps, and tech-stack research.

## [2.26.0] — 2026-03-28

### Added

- **`story-tests` pipeline step** (Phase 9, order 915) — Generates tagged, pending test skeletons from user story acceptance criteria. Creates one test file per story in `tests/acceptance/`, one test case per AC tagged with `[US-xxx:AC-y]` for traceability. Assigns test layer (unit/integration/e2e) based on AC type. Produces `docs/story-tests-map.md` traceability matrix. Replaces approximate keyword matching with precise tag-based AC-to-test coverage.
- **`create-evals` now depends on `story-tests`** — Coverage evals can verify AC tags instead of keyword co-occurrence, providing precise rather than approximate coverage checking.

## [2.25.0] — 2026-03-28

### Added

- **8 new conditional eval categories in `create-evals`** — Expands from 5 to 13 document-driven eval categories. Each is only generated when its source document exists: architecture conformance (system-architecture.md), API contract validation (api-contracts.md), security pattern verification (security-review.md), database schema conformance (database-schema.md), accessibility compliance (ux-spec.md), performance budget (plan.md NFRs), configuration validation (dev-setup.md), error handling completeness (coding-standards.md).
- **Deep Guidance for all new categories** in eval-craft knowledge base — implementation patterns per stack, false positive mitigation, exclusion mechanisms, and anti-patterns.
- **Methodology depth scaling** — Depth 1-2: 2 categories, Depth 3: 4, Depth 4: 8, Depth 5: all 13.

## [2.24.0] — 2026-03-28

### Added

- **Phase-alignment meta-eval** — Verifies every pipeline step's order number falls within its phase's expected range (Phase N → N00-N99). Catches ordering drift automatically.
- **Dependency-direction meta-eval** — Verifies all dependencies point to same or earlier phase (no forward dependencies).
- **Skill trigger evals** (`tests/evals/skill-triggers.bats`) — 7 tests verifying skill activation patterns: runner triggers for run/batch/status, pipeline has activation boundary, dispatch activates for review context, no skill overlap.
- **Cross-document consistency eval category** in `create-evals` — 5th category checking technology, path, terminology, and cross-reference consistency across scaffold-produced docs. Generated in user projects alongside existing 4 categories.
- **Meta-evals in CI** — `make check` now includes `make eval`, so all 29 meta-evals run on every PR automatically.
- **`implementation-plan` depends on `create-evals`** — Quality gate: evals must pass before task decomposition begins.

### Fixed

- **Pre-existing cross-channel.bats failures** — `((checked++))` fails under bash `set -e` when `checked=0` (bash treats `((0))` as false). Replaced with `checked=$((checked + 1))`.
- **design-system-tokens.md** marked as eval-wip (166 lines, below 200-line core minimum).

## [2.23.0] — 2026-03-28

### Changed

- **Phase-aligned order numbers** — All 50 pipeline steps renumbered so Phase N uses orders in the N00 range (Phase 1 = 110-160, Phase 2 = 210-250, ..., Phase 14 = 1410-1430). Steps spaced by 10 for future insertions. Previously Phase 5 had orders 7-8 and Phase 2 had orders 40-45 — now you can tell which phase a step belongs to from its order alone. Also eliminates the fractional order (create-evals was 20.5, now 920).
- **Phase 10 renamed** — "Stories & Reviews" (`stories`) → "Platform Parity" (`parity`). The phase contains only `platform-parity-review`, which audits cross-platform coverage, not stories.
- **Methodology YAML comments** — Reordered from scrambled (Phase 2, 3, 4, 1...) to sequential (Phase 1 through 14).

### Fixed

- **Missing dependency: `implementation-plan` → `review-architecture`** — The step's Required Reading lists `docs/system-architecture.md`, `docs/domain-models/`, and `docs/adrs/` as REQUIRED inputs, but the dependency graph didn't guarantee these were ready. `review-architecture` transitively covers all three through the modeling→decisions→architecture chain.

### Added

- **Execution model documentation** in scaffold-pipeline skill — explains the two parallel tracks (infrastructure vs domain/quality), convergence at planning, how order numbers work as tiebreakers, and which phases can run in parallel.

## [2.22.1] — 2026-03-28

### Fixed

- **`multi-model-review-tasks` not removed from existing projects** — Added `multi-model-review-tasks` to `RETIRED_STEPS` in state migration so existing projects auto-remove the retired step from `state.json` on next `scaffold status` or `scaffold run`. Without this, upgraded projects showed the step as pending with a total of 51 instead of 50.

## [2.22.0] — 2026-03-28

### Changed

- **Standardized phase definitions across codebase** — Created a canonical `PHASES` constant in `src/types/frontmatter.ts` as the single source of truth for all 14 phase slugs, numbers, and display names. Fixed stale references that listed only 9 phases in the TypeScript type comment, frontmatter schema doc, and pipeline skill. Rewrote `prompt-pipeline` command from old sub-phase numbering (5b/5c/7b/7c) to canonical 14-phase structure. Updated CLAUDE.md to reference v2 architecture as source of truth. Added v1 deprecation notice to `docs/scaffold-overview.md`.

### Added

- `PHASES` constant, `PhaseSlug` type, and `PHASE_BY_SLUG` lookup map in `src/types/frontmatter.ts`
- Phase reference table in `scaffold-pipeline` skill with all 14 phases (number, slug, display name)

## [2.21.0] — 2026-03-27

### Added

- **Batch execution in scaffold runner skill** — The runner can now handle multi-step requests like "re-run all reviews", "run phases 5-8", "run the next 5 steps", or "finish the pipeline". Resolves natural language to ordered step lists, executes sequentially, carries forward session preferences (depth, decisions), and continues autonomously — stopping only on blockers requiring human intervention. Includes batch summary reporting and interrupted batch resumption.

## [2.20.1] — 2026-03-27

### Fixed

- **README step counts** — Updated all pipeline step count references from 51 to 50 after merging `multi-model-review-tasks` into `implementation-plan-review`.

## [2.20.0] — 2026-03-27

### Changed

- **Merged `multi-model-review-tasks` into `implementation-plan-review`** — The standalone multi-model review pipeline step was redundant with the review's own multi-model validation section. The review now handles everything in an 8-phase structure: coverage audit (produces `task-coverage.json`), task quality, dependencies, standards alignment, risk assessment, present/fix, execute changes, and multi-model validation (depth 4+). Planning phase reduced from 3 steps to 2.

### Added

- **Risk assessment in planning phase** — `implementation-plan` now flags high-risk tasks (technology, integration, complexity, critical path) with severity and mitigation. `implementation-plan-review` Phase 5 verifies risk flags.
- **Wave plan & parallelism output** — `implementation-plan` now produces a wave summary showing tasks per wave and maximum useful agent count, helping users plan worktree/agent allocation before execution.

### Removed

- **`multi-model-review-tasks` pipeline step and command** — Absorbed into `implementation-plan-review`. The `scripts/implementation-plan-mmr.sh` script and schema are preserved (now invoked by the review's Phase 8).

## [2.19.3] — 2026-03-27

### Fixed

- **Build error: `'complete'` not assignable to `LockableCommand`** — The `scaffold complete` command (v2.19.0) passed `'complete'` to `acquireLock()` but the `LockableCommand` type union didn't include it. TypeScript caught this during `brew install` build. Added `'complete'` to the union type.

## [2.19.2] — 2026-03-27

### Fixed

- **MCP memory server recommendations** — ai-memory-setup recommended Engram, hmem, and Claude-Mem, but none exist as installable npm/brew packages. Replaced with `@modelcontextprotocol/server-memory` (official MCP Knowledge Graph server, stable, zero-setup via `npx`). Updated command, knowledge base, runner skill, and check command detection. Net -90 lines of non-functional configurations removed.

## [2.19.1] — 2026-03-27

### Fixed

- **State manager crash on new pipeline steps** — `scaffold run ai-memory-setup` (or any step added after project initialization) crashed with "Cannot set properties of undefined (setting 'status')". The `setInProgress()` method now auto-creates a pending step entry before transitioning to in_progress, handling the case where the pipeline has new steps not in the original `state.json`.

## [2.19.0] — 2026-03-27

### Added

- **`scaffold complete <step>` command** — Marks a step as completed for steps executed outside `scaffold run` (e.g., via `scaffold run --auto` + manual execution). Handles `in_progress → completed`, `pending → completed`, already-completed clean exit, `in_progress` record cleanup, and fuzzy step name matching. 8 new tests.
- **README updated** — CLI commands table, test counts, architecture section updated for all v2.13-v2.18 changes (51 steps, 19 multi-model commands, 45 knowledge entries, TDD in foundation, NO_BROWSER=true, finalization order).

## [2.18.0] — 2026-03-27

### Fixed

- **SKILL.md v2 step names** — Pipeline Order table used v1 combined names (`prd-gap-analysis`, `user-stories-gaps`) instead of v2 individual steps (`review-prd` + `innovate-prd`, `review-user-stories` + `innovate-user-stories`). Now matches prompt-pipeline.md.

### Verified (Final Cross-Phase Audit)

Complete systematic verification of all 51 pipeline steps:
- Zero remaining `docs/prd.md` references (commands, pipeline, knowledge, prompts.md)
- All Gemini invocations have `NO_BROWSER=true` (commands, skills, scripts)
- All 19 review/validation commands have Multi-Model Validation with auth pre-flight
- All 19 have explicit dispatch step in Process section
- All execution/task commands handle both Beads and non-Beads
- All 51 steps present in all 3 methodology presets
- After This Step chains complete from create-prd through execution
- All document-creating commands have Mode Detection
- prompts.md, SKILL.md, and prompt-pipeline.md all have complete step coverage

## [2.17.7] — 2026-03-27

### Enhanced

- **developer-onboarding-guide** now references `.claude/rules/`, `docs/ai-memory-setup.md`, and `docs/decisions/` in its Inputs table and "Where to Find Things" section (conditional on existence).

## [2.17.6] — 2026-03-27

### Fixed

- **3 validation commands missing Multi-Model Validation** — `decision-completeness`, `dependency-graph-validation`, and `scope-creep-check` were missing the entire Multi-Model Validation (Depth 4-5) section that the other 4 validation commands had. Added full section with `NO_BROWSER=true`, auth pre-flight, command-specific review bundles, and explicit Process step. All 7 validation commands now have consistent multi-model support.

## [2.17.5] — 2026-03-27

### Fixed

- **implementation-plan-mmr.sh Gemini hang** — Added `NO_BROWSER=true` to both Gemini invocations (initial + retry) in the multi-model review script. Without this, Gemini hangs on consent prompt in non-TTY shells.
- **implementation-plan.md missing upstream docs** — Required Reading table was missing 8 docs: system-architecture, domain-models/, adrs/, operations-runbook, security-review, database-schema, api-contracts, ux-spec. These are needed to create comprehensive implementation tasks.

## [2.17.4] — 2026-03-27

### Fixed

- **workflow-audit After This Step** — Pointed to create-evals (which now runs in Phase 5e before consolidation since v2.16.1). Now correctly points to implementation-plan (Phase 7).

## [2.17.3] — 2026-03-27

### Fixed

- **Quality phase After This Step chains** — 3 commands pointed to wrong next steps: `security.md` → create-evals (already done), `create-evals.md` → implementation-plan (skips operations/security), `review-security.md` → implementation-plan (skips consolidation). All now correctly point to the next step in the pipeline execution order.

## [2.17.2] — 2026-03-27

### Enhanced

- **Specification phase upstream reads** — database-schema now reads `docs/tech-stack.md` (database engine) and `docs/user-stories.md` (query patterns). api-contracts now reads `docs/tech-stack.md` (API framework). ux-spec now reads `docs/coding-standards.md` (component naming).
- **Cross-references between spec commands** — database-schema and api-contracts now conditionally read each other's output for payload-to-schema alignment validation.
- **After This Step chains clarified** — Each spec command now guides: create → review → next applicable spec → quality gates. Removed ambiguous branching.
- **Multi-model validation bundles completed** — review-database added `docs/adrs/` and `docs/api-contracts.md`. review-api added `docs/adrs/` and `docs/database-schema.md`. review-ux added `docs/api-contracts.md`.

## [2.17.1] — 2026-03-27

### Fixed

- **prompt-pipeline.md rewritten** — The `/scaffold:prompt-pipeline` command was severely outdated (showed 20 steps in 7 phases). Rewritten to show the complete 48-step pipeline across all phases including modeling, architecture, specification, quality gates, validation, finalization, and ai-memory-setup.
- **Resume commands non-Beads fallback** — `single-agent-resume` and `multi-agent-resume` assumed Beads with no fallback. Now handle non-Beads projects (read `docs/implementation-plan.md` for task tracking).

## [2.17.0] — 2026-03-27

### Added

- **10 validation/finalization steps added to prompts.md and pipeline skill** — 7 validation checks (cross-phase-consistency through scope-creep-check) and 3 finalization steps (apply-fixes-and-freeze, developer-onboarding-guide, implementation-playbook) added as Phase 7b and 7c. Execution split to Phase 8.
- **Full pipeline path now documented**: Plan Review → Validation (7 parallel checks) → Apply Fixes & Freeze → Onboarding Guide → Implementation Playbook → Execution

### Fixed

- **implementation-plan-review After This Step** — Previously jumped directly to execution, bypassing 10 steps. Now references validation phase with MVP skip option.
- **single-agent-start / multi-agent-start** — No longer assume Beads is configured. Non-Beads projects read `docs/implementation-plan.md` for task list.

## [2.16.2] — 2026-03-27

### Fixed

- **Gemini CLI hang in non-TTY shells** — Added `NO_BROWSER=true` to all Gemini invocations across 20 files. Root cause: Gemini relaunches as a child process and shows a consent prompt ("Do you want to continue? [Y/n]") that hangs when stdin is not a TTY. `NO_BROWSER=true` suppresses this prompt and uses cached credentials directly. OAuth tokens were always persisted — the issue was purely the consent prompt blocking, not missing auth.

## [2.16.1] — 2026-03-27

### Added

- **6 quality gate steps added to prompts.md and pipeline skill** — review-testing, create-evals, operations, review-operations, security, review-security were in pipeline files but missing from documentation. Added as Phase 5e (Quality Gates). Updated dependency graphs with quality gate chain.

### Changed

- **create-evals moved from Phase 6 to Phase 5e** — Was listed after workflow-audit in prompts.md, but the v2 pipeline places it in the quality phase (after tdd). Now correctly positioned before consolidation.

## [2.16.0] — 2026-03-27

### Added

- **12 v2 steps added to prompts.md and pipeline skill** — Domain modeling, ADRs, system architecture, and specification phases (12 steps + reviews) were in pipeline files and methodology presets but missing from prompts.md Setup Order table and scaffold-pipeline SKILL.md. Added as Phase 5b (Domain Modeling), Phase 5c (Architecture Decisions), and Phase 5d (Specification). Updated dependency graphs in both files.

### Fixed

- **ux-spec / review-ux After This Step** — Pointed to `/scaffold:tdd` (foundation phase, already complete). Now correctly points to `/scaffold:claude-md-optimization`.
- **database-schema.md** — Added `docs/plan.md` to initial read instruction for PRD context.
- **api-contracts.md** — Added `docs/user-stories.md` to initial read instruction (was in Process section but missing from intro).

## [2.15.2] — 2026-03-27

### Enhanced

- **dev-env-setup now reads docs/tdd-standards.md** — Since TDD moved to foundation phase (v2.14.0), tdd-standards.md exists before dev-env-setup runs. Test commands now match what TDD standards specify (test runner, flags, coverage thresholds, quality gates).
- **cli-pr-review.sh template includes auth pre-flight** — The generated PR review script now verifies CLI authentication before dispatching (codex login status, gemini minimal prompt). Skips unauthenticated CLIs with warning instead of hanging.
- **automated-pr-review Process step 4** — Now specifies exact auth verification commands instead of vague "verify prerequisites".

## [2.15.1] — 2026-03-27

### Fixed

- **Multi-model dispatch now in Process section** — All 15 review/validation commands had multi-model validation as a disconnected section above the Process checklist. Agents followed the Process steps and skipped CLI dispatch. Now an explicit numbered step: "(Depth 4+) Dispatch multi-model validation — verify CLI auth, bundle context, dispatch, reconcile findings, apply high-confidence fixes".
- **Previous auth failures no longer exempt subsequent dispatches** — Added "MANDATORY at depth 4+" label, inline auth pre-flight checks, and explicit "Previous auth failures do NOT exempt this dispatch — re-check before each review step" rule to all 15 commands and the multi-model-dispatch skill.

## [2.15.0] — 2026-03-27

### Fixed

- **PRD filename standardized to `docs/plan.md`** — Replaced `docs/prd.md` references across 42 files (22 pipeline, 17 commands, 2 knowledge, 1 README). The create-prd command always produced `docs/plan.md` but pipeline files incorrectly referenced `docs/prd.md`. The create-prd pipeline meta-prompt was self-contradictory (outputs said `plan.md`, Expected Outputs said `prd.md`).

### Improved

- **Innovation commands now reference knowledge base instead of duplicating content** — Removed 171 lines of verbatim-duplicated content from `innovate-prd.md` (decision matrix, 5 innovation categories) and `innovate-user-stories.md` (enhancement categories, evaluation framework). Commands now reference their knowledge base entries (`prd-innovation`, `user-story-innovation`) which the v2 engine assembles automatically.

## [2.14.1] — 2026-03-27

### Fixed

- **CLI auth pre-flight checks** — Multi-model dispatch now verifies authentication before dispatching reviews, not just CLI installation. Gemini exit code 41 (auth failure) and Codex stderr auth messages are detected specifically. Auth failures surface to the user with interactive recovery commands (`! codex login` / `! gemini -p "hello"`) instead of silently falling back to Claude-only review.

## [2.14.0] — 2026-03-27

### Changed

- **TDD moved to foundation phase** — Pipeline step relocated from `pipeline/quality/` (order 19, after review-architecture) to `pipeline/foundation/` (order 44, after coding-standards). Now runs as Phase 2 item #6, matching `prompts.md` intent. Dependencies changed from `[review-architecture]` to `[coding-standards]`. Architecture docs are optional inputs (available when re-running later). Project-structure order bumped to 45.

### Fixed

- **Beads/non-Beads commit format consistency** — Six commands had Beads-only commit format documentation. Non-Beads projects (the majority) now have documented conventional commit format:
  - `coding-standards.md` — Added Beads detection, documents both `[BD-<id>] type(scope): desc` and conventional `type(scope): desc` with examples
  - `create-evals.md` — Fixed hard-coded `[BD-\w+]` regex to detect `.beads/` and use appropriate format check
  - `beads.md` — Added note that non-Beads projects use conventional commits
  - `release.md` / `version-bump.md` — Clarified task ID is conditional on `.beads/` existing

## [2.13.2] — 2026-03-27

### Fixed

- **claude-md-optimization** now detects `.claude/rules/` and reinforces the pointer pattern instead of re-inlining conventions. Targets CLAUDE.md under 200 lines when rules exist.
- **workflow-audit** now includes a "Memory & Rules Consistency Check" section — verifies rule files match source docs, globs match real files, and CLAUDE.md uses pointer pattern.
- **Lifecycle hooks** in ai-memory-setup now integrate with the configured MCP memory server (Engram/hmem) instead of echoing to `/dev/null`. File-logging fallback for Tier 1-only setups.
- **Missing .gitignore update** — added consolidated Step 2.3b to add MCP database directories to .gitignore.
- **Decision log vs ADRs** — added comparison table and Beads task ID field to decision entry format.
- **coding-standards** After This Step now notes that ai-memory-setup rules may need re-syncing after updates.

## [2.13.1] — 2026-03-27

### Fixed

- **Codex CLI "Not inside a trusted directory"** — Added `--skip-git-repo-check` flag to all `codex exec` invocations across multi-model-dispatch skill, command files, scripts, runner skill, and README. Required when running reviews before git is initialized.

## [2.13.0] — 2026-03-27

### Added

- **`ai-memory-setup` pipeline step** — New Phase 3 environment step (order 58, after git-workflow) that configures a tiered AI memory stack:
  - **Tier 1 — Modular Rules**: Extracts conventions from coding-standards.md, tech-stack.md, and git-workflow.md into path-scoped `.claude/rules/` files. Keeps CLAUDE.md lean under 200 lines.
  - **Tier 2 — Persistent Memory**: Configures MCP memory server (Engram/hmem/Claude-Mem), lifecycle hooks (PreCompact, Stop, PreToolUse), and structured decision logging in `docs/decisions/`.
  - **Tier 3 — External Context**: Adds library documentation server (Context7/Nia/Docfork) to prevent API hallucination.
- **`ai-memory-management` knowledge base** — New domain expertise file with research-backed memory best practices including the ETH Zurich findings on context file effectiveness.
- **`scaffold check ai-memory-setup`** — Detects existing `.claude/rules/`, MCP memory server configuration, lifecycle hooks, and decision logging structure.

### Enhanced

- **README.md** — Comprehensive rewrite reflecting all v2.7–v2.12 changes (batch skip, compact status, unified E2E testing, automated PR review, multi-model dispatch, retired steps).
- **Pipeline cross-references** — git-workflow and automated-pr-review "After This Step" sections now reference ai-memory-setup.

## [2.12.0] — 2026-03-28

### Added

- **`multi-model-dispatch` skill** — New auto-activated skill documenting correct Codex CLI (`codex exec`) and Gemini CLI (`gemini -p`) invocation patterns for headless operation from Claude Code. Covers context bundling templates, dual-model reconciliation rules, output parsing, and fallback handling.
- **Multi-model validation on all review/validation steps** — All 11 domain review commands and 4 validation commands now include a "Multi-Model Validation (Depth 4-5)" section that dispatches to available Codex/Gemini CLIs for independent validation.

### Fixed

- **Codex CLI invocation** — Fixed `automated-pr-review` to use `codex exec` (headless mode) instead of bare `codex` (interactive TUI that fails with "stdin is not a terminal"). Added explicit invocation commands to `review-user-stories` depth 5 section.

## [2.11.0] — 2026-03-28

### Removed

- **Retired `claude-code-permissions`** as a standalone pipeline step — most users run with `--dangerously-skip-permissions`, making the step inert. Deny rules folded into `git-workflow` (project-level) and `tech-stack` (stack-specific). State migration removes the step from existing projects.

### Enhanced

- **`git-workflow`** now creates `.claude/settings.json` with project-level deny rules (no force push to main, no rm -rf, no git reset --hard, etc.)
- **`tech-stack`** now adds stack-specific deny rules to `.claude/settings.json` (Prisma reset, DROP TABLE, kubectl delete, etc.)

## [2.10.1] — 2026-03-28

### Added

- **Local CLI review mode** — `automated-pr-review` now supports running Codex and/or Gemini CLI locally against the PR diff for immediate results. No external bot, no polling. When both CLIs are available, runs both independently and reconciles findings by confidence level (dual-model review).
- **CLI detection in `scaffold check`** — `scaffold check automated-pr-review` now reports available CLIs and recommends local-cli vs external-bot mode.

## [2.10.0] — 2026-03-28

### Added

- **`automated-pr-review` step** — Replaces `multi-model-review` with an agent-driven architecture that uses zero GitHub Actions minutes. The agent polls for external reviews via `gh api` and handles fixes locally.
- **Configurable reviewer** — Choose between Codex Cloud (default), Gemini Code Assist, or a custom reviewer bot.
- **Applicability check** — `scaffold check automated-pr-review` detects GitHub remote and CI configuration.

### Removed

- **`multi-model-review`** as a pipeline step (replaced by `automated-pr-review`). State migration handles the rename.
- **GitHub Actions review workflows** — No more `code-review-trigger.yml`, `code-review-handler.yml`, `codex-timeout.yml`, or `post-merge-followup.yml`.
- **ANTHROPIC_API_KEY requirement** — Fixes run locally, not via Claude Code Action in CI.

### Changed

- **Prompt reduced by ~2,900 lines** — Focused on configuration decisions rather than YAML workflow generation.

## [2.9.1] — 2026-03-28

### Fixed

- **Remove retired `user-stories-multi-model-review` from project state** — Projects initialized before v2.8.0 still had this step as pending in `state.json`, causing it to appear in `scaffold status`. New `RETIRED_STEPS` migration phase removes orphaned entries on next state load.

## [2.9.0] — 2026-03-27

### Added

- **Unified `add-e2e-testing` step** — Replaces separate `add-playwright` and `add-maestro` steps with a single step that auto-detects project platform from `tech-stack.md` and `package.json`. Configures Playwright for web, Maestro for mobile, or both. Self-skips for backend-only projects.
- **`scaffold check` command** — New CLI command to preview step applicability without executing: `scaffold check add-e2e-testing` shows platform detection, brownfield status, and recommended mode.
- **Brownfield detection** — Detects existing Playwright config or Maestro flows and auto-enters update mode.
- **Framework-specific Playwright config** — Generates correct `webServer` configuration for Next.js, Vite, Remix, Gatsby, SvelteKit, and Angular.
- **Expo-specific Maestro detection** — Detects SDK version, EAS Build, and managed vs bare workflow.

### Removed

- **`add-playwright`** and **`add-maestro`** as separate pipeline steps (replaced by `add-e2e-testing`). State migration handles projects with either or both old step names.

## [2.8.1] — 2026-03-27

### Fixed

- **scaffold-runner skill compatibility** — Updated scaffold-runner skill for v2.8.0 changes: added depth-aware guidance for `review-user-stories` (depth 4 adds requirements index, depth 5 adds multi-model dispatch), mapped "run multi-model review" requests to `review-user-stories` at depth 5, and added CLI availability check guidance for Codex/Gemini fallback.

## [2.8.0] — 2026-03-27

### Removed

- **Retired `user-stories-multi-model-review`** — Standalone pipeline step (order 62) removed along with its command file, shell script (`scripts/user-stories-mmr.sh`), JSON schema, and setup guide. The step was positioned too late in the pipeline (after downstream steps had already consumed the stories) and duplicated much of `review-user-stories`.

### Enhanced

- **`review-user-stories` now includes requirements traceability and multi-model review** — Depth 4 adds a formal requirements index (REQ-xxx IDs) and coverage matrix (coverage.json) for 100% PRD traceability. Depth 5 adds multi-model dispatch to Codex/Gemini with graceful fallback to Claude-only enhanced review when external CLIs aren't available. This puts the quality gate at order 5 (before downstream steps) instead of order 62.

## [2.7.0] — 2026-03-27

### Added

- **Batch skip** — `scaffold skip step1 step2 --reason "..."` skips multiple pipeline steps in one command. Each step is validated independently; partial failures don't block valid skips. Exit code 2 for partial failure, JSON output includes a `results` array.
- **Compact status** — `scaffold status --compact` hides completed and skipped steps, showing only a summary count line plus pending/in-progress steps. Both interactive and JSON modes supported.

### Updated

- **scaffold-runner skill** — Documents batch skip usage, compact status, new navigation mappings ("Skip X, Y, Z", "What's left?"), and updated session preferences table.
- **scaffold-pipeline skill** — Added `--compact` and batch skip to the Status & Navigation reference.

## [2.6.0] — 2026-03-27

### Refactored

- **Deduplicate design-system and ux-spec prompts** — Extracted design token content (colors, typography, spacing, shadows, dark mode, base components, pattern library) from `knowledge/core/ux-specification.md` into a new `knowledge/core/design-system-tokens.md`. ux-spec now references `docs/design-system.md` for visual tokens instead of redefining them. Clear boundary: design-system owns appearance, ux-spec owns behavior.
- **Deduplicate operations runbook** — Operations CI/CD section now references existing CI from git-workflow instead of redefining stages 1-2. Dev environment section replaced with reference to `docs/dev-setup.md`. Knowledge file trimmed by ~200 lines.

### Fixed

- **Make Beads truly optional across entire pipeline** — Beads was declared `conditional: "if-needed"` but ~30 commands hardcoded it as mandatory. Added `.beads/` directory detection throughout. Non-Beads projects get conventional commits (`type(scope): description`), standard branch naming (`<type>/<desc>`), and skip all `bd` CLI references. Affected 31 files across commands/ and pipeline/.

### Enhanced

- **Workflow audit cross-validates operations runbook** — workflow-audit now includes `docs/operations-runbook.md` in its document inventory and consistency checks. Verifies the runbook references (not redefines) base CI and dev-setup, and doesn't hardcode commands that differ from the Key Commands table.

## [2.5.2] — 2026-03-27

### Fixed

- **Directory artifact crash** — Fix `EISDIR: illegal operation on a directory, read` crash when re-running pipeline steps whose outputs include directory paths (e.g., `docs/domain-models/`). `detectUpdateMode` now skips directory entries.

## [2.5.1] — 2026-03-27

### Fixed

- **Beads no longer a tech-stack dependency** — Removed Beads from tech-stack prompt's dependency list since it's an optional tool, not a tech stack choice.

## [2.5.0] — 2026-03-27

### Enhanced

- **CLAUDE.md optimization prompt** — Added best practices for anti-sycophancy guidance, scope discipline, structured formats for critical rules, and Key Commands as single source of truth.

## [2.4.3] — 2026-03-26

### Fixed

- **Skill activation conflict** — scaffold-pipeline skill no longer activates for status/progress queries ("where am I?", "what's next?"). Removed v1 Completion Detection section (file-existence checks) and narrowed activation to static reference only. Status and navigation now correctly route to scaffold-runner, which uses the `scaffold` CLI.

## [2.4.2] — 2026-03-26

### Added

- **`scaffold reset <step>`** — reset a single step back to pending so you can re-run it. Validates step exists (with typo suggestions), confirms before resetting completed steps, warns on in_progress steps.

### Changed

- **Scaffold Runner skill** — now handles "re-run X", "redo X", "reset X" by running `scaffold reset <step> --force` then the full execution workflow
- **Scaffold Pipeline skill** — added "Re-running Steps" section explaining reset + update mode

## [2.4.0] — 2026-03-26

### Fixed

- **"Next eligible: none" bug** — `scaffold next` and `scaffold status` now correctly compute eligible steps by loading the methodology preset. Previously they built the dependency graph with an empty preset map, breaking eligibility computation for all projects.
- **`scaffold init --force` preserves completed steps** — re-initialization now reads old state before backup, applies step name migrations, and merges completed/skipped steps into the new state. Previously all progress was lost on re-init.
- **`scaffold status` shows live eligibility** — computes eligible steps fresh instead of displaying stale cache from state.json

## [2.3.6] — 2026-03-26

### Fixed

- **New pipeline phases not recognized** — frontmatter validator only allowed the original 9 phases. Added `foundation`, `environment`, `integration`, `stories`, `consolidation` to the schema.
- **Order range too restrictive** — `order` was limited to integers 1-36. Now allows numbers 1-100 (including decimals like 20.5) to accommodate the expanded pipeline.

## [2.3.5] — 2026-03-26

### Fixed

- **Skills installed to wrong directory structure** — `scaffold skill install` was creating `.claude/skills/<name>.md` (flat files) but Claude Code expects `.claude/skills/<name>/SKILL.md` (subdirectories). Now creates the correct structure. Also cleans up old flat files from v2.3.2-2.3.4 on re-install.

## [2.3.4] — 2026-03-26

### Fixed

- **Skills not shipped in npm package** — `skills/` directory was missing from `package.json` `files` array, so `scaffold skill install` couldn't find source files after Homebrew/npm install

## [2.3.3] — 2026-03-26

### Fixed

- **`scaffold skill install` path resolution** — skills directory was incorrectly resolved relative to `dist/` instead of the package root. Now uses `getPackageRoot()` consistent with pipeline/knowledge/methodology resolution.

## [2.3.2] — 2026-03-26

### Added

- **`scaffold skill` CLI command** — one-command skill installation for CLI-only users. `scaffold skill install` copies skills to `.claude/skills/`, `scaffold skill list` shows status, `scaffold skill remove` cleans up.

### Changed

- **README simplified** — plugin install (Step 2) is now the recommended path and includes both skills automatically. CLI-only users get `scaffold skill install` as a one-liner alternative.

## [2.3.1] — 2026-03-26

### Added

- **Scaffold Runner skill** (`skills/scaffold-runner/SKILL.md`) — Claude Code skill that wraps the scaffold CLI with intelligent decision point surfacing. Previews assembled prompts, extracts AskUserQuestion patterns (depth, strictness, optional sections), presents them as interactive questions, and executes with answers baked in.
- **README installation instructions** for the skill, with usage examples

## [2.3.0] — 2026-03-26

### Added

- **`scaffold build` command generation** (T-039-T-042) — generates rich command files from pipeline steps + knowledge base entries. Plugin users (`/scaffold:`) now get domain expertise in every command, closing the quality gap between the CLI and Plugin channels.
- **`loadFullEntries()`** in knowledge loader — returns complete knowledge content (Summary + Deep Guidance) for build-time use, while `loadEntries()` continues returning Deep Guidance only for CLI assembly

### Changed

- **`AdapterStepInput` extended** with `body`, `sections`, `knowledgeEntries`, `conditional`, `longDescription` — adapters now receive full step content for richer output generation
- **`ClaudeCodeAdapter` rewritten** — generates self-contained command files with meta-prompt body, domain knowledge content, and dependency-derived navigation instead of simple wrappers

## [2.2.2] — 2026-03-26

### Added

- **Automatic state migration** — upgrading from v2.1 to v2.2 is now frictionless. On first `scaffold status` or `scaffold run`, the state manager automatically renames `testing-strategy` → `tdd`, `implementation-tasks` → `implementation-plan`, `review-tasks` → `implementation-plan-review` in `.scaffold/state.json`
- **PRD path flexibility** — projects using `docs/prd.md` (v1 convention) or `docs/plan.md` (v2 convention) now work interchangeably. The context gatherer resolves aliased artifact paths, and the project detector recognizes both filenames

## [2.2.1] — 2026-03-26

### Added

- **Meta-evals** — 6 bats-based eval files in `tests/evals/` (20 tests) that verify cross-system consistency: channel parity, knowledge quality gates, pipeline step completeness, command structure, cross-channel consistency, redundancy detection
- **`make eval` target** — runs meta-evals separately from `make test` and `make check` (opt-in for CI)

### Fixed

- **10 knowledge quality gaps** caught by the new evals: `user-story-innovation.md` expanded to 228 lines, code blocks added to 9 files (adr-craft + 8 review files)
- **`create-prd` pipeline output path** — corrected from `docs/prd.md` to `docs/plan.md` to match the actual command behavior

## [2.2.0] — 2026-03-26

### Added

- **Full pipeline/command/knowledge parity** — every pipeline step now has a matching Claude Code slash command and knowledge base reference. 53 pipeline steps, 69 commands, 43 knowledge entries.
- **31 new commands** — domain-modeling, adrs, system-architecture, database-schema, api-contracts, ux-spec, 11 review commands, 7 validation commands, operations, security, innovate-prd, innovate-user-stories, apply-fixes-and-freeze, developer-onboarding-guide, implementation-playbook
- **16 new pipeline steps** across 5 new phases (foundation, environment, integration, stories, consolidation) — beads, tech-stack, claude-code-permissions, coding-standards, project-structure, dev-env-setup, design-system, git-workflow, multi-model-review, add-playwright, add-maestro, user-stories-multi-model-review, platform-parity-review, claude-md-optimization, workflow-audit, multi-model-review-tasks
- **4 new knowledge files** — tech-stack-selection, coding-conventions, project-structure-patterns, dev-environment
- **Create Evals command** (`/scaffold:create-evals`) — generates project-specific eval checks from standards documentation with eval-craft knowledge base (843 lines)
- **Deep Guidance engine support** — `knowledge-loader.ts` now loads only the `## Deep Guidance` section from restructured knowledge files, reducing CLI prompt redundancy by 50-70%
- **Meta-eval specification** — `docs/eval-spec.md` documents 6 automated eval checks for maintaining cross-system consistency
- **Completeness audit prompt** — `prompts/scaffold-completeness-audit.md` for running full dual-channel architecture audits

### Changed

- **Pipeline step naming aligned to commands** — `testing-strategy` → `tdd`, `implementation-tasks` → `implementation-plan`, `review-tasks` → `implementation-plan-review`
- **Knowledge file `security-review` renamed** to `security-best-practices` to avoid confusion with the review knowledge file
- **5 knowledge files restructured** with Summary/Deep Guidance sections — eval-craft, prd-craft, user-stories, task-decomposition, testing-strategy
- **6 knowledge files improved** — apply-fixes-and-freeze expanded from 94 to 244 lines; 5 review files gained anti-patterns sections with concrete finding examples
- **Methodology presets updated** — deep.yml, mvp.yml, custom-defaults.yml now include all 53 pipeline steps with proper conditional markers
- **Step 4.5 AI Review enhanced** — optional acceptance criteria verification when task references user stories
- **README updated** — 14 phases, 53 steps, CLI vs plugin usage clarification, Deep Guidance documentation

## [2.1.2] — 2026-03-25

### Fixed

- **Meta-prompt loading with FAILSAFE_SCHEMA** — `conditional: null` in pipeline frontmatter was parsed as the string `"null"` instead of actual `null`, causing all 36 meta-prompts to be skipped with "Required field conditional is missing"

## [2.1.1] — 2026-03-25

### Fixed

- **Global install path resolution** — `scaffold next`, `scaffold run`, and other commands now correctly find the bundled `pipeline/`, `knowledge/`, and `methodology/` directories when installed via npm or Homebrew, instead of looking in the user's project directory
- **Package renamed** — npm package is now `@zigrivers/scaffold` (was `@scaffold-cli/scaffold`)
- **Update command** — `scaffold update` now checks the correct package name on the npm registry
- **Homebrew formula** — added missing `require "language/node"` for compatibility with current Homebrew

### Changed

- **README rewritten** — reflects v2 architecture (assembly engine, meta-prompts, 9 phases, 36 steps, methodology presets, knowledge system, CLI commands)
- **Installation docs** — clarified that CLI (npm/brew) and plugin (`/scaffold:` slash commands) are separate installs

## [2.1.0] — 2026-03-17

### Added

- **`scaffold knowledge` subcommand namespace** — four subcommands for managing project-local knowledge base overrides:
  - `scaffold knowledge update <target> [instructions...]` — generates a Claude prompt to create or refresh `.scaffold/knowledge/<name>.md`; `<target>` resolves as an entry name or step name (auto-detected), with `--step` flag to force step resolution and `--entry` to target a single entry from a step's set
  - `scaffold knowledge list` — shows all entries (global and local overrides) with NAME/SOURCE/DESCRIPTION columns; `--format json` supported
  - `scaffold knowledge show <name>` — prints the effective content for an entry (local override wins if present)
  - `scaffold knowledge reset <name>` — removes a local override, reverting to global; respects `--auto` flag to bypass uncommitted-changes confirmation
- **`buildIndexWithOverrides()`** — `scaffold run` now automatically loads project-local knowledge overrides from `.scaffold/knowledge/` during prompt assembly, layering them over global entries without any extra configuration
- **`/scaffold:knowledge` slash command** — Claude Code integration for the full knowledge namespace
- **Project-local knowledge overrides** — committable `.scaffold/knowledge/` files let teams share enriched, project-specific knowledge entries across the whole team

## [2.0.0] — 2026-03-16

### Breaking Changes

This is a complete rewrite of Scaffold. The v1 hard-coded Bash prompt pipeline has been replaced with a composable TypeScript CLI and meta-prompt architecture.

**Migration:** See `docs/v2/migration-guide.md` for step-by-step upgrade instructions.

### Added

- **TypeScript CLI** (`dist/index.js`) — fully typed, ESM, Node 18+ with 15 commands
- **Meta-prompt architecture** — 30-80 line intent declaration `.md` files in `pipeline/` assembled at runtime into structured 7-section prompts
- **Assembly engine** (`scaffold run <step>`) — loads meta-prompt, knowledge base, context, instructions, depth; constructs and outputs the full prompt for AI execution
- **Dependency graph** — DAG with topological sort (Kahn's algorithm), cycle detection, and eligibility computation
- **State manager** — atomic writes via `<file>.tmp` → `fs.renameSync()`, crash recovery, `in_progress` tracking
- **Advisory lock manager** — `lock.json` with `wx` flag and PID liveness detection
- **Decision logger** — append-only `decisions.jsonl` with `D-NNN` sequential IDs
- **Three methodology presets** — `deep` (depth 5, 36 steps), `mvp` (depth 1, 7 steps), `custom` (depth 3, configurable)
- **Depth scale 1-5** — 4-level precedence: CLI flag > step-override > custom-default > preset-default
- **Platform adapters** — Claude Code (`commands/*.md`), Codex (`AGENTS.md`), Universal (`prompts/README.md`)
- **Project detector** — greenfield / brownfield / v1-migration detection via file system signals
- **CLAUDE.md manager** — ownership markers, 2000-token budget, section management
- **Init wizard** (`scaffold init`) — interactive or `--auto` mode; writes config, state, decisions log
- **Adopt command** (`scaffold adopt`) — scans existing artifacts to bootstrap state for brownfield projects
- **Dashboard** (`scaffold dashboard`) — self-contained HTML with progress bars, status badges, light/dark theme
- **Validate command** (`scaffold validate`) — checks meta-prompts, config, state, and dependency graph
- **15 CLI commands total**: `init`, `run`, `build`, `adopt`, `skip`, `reset`, `status`, `next`, `validate`, `list`, `info`, `version`, `update`, `dashboard`, `decisions`
- **OutputContext strategy pattern** — `interactive` (ANSI, spinner), `json` (envelope), `auto` (silent defaults)
- **E2E test suite** — 39 tests covering real temp-directory workflows
- **Performance benchmarks** — assembly p95 < 500ms, state I/O p95 < 100ms, graph build p95 < 2s
- **npm packaging** — `@zigrivers/scaffold`, `files` array, `publishConfig`
- **Migration guide** — `docs/v2/migration-guide.md` with v1→v2 concept mapping and step-by-step instructions

### Changed

- Plugin description updated to reflect meta-prompt architecture
- `pipeline/` now contains composable `.md` meta-prompts instead of hard-coded Bash prompt text
- `methodology/` contains YAML preset files consumed at runtime

### Completed Tasks

- [BD-scaffold-v2] Complete v2 spec suite — domains, ADRs, schemas, API, UX, and implementation tasks
- [BD-3hj] fix(v2): resolve scope creep check findings
- [BD-11m] fix(v2): resolve dependency graph validation findings
- [BD-0nx] fix(v2): resolve implementability dry-run audit findings
- [BD-zcp] fix(v2): resolve decision completeness audit findings
- [BD-eg0] fix(v2): resolve traceability matrix audit findings
- [BD-p2m] fix(v2): resolve cross-phase consistency audit findings
- [BD-045] fix(v2): post-rename documentation review fixes

## [1.18.0] — 2026-03-08

### Added
- **Session Analyzer command** (`/scaffold:session-analyzer`) — analyzes Claude Code session history across all projects to identify repeated tasks and workflows, then recommends what to automate as skills, plugins, agents, and CLAUDE.md rules
- **CI workflow** — `.github/workflows/ci.yml` runs `make check` on all pull requests to the scaffold repo itself

### Fixed
- `bd hook` invocation corrected (`bd hooks run` → `bd hook pre-commit`)
- Removed broken `bd worktree create` call from `setup-agent-worktree.sh`

### Changed
- `AGENTS.md` simplified: removed `--claim` flag from `bd update`, streamlined landing-the-plane workflow to focus on pushing
- Minor wording updates across `commands/` and `README.md`

### Completed Tasks
- [BD-scaffold-smx] fix(workflow): streamline workflow docs and fix friction points

## [1.17.0] — 2026-02-19

### Added
- **AI review subagent step** — Git Workflow prompt now includes an AI review step (step 4.5) in the PR workflow: spawn a review subagent to check `git diff origin/main...HEAD` against CLAUDE.md and docs/coding-standards.md; P0/P1 findings block push; recurring patterns feed into `tasks/lessons.md`
- **Code Review section in CLAUDE.md** — scaffold's own CLAUDE.md now documents the review subagent approach as a dedicated section

### Fixed
- **Inaccurate Tier 1 claim** — Multi-Model Code Review prompt previously claimed `claude -p` was built into the Git Workflow prompt; replaced with the correct subagent approach using the Task tool (available in all Claude Code sessions)
- Removed all `claude -p` references from active workflow steps across `prompts.md`, `commands/`, `docs/`, and `CLAUDE.md`

### Changed
- Git Workflow Section 4 PR workflow updated: step 2 is now AI review (subagent), not `claude -p`
- CLAUDE.md Optimization Implementation Loop updated: references AI review subagent, not `claude -p`
- Workflow Audit canonical step 4.5 updated: describes review subagent approach and compound learning loop
- Multi-Model Code Review Tier 1 architecture diagram and description updated for accuracy
- `docs/add-multi-model-review.md` Phase 3.1 and 3.3 updated: subagent approach replaces `claude -p`
- PR workflow sub-step count updated from 7 to 8 (commit + AI review + rebase + push + create + auto-merge + watch + confirm)

### Completed Tasks
- [BD-scaffold-smx] fix(workflow): streamline Beads workflow docs and fix friction points
- [BD-scaffold-cga] feat(workflow): add AI review subagent step to pipeline

## [1.16.0] — 2026-02-18

### Added
- **Remove CI as merge gate** — scaffold pipeline no longer generates a CI workflow; local verification (`make check` + git hooks) is the authoritative quality gate for all scaffolded projects
- **Dashboard task modals** — click any Beads task to see full detail, dependencies, priority, and status in a pop-up; standalone command cards now also show the full prompt on click ([BD-scaffold-06k])

### Changed
- `gh pr merge` commands throughout drop `--auto` (which required CI status checks) in favor of direct squash-merge
- Branch protection config changed from `required_status_checks` to `null` — PRs required, no CI gate
- Section 9 "Repository Hygiene" updated: code quality git hooks (`make hooks`) are now the quality gate
- Git Workflow prompt removes the CI workflow file template entirely
- Multi-Model Review agent workflow updated: "Wait for CI" step removed

### Fixed
- Standalone command modals now show prompt content when clicked ([BD-scaffold-906])
- `mktemp` on macOS no longer fails when template has extension after XXXXXX ([BD-scaffold-ojr])

### Other
- Relocated loose root files (`add-multi-model-review.md`, research docs) to `docs/` ([BD-scaffold-9ot])

### Completed Tasks
- [BD-scaffold-33d] Remove CI as merge gate from scaffold pipeline
- [BD-scaffold-06k] Dashboard: task modals, status tags, command pop-ups
- [BD-scaffold-906] fix(dashboard): standalone command modals show nothing when clicked
- [BD-scaffold-ojr] fix(dashboard): mktemp uses literal XXXXXX on macOS due to trailing slash in TMPDIR
- [BD-scaffold-9ot] chore: relocate loose root files to docs/

## [1.15.0] — 2026-02-17

### Added
- **Version Bump** command (`/scaffold:version-bump`) — lightweight companion to `/scaffold:release` for marking development milestones; bumps version numbers and updates changelog without tags, push, or GitHub release; supports auto (commit analysis), explicit (`major`/`minor`/`patch`), and `--dry-run` modes; first-bump detection creates version files for new projects
- **`current` mode** for `/scaffold:release` — tag and release the version already in files without bumping further; ideal after `/scaffold:version-bump`
- **Version mismatch detection** in `/scaffold:release` (Phase 0.6) — when version in files exceeds the last tag, asks whether to release as-is or bump further
- US-12.10 (version bump milestone) and US-12.11 (release detects pre-bumped version) user stories in Epic 12

### Changed
- F-SC-2 (Release Management) expanded to cover both `version-bump` and `release` commands with interaction patterns
- F-SC-1 standalone commands list updated to include `version-bump`
- Release command "After This Step" updated to mention `/scaffold:version-bump`
- Prompt count updated from 28 to 29 across README, plugin.json, and prompts.md
- Plugin version bumped from 1.14.0 to 1.15.0

## [1.14.0] — 2026-02-17

### Added
- **Release** command (`/scaffold:release`) — automates versioned releases with conventional commit analysis, quality gates, changelog generation, version file detection and bump, git tagging, and GitHub release creation
- 7-phase release flow: project detection → version analysis → pre-release validation → changelog & release notes → version bump & commit → tag & publish → post-release summary
- 4 modes: standard (auto-suggest bump), explicit (`major`/`minor`/`patch`), dry-run (`--dry-run`), and rollback
- Version file auto-detection for `package.json`, `pyproject.toml`, `Cargo.toml`, `.claude-plugin/plugin.json`, `pubspec.yaml`, `setup.cfg`, `version.txt`
- Branch-aware publishing: direct flow on `main`/`master`, PR flow on feature branches with fallback
- Rollback with exact-tag-name safety confirmation, partial-failure reporting, and manual cleanup instructions
- Beads task integration in release notes (conditional on `.beads/` presence)
- First-release bootstrapping for projects with no existing tags
- Epic 12 (Release Management) with 9 user stories (US-12.1–12.9) in `docs/user-stories.md`
- F-SC-2 feature requirement in `docs/plan.md`

## [1.13.0] — 2026-02-17

### Fixed
- **`bd q` bug** — post-merge follow-up workflow used `bd q` (non-existent command) instead of `bd create` for creating Beads tasks from unresolved findings

### Added
- **Await PR review script** (`scripts/await-pr-review.sh`) — new artifact in multi-model-review prompt; polling script that agents call to wait for Codex Cloud review before merging, with distinct exit codes for approved/findings/timeout/skipped/error
- **Agent merge gate** safety rail — forces agents to wait for Codex review when `--auto` is unavailable, preventing race conditions between agents and the review loop
- **`--admin` prohibition** — agents are explicitly prohibited from using `gh pr merge --admin` in the CLAUDE.md workflow to prevent bypassing all protections
- **9-step PR workflow** in CLAUDE.md section — replaces the basic 5-step workflow with full Codex review waiting (step 7), merge-state checking (step 8), and error recovery table
- **`--auto` fallback** in handler and timeout workflows — tries `--auto` first, falls back to direct merge when `allow_auto_merge` is disabled on the repo
- Error Recovery table in CLAUDE.md section covering `--auto` failures, branch protection blocks, review timeouts, and merge conflicts
- Process steps for await script creation (step 5) and `docs/git-workflow.md` update (step 9)
- Test verification items for await script exit codes and `--auto` fallback behavior

### Changed
- Architecture "What Triggers What" step 5 updated from hardcoded `--auto` command to fallback description
- CLAUDE.md section expanded from simple overview to complete PR workflow that replaces git-workflow's basic version
- Process section renumbered from 9 to 11 steps to include await script and git-workflow.md update
- Commit step updated to include `scripts/await-pr-review.sh` and `docs/git-workflow.md` in staged files
- Secondary outputs list updated to include `scripts/await-pr-review.sh` and `docs/git-workflow.md`

## [1.12.1] — 2026-02-17

### Fixed
- **MCP `mcp__*` wildcard bug** — `mcp__*` doesn't reliably match all MCP tools ([known issue](https://github.com/anthropics/claude-code/issues/3107)); added bare server-name entries (`mcp__plugin_playwright_playwright`, `mcp__plugin_context7_context7`) alongside the wildcard as a more reliable alternative
- **Incorrect Playwright tool names** — `browser_fill`, `browser_select`, `browser_scroll`, `browser_get_text`, `browser_get_attribute` replaced with actual MCP tool names (`browser_fill_form`, `browser_select_option`, `browser_evaluate`, etc.)
- **Incomplete Playwright tool list** — `.claude/settings.local.json` listed 8 of 22 tools; now includes all 22 Playwright MCP tools

### Added
- MCP detection step in permissions Process section — discovers installed plugins and adds bare server-name entries
- Playwright Permissions section (section 7) in `add-playwright` command with complete 22-tool fallback list
- Troubleshooting item 6 for `mcp__*` wildcard bug in permissions command
- MCP smoke test instructions in Tier 2 verification

### Changed
- Permissions command JSON example includes bare server-name entries alongside `mcp__*`
- Cautious mode MCP entries changed from `__*` suffix to bare server names
- Playwright "Available MCP Commands" expanded from 13 to 22 tools across 3 reorganized categories

## [1.12.0] — 2026-02-17

### Fixed
- **Beads detection bug** — dashboard detection checked for `.beads/ directory` (awk parser produced invalid path); now checks `.beads/config.yaml`
- **Beads task count bug** — `bd list --json` only returned open tasks; now uses `bd list --all --json` for complete data
- **jq self-reference bug** — checkFile enrichment compared `.step == .step` (always true); now captures outer step variable with `(.step) as $s`
- **SKILL.md detection entries** — fixed `AGENTS.md + .github/workflows/...` (+ syntax confused parser) and `Playwright config file` (descriptive text, not a path); added defensive `sub(/ .*/, "", check)` strip in awk parser

### Added
- **Light/dark mode toggle** — sun/moon toggle button in header with `localStorage` persistence; defaults to dark mode; CSS uses `[data-theme="dark"]` selector instead of `@media prefers-color-scheme`
- **Status badges with legend** — replaced status dots with icon+label pill badges (`✓ Done`, `≈ Likely Done`, `→ Skipped`, `○ Pending`); added status legend below header
- **Long descriptions** — added `long-description` frontmatter field to all 33 command files with 1-2 sentence expanded descriptions; displayed below short description on prompt cards
- **Prompt drill-down modal** — click any prompt card to view full prompt content in a modal overlay; includes "Copy Full Prompt" button, close via X/Escape/backdrop click
- **Beads task section** — new section showing all Beads tasks with priority badges, status icons, and Open/Closed/All filter buttons
- 13 new bats tests covering all enhancements (43 total)
- Design system documentation for 6 new components (theme toggle, status badge, status legend, prompt modal, beads section, long description)

### Changed
- `lib/dashboard-theme.css` — dark mode mechanism from `@media` query to `[data-theme]` selector; added styles for all new components (theme toggle, status badges, legend, modal, beads section, long descriptions)
- `scripts/generate-dashboard.sh` — added data pipelines for long descriptions, prompt content, and full beads task data; added all interactive JS (theme toggle, modal, beads filters)

## [1.11.0] — 2026-02-17

### Added
- **Dashboard Design System** — extracted and redesigned all dashboard CSS into `lib/dashboard-theme.css` with a "Precision Industrial" visual identity: deep navy dark mode with indigo accents, cool-white light mode with emerald/amber status colors, gradient progress rail with glow effects, lifted hover cards, pulsing "What's Next" banner, and status dots with ring halos
- `lib/dashboard-theme.css` — standalone CSS file with 40+ design tokens (light + dark mode), 4-px spacing scale, multi-layer shadow system, and all 10 component styles; embedded into generated HTML by `generate-dashboard.sh`
- `docs/design-system.md` — comprehensive design system documentation covering tokens, typography, spacing, components, interaction patterns, dark mode philosophy, and extension guide
- Section 10 "Styling / Dashboard Design System" in `docs/coding-standards.md` — rules for using CSS custom properties and maintaining self-contained HTML
- Design System section and docs table entry in `CLAUDE.md`

### Changed
- `scripts/generate-dashboard.sh` — replaced ~200 lines of inline CSS with external `cat lib/dashboard-theme.css` embedding; split heredoc into HTMLPRE/CSS/HTMLPOST; added `.wrap` container div for layout control
- `docs/project-structure.md` — added `dashboard-theme.css` to `lib/` listing, `design-system.md` to `docs/` listing, CSS file placement rule to table

## [1.10.0] — 2026-02-17

### Added
- **Visual Pipeline Dashboard** command (`/scaffold:dashboard`) — generates a self-contained HTML file and opens it in the browser, showing a visual overview of the full pipeline with completion status, descriptions, dependency indicators, "what's next" guidance, and optional Beads task counts
- `scripts/generate-dashboard.sh` — Bash 3.2-compatible script that parses pipeline metadata from SKILL.md, detects completion status from `.scaffold/config.json` and artifact files, computes dependency-aware "what's next", and generates inline HTML/CSS/JS with automatic dark/light mode
- 16 bats tests covering exit codes, HTML validation, JSON payload structure, status detection, and all CLI flags
- F-UX-13 feature requirement in `docs/plan.md`
- Epic 11 with 4 user stories (US-11.1–11.4) in `docs/user-stories.md`
- Dual mode: overview mode (no `.scaffold/`) shows full pipeline as reference; progress mode (with `.scaffold/`) shows actual completion status
- CLI flags: `--no-open` (generate only), `--json-only` (JSON to stdout), `--output FILE` (custom path)

## [1.9.0] — 2026-02-17

### Added
- **Implementation Plan Multi-Model Review** command (`/scaffold:multi-model-review-tasks`) — optional quality gate (step 20.5) that runs Codex and Gemini as independent reviewers of the Beads task graph, checking coverage gaps, description quality, dependency correctness, sizing, and architecture coherence
- `scripts/implementation-plan-mmr.sh` — automation script for parallel Codex/Gemini CLI review of implementation tasks with graceful degradation, auto-retry, and JSON validation
- `scripts/implementation-plan-mmr.schema.json` — structured output schema with 6 review dimensions: coverage_gaps, description_issues, dependency_issues, sizing_issues, architecture_issues, review_summary
- Task coverage map (`docs/reviews/implementation-plan/task-coverage.json`) for verifiable acceptance-criterion-to-task traceability

### Changed
- Implementation Plan Review "After This Step" updated to mention optional multi-model review before execution
- Pipeline tables updated across `prompts.md`, `commands/prompt-pipeline.md`, `skills/scaffold-pipeline/SKILL.md` with step 20.5
- Completion detection table updated with `review-summary.md` check for step 20.5
- `scripts/extract-commands.sh` updated with FRONTMATTER, HEADING_TO_SLUG, and next-steps mappings for new command

## [1.8.0] — 2026-02-17

### Added
- **Post-Merge Follow-Up** system integrated into `multi-model-review` command — when PRs merge with unresolved P0/P1 findings (round cap, timeout, or late Codex review), automatically creates a Beads task, GitHub Issue, and follow-up PR to address escaped findings
- New workflow template: `.github/workflows/post-merge-followup.yml` — fires on `pull_request: [closed]` and `pull_request_review: [submitted]` with 6 safety gates (merged, not-followup, no-duplicate, not-fork, trigger-specific, findings-exist)
- New fix prompt template: `.github/review-prompts/followup-fix-prompt.md` — instructs Claude Code to fix findings using `diff_hunk` context (line numbers may shift after merge)
- `FOLLOWUP_ON_CAP` env var in handler workflow — configurable cap behavior: `"auto-merge-followup"` (default) merges and follows up, `"block-merge"` blocks merge and adds `needs-human-review` label
- New labels: `followup-created` (dedup), `followup-fix` (recursion prevention), `needs-human-review` (block-merge mode)
- Tier 3 added to architecture diagram showing the post-merge follow-up flow
- "Configuring Cap Behavior" customization section
- Follow-up test scenarios added to Process step 8

### Changed
- Handler workflow convergence check now splits `capped` verdict into `capped` (auto-merge + follow-up) and `capped-blocked` (block merge) based on `FOLLOWUP_ON_CAP` setting
- `capped` verdict message updated to mention follow-up PR
- CLAUDE.md template updated with Post-Merge Follow-Up subsection and 3 new label descriptions
- Mode Detection read list expanded to include `post-merge-followup.yml` and `followup-fix-prompt.md`
- Update Mode Specifics expanded with new secondary outputs and `FOLLOWUP_ON_CAP` preserve rule

## [1.7.2] — 2026-02-16

### Fixed
- Normalize 5 prompt headings in `prompts.md` from `##` to `#` — Tech Stack, Coding Standards, TDD, Project Structure, and Integrate Playwright now match the `# Name (Prompt)` convention used by all other prompts

## [1.7.1] — 2026-02-16

### Fixed
- `prompt-pipeline` command now includes step 15.5 (User Stories Multi-Model Review) in the Phase 5 table — was missing from the quick-reference display despite being defined everywhere else

## [1.7.0] — 2026-02-16

### Added
- **Pipeline Completion Detection** — `scaffold-pipeline` skill now includes a `## Completion Detection` section with exact file paths and tracking comment patterns for all 20 pipeline steps, enabling accurate status checks
- Tracking comment instructions for 6 update-only prompts: PRD Gap Analysis, User Stories Gaps, Platform Parity Review, Claude.md Optimization, Workflow Audit, and Implementation Plan Review — each now writes a `<!-- scaffold:<step-id> v1 YYYY-MM-DD -->` marker so completion is detectable

### Fixed
- Pipeline status detection no longer guesses file paths (e.g., checking `docs/prd.md` instead of the actual `docs/plan.md`)
- Update-only steps (2, 15, 16, 17, 18, 20) are now distinguishable from their prerequisite steps via unique tracking comments

## [1.6.1] — 2026-02-16

### Added
- `docs/multi-model-stories-review-setup.md` — beginner-friendly setup guide for Codex CLI and Gemini CLI installation, authentication, and troubleshooting
- README: "Codex CLI and/or Gemini CLI" entry in Optional prerequisites section with link to setup guide
- README: `/scaffold:user-stories-multi-model-review` entry in Other optional steps section with link to setup guide

## [1.6.0] — 2026-02-16

### Added
- **User Stories Multi-Model Review** command (`/scaffold:user-stories-multi-model-review`) — optional quality gate that runs Codex and Gemini as independent reviewers of user stories, enforcing 100% PRD coverage with hard traceability
- `scripts/user-stories-mmr.sh` — automation script for parallel Codex/Gemini CLI review execution with graceful degradation, auto-retry, and JSON validation
- `scripts/user-stories-mmr.schema.json` — structured output schema for review JSON (used by Codex `--output-schema` and Gemini output validation)
- Atomic PRD requirements index (`docs/reviews/user-stories/requirements-index.md`) and coverage map (`docs/reviews/user-stories/coverage.json`) for verifiable PRD-to-story traceability

### Changed
- Prompt count updated from 26 to 27 across all references
- User Stories Gap Analysis "After This Step" updated to mention optional multi-model review

## [1.5.0] — 2026-02-16

### Added
- **Quick Task** command (`/scaffold:quick-task`) — Create focused Beads tasks for bug fixes, refactors, performance improvements, and small refinements without full Enhancement discovery
- Phase 0 Complexity Gate auto-detects when a "quick task" is actually an enhancement and redirects to `/scaffold:new-enhancement`
- Duplicate detection via `bd list` before creating tasks (matches Implementation Plan prompt pattern)
- `tasks/lessons.md` review as first-class input during task definition — surfaces anti-patterns early
- Conventional commit task titles (`type(scope): description`) that feed directly into commit messages
- Cross-reference from Enhancement prompt's "When NOT to Use" section pointing to Quick Task for bug fixes, refactoring, and performance work

### Changed
- Enhancement prompt "When NOT to Use" updated to reference `/scaffold:quick-task` instead of generic advice
- Prompt count updated from 25 to 26 across all references

## [1.4.0] — 2026-02-16

### Added
- **Universal Update Mode** for all 14 document-creating prompts — each prompt now auto-detects whether its output file already exists and switches between fresh (create from scratch) and update (preserve project-specific content, add missing sections) modes
- Mode Detection protocol: read existing doc, diff against current prompt structure, categorize content as ADD/RESTRUCTURE/PRESERVE, preview changes for user approval, execute update, add version tracking comment
- Per-prompt Update Mode Specifics with primary/secondary outputs, preserve rules, related docs for consistency checks, and special merge rules
- Version tracking comments (`<!-- scaffold:<prompt-id> v<ver> <date> -->`) added to all generated documents for update mode detection
- "Update Mode" section in setup order table explaining that re-running any prompt brings its output up to date

### Removed
- Migration Prompts section (Beads Migration, Workflow Migration, Permissions Migration stubs) — replaced by universal update mode. Every prompt is now its own migration.

### Changed
- "Ongoing" section updated to note that any prompt can be re-run in update mode

## [1.3.8] — 2026-02-16

### Breaking Changes
- Single `code-review.yml` workflow replaced by three event-driven files: `code-review-trigger.yml`, `code-review-handler.yml`, and `codex-timeout.yml` (optional)
- AGENTS.md heading changed from `## Code Review Instructions` to `## Review guidelines`
- Approval signal changed from `APPROVED: No P0/P1/P2 issues found.` to `APPROVED: No P0/P1 issues found.`

### Added
- Fully event-driven review loop — handler fires on `pull_request_review` events, no more 10-minute polling
- Fork and draft PR blocking in gate job (security hardening)
- Codex usage-limit detection — labels PR `ai-review-blocked` and requires human merge when credits are exhausted
- Stale review detection — handler compares review `commit_id` to HEAD SHA, skips outdated reviews
- `commit_id` filtering in fix prompt — only reads findings for the current commit

### Fixed
- Shell `git diff | grep | wc -l` pipelines replaced with `gh api` + `jq` (fixes pipefail crashes on zero matches)
- Human override now verified via `author_association` (prevents non-members from bypassing review)
- Removed unnecessary `actions/checkout` from trigger workflow

### Changed
- Tier-2 (Codex Cloud) review scoped to P0/P1 only, matching real Codex behavior (P2/P3 handled by self-review)
- Cost model updated from "subscription-based (no per-review cost)" to credit-based (~25 credits/review, weekly limits)
- Convergence logic reordered: approval signal → zero findings → round cap → fix
- Prerequisites updated to accept ChatGPT Plus/Pro/Team (not just Pro)
- README updated to reflect credit-based pricing

## [1.3.7] — 2026-02-15

### Added
- Tiered model selection for `claude-fix` job — round 1 uses Sonnet (~40% cheaper), round 2+ escalates to Opus when prior fix didn't satisfy reviewer
- Updated Safety Rails cost cap documentation to reflect tiered pricing

## [1.3.6] — 2026-02-15

### Fixed
- `/scaffold:update` now actively updates plugin installs by pulling the marketplace clone in-place, instead of telling the user to run a manual command
- `/scaffold:version` dynamically detects the installed version from the marketplace clone's `plugin.json`, replacing the hardcoded version that went stale after updates

## [1.3.5] — 2026-02-15

### Added
- MCP tool permissions (`mcp__*`) to Claude Code Permissions prompt — auto-approves all MCP plugin tools (Context7, Playwright, etc.) so agents aren't prompted on every MCP call
- Per-server MCP wildcards added to cautious mode
- MCP troubleshooting and verification guidance

## [1.3.4] — 2026-02-15

### Added
- `docs/scaffold-overview.md` — central reference document covering purpose, all 29 commands, pipeline phases, dependencies, documentation outputs, and key concepts

## [1.3.1] — 2026-02-15

### Added
- `.claude-plugin/marketplace.json` — enables two-step plugin install via `/plugin marketplace add`

### Fixed
- Update install flow from single-command `/plugin install scaffold@zigrivers/scaffold` to two-step marketplace flow (`/plugin marketplace add` + `/plugin install scaffold@zigrivers-scaffold`)
- Update all docs and commands to use `/plugin marketplace update zigrivers-scaffold` instead of re-running install

## [1.3.0] — 2026-02-15

### Added
- `/scaffold:multi-agent-start` command — start multi-agent execution loop in a worktree
- `/scaffold:multi-agent-resume` command — resume multi-agent work after a break

## [1.2.0] — 2025-02-15

### Added
- `/scaffold:version` command — check installed vs. latest version without updating

## [1.1.0] — 2025-02-15

### Added
- `/scaffold:update` command — check for and apply scaffold updates from within Claude Code
- `scripts/update.sh` — standalone CLI update script for terminal use
- `.scaffold-version` marker file written on install for version tracking
- This changelog

### Fixed
- Permissions prompt restructured to fix compound command prompting (`78fda92`)

## [1.0.0] — 2025-02-01

### Added
- Initial release — 25-prompt pipeline for scaffolding new software projects
- Plugin install via `/plugin marketplace add zigrivers/scaffold` + `/plugin install scaffold@zigrivers-scaffold`
- User command install via `scripts/install.sh`
- Auto-activated pipeline context skill
- Full pipeline from product definition (Phase 1) through implementation (Phase 7)
