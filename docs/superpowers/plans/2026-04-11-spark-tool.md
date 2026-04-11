# Spark Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a stateless tool that turns vague project ideas into well-formed idea briefs through Socratic questioning and active research.

**Architecture:** Content-only implementation — 4 new markdown files (tool prompt + 3 knowledge entries), 3 modifications to existing pipeline/overlay files. No TypeScript changes. The existing assembly engine discovers and loads the tool automatically.

**Tech Stack:** Markdown content files, YAML frontmatter, scaffold assembly engine.

**Spec:** `docs/superpowers/specs/2026-04-11-spark-tool-design.md`

**Ordering:** Tasks 1-3 (knowledge entries) are independent and can run in parallel. Task 4 (game overlay) depends on Task 3. Tasks 5a-5d (spark.md) depend on Tasks 1-2 (frontmatter validation requires knowledge entries to exist). Tasks 6-7 (pipeline modifications) are independent of each other and of Task 5 — they can run in parallel with it.

---

### Task 1: Create ideation-craft knowledge entry

**Files:**
- Create: `content/knowledge/product/ideation-craft.md`

- [ ] **Step 1: Create the knowledge entry file**

```markdown
---
name: ideation-craft
description: Questioning techniques, research methodology, lightweight expansion patterns, and brief synthesis for early-stage idea exploration
topics: [ideation, questioning, research, competitive-analysis, brief-synthesis, socratic-method]
---

# Ideation Craft

## Summary

### Questioning Techniques
- **Socratic method**: Ask progressively deeper questions. Start with "what" (the idea), move to "who" (the audience), then "why" (the problem), then "why not" (the assumptions).
- **The 5 Whys**: When the user states a problem, ask "why?" five times to reach the root cause. Surface-level problems hide deeper opportunities.
- **"What would have to be true?"**: For every assumption, ask what conditions must hold for it to work. This surfaces hidden dependencies and risks.
- **Batching**: Group 2-3 related questions per turn. Don't pepper the user with single questions (wastes turns) or overwhelm with 10 at once (causes shallow answers).

### Research Methodology
- **Competitor scan**: Search for direct competitors (same problem, same audience), indirect alternatives (different approach, same problem), and the "do nothing" option (how users cope today).
- **What to capture per competitor**: Name, what they do well (be specific), where they fall short (be honest), pricing model, target audience, and why a user might choose them over the spark idea.
- **Adjacent markets**: Look for products solving related problems for the same audience, or the same problem for a different audience. These are expansion opportunities.
- **Market timing**: Why now? What changed (technology, regulation, culture, behavior) that makes this idea viable today when it wasn't before?

### Expansion Patterns (Lightweight)
- **Adjacent market**: "Your users also need X — have you considered expanding into that?"
- **Ecosystem play**: "If you solve A, you become the natural place to also solve B and C."
- **Contrarian angle**: "Everyone in this space does X. What if you deliberately did the opposite?"
- **Technology enabler**: "A new capability (API, model, platform) makes Y possible now — could that reshape your approach?"
- **AI-native rethinking**: "If you assumed AI could handle Z, how would that change the product?"

These are conversation starters for Phase 3 (Expand), not full strategic methodology. The pipeline's `innovate-vision` step covers comprehensive strategic expansion later.

### Brief Synthesis
- A good directional hypothesis names a specific audience, problem, and approach — not vague aspirations.
- Bad: "This app will help people be more productive." Good: "Freelance designers who lose 5+ hours/week to invoice tracking — a tool that auto-generates invoices from their time-tracking data."
- Tag confidence levels: "validated" (user confirmed + research supports), "hypothesized" (user stated but unresearched), "speculative" (surfaced during expansion, unconfirmed).
- Each brief section should be 2-4 sentences or concise bullet points. If a section has nothing, write "None identified" — don't fabricate.

## Deep Guidance

### Progressive Questioning Framework

**Turn 1 — Capture the spark**: What are you building? Who is it for? What problem does it solve?

**Turn 2 — Dig into the problem**: How do people solve this today? What's painful about the current approach? How often do they experience this pain?

**Turn 3 — Understand the audience**: Describe the person who needs this most. What are they doing the moment before they reach for your product? What does "success" look like from their perspective?

**Turn 4 — Challenge assumptions**: You said [X] — what evidence do you have? What would have to be true for [Y] to work? If [Z] turned out to be wrong, would the idea still make sense?

**Turn 5+ — Deepen based on gaps**: Follow the thread. If the audience is unclear, keep pulling on that. If the problem is well-defined but the solution is vague, focus there. Don't follow a script — follow the gaps.

### Competitive Research Process

1. **Start with the obvious**: Search for "[problem] app" or "[problem] tool." The first 5-10 results are the landscape the user will compete against.
2. **Check review sites**: App Store reviews, G2, Capterra, ProductHunt comments. Users complain about exactly the gaps a new product can fill.
3. **Look for failures**: Search "[category] startup failed" or "[competitor] shutdown." Failed attempts tell you what didn't work and why.
4. **Find the "do nothing" option**: How do people cope without any tool? Spreadsheets, manual processes, asking friends? This is often the biggest competitor.
5. **Assess timing**: Search for recent news, funding rounds, regulatory changes, or technology launches in the space. Timing explains why an idea works now when it didn't before.

### Framing Research for External Model Dispatch

When dispatching to an external model for competitive research (depth 4+), frame the prompt as:

> "Research the competitive landscape for [idea summary]. Identify: (1) Direct competitors solving the same problem for the same audience, (2) Indirect alternatives — different approaches to the same problem, (3) The 'do nothing' option — how users cope today, (4) Recent market signals — funding, launches, shutdowns, regulatory changes. For each competitor, note what they do well and where they fall short. Be honest — acknowledge genuine strengths."

### Brief Section Guidance

| Section | Source Phase | What to write | Common mistakes |
|---------|-------------|---------------|-----------------|
| Idea & Problem Space | Phase 1 (Seed) | Core idea, specific problem, target audience, why they need it | Too vague ("helps people"), no audience specificity |
| Landscape | Phase 2 (Research) | 2-5 competitors with strengths/weaknesses, positioning | Dismissing competitors, listing without analysis |
| Expansion Ideas | Phase 3 (Expand) | Accepted ideas tagged as preliminary, deferred ideas noted | Treating preliminary as committed scope |
| Constraints & Scope | Phase 4 (Challenge) | Confirmed assumptions, what's in/out, locked decisions | Scope too broad, no explicit "out" list |
| Technology Opportunities | Phase 2-3 | Tech enablers discovered during research/expansion | Listing technologies without explaining why they matter |
| Open Questions | All phases | Unresolved items that need answers before building | Ignoring questions that feel uncomfortable |
| Risks | Phase 4 (Challenge) | Market, technical, feasibility risks with severity | Only listing technical risks, ignoring market risks |
```

