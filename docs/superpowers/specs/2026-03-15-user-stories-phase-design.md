# User Stories Phase Integration — Design Spec

**Date:** 2026-03-15
**Status:** Draft
**Authors:** Ken Allred + Claude

---

## Problem

The v2 pipeline folded User Stories into Phase 7 (Implementation Task Breakdown) with the rationale "stories inform and become tasks." This creates four problems:

1. **Phase 7 overload** — creating stories AND decomposing tasks in one step produces lower quality on both
2. **Late arrival** — other phases need stories as input (UX spec needs user journeys, domain modeling benefits from knowing who does what), but stories buried in Phase 7 come too late
3. **Lost quality gate** — v1 proved stories need their own review/gap-analysis cycle; folding them in eliminated that
4. **Broken traceability** — without explicit stories, the PRD → Tasks chain has a missing link that validation can't verify

## Decision

Pull User Stories out of Phase 7 into their own pipeline steps within the pre-pipeline section, positioned after PRD Gap Analysis and before Phase 1 (Domain Modeling).

---

## 1. Pipeline Position

User Stories are added to the **Pre-Pipeline: Project Definition** section. The pre-pipeline grows from 2 to 5 steps:

| # | Step | File | Conditional |
|---|------|------|-------------|
| 1 | Create PRD | `pipeline/pre/create-prd.md` | No |
| 2 | PRD Gap Analysis | `pipeline/pre/prd-gap-analysis.md` | No |
| 3 | **User Stories** | `pipeline/pre/user-stories.md` | **No** |
| 4 | **Review User Stories** | `pipeline/pre/review-user-stories.md` | **No** |
| 5 | **Innovate User Stories** | `pipeline/pre/innovate-user-stories.md` | **if-needed** |

### Rationale

- Stories need the PRD as input (available after step 2)
- Domain modeling (Phase 1) benefits from user journeys as domain discovery input
- UI/UX spec (Phase 6) needs stories to know what screens/flows to design
- Implementation tasks (Phase 7) need stories as their primary "what to build" input
- Pre-pipeline is the "project definition" zone — stories are the last step of defining WHAT before technical phases define HOW
- No renumbering of existing phases 1-10

### Always-On

User Stories creation and review are **always-on** (not conditional). Even a CLI tool with no UI has users doing things. The innovation step is **conditional ("if-needed")** — a "go deeper" activity that MVP users can skip.

---

## 2. Phase File Structure

### `pipeline/pre/user-stories.md` (Creation)

```yaml
name: user-stories
description: Translate PRD features into user stories with acceptance criteria
phase: "pre"
dependencies: [create-prd]
outputs: [docs/user-stories.md]
conditional: null
knowledge-base: [user-stories]
```

Sections follow established meta-prompt conventions: Purpose, Inputs, Expected Outputs, Quality Criteria, Methodology Scaling, Mode Detection.

### `pipeline/pre/review-user-stories.md` (Review)

```yaml
name: review-user-stories
description: Multi-pass review of user stories for PRD coverage, quality, and downstream readiness
phase: "pre"
dependencies: [user-stories]
outputs: [docs/reviews/pre-review-user-stories.md]
conditional: null
knowledge-base: [review-methodology, review-user-stories]
```

### `pipeline/pre/innovate-user-stories.md` (Innovation)

```yaml
name: innovate-user-stories
description: Discover UX-level enhancements and innovation opportunities in user stories
phase: "pre"
dependencies: [review-user-stories]
outputs: [docs/user-stories.md]
conditional: "if-needed"
knowledge-base: [user-stories, gap-analysis]
```

### Phase 1 Dependency Update

`phase-01-domain-modeling` changes its dependencies from `[create-prd]` to `[review-user-stories]`. This ensures domain modeling waits for stories to be finalized. When innovation is enabled, the dependency chain naturally resolves (innovation depends on review, domain modeling depends on review — innovation runs between them when active).

---

## 3. Depth Scaling (1-5)

Depth scales the *detail per story*, not the *number of stories*. Even at depth 1, every PRD feature must have at least one story — coverage is non-negotiable. What changes is how thoroughly each story is specified.

| Depth | Name | Stories | Acceptance Criteria | Additional |
|-------|------|---------|-------------------|------------|
| **1** | MVP floor | Flat list of one-liner stories grouped by PRD section. "As a [persona], I want [action], so that [outcome]" only. | One bullet per story — the primary success condition. | No epics, no scope boundaries, no data requirements. |
| **2** | Lightweight | Stories grouped into epics. Personas defined briefly. MoSCoW priority per story. | 2-3 bullets per story covering happy path and primary error case. | Scope boundary noted for stories that overlap. |
| **3** | Balanced | Full story template: ID, title, story statement, priority. Persona definitions with goals and context. Epic structure mirrors PRD sections. | Given/When/Then format. 3-5 scenarios per story covering happy path, key error cases, and edge cases. | Scope boundaries, data/state requirements, cross-story dependencies noted. |
| **4** | Thorough | Everything in 3, plus story dependency mapping and explicit traceability back to PRD requirement IDs. | Full Given/When/Then with parameterized examples. Negative scenarios. State preconditions explicit. | UI/UX notes per story. Story splitting rationale documented. |
| **5** | Deep ceiling | Everything in 4, plus persona journey maps across story sequences. Cross-story interaction analysis. | Exhaustive scenarios including concurrency, permissions boundaries, data migration edge cases. | Cross-story dependency graph. Acceptance criteria directly map to test cases. Story-to-domain-event mapping for Phase 1 consumption. |

