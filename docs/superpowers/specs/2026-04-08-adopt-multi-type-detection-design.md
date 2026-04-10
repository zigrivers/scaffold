# Multi-Type Project Detection in `scaffold adopt` — Design Spec

**Date:** 2026-04-08
**Target version:** v3.10.0
**Status:** Approved (13 review rounds across sections + 2 consolidated spec-doc rounds, ~195 findings, ~192 accepted, 3 explicitly rejected)
**Supersedes:** Inline game-only detection in `src/project/adopt.ts:73-93`
**Related:** ADR-025 (CLI output contract — to be amended), ADR-028 (detection priority — to be extended), ADR-033 (forward compatibility), ADR-040 (error handling philosophy), ADR-055 (backward compatibility contract), R1-R3 overlay specs

## Goal

Extend `scaffold adopt` to detect all 9 project types from R1-R3 overlay support (not just game) and populate matching typed configs. Detection is file-based, fast, never silently guesses on ambiguity, and preserves existing user content on re-adoption.

## Architecture summary

Detection is factored from `runAdoption()` into a new module tree at `src/project/detectors/`, organized as nine pure per-type detector functions sharing a `SignalContext` interface for shared file/manifest reads. Each detector returns a discriminated-union `DetectionMatch` keyed on `projectType`, with confidence tier (`high`/`medium`/`low`) and an evidence trail. When multiple detectors match at the same tier, an interactive disambiguation prompt asks the user to pick. Under `--auto`, ambiguity exits with new `ExitCode.Ambiguous = 6`.

Game detection is rewritten to use the same `SignalContext` API (behavior preserved by a precedence regression test added before relocation). The overall feature ships across **14 commit operations** numbered 1, 2, 3, 4a, 4b, 5-13 (Commit 4 is split into 4a + 4b for reviewability — see Section 6) in two PRs: **PR 1 covers the detection foundation (commits 1 through 7)**, **PR 2 covers orchestration + handler + docs + tests (commits 8 through 13)**.

---

# Section 1 — Architecture Overview

## Module layout

```
src/project/
  detectors/
    index.ts              # ALL_DETECTORS (ordered for perf), runDetectors(ctx, detectors?)
    context.ts            # SignalContext interface + FsSignalContext + createFakeSignalContext
    types.ts              # DetectionMatch (discriminated union), Confidence, DetectionEvidence, evidence() helper, assertNever
    file-text-match.ts    # stripJsTsComments, matchesConfigExport — for JS/TS config detection
    required-fields.ts    # getRequiredFieldsWithoutDefaults — Zod schema introspection
    disambiguate.ts       # disambiguate(matches, opts) — interactive radio prompt + non-TTY fallback
    resolve-detection.ts  # resolveDetection — Case A-G decision table
    web-app.ts            # detectWebApp(ctx) → DetectionMatch | null
    backend.ts
    cli.ts
    library.ts
    mobile-app.ts
    data-pipeline.ts
    ml.ts
    browser-extension.ts
    game.ts               # rewritten to use SignalContext (no behavior change)
  adopt.ts                # async runAdoption: orchestrates detection + merge + write
```

**Why per-type modules:** each file is independently testable, trivially extendable, and matches the codebase's one-responsibility pattern. Adding a 10th project type = add one file. The discriminated-union `DetectionMatch` makes orchestrator routing exhaustive at compile time.

**Why a shared `SignalContext`:** avoids parsing `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` once per detector. Context lazy-loads and caches manifest reads, runs `fs.readdirSync` once per directory, and exposes helpers like `ctx.hasDep('next')`, `ctx.hasFile('app.json')`, `ctx.dirExists('ios')`. Detectors stay pure (input: context; output: match or null).

## Synchronous detection, async orchestration

All detectors are sync functions. `runDetectors(ctx)` iterates them sequentially. Total budget <50ms on any real project root (~10 `fs.statSync` calls + one `readdirSync` + a few small JSON/TOML parses).

`runAdoption()` itself is **async** because the disambiguation prompt is async. Detectors are sync; the async surface is at the orchestrator + interactive prompt boundary only.

## Game detector relocation

The current inline Unity/Unreal/Godot detection in `adopt.ts:73-93` moves to `src/project/detectors/game.ts` and is rewritten to use the `SignalContext` API. **Before** the relocation, a regression test pinning the Unity > Unreal > Godot precedence is added (Commit 3 of the implementation plan) so the rewrite is verifiable.

## Detection registration

`detectors/index.ts` exports a hand-maintained `ALL_DETECTORS` array with explicit registration. The order is performance-optimized (specific signature detectors first, catch-all library last) but **does not affect correctness** — all matches are collected and disambiguation handles the result regardless of detection order. A module header comment makes this explicit.

```ts
// Order is a perf optimization; correctness does not depend on it.
// Specific-signature detectors first (cheap distinctive failures);
// dep-heavy detectors middle; catch-all library last.
export const ALL_DETECTORS: readonly Detector[] = [
  detectGame, detectBrowserExtension, detectMobileApp, detectDataPipeline,
  detectWebApp, detectBackend, detectMl, detectCli,
  detectLibrary,
]
```

---

# Section 2 — Core Detection Data Model

## Dependencies

Add two new runtime dependencies:

