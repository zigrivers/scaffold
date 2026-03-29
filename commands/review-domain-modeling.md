---
description: "Review domain models for completeness, consistency, and downstream readiness"
long-description: "Verifies every PRD feature maps to a domain entity, checks that business rules are enforceable, and ensures the shared vocabulary is consistent across all project files."
---

## Purpose
Deep multi-pass review of the domain models, targeting the specific failure modes
of domain modeling artifacts. Identify issues, create a fix plan, execute fixes,
and re-validate.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/domain-models/ (required) — domain models to review
- docs/plan.md (required) — source requirements for coverage checking

## Expected Outputs
- docs/reviews/review-domain-modeling.md — review findings, fix plan, and resolution log
- docs/domain-models/ — updated with fixes
- docs/reviews/domain-modeling/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/domain-modeling/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/domain-modeling/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) All review passes executed with findings documented
- (mvp) Every finding categorized by severity (P0-P3). Severity definitions: P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.
- (mvp) Fix plan created for P0 and P1 findings
- (mvp) Fixes applied and re-validated
- (mvp) Downstream readiness confirmed (decisions phase can proceed)
- (mvp) Entity coverage verified (every PRD feature maps to at least one entity)
- (deep) Aggregate boundaries verified (each aggregate protects at least one invariant)
- (deep) Ubiquitous language consistency verified across all domain model files
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: All review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Quick consistency check. Focus on blocking issues only.
- **custom:depth(1-5)**: Depth 1: single pass — blocking issues only (entity
  coverage against PRD). Depth 2: two passes — entity coverage + ubiquitous
  language consistency. Depth 3: four passes — entity coverage, ubiquitous
  language, aggregate boundary validation, and cross-domain consistency.
  Depth 4: all review passes + one external model (if CLI available).
  Depth 5: all review passes + multi-model with reconciliation.

