---
name: review-security
description: Failure modes and review passes specific to security review and documentation artifacts
topics: [security, owasp, auth, threat-modeling, review]
---

# Review: Security

The security review document assesses the system's security posture across authentication, authorization, data protection, and vulnerability management. It must address the OWASP top 10 for the project's technology stack, align security boundaries with API contracts and architecture, and ensure secrets management and dependency auditing are actionable. This review uses 7 passes targeting the specific ways security reviewation fails.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — OWASP Coverage**: Every OWASP Top 10 category addressed with project-specific analysis, not generic checklist advice.
- **Pass 2 — Auth/AuthZ Boundary Alignment**: Security boundaries align with API contract auth requirements; no access control gaps between security review and API enforcement.
- **Pass 3 — Secrets Management**: No secrets in code or version control; rotation strategy exists; vault/secrets manager integration specified for all secret categories.
- **Pass 4 — Dependency Audit Coverage**: Vulnerability scanning integrated into CI covering direct and transitive dependencies; response policy for discovered vulnerabilities.
- **Pass 5 — Threat Model Scenarios**: Structured threat model (STRIDE/PASTA) covering all trust boundaries with specific, project-relevant threat scenarios and mapped mitigations.
- **Pass 6 — Data Classification**: Data categorized by sensitivity level with handling requirements per category; regulatory compliance addressed.
- **Pass 7 — Input Validation**: Validation at all system boundaries (not just frontend) covering type, format, range, and business rules.

## Deep Guidance

---

## Pass 1: OWASP Coverage

### What to Check

Each OWASP Top 10 category is addressed for this specific project. The assessment is project-specific (not generic), identifying which categories are relevant, what the project's exposure is, and what mitigations are in place or planned.

### Why This Matters

The OWASP Top 10 represents the most common and impactful web application security risks. Skipping a category does not mean the risk does not exist — it means the risk is unassessed. Generic OWASP checklists that say "use parameterized queries" without connecting to the project's actual database layer provide false security confidence.

### How to Check

1. Verify all 10 OWASP categories are addressed (Broken Access Control, Cryptographic Failures, Injection, Insecure Design, Security Misconfiguration, Vulnerable Components, Identity/Auth Failures, Data Integrity Failures, Logging Failures, SSRF)
2. For each category, check that the assessment is project-specific: which components are affected? What is the attack surface?
3. Verify that mitigations reference specific architecture components, not generic advice ("use an ORM" vs. "the OrderRepository uses Prisma with parameterized queries by default")
4. Check for categories marked "not applicable" — is the rationale valid? (SSRF is not applicable only if the system never fetches external URLs)
5. Verify that mitigations for high-risk categories (Broken Access Control, Injection) are detailed and actionable
6. Check for OWASP categories beyond the Top 10 if the project has specific risk profiles (API security, mobile security, serverless security)

### What a Finding Looks Like

- P0: "Injection category says 'mitigated by using an ORM' but the system also has raw SQL queries in the reporting module. The mitigation is incomplete."
- P0: "Broken Access Control category is marked 'mitigated' but the API contracts show several endpoints with no authorization specification (see API review Pass 3). The mitigation claim is unverified."
- P1: "Cryptographic Failures category says 'use HTTPS' but does not address data encryption at rest, password hashing algorithm, or token generation security."
- P2: "Security Misconfiguration category provides generic advice. Should reference the project's specific infrastructure (Docker, Kubernetes, cloud provider) and their configuration risks."

---

## Pass 2: Auth/AuthZ Boundary Alignment

### What to Check

Security boundaries (who can access what) align with the API contract's authentication and authorization requirements and the architecture's component boundaries. No access control gaps exist between what the security review specifies and what the API contract enforces.

### Why This Matters

Security boundaries that do not match API contracts mean either the API has endpoints with weaker access control than the security review intends, or the security review assumes protections that the API does not implement. Either way, the gap creates a vulnerability. This pass cross-references the security review with the API contract — it is a consistency check between two artifacts.

### How to Check

