# Eligible-Step Cache v2 — Design

**Goal**: Complete the roadmap's Phase 2 "Eligible Step Caching" item correctly by fixing three pre-existing latent bugs in the cache infrastructure and wiring `scaffold next` (and optionally `scaffold status`) to trust the cache.

**Prerequisites**: v3.18.1 (latest main).

**Supersedes**: closed PR #289, which attempted the same wiring without addressing the underlying bugs.

**Round 1 review**: surfaced three new findings beyond the original P0/P1.
**Round 2 review**: surfaced TOCTOU race + call-site list errors + null-vs-global scope inconsistency. This spec now addresses:

- **Original P0**: service-scope leakage in `saveState()` → fixed by scope threading (§3)
- **Original P1**: stale cache on pipeline-graph edits → fixed by graph-hash invalidation (§2)
- **Round-1 P0**: service caches go stale when root state mutates → fixed by cross-file invalidation via monotonic counter (§1, §4) with the counter captured at **load** time not save time (§3) to avoid TOCTOU
- **Round-1 P1**: hash must include `order` → fixed by including in hash inputs (§2)
- **Round-1 P2**: layering + hash scope-aware + all `StateManager` call sites → fixed (§4, §5, §7)
- **Round-2 P0 (new)**: TOCTOU between service loadState and saveState — counter read separately from merged steps → fixed by capturing counter at loadState time, reusing at saveState (§3)
- **Round-2 P2 (a)**: wrong call sites — `decisions.ts` doesn't construct StateManager; `adopt.ts` and `wizard.ts` do → fixed in §7
- **Round-2 P2 (b)**: inconsistent scope representation — `null` vs `'global'` could hash differently → fixed by normalizing `null → 'global'` in `computePipelineHash` (§2)
- **Round-2 P2 (c)**: `status --json` at line 221 reads `state.next_eligible` directly (not via `readEligible`) → fixed in §8

---

## Problem

### P0 — Service-scope leakage in `StateManager.saveState()`

- `loadState()` (state-manager.ts:64-74) merges global + service steps for service-scoped managers.
- `saveState()` (state-manager.ts:81) calls `this.computeEligible(state.steps)` without scope options.
- `saveState()` then strips global steps from `state.steps` for the write — but not from `next_eligible`.
- Result: service state files persist `next_eligible` polluted with global step slugs. Visible in `status --json`, `skip --json`, dashboard.

### P1 — Stale cache on pipeline-definition edits

- `reconcileWithPipeline()` (state-manager.ts:175-187) only adds newly-missing enabled steps. Doesn't detect dep changes, enable flips, removals.
- Post-cache-trust: a cache written before a pipeline-YAML edit is returned verbatim until the next state mutation triggers `saveState`.

### Round-1 P0 — Cross-file staleness

- Service eligibility depends on the **merged** view (global + service steps).
- When a global step completes, the root state file rewrites; service state files do **not**.
- Under graph-hash-only invalidation, service `next_eligible_hash` still matches → stale cache served.

---

## Invariants

**I1**: `state.next_eligible` is a valid result of `computeEligible(merged-state-at-write-time, scope-at-write-time)` against the pipeline graph **as it existed when the cache was written**.

**I2**: A consumer must NOT serve a cached `next_eligible` if the caller's scope differs from the scope used at cache-write time.

**I3**: A consumer must NOT serve a cached `next_eligible` if the pipeline graph (slugs, deps, enabled flags, scope classification, order) has changed since cache-write time.

**I4**: A consumer must NOT serve a service-scoped cached `next_eligible` if the root state has been mutated since cache-write time (because service eligibility depends on merged global+service state).

**I5**: When the cache is invalid (absent, hash mismatch, or cross-file stale), consumers fall back to live `computeEligible` and the next saveState repopulates the cache.

---

## Design

### §1 Root monotonic save counter

Add a monotonic counter to the root state file. Every root-state `saveState()` increments it. Service-state caches record the counter at cache-write time; on read, a mismatch between the recorded and current root counter invalidates the service cache.

