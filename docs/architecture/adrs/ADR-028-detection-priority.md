# ADR-028: Detection Priority — v1 Migration over Brownfield over Greenfield

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 07, 14
**Phase**: 2 — Architecture Decision Records

---

## Context

When `scaffold init` or `scaffold adopt` encounters an existing project, it needs to determine the project's current state to trigger the correct initialization behavior. Three modes exist: v1 migration (upgrading from scaffold v1), brownfield (existing non-scaffold project), and greenfield (new project). Each mode triggers different behavior — v1 migration maps existing artifacts to v2 prompts, brownfield adapts four prompts to work with existing code, and greenfield starts from scratch.

Incorrect detection has real consequences: treating a v1 project as greenfield discards completed work; treating a greenfield project as brownfield triggers adaptation logic that references nonexistent files. A deterministic priority order is needed so that detection is predictable and testable.

Domain 07 models the three-way mode distinction, the signal categories, and the detection algorithm. Domain 14 models how the init wizard consumes detection results to adjust the question flow.

## Decision

Detection priority is: v1 migration > brownfield > greenfield. V1-specific signals (tracking comments in v1 format, known v1 artifact paths) take highest priority. Generic brownfield signals (package manifests, source directories, CI configs) are secondary. If no signals are detected, the project is assumed to be greenfield.

Concretely:
- **v1 signals**: tracking comments with v1 format (`<!-- scaffold:<name> v<version> <date> -->` without methodology/mixin suffix), known v1 artifact paths (hardcoded `V1_ARTIFACT_MAP` mapping v1 file paths to v2 prompt slugs)
- **Brownfield signals**: package-manifest, source-directory, documentation, test-config, ci-config — each with an associated confidence level
- **Greenfield**: no signals detected — the default mode

Only four prompts change behavior in brownfield mode: `create-prd` (draft-from-existing), `tech-stack` (pre-populate-decisions), `project-structure` (document-existing), and `dev-env-setup` (discover-existing). All other prompts run identically regardless of mode.

## Rationale

**v1 signals highest priority**: A project with v1 tracking comments is definitively a scaffold v1 project — the tracking comments are machine-generated and unambiguous. Such a project also has brownfield signals (it has code, dependencies, etc.), but treating it as generic brownfield would miss the opportunity to map v1 artifacts to v2 prompt completions, saving the user from re-running prompts that have already been completed. Domain 07, Section 3 specifies the `V1_ARTIFACT_MAP` that enables this mapping.

**Brownfield over greenfield**: If a project has `package.json` with dependencies, a `src/` directory with source files, and CI configuration, it is clearly not a new project. Treating it as greenfield would generate instructions to "create a new project structure" when one already exists. The four brownfield-adapted prompts adjust their behavior to work with existing artifacts rather than creating from scratch (domain 07, Section 3).

**Only four adapted prompts**: Not every prompt needs brownfield adaptation. Prompts like `coding-standards`, `api-design`, and `data-model` produce new scaffold documents regardless of whether code already exists. Only prompts whose output directly describes the existing codebase (PRD, tech stack, project structure, dev environment) need to read existing files and adapt their output. Limiting adaptation to four prompts keeps the brownfield logic contained and testable.

**Read-only scanning for scaffold adopt**: `scaffold adopt` scans the codebase but never modifies existing files. This is critical for user trust — running `scaffold adopt` on a production codebase should be risk-free. The command produces a report and writes only to `.scaffold/` (state.json and config.yml), never touching existing project files.

**Agent-mode defaults to single when uncertain**: Agent-mode (single vs. multi-agent) cannot be reliably inferred from codebase signals — there is no file or directory that indicates whether the project was developed by one person or a team of agents. Rather than guessing wrong (multi-agent setup requires worktrees and task coordination that would confuse a solo developer), the system defaults to `single` and lets the user override.

## Alternatives Considered

### No Auto-Detection (User Declares Mode)

- **Description**: `scaffold init` asks the user "Is this a new project, an existing project, or a v1 migration?" with no automated detection.
- **Pros**: Always correct — the user knows their project's history. Simple implementation.
- **Cons**: Adds friction to initialization. Users may not know the difference between brownfield and v1 migration (they may not remember whether they used scaffold v1 or manually created similar documents). Misclassification by the user leads to the same problems as wrong auto-detection, but without recourse.

### Brownfield > v1 (Don't Distinguish v1)

