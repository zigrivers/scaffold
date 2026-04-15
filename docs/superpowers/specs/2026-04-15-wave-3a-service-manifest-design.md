# Wave 3a: Service Manifest — Design

**Status**: Draft (pre-plan), rev 4 after round-3 multi-model review.
**Source spec**: `docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md`, Wave 3a section.
**Audience**: Reviewers (multi-model + human) before writing the implementation plan.

---

## 1. Goal

Add a `services[]` array to `ScaffoldConfig.project` so Scaffold can describe multi-service projects, and ship the state-migration dispatch framework needed so Wave 3b can safely introduce a non-trivial state shape change without retrofitting the loader. User-facing entry is `scaffold init --from <services.yml>`.

The canonical use case is projects like [nibble](https://github.com/zigrivers/nibble) — a multi-service SaaS (three FastAPI backends + one shared Python library + one React frontend) where the interactive wizard is a bad fit.

## 2. Why Now

Wave 2 (cross-service pipeline) needs an activation signal. The overlay system is keyed on `projectType`; there is no way to load a structural overlay without a config-level trigger. The `services[]` field provides that trigger: in Wave 2, `resolveOverlayState` will add a second overlay pass gated on `services?.length > 0`.

Wave 3a lands the schema and the declarative init path. It does NOT:
- Add the second overlay pass (Wave 2).
- Add per-service step execution (Wave 3b).
- Add cross-service artifact reads (Wave 3c).
- Add multi-service `scaffold adopt` (future).

**Explicit limitation in Wave 3a**: running `scaffold run` on a multi-service config will fail at the command entry point. Wave 3a installs an explicit guard that rejects any config where `project.services?.length > 0`, **regardless of whether root `projectType` is also set**. Without the guard, a config with both `services[]` and a root `projectType` would today happily resolve the root overlay and silently ignore `services[]` — that silent-ignore is the bug we're preventing. Multi-service execution ships in Wave 2. A services-authored config at this point is **configured but not executable**. The plan must call this out in the README / CHANGELOG / `--from` help text so users aren't surprised.

## 3. Scope

### In scope
- `ServiceSchema` (Zod) covering all 10 project types' per-type configs plus `name`, `description`, `projectType`, `path`. **`exports` is NOT included in Wave 3a** (see §11 D3).
- `ProjectSchema.services: z.array(ServiceSchema).min(1).optional()`.
- Cross-field refinements: unique service names; **(no change to existing `projectType` requiredness — see §4 D-BC)**.
- `src/types/config.ts` updates: add `ServiceConfig` interface and `services?: ServiceConfig[]` on `ProjectConfig`. Keep Zod and the manual types in lockstep, same as the rest of the codebase.
- Refactor existing `ProjectSchema.superRefine()` type-config coupling into per-type validator modules under `src/config/validators/` (Approach 3), with **required per-module tests** (§8).
- `ServiceSchema.superRefine()` consumes the same validator modules as `ProjectSchema`, plus one ServiceSchema-specific forward-direction rule (§5 Layer B).
- **Split `runWizard()` into `collectWizardAnswers()` + `materializeScaffoldProject()`**. The materializer owns backup/reinit, config write, state init, and decisions write. `runBuild` + `syncSkillsIfNeeded` stay at the init.ts layer (where they live today at init.ts:594/614) and run after `materializeScaffoldProject()` returns, in a shared post-materialize block that both the wizard path and the `--from` path fall through to. Both init paths call the materializer with a shared `ScaffoldConfig` input. This is a seam change, not a post-wizard helper extraction.
- `scaffold init --from <path>` declarative init. Exclusive with other config-setting flags (hard error modeled in the yargs builder, §5 Layer C). Reads YAML (or stdin via `-`), validates as a full `ScaffoldConfig`, calls `materializeScaffoldProject()`. Honors `--force` exactly like today's init (materializer owns `--force` semantics).
- Multi-service execution guard: a single shared helper (e.g., `assertSingleServiceOrExit(config, { commandName })` in `src/cli/guards.ts`) is called from **every stateful/pipeline-resolving command** at the top of its handler, after config load: `run`, `next`, `complete`, `skip`, `status`, `rework`, `reset`, `info`, `dashboard`. The helper rejects any config with `project.services?.length > 0`, regardless of root `projectType`, with exit 2 and a "lands in Wave 2" message. This is NOT restricted to `run.ts` alone — 13 call sites today instantiate `StateManager` across 11 command files, and all of them must short-circuit or else silently operate on a single-service projection of a multi-service config.
- State migration framework: widen `'schema-version'` from literal `1` to `1 | 2`; version-dispatch in `state-manager.ts`'s `loadState()`; `initializeState()` emits `2` when the config has `services[]`, `1` otherwise. **v2 shape is identical to v1** — this wave reserves the version number; Wave 3b will change the shape and bump to v3. The existing `src/validation/state-validator.ts` also widens to accept `1 | 2`. The existing `stateSchemaVersion(expected: number, …)` helper in `src/utils/errors.ts` widens its first parameter to `number | readonly number[]` to carry the pair; call-sites updated.
- `StateManager` gains explicit config access for `loadState()` via an optional `configProvider` constructor callback (see §5 Layer D). The 13 existing `new StateManager(...)` call sites across 11 command files (`adopt.ts`, `complete.ts`, `dashboard.ts`, `info.ts`, `next.ts`, `reset.ts`, `rework.ts`, `run.ts`, `skip.ts`, `status.ts`, `wizard.ts`) continue to work because the callback is optional; when absent, `hasServices` defaults to `false`. Commands that would use the guard are updated to also pass a provider (typically `() => loadConfigIfExists(projectRoot)`).
- Tests: required per-module validator tests + parameterized harness; registry completeness test; `.strict()` extra-fields test on ServiceSchema; ProjectSchema-with-services tests; `--from` integration tests; state-migration dispatch tests; execution-guard tests (services-only AND services + root projectType); E2E normalized-object-equality smoke test using a nibble-shaped YAML (see §8 for the `expect(written).toEqual(ScaffoldConfigSchema.parse(input))` pattern — not raw input equality).
- README + CHANGELOG updates documenting `--from`, the `--from -` stdin convention, and the "configured but not yet executable" caveat for multi-service configs.

### Out of scope
- Multi-service `adopt` / detection of existing monorepo layout.
- `resolveOverlayState` changes (Wave 2).
- Per-service state splitting (Wave 3b; bumps `schema-version` to 3).
- **`services[].exports` field** — deferred to Wave 3c with its real semantics (see §11 D3).
- Config-version migration framework. `ScaffoldConfig.version` stays at literal `2`; Wave 3c will own any config-version bump if exports (or other new config fields) need to evolve.
- Validating that `path` exists on disk.
- Any new knowledge docs.

## 4. Decisions Locked

| # | Decision | Choice |
|---|----------|--------|
| Q1 | PR split | One atomic PR (schema + `--from` + state migration). |
| Q2 | `services.yml` shape | Full `ScaffoldConfig` (version, methodology, platforms, project with services). |
| Q3 | `--from` + other flags | Exclusive. Any config-setting flag combined with `--from` is a hard error. Operational flags (`--force`, `--root`, `--dry-run`, `--verbose`) are compatible. |
| Q4 | State migration scope | Framework + version reservation. 3a emits `2` with shape=v1; Wave 3b ships the real shape change at v3. |
| Q5 | Multi-service adopt | Deferred; `init --from` only. |
| Q6 | Coupling validation | Approach 3 — per-type validator modules under `src/config/validators/` with required per-module tests. |
| D3 | `services[].exports` | Deferred out of Wave 3a. Wave 3c owns the field + semantics. |

### Derived defaults

- **`name` field**: `z.string().min(1).regex(/^[a-z][a-z0-9-]*$/)` — kebab-case, starting with a letter. Service names flow into error paths now and will flow into filesystem paths / state keys in Wave 3b.
- **`path` field**: opaque string. No filesystem existence check, no containment check. Future Wave 3b+ work that *executes* under these paths must sanitize per Wave 0's `resolveContainedArtifactPath` pattern; flag in the plan.
- **`services.yml` location**: accept any path (absolute or relative to `cwd`). `-` reads stdin via `fs.readFileSync(0, 'utf-8')`; if stdin is a TTY, error out with a clear message (`--from - requires piped input`).
- **Empty `services: []`**: rejected via `.min(1)`. If the array is present, at least one service is required.
- **Duplicate `path` across services**: NOT validated in Wave 3a. Two services mapping to the same path is a future concern; flag for Wave 3b when paths become load-bearing.
- **D-BC — Root `projectType` requiredness unchanged**: today's schema has `projectType: z.optional()` and `project: {}` validates successfully. Wave 3a preserves this — we do NOT add a cross-field refinement requiring `projectType` when `services` is absent. The prior draft of this section introduced that rule; removing it preserves backward-compat for all existing configs.
- **YAML parser**: reuse existing `yaml` npm package (already a dep via the adopt command).
- **`formatZodError(error, { sourceLabel })`**: shared helper that flattens Zod issues into `<source>:<path>: <message>` lines. Consumed by Layer B tests and Layer C CLI error output.
- **Config `version` vs state `schema-version`**: two orthogonal axes. Config `version` is always `2` (pinned in `ConfigSchema`). State `schema-version` is `1` for single-service projects and `2` for multi-service projects under Wave 3a (same shape, different number). Wave 3b will bump state to `3` when the shape actually changes.

## 5. Architecture — Four Layers

### Layer A — Validator refactor (no behavior change)

Create `src/config/validators/` with one file per project type:

```
src/config/validators/
  backend.ts
  web-app.ts
  research.ts
  cli.ts
  library.ts
  mobile.ts
  data-pipeline.ts
  ml.ts
  game.ts
  browser-extension.ts
  index.ts  (registry array)
```

Each validator preserves the **current asymmetric rule**: a per-type config present without its matching `projectType` is an error; `projectType` set without its matching config is NOT an error (inherits today's behavior). Cross-field rules internal to a specific type (e.g., research's `notebook-driven + autonomous` forbidden combo) live inside the same per-type validator.

```ts
// src/config/validators/types.ts
import type { z } from 'zod'
import type { ProjectType } from '../../types/config.js'

export interface CouplingValidator<T> {
  readonly configKey: string                 // e.g. 'backendConfig'
  readonly projectType: ProjectType          // e.g. 'backend'
  validate(
    ctx: z.RefinementCtx,
    path: (string | number)[],
    projectType: ProjectType | undefined,
    config: T | undefined,
  ): void
}

// src/config/validators/backend.ts
export const backendCouplingValidator: CouplingValidator<BackendConfig> = {
  configKey: 'backendConfig',
  projectType: 'backend',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'backend') {
      ctx.addIssue({
        path: [...path, 'backendConfig'],
        code: 'custom',
        message: 'backendConfig requires projectType: backend',
      })
    }
    // No forward-direction check (preserves today's behavior).
    // Intra-backend cross-field rules (if any) go here.
  },
}

// src/config/validators/index.ts
export const ALL_COUPLING_VALIDATORS: readonly CouplingValidator<unknown>[] = [
  backendCouplingValidator,
  webAppCouplingValidator,
  researchCouplingValidator,
  cliCouplingValidator,
  libraryCouplingValidator,
  mobileAppCouplingValidator,
  dataPipelineCouplingValidator,
  mlCouplingValidator,
  gameCouplingValidator,
  browserExtensionCouplingValidator,
] as const

// Derived canonical mapping used by ServiceSchema.superRefine's forward-
// direction check. Do NOT hand-roll a second switch — it will drift from
// the registry.
export const PROJECT_TYPE_TO_CONFIG_KEY: Readonly<Record<ProjectType, string>> =
  Object.freeze(Object.fromEntries(
    ALL_COUPLING_VALIDATORS.map(v => [v.projectType, v.configKey]),
  )) as Readonly<Record<ProjectType, string>>

export function configKeyFor(projectType: ProjectType): string {
  return PROJECT_TYPE_TO_CONFIG_KEY[projectType]
}
```

The canonical `ProjectType → configKey` table that must stay in lockstep across the validator registry, `ServiceConfig` interface, and `ServiceSchema` fields:

| `projectType` value | Per-type config key |
|---------------------|---------------------|
| `backend` | `backendConfig` |
| `web-app` | `webAppConfig` |
| `cli` | `cliConfig` |
| `library` | `libraryConfig` |
| `mobile-app` | `mobileAppConfig` |
| `data-pipeline` | `dataPipelineConfig` |
| `ml` | `mlConfig` |
| `game` | `gameConfig` |
| `browser-extension` | `browserExtensionConfig` |
| `research` | `researchConfig` |

A registry-completeness test (§8) asserts `ALL_COUPLING_VALIDATORS.length === PROJECT_TYPES.length` and every `ProjectType` literal appears exactly once as a `validator.projectType`. Adding an 11th project type without a validator becomes a test failure.

`ProjectSchema.superRefine()` becomes a loop:

```ts
ProjectSchema.superRefine((data, ctx) => {
  for (const v of ALL_COUPLING_VALIDATORS) {
    v.validate(ctx, [], data.projectType, data[v.configKey as keyof typeof data])
  }
  // Any non-per-type cross-field rules stay inline here.
})
```

`ServiceSchema.superRefine()` uses the same validators with path `['services', index]`.

**Behavior preserved**: the refactor runs under the existing `src/config/schema.test.ts` suite before any Layer B code is added. A green suite at the end of Layer A's commit = refactor is behavior-preserving.

### Layer B — Schema extension

```ts
// src/config/schema.ts

export const ServiceSchema = z.object({
  name: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/),
  description: z.string().optional(),
  projectType: ProjectTypeSchema,                 // required on services (stricter than root)
  backendConfig: BackendConfigSchema.optional(),
  webAppConfig: WebAppConfigSchema.optional(),
  researchConfig: ResearchConfigSchema.optional(),
  libraryConfig: LibraryConfigSchema.optional(),
  cliConfig: CliConfigSchema.optional(),
  mobileAppConfig: MobileAppConfigSchema.optional(),
  dataPipelineConfig: DataPipelineConfigSchema.optional(),
  mlConfig: MlConfigSchema.optional(),
  gameConfig: GameConfigSchema.optional(),
  browserExtensionConfig: BrowserExtensionConfigSchema.optional(),
  path: z.string().optional(),
  // NOTE: no `exports` field in Wave 3a — deferred to Wave 3c (§11 D3).
}).strict().superRefine((svc, ctx) => {
  // Shared per-type coupling (Layer A): config → projectType direction.
  // Any config whose key is set must match the service's projectType.
  for (const v of ALL_COUPLING_VALIDATORS) {
    v.validate(ctx, [], svc.projectType, svc[v.configKey as keyof typeof svc])
  }
  // Stricter-than-root, ServiceSchema-only: projectType → config direction.
  // Every service has a concrete projectType; we require the matching config.
  const expectedKey = configKeyFor(svc.projectType)
  if ((svc as Record<string, unknown>)[expectedKey] === undefined) {
    ctx.addIssue({
      path: [expectedKey],
      code: 'custom',
      message: `${svc.projectType} service "${svc.name}" requires ${expectedKey}`,
    })
  }
})
```

**Multi-issue emission**: a single malformed service can emit multiple Zod issues. Example: `{ projectType: 'web-app', backendConfig: {...} }` triggers both (a) the shared validator's "backendConfig requires projectType: backend" and (b) the forward rule's "web-app service requires webAppConfig". This is correct — each issue is a distinct fact — and tests must assert both issues land in the error set (no deduplication).

**`.strict()` vs `ProjectSchema.passthrough()` (ADR-033)**: services are hand-authored in YAML by the user; typos should surface loudly. Root `ProjectConfig` uses `.passthrough()` for forward-compat across scaffold versions; services should not. This is a deliberate departure; note it in CHANGELOG.

In `ProjectSchema`, after existing fields:

```ts
services: z.array(ServiceSchema).min(1).optional(),
```

Cross-field refinements on `ProjectSchema.superRefine()`:

```ts
// Unique service names
if (data.services) {
  const names = data.services.map(s => s.name)
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
  if (dupes.length > 0) {
    ctx.addIssue({ path: ['services'], code: 'custom',
      message: `Duplicate service names: ${dupes.join(', ')}` })
  }
}

// NOTE: root projectType requiredness is unchanged from today — see §4 D-BC.
// If both are absent, that's valid today and remains so.
```

**`src/types/config.ts` update**: mirror the Zod additions in the manual types:

```ts
export interface ServiceConfig {
  name: string
  description?: string
  projectType: ProjectType
  backendConfig?: BackendConfig
  webAppConfig?: WebAppConfig
  researchConfig?: ResearchConfig
  libraryConfig?: LibraryConfig
  cliConfig?: CliConfig
  mobileAppConfig?: MobileAppConfig
  dataPipelineConfig?: DataPipelineConfig
  mlConfig?: MlConfig
  gameConfig?: GameConfig
  browserExtensionConfig?: BrowserExtensionConfig
  path?: string
  // No `exports` field — Wave 3c.
}

export interface ProjectConfig {
  projectType?: ProjectType
  // ... existing per-type configs ...
  services?: ServiceConfig[]
}
```

**`exports` intentionally omitted**: the source spec reserves `services[].exports` for cross-service artifact reads in Wave 3c. Wave 3a does NOT ship it. Reasoning: `exports` lives in `config.yml` (not state), so a state-version bump cannot migrate existing manifests if Wave 3c needs a different shape later. Rather than freeze `{ step: string }` on speculation, Wave 3c adds the field alongside its real semantics and any config-version bump it needs. (See §11 D3.)

### Layer C — `--from` declarative init

**Why the seam change**: today's `runWizard()` owns not just question-asking but also `.scaffold.backup` creation on `--force`, `writeConfig()`, `stateManager.initializeState()`, and decisions-log priming. Extracting a post-wizard helper from `init.ts` would leave those steps duplicated or skipped. Wave 3a splits the wizard:

```ts
// src/wizard/wizard.ts

export async function collectWizardAnswers(
  options: WizardOptions,
): Promise<ScaffoldConfig> {
  // Interactive prompts + flag-family validation + build ScaffoldConfig.
  // No filesystem writes, no state init, no backup.
}

interface MaterializeOptions {
  projectRoot: string
  force: boolean
  // Preserved across backup + reinit. If omitted, StateManager starts fresh.
  // For `--from`: read + preserve old state.json exactly like the wizard path does.
  oldState?: PipelineState
  // Reserved for future paths that need to differentiate; not used in Wave 3a.
  // Both wizard and --from currently prime decisions.jsonl as empty.
}

export async function materializeScaffoldProject(
  config: ScaffoldConfig,
  options: MaterializeOptions,
): Promise<void> {
  // 1. If force + existing .scaffold — read oldState first (if not supplied), then back up to .scaffold.backup.<ts>.
  // 2. Write .scaffold/config.yml.
  // 3. initializeState(config, oldState) — StateManager computes hasServices from config;
  //    emits schema-version 2 when services?.length > 0, else 1.
  // 4. Prime decisions.jsonl as empty (current behavior for both paths — wizard.ts:234-237).
  //    Wave 3a does NOT change decisions-priming semantics.
  // Caller runs build + skill sync; those are downstream of this function.
}

export async function runWizard(options: WizardOptions): Promise<WizardResult> {
  const config = await collectWizardAnswers(options)
  const oldState = readOldStateIfExists(options.projectRoot)  // preserved from current wizard.ts:104
  await materializeScaffoldProject(config, {
    projectRoot: options.projectRoot,
    force: options.force,
    oldState,
  })
  return buildWizardResult(options.projectRoot, config)   // keeps existing WizardResult shape
}
```

`init --from` calls `materializeScaffoldProject()` directly after validating the YAML, passing `oldState: readOldStateIfExists(projectRoot)` so it inherits the same state-preservation behavior the wizard path has on `--force`. After the materializer returns, both paths fall through to the **same shared post-materialize block** in `init.ts` (the existing `runBuild` + `syncSkillsIfNeeded` call at init.ts:594/614). No duplication.

**`initializeState()` signature**: widened to take the full parsed config (`initializeState(config, oldState)`). StateManager reads `config.project?.services?.length` internally — no separate config-provider callback needed for the init path, because the config is already in hand. The config-provider callback on `StateManager`'s constructor (§5 Layer D) is used for the `loadState()` path, where the caller may or may not have the config immediately.

**`decisions.jsonl` priming**: today wizard.ts:234-237 writes an empty `decisions.jsonl`. Wave 3a keeps that behavior unchanged for both paths. The materializer does not prime with a methodology record; earlier rev said "wizard primes with methodology" in error. Tests for both paths assert an empty decisions file.

**Builder-layer exclusivity**: yargs `.check()` runs before the handler, so conflict detection must be in the builder. Use `.check()` with a list derived from the existing flag-family constants:

```ts
// src/cli/commands/init.ts

// Today's init flags (verified against src/cli/commands/init.ts L100-280).
// Operational (do not set config content): --root, --force, --auto, --verbose, --format.
// Config-setting: the rest.
const CONFIG_SETTING_FLAGS: readonly string[] = [
  'methodology', 'depth', 'adapters', 'traits', 'project-type', 'idea',
  ...GAME_FLAGS, ...WEB_FLAGS, ...BACKEND_FLAGS, ...CLI_FLAGS,
  ...LIB_FLAGS, ...MOBILE_FLAGS, ...PIPELINE_FLAGS, ...ML_FLAGS,
  ...EXT_FLAGS, ...RESEARCH_FLAGS,
]

// Builder:
yargs
  .option('from', {
    type: 'string',
    describe: 'Path to a services.yml ScaffoldConfig file, or "-" for stdin. Exclusive with config-setting flags.',
  })
  .check(argv => {
    if (argv.from === undefined) return true
    const conflicts = CONFIG_SETTING_FLAGS.filter(f => argv[f] !== undefined)
    if (conflicts.length > 0) {
      throw new Error(`--from cannot be combined with: ${conflicts.map(f => '--' + f).join(', ')}. Edit services.yml and re-run.`)
    }
    return true
  })
```

**Operational-flag classification** (not in conflict list): `--root`, `--force`, `--auto`, `--verbose`, `--format`. The existing `--idea` is config-setting (feeds methodology suggestion) and IS in the conflict list. `--dry-run` does NOT exist on `init` today; earlier rev incorrectly listed it.

**Flag-universe linter test**: iterate the yargs builder's option registry at runtime; assert every option is classified either as operational (allowlist) or as a member of `CONFIG_SETTING_FLAGS`. A new flag that's neither fails the test.

**Canonicalization**: `CONFIG_SETTING_FLAGS` entries are canonical option keys (e.g. `backend-api-style`). yargs normalizes aliases before `.check()` fires, so alias-form inputs land on the canonical key. Tests parameterize over canonical keys only.

**Handler logic and error plumbing**:

`runCli()` does not install a top-level yargs `.fail()` handler today. The builder-level `.check()` throws are surfaced via yargs default error handling, which `init` must normalize to the "exit 2 + clean diagnostic" contract. Wave 3a handles this at the init-handler layer (not yargs-global), so no global behavior changes:

```ts
// init.ts handler, near the top:
try {
  // ... normal init logic ...
  if (argv.from !== undefined) {
    const raw = argv.from === '-'
      ? readStdinOrError()
      : fs.readFileSync(path.resolve(process.cwd(), argv.from), 'utf-8')
    const parsed = parseYaml(raw)                                 // InvalidYamlError on failure
    const result = ScaffoldConfigSchema.safeParse(parsed)
    if (!result.success) {
      throw new InvalidConfigError(
        formatZodError(result.error, { sourceLabel: argv.from === '-' ? '<stdin>' : argv.from }),
      )
    }
    await materializeScaffoldProject(result.data, {
      projectRoot: argv.root ?? process.cwd(),
      force: argv.force,
    })
    // fall through to shared post-materialize block (build + skill sync)
  } else {
    // existing wizard path — same shared post-materialize block runs after
  }
} catch (err) {
  if (isScaffoldUserError(err)) {  // InvalidYaml, InvalidConfig, FlagConflict, TTYStdin, etc.
    output.error(err.message)
    process.exitCode = 2
    return
  }
  throw err  // unexpected — let runCli's default handler surface it
}
```

The **builder-level `.check()`** for flag conflicts throws a standard `Error`. yargs re-throws it up to the handler invocation. The handler's outer catch normalizes it by checking for a tagged `FlagConflictError` class (thrown from `.check()`) and mapping to exit 2.

Explicit list of error classes introduced by Wave 3a (all tagged as user-facing):
- `FlagConflictError` (builder `.check()` — `--from + config-setting flag`)
- `InvalidYamlError` (YAML parse)
- `InvalidConfigError` (Zod validation)
- `FromPathReadError` (ENOENT, EACCES, etc.)
- `TTYStdinError` (`--from -` with no pipe)

All extend a shared `ScaffoldUserError` base so `isScaffoldUserError()` pattern-matches them. Reused by the multi-service execution guard's `MultiServiceNotSupportedError`.

Tests (in §8) verify `process.exitCode === 2` and stderr contains the expected diagnostic for each error class.

**`readStdinOrError()` semantics**: synchronous `fs.readFileSync(0, 'utf-8')`. Blocks until EOF. If `process.stdin.isTTY` is true (no pipe), throws `--from - requires piped input`. Any read error wraps as `--from - read failed: <errno>`. No timeout — if you hand it a stalled pipe, it waits forever, same as `cat`.

### Layer D — State migration dispatch framework

**Error helper widens first** (`src/utils/errors.ts`):

```ts
// Before:
export function stateSchemaVersion(expected: number, actual: number, file: string): ScaffoldError

// After:
export function stateSchemaVersion(
  expected: number | readonly number[],
  actual: number,
  file: string,
): ScaffoldError
```

All existing call sites pass `1`; the new `loadState()` path passes `[1, 2]`. Formatting in the error message handles both branches.

**Type widens** (`src/types/state.ts`): `'schema-version': 1` → `'schema-version': 1 | 2`.

**Dispatch module** (`src/state/state-migrations.ts`, new). Renamed from "migrate to current version" so the validation contract is unambiguous — this function dispatches version handling and may mutate; Zod validation is the caller's job:

```ts
export interface MigrationContext { readonly hasServices: boolean }

/**
 * Dispatches per-version handling on raw state JSON.
 * - Rejects unknown versions.
 * - Bumps v1 → v2 in-place when the companion config has services[].
 * - Does NOT run Zod validation on the full shape; the caller validates
 *   after this returns.
 * - Mutates the input object; caller may rely on that side-effect.
 */
export function dispatchStateMigration(
  raw: unknown,
  ctx: MigrationContext,
  file: string,
): asserts raw is { 'schema-version': 1 | 2 } & Record<string, unknown> {
  if (!isPlainObject(raw) || typeof raw['schema-version'] !== 'number') {
    throw stateSchemaVersion([1, 2], raw?.['schema-version'] as number, file)
  }
  const version = raw['schema-version']
  if (version !== 1 && version !== 2) {
    throw stateSchemaVersion([1, 2], version, file)
  }
  if (version === 1 && ctx.hasServices) {
    // v1 → v2: shape unchanged; version bump signals "config has services[]".
    // Wave 3b will change the shape and bump to v3.
    (raw as Record<string, unknown>)['schema-version'] = 2
  }
}
```

Signature is an `asserts` TypeScript function: after it returns, the caller's typed reference to `raw` narrows to `{ 'schema-version': 1 | 2 }`.

**`StateManager` config dependency (Codex P2-1)**: `StateManager` currently has signature `new StateManager(projectRoot, computeEligible)`. Wave 3a adds a **config provider callback** rather than passing the config directly, so StateManager's lazy-loading behavior is preserved:

```ts
// src/state/state-manager.ts
constructor(
  projectRoot: string,
  computeEligible: ComputeEligibleFn,
  configProvider?: () => ScaffoldConfig | undefined,
) { ... }

loadState(): PipelineState {
  const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'))
  const config = this.configProvider?.()
  const ctx: MigrationContext = {
    hasServices: (config?.project?.services?.length ?? 0) > 0,
  }
  dispatchStateMigration(raw, ctx, this.statePath)
  // Wave 3a keeps today's permissive load semantics — no full-shape Zod
  // validation runs in loadState(). The existing separate surface
  // `src/validation/state-validator.ts` (invoked from the standalone
  // `scaffold validate` command) is the only code that does full-shape
  // validation today; that validator widens its version check to accept
  // 1|2 in Wave 3a but is otherwise unchanged.
  return raw as PipelineState
}
```

The two existing call sites that instantiate `StateManager` (init.ts, and wherever run.ts loads state) are updated to pass a `() => loadConfig()` provider. If no provider is passed (tests, legacy callers), `hasServices` defaults to `false`. This minimizes blast radius — old call sites keep working.

**`src/validation/state-validator.ts`**: the second independent `schema-version !== 1` check widens to accept `1 | 2`. Same widening pattern as the loader.

**`initializeState()` signature** (called from Layer C's materializer): widened to take the full parsed config (and an optional `oldState` for `--force` preservation). Emits `schema-version: 2` when `config.project?.services?.length > 0`, `1` otherwise. Persists immediately. Distinct from the `configProvider` constructor param above, which serves the `loadState()` path where the config may need to be lazily fetched.

**Hand-edit trigger**: if a user hand-edits `.scaffold/config.yml` to add `services[]` and runs a command that calls `loadState()`, the dispatch runs in-memory and the version is persisted on the next state write. This is the one supported hand-edit flow; it's exercised by a state-migration dispatch test.

## 6. CLI UX Example (nibble)

```bash
cat > services.yml <<EOF
version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: strategy-evaluator
      projectType: library
      libraryConfig: { visibility: internal, documentationLevel: api-docs }
      path: shared/strategy_evaluator
    - name: research-engine
      projectType: backend
      backendConfig:
        apiStyle: rest
        dataStore: [relational]
        authMechanism: apikey
        asyncMessaging: none
        deployTarget: container
        domain: fintech
      path: services/research
    # ... etc
EOF

scaffold init --from services.yml --force

# Results:
#   .scaffold/config.yml  — canonical-YAML round-trip of services.yml
#   .scaffold/state.json  — "schema-version": 2
#   .scaffold/decisions.jsonl — empty
#   .claude/skills/       — synced
#   build output           — same as wizard path
```

Conflict case:

```bash
scaffold init --from services.yml --methodology mvp
# Error: --from cannot be combined with: --methodology. Edit services.yml and re-run.
# Exit code: 2
```

Stdin without piped input:

```bash
scaffold init --from -
# Error: --from - requires piped input (stdin is a TTY).
# Exit code: 2
```

Multi-service run attempt (expected to fail in Wave 3a):

```bash
scaffold run create-prd
# Error: multi-service projects are not yet executable. Multi-service pipeline
# lands in Wave 2.
# Exit code: 2
```

## 7. Validation and Error Handling

- **YAML parse error**: `Invalid YAML in <source>: <message>` with line/column from parser. Exit 2.
- **Zod validation error**: flatten via `formatZodError`; format `<source>: <path>: <message>` per line. Exit 2.
- **Path resolution error** (`--from <file>` missing): `Cannot read --from path "<arg>": <errno>`. Exit 2.
- **TTY on stdin (`--from -`)**: `--from - requires piped input`. Exit 2.
- **Conflicting flags**: listed by name. Exit 2.
- **Existing `.scaffold/config.yml` without `--force`**: existing init error, unchanged.
- **`scaffold run` on multi-service config**: `multi-service projects are not yet executable` (preview of Wave 2). Exit 2.

## 8. Test Strategy

| Area | Tests |
|------|-------|
| Per-type validator (Layer A) — **required** | Parameterized harness `src/config/validators/validators.test.ts` iterates `ALL_COUPLING_VALIDATORS` and for each runs: happy path (matching config + projectType), coupling violation (config set without matching projectType → exactly one issue at `[validator.configKey]`), absent-config no-op (projectType set without config → zero issues, preserves current asymmetric behavior). Plus bespoke `src/config/validators/research.test.ts` for research's intra-type cross-field rules (notebook-driven + autonomous forbidden, library visibility + API exposure, etc.). Approach 3 is justified by (a) the parameterized harness being short, (b) the registry-completeness test below, and (c) each validator module being the natural home for future intra-type rules (library, ml, web-app all have some). |
| Validator registry completeness | `ALL_COUPLING_VALIDATORS.length === PROJECT_TYPES.length`. `new Set(ALL_COUPLING_VALIDATORS.map(v => v.projectType))` equals the `ProjectType` literal union set. Adding an 11th `ProjectType` without a matching validator fails this test. |
| `ProjectSchema.superRefine` | Existing `src/config/schema.test.ts` suite remains green — Layer A refactor is behavior-preserving. |
| `ServiceSchema` | Happy path per project type (loop over types). Config → projectType violation (from shared validator). ProjectType → matching-config violation (ServiceSchema-only). **Multi-issue case**: a service with `projectType: 'web-app'` and `backendConfig: {...}` produces BOTH the "backendConfig requires projectType: backend" and "web-app service requires webAppConfig" issues — test asserts both appear. Unknown `projectType` rejected. `name` regex violations (whitespace, uppercase, dot, leading digit). Duplicate fields. **`.strict()` test**: a service with `extraField: 'x'` fails with a Zod issue where `code === 'unrecognized_keys'` and `issue.keys` contains `'extraField'`. (Zod's path for `unrecognized_keys` points at the parent object, not the unknown key; assert on `keys`, not `path`.) |
| Cross-field refinements (root) | `services` with duplicate names → issue. `services[]` present and root `projectType` also present → valid (per D-BC). Neither present → valid (per D-BC). Empty `services: []` → invalid via `.min(1)`. |
| `src/types/config.ts` | Type-check only: `const s: ServiceConfig = { ... all 10 configs optional ... }` compiles; `ProjectConfig.services` is typed as `ServiceConfig[]`. No runtime test. |
| Builder exclusivity (Layer C) | Parameterized test over every `CONFIG_SETTING_FLAGS` entry — `--from + --<flag>` combos rejected at `.check()` time with an error naming the conflicting flag. Flag-universe linter test: iterate the yargs builder's canonical option keys; assert every option is either in the operational allowlist (`root, force, auto, verbose, format, help, version, from`) or in `CONFIG_SETTING_FLAGS`. New unclassified flag fails the test. |
| `--from` CLI | Valid YAML file → writes config + runs full init. Stdin `-` piped → reads stdin. Stdin `-` TTY → errors with the TTY message. Invalid YAML → formatted error + exit 2. Invalid schema (e.g. `backendConfig` without `projectType: backend`) → formatted error + exit 2. Missing file → error + exit 2. Existing config without `--force` → error. Existing config with `--force` → overwrites, previous `.scaffold/` backed up to `.scaffold.backup.<ts>`, full materialize runs. |
| Wizard seam split | `collectWizardAnswers` + `materializeScaffoldProject` round-trip: call the collector with mocked prompts, pass result to materializer, assert `.scaffold/config.yml` + state.json + empty `decisions.jsonl` land. Both init paths produce an empty `decisions.jsonl` (current behavior preserved). `--force` backup behavior identical across both paths (backup dir timestamped; old `state.json` preserved when present). |
| Multi-service execution guard | Parameterized test over every affected command (`run`, `next`, `complete`, `skip`, `status`, `rework`, `reset`, `info`, `dashboard`). For each: `<command>` with `project.services: [...]` only → exit 2 with "lands in Wave 2"; `<command>` with BOTH `project.services: [...]` AND `project.projectType: 'backend'` → same exit 2 (silent-ignore prevented); `<command>` on a single-service config with no services[] → runs as today (regression guard). A linter-style test asserts every command that instantiates `StateManager` (enumerated via grep or a test helper) also calls `assertSingleServiceOrExit()`. |
| State migration dispatch | v1 state + single-service config (no services[]) → loads as v1 unchanged. v1 state + config with `services[]` → bumped to v2 in memory; persisted on next write. v2 state + any config → loads as v2 unchanged. Unknown version `99` → error. Missing `schema-version` → error. Non-object raw → error. |
| E2E (smoke) | Run `init --from` with a nibble-shaped 5-service YAML against a tmpdir. Parse input YAML; call `ScaffoldConfigSchema.parse(input)` to get the normalized object (Zod defaults filled in per-type configs). Parse the written `.scaffold/config.yml`. Assert `expect(parsedWritten).toEqual(normalizedInput)` — deep structural equality, not byte-identity. Assert `.scaffold/state.json` has `"schema-version": 2` and the usual single-service state keys. Assert `.claude/skills/` exists. Assert `scaffold run <step>` on this project fails with the Wave-2 guard message. |

## 9. LOC / Complexity Estimate

| Component | Prod LOC | Test LOC |
|-----------|----------|----------|
| Layer A — validator registry + 10 modules + helper exports (`configKeyFor`, `PROJECT_TYPE_TO_CONFIG_KEY`) | ~190 | ~120 (parameterized harness + research bespoke + registry completeness) |
| Layer B — ServiceSchema + ProjectSchema.services + refinements + types/config.ts | ~85 (exports dropped) | ~130 (adds multi-issue + strict-fields + name-regex cases) |
| Layer C — wizard-seam split (`collectWizardAnswers` / `materializeScaffoldProject`) + `--from` handler + builder exclusivity | ~140 | ~110 (parameterized conflict test + flag-universe linter + seam round-trip) |
| Layer D — dispatch module + StateManager config-provider + `stateSchemaVersion` widening | ~50 | ~35 |
| Multi-service execution guard (`src/cli/guards.ts` + 9 command handler updates) | ~45 | ~90 |
| CLI help / error messages / README / CHANGELOG | ~25 | — |
| Error classes (`FlagConflictError`, `InvalidYamlError`, `InvalidConfigError`, `FromPathReadError`, `TTYStdinError`, `MultiServiceNotSupportedError`, `ScaffoldUserError` base + `isScaffoldUserError`) | ~40 | ~20 |
| **Total** | **~575** | **~530** |

Up from spec's ~120–160 prod + ~100–150 test. The expansion is driven by:
- Required per-module validator tests + parameterized harness (~120 vs ~60 in prior draft).
- Wizard-seam split (~40 prod + ~30 test) — prevents the "init --from is half-an-init" bug class Codex flagged.
- Execution guard (~40 total) — prevents silent-ignore of `services[]` when root `projectType` is also set.
- Explicit registry completeness + flag-universe linter — these are the tests that make Approach 3 genuinely pay for itself.

## 10. Sequencing

1. **Layer A** (validator refactor). Ships registry + 10 modules + parameterized harness + registry-completeness test + research bespoke test. Behavior-preserving against existing `src/config/schema.test.ts`. Green suite = refactor is sound.
2. **Layer B** (schema). Adds `ServiceSchema`, `ProjectSchema.services`, `src/types/config.ts` updates, unique-name refinement, multi-issue + strict-fields + name-regex tests.
3. **Layer C** (wizard-seam split + `--from`). Split `runWizard()` into `collectWizardAnswers()` + `materializeScaffoldProject()`. Wire wizard path through the split. Add `--from` handler calling `materializeScaffoldProject()` directly. Builder-level `.check()` for flag exclusivity. Flag-universe linter test.
4. **Layer D** (state). Widen `stateSchemaVersion` helper; widen `'schema-version'` type; add `dispatchStateMigration`; thread config provider through `StateManager`; widen `state-validator.ts`.
5. **Multi-service execution guard**. Add `src/cli/guards.ts` with `assertSingleServiceOrExit(config, { commandName })`. Call the guard from the top of every stateful command handler: `run`, `next`, `complete`, `skip`, `status`, `rework`, `reset`, `info`, `dashboard`. Test both services-only and services + root projectType configurations across every command (parameterized). Add linter test that asserts every `StateManager`-using command calls the guard.
6. README + CHANGELOG. Mention: `--from`, the `init --from -` stdin convention, the "multi-service is configured but not executable" caveat.
7. Each layer is a separate commit; PR is squash-merged.

## 11. Known Non-Goals for Review Reopening

- **D3 — `services[].exports` deferred to Wave 3c**. `exports` lives in `config.yml`, so a state-version bump can't migrate it. Rather than freeze `{ step: string }` speculatively, Wave 3c adds the field alongside its real semantics and any config-version bump it needs.
- **`services[].path` traversal safety**: opaque strings today; Wave 3b (which first *executes* inside these paths) owns the traversal-safety requirement. Plan calls this out explicitly so the Wave 3b author can apply Wave 0's `resolveContainedArtifactPath` pattern.
- **Version number re-use**: state `schema-version: 2` in Wave 3a and `3` in Wave 3b is deliberate. Each number maps to exactly one shape.
- **Multi-service execution**: explicitly blocked with a helpful error in Wave 3a (§5 / §7 / §10 step 5).

## 12. Review History

- **Round 1** (2026-04-15): Multi-model review (Codex + Gemini + superpowers:code-reviewer). 24 findings total (2 P0, 12 P1, 8 P2, 2 P3). User decisions: D1 Path B (keep Approach 3 + require per-module tests); D2 Path B.ii (3a emits v2 shape=v1; 3b bumps to v3). All other findings applied inline to rev 2.
- **Round 2** (2026-04-15): Codex + superpowers:code-reviewer (Gemini timed out, same as Round 1). All 19 rev-1 findings confirmed resolved. Codex flagged 3 new P1s: (a) `completeInit` at the wrong seam — wizard owns materialization, so split `runWizard()` into collect+materialize instead; (b) execution guard must reject `services[] + root projectType` configs too, not just services-only; (c) `services[].exports` frozen on speculation — dropped (D3). Claude flagged 4 remaining ambiguities (`configKeyFor` undefined, multi-issue emission note, migration function validation contract, `stateSchemaVersion` helper signature). All applied to rev 3 editorially.
- **Round 3** (2026-04-15): superpowers:code-reviewer confirmed all round-2 findings resolved; verified the wizard-seam split is feasible against current `src/wizard/wizard.ts`. Flagged 4 small editorial items (MaterializeOptions shape, initializeState signature, decisions-priming semantics reconciled with current behavior, WizardResult return-shape pseudocode). All applied inline.
- **Round 3 (Codex)** (2026-04-15): Codex flagged 2 real P1s + 3 P2s + 1 P3. Scope corrections applied to rev 4 (this rev): (a) execution guard must hit all 9 stateful commands, not just `run.ts` — single shared `assertSingleServiceOrExit()` helper + linter test; (b) error plumbing explicit (`ScaffoldUserError` base + tagged subclasses + `isScaffoldUserError`, handler-level catch mapping to exit 2); (c) Layer C scope clarity — build+skill sync explicitly stay at init.ts, materializer does not own them; (d) `validateStateShape` reference dropped (no such function today; `loadState()` keeps permissive semantics); (e) `.strict()` test assertion corrected to check `code === 'unrecognized_keys'` and `issue.keys`, not `path`. Codex re-flagged Approach 3 as YAGNI (P2); user decision stands — not reopened.

**Rev 4 status**: ready for writing-plans handoff. Remaining Approach 3 pushback is a logged-but-overridden user decision.