- **`yaml: ^2.8.3`** — AST-capable YAML parser for `parseDocument` API. Required for comment-preserving config writes (Section 4).
- **`smol-toml: ^1.6.1`** — TOML 1.0 parser. Required for `pyproject.toml` (including Poetry's `[tool.poetry.dependencies]`) and `Cargo.toml` parsing. ~25 KB, zero deps, native TS types, BSD-3-Clause, actively maintained.

Both dependencies are minimal and well-scoped. Hand-rolled alternatives were rejected: YAML AST mutation requires non-trivial parser support; TOML 1.0 has enough edge cases (inline tables, multi-line arrays, `[[bin]]` array-of-tables, Poetry's table-form deps) that a 50-line reader would silently produce wrong answers.

## Manifest type definitions

```ts
import type { ScaffoldWarning } from '../../types/index.js'

export type ManifestKind = 'npm' | 'py' | 'cargo' | 'go'
export type ManifestStatus = 'missing' | 'parsed' | 'unparseable'
export type NpmDepScope = 'deps' | 'dev' | 'peer' | 'optional'
export type DepScope = NpmDepScope | 'all'

export interface PackageJson {
  readonly name?: string
  readonly version?: string
  readonly main?: string
  readonly module?: string
  readonly exports?: unknown
  readonly bin?: string | Readonly<Record<string, string>>
  readonly type?: 'module' | 'commonjs'
  readonly engines?: Readonly<Record<string, string>>
  readonly scripts?: Readonly<Record<string, string>>
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
  readonly workspaces?: readonly string[] | { readonly packages?: readonly string[] }
}

export interface PyprojectToml {
  readonly project?: {
    readonly name?: string
    readonly dependencies?: readonly string[]                          // PEP 621
    readonly 'optional-dependencies'?: Readonly<Record<string, readonly string[]>>
    readonly scripts?: Readonly<Record<string, string>>
  }
  readonly tool?: {
    // Poetry (PEP 621 alternative — large portion of Python ecosystem)
    readonly poetry?: {
      readonly dependencies?: Readonly<Record<string, unknown>>
      readonly 'dev-dependencies'?: Readonly<Record<string, unknown>>
      readonly group?: Readonly<Record<string, {
        readonly dependencies?: Readonly<Record<string, unknown>>
      }>>
    }
    readonly [k: string]: unknown
  }
  readonly 'build-system'?: { readonly requires?: readonly string[] }
}

export interface CargoToml {
  readonly package?: { readonly name?: string; readonly version?: string }
  readonly dependencies?: Readonly<Record<string, unknown>>
  readonly 'dev-dependencies'?: Readonly<Record<string, unknown>>
  readonly lib?: Readonly<Record<string, unknown>>
  readonly bin?: readonly { readonly name: string; readonly path?: string }[]
}

export interface GoMod {
  readonly module?: string
  readonly goVersion?: string
  readonly requires?: readonly GoModRequire[]
}
export interface GoModRequire {
  readonly path: string
  readonly version: string
  readonly indirect: boolean
}
```

All fields are `readonly` and optional. The `readonly` modifier prevents detectors from mutating the shared cache.

## Runtime validation via Zod safeParse

Each manifest kind has a minimal Zod schema (in `context.ts`) with `.passthrough()` for unknown fields. After parsing JSON/TOML, the result is run through `safeParse` to guard against runtime `TypeError` from malformed manifests (e.g., `dependencies: []` instead of an object).

On `safeParse` failure: cache `undefined`, set `manifestStatus` to `'unparseable'`, push a single `ADOPT_MANIFEST_UNPARSEABLE` warning to the context.

## `SignalContext` interface

```ts
export interface SignalContext {
  readonly projectRoot: string
  readonly warnings: readonly ScaffoldWarning[]   // read-only view; no external mutation

  // Filesystem (cached per path)
  hasFile(relPath: string): boolean
  dirExists(relPath: string): boolean
  rootEntries(): readonly string[]
  readFileText(relPath: string, maxBytes?: number): string | undefined

  // Manifests
  manifestStatus(kind: ManifestKind): ManifestStatus
  packageJson(): PackageJson | undefined
  pyprojectToml(): PyprojectToml | undefined
  cargoToml(): CargoToml | undefined
  goMod(): GoMod | undefined

  // Dependency lookup
  hasDep(name: string, where?: ManifestKind | ManifestKind[], scope?: DepScope): boolean
  hasAnyDep(names: readonly string[], where?: ManifestKind | ManifestKind[], scope?: DepScope): boolean
}
```

### Symlink semantics (orthogonal split)

- **`rootEntries()`** — returns `fs.readdirSync(projectRoot, { withFileTypes: true })`. Each entry reports its raw name; **symlinks are NOT followed** for listing. A symlinked file or directory appears as its link name. This preserves predictable listing behavior (no symlink loops, no path escaping).

- **`dirExists(relPath)`** / **`hasFile(relPath)`** / **`readFileText(relPath)`** — use `fs.statSync(resolvedPath, { throwIfNoEntry: false })` and `fs.readFileSync`, which **DO follow symlinks** by default. `dirExists('ios')` returns `true` if `projectRoot/ios` resolves to a directory, whether through a real directory or a symlink chain. This enables monorepo detection where `ios/`/`android/` are symlinked from shared packages.

The split is intentional: listing should be predictable and loop-free; probing should resolve to the target's actual type. Symlink loops are caught by `fs` itself (`ELOOP`) and converted to an `ADOPT_FS_INACCESSIBLE` warning.

### `rootEntries()` semantics

Depth-1 only, **includes dotfiles** (`.nvmrc`, `.eslintrc`, `.dockerignore` are valuable signals), returns sorted names only (not full paths), cached for the lifetime of the context.

### `readFileText(relPath, maxBytes = 262144)`

Bounded read with default 256 KB cap. Real-world `next.config.*`, `vite.config.*`, `Dockerfile`, `manifest.json` are usually well under this; long-tail cases (multi-stage Dockerfiles, plugin-heavy bundler configs) are still covered.

**On overflow:** returns the truncated content (first `maxBytes` bytes) and emits a single `ADOPT_FILE_TRUNCATED` warning per path. Detectors that key off file headers (the common case) keep working; detectors that need a tail-anchored regex pass an explicit larger `maxBytes`.

**On error:** returns `undefined` and emits a single `ADOPT_FILE_UNREADABLE` warning per path. Detection continues — the context never throws.

### `hasDep` semantics

**Default scope:** searches every parsed manifest kind, all four npm dep buckets (`deps + dev + peer + optional`). Library detection needs `peerDependencies` to count; this removes that footgun.

**Python normalization (PEP 503 + PEP 508):**
1. Query name lowercased and `[-_.]+` → `-` (PEP 503).
2. PEP 621 `project.dependencies` strings parsed: strip URL fragments after `@`, environment markers after `;`, extras in `[brackets]`, version specifiers (`==|>=|~=|>|<|!=|===|~|^`), then PEP 503 normalize.
3. Poetry `[tool.poetry.dependencies]` keys are bare names — apply PEP 503 directly. Table form (`torch = { version = "^2", source = "pytorch" }`) is accepted as a "present" signal. Dev groups at `[tool.poetry.group.*.dependencies]` are included when `scope` includes `'dev'`. Poetry's `python` key is excluded (it's the interpreter version, not a dep).

**Go (`go.mod`):** indirect deps are filtered out by default. Pass `includeIndirect: true` (via the optional helper API) to include them.

## `FsSignalContext` — safe construction

`createSignalContext(projectRoot: string): SignalContext` performs exactly one eager batch on construction:
1. `fs.readdirSync(projectRoot, { withFileTypes: true })` → cached as `rootEntries`
2. `fs.statSync` probe for the eager-stat manifest list: `package.json, pyproject.toml, Cargo.toml, go.mod, app.json, project.godot, manifest.json`

Everything else is lazy. Manifest parsing is deferred to first `packageJson()`/`pyprojectToml()`/etc. call. Constructor and all methods wrap fs operations in try/catch — `EACCES`/`ELOOP`/`ENOTDIR`/`ENAMETOOLONG` route to a single `ADOPT_FS_INACCESSIBLE` warning per path. **The context never throws.**

## `go.mod` parser

In-tree, ~40 lines, line-based. Handles:
- `module foo` directive
- `go 1.21` version directive
- Single-line `require foo v1.0.0` directives
- Multi-line `require ( ... )` blocks
- `// indirect` suffix on require lines → stored on `GoModRequire.indirect`
- `replace` and `exclude` directives → parsed and discarded (not currently needed; comment in `context.ts` flags this as easy promotion)
- Line comments (`//`) and trailing comments stripped before parsing

`hasDep` over Go manifests filters out indirect deps by default (indirect deps are noise — a repo with `github.com/spf13/pflag` as an indirect dep isn't a CLI).

## `DetectionMatch` — discriminated union

```ts
export type Confidence = 'high' | 'medium' | 'low'

export interface DetectionEvidence {
  readonly signal: string          // short machine-readable key, e.g. 'next-config', 'socket-io-dep'
  readonly file?: string           // relative path when applicable
  readonly note?: string           // optional human-readable hint for disambiguation prompt
}

interface BaseMatch {
  readonly confidence: Confidence
  readonly evidence: readonly DetectionEvidence[]
}

export interface WebAppMatch extends BaseMatch {
  readonly projectType: 'web-app'
  readonly partialConfig: Partial<z.infer<typeof WebAppConfigSchema>>
}
export interface BackendMatch extends BaseMatch {
  readonly projectType: 'backend'
  readonly partialConfig: Partial<z.infer<typeof BackendConfigSchema>>
}
// ... 7 more interfaces, one per project type ...

export type DetectionMatch =
  | WebAppMatch | BackendMatch | CliMatch | LibraryMatch | MobileAppMatch
  | DataPipelineMatch | MlMatch | BrowserExtensionMatch | GameMatch

export type Detector = (ctx: SignalContext) => DetectionMatch | null

// Exhaustiveness helper for switch routing
export function assertNever(value: never): never {
  throw new Error(`Unhandled detection match variant: ${JSON.stringify(value)}`)
}

// Ergonomic evidence builder
export function evidence(signal: string, file?: string, note?: string): DetectionEvidence {
  return { signal, file, note }
}
```

The discriminated union gives the orchestrator exhaustive type-safe routing. Each detector's `partialConfig` is statically narrowed to the correct schema's `Partial<>`. The orchestrator's switch ends with `default: return assertNever(match)`, making the addition of a 10th project type fail to compile until routing is added.

## Confidence rubric (per-detector)

Each detector encodes its own confidence logic following the common rubric:
- **`high`** — at least one defining artifact + corroborating evidence, OR an unambiguous single-file signature
- **`medium`** — one defining signal with plausible cross-type overlap, OR multiple weak signals pointing at one type
- **`low`** — only weak/circumstantial signals; gets filtered unless it's the only tier present (Case F) or `--force` is passed

Per-detector rules are documented inline in each detector file (Section 5). No shared scoring function — discriminating signals differ too much across types.

## Test fake

```ts
export function createFakeSignalContext(options: {
  projectRoot?: string
  rootEntries?: readonly string[]
  files?: Readonly<Record<string, string>>           // relPath → contents for readFileText
  dirs?: readonly string[]
  packageJson?: PackageJson | 'unparseable' | 'missing'
  pyprojectToml?: PyprojectToml | 'unparseable' | 'missing'
  cargoToml?: CargoToml | 'unparseable' | 'missing'
  goMod?: GoMod | 'unparseable' | 'missing'
  manifestStatuses?: Partial<Record<ManifestKind, ManifestStatus>>
}): SignalContext
```

Detector unit tests construct a fake with 3-5 literal options, zero filesystem, zero mocks. Exported as part of the public testing surface.

---

# Section 3 — Disambiguation, `--force` Semantics, and Re-Adoption

## `disambiguate()` — full UX

Lives in `src/project/detectors/disambiguate.ts`:

```ts
import { select } from '@inquirer/prompts'

export interface DisambiguateOptions {
  readonly interactive: boolean             // false under --auto OR non-TTY OR CI env
  readonly acceptLowConfidence: boolean     // true when --force allows low-tier into picker
}

export interface DisambiguateResult {
  readonly chosen: DetectionMatch | null
  readonly skipReason?: 'auto' | 'user-skipped' | 'user-cancelled' | 'no-eligible-matches'
  readonly nonTtyFallback?: boolean   // true when interactive was requested but env forced auto
}

// skipReason values:
//   'auto'              — opts.interactive was false (--auto explicitly OR non-TTY/CI auto-fallback)
//   'user-skipped'      — user picked "None of these" in the interactive prompt
//   'user-cancelled'    — user Ctrl-C'd the prompt (ExitPromptError)
//   'no-eligible-matches' — disambiguate() called with empty/all-filtered matches

export async function disambiguate(
  matches: readonly DetectionMatch[],
  opts: DisambiguateOptions,
): Promise<DisambiguateResult>
```

### Non-TTY + CI detection

Before invoking the prompt, `disambiguate()` checks:

```ts
const isCi = process.env.CI === 'true' || process.env.CI === '1'
const isTty = process.stdin.isTTY === true && process.stdout.isTTY === true
const interactive = opts.interactive && isTty && !isCi

if (!interactive) {
  return {
    chosen: null,
    skipReason: 'auto',
    nonTtyFallback: opts.interactive,    // true means user wanted interactive but env didn't allow it
  }
}
```

`scaffold adopt` is safe to run from CI runners, piped contexts, and `nohup` without requiring `--auto`.

**Warning emission:** when `disambiguate` returns with `nonTtyFallback === true` (i.e., the user wanted interactive but the environment forced auto behavior), the orchestrator emits `ADOPT_NON_TTY` warning before processing the result. When the user explicitly passed `--auto`, no `ADOPT_NON_TTY` fires (it was their explicit choice). The `ADOPT_AMBIGUOUS` error still fires upstream if multiple matches exist regardless of how non-interactive mode was reached.

### Eligibility filtering

Always include `'high'` and `'medium'` matches. Include `'low'` matches only when `opts.acceptLowConfidence === true` OR when `'low'` is the only tier present (Case F).

### Sort order

1. Tier descending (`high` > `medium` > `low`)
2. Within tier, by `evidence.length` descending
3. Within tier+count, by **preference order** (web-app, backend, cli, library, mobile-app, data-pipeline, ml, browser-extension, game) — based on real-world prevalence

### Prompt format

Header text by case:
- Case C/E (≥2 same-tier non-low matches): *"We detected multiple plausible project types:"*
- Case F (only low matches): *"We found weak signals for these project types but couldn't be confident:"*

Per-row format renders via `@inquirer/prompts.select`:

```
? Which best describes this project? (Use arrow keys)
❯ web-app    [high]    next-config (next.config.mjs), app-router-dir (app/page.tsx), public-dir (public/), react-dep
  backend    [high]    routes-dir (app/api), prisma-schema (prisma/schema.prisma), pg-dep
  library    [medium]  pkg-main-field (package.json), pkg-types-field (package.json), peer-deps (react)
  None of these — continue without a project type
```

Evidence rendered as `signal (file)` if file present, else just `signal`. Optional `note` shown indented on a `↳ <note>` row. Evidence list truncated to first 5 entries with `… (+N more)` if longer. Default selection is the first option (highest tier, most evidence) — Enter to accept.

The `❯` cursor character matches `@inquirer/prompts` actual rendering. The "None of these" option is always present.

### `ExitPromptError` handling

```ts
try {
  const choice = await select({ message: header, choices, default: choices[0].value })
  // The "None of these" option has chosen === null
  if (choice === null) {
    return { chosen: null, skipReason: 'user-skipped' }
  }
  return { chosen: choice }
} catch (err) {
  if ((err as Error)?.name === 'ExitPromptError') {
    return { chosen: null, skipReason: 'user-cancelled' }
  }
  throw err
}
```

The orchestrator emits `ADOPT_USER_CANCELLED` warning when `skipReason === 'user-cancelled'` and exits with `ExitCode.UserCancellation = 4` (existing convention). The lock is released by the handler's `finally` block.

The string-based `name === 'ExitPromptError'` check (instead of `instanceof`) is more resilient to dual-package CJS/ESM mismatches in `@inquirer/prompts`.

## Decision table (Cases A-G)

**Precedence:** Case G (explicit `--project-type X`) has the **highest precedence** — when `explicitProjectType` is set, Cases A-F are not evaluated. Case G short-circuits the decision table regardless of what detection found. Cases A-F apply only when the user did NOT pass `--project-type`.

```
matches = runDetectors(ctx)
highTier   = matches where confidence === 'high'
mediumTier = matches where confidence === 'medium'
lowTier    = matches where confidence === 'low'

Case A: matches.empty
  → no projectType written; info message; continue adoption

Case B: highTier.length === 1
  → commit highTier[0]
  → if mediumTier or lowTier non-empty, emit ADOPT_SECONDARY_MATCHES warning

Case C: highTier.length >= 2
  → ambiguous → disambiguate(highTier, mediumTier?, lowTier?)
  → under --auto/non-TTY/CI → exit ADOPT_AMBIGUOUS (code 6)

Case D: highTier.empty AND mediumTier.length === 1
  → commit mediumTier[0]
  → if lowTier non-empty, emit ADOPT_SECONDARY_MATCHES warning

Case E: highTier.empty AND mediumTier.length >= 2
  → ambiguous → disambiguate(mediumTier, lowTier?)
  → under --auto/non-TTY/CI → exit ADOPT_AMBIGUOUS (code 6)

Case F: only lowTier (high and medium both empty)
  → interactive: disambiguate(lowTier) with "weak signals" header
  → --auto/non-TTY/CI: no projectType committed; ADOPT_LOW_ONLY warning

Case G: explicitProjectType set (--project-type X) regardless of detection
  → skip disambiguation
  → synthesize empty DetectionMatch for type X (partialConfig: {})
  → proceed through merge pipeline normally
  → if Zod.parse fails (missing anchor field): emit ADOPT_MISSING_REQUIRED_FIELDS
    error listing the required fields with `--<type>-<field>` flag hints
    (this is the same error code that catches post-merge schema failures
    in any code path; one code, two failure surfaces)
```

## `--force` and `--project-type` flag matrix

Three orthogonal axes:
- `--project-type X` controls **whether detection runs at all**
- `--force` controls **two things**: low-tier eligibility for the picker AND overwriting existing `projectType`
- `--auto` controls **whether prompts can run**

| `--project-type` | `--force` | `--auto` | Behavior |
|---|---|---|---|
| absent | absent | absent | Detection runs; ambiguity → interactive prompt |
| absent | absent | yes | Detection runs; ambiguity → ADOPT_AMBIGUOUS error; only-low → ADOPT_LOW_ONLY warning |
| absent | yes | absent | Detection runs; low matches in picker; interactive prompt |
| absent | yes | yes | Detection runs; low eligible; ambiguity → ADOPT_AMBIGUOUS |
| `X` | absent | absent | Skip detection; commit X with empty config; error if existing differs |
| `X` | yes | absent | Skip detection; commit X (overwriting any existing) |
| `X` | absent | yes | Same as `X`+no-force |
| `X` | yes | yes | CI escape hatch: skip detection, force-commit, no interaction |

**Init flag composition:** when `scaffold adopt` is invoked with init flags (e.g., `--web-rendering ssr`) without `--project-type`, the orchestrator runs detection then **overrides** any field the user explicitly passed. If detection picked `backend`, `--web-rendering` becomes `INIT_FLAG_TYPE_MISMATCH` error. The strict-error behavior matches `scaffold init` for consistency.

## Re-adoption rules

```
existingProjectType    = config.project?.projectType in .scaffold/config.yml
existingTypedConfig    = config.project?.<typeName>Config in .scaffold/config.yml

if existingProjectType is set:
  if --force absent AND --project-type absent:
    → SKIP detection; emit info "Project already adopted as <type>; pass --force to re-detect"
    → Artifact scanning + step status updates STILL run

  if --force present AND --project-type absent:
    → Run detection
    → If detection picks a type:
        → If detection.projectType === existingProjectType:
            → If existingTypedConfig is undefined: assign whole detected partialConfig
            → Else: MERGE detected fields into UNSET fields of existing (additive)
            → For any field where existing != detected, emit ADOPT_FIELD_CONFLICT warning
            → Emit info "Detection refined existing config (set N new fields)"
        → If detection.projectType !== existingProjectType:
            → ADOPT_TYPE_CHANGED warning
            → REPLACE projectType + typed config wholesale
    → If detection picks nothing:
        → Leave existing untouched
        → ADOPT_DETECTION_INCONCLUSIVE warning

  if --project-type X present (with or without --force):
    → Skip detection
    → If X !== existingProjectType:
        → If --force present: replace
        → If --force absent: ADOPT_TYPE_CONFLICT error (exit 6)
    → If X === existingProjectType:
        → No-op for projectType field
        → If init flags also passed: override specified fields, preserve unspecified
        → Continue with artifact scanning + state updates

if existingProjectType is NOT set:
  → Run detection normally (Cases A-G)
```

**Why merge instead of replace on `--force` same-type:** users running `--force` after detection support is improved expect new fields to fill in, not for hand-tuned values to be overwritten. The merge is conservative — only fills fields that are currently unset. v3.10 is **additive-only** — there is no path to *unset* a previously detected field via re-adoption. A future `--reset-detected` flag is tracked as future work.

**Why error on `--project-type` mismatch without `--force`:** silently changing a project's type from `web-app` to `backend` could leave overlay knowledge inconsistent with the rest of the user's setup. Forcing the user to acknowledge with `--force` is the safer default.

## Pre-parse YAML merge invariant

The merge operates on **raw YAML**, not on Zod-parsed configs. Otherwise Zod defaults make every field appear "set" and merge becomes a no-op.

```ts
const doc = parseDocument(fs.readFileSync(configPath, 'utf8'))   // yaml package, AST-preserving
const existingRaw = doc.getIn(['project', `${typeKey}Config`])   // raw YAML object, NOT Zod-parsed
const detectedPartial = match.partialConfig                       // already Partial<>, no defaults
const merged = mergeRawConfig(detectedPartial, existingRaw)       // shallow, existing wins on overlap
const flagged = applyFlagOverrides(merged, flagOverrides)         // flag > existing > detected > default
const finalConfig = SchemaForType.parse(flagged)                  // Zod runs ONCE, applies defaults
// ... AST-mutate doc in place with finalConfig, write back via doc.toString() ...
```

The single-Zod-parse invariant is what makes the merge rules deterministic and the field-conflict warnings correct.

**Merge policy (v3.10):** shallow top-level merge of typed config objects. Existing scalar/enum/array fields always win. Arrays are treated as opaque values: if existing has `dataStore: ['relational']` and detected has `dataStore: ['relational','redis']`, the existing value wins entirely. The 9 typed configs in v3.10 use only primitives, enums, and arrays of strings — no nested objects — so shallow merge is sufficient. When the first nested-object typed config is added, the merge helper becomes recursive (tracked as future work).

## `mergeRawConfig` and `applyFlagOverrides`

Both helpers in `src/project/adopt.ts`, generic over the partial type (no per-type logic):

```ts
function mergeRawConfig<T>(detected: Partial<T>, existing: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...detected, ...(existing ?? {}) }    // shallow; existing wins
}

function applyFlagOverrides<T>(base: Record<string, unknown>, overrides: Partial<T> | undefined): Record<string, unknown> {
  if (!overrides) return base
  return { ...base, ...overrides }                // explicit user flags win over both detected and existing
}
```

**Final precedence (highest wins):** explicit CLI flag > existing `config.yml` value > detected value > Zod default.

## Detection drift warning

When `mergeRawConfig` finds a field where `detected[field] !== undefined && existing[field] !== undefined && detected[field] !== existing[field]`, the existing value wins per precedence — and the orchestrator emits one `ADOPT_FIELD_CONFLICT` warning per drifted field:

```
ADOPT_FIELD_CONFLICT: webAppConfig.renderingStrategy — existing: 'ssr', detected: 'spa'
  (kept existing; pass --project-type web-app --web-rendering spa --force to override)
```

The warning fires only on `--force` re-adoption (when the user explicitly asked detection to re-run). On initial adoption there is no existing value, so no drift is possible.

In `--verbose` mode, additional debug logs trace every discarded detection field (including non-conflicts), helping users debug "why didn't my detection work?" without polluting the default-mode warning stream.

## Error and warning shapes

New errors (exit 6 = `ExitCode.Ambiguous`, exit 1 = `ExitCode.ValidationError`):

| Code | Exit | Meaning |
|---|---|---|
| `ADOPT_AMBIGUOUS` | 6 | Detection found multiple equally-plausible matches under --auto |
| `ADOPT_TYPE_CONFLICT` | 6 | --project-type X conflicts with existing projectType, no --force |
| `ADOPT_MISSING_REQUIRED_FIELDS` | 1 | Zod schema rejected merged config (lists missing required fields with `--<type>-<field>` flag hints). Covers Case G when `--project-type X` was passed without the required init flags. |
| `ADOPT_CONFIG_WRITE_FAILED` | 1 | Filesystem write failed |
| `ADOPT_INTERNAL` | 1 | Unexpected exception in runAdoption (asScaffoldError fallback) |

New warnings (always exit 0):

| Code | Meaning |
|---|---|
| `ADOPT_MANIFEST_UNPARSEABLE` | Manifest exists but failed JSON/TOML/Zod parse |
| `ADOPT_FS_INACCESSIBLE` | Filesystem op hit EACCES/ELOOP/ENOTDIR/ENAMETOOLONG |
| `ADOPT_FILE_UNREADABLE` | A specific file requested via readFileText could not be read |
| `ADOPT_FILE_TRUNCATED` | A file exceeded maxBytes and was truncated |
| `ADOPT_SECONDARY_MATCHES` | Detection committed to a winner but other matches exist |
| `ADOPT_LOW_ONLY` | Only low-confidence matches under --auto; no commit |
| `ADOPT_TYPE_CHANGED` | Re-adoption with --force found different type than existing |
| `ADOPT_DETECTION_INCONCLUSIVE` | --force re-run found nothing actionable |
| `ADOPT_FIELD_CONFLICT` | Re-adoption found field where existing != detected; existing wins |
| `ADOPT_USER_CANCELLED` | User Ctrl-C'd the disambiguation prompt |
| `ADOPT_NON_TTY` | No TTY detected; disambiguation skipped |
| `ADOPT_GAME_CONFIG_DEPRECATED` | gameConfig field populated; use detectedConfig (one per invocation) |
| `ADOPT_PUBLIC_LIBRARY_NO_README` | Library detected as public but no README.md found |
| `ADOPT_MINIMAL_EXTENSION` | Browser extension has manifest_version but no UI/scripts/worker |
| `ADOPT_STATE_WRITE_FAILED` | state.json write failed after successful config write (recoverable) |

`ADOPT_AMBIGUOUS` example message includes the actionable recovery command:

```
Detection found multiple plausible project types:
  • web-app    (high)    next.config.mjs, app/page.tsx, react dep
  • backend    (high)    app/api/route.ts, prisma schema, postgres dep

Re-run with --project-type <type> to choose, e.g.:
  scaffold adopt --auto --project-type web-app
```

---

# Section 4 — `AdoptionResult` Extension and CLI Handler

## `AdoptionResult` extended

```ts
export interface AdoptionResult {
  // ... existing fields (mode, artifactsFound, detectedArtifacts, stepsCompleted,
  //     stepsRemaining, methodology, errors, warnings) ...

  projectType?: ProjectType
  detectedConfig?: DetectedConfig                        // NEW canonical field
  detectionEvidence?: readonly DetectionEvidence[]       // NEW
  detectionConfidence?: Confidence                       // NEW

  /** @deprecated Use detectedConfig (when type === 'game'). Removed in v4.0. */
  gameConfig?: Partial<GameConfig>
}

// Discriminated union mirroring DetectionMatch but holding the FINALIZED config
// (post-Zod-parse, defaults applied)
export type DetectedConfig =
  | { type: 'web-app';           config: z.infer<typeof WebAppConfigSchema> }
  | { type: 'backend';           config: z.infer<typeof BackendConfigSchema> }
  | { type: 'cli';               config: z.infer<typeof CliConfigSchema> }
  | { type: 'library';           config: z.infer<typeof LibraryConfigSchema> }
  | { type: 'mobile-app';        config: z.infer<typeof MobileAppConfigSchema> }
  | { type: 'data-pipeline';     config: z.infer<typeof DataPipelineConfigSchema> }
  | { type: 'ml';                config: z.infer<typeof MlConfigSchema> }
  | { type: 'browser-extension'; config: z.infer<typeof BrowserExtensionConfigSchema> }
  | { type: 'game';              config: z.infer<typeof GameConfigSchema> }
```

`gameConfig` is kept as a deprecated alias. When `runAdoption()` commits a game project, it sets BOTH `detectedConfig` and `gameConfig`. The handler emits a one-time `ADOPT_GAME_CONFIG_DEPRECATED` warning to alert consumers. Removal target: v4.0.

## `runAdoption` signature

```ts
export async function runAdoption(options: {
  projectRoot: string
  metaPromptDir: string
  methodology: string
  dryRun: boolean
  auto: boolean                             // derived: argv.auto === true OR outputMode === 'json'
  force: boolean
  verbose: boolean
  explicitProjectType?: ProjectType
  flagOverrides?: PartialConfigOverrides
}): Promise<AdoptionResult>
```

**The `auto` flag is derived at the handler boundary, not passed raw.** The handler computes `auto = argv.auto === true || outputMode === 'json'` before calling `runAdoption`. This is how "JSON mode treats as auto" is wired through: the adoption layer never sees `outputMode`, it only sees a single `auto` boolean that already incorporates the json-mode-implies-auto rule. The orchestrator's disambiguation path stays simple — one boolean, one decision.

`PartialConfigOverrides` is a discriminated-union helper that mirrors `DetectedConfig` but holds `Partial<>`s — the user-supplied init flag values. Both detection's partial and the user's flag partial feed into the same merge pipeline.

## CLI handler — flag wiring

`scaffold adopt` accepts the same 32 init flags as `scaffold init` (from R1-R3). The flag definitions are **reused**, not duplicated, via extraction to a new shared module:

**Refactor: `src/cli/init-flag-families.ts`** (extracted from `init.ts:399-594`):
- Constants: `PROJECT_TYPE_FLAG`, `GAME_FLAGS`, `WEB_FLAGS`, `BACKEND_FLAGS`, `CLI_TYPE_FLAGS`, `LIB_FLAGS`, `MOBILE_FLAGS`, `PIPELINE_FLAGS`, `ML_FLAGS`, `EXT_FLAGS`
- Validation: `applyFlagFamilyValidation(argv)` — game/multiplayer/online-services check, mixed-family rejection, per-family `--project-type` consistency, CSV enum validation, WebApp cross-field validation, game array enum + locale format
- Helper: `buildFlagOverrides(argv): PartialConfigOverrides`

**Stays in `init.ts`:**
- `--depth requires --methodology custom` (init-only)
- `--adapters` enum validation (platform adapters — init concern)
- `--traits` enum validation (legacy field — init concern)

Both `init.ts` and `adopt.ts` call `applyFlagFamilyValidation` from their own `.check()` closures. `init.ts` additionally runs its init-only validation. The extraction is **NOT a pure move** — it's a careful split documented in the implementation plan.

**Type-level preservation test:** the extracted module includes type assertions verifying `typeof GAME_FLAGS[number]` resolves to a literal union (not widened `string`), catching any accidental drop of the `as const` assertion.

## Handler logic

```ts
const adoptCommand: CommandModule<...> = {
  command: 'adopt',
  describe: 'Adopt an existing project into scaffold',
  builder: (yargs) => yargs
    .option('root', { ... })
    .option('dry-run', { type: 'boolean', default: false })
    .option('force', { type: 'boolean', default: false })
    .option('format', { type: 'string' })
    .option('auto', { type: 'boolean', default: false })
    .option('verbose', { type: 'boolean', default: false })
    .options(PROJECT_TYPE_FLAG)
    .options({ ...GAME_FLAGS, ...WEB_FLAGS, ...BACKEND_FLAGS, ...CLI_TYPE_FLAGS,
               ...LIB_FLAGS, ...MOBILE_FLAGS, ...PIPELINE_FLAGS, ...ML_FLAGS, ...EXT_FLAGS })
    .group(Object.keys(GAME_FLAGS), 'Game project flags:')
    // ... 8 more .group() calls ...
    .check(applyFlagFamilyValidation),

  handler: async (argv) => {
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) { /* existing error path */ }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)
    const lockResult = acquireLock(projectRoot, 'adopt')
    if (!lockResult.acquired) { /* existing lock error path */ }

    try {
      // JSON output mode implies --auto (no interactive prompts)
      const effectiveAuto = argv.auto === true || outputMode === 'json'

      let adoptResult: AdoptionResult
      try {
        adoptResult = await runAdoption({
          projectRoot, metaPromptDir, methodology,
          dryRun: argv['dry-run'],
          auto: effectiveAuto,
          force: argv.force === true,
          verbose: argv.verbose === true,
          explicitProjectType: argv['project-type'] as ProjectType | undefined,
          flagOverrides: buildFlagOverrides(argv),
        })
      } catch (err) {
        const error = asScaffoldError(err, 'ADOPT_INTERNAL', ExitCode.ValidationError)
        output.error(error)
        process.exitCode = error.exitCode
        return
      }

      // Errors from detection (ADOPT_AMBIGUOUS, ADOPT_TYPE_CONFLICT)
      if (adoptResult.errors.length > 0) {
        for (const err of adoptResult.errors) output.error(err)
        process.exitCode = adoptResult.errors[0]?.exitCode ?? ExitCode.ValidationError
        return
      }

      // Warnings (deduped)
      for (const warn of adoptResult.warnings) output.warn(warn)

      // Writes (atomic, config first then state)
      if (!argv['dry-run']) {
        try {
          writeOrUpdateConfig(projectRoot, adoptResult, buildFlagOverrides(argv), argv.force === true)
        } catch (err) {
          const error = asScaffoldError(err, 'ADOPT_CONFIG_WRITE_FAILED', ExitCode.ValidationError)
          output.error(error)
          process.exitCode = error.exitCode
          return
        }
        try {
          writeOrUpdateState(projectRoot, adoptResult, methodology)
        } catch (err) {
          // Config already committed; state is recoverable on next run
          output.warn({ code: 'ADOPT_STATE_WRITE_FAILED', message: ..., context: {...} })
        }
      } else {
        // Dry-run: print proposed changes without writing
        output.info(`[dry-run] Would adopt as ${adoptResult.detectedConfig?.type ?? 'unknown'}`)
        // ... pretty-print diff of existing vs proposed ...
      }

      // Output
      if (outputMode === 'json') {
        output.result(serializeAdoptResult(adoptResult, argv['dry-run']))
      } else {
        output.success(formatAdoptSummary(adoptResult))
      }

      process.exitCode = ExitCode.Success
    } finally {
      releaseLock(projectRoot)
    }
  },
}
```

The handler uses `process.exitCode = N; return` instead of `process.exit(N)` so the `finally` block runs cleanly and pending I/O drains before exit.

## Atomic writes via tmp + rename

`writeOrUpdateConfig` and `writeOrUpdateState` use the canonical atomic-rename pattern:

```ts
function atomicWriteFileSync(target: string, content: string): void {
  const tmpPath = `${target}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, target)
}
```

`fs.renameSync` is atomic on same-volume renames on POSIX (`rename(2)`) and Windows (`MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` since Node 16). The reverse-sequence "config first, then state" ordering means a process kill between writes leaves the system in a consistent state: config.yml is authoritative, state.json is recoverable.

Both helpers are **synchronous**. The handler is async only because of `disambiguate()` — file writes don't need to be async, and keeping them sync simplifies reasoning about mid-write interleaving with the lock.

## `writeOrUpdateConfig` — three-state branching

```ts
function writeOrUpdateConfig(projectRoot, adoptResult, flagOverrides, force): void {
  const configPath = path.join(projectRoot, '.scaffold', 'config.yml')

  // Branch 1: file missing → bootstrap
  if (!fs.existsSync(configPath)) {
    const doc = createBlankConfigDocument()
    applyMutations(doc, adoptResult, flagOverrides)
    atomicWriteFileSync(configPath, doc.toString())
    return
  }

  // Branch 2: file exists → parse
  const content = fs.readFileSync(configPath, 'utf8')
  const doc = parseDocument(content)
  if (doc.errors.length > 0) {
    throw configParseError(configPath, doc.errors[0].message)    // existing error factory
  }

  // Branch 3: structural check
  const projectNode = doc.get('project', true)
  if (projectNode !== undefined && !isMap(projectNode)) {
    throw configNotObject(configPath)                             // existing error factory
  }

  // Mutate AST in place + write atomically
  applyMutations(doc, adoptResult, flagOverrides)
  atomicWriteFileSync(configPath, doc.toString())
}
```

Reuses existing `configParseError` and `configNotObject` factories from `src/utils/errors.ts`. No new error codes for these cases.

## `createBlankConfigDocument` — minimal bootstrap

```ts
function createBlankConfigDocument(): Document {
  return parseDocument(`# scaffold config — created by scaffold adopt
version: 2
project:
`)
}
```

Only `version: 2` and an empty `project:` map. **No `methodology`. No `platforms`.** Adopt discovers existing state; it doesn't impose defaults. The user runs `scaffold init` later (or hand-edits) to set methodology and platforms.

To support this, `ConfigSchema` is updated with explicit Zod defaults: `methodology: z.enum(...).default('deep')`, `platforms: z.array(...).default(['claude-code'])`. This means a bootstrap-only config is loadable even without those fields explicitly set.

## `asScaffoldError` helper

New helper in `src/utils/errors.ts`:

```ts
export function asScaffoldError(
  err: unknown,
  fallbackCode: string,
  fallbackExit: number,
): ScaffoldError {
  // Already a fully-formed ScaffoldError (strict shape check)
  if (
    err !== null && typeof err === 'object' &&
    'code' in err && typeof (err as Record<string, unknown>).code === 'string' &&
    'message' in err && typeof (err as Record<string, unknown>).message === 'string' &&
    'exitCode' in err && typeof (err as Record<string, unknown>).exitCode === 'number'
  ) {
    return err as ScaffoldError
  }

  // Error instance — extract message + stack
  if (err instanceof Error) {
    return {
      code: fallbackCode,
      message: err.message || 'Unknown error',
      exitCode: fallbackExit,
      context: { stack: err.stack?.slice(0, 500) ?? '', name: err.name },
    }
  }

  // Non-Error throw (string, null, undefined, object literal)
  return {
    code: fallbackCode,
    message: typeof err === 'string' ? err : `Non-Error thrown: ${String(err)}`,
    exitCode: fallbackExit,
  }
}
```

Handles all five thrown-value shapes safely. Used by the handler's outer try/catch around `await runAdoption(...)`.

## JSON output schema

For `--format json`, the result shape:

```json
{
  "schema_version": 2,
  "mode": "brownfield",
  "project_type": "web-app",
  "detection_confidence": "high",
  "detection_evidence": [
    { "signal": "next-config", "file": "next.config.mjs" },
    { "signal": "react-dep" },
    { "signal": "app-router-dir", "file": "app/page.tsx" }
  ],
  "detected_config": {
    "type": "web-app",
    "config": {
      "renderingStrategy": "ssr",
      "deployTarget": "serverless",
      "realtime": "websocket",
      "authFlow": "session"
    }
  },
  "artifacts_found": 3,
  "steps_completed": ["product-requirements"],
  "steps_remaining": ["..."],
  "methodology": "deep",
  "dry_run": false,
  "errors": [],
  "warnings": []
}
```

**Three fields kept for backward compat with v1 (implicit) consumers:**
- `project_type` (top-level) — duplicates `detected_config.type`; deprecated, removed in v4.0
- `game_config` (when type is game) — duplicates `detected_config.config`; deprecated, removed in v4.0

**Schema versioning rationale:** pre-v3.10 output had no `schema_version` field and emitted `game_config` as a flat field (implicit v1). Starting at `2` distinguishes post-v3.10 output cleanly: `if ('schema_version' in output) { /* v2+ */ } else { /* v1 */ }`.

**`serializeAdoptResult`** builds the JSON output with explicit ordered keys via `ORDERED_KEYS satisfies (keyof AdoptionResultJson)[]`, catching drift at compile time. Snapshot tests assert the order.

## `--format` handling

In `--format json` mode:
- `output.error(err)` → stderr as human-readable text
- `output.warn(warn)` → stderr as human-readable text + pushed into `result.warnings[]` in stdout JSON
- `output.result(result)` → stdout as the single JSON object
- `output.success(msg)` → suppressed entirely
- Disambiguation prompt is suppressed (json mode treats as `--auto` for the prompt path)

stderr stays plain text in all modes — matches Unix convention (stdout=data, stderr=diagnostics) and lets `scaffold adopt --format json | jq` work cleanly.

## `--dry-run` semantics

With `--dry-run`:
1. Lock is acquired
2. Detection runs (including disambiguation prompt if interactive)
3. Merge pipeline computes the final typed config in memory
4. **No writes:** `writeOrUpdateConfig` and `writeOrUpdateState` are NOT called
5. Output shows the proposed changes:
   - Text mode: `[dry-run] Would commit: <type> with <N> fields inferred` + pretty-printed config
   - JSON mode: full result with `dry_run: true` and additional `proposed_changes` field
6. Exit code 0 (dry-run never fails for write issues)

The lock is acquired during dry-run to ensure detection consistency.

---

# Section 5 — Per-Detector Confidence Rules

Each detector is a pure function `(ctx: SignalContext) => DetectionMatch | null` in `src/project/detectors/<type>.ts`. Per-detector LOC soft caps and test counts:

| Detector | LOC cap | Test cases |
|---|---|---|
| `detectWebApp` | 200 | 18 |
| `detectBackend` | 200 | 18 |
| `detectMl` | 150 | 12 |
| `detectLibrary` | 150 | 12 |
| `detectCli` | 110 | 10 |
| `detectDataPipeline` | 130 | 10 |
| `detectMobileApp` | 100 | 8 |
| `detectBrowserExtension` | 100 | 8 |
| `detectGame` | 70 | 8 |
| Shared helpers | 150 | — |
| **Total** | **~1350** | **104 (across the 9 per-type detector files; orchestrator and integration tests live in separate files — see Section 6)** |

## File-text matching constraints

Several detectors need to peek inside config files and **known convention-based entry files** for specific directives or patterns. **Rules:**

1. **Allowlisted file paths only.** `readFileText` is called ONLY on files from a fixed allowlist per detector:
   - **Config files:** `next.config.*`, `vite.config.*`, `astro.config.*`, `svelte.config.*`, `nuxt.config.*`, `remix.config.*`, `angular.json`, `manifest.json`, `Cargo.toml`, `package.json`, `pyproject.toml`, `go.mod`, `wrangler.toml`, `vercel.json`, `netlify.toml`, `serverless.yml`, `Dockerfile`, `docker-compose.yml`, `app.json`, `pubspec.yaml`, `dbt_project.yml`, `kedro.yml`, `Gemfile`, `composer.json`, `*.csproj`, `pom.xml`, `build.gradle`, `build.gradle.kts`.
   - **Convention-based entry files:** `src/{index,server,main,app,bootstrap}.{ts,tsx,js,mjs,cjs}`, `index.{js,ts}`, `server.{js,ts}`, `manage.py`, `wsgi.py`, `asgi.py`, `app.py`, `main.py`, `server.py`, `cmd/*/main.go`, `main.go`, `src/main.rs`, `README.md` (for HuggingFace model card frontmatter detection).
   - **Open-ended source-code scanning is out of scope.** Detectors must not recursively walk `src/` or grep arbitrary source files. The allowlist is exhaustive for v3.10. Adding a new allowlisted path requires updating this section.
2. **Strip block AND line comments before matching.** `stripJsTsComments` removes `/* */` blocks (including JSDoc `/** */`), then strips `//` comments while respecting string literals.
3. **Strip template literal contents** so backtick-enclosed text containing config-like substrings doesn't false-match.
4. **Anchor to export expression.** For JS/TS configs, the regex matches only inside `module.exports`, `export default`, or `defineConfig(` blocks.
5. **Quote-agnostic.** Match both `'value'` and `"value"`.
6. **Primitive-literal-only.** Dynamic expressions like `output: process.env.X ? 'export' : undefined` do NOT match. Detection falls back to the framework's default and continues.