- [ ] **Step 2: Validate frontmatter**

Run: `make validate`
Expected: PASS — no errors for `ideation-craft`

- [ ] **Step 3: Commit**

```bash
git add content/knowledge/product/ideation-craft.md
git commit -m "feat(spark): add ideation-craft knowledge entry"
```

---

### Task 2: Create multi-model-research-dispatch knowledge entry

**Files:**
- Create: `content/knowledge/core/multi-model-research-dispatch.md`

- [ ] **Step 1: Create the knowledge entry file**

```markdown
---
name: multi-model-research-dispatch
description: Patterns for dispatching research and adversarial challenge to external AI models (Codex, Gemini) with reconciliation rules and single-model fallback
topics: [multi-model, research, competitive-analysis, red-team, codex, gemini, dispatch, reconciliation]
---

# Multi-Model Research Dispatch

## Summary

### When to Dispatch
| Depth | Research Dispatch | Challenge Dispatch |
|-------|-------------------|-------------------|
| 1-3 | Skip | Skip |
| 4 | 1 external model | 1 external model |
| 5 | Multi-model with reconciliation | Multi-model with reconciliation |

### Graceful Fallback Chain
1. Check if external CLI is available (`which codex`, `which gemini`)
2. If available, check auth (`codex login status`, `NO_BROWSER=true gemini -p "respond with ok" -o json`)
3. If auth succeeds, dispatch with timeout
4. If CLI unavailable or auth fails, skip that model — note in Session Metadata
5. If no external models available, fall back to primary model with distinct framing prompts
6. Never block the session waiting for unavailable tools

### Reconciliation Rules
- **2+ models agree** on the same finding = **consensus** — high confidence, present as validated
- **Models disagree** = **divergent** — present ALL perspectives including minority views. Do NOT suppress the minority. A 2-1 split where the lone dissent flags a real risk is more valuable than a comfortable consensus.
- **Single model** (fallback) = skip reconciliation labels. Present findings directly without consensus/divergent framing.

## Deep Guidance

### CLI Availability Check

Before dispatching, verify CLI tools are installed and authenticated:

```bash
# Codex CLI
which codex >/dev/null 2>&1 && codex login status 2>/dev/null
# Exit 0 = ready. Non-zero = skip Codex.

