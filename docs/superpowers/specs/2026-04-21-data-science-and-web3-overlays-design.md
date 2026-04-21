# Design — Data Science and Web3 Project-Type Overlays

**Date:** 2026-04-21
**Target releases:** `v3.23.0` (Data Science), `v3.24.0` (Web3)
**Status:** Design — round-4 review findings applied; zero P1 findings remain; ready for final verification

---

## 1. Context & intent

The [roadmap](../../roadmap.md) lists three candidate project-type overlays — IoT/Embedded, Blockchain/Web3, Data Science/Analytics — under "Content & Quality > New Project Type Overlays." This design covers the first two of these to ship:

- **Data Science (DS)** — narrowed to the **solo / small-team** audience (DS-1). Platform-/larger-team data science (DS-2) is deferred to the backlog.
- **Web3** — narrowed to **smart-contract projects on EVM chains** (W3-1). Web3 application / dApp work (W3-2) and non-EVM chains are deferred to the backlog.

The roadmap entry previously said each overlay needs "~10-20 pipeline steps." That wording is stale — project-type overlays can carry `step-overrides` and `knowledge-overrides` (only `cross-reads-overrides` is restricted to structural overlays), but the commonly shipped overlays (web-app, mobile-app, ml, data-pipeline, backend, cli, library, browser-extension, research) use only `knowledge-overrides`; `game-overlay.yml` is the exception, using `step-overrides` to gate game-specific steps. The two overlays in this spec will be **knowledge-injection only** — they do not need new pipeline steps. Extending the architecture to allow overlay-contributed pipeline steps (as opposed to step gating) would be a separate, larger initiative.

## 2. Scope (in / out)

**In scope:**

- Two new project-type overlays: `data-science` and `web3`
- ~12-14 knowledge documents per overlay, following the hybrid backbone-plus-domain pattern
- One overlay YAML per project type, mapping knowledge documents into existing universal pipeline steps
- Full schema and wiring surface update per overlay (see §3.2, §6)
- Low- to medium-confidence brownfield detectors so `scaffold adopt` can surface the new project types (see §6.4)
- Packaging test, structural eval, and per-overlay content evals
- Roadmap / README / CHANGELOG updates
- Two independent PRs shipped sequentially: DS first (v3.23.0), then Web3 (v3.24.0)

**Out of scope:**

- New pipeline steps (knowledge-only model preserved)
- High-confidence / multi-signal detection (low-tier signal is sufficient per §6.4)
- Preset (mvp / deep / custom) changes — presets are project-type-agnostic
- DS-2 (platform / larger team data science) and W3-2 (web3 application / dApp) — deferred to roadmap backlog; §6.1 adds forward-compatible discriminator fields so DS-2/W3-2 can ship as additive sub-overlays rather than breaking changes
- Non-EVM chains (Solana, Move-based) — deferred to roadmap backlog
- IoT/Embedded — remains a roadmap candidate; not covered here
- Any architectural change to allow project-type overlays to contribute pipeline steps, `step-overrides`, or `cross-reads-overrides`

## 3. Architecture

Both overlays follow the existing project-type-overlay pattern used by `web-app`, `mobile-app`, `ml`, `data-pipeline`, `backend`, `cli`, `library`, `game`, `browser-extension`, and `research`. The pattern is broader than "one YAML + some knowledge docs" — it has 10+ TypeScript touchpoints enumerated below.

### 3.1 Files created per overlay (new content + code)

| Path | Purpose |
| --- | --- |
| `content/methodology/{type}-overlay.yml` | Knowledge-override mapping. These two overlays use only `knowledge-overrides` (no `step-overrides`, no `cross-reads-overrides`) even though the overlay loader permits `step-overrides` for project-type overlays — see §1 |
| `content/knowledge/{type}/*.md` | 12-14 knowledge documents following `{type}-{topic}.md` naming |
| `src/config/validators/{type}.ts` | Coupling validator (no-op for initial no-invariant configs) |
| `src/project/detectors/{type}.ts` | Low-confidence brownfield detector |
| `src/project/detectors/{type}.test.ts` | Detector unit tests |
| `src/wizard/copy/{type}.ts` | Wizard copy module |

### 3.2 Files modified per overlay

This is an exhaustive list. Some are compiler-enforced (`Record<ProjectType, …>`, `assertNever` exhaustiveness); others are not. The "Enforcement" column flags which is which — silently-missable edits are the ones most likely to slip through review and fail at runtime.

