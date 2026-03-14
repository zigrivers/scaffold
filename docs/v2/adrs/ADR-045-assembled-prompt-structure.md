# ADR-045: Assembled Prompt Structure

**Status**: accepted
**Date**: 2026-03-14
**Deciders**: v2 spec, meta-prompt architecture design
**Domain(s)**: 08
**Phase**: 2 — Architecture Decision Records
**Supersedes**: ADR-015

---

## Context

When the CLI assembles a prompt at runtime (ADR-044), it combines content from multiple sources: the meta-prompt, knowledge base entries, project artifacts, methodology configuration, and user instructions. The AI receives a single assembled prompt containing all of this content. The structure and ordering of this assembled prompt directly affects the AI's output quality — information placement, section ordering, and precedence signaling all influence how the AI interprets and acts on the prompt.

ADR-015 defined a prompt frontmatter schema with section targeting for the v2 build-time resolution system. That schema was designed for static prompt files with mixin injection markers and subsection-level context loading. The meta-prompt architecture replaces this with a different content structure: meta-prompts declare intent, knowledge base entries provide expertise, and the assembly engine combines them with project context. A new structural specification is needed for the assembled output.

Key design tensions:

1. **User instructions must have highest precedence.** When a user says "Use hexagonal architecture" via `--instructions`, that must override any conflicting guidance from the meta-prompt or knowledge base.

2. **AI needs consistent framing.** If the assembled prompt structure varies between steps, the AI must spend tokens figuring out where different types of information are, reducing output quality. A fixed structure lets the AI develop consistent expectations.

3. **Separation of concerns must be visible.** The AI should be able to distinguish between "what to do" (meta-prompt), "domain expertise" (knowledge base), "current project state" (context), and "user overrides" (instructions) — blending them together loses valuable signal about information provenance and authority.

## Decision

The assembled prompt follows a **fixed-order section structure** with clear section headers and separation of concerns:

```
1. System Framing
   - Role definition and task type
   - Generate-then-execute instruction

2. Meta-Prompt
   - Purpose (what this step accomplishes)
   - Inputs (required and optional artifacts)
   - Expected Outputs (what to produce)
   - Quality Criteria (methodology-independent definition of "good")

3. Knowledge Base Entries
   - All entries referenced in meta-prompt frontmatter
   - Each entry clearly delimited with its name/topic

4. Project Context
   - Completed artifacts (content of files from prior steps)
   - Pipeline state (what steps are completed, what is next)
   - Project configuration (methodology, platforms, metadata)
   - Decision log (prior architectural decisions)

5. Methodology
   - Current depth level (1-5) for this step
   - Scaling guidance from meta-prompt (deep/mvp/custom interpolation)

6. User Instructions
   - Global instructions (.scaffold/instructions/global.md)
   - Per-step instructions (.scaffold/instructions/<step>.md)
   - Inline instructions (--instructions flag)

7. Execution Instruction
   - Final instruction to generate the working prompt and execute it
```

**Precedence model:** Sections later in the structure have higher authority. User instructions (section 6) override methodology defaults (section 5). Inline instructions override per-step instructions, which override global instructions. The execution instruction (section 7) is always last and provides the final framing.

**Section headers:** Each section is clearly labeled with a heading that identifies its source and purpose. Knowledge base entries are individually delimited so the AI can attribute expertise to specific topics. Project context artifacts are labeled with their file paths.

**Mode detection:** When a step is re-run on existing artifacts, the existing output artifact is included in the Project Context section (section 4), and the meta-prompt's Mode Detection guidance (included in section 2) instructs the AI to operate in update mode — reading existing content, diffing against current state, and proposing targeted updates rather than regenerating from scratch.

## Rationale

**Fixed ordering enables consistent AI behavior.** When the AI encounters the same structure in every assembled prompt, it develops reliable expectations about where to find what type of information. This reduces the tokens spent on orientation and increases the tokens available for actual work. The structure mirrors how a human would brief a colleague: here is what we need (meta-prompt), here is the relevant expertise (knowledge base), here is where we are (context), here is how deep to go (methodology), and here are special instructions (user overrides).

**Later-is-higher-precedence matches AI attention patterns.** Information later in the prompt tends to have stronger influence on AI output (recency effect). Placing user instructions after knowledge base and methodology entries ensures that user-specified overrides take effect even when they conflict with default guidance. This is not a guarantee — but it is a structural bias in the right direction.

**Clear section separation preserves information provenance.** When the AI can distinguish between "this is domain expertise from the knowledge base" and "this is a user instruction," it can make better decisions about conflicts. A user instruction to "skip the data flow diagrams" should override the knowledge base's guidance that data flow diagrams are important — but only if the AI can identify each as what it is. Section headers with clear labels enable this.

**Project context before methodology and instructions ensures grounding.** The AI needs to understand the current project state before it can interpret methodology scaling guidance or user instructions. Placing context (section 4) before methodology (section 5) and instructions (section 6) ensures the AI is grounded in the actual project before applying overrides.