## 5.1 — `detectWebApp`

### Disqualifiers (early null return)

`detectWebApp` returns `null` when there's **co-located evidence of a mobile project** at the same root:

```ts
function isMobileProject(ctx: SignalContext): boolean {
  if (ctx.hasFile('pubspec.yaml')) return true                      // Flutter
  if (ctx.hasFile('app.json') && ctx.hasDep('expo')) return true   // Expo
  if (ctx.dirExists('ios') && ctx.dirExists('android')) return true  // Native RN
  return false
}
if (isMobileProject(ctx)) return null
```

Requiring `app.json` AND `expo` dep together (not OR) means a monorepo root with hoisted `expo` but NO root-level `app.json` falls through to normal web-app detection. Monorepo case preserved.

### Tier rubric

**high:**
- `next.config.{js,mjs,ts,cjs}` exists, OR
- `vite.config.{js,ts,mjs}` + (`index.html` at root or `public/index.html`), OR
- `astro.config.{mjs,ts,js}` exists, OR
- `remix.config.{js,ts}` or `react-router.config.{js,ts}` exists, OR
- `nuxt.config.{ts,js,mjs}` exists, OR
- `svelte.config.{js,ts}` + `@sveltejs/kit` dep, OR
- `angular.json` exists

**medium:** `react`/`vue`/`svelte`/`@angular/core` dep + at least one entry file (`src/App.tsx`, `src/main.tsx`, `src/app.vue`, `src/App.svelte`, `src/pages/`, `public/index.html`)

