# Wave 2: Cross-Service Pipeline Design

**Goal**: Add pipeline steps for concerns that span service boundaries, plus the overlay infrastructure to activate them.

**Prerequisites**: Wave 1 (domain knowledge docs), Wave 3a (services[] in config, state dispatch)

**Scope**: ~250-350 lines production code across ~15 files + ~200 lines test code + 5 meta-prompt files + 8 knowledge documents + 1 overlay YAML + 3 preset updates.

---

## Section 1: Overlay Infrastructure

### 1.1 Type Rename: `ProjectTypeOverlay` -> `PipelineOverlay`

Rename the overlay interface to reflect that overlays can now be structural (not scoped to a project type):

```typescript
// src/types/config.ts
export interface PipelineOverlay {
  name: string
  description: string
  projectType?: ProjectType  // undefined for structural overlays
  stepOverrides: Record<string, StepEnablementEntry>
  knowledgeOverrides: Record<string, KnowledgeOverride>
  readsOverrides: Record<string, ReadsOverride>
  dependencyOverrides: Record<string, DependencyOverride>
}
```

**Type precision**: `projectType` is `ProjectType | undefined`, not `string | undefined`. The loader validates against `ProjectTypeSchema` when present.

**Rename scope**: Update all references — direct type consumers are `config.ts` (definition), `config.test.ts`, `overlay-loader.ts` (3 references + return types), `overlay-resolver.ts` (import + parameter type), `overlay-resolver.test.ts` (import + helper). Indirect consumers via `types/index.ts` re-export: `overlay-state-resolver.ts`. Pure type rename — no runtime change.

### 1.2 New `loadStructuralOverlay()` Function

Add to `src/core/assembly/overlay-loader.ts`. Validates `name` + `description` but does **not** require `project-type`. Existing `loadOverlay()` stays strict (hard-errors on missing `project-type`).

```typescript
export function loadStructuralOverlay(
  overlayPath: string,
): { overlay: PipelineOverlay | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] }
```

This preserves the invariant that catches mis-scoped project-type overlay files (e.g., a `backend-overlay.yml` accidentally missing its `project-type` field would still hard-error through `loadOverlay()`).

### 1.3 Structural Overlay Pass in `resolveOverlayState()`

Add a 4th pass as an **independent block** after the `if (projectType)` block (outside its scope). This is critical because `services[]` can exist without a root `projectType` (tested in `schema.test.ts`).

```typescript
// src/core/assembly/overlay-state-resolver.ts
// AFTER the if (projectType) block closes at line 111:

// Structural overlay pass (gated on services[])
if (config.project?.services?.length) {
  const msOverlayPath = path.join(methodologyDir, 'multi-service-overlay.yml')
  if (fs.existsSync(msOverlayPath)) {
    const { overlay, errors, warnings } = loadStructuralOverlay(msOverlayPath)
    for (const w of warnings) output.warn(w)
    for (const err of errors) {
      output.warn(`[${err.code}] ${err.message}${err.recovery ? ` — ${err.recovery}` : ''}`)
    }
    if (overlay) {
      // Step-override conflict detection
      for (const [step, override] of Object.entries(overlay.stepOverrides)) {
        if (step in overlaySteps && overlaySteps[step].enabled !== override.enabled) {
          output.warn(`Structural overlay overrides "${step}" enablement`)
        }
      }
      // Validate step targets exist in metaPrompts
      for (const step of Object.keys(overlay.stepOverrides)) {
        if (!metaPrompts.has(step)) {
          output.warn(`Structural overlay targets unknown step "${step}"`)
        }
      }
      const merged = applyOverlay(
        overlaySteps, overlayKnowledge, overlayReads, overlayDependencies, overlay,
      )
      overlaySteps = merged.steps
      overlayKnowledge = merged.knowledge
      overlayReads = merged.reads
      overlayDependencies = merged.dependencies
    }
  }
}
```

