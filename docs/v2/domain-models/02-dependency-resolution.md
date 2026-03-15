# Domain Model: Dependency Resolution & Pipeline Ordering

**Domain ID**: 02
**Phase**: 1 — Deep Domain Modeling
**Depends on**: Meta-prompts in the `pipeline/` directory (consumes their frontmatter for dependency declarations)
**Last updated**: 2026-03-12
**Status**: draft

---

## Section 1: Domain Overview

The Dependency Resolution & Pipeline Ordering domain takes the meta-prompts in the `pipeline/` directory and computes a valid execution order. It merges dependency declarations from two sources — the methodology configuration's step definitions and each meta-prompt's frontmatter `depends-on` field — into a unified directed acyclic graph (DAG), then applies Kahn's algorithm for topological sorting with phase order as the tiebreaker. The domain also detects cycles, validates that all dependency targets exist in the active step set, handles the effects of conditional step disabling and runtime skipping on the dependency graph, and identifies parallelizable steps.

**Role in the v2 architecture**: Dependency resolution is the ordering step between meta-prompt loading and pipeline state tracking ([domain 03](03-pipeline-state-machine.md)). The assembly engine reads meta-prompts from `pipeline/` and their frontmatter declares dependencies. This domain computes a valid execution sequence from those declarations. Domain 03 then tracks progress through that ordered sequence at runtime. The CLI commands `scaffold run`, `scaffold next`, `scaffold status`, and `scaffold skip` all consume the dependency-sorted order produced here. The `scaffold validate` command uses it to verify the dependency graph is well-formed.

**Central design challenge**: The dependency graph has two authoritative sources (methodology config and frontmatter) that must be merged without contradiction, plus three runtime disruptions — conditional step disabling, runtime skipping, and re-running via `scaffold run <step>` — each of which affects the graph differently. Getting the semantics of these three disruptions wrong would either block the pipeline unnecessarily (over-constraining) or allow steps to run without their prerequisites (under-constraining).

---

## Section 2: Glossary

**adjacency list** — The internal representation of the dependency graph. A mapping from each prompt slug to the set of prompt slugs that depend on it (its successors). Used by Kahn's algorithm to efficiently traverse the graph.

**cycle** — A circular dependency chain where prompt A depends on B, B depends on C, and C depends on A (or any length chain that forms a loop). Cycles make topological sorting impossible and are always errors.

**DAG (directed acyclic graph)** — A graph with directed edges and no cycles. The dependency graph must be a DAG for topological sorting to produce a valid execution order.

**dependency edge** — A directed relationship from a prompt to one of its prerequisites. If prompt B depends on prompt A, the edge is A → B (A must complete before B can start).

**dependency merge** — The process of combining dependencies from the methodology manifest's `dependencies` section and the prompt's frontmatter `depends-on` field. The merge rule is set union — all declared dependencies from both sources are included.

**eligible prompt** — A prompt whose status is `pending` and all of whose dependencies have been satisfied (completed or skipped). Eligible prompts can be executed next.

**excluded step** — A step disabled in the methodology configuration because a required condition was not satisfied (e.g., conditional steps like database or API phases). Excluded steps are not in the dependency graph at all — they never existed from this domain's perspective.

**in-degree** — The number of unsatisfied incoming dependency edges for a prompt. A prompt with in-degree 0 has no remaining prerequisites and is ready for execution (or queueing).

**Kahn's algorithm** — A topological sorting algorithm that repeatedly removes nodes with in-degree 0 from the graph. Produces a valid execution order for any DAG. Detects cycles when the algorithm terminates before processing all nodes.

**manifest dependencies** — Dependencies declared in the methodology manifest's `dependencies` section. Keyed by prompt slug, values are arrays of prerequisite slugs. These are the methodology author's view of the pipeline's structural ordering.

**frontmatter dependencies** — Dependencies declared in individual meta-prompt files via the `depends-on` frontmatter field. These are the meta-prompt author's view of what prerequisites the step needs. Merged (union) with methodology configuration dependencies.

**parallel set** — The set of prompts that are simultaneously eligible for execution at a given point in the pipeline. These prompts have no dependency relationships between them and could theoretically run concurrently.

**phase tiebreaker** — When multiple prompts have in-degree 0 simultaneously during Kahn's algorithm, the prompt from the earlier manifest phase is dequeued first. This produces a human-friendly ordering that groups prompts by phase when dependencies allow.

**skipped prompt** — A prompt that was in the resolved set but was bypassed at runtime via `scaffold skip`. Skipped prompts are treated as "done" for dependency resolution — their dependents are unblocked. Distinct from excluded prompts, which are never in the resolved set.

**topological order** — A linear ordering of the vertices in a DAG such that for every directed edge A → B, vertex A appears before vertex B. The output of dependency resolution.

**dependency-sorted order** — The final output of this domain: a list of prompt slugs in topological order with phase tiebreaking applied. This is the canonical execution sequence for the pipeline.

---

## Section 3: Entity Model

```typescript
/**
 * A single edge in the dependency graph.
 * Represents the relationship: prerequisite must complete before dependent can start.
 */
interface DependencyEdge {
  /** The prompt slug that must complete first */
  prerequisite: string;

  /** The prompt slug that depends on the prerequisite */
  dependent: string;

  /**
   * Where this dependency was declared.
   * 'manifest' = from the methodology manifest's dependencies section.
   * 'frontmatter' = from the prompt file's depends-on field.
   * 'both' = declared in both sources (deduplicated during merge).
   */
  source: 'manifest' | 'frontmatter' | 'both';
}

/**
 * The complete dependency graph before sorting.
 * Built from the resolved prompt set's merged dependencies.
 */
interface DependencyGraph {
  /**
   * All prompt slugs in the graph.
   * Every slug in the resolved prompt set is a node, even if it has no edges.
   */
  nodes: string[];

  /**
   * All dependency edges.
   * Each edge represents one depends-on relationship.
   */
  edges: DependencyEdge[];

  /**
   * Forward adjacency list: for each prompt, the set of prompts that depend on it.
   * Used by Kahn's algorithm to propagate in-degree decrements.
   * Key = prerequisite slug, Value = set of dependent slugs.
   */
  successors: Record<string, Set<string>>;

  /**
   * Reverse adjacency list: for each prompt, the set of prompts it depends on.
   * Used for validation and `scaffold next` eligibility checks.
   * Key = dependent slug, Value = set of prerequisite slugs.
   */
  predecessors: Record<string, Set<string>>;

  /**
   * In-degree count for each node.
   * The number of unsatisfied prerequisites.
   * Initialized from the predecessor count; decremented during sorting.
   */
  inDegree: Record<string, number>;
}

/**
 * The primary input to the dependency resolver.
 * Constructed from meta-prompts in the pipeline/ directory.
 */
interface DependencyInput {
  /**
   * Meta-prompts from the pipeline directory, each with merged dependencies.
   * The frontmatter.dependsOn array already contains the union of
   * methodology config deps and frontmatter deps (merged during loading).
   */
  prompts: ResolvedPrompt[];

  /**
   * Prompts excluded during optional prompt filtering.
   * Used to generate appropriate warnings when an active prompt
   * declares a dependency on an excluded prompt.
   */
  excludedSlugs: Set<string>;
}

/**
 * Phase metadata for a prompt, used for tiebreaking.
 * Extracted from the ResolvedPrompt during graph construction.
 */
interface PromptPhaseInfo {
  /** The prompt slug */
  slug: string;

  /**
   * Zero-indexed phase position from the manifest.
   * Lower values = earlier phases = higher priority in tiebreaker.
   */
  phaseIndex: number;

  /** Human-readable phase name for display */
  phaseName: string;
}

/**
 * A cycle detected in the dependency graph.
 * Contains the chain of slugs forming the cycle.
 */
interface DependencyCycle {
  /**
   * The prompt slugs forming the cycle, in order.
   * The first and last elements are the same slug (closing the loop).
   * Example: ["coding-standards", "tdd", "project-structure", "coding-standards"]
   */
  chain: string[];
}

/**
 * The complete output of dependency resolution.
 * Consumed by domain 03 (pipeline state), domain 09 (CLI),
 * and domain 05 (platform adapters).
 */
interface DependencyResult {
  /**
   * Prompts in dependency-sorted order (topological order with phase tiebreaking).
   * This is the canonical execution sequence.
   * Each element is the prompt slug; consumers look up the full ResolvedPrompt
   * from the ResolutionResult by slug.
   */
  sortedOrder: string[];

  /**
   * The constructed dependency graph.
   * Retained for runtime eligibility checking by domain 03 and the CLI.
   * scaffold next uses predecessors to determine which prompts are eligible.
   */
  graph: DependencyGraph;

  /**
   * Parallel sets: groups of prompts that have no dependency relationship
   * between them and become eligible simultaneously.
   * Computed as a convenience for scaffold next and scaffold status.
   * Each inner array is a set of slugs eligible at the same "level."
   */
  parallelSets: string[][];

  /**
   * Warnings generated during dependency resolution.
   * Includes: dangling dependencies, dependencies on excluded prompts,
   * phase/dependency conflicts.
   */
  warnings: DependencyWarning[];

  /**
   * Errors that prevent resolution from completing.
   * Empty if resolution succeeded.
   */
  errors: DependencyError[];

  /** Whether resolution completed successfully (no cycles, no missing deps) */
  success: boolean;
}

/**
 * A non-fatal warning from dependency resolution.
 */
interface DependencyWarning {
  /** Warning code for programmatic handling */
  code: string;

  /** Human-readable warning message */
  message: string;

  /** The prompt slug that triggered the warning */
  slug?: string;

  /** The dependency slug involved (if applicable) */
  dependencySlug?: string;
}

/**
 * A fatal error from dependency resolution.
 */
interface DependencyError {
  /** Error code for programmatic handling */
  code: string;

  /** Human-readable error message */
  message: string;

  /** The prompt slug that triggered the error */
  slug?: string;

  /** The dependency slug involved (if applicable) */
  dependencySlug?: string;

  /**
   * For cycle errors: the cycle chain.
   * For other errors: undefined.
   */
  cycle?: DependencyCycle;

  /** Recovery guidance for the user */
  recovery: string;
}

/**
 * Runtime eligibility result for a specific pipeline state.
 * Computed by combining the static DependencyResult with
 * the current state.json prompt statuses.
 */
interface EligibilityResult {
  /**
   * Prompts that are eligible to run next.
   * All prerequisites are completed or skipped, and the prompt is pending.
   */
  eligible: string[];

  /**
   * Prompts that are blocked by incomplete prerequisites.
   * Includes the blocking prerequisite slugs for diagnostic display.
   */
  blocked: BlockedPrompt[];

  /** Total completed count */
  completedCount: number;

  /** Total skipped count */
  skippedCount: number;

  /** Total pending count */
  pendingCount: number;
}

/**
 * A prompt that cannot run because prerequisites are incomplete.
 */
interface BlockedPrompt {
  /** The blocked prompt's slug */
  slug: string;

  /** Slugs of prerequisites that are not yet completed or skipped */
  blockedBy: string[];
}
```

