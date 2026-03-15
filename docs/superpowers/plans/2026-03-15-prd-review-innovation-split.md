# PRD Review & Innovation Split Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `prd-gap-analysis` into `review-prd` + `innovate-prd` to bring PRD phases to parity with the User Stories review/innovation pattern.

**Architecture:** Create 4 new markdown files (2 pipeline meta-prompts, 2 KB entries), delete 1 file, edit ~30 existing files. All changes are markdown content — no code, no tests.

**Tech Stack:** Markdown, YAML frontmatter

**Spec:** `docs/superpowers/specs/2026-03-15-prd-review-innovation-split-design.md`

---

## Chunk 1: New Files

### Task 1: Create `pipeline/pre/review-prd.md` meta-prompt

**Files:**
- Create: `pipeline/pre/review-prd.md`
- Reference: `pipeline/pre/review-user-stories.md` (pattern to follow)

- [ ] **Step 1: Create the meta-prompt file**

Follow the exact structure of `pipeline/pre/review-user-stories.md`. The frontmatter and sections are specified in the design spec section "1. `pipeline/pre/review-prd.md`".

```markdown
---
name: review-prd
description: Multi-pass review of the PRD for completeness, clarity, and downstream readiness
phase: "pre"
dependencies: [create-prd]
outputs: [docs/reviews/pre-review-prd.md]
conditional: null
knowledge-base: [review-methodology, review-prd, prd-craft, gap-analysis]
---

## Purpose
Deep multi-pass review of the PRD, targeting the specific failure modes of
product requirements artifacts. Identify issues, create a fix plan, execute
fixes, and re-validate. Ensures the PRD is complete, clear, consistent, and
ready for User Stories to consume.

## Inputs
- docs/prd.md (required) — PRD to review
- Project idea or brief (context from user, if available)

## Expected Outputs
- docs/reviews/pre-review-prd.md — review findings, fix plan, and resolution log
- docs/prd.md — updated with fixes

## Quality Criteria
- All review passes executed with findings documented
- Every finding categorized by severity (P0-P3)
- Fix plan created for P0 and P1 findings
- Fixes applied and re-validated
- Downstream readiness confirmed (User Stories can proceed)

## Methodology Scaling
- **deep**: All 8 review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated.
- **mvp**: Passes 1-2 only (Problem Statement Rigor, Persona Coverage). Focus
  on blocking gaps — requirements too vague to write stories from.
- **custom:depth(1-5)**: Depth 1-2: passes 1-2 only (Problem Statement Rigor,
  Persona Coverage). Depth 3: passes 1-4 (add Feature Scoping, Success
  Criteria). Depth 4-5: all 8 passes.

## Mode Detection
If docs/reviews/pre-review-prd.md exists, this is a re-review. Read previous
findings, check which were addressed, run review passes again on updated PRD.
```

- [ ] **Step 2: Verify structure matches review-user-stories pattern**

Compare section-by-section against `pipeline/pre/review-user-stories.md`: Purpose, Inputs, Expected Outputs, Quality Criteria, Methodology Scaling, Mode Detection. All 6 sections present, same order.

Note: the `knowledge-base` list intentionally includes `prd-craft` and `gap-analysis` beyond the `review-user-stories` pattern (which only lists `review-methodology` and `review-user-stories`). This is specified in the design spec and is NOT a deviation to correct — PRD review requires domain knowledge about what constitutes a good PRD.

- [ ] **Step 3: Commit**

```bash
git add pipeline/pre/review-prd.md
git commit -m "[BD-xxx] feat(v2): add review-prd pipeline meta-prompt"
```

### Task 2: Create `knowledge/review/review-prd.md` KB entry

**Files:**
- Create: `knowledge/review/review-prd.md`
- Reference: `knowledge/review/review-user-stories.md` (pattern to follow for pass structure)
- Reference: `knowledge/product/prd-craft.md` (source material for pass content)

- [ ] **Step 1: Create the KB file with frontmatter and intro**

