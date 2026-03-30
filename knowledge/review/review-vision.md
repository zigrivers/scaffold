---
name: review-vision
description: Vision-specific review passes, failure modes, and quality criteria for product vision documents
topics: [vision, product-strategy, validation, review]
---

# Review: Product Vision

The product vision document sets the strategic direction for everything downstream. It defines why the product exists, who it serves, what makes it different, and what traps to avoid. A weak vision produces a PRD that lacks focus, user stories that lack purpose, and an architecture that lacks guiding constraints. This review uses 5 passes targeting the specific ways vision artifacts fail.

Follows the review process defined in `review-methodology.md`.

---

## Summary

Vision review validates that the product vision is specific enough to guide decisions, inspiring enough to align a team, and honest enough to withstand scrutiny. The 5 passes target: (1) vision clarity -- is the vision statement specific, inspiring, and actionable, (2) target audience -- are users defined by behaviors and motivations rather than demographics, (3) competitive landscape -- is the analysis honest about strengths and not just weaknesses, (4) guiding principles -- do they create real tradeoffs with X-over-Y format, and (5) anti-vision -- does it name specific traps rather than vague disclaimers.

---

## Deep Guidance

## Pass 1: Vision Clarity

### What to Check

- Is the vision statement specific to THIS product, not a generic mission statement?
- Does it inspire action, not just describe a category?
- Is it actionable -- could a team use it to make a yes/no decision about a feature?
- Does it avoid jargon, buzzwords, and empty superlatives ("best-in-class," "world-class," "revolutionary")?
- Is it short enough to remember (1-3 sentences)?

### Why This Matters

The vision statement is the single most referenced artifact in the pipeline. It appears in PRD context, guides user story prioritization, and informs architecture trade-offs. A generic vision like "make the best project management tool" provides zero signal -- it cannot distinguish between features to build and features to skip. A specific vision like "help 2-person freelance teams track client work without learning project management" makes every downstream decision easier.

### How to Check

1. Read the vision statement in isolation -- does it name a specific outcome for a specific group?
2. Try the "swap test" -- could you replace the product name with a competitor's name and have the vision still be true? If yes, it is not specific enough
3. Try the "decision test" -- present two hypothetical features and ask whether the vision helps you choose between them. If it does not, the vision is too vague
4. Check for buzzwords: "leverage," "synergy," "best-in-class," "end-to-end," "seamless" -- these add words without adding meaning
5. Check length -- if the vision takes more than 30 seconds to read aloud, it is too long to internalize

### What a Finding Looks Like

- P0: "Vision statement is 'To be the leading platform for enterprise collaboration.' This could describe Slack, Teams, Notion, or Confluence. It names no specific user group, no specific problem, and no specific differentiation."
- P1: "Vision statement is specific but contains 'seamless end-to-end experience' -- this phrase adds no decision-making value. Replace with the specific experience being described."
- P2: "Vision is 4 paragraphs long. Distill to 1-3 sentences that a team member could recite from memory."

### Common Failure Modes

- **Category description**: The vision describes a market category, not a product direction ("We build developer tools")
- **Aspiration without specificity**: The vision is inspiring but cannot guide decisions ("Empower teams to do their best work")
- **Solution masquerading as vision**: The vision describes a technology choice, not a user outcome ("AI-powered analytics platform")

---

## Pass 2: Target Audience

### What to Check

- Is the target audience defined by behaviors, motivations, and constraints -- not demographics?
- Does the audience description create clear inclusion/exclusion criteria?
- Are there signs of the "everyone" trap (audience so broad it provides no prioritization signal)?
- Does the audience description explain WHY these people need this product specifically?

### Why This Matters

Demographics (age, location, job title) do not predict product needs. Behaviors and motivations do. "Marketing managers aged 30-45" tells you nothing about what to build. "Solo marketers who manage 5+ channels without a team and need to appear more capable than they are" tells you everything. The audience definition flows directly into PRD personas -- vague audiences produce vague personas produce vague user stories.

### How to Check

1. Check whether the audience is defined by observable behaviors ("currently uses spreadsheets to track...") versus demographics ("25-40 year old professionals")
2. Check for motivations -- WHY does this audience need the product? What is the underlying drive?
3. Check for constraints -- what limits this audience? Budget? Time? Technical skill? Team size?
4. Apply the "exclusion test" -- does the audience definition clearly exclude some potential users? If not, it is too broad
5. Check that the audience connects to the vision -- is this the audience that the vision serves?

