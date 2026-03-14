# ADR-048: Update Mode — Diff Over Regeneration

**Status:** accepted
**Date:** 2026-03-14
**Deciders:** PRD, domain modeling phase 1
**Domain(s):** 03, 15

---

## Context

Pipeline steps can be re-run after completion — when depth changes, when upstream artifacts are updated, or when the user wants to iterate. The question is what happens to existing output artifacts: does the AI regenerate from scratch (ignoring previous output), or does it receive the existing artifact and produce targeted updates?

## Decision

When a step is re-run on existing artifacts, the assembly engine enters **update mode**:

1. The existing output artifact is included in the project context section of the assembled prompt (as `ExistingArtifact` — content, completion timestamp, previous depth)
2. The meta-prompt's Mode Detection block instructs the AI to diff against current project state and propose targeted updates rather than regenerating
3. If depth increased since last execution, the assembled prompt includes depth change context (`previousDepth`, `currentDepth`, `depthIncreased: true`) so the AI knows to expand coverage
4. If depth decreased, the assembly engine emits a `DEPTH_DOWNGRADE` warning but proceeds (per Domain 16 recommendation)
5. State is updated with the new depth and timestamp on completion

Update mode is detected automatically — no CLI flag needed. If the step's output artifacts exist and the step's state is `completed`, it's update mode.

## Rationale

Diff-based updates preserve user edits and additions to artifacts while incorporating new upstream context. Full regeneration would discard manual refinements. Including the existing artifact as context lets the AI see what changed upstream and what the current artifact says, producing surgical updates. Automatic detection (no flag) means users don't need to remember whether they've run a step before.

## Alternatives Considered

1. **Always regenerate from scratch** — Simple but loses user edits.
2. **Require explicit `--update` flag** — Adds cognitive load; user must remember which steps they've run.
3. **Git-diff-based update** — Compare current vs. generated version via git; complex, requires git integration in the assembly engine.
4. **Side-by-side output** — Generate new artifact alongside existing, let user merge; doubles output files, poor UX.

## Consequences

### Positive

- Preserves user edits to artifacts
- Enables iterative refinement of pipeline output
- Automatic mode detection (no flags to remember)
- Depth upgrade path works naturally (existing artifact + higher depth = expanded output)

### Negative

- Assembled prompt is larger in update mode (includes existing artifact)
- AI must be good at diffing (quality depends on meta-prompt's Mode Detection section)
- No guarantee the AI will preserve all user edits

## Reversibility

Reversible with moderate effort. Removing update mode would mean re-runs always regenerate. Users who have relied on iterative refinement would lose accumulated edits.

## Constraints and Compliance

- The assembly engine (domain 15) MUST detect update mode by checking artifact existence and step completion status
- The `ExistingArtifact` object MUST include `previousDepth` to enable depth-aware updates
- Every meta-prompt MUST include a Mode Detection block that instructs the AI on update vs. create behavior (domain 08)
- `state.json` (domain 03) MUST record depth per step entry to support depth change detection

## Related Decisions

- [ADR-034](ADR-034-rerun-no-cascade.md) — Re-runs do not cascade; update mode is local to the re-run step
- [ADR-045](ADR-045-assembled-prompt-structure.md) — Assembled prompt context section carries the existing artifact
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Assembly engine; Algorithm 4: update mode detection
- Domain 03 ([03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md)) — State machine; records depth per step
- PRD §9 — Assembly engine specification
