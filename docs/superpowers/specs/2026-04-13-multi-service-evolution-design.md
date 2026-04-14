# Multi-Service Evolution — Design Spec

**Date**: 2026-04-13
**Status**: Draft
**Scope**: Evolve scaffold from single-project-type to multi-service support via phased waves

## Overview

Scaffold is currently a single-project-type tool: one `projectType`, one `.scaffold/` state directory, one dependency graph, one overlay. Complex systems like multi-service monorepos (e.g., a fintech trading platform with 3 FastAPI microservices + a shared library + a Next.js frontend) require running scaffold multiple times with no artifact sharing, no cross-service awareness, and no shared state.

This design adds multi-service support through 6 incremental waves, each independently shippable. The approach follows the established overlay pattern (proven by the game-dev pipeline) and maintains full backward compatibility with single-project workflows.

**Design principle**: Multi-service is topology, not a project type. No new `ProjectTypeSchema` enum value. Services are a structural modifier (`services[]` array) on the existing config.

**Origin**: Analysis of scaffolding requirements for "Nibble," a multi-user SaaS trading platform with 3 independent FastAPI microservices, a shared Pydantic library, and a React/Next.js frontend. The gaps identified are generalizable to any multi-service monorepo.

## Wave Structure

```
Wave 0 (Security) → Wave 1 (Domain Knowledge) → Wave 3a (Service Manifest) → Wave 2 (Cross-Service Pipeline) → Wave 3b (Service Execution) → Wave 3c (Cross-Service References)
```

The non-sequential numbering reflects that 3a was moved before 2 during review — the service manifest must exist before the multi-service overlay can activate.

---

## Wave 0: Security Hardening (executes 1st)

**Goal**: Close a pre-existing path traversal vulnerability in artifact resolution.

### Problem

All 5 artifact path resolution sites use `path.resolve(projectRoot, relPath)` where `relPath` comes from `state.json` `produces` arrays. No containment check exists. A malicious or misconfigured `produces` entry like `../../etc/passwd` resolves outside the project root and gets read via `fs.readFileSync`.

### Affected Sites

| File | Lines | Operation |
|------|-------|-----------|
| `src/cli/commands/run.ts` | 337, 371 | Artifact gathering from deps and reads |
| `src/state/completion.ts` | 28, 61, 97 | `detectCompletion`, `checkCompletion`, `analyzeCrash` |
| `src/core/assembly/update-mode.ts` | 47, 65 | `detectUpdateMode` — reads file content |
| `src/core/assembly/context-gatherer.ts` | 34 | `gatherContext` — reads file content |
| `src/state/state-migration.ts` | 143, 149 | `resolveArtifactPath` — checks existence (uses `path.join`, not `path.resolve`; paths come from frontmatter not untrusted state — lower risk but include for defense-in-depth) |

### Solution

Extract a single containment helper:

```typescript
// src/utils/artifact-path.ts
import fs from 'node:fs'
import path from 'node:path'

/**
 * Resolve an artifact path and verify it stays within the project root.
 * Returns the resolved path, or null if containment check fails or file doesn't exist.
 */
export function resolveContainedArtifactPath(
  projectRoot: string,
  relPath: string,
): string | null {
  const resolved = path.resolve(projectRoot, relPath)

  // Canonicalize both sides to resolve symlinks
  let canonicalRoot: string
  let canonicalPath: string
  try {
    canonicalRoot = fs.realpathSync(projectRoot)
  } catch {
    return null // Project root doesn't exist
  }
  try {
    canonicalPath = fs.realpathSync(resolved)
  } catch {
    // File doesn't exist yet — fall back to path.resolve check (no symlink bypass possible)
    if (!resolved.startsWith(canonicalRoot + path.sep) && resolved !== canonicalRoot) {
      return null
    }
    return resolved
  }

  // Containment check with path.sep to prevent prefix collision
  // (/project matches /project-malicious without the separator)
  if (!canonicalPath.startsWith(canonicalRoot + path.sep) && canonicalPath !== canonicalRoot) {
    return null
  }
  return canonicalPath
}
```

Replace all 5 resolution sites to call this helper. Sites that read content should check for null and skip/warn. Sites that check existence should treat null as "not found."

### Scope

~30 lines for helper + ~5 lines per call site replacement = ~55 lines across 6 files.

---

## Wave 1: Domain Knowledge — Fintech (executes 2nd)

