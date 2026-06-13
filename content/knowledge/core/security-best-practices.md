---
name: security-best-practices
description: OWASP Top 10, authentication, authorization, data protection, and threat modeling
topics:
  - security
  - owasp
  - authentication
  - authorization
  - threat-modeling
  - secrets-management
  - dependency-auditing
volatility: fast-moving
last-reviewed: null
version-pin: OWASP Top 10 2021
sources:
  - url: https://owasp.org/Top10/
    anchor: '#top-10-list'
    hash: sha256:cf318bf6e49239cd034bdfcdf41ca87eab4036c34f8991be2d2a24e52647a12b
    retrieved: 2026-06-13
---

## Summary

## OWASP Top 10

The OWASP Top 10 represents the most critical security risks to web applications. Every project should evaluate each risk and implement appropriate mitigations. The current edition is the OWASP Top 10:2025, which supersedes the 2021 edition. The 2025 edition introduces a new structure with categories that reflect modern application security challenges. See the [OWASP Top 10:2025](https://owasp.org/Top10/2025/en/) for the full list.

## Deep Guidance

Detailed guidance for each category in the OWASP Top 10:2025 edition is forthcoming. Refer to the [OWASP Top 10:2025](https://owasp.org/Top10/2025/en/) for the authoritative list of categories and their descriptions.

## Authentication Patterns

### Session-Based Authentication

**How it works:**
1. User submits credentials
2. Server validates credentials, creates a session record (in database or Redis)
3. Server sends a session ID in a Set-Cookie header (HttpOnly, Secure, SameSite)
4. Browser automatically sends the cookie on subsequent requests
5. Server looks up the session record to identify the user

**When to use:** Server-rendered web applications, applications where the backend controls the frontend.

**Security requirements:**
- Session IDs must be cryptographically random (128+ bits of entropy)
- Store sessions server-side (never trust session data stored client-side)
- Set cookie flags: `HttpOnly` (no JavaScript access), `Secure` (HTTPS only), `SameSite=Lax` or `Strict` (CSRF protection)
- Rotate session ID after login (prevent session fixation)
- Set session expiration (absolute timeout: 24 hours, idle timeout: 30 minutes)
- Invalidate sessions on logout, password change, and privilege change

### JWT Authentication

**How it works:**
1. User submits credentials
2. Server validates credentials, generates a signed JWT containing claims (user ID, roles, expiration)
3. Server returns the JWT in the response body
4. Client stores the JWT (typically in memory, NOT in localStorage)
5. Client sends the JWT in the `Authorization: Bearer <token>` header on each request
6. Server validates the JWT signature and extracts claims

**When to use:** API-first applications, SPAs, mobile apps, microservices where session sharing is impractical.

**Security requirements:**
- Sign with a strong algorithm (RS256 or ES256, not HS256 with a weak secret)
- Set short expiration (15-60 minutes)
- Use refresh tokens (stored HttpOnly cookie) for re-authentication
- Never store JWTs in localStorage (XSS-accessible) — use HttpOnly cookies or in-memory only
- Include only necessary claims (don't put sensitive data in the payload — it's base64, not encrypted)
- Validate the token on every request (signature, expiration, issuer, audience)

### Multi-Factor Authentication (MFA)

Add MFA for any application that handles sensitive data, financial transactions, or administrative actions.

**Implementation options:**
- TOTP (Time-based One-Time Password) via authenticator apps (Google Authenticator, Authy)
- WebAuthn / FIDO2 hardware keys (strongest, best UX)
- SMS codes (weakest — vulnerable to SIM swapping, but better than nothing)
- Email codes (moderate — depends on email security)

**Recovery:** Always provide recovery codes (one-time use) in case the user loses their MFA device.

## Authorization Patterns

### Role-Based Access Control (RBAC)

Users are assigned roles. Roles have permissions. Authorization checks whether the user's role has the required permission.

```
User: alice@example.com
  Role: admin
    Permissions: users:read, users:write, users:delete, orders:read, orders:write

User: bob@example.com
  Role: member
    Permissions: orders:read, orders:write (own orders only)
```

**Best for:** Most applications. Simple to implement, easy to understand, covers 80% of authorization needs.

### Attribute-Based Access Control (ABAC)

Authorization decisions based on attributes of the user, the resource, and the context.

**Example policy:**
- User can read a document if: user.department == document.department AND document.classification <= user.clearanceLevel
- User can modify a resource if: user.id == resource.ownerId OR user.role == 'admin'

**Best for:** Complex authorization requirements that RBAC can't express cleanly (multi-tenancy, data classification, time-based access).

### Resource-Level Permissions

Authorization checks that verify the user can access a specific resource instance, not just the resource type.

```typescript
// Type-level: "Can this user access orders?" — Role check
// Instance-level: "Can this user access THIS order?" — Ownership check

async function authorizeOrderAccess(userId: string, orderId: string): boolean {
  const order = await db.orders.findById(orderId);
  return order && (order.userId === userId || await isAdmin(userId));
}
```

Always implement instance-level checks for user-owned resources. Type-level checks alone allow users to access each other's data.

## Data Protection

### Encryption at Rest

Sensitive data stored in databases, files, or backups should be encrypted:

- **Database-level encryption:** Transparent Data Encryption (TDE) encrypts the entire database. No application changes needed. Protects against physical storage theft.
- **Column-level encryption:** Encrypt specific sensitive columns (SSN, credit card). Application decrypts as needed. More granular control.
- **Backup encryption:** All database backups and file exports must be encrypted. An unencrypted backup negates database encryption.

### Encryption in Transit

All network communication should use TLS:

- **HTTPS everywhere:** No HTTP endpoints, no mixed content
- **TLS version:** 1.2 minimum, 1.3 preferred
- **HSTS header:** Force HTTPS for all future requests: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- **Internal services:** Use TLS for service-to-service communication too, not just client-facing

### PII Handling

Personally Identifiable Information requires special handling:

- **Inventory:** Know what PII you store and where (data mapping exercise)
- **Minimization:** Don't collect PII you don't need
- **Retention:** Define how long you keep PII and what triggers deletion
- **Access logging:** Log who accessed PII and when
- **Right to deletion:** Implement user data deletion (GDPR Article 17, CCPA)
- **Pseudonymization:** Replace identifying data with pseudonyms where full PII isn't needed

### Data Classification

Classify all data by sensitivity:

| Level | Examples | Controls |
|-------|---------|----------|
| Public | Marketing content, public API docs | No restrictions |
| Internal | Internal metrics, non-PII user data | Authentication required |
| Confidential | PII, financial data, health data | Encryption, access logging, retention policy |
| Restricted | Passwords, encryption keys, API secrets | Encryption, strict access control, rotation |

## Secrets Management

### Environment Variables

The simplest secrets management: store secrets in environment variables, never in code.

**Rules:**
- Never commit secrets to git (use `.gitignore` for `.env` files)
- Never log secrets (redact in logging middleware)
- Never pass secrets in URLs (URLs appear in logs, browser history, Referer headers)
- Use `.env.example` with placeholder values as a template

### Vault Systems

For production environments, use a dedicated secrets manager:

- **Cloud-native:** AWS Secrets Manager, Google Secret Manager, Azure Key Vault
- **Self-hosted:** HashiCorp Vault, Infisical, Doppler

**Benefits over environment variables:**
- Access control and audit logging
- Automatic rotation
- Dynamic secrets (database credentials generated on demand)
- Encryption at rest and in transit

### Key Rotation

Secrets should be rotatable without downtime:

- **JWT signing keys:** Support multiple active keys. Add new key, start signing with it, keep old key for validation during transition, remove old key after all tokens expire.
- **API keys:** Issue new key, update consumers, revoke old key.
- **Database passwords:** Update the secret store, restart application (zero-downtime if using connection pool draining).
- **Encryption keys:** Re-encrypt data with new key during a migration. Support decrypting with both old and new keys during transition.

### Never Commit Secrets

Prevent accidental secret commits:

- Add `.env`, `*.pem`, `*.key` to `.gitignore`
- Use pre-commit hooks to scan for secrets (git-secrets, detect-secrets, gitleaks)
- Run secret scanning in CI (GitHub secret scanning, TruffleHog)
- If a secret is committed: rotate it immediately (assume it's compromised), remove from history with `git filter-branch` or BFG Repo Cleaner

## Threat Modeling

### STRIDE Model

Analyze threats using the STRIDE categories:

| Category | Threat | Example | Mitigation |
|----------|--------|---------|------------|
| **S**poofing | Attacker impersonates a user | Stolen credentials | MFA, strong password policy |
| **T**ampering | Attacker modifies data | Man-in-the-middle attack | TLS, input validation, integrity checks |
| **R**epudiation | User denies performing an action | "I didn't delete that" | Audit logging, non-repudiation |
| **I**nformation Disclosure | Sensitive data exposed | Database dump leaked | Encryption, access control, data classification |
| **D**enial of Service | Service made unavailable | DDoS attack | Rate limiting, CDN, auto-scaling |
| **E**levation of Privilege | User gains unauthorized access | SQL injection to admin | Input validation, principle of least privilege |

### Attack Surface Analysis

Enumerate all entry points where attackers can interact with the system:

- **Network:** HTTP endpoints, WebSocket connections, database ports
- **Data inputs:** Form fields, URL parameters, headers, file uploads, API request bodies
- **Authentication:** Login page, password reset, API key endpoints, OAuth callbacks
- **Infrastructure:** Admin panels, monitoring endpoints, health checks, CI/CD webhooks

For each entry point, assess: what could an attacker do? What data could they access? What operations could they trigger?

### Trust Boundaries

Identify where trust levels change:

- **Browser to server:** User input is untrusted. Validate everything.
- **Server to database:** Application code is trusted. Database constraints are the last line of defense.
- **Server to external API:** External API responses are partially trusted. Validate response shapes.
- **Internal service to internal service:** Trust level depends on network isolation. In a shared network, verify identity.

### Data Flow Analysis for Threats

Trace sensitive data through the system and identify exposure points:

```
User enters password
  -> HTTPS to API server (encrypted in transit: OK)
    -> Validation middleware (password in memory: OK, brief)
      -> Auth service (hashed with bcrypt: OK)
        -> Database (stored as hash: OK)
          -> Backup system (encrypted backup: OK)
        -> Log system (THREAT: is password logged? Must not be!)
```

For each sensitive data flow, verify:
- Is it encrypted in transit?
- Is it encrypted at rest?
- Who can access it? (Users, admins, services, backup systems, log systems)
- How long is it retained?
- How is it deleted?

## Dependency Auditing

### Known Vulnerability Scanning

Run automated vulnerability scanning on every CI build:

```bash
# Node.js
npm audit --audit-level=high

# Python
pip audit

# Go
govulncheck ./...

# Rust
cargo audit
```

**Policy:**
- **Critical vulnerabilities:** Block merge. Fix immediately.
- **High vulnerabilities:** Block merge. Fix within 24 hours.
- **Medium vulnerabilities:** Warning. Fix within one sprint.
- **Low vulnerabilities:** Track. Fix when convenient.

### License Compliance

Verify that dependency licenses permit your intended use:

**Generally safe:** MIT, Apache 2.0, BSD, ISC

**Requires attention:** LGPL (linking restrictions), MPL (file-level copyleft)

**Potentially problematic:** GPL (copyleft — entire project must be GPL), AGPL (network use triggers copyleft), SSPL (commercial use restrictions)

**No license:** Treat as all rights reserved — do not use without explicit permission.

### Supply Chain Security

Protect against compromised dependencies:

- **Lockfiles:** Always commit lockfiles. They pin exact versions and include integrity hashes.
- **Verify checksums:** `npm ci` (not `npm install`) verifies against lockfile checksums.
- **Review dependency changes:** When updating, check the changelog and diff for unexpected changes.
- **Minimize dependencies:** Fewer dependencies mean less attack surface. Consider whether you really need that utility library.
- **Monitor for compromised packages:** Subscribe to security advisories for critical dependencies. Watch for maintainer account takeovers.

## Common Pitfalls

**Authentication as afterthought.** Building all endpoints without auth, then adding it at the end. This leaves forgotten endpoints unprotected and creates inconsistent auth patterns. Fix: design auth requirements for every endpoint during API design. Implement auth middleware before any endpoint handlers.

**Overly permissive defaults.** Default user role has admin access, default CORS allows all origins, default rate limits are too generous. Fix: deny by default. Each permission must be explicitly granted. CORS allows specific origins only. Rate limits start conservative and are relaxed based on monitoring.

**Missing input validation at boundaries.** Trusting that the frontend validates input, so the backend skips validation. Fix: validate at every trust boundary. Frontend validation is a UX convenience; backend validation is a security requirement.

**Logging sensitive data.** Request logging that includes passwords, tokens, or PII in the log files. Fix: implement a logging middleware that redacts sensitive fields before logging. Test that redaction works.

**Storing secrets in git.** An API key committed in the first commit, now buried in git history. Fix: use git-secrets or gitleaks in pre-commit hooks. If a secret is committed, rotate it immediately — removing it from git history is not sufficient because it may have been cloned.

**Relying on security through obscurity.** "Nobody will find the admin endpoint at /api/sekrit-admin." Fix: assume attackers will find every endpoint. Every endpoint must have proper authentication and authorization regardless of its discoverability.

**No rate limiting.** Login endpoints with unlimited attempts allow brute-force password attacks. API endpoints with no rate limits allow denial of service. Fix: implement rate limiting on all public endpoints. Start with conservative limits. Use exponential backoff for authentication failures.

**Ignoring dependency vulnerabilities.** Running `npm audit` shows 47 vulnerabilities but nobody addresses them because "they're all low severity." Fix: set a policy and enforce it in CI. Critical and high vulnerabilities block deployment. Medium vulnerabilities have a SLA for resolution.

## See Also

- [operations-runbook](../core/operations-runbook.md) — Logging and monitoring sensitive data
