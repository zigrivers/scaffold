# Data Science Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `data-science` project-type overlay (target `v3.23.0`) following the design in `docs/superpowers/specs/2026-04-21-data-science-and-web3-overlays-design.md`. The overlay injects solo / small-team DS domain knowledge into existing universal pipeline steps, adds schema + detector + wizard wiring, and lands with 13 knowledge documents.

**Architecture:** Knowledge-injection-only project-type overlay following the `ml` / `data-pipeline` pattern. Forward-compatible `audience` discriminator defaults to `'solo'` so DS-2 (platform / larger-team) can ship additively later. Low-tier brownfield detector surfaces the type in `scaffold adopt` without over-firing on `ml` repos.

**Tech stack:** TypeScript (zod schema, vitest), bats-core (evals), YAML (overlay config + knowledge frontmatter), Markdown (knowledge docs).

**Before starting:**

1. Read the spec in full: `docs/superpowers/specs/2026-04-21-data-science-and-web3-overlays-design.md`
2. Branch from latest `main`: `git -C /Users/kenallred/dev-projects/scaffold checkout main && git pull && git checkout -b feat/data-science-overlay`
3. Confirm you are in a clean worktree: `git status` shows no uncommitted changes (besides spec/plan if you just authored them)

---

## Phase A — Foundation types and schema

Everything else depends on these. Keep commits small so downstream errors point at the right task.

### Task A1: Add `'data-science'` to ProjectTypeSchema + DataScienceConfigSchema

**Files:**
- Modify: `src/config/schema.ts`

- [ ] **Step 1: Add `'data-science'` to the enum**

Open `src/config/schema.ts` line 18-21. Current:

```typescript
export const ProjectTypeSchema = z.enum([
  'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
  'data-pipeline', 'ml', 'browser-extension', 'research',
])
```

Change to:

```typescript
export const ProjectTypeSchema = z.enum([
  'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
  'data-pipeline', 'ml', 'browser-extension', 'research',
  'data-science',
])
```

- [ ] **Step 2: Add DataScienceConfigSchema**

Insert immediately after `BrowserExtensionConfigSchema` (around line 117). The schema has a single `audience` field with `'solo'` as the only value — forward-compatible for DS-2:

```typescript
export const DataScienceConfigSchema = z.object({
  // 'solo' = current DS-1 scope (solo / small-team, local-first, prototyping).
  // DS-2 will add 'platform' for platform-engineered / larger-team DS.
  audience: z.enum(['solo']).default('solo'),
}).strict()
```

- [ ] **Step 3: Add `dataScienceConfig` field to `ServiceSchema`**

Open `src/config/schema.ts` line 148-163 (the `ServiceSchema` definition). Locate the config fields block (lines 154-163):

```typescript
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
```

Add one more line in the same block:

```typescript
  dataScienceConfig: DataScienceConfigSchema.optional(),
```

- [ ] **Step 4: Add `dataScienceConfig` field to `ProjectSchema`**

Open `src/config/schema.ts` line 184-198 (`ProjectSchema`). Same pattern — add after the existing config fields:

```typescript
  dataScienceConfig: DataScienceConfigSchema.optional(),
```

- [ ] **Step 5: Run typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run typecheck
```

Expected: compile errors in downstream files that switch on `ProjectType` — specifically `src/wizard/copy/index.ts`, `src/wizard/copy/core.ts`, `src/project/adopt.ts`. These are expected; we'll fix them in Phase D. Do NOT fix them yet.

- [ ] **Step 6: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/config/schema.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(schema): add data-science project type and DataScienceConfigSchema

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task A2: Add `DataScienceConfig` derived type and `ProjectConfig`/`ServiceConfig` interface fields

**Files:**
- Modify: `src/types/config.ts`

- [ ] **Step 1: Check current ProjectConfig/ServiceConfig/DetectedConfig shape**

```bash
sed -n '60,90p' /Users/kenallred/dev-projects/scaffold/src/types/config.ts
```

Note the current shapes. `DetectedConfig` is `{ type: ProjectType; config: ... }` — a simple tagged union (it is NOT `DetectionMatch`; see §6.2 of the spec).

- [ ] **Step 2: Export `DataScienceConfig` type and extend interfaces**

Add near the other derived config types:

```typescript
export type DataScienceConfig = z.infer<typeof DataScienceConfigSchema>
```

Then extend the `ProjectConfig` and `ServiceConfig` interfaces by adding:

```typescript
  dataScienceConfig?: DataScienceConfig
```

to each. Keep ordering consistent with the existing fields.

- [ ] **Step 3: Extend `DetectedConfig` discriminated union**

Add a new variant with `type: 'data-science'` and `config: Partial<DataScienceConfig>` matching the shape of existing variants. Inspect one existing variant (e.g. `ml`) and follow the same pattern.

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run typecheck
```

Expected: A2-related errors resolve. Other errors (copy, adopt, etc.) still present — expected.

- [ ] **Step 5: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/types/config.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(types): add DataScienceConfig type and extend ProjectConfig/ServiceConfig/DetectedConfig

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task A3: Add `DataScienceMatch` variant to `DetectionMatch`

**Files:**
- Modify: `src/project/detectors/types.ts`

- [ ] **Step 1: Inspect existing `MlMatch`**

```bash
grep -n "MlMatch\|DetectionMatch" /Users/kenallred/dev-projects/scaffold/src/project/detectors/types.ts
```

Note the existing shape (`projectType`, `confidence`, `partialConfig`, `evidence`).

- [ ] **Step 2: Add `DataScienceMatch` and extend `DetectionMatch` union**

Add a new `DataScienceMatch` interface mirroring `MlMatch`:

```typescript
export interface DataScienceMatch {
  projectType: 'data-science'
  confidence: 'low' | 'medium' | 'high'
  partialConfig: Partial<DataScienceConfig>
  evidence: readonly DetectionEvidence[]
}
```

Extend the `DetectionMatch` union to include `DataScienceMatch`.

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run typecheck
```

Expected: types compile cleanly for this file (downstream compiler errors still expected until Phase D).

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/project/detectors/types.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(detectors): add DataScienceMatch variant to DetectionMatch union

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B — Coupling validator

### Task B1: Create `dataScienceCouplingValidator` with tests

**Files:**
- Create: `src/config/validators/data-science.ts`
- Modify: `src/config/validators/validators.test.ts` (follows existing it.each pattern; auto-covers once registered)

- [ ] **Step 1: Write the validator file**

```typescript
// src/config/validators/data-science.ts
import type { CouplingValidator } from './types.js'
import type { DataScienceConfig } from '../../types/config.js'

export const dataScienceCouplingValidator: CouplingValidator<DataScienceConfig> = {
  configKey: 'dataScienceConfig',
  projectType: 'data-science',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'data-science') {
      ctx.addIssue({
        path: [...path, 'dataScienceConfig'],
        code: 'custom',
        message: 'dataScienceConfig requires projectType: data-science',
      })
    }
    // No cross-field invariants yet — `audience` has a single value 'solo'.
  },
}
```

- [ ] **Step 2: Verify `validators.test.ts` will auto-cover the new validator once registered**

Open `src/config/validators/validators.test.ts`. The tests iterate `ALL_COUPLING_VALIDATORS` with `it.each`, so once we register the new validator in Task B2 the existing parameterized tests cover it. No edit needed.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/config/validators/data-science.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(validators): add dataScienceCouplingValidator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B2: Register validator in `ALL_COUPLING_VALIDATORS`

**Files:**
- Modify: `src/config/validators/index.ts`

- [ ] **Step 1: Confirm `registry.test.ts` currently FAILS**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/config/validators/registry.test.ts 2>&1 | tail -40
```

