---
description: "Define API contracts with endpoints, schemas, error handling, and auth"
long-description: "Reads system architecture and domain models, then creates docs/api-contracts.md specifying REST/GraphQL endpoints, request/response schemas, error contracts, authentication, pagination, and versioning."
---

Read `docs/system-architecture.md`, `docs/domain-models/`, and `docs/adrs/`, then define API contracts for all system interfaces. Create `docs/api-contracts.md` specifying every endpoint with request/response shapes, error codes, authentication requirements, and pagination.

## Mode Detection

Before starting, check if `docs/api-contracts.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists -> UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:api-contracts v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing contracts against what this prompt would produce fresh. Categorize:
   - **ADD** — Endpoints or contracts missing from existing spec
   - **RESTRUCTURE** — Exists but doesn't match current architecture or best practices
   - **PRESERVE** — Project-specific endpoint customizations, error codes, rate limit decisions
3. **Cross-doc consistency**: Read related docs and verify contracts align with current architecture and domain models.
4. **Preview changes**: Present the user a summary table. Wait for approval before proceeding.
5. **Execute update**: Update contracts, respecting preserve rules.
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:api-contracts v<ver> <date> -->`
7. **Post-update summary**: Report endpoints added, sections restructured, content preserved, and cross-doc issues.

**In both modes**, follow all instructions below.

### Update Mode Specifics
- **Primary output**: `docs/api-contracts.md`
- **Preserve**: Custom error codes, rate limit configurations, endpoint-specific auth decisions, versioning strategy choices
- **Related docs**: `docs/system-architecture.md`, `docs/domain-models/`, `docs/adrs/`
- **Special rules**: Never remove an endpoint without verifying it's unused. Preserve error code taxonomy customizations.

---

## What the Document Must Cover

### 1. API Style and Conventions

State the API style chosen in ADRs (REST, GraphQL, gRPC) and document conventions:

**REST conventions:**
- URL structure: `/api/v1/<resource>` with plural nouns, lowercase, hyphens
- Nesting: one level deep maximum (`/orders/:id/lines`, not deeper)
- Non-CRUD actions: sub-resource pattern (`/orders/:id/submit`) or command resource (`/order-submissions`)
- Content type: `application/json` default
- Naming convention for JSON fields: camelCase (standard for JSON APIs)

**GraphQL conventions (if applicable):**
- Schema-first design approach
- Non-nullable by default
- Separate input types for mutations
- Custom scalars for domain types (DateTime, Money, EmailAddress)

### 2. Endpoint Specification

For each endpoint, specify:

**Endpoint definition:**
```
METHOD /api/v1/resource
Auth: required (scope: resource:action)
Rate limit: 100/minute
```

**Request schema** — all parameters, query strings, and body fields with types:
```json
{
  "email": "string (required, valid email)",
  "name": "string (required, 1-100 chars)",
  "role": "string (optional, enum: admin|member|viewer, default: member)"
}
```

**Response schema** — success response with all fields:
```json
{
  "id": "uuid",
  "email": "string",
  "name": "string",
  "role": "string",
  "createdAt": "ISO 8601 datetime"
}
```

**Error responses** — every error this endpoint can return.

**HTTP methods and status codes:**

| Method | Success | Semantics |
|--------|---------|-----------|
| GET | 200 | Retrieve resource(s) |
| POST | 201 + Location header | Create resource |
| PATCH | 200 | Partial update |
| DELETE | 204 | Remove resource |

### 3. Error Contract

Define a single, consistent error response structure used by ALL endpoints:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [{ "field": "email", "code": "INVALID_FORMAT", "message": "..." }],
    "requestId": "req_abc123"
  }
}
```

**Error code taxonomy:**
- Authentication: `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`
- Authorization: `FORBIDDEN`, `INSUFFICIENT_PERMISSIONS`, `RESOURCE_NOT_OWNED`
- Validation: `VALIDATION_ERROR`, `INVALID_FORMAT`, `REQUIRED_FIELD`, `OUT_OF_RANGE`, `DUPLICATE_VALUE`
- Resource: `NOT_FOUND`, `ALREADY_EXISTS`, `CONFLICT`, `GONE`
- Business logic: `INVALID_STATE_TRANSITION`, `BUSINESS_RULE_VIOLATION`, `LIMIT_EXCEEDED`
- Server: `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, `UPSTREAM_ERROR`, `TIMEOUT`

