---
name: prd-craft
description: What makes a good PRD — problem framing, feature scoping, success criteria, competitive context
topics: [prd, requirements, product, scoping]
---

# PRD Craft

A Product Requirements Document is the single source of truth for what is being built and why. It defines the problem, the users, the scope, and the success criteria. Everything in the pipeline flows from the PRD — domain models, architecture, implementation tasks. A weak PRD propagates weakness through every downstream artifact.

This document covers what makes a good PRD, what makes a bad one, and how to tell the difference.

## Problem Statement

The problem statement is the foundation. If it is wrong, everything built on top of it is wrong.

### What Makes a Good Problem Statement

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

### Problem Statement Checklist

- [ ] Names a specific user group (not "users" or "everyone")
- [ ] Describes an observable behavior or pain point (not a desired state)
- [ ] Includes quantitative evidence where available (time wasted, error rate, abandonment rate)
- [ ] Does not prescribe a solution (the problem is not "we need feature X")
- [ ] Can be validated — you can measure whether the problem is solved

## Target Users

### Personas with Needs

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

### How Many Personas

Most products have 2-4 meaningful personas. If a PRD lists more than 6, the product scope is likely too broad. If it lists only 1, secondary users (admins, support staff, integration partners) may be missing.

### Anti-pattern: The Everything User

A persona that represents all users is no persona at all. "Power users who want advanced features AND casual users who want simplicity" describes a contradiction, not a persona. Different personas may have conflicting needs — that is fine, but the PRD must state which takes priority.

## Feature Scoping

### What Is In, What Is Out, What Is Deferred

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

### MoSCoW Prioritization

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

### Feature Detail Level

Each in-scope feature needs enough detail to be estimable:

**Too vague:**
- "Product search" — Full-text? By name only? With filters? Auto-suggest? Fuzzy matching?

**Right level:**
- "Product search: Text search by product name and description. Results ranked by relevance. Paginated, 20 per page. No filters in v1. No auto-suggest in v1."

**Too detailed (belongs in specs, not PRD):**
- "Product search: Implement Elasticsearch with BM25 ranking, 3-gram tokenizer, custom analyzers for each locale, with Redis caching of top-1000 queries..."

The PRD says WHAT, not HOW.

## Success Criteria

### Measurable Outcomes

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

### Types of Success Criteria

1. **User behavior metrics** — Conversion rates, completion rates, time-on-task, error rates.
2. **Business metrics** — Revenue impact, cost reduction, customer acquisition.
3. **Technical metrics** — Uptime, latency, error rate (these are NFRs, but they can also be success criteria).
4. **Adoption metrics** — Sign-up rate, daily active users, feature usage.

Every success criterion should have a **target value** and a **measurement method**. "Checkout abandonment under 40% as measured by analytics funnel tracking" is complete. "Checkout abandonment decreases" is not.

## Constraints

### Categories of Constraints

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

### How Constraints Affect Downstream Artifacts

Each constraint should be traceable to architectural decisions:
- "Must use PostgreSQL" → ADR for database choice.
- "Must comply with GDPR" → Data model includes consent tracking, API includes data export/delete.
- "Team of 3 developers" → Implementation tasks sized for 3 parallel workers.
- "Launch by March 1" → Feature scope fits within timeline.

## Non-Functional Requirements

NFRs define HOW the system should behave, not WHAT it should do. They are frequently under-specified in PRDs, which leads to expensive rework.

### Quantified NFRs

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

### NFR Categories Checklist

- [ ] **Performance** — Response times (p50, p95, p99), throughput, page load times
- [ ] **Scalability** — Concurrent users, data volume, growth rate
- [ ] **Availability** — Uptime target, maintenance windows, failover requirements
- [ ] **Security** — Authentication requirements, encryption, audit logging, compliance standards
- [ ] **Accessibility** — WCAG level, screen reader support, keyboard navigation
- [ ] **Data** — Retention periods, backup frequency, recovery point objective (RPO), recovery time objective (RTO)
- [ ] **Internationalization** — Languages, locales, character sets, date/number formats
- [ ] **Browser/device support** — Minimum browser versions, mobile support, responsive breakpoints
- [ ] **Monitoring** — What needs to be observable? Alerting thresholds?

## Competitive Context

### What to Include

- **What exists** — Name competing products and what they do well.
- **How this is different** — Specific differentiators, not "we're better."
- **Why users would switch** — What pain does this product solve that competitors do not?
- **What to learn from** — Features or patterns from competitors worth adopting.

### What NOT to Include

- Exhaustive competitor feature matrices (belongs in market research, not PRD).
- Competitive strategy or positioning (belongs in business plan, not PRD).
- Pricing comparisons (unless pricing is a product feature).

## Common PRD Failures

### The "Requirements as Solutions" Failure
PRD prescribes technical solutions instead of stating requirements. "Use Redis for caching" belongs in architecture, not the PRD. The PRD should say "response time under 200ms" — how to achieve that is an architectural decision.

### The "Missing Sad Path" Failure
PRD describes only happy paths. What happens when payment fails? When the user's session expires during checkout? When the network drops? When the form has invalid data? Every user action that can fail should have at least a sentence about what happens.

### The "Everyone Is a User" Failure
PRD addresses "users" as a monolith instead of identifying distinct personas with distinct needs. Admins, end users, API consumers, and support staff have different requirements.

### The "Implied API" Failure
PRD describes a UI but implies an API without stating it. "Users can view their order history" implies GET /orders, data model for orders, pagination, filtering, sorting. These implications should be explicit in the PRD.

### The "No Boundaries" Failure
PRD states what is in scope but never states what is out. Every documentation phase becomes a scope negotiation.

### The "Success Is Shipping" Failure
PRD has no success criteria beyond "launch the product." Without measurable outcomes, there is no way to know if the product solved the problem.

## PRD Quality Checklist

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
