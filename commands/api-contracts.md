---
description: "Specify API contracts for all system interfaces"
long-description: "Specifies every API endpoint — request/response shapes, error codes with human-readable messages, auth requirements, pagination, and example payloads — so frontend and backend can be built in parallel."
---

## Purpose
Define API contracts for all system interfaces — REST endpoints, GraphQL schema,
WebSocket events, or inter-service communication. Each endpoint specifies request/
response shapes, error codes, authentication requirements, and rate limits.
Contracts serve as the definitive agreement between frontend and backend agents,
enabling parallel development with confidence.

## Inputs
- docs/system-architecture.md (required) — component interfaces to specify
- docs/domain-models/ (required) — domain operations to expose
- docs/adrs/ (required) — API style decisions (REST vs GraphQL, versioning)

## Expected Outputs
- docs/api-contracts.md — API specification with endpoints, request/response
  shapes, error contracts, auth requirements

## Quality Criteria
- (mvp) Every domain operation that crosses a component boundary maps to >= 1 API endpoint
- (mvp) If domain-models/ does not exist, API boundaries derived from user story acceptance criteria
- (mvp) Every endpoint documents: success response code, error response codes, error response body schema, and at least 2 domain-specific error codes per endpoint with human-readable reason phrases (e.g., 400 `invalid_email`, 409 `user_already_exists`)
- (mvp) Authentication and authorization requirements per endpoint
- (deep) Versioning strategy documented (if applicable)
- (deep) Pagination, filtering, and sorting for list endpoints
- (deep) Idempotency documented for mutating operations
- (deep) Pagination schema documented for all list endpoints (cursor or offset, page size limits, total count)
- (mvp) Example request and response payloads included for each endpoint
- (mvp) Every API endpoint from system-architecture.md is specified

## Methodology Scaling
- **deep**: OpenAPI-style specification. Full request/response schemas with
  examples. Error catalog. Auth flow diagrams. Rate limiting strategy.
  SDK generation considerations.
- **mvp**: Endpoint list with HTTP methods and brief descriptions. Key
  request/response shapes. Auth approach.
- **custom:depth(1-5)**:
  - Depth 1: endpoint list with HTTP methods and brief descriptions.
  - Depth 2: endpoint list with key request/response shapes and auth approach.
  - Depth 3: add full schemas, error contracts with domain-specific codes, and example payloads.
  - Depth 4: full OpenAPI-style spec with rate limiting, pagination, and idempotency documentation.
  - Depth 5: full spec with SDK generation considerations, versioning strategy, and auth flow diagrams.

## Mode Detection
Check for docs/api-contracts.md. If it exists, operate in update mode: read
existing endpoint definitions and diff against current system architecture and
domain models. Preserve existing endpoint paths, request/response schemas, and
error contracts. Add new endpoints for new features or domain operations.
Update error contracts if domain model changed validation rules. Never remove
or rename existing endpoints without explicit user approval.

## Update Mode Specifics
- **Detect prior artifact**: docs/api-contracts.md exists
- **Preserve**: existing endpoint paths, HTTP methods, request/response schemas,
  error codes, auth requirements, pagination patterns, versioning strategy
- **Triggers for update**: architecture changed component boundaries, domain
  models added new operations, ADRs changed API style or auth approach
- **Conflict resolution**: if architecture moved an operation to a different
  component, update the endpoint's component ownership but preserve its contract;
  flag breaking schema changes for user review

---

## Domain Knowledge

### api-design

*API design principles for REST, GraphQL, and inter-service communication*

## Summary

## API-First Development

Design the API contract before writing implementation code. The contract defines what the API does; the implementation fulfills that contract. This order matters because:

- Consumers can build against the contract in parallel with the API implementation
- The contract reflects domain concepts, not implementation details
- Contract changes are visible and reviewed before code changes
- Tests can be written against the contract specification

### Contract as Source of Truth

The API specification (OpenAPI for REST, GraphQL schema for GraphQL) is the authoritative definition of the API. Implementation code must conform to the specification, not the other way around.

**Specification-driven workflow:**

1. Define the API specification (endpoints, types, error codes)
2. Generate server stubs and client types from the specification
3. Implement the server stubs
4. Validate implementation against specification in CI (contract testing)
5. When the API needs to change, change the specification first, then update implementation