**Entity relationships:**

```
DependencyInput (from domain 01)
  ├── contains → ResolvedPrompt[] (with merged frontmatter.dependsOn)
  └── contains → excludedSlugs (for warning generation)

DependencyGraph (intermediate)
  ├── nodes ← prompt slugs from DependencyInput
  ├── edges ← derived from each prompt's frontmatter.dependsOn
  ├── successors ← forward adjacency from edges
  ├── predecessors ← reverse adjacency from edges
  └── inDegree ← computed from predecessors

DependencyResult (output)
  ├── sortedOrder ← produced by Kahn's algorithm
  ├── graph ← the DependencyGraph
  ├── parallelSets ← computed from sortedOrder levels
  ├── warnings ← accumulated during graph construction + sorting
  └── errors ← accumulated during validation + sorting

EligibilityResult (runtime, computed on demand)
  ├── combines → DependencyResult.graph (static structure)
  └── combines → state.json prompt statuses (dynamic state)
```

---

## Section 4: State Transitions

N/A — Dependency resolution is a stateless computation. It takes the meta-prompt set (from the `pipeline/` directory) as input and produces a sorted order as output in a single pass. There is no persistent state within this domain.

The *runtime* state of individual prompts (pending → in_progress → completed/skipped) belongs to the Pipeline State Machine ([domain 03](03-pipeline-state-machine.md)). This domain produces the static ordering; domain 03 tracks progress through that ordering.

The eligibility computation (which prompts can run next) is a pure function of the static dependency graph plus the current state.json — it does not mutate any state.

---

## Section 5: Core Algorithms

### Algorithm 1: Dependency Graph Construction

Transforms the resolved prompt set into a validated `DependencyGraph`.

**Input**: `DependencyInput` (resolved prompts + excluded slugs)
**Output**: `DependencyGraph` + accumulated warnings/errors

```
FUNCTION buildDependencyGraph(input: DependencyInput): {graph: DependencyGraph, warnings: DependencyWarning[], errors: DependencyError[]}

  warnings ← []
  errors ← []

  // Step 1: Build the node set from all resolved prompts
  nodes ← []
  phaseInfo ← {}  // slug → PromptPhaseInfo
  FOR EACH prompt IN input.prompts
    nodes.append(prompt.slug)
    phaseInfo[prompt.slug] ← {
      slug: prompt.slug,
      phaseIndex: prompt.phaseIndex,
      phaseName: prompt.phaseName
    }

  nodeSet ← SET(nodes)

  // Step 2: Build edges from merged dependencies
  edges ← []
  successors ← {}   // prerequisite → Set<dependent>
  predecessors ← {} // dependent → Set<prerequisite>
  inDegree ← {}

  // Initialize empty adjacency lists and in-degree counts
  FOR EACH slug IN nodes
    successors[slug] ← SET()
    predecessors[slug] ← SET()
    inDegree[slug] ← 0

  // Step 3: Process each prompt's dependencies
  FOR EACH prompt IN input.prompts
    FOR EACH depSlug IN prompt.frontmatter.dependsOn

      // Case A: dependency target is in the resolved set — valid edge
      IF depSlug IN nodeSet
        edge ← { prerequisite: depSlug, dependent: prompt.slug, source: 'both' }
        edges.append(edge)
        successors[depSlug].add(prompt.slug)
        predecessors[prompt.slug].add(depSlug)
        inDegree[prompt.slug] ← inDegree[prompt.slug] + 1

      // Case B: dependency target was excluded (optional prompt filtered out)
      ELSE IF depSlug IN input.excludedSlugs
        warnings.append({
          code: "DEP_ON_EXCLUDED",
          message: "Prompt \"{prompt.slug}\" depends on \"{depSlug}\" which was excluded (optional). Dependency ignored.",
          slug: prompt.slug,
          dependencySlug: depSlug
        })
        // Edge is silently dropped — the dependent prompt proceeds without this prereq

      // Case C: dependency target does not exist at all
      ELSE
        errors.append({
          code: "DEP_TARGET_MISSING",
          message: "Prompt \"{prompt.slug}\" depends on \"{depSlug}\" which is not in the resolved prompt set.",
          slug: prompt.slug,
          dependencySlug: depSlug,
          recovery: "Check the dependency name for typos. Valid prompt slugs: " + JOIN(nodes, ", ")
        })

  graph ← { nodes, edges, successors, predecessors, inDegree }

  RETURN { graph, warnings, errors }
```

**Complexity**: O(P + E) where P is the number of prompts and E is the total number of dependency declarations across all prompts. For a typical scaffold pipeline (~20 prompts, ~30 dependency edges), this is effectively O(1).

### Algorithm 2: Topological Sort (Kahn's Algorithm with Phase Tiebreaker)

Produces a valid execution order from the dependency graph.

**Input**: `DependencyGraph`, `Record<string, PromptPhaseInfo>` (phase info for tiebreaking)
**Output**: `{sortedOrder: string[], parallelSets: string[][], cycles: DependencyCycle[]}`

```
FUNCTION topologicalSort(
  graph: DependencyGraph,
  phaseInfo: Record<string, PromptPhaseInfo>
): { sortedOrder: string[], parallelSets: string[][], cycles: DependencyCycle[] }

  // Step 1: Copy in-degree map (algorithm is destructive)
  inDegree ← COPY(graph.inDegree)

  // Step 2: Initialize priority queue with all zero-in-degree nodes
  // Priority: lower phaseIndex = higher priority (dequeued first)
  queue ← PRIORITY_QUEUE(comparator: (a, b) =>
    phaseInfo[a].phaseIndex - phaseInfo[b].phaseIndex
    // Secondary tiebreaker: alphabetical by slug for determinism
    OR a.localeCompare(b)
  )

  FOR EACH slug IN graph.nodes
    IF inDegree[slug] == 0
      queue.enqueue(slug)

  // Step 3: Process the queue
  sortedOrder ← []
  parallelSets ← []

  WHILE queue IS NOT EMPTY
    // Capture current queue contents as a parallel set
    // All nodes in the queue right now have in-degree 0 and could run concurrently
    currentLevel ← queue.drainAll()  // Remove all, sorted by priority
    parallelSets.append(currentLevel)

    FOR EACH slug IN currentLevel
      sortedOrder.append(slug)

      // Decrement in-degree for all successors
      FOR EACH successor IN graph.successors[slug]
        inDegree[successor] ← inDegree[successor] - 1
        IF inDegree[successor] == 0
          queue.enqueue(successor)

  // Step 4: Cycle detection
  cycles ← []
  IF LENGTH(sortedOrder) != LENGTH(graph.nodes)
    // Some nodes were never processed — they are part of cycles
    unprocessed ← graph.nodes MINUS sortedOrder
    cycles ← findCycles(unprocessed, graph)

  // Step 5: Verification (post-condition check)
  IF LENGTH(cycles) == 0
    FOR EACH slug IN sortedOrder
      FOR EACH depSlug IN graph.predecessors[slug]
        ASSERT indexOf(sortedOrder, depSlug) < indexOf(sortedOrder, slug)

  RETURN { sortedOrder, parallelSets, cycles }
```

