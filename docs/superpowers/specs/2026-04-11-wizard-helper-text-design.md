# Wizard Helper Text — Design

**Status:** Design complete, ready for implementation
**Date:** 2026-04-11
**Author:** Brainstormed with Claude Code; reviewed across 3 rounds with Superpowers code-reviewer subagent, Codex CLI, and Gemini CLI.

## Problem

`scaffold init` runs an interactive wizard (`src/wizard/questions.ts`) that asks ~55 questions across 9 project-type branches (`web-app`, `backend`, `cli`, `library`, `mobile-app`, `data-pipeline`, `ml`, `browser-extension`, `game`). About 40 of those questions are `select` or `multiSelect` prompts whose options are jargon-heavy enum tokens: `spa | ssr | ssg | hybrid`, `rest | graphql | grpc | trpc | none`, `dag-based | event-driven | scheduled`, `cache | offline-first`, etc.

A new user runs `scaffold init` and is asked to choose between option labels they may not understand. They have no in-product way to learn what the options mean — they have to leave the terminal, find the docs, and come back. The goal of this design is to make the wizard self-explanatory: every question should give the user enough context to choose confidently without leaving the prompt.

## Goals

- **Per-option descriptions** are visible inline for every select/multiSelect, so users see what each enum value means as they decide.
- **Optional per-question short hints** above selects whose options aren't self-explanatory even with descriptions.
- **Long-form help on demand** — typing `?` at a select prompt expands a paragraph of recommendation/consequence/affects-this guidance.
- **Type-safe authoring** — the copy lives in TypeScript, derived from the config schema, so adding an enum value to the schema fails compilation until the corresponding option description is written.
- **Zero regression** for power users who already know what they're picking — the prompt is still single-keypress numeric, the wizard footprint grows by ~one line of description per option, not paragraphs of preamble.
- **Pre-existing UX bugs surfaced by the design are fixed in the same PR** (NO_COLOR conflation, silent invalid-input fallback, stdin TTY detection, missing Ctrl-C handling).

## Non-goals

- Reducing the number of wizard questions. The deeper UX win is fewer questions, but that's a separate, larger effort.
- Surfacing schema-derived constraints in help text automatically (e.g., "SSR can't deploy to static"). Worth doing eventually; out of scope here.
- i18n / localization. Copy is English-only.
- Confirmation prompts (`y/n`) gaining `?` support. They keep inquirer's native single-keypress behavior; `?` is restricted to `select`/`multiSelect`.
- Free-text prompts (`prompt`, `multiInput`) gaining `?` support. They get an optional dim short-hint line above them; `?` stays a literal user-input character.

## UX

### Typical select question

```
? Rendering strategy? (? for help)
  1. Single-page app (SPA)
     Client renders after initial load — good for dashboards.
  2. Server-side rendering (SSR)
     Server renders each request — fresher data, fits SEO needs.
  3. Static generation (SSG)
     Pre-rendered at build time — fastest, less dynamic.
  4. Hybrid
     Mix of static and server-rendered routes.
> spa
```

### Same question after the user types `?`

```
  Rendering strategy decides where your HTML comes from. Start with SPA
  for dashboards, SSR if you need SEO and fresh data, SSG when content
  changes infrequently, or hybrid to mix per-route.
  Affects: framework choice, deploy target, build pipeline.

? Rendering strategy? (? for help)
  1. Single-page app (SPA)
     Client renders after initial load — good for dashboards.
  ...
```

### Confirm prompt (unchanged inquirer renderer + optional dim hint)

```
  Whether your app sends notifications when it's not open.
? Push notification support? (y/N)
```

### First select-question banner

The very first time the wizard reaches a `select` (which is `projectType` — methodology stays a `prompt`), a one-time discovery banner prints:

```
  Tip: Type ? at any choice prompt to see help.

? What type of project is this? (? for help)
  1. Web app
     Browser-rendered app served over HTTP.
  ...
```

The banner only renders when `output.supportsInteractivePrompts()` returns `true` — i.e., real TTY, not auto/json mode.

## Architecture

### Files added

