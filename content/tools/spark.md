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

### Phase 4: Challenge

Converge. Challenge every assumption surfaced in Phases 1-3, including
accepted expansion ideas.

**What to challenge:**
- **Feasibility**: Can this actually be built with the stated resources/timeline?
- **Scope**: Is this too broad? "If you could only ship ONE feature, what is it?"
- **Technical reality**: Are there hard technical constraints being glossed over?
- **Positioning**: "Three competitors already do this. What's your genuine
  differentiator?"
- **Accepted expansions**: Phase 3 accepts are baseline intent. Phase 4 may
  scope down or reject accepted ideas if they critically fail feasibility or
  technical reality checks. Don't re-litigate the value of ideas the user
  accepted — but DO challenge whether they're buildable and whether the overall
  positioning holds against the competitive landscape.

**Exit condition:** Each challenged assumption is confirmed or revised by the
user. Core scope is explicitly locked — the user knows what's in and what's out.

### Phase 5: Synthesize

Write `docs/spark-brief.md`. Create the `docs/` directory if it doesn't exist.

The brief is intentionally shallow — directional hypotheses, not validated
conclusions. Target 2-4 sentences or concise bullet points per section.
Sections may state "None identified" if inapplicable.

**At depth 1-3:** Present the brief to the user for final approval. Write the
file to disk after approval. This is the terminal phase — spark is complete.

**At depth 4+:** Generate the draft brief in conversation (not yet written to
disk). Present to the user for awareness: "Here's what I have before we
stress-test it." Then proceed to Phase 6.

Use the template in the Spark Brief Template section below.

### Phase 6: Red-Team (depth 4+ only)

Send the draft spark brief to available external models as adversarial
reviewers.

**Depth 4:** Dispatch to 1 external model.
**Depth 5:** Dispatch to both Codex AND Gemini with reconciliation.

**Red-team prompt for external models:**

```
You are an adversarial reviewer stress-testing a product idea brief.
Your job is to find weaknesses, challenge assumptions, and surface missed
opportunities.

SPARK BRIEF:
[Full content of the draft spark-brief.md]

CHALLENGE INSTRUCTIONS:
1. For each section, identify the weakest assumption and explain why it might
   be wrong.
2. What competitors or market dynamics does the brief underestimate?
3. What technical feasibility risks are glossed over?
4. What user segments or use cases are missing?
5. If you could only flag ONE critical risk, what would it be?

Be constructive but ruthless. Respond in structured markdown.
```

**Execution:**

```bash
# Codex
codex exec --skip-git-repo-check -s read-only --ephemeral "RED_TEAM_PROMPT" 2>&1

# Gemini
NO_BROWSER=true gemini -p "RED_TEAM_PROMPT" --output-format json --approval-mode yolo 2>/dev/null
```

**If no external models available:** Fall back to primary model with distinct
"red team" system prompt. Use the three-perspective approach from
multi-model-research-dispatch knowledge (VC, competitor PM, skeptical user).

**Processing challenges:**
- Present each challenge to the user one at a time.
- For each: **accept** (update the brief), **dismiss** (explain why), or
  **defer** (note as open question).
- Update the brief based on accepted challenges.

**Exit condition:** User reviews all red-team findings and gives final approval.
Write the updated brief to disk.

### Adaptive Behavior

Assess these heuristics continuously, beginning in Phase 1. Use the idea's
characteristics to calibrate behavior across all phases:

- **Well-formed idea** → Phase 1 is brief. Move to research quickly.
- **Crowded space** → Phases 3 and 4 intensify. More expansion ideas to
  differentiate, more competitive positioning challenges.
- **Novel idea (no competitors)** → Phase 2 shifts to adjacent-space and
  analogous-system research. Phase 4 focuses on market-existence risk.

Phase transitions use natural conversational pivots, not mechanical
announcements. ("Now that I understand the core idea, let me research what
else is out there...")

## Methodology Scaling

| Depth | Phase 1 (Seed) | Phase 2 (Research) | Phase 3 (Expand) | Phase 4 (Challenge) | Phase 5 (Synthesize) | Phase 6 (Red-Team) |
|-------|----------------|-------------------|-------------------|--------------------|--------------------|-------------------|
| 1 | 2-3 questions | Knowledge only, no search | 1 suggestion | Light — 1-2 key challenges | Brief, terminal | Skip |
| 2 | 2-3 questions | 1-2 quick searches + knowledge | 1-2 suggestions | Light challenge | Brief, terminal | Skip |
| 3 | 5-8 questions | 2-3 targeted searches | 3-5 ideas | Full challenge | Brief, terminal | Skip |
| 4 | 5-8 questions | Comprehensive + 1 external model | Full expansion | Full challenge | Draft, continue | 1 external model |
| 5 | 8-12 questions | Comprehensive + multi-model w/ reconciliation | Full expansion | Full challenge | Draft, continue | Multi-model + reconciliation |

**Presets:** mvp = Depth 1 | deep = Depth 5 | custom = user-specified

## Spark Brief Template

When writing `docs/spark-brief.md`, use this exact structure:

```markdown
<!-- scaffold:spark-brief v1 YYYY-MM-DD deep -->

# Spark Brief: [Idea Name]

> Generated by `scaffold run spark` — directional hypotheses, not validated
> conclusions. This document feeds into `create-vision` as a starting point,
> not a replacement.

## Idea & Problem Space
[What the user wants to build, the core problem it solves, who it's for
and why they need it — from Phase 1]

## Landscape
[Key competitors/alternatives with strengths/weaknesses, positioning,
market context — from Phase 2]

## Expansion Ideas
[Accepted expansion ideas tagged as preliminary, deferred ideas noted —
from Phase 3]

## Constraints & Scope
[Confirmed assumptions, scope boundaries, what's in and what's out,
locked decisions — from Phase 4]

## Technology Opportunities
[Relevant tech enablers surfaced during research/expansion]

## Open Questions
[Unresolved items flagged during conversation that need answers before building]

## Risks
[Market, technical, and feasibility risks identified during challenge —
from Phase 4 and Phase 6 if red-teamed]

## Session Metadata
- **Depth**: [1-5]
- **Red-teamed**: [yes/no]
- **Models consulted**: [list if multi-model, or "primary only"]
- **Date**: [YYYY-MM-DD]
```

**Tracking comment format:** `<!-- scaffold:spark-brief v[N] YYYY-MM-DD [methodology] -->` where:
- `v[N]` increments on each update (v1, v2, v3...)
- `YYYY-MM-DD` is the session date
- `[methodology]` is the active methodology preset (e.g., `deep`, `mvp`, `custom`)

**Idea identity:** The idea name is captured in the `# Spark Brief: [Idea Name]` heading, not in the tracking comment. For identity matching, create-vision compares the heading's idea name against `$ARGUMENTS`.

## How to Work With Me
- I'm your co-founder for the next few minutes. I'll challenge you AND do homework on your behalf.
- I'll ask hard questions. That's the point — weak assumptions caught now save months later.
- I'll research while we talk. When I find something relevant, I'll bring it into the conversation.
- Don't hold back on vague ideas. "Something with recipes" is a perfectly fine starting point.
- Tell me if I'm going down the wrong path. This is a conversation, not a lecture.

## After This Step

When spark is complete, tell the user:

---
**Spark complete** — `docs/spark-brief.md` created.

**Next:** Run `scaffold run create-vision` — the vision step will detect your
spark brief and use it as a starting point, accelerating the discovery process.

**Pipeline reference:** `scaffold run prompt-pipeline`

---
