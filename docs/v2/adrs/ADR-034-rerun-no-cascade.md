# ADR-034: Re-runs Do Not Cascade to Downstream Prompts

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 02, 03
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold's pipeline is a directed acyclic graph of prompts with explicit `depends-on` relationships. When a user re-runs a prompt via `scaffold resume --from X`, prompt X is re-executed — but prompts downstream of X (those that transitively depend on X's output) may now be operating on stale data, since X's output has changed.

For example, if the user re-runs `tech-stack` because they changed their database decision, the `data-model` prompt (which depends on `tech-stack`) was previously executed with the old database decision and its output artifact now reflects a stale technology choice. The question is: should scaffold automatically re-run `data-model` and all other downstream prompts?

This decision has significant implications for user agency, data preservation, and the predictability of the CLI. Domain 02 (Dependency Resolution) defines the dependency graph that determines which prompts are downstream. Domain 03 (Pipeline State Machine) defines the state transitions for prompt completion and the `in_progress` lifecycle.

## Decision

When a user re-runs a prompt via `scaffold resume --from X`, only prompt X is re-executed. Downstream prompts that depend on X's output are NOT automatically re-run, even if X's output changed. Instead, scaffold emits a warning listing the downstream prompts whose inputs have changed, along with a suggested command to re-run each one.

The warning format is:
```
warning: re-running "tech-stack" may have changed outputs consumed by:
  - data-model (depends on tech-stack)
  - api-design (depends on tech-stack)
  Consider running: scaffold resume --from data-model
  Consider running: scaffold resume --from api-design
```

The `completed` status of downstream prompts is NOT invalidated — they remain marked as completed in `state.json`. The user decides whether and when to re-run them.

## Rationale

**Downstream artifacts may contain manual edits**: After a prompt executes and produces an output document, users frequently edit that document — adding details, correcting AI-generated content, or integrating feedback from stakeholders. Automatically cascading re-runs would overwrite these manual edits without warning. The user's effort invested in refining downstream artifacts would be destroyed. This is the primary reason cascading is not supported.

**User agency over automation convenience**: The decision to re-run a downstream prompt should be the user's. They may have re-run `tech-stack` to fix a minor formatting issue that does not affect downstream prompts at all. They may have changed one technology decision that affects `data-model` but not `api-design`. Only the user has the context to determine which downstream prompts actually need re-running. Scaffold should inform, not decide.

**Cascading creates unpredictable execution time**: If `tech-stack` has 6 downstream dependents, and each of those has further dependents, a cascade could trigger re-execution of the entire remaining pipeline — potentially 15-20 prompts. Each prompt execution involves an LLM call that takes minutes. A user who intended to re-run one prompt could end up waiting for an hour of cascading re-runs. This violates the principle of least surprise.

**The dependency graph is for ordering, not invalidation**: The `depends-on` relationship in scaffold means "this prompt should run after that prompt" — it defines execution order. It does NOT mean "this prompt's output is invalidated whenever that prompt's output changes." Conflating ordering dependencies with invalidation dependencies would require a more sophisticated dependency model (with distinction between hard and soft dependencies, structural vs. content dependencies) that is out of scope for v2.

## Alternatives Considered

### Cascade Re-runs to All Dependents

- **Description**: When prompt X is re-run, automatically re-run all prompts that transitively depend on X, in topological order. The user gets a fully consistent pipeline state after re-running any single prompt.
- **Pros**: Guarantees pipeline consistency — no stale artifacts exist after a re-run. Simple mental model: "re-run one prompt, everything downstream updates."
- **Cons**: Destroys manual edits in downstream artifacts without warning. Unpredictable execution time (potentially re-running the entire pipeline). Wastes LLM calls on prompts whose output would not meaningfully change. Users who re-run a prompt for a minor fix are punished with a full cascade. This was rejected as the default behavior because data loss from destroyed manual edits is worse than stale data that the user is warned about.

