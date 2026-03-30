---
description: "Build traceability from PRD requirements through architecture to implementation tasks"
long-description: "Builds a map showing that every PRD requirement traces through to user stories, architecture components, implementation tasks, and test cases — with no gaps in either direction."
---

## Purpose
Build traceability from PRD requirements through user stories and architecture
to implementation tasks. Verify the full chain: PRD → User Stories → Domain
Model → Architecture → Tasks, with no orphans in either direction. Every PRD
requirement must trace to at least one story, every story to at least one task.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent traceability validation — different models catch different
coverage gaps.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)
- docs/story-tests-map.md (required if exists) — AC-to-test-case traceability
- tests/acceptance/ (required if exists) — test skeleton files for verification
- docs/eval-standards.md (required if exists) — eval coverage documentation

## Expected Outputs
- docs/validation/traceability-matrix.md — findings report
- docs/validation/traceability-matrix/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/traceability-matrix/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/traceability-matrix/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Every feature and user-facing behavior in the PRD's feature list maps to >= 1 user story
- (mvp) Every user story maps to >= 1 implementation task
- (deep) Every acceptance criterion maps to >= 1 test case (verified against `docs/story-tests-map.md`)
- (deep) Every test case maps to >= 1 implementation task
- (deep) Every Must-have and Should-have item maps to >= 1 downstream artifact. Nice-to-have items may be orphaned with explicit rationale.
- (deep) Bidirectional traceability verified: PRD → Stories → Domain → Architecture → Tasks
- (mvp) Findings categorized P0-P3 with specific file, section, and issue for each
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Finding Disposition
- **P0 (blocking)**: Must be resolved before proceeding to implementation. Create
  fix tasks and re-run affected upstream steps.
- **P1 (critical)**: Should be resolved; proceeding requires explicit risk acceptance
  documented in an ADR. Flag to project lead.
- **P2 (medium)**: Document in implementation plan as tech debt. May defer to
  post-launch with tracking issue.
- **P3 (minor)**: Log for future improvement. No action required before implementation.

Findings are reported in the validation output file with severity, affected artifact,
and recommended resolution. P0/P1 findings block the implementation-plan step from
proceeding without acknowledgment.

## Methodology Scaling
- **deep**: Exhaustive analysis with all sub-checks. Multi-model validation
  dispatched to Codex and Gemini if available, with graceful fallback to
  Claude-only enhanced validation.
- **mvp**: High-level scan for blocking issues only.
- **custom:depth(1-5)**:
  - Depth 1: PRD requirement to user story mapping only.
  - Depth 2: add story to implementation task mapping.
  - Depth 3: full bidirectional chain (PRD → story → task → test → eval).
  - Depth 4: add external model verification of coverage gaps.
  - Depth 5: multi-model reconciliation with gap resolution recommendations.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/traceability-matrix/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/traceability-matrix/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding

---

## Domain Knowledge

### traceability

*Building traceability matrices from requirements through architecture to implementation tasks*

# Traceability

Traceability validation ensures that every requirement flows from its origin in the PRD through domain modeling, architecture decisions, system design, and into implementable tasks. A complete traceability matrix is the strongest evidence that nothing has been lost or invented during the documentation pipeline.

## Summary

- **Traceability matrix**: A table where each row is a requirement and columns are pipeline artifacts (domain, ADR, architecture, schema, API, UX, tasks, tests). Empty cells are gaps.
- **Build process**: Extract all PRD requirements (functional, NFR, constraints, deferred), then trace each forward through every downstream artifact.
- **Gap detection**: Empty cells (not N/A), orphaned artifacts tracing to no requirement, thin traces, and deferred items appearing downstream.
- **Bidirectional tracing**: Forward (requirement -> implementation) catches gaps; backward (implementation -> requirement) catches scope creep.
- **NFR tracing**: Performance, security, and accessibility requirements cut across components and need special tracing through architecture, schema, API, testing, and UX.
- **Common issues**: Orphan features, assumed infrastructure, tested-but-not-specified behaviors, specified-but-not-tested requirements, and split requirements across unlinked tasks.
- Use consistent identifiers (REQ-001, ADR-003, T-012) so traces are searchable across all artifacts.

## Deep Guidance

## What a Traceability Matrix Is

A traceability matrix is a table where each row represents a requirement and each column represents a pipeline artifact. A complete row means the requirement is fully traced from origin to implementation. A missing cell means a gap — either the requirement was not addressed at that phase, or it was addressed but the connection is not explicit.

