---
description: "Domain model review for completeness and quality"
long-description: "Performs a structured multi-pass review of domain models, targeting failure modes specific to DDD artifacts. Covers PRD coverage, bounded context integrity, entity/VO classification, aggregate boundaries, domain events, invariants, ubiquitous language, cross-domain relationships, downstream readiness, and internal consistency."
---

Perform a structured multi-pass review of domain models, targeting failure modes specific to domain modeling artifacts. Follow the review methodology from review-methodology knowledge base.

## Mode Detection

Check if `docs/reviews/review-domain-modeling.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated domain models
3. Run all review passes again on the current models
4. Focus on: remaining unresolved findings, regressions from fixes, and any new domains or entities added since the last review
5. Update the review report rather than replacing it — preserve the fix history

## Review Process

### Step 1: Read the Artifact

Read all files in `docs/domain-models/` completely. Also read `docs/plan.md` and `docs/user-stories.md` as upstream artifacts for cross-reference and coverage checking.

### Step 2: Multi-Pass Review

Execute 10 review passes. For each pass, re-read the artifact with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: PRD Coverage Audit**
List every feature from the PRD and identify which domain(s) it touches. Flag orphaned requirements (PRD features with no domain home) and phantom domains (domains with no PRD traceability). Check that NFRs are reflected in domain constraints where relevant.

**Pass 2: Bounded Context Integrity**
For each bounded context, list entities and value objects. Search for entity names appearing in multiple contexts. For shared names, determine: genuinely shared (shared kernel) or different concept with same name (context boundary). Verify integration mechanisms at every context boundary (domain events, API calls, anticorruption layers). Check no context directly references another context's internals.

**Pass 3: Entity vs Value Object Classification**
For each entity, ask: Does it need tracking over time? Are two identical instances the same or different? Does it have a lifecycle? For each value object, ask: Would the system ever update it independently? Does it appear as a subject in domain events? Does it need a unique identifier? Flag misclassifications — they propagate into database schema and API design.

**Pass 4: Aggregate Boundary Validation**
List invariants for each aggregate. Verify each can be enforced within the aggregate's boundary without reaching into other aggregates. Flag aggregates referencing others by direct object reference (should use ID). Look for aggregates with more than 5-7 entities. Check for cross-aggregate invariants needing domain services or sagas.

**Pass 5: Domain Event Completeness**
For each entity with a lifecycle, trace state transitions. Verify each transition has a domain event. Check naming uses past tense business language ("OrderPlaced" not "CreateOrder"). Verify payloads include enough context for consumers without carrying entire entity state. Flag implicit transitions (timer-based, batch, external trigger).

**Pass 6: Invariant Specification**
For each aggregate, list all invariants. Verify each is a testable boolean assertion, not a vague statement. Check scope (always true? certain states only?), violation behavior (reject? compensate?), and edge cases. Flag implicit invariants obvious to domain experts but not documented.

**Pass 7: Ubiquitous Language Consistency**
Build a glossary from all models: every entity, value object, event, and service name. Search for synonyms (Customer/Client/User) and homonyms (same term, different attributes in different contexts). For synonyms, pick one term. For homonyms, document as a context boundary.

**Pass 8: Cross-Domain Relationship Clarity**
List all context map relationships. For each, verify: upstream/downstream direction, communication mechanism, and data that flows across the boundary. Flag undocumented relationships where one domain references another's concepts. Check for circular dependencies. Verify relationship multiplicity.

**Pass 9: Downstream Readiness**
Verify ADRs step can proceed with: clear domain boundaries for decomposition decisions, technology-relevant constraints (real-time requirements, data volumes, consistency models), performance-sensitive operations, integration complexity metrics, data storage characteristics (relational vs document vs graph), and security boundaries identifying sensitive data domains.

**Pass 10: Internal Consistency**
Verify cross-references resolve (entity A "references" entity B and B exists). Check entity attribute lists match relationship diagrams. Verify invariants reference entities and attributes that exist. Check domain events reference defined state transitions. Look for terminology drift within a single document.

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| DM-001 | P0 | Pass 1 | [description] | [domain/section] |
| DM-002 | P1 | Pass 4 | [description] | [domain/section] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing concept — fix once
- **Same domain**: Findings in the same bounded context — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected files.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to files in `docs/domain-models/`. For each fix, verify it does not break cross-references or introduce inconsistencies.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not break cross-references or introduce inconsistencies across domains
3. Check for new issues introduced by the fix (especially ubiquitous language drift)

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/review-domain-modeling.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3.**

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns in the `multi-model-dispatch` skill.

1. **Detect CLIs**: Check for `codex` and `gemini` CLI availability
2. **Bundle context**: Include the reviewed artifact + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- `docs/domain-models/` directory (the reviewed artifact)
- `docs/plan.md` (PRD)
- `docs/user-stories.md`
- Focus areas: bounded context violations, entity misclassification, incomplete event coverage, language drift

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read all files in `docs/domain-models/`, `docs/plan.md`, and `docs/user-stories.md`
2. Execute all 10 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. Write review report to `docs/reviews/review-domain-modeling.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — Domain modeling review findings documented in `docs/reviews/review-domain-modeling.md`.

**Next:** Run `/scaffold:adrs` to create Architecture Decision Records informed by the reviewed domain models.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
