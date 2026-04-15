# Multi-Service Evolution — Wave 1 (Fintech Domain) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fintech domain expertise to Scaffold as a sub-overlay on the `backend` project type, following the established `research-quant-finance` pattern.

**Architecture:** Add a `domain` field to `BackendConfigSchema`, register `backend` in `TYPE_DOMAIN_CONFIG` so the existing sub-overlay loader picks up `content/methodology/backend-fintech.yml` automatically, wire a new wizard question + `--backend-domain` CLI flag, and ship 8 knowledge documents plus the overlay YAML that references them. All changes land in one atomic PR — partial delivery leaves opt-in users with `FRONTMATTER_KB_ENTRY_MISSING` warnings because the sub-overlay references undelivered knowledge docs.

**Tech Stack:** TypeScript, Zod schemas, vitest, bats-core (for knowledge-quality evals). No new runtime dependencies.

**Source spec:** `docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md` — Wave 1 section (lines 99–211).

**Atomicity:** The full PR must include schema field, TYPE_DOMAIN_CONFIG entry, wizard question, CLI flag, overlay YAML, and all 8 knowledge docs. Within the PR, commits are sequenced so each task-bounded commit leaves `make check-all` green.

---

## File Structure

### Created

- `content/methodology/backend-fintech.yml` — Sub-overlay declaring which pipeline steps receive which fintech knowledge docs.
- `content/knowledge/backend/backend-fintech-compliance.md` — PCI-DSS, SOC 2, SEC regulations, audit trail immutability.
- `content/knowledge/backend/backend-fintech-ledger.md` — Double-entry accounting, ledger design, reconciliation.
- `content/knowledge/backend/backend-fintech-broker-integration.md` — Multi-broker adapter, credential rotation, error harmonization.
- `content/knowledge/backend/backend-fintech-order-lifecycle.md` — Order events, fill handling, partial fills, cancellation.
- `content/knowledge/backend/backend-fintech-risk-management.md` — Position limits, drawdown caps, circuit breakers, kill switches.
- `content/knowledge/backend/backend-fintech-testing.md` — Backtest determinism, financial accuracy, broker sandbox testing.
- `content/knowledge/backend/backend-fintech-data-modeling.md` — Financial data models, currency handling, precision decimals.
- `content/knowledge/backend/backend-fintech-observability.md` — Trade event correlation, market-hours scheduling, SLOs.

### Modified

- `src/config/schema.ts` — Add `domain` field to `BackendConfigSchema`.
- `src/config/schema.test.ts` — Validate the new field; update any existing exact-equality expectations that now must include the defaulted `domain: 'none'`.
- `src/core/assembly/overlay-state-resolver.ts` — Add `'backend': 'backendConfig'` to `TYPE_DOMAIN_CONFIG`.
- `src/core/assembly/overlay-state-resolver.test.ts` — Add a sub-overlay test mirroring the existing research-quant case.
- `src/wizard/copy/backend.ts` — Add `domain` section to `backendCopy`. (No change needed to `src/wizard/copy/types.ts`: `BackendCopy` is a mapped type over `keyof BackendConfig` and picks up `domain` automatically once the schema adds it.)
- `src/wizard/flags.ts` — Add `backendDomain?` to `BackendFlags`.
- `src/wizard/questions.ts` — Add backend domain question after the `deployTarget` block; extend the `backendConfig = { … }` literal to include `domain`.
- `src/wizard/questions.test.ts` — Add tests for auto/flag/interactive modes; update any existing exact-equality expectations that now need `domain`.
- `src/cli/init-flag-families.ts` — Add `'backend-domain'` to `BACKEND_FLAGS`; extend the `case 'backend'` block in `buildFlagOverrides`.
- `src/cli/init-flag-families.test.ts` — Add `backend-domain` to the union/type preservation test and to flag-override coverage.
- `src/cli/commands/init.ts` — Add `'backend-domain'` to `InitArgs`, add the `.option('backend-domain', …)` declaration with `choices: ['none', 'fintech']`, and extend the inline `backendFlags: hasBackendFlag ? { … }` payload to include `backendDomain`. (`hasBackendFlag` auto-derives from `BACKEND_FLAGS.some(…)` — do not hand-edit.)
- `src/cli/commands/init.test.ts` — Add integration tests proving both the yargs `.option()` declaration (via a `choices`-rejected invalid value) AND the payload-forwarding edit both land.
- `src/e2e/project-type-overlays.test.ts` — Add an end-to-end sub-overlay test for `backend` + `fintech` that uses the real `content/methodology/` and `content/knowledge/` dirs (mirror the existing research-quant e2e test).
- `docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md` — Append Wave 1 to Review History.

### Commit ordering (keeps `make check-all` green at every step)

1. **Task 1** bundles the schema change with the minimum companion edits needed to keep TypeScript green: `backendCopy` object + `BackendFlags.backendDomain` + wizard question + `backendConfig` literal + test updates. These are all type-check interdependent; splitting them across commits leaves the tree in a broken state. (`BackendCopy` auto-derives from `BackendConfig` via a mapped type, so it needs no edit.)
2. **Task 2** (TYPE_DOMAIN_CONFIG) is independent — adding a map entry has no type-check impact and is inert until the overlay YAML exists.
3. **Task 3** (CLI flag) depends on Task 1's `BackendFlags.backendDomain` field.
4. **Task 4** (sub-overlay YAML) references 8 not-yet-existing docs. Safe: the knowledge-quality orphan check inspects only existing files, and no eval validates that overlay knowledge-overrides resolve to existing docs (only pipeline frontmatter is checked that way).
5. **Tasks 5–12** (one knowledge doc per task) — each new doc is immediately referenced by the overlay YAML, so no orphan state appears.
6. **Task 13** (integration test + spec review-history).

---

## Task 1: Schema + wizard + copy (atomic)

**Files:**
- Modify: `src/config/schema.ts` (`BackendConfigSchema`)
- Modify: `src/config/schema.test.ts` (new tests + fix existing exact-equality expectations)
- Modify: `src/wizard/copy/backend.ts` (`backendCopy` constant)
- Modify: `src/wizard/flags.ts` (`BackendFlags` interface)
- Modify: `src/wizard/questions.ts` (backend question block)
- Modify: `src/wizard/questions.test.ts` (new tests + fix existing expectations, including the prompt-count assertion)

This is a single atomic commit because TypeScript will not compile if only the schema changes — the `backendCopy` object AND the `backendConfig` object literal in `questions.ts` must provide the new field at the same time. (`BackendCopy` auto-derives from `BackendConfig` so it needs no manual edit.)

