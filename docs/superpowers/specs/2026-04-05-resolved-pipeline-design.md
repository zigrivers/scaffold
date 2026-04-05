# ResolvedPipeline — Centralized Pipeline Resolution

## Problem

Every CLI command reimplements the same 5-step resolution sequence:

```
discover meta-prompts → load config → load/select preset → resolve overlay → build graph
```

This sequence is copy-pasted across `run.ts`, `status.ts`, `next.ts`, `rework.ts`, and `utils/eligible.ts` (which reimplements the entire pipeline as a standalone factory for `complete`/`skip`/`reset`). Any change to the resolution sequence requires updating 5+ files. The graph is rebuilt 2-3 times per command invocation.

Additionally, `resolveEnablement()` in `methodology-resolver.ts` implements custom step override precedence but is never called — custom overrides are silently ignored.

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

**Layer 2 — `resolvePipeline()`**: Pure function. Selects preset, applies custom overrides, resolves overlay, builds graph, computes eligibility. Returns a fully-resolved pipeline state.

## Types

### PipelineContext

Everything loaded from disk, before computation:

```typescript
interface PipelineContext {
  projectRoot: string
  metaPrompts: Map<string, MetaPrompt>
  config: ScaffoldConfig
  configErrors: ConfigError[]
  presets: {
    mvp?: MethodologyPreset
    deep?: MethodologyPreset
    custom?: MethodologyPreset
  }
  methodologyDir: string
  state: State
}
```

### ResolvedPipeline

Everything computed from the context:

```typescript
interface ResolvedPipeline {
  graph: DependencyGraph
  eligible: string[]
  preset: MethodologyPreset
  overlay: OverlayState
  stepMeta: Map<string, MetaPromptFrontmatter>
  computeEligible: (steps: Record<string, StepStateEntry>) => string[]
}
```

`computeEligible` is a closure that captures the graph and overlay. Commands call it after mutating state (e.g., marking a step complete) to get updated eligibility without rebuilding the graph.

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
- Loads state via `StateManager.loadState()`

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
2. **Apply custom overrides** — merge `config.custom.steps` entries over selected preset steps. Precedence: custom override > preset default > disabled. This fixes the current bug where custom overrides are silently ignored.
3. **Resolve overlay** — call existing `resolveOverlayState()` with merged steps. Precedence becomes: overlay > custom override > preset > disabled.
4. **Build graph** — call `buildGraph()` once with overlay-aware steps.
5. **Compute initial eligibility** — call `computeEligible(graph, context.state.steps)`.
6. **Build stepMeta** — extract frontmatter map from meta-prompts.
7. **Build computeEligible closure** — captures graph, returns `(steps) => computeEligible(graph, steps)`.

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

### After (~3 lines)

```typescript
const context = loadPipelineContext(projectRoot, { output })
const pipeline = resolvePipeline(context, { output })
const stateManager = new StateManager(projectRoot, pipeline.computeEligible)
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

`resolveOverlayState()` already handles this — returns preset steps unchanged with empty knowledge/reads/dependencies maps. No special-casing needed in `resolvePipeline()`.

### Custom methodology

`resolvePipeline()` applies custom overrides during step 2, before overlay resolution. This fixes the current behavior where `resolveEnablement()` implements the precedence but is never called — custom step overrides will actually work.

Final enablement precedence: overlay > custom override > preset > disabled.

### Graph rebuilt multiple times

Today every command builds the graph 2-3 times. `resolvePipeline()` builds it once. The `computeEligible` closure reuses this graph instance. Commands that need fresh eligibility after state mutations call `pipeline.computeEligible(updatedSteps)`.

## Cleanup

### Delete `src/utils/eligible.ts`

`buildComputeEligibleFn()` reimplements the entire resolution pipeline as a standalone factory. With `resolvePipeline()`, `complete/skip/reset` get `pipeline.computeEligible` directly. The factory is redundant.

### Delete `resolveEnablement()` from `src/core/assembly/methodology-resolver.ts`

Dead code — never called. Its custom override logic is absorbed into `resolvePipeline()`. If `methodology-resolver.ts` has no other exports, delete the file.

### Remove duplicated imports from commands

After migration, commands no longer import `discoverMetaPrompts`, `loadAllPresets`, `resolveOverlayState`, `buildGraph`, or `computeEligible` directly. These become internal details of the pipeline module.

## Impact

- **2-3 new files**: `types.ts`, `context.ts`, `resolver.ts` in `src/core/pipeline/`
- **1 deleted file**: `src/utils/eligible.ts`
- **1 deleted function**: `resolveEnablement()` (+ file if empty)
- **5+ simplified commands**: run, status, next, rework, complete, skip, reset
- **~150 lines removed** across commands, **~120 lines added** in new module
- **Behavior fix**: Custom step overrides applied for the first time
- **Performance**: Graph built 1x per command instead of 2-3x
- **Incremental migration**: Commands can adopt one at a time — no big-bang rewrite