```markdown
---
name: review-prd
description: Failure modes and review passes specific to product requirements document artifacts
topics: [review, prd, requirements, completeness, clarity, nfr, constraints]
---

# Review: Product Requirements Document

The PRD is the foundation of the entire pipeline. Every subsequent phase builds on it — user stories, domain models, architecture, implementation tasks. A gap or error here compounds through everything downstream. This review uses 8 passes targeting the specific ways PRD artifacts fail.

Follows the review process defined in `review-methodology.md`.

---
```

- [ ] **Steps 2-9: Add Passes 1-8**

For each of the 8 passes, copy the full content from the design spec section "2. `knowledge/review/review-prd.md`" (spec lines 51-126). Format each pass using the 4-subsection structure from `knowledge/review/review-user-stories.md`:

```markdown
## Pass N: [Pass Name]

### What to Check
[Bullet list of what to examine — from spec]

### Why This Matters
[1-2 paragraphs explaining the downstream impact of this failure mode — expand from spec bullet points using the same style as review-user-stories.md passes]

### How to Check
[Numbered steps for the reviewer to follow — synthesize from spec bullets and prd-craft.md checklist content]

### What a Finding Looks Like
[P-level examples exactly as written in the spec. Include severity levels as specified — some passes have P0/P1/P2, others have P1/P2 only. Do NOT fabricate examples not in the spec.]
```

The 8 passes in order:
1. Problem Statement Rigor (coverage)
2. Persona & Stakeholder Coverage (coverage)
3. Feature Scoping Completeness (consistency)
4. Success Criteria Measurability (consistency)
5. NFR Quantification (structural integrity)
6. Constraint & Dependency Documentation (structural integrity)
7. Error & Edge Case Coverage (structural integrity)
8. Downstream Readiness for User Stories (downstream readiness)

Add `---` separators between passes, matching `review-user-stories.md` formatting.

- [ ] **Step 10: Verify pass count and structure**

Confirm: 8 passes total, each with 4 subsections (What to Check, Why This Matters, How to Check, What a Finding Looks Like), each with severity-graded examples matching the design spec (P0/P1/P2 where the spec provides all three; P1/P2 where the spec omits P0). Compare formatting against `knowledge/review/review-user-stories.md`.

- [ ] **Step 11: Commit**

```bash
git add knowledge/review/review-prd.md
git commit -m "[BD-xxx] feat(v2): add review-prd KB with 8-pass failure-mode structure"
```

### Task 3: Create `pipeline/pre/innovate-prd.md` meta-prompt

**Files:**
- Create: `pipeline/pre/innovate-prd.md`
- Reference: `pipeline/pre/innovate-user-stories.md` (pattern to follow)

- [ ] **Step 1: Create the meta-prompt file**

Follow the exact structure of `pipeline/pre/innovate-user-stories.md`.

```markdown
---
name: innovate-prd
description: Discover feature-level innovation opportunities in the PRD
phase: "pre"
dependencies: [review-prd]
outputs: [docs/prd-innovation.md]
conditional: "if-needed"
knowledge-base: [prd-innovation, prd-craft]
---

## Purpose
Discover feature-level innovation opportunities within the PRD. This covers
new capabilities, competitive positioning, and defensive product gaps. It is
NOT UX-level enhancement (that belongs in user story innovation) — it focuses
on whether the right features are in the PRD at all.

## Inputs
- docs/prd.md (required) — PRD to analyze for innovation opportunities
- docs/reviews/pre-review-prd.md (optional) — review findings for context

## Expected Outputs
- docs/prd-innovation.md — innovation findings, suggestions with cost/impact
  assessment, and disposition (accepted/rejected/deferred)
- docs/prd.md — updated with approved innovations

## Quality Criteria
- Enhancements are feature-level, not UX-level polish
- Each suggestion has a cost estimate (trivial/moderate/significant)
- Each suggestion has a clear user benefit and impact assessment
- Approved innovations are documented to the same standard as existing features
- PRD scope boundaries are respected — no uncontrolled scope creep
- User approval is obtained before modifying the PRD

## Methodology Scaling
- **deep**: Full innovation pass across all categories (competitive research,
  UX gaps, AI-native opportunities, defensive product thinking). Cost/impact
  matrix. Detailed integration of approved innovations into PRD.
- **mvp**: Not applicable — this step is conditional and skipped in MVP.
- **custom:depth(1-5)**: Depth 1-2: not typically enabled. Depth 3: quick scan
  for obvious gaps and missing expected features. Depth 4-5: full innovation
  pass with evaluation framework.

## Mode Detection
If docs/prd-innovation.md exists, this is a re-innovation pass. Read previous
suggestions and their disposition (accepted/rejected/deferred), focus on new
opportunities from PRD changes since last run.
```