For each error code: what triggers it, what the client should do, whether it's transient or permanent.

### 4. Authentication and Authorization

**Per-endpoint auth requirements:**
- Which endpoints require authentication
- Which endpoints require specific roles or permissions
- Resource-level authorization (can user access THIS specific resource?)

**Auth mechanism** (from ADRs):
- Session-based, JWT, OAuth 2.0/OIDC, or API keys
- Token format, expiration, refresh strategy
- Where tokens are sent (Authorization header, cookies)

### 5. Pagination, Filtering, and Sorting

**Every list endpoint must be paginated from day one.** Never return unbounded lists.

**Cursor-based pagination** (preferred):
```
GET /api/v1/orders?first=20&after=cursor_abc123
Response: { data: [...], pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor } }
```

**Offset-based pagination** (if random page access needed):
```
GET /api/v1/orders?page=3&pageSize=20
Response: { data: [...], pagination: { page, pageSize, totalItems, totalPages } }
```

**Filtering**: Consistent syntax, unknown parameters return 400, document which fields are filterable.

**Sorting**: `-createdAt,status` convention (prefix `-` for descending). Document sortable fields and default sort.

### 6. Versioning Strategy

Choose and document:
- URL versioning (`/api/v1/`), header versioning, or evolution without versioning
- Non-breaking changes (no version bump): adding fields, new endpoints, new optional params
- Breaking changes (version bump): removing fields, renaming fields, changing types

### 7. Idempotency

- GET, PUT, DELETE are inherently idempotent
- POST endpoints with side effects must accept an `Idempotency-Key` header
- Document key generation, storage, expiration (24-72 hours), and deduplication behavior

### 8. Rate Limiting

- Define rate limits per endpoint category (public, authenticated, admin)
- Return `429 Too Many Requests` with `Retry-After` header
- Document the rate limiting strategy (per-IP, per-user, per-API-key)

---

## Quality Criteria

- Every domain operation crossing a component boundary has an API endpoint
- Error contracts are explicit — no generic "500 Internal Server Error" only
- Auth requirements specified for every endpoint
- All list endpoints are paginated
- Idempotency documented for all mutating operations
- Versioning strategy documented
- Consistent naming across all endpoints
- Rate limiting defined for all public endpoints

---

## Process

1. **Read all inputs** — Read `docs/system-architecture.md`, `docs/domain-models/`, and `docs/adrs/` completely. Read `docs/user-stories.md` to understand user-facing operations.
2. **Use AskUserQuestionTool** for these decisions:
   - **API style**: REST, GraphQL, or hybrid? (Confirm from ADRs)
   - **Specification depth**: Full OpenAPI-style with examples, or endpoint list with key schemas?
   - **Auth approach**: Confirm authentication mechanism from ADRs
   - **Pagination preference**: Cursor-based or offset-based?
3. **Use subagents** to research API patterns for the project's specific stack and framework
4. **Enumerate all endpoints** — trace every domain operation that crosses a component boundary
5. **Define schemas** — request/response types for every endpoint
6. **Define error contracts** — single error structure, full error code taxonomy
7. **Specify auth, pagination, and rate limiting** per endpoint
8. **Cross-validate** — verify every user story's operations are covered, every domain operation has an endpoint
9. If using Beads: create a task (`bd create "docs: API contracts" -p 0 && bd update <id> --claim`) and close when done (`bd close <id>`)

## After This Step

When this step is complete, tell the user:

---
**Specification phase in progress** — `docs/api-contracts.md` created with endpoint definitions, error contracts, auth requirements, and pagination.

**Next:** Run `/scaffold:ux-spec` — Specify the user experience design, or `/scaffold:database-schema` if not yet done.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
