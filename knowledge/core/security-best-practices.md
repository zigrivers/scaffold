---
name: security-best-practices
description: OWASP Top 10, authentication, authorization, data protection, and threat modeling
topics: [security, owasp, authentication, authorization, threat-modeling, secrets-management, dependency-auditing]
---

## OWASP Top 10

The OWASP Top 10 represents the most critical security risks to web applications. Every project should evaluate each risk and implement appropriate mitigations.

### A01: Broken Access Control

Users act outside their intended permissions: accessing other users' data, modifying records they shouldn't, escalating privileges.

**Attack patterns:**
- Modifying URL parameters to access another user's resource (`/api/users/123` -> `/api/users/456`)
- Bypassing access control checks by sending requests directly to the API (skipping frontend checks)
- Privilege escalation by manipulating JWT claims or session data
- Accessing admin endpoints without admin role

**Mitigations:**
- Deny by default: every endpoint requires explicit permission grants
- Verify resource ownership on every request, not just at the UI level
- Use parameterized access control (the user can access records where `owner_id = authenticated_user_id`)
- Server-side enforcement — never rely on client-side checks alone
- Log and alert on access control failures

```typescript
// BAD: Only checks if user is authenticated, not if they own the resource
app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const order = await db.orders.findById(req.params.id);
  res.json(order);
});

// GOOD: Verifies the authenticated user owns the requested resource
app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const order = await db.orders.findById(req.params.id);
  if (!order || order.userId !== req.user.id) {
    return res.status(404).json({ error: { code: 'NOT_FOUND' } });
  }
  res.json(order);
});
```

### A02: Cryptographic Failures

Sensitive data exposed due to weak or missing encryption.

**At-risk data:** Passwords, credit card numbers, health records, personal data, API keys, session tokens.

**Mitigations:**
- Classify data by sensitivity (public, internal, confidential, restricted)
- Encrypt sensitive data at rest (database encryption, encrypted backups)
- Use TLS 1.2+ for all data in transit (HTTPS everywhere, no mixed content)
- Hash passwords with bcrypt, scrypt, or Argon2 (NEVER MD5 or SHA-256 for passwords)
- Don't store sensitive data you don't need — the safest data is data you don't have

### A03: Injection

Untrusted data sent to an interpreter as part of a command or query, causing unintended execution.

**SQL injection:**

```typescript
// BAD: String concatenation — vulnerable
const query = `SELECT * FROM users WHERE email = '${email}'`;

// GOOD: Parameterized query — safe
const query = `SELECT * FROM users WHERE email = $1`;
const result = await db.query(query, [email]);

// GOOD: ORM with parameterized API — safe
const user = await db.users.findFirst({ where: { email } });
```

**NoSQL injection:**

```typescript
// BAD: User input directly in query object
db.users.find({ email: req.body.email, password: req.body.password });
// Attacker sends: { "password": { "$ne": "" } } — bypasses password check

// GOOD: Validate and sanitize input types before use
const email = String(req.body.email);
const passwordHash = await hash(String(req.body.password));
db.users.find({ email, passwordHash });
```

**Command injection:**

```typescript
// BAD: User input in shell command
exec(`convert ${userFilename} output.png`);

// GOOD: Use library APIs instead of shell commands
sharp(userFilePath).toFile('output.png');
```

**Prevention rules:**
- Use parameterized queries for all database access
- Use ORM/query builders that parameterize automatically
- Validate and sanitize all user input at the boundary
- Never construct shell commands from user input

### A04: Insecure Design

Security flaws from missing or ineffective control design, as opposed to implementation bugs. These are architectural problems.

**Examples:**
- Password reset via security questions (attackable)
- No rate limiting on login endpoint (brute force possible)
- No account lockout policy (unlimited password attempts)
- Returning different error messages for "user not found" vs. "wrong password" (user enumeration)

