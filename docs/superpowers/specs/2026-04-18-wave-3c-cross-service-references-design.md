# Wave 3c: Cross-Service References Design

**Goal**: Enable a step in one service to read artifacts produced by another service, with export allowlisting and transitive resolution.

**Prerequisites**: Wave 3b (service-scoped state, StatePathResolver, per-service overlay resolution)

**Scope**: ~150-200 lines production code across ~8 files + ~100 lines test code. The smallest wave — mostly wiring into existing infrastructure.

---

## Section 1: Schema Changes

### 1.1 `exports` on ServiceConfig

An allowlist declaring which steps' artifacts a service makes available to other services. Closed by default — a service with no `exports` field exports nothing.

```yaml
# In .scaffold/config.yml
services:
  - name: shared-lib
    projectType: library
    exports:
      - step: api-contracts
      - step: domain-modeling
    libraryConfig: { ... }
```

**Schema**: `exports: z.array(z.object({ step: z.string() })).optional()` on `ServiceSchema`.

**Type**: Add `exports?: Array<{ step: string }>` to `ServiceConfig` interface in `src/types/config.ts` (replacing the "No exports field — Wave 3c" comment at line 128).

### 1.2 `cross-reads` on MetaPromptFrontmatter

Declares which foreign service artifacts a step reads during assembly:

```yaml
# In a pipeline step's .md frontmatter
name: system-architecture
cross-reads:
  - service: shared-lib
    step: api-contracts
  - service: trading-engine
    step: domain-modeling
```

**Type**: `crossReads?: Array<{ service: string; step: string }>` on `MetaPromptFrontmatter` in `src/types/frontmatter.ts`.

**Frontmatter parsing**: The loader deserializes `cross-reads` (kebab-case YAML) to `crossReads` (camelCase). Unknown frontmatter fields currently produce warnings — the parser must be updated to recognize `cross-reads` and suppress the warning.

---

## Section 2: Cross-Service Dependency Edges + Transitive Resolution

### 2.1 `crossDependencies` on DependencyNode

```typescript
// src/types/dependency.ts
interface DependencyNode {
  slug: string
  phase: string | null
  order: number | null
  dependencies: string[]
  crossDependencies?: Array<{ service: string; step: string }>  // NEW
  enabled: boolean
}
```

**Non-blocking**: Cross-dependencies do NOT gate step execution. Foreign service steps may have been completed in a previous session, a different worktree, or by a different agent. They are purely informational.

**Source**: Built from `crossReads` frontmatter during `buildGraph()`. For each `cross-reads` entry on a step, a corresponding `crossDependencies` entry is added to that step's `DependencyNode`.

**Display**: `scaffold next --service api` and `scaffold status --service api` show cross-service readiness: "Note: system-architecture cross-reads shared-lib:api-contracts (completed)" or "(not yet completed)" or "(service not bootstrapped)".

### 2.2 Transitive Cross-Reads Resolution

When service A's step cross-reads service B's `api-contracts`, and service B's `api-contracts` step template itself has cross-reads from service C, service A transitively receives service C's artifacts too.

**Why frontmatter recursion is correct**: Cross-reads entries contain explicit `service:step` pairs. The frontmatter template is global, but each cross-reads entry is already service-qualified. Transitivity follows the declared dependency chain: if `api-contracts` template says it needs `core:domain-modeling`, that's true regardless of which service runs it.

**Resolution algorithm**:

```typescript
function resolveTransitiveCrossReads(
  crossReads: Array<{ service: string; step: string }>,
  config: ScaffoldConfig,
  projectRoot: string,
  visiting: Set<string>,                    // gray — cycle detection
  resolved: Map<string, ArtifactEntry[]>,   // black — memoization
): ArtifactEntry[] {
  const artifacts: ArtifactEntry[] = []
  for (const cr of crossReads) {
    const key = `${cr.service}:${cr.step}`
    if (visiting.has(key)) continue        // cycle — skip silently
    if (resolved.has(key)) {               // already resolved — reuse
      artifacts.push(...resolved.get(key)!)
      continue
    }
    visiting.add(key)

    // Direct resolution
    const direct = resolveDirectCrossRead(cr, config, projectRoot)
    artifacts.push(...direct)

    // Transitive: check the foreign step template's own cross-reads
    const foreignMeta = metaPrompts.get(cr.step)
    if (foreignMeta?.frontmatter.crossReads?.length) {
      const transitive = resolveTransitiveCrossReads(
        foreignMeta.frontmatter.crossReads,
        config, projectRoot, visiting, resolved,
      )
      artifacts.push(...transitive)
    }

    visiting.delete(key)
    resolved.set(key, direct)   // cache direct artifacts only
  }
  return artifacts
}
```

**Safety mechanisms**:
- **Cycle detection**: `visiting` set (gray nodes) prevents infinite loops. Cycles are structural, skipped silently.
- **Memoization**: `resolved` map (black nodes) caches direct artifact results for efficiency.
- **No depth limit**: cycle detection + memoization naturally bound recursion by unique `service:step` nodes.

### 2.3 Edge Case Behaviors

