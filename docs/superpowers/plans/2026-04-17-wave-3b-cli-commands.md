# Wave 3b Plan B: CLI Commands + Migration + E2E

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the --service flag into all 10 CLI commands, implement v2→v3 state migration, and verify with E2E tests.

**Architecture:** Each command gains `--service <name>` yargs option. Step-targeting commands use `guardStepCommand()`, step-less commands use `guardSteplessCommand()`. `resolvePipeline()` receives `serviceId` for per-service overlay resolution. `StateManager` receives `pathResolver` + `globalSteps` for merged state view. A shared migration helper triggers v2→v3 sharding on any multi-service command.

**Tech Stack:** TypeScript, vitest, yargs

**Spec:** `docs/superpowers/specs/2026-04-17-wave-3b-service-execution-design.md`

**Depends on:** Plan A completed (StatePathResolver, guard functions, resolver serviceId, eligibility scope, state-version-dispatch v3, merged state view)

**Key pattern for ALL command updates:**
```typescript
// 1. Add --service to yargs builder
service: { type: 'string', describe: 'Target service name (multi-service projects)' },

// 2. Extract service from argv
const service = argv.service as string | undefined

// 3. Trigger migration if needed (shared helper — from Task 16)
ensureV3Migration(projectRoot, config, pipeline.globalSteps)
// For commands without resolvePipeline: ensureV3Migration(projectRoot, config) — helper loads globalSteps itself

// 4. Pass serviceId to resolvePipeline
const pipeline = resolvePipeline(context, { output, serviceId: service })

// 5. Create service-scoped pathResolver
const pathResolver = new StatePathResolver(projectRoot, service)

// 6. Pass pathResolver + globalSteps to StateManager
const stateManager = new StateManager(projectRoot, pipeline.computeEligible, () => config, pathResolver, pipeline.globalSteps)

// 7. Thread pathResolver into lock/decision/shutdown calls
acquireLock(projectRoot, cmd, step, pathResolver)
shutdown.registerLockOwnership(getLockPath(projectRoot, pathResolver))
```

---

### Task 10a: run.ts — yargs option + guard + resolver + StateManager wiring

**Files:**
- Modify: `src/cli/commands/run.ts` — add --service, replace guard, pass serviceId to resolver, create StatePathResolver, wire StateManager with globalSteps

- [ ] **Step 1: Add --service yargs option** (in builder, ~line 22)

- [ ] **Step 2: Replace guard** (line 92)

Replace `assertSingleServiceOrExit(config, ...)` with:
```typescript
const service = argv.service as string | undefined
const pipeline = resolvePipeline(context, { output, serviceId: service })
guardStepCommand(step, config, service, pipeline.globalSteps, { commandName: 'run', output })
if (process.exitCode === 2) return
```
Note: `resolvePipeline` must move BEFORE the guard (currently after).

- [ ] **Step 3: Trigger migration** (after resolvePipeline, before guard)

```typescript
ensureV3Migration(projectRoot, config, pipeline.globalSteps)
```

- [ ] **Step 4: Create StatePathResolver and wire StateManager** (line 146)

