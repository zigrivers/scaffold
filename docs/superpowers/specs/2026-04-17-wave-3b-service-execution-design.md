# Wave 3b: Service-Qualified Execution Design

**Goal**: Enable `scaffold run <step> --service <name>` so each service gets its own pipeline execution context, state, locks, and overlay stack.

**Prerequisites**: Wave 3a (services[] in config, state dispatch), Wave 2 (structural overlay, cross-service steps)

**Scope**: ~300-400 lines production code across ~15 files + ~200-300 lines test code. Most complex wave due to breadth (4 state modules, 9 CLI commands, locking model, overlay resolution).

---

## Section 1: StatePathResolver + State Bootstrap

### 1.1 StatePathResolver

New class at `src/state/state-path-resolver.ts`:

```typescript
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

  get statePath(): string { return path.join(this.scaffoldDir, 'state.json') }
  get lockPath(): string { return path.join(this.scaffoldDir, 'lock.json') }
  get decisionsPath(): string { return path.join(this.scaffoldDir, 'decisions.jsonl') }
  get reworkPath(): string { return path.join(this.scaffoldDir, 'rework.json') }

  /** Create the scaffold directory if it doesn't exist. Called by writers before first write. */
  ensureDir(): void {
    fs.mkdirSync(this.scaffoldDir, { recursive: true })
  }
}
```

**Threading**: Injected into `StateManager` constructor (replaces hardcoded `statePath`). Passed as parameter to `acquireLock()`, `releaseLock()`, `appendDecision()` functions. Injected into `ReworkManager` constructor. Default (no service) = current paths = zero behavioral change for single-project workflows.

**Note**: `lock-manager.ts` and `decision-logger.ts` are function modules (not classes). They gain a `pathResolver?: StatePathResolver` parameter defaulting to root-scoped. No class refactoring needed.

### 1.2 State Bootstrap: v2 → v3 Migration

When `StateManager` loads state for a service and the service state file doesn't exist:

1. **Pre-check**: Acquire global lock (prevents concurrent migrations)
2. **Pre-check**: If any step in root state has `status: 'in_progress'`, reject migration with error: "Cannot migrate to per-service state while step '{name}' is in progress. Complete or reset it first."
3. **Read root state** (`.scaffold/state.json`, schema-version 2)
4. **Classify steps** using `globalSteps` set (from structural overlay `stepOverrides` keys)
5. **Create service state files** for each service in `config.project.services[]`:
   - Per-service steps get their status from the root state (preserving completed/skipped status)
   - If a per-service step was completed in root state, duplicate that completion into ALL service state files (preserves prior work)
   - Set `schema-version: 3`
6. **Update root state**: Remove per-service steps, retain only global steps. Set `schema-version: 3`
7. **Release global lock**

**Idempotent**: If root state already shows schema-version 3, skip migration.