**Goal**: Add fintech/trading domain expertise to scaffold's knowledge base, activated as a domain sub-overlay for the `backend` project type.

### Approach

Follow the established pattern from `research-quant-finance.yml`. The research type already supports domain sub-overlays via `TYPE_DOMAIN_CONFIG` in `overlay-state-resolver.ts`. Wave 1 generalizes this mechanism to support domains on any project type, starting with `backend`.

### Why Not Reuse Quant-Finance Docs

The existing 6 `research-quant-*` knowledge docs cover research-oriented trading: backtesting bias, walk-forward analysis, Sharpe ratio, strategy patterns. Fintech production knowledge is a different domain: ledger design, compliance, audit trails, broker integration, payment flows. Zero content overlap.

### Config Schema Change

Add `domain` field to `BackendConfigSchema` in `src/config/schema.ts`:

```typescript
export const BackendConfigSchema = z.object({
  apiStyle: z.enum(['rest', 'graphql', 'grpc', 'trpc', 'none']),
  dataStore: z.array(z.enum(['relational', 'document', 'key-value'])).min(1).default(['relational']),
  authMechanism: z.enum(['none', 'jwt', 'session', 'oauth', 'apikey']).default('none'),
  asyncMessaging: z.enum(['none', 'queue', 'event-driven']).default('none'),
  deployTarget: z.enum(['serverless', 'container', 'long-running']).default('container'),
  domain: z.enum(['none', 'fintech']).default('none'),  // NEW
}).strict()
```

Uses `'none'` default (not `.optional()`) — matches every other absent-concept field in the codebase. `.strict()` + `.default('none')` is non-breaking: existing configs without `domain` get `'none'` applied by Zod.

### TYPE_DOMAIN_CONFIG Generalization

In `src/core/assembly/overlay-state-resolver.ts`:

```typescript
const TYPE_DOMAIN_CONFIG: Partial<Record<string, string>> = {
  'research': 'researchConfig',
  'backend': 'backendConfig',  // NEW
}
```

The existing lookup pattern (`config.project?.[configKey]?.domain`) works for backend because `ProjectConfig` has `[key: string]: unknown` (forward-compatibility from ADR-033).

### Knowledge Documents (8 net-new)

| Document | Category | Topics |
|----------|----------|--------|
| `backend-fintech-compliance.md` | backend | PCI-DSS, SOC 2, SEC regulations, audit trail immutability |
| `backend-fintech-ledger.md` | backend | Double-entry accounting, ledger design, reconciliation |
| `backend-fintech-broker-integration.md` | backend | Multi-broker adapter pattern, credential rotation, error harmonization |
| `backend-fintech-order-lifecycle.md` | backend | Order events, fill handling, partial fills, cancellation |
| `backend-fintech-risk-management.md` | backend | Position limits, drawdown caps, circuit breakers, kill switches |
| `backend-fintech-testing.md` | backend | Backtest determinism, financial accuracy, broker sandbox testing |
| `backend-fintech-data-modeling.md` | backend | Financial data models, currency handling, precision decimals |
| `backend-fintech-observability.md` | backend | Trade event correlation, market-hours scheduling, SLOs |

### Sub-Overlay File

`content/methodology/backend-fintech.yml`:

