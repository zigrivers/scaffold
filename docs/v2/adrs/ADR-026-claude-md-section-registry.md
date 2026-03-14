# ADR-026: CLAUDE.md Section Registry with Token Budget

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 10
**Phase**: 2 — Architecture Decision Records

---

## Context

CLAUDE.md is a shared artifact written to by multiple prompts during pipeline execution. It serves as the primary agent instruction file for Claude Code in target projects — loaded into every agent session, consuming context window tokens. Without coordination, multiple prompts overwrite each other's content and the file bloats beyond useful size, crowding out working memory in the agent's finite context window.

Three systemic risks drive the need for a management model: unbounded growth (each prompt appends content without a size ceiling), structural drift (ad-hoc section naming makes it hard for agents and users to find information), and write conflicts (multiple prompts and implementation agents write to the same file with no ownership clarity). Domain 10 explores these risks and models the section registry, ownership markers, token budget, and fill/replace algorithm in detail.

## Decision

CLAUDE.md is managed via a section registry with ownership markers and a 2000-token total advisory budget. Each prompt "owns" specific `##`-level sections. Content between ownership markers (`<!-- scaffold:managed by <slug> -->` / `<!-- /scaffold:managed -->`) is scaffold-controlled. A "Project-Specific Notes" section is explicitly unmanaged, reserved for user and implementation agent content.

The 2000-token CLAUDE.md budget is advisory, not a hard build-time limit. It is enforced by the claude-md-optimization prompt in Phase 6, which can restructure and condense content holistically. The CLI emits warnings when the budget is exceeded during prompt execution, but does not reject over-budget content.

Concretely:
- The section registry is derived from the methodology manifest's `claude-md-sections` field — different methodologies may define different section structures
- Each section has one of four states: unmanaged, placeholder (marker present but no content), filled (marker present with content), or corrupted (marker missing or malformed)
- Re-running the owning prompt replaces content within its markers (idempotent rebuild)
- Sections reference external docs via the pointer pattern (e.g., "See docs/coding-standards.md") rather than duplicating content
- No pipeline reference appears in CLAUDE.md — the CLI manages pipeline context separately
- Platform adapters produce equivalents for other platforms (CLAUDE.md for Claude Code, AGENTS.md for Codex)

## Rationale

**Section registry over free-form writing**: Without a registry, prompts must scan the entire file to find their content, guess where to insert new content, and hope they don't overwrite another prompt's work. The registry gives each prompt a deterministic location — the prompt knows exactly which `##` section it owns, finds its markers, and replaces content within them. This eliminates write conflicts between prompts and makes re-runs idempotent rather than additive (domain 10, Section 2).

**Methodology-derived sections over hardcoded sections**: Different methodologies may need different CLAUDE.md structures. A methodology focused on TDD might want a prominent "Testing Conventions" section, while a lean methodology might not. Deriving sections from the manifest's `claude-md-sections` field allows methodology authors to control the agent instruction structure, consistent with ADR-004's principle that methodologies own the full pipeline experience.

**Ownership markers over trust-based convention**: Without markers, a prompt re-run must heuristically detect where its previous content begins and ends — brittle and error-prone, especially when users edit the file between runs. HTML comment markers are invisible in rendered markdown, provide machine-readable boundaries, and are consistent with the tracking comment pattern from ADR-017.

**Advisory budget over hard budget**: A hard budget that rejects over-budget content would block prompt execution for a cosmetic concern — the prompt's actual work (creating other artifacts) would be halted because CLAUDE.md is too long. Advisory budgets warn during execution, with active enforcement deferred to the claude-md-optimization prompt in Phase 6, which can restructure and condense content holistically rather than rejecting individual contributions.

**Pointer pattern over content duplication**: Duplicating coding standards, dev setup instructions, and project structure details in CLAUDE.md wastes the token budget and creates maintenance drift. A pointer ("See docs/coding-standards.md") costs ~10 tokens versus ~200-500 tokens for duplicated content, and always reflects the current state of the referenced document.

## Alternatives Considered

### Unmanaged CLAUDE.md (Each Prompt Writes Freely)

- **Description**: No ownership model. Each prompt appends or modifies CLAUDE.md at its discretion with no coordination mechanism.
- **Pros**: Simplest implementation. No markers to maintain. No registry to define.
- **Cons**: Prompts overwrite each other's content on re-runs. File bloats without bound. No way to determine which content belongs to which prompt. Parallel execution in implementation phase creates merge conflicts. This is effectively the v1 model, which domain 10 identifies as the source of all three systemic risks.

### Separate CLAUDE.md per Prompt

- **Description**: Each prompt writes to its own file (e.g., `.claude/instructions/tech-stack.md`), concatenated at session start.
- **Pros**: No write conflicts — each file has a single owner. Re-runs are trivially idempotent (replace the file). No markers needed.
- **Cons**: Agents cannot see consolidated project context in a single file. The concatenation order matters for agent comprehension but is not controlled by the prompt author. Claude Code currently reads a single CLAUDE.md — multiple files would require a custom loader. Total token budget is harder to enforce across multiple files.

