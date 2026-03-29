---
description: "Create a comprehensive product vision document from a project idea"
long-description: "Asks about your idea — who it's for, what problem it solves, what makes it different — and produces a vision document with elevator pitch, target audience, competitive positioning, guiding principles, and success criteria."
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
- (mvp) Problem statement is specific and testable (not vague aspirations)
- (mvp) Vision statement describes positive change in the world, not a product feature
- (mvp) Vision statement is a single sentence of 25 words or fewer
- (mvp) Target audience defined by behaviors and motivations, not demographics
- (deep) Each named competitor has >= 1 documented strength and >= 1 documented weakness with specific examples
- (mvp) Each guiding principle is framed as 'We choose X over Y' where Y is a legitimate alternative
- (deep) Anti-vision contains >= 3 named traps, each referencing a concrete product direction or feature class
- (deep) Business model addresses sustainability without being a full business plan
- (mvp) Every section names at least one concrete decision or constraint
- (mvp) Vision does not contradict docs/plan.md (if PRD exists in update mode)

## Methodology Scaling
- **deep**: Comprehensive vision document. Full competitive research, detailed
  personas, 3-5 guiding principles with tradeoff framing, business model
  analysis, multi-year success horizon. 3-5 pages.
- **mvp**: Vision statement, target audience, core problem, value proposition,
  2-3 guiding principles. 1 page. Enough to anchor the PRD.
- **custom:depth(1-5)**:
  - Depth 1: MVP-style — vision statement, target audience, core problem, value proposition. 1 page.
  - Depth 2: MVP + 2-3 guiding principles with tradeoff framing. 1-2 pages.
  - Depth 3: Add competitive landscape and anti-vision. 2-3 pages.
  - Depth 4: Add business model, strategic risks, and success horizon. 3-4 pages.
  - Depth 5: Full document with all 12 sections, multi-year success criteria. 3-5 pages.

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

---

## Domain Knowledge

### vision-craft

*What makes a good product vision — strategic framing, audience definition, competitive positioning, guiding principles*

# Vision Craft

A product vision document is the strategic North Star that guides all downstream product decisions. It answers "why does this product exist?" and "what positive change does it create in the world?" — questions that are upstream of the PRD's "what should we build?" Everything in the pipeline flows from the vision. A weak vision produces a PRD without strategic grounding, which produces features without coherent purpose.

## Summary

### Vision Document Structure

A complete product vision document includes these sections:
1. **Vision Statement** — One inspiring sentence describing the positive change the product creates. Not a feature description. Concise enough to remember and repeat.
2. **Elevator Pitch** — Geoffrey Moore template: For [target customer] who [need], [product] is a [category] that [key benefit]. Unlike [alternative], our product [differentiation].
3. **Problem Space** — The pain in vivid detail: who feels it, how they cope, why existing solutions fail.
4. **Target Audience** — Personas defined by behaviors and motivations, not demographics. Primary and secondary audiences with context of use.
5. **Value Proposition** — Unique value framed as outcomes, not features. Why someone would choose this over alternatives.
6. **Competitive Landscape** — Direct competitors, indirect alternatives, "do nothing" option. Honest about strengths and weaknesses.
7. **Guiding Principles** — 3-5 design tenets framed as prioritization tradeoffs ("We choose X over Y").
8. **Anti-Vision** — What the product is NOT. Traps to avoid. Directions that would dilute the vision.
9. **Business Model Intuition** — Revenue model, unit economics assumptions, go-to-market direction.
10. **Success Criteria** — Leading indicators, year 1 milestones, year 3 aspirations, what failure looks like.
11. **Strategic Risks & Assumptions** — Key bets, what could invalidate them, severity and mitigation.
12. **Open Questions** — Unresolved strategic questions for future consideration.

### Quality Criteria

