# ADR-031: Community Methodology Marketplace Deferred

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 01, 04
**Phase**: 2 — Architecture Decision Records

---

## Context

As scaffold matures, community members may want to create and share custom methodologies — pipeline configurations with custom prompts, phases, and mixin collections. A marketplace or central registry could enable discovery, installation, and version management for third-party methodologies. However, building such infrastructure requires hosting, curation, security review, and ongoing maintenance.

The methodology system (ADR-004) already supports custom methodologies via local paths and npm packages. The question is whether scaffold should build a centralized discovery mechanism on top of this capability.

## Decision

Community methodology marketplace is explicitly deferred. Methodologies are shared via git repositories or npm packages. No central registry, no discovery service, no curated marketplace.

This is a scope decision — the feature is valuable but premature for Phase 1-3. The methodology manifest format (ADR-016) and local methodology support (`.scaffold/methodologies/`) provide sufficient infrastructure for early sharing.

## Rationale

**Reduces Phase 1 scope significantly**: A marketplace requires hosting infrastructure (registry server, database, CDN), a curation process (quality standards, security review, compatibility testing), versioning and compatibility management (which CLI versions work with which methodology versions), and user-facing UX (search, browse, install, update). Each of these is a project in itself. Deferring all of them lets Phase 1-3 focus on the core pipeline engine.

**Sharing via git/npm already works**: A methodology is a directory with a manifest file and prompt files. Users can share methodologies by publishing a git repository (`git clone`, then reference the local path in config) or an npm package (`npm install`, then reference the package name in config). These distribution mechanisms are well-understood, require no scaffold-specific infrastructure, and have their own versioning and discovery tools (GitHub search, npm search).

**Central registry requires quality control**: Unlike npm packages (which are general-purpose code), scaffold methodologies directly control a user's project setup workflow. A buggy methodology could generate invalid pipelines, produce broken configs, or waste hours of a user's time. A central registry implies quality responsibility — if scaffold hosts a marketplace, users expect listed methodologies to work. Building and maintaining quality review processes is a significant ongoing commitment.

**Community registries can emerge organically**: If demand materializes, community members can create "awesome-scaffold" lists, GitHub topic tags, or npm organization scopes without scaffold team involvement. Scaffold's contribution is ensuring the methodology format is well-documented and the loading mechanism supports external sources — both of which are already in scope for Phase 1-3.

**Local methodology support enables team sharing**: `.scaffold/methodologies/` in a project directory and `~/.scaffold/methodologies/` in the home directory allow teams to share methodologies via git without any registry. A team lead commits a custom methodology to the team's repo, and all team members have access. This covers the most immediate sharing use case (within a team) without infrastructure.

## Alternatives Considered

### Build Registry Now

- **Description**: Build a central registry (hosted web service) where methodology authors can publish and users can discover, search, install, and update methodologies.
- **Pros**: Ecosystem growth from day one. Discoverability attracts community contributions. Version management and compatibility checking built in. Professional appearance and user confidence.
- **Cons**: Massive scope creep — requires hosting, databases, CDN, auth, curation workflow, security review, compatibility testing, and a web frontend. Ongoing operational cost. Quality control burden (methodology reviews). Premature — the user base may be too small to sustain a marketplace in early phases.

### npm-Based Discovery (Naming Convention)

- **Description**: Use an npm naming convention (e.g., `scaffold-methodology-*` or `@scaffold/methodology-*`) for discovery. Users find methodologies via `npm search scaffold-methodology`.
- **Pros**: Leverages npm's existing search, versioning, and distribution infrastructure. No hosting required. Familiar to Node.js developers.
- **Cons**: Naming pollution — anyone can publish `scaffold-methodology-spam`. No quality signal beyond npm download counts. Search results mix scaffold methodologies with unrelated packages. No compatibility metadata (which CLI versions does this methodology support?). Scaffold has no control over what gets published under the naming convention.

### GitHub-Based (Awesome-Scaffold List)

- **Description**: Maintain a curated GitHub repository listing community methodologies, similar to "awesome-*" lists.
- **Pros**: Community-driven curation. GitHub provides discoverability via search and stars. Low maintenance — it is a markdown file.
- **Cons**: Manual curation requires ongoing volunteer effort. No installation tooling — users must manually clone repos and configure paths. No versioning or compatibility information beyond what the methodology author documents. Lists tend to go stale without active maintenance.

## Consequences

### Positive
- Phase 1-3 scope is significantly reduced — no hosting, no curation, no registry maintenance
- The methodology format is designed for portability (directory with manifest + prompts), so sharing via git/npm works without scaffold-specific tooling
- Teams can share methodologies immediately via git repositories and local paths
- No quality control burden — scaffold is not responsible for third-party methodology quality

### Negative
- Discoverability is poor — users must know where to find community methodologies (search GitHub, ask in forums, etc.)
- No standard installation command — `scaffold install-methodology <name>` does not exist, so users must manually download and configure
- Early community contributors may be discouraged by the lack of a visible sharing platform

### Neutral
- The methodology manifest format (ADR-016) is designed regardless of marketplace existence — it supports both built-in and external methodologies. Adding a registry later would use the same manifest format without changes
- npm packages can declare scaffold methodology status via `package.json` keywords, providing informal discoverability without scaffold infrastructure

## Constraints and Compliance

- Phase 1-3 implementations MUST NOT depend on a registry — all methodology loading must work with local paths and installed npm packages only
- Methodology loading MUST support local paths (`.scaffold/methodologies/`, `~/.scaffold/methodologies/`) and installed npm packages — these are the sharing mechanisms available without a registry
- The methodology manifest format (ADR-016) SHOULD accommodate future registry integration — include fields for author, description, compatibility constraints, and version that a registry could index
- Design SHOULD accommodate future registry integration without breaking existing local/npm loading mechanisms

## Related Decisions

- [ADR-004](ADR-004-methodology-as-top-level-organizer.md) — Methodology as the organizing principle that community members would extend
- [ADR-016](ADR-016-methodology-manifest-format.md) — Manifest format that enables portable methodology sharing
- [ADR-032](ADR-032-methodology-versioning-bundled.md) — Bundled versioning that simplifies the pre-marketplace phase
- Domain 01 ([01-prompt-resolution.md](../domain-models/01-prompt-resolution.md)) — Prompt resolution that loads methodologies from local and npm sources