```typescript
// src/types/state.ts
export interface PipelineState {
  // ... existing fields ...

  /**
   * Monotonic counter bumped on every root-state saveState. Used by service
   * state files to detect when root has mutated since the service cached
   * next_eligible. Present only in root state (service state files never
   * carry a save_counter of their own). Absent on legacy files → treated as
   * "unknown", which invalidates all service caches.
   */
  save_counter?: number

  /**
   * Cached eligible-step list for the owning scope (global or service). May
   * be stale; consumers MUST verify next_eligible_hash + (for service scope)
   * next_eligible_root_counter before trusting.
   */
  next_eligible: string[]

  /**
   * Pipeline-graph hash recorded when `next_eligible` was written. Absent on
   * legacy files; always-stale fallback on read.
   */
  next_eligible_hash?: string

  /**
   * For SERVICE state only: root state's save_counter at cache-write time.
   * If this no longer matches the current root save_counter, the service
   * cache is invalidated (root mutation invalidates service eligibility
   * because service steps depend on global step completion).
   */
  next_eligible_root_counter?: number
}
```

**Counter semantics:**
- Root state's counter increments on every root-state save (monotonic, no wraparound concern at normal usage).
- Service saves never write `save_counter` on their own state; they only RECORD the root's counter into `next_eligible_root_counter`.
- Global-scope consumers don't check the counter (their cache validity is hash-only).
- Service-scope consumers check both hash AND counter.

### §2 Pipeline-graph hash

Include everything that affects `computeEligible` output AND ordering:

```typescript
// src/core/pipeline/graph-hash.ts (new file — in core/pipeline, not cli/commands)

export function computePipelineHash(
  graph: DependencyGraph,
  globalSteps: Set<string>,
  scope: 'global' | 'service' | null,
): string {
  const lines: string[] = []
  // Normalize null → 'global' so `scopeOptions = undefined` (no scope) and
  // scope='global' produce the SAME hash. Round-2 P2 fix: consumer code
  // sometimes passes `undefined` (non-service) and sometimes `'global'`; both
  // represent the same logical scope and must hash identically.
  const normalizedScope = scope === 'service' ? 'service' : 'global'
  lines.push(`scope:${normalizedScope}`)
  // Canonical ordering by slug.
  const slugs = [...graph.nodes.keys()].sort()
  for (const slug of slugs) {
    const node = graph.nodes.get(slug)!
    const deps = [...node.dependencies].sort().join(',')
    const order = node.order ?? 'null'
    const isGlobal = globalSteps.has(slug) ? '1' : '0'
    const enabled = node.enabled ? '1' : '0'
    lines.push(`${slug}|${enabled}|${isGlobal}|${order}|${deps}`)
  }
  return sha256Hex(lines.join('\n'))
}
```

**Hash inputs — covered:**
- Slug presence (graph shape)
- `enabled` flag (eligibility gate)
- Dependencies list (eligibility gate)
- Global-ness (affects scope filtering)
- `order` (**Round-1 P1 fix** — computeEligible sorts by order, so order changes the first-eligible slot)
- Scope classification (two buckets: `'global'` and `'service'`; `null` is normalized to `'global'` per Round-2 P2 fix)

**Hash inputs — deliberately NOT covered:**
- Phase (cosmetic — affects display grouping, not eligibility)
- Frontmatter description, summary (cosmetic)
- Cross-reads (orthogonal to eligibility)

### §3 `StateManager` scope + hash threading (TOCTOU-safe)

Extend the constructor to receive the `pipelineHash` (new param; no `rootCounterReader` here — see below). The TOCTOU issue that Round-2 flagged: if `saveState()` reads the root counter separately from when `loadState()` read the merged steps, another process/command can mutate root between load and save, producing a cache whose counter stamp does not match the steps it was computed from.

**Fix**: `loadState()` (service-scope) captures the root counter at the SAME moment it reads root's steps, stores it on the StateManager instance, and `saveState()` uses the captured value — never re-reading.

