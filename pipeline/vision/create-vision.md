---
name: create-vision
description: Create a comprehensive product vision document from a project idea
phase: "vision"
order: 010
dependencies: []
outputs: [docs/vision.md]
conditional: null
knowledge-base: [vision-craft]
---

## Purpose
Transform a project idea into a strategic product vision document that defines
the product's purpose, target audience, competitive positioning, and guiding
principles. This is the North Star document that all subsequent phases reference.
The vision drives the PRD, architecture decisions, and implementation priorities
throughout the entire pipeline.

## Inputs
- Project idea (provided by user verbally or in a brief)
- Existing project files (if brownfield — any README, docs, or code)
- Market context or competitive research (if available)

## Expected Outputs
- docs/vision.md — Product vision document

## Quality Criteria
- Problem statement is specific and testable (not vague aspirations)
- Vision statement describes positive change in the world, not a product feature
- Vision statement is concise enough to remember after hearing once
- Target audience defined by behaviors and motivations, not demographics
- Competitive landscape is honest about competitor strengths, not just weaknesses
- Guiding principles create real tradeoffs (someone could reasonably disagree)
- Anti-vision names specific traps, not vague disclaimers
- Business model addresses sustainability without being a full business plan
- Every section is specific enough to guide PRD writing without strategic ambiguity

## Methodology Scaling
- **deep**: Comprehensive vision document. Full competitive research, detailed
  personas, 3-5 guiding principles with tradeoff framing, business model
  analysis, multi-year success horizon. 3-5 pages.
- **mvp**: Vision statement, target audience, core problem, value proposition,
  2-3 guiding principles. 1 page. Enough to anchor the PRD.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add competitive
  landscape and anti-vision. Depth 4: add business model and strategic risks.
  Depth 5: full document with all 12 sections.

## Mode Detection
If docs/vision.md exists, this is an update. Read and analyze the existing
document. Check for tracking comment: `<!-- scaffold:vision v<ver> <date> -->`.

## Update Mode Specifics
- **Detect prior artifact**: docs/vision.md exists
- **Preserve**: Vision statement (unless user explicitly wants to change it),
  guiding principles already validated, competitive analysis findings,
  user-approved strategic decisions
- **Triggers for update**: Strategic direction changed, new competitive intel,
  target audience refined, user wants deeper analysis
- **Conflict resolution**: if update contradicts existing guiding principles,
  surface the conflict to the user before proceeding

## Instructions

I have an idea for an application and I want you to help me create a
comprehensive product vision document that will serve as the strategic North
Star for all downstream product decisions.

### Mode Detection

Before starting, check if `docs/vision.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to Phase 1 and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:vision v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read `docs/plan.md` if it exists and verify updates won't contradict it.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content.
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:vision v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured, content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/vision.md`
- **Preserve**: Vision statement (unless user explicitly requests change), guiding principles, competitive findings, strategic decisions
- **Related docs**: `docs/plan.md`
- **Special rules**: Never change guiding principles without user approval. Preserve any strategic decisions that were explicitly made by the user.

## Here's my idea:
$ARGUMENTS

## Phase 1: Strategic Discovery

Use AskUserQuestionTool throughout this phase. Batch related questions together — don't ask one at a time.

### Understand the Problem Space
- What problem exists in the world? Who suffers from it? How do they cope today?
- Push for specificity — "everyone" is not a target audience, "it's slow" is not a problem statement
- What's the root cause of the pain, not just the symptom?
- How big is this problem? How many people experience it? How often?

### Articulate the Vision
- What does the world look like when this product succeeds?
- Craft the Geoffrey Moore elevator pitch together: For [target customer] who [need], the [product] is a [category] that [key benefit]. Unlike [alternative], our product [differentiation].
- Is this vision inspiring enough that someone would want to work on it?
- Could someone evaluate a product decision against this vision and get a clear yes/no?

### Define the Target Audience
- Deep persona work — behaviors, motivations, contexts of use (not demographics)
- Primary vs secondary audiences — who is the main user? Who else benefits?
- What are they doing the moment before they reach for this product?
- What does "success" look like from their perspective?

### Understand the Market
- What alternatives exist today? Direct competitors, indirect alternatives, "do nothing"
- Why do existing solutions fall short? Be specific.
- What's the market gap or timing advantage?
- Is this a new category, a better mousetrap, or a different approach entirely?

### Challenge and Innovate
- Challenge assumptions — if something doesn't make sense or is overengineered, say so
- Identify areas not considered (edge cases, market dynamics, competitive threats)
- Propose strategic angles the user hasn't thought of
- Be honest about weaknesses in the positioning

## Phase 2: Strategic Depth

Use AskUserQuestionTool. Batch related questions together.

### Business Model & Viability
- How does this make money (or sustain itself)?
- What's the go-to-market intuition? (Not a full business plan — directional thinking)
- What are the key unit economics assumptions?
- What would make this economically unviable?

