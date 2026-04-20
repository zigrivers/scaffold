# Overlay `crossReads` Overrides Design

**Goal**: Let pipeline overlays append per-step `crossReads` entries, so projects with heterogeneous service relationships can express them in the overlay rather than forking step templates.

**Prerequisites**: v3.17.0 (Wave 3c ships the `OverlayState.crossReads` seam, already empty `{}`).

**Scope**: ~60 LOC production + ~80 LOC tests. Mirrors the existing `knowledge-overrides` append-only pattern rather than `reads-overrides` replace+append (see §4).

---

## Section 1: Schema Changes

### 1.1 `CrossReadsOverride` type

```typescript
// src/types/config.ts
export interface CrossReadsOverride {
  append: Array<{ service: string; step: string }>
}
```

Append-only for the initial feature; mirrors `KnowledgeOverride` which also uses `append` only. See §4 "Out of scope" for why `replace` is deferred.

**API quirk (matches existing precedent)**: `parseCrossReadsOverrides` silently ignores any `replace` key or other unrecognized properties inside an entry object — exactly like `parseKnowledgeOverrides` does today. A future reader might wonder why `{ append: [...], replace: {...} }` in YAML doesn't warn about `replace`. The answer: same reason `knowledge-overrides` doesn't — both are append-only and drop unknown per-entry keys silently.

### 1.2 `crossReadsOverrides` on `PipelineOverlay`

```typescript
export interface PipelineOverlay {
  // ... existing fields ...
  crossReadsOverrides: Record<string, CrossReadsOverride>  // NEW — keyed by step slug
}
```

All callers that construct `PipelineOverlay` default this to `{}` if absent from YAML. Test fixtures that construct `PipelineOverlay` literals must be updated (see §6).

### 1.3 `OverlayState.crossReads` becomes required

In v3.17.0, `OverlayState.crossReads` was `?: Record<...>` (optional, always `{}`) to match the empty seam. With this feature, `resolveOverlayState` fully populates it from frontmatter plus overlay overrides, so the field becomes required:

```typescript
export interface OverlayState {
  // ... existing fields ...
  crossReads: Record<string, Array<{ service: string; step: string }>>  // drop '?'
}
```

Consumer sites currently read `overlay.crossReads?.[slug] ?? metaPrompt.frontmatter.crossReads ?? []`. They continue to work unchanged — the `?.` is defensive and harmless now that the field is always present. A follow-up cleanup can drop both the optional-chain and the frontmatter fallback, but that's out of scope here to keep the diff small.

### 1.3 YAML surface

```yaml
# content/methodology/multi-service-overlay.yml (example)
cross-reads-overrides:
  system-architecture:
    append:
      - service: billing
        step: api-contracts
      - service: inventory
        step: domain-modeling
  api-contracts:
    append:
      - service: shared-lib
        step: api-contracts
```

Kebab-case `cross-reads-overrides` YAML → camelCase `crossReadsOverrides` on `PipelineOverlay`.

---

## Section 2: Parser

### 2.1 `parseCrossReadsOverrides()`

A new warning factory is added to `src/utils/errors.ts` for item-level rejection. The existing `overlayMalformedEntry` hardcodes the message "ignoring entry", which would mislead users when we're dropping a single bad `append` item but preserving valid siblings. The new factory matches the actual semantics:

```typescript
// src/utils/errors.ts — new factories alongside the existing overlay warning factories
export function overlayMalformedAppendItem(
  step: string,
  index: number,
  file: string,
): ScaffoldWarning {
  return {
    code: 'OVERLAY_MALFORMED_APPEND_ITEM',
    message: `Overlay entry "${step}" append[${index}] is malformed — ignoring that item`,
    context: { step, index, file },
  }
}

export function overlayCrossReadsNotAllowed(file: string): ScaffoldWarning {
  return {
    code: 'OVERLAY_CROSS_READS_NOT_ALLOWED',
    message:
      'cross-reads-overrides is only valid in structural overlays — '
      + `stripping from ${path.basename(file)}`,
    context: { file },
  }
}
```

Include the `index` on the append-item warning so users can locate which item in a multi-element `append` array was dropped. Both factories live alongside the existing overlay warning factories (`overlayMalformedEntry`, `overlayMalformedSection`) in `src/utils/errors.ts` for consistency.


