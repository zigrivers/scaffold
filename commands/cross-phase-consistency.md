---
description: "Audit naming, assumptions, data flows, interface contracts across all phases"
long-description: "Traces every named concept (entities, fields, API endpoints) across all documents and flags any naming drift, terminology mismatches, or data shape inconsistencies."
---

## Purpose
Audit naming, assumptions, data flows, interface contracts across all phases.
Ensure consistent terminology, compatible assumptions, and aligned interfaces
between every pair of phase artifacts.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent consistency validation — different models catch different
drift patterns.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/cross-phase-consistency.md — findings report
- docs/validation/cross-phase-consistency/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/cross-phase-consistency/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/cross-phase-consistency/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Entity names are consistent across domain models, database schema, and API contracts (zero mismatches)
- (mvp) Technology references match `docs/tech-stack.md` in all documents
- (deep) Data flow descriptions in architecture match API endpoint definitions
- (deep) Every named entity in the domain model has exactly one name used consistently across domain-models/, api-contracts.md, database-schema.md, and ux-spec.md
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
  - Depth 1: entity name check across PRD, user stories, and domain models.
  - Depth 2: add tech stack reference consistency.
  - Depth 3: full terminology audit across all documents with naming collision detection.
  - Depth 4: add external model cross-check.
  - Depth 5: multi-model reconciliation of consistency findings.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/cross-phase-consistency/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/cross-phase-consistency/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding

---

## Domain Knowledge

### cross-phase-consistency

*Auditing consistency across pipeline phases — naming, assumptions, data flows, interface contracts*

# Cross-Phase Consistency

Cross-phase consistency validation ensures that artifacts produced across different pipeline phases agree with each other. Inconsistencies compound: a renamed entity in one phase propagates confusion into every downstream artifact. This document covers what to check, how to check it, and what findings look like.

## Summary

- **Naming consistency**: Trace every named concept through all artifacts; flag spelling variations, abbreviations, or synonyms for the same concept.
- **Shared assumptions**: Verify that assumptions made in later phases (cardinality, optionality, ordering, uniqueness) are explicitly stated in earlier artifacts.
- **Data shape consistency**: Trace entity shapes field-by-field from domain model through schema, API, and UX; verify types, naming, and format alignment.
- **Interface contract matching**: Architecture component interfaces must match their concrete definitions in API contracts; parameter names, types, and error cases aligned.
- **Data flow completeness**: Walk each architecture data flow step-by-step verifying source/target APIs exist and data shapes match at every boundary.
- **Constraint propagation**: ADR constraints (technology choices, patterns, NFRs) must be reflected in all downstream artifacts.
- **Common patterns to watch**: Enum drift, optionality mismatch, orphaned events, ghost requirements, format divergence, soft-delete vs hard-delete differences, and pagination assumption conflicts.

## Deep Guidance

## Why Inconsistencies Happen

Each pipeline phase is authored at a different time, possibly by different agents, with evolving understanding of the project. Common causes:

- An entity gets renamed during architecture but the domain model still uses the old name.
- A field is added to an API contract that does not exist in the database schema.
- An ADR constrains behavior that is contradicted by a later UX specification.
- A domain event defined in modeling is never consumed by any component in architecture.
- Units or formats differ (e.g., timestamps as ISO strings in the API but Unix integers in the schema).

## What to Check

### 1. Naming Consistency

Trace every named concept through all artifacts where it appears.

**Process:**
1. Extract all named entities from the domain model (aggregates, entities, value objects, events, invariants).
2. For each name, search every downstream artifact: ADRs, architecture, schema, API contracts, UX spec, implementation tasks.
3. Flag any spelling variations, abbreviations, or synonyms (e.g., "User" vs "Account" vs "Member" referring to the same concept).
4. Flag any name that appears in a downstream artifact but not in the domain model (potential undocumented concept).

**What findings look like:**
- "Domain model uses `PaymentTransaction` but API contracts call it `Payment` and database schema calls it `payment_txn`."
- "The entity `SubscriptionPlan` appears in the implementation tasks but is not in the domain model."

**Resolution:** Establish one canonical name per concept. Update all artifacts to use it.

### 2. Shared Assumptions

Later phases often assume properties that earlier phases did not explicitly specify.

**Process:**
1. For each phase from architecture onward, identify every assumption about earlier artifacts.
2. Verify each assumption is actually stated in the referenced artifact.
3. Pay special attention to: cardinality (one-to-many vs many-to-many), optionality (required vs optional), ordering (ordered vs unordered), uniqueness constraints, temporal assumptions (real-time vs eventual consistency).

**What findings look like:**
- "Architecture assumes `Order` has a `status` field with enum values, but the domain model defines `Order` without specifying lifecycle states."
- "API contracts assume paginated results, but architecture data flow diagrams show unbounded queries."

**Resolution:** Either add the assumption to the source artifact or update the downstream artifact to not depend on it.

### 3. Data Shape Consistency

Trace a data shape from domain model through schema through API through UI.

**Process:**
1. Pick a core entity (e.g., `User`).
2. Extract its shape from each layer:
   - Domain model: attributes, relationships, invariants
   - Database schema: columns, types, constraints, indexes
   - API contract: request/response fields, types, validation rules
   - UX spec: displayed fields, form inputs, validation messages