### Guiding Principles
- Define 3-5 design tenets that will guide every downstream decision
- Frame as "When in doubt, we choose X over Y"
- These must actually constrain decisions — test each: would a reasonable team choose the opposite?
- If nobody would disagree with a principle, it's a platitude — cut it

### Anti-Vision
- What is this product explicitly NOT?
- What traps in this product space catch every competitor?
- What features or directions would dilute the vision?
- "If we find ourselves doing X, we've lost the plot"

### Success Horizon
- What does year 1 vs year 3 look like?
- What are the leading indicators that the vision is being realized?
- What would make this a failure even if it ships on time?
- How will we know if the guiding principles are actually guiding decisions?

## Phase 3: Competitive & Market Research

Research the competitive landscape using web search and any context the user provides:
- Identify direct competitors, indirect alternatives, and the "do nothing" option
- For each: what they do well, where they fall short, why users would choose this product instead
- Surface market trends, emerging patterns, and timing considerations
- Validate or challenge the user's assumptions about the market gap
- Be honest about what competitors do better — acknowledge strengths, don't dismiss them

## Phase 4: Documentation

Create `docs/vision.md` (create the `docs/` directory if it doesn't already exist) with tracking comment `<!-- scaffold:vision v1 YYYY-MM-DD -->` on line 1.

### Required Sections

1. **Vision Statement** — One inspiring sentence. The North Star. Should describe the positive change the product creates in the world, not a product feature. Must be concise enough to remember and repeat.

2. **Elevator Pitch** — Geoffrey Moore template filled in:
   > For [target customer] who [need], [product name] is a [product category] that [key benefit]. Unlike [primary alternative], our product [primary differentiation].

3. **Problem Space** — The pain in vivid detail: who feels it, how they cope today, why existing solutions fail, what the root cause is. Grounded in evidence, not assumptions.

4. **Target Audience** — Primary and secondary personas with:
   - Behaviors and motivations (not demographics)
   - Context of use (when, where, why they reach for this product)
   - Current workarounds and their limitations
   - What "success" looks like from their perspective

5. **Value Proposition** — The unique value delivered, framed as outcomes not features. Why someone would choose this over alternatives (including doing nothing).

6. **Competitive Landscape** — Market map showing:
   - Direct competitors and their strengths/weaknesses
   - Indirect alternatives (different approaches to the same problem)
   - The "do nothing" option and why it's insufficient
   - The product's genuine differentiation (not wishful thinking)

7. **Guiding Principles** — 3-5 design tenets framed as prioritization tradeoffs:
   - "We choose simplicity over power" or "We choose correctness over speed"
   - Each must actually constrain decisions — if nobody would disagree, it's not a principle

8. **Anti-Vision** — What the product is NOT:
   - Features and directions explicitly excluded
   - Common traps in this product space to avoid
   - "If we find ourselves doing X, we've lost the plot"

9. **Business Model Intuition** — Directional thinking about sustainability:
   - Revenue model (or how it sustains itself if non-commercial)
   - Key unit economics assumptions
   - Go-to-market direction (not a full GTM plan)

10. **Success Criteria** — Measurable indicators across time horizons:
    - Leading indicators (early signals the vision is working)
    - Year 1 milestones
    - Year 3 aspirations
    - What failure looks like (even if the product ships)

11. **Strategic Risks & Assumptions** — Explicit bets being made:
    - Key assumptions that must hold true for the vision to succeed
    - What could invalidate each assumption
    - Risk severity and mitigation thinking

12. **Open Questions** — Unresolved strategic questions:
    - Questions that don't need answers now but will need them eventually
    - Research or validation needed before committing to specific directions

### Documentation Quality Standards
- Every section must be specific enough to guide PRD writing without strategic ambiguity
- Avoid corporate boilerplate: "user-friendly interface" and "seamless experience" are banned
- The vision statement must be testable: could you evaluate a product decision against it and get a clear yes/no?
- Guiding principles must create real tradeoffs, not platitudes
- Competitive analysis must be honest about the product's weaknesses, not just strengths

## How to Work With Me
- Treat me as the product owner. I make the strategic calls, you make them happen.
- Don't overwhelm me with business jargon. Translate everything.
- Push back if my vision is unfocused, my positioning is weak, or my assumptions are wrong.
- Be honest about competitive threats. I'd rather adjust my strategy than be blindsided.
- Batch your questions using AskUserQuestionTool — don't pepper me one at a time.

## What This Document Should NOT Be
- A product requirements document — that comes later in create-prd
- A feature list — the vision is about purpose and positioning, not functionality
- Vague — "make the world a better place" is not a vision. Be specific.
- A business plan — business model intuition, not a 50-page plan
- Corporate boilerplate — if it could apply to any product, it's useless

I don't just want a document. I want a North Star that every team member can point to when making a difficult product decision.

## After This Step

When this step is complete, tell the user:

---
**Phase 0 complete** — `docs/vision.md` created.

**Next:** Run `/scaffold:review-vision` — Review the vision for clarity, coherence, and downstream readiness.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
