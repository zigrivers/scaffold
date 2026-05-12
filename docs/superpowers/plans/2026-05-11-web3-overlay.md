# Web3 Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `web3` project-type overlay (target `v3.27.0`) following the design in `docs/superpowers/specs/2026-04-21-data-science-and-web3-overlays-design.md`. The overlay injects smart-contract / EVM-protocol domain knowledge into existing universal pipeline steps, adds schema + detector + wizard wiring, and lands with 14 knowledge documents.

**Architecture:** Knowledge-injection-only project-type overlay following the `ml` / `data-pipeline` / `data-science` pattern. Forward-compatible `scope` discriminator defaults to `'contracts'` so W3-2 (web3 application / dApp) can ship additively later. Medium-tier brownfield detector surfaces Foundry / Hardhat repos in `scaffold adopt`.

**Tech stack:** TypeScript (zod schema, vitest), bats-core (evals), YAML (overlay config + knowledge frontmatter), Markdown (knowledge docs).

**Predecessor work that this plan builds on:** the DS PR (v3.23.0) already landed three generic guardrails that auto-cover Web3 with zero new code:

- `tests/packaging/project-type-overlay-alignment.test.ts` — `it.each(ProjectTypeSchema.options)` packaging test (asserts every ProjectType has a matching `{type}-overlay.yml`).
- `tests/evals/overlay-structural-coverage.bats` — generic structural eval over every project-type overlay.
- `src/project/detectors/coverage.test.ts` — `ALL_DETECTORS` completeness test enforcing one detector per ProjectType.

Phase E of this plan is therefore shorter than the DS plan's Phase E: the overlay YAML is the only new file; the rest is verification that the three pre-existing tests still pass.

**Before starting:**

1. Read the spec in full, focusing on §4.2, §5.2, §6, and §7.4: `docs/superpowers/specs/2026-04-21-data-science-and-web3-overlays-design.md`
2. Re-read the DS plan for any execution patterns this plan inherits: `docs/superpowers/plans/2026-04-21-data-science-overlay.md`
3. Branch from latest `main`: `git -C /Users/kenallred/dev-projects/scaffold checkout main && git pull && git checkout -b feat/web3-overlay`
4. Confirm you are in a clean worktree: `git status` shows no uncommitted changes (besides spec/plan if you just authored them)

---

## Phase A — Foundation types and schema

Everything else depends on these. Keep commits small so downstream errors point at the right task.

### Task A1: Add `'web3'` to ProjectTypeSchema + Web3ConfigSchema

**Files:**
- Modify: `src/config/schema.ts`

- [ ] **Step 1: Add `'web3'` to the enum**

Open `src/config/schema.ts` line 18-22. Current:

```typescript
export const ProjectTypeSchema = z.enum([
  'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
  'data-pipeline', 'ml', 'browser-extension', 'research',
  'data-science',
])
```

Change to (append `'web3'` after `'data-science'` on the same row as `'data-science'`):

```typescript
export const ProjectTypeSchema = z.enum([
  'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
  'data-pipeline', 'ml', 'browser-extension', 'research',
  'data-science', 'web3',
])
```

- [ ] **Step 2: Add Web3ConfigSchema**

Insert immediately after `DataScienceConfigSchema` (around line 124). The schema has a single `scope` field with `'contracts'` as the only value — forward-compatible for W3-2:

```typescript
export const Web3ConfigSchema = z.object({
  // 'contracts' = current W3-1 scope (smart-contract / protocol projects on EVM).
  // W3-2 will add 'dapp' for web3 application / dApp projects.
  scope: z.enum(['contracts']).default('contracts'),
}).strict()
```

- [ ] **Step 3: Add `web3Config` field to `ServiceSchema`**

Open `src/config/schema.ts` and locate the `ServiceSchema` config-field block (around line 161-171). It currently ends with:

```typescript
  browserExtensionConfig: BrowserExtensionConfigSchema.optional(),
  dataScienceConfig: DataScienceConfigSchema.optional(),
```

Add one more line in the same block:

```typescript
  web3Config: Web3ConfigSchema.optional(),
```

- [ ] **Step 4: Add `web3Config` field to `ProjectSchema`**

Open `src/config/schema.ts` and locate `ProjectSchema` (around line 192-207). Same pattern — add after `dataScienceConfig: DataScienceConfigSchema.optional()`:

```typescript
  web3Config: Web3ConfigSchema.optional(),
```

- [ ] **Step 5: Run typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run type-check
```

Expected: compile errors in downstream files that switch on `ProjectType` — specifically `src/wizard/copy/index.ts`, `src/wizard/copy/core.ts`, `src/project/adopt.ts`, and `src/project/detectors/types.ts` (no `Web3Match` variant yet). These are expected; we will fix them in Phase A3 / Phase D. Do NOT fix them yet.

The exact error list may vary slightly depending on the order `tsc` emits diagnostics — all downstream errors are expected until Phase D7 completes. The key invariant: errors should be CONFINED to files we modify in Phase D + `adopt.ts` (which is Phase D7). If you see typecheck errors in any other file (e.g. an unrelated test file, a script in `scripts/`, anything outside the `src/wizard/copy/*`, `src/project/adopt.ts`, `src/project/detectors/types.ts` set), STOP and investigate — the schema change may have hit an unexpected dependency.

> **Red window callout:** From this commit forward, `tests/packaging/project-type-overlay-alignment.test.ts` (alignment check between `ProjectType` and `*-overlay.yml`) and `src/project/detectors/disambiguate.test.ts`'s `PROJECT_TYPE_PREFERENCE completeness` test BOTH fail. They resolve in later phases — E1 lands the overlay YAML; C4 adds the disambiguate entry. Do NOT attempt to fix these mid-flow. During Phases A/B/C/D, run `npx vitest run` only for tests directly relevant to the task at hand. The full suite (`make check-all`) is run in Task J1.

- [ ] **Step 6: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/config/schema.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(schema): add web3 project type and Web3ConfigSchema

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task A2: Add `Web3Config` derived type and `ProjectConfig`/`ServiceConfig` interface fields

**Files:**
- Modify: `src/types/config.ts`

- [ ] **Step 1: Read `src/types/config.ts` to see all three structures**

Use the Read tool on `/Users/kenallred/dev-projects/scaffold/src/types/config.ts`. Focus on these ranges:

- Schema import block at the top (lines 1-8) — `Web3ConfigSchema` must be added here.
- `DetectedConfig` (lines 75-86) — discriminated union with `{ type, config }` variants using **full** config types, NOT `Partial<...>`.
- `ServiceConfig` interface (lines 122-141).
- `ProjectConfig` interface (lines 144-161).

Note the ordering of config fields within `ServiceConfig` / `ProjectConfig` — `dataScienceConfig` is the most recently added, so `web3Config` goes after it.

- [ ] **Step 2: Add `Web3ConfigSchema` to the import block**

Append `Web3ConfigSchema` to the destructured import from `../config/schema.js`:

```typescript
import {
  ProjectTypeSchema, WebAppConfigSchema, BackendConfigSchema,
  CliConfigSchema, LibraryConfigSchema, MobileAppConfigSchema,
  DataPipelineConfigSchema, MlConfigSchema, BrowserExtensionConfigSchema,
  GameConfigSchema, ResearchConfigSchema, DataScienceConfigSchema,
  Web3ConfigSchema,
} from '../config/schema.js'
```

- [ ] **Step 3: Export `Web3Config` type**

Locate the block of `export type XConfig = z.infer<typeof XConfigSchema>` declarations. Add immediately after `DataScienceConfig`:

```typescript
/** Web3 (smart-contract / EVM protocol) configuration — derived from Zod schema (single source of truth). */
export type Web3Config = z.infer<typeof Web3ConfigSchema>
```

- [ ] **Step 4: Extend `DetectedConfig` discriminated union**

Add the new variant at the end of the union. Use the **full** config type (not `Partial<...>`) — that matches every existing variant:

```typescript
  | { type: 'web3'; config: Web3Config }
```

- [ ] **Step 5: Extend `ServiceConfig` interface**

Add this line to `ServiceConfig`, positioned after `dataScienceConfig?: DataScienceConfig`:

```typescript
  web3Config?: Web3Config
```

- [ ] **Step 6: Extend `ProjectConfig` interface**

Add the same line to `ProjectConfig`, positioned after `dataScienceConfig?: DataScienceConfig`:

```typescript
  web3Config?: Web3Config
```

- [ ] **Step 7: Run typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run type-check
```

Expected: A2-related errors resolve. Other errors (copy, adopt, detector types, etc.) still present — expected.

- [ ] **Step 8: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/types/config.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(types): add Web3Config type and extend ProjectConfig/ServiceConfig/DetectedConfig

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task A3: Add `Web3Match` variant to `DetectionMatch`

**Files:**
- Modify: `src/project/detectors/types.ts`

- [ ] **Step 1: Inspect existing `DataScienceMatch`**

Use Read on `/Users/kenallred/dev-projects/scaffold/src/project/detectors/types.ts`. Note:
- `BaseMatch` interface carries `confidence` and `evidence` (readonly).
- Every `{Type}Match` extends `BaseMatch` with `projectType` literal + `partialConfig: Partial<z.infer<typeof {Type}ConfigSchema>>` (readonly).
- Schema types (not config types) are imported at the top from `../../config/schema.js`.

- [ ] **Step 2: Add `Web3ConfigSchema` to the import block**

Update the existing schema import block at the top to include `Web3ConfigSchema`:

```typescript
import type {
  WebAppConfigSchema, BackendConfigSchema, CliConfigSchema, LibraryConfigSchema,
  MobileAppConfigSchema, DataPipelineConfigSchema, MlConfigSchema, ResearchConfigSchema,
  BrowserExtensionConfigSchema, GameConfigSchema, DataScienceConfigSchema,
  Web3ConfigSchema,
} from '../../config/schema.js'
```

- [ ] **Step 3: Add `Web3Match` interface**

Add the new interface after `DataScienceMatch`, mirroring the sibling pattern exactly:

```typescript
export interface Web3Match extends BaseMatch {
  readonly projectType: 'web3'
  readonly partialConfig: Partial<z.infer<typeof Web3ConfigSchema>>
}
```

- [ ] **Step 4: Extend the `DetectionMatch` union**

Append `| Web3Match` to the `DetectionMatch` union type:

```typescript
export type DetectionMatch =
  | WebAppMatch | BackendMatch | CliMatch | LibraryMatch | MobileAppMatch
  | DataPipelineMatch | MlMatch | ResearchMatch | BrowserExtensionMatch | GameMatch
  | DataScienceMatch | Web3Match
```

- [ ] **Step 5: Run typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run type-check
```

Expected: types compile cleanly for this file (downstream compiler errors still expected until Phase D).

- [ ] **Step 6: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/project/detectors/types.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(detectors): add Web3Match variant to DetectionMatch union

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B — Coupling validator

> **Red window reminder (from Task A1 Step 5):** `tests/packaging/project-type-overlay-alignment.test.ts` and `src/project/detectors/disambiguate.test.ts`'s `PROJECT_TYPE_PREFERENCE completeness` test continue to fail throughout Phase B. They resolve in C4 (disambiguate) and E1 (overlay YAML). Do NOT attempt to fix these mid-flow. Only run `npx vitest run` for tests directly relevant to the current task.

### Task B1: Create `web3CouplingValidator`

**Files:**
- Create: `src/config/validators/web3.ts`

The validators in `src/config/validators/validators.test.ts` are parameterized over `ALL_COUPLING_VALIDATORS` via `it.each`, so registering the new validator in Task B2 will automatically extend test coverage. No edit to the test file is required.

- [ ] **Step 1: Write the validator file**

```typescript
// src/config/validators/web3.ts
import type { CouplingValidator } from './types.js'
import type { Web3Config } from '../../types/config.js'