```
src/wizard/copy/
  index.ts             — exports getCopyForType<T>(type: T): ProjectCopyMap[T] and coreCopy
  core.ts              — CoreCopy: methodology, depth, projectType, traits, adapters, advancedGameGate
  web-app.ts           — WebAppCopy
  backend.ts           — BackendCopy
  cli.ts               — CliCopy
  library.ts           — LibraryCopy
  mobile-app.ts        — MobileAppCopy
  data-pipeline.ts     — DataPipelineCopy
  ml.ts                — MlCopy
  browser-extension.ts — BrowserExtensionCopy
  game.ts              — GameCopy
```

### Type schema

```ts
// Extract the element type from arrays so multi-select enum fields
// (dataStore, targetPlatforms, uiSurfaces, distributionChannels, onlineServices)
// can be keyed on their literal union, not on the array itself.
type ValueToOptionKey<T> = T extends readonly (infer U)[] ? U : T

type OptionCopy = {
  /** Friendly display name shown in place of the raw enum value, e.g. "Single-page app (SPA)". */
  label: string
  /** One-line description shown indented under the label. */
  short?: string
}

type QuestionCopy<TValue = unknown> = {
  /** Optional dim hint shown above the prompt. Only set when option labels alone aren't enough. */
  short?: string
  /** Optional paragraph shown when the user types `?`. Only meaningful on `select`/`multiSelect`. */
  long?: string
  /**
   * Per-option copy. Statically forbidden when the question isn't enum-backed
   * (booleans, free-text strings, free-text string[]).
   */
  options?: Extract<ValueToOptionKey<TValue>, string> extends never
    ? never
    : string extends Extract<ValueToOptionKey<TValue>, string>
      ? never
      : Record<Extract<ValueToOptionKey<TValue>, string>, OptionCopy>
}

// Per-config-type copy — derived from the Zod-inferred config types so every
// enum field gets compile-time enforcement of matching option entries.
type WebAppCopy           = { [K in keyof WebAppConfig]:           QuestionCopy<WebAppConfig[K]> }
type BackendCopy          = { [K in keyof BackendConfig]:          QuestionCopy<BackendConfig[K]> }
type CliCopy              = { [K in keyof CliConfig]:              QuestionCopy<CliConfig[K]> }
type LibraryCopy          = { [K in keyof LibraryConfig]:          QuestionCopy<LibraryConfig[K]> }
type MobileAppCopy        = { [K in keyof MobileAppConfig]:        QuestionCopy<MobileAppConfig[K]> }
type DataPipelineCopy     = { [K in keyof DataPipelineConfig]:     QuestionCopy<DataPipelineConfig[K]> }
type MlCopy               = { [K in keyof MlConfig]:               QuestionCopy<MlConfig[K]> }
type BrowserExtensionCopy = { [K in keyof BrowserExtensionConfig]: QuestionCopy<BrowserExtensionConfig[K]> }
type GameCopy             = { [K in keyof GameConfig]:             QuestionCopy<GameConfig[K]> }

// Top-level wizard questions that aren't config-derived.
type WizardQuestionId =
  | 'methodology'
  | 'depth'
  | 'codexAdapter'
  | 'geminiAdapter'
  | 'webTrait'
  | 'mobileTrait'
  | 'projectType'
  | 'advancedGameGate'

// Individually typed — NOT Record<..., QuestionCopy<string>>
// because QuestionCopy<string> bans `options` (the bare-string clause).
// projectType needs QuestionCopy<ProjectType> to allow per-option copy.
type CoreCopy = {
  methodology: QuestionCopy<string>
  depth: QuestionCopy<string>
  codexAdapter: QuestionCopy<string>
  geminiAdapter: QuestionCopy<string>
  webTrait: QuestionCopy<string>
  mobileTrait: QuestionCopy<string>
  projectType: QuestionCopy<ProjectType>
  advancedGameGate: QuestionCopy<string>
}

// Indexed-access map preserves the per-key shape — getCopyForType('web-app')
// returns WebAppCopy, not the union of all 9 copy types.
interface ProjectCopyMap {
  'web-app':           WebAppCopy
  'backend':           BackendCopy
  'cli':               CliCopy
  'library':           LibraryCopy
  'mobile-app':        MobileAppCopy
  'data-pipeline':     DataPipelineCopy
  'ml':                MlCopy
  'browser-extension': BrowserExtensionCopy
  'game':              GameCopy
}

function getCopyForType<T extends ProjectType>(type: T): ProjectCopyMap[T]
```

### Type-system invariants verified against `src/config/schema.ts`