**Crash recovery**: If service state file exists but root is still v2, re-run migration (atomic from root's perspective — service state files are written first, root state updated last).

**Schema version 3**: Marks the service-sharded layout. Both root state and service state files use v3. The state validator accepts `1 | 2 | 3`. Version 3 means "this file contains a subset of steps (either global-only or service-only)."

### 1.3 Guard Replacement

`assertSingleServiceOrExit` is replaced with context-aware guard logic.

**Step-targeting commands** (run, skip, complete, rework with step arg):
- `services[]` present + step is per-service → require `--service` flag. Error: "Step '{step}' requires --service flag when services[] is configured"
- `services[]` present + step is global → reject `--service` flag. Error: "Step '{step}' is a global cross-service step and does not accept --service"
- No `services[]` in config → reject `--service` flag. Error: "--service requires services[] in config"
- `--service` provided → validate name exists in `services[]`. Error: "Service '{name}' not found in services[]"

**Step-less commands** (next, status, dashboard, info):
- `services[]` + `--service` provided → show service-scoped state only
- `services[]` + no `--service` → show global state + one-line per-service summary (e.g., "api: 12/45 completed")
- No `services[]` → reject `--service`

**Reset** (dual-mode):
- `reset <step> --service api` → reset one step in service state
- `reset --service api` → reset that service's entire state file
- `reset` on multi-service (no `--service`) → reset global + all service state files (with confirmation prompt)

### 1.4 Global Step Classification

A step is "global" if it appears in `multi-service-overlay.yml` `step-overrides`. All other steps are per-service.

`ResolvedPipeline` gains:
```typescript
globalSteps: Set<string>  // from structural overlay stepOverrides keys
```

**Fail-fast**: When `services[].length > 0` and the structural overlay file is missing or invalid, `resolvePipeline()` throws a `ScaffoldUserError`: "Multi-service projects require multi-service-overlay.yml." This prevents silent reclassification of global steps as per-service.

### 1.5 Service-Aware Pipeline Resolution

`resolvePipeline()` gains an optional `serviceId` parameter. When provided:

1. Look up service entry from `config.project.services[]`
2. Build **synthetic config**:
   - Copy root config (`methodology`, `platforms`, `custom`, `services[]`)
   - Set `project.projectType` to the service's `projectType`
   - **Clear ALL per-type configs** from `project` (backendConfig, webAppConfig, etc. all set to `undefined`)
   - Set ONLY the matching per-type config: `project[configKeyFor(service.projectType)]` = service's config
   - This prevents coupling validator errors from stale root-level configs of other types
3. Pass synthetic config to `resolveOverlayState()`:
   - Project-type overlay loads based on service's type (e.g., `backend-overlay.yml`)
   - Domain sub-overlay loads if applicable (e.g., `backend-fintech.yml`)
   - Structural overlay activates (services[] still present in synthetic config)
4. Each service gets its own overlay stack — `--service api` (backend) and `--service web` (web-app) resolve different overlays

### 1.6 Eligibility Scope Filtering

`computeEligible()` gains optional parameters:

```typescript
export function computeEligible(
  graph: DependencyGraph,
  steps: Record<string, StepStateEntry>,
  options?: {
    scope?: 'global' | 'service'
    globalSteps?: Set<string>
  },
): string[]
```

- `scope='service'` + `globalSteps` → filter OUT global steps from results
- `scope='global'` + `globalSteps` → filter OUT per-service steps from results
- No scope (default) → return all eligible (backward compatible)

**Merged state view**: For service-scoped eligibility, the caller merges global state steps + service state steps before calling: `{ ...globalState.steps, ...serviceState.steps }`. This ensures per-service deps on global steps check the global state correctly.

---

## Section 2: CLI Changes + Locking Model

### 2.1 `--service` Flag

Every guarded command gains `--service <name>` (string, optional):

```typescript
service: { type: 'string', describe: 'Target service name (multi-service projects)' }
```

**Step-targeting commands** (run, skip, complete, rework): Execute step in service context.
**Step-less commands** (next, status, dashboard, info): Show service-scoped or global+summary view.
**Reset**: Per-service or full reset.

### 2.2 Locking Model (Parallel-Ready)

Two lock levels:

**Global lock** (`.scaffold/lock.json`):
- Acquired by global step execution
- Acquired during v2→v3 state migration
- When held: blocks all service lock acquisitions

**Service lock** (`.scaffold/services/{name}/lock.json`):
- Acquired by per-service step execution
- Before acquiring: check global lock is free
- Two different services CAN hold locks simultaneously → parallel execution

**Acquisition for per-service steps:**
1. Check global lock → if held, error: "Global step in progress, retry after completion"
2. Acquire service lock → if held, error: "Service step already in progress for '{name}'"
3. Execute step
4. Release service lock

**Acquisition for global steps:**
1. Acquire global lock → if held, error: "Global step already in progress"
2. Execute step
3. Release global lock

No deadlocks: service steps never hold global lock. Lock acquisition is single-direction.

### 2.3 Artifact Path Resolution

When `--service api` is provided:

| Context | Frontmatter output | Resolved path |
|---------|-------------------|---------------|
| Per-service step | `docs/tech-stack.md` | `services/api/docs/tech-stack.md` |
| Global step | `docs/service-ownership-map.md` | `docs/service-ownership-map.md` |

**Reads resolution** uses `globalSteps` set to determine path prefix:
- Read target in `globalSteps` → root path, look up in global state
- Read target NOT in `globalSteps` → service-prefixed path, look up in service state

**Cross-service reads** (service A reading service B's output) are NOT supported until Wave 3c. No ambiguity: frontmatter `reads` uses step names, not `service:step` qualified names. That syntax is Wave 3c.

---

## Section 3: Refactoring Scope

### Files Modified

| File | Change |
|------|--------|
| `src/state/state-path-resolver.ts` | **New**: StatePathResolver class |
| `src/state/state-manager.ts` | Accept StatePathResolver, use for all path construction, add v2→v3 migration |
| `src/state/lock-manager.ts` | Accept optional StatePathResolver parameter in acquireLock/releaseLock |
| `src/state/decision-logger.ts` | Accept optional StatePathResolver parameter in appendDecision |
| `src/state/rework-manager.ts` | Accept StatePathResolver in constructor |
| `src/state/completion.ts` | Service-prefixed artifact path resolution |
| `src/core/assembly/update-mode.ts` | Service-prefixed artifact path resolution |
| `src/core/pipeline/resolver.ts` | Accept serviceId, build synthetic config, expose globalSteps |
| `src/core/dependency/eligibility.ts` | Add scope/globalSteps filter options |
| `src/cli/guards.ts` | Replace assertSingleServiceOrExit with context-aware guard |
| `src/cli/commands/run.ts` | --service flag, StatePathResolver, scope-aware artifact gathering |
| `src/cli/commands/next.ts` | --service flag, service-scoped state loading |
| `src/cli/commands/status.ts` | --service flag, service-scoped or summary display |
| `src/cli/commands/skip.ts` | --service flag, guard update |
| `src/cli/commands/complete.ts` | --service flag, guard update |
| `src/cli/commands/info.ts` | --service flag, guard update |
| `src/cli/commands/dashboard.ts` | --service flag, guard update |
| `src/cli/commands/reset.ts` | --service flag, dual-mode guard, per-service/full reset |
| `src/cli/commands/rework.ts` | --service flag, guard update |
| `src/utils/user-errors.ts` | New error subclasses for service validation |
| `src/types/state.ts` | schema-version widened to `1 | 2 | 3` |
| `src/validation/state-validator.ts` | Accept schema-version 3 |

### Per-Service State Directory Layout

```
.scaffold/
├── config.yml           # Shared config (includes services[])
├── state.json           # Global state (cross-service + pre-phase steps only)
├── lock.json            # Global lock
├── decisions.jsonl      # Global decisions
└── services/
    ├── api/
    │   ├── state.json   # Service-scoped state (per-service steps)
    │   ├── lock.json    # Service-scoped lock
    │   └── decisions.jsonl
    └── web/
        ├── state.json
        ├─��� lock.json
        └── decisions.jsonl
```

---

## Section 4: Testing Strategy

| Category | Count | Coverage |
|----------|-------|---------|
| StatePathResolver | 6 | Root paths, service paths, ensureDir creates dirs |
| Synthetic config | 10 | `it.each` over all 10 project types — type override, methodology preserved, services[] preserved, other type configs cleared |
| Eligibility scope | 4 | Global scope, service scope, merged state view, disabled deps |
| State migration v2→v3 | 6 | Happy path, in_progress rejection, idempotent, crash recovery, completed step duplication across services, global lock acquisition |
| Overlay with serviceId | 3 | Backend service, web-app service, no serviceId (backward compat) |
| Guard logic | 8 | Per-service step needs --service, global step rejects --service, step-less commands with/without --service, reset modes, service name validation |
| Locking | 4 | Service lock, global lock blocks service, two services parallel, global during migration |
| Artifact path resolution | 4 | Per-service output prefixed, global output at root, reads from global state, reads from service state |
| E2E | 3 | Full run --service flow, global step flow, status --service flow |
| **Total** | **48** | |

---

## Section 5: MVP Methodology Note

Under MVP, review/security/operations steps are disabled. Disabled dependencies are treated as satisfied by `computeEligible()`. This means cross-service steps could become eligible without reviewed inputs — consistent with how MVP handles all steps. Multi-service projects are complex enough that MVP is not the recommended methodology, but the system handles it consistently. No special MVP logic in Wave 3b.

---

## Review History

This design went through 3 rounds of multi-model review (Codex, Gemini, Claude):

**Round 1 (Section 1 — original)**: 3 P0s, 2 P1s — missing state migration/bootstrap, incomplete guard logic for step-less commands, missing service-aware pipeline resolution, function modules not classes, directory creation.

**Round 2 (Section 1 — revised)**: 3 P0s (cross-service dep merged view, global lock during migration, decisions contention), 3 P1s (in_progress handling, synthetic config methodology, schema version scope). All fixed.

**Round 3 (Section 3)**: 2 P1s (fail-fast on missing overlay, scope-aware state lookup for artifacts), 2 P2s (parameterized synthetic config tests, cross-service reads deferred). Plus Gemini P1 (config contamination — clear other type configs in synthetic config). All fixed.
