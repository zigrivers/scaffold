# Project-Type Overlays Design Spec

**Date:** 2026-04-06
**Status:** Draft
**Scope:** Release 1 (web-app, backend, cli) — Release 2 (library, mobile-app) and Release 3 (data-pipeline, ml, browser-extension) follow the same patterns.

## Goal

Extend the existing overlay system to support 8 new project types with type-specific configs, domain knowledge injection, and full CLI/wizard support. Each overlay follows the `{type}-overlay.yml` pattern established by `game-overlay.yml`. Delivered incrementally in 3 releases.

## Architecture

The overlay infrastructure is already generic: `resolveOverlayState()` loads any `{projectType}-overlay.yml` and applies it via `applyOverlay()`. The overlay resolver, state resolver, and pipeline resolver require no changes. The work is:

1. **Single source of truth for project types** — Refactor `ProjectTypeSchema` in `schema.ts` to be the canonical list. Derive the TypeScript union via `z.infer<>`. All other locations (`overlay-loader.ts:186`, `init.ts:76`, `questions.ts:102`) import `ProjectTypeSchema.options` instead of maintaining hardcoded arrays. Adding a type becomes a one-file change.

2. **Expand `ProjectType`** from 6 to 9 values — add `data-pipeline`, `ml`, `browser-extension`. The 5 existing non-game types already exist in the enum and get overlays without enum changes.

3. **Update `overlay-loader.ts`** — Replace hardcoded `validProjectTypes` array (line 186) with `ProjectTypeSchema.options` import. Makes the loader truly generic.

4. **Add 8 overlay YAML files** in `content/methodology/` — one per non-game type. Knowledge-first approach: inject domain knowledge into existing pipeline steps. No new pipeline steps.

5. **Add knowledge entries** in `content/knowledge/{type}/` — domain expertise files injected during prompt assembly.

6. **Add config interfaces + Zod schemas** — `WebAppConfig`, `BackendConfig`, `CliConfig` (Release 1), `LibraryConfig`, `MobileAppConfig` (Release 2), `DataPipelineConfig`, `MlConfig`, `BrowserExtensionConfig` (Release 3). Use `z.discriminatedUnion`-style gating via `.superRefine()`. Derive TS types from Zod schemas via `z.infer<>` to prevent drift.

7. **Extend config persistence flow** — `WizardAnswers`, `runWizard()`, and config serialization in `wizard.ts` carry new typed configs through to `config.yml`. Consolidate duplicate `WizardAnswers` interfaces: delete the stale version at `types/wizard.ts:3` (different fields, nothing imports it) and keep the canonical version at `questions.ts:5`, extending it with `webAppConfig?`, `backendConfig?`, `cliConfig?`.

8. **Namespace CLI flags by type** — `--web-*`, `--backend-*`, `--cli-*` prefixes. Add `--game-*` aliases for existing bare game flags (`--engine` becomes alias for `--game-engine`) for consistency. Bare game flags preserved as hidden aliases for backwards compatibility.

9. **Vertically sliced releases** — Each batch adds enum values, overlay YAML, knowledge entries, config type, Zod schema, CLI flags, wizard questions, and tests together. No partially supported types.

10. **`scaffold adopt` explicitly out of scope** — Currently game-only. Will be extended in a follow-up release.

11. **Update docs** — README.md project type table, CHANGELOG.

### What Does NOT Change

- `overlay-resolver.ts` (`applyOverlay`) — fully generic
- `overlay-state-resolver.ts` (`resolveOverlayState`) — dynamically constructs paths, handles missing overlays gracefully
- `resolver.ts` (`resolvePipeline`) — delegates to overlay system
- `graph.ts` (`buildGraph`) — overlay-agnostic

## Release Strategy

| Release | Types | New Enum Values | Config Blocks | Knowledge Entries |
|---------|-------|-----------------|---------------|-------------------|
| Release 1 | `web-app`, `backend`, `cli` | None (already in enum) | `WebAppConfig`, `BackendConfig`, `CliConfig` | ~40-50 new files |
| Release 2 | `library`, `mobile-app` | None (already in enum) | `LibraryConfig`, `MobileAppConfig` | ~25-35 new files |
| Release 3 | `data-pipeline`, `ml`, `browser-extension` | 3 new values | `DataPipelineConfig`, `MlConfig`, `BrowserExtensionConfig` | ~30-40 new files |

