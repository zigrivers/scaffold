# ADR-037: Abstract Task Verb Replacement Scope Is Global

**Status**: superseded (by [ADR-041](ADR-041-meta-prompt-architecture.md))
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 04, 12
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v2's mixin injection operates in two passes: Pass 1 replaces axis markers (`<!-- mixin:<axis-name> -->`) with mixin content, and Pass 2 replaces abstract task verb markers (`<!-- scaffold:task-* -->`) with task-tracking-specific instructions (ADR-035). The question is: where does Pass 2 look for task verb markers?

There are two possible scopes for Pass 2:
1. **Global scope**: Replace task verb markers everywhere in the prompt — in the original base prompt text AND in content injected by Pass 1.
2. **Restricted scope**: Replace task verb markers only within content that was injected by Pass 1 (i.e., only within mixin-injected sections).

This decision matters because base prompts contain instructional flow text that naturally references task operations. For example, a base prompt's "Process" section might say: "After completing the data model, <!-- scaffold:task-update --> the task with the schema decisions." If Pass 2 only operates on mixin-injected content, this marker in the base prompt body would remain unresolved.

Domain 04 (Abstract Task Verbs) defines the verb vocabulary and content format. Domain 12 (Mixin Injection) defines the injection algorithm and pass ordering.

## Decision

Abstract task verb markers (`<!-- scaffold:task-* -->`) are replaced globally across the entire prompt content during Pass 2, not only within mixin-injected sections. A base prompt may contain task verb markers in its own body text — in process steps, in instructional paragraphs, in output format sections — and all of these are replaced during the task verb pass.

The replacement scope for Pass 2 is: the entire prompt content as it exists after Pass 1 completes. This includes the original base prompt text, any mixin content injected during Pass 1, and any other content that is part of the prompt at that point. No region is excluded from task verb replacement.

## Rationale

**Base prompts need to reference task operations in their instructional flow**: A prompt's "Process" section typically includes step-by-step instructions that reference task operations: "Create a task for each API endpoint," "Update the task with the chosen database schema," "Close the task when the data model is complete." These instructions are part of the base prompt's flow — they are not mixin-specific. Restricting task verb replacement to mixin-injected content would force the base prompt author to either (a) write task instructions in tool-agnostic prose (defeating the purpose of abstract task verbs) or (b) duplicate task instructions that are already defined in task verb content.

**Avoiding duplication is a core mixin design goal**: Abstract task verbs (ADR-008) exist specifically so that task-tracking instructions are defined once (in the task verb content files) and injected wherever needed. If base prompts cannot use task verb markers, every base prompt that references task operations would need to duplicate the instructions in prose form, and these duplicated instructions would become stale when the task-tracking tool changes. Global scope ensures that the single-definition principle extends to both base prompts and mixin content.

**No meaningful distinction between "base prompt text" and "mixin content" after Pass 1**: After Pass 1 completes, the prompt is a single unified document. The injection engine does not maintain provenance tracking of which characters came from the base prompt vs. mixin content. Implementing restricted scope would require tracking injection boundaries — adding complexity for no functional benefit. Global scope is simpler to implement and simpler to reason about.

**Consistent mental model**: The user's mental model should be simple: "After Pass 1, the prompt is assembled. Then, every task verb marker in the assembled prompt is replaced." This is easier to understand than "After Pass 1, task verb markers are replaced, but only in the parts that came from mixins, not in the parts that were already there." The restricted model requires the user to track which content came from where, which is unnecessary cognitive overhead.

## Alternatives Considered

### Replace Only Within Mixin-Injected Content

- **Description**: Pass 2 tracks which regions of the prompt were injected by Pass 1 (maintaining start/end offsets) and only replaces task verb markers within those regions. Task verb markers in the original base prompt text are left unresolved and caught by the unresolved marker check.
- **Pros**: Clear separation of concerns — base prompts are "pure" instructional text, and all task-tracking-specific content is confined to mixin-injected regions. This makes it obvious where task instructions come from.
- **Cons**: Forces base prompts to duplicate task instructions in prose form wherever they reference task operations. Adds implementation complexity (boundary tracking). Violates the DRY principle that abstract task verbs were designed to enforce. In practice, every base prompt that has a "Process" section with task operations would need to either (a) avoid referencing tasks in the base prompt (limiting expressiveness) or (b) duplicate instructions that are already in task verb content files.

