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

---

## Resolution Recommendation (added by traceability gap analysis)

**Recommended decision:** Option (C) — Dual fields: `init_methodology` (original) and `config_methodology` (current, updated on each command).

**Rationale:** Dual fields support methodology change detection (F-012) without losing history. The state manager can compare `init_methodology !== config_methodology` to emit `PSM_METHODOLOGY_MISMATCH` warnings. Option (A) works but requires the state manager to read `config.yml` to determine the current methodology, coupling state reads to config reads. Option (C) keeps the state file self-describing — `config_methodology` reflects the user's current intent, `init_methodology` provides the historical baseline. This aligns with ADR-049 (methodology changeable mid-pipeline) by making the change explicitly visible in state.

**Impact if unresolved:** The state manager (T-007), methodology change detection (T-018), and the `PSM_METHODOLOGY_MISMATCH` warning logic have no spec for which field to compare. The data schema (`state-json-schema.md`) needs to know the field names.

**Blocking tasks:** T-007 (state manager), T-018 (update mode & methodology change detection)

**Recommended resolution timing:** Before starting T-007 (Phase 1). This affects the state schema, which is foundational.
