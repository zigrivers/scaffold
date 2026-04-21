# Multi-Domain Stacking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen `domain` fields on `BackendConfigSchema` and `ResearchConfigSchema` to accept arrays so multiple domain sub-overlays stack in declaration order, while fixing the latent append-without-dedup bug in the sub-overlay knowledge merge path.

**Architecture:** Schema becomes a three-way union (literal `'none'` | single enum | non-empty array of enum). The resolver normalizes that union to a string list, iterates it, and merges each sub-overlay's knowledge with append+dedup (matching the existing `applyOverlay` contract). No `.transform()` — existing single-string write-sites keep working unchanged. Service-mode inherits support automatically because `ServiceSchema` reuses the shared config schemas.

**Tech Stack:** TypeScript, Zod, Vitest, js-yaml. Ships as v3.21.0.

**Spec:** `docs/superpowers/specs/2026-04-20-multi-domain-stacking-design.md` — read this first if you need context on decisions (D1-D6) or rejected alternatives.

**Branch:** `feat/multi-domain-stacking` (already exists with the spec commits).

---

## File Structure

**Create:**
- `tests/fixtures/methodology/backend-fake-a.yml` — contrived collision fixture
- `tests/fixtures/methodology/backend-fake-b.yml` — contrived collision fixture
- `tests/packaging/domain-overlay-alignment.test.ts` — packaging-integrity test

**Modify:**
- `src/config/schema.ts` — add exported `backendRealDomains` / `researchRealDomains`, add `domainField` helper, apply to both configs
- `src/config/schema.test.ts` — add array-shape parse + roundtrip tests
- `src/config/loader.test.ts` — add loader-level array-shape + error-path tests
- `src/core/assembly/overlay-state-resolver.ts` — add `normalizeDomains` helper, rewrite sub-overlay loop to iterate over normalized domain list, add dedup on knowledge append
- `src/core/assembly/overlay-state-resolver.test.ts` — add multi-domain tests using real research overlays and contrived backend fixtures
- `src/e2e/service-execution.test.ts` — add service-mode multi-domain tests
- `CHANGELOG.md` — v3.21.0 entry
- `docs/roadmap.md` — move Multi-Domain Stacking to Completed Releases
- `package.json`, `package-lock.json` — bump to 3.21.0 (in release-prep PR, not feature PR)

---

## Task 1: Schema widening

**Files:**
- Modify: `src/config/schema.ts:30-37` (BackendConfigSchema) and `:84-95` (ResearchConfigSchema)
- Test: `src/config/schema.test.ts`

This task widens both schemas simultaneously and adds unit-test coverage for every accepted and rejected shape listed in spec §1.1.

- [ ] **Step 1.1: Write the failing tests**

Add the following to `src/config/schema.test.ts` in a new `describe('domain field — multi-domain union', () => { ... })` block near the end of the file (after the ProjectSchema tests):

```typescript
import yaml from 'js-yaml'
import { BackendConfigSchema, ResearchConfigSchema, backendRealDomains, researchRealDomains } from './schema.js'

describe('domain field — multi-domain union', () => {
  const baseBackend = {
    apiStyle: 'rest' as const,
    dataStore: ['relational'] as const,
    authMechanism: 'jwt' as const,
    asyncMessaging: 'none' as const,
    deployTarget: 'container' as const,
  }

  const baseResearch = {
    experimentDriver: 'code-driven' as const,
    interactionMode: 'checkpoint-gated' as const,
    hasExperimentTracking: true,
  }

  it('exports canonical real-domain arrays', () => {
    expect(backendRealDomains).toEqual(['fintech'])
    expect(researchRealDomains).toEqual(['quant-finance', 'ml-research', 'simulation'])
  })

  it('accepts domain as single-element array on backend', () => {
    const result = BackendConfigSchema.safeParse({ ...baseBackend, domain: ['fintech'] })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.domain).toEqual(['fintech'])
  })

  it('accepts domain as multi-element array on research', () => {
    const result = ResearchConfigSchema.safeParse({
      ...baseResearch, domain: ['quant-finance', 'ml-research'],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.domain).toEqual(['quant-finance', 'ml-research'])
  })

  it('rejects empty array', () => {
    expect(BackendConfigSchema.safeParse({ ...baseBackend, domain: [] }).success).toBe(false)
  })

  it("rejects ['none'] (none disallowed inside array)", () => {
    expect(BackendConfigSchema.safeParse({ ...baseBackend, domain: ['none'] }).success).toBe(false)
  })

  it("rejects ['none', 'fintech']", () => {
    expect(BackendConfigSchema.safeParse({ ...baseBackend, domain: ['none', 'fintech'] }).success).toBe(false)
  })

  it('rejects unknown domain string', () => {
    expect(BackendConfigSchema.safeParse({ ...baseBackend, domain: 'climate' }).success).toBe(false)
  })

  it('rejects null domain', () => {
    expect(BackendConfigSchema.safeParse({ ...baseBackend, domain: null }).success).toBe(false)
  })

  it('preserves string shape through YAML roundtrip', () => {
    const parsed = BackendConfigSchema.parse({ ...baseBackend, domain: 'fintech' })
    const dumped = yaml.dump(parsed)
    const reparsed = BackendConfigSchema.parse(yaml.load(dumped))
    expect(reparsed.domain).toBe('fintech')
  })

  it('preserves array shape through YAML roundtrip', () => {
    const parsed = BackendConfigSchema.parse({ ...baseBackend, domain: ['fintech'] })
    const dumped = yaml.dump(parsed)
    const reparsed = BackendConfigSchema.parse(yaml.load(dumped))
    expect(reparsed.domain).toEqual(['fintech'])
  })

  it('defaults to "none" when domain omitted', () => {
    const result = BackendConfigSchema.safeParse(baseBackend)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.domain).toBe('none')
  })
})
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npx vitest run src/config/schema.test.ts -t "multi-domain union"`
Expected: All new tests FAIL with import errors for `backendRealDomains` / `researchRealDomains` (not yet exported) and/or type-check failures on array values (schema still enforces single-enum).

- [ ] **Step 1.3: Implement the schema widening**

Replace the block in `src/config/schema.ts` starting at `export const BackendConfigSchema` (line ~30) with the following. Preserve the exact field order and other field definitions — only change the `domain` field and add new exports above the schemas:

```typescript
/**
 * Canonical lists of "real" domain values (excluding 'none') for each
 * project-type family. These are the values a domain sub-overlay YAML file
 * can be named for.
 *
 * EXPORTED so tests/packaging/domain-overlay-alignment.test.ts can enumerate
 * them and assert that every value has a corresponding content/methodology/
 * file shipped. Do not inline these into the schemas — the packaging test
 * relies on the import.
 */
export const backendRealDomains = ['fintech'] as const
export const researchRealDomains = ['quant-finance', 'ml-research', 'simulation'] as const

/**
 * Build the `domain` field for a project-type config.
 *
 * Accepts three shapes:
 *   - 'none' (literal — explicit "no domain")
 *   - a single real domain string (e.g. 'fintech')
 *   - a non-empty array of real domain strings (e.g. ['fintech', 'climate'])
 *
 * DO NOT add `.transform()`. Transforming would coerce the Zod output type
 * from `string | string[]` to `string[]`, which breaks every existing
 * write-site (wizard, CLI flags, detector) that assigns single strings into
 * `BackendConfig['domain']`. Normalization lives in the resolver instead.
 * See spec §1.3 / §3.2 for the consumer audit.
 */
function domainField<const T extends readonly [string, ...string[]]>(realValues: T) {
  return z.union([
    z.literal('none'),
    z.enum(realValues),
    z.array(z.enum(realValues)).min(1),
  ]).default('none')
}

export const BackendConfigSchema = z.object({
  apiStyle: z.enum(['rest', 'graphql', 'grpc', 'trpc', 'none']),
  dataStore: z.array(z.enum(['relational', 'document', 'key-value'])).min(1).default(['relational']),
  authMechanism: z.enum(['none', 'jwt', 'session', 'oauth', 'apikey']).default('none'),
  asyncMessaging: z.enum(['none', 'queue', 'event-driven']).default('none'),
  deployTarget: z.enum(['serverless', 'container', 'long-running']).default('container'),
  domain: domainField(backendRealDomains),
}).strict()
```

And for the research schema (around line 84):

```typescript
export const ResearchConfigSchema = z.object({
  experimentDriver: z.enum([
    'code-driven', 'config-driven', 'api-driven', 'notebook-driven',
  ]),
  interactionMode: z.enum([
    'autonomous', 'checkpoint-gated', 'human-guided',
  ]).default('checkpoint-gated'),
  hasExperimentTracking: z.boolean().default(true),
  domain: domainField(researchRealDomains),
}).strict()
```

- [ ] **Step 1.4: Run all schema tests to verify pass**

Run: `npx vitest run src/config/schema.test.ts`
Expected: PASS — new tests pass, all previously-existing tests (including `.toBe('fintech')` and `.toBe('none')` string assertions) still pass because single-string shapes remain valid.

- [ ] **Step 1.5: Type-check**

Run: `npm run type-check`
Expected: PASS. If it fails, the likely culprit is a type-narrowing issue in one of the existing consumers (wizard/CLI). The spec §3.2 lists every consumer and asserts zero breakage — investigate the specific line and report before making code changes elsewhere.

- [ ] **Step 1.6: Commit**

```bash
git add src/config/schema.ts src/config/schema.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): widen domain to accept arrays (multi-domain stacking)

Adds exported backendRealDomains / researchRealDomains constants and a
domainField helper that produces a three-way union: literal 'none' |
single enum | non-empty array of enum. No .transform() — downstream
write-sites still assign single strings freely.

Backward-compat: all existing configs (domain: 'fintech' or domain:
'none') continue to parse as strings. Array shape is new.

Part of v3.21.0 multi-domain stacking. See
docs/superpowers/specs/2026-04-20-multi-domain-stacking-design.md §1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Loader-level array-shape coverage

**Files:**
- Test: `src/config/loader.test.ts`

Adds end-to-end YAML → `loadConfig` → parsed-config tests. These exercise the full error-reporting surface (via `loader.ts:130-148`) and verify that Zod issue paths surface with the expected `project.` prefix.

- [ ] **Step 2.1: Write the failing tests**

Append the following tests to `src/config/loader.test.ts`, inside the existing `describe('loadConfig', () => { ... })` block (or a new nested `describe` block — match the file's existing convention):

```typescript
  it('accepts array-shape domain at root (backend)', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms: [claude-code]
project:
  projectType: backend
  backendConfig:
    apiStyle: rest
    domain: [fintech]
`)
    const { config, errors } = loadConfig(root, [])
    expect(errors).toHaveLength(0)
    expect(config).not.toBeNull()
    expect(config?.project?.backendConfig?.domain).toEqual(['fintech'])
  })

  it('accepts array-shape domain on a service', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: api
      projectType: backend
      backendConfig:
        apiStyle: rest
        domain: [fintech]
`)
    const { config, errors } = loadConfig(root, [])
    expect(errors).toHaveLength(0)
    expect(config).not.toBeNull()
    expect(config?.project?.services?.[0]?.backendConfig?.domain).toEqual(['fintech'])
  })

  it('rejects empty-array domain with project.backendConfig.domain field path', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms: [claude-code]
project:
  projectType: backend
  backendConfig:
    apiStyle: rest
    domain: []
`)
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    const domainErrors = errors.filter(e =>
      e.code === 'FIELD_INVALID_VALUE'
      && e.context?.field === 'project.backendConfig.domain',
    )
    expect(domainErrors.length).toBeGreaterThan(0)
  })

  it("rejects ['none'] array with project.backendConfig.domain field path", () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms: [claude-code]
project:
  projectType: backend
  backendConfig:
    apiStyle: rest
    domain: [none]
`)
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    const domainErrors = errors.filter(e =>
      e.code === 'FIELD_INVALID_VALUE'
      && e.context?.field === 'project.backendConfig.domain',
    )
    expect(domainErrors.length).toBeGreaterThan(0)
  })
```

- [ ] **Step 2.2: Run tests to verify they pass**

Run: `npx vitest run src/config/loader.test.ts`
Expected: PASS. These tests verify existing `loader.ts` behavior against the widened schema from Task 1 — no production code change needed in this task.

If any loader test fails, the failure is a signal that Task 1's schema doesn't match the spec — investigate before proceeding.

- [ ] **Step 2.3: Commit**

```bash
git add src/config/loader.test.ts
git commit -m "$(cat <<'EOF'
test(loader): add array-shape domain end-to-end coverage

Exercises the full YAML -> loadConfig -> parsed-config path for array-
shape domain values (spec §5.2 tests 12-15). Also asserts that Zod
issue paths surface as project.backendConfig.domain (with the project.
prefix) after going through loader.ts:130-148.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Resolver normalization + iteration + dedup fix

**Files:**
- Modify: `src/core/assembly/overlay-state-resolver.ts:97-125`
- Test: `src/core/assembly/overlay-state-resolver.test.ts`

