---
name: backend-api-design
description: REST maturity levels, GraphQL schema-first design, gRPC protobuf conventions, tRPC router patterns, API versioning strategies, pagination, and filtering
topics: [backend, api-design, rest, graphql, grpc, trpc, versioning, pagination]
---

API design is a long-lived contract. Every structural decision — URL shape, error format, pagination scheme, versioning strategy — is expensive to change after consumers depend on it. Design APIs from the consumer's perspective first. The best API is one where new developers can predict the shape of an endpoint they have never seen before, because every other endpoint follows the same patterns.

## Summary

REST, GraphQL, gRPC, and tRPC each solve different problems. REST (Level 2 Richardson Maturity) is the default for most public APIs — use HTTP verbs correctly, plural nouns for collections, and nested paths for containment. GraphQL suits complex, multi-entity queries with schema-first design. gRPC is the standard for high-performance internal service-to-service calls. tRPC provides end-to-end type safety for TypeScript monorepos.

API versioning, pagination, and filtering are long-lived contracts. URL path versioning is preferred for public APIs. Cursor-based pagination is the correct choice for any list that may grow large. All filter parameters must be validated against a schema before reaching the data layer.

## Deep Guidance

### REST Maturity Levels (Richardson Model)

The Richardson Maturity Model is a pragmatic rubric, not a goal to maximize:

- **Level 0**: Single endpoint, all operations via POST. Avoid — not REST.
- **Level 1**: Separate resources at different URLs. Basic REST. Sufficient for many internal APIs.
- **Level 2**: HTTP verbs used correctly (GET reads, POST creates, PUT/PATCH updates, DELETE removes). Standard REST. The target for most APIs.
- **Level 3 (HATEOAS)**: Responses include hypermedia links describing available actions. Rarely justified in practice — adds response payload complexity and client coupling to URL structure. Only implement if clients genuinely traverse links without prior URL knowledge.

Target Level 2 for REST APIs. Do not chase Level 3 as an ideological goal.

**REST URL conventions**: Use plural nouns for collections (`/orders`), singular for specific resources (`/orders/{id}`), nested paths for containment (`/orders/{id}/items`), and action-oriented sub-resources for operations (`/orders/{id}/cancel`). Avoid verbs in URL paths.

### GraphQL Schema-First Design

Write the schema before writing resolvers. The schema is the API contract:

- **Schema-first**: Define types, queries, mutations, and subscriptions in the SDL (Schema Definition Language) before any implementation. Generate types and resolver stubs from the schema.
- **Single responsibility**: Each resolver does one thing. Business logic belongs in a service layer called by the resolver, not inside the resolver function.
- **N+1 problem**: Every GraphQL API must address the N+1 query problem. Use DataLoader to batch and deduplicate database calls per request. An un-addressed N+1 in production is a performance crisis at scale.
- **Pagination**: Use cursor-based pagination (Relay Connection spec) for any collection that may exceed 100 items. Offset pagination degrades at scale and produces incorrect results under concurrent inserts/deletes.
- **Schema directives**: Use directives for cross-cutting concerns — `@auth`, `@deprecated`, `@rateLimit` — rather than duplicating logic in each resolver.

### gRPC and Protobuf Conventions

gRPC is the standard for high-performance internal service-to-service communication:

- **Protobuf schema-first**: Define `.proto` files before any implementation. Store them in a shared repository or a dedicated `proto/` directory. Generate client and server stubs from the proto at build time.
- **Naming**: Service names in `PascalCase`, RPC methods in `PascalCase`, message fields in `snake_case`. Follow the official Google API style guide for proto naming.
- **Field numbering**: Never reuse a field number once it has been in production, even after the field is removed. Removing a field requires marking it `reserved`. Changing a field type is a breaking change.
- **Streaming**: Use server-streaming for large result sets, bidirectional streaming for real-time updates, and unary calls for everything else. Don't over-use streaming — it complicates error handling and testing.

### tRPC Router Patterns

tRPC provides end-to-end type safety for TypeScript monorepos without a schema definition step:

- **Procedure organization**: Group procedures into routers by domain (`appRouter.orders.create`, `appRouter.users.findById`). Each domain router lives in its own file.
- **Input validation**: Every procedure must validate its input with a Zod schema. This is both a type contract and a runtime guard.
- **Context**: Pass request-scoped data (authenticated user, database connection, logger) via the context object — never as procedure parameters.
- **Middleware**: Apply authentication, rate limiting, and logging via tRPC middleware (`.use()`), not inside individual procedures.

### API Versioning Strategies

- **URL path versioning** (`/api/v1/`, `/api/v2/`): Most discoverable, easy to proxy and document. Preferred for public APIs. The version lives in the path, not just in headers.
- **Header versioning** (`Accept: application/vnd.myapi.v2+json`): Cleaner URLs, harder to test in a browser. Preferred when URL cleanliness is a hard requirement.
- **Query parameter** (`?v=2`): Easy to add but pollutes request URLs and caching keys.
- **Sunset headers**: For deprecated versions, return `Sunset: Sat, 1 Jan 2025 00:00:00 GMT` and `Deprecation: true` headers on every response. Clients can detect imminent removal programmatically.

### Pagination

- **Cursor-based**: Use for any list that may grow large. Return a `cursor` (opaque string encoding the last item's sort key) in the response. The client passes `?after=<cursor>` for the next page. Stable under concurrent writes. Efficient at any offset depth.
- **Offset-based** (`?page=3&limit=25`): Simple to implement. Acceptable for small, stable datasets. Degrades at large offsets (database must skip rows) and produces duplicates/gaps under concurrent mutations.
- **Standard response envelope**: Every paginated list response should include `data: []`, `nextCursor` (or `nextPage`), and `total` (when computationally cheap).

### Filtering and Sorting

- Expose filtering via query parameters: `?status=active&createdAfter=2024-01-01`.
- Expose sorting via `?sort=createdAt:desc` or `?sortBy=createdAt&order=desc`.
- Validate all filter parameters against a schema before passing to the data layer. Never interpolate raw query parameters into SQL — use parameterized queries unconditionally.
- Limit the surface area of filterable/sortable fields to those backed by indexes. Undocumented table scans at scale are a reliability incident.

### Error Response Standards

Standardize error responses across all API styles:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      { "field": "email", "issue": "must be a valid email address" }
    ],
    "requestId": "req_abc123"
  }
}
```

Include a machine-readable `code` field that consumers can switch on without string-matching human-readable messages. Include the `requestId` in every error response to enable correlation with server-side logs.

### API Design Review Checklist

Before shipping any new endpoint: Does the URL follow the naming convention? Are all error responses structured with an error code? Is the success response envelope consistent with existing endpoints? Is pagination implemented for list endpoints? Are inputs validated with a schema? Is the endpoint documented in OpenAPI / GraphQL schema / proto? Are breaking changes versioned?

### Rate Limiting Headers

Every API should communicate rate limit state to callers via response headers. Include `X-RateLimit-Limit` (maximum requests per window), `X-RateLimit-Remaining` (requests left in current window), and `X-RateLimit-Reset` (UTC epoch seconds when the window resets). When the limit is exceeded, return `429 Too Many Requests` with a `Retry-After` header specifying seconds until the caller may retry. This enables well-behaved clients to self-throttle without guessing.
