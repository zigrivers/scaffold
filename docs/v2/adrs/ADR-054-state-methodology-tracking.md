# ADR-054: State Methodology Tracking

**Status:** proposed
**Date:** 2026-03-14
**Deciders:** TBD
**Domain(s):** 03, 16

---

## Context

`state.json` currently records a `methodology` field. When the user changes methodology in `config.yml`, should `state.json`'s field be updated to match, or should it remain as the originally-initialized value? Domain 16, Section 10, Open Question 2.

## Options

- **(A)** Keep original value as historical record; `config.yml` is source of truth for current methodology (Domain 16 recommendation)
- **(B)** Update `state.json` to match `config.yml` on every command
- **(C)** Add a separate `original_methodology` field and update `methodology` to current

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

- [ADR-049](ADR-049-methodology-changeable-mid-pipeline.md) — Methodology changeability decision
- [ADR-012](ADR-012-state-file-design.md) — State file design
- Domain 03 ([03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md)) — State machine
- Domain 16 ([16-methodology-depth-resolution.md](../domain-models/16-methodology-depth-resolution.md)) — Section 10, Open Question 2