### What a Finding Looks Like

- P0: "Target audience is 'businesses of all sizes.' This excludes nobody and provides no prioritization signal. The PRD cannot write meaningful personas from this."
- P1: "Target audience mentions 'small business owners' but defines them only by company size (<50 employees), not by behaviors, pain points, or motivations."
- P2: "Audience description is behavior-based but does not explain why existing solutions fail this group."

### Common Failure Modes

- **Demographic-only**: Defined by who they are, not what they do ("SMB owners aged 25-45")
- **Too broad**: Audience includes everyone ("teams of any size in any industry")
- **Missing motivation**: Describes the audience but not why they need THIS product
- **No exclusion criteria**: Cannot determine who is NOT the target audience

---

## Pass 3: Competitive Landscape

### What to Check

- Does the competitive analysis honestly assess competitors' strengths, not just their weaknesses?
- Are competitors named specifically, not referred to generically ("existing solutions")?
- Is the differentiation based on substance (different approach, different audience, different trade-offs) not superficiality ("better UX")?
- Does the analysis acknowledge what competitors do well that this product will NOT try to replicate?

### Why This Matters

A competitive landscape that only lists competitor weaknesses produces false confidence. Competitors have strengths -- users chose them for reasons. Understanding those reasons prevents building a product that is strictly worse in dimensions users care about. Differentiation based on "we'll just do it better" is not differentiation -- it is a bet that the team is more competent than established competitors with more resources.

### How to Check

1. For each named competitor, check that at least one genuine strength is acknowledged
2. Check that differentiation is structural (different trade-off, different audience segment, different approach) not aspirational ("better design")
3. Verify competitors are named specifically -- "Competitor X" or "the market" provides no signal
4. Check whether the analysis acknowledges what the product will NOT compete on (conceding dimensions to competitors)
5. Look for the "better at everything" anti-pattern -- if the product claims superiority in every dimension, the analysis is dishonest

### What a Finding Looks Like

- P0: "Competitive section lists 4 competitors but only describes their weaknesses. No competitor strengths are acknowledged. This produces a false picture of the market and prevents honest differentiation."
- P1: "Differentiation claim is 'better user experience.' This is not structural differentiation -- every product claims this. What specific design trade-off creates a different experience?"
- P2: "Competitors are referred to as 'existing solutions' and 'current tools' without naming them. Specific names enable specific analysis."

### Common Failure Modes

- **Weakness-only analysis**: Lists only what competitors do poorly, creating false confidence
- **Aspirational differentiation**: Claims superiority without structural basis ("we'll be faster, simpler, and more powerful")
- **Generic competitors**: References "the market" or "existing solutions" without naming specific products
- **Missing concessions**: Does not acknowledge what the product will deliberately NOT compete on

---

## Pass 4: Guiding Principles

### What to Check

- Are principles in X-over-Y format, creating real trade-offs?
- Does each principle rule out a specific, tempting alternative?
- Could a reasonable person disagree with the principle (i.e., the "over Y" option is genuinely attractive)?
- Are principles specific enough to resolve a real product decision?

### Why This Matters

Guiding principles that do not create trade-offs are platitudes. "We value quality" is not a principle -- nobody advocates for poor quality. "We value correctness over speed-to-market" is a principle because speed-to-market is genuinely valuable and someone could reasonably choose it. X-over-Y format forces the vision author to name what the product will sacrifice, which is the only way principles become useful for downstream decision-making.

### How to Check

1. For each principle, check for X-over-Y structure -- is something being chosen OVER something else?
2. Apply the "reasonable disagreement" test -- would a smart, well-intentioned person choose Y over X? If not, the principle is a platitude
3. Construct a hypothetical product decision and check whether the principle resolves it
4. Check that the set of principles covers the most common trade-off dimensions for this product type (simplicity vs. power, speed vs. correctness, flexibility vs. consistency, etc.)
5. Verify no two principles contradict each other

### What a Finding Looks Like

- P0: "Principles include 'We value simplicity, quality, and user delight.' These are not trade-offs -- they are universally desirable attributes. No team would advocate for complexity, poor quality, or user frustration."
- P1: "Principle 'Convention over configuration' is in X-over-Y format but does not specify what conventions or what configuration options are sacrificed. Too abstract to resolve a real decision."
- P2: "Principles are well-formed but do not cover the speed-vs-correctness dimension, which is a common tension for this product type."

