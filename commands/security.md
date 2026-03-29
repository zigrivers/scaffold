---
description: "Conduct security review with threat modeling, OWASP analysis, and auth patterns"
long-description: "Reads system architecture and API contracts, then creates docs/security-review.md covering OWASP Top 10 analysis, threat modeling (STRIDE), authentication/authorization patterns, data protection, secrets management, and dependency auditing."
---

Read `docs/system-architecture.md`, `docs/api-contracts.md`, `docs/database-schema.md`, and `docs/operations-runbook.md`, then conduct a security review of the entire system design. Create `docs/security-review.md` documenting security controls, threat model, auth/authz approach, data protection, and secrets management.

> **Note:** This command produces full-depth output. For lighter execution at a specific methodology depth, use the pipeline engine with presets.

> **Prerequisites:** Run `review-operations` first.

## Mode Detection

Before starting, check if `docs/security-review.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists -> UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:security v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing sections against what this prompt would produce fresh. Categorize:
   - **ADD** — Threat categories or controls missing from existing review
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure
   - **PRESERVE** — Project-specific threat assessments, custom security controls, compliance decisions
3. **Cross-doc consistency**: Read related docs and verify security controls align with current architecture and API contracts.
4. **Preview changes**: Present the user a summary table. Wait for approval before proceeding.
5. **Execute update**: Update review, respecting preserve rules.
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:security v<ver> <date> -->`
7. **Post-update summary**: Report sections added, restructured, preserved, and cross-doc issues.

**In both modes**, follow all instructions below.

### Update Mode Specifics
- **Primary output**: `docs/security-review.md`
- **Preserve**: Project-specific threat assessments, compliance requirements, custom security headers, rate limit decisions, data classification with custom handling rules
- **Related docs**: `docs/system-architecture.md`, `docs/api-contracts.md`, `docs/database-schema.md`, `docs/operations-runbook.md`
- **Special rules**: Never downgrade a security control without explicit user approval. Preserve compliance-related decisions.

---

## What the Document Must Cover

### 1. OWASP Top 10 Analysis

For each OWASP category, assess the specific risk to THIS project and define mitigations:

**A01: Broken Access Control**
- Enumerate all endpoints that serve user-specific data
- Verify resource-level authorization (not just role checks)
- Deny by default: every endpoint requires explicit permission
- Server-side enforcement — never rely on client-side checks

**A02: Cryptographic Failures**
- Classify data by sensitivity (public, internal, confidential, restricted)
- Encryption at rest for sensitive data, TLS 1.2+ for all data in transit
- Password hashing: bcrypt (cost 12+), scrypt, or Argon2id — NEVER MD5/SHA-256
- Don't store sensitive data you don't need

**A03: Injection**
- Parameterized queries for all database access (never string concatenation)
- ORM/query builders that parameterize automatically
- Input validation and sanitization at every trust boundary
- Never construct shell commands from user input

**A04: Insecure Design**
- Rate limiting on all authentication endpoints
- Generic error messages for auth failures (no user enumeration)
- Account lockout policy
- Threat modeling during design, not after implementation

**A05: Security Misconfiguration**
- No debug mode in production
- Security headers on all responses (CSP, X-Frame-Options, HSTS, etc.)
- Remove default accounts and sample data before deployment
- Hardened configuration per environment

**A06: Vulnerable Components**
- Dependency audit on every CI build (`npm audit`, `pip audit`, etc.)
- Policy: Critical/High block merge, Medium fix within sprint, Low track
- Pin versions via lockfiles
- Remove unused dependencies

**A07: Authentication Failures**
- Password complexity requirements (minimum 8 chars, no common passwords)
- Rate limit login attempts (5/min per IP and account)
- Account lockout (10 consecutive failures, 30-min unlock)
- Secure cookies: HttpOnly, Secure, SameSite
- Session invalidation on password change

**A08: Integrity Failures**
- Lockfile checksums verified in CI
- CI/CD config changes reviewed with same rigor as app code
- Subresource Integrity for CDN scripts

**A09: Logging and Monitoring Failures**
- Log: auth attempts, authz failures, validation failures, permission changes, admin actions
- NEVER log: passwords, tokens, API keys, PII, credit cards
- Structured JSON logging with correlation IDs

**A10: SSRF**
- Validate and whitelist URL schemes
- Block internal IP ranges and cloud metadata endpoints
- Use URL parser to normalize before fetching

### 2. Authentication Design

**For the chosen auth mechanism** (from ADRs), specify:

**Session-based:**
- Cryptographically random session IDs (128+ bits)
- Server-side session storage
- Cookie flags: HttpOnly, Secure, SameSite=Lax/Strict
- Session rotation after login
- Expiration: absolute (24h) and idle (30min)

**JWT:**
- Strong algorithm (RS256 or ES256, not HS256 with weak secret)
- Short expiration (15-60 min)
- Refresh tokens in HttpOnly cookies
- Never store in localStorage (XSS-accessible)
- Validate signature, expiration, issuer, audience on every request

