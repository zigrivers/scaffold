---
description: "System architecture review for completeness and quality"
long-description: "Performs a structured multi-pass review of the system architecture document, targeting failure modes specific to architecture artifacts. Covers domain model coverage, ADR compliance, data flow completeness, module structure, state consistency, diagram integrity, extension points, invariant verification, downstream readiness, and internal consistency."
---

Perform a structured multi-pass review of the system architecture, targeting failure modes specific to architecture artifacts. Follow the review methodology from review-methodology knowledge base.

## Mode Detection

Check if `docs/reviews/review-architecture.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated architecture
3. Run all review passes again on the current architecture document
4. Focus on: remaining unresolved findings, regressions from fixes, and any new components or data flows added since the last review
5. Update the review report rather than replacing it — preserve the fix history

## Review Process

### Step 1: Read the Artifact

Read `docs/system-architecture.md` completely. Also read `docs/domain-models/`, `docs/adrs/`, and `docs/plan.md` as upstream artifacts for cross-reference and compliance checking.

### Step 2: Multi-Pass Review

Execute 10 review passes. For each pass, re-read the artifact with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: Domain Model Coverage**
List every bounded context from domain models. For each, verify a corresponding module, service, or component exists. For each aggregate root, verify its data and behavior are housed in an identified component. Check that domain relationships (context map) are reflected in component interactions and domain events map to communication channels.

**Pass 2: ADR Constraint Compliance**
List every accepted ADR and its core decision. Trace each ADR's impact on the architecture. Verify technology selections, architectural patterns, and constraints all conform. For ADRs with negative consequences, verify the architecture accounts for mitigation strategies.

**Pass 3: Data Flow Completeness**
List every component and verify each appears as source or destination in at least one data flow. For each flow, verify source, destination, protocol/mechanism, and data shape are specified. Check bidirectional flows documented in both directions. Verify error flows and external system interactions.

**Pass 4: Module Structure Integrity**
Draw the dependency graph between modules. Check for cycles (A depends on B depends on C depends on A). Verify dependency direction aligns with domain upstream/downstream. Check module sizes — no module should house more than one bounded context. Verify shared/common modules are minimal and not becoming dumping grounds.

**Pass 5: State Consistency**
List every state store (databases, caches, session stores, client-side state, queues). Identify what data each holds and which component owns it. Check for the same data in multiple stores without documented synchronization. Verify state transitions correspond to domain events. Flag implicit state in component memory or environment variables.

**Pass 6: Diagram/Prose Consistency**
List components from diagrams and from prose. Verify 1:1 correspondence. Check component names match exactly. Check relationships and directionality agree. Flag components that appear in diagrams but not prose (or vice versa).

**Pass 7: Extension Point Integrity**
List all claimed extension points. For each, verify a concrete interface or contract exists (not just "this module is extensible"). Check extension mechanism (plugin, event hooks, middleware, strategy pattern), contract (inputs, outputs, allowed side effects), and at least one example use case.

**Pass 8: Invariant Verification**
List every domain invariant. Identify which component(s) enforce each. For single-component invariants, verify the component has access to all required state. For cross-component invariants, verify coordination mechanism (saga, compensating transaction). Check consistency model (strong vs eventual) aligns with business tolerance.

**Pass 9: Downstream Readiness**
Database schema step needs: data storage components with technology and role, entity-to-storage mapping, explicit data relationships. API contracts step needs: component interfaces at operation level, communication protocols, auth architecture. UX spec step needs: frontend component hierarchy, state management, API integration points. Implementation tasks step needs: clear module boundaries, explicit dependencies, visible complexity.

**Pass 10: Internal Consistency**
Build a terminology list from the document. Check for variant names across sections. Verify cross-references ("as described in Section X" actually matches). Check quantitative consistency (Section 2 says "three services," Section 5 describes four). Verify technology versions and library names are consistent.

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| ARCH-001 | P0 | Pass 1 | [description] | [section] |
| ARCH-002 | P1 | Pass 3 | [description] | [section] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing component — fix once
- **Same section**: Findings in the same architecture section — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected sections.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to `docs/system-architecture.md`. For each fix, verify it does not break ADR compliance or introduce inconsistencies with domain models.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not break ADR compliance or domain model coverage
3. Check for diagram/prose inconsistencies introduced by the fix

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/review-architecture.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3.**

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns in the `multi-model-dispatch` skill.

1. **Detect CLIs**: Check for `codex` and `gemini` CLI availability
2. **Bundle context**: Include the reviewed artifact + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- `docs/system-architecture.md` (the reviewed artifact)
- `docs/plan.md` (PRD)
- `docs/domain-models/` directory
- ADR files in `docs/adrs/`
- Focus areas: hidden circular dependencies, incomplete data flows, missing components, state inconsistencies

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read `docs/system-architecture.md`, `docs/domain-models/`, `docs/adrs/`, and `docs/plan.md`
2. Execute all 10 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. Write review report to `docs/reviews/review-architecture.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — Architecture review findings documented in `docs/reviews/review-architecture.md`.

**Next:** Run `/scaffold:database-schema` or `/scaffold:api-contracts` to proceed to the specification phase.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