Expected: failure on "registers exactly one validator per ProjectType" — `data-science` is in the schema enum but not in the registry. This is our failing test.

- [ ] **Step 2: Register the validator**

Open `src/config/validators/index.ts`. Add import after the `browserExtensionCouplingValidator` import:

```typescript
import { dataScienceCouplingValidator } from './data-science.js'
```

Add entry in `ALL_COUPLING_VALIDATORS` (after `browserExtensionCouplingValidator`):

```typescript
  dataScienceCouplingValidator as CouplingValidator<unknown>,
```

- [ ] **Step 3: Run registry + validators tests**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/config/validators/ 2>&1 | tail -30
```

Expected: all tests PASS. `registry.test.ts` now confirms DS is registered; `validators.test.ts` it.each cases auto-include DS.

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/config/validators/index.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(validators): register dataScienceCouplingValidator in ALL_COUPLING_VALIDATORS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase C — Detector

### Task C1: Write `detectDataScience` against TDD fixtures

**Files:**
- Create: `src/project/detectors/data-science.ts`
- Create: `src/project/detectors/data-science.test.ts`
- Create: `tests/fixtures/adopt/detectors/data-science/marimo-only/` (fixture dir)
- Create: `tests/fixtures/adopt/detectors/data-science/dvc-managed/` (fixture dir)
- Create: `tests/fixtures/adopt/detectors/data-science/no-match/` (fixture dir)

- [ ] **Step 1: Create fixtures**

```bash
cd /Users/kenallred/dev-projects/scaffold
mkdir -p tests/fixtures/adopt/detectors/data-science/marimo-only
mkdir -p tests/fixtures/adopt/detectors/data-science/dvc-managed
mkdir -p tests/fixtures/adopt/detectors/data-science/no-match
```

Write fixture files using the Write tool (do not use `echo >`):

- `tests/fixtures/adopt/detectors/data-science/marimo-only/pyproject.toml`:

  ```toml
  [project]
  name = "analysis"
  dependencies = ["marimo", "polars", "pandas"]
  ```

- `tests/fixtures/adopt/detectors/data-science/dvc-managed/dvc.yaml`:

  ```yaml
  stages:
    ingest:
      cmd: python src/ingest.py
      outs:
        - data/raw.parquet
  ```

- `tests/fixtures/adopt/detectors/data-science/no-match/package.json`:

  ```json
  { "name": "unrelated", "dependencies": { "express": "^4.0.0" } }
  ```

- [ ] **Step 2: Write `data-science.test.ts` first (TDD)**

```typescript
// src/project/detectors/data-science.test.ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectDataScience } from './data-science.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/data-science')

describe('detectDataScience', () => {
  it('marimo dep → low-tier match', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'marimo-only'))
    const m = detectDataScience(ctx)
    expect(m?.projectType).toBe('data-science')
    expect(m?.confidence).toBe('low')
    expect(m?.partialConfig.audience).toBeUndefined() // detector omits; schema defaults
  })

  it('dvc.yaml → low-tier match', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'dvc-managed'))
    const m = detectDataScience(ctx)
    expect(m?.projectType).toBe('data-science')
    expect(m?.confidence).toBe('low')
  })

  it('.dvc/config directory → low-tier match', () => {
    const ctx = createFakeSignalContext({
      files: { '.dvc/config': '[core]\nremote = s3remote\n' },
    })
    const m = detectDataScience(ctx)
    expect(m?.projectType).toBe('data-science')
    expect(m?.confidence).toBe('low')
  })

  it('.marimo.toml → low-tier match', () => {
    const ctx = createFakeSignalContext({
      files: { '.marimo.toml': '[display]\ntheme = "dark"\n' },
    })
    const m = detectDataScience(ctx)
    expect(m?.confidence).toBe('low')
  })

  it('dvc as a pyproject dep → low-tier match', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'x', dependencies: ['dvc'] } },
    })
    const m = detectDataScience(ctx)
    expect(m?.confidence).toBe('low')
  })

  it('no DS signals → null (no match)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'no-match'))
    const m = detectDataScience(ctx)
    expect(m).toBeNull()
  })
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/data-science.test.ts 2>&1 | tail -20
```

Expected: compile error — `detectDataScience` is not defined. This is the failing-test state.

- [ ] **Step 4: Write minimal implementation**

```typescript
// src/project/detectors/data-science.ts
import type { SignalContext } from './context.js'
import type { DataScienceMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectDataScience(ctx: SignalContext): DataScienceMatch | null {
  const ev: DetectionEvidence[] = []

  const hasDvcYaml = ctx.hasFile('dvc.yaml')
  const hasDvcConfig = ctx.hasFile('.dvc/config')
  const hasMarimoToml = ctx.hasFile('.marimo.toml')
  const hasMarimoDep = ctx.hasAnyDep(['marimo'], 'py')
  const hasDvcDep = ctx.hasAnyDep(['dvc'], 'py')

  if (!hasDvcYaml && !hasDvcConfig && !hasMarimoToml && !hasMarimoDep && !hasDvcDep) {
    return null
  }

  if (hasDvcYaml) ev.push(evidence('dvc-yaml', 'dvc.yaml'))
  if (hasDvcConfig) ev.push(evidence('dvc-config', '.dvc/config'))
  if (hasMarimoToml) ev.push(evidence('marimo-toml', '.marimo.toml'))
  if (hasMarimoDep) ev.push(evidence('marimo-dep'))
  if (hasDvcDep) ev.push(evidence('dvc-dep'))

  return {
    projectType: 'data-science',
    confidence: 'low',
    partialConfig: {},   // audience defaults at Zod-parse time
    evidence: ev,
  }
}
```

- [ ] **Step 5: Run tests to verify PASS**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/data-science.test.ts 2>&1 | tail -15
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add \
  src/project/detectors/data-science.ts \
  src/project/detectors/data-science.test.ts \
  tests/fixtures/adopt/detectors/data-science/
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(detectors): add low-tier data-science detector with fixture tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C2: Register detector in `ALL_DETECTORS`

**Files:**
- Modify: `src/project/detectors/index.ts`

- [ ] **Step 1: Add import and registry entry**

Open `src/project/detectors/index.ts`. Add import after `detectResearch`:

```typescript
import { detectDataScience } from './data-science.js'
```

Add to `ALL_DETECTORS` array. Place it in Tier 3 (catch-all) just before `detectLibrary`, since DS signals are narrower than dep-heavy detectors but broader than library:

```typescript
  // Tier 3: catch-all
  detectDataScience,
  detectLibrary,
```

- [ ] **Step 2: Verify the DS detector is wired into `runDetectors`**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/ 2>&1 | tail -15
```

Expected: all detector tests PASS.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/project/detectors/index.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(detectors): register detectDataScience in ALL_DETECTORS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C3: Add detector-registry completeness test

This closes the silent-miss hazard called out in spec §3.2 and §7.5 (no such test exists today).

**Files:**
- Create: `src/project/detectors/coverage.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/project/detectors/coverage.test.ts
import { describe, it, expect } from 'vitest'
import { ProjectTypeSchema } from '../../config/schema.js'
import { ALL_DETECTORS } from './index.js'

describe('detector registry completeness', () => {
  it('ALL_DETECTORS covers every ProjectType', () => {
    // Build the set of projectType strings a detector can produce by calling each
    // detector with a fixture-less SignalContext — not every detector will match,
    // but the projectType each detector CLAIMS is encoded in the function itself.
    // We walk the detectors and assert their exported claim matches the schema.
    //
    // Each detector file exports a single function named `detect{PascalCase}` and
    // returns a match object with a `projectType` literal matching one of
    // ProjectTypeSchema.options when it matches. We infer coverage by parsing the
    // filenames in the ALL_DETECTORS barrel import pattern — or more robustly,
    // by comparing project types returned by stub ctx invocations that don't
    // intentionally match.
    //
    // Simpler approach: explicitly list the project types each detector handles.
    const DETECTOR_COVERAGE: readonly string[] = [
      'game', 'browser-extension', 'mobile-app', 'data-pipeline',
      'web-app', 'backend', 'ml', 'research', 'cli',
      'data-science',
      'library',
    ]
    const schemaTypes = new Set(ProjectTypeSchema.options as readonly string[])
    const coveredTypes = new Set(DETECTOR_COVERAGE)
    expect(coveredTypes).toEqual(schemaTypes)
    expect(DETECTOR_COVERAGE.length).toBe(ALL_DETECTORS.length)
  })
})
```

**Note to implementer:** if another approach to coverage detection is cleaner in the codebase (e.g. each detector exporting a `projectType` constant), refactor to that pattern. The list-based approach above is the simplest and avoids invoking detectors with fake contexts. The key invariant is: adding a new ProjectType without a detector must fail this test.

- [ ] **Step 2: Run test — should PASS (DS detector is registered)**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/coverage.test.ts 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 3: Sanity check — temporarily comment out DS detector registration to confirm test FAILS**

Open `src/project/detectors/index.ts`. Comment out the DS entry in `ALL_DETECTORS`. Run:

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/coverage.test.ts 2>&1 | tail -10
```

Expected: FAIL — the test correctly catches missing registration. Uncomment the DS entry, confirm it passes again.

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/project/detectors/coverage.test.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "test(detectors): add ALL_DETECTORS completeness test closing silent-miss hazard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase D — Wizard and CLI wiring

### Task D1: Add DS entry to `coreCopy.projectType.options`

**Files:**
- Modify: `src/wizard/copy/core.ts`

- [ ] **Step 1: Add the entry**

Open `src/wizard/copy/core.ts`. Inside `coreCopy.projectType.options`, add after `'research'`:

```typescript
      'data-science': {
        label: 'Data science project',
        short: 'Analytics, reports, or models — solo / small-team, local-first.',
      },
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run typecheck 2>&1 | head -20
```

`core.ts`-related errors resolve. Other D-phase files still fail.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/copy/core.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): add data-science entry to coreCopy.projectType.options

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D2: Add `DataScienceCopy` type to `copy/types.ts`

**Files:**
- Modify: `src/wizard/copy/types.ts`

- [ ] **Step 1: Inspect existing `MlCopy`**

```bash
grep -n "MlCopy\|ProjectCopyMap" /Users/kenallred/dev-projects/scaffold/src/wizard/copy/types.ts
```

- [ ] **Step 2: Add `DataScienceCopy` mapped type**

Follow the `MlCopy` pattern — mapped type over `DataScienceConfig` keys:

```typescript
export type DataScienceCopy = {
  [K in keyof DataScienceConfig]: QuestionCopy<DataScienceConfig[K]>
}
```

Also add `'data-science': DataScienceCopy` to `ProjectCopyMap`.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run typecheck 2>&1 | head -20
```

Expected: `copy/index.ts` still errors (missing `data-science` key in `PROJECT_COPY`); `types.ts` itself compiles.

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/copy/types.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): add DataScienceCopy mapped type

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D3: Create `src/wizard/copy/data-science.ts`