**MFA** — required for sensitive applications:
- TOTP via authenticator apps, WebAuthn/FIDO2, or SMS (weakest)
- Recovery codes (one-time use) for lost devices

### 3. Authorization Patterns

- **RBAC**: Roles with permissions. Simple, covers 80% of needs.
- **ABAC**: Attribute-based decisions for complex rules (multi-tenancy, data classification).
- **Resource-level**: Instance-level ownership checks on every request, not just type-level role checks.
- Per-endpoint permission matrix matching API contracts.

### 4. Data Protection

**Data classification matrix:**

| Level | Examples | Controls |
|-------|---------|----------|
| Public | Marketing, docs | No restrictions |
| Internal | Metrics, non-PII | Authentication required |
| Confidential | PII, financial | Encryption, access logging, retention |
| Restricted | Passwords, keys | Encryption, strict ACL, rotation |

**Encryption**: At rest (database, backups) and in transit (TLS everywhere, including internal).

**PII handling**: Inventory, minimization, retention policy, access logging, right to deletion (GDPR/CCPA).

### 5. Secrets Management

- Environment variables for secrets, never in code
- `.env` gitignored, `.env.example` committed with placeholders
- Never log secrets (redact in logging middleware)
- Never pass secrets in URLs
- Pre-commit hooks to scan for accidental secret commits (git-secrets, gitleaks)
- Production: dedicated secrets manager (AWS Secrets Manager, Vault, etc.)
- Key rotation plan without downtime (support multiple active keys during transition)

### 6. Threat Model (STRIDE)

| Category | Threat | Project-Specific Example | Mitigation |
|----------|--------|--------------------------|------------|
| Spoofing | Impersonation | (project-specific) | MFA, strong passwords |
| Tampering | Data modification | (project-specific) | TLS, input validation |
| Repudiation | Denied actions | (project-specific) | Audit logging |
| Info Disclosure | Data exposure | (project-specific) | Encryption, ACL |
| Denial of Service | Unavailability | (project-specific) | Rate limiting, CDN |
| Elevation of Privilege | Unauthorized access | (project-specific) | Input validation, least privilege |

**Attack surface analysis**: Enumerate all entry points (HTTP endpoints, WebSocket, database ports, admin panels, CI/CD webhooks) and assess what an attacker could do at each.

**Trust boundaries**: Browser-to-server (untrusted), server-to-database (trusted), server-to-external-API (partially trusted), service-to-service (depends on network isolation).

### 7. Dependency Auditing

- Vulnerability scanning in CI for every build
- License compliance check (MIT/Apache/BSD safe; GPL/AGPL need attention)
- Supply chain security: lockfiles committed, `npm ci` for installs, review dependency changes
- Minimize dependency count to reduce attack surface

---

## Quality Criteria

- OWASP Top 10 addressed for this specific project (not generic)
- Auth/authz boundaries defined and consistent with API contracts
- Data classified by sensitivity with handling requirements per level
- Secrets management strategy: no secrets in code, rotation plan defined
- Threat model covers all trust boundaries
- Dependency audit integrated into CI with severity-based policy
- Per-endpoint authorization matrix matches API contracts
- Security headers defined for all responses

---

## Process

1. **Read all inputs** — Read `docs/system-architecture.md`, `docs/api-contracts.md`, `docs/database-schema.md`, and `docs/operations-runbook.md`. Skip any that don't exist.
2. **Use AskUserQuestionTool** for these decisions:
   - **Security depth**: Full STRIDE threat model with OWASP analysis per component, or key controls with auth and data protection?
   - **Compliance requirements**: GDPR, HIPAA, PCI DSS, SOC 2, or none?
   - **Auth mechanism**: Confirm from ADRs (session, JWT, OAuth)
   - **MFA requirement**: Required for all users, admin-only, or not for v1?
3. **Use subagents** to research security patterns for the project's specific stack and hosting platform
4. **Conduct OWASP analysis** — assess each category against the project's specific architecture
5. **Design auth/authz** — authentication mechanism, authorization model, per-endpoint requirements
6. **Classify data** — sensitivity levels with handling requirements
7. **Build threat model** — STRIDE analysis, attack surface, trust boundaries
8. **Define secrets management** — environment variables, vault, rotation, pre-commit scanning
9. **Cross-validate** — verify auth requirements match API contracts, data classification matches schema
10. If using Beads: create a task (`bd create "docs: security review" -p 0 && bd update <id> --claim`) and close when done (`bd close <id>`)

## After This Step

When this step is complete, tell the user:

---
**Quality phase in progress** — `docs/security-review.md` created with OWASP analysis, threat model, auth patterns, data protection, and secrets management.

**Next:** Run `/scaffold:review-security` — Review security posture for OWASP gaps and auth boundary mismatches.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