**low:** `*.html` at root with no server-side framework deps

### Field inference

| Signal | → Field | Value |
|---|---|---|
| `next.config.*` with `output: 'export'` | `renderingStrategy` | `'ssg'` |
| `next.config.*` with `output: 'standalone'` | `renderingStrategy` | `'ssr'` |
| `next.config.*` with both `app/` AND `pages/` dirs | `renderingStrategy` | `'hybrid'` |
| `next.config.*` with no output directive | `renderingStrategy` | `'ssr'` |
| `vite.config.*` + `index.html` | `renderingStrategy` | `'spa'` |
| `astro.config.*` with `output: 'server'` | `renderingStrategy` | `'ssr'` |
| `astro.config.*` with `output: 'hybrid'` | `renderingStrategy` | `'hybrid'` |
| `astro.config.*` with no output / `output: 'static'` | `renderingStrategy` | `'ssg'` |
| `remix.config.*` OR `react-router.config.*` | `renderingStrategy` | `'ssr'` |
| `nuxt.config.*` with `ssr: false` | `renderingStrategy` | `'spa'` |
| `nuxt.config.*` without `ssr: false` | `renderingStrategy` | `'ssr'` |
| `svelte.config.*` + `@sveltejs/adapter-static` | `renderingStrategy` | `'ssg'` |
| `svelte.config.*` + `@sveltejs/adapter-vercel`/`-netlify`/`-auto` | `renderingStrategy`+`deployTarget` | `'ssr'` + `'serverless'` |
| `svelte.config.*` + `@sveltejs/adapter-node` | `renderingStrategy`+`deployTarget` | `'ssr'` + `'container'` |
| `svelte.config.*` + `@sveltejs/adapter-cloudflare` | `renderingStrategy`+`deployTarget` | `'ssr'` + `'edge'` |
| `angular.json` | `renderingStrategy` | `'spa'` |
| `socket.io`/`socket.io-client` dep | `realtime` | `'websocket'` |
| `ws` dep | `realtime` | `'websocket'` |
| `next-auth`/`@auth/core`/`lucia`/`@supabase/supabase-js` dep | `authFlow` | `'session'` |
| `passport`/`passport-*` dep | `authFlow` | `'session'` |
| `@clerk/*`/`@auth0/*`/`@okta/*` dep | `authFlow` | `'oauth'` |
| `@simplewebauthn/*`/`webauthn-*` dep | `authFlow` | `'passkey'` |
| `vercel.json` | `deployTarget` | `'serverless'` |
| `netlify.toml` | `deployTarget` | `'serverless'` |
| `wrangler.toml` (Cloudflare) | `deployTarget` | `'edge'` |
| `Dockerfile` (no serverless config) | `deployTarget` | `'container'` |