- [ ] **Step 2: Verify structure matches innovate-user-stories pattern**

Compare section-by-section against `pipeline/pre/innovate-user-stories.md`: Purpose, Inputs, Expected Outputs, Quality Criteria, Methodology Scaling, Mode Detection. All 6 sections present, same order.

Note: Quality Criteria intentionally adds "impact assessment" beyond the `innovate-user-stories` pattern, per the design spec. This is NOT a deviation to correct.

- [ ] **Step 3: Commit**

```bash
git add pipeline/pre/innovate-prd.md
git commit -m "[BD-xxx] feat(v2): add innovate-prd pipeline meta-prompt"
```

### Task 4: Create `knowledge/product/prd-innovation.md` KB entry

**Files:**
- Create: `knowledge/product/prd-innovation.md`
- Reference: `knowledge/core/user-story-innovation.md` (pattern to follow for structure)
- Reference: Current `prompts.md` lines 308-338 (source innovation content)

- [ ] **Step 1: Create the KB file with frontmatter and scope boundary**

```markdown
---
name: prd-innovation
description: Techniques for discovering feature-level innovation opportunities in product requirements
topics: [innovation, prd, competitive-analysis, product-thinking, features]
---

# PRD Innovation

This knowledge covers feature-level innovation — discovering new capabilities, competitive gaps, and defensive product improvements that belong in the PRD. It operates at the product scope level: should this feature exist at all?

This is distinct from user story innovation (`user-story-innovation.md`), which covers UX-level enhancements to existing features. If an idea doesn't require a new PRD section or feature entry, it belongs in user story innovation, not here.

## Scope Boundary

**In scope:**
- New features users would expect based on competitive norms
- New user flows that address friction points in existing flows
- Competitive positioning — capabilities that differentiate the product
- Defensive product gaps — things users would complain about on day 1
- AI-native capabilities that wouldn't exist without AI

**Out of scope:**
- UX polish on existing features (smart defaults, inline validation, progressive disclosure) — belongs in user story innovation
- Implementation details (technology choices, architecture) — belongs in ADRs
- Non-functional improvements to existing features — belongs in user story innovation
```

- [ ] **Step 2: Add Competitive & Market Analysis section**

```markdown
---

## Competitive & Market Analysis

Research similar products to identify gaps and opportunities. The goal is actionable findings, not an exhaustive market report.

### What to Research

- **Direct competitors** — Products solving the same problem for the same users. What do they do well? What do users complain about?
- **Adjacent products** — Products in the same space that solve related problems. What patterns do they use that users now expect?
- **Emerging patterns** — UX conventions that have become table stakes. Users don't request them, but their absence feels like a gap (e.g., dark mode, keyboard shortcuts, real-time collaboration).

### How to Use Findings

For each competitive insight:
1. Is this a table-stakes feature (users expect it)? → Must-have candidate
2. Is this a differentiator (competitors don't have it, but users would love it)? → Evaluate cost/impact
3. Is this a copied feature (competitors have it, but it doesn't serve our users' specific needs)? → Skip

### Anti-Patterns

- **Feature parity obsession** — Copying every competitor feature dilutes focus. Only adopt features that serve your users' specific problem.
- **Exhaustive matrices** — A 50-row competitor comparison belongs in market research, not the PRD innovation pass. Focus on the 3-5 insights that actually affect product decisions.
```

