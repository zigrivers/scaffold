---
description: "Create a product requirements document from a project idea"
long-description: "Translates your vision (or idea, if no vision exists) into a product requirements document with problem statement, user personas, prioritized feature list, constraints, non-functional requirements, and measurable success criteria."
---

## Purpose
Transform a project idea into a structured product requirements document that
defines the problem, target users, features, constraints, and success criteria.
This is the foundation document that all subsequent phases reference.
The PRD drives user stories, architecture decisions, and implementation planning
throughout the entire pipeline.

## Inputs
- Project idea (provided by user verbally or in a brief)
- Existing project files (if brownfield — any README, docs, or code)

## Expected Outputs
- docs/plan.md — Product requirements document

## Quality Criteria
- (mvp) Problem statement names a specific user group, a specific pain point, and a falsifiable hypothesis about the solution
- (mvp) Target users are identified with their needs
- (mvp) Features are scoped with clear boundaries (what's in, what's out)
- (mvp) Success criteria are measurable
- (mvp) Each non-functional requirement has a measurable target or threshold (e.g., 'page load < 2s', 'WCAG AA')
- (mvp) No two sections contain contradictory statements about the same concept
- (deep) Constraints (technical, timeline, budget, team) are documented

## Methodology Scaling
- **deep**: Comprehensive PRD. Competitive analysis, detailed user personas,
  feature prioritization matrix (MoSCoW or similar), risk assessment, phased
  delivery plan. 15-20 pages.
- **mvp**: Problem statement, core features list, primary user description,
  success criteria. 1-2 pages. Just enough to start building.
- **custom:depth(1-5)**:
  - Depth 1: MVP-style — problem statement, core features list, primary user. 1 page.
  - Depth 2: MVP + success criteria and basic constraints. 1-2 pages.
  - Depth 3: Add user personas and feature prioritization (MoSCoW). 3-5 pages.
  - Depth 4: Add competitive analysis, risk assessment, and phased delivery plan. 8-12 pages.
  - Depth 5: Full PRD with competitive analysis, phased delivery, and detailed non-functional requirements. 15-20 pages.

## Mode Detection
If docs/plan.md exists, operate in update mode: read existing content, identify
what has changed or been learned since it was written, propose targeted updates.
Preserve existing decisions unless explicitly revisiting them.

## Update Mode Specifics
- **Detect prior artifact**: docs/plan.md exists
- **Preserve**: problem statement, existing feature definitions, success criteria,
  user personas, scope boundaries, and enhancement markers (`<!-- enhancement: ... -->`)
  unless user explicitly requests changes
- **Triggers for update**: user provides new requirements, scope adjustment
  requested, constraints changed (timeline, budget, team), new user research
- **Conflict resolution**: new features are appended to the feature list with
  clear versioning; changed constraints are documented with rationale for change

### Understand the Vision

**If `docs/vision.md` exists**: Read it completely. This is your strategic foundation — the vision document has already established the problem space, target audience, value proposition, competitive landscape, and guiding principles. Skip the vision discovery questions below and use the vision document as the North Star for this PRD. Reference it throughout, ensuring every requirement aligns with the stated vision and guiding principles. Focus your discovery questions on translating the vision into concrete product requirements rather than re-exploring strategic direction.

**If `docs/vision.md` does NOT exist**:
- What problem does this solve and for whom? Push me to be specific about the target user.
- What does success look like? How will we know this is working?
- What's the single most important thing this app must do well?

---

## Domain Knowledge

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

## After This Step

Continue with: `/scaffold:review-prd`
