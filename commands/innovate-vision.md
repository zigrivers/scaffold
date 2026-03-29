---
description: "Discover strategic innovation opportunities in the product vision"
long-description: "Explores untapped opportunities — adjacent markets, AI-native capabilities, ecosystem partnerships, and contrarian positioning — and proposes innovations for your approval."
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
- (mvp) Each innovation categorized: market opportunity, positioning, AI-native, ecosystem, or contrarian
- (mvp) Each innovation includes: what to change, why, impact (high/medium/low), cost estimate
- (mvp) Each suggestion has an implementation cost estimate (trivial/moderate/significant)
- (mvp) Recommended disposition stated for each: must-have, backlog, or reject with rationale
- (deep) Impact assessments compared to existing document content
- (deep) Each approved innovation is integrated with the same subsection headings and detail level as existing vision sections
- (mvp) Each innovation marked with approval status: approved, deferred, or rejected, with user decision timestamp
- Vision scope is respected — no uncontrolled strategic drift
- User approval is obtained before modifying the vision document

## Methodology Scaling
- **deep**: Full innovation pass across all 5 dimensions. Competitive research
  via web search. Detailed integration of approved innovations into vision.
- **mvp**: Not applicable — this step is conditional and skipped in MVP.
- **custom:depth(1-5)**:
  - Depth 1: Skip (not enough context for meaningful innovation at this depth).
  - Depth 2: Quick scan only — identify 1-2 high-impact strategic angles with brief rationale.
  - Depth 3: Quick scan for positioning gaps and obvious market opportunities across dimensions 1-2.
  - Depth 4: Full innovation pass across all 5 dimensions with competitive research.
  - Depth 5: Full innovation pass across all 5 dimensions with competitive research and contrarian stress-test.

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