**Files:**
- Create: `src/wizard/copy/data-science.ts`

- [ ] **Step 1: Write the copy module**

```typescript
// src/wizard/copy/data-science.ts
import type { DataScienceCopy } from './types.js'

export const dataScienceCopy: DataScienceCopy = {
  audience: {
    short: 'Scale and context of the data-science work.',
    long:
      'Solo / small team means local-first, reproducibility-first, notebook-to-pipeline work '
      + 'without existing company infrastructure. (Platform-scale data science will be added '
      + 'in a future release.)',
    options: {
      solo: {
        label: 'Solo / small team',
        short: 'Analytics or modeling done locally, without existing platform infra.',
      },
    },
  },
}
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/copy/data-science.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): add data-science copy module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D4: Register `dataScienceCopy` in `PROJECT_COPY`

**Files:**
- Modify: `src/wizard/copy/index.ts`

- [ ] **Step 1: Add import and registration**

Open `src/wizard/copy/index.ts`. Add import after `researchCopy`:

```typescript
import { dataScienceCopy } from './data-science.js'
```

Add to `PROJECT_COPY`:

```typescript
  'data-science': dataScienceCopy,
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run typecheck 2>&1 | head -20
```

Expected: all copy-related errors resolve; `questions.ts`, `wizard.ts`, `adopt.ts` still error.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/copy/index.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): register dataScienceCopy in PROJECT_COPY

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D5: Add DS branch to `questions.ts`

**Files:**
- Modify: `src/wizard/questions.ts`

- [ ] **Step 1: Extend `WizardAnswers`**

Locate the `WizardAnswers` interface (near top of file). Add:

```typescript
  dataScienceConfig?: DataScienceConfig
```

- [ ] **Step 2: Add the DS question branch**

Find the chain of `if (projectType === '...')` blocks (around line 140-570). After the `research` branch, add:

```typescript
  if (projectType === 'data-science') {
    // DS-1 has a single-value enum (`audience`). Skip the interactive question
    // and set the default directly — the wizard presents the type but the
    // follow-up Q&A carries no meaningful options yet. DS-2 will extend this.
    answers.dataScienceConfig = { audience: 'solo' }
  }
```

Pattern: follow the `ml` / `research` shape but short-circuit since there's only one value to set.

- [ ] **Step 3: Add `dataScienceConfig` to the return block**

At the bottom of the function (around line 714), locate the return object. Add `dataScienceConfig` to the destructured return fields in the same pattern as the existing configs.

- [ ] **Step 4: Write a happy-path wizard test**

Open `src/wizard/questions.test.ts` and add a test that exercises the DS branch. Follow the pattern of existing project-type test cases. Use the simplest interactive-mode mock that routes through the new branch.

```typescript
it('data-science project type sets audience to solo', async () => {
  // Arrange: mock the project-type prompt to return 'data-science'.
  // ... (follow existing test setup in this file)
  const result = await buildAnswers({ projectType: 'data-science', /* ... */ })
  expect(result.dataScienceConfig).toEqual({ audience: 'solo' })
})
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/wizard/questions.test.ts 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/questions.ts src/wizard/questions.test.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): add data-science branch to questions flow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D6: Add DS spread to `wizard.ts` config assembly

**Files:**
- Modify: `src/wizard/wizard.ts`

- [ ] **Step 1: Locate the config-assembly block**

Open `src/wizard/wizard.ts`. Find the conditional-spread block (around line 130-149). It is a list of spread expressions like:

