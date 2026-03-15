# PRD Review & Innovation Split — Design Spec

Split `prd-gap-analysis` into two dedicated phases (`review-prd` + `innovate-prd`) to bring the pre-pipeline PRD phases to parity with the established review/innovation pattern used by User Stories and Domain Modeling.

## Problem

The PRD gap analysis phase combines review (finding defects) and innovation (finding opportunities) in a single phase. This creates three problems:

1. **No formal review structure.** The gap analysis KB (`gap-analysis.md`) teaches general techniques but doesn't organize them into the multi-pass failure-mode structure used by every other review phase. Agents get general guidance instead of a repeatable checklist.
2. **Mixed cognitive modes.** Review is convergent (find what's wrong); innovation is divergent (find what's better). Combining them dilutes both.
3. **No independent methodology control.** MVP users can't get a quality check without also getting an innovation pass. User Stories already solves this with separate `review-user-stories` (always on) and `innovate-user-stories` (conditional).

## Approach

**Approach A: Minimal Split** — Split into two phases, creating only what's missing while reusing existing KB material. `gap-analysis.md` remains as general-purpose knowledge; its innovation section migrates to the new innovation KB.

Rejected alternatives:
- **Approach B (Consolidate gap-analysis.md into review KB)** — Loses general-purpose gap analysis knowledge reusable by other phases.
- **Approach C (Innovation as a review pass)** — Violates review/innovation separation principle; can't independently enable/disable in presets.

## New Files

### 1. `pipeline/pre/review-prd.md` (Meta-prompt)

```yaml
---
name: review-prd
description: Multi-pass review of the PRD for completeness, clarity, and downstream readiness
phase: "pre"
dependencies: [create-prd]
outputs: [docs/reviews/pre-review-prd.md]
conditional: null
knowledge-base: [review-methodology, review-prd, prd-craft, gap-analysis]
---
```

- **Dependencies:** `[create-prd]` — first thing after PRD creation
- **Outputs:** Primary output is the review report. The PRD (`docs/prd.md`) is also updated as a side effect of fix application (same pattern as `review-user-stories`, which outputs only the report in frontmatter but updates `docs/user-stories.md` during fix application).
- **Knowledge-base:** `review-methodology` (shared review process), `review-prd` (PRD-specific failure modes), `prd-craft` (what a good PRD looks like), `gap-analysis` (general gap analysis techniques). Note: `prd-craft` and `gap-analysis` are included because PRD review requires domain knowledge about what constitutes a good PRD and general gap analysis techniques — this is an intentional addition beyond the `review-user-stories` pattern, which only references `review-methodology` and `review-user-stories`.
- **Quality criteria:** All passes executed with findings documented. Every finding categorized P0-P3. Fix plan for P0/P1. Fixes applied and re-validated. Downstream readiness confirmed (User Stories can proceed).
- **Methodology scaling:**
  - deep: All 8 review passes. Full findings report with severity categorization. Fixes applied and re-validated.
  - mvp: Passes 1-2 only (problem statement and persona coverage). Focus on blocking gaps.
  - custom:depth(1-5): Depth 1-2: passes 1-2 only (Problem Statement Rigor, Persona Coverage). Depth 3: passes 1-4 (add Feature Scoping, Success Criteria). Depth 4-5: all 8 passes.
- **Mode Detection:** If `docs/reviews/pre-review-prd.md` exists, re-review. Read previous findings, check which were addressed, run passes again on updated PRD.

### 2. `knowledge/review/review-prd.md` (KB — PRD failure modes)

8 passes, ordered broadest to most specific per review methodology:

**Coverage passes (1-2):**

