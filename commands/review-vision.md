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
- (mvp) Passes 1 and 5 executed with findings documented
- All 5 review passes executed with findings documented
- Every finding categorized by severity (P0-P3)
- Fix plan created for P0 and P1 findings
- Fixes applied and re-validated
- (mvp) Every vision section has content specific enough to derive a PRD without asking strategic clarification questions
- (depth 4+) Multi-model review findings synthesized with consensus/disagreement analysis

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

## Summary

- **Multi-pass review**: Each pass has a single focus (coverage, consistency, structure, downstream readiness). Passes are ordered broadest-to-most-specific.
- **Finding severity**: P0 blocks next phase (must fix), P1 is a significant gap (should fix), P2 is an improvement opportunity (fix if time permits), P3 is nice-to-have (skip).
- **Fix planning**: Group findings by root cause, same section, and same severity. Fix all P0s first, then P1s. Never fix ad hoc.
- **Re-validation**: After applying fixes, re-run the specific passes that produced the findings. Stop when no new P0/P1 findings appear.
- **Downstream readiness gate**: Final check verifies the next phase can proceed with these artifacts. Outcomes: pass, conditional pass, or fail.
- **Review report**: Structured output with executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Deep Guidance

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

### multi-model-review-dispatch

*Patterns for dispatching reviews to external AI models (Codex, Gemini) at depth 4+, including fallback strategies and finding reconciliation*

# Multi-Model Review Dispatch

At higher methodology depths (4+), reviews benefit from independent validation by external AI models. Different models have different blind spots — Codex excels at code-centric analysis while Gemini brings strength in design and architectural reasoning. Dispatching to multiple models and reconciling their findings produces higher-quality reviews than any single model alone. This knowledge covers when to dispatch, how to dispatch, how to handle failures, and how to reconcile disagreements.

## Summary

### When to Dispatch

Multi-model review activates at depth 4+ in the methodology scaling system:

| Depth | Review Approach |
|-------|----------------|
| 1-2 | Claude-only, reduced pass count |
| 3 | Claude-only, full pass count |
| 4 | Full passes + one external model (if available) |
| 5 | Full passes + multi-model with reconciliation |

Dispatch is always optional. If no external model CLI is available, the review proceeds as a Claude-only enhanced review with additional self-review passes to partially compensate.

### Model Selection

| Model | Strength | Best For |
|-------|----------|----------|
| **Codex** (OpenAI) | Code analysis, implementation correctness, API contract validation | Code reviews, security reviews, API reviews, database schema reviews |
| **Gemini** (Google) | Design reasoning, architectural patterns, broad context understanding | Architecture reviews, PRD reviews, UX reviews, domain model reviews |

When both models are available at depth 5, dispatch to both and reconcile. At depth 4, choose the model best suited to the artifact type.

### Graceful Fallback

External models are never required. The fallback chain:
1. Attempt dispatch to selected model(s)
2. If CLI unavailable → skip that model, note in report
3. If timeout → use partial results if any, note incompleteness
4. If all external models fail → Claude-only enhanced review (additional self-review passes)

The review never blocks on external model availability.

## Deep Guidance

### Dispatch Mechanics

#### CLI Availability Check

Before dispatching, verify the model CLI is installed and authenticated:

```bash
# Codex check
which codex && codex --version 2>/dev/null

# Gemini check (via Google Cloud CLI or dedicated tool)
which gemini 2>/dev/null || (which gcloud && gcloud ai models list 2>/dev/null)
```

If the CLI is not found, skip dispatch immediately. Do not prompt the user to install it — this is a review enhancement, not a requirement.

#### Prompt Formatting

External model prompts must be self-contained. The external model has no access to the pipeline context, CLAUDE.md, or prior conversation. Every dispatch includes:

1. **Artifact content** — The full text of the document being reviewed
2. **Review focus** — What specific aspects to evaluate (coverage, consistency, correctness)
3. **Upstream context** — Relevant upstream artifacts that the document should be consistent with
4. **Output format** — Structured JSON for machine-parseable findings

**Prompt template:**
```
You are reviewing the following [artifact type] for a software project.

## Document Under Review
[full artifact content]

## Upstream Context
[relevant upstream artifacts, summarized or in full]

## Review Instructions
Evaluate this document for:
1. Coverage — Are all expected topics addressed?
2. Consistency — Does it agree with the upstream context?
3. Correctness — Are technical claims accurate?
4. Completeness — Are there gaps that would block downstream work?

## Output Format
Respond with a JSON array of findings:
[
  {
    "id": "F-001",
    "severity": "P0|P1|P2|P3",
    "category": "coverage|consistency|correctness|completeness",
    "location": "section or line reference",
    "finding": "description of the issue",
    "suggestion": "recommended fix"
  }
]
```

