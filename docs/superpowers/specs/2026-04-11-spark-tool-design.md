# Spark Tool Design

## Overview

Spark is a stateless tool (`content/tools/spark.md`) that takes a vague project idea and turns it into a well-formed idea brief (`docs/spark-brief.md`) through Socratic questioning and active research. It sits upstream of the pipeline — the brief feeds into `create-vision` as optional context, accelerating the vision step without replacing it.

Spark is two things in one: a Socratic interviewer that asks hard questions AND a research-driven innovation companion that actively explores the problem space and brings back insights the user hasn't considered.

**Invocation:** `scaffold run spark --instructions "a recipe app with AI meal planning"` or `scaffold run spark` (interactive mode) or via the runner skill in Claude Code, Codex CLI, Gemini CLI.

**Prerequisite:** Requires `scaffold init` to have been run first (`.scaffold/` directory must exist). This is consistent with all other tools and pipeline steps. The runner skill handles initialization automatically.

---

## 1. Tool Identity & Frontmatter

```yaml
---
name: spark
description: Explore a raw project idea through Socratic questioning and research
summary: "Takes a vague idea and turns it into a well-formed idea brief through probing questions, competitive research, and innovation expansion. At higher depths, dispatches multi-model research and adversarial stress-testing. Feeds directly into create-vision."
phase: null
order: null
dependencies: []
outputs: [docs/spark-brief.md]
conditional: null
stateless: true
category: tool
knowledge-base: [ideation-craft, multi-model-research-dispatch]
argument-hint: "<idea or blank for interactive>"
---
```

### Key decisions

- **Stateless tool, not a pipeline step.** Users invoke spark on-demand via `scaffold run` or the runner skill. No state tracking, no dependency graph participation.
- **`outputs: [docs/spark-brief.md]`** is documentation-only for stateless tools (precedent: `post-implementation-review`). The state manager ignores it at runtime.
- **Two knowledge entries injected:**
  - `ideation-craft` — questioning techniques, research methodology, brief synthesis, lightweight expansion patterns
  - `multi-model-research-dispatch` — research and adversarial dispatch patterns
- **Game overlay** conditionally adds `game-ideation` when active — not in spark's frontmatter directly.
- **`multi-model-research-dispatch`** is a NEW entry alongside existing `multi-model-review-dispatch` (additive, no rename, no migration of the 32 existing references).

---

## 2. Conversational Framework & Phases

