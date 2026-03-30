---
description: "Review system architecture for completeness and downstream readiness"
long-description: "Verifies every domain concept lands in a component, every decision constraint is respected, no components are orphaned from data flows, and the module structure minimizes merge conflicts."
---

## Purpose
Multi-pass review of the system architecture targeting architecture-specific
failure modes: domain coverage gaps, ADR constraint violations, data flow
orphans, module structure issues, state inconsistencies, diagram/prose drift,
and downstream readiness.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/system-architecture.md (required) — architecture to review
- docs/domain-models/ (required) — for coverage checking
- docs/adrs/ (required) — for constraint compliance
- docs/plan.md (required) — for requirement tracing

## Expected Outputs
- docs/reviews/review-architecture.md — findings and resolution log
- docs/system-architecture.md — updated with fixes
- docs/reviews/architecture/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/architecture/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/architecture/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Domain model coverage verified (every model maps to a component)
- (mvp) ADR constraint compliance verified
- (deep) All architecture-specific review passes executed
- (deep) Data flow completeness verified (no orphaned components)
- (deep) Module structure assessed for merge conflict risk, circular dependency risk, and import depth
- (mvp) Downstream readiness confirmed (specification, quality, and planning steps can proceed)
- (mvp) Every finding categorized P0-P3 with specific component, section, and issue. Severity definitions: P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to system-architecture.md and re-validated
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: All 10 review passes (coverage, constraints, data flows, module
  structure, state consistency, diagram integrity, extension points,
  invariants, downstream readiness, internal consistency). Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Domain coverage and ADR compliance checks only.