```yaml
name: backend-fintech
description: >
  Fintech domain knowledge for backend projects — compliance, ledger design,
  broker integration, order lifecycle, risk management.
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

### Additional Code Changes

| File | Change | Lines |
|------|--------|-------|
| `src/config/schema.ts` | Add `domain` field to `BackendConfigSchema` | ~2 |
| `src/core/assembly/overlay-state-resolver.ts` | Add `'backend': 'backendConfig'` to `TYPE_DOMAIN_CONFIG` | ~1 |
| `src/wizard/questions.ts` | Add backend domain question (mirrors research pattern at lines 507-514) | ~8 |
| `src/wizard/copy/backend.ts` | Add domain option descriptions | ~8 |
| `src/cli/init-flag-families.ts` | Add `--backend-domain` flag | ~3 |
| `src/cli/commands/init.ts` | Wire `--backend-domain` flag to wizard | ~3 |
| Tests (schema, wizard, overlay-state-resolver) | Validate domain field, wizard flow, sub-overlay loading | ~30-50 |

**Total**: ~80-120 lines across 8-12 source files + 8 content files + 1 overlay YAML.

**Atomic delivery**: All changes ship in one PR. Schema field, TYPE_DOMAIN_CONFIG entry, wizard question, sub-overlay file, and knowledge docs must be present together — shipping any subset alone produces a feature that silently does nothing.

### Constraint

Wave 1 supports exactly one domain per project type. Multi-domain stacking (e.g., `domain: ['fintech', 'healthcare']`) requires wave 2's overlay conflict resolution and is deferred.

---

## Wave 3a: Service Manifest (executes 3rd)

**Goal**: Add `services[]` to config schema so scaffold can describe multi-service projects. Build the state migration framework needed for later waves.

### Why Before Wave 2

Wave 2's `multi-service-overlay.yml` needs an activation mechanism. The overlay system is keyed on `projectType` — there is no way to load a structural overlay without a config-level trigger. The `services[]` field provides that trigger: `resolveOverlayState` will add a second overlay pass gated on `services[].length > 0`.

### Config Schema Extension

```typescript
// In ProjectSchema (src/config/schema.ts)
const ServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  projectType: ProjectTypeSchema,
  // Per-service type configs (same fields as root-level)
  backendConfig: BackendConfigSchema.optional(),
  webAppConfig: WebAppConfigSchema.optional(),
  researchConfig: ResearchConfigSchema.optional(),
  // ... other type configs
  path: z.string().optional(),  // relative path within monorepo (e.g., "services/trading")
  exports: z.array(z.object({   // wave 3c: artifact export allowlist for cross-service reads
    step: z.string(),
  })).optional(),
})

// Added to ProjectSchema
services: z.array(ServiceSchema).optional(),
```

**Root `projectType` behavior**: Optional when `services[]` is present. When omitted, no root overlay loads — global steps get knowledge exclusively from the multi-service overlay (wave 2) and per-service overlay consultation during assembly. When present, it serves as the default for global steps.

### Cross-Field Refinements

In `ProjectSchema.superRefine()`:

```typescript
// Each service must have a unique name
if (data.services) {
  const names = data.services.map(s => s.name)
  const dupes = names.filter((n, i) => names.indexOf(n) !== i)
  if (dupes.length > 0) {
    ctx.addIssue({ path: ['services'], code: 'custom', message: `Duplicate service names: ${dupes.join(', ')}` })
  }
  // Per-service type-config coupling validated by ServiceSchema's own superRefine
}

// projectType is optional when services[] is present
if (!data.projectType && !data.services?.length) {
  ctx.addIssue({ path: ['projectType'], code: 'custom', message: 'projectType required when services is absent' })
}
```

### Declarative Init

Multi-service projects use `scaffold init --from services.yml` instead of the interactive wizard:

```yaml
# services.yml
services:
  - name: shared-lib
    projectType: library
    libraryConfig:
      visibility: internal
      documentationLevel: api-docs
    path: packages/shared-lib
  - name: trading-engine
    projectType: backend
    backendConfig:
      apiStyle: rest
      dataStore: [relational, key-value]
      authMechanism: oauth
      asyncMessaging: event-driven
      deployTarget: container
      domain: fintech
    path: services/trading
  - name: web
    projectType: web-app
    webAppConfig:
      renderingStrategy: ssr
      deployTarget: serverless
      realtime: websocket
      authFlow: oauth
    path: apps/web
