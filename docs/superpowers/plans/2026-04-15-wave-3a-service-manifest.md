# Multi-Service Evolution — Wave 3a (Service Manifest) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `services[]` array to `ScaffoldConfig.project`, ship `scaffold init --from <services.yml>` declarative init, split `runWizard()` into `collectWizardAnswers + materializeScaffoldProject`, widen the state schema-version framework (1 | 2) without changing v2's shape, and install a multi-service execution guard across all stateful CLI commands.

**Architecture:** Four layers landed sequentially (A → B → D → C → guard → docs). Layer A refactors the existing type-config coupling validation into per-type modules under `src/config/validators/` so both `ProjectSchema` and the new `ServiceSchema` share rules. Layer B adds the service schema, `services` field, and manual type updates. Layer D widens the state `schema-version` type to `1 | 2` and adds a dispatch module — v2's shape equals v1's for Wave 3a; Wave 3b owns the real shape change at v3. Layer C splits the wizard's monolithic `runWizard()` into a collector and a materializer, then wires `--from` to call the materializer directly. A multi-service execution guard added to 9 stateful CLI commands prevents silent-ignore of `services[]` before Wave 2 ships real multi-service execution. All changes land atomically in one PR.

**Tech Stack:** TypeScript, Zod schemas, yargs CLI, vitest (one new E2E test).

**Source spec:** `docs/superpowers/specs/2026-04-15-wave-3a-service-manifest-design.md` (rev 4, reviewed over 3 rounds).

**Atomicity:** The full PR must land all layers together. Within the PR, commits are sequenced so each task-bounded commit leaves `make check-all` green.

---

## File Structure

### Created

- `src/config/validators/types.ts` — `CouplingValidator<T>` interface shared by all 10 modules.
- `src/config/validators/backend.ts` — backend coupling rule.
- `src/config/validators/web-app.ts`
- `src/config/validators/research.ts` — includes intra-type cross-field rules (notebook-driven + autonomous forbidden, etc. — extracted from current `ProjectSchema.superRefine`).
- `src/config/validators/cli.ts`
- `src/config/validators/library.ts` — includes library-specific coupling rules if any.
- `src/config/validators/mobile-app.ts`
- `src/config/validators/data-pipeline.ts`
- `src/config/validators/ml.ts`
- `src/config/validators/game.ts`
- `src/config/validators/browser-extension.ts`
- `src/config/validators/index.ts` — registry (`ALL_COUPLING_VALIDATORS`, `PROJECT_TYPE_TO_CONFIG_KEY`, `configKeyFor`).
- `src/config/validators/validators.test.ts` — parameterized harness.
- `src/config/validators/registry.test.ts` — registry completeness test.
- `src/config/validators/research.test.ts` — bespoke intra-type test.
- `src/state/state-version-dispatch.ts` — `dispatchStateMigration` function + `MigrationContext` type.
- `src/state/state-version-dispatch.test.ts`
- `src/cli/guards.ts` — `assertSingleServiceOrExit` + `MultiServiceNotSupportedError`.
- `src/cli/guards.test.ts`
- `src/utils/user-errors.ts` — `ScaffoldUserError` base + tagged subclasses (`FlagConflictError`, `InvalidYamlError`, `InvalidConfigError`, `FromPathReadError`, `TTYStdinError`) + `isScaffoldUserError`.
- `src/utils/user-errors.test.ts`
- `src/cli/commands/init-from.test.ts` — `--from` integration test suite.
- `src/e2e/service-manifest.test.ts` — nibble-shape E2E smoke test.

### Modified

- `src/config/schema.ts` — add `ServiceSchema`, add `services` field to `ProjectSchema`, replace inline `superRefine` body with validator-registry loop, add unique-names refinement, preserve existing cross-field rules not per-type.
- `src/config/schema.test.ts` — add `ServiceSchema` tests, `services` refinement tests. Existing tests stay green (refactor is behavior-preserving).
- `src/types/config.ts` — add `ServiceConfig` interface; add `services?: ServiceConfig[]` on `ProjectConfig`.
- `src/types/state.ts` — widen `'schema-version': 1` literal to `'schema-version': 1 | 2`.
- `src/state/state-manager.ts` — add optional `configProvider` constructor param; call `dispatchStateMigration` in `loadState()` after JSON parse and before schema-version check; widen signature of `initializeState()` to take config.
- `src/validation/state-validator.ts` — widen `schemaVersion !== 1` guard to `schemaVersion !== 1 && schemaVersion !== 2`.
- `src/utils/errors.ts` — widen `stateSchemaVersion`'s `expected` parameter to `number | readonly number[]`.
- `src/wizard/wizard.ts` — split `runWizard` into `collectWizardAnswers` + `materializeScaffoldProject`; export both. `runWizard` becomes a thin composition of the two.
- `src/cli/commands/init.ts` — declare `--from` option + builder `.check()` for flag exclusivity; wire `--from` handler via `materializeScaffoldProject`; wrap handler in `try/catch` that maps `ScaffoldUserError` subclasses to exit 2.
- `src/cli/commands/run.ts` — call `assertSingleServiceOrExit` at handler entry.
- `src/cli/commands/next.ts` — same guard.
- `src/cli/commands/complete.ts` — same guard.
- `src/cli/commands/skip.ts` — same guard.
- `src/cli/commands/status.ts` — same guard.
- `src/cli/commands/rework.ts` — same guard.
- `src/cli/commands/reset.ts` — same guard.
- `src/cli/commands/info.ts` — same guard.
- `src/cli/commands/dashboard.ts` — same guard.
- `README.md` — add `--backend-domain`-style row for `--from`; document multi-service caveat.
- `CHANGELOG.md` — Unreleased entry.

### Test-only touches

- `src/config/schema.test.ts` — add ServiceSchema + refinement tests; bump any assertions referencing the now-derived validator behavior.
- `src/state/state-manager.test.ts` — add schema-version dispatch test cases.

---

## Commit Ordering

Each task ends with a commit. Every commit should leave `make check-all` green.

1. **Layer A (Tasks 1–4)**: validator refactor — behavior-preserving. Existing schema tests stay green.
2. **Layer B (Tasks 5–7)**: ServiceSchema + services field + manual types.
3. **Errors (Task 8)**: user-error taxonomy.
4. **Layer D (Tasks 9–12)**: schema-version widening + dispatch + StateManager provider + validator widening.
5. **Layer C (Tasks 13–15)**: wizard split + `--from` flag + handler plumbing.
6. **Guard (Tasks 16–17)**: multi-service guard helper + integration across 9 commands.
7. **E2E + docs (Tasks 18–19)**: nibble-shape smoke test, README, CHANGELOG.

---

## Task 1: Validator interface + registry scaffold

**Files:**
- Create: `src/config/validators/types.ts`
- Create: `src/config/validators/index.ts`
- Create: `src/config/validators/validators.test.ts`
- Create: `src/config/validators/registry.test.ts`

### Step 1: Write the failing registry completeness test

- [ ] **Create `src/config/validators/registry.test.ts`:**

```ts
import { describe, it, expect } from 'vitest'
import { ProjectTypeSchema } from '../schema.js'
import { ALL_COUPLING_VALIDATORS, PROJECT_TYPE_TO_CONFIG_KEY, configKeyFor } from './index.js'
import type { ProjectType } from '../../types/config.js'

describe('validator registry completeness', () => {
  it('registers exactly one validator per ProjectType', () => {
    const registeredTypes = new Set(ALL_COUPLING_VALIDATORS.map(v => v.projectType))
    const schemaTypes = new Set(ProjectTypeSchema.options as readonly ProjectType[])
    expect(registeredTypes).toEqual(schemaTypes)
    expect(ALL_COUPLING_VALIDATORS).toHaveLength(schemaTypes.size)
  })

  it('has unique configKey per validator', () => {
    const keys = ALL_COUPLING_VALIDATORS.map(v => v.configKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('PROJECT_TYPE_TO_CONFIG_KEY matches registry', () => {
    for (const v of ALL_COUPLING_VALIDATORS) {
      expect(PROJECT_TYPE_TO_CONFIG_KEY[v.projectType]).toBe(v.configKey)
    }
  })

  it('configKeyFor returns the correct key per type', () => {
    for (const v of ALL_COUPLING_VALIDATORS) {
      expect(configKeyFor(v.projectType)).toBe(v.configKey)
    }
  })
})
```

- [ ] **Create `src/config/validators/validators.test.ts` (parameterized harness — empty for now):**

```ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { ALL_COUPLING_VALIDATORS } from './index.js'

describe('coupling validators (parameterized)', () => {
  it.each(ALL_COUPLING_VALIDATORS.map(v => [v.projectType, v]))(
    'validator for %s emits no issue when config is absent (preserves current asymmetric behavior)',
    (_type, validator) => {
      const schema = z.object({}).superRefine((_, ctx) => {
        validator.validate(ctx, [], validator.projectType, undefined)
      })
      const result = schema.safeParse({})
      expect(result.success).toBe(true)
    },
  )

  it.each(ALL_COUPLING_VALIDATORS.map(v => [v.projectType, v]))(
    'validator for %s emits coupling issue when config present with wrong projectType',
    (type, validator) => {
      const schema = z.object({}).superRefine((_, ctx) => {
        // config is present, but projectType is deliberately something else
        const wrongType = type === 'backend' ? 'web-app' : 'backend'
        validator.validate(
          ctx,
          [],
          wrongType as never,
          {} as never, // shape-wise invalid but triggers the "config is defined" branch
        )
      })
      const result = schema.safeParse({})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual([validator.configKey])
        expect(result.error.issues[0].message).toContain(validator.projectType)
      }
    },
  )
})
```

### Step 2: Run tests to verify they fail

- [ ] Run:
```
npx vitest run src/config/validators/
```
Expected: fails because `src/config/validators/index.ts` doesn't exist.

### Step 3: Create `src/config/validators/types.ts`

- [ ] **Content:**

```ts
import type { z } from 'zod'
import type { ProjectType } from '../../types/config.js'

/**
 * A coupling validator encapsulates the rules that relate a given project
 * type's per-type config to the `projectType` value. Used by both
 * `ProjectSchema.superRefine` and `ServiceSchema.superRefine` via the
 * registry at `src/config/validators/index.ts`.
 *
 * Preserves the existing asymmetric rule: a config set without the matching
 * projectType is an error; projectType set without the matching config is
 * NOT an error in root ProjectSchema (see ServiceSchema for the forward
 * rule).
 */
export interface CouplingValidator<T> {
  readonly configKey: string
  readonly projectType: ProjectType
  validate(
    ctx: z.RefinementCtx,
    path: (string | number)[],
    projectType: ProjectType | undefined,
    config: T | undefined,
  ): void
}
```

### Step 4: Create `src/config/validators/index.ts` with empty registry

- [ ] **Content:**