| Scenario | Behavior |
|----------|----------|
| Unknown service (not in `services[]`) | Warn + skip |
| Service has no `exports` field | Closed by default — warn + skip |
| Step not in service's `exports` | Warn + skip |
| Foreign state file missing | Warn + skip ("service not bootstrapped") |
| Foreign step not completed | Skip (only completed steps yield artifacts, matching existing `reads` behavior) |
| Foreign step disabled | Skip |
| Foreign step skipped | Skip |
| Cycle detected (A→B→A) | Skip silently (structural, not an error) |

---

## Section 3: Artifact Gathering Integration

### 3.1 Integration into `run.ts`

After the existing reads gathering loop, add a cross-reads loop:

```typescript
const crossReads = metaPrompt.frontmatter.crossReads ?? []
if (crossReads.length > 0) {
  const crossArtifacts = resolveTransitiveCrossReads(
    crossReads, config, projectRoot,
    new Set(), new Map(),
  )
  artifacts.push(...crossArtifacts)
}
```

### 3.2 Direct Cross-Read Resolution

```typescript
function resolveDirectCrossRead(
  cr: { service: string; step: string },
  config: ScaffoldConfig,
  projectRoot: string,
): ArtifactEntry[] {
  // 1. Validate service exists
  const serviceEntry = config.project?.services?.find(s => s.name === cr.service)
  if (!serviceEntry) {
    output.warn(`cross-reads: service '${cr.service}' not found`)
    return []
  }

  // 2. Check exports allowlist
  if (!serviceEntry.exports?.some(e => e.step === cr.step)) {
    output.warn(`cross-reads: '${cr.step}' not exported by '${cr.service}'`)
    return []
  }

  // 3. Load foreign service state (non-fatal if missing)
  const foreignResolver = new StatePathResolver(projectRoot, cr.service)
  if (!fs.existsSync(foreignResolver.statePath)) {
    output.warn(`cross-reads: service '${cr.service}' not bootstrapped`)
    return []
  }

  let foreignState: PipelineState
  try {
    foreignState = JSON.parse(fs.readFileSync(foreignResolver.statePath, 'utf8'))
  } catch {
    output.warn(`cross-reads: failed to read state for '${cr.service}'`)
    return []
  }

  // 4. Get artifacts from completed step
  const stepEntry = foreignState.steps?.[cr.step]
  if (!stepEntry || stepEntry.status !== 'completed' || !stepEntry.produces) return []

  // 5. Resolve artifacts with containment check
  const artifacts: ArtifactEntry[] = []
  for (const relPath of stepEntry.produces) {
    const fullPath = resolveContainedArtifactPath(projectRoot, relPath)
    if (fullPath && fs.existsSync(fullPath)) {
      artifacts.push({
        path: relPath,
        content: fs.readFileSync(fullPath, 'utf8'),
        source: `cross-read:${cr.service}:${cr.step}`,
      })
    }
  }
  return artifacts
}
```

### 3.3 Path Containment

All cross-service artifact reads go through `resolveContainedArtifactPath()` (Wave 0). The helper's `realpathSync` + containment check prevents any path traversal across service boundaries.

---

## Section 4: Refactoring Scope

### Files Modified

| File | Change |
|------|--------|
| `src/types/config.ts` | Add `exports` to `ServiceConfig` interface |
| `src/config/schema.ts` | Add `exports` to `ServiceSchema` |
| `src/types/frontmatter.ts` | Add `crossReads` to `MetaPromptFrontmatter` |
| `src/project/frontmatter.ts` | Parse `cross-reads` YAML → `crossReads` camelCase |
| `src/types/dependency.ts` | Add `crossDependencies` to `DependencyNode` |
| `src/core/dependency/graph.ts` | Populate `crossDependencies` from frontmatter |
| `src/cli/commands/run.ts` | Cross-reads artifact gathering loop |
| `src/cli/commands/next.ts` | Cross-dependency readiness display |
| `src/cli/commands/status.ts` | Cross-dependency readiness display |

---

## Section 5: Testing Strategy

| Category | Count | Coverage |
|----------|-------|---------|
| Schema | 3 | exports field valid/invalid/optional on ServiceSchema |
| Frontmatter | 3 | cross-reads parsed, empty, absent |
| Artifact resolution | 4 | happy path, non-exported warning, missing service warning, containment enforced |
| Transitive | 3 | A→B→C resolves, cycle detection, memoization |
| Graph | 2 | crossDependencies populated, absent when no cross-reads |
| Edge cases | 2 | missing foreign state (non-fatal), step not completed (skip) |
| **Total** | **17** | |

---

## Section 6: Out of Scope

- **Automatic cross-service invalidation**: Changing service A's artifacts does not automatically invalidate service B's derived steps. Manual re-run is required.
- **`crossReads` overlay overrides**: The multi-service overlay does not yet support `cross-reads-overrides`. Cross-reads are defined in frontmatter only. A future enhancement could add overlay-level overrides for projects with heterogeneous service relationships.

---

## Review History

**Round 1 (Section 2)**: Codex found 3 P1s, 2 P2s — all fixed:
- P1: Frontmatter recursion seam questioned → justified (cross-reads are service-qualified)
- P1: Cycle detection needs visiting+resolved memoization → implemented DFS coloring
- P1: Missing foreign state must be non-fatal → warn + skip
- P2: Depth limit 5 arbitrary → removed (cycle detection + memoization suffice)
- P2: Export edge cases undefined → full table added
