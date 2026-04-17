# Wave 3b Plan B: CLI Commands + Migration + E2E

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the --service flag into all 10 CLI commands, implement v2→v3 state migration, and verify with E2E tests.

**Architecture:** Each command gains `--service <name>` yargs option. Step-targeting commands use `guardStepCommand()`, step-less commands use `guardSteplessCommand()`. StatePathResolver routes state/lock/decision operations to the correct paths. Migration (v2→v3) splits root state into global + per-service files.

**Tech Stack:** TypeScript, vitest, yargs

**Spec:** `docs/superpowers/specs/2026-04-17-wave-3b-service-execution-design.md`

**Depends on:** Plan A completed (StatePathResolver, guard functions, resolver serviceId, eligibility scope, state-version-dispatch v3)

---

### Task 10: run.ts --service flag

**Files:**
- Modify: `src/cli/commands/run.ts` — add --service option, replace guard, thread StatePathResolver, scope artifact gathering

This is the most complex command change. The pattern established here applies to all subsequent commands.

- [ ] **Step 1: Add --service yargs option**

In the yargs builder (around line 22), add:
```typescript
service: { type: 'string', describe: 'Target service name (multi-service projects)' },
```

- [ ] **Step 2: Replace guard call**

Replace line 92 (`assertSingleServiceOrExit(...)`) with:
```typescript
const service = argv.service as string | undefined
guardStepCommand(step, config, service, pipeline.globalSteps, { commandName: 'run', output })
if (process.exitCode === 2) return
```

Note: This requires moving `resolvePipeline()` before the guard (currently at line 96). Reorder: load context → resolve pipeline → guard check → lock.

- [ ] **Step 3: Create StatePathResolver and pass to StateManager**

After the guard, create the resolver:
```typescript
const pathResolver = new StatePathResolver(projectRoot, service)
```

Update StateManager construction (line 146):
```typescript
const stateManager = new StateManager(
  projectRoot,
  pipeline.computeEligible,
  () => config,
  pathResolver,
)
```

- [ ] **Step 4: Thread pathResolver into lock acquisition**

Replace lock calls (lines 115, 547):
```typescript
const lockResult = acquireLock(projectRoot, 'run', step, pathResolver)
// ...
shutdown.registerLockOwnership(getLockPath(projectRoot, pathResolver))
// ...
releaseLock(projectRoot, pathResolver)
```

For per-service steps, also check global lock first:
```typescript
if (service) {
  const globalLockResult = checkLock(projectRoot)
  if (globalLockResult) {
    output.error('Global step in progress, retry after completion')
    process.exitCode = 3
    return
  }
}
```

- [ ] **Step 5: Scope artifact gathering**

In artifact gathering (lines 340-410), use `globalSteps` to determine path resolution:

```typescript
for (const dep of deps) {
  const depEntry = state.steps[dep]
  if (depEntry?.status === 'completed' && depEntry.produces) {
    for (const relPath of depEntry.produces) {
      // Global step artifacts at root, per-service at service prefix
      const effectiveRoot = pipeline.globalSteps.has(dep)
        ? projectRoot
        : (service ? path.join(projectRoot, 'services', service) : projectRoot)
      const fullPath = resolveContainedArtifactPath(effectiveRoot, relPath)
      // ...
    }
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/cli/commands/run.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "feat: scaffold run gains --service flag for per-service execution"
```

---

### Task 11: next.ts + status.ts --service flag

**Files:**
- Modify: `src/cli/commands/next.ts` — add --service, replace guard, scope state loading
- Modify: `src/cli/commands/status.ts` — add --service, replace guard, scope state loading

- [ ] **Step 1: Update next.ts**

Add `--service` yargs option. Replace `assertSingleServiceOrExit` (line 47) with `guardSteplessCommand`. Create `StatePathResolver`. Pass to `StateManager`. When `--service` provided, use scope filter in `computeEligible`:

```typescript
const eligible = pipeline.computeEligible(state.steps,
  service ? { scope: 'service', globalSteps: pipeline.globalSteps } : undefined,
)
```

When no `--service` on multi-service project, show global eligible + per-service summaries:
```typescript
if (config?.project?.services?.length && !service) {
  // Show global eligible
  const globalEligible = computeEligible(graph, state.steps, { scope: 'global', globalSteps: pipeline.globalSteps })
  // Show per-service summaries
  for (const svc of config.project.services) {
    // Load service state, compute eligible, display summary
  }
}
```

- [ ] **Step 2: Update status.ts**