- [ ] **Step 3: Add User Experience Gaps section**

```markdown

## User Experience Gaps

Look at the core user flows described in the PRD and ask: where would a real user get frustrated?

### First 60 Seconds

The onboarding experience determines whether a user keeps the product:
- Can a new user understand the product's value within 60 seconds?
- Is there a clear first action? Or does the user land on an empty state with no guidance?
- How many steps between signup and the first "aha moment" where the product delivers value?

### Flow Friction Points

For each core user flow:
- How many steps does it take? Can any be eliminated or combined?
- Are there unnecessary confirmation dialogs? (Prefer undo over "are you sure?")
- Does the user need to leave the flow to get information required by the flow?
- What's the "delightful" version of this flow versus the "functional" version?

### Missing Flows

- Are there common user goals that the PRD doesn't address with a dedicated flow?
- Does the user have to work around the product to accomplish something obvious?
```

- [ ] **Step 4: Add Missing Expected Features section**

```markdown

## Missing Expected Features

Features that users would search for and be surprised are absent. These are not innovative — they're expected. Their absence feels like a bug.

### Common Missing Features by Category

**Search & Discovery:**
- Text search across primary content types
- Filtering and sorting on list views
- Recently viewed / recently used items

**Data Management:**
- Bulk import/export (CSV, JSON)
- Undo for destructive actions
- Duplicate/clone for repetitive creation

**Communication:**
- Notification preferences (what, when, how)
- Email digests vs. real-time notifications
- In-app notification center

**Personalization:**
- User preferences / settings
- Saved views or filters
- Customizable dashboard or home screen

### Detection Technique

For each persona in the PRD, walk through their typical week:
1. What would they do daily? Weekly? Monthly?
2. For each action, is there a feature that supports it?
3. For each gap, would the user be surprised it's missing?
```

- [ ] **Step 5: Add AI-Native Opportunities section**

```markdown

## AI-Native Opportunities

Features that would be impractical to build without AI but become natural with it. These are not "AI bolted on" — they are capabilities that fundamentally change the user experience.

### Categories

**Natural language interfaces:**
- Search that understands intent ("show me overdue invoices from last quarter") rather than requiring structured queries
- Data entry through conversation rather than forms for complex inputs
- Commands that understand context ("send the same email I sent to the last batch")

**Auto-categorization and tagging:**
- Content automatically categorized based on content analysis
- Suggested tags that learn from user corrections
- Smart folders or views that organize themselves

**Predictive behavior:**
- Pre-filled forms based on patterns ("you usually set this to X")
- Suggested next actions based on workflow patterns
- Anomaly detection ("this value is unusual — did you mean X?")

**Content generation:**
- Draft generation for repetitive writing (emails, descriptions, reports)
- Summarization of long content (meeting notes, documents, threads)
- Template suggestions based on context

### Evaluation

AI features should pass the "magic vs. gimmick" test:
- **Magic:** User thinks "how did it know?" and saves meaningful time
- **Gimmick:** User thinks "that's cool" once and never uses it again
- Only propose features that pass the magic test
```

- [ ] **Step 6: Add Defensive Product Thinking section**