```

The interactive wizard remains for single-service projects. Multi-service projects get the declarative config path.

### State Migration Framework

**Problem**: `PipelineState['schema-version']` is literal type `1`. `loadState()` and `state-validator.ts` hard-reject non-1 values. No version dispatch mechanism exists.

**Solution**:

1. Widen type: `'schema-version': 1 | 2` in `src/types/state.ts`
2. Version dispatch in `loadState()`: read raw JSON, extract `schema-version`, run migration chain, THEN validate:
   ```typescript
   const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8'))
   const version = raw['schema-version']
   if (version === 1) {
     // Run v1 -> v2 migration if services[] present in config
     raw['schema-version'] = 2
     // Add services metadata if needed
   }
   if (version !== 1 && version !== 2) {
     throw stateSchemaVersion([1, 2], version, this.statePath)
   }
   ```
3. `initializeState()` emits version 2 when `services[]` is in config, version 1 otherwise
4. Update `state-validator.ts` to accept both versions

**Scope**: ~120-160 lines production code (ServiceSchema + superRefine: ~40 lines; ProjectSchema refinements: ~15 lines; `--from services.yml` init: ~50-60 lines; state migration framework: ~25-30 lines) across ~8 files + ~100-150 lines test updates.

**Implementation note**: `ServiceSchema` needs its own `superRefine` for type-config coupling validation (same logic as `ProjectSchema.superRefine()` at lines 126-214 of `schema.ts`). Refactor the existing coupling validation into a shared helper to avoid duplicating ~40 lines.

---

## Wave 2: Cross-Service Pipeline (executes 4th)

**Goal**: Add pipeline steps for concerns that span service boundaries, plus the overlay infrastructure to activate them.

### Prerequisites

- Wave 1 (fintech knowledge docs exist for injection)
- Wave 3a (`services[]` in config provides activation trigger)

### Pipeline Steps

All steps are disabled by default in presets and enabled by `multi-service-overlay.yml`.

#### `service-ownership-map` (architecture phase)

- **Purpose**: Define which service owns which domain, database tables, and event topics
- **Phase**: architecture
- **Order**: 721 (after `review-architecture` at 720)
- **Dependencies**: `[review-architecture]`
- **Outputs**: `[docs/service-ownership-map.md]`
- **Knowledge**: `[multi-service-architecture, multi-service-data-ownership]`
- **Distinct from `system-architecture`**: System arch designs one service's internal layers. This maps cross-service boundaries and data ownership.

#### `inter-service-contracts` (specification phase)

- **Purpose**: Design API contracts between services with versioning, backward compatibility, retries, timeouts, idempotency, and failure isolation
- **Phase**: specification
- **Order**: 841 (after `review-api` at 840)
- **Dependencies**: `[service-ownership-map, review-api]`
- **Reads**: `[api-contracts]`
- **Outputs**: `[docs/inter-service-contracts.md]`
- **Knowledge**: `[multi-service-api-contracts, multi-service-resilience]`
- **Distinct from `api-contracts`**: Existing step designs external/client-facing APIs. This covers internal service-to-service contracts only.

#### `cross-service-auth` (quality phase)

- **Purpose**: Inter-service trust model — mTLS, service tokens, audience scoping, trust boundaries
- **Phase**: quality
- **Order**: 952 (after `security` at 950, before `review-security` at 960)
- **Dependencies**: `[security, service-ownership-map]`
- **Outputs**: `[docs/cross-service-auth.md]`
- **Knowledge**: `[multi-service-auth]`
- **Distinct from `security`**: Security step handles external threats/OWASP. This is internal service identity and trust.

#### `cross-service-observability` (quality phase)

- **Purpose**: Distributed tracing, correlation IDs, cross-service SLOs, failure isolation alerting
- **Phase**: quality
- **Order**: 941 (after `review-operations` at 940)
- **Dependencies**: `[review-operations, service-ownership-map]`
- **Outputs**: `[docs/cross-service-observability.md]`
- **Knowledge**: `[multi-service-observability]`
- **Distinct from `operations`**: Operations step is single-service runbook. This is multi-service correlation.

#### `integration-test-plan` (quality phase)

- **Purpose**: Contract tests, cross-service E2E flows, service dependency mocking strategy
- **Phase**: quality
- **Order**: 942
- **Dependencies**: `[review-testing, inter-service-contracts]`
- **Outputs**: `[docs/integration-test-plan.md]`
- **Knowledge**: `[multi-service-testing]`
- **Distinct from `review-testing`**: Review-testing validates a single service's test pyramid. This validates cross-service integration.

### Multi-Service Overlay

`content/methodology/multi-service-overlay.yml`:

```yaml
name: multi-service
description: >
  Cross-service pipeline steps and knowledge for multi-service monorepos.
  Activated by presence of services[] in config.

step-overrides:
  # Cross-service steps (wave 2)
  service-ownership-map: { enabled: true }
  inter-service-contracts: { enabled: true }
  cross-service-auth: { enabled: true }
  cross-service-observability: { enabled: true }
  integration-test-plan: { enabled: true }
  # Pre-phase steps marked global (already enabled — no-op for enablement,
  # but marks them as global for the step classifier in wave 3b)
  create-vision: { enabled: true }
  review-vision: { enabled: true }
  create-prd: { enabled: true }
  review-prd: { enabled: true }

knowledge-overrides:
  system-architecture:
    append: [multi-service-architecture]
  domain-modeling:
    append: [multi-service-data-ownership]
  implementation-plan:
    append: [multi-service-task-decomposition]