```typescript
// src/core/assembly/overlay-loader.ts (new function)
export function parseCrossReadsOverrides(
  raw: Record<string, unknown>,
  warnings: ScaffoldWarning[],
  filePath: string,
): Record<string, CrossReadsOverride> {
  const SLUG = /^[a-z][a-z0-9-]*$/
  const result: Record<string, CrossReadsOverride> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isPlainObject(value)) {
      warnings.push(overlayMalformedEntry(key, 'value', filePath))
      continue
    }
    const obj = value as Record<string, unknown>
    if (obj['append'] !== undefined && !Array.isArray(obj['append'])) {
      warnings.push(overlayMalformedEntry(key, 'append', filePath))
    }
    const append: Array<{ service: string; step: string }> = []
    if (Array.isArray(obj['append'])) {
      for (let index = 0; index < obj['append'].length; index++) {
        const item = obj['append'][index]
        // Warn on any malformed item (missing/invalid service or step, or non-object item).
        // Valid siblings are preserved; only the malformed item is dropped.
        if (!isPlainObject(item)) {
          warnings.push(overlayMalformedAppendItem(key, index, filePath))
          continue
        }
        const entry = item as Record<string, unknown>
        if (
          typeof entry['service'] === 'string' && SLUG.test(entry['service']) &&
          typeof entry['step'] === 'string' && SLUG.test(entry['step'])
        ) {
          append.push({ service: entry['service'], step: entry['step'] })
        } else {
          warnings.push(overlayMalformedAppendItem(key, index, filePath))
        }
      }
    }
    result[key] = { append }
  }
  return result
}
```

### 2.2 Integration into `loadOverlay` and `loadStructuralOverlay`

**`loadStructuralOverlay`** (the multi-service overlay path — the valid use site for `cross-reads-overrides`):
1. Add `'cross-reads-overrides'` to the `overrideSections` tuple (for malformed-section warnings).
2. Extract `crossReadsOverridesRaw = isPlainObject(obj['cross-reads-overrides']) ? ... : {}`.
3. Call `parseCrossReadsOverrides(...)` when building the `PipelineOverlay`.

**`loadOverlay`** (the project-type path — `cross-reads-overrides` forbidden here per §4.1):
1. Detect the field with `obj['cross-reads-overrides'] !== undefined` (NOT truthy-check — a user explicit `cross-reads-overrides: ~` parses to `null`, which is still a declaration the loader should flag).
2. If present, push `overlayCrossReadsNotAllowed(overlayPath)` (factory defined in §2.1).
3. Do **not** parse the raw value — set `crossReadsOverrides: {}` on the returned overlay.
4. Continue with existing parse logic for the other four sections.

### 2.3 Sub-overlay stripping

`loadSubOverlay` wraps `loadOverlay`. Because `loadOverlay` already strips `cross-reads-overrides` with `OVERLAY_CROSS_READS_NOT_ALLOWED` (§4.1), a sub-overlay that declares `cross-reads-overrides` will surface that warning via the wrapper; by the time `loadSubOverlay` inspects the parsed overlay, `crossReadsOverrides` is already `{}`.

Still update `loadSubOverlay` as follows:

1. **Defense-in-depth strip**: include a `hasCrossReads = Object.keys(overlay.crossReadsOverrides ?? {}).length > 0` check in the disjunction and add `overlay.crossReadsOverrides = {}` inside the block. This is a no-op today (because `loadOverlay` already stripped it) but guards against a future loader path that bypasses the `loadOverlay` strip.
2. **Update warning text**: change `SUB_OVERLAY_NON_KNOWLEDGE` from `(step/reads/dependency overrides)` → `(step/reads/dependency/cross-reads overrides)` so the diagnostic accurately describes the full enforcement surface.

```typescript
// Note: `hasCrossReads` is defense-in-depth. The parent `loadOverlay`
// strips `cross-reads-overrides` first (emitting OVERLAY_CROSS_READS_NOT_ALLOWED),
// so `overlay.crossReadsOverrides` is already {} by the time we inspect it here.
// The branch guards against a future code path that bypasses loadOverlay.
if (hasStep || hasReads || hasDeps || hasCrossReads) {
  warnings.push({ code: 'SUB_OVERLAY_NON_KNOWLEDGE', ... })
  overlay.stepOverrides = {}
  overlay.readsOverrides = {}
  overlay.dependencyOverrides = {}
  overlay.crossReadsOverrides = {}   // NEW (defense-in-depth — see note above)
}
```