### 1.4 Overlay Stacking Order

Deterministic and non-configurable:

1. Preset defaults (deep/mvp/custom)
2. Project-type overlay (e.g., `game-overlay.yml`) — full scope
3. Domain sub-overlay (e.g., `backend-fintech.yml`) — knowledge-only
4. Structural overlay (`multi-service-overlay.yml`) — full scope

### 1.5 Conflict Resolution

- **step-overrides**: Structural overlay wins (applied last). Warning emitted when it overrides a project-type overlay's value.
- **knowledge-overrides**: Append-only with Set-based dedup. No conflict possible.
- **reads-overrides / dependency-overrides**: Replace-then-append-then-dedup composition (later overlays compose with earlier ones, they do not overwrite). Chained-replace warnings deferred until a real use case arises (no current overlay uses reads-overrides.replace in combination with the structural overlay).

### 1.6 Guard Interaction

Wave 2 adds **no guard changes**. The existing `assertSingleServiceOrExit` guard remains in all 9 stateful commands (run, next, complete, skip, status, rework, reset, info, dashboard). It blocks CLI execution when `services[].length > 0` with exit code 2.

The Wave 2 overlay code is exercised via unit and integration tests. Users cannot reach it via CLI until Wave 3b removes the guard and adds `--service` flag support.

---

## Section 2: Pipeline Steps

### 2.1 Five Cross-Service Steps

All steps are disabled by default in presets and enabled by `multi-service-overlay.yml`.

#### `service-ownership-map` (architecture phase)

- **Purpose**: Define logical domain and data ownership boundaries — which service owns which business domain, which data concepts, and which event topics. Physical table assignments happen downstream in `database-schema`.
- **Phase**: architecture
- **Order**: 721 (after `review-architecture` at 720)
- **Dependencies**: `[review-architecture]`
- **Reads**: `[system-architecture, domain-modeling]`
- **Outputs**: `[docs/service-ownership-map.md]`
- **Knowledge**: `[multi-service-architecture, multi-service-data-ownership]`

#### `inter-service-contracts` (specification phase)

- **Purpose**: Design API contracts between services with versioning, backward compatibility, retries, timeouts, idempotency, and failure isolation
- **Phase**: specification
- **Order**: 841 (after `review-api` at 840)
- **Dependencies**: `[service-ownership-map, review-api]`
- **Reads**: `[api-contracts]`
- **Outputs**: `[docs/inter-service-contracts.md]`
- **Knowledge**: `[multi-service-api-contracts, multi-service-resilience]`

#### `cross-service-auth` (quality phase)

- **Purpose**: Inter-service trust model — mTLS, service tokens, audience scoping, trust boundaries
- **Phase**: quality
- **Order**: 952 (after `security` at 950, before `review-security` at 960)
- **Dependencies**: `[security, service-ownership-map]`
- **Reads**: `[inter-service-contracts]`
- **Outputs**: `[docs/cross-service-auth.md]`
- **Knowledge**: `[multi-service-auth]`

#### `cross-service-observability` (quality phase)

- **Purpose**: Distributed tracing, correlation IDs, cross-service SLOs, failure isolation alerting
- **Phase**: quality
- **Order**: 941 (after `review-operations` at 940)
- **Dependencies**: `[review-operations, service-ownership-map]`
- **Reads**: `[operations]`
- **Outputs**: `[docs/cross-service-observability.md]`
- **Knowledge**: `[multi-service-observability]`

#### `integration-test-plan` (quality phase)

- **Purpose**: Contract tests, cross-service E2E flows, service dependency mocking strategy
- **Phase**: quality
- **Order**: 942
- **Dependencies**: `[review-testing, inter-service-contracts]`
- **Reads**: `[service-ownership-map, cross-service-auth]`
- **Outputs**: `[docs/integration-test-plan.md]`
- **Knowledge**: `[multi-service-testing]`

