---
description: "Walk critical user journeys end-to-end across all specs"
long-description: "Walks the most important user journeys end-to-end across every spec layer — PRD to stories to UX to API to database to tasks — and flags any broken handoffs or missing layers."
---

## Purpose
Walk critical user journeys end-to-end across all specs. Trace the most
important user flows from PRD through user stories, UX spec, API contracts,
architecture components, database operations, and implementation tasks.
Use story acceptance criteria as the definition of "correct behavior" when
verifying completeness and consistency at every layer.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent journey walkthroughs — different models catch different
spec gaps along the critical path.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/critical-path-walkthrough.md — findings report
- docs/validation/critical-path-walkthrough/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/critical-path-walkthrough/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/critical-path-walkthrough/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) User specifies >= 3 Must-have epics as critical user journeys; each traced end-to-end
- (deep) Every journey verified at each layer: PRD → Story → UX → API → Architecture → DB → Task
- (deep) Each critical path verified against story acceptance criteria for behavioral correctness
- (mvp) Missing layers or broken handoffs documented with specific gap description
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
  - Depth 1: identify critical path and verify task ordering.
  - Depth 2: add dependency bottleneck analysis.
  - Depth 3: full walkthrough simulating agent execution of critical path tasks.
  - Depth 4: add external model simulation.
  - Depth 5: multi-model walkthrough with divergence analysis.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/critical-path-walkthrough/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/critical-path-walkthrough/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding

---

## Domain Knowledge

### critical-path-analysis

*Tracing critical user journeys end-to-end across all specifications*

# Critical Path Analysis

Critical path analysis walks through the most important user journeys end-to-end across every specification artifact. For each journey, it verifies that every component, endpoint, query, screen, and task needed to make the journey work actually exists and is consistent.

## Summary

- **Critical paths** are user journeys representing core functionality — the features that, if broken, would make the product unusable or fail its primary value proposition.
- **Sources for identifying journeys**: PRD success criteria, user stories, personas, architecture data flows, and revenue/value paths.
- **Trace 5-10 journeys** per project; more than 15 suggests scope is too broad or granularity too fine.
- **Four-step tracing process**: define the journey steps, map each step to specification artifacts (UX, API, architecture, data, tasks), check each mapping for existence/completeness/connectivity/error handling, and identify gaps.
- **Gap types**: missing components, missing endpoints, missing queries, missing screens, missing tasks, broken connections between steps, and missing error paths.
- **Common gap patterns**: handoff gaps at bounded-context boundaries, state transition gaps for entity lifecycle, async gaps for background processing, first-time user gaps for empty states, and permission gaps for authorization.
- **Output**: a summary table of all journeys with gap counts and assessments, plus detailed findings with impact analysis and recommended fixes.
- **When to run**: after all pipeline steps are complete, before implementation tasks are finalized, when PRD changes significantly, and as a final check before freezing docs.

## Deep Guidance

## What a Critical Path Is

A critical path is a user journey that represents core functionality — the features that, if broken, would make the product unusable or fail its primary value proposition. These are not edge cases. They are the main flows that most users will execute most of the time.

## Identifying Critical Journeys

### Sources for Critical Journeys

1. **PRD success criteria** — Any measurable outcome in the PRD implies a user journey. "Users can complete checkout in under 3 clicks" implies a checkout journey.
2. **PRD user stories** — Primary user stories describe the most important journeys.
3. **PRD personas** — Each persona's primary need implies a journey. A "buyer" persona implies a purchasing journey.
4. **Architecture data flows** — Major data flows in the architecture document represent the system-level view of critical paths.
5. **Revenue/value paths** — Journeys that directly relate to the product's revenue model or primary value proposition.

### Prioritizing Which Journeys to Trace

Not every user journey needs end-to-end tracing. Prioritize:

1. **Happy path of core features** — The primary flow that delivers the product's main value. For an e-commerce app: browse → add to cart → checkout → payment → confirmation.
2. **Authentication flows** — Sign up, sign in, password reset. Nearly every product has these and they touch many components.
3. **Primary CRUD operations** — The main data creation and retrieval flows. For a project management tool: create project → add tasks → assign → update status → complete.
4. **Cross-cutting journeys** — Flows that cross multiple bounded contexts or services. These are where integration gaps hide.
5. **Error-recovery journeys** — What happens when payment fails? When a network request times out? When a form has validation errors?

A typical project should trace 5-10 critical journeys. More than 15 usually means the scope is too broad or the granularity is too fine.

## How to Trace a Journey

### Step 1: Define the Journey

Write a one-sentence description of the journey and list its steps from the user's perspective:

```
Journey: User registers and completes first purchase
1. User visits landing page
2. User clicks "Sign Up"
3. User fills registration form (email, password)
4. User receives verification email
5. User clicks verification link
6. User browses product catalog
7. User views product detail
8. User adds item to cart
9. User views cart
10. User initiates checkout
11. User enters shipping address
12. User enters payment information
13. User confirms order
14. User sees order confirmation
15. User receives confirmation email
```

### Step 2: Map Each Step to Specifications

For each step, identify the concrete artifacts that support it:

| Step | UX Component | API Endpoint | Architecture Component | Database Query | Task ID |
|------|-------------|-------------|----------------------|----------------|---------|
| 1. Visit landing | LandingPage | GET /products/featured | ProductService | SELECT featured products | T-040 |
| 2. Click Sign Up | SignUpForm | — | — | — | T-013 |
| 3. Fill registration | SignUpForm | POST /auth/register | AuthService | INSERT INTO users | T-012 |
| 4. Verification email | — | — | EmailService | INSERT INTO verification_tokens | T-016 |
| 5. Click verify link | VerifyPage | POST /auth/verify | AuthService | UPDATE users SET verified | T-017 |
| ... | ... | ... | ... | ... | ... |

