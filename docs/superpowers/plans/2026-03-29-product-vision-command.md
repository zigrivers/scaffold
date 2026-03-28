# Product Vision Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 0 ("Product Vision") to the scaffold pipeline with `create-vision`, `review-vision`, and `innovate-vision` steps, plus a `vision-craft` knowledge base entry.

**Architecture:** Three new pipeline steps in `pipeline/vision/`, one new knowledge entry in `knowledge/product/`, with integration changes to PHASES constant, PRD step, and runner skill. Commands are generated via `scaffold build`.

**Tech Stack:** TypeScript (PHASES constant), Markdown (pipeline steps, knowledge, commands), YAML frontmatter, bats-core (shell tests), vitest (TypeScript tests)

**Spec:** `docs/superpowers/specs/2026-03-29-product-vision-command-design.md`

---

## File Map

### Files to Create
| File | Purpose |
|------|---------|
| `pipeline/vision/create-vision.md` | Pipeline step: create product vision document |
| `pipeline/vision/review-vision.md` | Pipeline step: 5-pass review of vision document |
| `pipeline/vision/innovate-vision.md` | Pipeline step: strategic innovation on vision |
| `knowledge/product/vision-craft.md` | Knowledge base: product vision best practices |

### Files to Modify
| File | Change |
|------|--------|
| `src/types/frontmatter.ts` | Add Phase 0 `vision` to PHASES constant |
| `pipeline/pre/create-prd.md` | Add `reads: [create-vision]`, add vision doc conditional |
| `skills/scaffold-runner/SKILL.md` | Add vision phase to phase name reference table |
| `README.md` | Add Phase 0 to pipeline section, update step count |
| `CHANGELOG.md` | Add 2.33.0 entry |
| `package.json` | Bump version to 2.33.0 |

### Files Generated (via `scaffold build`)
| File | Generated From |
|------|---------------|
| `commands/create-vision.md` | `pipeline/vision/create-vision.md` |
| `commands/review-vision.md` | `pipeline/vision/review-vision.md` |
| `commands/innovate-vision.md` | `pipeline/vision/innovate-vision.md` |

---

## Task 1: Add Phase 0 to PHASES Constant

**Files:**
- Modify: `src/types/frontmatter.ts:6-21`

- [ ] **Step 1: Write failing test**

Create a test that verifies the PHASES constant includes a phase 0 with slug `vision`:

```typescript
// In a test file or inline verification
import { PHASES, PHASE_BY_SLUG } from '../src/types/frontmatter'

// Verify phase 0 exists
const visionPhase = PHASES.find(p => p.slug === 'vision')
assert(visionPhase !== undefined, 'Phase 0 "vision" should exist')
assert(visionPhase.number === 0, 'Vision phase should be number 0')
assert(visionPhase.displayName === 'Product Vision', 'Display name should be "Product Vision"')
assert(PHASE_BY_SLUG.vision !== undefined, 'PHASE_BY_SLUG should include vision')
```

- [ ] **Step 2: Run existing tests to confirm baseline**

Run: `npm test`
Expected: All existing tests pass (baseline before changes)

- [ ] **Step 3: Add Phase 0 to PHASES array**

In `src/types/frontmatter.ts`, add the vision phase as the first element of the PHASES array:

```typescript
export const PHASES = [
  { number: 0, slug: 'vision', displayName: 'Product Vision' },
  { number: 1, slug: 'pre', displayName: 'Product Definition' },
  { number: 2, slug: 'foundation', displayName: 'Project Foundation' },
  // ... rest unchanged
] as const
```

- [ ] **Step 4: Run tests to verify**

