---
description: "Discover feature-level innovation opportunities in the PRD"
long-description: "Discover feature-level innovation opportunities within the PRD. This covers"
---

## Purpose
Discover feature-level innovation opportunities within the PRD. This covers
new capabilities, competitive positioning, and defensive product gaps. It is
NOT UX-level enhancement (that belongs in user story innovation) — it focuses
on whether the right features are in the PRD at all.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent innovation brainstorming — different models surface different
creative opportunities and competitive insights.

## Inputs
- docs/plan.md (required) — PRD to analyze for innovation opportunities
- docs/reviews/pre-review-prd.md (optional) — review findings for context

## Expected Outputs
- docs/prd-innovation.md — innovation findings, suggestions with cost/impact
  assessment, and disposition (accepted/rejected/deferred)
- docs/plan.md — updated with approved innovations
- docs/reviews/prd-innovation/review-summary.md (depth 4+) — multi-model innovation synthesis
- docs/reviews/prd-innovation/codex-review.json (depth 4+, if available) — raw Codex suggestions
- docs/reviews/prd-innovation/gemini-review.json (depth 4+, if available) — raw Gemini suggestions

## Quality Criteria
- (mvp) Enhancements are feature-level, not UX-level polish
- (mvp) Each suggestion has a cost estimate (trivial/moderate/significant)
- (mvp) Each suggestion has a clear user benefit and impact assessment
- (mvp) Each approved innovation includes: problem it solves, target users, scope boundaries, and success criteria
- (mvp) PRD scope boundaries are respected — no uncontrolled scope creep
- User approval is obtained before modifying the PRD
- User approval for each accepted innovation documented as a question-response pair with timestamp (e.g., "Q: Accept feature X? A: Yes — 2025-01-15T14:30Z")
- (depth 4+) Multi-model suggestions deduplicated and synthesized with unique ideas from each model highlighted

## Methodology Scaling
- **deep**: Full innovation pass across all categories (competitive research,
  UX gaps, AI-native opportunities, defensive product thinking). Cost/impact
  matrix. Detailed integration of approved innovations into PRD. Multi-model
  innovation dispatched to Codex and Gemini if available, with graceful
  fallback to Claude-only enhanced brainstorming.
- **mvp**: Not applicable — this step is conditional and skipped in MVP.
- **custom:depth(1-5)**: Depth 1-2: skip (not enough context for meaningful innovation at this depth). Depth 3: quick scan
  for obvious gaps and missing expected features. Depth 4: full innovation
  pass + one external model (if CLI available). Depth 5: full innovation pass
  + multi-model with deduplication and synthesis.

## Conditional Evaluation
Enable when: project has a competitive landscape section in plan.md, user explicitly
requests an innovation pass, or the PRD review (review-prd) identifies feature gaps
or missing capabilities. Skip when: PRD is minimal/exploratory, depth < 3, or user
explicitly declines innovation.

## Mode Detection
If docs/prd-innovation.md exists, this is a re-innovation pass. Read previous
suggestions and their disposition (accepted/rejected/deferred), focus on new
opportunities from PRD changes since last run. If multi-model artifacts exist
under docs/reviews/prd-innovation/, preserve prior suggestion dispositions.

## Update Mode Specifics
- **Detect prior artifact**: docs/prd-innovation.md exists with suggestion
  dispositions
- **Preserve**: accepted/rejected/deferred dispositions from prior runs,
  cost/impact assessments already reviewed by user, multi-model review artifacts
- **Triggers for update**: PRD scope changed (new features added or removed),
  user requests re-evaluation of deferred suggestions, new external model
  available for additional perspectives
- **Conflict resolution**: if a previously rejected suggestion is now relevant
  due to PRD changes, re-propose with updated rationale referencing the change

---

## Domain Knowledge

### prd-innovation

*Techniques for discovering feature-level innovation opportunities in product requirements*

# PRD Innovation

This knowledge covers feature-level innovation — discovering new capabilities, competitive gaps, and defensive product improvements that belong in the PRD. It operates at the product scope level: should this feature exist at all?

This is distinct from user story innovation (`user-story-innovation.md`), which covers UX-level enhancements to existing features. If an idea doesn't require a new PRD section or feature entry, it belongs in user story innovation, not here.

