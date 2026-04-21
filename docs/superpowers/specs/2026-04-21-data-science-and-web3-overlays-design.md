# Design — Data Science and Web3 Project-Type Overlays

**Date:** 2026-04-21
**Target releases:** `v3.23.0` (Data Science), `v3.24.0` (Web3)
**Status:** Design approved; ready for implementation planning

---

## 1. Context & intent

The [roadmap](../../roadmap.md) lists three candidate project-type overlays — IoT/Embedded, Blockchain/Web3, Data Science/Analytics — under "Content & Quality > New Project Type Overlays." This design covers the first two of these to ship:

- **Data Science (DS)** — narrowed to the **solo / small-team** audience (DS-1). Platform-/larger-team data science (DS-2) is deferred to the backlog.
- **Web3** — narrowed to **smart-contract projects on EVM chains** (W3-1). Web3 application / dApp work (W3-2) and non-EVM chains are deferred to the backlog.

The roadmap entry previously said each overlay needs "~10-20 pipeline steps." That wording is stale — existing project-type overlays are **knowledge-injection only**; they do not add pipeline steps. This spec explicitly chooses to keep the knowledge-only model (Option A in brainstorming). Extending the architecture to allow overlay-contributed pipeline steps would be a separate, larger initiative.

## 2. Scope (in / out)

**In scope:**

- Two new project-type overlays: `data-science` and `web3`
- ~12-14 knowledge documents per overlay, following the hybrid backbone-plus-domain pattern established by `ml/` and `data-pipeline/`
- One overlay YAML per project type, mapping knowledge documents into existing universal pipeline steps
- TypeScript schema additions: `ProjectType` enum entries, zod config schemas, `DetectedConfig` discriminated-union entries
- Packaging test update to assert every `ProjectType` value has a matching `{type}-overlay.yml`
- New generic eval covering structural overlay correctness (benefits every future overlay)
- Light per-overlay content evals (keyword-presence sanity checks)
- Roadmap / README / CHANGELOG updates
- Two independent PRs shipped sequentially: DS first (v3.23.0), then Web3 (v3.24.0)

**Out of scope:**

- New pipeline steps (knowledge-only model preserved)
- Auto-detection logic for `data-science` or `web3` in `scaffold adopt` — users opt in via `scaffold init --type ...`
- Preset (mvp / deep / custom) changes — presets are project-type-agnostic
- DS-2 (platform / larger team data science), W3-2 (web3 application / dApp), non-EVM chains — deferred to roadmap backlog
- IoT/Embedded — remains a roadmap candidate; not covered here
- Any architectural change to allow project-type overlays to contribute pipeline steps, `step-overrides`, or `cross-reads-overrides`

## 3. Architecture

Both overlays follow the existing project-type-overlay pattern used by `web-app`, `mobile-app`, `ml`, `data-pipeline`, `backend`, `cli`, `library`, `game`, `browser-extension`, and `research`.

### 3.1 Files created per overlay

| Path | Purpose |
| --- | --- |
| `content/methodology/{type}-overlay.yml` | Knowledge-override mapping (no step-overrides, no cross-reads-overrides — project-type overlays are knowledge-only) |
| `content/knowledge/{type}/*.md` | 12-14 knowledge documents following `{type}-{topic}.md` naming |

### 3.2 Files modified per overlay

| Path | Change |
| --- | --- |
| `src/config/schema.ts` | Add `'data-science'` / `'web3'` to `ProjectTypeSchema` enum; add matching `DataScienceConfigSchema` / `Web3ConfigSchema` zod objects |
| `src/types/config.ts` | Export derived `DataScienceConfig` / `Web3Config` type; extend `DetectedConfig` discriminated union |

### 3.3 Files modified once (shared between PRs where practical)

| Path | Change |
| --- | --- |
| `tests/packaging/domain-overlay-alignment.test.ts` (or sibling file) | Add assertion: every `ProjectType` enum value has a matching `content/methodology/{type}-overlay.yml` |
| `tests/evals/overlay-structural-coverage.bats` (new, lands with DS PR) | Generic structural eval — applies to all project-type overlays, benefits future overlay authors |
| `docs/roadmap.md` | Move completed entry to "Completed Releases"; add DS-2 / W3-2 / non-EVM web3 to "Backlog / Later"; fix stale "~10-20 pipeline steps" wording |
| `README.md` | Extend the project-type list |
| `CHANGELOG.md` | One entry per release |

### 3.4 No preset changes

Presets (`mvp.yml`, `deep.yml`, `custom.yml`) are project-type-agnostic: they define `enabled: true/false` for each universal step, independent of project type. Overlays layer knowledge on top after preset resolution.