Same pattern as next.ts. Replace guard, add `--service`, create `StatePathResolver`. When no `--service` on multi-service, show global status + per-service summary (e.g., "api: 12/45 completed").

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/cli/commands/next.test.ts src/cli/commands/status.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/next.ts src/cli/commands/status.ts
git commit -m "feat: next and status gain --service flag"
```

---

### Task 12: skip + complete + info --service flag

**Files:**
- Modify: `src/cli/commands/skip.ts` — add --service, replace guard, thread pathResolver
- Modify: `src/cli/commands/complete.ts` — same pattern
- Modify: `src/cli/commands/info.ts` — add --service, replace both guards (project info + step info)

- [ ] **Step 1: Update skip.ts**

Add `--service` yargs option. Replace `assertSingleServiceOrExit` (line 58) with `guardStepCommand`. Thread `StatePathResolver` into `StateManager`, `acquireLock`, `getLockPath`, `releaseLock`. Same pattern as run.ts but simpler (no artifact gathering).

- [ ] **Step 2: Update complete.ts**

Same pattern as skip.ts. Replace guard (line 44). Thread pathResolver.

- [ ] **Step 3: Update info.ts**

Replace both guards (lines 48 and 80) with `guardSteplessCommand`. Add `--service` option. When `--service` provided in step info mode, use service-scoped state.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/cli/commands/skip.test.ts src/cli/commands/complete.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/skip.ts src/cli/commands/complete.ts src/cli/commands/info.ts
git commit -m "feat: skip, complete, info gain --service flag"
```

---

### Task 13: dashboard + decisions --service flag

**Files:**
- Modify: `src/cli/commands/dashboard.ts` — add --service, replace guard, service-aware data loading
- Modify: `src/cli/commands/decisions.ts` — add --service, thread pathResolver to readDecisions

- [ ] **Step 1: Update dashboard.ts**

Replace guard (line 69) with `guardSteplessCommand`. Add `--service`. Create `StatePathResolver` and pass to `StateManager`. When `--service` provided, load service-scoped state. Update `readDecisions` call (line 93) to pass pathResolver:

```typescript
const pathResolver = new StatePathResolver(projectRoot, service)
const decisions = readDecisions(projectRoot, undefined, pathResolver)
```

- [ ] **Step 2: Update decisions.ts**

Add `--service` option. Thread pathResolver to `readDecisions` (line 40):

```typescript
const service = argv.service as string | undefined
const pathResolver = service ? new StatePathResolver(projectRoot, service) : undefined
const decisions = readDecisions(projectRoot, { step: argv.step, last: argv.last }, pathResolver)
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/dashboard.ts src/cli/commands/decisions.ts
git commit -m "feat: dashboard and decisions gain --service flag"
```

---

### Task 14: reset + rework --service flag

**Files:**
- Modify: `src/cli/commands/reset.ts` — add --service, dual-mode guard, per-service/full reset
- Modify: `src/cli/commands/rework.ts` — add --service, scope rework session

- [ ] **Step 1: Update reset.ts**

Add `--service` option. Replace guard (line 54).

For step reset (`argv.step`): use `guardStepCommand` with globalSteps.
For full reset (no `argv.step`): if `--service`, delete only that service's state/decisions/rework files. If no `--service` on multi-service, delete global + ALL service directories (with confirmation).

Update `resetPipeline` function (lines 195+) to handle service-scoped reset:

```typescript
if (service) {
  const serviceResolver = new StatePathResolver(projectRoot, service)
  // Delete service state.json, decisions.jsonl, rework.json
  for (const file of [serviceResolver.statePath, serviceResolver.decisionsPath, serviceResolver.reworkPath]) {
    if (fs.existsSync(file)) { fs.unlinkSync(file); filesDeleted.push(file) }
  }
} else if (hasServices) {
  // Delete global state + all service directories
  // ... delete .scaffold/state.json, .scaffold/decisions.jsonl
  // ... delete .scaffold/services/ directory entirely
}
```

- [ ] **Step 2: Update rework.ts**

Add `--service` option. Replace guard (line 201) with `guardSteplessCommand`. Pass `service` to `ReworkManager` constructor (line 92):

```typescript
const service = argv.service as string | undefined
const reworkManager = new ReworkManager(projectRoot as string, service)
```