**Before** (state-manager.ts:18):
```typescript
constructor(
  projectRoot: string,
  private computeEligible: (steps: Record<string, StepStateEntry>) => string[],
  private configProvider: () => ScaffoldConfig | undefined,
  private pathResolver: StatePathResolver,
  private globalSteps?: Set<string>,
)
```

**After**:
```typescript
constructor(
  projectRoot: string,
  private computeEligible: (
    steps: Record<string, StepStateEntry>,
    scopeOptions?: { scope?: 'global' | 'service'; globalSteps?: Set<string> },
  ) => string[],
  private configProvider: () => ScaffoldConfig | undefined,
  private pathResolver: StatePathResolver,
  private globalSteps?: Set<string>,
  /**
   * Cache-invalidation context. Omit for legacy tests/callers — absent hash
   * produces absent next_eligible_hash in the written state, which consumers
   * treat as "always stale" (live recompute). Safe default.
   */
  private pipelineHash?: string,
)

// Internal state for TOCTOU-safe cross-file invalidation
private loadedRootCounter: number | null | undefined = undefined
// undefined = never loaded; null = loaded but root file missing/invalid; number = loaded value
```

**No `rootCounterReader` constructor param.** The counter is read by `loadState()` directly from the root state file it already reads for service mode, eliminating any separate I/O path that could drift from the merged-steps snapshot.

`loadState()` captures the root counter at read time so it can be reused at save time:

```typescript
loadState(): PipelineState {
  // ... existing logic to load + merge root + service ...
  if (this.pathResolver.isServiceScoped && this.globalSteps) {
    const rootState = this.loadRootStateRaw()  // existing helper that reads .scaffold/state.json
    // Capture root's counter alongside the merged steps. Any mutation to root
    // between this moment and the next saveState will land on a newer counter
    // and correctly invalidate the cache we're about to write.
    this.loadedRootCounter = typeof rootState?.save_counter === 'number'
      ? rootState.save_counter
      : null
  }
  return state
}
```

`saveState` (state-manager.ts:80-92) becomes:

```typescript
saveState(state: PipelineState): void {
  const isService = this.pathResolver.isServiceScoped && this.globalSteps
  const scopeOptions = isService
    ? { scope: 'service' as const, globalSteps: this.globalSteps }
    : undefined

  // Compute next_eligible with correct scope so service state only caches
  // service-eligible steps (FIXES ORIGINAL P0).
  state.next_eligible = this.computeEligible(state.steps, scopeOptions)
  state.next_eligible_hash = this.pipelineHash

  if (isService) {
    // SERVICE state: stamp with the root counter CAPTURED AT loadState TIME,
    // not re-read here. This ties the counter to the exact merged-state view
    // we used for the eligibility computation (TOCTOU-safe per Round-2).
    // If loadState wasn't called first (fresh init path), this.loadedRootCounter
    // is undefined → cache treated as stale on read (safe fallback).
    state.next_eligible_root_counter = this.loadedRootCounter ?? undefined
  } else {
    // ROOT state: bump the monotonic counter (captured-at-load is not needed
    // for root — global caches only check hash, not counter).
    state.save_counter = (state.save_counter ?? 0) + 1
  }

  // Existing global-step stripping for the persisted steps map
  let stateToWrite: PipelineState = state
  if (isService) {
    const filteredSteps: Record<string, StepStateEntry> = {}
    for (const [name, entry] of Object.entries(state.steps)) {
      if (!this.globalSteps!.has(name)) filteredSteps[name] = entry
    }
    stateToWrite = { ...state, steps: filteredSteps }
  }
  atomicWriteFile(this.statePath, JSON.stringify(stateToWrite, null, 2))
}
```

**TOCTOU invariant**: a service state file written with `next_eligible_root_counter = N` means "this cache was computed from a merged view that included root state at save_counter=N". If root moves to N+1 later, service readers detect the drift and recompute.

### §4 `readEligible()` — core/pipeline helper

