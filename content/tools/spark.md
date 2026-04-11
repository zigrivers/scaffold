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

## Purpose

Turn a vague project idea into a well-formed idea brief through Socratic
questioning and active research. Spark is two things in one: an interviewer
that asks hard questions AND a research companion that explores the problem
space and brings back insights the user hasn't considered.

The output (`docs/spark-brief.md`) feeds into `create-vision` as optional
upstream context, accelerating the vision step without replacing it.

**Prerequisite:** Requires `scaffold init` to have been run first.

## Inputs
- User's idea (provided via `$ARGUMENTS` or interactively)
- Existing `docs/spark-brief.md` (if rerunning — triggers update/fresh choice)
- Web search results (depth 2+, if available on the platform)
- External model responses (depth 4+, if Codex/Gemini CLI available)

## Expected Outputs
- `docs/spark-brief.md` — directional idea brief with 8 sections

## Rerun Detection

Before starting, check if `docs/spark-brief.md` already exists:

**If the file exists:**
1. Read the existing brief and present a 2-3 sentence summary to the user.
2. Ask: "Update this brief or start fresh?"
3. **Update mode**: Use the existing brief as a starting point. Preserve content
   that is still relevant. Focus on deepening, expanding, or revising specific
   sections. Increment the tracking comment version (e.g., `v1` → `v2`).
4. **Fresh mode**: Overwrite the brief entirely. Start from Phase 1.

**If the file does NOT exist:** Proceed to Phase 1.

## Instructions

### Phase 1: Seed

Capture and clarify the raw idea.

**If `$ARGUMENTS` is provided:** Use it as the starting idea. Confirm your
understanding with the user before proceeding.

**If `$ARGUMENTS` is blank:** Ask: "What idea do you want to explore?"

Clarify the basics through progressive questioning. Batch 2-3 related
questions per turn:

**Turn 1** — What are you building? Who is it for? What problem does it solve?

**Turn 2** — How do people solve this today? What's painful about that? How
often do they experience this pain?

**Turn 3** — Describe the person who needs this most. What are they doing the
moment before they reach for your product? What does "success" look like for them?

**Turn 4+** — Follow the gaps. If the audience is unclear, pull on that. If the
problem is well-defined but the solution is vague, focus there. Don't follow
a script — follow what's missing.

**Exit condition:** You can articulate the idea back to the user in 2-3
sentences and the user confirms "yes, that's it."

After Phase 1 completes, assess adaptive heuristics (see Adaptive Behavior
section below) to calibrate Phases 2-4 intensity.

### Phase 2: Research

Ground the idea in reality through competitive and market research.
Thoroughness scales with the project's configured depth.

**Depth 1:** Knowledge-based reasoning only. No web search. Draw on training
data to identify the most obvious competitors and alternatives.

**Depth 2:** 1-2 quick web searches for the most obvious competitors +
knowledge-based reasoning.

**Depth 3:** 2-3 targeted searches — direct competitors, market size, and
technology landscape.

**Depth 4:** Comprehensive research + dispatch to 1 external model for
independent competitive research.

```bash
# Check Codex or Gemini availability (see multi-model-research-dispatch knowledge)
# Prefer Gemini for research (Google search built-in)
# If unavailable, primary model does enhanced research with explicit
# competitor-analysis framing
```

**Depth 5:** Comprehensive research + multi-model dispatch with reconciliation.
Dispatch to both Codex AND Gemini for diverse perspectives. Reconcile:
2+ agree = consensus. Disagree = divergent — always present minority views.
Single model (fallback) = skip reconciliation labels.

**At all depths:** Bring findings INTO the conversation. Don't dump raw results —
synthesize: "I found 4 apps in this space — here's what they do well and
where they fall short."

**Exit condition (by depth):**
- Depth 1-2: At least 2 alternatives named (competitor, "do nothing," or
  adjacent). User acknowledges the landscape.
- Depth 3: Direct competitors and at least 1 indirect alternative researched
  with strengths/weaknesses. User acknowledges.
- Depth 4-5: Comprehensive landscape including direct, indirect, and emerging
  threats. If multi-model dispatched, perspectives synthesized. User acknowledges.

### Phase 3: Expand

Surface opportunities the user hasn't considered. Use the lightweight
expansion patterns from ideation-craft knowledge:

- Adjacent market: "Your users also need X — have you considered that?"
- Ecosystem play: "If you solve A, you're the natural place for B and C."
- Contrarian angle: "Everyone does X. What if you did the opposite?"
- Technology enabler: "A new capability makes Y possible — could that reshape
  your approach?"
- AI-native rethinking: "If AI could handle Z, how would that change the product?"

**Depth scaling:**
- Depth 1-2: 1-2 expansion suggestions with brief rationale.
- Depth 3: 3-5 ideas with rationale.
- Depth 4-5: Full expansion pass leveraging Phase 2 research. Generate ideas
  from existing data — no new searches in this phase.

Tag all expansion ideas as **preliminary** — the pipeline's `innovate-vision`
step does comprehensive strategic expansion later.

**Exit condition:** Present each expansion idea to the user. Each gets an
explicit disposition: **accept** (include in brief), **defer** (note as open
question), or **reject** (drop).