| Field | `WebAppConfig[K]` etc. | `ValueToOptionKey<T>` | `Extract<…, string>` | Resulting `options` shape |
|---|---|---|---|---|
| `WebAppConfig.renderingStrategy` | `'spa'\|'ssr'\|'ssg'\|'hybrid'` | same | same | `Record<'spa'\|'ssr'\|'ssg'\|'hybrid', OptionCopy>` |
| `BackendConfig.dataStore` | `('relational'\|'document'\|'key-value')[]` | `'relational'\|'document'\|'key-value'` | same | `Record<'relational'\|'document'\|'key-value', OptionCopy>` |
| `BrowserExtensionConfig.uiSurfaces` | `('popup'\|'options'\|...)[]` | union | union | `Record<union, OptionCopy>` |
| `LibraryConfig.hasTypeDefinitions` | `boolean` | `boolean` | `never` | **`never`** — `options` field forbidden |
| `GameConfig.supportedLocales` | `string[]` | `string` | `string` (and `string extends string`) | **`never`** — bare `string` banned |

The `string extends Extract<…>` clause is what bans `Record<string, OptionCopy>` for non-enum string arrays like `supportedLocales`. Without it, the writer could spuriously add option copy for an open-ended free-text field.

### `OutputContext` API extension

```ts
type SelectOption = string | {
  value: string
  label?: string
  short?: string
}

interface OutputContext {
  // Status / output methods unchanged.

  /**
   * Returns true only when this output supports live, interactive prompts:
   * the implementation is `InteractiveOutput`, stdin AND stdout are TTYs,
   * and `--auto` mode is off. Used by `questions.ts` to gate the
   * first-prompt banner without importing `InteractiveOutput` directly.
   */
  supportsInteractivePrompts(): boolean

  /** `help.short` prints as a dim line above the prompt when set. No `?` interception. */
  prompt<T>(message: string, defaultValue: T, help?: { short?: string }): Promise<T>
  confirm(message: string, defaultValue?: boolean, help?: { short?: string }): Promise<boolean>
  /** `multiInput` accepts only short help. No `long`, no `?` interception (would collide with free text). */
  multiInput(message: string, defaultValue?: string[], help?: { short?: string }): Promise<string[]>

  /**
   * `defaultValue` is always the value (not a label). Options can be plain strings
   * (interpreted as `{ value: o }`) or `{ value, label?, short? }` objects.
   */
  select(
    message: string,
    options: SelectOption[],
    defaultValue?: string,
    help?: { short?: string; long?: string },
  ): Promise<string>

  multiSelect(
    message: string,
    options: SelectOption[],
    defaults?: string[],
    help?: { short?: string; long?: string },
  ): Promise<string[]>
}
```

**Backward compatibility:** every existing call site in `src/wizard/questions.ts` passes `string[]` to `select`/`multiSelect`. `string[]` is assignable to `(string | { value, ... })[]`, so all 40+ existing calls keep compiling without changes. Call sites adopt the rich-option form one at a time.

**Caveat for mixed-form arrays** (M6): TypeScript widens `['spa', { value: 'ssr', label: 'SSR' }]` to `(string | { value: string; label: string })[]` and loses the literal narrowing on `'spa'`. If a call site wants narrow inferred types, every entry must be a full object. Documented in the JSDoc on `SelectOption`.

### Renderer behavior (`InteractiveOutput.select`/`multiSelect`)

```text
1. Assert options.length > 0 (throw — empty list is a programming bug).
2. Normalize: const normalized = options.map(o => typeof o === 'string' ? { value: o } : o)
3. Render frame:
   a. If help.short → print dim line.
   b. Print message line, with " (? for help)" suffix iff help.long is set.
   c. Print numbered list with hanging-indent: each option label on its
      own line, indented short description on the next line.
4. Read input via inquirer `input`.
5. Trim, then dispatch:
   - lone "?" + help.long set → print long help wrapped to terminal width;
     re-render frame from step 3; goto 4.
   - lone "?" + no help.long → print "No additional help available — pick
     one of: <values>"; goto 4 (do NOT re-render frame).
   - numeric in [1, normalized.length] → return normalized[n-1].value.
   - trimmed text matches normalized[i].value (exact, case-sensitive) → return.
   - else → print "Invalid input \"<trimmed>\". Pick a number, name, or ?
     for help."; goto 4 (do NOT re-render frame).
6. multiSelect differs only at step 5: lone "?" (whole input after trim)
   triggers help; everything else parses as comma-separated; same value-only
   matching; same re-prompt on invalid input.
```

