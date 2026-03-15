---
name: user-stories
description: Expert knowledge for translating product requirements into well-formed user stories
topics: [user-stories, personas, acceptance-criteria, story-splitting, INVEST, epics, traceability]
---

## Story Anatomy

The standard user story template captures who wants what and why:

**"As a [persona], I want [action], so that [outcome]."**

Each part serves a purpose:
- **Persona** — the specific user role, not "a user." Personas come from the PRD.
- **Action** — what the user wants to do, described in their language, not implementation terms.
- **Outcome** — the value they get. This is the most important part — it answers "why bother?"

**Good stories:**
- "As a teacher, I want to assign homework to a class, so that students have practice material outside of class."
- "As a new user, I want to see a guided tour on first login, so that I understand the core features without reading documentation."

**Bad stories:**
- "As a user, I want the system to work." — No specific persona, no specific action, no testable outcome.
- "As a developer, I want a REST endpoint for user creation." — Implementation story. The developer is not the user. Rewrite as: "As a new visitor, I want to create an account, so that I can save my preferences."
- "As a user, I want good performance." — Not actionable. Rewrite with specifics: "As a returning user, I want the dashboard to load within 2 seconds, so that I can start my daily workflow immediately."

**When to deviate from the template:**
- **System stories** describe behavior with no direct user action: "When a payment fails, the system retries twice with exponential backoff and notifies the user after final failure." These are acceptable for background processes, scheduled jobs, and automated workflows.
- **Constraint stories** capture non-functional requirements: "All API responses must complete within 500ms at p95 under normal load." These complement functional stories rather than replacing them.

---

## INVEST Criteria

Every story should satisfy INVEST. Use these criteria to evaluate story quality.

### Independent

The story can be developed and delivered without requiring another story to be done first. Stories with hard dependencies should be split or reordered.

- **Pass:** "As a user, I want to search products by name" — works regardless of whether filtering or sorting stories are done.
- **Fail:** "As a user, I want to edit my profile photo" that silently depends on "As a user, I want to upload files" — if upload isn't done, this story is blocked.
- **Fix:** Make the dependency explicit and consider whether the stories should be combined or the shared functionality extracted.

### Negotiable

The story describes what and why, not how. Implementation details are negotiated during development, not locked in the story.

- **Pass:** "As a user, I want to receive notifications about order status changes."
- **Fail:** "As a user, I want to receive WebSocket push notifications rendered as toast components in the bottom-right corner using the Sonner library."
- **Fix:** Move implementation details to technical notes. The story stays focused on user value.

### Valuable

The story delivers value to a user or stakeholder. Every story should have a clear beneficiary.

- **Pass:** "As a shopper, I want to save items for later, so that I can return and purchase them without searching again."
- **Fail:** "As a developer, I want to refactor the authentication module." — No user value. This is a technical task, not a story.
- **Fix:** Frame technical work in terms of user value, or track it as a task rather than a story.

### Estimable

The team (or agent) can estimate the effort. If a story is too vague to estimate, it needs more conversation or splitting.

- **Pass:** "As a user, I want to reset my password via email" — well-understood pattern, estimable.
- **Fail:** "As a user, I want AI-powered recommendations" — too vague. What data? What algorithm? What UI?
- **Fix:** Split into smaller, more specific stories until each is estimable.

### Small

A story should be implementable in 1-3 focused agent sessions. Larger stories need splitting.

- **Pass:** "As a user, I want to update my display name."
- **Fail:** "As a user, I want a complete e-commerce checkout flow with cart, address, payment, confirmation, and order tracking."
- **Fix:** Split by workflow step: cart management, address entry, payment processing, order confirmation, order tracking.

### Testable

Acceptance criteria have clear pass/fail outcomes. If you can't write a test for it, the story isn't ready.

- **Pass:** "Given a user with items in cart, when they click checkout, then they see the address form with their saved addresses pre-populated."
- **Fail:** "The checkout should be intuitive." — Not testable.
- **Fix:** Replace subjective language with observable behavior.

---

## Persona Definition

Personas are extracted from the PRD's user/stakeholder descriptions. Each persona is a specific user type with distinct goals, not a generic role label.

**Goal-driven personas vs. role labels:**
- Role label: "Admin" — too generic. What does the admin want?
- Goal-driven: "School Administrator (Ms. Chen) — manages teacher accounts, reviews class assignments, generates progress reports for the district. Goals: minimize time on administrative tasks, ensure compliance with district reporting requirements."