#### Pass 1: Problem Statement Rigor
- Is the problem specific, testable, grounded in observable reality?
- Has quantitative evidence where available?
- Doesn't prescribe solutions?
- Names a specific user group, not "users" or "everyone"?
- Catches: vague aspirational statements, technology-as-problem, solution masquerading as problem
- P0 example: "Problem statement is 'We need to modernize our technology stack' — this prescribes a solution, not a problem. No user-facing pain point identified."
- P1 example: "Problem statement names 'small business owners' but provides no quantitative evidence of the pain. How many hours wasted? What error rate?"

#### Pass 2: Persona & Stakeholder Coverage
- Are personas goal-driven with constraints, current behavior, and success criteria?
- Every stakeholder group represented (end users, admins, support, integrators)?
- No "Everything User" anti-pattern (contradictory persona)?
- 2-4 meaningful personas (>6 suggests scope too broad, 1 suggests missing secondary users)?
- Catches: generic role labels, missing stakeholder groups, contradictory personas
- P0 example: "PRD defines a single persona 'User' with no goals, constraints, or context. Cannot write stories — no actor to attribute them to."
- P1 example: "PRD describes end user and admin but no mention of support staff, who handle 200+ tickets/week per the problem statement."

**Consistency passes (3-4):**

#### Pass 3: Feature Scoping Completeness
- In-scope, out-of-scope, and deferred lists all present?
- Features specific enough to estimate (not "user management" or "analytics")?
- Prioritization applied (MoSCoW or equivalent)?
- No "requirements as solutions" (PRD says WHAT, not HOW)?
- Catches: missing scope boundaries, vague feature descriptions, technical prescriptions
- P0 example: "No out-of-scope section exists. 'Product management' is listed as a feature with no further detail — could mean anything from a product catalog to a full PIM system."
- P1 example: "Feature 'notifications' doesn't specify channel (push? email? in-app? all three?) — two engineers would build different things."

#### Pass 4: Success Criteria Measurability
- Every criterion has a target value AND a measurement method?
- Criteria tied to the problem statement (not generic "revenue increases")?
- Types covered: user behavior, business metrics, technical metrics, adoption?
- Catches: unmeasurable criteria, criteria disconnected from problem, missing measurement method
- P0 example: "Only success criterion is 'users are satisfied with the product' — no target value, no measurement method, not tied to problem statement."
- P1 example: "Success criterion 'checkout abandonment decreases' has no target value. Decrease from 72% to 71% would technically satisfy it."

**Structural integrity passes (5-7):**

#### Pass 5: NFR Quantification
- All NFR categories addressed: performance, scalability, availability, security, accessibility, data retention, i18n, browser/device support, monitoring?
- Quantified with numbers, not adjectives ("p95 under 200ms" not "fast")?
- Conditions specified (under what load, on what connection)?
- Catches: missing NFR categories, vague qualitative NFRs, NFRs without conditions
- P0 example: "No NFRs specified at all. Implementing agents will make arbitrary performance and security decisions."
- P1 example: "Performance requirement says 'the system should be fast' — no response time targets, no percentile, no load conditions."

#### Pass 6: Constraint & Dependency Documentation
- Technical, timeline, budget, team, and regulatory constraints present?
- Each constraint traceable to downstream architectural impact?
- External integrations identified with API limitations, costs, rate limits?
- Catches: missing constraint categories, constraints without downstream traceability, undocumented integrations
- P1 example: "PRD mentions Stripe integration but doesn't note PCI DSS compliance requirement — this will surface as a surprise during architecture."
- P2 example: "Team constraint '3 developers' is stated but not connected to scope decisions — are all features achievable with this team size?"

#### Pass 7: Error & Edge Case Coverage
- Sad paths addressed for every feature with user input or external dependencies?
- Session expiry, network failure, concurrent access scenarios considered?
- Failure modes for third-party integrations documented?
- Catches: happy-path-only features, missing failure handling, undocumented edge cases
- P1 example: "Checkout flow describes the happy path but never addresses: payment failure, session expiry mid-checkout, network drop during payment processing."
- P2 example: "User profile edit doesn't address concurrent edit scenario — what if user edits on two devices simultaneously?"