```markdown

## Defensive Product Thinking

Proactively identify what users would complain about. Fix the most likely complaints before they happen.

### The 1-Star Review Technique

Write the most likely 1-star review for the v1 product. Common templates:
- "I can't believe it doesn't even have [obvious feature]."
- "I tried to [common action] and it just [broke/was confusing/lost my data]."
- "Great concept but unusable on [mobile/slow connection/screen reader]."
- "I wanted to [goal] but had to [painful workaround] because [missing capability]."

For each plausible 1-star review: is the complaint addressed in the PRD? If not, should it be?

### Abandonment Analysis

Identify the most common reasons a user would try the product and stop using it:
1. **Complexity barrier** — Too hard to learn. Is onboarding addressed?
2. **Performance barrier** — Too slow. Are performance NFRs adequate?
3. **Trust barrier** — Doesn't feel reliable. Is error handling comprehensive?
4. **Value barrier** — Doesn't deliver on the promise fast enough. Is time-to-value minimized?
5. **Integration barrier** — Doesn't connect to their existing tools. Are integrations addressed?

### Accessibility & Inclusion

Gaps that alienate entire user segments:
- Keyboard-only navigation for users who can't use a mouse
- Screen reader support for visually impaired users
- Mobile responsiveness for users on phones
- Offline or degraded-mode support for users with unreliable connections
- Internationalization for non-English-speaking users
```

- [ ] **Step 7: Add Evaluation Framework section**

```markdown

## Evaluation Framework

For each innovation suggestion, evaluate before proposing to the user.

### Cost Assessment

- **Trivial** (no new features): A small addition to an existing PRD feature section. No new user flows, no new data entities.
- **Moderate** (1-3 new features): Requires new PRD feature entries, possibly a new user flow. Contained within existing product scope.
- **Significant** (reshapes scope): Requires rethinking product boundaries, adding new personas, or fundamentally changing architecture assumptions.

### Impact Assessment

- **Nice-to-have**: Users wouldn't notice if absent. Polishes the product but doesn't change adoption or satisfaction meaningfully.
- **Noticeable improvement**: Users would appreciate it. Reduces friction in common workflows or addresses a gap competitors have filled.
- **Significant differentiator**: Sets the product apart. Users would choose this product partly because of this capability.

### Decision Framework

| | Trivial Cost | Moderate Cost | Significant Cost |
|---|---|---|---|
| **Differentiator** | Must-have v1 | Must-have v1 | Backlog (worth it but not now) |
| **Noticeable** | Must-have v1 | Backlog | Backlog |
| **Nice-to-have** | Include if free | Backlog | Reject |

### Presenting to the User

Group related suggestions for efficient decision-making. For each group:
1. Describe the enhancement and its user benefit (1-2 sentences)
2. State the cost (trivial/moderate/significant)
3. State your recommendation (must-have v1 / backlog / reject) with reasoning
4. Wait for approval before integrating into the PRD
5. Document approved innovations to the same standard as existing PRD features — full description, priority, business rules. No vague one-liners.
```

- [ ] **Step 8: Verify structure matches user-story-innovation pattern**

Compare section-by-section against `knowledge/core/user-story-innovation.md`: Scope Boundary, content sections, Evaluation Framework. Ensure tone and depth are comparable.

Note: The evaluation framework intentionally uses a decision matrix table format rather than the bullet-list format in `user-story-innovation.md`, per the design spec. This is NOT a deviation to correct.

- [ ] **Step 9: Commit**

```bash
git add knowledge/product/prd-innovation.md
git commit -m "[BD-xxx] feat(v2): add prd-innovation KB for feature-level innovation techniques"
```

---

## Chunk 2: Edit Existing Files

### Task 5: Edit `knowledge/product/gap-analysis.md` — remove innovation content

**Files:**
- Modify: `knowledge/product/gap-analysis.md:263-274` (Innovation Opportunities section)
- Modify: `knowledge/product/gap-analysis.md:288` (Innovation line in Summary template)
- Modify: `knowledge/product/gap-analysis.md:312-316` (Innovation subsection in report template)

- [ ] **Step 1: Remove "Innovation Opportunities" section (lines 263-274)**

Delete these lines entirely:
```
## Innovation Opportunities

Gap analysis also reveals opportunities — places where a modest addition would significantly improve the product.

### How to Identify Innovation Opportunities

1. **Workflow shortcuts** — ...
2. **Data insights** — ...
3. **Proactive features** — ...
4. **Integration points** — ...

Innovation opportunities should be flagged but NOT added to scope. ...
```