**Note on parallel sets**: The `drainAll()` operation captures all currently-ready nodes as a batch. This is a slight variation on standard Kahn's where you dequeue one at a time. The variation produces the same topological order (the within-level ordering is still deterministic via the priority comparator) but additionally records which nodes are mutually independent — useful for `scaffold next` when showing multiple eligible prompts.

**Complexity**: O(P + E) where P is nodes and E is edges. The priority queue operations add O(P log P) for the comparisons, making the total O(P log P + E). For typical scaffold pipelines (~20 prompts), this is negligible.

### Algorithm 3: Cycle Detection and Reporting

When Kahn's algorithm terminates early (sorted count < node count), identifies the specific cycles in the remaining subgraph.

**Input**: Set of unprocessed slugs, `DependencyGraph`
**Output**: `DependencyCycle[]`

```
FUNCTION findCycles(
  unprocessed: Set<string>,
  graph: DependencyGraph
): DependencyCycle[]

  cycles ← []
  visited ← SET()
  inStack ← SET()

  // DFS-based cycle detection on the subgraph of unprocessed nodes
  FUNCTION dfs(slug: string, path: string[])
    IF slug IN inStack
      // Found a cycle — extract the cycle portion of the path
      cycleStart ← indexOf(path, slug)
      chain ← path[cycleStart..] + [slug]  // Close the loop
      cycles.append({ chain })
      RETURN

    IF slug IN visited
      RETURN

    visited.add(slug)
    inStack.add(slug)
    path.append(slug)

    FOR EACH successor IN graph.successors[slug]
      IF successor IN unprocessed
        dfs(successor, path)

    path.pop()
    inStack.remove(slug)

  FOR EACH slug IN unprocessed
    IF slug NOT IN visited
      dfs(slug, [])

  RETURN cycles
```

**Complexity**: O(P + E) for the subgraph of unprocessed nodes. In practice, cycles are rare and the subgraph is small.

### Algorithm 4: Runtime Eligibility Computation

Given the static dependency graph and the current pipeline state, computes which prompts are eligible to run next.

**Input**: `DependencyGraph`, prompt statuses from `state.json`
**Output**: `EligibilityResult`

```
FUNCTION computeEligibility(
  graph: DependencyGraph,
  promptStatuses: Record<string, PromptStatus>
): EligibilityResult

  eligible ← []
  blocked ← []
  completedCount ← 0
  skippedCount ← 0
  pendingCount ← 0

  FOR EACH slug IN graph.nodes
    status ← promptStatuses[slug].status

    IF status == "completed"
      completedCount ← completedCount + 1
      CONTINUE

    IF status == "skipped"
      skippedCount ← skippedCount + 1
      CONTINUE

    IF status == "in_progress"
      // Currently executing — not eligible for another run
      CONTINUE

    // status == "pending"
    pendingCount ← pendingCount + 1

    // Check all prerequisites
    unsatisfied ← []
    FOR EACH depSlug IN graph.predecessors[slug]
      depStatus ← promptStatuses[depSlug].status
      IF depStatus != "completed" AND depStatus != "skipped"
        unsatisfied.append(depSlug)

    IF LENGTH(unsatisfied) == 0
      eligible.append(slug)
    ELSE
      blocked.append({ slug, blockedBy: unsatisfied })

  RETURN { eligible, blocked, completedCount, skippedCount, pendingCount }
```

**Complexity**: O(P + E) where P is nodes and E is edges. Called on every `scaffold run`, `scaffold next`, and `scaffold status` invocation.

**Key semantic**: Both "completed" and "skipped" prompts satisfy dependency edges. This is by design — when a user skips a prompt, they are asserting that they don't need its output, and downstream prompts should not be blocked.

### Algorithm 5: Re-run Dependency Validation

When `scaffold run --from X` is used, determines whether re-running prompt X should trigger warnings about downstream prompts that may have stale inputs.

**Input**: prompt slug to re-run, `DependencyGraph`, prompt statuses from `state.json`
**Output**: list of affected downstream prompts

```
FUNCTION findAffectedDownstream(
  slug: string,
  graph: DependencyGraph,
  promptStatuses: Record<string, PromptStatus>
): string[]

  // BFS from the re-run prompt through successors
  affected ← []
  queue ← [slug]
  visited ← SET([slug])

  WHILE queue IS NOT EMPTY
    current ← queue.dequeue()

    FOR EACH successor IN graph.successors[current]
      IF successor NOT IN visited
        visited.add(successor)
        IF promptStatuses[successor].status == "completed"
          // This completed prompt may have stale inputs now
          affected.append(successor)
          // Continue searching deeper — transitive dependents may also be stale
          queue.enqueue(successor)

  RETURN affected
```

**Complexity**: O(P + E) worst case (if the re-run prompt is at the root of the graph). Typically much less since most re-runs affect a small subgraph.

---

## Section 6: Error Taxonomy

### Resolution Errors (Fatal — dependency resolution cannot proceed)

#### `DEP_CYCLE_DETECTED`
- **Severity**: Error
- **When**: Kahn's algorithm terminates before processing all nodes, indicating one or more cycles
- **Message template**: `Circular dependency detected: {chain}. Pipeline cannot be ordered.`
- **JSON structure**:
  ```json
  {
    "code": "DEP_CYCLE_DETECTED",
    "cycles": [
      {
        "chain": ["coding-standards", "tdd", "project-structure", "coding-standards"]
      }
    ],
    "message": "Circular dependency detected: coding-standards → tdd → project-structure → coding-standards"
  }
  ```
- **Recovery**: Break the cycle by removing one of the dependency edges. Review the manifest `dependencies` section and prompt frontmatter `depends-on` fields to identify which dependency is incorrect. Common cause: two prompts that each produce artifacts the other reads.
- **Exit code**: 1 (validation error)

#### `DEP_TARGET_MISSING`
- **Severity**: Error
- **When**: A prompt's `dependsOn` references a slug that is not in the resolved prompt set and was not excluded as an optional prompt
- **Message template**: `Prompt "{slug}" depends on "{depSlug}" which is not in the resolved prompt set. Valid prompt slugs: {validSlugs}`
- **JSON structure**:
  ```json
  {
    "code": "DEP_TARGET_MISSING",
    "slug": "my-custom-prompt",
    "dependency": "nonexistent-prompt",
    "suggestion": null,
    "valid_slugs": ["create-prd", "tech-stack", "coding-standards", "..."]
  }
  ```
- **Recovery**: Fix the dependency name — it may be a typo. If using fuzzy matching (Levenshtein distance ≤ 2), a suggestion is included. If the target was intentionally removed, also remove the dependency declaration.
- **Exit code**: 1 (validation error)

#### `DEP_SELF_REFERENCE`
- **Severity**: Error
- **When**: A prompt declares a dependency on itself
- **Message template**: `Prompt "{slug}" depends on itself. Self-dependencies are not allowed.`
- **JSON structure**:
  ```json
  {
    "code": "DEP_SELF_REFERENCE",
    "slug": "tech-stack"
  }
  ```
- **Recovery**: Remove the self-dependency from the prompt's frontmatter `depends-on` or the manifest `dependencies` section.
- **Exit code**: 1 (validation error)

### Resolution Warnings (Non-fatal — resolution proceeds with caveats)

#### `DEP_ON_EXCLUDED`
- **Severity**: Warning
- **When**: A prompt depends on a prompt that was excluded during optional prompt filtering
- **Message template**: `Prompt "{slug}" depends on "{depSlug}" which was excluded (optional, requires: {trait}). Dependency ignored.`
- **JSON structure**:
  ```json
  {
    "code": "DEP_ON_EXCLUDED",
    "slug": "some-prompt",
    "excluded_dependency": "add-playwright",
    "excluded_reason": "requires: web",
    "action": "dependency_removed"
  }
  ```
- **Recovery**: Informational. The dependency edge is removed. If the dependency is actually needed, enable the required trait in `config.yml`.

#### `DEP_PHASE_CONFLICT`
- **Severity**: Warning
- **When**: A prompt's dependency-derived execution position places it earlier than its declared phase
- **Message template**: `Prompt "{slug}" is declared in phase {declaredPhase} but its dependencies place it in the execution window of phase {effectivePhase}. Dependencies are authoritative; the prompt will execute in position {position}.`
- **JSON structure**:
  ```json
  {
    "code": "DEP_PHASE_CONFLICT",
    "slug": "user-stories",
    "declared_phase": 5,
    "effective_position": 3,
    "reason": "All dependencies resolve within phases 1-2"
  }
  ```
- **Recovery**: Informational. Dependencies are authoritative for ordering; phases are for display grouping only. If the phase assignment is wrong, update the prompt's frontmatter `phase` field or the manifest phase placement.

#### `DEP_RERUN_STALE_DOWNSTREAM`
- **Severity**: Warning
- **When**: `scaffold run --from X` is used and completed downstream prompts may have stale inputs
- **Message template**: `Re-running "{slug}" may invalidate {count} completed downstream prompt(s): {affectedSlugs}. Consider re-running them as well.`
- **JSON structure**:
  ```json
  {
    "code": "DEP_RERUN_STALE_DOWNSTREAM",
    "rerun_slug": "tech-stack",
    "affected_downstream": ["coding-standards", "tdd", "project-structure"],
    "action": "advisory"
  }
  ```
