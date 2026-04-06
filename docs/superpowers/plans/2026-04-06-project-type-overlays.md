# Project-Type Overlays (Release 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use multi-model reviews after each task and fix all P0, P1, and P2 findings.

**Goal:** Add overlay support for web-app, backend, and cli project types with typed configs, CLI flags, wizard questions, and domain knowledge injection.

**Architecture:** Knowledge-first approach — inject domain knowledge into existing pipeline steps via overlay YAML files. No new pipeline steps. Each type gets a typed config (WebAppConfig, BackendConfig, CliConfig) with Zod schemas, CLI flags, and wizard questions following the existing GameConfig pattern.

**Tech Stack:** TypeScript, Zod, yargs, vitest, js-yaml

**Spec:** `docs/superpowers/specs/2026-04-06-project-type-overlays-design.md`

**Critical task ordering:** Tasks are ordered so every commit compiles. The wizard plumbing (WizardOptions, questions, serialization) is wired up BEFORE the CLI handler passes new flags through. The sequence is: types/schemas (1-4) → wizard internals (5-10) → CLI flags/handler (11-13) → overlays/content (14-22) → aliases/docs (23-25).

---

## File Structure

### Modified Files
| File | Responsibility |
|------|---------------|
| `src/config/schema.ts` | Add new Zod schemas, extend ProjectSchema with .superRefine() |
| `src/types/config.ts` | Derive new types from Zod, extend ProjectConfig |
| `src/core/assembly/overlay-loader.ts` | Replace hardcoded validProjectTypes with schema import |
| `src/cli/commands/init.ts` | Add 12 new CLI flags, .check() validation, .group(), handler |
| `src/wizard/questions.ts` | Extend WizardAnswers, add wizard questions for 3 types |
| `src/wizard/wizard.ts` | Extend WizardOptions, add config serialization |

### Deleted Files
| File | Reason |
|------|--------|
| `src/types/wizard.ts` | Stale duplicate WizardAnswers interface — nothing imports it |

### Created Files
| File | Responsibility |
|------|---------------|
| `content/methodology/web-app-overlay.yml` | Web-app overlay: knowledge injection into ~28 pipeline steps |
| `content/methodology/backend-overlay.yml` | Backend overlay: knowledge injection into ~28 pipeline steps |
| `content/methodology/cli-overlay.yml` | CLI overlay: knowledge injection into ~25 pipeline steps |
| `content/knowledge/web-app/*.md` | ~17 web-app domain expertise entries |
| `content/knowledge/backend/*.md` | ~15 backend domain expertise entries |
| `content/knowledge/cli/*.md` | ~10 CLI domain expertise entries |

### Test Files
| File | Responsibility |
|------|---------------|
| `src/config/schema.test.ts` | Add tests for new schemas, .superRefine(), cross-field validation |
| `src/cli/commands/init.test.ts` | Add tests for new flags, auto-detection, mixed-family rejection |
| `src/wizard/questions.test.ts` | Add tests for new wizard questions, flag-skip pattern |
| `src/core/assembly/overlay-loader.test.ts` | Add tests for new overlay YAML loading |

---

### Task 1: Refactor ProjectType to single source of truth

**Files:**
- Modify: `src/config/schema.ts:15-17`
- Modify: `src/types/config.ts:21-22`
- Modify: `src/core/assembly/overlay-loader.ts:186`
- Modify: `src/cli/commands/init.ts:76-78`
- Modify: `src/wizard/questions.ts:100-102`
- Test: `src/config/schema.test.ts`

- [ ] **Step 1: Write failing test**

In `src/config/schema.test.ts`, add a test that verifies ProjectTypeSchema.options is the canonical list and includes all expected values:

```typescript
describe('ProjectTypeSchema', () => {
  it('includes all project types', () => {
    expect(ProjectTypeSchema.options).toEqual(
      expect.arrayContaining(['web-app', 'mobile-app', 'backend', 'cli', 'library', 'game']),
    )
    expect(ProjectTypeSchema.options).toHaveLength(6)
  })
})
```

- [ ] **Step 2: Run test to verify it passes** (this is a baseline — it should pass since the enum already has these values)

Run: `npx vitest run src/config/schema.test.ts --reporter=verbose`

- [ ] **Step 3: Update types/config.ts to derive ProjectType from Zod**

Replace line 22 of `src/types/config.ts`:

```typescript
// OLD:
export type ProjectType = 'web-app' | 'mobile-app' | 'backend' | 'cli' | 'library' | 'game'

// NEW:
import { ProjectTypeSchema } from '../config/schema.js'
export type ProjectType = z.infer<typeof ProjectTypeSchema>
```

Add `import type { z } from 'zod'` if not already imported (type-only import — `z.infer<>` is compile-time only).

- [ ] **Step 4: Update overlay-loader.ts to import from schema**

Replace line 186 of `src/core/assembly/overlay-loader.ts`:

```typescript
// OLD:
const validProjectTypes: ProjectType[] = ['web-app', 'mobile-app', 'backend', 'cli', 'library', 'game']

// NEW:
import { ProjectTypeSchema } from '../../config/schema.js'
const validProjectTypes = ProjectTypeSchema.options
```

Remove the now-unused `ProjectType` import if it was only used for the type annotation.

- [ ] **Step 5: Update init.ts to import choices from schema**

Replace lines 76-78 of `src/cli/commands/init.ts`:

```typescript
// OLD:
.option('project-type', {
  type: 'string',
  describe: 'Project type (web-app/mobile-app/backend/cli/library/game)',
  choices: ['web-app', 'mobile-app', 'backend', 'cli', 'library', 'game'] as const,
})

// NEW:
import { ProjectTypeSchema } from '../../config/schema.js'
// ...
.option('project-type', {
  type: 'string',
  describe: `Project type (${ProjectTypeSchema.options.join('/')})`,
  choices: ProjectTypeSchema.options as unknown as string[],
})
```

- [ ] **Step 6: Update questions.ts to import choices from schema**

Replace lines 100-102 of `src/wizard/questions.ts`:

```typescript
// OLD:
const selected = await output.select(
  'What type of project is this?',
  ['web-app', 'mobile-app', 'backend', 'cli', 'library', 'game'],
  'web-app',
)

// NEW:
import { ProjectTypeSchema } from '../config/schema.js'
// ...
const selected = await output.select(
  'What type of project is this?',
  [...ProjectTypeSchema.options],
  'web-app',
)
```

- [ ] **Step 7: Run type-check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/config/schema.ts src/types/config.ts src/core/assembly/overlay-loader.ts src/cli/commands/init.ts src/wizard/questions.ts src/config/schema.test.ts
git commit -m "refactor: single source of truth for ProjectType enum