- Vision statement describes positive change, not a product feature
- Vision statement is concise enough to remember after hearing once
- Guiding principles create real tradeoffs (if nobody would disagree, it's not a principle)
- Competitive analysis is honest about the product's weaknesses, not just strengths
- Target audience describes behaviors and motivations, not demographics
- Business model section addresses sustainability without being a full business plan
- Anti-vision prevents real traps, not just vague disclaimers

## Deep Guidance

### Vision Statement

The vision statement is the foundation. If it fails, the entire document lacks a North Star.

#### What Makes a Good Vision Statement

A good vision statement is **inspiring**, **concise**, **enduring**, and **customer-centric**. It describes the positive change the product creates in the world — not a feature, not a business metric.

**Good examples:**
- "Accelerate the world's transition to sustainable energy" (Tesla)
- "Belong anywhere" (Airbnb)
- "Create economic opportunity for every member of the global workforce" (LinkedIn)
- "Every book ever printed, in any language, all available in 60 seconds" (Kindle)
- "Make work life simpler, more pleasant, and more productive" (Slack)
- "Increase the GDP of the internet" (Stripe)

**Bad examples:**
- "Be the #1 project management tool in the enterprise market" (business metric, not positive change)
- "Build an AI-powered platform for data analytics" (solution description, not vision)
- "Provide a seamless user experience for managing tasks" (vague, feature-level)
- "Disrupt the healthcare industry" (aspirational buzzword, says nothing specific)

#### Roman Pichler's Vision Quality Checklist

- **Inspiring** — Describes a positive change that motivates people
- **Shared** — Co-created with the team, not handed down from above
- **Ethical** — Does not cause harm to people or the planet
- **Concise** — Easy to understand, remember, and repeat
- **Ambitious** — A big, audacious goal (BHAG) that stretches beyond the comfortable
- **Enduring** — Guides for 5-10 years; free from solution-specific assumptions

### Geoffrey Moore's Elevator Pitch Template

From *Crossing the Chasm* — the most widely used single-statement framework for articulating product positioning:

```
For [target customer]
Who [statement of need or opportunity],
The [product name] is a [product category]
That [key benefit, reason to buy].
Unlike [primary competitive alternative],
Our product [statement of primary differentiation].
```

**When to use:** As a structured exercise to force clarity about target customer, need, category, and differentiation. The output should feel like a natural sentence, not a fill-in-the-blank template.

### Guiding Principles

Guiding principles are design tenets that constrain decisions. They are NOT platitudes.

#### The Test

If nobody would disagree with a principle, it's not a principle — it's a platitude. "We value quality" is not a principle. "We choose correctness over speed" is a principle because it implies a real tradeoff (some teams would choose the opposite).

**Good principles (create real tradeoffs):**
- "We choose simplicity over power" (implies some features won't exist)
- "We choose transparency over control" (implies users see everything, even messy internals)
- "We choose speed of iteration over perfection" (implies shipping rough work)
- "We choose privacy over personalization" (implies less-tailored experiences)

**Bad principles (platitudes):**
- "We value user experience" (who wouldn't?)
- "We build reliable software" (this is table stakes, not a principle)
- "We care about security" (no one would say they don't)

### Anti-Vision

The anti-vision explicitly names what the product is NOT. This is critical for preventing scope creep and maintaining strategic focus.

#### What to Include

- Features the team will be tempted to build but shouldn't
- Common traps in this product space that catch every competitor
- Directions that would dilute the core value proposition
- "If we find ourselves doing X, we've lost the plot"

#### Why It Matters

Without an anti-vision, the team defaults to "yes" for every reasonable-sounding feature request. The anti-vision gives explicit permission to say "no."

### Competitive Landscape

#### Honest Competitive Analysis

The competitive landscape section must be honest — acknowledge what competitors do well, not just where they fall short. A dishonest competitive analysis ("all competitors are terrible") undermines credibility and leads to blind spots in product strategy.

**Structure:**
- **Direct competitors** — Products solving the same problem for the same users
- **Indirect alternatives** — Different approaches to the same underlying need
- **"Do nothing" option** — The status quo. Often the strongest competitor.

For each: what they do well, where they fall short, and why users would choose your product over them.

### Common Anti-Patterns

1. **Confusing Vision with Strategy** — The vision says what the world looks like when the product succeeds. The strategy says how you get there. Keep them separate.
2. **Tying Vision to a Solution** — "Build the best X" references a specific product form. "Enable Y for Z people" survives pivots.
3. **Failing to Inspire** — Corporate boilerplate doesn't motivate teams. Co-create the vision; don't hand it down.
4. **Changing the Vision Frequently** — A vision should endure for years. If it changes quarterly, it's not a vision — it's a roadmap item.
5. **Overly Broad Target Audience** — "Everyone" is not a target audience. Specificity enables focus.
6. **Features as Needs** — Listing features (solution space) instead of needs (problem space) limits the team's design freedom.
7. **Decorative Wall Statement** — A vision that hangs on the wall but never guides actual decisions is worse than no vision at all.

### The Product Development Hierarchy

Vision sits at the top of this hierarchy:

```
Company Mission / Purpose
    ↓
Company Vision
    ↓
Product Vision          ← THIS DOCUMENT
    ↓
Product Strategy
    ↓
Product Requirements    ← PRD (docs/plan.md)
    ↓
Implementation
```

The vision document should inform the PRD, not the other way around. When the PRD and vision conflict, revisit the vision first.

### Success Criteria & Measurement

Success criteria in a vision document are directional — they define what "winning" looks like without the precision of a PRD's success metrics.

#### Levels of Success Measurement

- **Leading indicators** — Early signals that validate the vision direction. These are behavioral: are users doing the thing you expected? Are they coming back? Example: "Users who complete onboarding return within 48 hours."
- **Year 1 milestones** — Concrete, time-bound achievements that demonstrate market fit. Example: "1,000 active users creating at least one project per week."
- **Year 3 aspirations** — Ambitious but grounded targets that show the vision is being realized. These should feel like a stretch but not fantasy.
- **Failure indicators** — What would make this a failure even if it ships on time and works correctly? Example: "If users create an account but never return after day 1, the core value proposition is wrong."

#### Common Mistakes in Success Criteria

- Vanity metrics ("1 million downloads") instead of engagement metrics ("daily active usage")
- Unmeasurable aspirations ("users love the product") instead of observable behavior
- Missing the "failure despite shipping" scenario — the most dangerous blind spot
- Setting criteria so low they're guaranteed, removing the diagnostic value

### Business Model Intuition

The vision document captures directional thinking about sustainability, not a financial model.

#### What to Include

- **Revenue model** — How does this make money? Subscription, freemium, marketplace commission, enterprise licensing, usage-based? Pick one primary model and explain why.
- **Unit economics direction** — What are the key cost drivers? What does a "unit" of value look like? Does the economics improve with scale?
- **Go-to-market intuition** — How do users discover this product? Product-led growth, sales-led, community-driven, partnership channels? The answer shapes everything from pricing to features.

#### What NOT to Include

- Detailed financial projections (that's a business plan)
- Multi-year revenue forecasts (that's a pitch deck)
- Competitive pricing analysis (that's market research — do it, but don't put it in the vision)

### Vision-to-PRD Handoff

The vision document's primary downstream consumer is the PRD. A well-written vision makes PRD creation straightforward; a vague vision forces the PRD author to make strategic decisions that should have been settled upstream.

#### Handoff Checklist

Before declaring the vision ready for PRD creation, verify:

1. **Problem Space** maps cleanly to PRD's Problem Statement
2. **Target Audience** personas are specific enough for user stories
3. **Guiding Principles** are concrete enough to resolve "should we build X?" questions
4. **Competitive Landscape** provides enough context to differentiate features
5. **Anti-Vision** is clear enough to reject out-of-scope feature requests
6. **Open Questions** do not include anything that would block product definition

If any of these fail, the vision needs another pass before the PRD can begin.

---

## After This Step

Continue with: `/scaffold:review-vision`