Pager: not built. Long help is printed verbatim and the terminal scrolls. Copy-style guideline: keep `long` to ≤2 short paragraphs.

### `core.ts` and per-type copy file shape

```ts
// src/wizard/copy/core.ts
export const coreCopy: CoreCopy = {
  methodology: {
    short: 'How thoroughly the pipeline scaffolds your project.',
    long: 'Deep methodology runs every prompt for maximum coverage. MVP runs the minimum needed to ship a v1. Custom lets you set depth manually (1=shallow, 5=thorough).',
    // No `options` — methodology stays a `prompt`, not a `select`.
  },
  projectType: {
    short: 'Picks the question set and scaffolding template for the rest of init.',
    long: 'Each type unlocks a different set of follow-up questions tailored to that domain. Web apps ask about rendering and deploy targets; CLIs ask about distribution; ML projects ask about model phase and serving pattern.',
    options: {
      'web-app':           { label: 'Web app',           short: 'Browser-rendered app served over HTTP.' },
      'backend':           { label: 'Backend service',   short: 'API or service with no built-in UI.' },
      'cli':               { label: 'Command-line tool', short: 'Terminal program distributed as a binary or package.' },
      'library':           { label: 'Library / SDK',     short: 'Reusable code consumed by other projects.' },
      'mobile-app':        { label: 'Mobile app',        short: 'Native iOS, Android, or cross-platform app.' },
      'data-pipeline':     { label: 'Data pipeline',     short: 'Extract / transform / load workflow.' },
      'ml':                { label: 'Machine learning',  short: 'Training, inference, or both.' },
      'browser-extension': { label: 'Browser extension', short: 'Chrome / Firefox / Edge extension.' },
      'game':              { label: 'Game',              short: 'Interactive entertainment using a game engine.' },
    },
  },
  // ... rest of CoreCopy entries
}

// src/wizard/copy/web-app.ts
export const webAppCopy: WebAppCopy = {
  renderingStrategy: {
    long: 'Rendering strategy decides where your HTML comes from. Start with SPA for dashboards, SSR for SEO needs, SSG when content changes infrequently, or hybrid to mix per-route.',
    options: {
      spa:    { label: 'Single-page app (SPA)',    short: 'Client renders after initial load — good for dashboards.' },
      ssr:    { label: 'Server-side rendering',    short: 'Server renders each request — fresher data, fits SEO needs.' },
      ssg:    { label: 'Static generation',        short: 'Pre-rendered at build time — fastest, least dynamic.' },
      hybrid: { label: 'Hybrid',                   short: 'Mix of static and server-rendered routes.' },
    },
  },
  // ... deployTarget, realtime, authFlow
}
```

### Threading copy through `questions.ts`

Each call site gains a `help` argument and the option list shifts to rich form when there's friendly-label copy. Example:

```ts
// Before
const renderingStrategy: WebAppConfig['renderingStrategy'] = options.webAppFlags?.webRendering
  ?? await output.select(
    'Rendering strategy?', ['spa', 'ssr', 'ssg', 'hybrid'],
  ) as WebAppConfig['renderingStrategy']

// After
const renderingStrategy: WebAppConfig['renderingStrategy'] = options.webAppFlags?.webRendering
  ?? await output.select(
    'Rendering strategy?',
    optionsFromCopy(webAppCopy.renderingStrategy.options, ['spa', 'ssr', 'ssg', 'hybrid']),
    'spa',
    webAppCopy.renderingStrategy,
  ) as WebAppConfig['renderingStrategy']
```

Helper:

```ts
// src/wizard/copy/index.ts
export function optionsFromCopy<T extends string>(
  copy: Record<T, OptionCopy>,
  values: readonly T[],
): SelectOption[] {
  return values.map(v => ({ value: v, label: copy[v].label, short: copy[v].short }))
}
```