```

### Overlay Activation Mechanism

In `resolveOverlayState()` (`src/core/assembly/overlay-state-resolver.ts`), add a second overlay pass after the project-type overlay:

```typescript
// Existing: project-type overlay pass
if (projectType) {
  const overlayPath = path.join(methodologyDir, `${projectType}-overlay.yml`)
  // ... load and apply
}

// NEW: structural overlay pass (gated on services[])
if (config.project?.services?.length) {
  const msOverlayPath = path.join(methodologyDir, 'multi-service-overlay.yml')
  if (fs.existsSync(msOverlayPath)) {
    const { overlay: msOverlay } = loadOverlay(msOverlayPath)  // needs validation bypass for project-type field
    if (msOverlay) {
      const merged = applyOverlay(currentSteps, currentKnowledge, currentReads, currentDeps, msOverlay)
      // update current* maps from merged
    }
  }
}
```

**Note**: `loadOverlay()` currently validates `project-type` against `ProjectTypeSchema`. The multi-service overlay has no single project type. Two options:
- (a) Make `project-type` optional in overlay YAML for structural overlays
- (b) Add a `structural: true` field that bypasses the project-type validation

Option (a) is simpler. Make `project-type` optional with a `z.string().optional()` validation in the overlay schema. The `multi-service-overlay.yml` omits the `project-type` field entirely.

**Type contract change**: The `ProjectTypeOverlay` interface in `src/types/config.ts` (line 102) currently requires `projectType: string`. Change to `projectType?: string`. When `projectType` is absent, the overlay is treated as a structural overlay (applicable across project types). When present, it remains a project-type-scoped overlay. This is a backward-compatible widening — all existing overlays still provide `projectType` and work unchanged. The `loadOverlay()` validation at line 184 of `overlay-loader.ts` changes from a hard error to: if `project-type` is present, validate against `ProjectTypeSchema`; if absent, proceed without validation.

**Implementation note**: `loadSubOverlay()` at line 242 of `overlay-loader.ts` delegates to `loadOverlay()` first, so making `project-type` optional propagates to sub-overlays. This is non-breaking — existing sub-overlays like `research-quant-finance.yml` already have `project-type` set and will continue to pass validation.

### Overlay Stacking Conflict Resolution

When multiple overlays apply to the same step:

1. **Ordering**: Project-type overlay first, then domain sub-overlay (knowledge-only), then structural overlay (multi-service). This is deterministic and non-configurable.
2. **`step-overrides` conflicts**: If both a project-type overlay and structural overlay set `enabled` for the same step with different values, the structural overlay wins (applied last). A warning is emitted.
3. **`knowledge-overrides`**: Append-only with Set-based dedup. Order-independent. No conflict possible.
4. **`reads-overrides.replace`**: If overlay A replaces `ux-spec → api-contracts` and overlay B replaces `ux-spec → service-mesh-spec`, overlay B's replacement silently fails (target already renamed). Emit a warning: "reads replacement target 'ux-spec' was already replaced by a prior overlay."
5. **`dependency-overrides`**: Same chained-replace semantics as reads.

### Preset Registration

All 5 new steps must be registered in methodology presets:

```yaml
# In deep.yml, mvp.yml, custom-defaults.yml
# Matches game-step convention: disabled by default, enabled by overlay
service-ownership-map: { enabled: false }
inter-service-contracts: { enabled: false }
cross-service-auth: { enabled: false }
cross-service-observability: { enabled: false }
integration-test-plan: { enabled: false }
```

Without preset registration, `buildGraph()` defaults to `enabled: true` while `next` treats missing presets as disabled — an inconsistency that causes steps to behave differently depending on the command.

### Additional Knowledge Documents (8 net-new, stored in `content/knowledge/core/`)

| Document | Topics |
|----------|--------|
| `multi-service-architecture.md` | Service boundary design, communication patterns (sync vs async), data ownership |
| `multi-service-data-ownership.md` | Table ownership, shared-nothing data, event-driven sync |
| `multi-service-api-contracts.md` | Internal API versioning, backward compat, retries, idempotency |
| `multi-service-auth.md` | mTLS, service tokens, zero-trust, audience scoping |
| `multi-service-observability.md` | Distributed tracing, correlation IDs, cross-service SLOs |
| `multi-service-testing.md` | Contract tests, Pact/schema registry, cross-service E2E |
| `multi-service-resilience.md` | Circuit breakers, bulkheads, timeout budgets, failure isolation |
| `multi-service-task-decomposition.md` | Breaking multi-service work into per-service implementation waves |

---

## Wave 3b: Service-Qualified Execution (executes 5th)

**Goal**: Enable `scaffold run <step> --service <name>` so each service gets its own pipeline execution context.

### Prerequisites

- Wave 3a (services[] in config, state migration framework)

### CLI Changes

```bash
# Run a step for a specific service
scaffold run tech-stack --service trading-engine

