# ADR-009: Kahn's Algorithm with Phase Tiebreaker for Dependency Resolution

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: domain modeling phase 1
**Domain(s)**: 02
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v2 prompts have dependency relationships declared in two places: the methodology manifest's `dependencies` section and individual prompt frontmatter `depends-on` fields. These are merged into a unified directed acyclic graph (DAG) that determines execution order. However, a topological sort of a DAG is not unique — when multiple prompts have no dependency relationship between them, any ordering among them is valid.

Users expect a stable, human-friendly ordering that groups related prompts together. If two prompts in Phase 1 ("Product Definition") and one in Phase 2 ("Technical Design") are all eligible simultaneously, users expect the Phase 1 prompts to appear first.

A secondary design question is whether the dependency graph should be mutable at runtime. `scaffold skip` and `scaffold resume --from` effectively change which prompts are considered "done," affecting which dependents become eligible. Should these operations mutate the graph structure, or should the graph remain static with the state machine handling runtime semantics?

Domain 02 (Dependency Resolution & Pipeline Ordering) explored this space, identifying the dual adjacency list representation, the tiebreaker mechanism, and the static vs. dynamic graph tradeoff (ADR CANDIDATE 6).

## Decision

Use **Kahn's algorithm** for topological sorting of the dependency graph. When multiple prompts have in-degree 0 simultaneously, dequeue from the earlier manifest phase first (phase tiebreaker). The dependency graph is **static** after `scaffold build` — no runtime mutation.

Specifically:
- The graph uses a **dual adjacency list** representation: `successors` (forward: prerequisite -> dependents) and `predecessors` (reverse: dependent -> prerequisites), both derived from the merged dependency edges (domain 02, Section 3).
- Dependency edges track their source: `manifest`, `frontmatter`, or `both` (when declared in both places).
- **Skipped prompts** unblock dependents — they are treated as "done" for in-degree computation. The state machine (domain 03) handles skip semantics; the graph itself is not modified.
- **Parallel set computation** identifies groups of prompts that are simultaneously eligible (in-degree 0 at the same iteration). This information is exposed for tooling (e.g., `scaffold status --format json`) but does not affect execution — prompts are still presented sequentially.
- **Cycle detection** is inherent: Kahn's algorithm terminates when the queue is empty. If not all nodes have been processed, the remaining nodes form one or more cycles. The algorithm reports the cycle chain for diagnostic purposes.

## Rationale

- **Kahn's algorithm has a natural tiebreaker insertion point**: During each iteration, Kahn's selects from nodes with in-degree 0. When multiple nodes qualify, the algorithm must choose one. This is the exact point where the phase tiebreaker is inserted — a priority queue ordered by `(phaseIndex, slug)` replaces the simple FIFO queue. DFS-based topological sort has no analogous insertion point; its output order depends on traversal order, which is harder to control deterministically (domain 02, Section 5, Algorithm 2).
- **Phase tiebreaker produces human-friendly ordering**: Without a tiebreaker, the output order varies with implementation details (hash map iteration order, array insertion order). With the phase tiebreaker, prompts from earlier phases consistently appear first when dependencies allow, matching user expectations. For example, "Create PRD" (Phase 1) always appears before "Tech Stack" (Phase 2) when neither depends on the other.
- **Static graph simplifies reasoning**: A mutable graph that removes edges when prompts are skipped would require recalculating in-degrees after each skip, tracking which mutations correspond to which runtime events, and ensuring mutations are reversible if a skipped prompt is later un-skipped. The static approach is simpler: the graph is computed once at build time, and the state machine evaluates eligibility by checking predecessor statuses against the fixed graph (domain 02, Section 10, ADR CANDIDATE 6). Skip semantics are "skipped counts as done" — a lookup against `state.json`, not a graph modification.
- **Dual adjacency list enables efficient eligibility checks**: At runtime, `scaffold next` needs to quickly determine which prompts are eligible. The `predecessors` map allows O(|deps|) eligibility checking per prompt by iterating the predecessor set and checking each predecessor's status in `state.json`. Without the reverse adjacency list, eligibility would require scanning all edges — O(|E|) per check (domain 02, Section 3).

## Alternatives Considered

### DFS-Based Topological Sort
- **Description**: Use depth-first search with post-order processing to produce a topological ordering. This is the textbook alternative to Kahn's algorithm.
- **Pros**: Simpler implementation (a recursive function with a visited set). Naturally produces a valid topological ordering.
- **Cons**: Output order depends on the iteration order of adjacency lists, which makes the tiebreaker harder to implement deterministically. DFS processes nodes in reverse post-order, which does not naturally group by phase. The phase tiebreaker would require sorting the adjacency lists before traversal, which couples the sort order to the graph representation. Cycle detection requires additional tracking (back-edge detection during DFS), whereas Kahn's detects cycles automatically when unprocessed nodes remain.