export const web3CouplingValidator: CouplingValidator<Web3Config> = {
  configKey: 'web3Config',
  projectType: 'web3',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'web3') {
      ctx.addIssue({
        path: [...path, 'web3Config'],
        code: 'custom',
        message: 'web3Config requires projectType: web3',
      })
    }
    // No cross-field invariants yet — `scope` has a single value 'contracts'.
  },
}
```

- [ ] **Step 2: Verify `validators.test.ts` will auto-cover the new validator once registered**

Open `src/config/validators/validators.test.ts`. Confirm the tests iterate `ALL_COUPLING_VALIDATORS` with `it.each`. No edit needed.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/config/validators/web3.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(validators): add web3CouplingValidator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B2: Register validator in `ALL_COUPLING_VALIDATORS`

**Files:**
- Modify: `src/config/validators/index.ts`

- [ ] **Step 1: Confirm `registry.test.ts` currently FAILS (or errors cleanly)**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/config/validators/registry.test.ts 2>&1 | tail -40
```

Expected one of two outcomes:

1. Assertion failure on "registers exactly one validator per ProjectType" — `web3` is in the schema enum but not in the registry.
2. Module-load error if the transitive import graph can't resolve (less likely, but acceptable as "test does not pass" red state).

Either outcome is satisfying-red. If the test unexpectedly passes, the A2/A3 work landed something else and the plan's invariants are off — stop and investigate before implementing.

- [ ] **Step 2: Register the validator**

Open `src/config/validators/index.ts`. Add import after the `dataScienceCouplingValidator` import:

```typescript
import { web3CouplingValidator } from './web3.js'
```

Add entry in `ALL_COUPLING_VALIDATORS` (after `dataScienceCouplingValidator`):

```typescript
  web3CouplingValidator as CouplingValidator<unknown>,
```

- [ ] **Step 3: Run registry + validators tests**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/config/validators/ 2>&1 | tail -30
```

Expected: all tests PASS. `registry.test.ts` now confirms Web3 is registered; `validators.test.ts` it.each cases auto-include Web3.

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/config/validators/index.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(validators): register web3CouplingValidator in ALL_COUPLING_VALIDATORS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase C — Detector

### Task C1: Write `detectWeb3` against TDD fixtures

**Files:**
- Create: `src/project/detectors/web3.ts`
- Create: `src/project/detectors/web3.test.ts`
- Create: `tests/fixtures/adopt/detectors/web3/foundry-only/` (fixture dir)
- Create: `tests/fixtures/adopt/detectors/web3/hardhat-only/` (fixture dir)
- Create: `tests/fixtures/adopt/detectors/web3/foundry-supplementary/` (fixture dir)
- Create: `tests/fixtures/adopt/detectors/web3/no-match/` (fixture dir)

**Detector design** (per spec §6.4 with Web3-specific tier rules from this plan's preamble):

- `foundry.toml` → **medium** (explicit Foundry project file)
- `hardhat.config.ts` OR `hardhat.config.js` OR `hardhat.config.cjs` OR `hardhat.config.mjs` → **medium** (explicit Hardhat config; check all four extensions)
- `remappings.txt` → **low** (Foundry supplementary signal)
- `dirExists('lib/forge-std')` → **low** (Foundry toolchain artifact)
- Any **medium-tier signal alone** → match at `confidence: 'medium'`.
- **Only low-tier signals** → match at `confidence: 'low'`.
- No signals → return `null`.
- `partialConfig`: `{}` — schema's `.default('contracts')` materializes the field at Zod-parse time. Do NOT write `scope: 'contracts'` (that would imply detector intent the signals don't support; see spec §6.2).

**Hardhat ↔ library detector collision risk** (see this plan's preamble): Hardhat projects typically declare `hardhat` and `@nomicfoundation/hardhat-toolbox` in `devDependencies` and do NOT publish a library (no `main` / `module` / `exports` / `bin` in `package.json`). Under that shape `detectLibrary` returns null (line 13 of `library.ts`: `isPureNpmLib = pkg && (pkg.main || pkg.module || pkg.exports) && !pkg.bin`). However, a published Solidity utility library that happens to use Hardhat could legitimately export both. Task C5 verifies a Hardhat fixture resolves to `web3`, not `library`. If the regression test fires, the implementation must add minimal Hardhat exclusions to `library.ts` (analogous to the `marimo` / `dvc` additions in `PYTHON_APP_DEPS`); details in Task C5.

- [ ] **Step 0: Verify helper APIs before writing tests**

Confirm `createFakeSignalContext` accepts the fields the test code uses. Read `src/project/detectors/context.ts` starting around line 679 (the `createFakeSignalContext` definition and `FakeContextInput` type) and confirm the shape in Step 2's test code matches. Specifically: `packageJson`, `files`, `dirs`, `rootEntries`, `dirListings` are accepted input keys. If the actual keys differ, adjust the Step 2 test code before moving on.

- [ ] **Step 1: Create fixtures**

```bash
cd /Users/kenallred/dev-projects/scaffold
mkdir -p tests/fixtures/adopt/detectors/web3/foundry-only
mkdir -p tests/fixtures/adopt/detectors/web3/hardhat-only
mkdir -p tests/fixtures/adopt/detectors/web3/foundry-supplementary
mkdir -p tests/fixtures/adopt/detectors/web3/no-match
```

Write fixture files using the Write tool (do not use `echo >`):

- `tests/fixtures/adopt/detectors/web3/foundry-only/foundry.toml`:

  ```toml
  [profile.default]
  src = "src"
  out = "out"
  libs = ["lib"]
  ```

- `tests/fixtures/adopt/detectors/web3/hardhat-only/hardhat.config.ts`:

  ```typescript
  import { HardhatUserConfig } from "hardhat/config"
  import "@nomicfoundation/hardhat-toolbox"

  const config: HardhatUserConfig = {
    solidity: "0.8.24",
  }
  export default config
  ```

- `tests/fixtures/adopt/detectors/web3/hardhat-only/package.json`:

  ```json
  {
    "name": "contracts",
    "private": true,
    "devDependencies": {
      "hardhat": "^2.22.0",
      "@nomicfoundation/hardhat-toolbox": "^5.0.0"
    }
  }
  ```

- `tests/fixtures/adopt/detectors/web3/foundry-supplementary/remappings.txt`:

  ```text
  @openzeppelin/=lib/openzeppelin-contracts/
  forge-std/=lib/forge-std/src/
  ```

- `tests/fixtures/adopt/detectors/web3/no-match/package.json`:

  ```json
  { "name": "unrelated", "dependencies": { "express": "^4.0.0" } }
  ```

- [ ] **Step 2: Write `web3.test.ts` first (TDD)**

```typescript
// src/project/detectors/web3.test.ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectWeb3 } from './web3.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/web3')