## Alternatives Considered

### Interleaved Structure (Meta-Prompt Sections with Inline Knowledge)

- **Description**: Instead of separate meta-prompt and knowledge base sections, interleave knowledge base content into the meta-prompt at relevant points — e.g., quality criteria followed immediately by the knowledge entry that elaborates on those criteria.
- **Pros**: Information is co-located where it is relevant. The AI does not need to cross-reference between sections.
- **Cons**: Breaks the separation of concerns — the AI cannot easily distinguish meta-prompt intent from knowledge base expertise. Makes it harder for users to inspect the assembled prompt and understand what comes from where. Interleaving logic in the assembly engine is more complex than sequential concatenation.

### Flat Structure (No Section Headers)

- **Description**: Concatenate all content without section demarcation — just a single stream of instructions, expertise, and context.
- **Pros**: Simplest assembly logic. No header formatting to maintain.
- **Cons**: The AI cannot distinguish between information sources. User instructions blend into knowledge base content. Debugging assembled prompts is difficult — no landmarks to navigate by. Precedence signaling is lost.

### User Instructions First (Priming Approach)

- **Description**: Place user instructions at the beginning of the assembled prompt to "prime" the AI's interpretation of everything that follows.
- **Pros**: User instructions frame all subsequent content — the AI reads everything through the lens of user preferences from the start.
- **Cons**: Early instructions may be diluted by the volume of knowledge base and context content that follows (primacy effect is weaker than recency effect for long prompts). User instructions often reference concepts defined in the meta-prompt or knowledge base — placing instructions before those definitions means the AI encounters instructions it cannot yet contextualize.

### Variable Structure Per Step Type

- **Description**: Different assembled prompt structures for creation steps, review steps, and validation steps — optimized for each task type.
- **Pros**: Each task type gets a structure optimized for its specific needs. Review steps could put the artifact under review first; creation steps could put knowledge base first.
- **Cons**: Multiple structures to design, implement, and maintain. The AI must adapt to different structures for different steps, losing the consistency benefit. Assembly engine complexity increases. The fixed structure is general enough to serve all step types — the meta-prompt's content (section 2) already varies by step type, providing task-specific framing.

## Consequences

### Positive
- Consistent structure across all pipeline steps — the AI always knows where to find each type of information
- Clear separation of concerns — intent, expertise, context, methodology, and instructions are distinct and labeled
- User instructions always have highest precedence via structural positioning
- Assembled prompts are human-inspectable — section headers make it easy to understand what the AI received and where each part came from
- Mode detection (update vs. create) integrates naturally — existing artifacts appear in context, meta-prompt's mode detection guidance instructs behavior

### Negative
- Fixed structure may not be optimal for every step type — some steps might benefit from a different information ordering
- Long assembled prompts (knowledge base + multiple artifacts as context) may approach context window limits for some models — knowledge base entries must be comprehensive but not verbose
- Section headers consume tokens — the structural overhead is small but nonzero
- The precedence model (later = higher authority) is a convention, not a guarantee — the AI may not always respect structural positioning as precedence

### Neutral
- The assembled prompt is platform-neutral — delivery adapters (Claude Code command files, Codex AGENTS.md, stdout) wrap the assembled prompt without modifying its internal structure
- ADR-015's section targeting concept is not carried forward — the assembly engine loads complete knowledge base entries and complete artifacts, not subsections (context window management is handled by keeping entries at appropriate length)
- The generate-then-execute pattern (AI generates a working prompt from the assembled prompt, then executes it) is instructed in both the system framing (section 1) and the execution instruction (section 7)

## Constraints and Compliance

- The assembled prompt MUST follow the seven-section fixed-order structure defined in this ADR
- Each section MUST have a clear header that identifies its source and purpose
- Knowledge base entries MUST be individually delimited with their entry name
- Project context artifacts MUST be labeled with their file paths
- User instructions MUST appear after all other content sections (except the execution instruction) to ensure highest precedence
- Within user instructions, precedence MUST be: global < per-step < inline
- The execution instruction MUST always be the final section
- Existing output artifacts (for update mode) MUST be included in the project context section when the step is being re-run
- ADR-015 (prompt frontmatter schema with section targeting) is superseded by this decision

## Related Decisions

- [ADR-015](ADR-015-prompt-frontmatter-schema.md) — Superseded; prompt frontmatter schema replaced by meta-prompt frontmatter and assembled prompt structure
- [ADR-041](ADR-041-meta-prompt-architecture.md) — Meta-prompt architecture whose output this structure organizes
- [ADR-042](ADR-042-knowledge-base-domain-expertise.md) — Knowledge base entries that populate section 3
- [ADR-044](ADR-044-runtime-prompt-generation.md) — Runtime assembly that produces the assembled prompt in this structure
- [ADR-043](ADR-043-depth-scale.md) — Depth scale that populates section 5 (methodology)