### Common Failure Modes

- **Platitudes**: Principles everyone agrees with ("we value quality") that rule out nothing
- **Missing sacrifice**: X-over-Y format but Y is not genuinely attractive ("quality over bugs")
- **Too abstract**: Principles are directionally correct but too vague to resolve specific decisions
- **Contradictory pairs**: Two principles that cannot both be followed ("move fast" and "never ship bugs")

---

## Pass 5: Anti-Vision

### What to Check

- Does the anti-vision name specific, tempting traps -- not vague disclaimers?
- Are the anti-vision items things the team could plausibly drift into (not absurd strawmen)?
- Does each item explain WHY it is tempting and HOW to recognize the drift?
- Is the anti-vision specific to THIS product, not generic warnings?

### Why This Matters

The anti-vision is the vision's immune system. It names the specific failure modes that are most likely given the product's domain, team, and competitive landscape. Without it, teams drift toward common traps without recognizing the drift. A good anti-vision makes the team uncomfortable because it names things they might actually do -- not things no reasonable team would do.

### How to Check

1. For each anti-vision item, check specificity -- does it name a concrete behavior or outcome, not a vague category?
2. Apply the "temptation test" -- is this something the team could plausibly drift into? If the answer is "obviously not," the anti-vision item is a strawman
3. Check whether each item explains the mechanism: why is this trap tempting, and what are the early warning signs?
4. Verify the anti-vision items connect to the product domain -- are they specific to THIS type of product?
5. Check that anti-vision items complement guiding principles -- if a principle says "simplicity over power," the anti-vision should name a specific way the product might become complex

### What a Finding Looks Like

- P0: "Anti-vision section says 'We will not build a bad product.' This is not an anti-vision -- it is a tautology. Name specific traps: 'We will not become a feature-comparison checklist tool that matches competitors feature-for-feature while losing our core simplicity advantage.'"
- P1: "Anti-vision names 'scope creep' as a trap but does not explain which specific scope expansion is most tempting for this product or how to recognize it early."
- P2: "Anti-vision items are specific but do not connect to the guiding principles. Each principle's 'Y' (the sacrificed value) should have a corresponding anti-vision item that names the drift toward Y."

### Common Failure Modes

- **Vague disclaimers**: "We won't lose focus" -- too generic to be actionable
- **Absurd strawmen**: Names failures no team would pursue ("we won't build an insecure product")
- **Missing mechanism**: Names the trap but not why it is tempting or how to detect drift
- **Generic warnings**: Anti-vision items apply to any product, not THIS product specifically

---

## Finding Report Template

```markdown
## Vision Review Report

### Pass 1: Vision Clarity
- **P1**: Vision statement "Build the best project management tool" is a category description, not a product vision. It cannot guide feature trade-offs. Recommendation: rewrite as a specific change statement.

### Pass 2: Target Audience
- No findings

### Pass 3: Competitive Landscape
- **P2**: Competitor "Acme" is described by weaknesses only. Add at least one acknowledged strength.

### Pass 4: Guiding Principles
- **P0**: Principles are platitudes ("quality", "simplicity") without X-over-Y trade-offs. Cannot resolve downstream decisions.

### Pass 5: Anti-Vision
- **P1**: Anti-vision says "avoid scope creep" without naming which specific scope expansion is tempting.

### Summary
- P0: 1 | P1: 2 | P2: 1 | P3: 0
- Blocks downstream: Yes (P0 in guiding principles)
```

## Severity Examples for Vision Documents

### P0 (Blocks downstream phases)

- Vision statement is a category description that cannot guide any decision
- Target audience is "everyone" -- PRD cannot write meaningful personas
- No guiding principles exist -- all downstream trade-offs are unresolved
- Anti-vision is absent entirely

### P1 (Causes significant downstream quality issues)

- Vision is specific but contains unfalsifiable claims
- Target audience is demographic-only with no behavioral definition
- Competitive analysis lists only competitor weaknesses
- Principles exist but are platitudes without real trade-offs

### P2 (Minor issues, fix during iteration)

- Vision is slightly too long to memorize
- One competitor is described generically rather than by name
- One principle is well-formed but could be more specific
- Anti-vision items are specific but miss one common trap for this product type

### P3 (Observations for future improvement)

- Competitive landscape could include an emerging competitor
- Anti-vision could add early warning indicators for each trap
- Principles could be ordered by frequency of application
