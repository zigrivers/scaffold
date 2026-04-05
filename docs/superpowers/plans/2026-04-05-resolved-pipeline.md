# ResolvedPipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize pipeline resolution into a shared two-layer abstraction (`loadPipelineContext` + `resolvePipeline`) to eliminate duplication across 7 CLI commands.

**Architecture:** New `src/core/pipeline/` module with types, context loader, and resolver. Commands migrate incrementally from inline resolution to the shared abstraction. Dead code (`eligible.ts`, `methodology-resolver.ts`) deleted after migration.

**Tech Stack:** TypeScript, Vitest, Zod

**MMR Review:** Every task must be reviewed via multi-model review (Codex CLI + Gemini CLI + Superpowers code-reviewer) after implementation. Fix all P0, P1, and P2 findings before moving to the next task.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/core/pipeline/types.ts` | Create | PipelineContext, ResolvedPipeline interfaces |
| `src/core/pipeline/context.ts` | Create | loadPipelineContext() — all I/O |
| `src/core/pipeline/context.test.ts` | Create | Tests for context loader |
| `src/core/pipeline/resolver.ts` | Create | resolvePipeline() — computation |
| `src/core/pipeline/resolver.test.ts` | Create | Tests for resolver |
| `src/cli/commands/status.ts` | Modify | Migrate to loadPipelineContext + resolvePipeline |
| `src/cli/commands/next.ts` | Modify | Migrate to loadPipelineContext + resolvePipeline |
| `src/cli/commands/run.ts` | Modify | Migrate to loadPipelineContext + resolvePipeline |
| `src/cli/commands/rework.ts` | Modify | Migrate to loadPipelineContext + resolvePipeline |
| `src/cli/commands/complete.ts` | Modify | Migrate from eligible.ts to resolvePipeline |
| `src/cli/commands/skip.ts` | Modify | Migrate from eligible.ts to resolvePipeline |
| `src/cli/commands/reset.ts` | Modify | Migrate from eligible.ts to resolvePipeline |
| `src/utils/eligible.ts` | Delete | Replaced by resolvePipeline().computeEligible |
| `src/utils/eligible.test.ts` | Delete (if exists) | Tests for deleted file |
| `src/core/assembly/methodology-resolver.ts` | Delete | Dead code — resolveEnablement() never called |
| `src/core/assembly/methodology-resolver.test.ts` | Delete | Tests for deleted file |

**Import path notes:** From `src/core/pipeline/*.ts`, the overlay resolver import is `../assembly/overlay-state-resolver.js`. The graph builder is `../dependency/graph.js`. The eligibility function is `../dependency/eligibility.js`. Config loader is `../../config/loader.js`. Meta-prompt loader is `../assembly/meta-prompt-loader.js`. Preset loader is `../assembly/preset-loader.js`. FS utilities are `../../utils/fs.js`.

---

### Task 1: Create types module

**Files:**
- Create: `src/core/pipeline/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/core/pipeline/types.ts
import type { MetaPromptFile, MetaPromptFrontmatter } from '../../types/frontmatter.js'
import type {
  ScaffoldConfig, StepEnablementEntry, MethodologyPreset,
  DependencyGraph, ScaffoldError, ScaffoldWarning,
  StepStateEntry,
} from '../../types/index.js'
import type { OverlayState } from '../assembly/overlay-state-resolver.js'

export interface PipelineContext {
  projectRoot: string
  metaPrompts: Map<string, MetaPromptFile>
  config: ScaffoldConfig | null
  configErrors: ScaffoldError[]
  configWarnings: ScaffoldWarning[]
  presets: {
    mvp: MethodologyPreset | null
    deep: MethodologyPreset | null
    custom: MethodologyPreset | null
  }
  methodologyDir: string
}

export interface ResolvedPipeline {
  graph: DependencyGraph
  preset: MethodologyPreset
  overlay: OverlayState
  stepMeta: Map<string, MetaPromptFrontmatter>
  computeEligible: (steps: Record<string, StepStateEntry>) => string[]
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (types-only file, no runtime code)

- [ ] **Step 3: Commit**

---

### Task 2: Create context loader with tests

**Files:**
- Create: `src/core/pipeline/context.ts`
- Create: `src/core/pipeline/context.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/core/pipeline/context.test.ts
import { describe, it, expect, vi } from 'vitest'
import { loadPipelineContext } from './context.js'

// We test by calling loadPipelineContext on the real scaffold content directory.
// This validates the integration with actual meta-prompts, config, and presets.

describe('loadPipelineContext', () => {
  it('returns metaPrompts map with pipeline steps', () => {
    const ctx = loadPipelineContext(process.cwd())
    expect(ctx.metaPrompts.size).toBeGreaterThan(50) // 60+ steps
    expect(ctx.metaPrompts.has('create-prd')).toBe(true)
  })

  it('returns presets with deep and mvp', () => {
    const ctx = loadPipelineContext(process.cwd())
    expect(ctx.presets.deep).not.toBeNull()
    expect(ctx.presets.mvp).not.toBeNull()
  })

  it('returns methodologyDir as a string', () => {
    const ctx = loadPipelineContext(process.cwd())
    expect(typeof ctx.methodologyDir).toBe('string')
    expect(ctx.methodologyDir).toContain('methodology')
  })

  it('excludes tools by default', () => {
    const ctx = loadPipelineContext(process.cwd())
    expect(ctx.metaPrompts.has('new-enhancement')).toBe(false)
  })

  it('includes tools when includeTools is true', () => {
    const ctx = loadPipelineContext(process.cwd(), { includeTools: true })
    expect(ctx.metaPrompts.has('new-enhancement')).toBe(true)
  })

  it('config is null when project has no .scaffold/config.yml', () => {
    const ctx = loadPipelineContext('/tmp/nonexistent-project-dir-' + Date.now())
    expect(ctx.config).toBeNull()
    expect(ctx.configErrors.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/core/pipeline/context.test.ts`
Expected: FAIL — `loadPipelineContext` does not exist

- [ ] **Step 3: Implement loadPipelineContext**

```typescript
// src/core/pipeline/context.ts
import { discoverMetaPrompts, discoverAllMetaPrompts } from '../assembly/meta-prompt-loader.js'
import { loadAllPresets } from '../assembly/preset-loader.js'
import { loadConfig } from '../../config/loader.js'
import { getPackagePipelineDir, getPackageToolsDir, getPackageMethodologyDir } from '../../utils/fs.js'
import type { OutputContext } from '../../cli/output/context.js'
import type { PipelineContext } from './types.js'

export function loadPipelineContext(
  projectRoot: string,
  options?: {
    includeTools?: boolean
    output?: OutputContext
  },
): PipelineContext {
  const pipelineDir = getPackagePipelineDir(projectRoot)
  const methodologyDir = getPackageMethodologyDir(projectRoot)

  const metaPrompts = options?.includeTools
    ? discoverAllMetaPrompts(pipelineDir, getPackageToolsDir(projectRoot))
    : discoverMetaPrompts(pipelineDir)

  const knownSteps = [...metaPrompts.keys()]
  const { config, errors: configErrors, warnings: configWarnings } = loadConfig(projectRoot, knownSteps)
  const { deep, mvp, custom } = loadAllPresets(methodologyDir, knownSteps)

  return {
    projectRoot,
    metaPrompts,
    config,
    configErrors,
    configWarnings,
    presets: { deep, mvp, custom },
    methodologyDir,
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/core/pipeline/context.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

---

### Task 3: Create resolver with tests

**Files:**
- Create: `src/core/pipeline/resolver.ts`
- Create: `src/core/pipeline/resolver.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/core/pipeline/resolver.test.ts
import { describe, it, expect } from 'vitest'
import { resolvePipeline } from './resolver.js'
import { loadPipelineContext } from './context.js'

describe('resolvePipeline', () => {
  it('returns a DependencyGraph with nodes', () => {
    const ctx = loadPipelineContext(process.cwd())
    const pipeline = resolvePipeline(ctx)
    expect(pipeline.graph.nodes.size).toBeGreaterThan(50)
  })

  it('returns a preset matching the config methodology', () => {
    const ctx = loadPipelineContext(process.cwd())
    const pipeline = resolvePipeline(ctx)
    // Default config uses 'deep' methodology
    expect(pipeline.preset).not.toBeNull()
    expect(pipeline.preset.name).toBeDefined()
  })

  it('returns overlay with steps record', () => {
    const ctx = loadPipelineContext(process.cwd())
    const pipeline = resolvePipeline(ctx)
    expect(typeof pipeline.overlay.steps).toBe('object')
    expect(Object.keys(pipeline.overlay.steps).length).toBeGreaterThan(50)
  })

  it('returns stepMeta map keyed by step name', () => {
    const ctx = loadPipelineContext(process.cwd())
    const pipeline = resolvePipeline(ctx)
    expect(pipeline.stepMeta.has('create-prd')).toBe(true)
    expect(pipeline.stepMeta.get('create-prd')?.phase).toBe('pre')
  })

  it('returns computeEligible that accepts steps and returns string[]', () => {
    const ctx = loadPipelineContext(process.cwd())
    const pipeline = resolvePipeline(ctx)
    const eligible = pipeline.computeEligible({})
    expect(Array.isArray(eligible)).toBe(true)
    expect(eligible.length).toBeGreaterThan(0) // empty state = root steps eligible
  })

  it('applies custom enablement overrides when config has custom steps', () => {
    const ctx = loadPipelineContext(process.cwd())
    // Mutate context to test custom override (synthetic)
    if (ctx.config) {
      ctx.config.custom = {
        steps: { 'create-prd': { enabled: false } },
      }
    }
    const pipeline = resolvePipeline(ctx)
    const prdNode = pipeline.graph.nodes.get('create-prd')
    expect(prdNode?.enabled).toBe(false)
  })

  it('custom-enables a step absent from preset (e.g., mvp + custom enable review-prd)', () => {
    const ctx = loadPipelineContext(process.cwd())
    if (ctx.config) {
      ctx.config.methodology = 'mvp'
      ctx.config.custom = {
        steps: { 'review-prd': { enabled: true } },
      }
    }
    const pipeline = resolvePipeline(ctx)
    const node = pipeline.graph.nodes.get('review-prd')
    expect(node?.enabled).toBe(true)
  })

  it('handles null config gracefully (fallback to deep, frontmatter maps preserved)', () => {
    const ctx = loadPipelineContext(process.cwd())
    ctx.config = null
    const pipeline = resolvePipeline(ctx)
    expect(pipeline.preset).not.toBeNull()
    expect(pipeline.graph.nodes.size).toBeGreaterThan(50)
    // Verify frontmatter-derived maps are not empty
    expect(Object.keys(pipeline.overlay.knowledge).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/core/pipeline/resolver.test.ts`
Expected: FAIL — `resolvePipeline` does not exist

- [ ] **Step 3: Implement resolvePipeline**

```typescript
// src/core/pipeline/resolver.ts
import { resolveOverlayState } from '../assembly/overlay-state-resolver.js'
import { buildGraph } from '../dependency/graph.js'
import { computeEligible } from '../dependency/eligibility.js'
import { createOutputContext } from '../../cli/output/context.js'
import type { OutputContext } from '../../cli/output/context.js'
import type { StepEnablementEntry } from '../../types/config.js'
import type { StepStateEntry } from '../../types/state.js'
import type { MetaPromptFrontmatter } from '../../types/frontmatter.js'
import type { OverlayState } from '../assembly/overlay-state-resolver.js'
import type { PipelineContext, ResolvedPipeline } from './types.js'

export function resolvePipeline(
  context: PipelineContext,
  options?: { output?: OutputContext },
): ResolvedPipeline {
  const { config, presets, metaPrompts, methodologyDir } = context
  const output = options?.output ?? createOutputContext('auto')

  // 1. Select preset (fallback to deep)
  const methodology = config?.methodology ?? 'deep'
  const preset =
    (methodology === 'mvp' ? presets.mvp : methodology === 'custom' ? presets.custom : presets.deep) ??
    presets.deep
  // Fallback when no preset found (matches current rework.ts behavior)
  const resolvedPreset = preset ?? {
    name: 'deep' as const,
    description: 'Default deep methodology',
    default_depth: 3 as any,
    steps: {} as Record<string, StepEnablementEntry>,
  }

  // 2. Apply custom enablement overrides
  const mergedSteps: Record<string, StepEnablementEntry> = { ...resolvedPreset.steps }
  if (config?.custom?.steps) {
    for (const [name, customStep] of Object.entries(config.custom.steps)) {
      if (customStep.enabled !== undefined) {
        mergedSteps[name] = { ...(mergedSteps[name] ?? {}), enabled: customStep.enabled }
      }
    }
  }

  // 3. Resolve overlay
  let overlay: OverlayState
  if (config) {
    overlay = resolveOverlayState({ config, methodologyDir, metaPrompts, presetSteps: mergedSteps, output })
  } else {
    // No config — extract base maps from frontmatter (matches resolveOverlayState default behavior)
    const knowledge: Record<string, string[]> = {}
    const reads: Record<string, string[]> = {}
    const dependencies: Record<string, string[]> = {}
    for (const [name, mp] of metaPrompts) {
      knowledge[name] = [...(mp.frontmatter.knowledgeBase ?? [])]
      reads[name] = [...(mp.frontmatter.reads ?? [])]
      dependencies[name] = [...(mp.frontmatter.dependencies ?? [])]
    }
    overlay = { steps: mergedSteps, knowledge, reads, dependencies }
  }

  // 4. Build graph (once)
  const frontmatters = [...metaPrompts.values()].map((mp) => mp.frontmatter)
  const presetStepsMap = new Map(
    Object.entries(overlay.steps).map(([k, v]) => [k, { enabled: v.enabled }]),
  )
  const graph = buildGraph(frontmatters, presetStepsMap)

  // 5. Build stepMeta
  const stepMeta = new Map<string, MetaPromptFrontmatter>()
  for (const [name, mp] of metaPrompts) {
    stepMeta.set(name, mp.frontmatter)
  }

  // 6. Build computeEligible closure
  const computeEligibleFn = (steps: Record<string, StepStateEntry>): string[] =>
    computeEligible(graph, steps)

  return { graph, preset: resolvedPreset, overlay, stepMeta, computeEligible: computeEligibleFn }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/core/pipeline/resolver.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

---

### Task 4: Migrate status.ts

**Files:**
- Modify: `src/cli/commands/status.ts`

- [ ] **Step 1: Read `status.ts`** to find the current resolution block (lines ~105-142)

- [ ] **Step 2: Replace the resolution block**

Replace the inline resolution sequence (discoverMetaPrompts → loadConfig → loadAllPresets → resolveOverlayState → computeEligibleFn closure) with:

```typescript
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'

// Replace ~30 lines of inline resolution with:
const context = loadPipelineContext(projectRoot, { output })
const pipeline = resolvePipeline(context, { output })
const stateManager = new StateManager(projectRoot, pipeline.computeEligible)
```

Keep all command-specific logic unchanged: state reconciliation, progress stats, phase grouping, output formatting.

**Key migration points for status.ts:**
- Use `pipeline.stepMeta` where status.ts accesses `metaPrompts.get(name)?.frontmatter`
- Use `context.metaPrompts` where it needs the full `MetaPromptFile`
- Replace `presetSteps.get(name)?.enabled` in `pipelineSteps` construction (~line 150) with `pipeline.overlay.steps[name]?.enabled ?? false`
- Replace the second graph build at lines ~243-248 (`buildGraph(...)` + `computeEligible(graph, state.steps)`) with `pipeline.computeEligible(state.steps)`

Remove unused imports: `discoverMetaPrompts`, `loadAllPresets`, `resolveOverlayState`, `buildGraph`, `computeEligible`, `loadConfig`, `getPackagePipelineDir`, `getPackageMethodologyDir`.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run && make check`
Expected: All tests pass

- [ ] **Step 4: Commit**

---

### Task 5: Migrate next.ts

**Files:**
- Modify: `src/cli/commands/next.ts`

- [ ] **Step 1: Read `next.ts`** to find the current resolution block (lines ~51-86)

- [ ] **Step 2: Replace the resolution block**

Same pattern as Task 4:

```typescript
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'

const context = loadPipelineContext(projectRoot, { output })
const pipeline = resolvePipeline(context, { output })
const stateManager = new StateManager(projectRoot, pipeline.computeEligible)
```

Keep command-specific logic unchanged: state reconciliation, `--count` filtering, eligible step output. Use `pipeline.stepMeta` for step descriptions. Replace the inline graph rebuild at lines ~101-105 with `pipeline.computeEligible(state.steps)`.

Remove unused imports.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run && make check`
Expected: All tests pass

- [ ] **Step 4: Commit**

---

### Task 6: Migrate rework.ts

**Files:**
- Modify: `src/cli/commands/rework.ts`

- [ ] **Step 1: Read `rework.ts`** to find the resolution block (lines ~276-320)

- [ ] **Step 2: Replace the resolution block**

```typescript
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'

const context = loadPipelineContext(projectRoot, { output })
const pipeline = resolvePipeline(context, { output })
const stateManager = new StateManager(projectRoot, pipeline.computeEligible)
```

**Important:** rework.ts is a mutating command that currently exits on null config. Preserve this:
```typescript
if (!context.config) {
  for (const err of context.configErrors) output.error(err.message)
  process.exit(1)
  return
}
```

Note: rework.ts currently calls `loadConfig(projectRoot, [])` with empty knownSteps. `loadPipelineContext` uses `[...metaPrompts.keys()]` instead — this changes rework to validate custom steps (improvement, but behavioral change). Keep all rework-specific logic: lock management, phase selection, batch reset, session creation. Use `pipeline.graph` where rework builds its own graph.

Remove unused imports.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run && make check`
Expected: All tests pass

- [ ] **Step 4: Commit**

---

### Task 7: Migrate run.ts

**Files:**
- Modify: `src/cli/commands/run.ts`

- [ ] **Step 1: Read `run.ts`** to find the resolution block (lines ~89-176)

- [ ] **Step 2: Replace the resolution block**

```typescript
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'

const context = loadPipelineContext(projectRoot, { includeTools: true, output })
const pipeline = resolvePipeline(context, { output })
```

**Important:** run.ts is a mutating command that currently exits on null config. Preserve this:
```typescript
if (!context.config) {
  for (const err of context.configErrors) output.error(err.message)
  process.exit(1)
  return
}
```

`run.ts` is the most complex command. Key migration points:
- Use `context.metaPrompts` for meta-prompt lookups (step validation, frontmatter access)
- Use `pipeline.graph` for dependency checking (replaces inline `buildGraph` calls)
- Use `pipeline.overlay.knowledge[step]` for knowledge injection (unchanged access pattern)
- Use `pipeline.overlay.reads` for reads artifact gathering (unchanged access pattern)
- Use `pipeline.overlay.dependencies[step]` for dependency override priority (unchanged access pattern)
- Use `pipeline.computeEligible` for the StateManager constructor and post-completion eligibility
- Use `pipeline.preset` for depth resolution via `resolveDepth()`
- Keep all run-specific logic: lock management, crash recovery, update mode detection, prompt assembly, artifact gathering

Remove unused imports: `discoverAllMetaPrompts`, `loadAllPresets`, `resolveOverlayState`, `buildGraph`, `computeEligible`, `loadConfig`.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run && make check`
Expected: All tests pass

- [ ] **Step 4: Commit**

---

### Task 8: Migrate complete.ts, skip.ts, reset.ts

**Files:**
- Modify: `src/cli/commands/complete.ts`
- Modify: `src/cli/commands/skip.ts`
- Modify: `src/cli/commands/reset.ts`

- [ ] **Step 1: Read all three files** to find where they import `buildComputeEligibleFn` from `../../utils/eligible.js`

- [ ] **Step 2: Migrate complete.ts**

Replace:
```typescript
import { buildComputeEligibleFn } from '../../utils/eligible.js'
// ...
const computeEligible = buildComputeEligibleFn(projectRoot)
const stateManager = new StateManager(projectRoot, computeEligible)
```

With:
```typescript
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
// ...
const context = loadPipelineContext(projectRoot)
const pipeline = resolvePipeline(context)  // output defaults to 'auto' internally
const stateManager = new StateManager(projectRoot, pipeline.computeEligible)
```

Note: These commands don't have an `output` variable in scope, so `resolvePipeline` uses its internal default (`createOutputContext('auto')`). This matches current `buildComputeEligibleFn` behavior which also creates its own output context.

- [ ] **Step 3: Migrate skip.ts** — same pattern as Step 2

- [ ] **Step 4: Migrate reset.ts** — same pattern as Step 2

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run && make check`
Expected: All tests pass

- [ ] **Step 6: Commit**

---

### Task 9: Delete dead code

**Files:**
- Delete: `src/utils/eligible.ts`
- Delete: `src/utils/eligible.test.ts` (if exists)
- Delete: `src/core/assembly/methodology-resolver.ts`
- Delete: `src/core/assembly/methodology-resolver.test.ts`

- [ ] **Step 1: Verify no remaining imports of eligible.ts**

Run: `grep -r "from.*eligible" src/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"`
Expected: Zero results (all commands migrated in Tasks 4-8)

- [ ] **Step 2: Verify no remaining imports of methodology-resolver.ts**

Run: `grep -r "from.*methodology-resolver" src/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"`
Expected: Zero results

- [ ] **Step 3: Delete the files**

```bash
git rm src/utils/eligible.ts
git rm src/utils/eligible.test.ts 2>/dev/null || true
git rm src/core/assembly/methodology-resolver.ts
git rm src/core/assembly/methodology-resolver.test.ts
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run && make check`
Expected: All tests pass (deleted test files no longer run)

- [ ] **Step 5: Commit**

---

### Task 10: Run full quality gates

**Files:** None (verification only)

- [ ] **Step 1: `npx tsc --noEmit`** — no type errors
- [ ] **Step 2: `npx vitest run`** — all tests pass
- [ ] **Step 3: `make check-all`** — all quality gates pass (bats + evals + vitest + lint)
