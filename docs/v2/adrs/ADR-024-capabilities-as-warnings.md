# ADR-024: Requires-Capabilities as Warnings Not Hard Errors

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 05, 08
**Phase**: 2 — Architecture Decision Records

---

## Context

Prompts can declare required platform capabilities via the `requires-capabilities` field in their frontmatter. Valid capabilities are: `user-interaction`, `filesystem-write`, `subagent`, `mcp`, and `git`. Different platforms support different subsets of these capabilities — for example, Codex supports `filesystem-write` and `git` but lacks `mcp` and (in some modes) `user-interaction`.

When a target platform does not support a capability that a prompt declares, the build must decide how to handle the mismatch. The choice is between failing the build (hard error), warning and continuing (soft degradation), or silently proceeding (no notification).

This decision has direct impact on the platform adapter system (domain 05) — adapters must know which capabilities their platform supports and how to adapt prompt content when capabilities are missing. It also affects the validation pipeline (domain 08/09) — capability checking must happen at a predictable point in the build process.

## Decision

Missing capabilities produce **warnings with adaptation guidance**, not hard errors. The build succeeds, but prompts that require missing capabilities include guidance about potential limitations on the target platform. Optional sections within prompts that depend on a missing capability are wrapped in `<!-- scaffold:requires <capability> -->` HTML comments, making them invisible in rendered output for platforms that lack the capability.

The five valid capabilities are:
- `user-interaction` — prompt requires interactive prompts or user input during execution
- `filesystem-write` — prompt writes files to the project directory
- `subagent` — prompt delegates work to sub-agents
- `mcp` — prompt uses Model Context Protocol tools
- `git` — prompt performs git operations

Platform capability declarations are defined in adapter definitions, not in project configuration — the adapter knows what its platform supports.

## Rationale

**Warnings over hard errors**: Most prompts work partially or fully even when a declared capability is missing. A prompt that declares `requires-capabilities: [mcp]` because it includes an MCP-specific section for data fetching still produces valuable output without MCP — the core document creation works, only the data enrichment section is degraded. Failing the entire build for a partially degraded prompt wastes the 90% of value that would still be delivered. Domain 09 notes that capability checking should surface at both build time and validate time, reinforcing the informational (not blocking) nature of the check.

**Adaptation guidance in warnings**: A bare "capability missing" warning is unhelpful. The warning must tell the user what to expect: "MCP not available on Codex — sections referencing MCP tools will be commented out. You may need to perform data fetching manually." This transforms a potential surprise failure during execution into an informed decision at build time.

**HTML comment wrapping over removal**: Wrapping capability-guarded sections in HTML comments (rather than deleting them) preserves the content for reference. If a user later switches to a platform that supports the capability, the content is already present and just needs unwrapping. It also means the Universal adapter's output includes the full content, providing a complete reference regardless of platform limitations.

**Fixed capability set over arbitrary capabilities**: Limiting capabilities to a defined set of five prevents fragmentation. If prompt authors could declare arbitrary capabilities (`requires-capabilities: [web-browser, image-gen, voice]`), the system would accumulate capabilities that no adapter checks for, producing false confidence. A fixed set ensures every declared capability is checked by every adapter.

## Alternatives Considered

### Hard Errors (Build Fails if Capability Missing)

- **Description**: If any prompt requires a capability that the target platform does not support, the build fails with an error listing the incompatible prompts.
- **Pros**: Guarantees that every generated prompt will work fully on the target platform. No surprises during execution.
- **Cons**: Too restrictive. A project targeting Codex that includes a single prompt with an MCP-enhanced section would fail to build entirely, despite the fact that the prompt works 90% without MCP. Forces prompt authors to either avoid declaring capabilities (defeating the purpose) or split prompts into capability-gated variants (duplication). The v2 spec explicitly favors graceful degradation over strict gating.

### Silent Degradation (No Warnings)

- **Description**: If a capability is missing, adapt the prompt silently (wrap sections, adjust content) without notifying the user.
- **Pros**: Clean output. No warning noise. Users who chose their platform presumably know its limitations.
- **Cons**: Users may not realize that sections of their prompts have been commented out or degraded. A prompt that behaves differently on Codex than on Claude Code — without any build-time notification — leads to confusing execution failures that are hard to diagnose. The build output is the natural place to surface this information.

### Per-Prompt Opt-In to Capability Checking

- **Description**: Prompts can individually opt in to capability checking via a frontmatter flag (`strict-capabilities: true`). Only opted-in prompts produce warnings or errors.
- **Pros**: Maximum granularity. Prompt authors control which prompts are checked.
- **Cons**: Most prompt authors will not bother opting in, making the system effectively useless by default. The value of capability checking comes from it being universal — a user can trust that build-time warnings capture all capability mismatches, not just the ones that the original prompt author thought to flag.

## Consequences

### Positive
- Builds never fail due to capability mismatches — the pipeline always produces output, maximizing the value delivered
- Warnings with adaptation guidance help users understand exactly what is degraded and why, enabling informed decisions
- Prompt content is preserved (not destroyed) when capabilities are missing — switching platforms later requires no prompt regeneration
- The fixed capability set ensures comprehensive checking across all adapters

### Negative
- Users may ignore warnings and be surprised when a prompt behaves differently on a capability-limited platform. Warnings are only useful if users read them.
- Comment-wrapped sections add visual noise in raw markdown for users who read the source files rather than rendered output
- Prompt authors must accurately declare `requires-capabilities` — an undeclared capability produces no warning when missing, leading to silent execution failure. The system cannot validate that declarations are complete, only that declared capabilities are checked.

### Neutral
- The five-capability set is extensible in future versions but intentionally limited at launch. Adding a capability requires updating all adapter definitions and is a versioned change.
- Platform capability declarations live in adapter definitions, meaning a new platform's capabilities are defined once when the adapter is created. There is no per-project capability configuration.

## Constraints and Compliance

- Missing capabilities MUST produce warnings, not errors — the build MUST succeed
- Warnings MUST include adaptation guidance explaining what is degraded and what the user should expect
- Optional prompt sections that depend on a missing capability MUST be wrapped in `<!-- scaffold:requires <capability> -->` HTML comments
- The valid capability set MUST be exactly: `user-interaction`, `filesystem-write`, `subagent`, `mcp`, `git` — no arbitrary capabilities
- Platform capability declarations MUST be defined in adapter definitions, not in project configuration
- Capability checking MUST occur at build time and SHOULD also be surfaced during `scaffold validate` (domain 09 recommendation)
- Implementers MUST NOT treat missing capabilities as errors that halt the build

## Related Decisions

- [ADR-015](ADR-015-prompt-frontmatter-schema.md) — Frontmatter schema defines the `requires-capabilities` field
- [ADR-022](ADR-022-three-platform-adapters.md) — Three adapter architecture where each adapter declares its platform's capabilities
- [ADR-023](ADR-023-phrase-level-tool-mapping.md) — Tool mapping is a related but separate mechanism for platform adaptation (surface-level names vs. capability-level features)
- Domain 05 ([05-platform-adapters.md](../domain-models/05-platform-adapters.md)) — Adapter capability declarations and per-platform capability sets
