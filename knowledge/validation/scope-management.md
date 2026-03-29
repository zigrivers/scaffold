---
name: scope-management
description: Detecting scope creep and ensuring specs stay aligned to PRD boundaries
topics: [validation, scope, creep, prd-alignment, gold-plating]
---

# Scope Management

Scope management validation compares every specification artifact against the PRD to ensure that the documented system matches what was actually requested. Features that cannot be traced to a PRD requirement are scope creep. Requirements that grew during documentation are scope inflation. Extra polish on non-critical features is gold-plating. This validation catches all three.

## Summary

- **Feature-to-PRD tracing**: Classify every capability as traced (maps to PRD), supporting (necessary infrastructure), or creep (no PRD justification).
- **Scope inflation detection**: Compare each PRD requirement's original scope to its implementation scope; flag features that grew beyond what was requested.
- **Gold-plating detection**: Over-abstraction, premature optimization, excessive error handling, and UI polish beyond requirements. Test: "If removed, would any PRD requirement be unmet?"
- **Deferred scope leakage**: Verify explicitly deferred items (v2 features) do not appear in specifications, including partial infrastructure for deferred features.
- **NFR scope alignment**: Implementation targets should match PRD targets, not exceed them (e.g., 99.9% uptime, not 99.99%).
- **Decision framework**: When in doubt, defer. Scope additions are kept only if required for a PRD feature to work and do not significantly increase effort or operational complexity.
- Run scope validation after all documentation phases and before implementation begins.

## Deep Guidance

## Why Scope Grows

Scope grows during the documentation pipeline for understandable reasons — but each growth increases implementation effort, risk, and timeline. Common causes:

1. **Engineering enthusiasm** — Domain modeling reveals interesting patterns, and the team designs for future needs that are not in the PRD.
2. **Defensive architecture** — "We should add this abstraction now because it will be hard to add later." Maybe, but if it is not in the PRD, it is scope creep.
3. **Completeness bias** — "Every API should have full CRUD" even when the PRD only calls for Create and Read.
4. **Platform assumptions** — "All modern apps need real-time notifications" even when the PRD does not mention them.
5. **Review-driven growth** — During review phases, reviewers identify gaps that are real but beyond the PRD scope. These gaps are valid observations but should be deferred, not added.
6. **Implicit requirements** — "Obviously we need admin tooling" or "of course there is a settings page" — unless the PRD says so, these are not requirements.

## What to Check

### 1. Feature-to-PRD Tracing

For every feature, endpoint, screen, or capability in the specifications, verify it traces to a specific PRD requirement.

**Process:**
1. Build a list of every concrete capability in the specifications:
   - Every API endpoint
   - Every database table
   - Every UI screen or component
   - Every background job or scheduled task
   - Every integration with an external service
2. For each capability, find the PRD requirement that justifies it.
3. Classify each capability:
   - **Traced** — Maps directly to a PRD requirement.
   - **Supporting** — Does not map to a PRD requirement directly but is necessary infrastructure for a traced capability (e.g., database connection pooling supports all data features).
   - **Creep** — Cannot be traced to any PRD requirement and is not necessary infrastructure.

**What findings look like:**
- "API endpoint `GET /analytics/reports` has no corresponding PRD requirement. The PRD mentions displaying basic stats on the dashboard but does not mention a reports feature."
- "The `AuditLog` table is not traceable to any PRD requirement. While audit logging is good practice, it is not a v1 requirement."
- "The UX spec includes an 'Admin Dashboard' with user management, role assignment, and system monitoring. The PRD mentions only a basic admin interface for content moderation."

### 2. Requirement Scope Inflation

A requirement starts small in the PRD and grows during documentation. The PRD says "users can search products" — by the time it reaches the API contracts, there is full-text search with faceted filtering, auto-suggest, and search analytics.

**Process:**
1. For each PRD requirement, compare its original scope (as stated in the PRD) with its implementation scope (as described in later artifacts).
2. Look for:
   - Features that are more detailed than the requirement called for.
   - Additional sub-features not mentioned in the requirement.
   - Higher quality targets than the requirement specified.
   - More platforms or device types than the requirement addressed.

**Detection heuristics:**
- Count the API endpoints per PRD feature. A single feature with 10+ endpoints may indicate inflation.
- Count the database tables per domain entity. An entity with 5+ tables may indicate over-engineering.
- Compare the PRD's feature description word count to the architecture's implementation description. If the implementation is 10x longer, scope may have inflated.
- Check for features that only appear after the architecture step that were not in the domain modeling step or the PRD.

**What findings look like:**
- "PRD says 'users can update their profile.' Architecture specifies profile versioning with history, diff view, and rollback capability. This exceeds the PRD requirement."
- "PRD says 'send email notifications for important events.' Implementation tasks include: email templates engine, unsubscribe management, bounce handling, email analytics, and A/B testing. Only the first two are justified by the PRD."

### 3. Gold-Plating Detection

Gold-plating is adding extra polish, features, or capabilities beyond what is needed. Unlike scope creep (adding new features), gold-plating over-engineers existing features.

**Indicators of gold-plating:**
- **Over-abstraction** — Generic plugin systems when only one plugin type exists. Configurable everything when the configuration will never change. Abstract factory patterns when there is only one concrete class.
- **Premature optimization** — Caching layers for data that is accessed once per session. Database sharding for an application that will have 100 users. CDN configuration for an internal tool.
- **Excessive error handling** — Circuit breakers and retry policies for services that have 99.99% uptime. Graceful degradation for features that can simply show an error.
- **Over-documentation** — API endpoints with 50+ response examples. Database schemas with migration scripts for every possible future change.
- **UI polish beyond requirements** — Animations, micro-interactions, and visual effects for an internal business tool. Dark mode when the PRD does not mention it.