# Run a global cross-service step (no --service flag)
scaffold run service-ownership-map

# Show status per service
scaffold status --service trading-engine

# Show next eligible steps for a service
scaffold next --service trading-engine
```

When `--service` is provided:
- Step identity becomes `{service}:{step}` internally (e.g., `trading-engine:tech-stack`)
- Artifacts resolve to `services/{name}/docs/` (e.g., `services/trading-engine/docs/tech-stack.md`)
- State, decisions, and lock are service-scoped

When `--service` is omitted and `services[]` is in config:
- Global cross-service steps (from wave 2) run at project root level
- Service-scoped steps produce an error: "Step 'tech-stack' requires --service flag when services[] is configured"

### Global vs Service Step Classification

Steps are classified based on their source:

| Classification | Steps | `--service` required? | State location |
|---------------|-------|----------------------|----------------|
| **Global (cross-service)** | The 5 wave-2 steps (`service-ownership-map`, `inter-service-contracts`, `cross-service-auth`, `cross-service-observability`, `integration-test-plan`) + `create-vision`, `review-vision`, `create-prd`, `review-prd` (system-wide product definition) | No | `.scaffold/state.json` |
| **Per-service** | All other pipeline steps (`tech-stack`, `system-architecture`, `domain-modeling`, `database-schema`, `api-contracts`, etc.) | Yes | `.scaffold/services/{name}/state.json` |

**Rule**: Steps listed in `multi-service-overlay.yml` `step-overrides` are global. All other steps are per-service. The overlay must include the 4 pre-phase steps (`create-vision`, `review-vision`, `create-prd`, `review-prd`) as `{ enabled: true }` so the heuristic is self-consistent — these are already enabled by default, so the override is a no-op for enablement but marks them as global for the classifier.

**Dual-mode steps** (e.g., `implementation-plan`): The multi-service overlay injects knowledge into `implementation-plan` via `knowledge-overrides`, but does not enable it as a step-override. It remains per-service — each service gets its own implementation plan, enriched with multi-service awareness via the injected knowledge.

### Service-Scoped Overlay Resolution

When `scaffold run <step> --service trading-engine` executes, the pipeline resolver builds context as follows:

1. Look up the service's `projectType` from `config.project.services[].projectType` (e.g., `backend`)
2. Load the service's project-type overlay (`backend-overlay.yml`)
3. Load the service's domain sub-overlay if applicable (e.g., `backend-fintech.yml` if `domain: fintech`)
4. Apply the multi-service structural overlay (`multi-service-overlay.yml`) on top — this injects cross-service knowledge into the service's steps
5. Assemble the prompt with the service-scoped overlay state

This means each service gets its own overlay stack: `{serviceType}-overlay.yml` + optional domain sub-overlay + `multi-service-overlay.yml`. The resolver in `src/core/pipeline/resolver.ts` needs a `serviceId` parameter that drives which `projectType` and domain to use for overlay selection.

### StatePathResolver Abstraction

```typescript
// src/state/state-path-resolver.ts
export class StatePathResolver {
  constructor(
    private readonly projectRoot: string,
    private readonly service?: string,
  ) {}

  get scaffoldDir(): string {
    return this.service
      ? path.join(this.projectRoot, '.scaffold', 'services', this.service)
      : path.join(this.projectRoot, '.scaffold')
  }

