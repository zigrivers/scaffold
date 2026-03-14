# ADR-038: Prompt Versioning and Rollback Not Supported (Deferral)

**Status**: accepted (deferred — Scope & Deferral)
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 01, 05
**Phase**: 2 — Architecture Decision Records

---

## Context

As users customize prompts (via `.scaffold/prompts/` overrides or local methodology prompt files) and as the scaffold CLI evolves (with updated built-in prompts in each release), prompt content changes over time. A user who customizes the `tech-stack` prompt and later regrets the change might want to revert to the original. A user who upgrades scaffold and finds that a built-in prompt's behavior has changed might want to pin the old version.

Version control for prompt content could take many forms: per-prompt version history within scaffold, integration with the project's git history, or explicit version pinning in config.yml. Each approach adds complexity to the prompt resolution system (domain 01) and the platform adapter layer (domain 05).

The question is whether scaffold v2 should implement any form of prompt versioning, rollback, or version pinning within its own tooling.

## Decision

Scaffold v2 does not support versioning or rollback of individual prompts within its own tooling. No version history is maintained, no rollback commands exist, and no version pinning mechanism is provided for individual prompts.

To revert a prompt customization, the user deletes their override file from `.scaffold/prompts/`. The three-layer resolution system (ADR-005) will then fall through to the next layer (methodology prompt or built-in prompt), effectively reverting the customization.

To revert a built-in prompt change introduced by a CLI upgrade, the user pins the scaffold CLI version itself (e.g., via `package.json` version constraint, Homebrew formula version, or binary versioning). This is standard practice for CLI tools and does not require scaffold-specific versioning machinery.

To track the history of prompt customizations, the user relies on their project's git repository — `.scaffold/prompts/` is checked into version control, so git provides full history and rollback for customized prompts.

## Rationale

**Git already provides version history for customized prompts**: The `.scaffold/prompts/` directory is part of the project repository. Every change to a prompt override is tracked by git with full history, diff capabilities, and rollback via `git checkout`. Building a second version history system inside scaffold would duplicate functionality that git already provides, adding complexity without meaningful benefit.

**CLI version pinning is the standard approach for built-in changes**: When a user upgrades a CLI tool and finds that its behavior has changed, the standard solution is to pin the CLI version — not to version individual components within the tool. Package managers, build tools, and linters all follow this pattern. Users expect to control tool behavior through version pinning, and scaffold should follow this convention rather than inventing a novel per-prompt versioning scheme.

**Per-prompt versioning adds significant complexity**: A version history system for individual prompts would require: storage for multiple versions of each prompt, a version numbering or timestamp scheme, a `scaffold prompt history` command to view versions, a `scaffold prompt rollback` command to revert, version metadata in frontmatter or a separate registry, and conflict resolution when a customized prompt and a built-in prompt both change between versions. This is a substantial feature surface for a problem that git and CLI version pinning already solve.

**The three-layer resolution system already supports "undo"**: Deleting a file from `.scaffold/prompts/` is a clean undo operation — the prompt resolution falls through to the next layer. This is simpler and more predictable than a versioning system where the user must understand version numbers and rollback semantics. The "delete to revert" pattern is immediately understandable.

**Methodology versioning is handled separately**: ADR-032 defines methodology versioning as bundled with the scaffold CLI — each CLI version ships with specific methodology versions. Per-prompt versioning within a methodology is not needed because the methodology's prompts are versioned as a unit with the CLI.

## Alternatives Considered

### Version History Per Prompt File

- **Description**: Scaffold maintains a version history for each prompt in `.scaffold/prompt-history/`, storing previous versions with timestamps. A `scaffold prompt history <slug>` command shows the version list, and `scaffold prompt rollback <slug> <version>` restores a previous version.
- **Pros**: Users can see how a prompt evolved and revert to any previous version without leaving scaffold. Provides a safety net for prompt customization — users can experiment knowing they can roll back.
- **Cons**: Significant storage overhead — each prompt version is stored in full (or as a diff, adding diff/patch complexity). The version history must be maintained across CLI upgrades (what happens to the history when the built-in prompt changes?). Adds 2-3 new CLI commands and associated documentation. Duplicates git's version tracking capability. The marginal benefit over `git log -- .scaffold/prompts/` is small.

