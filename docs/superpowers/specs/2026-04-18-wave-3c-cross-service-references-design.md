# Wave 3c: Cross-Service References Design

**Goal**: Enable a step in one service to read artifacts produced by another service, with export allowlisting and transitive resolution.

**Prerequisites**: Wave 3b (service-scoped state, StatePathResolver, per-service overlay resolution)

**Scope**: ~250–300 lines production code across ~12 files + ~130 lines test code. The smallest wave — mostly wiring into existing infrastructure plus a small read-only state loader and a cross-dep readiness helper shared by `run`/`next`/`status`.

---

## Section 1: Schema Changes

### 1.1 `exports` on ServiceConfig

An allowlist declaring which steps' artifacts a service makes available to other services. Closed by default — a service with no `exports` field exports nothing.

```yaml
# In .scaffold/config.yml
services:
  - name: shared-lib
    projectType: library
    exports:
      - step: api-contracts
      - step: domain-modeling
    libraryConfig: { ... }
```

**Schema**: `exports: z.array(z.object({ step: z.string().regex(SLUG_PATTERN) })).optional()` on `ServiceSchema`. `SLUG_PATTERN` is the same kebab-case regex used by `reads`/`dependencies` slugs — reuse the existing constant (`/^[a-z][a-z0-9-]*$/`). This fails at parse time on malformed step identifiers rather than deferring to runtime.