- [ ] **Step 2: Remove innovation line from Summary template (line 288)**

In the Gap Report Structure template, remove:
```
- Innovation opportunities: [N]
```

- [ ] **Step 3: Remove Innovation Opportunities subsection from report template (lines 312-316)**

In the Gap Report Structure template, remove:
```
### Innovation Opportunities
1. [Opportunity description]
   - **Effort:** [Low/Medium/High]
   - **Impact:** [Low/Medium/High]
   - **Recommendation:** [Defer/Consider for v1]
```

- [ ] **Step 4: Verify remaining content is intact**

The file should still contain: frontmatter, intro paragraph, Systematic Analysis Approaches, Ambiguity Detection, Edge Case Discovery, NFR Gap Patterns, Contradiction Detection, Output Format (minus innovation references), and When to Use Gap Analysis.

- [ ] **Step 5: Commit**

```bash
git add knowledge/product/gap-analysis.md
git commit -m "[BD-xxx] refactor(v2): remove innovation content from gap-analysis KB (migrated to prd-innovation)"
```

### Task 6: Delete `pipeline/pre/prd-gap-analysis.md`

**Files:**
- Delete: `pipeline/pre/prd-gap-analysis.md`

- [ ] **Step 1: Delete the file**

```bash
git rm pipeline/pre/prd-gap-analysis.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "[BD-xxx] refactor(v2): remove prd-gap-analysis meta-prompt (replaced by review-prd + innovate-prd)"
```

### Task 7: Update methodology presets

**Files:**
- Modify: `methodology/deep.yml:8`
- Modify: `methodology/mvp.yml:8`
- Modify: `methodology/custom-defaults.yml:9`

- [ ] **Step 1: Update `methodology/deep.yml`**

Replace line 8:
```yaml
  prd-gap-analysis: { enabled: true }
```
With:
```yaml
  review-prd: { enabled: true }
  innovate-prd: { enabled: true }
```

- [ ] **Step 2: Update `methodology/mvp.yml`**

Replace line 8:
```yaml
  prd-gap-analysis: { enabled: false }
```
With:
```yaml
  review-prd: { enabled: true }
  innovate-prd: { enabled: false }
```

- [ ] **Step 3: Update `methodology/custom-defaults.yml`**

Replace line 9:
```yaml
  prd-gap-analysis: { enabled: true }
```
With:
```yaml
  review-prd: { enabled: true }
  innovate-prd: { enabled: false }
```

- [ ] **Step 4: Verify step ordering in all three presets**

Read lines 7-11 of each file and confirm the order is: `create-prd`, `review-prd`, `innovate-prd`, `user-stories`.

Note: `custom-defaults.yml` has `innovate-prd: { enabled: false }` even though the meta-prompt's methodology scaling says depth 3 gets a "quick scan." This is NOT a conflict — the preset controls the default; the methodology scaling describes what happens IF a user explicitly enables the step. This matches the `innovate-user-stories` pattern (also disabled in custom-defaults, but methodology scaling describes depth 3 behavior).

- [ ] **Step 5: Commit**

```bash
git add methodology/deep.yml methodology/mvp.yml methodology/custom-defaults.yml
git commit -m "[BD-xxx] feat(v2): update methodology presets for review-prd + innovate-prd split"
```

### Task 8: Update downstream meta-prompt references

**Files:**
- Modify: `pipeline/pre/user-stories.md:5` (dependencies frontmatter)
- Modify: `pipeline/pre/user-stories.md:19` (inputs section)
- Modify: `pipeline/phase-01-domain-modeling.md:20` (inputs section)

- [ ] **Step 1: Update `pipeline/pre/user-stories.md` dependencies**

In frontmatter, change:
```yaml
dependencies: [create-prd]
```
To:
```yaml
dependencies: [review-prd]
```

- [ ] **Step 2: Update `pipeline/pre/user-stories.md` inputs**