Moved from `cli/commands/` to `core/pipeline/` per Round-1 P2 (layering). Service-scope consumers pass a `rootCounterReader` to verify cross-file freshness at READ time. (The read-side reader is acceptable — if root mutates between read and `readEligible`'s consumption, worst case is we serve a fractionally-stale list for the duration of this one command invocation. That's bounded and acceptable vs. the save-side TOCTOU which could POISON the persisted cache.)

```typescript
// src/core/pipeline/read-eligible.ts (new file)

/**
 * Read the eligible-step list, preferring the cached list when valid for the
 * current pipeline graph, scope, and (for service scope) root state version.
 * Falls back to live computation when any validity check fails.
 */
export function readEligible(
  state: PipelineState,
  pipeline: ResolvedPipeline,
  scopeOptions: { scope?: 'global' | 'service'; globalSteps?: Set<string> } | undefined,
  rootCounterReader?: () => number | null,
): string[] {
  // Normalize: treat `undefined` scope as 'global' — matches getPipelineHash
  // normalization (Round-2 P2 fix).
  const scope = scopeOptions?.scope === 'service' ? 'service' : 'global'
  const currentHash = pipeline.getPipelineHash(scope)
  if (state.next_eligible_hash !== currentHash) {
    return pipeline.computeEligible(state.steps, scopeOptions)
  }
  if (scope === 'service') {
    const currentRootCounter = rootCounterReader?.() ?? null
    // Cache valid iff recorded root counter matches current root counter.
    // `null !== null` is false, so "both null" (root state file missing)
    // is considered a match — safe because without root state there are no
    // global steps to invalidate against.
    if (state.next_eligible_root_counter !== currentRootCounter) {
      return pipeline.computeEligible(state.steps, scopeOptions)
    }
  }
  return state.next_eligible
}
```

**Why a free function?** Round-1 P2 suggested a method on `ResolvedPipeline` (e.g. `pipeline.readEligible(state, scopeOptions)`) to keep hash and scope coupled. The free-function form with `getPipelineHash(scope)` + normalization achieves the same coupling without adding projectRoot/StateManager dependencies to `ResolvedPipeline`. Accepted trade-off.

### §5 `ResolvedPipeline.getPipelineHash(scope)`

Per Round-1 P2: hash must be scope-aware. Expose a getter (cached) rather than a single field:

```typescript
// src/core/pipeline/types.ts
export interface ResolvedPipeline {
  // ... existing fields ...
  /**
   * Pipeline-graph hash for the given scope. Used by StateManager.saveState
   * to record a version stamp in next_eligible_hash, and by readEligible()
   * to detect stale caches. Internally memoized per scope.
   */
  getPipelineHash: (scope: 'global' | 'service' | null) => string
}
```

`resolver.ts` builds a memoized closure:

```typescript
// src/core/pipeline/resolver.ts
const hashCache = new Map<string, string>()
const getPipelineHash = (scope: 'global' | 'service' | null): string => {
  const key = scope ?? 'none'
  let hash = hashCache.get(key)
  if (hash === undefined) {
    hash = computePipelineHash(graph, globalSteps, scope)
    hashCache.set(key, hash)
  }
  return hash
}
```

### §6 Root-state counter reader (READ-PATH only)

Small module that reads `.scaffold/state.json` and returns the `save_counter` (or null on any failure).

```typescript
// src/state/root-counter-reader.ts (new file)

export function readRootSaveCounter(projectRoot: string): number | null {
  const rootStatePath = path.join(projectRoot, '.scaffold', 'state.json')
  try {
    if (!fs.existsSync(rootStatePath)) return null
    const raw = JSON.parse(fs.readFileSync(rootStatePath, 'utf8')) as Record<string, unknown>
    const counter = raw['save_counter']
    return typeof counter === 'number' ? counter : null
  } catch {
    return null
  }
}
```

**Used only in `readEligible()` callers at READ time.** The TOCTOU fix (§3) means `StateManager` captures the counter internally during `loadState()` from root state file content it already reads — no constructor-level reader needed. This helper exists for service-scope consumers (`next.ts`, `status.ts`) that check cache freshness against the current root counter on the read side. (Brief read-side staleness window is bounded to a single command invocation and acceptable; the save-side TOCTOU the Round-2 fix addressed could have POISONED the persisted cache, which would have been unbounded.)

