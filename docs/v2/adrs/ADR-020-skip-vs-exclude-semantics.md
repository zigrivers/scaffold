# ADR-020: Skip vs Exclude Semantics for Optional Prompts

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: domain modeling phase 1
**Domain(s)**: 01, 02, 03
**Phase**: 2 — Architecture Decision Records

---

## Context

The scaffold pipeline contains optional prompts conditioned on project traits (e.g., `has-web-app`, `has-mobile-app`). When a prompt is absent from a user's pipeline, there are two semantically distinct reasons:

1. **Excluded**: The prompt was never included in the resolved prompt set because the project's traits didn't match the prompt's conditions. For example, `add-maestro` is excluded from a project without `has-mobile-app`.

2. **Skipped**: The prompt was included in the resolved set (its conditions were satisfied) but the user explicitly chose not to run it during execution. For example, a user with `has-web-app` might skip `add-playwright` because they prefer a different testing framework.

These two cases have different implications for the dependency graph, state tracking, and user-facing status display. The system must handle both without conflating them.

## Decision

Distinguish "skip" from "exclude" as separate concepts with different lifecycle behaviors:

- **Excluded** prompts are filtered out during prompt resolution (domain 01) based on project traits. They never enter state.json, never appear in the dependency graph, and are invisible to the runtime pipeline. Dependencies referencing excluded prompts are removed from the graph during resolution.

- **Skipped** prompts are part of the resolved prompt set and appear in state.json with status `skipped`. They appear in the dependency graph but do not block their dependents — skipped prompts are treated as "done" for dependency resolution purposes, allowing downstream prompts to proceed.

Skip is a runtime decision made during `scaffold resume` (or via `scaffold skip <prompt>`). Exclude is a build-time decision made during prompt resolution based on config.yml traits. Users cannot exclude prompts at runtime; they must change their configuration and rebuild.

## Rationale

**Semantic clarity**: Excluded and skipped represent genuinely different states with different meanings. An excluded prompt was never applicable to this project — it would be misleading to show it in status output as "skipped." A skipped prompt was applicable but consciously deferred or declined — this is useful information for team members reviewing pipeline progress ("we chose not to set up Playwright, not that we forgot").

**Skipped unblocks dependents**: If a skipped prompt blocked its dependents, the user would have no way to proceed past an optional prompt they don't want to run without removing it from the config entirely. This creates unnecessary friction. Since skipping is a deliberate user action, the system respects that choice by treating the prompt as resolved for dependency purposes.

**Build-time vs. runtime separation**: Keeping exclusion as a build-time concept and skipping as a runtime concept maintains a clean separation. The dependency graph is fully resolved at build time — the runtime only needs to track execution state (pending, in_progress, completed, skipped), not re-evaluate which prompts should be in the graph.

## Alternatives Considered

### No Distinction (All Absent Prompts Are "Skipped")

- **Description**: Treat excluded and skipped identically. All prompts that aren't in the active pipeline appear with a single "not run" status.
- **Pros**: Simpler mental model. One fewer concept for users to understand. Simpler implementation — no need to distinguish the two during resolution.
- **Cons**: Loses information. Cannot distinguish "this prompt doesn't apply to your project" from "you chose not to run this prompt." Status output would show irrelevant prompts (e.g., `add-maestro` for a web-only project) with no way to filter them. Team members reviewing pipeline state cannot tell whether a prompt was intentionally skipped or simply not applicable.

### Skipped Prompts Block Dependents

- **Description**: A skipped prompt leaves its dependents in a blocked state. The user must either run the skipped prompt or explicitly remove the dependency to proceed.
- **Pros**: Strict enforcement — ensures all dependencies are truly satisfied before proceeding. Prevents scenarios where a downstream prompt fails because a prerequisite was skipped.
- **Cons**: Prevents any forward progress if the user wants to defer or decline an optional prompt. Forces the user to either run something they don't want or manually restructure dependencies. In practice, most skippable prompts produce artifacts that are "nice to have" rather than hard requirements for their dependents.

### Allow Runtime Exclusion

- **Description**: Let users exclude prompts during `scaffold resume` in addition to skipping them. Excluded prompts would be removed from state.json and the dependency graph on the fly.
- **Pros**: Maximum flexibility — users can reshape the pipeline at runtime.
- **Cons**: Invalidates the dependency graph computed at build time. Removing a prompt from the graph at runtime could create orphaned dependencies or break the topological ordering. Would require re-running resolution during execution, blurring the build/runtime boundary and introducing significant complexity.

## Consequences

### Positive
- Status output clearly communicates why a prompt isn't in the pipeline — "not applicable" (excluded) vs. "consciously declined" (skipped)
- Skipping a prompt never blocks the pipeline — users can always make forward progress
- The dependency graph is fully determined at build time, simplifying runtime logic
- Team members can review state.json and understand the full picture of what was run, what was skipped, and what was never applicable

### Negative
- Two concepts (skip and exclude) instead of one adds to the learning curve for new users
- Skipped prompts that produce artifacts consumed by dependents may cause subtle downstream issues (e.g., a dependent prompt that references a file from the skipped prompt's `produces` list). The system warns but does not prevent this.
- Users who want to exclude a prompt at runtime must rebuild (`scaffold build` after editing config.yml), which is a heavier operation than a simple skip

### Neutral
- The `scaffold status` command must visually distinguish excluded, skipped, and pending prompts — this is a presentation concern addressed by the status display implementation, not the state model

## Constraints and Compliance

- Excluded prompts MUST NOT appear in state.json or the runtime dependency graph
- Skipped prompts MUST appear in state.json with status `skipped`
- Skipped prompts MUST unblock their dependents — they are treated as resolved for dependency computation
- The distinction between skip and exclude MUST be visible in `scaffold status` output
- Users MUST NOT be able to exclude prompts at runtime — exclusion is a build-time operation requiring config change and rebuild
- Users MUST be able to skip any prompt at runtime via `scaffold skip <prompt>` or by choosing "skip" during `scaffold resume`
- Dependencies referencing excluded prompts MUST be removed from the graph during resolution (domain 02)

## Related Decisions

- [ADR-005](ADR-005-three-layer-prompt-resolution.md) — Resolution determines which prompts are included/excluded based on traits
- [ADR-009](ADR-009-kahns-algorithm-dependency-resolution.md) — Dependency ordering handles both excluded (removed from graph) and skipped (treated as resolved) prompts
- [ADR-012](ADR-012-state-file-design.md) — State file tracks skipped prompts; excluded prompts are absent from state