In the Inputs section, replace the single line:
```
- docs/prd-gap-analysis.md (optional) — refined requirements with gaps addressed
```
With two lines (one input becomes two):
```
- docs/reviews/pre-review-prd.md (optional) — review findings for context
- docs/prd-innovation.md (optional) — innovation findings and approved enhancements
```

- [ ] **Step 3: Update `pipeline/phase-01-domain-modeling.md` inputs**

In the Inputs section (line 20), replace the single line:
```
- docs/prd-gap-analysis.md (optional) — refined requirements
```
With two lines (one input becomes two):
```
- docs/reviews/pre-review-prd.md (optional) — review findings for context
- docs/prd-innovation.md (optional) — innovation findings and approved enhancements
```

Do NOT change the dependencies field — it stays as `[innovate-user-stories]`.

- [ ] **Step 4: Commit**

```bash
git add pipeline/pre/user-stories.md pipeline/phase-01-domain-modeling.md
git commit -m "[BD-xxx] refactor(v2): update downstream meta-prompts for review-prd + innovate-prd"
```

### Task 9: Update cross-references in pipeline/knowledge files

**Files:**
- Modify: `knowledge/core/user-story-innovation.md:9`
- Modify: `pipeline/pre/innovate-user-stories.md:13-14`

- [ ] **Step 1: Update `knowledge/core/user-story-innovation.md`**

Line 9 is a long line. Find and replace this substring within it:
```
Feature-level innovation belongs in PRD gap analysis.
```
With:
```
Feature-level innovation belongs in PRD innovation (`innovate-prd`).
```

- [ ] **Step 2: Update `pipeline/pre/innovate-user-stories.md`**

Lines 13-14, replace:
```
user stories. This is NOT feature-level innovation (that belongs in PRD gap
analysis) — it focuses on making existing features better through smart defaults,
```
With:
```
user stories. This is NOT feature-level innovation (that belongs in PRD
innovation — `innovate-prd`) — it focuses on making existing features better
through smart defaults,
```

- [ ] **Step 3: Commit**

```bash
git add knowledge/core/user-story-innovation.md pipeline/pre/innovate-user-stories.md
git commit -m "[BD-xxx] refactor(v2): update cross-references from prd-gap-analysis to innovate-prd"
```

---

## Chunk 3: Update docs/v2 References

### Task 10: Bulk-update `prd-gap-analysis` references in docs/v2

**Files to update (17):**
- Modify: `docs/v2/data/manifest-yml-schema.md`
- Modify: `docs/v2/scaffold-v2-prd.md`
- Modify: `docs/v2/implementation/task-breakdown.md`
- Modify: `docs/v2/architecture/system-architecture.md`
- Modify: `docs/v2/data/state-json-schema.md`
- Modify: `docs/v2/api/cli-contract.md`
- Modify: `docs/v2/ux/cli-output-formats.md`
- Modify: `docs/v2/data/config-yml-schema.md`
- Modify: `docs/v2/domain-models/09-cli-architecture.md`
- Modify: `docs/v2/domain-models/03-pipeline-state-machine.md`
- Modify: `docs/v2/domain-models/02-dependency-resolution.md`
- Modify: `docs/v2/domain-models/16-methodology-depth-resolution.md`
- Modify: `docs/v2/domain-models/15-assembly-engine.md`
- Modify: `docs/v2/reference/scaffold-v2-spec.md`
- Modify: `docs/v2/domain-models/07-brownfield-adopt.md`
- Modify: `docs/v2/domain-models/14-init-wizard.md`
- Modify: `docs/v2/reference/scaffold-overview.md`

