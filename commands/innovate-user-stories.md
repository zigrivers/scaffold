---
description: "Discover UX-level enhancements and innovation opportunities in user stories"
long-description: "Identifies UX enhancement opportunities — progressive disclosure, smart defaults, accessibility improvements — and integrates approved changes into existing stories."
---

## Purpose
Discover UX-level enhancements and innovation opportunities within the existing
user stories. This is NOT feature-level innovation (that belongs in PRD
innovation — `innovate-prd`) — it focuses on making existing features better
through smart defaults,
progressive disclosure, accessibility improvements, and AI-native capabilities.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent UX innovation brainstorming — different models surface different
enhancement opportunities.

## Inputs
- docs/user-stories.md (required) — stories to enhance
- docs/plan.md (required) — PRD boundaries (innovation must not exceed scope)

## Expected Outputs
- docs/user-stories-innovation.md — innovation findings, suggestions with
  cost/impact assessment, and disposition (accepted/rejected/deferred)
- docs/user-stories.md — updated with approved enhancements
- docs/reviews/user-stories-innovation/review-summary.md (depth 4+) — multi-model innovation synthesis
- docs/reviews/user-stories-innovation/codex-review.json (depth 4+, if available) — raw Codex suggestions
- docs/reviews/user-stories-innovation/gemini-review.json (depth 4+, if available) — raw Gemini suggestions

## Quality Criteria
- (mvp) Enhancements are UX-level, not new features
- (mvp) Each suggestion has a cost estimate (trivial/moderate/significant)
- (mvp) Each suggestion has a clear user benefit
- (mvp) Approved enhancements are integrated into existing stories (not new stories)
- (mvp) PRD scope boundaries are respected — no scope creep
- (mvp) User approval for each accepted innovation documented as a question-response pair with timestamp (e.g., "Q: Accept enhancement X? A: Yes — 2025-01-15T14:30Z")
- (mvp) Each innovation marked with approval status: approved, deferred, or rejected, with user decision timestamp
- (depth 4+) Multi-model innovation suggestions synthesized: Consensus (all models propose similar direction), Majority (2+ models agree), or Divergent (models disagree — present all perspectives to user for selection)

## Methodology Scaling
- **deep**: Full innovation pass across all three categories (high-value
  low-effort, differentiators, defensive gaps). Cost/impact matrix.
  Detailed integration of approved enhancements into stories. Multi-model
  innovation dispatched to Codex and Gemini if available, with graceful
  fallback to Claude-only enhanced brainstorming.
- **mvp**: Not applicable — this step is conditional and skipped in MVP.
- **custom:depth(1-5)**:
  - Depth 1: Skip — not enough context for meaningful innovation at this depth.
  - Depth 2: Minimal — generate 1–2 brief innovation concepts for the most distinctive user story only; no full Given/When/Then elaboration required.
  - Depth 3: Quick scan for obvious UX improvements and low-hanging enhancements.
  - Depth 4: Full innovation pass across all three categories + one external model (if CLI available).
  - Depth 5: Full innovation pass + multi-model with deduplication and synthesis.

## Conditional Evaluation
Enable when: user stories review identifies UX gaps, project targets a consumer-facing
audience, or progressive disclosure patterns would benefit users. Skip when: stories
are backend-only with no user-facing UI, depth < 3, or user explicitly declines
innovation.

## Mode Detection
If docs/user-stories-innovation.md exists, this is a re-innovation pass. Read
previous suggestions and their disposition (accepted/rejected), focus on new
opportunities from story changes since last run. If multi-model artifacts
exist under docs/reviews/user-stories-innovation/, preserve prior suggestion
dispositions.

## Update Mode Specifics
- **Detect prior artifact**: docs/user-stories-innovation.md exists with
  suggestion dispositions
- **Preserve**: accepted/rejected dispositions from prior runs, cost/impact
  assessments already reviewed, multi-model review artifacts
- **Triggers for update**: user stories changed (new stories added, existing
  stories rewritten), PRD innovation accepted new features that need UX
  enhancement analysis
- **Conflict resolution**: if a previously rejected UX enhancement is now
  relevant due to story changes, re-propose with updated rationale; never
  re-suggest rejected enhancements without a material change in context

---

## Domain Knowledge

### user-stories

*Expert knowledge for translating product requirements into well-formed user stories*

# User Stories

Expert knowledge for translating product requirements into well-formed user stories with acceptance criteria, epic structure, and traceability.

## Summary

### Story Anatomy

**"As a [persona], I want [action], so that [outcome]."**