This is the core feature change. It adds `normalizeDomains`, rewrites the sub-overlay block to iterate, and fixes the latent append-without-dedup bug on knowledge merge.

- [ ] **Step 3.1: Write the failing test (string-form invariant)**

This test proves that after the rewrite, single-string domain configs still produce the same resolved knowledge as they do today. Append to `src/core/assembly/overlay-state-resolver.test.ts` inside the existing top-level `describe('resolveOverlayState', () => { ... })` block, after the existing backend-fintech test at line ~346:

```typescript
  it('resolves identically for domain: "fintech" and domain: ["fintech"] (array shape invariant)', () => {
    const backendConfigBase = {
      apiStyle: 'rest' as const,
      dataStore: ['relational' as const],
      authMechanism: 'jwt' as const,
      asyncMessaging: 'none' as const,
      deployTarget: 'container' as const,
    }
    const presetSteps: Record<string, StepEnablementEntry> = {
      'tech-stack': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['tech-stack', { frontmatter: makeFrontmatter({
        name: 'tech-stack', knowledgeBase: ['tech-stack-selection'],
        reads: [], dependencies: [],
      }) }],
    ])

    const stringResult = resolveOverlayState({
      config: makeConfig({
        project: {
          projectType: 'backend',
          backendConfig: { ...backendConfigBase, domain: 'fintech' },
        },
      }),
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    const arrayResult = resolveOverlayState({
      config: makeConfig({
        project: {
          projectType: 'backend',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          backendConfig: { ...backendConfigBase, domain: ['fintech'] as any },
        },
      }),
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    expect(stringResult.knowledge['tech-stack']).toEqual(arrayResult.knowledge['tech-stack'])
  })
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts -t "array shape invariant"`
Expected: FAIL — the current resolver has `typeof typeConfig.domain === 'string'` check (line 106), so the array-form branch loads no overlay, producing `['tech-stack-selection']` while the string branch produces `['tech-stack-selection', 'fintech-compliance']`.

- [ ] **Step 3.3: Implement the resolver change**

Replace the block in `src/core/assembly/overlay-state-resolver.ts` lines 97-125 (the "Generic domain sub-overlay" block) with the following. The block sits inside the `if (projectType) { ... }` branch that also handles the project-type overlay pass-1:

```typescript
    // Generic domain sub-overlay: types with a 'domain' config field get sub-overlay injection.
    // Supports both single-domain string and multi-domain array shapes (spec §2 v3.21.0).
    const TYPE_DOMAIN_CONFIG: Partial<Record<string, string>> = {
      'research': 'researchConfig',
      'backend': 'backendConfig',
      // Future types with domain support can be added here
    }
    const domainConfigKey = TYPE_DOMAIN_CONFIG[projectType]
    if (domainConfigKey) {
      const typeConfig = config.project?.[domainConfigKey] as Record<string, unknown> | undefined
      const rawDomain = typeConfig?.['domain'] as string | string[] | undefined
      const domains = normalizeDomains(rawDomain, output, `${domainConfigKey}.domain`)
      for (const domain of domains) {
        const subOverlayPath = path.join(methodologyDir, `${projectType}-${domain}.yml`)
        // Silent-skip missing files — packaging-integrity test is the backstop (spec §2.3, §5.5)
        if (!fs.existsSync(subOverlayPath)) continue
        const { overlay: subOverlay, errors: subErrors, warnings: subWarnings } =
          loadSubOverlay(subOverlayPath)
        for (const err of subErrors) {
          output.warn(`[${err.code}] ${err.message}${err.recovery ? ` — ${err.recovery}` : ''}`)
        }
        for (const w of subWarnings) output.warn(w)
        if (subOverlay) {
          // Apply knowledge-overrides only, starting from ALREADY-MERGED overlayKnowledge.
          // Append + dedup preserving first-occurrence order — matches applyOverlay contract
          // (overlay-resolver.ts:97-100). The prior single-domain path did plain append
          // without dedup, which multi-domain stacking would make observably wrong.
          for (const [step, overrides] of Object.entries(subOverlay.knowledgeOverrides ?? {})) {
            if (step in overlayKnowledge) {
              const toAppend = overrides.append ?? []
              overlayKnowledge[step] = [...new Set([...overlayKnowledge[step], ...toAppend])]
            }
            // else: sub-overlay references a step not in the pipeline — silently skip
            // (common when domain overlays target optional steps that aren't enabled)
          }
        }
      }
    }
```

Then add the `normalizeDomains` helper at the bottom of `src/core/assembly/overlay-state-resolver.ts`, after `resolveOverlayState`:

```typescript
/**
 * Normalize a raw domain config value (string | string[] | undefined) into an
 * iteration-ready list of domain names. Filters 'none' (treating it as
 * "no domain configured"), dedups with warning, and preserves declaration order.
 *
 * Spec §2.2. Not exported: the resolver is the only consumer today. If a second
 * consumer appears, export from this file.
 */
function normalizeDomains(
  raw: string | string[] | undefined,
  output: OutputContext,
  configKeyForMessages: string,
): string[] {
  if (raw === undefined || raw === 'none') return []
  const arr = Array.isArray(raw) ? raw : [raw]
  // Schema rejects 'none' inside arrays (spec §1.1), so no 'none' filter is
  // needed here. The resolver trusts the Zod-parsed shape.
  const deduped = [...new Set(arr)]
  if (deduped.length !== arr.length) {
    const dupes = [...new Set(arr.filter((d, i) => arr.indexOf(d) !== i))]
    output.warn(
      `Duplicate domain(s) in ${configKeyForMessages}: ${dupes.join(', ')} — deduplicated`,
    )
  }
  return deduped
}
```

- [ ] **Step 3.4: Run failing test again to verify it passes**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts -t "array shape invariant"`
Expected: PASS.

- [ ] **Step 3.5: Run full resolver test suite to verify no regressions**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts`
Expected: PASS on all tests, including the existing single-domain tests (`'loads backend-fintech.yml when BackendConfig.domain is fintech'`, etc.).

- [ ] **Step 3.6: Commit**