```typescript
      ...(answers.gameConfig && { gameConfig: answers.gameConfig }),
      ...(answers.webAppConfig && { webAppConfig: answers.webAppConfig }),
      // ...
      ...(answers.researchConfig && { researchConfig: answers.researchConfig }),
```

- [ ] **Step 2: Add the DS spread**

After the `researchConfig` spread, add:

```typescript
      ...(answers.dataScienceConfig && { dataScienceConfig: answers.dataScienceConfig }),
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run typecheck 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/wizard.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): wire dataScienceConfig into wizard config assembly

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D7: Extend `TYPE_KEY` and `schemaForType` in `adopt.ts`

**Files:**
- Modify: `src/project/adopt.ts`

- [ ] **Step 1: Locate `TYPE_KEY` and `schemaForType`**

```bash
grep -n "TYPE_KEY\|schemaForType" /Users/kenallred/dev-projects/scaffold/src/project/adopt.ts
```

- [ ] **Step 2: Add DS entries**

In `TYPE_KEY`:

```typescript
  'data-science': 'dataScienceConfig',
```

In `schemaForType`:

```typescript
  'data-science': DataScienceConfigSchema,
```

Also add the `DataScienceConfigSchema` import at the top if not already present.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run typecheck
```

Expected: **ALL typecheck errors resolve.** The codebase now compiles end-to-end with the new project type.

- [ ] **Step 4: Run the full test suite for `src/`**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run 2>&1 | tail -20
```

Expected: all tests pass (save for anything testing the not-yet-created overlay file — if so, note and continue to Phase E).

- [ ] **Step 5: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/project/adopt.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(adopt): extend TYPE_KEY and schemaForType for data-science

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase E — Overlay YAML, packaging test, structural eval

### Task E1: Create `content/methodology/data-science-overlay.yml`

**Files:**
- Create: `content/methodology/data-science-overlay.yml`

- [ ] **Step 1: Write the overlay YAML (matches spec §5.1 exactly)**

```yaml
# methodology/data-science-overlay.yml
name: data-science
description: >
  Data science overlay — injects solo / small-team data science domain
  knowledge into existing pipeline steps for local-first, reproducibility-first
  analytical work and model prototyping.
project-type: data-science

knowledge-overrides:
  # Foundational
  create-prd:            { append: [data-science-requirements] }
  user-stories:          { append: [data-science-requirements] }
  coding-standards:      { append: [data-science-conventions, data-science-notebook-discipline] }
  project-structure:     { append: [data-science-project-structure] }
  dev-env-setup:         { append: [data-science-dev-environment] }
  git-workflow:          { append: [data-science-reproducibility] }

  # Architecture & Design
  system-architecture:   { append: [data-science-architecture] }
  tech-stack:            { append: [data-science-architecture, data-science-dev-environment] }
  adrs:                  { append: [data-science-architecture] }
  domain-modeling:       { append: [data-science-data-versioning] }
  database-schema:       { append: [data-science-data-versioning] }
  security:              { append: [data-science-security] }
  operations:            { append: [data-science-experiment-tracking, data-science-observability, data-science-reproducibility] }

  # Testing
  tdd:                   { append: [data-science-testing] }
  create-evals:          { append: [data-science-testing, data-science-model-evaluation] }

  # Reviews
  review-architecture:   { append: [data-science-architecture] }
  review-database:       { append: [data-science-data-versioning] }
  review-security:       { append: [data-science-security] }
  review-operations:     { append: [data-science-experiment-tracking, data-science-observability] }
  review-testing:        { append: [data-science-testing, data-science-model-evaluation] }

  # Planning
  implementation-plan:   { append: [data-science-architecture] }
```

- [ ] **Step 2: Run `scaffold build`**

Per the project feedback memory, `content/pipeline/` and `content/knowledge/` changes require a build. Overlay YAML changes may or may not — run anyway to be safe:

```bash
cd /Users/kenallred/dev-projects/scaffold && ./node_modules/.bin/tsx src/cli/cli.ts build 2>&1 | tail -10
```

(If the binary layout differs, substitute the correct invocation; check `package.json` scripts.)

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/methodology/data-science-overlay.yml
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(overlay): add data-science-overlay.yml with knowledge-overrides

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task E2: Create `tests/packaging/project-type-overlay-alignment.test.ts`

**Files:**
- Create: `tests/packaging/project-type-overlay-alignment.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { ProjectTypeSchema } from '../../src/config/schema.js'
import { getPackageMethodologyDir } from '../../src/utils/fs.js'

describe('packaging integrity — project-type overlays aligned with schema enum', () => {
  const methodologyDir = getPackageMethodologyDir()

  it.each(ProjectTypeSchema.options as readonly string[])(
    'project type %s has a matching content/methodology file',
    (projectType) => {
      const overlayPath = path.join(methodologyDir, `${projectType}-overlay.yml`)
      expect(
        fs.existsSync(overlayPath),
        `Expected ${overlayPath} to exist for ProjectType '${projectType}'`,
      ).toBe(true)
      expect(
        fs.statSync(overlayPath).isFile(),
        `Expected ${overlayPath} to be a regular file`,
      ).toBe(true)
    },
  )
})
```

- [ ] **Step 2: Run the test — should PASS now that DS overlay exists**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run tests/packaging/project-type-overlay-alignment.test.ts 2>&1 | tail -15
```

Expected: all ProjectType values PASS.

- [ ] **Step 3: Sanity check — temporarily rename the DS overlay and confirm FAIL**

```bash
mv /Users/kenallred/dev-projects/scaffold/content/methodology/data-science-overlay.yml /tmp/ds-overlay.yml.bak
cd /Users/kenallred/dev-projects/scaffold && npx vitest run tests/packaging/project-type-overlay-alignment.test.ts 2>&1 | tail -10
```

Expected: FAIL on `data-science`. Restore:

```bash
mv /tmp/ds-overlay.yml.bak /Users/kenallred/dev-projects/scaffold/content/methodology/data-science-overlay.yml
```

Confirm test PASSES again.

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add tests/packaging/project-type-overlay-alignment.test.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "test(packaging): assert every ProjectType has a matching overlay YAML

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task E3: Create `tests/evals/overlay-structural-coverage.bats`

**Files:**
- Create: `tests/evals/overlay-structural-coverage.bats`

- [ ] **Step 1: Write the eval**