---

## Section 3: Apply + Resolve

### 3.1 `applyOverlay`

Signature: insert `crossReadsMap` immediately before the `overlay: PipelineOverlay` argument, parallel to the existing `knowledgeMap`/`readsMap`/`dependencyMap`:

```typescript
export function applyOverlay(
  steps: Record<string, StepEnablementEntry>,
  knowledgeMap: Record<string, string[]>,
  readsMap: Record<string, string[]>,
  dependencyMap: Record<string, string[]>,
  crossReadsMap: Record<string, Array<{ service: string; step: string }>>,  // NEW
  overlay: PipelineOverlay,
): {
  steps: Record<string, StepEnablementEntry>
  knowledge: Record<string, string[]>
  reads: Record<string, string[]>
  dependencies: Record<string, string[]>
  crossReads: Record<string, Array<{ service: string; step: string }>>      // NEW in return
}
```

After the four existing merger calls, add:

```typescript
const mergedCrossReads = applyCrossReadsOverrides(
  crossReadsMap,
  overlay.crossReadsOverrides,
)

// Return value gains:
return { steps: mergedSteps, knowledge: mergedKnowledge, reads: mergedReads,
  dependencies: mergedDependencies, crossReads: mergedCrossReads }
```

And a new helper:

```typescript
function applyCrossReadsOverrides(
  inputMap: Record<string, Array<{ service: string; step: string }>>,
  overrides: Record<string, CrossReadsOverride>,
): Record<string, Array<{ service: string; step: string }>> {
  // Shallow-copy
  const result: Record<string, Array<{ service: string; step: string }>> = {}
  for (const [key, arr] of Object.entries(inputMap)) {
    result[key] = [...arr]
  }
  for (const [step, override] of Object.entries(overrides)) {
    const existing = result[step] ?? []
    const merged = [...existing, ...override.append]
    // Dedup by `service:step` pair (preserves first-occurrence order)
    const seen = new Set<string>()
    result[step] = merged.filter(e => {
      const k = `${e.service}:${e.step}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  return result
}
```

The `applyOverlay` signature gains a `crossReadsMap` input (parallel to `knowledgeMap`/`readsMap`/`dependencyMap`).

### 3.2 `resolveOverlayState`

Build a `crossReadsMap` from frontmatter alongside the existing maps, pass to `applyOverlay`, return the merged result as `OverlayState.crossReads`. This inverts the v3.17.0 decision to leave `OverlayState.crossReads` empty — now it's populated from frontmatter AND any overlay overrides, so consumers can read `overlay.crossReads?.[slug]` as the authoritative source.

**Population rule**: populate `crossReadsMap[name]` for **every step** (parallel to how `knowledgeMap`/`readsMap`/`dependencyMap` are populated one-entry-per-step), with `[...(mp.frontmatter.crossReads ?? [])]` as the initial value. Steps with no frontmatter cross-reads get `[]`, not a missing key. This is the shape `graph.ts:28` and `run.ts:440` expect via their overlay-first reads.

```typescript
const crossReadsMap: Record<string, Array<{ service: string; step: string }>> = {}
for (const [name, mp] of metaPrompts) {
  // ... existing knowledge/reads/dependencies population ...
  crossReadsMap[name] = [...(mp.frontmatter.crossReads ?? [])]
}
```

Callers already use the overlay-first fallback `overlay.crossReads?.[slug] ?? frontmatter.crossReads ?? []`, so existing behavior is preserved when no overrides are configured.

**Two-pass flow**: `resolveOverlayState` runs up to two `applyOverlay()` passes — once for the project-type overlay, once for the structural (multi-service) overlay. The working `overlayCrossReads` variable must be initialized from the frontmatter-built `crossReadsMap` and carried forward between passes, parallel to how `overlayKnowledge`/`overlayReads`/`overlayDependencies` are currently threaded:

```typescript
let overlaySteps = { ...presetSteps }
let overlayKnowledge = knowledgeMap
let overlayReads = readsMap
let overlayDependencies = dependencyMap
let overlayCrossReads = crossReadsMap   // NEW

