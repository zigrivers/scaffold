# ADR-003: Standalone CLI as Source of Truth

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 05, 09
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v2 targets multiple AI platforms: Claude Code (via plugin), Codex (via generated instruction files), and a universal markdown adapter for any other AI tool. Core logic includes prompt resolution (domain 01), dependency resolution (domain 02), pipeline state management (domain 03), mixin injection (domain 12), config validation (domain 06), and the init wizard (domain 14). This logic must produce consistent results regardless of which platform consumes the output.

The architectural question is: where does this core logic live? Options include embedding it in each platform's native extension format, building a shared library consumed by platform-specific frontends, or centralizing everything in a standalone CLI that platform integrations simply wrap.

In v1, scaffold is a Claude Code plugin with command files — tightly coupled to one platform. Extending to Codex or other tools would require reimplementing the pipeline logic in each platform's format, leading to divergent behavior and multiplicative maintenance costs.

## Decision

The standalone `scaffold` CLI contains **all** core business logic. Platform integrations (Claude Code plugin, Codex instruction generator, universal markdown adapter) are **thin wrappers** that format the CLI's output for their respective platforms. They contain no business logic of their own.

The data flow is:
1. User runs `scaffold build` (or `scaffold build --platform claude-code`)
2. CLI executes prompt resolution, mixin injection, dependency ordering, and produces an `InjectionPipelineResult` (domain 05) — a fully-resolved, mixin-injected set of prompts with metadata
3. Platform adapter receives this result and transforms it into platform-specific output format (Claude Code command files, Codex instruction markdown files, universal markdown files)
4. The adapter's transformation is purely structural (reformatting, adding platform-specific frontmatter/navigation) — it never modifies prompt content semantics

## Rationale

- **Single codebase to maintain and test**: All prompt resolution, mixin injection, dependency ordering, config validation, and state management logic exists in exactly one place. Bug fixes and feature additions propagate to all platforms automatically.
- **Platform adapters become trivially simple**: Each adapter is a format translator — it takes the `InjectionPipelineResult` (which contains fully-injected prompt content, resolved metadata, and dependency ordering) and writes it to the platform's expected file structure. Domain 05, Section 2 defines the adapter interface as a single `generate()` method that receives the pipeline result and writes output files.
- **New platforms without touching core logic**: When a new AI tool emerges, adding support requires only a new adapter implementing the `PlatformAdapter` interface (domain 05, Section 2). No changes to resolution, injection, or state management.
- **Universal fallback**: Users can always run `scaffold` directly from their terminal, regardless of platform. If a platform integration breaks or a platform is unsupported, the universal markdown adapter provides a working escape hatch.
- **Testability**: Core logic can be tested independently of any platform. Platform adapters can be tested with mock `InjectionPipelineResult` inputs, verifying only the format transformation.

## Alternatives Considered

### Plugin-first (embed logic in each platform)

- **Description**: Build the core logic into the Claude Code plugin. Create a separate Codex extension with its own implementation. Each platform has a native, tightly-integrated experience.
- **Pros**: Tightest possible platform integration. Can leverage platform-specific APIs and capabilities (Claude Code's tool-use, Codex's sandbox). No CLI installation required — just install the plugin.
- **Cons**: Business logic must be duplicated or rewritten for each platform. Bug fixes must be applied N times. Behavior divergence is inevitable as platforms evolve at different rates. Testing multiplied by number of platforms. Adding a new platform requires reimplementing all core logic.

### Shared library (npm package consumed by platform frontends)

- **Description**: Extract core logic into an npm library (`@scaffold/core`). Each platform frontend (CLI, Claude Code plugin, Codex extension) imports the library and provides its own UI/output layer.
- **Pros**: Code reuse without a CLI dependency. Each frontend can be optimized for its platform. Library can be versioned independently.
- **Cons**: Version mismatches between the library and platform frontends cause subtle bugs. Packaging complexity increases — must publish and maintain library separately. The Claude Code plugin would need to bundle the library, increasing plugin size. Testing must verify each frontend's integration with the library separately. The "shared library" approach adds abstraction without meaningful benefit over "CLI that adapters call."

### Platform-native (separate implementations per platform)

- **Description**: Build a Claude Code plugin, a Codex CLI extension, and a standalone tool as three independent projects sharing no code.
- **Pros**: Each implementation can use platform-native idioms. No cross-platform abstraction tax. Each project can evolve independently.
- **Cons**: Massive code duplication — prompt resolution, mixin injection, dependency ordering, config validation, and state management reimplemented three times. Divergent behavior is guaranteed. Maintenance cost scales linearly with platforms. No universal fallback.

## Consequences

### Positive
- One implementation to test — all core logic has a single test suite with a single set of assertions
- Consistent behavior across platforms — same inputs produce semantically identical outputs regardless of platform adapter
- New platform support is additive — implement the `PlatformAdapter` interface (domain 05) without modifying any existing code
- Users always have a working fallback — `scaffold build --platform universal` produces markdown files usable with any AI tool

### Negative
- Platform-specific optimizations are harder — core logic must remain generic across all platforms. If Claude Code supports a feature that Codex doesn't, the core logic cannot leverage it (the adapter can format output differently, but cannot change what content is produced)
- CLI must be installed even when using scaffold through a platform wrapper — the Claude Code plugin and Codex integration depend on the `scaffold` CLI being available in the user's PATH
- Adapter-only changes still require a CLI release — even if the fix is purely in adapter formatting, the monolithic CLI package must be versioned and released

### Neutral
- Platform adapter layers are very thin — primarily formatting and file-writing logic. This makes them easy to write but also means there is limited room for platform-specific enhancement within the adapter itself

## Constraints and Compliance

- All business logic MUST live in the CLI — prompt resolution, mixin injection, dependency resolution, config validation, state management, and the init wizard are CLI responsibilities
- Platform adapters may ONLY format output received from the CLI's `InjectionPipelineResult` — they MUST NOT implement custom resolution, injection, or validation logic
- Adapters receive `InjectionPipelineResult` (fully-injected prompts + resolved metadata + dependency ordering) from the CLI pipeline and transform it into platform-specific file structures
- No inter-adapter communication — adapters run independently and do not share state or call each other (domain 05, Section 7)
- The universal markdown adapter MUST always be generated alongside any platform-specific adapter, providing a fallback for unsupported platforms
- See domain 05 ([05-platform-adapters.md](../domain-models/05-platform-adapters.md)) for the `PlatformAdapter` interface, `InjectionPipelineResult` type, and adapter implementation constraints

## Related Decisions

- [ADR-001](ADR-001-cli-implementation-language.md) — Node.js as implementation language for the CLI
- [ADR-002](ADR-002-distribution-strategy.md) — npm/Homebrew distribution of the CLI package
- [ADR-022](ADR-022-three-platform-adapters.md) — Three platform adapters (Claude Code, Codex, Universal)
- Domain 05 ([05-platform-adapters.md](../domain-models/05-platform-adapters.md)) — Platform adapter architecture and InjectionPipelineResult contract
- Domain 09 ([09-cli-architecture.md](../domain-models/09-cli-architecture.md)) — CLI command architecture that hosts all business logic
