# User Stories Phase Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add User Stories as a first-class pipeline phase (creation + review + innovation) in the pre-pipeline section, with knowledge base entries and downstream updates.

**Architecture:** Three new meta-prompt files in `pipeline/pre/`, three new KB files in `knowledge/`, updates to 3 existing KB entries, 3 downstream phase meta-prompts, 3 validation meta-prompts, the v2 PRD, 3 methodology presets, and 2 data schemas. All files are markdown or YAML — no code changes.

**Tech Stack:** Markdown, YAML frontmatter, knowledge base conventions per ADR-042

**Spec:** `docs/superpowers/specs/2026-03-15-user-stories-phase-design.md`

---

## Chunk 1: New Meta-Prompt Files

### Task 1: Create user stories creation meta-prompt

**Files:**
- Create: `pipeline/pre/user-stories.md`
- Reference: `pipeline/pre/prd-gap-analysis.md` (template)
- Reference: `docs/superpowers/specs/2026-03-15-user-stories-phase-design.md` (spec Section 2, Section 3)

- [ ] **Step 1: Create `pipeline/pre/user-stories.md`**

```markdown
---
name: user-stories
description: Translate PRD features into user stories with acceptance criteria
phase: "pre"
dependencies: [create-prd]
outputs: [docs/user-stories.md]
conditional: null
knowledge-base: [user-stories]
---

## Purpose
Translate PRD features and requirements into user stories that define user-facing
behavior. Each story captures who wants what and why, with acceptance criteria
that are testable and specific enough to drive domain modeling, UX design, and
task decomposition downstream.

## Inputs
- docs/prd.md (required) — features, personas, and requirements to translate
- docs/prd-gap-analysis.md (optional) — refined requirements with gaps addressed

## Expected Outputs
- docs/user-stories.md — user stories organized by epic, each with acceptance
  criteria scaled to the configured depth level

## Quality Criteria
- Every PRD feature maps to at least one user story
- Stories follow INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- Acceptance criteria are testable — unambiguous pass/fail
- No story too large to implement in 1-3 focused agent sessions
- Every PRD persona is represented in at least one story
- Stories describe user behavior, not implementation details

## Methodology Scaling
- **deep**: Full story template with IDs, persona journey maps, cross-story
  dependency graphs, Given/When/Then acceptance criteria with parameterized
  examples, story-to-domain-event mapping for Phase 1 consumption.
- **mvp**: Flat list of one-liner stories grouped by PRD section. One bullet
  per story for the primary success condition. No epics, no scope boundaries.
- **custom:depth(1-5)**: Depth 1-2: flat list with brief acceptance criteria.
  Depth 3: full template with IDs, epics, Given/When/Then. Depth 4-5: add
  dependency mapping, traceability, UI/UX notes, story splitting rationale.

## Mode Detection
If docs/user-stories.md exists, operate in update mode: read existing stories,
identify changes needed based on updated PRD, categorize as ADD/RESTRUCTURE/
PRESERVE, get approval before modifying. Preserve existing story IDs.
```

- [ ] **Step 2: Verify frontmatter is valid**

Run: `head -10 pipeline/pre/user-stories.md`
Expected: YAML frontmatter with all required fields (name, description, phase, dependencies, outputs, conditional, knowledge-base)

- [ ] **Step 3: Commit**

```bash
git add pipeline/pre/user-stories.md
git commit -m "feat(v2): add user stories creation meta-prompt"
```

---

### Task 2: Create review user stories meta-prompt

**Files:**
- Create: `pipeline/pre/review-user-stories.md`
- Reference: `pipeline/phase-01a-review-domain-modeling.md` (review template)
- Reference: spec Section 2, Section 3 (Review Depth)

- [ ] **Step 1: Create `pipeline/pre/review-user-stories.md`**