### Step 3: Check Each Mapping

For each cell in the table, verify:

1. **Existence** — Does the referenced artifact actually exist in the specifications? Is there actually a `POST /auth/register` endpoint in the API contracts? Is there actually a `SignUpForm` component in the UX spec?

2. **Completeness** — Does the artifact cover what this step needs? Does the `POST /auth/register` endpoint accept `email` and `password`? Does it return a response that the `SignUpForm` component can use?

3. **Connectivity** — Does the output of step N connect to the input of step N+1? If step 3 returns `{user, token}`, does step 6 (browse catalog) know how to use that token for authenticated requests?

4. **Error handling** — What happens if this step fails? Is the failure mode documented? Is there a recovery path? If `POST /auth/register` returns 409 (email exists), does the UX spec define what the user sees?

### Step 4: Identify Gaps

Gaps take several forms:

**Missing component** — A step requires a component that does not exist in any specification. Example: "User receives verification email" requires an email-sending service, but no such service is in the architecture.

**Missing endpoint** — A step requires an API endpoint that is not in the contracts. Example: "User views cart" requires a `GET /cart` endpoint, but only `POST /cart/items` is defined.

**Missing query** — A step requires a database query pattern, but no index supports it. Example: "User browses by category" requires a category-based product listing, but the products table has no category index.

**Missing screen** — A step requires a UI screen or component that is not in the UX spec. Example: "User enters shipping address" requires an address form, but the UX spec jumps from cart to payment.

**Missing task** — A step requires implementation work that has no task in the implementation tasks.

**Broken connection** — The output of one step does not connect to the input of the next. Example: The registration endpoint returns a session cookie, but the product catalog endpoint expects a Bearer token.

**Missing error path** — A step can fail, but there is no specification for what happens on failure.

## Journey Tracing Template

Use this template for each critical journey:

```markdown
## Journey: [Name]

**Description:** [One sentence]
**PRD Source:** [Section reference]
**Priority:** Critical | High | Medium

### Steps

#### Step 1: [User action]
- **UX:** [Component/screen] — [status: found/missing/incomplete]
- **API:** [Endpoint] — [status]
- **Architecture:** [Component] — [status]
- **Data:** [Query/mutation] — [status]
- **Task:** [Task ID] — [status]
- **Error path:** [What happens on failure] — [status]
- **Connection to next:** [How output feeds step 2] — [status]

#### Step 2: [User action]
...

### Gaps Found
1. [Gap description, severity, recommendation]
2. ...

### Journey Assessment
- [ ] All steps have UX components
- [ ] All steps have API endpoints (where applicable)
- [ ] All steps have architecture components
- [ ] All steps have data support (where applicable)
- [ ] All steps have implementation tasks
- [ ] All step-to-step connections verified
- [ ] All error paths documented
- [ ] End-to-end data shape consistency verified
```

## Common Gap Patterns

### 1. The "Handoff Gap"

Where one bounded context ends and another begins, there is often no specification for how data moves between them. The order service creates an order, but how does the fulfillment service learn about it? Is there an event? A synchronous call? A shared database?

**How to find it:** Look for steps where the "Architecture Component" column changes. Each change is a boundary crossing that needs an integration mechanism.

### 2. The "State Transition Gap"

A user journey involves entity state changes (order: created → paid → shipped → delivered), but the specifications do not fully document all transitions, especially error transitions (paid → refunded, shipped → returned).

**How to find it:** For each entity that changes state during the journey, extract the state machine and verify every transition has API support and UX feedback.

### 3. The "Async Gap"

Steps that involve asynchronous processing (sending email, processing payment, generating report) often lack specification for: how long the user waits, what they see while waiting, how they are notified of completion, and what happens if the async process fails.

**How to find it:** Flag every step where the API response does not contain the final result (e.g., 202 Accepted, polling endpoints, WebSocket notifications).

### 4. The "First-Time User Gap"

Many journeys are specified assuming the user already has data (an account, items in cart, previous orders). The first-time user journey — where the system has no data for this user — often reveals missing empty states, onboarding flows, and default configurations.

**How to find it:** Trace the journey assuming zero prior state. Does the product catalog work with zero products? Does the dashboard work with zero data points?

### 5. The "Permission Gap"

Some steps require specific permissions (admin actions, premium features), but the specifications do not define how the user acquires those permissions or what happens when they lack them.

**How to find it:** For each step, ask "who is allowed to do this?" and verify that the auth model in the API contracts supports the answer.

## Output Format

### Summary Table

```markdown
| Journey | Steps | Gaps Found | Critical Gaps | Assessment |
|---------|-------|-----------|---------------|------------|
| User registration + first purchase | 15 | 4 | 1 (email service missing) | Needs work |
| Returning user purchase | 8 | 1 | 0 | Mostly complete |
| Admin manages products | 12 | 3 | 2 (admin auth, bulk operations) | Needs work |
| User manages account | 6 | 0 | 0 | Complete |
```

### Detailed Findings

Each gap should be reported with:
- Which journey and step it affects
- What is missing or inconsistent
- What the impact would be if not fixed (agent would be unable to implement, or would implement incorrectly)
- Recommended fix (which artifact to update, what to add)

## When to Run Critical Path Analysis

- After all pipeline steps (modeling through planning) are complete.
- Before implementation tasks are finalized (gaps found here may require new tasks).
- When PRD changes significantly (new features may introduce new critical journeys).
- As a final check before freezing docs in the finalization phase.

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