Run: `npm test`
Expected: All tests pass. The `PhaseSlug` type and `PHASE_BY_SLUG` map derive automatically from the array, so no other TypeScript changes needed.

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/types/frontmatter.ts
git commit -m "feat: add Phase 0 'vision' to PHASES constant"
```

---

## Task 2: Create `knowledge/product/vision-craft.md`

**Files:**
- Create: `knowledge/product/vision-craft.md`

- [ ] **Step 1: Create the knowledge base entry**

Create `knowledge/product/vision-craft.md` with the following content. This follows the same structure as `knowledge/product/prd-craft.md` — frontmatter with name/description/topics, then Summary and Deep Guidance sections:

```markdown
---
name: vision-craft
description: What makes a good product vision — strategic framing, audience definition, competitive positioning, guiding principles
topics: [vision, strategy, product, positioning, competitive-analysis]
---

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
```

- [ ] **Step 2: Verify knowledge base structure matches existing entries**

Run: `head -6 knowledge/product/prd-craft.md` to confirm the frontmatter format matches.
Expected: Same frontmatter pattern (name, description, topics fields).

- [ ] **Step 3: Commit**

```bash
git add knowledge/product/vision-craft.md
git commit -m "feat: add vision-craft knowledge base entry"
```

---

## Task 3: Create `pipeline/vision/create-vision.md`

**Files:**
- Create: `pipeline/vision/create-vision.md`

- [ ] **Step 1: Create the pipeline directory**

```bash
mkdir -p pipeline/vision
```

- [ ] **Step 2: Create the pipeline step file**

Create `pipeline/vision/create-vision.md` with YAML frontmatter matching the pattern from `pipeline/pre/create-prd.md`:

```markdown
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
```

- [ ] **Step 3: Validate frontmatter**

Run: `make validate`
Expected: Validation passes (new step recognized with valid frontmatter)

- [ ] **Step 4: Commit**

```bash
git add pipeline/vision/create-vision.md
git commit -m "feat: add create-vision pipeline step"
```

---

## Task 4: Create `pipeline/vision/review-vision.md`

**Files:**
- Create: `pipeline/vision/review-vision.md`

- [ ] **Step 1: Create the review pipeline step**

Create `pipeline/vision/review-vision.md`:

```markdown
---
name: review-vision
description: Multi-pass review of the product vision for clarity, coherence, and downstream readiness
phase: "vision"
order: 020
dependencies: [create-vision]
outputs: [docs/reviews/vision-review-vision.md]
conditional: null
knowledge-base: [review-methodology, vision-craft]
---

## Purpose
Deep multi-pass review of the product vision document, targeting the specific
failure modes of strategic vision artifacts. Identify issues, create a fix plan,
execute fixes, and re-validate. Ensures the vision is inspiring, coherent,
strategically sound, and ready for the PRD to consume.

## Inputs
- docs/vision.md (required) — Vision document to review
- Project idea or brief (context from user, if available)

## Expected Outputs
- docs/reviews/vision-review-vision.md — review findings, fix plan, and resolution log
- docs/vision.md — updated with fixes

## Quality Criteria
- All 5 review passes executed with findings documented
- Every finding categorized by severity (P0-P3)
- Fix plan created for P0 and P1 findings
- Fixes applied and re-validated
- Downstream readiness confirmed (PRD can proceed without strategic ambiguity)

## Methodology Scaling
- **deep**: All 5 review passes. Full findings report with severity
  categorization. Fixes applied and re-validated.
- **mvp**: Passes 1 and 5 only (Vision Clarity and Downstream Readiness).
  Focus on blocking gaps — is the vision clear enough to write a PRD from?
- **custom:depth(1-5)**: Depth 1-2: passes 1 and 5 only. Depth 3: passes 1,
  2, 5 (add Audience Precision). Depth 4: passes 1-3, 5 (add Competitive
  Rigor). Depth 5: all 5 passes.

## Mode Detection
If docs/reviews/vision-review-vision.md exists, this is a re-review. Read
previous findings and focus on whether fixes were applied and any new issues
introduced.

## Update Mode Specifics
- **Detect prior artifact**: docs/reviews/vision-review-vision.md exists
- **Preserve**: Findings from prior review that are still valid, resolution
  decisions made by user
- **Triggers for update**: Vision document changed since last review, user
  requests re-review after edits
- **Conflict resolution**: if a previously resolved finding reappears, note
  it as a regression

## Instructions