**Anchor:** `renderingStrategy` is required.

**Note:** `renderingStrategy` and `deployTarget` are orthogonal dimensions. Svelte serverless adapters set both fields cleanly.

## 5.2 — `detectBackend`

### Tier rubric

**high:** framework dep + at least one of `(routes/`, `src/routes/`, `src/api/`, `app/api/`, `api/`) AND not also a meta-framework web-app config

**medium:** framework dep + entry file with listen-call match

**low:** framework dep alone (possibly transitive)

### Per-framework signature table

| Framework | Dep | Listen patterns | Entry files |
|---|---|---|---|
| Express | `express` | `.listen(`, `createServer(` | `src/{index,server,main}.{ts,js,mjs}`, `index.js`, `server.js` |
| Fastify | `fastify` | `.listen(`, `fastify.listen` | same as Express |
| NestJS | `@nestjs/core` | `app.listen(`, `bootstrap()` | `src/main.{ts,js}` |
| Koa | `koa` | `.listen(`, `app.listen` | `src/{index,app}.ts` |
| Hapi | `@hapi/hapi` | `server.start()` | same |
| Hono | `hono` | `serve(`, `app.fetch`, `Hono()` | `src/{index,server}.ts` |
| Django | `django` | `WSGIHandler`, `ASGIHandler`, `runserver` | `manage.py`, `wsgi.py`, `asgi.py` |
| Flask | `flask` | `app.run(`, Flask import + `if __name__` | `app.py`, `main.py`, `wsgi.py` |
| FastAPI | `fastapi` | `uvicorn.run(`, `app = FastAPI(` | `main.py`, `app.py`, `src/main.py` |
| Sanic | `sanic` | `app.run(`, `Sanic(` | `main.py`, `app.py`, `server.py` |
| Gin | `github.com/gin-gonic/gin` | `r.Run(`, `gin.Default()`, `.Run(":` | `cmd/server/main.go`, `cmd/api/main.go`, `main.go` |
| Echo | `github.com/labstack/echo` | `e.Start(`, `echo.New()` | same as Gin |
| Fiber | `github.com/gofiber/fiber` | `app.Listen(`, `fiber.New()` | same |
| Chi | `github.com/go-chi/chi` | `http.ListenAndServe(` | same |
| Actix-web | `actix-web` | `HttpServer::new(`, `.bind(`, `.run()` | `src/main.rs` |
| Axum | `axum` | `axum::serve(`, `Router::new(` | `src/main.rs` |
| Rocket | `rocket` | `.launch()`, `#[launch]`, `rocket::build(` | `src/main.rs` |
| Warp | `warp` | `warp::serve(` | `src/main.rs` |

For each dep present, the detector scans the framework-specific entry file list with the framework-specific listen patterns. If any match, medium tier is reached. If a routes/handlers directory also exists, high tier.

**Fallback for imported entries:** when `main.ts`/`index.ts` contains an import from `./server` or `./app`, the detector also scans the imported file (up to 3 follow-imports).

### Field inference

| Signal | → Field | Value |
|---|---|---|
| `@apollo/server`/`graphql-yoga` dep | `apiStyle` | `'graphql'` |
| `@trpc/server` dep | `apiStyle` | `'trpc'` |
| `@grpc/grpc-js`/`grpc` (npm), `grpcio` (py), `google.golang.org/grpc` (go) | `apiStyle` | `'grpc'` |
| Any REST framework dep without GraphQL/tRPC/gRPC | `apiStyle` | `'rest'` |
| `pg`/`postgres`/`mysql2`/`prisma`/`drizzle-orm`/`typeorm`/`knex` (npm); `psycopg`/`sqlalchemy`/`asyncpg` (py) | `dataStore` | includes `'relational'` |
| `mongodb`/`mongoose` (npm); `pymongo`/`motor` (py) | `dataStore` | includes `'document'` |
| `redis`/`ioredis` (npm); `redis` (py) — **only when sole datastore** | `dataStore` | includes `'key-value'` |
| `jsonwebtoken`/`@nestjs/jwt`/`jose` | `authMechanism` | `'jwt'` |
| `passport`/`express-session`/`next-auth` | `authMechanism` | `'session'` |
| `@okta/*`/`passport-oauth2`/`@auth0/*` | `authMechanism` | `'oauth'` |
| `bullmq`/`bull`/`bee-queue` (npm); `celery`/`rq` (py) | `asyncMessaging` | `'queue'` |
| `kafkajs`/`@confluentinc/kafka-javascript`/`amqplib`/`nats` | `asyncMessaging` | `'event-driven'` |
| `Dockerfile` OR `docker-compose.yml` | `deployTarget` | `'container'` |
| `serverless.yml`/`sam.yaml` OR `mangum`/`aws-lambda-powertools` | `deployTarget` | `'serverless'` |

**Anchor:** `apiStyle` is required.

**Redis-as-cache rule:** Redis is only set as `'key-value'` when it's the **sole** datastore signal. Otherwise it's treated as a cache layer and omitted from `dataStore` (with evidence preserved). This avoids cluttering configs where redis is clearly a cache alongside Postgres/MongoDB.

## 5.3 — `detectCli`

**high:** `package.json.bin` field set, OR `Cargo.toml [[bin]]`, OR `pyproject.toml [project.scripts]`, OR Go `cmd/*/main.go`

**medium:** CLI framework dep without bin (possibly WIP CLI)

**low:** `#!/usr/bin/env` shebang in `src/index.ts` without framework

### Field inference

| Signal | → Field | Value |
|---|---|---|
| `@inquirer/prompts`/`inquirer`/`enquirer`/`prompts` (npm); `questionary`/`inquirerpy` (py); `dialoguer`/`inquire` (rust) | `interactivity` | `'interactive'` |
| `commander`/`yargs`/`clipanion`/`oclif` alone | `interactivity` | `'args-only'` |
| `clap` (rust) alone | `interactivity` | `'args-only'` |
| `clap` + `dialoguer` | `interactivity` | `'hybrid'` |
| Both CLI framework dep AND interactive prompt dep | `interactivity` | `'hybrid'` |
| `pkg.bin` field set | `distributionChannels` | includes `'package-manager'` |
| `Cargo.toml [[bin]]` | `distributionChannels` | includes `'package-manager'` |
| `pyproject [project.scripts]` | `distributionChannels` | includes `'package-manager'` |
| Go `cmd/*/main.go` pattern | `distributionChannels` | includes `'standalone-binary'` |
| `Dockerfile` with `ENTRYPOINT`/`CMD` | `distributionChannels` | includes `'container'` |
| Homebrew formula (`Formula/*.rb`) OR `.github/workflows/*homebrew*` | `distributionChannels` | includes `'system-package-manager'` |
| `ink`/`listr2`/`cli-table3` (npm); `rich`/`tabulate` (py); `bubbletea`/`tablewriter` (go) | `hasStructuredOutput` | `true` |

**Anchor:** `interactivity` is required.

## 5.4 — `detectLibrary`

**high:** (`pkg.main`/`module`/`exports` set AND no `bin`) OR `Cargo.toml [lib]` AND no `[[bin]]` OR `pyproject` without `[project.scripts]` + Python package dir

**medium:** `pkg` with both `main` AND `bin` (dual-purpose), OR `Cargo.toml` with both `[lib]` and `[[bin]]`

**low:** `src/` with TypeScript/Python/Rust code, no clear runnable entry

### Field inference

| Signal | → Field | Value |
|---|---|---|
| `pkg.private !== true` AND `pkg.name` present | `visibility` | `'public'` |
| `pkg.private === true` | `visibility` | `'internal'` |
| `Cargo.toml package.publish = false` | `visibility` | `'internal'` |
| `pkg.engines.node` present (no browser/exports.browser) | `runtimeTarget` | `'node'` |
| `pkg.browser` field OR `exports['.'].browser` | `runtimeTarget` | `'browser'` |
| `pkg.exports` with both `node` and `browser` conditions | `runtimeTarget` | `'isomorphic'` |
| `pkg.exports` with `'edge'` or `'workerd'` condition | `runtimeTarget` | `'edge'` |
| `pkg.type === 'module'` + `exports['.']['import']` only | `bundleFormat` | `'esm'` |
| `pkg.main` points to `.cjs` OR `type !== 'module'` | `bundleFormat` | `'cjs'` |
| `exports['.']` with both `import` and `require` | `bundleFormat` | `'dual'` |
| No `dist/` dir, just raw `src/` | `bundleFormat` | `'unbundled'` |
| `pkg.types`/`typings` OR any `.d.ts` in root/src | `hasTypeDefinitions` | `true` |
| `mkdocs.yml` / `docusaurus.config.*` / `.vitepress/` / `sphinx + docs/conf.py` / `mdbook + book.toml` | `documentationLevel` | `'full-site'` |
| `.storybook/` OR `@storybook/*` dep | `documentationLevel` | `'api-docs'` (component catalog, not full site) |
| `typedoc` dep OR `typedoc.json` | `documentationLevel` | `'api-docs'` |
| `docs/` dir with markdown, no tooling | `documentationLevel` | `'api-docs'` |
| `README.md` only | `documentationLevel` | `'readme'` |
| Nothing | (omit; Zod default `'readme'`) | |

**Anchor:** `visibility` is required.

**Safety rule:** the detector NEVER explicitly sets `documentationLevel: 'none'`. The schema's cross-field check rejects `visibility: 'public' + documentationLevel: 'none'`. Detector omits the field unless it has positive evidence; Zod's default `'readme'` then applies. If `visibility === 'public'` AND no README is detected, emits `ADOPT_PUBLIC_LIBRARY_NO_README` warning but still completes adoption.

