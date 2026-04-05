# ResolvedPipeline — Centralized Pipeline Resolution

## Problem

Every CLI command reimplements the same 5-step resolution sequence:

```
discover meta-prompts → load config → load/select preset → resolve overlay → build graph
```

This sequence is copy-pasted across `run.ts`, `status.ts`, `next.ts`, `rework.ts`, and `utils/eligible.ts` (which reimplements the entire pipeline as a standalone factory for `complete`/`skip`/`reset`). Any change to the resolution sequence requires updating 5+ files. The graph is rebuilt 2-3 times per command invocation.

Additionally, `resolveEnablement()` in `methodology-resolver.ts` implements custom step enablement precedence but is never called — custom step enablement overrides are silently ignored. (Custom depth overrides work correctly via `resolveDepth()` in `depth-resolver.ts` — only enablement is broken.)

## Solution

A two-layer abstraction that separates I/O from computation:

```
loadPipelineContext(projectRoot, opts?)
        │
        ▼
  PipelineContext        ← plain data, all I/O done
        │
        ▼
resolvePipeline(context, opts?)
        │
        ▼
  ResolvedPipeline       ← pure computation result
        │
        ▼
  command-specific logic  ← run does assembly, status does display, etc.
```

**Layer 1 — `loadPipelineContext()`**: Handles all filesystem reads (meta-prompt discovery, config loading, preset loading, state loading). Returns a plain data object.

**Layer 2 — `resolvePipeline()`**: Computation layer. Selects preset, applies custom enablement overrides, resolves overlay, builds graph, and returns a closure for eligibility computation. Nearly pure — the one I/O exception is overlay file loading via `resolveOverlayState()`, which reads the overlay YAML and may emit warnings. This trade-off keeps the existing overlay resolver intact rather than splitting it across layers.

## Types

### PipelineContext

Everything loaded from disk, before computation. State is intentionally
excluded — commands load state at command-appropriate timing (after lock
acquisition for mutating commands, before display for read-only commands).

```typescript
interface PipelineContext {
  projectRoot: string
  metaPrompts: Map<string, MetaPromptFile>
  config: ScaffoldConfig
  configErrors: ScaffoldError[]
  presets: {
    mvp: MethodologyPreset | null
    deep: MethodologyPreset | null
    custom: MethodologyPreset | null
  }
  methodologyDir: string
}
```

### ResolvedPipeline

Everything computed from the context:

```typescript
interface ResolvedPipeline {
  graph: DependencyGraph
  preset: MethodologyPreset
  overlay: OverlayState
  stepMeta: Map<string, MetaPromptFrontmatter>
  computeEligible: (steps: Record<string, StepStateEntry>) => string[]
}
```

`computeEligible` is a closure that captures the graph. Commands load state
at the appropriate time (after lock acquisition for mutating commands) and
call `pipeline.computeEligible(state.steps)` to get eligibility. No
pre-computed `eligible` array — it would be stale after state reconciliation
or lock-protected mutations.

`overlay` contains `steps`, `knowledge`, `reads`, and `dependencies` maps. Commands that need overlay data (primarily `run.ts` for knowledge injection, reads assembly, and dependency overrides) access it directly. Commands that don't need it ignore it.

## Function Signatures

### loadPipelineContext

```typescript
export function loadPipelineContext(
  projectRoot: string,
  options?: {
    includeTools?: boolean  // default false; run.ts sets true
    output?: OutputContext   // for overlay warning messages
  }
): PipelineContext
```

- `includeTools: true` → `discoverAllMetaPrompts(pipelineDir, toolsDir)`
- `includeTools: false` → `discoverMetaPrompts(pipelineDir)`
- Loads config via `loadConfig(projectRoot, knownSteps)`
- Loads all presets via `loadAllPresets(methodologyDir, knownSteps)`
- Synchronous — all underlying functions are synchronous
- Does NOT load state — commands handle state loading independently

### resolvePipeline

```typescript
export function resolvePipeline(
  context: PipelineContext,
  options?: {
    output?: OutputContext  // for overlay warning messages
  }
): ResolvedPipeline
```

Resolution sequence:

1. **Select preset** from `context.config.methodology` (mvp / custom / deep, fallback to deep)
2. **Apply custom enablement overrides** — for each entry in `config.custom?.steps`, if `enabled` is defined, override the selected preset step's `enabled` field. Only enablement is merged here; depth remains the responsibility of `resolveDepth()`. Precedence: custom enablement > preset default > disabled. This fixes the current bug where custom step enablement is silently ignored.
3. **Resolve overlay** — call existing `resolveOverlayState()` with merged steps. Precedence becomes: overlay > custom enablement > preset > disabled.
4. **Build graph** — convert `overlay.steps` to a `Map<string, { enabled: boolean }>` via `new Map(Object.entries(overlay.steps))`, then call `buildGraph()` once with overlay-aware enablement. **Note:** Overlay dependency overrides (`overlay.dependencies`) are not fed into graph construction — `buildGraph()` uses frontmatter dependencies. Only `run.ts` consults overlay dependency overrides at runtime (for dep-check and artifact gathering). This is an existing limitation; extending `buildGraph()` to accept resolved dependencies is out of scope for this refactor but could be a follow-up.
5. **Build stepMeta** — extract frontmatter map from meta-prompts.
6. **Build computeEligible closure** — captures graph, returns `(steps) => computeEligible(graph, steps)`.

## Module Structure

