---
description: "Review testing strategy for coverage gaps and feasibility"
long-description: "Audits the testing strategy for coverage gaps by layer, verifies edge cases from domain invariants are tested, and checks that test environment assumptions match actual config."
---

## Purpose
Review testing strategy targeting testing-specific failure modes: coverage gaps
by layer, missing edge cases from domain invariants, unrealistic test environment
assumptions, inadequate performance test coverage, and missing integration boundaries.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/tdd-standards.md (required) — strategy to review
- docs/domain-models/ (required) — for invariant test case coverage
- docs/system-architecture.md (required) — for layer coverage

## Expected Outputs
- docs/reviews/review-testing.md — findings and resolution log
- docs/tdd-standards.md — updated with fixes
- docs/reviews/testing/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/testing/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/testing/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Coverage gaps by layer documented with severity
- (deep) If docs/domain-models/ exists, domain invariant test cases verified. Otherwise, test invariants derived from story acceptance criteria.
- (deep) Each test environment assumption verified against actual environment config or flagged as unverifiable
- (deep) Performance test coverage assessed against NFRs
- (deep) Integration boundaries have integration tests defined
- Every finding categorized P0-P3 (P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.) with specific test layer, gap, and issue
- Fix plan documented for all P0/P1 findings; fixes applied to tdd-standards.md and re-validated
- Downstream readiness confirmed — no unresolved P0 or P1 findings remain before operations step proceeds
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: Full multi-pass review targeting all testing failure modes. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Coverage gap check only.
- **custom:depth(1-5)**:
  - Depth 1: Test coverage and pyramid balance pass only (1 review pass)
  - Depth 2: Add test quality and naming convention passes (2 review passes)
  - Depth 3: Add edge case coverage and CI integration passes (4 review passes)
  - Depth 4: Add external model review (4 review passes + external dispatch)
  - Depth 5: Multi-model review with reconciliation (4 review passes + multi-model synthesis)