```typescript
const pathResolver = new StatePathResolver(projectRoot, service)
const stateManager = new StateManager(
  projectRoot, pipeline.computeEligible, () => config, pathResolver, pipeline.globalSteps,
)
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/cli/commands/run.test.ts --reporter=verbose`

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "feat(run): add --service flag with guard, resolver, StateManager wiring"
```

---

### Task 10b: run.ts — lock threading + shutdown

**Files:**
- Modify: `src/cli/commands/run.ts` — thread pathResolver into lock/shutdown calls, add global lock precheck for service steps

- [ ] **Step 1: Thread pathResolver into lock acquisition** (line 115)

```typescript
// For service steps: check global lock first
if (service) {
  const globalLockCheck = checkLock(projectRoot)
  if (globalLockCheck) {
    output.error('Global step in progress, retry after completion')
    process.exitCode = 3
    return
  }
}
const lockResult = acquireLock(projectRoot, 'run', step, pathResolver)
```

- [ ] **Step 2: Thread pathResolver into shutdown** (line 547)

```typescript
shutdown.registerLockOwnership(getLockPath(projectRoot, pathResolver))
// ... in release:
releaseLock(projectRoot, pathResolver)
```

- [ ] **Step 3: Run tests + commit**

```bash
npx vitest run src/cli/commands/run.test.ts --reporter=verbose
git add src/cli/commands/run.ts
git commit -m "feat(run): thread pathResolver into lock acquisition and shutdown"
```

---

### Task 10c: run.ts — scope-aware artifact gathering + decisions + crash recovery

**Files:**
- Modify: `src/cli/commands/run.ts` — scope artifact loops, decisions, crash/update-mode with service

- [ ] **Step 1: Scope dependency artifact gathering** (lines 340-370)

Use `globalSteps` to determine effective root for each dep's artifacts:
```typescript
const isGlobalDep = pipeline.globalSteps.has(dep)
const effectiveRoot = isGlobalDep ? projectRoot : (service ? path.join(projectRoot, 'services', service) : projectRoot)
```

- [ ] **Step 2: Scope reads artifact gathering** (lines 373-410)

Same logic for reads loop.

- [ ] **Step 3: Scope decisions** (line 412)

```typescript
const pathResolverForDecisions = new StatePathResolver(projectRoot, service)
// ... use pathResolverForDecisions in appendDecision calls
```

- [ ] **Step 4: Scope crash recovery + update mode** (lines 155, 249)

Pass `service` to `detectCompletion()` and `detectUpdateMode()`.

- [ ] **Step 5: Run tests + commit**

```bash
npx vitest run src/cli/commands/run.test.ts --reporter=verbose
git add src/cli/commands/run.ts
git commit -m "feat(run): scope-aware artifact gathering, decisions, crash recovery"
```

---

### Task 11a: next.ts --service flag

**Files:**
- Modify: `src/cli/commands/next.ts`

- [ ] **Step 1: Add --service, replace guard, wire resolver + StateManager**

Follow the key pattern. Replace `assertSingleServiceOrExit` (line 47) with `guardSteplessCommand`. Pass `serviceId: service` to `resolvePipeline`. Create `StatePathResolver`. Wire `StateManager` with `pathResolver` + `globalSteps`.

- [ ] **Step 2: Scope eligibility computation**

```typescript
const eligible = pipeline.computeEligible(state.steps,
  service ? { scope: 'service', globalSteps: pipeline.globalSteps } : undefined,
)
```

When no `--service` on multi-service, show global eligible + per-service summaries.

- [ ] **Step 3: Run tests + commit**

```bash
npx vitest run src/cli/commands/next.test.ts --reporter=verbose
git add src/cli/commands/next.ts
git commit -m "feat(next): add --service flag with scoped eligibility"
```

---

### Task 11b: status.ts --service flag

**Files:**
- Modify: `src/cli/commands/status.ts`

Same pattern as next.ts. Replace guard (line 106). Wire resolver + StateManager. Show service-scoped or global+summary view.

- [ ] **Step 1-3: Apply pattern, test, commit**

```bash
git commit -m "feat(status): add --service flag with scoped display"
```

---

### Task 12a: skip.ts + complete.ts --service flag

**Files:**
- Modify: `src/cli/commands/skip.ts` — add --service, replace guard, wire pathResolver into lock/state
- Modify: `src/cli/commands/complete.ts` — same pattern

Both are step-targeting commands: use `guardStepCommand`. Thread `pathResolver` into `acquireLock`, `releaseLock`, `getLockPath`, `StateManager`.

- [ ] **Step 1-3: Apply pattern to both, test, commit**

```bash
git commit -m "feat(skip,complete): add --service flag"
```

---

### Task 12b: info.ts --service flag

**Files:**
- Modify: `src/cli/commands/info.ts` — replace both guards (lines 48 and 80), add --service

Info has two modes: project info (no step arg) uses `guardSteplessCommand`; step info uses `guardSteplessCommand` (it shows metadata, not state).

- [ ] **Step 1-2: Apply pattern, test, commit**

```bash
git commit -m "feat(info): add --service flag"
```

---

### Task 13a: decisions.ts --service flag

**Files:**
- Modify: `src/cli/commands/decisions.ts` — add --service, add guardSteplessCommand, thread pathResolver to readDecisions

- [ ] **Step 1: Add --service, add config load + guard**

Currently `decisions.ts` has NO guard. Add config load + `guardSteplessCommand` before `readDecisions`:
```typescript
const service = argv.service as string | undefined
if (service) {
  const { config } = loadConfig(projectRoot, [])
  guardSteplessCommand(config ?? {}, service, { commandName: 'decisions', output })
  if (process.exitCode === 2) return
}
const pathResolver = service ? new StatePathResolver(projectRoot, service) : undefined
const decisions = readDecisions(projectRoot, { step: argv.step, last: argv.last }, pathResolver)
```

- [ ] **Step 2: Test + commit**

```bash
git commit -m "feat(decisions): add --service flag with guard"
```

---

### Task 13b: dashboard.ts --service flag

**Files:**
- Modify: `src/cli/commands/dashboard.ts` — add --service, replace guard, wire pathResolver

- [ ] **Step 1: Add --service, replace guard, scope state + decisions**

Replace `assertSingleServiceOrExit` (line 69) with `guardSteplessCommand`. Create `StatePathResolver`. Wire `StateManager` and `readDecisions` with pathResolver.

Note: Full dashboard generator multi-service support (showing per-service state in the HTML) is complex and may require a follow-up task. For now, `--service` shows that service's dashboard view.

- [ ] **Step 2: Test + commit**

```bash
git commit -m "feat(dashboard): add --service flag"
```

---

### Task 14a: reset.ts --service flag

**Files:**
- Modify: `src/cli/commands/reset.ts`

- [ ] **Step 1: Add --service, update guard logic**

Replace `assertSingleServiceOrExit` (line 54).
- `reset <step> --service api` → `guardStepCommand`
- `reset --service api` → delete service state/decisions/rework files
- `reset` (full, no --service, multi-service) → delete global + all service directories + confirmation

- [ ] **Step 2: Update resetPipeline for service-aware deletion** (lines 195+)

```typescript
if (service) {
  const serviceResolver = new StatePathResolver(projectRoot, service)
  for (const file of [serviceResolver.statePath, serviceResolver.decisionsPath, serviceResolver.reworkPath]) {
    if (fs.existsSync(file)) { fs.unlinkSync(file); filesDeleted.push(file) }
  }
} else if (config?.project?.services?.length) {
  // Delete global state + all service directories
  // ... existing root deletion + rm -rf .scaffold/services/
}
```

- [ ] **Step 3: Test + commit**

```bash
git commit -m "feat(reset): add --service flag with per-service and full reset"
```

---

### Task 14b: rework.ts --service flag

**Files:**
- Modify: `src/cli/commands/rework.ts`

- [ ] **Step 1: Add --service, scope ReworkManager**

```typescript
const service = argv.service as string | undefined
const reworkManager = new ReworkManager(projectRoot as string, service)
```

Replace guard (line 201) with `guardSteplessCommand`. The `--clear`, `--advance`, `--resume` branches automatically use service-scoped rework.json via the updated ReworkManager (Plan A Task 5).

- [ ] **Step 2: Test + commit**

```bash
git commit -m "feat(rework): add --service flag"
```

---

### Task 15: v2→v3 migration implementation

**(Execute BEFORE Task 16 — Task 16 imports from this module.)**

**Files:**
- Create: `src/state/state-migration-v3.ts`
- Create: `src/state/state-migration-v3.test.ts`

- [ ] **Step 1: Write tests** — happy path, in_progress rejection, idempotent, crash recovery, completed step duplication, extra-steps stay in root, globalSteps-empty rejection

- [ ] **Step 2: Implement migrateV2ToV3**

Per spec: acquire global lock, reject if in_progress non-null, **reject if globalSteps is empty** (prevents mis-sharding), split steps by globalSteps set, create service state files (duplicate completed per-service steps to ALL services), update root state (global steps only, extra-steps preserved), release lock.

```typescript
export function migrateV2ToV3(options: MigrationV3Options): void {
  const { projectRoot, globalSteps, services } = options
  if (globalSteps.size === 0) {
    throw new Error('Cannot migrate: globalSteps is empty. Structural overlay may be missing.')
  }
  // ... rest of migration logic
}
```

- [ ] **Step 3: Test + commit**

```bash
git commit -m "feat: v2→v3 state migration with global lock and service sharding"
```

---

### Task 16: Shared migration helper + loadGlobalStepSlugs

**Files:**
- Create: `src/state/ensure-v3-migration.ts`
- Create: `src/core/pipeline/global-steps.ts` — lightweight helper to get globalSteps without full resolvePipeline

- [ ] **Step 1: Create loadGlobalStepSlugs helper**

Create `src/core/pipeline/global-steps.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import { loadStructuralOverlay } from '../assembly/overlay-loader.js'