```ts
import type { CouplingValidator } from './types.js'
import type { ProjectType } from '../../types/config.js'

// Populated as per-type modules are added in Task 2.
export const ALL_COUPLING_VALIDATORS: readonly CouplingValidator<unknown>[] = []

export const PROJECT_TYPE_TO_CONFIG_KEY: Readonly<Record<ProjectType, string>> =
  Object.freeze(Object.fromEntries(
    ALL_COUPLING_VALIDATORS.map(v => [v.projectType, v.configKey]),
  )) as Readonly<Record<ProjectType, string>>

export function configKeyFor(projectType: ProjectType): string {
  return PROJECT_TYPE_TO_CONFIG_KEY[projectType]
}

export type { CouplingValidator } from './types.js'
```

### Step 5: Run tests — registry completeness should fail, harness should pass vacuously

- [ ] Run:
```
npx vitest run src/config/validators/
```
Expected: `registry.test.ts` FAILS (registry is empty; `ALL_COUPLING_VALIDATORS.length === 0 !== ProjectTypeSchema.options.length`); `validators.test.ts` passes vacuously (empty `.each`).

### Step 6: Commit

- [ ] **Commit:**
```bash
git add src/config/validators/
git commit -m "feat(config): scaffold validator registry interface and harness

Adds CouplingValidator<T> interface, empty ALL_COUPLING_VALIDATORS
registry, derived PROJECT_TYPE_TO_CONFIG_KEY map + configKeyFor helper,
parameterized harness, and registry-completeness test. Registry is
empty — completeness test intentionally fails until Task 2 registers
all 10 validators."
```

---

## Task 2: Extract all 10 per-type validators + register them

**Files:**
- Create: `src/config/validators/backend.ts`, `web-app.ts`, `research.ts`, `cli.ts`, `library.ts`, `mobile-app.ts`, `data-pipeline.ts`, `ml.ts`, `game.ts`, `browser-extension.ts`
- Create: `src/config/validators/research.test.ts`
- Modify: `src/config/validators/index.ts` (register all 10)

### Step 1: Create `src/config/validators/backend.ts`

- [ ] **Content:**

```ts
import type { CouplingValidator } from './types.js'
import type { BackendConfig } from '../../types/config.js'

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
    // No intra-backend cross-field rules today.
  },
}
```

### Step 2: Create `src/config/validators/web-app.ts`

- [ ] **Content:**

```ts
import type { CouplingValidator } from './types.js'
import type { WebAppConfig } from '../../types/config.js'

export const webAppCouplingValidator: CouplingValidator<WebAppConfig> = {
  configKey: 'webAppConfig',
  projectType: 'web-app',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'web-app') {
      ctx.addIssue({
        path: [...path, 'webAppConfig'],
        code: 'custom',
        message: 'webAppConfig requires projectType: web-app',
      })
    }
  },
}
```

### Step 3: Create `src/config/validators/research.ts` (includes existing intra-type rules)

- [ ] **Content:** (mirrors the current `if (data.researchConfig) { ... }` block in `ProjectSchema.superRefine`)

```ts
import type { CouplingValidator } from './types.js'
import type { ResearchConfig } from '../../types/config.js'

export const researchCouplingValidator: CouplingValidator<ResearchConfig> = {
  configKey: 'researchConfig',
  projectType: 'research',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'research') {
      ctx.addIssue({
        path: [...path, 'researchConfig'],
        code: 'custom',
        message: 'researchConfig requires projectType: research',
      })
    }
    if (config) {
      const { experimentDriver, interactionMode } = config
      if (experimentDriver === 'notebook-driven' && interactionMode === 'autonomous') {
        ctx.addIssue({
          path: [...path, 'researchConfig', 'interactionMode'],
          code: 'custom',
          message: 'Notebook-driven execution cannot be fully autonomous',
        })
      }
    }
  },
}
```

### Step 4: Create `src/config/validators/cli.ts`

- [ ] **Content:**

```ts
import type { CouplingValidator } from './types.js'
import type { CliConfig } from '../../types/config.js'

export const cliCouplingValidator: CouplingValidator<CliConfig> = {
  configKey: 'cliConfig',
  projectType: 'cli',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'cli') {
      ctx.addIssue({
        path: [...path, 'cliConfig'],
        code: 'custom',
        message: 'cliConfig requires projectType: cli',
      })
    }
  },
}
```

### Step 5: Create `src/config/validators/library.ts`

Before writing, **read** `src/config/schema.ts` lines 170-200 to find the existing library-specific cross-field rules. If any exist, mirror them here; if not, the validator is coupling-only.

- [ ] **Content:**

```ts
import type { CouplingValidator } from './types.js'
import type { LibraryConfig } from '../../types/config.js'

export const libraryCouplingValidator: CouplingValidator<LibraryConfig> = {
  configKey: 'libraryConfig',
  projectType: 'library',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'library') {
      ctx.addIssue({
        path: [...path, 'libraryConfig'],
        code: 'custom',
        message: 'libraryConfig requires projectType: library',
      })
    }
    // If src/config/schema.ts has additional library-specific refinements,
    // mirror them here with `path` prefixed.
  },
}
```

### Step 6: Create the remaining 5 validators

Each follows the same template as the coupling-only ones above. Substitute names.

- [ ] **`src/config/validators/mobile-app.ts`:**

```ts
import type { CouplingValidator } from './types.js'
import type { MobileAppConfig } from '../../types/config.js'

export const mobileAppCouplingValidator: CouplingValidator<MobileAppConfig> = {
  configKey: 'mobileAppConfig',
  projectType: 'mobile-app',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'mobile-app') {
      ctx.addIssue({
        path: [...path, 'mobileAppConfig'],
        code: 'custom',
        message: 'mobileAppConfig requires projectType: mobile-app',
      })
    }
  },
}
```

- [ ] **`src/config/validators/data-pipeline.ts`:**

```ts
import type { CouplingValidator } from './types.js'
import type { DataPipelineConfig } from '../../types/config.js'

export const dataPipelineCouplingValidator: CouplingValidator<DataPipelineConfig> = {
  configKey: 'dataPipelineConfig',
  projectType: 'data-pipeline',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'data-pipeline') {
      ctx.addIssue({
        path: [...path, 'dataPipelineConfig'],
        code: 'custom',
        message: 'dataPipelineConfig requires projectType: data-pipeline',
      })
    }
  },
}
```

- [ ] **`src/config/validators/ml.ts`:**

```ts
import type { CouplingValidator } from './types.js'
import type { MlConfig } from '../../types/config.js'

export const mlCouplingValidator: CouplingValidator<MlConfig> = {
  configKey: 'mlConfig',
  projectType: 'ml',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'ml') {
      ctx.addIssue({
        path: [...path, 'mlConfig'],
        code: 'custom',
        message: 'mlConfig requires projectType: ml',
      })
    }
  },
}
```

- [ ] **`src/config/validators/game.ts`:**

```ts
import type { CouplingValidator } from './types.js'
import type { GameConfig } from '../../types/config.js'

export const gameCouplingValidator: CouplingValidator<GameConfig> = {
  configKey: 'gameConfig',
  projectType: 'game',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'game') {
      ctx.addIssue({
        path: [...path, 'gameConfig'],
        code: 'custom',
        message: 'gameConfig is only valid when projectType is "game"',
      })
    }
  },
}
```

- [ ] **`src/config/validators/browser-extension.ts`:**

```ts
import type { CouplingValidator } from './types.js'
import type { BrowserExtensionConfig } from '../../types/config.js'

export const browserExtensionCouplingValidator: CouplingValidator<BrowserExtensionConfig> = {
  configKey: 'browserExtensionConfig',
  projectType: 'browser-extension',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'browser-extension') {
      ctx.addIssue({
        path: [...path, 'browserExtensionConfig'],
        code: 'custom',
        message: 'browserExtensionConfig requires projectType: browser-extension',
      })
    }
  },
}
```

### Step 7: Register all 10 in `src/config/validators/index.ts`

- [ ] **Replace the empty registry with:**

```ts
import type { CouplingValidator } from './types.js'
import type { ProjectType } from '../../types/config.js'
import { backendCouplingValidator } from './backend.js'
import { webAppCouplingValidator } from './web-app.js'
import { researchCouplingValidator } from './research.js'
import { cliCouplingValidator } from './cli.js'
import { libraryCouplingValidator } from './library.js'
import { mobileAppCouplingValidator } from './mobile-app.js'
import { dataPipelineCouplingValidator } from './data-pipeline.js'
import { mlCouplingValidator } from './ml.js'
import { gameCouplingValidator } from './game.js'
import { browserExtensionCouplingValidator } from './browser-extension.js'

export const ALL_COUPLING_VALIDATORS: readonly CouplingValidator<unknown>[] = [
  backendCouplingValidator as CouplingValidator<unknown>,
  webAppCouplingValidator as CouplingValidator<unknown>,
  researchCouplingValidator as CouplingValidator<unknown>,
  cliCouplingValidator as CouplingValidator<unknown>,
  libraryCouplingValidator as CouplingValidator<unknown>,
  mobileAppCouplingValidator as CouplingValidator<unknown>,
  dataPipelineCouplingValidator as CouplingValidator<unknown>,
  mlCouplingValidator as CouplingValidator<unknown>,
  gameCouplingValidator as CouplingValidator<unknown>,
  browserExtensionCouplingValidator as CouplingValidator<unknown>,
] as const

export const PROJECT_TYPE_TO_CONFIG_KEY: Readonly<Record<ProjectType, string>> =
  Object.freeze(Object.fromEntries(
    ALL_COUPLING_VALIDATORS.map(v => [v.projectType, v.configKey]),
  )) as Readonly<Record<ProjectType, string>>

export function configKeyFor(projectType: ProjectType): string {
  return PROJECT_TYPE_TO_CONFIG_KEY[projectType]
}

export type { CouplingValidator } from './types.js'
```

### Step 8: Add bespoke research test `src/config/validators/research.test.ts`

- [ ] **Content:**

```ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { researchCouplingValidator } from './research.js'

describe('researchCouplingValidator — intra-type rules', () => {
  it('rejects notebook-driven + autonomous combination', () => {
    const schema = z.object({}).superRefine((_, ctx) => {
      researchCouplingValidator.validate(ctx, [], 'research', {
        experimentDriver: 'notebook-driven',
        interactionMode: 'autonomous',
        hasExperimentTracking: true,
        domain: 'none',
      })
    })
    const result = schema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['researchConfig', 'interactionMode'])
      expect(result.error.issues[0].message).toMatch(/notebook-driven/i)
    }
  })

  it('allows notebook-driven + checkpoint-gated combination', () => {
    const schema = z.object({}).superRefine((_, ctx) => {
      researchCouplingValidator.validate(ctx, [], 'research', {
        experimentDriver: 'notebook-driven',
        interactionMode: 'checkpoint-gated',
        hasExperimentTracking: true,
        domain: 'none',
      })
    })
    expect(schema.safeParse({}).success).toBe(true)
  })

  it('allows code-driven + autonomous combination', () => {
    const schema = z.object({}).superRefine((_, ctx) => {
      researchCouplingValidator.validate(ctx, [], 'research', {
        experimentDriver: 'code-driven',
        interactionMode: 'autonomous',
        hasExperimentTracking: true,
        domain: 'none',
      })
    })
    expect(schema.safeParse({}).success).toBe(true)
  })
})
```