```bash
#!/usr/bin/env bats
# tests/evals/overlay-structural-coverage.bats
#
# Structural invariants for every project-type overlay. Applies to all current
# overlays plus any future ones. Deliberately NARROWER than knowledge-quality.bats
# (which already covers the knowledge-entry orphan check).

load '../evals/eval_helper'

PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"

# Heuristic: project-type overlays are files of the form `{type}-overlay.yml`.
# Domain sub-overlays are `{type}-{domain}.yml` (no `-overlay` suffix). The
# naming convention is the source of truth because it matches loader behavior.
PROJECT_TYPE_OVERLAYS="$(find "${PROJECT_ROOT}/content/methodology" -name '*-overlay.yml' -type f)"

@test "every project-type overlay has required frontmatter fields" {
  local failures=()
  for overlay in ${PROJECT_TYPE_OVERLAYS}; do
    for field in name description project-type; do
      if ! grep -q "^${field}:" "$overlay"; then
        failures+=("$(basename "$overlay"): missing '${field}' field")
      fi
    done
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "%s\n" "${failures[@]}"
    return 1
  fi
}

@test "every project-type overlay's project-type matches the filename" {
  local failures=()
  for overlay in ${PROJECT_TYPE_OVERLAYS}; do
    local expected declared
    expected="$(basename "$overlay" | sed 's/-overlay\.yml$//')"
    declared="$(grep '^project-type:' "$overlay" | sed 's/^project-type: *//;s/[[:space:]]*$//')"
    if [[ "$expected" != "$declared" ]]; then
      failures+=("$(basename "$overlay"): project-type='${declared}' but filename implies '${expected}'")
    fi
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "%s\n" "${failures[@]}"
    return 1
  fi
}

@test "no project-type overlay contains cross-reads-overrides" {
  # Per overlay-loader.ts, project-type overlays cannot carry
  # cross-reads-overrides (only structural overlays like multi-service can).
  local failures=()
  for overlay in ${PROJECT_TYPE_OVERLAYS}; do
    if grep -q '^cross-reads-overrides:' "$overlay"; then
      failures+=("$(basename "$overlay"): contains cross-reads-overrides (not allowed for project-type overlays)")
    fi
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "%s\n" "${failures[@]}"
    return 1
  fi
}

@test "every overlay's knowledge-overrides references valid pipeline step slugs" {
  local all_slugs failures=()
  all_slugs="$(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f -exec basename {} .md \; | sort -u)"

  for overlay in ${PROJECT_TYPE_OVERLAYS}; do
    # Extract step slugs from knowledge-overrides (lines of the form "  step-slug:")
    local slugs
    slugs="$(awk '/^knowledge-overrides:/{flag=1; next} /^[a-zA-Z]/{flag=0} flag && /^  [a-z][a-z0-9-]*:/{sub(/:.*/,""); sub(/^  /,""); print}' "$overlay")"
    for slug in $slugs; do
      if ! grep -qx "$slug" <<< "$all_slugs"; then
        failures+=("$(basename "$overlay"): references unknown step slug '${slug}'")
      fi
    done
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "%s\n" "${failures[@]}"
    return 1
  fi
}

@test "every overlay's knowledge-overrides references existing knowledge entries" {
  local failures=()
  for overlay in ${PROJECT_TYPE_OVERLAYS}; do
    local type entries
    type="$(basename "$overlay" | sed 's/-overlay\.yml$//')"
    # Extract entries inside `append: [a, b, c]` blocks
    entries="$(grep -oE 'append: \[[^]]+\]' "$overlay" | sed 's/append: \[//;s/\]$//' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort -u | grep -v '^$')"
    for entry in $entries; do
      local file="${PROJECT_ROOT}/content/knowledge/${type}/${entry}.md"
      if [[ ! -f "$file" ]]; then
        failures+=("$(basename "$overlay"): references missing knowledge entry '${entry}' (expected at ${file})")
      fi
    done
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "%s\n" "${failures[@]}"
    return 1
  fi
}
```

- [ ] **Step 2: Run the eval — expect FAILURES (knowledge docs not yet created)**

```bash
cd /Users/kenallred/dev-projects/scaffold && bats tests/evals/overlay-structural-coverage.bats 2>&1 | tail -20
```

Expected: the last @test ("every overlay's knowledge-overrides references existing knowledge entries") FAILS for DS — knowledge files don't exist yet. This is correct; Phase F creates them. The other tests should pass.

- [ ] **Step 3: Commit without running to green (knowledge docs come next)**

```bash
git -C /Users/kenallred/dev-projects/scaffold add tests/evals/overlay-structural-coverage.bats
git -C /Users/kenallred/dev-projects/scaffold commit -m "test(evals): add overlay-structural-coverage.bats generic eval

One assertion will fail until DS knowledge docs land in Phase F — expected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase F — Knowledge documents

13 knowledge docs for `data-science/`. Each is a separate task for reviewability. Author to match the style of `content/knowledge/ml/ml-experiment-tracking.md` (opinionated, code-heavy, 150-300 lines).

Before each doc: open an existing reference (e.g. `content/knowledge/ml/ml-experiment-tracking.md`) to remember the shape. Every doc must have frontmatter:

```markdown
---
name: {slug}
description: {one-line description, 1-200 chars}
topics: [topic1, topic2, ...]
---

{one-paragraph opening framing — why this matters}

## Summary

{3-5 sentence opinionated recommendation}

## Deep Guidance

### {Subsection 1}

{content with code blocks}

### {Subsection 2}

{content with code blocks}
```

### Task F1: Add lockstep-pair README in `content/knowledge/data-science/`

**Files:**
- Create: `content/knowledge/data-science/README.md`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p /Users/kenallred/dev-projects/scaffold/content/knowledge/data-science
```

- [ ] **Step 2: Write the lockstep README**

```markdown
# `data-science/` knowledge

Solo / small-team data-science domain knowledge injected into universal pipeline
steps by `content/methodology/data-science-overlay.yml`.

## Lockstep pairs with `ml/`

Five documents here mirror documents in `content/knowledge/ml/`. The two
overlays never compose at runtime (a user picks exactly one project type), but
edits to one side of a pair should trigger review of the other to prevent
recommendation drift over time:

| `data-science/`                         | `ml/`                            |
| --------------------------------------- | -------------------------------- |
| `data-science-experiment-tracking.md`   | `ml-experiment-tracking.md`      |
| `data-science-model-evaluation.md`      | `ml-model-evaluation.md`         |
| `data-science-observability.md`         | `ml-observability.md`            |
| `data-science-requirements.md`          | `ml-requirements.md`             |
| `data-science-conventions.md`           | `ml-conventions.md`              |

`ml/` targets production training and serving systems. `data-science/` targets
solo / small-team analytics and prototyping. Tool picks may diverge where the
audience justifies it (e.g. MLflow self-hosted vs managed W&B).
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/README.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science README with ml lockstep-pair list

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F2: Add matching lockstep README in `ml/`

**Files:**
- Create: `content/knowledge/ml/README.md`

- [ ] **Step 1: Write the paired README**

```markdown
# `ml/` knowledge

Production machine-learning domain knowledge injected into universal pipeline
steps by `content/methodology/ml-overlay.yml`.

## Lockstep pairs with `data-science/`

Five documents here mirror documents in `content/knowledge/data-science/`. See
`content/knowledge/data-science/README.md` for the full pair table. Edits to
one side should trigger review of the other to prevent recommendation drift.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/ml/README.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add ml README pairing to data-science lockstep

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F3-F15: Author 13 knowledge documents

**For each knowledge doc (one task each), follow this pattern:**

1. Open the reference `content/knowledge/ml/{similar}.md` or `content/knowledge/web-app/{similar}.md` to internalize the tone.
2. Draft the file at the target path with proper frontmatter.
3. Keep length between 150 and 300 lines. Code blocks are mandatory for technical subsections.
4. Must contain the required keyword(s) listed below (enforced by the Phase G content eval).
5. Commit per task.

Each task below lists: target file, topic scope, key tool mentions (per spec §4.1), required keywords for the Phase G eval, a reference doc to model, and the commit message.

---

### Task F3: `data-science-requirements.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-requirements.md`

- [ ] **Step 1: Reference**

Open `content/knowledge/ml/ml-requirements.md` for shape.

- [ ] **Step 2: Write the doc**