#### Output Parsing

External model output is parsed as JSON. Handle common parsing issues:
- Strip markdown code fences (```json ... ```) if the model wraps output
- Handle trailing commas in JSON arrays
- Validate that each finding has the required fields (severity, category, finding)
- Discard malformed entries rather than failing the entire parse

Store raw output for audit:
```
docs/reviews/{artifact}/codex-review.json   — raw Codex findings
docs/reviews/{artifact}/gemini-review.json  — raw Gemini findings
docs/reviews/{artifact}/review-summary.md   — reconciled synthesis
```

### Timeout Handling

External model calls can hang or take unreasonably long. Set reasonable timeouts:

| Operation | Timeout | Rationale |
|-----------|---------|-----------|
| CLI availability check | 5 seconds | Should be instant |
| Small artifact review (<2000 words) | 60 seconds | Quick read and analysis |
| Medium artifact review (2000-10000 words) | 120 seconds | Needs more processing time |
| Large artifact review (>10000 words) | 180 seconds | Maximum reasonable wait |

#### Partial Result Handling

If a timeout occurs mid-response:
1. Check if the partial output contains valid JSON entries
2. If yes, use the valid entries and note "partial results" in the report
3. If no, treat as a model failure and fall back

Never wait indefinitely. A review that completes in 3 minutes with Claude-only findings is better than one that blocks for 10 minutes waiting for an external model.

### Finding Reconciliation

When multiple models produce findings, reconciliation synthesizes them into a unified report.

#### Consensus Analysis

Compare findings across models to identify agreement and disagreement:

**Consensus** — Multiple models flag the same issue (possibly with different wording). High confidence in the finding. Use the most specific description.

**Single-source finding** — Only one model flags an issue. Lower confidence but still valuable. Include in the report with a note about which model found it.

**Disagreement** — One model flags an issue that another model explicitly considers correct. Requires manual analysis.

#### Reconciliation Process

1. **Normalize findings.** Map each model's findings to a common schema (severity, category, location, description).

2. **Match findings across models.** Two findings match if they reference the same location and describe the same underlying issue (even with different wording). Use location + category as the matching key.

3. **Score by consensus.**
   - Found by all models → confidence: high
   - Found by majority → confidence: medium
   - Found by one model → confidence: low (but still reported)

4. **Resolve severity disagreements.** When models disagree on severity:
   - If one says P0 and another says P1 → use P0 (err on the side of caution)
   - If one says P1 and another says P3 → investigate the specific finding before deciding
   - Document the disagreement in the synthesis report

5. **Merge descriptions.** When multiple models describe the same finding differently, combine their perspectives. Model A might identify the symptom while Model B identifies the root cause.

#### Disagreement Resolution

When models actively disagree (one flags an issue, another says the same thing is correct):

1. **Read both arguments.** Each model explains its reasoning. One may have a factual error.
2. **Check against source material.** Read the actual artifact and upstream docs. The correct answer is in the documents, not in model opinions.
3. **Default to the stricter interpretation.** If genuinely ambiguous, the finding stands at reduced severity (P1 → P2).
4. **Document the disagreement.** The reconciliation report should note: "Models disagreed on [topic]. Resolution: [decision and rationale]."

### Output Format

#### Review Summary (review-summary.md)

```markdown
# Multi-Model Review Summary: [Artifact Name]

## Models Used
- Claude (primary reviewer)
- Codex (external, depth 4+) — [available/unavailable/timeout]
- Gemini (external, depth 5) — [available/unavailable/timeout]

## Consensus Findings
| # | Severity | Finding | Models | Confidence |
|---|----------|---------|--------|------------|
| 1 | P0 | [description] | Claude, Codex | High |
| 2 | P1 | [description] | Claude, Codex, Gemini | High |

## Single-Source Findings
| # | Severity | Finding | Source | Confidence |
|---|----------|---------|--------|------------|
| 3 | P1 | [description] | Gemini | Low |

## Disagreements
| # | Topic | Claude | Codex | Resolution |
|---|-------|--------|-------|------------|
| 4 | [topic] | P1 issue | No issue | [resolution rationale] |

## Reconciliation Notes
[Any significant observations about model agreement patterns, recurring themes,
or areas where external models provided unique value]
```