**When personas collapse:**
- If two personas have identical goals and workflows, they're the same persona. An "Admin" who is also a regular "User" is two personas only if their goals differ when wearing each hat.
- Don't create personas for system actors (database, scheduler, API consumer) — these are system stories, not persona stories.

**Persona template:**
- **Name** — a human name for memorability (e.g., "Alex the Admin")
- **Role** — their relationship to the product
- **Goals** — what they're trying to accomplish (2-3 primary goals)
- **Pain points** — what frustrates them today (informs acceptance criteria)
- **Context** — when, where, how they use the product (informs UX decisions)

---

## Epic Structure

Epics group related stories by user journey, not by system component.

**Group by journey, not by layer:**
- **Good:** "Account Setup" epic (registration, email verification, profile creation, preferences) — follows the user's path.
- **Bad:** "API Endpoints" epic (user CRUD, product CRUD, order CRUD) — groups by technical layer, not user value.

**Epic sizing:**
- A typical epic contains 3-8 stories. Fewer than 3 suggests the epic is too narrow — consider merging with a related epic. More than 8 suggests the epic covers too much — look for natural split points.

**When to split epics:**
- Different personas drive different parts of the epic
- The epic spans distinct phases of the user journey (onboarding vs. daily use vs. administration)
- Half the stories have no dependencies on the other half

**Epic naming:**
- Use verb phrases that describe the user goal: "Managing Team Members," "Processing Payments," "Onboarding New Users."
- Avoid technical names: "REST API," "Database Layer," "Auth Module."

---

## Acceptance Criteria Patterns

Acceptance criteria define when a story is done. They are the contract between story and implementation.

### Given/When/Then Format

The standard format for acceptance criteria scenarios:

```
Given [precondition/context]
When [action/trigger]
Then [expected outcome]
```

**Example:**
```
Given a registered user on the login page
When they enter valid credentials and click "Sign In"
Then they are redirected to the dashboard and see a welcome message with their name
```

### Parameterized Scenarios

When the same behavior applies to multiple variations, use parameterized scenarios:

```
Given a user with role [admin | member | viewer]
When they access the settings page
Then they see [all settings | team settings only | read-only view]
```

### Negative Scenarios

Every happy path should have corresponding error scenarios:

```
Given a registered user on the login page
When they enter an incorrect password
Then they see "Invalid credentials" and the password field is cleared
And after 5 failed attempts, the account is locked for 15 minutes
```

### Boundary Conditions

Test edges, not just middles:

```
Given a user creating a project name
When they enter exactly 100 characters (the maximum)
Then the name is accepted
When they enter 101 characters
Then they see "Name must be 100 characters or fewer" and the extra character is rejected
```

### Acceptance Criteria vs. Test Cases

- **Acceptance criteria** define WHAT should happen (business-level behavior)
- **Test cases** define HOW to verify it (technical-level steps)
- Stories contain acceptance criteria. Test cases are derived later during implementation.

---

## Story Splitting Heuristics

When a story is too large, use these patterns to split it into smaller, independently valuable stories.

### By Workflow Step

Before: "As a user, I want to complete the checkout process."
After:
- "As a shopper, I want to review my cart before checkout."
- "As a shopper, I want to enter my shipping address."
- "As a shopper, I want to select a payment method and pay."
- "As a shopper, I want to see an order confirmation."

### By Data Variation

Before: "As a user, I want to create posts."
After:
- "As a user, I want to create text posts."
- "As a user, I want to create posts with images."
- "As a user, I want to create posts with embedded videos."

### By Operation (CRUD)

Before: "As an admin, I want to manage users."
After:
- "As an admin, I want to invite new users."
- "As an admin, I want to view the user list with search and filters."
- "As an admin, I want to edit user roles."
- "As an admin, I want to deactivate user accounts."

### By User Role

Before: "As a user, I want to access the dashboard."
After:
- "As a team member, I want to see my assigned tasks on the dashboard."
- "As a team lead, I want to see team progress metrics on the dashboard."
- "As an admin, I want to see system health and usage stats on the dashboard."

### By Happy/Sad Path

Before: "As a user, I want to upload a document."
After:
- "As a user, I want to upload a PDF or Word document."
- "As a user, I want to see clear error messages when upload fails (wrong format, too large, network error)."

---

## Scope Boundaries

Every story should explicitly state what it does NOT include to prevent scope creep.