The `--clear`, `--advance`, `--resume` branches automatically operate on the service-scoped rework.json because `ReworkManager` already uses `StatePathResolver` (from Task 5).

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/cli/commands/reset.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/reset.ts src/cli/commands/rework.ts
git commit -m "feat: reset and rework gain --service flag"
```

---

### Task 15: initializeState v3 for fresh init

**Files:**
- Modify: `src/state/state-manager.ts:170-206` — fresh init creates v3 layout when services[] present

- [ ] **Step 1: Write failing test**

Add to state-manager tests:

```typescript
it('initializes v3 layout with per-service state files when services[] present', () => {
  // ... create temp dir, call initializeState with services config
  // ... verify root state.json has only global steps and schema-version 3
  // ... verify .scaffold/services/api/state.json exists with per-service steps
})
```

- [ ] **Step 2: Update initializeState**

In `initializeState()`, after line 182 where `schema-version: 2` is currently set for services:

```typescript
if (hasServices && globalSteps) {
  // V3 fresh init: create root state with global steps only
  state['schema-version'] = 3
  // Filter steps: root gets only global steps
  const globalStepEntries: Record<string, StepStateEntry> = {}
  const serviceStepEntries: Record<string, StepStateEntry> = {}
  for (const [name, entry] of Object.entries(state.steps)) {
    if (globalSteps.has(name)) {
      globalStepEntries[name] = entry
    } else {
      serviceStepEntries[name] = entry
    }
  }
  state.steps = globalStepEntries

  // Create per-service state files
  for (const svc of options.config!.project!.services!) {
    const serviceResolver = new StatePathResolver(this.projectRoot, svc.name)
    serviceResolver.ensureDir()
    const serviceState = { ...state, steps: { ...serviceStepEntries }, 'schema-version': 3 as const }
    atomicWriteFile(serviceResolver.statePath, JSON.stringify(serviceState, null, 2))
  }
}
```

Note: `initializeState` needs `globalSteps: Set<string>` parameter. Add it as optional parameter with default empty set.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/state/state-manager.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/state/state-manager.ts src/state/state-manager.test.ts
git commit -m "feat: initializeState creates v3 layout for multi-service projects"
```

---

### Task 16: Lazy v2→v3 migration

**Files:**
- Create: `src/state/state-migration-v3.ts` — migration logic
- Create: `src/state/state-migration-v3.test.ts` — migration tests

- [ ] **Step 1: Write failing tests**

Create `src/state/state-migration-v3.test.ts` with tests for:
- Happy path: v2 root state splits into global + per-service
- in_progress non-null → rejects migration
- Idempotent: v3 root state → no-op
- Crash recovery: service state exists but root is v2 → re-runs
- Completed per-service steps duplicated across all services
- Global lock acquired during migration

- [ ] **Step 2: Implement migration**

Create `src/state/state-migration-v3.ts`:

```typescript
import fs from 'node:fs'
import type { PipelineState } from '../types/index.js'
import { StatePathResolver } from './state-path-resolver.js'
import { acquireLock, releaseLock } from './lock-manager.js'
import { atomicWriteFile } from '../utils/fs.js'

export interface MigrationV3Options {
  projectRoot: string
  globalSteps: Set<string>
  services: Array<{ name: string }>
}

export function migrateV2ToV3(options: MigrationV3Options): void {
  const { projectRoot, globalSteps, services } = options
  const rootResolver = new StatePathResolver(projectRoot)

  // Check if already v3
  const rootRaw = JSON.parse(fs.readFileSync(rootResolver.statePath, 'utf8')) as PipelineState
  if (rootRaw['schema-version'] === 3) return

  // Pre-check: reject if in_progress
  if (rootRaw.in_progress) {
    throw new Error(
      `Cannot migrate to per-service state while step '${rootRaw.in_progress.step}' is in progress. `
      + 'Complete or reset it first.',
    )
  }

  // Acquire global lock
  const lockResult = acquireLock(projectRoot, 'migration', 'v2-to-v3')
  if (!lockResult.acquired) {
    throw new Error('Cannot acquire global lock for v2→v3 migration. Another process may be running.')
  }

  try {
    // Split steps
    const globalStepEntries: Record<string, typeof rootRaw.steps[string]> = {}
    const serviceStepEntries: Record<string, typeof rootRaw.steps[string]> = {}

    for (const [name, entry] of Object.entries(rootRaw.steps)) {
      if (globalSteps.has(name)) {
        globalStepEntries[name] = entry
      } else {
        serviceStepEntries[name] = entry
      }
    }

    // Create service state files
    for (const svc of services) {
      const serviceResolver = new StatePathResolver(projectRoot, svc.name)
      serviceResolver.ensureDir()
      const serviceState: PipelineState = {
        ...rootRaw,
        'schema-version': 3 as 1 | 2 | 3,
        steps: { ...serviceStepEntries },
        in_progress: null,
        next_eligible: [],
      }
      atomicWriteFile(serviceResolver.statePath, JSON.stringify(serviceState, null, 2))
    }

    // Update root state (last — crash recovery can re-run if this fails)
    const updatedRoot: PipelineState = {
      ...rootRaw,
      'schema-version': 3 as 1 | 2 | 3,
      steps: globalStepEntries,
      in_progress: null,
      next_eligible: [],
    }
    atomicWriteFile(rootResolver.statePath, JSON.stringify(updatedRoot, null, 2))
  } finally {
    releaseLock(projectRoot)
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/state/state-migration-v3.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/state/state-migration-v3.ts src/state/state-migration-v3.test.ts
git commit -m "feat: v2→v3 state migration with global lock and service sharding"
```

