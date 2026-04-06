# Project-Type Overlays (Release 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use multi-model reviews after each task and fix all P0, P1, and P2 findings.

**Goal:** Add overlay support for library and mobile-app project types with typed configs, CLI flags, wizard questions, and domain knowledge injection.

**Architecture:** Identical to Release 1 — knowledge-first approach, inject domain knowledge into existing pipeline steps. Follow all patterns from Release 1 exactly. See `docs/superpowers/specs/2026-04-06-project-type-overlays-release2-design.md` for the spec.

**Tech Stack:** TypeScript, Zod, yargs, vitest, js-yaml

---

## Task Overview

Tasks follow the same ordering as Release 1 to ensure every commit compiles:

1. Add LibraryConfigSchema + MobileAppConfigSchema + derived types
2. Extend ProjectConfig + ProjectSchema .superRefine()
3. Schema tests
4. Add library + mobile-app CLI flags
5. Add .check() validation + .group() + handler auto-detection
6. Add library + mobile-app wizard questions
7. Extend WizardOptions + passthrough + serialization
8. CLI flag tests
9. Wizard tests
10. Create library-overlay.yml + mobile-app-overlay.yml
11. Overlay loader tests
12. Library knowledge entries (batch 1: 6 files)
13. Library knowledge entries (batch 2: 6 files)
14. Mobile-app knowledge entries (batch 1: 6 files)
15. Mobile-app knowledge entries (batch 2: 6 files)
16. Update README + CHANGELOG

---

### Task 1: Add LibraryConfigSchema + MobileAppConfigSchema + derived types

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/types/config.ts`

- [ ] **Step 1: Add LibraryConfigSchema to schema.ts**

After `CliConfigSchema`:

```typescript
export const LibraryConfigSchema = z.object({
  visibility: z.enum(['public', 'internal']),
  runtimeTarget: z.enum(['node', 'browser', 'isomorphic', 'edge']).default('isomorphic'),
  bundleFormat: z.enum(['esm', 'cjs', 'dual', 'unbundled']).default('dual'),
  hasTypeDefinitions: z.boolean().default(true),
  documentationLevel: z.enum(['none', 'readme', 'api-docs', 'full-site']).default('readme'),
}).strict()
```

- [ ] **Step 2: Add MobileAppConfigSchema to schema.ts**

```typescript
export const MobileAppConfigSchema = z.object({
  platform: z.enum(['ios', 'android', 'cross-platform']),
  distributionModel: z.enum(['public', 'private', 'mixed']).default('public'),
  offlineSupport: z.enum(['none', 'cache', 'offline-first']).default('none'),
  hasPushNotifications: z.boolean().default(false),
}).strict()
```

- [ ] **Step 3: Add derived types to types/config.ts**

```typescript
import { LibraryConfigSchema, MobileAppConfigSchema } from '../config/schema.js'