### 2.2 Review Gate Coverage

Steps are intentionally placed **after** their phase review gates because they depend on reviewed base artifacts as input:

- `service-ownership-map` (721) needs reviewed architecture (720)
- `inter-service-contracts` (841) needs reviewed API design (840)
- `cross-service-observability` (941) needs reviewed operations (940)
- `integration-test-plan` (942) needs reviewed testing strategy (910)

**Exception**: `cross-service-auth` (952) runs before `review-security` (960). The overlay wires `review-security` to both read and depend on it.

**Holistic coverage**: `cross-phase-consistency` (validation phase) reads and depends on all 5 new outputs.

**MVP methodology note**: Under MVP, the review/security/operations dependency steps are disabled, and disabled dependencies are treated as satisfied by `computeEligible()`. This means cross-service steps could become eligible without reviewed inputs — consistent with how MVP handles all steps (skip ceremony, go fast). Multi-service projects are complex enough that MVP is not the recommended methodology, but the system handles it consistently. Wave 3b can add methodology-level constraints if needed.

---

## Section 3: Knowledge Documents

Eight new documents in `content/knowledge/core/`:

| Document | Topics |
|----------|--------|
| `multi-service-architecture.md` | Service boundary design, communication patterns (sync vs async), service discovery patterns (DNS, service mesh, sidecar), networking topology, data ownership |
| `multi-service-data-ownership.md` | Table ownership, shared-nothing data, event-driven sync |
| `multi-service-api-contracts.md` | Internal API versioning, backward compat, retries, idempotency |
| `multi-service-auth.md` | mTLS, service tokens, zero-trust, audience scoping |
| `multi-service-observability.md` | Distributed tracing, correlation IDs, cross-service SLOs |
| `multi-service-testing.md` | Contract tests, Pact/schema registry, cross-service E2E |
| `multi-service-resilience.md` | Circuit breakers, bulkheads, timeout budgets, failure isolation |
| `multi-service-task-decomposition.md` | Breaking multi-service work into per-service implementation waves |

---

## Section 4: Multi-Service Overlay

`content/methodology/multi-service-overlay.yml`:

```yaml
name: multi-service
description: >
  Cross-service pipeline steps and knowledge for multi-service monorepos.
  Activated by presence of services[] in config.

# ---------------------------------------------------------------------------
# step-overrides
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# knowledge-overrides
# ---------------------------------------------------------------------------
knowledge-overrides:
  # Architecture awareness
  system-architecture:
    append: [multi-service-architecture, multi-service-resilience]
  # Domain/data awareness
  domain-modeling:
    append: [multi-service-data-ownership]
  database-schema:
    append: [multi-service-data-ownership]
  # API awareness
  api-contracts:
    append: [multi-service-api-contracts]
  review-api:
    append: [multi-service-api-contracts]
  # Operations awareness
  operations:
    append: [multi-service-observability, multi-service-resilience]
  review-operations:
    append: [multi-service-observability]
  # Security awareness
  security:
    append: [multi-service-auth]
  review-security:
    append: [multi-service-auth]
  # Testing awareness
  review-testing:
    append: [multi-service-testing]
  story-tests:
    append: [multi-service-testing]
  create-evals:
    append: [multi-service-testing]
  # Planning awareness
  implementation-plan:
    append: [multi-service-task-decomposition]
  implementation-plan-review:
    append: [multi-service-task-decomposition]

# ---------------------------------------------------------------------------
# reads-overrides
# ---------------------------------------------------------------------------
reads-overrides:
  # Planning reads cross-service artifacts
  implementation-plan:
    append: [service-ownership-map, inter-service-contracts]
  # Security review reads cross-service auth (order 952 < 960 allows this)
  review-security:
    append: [cross-service-auth]
  # Database schema reads ownership map for data partitioning
  database-schema:
    append: [service-ownership-map]
  # Validation phase reads all 5 new outputs for holistic review
  cross-phase-consistency:
    append:
      - service-ownership-map
      - inter-service-contracts
      - cross-service-auth
      - cross-service-observability
      - integration-test-plan

# ---------------------------------------------------------------------------
# dependency-overrides
# ---------------------------------------------------------------------------
# Reads alone don't gate execution — `next` only checks dependencies.
# These overrides ensure downstream steps wait for cross-service artifacts.
dependency-overrides:
  review-security:
    append: [cross-service-auth]
  database-schema:
    append: [service-ownership-map]
  implementation-plan:
    append: [service-ownership-map, inter-service-contracts]
  cross-phase-consistency:
    append:
      - service-ownership-map
      - inter-service-contracts
      - cross-service-auth
      - cross-service-observability
      - integration-test-plan
```