### Consumer-Driven Contract Testing

When multiple consumers depend on an API, each consumer defines a contract describing what it needs from the API. The API provider runs all consumer contracts as part of its test suite. If a provider change breaks a consumer contract, the tests fail before deployment.

Tools: Pact (language-agnostic), Spring Cloud Contract (JVM), Dredd (OpenAPI-based).

### API Documentation

Documentation is generated from the specification, not written separately. Separately-maintained docs drift from the implementation.

- **OpenAPI/Swagger:** Auto-generates interactive documentation (Swagger UI, Redoc)
- **GraphQL:** Schema introspection provides self-documenting APIs (GraphiQL, Apollo Studio)
- **Supplement with:** Usage examples, authentication guides, rate limiting policies, error handling guides

## REST Design

### Resource Modeling

REST APIs model resources (nouns), not actions (verbs). Resources correspond to domain entities or aggregates.

**URL structure:**

```
GET    /api/v1/orders              # List orders
POST   /api/v1/orders              # Create an order
GET    /api/v1/orders/:id          # Get a specific order
PATCH  /api/v1/orders/:id          # Update an order
DELETE /api/v1/orders/:id          # Delete an order
GET    /api/v1/orders/:id/lines    # List order lines (sub-resource)
POST   /api/v1/orders/:id/lines    # Add a line to an order
```

**Resource naming rules:**

- Use plural nouns: `/orders` not `/order`
- Use lowercase with hyphens: `/order-lines` not `/orderLines` or `/order_lines`
- Nest sub-resources only one level deep: `/orders/:id/lines` is fine; `/customers/:id/orders/:id/lines/:id/adjustments` is too deep — flatten it
- Use nouns, not verbs: `/orders` not `/getOrders` or `/createOrder`

**Actions that don't fit CRUD:**

Some operations don't map cleanly to resource CRUD. Use sub-resource patterns:

```
POST /api/v1/orders/:id/submit       # Submit an order (state transition)
POST /api/v1/orders/:id/cancel       # Cancel an order
POST /api/v1/reports/generate        # Trigger report generation
```

Or use a command-style resource:

```
POST /api/v1/order-submissions       # Create an "order submission" resource
POST /api/v1/password-resets         # Create a "password reset" resource
```

## Deep Guidance

### HTTP Methods

| Method | Semantics | Idempotent | Safe |
|--------|-----------|------------|------|
| GET | Retrieve resource(s) | Yes | Yes |
| POST | Create resource or trigger action | No | No |
| PUT | Replace entire resource | Yes | No |
| PATCH | Partially update resource | No* | No |
| DELETE | Remove resource | Yes | No |

*PATCH can be made idempotent with proper design but isn't inherently.

**Use the correct method:**

- Don't use GET with side effects (creating, updating, deleting data)
- Don't use POST for idempotent operations that PUT handles
- Prefer PATCH over PUT for partial updates (PUT requires sending the entire resource)
- DELETE should be idempotent: deleting an already-deleted resource returns 204, not 404

### Status Codes

Use the correct HTTP status code for every response:

**Success (2xx):**

| Code | When |
|------|------|
| 200 OK | Successful GET, PATCH, or action that returns data |
| 201 Created | Successful POST that creates a resource. Include `Location` header. |
| 204 No Content | Successful DELETE or update that returns no body |

**Client errors (4xx):**

| Code | When |
|------|------|
| 400 Bad Request | Request body/params fail validation |
| 401 Unauthorized | No valid authentication credentials |
| 403 Forbidden | Authenticated but insufficient permissions |
| 404 Not Found | Resource doesn't exist |
| 409 Conflict | State conflict (duplicate email, invalid state transition) |
| 422 Unprocessable Entity | Syntactically valid but semantically invalid request |
| 429 Too Many Requests | Rate limit exceeded. Include `Retry-After` header. |

**Server errors (5xx):**

| Code | When |
|------|------|
| 500 Internal Server Error | Unexpected server failure |
| 502 Bad Gateway | Upstream service failure |
| 503 Service Unavailable | Temporary overload or maintenance |

