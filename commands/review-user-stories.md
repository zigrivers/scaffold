---
description: "Multi-pass review of user stories for PRD coverage, quality, and downstream readiness"
long-description: "Verifies every PRD feature maps to at least one story, checks that acceptance criteria are specific enough to test, validates story independence, and builds a requirements traceability index at higher depths."
---

## Purpose
Deep multi-pass review of user stories, targeting failure modes specific to
story artifacts. Identify coverage gaps, quality issues, and downstream
readiness problems. Create a fix plan, execute fixes, and re-validate.

At higher depths, builds a formal requirements index with traceability matrix
and optionally dispatches to external AI models (Codex, Gemini) for
independent coverage validation.

## Inputs
- docs/user-stories.md (required) — stories to review
- docs/plan.md (required) — source requirements for coverage checking
- docs/reviews/user-stories/ artifacts (optional) — prior review findings in update mode

## Expected Outputs
- docs/reviews/pre-review-user-stories.md — review findings, fix plan, and resolution log
- docs/user-stories.md — updated with fixes
- docs/reviews/user-stories/requirements-index.md (depth 4+) — atomic requirements
  extracted from PRD with REQ-xxx IDs
- docs/reviews/user-stories/coverage.json (depth 4+) — requirement-to-story mapping
- docs/reviews/user-stories/review-summary.md (depth 5) — multi-model review
  synthesis with coverage verification

## Quality Criteria
- (mvp) Pass 1 (PRD coverage) executed with findings documented
- (deep) All review passes executed with findings documented
- (mvp) Every finding categorized by severity: P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.
- (mvp) Fix plan created for P0 and P1 findings
- (mvp) Fixes applied and re-validated
- (mvp) Every story has at least one testable acceptance criterion, and every PRD feature maps to at least one story
- (depth 4+) Every atomic PRD requirement has a REQ-xxx ID in the requirements index
- (depth 4+) Coverage matrix maps every REQ to at least one US (100% coverage target)
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: All 6 review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated. Requirements
  index and coverage matrix built. Multi-model review dispatched to Codex and
  Gemini if available, with graceful fallback to Claude-only enhanced review.
- **mvp**: Pass 1 only (PRD coverage). Focus on blocking gaps — PRD features
  with no corresponding story.
- **custom:depth(1-5)**:
  - Depth 1: Pass 1 only (PRD coverage). One review pass.
  - Depth 2: Passes 1-2 (PRD coverage, acceptance criteria quality). Two review passes.
  - Depth 3: Passes 1-4 (add story independence, INVEST criteria). Four review passes.
  - Depth 4: All 6 passes + requirements index + coverage matrix + one external model (if CLI available).
  - Depth 5: All of depth 4 + multi-model review with reconciliation (if CLIs available).

## Mode Detection
If docs/reviews/pre-review-user-stories.md exists, this is a re-review. Read
previous findings, check which were addressed, run review passes again on
updated stories. If docs/reviews/user-stories/requirements-index.md exists,
preserve requirement IDs — never renumber REQ-xxx IDs.

## Update Mode Specifics

- **Detect**: `docs/reviews/pre-review-user-stories.md` exists with tracking comment
- **Preserve**: Prior findings still valid, REQ-xxx IDs, resolution decisions, multi-model review artifacts
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

### review-user-stories

*Failure modes and review passes specific to user story artifacts*

# Review: User Stories

User stories translate PRD requirements into user-facing behavior with testable acceptance criteria. Each story must be traceable back to the PRD, specific enough to implement, and consumable by downstream phases (domain modeling, UX specification, task decomposition). This review uses 6 passes targeting the specific ways user story artifacts fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — PRD Coverage**: Every PRD feature, flow, and requirement has at least one corresponding user story; no silent coverage gaps.
- **Pass 2 — Acceptance Criteria Quality**: Every story has testable, unambiguous Given/When/Then criteria covering happy path and at least one error/edge case.
- **Pass 3 — Story Independence**: Stories can be implemented independently; dependencies are explicit, not hidden; no circular dependencies.
- **Pass 4 — Persona Coverage**: Every PRD-defined persona has stories; every story maps to a valid, defined persona.
- **Pass 5 — Sizing & Splittability**: No story too large for 1-3 agent sessions or too small to be meaningful; oversized stories have clear split points.
- **Pass 6 — Downstream Readiness**: Domain entities, events, aggregate boundaries, and business rules are discoverable from acceptance criteria for domain modeling.