Topic: What "done" looks like for a DS project — a model performance bar, a report's conclusions, or a pipeline's artifacts. Cover: problem framing, success metric definition, evaluation-test design, stakeholder contract, nonfunctional requirements (reproducibility, runtime, storage).

Required keywords: `evaluation`, `success metric`, `reproducibility`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-requirements.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-requirements.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F4: `data-science-conventions.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-conventions.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-conventions.md`.

- [ ] **Step 2: Write**

Topic: Python coding conventions for DS work — `ruff` (lint + format in one tool; Black-compatible), type hints encouraged, imports ordering, module layout, naming.

Required keywords: `ruff`, `type hints`, `pyproject.toml`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-conventions.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-conventions.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F5: `data-science-project-structure.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-project-structure.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-project-structure.md`.

- [ ] **Step 2: Write**

Directory layout: `notebooks/`, `src/`, `data/` (gitignored), `models/`, `reports/`, `tests/`, `configs/`. Explain promotion path from `notebooks/` to `src/`.

Required keywords: `notebooks/`, `data/`, `.gitignore`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-project-structure.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-project-structure.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F6: `data-science-dev-environment.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-dev-environment.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-dev-environment.md`.

- [ ] **Step 2: Write**

Local reproducible environment setup. Tools: `uv` (primary package manager — 2025+ Python standard), `pyproject.toml`, `direnv`, `pre-commit`. Include a minimal `pyproject.toml` example, a `.envrc` example, and a `pre-commit-config.yaml` example with `ruff`.

Required keywords: `uv`, `direnv`, `pre-commit`, `pyproject.toml`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-dev-environment.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-dev-environment.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F7: `data-science-security.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-security.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-security.md`.

- [ ] **Step 2: Write**

PII handling, credential hygiene, dataset access controls. Env-var secrets, 1Password CLI, data-classification basics. Code examples: masking PII in a DataFrame, loading credentials from `op run`.

Required keywords: `PII`, `secrets`, `1Password`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-security.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-security.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F8: `data-science-testing.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-testing.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-testing.md`.

- [ ] **Step 2: Write**

Testing strategy for DS code. `pytest` for code; `pandera` for dataframe schema validation; fixture-driven test data. Distinguish unit tests for data-transform functions from end-to-end pipeline smoke tests. Example: a `pandera` schema for an input frame and a pytest fixture that loads a small gold-standard CSV.

Required keywords: `pytest`, `pandera`, `fixture`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-testing.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-testing.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F9: `data-science-architecture.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-architecture.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-architecture.md`.

- [ ] **Step 2: Write**

Architecture for solo/small-team DS: local-first, reproducibility-first, notebook→pipeline promotion. Tool picks: `uv` + `Polars` (>1 GB) / `Pandas` (<1 GB). Describe the promotion path: exploratory notebook → extracted function in `src/` → unit-tested → invoked from a pipeline entrypoint.

Required keywords: `Polars`, `Pandas`, `notebook`, `promotion`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-architecture.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-architecture.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F10: `data-science-experiment-tracking.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-experiment-tracking.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-experiment-tracking.md` is the exact template for this doc — nearly identical shape, different audience framing.

- [ ] **Step 2: Write**

What to log, run comparison, artifact storage. Primary: `MLflow` self-hosted (open-source, runs locally). Noted alternative: `Weights & Biases` (cloud, more polished). Include: `mlflow server --backend-store-uri sqlite:///mlflow.db` snippet; `mlflow.start_run` + `log_params` + `log_metrics` pattern; git-commit SHA tagging. Remember to cross-reference the lockstep pair in `ml/ml-experiment-tracking.md` when reviewing.

Required keywords: `MLflow`, `Weights & Biases`, `git commit`, `run_id`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-experiment-tracking.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-experiment-tracking.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F11: `data-science-data-versioning.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-data-versioning.md`

- [ ] **Step 1: Reference**

`content/knowledge/data-pipeline/data-pipeline-schema-management.md` for shape.

- [ ] **Step 2: Write**

When and how to version data. Explicit size-based rule: `DVC` for >10 GB or binary artifacts; git + Parquet for <1 GB; in-between is judgment. Show a `dvc.yaml` stages example; show `git-lfs` patterns for binary weights.

Required keywords: `DVC`, `Parquet`, `dvc.yaml`, `git-lfs`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-data-versioning.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-data-versioning.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F12: `data-science-notebook-discipline.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-notebook-discipline.md`

- [ ] **Step 1: Reference**

No existing doc is a direct model; look at `content/knowledge/ml/ml-training-patterns.md` for style.

- [ ] **Step 2: Write**

Avoiding hidden state, promoting to scripts. Primary: `Marimo` (reactive, git-friendly `.py` format, no hidden-cell-order hazard). Fallback: Jupyter + `jupytext` for paired `.ipynb` + `.py`. Show: a Marimo notebook skeleton; a `jupytext` pairing config; the promotion pattern (extract cell logic → `src/` function → unit test → import back into notebook).

Required keywords: `Marimo`, `Jupyter`, `jupytext`, `hidden state`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-notebook-discipline.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-notebook-discipline.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F13: `data-science-model-evaluation.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-model-evaluation.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-model-evaluation.md` is the lockstep pair.

- [ ] **Step 2: Write**

Metrics selection (accuracy/precision/recall/AUROC for classification; RMSE/MAE/R² for regression), holdout discipline, cross-validation (stratified), calibration, error-slicing. Use sklearn. Show: a `train_test_split` with `stratify=`; a `cross_val_score` with `StratifiedKFold`; `sklearn.calibration.calibration_curve`; an error-slice-by-segment pattern with `pandas`.

Required keywords: `sklearn`, `cross-validation`, `calibration`, `holdout`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-model-evaluation.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-model-evaluation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F14: `data-science-reproducibility.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-reproducibility.md`

- [ ] **Step 1: Reference**

No exact model; use `content/knowledge/data-pipeline/data-pipeline-quality.md` for style.

- [ ] **Step 2: Write**

Pinning dependencies with `uv` lockfile, seed management, determinism (`PYTHONHASHSEED`), containerization (Docker only when crossing OS / CPU architecture). Show: a `uv lock` + `uv sync` command pair; a `set_seed(seed)` helper that covers Python, NumPy, and the primary ML framework; the `PYTHONHASHSEED=0` export pattern.

Required keywords: `uv lock`, `PYTHONHASHSEED`, `seed`, `Docker`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-reproducibility.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-reproducibility.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F15: `data-science-observability.md`

**Files:**
- Create: `content/knowledge/data-science/data-science-observability.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-observability.md` is the lockstep pair.

- [ ] **Step 2: Write**

Model monitoring at solo scale: log predictions + inputs to Parquet; scheduled re-evaluation against a gold-standard set; data-drift detection with `Evidently` (opt-in; often overkill at solo scale). Show: a prediction-log schema; a cron-driven eval script skeleton; a minimal `Evidently` drift-report snippet.

Required keywords: `Evidently`, `drift`, `Parquet`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/data-science/data-science-observability.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add data-science-observability.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F16: Verify structural eval passes with knowledge docs in place

**Files:**
- None (verification only)

- [ ] **Step 1: Run `scaffold build`**

```bash
cd /Users/kenallred/dev-projects/scaffold && ./node_modules/.bin/tsx src/cli/cli.ts build 2>&1 | tail -10
```