### Replace Only Within Explicitly Marked Regions

- **Description**: Introduce a new marker type (`<!-- scaffold:task-scope -->...<!-- /scaffold:task-scope -->`) that defines regions where task verb replacement is active. Markers outside these regions are errors.
- **Pros**: Maximum explicitness — the prompt author declares exactly where task verb replacement should occur. No ambiguity about scope.
- **Cons**: Adds unnecessary ceremony. Every base prompt that uses task verb markers would need to wrap them in scope markers. This is boilerplate that provides no functional benefit — the author's intent is clear from the presence of a `<!-- scaffold:task-* -->` marker. The scope markers would also need to be documented, validated, and tested, adding complexity to the injection system for a problem that does not exist in practice.

### Separate Pass for Base Prompt vs. Mixin Content

- **Description**: Run Pass 2 twice — once on the original base prompt text, once on the mixin-injected content — with potentially different replacement strategies for each.
- **Pros**: Could enable different task verb behavior in base prompts vs. mixin content (e.g., more verbose instructions in base prompts, terse instructions in mixins).
- **Cons**: Over-engineering. The task verb content should be the same regardless of where it appears — the instructions for "how to create a Beads task" do not change based on whether the marker is in a base prompt or a mixin. Running Pass 2 twice adds processing time and complexity without a demonstrated benefit.

## Consequences

### Positive
- Base prompt authors can freely use task verb markers anywhere in their prompt text, keeping task instructions DRY across the entire prompt
- The injection model is simple and consistent — Pass 2 replaces all task verb markers, no exceptions, no scope restrictions
- No boundary tracking or provenance metadata is needed — the implementation is a straightforward string replacement over the full prompt content
- The mental model for prompt authors is simple: "use `<!-- scaffold:task-* -->` anywhere you need task instructions"

### Negative
- A typo in a task verb marker name (e.g., `<!-- scaffold:task-craete -->` instead of `<!-- scaffold:task-create -->`) in a base prompt will be caught by the unresolved marker check, but the error message may be confusing if the author did not realize they were using a task verb marker (as opposed to a mixin marker)
- Base prompts become coupled to the task verb marker syntax — if the marker syntax changes in a future version, both mixin content and base prompts need updating. However, this coupling already exists by design (prompts are built for the scaffold system)
- There is no way to include a literal `<!-- scaffold:task-* -->` string in the prompt output without it being replaced — if a prompt needs to document the marker syntax itself, the marker would be consumed by Pass 2. This edge case can be handled with an escape syntax if it arises

### Neutral
- The global scope decision does not change the two-pass bound defined in ADR-035 — Pass 2 still runs exactly once, it simply operates on the full prompt rather than a subset
- Prompt authors who do not use task verb markers in their base prompt text are unaffected — their prompts work identically under global scope and restricted scope

## Constraints and Compliance

- Pass 2 (task verb replacement) MUST operate on the entire prompt content after Pass 1 completes — no region of the prompt is excluded from task verb replacement
- Task verb markers in the base prompt body MUST be replaced during Pass 2, identically to task verb markers in mixin-injected content
- The replacement content for a given task verb marker MUST be identical regardless of whether the marker appeared in the base prompt or in mixin content
- The unresolved marker check after Pass 2 MUST apply to the entire prompt — unresolved task verb markers in both base prompt text and mixin content are treated as errors (or warnings with `--allow-unresolved-markers`)
- No boundary tracking or provenance metadata from Pass 1 is required for Pass 2 — the implementation MAY treat the post-Pass-1 content as a single opaque string

## Related Decisions

- [ADR-008](ADR-008-abstract-task-verbs.md) — Abstract task verbs define the marker vocabulary and content format that Pass 2 resolves
- [ADR-010](ADR-010-build-time-resolution.md) — Build-time resolution means task verb replacement happens during `scaffold build`
- [ADR-035](ADR-035-non-recursive-injection.md) — Two-pass bounded injection defines the pass ordering within which global scope operates
- Domain 04 ([04-abstract-task-verbs.md](../domain-models/04-abstract-task-verbs.md)) — Task verb definitions, content format, and verb vocabulary
- Domain 12 ([12-mixin-injection.md](../domain-models/12-mixin-injection.md)) — Injection algorithm including pass ordering and marker resolution scope