/**
 * Load the set of global step slugs from multi-service-overlay.yml.
 * Lightweight alternative to full resolvePipeline() for commands
 * that only need the global/per-service classification.
 */
export function loadGlobalStepSlugs(methodologyDir: string): Set<string> {
  const overlayPath = path.join(methodologyDir, 'multi-service-overlay.yml')
  if (!fs.existsSync(overlayPath)) return new Set()
  const { overlay } = loadStructuralOverlay(overlayPath)
  if (!overlay) return new Set()
  return new Set(Object.keys(overlay.stepOverrides))
}
```

- [ ] **Step 2: Create ensureV3Migration helper**

Create `src/state/ensure-v3-migration.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import type { ScaffoldConfig } from '../types/index.js'
import { migrateV2ToV3 } from './state-migration-v3.js'
import { loadGlobalStepSlugs } from '../core/pipeline/global-steps.js'
import { getPackageMethodologyDir } from '../utils/fs.js'

/**
 * Ensure state is at v3 for multi-service projects.
 * Called by all commands before state access.
 * No-op for single-service or already-v3 projects.
 * Computes globalSteps from overlay if not provided.
 */
export function ensureV3Migration(
  projectRoot: string,
  config: ScaffoldConfig | null,
  globalSteps?: Set<string>,
): void {
  if (!config?.project?.services?.length) return

  const statePath = path.join(projectRoot, '.scaffold', 'state.json')
  if (!fs.existsSync(statePath)) return

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  } catch { return }

  if (raw['schema-version'] !== 2) return

  // Compute globalSteps if not provided (for commands that skip resolvePipeline)
  const effectiveGlobalSteps = globalSteps ?? loadGlobalStepSlugs(getPackageMethodologyDir())

  migrateV2ToV3({
    projectRoot,
    globalSteps: effectiveGlobalSteps,
    services: config.project.services as Array<{ name: string }>,
  })
}
```

- [ ] **Step 3: Test + commit**

```bash
git add src/core/pipeline/global-steps.ts src/state/ensure-v3-migration.ts
git commit -m "feat: shared ensureV3Migration helper with loadGlobalStepSlugs"
```

---

**Migration wiring**: Instead of a separate Task 17 (which would touch all 10 files), migration calls are folded INTO each command task above. Each command task (10a-14b) should include `ensureV3Migration(projectRoot, config, pipeline.globalSteps)` after config+pipeline resolution and before state access. For commands that already call `resolvePipeline()`, pass `pipeline.globalSteps`. For commands that don't (like `decisions.ts`), call `ensureV3Migration(projectRoot, config)` — the helper loads globalSteps itself via `loadGlobalStepSlugs()`.

---

### Task 18: E2E integration tests

**Files:**
- Create: `src/e2e/service-execution.test.ts`

Follow `src/e2e/game-pipeline.test.ts` pattern. Tests:

1. `--service enables per-service overlay resolution` — config with services[], resolve pipeline with serviceId=api, verify backend overlay applied
2. `--service flag rejected when no services[]` — verify error
3. `global step rejects --service` — service-ownership-map + --service → error
4. `per-service step requires --service` — tech-stack without --service on multi-service → error
5. `globalSteps set contains overlay step-override keys` — verify Set contents

- [ ] **Step 1: Create tests, run, commit**

```bash
git commit -m "test: add service-qualified execution E2E tests"
```

---

### Task 19: Final validation + CHANGELOG

**Files:** Modify `CHANGELOG.md`

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose`