## Overlay YAML Structure

Each overlay follows the `game-overlay.yml` pattern with four override sections. Non-game overlays are **knowledge-heavy, step-light**: they inject domain knowledge into existing pipeline steps rather than adding new steps.

### Pattern

- **step-overrides**: Omitted for most non-game types. Base presets already handle step enablement correctly. Game steps are disabled at the preset level, web/backend/CLI steps are already enabled. Config fields (e.g., `renderingStrategy`, `apiStyle`) drive conditional behavior via meta-prompt Conditional Evaluation sections, not step-overrides.
- **knowledge-overrides**: The primary mechanism. Injects domain-specific knowledge entries into ~25-30 existing pipeline steps across foundational, architecture, testing, review, and planning phases.
- **reads-overrides**: Omitted for most non-game types. Non-game overlays use the default artifact names (no remapping needed). Game needed reads-overrides because it replaces `ux-spec` with `game-ui-spec`.
- **dependency-overrides**: Omitted for most non-game types. Standard pipeline dependency flow works. Game needed dependency-overrides because it introduces new review gates.

### Review Step Mirroring

Review steps receive the same knowledge entries as their authoring counterparts. This ensures reviewers evaluate artifacts using domain-specific criteria:

| Authoring Step | Review Step | Same Knowledge? |
|---------------|-------------|-----------------|
| `system-architecture` | `review-architecture` | Yes |
| `ux-spec` | `review-ux` | Yes |
| `api-contracts` | `review-api` | Yes |
| `database-schema` | `review-database` | Yes |
| `security` | `review-security` | Yes |
| `operations` | `review-operations` | Yes |
| `tdd` / `add-e2e-testing` / `create-evals` | `review-testing` | Yes |

Early review gates (`review-prd`, `review-user-stories`, `review-domain-modeling`, `review-adrs`) are intentionally NOT mirrored — they check general quality and downstream readiness, not domain-specific correctness. This matches the game overlay precedent.

### Web-App Overlay Example

```yaml
name: web-app
description: Web application overlay — SSR/SPA architecture, deployment, auth, real-time patterns
project-type: web-app

knowledge-overrides:
  # Foundational
  create-prd:
    append: [web-app-requirements]
  user-stories:
    append: [web-app-requirements]
  coding-standards:
    append: [web-app-conventions]
  project-structure:
    append: [web-app-project-structure]
  dev-env-setup:
    append: [web-app-dev-environment]
  git-workflow:
    append: [web-app-deployment-workflow]

  # Architecture & Design
  system-architecture:
    append: [web-app-architecture, web-app-deployment]
  tech-stack:
    append: [web-app-rendering-strategies, web-app-deployment, web-app-auth-patterns]
  adrs:
    append: [web-app-architecture]
  ux-spec:
    append: [web-app-ux-patterns]
  design-system:
    append: [web-app-design-system]
  domain-modeling:
    append: [web-app-session-patterns]
  database-schema:
    append: [web-app-data-patterns]
  api-contracts:
    append: [web-app-api-patterns]
  security:
    append: [web-app-auth-patterns, web-app-security]
  operations:
    append: [web-app-deployment, web-app-observability]

  # Testing
  tdd:
    append: [web-app-testing]
  add-e2e-testing:
    append: [web-app-testing]
  create-evals:
    append: [web-app-testing]
  story-tests:
    append: [web-app-testing]

  # Reviews (mirror authoring steps)
  review-architecture:
    append: [web-app-architecture, web-app-deployment]
  review-ux:
    append: [web-app-ux-patterns]
  review-api:
    append: [web-app-api-patterns]
  review-database:
    append: [web-app-data-patterns]
  review-security:
    append: [web-app-auth-patterns, web-app-security]
  review-operations:
    append: [web-app-deployment, web-app-observability]
  review-testing:
    append: [web-app-testing]

  # Planning
  implementation-plan:
    append: [web-app-architecture]
```

**Knowledge entries for web-app** (~17 files in `content/knowledge/web-app/`):

