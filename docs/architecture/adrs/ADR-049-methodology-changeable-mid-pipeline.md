# ADR-049: Methodology Changeable Mid-Pipeline

**Status:** accepted
**Date:** 2026-03-14
**Deciders:** PRD, domain modeling phase 1
**Domain(s):** 03, 06, 16

---

## Context

Users may want to change methodology after starting the pipeline — starting with MVP to get to code fast, then switching to Deep for a more thorough architecture phase. Or switching from Deep to Custom to skip steps that turned out to be unnecessary. The question is whether the pipeline allows methodology changes mid-execution, and if so, what happens to already-completed steps.

## Decision

Methodology is changeable at any time by editing `config.yml`. The pipeline handles changes as follows:

1. **Completed steps are preserved.** Changing from MVP to Deep does not invalidate or re-run steps already completed at depth 1. `state.json` records what depth each step was completed at.
2. **Pending steps are re-resolved.** The methodology resolution engine (domain 16) re-computes enablement and depth for all pending steps using the new config. Previously disabled steps may become enabled; previously enabled steps may become disabled.
3. **No automatic re-runs.** The CLI does NOT automatically re-run completed steps at the new depth. It emits a `COMPLETED_AT_LOWER_DEPTH` warning for steps completed at a lower depth than the new config specifies. Users re-run explicitly with `scaffold run <step>` (which triggers update mode per ADR-048).
4. **Change detection is automatic.** The CLI compares `state.json`'s recorded methodology against `config.yml` on every command. If they differ, it emits a `METHODOLOGY_CHANGED` warning and proceeds with the `config.yml` settings (config is source of truth for current settings; state is historical record).

## Rationale

Locking users into their initial methodology choice forces premature commitment. The MVP→Deep upgrade path is a core value proposition (PRD §6). Preserving completed steps avoids wasting work. Warning instead of re-running gives users control. Config-as-source-of-truth for current settings, state-as-historical-record is a clean separation.

## Alternatives Considered

1. **Lock methodology at init** — Simple but rigid; defeats the "methodology is changeable" value prop.
2. **Auto-re-run completed steps at new depth** — Comprehensive but expensive; may re-run 10+ steps automatically.
3. **Require explicit migration command** (`scaffold migrate-methodology`) — Adds complexity, another command to learn.
4. **Allow methodology change only for pending steps** — Confusing; "I changed to Deep but completed steps are still at depth 1 and I can't re-run them."

## Consequences

### Positive

- Supports the MVP→Deep upgrade path (core value proposition)
- Preserves completed work — no wasted effort
- User stays in control of re-runs
- No surprise automatic re-runs

### Negative

- Users may not notice the depth mismatch warnings
- Completed-at-lower-depth artifacts may be inconsistent with later higher-depth artifacts
- No enforcement of depth consistency across the pipeline

## Reversibility

Easily reversible. Locking methodology would mean rejecting config changes after init. No data migration needed.

## Constraints and Compliance

- Domain 16 MUST detect methodology changes by comparing `state.json` methodology against `config.yml` methodology on every command
- Domain 16 MUST emit `METHODOLOGY_CHANGED` warning when a change is detected
- Domain 16 MUST emit `COMPLETED_AT_LOWER_DEPTH` warning for each completed step whose current config depth exceeds the depth it was completed at
- Domain 03 MUST record depth in each step's state entry
- The CLI MUST NOT automatically re-run completed steps when methodology changes
- `config.yml` is source of truth for current methodology; `state.json` records historical methodology

## Related Decisions

- [ADR-043](ADR-043-depth-scale.md) — Depth scale that methodology changes adjust
- [ADR-034](ADR-034-rerun-no-cascade.md) — Re-runs don't cascade; consistent with no auto-re-run
- [ADR-048](ADR-048-update-mode-diff-over-regeneration.md) — Update mode for manual re-runs at new depth
- Domain 16 ([16-methodology-depth-resolution.md](../domain-models/16-methodology-depth-resolution.md)) — Methodology change detection; Algorithm 5
- Domain 03 ([03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md)) — State records depth per step
- PRD §6 — Methodology system specification