```markdown
---
name: review-user-stories
description: Multi-pass review of user stories for PRD coverage, quality, and downstream readiness
phase: "pre"
dependencies: [user-stories]
outputs: [docs/reviews/pre-review-user-stories.md]
conditional: null
knowledge-base: [review-methodology, review-user-stories]
---

## Purpose
Deep multi-pass review of user stories, targeting failure modes specific to
story artifacts. Identify coverage gaps, quality issues, and downstream
readiness problems. Create a fix plan, execute fixes, and re-validate.

## Inputs
- docs/user-stories.md (required) — stories to review
- docs/prd.md (required) — source requirements for coverage checking

## Expected Outputs
- docs/reviews/pre-review-user-stories.md — review findings, fix plan, and resolution log
- docs/user-stories.md — updated with fixes

## Quality Criteria
- All review passes executed with findings documented
- Every finding categorized by severity (P0-P3)
- Fix plan created for P0 and P1 findings
- Fixes applied and re-validated
- Downstream readiness confirmed (Phase 1 can proceed)

## Methodology Scaling
- **deep**: All 6 review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated.
- **mvp**: Pass 1 only (PRD coverage). Focus on blocking gaps — PRD features
  with no corresponding story.
- **custom:depth(1-5)**: Depth 1: pass 1 only. Depth 2: passes 1-2.
  Depth 3: passes 1-4. Depth 4-5: all 6 passes.

## Mode Detection
If docs/reviews/pre-review-user-stories.md exists, this is a re-review. Read
previous findings, check which were addressed, run review passes again on
updated stories.
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/pre/review-user-stories.md
git commit -m "feat(v2): add review user stories meta-prompt"
```

---

### Task 3: Create innovate user stories meta-prompt

**Files:**
- Create: `pipeline/pre/innovate-user-stories.md`
- Reference: spec Section 2

- [ ] **Step 1: Create `pipeline/pre/innovate-user-stories.md`**

```markdown
---
name: innovate-user-stories
description: Discover UX-level enhancements and innovation opportunities in user stories
phase: "pre"
dependencies: [review-user-stories]
outputs: [docs/user-stories-innovation.md]
conditional: "if-needed"
knowledge-base: [user-stories, user-story-innovation]
---

## Purpose
Discover UX-level enhancements and innovation opportunities within the existing
user stories. This is NOT feature-level innovation (that belongs in PRD gap
analysis) — it focuses on making existing features better through smart defaults,
progressive disclosure, accessibility improvements, and AI-native capabilities.

## Inputs
- docs/user-stories.md (required) — stories to enhance
- docs/prd.md (required) — PRD boundaries (innovation must not exceed scope)

## Expected Outputs
- docs/user-stories-innovation.md — innovation findings, suggestions with
  cost/impact assessment, and disposition (accepted/rejected/deferred)
- docs/user-stories.md — updated with approved enhancements

## Quality Criteria
- Enhancements are UX-level, not new features
- Each suggestion has a cost estimate (trivial/moderate/significant)
- Each suggestion has a clear user benefit
- Approved enhancements are integrated into existing stories (not new stories)
- PRD scope boundaries are respected — no scope creep

## Methodology Scaling
- **deep**: Full innovation pass across all three categories (high-value
  low-effort, differentiators, defensive gaps). Cost/impact matrix.
  Detailed integration of approved enhancements into stories.
- **mvp**: Not applicable — this step is conditional and skipped in MVP.
- **custom:depth(1-5)**: Depth 1-2: not typically enabled. Depth 3: quick
  scan for obvious improvements. Depth 4-5: full innovation pass with
  evaluation framework.

## Mode Detection
If docs/user-stories-innovation.md exists, this is a re-innovation pass. Read
previous suggestions and their disposition (accepted/rejected), focus on new
opportunities from story changes since last run.
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/pre/innovate-user-stories.md
git commit -m "feat(v2): add innovate user stories meta-prompt"
```

---

## Chunk 2: New Knowledge Base Entries