### Dynamic Graph Mutation at Runtime
- **Description**: When `scaffold skip` is invoked, remove the skipped prompt from the graph and recalculate in-degrees for all affected nodes. Similarly, `scaffold resume --from` would re-add edges.
- **Pros**: The graph always reflects the current "effective" state. Eligibility is derivable from in-degrees alone.
- **Cons**: Must recalculate in-degrees after each skip. Must handle the case where un-skipping a prompt requires re-adding edges, which requires storing the original graph alongside the mutated one. `scaffold resume --from` would need to "undo" previous mutations, adding undo-history complexity. The state machine already tracks prompt statuses, so eligibility checking against the static graph and status map is equivalent to dynamic mutation but simpler (domain 02, Section 10, ADR CANDIDATE 6).

### Manual Ordering (No Algorithm)
- **Description**: Methodology authors explicitly declare the full execution order in the manifest. No topological sort needed.
- **Pros**: Explicit control over prompt order. No ambiguity about which ordering will be produced.
- **Cons**: Error-prone for large pipelines — adding a prompt requires manually updating the order. Does not scale when custom prompts and extra-prompts add to the graph dynamically. Cannot detect cycles (author must mentally verify the ordering is consistent with dependencies). Methodology authors would need to manually re-derive the order whenever dependencies change.

### BFS Without Phase Tiebreaker
- **Description**: Use Kahn's algorithm with a simple FIFO queue (no priority). Process nodes in whatever order they reach in-degree 0.
- **Pros**: Simplest implementation of Kahn's — standard textbook version.
- **Cons**: Output order appears arbitrary to users. Two prompts from different phases that are both eligible might be interleaved unpredictably. The `scaffold status` display would show a confusing order that doesn't align with the phase groupings. Users would file bugs reporting "why does Tech Stack appear before Create PRD?"

## Consequences

### Positive
- Stable, deterministic ordering — same inputs always produce the same execution sequence
- Human-friendly output that groups prompts by phase when dependencies allow
- Cycle detection comes free with Kahn's algorithm — no additional implementation needed
- Parallel sets computed as a byproduct, enabling future parallel execution tooling
- Static graph enables build-time validation (`scaffold validate`) to verify the full ordering without runtime state

### Negative
- The phase tiebreaker requires a priority queue instead of a simple FIFO queue, adding implementation complexity (a min-heap keyed on phase index)
- Static graph means the `scaffold skip` command's effect is only visible through the state machine's eligibility checks, not through graph inspection — debugging "why is prompt X still blocked?" requires checking both the graph and the state
- Dual adjacency lists use more memory than a single-direction representation (though the graph is small — typically 20-40 prompts)

### Neutral
- Parallel sets are informational only — v2 does not execute prompts in parallel automatically. Parallel execution requires separate worktrees and agent coordination, which is a user-managed workflow.

## Disabled Step Handling

When a step is disabled in the active methodology preset (`enabled: false`), it is treated as satisfied for dependency resolution purposes — equivalent to a completed step from the graph's perspective. This allows presets like MVP to enable steps that transitively depend on disabled steps without triggering `DEPENDENCY_UNMET` errors. The eligibility check evaluates: `step.status === 'completed' OR step.enabled === false`. The dependency graph itself remains static and unmodified; disabled-step handling is purely an eligibility-time concern, consistent with the static graph principle described above.

## Constraints and Compliance

- Dependency resolution MUST use Kahn's algorithm with a priority queue tiebreaker ordered by `(phaseIndex, slug)` (domain 02, Section 5, Algorithm 2)
- The dependency graph MUST be represented with dual adjacency lists: `successors` and `predecessors` (domain 02, Section 3, `DependencyGraph` interface)
- Each `DependencyEdge` MUST track its source as `manifest`, `frontmatter`, or `both` (domain 02, Section 3)
- Cycle detection MUST report the specific cycle chain via the `DependencyCycle` interface (domain 02, Section 3)
- The dependency graph MUST NOT be mutated after `scaffold build` produces it. Runtime eligibility MUST be computed by checking predecessor statuses against the static graph (domain 02, Section 10, ADR CANDIDATE 6)
- Skipped prompts MUST be treated as "done" for dependency resolution — their dependents are unblocked (domain 02, Section 8, MQ3)
- Parallel sets MUST be included in the `DependencyResult` output for tooling consumption (domain 02, Section 3, `DependencyResult.parallelSets`)
- Phases are tiebreakers in Kahn's algorithm, not execution constraints. A prompt MAY execute before other prompts in an earlier phase if its dependencies are satisfied first. Phase assignment influences ordering only when multiple prompts are simultaneously eligible (in-degree 0).

## Related Decisions

- [ADR-011](ADR-011-depends-on-union-semantics.md) — Union semantics for merging dependency sources before graph construction
- [ADR-020](ADR-020-skip-vs-exclude-semantics.md) — Skip semantics affect dependency resolution (skipped prompts treated as resolved)
- ADR-021 — Sequential execution model (prompts presented one at a time despite parallel sets)
- Domain 02 ([02-dependency-resolution.md](../domain-models/02-dependency-resolution.md)) — Full dependency resolution specification
- Domain 03 ([03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md)) — State machine that evaluates eligibility against the static graph
