# ADR-029: Prompt Structure Convention — Agent-Optimized Section Ordering

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 08, 09
**Phase**: 2 — Architecture Decision Records

---

## Context

AI agents have finite context windows and benefit from seeing the most important information first. In v1, every prompt includes significant boilerplate — Mode Detection blocks (~300-400 tokens each, identical across all prompts) and "After This Step" navigation (~50 tokens each). Across a 20-prompt pipeline, this consumes ~4,800 tokens on content that provides no prompt-specific value.

Additionally, v1 prompts have no standardized section ordering. Some prompts put process rules first, others put specifications first, and completion criteria may appear at the end where an agent with limited context might never reach them. This inconsistency means agents cannot develop a reliable reading strategy across prompts.

Domain 08 (Prompt Frontmatter) defines the metadata that accompanies each prompt, and domain 09 (CLI Architecture) specifies how the CLI handles concerns like mode detection and navigation that were previously embedded in prompt content. The v2 spec's "Prompt Structure Convention" section defines the target ordering.

## Decision

All prompts follow a strict section ordering: What to Produce, Completion Criteria, Process, Detailed Specifications, Update Mode Specifics. Boilerplate blocks (Mode Detection, "After This Step") are removed from prompts entirely and handled by the CLI instead.

Section ordering:

1. **What to Produce** — the deliverable in 2-3 sentences. The agent knows its goal in the first ~50 tokens.
2. **Completion Criteria** — machine-checkable assertions using checkbox syntax (`- [ ] docs/artifact.md exists`). The agent knows the finish line before starting work. These criteria feed `scaffold validate` for programmatic completion checking.
3. **Process** — execution constraints and workflow rules. Positioned before detailed specs so that agents which begin executing before reading the full prompt still follow the correct workflow.
4. **Detailed Specifications** — the bulk of the prompt content, read as reference during execution.
5. **Update Mode Specifics** — per-prompt rules for update mode, relevant only when updating an existing artifact. The agent already knows from CLI output whether it is in update mode.

Boilerplate removed from prompts:
- **Mode Detection block**: the CLI determines fresh vs. update mode by checking artifact existence and communicates this in `scaffold run` output
- **"After This Step" navigation**: the CLI computes next steps dynamically from state via `scaffold next` and dependency resolution

## Rationale

**Front-loading critical information**: Agents process tokens sequentially and may begin executing before reading the entire prompt. If the goal and completion criteria appear at the end (as in some v1 prompts), the agent may start working without knowing what "done" looks like. Putting "What to Produce" and "Completion Criteria" first ensures the agent has the most important information in the first ~200 tokens, even if it never reads the rest.

**Completion Criteria as machine-checkable assertions**: Checkbox syntax (`- [ ] docs/artifact.md exists`, `- [ ] Contains required sections: ...`) enables `scaffold validate` to programmatically check whether a prompt's output meets its structural requirements. Dual completion detection (ADR-018) determines whether a prompt has run — checking artifact existence and state records. Completion Criteria determine whether the prompt's output meets structural requirements — checking for required sections, correct format, and other machine-checkable assertions. Both mechanisms operate together: dual detection gates pipeline progression, while Completion Criteria gate artifact quality. Machine-checkable criteria catch cases where the file exists but is incomplete — missing required sections, missing tracking comments, or wrong format.

**Process before Specifications**: Process rules (e.g., "ask the user before making architecture decisions", "read existing files before generating") are workflow constraints that affect HOW the agent works. Specifications define WHAT the output should contain. An agent that reads specifications first and process rules second may execute in the wrong order — for example, generating a tech stack document without first reading the existing `package.json`. Placing Process third (after goal and criteria, but before specs) ensures workflow compliance even for agents that don't read the full prompt.

**Boilerplate extraction saves ~4,800 tokens**: Mode Detection blocks are ~300-400 tokens of identical logic across all prompts (check if artifact exists, branch on fresh vs. update). Moving this to the CLI saves ~4,000 tokens across a 20-prompt pipeline. "After This Step" sections are ~50 tokens each, saving ~800 more. These tokens are freed for prompt-specific content that actually helps the agent produce better output.

**CLI-handled mode detection over embedded detection**: The CLI has access to state.json and the filesystem — it can check artifact existence faster and more reliably than an agent parsing its own prompt text. The CLI tells the agent "this is a fresh run" or "this is an update, here is the existing artifact" in `scaffold run` output, which is cleaner than the agent running a Mode Detection heuristic embedded in the prompt.

## Alternatives Considered

### Free-Form Prompt Structure

- **Description**: No standardized section ordering. Each prompt author decides how to structure their content.
- **Pros**: Maximum flexibility for prompt authors. Authors can optimize structure for their specific prompt's needs.
- **Cons**: Inconsistent agent experience — agents cannot develop a reliable reading strategy. No machine-checkable completion criteria. Some prompts bury critical information deep in the content. Makes prompt authoring guidelines harder to enforce and review.