**Detection technique:**
For each specification element, ask: "If I removed this, would any PRD requirement be unmet?" If the answer is no, it is gold-plating.

### 4. Deferred Scope Leaking In

The PRD explicitly defers certain features ("out of scope for v1," "future enhancement"). Verify none of these deferred items appear in the specifications.

**Process:**
1. Extract all explicitly deferred items from the PRD.
2. Search all specification artifacts for any reference to deferred items.
3. Check for partial implementations — infrastructure for a deferred feature that is "already done" but not needed yet.

**What findings look like:**
- "PRD defers multi-language support to v2, but the database schema has a `locale` column on every content table and the API contracts accept `Accept-Language` headers."
- "PRD defers mobile app to v2, but the architecture includes a 'Mobile API Gateway' component and the API contracts include mobile-specific endpoints."

### 5. NFR Scope Alignment

Non-functional requirements are especially prone to scope creep because they can always be "better."

**Process:**
1. For each NFR in the PRD, check whether the implementation scope matches the specified target:
   - If PRD says "p95 under 500ms," does the architecture target 100ms?
   - If PRD says "WCAG AA," does the UX spec target WCAG AAA?
   - If PRD says "99.9% uptime," does the operations runbook design for 99.99%?
2. Over-specifying NFRs is gold-plating. The implementation effort difference between 99.9% and 99.99% uptime is enormous.

## How to Structure the Audit

### Pass 1: PRD Boundary Extraction

Build a definitive list of what is in scope and what is out:

```markdown
## In Scope (from PRD)
1. User registration and authentication
2. Product catalog with search
3. Shopping cart
4. Checkout with Stripe payment
5. Order history
6. Basic admin: content moderation

## Explicitly Out of Scope (from PRD)
1. Multi-language support (v2)
2. Mobile native app (v2)
3. Marketplace (third-party sellers) (v2)
4. Social features (reviews, ratings) (v2)
5. Advanced analytics and reporting (v2)

## NFR Targets (from PRD)
- Performance: p95 < 500ms for page loads
- Availability: 99.9% uptime
- Security: OWASP Top 10 compliance
- Accessibility: WCAG AA
- Scale: Support 10,000 concurrent users
```

### Pass 2: Artifact Scanning

For each specification artifact, list every capability and trace it:

```markdown
| Capability | Artifact | PRD Requirement | Classification |
|------------|----------|-----------------|----------------|
| POST /auth/register | API contracts | User registration | Traced |
| POST /auth/login | API contracts | User authentication | Traced |
| GET /auth/sessions | API contracts | — | Creep (session management not in PRD) |
| users table | Schema | User registration | Traced |
| user_sessions table | Schema | — | Creep (paired with sessions endpoint) |
| SearchService with Elasticsearch | Architecture | Product search | Inflation (PRD says search, not full-text search engine) |
| Notification Service | Architecture | — | Creep |
| Admin Analytics Dashboard | UX spec | — | Creep (PRD says basic moderation only) |
```

### Pass 3: Impact Assessment

For each scope finding, assess the impact of keeping vs removing it:

```markdown
## Finding: Notification Service

**Classification:** Scope creep
**Effort to implement:** ~3 tasks, ~2 days
**Impact of keeping:** Adds complexity to architecture, requires email service integration, adds operational burden
**Impact of removing:** Users would not receive email notifications for order updates — but the PRD does not require this
**Recommendation:** Defer to v2. Remove from architecture and implementation tasks.
```

## Output Format

### Scope Audit Summary

```markdown
## Scope Audit Results

**Total capabilities identified:** 85
**Traced to PRD:** 62 (73%)
**Supporting infrastructure:** 15 (18%)
**Scope creep:** 5 (6%)
**Gold-plating:** 3 (4%)

### Scope Creep Items
1. Notification Service — recommend defer
2. Admin Analytics Dashboard — recommend defer
3. User session management API — recommend simplify
4. Export to PDF — recommend remove (explicitly deferred in PRD)
5. Multi-language database support — recommend remove (explicitly deferred in PRD)

### Gold-Plating Items
1. Full-text search with Elasticsearch — PRD says "search," recommend PostgreSQL full-text search
2. WCAG AAA compliance — PRD says AA, recommend AA
3. 99.99% uptime architecture — PRD says 99.9%, recommend simplifying HA setup

### Scope Inflation Items
1. User profile: versioning and rollback added beyond PRD requirement
2. Email notifications: template engine, unsubscribe management, analytics added
3. Search: faceted filtering, auto-suggest, search analytics added

### Estimated Effort Savings if Scope is Tightened
- Removing creep: ~8 tasks, ~5 days estimated
- Fixing gold-plating: ~4 tasks, ~3 days estimated
- Reducing inflation: ~6 tasks, ~4 days estimated
- **Total: ~18 tasks, ~12 days estimated savings**
```

## Decision Framework

Not all scope additions are bad. Some are genuinely necessary even if not in the PRD. Use this framework:

| Question | If Yes | If No |
|----------|--------|-------|
| Is it required for a PRD feature to work? | Keep (supporting infrastructure) | Continue evaluation |
| Does the PRD explicitly defer it? | Remove | Continue evaluation |
| Would a user notice its absence? | Consider keeping, but flag for PRD update | Remove |
| Does it significantly increase implementation effort? | Remove unless critical | May keep if low effort |
| Does it add operational complexity? | Remove unless critical | May keep if simple |

When in doubt, defer. It is always easier to add a feature later than to remove one that has been built.

## When to Run Scope Validation

- After all documentation phases are complete, before the implementation tasks step.
- After the implementation tasks step, before implementation begins.
- When the task list feels "too big" — scope validation often reveals why.
- When stakeholders ask "why is this taking so long?" — scope validation quantifies the answer.
