---
description: "Review security review for coverage and correctness"
long-description: "Verifies OWASP coverage is complete, auth boundaries match API contracts, every secret is accounted for, and the threat model covers all trust boundaries. Highest priority for multi-model review."
---

## Purpose
Review security review targeting security-specific failure modes: OWASP coverage
gaps, auth/authz boundary mismatches with API contracts, secrets management gaps,
insufficient dependency audit coverage, missing threat model scenarios, and data
classification gaps.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/security-review.md (required) — security review document
- docs/api-contracts.md (optional) — for auth boundary alignment
- docs/system-architecture.md (required) — for attack surface coverage

## Expected Outputs
- docs/reviews/review-security.md — findings and resolution log
- docs/security-review.md — updated with fixes
- docs/reviews/security/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/security/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/security/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) OWASP coverage verified for this project
- (deep) Auth boundaries match API contract auth requirements
- (deep) Secrets management covers: all environment variables, API keys, database credentials, and third-party tokens
- (deep) Dependency audit scope covers all dependencies
- (deep) Threat model covers all trust boundaries
- (deep) If docs/domain-models/ exists, data classification covers every entity in the domain model. Otherwise, data classification derived from user stories and API contracts.
- Every finding categorized P0-P3 (P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.) with specific control, boundary, and issue
- Fix plan documented for all P0/P1 findings; fixes applied to security-review.md and re-validated
- Downstream readiness confirmed — no unresolved P0 or P1 findings remain before planning phase proceeds
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: Full multi-pass review. Multi-model review dispatched to Codex and
  Gemini if available, with graceful fallback to Claude-only enhanced review.
- **mvp**: OWASP coverage check only.
- **custom:depth(1-5)**:
  - Depth 1: OWASP top 10 and secrets management pass only (1 review pass)
  - Depth 2: Add auth boundary and input validation passes (2 review passes)
  - Depth 3: Add dependency audit and data protection passes (4 review passes)
  - Depth 4: Add external model security review (4 review passes + external dispatch)
  - Depth 5: Multi-model security review with reconciliation (4 review passes + multi-model synthesis)

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/security/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-security.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate

---

## Domain Knowledge

### review-methodology

*Shared process for conducting multi-pass reviews of documentation artifacts*

# Review Methodology

This document defines the shared process for reviewing pipeline artifacts. It covers HOW to review, not WHAT to check — each artifact type has its own review knowledge base document with domain-specific passes and failure modes. Every review phase (1a through 10a) follows this process.

## Summary

- **Multi-pass review**: Each pass has a single focus (coverage, consistency, structure, downstream readiness). Passes are ordered broadest-to-most-specific.
- **Finding severity**: P0 blocks next phase (must fix), P1 is a significant gap (should fix), P2 is an improvement opportunity (fix if time permits), P3 is nice-to-have (skip).
- **Fix planning**: Group findings by root cause, same section, and same severity. Fix all P0s first, then P1s. Never fix ad hoc.
- **Re-validation**: After applying fixes, re-run the specific passes that produced the findings. Stop when no new P0/P1 findings appear.
- **Downstream readiness gate**: Final check verifies the next phase can proceed with these artifacts. Outcomes: pass, conditional pass, or fail.
- **Review report**: Structured output with executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Deep Guidance

## Multi-Pass Review Structure

### Why Multiple Passes

A single read-through catches surface errors but misses structural problems. The human tendency (and the AI tendency) is to get anchored on the first issue found and lose track of the broader picture. Multi-pass review forces systematic coverage by constraining each pass to one failure mode category.

Each pass has a single focus: coverage, consistency, structural integrity, or downstream readiness. The reviewer re-reads the artifact with fresh eyes each time, looking for one thing. This is slower than a single pass but catches 3-5x more issues in practice.

### Pass Ordering

Order passes from broadest to most specific:

1. **Coverage passes first** — Is everything present that should be? Missing content is the highest-impact failure mode because it means entire aspects of the system are unspecified. Coverage gaps compound downstream: a missing domain in the domain modeling step means missing ADRs in the decisions step, missing components in the architecture step, missing tables in the specification step, and so on.