# Gemini CLI
which gemini >/dev/null 2>&1 && NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1
# Check for "ok" in response. Exit 41 = auth failure.
```

If auth fails, tell the user which tool failed and how to fix it:
- Codex: "Codex auth expired — run `codex login` to re-authenticate"
- Gemini: "Gemini auth expired — run `gemini -p 'hello'` to re-authenticate"

Auth failures are NOT silent fallbacks — surface them explicitly.

### Timeout Handling

| Dispatch type | Timeout |
|---------------|---------|
| Research dispatch (idea summary + questions) | 120 seconds |
| Challenge dispatch (full brief review) | 180 seconds |

If a dispatch times out:
- Use whatever partial response was received (if parseable)
- Note the timeout in Session Metadata
- Do NOT retry — proceed with available data

### Research Dispatch Mode

**When**: Phase 2 at depth 4-5.

**Prompt template for external model:**

```
You are conducting independent competitive research for a product idea.

IDEA: [1-2 sentence summary of the idea from Phase 1]

RESEARCH QUESTIONS:
1. What are the direct competitors in this space? For each, note what they do well and where they fall short.
2. What indirect alternatives exist — different approaches to the same problem?
3. How do users currently cope without a dedicated solution?
4. What recent market signals exist — funding rounds, product launches, shutdowns, regulatory changes?
5. What adjacent markets or analogous systems could inform this idea?

Be thorough and honest. Acknowledge competitor strengths — do not dismiss them.
Respond in structured markdown with one section per question.
```

**Execution:**

```bash
# Codex
codex exec --skip-git-repo-check -s read-only --ephemeral "RESEARCH_PROMPT" 2>&1

# Gemini
NO_BROWSER=true gemini -p "RESEARCH_PROMPT" --output-format json --approval-mode yolo 2>/dev/null
```

**Processing results:**
- Parse the response as structured markdown
- Extract key findings per research question
- If multi-model (depth 5), run reconciliation (see below)
- Present findings to the user conversationally, not as raw output

### Challenge Dispatch Mode (Red-Team)

**When**: Phase 6 at depth 4-5.

**Prompt template for external model:**

```
You are an adversarial reviewer stress-testing a product idea brief.
Your job is to find weaknesses, challenge assumptions, and surface missed opportunities.

SPARK BRIEF:
[Full content of the draft spark-brief.md]

CHALLENGE INSTRUCTIONS:
1. For each section, identify the weakest assumption and explain why it might be wrong.
2. What competitors or market dynamics does the brief underestimate?
3. What technical feasibility risks are glossed over?
4. What user segments or use cases are missing?
5. If you could only flag ONE critical risk, what would it be?

Be constructive but ruthless. The goal is to strengthen the idea, not validate it.
Respond in structured markdown with one section per challenge area.
```

**Processing results:**
- Parse challenges from response
- Present each challenge to the user one at a time
- For each challenge, ask: "Accept (update the brief), dismiss (explain why it's not applicable), or defer (note as open question)?"
- Track dispositions and update the brief accordingly

### Single-Model Fallback

When no external models are available, the primary model simulates multiple perspectives:

**Perspective 1 — Venture Capitalist**: "Analyze this idea as a VC evaluating a pitch. What's the market size? What's the defensibility? What are the unit economics? Would you invest?"

**Perspective 2 — Competitor's Product Lead**: "You're the product lead at [biggest competitor]. You just learned about this idea. What's your reaction? What would you do to defend your position? What aspects worry you?"

**Perspective 3 — Skeptical End User**: "You're a potential user who has tried and abandoned 3 similar products. What would make you try this one? What would make you abandon it after a week? What's the one thing that would keep you?"

Run each perspective as a separate reasoning pass. Synthesize the three viewpoints into findings the user can act on.

### Model Selection

| Task | Recommended model | Rationale |
|------|-------------------|-----------|
| Research dispatch | Either Codex or Gemini | Both capable of web-informed reasoning |
| Challenge dispatch | Either Codex or Gemini | Adversarial analysis is model-agnostic |
| Depth 4 (1 model) | Prefer Gemini (Google search built-in) | Strongest for competitive research |
| Depth 5 (multi) | Both Codex AND Gemini | Diverse perspectives from different architectures |
```