- **Persona** — the specific user role from the PRD, not "a user"
- **Action** — what the user wants to do, in their language
- **Outcome** — the value they get (the most important part)

Deviations: **System stories** for background processes ("When a payment fails, the system retries twice...") and **Constraint stories** for NFRs ("All API responses within 500ms at p95").

### INVEST Criteria

- **Independent** — can be developed without requiring another story first
- **Negotiable** — describes what/why, not how
- **Valuable** — delivers value to a user or stakeholder
- **Estimable** — specific enough to estimate effort
- **Small** — implementable in 1-3 focused agent sessions
- **Testable** — acceptance criteria have clear pass/fail outcomes

### Acceptance Criteria Format

Use Given/When/Then for scenarios:
```
Given [precondition/context]
When [action/trigger]
Then [expected outcome]
```

Include parameterized scenarios for role variations, negative scenarios for every happy path, and boundary conditions at edges.

**AC vs. Test Cases**: ACs define WHAT should happen (business-level). Test cases define HOW to verify (technical-level, derived during implementation).

## Deep Guidance

### Story Anatomy — Extended

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

### INVEST Criteria — Deep Dive

#### Independent

The story can be developed and delivered without requiring another story to be done first. Stories with hard dependencies should be split or reordered.

- **Pass:** "As a user, I want to search products by name" — works regardless of whether filtering or sorting stories are done.
- **Fail:** "As a user, I want to edit my profile photo" that silently depends on "As a user, I want to upload files" — if upload isn't done, this story is blocked.
- **Fix:** Make the dependency explicit and consider whether the stories should be combined or the shared functionality extracted.

#### Negotiable

The story describes what and why, not how. Implementation details are negotiated during development, not locked in the story.

- **Pass:** "As a user, I want to receive notifications about order status changes."
- **Fail:** "As a user, I want to receive WebSocket push notifications rendered as toast components in the bottom-right corner using the Sonner library."
- **Fix:** Move implementation details to technical notes. The story stays focused on user value.

#### Valuable

The story delivers value to a user or stakeholder. Every story should have a clear beneficiary.

- **Pass:** "As a shopper, I want to save items for later, so that I can return and purchase them without searching again."
- **Fail:** "As a developer, I want to refactor the authentication module." — No user value. This is a technical task, not a story.
- **Fix:** Frame technical work in terms of user value, or track it as a task rather than a story.

#### Estimable

The team (or agent) can estimate the effort. If a story is too vague to estimate, it needs more conversation or splitting.

- **Pass:** "As a user, I want to reset my password via email" — well-understood pattern, estimable.
- **Fail:** "As a user, I want AI-powered recommendations" — too vague. What data? What algorithm? What UI?
- **Fix:** Split into smaller, more specific stories until each is estimable.

#### Small

A story should be implementable in 1-3 focused agent sessions. Larger stories need splitting.

- **Pass:** "As a user, I want to update my display name."
- **Fail:** "As a user, I want a complete e-commerce checkout flow with cart, address, payment, confirmation, and order tracking."
- **Fix:** Split by workflow step: cart management, address entry, payment processing, order confirmation, order tracking.

#### Testable

Acceptance criteria have clear pass/fail outcomes. If you can't write a test for it, the story isn't ready.

- **Pass:** "Given a user with items in cart, when they click checkout, then they see the address form with their saved addresses pre-populated."
- **Fail:** "The checkout should be intuitive." — Not testable.
- **Fix:** Replace subjective language with observable behavior.

### Persona Definition

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

### Epic Structure

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

### Acceptance Criteria Patterns — Extended

#### Given/When/Then Format

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

#### Parameterized Scenarios

When the same behavior applies to multiple variations, use parameterized scenarios:

```
Given a user with role [admin | member | viewer]
When they access the settings page
Then they see [all settings | team settings only | read-only view]
```

#### Negative Scenarios

Every happy path should have corresponding error scenarios:

```
Given a registered user on the login page
When they enter an incorrect password
Then they see "Invalid credentials" and the password field is cleared
And after 5 failed attempts, the account is locked for 15 minutes
```

#### Boundary Conditions

Test edges, not just middles:

```
Given a user creating a project name
When they enter exactly 100 characters (the maximum)
Then the name is accepted
When they enter 101 characters
Then they see "Name must be 100 characters or fewer" and the extra character is rejected
```

#### Acceptance Criteria vs. Test Cases

- **Acceptance criteria** define WHAT should happen (business-level behavior)
- **Test cases** define HOW to verify it (technical-level steps)
- Stories contain acceptance criteria. Test cases are derived later during implementation.