## 5.5 — `detectMobileApp`

**high:** `app.json` with `expo` key, OR `ios/`+`android/` both, OR `pubspec.yaml` (Flutter), OR `Podfile` + `react-native` dep, OR `MainActivity.{kt,java}` anywhere

**medium:** only `ios/` or only `android/` (single-platform native)

### Field inference

| Signal | → Field | Value |
|---|---|---|
| `app.json` with `expo.platforms: ['ios','android']` | `platform` | `'cross-platform'` |
| `expo` OR `react-native` dep without explicit single-platform dirs | `platform` | `'cross-platform'` |
| `pubspec.yaml` (Flutter) | `platform` | `'cross-platform'` |
| `ios/` exists AND `android/` does NOT | `platform` | `'ios'` |
| `android/` exists AND `ios/` does NOT | `platform` | `'android'` |
| Both `ios/` AND `android/` (native) | `platform` | `'cross-platform'` |
| `expo-notifications`/`@react-native-firebase/messaging`/`react-native-push-notification` | `hasPushNotifications` | `true` |
| `expo-sqlite`/`@react-native-async-storage/async-storage`/`watermelondb`/`realm` | `offlineSupport` | `'cache'` |
| `redux-persist` + service worker | `offlineSupport` | `'offline-first'` |

**Anchor:** `platform` is required.

## 5.6 — `detectDataPipeline`

**high:** `dbt_project.yml`, OR `dags/*.py` with `from airflow import`, OR `pipelines/*.py` with `from prefect import` or `from dagster import`, OR `kedro.yml`

**medium:** Python `apache-airflow`/`prefect`/`dagster`/`dbt-core`/`kedro` dep without file structure

**low:** Spark/Beam/Flink deps without organization

### Field inference

| Signal | → Field | Value |
|---|---|---|
| `dbt_project.yml` | `processingModel`+`orchestration` | `'batch'` + `'dag-based'` |
| `dags/` + Airflow imports | `processingModel`+`orchestration` | `'batch'` + `'dag-based'` |
| Prefect flows (`@flow`) | `orchestration` | `'dag-based'` |
| Dagster jobs | `orchestration` | `'dag-based'` |
| `kafkajs`/`kafka-python`/`confluent-kafka` dep | `processingModel` | `'streaming'` |
| `apache-beam`/`apache-flink` dep | `processingModel` | `'streaming'` |
| `pyspark` dep | `processingModel` | `'batch'` |
| Both streaming AND batch deps | `processingModel` | `'hybrid'` |
| `crontab`/`.cron` OR GitHub Actions `schedule:` trigger | `orchestration` | `'scheduled'` |
| `dbt-core` + `tests/` directory | `dataQualityStrategy` | `'testing'` |
| `great-expectations`/`pandera`/`soda-core` | `dataQualityStrategy` | `'validation'` |
| `datafold`/`elementary`/`monte-carlo-data` | `dataQualityStrategy` | `'observability'` |
| `avro`/`protobuf` + confluent-kafka combo | `schemaManagement` | `'schema-registry'` |
| `datahub`/`openmetadata`/`amundsen` | `hasDataCatalog` | `true` |

**Anchor:** `processingModel` is required.

## 5.7 — `detectMl`

**high:** ML framework dep (`torch`/`tensorflow`/`jax`/`scikit-learn`/`keras`/`transformers`/`sentence-transformers`) + at least one of: `models/` dir, `*.ipynb`, `train.py`, `mlflow`/`wandb` config

Plus a **HuggingFace model card signal** (high): `README.md` starts with `---` frontmatter containing `tags: transformers/pytorch/tensorflow` or `library_name: transformers`.

**medium:** ML framework dep alone, no supporting structure

**low:** only `*.ipynb` files at root, no framework dep

### Field inference

| Signal | → Field | Value |
|---|---|---|
| `train.py` / `training/*.py` / `scripts/train.py` | `projectPhase` | `'training'` |
| `serve.py` / `serving/*.py` / `predict.py` / FastAPI + model loading | `projectPhase` | `'inference'` |
| Both training and serving files | `projectPhase` | `'both'` |
| HuggingFace model card | `projectPhase` | `'inference'` |
| `torch`/`pytorch-lightning` | `modelType` | `'deep-learning'` |
| `tensorflow`/`keras` | `modelType` | `'deep-learning'` |
| `scikit-learn`/`xgboost`/`lightgbm`/`catboost` (no torch/tf) | `modelType` | `'classical'` |
| `transformers`/`sentence-transformers`/`openai`/`anthropic`/`langchain`/`llama-index` | `modelType` | `'llm'` |
| `torchserve`/`tf-serving` config | `servingPattern` | `'realtime'` |
| `bentoml`/`mlflow` + serving config | `servingPattern` | `'realtime'` |
| `ray[serve]`/`seldon-core` | `servingPattern` | `'realtime'` |
| `batch_*.py`/`scheduled_*.py` | `servingPattern` | `'batch'` |
| `onnxruntime-web`/`onnxruntime-mobile`/`coreml` | `servingPattern` | `'edge'` |
| `mlflow`/`wandb`/`neptune-client`/`clearml`/`dvc` | `hasExperimentTracking` | `true` |

**Anchor:** `projectPhase` is required.

**Cross-field guarantee (per schema):** `projectPhase === 'inference' | 'both'` requires `servingPattern !== 'none'`. The detector ensures pairing:
- `phase === 'training'`: omit `servingPattern` (Zod default `'none'` applies)
- `phase === 'inference' | 'both'` + specific serving signal: use it
- `phase === 'inference' | 'both'` + no serving signal: **fallback to `'realtime'`** (most common inference pattern)

The detector never emits a config that fails Zod cross-field validation.

## 5.8 — `detectBrowserExtension`

**high:** `manifest.json` exists AND parses as valid JSON AND `manifest_version === 2 || manifest_version === 3`

**No-match (null):** anything else (PWA web manifests, malformed manifests, missing `manifest_version`). Critical: PWAs use `manifest.json` without `manifest_version` — strict integer check eliminates the false positive.

### Field inference

| Signal | → Field | Value |
|---|---|---|
| `manifest_version: 2` | `manifestVersion` | `'2'` |
| `manifest_version: 3` | `manifestVersion` | `'3'` |
| `content_scripts` array non-empty | `hasContentScript` | `true` |
| `background.service_worker` (MV3) OR `background.scripts` (MV2) | `hasBackgroundWorker` | `true` |
| `action.default_popup` OR `browser_action.default_popup` | `uiSurfaces` | includes `'popup'` |
| `options_ui` OR `options_page` | `uiSurfaces` | includes `'options'` |
| `chrome_url_overrides.newtab` | `uiSurfaces` | includes `'newtab'` |
| `devtools_page` | `uiSurfaces` | includes `'devtools'` |
| `side_panel` (MV3) | `uiSurfaces` | includes `'sidepanel'` |

**Anchor:** `manifestVersion` is required (always set from manifest).

**Minimal manifest handling (theme extensions):** if `manifest.json` has only `name`/`version`/`manifest_version` (e.g., a theme extension with no UI/scripts/worker), the detector sets only `manifestVersion`. **All other fields are omitted, NOT explicitly set to false/empty.** Zod defaults (`uiSurfaces: ['popup']`, `hasBackgroundWorker: true`) apply and satisfy the cross-field rule. The schema stays strict — no schema relaxation needed.

