---
description: "Audit all documentation for platform-specific gaps across target platforms"
long-description: "Audits all documentation for platform-specific gaps — features missing on one platform, input pattern differences (touch vs. mouse), and platform-specific testing coverage."
---

## Purpose
When the project targets multiple platforms (web, iOS, Android, desktop), audit
all documentation to ensure every target platform is thoroughly addressed.
Identify gaps where one platform was assumed but another was not considered,
verify feature parity across targets, and ensure platform-specific testing,
input patterns, and UX considerations are documented.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent platform gap analysis.

## Conditional Evaluation
This step is conditional ("if-needed"). Enable when:
- The project targets 2+ platforms (e.g., web + mobile, iOS + Android)
- `docs/tech-stack.md` lists a cross-platform framework (React Native, Flutter, Expo)
- `docs/plan.md` mentions multiple deployment targets

Skip when the project targets a single platform only.

## Inputs
- docs/plan.md (required) — target platforms and version requirements
- docs/tech-stack.md (required) — cross-platform framework and build approach
- docs/user-stories.md (required) — stories to check for platform coverage
- docs/coding-standards.md (required) — platform-specific conventions
- docs/project-structure.md (optional) — platform-specific file organization
- docs/tdd-standards.md (optional) — platform-specific testing approach
- docs/design-system.md (optional) — responsive breakpoints and platform patterns
- docs/implementation-plan.md (optional — not available, runs before implementation-plan) — tasks covering each platform
- CLAUDE.md (required) — platform-specific workflow notes

## Expected Outputs
- docs/reviews/platform-parity-review.md — platform gap analysis report with
  findings per document, feature parity matrix, and recommended fixes
- docs/reviews/platform-parity/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/platform-parity/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/platform-parity/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) All target platforms identified from PRD and tech-stack.md
- (mvp) Every user story checked for platform-specific acceptance criteria
- (deep) Feature parity matrix shows which features work on which platforms
- (deep) Input pattern differences documented (touch vs. mouse, keyboard shortcuts, gestures)
- (deep) Platform-specific testing documented (Playwright for web, Maestro for mobile)
- (deep) Navigation patterns appropriate per platform (sidebar vs. tab bar, etc.)
- (deep) Offline/connectivity handling addressed per platform (if applicable)
- (deep) Web version is treated as first-class (not afterthought) if PRD specifies it
- (mvp) Every finding categorized P0-P3 (P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.)
- (mvp) Fix plan documented for all P0/P1 findings with specific document and section to update
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: Comprehensive platform audit across all documents, feature parity
  matrix, input pattern analysis, navigation pattern review, offline handling,
  accessibility per platform, and detailed fix recommendations. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Quick check of user stories and tech-stack for platform coverage.
  Identify top 3 platform gaps. Skip detailed feature parity matrix.
- **custom:depth(1-5)**:
  - Depth 1: User stories platform check only (1 review pass)
  - Depth 2: Two-pass check — first pass validates user stories against platform constraints; second pass identifies implicit assumptions that could block native implementation (e.g., assumed web APIs not available on mobile).
  - Depth 3: Add tech-stack and coding-standards platform audit (3 review passes)
  - Depth 4: Add feature parity matrix + one external model if CLI available (3 review passes + external dispatch)
  - Depth 5: Full suite across all documents + multi-model with reconciliation (3 review passes + multi-model synthesis)

## Mode Detection
Update mode if docs/reviews/platform-parity-review.md exists. In update mode:
re-run audit against current documents, preserve prior findings still valid,
note which gaps have been addressed since last review. If multi-model review
artifacts exist under docs/reviews/platform-parity/, preserve prior findings
still valid.

## Update Mode Specifics
- **Detect prior artifact**: docs/reviews/platform-parity-review.md exists
- **Preserve**: existing parity findings still valid, platform-specific decisions,
  feature parity matrix entries for unchanged features
- **Triggers for update**: specification changes (tech-stack.md, user-stories.md,
  system-architecture.md updated), new target platform added to PRD, platform-specific
  coding standards changed
- **Conflict resolution**: preserve platform-specific decisions already made,
  merge new findings alongside existing ones rather than replacing

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