| Entry | Purpose |
|-------|---------|
| `web-app-requirements` | SSR/SPA decision points, performance budgets, responsive requirements |
| `web-app-conventions` | Framework patterns (React hooks, Next.js conventions), component structure |
| `web-app-project-structure` | Directory conventions (pages/, api/, components/, middleware/) |
| `web-app-dev-environment` | HMR, proxy config, env vars, Docker for services |
| `web-app-deployment-workflow` | Preview deploys, staging environments, deployment branches |
| `web-app-architecture` | Rendering strategy tradeoffs, CDN, edge functions, hydration |
| `web-app-deployment` | Static hosting, serverless, container, edge deployment patterns |
| `web-app-rendering-strategies` | SSR/SSG/ISR/SPA tradeoffs, hydration, streaming |
| `web-app-ux-patterns` | Responsive design, loading states, skeleton screens, offline |
| `web-app-design-system` | Responsive tokens, dark mode, CSS methodology patterns |
| `web-app-session-patterns` | Session/auth state as domain concepts, token management |
| `web-app-data-patterns` | Session tables, OAuth tokens, cache patterns |
| `web-app-api-patterns` | REST/GraphQL conventions, auth headers, pagination, CORS |
| `web-app-auth-patterns` | OAuth flows, session cookies, passkey/WebAuthn, CSRF |
| `web-app-security` | XSS, CSP, cookie security, OWASP web-specific patterns |
| `web-app-observability` | RUM, Core Web Vitals, error tracking, CDN monitoring |
| `web-app-testing` | Component testing, SSR testing, E2E browser patterns, visual regression |

Backend and CLI overlays follow the same structure — knowledge-heavy, no step/reads/dependency overrides.

### Consolidation Note

During content creation, these entry pairs may be merged if overlap is high:
- `web-app-auth-patterns` + `web-app-security` → single security entry
- `web-app-deployment` + `web-app-deployment-workflow` → single deployment entry

Final count will settle during implementation.

## Release 1 Config Types

### Type Definitions

Derived from Zod schemas via `z.infer<>` to prevent drift between types and validation:

```typescript
// In schema.ts — Zod schemas are the source of truth
export const WebAppConfigSchema = z.object({
  renderingStrategy: z.enum(['spa', 'ssr', 'ssg', 'hybrid']),
  deployTarget: z.enum(['static', 'serverless', 'container', 'edge', 'long-running']).default('serverless'),
  realtime: z.enum(['none', 'websocket', 'sse']).default('none'),
  authFlow: z.enum(['none', 'session', 'oauth', 'passkey']).default('none'),
}).strict()

export const BackendConfigSchema = z.object({
  apiStyle: z.enum(['rest', 'graphql', 'grpc', 'trpc', 'none']),
  dataStore: z.array(z.enum(['relational', 'document', 'key-value'])).min(1).default(['relational']),
  authMechanism: z.enum(['none', 'jwt', 'session', 'oauth', 'apikey']).default('none'),
  asyncMessaging: z.enum(['none', 'queue', 'event-driven']).default('none'),
  deployTarget: z.enum(['serverless', 'container', 'long-running']).default('container'),
}).strict()

export const CliConfigSchema = z.object({
  interactivity: z.enum(['args-only', 'interactive', 'hybrid']),
  distributionChannels: z.array(z.enum(['package-manager', 'system-package-manager', 'standalone-binary', 'container'])).min(1).default(['package-manager']),
  hasStructuredOutput: z.boolean().default(false),
}).strict()

// In types/config.ts — derived from Zod
export type WebAppConfig = z.infer<typeof WebAppConfigSchema>
export type BackendConfig = z.infer<typeof BackendConfigSchema>
export type CliConfig = z.infer<typeof CliConfigSchema>
```

### Required vs Default Fields

Each config has one required "anchor" field with no default (matching `GameConfig.engine`):

| Config | Required (no default) | Defaulted |
|--------|----------------------|-----------|
| WebAppConfig | `renderingStrategy` | `deployTarget: 'serverless'`, `realtime: 'none'`, `authFlow: 'none'` |
| BackendConfig | `apiStyle` | `dataStore: ['relational']`, `authMechanism: 'none'`, `asyncMessaging: 'none'`, `deployTarget: 'container'` |
| CliConfig | `interactivity` | `distributionChannels: ['package-manager']`, `hasStructuredOutput: false` |

Under `--auto`, omitting the required anchor field produces an early explicit error in the wizard (e.g., `--web-rendering is required in auto mode for web-app projects`), preventing a broken config from being written to disk.

**Note:** This is a deliberate divergence from the game pattern, where `--auto` defaults `engine` to `'custom'` (see `questions.ts:112`). For new types, the anchor field has no reasonable universal default, so `--auto` requires it explicitly. This is a stricter but clearer contract.