### The Columns

| Column | Source Artifact | What to Extract |
|--------|----------------|-----------------|
| **Requirement** | PRD | Feature descriptions, user needs, NFRs, constraints |
| **Domain Concept** | Domain Model | Which entities, aggregates, events, or invariants relate to this requirement |
| **Decision** | ADRs | Which architectural decisions were made to support this requirement |
| **Architecture** | System Architecture | Which components, modules, or services implement this requirement |
| **Data** | Database Schema | Which tables, columns, or indexes support this requirement |
| **API** | API Contracts | Which endpoints or operations expose this requirement |
| **UX** | UX Specification | Which screens, flows, or components deliver this requirement to users |
| **Task** | Implementation Tasks | Which tasks implement this requirement |
| **Test** | Testing Strategy | Which test cases verify this requirement |

Not every requirement needs every column. A backend NFR like "p95 latency under 200ms" will not have a UX column. A database requirement will not have a UX column. The matrix should indicate "N/A" for legitimately inapplicable cells versus blank for gaps.

## How to Build the Matrix

### Step 1: Extract Requirements from PRD

Read the PRD and extract every discrete requirement. Include:

- **Functional requirements** — Features, user stories, acceptance criteria.
- **Non-functional requirements** — Performance, security, scalability, accessibility, availability.
- **Constraints** — Technology mandates, timeline, budget, regulatory.
- **Deferred items** — Requirements explicitly marked as out of scope or deferred. Track these too — they should NOT appear in downstream artifacts.

Give each requirement a unique identifier (e.g., `REQ-001`). If the PRD does not number them, assign them during extraction.

### Step 2: Trace Each Requirement Forward

For each requirement, search downstream artifacts for references:

1. **Domain Model:** Which domain concepts address this requirement? Look for entities that model the data, events that represent state changes, invariants that enforce rules.

2. **ADRs:** Which decisions were driven by this requirement? Technology choices, pattern selections, trade-off resolutions.

3. **Architecture:** Which component or module is responsible? Where does this requirement live in the system structure?

4. **Database Schema:** Which tables store the data? Which indexes support the queries? Which constraints enforce the rules?

5. **API Contracts:** Which endpoints expose the functionality? Which request/response shapes carry the data?

6. **UX Spec:** Which screens display the information? Which user flows exercise the feature? Which form inputs capture the data?

7. **Tasks:** Which implementation tasks build this feature? Are all layers covered (backend, frontend, infrastructure)?

8. **Tests:** Which test cases verify the requirement works correctly? Are edge cases covered?

### Step 3: Identify Gaps

After building the matrix, scan for:

- **Empty cells (not N/A)** — A requirement that reaches architecture but has no tasks is a gap. A requirement with tasks but no tests is a gap.
- **Orphaned artifacts** — Artifacts that trace to no requirement. These may indicate scope creep (see scope-management knowledge base) or missing PRD entries.
- **Thin traces** — A requirement that has only one task and one test for a complex feature. The trace exists but is insufficient.
- **Deferred items appearing downstream** — Requirements marked as deferred in the PRD but implemented in architecture or tasks.

### Step 4: Handle Missing Cells

For each gap, determine the appropriate action:

| Gap Type | Likely Action |
|----------|---------------|
| Requirement has no domain concept | Add to domain model or confirm it is a cross-cutting concern |
| Requirement has no ADR | Verify no decision was needed, or create an ADR |
| Requirement has no architecture component | Add component or map to existing component |
| Requirement has no schema support | Add schema elements (if requirement involves data persistence) |
| Requirement has no API endpoint | Add endpoint (if requirement involves external interface) |
| Requirement has no UX | Add UX elements (if requirement is user-facing) |
| Requirement has no tasks | Create tasks to implement it |
| Requirement has no tests | Add test cases |
| Artifact has no requirement | Flag as potential scope creep or identify missing PRD requirement |

## Matrix Format

### Compact Format (for overview)

```markdown
| Req ID | Requirement | Domain | ADR | Arch | DB | API | UX | Task | Test |
|--------|-------------|--------|-----|------|----|-----|----|------|------|
| REQ-001 | User registration | User entity | ADR-003 | AuthService | users | POST /auth/register | SignUp flow | T-012 | TS-001 |
| REQ-002 | Password reset | User.resetToken | ADR-003 | AuthService | users.reset_token | POST /auth/reset | Reset flow | T-015 | TS-002 |
| REQ-003 | p95 < 200ms | — | ADR-008 | CDN + caching | indexes | — | — | T-050 | TS-040 |
| REQ-004 | (deferred) Export PDF | — | — | — | — | — | — | — | — |
```