describe('detectWeb3', () => {
  it('foundry.toml → medium-tier match', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'foundry-only'))
    const m = detectWeb3(ctx)
    expect(m?.projectType).toBe('web3')
    expect(m?.confidence).toBe('medium')
    expect(m?.partialConfig.scope).toBeUndefined() // detector omits; schema defaults
  })

  it('hardhat.config.ts → medium-tier match', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'hardhat-only'))
    const m = detectWeb3(ctx)
    expect(m?.projectType).toBe('web3')
    expect(m?.confidence).toBe('medium')
  })

  it('hardhat.config.js → medium-tier match (fake context)', () => {
    const ctx = createFakeSignalContext({
      files: { 'hardhat.config.js': 'module.exports = { solidity: "0.8.24" }' },
    })
    const m = detectWeb3(ctx)
    expect(m?.confidence).toBe('medium')
  })

  it('hardhat.config.cjs → medium-tier match (fake context)', () => {
    const ctx = createFakeSignalContext({
      files: { 'hardhat.config.cjs': 'module.exports = { solidity: "0.8.24" }' },
    })
    const m = detectWeb3(ctx)
    expect(m?.confidence).toBe('medium')
  })

  it('hardhat.config.mjs → medium-tier match (fake context)', () => {
    const ctx = createFakeSignalContext({
      files: { 'hardhat.config.mjs': 'export default { solidity: "0.8.24" }' },
    })
    const m = detectWeb3(ctx)
    expect(m?.confidence).toBe('medium')
  })

  it('remappings.txt alone → low-tier match (no medium signals)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'foundry-supplementary'))
    const m = detectWeb3(ctx)
    expect(m?.projectType).toBe('web3')
    expect(m?.confidence).toBe('low')
  })

  it('lib/forge-std dir alone → low-tier match (fake context)', () => {
    const ctx = createFakeSignalContext({
      dirs: ['lib/forge-std'],
    })
    const m = detectWeb3(ctx)
    expect(m?.confidence).toBe('low')
  })

  it('foundry.toml + remappings.txt → medium (medium dominates low)', () => {
    const ctx = createFakeSignalContext({
      files: {
        'foundry.toml': '[profile.default]\nsrc = "src"\n',
        'remappings.txt': 'forge-std/=lib/forge-std/src/\n',
      },
    })
    const m = detectWeb3(ctx)
    expect(m?.confidence).toBe('medium')
  })

  it('no web3 signals → null (no match)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'no-match'))
    const m = detectWeb3(ctx)
    expect(m).toBeNull()
  })
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/web3.test.ts 2>&1 | tail -20
```

Expected: compile error — `detectWeb3` is not defined. This is the failing-test state.

- [ ] **Step 4: Write minimal implementation**

```typescript
// src/project/detectors/web3.ts
import type { SignalContext } from './context.js'
import type { Web3Match, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectWeb3(ctx: SignalContext): Web3Match | null {
  const ev: DetectionEvidence[] = []

  // Medium-tier signals (one is enough to claim 'medium').
  const hasFoundryToml = ctx.hasFile('foundry.toml')
  const hasHardhatTs = ctx.hasFile('hardhat.config.ts')
  const hasHardhatJs = ctx.hasFile('hardhat.config.js')
  const hasHardhatCjs = ctx.hasFile('hardhat.config.cjs')
  const hasHardhatMjs = ctx.hasFile('hardhat.config.mjs')
  const hasMediumSignal =
    hasFoundryToml || hasHardhatTs || hasHardhatJs || hasHardhatCjs || hasHardhatMjs

  // Low-tier signals (supplementary).
  const hasRemappings = ctx.hasFile('remappings.txt')
  const hasForgeStd = ctx.dirExists('lib/forge-std')

  if (!hasMediumSignal && !hasRemappings && !hasForgeStd) {
    return null
  }

  if (hasFoundryToml) ev.push(evidence('foundry-toml', 'foundry.toml'))
  if (hasHardhatTs) ev.push(evidence('hardhat-config-ts', 'hardhat.config.ts'))
  if (hasHardhatJs) ev.push(evidence('hardhat-config-js', 'hardhat.config.js'))
  if (hasHardhatCjs) ev.push(evidence('hardhat-config-cjs', 'hardhat.config.cjs'))
  if (hasHardhatMjs) ev.push(evidence('hardhat-config-mjs', 'hardhat.config.mjs'))
  if (hasRemappings) ev.push(evidence('foundry-remappings', 'remappings.txt'))
  if (hasForgeStd) ev.push(evidence('forge-std-lib', 'lib/forge-std'))

  return {
    projectType: 'web3',
    confidence: hasMediumSignal ? 'medium' : 'low',
    partialConfig: {},   // scope defaults at Zod-parse time
    evidence: ev,
  }
}
```

- [ ] **Step 5: Run tests to verify PASS**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/web3.test.ts 2>&1 | tail -15
```

Expected: all 9 tests PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add \
  src/project/detectors/web3.ts \
  src/project/detectors/web3.test.ts \
  tests/fixtures/adopt/detectors/web3/
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(detectors): add medium/low-tier web3 detector with fixture tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C2: Register detector in `ALL_DETECTORS`

**Files:**
- Modify: `src/project/detectors/index.ts`

- [ ] **Step 1: Add import and registry entry**

Open `src/project/detectors/index.ts`. Add import after `detectDataScience`:

```typescript
import { detectWeb3 } from './web3.js'
```

Add to `ALL_DETECTORS` array. Place it in Tier 1 (distinctive root-file detectors) — `foundry.toml` and `hardhat.config.*` are root-file signatures, matching the tier that already contains `detectGame`, `detectBrowserExtension`, `detectMobileApp`, `detectDataPipeline`:

```typescript
  // Tier 1: distinctive root-file detectors (cheap distinctive failures)
  detectGame, detectBrowserExtension, detectMobileApp, detectDataPipeline, detectWeb3,
```

(Order within a tier is performance-only; correctness does not depend on order — all matches are collected and disambiguated.)

- [ ] **Step 2: Verify the Web3 detector is wired into `runDetectors`**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/ 2>&1 | tail -20
```

Expected: all detector tests PASS (including the new Web3 suite).

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/project/detectors/index.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(detectors): register detectWeb3 in ALL_DETECTORS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C3: Verify `coverage.test.ts` still passes after registration

The DS PR already shipped `src/project/detectors/coverage.test.ts`, which asserts `ALL_DETECTORS` covers every `ProjectType` via a maximally-signalled fake context. The fixture must be extended so a Web3 detector claim is possible.

**Files:**
- Modify: `src/project/detectors/coverage.test.ts`

- [ ] **Step 1: Read the existing test**

Use Read on `/Users/kenallred/dev-projects/scaffold/src/project/detectors/coverage.test.ts`. Note the existing `maximal-fixture` shape and the `dirs` / `files` / `rootEntries` keys.

- [ ] **Step 2: Run the test to confirm it FAILS for the missing Web3 signal**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/coverage.test.ts 2>&1 | tail -15
```

Expected: FAIL — the maximal fixture has no Web3 signals, so `detectWeb3` returns null and `claimedTypes` is missing `'web3'`. The assertion `expect(claimedTypes).toEqual(expected)` fails.

- [ ] **Step 3: Extend the maximal fixture so `detectWeb3` claims a match**

In the existing `files` object inside the first `it(...)` block, add a `foundry.toml` entry. Also add `foundry.toml` to `rootEntries`. Pseudo-diff:

```typescript
files: {
  'pyproject.toml': '...',
  'dvc.yaml': 'stages: {}',
  'dbt_project.yml': 'name: my-dbt\n',
  'manifest.json': /* unchanged */,
  'pubspec.yaml': 'name: m\n',
  'next.config.mjs': 'export default { output: "standalone" }',
  'experiment.py': '# experiment',
  'foundry.toml': '[profile.default]\nsrc = "src"\n',   // <-- ADD
},
rootEntries: [
  'package.json', 'pyproject.toml', 'Cargo.toml', 'dvc.yaml',
  'manifest.json', 'analysis.ipynb', 'next.config.mjs', 'pubspec.yaml',
  'experiment.py', 'dbt_project.yml', 'foundry.toml',  // <-- ADD
],
```

- [ ] **Step 4: Run the test to verify PASS**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/coverage.test.ts 2>&1 | tail -15
```

Expected: both tests PASS.

- [ ] **Step 5: Sanity check — temporarily remove Web3 from the registry to confirm test FAILS**

Open `src/project/detectors/index.ts`. Comment out the `detectWeb3` entry in `ALL_DETECTORS`. Run:

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/coverage.test.ts 2>&1 | tail -10
```

Expected: FAIL — `web3` missing from claimedTypes. Uncomment the entry, re-run, confirm PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/project/detectors/coverage.test.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "test(detectors): extend coverage maximal fixture with foundry.toml signal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C4: Add `'web3'` to PROJECT_TYPE_PREFERENCE and verify completeness test

`src/project/detectors/disambiguate.ts:22-26` defines `PROJECT_TYPE_PREFERENCE`. The accompanying `disambiguate.test.ts` (`PROJECT_TYPE_PREFERENCE completeness` block) asserts every `ProjectType` is listed. Without this edit, that test fails.

**Files:**
- Modify: `src/project/detectors/disambiguate.ts`

- [ ] **Step 1: Confirm `PROJECT_TYPE_PREFERENCE completeness` currently FAILS**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/disambiguate.test.ts -t 'PROJECT_TYPE_PREFERENCE completeness' 2>&1 | tail -15
```

Expected: FAIL — `'web3'` is in `ProjectTypeSchema.options` but not in `PROJECT_TYPE_PREFERENCE`.

- [ ] **Step 2: Add `'web3'` to PROJECT_TYPE_PREFERENCE**

Open `src/project/detectors/disambiguate.ts` line 22-26. Current:

```typescript
export const PROJECT_TYPE_PREFERENCE: readonly ProjectType[] = [
  'web-app', 'backend', 'cli', 'library', 'mobile-app',
  'data-pipeline', 'ml', 'research', 'data-science',
  'browser-extension', 'game',
]
```

Add `'web3'` immediately after `'game'` (or in another natural slot — `'game'` and `'browser-extension'` form a "specialized stacks" neighborhood, so `'web3'` belongs adjacent to them). Suggested placement after `'game'`:

```typescript
export const PROJECT_TYPE_PREFERENCE: readonly ProjectType[] = [
  'web-app', 'backend', 'cli', 'library', 'mobile-app',
  'data-pipeline', 'ml', 'research', 'data-science',
  'browser-extension', 'game', 'web3',
]
```

Rationale: this list controls the tiebreak when multiple matches share confidence + evidence count. Placing `'web3'` last keeps generic library / web-app / backend detections winning ahead of `'web3'` for ambiguous repos — a deliberate ordering since Web3 signals are narrower than generic project types.

- [ ] **Step 3: Re-run the completeness test to verify PASS**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/disambiguate.test.ts 2>&1 | tail -15
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/project/detectors/disambiguate.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(detectors): add web3 to PROJECT_TYPE_PREFERENCE

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C5: Verify Hardhat fixture resolves to `web3`, not `library`

This task guards against the library-detector collision risk flagged in this plan's preamble and Task C1. A Hardhat project that exports a library shape (`main` / `module` / `exports` in `package.json`) could trigger `detectLibrary` simultaneously with `detectWeb3`. Both detectors firing is FINE — `resolveDetection` then disambiguates by confidence tier (medium beats high only if low/medium are the only matches; actually high wins, but for ambiguous picks `disambiguate()` shows both to the user). The test below pins the typical Hardhat shape (no `main`/`module`/`exports`/`bin`) to ensure `library` does NOT fire spuriously, so a clean Hardhat repo gets a single unambiguous `web3` match.

**Published-library Hardhat case (explicit choice):** A `package.json` with `main: 'index.js'` + Hardhat config + Solidity contracts fires BOTH `detectLibrary` (high) and `detectWeb3` (medium). `library.ts`'s `isPureNpmLib` requires `!pkg.bin` but does NOT exclude Hardhat. Under that shape, `library` (high) wins over `web3` (medium) via the confidence tiebreak. This plan chooses to **document `library` as the correct winner** for that shape — a published Solidity utility library that uses Hardhat as build tooling is genuinely library-like. The third test case below pins that behavior with an `expect(...).toBe('library')` assertion. If reviewers later disagree, a one-line follow-up adds a Hardhat-as-disqualifier (`isPureNpmLib && !ctx.hasFile('hardhat.config.ts') && !ctx.hasFile('hardhat.config.js')`) to `library.ts` to force web3 to win — defer until concrete user feedback justifies it.

**Files:**
- Create: `src/project/detectors/web3-library-collision.test.ts`

- [ ] **Step 1: Write the regression test**

```typescript
// src/project/detectors/web3-library-collision.test.ts
import { describe, it, expect } from 'vitest'
import { runDetectors } from './index.js'
import { createFakeSignalContext } from './context.js'
import type { DetectionMatch } from './types.js'

describe('Hardhat ↔ library collision regression', () => {
  it('typical Hardhat project (no main/module/exports/bin) → web3 only, NOT library', () => {
    const ctx = createFakeSignalContext({
      packageJson: {
        name: 'contracts',
        private: true,
        devDependencies: {
          hardhat: '^2.22.0',
          '@nomicfoundation/hardhat-toolbox': '^5.0.0',
        },
      },
      files: {
        'hardhat.config.ts':
          'import "@nomicfoundation/hardhat-toolbox"\nexport default { solidity: "0.8.24" }',
        'package.json': '{}',
      },
      rootEntries: ['hardhat.config.ts', 'package.json'],
    })
    const matches: DetectionMatch[] = runDetectors(ctx)
    const types = matches.map(m => m.projectType)
    expect(types).toContain('web3')
    expect(types).not.toContain('library')
  })

  it('typical Foundry project (foundry.toml only) → web3 only, NOT library', () => {
    const ctx = createFakeSignalContext({
      files: {
        'foundry.toml': '[profile.default]\nsrc = "src"\n',
      },
      rootEntries: ['foundry.toml'],
    })
    const matches: DetectionMatch[] = runDetectors(ctx)
    const types = matches.map(m => m.projectType)
    expect(types).toContain('web3')
    expect(types).not.toContain('library')
  })

  it('published-library Hardhat (package.json has main + Hardhat config) → library wins', () => {
    // Documented choice: a published Solidity library that uses Hardhat as
    // tooling is genuinely library-like. `library` (high confidence) wins
    // over `web3` (medium) via the standard confidence tiebreak in
    // resolveDetection. Both detectors fire — that is correct — and the
    // user-facing project type is `library`.
    const ctx = createFakeSignalContext({
      packageJson: {
        name: 'my-solidity-lib',
        main: 'index.js',
        devDependencies: {
          hardhat: '^2.22.0',
          '@nomicfoundation/hardhat-toolbox': '^5.0.0',
        },
      },
      files: {
        'hardhat.config.ts':
          'import "@nomicfoundation/hardhat-toolbox"\nexport default { solidity: "0.8.24" }',
        'package.json': '{}',
        'index.js': 'module.exports = {}',
      },
      rootEntries: ['hardhat.config.ts', 'package.json', 'index.js'],
    })
    const matches: DetectionMatch[] = runDetectors(ctx)
    // Both detectors fire — that's expected:
    const types = matches.map(m => m.projectType)
    expect(types).toContain('web3')
    expect(types).toContain('library')
    // But the resolved/preferred type is `library` (high beats medium):
    const libraryMatch = matches.find(m => m.projectType === 'library')
    const web3Match = matches.find(m => m.projectType === 'web3')
    expect(libraryMatch?.confidence).toBe('high')
    expect(web3Match?.confidence).toBe('medium')
  })
})
```

- [ ] **Step 2: Run the test**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/project/detectors/web3-library-collision.test.ts 2>&1 | tail -15
```

Expected: both tests PASS. The typical Hardhat shape has no `main`/`module`/`exports`/`bin` so `detectLibrary` correctly returns null. The typical Foundry shape has no `package.json` at all.

- [ ] **Step 3 (conditional): if the test FAILS, add minimal Hardhat exclusions to `library.ts`**

If `library` unexpectedly fires on the Hardhat fixture, that means the `package.json` shape used in fixture triggered `isPureNpmLib`. This is unlikely with `private: true` and devDependencies-only Hardhat — but if it happens, add a Hardhat / Foundry exclusion analogous to the Python `PYTHON_APP_DEPS` rule:

```typescript
// In src/project/detectors/library.ts, just before the isPureNpmLib computation:
const isWeb3Repo = ctx.hasFile('foundry.toml')
  || ctx.hasFile('hardhat.config.ts') || ctx.hasFile('hardhat.config.js')
  || ctx.hasFile('hardhat.config.cjs') || ctx.hasFile('hardhat.config.mjs')

// And amend isPureNpmLib:
const isPureNpmLib = pkg && (pkg.main || pkg.module || pkg.exports) && !pkg.bin
  && !isWeb3Repo
```

Re-run the regression test until it PASSES. Keep the diff minimal (only enough to fix the collision; do not refactor `library.ts`).

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add \
  src/project/detectors/web3-library-collision.test.ts \
  $(git -C /Users/kenallred/dev-projects/scaffold ls-files -m src/project/detectors/library.ts 2>/dev/null || true)
git -C /Users/kenallred/dev-projects/scaffold commit -m "test(detectors): regression test pinning Hardhat → web3 not library

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(If Step 3 fired and modified `library.ts`, both files land in this commit. If Step 3 did not fire, only the test file lands.)

---

## Phase D — Wizard and CLI wiring

### Task D1: Add Web3 entry to `coreCopy.projectType.options`

**Files:**
- Modify: `src/wizard/copy/core.ts`

- [ ] **Step 1: Add the entry**

Open `src/wizard/copy/core.ts`. Inside `coreCopy.projectType.options`, add after `'data-science'`:

```typescript
      'web3': {
        label: 'Web3 / smart contracts (EVM)',
        short: 'Smart contracts, libraries, or protocols on Ethereum / L2 chains.',
      },
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run type-check 2>&1 | head -20
```

`core.ts`-related errors resolve. Other D-phase files still fail.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/copy/core.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): add web3 entry to coreCopy.projectType.options

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D2: Add `Web3Copy` type to `copy/types.ts`