## Mode Detection
If docs/reviews/review-domain-modeling.md exists, this is a re-review. Read previous
findings, check which were addressed, run review passes again on updated models.
If multi-model review artifacts exist under docs/reviews/domain-modeling/,
preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-domain-modeling.md` exists with tracking comment
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

### review-domain-modeling

*Failure modes and review passes specific to domain modeling artifacts*

# Review: Domain Modeling

## Summary

Domain models are the foundation of the entire pipeline. Every subsequent phase builds on them. A gap or error here compounds through ADRs, architecture, database schema, API contracts, and implementation tasks. This review uses 10 passes targeting the specific ways domain models fail: (1) PRD coverage audit, (2) bounded context integrity, (3) entity vs value object classification, (4) aggregate boundary validation, (5) domain event completeness, (6) invariant specification, (7) ubiquitous language consistency, (8) cross-domain relationship clarity, (9) downstream readiness, and (10) internal consistency.

Follows the review process defined in `review-methodology.md`.

## Deep Guidance

---

## Pass 1: PRD Coverage Audit

### What to Check

Every feature and requirement in the PRD maps to at least one domain. No PRD requirement exists without a domain home. No domain exists without PRD traceability.

### Why This Matters

Orphaned requirements — PRD features that no domain covers — mean the system literally cannot implement those features. Phantom domains — domains with no PRD traceability — indicate scope creep or misunderstanding of the problem space. Both cause expensive rework when discovered during implementation.

### How to Check

1. List every feature from the PRD (use the feature list, user stories, or requirements section)
2. For each feature, identify which domain(s) it touches
3. Mark features that have no domain mapping — these are orphaned
4. List all domains and bounded contexts from the domain models
5. For each domain, trace back to at least one PRD feature
6. Mark domains with no PRD traceability — these are phantoms
7. Check that non-functional requirements (performance, security, scalability) are reflected in domain constraints where relevant

### What a Finding Looks Like

- P0: "PRD feature 'Multi-tenant billing' has no domain mapping. No bounded context addresses tenant isolation or billing lifecycle."
- P1: "Domain 'Analytics' has no PRD traceability. The PRD mentions reporting but not analytics as a separate concern."
- P2: "PRD non-functional requirement 'sub-200ms API response' is not reflected in any domain model constraint."

---

## Pass 2: Bounded Context Integrity

### What to Check

Context boundaries are clean. No entity appears in multiple contexts without an explicit integration relationship. Shared kernels are documented. Anticorruption layers exist at context boundaries.

### Why This Matters

Leaky context boundaries are the most common domain modeling failure. When an entity like "User" appears in three contexts with slightly different meanings, implementing agents build tight coupling between modules. This causes merge conflicts, circular dependencies, and change amplification — modifying one context breaks others.

### How to Check

1. For each bounded context, list its entities and value objects
2. Search for entity names that appear in multiple contexts
3. For each shared name, determine: is it genuinely shared (shared kernel), or is it a different concept with the same name (homonym indicating a boundary)?
4. Verify shared kernel entities have explicit documentation of what is shared and who owns changes
5. At every context boundary, verify the integration mechanism is specified (domain events, API calls, shared database, anticorruption layer)
6. Check that no context directly references another context's internal entities

### What a Finding Looks Like

- P0: "'Order' entity appears in Catalog, Checkout, and Fulfillment contexts with different attributes but no integration relationship documented."
- P1: "Shared kernel between Auth and User Profile contexts exists but does not specify ownership of the 'email' field."
- P2: "Context map exists but does not specify whether upstream/downstream relationships use conformist, anticorruption layer, or open host patterns."

---

## Pass 3: Entity vs Value Object Classification

### What to Check

Entities have identity and lifecycle. Value objects are immutable and compared by value. Misclassification is a common error that propagates into database schema and API design.

### Why This Matters

Misclassifying an entity as a value object means losing its lifecycle tracking — no history, no identity-based lookups. Misclassifying a value object as an entity means unnecessary database tables, unnecessary IDs, and unnecessary complexity. Both lead to schema rework.

### How to Check

For each entity, ask:
1. Does this concept need to be tracked over time? (If not, it may be a value object)
2. Are two instances with identical attributes the same thing or different things? (If same, it is a value object)
3. Does this concept have a lifecycle with distinct states? (If not, it may be a value object)

For each value object, ask:
1. Would the system ever need to update this independently? (If yes, it may be an entity)
2. Does this concept appear in domain events as a subject (not just data)? (If yes, it may be an entity)
3. Does this concept need a unique identifier for reference? (If yes, it is an entity)

### What a Finding Looks Like

- P1: "'Address' is modeled as an entity with an ID, but two addresses with the same street/city/zip are semantically identical. Should be a value object."
- P1: "'Price' is modeled as a value object, but the system needs to track price history and price changes. Should be an entity with a lifecycle."
- P2: "'Currency' is modeled as an entity but has no lifecycle — it is a static reference value. Consider value object or reference data."

---

## Pass 4: Aggregate Boundary Validation

### What to Check

Aggregates enforce consistency boundaries. Each aggregate is the right size — large enough to enforce its invariants, small enough to avoid contention.

### Why This Matters

Too-large aggregates lock too much data during updates, causing concurrency bottlenecks and unnecessary transaction scope. Too-small aggregates cannot enforce their invariants, leading to inconsistent state. Wrong aggregate boundaries are the most expensive domain modeling error to fix post-implementation because they affect database schema, API contracts, and transaction boundaries.

### How to Check

1. For each aggregate, list its invariants (from Pass 6 if already done, or identify them now)
2. Verify each invariant can be enforced within the aggregate's boundary without reaching into other aggregates
3. Check for aggregates that reference other aggregates by direct object reference (should use ID reference instead)
4. Look for aggregates with more than 5-7 entities — these are likely too large
5. Look for invariants that span multiple aggregates — these indicate either wrong boundaries or the need for a domain service/saga
6. Check that aggregate roots are clearly identified and that all access to aggregate internals goes through the root

### What a Finding Looks Like

- P0: "Invariant 'order total must equal sum of line items minus discounts' spans Order aggregate and Discount aggregate. Either Discount should be inside Order aggregate, or this invariant needs a domain service."
- P1: "Customer aggregate contains Order history directly. This means updating an order locks the entire customer. Order should be a separate aggregate referencing Customer by ID."
- P2: "Product aggregate root is not explicitly identified. Three entities (Product, Variant, Pricing) could each be the root."

---

## Pass 5: Domain Event Completeness

### What to Check

Every meaningful state transition produces a domain event. Events capture business-meaningful changes (not CRUD operations). Event payloads carry sufficient context for consumers.

### Why This Matters

Missing domain events mean downstream consumers cannot react to state changes. In event-driven architectures, missing events create invisible data synchronization gaps. Even in non-event-driven systems, domain events document the system's behavior contract — what happens when state changes.

### How to Check

1. For each entity with a lifecycle, trace through its state transitions
2. Verify each transition has a corresponding domain event
3. Check that events are named in past tense business language ("OrderPlaced" not "CreateOrder" or "OrderCreated")
4. Verify event payloads include enough context for consumers to act without querying back to the source
5. Check for state transitions that happen implicitly (timer-based, batch, external trigger) — these often lack events
6. Verify events do not carry the entire entity state (anti-pattern) — they should carry what changed and context

### What a Finding Looks Like

- P0: "Order has states Draft, Submitted, Approved, Shipped, Delivered but only OrderPlaced and OrderShipped events exist. Missing: OrderApproved, OrderDelivered."
- P1: "UserRegistered event carries only userId. Downstream services (email, analytics) need email address and registration source. Payload is insufficient."
- P2: "Events use inconsistent naming: 'OrderPlaced' (past tense) vs 'ShipOrder' (imperative). Standardize to past tense."

---

## Pass 6: Invariant Specification

### What to Check

Invariants are testable assertions with clear conditions. Each specifies what must be true, when it applies, and what happens on violation.

### Why This Matters

Vague invariants like "orders must be valid" are unimplementable. Implementing agents need precise, testable rules to write validation logic and tests. Missing invariants mean missing validation — the system accepts invalid state.

### How to Check

1. For each aggregate, list all invariants
2. For each invariant, verify it is a testable boolean assertion (not a vague statement)
3. Check that the invariant specifies its scope: always true? Only in certain states? Only for certain entity types?
4. Verify violation behavior is specified: reject the operation? Compensate? Log and continue?
5. Look for implicit invariants that are obvious to domain experts but not documented (uniqueness constraints, ordering constraints, temporal constraints)
6. Check for invariants that reference external state — these may need special handling

### What a Finding Looks Like

- P0: "Invariant 'an order must be valid' is not testable. What constitutes validity? Minimum one line item? Non-negative total? Valid shipping address?"
- P1: "Uniqueness of email within an account is implied by the registration flow but not stated as an invariant. This needs explicit specification."
- P1: "Invariant 'discount cannot exceed order total' does not specify violation behavior. Should the operation be rejected, or should the discount be capped?"

---

## Pass 7: Ubiquitous Language Consistency

### What to Check

Terminology is consistent across all domain models. No synonyms (different words for the same concept). No homonyms (same word for different concepts — these indicate a context boundary).

### Why This Matters

Inconsistent terminology causes implementing agents to build the wrong thing. If "Customer" means "authenticated user" in one context and "billing entity" in another without clarification, the agent picks one interpretation and builds to it. Synonyms cause duplicate implementations — two services doing the same thing under different names.

### How to Check

1. Build a glossary from all domain models: every noun (entity, value object, event, service)
2. Search for synonyms: different terms that seem to mean the same thing (Customer/Client/User, Order/Purchase/Transaction)
3. For each synonym pair, determine: truly the same concept (pick one term) or subtly different concepts (define the distinction)
4. Search for homonyms: same term used in different contexts with different attributes or behavior
5. For each homonym, determine: should be the same concept (align definitions) or should be different concepts (this is a context boundary — document it)
6. Check that event names, aggregate names, and relationship names use terms from the glossary

### What a Finding Looks Like

- P0: "'User' means an authenticated identity in the Auth context but a customer profile in the Commerce context. This is a valid context boundary but is not documented as such."
- P1: "Domain models use both 'Order' and 'Purchase' to refer to the same concept. Pick one and use it everywhere."
- P2: "'Item' is used informally in narrative sections but the formal model uses 'LineItem'. Align informal usage."

---

## Pass 8: Cross-Domain Relationship Clarity

### What to Check

Relationships between domains are explicit. Direction of dependency is clear. Communication mechanism is specified.

### Why This Matters

Implicit cross-domain relationships become implicit runtime dependencies. If Domain A references Domain B's entities without specifying the mechanism, implementing agents create tight coupling. During implementation, this manifests as import cycles, deployment ordering issues, and cascading failures.

### How to Check

1. List all relationships between bounded contexts (the context map)
2. For each relationship, verify: upstream/downstream direction, communication mechanism (events, direct API, shared database), data that flows across the boundary
3. Check for undocumented relationships: does Domain A reference concepts from Domain B without a documented relationship?
4. Verify that no domain depends on another domain's internal structure (only on its published interface)
5. Look for circular dependencies between domains — these usually indicate incorrect boundaries
6. Check that relationship multiplicity is specified (one-to-one, one-to-many, many-to-many)

### What a Finding Looks Like

- P0: "Billing domain references Order domain entities directly but no relationship is documented. Is Billing downstream of Orders? Does it receive events or query an API?"
- P1: "Context map shows Inventory upstream of Orders, but Orders also writes to Inventory (stock reservation). This is a bidirectional dependency that needs explicit handling."
- P2: "Relationship between Auth and Notification domains specifies 'events' but does not name the specific events."

---

## Pass 9: Downstream Readiness

### What to Check

The ADRs step needs specific information from domain models. Verify that information is present and sufficient.

### Why This Matters

ADRs make technology and pattern decisions informed by domain complexity. If domain models do not surface the constraints and characteristics that drive those decisions, ADRs are made on assumptions rather than analysis.

### How to Check

The ADRs step specifically needs:
1. **Clear domain boundaries** — To decide on module/service decomposition strategy
2. **Technology-relevant constraints** — Real-time requirements, data volume projections, consistency requirements that influence technology selection
3. **Performance-sensitive operations** — Operations with latency, throughput, or data volume requirements that affect architecture decisions
4. **Integration complexity** — How many cross-domain interactions exist, their frequency, their consistency requirements
5. **Data storage characteristics** — Relational vs. document vs. graph patterns visible in the domain models
6. **Security boundaries** — Which domains handle sensitive data, authentication, authorization

For each item, verify it is explicitly present in the domain models or can be reasonably inferred.

### What a Finding Looks Like

- P0: "No domain model mentions data volume or throughput characteristics. The ADRs step cannot make database technology decisions without this information."
- P1: "Real-time requirements are mentioned in the PRD but not reflected in any domain model's constraints section."
- P2: "Data storage patterns are implicit (relational structure visible) but not explicitly stated as a constraint or preference."

---

## Pass 10: Internal Consistency

### What to Check

Cross-references resolve. Terminology does not drift within a single model. No contradictions between entity definitions and relationship diagrams.

### Why This Matters

Internal inconsistencies within a single domain model erode trust in the artifact. If an entity's attributes list says one thing and the relationship diagram says another, the implementing agent must guess which is correct. Cumulative small inconsistencies make the entire model unreliable.

### How to Check

1. For each cross-reference (entity A "references" entity B), verify entity B exists and the reference direction matches
2. Check that entity attribute lists match what the relationship diagrams show
3. Verify that invariants reference entities and attributes that actually exist in the model
4. Check that domain events reference entities and state transitions defined in the model
5. Look for terminology drift: same concept called different things in different sections of the same document
6. Verify that aggregates contain exactly the entities they claim to contain — not more, not fewer

### What a Finding Looks Like

- P0: "Invariant 'PaymentAmount must not exceed OrderTotal' references PaymentAmount, but the Payment entity has an attribute called 'amount', not 'paymentAmount'."
- P1: "Relationship diagram shows Order -> Customer as one-to-many, but the Order entity definition says 'each order belongs to one customer' (many-to-one). Direction is inverted."
- P2: "The Inventory domain model calls the same concept 'stock level' in the overview and 'quantity on hand' in the entity definition."

### Example Review Finding

```markdown
### Finding: Aggregate boundary cannot enforce cross-aggregate invariant