`BackendConfig.apiStyle: 'none'` is intentional — it covers worker, cron, and event-consumer backends that have no API surface.

### Config Block Optionality

`webAppConfig`, `backendConfig`, and `cliConfig` are **optional** on `ProjectConfig` — setting `projectType: web-app` without a `webAppConfig` block is valid. This supports:
- Manual configs where the user only sets `projectType` to get overlay knowledge injection
- Older configs migrated from before this feature existed
- Future `scaffold adopt` flows that detect project type but not config details

When the config block is absent, the overlay still loads (keyed on `projectType`), knowledge is still injected, and meta-prompt Conditional Evaluation sections treat missing config fields as their Zod defaults. The wizard always creates the config block, so this case only applies to hand-edited or adopted configs.

### ProjectConfig Extension

```typescript
export interface ProjectConfig {
  name?: string
  platforms?: Array<'web' | 'mobile' | 'desktop'>
  projectType?: ProjectType
  gameConfig?: GameConfig
  webAppConfig?: WebAppConfig
  backendConfig?: BackendConfig
  cliConfig?: CliConfig
  [key: string]: unknown   // forward-compat per ADR-033
}
```

### Zod ProjectSchema Integration

Add explicit fields to `ProjectSchema` (`.passthrough()` does NOT validate unknown fields):

Note: `ProjectSchema` is a non-exported `const` in the current codebase. It remains non-exported. The existing `.refine()` on lines 43-52 of `schema.ts` is deleted entirely and replaced by the `.superRefine()` below.

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
```

### Cross-Field Validation

Replace the existing `.refine()` (lines 43-52 of `schema.ts`) with a consolidated `.superRefine()` chained after `.passthrough()`:

```typescript
.superRefine((data, ctx) => {
  // Config-to-projectType gating
  if (data.gameConfig && data.projectType !== 'game')
    ctx.addIssue({ path: ['gameConfig'], code: 'custom',
      message: 'gameConfig requires projectType: game' })
  if (data.webAppConfig && data.projectType !== 'web-app')
    ctx.addIssue({ path: ['webAppConfig'], code: 'custom',
      message: 'webAppConfig requires projectType: web-app' })
  if (data.backendConfig && data.projectType !== 'backend')
    ctx.addIssue({ path: ['backendConfig'], code: 'custom',
      message: 'backendConfig requires projectType: backend' })
  if (data.cliConfig && data.projectType !== 'cli')
    ctx.addIssue({ path: ['cliConfig'], code: 'custom',
      message: 'cliConfig requires projectType: cli' })

  // WebApp cross-field validations
  if (data.webAppConfig) {
    const { renderingStrategy, deployTarget, authFlow } = data.webAppConfig
    if (['ssr', 'hybrid'].includes(renderingStrategy) && deployTarget === 'static')
      ctx.addIssue({ path: ['webAppConfig', 'deployTarget'], code: 'custom',
        message: 'SSR/hybrid rendering requires compute, not static hosting' })
    if (authFlow === 'session' && deployTarget === 'static')
      ctx.addIssue({ path: ['webAppConfig', 'authFlow'], code: 'custom',
        message: 'Session auth requires server state, incompatible with static hosting' })
  }
})
```

### Auth Naming Convention

`authFlow` (WebApp) describes the user-facing authentication journey — "How do users log in?"
`authMechanism` (Backend) describes the API-level credential verification — "How does the API verify requests?"

Both appear in the wizard with distinct phrasing:
- Web-app: "How do users authenticate?"
- Backend: "How does the API verify requests?"

## CLI Flags

### Flag Naming

All new flags use type prefixes to avoid collision. Existing bare game flags get `--game-*` aliases for consistency. Yargs aliases share a single `argv` key, so `--engine unity` and `--game-engine unity` both write to `argv.gameEngine`. If both forms are passed with conflicting values, yargs uses the last one — no special handling needed.

```
# Existing game flags (bare names preserved as hidden aliases):
--game-engine         (alias: --engine)
--game-multiplayer    (alias: --multiplayer)
--game-narrative      (alias: --narrative)
... etc for all 11 game flags

# New web-app flags:
--web-rendering       spa|ssr|ssg|hybrid
--web-deploy-target   static|serverless|container|edge|long-running
--web-realtime        none|websocket|sse
--web-auth-flow       none|session|oauth|passkey