2. **Consistency passes second** — Does everything agree with itself and with upstream artifacts? Inconsistencies are the second-highest-impact failure because they create ambiguity for implementing agents. When two documents disagree, the agent guesses — and guesses wrong.

3. **Structural integrity passes third** — Is the artifact well-formed? Are relationships explicit? Are boundaries clean? Structural issues cause implementation friction: circular dependencies, unclear ownership, ambiguous boundaries.

4. **Downstream readiness last** — Can the next phase proceed? This pass validates that the artifact provides everything its consumers need. It is the gate that determines whether to proceed or iterate.

### Pass Execution

For each pass:

1. State the pass name and what you are looking for
2. Re-read the entire artifact (or the relevant sections) with only that lens
3. Record every finding, even if minor — categorize later
4. Do not fix anything during a pass — record only
5. After completing all findings for this pass, move to the next pass

Do not combine passes. The discipline of single-focus reading is the mechanism that catches issues a general-purpose review misses.

## Finding Categorization

Every finding gets a severity level. Severity determines whether the finding blocks progress or gets deferred.

### P0: Blocks Next Phase

The artifact cannot be consumed by the next pipeline phase in its current state. The next phase would produce incorrect output or be unable to proceed.

**Examples:**
- A domain entity referenced by three other models is completely undefined
- An ADR contradicts another ADR with no acknowledgment, and the architecture depends on both
- A database schema is missing tables for an entire bounded context
- An API endpoint references a data type that does not exist in any domain model

**Action:** Must fix before proceeding. No exceptions.

### P1: Significant Gap

The artifact is usable but has a meaningful gap that will cause rework downstream. The next phase can proceed but will need to make assumptions that may be wrong.

**Examples:**
- An aggregate is missing one invariant that affects validation logic
- An ADR lists alternatives but does not evaluate them
- A data flow diagram omits error paths
- An API endpoint is missing error response definitions

**Action:** Should fix before proceeding. Fix unless the cost of fixing now significantly exceeds the cost of fixing during the downstream phase (rare).

### P2: Improvement Opportunity

The artifact is correct and usable but could be clearer, more precise, or better organized. The next phase can proceed without issue.

**Examples:**
- A domain model uses informal language where a precise definition would help
- An ADR's consequences section is vague but the decision is clear
- A diagram uses inconsistent notation but the meaning is unambiguous
- An API contract could benefit from more examples

**Action:** Fix if time permits. Log for future improvement.

### P3: Nice-to-Have

Stylistic, formatting, or polish issues. No impact on correctness or downstream consumption.

**Examples:**
- Inconsistent heading capitalization
- A diagram could be reformatted for readability
- A section could be reordered for flow
- Minor wording improvements

**Action:** Fix during finalization phase if at all. Do not spend review time on these.

## Fix Planning

After all passes are complete and findings are categorized, create a fix plan before making any changes. Ad hoc fixing (fixing issues as you find them) risks:

- Introducing new issues while fixing old ones
- Fixing a symptom instead of a root cause (two findings may share one fix)
- Spending time on P2/P3 issues before P0/P1 are resolved

### Grouping Findings

Group related findings into fix batches:

1. **Same root cause** — Multiple findings that stem from a single missing concept, incorrect assumption, or structural issue. Fix the root cause once.
2. **Same section** — Findings in the same part of the artifact that can be addressed in a single editing pass.
3. **Same severity** — Process all P0s first, then P1s. Do not interleave.

### Prioritizing by Downstream Impact

Within the same severity level, prioritize fixes that have the most downstream impact:

- Fixes that affect multiple downstream phases rank higher than single-phase impacts
- Fixes that change structure (adding entities, changing boundaries) rank higher than fixes that change details (clarifying descriptions, adding examples)
- Fixes to artifacts consumed by many later phases rank higher (domain models affect everything; API contracts affect fewer phases)

### Fix Plan Format

```markdown
## Fix Plan

### Batch 1: [Root cause or theme] (P0)
- Finding 1.1: [description]
- Finding 1.3: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 2: [Root cause or theme] (P0)
- Finding 2.1: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 3: [Root cause or theme] (P1)
...
```