**Anti-pattern: 200 for everything.** Returning 200 with `{ "error": true, "message": "Not found" }` breaks HTTP semantics and makes error handling inconsistent.

### Content Negotiation

- Default to `application/json` for request and response bodies
- Accept and return `Content-Type` headers
- For file uploads, accept `multipart/form-data`
- For file downloads, return the appropriate MIME type with `Content-Disposition` header

## GraphQL Design

### Schema-First Design

Define the GraphQL schema before implementing resolvers. The schema is the contract.

```graphql
type Order {
  id: ID!
  customer: Customer!
  lines: [OrderLine!]!
  status: OrderStatus!
  total: Money!
  createdAt: DateTime!
}

type Query {
  order(id: ID!): Order
  orders(filter: OrderFilter, pagination: PaginationInput): OrderConnection!
}

type Mutation {
  createOrder(input: CreateOrderInput!): CreateOrderPayload!
  submitOrder(id: ID!): SubmitOrderPayload!
}
```

### Type System

- Use non-nullable (`!`) by default. Make fields nullable only when absence is meaningful.
- Use input types (`input`) for mutation arguments, not the same types used for output.
- Use enums for finite value sets: `enum OrderStatus { DRAFT SUBMITTED CONFIRMED SHIPPED DELIVERED CANCELLED }`
- Use interfaces and unions for polymorphic types.
- Use custom scalars for domain-specific types: `scalar DateTime`, `scalar Money`, `scalar EmailAddress`.

### Query Complexity

GraphQL's flexibility allows expensive queries. Mitigate:

**Depth limiting:** Reject queries deeper than a configured maximum (typically 5-10 levels).

**Complexity analysis:** Assign cost to each field. Reject queries whose total cost exceeds a threshold.

```graphql
# This query might cost: 1 (orders) + 100 * (1 (customer) + 10 * 1 (items)) = 1101
{
  orders(first: 100) {
    customer {
      orders(first: 10) {
        items { name }
      }
    }
  }
}
```

**Pagination enforcement:** Never return unbounded lists. Require pagination arguments on all list fields.

### N+1 Prevention

The N+1 problem: fetching a list of N orders, then issuing N separate queries for each order's customer. GraphQL's nested resolution naturally creates this pattern.

**Solution: DataLoader pattern.** Batch and deduplicate database queries within a single request. When N orders reference 5 distinct customers, issue one query for those 5 customers, not N queries.

```typescript
const customerLoader = new DataLoader(async (ids: string[]) => {
  const customers = await db.customers.findMany({ where: { id: { in: ids } } });
  return ids.map(id => customers.find(c => c.id === id));
});
```

### Subscription Patterns

For real-time data, GraphQL subscriptions provide a typed, schema-driven alternative to raw WebSockets:

```graphql
type Subscription {
  orderStatusChanged(orderId: ID!): Order!
  newNotification(userId: ID!): Notification!
}
```

Implement with WebSocket transport (graphql-ws protocol). Consider:
- Authentication for subscription connections
- Connection lifecycle management (reconnection, timeout)
- Scaling (subscriptions are stateful — sticky sessions or pub/sub backend needed)

## Error Contracts

### Structured Error Responses

Every error response should follow a consistent structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields",
    "details": [
      {
        "field": "email",
        "code": "INVALID_FORMAT",
        "message": "Must be a valid email address"
      },
      {
        "field": "age",
        "code": "OUT_OF_RANGE",
        "message": "Must be between 13 and 150"
      }
    ],
    "requestId": "req_abc123"
  }
}
```

### Error Code Taxonomy

Define a finite set of error codes, not free-text messages:

**Authentication errors:** `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`

**Authorization errors:** `FORBIDDEN`, `INSUFFICIENT_PERMISSIONS`, `RESOURCE_NOT_OWNED`

**Validation errors:** `VALIDATION_ERROR` (with per-field details), `INVALID_FORMAT`, `REQUIRED_FIELD`, `OUT_OF_RANGE`, `TOO_LONG`, `DUPLICATE_VALUE`

**Resource errors:** `NOT_FOUND`, `ALREADY_EXISTS`, `CONFLICT`, `GONE`

**Business logic errors:** `INVALID_STATE_TRANSITION`, `BUSINESS_RULE_VIOLATION`, `LIMIT_EXCEEDED`

**Server errors:** `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, `UPSTREAM_ERROR`, `TIMEOUT`