**Downstream readiness (8):**

#### Pass 8: Downstream Readiness for User Stories
- Can stories be written from this PRD without guesswork?
- Features specific enough to map to stories (one feature = one or more stories)?
- Personas specific enough to be story actors?
- Business rules explicit enough to become acceptance criteria?
- Error scenarios detailed enough to become negative test scenarios?
- Catches: features too vague for story mapping, personas too generic for story attribution
- P0 example: "Feature 'user management' cannot be decomposed into stories — what operations? What user types? What permissions model?"
- P1 example: "Business rules for discount application are implied but not stated — story acceptance criteria will have to guess at validation logic."

### 3. `pipeline/pre/innovate-prd.md` (Meta-prompt)

```yaml
---
name: innovate-prd
description: Discover feature-level innovation opportunities in the PRD
phase: "pre"
dependencies: [review-prd]
outputs: [docs/prd-innovation.md]
conditional: "if-needed"
knowledge-base: [prd-innovation, prd-craft]
---
```

- **Dependencies:** `[review-prd]` — runs on a reviewed, clean PRD
- **Outputs:** Primary output is the innovation report. The PRD (`docs/prd.md`) is also updated as a side effect when approved innovations are integrated (same pattern as `innovate-user-stories`, which outputs only the innovation report in frontmatter).
- **Conditional:** `"if-needed"` — can be disabled in methodology presets
- **Quality criteria:** Each suggestion has cost estimate (trivial/moderate/significant), clear user benefit, and impact assessment. Approved innovations documented to same standard as existing features. PRD scope boundaries respected. User approval required before modifying PRD.
- **Methodology scaling:**
  - deep: Full innovation pass across all categories. Competitive research. Cost/impact matrix. Detailed integration of approved innovations.
  - mvp: Not applicable — disabled in MVP preset.
  - custom:depth(1-5): Depth 1-2: not typically enabled. Depth 3: quick scan for obvious gaps. Depth 4-5: full pass with evaluation framework.
- **Mode Detection:** If `docs/prd-innovation.md` exists, re-innovation pass. Read previous suggestions and disposition, focus on new opportunities from PRD changes since last run.

### 4. `knowledge/product/prd-innovation.md` (KB — PRD-level innovation)

Feature-level innovation techniques. Distinct from `user-story-innovation.md` which covers UX-level enhancements.

**Sections:**

1. **Scope Boundary** — Feature-level innovation only: new capabilities, new user flows, competitive positioning, defensive product gaps. If an enhancement doesn't require a new PRD section or feature entry, it belongs in user story innovation instead.

2. **Competitive & Market Analysis** — Research similar products. What do they do well? What's missing? What would users expect based on market norms? Focus on actionable gaps, not exhaustive competitor matrices.

3. **User Experience Gaps** — Friction points in core flows. First-time user experience (the first 60 seconds). Onboarding gaps. The "delightful vs. functional" question for each flow.

4. **Missing Expected Features** — Quality-of-life features users would search for and be surprised are absent: search, filtering, sorting, undo, keyboard shortcuts, notifications, export/import.

5. **AI-Native Opportunities** — Features impractical without AI: smart defaults, auto-categorization, natural language interfaces, predictive behavior. Where could AI make the experience feel magic rather than manual?

6. **Defensive Product Thinking** — The "1-star review" technique. Most common abandonment reason. Accessibility, performance, or mobile gaps that alienate users. What would a user complain about on day 1?

7. **Evaluation Framework** — Cost assessment (trivial/moderate/significant), impact assessment (nice-to-have/noticeable improvement/significant differentiator), decision framework (must-have-v1/backlog/reject), presentation format for user approval (grouped by theme, batch approval).

## Modified Files