- **Description**: Treat v1 projects as regular brownfield projects. No special v1 detection or artifact mapping.
- **Pros**: Simpler detection logic — one fewer mode to handle. Fewer signal categories to maintain.
- **Cons**: Misses the opportunity to pre-complete prompts from v1 artifacts. A v1 project with `docs/plan.md`, `docs/tech-stack.md`, and `docs/coding-standards.md` already has significant pipeline work done. Without v1 detection, the user would need to manually skip these prompts or re-run them unnecessarily. The `V1_ARTIFACT_MAP` enables automatic completion detection that saves significant user time.

### Interactive Detection (Ask User to Confirm)

- **Description**: Auto-detect signals but always ask the user to confirm: "I detected v1 artifacts. Is this a v1 migration? [Y/n]"
- **Pros**: Combines automation with user verification. Always correct because the user confirms.
- **Cons**: Adds an extra step to the init flow. In most cases the detection is correct and the confirmation is noise. The wizard already shows a summary before writing config (domain 14, Section 7), so the user has an opportunity to correct any detection errors.

### Aggressive Detection (Infer Everything)

- **Description**: Infer as much as possible from codebase signals — not just mode, but all mixin values, methodology, and platform targets.
- **Pros**: Minimal user input. Fast initialization.
- **Cons**: False positives cause wrong mixin selection. For example, detecting Jest doesn't necessarily mean the user wants strict TDD — they may have inherited a test setup they rarely use. Aggressive inference removes user agency from important decisions. Domain 07 limits inference to specific signals with explicit confidence levels to avoid this problem.

## Consequences

### Positive
- v1 users get automatic artifact mapping that preserves their previous work — prompts that were already completed in v1 are marked as completed in v2
- Brownfield projects get adapted prompts that work with existing code rather than ignoring it
- The priority order is deterministic and testable — given the same codebase, detection always produces the same result
- Read-only scanning means `scaffold adopt` is safe to run on any codebase without risk

### Negative
- The `V1_ARTIFACT_MAP` is hardcoded and must be maintained as v1 artifacts evolve or new v1 versions are released
- Only four prompts have brownfield adaptations — users may expect more prompts to adapt, leading to surprise when other prompts generate from scratch
- Mixin inference is limited and may produce low-confidence suggestions that the user must manually verify

### Neutral
- Detection results feed into the init wizard (domain 14) as suggestions, not decisions — the user can always override the detected mode
- The four brownfield-adapted prompts use distinct adaptation strategies (draft-from-existing, pre-populate-decisions, document-existing, discover-existing), which makes each adaptation specific but adds four different code paths to maintain

## Constraints and Compliance

- v1 detection MUST check for v1 tracking comments first (highest priority) — if v1 signals are present, the mode is v1-migration regardless of other signals
- `scaffold adopt` MUST be read-only — it MUST NOT modify existing project files, only write to `.scaffold/`
- Brownfield-adapted prompts are limited to the four defined prompts (`create-prd`, `tech-stack`, `project-structure`, `dev-env-setup`) — other prompts MUST NOT change behavior based on mode
- Agent-mode inference MUST default to `single` when confidence is not high
- Mixin inference confidence levels MUST be reported to the user in the adopt report and init wizard summary
- Artifact match quality MUST be classified as full, partial, tracking-only, or missing (domain 07, Section 3)
- Only package-manifest-with-dependencies AND source-directory are sufficient signals for brownfield detection. A README file alone is NOT a sufficient brownfield signal — many greenfield projects start with a README.
- In `--auto` mode, v1 detection requires a stronger signal than interactive mode: tracking comment presence is required, not just the existence of a `.beads/` directory. This avoids false positives in CI environments where `.beads/` may exist for other reasons.
- See domain 07, Sections 3-5 for the complete detection algorithm, artifact matching, and adaptation strategies

## Related Decisions

- [ADR-012](ADR-012-state-file-design.md) — State file pre-completion from adopt scan results
- [ADR-017](ADR-017-tracking-comments-artifact-provenance.md) — Tracking comments used for v1 detection and artifact matching
- [ADR-027](ADR-027-init-wizard-smart-suggestion.md) — Init wizard consumes detection results for mode selection and adaptive questions
- Domain 07 ([07-brownfield-adopt.md](../domain-models/07-brownfield-adopt.md)) — Full specification of brownfield detection, v1 migration, and scaffold adopt
- Domain 14 ([14-init-wizard.md](../domain-models/14-init-wizard.md)) — Wizard flow including brownfield/v1 detection triggers