```
src/core/pipeline/
  types.ts           ← PipelineContext, ResolvedPipeline interfaces
  context.ts         ← loadPipelineContext()
  resolver.ts        ← resolvePipeline()
```

This directory sits above `assembly/` and `dependency/` in the module hierarchy. The pipeline resolver composes those lower-level modules — it calls `resolveOverlayState()` from `assembly/` and `buildGraph()` + `computeEligible()` from `dependency/`.

## Command Migration

### Before (status.ts, ~30 lines)

```typescript
const metaPrompts = discoverMetaPrompts(pipelineDir)
const { config } = loadConfig(projectRoot, [...metaPrompts.keys()])
const presets = loadAllPresets(methodologyDir, [...metaPrompts.keys()])
const preset = config.methodology === 'mvp' ? presets.mvp : ...
const overlayState = resolveOverlayState({
  config, methodologyDir, metaPrompts,
  presetSteps: preset?.steps ?? {}, output
})
const presetStepsMap = new Map(Object.entries(overlayState.steps))
const computeEligibleFn = (steps) => {
  const graph = buildGraph(
    [...metaPrompts.values()].map(m => m.frontmatter),
    presetStepsMap
  )
  return computeEligible(graph, steps)
}
const stateManager = new StateManager(projectRoot, computeEligibleFn)
```

### After (~4 lines)

```typescript
const context = loadPipelineContext(projectRoot, { output })
const pipeline = resolvePipeline(context, { output })
const stateManager = new StateManager(projectRoot, pipeline.computeEligible)
// Commands load state at the right time:
// - Read-only (status, next): stateManager.loadState() immediately
// - Mutating (run, rework, complete, skip, reset): after lock acquisition
```

### Command-Specific Needs

| Command | What it uses beyond the shared resolution |
|---------|------------------------------------------|
| `run` | `pipeline.overlay.knowledge[step]`, `pipeline.overlay.reads`, `pipeline.overlay.dependencies[step]`, lock management, crash recovery, update mode detection, depth resolution, prompt assembly |
| `status` | State reconciliation (`stateManager.reconcileWithPipeline()`), progress stats, phase grouping |
| `next` | State reconciliation, `--count` filtering |
| `rework` | Lock management, phase selection, batch reset, session creation |
| `complete/skip/reset` | `pipeline.computeEligible` (replaces `buildComputeEligibleFn()`) |

State reconciliation remains command-specific — it's a state mutation that depends on the resolved pipeline but isn't part of resolution itself.

## Edge Cases

### Non-game projects (no overlay)

`resolveOverlayState()` already handles this — returns preset steps unchanged and preserves the frontmatter-derived knowledge, reads, and dependencies maps (these are populated from meta-prompt frontmatter, not the overlay). No special-casing needed in `resolvePipeline()`.

### Custom methodology

`resolvePipeline()` applies custom enablement overrides during step 2, before overlay resolution. This fixes the current behavior where `resolveEnablement()` implements the precedence but is never called — custom step enablement will actually work.

Final enablement precedence: overlay > custom enablement > preset > disabled.

### Other consumers

`build.ts`, `dashboard.ts`, and `list.ts` also perform partial resolution. These are lower-priority migration candidates — they can continue with their current inline resolution until the primary commands are migrated. Include them in a follow-up pass.

### Rework behavioral change

`rework.ts` currently calls `loadConfig(projectRoot, [])` with an empty `knownSteps` array, skipping custom step validation. `loadPipelineContext()` uses `[...metaPrompts.keys()]` for all commands. This changes rework to validate custom steps — an improvement, but a behavioral change to note in testing.

### Graph rebuilt multiple times

Today every command builds the graph 2-3 times. `resolvePipeline()` builds it once. The `computeEligible` closure reuses this graph instance. Commands that need fresh eligibility after state mutations call `pipeline.computeEligible(updatedSteps)`.

## Cleanup

### Delete `src/utils/eligible.ts`

`buildComputeEligibleFn()` reimplements the entire resolution pipeline as a standalone factory. With `resolvePipeline()`, `complete/skip/reset` get `pipeline.computeEligible` directly. The factory is redundant. **Migration order:** keep `eligible.ts` until `complete.ts`, `skip.ts`, and `reset.ts` are migrated to use `pipeline.computeEligible`; delete it as the final cleanup step.

### Delete `resolveEnablement()` from `src/core/assembly/methodology-resolver.ts`

Dead code — never called by any production code (only by its own test file). Its custom enablement logic is absorbed into `resolvePipeline()`. The file has no other exports — delete the file and its test.

### Remove duplicated imports from commands

After migration, commands no longer import `discoverMetaPrompts`, `loadAllPresets`, `resolveOverlayState`, `buildGraph`, or `computeEligible` directly. These become internal details of the pipeline module.

## Impact

- **2-3 new files**: `types.ts`, `context.ts`, `resolver.ts` in `src/core/pipeline/`
- **1 deleted file**: `src/utils/eligible.ts`
- **1 deleted function**: `resolveEnablement()` (+ file if empty)
- **5+ simplified commands**: run, status, next, rework, complete, skip, reset
- **~150 lines removed** across commands, **~120 lines added** in new module
- **Behavior fix**: Custom step enablement overrides applied for the first time (depth overrides already work via `resolveDepth()`)
- **Performance**: Graph built 1x per command instead of 2-3x
- **Incremental migration**: Commands can adopt one at a time — no big-bang rewrite
