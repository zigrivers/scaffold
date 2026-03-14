# ADR-023: Phrase-Level Tool-Name Mapping for Platform Adaptation

**Status**: superseded (by [ADR-041](ADR-041-meta-prompt-architecture.md))
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 05
**Phase**: 2 — Architecture Decision Records

---

## Context

Base prompts are written with Claude Code as the reference platform, referencing Claude Code-specific tools (Read, Edit, Grep, Bash, Write) and interaction patterns ("use the Read tool to examine..."). When adapting prompts for Codex, these tool references must be translated to Codex equivalents or to platform-generic language.

A naive find-and-replace approach fails because tool names are common English words. Replacing "Read" with "read" globally would break sentences like "Read the PRD carefully" (which is an instruction to the agent, not a tool reference). The mapping must be context-aware enough to distinguish tool references from natural language.

Additionally, some prompts reference MCP (Model Context Protocol) tools that are available in Claude Code but not in Codex. These sections need graceful degradation rather than broken references.

Domain 05 (Platform Adapter System) defines the tool mapping architecture, including the phrase-level pattern approach and the MCP fallback mechanism.

## Decision

Use phrase-level patterns (not word-level replacement) for tool-name mapping. Patterns match multi-word phrases that unambiguously reference tools (e.g., "use the Read tool" rather than just "Read"). Matching is longest-first and single-pass — each position in the text is matched at most once, preventing cascading replacements. The mapping is defined in `adapters/codex/tool-map.yml`, a standalone file that can be updated without modifying adapter code.

MCP tool references are wrapped in `<!-- scaffold:mcp-only -->` HTML comments for platforms that do not support MCP. This preserves the content for MCP-capable platforms while making it invisible to platforms that would not be able to execute the instructions.

Interaction-style differences (e.g., Claude Code's subagent delegation patterns vs. Codex's autonomous execution model) are handled by a separate interaction-style mixin, not by tool mapping. Tool mapping addresses surface-level name translation; interaction-style mixins address structural behavioral differences.

## Rationale

