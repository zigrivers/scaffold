---
description: "Multi-pass review of the PRD for completeness, clarity, and downstream readiness"
long-description: "Reviews the PRD across eight passes — problem rigor, persona coverage, feature scoping, success criteria, internal consistency, constraints, non-functional requirements — and fixes blocking issues."
---

## Purpose
Deep multi-pass review of the PRD, targeting the specific failure modes of
product requirements artifacts. Identify issues, create a fix plan, execute
fixes, and re-validate. Ensures the PRD is complete, clear, consistent, and
ready for User Stories to consume.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/plan.md (required) — PRD to review
- Project idea or brief (context from user, if available)

## Expected Outputs
- docs/reviews/pre-review-prd.md — review findings, fix plan, and resolution log
- docs/plan.md — updated with fixes
- docs/reviews/prd/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/prd/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/prd/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Passes 1-2 executed with findings documented
- (deep) All review passes executed with findings documented
- (mvp) Every finding categorized by severity: P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.
- (mvp) Fix plan created for P0 and P1 findings
- (mvp) Fixes applied and re-validated
- (mvp) Downstream readiness confirmed (User Stories can proceed)
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: All 8 review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Passes 1-2 only (Problem Statement Rigor, Persona Coverage). Focus
  on blocking gaps — requirements too vague to write stories from.
- **custom:depth(1-5)**:
  - Depth 1: Pass 1 only (Problem Statement Rigor). One review pass.
  - Depth 2: Passes 1-2 (Problem Statement Rigor, Persona Coverage). Two review passes.
  - Depth 3: Passes 1-4 (add Feature Scoping, Success Criteria). Four review passes.
  - Depth 4: All 8 passes + one external model review (if CLI available).
  - Depth 5: All 8 passes + multi-model review with reconciliation.

## Mode Detection
If docs/reviews/pre-review-prd.md exists, this is a re-review. Read previous
findings, check which were addressed, run review passes again on updated PRD.
If multi-model review artifacts exist under docs/reviews/prd/, preserve prior
findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/pre-review-prd.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate

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

### review-prd

*Failure modes and review passes specific to product requirements document artifacts*

# Review: Product Requirements Document

The PRD is the foundation of the entire pipeline. Every subsequent phase builds on it — user stories, domain models, architecture, implementation tasks. A gap or error here compounds through everything downstream. This review uses 8 passes targeting the specific ways PRD artifacts fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Problem Statement Rigor**: Verify the problem is specific, testable, grounded in evidence, and names a specific user group without prescribing solutions.
- **Pass 2 — Persona & Stakeholder Coverage**: Ensure personas are goal-driven with constraints and context; 2-4 meaningful personas covering all stakeholder groups.
- **Pass 3 — Feature Scoping Completeness**: Confirm in-scope, out-of-scope, and deferred lists exist; features are specific enough to estimate with prioritization applied.
- **Pass 4 — Success Criteria Measurability**: Every criterion needs a target value, measurement method, and tie-back to the problem statement.
- **Pass 5 — NFR Quantification**: All NFR categories addressed with quantified targets and conditions, not adjectives.
- **Pass 6 — Constraint & Dependency Documentation**: Technical, timeline, budget, team, and regulatory constraints present with traceable downstream impact.
- **Pass 7 — Error & Edge Case Coverage**: Sad paths for every feature with user input or external dependencies; failure modes for third-party integrations.
- **Pass 8 — Downstream Readiness for User Stories**: Features specific enough to map to stories, personas specific enough to be actors, business rules explicit enough for acceptance criteria.

## Deep Guidance

---

## Pass 1: Problem Statement Rigor

### What to Check

- Is the problem specific, testable, grounded in observable reality?
- Has quantitative evidence where available?
- Doesn't prescribe solutions?
- Names a specific user group, not "users" or "everyone"?

### Why This Matters

The problem statement anchors every decision in the pipeline. If it prescribes a solution instead of describing a pain point, the entire product is built to validate a predetermined answer rather than solve a real problem. Vague problem statements produce vague requirements, which produce vague stories, which produce implementations that technically work but don't solve anything. A problem statement that names "users" instead of a specific group gives no signal about whose needs to prioritize when trade-offs arise.

### How to Check

1. Read the problem statement in isolation — does it describe an observable user pain point?
2. Check for solution language ("we need to build," "we should use," "modernize our stack") — these prescribe solutions, not problems
3. Check for a named, specific user group — not "users," "everyone," or "stakeholders"
4. Look for quantitative evidence (hours wasted, error rates, revenue lost, support tickets) — if none exists, flag it
5. Verify the problem is testable — could you measure whether it's been solved?

### What a Finding Looks Like

- P0: "Problem statement is 'We need to modernize our technology stack' — this prescribes a solution, not a problem. No user-facing pain point identified."
- P1: "Problem statement names 'small business owners' but provides no quantitative evidence of the pain. How many hours wasted? What error rate?"

---

## Pass 2: Persona & Stakeholder Coverage

### What to Check

- Are personas goal-driven with constraints, current behavior, and success criteria?
- Every stakeholder group represented (end users, admins, support, integrators)?
- No "Everything User" anti-pattern (contradictory persona)?
- 2-4 meaningful personas (>6 suggests scope too broad, 1 suggests missing secondary users)?

### Why This Matters

Personas become story actors. If a persona is just a role label ("Admin") with no goals, constraints, or context, stories attributed to that persona are ungrounded — the agent writing them has to invent motivations. Missing stakeholder groups mean entire user journeys have no stories. The "Everything User" anti-pattern (a single persona who is both a power user and a beginner, both technical and non-technical) makes prioritization impossible because every feature is equally important to the same persona.