Review docs/vision.md using a structured 5-pass approach. Each pass targets
a specific failure mode of product vision documents.

### Pass 1: Vision Clarity

Evaluate the vision statement and elevator pitch for quality:
- Is the vision statement inspiring, concise, and memorable?
- Could someone repeat it from memory after hearing it once?
- Does it describe positive change in the world, not a product feature?
- Is it enduring — would it survive a pivot in approach?
- Apply Roman Pichler's checklist: Inspiring, Shared, Ethical, Concise, Ambitious, Enduring
- Is the elevator pitch (Geoffrey Moore template) filled in with specific, non-generic language?
- Does the vision statement pass the "decision test" — could you evaluate a product decision against it?

### Pass 2: Audience Precision

Evaluate whether the target audience is defined well enough for product decisions:
- Are personas defined by behaviors and motivations, not demographics?
- Is the primary persona clearly identified and distinct from secondary personas?
- Could two people read the persona descriptions and agree on design decisions?
- Are "context of use" descriptions specific enough to inform UX decisions?
- Is there an implicit "Everything User" persona (contradictory needs)?

### Pass 3: Competitive Rigor

Evaluate the competitive analysis for honesty and completeness:
- Are direct competitors identified with specific strengths and weaknesses?
- Are indirect alternatives considered (different approaches to the same problem)?
- Is the "do nothing" option considered as a competitor?
- Is differentiation genuine or wishful thinking?
- Are competitor strengths acknowledged honestly, not dismissed?
- Is the market gap validated with evidence, not just asserted?

### Pass 4: Strategic Coherence

Evaluate whether the strategic elements hold together:
- Do guiding principles actually constrain decisions (or are they platitudes)?
- Would a reasonable team choose the opposite of each principle?
- Does the anti-vision name specific traps, not just vague disclaimers?
- Are success criteria measurable and time-bound?
- Does the business model intuition hold together with the target audience and value proposition?
- Are strategic risks honest about severity, with actual mitigation thinking?
- Do all sections tell a consistent story about the same product?

### Pass 5: Downstream Readiness

Evaluate whether the PRD can be written from this vision:
- Can the PRD's problem statement be derived directly from the Problem Space section?
- Is the target audience clear enough to write user personas and stories?
- Are guiding principles concrete enough to inform tech stack and architecture decisions?
- Is there enough competitive context to differentiate features?
- Are there unresolved Open Questions that would block product definition?
- Could an AI agent write a PRD from this vision without asking strategic questions?

### Review Process

1. Execute each pass, documenting findings with severity (P0-P3):
   - P0: Vision is fundamentally unclear or contradictory — blocks all downstream work
   - P1: Significant gap that would cause PRD to make wrong assumptions
   - P2: Minor gap or vagueness that could be improved
   - P3: Nitpick or style suggestion
2. Create a fix plan for all P0 and P1 findings
3. Present the fix plan to the user for approval
4. Apply approved fixes to docs/vision.md
5. Re-validate that fixes resolved the issues
6. Document all findings and resolutions in the review report

### Output Format

Create docs/reviews/vision-review-vision.md with:

| Pass | Finding | Severity | Fix | Status |
|------|---------|----------|-----|--------|
| 1 | Vision statement references a feature ("AI-powered...") | P1 | Reframe around positive change | Fixed |
| ... | ... | ... | ... | ... |

## After This Step

When this step is complete, tell the user:

---
**Review complete** — `docs/reviews/vision-review-vision.md` created, fixes applied to `docs/vision.md`.

**Next:** Run `/scaffold:innovate-vision` (optional) — Explore strategic innovation opportunities.
Or skip to: `/scaffold:create-prd` — Start product requirements.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
```

- [ ] **Step 2: Validate frontmatter**

Run: `make validate`
Expected: Validation passes

- [ ] **Step 3: Commit**

```bash
git add pipeline/vision/review-vision.md
git commit -m "feat: add review-vision pipeline step"
```

---

## Task 5: Create `pipeline/vision/innovate-vision.md`

**Files:**
- Create: `pipeline/vision/innovate-vision.md`

- [ ] **Step 1: Create the innovation pipeline step**

Create `pipeline/vision/innovate-vision.md`:

```markdown
---
name: innovate-vision
description: Discover strategic innovation opportunities in the product vision
phase: "vision"
order: 030
dependencies: [review-vision]
outputs: [docs/vision.md]
conditional: "if-needed"
knowledge-base: [vision-craft]
---