## Re-Validation

After applying all fixes in a batch, re-run the specific passes that produced the findings in that batch. This is not optional — fixes routinely introduce new issues.

### What to Check

1. The original findings are resolved (the specific issues no longer exist)
2. The fix did not break anything checked by the same pass (re-read the full pass scope, not just the fixed section)
3. The fix did not introduce inconsistencies with other parts of the artifact (quick consistency check)

### When to Stop

Re-validation is complete when:
- All P0 and P1 findings are resolved
- Re-validation produced no new P0 or P1 findings
- Any new P2/P3 findings are logged but do not block progress

If re-validation produces new P0/P1 findings, create a new fix batch and repeat. If this cycle repeats more than twice, the artifact likely has a structural problem that requires rethinking a section rather than patching individual issues.

## Downstream Readiness Gate

The final check in every review: can the next phase proceed with these artifacts?

### How to Evaluate

1. Read the meta-prompt for the next phase — what inputs does it require?
2. For each required input, verify the current artifact provides it with sufficient detail and clarity
3. For each quality criterion in the next phase's meta-prompt, verify the current artifact supports it
4. Identify any questions the next phase's author would need to ask — each question is a gap

### Gate Outcomes

- **Pass** — The next phase can proceed. All required information is present and unambiguous.
- **Conditional pass** — The next phase can proceed but should be aware of specific limitations or assumptions. Document these as handoff notes.
- **Fail** — The next phase cannot produce correct output. Specific gaps must be addressed first.

A conditional pass is the most common outcome. Document the conditions clearly so the next phase knows what assumptions it is inheriting.

## Review Report Format

Every review produces a structured report. This format ensures consistency across all review phases and makes it possible to track review quality over time.

```markdown
# Review Report: [Artifact Name]

## Executive Summary
[2-3 sentences: overall artifact quality, number of findings by severity,
whether downstream gate passed]

## Findings by Pass

### Pass N: [Pass Name]
| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | P0 | [description] | [section/line] |
| 2 | P1 | [description] | [section/line] |

### Pass N+1: [Pass Name]
...

## Fix Plan
[Grouped fix batches as described above]

## Fix Log
| Batch | Findings Addressed | Changes Made | New Issues |
|-------|-------------------|--------------|------------|
| 1 | 1.1, 1.3 | [summary] | None |
| 2 | 2.1 | [summary] | 2.1a (P2) |

## Re-Validation Results
[Which passes were re-run, what was found]

## Downstream Readiness Assessment
- **Gate result:** Pass | Conditional Pass | Fail
- **Handoff notes:** [specific items the next phase should be aware of]
- **Remaining P2/P3 items:** [count and brief summary, for future reference]
```

---

### review-security

*Failure modes and review passes specific to security review and documentation artifacts*

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

---

### multi-model-review-dispatch

*Patterns for dispatching reviews to external AI models (Codex, Gemini) at depth 4+, including fallback strategies and finding reconciliation*

# Multi-Model Review Dispatch

At higher methodology depths (4+), reviews benefit from independent validation by external AI models. Different models have different blind spots — Codex excels at code-centric analysis while Gemini brings strength in design and architectural reasoning. Dispatching to multiple models and reconciling their findings produces higher-quality reviews than any single model alone. This knowledge covers when to dispatch, how to dispatch, how to handle failures, and how to reconcile disagreements.

## Summary

### When to Dispatch

Multi-model review activates at depth 4+ in the methodology scaling system:

| Depth | Review Approach |
|-------|----------------|
| 1-2 | Claude-only, reduced pass count |
| 3 | Claude-only, full pass count |
| 4 | Full passes + one external model (if available) |
| 5 | Full passes + multi-model with reconciliation |

Dispatch is always optional. If no external model CLI is available, the review proceeds as a Claude-only enhanced review with additional self-review passes to partially compensate.

### Model Selection

