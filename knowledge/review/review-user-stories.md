---
name: review-user-stories
description: Failure modes and review passes specific to user story artifacts
topics: [review, user-stories, coverage, acceptance-criteria, INVEST, testability]
---

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