## Purpose
Discover strategic innovation opportunities within the product vision. This
covers market positioning, competitive strategy, ecosystem thinking, and
contrarian bets. It operates at the strategic level — should the product be
positioned differently? Are there market opportunities being missed? What
would an AI-native rethinking look like?

This is distinct from PRD innovation (innovate-prd), which covers feature-level
gaps. If an idea is about a specific feature, it belongs in PRD innovation,
not here.

## Inputs
- docs/vision.md (required) — Vision document to analyze
- docs/reviews/vision-review-vision.md (optional) — review findings for context

## Expected Outputs
- docs/vision.md — updated with approved strategic innovations

## Quality Criteria
- Innovations are strategic-level, not feature-level
- Each suggestion has a clear strategic rationale
- Each suggestion has an impact assessment (high/medium/low)
- Each suggestion has an implementation cost estimate (trivial/moderate/significant)
- Approved innovations are documented to the same standard as existing sections
- Vision scope is respected — no uncontrolled strategic drift
- User approval is obtained before modifying the vision document

## Methodology Scaling
- **deep**: Full innovation pass across all 5 dimensions. Competitive research
  via web search. Detailed integration of approved innovations into vision.
- **mvp**: Not applicable — this step is conditional and skipped in MVP.
- **custom:depth(1-5)**: Depth 1-2: Quick scan only — identify 1-2 high-impact
  strategic angles with brief rationale. Depth 3: quick scan for positioning
  gaps and obvious market opportunities. Depth 4-5: full innovation pass
  across all 5 dimensions.

## Conditional Evaluation
Enable when: project has competitive landscape content in vision.md, user
explicitly requests a strategic innovation pass, or the vision review
(review-vision) identifies strategic gaps or weak positioning. Skip when:
vision is minimal/exploratory, depth < 3, or user explicitly declines innovation.

## Mode Detection
If this step has been run before (tracking comment
`<!-- scaffold:innovate-vision -->` exists in docs/vision.md), this is a
re-innovation pass. Focus on new opportunities from vision changes since last run.

## Update Mode Specifics
- **Detect prior artifact**: `<!-- scaffold:innovate-vision -->` tracking
  comment in docs/vision.md
- **Preserve**: Previously accepted strategic decisions, positioning choices
  approved by user
- **Triggers for update**: Vision strategy changed, new market data available,
  user requests re-evaluation
- **Conflict resolution**: if a previously rejected strategic angle is now
  relevant due to vision changes, re-propose with updated rationale

## Instructions

Deeply research docs/vision.md and identify strategic innovation opportunities
across 5 dimensions. This is the last chance to strengthen the vision before
it drives the PRD and everything downstream.

### Dimension 1: Market Opportunity Expansion

Research adjacent opportunities:
- Adjacent markets or segments not currently addressed
- Underserved niches within the target audience
- Timing advantages (regulatory changes, technology shifts, cultural moments)
- Platform or ecosystem opportunities that could amplify reach
- Geographic or demographic expansion possibilities

### Dimension 2: Positioning Alternatives

Explore how the product could be positioned differently:
- Could the product be positioned differently for greater impact?
- Alternative framings of the value proposition
- Category creation vs category competition — which is the stronger play?
- Messaging angles that haven't been explored
- What would a "10x better positioning" look like?

### Dimension 3: AI-Native Rethinking

If this product were conceived today with AI capabilities assumed:
- What changes fundamentally about the product concept?
- Features that become trivial with AI (and therefore table stakes)
- Experiences that become possible that were previously impractical
- Intelligence that can be embedded vs bolted on
- How does AI change the competitive landscape for this product?