### How to Check

1. List every persona defined in the PRD
2. For each persona, check for: specific goals, constraints, current behavior, and success criteria
3. Count personas — fewer than 2 usually means secondary users are missing; more than 6 usually means scope is too broad
4. Check for contradictions within a single persona (wants simplicity AND power-user features)
5. List stakeholder groups that interact with the system (end users, admins, support, integrators, billing) and verify each has a persona or is explicitly out of scope
6. Check that persona descriptions include enough context to write stories — not just "Admin: manages the system"

### What a Finding Looks Like

- P0: "PRD defines a single persona 'User' with no goals, constraints, or context. Cannot write stories — no actor to attribute them to."
- P1: "PRD describes end user and admin but no mention of support staff, who handle 200+ tickets/week per the problem statement."

---

## Pass 3: Feature Scoping Completeness

### What to Check

- In-scope, out-of-scope, and deferred lists all present?
- Features specific enough to estimate (not "user management" or "analytics")?
- Prioritization applied (MoSCoW or equivalent)?
- No "requirements as solutions" (PRD says WHAT, not HOW)?

### Why This Matters

Missing scope boundaries cause the most expensive downstream failures. Without an out-of-scope list, implementing agents may build features the product team never intended. Without a deferred list, features that should wait for v2 get built into v1, expanding scope and timeline. Vague feature descriptions ("user management") are impossible to decompose into stories — two different agents would build completely different things. Technical prescriptions ("use React and PostgreSQL") in the PRD constrain architecture before the architecture phase has run.

### How to Check

1. Verify three lists exist: in-scope, out-of-scope, and deferred
2. For each in-scope feature, check specificity — could two different people reading this description agree on what to build?
3. Check for prioritization (MoSCoW, P0-P3, or equivalent) — if all features are "must-have," prioritization hasn't happened
4. Scan for technical prescriptions — the PRD should say WHAT the product does, not HOW it's built
5. Check that feature descriptions describe user-facing behavior, not implementation details

### What a Finding Looks Like

- P0: "No out-of-scope section exists. 'Product management' is listed as a feature with no further detail — could mean anything from a product catalog to a full PIM system."
- P1: "Feature 'notifications' doesn't specify channel (push? email? in-app? all three?) — two engineers would build different things."

---

## Pass 4: Success Criteria Measurability

### What to Check

- Every criterion has a target value AND a measurement method?
- Criteria tied to the problem statement (not generic "revenue increases")?
- Types covered: user behavior, business metrics, technical metrics, adoption?

### Why This Matters

Success criteria that can't be measured can't be verified. "Users are satisfied" is not a success criterion — it's a hope. Without target values, any movement in the right direction technically satisfies the criterion. Without measurement methods, the team can't verify success even if they achieve it. Criteria disconnected from the problem statement indicate the PRD has drifted from its original purpose.

### How to Check

1. List every success criterion in the PRD
2. For each, check for a specific target value (a number, a percentage, a threshold)
3. For each, check for a measurement method (how will this be measured? what tool or process?)
4. Trace each criterion back to the problem statement — does it measure whether the problem is solved?
5. Check coverage across types: user behavior metrics, business metrics, technical metrics, adoption metrics — if only one type is present, the others are likely missing
6. Flag criteria that are generic ("increase user satisfaction") rather than specific ("reduce checkout abandonment from 72% to 45%")

### What a Finding Looks Like

- P0: "Only success criterion is 'users are satisfied with the product' — no target value, no measurement method, not tied to problem statement."
- P1: "Success criterion 'checkout abandonment decreases' has no target value. Decrease from 72% to 71% would technically satisfy it."

---

## Pass 5: NFR Quantification

### What to Check

- All NFR categories addressed: performance, scalability, availability, security, accessibility, data retention, i18n, browser/device support, monitoring?
- Quantified with numbers, not adjectives ("p95 under 200ms" not "fast")?
- Conditions specified (under what load, on what connection)?

### Why This Matters

Missing or vague NFRs force implementing agents to make arbitrary decisions about performance, security, and reliability. "The system should be fast" means something different to every engineer. Without quantified targets and conditions, the architecture phase has no constraints to design against, and the testing phase has no thresholds to verify. NFR gaps discovered during implementation are orders of magnitude more expensive to fix than NFR gaps caught during PRD review.

### How to Check

1. Check each NFR category: performance, scalability, availability, security, accessibility, data retention, i18n, browser/device support, monitoring
2. For each category present, verify quantification — numbers, not adjectives
3. For performance NFRs, check for conditions: under what load? on what hardware? at what percentile?
4. For availability NFRs, check for specifics: what's the target uptime? what's the maximum acceptable downtime window?
5. For security NFRs, check for compliance standards (SOC 2, GDPR, PCI DSS) where applicable
6. Flag any NFR category that's completely absent

### What a Finding Looks Like

- P0: "No NFRs specified at all. Implementing agents will make arbitrary performance and security decisions."
- P1: "Performance requirement says 'the system should be fast' — no response time targets, no percentile, no load conditions."

---

## Pass 6: Constraint & Dependency Documentation

### What to Check

- Technical, timeline, budget, team, and regulatory constraints present?
- Each constraint traceable to downstream architectural impact?
- External integrations identified with API limitations, costs, rate limits?

### Why This Matters