### Task 4: Create core user stories KB entry

**Files:**
- Create: `knowledge/core/user-stories.md`
- Reference: `knowledge/core/domain-modeling.md` (format template)
- Reference: spec Section 4a

- [ ] **Step 1: Create `knowledge/core/user-stories.md`**

Write a ~300-line KB entry following the established core KB format. Use the spec Section 4a outline as the content structure. Include:

```yaml
---
name: user-stories
description: Expert knowledge for translating product requirements into well-formed user stories
topics:
  - user-stories
  - personas
  - acceptance-criteria
  - story-splitting
  - INVEST
  - epics
  - traceability
---
```

Content sections (follow patterns from `knowledge/core/domain-modeling.md`):

1. **Story Anatomy** — "As a / I want / So that" template with good/bad examples. When to deviate (e.g., system stories). Common malformations (implementation-focused stories, missing value statement).

2. **INVEST Criteria** — Define each letter with concrete pass/fail examples:
   - Independent: story can be developed without requiring another story to be done first
   - Negotiable: details can be discussed, story isn't a contract
   - Valuable: delivers value to a user or stakeholder (not "as a developer...")
   - Estimable: team can estimate effort
   - Small: implementable in 1-3 agent sessions
   - Testable: acceptance criteria have clear pass/fail

3. **Persona Definition** — Extracting personas from PRD. Goal-driven personas vs. role labels. When personas collapse (admin who is also a user). Persona template: name, role, goals, pain points, context.

4. **Epic Structure** — Group by user journey, not system component. Epic sizing (3-8 stories typical). When to split epics. Epic naming conventions.

5. **Acceptance Criteria Patterns** — Given/When/Then format with examples. Parameterized scenarios (Given user with role [admin|member]...). Negative scenarios (Given invalid input...). Boundary conditions. Difference between acceptance criteria and test cases (AC = what, test = how).

6. **Story Splitting Heuristics** — Splitting patterns with before/after examples:
   - By workflow step (registration → email verification → profile setup)
   - By data variation (text post vs. image post vs. video post)
   - By operation (create, read, update, delete)
   - By platform (web vs. mobile)
   - By user role (admin vs. member)
   - By happy/sad path (success vs. error handling)

7. **Scope Boundaries** — What each story explicitly does NOT include. Preventing scope creep. Relationship to MoSCoW "Won't" category. How scope boundaries become task boundaries downstream.

8. **PRD-to-Story Traceability** — Every PRD feature maps to at least one story. Splitting compound requirements. Surfacing implicit requirements (error handling, accessibility, loading states). Traceability notation (PRD-REQ-001 → US-001).

9. **Story Dependencies** — When stories must be implemented in order. Blocked-by vs. informed-by. How story dependencies feed into task decomposition. Keeping dependency chains short.

10. **Common Pitfalls** — With "Problem → Fix" format:
    - Implementation stories ("As a developer, I want a REST endpoint...")
    - Stories too large (split using heuristics from section 6)
    - Vague acceptance criteria ("works correctly" → Given/When/Then)
    - Missing personas (map back to PRD)
    - Stories without value statements
    - Duplicate stories across epics
    - Confusing acceptance criteria with implementation steps

- [ ] **Step 2: Verify frontmatter validates**

Check: name matches filename stem (`user-stories`), description ≤ 200 chars, topics has ≥ 1 item.

- [ ] **Step 3: Commit**

```bash
git add knowledge/core/user-stories.md
git commit -m "feat(v2): add core user stories knowledge base entry"
```

---

### Task 5: Create review user stories KB entry

**Files:**
- Create: `knowledge/review/review-user-stories.md`
- Reference: `knowledge/review/review-implementation-tasks.md` (format template)
- Reference: `knowledge/review/review-methodology.md` (shared process)
- Reference: spec Section 4b

- [ ] **Step 1: Create `knowledge/review/review-user-stories.md`**