### Step 9: Run tests to verify all pass

- [ ] Run:
```
npx vitest run src/config/validators/
```
Expected: all 3 test files green — registry.test.ts, validators.test.ts (now running for all 10 types), research.test.ts.

### Step 10: Type-check

- [ ] Run:
```
npx tsc --noEmit
```
Expected: clean.

### Step 11: Commit

- [ ] **Commit:**
```bash
git add src/config/validators/
git commit -m "feat(config): extract all 10 per-type coupling validators

Each project type's config-to-projectType coupling rule lives in its
own module under src/config/validators/. Registry at index.ts
enumerates them and exposes PROJECT_TYPE_TO_CONFIG_KEY / configKeyFor
helpers for downstream consumers. Preserves current asymmetric
behavior: config-without-matching-type is an error; type-without-
matching-config is still permitted at root (ServiceSchema will layer
a forward rule later). Research's intra-type rule (notebook-driven +
autonomous forbidden) moves into research.ts with a bespoke test."
```

---

## Task 3: Refactor ProjectSchema.superRefine to consume registry

**Files:**
- Modify: `src/config/schema.ts`

### Step 1: Read current `ProjectSchema.superRefine` in `src/config/schema.ts` (around lines 126–214)

Familiarize yourself with the existing inline rules. You should find 10 per-type coupling rules (one per type) plus the research-intra-type rule plus possibly other non-per-type cross-field rules (library, web-app, ml, browser-extension may have them — inspect).

### Step 2: Replace the per-type rules with a registry loop

- [ ] **In `src/config/schema.ts`, find the `.superRefine((data, ctx) => { ... })` block after the main `ProjectSchema` object definition. Replace the body:**

**Before (illustrative, actual code similar):**
```ts
.superRefine((data, ctx) => {
  if (data.gameConfig !== undefined && data.projectType !== 'game') {
    ctx.addIssue({ path: ['gameConfig'], code: 'custom',
      message: 'gameConfig is only valid when projectType is "game"' })
  }
  // ... 9 more identical-shape rules ...
  if (data.researchConfig) {
    const { experimentDriver, interactionMode } = data.researchConfig
    if (experimentDriver === 'notebook-driven' && interactionMode === 'autonomous') {
      ctx.addIssue({ ... })
    }
  }
  // ... other non-per-type rules ...
})
```

**After:**
```ts
.superRefine((data, ctx) => {
  for (const v of ALL_COUPLING_VALIDATORS) {
    v.validate(
      ctx,
      [],
      data.projectType,
      (data as Record<string, unknown>)[v.configKey],
    )
  }
  // Preserve any non-per-type cross-field rules that existed before the
  // refactor (for example: adapter/trait validation, methodology/depth
  // coupling). These do NOT move to per-type modules.
})
```

Import at the top of `src/config/schema.ts`:

```ts
import { ALL_COUPLING_VALIDATORS } from './validators/index.js'
```

### Step 3: Run the full schema test suite to verify behavior preservation

- [ ] Run:
```
npx vitest run src/config/schema.test.ts
```
Expected: all existing tests pass. Behavior is preserved.

### Step 4: Type-check

- [ ] Run:
```
npx tsc --noEmit
```
Expected: clean.

### Step 5: Commit

- [ ] **Commit:**
```bash
git add src/config/schema.ts
git commit -m "refactor(config): consume validator registry in ProjectSchema

ProjectSchema.superRefine now loops over ALL_COUPLING_VALIDATORS
instead of inlining per-type rules. Non-per-type cross-field rules
stay inline. Behavior-preserving: existing schema.test.ts suite
green unchanged."
```

---

## Task 4: Run full quality gate to confirm Layer A is sound

### Step 1: Run all gates

- [ ] Run:
```
make check-all
```
Expected: all bats + vitest + tsc + eslint green.

### Step 2: No commit needed (verification only)

If any gate fails, return to the relevant task and fix before proceeding.

---