  get statePath(): string { return path.join(this.scaffoldDir, 'state.json') }
  get lockPath(): string { return path.join(this.scaffoldDir, 'lock.json') }
  get decisionsPath(): string { return path.join(this.scaffoldDir, 'decisions.jsonl') }
  get reworkPath(): string { return path.join(this.scaffoldDir, 'rework.json') }
}
```

Inject into `StateManager`, `LockManager`, `DecisionLogger`, `ReworkManager` constructors. Default (no service) returns current paths — zero behavioral change for single-project workflows.

### Service-Scoped Output Paths

When running `scaffold run tech-stack --service trading-engine`:
- Frontmatter `outputs: [docs/tech-stack.md]` resolves to `services/trading-engine/docs/tech-stack.md`
- State records the service-prefixed path in `produces`
- Update mode checks the service-prefixed path for existing artifacts

### Locking Model

**No concurrent global + service execution.** All execution serializes on the global lock until this wave fully shards shared files.

After wave 3b shards decisions and state per-service:
- **Per-service steps**: Acquire service lock only. Two service steps CAN run in parallel (they touch disjoint state files and decision logs).
- **Global steps**: Acquire global lock. Blocks all service steps (service steps check global lock before acquiring service lock).

This eliminates the TOCTOU race: service steps always check global lock first. If a global step sneaks in between check and acquire, the service step's check will detect it and retry.

### Per-Service State Files

```
.scaffold/
├── config.yml           # Shared config (includes services[])
├── state.json           # Global state (cross-service steps only)
├── lock.json            # Global lock
├── decisions.jsonl      # Global decisions
└── services/
    ├── trading-engine/
    │   ├── state.json   # Service-scoped state
    │   ├── lock.json    # Service-scoped lock
    │   └── decisions.jsonl
    ├── shared-lib/
    │   ├── state.json
    │   ├── lock.json
    │   └── decisions.jsonl
    └── web/
        ├── state.json
        ├── lock.json
        └── decisions.jsonl
```

### Refactoring Scope

| File | Change |
|------|--------|
| `src/state/state-manager.ts` | Accept `StatePathResolver`, use it for all path construction |
| `src/state/lock-manager.ts` | Accept `StatePathResolver`, use for lock path |
| `src/state/decision-logger.ts` | Accept `StatePathResolver`, use for decisions path |
| `src/state/rework-manager.ts` | Accept `StatePathResolver`, use for rework path |
| `src/state/completion.ts` | Accept `StatePathResolver`, resolve artifact paths with service prefix |
| `src/core/assembly/update-mode.ts` | Service-prefixed artifact path resolution |
| `src/cli/commands/run.ts` | Accept `--service` flag, construct `StatePathResolver`, pass through |
| `src/cli/commands/next.ts` | Accept `--service` flag, load service-scoped state |
| `src/cli/commands/status.ts` | Accept `--service` flag, display service-scoped status |
| ~15 test files | Update fixtures for `StatePathResolver` constructor |

**Scope**: ~200-300 lines production code across ~12 files + ~100-200 lines test updates. This is the most complex wave due to the breadth of refactoring (4 manager classes, 3 CLI commands, locking model).

---

## Wave 3c: Cross-Service References (executes 6th)

**Goal**: Enable a step in one service to read artifacts produced by another service.

### Prerequisites

- Wave 3b (service-scoped state and output paths)

### `cross-reads` Frontmatter Field

New frontmatter field for pipeline steps:

```yaml
# In a pipeline step's frontmatter
name: system-architecture
cross-reads:
  - service: shared-lib
    step: api-contracts
  - service: trading-engine
    step: domain-modeling
```

During assembly, the engine resolves cross-reads by:
1. Loading the foreign service's state file (via `StatePathResolver` with the foreign service name)
2. Finding the step's `produces` entries in the foreign state
3. Resolving the artifact path against the project root (with service prefix)
4. Running the `resolveContainedArtifactPath` helper (wave 0)
5. Injecting the content into the assembled prompt as a read artifact

### Artifact Export Allowlists

Not all artifacts should be readable across service boundaries. Each service can declare exportable artifacts:

```yaml
# In .scaffold/config.yml, per service
services:
  - name: shared-lib
    exports:
      - step: api-contracts
      - step: domain-modeling
    # ...