### Hard Token Budget (Reject Over-Budget Content)

- **Description**: Enforce a strict 2000-token ceiling. If a prompt's contribution would push the file over budget, the write is rejected and the prompt fails.
- **Pros**: Guarantees CLAUDE.md never exceeds the budget. Forces prompt authors to write concise content.
- **Cons**: Blocks prompt execution for a cosmetic concern — the prompt may have completed all its other work (creating artifacts, writing docs) but fails because CLAUDE.md is 50 tokens over budget. The failure happens at an unpredictable point in the pipeline depending on execution order. Budget enforcement should be a quality pass (Phase 6 optimization), not a gate on every prompt.

### No Ownership Markers (Trust Prompts Not to Overwrite)

- **Description**: Use a section registry for structure but no markers in the file. Prompts find their sections by `##` heading name and replace content under that heading.
- **Pros**: Cleaner file without HTML comments. Simpler parsing (just heading detection).
- **Cons**: If a user renames a heading, the prompt cannot find its section and creates a duplicate. If two sections have similar names, the wrong section may be targeted. Re-runs after user edits within a section cannot distinguish user content from scaffold content, risking user content loss. Markers provide unambiguous, machine-readable boundaries that survive heading renames.

## Consequences

### Positive
- Write conflicts between prompts are eliminated — each prompt has deterministic, marker-bounded content areas
- Re-runs are idempotent — the owning prompt replaces its markers and content, leaving everything else untouched
- CLAUDE.md size is managed via advisory budgets and the Phase 6 optimization prompt, preventing context window bloat
- The pointer pattern keeps CLAUDE.md concise while ensuring agents can find detailed information in referenced documents
- Methodology authors control the section structure, enabling methodology-specific agent instructions

### Negative
- Ownership markers add visual noise to the raw file (though they are invisible in rendered markdown)
- The registry adds a layer of indirection — prompt authors must declare their sections in the methodology manifest rather than simply writing to CLAUDE.md
- Advisory budgets may be ignored — without hard enforcement, CLAUDE.md can still grow beyond 2000 tokens until the Phase 6 optimization prompt runs
- Corrupted state (missing or malformed markers) requires detection and recovery logic
- User edits to scaffold-managed CLAUDE.md sections (content between `<!-- scaffold:managed by <slug> -->` / `<!-- /scaffold:managed -->` markers) are silently overwritten when the owning prompt re-runs. Users MUST add custom content to the unmanaged "Project-Specific Notes" section only

### Neutral
- The "Project-Specific Notes" section is append-only during implementation, preventing clobbering in parallel agent execution but potentially accumulating redundant entries over time
- Platform adapters (ADR-022) produce equivalent files for non-Claude platforms, meaning the section registry model must be abstract enough to work across CLAUDE.md, AGENTS.md, and other formats

## Constraints and Compliance

- Total CLAUDE.md MUST stay within a 2000-token advisory budget — warnings during execution, active enforcement by the claude-md-optimization prompt in Phase 6
- Ownership markers MUST use `<!-- scaffold:managed by <slug> -->` / `<!-- /scaffold:managed -->` format — no alternative marker formats
- Section registry MUST be derived from the methodology manifest's `claude-md-sections` field — not hardcoded in the CLI
- Project-Specific Notes MUST be unmanaged (user-owned) — no prompt may write to or modify this section
- Re-running a prompt MUST replace only its owned sections (content between its markers) — idempotent, not additive
- Adapters MUST produce platform-specific equivalents (CLAUDE.md for Claude Code, AGENTS.md for Codex) using the same section registry model (ADR-022)
- User edits to scaffold-managed sections (between ownership markers) are overwritten when the owning prompt re-runs — users SHOULD be informed of this behavior during onboarding
- No pipeline reference MUST appear in CLAUDE.md — pipeline context is the CLI's responsibility
- See domain 10, Sections 2-4 for the complete section registry specification, fill/replace algorithm, and budget enforcement rules

## Related Decisions

- [ADR-004](ADR-004-methodology-as-top-level-organizer.md) — Methodology determines section structure via manifest
- [ADR-017](ADR-017-tracking-comments-artifact-provenance.md) — Tracking comment pattern consistent with ownership marker format
- [ADR-022](ADR-022-three-platform-adapters.md) — Platform adapters produce CLAUDE.md equivalents for other platforms
- [ADR-029](ADR-029-prompt-structure-convention.md) — Both address agent context and token optimization; prompt structure reduces per-prompt overhead while section registry manages CLAUDE.md budget
- Domain 10 ([10-claude-md-management.md](../domain-models/10-claude-md-management.md)) — Full specification of section registry, ownership markers, token budget, and fill/replace algorithm