---

## 4. Knowledge Base Entries

### 4a: `knowledge/core/user-stories.md`

```yaml
name: user-stories
description: Expert knowledge for translating product requirements into well-formed user stories
topics: [user-stories, personas, acceptance-criteria, story-splitting, INVEST, epics, traceability]
```

Content outline (~300 lines):

1. **Story Anatomy** — the "As a / I want / So that" template, when to deviate, common malformations
2. **INVEST Criteria** — Independent, Negotiable, Valuable, Estimable, Small, Testable — with concrete examples of passing and failing each criterion
3. **Persona Definition** — extracting personas from PRD, goal-driven personas vs. role labels, when multiple personas collapse into one
4. **Epic Structure** — grouping stories by user journey (not by system component), epic sizing heuristics, when to split epics
5. **Acceptance Criteria Patterns** — Given/When/Then format, parameterized scenarios, negative scenarios, boundary conditions, the difference between acceptance criteria and test cases
6. **Story Splitting Heuristics** — by workflow step, by data variation, by operation (CRUD), by platform, by user role, by happy/sad path — with before/after examples
7. **Scope Boundaries** — what a story explicitly does NOT include, preventing scope creep, relationship to "Won't" in MoSCoW
8. **PRD-to-Story Traceability** — ensuring every PRD feature maps to at least one story, handling compound requirements, implicit requirements (error handling, accessibility)
9. **Story Dependencies** — when stories must be implemented in order, blocked-by vs. informed-by relationships, how dependencies feed into task decomposition
10. **Common Pitfalls** — stories that describe implementation ("As a developer, I want a REST endpoint..."), stories too large to implement, vague acceptance criteria, missing personas, stories without value statements

### 4b: `knowledge/review/review-user-stories.md`

```yaml
name: review-user-stories
description: Failure modes and review passes specific to user story artifacts
topics: [review, user-stories, coverage, acceptance-criteria, INVEST, testability]
```

Multi-pass structure (~200 lines):

| Pass | Failure Mode | What It Catches |
|------|-------------|-----------------|
| 1 | **PRD Coverage** | Missing stories — PRD features/flows with no corresponding story |
| 2 | **Acceptance Criteria Quality** | Vague, untestable, or missing acceptance criteria |
| 3 | **Story Independence** | Stories with hidden coupling, circular dependencies, or that can't be implemented standalone |
| 4 | **Persona Coverage** | Missing personas, stories attributed to wrong persona, personas without any stories |
| 5 | **Sizing & Splittability** | Stories too large for a single agent session, stories that should be split |
| 6 | **Downstream Readiness** | Can Phase 1 (domain modeling) consume these stories? Are entities/events discoverable from the acceptance criteria? |

Each pass follows the established pattern: "What to Check" → "Why This Matters" → "How to Check" → "What a Finding Looks Like" (P0/P1/P2 examples).

### 4c: `knowledge/core/user-story-innovation.md`

```yaml
name: user-story-innovation
description: Techniques for discovering UX enhancements and innovation opportunities in user stories
topics: [innovation, ux-enhancements, user-stories, gap-analysis, differentiators]
```

Content outline (~150 lines):

1. **Scope Boundary** — UX-level improvements only, not new features (feature innovation belongs in PRD gap analysis)
2. **High-Value Low-Effort Enhancements** — smart defaults, inline validation, keyboard shortcuts, progressive disclosure, data already collected that could power features
3. **Differentiators** — "wow" moments, AI-native features, things that distinguish this product
4. **Defensive Gaps** — accessibility, mobile responsiveness, performance, common user pain points
5. **Evaluation Framework** — cost/impact matrix, must-have-for-v1 vs. backlog decision criteria

### 4d: Cross-References in Existing KB Entries

- **`knowledge/core/task-decomposition.md`** — update to reference `docs/user-stories.md` as an upstream artifact rather than describing inline story creation. Section 1 ("User Stories to Tasks") becomes about consuming stories, not creating them.
- **`knowledge/core/ux-specification.md`** — add `docs/user-stories.md` as input for user flow documentation. Stories define what users do; UX spec defines what they see.
- **`knowledge/core/domain-modeling.md`** — add stories as a domain discovery input. User actions in acceptance criteria reveal entities, events, and aggregate boundaries.

