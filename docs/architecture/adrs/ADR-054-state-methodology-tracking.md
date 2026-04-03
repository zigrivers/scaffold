# ADR-054: State Methodology Tracking

**Status:** accepted
**Date:** 2026-03-14
**Deciders:** PRD, domain modeling phase 1
**Domain(s):** 03, 16

---

## Context

`state.json` currently records a `methodology` field. When the user changes methodology in `config.yml`, should `state.json`'s field be updated to match, or should it remain as the originally-initialized value? Domain 16, Section 10, Open Question 2.

## Decision

Dual fields in `state.json`:

1. **`init_methodology`** — Set once at `scaffold init` time. Never updated. Records the methodology the project started with.
2. **`config_methodology`** — Updated on every CLI command to match `config.yml`'s current `methodology` value.

The state manager compares `init_methodology !== config_methodology` to detect methodology changes and emit `PSM_METHODOLOGY_MISMATCH` warnings (per ADR-049's change detection requirement).

## Rationale

Dual fields support methodology change detection without losing history. The state file remains self-describing — `config_methodology` reflects the user's current intent, `init_methodology` provides the historical baseline. The state manager can detect changes by comparing the two fields without reading `config.yml`, keeping state reads self-contained. This aligns with ADR-049 (methodology changeable mid-pipeline) by making the change explicitly visible in state, and supports the `PSM_METHODOLOGY_MISMATCH` warning logic that Domain 16 requires.

## Alternatives Considered

1. **Keep original value only; `config.yml` is source of truth for current** — The state manager must read `config.yml` to determine the current methodology, coupling state reads to config reads. Change detection requires cross-file comparison on every command. The state file is not self-describing for current methodology.
2. **Update `methodology` to match `config.yml` on every command** — Loses the historical record of what methodology the project was initialized with. Cannot detect methodology changes (the field always matches config). Eliminates the ability to show "initialized as MVP, now running as Deep" in `scaffold status` output.
3. **Single `methodology` field with a separate `methodology_history` array** — Over-engineered for the use case. Only the initial and current values matter for change detection and warnings. A full history adds schema complexity without clear benefit.

## Consequences

### Positive

- Change detection via simple field comparison (`init !== config`)
- Self-describing state — no need to read config for methodology context
- Supports `scaffold status` showing methodology history ("initialized as mvp, currently deep")
- Backward-compatible with v1 state if `init_methodology` defaults to the existing `methodology` value during migration

### Negative

- Two fields for one concept (methodology) — slight schema complexity increase
- Migration from v1 state schema required (rename `methodology` → `init_methodology`, add `config_methodology`)
- State file grows by one field (negligible size impact)

## Reversibility

Reversible with moderate effort. Collapsing to a single field would require a state migration to merge or drop one of the fields. The config.yml-as-source-of-truth principle (ADR-049) would need to be the fallback for current methodology.

## Constraints and Compliance

- The state manager (T-007) MUST set `init_methodology` at init and never update it afterward
- The state manager MUST update `config_methodology` to match `config.yml` on every CLI command that reads state
- Domain 16 MUST compare `init_methodology !== config_methodology` to emit `PSM_METHODOLOGY_MISMATCH` warnings
- The `state-json-schema.md` MUST document both fields with their update semantics
- State migration (from v1 `methodology` to dual fields) MUST be handled by the config migrator (ADR-014)

## Related Decisions

- [ADR-049](ADR-049-methodology-changeable-mid-pipeline.md) — Methodology changeability; change detection requirement
- [ADR-012](ADR-012-state-file-design.md) — State file design; field schema
- [ADR-014](ADR-014-config-yaml-versioned.md) — Config YAML versioning; migration strategy
- Domain 03 ([03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md)) — State machine; methodology tracking
- Domain 16 ([16-methodology-depth-resolution.md](../domain-models/16-methodology-depth-resolution.md)) — Section 10, Open Question 2; PSM_METHODOLOGY_MISMATCH