- **Recovery**: Informational. After re-running the prompt, consider re-running affected downstream prompts. Each prompt's Mode Detection/update mode will handle merging new changes.

---

## Section 7: Integration Points

### Prompt Resolution (Domain 01) → Dependency Resolution

- **Direction**: Domain 01 outputs feed domain 02
- **Data flow**: `ResolutionResult.prompts` (an array of `ResolvedPrompt` records) is the primary input. Each `ResolvedPrompt` contains `frontmatter.dependsOn` — the already-merged union of manifest dependencies and frontmatter dependencies (domain 01, Algorithm 1, Step 6). `ResolutionResult.excludedOptional` provides the set of excluded slugs for `DEP_ON_EXCLUDED` warnings.
- **Contract**: Domain 02 expects:
  - All dependency slugs in `frontmatter.dependsOn` are either present in the resolved prompt list OR in the excluded set. Any other slug is a `DEP_TARGET_MISSING` error.
  - Each `ResolvedPrompt` has a unique `slug`.
  - `phaseIndex` is set correctly for tiebreaking.
- **Assumption**: Domain 01 has already merged manifest and frontmatter dependencies. Domain 02 does not re-read the manifest — it works solely from the merged `dependsOn` arrays.

### Dependency Resolution → Pipeline State Machine (Domain 03)

- **Direction**: Domain 02 outputs feed domain 03
- **Data flow**: `DependencyResult.sortedOrder` defines the canonical execution sequence. `DependencyResult.graph` (specifically `predecessors`) is used by domain 03's eligibility computation to determine which prompts can run next. The `parallelSets` structure informs `scaffold next` display.
- **Contract**: Domain 03 expects:
  - `sortedOrder` is a valid topological ordering — every prompt appears after all its prerequisites.
  - `graph.predecessors[slug]` is the complete set of prerequisites for each prompt.
  - The graph is a DAG (no cycles).
- **Assumption**: The dependency graph is static after `scaffold build`. Domain 03 does not modify the graph at runtime — it only reads it to compute eligibility.

### Dependency Resolution → CLI Architecture (Domain 09)

- **Direction**: Domain 02 outputs are consumed by CLI commands
- **Data flow**: `scaffold run` uses `computeEligibility()` to find the next runnable prompt. `scaffold next` uses `parallelSets` and eligibility to show all currently-runnable prompts. `scaffold status` uses `sortedOrder` to display prompts in execution sequence. `scaffold skip` uses `graph.successors` to determine the impact of skipping. `scaffold run --from X` uses `findAffectedDownstream()` to warn about stale outputs.
- **Contract**: CLI commands treat `DependencyResult` as read-only. They combine it with `state.json` (domain 03) to compute runtime eligibility.
- **Assumption**: The `DependencyResult` is cached after `scaffold build` and reused across CLI invocations. It is recomputed only when `config.yml` or prompt files change.

### Dependency Resolution → Platform Adapters (Domain 05)

- **Direction**: Domain 02 outputs inform adapter generation
- **Data flow**: Platform adapters use `sortedOrder` to generate "After This Step" navigation sections in command files and to order prompts in AGENTS.md.
- **Contract**: Adapters expect `sortedOrder` to include all prompts that will be rendered (no excluded optionals).

### Dependency Resolution → Config Validation (Domain 06)

- **Direction**: Domain 06 validates the dependency graph as part of `scaffold validate`
- **Data flow**: `scaffold validate` runs dependency resolution to check for cycles, missing targets, and other graph errors. It reports `DependencyResult.errors` and `DependencyResult.warnings` alongside other validation results.
- **Contract**: `scaffold validate` runs the full dependency resolution pipeline but does not execute any prompts. The result is used purely for error reporting.

### Prompt Frontmatter (Domain 08) → Dependency Resolution

- **Direction**: Domain 08 defines the `depends-on` field schema consumed here
- **Data flow**: The frontmatter `depends-on` field (an array of prompt slug strings) is parsed by domain 01, merged with manifest deps, and passed to domain 02 via `ResolvedPrompt.frontmatter.dependsOn`.
- **Contract**: `depends-on` values are prompt slugs (not prefixed references). Domain 02 validates that each slug exists in the resolved set or excluded set.

### Methodology & Depth Resolution (Domain 16) → Dependency Resolution

- **Direction**: Domain 16 outputs affect domain 02's input set
- **Data flow**: Step enablement resolved by domain 16 determines which steps are active in the pipeline. Steps that domain 16 reports as disabled are excluded from the active step set and added to `DependencyInput.excludedSlugs`. This changes the dependency graph — dependents of disabled steps may become unblocked if the disabled step was their only remaining dependency.
- **Contract**: Domain 02 expects domain 16's enablement decisions to be final before dependency resolution runs. Disabled steps are removed from the graph entirely (not treated as skipped).
- **Assumption**: Enablement is resolved before dependency resolution. If methodology config changes, dependency resolution must be re-run with the updated active step set.

---

## Section 8: Edge Cases & Failure Modes

### MQ1: Exact dependency merge rule — manifest + frontmatter conflict and missing targets

**The merge rule is set union.** Domain 01 (Algorithm 1, Step 6) computes `UNION(manifestDeps, frontmatterDeps)` for each prompt. This merge happens *before* domain 02 receives the data — domain 02 sees only the merged `dependsOn` arrays.

**What if manifest and frontmatter declare different dependencies for the same prompt?** There is no conflict — union means all declared dependencies from both sources are included. If the manifest says `tech-stack: [beads-setup]` and the prompt's frontmatter says `depends-on: [create-prd]`, the merged result is `dependsOn: ["beads-setup", "create-prd"]`. Neither source can *remove* a dependency declared by the other.

**What if one declares a dependency on a prompt that doesn't exist in the resolved set?** Domain 02 classifies this in three ways:

1. **Target is in the resolved set** → valid edge, added to the graph.
2. **Target was excluded (optional prompt filtered out by domain 01)** → warning `DEP_ON_EXCLUDED`, edge dropped silently. The dependent prompt proceeds without that prerequisite.
3. **Target does not exist at all** → error `DEP_TARGET_MISSING`. Resolution fails. The error message includes the list of valid slugs and a fuzzy-match suggestion if available.

**Rationale for union (not intersection or replacement)**: Dependencies are safety constraints. A manifest author may declare structural dependencies that ensure correct pipeline ordering, while a prompt author may declare content dependencies based on what the prompt actually reads. Removing either source could cause a prompt to execute before its prerequisites are ready. The safe default is to include all declared dependencies.

**Category**: (a) Handled by design.

### MQ2: Optional prompt exclusion effects on dependents

When an optional prompt is excluded from the resolved set (e.g., `design-system` excluded because the project lacks the `frontend` trait), prompts that depend on it are **not** automatically excluded. Instead, the dependency edge is removed and a warning is emitted.

**Exact behavior:**

1. Domain 01 filters optional prompts in Step 3 of Algorithm 1. Excluded prompts never enter the resolved prompt list.
2. Domain 01 emits warning `RESOLUTION_DEPENDENCY_ON_EXCLUDED` and removes the dependency from the resolved prompt's `dependsOn` array (see domain 01 Section 8, MQ6).
3. When domain 02 receives the data, the dependency edge is already gone. The dependent prompt has one fewer prerequisite.

**Example:**

```yaml
# Manifest declares:
dependencies:
  design-system: [dev-env-setup]
  git-workflow: [dev-env-setup, design-system]  # design-system is optional
```

If `design-system` is excluded (no `frontend` trait), `git-workflow`'s effective dependencies become `[dev-env-setup]` only. `git-workflow` is still in the pipeline and can run after `dev-env-setup` completes.

**Why not cascade-exclude dependents?** Consider: `git-workflow` depends on `design-system` only because the design system may affect `.gitignore` entries. But `git-workflow` is a core prompt — excluding it because an optional dependency was excluded would break the pipeline for all non-frontend projects. The dependency is *nice to have*, not *essential*. The prompt is written to handle the case where `docs/design-system.md` doesn't exist.

**Category**: (a) Handled by design.

### MQ3: Skip vs. exclusion for dependency purposes

**Exclusion** (optional prompt filtered out at build time):
- The prompt is never in the resolved set.
- Its dependency edges are removed from the graph.
- Dependents are unblocked because the edge doesn't exist.
- No entry in `state.json` for excluded prompts.

**Skipping** (user runs `scaffold skip <prompt>` at runtime):
- The prompt is in the resolved set and in the dependency graph.
- The prompt's status in `state.json` is set to `"skipped"`.
- Skipped prompts are treated as "done" for dependency resolution — their dependents are unblocked.
- A skipped prompt's `produces` artifacts are NOT expected to exist. Predecessor Artifact Verification (step gating) treats a skipped predecessor's artifacts as not required.

**The key difference**: Exclusion removes the node from the graph entirely (it was never part of the pipeline). Skipping keeps the node in the graph but marks it as satisfied. Both unblock dependents, but the mechanism is different.

