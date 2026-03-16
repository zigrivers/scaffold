# ADR-012: State File Design — Map-Keyed, Committed, Atomic

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 03
**Phase**: 2 — Architecture Decision Records

---

## Context

`.scaffold/state.json` tracks pipeline progress — which steps are completed, in-progress, skipped, or pending. Three interrelated design choices affect the file's usability across sessions, teams, and crash scenarios: the data structure (map vs. array vs. per-file), the git strategy (committed vs. gitignored), and the write mechanism (atomic vs. direct).

Domain 03 (Pipeline State Machine) explores these trade-offs extensively. The central design challenge is that multiple agents may execute steps concurrently in separate worktrees, and any of them may crash mid-write. The state file must survive all of these scenarios while remaining mergeable in git and readable by agents resuming in new sessions.

ADR CANDIDATE R4 in domain 03 specifically addresses the map-keyed vs. separate-files question, noting that map-keyed provides the best balance of merge safety and operational simplicity.

## Decision

Three interrelated decisions govern the design of `.scaffold/state.json`:

1. **Map-keyed structure**: Step state entries are stored as a map keyed by step slug (`steps: { "tech-stack": {...}, "dev-env-setup": {...} }`), not as an array or as separate files per step.
2. **Committed to git**: `state.json` is tracked in version control (not gitignored), enabling cross-session and cross-team visibility.
3. **Atomic writes**: All writes use the temp-file-then-rename pattern (write to `.scaffold/state.json.tmp`, then `fs.rename()`) for crash safety.

## Rationale

**Map-keyed over arrays**: When two agents working in separate worktrees each complete a different step and merge their branches, a map-keyed structure merges cleanly — each agent modifies a different key. An array-based structure conflicts on every append because the closing bracket moves, requiring manual merge resolution for every concurrent completion. Map keys are also O(1) lookup by step slug, while arrays require O(n) scans or index management.

**Committed over gitignored**: Cross-session continuity is a core v2 requirement. When a developer starts a new Claude Code session, `scaffold run` reads `state.json` to determine which steps are complete and which are next. If state were gitignored, every new session would start blind, unable to distinguish a fresh project from one that's halfway through the pipeline. Team members also benefit from seeing pipeline state — a team lead can check which steps a colleague has completed. Git log provides a natural audit trail of state changes over time.

**Atomic writes over direct writes**: The pipeline state machine records state transitions at critical moments — when a step starts executing (`in_progress`) and when it completes. A crash during a direct `fs.writeFile` can corrupt `state.json`, leaving it with truncated JSON that no subsequent command can parse. The temp-file-then-rename pattern is atomic on POSIX systems: `fs.rename()` is a single inode operation that either succeeds completely or fails without modifying the target. This guarantees that `state.json` is always either the old valid version or the new valid version, never a partial write.

## Alternatives Considered

### Array-based state

- **Description**: Store step entries as an ordered JSON array: `steps: [{ slug: "tech-stack", status: "completed", ... }]`.
- **Pros**: Simpler schema. Natural ordering matches pipeline sequence. Easy to append.
- **Cons**: Git merge conflicts on every concurrent append (closing bracket moves). O(n) lookup by step slug. No self-describing keys — consumers must scan the array to find a specific step's status.

### One file per step

- **Description**: Store each step's state in a separate file (e.g., `.scaffold/state/tech-stack.json`, `.scaffold/state/dev-env-setup.json`).
- **Pros**: Zero merge conflicts — each step's state is an independent file. Simplest possible concurrent write story.
- **Cons**: Filesystem complexity (dozens of small files). Harder to perform atomic pipeline-level operations (reading "all step statuses" requires reading N files). The `in_progress` record — which is pipeline-global — has no natural home. Domain 03 ADR CANDIDATE R4 discusses this trade-off and concludes that the operational complexity outweighs the merge benefit.

### Gitignored state

- **Description**: Add `.scaffold/state.json` to `.gitignore`. State is local to each developer's machine.
- **Pros**: No merge conflicts ever. No noise in git history.
- **Cons**: No cross-session continuity — a new Claude Code session cannot determine pipeline progress. Team members cannot see each other's progress. No git-log audit trail. Defeats the purpose of tracking pipeline state across the project lifecycle.