#### Raw JSON Preservation

Always preserve the raw JSON output from external models, even after reconciliation. The raw findings serve as an audit trail and enable re-analysis if the reconciliation logic is later improved.

```
docs/reviews/{artifact}/
  codex-review.json     — raw output from Codex
  gemini-review.json    — raw output from Gemini
  review-summary.md     — reconciled synthesis
```

### Quality Gates

Minimum standards for a multi-model review to be considered complete:

| Gate | Threshold | Rationale |
|------|-----------|-----------|
| Minimum finding count | At least 3 findings across all models | A review with zero findings likely missed something |
| Coverage threshold | Every review pass has at least one finding or explicit "no issues found" note | Ensures all passes were actually executed |
| Reconciliation completeness | All cross-model disagreements have documented resolutions | No unresolved conflicts |
| Raw output preserved | JSON files exist for all models that were dispatched | Audit trail |

If the primary Claude review produces zero findings and external models are unavailable, the review should explicitly note this as unusual and recommend a targeted re-review at a later stage.

### Common Anti-Patterns

**Blind trust of external findings.** An external model flags an issue and the reviewer includes it without verification. External models hallucinate — they may flag a "missing section" that actually exists, or cite a "contradiction" based on a misread. Fix: every external finding must be verified against the actual artifact before inclusion in the final report.

**Ignoring disagreements.** Two models disagree, and the reviewer picks one without analysis. Fix: disagreements are the most valuable signal in multi-model review. They identify areas of genuine ambiguity or complexity. Always investigate and document the resolution.

**Dispatching at low depth.** Running external model reviews at depth 1-2 where the review scope is intentionally minimal. The external model does a full analysis anyway, producing findings that are out of scope. Fix: only dispatch at depth 4+. Lower depths use Claude-only review with reduced pass count.

**No fallback plan.** The review pipeline assumes external models are always available. When Codex is down, the review fails entirely. Fix: external dispatch is always optional. The fallback to Claude-only enhanced review must be implemented and tested.