## Deep Guidance

---

## Pass 1: PRD Coverage

### What to Check

Every PRD feature, flow, and requirement has at least one corresponding user story. No PRD requirement is left without a story to implement it.

### Why This Matters

Missing stories mean missing implementation tasks downstream. A PRD feature with no story will not appear in the implementation tasks, will not be implemented, and will be discovered only during validation or user testing. Coverage gaps are the highest-severity story failure because they propagate silently through the entire pipeline.

### How to Check

1. Extract every distinct feature and requirement from the PRD (including implicit requirements like error handling, validation, accessibility)
2. For each requirement, find the corresponding user story or stories
3. Check that every PRD user persona has at least one story
4. Check that every PRD user journey/flow has stories covering the complete path (not just the happy path)
5. Flag any PRD requirement with no matching story
6. Flag compound PRD requirements that should have been split into multiple stories

### What a Finding Looks Like

- P0: "PRD Section 4.2 describes a 'Team Invitation' feature with 3 user flows (invite by email, invite by link, bulk invite). No user stories exist for any of these flows."
- P1: "PRD describes both SSO and email/password authentication. Stories exist for email/password only — SSO has no coverage."
- P2: "PRD mentions 'accessibility compliance' as a requirement. No stories have accessibility-specific acceptance criteria."

---

## Pass 2: Acceptance Criteria Quality

### What to Check

Every story has testable, unambiguous acceptance criteria. Criteria should be specific enough that two different agents implementing the same story would produce functionally equivalent results.

### Why This Matters

Vague acceptance criteria produce vague tasks and untestable implementations. An agent reading "the feature should work correctly" has no way to know when it's done. Clear Given/When/Then criteria become test cases during implementation, ensuring the story is verifiably complete.

### How to Check

1. For each story, check that acceptance criteria exist (not blank or placeholder)
2. Check that criteria use Given/When/Then format (at depth ≥ 3) or are otherwise structured and testable
3. Check that criteria are specific — no subjective language ("intuitive," "fast," "user-friendly")
4. Check that criteria cover the primary success path AND at least one error/edge case
5. Check that criteria include boundary conditions where applicable (max lengths, empty states, concurrent access)
6. Verify each criterion has a clear pass/fail condition — could an agent write an automated test for it?

### What a Finding Looks Like

- P0: "US-005 has no acceptance criteria at all. Cannot verify when this story is complete."
- P1: "US-012 acceptance criteria says 'works correctly and is user-friendly' — not testable. Needs Given/When/Then scenarios."
- P1: "US-018 covers only the happy path. No criteria for: invalid input, network failure, duplicate submission, session timeout."
- P2: "US-031 criteria mention 'fast response time' without defining what fast means. Add a specific threshold (e.g., < 500ms at p95)."

---

## Pass 3: Story Independence

### What to Check

Stories can be implemented independently without hidden coupling. Dependencies between stories are explicit, not assumed.

### Why This Matters

Coupled stories create false parallelization opportunities. If two stories secretly share state or assume a specific implementation order, assigning them to parallel agents causes conflicts, rework, or subtle bugs. Explicit dependencies flow into task decomposition; hidden dependencies create surprises during implementation.

### How to Check

1. For each story, check if its acceptance criteria reference behavior defined in another story
2. Check for shared state assumptions — two stories that both read or write the same data entity without acknowledging the overlap
3. Check for implicit ordering — Story B's acceptance criteria assume Story A's output exists, but no dependency is documented
4. Check for circular dependencies — Story A depends on B, and B depends on A
5. Verify that documented dependencies are necessary (not just thematic grouping)

### What a Finding Looks Like

