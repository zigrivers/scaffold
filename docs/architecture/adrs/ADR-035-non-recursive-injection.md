# ADR-035: Mixin Injection Is Non-Recursive (Two-Pass Bounded)

**Status**: superseded (by [ADR-041](ADR-041-meta-prompt-architecture.md))
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 12
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold's mixin injection system replaces markers in base prompt templates with content from mixin files. Two types of markers exist: axis markers (`<!-- mixin:<axis-name> -->`) that inject methodology- and axis-specific content, and abstract task verb markers (`<!-- scaffold:task-* -->`) that inject task-tracking-specific instructions (e.g., how to create a task, how to mark a task complete).

A question arises when mixin content itself contains markers. For example, a `tdd-strict` mixin might contain `<!-- scaffold:task-create -->` within its injected content — should the injection engine recognize and replace that nested marker? If so, should the replacement content be scanned for further markers? This is the recursive injection question.

Domain 12 (Mixin Injection) specifies the injection algorithm, including pass ordering and marker resolution. The design must balance expressiveness (allowing mixin content to reference task verbs) with predictability (bounded execution, debuggable output).

## Decision

Mixin injection runs exactly two passes, in a fixed order:

1. **Pass 1 — Axis marker replacement**: All `<!-- mixin:<axis-name> -->` markers in the base prompt are replaced with the corresponding mixin content. This pass runs once across the entire prompt.
2. **Pass 2 — Task verb replacement**: All `<!-- scaffold:task-* -->` markers — whether in the original base prompt or in content injected during Pass 1 — are replaced with the corresponding task verb content. This pass runs once across the entire prompt (post-Pass 1 content).

After both passes, an **unresolved marker check** scans the result for any remaining `<!-- mixin:* -->` or `<!-- scaffold:task-* -->` markers. Any markers that survive both passes are errors by default, causing `scaffold build` to exit with code 1. The `--allow-unresolved-markers` flag downgrades these to warnings, allowing the build to proceed.

Mixin content that itself contains axis markers (`<!-- mixin:* -->`) does NOT trigger a recursive Pass 1. Task verb content that contains further task verb markers does NOT trigger a recursive Pass 2. The two passes are the complete injection process — no recursion, no repetition.

## Rationale

**Recursive injection creates debugging nightmares**: If mixin content can inject further mixin content, the user must trace through multiple levels of expansion to understand the final prompt. A base prompt that looks simple might expand into deeply nested content that is nearly impossible to read or debug. When something goes wrong in the final prompt, the user must reverse-engineer which level of recursion introduced the problematic content. Two passes with a clear ordering makes the expansion fully predictable — the user can mentally run the two passes to understand the result.

**Unbounded build times**: Recursive injection without a depth limit is a potential infinite loop (mixin A injects mixin B which injects mixin A). Even with a depth limit, the build time grows exponentially with depth. For a CLI tool that runs `scaffold build` frequently during development, build time must be fast and predictable. Two passes have a fixed, linear cost proportional to the prompt size.

**Two passes are sufficient for the axis + verb pattern**: The architecture has two distinct categories of markers: axis markers (methodology, platform, task-tracking, tdd, etc.) and task verb markers (create, update, close, list). The natural dependency is that mixin content (from axis injection) may reference task verbs — a TDD mixin might say "after writing the test, <!-- scaffold:task-update --> the task status." The reverse dependency (task verb content containing axis markers) does not occur in practice because task verbs are self-contained instructions about a specific task-tracking tool. Two passes in the order axis-then-verb cover the one natural dependency direction.

**Unresolved marker check catches misconfiguration**: If a prompt references a mixin axis that has no matching mixin file, or a task verb that has no matching task verb definition, the marker persists through both passes and is caught by the unresolved check. This turns a silent misconfiguration into an explicit build error. The `--allow-unresolved-markers` escape hatch exists for development workflows where mixins are being authored incrementally.

## Alternatives Considered

### Recursive Injection with Depth Limit

- **Description**: After each pass, scan the result for new markers and inject again, up to a configurable depth limit (e.g., 10 levels). If markers remain after the depth limit, treat them as errors.
- **Pros**: Maximum expressiveness — mixins can compose other mixins. Supports deeply modular prompt architectures where small mixin fragments are assembled from even smaller fragments.
- **Cons**: Debugging becomes significantly harder — the user must trace through up to N levels of expansion. Build time is unpredictable (depends on depth). The depth limit is arbitrary — too low and legitimate use cases are blocked, too high and debugging is impractical. Circular references require detection logic. The real-world use case for depth > 2 is not demonstrated — all known prompt patterns are satisfied by the two-pass model.

