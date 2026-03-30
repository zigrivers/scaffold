---
description: "Review ADRs for completeness, consistency, and decision quality"
long-description: "Checks for contradictions between decisions, missing decisions implied by the architecture, and whether every choice has honest trade-off analysis."
---

## Purpose
Multi-pass review of ADRs targeting ADR-specific failure modes: contradictory
decisions, missing rationale, implied-but-unrecorded decisions, and unresolved
trade-offs.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/adrs/ (required) — ADRs to review
- docs/domain-models/ (required) — for coverage checking
- docs/plan.md (required) — for requirement tracing

## Expected Outputs
- docs/reviews/review-adrs.md — findings and resolution log
- docs/adrs/ — updated with fixes
- docs/reviews/adrs/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/adrs/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/adrs/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) All ADR-specific review passes executed
- (mvp) Every finding categorized P0-P3 with specific ADR number, section, and issue. Severity definitions: P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.
- (deep) Missing decisions identified and documented
- (mvp) Contradictions resolved
- (mvp) Downstream readiness confirmed (architecture phase can proceed)
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: All review passes. Full findings report. Fixes applied and
  re-validated. Multi-model review dispatched to Codex and Gemini if available,
  with graceful fallback to Claude-only enhanced review.
- **mvp**: Quick consistency check for contradictions only.
- **custom:depth(1-5)**:
  - Depth 1: single pass — contradiction check only.
  - Depth 2: two passes — contradiction check + missing rationale scan.
  - Depth 3: four passes — contradiction check, missing rationale, implied-but-unrecorded decisions, and unresolved trade-offs.
  - Depth 4: all passes + one external model (if CLI available).
  - Depth 5: all passes + multi-model with reconciliation.