- **custom:depth(1-5)**:
  - Depth 1: two passes — domain coverage and ADR compliance only.
  - Depth 2: four passes — domain coverage, ADR compliance, data flow completeness, and internal consistency.
  - Depth 3: seven passes — add module structure, state consistency, and diagram integrity.
  - Depth 4: all 10 passes + one external model (if CLI available).
  - Depth 5: all 10 passes + multi-model with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/architecture/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-architecture.md` exists with tracking comment
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

### review-system-architecture

*Failure modes and review passes specific to system architecture documents*

# Review: System Architecture

## Summary

The system architecture document translates domain models and ADR decisions into a concrete component structure, data flows, and module organization. It is the primary reference for all subsequent phases — database schema, API contracts, UX spec, and implementation tasks all derive from it. Errors here propagate everywhere. This review uses 10 passes targeting the specific ways architecture documents fail: (1) domain model coverage, (2) ADR constraint compliance, (3) data flow completeness, (4) module structure integrity, (5) state consistency, (6) diagram/prose consistency, (7) extension point integrity, (8) invariant verification, (9) downstream readiness, and (10) internal consistency.

Follows the review process defined in `review-methodology.md`.

## Deep Guidance

---

## Pass 1: Domain Model Coverage

### What to Check

Every domain model (entity, aggregate, bounded context) maps to at least one component or module in the architecture. No domain concept is left without an architectural home.

### Why This Matters

Unmapped domain concepts are features that have nowhere to live. When an implementing agent encounters a domain entity with no architectural home, it either creates an ad hoc module (fragmenting the architecture) or shoehorns it into an existing module (creating a god module). Both outcomes degrade system structure.

### How to Check

1. List every bounded context from domain models
2. For each context, verify there is a corresponding module, service, or component in the architecture
3. List every aggregate root within each context
4. For each aggregate, verify its data and behavior are housed in the identified component
5. Check that domain relationships (context map) are reflected in component interactions
6. Verify that domain events map to communication channels between components

### What a Finding Looks Like

- P0: "Bounded context 'Notifications' from domain models has no corresponding component in the architecture. Six domain events reference notification delivery but no component handles them."
- P1: "Aggregate 'SubscriptionPlan' is in domain models but its behavior is split between 'BillingService' and 'UserService' without clear ownership."
- P2: "Domain event 'InventoryReserved' is documented but the architecture does not show which component publishes it."

---

## Pass 2: ADR Constraint Compliance

### What to Check

The architecture respects every accepted ADR decision. Technology choices, pattern decisions, and constraints documented in ADRs are reflected in the architecture.

### Why This Matters

ADRs are binding decisions. An architecture that ignores an ADR creates a contradiction that implementing agents must resolve on the fly. If ADR-005 says "PostgreSQL for all persistent data" but the architecture shows a MongoDB component, agents face a contradiction with no resolution path.

### How to Check

1. List every accepted ADR and its core decision
2. For each ADR, trace its impact on the architecture: which components, data flows, or patterns does it constrain?
3. Verify the architecture conforms to each constraint
4. For ADRs with negative consequences, verify the architecture accounts for mitigation strategies
5. Check that architectural patterns match ADR decisions (if ADR says "hexagonal architecture," verify port/adapter structure)
6. Verify technology selections in the architecture match ADR technology decisions

### What a Finding Looks Like

- P0: "ADR-007 decides 'event-driven communication between bounded contexts' but the architecture shows synchronous REST calls between Order and Inventory services."
- P1: "ADR-003 specifies 'monolith-first approach' but the architecture describes five separate services without explaining the planned extraction path."
- P2: "ADR-011 notes 'caching adds invalidation complexity' as a negative consequence, but the architecture's caching component does not address invalidation strategy."

---

## Pass 3: Data Flow Completeness

### What to Check

Every component appears in at least one data flow. All data flows have a clear source, destination, protocol, and payload description. No orphaned components exist.

### Why This Matters

Components that appear in no data flow are either unnecessary (dead architecture) or have undocumented interactions (hidden coupling). Both are problems. Missing data flows mean the implementing agent does not know how data gets into or out of a component — they must invent the integration at implementation time.

### How to Check

1. List every component in the architecture
2. For each component, verify it appears as source or destination in at least one data flow
3. For each data flow, verify: source is a real component, destination is a real component, protocol/mechanism is specified (HTTP, events, database, file), data shape or payload is described
4. Check for bidirectional flows that are only documented in one direction
5. Verify error flows: what happens when a data flow fails? Is the error path documented?
6. Check for external system interactions: are third-party APIs, external databases, or external services documented as data flow endpoints?

### What a Finding Looks Like

- P0: "Component 'AnalyticsEngine' appears in the component diagram but is not referenced in any data flow. It has no documented inputs or outputs."
- P1: "Data flow from 'OrderService' to 'NotificationService' does not specify the communication mechanism. Is it synchronous HTTP, async events, or direct function calls?"
- P2: "Error flow for payment processing failure is missing. What happens when the payment gateway returns an error? Where does the error propagate?"

---

## Pass 4: Module Structure Integrity

### What to Check

The module/directory structure has no circular dependencies, reasonable sizes, clear boundaries, and follows the patterns specified in ADRs.

### Why This Matters

Circular module dependencies make the system impossible to build, test, or deploy independently. Overly large modules become maintenance nightmares. Unclear boundaries lead to feature leakage, where functionality drifts into the wrong module because the right one is ambiguous.

### How to Check

1. Trace the import/dependency direction between modules — draw the dependency graph
2. Check for cycles in the dependency graph (A depends on B depends on C depends on A)
3. Verify the dependency direction aligns with the domain model's upstream/downstream relationships
4. Check module sizes: are any modules housing too many responsibilities? (More than one bounded context worth of functionality)
5. Verify that shared/common modules are minimal — they tend to become dumping grounds
6. Check that the file/directory structure matches the module boundaries (not split across directories or merged into one)

### What a Finding Looks Like

- P0: "'auth' module imports from 'orders' module, and 'orders' module imports from 'auth'. This circular dependency must be broken — introduce an interface or event."
- P1: "The 'core' module contains entities from three different bounded contexts. It should be split to maintain domain boundaries."
- P2: "The 'utils' module has grown to 15 files. Consider whether these utilities belong in the modules that use them."

---

## Pass 5: State Consistency

### What to Check

State management design covers all identified state stores and their interactions. State transitions are consistent with domain events. No state is managed in two places without synchronization.

### Why This Matters

Inconsistent state is the source of the most difficult-to-debug production issues. When the same conceptual state is managed in two places (database and cache, two services, client and server), they drift apart. State management must be explicit about what is the source of truth and how consistency is maintained.

### How to Check

1. List every state store in the architecture (databases, caches, session stores, client-side state, queues)
2. For each state store, identify what data it holds and which component owns it
3. Check for the same data appearing in multiple stores — is synchronization documented?
4. Verify that state transitions correspond to domain events
5. Check for derived state: is it cached? How is it invalidated?
6. Look for implicit state: component memory, local files, environment variables that hold state between requests

### What a Finding Looks Like

- P0: "User preferences are stored in both the UserService database and a client-side cache with no documented synchronization mechanism. These will drift."
- P1: "Order status is derived from the last OrderEvent, but the architecture also shows an 'order_status' column in the orders table. Two sources of truth."
- P2: "Session state is described as 'in-memory' but the deployment section mentions multiple instances. In-memory session state does not work with horizontal scaling."

---

## Pass 6: Diagram/Prose Consistency

### What to Check

Architecture diagrams and narrative prose describe the same system. Component names match. Relationships match. No components appear in diagrams but not prose, or vice versa.

### Why This Matters

Diagrams and prose inevitably drift when maintained independently. Implementing agents read both and expect them to agree. When a diagram shows four services but the prose describes three, the agent does not know which is correct. Consistent diagram/prose is the minimum bar for a trustworthy architecture document.

### How to Check

1. List every component named in diagrams
2. List every component named in prose
3. Verify 1:1 correspondence — every diagrammed component has a prose description, every prose-described component appears in a diagram
4. Check component names: do diagrams and prose use the same names?
5. Check relationships: do diagrams and prose describe the same connections between components?
6. Check directionality: do arrows in diagrams match the dependency/data flow direction described in prose?

### What a Finding Looks Like

- P0: "The component diagram shows a 'Gateway' component that is not mentioned anywhere in the prose sections. Is this the API Gateway described in the 'Request Routing' section under a different name?"
- P1: "The prose describes data flowing from Frontend to Backend to Database, but the data flow diagram shows Frontend connecting directly to Database for reads."
- P2: "Component is called 'AuthService' in the diagram and 'Authentication Module' in the prose. Use one name."

---

## Pass 7: Extension Point Integrity

### What to Check

Extension points are designed with concrete interfaces, not merely listed. Each extension point specifies what can be extended, how to extend it, and what the constraints are.

### Why This Matters

"This is extensible" without design details is useless to implementing agents. They need to know the extension mechanism (plugin interface, middleware chain, event hooks, configuration), the contract (what an extension receives, what it returns, what it must not do), and examples of intended extensions.

### How to Check

1. List all claimed extension points in the architecture
2. For each, check: is there a concrete interface or contract? (Not just "this module is extensible")
3. Verify the extension mechanism is specified: plugin pattern, event hooks, middleware, strategy pattern, etc.
4. Check that the extension contract is clear: what inputs, what outputs, what side effects are allowed?
5. Verify at least one example use case for each extension point
6. Check that extension points align with likely future requirements from the PRD

### What a Finding Looks Like

- P1: "Architecture says 'the payment system supports multiple payment providers via plugins' but does not define the plugin interface, lifecycle, or registration mechanism."
- P1: "Authentication extension point lists 'social login providers can be added' but does not specify the provider interface or token exchange contract."
- P2: "Notification extension point is well-designed but lacks an example of how a new channel (e.g., SMS) would be added."

---

## Pass 8: Invariant Verification

### What to Check

The architecture preserves domain invariants. Invariants identified in domain models are enforceable within the architecture's component and transaction boundaries.

### Why This Matters

An invariant that requires two components to coordinate atomically cannot be enforced if those components are separate services with no transaction mechanism. The architecture must ensure that invariant enforcement boundaries match component boundaries — or provide explicit mechanisms (sagas, compensating transactions) for cross-boundary invariants.

### How to Check

1. List every domain invariant from domain models
2. For each invariant, identify which architectural component(s) are responsible for enforcing it
3. If the invariant spans a single component, verify the component has access to all required state
4. If the invariant spans multiple components, verify a coordination mechanism is documented (distributed transaction, saga, event-driven consistency)
5. For cross-component invariants, check the consistency model: strong consistency (must be atomic) or eventual consistency (can tolerate temporary violations)?
6. Verify that the consistency model aligns with the business tolerance stated in domain models

### What a Finding Looks Like

- P0: "Invariant 'order total must equal sum of line items minus discounts' requires Order and Pricing data, but these are in separate services with no documented coordination mechanism."
- P1: "Invariant 'user cannot have duplicate email' spans UserService and AuthService. Which service enforces this? What happens if both create a user simultaneously?"
- P2: "Invariant enforcement is documented but the consistency model (strong vs. eventual) is not specified."

---

## Pass 9: Downstream Readiness

### What to Check

Downstream steps (database schema, API contracts, UX spec, implementation tasks) can proceed with this architecture document.

### Why This Matters

Four phases consume the architecture document simultaneously or in rapid succession. Gaps in the architecture create cascading ambiguity across all four downstream phases.

### How to Check

The database schema step needs:
1. Data storage components identified with their technology and role
2. Entity-to-storage mapping clear enough to design tables/collections
3. Data relationships explicit enough to define foreign keys or references

The API contracts step needs:
1. Component interfaces defined at operation level
2. Communication protocols specified (REST, GraphQL, gRPC)
3. Auth/authz architecture clear enough to define per-endpoint requirements

The UX spec step needs:
1. Frontend component architecture defined
2. State management approach specified
3. API integration points identified from the frontend perspective

The implementation tasks step needs:
1. Module boundaries clear enough to define task scope
2. Dependencies between modules explicit enough to define task ordering
3. Component complexity visible enough to estimate task sizing

### What a Finding Looks Like

- P0: "No data storage architecture section. The database schema step cannot begin database design without knowing what databases exist and what data each holds."
- P1: "Frontend architecture section describes 'a React app' without component structure. The UX spec step needs at least a high-level component hierarchy."
- P2: "Module dependencies are clear but not explicitly listed in a format that the implementation tasks step can directly use for task dependency ordering."

---

## Pass 10: Internal Consistency

### What to Check

Terminology, cross-references, and structural claims are internally consistent. The document does not contradict itself.

### Why This Matters

Architecture documents are long. Inconsistencies between early and late sections indicate that the document was written incrementally without reconciliation passes. Each inconsistency is a potential source of confusion for implementing agents.

### How to Check

1. Build a terminology list from the document — every component name, pattern name, and technology reference
2. Check for variant names (same component called different things in different sections)
3. Verify cross-references: when one section says "as described in the Data Flow section," check that the Data Flow section actually describes it
4. Check for quantitative consistency: if Section 2 says "three services" and Section 5 describes four, which is correct?
5. Verify that the module structure section and the component diagram describe the same set of modules
6. Check that technology versions, library names, and tool references are consistent throughout

### What a Finding Looks Like

- P1: "Section 3 describes the system as having five microservices, but the component diagram shows six. The 'Scheduler' component appears in the diagram but not in the prose."
- P1: "The architecture uses 'API Gateway' in sections 2-4 and 'Reverse Proxy' in section 6 for what appears to be the same component."
- P2: "Node.js version is stated as 18 in section 1 and 20 in the deployment section."

### Example Review Finding

```markdown
### Finding: Orphaned component with no data flow connections

**Pass:** 3 — Data Flow Completeness
**Priority:** P0
**Location:** Component diagram (architecture.md, Section 2.1)

**Issue:** Component 'AnalyticsEngine' appears in the component diagram as a
standalone service but is not referenced in any of the 12 documented data flows.
It has no documented inputs (what data does it consume?), no documented outputs
(where do analytics results go?), and no documented trigger (what initiates
analytics processing?).

**Impact:** The database schema step cannot design analytics storage without
knowing what data the AnalyticsEngine processes. The implementation tasks step
cannot scope analytics work without knowing the component's interfaces. The UX
spec step cannot design analytics dashboards without knowing what data is available.

**Recommendation:** Either (a) add data flows showing how AnalyticsEngine receives
events from other components, what processing it performs, and where results are
stored/served, or (b) remove AnalyticsEngine from the diagram if analytics is
out of scope for v1.

**Trace:** Component diagram → missing data flow coverage
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

Continue with: `/scaffold:platform-parity-review`, `/scaffold:implementation-plan`, `/scaffold:story-tests`, `/scaffold:api-contracts`, `/scaffold:database-schema`, `/scaffold:ux-spec`