# New backend flags:
--backend-api-style       rest|graphql|grpc|trpc|none
--backend-data-store      relational,document,key-value     (CSV)
--backend-auth            none|jwt|session|oauth|apikey
--backend-messaging       none|queue|event-driven
--backend-deploy-target   serverless|container|long-running

# New CLI flags:
--cli-interactivity       args-only|interactive|hybrid
--cli-distribution        package-manager,system-package-manager,standalone-binary,container  (CSV)
--cli-structured-output   (boolean)
```

### Yargs Implementation

Each flag gets:
- `type: 'string'` (or `'boolean'` for `--cli-structured-output`)
- `choices` for single-select enums
- `coerce: coerceCSV` for array fields (reuse existing local helper in `init.ts:37`)
- `.group()` per type: `'Game Configuration:'`, `'Web-App Configuration:'`, `'Backend Configuration:'`, `'CLI Configuration:'`

### Auto-Detection

Matches the existing game pattern:
- Any `--web-*` flag → auto-set `--project-type web-app`
- Any `--backend-*` flag → auto-set `--project-type backend`
- Any `--cli-*` flag → auto-set `--project-type cli`
- Error if type-specific flags conflict with explicit `--project-type`

### Mixed-Family Rejection

```typescript
const typeCount = [hasWebFlag, hasBackendFlag, hasCliFlag, hasGameFlag].filter(Boolean).length
if (typeCount > 1)
  throw new Error('Cannot mix flags from multiple project types (--web-*, --backend-*, --cli-*, --game-*)')
```

### .check() Validation

```typescript
.check((argv) => {
  // Auto-detect project type from flags
  const hasWebFlag = webFlagNames.some(f => argv[f] !== undefined)
  const hasBackendFlag = backendFlagNames.some(f => argv[f] !== undefined)
  const hasCliFlag = cliFlagNames.some(f => argv[f] !== undefined)
  const hasGameFlag = gameFlagNames.some(f => argv[f] !== undefined)

  // Reject mixed-family
  const typeCount = [hasWebFlag, hasBackendFlag, hasCliFlag, hasGameFlag].filter(Boolean).length
  if (typeCount > 1)
    throw new Error('Cannot mix flags from multiple project types')

  // Type-specific flags must match --project-type
  if (hasWebFlag && argv.projectType && argv.projectType !== 'web-app')
    throw new Error('--web-* flags require --project-type web-app')
  if (hasBackendFlag && argv.projectType && argv.projectType !== 'backend')
    throw new Error('--backend-* flags require --project-type backend')
  if (hasCliFlag && argv.projectType && argv.projectType !== 'cli')
    throw new Error('--cli-* flags require --project-type cli')

  // CSV array enum validation (coerceCSV splits but does not validate values)
  const validDataStores = ['relational', 'document', 'key-value']
  if (argv.backendDataStore) {
    const invalid = argv.backendDataStore.filter((v: string) => !validDataStores.includes(v))
    if (invalid.length) throw new Error(`Invalid --backend-data-store: ${invalid.join(', ')}`)
  }
  const validDistChannels = ['package-manager', 'system-package-manager', 'standalone-binary', 'container']
  if (argv.cliDistribution) {
    const invalid = argv.cliDistribution.filter((v: string) => !validDistChannels.includes(v))
    if (invalid.length) throw new Error(`Invalid --cli-distribution: ${invalid.join(', ')}`)
  }

  // WebApp cross-field
  if (['ssr', 'hybrid'].includes(argv.webRendering) && argv.webDeployTarget === 'static')
    throw new Error('SSR/hybrid rendering requires compute, not static hosting')
  if (argv.webAuthFlow === 'session' && argv.webDeployTarget === 'static')
    throw new Error('Session auth requires server state, incompatible with static hosting')

  return true
})
```

## Wizard Questions

### Flag-Skip Pattern

Matches v3.6.0 game flow:
- Flag provided → skip question, use flag value
- Flag absent + `--auto` → use Zod default (or error for required fields)
- Flag absent + interactive → ask the question

### Question Flow

Required anchor fields throw early under `--auto` if no flag was provided, rather than deferring to Zod (which would produce a confusing error after config serialization):

```typescript
if (projectType === 'web-app') {
  if (auto && !options.webRendering)
    throw new Error('--web-rendering is required in auto mode for web-app projects')

  const renderingStrategy = options.webRendering
    ?? await output.select('Rendering strategy?', ['spa', 'ssr', 'ssg', 'hybrid'])

  const deployTarget = options.webDeployTarget
    ?? (auto ? 'serverless' : await output.select('Deploy target?',
       ['static', 'serverless', 'container', 'edge', 'long-running']))

  const realtime = options.webRealtime
    ?? (auto ? 'none' : await output.select('Real-time needs?',
       ['none', 'websocket', 'sse']))

  const authFlow = options.webAuthFlow
    ?? (auto ? 'none' : await output.select('Authentication flow?',
       ['none', 'session', 'oauth', 'passkey']))

  answers.webAppConfig = { renderingStrategy, deployTarget, realtime, authFlow }
}