---

## Section 5: Preset Registration

All 5 new steps registered as `enabled: false` in `deep.yml`, `mvp.yml`, and `custom-defaults.yml`:

```yaml
# After the game steps block:
# Multi-service steps (enabled via multi-service overlay)
service-ownership-map: { enabled: false }
inter-service-contracts: { enabled: false }
cross-service-auth: { enabled: false }
cross-service-observability: { enabled: false }
integration-test-plan: { enabled: false }
```

This matches the game-step convention: disabled by default, enabled by overlay. Without preset registration, `buildGraph()` defaults to `enabled: true` while `next` treats missing presets as disabled — an inconsistency.

---

## Dependency Graph Summary

```
review-architecture (720)
  └─> service-ownership-map (721)
        ├─> inter-service-contracts (841) [also depends on review-api (840)]
        │     └─> integration-test-plan (942) [also depends on review-testing (910)]
        ├─> cross-service-auth (952) [also depends on security (950)]
        └─> cross-service-observability (941) [also depends on review-operations (940)]
```

No cycles. All dependencies point backward (lower order numbers). Verified: no order number collisions with existing steps.

---

## Testing Strategy

### Unit Tests
- `loadStructuralOverlay()` — valid YAML without project-type, missing name/description errors, malformed sections
- `PipelineOverlay` type rename — existing overlay-resolver tests updated
- Step-override conflict detection — project-type overlay sets step X enabled, structural overlay overrides
- Meta-prompt existence validation — overlay targets non-existent step → warning

### Integration Tests
- `resolveOverlayState()` with services[] config — verifies structural overlay activates and merges correctly
- `resolveOverlayState()` without services[] — verifies structural overlay does NOT activate
- `resolveOverlayState()` with services[] + project-type overlay — verifies stacking order (structural wins on conflicts)

### E2E Tests
- Multi-service config with `services[]` — overlay resolution produces correct step enablement, knowledge injection, and reads wiring
- Verify all 5 new steps appear in resolved pipeline when services[] present
- Verify all 5 new steps absent from resolved pipeline when services[] absent

---

## Review History

This design went through 3 rounds of multi-model review (Codex, Gemini, Claude):

**Round 1 (Section 1)**: 4 P1s, 3 P2s found and fixed — structural overlay pass scoping, separate loader, conflict warning mechanism, meta-prompt validation, type precision, naming, guard clarification.

**Round 2 (Section 2)**: 3 P1s, 3 P2s found and fixed — knowledge injection expanded from 3 to 15 steps, reads-overrides added for downstream wiring, review-security wired to read cross-service-auth, scope clarification for service-ownership-map.

**Round 3 (Complete design)**: 0 P0s, 0 P1s, 1 P2 remaining — expanded multi-service-architecture topic list to include service discovery/networking.

**Round 4 (Written spec)**: 2 P1s, 2 P2s found and fixed — added dependency-overrides section (reads don't gate execution), added reads fields to 4 step definitions missing them, documented MVP methodology behavior, fixed conflict-resolution text (compose not overwrite), tightened rename scope list.