### Invalidate Downstream Completion Markers

- **Description**: When prompt X is re-run, mark all downstream prompts as `not_started` in `state.json`. They are not immediately re-run, but the next `scaffold resume` will re-run them because they appear incomplete. The user must opt out (via `scaffold skip`) for any prompt they don't want to re-run.
- **Pros**: Ensures the user is aware that downstream prompts need attention. Does not immediately cascade — gives the user control over timing.
- **Cons**: Annoying if the user only wanted to tweak one prompt and does not want to re-run or manually skip 6 downstream prompts. Invalidation is permanent — the user cannot "undo" the invalidation if they decide the downstream artifacts are actually fine. Forces work on the user to skip prompts they've already reviewed. The opt-out model (must skip to avoid re-running) is more burdensome than the opt-in model (must explicitly re-run to update).

### Selective Cascade with Confirmation

- **Description**: When prompt X is re-run, show the user a list of downstream prompts and ask which ones to re-run. Only cascade to the selected prompts.
- **Pros**: Combines automation with user agency. The user sees the full impact and chooses.
- **Cons**: Adds interactive friction to every re-run. In `--auto` mode, there is no user to ask — the command would need a default (which brings us back to "cascade all" or "cascade none"). The benefit over the chosen approach (warn and suggest commands) is minimal — the user can run the suggested commands in the warning output.

## Consequences

### Positive
- Manual edits in downstream artifacts are never destroyed by automated cascading — the user's work is always preserved
- Re-running a single prompt is fast and predictable — it executes exactly one prompt, regardless of the dependency graph size
- The warning message gives the user clear guidance on which downstream prompts to consider re-running, with ready-to-use commands
- The behavior is consistent with `--auto` mode — no interactive prompts are needed to determine cascade scope

### Negative
- The pipeline can be in an inconsistent state after a re-run — downstream artifacts may reference stale data from the previous execution of their predecessor
- Users who always want full consistency must manually re-run each downstream prompt, which is more work than an automatic cascade
- The warning message could be long if the re-run prompt has many transitive dependents, potentially overwhelming the user

### Neutral
- The `completed` status in `state.json` reflects that the prompt was executed and produced output — it does not guarantee that the output is consistent with the current state of all predecessor outputs
- `scaffold status` does not distinguish between "completed and consistent" and "completed but potentially stale" — both show as completed. A future enhancement could add staleness indicators, but this is not in v2 scope.

## Constraints and Compliance

- `scaffold resume --from X` MUST re-execute only prompt X — downstream prompts MUST NOT be automatically re-executed
- After re-running prompt X, scaffold MUST emit a warning listing all prompts that directly or transitively depend on X and whose inputs may have changed
- The warning MUST include suggested `scaffold resume --from <slug>` commands for each affected downstream prompt
- Downstream prompts' completion status in `state.json` MUST NOT be invalidated by re-running a predecessor
- The dependency graph traversal for identifying affected downstream prompts MUST use the same topological ordering as the execution engine (ADR-009)
- In `--auto` mode, the warning MUST still be emitted (to stderr) — `--auto` does not suppress warnings
- The warning MUST be emitted after the re-run prompt completes successfully — if the re-run fails, no downstream warning is needed

## Related Decisions

- [ADR-009](ADR-009-kahns-algorithm-dependency-resolution.md) — Dependency resolution algorithm used to identify downstream prompts
- [ADR-012](ADR-012-state-file-design.md) — State file tracks completion status that is NOT invalidated by upstream re-runs
- [ADR-021](ADR-021-sequential-prompt-execution.md) — Sequential execution model; re-runs execute a single prompt within that model
- Domain 02 ([02-dependency-resolution.md](../domain-models/02-dependency-resolution.md)) — Dependency graph definition and traversal
- Domain 03 ([03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md)) — State transitions for prompt completion and the re-run lifecycle