Derive ProjectType from ProjectTypeSchema. All consumers import from
schema.ts instead of maintaining hardcoded arrays."
```

---

### Task 2: Add new config Zod schemas + derived types

**Files:**
- Modify: `src/config/schema.ts:17` (after ProjectTypeSchema)
- Modify: `src/types/config.ts:22` (after ProjectType)

- [ ] **Step 1: Add WebAppConfigSchema to schema.ts**

After `ProjectTypeSchema` (line 17), add:

```typescript
export const WebAppConfigSchema = z.object({
  renderingStrategy: z.enum(['spa', 'ssr', 'ssg', 'hybrid']),
  deployTarget: z.enum(['static', 'serverless', 'container', 'edge', 'long-running']).default('serverless'),
  realtime: z.enum(['none', 'websocket', 'sse']).default('none'),
  authFlow: z.enum(['none', 'session', 'oauth', 'passkey']).default('none'),
}).strict()
```

- [ ] **Step 2: Add BackendConfigSchema to schema.ts**

```typescript
export const BackendConfigSchema = z.object({
  apiStyle: z.enum(['rest', 'graphql', 'grpc', 'trpc', 'none']),
  dataStore: z.array(z.enum(['relational', 'document', 'key-value'])).min(1).default(['relational']),
  authMechanism: z.enum(['none', 'jwt', 'session', 'oauth', 'apikey']).default('none'),
  asyncMessaging: z.enum(['none', 'queue', 'event-driven']).default('none'),
  deployTarget: z.enum(['serverless', 'container', 'long-running']).default('container'),
}).strict()
```

- [ ] **Step 3: Add CliConfigSchema to schema.ts**

```typescript
export const CliConfigSchema = z.object({
  interactivity: z.enum(['args-only', 'interactive', 'hybrid']),
  distributionChannels: z.array(z.enum(['package-manager', 'system-package-manager', 'standalone-binary', 'container'])).min(1).default(['package-manager']),
  hasStructuredOutput: z.boolean().default(false),
}).strict()
```

- [ ] **Step 4: Add derived types to types/config.ts**

After the `ProjectType` derivation, add:

```typescript
import { WebAppConfigSchema, BackendConfigSchema, CliConfigSchema } from '../config/schema.js'

export type WebAppConfig = z.infer<typeof WebAppConfigSchema>
export type BackendConfig = z.infer<typeof BackendConfigSchema>
export type CliConfig = z.infer<typeof CliConfigSchema>
```

- [ ] **Step 5: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts src/types/config.ts
git commit -m "feat: add WebAppConfig, BackendConfig, CliConfig Zod schemas

Strict schemas with required anchor fields (renderingStrategy, apiStyle,
interactivity) and sensible defaults for all other fields. TS types
derived from Zod via z.infer<>."
```

---

### Task 3: Extend ProjectConfig + ProjectSchema with .superRefine()

**Files:**
- Modify: `src/types/config.ts:70-77` (ProjectConfig)
- Modify: `src/config/schema.ts:37-52` (ProjectSchema)

- [ ] **Step 1: Extend ProjectConfig interface**

Replace `src/types/config.ts` lines 70-77:

```typescript
export interface ProjectConfig {
  name?: string
  platforms?: Array<'web' | 'mobile' | 'desktop'>
  projectType?: ProjectType
  gameConfig?: GameConfig
  webAppConfig?: WebAppConfig
  backendConfig?: BackendConfig
  cliConfig?: CliConfig
  [key: string]: unknown
}
```

- [ ] **Step 2: Add new fields to ProjectSchema and replace .refine() with .superRefine()**

Replace `src/config/schema.ts` lines 37-52:

```typescript
const ProjectSchema = z.object({
  name: z.string().min(1).optional(),
  platforms: z.array(z.enum(['web', 'mobile', 'desktop'])).optional(),
  projectType: ProjectTypeSchema.optional(),
  gameConfig: GameConfigSchema.optional(),
  webAppConfig: WebAppConfigSchema.optional(),
  backendConfig: BackendConfigSchema.optional(),
  cliConfig: CliConfigSchema.optional(),
}).passthrough()
  .superRefine((data, ctx) => {
    if (data.gameConfig !== undefined && data.projectType !== 'game') {
      ctx.addIssue({ path: ['gameConfig'], code: 'custom',
        message: 'gameConfig is only valid when projectType is "game"' })
    }
    if (data.webAppConfig !== undefined && data.projectType !== 'web-app') {
      ctx.addIssue({ path: ['webAppConfig'], code: 'custom',
        message: 'webAppConfig requires projectType: web-app' })
    }
    if (data.backendConfig !== undefined && data.projectType !== 'backend') {
      ctx.addIssue({ path: ['backendConfig'], code: 'custom',
        message: 'backendConfig requires projectType: backend' })
    }
    if (data.cliConfig !== undefined && data.projectType !== 'cli') {
      ctx.addIssue({ path: ['cliConfig'], code: 'custom',
        message: 'cliConfig requires projectType: cli' })
    }
    if (data.webAppConfig) {
      const { renderingStrategy, deployTarget, authFlow } = data.webAppConfig
      if (['ssr', 'hybrid'].includes(renderingStrategy) && deployTarget === 'static') {
        ctx.addIssue({ path: ['webAppConfig', 'deployTarget'], code: 'custom',
          message: 'SSR/hybrid rendering requires compute, not static hosting' })
      }
      if (authFlow === 'session' && deployTarget === 'static') {
        ctx.addIssue({ path: ['webAppConfig', 'authFlow'], code: 'custom',
          message: 'Session auth requires server state, incompatible with static hosting' })
      }
    }
  })
```

- [ ] **Step 3: Run type-check and existing tests**

Run: `npx tsc --noEmit && npx vitest run src/config/schema.test.ts`
Expected: All pass. Existing gameConfig gating tests still pass because .superRefine() preserves the same behavior.

- [ ] **Step 4: Commit**

```bash
git add src/types/config.ts src/config/schema.ts
git commit -m "feat: extend ProjectConfig and ProjectSchema for new config types

Add webAppConfig, backendConfig, cliConfig to ProjectConfig and
ProjectSchema. Replace .refine() with .superRefine() for consolidated
cross-field validation including SSR+static and session+static checks."
```

---

### Task 4: Schema tests for new config types

**Files:**
- Modify: `src/config/schema.test.ts`

- [ ] **Step 1: Add WebAppConfigSchema tests**