### Single-Pass Only

- **Description**: Run one pass that replaces all markers (both axis and task verb) simultaneously. No second pass.
- **Pros**: Simplest possible implementation. Fastest build time. Easiest to debug — one pass, one expansion.
- **Cons**: Task verb markers inside mixin content would not be resolved, because the single pass processes the original base prompt before mixin content is injected. The mixin author would need to inline task verb instructions directly in mixin content, duplicating them across every mixin that references task operations. This defeats the purpose of abstract task verbs (ADR-008), which exist specifically to decouple task instructions from mixin content.

### Explicit Dependency Declaration Between Mixins

- **Description**: Mixin files declare which other mixins they depend on (e.g., `requires: [task-beads]`), and the injection engine builds a dependency graph of mixins, injecting them in topological order.
- **Pros**: Makes dependencies explicit and debuggable. Prevents circular references at the declaration level.
- **Cons**: Significant complexity increase — mixin files become more than simple content fragments, they become components with dependency metadata. The dependency graph must be resolved before injection begins. This is over-engineering for the current use case where the only cross-reference pattern is axis content referencing task verbs.

## Consequences

### Positive
- Build output is fully predictable — given the same base prompt and mixin files, the same output is always produced, with no variation from recursion depth or ordering ambiguity
- Build time is linear in the size of the prompt and mixin content — no recursion means no exponential blowup
- Debugging is straightforward — the user traces through exactly two passes to understand the final output
- Circular references between mixins are impossible — there is no recursion to create cycles
- The unresolved marker check catches misconfiguration early, before the prompt is used in an LLM call

### Negative
- Mixin content cannot compose other mixin content — a methodology mixin cannot inject a platform-specific sub-mixin. If this pattern becomes needed, the two-pass model would need to be revisited
- The fixed pass ordering (axis then verb) means task verb content cannot contain axis-specific instructions — if a task verb definition needs to vary by methodology, the variation must be handled at the task verb content level, not via axis markers within task verb content
- Authors of mixin content must understand the two-pass model to know which markers will be resolved in their content (task verb markers: yes; axis markers: no)

### Neutral
- The `--allow-unresolved-markers` flag exists for development workflows but should not be used in production builds — it is an escape hatch, not a recommended practice
- The two-pass model is a design constraint that shapes how mixin content is authored — mixin authors must write self-contained content with only task verb markers as cross-references

## Constraints and Compliance

- Mixin injection MUST run exactly two passes: axis marker replacement (Pass 1), then task verb replacement (Pass 2)
- Pass 1 MUST process all `<!-- mixin:<axis-name> -->` markers in the base prompt, replacing each with the corresponding mixin file content
- Pass 2 MUST process all `<!-- scaffold:task-* -->` markers in the entire prompt (including content injected during Pass 1)
- Markers introduced by Pass 1 content MUST NOT trigger a recursive Pass 1 — axis markers within mixin content are left unresolved and caught by the unresolved marker check
- Markers introduced by Pass 2 content MUST NOT trigger a recursive Pass 2 — task verb markers within task verb content are left unresolved and caught by the unresolved marker check
- After both passes, an unresolved marker check MUST scan the entire result for remaining `<!-- mixin:* -->` and `<!-- scaffold:task-* -->` markers
- Unresolved markers MUST cause `scaffold build` to exit with code 1 by default
- The `--allow-unresolved-markers` flag MUST downgrade unresolved marker errors to warnings and allow the build to succeed
- The pass ordering MUST be fixed (axis then verb) — it MUST NOT be configurable or reversible

## Related Decisions

- [ADR-006](ADR-006-mixin-injection-over-templating.md) — Mixin injection chosen over templating; this ADR defines the injection algorithm's recursion bounds
- [ADR-008](ADR-008-abstract-task-verbs.md) — Abstract task verbs define the markers resolved in Pass 2
- [ADR-010](ADR-010-build-time-resolution.md) — Build-time resolution means injection happens during `scaffold build`, not at runtime
- Domain 12 ([12-mixin-injection.md](../domain-models/12-mixin-injection.md)) — Full injection algorithm specification including pass ordering, marker syntax, and error handling