- [ ] **Step 1: Write the failing tests**

### 1a. Add schema tests

In `src/config/schema.test.ts`, locate the backend-schema describe block (or create one) and add:

```typescript
describe('BackendConfigSchema — domain field', () => {
  it("defaults `domain` to 'none' when omitted", () => {
    const result = BackendConfigSchema.parse({
      apiStyle: 'rest',
    })
    expect(result.domain).toBe('none')
  })

  it("accepts `domain: 'fintech'`", () => {
    const result = BackendConfigSchema.parse({
      apiStyle: 'rest',
      domain: 'fintech',
    })
    expect(result.domain).toBe('fintech')
  })

  it("rejects invalid `domain` values", () => {
    expect(() => BackendConfigSchema.parse({
      apiStyle: 'rest',
      domain: 'healthcare',
    })).toThrow()
  })
})
```

### 1b. Update existing exact-equality expectations

Search `src/config/schema.test.ts` for any assertion that expects a fully-defaulted `BackendConfig` object literal (likely uses `toEqual({...})` with all fields enumerated). Add `domain: 'none'` to each such expected object. Run `grep -n "apiStyle: 'rest'\|apiStyle: 'graphql'" src/config/schema.test.ts` to locate candidates.

Search `src/wizard/questions.test.ts` for any assertion that compares against a full `backendConfig` object. Add `domain: 'none'` (or the specific value the test sets up) to each.

**Prompt-count assertion:** There is also a test that asserts the number of `output.select` calls for a backend wizard run. Adding the new `Backend domain?` prompt increases the count by one. Run:

```bash
grep -n "select.*toHaveBeenCalledTimes" src/wizard/questions.test.ts
```

Locate any backend-project case that counts prompts (typical shape: `expect(output.select).toHaveBeenCalledTimes(5)`). Bump it to the new count (one more than before for the backend cases only), and update the accompanying comment to mention the `domain` prompt.

### 1c. Add wizard-level tests

In `src/wizard/questions.test.ts`, find the backend describe block (around line 561) and mirror the existing tests' shape. The real entry point is `askWizardQuestions(...)` (not the speculative `runBackendWizard` / `runBackendWizardInteractive` names — those don't exist). Read 3–4 neighboring tests to learn:

- The output-context mock factory used to assert selections and verify call counts.
- The `askWizardQuestions` option shape (it takes `options` including `projectType`, `auto`, `backendFlags`, etc., and an injected `output` context).
- How interactive mode mocks `output.select` responses.

Then add three cases covering:

1. Auto mode without `--backend-domain`: result has `backendConfig.domain === 'none'`.
2. Auto mode with `backendFlags.backendDomain = 'fintech'`: result has `backendConfig.domain === 'fintech'`.
3. Interactive mode where the mocked `output.select` answers `'fintech'` to the `'Backend domain?'` question: result has `backendConfig.domain === 'fintech'`.

Do not invent new helper functions. Call `askWizardQuestions` directly, passing the same option shape the neighboring tests use.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/config/schema.test.ts src/wizard/questions.test.ts`
Expected: FAIL on schema tests (schema doesn't accept `domain` yet) and wizard tests (`backendDomain` flag not on interface; `backendConfig` doesn't have `domain`).

If the existing exact-equality tests you updated in Step 1b are still failing at this point, that is expected — they will go green after Step 3 lands the `domain` field in the schema + wizard.

- [ ] **Step 3: Add `domain` to `BackendConfigSchema`**

In `src/config/schema.ts`, modify `BackendConfigSchema`:

```typescript
export const BackendConfigSchema = z.object({
  apiStyle: z.enum(['rest', 'graphql', 'grpc', 'trpc', 'none']),
  dataStore: z.array(z.enum(['relational', 'document', 'key-value'])).min(1).default(['relational']),
  authMechanism: z.enum(['none', 'jwt', 'session', 'oauth', 'apikey']).default('none'),
  asyncMessaging: z.enum(['none', 'queue', 'event-driven']).default('none'),
  deployTarget: z.enum(['serverless', 'container', 'long-running']).default('container'),
  domain: z.enum(['none', 'fintech']).default('none'),
}).strict()
```

- [ ] **Step 4: Add copy for `domain` in `backendCopy`**

(Note: `BackendCopy` at `src/wizard/copy/types.ts:26` is defined as `{ [K in keyof BackendConfig]: QuestionCopy<BackendConfig[K]> }` — a mapped type over `keyof BackendConfig`. Once Step 3 lands the `domain` field in `BackendConfigSchema`, `BackendCopy` auto-acquires `domain: QuestionCopy<'none' | 'fintech'>`. No edit to `types.ts` is needed — but `backendCopy` in `backend.ts` MUST provide the new key or TypeScript will fail.)

In `src/wizard/copy/backend.ts`, add a `domain` section to the `backendCopy` object (place it after `deployTarget`):

```typescript
  domain: {
    short: 'Optional domain-specific knowledge to include.',
    long: 'Adds a curated set of knowledge documents and prompt guidance tailored to a specific industry or problem space.',
    options: {
      none:    { label: 'None',    short: 'No domain-specific knowledge.' },
      fintech: { label: 'Fintech', short: 'Compliance, ledger design, broker integration, order lifecycle, risk management.' },
    },
  },
```

- [ ] **Step 5: Add `backendDomain` to `BackendFlags`**

In `src/wizard/flags.ts`, modify the `BackendFlags` interface:

```typescript
export interface BackendFlags {
  backendApiStyle?: BackendConfig['apiStyle']
  backendDataStore?: BackendConfig['dataStore']
  backendAuth?: BackendConfig['authMechanism']
  backendMessaging?: BackendConfig['asyncMessaging']
  backendDeployTarget?: BackendConfig['deployTarget']
  backendDomain?: BackendConfig['domain']
}
```

- [ ] **Step 6: Add the wizard question and extend the `backendConfig` literal**

In `src/wizard/questions.ts`, find the backend-branch block (starts with `if (projectType === 'backend') { ... }`). After the `deployTarget` assignment and before the `backendConfig = { … }` literal, insert:

```typescript
    const domain: BackendConfig['domain'] = options.backendFlags?.backendDomain
      ?? (!auto
        ? await output.select('Backend domain?',
          optionsFromCopy(copy.domain.options, ['none', 'fintech']),
          'none',
          copy.domain,
        ) as BackendConfig['domain']
        : 'none')
```

Then update the `backendConfig` assignment to include the new field:

```typescript
    backendConfig = { apiStyle, dataStore, authMechanism, asyncMessaging, deployTarget, domain }
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: all tests pass — the three new schema tests, the three new wizard tests, and any existing exact-equality tests you updated in Step 1b.