**Forbidden values**: Global steps (those in `multi-service-overlay.yml`'s `stepOverrides`, e.g., `service-ownership-map`, `inter-service-contracts`) MUST NOT appear in `exports`. Global steps live in root state and are shared by every service; exporting one would blur the "cross-service reference" contract and allow the same artifact to be reached through every service qualifier. Enforcement happens in `ProjectSchema.superRefine` using `loadGlobalStepSlugs()` and `ctx.addIssue({ code: 'custom', ... })` — the same Zod-issue pattern already used by existing refinements. Failures surface to the user via the existing `InvalidConfigError` path at the config loader; no new error class is needed.

**Type**: Add `exports?: Array<{ step: string }>` to `ServiceConfig` interface in `src/types/config.ts` (replacing the "No exports field — Wave 3c" comment at line 128).

### 1.2 `cross-reads` on MetaPromptFrontmatter

Declares which foreign service artifacts a step reads during assembly:

```yaml
# In a pipeline step's .md frontmatter
name: system-architecture
cross-reads:
  - service: shared-lib
    step: api-contracts
  - service: trading-engine
    step: domain-modeling
```

**Type**: `crossReads?: Array<{ service: string; step: string }>` on `MetaPromptFrontmatter` in `src/types/frontmatter.ts`.

**Frontmatter parsing** in `src/project/frontmatter.ts` requires 4 touch points:
1. Add `'cross-reads'` to `KNOWN_YAML_KEYS` set (suppresses unknown-field warning)
2. Add normalization in `normalizeRawObject` to convert `cross-reads` (kebab-case) → `crossReads` (camelCase)
3. Add validation in `frontmatterSchema` — each entry's `service` and `step` validated with the same `SLUG_PATTERN` used for `exports.step`
4. Add `crossReads: []` to `emptyFrontmatter` fallback (line ~275)

---

## Section 2: Cross-Service Dependency Edges + Transitive Resolution

### 2.1 `crossDependencies` on DependencyNode

```typescript
// src/types/dependency.ts
interface DependencyNode {
  slug: string
  phase: string | null
  order: number | null
  dependencies: string[]
  crossDependencies?: Array<{ service: string; step: string }>  // NEW
  enabled: boolean
}
```

**Non-blocking**: Cross-dependencies do NOT gate step execution. Foreign service steps may have been completed in a previous session, a different worktree, or by a different agent. They are purely informational.

**Source**: Built from `crossReads` frontmatter during `buildGraph()`. For each `cross-reads` entry on a step, a corresponding `crossDependencies` entry is added to that step's `DependencyNode`.

**Overlay-first lookup**: Following the established `pipeline.overlay.X[step] ?? metaPrompt.frontmatter.X` pattern used for `knowledge`, `reads`, and `dependencies`, `crossReads` is threaded through `OverlayState` with a default of `{}`. `buildGraph()` and `run.ts` read `pipeline.overlay.crossReads[step] ?? metaPrompt.frontmatter.crossReads ?? []`. The overlay map is always empty in Wave 3c (no `crossReads-overrides` support yet), but the seam exists so the post-release roadmap item "Overlay crossReads Overrides" is a ~50-line addition rather than a broad refactor touching every display command.

**Display**: `scaffold next --service api` and `scaffold status --service api` show cross-service readiness via the shared helper defined in Section 3.4: "Note: system-architecture cross-reads shared-lib:api-contracts (completed)" or "(not yet completed)" or "(service not bootstrapped)".

### 2.2 Transitive Cross-Reads Resolution

When service A's step cross-reads service B's `api-contracts`, and service B's `api-contracts` step template itself has cross-reads from service C, service A transitively receives service C's artifacts too.

**Why frontmatter recursion is correct (and its limits)**: Cross-reads entries contain explicit `service:step` pairs. The frontmatter template is global and step templates are single-sourced from `content/pipeline/` today, so looking up the foreign template by step slug alone is valid. If a future wave introduces per-service step template overrides (an evolution of "overlay crossReads-overrides"), transitive resolution must key by `service:step`, not `step` — flagged here so the assumption is explicit.

**Tool-category guard**: `context.metaPrompts` can contain `category: 'tool'` entries (when `includeTools: true`). Tool entries have no step-level cross-reads semantics and their frontmatter does not participate in the pipeline graph. The transitive lookup skips any foreign meta whose `category === 'tool'`.

**Resolution algorithm** (artifact-dedup via Map, return `{completed, artifacts}` so aggregator steps with no artifacts still recurse):

```typescript
function resolveTransitiveCrossReads(
  crossReads: Array<{ service: string; step: string }>,
  config: ScaffoldConfig,
  projectRoot: string,
  metaPrompts: Map<string, MetaPromptFile>,         // required for transitive lookup
  output: OutputContext,                             // warnings
  visiting: Set<string>,                             // gray — cycle detection
  resolved: Map<string, ArtifactEntry[]>,            // black — memoized full closure
  foreignStateCache: Map<string, PipelineState | null>, // per-service cache
): ArtifactEntry[] {
  const closure = new Map<string, ArtifactEntry>()   // filePath → entry (dedup during traversal)
  for (const cr of crossReads) {
    const key = `${cr.service}:${cr.step}`
    if (visiting.has(key)) continue                  // cycle — skip silently
    if (resolved.has(key)) {                         // already resolved — reuse full closure
      for (const a of resolved.get(key)!) closure.set(a.filePath, a)
      continue
    }
    visiting.add(key)

    // Direct resolution returns { completed, artifacts } — see Section 3.3
    const direct = resolveDirectCrossRead(cr, config, projectRoot, output, foreignStateCache)

    // Transitive: recurse if the foreign step is completed, regardless of artifact count.
    // An aggregator step (completed, produces []) still has meaningful transitive deps.
    let transitive: ArtifactEntry[] = []
    if (direct.completed) {
      const foreignMeta = metaPrompts.get(cr.step)
      const isToolTemplate = foreignMeta?.frontmatter.category === 'tool'
      if (!isToolTemplate && foreignMeta?.frontmatter.crossReads?.length) {
        transitive = resolveTransitiveCrossReads(
          foreignMeta.frontmatter.crossReads,
          config, projectRoot, metaPrompts, output,
          visiting, resolved, foreignStateCache,
        )
      }
    }

    const fullClosure: ArtifactEntry[] = []
    for (const a of direct.artifacts) fullClosure.push(a)
    for (const a of transitive) fullClosure.push(a)
    for (const a of fullClosure) closure.set(a.filePath, a)

    visiting.delete(key)
    resolved.set(key, fullClosure)                   // cache FULL closure (direct + transitive)
  }
  return [...closure.values()]
}
```

**Safety mechanisms**:
- **Cycle detection**: `visiting` set (gray nodes) prevents infinite loops. Cycles are structural, skipped silently.
- **Memoization**: `resolved` map (black nodes) caches the full closure (direct + transitive) per `service:step` for efficiency.
- **Per-service state cache**: `foreignStateCache` prevents re-reading + re-migrating the same foreign `state.json` when multiple cross-reads target the same service.
- **Per-traversal dedup**: `closure` Map keyed by `filePath` dedupes diamond dependencies inside the traversal (complements the outer `gatheredPaths` dedup in `run.ts`).
- **No depth limit**: cycle detection + memoization naturally bound recursion by unique `service:step` nodes.

### 2.3 Edge Case Behaviors

| Scenario | Behavior |
|----------|----------|
| Unknown service (not in `services[]`) | Warn + skip |
| Service has no `exports` field | Closed by default — warn + skip |
| Step not in service's `exports` | Warn + skip |
| Exports entry names a **global step** | Rejected at config parse time via `ProjectSchema.superRefine` → `InvalidConfigError` — never reaches cross-read resolution |
| Cross-read targets a global step | Warn + skip at resolution time (defense-in-depth via optional `globalSteps: Set<string>` passed from `run.ts` / display helpers) |
| Foreign state file missing | Warn + skip ("service not bootstrapped") |
| Foreign step not completed | Skip (only completed steps yield artifacts, matching existing `reads` behavior). Transitive recursion also skipped. |
| Foreign step completed, `produces: []` | `direct.artifacts = []` but `direct.completed = true` — transitive recursion proceeds |
| Foreign step disabled but completed | Include (artifact exists and is valid — checking enablement would require resolving the foreign service's overlay, which is expensive and unnecessary since the content is already produced) |
| Foreign step disabled and not completed | Skip (no artifact to read) |
| Foreign step skipped | Skip (`direct.completed = false`, no transitive recursion) |
| Foreign meta has `category: 'tool'` | Skip transitive lookup (tools have no pipeline-step cross-reads semantics) |
| Cycle detected (A→B→A) | Skip silently (structural, not an error) |
| Path containment rejected on foreign artifact | Warn with `ARTIFACT_PATH_REJECTED` (matching existing `reads` loop behavior in `run.ts`) + skip the offending artifact |

---

## Section 3: Artifact Gathering Integration

### 3.1 Integration into `run.ts`

After the existing reads gathering loop, add a cross-reads loop using the overlay-first lookup and the new shared cache:

```typescript
// Cross-reads artifact gathering (after existing reads loop)
// Uses the same `gatheredPaths` Set as existing dep/reads loops for outer dedup.
const crossReadsSource =
  pipeline.overlay.crossReads?.[stepSlug] ?? metaPrompt.frontmatter.crossReads ?? []
if (crossReadsSource.length > 0) {
  const foreignStateCache = new Map<string, PipelineState | null>()
  const crossArtifacts = resolveTransitiveCrossReads(
    crossReadsSource,
    config,
    projectRoot,
    context.metaPrompts,
    output,
    new Set(),
    new Map(),
    foreignStateCache,
  )
  for (const artifact of crossArtifacts) {
    if (!gatheredPaths.has(artifact.filePath)) {
      gatheredPaths.add(artifact.filePath)
      artifacts.push(artifact)
    }
  }
}
```

### 3.2 Read-Only Foreign State Loader

**Why a dedicated loader**: `StateManager.loadState()` runs `migrateState(state)` and calls `this.saveState(state)` when step renames, retired steps, or artifact aliases apply (state-manager.ts:60–62). Using a regular `StateManager` for cross-reads would:

1. Silently write to the foreign service's state file on first cross-read after an upgrade.
2. Recompute `next_eligible` using whatever `computeEligible` was passed — a sentinel `() => []` clobbers it to `[]`.
3. Perform this write without holding the foreign service's lock, racing any concurrent `scaffold run --service <foreign>` invocation.

All three are real hazards (verified against state-manager.ts). The spec **does not** rely on "v3 state never migrates" — that rationale is incorrect because `migrateState` is independent of schema-version dispatch.

**Fix**: Add a read-only loader to `StateManager` that parses + applies migrations in memory but never writes:

```typescript
// src/state/state-manager.ts — new static helper
export class StateManager {
  // ... existing methods ...

  /**
   * Load state WITHOUT side effects (no saveState, no next_eligible recompute, no lock).
   * Applies dispatchStateMigration + migrateState in memory only.
   * Use ONLY for read-only inspection of foreign state (cross-reads, readiness display).
   * The returned PipelineState is a detached snapshot — mutating it does not persist.
   */
  static loadStateReadOnly(
    projectRoot: string,
    pathResolver: StatePathResolver,
    configProvider?: () => { project?: { services?: unknown[] } } | undefined,
  ): PipelineState {
    const statePath = pathResolver.statePath
    if (!fileExists(statePath)) throw stateMissing(statePath)

    const raw = fs.readFileSync(statePath, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>

    const ctx = { hasServices: (configProvider?.()?.project?.services?.length ?? 0) > 0 }
    dispatchStateMigration(parsed, ctx, statePath)

    const state = parsed as unknown as PipelineState
    migrateState(state)  // in-memory only; do NOT saveState

    if (pathResolver.isServiceScoped) {
      const globalStatePath = path.join(pathResolver.rootScaffoldDir, 'state.json')
      if (fs.existsSync(globalStatePath)) {
        const globalRaw = fs.readFileSync(globalStatePath, 'utf8')
        const globalParsed = JSON.parse(globalRaw) as Record<string, unknown>
        const globalState = globalParsed as unknown as PipelineState
        state.steps = { ...globalState.steps, ...state.steps }
      }
    }
    return state
  }
}
```

Takes `(projectRoot, pathResolver, configProvider?)` only — no positional fragility from the full `StateManager` constructor. `configProvider` is optional because read-only callers that don't need v1→v2 schema dispatch (all callers post-Wave-3b) can omit it.

### 3.3 Direct Cross-Read Resolution

```typescript
function resolveDirectCrossRead(
  cr: { service: string; step: string },
  config: ScaffoldConfig,
  projectRoot: string,
  output: OutputContext,
  foreignStateCache: Map<string, PipelineState | null>,
): { completed: boolean; artifacts: ArtifactEntry[] } {
  // 1. Validate service exists
  const serviceEntry = config.project?.services?.find(s => s.name === cr.service)
  if (!serviceEntry) {
    output.warn(`cross-reads: service '${cr.service}' not found`)
    return { completed: false, artifacts: [] }
  }

  // 2. Check exports allowlist (global steps already rejected at parse time)
  if (!serviceEntry.exports?.some(e => e.step === cr.step)) {
    output.warn(`cross-reads: '${cr.step}' not exported by '${cr.service}'`)
    return { completed: false, artifacts: [] }
  }

  // 3. Load foreign service state via read-only loader (cached per service)
  let foreignState = foreignStateCache.get(cr.service)
  if (foreignState === undefined) {
    const foreignResolver = new StatePathResolver(projectRoot, cr.service)
    if (!fs.existsSync(foreignResolver.statePath)) {
      output.warn(`cross-reads: service '${cr.service}' not bootstrapped`)
      foreignStateCache.set(cr.service, null)
      return { completed: false, artifacts: [] }
    }
    try {
      foreignState = StateManager.loadStateReadOnly(projectRoot, foreignResolver)
      foreignStateCache.set(cr.service, foreignState)
    } catch {
      output.warn(`cross-reads: failed to load state for '${cr.service}'`)
      foreignStateCache.set(cr.service, null)
      return { completed: false, artifacts: [] }
    }
  }
  if (!foreignState) return { completed: false, artifacts: [] }

  // 4. Check step is completed (artifacts require completion)
  const stepEntry = foreignState.steps?.[cr.step]
  if (!stepEntry || stepEntry.status !== 'completed') {
    return { completed: false, artifacts: [] }
  }

  // 5. Resolve artifacts with containment check + warning symmetry with existing reads loop
  const artifacts: ArtifactEntry[] = []
  for (const relPath of stepEntry.produces ?? []) {
    const fullPath = resolveContainedArtifactPath(projectRoot, relPath)
    if (!fullPath) {
      output.warn(
        `cross-reads: ARTIFACT_PATH_REJECTED for ${cr.service}:${cr.step} (${relPath}) — outside project root`,
      )
      continue
    }
    if (!fs.existsSync(fullPath)) continue
    artifacts.push({
      stepName: `${cr.service}:${cr.step}`,  // qualified name for cross-service context
      filePath: relPath,
      content: fs.readFileSync(fullPath, 'utf8'),
    })
  }
  return { completed: true, artifacts }
}
```

### 3.4 Cross-Dependency Readiness Helper

`scaffold next --service <id>` and `scaffold status --service <id>` both surface cross-dep readiness. Both must do the same foreign-state inspection, in the same order, with the same warning behavior — so the logic lives in one helper both commands call.

```typescript
// src/core/assembly/cross-reads.ts (new file)
export type CrossReadStatus =
  | 'completed'        // foreign step completed
  | 'pending'          // foreign step exists in state but not completed, OR is exported but not yet tracked (pre-run)
  | 'not-bootstrapped' // foreign service has no state.json
  | 'read-error'       // foreign state.json exists but could not be loaded (corrupt JSON, schema mismatch, etc.)
  | 'service-unknown'  // foreign service not in config
  | 'not-exported'     // step not in foreign service's exports allowlist

export interface CrossReadReadiness {
  service: string
  step: string
  status: CrossReadStatus
}

export function resolveCrossReadReadiness(
  crossReads: Array<{ service: string; step: string }>,
  config: ScaffoldConfig,
  projectRoot: string,
): CrossReadReadiness[] {
  const cache = new Map<string, PipelineState | null>()  // per-service state cache
  return crossReads.map(cr => {
    const serviceEntry = config.project?.services?.find(s => s.name === cr.service)
    if (!serviceEntry) return { ...cr, status: 'service-unknown' }
    if (!serviceEntry.exports?.some(e => e.step === cr.step)) return { ...cr, status: 'not-exported' }

    let state = cache.get(cr.service)
    if (state === undefined) {
      const resolver = new StatePathResolver(projectRoot, cr.service)
      if (!fs.existsSync(resolver.statePath)) {
        cache.set(cr.service, null)
        return { ...cr, status: 'not-bootstrapped' }
      }
      try {
        state = StateManager.loadStateReadOnly(projectRoot, resolver)
        cache.set(cr.service, state)
      } catch {
        cache.set(cr.service, null)
        return { ...cr, status: 'not-bootstrapped' }
      }
    }
    if (!state) return { ...cr, status: 'not-bootstrapped' }

    const entry = state.steps?.[cr.step]
    return { ...cr, status: entry?.status === 'completed' ? 'completed' : 'pending' }
  })
}
```

Both `next` and `status` call this once per step with a `crossDependencies` entry, group the results for display, and surface the same strings: "completed", "pending", "service not bootstrapped", "service unknown", "not exported".

### 3.5 Path Containment

All cross-service artifact reads go through `resolveContainedArtifactPath()` (Wave 0). The helper's `realpathSync` + containment check prevents any path traversal across service boundaries. When containment fails, the cross-reads loop emits `ARTIFACT_PATH_REJECTED` (matching the existing `reads` loop in `run.ts:412-418`) instead of silently skipping.

### 3.6 JSON Output Schema for `next` / `status`

`next --json` and `status --json` gain a `crossDependencies` field per surfaced step (or null when there are none):

```json
{
  "slug": "system-architecture",
  "status": "pending",
  "crossDependencies": [
    { "service": "shared-lib", "step": "api-contracts", "status": "completed" },
    { "service": "trading-engine", "step": "domain-modeling", "status": "not-bootstrapped" }
  ]
}
```

`crossDependencies` is absent (undefined) when the step has no `cross-reads`. The field is additive — existing JSON consumers ignore unknown fields (ADR-033 forward compatibility).

---

## Section 4: Refactoring Scope

### Files Modified / Created

| File | Change |
|------|--------|
| `src/types/config.ts` | Add `exports` to `ServiceConfig` interface |
| `src/config/schema.ts` | Add `exports` to `ServiceSchema` with `SLUG_PATTERN` + global-step refinement |
| `src/types/frontmatter.ts` | Add `crossReads` to `MetaPromptFrontmatter` |
| `src/project/frontmatter.ts` | Parse `cross-reads` YAML → `crossReads` camelCase (4 touch points) with `SLUG_PATTERN` validation |
| `src/types/dependency.ts` | Add `crossDependencies` to `DependencyNode` |
| `src/core/dependency/graph.ts` | Populate `crossDependencies` from overlay-first lookup |
| `src/core/assembly/overlay-state.ts` | Add `crossReads: Record<string, Array<{service,step}>>` to `OverlayState`, default `{}` |
| `src/core/assembly/cross-reads.ts` | **NEW** — `resolveDirectCrossRead`, `resolveTransitiveCrossReads`, `resolveCrossReadReadiness`, `CrossReadReadiness` types |
| `src/state/state-manager.ts` | Add `static loadStateReadOnly(projectRoot, pathResolver, configProvider?)` |
| ~~`src/utils/user-errors.ts`~~ | ~~New error class~~ — dropped in Round-5 review: ProjectSchema.superRefine uses a plain Zod custom issue, matching the existing `InvalidConfigError` path |
| `src/cli/commands/run.ts` | Cross-reads artifact gathering loop (uses helper from `cross-reads.ts`) |
| `src/cli/commands/next.ts` | Cross-dependency readiness display (text + JSON per Section 3.6) |
| `src/cli/commands/status.ts` | Cross-dependency readiness display (text + JSON per Section 3.6) |
| `src/core/pipeline/resolver.ts` | Verify crossReads flows through to buildGraph (expected: no changes — frontmatters already passed) |
| `src/types/assembly.ts` | Verify `ArtifactEntry` shape supports qualified `stepName` (expected: no changes — `stepName: string` is already free-form) |

---

## Section 5: Testing Strategy

| Category | Count | Coverage |
|----------|-------|---------|
| Schema | 5 | exports field valid/invalid/optional on ServiceSchema; SLUG_PATTERN rejects malformed; global-step rejected by `InvalidServiceExportError` |
| Frontmatter | 4 | cross-reads parsed, empty, absent, KNOWN_YAML_KEYS no warning; SLUG_PATTERN enforced |
| Read-only loader | 3 | `loadStateReadOnly` returns valid state; **asserts no write to foreign `state.json` even when migrateState applies renames**; merged global+service view works |
| Artifact resolution | 5 | happy path, non-exported warning, missing service warning, containment path-rejection emits `ARTIFACT_PATH_REJECTED` warning, dedup with gatheredPaths |
| Transitive | 6 | A→B→C resolves, cycle detection, memoization caches full closure, completed-with-empty-artifacts still recurses, tool-category skipped for transitive lookup, diamond dep deduped inside traversal |
| Graph | 2 | crossDependencies populated via overlay-first lookup, absent when no cross-reads |
| Readiness helper | 3 | `resolveCrossReadReadiness` returns correct status for each of the 5 `CrossReadStatus` values; per-service cache avoids duplicate loads; works with no cross-reads |
| Concurrency | 1 | Cross-read completes while foreign service's lock is held (no deadlock, no write to foreign state) |
| Display | 4 | `next --service` text + JSON cross-dep readiness; `status --service` text + JSON cross-dep readiness |
| E2E | 2 | cross-read resolves foreign artifact in `scaffold run`; transitive chain resolves end-to-end |
| **Total** | **35** | |

---

## Section 6: Out of Scope

- **Automatic cross-service invalidation**: Changing service A's artifacts does not automatically invalidate service B's derived steps. Manual re-run is required.
- **`crossReads` overlay overrides**: The multi-service overlay does not yet support `cross-reads-overrides`. The `OverlayState.crossReads` field exists and is always `{}` in Wave 3c — the seam is there so a future wave adds overrides as a ~50-line addition rather than a broad refactor. Defined explicitly in the roadmap as a post-release item.
- **Per-service template overrides**: Step templates remain single-sourced from `content/pipeline/`. If a future wave introduces per-service overrides, the transitive resolver must key `metaPrompts` by `service:step` rather than `step` (flagged in Section 2.2).

---

## Section 7: Review History

**Round 1 (Section 2)**: Codex found 3 P1s, 2 P2s — all fixed:
- P1: Frontmatter recursion seam questioned → justified (cross-reads are service-qualified)
- P1: Cycle detection needs visiting+resolved memoization → implemented DFS coloring
- P1: Missing foreign state must be non-fatal → warn + skip
- P2: Depth limit 5 arbitrary → removed (cycle detection + memoization suffice)
- P2: Export edge cases undefined → full table added

**Round 2 (Full spec — Codex + Gemini)**: 1 P0, 4 P1s, 2 P2s — all fixed:
- P0: ArtifactEntry uses wrong shape → fixed to use existing `{ stepName, filePath, content }` with qualified `service:step`
- P1: Memoization caches only direct artifacts → fixed to cache full closure
- P1: `metaPrompts` not in function signature → added as required parameter
- P1: Raw JSON.parse bypasses StateManager → changed to use StateManager canonical load path
- P1: Missing KNOWN_YAML_KEYS update → added 4 explicit frontmatter parser touch points
- P1: Integration bypasses gatheredPaths dedup → fixed to use existing dedup Set
- P2: Refactoring table missing resolver.ts + assembly.ts → added
- P2: Test count 17 too low → increased to 25 with display + E2E coverage

**Round 3 (Full spec revised — Codex + Gemini)**: 0 P0, 3 P1, 2 P2 — all fixed:
- P1: Prose said "direct artifacts" but code caches full closure → prose fixed
- P1: StateManager() → [] could trigger bad saveState → (INCORRECTLY) resolved with rationale "v3 states don't trigger migration"
- P1: Disabled-but-completed foreign step → include (artifact exists)
- P2: resolver.ts may not need changes → noted as "verify only"

**Round 5 (Plan review — Codex + Gemini)**: 0 P0 on spec, plan changes cascaded back — all fixed:
- Dropped `InvalidServiceExportError` — never actually thrown; ProjectSchema uses plain Zod custom issue (same pattern as existing refinements).
- `MetaPromptFrontmatter.crossReads` changed from required to optional on the interface (Zod `.default([])` keeps parsed output consistent). Lets existing typed fixtures compile.
- `OverlayState.crossReads` changed from required to optional. The fallback branch in `resolver.ts:89` and the hoisted `resolveOverlayState` mocks in `run.test.ts`/`next.test.ts`/`status.test.ts` now continue to compile without per-mock updates.
- `resolveDirectCrossRead` + `resolveTransitiveCrossReads` gained an optional `globalSteps?: Set<string>` parameter for runtime defense-in-depth (per §2.3 edge case). `run.ts` passes `pipeline.globalSteps` through.

**Round 4 (Full spec re-review — Codex + Gemini + Gemini-equivalent compensating)**: 1 P0, 7 P1s, 6 P2s — all fixed:
- **P0**: Round 3 rationale for `new StateManager(..., () => [], ...)` was wrong. `migrateState()` (STEP_RENAMES, RETIRED_STEPS, ARTIFACT_ALIASES) is independent of schema-version dispatch, still fires on v3 state the first time cross-reads land on a service whose state was written pre-Wave-3a, and triggers `saveState()` with the `() => []` sentinel — clobbering foreign `next_eligible` AND racing the foreign service's lock. Fix: new `StateManager.loadStateReadOnly()` that applies migrations in memory only (Section 3.2).
- P1 (Codex): Merged global+service view in foreign loader could expose global steps via `exports` → forbid global steps in `exports` at parse time with `InvalidServiceExportError` + defense-in-depth skip at resolve time (Sections 1.1 + 2.3).
- P1 (Codex): JSON output contract for cross-reads undefined → new Section 3.6 specifies the `crossDependencies` field shape on `next`/`status` JSON output.
- P1 (Gemini-comp): `status`/`next` display logic underspecified → new Section 3.4 with shared `resolveCrossReadReadiness()` helper + `CrossReadStatus` type.
- P1 (Gemini-comp): Silent path-rejection skip broke symmetry with existing `reads` loop → `ARTIFACT_PATH_REJECTED` warning now emitted (Sections 2.3 + 3.3 + 3.5).
- P1 (Gemini-comp): Transitive-lookup assumption (step templates single-sourced) + `category: 'tool'` leak → documented in Section 2.2 + guard added in resolver.
- P1 (Gemini): `output` parameter missing from resolver signatures → added as required parameter (Section 2.2 + 3.3).
- P1 (Gemini): Recursion gated on `direct.length > 0` broke aggregator chains → `resolveDirectCrossRead` now returns `{ completed, artifacts }` (Section 3.3).
- P2 (Codex): Missing kebab-case validation for `exports`/`cross-reads` identifiers → `SLUG_PATTERN` applied at parse time (Sections 1.1 + 1.2).
- P2 (Gemini-comp): OverlayState not threaded with `crossReads` → added now with default `{}` to avoid later refactor (Sections 2.1 + 4).
- P2 (Gemini-comp): Positional-arg fragility on `StateManager` constructor → read-only loader takes `(projectRoot, pathResolver, configProvider?)` only (Section 3.2).
- P2 (Gemini-comp): Per-call foreign state re-reads → per-service cache `Map<serviceName, PipelineState | null>` threaded through resolver + readiness helper (Sections 2.2 + 3.3 + 3.4).
- P2 (Gemini-comp): Test gaps → added 3 tests: no-saveState assertion on foreign path, lock-held concurrency test, tool-category skip (Section 5).
- P2 (Gemini): Diamond-dep memory spike → inner traversal dedup via `Map<filePath, entry>` (Section 2.2).

The Round 4 Gemini pass succeeded on retry after an initial 429; findings from both Gemini and the compensating `claude -p` channel converged on the P0 independently.
