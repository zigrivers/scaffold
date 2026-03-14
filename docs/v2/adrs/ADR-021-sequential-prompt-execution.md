# ADR-021: Sequential Prompt Execution

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 02, 03
**Phase**: 2 — Architecture Decision Records

---

## Context

The scaffold pipeline's dependency graph may contain prompts with no dependency relationship between them — these could theoretically execute in parallel within a single session. For example, `coding-standards` and `tdd-standards` might have the same prerequisites and no mutual dependency, making them candidates for concurrent execution.

The question is whether the pipeline should support parallel prompt execution within a single `scaffold resume` invocation, or whether prompts should always execute one at a time with parallelism reserved for the implementation phase (where multiple agents work in separate git worktrees).

This decision interacts with the state machine design (how many prompts can be `in_progress` simultaneously), the locking mechanism (single lock vs. multi-lock), and the output model (interleaved output from multiple concurrent prompts).

## Decision

Prompts execute sequentially within a single pipeline execution. A single `scaffold resume` invocation runs one prompt at a time. Parallel execution is reserved for implementation-phase tasks via multiple worktrees and separate `scaffold` processes, not for pipeline setup prompts.

The dependency resolution algorithm identifies parallel sets (groups of prompts that could run concurrently) for informational and display purposes (e.g., the dashboard can show which prompts are unblocked simultaneously), but the runtime does not execute them in parallel.

## Rationale

**Complexity vs. benefit**: Pipeline setup prompts (phases 0-6) are primarily document-creation tasks that require AI agent interaction, user review, and iterative refinement. The wall-clock time for each prompt is dominated by the quality of the conversation, not the execution speed. Running two document-creation prompts simultaneously would produce interleaved output that is difficult to follow and review, while saving minimal real time.

**State simplicity**: Sequential execution means `in_progress` is a single nullable record in state.json, not a list. This dramatically simplifies crash recovery (ADR-018) — there is exactly one prompt to check, not N. It simplifies locking (ADR-019) — one lock per project, not one per prompt. It simplifies the output model — one prompt's output at a time, no interleaving.

**Parallelism where it matters**: The scaffold pipeline already supports parallelism where it provides the most value: during implementation (phase 7), where multiple agents work on independent tasks in separate git worktrees. Each worktree runs its own `scaffold` process with its own lock. This is the phase where tasks are numerous, independent, and benefit from concurrent execution. Pipeline setup (20-30 prompts, sequential dependencies, document creation) does not share these characteristics.

**Ordered review**: Many prompts in the pipeline build on artifacts from previous prompts (e.g., user stories build on the PRD, implementation plan builds on user stories). Even when two prompts are technically independent in the dependency graph, they often benefit from sequential execution because the user's mental model builds incrementally. Parallel execution would force context switching between unrelated document-creation tasks.

## Alternatives Considered

### Parallel Prompt Execution

- **Description**: When multiple prompts are eligible (all dependencies satisfied), execute them simultaneously in separate threads or subprocesses within a single `scaffold resume` invocation.
- **Pros**: Faster pipeline completion when independent prompts exist. Utilizes available compute more efficiently.
- **Cons**: Complex state management — `in_progress` becomes a list, crash recovery must handle N interrupted prompts, locking must coordinate N concurrent writes. Output interleaving makes review impossible in interactive mode. Concurrent AI agent conversations produce confusing UX. Error recovery becomes combinatorial (prompt A fails while B succeeds — what state should resume find?). Shared artifact conflicts (two prompts writing to the same directory simultaneously).

### Optional Parallelism (Sequential Default, --parallel Flag)

- **Description**: Execute sequentially by default but offer a `--parallel` flag that enables concurrent execution of independent prompts.
- **Pros**: User choice. Sequential by default preserves simplicity. Power users can opt in to parallelism.
- **Cons**: Must implement and maintain all the parallel execution machinery (state management, interleaved output, error recovery) even if the flag is rarely used. The flag creates a testing matrix explosion (every feature must work in both sequential and parallel modes). Feature complexity that provides marginal benefit for setup-phase prompts.

### Worker Pool (Queue of Ready Prompts, N Workers)

- **Description**: Maintain a queue of eligible prompts and dispatch them to N worker processes, similar to a build system like Make or Bazel.
- **Pros**: Maximum throughput. Familiar pattern from build tools. Clean separation between scheduling and execution.
- **Cons**: Massive overkill for 20-30 setup prompts that each take minutes of interactive AI conversation. Build systems parallelize tasks that take seconds and number in the thousands — scaffold's setup prompts are the opposite profile (few tasks, each taking minutes, requiring human attention).

## Consequences

### Positive
- `in_progress` is a simple nullable record — crash recovery checks exactly one prompt
- Locking requires a single lock per project — no per-prompt lock management
- Output is sequential and reviewable — no interleaving, no context switching
- State machine transitions are straightforward — one prompt moves from pending to in_progress to completed at a time
- Implementation is significantly simpler — no thread management, no concurrent write coordination, no output multiplexing

### Negative
- Pipeline completion is strictly sequential even when independent prompts exist — a pipeline with several independent prompts takes longer than theoretically necessary
- The dashboard may show 3-4 eligible prompts, but the user can only run one at a time (the "parallel sets" are informational only, which could be confusing)

### Neutral
- Parallel set computation in dependency resolution is retained for display purposes (dashboard, status) even though it does not drive execution behavior
- Multiple `scaffold resume` processes CAN run on the same project in separate worktrees — this is multi-process parallelism via worktrees, not within-session parallelism, and is coordinated by the locking mechanism (ADR-019)

## Constraints and Compliance

- `scaffold resume` MUST execute at most one prompt at a time within a single invocation
- The `in_progress` field in state.json MUST be a single nullable `InProgressRecord`, not a list
- Parallel set computation in dependency resolution is for informational display only — implementers MUST NOT use it to drive concurrent execution
- Implementation-phase parallelism MUST use separate worktrees and separate `scaffold` processes, coordinated by advisory locking (ADR-019)
- The state machine MUST enforce that only one prompt has status `in_progress` at any time across the entire `prompts` map
- Every prompt execution requires explicit user confirmation before proceeding. There is no unattended mode for prompt execution — even `--auto` requires the user to have initiated `scaffold resume`. This ensures the human remains in the loop for every pipeline step.

## Related Decisions

- [ADR-009](ADR-009-kahns-algorithm-dependency-resolution.md) — Dependency ordering computes parallel sets but they are informational only
- [ADR-012](ADR-012-state-file-design.md) — State file design with single in_progress record depends on sequential execution
- [ADR-018](ADR-018-completion-detection-crash-recovery.md) — Crash recovery simplified by single in_progress assumption
- [ADR-019](ADR-019-advisory-locking.md) — Locking coordinates multi-process parallelism (worktrees), not within-session parallelism