// Each applyOverlay() call now returns FIVE maps — update both passes:
// pass 1 (project-type overlay)
const merged1 = applyOverlay(overlaySteps, overlayKnowledge, overlayReads,
  overlayDependencies, overlayCrossReads, overlay)
overlaySteps = merged1.steps
overlayKnowledge = merged1.knowledge
overlayReads = merged1.reads
overlayDependencies = merged1.dependencies
overlayCrossReads = merged1.crossReads   // NEW reassignment

// pass 2 (structural overlay) — same five-map reassignment

// Final return must include the merged crossReads (NOT the original crossReadsMap):
return {
  steps: overlaySteps,
  knowledge: overlayKnowledge,
  reads: overlayReads,
  dependencies: overlayDependencies,
  crossReads: overlayCrossReads,   // NEW — use the post-merge variable
}
```

Pass 1 is structurally parallel to the other map threading but a **no-op for crossReads in practice**: project-type overlays are forbidden from declaring `cross-reads-overrides` (§4.1), so `overlay.crossReadsOverrides` is always `{}` by the time pass 1 runs, and `applyCrossReadsOverrides` returns its input unchanged. The threading exists so the code treats `crossReads` uniformly with the other maps and so pass 2 (structural overlay — the real home for `cross-reads-overrides`) sees the correct map.

### 3.2.1 `resolvePipeline` fallback branch

`src/core/pipeline/resolver.ts` has a fallback branch (around line 80–89) that builds an `OverlayState` manually when there is no config:

```typescript
const knowledge: Record<string, string[]> = {}
const reads: Record<string, string[]> = {}
const dependencies: Record<string, string[]> = {}
for (const [name, mp] of metaPrompts) {
  knowledge[name] = [...(mp.frontmatter.knowledgeBase ?? [])]
  reads[name] = [...(mp.frontmatter.reads ?? [])]
  dependencies[name] = [...(mp.frontmatter.dependencies ?? [])]
}
overlay = { steps: mergedSteps, knowledge, reads, dependencies }
```

This branch must build a `crossReads` map from frontmatter parallel to `knowledge`/`reads`/`dependencies`, then set it in the literal:

```typescript
const crossReads: Record<string, Array<{ service: string; step: string }>> = {}
for (const [name, mp] of metaPrompts) {
  // ... existing lines ...
  crossReads[name] = [...(mp.frontmatter.crossReads ?? [])]
}
overlay = { steps: mergedSteps, knowledge, reads, dependencies, crossReads }
```

Setting `crossReads: {}` would make the code compile but silently lose frontmatter crossReads on config-less runs, breaking any future cleanup that removes the frontmatter fallback at consumer sites. Build the full frontmatter map here to satisfy the new contract — initialized **unconditionally for every step** so the shape matches the other three maps (which always have one entry per step, even empty). Add a targeted test: `resolvePipeline(ctx)` with `ctx.config = null` and a frontmatter `crossReads` → `overlay.crossReads[step]` returns the frontmatter entries.

### 3.3 `buildGraph`

Already accepts `crossReadsMap` (added in Wave 3c Task 5). No changes needed — `resolvePipeline` already passes `overlay.crossReads`.

### 3.4 Transitive resolver must respect overlay overrides

Wave 3c's `resolveTransitiveCrossReads` recurses via `foreignMeta.frontmatter.crossReads` only (`src/core/assembly/cross-reads.ts`). With this feature, a foreign step's effective crossReads is the overlay-first merged map, not just its frontmatter. If a foreign step has overlay-appended cross-reads, transitive resolution would silently miss them.

**Fix**: extend the helper signature with an optional `overlayCrossReads?: Record<string, Array<{service, step}>>` parameter. **Position**: append it AFTER the existing `globalSteps?` trailing parameter so existing callers (including Wave 3c tests that omit it) remain backward compatible:

```typescript
export function resolveTransitiveCrossReads(
  crossReads: Array<{ service: string; step: string }>,
  config: ScaffoldConfig,
  projectRoot: string,
  metaPrompts: Map<string, MetaPromptFile>,
  output: OutputContext,
  visiting: Set<string>,
  resolved: Map<string, ArtifactEntry[]>,
  foreignStateCache: Map<string, PipelineState | null>,
  globalSteps?: Set<string>,
  overlayCrossReads?: Record<string, Array<{ service: string; step: string }>>,  // NEW — last
): ArtifactEntry[]
```

The recursion branch changes from:

```typescript
if (!isTool && foreignMeta?.frontmatter.crossReads?.length) {
  transitive = resolveTransitiveCrossReads(
    foreignMeta.frontmatter.crossReads,
    // ... passthrough args
  )
}
```

to:

```typescript
const foreignCrossReads =
  overlayCrossReads?.[cr.step] ?? foreignMeta?.frontmatter.crossReads ?? []
