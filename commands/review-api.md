---
description: "Review API contracts for completeness and consistency"
long-description: "Checks that every domain operation has an endpoint, error responses include domain-specific codes, and auth requirements are specified for every route."
---

## Purpose
Review API contracts targeting API-specific failure modes: operation coverage
gaps, error contract incompleteness, auth/authz gaps, versioning inconsistencies,
payload shape mismatches with domain entities, and idempotency gaps.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/api-contracts.md (required) — contracts to review
- docs/domain-models/ (required) — for operation coverage
- docs/adrs/ (required) — for consistency checking
- docs/system-architecture.md (required) — for interface coverage

## Expected Outputs
- docs/reviews/review-api.md — findings and resolution log
- docs/api-contracts.md — updated with fixes
- docs/reviews/api/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/api/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/api/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Operation coverage against domain model verified
- (deep) Error contracts complete and consistent
- (deep) Auth requirements specified for every endpoint
- (deep) Versioning strategy consistent with ADRs
- (deep) Idempotency documented for all mutating operations
- (mvp) Every finding categorized P0-P3 (P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.) with specific endpoint, field, and issue
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to api-contracts.md and re-validated
- (mvp) Review report includes explicit Readiness Status section
- (mvp) Downstream readiness confirmed — no unresolved P0 or P1 findings remain before UX spec proceeds
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: Full multi-pass review targeting all API failure modes. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Operation coverage check only.
- **custom:depth(1-5)**:
  - Depth 1: Endpoint coverage and response format pass only (1 review pass)
  - Depth 2: Add error handling and auth requirement passes (2 review passes)
  - Depth 3: Add idempotency, pagination, and versioning passes (4 review passes)
  - Depth 4: Add external model API review (4 review passes + external dispatch)
  - Depth 5: Multi-model review with reconciliation (4 review passes + multi-model synthesis)

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/api/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-api.md` exists with tracking comment
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

### review-api-design

*Failure modes and review passes specific to API contract specifications*

# Review: API Contracts

API contracts define the system's external and internal interfaces. They must cover every domain operation that crosses a boundary, handle errors explicitly, enforce authentication and authorization, and align with both the domain model and the database schema. This review uses 8 passes targeting the specific ways API contracts fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Operation Coverage**: Every domain operation crossing a component boundary has a corresponding API endpoint; no missing CRUD or query operations.
- **Pass 2 — Error Contract Completeness**: Every endpoint has explicit error responses with status codes, body structure, and triggering conditions.
- **Pass 3 — Auth/AuthZ Coverage**: Every endpoint specifies authentication and authorization requirements; no ambiguous access control.
- **Pass 4 — Versioning Consistency**: API versioning strategy is consistent across all endpoints and aligns with the ADR.
- **Pass 5 — Payload Shape vs Domain Entities**: Request/response payloads align with domain model entities in naming, types, and structure.
- **Pass 6 — Idempotency**: Mutating operations document idempotency behavior; operations with side effects specify the mechanism.
- **Pass 7 — Pagination/Filtering**: List endpoints have pagination, filter, and sort parameters documented with response metadata.
- **Pass 8 — Downstream Readiness**: API provides everything needed for UX spec (screen data, error states) and implementation tasks (complexity, dependencies).

## Deep Guidance

---

## Pass 1: Operation Coverage

### What to Check

Every domain operation that crosses a component boundary has a corresponding API endpoint (or GraphQL query/mutation, gRPC method, etc.). No cross-boundary operation is left without an API contract.

### Why This Matters

Missing endpoints mean entire features cannot be accessed through the API. Implementing agents discover the gap when they need to wire up a frontend component or integration — they either invent an endpoint (diverging from the contract) or block waiting for design. Operation coverage gaps are the most common API contract failure.

### How to Check

1. List every component interaction from the architecture's data flows
2. For each interaction that crosses a component or service boundary, verify a corresponding API endpoint exists
3. Cross-reference domain model operations: every aggregate command (create, update, delete) that is exposed beyond its owning service needs an endpoint
4. Check for read operations: every query pattern identified in the architecture needs a corresponding GET endpoint or query
5. Verify that domain events that trigger cross-service operations have corresponding webhook or event subscription endpoints if applicable
6. Check for administrative operations: user management, configuration, health checks, metrics

### What a Finding Looks Like

- P0: "Architecture data flow shows 'Frontend requests user's order history' but no GET /users/{id}/orders endpoint exists in the API contract."
- P1: "Domain model defines 'cancel order' as a command on the Order aggregate, but no PATCH/DELETE endpoint covers order cancellation."
- P2: "Health check endpoint is not documented. Implementation will need one for deployment orchestration."

---

## Pass 2: Error Contract Completeness

### What to Check

Every endpoint has explicit error responses defined. Error responses include status codes, error body structure, and conditions under which each error occurs.

### Why This Matters

Undocumented errors are the primary source of poor error handling in client code. When the API returns a 422 that is not in the contract, the frontend falls back to a generic "something went wrong" message. Complete error contracts enable clients to handle every failure mode gracefully.

### How to Check

1. For each endpoint, list the documented error responses
2. Check for standard errors every endpoint should handle: 400 (bad input), 401 (unauthenticated), 403 (unauthorized), 404 (not found), 500 (server error)
3. Check for domain-specific errors: business rule violations (e.g., "insufficient inventory"), state transition errors (e.g., "cannot cancel a shipped order"), constraint violations (e.g., "duplicate email")
4. Verify error response bodies have a consistent structure across all endpoints (error code, message, details)
5. Check for rate limiting errors (429) if the API has rate limits
6. Verify that error responses do not leak internal details (stack traces, database errors, internal IDs)

### What a Finding Looks Like

- P0: "POST /orders endpoint documents only 201 (success) and 400 (bad request). Missing: 401 (unauthenticated), 403 (not authorized to create orders), 409 (duplicate order reference), 422 (validation errors like 'inventory unavailable')."
- P1: "Error response format varies between endpoints. /users returns {error: string} while /orders returns {code: number, message: string, details: object}. Standardize."
- P2: "No endpoint documents a 429 (rate limited) response, but the architecture mentions rate limiting as a requirement."

---

## Pass 3: Auth/AuthZ Coverage

### What to Check

Every endpoint specifies its authentication requirements (who can call it) and authorization rules (what permissions are needed). No endpoint is left with ambiguous access control.

### Why This Matters

Endpoints without documented auth requirements default to "anyone can call this" in implementation. This is a security vulnerability when the endpoint should be restricted. Even internal service-to-service endpoints need auth documentation — "internal only, requires service token" is a valid auth specification.

### How to Check

1. For each endpoint, check for authentication specification: unauthenticated, user token, service token, API key, etc.
2. For authenticated endpoints, check for authorization specification: what role, permission, or ownership is required?
3. Verify that resource-ownership authorization is documented: "users can only access their own orders" (not just "requires user role")
4. Check for admin/superuser endpoints: are they clearly distinguished from regular user endpoints?
5. Verify that public endpoints are explicitly marked as public (not just missing auth — intentional vs. accidental)
6. Check for cross-service authentication: how do services authenticate to each other?

### What a Finding Looks Like

- P0: "DELETE /users/{id} has no auth specification. Can any authenticated user delete any user? Only admins? Only the user themselves?"
- P1: "GET /orders/{id} requires authentication but does not specify authorization. Can any authenticated user view any order, or only their own?"
- P2: "Service-to-service endpoints (e.g., /internal/inventory/reserve) do not document the authentication mechanism. Are they protected by network isolation, service tokens, or mTLS?"

---

## Pass 4: Versioning Consistency

### What to Check

API versioning strategy is consistent across all endpoints and aligns with the ADR on API versioning. Version handling is explicit, not assumed.

### Why This Matters

Inconsistent versioning makes it impossible for clients to know which version they are consuming. If some endpoints use URL versioning (/v1/), others use header versioning (Accept: application/vnd.api.v1+json), and others have no versioning, client SDK generation and API gateway configuration become fragmented.

### How to Check

1. Find the ADR on API versioning strategy
2. Verify every endpoint follows the same versioning scheme
3. Check for endpoints with no version indicator — are they intentionally unversioned (health checks, root) or accidentally unversioned?
4. If URL versioning is used, verify all paths include the version prefix
5. Check for backward compatibility commitments: what changes are considered breaking?
6. Verify that the contract documents how clients should handle version upgrades

### What a Finding Looks Like

- P1: "ADR-008 specifies URL-based versioning (/v1/), but three endpoints omit the version prefix: /health, /orders/webhook, /auth/token."
- P1: "Some endpoints use /v1/ prefix and others use /api/v1/ prefix. Inconsistent path structure."
- P2: "No documentation on what constitutes a breaking change versus a backward-compatible change. Clients do not know when to expect a version bump."

---

## Pass 5: Payload Shape vs Domain Entities

### What to Check

Request and response payloads align with domain model entities. Field names match domain terminology. Field types match domain attribute types. Payload structure reflects domain relationships.

### Why This Matters

Misalignment between API payloads and domain entities creates a translation layer that implementing agents must build and maintain. If the domain entity uses "orderedAt" but the API returns "created_date," every consumer must know about the mapping. Alignment reduces cognitive load and bug surface.

### How to Check

1. For each endpoint, compare request/response fields to the corresponding domain entity attributes
2. Check field names: do they match domain terminology (ubiquitous language)?
3. Check field types: if the domain model says "Money" (amount + currency), does the API represent it the same way or split/merge fields?
4. Check nested structures: do response shapes reflect domain aggregate boundaries?
5. Verify that API responses do not expose internal database fields (auto-increment IDs, internal status codes, audit columns) unless intentional
6. Check for missing fields: domain entity attributes that are absent from the API response (may be intentional for security, or may be a gap)

### What a Finding Looks Like

- P1: "Domain entity 'Order' uses 'placedAt' (DateTime) but API response uses 'createdDate' (string). Name mismatch and type mismatch."
- P1: "Domain entity 'Product' has a 'price' attribute modeled as Money (amount + currency), but the API returns 'price' as a plain number with no currency. Multi-currency support will break."
- P2: "API response includes 'internal_status_code' field which is a database implementation detail, not a domain concept."

---

## Pass 6: Idempotency

### What to Check

Mutating operations (POST, PUT, PATCH, DELETE) document their idempotency behavior. Operations that should be idempotent specify the mechanism (idempotency keys, natural idempotency).

### Why This Matters

Non-idempotent operations cause duplicate side effects on retry. If a client retries a failed POST /orders (network timeout, unclear response), the system may create two orders. Idempotency documentation tells client developers whether they can safely retry and how to do so.

### How to Check

1. For each POST endpoint, check: is it idempotent? If yes, what mechanism (idempotency key header, natural deduplication by business key)?
2. For each PUT endpoint, verify it is naturally idempotent (same PUT produces the same result)
3. For each PATCH endpoint, check if idempotency depends on the specific operation (appending to a list is not idempotent; setting a value is)
4. For each DELETE endpoint, verify behavior on repeated calls (first call deletes, subsequent calls return 404 or 204?)
5. Check for operations with side effects (sending emails, charging payments) — these must be idempotent or explicitly documented as non-idempotent
6. Verify that the idempotency mechanism is documented for clients: what header to send, how long the idempotency key is valid, what happens on key reuse

### What a Finding Looks Like

- P0: "POST /payments/charge has no idempotency specification. A client retry could charge the customer twice."
- P1: "POST /orders documents an idempotency key mechanism but does not specify the header name, key format, or expiration window."
- P2: "DELETE /orders/{id} does not specify behavior on repeated calls. Does the second DELETE return 404 (resource not found) or 204 (success, already deleted)?"

---

## Pass 7: Pagination/Filtering

### What to Check

List endpoints have pagination designed. Filter and sort parameters are documented. Response includes pagination metadata.

### Why This Matters

Unpaginated list endpoints return unbounded result sets. In development this works fine; in production with thousands of records, a single unpaginated call can crash the server or the client. Pagination must be designed, not retrofitted — retrofitting changes the API contract and breaks existing clients.

### How to Check

1. Identify every list/collection endpoint (GET endpoints returning arrays)
2. Verify each has pagination parameters documented (page/size, cursor-based, or offset/limit)
3. Check that pagination response includes metadata: total count (or has-next indicator), current page/cursor, page size
4. Verify that filter parameters are documented for common query patterns (identified in architecture data flows)
5. Check sort parameters: which fields can be sorted on? What is the default sort order?
6. Verify maximum page size is specified and enforced (prevents clients requesting 10,000 records)
7. For cursor-based pagination, check that cursor format and stability guarantees are documented

### What a Finding Looks Like

- P0: "GET /orders returns all orders with no pagination parameters. With 100,000 orders, this endpoint will timeout or crash."
- P1: "GET /products has pagination (page, size) but no filter parameters. The architecture's data flow shows 'search products by category and price range' as a primary use case."
- P2: "Pagination response includes 'total_count' but does not specify whether this is an exact count or an estimate (important for large datasets)."

---

## Pass 8: Downstream Readiness

### What to Check

The UX spec and implementation tasks steps can proceed with these API contracts. The API provides everything needed to build frontend interactions and define backend tasks.

### Why This Matters

The UX spec needs to know what data is available from the API to design screens. Implementation tasks need to know the API surface to scope work. Gaps in the API contract create ambiguity in both downstream phases.

### How to Check

The UX spec step needs:
1. Every user-facing action has a corresponding API endpoint
2. Response shapes are detailed enough to design screen layouts (know what fields are available)
3. Error responses are documented enough to design error states
4. Loading states are inferable: which operations are fast (synchronous) vs. slow (async with polling)?

The implementation tasks step needs:
1. Endpoint complexity is visible: which endpoints are simple CRUD, which require complex business logic?
2. Dependencies between endpoints are clear: which endpoints must be built first?
3. Integration points with external services are specified
4. Authentication/authorization requirements are detailed enough to implement

### What a Finding Looks Like

- P0: "The UX wireframe shows a 'user dashboard' with order count, recent orders, and account balance, but the API has no endpoint that provides this aggregated data. The frontend would need to make 3+ separate calls."
- P1: "Several endpoints are marked as 'async' (returns 202) but there is no documented polling or webhook mechanism for the frontend to get the result."
- P2: "API response examples do not include null/empty cases. The UX spec needs to know what an empty order list or a user with no profile photo looks like in API terms."

### Example Review Finding

```markdown
### Finding: Payment endpoint missing idempotency specification

**Pass:** 6 — Idempotency
**Priority:** P0
**Location:** API Contract Section 5.3 "POST /payments/charge"

**Issue:** The POST /payments/charge endpoint accepts a payment method and amount,
charges the customer, and returns a payment confirmation. The endpoint documents
only the 201 (success) and 400 (bad request) responses.

No idempotency mechanism is specified. If a client sends a charge request and
receives a network timeout (no response), it cannot safely retry — the retry
may charge the customer a second time. This is a financial data integrity issue.

**Impact:** Frontend developers will either (a) not retry on timeout, leaving
the user unsure if payment succeeded, or (b) retry unconditionally, risking
double charges. Both outcomes damage user trust and create support burden.

**Recommendation:** Add an Idempotency-Key header requirement:
- Client must include `Idempotency-Key: <uuid>` on every POST /payments/charge
- Server stores the key with the payment result for 24 hours
- Repeated requests with the same key return the original result without
  re-processing
- Document the key format (UUIDv4), retention window (24h), and behavior on
  key reuse (return cached result with 200, not 201)

**Trace:** API Contract 5.3 → PRD Section 3.2 "Payment Processing" →
ADR-009 "Financial data integrity requirements"
```

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

Continue with: `/scaffold:platform-parity-review`
