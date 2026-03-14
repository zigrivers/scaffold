---
name: critical-path-analysis
description: Tracing critical user journeys end-to-end across all specifications
topics: [validation, critical-path, user-journeys, end-to-end, gaps]
---

# Critical Path Analysis

Critical path analysis walks through the most important user journeys end-to-end across every specification artifact. For each journey, it verifies that every component, endpoint, query, screen, and task needed to make the journey work actually exists and is consistent.

## What a Critical Path Is

A critical path is a user journey that represents core functionality — the features that, if broken, would make the product unusable or fail its primary value proposition. These are not edge cases. They are the main flows that most users will execute most of the time.

## Identifying Critical Journeys

### Sources for Critical Journeys

1. **PRD success criteria** — Any measurable outcome in the PRD implies a user journey. "Users can complete checkout in under 3 clicks" implies a checkout journey.
2. **PRD user stories** — Primary user stories describe the most important journeys.
3. **PRD personas** — Each persona's primary need implies a journey. A "buyer" persona implies a purchasing journey.
4. **Architecture data flows** — Major data flows in the architecture document represent the system-level view of critical paths.
5. **Revenue/value paths** — Journeys that directly relate to the product's revenue model or primary value proposition.

### Prioritizing Which Journeys to Trace

Not every user journey needs end-to-end tracing. Prioritize:

1. **Happy path of core features** — The primary flow that delivers the product's main value. For an e-commerce app: browse → add to cart → checkout → payment → confirmation.
2. **Authentication flows** — Sign up, sign in, password reset. Nearly every product has these and they touch many components.
3. **Primary CRUD operations** — The main data creation and retrieval flows. For a project management tool: create project → add tasks → assign → update status → complete.
4. **Cross-cutting journeys** — Flows that cross multiple bounded contexts or services. These are where integration gaps hide.
5. **Error-recovery journeys** — What happens when payment fails? When a network request times out? When a form has validation errors?

A typical project should trace 5-10 critical journeys. More than 15 usually means the scope is too broad or the granularity is too fine.

## How to Trace a Journey

### Step 1: Define the Journey

Write a one-sentence description of the journey and list its steps from the user's perspective:

```
Journey: User registers and completes first purchase
1. User visits landing page
2. User clicks "Sign Up"
3. User fills registration form (email, password)
4. User receives verification email
5. User clicks verification link
6. User browses product catalog
7. User views product detail
8. User adds item to cart
9. User views cart
10. User initiates checkout
11. User enters shipping address
12. User enters payment information
13. User confirms order
14. User sees order confirmation
15. User receives confirmation email
```

### Step 2: Map Each Step to Specifications

For each step, identify the concrete artifacts that support it:

| Step | UX Component | API Endpoint | Architecture Component | Database Query | Task ID |
|------|-------------|-------------|----------------------|----------------|---------|
| 1. Visit landing | LandingPage | GET /products/featured | ProductService | SELECT featured products | T-040 |
| 2. Click Sign Up | SignUpForm | — | — | — | T-013 |
| 3. Fill registration | SignUpForm | POST /auth/register | AuthService | INSERT INTO users | T-012 |
| 4. Verification email | — | — | EmailService | INSERT INTO verification_tokens | T-016 |
| 5. Click verify link | VerifyPage | POST /auth/verify | AuthService | UPDATE users SET verified | T-017 |
| ... | ... | ... | ... | ... | ... |

### Step 3: Check Each Mapping

For each cell in the table, verify:

1. **Existence** — Does the referenced artifact actually exist in the specifications? Is there actually a `POST /auth/register` endpoint in the API contracts? Is there actually a `SignUpForm` component in the UX spec?

2. **Completeness** — Does the artifact cover what this step needs? Does the `POST /auth/register` endpoint accept `email` and `password`? Does it return a response that the `SignUpForm` component can use?

3. **Connectivity** — Does the output of step N connect to the input of step N+1? If step 3 returns `{user, token}`, does step 6 (browse catalog) know how to use that token for authenticated requests?

4. **Error handling** — What happens if this step fails? Is the failure mode documented? Is there a recovery path? If `POST /auth/register` returns 409 (email exists), does the UX spec define what the user sees?

### Step 4: Identify Gaps

Gaps take several forms:

**Missing component** — A step requires a component that does not exist in any specification. Example: "User receives verification email" requires an email-sending service, but no such service is in the architecture.

