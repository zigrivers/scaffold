# Overlay Dependency Overrides in Graph — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed overlay-resolved dependency overrides into `buildGraph()` so that `computeEligible()`, cycle detection, and topological sort all see the real dependencies — fixing the eligibility inconsistency between `next`/`status` and `run` for game projects.

**Architecture:** Add an optional `dependencyMap` parameter to `buildGraph()`, pass `overlay.dependencies` from `resolvePipeline()`, and simplify `run.ts`'s dep-check to use graph nodes directly.

**Tech Stack:** TypeScript, Vitest

**MMR Review:** Every task must be reviewed via multi-model review (Codex CLI + Gemini CLI + Superpowers code-reviewer) after implementation. Fix all P0, P1, and P2 findings before moving to the next task.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/core/dependency/graph.ts` | Modify | Add `dependencyMap` parameter, use for nodes + edges |
| `src/core/dependency/graph.test.ts` | Modify | Add tests for `dependencyMap` parameter |
| `src/core/pipeline/resolver.ts` | Modify | Pass `overlay.dependencies` to `buildGraph()` |
| `src/core/pipeline/resolver.test.ts` | Modify | Add overlay dep integration tests |
| `src/cli/commands/run.ts` | Modify | Simplify dep-check, remove dead topo call |
| `src/cli/commands/run.test.ts` | Modify | Update `buildGraph` mock expectations (3rd arg) |
| `src/e2e/game-pipeline.test.ts` | Modify | Add graph-level overlay dep assertions |

---

### Task 1: Add `dependencyMap` parameter to `buildGraph()` with tests

**Files:**
- Modify: `src/core/dependency/graph.ts`
- Modify: `src/core/dependency/graph.test.ts`

- [ ] **Step 1: Write failing tests in `graph.test.ts`**

Add these tests after the existing test suite, using the existing `makeFm` helper:

```typescript
// ---------------------------------------------------------------------------
// buildGraph — dependencyMap parameter
// ---------------------------------------------------------------------------