Write a ~200-line KB entry following the established review KB format. Each pass uses the "What to Check → Why This Matters → How to Check → What a Finding Looks Like" structure.

```yaml
---
name: review-user-stories
description: Failure modes and review passes specific to user story artifacts
topics:
  - review
  - user-stories
  - coverage
  - acceptance-criteria
  - INVEST
  - testability
---
```

Six review passes:

**Pass 1: PRD Coverage**
- What: Every PRD feature/flow has at least one corresponding story
- Why: Missing stories mean missing implementation tasks downstream
- How: Extract PRD features list, cross-reference against stories, flag orphans
- Findings: P0 "PRD feature X has no corresponding user story", P1 "PRD flow Y is partially covered — missing error path story"

**Pass 2: Acceptance Criteria Quality**
- What: Every story has testable, unambiguous acceptance criteria
- Why: Vague criteria produce vague tasks and untestable implementations
- How: Check each story's AC for Given/When/Then format (at depth ≥3), specificity, measurability
- Findings: P0 "Story US-005 has no acceptance criteria", P1 "US-012 acceptance criteria says 'works correctly' — not testable"

**Pass 3: Story Independence**
- What: Stories can be implemented independently without hidden coupling
- Why: Coupled stories create false parallelization and blocked agents
- How: Check for shared state assumptions, implicit ordering, circular references
- Findings: P1 "US-008 and US-009 both modify the same user profile state — unclear ordering", P2 "US-015 implicitly assumes US-014 is complete"

**Pass 4: Persona Coverage**
- What: Every PRD persona has stories, every story maps to a valid persona
- Why: Missing persona coverage means missing user journeys
- How: List PRD personas, check each has stories. Check no story references an undefined persona.
- Findings: P1 "Persona 'Admin' defined in PRD has zero stories", P2 "US-020 references 'power user' — not a defined persona"

**Pass 5: Sizing & Splittability**
- What: No story is too large or too small for agent implementation
- Why: Oversized stories produce oversized tasks; undersized stories add overhead
- How: Check acceptance criteria count (proxy for complexity), scope breadth, data variation
- Findings: P1 "US-003 has 12 acceptance criteria spanning 3 workflows — should be split", P2 "US-022 and US-023 are trivially small — consider combining"

**Pass 6: Downstream Readiness**
- What: Phase 1 (domain modeling) can consume these stories productively
- Why: Stories are the primary input to domain discovery — if entities/events aren't discoverable from acceptance criteria, domain modeling will struggle
- How: Sample 3-5 stories, attempt to identify entities, events, and aggregate boundaries from their acceptance criteria alone
- Findings: P1 "US-007 acceptance criteria don't mention any domain objects — domain modeling will have to guess", P2 "Cross-story entity naming is inconsistent (User vs. Account vs. Member)"

- [ ] **Step 2: Verify frontmatter validates**

- [ ] **Step 3: Commit**

```bash
git add knowledge/review/review-user-stories.md
git commit -m "feat(v2): add review user stories knowledge base entry"
```

---

### Task 6: Create user story innovation KB entry

**Files:**
- Create: `knowledge/core/user-story-innovation.md`
- Reference: spec Section 4c

- [ ] **Step 1: Create `knowledge/core/user-story-innovation.md`**

Write a ~150-line KB entry.

```yaml
---
name: user-story-innovation
description: Techniques for discovering UX enhancements and innovation opportunities in user stories
topics:
  - innovation
  - ux-enhancements
  - user-stories
  - gap-analysis
  - differentiators
---
```

Content sections:

1. **Scope Boundary** — UX-level improvements only, not new features. Feature-level innovation belongs in PRD gap analysis. This step makes existing features better, not different. If an enhancement requires a new PRD section, it's out of scope.