Undocumented constraints surface as surprises during implementation. A Stripe integration without PCI DSS compliance noted will derail the architecture phase. A team constraint of 3 developers without connection to scope decisions means the plan may be unachievable. Regulatory constraints discovered late can require fundamental redesigns. Every constraint should be visible to downstream phases so they can design around it rather than into it.

### How to Check

1. Check each constraint category: technical, timeline, budget, team size/skills, regulatory/compliance
2. For each constraint, trace the downstream impact — how does this affect architecture, implementation, or testing?
3. List all external integrations mentioned in the PRD
4. For each integration, check for: API limitations, costs, rate limits, authentication requirements, compliance requirements
5. Flag constraints that are stated but not connected to decisions — "we have 3 developers" without scope implications

### What a Finding Looks Like

- P1: "PRD mentions Stripe integration but doesn't note PCI DSS compliance requirement — this will surface as a surprise during architecture."
- P2: "Team constraint '3 developers' is stated but not connected to scope decisions — are all features achievable with this team size?"

---

## Pass 7: Error & Edge Case Coverage

### What to Check

- Sad paths addressed for every feature with user input or external dependencies?
- Session expiry, network failure, concurrent access scenarios considered?
- Failure modes for third-party integrations documented?

### Why This Matters

Happy-path-only PRDs produce happy-path-only implementations. When the PRD doesn't describe what happens when a payment fails, the implementing agent either guesses (producing inconsistent error handling) or ignores it (producing a broken user experience). Edge cases in user input, network conditions, and third-party integrations are where most production bugs live. Documenting them in the PRD ensures they flow into stories, acceptance criteria, and test cases.

### How to Check

1. For each feature involving user input, check: what happens with invalid input? empty input? malicious input?
2. For each feature involving external dependencies, check: what happens when the dependency is unavailable? slow? returns unexpected data?
3. Check for session-related scenarios: session expiry mid-action, concurrent access from multiple devices, browser back button during multi-step flows
4. Check for data-related edge cases: duplicate submissions, race conditions, large data volumes
5. For each third-party integration, check: failure modes documented? retry logic specified? fallback behavior defined?

### What a Finding Looks Like

- P1: "Checkout flow describes the happy path but never addresses: payment failure, session expiry mid-checkout, network drop during payment processing."
- P2: "User profile edit doesn't address concurrent edit scenario — what if user edits on two devices simultaneously?"

---

## Pass 8: Downstream Readiness for User Stories

### What to Check

- Can stories be written from this PRD without guesswork?
- Features specific enough to map to stories (one feature = one or more stories)?
- Personas specific enough to be story actors?
- Business rules explicit enough to become acceptance criteria?
- Error scenarios detailed enough to become negative test scenarios?

### Why This Matters

The PRD's primary consumer is the user stories phase. If features are too vague to decompose into stories, the story-writing agent must invent requirements — and its inventions may not match the product team's intent. Personas that are just role labels can't be story actors. Business rules that are implied but not stated produce acceptance criteria that are guesses rather than specifications. This pass is the final gate before the PRD leaves the pre-pipeline and enters the main pipeline.

### How to Check

1. Select 3-5 representative features from different areas of the PRD
2. For each, attempt to write a story title ("As a [persona], I want to [action] so that [benefit]") — if you can't fill in the blanks, the feature or persona is too vague
3. For each, attempt to write 2-3 acceptance criteria from the PRD description alone — if you have to guess at business rules, they're not explicit enough
4. Check that error scenarios in the PRD are detailed enough to become "Given [error condition], When [user action], Then [expected behavior]" acceptance criteria
5. Verify that the mapping from features to stories would be roughly 1:N (one feature produces one or more stories) — if a feature maps to zero stories, it's too vague; if it maps to 20+, it should have been decomposed in the PRD

### What a Finding Looks Like

- P0: "Feature 'user management' cannot be decomposed into stories — what operations? What user types? What permissions model?"
- P1: "Business rules for discount application are implied but not stated — story acceptance criteria will have to guess at validation logic."

### Example Review Finding

```markdown
### Finding: NFRs use qualitative adjectives instead of quantified targets

**Pass:** 5 — NFR Quantification
**Priority:** P1
**Location:** PRD Section 6 "Non-Functional Requirements"

**Issue:** Performance requirements state "the system should be fast and responsive."
No response time targets, percentile thresholds, or load conditions are specified.
"Fast" is subjective — it means <100ms to a backend engineer and <3s to a product
manager evaluating full page loads.

Similarly, availability requirement states "high availability" without specifying
a target uptime percentage, maximum acceptable downtime window, or recovery time
objective (RTO).

**Impact:** The architecture step cannot make infrastructure decisions (single
instance vs. load-balanced, database read replicas, CDN) without quantified
performance targets. The testing step cannot write performance tests without
thresholds to assert against. Implementing agents will make arbitrary performance
trade-offs with no shared baseline.

**Recommendation:** Replace with quantified targets:
- "API response time: p95 < 200ms, p99 < 500ms under 1000 concurrent users"
- "Page load time: Largest Contentful Paint < 2.5s on 4G connection"
- "Availability: 99.9% uptime (8.7 hours maximum downtime per year)"
- "Recovery: RTO < 15 minutes, RPO < 1 hour"

**Trace:** PRD Section 6 → blocks Architecture Phase → blocks Implementation
```

---

### prd-craft

*What makes a good PRD — problem framing, feature scoping, success criteria, competitive context*

# PRD Craft

A Product Requirements Document is the single source of truth for what is being built and why. It defines the problem, the users, the scope, and the success criteria. Everything in the pipeline flows from the PRD — domain models, architecture, implementation tasks. A weak PRD propagates weakness through every downstream artifact.