### Direct writes (no temp file)

- **Description**: Write directly to `state.json` using `fs.writeFile` without an intermediate temp file.
- **Pros**: Simpler code. One fewer filesystem operation per write.
- **Cons**: A crash during `fs.writeFile` can produce truncated JSON, corrupting state.json and blocking all subsequent scaffold commands until the file is manually repaired. The cost of corruption (manual intervention, lost state) far outweighs the cost of one extra filesystem operation.

## Consequences

### Positive
- Concurrent step completions in separate worktrees merge cleanly in git without manual conflict resolution
- New sessions can resume exactly where the previous session left off by reading committed state
- Crashes cannot corrupt state.json — the file is always in a valid state
- Pipeline progress is visible to all team members via git
- O(1) step status lookup by slug

### Negative
- Map-keyed structures produce larger git diffs than arrays when many steps change simultaneously (each key-value pair is a separate diff hunk)
- **Commit ceremony overhead**: In a full 25-step pipeline, state.json generates up to 25 additional commits — one per step completion. Each requires stage, commit, and push. In multi-agent workflows with frequent rebasing, this compounds. Teams may find the state tracking commits obscure meaningful code history in `git log`.
- Atomic writes require the temp file and target file to be on the same filesystem (a constraint that `.scaffold/` being a subdirectory of the project naturally satisfies)

### Neutral
- The `next_eligible` cached field in state.json (domain 03, Section 3) is a derived value recomputed on every mutation — its presence in committed state is a convenience, not a source of truth
- Schema versioning (`schema-version` field) is orthogonal to this decision but travels with the committed file

## Reversibility

Reversible with migration tooling. Existing `state.json` files would need automated migration, and the map-keyed structure is embedded in users' git history. Any format change must be forward-compatible. Moderate effort.

## Constraints and Compliance

- State entries MUST be keyed by step slug in a `steps` map — never stored as an array
- `state.json` MUST be committed to git — it MUST NOT appear in `.gitignore`
- All writes to `state.json` MUST use the temp-file-then-rename pattern: write to `.scaffold/state.json.tmp`, then `fs.rename()` to `.scaffold/state.json`
- Four valid step statuses only: `pending`, `in_progress`, `skipped`, `completed`
- No backward state transitions except via `scaffold reset` (see domain 03, Section 4 for the state transition diagram)
- On re-run (`scaffold run --from`), old completion data for the targeted step is overwritten, not preserved alongside. The step's state entry is reset to `pending` and its previous completion metadata (timestamp, actor) is discarded.
- The `in_progress` field MUST be a single nullable record (not per-step) — at most one step can be in-progress per `state.json` file at any time. In worktree-based parallel execution, each worktree has its own `.scaffold/state.json`, so multiple steps may be in-progress across the project — but never more than one per worktree. See [ADR-019](ADR-019-advisory-locking.md) for advisory locking that coordinates concurrent access and [ADR-021](ADR-021-sequential-prompt-execution.md) for the sequential execution model within a single worktree.
- See domain 03, Section 3 for the complete `PipelineState`, `StepStateEntry`, and `InProgressRecord` type definitions

## Related Decisions

- [ADR-013](ADR-013-decision-log-jsonl-format.md) — decisions.jsonl uses similar merge-safe design principles (JSONL append-only)
- [ADR-020](ADR-020-skip-vs-exclude-semantics.md) — Skip/exclude affects state entries (skipped steps appear in state; excluded steps do not)
- [ADR-018](ADR-018-completion-detection-crash-recovery.md) — Completion detection reads state.json as the secondary signal (artifact presence is primary)
- [ADR-019](ADR-019-advisory-locking.md) — Advisory locking coordinates concurrent access to state.json
- [ADR-021](ADR-021-sequential-prompt-execution.md) — Sequential execution model within a single worktree (one in_progress record per state.json)
- Domain 03 ([03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md)) — Full state machine specification including entity model, state transitions, crash recovery, and merge semantics