## 4. Knowledge-document content

Both overlays use the **hybrid backbone-plus-domain** pattern. The backbone (6 docs) maps 1:1 onto universal pipeline-step slots that every project type needs. The domain docs carry the real leverage.

Style matches existing docs (see `content/knowledge/ml/ml-experiment-tracking.md` as a reference): opinionated, code-heavy, 150-300 lines, concrete tool recommendations with 1-line rationale. Frontmatter: `name`, `description`, `topics`.

### 4.1 Data Science overlay — 13 docs

**Project-type slug:** `data-science`

**Scope narrative:** solo or small-team data scientist / analytics engineer building a model, report, or analytical pipeline from scratch, without existing company infrastructure. Targets local-first, reproducibility-first workflows that promote from notebook exploration to shippable pipelines.

**Overlap with existing `ml/` overlay (intentional):** approximately 5 of the 12 `ml/` docs overlap thematically with DS (experiment-tracking, model-evaluation, observability, requirements, conventions). Each overlay is self-contained by architecture and a user picks a single project type, so the user never sees both sets. `ml/` targets production model training and serving systems; `data-science/` targets analytics and prototyping.

**Backbone (6 docs, map 1:1 onto universal pipeline steps):**

| # | Doc | Purpose | Tool recommendations |
|---|---|---|---|
| 1 | `data-science-requirements` | PRD / user-story shape for a DS project — what "done" looks like for a model or report | — |
| 2 | `data-science-conventions` | Python coding conventions for DS work | `ruff` (lint + format), type hints encouraged, Black formatting rules |
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
| 7 | `web3-architecture` | Modular vs monolithic, library use, state minimization | `OpenZeppelin Contracts` as baseline dependency; diamond pattern only when justified; includes explicit EVM-only scope call |
| 8 | `web3-access-control` | Ownership, roles, multisig, timelock | `OpenZeppelin AccessControl`, `Safe` (multisig), 2-step ownership transfer |
| 9 | `web3-upgradeability` | Proxy patterns, storage hazards | `OpenZeppelin Upgrades` + UUPS preferred; storage-gap pattern; "don't upgrade if you don't have to" |
| 10 | `web3-gas-optimization` | Storage packing, unchecked, calldata vs memory | Post-0.8 `unchecked{}`, function-visibility rules, avoid unbounded loops; don't optimize prematurely |
| 11 | `web3-oracles-and-external-data` | Staleness, decimals, manipulation resistance | `Chainlink` primary; staleness checks; avoid `block.timestamp` for pricing |
| 12 | `web3-audit-workflow` | Pre-audit readiness checklist and firm selection | `Slither` (mandatory static analysis), `Echidna` (property-based fuzzing), `Halmos` (open-source formal verification), `Certora` (commercial FV) noted; Trail of Bits / Consensys style checklist |
| 13 | `web3-common-vulnerabilities` | SWC-level checklist with code examples | Reentrancy, front-running (commit-reveal), delegatecall hazards, unchecked external calls, signature replay (EIP-712 + nonces), DoS via unbounded arrays |
| 14 | `web3-deployment-and-verification` | Deploy scripts, verification, multi-chain, post-deploy hardening | `forge script` + broadcast artifacts, Etherscan verify, timelock on privileged functions, role assignment post-deploy |

## 5. Overlay YAML mappings

Both overlays follow the `ml-overlay.yml` pattern: include only steps that apply to the domain; steps not listed inherit universal content unchanged.

### 5.1 `content/methodology/data-science-overlay.yml` (21 steps)

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

Skipped steps: UX/design steps (`ux-spec`, `design-system`) and `api-contracts` — a solo DS project typically has no UI or external API surface.

### 5.2 `content/methodology/web3-overlay.yml` (22 steps)

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

Skipped steps: UX/design steps (`ux-spec`, `design-system`) and database steps (`database-schema`, `review-database`) — smart-contract projects don't have user-facing UX or external database schemas.

## 6. Schema and type changes

### 6.1 `src/config/schema.ts`

```typescript
// Add to ProjectTypeSchema enum:
export const ProjectTypeSchema = z.enum([
  'web-app',
  'mobile-app',
  'backend',
  'cli',
  'library',
  'game',
  'data-pipeline',
  'ml',
  'browser-extension',
  'research',
  'data-science',  // NEW — shipped in v3.23.0
  'web3',          // NEW — shipped in v3.24.0
])

// Add zod config objects:
const DataScienceConfigSchema = z.object({
  // Initial shape — keep minimal; extend in future PRs if DS-2 requires
  // domain/audience fields analogous to backend.domain.
})

const Web3ConfigSchema = z.object({
  // Initial shape — keep minimal; extend in future PRs if W3-2 introduces
  // an application/dApp sub-overlay or chain-family fields.
})
```