**Implications for re-running**: A skipped prompt can be un-skipped via `scaffold run --from <prompt>`. This changes its status from `"skipped"` to `"in_progress"` and runs it. Since the dependency graph still has the node and all its edges, the re-run is valid — the prompt's own prerequisites are already satisfied (they were satisfied when the user originally had the option to skip).

**Example:**

```
Pipeline: create-prd → tech-stack → coding-standards → tdd → project-structure
User skips: tdd
Effect: project-structure becomes eligible (tdd is "done" as skipped)
Later: scaffold run --from tdd  (un-skip and run tdd)
```

**Category**: (a) Handled by design.

### MQ4: Phase vs. dependency ordering conflicts

**The spec is explicit: dependencies are authoritative for ordering; phases are for grouping only.** Phases serve two purposes:

1. **Display grouping**: `scaffold status` and the dashboard show prompts grouped by phase for readability.
2. **Tiebreaking**: When Kahn's algorithm has multiple prompts with in-degree 0, the prompt from the earlier phase is dequeued first.

**What if a prompt's dependencies place it earlier than its declared phase?**

Consider: `user-stories` is declared in Phase 5 (Stories & Planning) but depends only on `review-prd` (Phase 1). After `review-prd` completes (which itself depends on `create-prd`), `user-stories` has in-degree 0 and is eligible.

In Kahn's algorithm, `user-stories` would be enqueued alongside Phase 2 prompts (like `tech-stack`). The phase tiebreaker makes `tech-stack` (Phase 2) dequeue before `user-stories` (Phase 5), so `user-stories` appears later in the sorted order — but it's still eligible earlier than most Phase 5 prompts.

**Dependencies always win.** If `user-stories` were mistakenly given a Phase 1 declaration, it would still execute after `review-prd` (its dependency), not before. The phase is a tiebreaker, not a constraint.

**What if a prompt's dependencies force it later than its declared phase?**

This is the more common case and is completely expected. If `implementation-plan` is declared in Phase 7 and depends on `user-stories` (Phase 5) and `project-structure` (Phase 2), it cannot execute until both are complete — regardless of its Phase 7 declaration.

**Warning behavior**: A `DEP_PHASE_CONFLICT` warning is emitted when a prompt's dependency-derived position diverges significantly from its declared phase. This is advisory only — it may indicate a manifest configuration issue or may be intentional.

**Category**: (a) Handled by design.

### MQ5: Extra-prompt injection into the dependency graph

Extra prompts from `config.yml` are fully integrated into the dependency graph. They declare their dependencies via frontmatter `depends-on` and participate in topological sorting identically to built-in prompts.

**Example: Custom prompt chain**

```yaml
# config.yml
extra-prompts:
  - security-audit
  - compliance-check
```

```yaml
# .scaffold/prompts/security-audit.md frontmatter
---
description: Run security audit on project architecture
depends-on: [coding-standards, project-structure]
phase: 6
---
```

```yaml
# .scaffold/prompts/compliance-check.md frontmatter
---
description: Verify regulatory compliance
depends-on: [security-audit, user-stories]
phase: 6
---
```

**Resulting graph edges:**

```
coding-standards → security-audit
project-structure → security-audit
security-audit → compliance-check
user-stories → compliance-check
```

`security-audit` executes after both `coding-standards` and `project-structure` complete. `compliance-check` executes after both `security-audit` and `user-stories` complete. Both extra prompts appear in the topological sort alongside built-in prompts, ordered by their dependencies.