**Phrase-level over word-level**: The phrase "use the Read tool" is an unambiguous tool reference — "Read" alone is not. Phrase-level patterns eliminate false positives by requiring surrounding context that distinguishes tool references from natural language. The mapping "use the Read tool" -> "read the file" is grammatically correct in context; the mapping "Read" -> "read" would produce "read the PRD carefully" from "Read the PRD carefully" (correct by accident) but also "use the read tool" from "use the Read tool" (grammatically broken and semantically wrong — Codex doesn't have a "read tool").

**Longest-match-first**: Without longest-first ordering, a shorter pattern could match before a longer, more specific pattern. For example, if "Edit" matched before "use the Edit tool to modify", the longer pattern would never fire and the replacement would be less precise. Longest-first ensures the most specific pattern wins.

**Single-pass (no cascading)**: If replacements could trigger further replacements, the output would be unpredictable. A replacement that produces text matching another pattern would cascade, potentially producing nonsensical output or entering an infinite loop. Single-pass guarantees that replacement text is final — it is never re-scanned for further matches.

**Separate file (tool-map.yml)**: The tool mapping is a data artifact, not logic. Storing it in a YAML file makes it easy to review, update, and regression-test without touching adapter code. A new tool name or a revised phrase pattern requires only a YAML edit and a test update, not a code change.

**MCP content wrapping over removal**: Wrapping MCP-specific content in HTML comments (rather than removing it) means the content is preserved in the source and can be "unwrapped" if a platform gains MCP support. It also means the Universal adapter's output includes the full content (HTML comments are invisible in rendered markdown), providing a complete reference even for MCP sections.

## Alternatives Considered

### Word-Level Replacement (Simple Find/Replace)

- **Description**: Replace individual tool names: "Read" -> "read_file", "Edit" -> "edit_file", "Grep" -> "search".
- **Pros**: Simplest implementation. Easy to understand the mapping.
- **Cons**: Grammatically broken output. "Use the Read tool to examine the file" becomes "Use the read_file tool to examine the file" — but Codex doesn't have a "read_file tool," it reads files implicitly. "Read the requirements" becomes "read_file the requirements" — pure nonsense. Tool names as common English words make word-level replacement fundamentally unsafe.

### Regex-Based Replacement

- **Description**: Use regular expressions to match tool references in context (e.g., `/\b(use|with|via)\s+the\s+(Read|Edit|Grep)\s+tool/`).
- **Pros**: Powerful pattern matching. Can handle many contextual variations.
- **Cons**: Brittle — regex patterns that work for current prompts break when prompt language changes slightly. Hard to maintain as a mapping file (regex syntax is not accessible to non-developers). Debugging regex replacement order and interaction is notoriously difficult. Domain 05 notes that regex approaches were considered and rejected in favor of simpler phrase-level patterns.

### Separate Prompt Variants Per Platform

- **Description**: Maintain separate versions of each prompt for each platform — `base/tech-stack.claude.md`, `base/tech-stack.codex.md`.
- **Pros**: Perfect output for each platform. No mapping or translation needed. Each variant can be hand-tuned.
- **Cons**: Content duplication across variants. Every edit to a prompt must be replicated to all variants. N prompts x M platforms = N*M files to maintain. Bug fixes and improvements must be applied everywhere. This approach was explicitly rejected by the v2 spec in favor of single-source prompts with adapter transformation.

### No Mapping (Platform-Generic Language)

- **Description**: Write all base prompts in platform-generic language that works on any tool. Never reference specific tool names.
- **Pros**: No adapter transformation needed. Prompts work everywhere as-is.
- **Cons**: Prompts lose platform-specific guidance that measurably improves agent performance. "Read the file to understand the codebase" is weaker than "use the Read tool to examine src/index.ts — Read is faster than Bash for single files" (Claude Code) or "examine src/index.ts using file read operations" (Codex). Platform-specific guidance helps agents use their tools effectively.

## Consequences

### Positive
- Tool references are translated correctly in context, producing grammatically correct and semantically meaningful output for each platform
- The tool-map.yml file is a reviewable, testable data artifact — changes to tool mapping do not require code changes
- MCP-specific content is preserved (not destroyed) for platforms that support it, and gracefully hidden for platforms that don't
- Interaction-style differences are cleanly separated from surface-level tool name translation

### Negative
- Phrase-level patterns may miss novel phrasings not covered by the mapping (e.g., a new prompt that says "leverage Read" instead of "use the Read tool"). Requires ongoing maintenance of tool-map.yml as prompts evolve.
- Longest-first matching adds computational complexity compared to simple replacement (must sort patterns by length and scan the text for each). This is negligible for the volume of text in scaffold prompts but is a real implementation consideration.
- The MCP comment wrapping approach means Codex output contains HTML comments that are invisible but present — tools that process raw markdown (not rendered) will see them.

### Neutral
- tool-map.yml must be regression-tested — any change to the mapping requires verifying that all existing prompts still produce correct output. This is a maintenance cost but also a quality guarantee.
- The separation between tool mapping (surface-level names) and interaction-style mixin (behavioral patterns) means two transformation passes on prompts destined for non-Claude-Code platforms.

## Constraints and Compliance

- Tool mapping MUST use phrase-level patterns, not single-word replacements
- Pattern matching MUST be longest-first — longer patterns take priority over shorter ones
- Replacement MUST be single-pass — replacement text is never re-scanned for further pattern matches
- MCP-only content MUST be wrapped in `<!-- scaffold:mcp-only -->` HTML comments for platforms that do not support MCP
- `adapters/codex/tool-map.yml` MUST be maintained as a regression-tested artifact — changes require test verification
- Tool mapping (name translation) MUST be separate from interaction-style mixin (behavioral adaptation) — they are distinct transformation concerns
- Tool-name mapping (platform adapters) is applied AFTER mixin injection, not before. The adapter sees fully-injected prompt content with all mixin markers and task verbs already resolved. This ordering ensures that mixin content can contain tool references that are correctly mapped.
- Implementers MUST NOT hard-code tool mapping in adapter source — all mappings MUST be loaded from tool-map.yml

## Related Decisions

- [ADR-022](ADR-022-three-platform-adapters.md) — Three adapter architecture that tool mapping serves
- [ADR-024](ADR-024-capabilities-as-warnings.md) — Capabilities system that determines whether MCP content is wrapped or preserved
- Domain 05 ([05-platform-adapters.md](../domain-models/05-platform-adapters.md)) — Full specification of tool mapping algorithm, phrase pattern examples, and MCP fallback mechanism
