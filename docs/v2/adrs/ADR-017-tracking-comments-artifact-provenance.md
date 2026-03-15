# ADR-017: Tracking Comments for Artifact Provenance

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec (inherited from v1), domain modeling phase 1
**Domain(s)**: 03, 07, 10
**Phase**: 2 — Architecture Decision Records

---

## Context

When prompts produce artifacts (typically markdown documents like `docs/tech-stack.md`, `docs/implementation-plan.md`, `docs/user-stories.md`), the system needs to track which prompt produced each artifact, when, and under what configuration. This provenance data serves multiple purposes: mode detection (determining whether a prompt is running for the first time or updating an existing artifact), v1 migration detection (recognizing artifacts produced by scaffold v1), completion verification (confirming that a prompt's expected outputs actually exist), and CLAUDE.md management (knowing which prompt last touched a managed section).

The mechanism inherited from v1 is an HTML comment on line 1 of each produced artifact. v2 must decide whether to continue this convention, modify it, or replace it with an alternative provenance tracking mechanism.

Domain 03 (Pipeline State Machine) uses tracking comments as part of the dual completion detection system — artifact presence is the primary signal, and tracking comments confirm scaffold provenance. Domain 07 (Brownfield/Adopt) uses tracking comments to detect v1 artifacts during migration. Domain 10 (CLAUDE.md Management) uses tracking comments to identify managed sections.

## Decision

Every produced artifact gets an **HTML comment on line 1** containing provenance metadata: prompt slug, version, date, methodology, and mixin summary. The format is:

```
<!-- scaffold:<prompt-slug> v<version> <date> <methodology> <mixin-summary> -->
```

Example:
```
<!-- scaffold:tech-stack v1 2026-03-13 deep agent-mode:single/git-workflow:simple-push -->
```

**Key design points**:
- **Line 1 position**: Universal convention — any tool can check provenance by reading a single line. No parsing of the full document required.
- **Mixin summary**: Slash-separated `axis:value` pairs summarizing the active mixin configuration at generation time.
- **v1 detection**: v1 tracking comments use the format `<!-- scaffold:<prompt-id> v<ver> <date> -->` — they include a version and date but do NOT have the methodology/mixin suffix. The presence of a v1-format tracking comment (identified by the absence of the methodology/mixin suffix) triggers v1-migration mode in domain 07. Corrected per Phase 2 review — reconciled with v1 PRD.
- **Mode detection**: If line 1 of a `produces` target contains a scaffold tracking comment, the prompt runs in "update" mode. If line 1 does not contain a tracking comment (or the file doesn't exist), the prompt runs in "fresh" mode.
- **Brownfield adoption**: `scaffold adopt` scans for tracking comments to identify existing v1 artifacts and map them to completed prompts. Critically, `scaffold adopt` does NOT write tracking comments — it is a read-only operation that populates state.json based on what it finds.
- **CLAUDE.md management**: Domain 10 uses tracking comments within CLAUDE.md to identify managed sections that scaffold may update.

## Rationale

**HTML comments for provenance**: HTML comments are invisible in rendered markdown (GitHub, VS Code preview, documentation sites) so they don't affect the user-facing content. They survive markdown processing — most markdown renderers pass HTML comments through unchanged. They're human-readable in source view — a developer inspecting a file can immediately see which prompt produced it and when. The line-1 convention makes detection trivial: `fs.readFile` the first line and regex-match against the tracking comment pattern.

**Line 1 position over embedded anywhere**: A fixed position eliminates the need to parse the entire document. The CLI reads exactly one line, checks for a match, and knows whether the file has scaffold provenance. This is O(1) regardless of document size. An embedded-anywhere approach would require scanning the full file, and could match false positives in code examples or quoted content.

**Including mixin summary**: The mixin summary records the configuration context at generation time. When a prompt updates an existing artifact, it can compare the current mixin configuration against the recorded one to detect configuration drift (e.g., the artifact was generated with `agent-mode:single` but the project has since switched to `agent-mode:multi`). Without the mixin summary, the prompt would run in update mode but wouldn't know that the configuration context has changed.

**v1 format detection**: v1 artifacts have tracking comments in the format `<!-- scaffold:<prompt-id> v<ver> <date> -->` — they include a version and date but lack the methodology and mixin summary that v2 comments append. The distinguishing signal is the absence of the methodology/mixin suffix. Rather than requiring a separate migration tool, domain 07's `scaffold adopt` detects v1-format comments during its filesystem scan and maps them to the corresponding v2 prompt slugs. This makes v1 migration a natural extension of the brownfield adoption flow.

**`scaffold adopt` as read-only**: `scaffold adopt` maps existing artifacts to pipeline state without modifying the artifacts themselves. Writing tracking comments during adopt would modify files the user hasn't reviewed, potentially causing unexpected changes in version control. The adopt operation populates state.json only — tracking comments are written when prompts actually execute (in update mode).

## Alternatives Considered

### No tracking comments (rely on state.json only)

- **Description**: Track provenance entirely through `state.json`. No modifications to produced artifacts.
- **Pros**: Cleaner artifacts — no HTML comments cluttering source files. Single source of truth for provenance.
- **Cons**: No standalone provenance — if state.json is deleted or corrupted, all provenance information is lost. Mode detection becomes impossible without state (the CLI can't distinguish "this file was produced by scaffold" from "this file was created manually"). `scaffold adopt` in a brownfield scenario has no way to recognize existing scaffold artifacts. Git history shows state.json changes but not which specific artifacts they correspond to.

### Separate provenance file

- **Description**: Maintain a `.scaffold/provenance.json` file that maps artifact paths to their provenance metadata (prompt slug, version, date, methodology).
- **Pros**: Doesn't modify artifacts at all. Structured data (JSON) enables programmatic queries. All provenance in one place.
- **Cons**: Can get out of sync with actual artifacts — if an artifact is deleted or moved, the provenance file still references the old path. Not portable — copying an artifact to another project loses its provenance. Requires the `.scaffold/` directory to be intact for any provenance query, whereas tracking comments travel with the artifact.

### Git blame for provenance

- **Description**: Use `git blame` on produced artifacts to determine which commit (and therefore which prompt) created them.
- **Pros**: Zero artifact modifications. Uses existing git infrastructure. Accurate as long as git history is intact.
- **Cons**: Unreliable after rebases, squash merges, or interactive history rewriting — all common operations in AI-assisted workflows. Requires git to be available and the repository to have history (fails on shallow clones). Slow for large repositories. Cannot distinguish "created by scaffold" from "created manually" without parsing commit messages.

## Consequences

### Positive
- Any tool can determine artifact provenance by reading a single line — O(1) detection regardless of document size
- Provenance travels with the artifact — copying a file to another project preserves its scaffold origin
- v1 migration detection is automatic — existing v1 artifacts are recognized without a separate migration tool
- Mode detection (fresh vs. update) works without state.json, providing resilience against state corruption
- Mixin summary enables configuration drift detection when updating existing artifacts

### Negative
- HTML comments on line 1 are visible in source view, adding non-content text to every produced artifact
- Tracking comments create a coupling between the CLI and artifact format — any format change requires updating the regex matcher in multiple domains (03, 07, 10)
- Artifacts produced outside scaffold (manually created markdown files) must avoid the tracking comment format on line 1 to prevent false detection
- The mixin summary format (`axis:value/axis:value`) must be kept stable across CLI versions for backward compatibility

### Neutral
- The tracking comment convention is inherited from v1, so existing v1 users are already familiar with provenance comments in their artifacts
- The format is specific enough (prefixed with `scaffold:`) that false positives in non-scaffold files are extremely unlikely

## Constraints and Compliance

- Tracking comments MUST be on line 1 of every artifact listed in a prompt's `produces` field
- The format MUST follow: `<!-- scaffold:<prompt-slug> v<version> <date> <methodology> <mixin-summary> -->`
- The mixin summary MUST use slash-separated `axis:value` pairs
- v1 tracking comment format MUST be detectable — the CLI must recognize both v1 and v2 formats
- `scaffold adopt` MUST NOT write tracking comments — it is a read-only operation that only populates state.json
- Tracking comments are written by the CLI when a prompt completes, not by the agent during prompt execution
- See domain 03, Section 4 for how tracking comments integrate with the dual completion detection mechanism
- See domain 07 for v1 tracking comment format detection and migration flow
- See domain 10 for CLAUDE.md managed section identification via tracking comments

## Related Decisions

- [ADR-012](ADR-012-state-file-design.md) — State file records prompt completion; tracking comments provide independent artifact-level provenance
- [ADR-018](ADR-018-completion-detection-crash-recovery.md) — Completion detection uses both state.json (secondary) and artifact existence with tracking comments (primary)
- [ADR-028](ADR-028-detection-priority.md) — Detection priority order when state.json and artifact presence disagree
- [ADR-029](ADR-029-prompt-structure-convention.md) — Tracking comments enable CLI-handled mode detection, replacing embedded Mode Detection blocks
- Domain 03 ([03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md)) — Dual completion detection and crash recovery
- Domain 07 ([07-brownfield-adopt.md](../domain-models/07-brownfield-adopt.md)) — v1 artifact detection and brownfield adoption flow
- Domain 10 ([10-claude-md-management.md](../domain-models/10-claude-md-management.md)) — CLAUDE.md managed section identification