### Error Documentation

For each error code, document:
- What triggers it
- What the client should do about it (retry? show message? redirect?)
- Example response body
- Whether the error is transient (may succeed on retry) or permanent (same request will always fail)

## Authentication and Authorization

### Authentication Patterns

**Session-based authentication:**
- Server creates a session on login, stores session data server-side, sends session ID in a cookie
- Works well for web applications with server-side rendering
- Requires session storage (database, Redis) that scales with concurrent users

**JWT (JSON Web Tokens):**
- Server issues a signed token containing claims (user ID, roles, expiration)
- Token is sent in the `Authorization: Bearer <token>` header
- Stateless on the server — no session storage needed
- Trade-off: cannot be individually revoked without a blocklist (which reintroduces state)
- Always set short expiration (15-60 minutes) and use refresh tokens for re-authentication

**OAuth 2.0 / OIDC:**
- Delegated authentication via a third-party identity provider (Google, GitHub, Auth0)
- OIDC (OpenID Connect) adds identity claims on top of OAuth 2.0's authorization framework
- Use for "Sign in with X" features or when managing user credentials is out of scope

**API Keys:**
- Long-lived tokens for service-to-service or developer API access
- Not suitable for end-user authentication (no expiration management, no MFA)
- Hash and store; never return the full key after creation

### Authorization Patterns

**Per-endpoint authorization:** Every endpoint declares its required permissions. The auth middleware checks the authenticated user's permissions before the handler executes.

```
POST /api/v1/orders         -> requires: orders:create
GET  /api/v1/orders/:id     -> requires: orders:read (+ resource-level check: own orders only?)
DELETE /api/v1/admin/users   -> requires: admin:users:delete
```

**Token scope model:** Access tokens carry scopes (permissions). Each API endpoint requires specific scopes. The token must include all required scopes for the request to proceed.

**RBAC (Role-Based Access Control):** Users have roles. Roles have permissions. Simple and sufficient for most applications.

**ABAC (Attribute-Based Access Control):** Authorization decisions based on attributes of the user, resource, and environment. More flexible than RBAC but more complex. Use when RBAC's role-to-permission mapping doesn't capture the required policies.

## Pagination, Filtering, and Sorting

### Cursor-Based Pagination

Preferred for most APIs. Uses an opaque cursor (encoded primary key or timestamp) to mark the position in the result set.

```
GET /api/v1/orders?first=20&after=cursor_abc123

Response:
{
  "data": [...],
  "pageInfo": {
    "hasNextPage": true,
    "hasPreviousPage": true,
    "startCursor": "cursor_xyz789",
    "endCursor": "cursor_def456"
  }
}
```

**Advantages:** Stable under concurrent inserts/deletes. No duplicate or skipped records. Performs well on large datasets (no OFFSET scan).

**Disadvantage:** Cannot jump to "page 5." Users can only go forward/backward.

### Offset-Based Pagination

Uses page number and page size. Simple to implement and allows jumping to any page.

```
GET /api/v1/orders?page=3&pageSize=20

Response:
{
  "data": [...],
  "pagination": {
    "page": 3,
    "pageSize": 20,
    "totalItems": 156,
    "totalPages": 8
  }
}
```

**Disadvantage:** Unstable under concurrent writes (inserts shift items between pages). Performance degrades on large offsets (database must scan and discard OFFSET rows).

### Filtering

Design a consistent filtering syntax:

```
GET /api/v1/orders?status=active&customerId=123&createdAfter=2026-01-01
```

For complex filtering, consider a structured filter parameter:

```
GET /api/v1/orders?filter[status]=active&filter[total][gte]=1000
```

**Rules:**
- Unknown filter parameters should return 400, not be silently ignored
- Filter parameter names should match resource field names
- Document which fields are filterable (not all fields need to be)
- Validate filter values against field types

### Sorting

```
GET /api/v1/orders?sort=-createdAt,status
```

Convention: prefix with `-` for descending, no prefix for ascending. Multiple sort fields separated by commas.

**Rules:**
- Document which fields are sortable
- Define a default sort order (usually `-createdAt`)
- Limit the number of sort fields (2-3 is sufficient)