**Can a built-in prompt depend on an extra prompt?** Technically yes (if someone edits the manifest or a built-in prompt's frontmatter), but this would be unusual and fragile — extra prompts are project-specific, so a built-in depending on them would break for projects that don't include that extra. Domain 02 does not prohibit this, but it would be a code smell.

**Can two extra prompts form a chain?** Yes, as shown above (`compliance-check` depends on `security-audit`). The dependency resolver treats extra prompts identically to built-in prompts.

**Category**: (a) Handled by design.

### MQ6: Exact Kahn's algorithm implementation

See Algorithm 2 in Section 5 for the complete pseudocode. The key implementation details:

**Initialization:**
1. Copy the in-degree map (the algorithm decrements in-place).
2. Scan all nodes for in-degree 0 (no prerequisites). These are the starting prompts.
3. Insert them into a priority queue ordered by `(phaseIndex ASC, slug ASC)`.

**Queue management:**
- The queue is a min-heap priority queue.
- Primary sort key: `phaseIndex` (lower = higher priority, dequeued first).
- Secondary sort key: `slug` alphabetically (for deterministic ordering when phases are equal).
- The `drainAll()` operation captures all currently-ready nodes as a single parallel set before processing any of them. This means the parallel set represents the true set of concurrently-eligible prompts at that moment.

**Tiebreaker application:**
- When multiple prompts reach in-degree 0 simultaneously, the phase tiebreaker ensures prompts from earlier phases are listed first.
- Example: After `create-prd` completes, both `review-prd` (Phase 1) and `beads-setup` (Phase 2) may reach in-degree 0. The tiebreaker orders `review-prd` first because Phase 1 < Phase 2.
- The alphabetical secondary tiebreaker ensures deterministic output across runs.

**Cycle detection reporting:**
- If `sortedOrder.length < graph.nodes.length` after the main loop, cycles exist.
- The unprocessed nodes are passed to `findCycles()` (Algorithm 3), which uses DFS to identify specific cycle chains.
- Each cycle is reported with its full chain: `["A", "B", "C", "A"]`.
- Multiple independent cycles are reported separately.

**Final verification:**
- After sorting, a post-condition check verifies that every prompt appears after all its prerequisites in the sorted list.
- This is a sanity check — if the algorithm is correct, this always passes. It catches implementation bugs.

**Category**: (a) Handled by design.

### MQ7: `scaffold run --from X` re-run semantics

When `scaffold run --from X` is used, **only prompt X is re-run. Its dependents are NOT automatically re-run.**

**The re-run process:**

1. **Prerequisite check**: Verify X's prerequisites are all completed or skipped. If not, error — you can't re-run a prompt whose prerequisites haven't been met.
2. **Status change**: X's status in `state.json` changes from `"completed"` (or `"skipped"`) to `"in_progress"`.
3. **Downstream warning**: `findAffectedDownstream()` (Algorithm 5) identifies all completed prompts that transitively depend on X. A `DEP_RERUN_STALE_DOWNSTREAM` warning is emitted listing these prompts.
4. **Execution**: X's prompt is executed. The prompt's Mode Detection detects the existing artifact (if any) and operates in update mode.
5. **Completion**: X's status returns to `"completed"` with a new timestamp.

**Why not auto-cascade re-runs?** Three reasons:
1. **Cost**: Re-running all downstream prompts is expensive — each involves an LLM session that may take minutes. A change to `tech-stack` could cascade through 10+ prompts.
2. **Stability**: Most re-runs are minor adjustments. If the user added a new library to `tech-stack`, they don't need to re-run `coding-standards`, `tdd`, `project-structure`, etc. — those prompts' Mode Detection will incorporate the change if/when they're re-run.
3. **User agency**: The user knows best which downstream prompts are affected. The warning gives them the information; they decide what to re-run.

**If X's output changed and downstream prompts have stale inputs:**
- Each downstream prompt has Mode Detection / update mode.
- When the user eventually re-runs a downstream prompt, it reads the updated artifact and adjusts.
- `scaffold status` could optionally show a "may be stale" indicator for downstream prompts whose predecessor was re-run after they completed.

**Special case — un-skipping**: `scaffold run --from X` where X was previously skipped changes status from `"skipped"` to `"in_progress"`. All of X's prerequisites are already satisfied (they were when X was originally offered to the user). Dependents of X that were already completed may have run without X's output — the stale-downstream warning applies here too.

**Category**: (a) Handled by design.

### MQ8: Parallelizable prompts

**Yes, prompts with no dependency relationship between them are parallelizable.** The `parallelSets` field in `DependencyResult` explicitly identifies these groups.

**How the CLI surfaces this:**

`scaffold next` shows all currently-eligible prompts when multiple have in-degree 0:

```
Next eligible prompts (2 can run in parallel):
  1. review-prd — Review PRD for quality
  2. beads-setup — Initialize task tracking

Run: scaffold run
     (runs the first eligible prompt)
```

`scaffold status` marks all eligible prompts with the same indicator:

```
Pipeline: classic (2/18 complete)
+ create-prd
> review-prd (eligible)
> beads-setup (eligible)
  innovate-prd
  tech-stack
  ...
```

**Sequential execution**: Despite multiple prompts being eligible, `scaffold run` (without `--from`) runs only the first eligible prompt (per the phase tiebreaker order). The user must run `scaffold run` again for the next one. This is by design — prompts run sequentially in a single CLI session.

**Parallel execution with worktrees**: In a multi-agent setup, each agent runs `scaffold run` in its own worktree. With proper locking ([domain 13](13-pipeline-locking.md)), two agents could execute `review-prd` and `beads-setup` simultaneously if both are eligible. The lock prevents two agents from picking the *same* prompt.

**The `parallelSets` structure:**

```typescript
// Example for the classic methodology
parallelSets = [
  ["create-prd"],                           // Level 0: no prerequisites
  ["review-prd", "beads-setup"],            // Level 1: both depend only on create-prd
  ["innovate-prd", "tech-stack", "user-stories"], // Level 2: innovate-prd depends on review-prd; tech-stack on beads-setup; user-stories on review-prd
  ["claude-code-permissions", "coding-standards", "tdd"],  // Level 3
  ["project-structure"],                    // Level 4
  // ... etc
]
```

Note: `user-stories` depends only on `review-prd`, so it appears at level 2 alongside `tech-stack` — even though `user-stories` is in Phase 5 and `tech-stack` in Phase 2. Dependencies, not phases, determine the level.

**Category**: (a) Handled by design.

### MQ9: Complete input and output data structures

**Complete input to the dependency resolver:**

```typescript
// Primary input — constructed from domain 01's ResolutionResult
interface DependencyInput {
  prompts: ResolvedPrompt[];    // From ResolutionResult.prompts
  excludedSlugs: Set<string>;  // From ResolutionResult.excludedOptional[].slug
}

// Each ResolvedPrompt contributes:
// - slug: string                    → becomes a graph node
// - frontmatter.dependsOn: string[] → becomes graph edges
// - phaseIndex: number              → used for tiebreaking
// - phaseName: string               → used for display
```

**Complete output of the dependency resolver:**

```typescript
interface DependencyResult {
  // The canonical execution sequence
  sortedOrder: string[];      // e.g., ["create-prd", "beads-setup", "review-prd", "innovate-prd", "tech-stack", ...]

  // The full graph structure (retained for runtime use)
  graph: DependencyGraph;     // nodes, edges, successors, predecessors, inDegree

  // Groups of concurrently-eligible prompts
  parallelSets: string[][];   // e.g., [["create-prd"], ["review-prd", "beads-setup"], ["innovate-prd", "tech-stack", "user-stories"], ...]

  // Non-fatal issues
  warnings: DependencyWarning[];

  // Fatal issues (empty on success)
  errors: DependencyError[];

  // Whether resolution succeeded
  success: boolean;
}
```

**Data flow summary:**

```
ResolutionResult (domain 01)
    │
    ├── .prompts[].slug ──────────────────→ DependencyGraph.nodes
    ├── .prompts[].frontmatter.dependsOn ─→ DependencyGraph.edges
    ├── .prompts[].phaseIndex ────────────→ tiebreaker in Kahn's algorithm
    └── .excludedOptional[].slug ─────────→ DEP_ON_EXCLUDED warning check
                                              │
                                              v
                                    DependencyResult
                                        │
                                        ├── .sortedOrder ──→ state.json initialization (domain 03)
                                        ├── .graph ────────→ runtime eligibility (domain 03, domain 09)
                                        ├── .parallelSets ─→ scaffold next display (domain 09)
                                        └── .warnings ─────→ CLI output (domain 09)
```

**Category**: (a) Handled by design.

### MQ10: Three error scenarios

#### Scenario A: Circular dependency

**Setup:**
```yaml
# manifest.yml dependencies
dependencies:
  coding-standards: [tdd]
  tdd: [project-structure]
  project-structure: [coding-standards]
```

**Detection**: Kahn's algorithm processes all zero-in-degree nodes first. After processing `create-prd` and other non-cyclic prompts, the three prompts above are never enqueued (each has in-degree ≥ 1 that never reaches 0). `sortedOrder.length < graph.nodes.length` triggers cycle detection.

**Error output (interactive mode):**
```
Error: Circular dependency detected in the pipeline.

Cycle: coding-standards → tdd → project-structure → coding-standards

The pipeline cannot be ordered because these prompts form a circular
dependency chain. Each prompt depends on another prompt that ultimately
depends back on it.

To fix: Remove one of these dependency edges:
  - In manifest.yml, dependencies.coding-standards: remove "tdd"
  - In manifest.yml, dependencies.tdd: remove "project-structure"
  - In manifest.yml, dependencies.project-structure: remove "coding-standards"
```

**Error output (JSON mode):**
```json
{
  "success": false,
  "command": "build",
  "data": null,
  "errors": [{
    "code": "DEP_CYCLE_DETECTED",
    "message": "Circular dependency detected: coding-standards → tdd → project-structure → coding-standards",
    "cycles": [{"chain": ["coding-standards", "tdd", "project-structure", "coding-standards"]}],
    "recovery": "Remove one dependency edge in the cycle. Review manifest dependencies and prompt frontmatter depends-on fields."
  }],
  "warnings": [],
  "exit_code": 1
}
```

#### Scenario B: Dependency on nonexistent prompt

**Setup:**
```yaml
# .scaffold/prompts/security-audit.md frontmatter
---
description: Security audit
depends-on: [coding-standards, threat-model]
---
```
(`threat-model` is not in the resolved prompt set — no such prompt exists.)

**Detection**: During graph construction (Algorithm 1, Step 3), `threat-model` is not found in `nodeSet` or `excludedSlugs`.

**Error output (interactive mode):**
```
Error: Prompt "security-audit" depends on "threat-model" which is not in the resolved prompt set.

Did you mean "multi-model-review"? (Levenshtein distance: 5 — no close match)

Valid prompt slugs:
  create-prd, review-prd, innovate-prd, beads-setup, tech-stack, coding-standards,
  tdd, project-structure, dev-env-setup, git-workflow, user-stories, ...

To fix:
  - Check the depends-on field in .scaffold/prompts/security-audit.md for typos
  - If "threat-model" is a custom prompt, add it to extra-prompts in config.yml
    and create .scaffold/prompts/threat-model.md
```

**Error output (JSON mode):**
```json
{
  "success": false,
  "command": "build",
  "data": null,
  "errors": [{
    "code": "DEP_TARGET_MISSING",
    "slug": "security-audit",
    "dependency": "threat-model",
    "suggestion": null,
    "valid_slugs": ["create-prd", "review-prd", "innovate-prd", "beads-setup", "tech-stack", "..."],
    "recovery": "Fix the dependency name or add the missing prompt to extra-prompts."
  }],
  "warnings": [],
  "exit_code": 1
}
```

#### Scenario C: Dependency on excluded optional prompt

**Setup:**
```yaml
# manifest.yml
phases:
  - name: Development Environment
    prompts:
      - base:dev-env-setup
      - base:design-system
        optional: { requires: frontend }
      - base:git-workflow

dependencies:
  git-workflow: [dev-env-setup, design-system]
```

Project does not have `frontend` trait → `design-system` is excluded.

**Detection**: Domain 01 excludes `design-system` and removes it from `git-workflow`'s `dependsOn`. Domain 02 receives `git-workflow` with `dependsOn: ["dev-env-setup"]` only. Domain 02 may also see a `DEP_ON_EXCLUDED` warning (forwarded from domain 01 or regenerated).

**Warning output (interactive mode):**
```
Warning: Prompt "git-workflow" depends on "design-system" which was excluded
(optional, requires: frontend). Dependency ignored.

git-workflow will proceed with remaining dependencies: [dev-env-setup]
```

**Warning output (JSON mode):**
```json
{
  "success": true,
  "command": "build",
  "data": { "..." },
  "errors": [],
  "warnings": [{
    "code": "DEP_ON_EXCLUDED",
    "slug": "git-workflow",
    "excluded_dependency": "design-system",
    "excluded_reason": "requires: frontend",
    "action": "dependency_removed"
  }],
  "exit_code": 0
}
```

**Category**: (a) Scenario A — handled by explicit error. (b) Scenario B — handled by explicit error. (c) Scenario C — handled by design (warning, edge removed, pipeline proceeds).

### Additional Edge Cases

#### Empty dependency graph
If no prompts declare any dependencies (all `dependsOn` arrays are empty), Kahn's algorithm processes all prompts in a single parallel set, ordered by phase tiebreaker. This is valid — every prompt is eligible immediately. Unlikely in practice but handled correctly.

**Category**: (a) Handled by design.

#### Single-prompt pipeline
A methodology with only one prompt (e.g., a minimal methodology that runs only `create-prd`) produces a trivial graph with one node and no edges. Sorted order is `["create-prd"]`. Parallel sets is `[["create-prd"]]`.

**Category**: (a) Handled by design.

#### Diamond dependency pattern
```
    A
   / \
  B   C
   \ /
    D
```
D depends on both B and C. B and C both depend on A. After A completes, B and C are in the same parallel set. D becomes eligible only after both B and C complete. Kahn's algorithm handles this correctly — D's in-degree starts at 2, decremented to 1 when B completes, then to 0 when C completes (or vice versa).

**Category**: (a) Handled by design.

#### All prompts skipped except one
If the user skips all prompts except the last one, the last prompt becomes eligible because all its prerequisites are "done" (skipped). The pipeline functions correctly, though the user will likely encounter missing artifacts. Predecessor Artifact Verification (step gating) will warn about missing artifacts from skipped predecessors.

**Category**: (c) Accepted limitation — step gating provides the safety net.

---

## Section 9: Testing Considerations

### Properties to verify

1. **Topological correctness**: For every edge (A → B) in the graph, A appears before B in `sortedOrder`.
2. **Completeness**: Every prompt in the input appears exactly once in `sortedOrder` (when there are no cycles).
3. **Determinism**: Given the same input, the algorithm always produces the same `sortedOrder`. The phase tiebreaker and alphabetical secondary sort guarantee this.
4. **Cycle detection**: When cycles exist, `success` is `false` and `cycles` contains the correct chains.
5. **Missing target detection**: Dependencies on nonexistent slugs produce `DEP_TARGET_MISSING` errors.
6. **Excluded dependency handling**: Dependencies on excluded optional prompts produce warnings and are removed.
7. **Parallel set correctness**: Each parallel set contains only mutually-independent prompts (no dependency edges between them).
8. **Eligibility correctness**: `computeEligibility()` returns only prompts whose prerequisites are all completed or skipped.

### Most valuable test cases (by risk)

1. **Cycle detection with the classic methodology manifest** — use the actual manifest from the `classic` methodology. Verify no false-positive cycles. (Risk: false positive blocks the entire pipeline.)
2. **Optional prompt exclusion with dependents** — exclude `design-system`, verify `git-workflow` proceeds with remaining deps. (Risk: blocking core prompts due to optional dep exclusion.)
3. **Extra prompt injection with chain** — two extra prompts where B depends on A. Verify both appear in sorted order with correct relative positioning. (Risk: extra prompts not properly integrated.)
4. **Diamond dependency** — verify D waits for both B and C, not just one. (Risk: premature execution of a prompt.)
5. **Re-run stale downstream detection** — re-run `tech-stack`, verify that `coding-standards`, `tdd`, and `project-structure` are flagged as potentially stale. (Risk: user misses stale downstream prompts.)
6. **Phase tiebreaker determinism** — two prompts with same in-degree 0 but different phases. Verify consistent ordering across 100 runs. (Risk: non-deterministic behavior confuses users.)
7. **Self-referencing dependency** — prompt depends on itself. Verify `DEP_SELF_REFERENCE` error. (Risk: infinite loop or undefined behavior.)
8. **Empty graph** — no prompts. Verify empty `sortedOrder` and no errors. (Risk: crash on edge case.)

### Test doubles/mocks needed

- **ResolvedPrompt factory**: Create `ResolvedPrompt` records with controlled slugs, dependencies, and phase indices. No file system access needed.
- **State.json mock**: For eligibility tests, create mock prompt statuses without touching disk.
- No external dependencies to mock — the dependency resolver is a pure function over in-memory data structures.

### Property-based testing opportunities

1. **For any valid DAG**: `sortedOrder` is a valid topological ordering (property: for all edges A→B, indexOf(A) < indexOf(B)).
2. **For any input**: `sortedOrder.length + unprocessed.length == input.prompts.length` (everything is accounted for).
3. **For any input without cycles**: `sortedOrder.length == input.prompts.length` (all prompts are sorted).
4. **Determinism property**: Running the algorithm twice on the same input produces identical `sortedOrder`.
5. **Parallel set property**: For any two prompts in the same parallel set, neither depends (transitively) on the other.

### Integration test scenarios

1. **Domain 01 → Domain 02**: Feed the actual `classic` methodology through domain 01 resolution, then through domain 02 sorting. Verify the sorted order matches the expected pipeline sequence.
2. **Domain 02 → Domain 03**: Simulate a full pipeline run — resolve, sort, then step through the sorted order updating state.json statuses, verifying eligibility at each step.
3. **Domain 02 → Domain 09**: Verify that `scaffold validate` correctly reports cycle errors and missing dependency errors from domain 02.
4. **Extra prompt end-to-end**: Create an extra prompt with `depends-on` referencing a built-in prompt. Run through domain 01 + domain 02. Verify the extra prompt appears at the correct position in the sorted order.

---

## Section 10: Open Questions & Recommendations

### Open Questions

1. **Should `scaffold run --from X` auto-invalidate downstream prompts in state.json?**
   Currently, re-running X only warns about stale downstream prompts. An alternative is to reset downstream prompts' status to `"pending"` (or a new `"stale"` status) to force re-execution. This is more aggressive but prevents silently stale artifacts. The spec does not address this explicitly.

2. **Should the dependency graph support "soft" vs. "hard" dependencies?**
   Currently all dependencies are treated equally — the prerequisite must be completed or skipped. A "soft" dependency could mean "run after X if X is in the pipeline, but don't block if X is absent." This would be more expressive than the current binary (exists-as-edge or doesn't). The optional-prompt exclusion behavior is similar to soft deps but operates at build time, not runtime.

3. **What is the maximum supported pipeline size?**
   The current classic methodology has ~20 prompts. Kahn's algorithm is O(P + E) which scales trivially. But should there be a hard limit to prevent pathological cases (e.g., a custom methodology with 1000 prompts)? A validation warning at 100+ prompts might be appropriate.

4. **Should `scaffold next` differentiate between "eligible because prerequisites completed" and "eligible because prerequisites skipped"?**
   When a user skips several prompts, downstream prompts become eligible but may produce lower-quality output without their predecessors' artifacts. Showing a "prerequisites were skipped" indicator could help users make informed decisions.

### Recommendations

1. **Cache the dependency result after `scaffold build`.** Write `DependencyResult` (or its essential data: `sortedOrder`, `graph.predecessors`) to `.scaffold/dependency-cache.json`. CLI commands like `scaffold next` and `scaffold status` can read from cache instead of re-resolving. Invalidate when `config.yml` or prompt files change (via file modification time comparison).

2. **Include dependency graph visualization in `scaffold preview`.** Output a Mermaid diagram or ASCII dependency tree so users can visually inspect the pipeline structure before executing. This would help catch dependency issues early.

3. **Add a `--cascade` flag to `scaffold run --from X`.** When specified, automatically re-run all downstream prompts that were previously completed. This addresses Open Question 1 without changing the default (non-cascading) behavior.

4. **Emit the full `parallelSets` structure in `scaffold status --format json`.** This lets external tools (dashboard, CI scripts) understand which prompts are truly independent and could be parallelized with proper worktree setup.

5. **ADR CANDIDATE: Dependency union vs. replacement for custom prompts.** The current design unions `depends-on` from custom prompts with built-in dependencies. This prevents removing dependencies, which is safe but restrictive. A user who wants to *replace* a prompt's dependencies (not just add to them) must edit the manifest. An ADR should evaluate whether a `depends-on-replace` frontmatter field is warranted.

6. **ADR CANDIDATE: Runtime dependency graph mutation.** The current design treats the dependency graph as static after `scaffold build`. But `scaffold skip` and `scaffold run --from` effectively mutate the runtime semantics without changing the graph. An ADR should evaluate whether the graph should be mutable at runtime (e.g., dynamically removing edges when a prompt is skipped) or remain static with the state machine handling skip semantics.

---

## Section 11: Concrete Examples

### Example 1: Happy Path — Classic Methodology Full Resolution

**Scenario**: The `classic` methodology with a web-only project (no mobile, no multi-model CLI). `design-system` is included (frontend trait satisfied). All optional prompts excluded except `design-system` and `multi-model-review`.

**Input (relevant subset of manifest dependencies):**

```yaml
dependencies:
  create-prd: []
  review-prd: [create-prd]
  innovate-prd: [review-prd]
  beads-setup: []
  tech-stack: [beads-setup]
  claude-code-permissions: [tech-stack]
  coding-standards: [tech-stack]
  tdd: [tech-stack]
  project-structure: [coding-standards, tdd]
  dev-env-setup: [project-structure]
  design-system: [dev-env-setup]
  git-workflow: [dev-env-setup]
  user-stories: [review-prd]
  user-stories-gaps: [user-stories]
  claude-md-optimization: [git-workflow]
  workflow-audit: [claude-md-optimization]
  implementation-plan: [user-stories, project-structure]
  implementation-plan-review: [implementation-plan]
```

**Step-by-step processing:**

1. **Graph construction**: 18 nodes, 20 edges. No excluded dependencies. No missing targets. No self-references.

2. **Kahn's algorithm initialization**:
   - In-degree 0 nodes: `create-prd` (Phase 1), `beads-setup` (Phase 2)
   - Queue: `[create-prd, beads-setup]` (create-prd first by phase tiebreaker)

3. **Iteration**:

| Step | Dequeue | Parallel Set | New zero-in-degree nodes |
|------|---------|-------------|--------------------------|
| 1 | create-prd, beads-setup | [create-prd, beads-setup] | review-prd, tech-stack |
| 2 | review-prd, tech-stack | [review-prd, tech-stack] | innovate-prd, user-stories, claude-code-permissions, coding-standards, tdd |
| 3 | innovate-prd, user-stories, claude-code-permissions, coding-standards, tdd | [innovate-prd, user-stories, claude-code-permissions, coding-standards, tdd] | user-stories-gaps, project-structure |
| 4 | user-stories-gaps, project-structure | [user-stories-gaps, project-structure] | dev-env-setup, implementation-plan |
| 5 | dev-env-setup, implementation-plan | [dev-env-setup, implementation-plan] | design-system, git-workflow, implementation-plan-review |
| 6 | design-system, git-workflow, implementation-plan-review | [design-system, git-workflow, implementation-plan-review] | claude-md-optimization |
| 7 | claude-md-optimization | [claude-md-optimization] | workflow-audit |
| 8 | workflow-audit | [workflow-audit] | (none) |

4. **Final sorted order**:
```
create-prd, beads-setup, review-prd, tech-stack,
innovate-prd, claude-code-permissions, coding-standards, tdd, user-stories,
user-stories-gaps, project-structure, dev-env-setup, implementation-plan,
design-system, git-workflow, implementation-plan-review,
claude-md-optimization, workflow-audit
```

5. **Parallel sets**:
```typescript
[
  ["create-prd", "beads-setup"],
  ["review-prd", "tech-stack"],
  ["innovate-prd", "user-stories", "claude-code-permissions", "coding-standards", "tdd"],
  ["user-stories-gaps", "project-structure"],
  ["dev-env-setup", "implementation-plan"],
  ["design-system", "git-workflow", "implementation-plan-review"],
  ["claude-md-optimization"],
  ["workflow-audit"]
]
```

**Output**:
```typescript
{
  sortedOrder: ["create-prd", "beads-setup", "review-prd", ...],
  graph: { nodes: [...], edges: [...], successors: {...}, predecessors: {...}, inDegree: {...} },
  parallelSets: [["create-prd", "beads-setup"], ["review-prd", "tech-stack"], ["innovate-prd", "user-stories", "claude-code-permissions", "coding-standards", "tdd"], ...],
  warnings: [],
  errors: [],
  success: true
}
```

### Example 2: Circular Dependency Error

**Scenario**: A custom methodology accidentally introduces a circular dependency.

**Input:**
```yaml
dependencies:
  create-prd: []
  tech-stack: [coding-standards]   # ERROR: tech-stack depends on coding-standards
  coding-standards: [tdd]
  tdd: [tech-stack]                # ERROR: tdd depends on tech-stack (via coding-standards)
  project-structure: [coding-standards]
```

**Step-by-step processing:**

1. **Graph construction**: 5 nodes, 5 edges. No excluded deps. No missing targets.

2. **Kahn's algorithm initialization**:
   - In-degree 0: `create-prd` only
   - `tech-stack` has in-degree 1 (depends on `coding-standards`)
   - `coding-standards` has in-degree 1 (depends on `tdd`)
   - `tdd` has in-degree 1 (depends on `tech-stack`)
   - `project-structure` has in-degree 1 (depends on `coding-standards`)

3. **Iteration**:
   - Step 1: Dequeue `create-prd`. No successors. Queue empty.
   - Algorithm terminates with `sortedOrder = ["create-prd"]`, but 5 nodes total.
   - `sortedOrder.length (1) < graph.nodes.length (5)` → cycle detected.

4. **Cycle finding** (DFS on unprocessed: `{tech-stack, coding-standards, tdd, project-structure}`):
   - DFS from `tech-stack` → `coding-standards` → `tdd` → `tech-stack` (cycle found!)
   - Chain: `["tech-stack", "coding-standards", "tdd", "tech-stack"]`
   - `project-structure` is also unprocessed but is not part of the cycle — it's blocked by the cycle.

**Output:**
```typescript
{
  sortedOrder: ["create-prd"],  // Partial — only non-cyclic nodes
  graph: { ... },
  parallelSets: [["create-prd"]],
  warnings: [],
  errors: [{
    code: "DEP_CYCLE_DETECTED",
    message: "Circular dependency detected: tech-stack → coding-standards → tdd → tech-stack",
    cycle: { chain: ["tech-stack", "coding-standards", "tdd", "tech-stack"] },
    recovery: "Remove one dependency edge in the cycle."
  }],
  success: false
}
```

### Example 3: Extra Prompts with Optional Exclusion

**Scenario**: A project with two extra prompts (`security-audit` and `compliance-check`) and an excluded optional prompt (`add-playwright` requires `web` trait, but project is API-only).

**Input:**

Built-in resolved prompts (subset):
```typescript
[
  { slug: "create-prd", frontmatter: { dependsOn: [] }, phaseIndex: 0 },
  { slug: "coding-standards", frontmatter: { dependsOn: ["tech-stack"] }, phaseIndex: 1 },
  { slug: "project-structure", frontmatter: { dependsOn: ["coding-standards", "tdd"] }, phaseIndex: 1 },
  // ... other prompts ...
]
```

Extra prompts:
```typescript
[
  {
    slug: "security-audit",
    frontmatter: { dependsOn: ["coding-standards", "project-structure"] },
    phaseIndex: 5  // Phase 6
  },
  {
    slug: "compliance-check",
    frontmatter: { dependsOn: ["security-audit", "user-stories"] },
    phaseIndex: 5  // Phase 6
  }
]
```

Excluded slugs: `{"add-playwright"}`

Suppose `compliance-check` also had `depends-on: [add-playwright]` in its frontmatter but domain 01 already removed that dependency and emitted a warning.

**Step-by-step processing:**

1. **Graph construction**: All built-in + extra prompts as nodes. `security-audit` has edges from `coding-standards` and `project-structure`. `compliance-check` has edges from `security-audit` and `user-stories`. No missing targets. The `add-playwright` dependency was already removed by domain 01.

2. **Kahn's algorithm**: `security-audit` becomes eligible after `coding-standards` and `project-structure` complete. `compliance-check` becomes eligible after `security-audit` and `user-stories` complete.

3. **Sorted order** (relevant portion):
```
..., coding-standards, tdd, ..., project-structure, ..., user-stories, ...,
security-audit, ..., compliance-check, ...
```

4. **Warnings** (forwarded from domain 01):
```typescript
[{
  code: "DEP_ON_EXCLUDED",
  message: "Prompt \"compliance-check\" depends on \"add-playwright\" which was excluded (optional, requires: web). Dependency ignored.",
  slug: "compliance-check",
  dependencySlug: "add-playwright"
}]
```

**Output:**
```typescript
{
  sortedOrder: ["create-prd", "beads-setup", ..., "security-audit", ..., "compliance-check", ...],
  graph: { /* includes security-audit and compliance-check as nodes */ },
  parallelSets: [/* security-audit may be in a set with other phase-6 eligible prompts */],
  warnings: [{
    code: "DEP_ON_EXCLUDED",
    message: "...",
    slug: "compliance-check",
    dependencySlug: "add-playwright"
  }],
  errors: [],
  success: true
}
```

### Example 4: Runtime Eligibility After Partial Execution with Skip

**Scenario**: Pipeline is partially executed. `design-system` was skipped. Checking eligibility.

**State.json prompt statuses:**
```json
{
  "create-prd": { "status": "completed" },
  "review-prd": { "status": "completed" },
  "innovate-prd": { "status": "completed" },
  "beads-setup": { "status": "completed" },
  "tech-stack": { "status": "completed" },
  "claude-code-permissions": { "status": "completed" },
  "coding-standards": { "status": "completed" },
  "tdd": { "status": "completed" },
  "project-structure": { "status": "completed" },
  "dev-env-setup": { "status": "completed" },
  "design-system": { "status": "skipped", "reason": "No frontend needed" },
  "git-workflow": { "status": "pending" },
  "user-stories": { "status": "completed" },
  "user-stories-gaps": { "status": "pending" },
  "claude-md-optimization": { "status": "pending" },
  "workflow-audit": { "status": "pending" },
  "implementation-plan": { "status": "pending" },
  "implementation-plan-review": { "status": "pending" }
}
```

**Eligibility computation:**

- `git-workflow`: depends on `[dev-env-setup, design-system]`. `dev-env-setup` is completed. `design-system` is skipped (counts as done). **Eligible.**
- `user-stories-gaps`: depends on `[user-stories]`. `user-stories` is completed. **Eligible.**
- `implementation-plan`: depends on `[user-stories, project-structure]`. Both completed. **Eligible.**
- `claude-md-optimization`: depends on `[git-workflow]`. `git-workflow` is pending. **Blocked by git-workflow.**
- `workflow-audit`: depends on `[claude-md-optimization]`. **Blocked by claude-md-optimization.**
- `implementation-plan-review`: depends on `[implementation-plan]`. **Blocked by implementation-plan.**

**Output:**
```typescript
{
  eligible: ["git-workflow", "user-stories-gaps", "implementation-plan"],
  blocked: [
    { slug: "claude-md-optimization", blockedBy: ["git-workflow"] },
    { slug: "workflow-audit", blockedBy: ["claude-md-optimization"] },
    { slug: "implementation-plan-review", blockedBy: ["implementation-plan"] }
  ],
  completedCount: 10,
  skippedCount: 1,
  pendingCount: 6
}
```

`scaffold next` would display:
```
Next eligible prompts (3 can run in parallel):
  1. git-workflow — Configure git workflow for parallel agents
  2. implementation-plan — Create task graph from stories and standards
  3. user-stories-gaps — Gap analysis and UX innovation for user stories
```

Note: `design-system` being skipped unblocked `git-workflow`. This is the correct behavior — the user decided they don't need a design system, so the pipeline continues.
