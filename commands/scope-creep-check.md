---
description: "Verify specs stay aligned to PRD boundaries"
long-description: "Compares everything that has been specified against the original PRD and flags anything that was not in the requirements — features, components, or tasks that crept in without justification."
---

## Purpose
Verify specs stay aligned to PRD boundaries. Check that user stories,
architecture, implementation tasks, and other artifacts have not introduced
features, components, or complexity beyond what the PRD requires. User stories
should not introduce features not in the PRD — UX-level enhancements are
allowed only via the innovation step with explicit user approval. Flag any
scope expansion for explicit approval.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent scope analysis — different models interpret PRD boundaries
differently, surfacing subtle creep.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/scope-creep-check.md — findings report
- docs/validation/scope-creep-check/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/scope-creep-check/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/scope-creep-check/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Every user story traces back to a PRD feature or requirement
- (mvp) Every architecture component traces to a PRD requirement
- Items beyond PRD scope are flagged with disposition (remove, defer, or justify)
- (deep) No "gold-plating" — implementation tasks do not exceed story acceptance criteria
- (deep) Feature count has not grown beyond PRD scope without documented justification
- Findings categorized P0-P3 with specific file, section, and issue for each
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
- **custom:depth(1-5)**: Depth 1: feature count comparison (PRD vs implementation plan). Depth 2: add component-level tracing. Depth 3: full story-level and task-level audit against original PRD scope. Depth 4: add external model scope assessment. Depth 5: multi-model scope review with risk-weighted creep analysis.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/scope-creep-check/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/scope-creep-check/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding

---

## Domain Knowledge

### scope-management

*Detecting scope creep and ensuring specs stay aligned to PRD boundaries*

# Scope Management

Scope management validation compares every specification artifact against the PRD to ensure that the documented system matches what was actually requested. Features that cannot be traced to a PRD requirement are scope creep. Requirements that grew during documentation are scope inflation. Extra polish on non-critical features is gold-plating. This validation catches all three.

## Summary

- **Feature-to-PRD tracing**: Classify every capability as traced (maps to PRD), supporting (necessary infrastructure), or creep (no PRD justification).
- **Scope inflation detection**: Compare each PRD requirement's original scope to its implementation scope; flag features that grew beyond what was requested.
- **Gold-plating detection**: Over-abstraction, premature optimization, excessive error handling, and UI polish beyond requirements. Test: "If removed, would any PRD requirement be unmet?"
- **Deferred scope leakage**: Verify explicitly deferred items (v2 features) do not appear in specifications, including partial infrastructure for deferred features.
- **NFR scope alignment**: Implementation targets should match PRD targets, not exceed them (e.g., 99.9% uptime, not 99.99%).
- **Decision framework**: When in doubt, defer. Scope additions are kept only if required for a PRD feature to work and do not significantly increase effort or operational complexity.
- Run scope validation after all documentation phases and before implementation begins.

## Deep Guidance

## Why Scope Grows

Scope grows during the documentation pipeline for understandable reasons — but each growth increases implementation effort, risk, and timeline. Common causes:

1. **Engineering enthusiasm** — Domain modeling reveals interesting patterns, and the team designs for future needs that are not in the PRD.
2. **Defensive architecture** — "We should add this abstraction now because it will be hard to add later." Maybe, but if it is not in the PRD, it is scope creep.
3. **Completeness bias** — "Every API should have full CRUD" even when the PRD only calls for Create and Read.
4. **Platform assumptions** — "All modern apps need real-time notifications" even when the PRD does not mention them.
5. **Review-driven growth** — During review phases, reviewers identify gaps that are real but beyond the PRD scope. These gaps are valid observations but should be deferred, not added.
6. **Implicit requirements** — "Obviously we need admin tooling" or "of course there is a settings page" — unless the PRD says so, these are not requirements.

## What to Check

### 1. Feature-to-PRD Tracing

For every feature, endpoint, screen, or capability in the specifications, verify it traces to a specific PRD requirement.

**Process:**
1. Build a list of every concrete capability in the specifications:
   - Every API endpoint
   - Every database table
   - Every UI screen or component
   - Every background job or scheduled task
   - Every integration with an external service