**Pass:** 4 — Aggregate Boundary Validation
**Priority:** P0
**Location:** Order aggregate and Discount aggregate (domain-models.md, Section 3.2)

**Issue:** Domain invariant INV-007 states "discount amount must not exceed order
subtotal." Enforcing this requires access to both the Order aggregate (to read the
subtotal, which is the sum of line items) and the Discount aggregate (to read the
discount amount). These are modeled as separate aggregates with independent
lifecycles.

Because aggregates are consistency boundaries, there is no transactional guarantee
that the discount and order subtotal are evaluated atomically. A line item could be
removed from the Order (reducing subtotal) after a discount was validated against
the previous subtotal, violating the invariant.

**Impact:** Without resolution, implementing agents will either (a) ignore the
invariant, allowing invalid discount states, or (b) create tight coupling between
Order and Discount aggregates, defeating the purpose of the boundary.

**Recommendation:** Move Discount inside the Order aggregate as a value object.
The discount lifecycle is tied to the order — discounts do not exist independently.
This allows the Order aggregate root to enforce INV-007 within a single
consistency boundary.

**Trace:** Invariant INV-007 → Order aggregate + Discount aggregate → PRD
Feature 3.4 "Apply discount codes at checkout"
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

Continue with: `/scaffold:adrs`
