# ADR-051: Depth Downgrade Policy

**Status:** proposed
**Date:** 2026-03-14
**Deciders:** TBD
**Domain(s):** 09, 16

---

## Context

When a user re-runs a completed step at a lower depth (e.g., completed at depth 5, now configured at depth 1), should the CLI require `--force`? Domain 16, Section 10, Open Question 1.

## Options

- **(A)** Allow without `--force`, emit prominent warning (Domain 16 recommendation)
- **(B)** Require `--force` for downgrades (consistent with safety-first, but paternalistic)
- **(C)** Allow with interactive confirmation in non-auto mode

## Decision

TBD

## Rationale

TBD

## Alternatives Considered

TBD — see Options above for candidates.

## Consequences

TBD

## Constraints and Compliance

TBD

## Related Decisions

- [ADR-043](ADR-043-depth-scale.md) — Depth scale definition
- [ADR-048](ADR-048-update-mode-diff-over-regeneration.md) — Update mode triggered by re-runs
- [ADR-049](ADR-049-methodology-changeable-mid-pipeline.md) — Methodology changes that can cause depth changes
- Domain 16 ([16-methodology-depth-resolution.md](../domain-models/16-methodology-depth-resolution.md)) — Section 10, Open Question 1

---

## Resolution Recommendation (added by traceability gap analysis)

**Recommended decision:** Option (C) — Interactive confirmation for downgrades in non-auto mode; `--auto` mode proceeds with a warning.

**Rationale:** This is consistent with the `--auto` / `--force` patterns established in ADR-036 (auto does not imply force). Interactive confirmation is the least-surprise behavior — a user who explicitly lowered depth probably intends it, but confirmation catches accidental config changes. In `--auto` mode, emitting a warning (not blocking) avoids breaking automation pipelines. Option (B) is too restrictive for a common workflow (switching from deep to MVP mid-project). Option (A) is too permissive — no confirmation means accidental downgrades go unnoticed.

**Impact if unresolved:** The depth resolver (T-012) and run command (T-029) need to know whether to prompt, warn, or block on downgrades. Without this, the UX is undefined.

**Blocking tasks:** T-012 (methodology/depth resolution), T-029 (scaffold run)

**Recommended resolution timing:** Before starting T-012 (Phase 2). Low architectural impact but affects UX contract.
