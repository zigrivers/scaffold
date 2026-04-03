# ADR-051: Depth Downgrade Policy

**Status:** accepted
**Date:** 2026-03-14
**Deciders:** PRD, domain modeling phase 1
**Domain(s):** 09, 16

---

## Context

When a user re-runs a completed step at a lower depth (e.g., completed at depth 5, now configured at depth 1), should the CLI require `--force`? Domain 16, Section 10, Open Question 1.

## Decision

Interactive confirmation for depth downgrades in non-auto mode; `--auto` mode proceeds with a warning:

1. **Interactive mode** (default): When a step's current config depth is lower than the depth it was completed at, the CLI prompts for confirmation: "Step X was completed at depth 5. Current config depth is 1. Re-run at lower depth? [y/N]". Declining aborts the step (exit 0, not an error).
2. **`--auto` mode**: The CLI emits a `DEPTH_DOWNGRADE` warning and proceeds without prompting. Automation pipelines are not blocked.
3. **`--force` mode**: Proceeds without prompting or warning.

Depth upgrades (re-running at higher depth) proceed without confirmation in all modes — this is the expected flow.

## Rationale

This is consistent with the `--auto` / `--force` separation established in ADR-036 (`--auto` suppresses prompts but does not override safety checks; `--force` overrides safety checks). Interactive confirmation is the least-surprise behavior — a user who explicitly lowered depth probably intends it, but confirmation catches accidental config changes (e.g., switching methodology from Deep to MVP without realizing it affects in-progress steps). In `--auto` mode, emitting a warning (not blocking) avoids breaking automation pipelines that may intentionally operate at varying depths.

## Alternatives Considered

1. **Allow without `--force`, emit prominent warning only** — Too permissive for interactive use. A warning scrolls past quickly; accidental downgrades go unnoticed. Users who accidentally changed methodology and didn't realize it affects depth would silently lose detail in their artifacts.
2. **Require `--force` for all downgrades** — Too restrictive. Switching from Deep to MVP mid-project is a common workflow (PRD §6 value proposition). Requiring `--force` every time adds friction to a supported use case and feels paternalistic.
3. **Block downgrades entirely** — Contradicts ADR-049 (methodology changeable mid-pipeline) and the core value proposition of methodology flexibility.

## Consequences

### Positive

- Catches accidental downgrades via confirmation prompt
- `--auto` remains non-blocking for automation pipelines
- Consistent with established `--auto`/`--force` separation (ADR-036)
- Depth upgrades are frictionless (the common and desired path)

### Negative

- Extra confirmation step for intentional downgrades in interactive mode
- Users who frequently switch between depths will see the prompt repeatedly
- Three-mode behavior (interactive/auto/force) adds UX complexity to document

## Reversibility

Easily reversible. Removing the confirmation prompt would fall back to warning-only behavior (Option A). No state migration needed — the confirmation is a UX-layer check, not a data concern.

## Constraints and Compliance

- The depth resolver (T-012) MUST compare current config depth against `state.json` recorded depth for the step
- The run command (T-029) MUST prompt for confirmation when a downgrade is detected in interactive mode
- The run command MUST emit a `DEPTH_DOWNGRADE` warning and proceed in `--auto` mode
- The run command MUST skip both prompt and warning in `--force` mode
- Depth upgrades MUST NOT trigger confirmation in any mode
- The confirmation prompt MUST show both the completed depth and current config depth

## Related Decisions

- [ADR-036](ADR-036-auto-flag-does-not-imply-force.md) — `--auto` / `--force` separation
- [ADR-043](ADR-043-depth-scale.md) — Depth scale definition (1-5)
- [ADR-048](ADR-048-update-mode-diff-over-regeneration.md) — Update mode triggered by re-runs
- [ADR-049](ADR-049-methodology-changeable-mid-pipeline.md) — Methodology changes that can cause depth changes
- Domain 16 ([16-methodology-depth-resolution.md](../domain-models/16-methodology-depth-resolution.md)) — Section 10, Open Question 1