Spark uses a hybrid rhythm — loose phases as guardrails, adaptive within each. Questions are batched 2-3 per turn (matching scaffold's established convention), with progressive depth across turns.

### Phase 1: Seed (always runs)

- Capture the raw idea. User provides it as an argument or interactively. If no argument is provided, the first question should be: "What idea do you want to explore?"
- Clarify the basics: What is it? Who is it for? What problem does it solve?
- Batch 2-3 related questions per turn. Progressive depth across turns.
- **Exit condition:** The AI can articulate the idea back to the user and the user confirms.

### Rerun behavior

If `docs/spark-brief.md` already exists when spark is invoked:
- Read the existing brief and present a summary to the user.
- Ask: "Update this brief or start fresh?"
- **Update mode**: Use the existing brief as a starting point. Preserve content that is still relevant. Focus on deepening, expanding, or revising specific sections.
- **Fresh mode**: Overwrite the brief entirely. Start from Phase 1.
- Increment the tracking comment version on update (e.g., `v1` → `v2`).

### Phase 2: Research (always runs — thoroughness scales with depth)

- Landscape grounding: competitors, adjacent products, analogous systems, market context, technology options.
- Depth 1: Knowledge-based reasoning only, no web search.
- Depth 2: 1-2 quick searches for the most obvious alternatives + knowledge-based reasoning.
- Depth 3: 2-3 targeted searches (direct competitors, market size, tech landscape).
- Depth 4: Comprehensive research + dispatch to 1 external model for independent competitive research. If external model unavailable, primary model does enhanced research with explicit competitor-analysis framing.
- Depth 5: Comprehensive research + multi-model dispatch with reconciliation. If external models unavailable, primary model does enhanced research.
- Multi-model synthesis (D4-5 dispatch only): 2+ models agree = consensus, models disagree = divergent — always present all perspectives including minority views. Single model = present findings without synthesis labels.
- Bring findings INTO the conversation.
- **Exit condition** (by depth):
  - Depth 1-2: At least 2 alternatives named (competitor, "do nothing," or adjacent). User acknowledges.
  - Depth 3: Direct competitors and at least 1 indirect alternative researched with strengths/weaknesses. User acknowledges.
  - Depth 4-5: Comprehensive landscape including direct, indirect, and emerging threats. If multi-model dispatched, perspectives synthesized. User acknowledges.

### Phase 3: Expand (always runs — depth scales intensity)

- Innovation companion mode. Surface opportunities the user hasn't considered.
- Adjacent markets, technology enablers, ecosystem plays, contrarian angles.
- Depth 1-2: 1-2 expansion suggestions with brief rationale. Depth 3: 3-5 ideas. Depth 4-5: full expansion pass leveraging Phase 2 research (no new searches — generate ideas from existing data).
- This is a lightweight preview — the pipeline's `innovate-vision` step does comprehensive strategic expansion later. Tag ideas as preliminary.
- **Exit condition:** Each expansion idea gets explicit disposition from user: accept, defer, or reject.

### Phase 4: Challenge (always runs)

- Converge. Challenge assumptions surfaced in Phases 1-3, including accepted expansion ideas.
- Challenge feasibility, scope impact, technical reality, AND positioning/differentiation against the competitive landscape. Phase 3 accepts are baseline intent — Phase 4 may scope down or reject accepted ideas if they critically fail feasibility or technical reality checks. Don't re-litigate the value of ideas the user accepted, but DO challenge whether they're buildable and whether the overall positioning holds.
- "Three competitors already do this. What's your genuine differentiator?"
- Scope sharpening: "If you could only ship ONE feature, what is it?"
- **Exit condition:** Each challenged assumption confirmed or revised by user. Core scope explicitly locked.

### Phase 5: Synthesize (always runs)

- Write `docs/spark-brief.md` — intentionally shallow, directional hypotheses. Target 2-4 sentences or concise bullet points per section. Sections may state "None identified" if inapplicable.
- Defined sections (see Section 3 for full format):
  1. **Idea & Problem Space** — What the user wants to build, the core problem, who it's for
  2. **Landscape** — Key competitors/alternatives, positioning, market context
  3. **Expansion Ideas** — Accepted expansion ideas, tagged as preliminary
  4. **Constraints & Scope** — Confirmed assumptions, scope boundaries, locked decisions
  5. **Technology Opportunities** — Relevant tech enablers surfaced during research/expansion
  6. **Open Questions** — Unresolved items flagged during conversation
  7. **Risks** — Market, technical, and feasibility risks identified during challenge
  8. **Session Metadata** — Depth, red-team status, models consulted, date (appended automatically, not conversational output)
- Create the `docs/` directory if it doesn't already exist (same pattern as create-vision).
- At depth 1-3: Present brief to user for final approval. Write file to disk after approval. Terminal phase.
- At depth 4+: Generate draft brief in conversation (not yet written to disk). Present to user for awareness, then proceed to Phase 6.
- This gives `create-vision` a running start, not a replacement for its own rigor.

### Phase 6: Red-Team (depth 4+ only)

- Send the draft spark brief to available external models as adversarial reviewers.
- Depth 4: 1 external model. Depth 5: multi-model with reconciliation.
- "Find weaknesses, challenge assumptions, surface missed opportunities."
- If only one external model available, use it. If none available, fall back to primary model with a distinct "red team" system prompt.
- Feed challenges back to the user for a final refinement pass on the brief.
- **Exit condition:** User reviews red-team findings, accepts/dismisses each. Brief updated and user gives final approval. File written to disk.

### Adaptive behavior

The AI assesses these heuristics continuously, beginning in Phase 1, using the idea's characteristics to calibrate behavior across all phases:

- If the idea is already well-formed, Phase 1 is brief — move to research quickly.
- If research reveals a crowded space, Phases 3 and 4 intensify — more expansion ideas to differentiate, more competitive positioning challenges.
- If the idea is genuinely novel (no direct competitors), Phase 2 shifts to adjacent-space and analogous-system research. Phase 4 focuses on market-existence risk instead of competitive pressure.
- Phase transitions use natural conversational pivots, not mechanical announcements.

---

## 3. Spark Brief Structure & create-vision Integration

### `docs/spark-brief.md` format

```markdown
<!-- scaffold:spark-brief v1 YYYY-MM-DD methodology -->

# Spark Brief: [Idea Name]

> Generated by `scaffold run spark` — directional hypotheses, not validated
> conclusions. This document feeds into `create-vision` as a starting point,
> not a replacement.

## Idea & Problem Space
[What the user wants to build, the core problem it solves, who it's for
and why they need it]

## Landscape
[Key competitors/alternatives, positioning, market context]

## Expansion Ideas
[Accepted expansion ideas, tagged as preliminary]

## Constraints & Scope
[Confirmed assumptions, scope boundaries, locked decisions]

## Technology Opportunities
[Relevant tech enablers surfaced during research/expansion]

## Open Questions
[Unresolved items flagged during conversation]

## Risks
[Market, technical, and feasibility risks identified during challenge]

## Session Metadata
- **Depth**: [1-5]
- **Red-teamed**: [yes/no]
- **Models consulted**: [list if multi-model, informational only]
- **Date**: [YYYY-MM-DD]
```

### Key decisions

- Tracking comment on line 1 follows the same convention as `create-vision` uses for `docs/vision.md`. Includes an methodology for identity matching.
- Header banner makes the artifact's intent explicit — directional, not authoritative.
- Session Metadata lets create-vision know provenance. "Red-teamed" has behavioral impact (see below). "Depth" and "Models consulted" are informational only.
- Each section maps to a conversational phase.
- Spark brief detection in create-vision is done via filesystem check in the prompt body (check if file exists on disk), NOT via the `reads` frontmatter field — spark is stateless and has no pipeline state to reference.

### create-vision integration

**Modification to `content/pipeline/vision/create-vision.md`:**

1. **Inputs section** — add `docs/spark-brief.md (optional)` to the existing inputs list.

2. **New `### Spark Brief Detection` block** — inserted in TWO locations within create-vision.md:
   - **In Mode Detection flow** (alongside the existing `### Mode Detection` block): So that update mode's diff/preview/approval flow includes spark-brief context. The user sees the brief's influence before approving the update plan.
   - **At the beginning of `## Phase 1: Strategic Discovery`**: So that FRESH MODE (which says "skip to Phase 1") naturally reaches the detection block.

   Both locations use the same detection logic. Follows the `create-prd.md` "Understand the Vision" if/else pattern:

```markdown
### Spark Brief Detection

**If `docs/spark-brief.md` exists**: Read it completely. Check its tracking
comment date and methodology against the `docs/vision.md` tracking comment
date (if vision exists) and the current `$ARGUMENTS`. If the brief predates
the current vision, ignore it and note: "Spark brief found but predates
current vision — ignoring." If the brief's methodology appears unrelated to
the current `$ARGUMENTS`, ask the user before using it.

Otherwise, this is upstream context from a spark ideation session — the user
has already explored the problem space, researched competitors, expanded the
idea, and challenged assumptions.

**Accelerated mode**: Use the brief's answers as a baseline and ask targeted
follow-up questions to expand them to create-vision's required depth. Do not
skip phases — deepen and validate the brief's hypotheses rather than
re-exploring from scratch.

If the brief was red-teamed (Session Metadata), treat its competitive
landscape and risk sections as pre-validated hypotheses — focus discovery on
gaps or updates rather than re-exploring those areas.

create-vision uses its own configured depth regardless of the brief's depth.
The brief's depth metadata is informational — it tells you how thoroughly
the idea was explored, not how thorough this vision step should be.

Defer the brief's "Technology Opportunities" section to downstream phases
(tech-stack, architecture) — the vision document is about purpose and positioning,
not technical implementation.

**If `docs/spark-brief.md` does NOT exist**: Proceed normally with Phase 1
discovery questions.
```

**What create-vision does NOT change:**
- It still runs all its own phases (Strategic Discovery, Strategic Depth, Competitive Research, Documentation).
- It still produces the full 12-section `docs/vision.md`.
- It still applies its own quality criteria.
- The spark brief accelerates the conversation, it doesn't skip the vision step.

**Technology Opportunities downstream path:**
The spark brief's "Technology Opportunities" section is deferred by create-vision to downstream phases. To ensure this research is not lost, the `tech-stack` step (`content/pipeline/foundation/tech-stack.md`) should check for `docs/spark-brief.md` as supplementary context, specifically consuming the Technology Opportunities section when researching and deciding technology options. This is the aligned consumer — tech-stack handles technology decisions, not the PRD (which is requirements synthesis). This is a minor modification to tech-stack's Inputs section.

tech-stack should apply the same freshness guard as create-vision: compare the spark-brief's tracking comment date against `docs/vision.md` and `docs/plan.md` dates. If the brief predates both, ignore it — the project has moved past the spark session's context.

---

## 4. Knowledge Entries & Methodology Scaling

### New knowledge entries

**1. `content/knowledge/product/ideation-craft.md`**

Scope — questioning, research methodology, lightweight expansion patterns, and brief synthesis:

- **Questioning techniques**: Socratic method adapted for product ideation. Progressive depth. The 5 Whys for problem space. "What would have to be true?" framing for assumptions. How to batch questions effectively (2-3 per turn).
- **Research methodology**: How to conduct rapid competitive research. What to look for in competitors (strengths, weaknesses, positioning, pricing, user reviews). How to identify adjacent markets. How to assess market timing. How to frame research for external model dispatch.
- **Lightweight expansion patterns**: One-liner prompts for Phase 3 ideation — adjacent markets, ecosystem plays, contrarian positioning, technology enablers, AI-native rethinking. These are conversation starters, not full strategic methodology (the pipeline's `innovate-vision` step covers comprehensive strategic expansion later via the `vision-innovation` knowledge entry).
- **Brief synthesis**: How to distill a conversation into a useful brief. What makes a good directional hypothesis vs. a vague statement. How to tag confidence levels. Section-by-section guidance for the spark-brief format.

Does NOT include full strategic innovation methodology (covered by `vision-innovation` in the pipeline) or game-specific content (covered by `game-ideation`).

**2. `content/knowledge/game/game-ideation.md`**

Game-specific ideation techniques, injected conditionally via the game overlay:

- Core loop identification and evaluation
- Player fantasy articulation
- Retention mechanics and session design
- Monetization model considerations
- How to apply these lenses during spark's Expand and Challenge phases

**3. `content/knowledge/core/multi-model-research-dispatch.md`**

Research and adversarial dispatch patterns. Self-contained — does not rely on runtime cross-references to other entries (the assembly engine only loads entries named in frontmatter):

- **CLI availability and timeout handling**: Self-contained auth checks, timeout rules, graceful fallback (mirrors the patterns in `multi-model-review-dispatch` but written independently for this entry).
- **Research dispatch mode**: How to frame research prompts for external models. What context to include (idea summary, specific research questions). How to synthesize results.
- **Reconciliation rules**: 2+ models agree = consensus, models disagree = divergent, always present all perspectives including minority views. Single model = skip reconciliation labels.
- **Challenge dispatch mode**: How to frame adversarial red-team prompts. What the draft brief should include. How to present challenges back to the user. Accept/dismiss disposition tracking.
- **Single-model fallback**: How to simulate multi-perspective research with distinct framing prompts (VC perspective, competitor's product lead, skeptical end user).

### Methodology scaling

| Depth | Phase 1 (Seed) | Phase 2 (Research) | Phase 3 (Expand) | Phase 4 (Challenge) | Phase 5 (Synthesize) | Phase 6 (Red-Team) |
|-------|----------------|-------------------|-------------------|--------------------|--------------------|-------------------|
| 1 | 2-3 questions | Knowledge only, no search | 1 suggestion | Light — 1-2 key challenges | Brief, terminal | Skip |
| 2 | 2-3 questions | 1-2 quick searches + knowledge | 1-2 suggestions | Light challenge | Brief, terminal | Skip |
| 3 | 5-8 questions | 2-3 targeted searches | 3-5 ideas | Full challenge | Brief, terminal | Skip |
| 4 | 5-8 questions | Comprehensive + 1 external model | Full expansion | Full challenge | Draft, continue | 1 external model |
| 5 | 8-12 questions | Comprehensive + multi-model w/ reconciliation | Full expansion | Full challenge | Draft, continue | Multi-model + reconciliation |

### Preset mapping

- **mvp**: Depth 1 — bare minimum, knowledge-only, enough to sanity-check the idea
- **deep**: Depth 5 — comprehensive research, multi-model dispatch, full red-team with reconciliation
- **custom**: User-specified depth 1-5

### Game overlay extension

The game overlay (`content/methodology/game-overlay.yml`) needs a new `knowledge-overrides` entry to inject `game-ideation` into the spark tool when the game overlay is active. This follows the established overlay mechanism used for 30+ other step/knowledge combinations.

---

## 5. Implementation Scope

### Files to create
- `content/tools/spark.md` — tool prompt with full conversational framework
- `content/knowledge/product/ideation-craft.md` — questioning and synthesis knowledge
- `content/knowledge/game/game-ideation.md` — game-specific ideation knowledge
- `content/knowledge/core/multi-model-research-dispatch.md` — research dispatch patterns

### Files to modify
- `content/pipeline/vision/create-vision.md` — add Spark Brief Detection block and update Inputs section
- `content/pipeline/foundation/tech-stack.md` — add spark-brief Technology Opportunities as supplementary input
- `content/methodology/game-overlay.yml` — add `game-ideation` knowledge override for spark

### Files NOT modified
- `src/` — no TypeScript changes needed. Spark is a tool discovered by the existing assembly engine.
- `multi-model-review-dispatch.md` — untouched, no rename, no migration.
- Existing pipeline steps — no changes to any step's frontmatter or dependencies.

### Testing approach
- Frontmatter validation: `make validate` ensures spark.md passes schema checks
- Knowledge entry validation: verify entries load correctly via `scaffold run spark` at various depths
- Integration test: verify create-vision detects spark-brief.md and enters accelerated mode
- Game overlay test: verify game-ideation is injected when overlay is active