### `knowledge/product/gap-analysis.md`
- Remove "Innovation Opportunities" section (lines 263-274)
- Remove `Innovation opportunities: [N]` line from the Summary template (line 288)
- Remove `### Innovation Opportunities` subsection from the Gap Report Structure template (lines 312-316)
- Keep all review-relevant content: systematic analysis approaches, ambiguity detection, edge case discovery, NFR gap patterns, contradiction detection, output format (minus innovation references)

### `pipeline/pre/prd-gap-analysis.md`
- Delete — replaced by `review-prd.md` + `innovate-prd.md`

### `methodology/deep.yml`
Replace:
```yaml
prd-gap-analysis: { enabled: true }
```
With:
```yaml
review-prd: { enabled: true }
innovate-prd: { enabled: true }
```

### `methodology/mvp.yml`
Replace:
```yaml
prd-gap-analysis: { enabled: false }
```
With:
```yaml
review-prd: { enabled: true }
innovate-prd: { enabled: false }
```

### `methodology/custom-defaults.yml`
Replace:
```yaml
prd-gap-analysis: { enabled: true }
```
With:
```yaml
review-prd: { enabled: true }
innovate-prd: { enabled: false }
```

### Downstream meta-prompt dependency and input updates

**`pipeline/pre/user-stories.md`:**
- Update `dependencies` from `[create-prd]` to `[review-prd]`. Since `review-prd` is always-on (including MVP), `user-stories` should depend on the reviewed PRD, not the raw PRD. When `innovate-prd` is enabled, it and `user-stories` can both proceed after `review-prd` completes (they are parallel in the dependency graph). `user-stories` lists the innovation report as an optional input, so it benefits from innovations if `innovate-prd` finishes first but does not block on it.
- Update Inputs section: replace `docs/prd-gap-analysis.md (optional)` with `docs/reviews/pre-review-prd.md (optional)` and add `docs/prd-innovation.md (optional)`

**`pipeline/phase-01-domain-modeling.md`:**
- Dependency field (`[innovate-user-stories]`) does NOT change — it depends on user stories, not directly on PRD phases. The PRD dependency is transitive.
- Update Inputs section only: replace `docs/prd-gap-analysis.md (optional)` with `docs/reviews/pre-review-prd.md (optional)` and add `docs/prd-innovation.md (optional)`

### Cross-reference updates in other pipeline/knowledge files

**`knowledge/core/user-story-innovation.md`:**
- Line 9 says "Feature-level innovation belongs in PRD gap analysis." Update to "Feature-level innovation belongs in PRD innovation (`innovate-prd`)."

**`pipeline/pre/innovate-user-stories.md`:**
- Line 13 says "This is NOT feature-level innovation (that belongs in PRD gap analysis)". Update to "This is NOT feature-level innovation (that belongs in PRD innovation — `innovate-prd`)."

### `docs/v2/` references
All files in `docs/v2/` that mention `prd-gap-analysis` updated to reference `review-prd` and/or `innovate-prd` as appropriate. Find with: `grep -rl 'prd-gap-analysis' docs/v2/`

## Pipeline Order After Change

```
Phase 1 — Product Definition:
  1. create-prd          → docs/prd.md
  1a. review-prd         → docs/reviews/pre-review-prd.md, updated docs/prd.md
  1b. innovate-prd       → docs/prd-innovation.md, updated docs/prd.md (conditional)

Phase 5 — Stories & Planning:
  14. user-stories        → docs/user-stories.md
  14a. review-user-stories → docs/reviews/pre-review-user-stories.md
  14b. innovate-user-stories → docs/user-stories-innovation.md (conditional)
```

Both follow the same pattern: create → review → innovate (optional).

## What Is NOT Changing

- `commands/prd-gap-analysis.md` (v1 — out of scope)
- `prompts.md` prompt #2 (v1 — out of scope)
- `skills/scaffold-pipeline/SKILL.md` (v1 — out of scope)
- `scripts/` (v1 — out of scope)
- `knowledge/product/prd-craft.md` (no changes needed)
- `knowledge/review/review-methodology.md` (no changes needed)