```bash
git add src/core/assembly/overlay-state-resolver.ts src/core/assembly/overlay-state-resolver.test.ts
git commit -m "$(cat <<'EOF'
feat(resolver): multi-domain iteration + fix append-without-dedup

Adds normalizeDomains helper (string | string[] | undefined -> string[]
with 'none' filtering, dedup warning, declaration-order preservation).
Rewrites the sub-overlay block to iterate over normalized domain list
instead of hardcoding a single-string check.

Also fixes a latent bug: sub-overlay knowledge append used plain array
concatenation; the corresponding applyOverlay path does append+dedup
via new Set. Multi-domain stacking would have made the drift visible.
The fix preserves single-domain behavior for configs that didn't have
collisions (every current production sub-overlay is collision-free).

Part of v3.21.0 multi-domain stacking. Spec §2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Multi-domain integration tests with real research overlays

**Files:**
- Test: `src/core/assembly/overlay-state-resolver.test.ts`

Real-overlay coverage exercises end-to-end resolution against packaged content (`content/methodology/research-quant-finance.yml`, `research-ml-research.yml`). Both overlays touch `system-architecture` disjointly, which is perfect for order-preservation assertions. Per spec §5.3, do NOT use these for collision/dedup assertions — they don't collide naturally. Collision fixtures go in Task 5.

- [ ] **Step 4.1: Find the methodology directory pointer**

Look at `src/core/assembly/overlay-state-resolver.test.ts:12`:
```typescript
const fixtureDir = path.resolve(__dirname, '../../../tests/fixtures/methodology')
```

For Task 4's tests we need the **real production methodology** dir, not fixtures. Import the helper that other tests use (example: `src/e2e/service-execution.test.ts:42` imports `getPackageMethodologyDir`). Add the import to the top of the test file near the existing imports:

```typescript
import { getPackageMethodologyDir } from '../../utils/fs.js'
```

- [ ] **Step 4.2: Write the failing tests**

Append the following tests to the existing `describe('resolveOverlayState', () => { ... })` block in `src/core/assembly/overlay-state-resolver.test.ts`:

```typescript
  describe('multi-domain stacking — real research overlays', () => {
    const realMethodologyDir = getPackageMethodologyDir()

    const researchBase = {
      experimentDriver: 'code-driven' as const,
      interactionMode: 'checkpoint-gated' as const,
      hasExperimentTracking: true,
    }

    // research-quant-finance.yml appends to system-architecture:
    //   [research-quant-backtesting, research-quant-strategy-patterns]
    // research-ml-research.yml appends to system-architecture:
    //   [research-ml-architecture-search, research-ml-training-patterns]
    // research-overlay.yml (pass-1 core) appends:
    //   [research-architecture, research-experiment-loop]
    // All entries are disjoint — no natural collision.

    function makeResearchConfigWithDomains(domain: unknown) {
      return makeConfig({
        project: {
          projectType: 'research',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          researchConfig: { ...researchBase, domain: domain as any },
        },
      })
    }

    function makeMetaPromptsForSystemArch() {
      return new Map<string, { frontmatter: MetaPromptFrontmatter }>([
        ['system-architecture', { frontmatter: makeFrontmatter({
          name: 'system-architecture', knowledgeBase: [],
          reads: [], dependencies: [],
        }) }],
      ])
    }

    it('merges both overlays in declaration order (quant-finance, ml-research)', () => {
      const result = resolveOverlayState({
        config: makeResearchConfigWithDomains(['quant-finance', 'ml-research']),
        methodologyDir: realMethodologyDir,
        metaPrompts: makeMetaPromptsForSystemArch(),
        presetSteps: { 'system-architecture': { enabled: true } },
        output: makeOutput(),
      })
      // Core overlay first, then quant-finance, then ml-research
      expect(result.knowledge['system-architecture']).toEqual([
        'research-architecture',
        'research-experiment-loop',
        'research-quant-backtesting',
        'research-quant-strategy-patterns',
        'research-ml-architecture-search',
        'research-ml-training-patterns',
      ])
    })

    it('respects declaration order when reversed (ml-research, quant-finance)', () => {
      const result = resolveOverlayState({
        config: makeResearchConfigWithDomains(['ml-research', 'quant-finance']),
        methodologyDir: realMethodologyDir,
        metaPrompts: makeMetaPromptsForSystemArch(),
        presetSteps: { 'system-architecture': { enabled: true } },
        output: makeOutput(),
      })
      expect(result.knowledge['system-architecture']).toEqual([
        'research-architecture',
        'research-experiment-loop',
        'research-ml-architecture-search',
        'research-ml-training-patterns',
        'research-quant-backtesting',
        'research-quant-strategy-patterns',
      ])
    })

    it('single-element array matches single-string behavior (invariant)', () => {
      const stringResult = resolveOverlayState({
        config: makeResearchConfigWithDomains('quant-finance'),
        methodologyDir: realMethodologyDir,
        metaPrompts: makeMetaPromptsForSystemArch(),
        presetSteps: { 'system-architecture': { enabled: true } },
        output: makeOutput(),
      })
      const arrayResult = resolveOverlayState({
        config: makeResearchConfigWithDomains(['quant-finance']),
        methodologyDir: realMethodologyDir,
        metaPrompts: makeMetaPromptsForSystemArch(),
        presetSteps: { 'system-architecture': { enabled: true } },
        output: makeOutput(),
      })
      expect(stringResult.knowledge['system-architecture']).toEqual(
        arrayResult.knowledge['system-architecture'],
      )
    })
  })
```

- [ ] **Step 4.3: Run tests**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts -t "real research overlays"`
Expected: PASS. Task 3's resolver change already handles the iteration; these tests verify the end-to-end wiring against real content.

If a test fails because a knowledge entry is missing or reordered, check whether the spec predictions match the actual YAML file contents. The test predictions were generated from the YAML files at the time this plan was written. If the production YAMLs have since been edited, update the test assertions to match reality (or open a separate ticket if the YAML change was unintentional).

- [ ] **Step 4.4: Commit**

```bash
git add src/core/assembly/overlay-state-resolver.test.ts
git commit -m "$(cat <<'EOF'
test(resolver): multi-domain stacking with real research overlays

Exercises multi-domain merge semantics against packaged
research-quant-finance.yml + research-ml-research.yml. Asserts exact
array contents on system-architecture to pin both merge correctness
and declaration-order semantics (spec §5.3 tests 16-18).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Contrived collision fixtures + unit coverage

**Files:**
- Create: `tests/fixtures/methodology/backend-fake-a.yml`
- Create: `tests/fixtures/methodology/backend-fake-b.yml`
- Test: `src/core/assembly/overlay-state-resolver.test.ts`

Real overlays don't collide, so dedup + duplicate-warning behavior is tested against hand-crafted fixtures that engineer the collision. Spec §5.4.

- [ ] **Step 5.1: Create the fixture overlays**

Create `tests/fixtures/methodology/backend-fake-a.yml`:

```yaml
name: backend-fake-a
description: Test fixture sub-overlay A — stacks with fake-b to test collision dedup.
project-type: backend
domain: fake-a

knowledge-overrides:
  tech-stack:
    append: [fake-a-only, shared-entry]
