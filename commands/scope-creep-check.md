---
description: "Verify all specs stay within PRD boundaries with no untraced scope expansion"
long-description: "Compares every specification artifact against the PRD to detect features without requirement justification, requirements that inflated during documentation, gold-plating of existing features, and deferred items that leaked into implementation. Quantifies effort savings if scope is tightened."
---

Compare every specification artifact against the PRD to ensure the documented system matches what was actually requested. Features that cannot be traced to a PRD requirement are scope creep. Requirements that grew during documentation are scope inflation. Extra engineering on non-critical features is gold-plating. This validation catches all three and quantifies the cost.

## Inputs

Read all of these artifacts (skip any that do not exist):

- `docs/plan.md` — Source of truth for scope (primary input)
- `docs/user-stories.md` — Stories and acceptance criteria
- `docs/domain-models/` — Entities and aggregates
- `docs/system-architecture.md` — Components, services, infrastructure
- `docs/database-schema.md` or `docs/schema/` — Tables and columns
- `docs/api-contracts.md` or `docs/api/` — Endpoints and operations
- `docs/ux-specification.md` or `docs/ux/` — Screens and flows
- `docs/implementation-plan.md` or `docs/plan.md` — Task breakdown
- `docs/adrs/` — Decision records

## What to Check

### 1. PRD Boundary Extraction

Build the definitive scope reference:
- **In scope**: List every feature, capability, and NFR the PRD requires
- **Explicitly out of scope**: List every deferred item, future enhancement, and excluded capability
- **NFR targets**: List specific targets (latency, uptime, accessibility level, scale)
- **MoSCoW priority**: Note Must/Should/Could/Won't classifications if present

### 2. Feature-to-PRD Tracing

Scan every artifact for concrete capabilities (API endpoints, database tables, UI screens, background jobs, external integrations, architecture components). Classify each as:
- **Traced** — Maps directly to a PRD requirement
- **Supporting** — Necessary infrastructure for a traced capability
- **Creep** — No PRD justification and not necessary infrastructure

### 3. Requirement Scope Inflation

Compare each PRD requirement's original scope with its implementation scope. Look for: extra sub-features, higher quality targets, more platforms than specified. Heuristics: 10+ endpoints per feature, 5+ tables per entity, or implementation description 10x longer than PRD description all suggest inflation.

### 4. Gold-Plating Detection

Gold-plating over-engineers existing features: over-abstraction (plugin systems for one plugin), premature optimization (caching for 100 users), excessive error handling (circuit breakers for simple services), UI polish beyond requirements (dark mode when PRD does not mention it). Detection rule: "If I removed this, would any PRD requirement be unmet?"

### 5. Deferred Item Leak Check

Extract all deferred items from the PRD. Search all specs for: direct references, supporting-only infrastructure, "ready for v2" preparations (locale columns, mobile gateways), and schema fields or API parameters serving no current requirement.

### 6. NFR Scope Alignment

For each NFR, verify the implementation target matches the PRD target:
- PRD says "p95 under 500ms" — does architecture target 100ms? (over-specified)
- PRD says "WCAG AA" — does UX spec target WCAG AAA? (gold-plating)
- PRD says "99.9% uptime" — does operations design for 99.99%? (enormous effort difference)

### 7. MoSCoW Priority Alignment

If the PRD uses MoSCoW prioritization:
- Verify Must-have items have complete implementation coverage
- Verify Should-have items are not consuming disproportionate effort
- Verify Could-have items have not been fully built out (they should be minimal or deferred)
- Verify Won't-have items do not appear anywhere in specs

## Findings Format

For each issue found:
- **ID**: SC-NNN
- **Severity**: P0 (blocks implementation) / P1 (significant gap) / P2 (minor issue) / P3 (informational)
- **Finding**: What's wrong
- **Location**: Which file/section and which capability
- **Fix**: Specific remediation (defer, simplify, or remove)

### Severity guidelines:
- **P0**: Deferred item fully implemented in specs. Won't-have item present in tasks.
- **P1**: Significant scope creep (new feature with multiple tasks and no PRD justification). Major gold-plating (entire subsystem over-engineered).
- **P2**: Minor scope creep (extra endpoint or screen). Slight scope inflation. Could-have item fully built out.
- **P3**: Supporting infrastructure that is generous but not harmful. NFR slightly over-specified.

### Summary block:

```
Total capabilities: NN
Traced to PRD: NN (XX%) | Supporting: NN (XX%)
Scope creep: NN (XX%) | Gold-plating: NN (XX%)
Estimated savings if tightened: ~NN tasks, ~NN days
```

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3. MANDATORY at depth 4+.**

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns and auth verification in the `multi-model-dispatch` skill.

**Previous auth failures do NOT exempt this dispatch.** Auth tokens refresh — always re-check before each review step.

1. **Verify auth**: Run `codex login status` and `NO_BROWSER=true gemini -p "respond with ok" -o json 2>/dev/null` (exit 41 = auth failure). If auth fails, tell the user to run `! codex login` or `! gemini -p "hello"` for interactive recovery. Do not silently skip.
2. **Bundle context**: Include the reviewed artifacts + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- `docs/plan.md` (PRD — the scope boundary), `docs/user-stories.md`, `docs/implementation-plan.md`
- Focus areas: capabilities not traced to PRD, gold-plating, scope inflation, deferred items leaking back in

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifacts specifically looking for issues the initial passes might have missed.

## Process

1. Read all input artifacts listed above
2. Build the PRD boundary reference (in scope, out of scope, NFR targets, MoSCoW)
3. Scan every artifact and list every concrete capability
4. Classify each capability (traced, supporting, creep)
5. Check each requirement for scope inflation
6. Check for gold-plating patterns
7. Check for deferred item leaks
8. Verify NFR target alignment
9. Check MoSCoW priority alignment (if applicable)
10. Compile findings report sorted by severity
11. Present summary with effort savings estimate to user
12. (Depth 4+) Dispatch multi-model validation — verify CLI auth, bundle context, dispatch, reconcile findings, apply high-confidence fixes
13. Execute approved fixes

## After This Step

When this step is complete, tell the user:

---
**Validation: Scope Creep Check complete** — All specs verified against PRD boundaries.

**Next:** Run `/scaffold:apply-fixes-and-freeze` — Apply all approved validation fixes and freeze documentation for implementation.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
