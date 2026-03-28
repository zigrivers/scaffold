---
description: "Multi-pass review of the product vision for clarity, coherence, and downstream readiness"
long-description: "Deep multi-pass review of the product vision document, targeting the specific"
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

---

## Domain Knowledge

### review-methodology

*Shared process for conducting multi-pass reviews of documentation artifacts*

# Review Methodology

This document defines the shared process for reviewing pipeline artifacts. It covers HOW to review, not WHAT to check — each artifact type has its own review knowledge base document with domain-specific passes and failure modes. Every review phase (1a through 10a) follows this process.

## Multi-Pass Review Structure

### Why Multiple Passes

A single read-through catches surface errors but misses structural problems. The human tendency (and the AI tendency) is to get anchored on the first issue found and lose track of the broader picture. Multi-pass review forces systematic coverage by constraining each pass to one failure mode category.

Each pass has a single focus: coverage, consistency, structural integrity, or downstream readiness. The reviewer re-reads the artifact with fresh eyes each time, looking for one thing. This is slower than a single pass but catches 3-5x more issues in practice.

### Pass Ordering

Order passes from broadest to most specific:

1. **Coverage passes first** — Is everything present that should be? Missing content is the highest-impact failure mode because it means entire aspects of the system are unspecified. Coverage gaps compound downstream: a missing domain in the domain modeling step means missing ADRs in the decisions step, missing components in the architecture step, missing tables in the specification step, and so on.

2. **Consistency passes second** — Does everything agree with itself and with upstream artifacts? Inconsistencies are the second-highest-impact failure because they create ambiguity for implementing agents. When two documents disagree, the agent guesses — and guesses wrong.

3. **Structural integrity passes third** — Is the artifact well-formed? Are relationships explicit? Are boundaries clean? Structural issues cause implementation friction: circular dependencies, unclear ownership, ambiguous boundaries.

4. **Downstream readiness last** — Can the next phase proceed? This pass validates that the artifact provides everything its consumers need. It is the gate that determines whether to proceed or iterate.

### Pass Execution

For each pass:

1. State the pass name and what you are looking for
2. Re-read the entire artifact (or the relevant sections) with only that lens
3. Record every finding, even if minor — categorize later
4. Do not fix anything during a pass — record only
5. After completing all findings for this pass, move to the next pass

Do not combine passes. The discipline of single-focus reading is the mechanism that catches issues a general-purpose review misses.

## Finding Categorization

Every finding gets a severity level. Severity determines whether the finding blocks progress or gets deferred.

### P0: Blocks Next Phase

The artifact cannot be consumed by the next pipeline phase in its current state. The next phase would produce incorrect output or be unable to proceed.

**Examples:**
- A domain entity referenced by three other models is completely undefined
- An ADR contradicts another ADR with no acknowledgment, and the architecture depends on both
- A database schema is missing tables for an entire bounded context
- An API endpoint references a data type that does not exist in any domain model

**Action:** Must fix before proceeding. No exceptions.

### P1: Significant Gap

The artifact is usable but has a meaningful gap that will cause rework downstream. The next phase can proceed but will need to make assumptions that may be wrong.

**Examples:**
- An aggregate is missing one invariant that affects validation logic
- An ADR lists alternatives but does not evaluate them
- A data flow diagram omits error paths
- An API endpoint is missing error response definitions

**Action:** Should fix before proceeding. Fix unless the cost of fixing now significantly exceeds the cost of fixing during the downstream phase (rare).

### P2: Improvement Opportunity

The artifact is correct and usable but could be clearer, more precise, or better organized. The next phase can proceed without issue.

**Examples:**
- A domain model uses informal language where a precise definition would help
- An ADR's consequences section is vague but the decision is clear
- A diagram uses inconsistent notation but the meaning is unambiguous
- An API contract could benefit from more examples

**Action:** Fix if time permits. Log for future improvement.

### P3: Nice-to-Have

Stylistic, formatting, or polish issues. No impact on correctness or downstream consumption.

**Examples:**
- Inconsistent heading capitalization
- A diagram could be reformatted for readability
- A section could be reordered for flow
- Minor wording improvements