### Story Splitting Heuristics

When a story is too large, use these patterns to split it into smaller, independently valuable stories.

#### By Workflow Step

Before: "As a user, I want to complete the checkout process."
After:
- "As a shopper, I want to review my cart before checkout."
- "As a shopper, I want to enter my shipping address."
- "As a shopper, I want to select a payment method and pay."
- "As a shopper, I want to see an order confirmation."

#### By Data Variation

Before: "As a user, I want to create posts."
After:
- "As a user, I want to create text posts."
- "As a user, I want to create posts with images."
- "As a user, I want to create posts with embedded videos."

#### By Operation (CRUD)

Before: "As an admin, I want to manage users."
After:
- "As an admin, I want to invite new users."
- "As an admin, I want to view the user list with search and filters."
- "As an admin, I want to edit user roles."
- "As an admin, I want to deactivate user accounts."

#### By User Role

Before: "As a user, I want to access the dashboard."
After:
- "As a team member, I want to see my assigned tasks on the dashboard."
- "As a team lead, I want to see team progress metrics on the dashboard."
- "As an admin, I want to see system health and usage stats on the dashboard."

#### By Happy/Sad Path

Before: "As a user, I want to upload a document."
After:
- "As a user, I want to upload a PDF or Word document."
- "As a user, I want to see clear error messages when upload fails (wrong format, too large, network error)."

### Scope Boundaries

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

### PRD-to-Story Traceability

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

### Story Dependencies

Some stories must be implemented before others. Document these explicitly.

**Blocked-by vs. informed-by:**
- **Blocked-by:** Story B cannot start until Story A is complete. A produces something B requires (a database table, an API endpoint, a shared component).
- **Informed-by:** Story B benefits from knowing how Story A was implemented, but can proceed independently with reasonable assumptions.

Only blocked-by dependencies should be formal constraints. Informed-by relationships are noted but don't block.

**How dependencies feed into task decomposition:**
- Story dependencies become task dependencies in the implementation tasks step
- Chains of 3+ dependent stories should be reviewed — long chains limit parallelization
- If many stories depend on the same story, that story is on the critical path and should be prioritized

**Keeping dependency chains short:**
- If Story C depends on B which depends on A, ask: can C depend directly on A instead? Can C's dependency be satisfied with a mock or interface?
- Extract shared infrastructure into its own story at the front of the chain rather than letting it hide inside a feature story

### Common Pitfalls

#### Implementation Stories
- **Problem:** "As a developer, I want a REST endpoint for user CRUD."
- **Fix:** Rewrite from the user's perspective: "As a new visitor, I want to create an account with my email." The REST endpoint is an implementation detail, not a user story.

#### Stories Too Large
- **Problem:** A story with 10+ acceptance criteria spanning multiple workflows.
- **Fix:** Split using the heuristics above. Each resulting story should have 3-5 acceptance criteria.

#### Vague Acceptance Criteria
- **Problem:** "The feature works correctly and is user-friendly."
- **Fix:** Replace with Given/When/Then scenarios. Define "correctly" and "user-friendly" in observable terms.

#### Missing Personas
- **Problem:** Stories reference undefined personas ("a power user," "the operator").
- **Fix:** Map back to PRD personas. If the PRD doesn't define this persona, either add it to the PRD or use an existing persona.

#### Stories Without Value Statements
- **Problem:** "As a user, I want to click the submit button."
- **Fix:** Add the "so that" clause: "As a user, I want to submit my feedback form, so that the support team can address my issue."

#### Duplicate Stories Across Epics
- **Problem:** "Upload profile photo" appears in both "Account Setup" and "Profile Management" epics.
- **Fix:** Choose one epic. Add a scope boundary in the other epic referencing the canonical story.

#### Confusing Acceptance Criteria with Implementation Steps
- **Problem:** "1. Create a POST /api/users endpoint. 2. Validate email format with regex. 3. Hash password with bcrypt."
- **Fix:** These are implementation steps, not acceptance criteria. Rewrite as: "Given a valid email and password, when the user submits registration, then their account is created and they receive a confirmation email."

---

### user-story-innovation

*Techniques for discovering UX enhancements and innovation opportunities in user stories*

# User Story Innovation

## Summary