```

Cross-reads that reference non-exported steps produce a warning and are skipped.

### Cross-Service Dependency Edges

The dependency graph (`src/core/dependency/graph.ts`) gains cross-service edge support:

```typescript
interface DependencyNode {
  slug: string
  phase: string | null
  order: number | null
  dependencies: string[]
  crossDependencies?: Array<{ service: string; step: string }>  // NEW
  enabled: boolean
}
```

Cross-dependencies are informational only — they do not block step execution (since foreign service steps may have been run in a previous session). They are used by `scaffold next` and `scaffold status` to show cross-service readiness.

### Frontmatter Schema Update

The `cross-reads` field must be added to the frontmatter type and validator. Currently `MetaPromptFrontmatter` in `src/types/frontmatter.ts` defines `reads` (line 41) but not `cross-reads`. Unknown frontmatter fields produce warnings (line 206). Wave 3c must:

1. Add `cross-reads` to `MetaPromptFrontmatter` interface as `crossReads?: Array<{ service: string; step: string }>`
2. Add parsing in the frontmatter loader to deserialize the YAML `cross-reads` field
3. Wire `crossReads` into the assembly engine's artifact gathering alongside existing `reads`

### Path Containment

All cross-service artifact reads go through `resolveContainedArtifactPath()` (wave 0). The helper's `realpathSync` + containment check prevents any path traversal across service boundaries.

### Out of Scope

- **Transitive cross-service artifact resolution**: If service A cross-reads service B, and service B cross-reads service C, service A does NOT transitively get service C's artifacts. Only direct cross-reads are supported.
- **Automatic cross-service invalidation**: Changing service A's artifacts does not automatically invalidate service B's derived steps. Manual re-run is required.

---

## Explicitly Out of Scope

- **Brownfield `adopt` for multi-service monorepos** — follow-on design
- **Multi-domain stacking** (e.g., `domain: ['fintech', 'healthcare']`) — requires overlay conflict resolution (wave 2), deferred beyond wave 2
- **Transitive cross-service artifact resolution** — deferred beyond wave 3c
- **Automatic cross-service invalidation** — deferred
- **Mobile/desktop multi-platform multi-service** — not addressed

---

## Backward Compatibility

| Surface | Impact | Migration |
|---------|--------|-----------|
| Config schema | Additive — `services[]` is optional, `domain` has default `'none'` | None required |
| State schema | Version bump `1 → 2` when services present | Automatic migration in `loadState()` |
| CLI | New `--service` flag, no existing flags change | None required |
| Overlays | New multi-service overlay, existing overlays unchanged | None required |
| Presets | New steps added as `enabled: false` | None required |
| Pipeline steps | 5 new steps, no existing steps modified | None required |
| Single-project workflows | Completely unaffected — all changes are gated on `services[]` presence | None required |

---

## Review History

- **Round 1** (3 channels: Codex, Gemini-equivalent, Codex-equivalent): Found 4 P0s, 8 P1s. Major fixes: multi-service as topology not type, overlay activation path, path containment, wave 3 split.
- **Round 2** (2 channels: Codex-equivalent, Claude): Found 1 P0, 4 P1s. Major fixes: scope estimates corrected, quant-finance reuse claim removed, wave steps named, state migration scoped.
- **Round 3** (3 channels: Codex, Claude, Codex-equivalent): Found 1 P0, 3 P1s. Major fixes: Wave 0 expanded to all 5 sites with helper extraction, root projectType made optional, locking serialization clarified, TOCTOU eliminated.
- **Round 4 — spec document review** (3 channels: Codex, Claude, Codex-equivalent): Found 1 P0, 4 P1s, 4 P2s. Major fixes: all 5 order numbers reassigned (721, 841, 842, 941, 942), sub-overlay YAML corrected, preset pattern fixed, wave 3a scope estimate doubled, wave 3b scope estimate added.
- **Round 5 — final polish** (2 channels: Codex, Claude): Found 0 P0, 1 P1. Fix: `cross-service-auth` moved from specification phase (order 842) to quality phase (order 952) to match its `security` dependency at order 950.
- **Round 6 — spec document review** (2 channels: Codex, Claude): Found 0 P0, 3 P1s, 1 P2. Fixes: added global-vs-service step classification table, added service-scoped overlay resolution flow, added `exports` field to ServiceSchema, added frontmatter schema update section for `cross-reads`. 2 Codex P2s were false positives (`state-validator.ts` does exist; `cross-service-auth` was already fixed in round 5).
- **Round 7 — final convergence** (3 channels: Codex, Claude, Codex+Gemini-equivalent): Found 0 P0, 1 P1, 2 P2s. Fix: added vision/PRD steps to multi-service-overlay step-overrides to make global classification heuristic self-consistent; specified `ProjectTypeOverlay.projectType` optionality change for structural overlays.
- **Final state**: 0 P0, 0 P1 remaining. All 3 channels converge on same findings.
- **Implementation — Wave 0** (2026-04-13): `resolveContainedArtifactPath()` helper added to `src/utils/artifact-path.ts`. All 5 artifact resolution sites (run.ts, completion.ts, update-mode.ts, context-gatherer.ts, state-migration.ts) routed through the helper. All tests green.