| Model | Strength | Best For |
|-------|----------|----------|
| **Codex** (OpenAI) | Code analysis, implementation correctness, API contract validation | Code reviews, security reviews, API reviews, database schema reviews |
| **Gemini** (Google) | Design reasoning, architectural patterns, broad context understanding | Architecture reviews, PRD reviews, UX reviews, domain model reviews |

When both models are available at depth 5, dispatch to both and reconcile. At depth 4, choose the model best suited to the artifact type.

### Graceful Fallback

External models are never required. The fallback chain:
1. Attempt dispatch to selected model(s)
2. If CLI unavailable → skip that model, note in report
3. If timeout → use partial results if any, note incompleteness
4. If all external models fail → Claude-only enhanced review (additional self-review passes)

The review never blocks on external model availability.

## Deep Guidance

### Dispatch Mechanics

#### CLI Availability Check

Before dispatching, verify the model CLI is installed and authenticated:

```bash
# Codex check
which codex && codex --version 2>/dev/null

# Gemini check (via Google Cloud CLI or dedicated tool)
which gemini 2>/dev/null || (which gcloud && gcloud ai models list 2>/dev/null)
```

If the CLI is not found, skip dispatch immediately. Do not prompt the user to install it — this is a review enhancement, not a requirement.

#### Prompt Formatting

External model prompts must be self-contained. The external model has no access to the pipeline context, CLAUDE.md, or prior conversation. Every dispatch includes:

1. **Artifact content** — The full text of the document being reviewed
2. **Review focus** — What specific aspects to evaluate (coverage, consistency, correctness)
3. **Upstream context** — Relevant upstream artifacts that the document should be consistent with
4. **Output format** — Structured JSON for machine-parseable findings

**Prompt template:**
```
You are reviewing the following [artifact type] for a software project.

## Document Under Review
[full artifact content]

## Upstream Context
[relevant upstream artifacts, summarized or in full]

## Review Instructions
Evaluate this document for:
1. Coverage — Are all expected topics addressed?
2. Consistency — Does it agree with the upstream context?
3. Correctness — Are technical claims accurate?
4. Completeness — Are there gaps that would block downstream work?

## Output Format
Respond with a JSON array of findings:
[
  {
    "id": "F-001",
    "severity": "P0|P1|P2|P3",
    "category": "coverage|consistency|correctness|completeness",
    "location": "section or line reference",
    "finding": "description of the issue",
    "suggestion": "recommended fix"
  }
]
```

#### Output Parsing

External model output is parsed as JSON. Handle common parsing issues:
- Strip markdown code fences (```json ... ```) if the model wraps output
- Handle trailing commas in JSON arrays
- Validate that each finding has the required fields (severity, category, finding)
- Discard malformed entries rather than failing the entire parse

Store raw output for audit:
```
docs/reviews/{artifact}/codex-review.json   — raw Codex findings
docs/reviews/{artifact}/gemini-review.json  — raw Gemini findings
docs/reviews/{artifact}/review-summary.md   — reconciled synthesis
```

### Timeout Handling

External model calls can hang or take unreasonably long. Set reasonable timeouts:

| Operation | Timeout | Rationale |
|-----------|---------|-----------|
| CLI availability check | 5 seconds | Should be instant |
| Small artifact review (<2000 words) | 60 seconds | Quick read and analysis |
| Medium artifact review (2000-10000 words) | 120 seconds | Needs more processing time |
| Large artifact review (>10000 words) | 180 seconds | Maximum reasonable wait |

#### Partial Result Handling

If a timeout occurs mid-response:
1. Check if the partial output contains valid JSON entries
2. If yes, use the valid entries and note "partial results" in the report
3. If no, treat as a model failure and fall back

Never wait indefinitely. A review that completes in 3 minutes with Claude-only findings is better than one that blocks for 10 minutes waiting for an external model.

### Finding Reconciliation

When multiple models produce findings, reconciliation synthesizes them into a unified report.

#### Consensus Analysis

Compare findings across models to identify agreement and disagreement:

**Consensus** — Multiple models flag the same issue (possibly with different wording). High confidence in the finding. Use the most specific description.

**Single-source finding** — Only one model flags an issue. Lower confidence but still valuable. Include in the report with a note about which model found it.