## Mode Detection
Re-review mode if docs/reviews/review-testing.md or docs/reviews/testing/
directory exists. If multi-model review artifacts exist under
docs/reviews/testing/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-testing.md` exists with tracking comment
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

### review-testing-strategy

*Failure modes and review passes specific to testing and quality strategy artifacts*

# Review: Testing Strategy

The testing strategy defines how the system will be verified at every layer. It must cover unit tests through end-to-end tests, address domain-specific invariants, align with the architecture's component boundaries, and define quality gates for CI/CD. This review uses 6 passes targeting the specific ways testing strategies fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Coverage Gaps by Layer**: Each architectural layer has test coverage defined; test pyramid is balanced (not top-heavy or bottom-heavy).
- **Pass 2 — Domain Invariant Test Cases**: Every domain invariant has at least one corresponding test scenario covering positive and negative cases.
- **Pass 3 — Test Environment Assumptions**: Test environment matches production constraints; database engines, service configurations, and test data are realistic.
- **Pass 4 — Performance Test Coverage**: Performance-critical paths have benchmarks with specific thresholds; load and stress testing scenarios defined.
- **Pass 5 — Integration Boundary Coverage**: All component integration points have integration tests using real (not mocked) dependencies.
- **Pass 6 — Quality Gate Completeness**: CI pipeline gates cover linting, type checking, tests, and security scanning; gates block deployment on failure.

## Deep Guidance

---

## Pass 1: Coverage Gaps by Layer

### What to Check

Each architectural layer (domain logic, application services, API, database, frontend, integration points) has test coverage defined. The test pyramid is balanced — not top-heavy (too many E2E tests) or bottom-heavy (unit tests only, no integration).

### Why This Matters

Missing test coverage at any layer creates a blind spot where bugs hide. Too many E2E tests create slow, flaky test suites that developers disable. Too few integration tests mean components work in isolation but fail when connected. The testing strategy must specify what gets tested at which level with clear rationale.

### How to Check

1. List every architectural layer from the system architecture
2. For each layer, verify the testing strategy specifies: what types of tests, what the tests verify, approximate coverage expectations
3. Check the test pyramid balance: unit tests should be most numerous, integration tests fewer, E2E tests fewest
4. Verify that each layer's test scope matches its architectural responsibility
5. Check for layers with no test coverage defined — these are the blind spots
6. Verify that the testing strategy addresses external dependencies: how are third-party APIs, databases, and services handled in tests? (Mocks, test doubles, contract tests, testcontainers)

### What a Finding Looks Like

- P0: "The database layer has no test coverage defined. No mention of schema validation tests, migration tests, or query correctness tests."
- P1: "Testing strategy defines unit tests and E2E tests but no integration tests. Components are tested in isolation and in full-system context, but never at the boundary — this misses component integration bugs."
- P1: "External API dependencies (payment gateway, email service) have no test approach defined. Are they mocked? Stubbed? Is there a contract test?"
- P2: "Test pyramid is inverted: 50 E2E tests, 20 integration tests, 15 unit tests. This will produce a slow, flaky test suite."

---

## Pass 2: Domain Invariant Test Cases

### What to Check

Every domain invariant from the domain models has at least one corresponding test scenario defined. Invariants are the highest-value test targets because they define business correctness.

### Why This Matters

Domain invariants are the rules the business cannot tolerate being violated. If the invariant "order total must equal sum of line items minus discounts" is not tested, a calculation bug could ship to production. Invariant violations are often the most expensive production bugs — they corrupt data, break financial calculations, or violate regulatory requirements.

### How to Check

1. List every domain invariant from the domain models
2. For each invariant, find at least one test scenario in the testing strategy
3. Check that test scenarios cover both the positive case (invariant holds) and negative case (invariant is violated — system rejects the operation)
4. Verify that edge cases are considered: boundary values, null/empty inputs, concurrent modifications
5. Check for invariants that span multiple aggregates — these need integration-level tests, not just unit tests
6. Verify that invariant tests are classified at the correct pyramid level: aggregate-internal invariants at unit level, cross-aggregate invariants at integration level

### What a Finding Looks Like

- P0: "Domain invariant 'account balance cannot be negative' has no corresponding test scenario. This is a financial correctness requirement that must be tested."
- P1: "Invariant 'email must be unique per tenant' has a unit test scenario but no integration test. The unit test mocks the uniqueness check — only an integration test against the real database can verify the constraint."
- P2: "Invariant 'order must have at least one line item' has a positive test but no negative test (what happens when creating an order with zero items)."

---

## Pass 3: Test Environment Assumptions

### What to Check

The test environment described in the strategy matches production constraints. Database versions, service configurations, and external dependency behavior in tests reflect what will exist in production.

### Why This Matters

Tests that pass against SQLite but fail against PostgreSQL. Tests that mock a payment gateway's happy path but never test the timeout behavior that will happen in production. Test environment mismatches are the primary reason "tests pass, production breaks." The testing strategy must be explicit about how the test environment relates to production.

### How to Check

1. Compare the test database to the production database: same engine? Same version? Same configuration?
2. Check external service test doubles: do they replicate the real service's behavior, including errors, latency, and edge cases?
3. Verify that test data represents realistic production conditions: data volumes, data shapes, edge case values
4. Check for environment-specific behavior: timezone handling, locale, file system paths, network configuration
5. Verify that CI/CD test environment is specified and matches local test environment
6. Check for assumptions about test ordering or test isolation — are tests truly independent?

### What a Finding Looks Like

- P0: "Tests run against SQLite but production uses PostgreSQL. SQLite and PostgreSQL have different type systems, different locking behavior, and different SQL dialect support. Tests will pass locally and fail in production."
- P1: "Payment gateway is mocked to always return success. No test scenario covers timeout, network error, or declined payment — all common production scenarios."
- P2: "Test data uses 5 records per table but production will have millions. Performance-sensitive queries are not tested at scale."

---

## Pass 4: Performance Test Coverage

### What to Check

Performance-critical paths identified in the PRD or architecture have benchmarks defined. Load testing, stress testing, and latency requirements have corresponding test scenarios.

### Why This Matters

Performance requirements stated in the PRD ("sub-200ms API response," "handle 1000 concurrent users") are meaningless without tests that verify them. Performance regressions are invisible to functional tests — the system still returns correct results, just slowly. By the time performance issues are discovered in production, the fix often requires architectural changes.

### How to Check

1. List performance requirements from the PRD and architecture (response time, throughput, concurrent users, data volume)
2. For each requirement, find a corresponding performance test scenario
3. Verify that benchmarks have specific thresholds (not "should be fast" but "95th percentile response time < 200ms")
4. Check for load testing: is the expected concurrent user load tested?
5. Check for stress testing: what happens beyond expected load? (Graceful degradation vs. crash)
6. Verify that performance tests run in an environment representative of production (not a developer laptop)
7. Check for performance regression detection: are benchmarks tracked over time?

### What a Finding Looks Like

- P0: "PRD requires 'sub-200ms response time for search queries' but no performance test scenario exists. There is no way to verify this requirement is met."
- P1: "Load testing scenario exists for 100 concurrent users, but the PRD targets 10,000. The test does not verify the actual requirement."
- P2: "Performance tests exist but have no regression tracking. A performance degradation from a code change will not be detected until it reaches production."

---

## Pass 5: Integration Boundary Coverage

### What to Check

All component integration points have integration tests defined. Every API call between services, every database query pattern, every message queue interaction has a test at the integration level.

### Why This Matters

Integration boundaries are where bugs hide. Each component may work perfectly in isolation (unit tests pass) but fail when connected to another component due to serialization mismatches, protocol errors, authentication failures, or contract violations. Integration tests catch these by testing real component interactions.

### How to Check

1. List every integration point from the architecture: service-to-service calls, database queries, message queue producers/consumers, external API integrations
2. For each integration point, verify a test scenario exists at the integration level
3. Check that integration tests use real (or realistic) dependencies, not mocks (that is what unit tests are for)
4. Verify that contract tests exist for external APIs: when the external API changes, do tests catch the break?
5. Check for async integration points (message queues, webhooks): are these tested with real async behavior, including ordering, retry, and failure scenarios?
6. Verify that database integration tests cover actual query execution (not mocked repositories)

### What a Finding Looks Like

- P0: "OrderService calls InventoryService to reserve stock, but no integration test verifies this interaction. If the request format changes, the break is undetected."
- P1: "Database repository tests mock the database connection. There are no tests that execute actual SQL against a real database — schema errors, query syntax errors, and constraint violations are invisible."
- P2: "Event consumer integration tests verify message processing but not message ordering or duplicate handling."

---

## Pass 6: Quality Gate Completeness

### What to Check

The CI pipeline quality gates catch all intended issues before code reaches production. Gates cover linting, type checking, unit tests, integration tests, security scanning, and any project-specific checks.

### Why This Matters

A quality gate that exists in documentation but not in CI is not a gate. If the testing strategy says "all code must pass linting" but the CI pipeline does not run a linter, the gate is aspirational. Quality gates must be concrete: what tool, what configuration, what threshold, what happens on failure.

### How to Check

1. List every quality requirement from the testing strategy (code coverage thresholds, linting rules, type checking, security scanning)
2. For each requirement, verify it maps to a specific CI pipeline step
3. Check that gate failure blocks deployment (not just warns)
4. Verify code coverage thresholds are specified and enforced: what percentage? Per file or overall? Is it a gate or a report?
5. Check for security scanning: dependency vulnerability scanning, static analysis, secrets detection
6. Verify that the gate order is correct: fast checks first (lint, type check), slow checks later (integration tests, E2E tests)
7. Check for missing gates: database migration validation, API contract validation (schema against implementation), documentation generation

### What a Finding Looks Like

- P0: "Testing strategy requires 80% code coverage but the CI pipeline has no coverage reporting or enforcement. The requirement is unverifiable."
- P1: "Security scanning is listed as a quality requirement but no specific tool or CI pipeline step implements it."
- P2: "Quality gates run linting, unit tests, and integration tests, but do not validate database migrations. A broken migration would pass all gates and fail in production."

---

## Common Review Anti-Patterns

### 1. Copy-Pasted Generic Strategy

The testing strategy is a boilerplate document that says "we will have unit tests, integration tests, and E2E tests" without connecting to the actual architecture. No mention of specific components, no mapping of test types to architectural layers, no project-specific invariants.

**How to spot it:** The strategy could be copy-pasted into any other project and still read correctly. No component names, no domain terms, no architecture-specific decisions.

### 2. Testing Strategy Disconnected from Architecture

The strategy defines test types and coverage goals but does not reference the system architecture. Tests are organized by test framework (Jest unit tests, Playwright E2E tests) rather than by architectural component. This makes it impossible to verify coverage — you cannot tell which components are tested and which are not.

**How to spot it:** Search for component names from the architecture document. If none appear in the testing strategy, the two documents are disconnected.

### 3. Mock-Everything Mentality

Every external dependency is mocked, including the database. Unit test coverage is high, but no test ever executes a real query, a real HTTP call, or a real message queue interaction. The test suite provides confidence that the mocking layer works, not that the system works.

**Example finding:**

```markdown
## Finding: TSR-009