```typescript
describe('WebAppConfigSchema', () => {
  it('requires renderingStrategy', () => {
    const result = WebAppConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts valid config with defaults', () => {
    const result = WebAppConfigSchema.parse({ renderingStrategy: 'ssr' })
    expect(result).toEqual({
      renderingStrategy: 'ssr',
      deployTarget: 'serverless',
      realtime: 'none',
      authFlow: 'none',
    })
  })

  it('rejects unknown fields (.strict())', () => {
    const result = WebAppConfigSchema.safeParse({
      renderingStrategy: 'spa',
      unknownField: 'value',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Add BackendConfigSchema tests**

```typescript
describe('BackendConfigSchema', () => {
  it('requires apiStyle', () => {
    const result = BackendConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts valid config with defaults', () => {
    const result = BackendConfigSchema.parse({ apiStyle: 'rest' })
    expect(result).toEqual({
      apiStyle: 'rest',
      dataStore: ['relational'],
      authMechanism: 'none',
      asyncMessaging: 'none',
      deployTarget: 'container',
    })
  })

  it('enforces dataStore min(1)', () => {
    const result = BackendConfigSchema.safeParse({
      apiStyle: 'rest',
      dataStore: [],
    })
    expect(result.success).toBe(false)
  })

  it('accepts apiStyle none for workers', () => {
    const result = BackendConfigSchema.parse({ apiStyle: 'none' })
    expect(result.apiStyle).toBe('none')
  })
})
```

- [ ] **Step 3: Add CliConfigSchema tests**

```typescript
describe('CliConfigSchema', () => {
  it('requires interactivity', () => {
    const result = CliConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts valid config with defaults', () => {
    const result = CliConfigSchema.parse({ interactivity: 'hybrid' })
    expect(result).toEqual({
      interactivity: 'hybrid',
      distributionChannels: ['package-manager'],
      hasStructuredOutput: false,
    })
  })

  it('enforces distributionChannels min(1)', () => {
    const result = CliConfigSchema.safeParse({
      interactivity: 'args-only',
      distributionChannels: [],
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 4: Add ProjectSchema cross-field validation tests**

```typescript
describe('ProjectSchema cross-field validation', () => {
  it('rejects webAppConfig with non-web-app projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'backend',
        webAppConfig: { renderingStrategy: 'spa' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts webAppConfig with web-app projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'spa' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects SSR + static deploy', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'ssr', deployTarget: 'static' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects session auth + static deploy', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'spa', deployTarget: 'static', authFlow: 'session' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('allows projectType web-app without webAppConfig', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: { projectType: 'web-app' },
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 5: Run all schema tests**

Run: `npx vitest run src/config/schema.test.ts --reporter=verbose`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.test.ts
git commit -m "test: add schema tests for WebAppConfig, BackendConfig, CliConfig

Tests cover required fields, defaults, .strict() rejection, projectType
gating, cross-field validation (SSR+static, session+static), and
config block optionality."
```

---

### Task 5: Clean up WizardAnswers + extend

**Files:**
- Delete: `src/types/wizard.ts`
- Modify: `src/wizard/questions.ts:5-12`

- [ ] **Step 1: Delete stale src/types/wizard.ts and clean up barrel export**

Verify nothing imports `WizardAnswers` from the types barrel:
```bash
grep -r "from.*types/wizard" src/ --include="*.ts"
grep -r "WizardAnswers.*from.*types" src/ --include="*.ts"
```

Delete `src/types/wizard.ts`. Then remove the re-export from `src/types/index.ts` — delete the line `export * from './wizard.js'` (line 11). Without this cleanup, `tsc` will fail because the barrel tries to re-export a deleted file.

- [ ] **Step 2: Extend WizardAnswers in questions.ts**

Replace `src/wizard/questions.ts` lines 5-12:

```typescript
export interface WizardAnswers {
  methodology: 'deep' | 'mvp' | 'custom'
  depth: 1 | 2 | 3 | 4 | 5
  platforms: Array<'claude-code' | 'codex' | 'gemini'>
  traits: string[]
  projectType?: ProjectType
  gameConfig?: GameConfig
  webAppConfig?: WebAppConfig
  backendConfig?: BackendConfig
  cliConfig?: CliConfig
}
```

Add imports for the new types at the top of the file.

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git rm src/types/wizard.ts
git add src/wizard/questions.ts
git commit -m "refactor: consolidate WizardAnswers, extend with new config types

Delete stale duplicate WizardAnswers in types/wizard.ts. Extend
canonical version in questions.ts with webAppConfig, backendConfig,
cliConfig fields."
```

---

### Task 6: Extend WizardOptions + config serialization

**Files:**
- Modify: `src/wizard/wizard.ts:16-38` (WizardOptions)
- Modify: `src/wizard/wizard.ts:132-147` (config serialization)

**NOTE:** This task MUST come before adding CLI flags or wizard questions, because both the handler and question functions reference WizardOptions fields.

- [ ] **Step 1: Extend WizardOptions**

Add new fields to `WizardOptions` (after existing game fields, line 38):

```typescript
// Web-app flags
webRendering?: string
webDeployTarget?: string
webRealtime?: string
webAuthFlow?: string
// Backend flags
backendApiStyle?: string
backendDataStore?: string[]
backendAuth?: string
backendMessaging?: string
backendDeployTarget?: string
// CLI flags
cliInteractivity?: string
cliDistribution?: string[]
cliStructuredOutput?: boolean
```

- [ ] **Step 2: Pass new options through to askWizardQuestions**

In `runWizard()`, where `askWizardQuestions` is called, add the new fields to the options object:

```typescript
const answers = await askWizardQuestions({
  // ... existing fields ...
  webRendering: options.webRendering,
  webDeployTarget: options.webDeployTarget,
  webRealtime: options.webRealtime,
  webAuthFlow: options.webAuthFlow,
  backendApiStyle: options.backendApiStyle,
  backendDataStore: options.backendDataStore,
  backendAuth: options.backendAuth,
  backendMessaging: options.backendMessaging,
  backendDeployTarget: options.backendDeployTarget,
  cliInteractivity: options.cliInteractivity,
  cliDistribution: options.cliDistribution,
  cliStructuredOutput: options.cliStructuredOutput,
})
```

- [ ] **Step 3: Extend config serialization**

Update the config object to include new configs:

```typescript
project: {
  platforms: answers.traits as Array<'web' | 'mobile' | 'desktop'>,
  ...(answers.projectType && { projectType: answers.projectType }),
  ...(answers.gameConfig && { gameConfig: answers.gameConfig }),
  ...(answers.webAppConfig && { webAppConfig: answers.webAppConfig }),
  ...(answers.backendConfig && { backendConfig: answers.backendConfig }),
  ...(answers.cliConfig && { cliConfig: answers.cliConfig }),
},
```

- [ ] **Step 4: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors — WizardOptions now accepts new fields, questions.ts doesn't use them yet (just passes through).

- [ ] **Step 5: Commit**

```bash
git add src/wizard/wizard.ts
git commit -m "feat: extend WizardOptions and config serialization for new types

Pass web-app, backend, and CLI flags through to wizard questions.
Serialize new config blocks to config.yml using spread pattern."
```

---

### Task 7: Add new CLI flags to init.ts

**Files:**
- Modify: `src/cli/commands/init.ts:8-31` (InitArgs)
- Modify: `src/cli/commands/init.ts:78` (after project-type option)

- [ ] **Step 1: Extend InitArgs interface**

Add to `InitArgs` (after line 31):

```typescript
// Web-app flags
'web-rendering'?: string
'web-deploy-target'?: string
'web-realtime'?: string
'web-auth-flow'?: string
// Backend flags
'backend-api-style'?: string
'backend-data-store'?: string[]
'backend-auth'?: string
'backend-messaging'?: string
'backend-deploy-target'?: string
// CLI flags
'cli-interactivity'?: string
'cli-distribution'?: string[]
'cli-structured-output'?: boolean
```

- [ ] **Step 2: Add web-app .option() calls**

After the `project-type` option (line 78), add:

```typescript
// Web-App Configuration
.option('web-rendering', {
  type: 'string',
  describe: 'Rendering strategy',
  choices: ['spa', 'ssr', 'ssg', 'hybrid'] as const,
})
.option('web-deploy-target', {
  type: 'string',
  describe: 'Deploy target',
  choices: ['static', 'serverless', 'container', 'edge', 'long-running'] as const,
})
.option('web-realtime', {
  type: 'string',
  describe: 'Real-time strategy',
  choices: ['none', 'websocket', 'sse'] as const,
})
.option('web-auth-flow', {
  type: 'string',
  describe: 'Authentication flow',
  choices: ['none', 'session', 'oauth', 'passkey'] as const,
})
```

- [ ] **Step 3: Add backend .option() calls**

```typescript
// Backend Configuration
.option('backend-api-style', {
  type: 'string',
  describe: 'API style',
  choices: ['rest', 'graphql', 'grpc', 'trpc', 'none'] as const,
})
.option('backend-data-store', {
  type: 'string',
  array: true,
  describe: 'Data store(s) (relational,document,key-value)',
  coerce: coerceCSV,
})
.option('backend-auth', {
  type: 'string',
  describe: 'API auth mechanism',
  choices: ['none', 'jwt', 'session', 'oauth', 'apikey'] as const,
})
.option('backend-messaging', {
  type: 'string',
  describe: 'Async messaging',
  choices: ['none', 'queue', 'event-driven'] as const,
})
.option('backend-deploy-target', {
  type: 'string',
  describe: 'Deploy target',
  choices: ['serverless', 'container', 'long-running'] as const,
})
```

- [ ] **Step 4: Add CLI .option() calls**

```typescript
// CLI Configuration
.option('cli-interactivity', {
  type: 'string',
  describe: 'Interactivity model',
  choices: ['args-only', 'interactive', 'hybrid'] as const,
})
.option('cli-distribution', {
  type: 'string',
  array: true,
  describe: 'Distribution channels (package-manager,system-package-manager,standalone-binary,container)',
  coerce: coerceCSV,
})
.option('cli-structured-output', {
  type: 'boolean',
  describe: 'Support structured output (--json)',
})
```

- [ ] **Step 5: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "feat: add 12 CLI flags for web-app, backend, and cli project types

Namespaced flags: --web-*, --backend-*, --cli-*. CSV coerce for array
fields (--backend-data-store, --cli-distribution). Boolean for
--cli-structured-output."
```

---

### Task 8: Add .check() validation + .group() + handler auto-detection

**Files:**
- Modify: `src/cli/commands/init.ts:138-209` (.check())
- Modify: `src/cli/commands/init.ts:210-217` (.group())
- Modify: `src/cli/commands/init.ts:219-230` (handler)

- [ ] **Step 1: Add flag arrays and mixed-family detection to .check()**

In the `.check()` block (after the existing game flag detection at line 148), add:

```typescript
const webFlags = ['web-rendering', 'web-deploy-target', 'web-realtime', 'web-auth-flow'] as const
const hasWebFlag = webFlags.some((f) => argv[f] !== undefined)
const backendFlags = ['backend-api-style', 'backend-data-store', 'backend-auth',
  'backend-messaging', 'backend-deploy-target'] as const
const hasBackendFlag = backendFlags.some((f) => argv[f] !== undefined)
const cliFlags = ['cli-interactivity', 'cli-distribution', 'cli-structured-output'] as const
const hasCliFlag = cliFlags.some((f) => argv[f] !== undefined)

// Reject mixed-family flags
const typeCount = [hasGameFlag, hasWebFlag, hasBackendFlag, hasCliFlag].filter(Boolean).length
if (typeCount > 1) {
  throw new Error('Cannot mix flags from multiple project types (--web-*, --backend-*, --cli-*, game flags)')
}

// Web flags require web-app project type
if (hasWebFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'web-app') {
  throw new Error('--web-* flags require --project-type web-app')
}
// Backend flags require backend project type
if (hasBackendFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'backend') {
  throw new Error('--backend-* flags require --project-type backend')
}
// CLI flags require cli project type
if (hasCliFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'cli') {
  throw new Error('--cli-* flags require --project-type cli')
}

// CSV enum validation for array flags
const validDataStores = ['relational', 'document', 'key-value']
if (argv['backend-data-store']) {
  const invalid = (argv['backend-data-store'] as string[]).filter(
    (v: string) => !validDataStores.includes(v),
  )
  if (invalid.length) throw new Error(`Invalid --backend-data-store value(s): ${invalid.join(', ')}`)
}
const validDistChannels = ['package-manager', 'system-package-manager', 'standalone-binary', 'container']
if (argv['cli-distribution']) {
  const invalid = (argv['cli-distribution'] as string[]).filter(
    (v: string) => !validDistChannels.includes(v),
  )
  if (invalid.length) throw new Error(`Invalid --cli-distribution value(s): ${invalid.join(', ')}`)
}

// WebApp cross-field
if (['ssr', 'hybrid'].includes(argv['web-rendering'] as string) && argv['web-deploy-target'] === 'static') {
  throw new Error('SSR/hybrid rendering requires compute, not static hosting')
}
if (argv['web-auth-flow'] === 'session' && argv['web-deploy-target'] === 'static') {
  throw new Error('Session auth requires server state, incompatible with static hosting')
}
```

- [ ] **Step 2: Add .group() calls**

Update the `.group()` section:

```typescript
.group(['methodology', 'depth', 'adapters', 'traits', 'project-type'], 'Configuration:')
.group([
  'engine', 'multiplayer', 'target-platforms', 'online-services',
  'content-structure', 'economy', 'narrative', 'locales',
  'npc-ai', 'modding', 'persistence',
], 'Game Configuration:')
.group(['web-rendering', 'web-deploy-target', 'web-realtime', 'web-auth-flow'], 'Web-App Configuration:')
.group(['backend-api-style', 'backend-data-store', 'backend-auth',
  'backend-messaging', 'backend-deploy-target'], 'Backend Configuration:')
.group(['cli-interactivity', 'cli-distribution', 'cli-structured-output'], 'CLI Configuration:')
.group(['root', 'force', 'auto', 'idea', 'format', 'verbose'], 'General:') as Argv<InitArgs>
```

- [ ] **Step 3: Update handler auto-detection**

In the handler (around line 224), extend the auto-detection to handle new types:

```typescript
// Existing game auto-detection stays
const hasGameFlag = ['engine', 'multiplayer', 'targetPlatforms', 'onlineServices',
  'contentStructure', 'economy', 'narrative', 'locales', 'npcAi',
  'modding', 'persistence'].some((f) => args[f] !== undefined)

const hasWebFlag = (['web-rendering', 'web-deploy-target', 'web-realtime', 'web-auth-flow'] as const)
  .some((f) => argv[f] !== undefined)
const hasBackendFlag = (['backend-api-style', 'backend-data-store', 'backend-auth',
  'backend-messaging', 'backend-deploy-target'] as const)
  .some((f) => argv[f] !== undefined)
const hasCliFlag = (['cli-interactivity', 'cli-distribution', 'cli-structured-output'] as const)
  .some((f) => argv[f] !== undefined)

const detectedType = hasGameFlag ? 'game'
  : hasWebFlag ? 'web-app'
  : hasBackendFlag ? 'backend'
  : hasCliFlag ? 'cli'
  : undefined
```

Pass `detectedType` (or the existing `projectType ?? detectedType`) to `runWizard`.

- [ ] **Step 4: Pass new flags through to runWizard**

In the handler's `runWizard()` call, add the new flag values:

```typescript
await runWizard({
  // ... existing fields ...
  webRendering: argv['web-rendering'],
  webDeployTarget: argv['web-deploy-target'],
  webRealtime: argv['web-realtime'],
  webAuthFlow: argv['web-auth-flow'],
  backendApiStyle: argv['backend-api-style'],
  backendDataStore: argv['backend-data-store'],
  backendAuth: argv['backend-auth'],
  backendMessaging: argv['backend-messaging'],
  backendDeployTarget: argv['backend-deploy-target'],
  cliInteractivity: argv['cli-interactivity'],
  cliDistribution: argv['cli-distribution'],
  cliStructuredOutput: argv['cli-structured-output'],
})
```

- [ ] **Step 5: Run type-check**

Run: `npx tsc --noEmit`
Expected: All pass — WizardOptions was already extended in Task 6, so passing new fields compiles.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "feat: add .check() validation, .group(), and auto-detection for new flags

Mixed-family rejection, projectType conflict checks, CSV enum validation,
SSR+static and session+static cross-field validation. Auto-detect
project type from flag prefixes."
```

---

### Task 9: Add web-app wizard questions

**Files:**
- Modify: `src/wizard/questions.ts:106` (after project type selection, before game config)

- [ ] **Step 1: Add web-app question block**

After the project type selection (line 106) and before the `if (projectType === 'game')` block, add:

```typescript
// Web-App configuration
if (projectType === 'web-app') {
  if (auto && !options.webRendering) {
    throw new Error('--web-rendering is required in auto mode for web-app projects')
  }

  const renderingStrategy = options.webRendering
    ? options.webRendering as WebAppConfig['renderingStrategy']
    : await output.select('Rendering strategy?', ['spa', 'ssr', 'ssg', 'hybrid']) as WebAppConfig['renderingStrategy']

  const deployTarget = options.webDeployTarget
    ? options.webDeployTarget as WebAppConfig['deployTarget']
    : !auto
      ? await output.select('Deploy target?',
        ['static', 'serverless', 'container', 'edge', 'long-running'], 'serverless') as WebAppConfig['deployTarget']
      : 'serverless'

  const realtime = options.webRealtime
    ? options.webRealtime as WebAppConfig['realtime']
    : !auto
      ? await output.select('Real-time needs?', ['none', 'websocket', 'sse'], 'none') as WebAppConfig['realtime']
      : 'none'

  const authFlow = options.webAuthFlow
    ? options.webAuthFlow as WebAppConfig['authFlow']
    : !auto
      ? await output.select('Authentication flow?',
        ['none', 'session', 'oauth', 'passkey'], 'none') as WebAppConfig['authFlow']
      : 'none'

  answers.webAppConfig = { renderingStrategy, deployTarget, realtime, authFlow }
}
```

- [ ] **Step 2: Add options to askWizardQuestions signature**

Extend the options parameter (line 18-38) with new fields:

```typescript
// After existing game options:
webRendering?: string
webDeployTarget?: string
webRealtime?: string
webAuthFlow?: string
```

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/wizard/questions.ts
git commit -m "feat: add web-app wizard questions with flag-skip pattern

Asks renderingStrategy (required), deployTarget, realtime, authFlow.
Flag-skip: CLI flag → skip question; --auto → use defaults or error
for required field."
```

---

### Task 10: Add backend + CLI wizard questions

**Files:**
- Modify: `src/wizard/questions.ts`

- [ ] **Step 1: Add backend question block**

After the web-app block:

```typescript
// Backend configuration
if (projectType === 'backend') {
  if (auto && !options.backendApiStyle) {
    throw new Error('--backend-api-style is required in auto mode for backend projects')
  }

  const apiStyle = options.backendApiStyle
    ? options.backendApiStyle as BackendConfig['apiStyle']
    : await output.select('API style?',
      ['rest', 'graphql', 'grpc', 'trpc', 'none']) as BackendConfig['apiStyle']

  const dataStore = options.backendDataStore
    ? options.backendDataStore as BackendConfig['dataStore']
    : !auto
      ? await output.multiSelect('Data store(s)?',
        ['relational', 'document', 'key-value'], ['relational']) as BackendConfig['dataStore']
      : ['relational']

  const authMechanism = options.backendAuth
    ? options.backendAuth as BackendConfig['authMechanism']
    : !auto
      ? await output.select('API auth mechanism?',
        ['none', 'jwt', 'session', 'oauth', 'apikey'], 'none') as BackendConfig['authMechanism']
      : 'none'

  const asyncMessaging = options.backendMessaging
    ? options.backendMessaging as BackendConfig['asyncMessaging']
    : !auto
      ? await output.select('Async messaging?',
        ['none', 'queue', 'event-driven'], 'none') as BackendConfig['asyncMessaging']
      : 'none'

  const deployTarget = options.backendDeployTarget
    ? options.backendDeployTarget as BackendConfig['deployTarget']
    : !auto
      ? await output.select('Deploy target?',
        ['serverless', 'container', 'long-running'], 'container') as BackendConfig['deployTarget']
      : 'container'

  answers.backendConfig = { apiStyle, dataStore, authMechanism, asyncMessaging, deployTarget }
}
```

- [ ] **Step 2: Add CLI question block**

```typescript
// CLI configuration
if (projectType === 'cli') {
  if (auto && !options.cliInteractivity) {
    throw new Error('--cli-interactivity is required in auto mode for cli projects')
  }

  const interactivity = options.cliInteractivity
    ? options.cliInteractivity as CliConfig['interactivity']
    : await output.select('Interactivity model?',
      ['args-only', 'interactive', 'hybrid']) as CliConfig['interactivity']

  const distributionChannels = options.cliDistribution
    ? options.cliDistribution as CliConfig['distributionChannels']
    : !auto
      ? await output.multiSelect('Distribution channels?',
        ['package-manager', 'system-package-manager', 'standalone-binary', 'container'],
        ['package-manager']) as CliConfig['distributionChannels']
      : ['package-manager']

  const hasStructuredOutput = options.cliStructuredOutput
    ?? (!auto ? await output.confirm('Support structured output (--json)?', false) : false)

  answers.cliConfig = { interactivity, distributionChannels, hasStructuredOutput }
}
```

- [ ] **Step 3: Add backend + CLI options to function signature**

```typescript
backendApiStyle?: string
backendDataStore?: string[]
backendAuth?: string
backendMessaging?: string
backendDeployTarget?: string
cliInteractivity?: string
cliDistribution?: string[]
cliStructuredOutput?: boolean
```

- [ ] **Step 4: Run type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/wizard/questions.ts
git commit -m "feat: add backend + CLI wizard questions with flag-skip pattern

Backend asks: apiStyle (required), dataStore, authMechanism,
asyncMessaging, deployTarget. CLI asks: interactivity (required),
distributionChannels, hasStructuredOutput."
```

---

### ~~Task 10 MOVED to Task 6~~ (deleted — see Task 6 above)

- [ ] **Step 1: Extend WizardOptions**

Add new fields to `WizardOptions` (after existing game fields, line 38):

```typescript
// Web-app flags
webRendering?: string
webDeployTarget?: string
webRealtime?: string
webAuthFlow?: string
// Backend flags
backendApiStyle?: string
backendDataStore?: string[]
backendAuth?: string
backendMessaging?: string
backendDeployTarget?: string
// CLI flags
cliInteractivity?: string
cliDistribution?: string[]
cliStructuredOutput?: boolean
```

- [ ] **Step 2: Pass new options through to askWizardQuestions**

In `runWizard()`, where `askWizardQuestions` is called (around line 85), add the new fields to the options object:

```typescript
const answers = await askWizardQuestions({
  // ... existing fields ...
  webRendering: options.webRendering,
  webDeployTarget: options.webDeployTarget,
  webRealtime: options.webRealtime,
  webAuthFlow: options.webAuthFlow,
  backendApiStyle: options.backendApiStyle,
  backendDataStore: options.backendDataStore,
  backendAuth: options.backendAuth,
  backendMessaging: options.backendMessaging,
  backendDeployTarget: options.backendDeployTarget,
  cliInteractivity: options.cliInteractivity,
  cliDistribution: options.cliDistribution,
  cliStructuredOutput: options.cliStructuredOutput,
})
```

- [ ] **Step 3: Extend config serialization**

Update the config object at line 132-147 to include new configs:

```typescript
project: {
  platforms: answers.traits as Array<'web' | 'mobile' | 'desktop'>,
  ...(answers.projectType && { projectType: answers.projectType }),
  ...(answers.gameConfig && { gameConfig: answers.gameConfig }),
  ...(answers.webAppConfig && { webAppConfig: answers.webAppConfig }),
  ...(answers.backendConfig && { backendConfig: answers.backendConfig }),
  ...(answers.cliConfig && { cliConfig: answers.cliConfig }),
},
```

- [ ] **Step 4: Run full type-check and test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass ��� the full pipeline now type-checks.

- [ ] **Step 5: Commit**

```bash
git add src/wizard/wizard.ts
git commit -m "feat: extend WizardOptions and config serialization for new types

Pass web-app, backend, and CLI flags through to wizard questions.
Serialize new config blocks to config.yml using spread pattern."
```

---

### Task 11: CLI flag tests

**Files:**
- Modify: `src/cli/commands/init.test.ts`

- [ ] **Step 1: Add auto-detection tests**

```typescript
describe('new project type auto-detection', () => {
  it('auto-detects web-app from --web-rendering', async () => {
    // Test that handler sets projectType to web-app when web flag provided
  })

  it('auto-detects backend from --backend-api-style', async () => {
    // Test that handler sets projectType to backend when backend flag provided
  })

  it('auto-detects cli from --cli-interactivity', async () => {
    // Test that handler sets projectType to cli when cli flag provided
  })
})
```

- [ ] **Step 2: Add mixed-family rejection tests**

```typescript
describe('mixed-family rejection', () => {
  it('rejects --web-rendering with --backend-api-style', () => {
    // Test .check() throws when mixing web and backend flags
  })

  it('rejects --web-rendering with --engine', () => {
    // Test .check() throws when mixing web and game flags
  })
})
```

- [ ] **Step 3: Add CSV validation tests**

```typescript
describe('CSV enum validation', () => {
  it('rejects invalid --backend-data-store values', () => {
    // Test .check() throws for invalid enum values
  })

  it('accepts valid --cli-distribution CSV', () => {
    // Test coerceCSV + validation passes
  })
})
```

- [ ] **Step 4: Add cross-field validation tests**

```typescript
describe('cross-field validation', () => {
  it('rejects --web-rendering ssr with --web-deploy-target static', () => {
    // Test .check() throws
  })

  it('allows --web-rendering ssg with --web-deploy-target static', () => {
    // Test .check() passes
  })
})
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/cli/commands/init.test.ts --reporter=verbose`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/init.test.ts
git commit -m "test: add CLI flag tests for new project type flags

Tests cover auto-detection, mixed-family rejection, CSV enum validation,
and cross-field validation (SSR+static, session+static)."
```

---

### Task 12: Wizard tests

**Files:**
- Modify: `src/wizard/questions.test.ts`

- [ ] **Step 1: Add web-app flag-skip tests**

Test that when `webRendering` option is provided, the wizard uses it without prompting. Test that `--auto` without `webRendering` throws.

- [ ] **Step 2: Add backend flag-skip tests**

Test that when `backendApiStyle` option is provided, the wizard uses it. Test that `--auto` without `backendApiStyle` throws.

- [ ] **Step 3: Add CLI flag-skip tests**

Test that when `cliInteractivity` option is provided, the wizard uses it. Test defaults under `--auto`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/wizard/questions.test.ts --reporter=verbose`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/wizard/questions.test.ts
git commit -m "test: add wizard tests for web-app, backend, CLI question flows

Tests cover flag-skip pattern, --auto required field errors, and
default value behavior for all three project types."
```

---

### Task 13: Create web-app-overlay.yml

**Files:**
- Create: `content/methodology/web-app-overlay.yml`

- [ ] **Step 1: Create the overlay file**

Create `content/methodology/web-app-overlay.yml` with the full content from the spec (the complete web-app overlay YAML with all 28 knowledge-override step injections).

Follow the format of `content/methodology/game-overlay.yml` header:
```yaml
# methodology/web-app-overlay.yml
name: web-app
description: >
  Web application overlay — injects web-app domain knowledge into
  existing pipeline steps for SSR/SPA architecture, deployment,
  authentication, and real-time patterns.
project-type: web-app

knowledge-overrides:
  # Foundational
  create-prd:
    append: [web-app-requirements]
  # ... (full content from spec)
```

Include ALL 28 knowledge-override entries from the spec.

- [ ] **Step 2: Validate the overlay loads**

Run: `npx vitest run src/core/assembly/overlay-loader.test.ts`
Expected: Existing tests pass. (New overlay-specific tests come in Task 16.)

- [ ] **Step 3: Commit**

```bash
git add content/methodology/web-app-overlay.yml
git commit -m "feat: add web-app overlay YAML

Knowledge injection into 28 pipeline steps across foundational,
architecture, testing, review, and planning phases. No step-overrides,
reads-overrides, or dependency-overrides needed."
```

---

### Task 14: Create backend-overlay.yml

**Files:**
- Create: `content/methodology/backend-overlay.yml`

- [ ] **Step 1: Create the overlay file**

Create `content/methodology/backend-overlay.yml` following the web-app pattern. Backend overlay injects knowledge into steps relevant for API services, data stores, async messaging, auth, and deployment.

Knowledge entries to reference: `backend-requirements`, `backend-conventions`, `backend-project-structure`, `backend-dev-environment`, `backend-architecture`, `backend-api-design`, `backend-data-modeling`, `backend-auth-patterns`, `backend-security`, `backend-async-patterns`, `backend-deployment`, `backend-observability`, `backend-testing`, `backend-worker-patterns`.

Steps to inject into (matching the web-app pattern but adjusted for backend concerns):
- Foundational: create-prd, user-stories, coding-standards, project-structure, dev-env-setup, git-workflow
- Architecture: system-architecture, tech-stack, adrs, domain-modeling, database-schema, api-contracts, security, operations
- Testing: tdd, add-e2e-testing, create-evals, story-tests
- Reviews: review-architecture, review-api, review-database, review-security, review-operations, review-testing
- Planning: implementation-plan

Skip UX/design-specific steps (ux-spec, review-ux, design-system).

- [ ] **Step 2: Commit**

```bash
git add content/methodology/backend-overlay.yml
git commit -m "feat: add backend overlay YAML

Knowledge injection into ~25 pipeline steps. Skips UX/design steps.
Focuses on API design, data modeling, auth, async messaging, deployment."
```

---

### Task 15: Create cli-overlay.yml

**Files:**
- Create: `content/methodology/cli-overlay.yml`

- [ ] **Step 1: Create the overlay file**

Create `content/methodology/cli-overlay.yml`. CLI overlay injects knowledge for argument parsing, shell integration, distribution, output formatting, and terminal UX.

Knowledge entries: `cli-requirements`, `cli-conventions`, `cli-project-structure`, `cli-dev-environment`, `cli-architecture`, `cli-distribution-patterns`, `cli-interactivity-patterns`, `cli-output-patterns`, `cli-testing`, `cli-shell-integration`.

Steps to inject into:
- Foundational: create-prd, user-stories, coding-standards, project-structure, dev-env-setup, git-workflow
- Architecture: system-architecture, tech-stack, adrs, domain-modeling, api-contracts, security, operations
- Testing: tdd, add-e2e-testing, create-evals, story-tests
- Reviews: review-architecture, review-api, review-security, review-operations, review-testing
- Planning: implementation-plan

Skip database, UX/design steps.

- [ ] **Step 2: Commit**

```bash
git add content/methodology/cli-overlay.yml
git commit -m "feat: add CLI overlay YAML

Knowledge injection into ~23 pipeline steps. Skips database and
UX/design steps. Focuses on argument parsing, shell integration,
distribution, output formatting."
```

---

### Task 16: Overlay loader tests

**Files:**
- Modify: `src/core/assembly/overlay-loader.test.ts`

- [ ] **Step 1: Add tests for new overlays**

Add tests that load each new overlay YAML and verify:
- The overlay loads without errors
- The project-type matches
- Knowledge-overrides are populated
- Step-overrides, reads-overrides, dependency-overrides are empty/absent

```typescript
describe('web-app overlay', () => {
  it('loads web-app-overlay.yml successfully', async () => {
    const overlayPath = path.join(methodologyDir, 'web-app-overlay.yml')
    const { overlay, errors } = await loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('web-app')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(20)
    expect(Object.keys(overlay!.stepOverrides)).toHaveLength(0)
  })
})
// Repeat for backend and cli
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/core/assembly/overlay-loader.test.ts --reporter=verbose`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add src/core/assembly/overlay-loader.test.ts
git commit -m "test: add overlay loader tests for web-app, backend, CLI overlays

Verify each overlay loads successfully with correct project-type,
populated knowledge-overrides, and empty step/reads/dependency overrides."
```

---

### Task 17: Web-app knowledge entries (batch 1 — foundational + architecture)

**Files:**
- Create: `content/knowledge/web-app/` directory
- Create: 9 files

Create these knowledge entry files following the frontmatter format:

```yaml
---
name: web-app-requirements
description: Web application requirements patterns — SSR/SPA decisions, performance budgets, responsive
topics: [web-app, requirements, ssr, spa, performance]
---
```

Followed by 200-400 words of domain expertise prose.

**Files to create:**
1. `web-app-requirements.md` — SSR/SPA decision points, performance budgets, responsive requirements, browser support
2. `web-app-conventions.md` — Framework patterns (component structure, hooks, state management), code organization
3. `web-app-project-structure.md` — Directory conventions (pages/, api/, components/, middleware/, public/)
4. `web-app-dev-environment.md` — HMR setup, proxy config, env vars, Docker for local services
5. `web-app-deployment-workflow.md` — Preview deploys, staging environments, deployment branches, CI/CD
6. `web-app-architecture.md` — Rendering strategy tradeoffs, CDN patterns, edge functions, hydration strategies
7. `web-app-deployment.md` — Static hosting, serverless, container, edge deployment patterns, blue-green
8. `web-app-rendering-strategies.md` — SSR/SSG/ISR/SPA tradeoffs, streaming SSR, progressive hydration
9. `web-app-ux-patterns.md` — Responsive design, loading states, skeleton screens, offline patterns

- [ ] **Step 1: Create content/knowledge/web-app/ directory and write all 9 files**

Each file should have the standard frontmatter (name, description, topics) followed by domain expertise prose. Use `content/knowledge/game/game-engine-selection.md` as a quality reference — aim for similar depth and structure.

- [ ] **Step 2: Validate frontmatter**

Run: `make validate` (validates frontmatter in content files)

- [ ] **Step 3: Commit**

```bash
git add content/knowledge/web-app/
git commit -m "feat: add web-app knowledge entries (batch 1 — foundational + architecture)

9 domain expertise files covering requirements, conventions, project
structure, dev environment, deployment workflow, architecture, deployment
patterns, rendering strategies, and UX patterns."
```

---

### Task 18: Web-app knowledge entries (batch 2 — design + technical)

**Files:**
- Create: 8 files in `content/knowledge/web-app/`

**Files to create:**
1. `web-app-design-system.md` — Responsive tokens, dark mode, CSS methodology, component library patterns
2. `web-app-session-patterns.md` — Session/auth state as domain concepts, token management, refresh flows
3. `web-app-data-patterns.md` — Session tables, OAuth tokens, cache patterns, optimistic updates
4. `web-app-api-patterns.md` — REST/GraphQL conventions, auth headers, pagination, CORS, rate limiting
5. `web-app-auth-patterns.md` — OAuth flows, session cookies, passkey/WebAuthn, CSRF protection
6. `web-app-security.md` — XSS prevention, CSP, cookie security, OWASP web-specific patterns
7. `web-app-observability.md` — RUM, Core Web Vitals, error tracking, CDN monitoring, alerting
8. `web-app-testing.md` — Component testing, SSR testing, E2E browser patterns, visual regression, a11y

- [ ] **Step 1: Write all 8 files with frontmatter and domain expertise**

- [ ] **Step 2: Validate frontmatter**

Run: `make validate`

- [ ] **Step 3: Commit**

```bash
git add content/knowledge/web-app/
git commit -m "feat: add web-app knowledge entries (batch 2 — design + technical)

8 domain expertise files covering design system, sessions, data patterns,
API patterns, auth, security, observability, and testing."
```

---

### Task 19: Backend knowledge entries (batch 1 — foundational + architecture)

**Files:**
- Create: `content/knowledge/backend/` directory
- Create: 7 files

**Files to create:**
1. `backend-requirements.md` — API-first design, SLA requirements, scalability targets
2. `backend-conventions.md` — Service patterns, error handling, logging standards, naming
3. `backend-project-structure.md` — src/routes, src/services, src/models, middleware patterns
4. `backend-dev-environment.md` — Docker compose, database seeding, API testing tools, env config
5. `backend-architecture.md` — Monolith vs microservices, layered architecture, CQRS, event sourcing
6. `backend-api-design.md` — REST maturity levels, GraphQL schema design, gRPC protobuf, versioning
7. `backend-data-modeling.md` — Relational vs document modeling, migrations, connection pooling

- [ ] **Step 1: Create content/knowledge/backend/ directory and write all 7 files**
- [ ] **Step 2: Validate frontmatter** — Run: `make validate`
- [ ] **Step 3: Commit**

```bash
git add content/knowledge/backend/
git commit -m "feat: add backend knowledge entries (batch 1 — foundational + architecture)

7 domain expertise files covering requirements, conventions, project
structure, dev environment, architecture, API design, and data modeling."
```

---

### Task 20: Backend knowledge entries (batch 2 — security + operations)

**Files:**
- Create: 7 files in `content/knowledge/backend/`

**Files to create:**
1. `backend-auth-patterns.md` — JWT lifecycle, OAuth2 provider integration, API key management
2. `backend-security.md` — Input validation, SQL injection, rate limiting, OWASP API patterns
3. `backend-async-patterns.md` — Message queues, event-driven architecture, saga patterns, retry
4. `backend-deployment.md` — Containerization, serverless patterns, health checks, graceful shutdown
5. `backend-observability.md` — Structured logging, distributed tracing, metrics, alerting
6. `backend-testing.md` — API integration tests, contract tests, database testing, mocking strategies
7. `backend-worker-patterns.md` — Background jobs, cron, event consumers, dead letter queues

- [ ] **Step 1: Write all 7 files with frontmatter and domain expertise**
- [ ] **Step 2: Validate frontmatter** — Run: `make validate`
- [ ] **Step 3: Commit**

```bash
git add content/knowledge/backend/
git commit -m "feat: add backend knowledge entries (batch 2 — security + operations)

7 domain expertise files covering auth, security, async patterns,
deployment, observability, testing, and worker patterns."
```

---

### Task 21: CLI knowledge entries

**Files:**
- Create: `content/knowledge/cli/` directory
- Create: ~10 files

**Files to create:**
1. `cli-requirements.md` — CLI UX principles, POSIX conventions, exit codes, signal handling
2. `cli-conventions.md` — Flag naming, subcommand patterns, help text standards
3. `cli-project-structure.md` — src/commands, src/utils, bin/ entry point, config resolution
4. `cli-dev-environment.md` — Development workflow, manual testing, linking, debug flags
5. `cli-architecture.md` — Command router, plugin systems, middleware chains, config resolution
6. `cli-distribution-patterns.md` — npm/pip/cargo publishing, Homebrew formulae, standalone binaries, containers
7. `cli-interactivity-patterns.md` — Prompts, spinners, progress bars, color output, TTY detection
8. `cli-output-patterns.md` — --json flag, table formatting, machine-readable output, piping
9. `cli-testing.md` — CLI integration testing, snapshot tests, exit code verification, stderr/stdout
10. `cli-shell-integration.md` — Shell completion (bash/zsh/fish), man pages, dotfile conventions

- [ ] **Step 1: Create content/knowledge/cli/ directory and write all 10 files**
- [ ] **Step 2: Validate frontmatter** — Run: `make validate`
- [ ] **Step 3: Commit**

```bash
git add content/knowledge/cli/
git commit -m "feat: add CLI knowledge entries (10 files)

Domain expertise covering CLI UX, conventions, architecture, distribution,
interactivity, output formatting, testing, and shell integration."
```

---

### Task 22: Game flag aliases (--game-*)

**Files:**
- Modify: `src/cli/commands/init.ts` (game .option() calls)

- [ ] **Step 1: Add aliases to existing game options**

For each existing game option, add an `alias` with the `game-` prefix. The bare name stays canonical (for backwards compat); `--game-*` is the alias. Yargs aliases share a single `argv` key, so both forms write to `argv.engine`. Example:

```typescript
.option('engine', {
  type: 'string',
  describe: 'Game engine',
  choices: ['unity', 'unreal', 'godot', 'custom'] as const,
  alias: 'game-engine',
})
```

Do this for all 11 game options: engine, multiplayer, target-platforms, online-services, content-structure, economy, narrative, locales, npc-ai, modding, persistence.

- [ ] **Step 2: Update .group() to show --game-* names**

```typescript
.group([
  'game-engine', 'game-multiplayer', 'game-target-platforms', 'game-online-services',
  'game-content-structure', 'game-economy', 'game-narrative', 'game-locales',
  'game-npc-ai', 'game-modding', 'game-persistence',
], 'Game Configuration:')
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/cli/commands/init.test.ts`
Expected: All existing game flag tests still pass (aliases are transparent to yargs).

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "feat: add --game-* aliases for existing bare game flags

--engine becomes alias for --game-engine, etc. Bare names preserved for
backwards compatibility. All 11 game flags get --game-* prefixed aliases
for consistency with new --web-*, --backend-*, --cli-* naming."
```

---

### Task 23: Integration test

**Files:**
- Create or modify: `src/e2e/` or `tests/integration/` (follow existing e2e pattern)

- [ ] **Step 1: Write integration test for web-app init-to-overlay flow**

Create a test that verifies the full pipeline: `scaffold init --auto --project-type web-app --web-rendering ssr` produces a `config.yml` that, when loaded through `loadPipelineContext` + `resolvePipeline`, results in web-app knowledge entries being injected into the correct pipeline steps.

Follow the pattern in `src/e2e/game-pipeline.test.ts` if it exists, or create a new integration test file.

- [ ] **Step 2: Add basic backend and CLI integration assertions**

Verify that `--project-type backend --backend-api-style rest` and `--project-type cli --cli-interactivity hybrid` produce valid configs that resolve through the overlay system.

- [ ] **Step 3: Run tests**

Run: `npx vitest run` (full suite)
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/e2e/ tests/
git commit -m "test: add integration tests for web-app, backend, CLI overlay flow

Verify init-to-config-to-overlay-resolution pipeline for all three
new project types."
```

---

### Task 24: Update README.md + CHANGELOG.md

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update README.md**

Add a "Project-Type Overlays" section describing the new feature. Update the `--project-type` flag documentation to include the overlay behavior. Add a table showing the 3 new config types with their fields.

Update the Non-Interactive / CI Usage section with examples:

```bash
# Web-app project
scaffold init --auto --methodology deep --project-type web-app \
  --web-rendering ssr --web-deploy-target serverless

# Backend project
scaffold init --auto --methodology deep --project-type backend \
  --backend-api-style graphql --backend-data-store relational,key-value

# CLI project
scaffold init --auto --methodology mvp --project-type cli \
  --cli-interactivity hybrid --cli-distribution package-manager,standalone-binary
```

- [ ] **Step 2: Update CHANGELOG.md**

Add a new entry for the upcoming release with the feature description.

- [ ] **Step 3: Run quality gates**

Run: `make check-all`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: update README and CHANGELOG for project-type overlays

Add project-type overlays section, config type documentation, CI usage
examples for web-app, backend, and CLI project types."
```

---

## Self-Review Checklist

### Spec Coverage
| Spec Section | Task(s) |
|-------------|---------|
| Single source of truth for ProjectType | Task 1 |
| Update overlay-loader.ts | Task 1 |
| New config Zod schemas | Task 2 |
| Extend ProjectConfig | Task 3 |
| .superRefine() cross-field validation | Task 3 |
| Schema tests | Task 4 |
| Consolidate WizardAnswers | Task 5 |
| WizardOptions + serialization | Task 6 |
| CLI flags (12 new) | Task 7 |
| .check() validation + .group() | Task 8 |
| Web-app wizard questions | Task 9 |
| Backend + CLI wizard questions | Task 10 |
| CLI flag tests | Task 11 |
| Wizard tests | Task 12 |
| web-app-overlay.yml | Task 13 |
| backend-overlay.yml | Task 14 |
| cli-overlay.yml | Task 15 |
| Overlay loader tests | Task 16 |
| Web-app knowledge entries | Tasks 17-18 |
| Backend knowledge entries | Tasks 19-20 |
| CLI knowledge entries | Task 21 |
| Game flag aliases | Task 22 |
| Integration test | Task 23 |
| README + CHANGELOG | Task 24 |
| Config block optionality | Task 3 (schema allows optional) |
| Auth naming convention | Tasks 9-10 (wizard question phrasing) |
| --auto anchor field errors | Tasks 9-10 |
| Mixed-family rejection | Task 8 |
| CSV enum validation | Task 8 |
| Config serialization examples | Task 6 |

### No Gaps Found
All spec requirements mapped to tasks. No placeholders or TBDs remain.
