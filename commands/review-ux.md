---
description: "Review UX specification for completeness and usability"
long-description: "Review UX specification targeting UX-specific failure modes: user journey gaps,"
---

## Purpose
Review UX specification targeting UX-specific failure modes: user journey gaps,
accessibility issues, incomplete interaction states, design system inconsistencies,
and missing error states.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/ux-spec.md (required) — spec to review
- docs/plan.md (required) — for journey coverage
- docs/api-contracts.md (optional) — for data shape alignment

## Expected Outputs
- docs/reviews/review-ux.md — findings and resolution log
- docs/ux-spec.md — updated with fixes
- docs/reviews/ux/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/ux/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/ux/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) User journey coverage verified against PRD
- (mvp) Accessibility verified against WCAG level specified in ux-spec
- (deep) Every user action has at minimum: loading, success, and error states documented
- (deep) Design system consistency verified
- (deep) Error states present for all failure-capable actions
- (mvp) Every finding categorized P0-P3 with specific flow, screen, and issue
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to ux-spec.md and re-validated
- (mvp) Downstream readiness confirmed — no unresolved P0 or P1 findings remain before quality phase proceeds
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: Full multi-pass review. Multi-model review dispatched to Codex and
  Gemini if available, with graceful fallback to Claude-only enhanced review.
- **mvp**: Journey coverage only.
- **custom:depth(1-5)**: Depth 1: flow completeness and accessibility pass only. Depth 2: add responsive design and error state passes. Depth 3: add interaction patterns and platform consistency passes. Depth 4: add external model UX review. Depth 5: multi-model review with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/ux/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-ux.md` exists with tracking comment
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

### review-ux-specification

*Failure modes and review passes specific to UI/UX specification artifacts*

# Review: UX Specification

The UX specification translates user journeys from the PRD and component architecture from the system architecture into concrete screens, interactions, and components. It must cover every user-facing feature, handle all interaction states (including errors and edge cases), and align with the design system. This review uses 7 passes targeting the specific ways UX specs fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — User Journey Coverage vs PRD**: Every user-facing PRD feature has a corresponding screen, flow, or interaction; non-happy-path journeys covered.
- **Pass 2 — Accessibility Compliance**: WCAG level stated; keyboard navigation, screen reader support, color contrast, and focus management specified.
- **Pass 3 — Interaction State Completeness**: Every component has all states defined: empty, loading, populated, error, disabled, and edge states.
- **Pass 4 — Design System Consistency**: Colors, spacing, typography reference design system tokens, not one-off values.
- **Pass 5 — Responsive Breakpoint Coverage**: Behavior defined for all breakpoints; navigation, data tables, and forms adapt appropriately.
- **Pass 6 — Error State Handling**: Every user action that can fail has a designed error state with user-friendly messages and clear recovery paths.
- **Pass 7 — Component Hierarchy vs Architecture**: Frontend components in UX spec align with architecture component boundaries and state management approach.

## Deep Guidance

---

## Pass 1: User Journey Coverage vs PRD

### What to Check

Every user-facing feature in the PRD has a corresponding screen, flow, or interaction in the UX spec. No PRD feature is left without a UX design.

### Why This Matters

Features without UX design get implemented with ad hoc interfaces. The implementing agent invents the UI on the fly, producing inconsistent interactions, unclear navigation, and confusing user flows. UX coverage is the bridge between "what the system does" (PRD) and "how the user does it" (implementation).

### How to Check

1. List every user-facing feature from the PRD (user stories, feature descriptions, use cases)
2. For each feature, trace to its UX representation: which screens, which interactions, which flow?
3. Flag features with no UX mapping — these are coverage gaps
4. Check for PRD features that were split across multiple UX flows — is the split logical and complete?
5. Verify that non-happy-path journeys are covered: what happens when the user makes a mistake, changes their mind, or encounters an error?
6. Check that onboarding/first-time-use flows exist for features that require setup or learning

### What a Finding Looks Like

- P0: "PRD feature 'user can manage payment methods' has no corresponding screen in the UX spec. No flow for adding, editing, or removing payment methods exists."
- P1: "PRD describes a 'password reset' flow, but the UX spec only covers the email entry step. The verification code entry, new password, and confirmation steps are missing."
- P2: "PRD mentions 'user preferences' but the UX spec provides only a single settings screen with no detail on what preferences are available or how they are organized."

---

## Pass 2: Accessibility Compliance

### What to Check

The UX spec addresses accessibility at the specification level. WCAG compliance level is stated. Keyboard navigation is designed. Screen reader support is considered. Color contrast meets requirements.

### Why This Matters

Accessibility retrofitted after implementation is 5-10x more expensive than designing it in. When the UX spec does not address accessibility, implementing agents build inaccessible interfaces. Retrofitting means redesigning interaction patterns, adding ARIA attributes to components that were not designed for them, and restructuring HTML semantics.

### How to Check

1. Verify the target WCAG level is stated (A, AA, or AAA)
2. For each interactive component, check: is keyboard navigation specified? (Tab order, keyboard shortcuts, focus management)
3. Check that form elements have associated labels (not just placeholder text)
4. Verify that interactive elements have sufficient touch target size (44x44 CSS pixels minimum)
5. Check color usage: is information conveyed by color alone? (Must also use text, icons, or patterns)
6. Check that screen reader behavior is specified for dynamic content (live regions, state announcements, navigation landmarks)
7. Verify that focus management is specified for modals, dropdowns, and dynamic content changes

### What a Finding Looks Like

- P0: "No WCAG compliance level is stated. Implementing agents do not know what accessibility standard to target."
- P1: "Modal dialogs do not specify focus management. When a modal opens, where does focus go? When it closes, where does focus return? Without this, keyboard users get lost."
- P1: "Status indicators use only color (green/yellow/red) with no text or icon alternative. Users with color blindness cannot distinguish states."
- P2: "Tab order is not specified for the main navigation. Default DOM order may not match the visual layout."

---

## Pass 3: Interaction State Completeness

### What to Check

Every interactive component has all its states defined: empty, loading, populated, error, disabled, hover, focus, active. Every user action has a clear response.

### Why This Matters

Implementing agents default to the "happy path populated" state when other states are not specified. The result is a UI that looks good with data but shows blank screens on empty states, has no loading indicators, and displays raw error messages. State completeness is what separates a polished UI from a prototype.

### How to Check

For each interactive component or data display:
1. **Empty state** — What does it look like when there is no data? (Empty list, no results, new user with no history)
2. **Loading state** — What does the user see while data is being fetched? (Skeleton, spinner, progressive loading)
3. **Populated state** — The normal view with data (usually designed)
4. **Error state** — What does the user see when a request fails? (Error message, retry button, fallback content)
5. **Partial state** — What if some data loaded but part failed? (Component-level errors vs. page-level errors)
6. **Disabled state** — When is the component not interactive, and what does it look like?
7. **Edge states** — Very long text (truncation?), very large numbers (formatting?), very long lists (virtualization?)

### What a Finding Looks Like

- P0: "The dashboard shows charts and metrics but has no empty state design. A new user with no data will see empty chart containers with no guidance."
- P1: "The order list component has no loading state. When orders are being fetched, the user sees either nothing or a flash of the empty state before data appears."
- P1: "Form submission has a success state (redirect to confirmation) but no error state. What does the user see when the submission fails?"
- P2: "No specification for how very long product names are handled in the product card. Truncation? Wrapping? Tooltip?"

---

## Pass 4: Design System Consistency

### What to Check

The UX spec uses design system tokens consistently. Colors, spacing, typography, and component styles reference the design system rather than using one-off values.

### Why This Matters

One-off values create visual inconsistency and maintenance burden. If one button uses `#3B82F6` and another uses `--color-primary`, they will diverge when the design system is updated. Consistent token usage means the design system is the single source of truth for visual properties.

