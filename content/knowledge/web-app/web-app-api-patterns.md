---
name: web-app-api-patterns
description: REST API design for web clients, GraphQL client patterns, error handling strategies, request deduplication, auth injection, and CORS
topics: [web-app, api, rest, graphql, cors, error-handling, auth]
---

The API layer is the seam between frontend and backend. Poor design here manifests as waterfall requests that serialize page loads, inconsistent error shapes that require fragile client-side guessing, auth token handling bugs that cause random 401 errors, and CORS misconfigurations that block legitimate requests. A well-designed API client is boring: it handles auth transparently, errors consistently, and requests efficiently — so product engineers can focus on features rather than network plumbing.

## Summary

### REST API Design for Web Clients

REST conventions for web clients go beyond HTTP verb selection:

**Resource naming:** `/users/{id}/posts` not `/getUserPosts`. Nouns, not verbs. Plural collections.

**Consistent response envelope:** Every response should have a predictable shape. Either always return the resource directly (`200 OK` with the object) or always wrap it (`{ data: {...}, meta: {...} }`) — never mix.

**Status codes must be semantically correct:**
- `200 OK` — successful read
- `201 Created` — successful create (include `Location` header with new resource URL)
- `204 No Content` — successful delete or update with no response body
- `400 Bad Request` — validation failure (include field-level errors)
- `401 Unauthorized` — not authenticated
- `403 Forbidden` — authenticated but not authorized
- `404 Not Found` — resource does not exist
- `409 Conflict` — state conflict (duplicate resource, version mismatch)
- `422 Unprocessable Entity` — business rule violation
- `429 Too Many Requests` — rate limited (include `Retry-After` header)

**Error response shape (standardize on RFC 7807 Problem Details):**
```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Failed",
  "status": 400,
  "detail": "2 fields failed validation",
  "errors": [
    { "field": "email", "message": "Invalid email format" },
    { "field": "username", "message": "Username already taken" }
  ]
}
```

### GraphQL Client Patterns

GraphQL shifts the API design from server-defined endpoints to client-defined data requirements:

**Fragments for co-location:** Define data requirements alongside the component that uses the data. This prevents over-fetching and makes it obvious when a component's data requirements change.

**Normalized caching:** Apollo Client and urql maintain a normalized cache where each entity is stored once (by `__typename + id`) and automatically updated across all queries that reference it. Mutations that return the updated entity automatically update all queries that include that entity.

**Fragment colocation pattern:** Each component defines its own fragment; the parent query composes them. This is the Relay-inspired pattern that scales to large teams.

### Error Handling: Toast vs Inline

Two display patterns for API errors, each appropriate in different contexts:

**Toast notifications:** Background mutations, non-blocking operations, and errors where the user's current context is unchanged. "Failed to save changes — try again." The user doesn't lose their work.

**Inline errors:** Form submissions, operations where the error requires user action to resolve. Show the error adjacent to the field or action that caused it. A `400` validation error must show which fields failed.

**Never show raw API errors to users.** Map error codes to human-readable messages on the client. Log the technical detail to your error tracker.

### Request Deduplication

Multiple components mounting simultaneously and each calling the same endpoint produces redundant parallel requests. Deduplication ensures the second identical in-flight request waits for the first's result rather than issuing a new request.

React Query deduplicates automatically — all components with the same `queryKey` share one in-flight request. For custom fetch layers, implement deduplication with a request-in-flight map.

## Deep Guidance

### API Client with Auth Injection and Token Refresh

```typescript
// api-client.ts — Centralized API client with automatic token refresh
import ky from 'ky';  // Or axios, or native fetch

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

export const apiClient = ky.create({
  prefixUrl: process.env.NEXT_PUBLIC_API_URL,
  hooks: {
    beforeRequest: [
      async (request) => {
        const token = getAccessToken();  // From memory, not localStorage
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      },
    ],
    afterResponse: [
      async (request, options, response) => {
        if (response.status !== 401) return response;

        // Token expired — refresh and retry
        if (isRefreshing) {
          // Queue this request until refresh completes
          return new Promise((resolve) => {
            refreshQueue.push((newToken) => {
              request.headers.set('Authorization', `Bearer ${newToken}`);
              resolve(ky(request));
            });
          });
        }

        isRefreshing = true;
        try {
          const newToken = await refreshAccessToken();
          setAccessToken(newToken);

          // Replay all queued requests with new token
          refreshQueue.forEach(cb => cb(newToken));
          refreshQueue = [];

          // Retry the original request
          request.headers.set('Authorization', `Bearer ${newToken}`);
          return ky(request);
        } catch (refreshError) {
          // Refresh failed — redirect to login
          clearSession();
          window.location.href = '/login';
          throw refreshError;
        } finally {
          isRefreshing = false;
        }
      },
    ],
  },
});
```

The token refresh queue pattern prevents multiple simultaneous 401s from triggering multiple refresh requests. Only the first request initiates the refresh; subsequent requests queue and replay once the token is available.

### CORS Configuration

CORS is a browser-enforced security mechanism, not an API security mechanism. Servers must explicitly allow cross-origin requests from trusted origins.

```typescript
// Express CORS configuration
import cors from 'cors';

const allowedOrigins = [
  'https://app.example.com',
  'https://www.example.com',
  // Development origins — only in non-production
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000'] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS policy`));
  },
  credentials: true,      // Required when client sends cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
  maxAge: 86400,          // Cache preflight for 24 hours (reduces OPTIONS requests)
}));
```

**CORS mistakes to avoid:**
- `origin: '*'` with `credentials: true` is invalid and rejected by browsers
- Wildcard subdomain matching (`*.example.com`) requires explicit pattern matching, not a string
- Missing `maxAge` causes an OPTIONS preflight on every non-simple cross-origin request

### GraphQL Fragment Colocation

```typescript
// UserCard.tsx — Component defines its own data requirements
const USER_CARD_FRAGMENT = gql`
  fragment UserCardFields on User {
    id
    displayName
    avatarUrl
    followerCount
  }
`;

function UserCard({ user }: { user: UserCardFields }) {
  return (/* render using user.displayName, user.avatarUrl, etc. */);
}

UserCard.fragments = { user: USER_CARD_FRAGMENT };

// ProfilePage.tsx — Composes fragments, doesn't know what UserCard needs
const PROFILE_PAGE_QUERY = gql`
  query ProfilePage($userId: ID!) {
    user(id: $userId) {
      ...UserCardFields
      email        # Only ProfilePage needs this
      createdAt
    }
  }
  ${UserCard.fragments.user}
`;
```

When `UserCard` needs a new field, the change is isolated to the fragment and its parent query is automatically updated. No need to modify multiple components or add fields "just in case."

### API Error Handling Pattern

```typescript
// Typed error handling — map API errors to user-facing messages
const API_ERROR_MESSAGES: Record<string, string> = {
  'validation/email-taken': 'That email address is already registered.',
  'auth/session-expired': 'Your session has expired. Please sign in again.',
  'rate-limit/exceeded': 'Too many attempts. Please wait a moment and try again.',
};

function getErrorMessage(error: ApiError): string {
  if (error.type && API_ERROR_MESSAGES[error.type]) {
    return API_ERROR_MESSAGES[error.type];
  }
  // Safe fallback — never expose raw server errors
  return 'Something went wrong. Please try again.';
}
```

Maintain error message strings in one place. Never construct user-facing messages from raw `error.message` strings returned by the server.