1. List every security boundary defined in the security review (user roles, permission levels, resource ownership rules, service-to-service trust)
2. For each API endpoint, verify its auth/authz requirement aligns with the security review's boundary definition
3. Check for endpoints that the security review does not cover — are they intentionally public or accidentally unprotected?
4. Verify that resource-level authorization (user A cannot access user B's data) is specified in both documents consistently
5. Check that service-to-service authentication matches: does the security review and the architecture agree on how services authenticate to each other?
6. Verify that admin/elevated-privilege endpoints have additional protections specified in both documents

### What a Finding Looks Like

- P0: "Security document defines role-based access with 'admin' and 'user' roles, but API contract endpoint DELETE /users/{id} has no authorization specification. Can a 'user' role delete other users?"
- P1: "Security document specifies 'users can only access their own orders' but API contract GET /orders does not mention user-scoping. The endpoint may return all orders regardless of the requesting user."
- P1: "Service-to-service communication is marked as 'internal, trusted' in the security review but the architecture shows services communicating over the public internet without mTLS."
- P2: "Security document and API contract both specify auth requirements, but they use different terminology ('role: admin' vs. 'permission: manage_users'). Align the language."

---

## Pass 3: Secrets Management

### What to Check

No secrets are stored in code, version control, or plain-text configuration. A rotation strategy exists. Vault or secrets manager integration is specified.

### Why This Matters

Secrets in code or version control are the most common source of security breaches. A single API key committed to a public repository can compromise an entire production system within hours (automated scanners harvest secrets from public repos). Secrets management is not optional — it is a prerequisite for any production system.

### How to Check

1. Verify that the security review explicitly states: no secrets in code or version control
2. Check for a secrets management approach: environment variables, vault (HashiCorp Vault, AWS Secrets Manager, etc.), encrypted configuration
3. Verify that secrets rotation strategy is documented: how often are secrets rotated? What is the process?
4. Check for secrets categories: API keys, database credentials, JWT signing keys, encryption keys, service account tokens — is each category addressed?
5. Verify that local development secrets handling is specified: do developers use a .env file? Is it gitignored? Is there a secrets template?
6. Check for emergency rotation: what happens when a secret is suspected compromised? What is the process?
7. Verify that CI/CD secrets are addressed: how does the deployment pipeline access production secrets?

### What a Finding Looks Like

- P0: "No secrets management strategy exists. The security review does not address how secrets are stored, accessed, or rotated."
- P0: "Security document says 'secrets in environment variables' but does not specify how environment variables are populated in production. If they are in a plain-text config file on the server, that is not secrets management."
- P1: "Secrets rotation is mentioned as 'periodic' without specifying the rotation period or process. When the JWT signing key is rotated, what happens to existing tokens?"
- P2: "Local development uses a .env file but no .env.example template exists for new developers. They may create secrets with insecure defaults."

---

## Pass 4: Dependency Audit Coverage

### What to Check

Known vulnerability scanning is integrated into the CI pipeline. The dependency audit strategy covers direct and transitive dependencies. A policy exists for responding to discovered vulnerabilities.

### Why This Matters

Third-party dependencies are a major attack surface. A single vulnerable dependency (Log4Shell, for example) can compromise the entire system. Dependency auditing must be continuous (not one-time) and integrated into CI (not a manual process), because new vulnerabilities are discovered daily and dependencies change with every build.

### How to Check

1. Verify a dependency scanning tool is specified (npm audit, Snyk, Dependabot, Trivy, etc.)
2. Check that scanning runs automatically in CI — not just available locally
3. Verify that the scanning covers transitive dependencies (not just direct dependencies)
4. Check for a vulnerability response policy: severity thresholds (block on critical/high, warn on medium), response time expectations (critical: 24h, high: 1 week), exception process
5. Verify that container image scanning is included if the project uses containers
6. Check for license compliance scanning if relevant (some licenses are incompatible with commercial use)
7. Verify that the dependency audit covers all package ecosystems in the project (npm, pip, go modules, etc.)

### What a Finding Looks Like

- P0: "No dependency scanning tool or process is specified. The project has 500+ npm dependencies and no way to detect known vulnerabilities."
- P1: "Dependency scanning runs locally with 'npm audit' but is not integrated into CI. Vulnerabilities discovered locally may not block deployments."
- P1: "Scanning covers npm dependencies but the project also has Python dependencies (for data processing) that are not scanned."
- P2: "Vulnerability response policy does not specify exception process. What if a critical vulnerability has no fix available? Is there a documented workaround/mitigation path?"

---

## Pass 5: Threat Model Scenarios

### What to Check

Threats are identified for all trust boundaries in the system. The threat model uses a structured approach (STRIDE, PASTA, or similar) and covers realistic attack scenarios specific to this project.

### Why This Matters

A threat model that says "attackers may try to compromise the system" is not a threat model — it is a statement of the obvious. Useful threat models identify specific trust boundaries (user-to-API, service-to-service, service-to-database), enumerate realistic threats at each boundary, and map them to mitigations. Without specific threat scenarios, security investments are based on intuition rather than risk analysis.

### How to Check

1. Verify a threat modeling methodology is stated (STRIDE, PASTA, attack trees, or custom)
2. List all trust boundaries from the architecture: client-to-server, service-to-service, service-to-database, service-to-external-API
3. For each trust boundary, verify threats are enumerated
4. Check that threats are specific: "SQL injection via the search parameter on GET /products" not "injection attacks"
5. Verify that each threat has a likelihood and impact assessment
6. Check that mitigations are mapped to threats: which mitigation addresses which threat?
7. Verify that residual risk is documented: threats with no mitigation or partial mitigation
8. Check for insider threat scenarios: what if a developer, admin, or service account is compromised?

### What a Finding Looks Like

- P0: "No threat model exists. The security review discusses mitigations but has not identified what threats those mitigations are defending against."
- P1: "Threat model covers client-to-server boundary but ignores service-to-service trust boundaries. Internal services communicate without authentication — an attacker who compromises one service has unrestricted access to all others."
- P1: "Threat model identifies threats but does not map them to mitigations. It is unclear whether identified threats are mitigated, partially mitigated, or accepted risks."
- P2: "Insider threat is not addressed. What happens if a developer's machine is compromised and their credentials are stolen?"

---

## Pass 6: Data Classification

### What to Check

Data is categorized by sensitivity level. Handling requirements are specified for each category. Data flows map to classification levels.

### Why This Matters

Not all data requires the same protection. Treating all data identically either under-protects sensitive data (PII, financial, health) or over-protects public data (wasting resources on encryption, access control, and audit logging for non-sensitive data). Data classification drives proportional security investment and ensures regulatory compliance (GDPR, HIPAA, PCI-DSS).

### How to Check

1. Verify that data classification levels are defined (e.g., public, internal, confidential, restricted)
2. For each classification level, check that handling requirements are specified: encryption at rest, encryption in transit, access control, audit logging, retention, disposal
3. Map domain entities to classification levels: which entities contain PII? Financial data? Health data?
4. Verify that data flows respect classification: restricted data does not flow through unprotected channels
5. Check for regulatory requirements: if the project handles PII (GDPR), payment data (PCI-DSS), or health data (HIPAA), are compliance requirements addressed?
6. Verify that data classification covers derived data: aggregated analytics, logs that contain PII, backups that contain classified data
7. Check for data residency requirements if the project operates across jurisdictions

### What a Finding Looks Like

- P0: "No data classification exists. The system handles user email addresses, passwords, and payment information with no documented sensitivity levels or handling requirements."
- P1: "Data is classified but handling requirements are missing. User email is marked 'confidential' but no encryption-at-rest requirement is specified."
- P1: "Application logs contain user email addresses and IP addresses (PII) but logs are classified as 'internal' with no PII handling requirements."
- P2: "Data classification does not address backups. If backups contain 'restricted' data, backup storage must meet the same security requirements."

---

## Pass 7: Input Validation

### What to Check

Validation exists at all system boundaries — not just the frontend. Every point where data enters the system (API endpoints, message consumers, file uploads, webhook receivers) has validation specified.

### Why This Matters

Frontend-only validation is a UX convenience, not a security control. Attackers bypass the frontend entirely and send requests directly to the API. Every system boundary where external data enters must validate that data: type checking, range checking, format checking, and business rule validation. Missing server-side validation is the root cause of injection attacks, data corruption, and denial-of-service via malformed input.

### How to Check

1. List every system boundary where external data enters: API endpoints, message queue consumers, file upload handlers, webhook receivers, scheduled job inputs, admin interfaces
2. For each boundary, verify that input validation is specified
3. Check that validation covers: type (string/number/boolean), format (email, URL, date), range (min/max length, min/max value), allowed values (enums, whitelists)
4. Verify that validation is server-side (not relying on client-side validation for security)
5. Check for file upload validation: file type, file size, content validation (not just extension checking)
6. Verify that validation error responses do not leak internal information (no stack traces, no database error messages)
7. Check for rate limiting on endpoints that accept user input (prevent abuse via high-volume invalid input)

### What a Finding Looks Like

- P0: "API endpoint POST /users accepts a request body with no documented validation. An attacker could send a 100MB payload, inject SQL via the name field, or provide an invalid email format."
- P1: "File upload endpoint validates file extension (.jpg, .png) but does not validate file content. An attacker could upload a malicious script with a .jpg extension."
- P1: "Webhook receiver accepts payloads from external services with no signature validation. An attacker could forge webhook calls."
- P2: "Input validation is specified for API endpoints but not for message queue consumers. A malformed message could cause the consumer to crash."

---

## Common Review Anti-Patterns

### 1. Generic OWASP Checklist Without Project Mapping

The security document lists all 10 OWASP categories with textbook mitigations ("use parameterized queries," "encrypt data at rest") but never connects them to the actual project. No component names, no endpoint references, no architecture-specific analysis. The same document could describe any web application.

**How to spot it:** The OWASP section contains zero references to the project's architecture document, API contracts, or database schema. Mitigations are general advice rather than specific implementation plans tied to named components.

### 2. Auth Designed in Isolation from API Contracts

The security document defines roles, permissions, and access control policies, but the reviewer does not cross-reference these with the API contract's endpoint-level auth requirements. The security document says "admin-only" for user management, but the API contract has no auth annotation on DELETE /users/{id}. This gap means the security design exists on paper but may not be enforced.

**Example finding:**

```markdown
## Finding: SEC-018

**Priority:** P0
**Pass:** Auth/AuthZ Boundary Alignment (Pass 2)
**Document:** docs/security-review.md, Section 3 / docs/api-contracts.md, Section 5.2

**Issue:** Security document defines three roles (admin, editor, viewer) with a permission
matrix. API contract defines 24 endpoints. Cross-referencing reveals:
  - 6 endpoints have no auth requirement specified in the API contract
  - 3 endpoints specify "authenticated" but the security document requires "admin" role
  - Endpoint PATCH /users/{id}/role has no authorization check — any authenticated user
    could escalate privileges

**Recommendation:** Add auth/authz annotations to all 24 endpoints in the API contract.
Reconcile the 3 mismatched endpoints with the security document's permission matrix.
Add explicit admin-only restriction to the role-change endpoint.
```

### 3. Secrets Strategy Says "Environment Variables" and Stops

The security document addresses secrets management by stating "secrets are stored in environment variables" with no further detail. This leaves critical questions unanswered: how are environment variables populated in production (plain text config file on the server? Kubernetes secrets? A vault?)? How are secrets rotated? What happens when a secret is compromised? "Environment variables" is a mechanism, not a strategy.

**How to spot it:** The secrets management section is shorter than half a page. It mentions environment variables but not rotation, not emergency response, not CI/CD secret injection, and not local development secrets handling.

### 4. Threat Model Without Trust Boundaries

The security document includes a threat model section that lists generic threats (SQL injection, XSS, CSRF) without mapping them to the system's trust boundaries. No data flow analysis, no identification of where untrusted input enters the system, no assessment of service-to-service trust. The threats listed are a vocabulary exercise, not a risk analysis.

**How to spot it:** The threat model section does not reference the architecture diagram. No trust boundaries are drawn. Threats are listed as a flat list rather than organized by boundary (client-to-API, service-to-service, service-to-database).

### 5. Reviewing Security Document Without Cross-Referencing Other Artifacts

The reviewer checks the security document internally (are all sections present? is the OWASP analysis complete?) but never opens the API contracts, architecture document, or operations runbook. Security findings that span multiple documents — auth gaps between the security doc and API contract, secrets handling gaps between the security doc and operations runbook — are invisible to a single-document review.

**How to spot it:** The review report cites only the security document. No findings reference the API contracts (Pass 2), the architecture (Pass 5 trust boundaries), or the operations runbook (Pass 3 secrets in deployment).