| Path | Change | Enforcement |
| --- | --- | --- |
| `src/config/schema.ts` | Add enum value to `ProjectTypeSchema`; add `{Type}ConfigSchema` zod object with `.strict()`; add optional `{type}Config` field to both `ServiceSchema` and `ProjectSchema` | Compiler (types) + schema tests |
| `src/types/config.ts` | Export derived `{Type}Config` type; extend `ProjectConfig` and `ServiceConfig` interfaces with optional `{type}Config` field; extend `DetectedConfig` discriminated union | Compiler |
| `src/project/detectors/types.ts` | Extend `DetectionMatch` discriminated union with `{Type}Match` variant following the `MlMatch` pattern (see §6.2) | Compiler |
| `src/config/validators/index.ts` | Register new coupling validator in `ALL_COUPLING_VALIDATORS` | Silently-missable at the cast site, BUT the existing `registry.test.ts:7-12` fails CI if not registered — effectively CI-enforced (see §6.3) |
| `src/project/detectors/index.ts` | Register new detector in the `ALL_DETECTORS` list used by `runDetectors` | Silently-missable — detector list is untyped per-entry, no completeness test exists today. Mitigation: a new `src/project/detectors/coverage.test.ts` asserts every `ProjectType` has a registered detector (see §7.5) |
| `src/wizard/copy/types.ts` | Add `{Type}Copy` mapped-type interface following the `MlCopy` pattern; extend the `ProjectCopyMap` union | Compiler (mapped type forces coverage of every config field) |
| `src/wizard/copy/index.ts` | Register new copy module in `PROJECT_COPY` | Compiler (`Record<ProjectType, …>`) |
| `src/wizard/copy/core.ts` | Add `coreCopy.projectType.options[{type}]` entry — label + description for the new project type in the top-level wizard picker | Compiler (`Record<ProjectType, OptionCopy>` on `CoreCopy.projectType.options`) |
| `src/wizard/questions.ts` | Extend `WizardAnswers`; add project-type branch in the if-chain question flow | Silently-missable — no `assertNever` at the branch site; missing branches produce `*.Config: undefined` which fails Zod at runtime, not compile |
| `src/wizard/wizard.ts` | Add `...(answers.dataScienceConfig && { dataScienceConfig: answers.dataScienceConfig })` / `...(answers.web3Config && { web3Config: answers.web3Config })` to the conditional-spread block assembling `config.project` (the block is NOT a switch — it's a list of spread expressions) | Silently-missable — no enforcement; wizard E2E test exercises the path |
| `src/project/adopt.ts` | Extend `TYPE_KEY` and `schemaForType` maps | Compiler (`Record<ProjectType, …>`) |

**Files NOT modified by DS or Web3 PRs (explicit non-goals for round 1):**

- `src/cli/commands/init.ts` / `src/cli/commands/adopt.ts` — both use `choices: ProjectTypeSchema.options as unknown as string[]`; the enum addition propagates automatically. No edit required.
- `src/cli/init-flag-families.ts` — this file defines per-type CLI flag families (e.g. `--web-rendering`, `--backend-api-style`). DS-1 and W3-1 have single-value-enum configs with no user-facing flag surface yet, so `PartialConfigOverrides`, `detectFamily`, `applyFlagFamilyValidation`, and `buildFlagOverrides` have nothing to extend. Reserved for DS-2 / W3-2 when they introduce flag-configurable fields.
- `src/wizard/flags.ts` — same reason; no new flag interface needed until additional config fields exist.
- `src/config/validators/registry.test.ts` — the existing `registers exactly one validator per ProjectType` assertion already enforces coverage; no spec-authored extension is required.

### 3.3 Files modified once (not per-overlay)

| Path | Change | Which PR |
| --- | --- | --- |
| `tests/packaging/project-type-overlay-alignment.test.ts` (new) | Assert every `ProjectType` enum value has a matching `content/methodology/{type}-overlay.yml` | Created in DS PR, covers both automatically |
| `tests/evals/overlay-structural-coverage.bats` (new) | Generic structural eval for project-type overlays (see §7.3 for scope — deliberately narrower than the existing orphan check in `knowledge-quality.bats`) | Created in DS PR |
| `src/project/detectors/coverage.test.ts` (new) | Detector-registry completeness: assert `ALL_DETECTORS` covers every `ProjectType`. Closes the silent-miss hazard (see §7.5) | Created in DS PR, covers both automatically |
| `src/e2e/project-type-overlays.test.ts` | Extend existing E2E overlay-resolution test with DS / Web3 cases (new overlay loads; knowledge injects into expected steps) | Each PR extends in its own scope |
| `docs/roadmap.md` | Each PR updates in its own scope (completed entry, backlog entry, stale-wording fix) | Both |
| `README.md` | Extend the project-type list | Each PR in own scope |
| `CHANGELOG.md` | One entry per release | Each PR in own scope |

### 3.4 No preset changes

Presets (`mvp.yml`, `deep.yml`, `custom.yml`) are project-type-agnostic: they define `enabled: true/false` for each universal step, independent of project type. Overlays layer knowledge on top after preset resolution.

## 4. Knowledge-document content

Both overlays use the **hybrid backbone-plus-domain** pattern. The backbone (6 docs) maps 1:1 onto universal pipeline-step slots that every project type needs. The domain docs carry the real leverage.

Style matches existing docs (see `content/knowledge/ml/ml-experiment-tracking.md` as a reference): opinionated, code-heavy, 150-300 lines, concrete tool recommendations with 1-line rationale. Frontmatter: `name`, `description`, `topics`.

### 4.1 Data Science overlay — 13 docs

**Project-type slug:** `data-science`

**Scope narrative:** solo or small-team data scientist / analytics engineer building a model, report, or analytical pipeline from scratch, without existing company infrastructure. Targets local-first, reproducibility-first workflows that promote from notebook exploration to shippable pipelines.

**Overlap with existing `ml/` overlay (intentional, managed):** approximately 5 of the 12 `ml/` docs overlap thematically with DS (experiment-tracking, model-evaluation, observability, requirements, conventions). A user selects exactly one project type per project, so DS and ML overlays never compose in the same assembly — the docs never contradict each other at runtime for a given user.

The two overlays target different primary audiences: `ml/` targets production model training and serving systems, `data-science/` targets analytics and prototyping. To prevent long-term drift on the overlapping topics, a `README.md` is added to both `content/knowledge/ml/` and `content/knowledge/data-science/` listing the five lockstep-required document pairs (`*-experiment-tracking.md`, `*-model-evaluation.md`, `*-observability.md`, `*-requirements.md`, `*-conventions.md`). Any edit to one in a pair should trigger a review of its counterpart.

**Backbone (6 docs, map 1:1 onto universal pipeline steps):**

| # | Doc | Purpose | Tool recommendations |
|---|---|---|---|
| 1 | `data-science-requirements` | PRD / user-story shape for a DS project — what "done" looks like for a model or report | — |
| 2 | `data-science-conventions` | Python coding conventions for DS work | `ruff` (lint + Black-compatible format in one tool), type hints encouraged |
| 3 | `data-science-project-structure` | Directory layout | `notebooks/`, `src/`, `data/` (gitignored), `models/`, `reports/`, `tests/`, `configs/` |
| 4 | `data-science-dev-environment` | Local reproducible environment setup | `uv` (package manager), `pyproject.toml`, `direnv`, `pre-commit` |
| 5 | `data-science-security` | PII handling, credential hygiene, dataset access controls | Env-var secrets, 1Password CLI, data-classification basics |
| 6 | `data-science-testing` | Testing strategy for DS code | `pytest` for code; `pandera` for dataframe validation; fixture-driven test data |

**Domain-specific (7 docs):**

| # | Doc | Purpose | Tool recommendations |
|---|---|---|---|
| 7 | `data-science-architecture` | Architecture for solo/small-team DS: local-first, reproducibility-first, notebook→pipeline promotion | `uv` + `Polars` (>1 GB) or `Pandas` (<1 GB) |
| 8 | `data-science-experiment-tracking` | What to log, run comparison, artifact storage | `MLflow` self-hosted (primary); `Weights & Biases` noted as cloud alternative |
| 9 | `data-science-data-versioning` | When and how to version data | `DVC` for >10 GB or binary artifacts; git + Parquet for <1 GB; explicit size-based rule |
| 10 | `data-science-notebook-discipline` | Avoiding hidden state, promoting to scripts | `Marimo` (primary — reactive, git-friendly `.py` format); Jupyter + `jupytext` as fallback |
| 11 | `data-science-model-evaluation` | Metrics, holdout, calibration, error-slicing | sklearn metrics, `sklearn.calibration`, stratified cross-validation |
| 12 | `data-science-reproducibility` | Pinning, seeds, determinism, containerization | `uv` lockfile, `PYTHONHASHSEED`, seed-management pattern, Docker only when OS matters |
| 13 | `data-science-observability` | Model monitoring (basic), data drift, prediction logging | Log to Parquet; `Evidently` (optional) for drift detection |

### 4.2 Web3 overlay — 14 docs

**Project-type slug:** `web3`

**Scope narrative:** team shipping a smart contract, library, or protocol to an EVM chain (Ethereum mainnet, L2s such as Optimism / Arbitrum / Base, or compatible sidechains). Non-EVM targets (Solana, Move-based chains) are out of scope. Web3 applications / dApps that consume contracts but don't ship them are deferred to W3-2.

**Backbone (6 docs):**

| # | Doc | Purpose | Tool recommendations |
|---|---|---|---|
| 1 | `web3-requirements` | PRD shape for a contract / protocol: invariants, threat model, trust assumptions | — |
| 2 | `web3-conventions` | Solidity style: NatSpec, pragma pinning, naming, ordering | `forge fmt`, Solidity style guide, 0.8.x pinning |
| 3 | `web3-project-structure` | Foundry layout | `src/`, `test/`, `script/`, `lib/`, `broadcast/`, `docs/` |
| 4 | `web3-dev-environment` | Local toolchain and node | `Foundry` (forge / cast / anvil), `foundry-toolchain`, `forge-std` |
| 5 | `web3-security` | Layered security practices; secure-by-construction | Checks-Effects-Interactions, pull payments, OpenZeppelin as baseline |
| 6 | `web3-testing` | Testing discipline: unit, fuzz, invariants, fork | `forge test`, `--fuzz`, `--invariant`, `--fork-url`, `forge coverage` |

**Domain-specific (8 docs):**

| # | Doc | Purpose | Tool recommendations |
|---|---|---|---|
| 7 | `web3-architecture` | Modular vs monolithic, library use, state minimization; includes explicit EVM-only scope call | `OpenZeppelin Contracts` as baseline dependency; diamond pattern only when justified |
| 8 | `web3-access-control` | Ownership, roles, multisig, timelock | `OpenZeppelin AccessControl`, `Safe` (multisig), 2-step ownership transfer |
| 9 | `web3-upgradeability` | Proxy patterns, storage hazards | `OpenZeppelin Upgrades` + UUPS preferred; storage-gap pattern; "don't upgrade if you don't have to" |
| 10 | `web3-gas-optimization` | Storage packing, unchecked, calldata vs memory | Post-0.8 `unchecked{}`, function-visibility rules, avoid unbounded loops; don't optimize prematurely |
| 11 | `web3-oracles-and-external-data` | Staleness, decimals, manipulation resistance | `Chainlink` primary; staleness checks; avoid `block.timestamp` for pricing |
| 12 | `web3-audit-workflow` | Pre-audit readiness checklist and firm selection | `Slither` (mandatory static analysis), `Echidna` (property-based fuzzing), `Halmos` (open-source formal verification), `Certora` (commercial FV) noted; Trail of Bits / Consensys style checklist |
| 13 | `web3-common-vulnerabilities` | SWC-level checklist with code examples | Reentrancy, front-running (commit-reveal), delegatecall hazards, unchecked external calls, signature replay (EIP-712 + nonces), DoS via unbounded arrays |
| 14 | `web3-deployment-and-verification` | Deploy scripts, verification, multi-chain, post-deploy hardening | `forge script` + broadcast artifacts, Etherscan verify, timelock on privileged functions, role assignment post-deploy |

## 5. Overlay YAML mappings

Both overlays follow the `ml-overlay.yml` pattern: the `knowledge-overrides` map is authoritative; universal pipeline steps not listed in the map inherit universal content unchanged. No step is "skipped" in the enable/disable sense — project-type overlays cannot gate steps; they only inject knowledge.

### 5.1 `content/methodology/data-science-overlay.yml` (21 steps receive injections)

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

### 5.2 `content/methodology/web3-overlay.yml` (22 steps receive injections)

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

Design notes on the web3 mapping:

- `api-contracts` maps to `web3-architecture` because contract interfaces (ABIs) are the effective API surface for on-chain consumers. This keeps the `api-contracts` prompt substantive for web3 projects rather than silent.
- `add-e2e-testing` maps to `web3-testing` because fork-based integration tests (`forge test --fork-url`) play the role of e2e tests for contracts.

## 6. Schema, wiring, and detector changes

### 6.1 `src/config/schema.ts`

**Staged enum rollout — one enum value per PR** to avoid exposing an enum value before its overlay + packaging test are in place:

```typescript
// DS PR (v3.23.0) — add 'data-science' only:
export const ProjectTypeSchema = z.enum([
  'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
  'data-pipeline', 'ml', 'browser-extension', 'research',
  'data-science',  // NEW — shipped in v3.23.0
])

// Web3 PR (v3.24.0) — add 'web3' on top:
export const ProjectTypeSchema = z.enum([
  ..., 'data-science', 'web3',  // NEW — shipped in v3.24.0
])
```

**New config schemas (forward-compatible discriminators for DS-2 / W3-2):**

DS-2 and W3-2 are deferred, but their eventual shape affects the DS / Web3 schema now. To keep DS-2 / W3-2 additive rather than breaking, the initial schemas include audience / scope discriminators with the current (narrow) value as default. When DS-2 / W3-2 ships, it adds a new enum value to the same field without breaking existing config files.

This mirrors the precedent set by `backend.domain` and `research.domain`.

```typescript
export const DataScienceConfigSchema = z.object({
  // 'solo' = current DS-1 scope (solo / small-team, local-first, prototyping)
  // DS-2 will add 'platform' for platform-engineered / larger-team DS.
  audience: z.enum(['solo']).default('solo'),
}).strict()

export const Web3ConfigSchema = z.object({
  // 'contracts' = current W3-1 scope (smart-contract / protocol projects on EVM)
  // W3-2 will add 'dapp' for web3 application / dApp projects.
  scope: z.enum(['contracts']).default('contracts'),
}).strict()
```

**ServiceSchema and ProjectSchema field additions:**

Both `ServiceSchema` (line 148) and `ProjectSchema` (line 184) list every project type's optional config field explicitly. Both schemas receive a new `dataScienceConfig` field in the DS PR and a `web3Config` field in the Web3 PR:

```typescript
// ServiceSchema additions:
dataScienceConfig: DataScienceConfigSchema.optional(),  // DS PR
web3Config: Web3ConfigSchema.optional(),                 // Web3 PR

// ProjectSchema additions: same two lines.
```

The `ServiceSchema.superRefine` block and `ProjectSchema.superRefine` block iterate `ALL_COUPLING_VALIDATORS`; no edit to these blocks is needed once the new validators are registered (see §6.3).

### 6.2 `src/types/config.ts` and `src/project/detectors/types.ts`

These are two separate types that serve different purposes — don't conflate them.

**`src/types/config.ts`:**

- Export derived types: `export type DataScienceConfig = z.infer<typeof DataScienceConfigSchema>` and `export type Web3Config = z.infer<typeof Web3ConfigSchema>`.
- Extend `ProjectConfig` and `ServiceConfig` TypeScript interfaces with `dataScienceConfig?: DataScienceConfig` / `web3Config?: Web3Config` fields.
- Extend `DetectedConfig` (shape: `{ type: ProjectType; config: ... }`) with new `type` discriminant values `'data-science'` and `'web3'` and matching `config` shapes.

**`src/project/detectors/types.ts`:**

- Extend `DetectionMatch` (shape: `{ projectType; partialConfig; confidence; evidence }`) with `DataScienceMatch` / `Web3Match` variants following the `MlMatch` pattern.

Detector `partialConfig` should **omit** `audience` / `scope` unless signals explicitly support a non-default value. The schema's `.default('solo')` / `.default('contracts')` will materialize the field at Zod-parse time. Writing `audience: 'solo'` in `partialConfig` would imply detector intent the signals don't support.

### 6.3 `src/config/validators/{type}.ts` + registration

Each new project type requires a coupling validator following the pattern in `src/config/validators/ml.ts`. Without this, `configKeyFor('data-science')` returns `undefined` and `ServiceSchema.superRefine`'s forward-rule check reads `svc[undefined]`, silently admitting services with no matching config.

Initial validators are no-op cross-field validators (only the base `configKey ↔ projectType` pairing is enforced) because the initial config schemas carry no cross-field invariants:

```typescript
// src/config/validators/data-science.ts (DS PR)
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
    // No cross-field invariants yet; `audience` has a single value ('solo').
  },
}

// src/config/validators/web3.ts (Web3 PR) — same pattern, 'web3' + 'web3Config'.
```

Register in `src/config/validators/index.ts`:

```typescript
import { dataScienceCouplingValidator } from './data-science.js'  // DS PR
import { web3CouplingValidator } from './web3.js'                  // Web3 PR

export const ALL_COUPLING_VALIDATORS = [
  ...,
  dataScienceCouplingValidator as CouplingValidator<unknown>,   // DS PR
  web3CouplingValidator as CouplingValidator<unknown>,           // Web3 PR
] as const
```

**Completeness enforcement.** `PROJECT_TYPE_TO_CONFIG_KEY` is built via `Object.fromEntries(...) as Readonly<Record<ProjectType, string>>` — the `as` cast suppresses the missing-key compile-time check, so forgetting to register a validator in isolation would fail silently at runtime. However, the existing test at `src/config/validators/registry.test.ts:7-12` already asserts `registeredTypes === schemaTypes` (a strictly stronger "exactly one validator per ProjectType" invariant) — so forgetting to register a new validator will fail CI immediately. **No new test is needed for this** — just ensure the new validator IS registered.

### 6.4 `src/project/detectors/{type}.ts` + registration

Without a detector, `scaffold adopt` will never infer the new project type for a brownfield repository — a DS repo with notebooks + `uv` + Marimo will misdetect as `ml` or `research`; a Foundry repo with `foundry.toml` + `src/*.sol` will misdetect as `library` or get no match. This makes the new project types effectively invisible to the adopt surface.

Minimal low-tier detectors address this. Detectors are pure per-repo functions and do NOT see each other's output — cross-detector disambiguation happens later in `src/project/detectors/resolve-detection.ts` via confidence tier. A low-tier DS match will naturally lose to a medium/high `ml` match via `resolveDetection` Case B/C/D, so no explicit negative-signal logic is needed inside the DS detector itself.

**Data Science detector signals:**

- `dvc.yaml` or `.dvc/config` present → **low** (DVC-managed repo)
- `pyproject.toml` with `marimo` dep → **low** (notebook-tooling match)
- `.marimo.toml` present → **low** (explicit Marimo config)
- `pyproject.toml` with `dvc` dep → **low**
- Returns `null` if none match; returns a low-tier match otherwise.
- `partialConfig`: omit `audience` — the schema's `.default('solo')` will materialize it at Zod-parse time (writing it here would imply unsupported detector intent; see §6.2).

**Web3 detector signals:**

- `foundry.toml` present → **medium** (explicit Foundry project file)
- `hardhat.config.ts` / `hardhat.config.js` present → **medium** (explicit Hardhat config)
- `remappings.txt` present → **low** (Foundry supporting signal)
- `lib/forge-std` directory exists → **low** (Foundry toolchain artifact, via `dirExists`)
- `partialConfig`: omit `scope` for the same reason.

**Signal scope note.** `SignalContext` exposes `listDir(relPath)` (returns depth-1 entries for a given subdir), so `listDir('src').some(n => n.endsWith('.sol'))` would be technically implementable. It's omitted because `foundry.toml` and the Hardhat config already cover the same evidence at equal or higher confidence, and adding the redundant signal would slightly widen the false-positive surface on Solidity repos that are libraries, not projects.

Register detectors in `src/project/detectors/index.ts` in the detector list used by `runDetectors`. Both detectors have tests following the `*.test.ts` sibling convention established by the existing 10 detectors.

### 6.5 Wizard, CLI, and yargs wiring

Each overlay touches the wizard, CLI-command, and flag subsystems the way every other project type does. The `{Type}Copy` type is a mapped type (`{ [K in keyof {Type}Config]: QuestionCopy<...> }`) — it **requires** a copy entry for every config field, even a single-value enum like `audience`. A missing entry breaks `ProjectCopyMap` type-checking.

| File | Change |
| --- | --- |
| `src/wizard/copy/{type}.ts` (new) | New per-type copy module. Must include a per-config-field `audience` / `scope` entry with a single-option map (`{ solo: { label: ... } }` / `{ contracts: { label: ... } }`). The wizard can skip asking the question when only one option exists, but the copy entry is required by the mapped type `DataScienceCopy = { [K in keyof DataScienceConfig]: QuestionCopy<...> }`. |
| `src/wizard/copy/index.ts` | Import the new copy module; add entry to `PROJECT_COPY`. `ProjectCopyMap` (`Record<ProjectType, …>`) forces coverage at compile time. |
| `src/wizard/copy/types.ts` | Add `DataScienceCopy` / `Web3Copy` interfaces following the `MlCopy` mapped-type pattern. |
| `src/wizard/copy/core.ts` | Add `coreCopy.projectType.options[{type}]` entry — the label + description shown in the top-level project-type picker. `CoreCopy.projectType.options` is typed as `Record<ProjectType, OptionCopy>` so this IS compiler-enforced. |
| `src/wizard/questions.ts` | Extend `WizardAnswers`; add `if (projectType === '{type}')` branch in the question flow. No `assertNever` at this site — missing branches produce `*.Config: undefined` at runtime. Mitigation: add a happy-path vitest case that exercises the branch end-to-end. |
| `src/wizard/wizard.ts` | Add a conditional-spread entry in the config-assembly block (the block is a list of spreads, not a switch — see §3.2). |
| `src/project/adopt.ts` | Extend `TYPE_KEY` and `schemaForType` maps (`Record<ProjectType, …>`). Compiler-enforced. |

Initial copy content stays minimal: single-option map for the `audience` / `scope` field, plus the project-type picker entry in `core.ts`. The wizard treats the new project type as presentable but without deep config branching (matching the initial schema's single-value enum field). When DS-2 / W3-2 ships, it extends the enum and adds its new option to the same copy map — additive.

## 7. Testing strategy

### 7.1 New packaging test — `tests/packaging/project-type-overlay-alignment.test.ts`

New sibling to the existing `tests/packaging/domain-overlay-alignment.test.ts`. The existing file asserts that every entry in `backendRealDomains` / `researchRealDomains` has a matching domain-sub-overlay file — that is a different invariant (domain sub-overlays) from the one we are adding (project-type overlays). Stapling onto the domain file conflates two registries; future readers would hit the wrong file when something breaks.

The new test asserts:

> Every `ProjectType` enum value has a matching `content/methodology/{type}-overlay.yml` file that is a regular file.

Created in the DS PR; automatically covers Web3 once `web3` is added to the enum.

### 7.2 Existing evals (no changes needed)

- `tests/evals/knowledge-injection.bats` — walks all knowledge entries generically; auto-covers new docs.
- `tests/evals/pipeline-completeness.bats` — validates referenced steps exist.
- `tests/evals/methodology-content.bats` — existing structural checks continue to apply.
- `tests/evals/knowledge-quality.bats` — **already** asserts "every knowledge entry is referenced by at least one pipeline step, tool, or overlay YAML" (lines 100-131). The new overlay must satisfy this, but no new eval is needed for the orphan check.

### 7.3 New generic eval — `tests/evals/overlay-structural-coverage.bats`

Deliberately scoped narrower than the review draft to avoid duplicating the orphan check already in `knowledge-quality.bats`. Asserts, for every project-type overlay:

- Every step slug referenced in `knowledge-overrides` exists in the universal pipeline
- Every knowledge entry referenced in `knowledge-overrides` exists in `content/knowledge/{type}/`
- Overlay YAML has required frontmatter fields (`name`, `description`, `project-type`)
- `project-type` value matches the filename convention (`{type}-overlay.yml` ↔ `project-type: {type}`)
- Overlay does NOT contain `cross-reads-overrides` (the overlay loader rejects this for project-type overlays; see `src/core/assembly/overlay-loader.ts:260`)

**Do NOT ban `step-overrides`, `reads-overrides`, or `dependency-overrides`** — existing project-type overlays legitimately use them (e.g. `content/methodology/game-overlay.yml` uses `step-overrides`). The overlay loader supports them for project-type overlays; only `cross-reads-overrides` is restricted.

Runs once across all project-type overlays, not per-overlay. Added in the DS PR.

### 7.4 Per-overlay content evals

Two small eval files, each ~5-10 `@test` blocks of keyword-presence sanity checks:

- `tests/evals/data-science-overlay-content.bats` — `data-science-experiment-tracking.md` mentions `MLflow`; `data-science-notebook-discipline.md` mentions `Marimo`; `data-science-data-versioning.md` mentions `DVC`; `data-science-testing.md` mentions `pytest` and `pandera`; etc.
- `tests/evals/web3-overlay-content.bats` — `web3-security.md` mentions `reentrancy`; `web3-audit-workflow.md` mentions `Slither`; `web3-testing.md` mentions `forge`; `web3-access-control.md` mentions `Safe`; etc.

These are cheap guards against a future edit hollowing out a document. Not a substitute for human review.

### 7.5 TypeScript / vitest tests

The highest-risk breakpoints are wizard typing, validator registry completeness, init/adopt wiring, and E2E overlay resolution — not enum membership. Each PR extends or adds:

| Test file | Extension |
| --- | --- |
| `src/config/validators/registry.test.ts` | No spec-authored change — the existing "registers exactly one validator per ProjectType" assertion (lines 7-12) automatically fails CI if the new validator is not registered |
| `src/config/validators/validators.test.ts` | Add per-validator happy-path and error-path cases following existing patterns |
| `src/project/detectors/{type}.test.ts` (new) | Detector unit tests covering each signal + the null path |
| `src/project/detectors/coverage.test.ts` (new) | Detector-registry completeness — assert `ALL_DETECTORS` covers every `ProjectType`. Added in DS PR; auto-covers Web3. No such test exists today; without it, forgetting to register a detector is user-observable only via "`scaffold adopt` always misses" |
| `src/wizard/copy/types.test-d.ts` | Type-level assertions for new copy map entries — confirms mapped-type enforces `audience` / `scope` entry presence |
| `src/wizard/questions.test.ts` | Happy-path branch coverage exercising the new project-type flow (no `assertNever` at the branch site, so branch coverage is the guard) |
| `src/e2e/project-type-overlays.test.ts` | End-to-end overlay resolution — confirm new overlay loads, knowledge injects into the expected steps |

Implementation-time audit: locate any other `switch (projectType)` or `Record<ProjectType, …>` site and verify compiler coverage.

## 8. Release plan

### 8.1 Sequence

1. **Data Science first — v3.23.0.** Smaller blast radius; stress-tests the schema-wiring + detector + overlay pattern and the generic eval.
2. **Reassess.** After DS merges, review what was surprising during authoring and apply lessons to the Web3 plan.
3. **Web3 second — v3.24.0.** Benefits from lessons learned on DS.

Branches may be prepared in parallel worktrees, but PRs merge serially. Each PR is independent; the second PR rebases on the first. Shared files touched by both PRs: `src/config/schema.ts`, `src/types/config.ts`, `src/config/validators/index.ts`, `src/project/detectors/index.ts`, `src/project/detectors/types.ts`, `src/project/detectors/coverage.test.ts`, `src/wizard/copy/index.ts`, `src/wizard/copy/core.ts`, `src/wizard/copy/types.ts`, `src/wizard/questions.ts`, `src/wizard/wizard.ts`, `src/project/adopt.ts`, and `*.test.ts` files that enumerate `ProjectType` (primarily `copy/types.test-d.ts`).

Schema and index-file rebase conflicts are mechanical (append new enum / new import / new registry entry). **Test-matrix conflicts need a line-by-line pass** — multiple test files enumerate `ProjectType` expansions in parallel arrays, and merge tools can silently drop the newer file's additions. Do a focused diff review on the `*.test.ts` rebase.

### 8.2 Per-PR checklist

- Branch from latest `main`
- Implementation follows TDD per `docs/tdd-standards.md`
- Run `scaffold build` after any `content/pipeline/` or `content/knowledge/` change (per project feedback memory)
- Run `make check-all` before pushing
- Push branch, open PR, wait for CI `check` job to pass
- Run the mandatory 3-channel MMR (Codex + Gemini + Claude) per CLAUDE.md; all channels foreground only
- Fix all P0 / P1 / P2 findings before merge; document P3s inline or defer explicitly
- Squash-merge with `gh pr merge --squash --delete-branch`

### 8.3 Release steps (per maintainer flow in `docs/architecture/operations-runbook.md`)

- Update `CHANGELOG.md` and `README.md` for user-facing changes (new project type visible in `scaffold init --type ...` and `scaffold adopt`)
- Merge release-prep to `main`
- Tag `main` with `vX.Y.Z`, push tag
- Create GitHub release
- Verify `publish.yml` npm-publish + Homebrew workflows completed
- Verify `npm update -g @zigrivers/scaffold` and `brew upgrade scaffold`

### 8.4 Roadmap updates

Each PR contributes its own roadmap edits:

- **DS PR:** Move the "Data Science / Analytics" bullet from "Content & Quality > New Project Type Overlays" into "Completed Releases" as `v3.23.0`. Add a new "Backlog / Later" section if one doesn't exist. Add "DS-2 (Platform / larger team data science)" as a backlog entry. Fix the stale "~10-20 pipeline steps" wording — replace with "~12-14 knowledge documents per overlay; project-type overlays are knowledge-injection only."
- **Web3 PR:** Same pattern. Add `v3.24.0` entry to "Completed Releases." Add "W3-2 (Web3 application / dApp)" and "Non-EVM chains (Solana, Move-based)" as backlog entries.

## 9. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| DS docs look thin next to `ml/` because of thematic overlap | Medium | DS narrative stays tightly on solo/small-team; docs cite concrete solo-scale tool recommendations (uv, Marimo) that `ml/` does not; lockstep-pair README in both knowledge dirs prevents drift |
| Long-term drift between `ml/` and `data-science/` overlapping topics | Medium | Documented lockstep-pair README in each knowledge dir; edits to one in a pair should trigger a review of its counterpart |
| Web3 ecosystem shifts quickly; docs go stale | Medium | Recommendations anchor to stable baselines (Foundry, OpenZeppelin, Slither) unlikely to be displaced in 12-18 months; audit-workflow doc lists multiple firms / tools rather than one |
| Staged enum rollout (one value per PR) requires Web3 PR to rebase on DS PR | Low | Explicit release sequencing; Web3 PR's first commit is a rebase; schema conflicts resolve mechanically |
| Detector misfires on non-DS/non-web3 repos | Low | Low-confidence tier; existing detectors (ml, research, etc.) already coexist at medium/high tiers and win via `resolveDetection` |
| Keyword-presence content evals produce false confidence | Low | Evals are spot-checks, not content review; human review + MMR remains the quality gate |
| Someone builds the next overlay (IoT) and forgets an overlay file | Low | New generic eval `overlay-structural-coverage.bats` + new packaging test catch this at CI |
| Forward-compatible discriminators (`audience`, `scope`) lock in a schema shape that DS-2/W3-2 later needs to replace | Low | Enum extension is additive; if DS-2/W3-2 needs a fundamentally different shape (unlikely given `backend.domain` / `research.domain` precedent), the discriminator can be migrated with a config migration — no worse than any other schema evolution |

## 10. Open questions

None at design time. Any issues surfaced during implementation will be raised in the implementation plan or as PR review comments.