### Git-Based Rollback Integration

- **Description**: Scaffold provides a `scaffold prompt rollback <slug>` command that uses `git log` and `git checkout` to show the history of and restore previous versions of prompt files, wrapping git's functionality with a scaffold-specific interface.
- **Pros**: No additional storage — leverages existing git history. Consistent with the project's version control. Users don't need to know the file paths — they use prompt slugs.
- **Cons**: Requires the project to be a git repository (scaffold should work without git). Tightly couples scaffold to git (other VCS users are excluded). The command would be a thin wrapper around `git checkout` that adds little value for users who already know git. Users who don't know git would need to learn git concepts (commits, refs) to use the scaffold command effectively.

### Prompt Version Pinning in config.yml

- **Description**: `config.yml` supports a `prompt-versions` section where users can pin specific prompts to specific versions: `tech-stack: "2.1.0"`. The CLI loads the pinned version instead of the latest.
- **Pros**: Fine-grained control — different prompts can be pinned to different versions. Users can adopt new prompts selectively while keeping stable prompts pinned.
- **Cons**: Requires scaffold to ship and store multiple versions of each prompt simultaneously. Adds version resolution complexity (what if a pinned prompt depends on features from a newer prompt?). The version numbering scheme must be defined and maintained. This is over-engineering for a problem that CLI version pinning already solves at a coarser granularity.

## Consequences

### Positive
- No additional complexity in the prompt resolution system — the three-layer resolution (ADR-005) is the complete prompt lookup mechanism
- No new CLI commands or documentation for prompt versioning — the CLI surface remains small
- Users leverage familiar tools (git, package manager version pinning) for version control, reducing the learning curve
- The "delete to revert" pattern for customized prompts is simple and immediately understandable

### Negative
- Users who want to see prompt history must use git directly — there is no scaffold-specific command to show how a prompt has changed over time
- Reverting a built-in prompt change requires pinning the entire CLI version, which also pins all other built-in changes (no per-prompt granularity)
- Users who customize prompts and delete the override file lose their customization permanently (unless they have git history or a backup) — there is no "undo" buffer within scaffold

### Neutral
- This deferral is explicitly documented — future versions can add prompt versioning if user demand warrants it, without conflicting with the current design
- The three-layer resolution system (ADR-005) is compatible with future versioning — a version pinning layer could be inserted between layers without changing the existing resolution logic

## Constraints and Compliance

- Scaffold v2 MUST NOT implement per-prompt version history, rollback commands, or version pinning for individual prompts
- Deleting a file from `.scaffold/prompts/` MUST cause the prompt resolution system to fall through to the next layer (methodology or built-in) — this is the supported "revert" mechanism
- The `.scaffold/prompts/` directory SHOULD be committed to version control so that git provides history and rollback capabilities
- Built-in prompt changes MUST be managed via CLI version pinning — scaffold MUST NOT provide a mechanism to use a built-in prompt from a different CLI version
- Future implementations of prompt versioning SHOULD be additive — they SHOULD NOT require changes to the existing three-layer resolution system or config schema

## Related Decisions

- [ADR-005](ADR-005-three-layer-prompt-resolution.md) — Three-layer prompt resolution; deleting an override falls through to the next layer
- [ADR-032](ADR-032-methodology-versioning-bundled.md) — Methodology versioning is bundled with the CLI, not per-prompt
- Domain 01 ([01-prompt-resolution.md](../domain-models/01-prompt-resolution.md)) — Prompt resolution order and layer precedence
- Domain 05 ([05-platform-adapters.md](../domain-models/05-platform-adapters.md)) — Platform adapters interact with prompt resolution for platform-specific content