**Files to SKIP (5 — historical records):**
- Skip: `docs/v2/reference/prd-v1.md` — describes v1 as-built (reverse-engineered from v1.18.0). References to `prd-gap-analysis` correctly describe the v1 command `/scaffold:prd-gap-analysis`. Do NOT update.
- Skip: `docs/v2/archive/domain-models/01-prompt-resolution.md` — archived domain model, point-in-time historical record
- Skip: `docs/v2/archive/superpowers-specs/2026-03-14-meta-prompt-architecture-design.md` — archived spec, point-in-time historical record
- Skip: `docs/v2/archive/superpowers-plans/2026-03-14-meta-prompt-architecture.md` — archived plan, point-in-time historical record
- Skip: `docs/v2/archive/superpowers-specs/2026-03-12-scaffold-v2-modular-cross-platform-design.md` — archived spec, point-in-time historical record

- [ ] **Step 1: Read each file's `prd-gap-analysis` references in context**

For each of the 17 files to update, read the lines containing `prd-gap-analysis` to understand the context. Most will be one of these patterns:
- Step name in a list/table → replace with `review-prd` + `innovate-prd`
- Dependency reference → replace with `review-prd`
- Output file reference (`docs/prd-gap-analysis.md`) → replace with `docs/reviews/pre-review-prd.md` and/or `docs/prd-innovation.md`
- Prose description → update to describe the split

For each occurrence, determine which replacement is correct based on context:
- If the reference is about **reviewing/analyzing the PRD for quality** → `review-prd`
- If the reference is about **innovation/competitive analysis/new features** → `innovate-prd`
- If the reference is about **both or the step in general** → mention both `review-prd` and `innovate-prd`
- If the reference is the output filename `docs/prd-gap-analysis.md` → use `docs/reviews/pre-review-prd.md` (review output) or `docs/prd-innovation.md` (innovation output) as appropriate

**Special handling for high-complexity files:**

**Structured data (JSON/YAML examples)** in files like `state-json-schema.md`, `config-yml-schema.md`, `manifest-yml-schema.md`:
- Where `prd-gap-analysis` appears as a single entry in JSON/YAML, replace with TWO entries: one for `review-prd` and one for `innovate-prd`. Include correct dependency and status fields. `review-prd` depends on `[create-prd]`; `innovate-prd` depends on `[review-prd]` and has `conditional: "if-needed"`.

**Dependency graphs and topological sort examples** in `02-dependency-resolution.md`:
- The parallel sets and level assignments change because one step becomes two sequential steps. `review-prd` replaces `prd-gap-analysis` at its level; `innovate-prd` goes to the next level (depends on `review-prd`). Update sorted orders, parallel sets, and level tables accordingly.

**CLI output format examples** in `ux/cli-output-formats.md`:
- One step becomes two in formatted CLI displays. Update alignment, status indicators, and blocked-by references to reflect both `review-prd` and `innovate-prd`.

**Illustrative prose examples** in `03-pipeline-state-machine.md` and others:
- Where `prd-gap-analysis` is used as an example of specific behavior (e.g., "modifies existing files rather than creating them"), verify the example still holds for the replacement step. `review-prd` produces a new file (`docs/reviews/pre-review-prd.md`) AND modifies an existing file (`docs/prd.md`). If the original example's point was about modifying-only behavior, pick `review-prd` with a note that it also creates its report, or choose a different illustrative step.

- [ ] **Step 2: Apply updates to each file**

Work through each of the 17 files, making context-appropriate replacements. Do NOT blindly find-and-replace — each occurrence needs contextual judgment per the rules above.

- [ ] **Step 3: Verify updates**

Negative check — confirm old references are gone from updated files:
```bash
grep -rl 'prd-gap-analysis' docs/v2/ --include='*.md'
```
Expected: only the 5 skipped files (archive + prd-v1.md) should appear.

Positive check — confirm new references exist:
```bash
grep -rl 'review-prd\|innovate-prd' docs/v2/ --include='*.md'
```
Spot-check that the 17 updated files appear in the results.

- [ ] **Step 4: Commit**

```bash
git add docs/v2/
git commit -m "[BD-xxx] docs(v2): update prd-gap-analysis references to review-prd + innovate-prd"
```