```

Create `tests/fixtures/methodology/backend-fake-b.yml`:

```yaml
name: backend-fake-b
description: Test fixture sub-overlay B — stacks with fake-a to test collision dedup.
project-type: backend
domain: fake-b

knowledge-overrides:
  tech-stack:
    append: [shared-entry, fake-b-only]
```

- [ ] **Step 5.2: Write the failing tests**

Append to the existing `describe('resolveOverlayState', () => { ... })` block in `src/core/assembly/overlay-state-resolver.test.ts`:

```typescript
  describe('multi-domain stacking — contrived fixtures', () => {
    const backendConfigBase = {
      apiStyle: 'rest' as const,
      dataStore: ['relational' as const],
      authMechanism: 'jwt' as const,
      asyncMessaging: 'none' as const,
      deployTarget: 'container' as const,
    }

    function makeBackendConfigWithDomains(domain: unknown) {
      return makeConfig({
        project: {
          projectType: 'backend',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          backendConfig: { ...backendConfigBase, domain: domain as any },
        },
      })
    }

    function makeMetaPromptsForTechStack() {
      return new Map<string, { frontmatter: MetaPromptFrontmatter }>([
        ['tech-stack', { frontmatter: makeFrontmatter({
          name: 'tech-stack', knowledgeBase: ['base-entry'],
          reads: [], dependencies: [],
        }) }],
      ])
    }

    it('dedups first-occurrence across contrived fixture collision', () => {
      // fake-a appends [fake-a-only, shared-entry]
      // fake-b appends [shared-entry, fake-b-only]
      // Expected: [base-entry, fintech-compliance, fake-a-only, shared-entry, fake-b-only]
      // Note: fintech-compliance comes from the existing tests/fixtures/methodology/backend-fintech.yml
      //       that the fixture dir includes. We're stacking fake-a + fake-b only, so no fintech entry.
      const result = resolveOverlayState({
        config: makeBackendConfigWithDomains(['fake-a', 'fake-b']),
        methodologyDir: fixtureDir,
        metaPrompts: makeMetaPromptsForTechStack(),
        presetSteps: { 'tech-stack': { enabled: true } },
        output: makeOutput(),
      })
      // Expected order:
      //   base-entry (from frontmatter knowledgeBase)
      //   fake-a-only + shared-entry (from fake-a.yml append)
      //   fake-b-only (from fake-b.yml — shared-entry deduped away by Set)
      expect(result.knowledge['tech-stack']).toEqual([
        'base-entry',
        'fake-a-only',
        'shared-entry',
        'fake-b-only',
      ])
    })

    it('warns on duplicate domain names and loads the overlay once', () => {
      const output = makeOutput()
      const result = resolveOverlayState({
        config: makeBackendConfigWithDomains(['fake-a', 'fake-a']),
        methodologyDir: fixtureDir,
        metaPrompts: makeMetaPromptsForTechStack(),
        presetSteps: { 'tech-stack': { enabled: true } },
        output,
      })
      // Duplicate warning mentions backendConfig.domain for user context
      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate domain(s) in backendConfig.domain'),
      )
      expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('fake-a'))
      // Overlay loaded only once — one set of fake-a entries (no double-append)
      expect(result.knowledge['tech-stack']).toEqual([
        'base-entry', 'fake-a-only', 'shared-entry',
      ])
    })

    it('silently skips missing sub-overlay file (no warning)', () => {
      const output = makeOutput()
      // 'fake-c' domain has no corresponding fixture file — should silent-skip
      const result = resolveOverlayState({
        config: makeBackendConfigWithDomains(['fake-a', 'fake-c']),
        methodologyDir: fixtureDir,
        metaPrompts: makeMetaPromptsForTechStack(),
        presetSteps: { 'tech-stack': { enabled: true } },
        output,
      })
      // No warnings emitted for missing file (spec §5.4 test 23)
      expect(output.warn).not.toHaveBeenCalled()
      // fake-a still loaded; fake-c silently absent
      expect(result.knowledge['tech-stack']).toEqual([
        'base-entry', 'fake-a-only', 'shared-entry',
      ])
    })
  })
```

- [ ] **Step 5.3: Run tests**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts -t "contrived fixtures"`
Expected: PASS. If the dedup test fails with `['base-entry', 'fake-a-only', 'shared-entry', 'shared-entry', 'fake-b-only']`, Task 3's `new Set` wrap didn't apply — check that line of code in the resolver.

- [ ] **Step 5.4: Commit**