### §7 All `StateManager` construction sites thread the hash

Per Round-1 P2: the hash must propagate to every mutating path, not just `next.ts`. Otherwise a mutation from `run.ts` would write a state with `next_eligible_hash = undefined`, invalidating the cache for the next `next` call.

**Corrected call-site list** (Round-2 P2 fix — removed `decisions.ts`; added `adopt.ts` + `wizard.ts`; verified by `grep -rn "new StateManager(" src/`):

| File | Mutates state? | Needs pipelineHash? |
|------|----------------|---------------------|
| `src/cli/commands/run.ts` | ✓ | ✓ |
| `src/cli/commands/next.ts` | ✓ (via reconcile) | ✓ |
| `src/cli/commands/status.ts` | ✓ (via reconcile) | ✓ |
| `src/cli/commands/skip.ts` | ✓ | ✓ |
| `src/cli/commands/reset.ts` | ✓ | ✓ |
| `src/cli/commands/rework.ts` | ✓ | ✓ |
| `src/cli/commands/complete.ts` | ✓ | ✓ |
| `src/cli/commands/info.ts` | ✓ (via reconcile) | ✓ |
| `src/cli/commands/dashboard.ts` | ✗ (read-only) | ✓ (for future-proofing) |
| `src/cli/commands/adopt.ts` | ✓ (initializeState) | ✓ |
| `src/wizard/wizard.ts` | ✓ (initializeState) | ✓ |
| `state-manager.test.ts` fixtures | mixed | optional |
| Other `*.test.ts` fixtures that directly construct StateManager | mixed | optional (legacy-safe default) |

**`decisions.ts` is NOT in this list**: grep confirms it never constructs a `StateManager`. The Round-1 spec's inclusion was incorrect.

**`adopt.ts` and `wizard.ts`**: both call `initializeState()` as part of project bootstrap. If they don't pass `pipelineHash`, the very first saved state has `next_eligible_hash = undefined`, so `scaffold next` on a fresh project would live-recompute until the next mutation. Safe but suboptimal — thread the hash here too.

All command call sites follow the same pattern: compute `scope = service ? 'service' : 'global'`, pass `pipeline.getPipelineHash(scope)` to the constructor. No `rootCounterReader` needed at construction (capture-at-loadState design).

### §8 Consumer integration

Three consumer sites must migrate from `state.next_eligible` / `pipeline.computeEligible` direct use to `readEligible()`:

**8a. `next.ts`** (replaces current lines 88-91):
```typescript
const state = stateManager.loadState()
const scopeOptions = service
  ? { scope: 'service' as const, globalSteps: pipeline.globalSteps }
  : undefined
const eligible = readEligible(
  state,
  pipeline,
  scopeOptions,
  service ? () => readRootSaveCounter(projectRoot) : undefined,
)
```

**8b. `status.ts` interactive-mode live recompute** (line 271):
```typescript
// Status follows the same scope rules as the command invocation (respects --service).
const scopeOptions = service
  ? { scope: 'service' as const, globalSteps: pipeline.globalSteps }
  : undefined
const liveEligible = readEligible(
  state,
  pipeline,
  scopeOptions,
  service ? () => readRootSaveCounter(projectRoot) : undefined,
)
```

**8c. `status.ts` JSON output** (line 221 — Round-2 P2 fix):

The current code emits `nextEligible: state.next_eligible` directly, bypassing any validation. With this feature, we must use `readEligible()` so stale caches get invalidated before emission:

```typescript
// Before (stale-read hole):
//   nextEligible: state.next_eligible,
// After:
nextEligible: readEligible(state, pipeline, scopeOptions, service ? () => readRootSaveCounter(projectRoot) : undefined),
```

