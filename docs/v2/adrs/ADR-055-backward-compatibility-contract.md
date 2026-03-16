# ADR-055: Backward Compatibility Contract

**Status:** accepted
**Date:** 2026-03-15
**Deciders:** PRD, validation phase
**Domain(s):** 09

---

## Context

Users need predictable upgrade behavior. Scaffold v2 introduces a new architecture (meta-prompts, runtime assembly, depth scale) that replaces v1's hard-coded prompt pipeline. No existing ADR defines what backward compatibility means as a principle — when CLI updates will break workflows, what constitutes a breaking change, or what the v1 support window is.

Without a contract, users cannot predict whether `npm update` will break their in-progress pipelines, and contributors cannot evaluate whether a proposed change requires a major version bump.

## Decision

**Follow semantic versioning (semver) strictly for the CLI package.**

### Major version (breaking)

A change is breaking if it alters observable behavior that consumers depend on:

- Removing or renaming a CLI command
- Changing exit code meanings (per ADR-025)
- Removing or renaming a required config field
- Changing state.json schema in a non-forward-compatible way
- Removing a pipeline step from a built-in methodology preset
- Changing the JSON output envelope structure (per ADR-025)
- Changing the assembled prompt section order (per ADR-045)

### Minor version (new features)

- Adding new CLI commands
- Adding new optional config fields (with defaults, per ADR-033)
- Adding new pipeline steps to methodology presets
- Adding new knowledge base entries
- New output fields in JSON envelope (consumers must ignore unknown fields per ADR-033)

### Patch version (bug fixes)

- Fixing incorrect behavior against the documented contract
- Correcting knowledge base content errors
- Fixing assembly engine bugs

### Non-versioned changes

The following are explicitly NOT breaking changes and do not require version bumps:

- Changes to assembled prompt prose (the AI-consumed output is not a stable API)
- Changes to knowledge base content quality or coverage
- Changes to meta-prompt quality criteria or methodology scaling descriptions
- Changes to interactive output formatting (only JSON output is stable)

### v1 support

No runtime v1 support. When `scaffold init` detects a v1 project (via tracking comments per ADR-028), it triggers the migration flow. v1 `config.yml` files are auto-migrated to v2 format (per ADR-014). There is no v1 compatibility mode — v1 users upgrade to v2 or continue using the v1 CLI.

## Rationale

- **Semver is industry standard** for npm packages and is expected by the Node.js ecosystem.
- **JSON output as the stable API** aligns with ADR-025's output contract. Interactive formatting can evolve freely without breaking programmatic consumers.
- **Assembled prompt content is not stable** because the entire point of the meta-prompt architecture (ADR-041) is that the AI generates working prompts dynamically. Pinning prompt output would defeat the architecture.
- **No v1 runtime compatibility** simplifies the codebase. v1 and v2 are architecturally different (hard-coded prompts vs meta-prompts), and maintaining both paths would be prohibitively complex.

## Consequences

### Positive
- Users can safely run `npm update` for minor/patch versions
- Contributors have clear criteria for evaluating breaking changes
- CI can enforce semver compliance by checking changelog entries against change categories

### Negative
- Major version bumps require migration documentation and user communication
- Knowledge base content changes (which affect output quality) are invisible to semver — users may experience quality regressions without a version signal

### Neutral
- The CLI changelog must explicitly categorize each change as breaking, feature, or fix
- Config schema version (ADR-014) increments independently of package version — a major config change always requires a major package version, but not vice versa

## Constraints and Compliance

- Package version MUST follow semver as defined above
- Breaking changes MUST be documented in the changelog with migration instructions
- The JSON output envelope (ADR-025) and exit codes (ADR-025) are the primary stable API surfaces
- Config schema version (ADR-014) and state schema version track data format compatibility independently

## Related Decisions

- [ADR-014](ADR-014-config-schema-versioning.md) — Config schema versioning (data format compatibility)
- [ADR-025](ADR-025-cli-output-contract.md) — CLI output contract (stable API surface)
- [ADR-033](ADR-033-forward-compatibility.md) — Forward compatibility (unknown fields as warnings)
- [ADR-041](ADR-041-meta-prompt-architecture.md) — Meta-prompt architecture (why assembled prompts are not stable)