**Format:**
```
**Scope Boundary:** This story does NOT include:
- Bulk assignment (covered by US-045)
- Email notifications for assignments (covered by US-023)
- Grading submitted assignments (separate epic)
```

**Why scope boundaries matter:**
- During implementation, agents can confidently stop when they hit a boundary
- Stories that overlap are discovered early (and consolidated or clarified)
- Scope boundaries flow downstream into task boundaries

**Relationship to MoSCoW:**
- "Won't" items in MoSCoW are scope boundaries at the PRD level
- Story-level scope boundaries are more granular — they clarify what THIS story excludes even if another story covers it

---

## PRD-to-Story Traceability

Every PRD feature must map to at least one user story. This is a non-negotiable coverage requirement.

**How to ensure coverage:**
1. Extract every distinct feature and requirement from the PRD
2. For each, identify the corresponding user story or stories
3. Flag any PRD feature with no story — these are coverage gaps
4. Flag any story that doesn't trace back to a PRD feature — these may be scope creep

**Handling compound requirements:**
- PRD: "Users can create, edit, and delete projects." → Split into 3 stories (one per operation).
- PRD: "The system supports SSO and email/password authentication." → Two stories (one per auth method).

**Surfacing implicit requirements:**
- Every user action that can fail needs an error handling story or acceptance criteria
- Every data entry point needs validation acceptance criteria
- Accessibility requirements (keyboard navigation, screen readers) apply to all UI stories
- Loading states, empty states, and offline behavior are often implied but not stated

**Traceability notation:**
- Use IDs to create a traceable chain: PRD-REQ-001 → US-001 → (downstream: Task BD-42)
- Story IDs (US-001, US-002, ...) are stable — they persist through updates and are referenced by downstream phases

---

## Story Dependencies

Some stories must be implemented before others. Document these explicitly.

**Blocked-by vs. informed-by:**
- **Blocked-by:** Story B cannot start until Story A is complete. A produces something B requires (a database table, an API endpoint, a shared component).
- **Informed-by:** Story B benefits from knowing how Story A was implemented, but can proceed independently with reasonable assumptions.

Only blocked-by dependencies should be formal constraints. Informed-by relationships are noted but don't block.

**How dependencies feed into task decomposition:**
- Story dependencies become task dependencies in Phase 7
- Chains of 3+ dependent stories should be reviewed — long chains limit parallelization
- If many stories depend on the same story, that story is on the critical path and should be prioritized

**Keeping dependency chains short:**
- If Story C depends on B which depends on A, ask: can C depend directly on A instead? Can C's dependency be satisfied with a mock or interface?
- Extract shared infrastructure into its own story at the front of the chain rather than letting it hide inside a feature story

---

## Common Pitfalls

### Implementation Stories
- **Problem:** "As a developer, I want a REST endpoint for user CRUD."
- **Fix:** Rewrite from the user's perspective: "As a new visitor, I want to create an account with my email." The REST endpoint is an implementation detail, not a user story.

### Stories Too Large
- **Problem:** A story with 10+ acceptance criteria spanning multiple workflows.
- **Fix:** Split using the heuristics above. Each resulting story should have 3-5 acceptance criteria.

### Vague Acceptance Criteria
- **Problem:** "The feature works correctly and is user-friendly."
- **Fix:** Replace with Given/When/Then scenarios. Define "correctly" and "user-friendly" in observable terms.

### Missing Personas
- **Problem:** Stories reference undefined personas ("a power user," "the operator").
- **Fix:** Map back to PRD personas. If the PRD doesn't define this persona, either add it to the PRD or use an existing persona.

### Stories Without Value Statements
- **Problem:** "As a user, I want to click the submit button."
- **Fix:** Add the "so that" clause: "As a user, I want to submit my feedback form, so that the support team can address my issue."

### Duplicate Stories Across Epics
- **Problem:** "Upload profile photo" appears in both "Account Setup" and "Profile Management" epics.
- **Fix:** Choose one epic. Add a scope boundary in the other epic referencing the canonical story.

### Confusing Acceptance Criteria with Implementation Steps
- **Problem:** "1. Create a POST /api/users endpoint. 2. Validate email format with regex. 3. Hash password with bcrypt."
- **Fix:** These are implementation steps, not acceptance criteria. Rewrite as: "Given a valid email and password, when the user submits registration, then their account is created and they receive a confirmation email."