**Note on `skip.ts` + `dashboard/generator.ts`**: both also read `state.next_eligible` directly. With P0 fixed at source, what lands in the state file is already scope-correct and hash-stamped — but these consumers don't validate the hash. They serve the most recent cached value. Acceptable because:
1. `skip.ts`'s `newly_eligible` is emitted immediately after `markSkipped()` (which calls `saveState()`), so the cache is fresh by construction.
2. `dashboard/generator.ts` is read-only HTML; its `nextEligible[0]` is for display-only, not decision-making. A stale value is a cosmetic issue, not a correctness one.

These can be migrated to `readEligible()` in a later follow-up PR for defensive consistency. Out of scope here to keep the PR focused.

---

## Out of Scope

- **Skip.ts's `newly_eligible` output** — already reads `state.next_eligible` directly. With P0 fixed, the emitted list is now correctly service-scoped. No additional change needed.
- **Dashboard caching** — dashboard is read-only HTML. It reads `state.next_eligible[0]`. Correctness benefits from P0 fix; no additional refactor.
- **Migrating legacy state files** — files without `next_eligible_hash` / `save_counter` / `next_eligible_root_counter` are treated as invalid cache → live recompute + repopulate on first saveState. No explicit migration pass.
- **Counter overflow** — `save_counter` is a JS number (2^53 safe integer). At one mutation per second, 285 million years to overflow. Not a concern.
- **Concurrent writers** — out of scope here (broader state locking covered elsewhere). If two processes save simultaneously, the counter may collide once; the cache invalidation would still be correct (either counter value triggers a stale check on the next read).

---

## Testing Strategy

| Category | Count | Coverage |
|----------|-------|----------|
| Hash determinism | 5 | same input → same hash; different scope → different; different deps → different; different enabled → different; **different order → different** (Round-1 P1 lock) |
| Hash stability | 2 | reordering node insertion → same hash; phase/description changes → same hash |
| `readRootSaveCounter` | 4 | missing file → null; valid counter → number; invalid JSON → null; missing counter field → null |
| `getPipelineHash` memoization | 1 | same scope called twice → single compute |
| `StateManager` root saveState | 3 | bumps save_counter on write; populates next_eligible_hash; next_eligible computed without scope |
| `StateManager` service saveState | 4 | records root counter at write; populates hash; computes eligibility with service scope; does NOT write save_counter on service state (root-only field) |
| `readEligible` helper | 7 | valid global cache → used; valid service cache → used; missing hash → recompute; hash mismatch → recompute; service scope + root counter match → used; service scope + root counter mismatch → recompute; service scope + missing root counter → recompute |
| `next.ts` integration | 4 | cache-hit path skips computeEligible; cache-miss path recomputes; service cache invalidated by root mutation; service scope correctness |
| `status.ts` integration | 2 | cache preferred; fallback on hash mismatch |
| `resolver.ts` hash exposure | 2 | `getPipelineHash('global')` and `getPipelineHash('service')` differ; memoization works |
| Cross-file invalidation end-to-end | 2 | e2e: root mutation makes service `next` recompute; service mutation does not invalidate root cache |
| **Total new** | **~36** | |

Existing tests that reference `next_eligible: []`:
- 37 test files reference it (per prior exploration)
- Most are state fixtures that set `next_eligible: []` for completeness. They keep working — mock StateManager doesn't save, so fixtures stay as-is.
- ~10 tests in `state-manager.test.ts`, `skip.test.ts`, `status.test.ts`, `next.test.ts` assert specific values. Review one-by-one; any that depend on specific cache contents must be updated as fixtures migrate to include `next_eligible_hash` / `next_eligible_root_counter` / `save_counter`.

---

## Refactoring Scope

### New production files

| File | Purpose |
|------|---------|
| `src/core/pipeline/graph-hash.ts` | `computePipelineHash()` |
| `src/core/pipeline/read-eligible.ts` | `readEligible()` helper |
| `src/state/root-counter-reader.ts` | `readRootSaveCounter()` |

### Modified production files