- [ ] **Step 2: Validate frontmatter**

Run: `make validate`
Expected: PASS — no errors for `multi-model-research-dispatch`

- [ ] **Step 3: Commit**

```bash
git add content/knowledge/core/multi-model-research-dispatch.md
git commit -m "feat(spark): add multi-model-research-dispatch knowledge entry"
```

---

### Task 3: Create game-ideation knowledge entry

**Files:**
- Create: `content/knowledge/game/game-ideation.md`

- [ ] **Step 1: Create the knowledge entry file**

```markdown
---
name: game-ideation
description: Game-specific ideation techniques for spark — core loop, player fantasy, retention, session design, monetization
topics: [game-dev, ideation, core-loop, player-fantasy, retention, monetization, session-design]
---

# Game Ideation

## Summary

### When This Applies
This knowledge is injected by the game overlay when a user is exploring a game idea via the spark tool. It supplements the general ideation-craft entry with game-specific lenses.

### Core Loop Identification
- **What is the core loop?** The repeating cycle of actions the player performs most often. In a shooter: aim → shoot → loot → repeat. In a puzzle game: observe → plan → execute → evaluate → repeat.
- **Ask the user**: "What does the player do every 30 seconds? Every 5 minutes? Every session?"
- **Test**: Can you describe the core loop in one sentence without using the word "and"? If not, it's too complex or undefined.

### Player Fantasy
- **What fantasy does the player live out?** Not the game mechanics — the emotional experience. "I am a powerful wizard" not "I cast spells with mana."
- **Ask the user**: "When the player tells their friend about your game, what do they say it feels like?"
- **Test**: Does every major mechanic reinforce the fantasy? If a mechanic exists but doesn't serve the fantasy, question why it's there.

### Retention Mechanics
- **Session hooks**: What brings the player back tomorrow? (Daily rewards, story cliffhangers, social obligations, unfinished goals)
- **Progression**: What does the player invest that makes leaving costly? (Character levels, base building, collection progress, social reputation)
- **Ask the user**: "What happens if the player doesn't open the game for a week? Do they lose anything? Miss anything?"

### Session Design
- **Session length**: How long is a typical play session? (Mobile: 3-5 min. PC: 30-90 min. Console: 60+ min.)
- **Session arc**: Does each session have a beginning, middle, and satisfying end? Can the player stop mid-session without frustration?
- **Ask the user**: "Where and when does your player play? Commute? Couch? Desk? This determines session length."

### Monetization Models
- **Premium**: Pay once, play forever. Best for narrative, creative, or skill-based games.
- **Free-to-play**: Free entry, monetize through cosmetics, battle pass, or convenience. Best for multiplayer/social games.
- **Subscription**: Recurring payment for ongoing content. Best for live-service games.
- **Ask the user**: "How does your player feel about spending money in your game? What would they pay for? What would feel unfair?"

## Deep Guidance

### Applying Game Lenses During Spark Phases

**Phase 1 (Seed)**: Ask about the core loop and player fantasy early. These are the foundation — if they're unclear, everything else is built on sand.

**Phase 2 (Research)**: Research competitors through a game lens. For each competitor: What's their core loop? What fantasy do they deliver? How do they monetize? What's their session design? Where do player reviews complain?

**Phase 3 (Expand)**: Use game-specific expansion angles:
- "What if the core loop had a social/multiplayer dimension?"
- "What if you added a metagame layer on top of the core loop?"
- "What platform would change the experience most? (Mobile → PC, or vice versa)"
- "What if monetization was through player-created content?"

**Phase 4 (Challenge)**: Challenge through game-specific risk lenses:
- "Core loop fatigue — will this still be fun after 100 hours?"
- "Monetization pressure — does the business model conflict with the player fantasy?"
- "Scope vs. team — can a [team size] team build this in [timeline]?"
- "Platform expectations — does the session design match the platform's usage patterns?"

### Game-Specific Brief Sections

When writing the spark brief for a game idea, adapt sections:
- **Idea & Problem Space** → Include the core loop and player fantasy
- **Landscape** → Frame competitors by core loop and fantasy, not just features
- **Expansion Ideas** → Tag which ideas affect the core loop vs. metagame vs. content
- **Risks** → Include core loop fatigue, monetization/fantasy tension, and scope risks
```

- [ ] **Step 2: Validate frontmatter**

Run: `make validate`
Expected: PASS — no errors for `game-ideation`

- [ ] **Step 3: Commit**