**Over-weighting consensus.** Two models agree on a finding, so it must be correct. But both models may share the same bias (e.g., both flag a pattern as an anti-pattern that is actually appropriate for this project's constraints). Fix: consensus increases confidence but does not guarantee correctness. All findings still require artifact-level verification.

**Dispatching the full pipeline context.** Sending the entire project context (all docs, all code) to the external model. This exceeds context limits and dilutes focus. Fix: send only the artifact under review and the minimal upstream context needed for that specific review.

**Ignoring partial results.** A model times out after producing 3 of 5 findings. The reviewer discards all results because the review is "incomplete." Fix: partial results are still valuable. Include them with a note about incompleteness. Three real findings are better than zero.

---

### review-step-template

*Shared template pattern for review pipeline steps including multi-model dispatch, finding severity, and resolution workflow*

# Review Step Template

## Summary

This entry documents the common structure shared by all 15+ review pipeline steps. Individual review steps customize this structure with artifact-specific failure modes and review passes, but the scaffolding is consistent across all reviews.

**Purpose pattern**: Every review step targets domain-specific failure modes for a given artifact — not generic quality checks. Each pass has a specific focus, concrete checking instructions, and example findings.

**Standard inputs**: Primary artifact being reviewed, upstream artifacts for cross-reference validation, `review-methodology` knowledge + artifact-specific review knowledge entry.

**Standard outputs**: Review document (`docs/reviews/review-{artifact}.md`), updated primary artifact with P0/P1 fixes applied, and at depth 4+: multi-model artifacts (`codex-review.json`, `gemini-review.json`, `review-summary.md`) under `docs/reviews/{artifact}/`.

**Finding severity**: P0 (blocking — must fix), P1 (significant — fix before implementation), P2 (improvement — fix if time permits), P3 (nitpick — log for later).

**Methodology scaling**: Depth 1-2 runs top passes only (P0 focus). Depth 3 runs all passes. Depth 4-5 adds multi-model dispatch to Codex/Gemini with finding synthesis.

**Mode detection**: First review runs all passes from scratch. Re-review preserves prior findings, marks resolved ones, and reports NEW/EXISTING/RESOLVED status.

**Frontmatter conventions**: Reviews are order = creation step + 10, always include `review-methodology` in knowledge-base, and are never conditional.

## Deep Guidance

### Purpose Pattern

Every review step follows the pattern:

> Review **[artifact]** targeting **[domain]**-specific failure modes.

The review does not check generic quality ("is this document complete?"). Instead, it runs artifact-specific passes that target the known ways that artifact type fails. Each pass has a specific focus, concrete checking instructions, and example findings.

### Standard Inputs

Every review step reads:
- **Primary artifact**: The document being reviewed (e.g., `docs/domain-models.md`, `docs/api-contracts.md`)
- **Upstream artifacts**: Documents the primary artifact was built from (e.g., PRD, domain models, ADRs) -- used for cross-reference validation
- **Knowledge base entries**: `review-methodology` (shared process) + artifact-specific review knowledge (e.g., `review-api-design`, `review-database-design`)

### Standard Outputs

Every review step produces:
- **Review document**: `docs/reviews/review-{artifact}.md` -- findings organized by pass, with severity and trace information
- **Updated artifact**: The primary artifact with fixes applied for P0/P1 findings
- **Depth 4+ multi-model artifacts** (when methodology depth >= 4):
  - `docs/reviews/{artifact}/codex-review.json` -- Codex independent review findings
  - `docs/reviews/{artifact}/gemini-review.json` -- Gemini independent review findings
  - `docs/reviews/{artifact}/review-summary.md` -- Synthesized findings from all models

### Finding Severity Levels

All review steps use the same four-level severity scale:

| Level | Name | Meaning | Action |
|-------|------|---------|--------|
| P0 | Blocking | Cannot proceed to downstream steps without fixing | Must fix before moving on |
| P1 | Significant | Downstream steps can proceed but will encounter problems | Fix before implementation |
| P2 | Improvement | Artifact works but could be better | Fix if time permits |
| P3 | Nitpick | Style or preference | Log for future cleanup |

### Finding Format

Each finding includes:
- **Pass**: Which review pass discovered it (e.g., "Pass 3 -- Auth/AuthZ Coverage")
- **Priority**: P0-P3
- **Location**: Specific section, line, or element in the artifact
- **Issue**: What is wrong, with concrete details
- **Impact**: What goes wrong downstream if this is not fixed
- **Recommendation**: Specific fix, not just "fix this"
- **Trace**: Link back to upstream artifact that establishes the requirement (e.g., "PRD Section 3.2 -> Architecture DF-005")

### Example Finding

```markdown
### Finding F-003 (P1)
- **Pass**: Pass 2 — Entity Coverage
- **Location**: docs/domain-models/order.md, Section "Order Aggregate"
- **Issue**: Order aggregate does not include a `cancellationReason` field, but PRD
  Section 4.1 requires cancellation reason tracking for analytics.
- **Impact**: Implementation will lack cancellation reason; analytics pipeline will
  receive null values, causing dashboard gaps.
- **Recommendation**: Add `cancellationReason: CancellationReason` value object to
  Order aggregate with enum values: USER_REQUEST, PAYMENT_FAILED, OUT_OF_STOCK,
  ADMIN_ACTION.
- **Trace**: PRD §4.1 → User Story US-014 → Domain Model: Order Aggregate
```

### Review Document Structure

Every review output document follows a consistent structure:

```markdown
  # Review: [Artifact Name]

  **Date**: YYYY-MM-DD
  **Methodology**: deep | mvp | custom:depth(N)
  **Status**: INITIAL | RE-REVIEW
  **Models**: Claude | Claude + Codex | Claude + Codex + Gemini

  ## Findings Summary
  - Total findings: N (P0: X, P1: Y, P2: Z, P3: W)
  - Passes run: N of M
  - Artifacts checked: [list]

  ## Findings by Pass

  ### Pass 1 — [Pass Name]
  [Findings listed by severity, highest first]

  ### Pass 2 — [Pass Name]
  ...

  ## Resolution Log
  | Finding | Severity | Status | Resolution |
  |---------|----------|--------|------------|
  | F-001   | P0       | RESOLVED | Fixed in commit abc123 |
  | F-002   | P1       | EXISTING | Deferred — tracked in ADR-015 |

  ## Multi-Model Synthesis (depth 4+)
  ### Convergent Findings
  [Issues found by 2+ models — high confidence]

  ### Divergent Findings
  [Issues found by only one model — requires manual triage]
```

### Methodology Scaling Pattern

Review steps scale their thoroughness based on the methodology depth setting:

### Depth 1-2 (MVP/Minimal)
- Run only the highest-impact passes (typically passes 1-3)
- Single-model review only
- Focus on P0 findings; skip P2/P3
- Abbreviated finding descriptions

### Depth 3 (Standard)
- Run all review passes
- Single-model review
- Report all severity levels
- Full finding descriptions with trace information

### Depth 4-5 (Comprehensive)
- Run all review passes
- Multi-model dispatch: send the artifact to Codex and Gemini for independent analysis
- Synthesize findings from all models, flagging convergent findings (multiple models found the same issue) as higher confidence
- Cross-artifact consistency checks against all upstream documents
- Full finding descriptions with detailed trace and impact analysis

### Depth Scaling Example

At depth 2 (MVP), a domain model review might produce:

```markdown
  # Review: Domain Models (MVP)
  ## Findings Summary
  - Total findings: 3 (P0: 1, P1: 2)
  - Passes run: 3 of 10
  ## Findings
  ### F-001 (P0) — Missing aggregate root for Payment bounded context
  ### F-002 (P1) — Order entity lacks status field referenced in user stories
  ### F-003 (P1) — No domain event defined for order completion
```

At depth 5 (comprehensive), the same review would run all 10 passes, dispatch to
Codex and Gemini, and produce a full synthesis with 15-30 findings across all
severity levels.

### Mode Detection Pattern

Every review step checks whether this is a first review or a re-review:

**First review**: No prior review document exists. Run all passes from scratch.

**Re-review**: A prior review document exists (`docs/reviews/review-{artifact}.md`). The step:
1. Reads the prior review findings
2. Checks which findings were addressed (fixed in the artifact)
3. Marks resolved findings as "RESOLVED" rather than removing them
4. Runs all passes again looking for new issues or regressions
5. Reports findings as "NEW", "EXISTING" (still unfixed), or "RESOLVED"

This preserves review history and makes progress visible.

### Resolution Workflow

The standard workflow from review to resolution:

1. **Review**: Run the review step, producing findings
2. **Triage**: Categorize findings by severity; confirm P0s are genuine blockers
3. **Fix**: Update the primary artifact to address P0 and P1 findings
4. **Re-review**: Run the review step again in re-review mode
5. **Verify**: Confirm all P0 findings are resolved; P1 findings are resolved or have documented justification for deferral
6. **Proceed**: Move to the next pipeline phase

For depth 4+ reviews, the multi-model dispatch happens in both the initial review and the re-review, ensuring fixes do not introduce new issues visible to other models.

### Frontmatter Pattern

Review steps follow a consistent frontmatter structure:

```yaml
---
name: review-{artifact}
description: "Review {artifact} for completeness, consistency, and downstream readiness"
phase: "{phase-slug}"
order: {N}20  # Reviews are always 10 after their creation step
dependencies: [{creation-step}]
outputs: [docs/reviews/review-{artifact}.md, docs/reviews/{artifact}/review-summary.md, docs/reviews/{artifact}/codex-review.json, docs/reviews/{artifact}/gemini-review.json]
conditional: null
knowledge-base: [review-methodology, review-{artifact-domain}]
---
```

Key conventions:
- Review steps always have order = creation step order + 10
- Primary output uses `review-` prefix; multi-model directory uses bare artifact name
- Knowledge base always includes `review-methodology` plus a domain-specific entry
- Reviews are never conditional — if the creation step ran, the review runs

### Common Anti-Patterns

### Reviewing Without Upstream Context
Running a review without loading the upstream artifacts that define requirements.
The review cannot verify traceability if it does not have the PRD, domain models,
or ADRs that establish what the artifact should contain.

### Severity Inflation
Marking everything as P0 to force immediate action. This undermines the severity
system and causes triage fatigue. Reserve P0 for genuine blockers where downstream
steps will fail or produce incorrect output.

### Fix Without Re-Review
Applying fixes to findings without re-running the review. Fixes can introduce new
issues or incompletely address the original finding. Always re-review after fixes.

### Ignoring Convergent Multi-Model Findings
When multiple models independently find the same issue, it has high confidence.
Dismissing convergent findings without strong justification undermines the value
of multi-model review.

### Removing Prior Findings
Deleting findings from a re-review output instead of marking them RESOLVED. This
loses review history and makes it impossible to track what was caught and fixed.

---

### review-vision

*Vision-specific review passes, failure modes, and quality criteria for product vision documents*

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

---

## After This Step

Continue with: `/scaffold:innovate-vision`