This keeps the copy file as the single source of truth for label + description while letting `questions.ts` retain control over which values are presented (e.g., backend `apiStyle` uses a subset of the schema's full enum in some branches).

## Adjacent fixes folded into the same PR

These are pre-existing bugs that the design surfaced. Fixing them in the same PR keeps the design honest — without them, helper text would amplify existing UX problems.

### A1. Drop NO_COLOR from prompt/confirm early returns (`interactive.ts:73-77`, `:91-95`)

**Today:**
```ts
if (!isTTY() || isNoColor()) { return defaultValue }
```

`NO_COLOR=1` is the [no-color.org](https://no-color.org/) standard for "strip ANSI styling." It is **not** "disable interactivity." Users running `NO_COLOR=1 scaffold init` today get every prompt silently default-answered and a corrupt project. This was always wrong.

**Fix:** drop `|| isNoColor()` from both early returns. NO_COLOR becomes color-only. The `green()`/`red()`/`yellow()` helpers in `interactive.ts:14-25` already handle color stripping correctly.

### A2. `isTTY()` checks both stdin and stdout (`interactive.ts:10`)

**Today:**
```ts
function isTTY(): boolean {
  return process.stdout.isTTY === true
}
```

`scaffold init < answers.txt` has `stdout.isTTY === true` (terminal is the destination) but `stdin.isTTY === undefined` (file is the source). Inquirer enters the read loop and crashes when stdin hits EOF.

**Fix:**
```ts
function isTTY(): boolean {
  return process.stdout.isTTY === true && process.stdin.isTTY === true
}
```

### A3. `select` re-prompts on invalid input instead of silently falling back (`interactive.ts:120-130`)

**Today:** invalid input prints `Invalid input "...", using default: X` and silently returns the default. The user gets their default whether they wanted it or not.

**Fix:** loop and re-prompt on invalid input (numeric out of range, text not in `value` set, `?` when no help). Same loop structure in `multiSelect`. **Scope: `InteractiveOutput` only.** `AutoOutput.select` and `JsonOutput.select` keep their existing default-returning behavior — that's the contract of non-interactive modes.

### A4. Trim before exact-text match (`interactive.ts:123`)

**Today:** uses raw `answer` (untrimmed), so typing `spa ` fails to match `'spa'` and falls back. Trivial one-line fix.

### A5. Catch `ExitPromptError` from inquirer at the wizard boundary (`init.ts` around the `runWizard` call)

**Today:** Ctrl-C at any prompt rejects the inquirer promise with `ExitPromptError`, which propagates uncaught and dumps a stack trace to the user.

**Fix:** wrap `runWizard()` in `init.ts`, catch `ExitPromptError`, print a friendly cancellation message, exit with the appropriate code. Half-written `.scaffold/` directory is left as-is for now (cleanup is a separate concern; document it in the spec follow-ups).

## Out of scope (intentionally)

| Decision | Why deferred |
|---|---|
| Reducing the question count (Superpowers Round 1 R1) | The deeper UX win, but a much larger effort. Helper text is necessary regardless. |
| Surfacing schema constraints in help text (e.g., "SSR can't deploy to static") | Real value but adds another layer of code generation. Defer. |
| Pager for long help | Pagers in CLI wizards trap users. Print and let the terminal scroll; keep `long` short. |
| Custom keystroke-listening confirm to support `?` | Lots of code to gain `?` on a binary prompt that doesn't need it. |
| `?` on free-text `prompt`/`multiInput` | `?` is a legitimate character in user input. Don't hijack. |
| Cleanup of half-written `.scaffold/` after Ctrl-C | Adjacent concern; separate PR. |
| i18n / locale support for copy | English-only. |
| Generic `select<T extends string>` for narrowed return types | Real benefit but every call site already uses `as ...` casts. Defer. |

## Test plan

### Unit tests — `src/cli/output/interactive.test.ts`

- **Normalization:** `select` accepts mixed `string[]` and `{ value, label, short }[]` and returns the same value.
- **Numeric input:** `select` returns the right value for `1`–`N`.
- **Text input:** `select` returns the right value for an exact `value` match.
- **Trim:** `spa ` matches `'spa'` (regression test for A4).
- **Re-prompt loop:** invalid input → error printed → re-prompt → valid input → return (regression test for A3). Use a stubbed `input` that returns a sequence.
- **`?` with `help.long`:** prints long help, re-renders frame, re-prompts, returns valid value.
- **`?` without `help.long`:** prints "no additional help" message, re-prompts (doesn't re-render frame).
- **Empty options:** `select` throws with a clear error.
- **multiSelect `?` parsing:** lone `?` triggers help; `1, ?, 3` is invalid input.
- **NO_COLOR:** `select`, `prompt`, `confirm` all run interactively when `NO_COLOR=1` and `stdout.isTTY` (regression test for A1).
- **Stdin TTY check:** `isTTY()` returns false when stdin is piped (regression test for A2).

### Unit tests — `src/wizard/copy/types.test-d.ts` (type-only)

- `WebAppCopy['renderingStrategy']['options']` requires keys `spa | ssr | ssg | hybrid`.
- `LibraryCopy['hasTypeDefinitions']['options']` is `never` (rejects any object literal).
- `GameCopy['supportedLocales']['options']` is `never` (rejects any object literal).
- `BackendCopy['dataStore']['options']` requires keys `relational | document | key-value`.
- `getCopyForType('web-app')` narrows to `WebAppCopy` (not the union).

### Integration tests — `src/wizard/wizard.test.ts`

- Existing tests pass without modification (since `methodology` stays a `prompt`).
- New test: `runWizard` in interactive mode prints the first-prompt banner once before the `projectType` `select`, never repeats.
- New test: `runWizard` in `--auto` mode does NOT print the banner.
- New test: `runWizard` in `--json` mode does NOT print the banner.
- New test: `init` catches `ExitPromptError` and exits cleanly (regression test for A5).

### Manual / smoke test

- Run `scaffold init` interactively in a real TTY. Walk through web-app → backend → game branches. Verify per-option descriptions render, `?` expands long help, friendly labels appear, no double-rendering, no silent fallbacks on invalid input.
- Run `NO_COLOR=1 scaffold init` interactively. Verify all questions are still asked (regression test for A1).
- Run `scaffold init < /dev/null` and verify it exits with a clear error rather than crashing on EOF (regression test for A2).
- Run `scaffold init --auto --project-type web-app --web-rendering ssr --web-deploy-target serverless --web-realtime none --web-auth-flow none`. Verify no helper text appears (auto mode has no prompts).

## Implementation order

1. **Pre-existing bug fixes (A1–A5)** in their own commit. Tests prove the fixes work; nothing else changes yet.
2. **`OutputContext` extension** (`SelectOption` type, optional `help?` params, `supportsInteractivePrompts()`). Implemented in all three classes (`InteractiveOutput`, `AutoOutput`, `JsonOutput`). Existing call sites still pass `string[]` and continue to work.
3. **`InteractiveOutput.select`/`multiSelect` rewrite** for normalization, hanging-indent rendering, `?` handling, banner support. Tests for the renderer.
4. **`src/wizard/copy/` tree** added with empty objects scaffolded against the type schema. TypeScript flags every missing entry; fill them in.
5. **Thread copy through `src/wizard/questions.ts`** one project type at a time. Each step is reviewable independently.
6. **`runWizard` banner** added in `src/wizard/wizard.ts` immediately before the `projectType` prompt.
7. **Final integration tests + manual smoke test.**

## Open follow-ups (not blocking this PR)

- Reduce the wizard's question count by collapsing inferable answers (Superpowers Round 1 R1).
- Surface Zod-encoded constraints in help text (e.g., "SSR can't deploy to static").
- Cleanup of half-written `.scaffold/` after Ctrl-C.
- i18n support if/when scaffold goes multi-locale.

## Provenance

Brainstormed across 4 turns with the user, then reviewed in 3 rounds with three independent reviewers (Superpowers code-reviewer subagent, Codex CLI, Gemini CLI).

- **Round 1** found that the original design over-engineered confirm (proposed rewriting it to support `?`) and over-claimed `?` semantics (proposed intercepting `?` on free-text prompts where it's a legitimate character).
- **Round 2** found that the rich-option API needed an explicit normalization step in the renderer, the mapped type was incomplete for array-valued enums (`dataStore`, `targetPlatforms`, etc.), the import map needed indexed access to preserve per-key shape, and the API contradicted itself for `prompt`/`confirm`/`multiInput` (claimed signatures unchanged but said callers could pass a `help` arg).
- **Round 3** found that the proposed NO_COLOR consistency fix was the wrong direction — it would have extended a preexisting bug (NO_COLOR silently disabling interactivity) instead of fixing it. Round 3 also found that converting `methodology` to a `select` would thrash three existing tests in `wizard.test.ts` for marginal value, when simply moving the discoverability banner to the first actual `select` (`projectType`) achieved the same goal with no test churn.

Each round narrowed the design until the convergent set was small. This document reflects the post-Round-3 architecture.