// Preserve the existing foreignMeta existence guard. An overlay typo pointing at
// a step absent from metaPrompts must NOT drive transitive recursion — without
// foreignMeta the tool-category guard cannot fire and the step is not part of
// the known pipeline.
if (foreignMeta && !isTool && foreignCrossReads.length) {
  transitive = resolveTransitiveCrossReads(
    foreignCrossReads,
    // ... passthrough args including overlayCrossReads
  )
}
```

The call site in `run.ts` passes `pipeline.overlay.crossReads` as the new argument. `resolveDirectCrossRead` does not need the overlay map — it reads foreign service **state** (completed-step artifacts on disk), not foreign step templates, so frontmatter-vs-overlay doesn't factor in there.

**Why the caller's overlay map is correct for foreign-service recursion**: Meta-prompts are global (loaded from `content/pipeline/`); every service's `resolvePipeline` call loads the same set. Per-service overlays determine enablement and can rewrite `knowledge`/`reads`/`dependencies` — but §4.1's structural-only constraint means `cross-reads-overrides` live ONLY in the shared `multi-service-overlay.yml`, which applies uniformly across every service. So the caller's `OverlayState.crossReads` map for any step equals the foreign service's map for the same step (same frontmatter + same structural overrides). Passing the caller's map into transitive recursion is not a context leak; it's the same authoritative map the foreign service's own run would have used. This invariant is the reason §4.1 exists: if project-type overlays could declare `cross-reads-overrides`, each service's map would diverge and the transitive resolver would need to dynamically reload per-service overlays mid-recursion.

---

## Section 4: Structural-only constraint + Out of Scope

### 4.1 `cross-reads-overrides` are structural-overlay-only

`cross-reads-overrides` is **only valid in structural overlays** (`multi-service-overlay.yml`). Project-type overlays (`backend-overlay.yml`, `library-overlay.yml`, etc.) that declare `cross-reads-overrides` are stripped at parse time with a warning, same pattern as sub-overlays.

**Rationale**: cross-reads are inherently cross-service. In a multi-service project, each service's `resolvePipeline(serviceId)` call produces its own overlay merged map based on that service's `projectType`. The transitive resolver has only the caller's map available at runtime and cannot load the foreign service's project-type overlay without substantial re-architecture. If project-type overlays were allowed to declare `cross-reads-overrides`, the transitive recursion would either (a) miss the foreign service's overrides, or (b) leak the caller's overrides into the foreign service's graph. Neither is acceptable.

The structural multi-service overlay is a single shared overlay applied to all services in the project uniformly — so its `cross-reads-overrides` apply equivalently whether the consumer or the foreign service is evaluating them. Restricting `cross-reads-overrides` to the structural overlay eliminates the context-leak issue entirely.

**Implementation**: `loadOverlay` (project-type path) detects `obj['cross-reads-overrides']` and:
1. Emits a new warning `OVERLAY_CROSS_READS_NOT_ALLOWED` describing that `cross-reads-overrides` is only valid in `multi-service-overlay.yml`.
2. Does not pass the raw value to `parseCrossReadsOverrides` — the resulting `PipelineOverlay.crossReadsOverrides` is `{}`.

`loadStructuralOverlay` continues to accept `cross-reads-overrides` normally and parses it via `parseCrossReadsOverrides`.

`loadSubOverlay` inherits `loadOverlay`'s strip (plus its own defense-in-depth — see §2.3).

### 4.2 Out of Scope

- **`replace` semantics**: Deferred. Replacing cross-reads means identifying a `(service, step)` pair to swap, which requires a qualified-key YAML syntax (`"old-service:old-step": { service: new-service, step: new-step }`). Append-only covers the roadmap's documented use case (appending service-specific cross-reads beyond the template default) and matches the existing `knowledge-overrides` simplicity. Add if a concrete use case surfaces.
- **Foreign-service project-type overlay lookup during transitive recursion**: see §4.1. If §4.1's structural-only constraint is later relaxed, the transitive resolver must dynamically load the foreign service's project-type overlay — a non-trivial refactor that loses the per-invocation overlay cache.

---

## Section 5: Testing Strategy

| Category | Count | Coverage |
|----------|-------|---------|
| Parser | 8 | valid entries, malformed entry value (non-object) warns, malformed `append` value (non-array) warns, malformed append item (non-object) warns, malformed append item (missing field) warns, malformed append item (invalid kebab-case slug in service/step) warns, empty entry, mixed valid + invalid items (valid siblings preserved, invalid item warns with correct index) |
| Apply | 4 | append adds to empty list, append adds to frontmatter list, dedup by service:step pair, multiple steps |
| Loader gate | 4 | `loadOverlay` (project-type) strips `cross-reads-overrides` and emits `OVERLAY_CROSS_READS_NOT_ALLOWED`; `loadOverlay` emits the same warning for explicit `cross-reads-overrides: ~` (null — verifies the `!== undefined` check); `loadStructuralOverlay` accepts it and populates `crossReadsOverrides`; `loadStructuralOverlay` emits `OVERLAY_MALFORMED_SECTION` for `cross-reads-overrides: []` (top-level wrong shape — verifies `overrideSections` tuple update) |
| `resolveOverlayState` integration | 1 | returns merged crossReads (frontmatter + structural overlay overrides) |
| Sub-overlay | 1 | sub-overlay warning message names cross-reads. (Note: the `hasCrossReads` strip branch inside `loadSubOverlay` is unreachable via the public API because `loadOverlay` strips `cross-reads-overrides` first. No direct test is claimed — the branch is defense-in-depth only. See §6.) |
| `resolvePipeline` fallback | 1 | `config = null` branch preserves frontmatter `crossReads` (regression test for §3.2.1) |
| Transitive | 3 | overlay-appended crossReads on a foreign step surface through `resolveTransitiveCrossReads`; omitted `overlayCrossReads?` argument falls back to `foreignMeta.frontmatter.crossReads` (backward compatibility); overlay entry for a step absent from `metaPrompts` does NOT drive recursion (preserves foreignMeta existence guard) |
| E2E | 1 | overlay append surfaces through `buildGraph` → `DependencyNode.crossDependencies` |
| **Total** | **23** | |

---

## Section 6: Refactoring Scope

### Files modified (production)

| File | Change |
|------|--------|
| `src/types/config.ts` | Add `CrossReadsOverride` interface; add `crossReadsOverrides` to `PipelineOverlay` |
| `src/utils/errors.ts` | Add `overlayMalformedAppendItem` and `overlayCrossReadsNotAllowed` warning factories (new `OVERLAY_MALFORMED_APPEND_ITEM` and `OVERLAY_CROSS_READS_NOT_ALLOWED` codes) |
| `src/core/assembly/overlay-state-resolver.ts` | Make `OverlayState.crossReads` required (drop `?`); build `crossReadsMap` from frontmatter; pass through `applyOverlay`; populate `OverlayState.crossReads` |
| `src/core/assembly/overlay-loader.ts` | Add `parseCrossReadsOverrides`; wire into `loadOverlay` + `loadStructuralOverlay`; update `overrideSections` tuple; update `loadSubOverlay` to strip `crossReadsOverrides` and update `SUB_OVERLAY_NON_KNOWLEDGE` message text |
| `src/core/assembly/overlay-resolver.ts` | Add `applyCrossReadsOverrides` helper; extend `applyOverlay` signature with `crossReadsMap` input; return `crossReads` in result |
| `src/core/pipeline/resolver.ts` | Fallback branch (around line 80–89) builds a `crossReads` map from frontmatter parallel to `knowledge`/`reads`/`dependencies`, then includes it in the `overlay = { ... }` literal. See §3.2.1 for the full code. |
| `src/core/assembly/cross-reads.ts` | Add optional `overlayCrossReads?` param to `resolveTransitiveCrossReads`; use `overlayCrossReads?.[cr.step] ?? foreignMeta.frontmatter.crossReads` for recursion |
| `src/cli/commands/run.ts` | Pass `pipeline.overlay.crossReads` as the new `overlayCrossReads` arg to `resolveTransitiveCrossReads` |
| `src/types/dependency.ts` | Update `DependencyNode.crossDependencies` comment — no longer "populated from frontmatter.crossReads" but "populated via overlay-first merge" (overlay crossReads map takes precedence over frontmatter) |
| `src/core/assembly/overlay-state-resolver.ts` + its tests | Stale Wave 3c seam comments / test assertions that say "crossReads is always `{}`" become actively misleading. Update prose comments and any `expect(result.crossReads).toEqual({})` assertions that are no longer true when frontmatter has crossReads. |

### Test fixtures that need updating

Changing `OverlayState.crossReads` from optional to required and changing the `applyOverlay` signature breaks compilation for test files that construct these types or call these functions. Expected touch points:

- `src/types/config.test.ts` — any `PipelineOverlay` literal gains `crossReadsOverrides: {}`
- `src/core/assembly/overlay-resolver.test.ts` — `applyOverlay` calls gain a `crossReadsMap` arg (pass `{}` in fixtures that don't care); return-value destructures add `crossReads` where needed
- `src/core/assembly/overlay-state-resolver.test.ts` — Wave 3c's "returns crossReads as empty object even when frontmatter has crossReads" test (around line 625) becomes **the wrong contract** in this feature and must be updated: when frontmatter has crossReads, `resolveOverlayState()` must now return them populated in `OverlayState.crossReads` (not `{}`). Add a new test alongside: overlay overrides append beyond the frontmatter base.
- `src/core/assembly/overlay-loader-structural.test.ts` — covered by new integration test; return type unchanged but the returned overlay now has a `crossReadsOverrides` field
- `src/cli/commands/run.test.ts`, `src/cli/commands/next.test.ts`, `src/cli/commands/status.test.ts` — hoisted `vi.mock('.../overlay-state-resolver.js')` implementations that return a bare `{ steps, knowledge, reads, dependencies }` must add `crossReads: {}` so the mocked return type matches the now-required field. The `resolveTransitiveCrossReads` mock in `run.test.ts` gets one additional optional arg in the `toHaveBeenCalledWith` assertion.
- `src/utils/errors.test.ts` — add tests for the two new factories (`overlayMalformedAppendItem`, `overlayCrossReadsNotAllowed`): code, message content, context fields.
- `src/e2e/cross-service-references.test.ts` — the Wave 3c E2E calls `resolveTransitiveCrossReads` directly. Existing calls don't need a signature update (the new `overlayCrossReads?` arg is optional), but add one new assertion: an overlay-only crossRead (no frontmatter entry) surfaces through to the final artifact set.

### New / extended test files

- `src/core/assembly/overlay-loader.test.ts` — parser tests (8 from §5: valid, malformed entry value, malformed `append` value non-array, malformed append non-object, malformed append missing field, malformed append invalid slug, empty entry, mixed valid+invalid items) + `loadOverlay` strip test (1: project-type overlay with `cross-reads-overrides` emits `OVERLAY_CROSS_READS_NOT_ALLOWED` and returns empty `crossReadsOverrides`). The defense-in-depth `hasCrossReads` branch inside `loadSubOverlay` is unreachable via the public API (parent `loadOverlay` always strips the field first). No test is claimed for that specific branch — its purpose is to catch a future regression where another loader call path bypasses `loadOverlay`.
- `src/core/assembly/overlay-loader-structural.test.ts` — `cross-reads-overrides` parsed into `PipelineOverlay.crossReadsOverrides` (integration)
- `src/core/assembly/overlay-resolver.test.ts` — `applyCrossReadsOverrides` helper tests (4 from §5)
- `src/core/assembly/overlay-state-resolver.test.ts` — `resolveOverlayState` returns merged `crossReads` (integration) + existing assertion update noted above
- `src/core/assembly/cross-reads.test.ts` — transitive tests (3 from §5: overlay-appended crossReads on foreign step surface through recursion; fallback to `foreignMeta.frontmatter.crossReads` when `overlayCrossReads?` omitted; overlay entry for a step absent from `metaPrompts` does NOT drive recursion — preserves the `foreignMeta` existence guard)
- E2E (any suitable file) — overlay append surfaces through `buildGraph` → `DependencyNode.crossDependencies`