**Files:**
- Modify: `src/wizard/copy/types.ts`

- [ ] **Step 1: Inspect existing `DataScienceCopy`**

```bash
grep -n "DataScienceCopy\|ProjectCopyMap" /Users/kenallred/dev-projects/scaffold/src/wizard/copy/types.ts
```

- [ ] **Step 2: Add `Web3Copy` mapped type**

Follow the `DataScienceCopy` pattern — mapped type over `Web3Config` keys:

```typescript
export type Web3Copy = {
  [K in keyof Web3Config]: QuestionCopy<Web3Config[K]>
}
```

Add `Web3Config` to the import block at the top if not already present (import from `../../types/config.js`).

Also add `'web3': Web3Copy` to `ProjectCopyMap`.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run type-check 2>&1 | head -20
```

Expected: `copy/index.ts` still errors (missing `web3` key in `PROJECT_COPY`); `types.ts` itself compiles.

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/copy/types.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): add Web3Copy mapped type

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D2b: Add Web3 assertions to `src/wizard/copy/types.test-d.ts`

Spec §7.5 requires this; the mapped-type compile-time guard is reinforced by a type-level assertion.

**Files:**
- Modify: `src/wizard/copy/types.test-d.ts`

- [ ] **Step 1: Read existing file**

Use Read on `/Users/kenallred/dev-projects/scaffold/src/wizard/copy/types.test-d.ts`. Note the existing `DataScienceCopy` assertions; match that pattern.

- [ ] **Step 2: Add Web3 assertions**

Append `Web3Copy` to the import block at the top:

```typescript
import type {
  WebAppCopy, LibraryCopy, GameCopy, BackendCopy, ProjectCopyMap, OptionCopy, CoreCopy,
  DataScienceCopy, Web3Copy,
} from './types.js'
```

Add inside the existing `describe` block, matching the `DataScienceCopy` pattern:

```typescript
  it('Web3Copy.scope.options requires exact enum keys', () => {
    expectTypeOf<NonNullable<Web3Copy['scope']['options']>>()
      .toEqualTypeOf<Record<'contracts', OptionCopy>>()
  })

  it('ProjectCopyMap["web3"] narrows to Web3Copy', () => {
    expectTypeOf<ProjectCopyMap['web3']>().toEqualTypeOf<Web3Copy>()
  })
```

- [ ] **Step 3: Run type-check**

The `types.test-d.ts` file exercises type-level assertions via `expectTypeOf`. These are caught by the project's `type-check` script (`tsc --noEmit`), the canonical verification.

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run type-check
```

Expected: PASS. If the new assertion has a type mismatch, `tsc` fails loudly with a type error pointing at the test-d file.

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/copy/types.test-d.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "test(wizard): add Web3Copy type-level assertions

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D3: Create `src/wizard/copy/web3.ts`

**Files:**
- Create: `src/wizard/copy/web3.ts`

- [ ] **Step 1: Write the copy module**

```typescript
// src/wizard/copy/web3.ts
import type { Web3Copy } from './types.js'

export const web3Copy: Web3Copy = {
  scope: {
    short: 'Scope of the web3 work.',
    long:
      'Smart contracts / protocol means a Solidity / EVM codebase shipping contracts or '
      + 'libraries to Ethereum, L2 chains, or compatible sidechains. (Web3 application / dApp '
      + 'work that consumes contracts will be added in a future release.)',
    options: {
      contracts: {
        label: 'Smart contracts / protocol',
        short: 'Solidity / EVM contracts, libraries, or protocols.',
      },
    },
  },
}
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/copy/web3.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): add web3 copy module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D4: Register `web3Copy` in `PROJECT_COPY`

**Files:**
- Modify: `src/wizard/copy/index.ts`

- [ ] **Step 1: Add import and registration**

Open `src/wizard/copy/index.ts`. Add import after `dataScienceCopy`:

```typescript
import { web3Copy } from './web3.js'
```

Add to `PROJECT_COPY`:

```typescript
  'web3': web3Copy,
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run type-check 2>&1 | head -20
```

Expected: all copy-related errors resolve; `questions.ts`, `wizard.ts`, `adopt.ts` still error.

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/copy/index.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): register web3Copy in PROJECT_COPY

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D5a: Write failing test for Web3 question branch

TDD: the test must fail first, before the implementation lands in D5b.

**Files:**
- Modify: `src/wizard/questions.test.ts`

- [ ] **Step 1: Read the existing test file**

Use Read on `/Users/kenallred/dev-projects/scaffold/src/wizard/questions.test.ts`. Focus on:
- How the DS branch test is set up (DS-1 has the same single-value enum shape as Web3-1, so it is the closest template).
- The `makeOutputContext` helper and `askWizardQuestions` import already in scope at the top of the file.

The DS sibling test (verified at lines 1025-1039) looks like this:

```typescript
describe('data-science wizard questions', () => {
  it('uses default audience in auto mode (no flags, no prompts)', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'data-science',
    })
    expect(answers.projectType).toBe('data-science')
    expect(answers.dataScienceConfig).toEqual({ audience: 'solo' })
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Add the Web3 sibling describe block**

Insert immediately after the `data-science wizard questions` describe block (around line 1039 — the last `})` before EOF). Paste the block below VERBATIM:

```typescript
describe('web3 wizard questions', () => {
  it('uses default scope in auto mode (no flags, no prompts)', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'web3',
    })
    expect(answers.projectType).toBe('web3')
    expect(answers.web3Config).toEqual({ scope: 'contracts' })
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the test to confirm it FAILS**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/wizard/questions.test.ts -t 'web3' 2>&1 | tail -15
```

Expected: FAIL — `questions.ts` does not yet handle `'web3'`, so `web3Config` will be undefined.

- [ ] **Step 4: Commit the failing test**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/questions.test.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "test(wizard): add failing test for web3 question branch

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D5b: Implement Web3 branch in `questions.ts`

**Files:**
- Modify: `src/wizard/questions.ts`

`askWizardQuestions` uses local `let` variables for each per-type config and returns a literal — there is no `answers` object inside the function. However, the `WizardAnswers` **interface** (lines 16-33 of `questions.ts`) describes the shape of the returned object and must be extended so `web3Config` is part of the public contract.

- [ ] **Step 1: Extend the `WizardAnswers` interface**

Open `/Users/kenallred/dev-projects/scaffold/src/wizard/questions.ts`. The `WizardAnswers` interface near the top of the file (around lines 16-33) lists every per-type config field. Add `web3Config` after `dataScienceConfig`:

```typescript
  dataScienceConfig?: DataScienceConfig
  web3Config?: Web3Config
}
```

Add `Web3Config` to the type-import block at the top:

```typescript
import type {
  ProjectType, GameConfig, WebAppConfig, BackendConfig,
  CliConfig, LibraryConfig, MobileAppConfig,
  DataPipelineConfig, MlConfig, BrowserExtensionConfig,
  ResearchConfig, DataScienceConfig, Web3Config,
} from '../types/index.js'
```

- [ ] **Step 2: Declare the `web3Config` local variable**

The DS branch is the canonical model — read `src/wizard/questions.ts` around line 532-539. Just BEFORE the data-science block, the existing code declares:

```typescript
  // Data science configuration
  let dataScienceConfig: DataScienceConfig | undefined
  if (projectType === 'data-science') {
    // ...
    dataScienceConfig = { audience: 'solo' }
  }
```

Immediately AFTER the closing brace of the data-science `if` block, add a Web3 block mirroring the same pattern:

```typescript
  // Web3 configuration
  let web3Config: Web3Config | undefined
  if (projectType === 'web3') {
    // W3-1 has a single-value enum (`scope`). Skip the interactive question
    // and set the default directly — the wizard presents the type but the
    // follow-up Q&A carries no meaningful options yet. W3-2 will extend this.
    web3Config = { scope: 'contracts' }
  }
```

Exact anchor: the line AFTER the closing brace of the `data-science` `if` block (around line 539).

- [ ] **Step 3: Add `web3Config` to the return literal**

At the bottom of the function (around line 723-728) the return literal currently reads:

```typescript
  return {
    methodology, depth, platforms, traits, projectType,
    webAppConfig, backendConfig, cliConfig,
    libraryConfig, mobileAppConfig, dataPipelineConfig,
    mlConfig, browserExtensionConfig, researchConfig, dataScienceConfig, gameConfig,
  }
```

Add `web3Config` adjacent to `dataScienceConfig`:

```typescript
  return {
    methodology, depth, platforms, traits, projectType,
    webAppConfig, backendConfig, cliConfig,
    libraryConfig, mobileAppConfig, dataPipelineConfig,
    mlConfig, browserExtensionConfig, researchConfig, dataScienceConfig, web3Config, gameConfig,
  }
```

- [ ] **Step 4: Run the D5a test to confirm it PASSES**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/wizard/questions.test.ts -t 'web3' 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 5: Run the full wizard test file to catch regressions**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/wizard/questions.test.ts 2>&1 | tail -15
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/questions.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): add web3 branch to questions flow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D6: Add Web3 spread to `wizard.ts` config assembly

**Files:**
- Modify: `src/wizard/wizard.ts`

- [ ] **Step 1: Locate the config-assembly block**

Open `src/wizard/wizard.ts`. Find the conditional-spread block (around line 130-150). It is a list of spread expressions like:

```typescript
      ...(answers.gameConfig && { gameConfig: answers.gameConfig }),
      ...(answers.webAppConfig && { webAppConfig: answers.webAppConfig }),
      // ...
      ...(answers.dataScienceConfig && { dataScienceConfig: answers.dataScienceConfig }),
```

- [ ] **Step 2: Add the Web3 spread**

After the `dataScienceConfig` spread, add:

```typescript
      ...(answers.web3Config && { web3Config: answers.web3Config }),
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run type-check 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/wizard/wizard.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(wizard): wire web3Config into wizard config assembly

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

- [ ] **Step 2: Add Web3 entries**

In `TYPE_KEY`:

```typescript
  'web3': 'web3Config',
```

In `schemaForType`:

```typescript
  'web3': Web3ConfigSchema,
```

Also add the `Web3ConfigSchema` import at the top if not already present.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run type-check
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
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(adopt): extend TYPE_KEY and schemaForType for web3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase E — Overlay YAML and existing-test verification

### Task E1: Create `content/methodology/web3-overlay.yml`

**Files:**
- Create: `content/methodology/web3-overlay.yml`

- [ ] **Step 0: Verify the structural-eval directory guard exists**

The plan ships the overlay YAML in E1 before Phase F creates `content/knowledge/web3/`. `tests/evals/overlay-structural-coverage.bats` must have a `[[ -d content/knowledge/<type> ]] || continue` guard so it doesn't fail on the missing knowledge dir during the E1-to-F1 window.

```bash
grep -n '\[\[ -d "${PROJECT_ROOT}/content/knowledge/' tests/evals/overlay-structural-coverage.bats
```

Expected: a non-empty match (currently `tests/evals/overlay-structural-coverage.bats:117`).

- **If output is non-empty:** guard exists. Proceed to Step 1.
- **If output is empty:** STOP. Either the guard was removed in a later PR, or the assumption is wrong. Fallback: before committing the overlay YAML in Step 5, run `mkdir -p content/knowledge/web3` and include the empty directory placeholder (e.g. a `.gitkeep`) in the same commit so the structural eval has a directory to find. Document the deviation in the wrap-up.

- [ ] **Step 1: Write the overlay YAML (matches spec §5.2 exactly)**

```yaml
# methodology/web3-overlay.yml
name: web3
description: >
  Web3 overlay — injects smart-contract domain knowledge (EVM chains) into
  existing pipeline steps for contract architecture, security, testing,
  upgradeability, gas optimization, and audit workflow.
project-type: web3

knowledge-overrides:
  # Foundational
  create-prd:            { append: [web3-requirements] }
  user-stories:          { append: [web3-requirements] }
  coding-standards:      { append: [web3-conventions] }
  project-structure:     { append: [web3-project-structure] }
  dev-env-setup:         { append: [web3-dev-environment] }
  git-workflow:          { append: [web3-conventions] }

  # Architecture & Design
  system-architecture:   { append: [web3-architecture, web3-access-control, web3-upgradeability, web3-oracles-and-external-data] }
  tech-stack:            { append: [web3-architecture, web3-dev-environment] }
  adrs:                  { append: [web3-architecture, web3-upgradeability] }
  domain-modeling:       { append: [web3-architecture] }
  api-contracts:         { append: [web3-architecture] }   # contract ABIs are the API surface
  security:              { append: [web3-security, web3-common-vulnerabilities, web3-access-control] }
  operations:            { append: [web3-deployment-and-verification, web3-gas-optimization] }

  # Testing
  tdd:                   { append: [web3-testing] }
  add-e2e-testing:       { append: [web3-testing] }        # fork tests = e2e for contracts
  create-evals:          { append: [web3-testing, web3-common-vulnerabilities] }

  # Reviews
  review-architecture:   { append: [web3-architecture, web3-access-control, web3-upgradeability] }
  review-api:            { append: [web3-architecture] }
  review-security:       { append: [web3-security, web3-common-vulnerabilities, web3-audit-workflow] }
  review-operations:     { append: [web3-deployment-and-verification, web3-gas-optimization] }
  review-testing:        { append: [web3-testing, web3-audit-workflow] }

  # Planning
  implementation-plan:   { append: [web3-architecture] }
```

- [ ] **Step 2: Run `scaffold build`**

Per the project feedback memory, `content/pipeline/` and `content/knowledge/` changes require a build. Overlay YAML changes may or may not — run anyway to be safe:

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run build && node dist/index.js build 2>&1 | tail -10
```

(If the binary layout differs, substitute the correct invocation; check `package.json` scripts.)

- [ ] **Step 3: Verify the packaging test passes**

The DS PR already shipped `tests/packaging/project-type-overlay-alignment.test.ts` which iterates `ProjectTypeSchema.options`. With `'web3'` in the enum (from Task A1) and `web3-overlay.yml` on disk, the test should pass:

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run tests/packaging/project-type-overlay-alignment.test.ts 2>&1 | tail -15
```

Expected: all ProjectType values PASS, including `web3`.

- [ ] **Step 4: Verify the structural eval passes**

The DS PR already shipped `tests/evals/overlay-structural-coverage.bats` which filters overlays by `project-type:` frontmatter presence. With the new overlay shipping that field, the structural eval auto-covers it:

```bash
cd /Users/kenallred/dev-projects/scaffold && bats tests/evals/overlay-structural-coverage.bats 2>&1 | tail -20
```

Expected: all assertions PASS. The knowledge-entry existence assertion has a directory-existence guard (`[[ -d ... ]] || continue`), so the `web3/` knowledge dir not yet existing is fine — Phase F will land it and the assertion will fire then.

- [ ] **Step 5: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/methodology/web3-overlay.yml
git -C /Users/kenallred/dev-projects/scaffold commit -m "feat(overlay): add web3-overlay.yml with knowledge-overrides

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase F — Knowledge documents

14 knowledge docs for `web3/`. Each is a separate task for reviewability. Author to match the style of `content/knowledge/ml/ml-experiment-tracking.md` (opinionated, code-heavy, 150-300 lines). No lockstep-pair README is required for Web3 (it has no overlapping knowledge directory analogous to `ml/` ↔ `data-science/`), and so this phase has no F1/F2 README tasks.

Before each doc: open an existing reference doc to remember the shape. Every doc must have frontmatter:

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

**For each knowledge doc, follow this four-step pattern exactly:**

1. **Read** the single named reference doc listed for that task.
2. **Write** the new file at the target path with proper frontmatter (`name` / `description` / `topics`), an opening framing paragraph, a `## Summary` section, and a `## Deep Guidance` section with subsections that include code blocks.
3. **Verify** the file with these shell checks. **Substitution rule:** each F1-F14 task lists its required keywords in the task body under a `Required keywords:` line. Copy them into the for-loop below as quoted strings, one per keyword.

   ```bash
   FILE="/Users/kenallred/dev-projects/scaffold/<target-path>"
   # Length check: 150-300 lines
   lines=$(wc -l < "$FILE"); [[ $lines -ge 150 && $lines -le 300 ]] && echo "OK lines=$lines" || echo "FAIL lines=$lines"
   # Frontmatter check
   head -5 "$FILE" | grep -q '^name:' && echo "OK name" || echo "FAIL name"
   head -5 "$FILE" | grep -q '^description:' && echo "OK description" || echo "FAIL description"
   # Required keywords (one grep per required keyword — all must return hit).
   # WORKED EXAMPLE — if Task F1 says "Required keywords: invariants, threat model, trust assumptions",
   # substitute the keywords into the loop literally:
   #     for kw in "invariants" "threat model" "trust assumptions"; do ... ; done
   # Below is the template — replace the `<keyword1>` etc. with the actual keywords for the task at hand:
   for kw in "<keyword1>" "<keyword2>" "<keyword3>"; do
     grep -qF "$kw" "$FILE" && echo "OK $kw" || echo "FAIL $kw"
   done
   ```
   If any check returns FAIL, extend the doc until all checks pass — do NOT commit a failing doc.
4. **Commit** with the single-line message shown in the task.

**Style model:** every task lists one reference doc to read. Open ONLY that reference — don't browse `content/knowledge/` for alternatives. The Phase G eval (keyword presence) enforces the required keywords; pass the Step 3 verification before moving on.

**Frontmatter template for every doc:**

```markdown
---
name: <slug>
description: <one line, 1-200 chars>
topics: [<topic1>, <topic2>, ...]
---

<Opening framing paragraph — why this matters, 2-4 sentences, names the audience>

## Summary

<3-5 sentences. Opinionated, specific. Names the primary tool picks.>

## Deep Guidance

### <Subsection 1>

<Prose with code block examples.>

### <Subsection 2>

<Prose with code block examples.>

<... more subsections as needed, keep total file 150-300 lines>
```

---

### Task F1: `web3-requirements.md`

**Files:**
- Create: `content/knowledge/web3/web3-requirements.md`

- [ ] **Step 1: Reference**

Open `content/knowledge/ml/ml-requirements.md` for shape.

- [ ] **Step 2: Write the doc**

Topic: PRD shape for a smart-contract / protocol project — what "done" looks like when the artifact is a deployed contract. Cover: invariants the contract must hold (e.g. "total supply never exceeds cap"), threat model (who is trusted, who is hostile, what they can do), trust assumptions (oracles, multisig signers, governance), value at risk, upgrade story.

Required keywords: `invariants`, `threat model`, `trust assumptions`.

- [ ] **Step 3: Verify with the verification block (see Phase F preamble).**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-requirements.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-requirements.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F2: `web3-conventions.md`

**Files:**
- Create: `content/knowledge/web3/web3-conventions.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-conventions.md`.

- [ ] **Step 2: Write**

Topic: Solidity style and conventions. Cover: `forge fmt` for formatting (single-tool standard); NatSpec doc comments on every external/public function; pragma pinning (`pragma solidity 0.8.24;` — exact version, NOT a caret range, for contracts that will be deployed); function ordering (constructor → external → public → internal → private; view/pure separated within each); state variable naming (`s_` prefix for storage, `i_` for immutable, `_` for private — pick one convention and document it); explicit visibility on every function and state variable; the Solidity style guide as the upstream reference.

Required keywords: `forge fmt`, `NatSpec`, `pragma`, `0.8`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-conventions.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-conventions.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F3: `web3-project-structure.md`

**Files:**
- Create: `content/knowledge/web3/web3-project-structure.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-project-structure.md`.

- [ ] **Step 2: Write**

Foundry directory layout: `src/` (contracts), `test/` (forge tests, `*.t.sol`), `script/` (deploy scripts, `*.s.sol`), `lib/` (forge-installed dependencies, gitignored at the dep level but `lib/forge-std` and friends are checked in via submodules per Foundry convention), `broadcast/` (deploy artifacts — committed for audit trail), `docs/` (auto-generated NatSpec + human docs), `foundry.toml` at root, `remappings.txt` if needed. Discuss the `out/` and `cache/` directories (build artifacts, gitignored). Mention Hardhat layout as alternative (`contracts/`, `test/`, `scripts/`, `artifacts/`) without endorsing it as primary.

Required keywords: `src/`, `test/`, `script/`, `foundry.toml`, `broadcast/`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-project-structure.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-project-structure.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F4: `web3-dev-environment.md`

**Files:**
- Create: `content/knowledge/web3/web3-dev-environment.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-dev-environment.md`.

- [ ] **Step 2: Write**

Local toolchain. Tools: `Foundry` (primary — `forge` for build/test, `cast` for RPC, `anvil` for local node); `foundry-toolchain` GitHub Action for CI; `forge-std` as the testing utility library. Include: install snippet (`curl -L https://foundry.paradigm.xyz | bash && foundryup`); a minimal `foundry.toml` example; a one-liner local fork (`anvil --fork-url $MAINNET_RPC`); the recommended `.envrc` shape for `MAINNET_RPC`, `ETHERSCAN_API_KEY`, etc.; setting Solidity version via `foundry.toml` (`solc_version = "0.8.24"`). Mention Hardhat as an alternative for teams already on it, but make `Foundry` the primary pick.

