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