2. **High-Value Low-Effort Enhancements** — Patterns to look for:
   - Smart defaults (pre-fill based on context/history)
   - Inline validation (immediate feedback vs. submit-and-fail)
   - Keyboard shortcuts for power users
   - Progressive disclosure (don't overwhelm on first use)
   - Contextual help and onboarding hints
   - Data you're already collecting that could power useful features
   - Undo/redo support where destructive actions exist
   - Batch operations where users repeat single actions

3. **Differentiators** — What makes THIS product stand out:
   - "Wow" moments users would share
   - AI-native features (suggestions, auto-completion, smart search)
   - Features that wouldn't exist in traditionally-built apps
   - Personalization without configuration

4. **Defensive Gaps** — Things users expect but specs often miss:
   - Accessibility (WCAG AA at minimum)
   - Mobile responsiveness (if web)
   - Offline/degraded mode behavior
   - Performance under load (loading states, pagination)
   - Error recovery (don't lose user work)
   - Empty states (first-time experience)

5. **Evaluation Framework** — For each suggestion:
   - Cost: trivial (< 1 task) / moderate (1-3 tasks) / significant (4+ tasks)
   - Impact: nice-to-have / noticeable improvement / significant differentiator
   - Recommendation: must-have for v1 / backlog for later / reject
   - Group related suggestions for efficient decision-making

- [ ] **Step 2: Commit**

```bash
git add knowledge/core/user-story-innovation.md
git commit -m "feat(v2): add user story innovation knowledge base entry"
```

---

## Chunk 3: Update Existing Knowledge Base Entries

### Task 7: Update task-decomposition KB entry

**Files:**
- Modify: `knowledge/core/task-decomposition.md` (Section 1, ~lines 7-114)

- [ ] **Step 1: Read current Section 1 header area**

Read `knowledge/core/task-decomposition.md` lines 1-30 to find the exact text of the "User Stories to Tasks" section opening.

- [ ] **Step 2: Update Section 1 to reference upstream stories**

The section currently describes creating stories inline during task decomposition. Update to reflect that stories are now an upstream artifact at `docs/user-stories.md`. Key changes:

- Add a note at the top of Section 1: "User stories are created in the pre-pipeline phase and available at `docs/user-stories.md`. This section covers how to consume stories and derive tasks from them."
- Change language from "creating stories" to "reading/consuming stories"
- Preserve all the mapping patterns (Feature → Story → Task) — those are still correct
- Keep the INVEST criteria reference (still relevant when reviewing stories during task creation)

- [ ] **Step 3: Commit**

```bash
git add knowledge/core/task-decomposition.md
git commit -m "refactor(v2): update task-decomposition KB to consume upstream stories"
```

---

### Task 8: Update ux-specification KB entry

**Files:**
- Modify: `knowledge/core/ux-specification.md` (Section 1: User Flow Documentation, ~lines 7-70)

- [ ] **Step 1: Read current Section 1**

Read `knowledge/core/ux-specification.md` lines 1-30 to find exact text.

- [ ] **Step 2: Add user stories as input for user flows**

In the User Flow Documentation section, add a reference to `docs/user-stories.md` as the primary source for user journeys. Add a brief note:

"User stories (`docs/user-stories.md`) define what users do — each story's acceptance criteria describe a user journey. UX specification defines what users see and how they interact while performing those journeys. Map each story's Given/When/Then scenarios to screen states and transitions."

- [ ] **Step 3: Commit**

```bash
git add knowledge/core/ux-specification.md
git commit -m "refactor(v2): add user stories as input to UX specification KB"
```

---

### Task 9: Update domain-modeling KB entry

**Files:**
- Modify: `knowledge/core/domain-modeling.md` (Section 3: Domain Discovery Process, ~lines 210-239)

- [ ] **Step 1: Read current Section 3**

Read `knowledge/core/domain-modeling.md` lines 200-245 to find the Domain Discovery Process section.

- [ ] **Step 2: Add user stories as domain discovery input**

In the Domain Discovery Process section, add user stories as a discovery input alongside event storming and requirements analysis. Add:

"User stories (`docs/user-stories.md`) are a primary input for domain discovery. User actions in acceptance criteria reveal entities (nouns), events (state transitions), and aggregate boundaries (transactional consistency requirements). For example, 'Given a teacher assigns homework to a class' reveals Teacher, Homework, and Class entities, an AssignmentCreated event, and a Classroom aggregate."

- [ ] **Step 3: Commit**

```bash
git add knowledge/core/domain-modeling.md
git commit -m "refactor(v2): add user stories as domain discovery input in KB"
```

---

## Chunk 4: Update Downstream Meta-Prompts

### Task 10: Update Phase 1 meta-prompt

**Files:**
- Modify: `pipeline/phase-01-domain-modeling.md:5,17-18`

- [ ] **Step 1: Update dependencies**

Change line 5 from:
```yaml
dependencies: [create-prd]
```
to:
```yaml
dependencies: [innovate-user-stories]
```

- [ ] **Step 2: Add user stories to inputs**

After line 18, add:
```markdown
- docs/user-stories.md (required) — user stories with acceptance criteria for domain discovery
```

- [ ] **Step 3: Update Purpose section**

Add to the Purpose text (after line 14):
"Use user stories and their acceptance criteria to discover entities, events, and aggregate boundaries. User actions reveal the domain model."

- [ ] **Step 4: Commit**

```bash
git add pipeline/phase-01-domain-modeling.md
git commit -m "refactor(v2): Phase 1 depends on user stories, uses them for domain discovery"
```

---

### Task 11: Update Phase 6 meta-prompt

**Files:**
- Modify: `pipeline/phase-06-ux-spec.md:16-19`

- [ ] **Step 1: Add user stories to inputs**

After line 19 (`docs/api-contracts.md` line), add:
```markdown
- docs/user-stories.md (required) — user journeys driving flow design
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/phase-06-ux-spec.md
git commit -m "refactor(v2): Phase 6 takes user stories as input for flow design"
```

---

### Task 12: Update Phase 7 meta-prompt

**Files:**
- Modify: `pipeline/phase-07-implementation-tasks.md:11-15,17-24,30-36`

- [ ] **Step 1: Add user stories as required input**

In the Inputs section (after line 21, `docs/prd.md`), add:
```markdown
- docs/user-stories.md (required) — stories to derive tasks from
```

- [ ] **Step 2: Update Purpose**

Update lines 11-15 to clarify that tasks are derived from stories:
```markdown
## Purpose
Decompose user stories and system architecture into concrete, implementable
tasks suitable for AI agents. Each task should be independently executable,
have clear inputs/outputs, and be small enough for a single agent session.
The primary mapping is Story → Task(s), with PRD as the traceability root.
```

- [ ] **Step 3: Add quality criterion**

After line 36 (`Parallelization opportunities are marked`), add:
```markdown
- Every user story maps to at least one task
```

- [ ] **Step 4: Commit**

```bash
git add pipeline/phase-07-implementation-tasks.md
git commit -m "refactor(v2): Phase 7 derives tasks from user stories"
```

---

## Chunk 5: Update Validation Meta-Prompts

### Task 13: Update traceability-matrix validation

**Files:**
- Modify: `pipeline/validation/traceability-matrix.md:12-14`

- [ ] **Step 1: Update Purpose**

Change the Purpose from:
```markdown
Build traceability from PRD requirements through architecture to implementation
tasks. Verify that every requirement has a path from PRD to domain model to
architecture component to implementation task, with no orphans in either direction.
```
to:
```markdown
Build traceability from PRD requirements through user stories and architecture
to implementation tasks. Verify the full chain: PRD → User Stories → Domain
Model → Architecture → Tasks, with no orphans in either direction. Every PRD
requirement must trace to at least one story, every story to at least one task.
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/validation/traceability-matrix.md
git commit -m "refactor(v2): traceability matrix includes PRD → Stories → Tasks chain"
```

---

### Task 14: Update critical-path-walkthrough validation

**Files:**
- Modify: `pipeline/validation/critical-path-walkthrough.md:12-16`

- [ ] **Step 1: Update Purpose**

Change from:
```markdown
Walk critical user journeys end-to-end across all specs. Trace the most
important user flows from PRD through UX, API contracts, architecture
components, database operations, and implementation tasks to verify
completeness and consistency at every layer.
```
to:
```markdown
Walk critical user journeys end-to-end across all specs. Trace the most
important user flows from PRD through user stories, UX spec, API contracts,
architecture components, database operations, and implementation tasks.
Use story acceptance criteria as the definition of "correct behavior" when
verifying completeness and consistency at every layer.
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/validation/critical-path-walkthrough.md
git commit -m "refactor(v2): critical path walkthrough uses story acceptance criteria"
```

---

### Task 15: Update scope-creep-check validation

**Files:**
- Modify: `pipeline/validation/scope-creep-check.md:12-16`

- [ ] **Step 1: Update Purpose**

Change to:
```markdown
Verify specs stay aligned to PRD boundaries. Check that user stories,
architecture, implementation tasks, and other artifacts have not introduced
features, components, or complexity beyond what the PRD requires. User stories
should not introduce features not in the PRD — UX-level enhancements are
allowed only via the innovation step with explicit user approval. Flag any
scope expansion for explicit approval.
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/validation/scope-creep-check.md
git commit -m "refactor(v2): scope creep check covers user stories"
```

---

## Chunk 6: Update PRD and Configuration

### Task 16: Update v2 PRD

**Files:**
- Modify: `docs/v2/scaffold-v2-prd.md:148,152-155,236,247,261-269`

- [ ] **Step 1: Update pipeline step count**

Change line 148 from:
```markdown
### Complete Pipeline (32 steps)
```
to:
```markdown
### Complete Pipeline (35 steps)
```

- [ ] **Step 2: Add user stories to pre-pipeline table**

After line 155 (`prd-gap-analysis` row), add three new rows:
```markdown
| `user-stories` | Translate PRD features into user stories with acceptance criteria | No |
| `review-user-stories` | Multi-pass review of user stories for PRD coverage, quality, downstream readiness | No |
| `innovate-user-stories` | Discover UX-level enhancements and innovation opportunities | if-needed |
```

- [ ] **Step 3: Remove User Stories from folding table**

Delete line 236:
```markdown
| User Stories | Phase 7: Implementation Task Breakdown | Stories inform and become tasks |
```

- [ ] **Step 4: Update methodology preset table**

Change line 247 from:
```markdown
| **Steps** | All 32 steps active | 4 steps only | User chooses |
```
to:
```markdown
| **Steps** | All 35 steps active | 6 steps only | User chooses |
```

- [ ] **Step 5: Update MVP default steps**

Change lines 261-269 from:
```markdown
### MVP Default Steps

**Enabled** (depth 1):
- `create-prd`
- `phase-07-implementation-tasks`
- `phase-08-testing-strategy`
- `implementation-playbook`

**Skipped**: All other steps (gap analysis, phases 1-6, all reviews, all validation, operations, security, developer onboarding, apply-fixes).
```
to:
```markdown
### MVP Default Steps

**Enabled** (depth 1):
- `create-prd`
- `user-stories`
- `review-user-stories`
- `phase-07-implementation-tasks`
- `phase-08-testing-strategy`
- `implementation-playbook`

**Skipped**: All other steps (gap analysis, innovation, phases 1-6, all phase reviews, all validation, operations, security, developer onboarding, apply-fixes).
```

- [ ] **Step 6: Commit**

```bash
git add docs/v2/scaffold-v2-prd.md
git commit -m "docs(v2): add user stories phase to PRD pipeline definition"
```

---

### Task 17: Update methodology preset files

**Files:**
- Modify: `methodology/deep.yml:8-9`
- Modify: `methodology/mvp.yml:8-9`
- Modify: `methodology/custom-defaults.yml:9-10`

- [ ] **Step 1: Update deep.yml**

After line 8 (`prd-gap-analysis: { enabled: true }`), add:
```yaml
  user-stories: { enabled: true }
  review-user-stories: { enabled: true }
  innovate-user-stories: { enabled: true }
```

- [ ] **Step 2: Update mvp.yml**

After line 8 (`prd-gap-analysis: { enabled: false }`), add:
```yaml
  user-stories: { enabled: true }
  review-user-stories: { enabled: true }
  innovate-user-stories: { enabled: false }
```

- [ ] **Step 3: Update custom-defaults.yml**

After line 9 (`prd-gap-analysis: { enabled: true }`), add:
```yaml
  user-stories: { enabled: true }
  review-user-stories: { enabled: true }
  innovate-user-stories: { enabled: false }
```

- [ ] **Step 4: Commit**

```bash
git add methodology/deep.yml methodology/mvp.yml methodology/custom-defaults.yml
git commit -m "feat(v2): add user stories steps to all methodology presets"
```

---

### Task 18: Update manifest schema

**Files:**
- Modify: `docs/v2/data/manifest-yml-schema.md:106,127-128`

- [ ] **Step 1: Update step count constraint**

Change line 106 from:
```markdown
| `steps` | `Record<string, StepConfig>` | Yes | -- | Map of step names to step configurations. Must include all 32 pipeline steps. |
```
to:
```markdown
| `steps` | `Record<string, StepConfig>` | Yes | -- | Map of step names to step configurations. Must include all 35 pipeline steps. |
```

- [ ] **Step 2: Add user stories to step name table**

After line 128 (`prd-gap-analysis` row), add:
```markdown
| `user-stories` | `pipeline/pre/user-stories.md` |
| `review-user-stories` | `pipeline/pre/review-user-stories.md` |
| `innovate-user-stories` | `pipeline/pre/innovate-user-stories.md` |
```

- [ ] **Step 3: Commit**

```bash
git add docs/v2/data/manifest-yml-schema.md
git commit -m "docs(v2): add user stories steps to manifest schema"
```

---

### Task 19: Verify frontmatter schema compatibility

**Files:**
- Verify: `docs/v2/data/frontmatter-schema.md`

Note: The frontmatter schema uses pattern-based resolution rules (e.g., "each `dependencies` entry must match a meta-prompt `name` in `pipeline/`") rather than exhaustive step name lists. This task is primarily verification that the new files match existing patterns.

- [ ] **Step 1: Read the cross-reference section**

Read `docs/v2/data/frontmatter-schema.md` lines 295-340 to find the cross-schema reference section.

- [ ] **Step 2: Verify new steps match existing patterns**

Confirm that:
- The new meta-prompt names (`user-stories`, `review-user-stories`, `innovate-user-stories`) match the `^[a-z][a-z0-9-]*$` pattern
- The new files in `pipeline/pre/` match the `pipeline/pre/*.md` filesystem pattern already described
- The `dependencies` values used in the new files (`create-prd`, `user-stories`, `review-user-stories`) all resolve to existing meta-prompts
- The `knowledge-base` values (`user-stories`, `review-methodology`, `review-user-stories`, `user-story-innovation`) all resolve to KB files created in Tasks 4-6

If the schema doc has any examples that would benefit from showing a pre-pipeline review step (currently no review steps exist in pre-pipeline), add a brief example. Otherwise, no edits needed.

- [ ] **Step 3: Commit (only if edits were made)**

```bash
git add docs/v2/data/frontmatter-schema.md
git commit -m "docs(v2): verify user stories steps match frontmatter schema patterns"
```
