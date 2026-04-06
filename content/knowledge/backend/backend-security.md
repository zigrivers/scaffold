---
name: backend-security
description: Input validation, SQL injection prevention, rate limiting, OWASP API Security Top 10, secrets management, and dependency auditing
topics: [backend, security, validation, sql-injection, rate-limiting, owasp, secrets]
---

Security vulnerabilities in backend services are disproportionately expensive to fix after launch — building in input validation, injection prevention, rate limiting, and secrets hygiene from the start is always cheaper than retrofitting them under pressure after a breach.

## Summary

### Input Validation

Validate all input at every trust boundary using a schema library — Zod (TypeScript), Joi (Node.js), Pydantic (Python), or similar. Never trust data from clients, webhooks, or upstream services without validation.

**Validation layers:**
- **Type and shape:** Reject requests that don't match the expected schema before any business logic runs.
- **Range and format:** Validate string lengths, numeric ranges, enum membership, date formats, regex patterns.
- **Business constraints:** Validate cross-field invariants and domain rules (e.g., `endDate > startDate`).

Parse, don't sanitize. Return explicit error messages that identify which field failed and why — this helps legitimate callers but doesn't expose internals. Strip unknown fields (`stripUnknown: true` in Joi, `.strict()` in Zod) to prevent mass-assignment vulnerabilities.

### SQL Injection Prevention

Use parameterized queries for all database access — no exceptions.

```typescript
// BAD: string interpolation is vulnerable
db.query(`SELECT * FROM users WHERE email = '${email}'`);

// GOOD: parameterized
db.query('SELECT * FROM users WHERE email = $1', [email]);

// GOOD: ORM (Prisma, Drizzle) parameterizes automatically
db.users.findFirst({ where: { email } });
```

Never build dynamic SQL from user input. If dynamic column names or table names are required, validate them against a strict allowlist before interpolation. Apply the same rules to NoSQL queries — validate that operator keys like `$where`, `$gt`, and `$ne` cannot be injected by user-controlled input.

### Rate Limiting

**Token bucket:** Smooth bursty traffic. Each caller has a bucket that refills at a fixed rate. Supports short bursts while enforcing a sustained rate. Appropriate for general API endpoints.

**Sliding window:** Count requests in a rolling time window (e.g., 100 requests per 60 seconds). More precise than fixed-window, no edge-case spikes at window boundaries. Use Redis sorted sets or a purpose-built library (rate-limiter-flexible, upstash/ratelimit).

**Limits by layer:**
- IP-level limits to prevent anonymous abuse.
- User/API-key level limits for authenticated callers.
- Endpoint-specific limits for expensive operations (search, export, auth).

Return `429 Too Many Requests` with a `Retry-After` header and `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers. Log rate-limit hits for abuse monitoring.

### OWASP API Security Top 10

The OWASP API Security project identifies the most critical API-specific risks. The top concerns for backend APIs:

- **API1 — Broken Object Level Authorization:** Verify ownership on every resource access. An authenticated user must not be able to access another user's records by changing an ID in the URL.
- **API2 — Broken Authentication:** Use short-lived tokens, enforce MFA for sensitive operations, rate-limit auth endpoints.
- **API3 — Broken Object Property Level Authorization:** On PATCH/PUT, validate that the caller is allowed to modify each field. Reject attempts to write admin-only fields.
- **API4 — Unrestricted Resource Consumption:** Enforce pagination limits, maximum query sizes, file upload limits, and request body size limits.
- **API5 — Broken Function Level Authorization:** Admin and internal endpoints must require role checks, not just authentication.
- **API8 — Security Misconfiguration:** Disable debug endpoints in production, apply security headers, restrict CORS to known origins.

## Deep Guidance

### Secrets Management

Never hardcode secrets in source code. Store secrets in environment variables for simple deployments, and a vault system (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager) for production.

**Rules:**
- Add `.env` to `.gitignore`. Commit `.env.example` with placeholder values.
- Run secret-scanning in CI (gitleaks, truffleHog, GitHub secret scanning).
- Install pre-commit hooks (git-secrets, detect-secrets) to block accidental commits.
- If a secret is committed, rotate it immediately — git history removal is not sufficient because the repo may have been cloned.
- Never log secrets. Implement logging middleware that redacts known-sensitive field names.

### Dependency Auditing

Run `npm audit --audit-level=high` (or equivalent) on every CI build. Block merges on critical and high vulnerabilities. Keep a policy: critical fixes same day, high within 24 hours, medium within a sprint.

Use lockfiles (`package-lock.json`, `poetry.lock`) and `npm ci` (not `npm install`) to verify checksums. Pin indirect dependencies that have a history of supply-chain incidents. Subscribe to GitHub security advisories for critical dependencies. Periodically run `npm outdated` and schedule dedicated update sprints rather than letting packages fall behind by major versions.