2. For each capability, find the PRD requirement that justifies it.
3. Classify each capability:
   - **Traced** — Maps directly to a PRD requirement.
   - **Supporting** — Does not map to a PRD requirement directly but is necessary infrastructure for a traced capability (e.g., database connection pooling supports all data features).
   - **Creep** — Cannot be traced to any PRD requirement and is not necessary infrastructure.

**What findings look like:**
- "API endpoint `GET /analytics/reports` has no corresponding PRD requirement. The PRD mentions displaying basic stats on the dashboard but does not mention a reports feature."
- "The `AuditLog` table is not traceable to any PRD requirement. While audit logging is good practice, it is not a v1 requirement."
- "The UX spec includes an 'Admin Dashboard' with user management, role assignment, and system monitoring. The PRD mentions only a basic admin interface for content moderation."

### 2. Requirement Scope Inflation

A requirement starts small in the PRD and grows during documentation. The PRD says "users can search products" — by the time it reaches the API contracts, there is full-text search with faceted filtering, auto-suggest, and search analytics.

**Process:**
1. For each PRD requirement, compare its original scope (as stated in the PRD) with its implementation scope (as described in later artifacts).
2. Look for:
   - Features that are more detailed than the requirement called for.
   - Additional sub-features not mentioned in the requirement.
   - Higher quality targets than the requirement specified.
   - More platforms or device types than the requirement addressed.

**Detection heuristics:**
- Count the API endpoints per PRD feature. A single feature with 10+ endpoints may indicate inflation.
- Count the database tables per domain entity. An entity with 5+ tables may indicate over-engineering.
- Compare the PRD's feature description word count to the architecture's implementation description. If the implementation is 10x longer, scope may have inflated.
- Check for features that only appear after the architecture step that were not in the domain modeling step or the PRD.

**What findings look like:**
- "PRD says 'users can update their profile.' Architecture specifies profile versioning with history, diff view, and rollback capability. This exceeds the PRD requirement."
- "PRD says 'send email notifications for important events.' Implementation tasks include: email templates engine, unsubscribe management, bounce handling, email analytics, and A/B testing. Only the first two are justified by the PRD."

### 3. Gold-Plating Detection

Gold-plating is adding extra polish, features, or capabilities beyond what is needed. Unlike scope creep (adding new features), gold-plating over-engineers existing features.

**Indicators of gold-plating:**
- **Over-abstraction** — Generic plugin systems when only one plugin type exists. Configurable everything when the configuration will never change. Abstract factory patterns when there is only one concrete class.
- **Premature optimization** — Caching layers for data that is accessed once per session. Database sharding for an application that will have 100 users. CDN configuration for an internal tool.
- **Excessive error handling** — Circuit breakers and retry policies for services that have 99.99% uptime. Graceful degradation for features that can simply show an error.
- **Over-documentation** — API endpoints with 50+ response examples. Database schemas with migration scripts for every possible future change.
- **UI polish beyond requirements** — Animations, micro-interactions, and visual effects for an internal business tool. Dark mode when the PRD does not mention it.

**Detection technique:**
For each specification element, ask: "If I removed this, would any PRD requirement be unmet?" If the answer is no, it is gold-plating.

### 4. Deferred Scope Leaking In

The PRD explicitly defers certain features ("out of scope for v1," "future enhancement"). Verify none of these deferred items appear in the specifications.

**Process:**
1. Extract all explicitly deferred items from the PRD.
2. Search all specification artifacts for any reference to deferred items.
3. Check for partial implementations — infrastructure for a deferred feature that is "already done" but not needed yet.

**What findings look like:**
- "PRD defers multi-language support to v2, but the database schema has a `locale` column on every content table and the API contracts accept `Accept-Language` headers."
- "PRD defers mobile app to v2, but the architecture includes a 'Mobile API Gateway' component and the API contracts include mobile-specific endpoints."

### 5. NFR Scope Alignment

Non-functional requirements are especially prone to scope creep because they can always be "better."

**Process:**
1. For each NFR in the PRD, check whether the implementation scope matches the specified target:
   - If PRD says "p95 under 500ms," does the architecture target 100ms?
   - If PRD says "WCAG AA," does the UX spec target WCAG AAA?
   - If PRD says "99.9% uptime," does the operations runbook design for 99.99%?
2. Over-specifying NFRs is gold-plating. The implementation effort difference between 99.9% and 99.99% uptime is enormous.

## How to Structure the Audit

### Pass 1: PRD Boundary Extraction