## Mode Detection
Re-review mode if previous review exists. Check which findings were addressed.
If multi-model review artifacts exist under docs/reviews/adrs/, preserve prior
findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-adrs.md` exists with tracking comment
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

### review-adr

*Failure modes and review passes specific to Architecture Decision Records*

# Review: Architecture Decision Records

ADRs encode the "why" behind the architecture. They must be complete (every significant decision recorded), honest (genuine trade-off analysis), and non-contradictory (no two ADRs making incompatible decisions). This review uses 7 passes targeting the specific ways ADR sets fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Decision Coverage**: Every significant architectural decision has an ADR; technology choices, pattern selections, and constraint trade-offs all recorded.
- **Pass 2 — Rationale Quality**: Alternatives are genuinely viable (not straw-manned); consequences are honest with both positives and negatives.
- **Pass 3 — Contradiction Detection**: No two ADRs make conflicting decisions without explicit acknowledgment; supersession relationships documented.
- **Pass 4 — Implied Decision Mining**: Decisions visible in artifacts but never formally recorded as ADRs are identified and flagged.
- **Pass 5 — Status Hygiene**: ADR statuses reflect reality; no stale "proposed" ADRs; supersession chains are clean.
- **Pass 6 — Cross-Reference Integrity**: Cross-references between ADRs are correct and bidirectional; no broken or circular reference chains.
- **Pass 7 — Downstream Readiness**: Technology and pattern decisions are finalized in "accepted" status so architecture can proceed without ambiguity.

## Deep Guidance

---

## Pass 1: Decision Coverage

### What to Check

Every significant architectural decision has an ADR. Technology choices, pattern selections, component boundaries, integration strategies, and constraint trade-offs are all recorded.

### Why This Matters

Unrecorded decisions become folklore — known to the original author but invisible to implementing agents. When an agent encounters an undocumented technology choice, it either assumes incorrectly or asks questions the ADR should have answered. At scale, unrecorded decisions are the primary source of "but why do we do it this way?" confusion.

### How to Check

1. Read through the domain models and architecture document (if it exists at this point)
2. List every decision implied by the structure: technology choices (language, framework, database), architectural patterns (monolith vs. microservices, event-driven vs. request-response), component boundaries, integration mechanisms, data storage strategies
3. For each identified decision, find the corresponding ADR
4. Flag decisions that are visible in the artifacts but have no ADR
5. Check that technology selection decisions cover: primary language/framework, database(s), key infrastructure (message queue, cache, CDN), deployment platform

### What a Finding Looks Like

- P0: "The architecture uses PostgreSQL and Redis but there is no ADR recording why these were chosen over alternatives."
- P1: "The system uses event-driven communication between Order and Inventory services, but no ADR documents this pattern choice versus synchronous calls."
- P2: "The testing framework choice (Jest) is implied by package.json conventions but not recorded as a decision."

---

## Pass 2: Rationale Quality

### What to Check

Each ADR has genuine alternatives that were seriously considered (not straw-manned). Consequences are honest — both positive and negative. The rationale explains why the chosen option was selected, not just what was selected.

### Why This Matters

Straw-manned alternatives ("we could do nothing" or obviously bad options) indicate the decision was made before the analysis. This means the real reasoning is undocumented. When conditions change, the team has no basis for re-evaluating because they do not know why the decision was actually made.

### How to Check

1. For each ADR, read the alternatives section
2. Check that at least 2-3 alternatives are genuinely viable — would a reasonable engineer consider them?
3. Verify each alternative has honest pros and cons (not just cons)
4. Read the consequences section: are there negative consequences? (Every decision has trade-offs — all-positive consequences indicate dishonest analysis)
5. Check the rationale: does it explain why the chosen option's trade-offs are acceptable, or does it just restate the decision?
6. Look for evaluation criteria: what dimensions were the options compared on?

### What a Finding Looks Like

- P0: "ADR-003 lists 'do nothing' and 'use an obviously unsuitable technology' as alternatives. The real alternatives (comparable frameworks) are missing."
- P1: "ADR-007 consequences section lists only benefits. A REST API decision always has trade-offs (chatty calls, over-fetching, versioning complexity) — these are absent."
- P2: "ADR-012 explains what was chosen but not why. The rationale section reads 'We chose React' without explaining what made it the best fit."

---

## Pass 3: Contradiction Detection

### What to Check

No two ADRs make contradictory decisions without explicit acknowledgment. When one ADR supersedes or modifies another, the relationship is documented.

### Why This Matters

Contradictory ADRs give implementing agents conflicting instructions. If ADR-005 says "use REST for all APIs" and ADR-012 says "use GraphQL for the dashboard API" without referencing ADR-005, an agent reading both does not know which takes precedence. Contradictions that are intentional (scoped exceptions) must be explicit.

### How to Check

1. Build a decision matrix: for each ADR, note what it decides and what domain it constrains
2. Look for overlapping constraints: two ADRs that affect the same architectural concern
3. For each overlap, determine: do they agree, or do they contradict?
4. For contradictions, check: does the later ADR reference the earlier one and explain the exception?
5. Check for implicit contradictions: ADR-A says "minimize external dependencies" while ADR-B adds three new external services
6. Verify supersession chains: if ADR-X supersedes ADR-Y, is ADR-Y marked as superseded?

### What a Finding Looks Like

- P0: "ADR-005 specifies 'all state in PostgreSQL' but ADR-011 introduces Redis for session management without referencing ADR-005 or explaining the exception."
- P1: "ADR-003 (monolith-first) and ADR-009 (separate auth service) contradict. ADR-009 should reference ADR-003 and explain why auth is the exception."
- P2: "ADR-015 supersedes ADR-008 but ADR-008 status is still 'accepted'. Update to 'superseded by ADR-015'."

---

## Pass 4: Implied Decision Mining

### What to Check

Decisions visible in domain models, architecture, or code that were never formally recorded as ADRs. These are the "everyone knows" decisions that new team members do not know.

### Why This Matters

Implied decisions are the most dangerous gap in an ADR set. They represent consensus that was never examined or documented. When an implementing agent encounters an implied decision, it has no rationale to evaluate whether the decision still applies. Implied decisions also tend to be the decisions most likely to be wrong — they were never subjected to alternatives analysis.

### How to Check

1. Read domain models looking for architectural assumptions: "the system uses X" statements embedded in narrative
2. Read architecture documents for technology mentions without corresponding ADRs
3. Check for pattern assumptions: "RESTful API" assumed without an ADR choosing REST over alternatives
4. Look for constraint assumptions: "single database" or "multi-tenant" assumed without formal analysis
5. Check for deployment assumptions: cloud provider, containerization, CI/CD tool — all are decisions
6. Review domain event patterns: synchronous vs. asynchronous, at-least-once vs. exactly-once — these are decisions

### What a Finding Looks Like

- P0: "The domain models assume multi-tenancy (tenant_id on entities) but there is no ADR analyzing single-tenant vs. multi-tenant trade-offs."
- P1: "The architecture assumes containerized deployment (Docker references throughout) but no ADR records this decision."
- P2: "TypeScript is used throughout code examples in domain models but no ADR formally selects TypeScript over JavaScript."

---

## Pass 5: Status Hygiene

### What to Check

ADR statuses reflect reality. No stale "proposed" ADRs (should be accepted or rejected). Supersession chains are clean. Deprecated ADRs point to their replacements.

### Why This Matters

Stale statuses create confusion about which decisions are in effect. A "proposed" ADR that was accepted months ago but never updated looks like an undecided question. Broken supersession chains mean both the old and new ADR appear active, leading to the contradiction problems in Pass 3.

### How to Check

1. List all ADRs and their statuses
2. Flag any "proposed" or "draft" ADRs — are these genuinely pending, or were they accepted but not updated?
3. For "superseded" or "deprecated" ADRs, verify they reference their replacement
4. For "accepted" ADRs, verify they are still current — has a later ADR effectively superseded them?
5. Check for "rejected" ADRs — are the rejections still valid, or have circumstances changed?
6. Verify ADR numbering is sequential and has no gaps (gaps suggest deleted ADRs, which violates ADR principles)

### What a Finding Looks Like

- P1: "ADR-004 has status 'proposed' but is referenced by three other ADRs as if it were accepted. Update status."
- P1: "ADR-006 status is 'deprecated' but does not reference which ADR replaces it."
- P2: "ADR numbering jumps from 008 to 010. If ADR-009 was removed, it should exist as 'rejected' or 'withdrawn', not deleted."

---

## Pass 6: Cross-Reference Integrity

### What to Check

ADRs that reference each other do so correctly. Cross-references point to real ADRs, the referenced content matches what is claimed, and no circular reference chains create logical loops.

### Why This Matters

Broken cross-references make it impossible to follow decision chains. When ADR-015 says "as decided in ADR-007," but ADR-007 does not actually address that topic, the rationale chain is broken. Implementing agents cannot trace why decisions were made.

### How to Check

1. For each ADR, extract all references to other ADRs
2. Verify each referenced ADR exists
3. Verify the referenced ADR actually says what the referencing ADR claims it says
4. Check for circular reference chains (A references B references C references A)
5. Verify "supersedes" relationships are bidirectional (superseding ADR says "supersedes X"; X says "superseded by Y")
6. Check that references to domain models and architecture documents are also accurate

### What a Finding Looks Like

- P1: "ADR-012 says 'per ADR-007, we use event-driven communication' but ADR-007 actually decides on synchronous REST. Wrong cross-reference."
- P1: "ADR-015 supersedes ADR-008, but ADR-008 does not mention being superseded."
- P2: "ADR-020 references 'the data model in Section 3' without specifying which document's Section 3."

---

## Pass 7: Downstream Readiness

### What to Check

The system architecture step needs technology choices and pattern decisions finalized. All architecture-constraining decisions must be in "accepted" status with clear rationale.

### Why This Matters

The architecture document translates ADR decisions into component structure. If technology choices are unresolved, the architect must either make the decision inline (bypassing the ADR process) or leave the architecture ambiguous. Both lead to rework.

### How to Check

The system architecture step specifically needs:
1. **Technology stack decisions** — Language, framework, database, key infrastructure, all accepted
2. **Architectural pattern decisions** — Monolith vs. services, synchronous vs. asynchronous, state management approach
3. **Integration pattern decisions** — How components communicate, what protocols, what data formats
4. **Deployment topology decisions** — Where the system runs, how many environments, how deploys work
5. **Cross-cutting concern decisions** — Logging, monitoring, authentication, error handling patterns
6. **Data management decisions** — Single vs. multiple databases, caching strategy, data consistency model

For each category, verify at least one accepted ADR covers it. If a category is intentionally deferred, verify the deferral is documented with a timeline.

### What a Finding Looks Like

- P0: "No accepted ADR covers database technology selection. The system architecture step cannot design data storage components without this decision."
- P0: "The monolith-vs-services question has two proposed ADRs (ADR-003, ADR-004) but neither is accepted. The system architecture step cannot define component boundaries."
- P1: "Authentication approach is not covered by any ADR. The system architecture step needs to know the auth pattern to design the auth component."
- P2: "Monitoring strategy has no ADR. This could be deferred to the operations step but should be noted."

### Example Review Finding

```markdown
### Finding: Straw-man alternatives mask the real decision rationale

**Pass:** 2 — Rationale Quality
**Priority:** P0
**Location:** ADR-003 "Use React for Frontend Framework"

**Issue:** ADR-003 lists two alternatives: "Use jQuery" and "Build from scratch
with vanilla JS." Neither is a genuinely viable alternative for a 2024 SPA with
the complexity described in the PRD. The real alternatives — Vue, Svelte, Angular
— are not mentioned.

The consequences section lists four benefits and zero costs. React has well-known
trade-offs (large bundle size, JSX learning curve, frequent ecosystem churn) that
are absent.

**Impact:** When conditions change (e.g., bundle size becomes a priority, or the
team grows to include Vue-experienced developers), there is no documented rationale
for why React was chosen over comparable frameworks. The ADR cannot be meaningfully
re-evaluated because the real decision criteria were never recorded.

**Recommendation:** Replace alternatives with genuinely considered options (Vue 3,
Svelte/SvelteKit, Angular). For each, document honest pros and cons. Add negative
consequences to the React decision: bundle size overhead, ecosystem churn rate,
and dependency on the React team's architectural direction (Server Components,
compiler changes).

**Trace:** ADR-003 → blocks Architecture Phase component structure decisions
```

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

Continue with: `/scaffold:system-architecture`