**Priority:** P1
**Pass:** Integration Boundary Coverage (Pass 5)
**Document:** docs/testing-strategy.md, Section 4.2

**Issue:** All database tests use an in-memory mock repository. The repository interface
is tested, but no test ever executes SQL against a real PostgreSQL instance. The following
risks are untested: query syntax errors, constraint violations, transaction isolation
behavior, migration correctness.

**Recommendation:** Add integration tests using testcontainers or a CI-managed PostgreSQL
instance for at least the OrderRepository and UserRepository (the two repositories with
complex queries).
```

### 4. No Negative Test Scenarios

The strategy defines tests for the happy path but never specifies what happens when things fail. No test scenarios for invalid input, network timeouts, concurrent modification, or resource exhaustion. The system is verified to work when everything goes right — the most uninteresting case.

**How to spot it:** Scan test scenario descriptions for words like "invalid," "timeout," "failure," "error," "reject," "concurrent," "duplicate." If these are absent, negative scenarios are missing.

### 5. Coverage Percentage as the Only Quality Metric

The strategy defines 80% code coverage as the quality gate but specifies no other quality criteria. High coverage with no assertion quality means tests that execute code paths without verifying behavior — "tests" that call functions and ignore the return value. Coverage measures how much code was run, not whether it was tested correctly.

**How to spot it:** The quality gates section mentions only code coverage. No mention of mutation testing, assertion density, test execution time budgets, or flakiness tracking.

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

Continue with: `/scaffold:operations`