### v1 Structure (Mode Detection + After This Step Inline)

- **Description**: Keep Mode Detection and "After This Step" blocks in each prompt, as in v1.
- **Pros**: Self-contained prompts — each prompt works without CLI support. No dependency on CLI for mode detection or navigation.
- **Cons**: ~4,800 tokens wasted on identical boilerplate across the pipeline. Mode Detection logic is duplicated in every prompt and must be kept in sync. "After This Step" navigation hardcodes the pipeline order in each prompt, which breaks when the methodology defines a different ordering. The v2 CLI already manages state and navigation, making embedded logic redundant.

### Conclusion-First (Completion Criteria at End)

- **Description**: Follow natural document structure: introduction, body, conclusion. Completion criteria at the end as a summary of what was produced.
- **Pros**: Natural reading order for humans. Completion criteria serve as a review checklist after the work is done.
- **Cons**: Agents may not reach the completion criteria in limited context. The criteria are most useful BEFORE work begins (as a target), not after (as a checklist). Machine-checkable assertions at the end cannot be used by the agent to self-validate during execution.

### Strict Template with All Sections Required

- **Description**: Every prompt must include all five sections, even if a section is empty or contains only "N/A."
- **Pros**: Perfect consistency. Automated validation is simple (check for all five headings).
- **Cons**: Some prompts genuinely don't need all sections — a simple prompt that produces a single file may not need "Update Mode Specifics" if its update behavior is the same as fresh. Forcing empty sections wastes tokens and adds noise. The convention should require the ordering when sections are present, not mandate all sections exist.

## Consequences

### Positive
- Agents know their goal in the first ~50 tokens and the finish line in the first ~200 tokens, regardless of prompt length
- ~4,800 tokens freed from boilerplate across the pipeline, available for prompt-specific content
- `scaffold validate` can programmatically check completion using machine-checkable assertions from Completion Criteria sections
- Consistent structure across all prompts enables agents to develop reliable reading strategies
- Mode detection is more reliable when handled by the CLI (which has filesystem access) than by agents (which must parse prompt text)

### Negative
- Prompt authors must follow a rigid structure, which may feel constraining for prompts that don't fit the pattern naturally
- **Portability regression from v1**: v1 prompts are self-contained — a user can copy a single prompt file and paste it into any AI tool. v2 prompts that rely on the CLI for mode detection and navigation context cannot function standalone. Sharing a prompt, using it in a non-supported AI tool, or bypassing the CLI all lose mode detection and "what's next" guidance. The Universal adapter mitigates this partially, but the prompts themselves are less portable than v1.
- Machine-checkable assertions must be written carefully — an incorrect assertion causes `scaffold validate` to report false failures

### Neutral
- The five-section ordering is a convention, not an enforcement mechanism — tooling can validate structure but cannot prevent a determined author from violating it
- Update Mode Specifics is positioned last and may be empty for prompts with trivial update behavior, which is acceptable since the ordering is about priority, not completeness

## Constraints and Compliance

- All prompts MUST follow the defined section ordering when sections are present: What to Produce, Completion Criteria, Process, Detailed Specifications, Update Mode Specifics
- Completion Criteria MUST include machine-checkable assertions using checkbox syntax (`- [ ] <assertion>`)
- Mode Detection blocks MUST NOT appear in prompts — mode detection is handled by the CLI via `scaffold run`
- "After This Step" navigation MUST NOT appear in prompts — navigation is handled by the CLI via `scaffold next` and dependency resolution
- Prompt authors MUST put the most critical information (goal, key constraints) in the first 200 tokens of the prompt body
- `scaffold validate` MUST parse Completion Criteria sections and check assertions programmatically
- See the v2 spec's "Prompt Structure Convention" section for the canonical section definitions and rationale

## Related Decisions

- [ADR-015](ADR-015-prompt-frontmatter-schema.md) — Frontmatter schema that accompanies the structured prompt body
- [ADR-017](ADR-017-tracking-comments-artifact-provenance.md) — Tracking comments enable CLI-handled mode detection, replacing embedded Mode Detection blocks
- [ADR-018](ADR-018-completion-detection-crash-recovery.md) — Dual completion detection (artifact existence + state records) gates pipeline progression; Completion Criteria from this ADR provide complementary structural validation via `scaffold validate`
- [ADR-044](ADR-044-runtime-prompt-generation.md) — Runtime prompt generation that produces the final prompt content with this structure *(supersedes ADR-010)*
- [ADR-026](ADR-026-claude-md-section-registry.md) — Both address agent context and token optimization; prompt structure reduces per-prompt overhead while section registry manages CLAUDE.md budget
- Domain 08 ([08-prompt-frontmatter.md](../domain-models/08-prompt-frontmatter.md)) — Frontmatter metadata that precedes the structured sections
- Domain 09 ([09-cli-architecture.md](../domain-models/09-cli-architecture.md)) — CLI architecture that handles mode detection and navigation