Required keywords: `Foundry`, `forge`, `anvil`, `cast`, `forge-std`, `foundry.toml`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-dev-environment.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-dev-environment.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F5: `web3-security.md`

**Files:**
- Create: `content/knowledge/web3/web3-security.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-security.md` for shape (not topic).

- [ ] **Step 2: Write**

Layered security practices for contracts. Cover: Checks-Effects-Interactions ordering (with a vulnerable + fixed code snippet pair); pull-payment pattern (sender drains a credit balance instead of contract pushing ether); using OpenZeppelin Contracts as baseline (`AccessControl`, `Ownable2Step`, `ReentrancyGuard`, `Pausable`); the principle of least privilege on roles; immutability of contract addresses for sensitive deps; `revert` for unrecoverable state, never silent failures; explicit return-value checks on low-level calls. End with a checklist that links forward to `web3-common-vulnerabilities` for the SWC-style enumeration. Mention `reentrancy` explicitly as the canonical example.

Required keywords: `reentrancy`, `Checks-Effects-Interactions`, `OpenZeppelin`, `ReentrancyGuard`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-security.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-security.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F6: `web3-testing.md`

**Files:**
- Create: `content/knowledge/web3/web3-testing.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-testing.md`.

- [ ] **Step 2: Write**

Testing discipline. Cover: unit tests with `forge test` (each test contract follows the `*.t.sol` naming, inheriting from `forge-std/Test.sol`); fuzz tests with `--fuzz` (parameterized inputs sampled by the engine — show a fuzz signature and a `vm.assume()` constraint); invariant tests with `--invariant` (stateful sequence testing against a handler contract — show a minimal handler); fork tests with `--fork-url $MAINNET_RPC` for integration against deployed protocols; coverage via `forge coverage`; gas reports via `forge test --gas-report`. Include a complete minimal `.t.sol` skeleton.

Required keywords: `forge test`, `--fuzz`, `--invariant`, `--fork-url`, `forge coverage`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-testing.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-testing.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F7: `web3-architecture.md`

**Files:**
- Create: `content/knowledge/web3/web3-architecture.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-architecture.md`.

- [ ] **Step 2: Write**

Modular vs monolithic contract design, library use, state minimization. Tool picks: `OpenZeppelin Contracts` as the baseline dependency for ERC standards, AccessControl, and proxies; diamond pattern only when justified (multiple facets exceeding the 24kb contract size limit). Discuss: external/internal libraries (`using ... for ...`); inheritance vs composition; minimal proxies (EIP-1167) for cheap deployment of many identical contracts; the 24kb contract size limit and how to fall under it; explicit **EVM-only scope call**: non-EVM chains (Solana, Move-based) are NOT covered by this overlay. State minimization (every SSTORE costs 20k+ gas cold, 2.9k warm — design to minimize).

Required keywords: `OpenZeppelin`, `modular`, `EVM`, `library`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-architecture.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-architecture.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F8: `web3-access-control.md`

**Files:**
- Create: `content/knowledge/web3/web3-access-control.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-security.md` for shape.

- [ ] **Step 2: Write**

Ownership and role management. Tools: `OpenZeppelin AccessControl` (role-based, granular — preferred over single-owner for any non-trivial protocol); `Ownable2Step` (two-step ownership transfer — prevents accidental transfer to a wrong address); `Safe` (formerly Gnosis Safe) for multisig wallets fronting privileged roles; timelock contracts (`TimelockController`) gating governance actions. Cover: defining custom roles (`bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE")`); `grantRole` / `revokeRole` flow; renouncing roles post-deploy where appropriate; 2-step ownership transfer pattern with code; default-admin-role security; multisig threshold selection (m-of-n).

Required keywords: `AccessControl`, `Safe`, `Ownable2Step`, `timelock`, `multisig`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-access-control.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-access-control.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F9: `web3-upgradeability.md`

**Files:**
- Create: `content/knowledge/web3/web3-upgradeability.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-architecture.md` for shape.

- [ ] **Step 2: Write**

Proxy patterns and storage hazards. Tools: `OpenZeppelin Upgrades` library + `OpenZeppelin Contracts Upgradeable`; UUPS proxy preferred (the upgrade logic lives in the implementation, so removing it removes upgradeability); the storage-gap pattern (`uint256[50] private __gap`) for safe inheritance; "don't upgrade if you don't have to" as the primary recommendation (immutability is a security feature). Cover: how proxy storage works (storage layout pinned to slot positions); collision hazards when changing or reordering storage variables; the `initialize()` function replacing `constructor()` in upgradeable contracts; verification via `forge inspect` + `@openzeppelin/upgrades-core` storage-layout checks; transparent proxy vs UUPS vs beacon — when each is appropriate.

Required keywords: `UUPS`, `storage gap`, `OpenZeppelin Upgrades`, `proxy`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-upgradeability.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-upgradeability.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F10: `web3-gas-optimization.md`

**Files:**
- Create: `content/knowledge/web3/web3-gas-optimization.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-training-patterns.md` for shape (not topic).

- [ ] **Step 2: Write**

Practical gas optimizations. Cover: storage packing (multiple values into a single 32-byte slot — `uint128 a; uint128 b;` packs); `unchecked { ... }` blocks for arithmetic the developer has proven won't overflow (saves the post-0.8 overflow check); calldata vs memory for function parameters (calldata is cheaper for read-only external function params); function visibility (`external` is cheaper than `public` for params with calldata); avoiding unbounded loops over storage; `>= 1` instead of `> 0` for unsigned ints; immutable / constant for one-time-set values; the gas-report-driven workflow (`forge test --gas-report` → optimize hotspots only). End with a strong "don't optimize prematurely" caveat — start with correct, measure, then optimize.

Required keywords: `unchecked`, `calldata`, `storage packing`, `gas`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-gas-optimization.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-gas-optimization.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F11: `web3-oracles-and-external-data.md`

**Files:**
- Create: `content/knowledge/web3/web3-oracles-and-external-data.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-observability.md` for shape.

- [ ] **Step 2: Write**

Oracle integration. Tools: `Chainlink` as the primary baseline (largest provider footprint, mature interface — `AggregatorV3Interface` for price feeds). Cover: staleness checks (`updatedAt` from `latestRoundData()` — revert if older than tolerance); decimal handling (each feed has its own `decimals()` — never assume 18); manipulation resistance (avoid `block.timestamp` for pricing; avoid spot AMM prices for high-value paths — prefer TWAP if a DEX is the source); fallback / redundancy (multiple oracle sources, median voting); the "never trust" rule for any data crossing the contract boundary. Include a snippet that wraps `AggregatorV3Interface` with staleness + decimal scaling.

Required keywords: `Chainlink`, `staleness`, `decimals`, `AggregatorV3Interface`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-oracles-and-external-data.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-oracles-and-external-data.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F12: `web3-audit-workflow.md`

**Files:**
- Create: `content/knowledge/web3/web3-audit-workflow.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-experiment-tracking.md` for shape (audit-workflow is process-heavy like experiment-tracking).

- [ ] **Step 2: Write**

Pre-audit readiness and firm selection. Tools: `Slither` (mandatory static analysis — run in CI; treat findings as blocking until triaged); `Echidna` (property-based fuzzing — define invariants in the contract and let Echidna search); `Halmos` (open-source symbolic execution / formal verification — bounded model checking); `Certora` (commercial FV — noted as the heavy-duty option for the highest-value protocols). Firm names to mention as examples without endorsement: Trail of Bits, Consensys Diligence, OpenZeppelin. Cover: pre-audit checklist (100% test coverage on critical paths; `forge coverage` baseline; Slither + Echidna clean; deployed to testnet for 2+ weeks; NatSpec on every external function); how to scope the audit (LOC, contract surface, invariants you want verified); cost expectations; remediation review.

Required keywords: `Slither`, `Echidna`, `Halmos`, `audit`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-audit-workflow.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-audit-workflow.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F13: `web3-common-vulnerabilities.md`

**Files:**
- Create: `content/knowledge/web3/web3-common-vulnerabilities.md`

- [ ] **Step 1: Reference**

`content/knowledge/ml/ml-model-evaluation.md` for shape (checklist-heavy).

- [ ] **Step 2: Write**

SWC-style enumeration with vulnerable + fixed snippets for each. Cover: reentrancy (already in `web3-security.md` — cross-reference; brief recap with `ReentrancyGuard` + CEI fix); front-running / MEV (commit-reveal pattern; use of `block.timestamp` for ordering — wrong); delegatecall hazards (storage layout of caller MUST match callee — explosive bug surface; never delegatecall to attacker-controlled contracts); unchecked external calls (`(bool ok, ) = addr.call{value: amount}(""); require(ok, "transfer failed");` — always check the return value, never assume success); signature replay (use EIP-712 typed data + nonces; never replay across chains — include `block.chainid`); DoS via unbounded arrays (any loop over user-controlled storage is a gas-bomb vector — pull-payment / paginated patterns instead); integer over/underflow (mostly handled in 0.8.x but still possible inside `unchecked`).

Required keywords: `reentrancy`, `EIP-712`, `delegatecall`, `replay`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-common-vulnerabilities.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-common-vulnerabilities.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F14: `web3-deployment-and-verification.md`

**Files:**
- Create: `content/knowledge/web3/web3-deployment-and-verification.md`

- [ ] **Step 1: Reference**

`content/knowledge/data-pipeline/data-pipeline-quality.md` for shape (operations doc).

- [ ] **Step 2: Write**

Deployment scripts, verification, multi-chain, post-deploy hardening. Tools: `forge script` (preferred over Hardhat scripts — Solidity, type-safe, run against `--rpc-url` with `--broadcast` for actual send); `broadcast/` artifacts (committed to the repo as an audit trail of every chain/address pair); `etherscan-verify` via `forge verify-contract` (or `--verify` on the script — Etherscan-compatible block explorers for any EVM chain); multi-chain deploys (deterministic addresses via CREATE2; or separate `script/Deploy{Chain}.s.sol` per network); post-deploy hardening (transfer ownership to multisig immediately; set up timelock on privileged functions; renounce default admin role if not needed; assign roles per least-privilege principle). End with the pre-deploy checklist that hooks into `web3-audit-workflow`.

Required keywords: `forge script`, `Etherscan`, `verify`, `timelock`, `broadcast`.

- [ ] **Step 3: Verify with the verification block.**

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add content/knowledge/web3/web3-deployment-and-verification.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(knowledge): add web3-deployment-and-verification.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task F15: Verify structural eval passes with knowledge docs in place

**Files:**
- None (verification only)

- [ ] **Step 1: Run `scaffold build`**

```bash
cd /Users/kenallred/dev-projects/scaffold && npm run build && node dist/index.js build 2>&1 | tail -10
```

(Substitute the correct build invocation if different.)

- [ ] **Step 2: Run the structural eval — should PASS now**

```bash
cd /Users/kenallred/dev-projects/scaffold && bats tests/evals/overlay-structural-coverage.bats 2>&1 | tail -20
```

Expected: all assertions PASS. The knowledge-entry existence assertion now fires for `web3/` (the directory exists with 14 docs) and finds every entry referenced by `web3-overlay.yml`.

- [ ] **Step 3: Run `knowledge-quality.bats` — orphan check must pass**

```bash
cd /Users/kenallred/dev-projects/scaffold && bats tests/evals/knowledge-quality.bats 2>&1 | tail -10
```

Expected: PASS — every new Web3 knowledge doc is referenced by `web3-overlay.yml`.

- [ ] **Step 4: No commit — verification task only.**

---

## Phase G — Per-overlay content eval

### Task G1: Create `tests/evals/web3-overlay-content.bats`

**Files:**
- Create: `tests/evals/web3-overlay-content.bats`