export type LibraryConfig = z.infer<typeof LibraryConfigSchema>
export type MobileAppConfig = z.infer<typeof MobileAppConfigSchema>
```

Add to the existing schema import line.

- [ ] **Step 4: Run type-check** — `npx tsc --noEmit`
- [ ] **Step 5: Commit** — `"feat: add LibraryConfig and MobileAppConfig Zod schemas"`

---

### Task 2: Extend ProjectConfig + ProjectSchema .superRefine()

**Files:**
- Modify: `src/types/config.ts` (ProjectConfig)
- Modify: `src/config/schema.ts` (ProjectSchema)

- [ ] **Step 1: Add to ProjectConfig interface**

```typescript
libraryConfig?: LibraryConfig
mobileAppConfig?: MobileAppConfig
```

- [ ] **Step 2: Add to ProjectSchema z.object()**

```typescript
libraryConfig: LibraryConfigSchema.optional(),
mobileAppConfig: MobileAppConfigSchema.optional(),
```

- [ ] **Step 3: Add to .superRefine()**

```typescript
if (data.libraryConfig !== undefined && data.projectType !== 'library') {
  ctx.addIssue({ path: ['libraryConfig'], code: 'custom',
    message: 'libraryConfig requires projectType: library' })
}
if (data.mobileAppConfig !== undefined && data.projectType !== 'mobile-app') {
  ctx.addIssue({ path: ['mobileAppConfig'], code: 'custom',
    message: 'mobileAppConfig requires projectType: mobile-app' })
}
```

- [ ] **Step 4: Run type-check + tests** — `npx tsc --noEmit && npx vitest run src/config/schema.test.ts`
- [ ] **Step 5: Commit** — `"feat: extend ProjectConfig and ProjectSchema for library and mobile-app"`

---

### Task 3: Schema tests

**Files:**
- Modify: `src/config/schema.test.ts`

- [ ] **Step 1: Add LibraryConfigSchema tests** — required field, defaults, .strict() rejection
- [ ] **Step 2: Add MobileAppConfigSchema tests** — required field, defaults, .strict() rejection
- [ ] **Step 3: Add cross-field tests** — libraryConfig with non-library type rejected, mobileAppConfig with non-mobile type rejected, both accepted with correct types, projectType library/mobile-app without config block allowed
- [ ] **Step 4: Run tests** — `npx vitest run src/config/schema.test.ts`
- [ ] **Step 5: Commit** — `"test: add schema tests for LibraryConfig and MobileAppConfig"`

---

### Task 4: Add library + mobile-app CLI flags

**Files:**
- Modify: `src/cli/commands/init.ts` (InitArgs + .option() calls)

- [ ] **Step 1: Add to InitArgs**

```typescript
'lib-visibility'?: string
'lib-runtime-target'?: string
'lib-bundle-format'?: string
'lib-type-definitions'?: boolean
'lib-doc-level'?: string
'mobile-platform'?: string
'mobile-distribution'?: string
'mobile-offline'?: string
'mobile-push-notifications'?: boolean
```

- [ ] **Step 2: Add library .option() calls**

```typescript
.option('lib-visibility', { type: 'string', describe: 'Library visibility', choices: ['public', 'internal'] as const })
.option('lib-runtime-target', { type: 'string', describe: 'Runtime target', choices: ['node', 'browser', 'isomorphic', 'edge'] as const })
.option('lib-bundle-format', { type: 'string', describe: 'Bundle format', choices: ['esm', 'cjs', 'dual', 'unbundled'] as const })
.option('lib-type-definitions', { type: 'boolean', describe: 'Ship type definitions' })
.option('lib-doc-level', { type: 'string', describe: 'Documentation level', choices: ['none', 'readme', 'api-docs', 'full-site'] as const })
```

- [ ] **Step 3: Add mobile-app .option() calls**

```typescript
.option('mobile-platform', { type: 'string', describe: 'Target platform', choices: ['ios', 'android', 'cross-platform'] as const })
.option('mobile-distribution', { type: 'string', describe: 'Distribution model', choices: ['public', 'private', 'mixed'] as const })
.option('mobile-offline', { type: 'string', describe: 'Offline support', choices: ['none', 'cache', 'offline-first'] as const })
.option('mobile-push-notifications', { type: 'boolean', describe: 'Push notification support' })
```

- [ ] **Step 4: Run type-check** — `npx tsc --noEmit`
- [ ] **Step 5: Commit** — `"feat: add 9 CLI flags for library and mobile-app project types"`

---

### Task 5: Add .check() validation + .group() + handler

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1: Add flag family constants at module level**

```typescript
const LIB_FLAGS = ['lib-visibility', 'lib-runtime-target', 'lib-bundle-format', 'lib-type-definitions', 'lib-doc-level'] as const
const MOBILE_FLAGS = ['mobile-platform', 'mobile-distribution', 'mobile-offline', 'mobile-push-notifications'] as const
```

- [ ] **Step 2: Add to .check() — mixed-family detection**

Add `hasLibFlag` and `hasMobileFlag` to the existing detection, extend `typeCount`.

- [ ] **Step 3: Add type-conflict checks** — lib flags require library, mobile flags require mobile-app

- [ ] **Step 4: Add .group() calls**

```typescript
.group([...LIB_FLAGS], 'Library Configuration:')
.group([...MOBILE_FLAGS], 'Mobile-App Configuration:')
```

- [ ] **Step 5: Add handler auto-detection and flag passthrough**

Extend `detectedType` with `hasLibFlag ? 'library' : hasMobileFlag ? 'mobile-app'`. Pass all 9 flags to `runWizard()` using bracket notation.

- [ ] **Step 6: Run type-check** — will error until WizardOptions extended (Task 7)
- [ ] **Step 7: Commit** — `"feat: add .check() validation, .group(), handler for library and mobile-app flags"`

---

### Task 6: Extend WizardOptions + wizard questions + serialization

**Files:**
- Modify: `src/wizard/wizard.ts` (WizardOptions + serialization)
- Modify: `src/wizard/questions.ts` (WizardAnswers + options + question blocks)

- [ ] **Step 1: Add to WizardOptions in wizard.ts**

```typescript
libVisibility?: string
libRuntimeTarget?: string
libBundleFormat?: string
libTypeDefinitions?: boolean
libDocLevel?: string
mobilePlatform?: string
mobileDistribution?: string
mobileOffline?: string
mobilePushNotifications?: boolean
```

- [ ] **Step 2: Pass through to askWizardQuestions**

- [ ] **Step 3: Add to config serialization**

```typescript
...(answers.libraryConfig && { libraryConfig: answers.libraryConfig }),
...(answers.mobileAppConfig && { mobileAppConfig: answers.mobileAppConfig }),
```

- [ ] **Step 4: Extend WizardAnswers in questions.ts**

```typescript
libraryConfig?: LibraryConfig
mobileAppConfig?: MobileAppConfig
```

- [ ] **Step 5: Extend askWizardQuestions options parameter** with the 9 new fields

- [ ] **Step 6: Add library question block** (after CLI, before game)

```typescript
if (projectType === 'library') {
  if (auto && !options.libVisibility) {
    throw new Error('--lib-visibility is required in auto mode for library projects')
  }
  // visibility (required), runtimeTarget, bundleFormat, hasTypeDefinitions, documentationLevel
  // Follow same flag-skip pattern as Release 1
  answers.libraryConfig = { visibility, runtimeTarget, bundleFormat, hasTypeDefinitions, documentationLevel }
}
```

- [ ] **Step 7: Add mobile-app question block**

```typescript
if (projectType === 'mobile-app') {
  if (auto && !options.mobilePlatform) {
    throw new Error('--mobile-platform is required in auto mode for mobile-app projects')
  }
  // platform (required), distributionModel, offlineSupport, hasPushNotifications
  answers.mobileAppConfig = { platform, distributionModel, offlineSupport, hasPushNotifications }
}
```

- [ ] **Step 8: Run type-check + tests** — `npx tsc --noEmit && npx vitest run`
- [ ] **Step 9: Commit** — `"feat: add library and mobile-app wizard questions with flag-skip pattern"`

---

### Task 7: CLI flag tests

**Files:**
- Modify: `src/cli/commands/init.test.ts`

- [ ] **Step 1: Add auto-detection tests** for lib and mobile flags
- [ ] **Step 2: Add mixed-family rejection** — lib + mobile, lib + web, mobile + game
- [ ] **Step 3: Add type-conflict tests** — --lib-visibility with --project-type backend
- [ ] **Step 4: Run tests + commit** — `"test: add CLI flag tests for library and mobile-app flags"`

---

### Task 8: Wizard tests

**Files:**
- Modify: `src/wizard/questions.test.ts`

- [ ] **Step 1: Add library flag-skip tests** — all flags provided, auto-mode required error, auto-mode defaults
- [ ] **Step 2: Add mobile-app flag-skip tests** — all flags provided, auto-mode required error
- [ ] **Step 3: Run tests + commit** — `"test: add wizard tests for library and mobile-app question flows"`

---

### Task 9: Create library-overlay.yml + mobile-app-overlay.yml

**Files:**
- Create: `content/methodology/library-overlay.yml`
- Create: `content/methodology/mobile-app-overlay.yml`

- [ ] **Step 1: Create library-overlay.yml**

Knowledge-only overlay injecting library domain knowledge into ~22 pipeline steps. Reference entries: `library-requirements`, `library-conventions`, `library-project-structure`, `library-dev-environment`, `library-architecture`, `library-api-design`, `library-bundling`, `library-type-definitions`, `library-documentation`, `library-versioning`, `library-security`, `library-testing`.

- [ ] **Step 2: Create mobile-app-overlay.yml**

Knowledge-only overlay injecting mobile domain knowledge into ~24 pipeline steps. Reference entries: `mobile-app-requirements`, `mobile-app-conventions`, `mobile-app-project-structure`, `mobile-app-dev-environment`, `mobile-app-architecture`, `mobile-app-deployment`, `mobile-app-offline-patterns`, `mobile-app-push-notifications`, `mobile-app-security`, `mobile-app-observability`, `mobile-app-testing`, `mobile-app-distribution`.

- [ ] **Step 3: Commit** — `"feat: add library and mobile-app overlay YAML files"`

---

### Task 10: Overlay loader tests

**Files:**
- Modify: `src/core/assembly/overlay-loader.test.ts`

- [ ] **Step 1: Add tests** verifying both overlays load with correct projectType and knowledge counts
- [ ] **Step 2: Run + commit** — `"test: add overlay loader tests for library and mobile-app overlays"`

---

### Task 11: Library knowledge entries (batch 1)

**Files:**
- Create: `content/knowledge/library/` (6 files)

Files: `library-requirements.md`, `library-conventions.md`, `library-project-structure.md`, `library-dev-environment.md`, `library-architecture.md`, `library-api-design.md`

- [ ] **Step 1: Write all 6 files** following established format (frontmatter + Summary + Deep Guidance)
- [ ] **Step 2: `make validate` + commit** — `"feat: add library knowledge entries (batch 1)"`

---

### Task 12: Library knowledge entries (batch 2)

**Files:**
- Create: 6 files in `content/knowledge/library/`

Files: `library-bundling.md`, `library-type-definitions.md`, `library-documentation.md`, `library-versioning.md`, `library-security.md`, `library-testing.md`

- [ ] **Step 1: Write all 6 files**
- [ ] **Step 2: `make validate` + commit** — `"feat: add library knowledge entries (batch 2)"`

---

### Task 13: Mobile-app knowledge entries (batch 1)

**Files:**
- Create: `content/knowledge/mobile-app/` (6 files)

Files: `mobile-app-requirements.md`, `mobile-app-conventions.md`, `mobile-app-project-structure.md`, `mobile-app-dev-environment.md`, `mobile-app-architecture.md`, `mobile-app-deployment.md`

- [ ] **Step 1: Write all 6 files**
- [ ] **Step 2: `make validate` + commit** — `"feat: add mobile-app knowledge entries (batch 1)"`

---

### Task 14: Mobile-app knowledge entries (batch 2)

**Files:**
- Create: 6 files in `content/knowledge/mobile-app/`

Files: `mobile-app-offline-patterns.md`, `mobile-app-push-notifications.md`, `mobile-app-security.md`, `mobile-app-observability.md`, `mobile-app-testing.md`, `mobile-app-distribution.md`

- [ ] **Step 1: Write all 6 files**
- [ ] **Step 2: `make validate` + commit** — `"feat: add mobile-app knowledge entries (batch 2)"`

---

### Task 15: Integration tests

**Files:**
- Modify: `src/e2e/project-type-overlays.test.ts`

- [ ] **Step 1: Add library integration tests** — config validation, overlay loading, knowledge injection
- [ ] **Step 2: Add mobile-app integration tests** — same pattern
- [ ] **Step 3: Run + commit** — `"test: add integration tests for library and mobile-app overlay flow"`

---

### Task 16: Update README + CHANGELOG

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update README** — add library and mobile-app to overlay table, add CLI flag tables, add CI examples
- [ ] **Step 2: Update CHANGELOG** — add `[3.8.0]` entry
- [ ] **Step 3: `make check-all` + commit** — `"docs: update README and CHANGELOG for Release 2 overlays"`