### Detailed Format (for gap investigation)

```markdown
## REQ-001: User Registration

**PRD Source:** Section 3.1, "Users must be able to create accounts with email and password"

**Domain Model Trace:**
- Entity: `User` (email, passwordHash, createdAt)
- Invariant: email must be unique
- Event: `UserRegistered`

**ADR Trace:**
- ADR-003: Use bcrypt for password hashing (cost factor 12)

**Architecture Trace:**
- Component: `AuthService` handles registration
- Data Flow: Client → API Gateway → AuthService → UserRepository → Database

**Schema Trace:**
- Table: `users` (id, email, password_hash, created_at)
- Index: `idx_users_email` UNIQUE
- Constraint: NOT NULL on email, password_hash

**API Trace:**
- POST /auth/register — request: {email, password}, response: {user, token}
- Error: 409 Conflict if email exists

**UX Trace:**
- Screen: SignUp (email input, password input, confirm password, submit)
- Flow: SignUp → Email Verification → Dashboard
- Validation: client-side email format, password strength

**Task Trace:**
- T-012: Implement user registration endpoint
- T-013: Build sign-up form component
- T-014: Add email verification flow

**Test Trace:**
- TS-001: Unit test — registration with valid data
- TS-002: Unit test — duplicate email rejection
- TS-003: Integration test — full registration flow
- TS-004: E2E test — sign up from UI
```

## Traceability for Non-Functional Requirements

NFRs require special tracing because they often cut across multiple components rather than mapping cleanly to a single feature.

### Performance Requirements

Trace through: ADR (caching strategy, database choice) → Architecture (caching layers, CDN, connection pooling) → Schema (indexes, query optimization) → API (pagination, rate limiting) → Testing (load tests, benchmarks).

### Security Requirements

Trace through: ADR (auth strategy, encryption) → Architecture (security boundaries, auth service) → Schema (encrypted columns, audit tables) → API (auth headers, CORS, rate limits) → Testing (penetration tests, auth tests) → UX (CSRF tokens, secure forms).

### Accessibility Requirements

Trace through: ADR (WCAG level target) → UX (ARIA labels, keyboard navigation, screen reader support, color contrast) → Testing (accessibility audits, screen reader tests).

## Common Issues Found During Traceability

1. **The "orphan feature" pattern** — Tasks exist for features that are not in the PRD. Often introduced during architecture when engineers think of improvements. Must be either added to PRD (with stakeholder approval) or removed from tasks.

2. **The "assumed infrastructure" pattern** — Architecture assumes infrastructure (Redis, message queue, CDN) that has no ADR, no tasks, and no operational runbook entry. The requirement is implicit.

3. **The "tested but not specified" pattern** — Test cases exist for behaviors that are not documented in any specification. Often indicates tacit knowledge that should be made explicit.

4. **The "specified but not tested" pattern** — Requirements with full implementation traces but no test coverage. Especially common for error cases and NFRs.

5. **The "split requirement" pattern** — A single PRD requirement maps to tasks across multiple phases that are not linked to each other. If one task is cut, the feature is half-built.

## Bidirectional Tracing

The matrix should be walkable in both directions:

- **Forward (requirement → implementation):** Start from a PRD requirement, verify it has complete downstream coverage.
- **Backward (implementation → requirement):** Start from a task or test, verify it traces back to a PRD requirement.

Backward tracing catches scope creep — artifacts that exist without a requirement justification. Forward tracing catches gaps — requirements without implementation.

## Tooling Considerations

For the pipeline context, the traceability matrix is a markdown document. Key practices:

- Use consistent identifiers (REQ-001, ADR-003, T-012) so traces are searchable.
- Cross-reference identifiers rather than duplicating content.
- Update the matrix when any artifact changes — it is a living document until docs are frozen.
- During validation, the matrix is the primary output. During finalization, it should be complete.

## When to Use Traceability Validation

- After all pipeline phases are complete, before finalization.
- When a significant change is made to any artifact (re-run affected rows).
- When stakeholders ask "is feature X covered?" — the matrix answers immediately.
- When prioritizing cuts — the matrix shows what is affected if a requirement is deferred.

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

## After This Step

Continue with: `/scaffold:apply-fixes-and-freeze`