if (projectType === 'backend') {
  if (auto && !options.backendApiStyle)
    throw new Error('--backend-api-style is required in auto mode for backend projects')

  const apiStyle = options.backendApiStyle
    ?? await output.select('API style?', ['rest', 'graphql', 'grpc', 'trpc', 'none'])

  const dataStore = options.backendDataStore
    ?? (auto ? ['relational'] : await output.multiSelect('Data store(s)?',
       ['relational', 'document', 'key-value'], ['relational']))

  const authMechanism = options.backendAuth
    ?? (auto ? 'none' : await output.select('API auth mechanism?',
       ['none', 'jwt', 'session', 'oauth', 'apikey']))

  const asyncMessaging = options.backendMessaging
    ?? (auto ? 'none' : await output.select('Async messaging?',
       ['none', 'queue', 'event-driven']))

  const deployTarget = options.backendDeployTarget
    ?? (auto ? 'container' : await output.select('Deploy target?',
       ['serverless', 'container', 'long-running']))

  answers.backendConfig = { apiStyle, dataStore, authMechanism, asyncMessaging, deployTarget }
}

if (projectType === 'cli') {
  if (auto && !options.cliInteractivity)
    throw new Error('--cli-interactivity is required in auto mode for cli projects')

  const interactivity = options.cliInteractivity
    ?? await output.select('Interactivity model?', ['args-only', 'interactive', 'hybrid'])

  const distributionChannels = options.cliDistribution
    ?? (auto ? ['package-manager'] : await output.multiSelect('Distribution channels?',
       ['package-manager', 'system-package-manager', 'standalone-binary', 'container'],
       ['package-manager']))

  const hasStructuredOutput = options.cliStructuredOutput
    ?? (auto ? false : await output.confirm('Support structured output (--json)?', false))

  answers.cliConfig = { interactivity, distributionChannels, hasStructuredOutput }
}
```

### No Advanced Gate

With 3-5 flags per type, all questions are asked directly. No "Configure advanced options?" prompt is needed (unlike game's 11 fields split into core + advanced).

## Testing Strategy

Each new config type needs tests parallel to existing game config coverage:

- **Schema tests**: Defaults, `.strict()` rejection, projectType gating, cross-field validation (SSR+static, session+static)
- **Overlay loader tests**: Each overlay YAML loads and validates correctly
- **CLI flag tests**: Flag parsing, auto-detection, mixed-family rejection, CSV coercion
- **Wizard tests**: Flag-skip for each field, `--auto` behavior, interactive prompts
- **Integration tests**: Full `init` → `config.yml` → overlay resolution → knowledge injection flow

## Config Serialization in wizard.ts

The existing serialization at `wizard.ts:132-141` uses a spread pattern. Add the new configs:

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

## Config Serialization Example

```yaml
# config.yml for a web-app project
version: 2
methodology: deep
platforms: [claude-code]
project:
  platforms: [web]
  projectType: web-app
  webAppConfig:
    renderingStrategy: ssr
    deployTarget: serverless
    realtime: websocket
    authFlow: oauth
```

```yaml
# config.yml for a backend project
version: 2
methodology: deep
platforms: [claude-code]
project:
  platforms: [web]
  projectType: backend
  backendConfig:
    apiStyle: graphql
    dataStore: [relational, key-value]
    authMechanism: jwt
    asyncMessaging: queue
    deployTarget: container
```

```yaml
# config.yml for a CLI project
version: 2
methodology: mvp
platforms: [claude-code]
project:
  platforms: [desktop]
  projectType: cli
  cliConfig:
    interactivity: hybrid
    distributionChannels: [package-manager, system-package-manager]
    hasStructuredOutput: true
```