```bash
git add content/knowledge/game/game-ideation.md
git commit -m "feat(spark): add game-ideation knowledge entry"
```

---

### Task 4: Add game-ideation to game overlay

**Files:**
- Modify: `content/methodology/game-overlay.yml`

- [ ] **Step 1: Read the current game-overlay.yml**

Read the file to find the exact location of the `knowledge-overrides` section and the last entry in it.

- [ ] **Step 2: Add the spark knowledge override**

Add the following entry to the `knowledge-overrides` section (alphabetically or at the end, following the existing pattern):

```yaml
  spark:
    append: [game-ideation]
```

- [ ] **Step 3: Validate**

Run: `make validate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add content/methodology/game-overlay.yml
git commit -m "feat(spark): inject game-ideation via game overlay"
```

---

### Task 5a: Create spark.md — frontmatter + Purpose + Inputs + Expected Outputs + Rerun Detection

This is the first of 4 sub-tasks creating the spark tool prompt. Depends on Tasks 1-2 (knowledge entries must exist for frontmatter validation).

**Files:**
- Create: `content/tools/spark.md`

- [ ] **Step 1: Create the file with frontmatter and opening sections**

```markdown
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
```

- [ ] **Step 2: Validate frontmatter**

Run: `make validate`
Expected: PASS — no errors for `spark`

- [ ] **Step 3: Commit**

```bash
git add content/tools/spark.md
git commit -m "feat(spark): add spark.md skeleton — frontmatter, purpose, inputs, rerun detection"
```

---

### Task 5b: Append Phases 1-3 to spark.md

**Files:**
- Modify: `content/tools/spark.md`

- [ ] **Step 1: Append the Instructions section with Phases 1-3**

Append the following to `content/tools/spark.md`:

```markdown

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
```

- [ ] **Step 2: Validate (file still parseable)**

Run: `make validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add content/tools/spark.md
git commit -m "feat(spark): add Phases 1-3 (Seed, Research, Expand)"
```

---

### Task 5c: Append Phases 4-6 + Adaptive Behavior to spark.md

**Files:**
- Modify: `content/tools/spark.md`

- [ ] **Step 1: Append Phases 4-6 and Adaptive Behavior**

Append the following to `content/tools/spark.md`:

```markdown

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
```

- [ ] **Step 2: Validate**

Run: `make validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add content/tools/spark.md
git commit -m "feat(spark): add Phases 4-6 (Challenge, Synthesize, Red-Team) + Adaptive Behavior"
```

---

### Task 5d: Append Methodology Scaling + Brief Template + After This Step to spark.md

**Files:**
- Modify: `content/tools/spark.md`

- [ ] **Step 1: Append methodology scaling, brief template, and closing**

Append the following to `content/tools/spark.md`:

````markdown

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
<!-- scaffold:spark-brief v1 YYYY-MM-DD idea-slug -->

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

**Tracking comment format:** `<!-- scaffold:spark-brief v[N] YYYY-MM-DD idea-slug -->` where:
- `v[N]` increments on each update (v1, v2, v3...)
- `YYYY-MM-DD` is the session date
- `idea-slug` is a kebab-case slug derived from the idea name (e.g., `recipe-app-ai-meal-planning`)

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
````

- [ ] **Step 2: Validate**

Run: `make validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add content/tools/spark.md
git commit -m "feat(spark): add methodology scaling, brief template, and closing sections"
```

---

### Task 6: Add Spark Brief Detection to create-vision

**Files:**
- Modify: `content/pipeline/vision/create-vision.md`

- [ ] **Step 1: Read the current create-vision.md**

Read the file completely. Find the exact locations of these sections (heading levels may vary — search by name, not by heading level):
- The `Inputs` section
- The `Mode Detection` block
- The `Update Mode Specifics` block
- The `Phase 1: Strategic Discovery` heading

- [ ] **Step 2: Update the Inputs section**

Add `docs/spark-brief.md (optional)` to the Inputs list:

```markdown
## Inputs
- Project idea (provided by user verbally or in a brief)
- docs/spark-brief.md (optional) — upstream context from spark ideation session
- Existing project files (if brownfield — any README, docs, or code)
- Market context or competitive research (if available)
```

- [ ] **Step 3: Add Spark Brief Detection in Mode Detection flow**

Insert a `### Spark Brief Detection` block after the `### Mode Detection` block (and after `### Update Mode Specifics` if present) so that update mode's diff/preview flow includes spark-brief context:

```markdown
### Spark Brief Detection

**If `docs/spark-brief.md` exists**: Read it completely. Check its tracking
comment date and idea-slug against the `docs/vision.md` tracking comment
date (if vision exists) and the current `$ARGUMENTS`. If the brief predates
the current vision, ignore it and note: "Spark brief found but predates
current vision — ignoring." If the brief's idea-slug appears unrelated to
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

**If `docs/spark-brief.md` does NOT exist**: Proceed normally.
```

- [ ] **Step 4: Add Spark Brief Context at the beginning of Phase 1**

Insert the following block at the beginning of `Phase 1: Strategic Discovery`, before the discovery questions. This supplements (not duplicates) the full detection block above — FRESH MODE says "skip to Phase 1" so this block ensures spark-brief context is applied even when Mode Detection was skipped:

```markdown
### Spark Brief Context

**If `docs/spark-brief.md` was read during Spark Brief Detection above**, use
it as your baseline for this phase. Do not skip phases — use the brief's
answers as a starting point and ask targeted follow-up questions to deepen
and validate the brief's hypotheses to create-vision's required depth.

**If no spark brief exists**, proceed normally with the discovery questions below.
```

- [ ] **Step 5: Validate**

Run: `make validate`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add content/pipeline/vision/create-vision.md
git commit -m "feat(spark): add Spark Brief Detection to create-vision"
```

---

### Task 7: Add spark-brief Technology Opportunities to tech-stack

**Files:**
- Modify: `content/pipeline/foundation/tech-stack.md`

- [ ] **Step 1: Read the current tech-stack.md**

Read the file. Note the exact location of the `## Inputs` section.

- [ ] **Step 2: Add spark-brief as optional input**

Add to the Inputs section:

```markdown
- docs/spark-brief.md (optional) — Technology Opportunities section from spark ideation session. If present and not stale (compare tracking comment date against docs/vision.md and docs/plan.md — if the brief predates both, ignore it), use the Technology Opportunities section as supplementary research context when evaluating technology options.
```

- [ ] **Step 3: Validate**

Run: `make validate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add content/pipeline/foundation/tech-stack.md
git commit -m "feat(spark): add spark-brief Technology Opportunities to tech-stack inputs"
```

---

### Task 8: Validation and integration testing

**Note:** This is a main-agent/integrator task, NOT a subagent task. It requires cross-file context from all prior tasks.

**Files:**
- No new files — verification of all previous tasks

- [ ] **Step 1: Run full quality gates**

```bash
make check-all
```

Expected: All gates pass.

- [ ] **Step 2: Run scaffold build**

```bash
npm run build
```

Expected: Build succeeds with all new content files discovered.

- [ ] **Step 3: Verify spark tool is discoverable**

```bash
scaffold list --tools | grep spark
```

Expected: `spark` appears in the tool listing.

- [ ] **Step 4: Verify spark tool assembles correctly**

```bash
scaffold run spark --instructions "test idea" --format json
```

Expected: The assembled prompt output contains:
- The spark conversational framework (Phases 1-6)
- ideation-craft knowledge content
- multi-model-research-dispatch knowledge content

- [ ] **Step 5: Verify game overlay injects game-ideation**

In a project with `projectType: game` in `.scaffold/config.yml`:

```bash
scaffold run spark --instructions "test game idea" --format json
```

Expected: The assembled prompt additionally contains game-ideation knowledge.

- [ ] **Step 6: Verify create-vision integration**

Create a test `docs/spark-brief.md` file:

```bash
mkdir -p docs
cat > docs/spark-brief.md << 'BRIEF'
<!-- scaffold:spark-brief v1 2026-04-11 test-idea -->

# Spark Brief: Test Idea

> Generated by `scaffold run spark` — directional hypotheses, not validated conclusions.

## Idea & Problem Space
Test idea for integration verification.

## Session Metadata
- **Depth**: 3
- **Red-teamed**: no
- **Models consulted**: primary only
- **Date**: 2026-04-11
BRIEF
```

Then run create-vision and verify the assembled prompt includes spark brief detection:

```bash
scaffold run create-vision --instructions "test" --format json | grep -i "spark"
```

Expected: The create-vision prompt references the spark brief.

Clean up the test file after verification:

```bash
rm docs/spark-brief.md
```

- [ ] **Step 7: Commit any fixes**

If any validation steps required fixes, commit only the specific files that were fixed:

```bash
git add <specific-files-that-were-fixed>
git commit -m "fix(spark): address validation findings"
```