- P1: "US-008 (edit user profile) and US-009 (upload profile photo) both modify user profile state. Neither acknowledges the other. If implemented in parallel, they may conflict on the profile data model."
- P1: "US-015 acceptance criteria says 'Given the user has completed onboarding' — this implicitly requires US-014 (onboarding flow) to be complete, but no dependency is documented."
- P2: "US-025 and US-026 are listed as independent but share a 'notification preferences' data structure. Consider documenting the shared dependency."

---

## Pass 4: Persona Coverage

### What to Check

Every PRD-defined persona has stories representing their goals and workflows. Every story maps to a valid, defined persona.

### Why This Matters

Missing persona coverage means entire user segments have no stories, no tasks, and no implementation. Stories referencing undefined personas create confusion — agents don't know who they're building for, and acceptance criteria lack context.

### How to Check

1. List all personas defined in the PRD
2. For each persona, count the stories attributed to them
3. Flag personas with zero stories
4. Flag stories that reference a persona not defined in the PRD
5. Check that high-priority personas (primary users) have proportionally more stories than secondary personas
6. Verify that each persona's PRD-defined goals are addressed by their stories

### What a Finding Looks Like

- P1: "PRD defines 4 personas: Student, Teacher, Admin, Parent. The 'Parent' persona has zero stories — their entire journey (viewing student progress, receiving notifications) is unaddressed."
- P2: "US-020 is written as 'As a power user, I want...' but 'power user' is not a defined persona. Should this be 'Admin' or 'Teacher'?"
- P2: "The 'Admin' persona has 2 stories, but the PRD describes 6 admin-specific features. 4 features have no admin story."

---

## Pass 5: Sizing & Splittability

### What to Check

No story is too large for a single agent session (1-3 focused sessions). No story is so small it adds unnecessary overhead. Stories that are too large should have obvious split points.

### Why This Matters

Oversized stories produce oversized tasks that exceed an agent's context window or session length. The agent either produces incomplete work or loses context partway through. Undersized stories create coordination overhead — each story needs its own review, testing, and integration cycle.

### How to Check

1. Count acceptance criteria per story — more than 8 suggests the story is too large
2. Check if a story spans multiple workflows or user journeys — each journey should be its own story
3. Check if a story covers multiple data variations that could be split (e.g., "create any type of post" → text, image, video)
4. Check if a story handles both happy path and all error cases in one — consider splitting error handling into its own story
5. Flag stories with only 1 trivial acceptance criterion — consider combining with a related story
6. For oversized stories, identify the split heuristic that applies (workflow step, data variation, CRUD operation, user role, happy/sad path)

### What a Finding Looks Like

- P1: "US-003 has 12 acceptance criteria spanning 3 distinct workflows (create, edit, and archive projects). Split by operation into 3 stories."
- P1: "US-017 covers the entire checkout flow (cart review, address, payment, confirmation) in one story. Split by workflow step."
- P2: "US-022 ('update display name') and US-023 ('update email address') are trivially small and share the same profile editing context. Consider combining into 'edit profile fields.'"

---

## Pass 6: Downstream Readiness

### What to Check

The domain modeling step can consume these stories productively. Entities, events, and aggregate boundaries should be discoverable from story acceptance criteria without guesswork.

### Why This Matters

Stories are the primary input to domain discovery in the domain modeling step. If acceptance criteria are written at too high a level (no mention of data entities, no state transitions, no business rules), domain modeling has to infer the domain model from vague descriptions. This produces weaker domain models and increases the chance of misalignment between stories and architecture.

### How to Check

1. Sample 3-5 representative stories from different epics
2. For each, attempt to identify: entities (nouns), domain events (state changes), and aggregate boundaries (transactional consistency requirements) from the acceptance criteria alone
3. Check that the same entity is named consistently across stories (not "User" in one story and "Account" in another and "Member" in a third)
4. Check that state transitions are explicit in the acceptance criteria — "when X happens, the order status changes from pending to confirmed" rather than "the order is processed"
5. Check that business rules (invariants) appear in acceptance criteria — "a class cannot have more than 30 students" is discoverable; "class size is managed" is not