(Substitute the correct build invocation if different.)

- [ ] **Step 2: Run the structural eval — should PASS now**

```bash
cd /Users/kenallred/dev-projects/scaffold && bats tests/evals/overlay-structural-coverage.bats 2>&1 | tail -20
```

Expected: all assertions PASS.

- [ ] **Step 3: Run `knowledge-quality.bats` — orphan check must pass**

```bash
cd /Users/kenallred/dev-projects/scaffold && bats tests/evals/knowledge-quality.bats 2>&1 | tail -10
```

Expected: PASS — every new DS knowledge doc is referenced by `data-science-overlay.yml`.

- [ ] **Step 4: No commit — verification task only.**

---

## Phase G — Per-overlay content eval

### Task G1: Create `tests/evals/data-science-overlay-content.bats`

**Files:**
- Create: `tests/evals/data-science-overlay-content.bats`

- [ ] **Step 1: Write the eval**

```bash
#!/usr/bin/env bats
# tests/evals/data-science-overlay-content.bats
#
# Keyword-presence spot checks for data-science knowledge docs. Guards against
# a future edit hollowing out a document. NOT a substitute for human review.

PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
KB_DIR="${PROJECT_ROOT}/content/knowledge/data-science"

@test "data-science-experiment-tracking mentions MLflow" {
  grep -q 'MLflow' "${KB_DIR}/data-science-experiment-tracking.md"
}

@test "data-science-notebook-discipline mentions Marimo" {
  grep -q 'Marimo' "${KB_DIR}/data-science-notebook-discipline.md"
}

@test "data-science-data-versioning mentions DVC" {
  grep -q 'DVC' "${KB_DIR}/data-science-data-versioning.md"
}

@test "data-science-dev-environment mentions uv" {
  grep -qE '\buv\b' "${KB_DIR}/data-science-dev-environment.md"
}

@test "data-science-testing mentions pytest and pandera" {
  grep -q 'pytest' "${KB_DIR}/data-science-testing.md"
  grep -q 'pandera' "${KB_DIR}/data-science-testing.md"
}

@test "data-science-model-evaluation mentions calibration" {
  grep -q 'calibration' "${KB_DIR}/data-science-model-evaluation.md"
}

@test "data-science-observability mentions Evidently" {
  grep -q 'Evidently' "${KB_DIR}/data-science-observability.md"
}

@test "data-science-reproducibility mentions PYTHONHASHSEED" {
  grep -q 'PYTHONHASHSEED' "${KB_DIR}/data-science-reproducibility.md"
}

@test "data-science-architecture mentions Polars and Pandas" {
  grep -q 'Polars' "${KB_DIR}/data-science-architecture.md"
  grep -q 'Pandas' "${KB_DIR}/data-science-architecture.md"
}

@test "data-science-security mentions PII" {
  grep -q 'PII' "${KB_DIR}/data-science-security.md"
}
```

- [ ] **Step 2: Run the eval**

```bash
cd /Users/kenallred/dev-projects/scaffold && bats tests/evals/data-science-overlay-content.bats 2>&1 | tail -15
```

Expected: all 10 tests PASS (assuming Phase F tasks followed the required-keywords guidance).

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add tests/evals/data-science-overlay-content.bats
git -C /Users/kenallred/dev-projects/scaffold commit -m "test(evals): add keyword-presence content eval for data-science knowledge

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase H — E2E test extension

### Task H1: Extend `src/e2e/project-type-overlays.test.ts` with a DS case

**Files:**
- Modify: `src/e2e/project-type-overlays.test.ts`

- [ ] **Step 1: Read existing tests to find the DS-insertion point**

```bash
grep -n "backend\|'ml'\|project-type" /Users/kenallred/dev-projects/scaffold/src/e2e/project-type-overlays.test.ts | head -30
```

The file uses `describe.each` or sibling `describe` blocks per project type. Follow the existing pattern.

- [ ] **Step 2: Add a DS-specific `describe` block**