## Summary

- **Scope**: Feature-level innovation (new capabilities, competitive gaps, defensive improvements). UX polish on existing features belongs in user story innovation.
- **Competitive analysis**: Research direct competitors, adjacent products, and emerging patterns. Classify findings as table-stakes (must-have), differentiator (evaluate), or copied-feature (skip).
- **UX gap analysis**: Evaluate first-60-seconds experience, flow friction points, and missing flows that force workarounds.
- **Missing expected features**: Search/discovery, data management (bulk import/export, undo), communication (notifications), and personalization (settings, saved views).
- **AI-native opportunities**: Natural language interfaces, auto-categorization, predictive behavior, and content generation. Must pass the "magic vs. gimmick" test.
- **Defensive product thinking**: Write plausible 1-star reviews to identify gaps; analyze abandonment barriers (complexity, performance, trust, value, integration).
- **Evaluation framework**: Cost (trivial/moderate/significant) x Impact (nice-to-have/noticeable/differentiator). Must-have v1 = differentiator at any cost up to moderate, or noticeable at trivial cost.

## Deep Guidance

## Scope Boundary

**In scope:**
- New features users would expect based on competitive norms
- New user flows that address friction points in existing flows
- Competitive positioning — capabilities that differentiate the product
- Defensive product gaps — things users would complain about on day 1
- AI-native capabilities that wouldn't exist without AI

**Out of scope:**
- UX polish on existing features (smart defaults, inline validation, progressive disclosure) — belongs in user story innovation
- Implementation details (technology choices, architecture) — belongs in ADRs
- Non-functional improvements to existing features — belongs in user story innovation

---

## Competitive & Market Analysis

Research similar products to identify gaps and opportunities. The goal is actionable findings, not an exhaustive market report.

### What to Research

- **Direct competitors** — Products solving the same problem for the same users. What do they do well? What do users complain about?
- **Adjacent products** — Products in the same space that solve related problems. What patterns do they use that users now expect?
- **Emerging patterns** — UX conventions that have become table stakes. Users don't request them, but their absence feels like a gap (e.g., dark mode, keyboard shortcuts, real-time collaboration).

### How to Use Findings