- [ ] **Step 2: Run tsc + make check-all**

Run: `npx tsc --noEmit && make check-all`

- [ ] **Step 3: Update CHANGELOG.md**

Add under `[Unreleased]`:

```markdown
### Added
- **Service-qualified execution** — `scaffold run <step> --service <name>`
  - Per-service overlay resolution, state sharding, parallel-ready locking
  - `--service` flag on all stateful commands (run, next, status, skip, complete, info, dashboard, decisions, reset, rework)
  - v2→v3 state migration for existing multi-service projects
  - Context-aware guard system replacing `assertSingleServiceOrExit`
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG with Wave 3b service-qualified execution"
```

---

## Review History

**Round 1 (Codex + Gemini)**: 3 P0s, 2 P1s, 1 P2 — all fixed:
- P0: Commands missing serviceId to resolvePipeline and globalSteps to StateManager → added to key pattern, all tasks updated
- P0: Migration only wired into 3 commands → created shared ensureV3Migration helper (Task 15) + wire all 10 commands (Task 17)
- P0: Task 10 oversized (90-140 LOC) → split into 10a (guard/resolver/state), 10b (locking), 10c (artifacts/decisions/crash)
- P1: Dashboard generator needs multi-service work → noted as follow-up, basic --service support in Task 13b
- P1: Multiple tasks exceeded size limits → split all: 11a/11b, 12a/12b, 13a/13b, 14a/14b
- P2: Fresh init caller (adopt.ts) not updated → labeled as library groundwork

**Round 2 (Codex + Gemini)**: 1 P0, 5 P1, 1 P2 — all fixed:
- P0: Empty globalSteps in migration corrupts state → migrateV2ToV3 rejects empty set; ensureV3Migration computes globalSteps itself via loadGlobalStepSlugs when not provided
- P1: Task 15 imports Task 16 (forward ref) → swapped: migration impl (Task 15) before helper (Task 16)
- P1: Task 17 touches 10 files → deleted; migration calls folded into each command task
- P1: Fresh-init callers not updated → noted as library groundwork (callers update in Plan B addendum if needed)
- P1: Dashboard generator needs multi-service work → noted as follow-up
- P1: Crash recovery analyzeCrash not scoped → noted for Task 10c implementer
- P2: guardSteplessCommand doesn't check overlay → covered by ensureV3Migration rejecting empty globalSteps
