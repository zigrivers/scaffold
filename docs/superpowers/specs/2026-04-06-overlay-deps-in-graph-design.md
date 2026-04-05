# Overlay Dependency Overrides in Graph — Design Spec

## Problem

Overlay dependency overrides (from `game-overlay.yml`) are computed and stored
on `OverlayState.dependencies`, but never fed into `buildGraph()`. This means
`computeEligible()` (used by `status`, `next`) and `topologicalSort()` (used
by `rework`) don't see them,
while `run.ts` has its own 3-level fallback chain that does. This causes
eligibility inconsistencies for game projects:

- `scaffold next` says `user-stories` is eligible (graph doesn't know about
  the `review-gdd` dependency added by the game overlay)
- `scaffold run user-stories` blocks it (run.ts checks overlay deps and finds
  `review-gdd` is not complete)

The current game overlay has two dependency overrides:

```yaml
dependency-overrides:
  user-stories:
    append: [review-gdd]          # user-stories must wait for GDD review
  platform-parity-review:
    replace: { review-ux: review-game-ui }  # swap disabled dep for game equivalent
```

Both `append` and `replace` semantics must be handled.

## Solution

Pass the overlay-resolved dependency map into `buildGraph()` as an optional
third parameter. The graph nodes and successor edges both use resolved deps,
making `computeEligible()`, cycle detection, and topological sort all
overlay-aware. No changes needed to downstream graph consumers — they already
read from graph nodes. The one exception is `run.ts`'s dep-check for tools,
which must continue using `overlay.dependencies` since tools are excluded from
the graph.

## Changes

### 1. `buildGraph()` — new optional parameter

```typescript
export function buildGraph(
  metaPrompts: MetaPromptFrontmatter[],
  presetSteps: Map<string, { enabled: boolean }>,
  dependencyMap?: Record<string, string[]>,
): DependencyGraph
```

`dependencyMap` is intended to be a **complete map** — containing the final
resolved dependencies for every step (not just overrides). In practice,
`overlay.dependencies` is always complete because `resolveOverlayState()`
populates it from all frontmatter before merging overlays. However, the
implementation uses `dependencyMap?.[mp.name] ?? mp.dependencies` per step,
so a partial map also works safely — missing entries fall back to frontmatter.
When the parameter is absent entirely, behavior is unchanged (backward
compatible).

Inside `buildGraph()`, resolve deps once per step and use the same array for
both node creation and successor edge building:

```typescript
// Node creation
for (const mp of metaPrompts) {
  if (mp.category === 'tool') continue
  const deps = dependencyMap?.[mp.name] ?? mp.dependencies
  const enabled = presetSteps.get(mp.name)?.enabled ?? true
  nodes.set(mp.name, {
    slug: mp.name, phase: mp.phase, order: mp.order,
    dependencies: deps, enabled,
  })
  edges.set(mp.name, [])
}

// Edge building — iterates NODES (which have resolved deps), not metaPrompts
for (const [name, node] of nodes) {
  for (const dep of node.dependencies) {
    const successors = edges.get(dep)
    if (successors) successors.push(name)
  }
}
```

The edge loop iterates `nodes` instead of `metaPrompts` to ensure both data
structures use the same resolved dependencies. This also prevents potential
future issues where tools with dependencies could create spurious edges in
the graph (no tools currently declare dependencies, but this is defensive).

### 2. `resolvePipeline()` — pass overlay deps to graph

In `src/core/pipeline/resolver.ts`, change the `buildGraph()` call to pass the
resolved dependency map:

```typescript
const graph = buildGraph(frontmatters, presetStepsMap, overlay.dependencies)
```

`overlay.dependencies` is always a complete map — populated from frontmatter
for all steps, then overlay overrides merged on top via `applyOverlay()`. Both
the overlay and no-overlay code paths in the resolver produce a complete map,
so this works for game and non-game projects alike.

### 3. `run.ts` — simplify dep-check

Replace the 3-level fallback chain:

```typescript
// BEFORE (line 200):
const deps = pipeline.overlay.dependencies[step]
  ?? stepNode?.dependencies ?? metaPrompt.frontmatter.dependencies ?? []
```

With:

```typescript
// AFTER:
const deps = isTool
  ? (pipeline.overlay.dependencies[step] ?? [])
  : (stepNode?.dependencies ?? [])
```

For **pipeline steps**: `stepNode.dependencies` is now the single source of
truth — it contains overlay-resolved deps from the graph.

For **tools**: tools are excluded from the graph (`stepNode` is undefined), so
they use `overlay.dependencies` which already contains frontmatter-derived deps
for all steps (the `metaPrompt.frontmatter.dependencies` fallback is redundant
since `overlay.dependencies` is always populated from frontmatter).

**Behavioral note:** In the current code, `pipeline.overlay.dependencies[step]`
is the first fallback for all steps (pipeline and tools alike), and since it's
always populated from frontmatter, the `stepNode?.dependencies` fallback for
pipeline steps never actually fires today. The simplification makes the code
reflect this reality — pipeline steps use the graph (which now has the same
resolved deps), tools use the overlay map directly.