### Dimension 4: Ecosystem Thinking

Explore how the product fits into a broader ecosystem:
- Partners and integrations that amplify the product's value
- Platform effects or network effects available
- Data advantages that compound over time
- Build vs buy vs partner decisions at the strategic level
- Community or marketplace opportunities

### Dimension 5: Contrarian Bets

Challenge the vision's assumptions:
- What does the vision assume that most people agree with? What if the opposite were true?
- Industry orthodoxies worth challenging
- One genuinely contrarian strategic angle, evaluated honestly
- "What would we do differently if we believed X?"
- Which assumptions, if wrong, would invalidate the entire vision?

### For Each Innovation Idea, Present:
- **What**: The strategic innovation
- **Why**: Strategic rationale and market context
- **Impact**: How much better the product positioning gets (high / medium / low)
- **Cost**: Implementation effort (trivial / moderate / significant)
- **Recommendation**: Must-have for vision, or backlog for future consideration

### Process

1. Research competitive landscape and market trends via web search
2. Generate innovation ideas across all 5 dimensions
3. Use AskUserQuestionTool to present innovations grouped by dimension for user approval
4. For each approved innovation, integrate it into the appropriate section of docs/vision.md
5. Update tracking comment: add `<!-- scaffold:innovate-vision v1 YYYY-MM-DD -->` after the vision tracking comment
6. Provide a summary of what was added, modified, or deferred

### Quality Standards
- Strategic-level only — feature ideas belong in innovate-prd
- Honest about costs and risks — don't oversell
- Respect the existing guiding principles — innovations should align, not contradict
- Do NOT modify the vision statement without explicit user approval
- Do NOT add approved innovations as vague one-liners — document them to the same standard as existing sections

## After This Step

When this step is complete, tell the user:

---
**Innovation complete** — `docs/vision.md` updated with approved strategic innovations.

**Next:** Run `/scaffold:create-prd` — Translate the vision into product requirements.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
```

- [ ] **Step 2: Validate frontmatter**

Run: `make validate`
Expected: Validation passes

- [ ] **Step 3: Commit**

```bash
git add pipeline/vision/innovate-vision.md
git commit -m "feat: add innovate-vision pipeline step (conditional)"
```

---

## Task 6: Modify `pipeline/pre/create-prd.md` — Add Vision Doc Integration

**Files:**
- Modify: `pipeline/pre/create-prd.md:1-10` (frontmatter)
- Modify: `pipeline/pre/create-prd.md` (discovery section)

- [ ] **Step 1: Add `reads: [create-vision]` to frontmatter**

In `pipeline/pre/create-prd.md`, add the `reads` field to the frontmatter block:

```yaml
---
name: create-prd
description: Create a product requirements document from a project idea
phase: "pre"
order: 110
dependencies: []
outputs: [docs/plan.md]
conditional: null
knowledge-base: [prd-craft]
reads: [create-vision]
---
```

- [ ] **Step 2: Add vision doc conditional to Instructions section**

Find the "### Understand the Vision" heading in the Instructions section and add a conditional before the existing content:

```markdown
### Understand the Vision

**If `docs/vision.md` exists**: Read it completely. This is your strategic foundation — the vision document has already established the problem space, target audience, value proposition, competitive landscape, and guiding principles. Skip the vision discovery questions below and use the vision document as the North Star for this PRD. Reference it throughout, ensuring every requirement aligns with the stated vision and guiding principles. Focus your discovery questions on translating the vision into concrete product requirements rather than re-exploring strategic direction.