**Mitigations:**
- Threat model during design phase, not after implementation
- Use established security patterns (don't invent custom auth)
- Rate limit all authentication endpoints
- Return generic error messages for auth failures ("Invalid credentials" for both wrong email and wrong password)
- Require MFA for sensitive operations

### A05: Security Misconfiguration

Default credentials, unnecessary features enabled, verbose error messages, missing security headers.

**Common misconfigurations:**
- Debug mode enabled in production (stack traces exposed)
- Default database passwords unchanged
- Directory listing enabled on web server
- Unnecessary HTTP methods enabled (TRACE, OPTIONS returning too much)
- Missing security headers (CSP, X-Frame-Options, X-Content-Type-Options)

**Mitigations:**
- Hardened configuration for each environment (dev uses relaxed settings; production uses strict settings)
- Remove default accounts and sample data before deployment
- Disable stack traces and verbose error messages in production
- Set security headers on all responses:

```
Content-Security-Policy: default-src 'self'; script-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### A06: Vulnerable and Outdated Components

Using libraries with known vulnerabilities.

**Mitigations:**
- Run dependency audit on every CI build (`npm audit`, `pip audit`, `cargo audit`)
- Subscribe to security advisories for critical dependencies
- Update dependencies regularly (weekly for patch versions, monthly for minor)
- Pin dependency versions (use lockfiles: `package-lock.json`, `poetry.lock`)
- Remove unused dependencies
- Prefer dependencies with active maintenance and security response processes

### A07: Identification and Authentication Failures

Broken authentication mechanisms that allow attackers to assume identities.

**Common failures:**
- Permitting weak passwords ("123456", "password")
- Storing passwords in plaintext or with reversible encryption
- Missing brute-force protection
- Session tokens in URLs (exposed in logs and browser history)
- Session not invalidated after logout or password change

**Mitigations:**
- Enforce password complexity requirements (minimum 8 characters, no common passwords list)
- Hash passwords with Argon2id, bcrypt (cost factor 12+), or scrypt
- Rate limit login attempts (5 failures per minute per IP and per account)
- Implement account lockout (lock after 10 consecutive failures, unlock after 30 minutes)
- Invalidate all sessions when password changes
- Use secure, HttpOnly, SameSite cookies for session tokens
- Implement MFA for sensitive applications

### A08: Software and Data Integrity Failures

Code and infrastructure that doesn't verify integrity: unverified CI/CD pipelines, auto-updated dependencies, unsigned software.

**Mitigations:**
- Verify dependency integrity (lockfile checksums)
- Use signed commits for critical code paths
- Review CI/CD pipeline configuration changes with the same rigor as application code
- Don't auto-merge dependency updates without CI verification
- Use Subresource Integrity (SRI) for CDN-loaded scripts

### A09: Security Logging and Monitoring Failures

Insufficient logging to detect, investigate, or alert on attacks.

**What to log:**
- All authentication attempts (success and failure, with IP and user agent)
- Authorization failures (user tried to access something they shouldn't)
- Input validation failures (potential injection attempts)
- Changes to user permissions or roles
- Administrative actions (user creation, role changes, config changes)
- Application errors (5xx responses with context)

**What NEVER to log:**
- Passwords (even failed ones — they might be the correct password for a different account)
- Session tokens, API keys, or JWT tokens
- Credit card numbers, SSNs, or other PII
- Full request bodies of sensitive endpoints (login, payment)

**Log format:** Use structured logging (JSON) with correlation IDs for request tracing. Include timestamp, severity, source, action, actor, target, and result.

### A10: Server-Side Request Forgery (SSRF)

The application fetches a URL provided by the user, allowing the attacker to make requests from the server's network position (accessing internal services, cloud metadata endpoints).

**Mitigations:**
- Validate and whitelist allowed URL schemes (only `https://`)
- Block requests to internal IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x, localhost)
- Block requests to cloud metadata endpoints (169.254.169.254)
- Use a URL parser to normalize and validate before fetching
- Run URL-fetching services in an isolated network segment

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
