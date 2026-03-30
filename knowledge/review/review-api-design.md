---
name: review-api-design
description: Failure modes and review passes specific to API contract specifications
topics: [api, contracts, rest, graphql, review]
---

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
