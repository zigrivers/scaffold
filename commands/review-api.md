---
description: "API contracts review for completeness and quality"
long-description: "Performs a structured multi-pass review of API contracts, targeting failure modes specific to API specification artifacts. Covers operation coverage, error handling, auth/authz, versioning, payload alignment, idempotency, pagination, and downstream readiness for UX and implementation."
---

Perform a structured multi-pass review of API contracts, targeting failure modes specific to API contract artifacts. Follow the review methodology from review-methodology knowledge base.

## Mode Detection

Check if `docs/reviews/review-api.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated API contracts
3. Run all review passes again on the current contracts
4. Focus on: remaining unresolved findings, regressions from fixes, and any new endpoints added since the last review
5. Update the review report rather than replacing it — preserve the fix history

## Review Process

### Step 1: Read the Artifact

Read `docs/api-contracts.md` completely. Also read `docs/domain-models/` for operation coverage, `docs/adrs/` for consistency checking, and `docs/system-architecture.md` for interface coverage cross-reference.

### Step 2: Multi-Pass Review

Execute 8 review passes. For each pass, re-read the artifact with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: Operation Coverage**
List every component interaction from architecture data flows. For each crossing a boundary, verify a corresponding endpoint exists. Cross-reference domain model aggregate commands (create, update, delete) exposed beyond their owning service. Check read operations match architecture query patterns. Verify admin operations (user management, configuration) and operational endpoints (health checks, metrics).

**Pass 2: Error Contract Completeness**
For each endpoint, list documented error responses. Check standard errors every endpoint should handle: 400, 401, 403, 404, 500. Check domain-specific errors: business rule violations, state transition errors, constraint violations. Verify error response bodies have consistent structure across all endpoints. Check for 429 if rate limiting exists. Verify error responses do not leak internal details.

**Pass 3: Auth/AuthZ Coverage**
For each endpoint, check authentication (unauthenticated, user token, service token, API key) and authorization (role, permission, ownership). Verify resource-ownership rules ("users can only access their own orders"). Check admin endpoints have additional protections. Confirm public endpoints are explicitly marked public (not just missing auth). Check cross-service authentication mechanism.

**Pass 4: Versioning Consistency**
Find the API versioning ADR. Verify every endpoint follows the same versioning scheme. Flag endpoints with no version indicator — intentionally unversioned or accidentally missed? Check for inconsistent path structures (/v1/ vs /api/v1/). Verify backward compatibility commitments and client upgrade documentation.

**Pass 5: Payload Shape vs Domain Entities**
For each endpoint, compare request/response fields to domain entity attributes. Check field names match ubiquitous language terminology. Verify types match (Money as amount+currency, not plain number). Check nested structures reflect aggregate boundaries. Flag exposed internal database fields (auto-increment IDs, audit columns). Check for missing domain attributes.

**Pass 6: Idempotency**
For each POST, check idempotency key mechanism (header, deduplication key, format, expiration). Verify PUT is naturally idempotent. Check PATCH operations case-by-case (setting a value vs appending). Check DELETE repeated-call behavior (404 or 204). Flag operations with side effects (email, payments) — must be idempotent or explicitly documented as non-idempotent.

**Pass 7: Pagination/Filtering**
Identify every list/collection endpoint. Verify pagination parameters (page/size, cursor, offset/limit). Check response metadata: total count or has-next indicator, current page/cursor, page size. Verify filter parameters cover architecture data flow query patterns. Check sort parameters and default order. Verify maximum page size enforcement.

**Pass 8: Downstream Readiness**
For UX spec: verify every user-facing action has an endpoint, response shapes support screen layouts, error responses enable error state design, and async operations have polling/webhook mechanisms. For implementation tasks: verify endpoint complexity is visible for scoping, dependencies between endpoints are clear, and integration points with external services are specified.

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| API-001 | P0 | Pass 1 | [description] | [endpoint] |
| API-002 | P1 | Pass 2 | [description] | [endpoint] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing domain operation — fix once
- **Same endpoint**: Findings on the same endpoint — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected contract sections.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to `docs/api-contracts.md`. For each fix, verify it does not break alignment with domain models, ADR decisions, or architecture interfaces.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not break domain model alignment, ADR consistency, or architecture interfaces
3. Check for payload shape or versioning inconsistencies introduced by the fix

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/review-api.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3.**

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns in the `multi-model-dispatch` skill.

1. **Detect CLIs**: Check for `codex` and `gemini` CLI availability
2. **Bundle context**: Include the reviewed artifact + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- `docs/api-contracts.md` (the reviewed artifact)
- `docs/domain-models/` directory
- `docs/system-architecture.md`
- `docs/user-stories.md`
- Focus areas: missing error cases, auth gaps, payload mismatches, idempotency oversights

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read `docs/api-contracts.md`, `docs/domain-models/`, `docs/adrs/`, and `docs/system-architecture.md`
2. Execute all 8 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. Write review report to `docs/reviews/review-api.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — API contracts review findings documented in `docs/reviews/review-api.md`.

**Next:** Run `/scaffold:ux-spec` to create the UX specification informed by the reviewed API contracts.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