| File | Change |
|------|--------|
| `src/types/state.ts` | Add `save_counter?`, `next_eligible_hash?`, `next_eligible_root_counter?` |
| `src/core/pipeline/types.ts` | Add `getPipelineHash: (scope) => string` to `ResolvedPipeline` |
| `src/core/pipeline/resolver.ts` | Compute memoized hash getter; include in return |
| `src/state/state-manager.ts` | Constructor accepts `pipelineHash?` (no reader param); `loadState` captures root `save_counter` internally; `saveState` writes counters + scope-correct eligibility using the captured value |
| `src/cli/commands/run.ts`, `next.ts`, `status.ts`, `skip.ts`, `reset.ts`, `rework.ts`, `complete.ts`, `info.ts`, `dashboard.ts` | Thread `pipelineHash` to `StateManager` constructor. `next.ts` + `status.ts` also switch to `readEligible` (passing `readRootSaveCounter` for service scope). |
| `src/cli/commands/adopt.ts` | Thread `pipelineHash` — uses StateManager for initial `initializeState()` |
| `src/wizard/wizard.ts` | Thread `pipelineHash` — uses StateManager for initial `initializeState()` |

### New test files

| File | Purpose |
|------|---------|
| `src/core/pipeline/graph-hash.test.ts` | Hash determinism + stability (7 tests) |
| `src/core/pipeline/read-eligible.test.ts` | `readEligible` helper (7 tests) |
| `src/state/root-counter-reader.test.ts` | File I/O edge cases (4 tests) |

### Modified test files

| File | Change |
|------|--------|
| `src/state/state-manager.test.ts` | Add saveState scope-correctness + counter tests (7 tests); update fixtures to include new fields or treat as absent |
| `src/cli/commands/next.test.ts` | Add cache-preferred + hash-mismatch + root-mutation-invalidation tests (4 tests); update StateManager construction fixtures |
| `src/cli/commands/status.test.ts` | Similar to next.test.ts (2 tests) |
| `src/cli/commands/run.test.ts`, `skip.test.ts`, etc. | Update StateManager construction fixtures only (no new tests) |
| `src/core/pipeline/resolver.test.ts` | Assert `getPipelineHash` present + scope-sensitive (2 tests) |
| `src/e2e/cross-service-references.test.ts` + similar e2e | Update if any mock root states exist |

### Scope estimate

- Production: **~300 lines** (3 new helpers + state-manager refactor + 10 command call-site updates + resolver memoization)
- Tests: **~400 lines** (3 new test files + ~10 test updates)
- **Total**: **~700 lines** across ~25 files

Larger than v3.18.0's 1158-insertion scope. Comparable to Wave 3c's 13-task structure.

---

## Rollout

1. Land in a single PR via 15-task plan (parallel to Wave 3c+1's 13-task structure).
2. Per-task MMR review matching the v3.18.0 discipline.
3. Minor version bump to **v3.19.0** (new state fields + internal behavior changes warrant a minor, not a patch).
4. Legacy state files without `next_eligible_hash` / `save_counter` degrade to live recompute until first `saveState`. No user action required.

---

## Acceptance Criteria

- **AC1**: `scaffold next` on a complete project skips the graph traversal on cache hit. (Perf gain is modest but real — locked by the cache-preferred test.)
- **AC2**: `scaffold next --service api` on a multi-service project never surfaces a global step as eligible, **even after a global step completes**. (Cross-file invalidation.)
- **AC3**: Editing a pipeline YAML (e.g., adding a dep) and running `scaffold next` without any intervening state mutation surfaces the correct eligible list. (Hash invalidation.)
- **AC4**: Editing a pipeline YAML to change step `order` only changes the emitted next-eligible list correctly. (Round-1 P1 lock.)
- **AC5**: `scaffold status --json` for a service-scoped project returns `nextEligible` containing only service steps. (P0 source-fix.)
- **AC6**: Full test suite 2240+/2240+ pass; `tsc --noEmit` clean; `make check-all` exit 0.
- **AC7**: All 10 command files thread `pipelineHash` and (where applicable) `rootCounterReader`. (Round-1 P2 lock.)