Pattern (adapt to the existing file's shape):

```typescript
describe('data-science overlay', () => {
  it('init → config validates → overlay resolves → knowledge injects', async () => {
    // Arrange
    const tmp = makeTempDir()
    const config = {
      version: 2,
      methodology: 'mvp',
      project: {
        projectType: 'data-science' as const,
        dataScienceConfig: { audience: 'solo' as const },
      },
    }

    // Act: write config, load, validate, resolve overlay
    fs.writeFileSync(path.join(tmp, 'config.yml'), yaml.dump(config))
    const loaded = await loadConfig(tmp)
    const parsed = ConfigSchema.parse(loaded)
    const overlay = await loadOverlay('data-science', getPackageMethodologyDir())
    const state = await resolveOverlayState(parsed, {
      overlay,
      /* other args matching existing E2E tests */
    })

    // Assert: knowledge injected into expected steps
    expect(state.knowledge.get('create-prd')).toContain('data-science-requirements')
    expect(state.knowledge.get('operations')).toEqual(
      expect.arrayContaining([
        'data-science-experiment-tracking',
        'data-science-observability',
      ]),
    )
  })
})
```

Refer to the existing `ml` or `research` describe block for the exact helper APIs used in this test file.

- [ ] **Step 3: Run the E2E test**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/e2e/project-type-overlays.test.ts 2>&1 | tail -15
```

Expected: PASS, including new DS case.

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/e2e/project-type-overlays.test.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "test(e2e): exercise data-science overlay through init → resolve → inject

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase I — Docs

### Task I1: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Find the project-type list**

```bash
grep -n "project-type\|project type\|data-pipeline\|browser-extension" /Users/kenallred/dev-projects/scaffold/README.md | head -20
```

- [ ] **Step 2: Add `data-science` to the project-type enumeration(s)**

Add `data-science` in the same style as the existing entries (alphabetical or by category, whichever the list uses).

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add README.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(readme): add data-science to project-type list

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task I2: Update `docs/roadmap.md`

**Files:**
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Add v3.23.0 entry under "Completed Releases"**

Insert above the current latest entry (v3.22.0):

```markdown
### v3.23.0 (YYYY-MM-DD)

Data Science Project-Type Overlay — `scaffold init --type data-science` targets solo / small-team data scientists with 13 knowledge documents covering reproducibility, experiment tracking, notebook discipline, model evaluation, and data versioning. Implements roadmap "Content & Quality > New Project Type Overlays" for the DS-1 audience; DS-2 (platform / larger-team) deferred to backlog.

- **New overlay**: `content/methodology/data-science-overlay.yml` injects 13 DS knowledge docs into 21 universal pipeline steps.
- **Forward-compatible schema**: `DataScienceConfig.audience: 'solo'` with `.default('solo')` — DS-2 will extend the enum additively.
- **Low-tier detector**: surfaces DS repos with Marimo, DVC, or `dvc.yaml` to `scaffold adopt`; defers to `ml` when both match via `resolveDetection`.
- **Wiring**: schema + validator + detector + wizard copy + adopt mapping. New packaging test + structural eval + detector-coverage test prevent future silent misregistration.
- **Review discipline**: 4-round spec MMR (Codex + Claude + Gemini-compensating) + 3-channel PR MMR. PR #XXX.
```

Fill in the date and PR number at release time.

- [ ] **Step 2: Move "Data Science/Analytics" out of "Content & Quality > New Project Type Overlays" → add DS-2 to a new "Backlog / Later" section**

Find the "New Project Type Overlays" block under "Content & Quality" and:

- Remove the "Data Science/Analytics" bullet
- Add a "Backlog / Later" section if it doesn't exist, containing:

```markdown
### Backlog / Later

- **DS-2 — Platform / larger-team data science**: extends `DataScienceConfig.audience` with `'platform'` discriminator; adds feature-store, orchestration (Airflow/Dagster), model-registry, lineage, governance knowledge docs.
```

- [ ] **Step 3: Fix the stale "~10-20 pipeline steps" wording**

Find the "New Project Type Overlays" prose that says each overlay needs "~10-20 pipeline steps" and replace with:

```markdown
Each requires: 1 overlay YAML + ~12-14 knowledge documents. Project-type overlays are knowledge-injection (no new pipeline steps required).
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add docs/roadmap.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(roadmap): log v3.23.0 data-science overlay; add DS-2 to backlog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task I3: Update `CHANGELOG.md`

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the v3.23.0 entry**

Add at the top of the changelog, matching the existing format:

```markdown
## [3.23.0] — YYYY-MM-DD

### Added
- `data-science` project-type overlay for solo / small-team data science work. Includes 13 knowledge documents injected into 21 universal pipeline steps (reproducibility, experiment tracking, notebook discipline, model evaluation, data versioning, etc.).
- Low-tier brownfield detector recognizes DS repos via Marimo, DVC, or `dvc.yaml` signals.
- Forward-compatible `DataScienceConfig.audience` discriminator (default `'solo'`) so DS-2 can extend additively.
- New packaging test (`project-type-overlay-alignment.test.ts`), structural eval (`overlay-structural-coverage.bats`), detector-coverage test, and keyword-presence content eval.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add CHANGELOG.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(changelog): add v3.23.0 data-science overlay entry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase J — Verification, PR, and review

### Task J1: Run full quality gates

**Files:**
- None

- [ ] **Step 1: Run `make check-all`**

```bash
cd /Users/kenallred/dev-projects/scaffold && make check-all 2>&1 | tail -40
```

Expected: all bash evals + TypeScript typecheck + vitest + bats tests PASS.

- [ ] **Step 2: If anything fails, fix before moving on.**

Do NOT commit failing code. If a test is flaky, investigate — do not retry without understanding. Pattern: read the failure, fix the root cause, re-run.

- [ ] **Step 3: Review the diff**

```bash
cd /Users/kenallred/dev-projects/scaffold && git diff origin/main...HEAD --stat
```

Confirm: no unexpected files touched; changes match the plan.

- [ ] **Step 4: No commit — verification only.**

---

### Task J2: Push branch and open PR

**Files:**
- None

- [ ] **Step 1: Push**

```bash
cd /Users/kenallred/dev-projects/scaffold && git push -u origin feat/data-science-overlay
```

- [ ] **Step 2: Open PR with body**

Use the template below:

```bash
gh pr create --title "feat: data-science project-type overlay (v3.23.0)" --body "$(cat <<'EOF'
## Summary

- Ship the `data-science` project-type overlay targeting solo / small-team data science work (DS-1).
- 13 knowledge documents + overlay YAML + schema wiring + low-tier brownfield detector + wizard/adopt integration.
- Forward-compatible `audience` discriminator keeps DS-2 additive when it lands.
- New packaging test, structural eval, and detector-coverage test prevent future silent misregistration.

Implements spec: \`docs/superpowers/specs/2026-04-21-data-science-and-web3-overlays-design.md\`.

## Test plan

- [x] \`make check-all\` passes (bash evals + TypeScript typecheck + vitest + bats)
- [x] New packaging test asserts every ProjectType has a matching overlay YAML
- [x] New structural eval asserts overlay frontmatter + step-slug + knowledge-entry references
- [x] New detector-coverage test asserts \`ALL_DETECTORS\` covers every ProjectType
- [x] Keyword-presence content eval spot-checks 10 DS knowledge docs for required tool mentions
- [x] E2E test exercises DS init → config → overlay resolve → knowledge inject

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI**

```bash
cd /Users/kenallred/dev-projects/scaffold && gh pr checks
```

Poll until the `check` job succeeds. Fix CI failures before moving to Task J3.

---

### Task J3: 3-channel MMR

**Files:**
- None (may modify files during fix rounds)

- [ ] **Step 1: Capture PR number**

```bash
cd /Users/kenallred/dev-projects/scaffold && gh pr view --json number -q .number
```

- [ ] **Step 2: Run `mmr review` if available; otherwise dispatch the three CLIs directly**

Per CLAUDE.md:

```bash
cd /Users/kenallred/dev-projects/scaffold && mmr review --pr $PR_NUMBER --sync --format json
```

If `mmr` is unavailable, dispatch directly — all foreground, never `run_in_background`:

- `codex exec --skip-git-repo-check -s read-only --ephemeral "review PR #$PR_NUMBER …"`
- `NO_BROWSER=true gemini -p "…" --output-format json --approval-mode yolo` (or compensating `claude -p` labelled `[compensating: Gemini-equivalent]` if Gemini auth fails)
- `claude -p "…" --output-format json`

- [ ] **Step 3: Fix all P0 / P1 / P2 findings**

For each finding, make the fix in a new commit on the same branch. Re-push. Up to 3 fix rounds per CLAUDE.md. If findings persist after 3 rounds, stop and surface to the user.

- [ ] **Step 4: No final commit for this step — findings-driven commits land individually.**

---

### Task J4: Squash-merge and release

**Files:**
- None (release-flow execution)

- [ ] **Step 1: Squash-merge**

```bash
cd /Users/kenallred/dev-projects/scaffold && gh pr merge --squash --delete-branch
```

- [ ] **Step 2: Tag release**

```bash
cd /Users/kenallred/dev-projects/scaffold && git checkout main && git pull
cd /Users/kenallred/dev-projects/scaffold && git tag -a v3.23.0 -m "v3.23.0 — data-science project-type overlay"
cd /Users/kenallred/dev-projects/scaffold && git push origin v3.23.0
```

- [ ] **Step 3: Create GitHub release**

```bash
cd /Users/kenallred/dev-projects/scaffold && gh release create v3.23.0 --title "v3.23.0 — data-science project-type overlay" --notes-from-tag
```

(Or write the notes inline with `--notes "$(cat <<'EOF'...EOF)"` to match the CHANGELOG entry.)

- [ ] **Step 4: Verify npm publish + Homebrew workflows**

```bash
cd /Users/kenallred/dev-projects/scaffold && gh run list --workflow=publish.yml --limit 3
cd /Users/kenallred/dev-projects/scaffold && gh run list --workflow=homebrew-update.yml --limit 3
```

Both should complete successfully. If the npm publish fails with auth errors, check the trusted-publisher config in npm package settings (per `CLAUDE.md`).

- [ ] **Step 5: Verify user-facing upgrades**

```bash
npm view @zigrivers/scaffold version
brew info scaffold | head -3
```

Both should report `3.23.0`.

- [ ] **Step 6: No commit — release is tag-driven.**

---

## Wrap-up

After Task J4 completes:

1. Announce completion to the user: PR merged, release tagged, npm + Homebrew verified.
2. Flag any deviations from the plan that surfaced during execution (e.g. a file-path rename, a test pattern that needed adapting).
3. Ask whether to start the Web3 plan now (spec §8.1 allows a pause to reassess).