### Total Count Considerations

Returning `totalItems` requires a COUNT query, which can be expensive on large tables. Options:

- Return exact count for small datasets (<10,000 rows)
- Return approximate count for large datasets (`EXPLAIN` count estimate)
- Omit count entirely and use `hasNextPage` only
- Make count optional: `GET /api/v1/orders?includeCount=true`

## Versioning

### URL Versioning

```
/api/v1/orders
/api/v2/orders
```

Simple, explicit, cacheable. The version is visible in every request. Best for public APIs where consumers need clear migration paths.

### Header Versioning

```
Accept: application/vnd.myapp.v2+json
```

Keeps URLs clean. Harder to test (can't just change the URL in a browser). Suitable for internal APIs.

### Evolution Without Versioning

For many APIs, additive changes don't need versioning:

**Non-breaking changes (no version bump):**
- Adding a new field to a response
- Adding a new optional query parameter
- Adding a new endpoint
- Adding a new enum value (if clients handle unknown values)

**Breaking changes (version bump or migration):**
- Removing a field from a response
- Renaming a field
- Changing a field's type
- Making an optional parameter required
- Changing the meaning of a status code

**Design for evolution:** use nullable fields, design enum handling to tolerate unknown values, and avoid coupling to response shape.

## Idempotency

### Idempotent Operations

An operation is idempotent if calling it multiple times produces the same result as calling it once. GET, PUT, and DELETE are inherently idempotent. POST is not.

### Idempotency Keys

For non-idempotent operations (POST), clients send a unique key with the request. The server uses this key to detect and deduplicate retries.

```
POST /api/v1/payments
Idempotency-Key: idk_550e8400-e29b-41d4-a716-446655440000

# First call: processes payment, stores result keyed by idempotency key
# Second call with same key: returns stored result without reprocessing
```

**Implementation:**

1. Client generates a UUID as the idempotency key
2. Server checks if the key exists in the idempotency store
3. If found: return the stored response (no side effects)
4. If not found: process the request, store the response keyed by the idempotency key, return the response
5. Keys expire after a defined period (24-72 hours)

### Safe Retries

Design APIs so that transient failures can be safely retried:

- All GET requests are safe to retry (they're idempotent and safe)
- PUT and DELETE are safe to retry (they're idempotent)
- POST requests should accept idempotency keys for any operation with side effects (charges, notifications, resource creation)

## Common Pitfalls

**Chatty APIs.** A page load requires 15 API calls to assemble the necessary data. Each call adds latency and failure surface. Fix: design aggregation endpoints that return the data a specific consumer needs, or use GraphQL for flexible data fetching.

**Missing error contracts.** The API returns different error shapes from different endpoints. One returns `{ "error": "message" }`, another returns `{ "errors": [{ "msg": "..." }] }`. Fix: define a single error response schema and use it everywhere.

**Authentication as afterthought.** Endpoints built without auth, then auth bolted on later. Leads to inconsistent protection, forgotten endpoints, and auth bypass vulnerabilities. Fix: design auth requirements for every endpoint at API design time, not implementation time.

**Not designing for pagination from the start.** A list endpoint returns all records. Works fine with 10 records, crashes with 100,000. Fix: every list endpoint must be paginated from day one. Never return unbounded lists.

**Exposing internal models.** Returning database entities directly as API responses. Internal fields leak (internal IDs, audit columns, soft-delete flags). Schema changes break clients. Fix: use response DTOs that shape data for the consumer, not the database.

**Inconsistent naming.** One endpoint uses `created_at`, another uses `createdAt`, another uses `creation_date`. Fix: choose one naming convention (camelCase is standard for JSON APIs) and enforce it project-wide.

**Missing rate limiting.** No protection against abusive or buggy clients sending excessive requests. Fix: implement rate limiting on all public endpoints. Return 429 with `Retry-After` header.

**Ignoring CORS.** Frontend can't call the API because CORS headers are missing. Fix: configure CORS at API design time. Be specific about allowed origins — don't use `*` in production.

## See Also

- [testing-strategy](../core/testing-strategy.md) — Contract testing and API test patterns

---

## After This Step

Continue with: `/scaffold:review-api`
