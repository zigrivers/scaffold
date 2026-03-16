# ADR-022: Three Platform Adapters with Universal Always Generated

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 05
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v2 targets multiple AI development platforms. The v1 pipeline is tightly coupled to Claude Code — prompts reference Claude Code-specific tools, generate `commands/*.md` files with YAML frontmatter, and assume Claude Code's interaction model. V2 must support additional platforms (starting with Codex) while preserving first-class Claude Code support.

The design must address: which platforms to support at launch, how adapters interact with the core build pipeline, whether platform-specific outputs are isolated or interdependent, and whether there should always be a platform-agnostic fallback.

Domain 05 (Platform Adapter System) defines the adapter architecture as the final stage of the build pipeline: `config.yml -> Config Validation -> Prompt Resolution -> Assembly Engine -> Platform Adapters`. Each adapter receives the same assembled prompt content and produces independent output.

## Decision

Three platform adapters at launch: **Claude Code**, **Codex**, and **Universal** (plain markdown). The Universal adapter is ALWAYS generated regardless of which platforms the user selects in `config.yml`. Adapters receive assembled prompts from the assembly engine (domain 15) and produce platform-specific output files. Adapters run independently — no inter-adapter communication or shared state.

Each adapter produces distinct output:
- **Claude Code**: `commands/*.md` with YAML frontmatter (compatible with Claude Code's slash command system)
- **Codex**: `AGENTS.md` sections with condensed summaries (~500 tokens per prompt) plus `codex-prompts/*.md` with tool-name mapping applied
- **Universal**: `prompts/*.md` as plain markdown plus a `scaffold-pipeline.md` reference document showing the full pipeline sequence

## Rationale

**Universal always generated**: The Universal adapter serves as an escape hatch — if a user switches to a platform scaffold doesn't yet support (Gemini, Cursor, Windsurf, or a future tool), the plain markdown output works immediately. It also serves as the human-readable reference: anyone can open `prompts/*.md` and understand the pipeline without platform-specific tooling. Generating it always costs minimal additional build time (it is the simplest adapter — no tool mapping, no frontmatter, just markdown) while providing significant insurance against platform lock-in.

**Three adapters, not two**: Claude Code and Codex have sufficiently different conventions (YAML frontmatter vs. AGENTS.md, different tool names, different interaction models) that a single "generic" adapter cannot serve both well. The Universal adapter is not a substitute for platform-specific adapters — it provides baseline compatibility, not optimized output.

**Independent adapters**: Each adapter receives the same input and produces output without consulting other adapters. This means adding a new adapter requires zero changes to existing adapters. It also means adapters can be tested in complete isolation — a Codex adapter test does not need a Claude Code adapter to be present.

**AGENTS.md condensed summaries**: Codex's AGENTS.md serves as the top-level instruction file. Including full prompt content would make it unmanageably large. Condensed summaries (~500 tokens per prompt) provide enough context for the agent to understand the prompt's purpose, with references to the full `codex-prompts/*.md` files for detailed execution. This follows domain 05's recommendation for a two-tier Codex output structure.

## Alternatives Considered

### Single Format (Markdown Only)

- **Description**: Generate only plain markdown output. All platforms consume the same files.
- **Pros**: Simplest implementation. One output format to maintain. No adapter code at all.
- **Cons**: Loses platform-specific optimizations that measurably improve agent performance. Claude Code's slash command system with YAML frontmatter enables better prompt discovery and metadata. Codex's AGENTS.md structure enables automatic instruction loading. Generic markdown provides none of these benefits.

### Pluggable Adapter System (Community-Contributed)

- **Description**: Define a public adapter API that community members can implement to add support for new platforms.
- **Pros**: Extensible without core team effort. Community can support niche platforms.
- **Cons**: API stability burden — any adapter API change breaks community adapters. Quality control is difficult (a broken community adapter reflects poorly on scaffold). Versioning complexity. This is a valid future direction but premature for v2 launch when only two specific platforms (Claude Code, Codex) need support.

### Universal Only When Explicitly Requested

- **Description**: Only generate Universal output if the user includes "universal" in their platform configuration.
- **Pros**: Less output — users who only use Claude Code don't get extra files they may never open.
- **Cons**: Removes the safety net. A user who switches platforms mid-project must rebuild with Universal enabled. The cost of always generating Universal output is negligible (it is the simplest adapter), while the cost of not having it when needed is a full rebuild at an inconvenient time.

### Adapters Share Intermediate State

- **Description**: Adapters produce output sequentially, with each adapter able to read what previous adapters produced. For example, the Codex adapter could check the Claude Code adapter's output for consistency.
- **Pros**: Enables cross-adapter consistency checks.
- **Cons**: Creates ordering dependencies between adapters (which runs first?). Tight coupling — modifying one adapter's output format could break another adapter's expectations. The adapters produce genuinely different output for different platforms; consistency between them is not a meaningful property to enforce.

## Consequences

### Positive
- Users on Claude Code get optimized output (slash commands with frontmatter). Users on Codex get optimized output (AGENTS.md + tool mapping). All users get a markdown fallback.
- Adding a future adapter (e.g., for Gemini) requires only implementing the adapter interface — no changes to existing adapters or the build pipeline
- Universal output ensures scaffold is never a single-platform tool, even before a dedicated adapter exists for a new platform
- Each adapter can be developed, tested, and maintained independently

### Negative
- Three adapters means three sets of output files, increasing the volume of generated content in the project
- The Codex adapter requires maintaining tool-name mapping (ADR-023) and AGENTS.md summarization logic, which is more complex than the other adapters
- Users may be confused by multiple output directories (`commands/`, `codex-prompts/`, `prompts/`) — the `scaffold status` command must clearly explain which directory corresponds to which platform

### Neutral
- Navigation hints ("After This Step" sections) are derived from the dependency resolution output and injected by each adapter independently — the content is the same but the formatting varies by platform
- Platform selection in config.yml determines which adapters run (Claude Code and/or Codex), but Universal always runs regardless of selection

## Constraints and Compliance

- The Universal adapter MUST always generate output, regardless of platform selection in config.yml
- Adapters MUST NOT communicate with each other or share intermediate state
- All adapters MUST receive the same assembled prompt input from the assembly engine (domain 15). *Updated post-ADR-041: adapters receive assembled prompts from the assembly engine, not injection pipeline results.*
- The Claude Code adapter MUST produce `commands/*.md` files with valid YAML frontmatter
- The Codex adapter MUST produce `AGENTS.md` sections and `codex-prompts/*.md` files with tool-name mapping applied (ADR-023)
- The Universal adapter MUST produce `prompts/*.md` as plain markdown plus a `scaffold-pipeline.md` reference
- AGENTS.md prompt summaries MUST be condensed to approximately 500 tokens each, with references to full files
- The Universal adapter MUST strip MCP-specific references entirely (remove `<!-- scaffold:mcp-only -->` wrapped content). The Codex adapter MUST wrap MCP-specific references in HTML comments so they are preserved but invisible to the agent. The Claude Code adapter preserves MCP references as-is.
- Adding a new adapter MUST NOT require modifications to existing adapters

## Related Decisions

- [ADR-003](ADR-003-standalone-cli-source-of-truth.md) — Standalone CLI serves as the source of truth; adapters produce platform-specific projections
- [ADR-010](ADR-010-build-time-resolution.md) — Build-time resolution pipeline that feeds assembled content to adapters *(superseded by [ADR-044](ADR-044-runtime-prompt-generation.md); retained for historical context)*
- [ADR-023](ADR-023-phrase-level-tool-mapping.md) — Phrase-level tool-name mapping used by the Codex adapter
- [ADR-024](ADR-024-capabilities-as-warnings.md) — Capabilities system determines which prompt features are available on each platform
- Domain 05 ([05-platform-adapters.md](../domain-models/05-platform-adapters.md)) — Full adapter specification including input/output schemas, adapter interface, and per-platform output details