## Summary

### PRD Structure

A complete PRD includes these sections:
1. **Problem Statement** — Specific, testable, grounded in observable reality. Names a user group, describes a pain point, includes quantitative evidence.
2. **Target Users** — Personas with roles, needs, current behavior, constraints, and success criteria. Typically 2-4 meaningful personas.
3. **Feature Scoping** — Three explicit lists: In Scope (v1), Out of Scope, and Deferred (future). Each in-scope feature detailed enough to estimate.
4. **Success Criteria** — Measurable outcomes tied to the problem statement with target values and measurement methods.
5. **Constraints** — Technical, timeline, budget, team, and regulatory constraints traceable to architectural decisions.
6. **Non-Functional Requirements** — Quantified performance, scalability, availability, security, accessibility, data, i18n, browser/device support, and monitoring requirements.
7. **Competitive Context** — What exists, how this differs, why users would switch.

### Quality Criteria

- Problem statement is specific and testable
- Features are prioritized with MoSCoW (Must/Should/Could/Won't)
- Success criteria have target values and measurement methods
- NFRs are quantified (not "fast" but "p95 under 200ms")
- Error scenarios and edge cases are addressed
- The PRD says WHAT, not HOW
- Every feature is detailed enough for estimation without prescribing implementation

## Deep Guidance

### Problem Statement

The problem statement is the foundation. If it is wrong, everything built on top of it is wrong.

#### What Makes a Good Problem Statement

A good problem statement is **specific**, **testable**, and **grounded in observable reality**.

**Good examples:**
- "Small business owners spend an average of 6 hours per week manually reconciling invoices from 3+ payment processors because no tool aggregates them into a single view."
- "Mobile users abandon checkout at a 72% rate because the current flow requires 7 form screens on a 4-inch display."
- "Customer support handles 200+ tickets per week about order status because there is no self-service tracking interface."

**Bad examples:**
- "We need to improve the user experience." (Not specific — improve what? For whom? By how much?)
- "The platform should be more scalable." (Not a problem — scalability is a solution. What breaks at what scale?)
- "Users want a better dashboard." (Aspirational, not grounded. What is wrong with the current one? What does "better" mean?)
- "We need to modernize our technology stack." (Technology is not a problem — what user-facing or business issue does the old stack cause?)

#### Problem Statement Checklist

- [ ] Names a specific user group (not "users" or "everyone")
- [ ] Describes an observable behavior or pain point (not a desired state)
- [ ] Includes quantitative evidence where available (time wasted, error rate, abandonment rate)
- [ ] Does not prescribe a solution (the problem is not "we need feature X")
- [ ] Can be validated — you can measure whether the problem is solved

### Target Users — Detailed Persona Methodology

#### Personas with Needs

Each persona should have:
- **Role or description** — Who they are in relation to the product.
- **Primary need** — What they need from this specific product. Not generic needs.
- **Current behavior** — How they currently solve the problem (or cope with it).
- **Constraints** — What limits their ability to adopt a solution (time, skill, budget, organizational rules).
- **Success looks like** — What would change for them if the problem were solved.

**Good persona:**
```
## Small Business Owner (Primary)
- Manages 1-3 employees
- Handles own bookkeeping alongside core business work
- Currently uses spreadsheets and manual data entry from 3 payment processor dashboards
- Has 30 minutes per day maximum for administrative tasks
- Non-technical — comfortable with consumer apps but not developer tools
- Success: invoice reconciliation takes < 30 minutes per week instead of 6 hours
```

**Bad persona:**
```
## User
- Wants to manage their business better
- Uses our product regularly
- Needs things to be fast and easy
```

The bad persona tells the implementation team nothing actionable. It does not constrain design decisions.

#### How Many Personas

Most products have 2-4 meaningful personas. If a PRD lists more than 6, the product scope is likely too broad. If it lists only 1, secondary users (admins, support staff, integration partners) may be missing.

#### Anti-pattern: The Everything User

A persona that represents all users is no persona at all. "Power users who want advanced features AND casual users who want simplicity" describes a contradiction, not a persona. Different personas may have conflicting needs — that is fine, but the PRD must state which takes priority.

### Feature Scoping — Depth

#### What Is In, What Is Out, What Is Deferred

Every PRD should have three explicit lists:

**In Scope (v1):** Features that will be built in this release. Each should be specific enough to estimate.

**Out of Scope:** Features that will NOT be built. Stating what is out is as important as stating what is in — it prevents scope creep during downstream phases.

**Deferred (future):** Features that are planned for later releases. This is different from "out of scope" — deferred items inform architecture decisions (design for extensibility) without committing to immediate implementation.

**Good scoping:**
```
## In Scope
- User registration with email/password
- Product catalog with category-based browsing
- Shopping cart with add/remove/update quantity
- Checkout with Stripe payment integration
- Order confirmation email
- Order history page

## Out of Scope
- Social login (Google, Apple, Facebook)
- Product reviews and ratings
- Wishlist functionality
- Gift cards and promo codes
- Multi-currency support

## Deferred (v2)
- Mobile native app (design API for mobile consumption)
- Marketplace for third-party sellers (design data model for future multi-tenancy)
- Advanced search with filters (use basic text search for v1)
```

**Bad scoping:**
```
## Features
- User management
- Product management
- Order management
- Payment processing
- Notifications
- Analytics
- Admin tools
```

This tells you nothing about boundaries. Is "user management" basic registration or full RBAC with teams and permissions? Is "analytics" a page view counter or a business intelligence suite?

#### MoSCoW Prioritization — In Depth

When the in-scope list is large, use MoSCoW to further prioritize:

- **Must Have** — Without these, the product does not solve the problem statement. Failure to deliver any Must Have means the release fails.
- **Should Have** — Important but not critical. The product works without them but is noticeably weaker.
- **Could Have** — Nice to have. Include if time permits.
- **Won't Have (this release)** — Same as deferred, but MoSCoW makes priority explicit.

**Example:**
```
Must Have:
- User registration and login
- Product catalog display
- Add to cart
- Checkout with payment
- Order confirmation

Should Have:
- Search by product name
- Order history
- Email notifications for order status changes

Could Have:
- Category filtering
- Recently viewed products
- Save payment method for future use

Won't Have:
- Product reviews
- Wishlist
- Social login
```

#### Feature Detail Level

Each in-scope feature needs enough detail to be estimable:

**Too vague:**
- "Product search" — Full-text? By name only? With filters? Auto-suggest? Fuzzy matching?

**Right level:**
- "Product search: Text search by product name and description. Results ranked by relevance. Paginated, 20 per page. No filters in v1. No auto-suggest in v1."

**Too detailed (belongs in specs, not PRD):**
- "Product search: Implement Elasticsearch with BM25 ranking, 3-gram tokenizer, custom analyzers for each locale, with Redis caching of top-1000 queries..."

The PRD says WHAT, not HOW.

### Success Criteria — Depth

#### Measurable Outcomes

Success criteria define how you will know the product works. They must be measurable, specific, and tied to the problem statement.

**Good success criteria:**
- "Invoice reconciliation time decreases from 6 hours/week to under 30 minutes/week for the median user."
- "Checkout abandonment rate decreases from 72% to under 40%."
- "Customer support tickets about order status decrease by 80%."
- "95% of new users complete onboarding without contacting support."

**Bad success criteria:**
- "Users are satisfied with the product." (Not measurable without defining how satisfaction is measured)
- "The system is performant." (Not specific — performant how?)
- "Revenue increases." (Not tied to the problem. Revenue can increase for many reasons.)
- "We ship on time." (Success criteria for the project, not the product)

#### Types of Success Criteria

1. **User behavior metrics** — Conversion rates, completion rates, time-on-task, error rates.
2. **Business metrics** — Revenue impact, cost reduction, customer acquisition.
3. **Technical metrics** — Uptime, latency, error rate (these are NFRs, but they can also be success criteria).
4. **Adoption metrics** — Sign-up rate, daily active users, feature usage.

Every success criterion should have a **target value** and a **measurement method**. "Checkout abandonment under 40% as measured by analytics funnel tracking" is complete. "Checkout abandonment decreases" is not.

### Constraints — Detailed Categories

#### Categories of Constraints

**Technical constraints:**
- Existing systems that must be integrated with.
- Technology mandates from the organization (e.g., must use AWS, must use TypeScript).
- Legacy data that must be migrated.
- API contracts that cannot be changed.

**Timeline constraints:**
- Hard deadlines (regulatory, contractual, event-driven).
- Soft deadlines (competitive pressure, business planning).
- Phase constraints (v1 by date X, v2 by date Y).

**Budget constraints:**
- Development budget (team size, contractor budget).
- Infrastructure budget (monthly cloud spend limits).
- Third-party service costs (payment processor fees, API call limits).

**Team constraints:**
- Team size and skill composition.
- Available work hours (full-time vs part-time contributors).
- Technology familiarity (learning curve for new tech).

**Regulatory constraints:**
- Data privacy (GDPR, CCPA, HIPAA).
- Financial regulations (PCI DSS, SOX).
- Accessibility mandates (ADA, WCAG requirements).
- Industry-specific regulations.

#### How Constraints Affect Downstream Artifacts

Each constraint should be traceable to architectural decisions:
- "Must use PostgreSQL" → ADR for database choice.
- "Must comply with GDPR" → Data model includes consent tracking, API includes data export/delete.
- "Team of 3 developers" → Implementation tasks sized for 3 parallel workers.
- "Launch by March 1" → Feature scope fits within timeline.

### NFR Quantification Patterns

#### Quantified NFRs

**Good:**
- "Page load time: p95 under 2 seconds on 4G mobile connection."
- "API response time: p95 under 200ms for read operations, p95 under 500ms for write operations."
- "Availability: 99.9% uptime measured monthly (43 minutes of downtime per month allowed)."
- "Concurrent users: Support 10,000 simultaneous authenticated sessions."
- "Data retention: Transaction records retained for 7 years per financial regulation."

**Bad:**
- "The system should be fast." (How fast? Under what conditions?)
- "High availability." (What percentage? How is it measured?)
- "Scalable." (To what? 100 users? 1 million users? What is the growth curve?)
- "Secure." (Against what threats? To what standard?)

#### NFR Categories Checklist

- [ ] **Performance** — Response times (p50, p95, p99), throughput, page load times
- [ ] **Scalability** — Concurrent users, data volume, growth rate
- [ ] **Availability** — Uptime target, maintenance windows, failover requirements
- [ ] **Security** — Authentication requirements, encryption, audit logging, compliance standards
- [ ] **Accessibility** — WCAG level, screen reader support, keyboard navigation
- [ ] **Data** — Retention periods, backup frequency, recovery point objective (RPO), recovery time objective (RTO)
- [ ] **Internationalization** — Languages, locales, character sets, date/number formats
- [ ] **Browser/device support** — Minimum browser versions, mobile support, responsive breakpoints
- [ ] **Monitoring** — What needs to be observable? Alerting thresholds?

### Competitive Context Analysis

#### What to Include

- **What exists** — Name competing products and what they do well.
- **How this is different** — Specific differentiators, not "we're better."
- **Why users would switch** — What pain does this product solve that competitors do not?
- **What to learn from** — Features or patterns from competitors worth adopting.

#### What NOT to Include

- Exhaustive competitor feature matrices (belongs in market research, not PRD).
- Competitive strategy or positioning (belongs in business plan, not PRD).
- Pricing comparisons (unless pricing is a product feature).

### Common PRD Failures

#### The "Requirements as Solutions" Failure
PRD prescribes technical solutions instead of stating requirements. "Use Redis for caching" belongs in architecture, not the PRD. The PRD should say "response time under 200ms" — how to achieve that is an architectural decision.

#### The "Missing Sad Path" Failure
PRD describes only happy paths. What happens when payment fails? When the user's session expires during checkout? When the network drops? When the form has invalid data? Every user action that can fail should have at least a sentence about what happens.

#### The "Everyone Is a User" Failure
PRD addresses "users" as a monolith instead of identifying distinct personas with distinct needs. Admins, end users, API consumers, and support staff have different requirements.

#### The "Implied API" Failure
PRD describes a UI but implies an API without stating it. "Users can view their order history" implies GET /orders, data model for orders, pagination, filtering, sorting. These implications should be explicit in the PRD.

#### The "No Boundaries" Failure
PRD states what is in scope but never states what is out. Every documentation phase becomes a scope negotiation.

#### The "Success Is Shipping" Failure
PRD has no success criteria beyond "launch the product." Without measurable outcomes, there is no way to know if the product solved the problem.

### PRD Quality Checklist

Before considering a PRD complete:

- [ ] Problem statement is specific and testable
- [ ] Target users are identified with personas
- [ ] Features are scoped with in/out/deferred lists
- [ ] Features are prioritized (MoSCoW or equivalent)
- [ ] Success criteria are measurable with target values
- [ ] Constraints are documented (technical, timeline, budget, team, regulatory)
- [ ] NFRs are quantified
- [ ] Error scenarios and edge cases are addressed (at least at high level)
- [ ] Competitive context is provided
- [ ] The PRD says WHAT, not HOW
- [ ] Every stakeholder group has been considered (end users, admins, support, integrators)

### Non-Functional Requirements — Specification and Quantification

Every NFR must have three components: a **measurable target**, a **measurement method**, and an **acceptable threshold**. Without all three, an NFR is aspirational, not actionable.

#### Performance

- **Response time**: Specify percentile targets — e.g., "API p95 < 200ms, p99 < 500ms for read operations; p95 < 500ms for writes"
- **Throughput**: Define sustained request rate — e.g., "System handles 500 requests/second under normal load"
- **Concurrent users**: State peak capacity — e.g., "10,000 simultaneous authenticated sessions without degradation"
- **Measurement**: Name the tool and method — "Measured via k6 load test against staging, run nightly in CI"

#### Security

- **Compliance standards**: Name the specific standards — OWASP Top 10, SOC2 Type II, PCI DSS Level 1, HIPAA
- **Authentication requirements**: Specify method and strength — "OAuth 2.0 + PKCE, session timeout 30 min, MFA for admin roles"
- **Data classification**: Label data tiers — "PII (encrypted at rest AES-256, in transit TLS 1.3), public (CDN-cacheable)"
- **Audit logging**: Define what is logged — "All auth events, all data mutations, all admin actions; retained 90 days"

#### Scalability

- **Growth targets**: Quantify the horizon — "Support 10x current load within 12 months without architecture changes"
- **Scaling strategy**: State horizontal vs vertical — "Stateless API servers behind load balancer; horizontal auto-scale at 70% CPU"
- **Data volume**: Project storage growth — "100GB Year 1, 1TB Year 3; archive records older than 2 years to cold storage"

#### Availability

- **Uptime SLA**: State the target and what it means — "99.9% monthly (43 min downtime/month allowed)"
- **RTO/RPO**: Recovery time objective and recovery point objective — "RTO: 15 min, RPO: 5 min (continuous replication)"
- **Graceful degradation**: Define fallback behavior — "If payment provider is down, queue orders and retry; show user 'processing' status"
- **Maintenance windows**: Specify schedule — "Zero-downtime deploys via rolling update; no scheduled maintenance windows"

#### Accessibility

- **WCAG level**: State the target — "WCAG 2.1 AA compliance for all public-facing pages"
- **Screen reader support**: Name tested readers — "VoiceOver (macOS/iOS), NVDA (Windows); tested quarterly"
- **Keyboard navigation**: Full keyboard operability for all interactive elements; visible focus indicators

#### The Three-Part Rule

Every NFR entry in the PRD must answer: *What is the target?* (p95 < 200ms), *How is it measured?* (k6 load test in CI), *What is acceptable?* (p95 between 200-300ms triggers warning; above 300ms blocks deploy). If any of the three is missing, the NFR is incomplete.

---

### gap-analysis

*Systematic approaches to finding gaps in requirements and specifications*

# Gap Analysis

## Summary

Gap analysis is the systematic process of finding what is missing from a set of requirements or specifications. A gap is anything that an implementing team would need to know but that the document does not tell them. Gaps are not errors (things stated incorrectly) — they are omissions (things not stated at all). The process uses section-by-section review, cross-reference checking, edge case enumeration, ambiguity detection, and contradiction detection to surface omissions before they become expensive implementation surprises.

## Deep Guidance

## Systematic Analysis Approaches

### Section-by-Section Review

Walk through the document section by section, asking structured questions at each:

**For each feature description:**
1. Who uses this feature? (Is the actor specified?)
2. What triggers this feature? (Is the entry point clear?)
3. What are the inputs? (Are all fields listed? With types and constraints?)
4. What is the happy path output? (Is the success response defined?)
5. What are the error outputs? (Is every failure mode addressed?)
6. What state changes? (What data is created, updated, or deleted?)
7. What are the preconditions? (What must be true before this feature can execute?)
8. What are the postconditions? (What is guaranteed to be true after execution?)
9. Are there rate limits, permissions, or visibility constraints?
10. Is this feature idempotent? (What happens if it runs twice?)

**For each data entity:**
1. What are all the fields? (Are any missing?)
2. What are the field types? (String, number, enum, date, etc.)
3. Which fields are required vs optional?
4. What are the valid ranges or patterns for each field?
5. What happens when a field is null vs absent vs empty?
6. How is this entity created? Updated? Deleted?
7. What relationships does it have with other entities?
8. What uniqueness constraints exist?

**For each user flow:**
1. What is the starting state?
2. What are all the steps?
3. At each step, what can go wrong?
4. At each step, can the user go back?
5. What happens if the user abandons the flow mid-way?
6. What happens if the user's session expires during the flow?
7. What does the user see while waiting for asynchronous operations?

### Cross-Reference Checking

Compare different sections of the same document (or different documents) for consistency and completeness:

1. **Feature list vs. detail sections** — Is every listed feature described in detail? Are there detail sections for unlisted features?
2. **Personas vs. features** — Does every persona have at least one feature that addresses their primary need? Does every feature map to a persona?
3. **NFRs vs. features** — Do performance requirements specify which features they apply to? Are there features without any NFR coverage?
4. **Constraints vs. features** — Do constraints affect feature design? Is the impact documented?
5. **Success criteria vs. features** — Can every success criterion be measured by at least one feature? Are there features that contribute to no success criterion?
6. **Error scenarios vs. features** — Does every feature with user input have error handling? Does every feature with external dependencies have failure handling?

### Edge Case Enumeration

Systematically explore the boundaries of each feature:

**Boundary conditions:**
- Minimum values (0, empty string, empty list, null)
- Maximum values (max integer, max string length, max file size)
- Just over/under limits (101 characters for a 100-char limit)
- Unicode edge cases (emoji, RTL text, zero-width characters)
- Time zone boundaries (DST transitions, UTC offset changes)
- Date boundaries (leap years, month boundaries, year boundaries)

**State boundaries:**
- First use (no data exists)
- Normal use (typical data volume)
- Heavy use (large data volumes, many records)
- Degraded state (partial data, corrupt data, missing references)
- Recovery state (after a crash, after a failed migration, after restoring from backup)

**Concurrency boundaries:**
- Two users editing the same record
- Two users claiming the same resource
- Rapid successive submissions (double-click)
- Long-running operations interrupted by newer operations
- Race conditions between create and delete

**Network boundaries:**
- Slow connection (high latency)
- Intermittent connection (requests that time out mid-way)
- Offline mode (if applicable)
- Partial response (connection drops mid-transfer)

## Ambiguity Detection

An ambiguity is a statement that could reasonably be interpreted in more than one way. Ambiguities are gaps because the implementing team must guess which interpretation is correct.

### Types of Ambiguity

**Lexical ambiguity** — A word has multiple meanings.
- "The system should store the user's records." (Medical records? Usage records? Database records?)
- "Notify the admin when a user is blocked." (Email notification? In-app notification? Both?)

**Structural ambiguity** — The sentence structure allows multiple readings.
- "Users can view reports shared by team members and partners." (Reports shared by [team members and partners]? Or [reports shared by team members] and [partners]?)
- "The system sends email when the order is completed or cancelled and the user has opted in." (Opted in to what — both notifications or just cancellation?)

**Scope ambiguity** — The boundary of a requirement is unclear.
- "Support all modern browsers." (Which ones? What version threshold?)
- "The search should return relevant results." (What defines relevant? Ranked how?)

**Referential ambiguity** — Pronouns or references are unclear.
- "When the admin approves the user's request, they receive a notification." (Who receives — the admin or the user?)

### Detection Technique

For each requirement statement:
1. Read it once and form an interpretation.
2. Deliberately try to form a DIFFERENT valid interpretation.
3. If you can, the statement is ambiguous.
4. Rewrite the statement to be unambiguous, or flag it as needing clarification.

**Example:**
- Original: "The system should validate user input."
- Interpretation 1: Client-side validation only (JavaScript form validation)
- Interpretation 2: Server-side validation only (API-level validation)
- Interpretation 3: Both client-side and server-side validation
- Finding: Ambiguous. Specify where validation occurs.
- Rewrite: "The system validates user input on both the client (inline feedback during form entry) and the server (API returns 422 with field-level error messages)."

### Ambiguity Severity Levels

- **Critical** — Ambiguity about core functionality. Different interpretations lead to fundamentally different implementations.
- **Major** — Ambiguity about behavior details. Different interpretations lead to different user experiences.
- **Minor** — Ambiguity about edge cases or formatting. Different interpretations are cosmetically different.

## Edge Case Discovery

### Error Scenarios

For each operation, systematically enumerate error scenarios:

**Input errors:**
- Missing required fields
- Fields with wrong types
- Fields with values outside valid ranges
- Fields with malicious content (SQL injection, XSS)
- Duplicate submissions

**State errors:**
- Operating on a deleted entity
- Operating on an entity in an unexpected state
- Stale data (entity was modified since last read)

**Permission errors:**
- Unauthenticated access
- Authenticated but unauthorized access
- Access to another user's data
- Elevated privilege operations by non-admin users

**External dependency errors:**
- Payment processor unavailable
- Email service unavailable
- Third-party API returns unexpected response
- Third-party API rate limit exceeded
- DNS resolution failure

**Resource errors:**
- Database connection pool exhausted
- Disk full
- Memory exhausted
- File size exceeds limit

### Boundary Conditions

For each quantitative constraint, test the boundaries:

```
Constraint: Username must be 3-30 characters
Test cases:
- 0 characters (empty) → error
- 1 character → error
- 2 characters → error
- 3 characters → success (minimum boundary)
- 15 characters → success (normal)
- 30 characters → success (maximum boundary)
- 31 characters → error
- 1000 characters → error (ensure no buffer overflow)
```

### Concurrent Access

For each shared resource:
1. What happens when two users read simultaneously? (Usually fine)
2. What happens when two users write simultaneously? (Last write wins? Merge? Reject?)
3. What happens when one user reads while another writes? (Stale data? Locked? Consistent?)
4. What happens when two users try to claim the same unique resource? (First wins? Queue? Error?)

## NFR Gap Patterns

### Performance Gaps

- Response time specified for reads but not writes
- Average response time specified but not percentiles (p50 can be 100ms while p99 is 10 seconds)
- Page load time specified but not API response time
- No specification for batch operations (import 10,000 records — how long is acceptable?)
- No specification for search response time (full-text search is often slower than CRUD)

### Security Gaps

- Authentication mechanism specified but not session management (timeout, rotation, revocation)
- Authorization model specified but not data isolation (can user A see user B's data?)
- Encryption at rest mentioned but not encryption in transit (or vice versa)
- Password policy not specified (minimum length, complexity, rotation)
- No mention of rate limiting or brute force protection
- No mention of audit logging (who did what when)

### Accessibility Gaps

- WCAG level stated but not specific compliance areas (keyboard navigation, screen reader support, color contrast)
- No mention of focus management for dynamic content (modals, notifications, form errors)
- No mention of alt text requirements for images
- No mention of motion reduction for users who prefer reduced motion

### Scalability Gaps

- Current scale specified but not growth projections
- User count specified but not data volume (10,000 users with 1 record each is different from 10,000 users with 1 million records each)
- No specification for what degrades gracefully under load (versus what must maintain full quality)

## Contradiction Detection

Contradictions are requirements that cannot both be true simultaneously.

### Detection Technique

1. Group requirements by topic (authentication, data handling, UI behavior, etc.).
2. Within each group, compare every pair of requirements.
3. Ask: "Can these both be true at the same time?"

### Common Contradiction Patterns

**Real-time vs. batch:**
- "Display real-time inventory counts" AND "Update inventory via nightly batch job"
- These contradict unless there is a mechanism to handle the 24-hour stale window.

**Simple vs. comprehensive:**
- "The interface should be simple and uncluttered" AND "Display all order details on one page"
- Simplicity and completeness often conflict. Which takes priority?

**Flexible vs. consistent:**
- "Allow users to customize their workflow" AND "Ensure all users follow the standard process"
- Customization and standardization conflict. What is the scope of customization?

**Fast vs. thorough:**
- "API responses under 100ms" AND "Validate against all business rules on every request"
- Complex validation may make 100ms impossible. Which gives?

### Resolution

For each contradiction, the PRD should clarify:
1. Which requirement takes priority?
2. Under what conditions does each apply?
3. Is there a design that satisfies both, and what are the trade-offs?

## Output Format

### Gap Report Structure

```markdown
## Gap Analysis Report

### Summary
- Total gaps found: [N]
- Critical: [N] (blocks implementation)
- Major: [N] (impacts quality)
- Minor: [N] (cosmetic or edge case)

### Critical Gaps
1. [Gap description]
   - **Location:** [Section/feature]
   - **Impact:** [What happens if not resolved]
   - **Recommended resolution:** [What to add or clarify]

### Major Gaps
...

### Minor Gaps
...

### Ambiguities
1. [Statement as written]
   - **Possible interpretations:** [list]
   - **Recommended clarification:** [suggested rewrite]

### Contradictions
1. [Requirement A] vs [Requirement B]
   - **Analysis:** [why they conflict]
   - **Recommended resolution:** [which takes priority and why]

```

## When to Use Gap Analysis

- **After PRD creation** — Find gaps before domain modeling begins. Cheapest time to fix.
- **After each documentation phase** — Incremental gap analysis as specifications become more detailed.
- **After requirements change** — Any PRD modification should trigger gap analysis of affected features.
- **Before implementation** — Final gap analysis of the complete specification set.

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

### Consensus Classification

When synthesizing multi-model findings, classify each finding:
- **Consensus**: All participating models flagged the same issue at similar severity → report at the agreed severity
- **Majority**: 2+ models agree, 1 dissents → report at the lower of the agreeing severities; note the dissent
- **Divergent**: Models disagree on severity or one model found an issue others missed → present to user for decision, minimum P2 severity
- **Unique**: Only one model raised the finding → include with attribution, flag as "single-model finding" for user review

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

## After This Step

Continue with: `/scaffold:innovate-prd`, `/scaffold:user-stories`