For minimal manifests, the orchestrator emits `ADOPT_MINIMAL_EXTENSION` warning to alert the user that the inferred config may not reflect reality (a theme extension's "popup" is fictional).

## 5.9 — `detectGame` (rewritten to use SignalContext)

**high:** Unity (`Assets/*.meta`), OR Unreal (`*.uproject` at root), OR Godot (`project.godot`), OR Bevy (`Cargo.toml` + `bevy` dep), OR Love2D (`conf.lua` + `love` dep), OR Phaser/BabylonJS/Three.js dep + game-ish file structure

**Precedence:** Unity > Unreal > Godot (preserved from existing `adopt.ts:73-93` behavior). Verified by a regression test added BEFORE the relocation.

### Field inference

| Signal | → `engine` |
|---|---|
| `Assets/*.meta` | `'unity'` |
| `*.uproject` at root | `'unreal'` |
| `project.godot` | `'godot'` |
| Bevy / Phaser / custom | `'custom'` |

**Anchor:** `engine` is required.

**All other GameConfig fields** (`multiplayerMode`, `narrative`, `contentStructure`, `economy`, `onlineServices`, `persistence`, `targetPlatforms`, `supportedLocales`, `hasModding`, `npcAiComplexity`) are NOT inferred from filesystem signals — they require user input via wizard or flags. Zod defaults apply post-parse. **This preserves the current behavior:** game detection today only sets `engine`.

## Phase 2 — deferred frameworks (v3.11+)

Intentionally NOT detected in v3.10:

**Backends:** Rails, Laravel, Spring Boot, ASP.NET Core, Quarkus, Sinatra, Symfony (require Ruby/PHP/JVM/.NET parser additions).

**Library projects:** Maven libraries (`pom.xml + <packaging>jar</packaging>`), Gradle libraries (`java-library` plugin), .NET class libraries.

**Web frameworks:** Vike, Qwik, Solid/SolidStart, Preact, Bun.serve, Deno.serve, Cloudflare Workers with Hono/itty-router.

These fall through to lower-tier matches (e.g., `react-dep` medium for Solid+React) OR return null. Users can pass `--project-type <type>` manually; the overlay knowledge entries apply regardless of how the type was identified.

## Monorepo markers — intentionally ignored

`package.json.workspaces`, `pnpm-workspace.yaml`, `turbo.json`, `lerna.json`, `nx.json` are NOT used as detection signals in v3.10. Section 1 decision: root-only detection. Users with monorepos run `scaffold adopt` inside a specific workspace (`cd apps/web && scaffold adopt`) to classify that subtree independently.

## Test fixtures

`tests/fixtures/adopt/detectors/<type>/<variant>/` — ~28 fixture directory trees with 3-6 files each (~120 files total). Each fixture is a real directory tree with just enough files to trigger the intended detection tier.

Plus malformed-manifest failure fixtures in `tests/fixtures/adopt/detectors/malformed/`:
- `package-json-trailing-comma/` (invalid JSON)
- `pyproject-invalid-toml/` (invalid TOML)
- `cargo-truncated/` (truncated)
- `go-mod-no-module/` (incomplete go.mod)
- `manifest-json-no-version/` (PWA look-alike)

Each malformed fixture has a test asserting the detector returns `null`, the SignalContext emits `ADOPT_MANIFEST_UNPARSEABLE` warning, and no exception is thrown.

---

# Section 6 — Release Plan, Documentation, and Appendices

## Target version

**v3.10.0** — minor bump per semver. Additive only (deprecations are non-removing). No breaking changes in v3.10.

## PR strategy: stacked PR (default)

**PR 1 — Detection foundation** (Commits 1-7, ~1800 LOC):
- Deps + enum + helper + extraction + game test + async migration + SignalContext skeleton + 9 detectors + per-detector tests + fixtures
- Self-contained "detection engine" change
- Merges first; CI gate for PR 2

**PR 2 — Orchestration + handler + docs + tests** (Commits 8-13, ~1700 LOC):
- Disambiguation + merge pipeline + gameConfig deprecation alias + CLI handler + docs + E2E
- Depends on PR 1; rebases on main after PR 1 merges
- "Wiring + UX" change

**Single-PR fallback:** allowed if reviewer capacity permits. Same commit order, all in one PR. Both options produce the same final state.

## 14 commit operations (canonical order)

The numbering goes 1, 2, 3, **4a**, **4b**, 5, 6, 7, 8, 9, 10, 11, 12, 13. That's **14 commit operations** (Commit 4 is split into 4a and 4b for reviewability — async migration vs SignalContext skeleton are separate review concerns). The highest commit number is 13.

```
Commit 1 — chore: deps + enum + helper + schema defaults
  - Add yaml ^2.8.3 + smol-toml ^1.6.1 to dependencies
  - Add ExitCode.Ambiguous = 6 to src/types/enums.ts
  - Add asScaffoldError helper to src/utils/errors.ts
  - Add scripts/verify-gameconfig-migration.sh
  - Add Zod defaults for ConfigSchema methodology + platforms (enables stripped-down bootstrap from Section 4)
  - No code consumers yet — passes existing tests
  - Note: the Section 2 dirExists symlink semantics are documented in Section 2's canonical text and applied at implementation time in Commit 4b — no separate amendment commit needed

Commit 2 — refactor: extract init-flag-families.ts
  - Move shared flag-family logic out of src/cli/commands/init.ts (lines 399-594)
  - --depth/--adapters/--traits stay in init.ts
  - Both init and (eventually) adopt import the shared module
  - 21 new tests (12 functional + 9 type-level preservation tests)
  - Existing init tests pass unchanged (regression guard)

Commit 3 — test: add Unity > Unreal > Godot precedence regression test
  - Add tests/fixtures/adopt/detectors/game/multi-engine/ with all three signatures
  - Test asserts result.detectedConfig.config.engine === 'unity'
  - Runs against existing inline detection in adopt.ts — passes today

Commit 4a — refactor: runAdoption async migration (mechanical)
  - src/project/adopt.ts: function → async function
  - src/cli/commands/adopt.ts: handler awaits runAdoption
  - src/project/adopt.test.ts: 12 test bodies become async
  - Existing inline game detection still runs
  - Pure mechanical refactor; reviewer scans diff quickly

Commit 4b — feat: SignalContext + detector skeleton
  - src/project/detectors/{context,types,index,file-text-match,required-fields}.ts
  - FsSignalContext + createFakeSignalContext
  - DetectionMatch discriminated union + assertNever + evidence() helper
  - ALL_DETECTORS = [] (empty)
  - context.test.ts with manifest fixture suite + schema-drift tests
  - No detectors yet — runDetectors([]) returns no matches

Commit 5 — feat: detectGame relocation
  - Create src/project/detectors/game.ts using SignalContext
  - Add bevy fixture for engine='custom'
  - Multi-engine fixture from Commit 3 still passes
  - Inline game logic removed from adopt.ts

Commit 6 — feat: detectWebApp + detectBackend + detectCli + detectLibrary
  - Per Section 5 rules
  - Per-detector test files: web-app (18) + backend (18) + cli (10) + library (12) = 58 cases
  - Per-detector fixture trees under tests/fixtures/adopt/detectors/

Commit 7 — feat: detectMobileApp + detectDataPipeline + detectMl + detectBrowserExtension
  - Per Section 5 rules
  - Per-detector test files: mobile-app (8) + data-pipeline (10) + ml (12) + browser-extension (8) = 38 cases
  - Per-detector fixture trees
  - Plus 5 malformed-manifest failure fixtures with their own assertions

Commit 8 — feat: disambiguate() + Case A-G + resolveDetection
  - src/project/detectors/disambiguate.ts (multi-select prompt + non-TTY/CI fallback + ExitPromptError)
  - src/project/detectors/resolve-detection.ts (Case A-G decision table)
  - 30 new tests (12 disambiguate + 18 resolve-detection)

Commit 9 — feat: merge pipeline + applyFlagOverrides + drift integration
  - mergeRawConfig helper in adopt.ts
  - applyFlagOverrides with flag > existing > detected > default precedence
  - ADOPT_FIELD_CONFLICT warning emission for drift detection
  - Verbose discarded-field log
  - 8 merge tests

Commit 10 — feat: gameConfig deprecation alias + 12-file migration
  - Add detectedConfig field to AdoptionResult (src/types/config.ts)
  - Mark gameConfig @deprecated
  - runAdoption sets BOTH fields for game projects
  - Emit one-time ADOPT_GAME_CONFIG_DEPRECATED warning
  - Update 12 src/ files (5 production + 7 tests) per scripts/verify-gameconfig-migration.sh
  - Pre-flight: bash scripts/verify-gameconfig-migration.sh

Commit 11 — feat: CLI handler delta
  - src/cli/commands/adopt.ts with 32 init flags + .group() calls + .check()
  - createBlankConfigDocument with stripped bootstrap (no methodology/platforms)
  - writeOrUpdateConfig with yaml.parseDocument AST mutation + atomicWriteFileSync
  - writeOrUpdateState with atomicWriteFileSync
  - Handler try/catch around runAdoption with asScaffoldError
  - process.exitCode + return (no process.exit() in async handler)
  - --dry-run handling
  - serializeAdoptResult with ORDERED_KEYS satisfies typing
  - Test files: adopt.cli-flags.test.ts (30+1 cases), adopt.config-write.test.ts (14), adopt.json-output.test.ts (6), adopt.merge.test.ts (8), adopt.windows-crlf.test.ts (1), adopt.re-adoption.test.ts (24+ cases)

Commit 12 — docs: CHANGELOG + README + ADRs + json-output-schemas
  - CHANGELOG.md: v3.10.0 entry per Section 6 below
  - README.md: feature bullet + multi-type adoption section + monorepo pitfalls + disambiguation example with ❯ chevron + real evidence keys
  - docs/architecture/adrs/ADR-025-cli-output-contract.md: AMEND with Exit Code 6 amendment
  - docs/architecture/adrs/ADR-056-multi-type-detection-architecture.md: NEW ADR
  - docs/architecture/api/json-output-schemas.md: UPDATE section 2.3 with v3.10 envelope
  - DO NOT create docs/scaffold-adopt.md or docs/architecture/cli-json-schema.md (no precedent)

Commit 13 — test: E2E + integration tests + forward-compat + benchmark
  - tests/e2e/adopt-multi-type.test.ts: 9 end-to-end fixture runs (one per project type)
  - tests/forward-compat/adopt-output-v3.9-schema.test.ts: validates v3.10 output against frozen v3.9.2 schema fixture
  - tests/fixtures/schema-v3.9.2.ts: frozen copy from `git show v3.9.2:src/config/schema.ts`
  - src/cli/commands/adopt.performance.test.ts: <5ms write benchmark
```

**14 commit operations total** (numbered 1-13 with Commit 4 split into 4a + 4b). **PR 1 is commits 1 through 7** (~1800 LOC) — covers deps, extraction, game test, async migration, SignalContext skeleton, game relocation, and all 9 detectors. **PR 2 is commits 8 through 13** (~1700 LOC) — covers disambiguation, merge pipeline, gameConfig deprecation, CLI handler, docs, and E2E tests. The split point at Commit 7 aligns with "all detectors implemented" — a natural review checkpoint.

## Acceptance criteria

The release is ready to merge when:

1. **All sections' tests pass.** `make check-all` is green on Linux + macOS + Windows CI.
2. **Test count meets the floor:** ~314 new test cases across 22 new test files (plus 4 extended files) + ~120 fixture files.
3. **Three-channel multi-model review clean:** Codex CLI, Gemini CLI, Superpowers code-reviewer all approve with zero unaddressed P0/P1/P2 findings (per CLAUDE.md convention).
4. **Documentation updated:**
   - `CHANGELOG.md` v3.10.0 entry
   - `README.md` multi-type adoption section
   - `docs/architecture/adrs/ADR-025-cli-output-contract.md` amended
   - `docs/architecture/adrs/ADR-056-multi-type-detection-architecture.md` created
   - `docs/architecture/api/json-output-schemas.md` section 2.3 updated
5. **Cross-platform sanity:** at least one fixture-based test runs against each project type on Linux, macOS, and Windows runners.
6. **Performance budget:**
   - `runDetectors(ctx)` completes in <50ms on representative real-world fixtures
   - `writeOrUpdateConfig` + `writeOrUpdateState` complete in <10ms for typical config sizes
   - Full `runAdoption(...)` end-to-end completes in <250ms
7. **Forward-compat:** `adopt-output-v3.9-schema.test.ts` passes — v3.10 output is loadable by v3.9.2 schema (dual-emit guarantee).
8. **gameConfig migration verification:** `scripts/verify-gameconfig-migration.sh` exits 0 before Commit 10 lands.

## CHANGELOG entry

```markdown
## [3.10.0] — 2026-04-XX

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

**Upgrading from v3.9.x → v3.10.0:** No code changes required. Existing
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
```

## README updates

**Subsection 1 — Feature list bullet:**
> - **Multi-type adoption**: `scaffold adopt` detects 9 project types (web-app,
>   mobile-app, backend, cli, library, game, data-pipeline, ml, browser-extension)
>   from manifest files and conventional directory layouts. Override with
>   `--project-type <type>` for explicit control.

**Subsection 2 — `scaffold adopt` rewritten** (existing section expanded with the 9-type table from Section 5).

**Subsection 3 — Multi-type disambiguation example** (new):

````markdown
### Multi-type disambiguation

When `scaffold adopt` finds signals matching multiple project types, you'll
see a radio prompt:

```
? Which best describes this project? (Use arrow keys)
❯ web-app    [high]    next-config (next.config.mjs), app-router-dir (app/page.tsx), public-dir (public/), react-dep
  backend    [high]    routes-dir (app/api), prisma-schema (prisma/schema.prisma), pg-dep
  library    [medium]  pkg-main-field (package.json), pkg-types-field (package.json), peer-deps (react)
  None of these — continue without a project type
```

The default selection (option 1) is the highest-confidence match with the most
evidence. Press Enter to accept, or use arrow keys to pick a different option.

For non-interactive use (CI, scripts), pass `--project-type <type>` explicitly:

```bash
scaffold adopt --auto --project-type web-app
```

If you run `scaffold adopt --auto` and detection is ambiguous, the command
exits with code 6 (`ExitCode.Ambiguous`) and lists the candidate types in the
error message.
````

**Subsection 4 — Common pitfalls** (new):

```markdown
### Common pitfalls

**Monorepos:** `scaffold adopt` is **root-only** in v3.10 — it scans the directory
you run it in, not workspace subdirectories. For monorepos with separate web and
mobile apps, run adopt inside each subtree:

    cd apps/web && scaffold adopt    # detects as web-app
    cd ../mobile && scaffold adopt   # detects as mobile-app

Each subtree gets its own `.scaffold/config.yml`. Subtree-aware detection
(one adopt run that classifies all workspaces at once) is tracked for v3.11+.

**Mixed routers:** A Next.js project migrating from Pages Router to App Router
(both `pages/` and `app/` directories present) is detected as `hybrid` rendering.
If you've finished the migration, override with `--web-rendering ssr`.

**Theme browser extensions:** Theme extensions with no UI surfaces, content
scripts, or background workers will trigger an `ADOPT_MINIMAL_EXTENSION` warning
but still adopt successfully. The Zod defaults (`uiSurfaces: ['popup']`,
`hasBackgroundWorker: true`) won't reflect reality; hand-edit `config.yml`
afterward if accuracy matters.

**Existing projectType:** Re-running `scaffold adopt` on a project that already
has `project.projectType` set will skip detection. Pass `--force` to re-detect,
or `--project-type X` to switch types explicitly.
```

## Documentation files

**ADR-025 amendment** (added at end of `docs/architecture/adrs/ADR-025-cli-output-contract.md`):

````markdown
## Amendment 1 — Exit Code 6 (added v3.10.0)

**Status:** Accepted
**Date:** 2026-04-08

Adds `ExitCode.Ambiguous = 6` to the exit code enumeration for "operator action
required" outcomes that are neither errors nor user cancellations.

Used by `scaffold adopt` when:
- Detection finds multiple equally-plausible project types and `--auto` is set
  (`ADOPT_AMBIGUOUS` error)
- `--project-type X` conflicts with an existing `projectType` in `config.yml`
  and `--force` is not set (`ADOPT_TYPE_CONFLICT` error)

Distinct from exit code 1 (general error) and exit code 3 (lock/state conflict)
so CI scripts can branch:

```sh
case $? in
  0) echo "success" ;;
  1) echo "error" ;;
  3) echo "lock conflict" ;;
  6) echo "needs operator decision" ;;
esac
```
````

**ADR-056** (new — `docs/architecture/adrs/ADR-056-multi-type-detection-architecture.md`): full ADR documenting the per-type detector + SignalContext + Case A-G decision architecture, extending ADR-028 (detection-priority). See spec doc for full content.

**`docs/architecture/api/json-output-schemas.md` section 2.3:** updated with the v3.10 envelope including `schema_version: 2`, `detected_config` discriminated union, deprecation notes for `game_config` and top-level `project_type`, and per-project-type field tables.

## Documentation files NOT created

- `docs/scaffold-adopt.md` — no precedent for command-specific docs in `docs/` root
- `docs/architecture/cli-json-schema.md` — section 2.3 of existing `json-output-schemas.md` already covers this

## Tests summary

| File | New cases | Source section |
|---|---|---|
| `src/project/detectors/context.test.ts` | ~30 | Section 2 |
| `src/project/detectors/disambiguate.test.ts` | 12 | Section 3 |
| `src/project/detectors/resolve-detection.test.ts` | 18 | Section 3 |
| `src/project/detectors/web-app.test.ts` | 18 | Section 5 |
| `src/project/detectors/backend.test.ts` | 18 | Section 5 |
| `src/project/detectors/cli.test.ts` | 10 | Section 5 |
| `src/project/detectors/library.test.ts` | 12 | Section 5 |
| `src/project/detectors/mobile-app.test.ts` | 8 | Section 5 |
| `src/project/detectors/data-pipeline.test.ts` | 10 | Section 5 |
| `src/project/detectors/ml.test.ts` | 12 | Section 5 |
| `src/project/detectors/browser-extension.test.ts` | 8 | Section 5 |
| `src/project/detectors/game.test.ts` | 8 | Section 5 |
| `src/project/detectors/index.test.ts` | 8 | Section 5 |
| `src/project/adopt.test.ts` (extended) | +12 | Section 4 |
| `src/project/adopt.re-adoption.test.ts` (new) | 24+ | Section 3 |
| `src/project/adopt.merge.test.ts` (new) | 8 | Section 3 |
| `src/project/adopt.error-messages.test.ts` (new) | 4 | Section 3 |
| `src/cli/commands/adopt.cli-flags.test.ts` (new) | 31 | Section 4 |
| `src/cli/commands/adopt.config-write.test.ts` (new) | 14 | Section 4 |
| `src/cli/commands/adopt.json-output.test.ts` (new) | 6 | Section 4 |
| `src/cli/commands/adopt.windows-crlf.test.ts` (new) | 1 | Section 4 |
| `src/cli/init-flag-families.test.ts` (new) | 21 | Section 4 |
| `src/utils/errors.test.ts` (extended) | +7 | Section 4 |
| `src/cli/commands/adopt.performance.test.ts` (new) | 1 | Section 4 |
| `tests/e2e/adopt-multi-type.test.ts` (new) | 9 | Section 6 |
| `tests/forward-compat/adopt-output-v3.9-schema.test.ts` (new) | 4 | Section 6 |
| **Total new test cases** | **~314** (sum of all rows above) | |
| **Total new test files** | **26** (22 new files + 4 extended) | |

Plus the **~120 fixture files** across `tests/fixtures/adopt/detectors/`.

---

# Appendix A — Warning Code Taxonomy

23 codes total: 5 new errors + 3 reused errors + 15 new warnings.

**Source legend:** **NEW** = added in v3.10.0; **REUSED** = pre-existing scaffold code.

| Code | Source | Severity | Exit | Section | Meaning |
|---|---|---|---|---|---|
| `ADOPT_AMBIGUOUS` | NEW | Error | 6 | 3 | Detection found multiple equally-plausible matches under --auto |
| `ADOPT_TYPE_CONFLICT` | NEW | Error | 6 | 3 | --project-type X conflicts with existing projectType, no --force |
| `ADOPT_MISSING_REQUIRED_FIELDS` | NEW | Error | 1 | 3, 4 | Zod schema rejected merged config; lists missing required fields with `--<type>-<field>` flag hints. Covers Case G. |
| `ADOPT_CONFIG_WRITE_FAILED` | NEW | Error | 1 | 4 | Filesystem write failed |
| `ADOPT_INTERNAL` | NEW | Error | 1 | 4 | Unexpected exception in runAdoption (asScaffoldError fallback) |
| `CONFIG_PARSE_ERROR` | REUSED | Error | 1 | — | YAML parse failure (src/utils/errors.ts:41) |
| `CONFIG_NOT_OBJECT` | REUSED | Error | 1 | — | project: is not a YAML map (src/utils/errors.ts:51) |
| `LOCK_HELD` | REUSED | Error | 3 | — | Existing scaffold adopt lock conflict |
| `ADOPT_MANIFEST_UNPARSEABLE` | NEW | Warning | 0 | 2 | Manifest exists but failed JSON/TOML/Zod parse |
| `ADOPT_FS_INACCESSIBLE` | NEW | Warning | 0 | 2 | FS op hit EACCES/ELOOP/ENOTDIR/ENAMETOOLONG |
| `ADOPT_FILE_UNREADABLE` | NEW | Warning | 0 | 2 | Specific file requested via readFileText could not be read |
| `ADOPT_FILE_TRUNCATED` | NEW | Warning | 0 | 2 | File exceeded maxBytes and was truncated |
| `ADOPT_SECONDARY_MATCHES` | NEW | Warning | 0 | 3 | Detection committed to a winner but other matches exist |
| `ADOPT_LOW_ONLY` | NEW | Warning | 0 | 3 | Only low-confidence matches under --auto; no commit |
| `ADOPT_TYPE_CHANGED` | NEW | Warning | 0 | 3 | Re-adoption with --force found different type than existing |
| `ADOPT_DETECTION_INCONCLUSIVE` | NEW | Warning | 0 | 3 | --force re-run found nothing actionable |
| `ADOPT_FIELD_CONFLICT` | NEW | Warning | 0 | 3 | Re-adoption found field where existing != detected; existing wins |
| `ADOPT_USER_CANCELLED` | NEW | Warning | 0 | 3 | User Ctrl-C'd the disambiguation prompt |
| `ADOPT_NON_TTY` | NEW | Warning | 0 | 3 | No TTY detected; disambiguation skipped |
| `ADOPT_GAME_CONFIG_DEPRECATED` | NEW | Warning | 0 | 4 | gameConfig field populated; use detectedConfig (one per invocation) |
| `ADOPT_PUBLIC_LIBRARY_NO_README` | NEW | Warning | 0 | 5 | Library detected as public but no README.md found |
| `ADOPT_MINIMAL_EXTENSION` | NEW | Warning | 0 | 5 | Browser extension has manifest_version but no UI/scripts/worker |
| `ADOPT_STATE_WRITE_FAILED` | NEW | Warning | 0 | 4 | state.json write failed after successful config write (recoverable) |

---

# Appendix B — `gameConfig` Migration File List

26 files contain `gameConfig` references (verified via `git grep`). Of these, ~12 need code/test changes; the rest are schema files (kept), historical specs/plans (frozen), or user-facing docs.

**Production source — MIGRATE (5 files):**
- `src/types/config.ts` — add `detectedConfig` field; mark `gameConfig` `@deprecated`
- `src/project/adopt.ts` — set both fields when type === 'game'; emit deprecation warning
- `src/wizard/wizard.ts` — set both fields when configuring game project
- `src/wizard/questions.ts` — verify (may delegate to wizard.ts; likely no change)
- `src/cli/commands/adopt.ts` — JSON output dual-emits

**Test source — MIGRATE (7 files):**
- `src/project/adopt.test.ts` — 4 game tests assert both fields
- `src/cli/commands/adopt.test.ts` — JSON dual-emit assertions
- `src/wizard/wizard.test.ts` — wizard test assertions
- `src/wizard/questions.test.ts` — verify
- `src/e2e/game-pipeline.test.ts` — snapshot updates
- `src/e2e/project-type-overlays.test.ts` — cross-type integration
- `src/core/pipeline/resolver.test.ts` — verify

**Schema — NO CHANGE (2 files):** `src/config/schema.ts`, `src/config/schema.test.ts`. Per Section 5 R2-rej1, schema stays strict with `gameConfig` field intact.

**User-facing docs — UPDATE (2 files):** `README.md`, `CHANGELOG.md`.

**Historical docs — NO CHANGE (10 files):** R1-R3 specs and plans in `docs/superpowers/specs/` and `docs/superpowers/plans/`, plus `docs/game-content-audit-prompt.md`. These document the v3.5-v3.9 design history when `gameConfig` was introduced; rewriting them would be revisionist.

**Verification:** `bash scripts/verify-gameconfig-migration.sh` runs before Commit 10 lands. Categorizes the 26 files and asserts the expected scope. Uses `git ls-files` to respect `.gitignore`.

---

# Appendix C — Section Interaction Reference

| Topic | Defined in | Referenced in |
|---|---|---|
| `ExitCode.Ambiguous = 6` | Section 3 R2-Δ11 (added to enums.ts in Commit 1) | Sections 3, 4, 6 |
| `ADOPT_FIELD_CONFLICT` warning | Section 3 R1-Δ5 | Section 4 R2-Δ20 (cross-reference, not new code) |
| Verbose discarded-field log | Section 3 R1-Δ16 | Section 4 |
| `acceptLowConfidence` parameter | Section 3 R1-Δ14 (renamed from `forceLowAccepted`) | Section 4 |
| Pre-parse YAML merge invariant | Section 3 R1-Δ3 | Section 4 R1-Δ9, R2-Δ8 |
| `dirExists` follows symlinks | Section 5 R2-Δ2 (Section 2 amendment) | Sections 2, 5 |
| Detector execution order is perf-only | Section 5 R1-Δ15, R2-Δ10 | Sections 1, 2 |
| `gameConfig` deprecation mechanism | Section 4 R2-Δ5 | Sections 4, 6 |
| Schema cross-field rules NOT relaxed | Section 5 R2-rej1 | Section 5, Appendix B |
| `runAdoption` async migration | Section 4 R1-Δ2 → Section 6 R2-Δ5 (commit ordering) | Sections 4, 6 |

---

# Appendix D — Future Work (deferred to v3.11+)

1. **Backend frameworks:** Rails, Laravel, Spring Boot, ASP.NET Core, Quarkus, Symfony, Sinatra
2. **Library projects:** Maven, Gradle, .NET class libraries
3. **Web frameworks:** Vike, Qwik, Solid/SolidStart, Preact, Bun.serve, Deno.serve
4. **`--reset-detected` flag** for unsetting stale detected fields (currently additive-only)
5. **`--yes` flag** for piped-stdin acceptance (currently piped stdin treated as `--auto`)
6. **Subtree-aware monorepo detection** (currently root-only)
7. **Telemetry events** on ambiguity exits to tune `PROJECT_TYPE_PREFERENCE` order
8. **Internationalization** of prompts and error messages
9. **Comment-preserving YAML for state.json** (currently JSON only)
10. **Deep merge / nested-object support** when first typed config introduces nested fields
11. **`cacheStrategy` field** on `BackendConfig` to disambiguate Redis-as-cache from Redis-as-store
12. **Source-code scanning** for detection (currently config-file-only)

Each item has a brief rationale in the section that flagged it.

---

# Appendix E — Review History

The spec was developed across **11 section-level multi-model review rounds** (Gemini CLI + Superpowers code-reviewer in parallel for each section) plus **2 consolidated spec-doc-level review rounds** after the canonical doc was written (Round 1 with Superpowers only due to Gemini capacity exhaustion; Round 2 with Codex CLI + Superpowers, Gemini silent). Total ~195 findings, ~192 accepted and 3 explicitly rejected with reasoning.

| Section | Rounds | Findings | Disposition |
|---|---|---|---|
| Section 1 — Architecture Overview | 1 | 10 (1 P0, 4 P1, 5 P2) | All addressed |
| Section 2 — Core Detection Data Model | 2 | 28 (4 P0 + 0 P0, 9 P1 + 6 P1, 7 P2 + 7 P2) | All addressed |
| Section 3 — Disambiguation, Force, Re-Adoption | 2 | 30 (3 P0 + 0 P0, 6 P1 + 6 P1, 7 P2 + 8 P2) | All addressed |
| Section 4 — AdoptionResult + CLI Handler | 2 | 35 (4 P0 + 4 P0, 8 P1 + 8 P1, 4 P2 + 7 P2) | All addressed; 1 rejected (hide flag groups in --help) |
| Section 5 — Per-Detector Rules | 2 | 32 (5 P0 + 2 P0, 8 P1 + 7 P1, 9 P2 + 6 P2) | All addressed; 1 rejected (Δ5 schema relaxation — Zod defaults already satisfy cross-field) |
| Section 6 — Release Plan + Docs | 2 | 36 (0 P0 + 0 P0, 8 P1 + 7 P1, 13 P2 + 6 P2) | All addressed |
| Spec Doc Round 1 (Superpowers only) | 1 | 10 (0 P0, 3 P1, 7 P2) | All addressed |
| Spec Doc Round 2 (Codex + Superpowers) | 1 | 14 (0 P0, 5 P1, 9 P2) | All addressed |
| **Total** | **13** | **~195** | **~192 accepted, 3 rejected** |

**Rejections (with reasoning):**

1. **Section 4 R1: Hide flag groups in `--help`** (Gemini P2). Rejected for consistency with `scaffold init`, which already shows all 9 groups. Discoverability outweighs verbosity.

2. **Section 4 R1: Init-flag mismatch warn-and-skip** (Superpowers P1-5). Rejected in favor of strict `INIT_FLAG_TYPE_MISMATCH` error. Consistency with `scaffold init`'s existing validation. Silent flag skipping would corrupt configs.

3. **Section 5 R2: Schema relaxation for minimal browser extensions** (Section 5 R1-Δ5). Rejected — verified that `schema.test.ts:869-878` shows `browserExtensionConfig: {}` already passes via Zod defaults. The detector should omit fields rather than relax the schema.

The review history is preserved here as an audit trail. The canonical Section 1-6 text above absorbs all accepted deltas; readers who want to understand the why behind specific decisions can trace back through this appendix.

---

**End of spec.** Implementation begins with Commit 1 of the 14-commit plan in Section 6. The next step is to run this spec through `superpowers:writing-plans` to produce the task-by-task implementation plan.
