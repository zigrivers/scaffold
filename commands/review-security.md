---
description: "Security review for completeness and quality"
long-description: "Performs a structured multi-pass review of the security review document, targeting failure modes specific to security artifacts. Covers OWASP coverage, auth/authz boundary alignment, secrets management, dependency audit, threat model scenarios, data classification, and input validation."
---

Perform a structured multi-pass review of the security review document, targeting failure modes specific to security artifacts. Follow the review methodology from review-methodology knowledge base.

## Mode Detection

Check if `docs/reviews/review-security.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated security review
3. Run all review passes again on the current security document
4. Focus on: remaining unresolved findings, regressions from fixes, and any new threat scenarios or boundaries added since the last review
5. Update the review report rather than replacing it — preserve the fix history

## Review Process

### Step 1: Read the Artifact

Read `docs/security-review.md` completely. Also read `docs/api-contracts.md` (if available) for auth boundary alignment and `docs/system-architecture.md` for attack surface coverage cross-reference.

### Step 2: Multi-Pass Review

Execute 7 review passes. For each pass, re-read the artifact with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: OWASP Coverage**
Verify all 10 OWASP Top 10 categories are addressed: Broken Access Control, Cryptographic Failures, Injection, Insecure Design, Security Misconfiguration, Vulnerable Components, Identity/Auth Failures, Data Integrity Failures, Logging Failures, SSRF. Check each assessment is project-specific — mitigations reference specific architecture components, not generic advice ("the OrderRepository uses Prisma with parameterized queries" not "use an ORM"). Validate "not applicable" rationale. Check for OWASP categories beyond Top 10 for specific risk profiles.

**Pass 2: Auth/AuthZ Boundary Alignment**
List every security boundary (roles, permissions, resource ownership, service trust). For each API endpoint, verify auth/authz aligns with security review definitions. Flag endpoints with weaker access control than the security review intends. Check resource-level authorization consistency ("users can only access their own orders"). Verify service-to-service authentication matches between documents. Check admin/elevated-privilege endpoints have additional protections.

**Pass 3: Secrets Management**
Verify explicit statement: no secrets in code or version control. Check secrets management approach (vault, secrets manager, encrypted config). Verify rotation strategy with specific periods, processes, and emergency rotation for suspected compromise. Check all categories: API keys, database credentials, JWT signing keys, encryption keys, service tokens. Verify local dev secrets handling (.env with .gitignore, .env.example template). Check CI/CD secret injection.

**Pass 4: Dependency Audit Coverage**
Verify scanning tool is specified (npm audit, Snyk, Dependabot, Trivy). Check scanning runs automatically in CI, not just locally. Verify transitive dependency coverage. Check vulnerability response policy: severity thresholds (block on critical/high), response times (critical: 24h), and exception process. Verify container image scanning if applicable. Check all package ecosystems are covered (npm, pip, go modules).

**Pass 5: Threat Model Scenarios**
Verify structured methodology (STRIDE, PASTA, or similar). List all trust boundaries from architecture: client-to-server, service-to-service, service-to-database, service-to-external-API. For each, verify threats are enumerated with project-specific detail ("SQL injection via search parameter on GET /products"). Check likelihood and impact assessments. Verify mitigations are mapped to threats. Check residual risk documentation. Verify insider threat scenarios.

**Pass 6: Data Classification**
Verify classification levels are defined (public, internal, confidential, restricted). For each level, check handling requirements: encryption at rest/transit, access control, audit logging, retention, disposal. Map domain entities to levels (which contain PII? financial data? health data?). Verify data flows respect classification. Check regulatory compliance (GDPR, PCI-DSS, HIPAA). Verify derived data coverage (logs with PII, backups with classified data).

**Pass 7: Input Validation**
List every system boundary where external data enters: API endpoints, message consumers, file uploads, webhooks, admin interfaces. For each, verify validation is specified. Check validation covers type, format (email, URL, date), range (min/max), and allowed values (enums, whitelists). Verify server-side validation (not relying on client-side for security). Check file upload content validation (not just extension). Verify rate limiting on input-accepting endpoints.

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| SEC-001 | P0 | Pass 1 | [description] | [OWASP category] |
| SEC-002 | P1 | Pass 2 | [description] | [endpoint/boundary] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing security control — fix once
- **Same section**: Findings in the same security domain — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected security review sections.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to `docs/security-review.md`. For each fix, verify it does not break alignment with API contracts, architecture trust boundaries, or operations secrets handling.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not break alignment with API contracts, architecture boundaries, or operations secrets handling
3. Check for auth/authz gaps or threat model inconsistencies introduced by the fix

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/review-security.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3. MANDATORY at depth 4+.**

**Security review is the highest-priority candidate for multi-model validation.** Different models catch different threat classes — what one model considers safe, another may flag as vulnerable.

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns and auth verification in the `multi-model-dispatch` skill.

**Previous auth failures do NOT exempt this dispatch.** Auth tokens refresh — always re-check before each review step.

1. **Verify auth**: Run `codex login status` and `NO_BROWSER=true gemini -p "respond with ok" -o json 2>/dev/null` (exit 41 = auth failure). If auth fails, tell the user to run `! codex login` or `! gemini -p "hello"` for interactive recovery. Do not silently skip.
2. **Bundle context**: Include the reviewed artifact + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- `docs/security.md` (the reviewed artifact)
- `docs/system-architecture.md`
- `docs/api-contracts.md`
- `docs/database-schema.md`
- Focus areas: OWASP gaps, auth boundary misalignment, secrets management, undocumented attack surfaces

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read `docs/security-review.md`, `docs/api-contracts.md` (if it exists), and `docs/system-architecture.md`
2. Execute all 7 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. (Depth 4+) Dispatch multi-model validation — verify CLI auth, bundle context, dispatch, reconcile findings, apply high-confidence fixes
9. Write review report to `docs/reviews/review-security.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — Security review findings documented in `docs/reviews/review-security.md`.

**Next:** Run `/scaffold:implementation-plan` to create the implementation task graph informed by the reviewed security posture.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