---

## 5. Methodology Preset Changes

### Deep Domain Modeling

All 3 new steps enabled at depth 5. Pipeline grows from 32 to **35 steps**.

```
Pre-Pipeline: create-prd → prd-gap-analysis → user-stories → review-user-stories → innovate-user-stories
Phase 1-10: unchanged
Validation: unchanged
Finalization: unchanged
```

### MVP

Creation + review added at depth 1. Innovation skipped. Pipeline grows from 4 to **6 steps**:

```
create-prd → user-stories → review-user-stories → phase-07-tasks → phase-08-testing → implementation-playbook
```

`prd-gap-analysis` remains skipped in MVP. Stories at depth 1 are lightweight enough that a gap analysis on the PRD first isn't necessary.

### Custom

- `user-stories` and `review-user-stories` default to **enabled** at the custom preset's `default_depth`
- `innovate-user-stories` defaults to **disabled** (user opts in)
- All three respect per-step depth overrides in config

Config example:
```yaml
custom:
  default_depth: 3
  steps:
    user-stories:
      enabled: true
      depth: 4
    review-user-stories:
      enabled: true
      # inherits default_depth: 3
    innovate-user-stories:
      enabled: true
      depth: 3
```

---

## 6. Downstream Ripple Effects

### Phase 7 (Implementation Tasks)

- **Inputs** adds `docs/user-stories.md (required)` — promoted from implicit to explicit
- **Purpose** updated: tasks are derived from stories, not directly from PRD. Mapping is Story → Task(s), with PRD as the traceability root
- **Quality Criteria** adds: "Every user story maps to at least one task"
- **KB entry** `task-decomposition.md` Section 1 updated to reference stories as upstream artifact

### Phase 1 (Domain Modeling)

- **Dependencies** change from `[create-prd]` to `[review-user-stories]`
- **Inputs** adds `docs/user-stories.md (required)`
- **Purpose** gains: "Use user stories and their acceptance criteria to discover entities, events, and aggregate boundaries"

### Phase 6 (UX Spec)

- **Inputs** adds `docs/user-stories.md (required)` — user journeys from stories drive flow design

### Validation Phase

- **`traceability-matrix`** — chain changes from PRD → Tasks to **PRD → Stories → Tasks**. Every PRD requirement must trace to a story, every story must trace to a task.
- **`critical-path-walkthrough`** — can use story acceptance criteria as the definition of "correct behavior" when walking user journeys end-to-end
- **`scope-creep-check`** — gains a check: stories should not introduce features not in the PRD (innovation does that with user approval)

### PRD Updates

- **Section 5 (Pipeline Definition)** — pre-pipeline table adds 3 new rows
- **Line 236** — remove "User Stories → Phase 7: Implementation Task Breakdown" from the v1 folding table
- **Section 6 (Methodology System)** — MVP default steps updates from 4 to 6
- **Step count** updates from 32 to 35 throughout the document

---

## 7. Implementation Tasks

| # | Task | Files |
|---|------|-------|
| 1 | Create user stories meta-prompt | `pipeline/pre/user-stories.md` |
| 2 | Create review user stories meta-prompt | `pipeline/pre/review-user-stories.md` |
| 3 | Create innovate user stories meta-prompt | `pipeline/pre/innovate-user-stories.md` |
| 4 | Create core user stories KB entry | `knowledge/core/user-stories.md` |
| 5 | Create review user stories KB entry | `knowledge/review/review-user-stories.md` |
| 6 | Create user story innovation KB entry | `knowledge/core/user-story-innovation.md` |
| 7 | Update task-decomposition KB entry | `knowledge/core/task-decomposition.md` |
| 8 | Update ux-specification KB entry | `knowledge/core/ux-specification.md` |
| 9 | Update domain-modeling KB entry | `knowledge/core/domain-modeling.md` |
| 10 | Update Phase 1 meta-prompt (dependencies + inputs) | `pipeline/phase-01-domain-modeling.md` |
| 11 | Update Phase 6 meta-prompt (inputs) | `pipeline/phase-06-ux-spec.md` |
| 12 | Update Phase 7 meta-prompt (inputs + purpose + quality criteria) | `pipeline/phase-07-implementation-tasks.md` |
| 13 | Update traceability-matrix validation | `pipeline/validation/traceability-matrix.md` |
| 14 | Update critical-path-walkthrough validation | `pipeline/validation/critical-path-walkthrough.md` |
| 15 | Update scope-creep-check validation | `pipeline/validation/scope-creep-check.md` |
| 16 | Update v2 PRD (pipeline table, folding table, MVP steps, step counts) | `docs/v2/scaffold-v2-prd.md` |
| 17 | Update methodology preset files | `methodology/deep.yml`, `methodology/mvp.yml`, `methodology/custom.yml` |