- [ ] **Step 1: Write the eval**

```bash
#!/usr/bin/env bats
# tests/evals/web3-overlay-content.bats
#
# Keyword-presence spot checks for web3 knowledge docs. Guards against
# a future edit hollowing out a document. NOT a substitute for human review.

PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
KB_DIR="${PROJECT_ROOT}/content/knowledge/web3"

@test "web3-security mentions reentrancy" {
  grep -q 'reentrancy' "${KB_DIR}/web3-security.md"
}

@test "web3-audit-workflow mentions Slither" {
  grep -q 'Slither' "${KB_DIR}/web3-audit-workflow.md"
}

@test "web3-testing mentions forge" {
  grep -q 'forge' "${KB_DIR}/web3-testing.md"
}

@test "web3-access-control mentions Safe" {
  grep -q 'Safe' "${KB_DIR}/web3-access-control.md"
}

@test "web3-conventions mentions forge fmt" {
  grep -q 'forge fmt' "${KB_DIR}/web3-conventions.md"
}

@test "web3-dev-environment mentions Foundry" {
  grep -q 'Foundry' "${KB_DIR}/web3-dev-environment.md"
}

@test "web3-upgradeability mentions UUPS" {
  grep -q 'UUPS' "${KB_DIR}/web3-upgradeability.md"
}

@test "web3-oracles-and-external-data mentions Chainlink" {
  grep -q 'Chainlink' "${KB_DIR}/web3-oracles-and-external-data.md"
}

@test "web3-gas-optimization mentions unchecked" {
  grep -q 'unchecked' "${KB_DIR}/web3-gas-optimization.md"
}

@test "web3-common-vulnerabilities mentions EIP-712" {
  grep -q 'EIP-712' "${KB_DIR}/web3-common-vulnerabilities.md"
}

@test "web3-deployment-and-verification mentions Etherscan" {
  grep -q 'Etherscan' "${KB_DIR}/web3-deployment-and-verification.md"
}

@test "web3-requirements mentions invariants" {
  grep -q 'invariants' "${KB_DIR}/web3-requirements.md"
}

@test "web3-project-structure mentions foundry.toml" {
  grep -q 'foundry.toml' "${KB_DIR}/web3-project-structure.md"
}

@test "web3-architecture mentions OpenZeppelin" {
  grep -q 'OpenZeppelin' "${KB_DIR}/web3-architecture.md"
}
```

- [ ] **Step 2: Run the eval**

```bash
cd /Users/kenallred/dev-projects/scaffold && bats tests/evals/web3-overlay-content.bats 2>&1 | tail -15
```

Expected: all 14 tests PASS (one per knowledge doc; matches the 14-doc scope of Phase F).

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add tests/evals/web3-overlay-content.bats
git -C /Users/kenallred/dev-projects/scaffold commit -m "test(evals): add keyword-presence content eval for web3 knowledge

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase H — E2E test extension

### Task H1: Extend `src/e2e/project-type-overlays.test.ts` with a Web3 block

**Files:**
- Modify: `src/e2e/project-type-overlays.test.ts`

- [ ] **Step 1: Read the existing file**

The file uses sibling `describe` blocks per project type. Use Read on `/Users/kenallred/dev-projects/scaffold/src/e2e/project-type-overlays.test.ts` to internalize the shape. Focus on:

- The `resolveProjectOverlay(projectType, methodology)` helper at the top (line 100ish — the union of project types).
- The existing `data-science overlay integration` describe block (line 1774+).
- Imports / helpers available.

Key helper facts (synchronous, not async — do NOT add `await` before `loadOverlay` or `resolveOverlayState`):
- `loadOverlay(overlayPath)` returns `{ overlay, errors }` (sync).
- `resolveOverlayState({ config, methodologyDir, metaPrompts, presetSteps, output })` (sync).
- `loadConfig(tmpDir, [])` returns `{ config, errors, warnings }`.
- Knowledge shape: `overlayState.knowledge['step-name']` is a `string[]` (Record<string, string[]>), NOT a Map — use bracket access, not `.get()`.
- Config is written to `.scaffold/config.yml`, not `config.yml` at root.

**Scope note:** mirror the DS block's 8-test shape exactly. Do NOT add init/runWizard or YAML round-trip tests — those add flag-shape setup that Web3-1 doesn't need.

- [ ] **Step 2: Update `resolveProjectOverlay` to accept `'web3'`**

Add `'web3'` to the union:

```typescript
async function resolveProjectOverlay(
  projectType: 'web-app' | 'backend' | 'cli' | 'library' | 'mobile-app'
    | 'data-pipeline' | 'ml' | 'browser-extension' | 'research' | 'data-science'
    | 'web3',
  methodology: 'deep' | 'mvp' = 'deep',
): Promise<{ overlayState: OverlayState; realMetaPrompts: Map<string, MetaPromptFile> }> {
```

- [ ] **Step 3: Add the `web3 overlay integration` describe block (8 tests)**

Insert the EXACT block below after the `data-science overlay integration` describe block, before the closing bracket of the outer `describe`:

```typescript
describe('web3 overlay integration', () => {
  let tmpDir: string
  beforeEach(() => { tmpDir = makeTempDir() })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('web3 config with web3Config validates through ConfigSchema', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'web3',
        web3Config: { scope: 'contracts' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const project = result.data.project as Record<string, unknown>
      expect(project['projectType']).toBe('web3')
      const w3 = project['web3Config'] as Record<string, unknown>
      expect(w3['scope']).toBe('contracts')
    }
  })

  it('web3 overlay loads without errors', () => {
    const methodologyDir = getPackageMethodologyDir()
    const overlayPath = path.join(methodologyDir, 'web3-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('web3')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(0)
  })

  it('overlay injects web3-architecture into system-architecture step', async () => {
    const { overlayState } = await resolveProjectOverlay('web3')
    expect(overlayState.knowledge['system-architecture']).toContain('web3-architecture')
  })

  it('overlay injects web3-architecture + web3-dev-environment into tech-stack step', async () => {
    const { overlayState } = await resolveProjectOverlay('web3')
    expect(overlayState.knowledge['tech-stack']).toContain('web3-architecture')
    expect(overlayState.knowledge['tech-stack']).toContain('web3-dev-environment')
  })

  it('overlay injects web3-testing into TDD step', async () => {
    const { overlayState } = await resolveProjectOverlay('web3')
    expect(overlayState.knowledge['tdd']).toContain('web3-testing')
  })

  it('overlay injects web3 knowledge into foundational steps', async () => {
    const { overlayState } = await resolveProjectOverlay('web3')
    expect(overlayState.knowledge['create-prd']).toContain('web3-requirements')
    expect(overlayState.knowledge['coding-standards']).toContain('web3-conventions')
    expect(overlayState.knowledge['project-structure']).toContain('web3-project-structure')
  })

  it('overlay injects security knowledge into security and review-security steps', async () => {
    const { overlayState } = await resolveProjectOverlay('web3')
    expect(overlayState.knowledge['security']).toEqual(
      expect.arrayContaining([
        'web3-security',
        'web3-common-vulnerabilities',
        'web3-access-control',
      ]),
    )
    expect(overlayState.knowledge['review-security']).toEqual(
      expect.arrayContaining([
        'web3-security',
        'web3-common-vulnerabilities',
        'web3-audit-workflow',
      ]),
    )
  })

  it('overlay is knowledge-only (no step-overrides, no cross-reads-overrides)', () => {
    const methodologyDir = getPackageMethodologyDir()
    const overlayPath = path.join(methodologyDir, 'web3-overlay.yml')
    const { overlay } = loadOverlay(overlayPath)
    expect(overlay).not.toBeNull()
    expect(Object.keys(overlay!.stepOverrides)).toHaveLength(0)
    expect(Object.keys(overlay!.crossReadsOverrides)).toHaveLength(0)
  })
})
```

(8 tests total.)

- [ ] **Step 4: Run the E2E test**

```bash
cd /Users/kenallred/dev-projects/scaffold && npx vitest run src/e2e/project-type-overlays.test.ts 2>&1 | tail -20
```

Expected: all tests PASS, including the new `web3 overlay integration` block.

- [ ] **Step 5: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add src/e2e/project-type-overlays.test.ts
git -C /Users/kenallred/dev-projects/scaffold commit -m "test(e2e): exercise web3 overlay through config/load/inject

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase I — Docs

### Task I1: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Find the project-type list**

```bash
grep -n "project-type\|project type\|data-science\|browser-extension" /Users/kenallred/dev-projects/scaffold/README.md | head -20
```

- [ ] **Step 2: Add `web3` to the project-type enumeration(s)**

Add `web3` in the same style as the existing entries (alphabetical or by category, whichever the list uses). Use the same descriptor style as `data-science` — e.g. "Web3 / smart contracts (EVM) — Solidity / Foundry projects".

- [ ] **Step 3: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add README.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(readme): add web3 to project-type list

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task I2: Update `docs/roadmap.md`

**Files:**
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Add v3.27.0 entry under "Completed Releases"**

Compute the ISO date at commit time so the entry doesn't need a date backfill in Task J4:

```bash
ISO_DATE=$(date -u +%Y-%m-%d)
echo "ISO_DATE=$ISO_DATE"
```

Determine the PR number with `gh pr view --json number -q .number` (after Task J2 opens the PR) and return to edit this entry before merging. If you are running this task before J2, use a `PR #TBD` marker and set a reminder to backfill the PR number after `gh pr create`. (Only the PR-number backfill is needed in J4 — the date is final on the I2 commit.)

Insert above the current latest entry (which after v3.26.0 should be v3.26.0 — confirm by reading the top of `docs/roadmap.md` first). Substitute `$ISO_DATE` literally into the entry below:

```markdown
### v3.27.0 ($ISO_DATE)

Web3 Project-Type Overlay — `scaffold init --project-type web3` targets teams shipping smart contracts and protocols on EVM chains with 14 knowledge documents covering Solidity conventions, Foundry workflow, security layering, testing (fuzz / invariant / fork), upgradeability, gas optimization, oracle integration, audit workflow, common vulnerabilities, access control, and deployment / verification. Implements roadmap "Content & Quality > New Project Type Overlays" for the W3-1 audience; W3-2 (web3 application / dApp) and non-EVM chains deferred to backlog.

- **New overlay**: `content/methodology/web3-overlay.yml` injects 14 Web3 knowledge docs into 22 universal pipeline steps.
- **Forward-compatible schema**: `Web3Config.scope: 'contracts'` with `.default('contracts')` — W3-2 will extend the enum additively.
- **Medium-tier detector**: surfaces Web3 repos via `foundry.toml` or `hardhat.config.{ts,js,cjs,mjs}` at medium tier; `remappings.txt` and `lib/forge-std` count as supplementary low-tier evidence.
- **Wiring**: schema + validator + detector + wizard copy + adopt mapping. Generic packaging test, structural eval, and detector-coverage test (all shipped in v3.23.0 DS PR) auto-cover Web3 without code changes.
- **Library collision guard**: regression test pins typical Hardhat / Foundry shapes to resolve as `web3` (not `library`).
- **Review discipline**: 4-round spec MMR + 3-round plan MMR (Codex + Claude + Gemini-compensating) + 3-channel PR MMR. PR #<NUMBER>.
```

**Backfill rule**: after `gh pr create` in Task J2, amend this entry with the real PR number via a separate commit on the same branch. The ISO date is set at I2 commit time (not deferred) — no date backfill in J4.

- [ ] **Step 2: Move "Blockchain/Web3" out of "Content & Quality > New Project Type Overlays"**

Find the "New Project Type Overlays" block under "Content & Quality" (around line 152-159 of `docs/roadmap.md`):