3. Verify field-by-field alignment:
   - Every domain attribute should map to a schema column (or have a documented reason for omission).
   - Every schema column exposed externally should appear in an API contract field.
   - Every API response field displayed to users should appear in UX spec.
   - Types should be compatible (e.g., domain `Money` value object maps to `DECIMAL(10,2)` in schema, `string` formatted as currency in API, formatted display in UX).

**What findings look like:**
- "Domain model `Product.price` is a `Money` value object (amount + currency), but schema has only `price_cents INTEGER` — currency is missing."
- "API returns `created_at` as ISO 8601 string but UX spec references `createdAt` as a Unix timestamp."

### 4. Interface Contract Matching

Verify that component interfaces defined in architecture match their implementations in API contracts and database schema.

**Process:**
1. Extract every component interface from the architecture document (method signatures, event subscriptions, data flows).
2. For each interface, find its concrete definition in API contracts or internal service contracts.
3. Verify:
   - All interface methods have corresponding endpoints or functions.
   - Parameter names and types match.
   - Return types match.
   - Error cases defined at the interface level are handled at the implementation level.

**What findings look like:**
- "Architecture defines `NotificationService.sendBatch(notifications[])` but API contracts only define `POST /notifications` for single notifications."
- "Architecture component `PaymentGateway` has an `onPaymentFailed` event handler, but no component publishes `PaymentFailed` events."

### 5. Data Flow Completeness

Verify that data flows described in architecture are implementable with the defined APIs and schemas.

**Process:**
1. For each data flow diagram in architecture, walk through step by step.
2. At each step, verify:
   - The source component has an API or interface that provides the data.
   - The target component has an API or interface that accepts the data.
   - The data shape at the source matches the data shape at the target.
   - Any transformation between source and target is documented.
3. Check for orphaned components — components that appear in data flows but have no API endpoints or database tables.

**What findings look like:**
- "Data flow shows `OrderService -> InventoryService: reserve items`, but InventoryService API has no reservation endpoint."
- "Data flow shows `AnalyticsCollector` receiving events from `UserService`, but the architecture has no event bus or pub/sub mechanism defined."

### 6. Constraint Propagation

ADR constraints should be respected in all downstream artifacts.

**Process:**
1. Extract all constraints from ADRs (technology choices, architectural patterns, non-functional requirements).
2. For each constraint, verify it is reflected in relevant downstream artifacts:
   - Technology choice ADRs should align with architecture component technology annotations.
   - Pattern ADRs (e.g., "use event sourcing for Order aggregate") should be reflected in schema design and API contracts.
   - NFR ADRs should have corresponding test criteria in testing strategy.

**What findings look like:**
- "ADR-007 mandates PostgreSQL, but database schema uses MongoDB-style document references."
- "ADR-012 requires CQRS for order processing, but architecture shows a single read/write path."

## How to Structure the Audit

### Pass 1: Build an Entity Registry

Create a table of every named concept with its appearance in each artifact:

| Concept | Domain Model | ADRs | Architecture | Schema | API | UX | Tasks |
|---------|-------------|------|-------------|--------|-----|-----|-------|
| User | `User` entity | — | `UserService` | `users` table | `/users` resource | User Profile screen | Task #12-#15 |
| Order | `Order` aggregate | ADR-012 CQRS | `OrderService` | `orders` table | `/orders` resource | Order History screen | Task #20-#28 |

Flag any row with missing cells or naming inconsistencies.

### Pass 2: Data Shape Tracing

For each entity in the registry, trace its shape layer by layer. Build a field-level comparison table:

| Field | Domain | Schema | API | UX |
|-------|--------|--------|-----|-----|
| id | UUID | `id UUID PK` | `id: string (uuid)` | hidden |
| email | Email (value object) | `email VARCHAR(255) UNIQUE` | `email: string (email)` | text input, validated |
| role | UserRole enum | `role VARCHAR(20) CHECK(...)` | `role: "admin" | "user"` | dropdown |

Flag mismatches in type, optionality, naming, or format.

### Pass 3: Flow Walking

Walk each data flow end-to-end, verifying every step has concrete API/schema support.

### Pass 4: Constraint Verification

Cross-reference every ADR constraint against downstream artifacts.

## Output Format

Findings should be structured as:

```
## Finding: [Short Description]

**Severity:** Critical | Major | Minor
**Phases Involved:** [list of phases]
**Description:** [What the inconsistency is]
**Evidence:**
- In [artifact]: [what it says]
- In [artifact]: [what it says differently]
**Recommended Fix:** [Which artifact to update and how]
```

## Common Patterns Worth Special Attention

1. **Enum drift** — Enum values defined in domain model, schema, API, and UX often diverge. One phase adds a new status value without updating others.
2. **Optionality mismatch** — Domain model says a field is required, but API contract makes it optional, or vice versa.
3. **Orphaned events** — Domain events defined but never consumed (or consumed but never published).
4. **Ghost requirements** — Features appear in UX spec or implementation tasks that trace to no PRD requirement.
5. **Format divergence** — Dates, money, identifiers represented differently across layers without documented transformation rules.
6. **Soft-delete vs hard-delete** — One phase assumes records are soft-deleted, another assumes they are gone.
7. **Pagination assumptions** — API paginates but UX assumes all data is available; or API returns all but architecture assumed streaming.

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