```bash
git add tests/fixtures/methodology/backend-fake-a.yml tests/fixtures/methodology/backend-fake-b.yml src/core/assembly/overlay-state-resolver.test.ts
git commit -m "$(cat <<'EOF'
test(resolver): multi-domain contrived collision + duplicate-warning

Adds two fake fixture sub-overlays (backend-fake-a.yml,
backend-fake-b.yml) to engineer knowledge collisions that real
production overlays don't produce. Covers:

- First-occurrence dedup across core + two fixture overlays (spec §5.4
  test 22)
- Duplicate domain warning mentions backendConfig.domain context
  (spec §5.4 test 21 + §2.2)
- Missing sub-overlay file silent-skip (spec §5.4 test 23)

Config domain field is cast-bypassed ('as any') because schema rejects
fake-a/fake-b values — same pattern as overlay-state-resolver.test.ts
:233 uses for the malformed-overlay test.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Service-mode integration tests

**Files:**
- Test: `src/e2e/service-execution.test.ts`

Proves multi-domain works when resolved via `resolvePipeline(context, { serviceId })` — the real service-mode entry point. Research is used because backend has only one real domain today.

- [ ] **Step 6.1: Write the failing tests**

Append the following to `src/e2e/service-execution.test.ts` inside the existing `describe('service-qualified execution E2E', () => { ... })` block, after the existing tests:

```typescript
  // Test: service-mode multi-domain resolves both sub-overlays in declaration order
  it('service-mode multi-domain: research service with [quant-finance, ml-research]', async () => {
    const methodologyDir = getPackageMethodologyDir()
    const realMetaPrompts = await discoverRealMetaPrompts()
    const knownSteps = [...realMetaPrompts.keys()]
    const presets = loadAllPresets(methodologyDir, knownSteps)
    const output = createMockOutput()

    // Research service with multi-domain array. Cast bypasses the schema-at-test-
    // construction check; the schema accepts this shape at actual load time (§5.3.1).
    const config = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        services: [
          {
            name: 'experiments',
            projectType: 'research',
            researchConfig: {
              experimentDriver: 'code-driven',
              interactionMode: 'checkpoint-gated',
              hasExperimentTracking: true,
              domain: ['quant-finance', 'ml-research'],
            },
          },
        ],
      },
    } as unknown as ScaffoldConfig

    const pipeline = resolvePipeline(
      {
        projectRoot: '/tmp/test',
        metaPrompts: realMetaPrompts,
        config,
        configErrors: [],
        configWarnings: [],
        presets,
        methodologyDir,
      },
      { output, serviceId: 'experiments' },
    )

    const sysArchKnowledge = pipeline.overlay.knowledge['system-architecture'] ?? []
    // Both overlays contributed — declaration order means quant-finance entries
    // appear before ml-research entries.
    const quantIdx = sysArchKnowledge.indexOf('research-quant-backtesting')
    const mlIdx = sysArchKnowledge.indexOf('research-ml-architecture-search')
    expect(quantIdx).toBeGreaterThan(-1)
    expect(mlIdx).toBeGreaterThan(-1)
    expect(quantIdx).toBeLessThan(mlIdx)
  })

  // Test: service-mode multi-domain reversed order still respects declaration order
  it('service-mode multi-domain: reversed order produces reversed positions', async () => {
    const methodologyDir = getPackageMethodologyDir()
    const realMetaPrompts = await discoverRealMetaPrompts()
    const knownSteps = [...realMetaPrompts.keys()]
    const presets = loadAllPresets(methodologyDir, knownSteps)
    const output = createMockOutput()

    const config = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        services: [
          {
            name: 'experiments',
            projectType: 'research',
            researchConfig: {
              experimentDriver: 'code-driven',
              interactionMode: 'checkpoint-gated',
              hasExperimentTracking: true,
              domain: ['ml-research', 'quant-finance'],
            },
          },
        ],
      },
    } as unknown as ScaffoldConfig

    const pipeline = resolvePipeline(
      {
        projectRoot: '/tmp/test',
        metaPrompts: realMetaPrompts,
        config,
        configErrors: [],
        configWarnings: [],
        presets,
        methodologyDir,
      },
      { output, serviceId: 'experiments' },
    )

    const sysArchKnowledge = pipeline.overlay.knowledge['system-architecture'] ?? []
    const quantIdx = sysArchKnowledge.indexOf('research-quant-backtesting')
    const mlIdx = sysArchKnowledge.indexOf('research-ml-architecture-search')
    expect(quantIdx).toBeGreaterThan(-1)
    expect(mlIdx).toBeGreaterThan(-1)
    // Reversed: ml-research entries appear BEFORE quant-finance entries
    expect(mlIdx).toBeLessThan(quantIdx)
  })
```

- [ ] **Step 6.2: Run tests**

Run: `npx vitest run src/e2e/service-execution.test.ts -t "multi-domain"`
Expected: PASS. These tests exercise the real `resolvePipeline` with `serviceId`, which internally calls `resolveOverlayState` with the service's config.

If a test fails, likely causes:
- Service-mode resolver flow doesn't route the config's `researchConfig` correctly — check `src/core/pipeline/resolver.ts` for how it handles the service's config before calling `resolveOverlayState`.
- Indexes are both `-1` → overlay wasn't applied. Verify `methodologyDir` points at real content and `projectType` routing works for services.

- [ ] **Step 6.3: Commit**

```bash
git add src/e2e/service-execution.test.ts
git commit -m "$(cat <<'EOF'
test(e2e): service-mode multi-domain stacking

Exercises resolvePipeline(ctx, { serviceId }) with a research service
declaring domain: ['quant-finance', 'ml-research']. Asserts both
sub-overlays contribute to system-architecture and declaration order
is preserved through the service-mode resolution path (spec §5.3.1
tests 19-20).

ServiceSchema reuses ResearchConfigSchema by reference, so the widened
schema from Task 1 automatically covers service-mode configs — no
extra resolver plumbing needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Packaging-integrity test

**Files:**
- Create: `tests/packaging/domain-overlay-alignment.test.ts`

Asserts that every exported real-domain value has a matching `{projectType}-{domain}.yml` in `content/methodology/`. Catches the packaging-bug class that would otherwise surface only as silent resolver no-ops.

- [ ] **Step 7.1: Write the failing test**

Create `tests/packaging/domain-overlay-alignment.test.ts` with:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { backendRealDomains, researchRealDomains } from '../../src/config/schema.js'
import { getPackageMethodologyDir } from '../../src/utils/fs.js'

describe('packaging integrity — domain overlays aligned with schema enums', () => {
  const methodologyDir = getPackageMethodologyDir()

  it('every backendRealDomains entry has a content/methodology file', () => {
    for (const domain of backendRealDomains) {
      const overlayPath = path.join(methodologyDir, `backend-${domain}.yml`)
      expect(
        fs.existsSync(overlayPath),
        `Expected ${overlayPath} to exist for backendRealDomains entry '${domain}'`,
      ).toBe(true)
      expect(
        fs.statSync(overlayPath).isFile(),
        `Expected ${overlayPath} to be a regular file`,
      ).toBe(true)
    }
  })

  it('every researchRealDomains entry has a content/methodology file', () => {
    for (const domain of researchRealDomains) {
      const overlayPath = path.join(methodologyDir, `research-${domain}.yml`)
      expect(
        fs.existsSync(overlayPath),
        `Expected ${overlayPath} to exist for researchRealDomains entry '${domain}'`,
      ).toBe(true)
      expect(
        fs.statSync(overlayPath).isFile(),
        `Expected ${overlayPath} to be a regular file`,
      ).toBe(true)
    }
  })
})
```

- [ ] **Step 7.2: Run test**

Run: `npx vitest run tests/packaging/domain-overlay-alignment.test.ts`
Expected: PASS. Current repo state has `backend-fintech.yml`, `research-quant-finance.yml`, `research-ml-research.yml`, `research-simulation.yml` — all four are shipped.

If this fails today, the repo has a pre-existing packaging bug — investigate before shipping.

- [ ] **Step 7.3: Commit**

```bash
git add tests/packaging/domain-overlay-alignment.test.ts
git commit -m "$(cat <<'EOF'
test(packaging): verify domain overlays aligned with schema enums