---

### Task 17: Wire migration into command flow

**Files:**
- Modify: `src/cli/commands/run.ts` — trigger migration before lock acquisition
- Modify: other commands as needed — same migration check

- [ ] **Step 1: Add migration trigger to run.ts**

After config loading and pipeline resolution, before lock acquisition:

```typescript
// Trigger v2→v3 migration if needed
if (config?.project?.services?.length) {
  const rootState = JSON.parse(fs.readFileSync(path.join(projectRoot, '.scaffold', 'state.json'), 'utf8'))
  if (rootState['schema-version'] === 2) {
    migrateV2ToV3({
      projectRoot,
      globalSteps: pipeline.globalSteps,
      services: config.project.services as Array<{ name: string }>,
    })
  }
}
```

- [ ] **Step 2: Add same trigger to next.ts, status.ts**

These commands also need to trigger migration because they show per-service summaries even without `--service`.

- [ ] **Step 3: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/run.ts src/cli/commands/next.ts src/cli/commands/status.ts
git commit -m "feat: wire v2→v3 migration into command flow"
```

---

### Task 18: E2E integration tests

**Files:**
- Create: `src/e2e/service-execution.test.ts`

- [ ] **Step 1: Create E2E test file**

Follow `src/e2e/game-pipeline.test.ts` pattern. Tests:

1. `--service enables per-service overlay resolution` — config with services[], resolve pipeline with serviceId=api (backend), verify backend overlay applied
2. `--service flag rejected when no services[] in config` — verify error
3. `global step rejects --service flag` — service-ownership-map + --service → error
4. `per-service step requires --service flag` — tech-stack without --service on multi-service → error
5. `globalSteps set contains overlay step-override keys` — verify Set contents match multi-service-overlay.yml

- [ ] **Step 2: Run E2E tests**

Run: `npx vitest run src/e2e/service-execution.test.ts --reporter=verbose`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/e2e/service-execution.test.ts
git commit -m "test: add service-qualified execution E2E tests"
```

---

### Task 19: Final validation + CHANGELOG

**Files:** Modify `CHANGELOG.md`, verify everything

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run make check-all**

Run: `make check-all`
Expected: All quality gates pass

- [ ] **Step 4: Update CHANGELOG.md**

Add under the `[Unreleased]` section:

```markdown
### Added
- **Service-qualified execution** — `scaffold run <step> --service <name>` enables per-service pipeline execution
  - `StatePathResolver` routes state/lock/decision files to `.scaffold/services/{name}/`
  - Per-service overlay resolution: each service gets its own overlay stack based on its `projectType`
  - Parallel-ready locking: service locks are independent; global lock blocks all service locks
  - `globalSteps` classification from `multi-service-overlay.yml` step-overrides
  - Scope-filtered eligibility with fan-in (global steps auto-satisfy per-service deps)
  - v2→v3 state migration splits root state into global + per-service files
- **`--service` flag on all stateful commands** — run, next, status, skip, complete, info, dashboard, decisions, reset, rework
- **Context-aware guard system** — replaces `assertSingleServiceOrExit` with per-step and per-command validation
- **5 new `ScaffoldUserError` subclasses** — `ServiceRequiredError`, `ServiceRejectedError`, `ServiceNotFoundError`, `ServiceFlagWithoutServicesError`, `MultiServiceOverlayMissingError`

### Changed
- **`PipelineState.schema-version`** widened to `1 | 2 | 3` — v3 marks service-sharded state layout
- **`StateManager`** accepts optional `StatePathResolver` for service-scoped state
- **`acquireLock`, `releaseLock`, `getLockPath`** accept optional `StatePathResolver`
- **`appendDecision`, `readDecisions`** accept optional `StatePathResolver`
- **`ReworkManager`** accepts optional service name
- **`computeEligible`** gains scope filtering (global/service) and fan-in for global steps
- **`resolvePipeline`** gains `serviceId` for per-service overlay resolution
- **`ResolvedPipeline`** gains `globalSteps: Set<string>`
- **`ShutdownManager`** tracks multiple lock paths for cleanup
```

- [ ] **Step 5: Commit changelog**

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG with Wave 3b service-qualified execution"
```
