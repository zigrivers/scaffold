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