Asserts every backendRealDomains / researchRealDomains entry has a
corresponding content/methodology/*.yml file. Catches the packaging-
bug class where an enum value ships without its overlay content —
otherwise manifests as a silent resolver no-op (spec §5.5).

Replaces the retracted D5b runtime warning. Catches the same class of
bug earlier, deterministically, with zero runtime cost.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full test suite + type-check

Before adding docs/release commits, verify the entire repo stays green.

- [ ] **Step 8.1: Run full test suite**

Run: `npm test`
Expected: PASS — every test, old and new.

- [ ] **Step 8.2: Run type-check**

Run: `npm run type-check`
Expected: PASS. No new type errors in schema, resolver, wizard, CLI, or detector call sites.

- [ ] **Step 8.3: Run lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 8.4: Run full check gate**

Run: `make check-all`
Expected: PASS on all gates (bash + TypeScript).

- [ ] **Step 8.5: Commit — no-op expected, but safeguard**

If steps 8.1-8.4 required any fixes, commit them now:
```bash
git status
# If there are uncommitted changes, diagnose: lint warnings fixed? Type cast added? 
# Commit with a descriptive message explaining the fix.
```

---

## Task 9: CHANGELOG + roadmap

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 9.1: Add CHANGELOG entry**

Prepend the following section to `CHANGELOG.md`, above the most recent v3.20.0 entry:

```markdown
## [3.21.0] — 2026-04-20

### Added
- **Multi-domain stacking**: `backendConfig.domain` and `researchConfig.domain` now accept arrays. Multiple domain sub-overlays stack in declaration order.
  - Example: `researchConfig.domain: ['quant-finance', 'ml-research']` loads both sub-overlays, merging their knowledge with append + dedup.
  - Service-mode multi-domain inherited automatically via `ServiceSchema` reuse — works out of the box for services[] in monorepos.
  - Single-string form (`domain: 'fintech'`) continues to work unchanged — zero config migration required.
  - Packaging-integrity test added (`tests/packaging/domain-overlay-alignment.test.ts`) to catch enum-vs-file drift at build time rather than via silent runtime skip.
- Exported `backendRealDomains` / `researchRealDomains` canonical arrays from `src/config/schema.ts` for downstream enumeration.

### Fixed
- **Latent sub-overlay knowledge dedup bug** — sub-overlay knowledge merge now uses append + dedup (matching the documented `applyOverlay` contract). Previously plain-appended, which would have produced duplicate entries once multi-domain stacking made collisions possible. No observable impact for configs with a single domain whose sub-overlay knowledge doesn't overlap the core overlay — verified true for all shipped sub-overlays.

### Internal
- `normalizeDomains` helper in `overlay-state-resolver.ts` — file-local, not exported.
- 10+ new tests across schema, loader, resolver, service-mode e2e, and packaging gates.
```

- [ ] **Step 9.2: Update roadmap**

Edit `docs/roadmap.md`:

**Find** the "Multi-Domain Stacking" section (currently under "Near-Term Enhancements" or "Phase 2 Features" — verify exact location):

```markdown
### Multi-Domain Stacking

Currently each project type supports one domain (e.g., `backend` + `fintech`). Multi-domain would allow:
```yaml
backendConfig:
  domain: ['fintech', 'healthcare']
```

Requires overlay conflict resolution for knowledge injection when multiple domains overlap.

**Scope**: Design needed. Depends on Wave 2 overlay conflict resolution.
```

**Delete** that block.

**Add** to the "Completed Releases" section at the top, above the v3.20.0 entry:

```markdown
### v3.21.0 (2026-04-20)

Multi-Domain Stacking — `backendConfig.domain` / `researchConfig.domain` accept arrays to stack multiple domain sub-overlays in declaration order. Completes roadmap Phase 2 "Multi-Domain Stacking."

- **Schema change**: 3-way union on `domain` field (`'none'` literal | single enum | non-empty array of enum). No `.transform()` — zero write-site breakage.
- **Resolver change**: `normalizeDomains` helper iterates over domains with warn-on-duplicate; knowledge merge now append + dedup (fixes latent single-domain bug).
- **Service-mode**: inherited automatically via `ServiceSchema` reuse — `services[N].researchConfig.domain: [...]` works out of the box.
- **Fixture-only test content**: no new production domain sub-overlays ship with this feature. Two contrived fixtures (`backend-fake-a.yml`, `backend-fake-b.yml`) used only to engineer collision cases.
- **Review discipline**: 4-round spec MMR (Codex + Gemini) + 3-channel PR MMR. PR #TBD.
```

Replace `#TBD` with the real PR number once the feature PR is filed (Task 10).

- [ ] **Step 9.3: Commit**

```bash
git add CHANGELOG.md docs/roadmap.md
git commit -m "$(cat <<'EOF'
docs: v3.21.0 multi-domain stacking changelog + roadmap

- CHANGELOG.md: document schema widening, dedup bug fix, packaging test,
  and exported canonical constants.
- docs/roadmap.md: move Multi-Domain Stacking from Phase 2 Features to
  Completed Releases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Feature PR + 3-channel MMR

**Workflow:** Per `CLAUDE.md` Mandatory 3-Channel PR Review section.

- [ ] **Step 10.1: Push branch and create PR**

```bash
git push -u origin feat/multi-domain-stacking
gh pr create --title "feat(overlays): multi-domain stacking (v3.21.0)" --body "$(cat <<'EOF'
## Summary

- Widen `BackendConfigSchema.domain` and `ResearchConfigSchema.domain` to accept arrays for multi-domain stacking
- Fix latent append-without-dedup bug in sub-overlay knowledge merge path
- Service-mode multi-domain inherited automatically via `ServiceSchema` reuse
- Add packaging-integrity test to catch enum-vs-file drift at build time

Spec: `docs/superpowers/specs/2026-04-20-multi-domain-stacking-design.md` (4 rounds of Codex+Gemini spec MMR, PASS-READY by Gemini R4).

## Test plan

- [x] `npm test` passes (10+ new tests across schema, loader, resolver, service-mode e2e, packaging)
- [x] `npm run type-check` passes
- [x] `make check-all` passes
- [ ] 3-channel PR MMR (Codex + Gemini + Claude compensating)
- [ ] Verify existing single-string domain configs still parse and resolve identically

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR number; it's needed below.

- [ ] **Step 10.2: Wait for CI green**

```bash
gh pr checks --watch
```

Expected: `check` job passes.

- [ ] **Step 10.3: Dispatch 3-channel MMR**

Use `mmr review --pr <PR_NUMBER> --sync --format json` per `CLAUDE.md`. Review returns a JSON verdict and findings.

If `mmr` isn't available, fall back to manual dispatch (all foreground — never `run_in_background`, never `&`, never `nohup`):

```bash
PR_NUMBER=<the number from step 10.1>

# Capture PR diff for reviewers
gh pr diff "$PR_NUMBER" > /tmp/mdr-pr-diff.patch

# Codex
codex exec --skip-git-repo-check -s read-only --ephemeral "$(cat <<EOF
Review PR #$PR_NUMBER at feat/multi-domain-stacking for implementation correctness, security, and API contract issues. Read the spec at docs/superpowers/specs/2026-04-20-multi-domain-stacking-design.md for context. Return findings at P0-P3 severity with suggested fixes. Verdict: pass / degraded-pass / blocked / needs-user-decision.
EOF
)" 2>&1 | tail -300 > /tmp/mdr-codex.out

# Gemini
NO_BROWSER=true gemini -p "$(cat <<EOF
Review PR #$PR_NUMBER at feat/multi-domain-stacking for architectural patterns and broad-context reasoning. Read the spec at docs/superpowers/specs/2026-04-20-multi-domain-stacking-design.md for context. Return findings at P0-P3 severity with suggested fixes. Verdict: pass / degraded-pass / blocked / needs-user-decision.
EOF
)" --output-format json --approval-mode yolo 2>&1 > /tmp/mdr-gemini.out

# Claude compensating (adds plan-alignment, testing-gap review)
claude -p "$(cat <<EOF
Compensating channel review of PR #$PR_NUMBER. Focus on: plan alignment with docs/superpowers/specs/2026-04-20-multi-domain-stacking-design.md, code quality, and test-coverage gaps. Return findings at P0-P3 severity. Verdict: pass / degraded-pass / blocked / needs-user-decision.
EOF
)" --output-format json 2>&1 > /tmp/mdr-claude.out
```

- [ ] **Step 10.4: Fix all P0/P1/P2 findings**

Per CLAUDE.md §Mandatory 3-Channel PR Review: fix all P0, P1, and P2 findings. Do not defer P2s.

For each finding:
- Root-cause the issue, write a failing test, apply the fix, re-run the test, commit with message pattern `fix(...): <desc> (Codex/Gemini/Claude MMR P<N>)`.
- Re-push.
- Wait for CI.
- Re-run MMR (round 2 / round 3).

3-round limit. If findings remain unresolved after 3 rounds, stop and surface to the user.

- [ ] **Step 10.5: Merge on pass or degraded-pass**

```bash
# Verify verdict before merging — blocked / needs-user-decision must stop
gh pr merge "$PR_NUMBER" --squash --delete-branch
```

Expected: PR squashed to main with a clean commit message.

---

## Task 11: Release v3.21.0

**Workflow:** Per `docs/architecture/operations-runbook.md` §4.

- [ ] **Step 11.1: Check out main and create release branch**

```bash
git checkout main
git pull origin main
git checkout -b release/v3.21.0
```

- [ ] **Step 11.2: Bump package version**

Edit `package.json` and change `"version": "3.20.0"` to `"version": "3.21.0"`.

Then:

```bash
npm install  # Updates package-lock.json to reflect the new version
```

Verify `package-lock.json` also updated to 3.21.0 (check top-level `"version"` field).

- [ ] **Step 11.3: Update CHANGELOG PR number reference in roadmap (if #TBD still present)**

Verify `docs/roadmap.md` doesn't still say `#TBD` — replace with the real merged PR number from Task 10. If it was updated in a release prep step, skip.

- [ ] **Step 11.4: Commit release prep**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(release): v3.21.0 — multi-domain stacking

Bumps package version 3.20.0 -> 3.21.0.

See CHANGELOG.md for feature details and docs/roadmap.md for the
Completed Releases entry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11.5: Push + create release-prep PR**

```bash
git push -u origin release/v3.21.0
gh pr create --title "chore(release): v3.21.0 — multi-domain stacking" --body "Bumps to 3.21.0. Feature PR: #<PR from Task 10>"
gh pr checks --watch
```

Expected: CI green.

- [ ] **Step 11.6: Squash-merge release-prep PR**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 11.7: Tag and push**

```bash
git checkout main
git pull origin main
git tag v3.21.0
git push origin v3.21.0
```

- [ ] **Step 11.8: Create GitHub release**

```bash
gh release create v3.21.0 --title "v3.21.0 — Multi-Domain Stacking" --notes "$(cat <<'EOF'
## What's new

- Multi-domain stacking: `backendConfig.domain` and `researchConfig.domain` now accept arrays, stacking multiple sub-overlays in declaration order.
- Service-mode support inherited automatically via `ServiceSchema` reuse.
- Latent sub-overlay knowledge dedup bug fixed.
- Packaging-integrity test added.

See [CHANGELOG.md](https://github.com/zigrivers/scaffold/blob/main/CHANGELOG.md) for details.

## Upgrade

- `npm update -g @zigrivers/scaffold`
- `brew upgrade scaffold`
EOF
)"
```

- [ ] **Step 11.9: Verify npm + Homebrew publish**

Monitor GitHub Actions:

```bash
gh run list --limit 5
```

Expected:
- `publish.yml` workflow succeeds (npm trusted publishing via OIDC)
- `update-homebrew.yml` workflow succeeds

Then verify externally:

```bash
npm view @zigrivers/scaffold version
# Expected: 3.21.0

brew info scaffold | head -5
# Expected: scaffold: stable 3.21.0
```

If either command returns an older version, wait a few minutes for mirror propagation, then re-check. If still wrong after 10 minutes, diagnose the failing workflow.

---

## Self-Review Checklist

**Spec coverage (§-by-§):**
- §1 Schema changes → Task 1 ✓
- §2 Resolver changes → Task 3 ✓
- §3 Type impact + service-mode → covered via Task 1 (schema reuse) + Task 6 (service-mode test) ✓
- §4 Error handling → Task 2 (loader tests verify error paths) ✓
- §5.1 Unit schema → Task 1 ✓
- §5.2 Loader-level → Task 2 ✓
- §5.3 Real-overlay integration → Task 4 ✓
- §5.3.1 Service-mode integration → Task 6 ✓
- §5.4 Contrived collision → Task 5 ✓
- §5.5 Packaging-integrity → Task 7 ✓
- §5.6 E2E → no-op by design (no new E2E) ✓
- §5.7 Exact-array assertion style → applied throughout Tasks 3-5 ✓
- §6 Out of scope → not implemented (correct) ✓
- §7 Migration + backcompat → verified in Task 1 (existing tests still pass) + Task 8 (full suite) ✓
- §8 Size estimate → matches Tasks 1-7 LOC budget ✓

**Placeholder scan:** none detected. Every step has concrete file paths, exact code, and concrete commands.

**Type consistency:**
- `backendRealDomains` / `researchRealDomains` — exported from Task 1, imported in Tasks 5+7.
- `normalizeDomains(raw, output, configKeyForMessages)` — signature matches between Task 3 implementation and Task 5 usage.
- `resolvePipeline(context, { serviceId })` — signature in Task 6 matches resolver.ts:18-21.