If any existing test still fails with "expected `domain: …` but got nothing" or similar, there is an exact-equality assertion your Step 1b scan missed. Add `domain: 'none'` to it.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/config/schema.ts src/config/schema.test.ts \
        src/wizard/copy/backend.ts \
        src/wizard/flags.ts src/wizard/questions.ts src/wizard/questions.test.ts
git commit -m "feat(backend): add fintech-capable domain field

Adds 'none' | 'fintech' to BackendConfigSchema with a default of
'none'. Extends backendCopy, BackendFlags, and the wizard question
chain so the new field is type-complete and interactively prompted.
Non-breaking for existing configs."
```

---

## Task 2: Register `backend` in `TYPE_DOMAIN_CONFIG`

**Files:**
- Modify: `src/core/assembly/overlay-state-resolver.ts` (`TYPE_DOMAIN_CONFIG` constant)
- Modify: `src/core/assembly/overlay-state-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Open `src/core/assembly/overlay-state-resolver.test.ts`. Locate the existing tests for `research` sub-overlay loading (grep for `research-quant` or `quant-finance`). Mirror that pattern for backend + fintech. The real helpers and factories in this test file are the source of truth for how tests are shaped — adapt to them. The signature to call is:

```typescript
const result = resolveOverlayState({
  config,
  methodologyDir,
  metaPrompts,
  presetSteps,
  output,
})
// result is { steps, knowledge, reads, dependencies }
```

Return shape is `{ steps, knowledge, reads, dependencies }` — NOT `overlayKnowledge`. Use `result.knowledge['create-prd']` etc.