- **Scope**: UX-level improvements to existing features only (smart defaults, error handling, accessibility, progressive disclosure, AI-native enhancements). Feature-level innovation belongs in PRD innovation.
- **High-value low-effort patterns**: Smart defaults, inline validation, keyboard shortcuts, progressive disclosure, leveraging existing data, undo/redo, and batch operations.
- **Differentiators**: "Wow" moments, AI-native features (natural language search, auto-categorization, smart suggestions), and personalization without configuration.
- **Defensive gaps**: Accessibility (WCAG AA minimum), mobile responsiveness, offline/degraded mode, performance under load, error recovery, and empty states.
- **Evaluation framework**: Assess cost (trivial/moderate/significant) and impact (nice-to-have/noticeable/differentiator). Must-have for v1 = high impact + trivial or moderate cost.
- **Integration**: Approved innovations become additional acceptance criteria, new stories, or modified story scope. All must be traceable to PRD requirements.

## Deep Guidance

## Scope Boundary

This knowledge covers UX-level improvements only — making existing features better, not adding new features. Feature-level innovation belongs in PRD innovation (`innovate-prd`). If an enhancement requires a new PRD section, it is out of scope for user story innovation.

**In scope:**
- Smart defaults that reduce user effort on existing features
- Better error handling and recovery within existing flows
- Accessibility improvements to existing stories
- Progressive disclosure within existing interfaces
- AI-native enhancements to existing workflows

**Out of scope:**
- New features not covered by any PRD requirement
- New user personas not defined in the PRD
- Major architectural additions (new services, new databases)
- Scope expansion that changes the product's purpose

---

## High-Value Low-Effort Enhancements

These patterns add significant user value for minimal implementation effort. Look for them in every story.

### Smart Defaults
Pre-fill fields based on context, history, or the most common choice. Users should only need to change what's different, not re-enter what's predictable.
- Forms pre-populated from user profile or previous submissions
- Timezone auto-detected from browser
- Default selections based on user's most frequent choice
- "Same as billing address" for shipping

### Inline Validation
Give immediate feedback on input rather than waiting for form submission. Catches errors early and reduces frustration.
- Email format validation as you type
- Password strength indicator
- Username availability check before submission
- Character count approaching limit

### Keyboard Shortcuts
Power users want to move fast. Keyboard shortcuts for frequent actions reduce friction.
- Common patterns: Ctrl/Cmd+S (save), Ctrl/Cmd+K (search), Escape (close/cancel)
- Arrow keys for list navigation
- Tab through form fields with logical ordering

### Progressive Disclosure
Don't overwhelm users on first encounter. Reveal complexity as they need it.
- "Advanced options" expandable sections
- Onboarding wizards that introduce features over time
- Contextual help that appears when users hover or focus
- Default simple view with "show more" for detail

### Leveraging Existing Data
Data already being collected that could power useful features without new infrastructure.
- Activity data → streak tracking, usage insights, "you did X this week" summaries
- Search history → suggested searches, "recently viewed"
- Error patterns → proactive warnings ("this field usually causes issues — here's a tip")

### Undo/Redo
Where destructive actions exist, add undo before requiring confirmation dialogs.
- Soft delete with "undo" toast (better UX than "are you sure?" dialogs)
- Undo last edit in text/content editing
- "Restore defaults" for settings changes

### Batch Operations
Where users repeat the same single action multiple times, offer batch alternatives.
- Select multiple items → bulk delete, bulk archive, bulk assign
- "Apply to all" option in settings
- Bulk import/export for data entry

---

## Differentiators

These make the product stand out from alternatives. Not every product needs them, but they're worth considering.

### "Wow" Moments
Small touches that make users want to share the product.
- Satisfying animations on task completion
- Personalized empty states that don't feel like error pages
- Easter eggs for power users who discover hidden features
- Thoughtful microcopy that shows personality

### AI-Native Features
Capabilities that wouldn't exist without AI, not AI bolted onto traditional features.
- Natural language search that understands intent, not just keywords
- Auto-categorization of user-created content
- Smart suggestions based on context ("users who did X often do Y next")
- Draft generation or auto-completion for text-heavy inputs

### Personalization Without Configuration
The product adapts to the user without them having to set preferences.
- Recently used items surfaced first
- Layout adapts to usage patterns
- Notification frequency auto-tuned based on engagement
- Content ordering reflects individual priorities

---

## Defensive Gaps

Things users expect but specs often miss. These are especially important for v1 launches.

### Accessibility
- WCAG AA compliance as minimum baseline
- Keyboard navigation for all interactive elements
- Screen reader compatibility with proper ARIA labels
- Sufficient color contrast (4.5:1 for normal text, 3:1 for large text)
- Focus indicators visible in all themes