For each competitive insight:
1. Is this a table-stakes feature (users expect it)? → Must-have candidate
2. Is this a differentiator (competitors don't have it, but users would love it)? → Evaluate cost/impact
3. Is this a copied feature (competitors have it, but it doesn't serve our users' specific needs)? → Skip

### Anti-Patterns

- **Feature parity obsession** — Copying every competitor feature dilutes focus. Only adopt features that serve your users' specific problem.
- **Exhaustive matrices** — A 50-row competitor comparison belongs in market research, not the PRD innovation pass. Focus on the 3-5 insights that actually affect product decisions.

## User Experience Gaps

Look at the core user flows described in the PRD and ask: where would a real user get frustrated?

### First 60 Seconds

The onboarding experience determines whether a user keeps the product:
- Can a new user understand the product's value within 60 seconds?
- Is there a clear first action? Or does the user land on an empty state with no guidance?
- How many steps between signup and the first "aha moment" where the product delivers value?

### Flow Friction Points

For each core user flow:
- How many steps does it take? Can any be eliminated or combined?
- Are there unnecessary confirmation dialogs? (Prefer undo over "are you sure?")
- Does the user need to leave the flow to get information required by the flow?
- What's the "delightful" version of this flow versus the "functional" version?

### Missing Flows

- Are there common user goals that the PRD doesn't address with a dedicated flow?
- Does the user have to work around the product to accomplish something obvious?

## Missing Expected Features

Features that users would search for and be surprised are absent. These are not innovative — they're expected. Their absence feels like a bug.

### Common Missing Features by Category

**Search & Discovery:**
- Text search across primary content types
- Filtering and sorting on list views
- Recently viewed / recently used items

**Data Management:**
- Bulk import/export (CSV, JSON)
- Undo for destructive actions
- Duplicate/clone for repetitive creation

**Communication:**
- Notification preferences (what, when, how)
- Email digests vs. real-time notifications
- In-app notification center

**Personalization:**
- User preferences / settings
- Saved views or filters
- Customizable dashboard or home screen

### Detection Technique

For each persona in the PRD, walk through their typical week:
1. What would they do daily? Weekly? Monthly?
2. For each action, is there a feature that supports it?
3. For each gap, would the user be surprised it's missing?

## AI-Native Opportunities

Features that would be impractical to build without AI but become natural with it. These are not "AI bolted on" — they are capabilities that fundamentally change the user experience.

### Categories

**Natural language interfaces:**
- Search that understands intent ("show me overdue invoices from last quarter") rather than requiring structured queries
- Data entry through conversation rather than forms for complex inputs
- Commands that understand context ("send the same email I sent to the last batch")

**Auto-categorization and tagging:**
- Content automatically categorized based on content analysis
- Suggested tags that learn from user corrections
- Smart folders or views that organize themselves

**Predictive behavior:**
- Pre-filled forms based on patterns ("you usually set this to X")
- Suggested next actions based on workflow patterns
- Anomaly detection ("this value is unusual — did you mean X?")

**Content generation:**
- Draft generation for repetitive writing (emails, descriptions, reports)
- Summarization of long content (meeting notes, documents, threads)
- Template suggestions based on context

### Evaluation

AI features should pass the "magic vs. gimmick" test:
- **Magic:** User thinks "how did it know?" and saves meaningful time
- **Gimmick:** User thinks "that's cool" once and never uses it again
- Only propose features that pass the magic test

## Defensive Product Thinking

Proactively identify what users would complain about. Fix the most likely complaints before they happen.

### The 1-Star Review Technique

Write the most likely 1-star review for the v1 product. Common templates:
- "I can't believe it doesn't even have [obvious feature]."
- "I tried to [common action] and it just [broke/was confusing/lost my data]."
- "Great concept but unusable on [mobile/slow connection/screen reader]."
- "I wanted to [goal] but had to [painful workaround] because [missing capability]."

For each plausible 1-star review: is the complaint addressed in the PRD? If not, should it be?

### Abandonment Analysis

Identify the most common reasons a user would try the product and stop using it:
1. **Complexity barrier** — Too hard to learn. Is onboarding addressed?
2. **Performance barrier** — Too slow. Are performance NFRs adequate?
3. **Trust barrier** — Doesn't feel reliable. Is error handling comprehensive?
4. **Value barrier** — Doesn't deliver on the promise fast enough. Is time-to-value minimized?
5. **Integration barrier** — Doesn't connect to their existing tools. Are integrations addressed?

### Accessibility & Inclusion

Gaps that alienate entire user segments:
- Keyboard-only navigation for users who can't use a mouse
- Screen reader support for visually impaired users
- Mobile responsiveness for users on phones
- Offline or degraded-mode support for users with unreliable connections
- Internationalization for non-English-speaking users

## Evaluation Framework

For each innovation suggestion, evaluate before proposing to the user.

### Cost Assessment

- **Trivial** (no new features): A small addition to an existing PRD feature section. No new user flows, no new data entities.
- **Moderate** (1-3 new features): Requires new PRD feature entries, possibly a new user flow. Contained within existing product scope.
- **Significant** (reshapes scope): Requires rethinking product boundaries, adding new personas, or fundamentally changing architecture assumptions.

### Impact Assessment

- **Nice-to-have**: Users wouldn't notice if absent. Polishes the product but doesn't change adoption or satisfaction meaningfully.
- **Noticeable improvement**: Users would appreciate it. Reduces friction in common workflows or addresses a gap competitors have filled.
- **Significant differentiator**: Sets the product apart. Users would choose this product partly because of this capability.

### Decision Framework

| | Trivial Cost | Moderate Cost | Significant Cost |
|---|---|---|---|
| **Differentiator** | Must-have v1 | Must-have v1 | Backlog (worth it but not now) |
| **Noticeable** | Must-have v1 | Backlog | Backlog |
| **Nice-to-have** | Include if free | Backlog | Reject |

### Presenting to the User

Group related suggestions for efficient decision-making. For each group:
1. Describe the enhancement and its user benefit (1-2 sentences)
2. State the cost (trivial/moderate/significant)
3. State your recommendation (must-have v1 / backlog / reject) with reasoning
4. Wait for approval before integrating into the PRD
5. Document approved innovations to the same standard as existing PRD features — full description, priority, business rules. No vague one-liners.

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