### 6.2 `src/types/config.ts`

- Export derived types: `DataScienceConfig = z.infer<typeof DataScienceConfigSchema>`; `Web3Config = z.infer<typeof Web3ConfigSchema>`.
- Extend `DetectedConfig` discriminated union with entries for `'data-science'` and `'web3'` variants matching the `projectType` discriminant.

## 7. Testing strategy

### 7.1 Packaging test (extend)

Extend `tests/packaging/domain-overlay-alignment.test.ts` with a new test block (keep the existing file; do not add a sibling — the current file is small and this assertion belongs alongside the existing sub-overlay assertions):

> Every `ProjectType` enum value has a matching `content/methodology/{type}-overlay.yml` file that is a regular file.

This catches a future developer who adds a new project type and forgets the overlay file. This test block lands with the DS PR.

### 7.2 Existing evals (no changes needed)

- `tests/evals/knowledge-injection.bats` — walks all knowledge entries generically; auto-covers new docs.
- `tests/evals/pipeline-completeness.bats` — validates referenced steps exist.
- `tests/evals/methodology-content.bats` — existing structural checks continue to apply.

### 7.3 New generic eval — `tests/evals/overlay-structural-coverage.bats`

One eval that benefits every project-type overlay now and in the future:

- Every step slug in `knowledge-overrides` exists in the universal pipeline
- Every knowledge entry referenced in `knowledge-overrides` exists in `content/knowledge/{type}/`
- No orphaned knowledge documents: every file in `content/knowledge/{type}/` is referenced by its overlay at least once
- Overlay YAML has required frontmatter fields (`name`, `description`, `project-type`)
- `project-type` value matches the filename convention (`{type}-overlay.yml` ↔ `project-type: {type}`)

Runs once across all project-type overlays, not per-overlay.

### 7.4 Per-overlay content evals (optional, lightweight)

Two small eval files, each ~5-10 `@test` blocks of keyword-presence sanity checks:

- `tests/evals/data-science-overlay-content.bats` — spot-checks: `data-science-experiment-tracking.md` mentions `MLflow`; `data-science-notebook-discipline.md` mentions `Marimo`; `data-science-data-versioning.md` mentions `DVC`; `data-science-testing.md` mentions `pytest` and `pandera`; etc.
- `tests/evals/web3-overlay-content.bats` — spot-checks: `web3-security.md` mentions `reentrancy`; `web3-audit-workflow.md` mentions `Slither`; `web3-testing.md` mentions `forge`; `web3-access-control.md` mentions `Safe`; etc.

These aren't content review; they're cheap guards against a future edit hollowing out a document.

### 7.5 Schema test

Extend any existing enum-membership vitest tests to include `'data-science'` and `'web3'`.

## 8. Release plan

### 8.1 Sequence

1. **Data Science first — v3.23.0.** Smaller blast radius; stress-tests the pattern and the generic eval.
2. **Reassess.** After DS merges, review what was surprising during authoring and apply lessons to the Web3 plan.
3. **Web3 second — v3.24.0.** Larger / security-heavy; benefits from lessons learned on DS.

Branches may be prepared in parallel worktrees, but PRs merge serially. Each PR is independent (no shared files except schema and roadmap, which are serializable).

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

- Update `CHANGELOG.md` and `README.md` for user-facing changes (new project type visible in `scaffold init --type ...`)
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
| DS docs look thin next to `ml/` because of thematic overlap | Medium | DS narrative stays tightly on solo/small-team; docs cite concrete solo-scale tool recommendations (uv, Marimo) that `ml/` does not |
| Web3 ecosystem shifts quickly; docs go stale | Medium | Recommendations anchor to stable baselines (Foundry, OpenZeppelin, Slither) that are unlikely to be displaced in 12-18 months; audit-workflow doc lists multiple firms / tools rather than one |
| Keyword-presence content evals produce false confidence | Low | Evals are spot-checks, not content review; human review + MMR remains the quality gate |
| Someone builds the next overlay (IoT) and forgets an overlay file | Low | New generic eval `overlay-structural-coverage.bats` + packaging-alignment test catch this at CI |
| Schema change for new project types collides between DS and Web3 PRs | Low | Both PRs touch `ProjectTypeSchema` and `DetectedConfig`; serialize by merging DS first, then rebasing Web3 |

## 10. Open questions

None at design time. Any issues surfaced during implementation will be raised in the implementation plan or as PR review comments.