**If `docs/vision.md` does NOT exist**:
```

Then keep the existing discovery questions unchanged after this conditional.

- [ ] **Step 3: Validate frontmatter**

Run: `make validate`
Expected: Validation passes

- [ ] **Step 4: Commit**

```bash
git add pipeline/pre/create-prd.md
git commit -m "feat: create-prd reads vision doc when available"
```

---

## Task 7: Update Runner Skill Phase Table

**Files:**
- Modify: `skills/scaffold-runner/SKILL.md:277-296`

- [ ] **Step 1: Add vision phase to the phase name reference table**

In `skills/scaffold-runner/SKILL.md`, find the phase name reference table (around line 277) and add the vision phase as the first row:

```markdown
| Phase Name | Also Known As | Steps |
|---|---|---|
| vision | Product Vision | create-vision, review-vision, innovate-vision |
| pre | Product Definition | create-prd, review-prd, innovate-prd, user-stories, review-user-stories, innovate-user-stories |
```

- [ ] **Step 2: Commit**

```bash
git add skills/scaffold-runner/SKILL.md
git commit -m "feat: add vision phase to runner skill reference table"
```

---

## Task 8: Build Generated Commands

**Files:**
- Generated: `commands/create-vision.md`, `commands/review-vision.md`, `commands/innovate-vision.md`

- [ ] **Step 1: Run scaffold build**

```bash
npm run build
```

This compiles TypeScript and the build step generates command files from pipeline steps.

- [ ] **Step 2: Verify generated commands exist**

```bash
ls -la commands/create-vision.md commands/review-vision.md commands/innovate-vision.md
```

Expected: All three files exist with non-zero size.

- [ ] **Step 3: Verify command frontmatter**

Check that the generated commands have appropriate frontmatter (description, long-description):

```bash
head -10 commands/create-vision.md
```

Expected: YAML frontmatter with description field matching the pipeline step.

- [ ] **Step 4: Run full validation**

Run: `make check`
Expected: All quality gates pass (lint + validate + test + eval)

- [ ] **Step 5: Commit generated commands**

```bash
git add commands/create-vision.md commands/review-vision.md commands/innovate-vision.md
git commit -m "chore: generate vision command files via scaffold build"
```

---

## Task 9: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update step count in opening paragraph**

In `README.md` line 1, update the step count from "51 structured pipeline steps" to "54 structured pipeline steps" and "14 phases" to "15 phases":

```markdown
A TypeScript CLI that assembles AI-powered prompts at runtime to guide you from "I have an idea" to working software. Scaffold walks you through 54 structured pipeline steps — organized into 15 phases — and Claude Code handles the research, planning, and implementation for you.
```

- [ ] **Step 2: Add Phase 0 section before Phase 1 in the Pipeline section**

Find "### Phase 1 — Product Definition (pre)" (around line 225) and add the new phase section before it:

```markdown
### Phase 0 — Product Vision (vision)

Define why you're building it.

| Step | What It Does |
|------|-------------|
| `create-vision` | Creates a strategic product vision document from your idea |
| `review-vision` | Structured review of the vision for clarity, coherence, and downstream readiness |
| `innovate-vision` | Strategic innovation pass on market positioning and opportunities *(optional)* |

### Phase 1 — Product Definition (pre)
```

- [ ] **Step 3: Update Quick Start section**

Find the Quick Start section (around line 179). Update step 2 to mention the vision command as the starting point:

```markdown
**2. Define your product vision**

```bash
scaffold run create-vision
```

Or in Claude Code:

```
/scaffold:create-vision I want to build a recipe sharing app where users can save, organize, and share recipes with friends
```

Claude asks strategic questions about your idea, researches the competitive landscape, and produces a vision document. This becomes the North Star that all later steps build on.

**3. Create your PRD**

```bash
scaffold run create-prd
```

Claude translates the vision into detailed product requirements — features, user personas, success criteria, and scope boundaries.

**4. See what's next**
```

Renumber subsequent steps accordingly (old step 3 "See what's next" becomes step 4, old step 4 "Keep following the pipeline" becomes step 5).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add Phase 0 vision to README pipeline and quick start"
```

---

## Task 10: Update CHANGELOG.md and Bump Version

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`

- [ ] **Step 1: Add 2.33.0 entry to CHANGELOG.md**

Add the new version entry at the top of the changelog, after the `# Changelog` header and description line:

```markdown
## [2.33.0] — 2026-03-29

### Added

- **Phase 0: Product Vision** — New pipeline phase with three steps (`create-vision`, `review-vision`, `innovate-vision`) that produce a strategic product vision document (`docs/vision.md`) before the PRD. The vision document establishes the product's purpose, target audience, competitive positioning, guiding principles, and success criteria — serving as the North Star for all downstream pipeline steps.
- **`create-vision` step** — Hybrid framework combining Geoffrey Moore's elevator pitch, Roman Pichler's Vision Board, Reforge's narrative approach, and Amazon's Working Backwards methodology. Supports fresh and update modes. Produces a 12-section comprehensive vision document.
- **`review-vision` step** — 5-pass structured review targeting vision-specific failure modes: vision clarity, audience precision, competitive rigor, strategic coherence, and downstream readiness.
- **`innovate-vision` step** (conditional) — Strategic innovation across 5 dimensions: market opportunity expansion, positioning alternatives, AI-native rethinking, ecosystem thinking, and contrarian bets. Updates `docs/vision.md` directly with approved innovations.
- **`vision-craft` knowledge base entry** — Product vision best practices synthesized from Geoffrey Moore, Roman Pichler, Marty Cagan, Reforge, and Amazon Working Backwards. Referenced by all three vision steps.

### Changed

- **`create-prd` now reads `docs/vision.md`** — When a vision document exists, the PRD step uses it as strategic foundation and skips its own vision discovery questions. The PRD works unchanged when no vision document exists (soft read, not hard dependency).
- **PHASES constant updated** — Added Phase 0 `vision` (display name: "Product Vision") to `src/types/frontmatter.ts`.
- **Runner skill updated** — Phase name reference table includes the new vision phase for batch execution and navigation.
```

- [ ] **Step 2: Bump version in package.json**

Update the `version` field in `package.json` from `"2.32.0"` to `"2.33.0"`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md package.json
git commit -m "chore: bump version to 2.33.0"
```

---

## Task 11: Run Full Quality Gates and Create Release

**Files:** None (verification only)

- [ ] **Step 1: Run all quality gates**

```bash
make check-all
```

Expected: All bash quality gates (lint + validate + test + eval) AND TypeScript gates (lint + type-check + build + unit tests) pass.

- [ ] **Step 2: Fix any failing tests or validations**

If any gates fail, fix the issues and re-run until all pass. Common issues:
- Frontmatter validation may fail if a field format is wrong
- Eval checks may flag missing patterns in new pipeline steps
- TypeScript type-check may fail if PHASES type inference breaks

- [ ] **Step 3: Push branch and create PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: add Phase 0 Product Vision pipeline" --body "$(cat <<'EOF'
## Summary

- Adds Phase 0 ("Product Vision") with three new pipeline steps: `create-vision`, `review-vision`, `innovate-vision`
- New `vision-craft` knowledge base entry with best practices from Moore, Pichler, Cagan, Reforge, and Amazon
- `create-prd` now reads `docs/vision.md` when available (soft read, not hard dependency)
- Updated PHASES constant, runner skill, README, and CHANGELOG

## Details

The vision steps produce `docs/vision.md` — a comprehensive strategic document covering vision statement, elevator pitch, problem space, target audience, value proposition, competitive landscape, guiding principles, anti-vision, business model, success criteria, risks, and open questions.

The vision phase is optional — users can skip it and start at `create-prd` as before. When a vision doc exists, the PRD step uses it as strategic foundation.

## Test plan

- [ ] `make check-all` passes (lint + validate + test + eval + TypeScript)
- [ ] `make validate` recognizes all three new steps with valid frontmatter
- [ ] `scaffold build` generates commands for all three vision steps
- [ ] Phase 0 appears in `scaffold list` output
- [ ] `scaffold next` shows `create-vision` as first eligible step in a fresh project
- [ ] `create-prd` still works without a vision doc (no regression)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI to pass**

```bash
gh pr checks
```

Expected: All CI checks pass.

- [ ] **Step 5: Merge PR**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 6: Tag release**

```bash
git checkout main
git pull
git tag v2.33.0
git push origin v2.33.0
```