Also remove the dead `topologicalSort(graph)` call (currently ~line 195 of
`run.ts`) which is called for its return value but the result is discarded.

## What This Fixes

- `computeEligible()` sees overlay dependency overrides — `next`/`status`
  produce the same eligibility as `run`
- `detectCycles()` catches overlay-introduced cycles (previously invisible)
- `topologicalSort()` respects overlay dependency ordering
- `run.ts` dep-check simplified from 3-level fallback to single source

## What Does NOT Change

- `computeEligible()` — no code changes, automatically benefits from accurate
  graph nodes
- `detectCycles()` / `topologicalSort()` — no code changes, automatically
  benefits
- `overlay-state-resolver.ts` / `overlay-resolver.ts` — no changes, already
  produce the correct resolved dependency map
- `build.ts` — does not pass resolved deps (new parameter is optional),
  unchanged behavior
- `dependency-validator.ts` — validates frontmatter deps only (no overlay),
  which is correct for a validator — you want to check raw frontmatter
  structure, not overlay-resolved deps. Unchanged behavior.

## Edge Cases

### Non-game projects

`dependencyMap` will contain frontmatter-derived deps (no overlay
applied). Graph behavior is identical to today — `dependencyMap[step]`
returns the same array as `mp.dependencies`.

### Overlay introduces a cycle

Caught by `detectCycles()` for commands using `resolvePipeline()`. See "Cycle
Detection Improvement" section above for scope.

### Overlay references unknown step

If an overlay appends a dependency on a step that doesn't exist in the graph,
`detectCycles()` reports `DEP_TARGET_MISSING` — same as for frontmatter deps.

### Overlay adds a completely new dependency edge

If step A has frontmatter deps `[]` and the overlay sets `dependencyMap['A']`
to `['B']`, the graph node for A gets `dependencies: ['B']` and B gains A as
a successor in the edges map. This works because B already has an edge entry
from node creation (`edges.set('B', [])`).

### Empty dependency list

If an overlay clears all deps for a step (`[]`), the step becomes a root node
(in-degree 0) in topological sort. This is correct behavior.

## Backward Compatibility

The `dependencyMap` parameter is optional. Existing callers of
`buildGraph()` (including `build.ts` and any direct test calls) continue to
work unchanged. Only `resolvePipeline()` passes the parameter.

## Cycle Detection Improvement (Scoped)

Only `run.ts` calls `detectCycles()` on the resolved graph. An overlay that
introduces a circular dependency will be caught when the user runs
`scaffold run`. Other commands benefit differently:

- `status`, `next`, `complete`, `skip`, `reset` — benefit from accurate
  `computeEligible()` results (correct eligibility), but do not call
  `detectCycles()` themselves
- `rework` — benefits from accurate `topologicalSort()` ordering via
  `resolveStepsForPhases()`, but does not call `detectCycles()` either

**Not covered:** `build.ts` and `dependency-validator.ts` still construct
graphs from frontmatter only (they don't call `resolvePipeline()`). An
overlay-only cycle would not be caught during `scaffold build` or frontmatter
validation. This is acceptable — `scaffold run` will catch it.

## Test Coverage Plan

### Unit tests for `buildGraph` with `dependencyMap`

1. Without third param: behavior identical to current (backward compat)
2. With `dependencyMap`: nodes get resolved deps, edges reflect resolved deps
3. With `dependencyMap` missing an entry for a step: falls back to
   `mp.dependencies` for that step
4. With `dependencyMap` that replaces a dep: old edge gone, new edge present
5. With `dependencyMap` that appends a dep: new edge present alongside originals
6. With `dependencyMap` adding dep to unknown step: `detectCycles` reports
   `DEP_TARGET_MISSING`

### Integration tests for `resolvePipeline` with game overlay

7. `user-stories` graph node has `review-gdd` in dependencies (append override)
8. `platform-parity-review` graph node has `review-game-ui` instead of
   `review-ux` (replace override)
9. `computeEligible` for `user-stories` requires `review-gdd` to be completed

### run.ts regression test

10. Tool still gathers artifacts via `overlay.dependencies` after dep-check
    simplification (the `deps` array feeds both dep-check and artifact gathering)
11. Pipeline step blocks when overlay-appended dep is not completed (e.g.,
    `user-stories` blocked by incomplete `review-gdd`)

### E2E test extension

12. Extend `src/e2e/game-pipeline.test.ts` to verify `resolvePipeline` produces
    a graph with overlay-resolved deps (current tests only check overlayState)

## Impact

- **3 files changed**: `graph.ts` (add parameter), `resolver.ts` (pass
  overlay.dependencies), `run.ts` (simplify dep-check + remove dead topo call)
- **~15 lines changed** across the 3 files
- **0 new files**, **~10 new test cases**
- **Fixes**: eligibility inconsistency between `next`/`status` and `run` for
  game projects
- **Bonus**: cycle detection now covers overlay-introduced cycles