### What a Finding Looks Like

- P1: "US-007 ('As a teacher, I want to manage my classes') — acceptance criteria say 'classes are managed correctly.' No mention of what entities are involved (Class, Enrollment, Student?), what state transitions occur, or what business rules apply. Domain modeling will have to guess."
- P2: "Cross-story entity naming is inconsistent: US-003 uses 'User,' US-008 uses 'Account,' US-015 uses 'Member.' These may be different bounded context terms or may be accidental inconsistency — clarify before domain modeling."
- P2: "Stories in the 'Payments' epic mention 'processing a payment' but no acceptance criteria describe the payment lifecycle states (pending → processing → completed/failed). Domain events cannot be discovered from these stories."

---

## Common Review Anti-Patterns

### 1. Reviewing Against a Generic Checklist Instead of the PRD

The reviewer checks whether stories have acceptance criteria and follow INVEST principles, but never opens the PRD to verify coverage. The stories could be missing entire PRD features and this review would not catch it. Reviews must cross-reference the PRD — checking story quality without checking story completeness misses the highest-severity failure mode.

**How to spot it:** The review report contains no references to specific PRD sections. Findings are all about story quality (vague criteria, poor sizing) and none about story coverage (missing features, missing flows).

### 2. Accepting Vague Acceptance Criteria as "Good Enough"

The reviewer sees acceptance criteria like "user can manage their profile" and does not flag it because the intent is clear. But intent is not implementation guidance. Two agents reading "manage their profile" will implement different field sets, different validation rules, and different UX flows. Acceptance criteria must be testable — if you cannot write an automated test directly from the criterion, it is too vague.

**Example finding:**

```markdown
## Finding: USR-014

**Priority:** P1
**Pass:** Acceptance Criteria Quality (Pass 2)
**Document:** docs/user-stories.md, US-008

**Issue:** Acceptance criteria for US-008 ("As a user, I want to manage my profile"):
  - "Given I am logged in, when I update my profile, then my changes are saved"

This criterion does not specify: which fields are editable, what validation rules apply,
whether partial updates are supported, what happens on validation failure, or whether
changes require re-authentication (e.g., email change).

**Recommendation:** Replace with specific Given/When/Then scenarios:
  - Given I am logged in, when I change my display name to a valid name (1-100 chars), then my display name is updated
  - Given I am logged in, when I change my email, then a verification email is sent to the new address and the email is not changed until verified
  - Given I am logged in, when I submit a display name longer than 100 characters, then I see a validation error
```

### 3. Ignoring Story Dependencies

The reviewer checks each story in isolation but never maps dependencies between stories. Stories that secretly depend on each other are not flagged. This creates false parallelization opportunities downstream — the implementation tasks phase will mark these as parallel, and agents will produce conflicting work.

**How to spot it:** The review report has no findings from Pass 3 (Story Independence). Dependencies are only discovered later during implementation tasks or during actual implementation.

### 4. Persona Name Drift Without Flagging

The PRD defines personas as "Teacher," "Student," and "Admin." Stories reference "Instructor," "Learner," and "Administrator." The reviewer does not flag the terminology mismatch because the mapping is obvious to a human. But downstream, the domain model and implementation tasks may use either set of terms inconsistently, creating confusion.

**How to spot it:** Compare persona names in the PRD with persona names in story "As a..." statements. Any mismatch is a finding, even if the intent is obvious.

### 5. Reviewing Only Happy-Path Stories

The reviewer verifies that the main user flows have stories but does not check for error handling, edge cases, or administrative workflows. Stories exist for "user creates an account" and "user places an order" but not for "user enters invalid payment info," "user tries to order an out-of-stock item," or "admin resolves a disputed transaction." These missing stories become missing tasks and missing implementations.

**How to spot it:** Count the ratio of happy-path stories to error/edge-case stories. If the ratio is heavily skewed (e.g., 20 happy-path stories and 2 error stories), error handling is systematically under-specified.

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

Continue with: `/scaffold:domain-modeling`, `/scaffold:innovate-user-stories`, `/scaffold:story-tests`
