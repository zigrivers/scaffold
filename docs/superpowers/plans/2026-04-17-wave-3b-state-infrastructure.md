# Wave 3b Plan A: State Infrastructure + Pipeline Resolution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the state sharding infrastructure, pipeline resolution per-service, and guard logic that Wave 3b CLI commands depend on.

**Architecture:** `StatePathResolver` centralizes path construction for global vs service-scoped state files. `StateManager` gains a merged view (global + service state) for service-scoped execution. `resolvePipeline()` gains `serviceId` for per-service overlay resolution. `computeEligible()` gains scope filtering. The guard system is replaced with context-aware logic.

**Tech Stack:** TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-04-17-wave-3b-service-execution-design.md`

**Depends on:** Wave 2 (PR #279 merged) — structural overlay, `PipelineOverlay` type, `loadStructuralOverlay()`, `multi-service-overlay.yml`

**Plan B:** `docs/superpowers/plans/2026-04-17-wave-3b-cli-commands.md` (CLI wiring, migration, E2E)

---

### Task 1: StatePathResolver class + tests

**Files:**
- Create: `src/state/state-path-resolver.ts`
- Create: `src/state/state-path-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/state/state-path-resolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { StatePathResolver } from './state-path-resolver.js'

describe('StatePathResolver', () => {
  const root = '/fake/project'

  describe('root-scoped (no service)', () => {
    const resolver = new StatePathResolver(root)

    it('scaffoldDir is .scaffold/', () => {
      expect(resolver.scaffoldDir).toBe(path.join(root, '.scaffold'))
    })

    it('statePath is .scaffold/state.json', () => {
      expect(resolver.statePath).toBe(path.join(root, '.scaffold', 'state.json'))
    })

    it('lockPath is .scaffold/lock.json', () => {
      expect(resolver.lockPath).toBe(path.join(root, '.scaffold', 'lock.json'))
    })

    it('decisionsPath is .scaffold/decisions.jsonl', () => {
      expect(resolver.decisionsPath).toBe(path.join(root, '.scaffold', 'decisions.jsonl'))
    })

    it('reworkPath is .scaffold/rework.json', () => {
      expect(resolver.reworkPath).toBe(path.join(root, '.scaffold', 'rework.json'))
    })

    it('rootScaffoldDir equals scaffoldDir for root-scoped', () => {
      expect(resolver.rootScaffoldDir).toBe(resolver.scaffoldDir)
    })
  })

  describe('service-scoped', () => {
    const resolver = new StatePathResolver(root, 'api')

    it('scaffoldDir is .scaffold/services/api/', () => {
      expect(resolver.scaffoldDir).toBe(path.join(root, '.scaffold', 'services', 'api'))
    })

    it('statePath is .scaffold/services/api/state.json', () => {
      expect(resolver.statePath).toBe(path.join(root, '.scaffold', 'services', 'api', 'state.json'))
    })

    it('lockPath is .scaffold/services/api/lock.json', () => {
      expect(resolver.lockPath).toBe(path.join(root, '.scaffold', 'services', 'api', 'lock.json'))
    })

    it('rootScaffoldDir is always .scaffold/ regardless of service', () => {
      expect(resolver.rootScaffoldDir).toBe(path.join(root, '.scaffold'))
    })
  })

  describe('ensureDir', () => {
    it('creates the scaffold directory recursively', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spr-test-'))
      const resolver = new StatePathResolver(tmpDir, 'my-service')
      resolver.ensureDir()
      expect(fs.existsSync(resolver.scaffoldDir)).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/state-path-resolver.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement StatePathResolver**

Create `src/state/state-path-resolver.ts`:

```typescript
import path from 'node:path'
import fs from 'node:fs'

/**
 * Resolves file paths for global or service-scoped scaffold state.
 * When `service` is undefined, paths resolve to `.scaffold/`.
 * When `service` is provided, paths resolve to `.scaffold/services/{name}/`.
 */
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

  get rootScaffoldDir(): string {
    return path.join(this.projectRoot, '.scaffold')
  }

  get statePath(): string { return path.join(this.scaffoldDir, 'state.json') }
  get lockPath(): string { return path.join(this.scaffoldDir, 'lock.json') }
  get decisionsPath(): string { return path.join(this.scaffoldDir, 'decisions.jsonl') }
  get reworkPath(): string { return path.join(this.scaffoldDir, 'rework.json') }

  /** Create the scaffold directory if it doesn't exist. */
  ensureDir(): void {
    fs.mkdirSync(this.scaffoldDir, { recursive: true })
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/state/state-path-resolver.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/state/state-path-resolver.ts src/state/state-path-resolver.test.ts
git commit -m "feat: add StatePathResolver for global and service-scoped state paths"
```

---

### Task 2: Type widening + new error classes

**Files:**
- Modify: `src/types/state.ts:42` — widen schema-version to `1 | 2 | 3`
- Modify: `src/utils/user-errors.ts` — add 4 new error classes
- Modify: `src/utils/user-errors.test.ts` — add tests for new classes

- [ ] **Step 1: Widen schema-version**

In `src/types/state.ts`, change line 42:
```typescript
  'schema-version': 1 | 2 | 3
```

- [ ] **Step 2: Add new error classes**

Append to `src/utils/user-errors.ts` (before the `isScaffoldUserError` function):

```typescript
export class ServiceRequiredError extends ScaffoldUserError {
  constructor(stepName: string) {
    super(`Step '${stepName}' requires --service flag when services[] is configured.`)
  }
}

export class ServiceRejectedError extends ScaffoldUserError {
  constructor(stepName: string) {
    super(`Step '${stepName}' is a global cross-service step and does not accept --service.`)
  }
}

export class ServiceNotFoundError extends ScaffoldUserError {
  constructor(serviceName: string) {
    super(`Service '${serviceName}' not found in services[].`)
  }
}

export class ServiceFlagWithoutServicesError extends ScaffoldUserError {
  constructor() {
    super('--service requires services[] in config.')
  }
}

export class MultiServiceOverlayMissingError extends ScaffoldUserError {
  constructor() {
    super('Multi-service projects require multi-service-overlay.yml.')
  }
}
```

- [ ] **Step 3: Add tests for new error classes**

Append to `src/utils/user-errors.test.ts`:

```typescript
  it('ServiceRequiredError', () => {
    const err = new ServiceRequiredError('tech-stack')
    expect(err).toBeInstanceOf(ScaffoldUserError)
    expect(err.message).toContain('tech-stack')
    expect(err.message).toContain('--service')
  })

  it('ServiceNotFoundError', () => {
    const err = new ServiceNotFoundError('nonexistent')
    expect(err).toBeInstanceOf(ScaffoldUserError)
    expect(err.message).toContain('nonexistent')
  })

  it('MultiServiceOverlayMissingError', () => {
    const err = new MultiServiceOverlayMissingError()
    expect(err).toBeInstanceOf(ScaffoldUserError)
    expect(err.message).toContain('multi-service-overlay.yml')
  })
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/utils/user-errors.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 5: Run TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/types/state.ts src/utils/user-errors.ts src/utils/user-errors.test.ts
git commit -m "feat: widen schema-version to 1|2|3, add service validation error classes"
```

---

### Task 3: state-version-dispatch accepts v3

**Files:**
- Modify: `src/state/state-version-dispatch.ts:21-35`
- Modify: `src/state/state-version-dispatch.test.ts` — add v3 tests

- [ ] **Step 1: Write failing test for v3 acceptance**

Append to `src/state/state-version-dispatch.test.ts`:

```typescript
  it('accepts schema-version 3 without modification', () => {
    const raw = { 'schema-version': 3, steps: {} }
    dispatchStateMigration(raw, { hasServices: true }, '/test/state.json')
    expect(raw['schema-version']).toBe(3)
  })

  it('accepts schema-version 3 even without services', () => {
    const raw = { 'schema-version': 3, steps: {} }
    dispatchStateMigration(raw, { hasServices: false }, '/test/state.json')
    expect(raw['schema-version']).toBe(3)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/state-version-dispatch.test.ts --reporter=verbose`
Expected: FAIL — version 3 rejected

- [ ] **Step 3: Update dispatch to accept v3**

In `src/state/state-version-dispatch.ts`:

Replace lines 25-35:
```typescript
export function dispatchStateMigration(
  raw: unknown,
  ctx: MigrationContext,
  file: string,
): asserts raw is Record<string, unknown> & { 'schema-version': 1 | 2 | 3 } {
  if (!isPlainObject(raw) || typeof raw['schema-version'] !== 'number') {
    throw stateSchemaVersion([1, 2, 3], Number(raw && (raw as Record<string, unknown>)['schema-version']), file)
  }
  const version = raw['schema-version']
  if (version !== 1 && version !== 2 && version !== 3) {
    throw stateSchemaVersion([1, 2, 3], version, file)
  }
  if (version === 1 && ctx.hasServices) {
    raw['schema-version'] = 2
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/state/state-version-dispatch.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/state/state-version-dispatch.ts src/state/state-version-dispatch.test.ts
git commit -m "feat: state-version-dispatch accepts schema-version 3"
```

---

### Task 4: lock-manager + decision-logger gain pathResolver parameter

**Files:**
- Modify: `src/state/lock-manager.ts:12,75,123` — add `pathResolver?` param to `getLockPath`, `acquireLock`, `releaseLock`
- Modify: `src/state/decision-logger.ts:10,64,86` — add `pathResolver?` param to `decisionsPath`, `appendDecision`, `readDecisions`

- [ ] **Step 1: Update lock-manager.ts**

For each exported function, add `pathResolver?: StatePathResolver` as last parameter and use `pathResolver?.lockPath ?? path.join(projectRoot, '.scaffold', 'lock.json')` for the lock path.

Import at top of `src/state/lock-manager.ts`:
```typescript
import type { StatePathResolver } from './state-path-resolver.js'
```

Update `getLockPath` (line 12):
```typescript
export function getLockPath(projectRoot: string, pathResolver?: StatePathResolver): string {
  return pathResolver?.lockPath ?? path.join(projectRoot, '.scaffold', 'lock.json')
}
```

Update `acquireLock` (line 75) — add `pathResolver?: StatePathResolver` as 4th parameter. Replace internal `getLockPath(projectRoot)` calls with `getLockPath(projectRoot, pathResolver)`.

Update `releaseLock` (line 123) — add `pathResolver?: StatePathResolver` as 2nd parameter. Use `getLockPath(projectRoot, pathResolver)` for path.

- [ ] **Step 2: Update decision-logger.ts**

Import at top:
```typescript
import type { StatePathResolver } from './state-path-resolver.js'
```

Update `decisionsPath` helper (line 10):
```typescript
function decisionsPath(projectRoot: string, pathResolver?: StatePathResolver): string {
  return pathResolver?.decisionsPath ?? path.join(projectRoot, '.scaffold', 'decisions.jsonl')
}
```

Update `appendDecision` (line 64) — add `pathResolver?: StatePathResolver` as 3rd parameter. Pass through to `decisionsPath`.

Update `readDecisions` (line 86) — add `pathResolver?: StatePathResolver` as 3rd parameter. Pass through to `decisionsPath`.

- [ ] **Step 3: Verify no regressions** (existing callers pass no pathResolver → defaults work)

Run: `npx vitest run src/state/ --reporter=verbose`
Expected: All pass

- [ ] **Step 4: Run TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/state/lock-manager.ts src/state/decision-logger.ts
git commit -m "feat: lock-manager and decision-logger gain pathResolver parameter"
```

---

### Task 5: shutdown.ts multi-lock + ReworkManager service support

**Files:**
- Modify: `src/cli/shutdown.ts:143-150` — track `lockPaths: string[]` array instead of single `lockPath`
- Modify: `src/state/rework-manager.ts:6-11` — accept optional `StatePathResolver`

- [ ] **Step 1: Update shutdown.ts**

Replace single `lockPath`/`lockOwned` fields with array tracking:

```typescript
// Fields (replace lockPath/lockOwned):
private lockPaths: string[] = []

registerLockOwnership(lockFilePath: string): void {
  if (!this.lockPaths.includes(lockFilePath)) {
    this.lockPaths.push(lockFilePath)
  }
}

releaseLockOwnership(lockFilePath?: string): void {
  if (lockFilePath) {
    this.lockPaths = this.lockPaths.filter(p => p !== lockFilePath)
  } else {
    this.lockPaths = []
  }
}
```

Update exit handler (line 110-112):
```typescript
for (const lp of this.lockPaths) {
  try { fs.unlinkSync(lp) } catch { /* ok */ }
}
```

- [ ] **Step 2: Update ReworkManager constructor**

In `src/state/rework-manager.ts`, add pathResolver support:

```typescript
import { StatePathResolver } from './state-path-resolver.js'

export class ReworkManager {
  private reworkPath: string

  constructor(projectRoot: string, service?: string) {
    const resolver = new StatePathResolver(projectRoot, service)
    this.reworkPath = resolver.reworkPath
  }
```

- [ ] **Step 3: Verify no regressions**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All pass (existing callers pass no service → default paths)

- [ ] **Step 4: Commit**

```bash
git add src/cli/shutdown.ts src/state/rework-manager.ts
git commit -m "feat: shutdown tracks multiple locks, ReworkManager accepts service"
```

---

### Task 6: StateManager accepts StatePathResolver

**Files:**
- Modify: `src/state/state-manager.ts:11-20` — constructor accepts StatePathResolver
- Modify: `src/state/state-manager.test.ts` — update constructor calls

- [ ] **Step 1: Update StateManager constructor**

In `src/state/state-manager.ts`:

Add import:
```typescript
import { StatePathResolver } from './state-path-resolver.js'
```

Update constructor (lines 11-20):
```typescript
export class StateManager {
  private statePath: string
  private pathResolver: StatePathResolver

  constructor(
    private projectRoot: string,
    private computeEligible: (steps: Record<string, StepStateEntry>) => string[],
    private configProvider?: () => { project?: { services?: unknown[] } } | undefined,
    pathResolver?: StatePathResolver,
  ) {
    this.pathResolver = pathResolver ?? new StatePathResolver(projectRoot)
    this.statePath = this.pathResolver.statePath
  }
```

- [ ] **Step 2: Update ensureDir calls in initializeState**

In `initializeState()` (around line 179), replace:
```typescript
fs.mkdirSync(path.join(this.projectRoot, '.scaffold'), { recursive: true })
```
with:
```typescript
this.pathResolver.ensureDir()
```

- [ ] **Step 3: Verify no regressions**

Run: `npx vitest run src/state/state-manager.test.ts --reporter=verbose`
Expected: All pass (default pathResolver = root paths = same as before)

- [ ] **Step 4: Commit**

```bash
git add src/state/state-manager.ts
git commit -m "feat: StateManager accepts optional StatePathResolver"
```

---

### Task 7: ResolvedPipeline gains globalSteps + resolver gains serviceId

**Files:**
- Modify: `src/core/pipeline/types.ts:24-30` — add `globalSteps` to ResolvedPipeline
- Modify: `src/core/pipeline/resolver.ts:13-75` — add serviceId, build synthetic config, compute globalSteps

- [ ] **Step 1: Add globalSteps to ResolvedPipeline**

In `src/core/pipeline/types.ts`, add after line 29:
```typescript
  globalSteps: Set<string>
```

- [ ] **Step 2: Update resolvePipeline**

In `src/core/pipeline/resolver.ts`:

Add imports:
```typescript
import { configKeyFor } from '../../config/validators/index.js'
import type { ServiceConfig } from '../../types/config.js'
```

Update signature (line 13-16):
```typescript
export function resolvePipeline(
  context: PipelineContext,
  options?: { output?: OutputContext; serviceId?: string },
): ResolvedPipeline {
```

After line 17, add service-aware config building:
```typescript
  const serviceId = options?.serviceId
  let effectiveConfig = config

  if (serviceId && config?.project?.services?.length) {
    const service = config.project.services.find(
      (s: ServiceConfig) => s.name === serviceId,
    )
    if (service) {
      const typeConfigKey = configKeyFor(service.projectType)
      effectiveConfig = {
        ...config,
        project: {
          ...config.project,
          projectType: service.projectType,
          // Clear all per-type configs, set only the service's
          backendConfig: undefined,
          webAppConfig: undefined,
          cliConfig: undefined,
          libraryConfig: undefined,
          mobileAppConfig: undefined,
          dataPipelineConfig: undefined,
          mlConfig: undefined,
          browserExtensionConfig: undefined,
          gameConfig: undefined,
          researchConfig: undefined,
          [typeConfigKey]: (service as Record<string, unknown>)[typeConfigKey],
        },
      }
    }
  }
```

Replace `config` with `effectiveConfig` in the overlay resolution call (line 45).

After overlay resolution, compute globalSteps:
```typescript
  // Compute global steps from structural overlay step-overrides
  const globalSteps = new Set<string>()
  if (effectiveConfig?.project?.services?.length && overlay.steps) {
    // Steps enabled by the structural overlay are global
    // The structural overlay stepOverrides keys are the global step identifiers
    const msOverlayPath = path.join(methodologyDir, 'multi-service-overlay.yml')
    if (fs.existsSync(msOverlayPath)) {
      const { overlay: msOverlay } = loadStructuralOverlay(msOverlayPath)
      if (msOverlay) {
        for (const step of Object.keys(msOverlay.stepOverrides)) {
          globalSteps.add(step)
        }
      }
    }
  }
```

Add imports for `path`, `fs`, `loadStructuralOverlay`.

Update return (line 75):
```typescript
  return { graph, preset: resolvedPreset, overlay, stepMeta, computeEligible: computeEligibleFn, globalSteps }
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/core/pipeline/ --reporter=verbose`
Expected: All pass

- [ ] **Step 4: Run TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline/types.ts src/core/pipeline/resolver.ts
git commit -m "feat: ResolvedPipeline gains globalSteps, resolvePipeline gains serviceId"
```

---

### Task 8: computeEligible gains scope filtering + fan-in

**Files:**
- Modify: `src/core/dependency/eligibility.ts:11-43` — add scope/globalSteps options
- Modify: existing eligibility tests — add scope filtering tests

- [ ] **Step 1: Write failing tests**

Add to eligibility test file:

```typescript
  it('filters to service scope when scope=service', () => {
    const globalSteps = new Set(['create-vision', 'service-ownership-map'])
    // ... build graph with both global and service steps
    // ... set all deps as satisfied
    const result = computeEligible(graph, steps, { scope: 'service', globalSteps })
    expect(result).not.toContain('create-vision')
    expect(result).not.toContain('service-ownership-map')
  })

  it('filters to global scope when scope=global', () => {
    const globalSteps = new Set(['create-vision'])
    const result = computeEligible(graph, steps, { scope: 'global', globalSteps })
    expect(result).toContain('create-vision')
    expect(result).not.toContain('tech-stack')
  })

  it('auto-satisfies per-service deps in global scope (fan-in)', () => {
    // Global step depends on per-service step
    // In global scope, per-service deps should be auto-satisfied
    const globalSteps = new Set(['service-ownership-map'])
    const result = computeEligible(graph, steps, { scope: 'global', globalSteps })
    expect(result).toContain('service-ownership-map')
  })
```

- [ ] **Step 2: Implement scope filtering**

In `src/core/dependency/eligibility.ts`, update `computeEligible`:

```typescript
export function computeEligible(
  graph: DependencyGraph,
  steps: Record<string, StepStateEntry>,
  options?: {
    scope?: 'global' | 'service'
    globalSteps?: Set<string>
  },
): string[] {
  const { scope, globalSteps } = options ?? {}
  const eligible: string[] = []

  for (const [slug, node] of graph.nodes) {
    if (!node.enabled) continue

    // Scope filtering
    if (scope && globalSteps) {
      const isGlobal = globalSteps.has(slug)
      if (scope === 'service' && isGlobal) continue
      if (scope === 'global' && !isGlobal) continue
    }

    const status = steps[slug]?.status
    if (status !== 'pending' && status !== undefined) continue

    const depsOk = node.dependencies.every(dep => {
      const depNode = graph.nodes.get(dep)
      if (depNode && !depNode.enabled) return true
      // Fan-in: in global scope, per-service deps are auto-satisfied
      if (scope === 'global' && globalSteps && !globalSteps.has(dep)) return true
      const depStatus = steps[dep]?.status
      return depStatus === 'completed' || depStatus === 'skipped'
    })

    if (depsOk) eligible.push(slug)
  }

  return eligible.sort((a, b) => {
    const nodeA = graph.nodes.get(a)!
    const nodeB = graph.nodes.get(b)!
    return (nodeA.order ?? 9999) - (nodeB.order ?? 9999) || a.localeCompare(b)
  })
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/core/dependency/ --reporter=verbose`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/core/dependency/eligibility.ts
git commit -m "feat: computeEligible gains scope filtering and fan-in for global steps"
```

---

### Task 9: Guard replacement

**Files:**
- Modify: `src/cli/guards.ts` — replace `assertSingleServiceOrExit` with context-aware guards
- Modify: `src/cli/guards.test.ts` — update tests

- [ ] **Step 1: Write failing tests for new guards**

Replace guard tests with tests for:
- `guardStepCommand(step, config, service, globalSteps, ctx)` — per-service step needs --service, global step rejects --service, no services[] rejects --service, validates service name
- `guardSteplessCommand(config, service, ctx)` — services[] + no service OK, no services[] + service rejects

- [ ] **Step 2: Implement new guard functions**

Replace `src/cli/guards.ts` content:

```typescript
import {
  ServiceRequiredError, ServiceRejectedError,
  ServiceNotFoundError, ServiceFlagWithoutServicesError,
  MultiServiceOverlayMissingError,
} from '../utils/user-errors.js'
import type { ScaffoldConfig } from '../types/index.js'
import type { OutputContext } from './output/context.js'

export interface GuardContext {
  commandName: string
  output: Pick<OutputContext, 'error' | 'result' | 'warn'>
}

/** Guard for step-targeting commands (run, skip, complete). */
export function guardStepCommand(
  step: string,
  config: Partial<ScaffoldConfig>,
  service: string | undefined,
  globalSteps: Set<string>,
  ctx: GuardContext,
): void {
  const services = config?.project?.services
  const hasServices = services && services.length > 0

  if (service && !hasServices) {
    const err = new ServiceFlagWithoutServicesError()
    ctx.output.error(err.message)
    process.exitCode = 2
    return
  }

  if (hasServices && !globalSteps.has(step) && !service) {
    const err = new ServiceRequiredError(step)
    ctx.output.error(err.message)
    process.exitCode = 2
    return
  }

  if (hasServices && globalSteps.has(step) && service) {
    const err = new ServiceRejectedError(step)
    ctx.output.error(err.message)
    process.exitCode = 2
    return
  }

  if (service && hasServices) {
    const found = services!.some((s: { name: string }) => s.name === service)
    if (!found) {
      const err = new ServiceNotFoundError(service)
      ctx.output.error(err.message)
      process.exitCode = 2
      return
    }
  }
}

/** Guard for step-less commands (next, status, dashboard, info, decisions). */
export function guardSteplessCommand(
  config: Partial<ScaffoldConfig>,
  service: string | undefined,
  ctx: GuardContext,
): void {
  if (service) {
    const services = config?.project?.services
    if (!services || services.length === 0) {
      const err = new ServiceFlagWithoutServicesError()
      ctx.output.error(err.message)
      process.exitCode = 2
      return
    }
    const found = services.some((s: { name: string }) => s.name === service)
    if (!found) {
      const err = new ServiceNotFoundError(service)
      ctx.output.error(err.message)
      process.exitCode = 2
      return
    }
  }
}

// Backward compat — keep old function as deprecated alias during transition
/** @deprecated Use guardStepCommand or guardSteplessCommand */
export function assertSingleServiceOrExit(
  config: Partial<ScaffoldConfig>,
  ctx: GuardContext,
): void {
  const services = config?.project?.services
  if (services && services.length > 0) {
    ctx.output.error(
      'Multi-service projects are not yet executable. '
      + `"scaffold ${ctx.commandName}" on a config with services[] lands in Wave 3b.`,
    )
    process.exitCode = 2
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/cli/guards.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 4: Run full test suite for regressions**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All pass (old function preserved as deprecated alias)

- [ ] **Step 5: Commit**

```bash
git add src/cli/guards.ts src/cli/guards.test.ts
git commit -m "feat: replace assertSingleServiceOrExit with context-aware guard functions"
```

---

### Task 9b: validation/state-validator.ts accepts v3

**Files:**
- Modify: `src/validation/state-validator.ts` — update comment and schema-version acceptance

- [ ] **Step 1: Update validator**

In `src/validation/state-validator.ts`:
- Update line 15 comment from "1 or 2" to "1, 2, or 3"
- The actual validation delegates to `dispatchStateMigration` which was updated in Task 3

- [ ] **Step 2: Run validation tests**

Run: `npx vitest run src/validation/ --reporter=verbose`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/validation/state-validator.ts
git commit -m "fix: state-validator accepts schema-version 3"
```