```markdown
### New Project Type Overlays

The overlay system supports any project type. Potential additions:

- **IoT/Embedded** — firmware lifecycle, OTA updates, device provisioning
- **Blockchain/Web3** — smart contract lifecycle, gas optimization, audit workflows
```

Remove the "Blockchain/Web3" bullet so the block becomes:

```markdown
### New Project Type Overlays

The overlay system supports any project type. Potential additions:

- **IoT/Embedded** — firmware lifecycle, OTA updates, device provisioning
```

- [ ] **Step 3: Add Web3 backlog entries to "Backlog / Later"**

Find the "Backlog / Later" section (around line 198-202). It currently contains DS-2 only. Add two Web3 entries below DS-2:

```markdown
- **W3-2 — Web3 application / dApp**: extends `Web3Config.scope` with `'dapp'` discriminator; covers frontend wallet integration (wagmi / RainbowKit / viem), transaction UX, error decoding, EIP-1193 / EIP-6963, sign-in-with-ethereum (EIP-4361), and subgraph indexing. Distinct from W3-1 — dApp work consumes contracts but doesn't ship them.
- **Non-EVM chains (Solana, Move-based)**: requires a separate detector + knowledge surface (Anchor / SPL for Solana; Sui / Aptos with Move). Out of scope for W3-1 / W3-2 — would be its own overlay with no overlap.
```

- [ ] **Step 4: Update the knowledge-doc count table**

Find the "Knowledge Document Expansion" table (around line 165-184). Add a row for Web3 in alphabetical position (between "Validation" and other entries — or wherever fits the table's actual ordering):

```markdown
| Web3 | 14 |
```

Match the existing row format. If the table is sorted by count or by name, follow that order.

- [ ] **Step 5: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add docs/roadmap.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(roadmap): log v3.27.0 web3 overlay; add W3-2 and non-EVM to backlog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task I3: Update `CHANGELOG.md`

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the v3.27.0 entry**

Compute the ISO date at commit time so the entry doesn't need a date backfill in Task J4:

```bash
ISO_DATE=$(date -u +%Y-%m-%d)
echo "ISO_DATE=$ISO_DATE"
```

Add at the top of the changelog (immediately below `## [Unreleased]`), matching the existing format. Substitute `$ISO_DATE` literally into the heading:

```markdown
## [3.27.0] — $ISO_DATE

### Added

- `web3` project-type overlay for smart-contract / EVM protocol work. Includes 14 knowledge documents injected into 22 universal pipeline steps (requirements, conventions, project structure, dev environment, security, testing, architecture, access control, upgradeability, gas optimization, oracles, audit workflow, common vulnerabilities, deployment and verification).
- Medium-tier brownfield detector recognizes Web3 repos via `foundry.toml`, `hardhat.config.{ts,js,cjs,mjs}` signals (medium tier) or `remappings.txt` / `lib/forge-std` (low tier supplementary).
- Forward-compatible `Web3Config.scope` discriminator (default `'contracts'`) so W3-2 (dApp) can extend additively.
- Regression test pinning typical Hardhat / Foundry shapes to resolve as `web3` (not `library`).
- Keyword-presence content eval (`tests/evals/web3-overlay-content.bats`) spot-checks 11 Web3 knowledge docs for required tool mentions.
```

The date is final on this commit — no date backfill in Task J4. Only the PR-number backfill (which can't be known until J2 creates the PR) is needed downstream.

- [ ] **Step 2: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add CHANGELOG.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs(changelog): add v3.27.0 web3 overlay entry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase J — Version bump, verification, PR, review, and release

### Task J0: Bump version to 3.27.0 in the same PR

Per `docs/architecture/operations-runbook.md` §4.2 step 5, the version bump must be on `main` before tagging. The cleanest pattern here is to include the version bump in the Web3 PR — feature and version land together.

> **Note on departure from DS precedent:** Version bump is bundled with the feature PR here (departs from the DS precedent of a separate bump PR — DS shipped via #299 feature + #300 version bump). Both patterns are runbook-compliant; the runbook does not mandate either. Bundling reduces ceremony for single-feature releases. If reviewers prefer the two-PR pattern, split this task into a follow-up bump PR after the feature merges.

**Files:**
- Modify: `package.json`
- Modify: any other version-pinned files in the repo (run a search first to find them all)

- [ ] **Step 1: Find every place the version is pinned**

```bash
cd /Users/kenallred/dev-projects/scaffold && grep -rn '"version":\s*"3\.26\.0"\|3\.26\.0' --include='*.json' --include='*.md' --include='*.ts' --include='*.yml' . 2>/dev/null | head -30
```

Expected hits: `package.json`, possibly `package-lock.json`, possibly `.claude-plugin/plugin.json`, possibly a CLI banner string in `src/`. Document each hit before editing.

- [ ] **Step 2: Bump every occurrence to `3.27.0`**

Use Edit on each file (or `npm version 3.27.0 --no-git-tag-version` for `package.json` + `package-lock.json` together). If a CLI banner / status string exists in `src/`, edit it manually.

```bash
cd /Users/kenallred/dev-projects/scaffold && npm version 3.27.0 --no-git-tag-version
```

(The `--no-git-tag-version` flag suppresses the auto-tag; tagging is Task J4.)

- [ ] **Step 3: Re-run `grep` to confirm no `3.26.0` remains**

```bash
cd /Users/kenallred/dev-projects/scaffold && grep -rn '3\.26\.0' --include='*.json' --include='*.md' --include='*.ts' --include='*.yml' . 2>/dev/null | grep -v '^./CHANGELOG.md' | grep -v '^./docs/roadmap.md' | head
```

(CHANGELOG and roadmap may legitimately reference the old version in historical entries; that is expected. Other hits should be zero.)

- [ ] **Step 4: Commit**

```bash
git -C /Users/kenallred/dev-projects/scaffold add package.json package-lock.json .claude-plugin/plugin.json 2>/dev/null || true
# Add any other files the grep in Step 1 surfaced
git -C /Users/kenallred/dev-projects/scaffold commit -m "chore(release): bump version to 3.27.0

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

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
cd /Users/kenallred/dev-projects/scaffold && git push -u origin feat/web3-overlay
```

- [ ] **Step 2: Open PR with body**

Use the template below:

```bash
gh pr create --title "feat: web3 project-type overlay (v3.27.0)" --body "$(cat <<'EOF'
## Summary

- Ship the \`web3\` project-type overlay targeting smart-contract / EVM protocol work (W3-1).
- 14 knowledge documents + overlay YAML + schema wiring + medium-tier brownfield detector + wizard/adopt integration.
- Forward-compatible \`scope\` discriminator keeps W3-2 (dApp) additive when it lands.
- Library-collision regression test pins typical Hardhat / Foundry shapes to resolve as \`web3\`, not \`library\`.
- Version bumped to v3.27.0 in this PR.
- Pre-existing generic guardrails (packaging test, structural eval, detector-coverage test from v3.23.0 DS PR) auto-cover Web3 with zero new code.

Implements spec: \`docs/superpowers/specs/2026-04-21-data-science-and-web3-overlays-design.md\`.

## Test plan

- [x] \`make check-all\` passes (bash evals + TypeScript typecheck + vitest + bats)
- [x] Existing packaging test (project-type-overlay-alignment) covers \`web3\` automatically
- [x] Existing structural eval (overlay-structural-coverage.bats) covers \`web3\` automatically
- [x] Existing detector-coverage test (coverage.test.ts) extended fixture, now claims \`web3\`
- [x] PROJECT_TYPE_PREFERENCE completeness test covers \`web3\`
- [x] Hardhat / Foundry → web3 regression test prevents library collision
- [x] Keyword-presence content eval spot-checks 11 Web3 knowledge docs for required tool mentions
- [x] E2E test exercises Web3 init → config → overlay resolve → knowledge inject (8 cases)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI**

```bash
cd /Users/kenallred/dev-projects/scaffold && gh pr checks
```

Poll until the `check` job succeeds. Fix CI failures before moving to Task J3.

- [ ] **Step 4: Backfill PR number into `docs/roadmap.md` and `CHANGELOG.md`**

```bash
cd /Users/kenallred/dev-projects/scaffold && PR_NUMBER=$(gh pr view --json number -q .number)
echo "PR number: $PR_NUMBER"
```

Edit `docs/roadmap.md` to replace `PR #<NUMBER>` with the real number; edit `CHANGELOG.md` if the entry references a PR (the v3.27.0 entry template above does not, but add `PR #${PR_NUMBER}` if convention requires it — check the most recent entry in CHANGELOG.md). Commit:

```bash
git -C /Users/kenallred/dev-projects/scaffold add docs/roadmap.md CHANGELOG.md
git -C /Users/kenallred/dev-projects/scaffold commit -m "docs: backfill PR number in roadmap and changelog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git -C /Users/kenallred/dev-projects/scaffold push
```

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

If `mmr` is unavailable, dispatch directly — **all foreground, never `run_in_background`**:

- `codex exec --skip-git-repo-check -s read-only --ephemeral "review PR #$PR_NUMBER …"`
- `NO_BROWSER=true gemini -p "…" --output-format json --approval-mode yolo` (or compensating `claude -p` labelled `[compensating: Gemini-equivalent]` if Gemini auth fails)
- `claude -p "…" --output-format json`

Surface auth failures to the user with recovery commands; do not silently drop a channel. See CLAUDE.md "Mandatory 3-Channel PR Review" for the full protocol.

- [ ] **Step 3: Fix all P0 / P1 / P2 findings**

For each finding, make the fix in a new commit on the same branch. Re-push. Up to 3 fix rounds per CLAUDE.md. If findings persist after 3 rounds, stop and surface to the user.

Per `feedback_fix_all_findings.md`: never defer P2s.

- [ ] **Step 4: Verdict handling**

Proceed only on `pass` or `degraded-pass`. If the review returns `blocked` or `needs-user-decision`, stop and surface the verdict and remaining findings to the user. Do NOT merge automatically.

- [ ] **Step 5: No final commit for this step — findings-driven commits land individually.**

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
cd /Users/kenallred/dev-projects/scaffold && git tag -a v3.27.0 -m "v3.27.0 — web3 project-type overlay"
cd /Users/kenallred/dev-projects/scaffold && git push origin v3.27.0
```

- [ ] **Step 3: Create GitHub release**

```bash
cd /Users/kenallred/dev-projects/scaffold && gh release create v3.27.0 --title "v3.27.0 — web3 project-type overlay" --notes-from-tag
```

(Or write the notes inline with `--notes "$(cat <<'EOF'...EOF)"` to match the CHANGELOG entry.)

- [ ] **Step 4: Verify npm publish + Homebrew workflows**

```bash
cd /Users/kenallred/dev-projects/scaffold && gh run list --workflow=publish.yml --limit 3
cd /Users/kenallred/dev-projects/scaffold && gh run list --workflow=update-homebrew.yml --limit 3
```

Both should complete successfully. If the npm publish fails with auth errors, check the trusted-publisher config in npm package settings (per `CLAUDE.md`).

- [ ] **Step 5: Verify user-facing upgrades**

```bash
npm view @zigrivers/scaffold version
brew info scaffold | head -3
```

Both should report `3.27.0`.

- [ ] **Step 6: No commit — release is tag-driven.**

---

## Wrap-up

After Task J4 completes:

1. Announce completion to the user: PR merged, release tagged, npm + Homebrew verified.
2. Flag any deviations from the plan that surfaced during execution (e.g. a file-path rename, a test pattern that needed adapting).
3. Note any P3 findings deferred to a follow-up issue.
4. Confirm the roadmap "Blockchain/Web3" bullet was removed and the W3-2 / non-EVM backlog entries landed.
