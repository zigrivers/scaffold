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