**Disagreement** — One model flags an issue that another model explicitly considers correct. Requires manual analysis.

#### Reconciliation Process

1. **Normalize findings.** Map each model's findings to a common schema (severity, category, location, description).

2. **Match findings across models.** Two findings match if they reference the same location and describe the same underlying issue (even with different wording). Use location + category as the matching key.

3. **Score by consensus.**
   - Found by all models → confidence: high
   - Found by majority → confidence: medium
   - Found by one model → confidence: low (but still reported)

4. **Resolve severity disagreements.** When models disagree on severity:
   - If one says P0 and another says P1 → use P0 (err on the side of caution)
   - If one says P1 and another says P3 → investigate the specific finding before deciding
   - Document the disagreement in the synthesis report

5. **Merge descriptions.** When multiple models describe the same finding differently, combine their perspectives. Model A might identify the symptom while Model B identifies the root cause.

#### Disagreement Resolution

When models actively disagree (one flags an issue, another says the same thing is correct):

1. **Read both arguments.** Each model explains its reasoning. One may have a factual error.
2. **Check against source material.** Read the actual artifact and upstream docs. The correct answer is in the documents, not in model opinions.
3. **Default to the stricter interpretation.** If genuinely ambiguous, the finding stands at reduced severity (P1 → P2).
4. **Document the disagreement.** The reconciliation report should note: "Models disagreed on [topic]. Resolution: [decision and rationale]."

### Consensus Classification

When synthesizing multi-model findings, classify each finding:
- **Consensus**: All participating models flagged the same issue at similar severity → report at the agreed severity
- **Majority**: 2+ models agree, 1 dissents → report at the lower of the agreeing severities; note the dissent
- **Divergent**: Models disagree on severity or one model found an issue others missed → present to user for decision, minimum P2 severity
- **Unique**: Only one model raised the finding → include with attribution, flag as "single-model finding" for user review

### Output Format

#### Review Summary (review-summary.md)

```markdown
# Multi-Model Review Summary: [Artifact Name]

## Models Used
- Claude (primary reviewer)
- Codex (external, depth 4+) — [available/unavailable/timeout]
- Gemini (external, depth 5) — [available/unavailable/timeout]

## Consensus Findings
| # | Severity | Finding | Models | Confidence |
|---|----------|---------|--------|------------|
| 1 | P0 | [description] | Claude, Codex | High |
| 2 | P1 | [description] | Claude, Codex, Gemini | High |

## Single-Source Findings
| # | Severity | Finding | Source | Confidence |
|---|----------|---------|--------|------------|
| 3 | P1 | [description] | Gemini | Low |

## Disagreements
| # | Topic | Claude | Codex | Resolution |
|---|-------|--------|-------|------------|
| 4 | [topic] | P1 issue | No issue | [resolution rationale] |

## Reconciliation Notes
[Any significant observations about model agreement patterns, recurring themes,
or areas where external models provided unique value]
```

#### Raw JSON Preservation

Always preserve the raw JSON output from external models, even after reconciliation. The raw findings serve as an audit trail and enable re-analysis if the reconciliation logic is later improved.

```
docs/reviews/{artifact}/
  codex-review.json     — raw output from Codex
  gemini-review.json    — raw output from Gemini
  review-summary.md     — reconciled synthesis
```

### Quality Gates

Minimum standards for a multi-model review to be considered complete:

| Gate | Threshold | Rationale |
|------|-----------|-----------|
| Minimum finding count | At least 3 findings across all models | A review with zero findings likely missed something |
| Coverage threshold | Every review pass has at least one finding or explicit "no issues found" note | Ensures all passes were actually executed |
| Reconciliation completeness | All cross-model disagreements have documented resolutions | No unresolved conflicts |
| Raw output preserved | JSON files exist for all models that were dispatched | Audit trail |

If the primary Claude review produces zero findings and external models are unavailable, the review should explicitly note this as unusual and recommend a targeted re-review at a later stage.

### Common Anti-Patterns