describe('buildGraph with dependencyMap', () => {
  it('uses dependencyMap deps instead of frontmatter deps when provided', () => {
    const fms = [
      makeFm('a', 'pre', 1, ['original-dep']),
      makeFm('b', 'foundation', 2, []),
    ]
    const preset = new Map([
      ['a', { enabled: true }],
      ['b', { enabled: true }],
    ])
    const depMap = { a: ['b'], b: [] }

    const graph = buildGraph(fms, preset, depMap)

    expect(graph.nodes.get('a')?.dependencies).toEqual(['b'])
    // Edge: b's successors should include a
    expect(graph.edges.get('b')).toContain('a')
    // Original dep should NOT be in edges
    expect(graph.edges.has('original-dep')).toBe(false)
  })

  it('falls back to frontmatter deps when dependencyMap entry is missing', () => {
    const fms = [
      makeFm('a', 'pre', 1, ['b']),
      makeFm('b', 'foundation', 2, []),
    ]
    const preset = new Map([
      ['a', { enabled: true }],
      ['b', { enabled: true }],
    ])
    // dependencyMap provided but missing entry for 'a'
    const depMap = { b: [] }

    const graph = buildGraph(fms, preset, depMap)

    // Falls back to frontmatter: a depends on b
    expect(graph.nodes.get('a')?.dependencies).toEqual(['b'])
    expect(graph.edges.get('b')).toContain('a')
  })

  it('handles replace semantics (old dep gone, new dep present)', () => {
    const fms = [
      makeFm('a', 'pre', 1, ['old-dep']),
      makeFm('old-dep', 'pre', 2, []),
      makeFm('new-dep', 'pre', 3, []),
    ]
    const preset = new Map([
      ['a', { enabled: true }],
      ['old-dep', { enabled: true }],
      ['new-dep', { enabled: true }],
    ])
    const depMap = { a: ['new-dep'], 'old-dep': [], 'new-dep': [] }

    const graph = buildGraph(fms, preset, depMap)

    expect(graph.nodes.get('a')?.dependencies).toEqual(['new-dep'])
    expect(graph.edges.get('new-dep')).toContain('a')
    // old-dep should NOT have 'a' as a successor
    expect(graph.edges.get('old-dep')).not.toContain('a')
  })

  it('handles append semantics (new dep alongside originals)', () => {
    const fms = [
      makeFm('a', 'pre', 1, ['b']),
      makeFm('b', 'foundation', 2, []),
      makeFm('c', 'foundation', 3, []),
    ]
    const preset = new Map([
      ['a', { enabled: true }],
      ['b', { enabled: true }],
      ['c', { enabled: true }],
    ])
    const depMap = { a: ['b', 'c'], b: [], c: [] }

    const graph = buildGraph(fms, preset, depMap)

    expect(graph.nodes.get('a')?.dependencies).toEqual(['b', 'c'])
    expect(graph.edges.get('b')).toContain('a')
    expect(graph.edges.get('c')).toContain('a')
  })

  it('unknown dep from dependencyMap is stored on node (caught by detectCycles)', () => {
    const fms = [
      makeFm('a', 'pre', 1, []),
    ]
    const preset = new Map([
      ['a', { enabled: true }],
    ])
    const depMap = { a: ['nonexistent'] }

    const graph = buildGraph(fms, preset, depMap)

    expect(graph.nodes.get('a')?.dependencies).toEqual(['nonexistent'])
    // nonexistent has no edge entry — detectCycles would flag DEP_TARGET_MISSING
    expect(graph.edges.has('nonexistent')).toBe(false)
  })

  it('without dependencyMap, behavior is unchanged (backward compat)', () => {
    const fms = [
      makeFm('a', 'pre', 1, ['b']),
      makeFm('b', 'foundation', 2, []),
    ]
    const preset = new Map([
      ['a', { enabled: true }],
      ['b', { enabled: true }],
    ])

    const graph = buildGraph(fms, preset)

    expect(graph.nodes.get('a')?.dependencies).toEqual(['b'])
    expect(graph.edges.get('b')).toContain('a')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/core/dependency/graph.test.ts`
Expected: FAIL — `buildGraph` doesn't accept third parameter (TypeScript error)

- [ ] **Step 3: Implement the `dependencyMap` parameter**

Replace the entire `buildGraph` function in `src/core/dependency/graph.ts` with:

```typescript
export function buildGraph(
  metaPrompts: MetaPromptFrontmatter[],
  presetSteps: Map<string, { enabled: boolean }>,
  dependencyMap?: Record<string, string[]>,
): DependencyGraph {
  const nodes = new Map<string, DependencyNode>()
  const edges = new Map<string, string[]>()

  // Initialise nodes and empty successor lists
  for (const mp of metaPrompts) {
    // Tools (category: 'tool') are excluded from the dependency graph —
    // they have no phase/order and don't participate in topological sort
    if (mp.category === 'tool') continue

    const deps = dependencyMap?.[mp.name] ?? mp.dependencies
    const enabled = presetSteps.get(mp.name)?.enabled ?? true
    nodes.set(mp.name, {
      slug: mp.name,
      phase: mp.phase,
      order: mp.order,
      dependencies: deps,
      enabled,
    })
    edges.set(mp.name, [])
  }

  // Build edges: for each node, for each dep, push this step onto dep's successor list
  for (const [name, node] of nodes) {
    for (const dep of node.dependencies) {
      const successors = edges.get(dep)
      if (successors) {
        successors.push(name)
      }
      // Unknown deps are caught by detectCycles → DEP_TARGET_MISSING
    }
  }

  return { nodes, edges }
}
```

Key changes from the original:
- New optional third parameter `dependencyMap?: Record<string, string[]>`
- Line `const deps = dependencyMap?.[mp.name] ?? mp.dependencies` — resolve once per step
- Edge loop iterates `nodes` (not `metaPrompts`) — uses resolved deps for both structures

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/core/dependency/graph.test.ts`
Expected: All tests pass (existing + 5 new)

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

`feat: add dependencyMap parameter to buildGraph for overlay dep overrides`

---

### Task 2: Pass overlay deps from `resolvePipeline()` + integration tests

**Files:**
- Modify: `src/core/pipeline/resolver.ts`
- Modify: `src/core/pipeline/resolver.test.ts`

- [ ] **Step 1: Write failing integration tests in `resolver.test.ts`**

Add these tests to the existing `describe('resolvePipeline', ...)` block:

```typescript
it('graph nodes have overlay-appended deps (user-stories depends on review-gdd for game)', () => {
  const ctx = loadPipelineContext(process.cwd())
  if (ctx.config) {
    ctx.config.project = { projectType: 'game', gameConfig: { engine: 'custom' } }
  }
  const pipeline = resolvePipeline(ctx)
  const node = pipeline.graph.nodes.get('user-stories')
  expect(node?.dependencies).toContain('review-gdd')
})

it('graph nodes have overlay-replaced deps (platform-parity-review uses review-game-ui for game)', () => {
  const ctx = loadPipelineContext(process.cwd())
  if (ctx.config) {
    ctx.config.project = { projectType: 'game', gameConfig: { engine: 'custom' } }
  }
  const pipeline = resolvePipeline(ctx)
  const node = pipeline.graph.nodes.get('platform-parity-review')
  expect(node?.dependencies).toContain('review-game-ui')
  expect(node?.dependencies).not.toContain('review-ux')
})

it('computeEligible blocks user-stories when review-gdd is not completed (game project)', () => {
  const ctx = loadPipelineContext(process.cwd())
  if (ctx.config) {
    ctx.config.project = { projectType: 'game', gameConfig: { engine: 'custom' } }
  }
  const pipeline = resolvePipeline(ctx)
  // Complete review-prd (original dep) but NOT review-gdd (overlay-appended dep)
  const state: Record<string, any> = {
    'review-prd': { status: 'completed', source: 'pipeline' },
  }
  const eligible = pipeline.computeEligible(state)
  // user-stories should NOT be eligible because review-gdd is not completed
  expect(eligible).not.toContain('user-stories')
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/core/pipeline/resolver.test.ts`
Expected: FAIL — graph still has frontmatter deps, not overlay-resolved deps

- [ ] **Step 3: Pass `overlay.dependencies` to `buildGraph()`**

In `src/core/pipeline/resolver.ts`, change line 63 from:

```typescript
const graph = buildGraph(frontmatters, presetStepsMap)
```

To:

```typescript
const graph = buildGraph(frontmatters, presetStepsMap, overlay.dependencies)
```

That's it — one parameter added.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/core/pipeline/resolver.test.ts`
Expected: All tests pass (existing + 3 new)

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

`feat: pass overlay.dependencies to buildGraph from resolvePipeline`

- [ ] **Step 7: Update `run.test.ts` mock expectations**

`src/cli/commands/run.test.ts` has assertions that `buildGraph` was called with specific arguments. After this change, `buildGraph` receives a third argument (`overlay.dependencies`). Find any `expect(buildGraph).toHaveBeenCalledWith(...)` assertions and update them to accept the third parameter (use `expect.any(Object)` for the dependency map).

- [ ] **Step 8: Add E2E test in `game-pipeline.test.ts`**

Add to `src/e2e/game-pipeline.test.ts`:

```typescript
it('resolvePipeline graph has overlay-resolved deps for game project', () => {
  // Use the existing game project context setup from this test file
  const ctx = loadPipelineContext(projectRoot)
  // Set game project type
  if (ctx.config) {
    ctx.config.project = { projectType: 'game', gameConfig: { engine: 'custom' } }
  }
  const pipeline = resolvePipeline(ctx)
  // Verify overlay dep append: user-stories depends on review-gdd
  const userStoriesNode = pipeline.graph.nodes.get('user-stories')
  expect(userStoriesNode?.dependencies).toContain('review-gdd')
  // Verify overlay dep replace: platform-parity-review uses review-game-ui
  const pprNode = pipeline.graph.nodes.get('platform-parity-review')
  expect(pprNode?.dependencies).toContain('review-game-ui')
  expect(pprNode?.dependencies).not.toContain('review-ux')
})
```

- [ ] **Step 9: Run full test suite and commit**

Run: `npx vitest run`
Commit: `test: add E2E and run.test.ts updates for overlay deps in graph`

---

### Task 3: Simplify `run.ts` dep-check + remove dead topo call

**Files:**
- Modify: `src/cli/commands/run.ts`

- [ ] **Step 1: Read `run.ts`** lines 195-201 to confirm current code

- [ ] **Step 2: Remove the dead `topologicalSort(graph)` call at line 195**

Delete this line:
```typescript
topologicalSort(graph)
```

This call's return value is discarded — it's dead code from a previous refactor.

Also update the import on line 14 — remove `topologicalSort` from:
```typescript
import { detectCycles, topologicalSort } from '../../core/dependency/dependency.js'
```
To:
```typescript
import { detectCycles } from '../../core/dependency/dependency.js'
```

- [ ] **Step 3: Simplify the dep-check fallback chain**

Replace lines 200-201:

```typescript
const deps = pipeline.overlay.dependencies[step]
  ?? stepNode?.dependencies ?? metaPrompt.frontmatter.dependencies ?? []
```

With:

```typescript
const deps = isTool
  ? (pipeline.overlay.dependencies[step] ?? [])
  : (stepNode?.dependencies ?? [])
```

For pipeline steps, `stepNode.dependencies` now contains overlay-resolved deps from the graph. For tools (excluded from the graph), `overlay.dependencies` has frontmatter-derived deps.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run && make check`
Expected: All tests pass

- [ ] **Step 5: Commit**

`refactor: simplify run.ts dep-check — graph now has overlay-resolved deps`

---

### Task 4: Run full quality gates

**Files:** None (verification only)

- [ ] **Step 1: `npx tsc --noEmit`** — no type errors
- [ ] **Step 2: `npx vitest run`** — all tests pass
- [ ] **Step 3: `npx eslint src/`** — no lint errors
- [ ] **Step 4: `make check-all`** — all quality gates pass
