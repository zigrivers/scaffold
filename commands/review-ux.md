---
description: "UX specification review for completeness and quality"
long-description: "Performs a structured multi-pass review of the UX specification, targeting failure modes specific to UI/UX artifacts. Covers user journey coverage, accessibility compliance, interaction state completeness, design system consistency, responsive breakpoints, error states, and component hierarchy alignment."
---

Perform a structured multi-pass review of the UX specification, targeting failure modes specific to UI/UX specification artifacts. Follow the review methodology from review-methodology knowledge base.

## Mode Detection

Check if `docs/reviews/review-ux.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated UX spec
3. Run all review passes again on the current spec
4. Focus on: remaining unresolved findings, regressions from fixes, and any new screens or flows added since the last review
5. Update the review report rather than replacing it — preserve the fix history

## Review Process

### Step 1: Read the Artifact

Read `docs/ux-spec.md` completely. Also read `docs/prd.md` for journey coverage cross-reference and `docs/api-contracts.md` (if available) for data shape alignment.

### Step 2: Multi-Pass Review

Execute 7 review passes. For each pass, re-read the artifact with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: User Journey Coverage vs PRD**
List every user-facing feature from the PRD. For each, trace to its UX representation: which screens, which interactions, which flow. Flag features with no UX mapping. Check that PRD features split across multiple UX flows are logically complete. Verify non-happy-path journeys are covered: mistakes, mind changes, errors. Check onboarding/first-time-use flows exist for features requiring setup or learning.

**Pass 2: Accessibility Compliance**
Verify target WCAG level is stated (A, AA, or AAA). For each interactive component, check keyboard navigation (tab order, shortcuts, focus management). Verify form elements have labels (not just placeholders). Check touch targets meet 44x44 CSS pixel minimum. Verify information is not conveyed by color alone. Check screen reader behavior for dynamic content (live regions, state announcements, landmarks). Verify focus management for modals, dropdowns, and dynamic content.

**Pass 3: Interaction State Completeness**
For every interactive component or data display, check: empty state (no data), loading state (fetching), populated state (normal), error state (request failed), partial state (some data loaded), disabled state (not interactive), and edge states (long text truncation, large number formatting, long list virtualization). Missing states cause blank screens, no loading indicators, and raw error messages.

**Pass 4: Design System Consistency**
Verify a design system is referenced or defined (color tokens, spacing scale, type scale, component library). Check that color values use design system tokens, not hex values. Check spacing uses the spacing scale, not arbitrary pixels. Verify typography uses the type scale. Flag visual elements with no design system mapping.

**Pass 5: Responsive Breakpoint Coverage**
Verify breakpoints are defined (e.g., mobile < 768px, tablet 768-1024px, desktop > 1024px). For each screen, check layout behavior at each breakpoint. Check navigation collapses appropriately. Verify data tables adapt (horizontal scroll, card layout, column hiding). Check forms stack on mobile. Verify hover states have touch alternatives on mobile.

**Pass 6: Error State Handling**
List every user action involving an API call or data mutation. For each, verify an error state is designed. Check error messages are user-friendly (not "Error 422" or "CONSTRAINT_VIOLATION"). Verify recovery paths: retry, back button, progress preservation. Check network connectivity loss handling. Verify validation error display approach (inline vs summary). Check destructive action error states are unambiguous.

**Pass 7: Component Hierarchy vs Architecture**
List frontend components from architecture and UI components from UX spec. Verify alignment: UX components map to architecture component boundaries. Check data flow assumptions match architecture state management approach. Verify reusable components align with the component library. Confirm page-level components correspond to routes or views in the architecture.

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| UX-001 | P0 | Pass 1 | [description] | [screen/flow] |
| UX-002 | P1 | Pass 3 | [description] | [component] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing journey — fix once
- **Same screen**: Findings on the same screen or flow — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected spec sections.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to `docs/ux-spec.md`. For each fix, verify it does not break alignment with PRD features, API contract data shapes, or architecture component structure.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not break PRD coverage, API alignment, or architecture component structure
3. Check for design system or accessibility inconsistencies introduced by the fix

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/review-ux.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Process

1. Read `docs/ux-spec.md`, `docs/prd.md`, and `docs/api-contracts.md` (if it exists)
2. Execute all 7 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. Write review report to `docs/reviews/review-ux.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — UX specification review findings documented in `docs/reviews/review-ux.md`.

**Next:** Run `/scaffold:tdd` to create the testing strategy informed by the reviewed UX spec.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