### How to Check

1. Verify that a design system is referenced or defined (color tokens, spacing scale, typography scale, component library)
2. Check that color values in the UX spec reference design system tokens, not hex values or named colors
3. Check that spacing values reference the spacing scale, not arbitrary pixel values
4. Check that typography (font sizes, weights, line heights) uses the type scale
5. Verify that component specifications reference design system components, not custom one-off designs
6. Look for visual elements that have no design system mapping — these are either gaps in the design system or violations

### What a Finding Looks Like

- P1: "The notification banner uses background color '#FEF3C7' which is not in the design system color tokens. Should use the warning surface token."
- P1: "Button in the settings page has 14px padding. The design system spacing scale uses 12px and 16px. This creates visual inconsistency."
- P2: "The modal component has a custom shadow that differs from the design system elevation tokens."

---

## Pass 5: Responsive Breakpoint Coverage

### What to Check

Behavior is defined for all responsive breakpoints. Every screen specifies how it adapts to mobile, tablet, and desktop viewports. Navigation changes across breakpoints are documented.

### Why This Matters

Responsive behavior that is not specified gets improvised during implementation. The implementing agent makes layout decisions on the fly, producing inconsistent responsive behavior across screens. Some screens may collapse to single-column while others try to maintain two columns, creating a jarring experience.

### How to Check

1. Verify that responsive breakpoints are defined (e.g., mobile < 768px, tablet 768-1024px, desktop > 1024px)
2. For each screen, check that layout behavior is specified for each breakpoint
3. Check navigation: does it collapse to a hamburger menu on mobile? At what breakpoint?
4. Check data tables: how do they display on mobile? (Horizontal scroll, card layout, column hiding)
5. Check form layouts: do multi-column forms stack on mobile?
6. Check images and media: are they responsive? What aspect ratio at each breakpoint?
7. Check for touch vs. pointer interactions: hover states need touch alternatives on mobile