**Blind trust of external findings.** An external model flags an issue and the reviewer includes it without verification. External models hallucinate — they may flag a "missing section" that actually exists, or cite a "contradiction" based on a misread. Fix: every external finding must be verified against the actual artifact before inclusion in the final report.

**Ignoring disagreements.** Two models disagree, and the reviewer picks one without analysis. Fix: disagreements are the most valuable signal in multi-model review. They identify areas of genuine ambiguity or complexity. Always investigate and document the resolution.

**Dispatching at low depth.** Running external model reviews at depth 1-2 where the review scope is intentionally minimal. The external model does a full analysis anyway, producing findings that are out of scope. Fix: only dispatch at depth 4+. Lower depths use Claude-only review with reduced pass count.

**No fallback plan.** The review pipeline assumes external models are always available. When Codex is down, the review fails entirely. Fix: external dispatch is always optional. The fallback to Claude-only enhanced review must be implemented and tested.

**Over-weighting consensus.** Two models agree on a finding, so it must be correct. But both models may share the same bias (e.g., both flag a pattern as an anti-pattern that is actually appropriate for this project's constraints). Fix: consensus increases confidence but does not guarantee correctness. All findings still require artifact-level verification.

**Dispatching the full pipeline context.** Sending the entire project context (all docs, all code) to the external model. This exceeds context limits and dilutes focus. Fix: send only the artifact under review and the minimal upstream context needed for that specific review.

**Ignoring partial results.** A model times out after producing 3 of 5 findings. The reviewer discards all results because the review is "incomplete." Fix: partial results are still valuable. Include them with a note about incompleteness. Three real findings are better than zero.

---

### review-step-template

*Shared template pattern for review pipeline steps including multi-model dispatch, finding severity, and resolution workflow*

# Review Step Template

## Summary

This entry documents the common structure shared by all 15+ review pipeline steps. Individual review steps customize this structure with artifact-specific failure modes and review passes, but the scaffolding is consistent across all reviews.

**Purpose pattern**: Every review step targets domain-specific failure modes for a given artifact — not generic quality checks. Each pass has a specific focus, concrete checking instructions, and example findings.

**Standard inputs**: Primary artifact being reviewed, upstream artifacts for cross-reference validation, `review-methodology` knowledge + artifact-specific review knowledge entry.

**Standard outputs**: Review document (`docs/reviews/review-{artifact}.md`), updated primary artifact with P0/P1 fixes applied, and at depth 4+: multi-model artifacts (`codex-review.json`, `gemini-review.json`, `review-summary.md`) under `docs/reviews/{artifact}/`.

**Finding severity**: P0 (blocking — must fix), P1 (significant — fix before implementation), P2 (improvement — fix if time permits), P3 (nitpick — log for later).

**Methodology scaling**: Depth 1-2 runs top passes only (P0 focus). Depth 3 runs all passes. Depth 4-5 adds multi-model dispatch to Codex/Gemini with finding synthesis.

**Mode detection**: First review runs all passes from scratch. Re-review preserves prior findings, marks resolved ones, and reports NEW/EXISTING/RESOLVED status.

**Frontmatter conventions**: Reviews are order = creation step + 10, always include `review-methodology` in knowledge-base, and are never conditional.

## Deep Guidance

### Purpose Pattern

Every review step follows the pattern:

> Review **[artifact]** targeting **[domain]**-specific failure modes.

The review does not check generic quality ("is this document complete?"). Instead, it runs artifact-specific passes that target the known ways that artifact type fails. Each pass has a specific focus, concrete checking instructions, and example findings.

### Standard Inputs

Every review step reads:
- **Primary artifact**: The document being reviewed (e.g., `docs/domain-models.md`, `docs/api-contracts.md`)
- **Upstream artifacts**: Documents the primary artifact was built from (e.g., PRD, domain models, ADRs) -- used for cross-reference validation
- **Knowledge base entries**: `review-methodology` (shared process) + artifact-specific review knowledge (e.g., `review-api-design`, `review-database-design`)

### Standard Outputs

Every review step produces:
- **Review document**: `docs/reviews/review-{artifact}.md` -- findings organized by pass, with severity and trace information
- **Updated artifact**: The primary artifact with fixes applied for P0/P1 findings
- **Depth 4+ multi-model artifacts** (when methodology depth >= 4):
  - `docs/reviews/{artifact}/codex-review.json` -- Codex independent review findings
  - `docs/reviews/{artifact}/gemini-review.json` -- Gemini independent review findings
  - `docs/reviews/{artifact}/review-summary.md` -- Synthesized findings from all models

### Finding Severity Levels

All review steps use the same four-level severity scale:

| Level | Name | Meaning | Action |
|-------|------|---------|--------|
| P0 | Blocking | Cannot proceed to downstream steps without fixing | Must fix before moving on |
| P1 | Significant | Downstream steps can proceed but will encounter problems | Fix before implementation |
| P2 | Improvement | Artifact works but could be better | Fix if time permits |
| P3 | Nitpick | Style or preference | Log for future cleanup |

### Finding Format

Each finding includes:
- **Pass**: Which review pass discovered it (e.g., "Pass 3 -- Auth/AuthZ Coverage")
- **Priority**: P0-P3
- **Location**: Specific section, line, or element in the artifact
- **Issue**: What is wrong, with concrete details
- **Impact**: What goes wrong downstream if this is not fixed
- **Recommendation**: Specific fix, not just "fix this"
- **Trace**: Link back to upstream artifact that establishes the requirement (e.g., "PRD Section 3.2 -> Architecture DF-005")

### Example Finding

```markdown
### Finding F-003 (P1)
- **Pass**: Pass 2 — Entity Coverage
- **Location**: docs/domain-models/order.md, Section "Order Aggregate"
- **Issue**: Order aggregate does not include a `cancellationReason` field, but PRD
  Section 4.1 requires cancellation reason tracking for analytics.
- **Impact**: Implementation will lack cancellation reason; analytics pipeline will
  receive null values, causing dashboard gaps.
- **Recommendation**: Add `cancellationReason: CancellationReason` value object to
  Order aggregate with enum values: USER_REQUEST, PAYMENT_FAILED, OUT_OF_STOCK,
  ADMIN_ACTION.
- **Trace**: PRD §4.1 → User Story US-014 → Domain Model: Order Aggregate
```

### Review Document Structure

Every review output document follows a consistent structure:

```markdown
  # Review: [Artifact Name]

  **Date**: YYYY-MM-DD
  **Methodology**: deep | mvp | custom:depth(N)
  **Status**: INITIAL | RE-REVIEW
  **Models**: Claude | Claude + Codex | Claude + Codex + Gemini

  ## Findings Summary
  - Total findings: N (P0: X, P1: Y, P2: Z, P3: W)
  - Passes run: N of M
  - Artifacts checked: [list]

  ## Findings by Pass

  ### Pass 1 — [Pass Name]
  [Findings listed by severity, highest first]

  ### Pass 2 — [Pass Name]
  ...

  ## Resolution Log
  | Finding | Severity | Status | Resolution |
  |---------|----------|--------|------------|
  | F-001   | P0       | RESOLVED | Fixed in commit abc123 |
  | F-002   | P1       | EXISTING | Deferred — tracked in ADR-015 |

  ## Multi-Model Synthesis (depth 4+)
  ### Convergent Findings
  [Issues found by 2+ models — high confidence]

  ### Divergent Findings
  [Issues found by only one model — requires manual triage]
```

### Methodology Scaling Pattern

Review steps scale their thoroughness based on the methodology depth setting:

### Depth 1-2 (MVP/Minimal)
- Run only the highest-impact passes (typically passes 1-3)
- Single-model review only
- Focus on P0 findings; skip P2/P3
- Abbreviated finding descriptions

### Depth 3 (Standard)
- Run all review passes
- Single-model review
- Report all severity levels
- Full finding descriptions with trace information

### Depth 4-5 (Comprehensive)
- Run all review passes
- Multi-model dispatch: send the artifact to Codex and Gemini for independent analysis
- Synthesize findings from all models, flagging convergent findings (multiple models found the same issue) as higher confidence
- Cross-artifact consistency checks against all upstream documents
- Full finding descriptions with detailed trace and impact analysis

### Depth Scaling Example

At depth 2 (MVP), a domain model review might produce:

```markdown
  # Review: Domain Models (MVP)
  ## Findings Summary
  - Total findings: 3 (P0: 1, P1: 2)
  - Passes run: 3 of 10
  ## Findings
  ### F-001 (P0) — Missing aggregate root for Payment bounded context
  ### F-002 (P1) — Order entity lacks status field referenced in user stories
  ### F-003 (P1) — No domain event defined for order completion
```

At depth 5 (comprehensive), the same review would run all 10 passes, dispatch to
Codex and Gemini, and produce a full synthesis with 15-30 findings across all
severity levels.

### Mode Detection Pattern

Every review step checks whether this is a first review or a re-review:

**First review**: No prior review document exists. Run all passes from scratch.

**Re-review**: A prior review document exists (`docs/reviews/review-{artifact}.md`). The step:
1. Reads the prior review findings
2. Checks which findings were addressed (fixed in the artifact)
3. Marks resolved findings as "RESOLVED" rather than removing them
4. Runs all passes again looking for new issues or regressions
5. Reports findings as "NEW", "EXISTING" (still unfixed), or "RESOLVED"

This preserves review history and makes progress visible.

### Resolution Workflow

The standard workflow from review to resolution:

1. **Review**: Run the review step, producing findings
2. **Triage**: Categorize findings by severity; confirm P0s are genuine blockers
3. **Fix**: Update the primary artifact to address P0 and P1 findings
4. **Re-review**: Run the review step again in re-review mode
5. **Verify**: Confirm all P0 findings are resolved; P1 findings are resolved or have documented justification for deferral
6. **Proceed**: Move to the next pipeline phase

For depth 4+ reviews, the multi-model dispatch happens in both the initial review and the re-review, ensuring fixes do not introduce new issues visible to other models.

### Frontmatter Pattern

Review steps follow a consistent frontmatter structure:

```yaml
---
name: review-{artifact}
description: "Review {artifact} for completeness, consistency, and downstream readiness"
phase: "{phase-slug}"
order: {N}20  # Reviews are always 10 after their creation step
dependencies: [{creation-step}]
outputs: [docs/reviews/review-{artifact}.md, docs/reviews/{artifact}/review-summary.md, docs/reviews/{artifact}/codex-review.json, docs/reviews/{artifact}/gemini-review.json]
conditional: null
knowledge-base: [review-methodology, review-{artifact-domain}]
---
```

Key conventions:
- Review steps always have order = creation step order + 10
- Primary output uses `review-` prefix; multi-model directory uses bare artifact name
- Knowledge base always includes `review-methodology` plus a domain-specific entry
- Reviews are never conditional — if the creation step ran, the review runs

### Common Anti-Patterns

### Reviewing Without Upstream Context
Running a review without loading the upstream artifacts that define requirements.
The review cannot verify traceability if it does not have the PRD, domain models,
or ADRs that establish what the artifact should contain.

### Severity Inflation
Marking everything as P0 to force immediate action. This undermines the severity
system and causes triage fatigue. Reserve P0 for genuine blockers where downstream
steps will fail or produce incorrect output.

### Fix Without Re-Review
Applying fixes to findings without re-running the review. Fixes can introduce new
issues or incompletely address the original finding. Always re-review after fixes.

### Ignoring Convergent Multi-Model Findings
When multiple models independently find the same issue, it has high confidence.
Dismissing convergent findings without strong justification undermines the value
of multi-model review.

### Removing Prior Findings
Deleting findings from a re-review output instead of marking them RESOLVED. This
loses review history and makes it impossible to track what was caught and fixed.

---

## After This Step

Continue with: `/scaffold:critical-path-walkthrough`, `/scaffold:cross-phase-consistency`, `/scaffold:decision-completeness`, `/scaffold:dependency-graph-validation`, `/scaffold:implementability-dry-run`, `/scaffold:scope-creep-check`, `/scaffold:traceability-matrix`
