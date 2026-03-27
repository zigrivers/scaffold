---
description: "Testing strategy review for completeness and quality"
long-description: "Performs a structured multi-pass review of the testing strategy, targeting failure modes specific to test planning artifacts. Covers coverage gaps by architectural layer, domain invariant test cases, test environment assumptions, performance test coverage, integration boundary coverage, and quality gate completeness."
---

Perform a structured multi-pass review of the testing strategy, targeting failure modes specific to test planning artifacts. Follow the review methodology from review-methodology knowledge base.

## Mode Detection

Check if `docs/reviews/review-testing.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated testing strategy
3. Run all review passes again on the current strategy
4. Focus on: remaining unresolved findings, regressions from fixes, and any new test categories added since the last review
5. Update the review report rather than replacing it — preserve the fix history

## Review Process

### Step 1: Read the Artifact

Read `docs/tdd-standards.md` completely. Also read `docs/domain-models/` for invariant coverage and `docs/system-architecture.md` for architectural layer coverage cross-reference.

### Step 2: Multi-Pass Review

Execute 6 review passes. For each pass, re-read the artifact with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: Coverage Gaps by Layer**
List every architectural layer from the system architecture. For each, verify the testing strategy specifies: test types, what the tests verify, and coverage expectations. Check the test pyramid balance — unit tests most numerous, integration fewer, E2E fewest. Verify each layer's test scope matches its architectural responsibility. Check external dependency approach (mocks, test doubles, contract tests, testcontainers). Flag layers with no test coverage.

**Pass 2: Domain Invariant Test Cases**
List every domain invariant from domain models. For each, find at least one test scenario. Check both positive (invariant holds) and negative (invariant violated, system rejects) cases. Verify edge cases: boundary values, null/empty inputs, concurrent modifications. Check cross-aggregate invariants have integration-level tests, not just unit tests. Invariant violations are often the most expensive production bugs.

**Pass 3: Test Environment Assumptions**
Compare test database to production (same engine? same version? same config?). Check external service test doubles replicate real behavior including errors, latency, and edge cases. Verify test data represents realistic production volumes and shapes. Check for environment-specific behavior: timezone, locale, file paths. Verify CI/CD test environment is specified and matches local. Check test isolation — are tests truly independent?

**Pass 4: Performance Test Coverage**
List performance requirements from PRD and architecture (response time, throughput, concurrent users, data volume). For each, find a corresponding performance test. Verify thresholds are specific ("95th percentile < 200ms" not "should be fast"). Check load testing matches actual concurrent user targets. Verify stress testing beyond expected load for graceful degradation. Check performance regression tracking over time.

**Pass 5: Integration Boundary Coverage**
List every integration point: service-to-service calls, database queries, message queue producers/consumers, external API integrations. For each, verify an integration test exists using real (or realistic) dependencies, not mocks. Verify contract tests for external APIs. Check async integration points test real behavior including ordering, retry, and failure. Verify database integration tests execute actual SQL.

**Pass 6: Quality Gate Completeness**
List every quality requirement (coverage thresholds, linting, type checking, security scanning). For each, verify it maps to a CI pipeline step. Check gate failure blocks deployment (not just warns). Verify code coverage thresholds and enforcement. Check for security scanning, secrets detection, and migration validation. Verify gate ordering: fast checks first (lint, type check), slow checks later (integration, E2E). Flag missing gates.

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| TST-001 | P0 | Pass 1 | [description] | [section/layer] |
| TST-002 | P1 | Pass 2 | [description] | [invariant] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing test layer — fix once
- **Same section**: Findings in the same strategy section — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected strategy sections.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to `docs/tdd-standards.md`. For each fix, verify it does not break alignment with architecture layers or domain invariants.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not break alignment with architecture layers or domain invariant coverage
3. Check for test pyramid imbalance or environment assumption issues introduced by the fix

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/review-testing.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3. MANDATORY at depth 4+.**

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns and auth verification in the `multi-model-dispatch` skill.

**Previous auth failures do NOT exempt this dispatch.** Auth tokens refresh — always re-check before each review step.

1. **Verify auth**: Run `codex login status` and `NO_BROWSER=true gemini -p "respond with ok" -o json 2>/dev/null` (exit 41 = auth failure). If auth fails, tell the user to run `! codex login` or `! gemini -p "hello"` for interactive recovery. Do not silently skip.
2. **Bundle context**: Include the reviewed artifact + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- `docs/tdd-standards.md` (the reviewed artifact)
- `docs/system-architecture.md`
- `docs/coding-standards.md`
- Focus areas: missing test layers, untested invariants, incomplete quality gates

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read `docs/tdd-standards.md`, `docs/domain-models/`, and `docs/system-architecture.md`
2. Execute all 6 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. (Depth 4+) Dispatch multi-model validation — verify CLI auth, bundle context, dispatch, reconcile findings, apply high-confidence fixes
9. Write review report to `docs/reviews/review-testing.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — Testing strategy review findings documented in `docs/reviews/review-testing.md`.

**Next:** Run `/scaffold:create-evals` to generate automated eval checks, or `/scaffold:operations` to create the operations runbook.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
