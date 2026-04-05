---
name: modding-ugc-spec
description: Specify mod API surface, packaging format, sandboxing, versioning, content moderation, and distribution channels
summary: "Specifies the modding and user-generated content system — mod API surface and capability tiers, packaging format and validation, runtime sandboxing, compatibility and versioning strategy, content moderation pipeline, and distribution channels (Steam Workshop, mod.io, local file-based) with platform certification implications."
phase: "specification"
order: 872
dependencies: [system-architecture]
outputs: [docs/modding-spec.md]
conditional: "if-needed"
reads: [game-design-document, security]
knowledge-base: [game-modding-ugc]
---

## Purpose
Specify the modding and user-generated content (UGC) system — the APIs,
packaging formats, runtime boundaries, and distribution infrastructure that
allow players and third-party creators to extend the game safely and
sustainably.

Modding support is an architectural commitment, not a feature toggle. The mod
API surface determines what creators can change (textures, levels, gameplay
rules, UI), the packaging format determines how mods are distributed and
validated, and the sandboxing model determines what damage a malicious or
buggy mod can inflict. These decisions cascade into security requirements,
platform certification constraints, and long-term versioning strategy.

Three categories of modding complexity exist, each with different engineering
costs:

1. **Asset replacement**: Swapping textures, models, audio, or localization
   strings. Lowest risk — mods cannot execute code, only replace data.
2. **Content authoring**: Creating new levels, quests, items, or game entities
   using structured data formats (JSON, YAML, custom editors). Medium risk —
   mods define data that the engine interprets, with schema validation as the
   safety boundary.
3. **Scripted mods**: Running custom logic via a scripting layer (Lua, C#,
   WASM). Highest risk — mods execute code, requiring sandboxing, resource
   limits, and capability-based permission models.

This specification must also address the tension between openness and platform
certification: console platforms restrict arbitrary code execution and require
content moderation for UGC, which constrains what modding features can ship on
each platform.

## Conditional Evaluation
Enable when: the project config indicates modding support (`hasModding` is
true) — the GDD describes mod support, workshop integration, user-generated
content, level editors, or any system allowing players to create, share, or
install content beyond the shipped game.

Skip when: the game has no modding or UGC features — players can only
experience developer-created content. Games with cosmetic customization
(character creators, paint jobs) that use built-in assets do not require a
modding specification.

## Inputs
- docs/system-architecture.md (required) — engine architecture, asset loading pipeline, scripting runtime, security boundaries
- docs/plan.md (required) — target platforms informing modding feasibility per platform (PC vs console vs mobile)
- docs/game-design.md (optional, forward-read) — moddable systems, expected mod types, community creation goals
- docs/security.md (optional, forward-read) — threat model, sandboxing requirements, anti-cheat considerations for modded game states

## Expected Outputs
- docs/modding-spec.md — mod API surface, packaging format, sandboxing model,
  versioning strategy, content moderation pipeline, and distribution channel
  integration

## Quality Criteria
- (mvp) Mod capability tiers defined: which game systems are moddable (asset replacement, content authoring, scripted logic) with explicit boundaries for each tier
- (mvp) Packaging format specified: mod manifest schema, directory structure, required metadata (name, version, author, compatibility range, permissions)
- (mvp) Runtime sandboxing model documented: what mods can and cannot access (filesystem, network, memory), resource limits (CPU time, memory allocation), and failure isolation (one mod crash does not crash the game)
- (mvp) Mod loading and conflict resolution: load order management, asset override priority, incompatible mod detection, graceful degradation when mods fail validation
- (mvp) Distribution channel integration for at least one channel: Steam Workshop, mod.io, or local file-based sideloading
- (deep) Versioning and compatibility strategy: semantic versioning for mod API, compatibility matrix (which game versions support which mod API versions), migration tooling for mod authors when API breaks
- (deep) Content moderation pipeline: automated scanning (file type validation, size limits, known-malware signatures), community reporting, manual review queue, takedown process
- (deep) Platform certification analysis: which modding features are permitted per platform (PC unrestricted, console UGC requires certification-compliant moderation, mobile requires app store policy compliance)
- (deep) Mod development toolkit: editor tools, debugging support, documentation generation, sample mods, mod template scaffolding
- (deep) Multiplayer mod compatibility: mod-matching in matchmaking (only connect players with identical mod sets), server-authoritative mod validation, anti-cheat interaction with modded game states

## Methodology Scaling
- **deep**: Full modding specification covering all three capability tiers,
  comprehensive sandboxing with capability-based permissions, multi-channel
  distribution, content moderation pipeline, platform certification analysis,
  versioning strategy with migration tooling, mod development toolkit, and
  multiplayer mod compatibility. 15-25 pages.
- **mvp**: Mod capability tiers, packaging format, basic sandboxing, single
  distribution channel, and load-order conflict resolution. 4-8 pages.
- **custom:depth(1-5)**:
  - Depth 1: asset replacement tier only with local file-based sideloading.
  - Depth 2: add content authoring tier with packaging format and manifest schema.
  - Depth 3: add scripted mod tier with sandboxing model, conflict resolution, and second distribution channel.
  - Depth 4: add content moderation pipeline, versioning strategy, platform certification analysis, and mod development toolkit.
  - Depth 5: full specification with multiplayer mod compatibility, automated mod testing infrastructure, mod analytics (install rates, crash rates, popularity), and community curation tools.

## Mode Detection
Check for docs/modding-spec.md. If it exists, operate in update mode: read
existing modding spec and diff against current system architecture and GDD
modding requirements. Preserve existing API surface definitions, packaging
format, and distribution channel integrations. Update sandboxing model if
security requirements changed. Add new capability tiers if GDD expanded
moddable systems.

## Update Mode Specifics
- **Detect prior artifact**: docs/modding-spec.md exists
- **Preserve**: mod API surface definitions, packaging format and manifest
  schema, sandboxing model, distribution channel integrations, versioning
  strategy, content moderation pipeline
- **Triggers for update**: system architecture changed asset loading or
  scripting runtime, GDD expanded or narrowed moddable systems, security
  requirements changed sandboxing constraints, target platforms changed
  (affects platform certification analysis), distribution channel added or
  removed
- **Conflict resolution**: if platform certification requirements conflict
  with desired modding features (e.g., console prohibiting scripted mods),
  document the per-platform capability matrix explicitly — never silently
  reduce PC modding capability to match console restrictions; instead, define
  platform-specific mod capability tiers with clear feature parity documentation