**Missing endpoint** — A step requires an API endpoint that is not in the contracts. Example: "User views cart" requires a `GET /cart` endpoint, but only `POST /cart/items` is defined.

**Missing query** — A step requires a database query pattern, but no index supports it. Example: "User browses by category" requires a category-based product listing, but the products table has no category index.

**Missing screen** — A step requires a UI screen or component that is not in the UX spec. Example: "User enters shipping address" requires an address form, but the UX spec jumps from cart to payment.

**Missing task** — A step requires implementation work that has no task in the task breakdown.

**Broken connection** — The output of one step does not connect to the input of the next. Example: The registration endpoint returns a session cookie, but the product catalog endpoint expects a Bearer token.

**Missing error path** — A step can fail, but there is no specification for what happens on failure.

## Journey Tracing Template

Use this template for each critical journey:

```markdown
## Journey: [Name]

**Description:** [One sentence]
**PRD Source:** [Section reference]
**Priority:** Critical | High | Medium

### Steps

#### Step 1: [User action]
- **UX:** [Component/screen] — [status: found/missing/incomplete]
- **API:** [Endpoint] — [status]
- **Architecture:** [Component] — [status]
- **Data:** [Query/mutation] — [status]
- **Task:** [Task ID] — [status]
- **Error path:** [What happens on failure] — [status]
- **Connection to next:** [How output feeds step 2] — [status]

#### Step 2: [User action]
...

### Gaps Found
1. [Gap description, severity, recommendation]
2. ...

### Journey Assessment
- [ ] All steps have UX components
- [ ] All steps have API endpoints (where applicable)
- [ ] All steps have architecture components
- [ ] All steps have data support (where applicable)
- [ ] All steps have implementation tasks
- [ ] All step-to-step connections verified
- [ ] All error paths documented
- [ ] End-to-end data shape consistency verified
```

## Common Gap Patterns

### 1. The "Handoff Gap"

Where one bounded context ends and another begins, there is often no specification for how data moves between them. The order service creates an order, but how does the fulfillment service learn about it? Is there an event? A synchronous call? A shared database?

**How to find it:** Look for steps where the "Architecture Component" column changes. Each change is a boundary crossing that needs an integration mechanism.

### 2. The "State Transition Gap"

A user journey involves entity state changes (order: created → paid → shipped → delivered), but the specifications do not fully document all transitions, especially error transitions (paid → refunded, shipped → returned).

**How to find it:** For each entity that changes state during the journey, extract the state machine and verify every transition has API support and UX feedback.

### 3. The "Async Gap"

Steps that involve asynchronous processing (sending email, processing payment, generating report) often lack specification for: how long the user waits, what they see while waiting, how they are notified of completion, and what happens if the async process fails.

**How to find it:** Flag every step where the API response does not contain the final result (e.g., 202 Accepted, polling endpoints, WebSocket notifications).

### 4. The "First-Time User Gap"

Many journeys are specified assuming the user already has data (an account, items in cart, previous orders). The first-time user journey — where the system has no data for this user — often reveals missing empty states, onboarding flows, and default configurations.

**How to find it:** Trace the journey assuming zero prior state. Does the product catalog work with zero products? Does the dashboard work with zero data points?

### 5. The "Permission Gap"

Some steps require specific permissions (admin actions, premium features), but the specifications do not define how the user acquires those permissions or what happens when they lack them.

**How to find it:** For each step, ask "who is allowed to do this?" and verify that the auth model in the API contracts supports the answer.

## Output Format

### Summary Table

```markdown
| Journey | Steps | Gaps Found | Critical Gaps | Assessment |
|---------|-------|-----------|---------------|------------|
| User registration + first purchase | 15 | 4 | 1 (email service missing) | Needs work |
| Returning user purchase | 8 | 1 | 0 | Mostly complete |
| Admin manages products | 12 | 3 | 2 (admin auth, bulk operations) | Needs work |
| User manages account | 6 | 0 | 0 | Complete |
```

### Detailed Findings

Each gap should be reported with:
- Which journey and step it affects
- What is missing or inconsistent
- What the impact would be if not fixed (agent would be unable to implement, or would implement incorrectly)
- Recommended fix (which artifact to update, what to add)

## When to Run Critical Path Analysis

- After all pipeline phases (1-10) are complete.
- Before implementation task breakdown is finalized (gaps found here may require new tasks).
- When PRD changes significantly (new features may introduce new critical journeys).
- As a final check before freezing docs in the finalization phase.