## Task 5: Add ServiceSchema to src/config/schema.ts

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/schema.test.ts`

### Step 1: Write failing ServiceSchema tests

- [ ] **Append to `src/config/schema.test.ts`:**

```ts
describe('ServiceSchema', () => {
  const validBackendService = {
    name: 'research-engine',
    projectType: 'backend' as const,
    backendConfig: {
      apiStyle: 'rest' as const,
      dataStore: ['relational'] as const,
      authMechanism: 'apikey' as const,
      asyncMessaging: 'none' as const,
      deployTarget: 'container' as const,
      domain: 'fintech' as const,
    },
  }

  it('accepts a valid backend service', () => {
    const result = ServiceSchema.safeParse(validBackendService)
    expect(result.success).toBe(true)
  })

  it('rejects name that violates kebab-case regex', () => {
    const invalid = [
      { ...validBackendService, name: 'Research-Engine' },    // uppercase
      { ...validBackendService, name: '1research' },           // leading digit
      { ...validBackendService, name: 'research engine' },     // whitespace
      { ...validBackendService, name: 'research.engine' },     // dot
      { ...validBackendService, name: '' },                    // empty (caught by min(1) first)
    ]
    for (const s of invalid) {
      expect(ServiceSchema.safeParse(s).success).toBe(false)
    }
  })

  it('rejects config set without matching projectType (coupling)', () => {
    const result = ServiceSchema.safeParse({
      name: 'foo',
      projectType: 'backend',
      webAppConfig: { renderingStrategy: 'ssr', deployTarget: 'container',
        realtime: 'none', authFlow: 'none' },
      backendConfig: validBackendService.backendConfig,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'))
      expect(paths).toContain('webAppConfig')
    }
  })

  it('rejects projectType without matching config (forward rule — ServiceSchema-only)', () => {
    const result = ServiceSchema.safeParse({ name: 'foo', projectType: 'backend' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'))
      expect(paths).toContain('backendConfig')
    }
  })

  it('emits BOTH coupling and forward issues for a doubly-malformed service', () => {
    const result = ServiceSchema.safeParse({
      name: 'foo',
      projectType: 'web-app',
      backendConfig: validBackendService.backendConfig,
      // No webAppConfig.
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'))
      expect(paths).toContain('backendConfig')   // coupling violation
      expect(paths).toContain('webAppConfig')    // forward-direction violation
    }
  })

  it('rejects extra fields via .strict()', () => {
    const result = ServiceSchema.safeParse({
      ...validBackendService,
      extraField: 'x',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(i => i.code === 'unrecognized_keys')
      expect(issue).toBeDefined()
      // Zod's path on unrecognized_keys points at the parent, not the key;
      // the unknown key is in `issue.keys`.
      const keys = (issue as unknown as { keys?: string[] }).keys
      expect(keys).toContain('extraField')
    }
  })

  it('rejects missing projectType', () => {
    const result = ServiceSchema.safeParse({ name: 'foo' })
    expect(result.success).toBe(false)
  })

  it('rejects unknown projectType value', () => {
    const result = ServiceSchema.safeParse({
      name: 'foo', projectType: 'totally-made-up',
    })
    expect(result.success).toBe(false)
  })
})
```

### Step 2: Run tests to verify they fail

- [ ] Run:
```
npx vitest run src/config/schema.test.ts -t ServiceSchema
```
Expected: all tests FAIL — `ServiceSchema` is not exported yet.

### Step 3: Add ServiceSchema to src/config/schema.ts

- [ ] **Insert after the main `ProjectSchema` definition but before the exports at the bottom:**

```ts
import { configKeyFor } from './validators/index.js'

export const ServiceSchema = z.object({
  name: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, {
    message: 'name must be kebab-case starting with a letter',
  }),
  description: z.string().optional(),
  projectType: ProjectTypeSchema,
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
  // NOTE: no `exports` field in Wave 3a — deferred to Wave 3c.
}).strict().superRefine((svc, ctx) => {
  // Shared per-type coupling (config present without matching projectType).
  for (const v of ALL_COUPLING_VALIDATORS) {
    v.validate(ctx, [], svc.projectType, (svc as Record<string, unknown>)[v.configKey])
  }
  // ServiceSchema-only forward rule: projectType without matching config.
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

Ensure `ALL_COUPLING_VALIDATORS` is already imported from Task 3; add `configKeyFor` to the same import line if not already present.

### Step 4: Run tests to verify they pass

- [ ] Run:
```
npx vitest run src/config/schema.test.ts -t ServiceSchema
```
Expected: all 8 new tests pass.

### Step 5: Type-check

- [ ] Run:
```
npx tsc --noEmit
```
Expected: clean.

### Step 6: Commit

- [ ] **Commit:**
```bash
git add src/config/schema.ts src/config/schema.test.ts
git commit -m "feat(config): add ServiceSchema with kebab-case name and forward rule

ServiceSchema reuses the per-type coupling validators from the
registry AND adds a ServiceSchema-only forward-direction rule
(projectType requires matching config). Uses .strict() — services
are user-authored in YAML and typos should surface. Name is
kebab-case. Multi-issue emission documented and tested."
```

---

## Task 6: Add services[] field + unique-names refinement to ProjectSchema

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/schema.test.ts`

### Step 1: Write failing unique-names test

- [ ] **Append to `src/config/schema.test.ts`:**

```ts
describe('ProjectSchema.services refinements', () => {
  const backendService = {
    name: 'research-engine',
    projectType: 'backend' as const,
    backendConfig: {
      apiStyle: 'rest' as const,
      dataStore: ['relational'] as const,
      authMechanism: 'apikey' as const,
      asyncMessaging: 'none' as const,
      deployTarget: 'container' as const,
      domain: 'none' as const,
    },
  }

  it('accepts a project with one service and no root projectType', () => {
    const result = ProjectSchema.safeParse({ services: [backendService] })
    expect(result.success).toBe(true)
  })

  it('accepts a project with services AND root projectType (backcompat — D-BC)', () => {
    const result = ProjectSchema.safeParse({
      projectType: 'backend',
      backendConfig: backendService.backendConfig,
      services: [backendService],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a project with no projectType and no services (backcompat — D-BC)', () => {
    // Preserves today's permissive root behavior.
    expect(ProjectSchema.safeParse({}).success).toBe(true)
  })

  it('rejects empty services array via .min(1)', () => {
    const result = ProjectSchema.safeParse({ services: [] })
    expect(result.success).toBe(false)
  })

  it('rejects services with duplicate names', () => {
    const result = ProjectSchema.safeParse({
      services: [
        backendService,
        { ...backendService, name: 'research-engine' }, // duplicate
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const dupIssue = result.error.issues.find(i => i.path.join('.') === 'services')
      expect(dupIssue?.message).toMatch(/Duplicate service names/i)
    }
  })

  it('accepts services with distinct names', () => {
    const result = ProjectSchema.safeParse({
      services: [
        backendService,
        { ...backendService, name: 'trading-bot' },
      ],
    })
    expect(result.success).toBe(true)
  })
})
```

### Step 2: Run to verify they fail

- [ ] Run:
```
npx vitest run src/config/schema.test.ts -t services
```
Expected: tests fail — `services` field not defined yet.

### Step 3: Add `services` field to ProjectSchema

- [ ] **In `src/config/schema.ts`, inside the `ProjectSchema` `z.object({...})` block, add after the existing type-config fields:**

```ts
services: z.array(ServiceSchema).min(1).optional(),
```

### Step 4: Add unique-names refinement to `ProjectSchema.superRefine`

- [ ] **In the existing `.superRefine((data, ctx) => { ... })` block (added in Task 3), after the `ALL_COUPLING_VALIDATORS` loop and before any other rules, add:**

```ts
// Unique service names
if (data.services) {
  const names = data.services.map(s => s.name)
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
  if (dupes.length > 0) {
    ctx.addIssue({
      path: ['services'],
      code: 'custom',
      message: `Duplicate service names: ${dupes.join(', ')}`,
    })
  }
}
```

**Do NOT** add a "projectType required when services absent" rule — D-BC preserves current optional behavior.

### Step 5: Run tests to verify they pass

- [ ] Run:
```
npx vitest run src/config/schema.test.ts
```
Expected: all tests pass (ServiceSchema + new services refinements + pre-existing).

### Step 6: Type-check

- [ ] Run:
```
npx tsc --noEmit
```
Expected: clean.

### Step 7: Commit

- [ ] **Commit:**
```bash
git add src/config/schema.ts src/config/schema.test.ts
git commit -m "feat(config): add ProjectSchema.services field + unique-name refinement

services: z.array(ServiceSchema).min(1).optional(). Unique service
names enforced via superRefine. Preserves D-BC: root projectType
remains optional; project: {} still validates."
```

---

## Task 7: Update manual TypeScript types in src/types/config.ts

**Files:**
- Modify: `src/types/config.ts`

### Step 1: Read the current ProjectConfig interface

Find `export interface ProjectConfig` in `src/types/config.ts`.

### Step 2: Add ServiceConfig interface and services field

- [ ] **In `src/types/config.ts`, add a new interface and update ProjectConfig:**

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
```

Then add to `ProjectConfig`:

```ts
export interface ProjectConfig {
  // ... existing fields ...
  services?: ServiceConfig[]
}
```

### Step 3: Verify type-check passes

- [ ] Run:
```
npx tsc --noEmit
```
Expected: clean.

### Step 4: Commit

- [ ] **Commit:**
```bash
git add src/types/config.ts
git commit -m "feat(types): add ServiceConfig and ProjectConfig.services

Manual type declarations mirror the Zod schema additions from
ServiceSchema and ProjectSchema.services."
```

---

## Task 8: ScaffoldUserError taxonomy

**Files:**
- Create: `src/utils/user-errors.ts`
- Create: `src/utils/user-errors.test.ts`

### Step 1: Write failing tests

- [ ] **Create `src/utils/user-errors.test.ts`:**

```ts
import { describe, it, expect } from 'vitest'
import {
  ScaffoldUserError,
  FlagConflictError,
  InvalidYamlError,
  InvalidConfigError,
  FromPathReadError,
  TTYStdinError,
  MultiServiceNotSupportedError,
  isScaffoldUserError,
} from './user-errors.js'

describe('ScaffoldUserError taxonomy', () => {
  it('FlagConflictError extends ScaffoldUserError', () => {
    const err = new FlagConflictError('foo')
    expect(err).toBeInstanceOf(ScaffoldUserError)
    expect(err.message).toContain('foo')
  })

  it('InvalidYamlError carries source label', () => {
    const err = new InvalidYamlError('services.yml', 'unexpected token')
    expect(err.message).toContain('services.yml')
    expect(err.message).toContain('unexpected token')
  })

  it('InvalidConfigError carries formatted Zod message', () => {
    const err = new InvalidConfigError('services.yml', 'bad field')
    expect(err.message).toContain('services.yml')
    expect(err.message).toContain('bad field')
  })

  it('FromPathReadError carries path and cause', () => {
    const err = new FromPathReadError('x.yml', 'ENOENT')
    expect(err.message).toContain('x.yml')
    expect(err.message).toContain('ENOENT')
  })

  it('TTYStdinError has a fixed message', () => {
    const err = new TTYStdinError()
    expect(err.message).toContain('stdin')
  })

  it('MultiServiceNotSupportedError identifies the blocked command', () => {
    const err = new MultiServiceNotSupportedError('run')
    expect(err.message).toContain('run')
    expect(err.message).toContain('Wave 2')
  })

  it('isScaffoldUserError narrows correctly', () => {
    expect(isScaffoldUserError(new FlagConflictError('x'))).toBe(true)
    expect(isScaffoldUserError(new Error('plain'))).toBe(false)
    expect(isScaffoldUserError(null)).toBe(false)
    expect(isScaffoldUserError(undefined)).toBe(false)
  })
})
```

### Step 2: Run to verify failures

- [ ] Run:
```
npx vitest run src/utils/user-errors.test.ts
```
Expected: FAIL — module doesn't exist.

### Step 3: Create `src/utils/user-errors.ts`

- [ ] **Content:**

```ts
/**
 * Base class for user-facing errors that the CLI handler layer normalizes
 * to an exit code (typically 2) and a diagnostic line. Internal errors
 * that should surface as stack traces do NOT extend this.
 */
export abstract class ScaffoldUserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class FlagConflictError extends ScaffoldUserError {
  constructor(conflictSummary: string) {
    super(`--from cannot be combined with: ${conflictSummary}. Edit services.yml and re-run.`)
  }
}

export class InvalidYamlError extends ScaffoldUserError {
  constructor(sourceLabel: string, detail: string) {
    super(`Invalid YAML in ${sourceLabel}: ${detail}`)
  }
}

export class InvalidConfigError extends ScaffoldUserError {
  constructor(sourceLabel: string, detail: string) {
    super(`Invalid config (${sourceLabel}):\n${detail}`)
  }
}

export class FromPathReadError extends ScaffoldUserError {
  constructor(pathArg: string, cause: string) {
    super(`Cannot read --from path "${pathArg}": ${cause}`)
  }
}

export class TTYStdinError extends ScaffoldUserError {
  constructor() {
    super('--from - requires piped input (stdin is a TTY).')
  }
}

export class MultiServiceNotSupportedError extends ScaffoldUserError {
  constructor(commandName: string) {
    super(
      `Multi-service projects are not yet executable. `
      + `"scaffold ${commandName}" on a config with services[] lands in Wave 2.`,
    )
  }
}

export function isScaffoldUserError(err: unknown): err is ScaffoldUserError {
  return err instanceof ScaffoldUserError
}
```

### Step 4: Run tests to pass

- [ ] Run:
```
npx vitest run src/utils/user-errors.test.ts
```
Expected: all pass.

### Step 5: Commit

- [ ] **Commit:**
```bash
git add src/utils/user-errors.ts src/utils/user-errors.test.ts
git commit -m "feat(errors): add ScaffoldUserError taxonomy

Shared base + 6 tagged subclasses for user-facing CLI errors:
FlagConflictError, InvalidYamlError, InvalidConfigError,
FromPathReadError, TTYStdinError, MultiServiceNotSupportedError.
isScaffoldUserError() for type narrowing in handler catch blocks."
```

---

## Task 9: Widen schema-version surface (error helper + type literal)

**Files:**
- Modify: `src/utils/errors.ts`
- Modify: `src/types/state.ts`

### Step 1: Widen stateSchemaVersion signature

- [ ] **Find in `src/utils/errors.ts` (around line 165):**

```ts
export function stateSchemaVersion(expected: number, actual: number, file: string): ScaffoldError {
```

Change to:

```ts
export function stateSchemaVersion(
  expected: number | readonly number[],
  actual: number,
  file: string,
): ScaffoldError {
```

Inside the body, format `expected` for the error message:

```ts
const expectedDisplay = Array.isArray(expected)
  ? expected.join(' or ')
  : String(expected)
// substitute expectedDisplay wherever `expected` was previously stringified
```

(Adjust based on the existing body — the idea is both single number and array forms render readably.)

### Step 2: Widen the schema-version literal type

- [ ] **In `src/types/state.ts`, find:**

```ts
'schema-version': 1
```

Change to:

```ts
'schema-version': 1 | 2
```

### Step 3: Verify all existing callers still compile

- [ ] Run:
```
npx tsc --noEmit
```
Expected: clean. All existing `stateSchemaVersion(1, ...)` call-sites still type-check (widening accepts a single number).

### Step 4: Verify existing tests still pass

- [ ] Run:
```
npx vitest run
```
Expected: all pass. No behavior change — widening only.

### Step 5: Commit

- [ ] **Commit:**
```bash
git add src/utils/errors.ts src/types/state.ts
git commit -m "feat(state): widen schema-version to 1|2 and error helper accepts array

stateSchemaVersion() first param is now number | readonly number[],
so the new 1|2 dispatch path can report 'expected 1 or 2'. Existing
single-number call-sites still compile unchanged. PipelineState type
widens from literal 1 to 1|2 ahead of the dispatch module landing."
```

---

## Task 10: Create state-version-dispatch module

**Files:**
- Create: `src/state/state-version-dispatch.ts`
- Create: `src/state/state-version-dispatch.test.ts`

### Step 1: Write failing tests

- [ ] **Create `src/state/state-version-dispatch.test.ts`:**

```ts
import { describe, it, expect } from 'vitest'
import { dispatchStateMigration } from './state-version-dispatch.js'

describe('dispatchStateMigration', () => {
  it('accepts v1 state when hasServices is false (no bump)', () => {
    const raw: Record<string, unknown> = { 'schema-version': 1, foo: 'bar' }
    dispatchStateMigration(raw, { hasServices: false }, 'state.json')
    expect(raw['schema-version']).toBe(1)
  })

  it('bumps v1 → v2 in place when hasServices is true', () => {
    const raw: Record<string, unknown> = { 'schema-version': 1, foo: 'bar' }
    dispatchStateMigration(raw, { hasServices: true }, 'state.json')
    expect(raw['schema-version']).toBe(2)
  })

  it('accepts v2 state unchanged regardless of hasServices', () => {
    const raw: Record<string, unknown> = { 'schema-version': 2, foo: 'bar' }
    dispatchStateMigration(raw, { hasServices: true }, 'state.json')
    expect(raw['schema-version']).toBe(2)
  })

  it('throws on missing schema-version', () => {
    expect(() =>
      dispatchStateMigration({}, { hasServices: false }, 'state.json'),
    ).toThrow()
  })

  it('throws on unknown schema-version', () => {
    expect(() =>
      dispatchStateMigration(
        { 'schema-version': 99 }, { hasServices: false }, 'state.json',
      ),
    ).toThrow()
  })

  it('throws on non-object raw input', () => {
    expect(() =>
      dispatchStateMigration('not an object', { hasServices: false }, 'state.json'),
    ).toThrow()
    expect(() =>
      dispatchStateMigration(null, { hasServices: false }, 'state.json'),
    ).toThrow()
  })
})
```

### Step 2: Run to verify failures

- [ ] Run:
```
npx vitest run src/state/state-version-dispatch.test.ts
```
Expected: FAIL — module doesn't exist.

### Step 3: Create the module

- [ ] **Create `src/state/state-version-dispatch.ts`:**

```ts
import { stateSchemaVersion } from '../utils/errors.js'

export interface MigrationContext {
  readonly hasServices: boolean
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Dispatches schema-version handling on raw state JSON.
 * - Rejects unknown / missing versions.
 * - Bumps v1 → v2 in-place when the companion config has services[].
 * - Does NOT run Zod full-shape validation — caller is responsible.
 * - Mutates the input object; callers may rely on that side effect.
 *
 * Wave 3b will extend this module to bump v2 → v3 when per-service
 * state fields are introduced.
 */
export function dispatchStateMigration(
  raw: unknown,
  ctx: MigrationContext,
  file: string,
): asserts raw is Record<string, unknown> & { 'schema-version': 1 | 2 } {
  if (!isPlainObject(raw) || typeof raw['schema-version'] !== 'number') {
    throw stateSchemaVersion([1, 2], Number(raw && (raw as Record<string, unknown>)['schema-version']), file)
  }
  const version = raw['schema-version']
  if (version !== 1 && version !== 2) {
    throw stateSchemaVersion([1, 2], version, file)
  }
  if (version === 1 && ctx.hasServices) {
    raw['schema-version'] = 2
  }
}
```

### Step 4: Run tests to pass

- [ ] Run:
```
npx vitest run src/state/state-version-dispatch.test.ts
```
Expected: all tests pass.

### Step 5: Commit

- [ ] **Commit:**
```bash
git add src/state/state-version-dispatch.ts src/state/state-version-dispatch.test.ts
git commit -m "feat(state): add schema-version dispatch framework

dispatchStateMigration() bumps v1 → v2 in-place when config has
services[]; otherwise passes v1 through unchanged. Rejects unknown
versions. Does NOT run full-shape Zod validation — caller owns that.
Framework ready for Wave 3b to add the real v2 → v3 migration body
when per-service state ships."
```

---

## Task 11: Integrate dispatch into StateManager + widen validator

**Files:**
- Modify: `src/state/state-manager.ts`
- Modify: `src/validation/state-validator.ts`
- Modify: `src/state/state-manager.test.ts`

### Step 1: Write a failing test for StateManager dispatch integration

- [ ] **Append to `src/state/state-manager.test.ts`:**

```ts
describe('StateManager — schema-version dispatch (Wave 3a)', () => {
  it('loads v1 state when config has no services', () => {
    // Arrange: write v1 state.json in a tmp dir; construct StateManager
    // with a configProvider returning a single-service config.
    // Act: loadState()
    // Assert: returned state has schema-version === 1.
    // (adapt to existing tmpdir/test-fixture helpers in this file)
  })

  it('bumps v1 state to v2 in memory when config has services[]', () => {
    // Arrange: v1 state.json + configProvider returning { services: [...] }.
    // Act: loadState()
    // Assert: returned state has schema-version === 2.
    // (v2 shape = v1 shape, so other fields unchanged)
  })

  it('rejects unknown schema-version', () => {
    // Arrange: write state.json with schema-version: 99.
    // Act: expect loadState() to throw.
  })

  it('accepts v2 state unchanged', () => {
    // Arrange: write v2 state.json; configProvider returns services.
    // Act: loadState()
    // Assert: schema-version stays 2.
  })
})
```

Expand these skeletons using the existing tmpdir helpers in `src/state/state-manager.test.ts`. Mirror how other tests in the file construct a StateManager and write a state file.

### Step 2: Run tests to verify they fail

- [ ] Run:
```
npx vitest run src/state/state-manager.test.ts -t "schema-version dispatch"
```
Expected: FAIL — StateManager doesn't accept a configProvider yet.

### Step 3: Update StateManager constructor and loadState

- [ ] **In `src/state/state-manager.ts`, modify the constructor:**

```ts
export class StateManager {
  private statePath: string

  constructor(
    private projectRoot: string,
    private computeEligible: (steps: Record<string, StepStateEntry>) => string[],
    private configProvider?: () => { project?: { services?: unknown[] } } | undefined,
  ) {
    this.statePath = path.join(projectRoot, '.scaffold', 'state.json')
  }
```

- [ ] **Modify `loadState()` to call the dispatch before the existing schema-version check:**

```ts
loadState(): PipelineState {
  if (!fileExists(this.statePath)) {
    throw stateMissing(this.statePath)
  }

  let raw: string
  try {
    raw = fs.readFileSync(this.statePath, 'utf8')
  } catch (err) {
    throw stateParseError(this.statePath, (err as Error).message)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch (err) {
    throw stateParseError(this.statePath, (err as Error).message)
  }

  // Wave 3a: widen schema-version handling to 1 | 2 via dispatch.
  const config = this.configProvider?.()
  const ctx = { hasServices: (config?.project?.services?.length ?? 0) > 0 }
  dispatchStateMigration(parsed, ctx, this.statePath)

  // Existing permissive load: no full-shape Zod in loadState.
  const state = parsed as unknown as PipelineState

  // Apply existing step-name migrations.
  if (migrateState(state)) {
    // ... existing persist-on-migration logic unchanged ...
  }

  return state
}
```

Add at the top:

```ts
import { dispatchStateMigration } from './state-version-dispatch.js'
```

- [ ] **Remove the old `if (schemaVersion !== 1)` check** — dispatch handles it now.

### Step 4: Widen initializeState signature

- [ ] **In the same file, find `initializeState()` and widen to take the config so it can emit the correct version:**

Current signature (approximate):
```ts
initializeState(opts: {
  enabledSteps: string[]
  scaffoldVersion: string
  methodology: MethodologyName
  initMode: string
}): PipelineState
```

Add `config`:

```ts
initializeState(opts: {
  enabledSteps: string[]
  scaffoldVersion: string
  methodology: MethodologyName
  initMode: string
  config: { project?: { services?: unknown[] } }   // Wave 3a
  oldState?: PipelineState                         // Wave 3a — preserved on --force
}): PipelineState {
  const schemaVersion = (opts.config?.project?.services?.length ?? 0) > 0 ? 2 : 1
  // ... existing body, but use schemaVersion instead of hardcoded 1 ...
}
```

If `oldState` is provided, preserve completed-steps exactly as today's implicit behavior in `src/wizard/wizard.ts` does.

### Step 5: Widen src/validation/state-validator.ts

- [ ] **Find the `schemaVersion !== 1` check (likely around line 73). Change to:**

```ts
if (schemaVersion !== 1 && schemaVersion !== 2) {
  throw stateSchemaVersion([1, 2], schemaVersion, file)
}
```

### Step 6: Update the 13 existing StateManager call-sites

Call-sites that should begin passing a config provider (see `grep -rn "new StateManager" src/` for the full list):

- `src/cli/commands/adopt.ts` (2 sites)
- `src/cli/commands/complete.ts`
- `src/cli/commands/dashboard.ts`
- `src/cli/commands/info.ts` (2 sites)
- `src/cli/commands/next.ts`
- `src/cli/commands/reset.ts`
- `src/cli/commands/rework.ts`
- `src/cli/commands/run.ts`
- `src/cli/commands/skip.ts`
- `src/cli/commands/status.ts`
- `src/wizard/wizard.ts`

For each call-site that has a `config` object in scope, add the provider arg:

```ts
const stateManager = new StateManager(
  projectRoot,
  pipeline.computeEligible,
  () => config,   // Wave 3a: enables correct schema-version dispatch on load
)
```

For sites without immediate config access (`dashboard.ts`, `info.ts`, `adopt.ts` early paths), load the config on demand:

```ts
import { loadConfigIfExists } from '../../config/loader.js'  // or the existing loader path

const stateManager = new StateManager(
  projectRoot,
  () => [],
  () => loadConfigIfExists(projectRoot) ?? undefined,
)
```

Use the existing config loader used elsewhere in the codebase. If the loader doesn't exist by exactly this name, grep `src/config/` for the canonical loader function and use that.

### Step 7: Update initializeState call-sites to pass config + oldState

- [ ] **Find `stateManager.initializeState(...)` call in `src/wizard/wizard.ts`:**

Currently approximately:
```ts
stateManager.initializeState({
  enabledSteps,
  scaffoldVersion,
  methodology,
  initMode: ...
})
```

Update to:
```ts
stateManager.initializeState({
  enabledSteps,
  scaffoldVersion,
  methodology,
  initMode: ...,
  config,      // Wave 3a: in-scope from wizard answer collection
  oldState,    // Wave 3a: preserved from preservable-state read above
})
```

### Step 8: Run tests

- [ ] Run:
```
npx vitest run src/state/ src/validation/ src/wizard/ src/cli/commands/
npx tsc --noEmit
make check-all
```
Expected: all green.

### Step 9: Commit

- [ ] **Commit:**
```bash
git add src/state/state-manager.ts src/validation/state-validator.ts \
        src/state/state-manager.test.ts \
        src/cli/commands/adopt.ts src/cli/commands/complete.ts \
        src/cli/commands/dashboard.ts src/cli/commands/info.ts \
        src/cli/commands/next.ts src/cli/commands/reset.ts \
        src/cli/commands/rework.ts src/cli/commands/run.ts \
        src/cli/commands/skip.ts src/cli/commands/status.ts \
        src/wizard/wizard.ts
git commit -m "feat(state): thread dispatch through StateManager and 13 call-sites

StateManager constructor accepts an optional configProvider callback.
loadState() calls dispatchStateMigration() with hasServices computed
from the provider. initializeState() takes the config directly and
emits schema-version 2 when services.length > 0, else 1 — it also
accepts an oldState parameter for --force state preservation.
state-validator.ts widens to accept 1|2. All 13 existing call-sites
updated; sites without immediate config load the config on demand via
the existing loader."
```

---

## Task 12: Split runWizard into collectWizardAnswers + materializeScaffoldProject

**Files:**
- Modify: `src/wizard/wizard.ts`
- Modify: `src/wizard/wizard.test.ts` (if it exists)

### Step 1: Read current runWizard carefully

Before splitting, inspect `src/wizard/wizard.ts` lines 75-248 and identify exactly which lines do:
- Question collection (`askWizardQuestions` call, flag-family validation, building the `ScaffoldConfig` return value).
- Materialization (reading old state, computing backup path, moving `.scaffold/` to backup, writing `config.yml`, constructing `StateManager`, calling `initializeState`, writing `decisions.jsonl`).

### Step 2: Write a failing test for the split

- [ ] **In `src/wizard/wizard.test.ts` (create if missing):**

```ts
import { describe, it, expect } from 'vitest'
import { collectWizardAnswers, materializeScaffoldProject } from './wizard.js'
import type { ScaffoldConfig } from '../types/index.js'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

describe('runWizard seam split', () => {
  it('collectWizardAnswers produces a ScaffoldConfig without filesystem writes', async () => {
    // Arrange: construct a WizardOptions with mocked IO producing a
    // single-service backend answer set.
    // Act: const config = await collectWizardAnswers(options)
    // Assert: no .scaffold/ directory created; config parses.
    // (use os.tmpdir() sandbox and assert absence)
  })

  it('materializeScaffoldProject writes config.yml, state.json, decisions.jsonl', async () => {
    // Arrange: prebuilt ScaffoldConfig and a tmpdir.
    // Act: await materializeScaffoldProject(config, { projectRoot: tmp, force: false })
    // Assert: .scaffold/config.yml exists and round-trips; state.json has
    // schema-version 1 (no services[]); decisions.jsonl exists and is empty.
  })

  it('materializeScaffoldProject with --force backs up existing .scaffold', async () => {
    // Arrange: tmpdir already has .scaffold/config.yml and state.json.
    // Act: await materializeScaffoldProject(config, { projectRoot, force: true })
    // Assert: .scaffold.backup.* exists; new .scaffold/state.json present.
  })
})
```

Flesh out the skeletons using existing tmpdir helpers from `src/state/state-manager.test.ts`.

### Step 3: Run tests — should fail (exports don't exist)

- [ ] Run:
```
npx vitest run src/wizard/wizard.test.ts -t "seam split"
```
Expected: FAIL.

### Step 4: Extract collectWizardAnswers from runWizard

- [ ] **In `src/wizard/wizard.ts`, extract the question-collection portion as an exported function:**

```ts
export async function collectWizardAnswers(
  options: WizardOptions,
): Promise<ScaffoldConfig> {
  // All the pre-materialization logic from the old runWizard body:
  // - askWizardQuestions invocation
  // - flag-family validation
  // - ScaffoldConfig object construction
  // No filesystem writes, no StateManager, no backup logic.
  // Returns the fully-built config.
}
```

### Step 5: Extract materializeScaffoldProject from runWizard

- [ ] **In `src/wizard/wizard.ts`, extract the materialization portion as an exported function:**

```ts
export interface MaterializeOptions {
  projectRoot: string
  force: boolean
  // If provided, preserved across backup + reinit. Caller reads old
  // state.json before backup and passes it; materializer honors it
  // during initializeState. If absent, state starts fresh.
  oldState?: PipelineState
}

export async function materializeScaffoldProject(
  config: ScaffoldConfig,
  options: MaterializeOptions,
): Promise<void> {
  const { projectRoot, force, oldState } = options

  // 1. Old-state preservation: if oldState is not explicitly passed AND
  //    state.json exists, read it here (mirror current wizard.ts:104-117).

  // 2. Backup: if force AND .scaffold/ exists, move to .scaffold.backup.<ts>
  //    (mirror current wizard.ts:119-125).

  // 3. Ensure .scaffold/ directory exists.

  // 4. Write .scaffold/config.yml (mirror current wizard.ts:186-191).

  // 5. Construct StateManager with configProvider returning `config`.

  // 6. stateManager.initializeState({ ..., config, oldState })
  //    (schema-version 2 if config.project?.services?.length > 0, else 1).

  // 7. Prime empty decisions.jsonl (mirror current wizard.ts:234-237).
}
```

### Step 6: Refactor runWizard to compose the two

- [ ] **Replace the old monolithic runWizard body with:**

```ts
export async function runWizard(options: WizardOptions): Promise<WizardResult> {
  const config = await collectWizardAnswers(options)
  const oldState = readOldStateIfExists(options.projectRoot)   // existing helper, or inline
  await materializeScaffoldProject(config, {
    projectRoot: options.projectRoot,
    force: options.force,
    oldState,
  })
  // Return the existing WizardResult shape.
  return {
    success: true,
    projectRoot: options.projectRoot,
    configPath: path.join(options.projectRoot, '.scaffold', 'config.yml'),
    methodology: config.methodology,
    errors: [],
  }
}
```

Keep helper function signatures used by `runWizard`'s callers (e.g., `WizardResult` exact shape) unchanged.

### Step 7: Run tests to verify pass

- [ ] Run:
```
npx vitest run src/wizard/
make check-all
```
Expected: all green.

### Step 8: Commit

- [ ] **Commit:**
```bash
git add src/wizard/wizard.ts src/wizard/wizard.test.ts
git commit -m "refactor(wizard): split runWizard into collect + materialize seam

collectWizardAnswers returns a ScaffoldConfig with no filesystem
writes. materializeScaffoldProject takes a ScaffoldConfig and writes
.scaffold/ (backup + config + state + decisions). runWizard composes
the two for the interactive path; init --from (Task 13) will call
materializeScaffoldProject directly. decisions.jsonl is primed empty
for both paths (current behavior, preserved)."
```

---

## Task 13: Add --from flag + handler + builder exclusivity + error plumbing

**Files:**
- Modify: `src/cli/commands/init.ts`
- Create: `src/cli/commands/init-from.test.ts`

### Step 1: Write failing tests for --from

- [ ] **Create `src/cli/commands/init-from.test.ts`:**

```ts
import { describe, it, expect } from 'vitest'
import { parseInitArgs, initCommand } from './init.js'   // adapt names to actual exports
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const validManifest = `version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
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
`

function withTmpFile(content: string): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'init-from-')), 'services.yml')
  fs.writeFileSync(file, content, 'utf8')
  return file
}

function withTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'init-from-dir-'))
}

describe('scaffold init --from', () => {
  it('rejects combining --from with --methodology', async () => {
    await expect(parseInitArgs([
      '--from', 'services.yml',
      '--methodology', 'mvp',
    ])).rejects.toThrow(/--from cannot be combined with/)
  })

  it('rejects combining --from with --backend-api-style', async () => {
    await expect(parseInitArgs([
      '--from', 'services.yml',
      '--backend-api-style', 'rest',
    ])).rejects.toThrow(/--from cannot be combined with/)
  })

  it('rejects combining --from with --idea', async () => {
    await expect(parseInitArgs([
      '--from', 'services.yml',
      '--idea', 'my idea',
    ])).rejects.toThrow(/--from cannot be combined with/)
  })

  it('allows --from with operational flags --root/--force/--verbose/--auto/--format', async () => {
    const argv = await parseInitArgs([
      '--from', 'services.yml',
      '--force', '--auto', '--verbose', '--format', 'json',
      '--root', '/tmp/x',
    ])
    expect(argv.from).toBe('services.yml')
  })

  it('reads a valid services.yml file and writes .scaffold/config.yml', async () => {
    const file = withTmpFile(validManifest)
    const root = withTmpDir()
    const argv = await parseInitArgs(['--from', file, '--root', root, '--auto'])
    await initCommand.handler(argv)
    expect(fs.existsSync(path.join(root, '.scaffold', 'config.yml'))).toBe(true)
    expect(fs.existsSync(path.join(root, '.scaffold', 'state.json'))).toBe(true)
  })

  it('errors on missing file with exit code 2', async () => {
    const root = withTmpDir()
    const argv = await parseInitArgs([
      '--from', '/nonexistent/services.yml',
      '--root', root, '--auto',
    ])
    await initCommand.handler(argv)
    expect(process.exitCode).toBe(2)
    process.exitCode = 0
  })

  it('errors on invalid YAML with exit code 2', async () => {
    const file = withTmpFile('version: 2\nmethodology: [unclosed')
    const root = withTmpDir()
    const argv = await parseInitArgs(['--from', file, '--root', root, '--auto'])
    await initCommand.handler(argv)
    expect(process.exitCode).toBe(2)
    process.exitCode = 0
  })

  it('errors on invalid schema with exit code 2', async () => {
    const file = withTmpFile(`version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: x
      projectType: backend
      # missing backendConfig — triggers ServiceSchema forward rule
`)
    const root = withTmpDir()
    const argv = await parseInitArgs(['--from', file, '--root', root, '--auto'])
    await initCommand.handler(argv)
    expect(process.exitCode).toBe(2)
    process.exitCode = 0
  })
})
```

### Step 2: Run to verify failures

- [ ] Run:
```
npx vitest run src/cli/commands/init-from.test.ts
```
Expected: FAIL — `--from` not declared.

### Step 3: Declare --from option and builder-level .check()

- [ ] **In `src/cli/commands/init.ts`, near the other `.option(...)` calls (around lines 100-290), add:**

```ts
.option('from', {
  type: 'string',
  describe: 'Path to a ScaffoldConfig YAML file, or "-" for stdin. Exclusive with config-setting flags.',
})
```

- [ ] **Immediately after the last `.option(...)` in the builder, add the `.check()`:**

```ts
.check((argv) => {
  if (argv.from === undefined) return true

  // Flags that set config content — conflict with --from.
  const configSettingFlags: readonly string[] = [
    'methodology', 'depth', 'adapters', 'traits', 'project-type', 'idea',
    ...GAME_FLAGS, ...WEB_FLAGS, ...BACKEND_FLAGS, ...CLI_FLAGS,
    ...LIB_FLAGS, ...MOBILE_FLAGS, ...PIPELINE_FLAGS, ...ML_FLAGS,
    ...EXT_FLAGS, ...RESEARCH_FLAGS,
  ]
  const conflicts = configSettingFlags.filter(f => (argv as Record<string, unknown>)[f] !== undefined)
  if (conflicts.length > 0) {
    const summary = conflicts.map(f => '--' + f).join(', ')
    throw new FlagConflictError(summary)
  }
  return true
})
```

Import at the top:
```ts
import { FlagConflictError, InvalidYamlError, InvalidConfigError,
         FromPathReadError, TTYStdinError, isScaffoldUserError } from '../../utils/user-errors.js'
import {
  GAME_FLAGS, WEB_FLAGS, BACKEND_FLAGS, CLI_FLAGS, LIB_FLAGS,
  MOBILE_FLAGS, PIPELINE_FLAGS, ML_FLAGS, EXT_FLAGS, RESEARCH_FLAGS,
} from '../init-flag-families.js'   // adjust path to match actual location
```

### Step 4: Add --from handler logic

- [ ] **In the init handler body (around line 492, before the wizard path), add:**

```ts
if (argv.from !== undefined) {
  try {
    const sourceLabel = argv.from === '-' ? '<stdin>' : argv.from
    const raw = argv.from === '-'
      ? readStdinOrError()
      : readFromPath(argv.from)

    let parsedYaml: unknown
    try {
      parsedYaml = parseYaml(raw)
    } catch (err) {
      throw new InvalidYamlError(sourceLabel, (err as Error).message)
    }

    const result = ScaffoldConfigSchema.safeParse(parsedYaml)
    if (!result.success) {
      const detail = formatZodError(result.error)
      throw new InvalidConfigError(sourceLabel, detail)
    }

    const projectRoot = path.resolve(argv.root ?? process.cwd())
    const oldState = readOldStateIfExists(projectRoot)
    await materializeScaffoldProject(result.data, { projectRoot, force: argv.force, oldState })

    // Fall through to the shared post-materialize block (build + skill sync).
  } catch (err) {
    if (isScaffoldUserError(err)) {
      output.error(err.message)
      process.exitCode = 2
      return
    }
    throw err
  }
}
```

Add helper functions near the top of `init.ts` (or in a new helpers module if the file is already large):

```ts
import { parse as parseYaml } from 'yaml'
import { ScaffoldConfigSchema } from '../../config/schema.js'
import { materializeScaffoldProject } from '../../wizard/wizard.js'
import { readOldStateIfExists } from '../../state/helpers.js'  // create or reuse
import { z } from 'zod'

function readFromPath(pathArg: string): string {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), pathArg), 'utf-8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? (err as Error).message
    throw new FromPathReadError(pathArg, code)
  }
}

function readStdinOrError(): string {
  if (process.stdin.isTTY) {
    throw new TTYStdinError()
  }
  try {
    return fs.readFileSync(0, 'utf-8')
  } catch (err) {
    throw new FromPathReadError('-', (err as Error).message)
  }
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map(issue => {
    const p = issue.path.join('.') || '(root)'
    return `  ${p}: ${issue.message}`
  }).join('\n')
}
```

### Step 5: Wrap the existing wizard path + post-materialize block in the same try/catch

- [ ] **Ensure the existing wizard invocation (around `runWizard(...)` at lines 495-500) and the post-materialize `runBuild` + `syncSkillsIfNeeded` block (lines 594-614) both live inside a try/catch that handles `ScaffoldUserError`. After the try block completes normally, the `runBuild` + `syncSkillsIfNeeded` block runs unchanged.** Both the `--from` branch and the wizard branch should fall through to the same build + sync block.

The cleanest structure for the handler:

```ts
handler: async (argv) => {
  const projectRoot = path.resolve(argv.root ?? process.cwd())
  try {
    if (argv.from !== undefined) {
      // --from path: parse, validate, materialize
      // ... code from Step 4 ...
    } else {
      // wizard path (existing code, now internally using collectWizardAnswers
      // + materializeScaffoldProject via the split in Task 12)
      const result = await shutdown.withPrompt(async () => runWizard({ ... }))
      if (!result.success) {
        for (const err of result.errors) output.error(err)
        process.exitCode = 1
        return
      }
    }

    // Shared post-materialize block: build + skill sync
    await shutdown.withContext('Cancelled. Partial output may exist...', async () => {
      const buildResult = await runBuild({ ... })
      if (buildResult.exitCode !== 0) {
        process.exitCode = buildResult.exitCode
        return
      }
      try {
        syncSkillsIfNeeded(projectRoot)
      } catch { /* best-effort */ }
      // ... existing output.result call ...
    })
  } catch (err) {
    if (isScaffoldUserError(err)) {
      output.error(err.message)
      process.exitCode = 2
      return
    }
    throw err
  }
}
```

Adapt the existing wizard handler's control flow; this is a structural rewrite of the handler to share the post-materialize block between both entry points.

### Step 6: Run tests

- [ ] Run:
```
npx vitest run src/cli/commands/init-from.test.ts src/cli/commands/init.test.ts
make check-all
```
Expected: all green.

### Step 7: Commit

- [ ] **Commit:**
```bash
git add src/cli/commands/init.ts src/cli/commands/init-from.test.ts
git commit -m "feat(cli): add scaffold init --from <services.yml>

Declarative init path: read YAML (or stdin via -), validate as a
full ScaffoldConfig, call materializeScaffoldProject, then fall
through to the shared build + skill-sync block. Builder-level
.check() rejects combining --from with config-setting flags
(all 40+ enumerated via existing *_FLAGS constants). Handler-level
try/catch normalizes ScaffoldUserError subclasses to exit 2 with
clean diagnostics. Empty decisions.jsonl preserved for both paths."
```

---

## Task 14: Create src/cli/guards.ts with assertSingleServiceOrExit

**Files:**
- Create: `src/cli/guards.ts`
- Create: `src/cli/guards.test.ts`

### Step 1: Write failing tests

- [ ] **Create `src/cli/guards.test.ts`:**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { assertSingleServiceOrExit } from './guards.js'
import { MultiServiceNotSupportedError } from '../utils/user-errors.js'

describe('assertSingleServiceOrExit', () => {
  let origExit: number | undefined

  beforeEach(() => {
    origExit = process.exitCode
    process.exitCode = 0
  })

  afterEach(() => {
    process.exitCode = origExit
  })

  it('passes on single-service config (no services[])', () => {
    expect(() => assertSingleServiceOrExit(
      { project: { projectType: 'backend' } } as never,
      { commandName: 'run', output: makeNullOutput() },
    )).not.toThrow()
    expect(process.exitCode).toBe(0)
  })

  it('passes on config with no project at all', () => {
    expect(() => assertSingleServiceOrExit(
      {} as never,
      { commandName: 'run', output: makeNullOutput() },
    )).not.toThrow()
  })

  it('sets exit 2 on services-only config', () => {
    assertSingleServiceOrExit(
      { project: { services: [{ name: 'a' }] } } as never,
      { commandName: 'run', output: makeNullOutput() },
    )
    expect(process.exitCode).toBe(2)
  })

  it('sets exit 2 on config with services[] AND root projectType (silent-ignore prevented)', () => {
    assertSingleServiceOrExit(
      { project: { projectType: 'backend', services: [{ name: 'a' }] } } as never,
      { commandName: 'status', output: makeNullOutput() },
    )
    expect(process.exitCode).toBe(2)
  })

  it('emits a diagnostic that names the command and Wave 2', () => {
    const errors: string[] = []
    assertSingleServiceOrExit(
      { project: { services: [{ name: 'a' }] } } as never,
      { commandName: 'next', output: { error: (m: string) => errors.push(m),
        result: () => {}, warn: () => {} } as never },
    )
    expect(errors.some(m => m.includes('next'))).toBe(true)
    expect(errors.some(m => m.includes('Wave 2'))).toBe(true)
  })
})

function makeNullOutput() {
  return { error: () => {}, result: () => {}, warn: () => {} } as never
}
```

### Step 2: Run to verify failures

- [ ] Run:
```
npx vitest run src/cli/guards.test.ts
```
Expected: FAIL.

### Step 3: Implement the guard

- [ ] **Create `src/cli/guards.ts`:**

```ts
import { MultiServiceNotSupportedError } from '../utils/user-errors.js'
import type { ScaffoldConfig } from '../types/index.js'

export interface GuardContext {
  commandName: string
  output: { error: (message: string) => void; result: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
}

/**
 * Reject any config with services[] at the top of a stateful command.
 * Sets process.exitCode = 2 and emits an output.error diagnostic.
 * Callers must `return` immediately after calling this when the guard fires.
 *
 * Does NOT throw — sets exitCode so the handler can run cleanup.
 */
export function assertSingleServiceOrExit(
  config: Partial<ScaffoldConfig>,
  ctx: GuardContext,
): void {
  const services = config?.project?.services
  if (services && services.length > 0) {
    const err = new MultiServiceNotSupportedError(ctx.commandName)
    ctx.output.error(err.message)
    process.exitCode = 2
  }
}
```

### Step 4: Run tests to pass

- [ ] Run:
```
npx vitest run src/cli/guards.test.ts
```
Expected: all pass.

### Step 5: Commit

- [ ] **Commit:**
```bash
git add src/cli/guards.ts src/cli/guards.test.ts
git commit -m "feat(cli): add assertSingleServiceOrExit guard

Shared guard called from every stateful command's handler. Sets
process.exitCode = 2 and emits a diagnostic when config has
services[] — regardless of whether root projectType is also set
(prevents silent-ignore of services). Multi-service execution
lands in Wave 2."
```

---

## Task 15: Integrate guard into all 9 stateful commands

**Files:**
- Modify: `src/cli/commands/run.ts`, `next.ts`, `complete.ts`, `skip.ts`, `status.ts`, `rework.ts`, `reset.ts`, `info.ts`, `dashboard.ts`

For each command file, do the same sequence: import guard, call it at the top of the handler after config load, return early if `process.exitCode` was set.

### Step 1: Write a failing guard-parameterized test per command

- [ ] **Create `src/cli/guards-integration.test.ts`:**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import yaml from 'yaml'

const multiServiceConfig = `version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: a
      projectType: backend
      backendConfig:
        apiStyle: rest
        dataStore: [relational]
        authMechanism: none
        asyncMessaging: none
        deployTarget: container
        domain: none
`

const multiServiceWithRoot = `version: 2
methodology: deep
platforms: [claude-code]
project:
  projectType: backend
  backendConfig:
    apiStyle: rest
    dataStore: [relational]
    authMechanism: none
    asyncMessaging: none
    deployTarget: container
    domain: none
  services:
    - name: a
      projectType: backend
      backendConfig:
        apiStyle: rest
        dataStore: [relational]
        authMechanism: none
        asyncMessaging: none
        deployTarget: container
        domain: none
`

const GUARDED_COMMANDS = [
  'run', 'next', 'complete', 'skip', 'status', 'rework', 'reset', 'info', 'dashboard',
] as const

function mkProjectWithConfig(configYaml: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'))
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  fs.writeFileSync(path.join(root, '.scaffold', 'config.yml'), configYaml)
  // Some commands also need a state.json; write a minimal v2 one.
  fs.writeFileSync(path.join(root, '.scaffold', 'state.json'), JSON.stringify({
    'schema-version': 2,
    methodology: 'deep',
    'scaffold-version': '0.0.0-test',
    // ... other required fields per current state shape ...
  }))
  return root
}

describe.each(GUARDED_COMMANDS)('command %s rejects multi-service configs', (cmd) => {
  beforeEach(() => { process.exitCode = 0 })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import(`./commands/${cmd}.js`)
    // Invoke the command's handler with minimal argv; adapt the shape
    // to each command's expected args.
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })

  it('exits 2 on services[] + root projectType', async () => {
    const root = mkProjectWithConfig(multiServiceWithRoot)
    const { default: command } = await import(`./commands/${cmd}.js`)
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})
```

Adapt the test invocation shape to match each command's handler signature — some commands require positional args or additional flags. If a command cannot run with only `{ root }`, add the minimum additional argv each requires.

### Step 2: Run to verify failures

- [ ] Run:
```
npx vitest run src/cli/guards-integration.test.ts
```
Expected: FAIL — guards not wired yet.

### Step 3: Wire the guard into each of the 9 command handlers

For each of `run.ts`, `next.ts`, `complete.ts`, `skip.ts`, `status.ts`, `rework.ts`, `reset.ts`, `info.ts`, `dashboard.ts`:

- [ ] **Add import:**

```ts
import { assertSingleServiceOrExit } from '../guards.js'
```

- [ ] **After the config load (usually `const config = await loadConfig(...)` or similar, near the top of the handler) and before any `StateManager` or pipeline work:**

```ts
assertSingleServiceOrExit(config, { commandName: '<cmd-name>', output })
if (process.exitCode === 2) return
```

Replace `<cmd-name>` with the actual command name (`run`, `next`, etc.).

For commands that don't load config today (if any), add the minimal config load using the existing loader, then gate on the result. If the command currently doesn't access config at all, consult existing similar commands for the loader pattern.

### Step 4: Run tests

- [ ] Run:
```
npx vitest run src/cli/guards-integration.test.ts src/cli/commands/
make check-all
```
Expected: all green.

### Step 5: Commit

- [ ] **Commit:**
```bash
git add src/cli/commands/run.ts src/cli/commands/next.ts \
        src/cli/commands/complete.ts src/cli/commands/skip.ts \
        src/cli/commands/status.ts src/cli/commands/rework.ts \
        src/cli/commands/reset.ts src/cli/commands/info.ts \
        src/cli/commands/dashboard.ts \
        src/cli/guards-integration.test.ts
git commit -m "feat(cli): integrate multi-service guard into 9 stateful commands

Every command that instantiates StateManager (run, next, complete,
skip, status, rework, reset, info, dashboard) now calls
assertSingleServiceOrExit() at the top of its handler. Covers both
services-only and services + root projectType configurations.
Prevents silent-ignore of services[] ahead of Wave 2's real
multi-service execution support."
```

---

## Task 16: End-to-end smoke test (nibble-shaped 5-service YAML)

**Files:**
- Create: `src/e2e/service-manifest.test.ts`

### Step 1: Write the E2E test

- [ ] **Create `src/e2e/service-manifest.test.ts`:**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parse as parseYaml } from 'yaml'
import { ScaffoldConfigSchema } from '../config/schema.js'
import { initCommand, parseInitArgs } from '../cli/commands/init.js'

const nibbleManifest = `version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: strategy-evaluator
      projectType: library
      libraryConfig:
        visibility: internal
        documentationLevel: api-docs
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
    - name: backtesting-engine
      projectType: backend
      backendConfig:
        apiStyle: rest
        dataStore: [relational]
        authMechanism: apikey
        asyncMessaging: none
        deployTarget: container
        domain: fintech
      path: services/backtesting
    - name: trading-bot
      projectType: backend
      backendConfig:
        apiStyle: rest
        dataStore: [relational]
        authMechanism: oauth
        asyncMessaging: event-driven
        deployTarget: container
        domain: fintech
      path: services/trading-bot
    - name: dashboard
      projectType: web-app
      webAppConfig:
        renderingStrategy: ssr
        deployTarget: container
        realtime: websocket
        authFlow: oauth
      path: apps/dashboard
`

describe('E2E: scaffold init --from <nibble.yml>', () => {
  let root: string
  let manifestPath: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-nibble-'))
    manifestPath = path.join(root, 'services.yml')
    fs.writeFileSync(manifestPath, nibbleManifest, 'utf-8')
    process.exitCode = 0
  })

  it('materializes a nibble-shaped multi-service project', async () => {
    const argv = await parseInitArgs([
      '--from', manifestPath,
      '--root', root,
      '--auto',
    ])
    await initCommand.handler(argv)

    const configPath = path.join(root, '.scaffold', 'config.yml')
    const statePath = path.join(root, '.scaffold', 'state.json')
    const decisionsPath = path.join(root, '.scaffold', 'decisions.jsonl')

    expect(fs.existsSync(configPath)).toBe(true)
    expect(fs.existsSync(statePath)).toBe(true)
    expect(fs.existsSync(decisionsPath)).toBe(true)

    // Config round-trips (normalized).
    const parsedWritten = parseYaml(fs.readFileSync(configPath, 'utf8'))
    const parsedInput = parseYaml(nibbleManifest)
    const normalizedInput = ScaffoldConfigSchema.parse(parsedInput)
    expect(parsedWritten).toEqual(normalizedInput)

    // State emits schema-version 2 because services[] is present.
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state['schema-version']).toBe(2)

    // decisions.jsonl is empty (current behavior preserved).
    expect(fs.readFileSync(decisionsPath, 'utf8')).toBe('')

    // Project is "configured but not executable": scaffold run fails.
    const runCommand = (await import('../cli/commands/run.js')).default
    await runCommand.handler({ root, _: ['create-prd'], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})
```

### Step 2: Run the test

- [ ] Run:
```
npx vitest run src/e2e/service-manifest.test.ts
```
Expected: all assertions pass.

### Step 3: Commit

- [ ] **Commit:**
```bash
git add src/e2e/service-manifest.test.ts
git commit -m "test(e2e): nibble-shape scaffold init --from smoke

End-to-end proof: 5-service manifest (shared library + 3 FastAPI
backends + React frontend) materializes into .scaffold/config.yml
(byte-equivalent after Zod normalization), state.json with
schema-version 2, empty decisions.jsonl, and 'scaffold run' exits
2 with the Wave 2 message."
```

---

## Task 17: README + CHANGELOG

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

### Step 1: Update README.md

- [ ] **Find the `scaffold init` section of `README.md`. Add a new subsection after the flag table:**

```markdown
### Declarative init from a YAML manifest (`--from`)

For multi-service projects, use `scaffold init --from <file>` to provide a
full ScaffoldConfig as YAML instead of running the interactive wizard:

```bash
scaffold init --from services.yml --force
```

The file must be a complete ScaffoldConfig (with `version`, `methodology`,
`platforms`, and `project.services[]`). Pass `-` to read from stdin.

`--from` is exclusive with config-setting flags (`--methodology`, all
`--backend-*`, `--web-*`, etc.); combining them is an error. Operational
flags (`--root`, `--force`, `--auto`, `--verbose`, `--format`) still work.

**Caveat — multi-service execution**: Wave 3a ships the services schema
and declarative init path, but multi-service pipeline execution lands
in a future wave. A `services[]` config is configured but not yet
executable — running `scaffold run`, `scaffold next`, etc. against it
exits with code 2 and a clear diagnostic.
```

### Step 2: Update CHANGELOG.md

- [ ] **In `CHANGELOG.md`, append to the existing `[Unreleased]` section (or add one above the most recent release):**

```markdown
## [Unreleased]

### Added
- **Multi-service manifest schema**: `ProjectSchema.services[]` accepts an array of per-service configs (each with `name`, `projectType`, one matching per-type config, and optional `path`). Service names must be kebab-case.
- **Declarative init**: `scaffold init --from <file.yml>` reads a full ScaffoldConfig from YAML (or stdin via `-`) instead of running the wizard. Exclusive with config-setting flags.
- **Multi-service execution guard**: `scaffold run`, `next`, `complete`, `skip`, `status`, `rework`, `reset`, `info`, and `dashboard` reject configs containing `services[]` with a clear "lands in Wave 2" message until multi-service execution ships.

### Changed
- **State `schema-version`**: widened from literal `1` to `1 | 2`. Projects with `services[]` initialize state at version 2; single-service projects stay at version 1. The v2 shape is identical to v1 for Wave 3a; Wave 3b will change the shape and bump to 3.
- **`ProjectSchema.superRefine` refactored**: per-type coupling validation moved into `src/config/validators/` modules shared by `ProjectSchema` and the new `ServiceSchema`. Behavior-preserving.
- **`runWizard()` split**: `collectWizardAnswers` + `materializeScaffoldProject` exported separately. `scaffold init --from` uses the materializer directly.
```

### Step 3: Verify make check-all still green

- [ ] Run:
```
make check-all
```
Expected: clean.

### Step 4: Commit

- [ ] **Commit:**
```bash
git add README.md CHANGELOG.md
git commit -m "docs(wave-3a): README + CHANGELOG for --from and services schema

Documents scaffold init --from, flag exclusivity, the multi-service
execution caveat, and the schema-version widening (1|2) and wizard
seam split."
```

---

## Task 18: Final branch-level quality gate

### Step 1: Run everything

- [ ] Run:
```
make check-all
```
Expected: lint + validate + tests (bats + vitest) + tsc all green.

### Step 2: Push and create PR

- [ ] Branch should be named `wave-3a-service-manifest` (or similar). Push and create PR with the summary below:

```bash
git push -u origin wave-3a-service-manifest
gh pr create --title "feat(wave-3a): multi-service manifest + declarative init + state dispatch" \
  --body "$(cat <<'EOF'
## Summary

Wave 3a of the multi-service evolution. Unblocks Wave 2 (cross-service pipeline) and Wave 3b (per-service state).

- \`ServiceSchema\` with kebab-case names, strict fields, multi-issue emission, and forward-direction coupling rule
- \`ProjectSchema.services[]\` with unique-name refinement
- \`scaffold init --from <file.yml>\` declarative init (exclusive with config-setting flags)
- Wizard seam split: \`collectWizardAnswers\` + \`materializeScaffoldProject\`
- State dispatch framework: \`schema-version: 1 | 2\`, v2 shape = v1 shape, Wave 3b bumps to v3
- Multi-service execution guard across 9 stateful commands (run, next, complete, skip, status, rework, reset, info, dashboard)
- \`ScaffoldUserError\` taxonomy + handler-level catch mapping to exit 2
- Validator refactor: per-type modules under \`src/config/validators/\` (Approach 3 + required per-module tests)

Plan: \`docs/superpowers/plans/2026-04-15-wave-3a-service-manifest.md\`
Spec: \`docs/superpowers/specs/2026-04-15-wave-3a-service-manifest-design.md\` (rev 4, reviewed over 3 rounds)

## Test plan

- [x] \`make check-all\` — bats, vitest, eslint, tsc all green
- [x] E2E smoke: nibble-shaped 5-service manifest materializes; \`scaffold run\` exits 2
- [ ] 3-channel PR review (Codex + Gemini + Claude) per CLAUDE.md
- [ ] CI green on GitHub
EOF
)"
```

### Step 3: 3-channel review

Per `CLAUDE.md`, run the mandatory 3-channel review:

```bash
node packages/mmr/dist/index.js review --pr <PR#> --sync --format json
```

Fix all P0/P1/P2 findings before merging.

### Step 4: Squash merge

- [ ] After CI green + 3-channel review passed:

```bash
gh pr merge --squash --delete-branch
```

---

## Out of Scope for This Plan

- **Multi-service `scaffold adopt`** — detection of existing monorepos. Separate future wave.
- **`resolveOverlayState` changes** for multi-service pipelines — Wave 2.
- **Per-service state splitting** — Wave 3b.
- **`services[].exports` field** — Wave 3c owns shape + semantics.
- **Validating that `path` exists on disk** — Wave 3b will sanitize per Wave 0's `resolveContainedArtifactPath` pattern when paths become execution-load-bearing.
- **Config-version migration framework** — not needed until Wave 3c potentially changes the config shape.