### What a Finding Looks Like

- P0: "No responsive breakpoints are defined anywhere in the UX spec. Implementing agents have no guidance on how any screen should adapt to mobile."
- P1: "The dashboard screen has a desktop layout with three columns of charts but no mobile specification. Three columns at 375px is unreadable."
- P2: "Data table on the orders screen specifies horizontal scroll on mobile, but no indication of which columns to show vs. hide for quick scanning."

---

## Pass 6: Error State Handling

### What to Check

Every user action that can fail has a designed error state. Error messages are user-friendly. Recovery paths are clear.

### Why This Matters

Error handling is the most-skipped aspect of UX design. When error states are not designed, implementing agents show browser alerts, raw API error messages, or nothing at all. Users encounter errors frequently (network issues, validation failures, permissions), and the quality of error handling directly impacts user trust and task completion.

### How to Check

1. List every user action that involves an API call or data mutation
2. For each action, verify an error state is designed: what does the user see on failure?
3. Check that error messages are user-friendly (not "Error 422" or "CONSTRAINT_VIOLATION")
4. Verify recovery paths: can the user retry? Is there a back button? Is progress lost?
5. Check for network error handling: what happens when the user loses connectivity mid-action?
6. Check for validation error display: inline (next to the field) or summary (top of form)?
7. Verify that error states for destructive actions are especially clear: "delete failed" should not look like "delete succeeded"

### What a Finding Looks Like

- P0: "Payment processing flow has no error state design. If payment fails, what does the user see? Can they retry? Is the order in a partial state?"
- P1: "Form validation errors are not specified as inline or summary. This is a fundamental interaction pattern decision that affects implementation architecture."
- P2: "Network connectivity loss is not addressed. Long-running operations (file upload, report generation) need offline/reconnection handling."

---

## Pass 7: Component Hierarchy vs Architecture

### What to Check

Frontend components in the UX spec align with the frontend architecture from the system architecture document. Component boundaries match. State management aligns with the architectural approach.

### Why This Matters

When the UX spec designs components that do not match the architecture's component structure, implementing agents must reconcile two conflicting visions. Either they follow the UX spec (violating the architecture) or the architecture (deviating from the UX spec). Alignment prevents this conflict.

### How to Check

1. List frontend components from the system architecture document
2. List UI components from the UX spec
3. Verify alignment: do the UX spec's components map to the architecture's component boundaries?
4. Check that data flow assumptions in the UX spec match the architecture's state management approach
5. Verify that reusable components in the UX spec align with the architecture's component library structure
6. Check that page-level components in the UX spec correspond to routes or views in the architecture
7. Verify that the UX spec's component composition (which components contain which) matches the architecture's component tree

### What a Finding Looks Like

- P1: "The UX spec designs an 'OrderSummaryWidget' that combines order details, customer info, and payment status. The architecture separates these into three independent components (OrderComponent, CustomerComponent, PaymentComponent) with separate data sources."
- P1: "The UX spec assumes global state for user preferences (accessible from any component), but the architecture specifies component-local state with prop drilling."
- P2: "The UX spec's 'ProductCard' component bundles product image, price, and add-to-cart button. The architecture models 'ProductDisplay' and 'CartAction' as separate concerns."

### Example Review Finding

```markdown
### Finding: Dashboard has no empty state or loading state design

**Pass:** 3 — Interaction State Completeness
**Priority:** P0
**Location:** UX Spec Section 4.1 "User Dashboard"

**Issue:** The dashboard screen shows charts (order volume, revenue trend) and
summary metrics (total orders, account balance, recent activity). The spec provides
only the populated state — what the screen looks like with data.

Missing states:
- **Empty state:** A new user with zero orders sees empty chart containers with
  no axes, no labels, and no guidance. The metrics show "$0" and "0 orders" with
  no context.
- **Loading state:** When dashboard data is being fetched (3 separate API calls
  per the API contract), what does the user see? No skeleton, spinner, or
  progressive loading is specified.
- **Partial error state:** If the revenue chart API fails but the orders API
  succeeds, does the entire dashboard show an error, or just the revenue widget?

**Impact:** Implementing agents will either show blank containers (confusing for
new users), a full-page spinner (poor perceived performance), or nothing at all
while loading. The first-time user experience — which is critical for activation
metrics in the PRD — is completely undesigned.

**Recommendation:** Design three additional states:
1. Empty state with onboarding CTA ("Create your first order to see analytics here")
2. Skeleton loading state with placeholder shapes matching the populated layout
3. Per-widget error state with retry button, so partial failures are isolated

**Trace:** UX Spec 4.1 → PRD Success Metric "70% user activation within 7 days"
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

Continue with: `/scaffold:platform-parity-review`