Build a definitive list of what is in scope and what is out:

```markdown
## In Scope (from PRD)
1. User registration and authentication
2. Product catalog with search
3. Shopping cart
4. Checkout with Stripe payment
5. Order history
6. Basic admin: content moderation

## Explicitly Out of Scope (from PRD)
1. Multi-language support (v2)
2. Mobile native app (v2)
3. Marketplace (third-party sellers) (v2)
4. Social features (reviews, ratings) (v2)
5. Advanced analytics and reporting (v2)

## NFR Targets (from PRD)
- Performance: p95 < 500ms for page loads
- Availability: 99.9% uptime
- Security: OWASP Top 10 compliance
- Accessibility: WCAG AA
- Scale: Support 10,000 concurrent users
```

### Pass 2: Artifact Scanning

For each specification artifact, list every capability and trace it:

```markdown
| Capability | Artifact | PRD Requirement | Classification |
|------------|----------|-----------------|----------------|
| POST /auth/register | API contracts | User registration | Traced |
| POST /auth/login | API contracts | User authentication | Traced |
| GET /auth/sessions | API contracts | — | Creep (session management not in PRD) |
| users table | Schema | User registration | Traced |
| user_sessions table | Schema | — | Creep (paired with sessions endpoint) |
| SearchService with Elasticsearch | Architecture | Product search | Inflation (PRD says search, not full-text search engine) |
| Notification Service | Architecture | — | Creep |
| Admin Analytics Dashboard | UX spec | — | Creep (PRD says basic moderation only) |
```

### Pass 3: Impact Assessment

For each scope finding, assess the impact of keeping vs removing it:

```markdown
## Finding: Notification Service

**Classification:** Scope creep
**Effort to implement:** ~3 tasks, ~2 days
**Impact of keeping:** Adds complexity to architecture, requires email service integration, adds operational burden
**Impact of removing:** Users would not receive email notifications for order updates — but the PRD does not require this
**Recommendation:** Defer to v2. Remove from architecture and implementation tasks.
```

## Output Format

### Scope Audit Summary

```markdown
## Scope Audit Results

**Total capabilities identified:** 85
**Traced to PRD:** 62 (73%)
**Supporting infrastructure:** 15 (18%)
**Scope creep:** 5 (6%)
**Gold-plating:** 3 (4%)

### Scope Creep Items
1. Notification Service — recommend defer
2. Admin Analytics Dashboard — recommend defer
3. User session management API — recommend simplify
4. Export to PDF — recommend remove (explicitly deferred in PRD)
5. Multi-language database support — recommend remove (explicitly deferred in PRD)

### Gold-Plating Items
1. Full-text search with Elasticsearch — PRD says "search," recommend PostgreSQL full-text search
2. WCAG AAA compliance — PRD says AA, recommend AA
3. 99.99% uptime architecture — PRD says 99.9%, recommend simplifying HA setup

### Scope Inflation Items
1. User profile: versioning and rollback added beyond PRD requirement
2. Email notifications: template engine, unsubscribe management, analytics added
3. Search: faceted filtering, auto-suggest, search analytics added

### Estimated Effort Savings if Scope is Tightened
- Removing creep: ~8 tasks, ~5 days estimated
- Fixing gold-plating: ~4 tasks, ~3 days estimated
- Reducing inflation: ~6 tasks, ~4 days estimated
- **Total: ~18 tasks, ~12 days estimated savings**
```

## Decision Framework

Not all scope additions are bad. Some are genuinely necessary even if not in the PRD. Use this framework:

| Question | If Yes | If No |
|----------|--------|-------|
| Is it required for a PRD feature to work? | Keep (supporting infrastructure) | Continue evaluation |
| Does the PRD explicitly defer it? | Remove | Continue evaluation |
| Would a user notice its absence? | Consider keeping, but flag for PRD update | Remove |
| Does it significantly increase implementation effort? | Remove unless critical | May keep if low effort |
| Does it add operational complexity? | Remove unless critical | May keep if simple |

When in doubt, defer. It is always easier to add a feature later than to remove one that has been built.

## When to Run Scope Validation

- After all documentation phases are complete, before the implementation tasks step.
- After the implementation tasks step, before implementation begins.
- When the task list feels "too big" — scope validation often reveals why.
- When stakeholders ask "why is this taking so long?" — scope validation quantifies the answer.

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