Add two tests (adapt to the existing test file's conventions):

```typescript
describe('resolveOverlayState — backend fintech sub-overlay', () => {
  it('loads backend-fintech.yml when BackendConfig.domain is fintech', () => {
    // Create a tmpdir with methodology/backend-fintech.yml containing a
    // knowledge-overrides block appending one entry to one step.
    // Build a config with project.backendConfig.domain = 'fintech'.
    // Call resolveOverlayState with a single step in presetSteps and
    // metaPrompts that includes that step.
    // Assert result.knowledge[step] contains the appended entry.
  })

  it("does NOT load backend-fintech.yml when BackendConfig.domain is 'none'", () => {
    // Same setup; config with domain='none'.
    // Assert the appended entry is NOT in result.knowledge[step].
  })
})
```

- [ ] **Step 2: Run to verify the test fails**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts`
Expected: the fintech test FAILS — `TYPE_DOMAIN_CONFIG` does not yet include `backend`, so the loader never consults the sub-overlay and the append does not happen.

- [ ] **Step 3: Add `backend` to `TYPE_DOMAIN_CONFIG`**

In `src/core/assembly/overlay-state-resolver.ts`, modify the constant (it currently contains `'research': 'researchConfig'`):

```typescript
const TYPE_DOMAIN_CONFIG: Partial<Record<string, string>> = {
  'research': 'researchConfig',
  'backend': 'backendConfig',
}
```

No other changes to this file — the existing lookup code already uses `config.project?.[configKey]?.domain` which works for backend (`ProjectConfig` has `[key: string]: unknown`).

- [ ] **Step 4: Run to verify tests pass**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/assembly/overlay-state-resolver.ts src/core/assembly/overlay-state-resolver.test.ts
git commit -m "feat(overlay): register backend in TYPE_DOMAIN_CONFIG

Enables the existing sub-overlay loader to pick up
content/methodology/backend-fintech.yml when BackendConfig.domain
is set. Inert until the overlay YAML exists (loader silently skips
missing files)."
```

---

## Task 3: CLI `--backend-domain` flag

**Files:**
- Modify: `src/cli/init-flag-families.ts` (BACKEND_FLAGS + `case 'backend'` in `buildFlagOverrides`)
- Modify: `src/cli/init-flag-families.test.ts` (union/type test + override case)
- Modify: `src/cli/commands/init.ts` (InitArgs entry, `.option('backend-domain', …)`, inline `backendFlags` payload inside `runWizard({…})`)
- Modify: `src/cli/commands/init.test.ts` (integration test proving the yargs option AND the wizard-forwarding both land)

Note: `hasBackendFlag` is computed from `BACKEND_FLAGS.some(…)`, so detection updates automatically once `'backend-domain'` is added to the constant. Do NOT hand-edit the `hasBackendFlag` line.

- [ ] **Step 1: Write the failing tests**

### 1a. Flag-parser tests (in `init-flag-families.test.ts`)

Open `src/cli/init-flag-families.test.ts`. Find where existing `backend-*` flags are exercised (grep for `'backend-api-style'`). Add:

- To the `BACKEND_FLAGS` union/type-preservation test — add `'backend-domain'` to the expected array.
- A new `buildFlagOverrides` case:

```typescript
it('maps --backend-domain=fintech to BackendConfig.domain via buildFlagOverrides', () => {
  const result = buildFlagOverrides({
    'backend-api-style': 'rest',
    'backend-domain': 'fintech',
  })
  expect(result).toEqual({
    type: 'backend',
    partial: { apiStyle: 'rest', domain: 'fintech' },
  })
})
```

Note the signature: `buildFlagOverrides(argv)` takes a single `argv` record and returns `{ type, partial }`.

### 1b. Integration tests (in `init.test.ts`)

Open `src/cli/commands/init.test.ts`. Find existing tests that exercise the yargs parser and the `runWizard` call-site (grep for `runWizard` or `'backend-api-style'`). Mirror the shape for `backend-domain`. Two cases are needed — together they close the gap where a subagent might add the flag to `BACKEND_FLAGS` but forget the `.option()` declaration or the payload forwarding:

The real entry points in this file are `parseInitArgs(argv)` and `initCommand.handler(argv)` (the yargs command handler). There is no `runInit(...)` helper — mirror whichever pattern the neighboring `backend-api-style` tests use around line 307 and 349.

- **Parser test — `choices`-rejection.** `parseInitArgs()` uses non-strict yargs (`.exitProcess(false).fail(false)`), so an UNDECLARED flag like `--backend-domain=anything` silently passes through with no validation. To prove the `.option('backend-domain', { choices: [...] })` declaration exists, pass an INVALID value and assert yargs rejects it:

  ```typescript
  it("rejects --backend-domain with a value outside declared choices", async () => {
    await expect(parseInitArgs([
      '--project-type', 'backend',
      '--backend-api-style', 'rest',
      '--backend-domain', 'bogus',
    ])).rejects.toThrow(/Invalid values|Choices/)
  })
  ```

  yargs with `choices` validation rejects via a message that contains `Invalid values:` and lists `Choices:`. This test fails until Step 5 adds the `.option('backend-domain', { choices: ['none', 'fintech'] })` declaration.

- **Wizard-forward test.** Mock `runWizard` (via `vi.mock` at the top of the file — mirror the existing wizard-forward tests in this file for the exact mock setup). Invoke the init command handler with `--backend-domain fintech`, then assert the mock was called with a payload whose `backendFlags.backendDomain === 'fintech'`:

  ```typescript
  it("forwards --backend-domain=fintech into the wizard's backendFlags", async () => {
    await initCommand.handler(await parseInitArgs([
      '--project-type', 'backend',
      '--backend-api-style', 'rest',
      '--backend-domain', 'fintech',
    ]))
    expect(vi.mocked(runWizard)).toHaveBeenCalledWith(
      expect.objectContaining({
        backendFlags: expect.objectContaining({ backendDomain: 'fintech' }),
      }),
    )
  })
  ```

  This test fails until Step 5 adds `backendDomain: argv['backend-domain'] …` to the inline `backendFlags` payload. Adapt the `initCommand.handler(await parseInitArgs(…))` shape to whatever the neighboring `backend-api-style` wizard-forward tests use — they are the closest analog.

- [ ] **Step 2: Run to verify tests fail**

Run: `npx vitest run src/cli/init-flag-families.test.ts src/cli/commands/init.test.ts`
Expected: FAIL across both files —
- `init-flag-families.test.ts`: `backend-domain` is not in `BACKEND_FLAGS`; `buildFlagOverrides` doesn't populate `partial.domain`.
- `init.test.ts`: the choices-rejection parser test passes without rejecting (no `.option()` declaration yet); the wizard-forward test shows `backendDomain: undefined`.

- [ ] **Step 3: Add `backend-domain` to `BACKEND_FLAGS`**

In `src/cli/init-flag-families.ts`, modify `BACKEND_FLAGS`:

```typescript
export const BACKEND_FLAGS = [
  'backend-api-style', 'backend-data-store', 'backend-auth',
  'backend-messaging', 'backend-deploy-target', 'backend-domain',
] as const
```

- [ ] **Step 4: Extend the `case 'backend'` block in `buildFlagOverrides`**

In the same file, find `case 'backend': {` inside `buildFlagOverrides(argv)`. After the existing `deployTarget` branch and before `return { type: 'backend', partial }`, add:

```typescript
    if (argv['backend-domain'] !== undefined) {
      partial.domain = argv['backend-domain'] as BackendConfig['domain']
    }
```

- [ ] **Step 5: Add the CLI option declaration and InitArgs entry in `init.ts`**

In `src/cli/commands/init.ts`:

1. Add to `InitArgs` (find the section that declares `'backend-api-style'?: string` and neighbors):
   ```typescript
     'backend-domain'?: string
   ```

2. Add the yargs option declaration near the other backend options (`.option('backend-deploy-target', …)` is a good anchor):
   ```typescript
   .option('backend-domain', {
     type: 'string',
     describe: 'Backend domain (none | fintech)',
     choices: ['none', 'fintech'] as const,
   })
   ```

3. Find the inline `backendFlags: hasBackendFlag ? { … } : undefined` block inside the `runWizard({ … })` invocation (it currently lists `backendApiStyle`, `backendDataStore`, `backendAuth`, `backendMessaging`, `backendDeployTarget`). Append:
   ```typescript
     backendDomain: argv['backend-domain'] as BackendFlags['backendDomain'],
   ```

**Do NOT** hand-edit the `hasBackendFlag` detector — it's derived from `BACKEND_FLAGS.some(…)` and updates automatically once Step 3 adds `'backend-domain'` to `BACKEND_FLAGS`.

**Do NOT** create a `buildWizardOptions` helper — no such helper exists. The payload is constructed inline in the `runWizard({ … })` call.

- [ ] **Step 6: Run tests**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/cli/init-flag-families.ts src/cli/init-flag-families.test.ts \
        src/cli/commands/init.ts src/cli/commands/init.test.ts
git commit -m "feat(cli): add --backend-domain flag

Non-interactive override for backend domain selection. Wires into
BackendFlags → BackendConfig.domain. Choices: none, fintech."
```

---

## Task 4: Sub-overlay YAML (`backend-fintech.yml`)

**Files:**
- Create: `content/methodology/backend-fintech.yml`

**Why this task precedes the knowledge docs:** The orphan eval ("all knowledge entries are referenced by at least one pipeline step or tool") fails only on existing-but-unreferenced files. The 8 docs don't exist yet, so no orphan check fires. No eval validates that overlay knowledge-overrides reference existing files (only pipeline-step knowledge-base fields are checked that way). Landing the YAML first means each subsequent doc commit is immediately referenced.

Caveat: once this YAML is committed, any user who has opted into `BackendConfig.domain: fintech` and runs the pipeline will see `FRONTMATTER_KB_ENTRY_MISSING` warnings until all 8 docs land. This is acceptable because `domain: 'none'` is the default — users have to explicitly opt in to see warnings, and the PR lands atomically.

- [ ] **Step 1: Write the YAML**

Create `content/methodology/backend-fintech.yml` with exactly this content:

```yaml
# methodology/backend-fintech.yml
name: backend-fintech
description: >
  Fintech domain sub-overlay — adds compliance, ledger design,
  broker integration, order lifecycle, risk management, and
  observability knowledge to backend projects.
project-type: backend
domain: fintech

knowledge-overrides:
  create-prd:
    append: [backend-fintech-compliance, backend-fintech-broker-integration]
  user-stories:
    append: [backend-fintech-order-lifecycle, backend-fintech-risk-management]
  domain-modeling:
    append: [backend-fintech-ledger, backend-fintech-order-lifecycle, backend-fintech-data-modeling]
  system-architecture:
    append: [backend-fintech-broker-integration, backend-fintech-risk-management]
  database-schema:
    append: [backend-fintech-ledger, backend-fintech-data-modeling]
  api-contracts:
    append: [backend-fintech-order-lifecycle]
  security:
    append: [backend-fintech-compliance]
  operations:
    append: [backend-fintech-observability, backend-fintech-risk-management]
  tdd:
    append: [backend-fintech-testing]
  create-evals:
    append: [backend-fintech-testing, backend-fintech-compliance]
  story-tests:
    append: [backend-fintech-testing]
```

- [ ] **Step 2: Verify all gates still green**

Run: `make check`
Expected: all gates pass. The orphan check does not fire (docs don't exist), and the overlay YAML itself parses as valid YAML with a known sub-overlay shape.

If any eval fails at this step, STOP — the commit-ordering assumption is wrong for this repo state. Surface the failure.

- [ ] **Step 3: Commit**

```bash
git add content/methodology/backend-fintech.yml
git commit -m "feat(overlay): add backend-fintech sub-overlay manifest

References 8 not-yet-committed knowledge docs. Subsequent commits
add each doc; the sub-overlay loader already skips missing files
for runtime, and no eval validates overlay → doc reference
resolution (only pipeline frontmatter is checked that way)."
```

---

## Shared contract for knowledge-doc tasks (Tasks 5–12)

Every knowledge-doc task ends with the same verification + commit shape. Rather than repeat it per task, here is the shared contract — each task below references it.

**Path and filename:** `content/knowledge/backend/backend-fintech-<slug>.md`. The `name` field in frontmatter MUST match the filename stem.

**Frontmatter (exact shape):**

```yaml
---
name: backend-fintech-<slug>
description: <one-sentence summary, ~120–180 chars>
topics: [backend, fintech, <domain-specific topics>]
---
```

**Body structure:**

- 2–3 sentence opening paragraph framing the problem.
- `## Summary` — 40–60 lines of high-density summary. Readable standalone. Injected at shorter depths.
- `## Deep Guidance` — 100–150 lines with `###` sub-sections. Injected at `deep` methodology depth.

**Length:** ≥ 150 lines total (buffers above the 100-line domain-specific minimum in `tests/evals/knowledge-quality.bats`).

**Code blocks:** Required where relevant (schema DDL, pseudocode, example patterns). Use fenced markdown blocks.

**Style:** Factual and concrete. Named patterns, real regulatory citations, specific tool/library names where industry-standard. Avoid generic wisdom ("write good tests"); favor named approaches with pros/cons.

**Cross-references:** When referring to a sibling doc's topic, cite it by filename (e.g., "see also `backend-fintech-ledger.md`").

**Shared verification at end of each doc task:**

- [ ] Run: `wc -l content/knowledge/backend/backend-fintech-<slug>.md` — confirm ≥ 150.
- [ ] Run: `make check` — the full evaluator. Expect all bats tests green. If "all knowledge entries are referenced" fails, the overlay YAML is not referencing this doc's stem; if "minimum line count" fails, add content; if "required frontmatter fields" fails, check the `---` block.
- [ ] Commit with message: `docs(knowledge): add backend-fintech-<slug>`. Stage only that one file.

---

## Task 5: `backend-fintech-compliance.md`

**Slug:** `compliance`
**Description:** PCI-DSS, SOC 2, SEC/FINRA regulations for consumer/B2B fintech backends; audit trail immutability; data retention; segregation of duties.
**Topics frontmatter:** `[backend, fintech, compliance, pci-dss, soc2, sec, finra, audit-trail, gdpr]`

**Summary must cover (40–60 lines):**
- Which regulations apply based on what the service does: handling cards (PCI-DSS), storing PII / health data / financial records (SOC 2, GLBA), executing trades (SEC / FINRA), operating in EU (GDPR / MiCA), serving retail vs institutional.
- The cost boundary: most regs apply based on *scope* — keeping regulated data out of a service is cheaper than compliance for it. Practical scoping strategies.
- Audit trail requirements: what must be immutable, for how long, and the difference between append-only logs and tamper-evident logs (hash chains, Merkle trees).
- Segregation of duties / dual control: why one human should not be able to both initiate and approve a high-value action.

**Deep Guidance must cover (100+ lines, each a `###` subsection):**
- PCI-DSS scoping (card data environment, tokenization, scope-reduction patterns).
- SOC 2 Type I vs Type II, common trust criteria, which are engineering-touchable.
- SEC 17a-4 (broker-dealer record retention: WORM storage, 6-year retention, format requirements) and FINRA equivalents.
- Immutable audit log patterns: append-only DB tables with trigger-enforced immutability; external WORM stores (AWS QLDB, immutable S3 with Object Lock); hash-chaining for tamper evidence.
- Encryption-at-rest and in-transit expectations across these regimes.
- Data residency / data localization — how to design to support per-jurisdiction storage without re-architecting.
- Change-management/deployment evidence (SOC 2 CC8.1): what your CI/CD pipeline must emit to make auditors happy (artifact provenance, approval trails, rollback-ready deploys).
- Known pitfalls: secrets in logs; debug-mode leaks; PII in error reports; background workers bypassing request-context audit hooks.

**Code blocks (2–4):** Example immutable audit-log table (Postgres trigger-based); sample hash-chain computation; example scope-reduction (tokenization boundary with a pseudo-sequence diagram in code comments).

Write the file per the structure above, then run the shared verification (wc -l, `make check`) and commit.

---

## Task 6: `backend-fintech-ledger.md`

**Slug:** `ledger`
**Description:** Double-entry accounting for fintech ledgers; journal vs ledger tables; idempotent posting; reconciliation patterns; balance invariants.
**Topics frontmatter:** `[backend, fintech, ledger, double-entry, accounting, reconciliation, idempotency, invariants]`

**Summary must cover (40–60 lines):**
- The single most important fintech invariant: for every credit there is an equal-amount debit; total debits always equal total credits.
- Why you CANNOT derive balances from "current_balance" columns in application tables — you derive them from an immutable journal.
- The three-table pattern: journal (immutable events), ledger lines (double-entry rows per journal entry), account balances (materialized view or rolling aggregation).
- Idempotency: every journal insert MUST have an external idempotency key; retries are a fact of life and must not produce duplicate entries.
- Reconciliation: daily and per-broker/per-counterparty settlement reconciliation; what "breaks" and how to quarantine them.

**Deep Guidance must cover (100+ lines):**
- Chart of accounts design: asset/liability/equity/revenue/expense classes; how to pick account granularity for customer wallets vs operational accounts.
- Journal entry structure: timestamp, idempotency key, counterparty, memo, posting date vs transaction date.
- Double-entry invariants enforced in the database: CHECK constraints, triggers, or a reconcile-on-every-commit pattern.
- Multi-currency ledgers: foreign-currency revaluation, FX rate snapshots, precision handling (never use floating point — see `backend-fintech-data-modeling.md`).
- Reconciliation patterns: event sourcing from broker/bank feeds; "as-of" queries; unmatched-item queue with aging; auto-match vs manual review.
- Period-close: freezing historical data, opening balance sheet, handling late-arriving events.
- Performance: journal tables grow unboundedly — partitioning, archiving, hot/cold storage.
- Common pitfalls: negative balances silently accepted; FX rate drift between booking and settlement; double-posting from webhook retries; missing idempotency keys on manual admin corrections.

**Code blocks (3–5):** Journal + ledger-line schema (Postgres DDL); idempotent posting function signature; balance-query pseudocode; reconciliation query with LEFT JOIN for unmatched items.

Apply shared verification + commit.

---

## Task 7: `backend-fintech-broker-integration.md`

**Slug:** `broker-integration`
**Description:** Multi-broker adapter pattern; credential rotation; error harmonization; rate-limit management; broker-side quirks.
**Topics frontmatter:** `[backend, fintech, brokers, integration, adapter-pattern, rate-limits, credentials, retry]`

**Summary must cover (40–60 lines):**
- Why a broker-integration layer exists: brokers have incompatible APIs, auth schemes, error semantics, rate limits, and outage patterns. An adapter layer harmonizes them.
- The adapter contract: a normalized internal API (place order, cancel order, fetch fills, fetch positions, fetch balance) with broker-specific implementations behind it.
- Credentials: never hardcoded, never in env vars for prod, rotated regularly. Use a secrets manager with audit trails.
- Error harmonization: convert broker-specific error codes to internal retriable / non-retriable / fatal classifications before surfacing to business logic.
- Rate-limit strategy: client-side token bucket per broker; queue orders when approaching limit; back-pressure upstream.

**Deep Guidance must cover (100+ lines):**
- Typical broker APIs: REST+WebSocket (e.g., Alpaca, IBKR Client Portal), FIX protocol (institutional), vendor-specific binary protocols. Each has different latency, cost, and reliability profiles.
- Authentication patterns: OAuth with refresh, static API keys, HMAC request-signing, session tokens. Credential rotation mechanisms for each.
- Adapter interface design: language-agnostic, brokered through an internal IDL (protobuf / OpenAPI) so multiple services can consume uniformly.
- Error harmonization taxonomy: transient network (retry with backoff) / rate-limited (backoff + queue) / invalid order (non-retriable; surface to user) / broker outage (circuit break + alerting) / unknown state (escalate, do NOT retry blindly — see order-lifecycle reconciliation).
- Idempotency with brokers: client-order-id for dedup across retries; state reconciliation for "unknown if succeeded" cases.
- Broker-outage handling: circuit breakers; graceful degradation (disable new orders but allow cancellations); communication to users about what's available.
- Testing strategy: broker sandbox environments (not every broker has them — some require signed contracts); record/replay for unit tests; contract tests on schedule to catch breaking broker changes.
- Common pitfalls: retry storms amplifying broker rate-limit issues; stale auth tokens on long-running processes; time zone bugs around market hours; order-state drift when webhooks are missed.

**Code blocks (3–5):** Adapter interface (TypeScript); broker-specific error → internal classification mapping; token-bucket rate limiter pseudocode.

Apply shared verification + commit.

---

## Task 8: `backend-fintech-order-lifecycle.md`

**Slug:** `order-lifecycle`
**Description:** Order state machine; fills, partial fills, cancellation; event-driven order tracking; idempotency; handling "unknown" states.
**Topics frontmatter:** `[backend, fintech, orders, state-machine, fills, partial-fills, event-driven, webhooks]`

**Summary must cover (40–60 lines):**
- Orders are a state machine: `new → submitted → partially-filled → filled | cancelled | rejected | expired`. Plus terminal-branching: any state can transition to `error`.
- Fills arrive asynchronously via webhook or polling. Partial fills produce multiple fill events against one order.
- Idempotency is critical — a duplicate webhook must not create a duplicate fill.
- "Unknown" is a real state: network timeouts on order submission leave the broker state ambiguous. Never assume failure or success — query to reconcile.
- Every state transition produces a journal entry (see `backend-fintech-ledger.md`).

**Deep Guidance must cover (100+ lines):**
- Full state diagram with transition preconditions.
- Order types: market / limit / stop / stop-limit / trailing-stop / OCO / bracket. Each has different lifecycle branches.
- Partial-fill handling: internal aggregation vs broker-reported cumulative; avg fill price calculation (volume-weighted); when to mark an order "done" (partial-fill with TIF expiry vs fully-filled).
- Cancellation semantics: request-to-cancel vs confirmed cancellation; cancel-replace atomicity (brokers often don't guarantee it); race between cancel request and an incoming fill.
- Webhook delivery guarantees: most brokers guarantee at-least-once. Idempotency key on every fill event; deduplication table with sufficient retention.
- Reconciliation: on startup and on schedule, query broker for open orders and compare to internal state. Mismatch workflows: auto-reconcile vs manual review.
- Clock drift: broker timestamps vs your ingestion timestamps vs your storage timestamps — always store all three.
- Common pitfalls: losing fills when a webhook endpoint returns 5xx (broker stops retrying after N attempts — must reconcile manually); double-counting when switching between webhook and polling; state machine allows illegal transitions because the code uses strings not an enum.

**Code blocks (3–4):** Order state enum + transition matrix; dedupe-on-insert fill handler; reconciliation query.

Apply shared verification + commit.

---

## Task 9: `backend-fintech-risk-management.md`

**Slug:** `risk-management`
**Description:** Position limits, drawdown caps, circuit breakers, kill switches; pre-trade and post-trade risk checks; operational risk controls.
**Topics frontmatter:** `[backend, fintech, risk, position-limits, drawdown, circuit-breakers, kill-switch, pre-trade-checks]`

**Summary must cover (40–60 lines):**
- Two classes of risk controls: pre-trade (block before sending to broker) and post-trade (monitor, alert, throttle).
- Pre-trade checks: max order size, max position size per symbol / per account, max portfolio leverage, margin available, restricted-symbol list, fat-finger protection (price sanity vs market).
- Post-trade: realized/unrealized P&L, max drawdown, velocity of losses, position concentration.
- Kill switch: one-click + automatic trigger on threshold breach. Must halt all new orders and optionally flatten positions.
- Operational risk: canary accounts, staged rollouts, dry-run modes for strategy changes.

**Deep Guidance must cover (100+ lines):**
- Pre-trade check pipeline: ordered checks, fail-fast, explicit bypass logs for manual overrides.
- Per-symbol position limits vs per-account vs per-account-segment (retail vs institutional thresholds differ).
- Margin and buying-power math: Reg T (US) vs portfolio margin vs broker-set initial-margin requirements; real-time updating as positions change.
- Drawdown tracking: rolling peak-to-trough over time windows; intraday vs overnight thresholds.
- Circuit breakers: severity tiers (warning → throttle → halt → kill); what each tier does; how users are notified.
- Kill switch implementation: global flag checked at order-submission; atomic state store (Redis, feature flag service); audit log for activation.
- Human overrides: dual-control pattern — a kill switch activation requires two operators for deactivation.
- Testing risk controls: chaos tests (force a breach), shadow mode (all checks run but do not block), simulated bad fills.
- Common pitfalls: risk state lagging behind reality (eventual consistency on position store); skipping checks in "admin" paths; hardcoded limits instead of per-account; kill switch without a "safe state" definition (does it flatten? hold?).

**Code blocks (3–4):** Pre-trade check chain (pseudocode); kill-switch state machine; drawdown calculation over a time window.

Apply shared verification + commit.

---

## Task 10: `backend-fintech-testing.md`

**Slug:** `testing`
**Description:** Deterministic backtests; financial-accuracy tests; broker sandbox testing; regulatory edge-case coverage.
**Topics frontmatter:** `[backend, fintech, testing, determinism, backtesting, sandbox, accuracy, property-based]`

**Summary must cover (40–60 lines):**
- Fintech testing has unusual requirements: determinism across runs, byte-for-byte accuracy on numeric computations, regulatory edge-case coverage, and realistic multi-session flows.
- Determinism: any test involving time, random, or external clocks MUST inject those dependencies. Non-deterministic fintech tests are worse than no tests — they hide race conditions.
- Financial accuracy: test with exact decimal inputs; verify against hand-computed expected values; test rounding explicitly.
- Broker sandbox: use real broker sandbox accounts for integration tests where available; record/replay for CI.
- Regulatory edges: PDT rules, market-hours gates, corporate actions, halt/resume behavior — all easy to forget until production.

**Deep Guidance must cover (100+ lines):**
- Determinism patterns: clock injection (never `new Date()`), UUID injection, random seed control, sorting by a deterministic tie-breaker.
- Property-based testing for financial invariants: "sum of all debits equals sum of all credits across any window" is an ideal fast-check/hypothesis property.
- Numeric test patterns: assert exact decimal representation, not float-tolerant `closeTo`. Test ROUND_HALF_EVEN vs ROUND_HALF_UP explicitly.
- Test fixtures for regulatory scenarios: Pattern Day Trader rule threshold cases; T+2 settlement edge cases (trade on Friday, settle Tuesday); dividend/stock-split adjustment cases; halt → resume → opening-auction price.
- Broker sandbox testing: sandbox auth, rate limit of sandbox vs prod, fixtures-vs-sandbox trade-offs for CI speed.
- Record/replay: capture real broker responses against a sandbox, replay in CI. Need a rotation strategy so recordings don't go stale.
- Contract tests against broker APIs: schedule weekly/monthly; catch breaking-change notifications.
- Common pitfalls: tests that pass locally fail in CI due to timezone differences; flakey tests that rely on market-hours clock; sandbox behavior that differs from prod (e.g., instant fills that don't happen in real markets); fixtures that drift from real schemas over months.

**Code blocks (3–4):** Clock-injection wrapper; property-based invariant (e.g., Hypothesis/fast-check sketch); decimal-precision test with exact-match assertions.

Apply shared verification + commit.

---

## Task 11: `backend-fintech-data-modeling.md`

**Slug:** `data-modeling`
**Description:** Financial data models; currency handling; decimal precision; positions, trades, prices; time-series designs.
**Topics frontmatter:** `[backend, fintech, data-modeling, decimal, currency, time-series, positions, trades]`

**Summary must cover (40–60 lines):**
- Money is NEVER a float. Use arbitrary-precision decimals (Postgres NUMERIC, Python Decimal, Java BigDecimal, JS.js libraries, Rust rust_decimal).
- Currencies are not interchangeable. Every money field is a `(amount, currency)` tuple.
- Quantities have precision. Equity shares are integer; crypto is often 8–18 decimal places; FX pips are specific to pair.
- Prices change constantly. Time-series design requires careful thought about storage, retention, access patterns.
- Positions are a derived view, not a primary table — recomputable from the journal.

**Deep Guidance must cover (100+ lines):**
- Decimal types across stacks: Postgres NUMERIC(precision, scale); TypeScript `decimal.js` or `big.js`; Python `Decimal` with explicit context; Java `BigDecimal` with `setScale`; avoiding `double` at all costs.
- Currency representation: ISO 4217 codes (USD, EUR, JPY, BTC); smallest-denomination integer storage ("cents" / satoshis) with display conversion; why NOT to treat integer cents as the universal answer (crypto uses non-100 denominators).
- Rounding rules: banker's rounding for settlement; truncation for display; explicit rounding strategy per context.
- Multi-currency positions: base currency reporting vs native storage; intraday FX snapshots vs end-of-day revaluation.
- Time-series data: tick-level vs bar (1-minute, 1-hour, 1-day) storage; columnar stores (TimescaleDB, ClickHouse) vs OLTP; retention policies (raw ticks 30 days, minute bars 1 year, daily forever).
- Price adjustment for corporate actions (splits, dividends): adjusted-price column vs raw-price with adjustment factors; keep both.
- Position model: derived from fills via aggregation; materialized view with refresh strategy; versioned snapshots for point-in-time queries.
- Trade identifiers: internal trade-id, broker-side execution-id, client-order-id — store all three; use internal as primary key.
- Common pitfalls: "$1.005 + $1.005 = $2.01 or $2.00?" ambiguity; comparing floats with equality; mixing currencies in aggregations; time-series bloat from unbounded tick retention.

**Code blocks (3–4):** NUMERIC Postgres schema; cross-currency addition function with rejection on mismatch; time-series retention policy example.

Apply shared verification + commit.

---

## Task 12: `backend-fintech-observability.md`

**Slug:** `observability`
**Description:** Trade event correlation; market-hours aware scheduling; SLOs for fintech systems; compliance logging; alerting strategy.
**Topics frontmatter:** `[backend, fintech, observability, tracing, slos, alerting, correlation-id, market-hours]`

**Summary must cover (40–60 lines):**
- Every trade flow is distributed: wizard → order-management → risk → broker → fills → ledger → balance update. Correlation IDs across all hops are mandatory.
- SLOs are tighter than most systems: order-submission latency measured in hundreds of ms, fill-processing in seconds, ledger propagation in under a minute.
- Market-hours matter for alerting: silence after-hours for some alerts (stale-price) but escalate others (prolonged broker outage).
- Regulatory logging is additive to observability logging: audit trails (see compliance) are immutable and retained; op logs can rotate.
- Alert on anomalies, not just errors: sudden drop in fills, unusual P&L swing, risk check pass rate drop.

**Deep Guidance must cover (100+ lines):**
- Correlation IDs: client-order-id as the user-facing tracer; internal trace-id per flow; W3C Trace Context propagation in HTTP; MQ headers for async hops; log every hop.
- Structured logging schema for fintech: event_type, correlation_id, account_id, symbol, amount (with currency), timestamp (with timezone), broker_id.
- SLOs per flow: order-submission p99 target, fill-processing p99, ledger-propagation lag, balance-query p99. What the error budget is per month.
- Market-hours-aware alerting: trading calendar service (provides market-open/close per venue); alert routing rules ("during market hours, page immediately; off-hours, batch into morning report").
- Trade anomaly detection: fill-rate baseline + deviation threshold; P&L shock detector; risk check reject-rate monitoring.
- Multi-broker observability: per-broker latency, error rates, outage detection. Aggregate dashboards + per-broker drill-down.
- Distributed tracing: OpenTelemetry; per-span attributes for financial context; sampling strategies that keep error traces at 100% but throttle successes.
- Log retention separate from audit retention: ops logs rotate at 90 days; audit logs immutable for regulatory periods (often 7 years).
- Common pitfalls: correlation-ID dropping across queues; timezones not logged; alerts that fire during overnight maintenance windows; missing dashboards for the first-minute-of-market-open latency spike.

**Code blocks (3–4):** Structured log event (JSON schema sketch); correlation-id middleware (TypeScript); SLO definition (YAML).

Apply shared verification + commit.

---

## Task 13: Integration test + spec review-history

**Files:**
- Modify: `src/e2e/project-type-overlays.test.ts` (add backend-fintech e2e test mirroring the existing research-quant e2e test)
- Modify: `docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md` (append Wave 1 to Review History)

- [ ] **Step 1: Write the end-to-end integration test**

Open `src/e2e/project-type-overlays.test.ts`. Find the existing research-quant sub-overlay test (grep for `research-quant` or `quant-finance`). Mirror its structure for backend-fintech.

Key requirements:
- Use the real `content/methodology/` and `content/knowledge/backend/` directories (via `getPackageMethodologyDir()` from `src/utils/fs.ts` and `discoverRealMetaPrompts` — both are what the neighboring research-quant e2e helper uses; there is no `getPackageKnowledgeDir()` function, knowledge discovery runs implicitly through `resolveOverlayState`).
- Build a `ScaffoldConfig` with `project.projectType = 'backend'` and a full typed `BackendConfig` object under `project.backendConfig`. Because `BackendConfig` is inferred from `BackendConfigSchema`'s *output* shape, ALL fields must be present — you cannot write a partial literal:
  ```typescript
  project: {
    projectType: 'backend',
    backendConfig: {
      apiStyle: 'rest',
      dataStore: ['relational'],
      authMechanism: 'none',
      asyncMessaging: 'none',
      deployTarget: 'container',
      domain: 'fintech',
    },
  }
  ```
  Mirror the neighboring research-quant e2e helper's config-construction shape for other required `ScaffoldConfig` fields (methodology, depth, etc.) and for the `getPackageMethodologyDir` / `discoverRealMetaPrompts` helper calls it uses.
- Call `resolveOverlayState({ config, methodologyDir, metaPrompts, presetSteps, output })` with metaPrompts that includes at least one step the overlay appends to (e.g., `create-prd`).
- Assert `result.knowledge['create-prd']` contains `backend-fintech-compliance` and `backend-fintech-broker-integration`.
- Assert the same test with `domain: 'none'` does NOT contain those entries.

Exact shape of helpers and test factories: adapt to the neighboring research-quant test in this file.

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run src/e2e/project-type-overlays.test.ts`
Expected: new test passes, proving end-to-end wiring.

- [ ] **Step 3: Run all quality gates**

Run: `make check-all`
Expected: all gates pass — lint, validate, test (bats), eval (bats), and TypeScript (vitest) all green.

If anything fails, investigate:
- Per-doc line count (≥ 150).
- Per-doc frontmatter (`name` matches filename stem; `description` present; `topics` is an array).
- Every doc referenced by the overlay YAML.
- No unexpected files in `content/knowledge/backend/`.

- [ ] **Step 4: Update the spec review-history**

Modify `docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md`. Find the "Review History" section at the bottom. Append (replace `2026-MM-DD` with today's date):

```markdown
- **Implementation — Wave 1** (2026-MM-DD): Backend fintech sub-overlay implemented. Schema extended (`BackendConfigSchema.domain`), `TYPE_DOMAIN_CONFIG` now includes `backend`, wizard question + `--backend-domain` flag wired, `content/methodology/backend-fintech.yml` created, 8 knowledge docs added under `content/knowledge/backend/backend-fintech-*.md`. All tests green.
```

- [ ] **Step 5: Commit**

```bash
git add src/e2e/project-type-overlays.test.ts docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md
git commit -m "test(wave-1): add backend-fintech e2e overlay test + spec history

End-to-end test mirrors the existing research-quant case and
proves the full wiring: config → overlay resolution → knowledge
injection. Spec review-history records Wave 1 as implemented."
```

- [ ] **Step 6: Done**

Wave 1 is complete. Feature is inert for users who haven't opted in (`domain` defaults to `'none'`). Wave 3a (Service Manifest) depends on Wave 1 shipping — once this branch merges, Wave 3a's plan can be written.

---

## Out of Scope for This Plan

- **Multi-domain stacking** (e.g., `domain: ['fintech', 'healthcare']`) — requires Wave 2's overlay conflict-resolution machinery; deferred.
- **Additional domains beyond fintech** for backend (healthcare, gaming-economy, etc.) — each is a future plan; the infrastructure added here is extension-ready (add enum value + overlay YAML + docs; no core changes).
- **Domain support for other project types** (webapp, cli, etc.) — the `TYPE_DOMAIN_CONFIG` mechanism supports them; adding each requires a new config schema field + overlay and is out of scope for Wave 1.
- **Generic fintech tooling code** (e.g., ledger libraries, broker SDKs) — Wave 1 ships domain *knowledge*, not code. Generated projects that use these patterns choose their own libraries per the prompts.
- **Manual CLI smoke test instructions** — the `init` command's exact flag shape and `.scaffold/config.yml` layout drift over time; a hand-written smoke test rots quickly. The e2e test in Task 13 is the authoritative proof of correctness.
- **Wave 2 and later waves** — each gets its own plan.
