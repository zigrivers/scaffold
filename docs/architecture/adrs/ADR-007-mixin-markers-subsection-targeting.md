# ADR-007: Multiple Mixin Markers with Sub-Section Targeting

**Status**: superseded (by [ADR-041](ADR-041-meta-prompt-architecture.md))
**Date**: 2026-03-13
**Deciders**: v2 spec (Resolved Design Questions: Mixin Granularity)
**Domain(s)**: 12
**Phase**: 2 — Architecture Decision Records

---

## Context

When a prompt references a mixin axis (e.g., `task-tracking`), it may need different portions of the mixin's content at different locations within the prompt. For example, a prompt for "Git Workflow" might need the task-tracking mixin's close-workflow instructions in one section and its PR-integration instructions in another. The question is whether each prompt should have a single mixin marker per axis (injecting the entire mixin content at one location) or whether prompts should be able to target specific subsections of a mixin file.

A secondary question is whether prompts can contain multiple markers for the same axis. If a prompt needs task-tracking instructions in three different places, must it use one marker and restructure the prompt, or can it place three markers that each inject different content?

Domain 12 (Mixin Injection Mechanics) explored this design space in Section 8 (MQ3: Sub-section targeting), defining the section delimiter syntax and the injection behavior for both full-content and sub-section markers.

## Decision

Prompts may contain **multiple** `<!-- mixin:<axis> -->` markers for the same axis AND may use **sub-section targeting** via `<!-- mixin:<axis>:<sub-section> -->` to inject specific named portions of a mixin file.

Mixin files define named sub-sections using `<!-- section:<name> -->` delimiters. Content before the first section delimiter is the "preamble."

Two injection behaviors:

1. **Full-content marker** (`<!-- mixin:task-tracking -->`): Injects the mixin file's `fullContent` property — the preamble plus all section contents joined by double newlines, with delimiter lines stripped.
2. **Sub-section marker** (`<!-- mixin:task-tracking:close-workflow -->`): Injects only the content of the named section, trimmed of leading and trailing blank lines.

Section names follow the same naming rules as axis names: lowercase letters, digits, and hyphens, starting with a letter.

A missing sub-section is a fatal error (`INJ_SECTION_NOT_FOUND`), not downgraded by `--allow-unresolved-markers`. The error message lists the available section names in the mixin file to guide the author.

## Rationale

- **Fine-grained placement matches prompt structure**: Prompts are structured documents with distinct sections (Context, Process, Validation). Task-tracking instructions for "closing a task" belong in the Process section, while "checking ready tasks" belongs in a different section. Without sub-section targeting, the prompt author would need to either put all task-tracking content in one place (breaking the prompt's logical flow) or duplicate content across multiple mixin files (introducing maintenance burden). Domain 12, Section 8 MQ3 demonstrates this with the task-tracking mixin's `close-workflow` and `pr-integration` sections.
- **Fatal error for missing sections prevents silent omissions**: A typo in a sub-section name (e.g., `<!-- mixin:task-tracking:close-workfow -->`) would silently produce an empty injection if treated as a warning. Making it fatal with available section names listed ensures the author catches the error immediately (domain 12, Section 8, MQ3).
- **Preamble + sections model covers all cases**: Some mixin content is universally applicable (the preamble) while other content is context-specific (sections). The full-content marker captures everything, while sub-section markers allow surgical insertion. This is a superset of both all-or-nothing and section-only approaches.

## Alternatives Considered

### Single Marker per Axis per Prompt
- **Description**: Each prompt has at most one `<!-- mixin:<axis> -->` marker per axis. The entire mixin file content is injected at that single location.
- **Pros**: Simplest parsing logic — no sub-section resolution needed. No risk of section name mismatches. Mixin files are simpler (no section delimiters).
- **Cons**: Forces all-or-nothing injection. If a prompt needs task-tracking instructions in three places, the mixin content must be written as a single block, and the prompt must be restructured to accommodate it. This couples mixin content structure to prompt structure, defeating the purpose of separation.

### Multiple Markers Without Sub-Sections
- **Description**: Allow multiple `<!-- mixin:<axis> -->` markers per prompt, but each injects the full mixin content. No sub-section targeting.
- **Pros**: Placement flexibility — put the mixin content wherever it's needed. No section delimiter syntax to learn.
- **Cons**: Every marker for the same axis injects identical content. If a prompt needs different portions of the task-tracking mixin in different locations, it would get the full content at each location — producing massive duplication. The alternative is splitting mixin content into separate files per usage context, which fragments related content and increases file count.

### No Mixin Files (Inline Everything)
- **Description**: No mixin injection at all. Each methodology override or extension contains the complete prompt text with tool-specific instructions baked in.
- **Pros**: No resolution or injection system needed. Prompts are self-contained. What you see is what you get.
- **Cons**: Massive duplication across methodologies. Adding a new task-tracking backend requires editing every prompt that references task operations. The v1 approach (single-methodology, everything baked in) worked for one configuration but does not scale to the cross-axis composability v2 requires.

## Consequences

### Positive
- Prompts can inject exactly the mixin content they need at the right location, producing clean and contextually appropriate output
- Mixin authors can organize related content into named sections within a single file, keeping related instructions together
- The full-content marker provides a simple "give me everything" option when fine-grained control is not needed
- Fatal errors on missing sections catch typos and mixin-prompt mismatches at build time

### Negative
- Mixin files have a new concept to learn: section delimiters (`<!-- section:<name> -->`) and the preamble-plus-sections structure
- Section names must be kept in sync between prompt markers and mixin files — a rename in the mixin file requires updating all prompts that reference the old section name
- The error message for `INJ_SECTION_NOT_FOUND` must include available section names, requiring the injection engine to parse and enumerate sections even in the error path

### Neutral
- Mixin files without any `<!-- section:... -->` delimiters work identically to the single-marker approach — the entire file content is the preamble, and `fullContent` equals the preamble. Sub-section markers targeting such a file would produce `INJ_SECTION_NOT_FOUND` errors.

## Constraints and Compliance

- Sub-section names MUST follow the pattern `[a-z][a-z0-9-]*` (lowercase, letters/digits/hyphens, starts with letter) (domain 12, Section 8, MQ2)
- Section delimiters in mixin files MUST use the syntax `<!-- section:<name> -->` on their own line (domain 12, Section 8, MQ3)
- Missing sub-sections MUST produce a fatal `INJ_SECTION_NOT_FOUND` error that lists available sections. This error MUST NOT be downgraded by `--allow-unresolved-markers` (domain 12, Section 6)
- Full-content injection MUST include the preamble and all section contents joined, with delimiter lines stripped (domain 12, Section 8, MQ3)
- Duplicate section names within a mixin file MUST produce a warning (`INJ_DUPLICATE_SECTION_NAME`) and the last occurrence wins (domain 12, Section 3, Entity Model)
- Implementers MUST NOT introduce additional marker attributes or syntax — the sub-section specifier is the only extension to the base axis marker syntax

## Related Decisions

- [ADR-006](ADR-006-mixin-injection-over-templating.md) — Injection mechanism that this decision extends with sub-section targeting
- [ADR-008](ADR-008-abstract-task-verbs.md) — Task verb markers, the other marker family in the injection system
- Domain 12 ([12-mixin-injection.md](../domain-models/12-mixin-injection.md)) — Full sub-section targeting specification in Section 8, MQ3