### Mobile Responsiveness (if web)
- Touch targets minimum 44x44px
- Readable text without zooming
- Forms that work with mobile keyboards
- Navigation patterns that work with one hand

### Offline/Degraded Mode
- What happens when the network drops mid-action?
- Queue writes for sync when connection returns
- Show stale data with "last updated" indicator rather than blank screens
- Graceful error messages that explain what happened and what to do

### Performance Under Load
- Loading states for every async operation (never leave users staring at nothing)
- Pagination or virtual scrolling for large lists
- Image lazy loading and appropriate sizing
- Optimistic UI updates where safe

### Error Recovery
- Never lose user work — auto-save drafts, preserve form state on error
- Clear error messages that say what happened AND what to do next
- Retry logic for transient failures with user feedback
- Graceful degradation when a non-critical feature fails

### Empty States
- First-time experience should guide, not confuse
- Empty lists show "here's how to add your first X" rather than blank space
- Zero-data dashboards show sample data or onboarding steps
- Search with no results suggests alternatives

---

## Evaluation Framework

For each innovation suggestion, evaluate before proposing to the user.

### Cost Assessment
- **Trivial** (< 1 task): Can be added to an existing story's acceptance criteria. No new stories needed.
- **Moderate** (1-3 tasks): Requires new stories or significant additions to existing stories. Scoped to a single epic.
- **Significant** (4+ tasks): Requires multiple new stories, possibly a new epic. May affect architecture.

### Impact Assessment
- **Nice-to-have**: Polishes the experience but users wouldn't notice if absent.
- **Noticeable improvement**: Users would appreciate it. Reduces friction in common workflows.
- **Significant differentiator**: Sets the product apart. Users would choose this product partly because of this feature.

### Decision Framework
- **Must-have for v1**: High impact + trivial or moderate cost. Not adding it would be a visible gap.
- **Backlog for later**: High impact + significant cost, or moderate impact at any cost. Valuable but not blocking launch.
- **Reject**: Low impact regardless of cost, or out of scope for the PRD.

### Presenting to the User
Group related suggestions for efficient decision-making. For each group:
1. Describe the enhancement and its user benefit
2. State the cost (trivial/moderate/significant)
3. State your recommendation (must-have/backlog/reject)
4. Wait for approval before integrating into stories

### Example Innovation Finding

When documenting an innovation suggestion, use a structured format that makes the enhancement, its cost, and its impact immediately clear:

```markdown
## Innovation Finding: Smart Defaults for Checkout Address

**Category:** High-Value Low-Effort Enhancement — Smart Defaults
**Applies to:** Story 4.2 "As a returning customer, I want to enter my shipping address"

**Current behavior:** User must re-enter full shipping address on every order, even
if it has not changed since their last purchase.

**Proposed enhancement:** Pre-fill shipping address from the user's most recent order.
Show a "Same as last order" toggle that auto-populates all address fields. User can
still edit any field after pre-fill.

**User benefit:** Reduces a 6-field manual entry to a single click for repeat customers,
which account for 65% of orders per the PRD's user research.

**Cost:** Trivial — requires reading the most recent order's address (data already exists)
and pre-populating form fields. No new API endpoints, no new database tables.

**Impact:** Noticeable improvement — reduces checkout friction for the majority of users.
Directly supports the PRD success metric "reduce checkout abandonment from 72% to 45%."

**Recommendation:** Must-have for v1. High impact, trivial cost, directly tied to a
success metric.

**Acceptance criteria addition:**
- Given a returning customer with a previous order,
  when they reach the shipping address step,
  then all address fields are pre-filled with their most recent shipping address
- Given a new customer with no previous orders,
  when they reach the shipping address step,
  then all address fields are empty (current behavior)
```

---

## Integration With User Stories

When approved innovations are integrated into the story set, they modify stories in one of three ways:

**Adding acceptance criteria** — The most common integration for trivial-cost enhancements. The innovation becomes additional acceptance criteria on an existing story.

**Adding a new story** — For moderate-cost enhancements that warrant their own story. The new story should reference the innovation finding and include a clear "why" tying it back to the PRD.

**Modifying an existing story's scope** — For enhancements that change how a feature works rather than adding to it. The original story's description and acceptance criteria are updated to reflect the enhanced behavior.

### Traceability

Every innovation that gets integrated must be traceable:
- The innovation finding should reference the PRD requirement it enhances
- The modified or new story should reference the innovation finding
- The innovation decision (must-have/backlog/reject) should be recorded for audit

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