**Action:** Fix during finalization phase if at all. Do not spend review time on these.

## Fix Planning

After all passes are complete and findings are categorized, create a fix plan before making any changes. Ad hoc fixing (fixing issues as you find them) risks:

- Introducing new issues while fixing old ones
- Fixing a symptom instead of a root cause (two findings may share one fix)
- Spending time on P2/P3 issues before P0/P1 are resolved

### Grouping Findings

Group related findings into fix batches:

1. **Same root cause** — Multiple findings that stem from a single missing concept, incorrect assumption, or structural issue. Fix the root cause once.
2. **Same section** — Findings in the same part of the artifact that can be addressed in a single editing pass.
3. **Same severity** — Process all P0s first, then P1s. Do not interleave.

### Prioritizing by Downstream Impact

Within the same severity level, prioritize fixes that have the most downstream impact:

- Fixes that affect multiple downstream phases rank higher than single-phase impacts
- Fixes that change structure (adding entities, changing boundaries) rank higher than fixes that change details (clarifying descriptions, adding examples)
- Fixes to artifacts consumed by many later phases rank higher (domain models affect everything; API contracts affect fewer phases)

### Fix Plan Format

```markdown
## Fix Plan

### Batch 1: [Root cause or theme] (P0)
- Finding 1.1: [description]
- Finding 1.3: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 2: [Root cause or theme] (P0)
- Finding 2.1: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 3: [Root cause or theme] (P1)
...
```

## Re-Validation

After applying all fixes in a batch, re-run the specific passes that produced the findings in that batch. This is not optional — fixes routinely introduce new issues.

### What to Check

1. The original findings are resolved (the specific issues no longer exist)
2. The fix did not break anything checked by the same pass (re-read the full pass scope, not just the fixed section)
3. The fix did not introduce inconsistencies with other parts of the artifact (quick consistency check)

### When to Stop

Re-validation is complete when:
- All P0 and P1 findings are resolved
- Re-validation produced no new P0 or P1 findings
- Any new P2/P3 findings are logged but do not block progress

If re-validation produces new P0/P1 findings, create a new fix batch and repeat. If this cycle repeats more than twice, the artifact likely has a structural problem that requires rethinking a section rather than patching individual issues.

## Downstream Readiness Gate

The final check in every review: can the next phase proceed with these artifacts?

### How to Evaluate

1. Read the meta-prompt for the next phase — what inputs does it require?
2. For each required input, verify the current artifact provides it with sufficient detail and clarity
3. For each quality criterion in the next phase's meta-prompt, verify the current artifact supports it
4. Identify any questions the next phase's author would need to ask — each question is a gap

### Gate Outcomes

- **Pass** — The next phase can proceed. All required information is present and unambiguous.
- **Conditional pass** — The next phase can proceed but should be aware of specific limitations or assumptions. Document these as handoff notes.
- **Fail** — The next phase cannot produce correct output. Specific gaps must be addressed first.

A conditional pass is the most common outcome. Document the conditions clearly so the next phase knows what assumptions it is inheriting.

## Review Report Format

Every review produces a structured report. This format ensures consistency across all review phases and makes it possible to track review quality over time.

```markdown
# Review Report: [Artifact Name]

## Executive Summary
[2-3 sentences: overall artifact quality, number of findings by severity,
whether downstream gate passed]

## Findings by Pass

### Pass N: [Pass Name]
| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | P0 | [description] | [section/line] |
| 2 | P1 | [description] | [section/line] |

### Pass N+1: [Pass Name]
...

## Fix Plan
[Grouped fix batches as described above]

## Fix Log
| Batch | Findings Addressed | Changes Made | New Issues |
|-------|-------------------|--------------|------------|
| 1 | 1.1, 1.3 | [summary] | None |
| 2 | 2.1 | [summary] | 2.1a (P2) |

## Re-Validation Results
[Which passes were re-run, what was found]

## Downstream Readiness Assessment
- **Gate result:** Pass | Conditional Pass | Fail
- **Handoff notes:** [specific items the next phase should be aware of]
- **Remaining P2/P3 items:** [count and brief summary, for future reference]
```

---

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

Continue with: `/scaffold:innovate-vision`
