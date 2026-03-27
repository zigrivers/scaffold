---
description: "Specify user flows, interaction states, component architecture, accessibility, and responsive behavior"
long-description: "Reads PRD, user stories, and system architecture, then creates docs/ux-spec.md defining user flows, interaction state machines, component architecture, accessibility requirements, and responsive behavior. References docs/design-system.md for visual tokens rather than redefining them."
---

Read `docs/prd.md`, `docs/user-stories.md`, `docs/system-architecture.md`, `docs/design-system.md` (if it exists), and `docs/api-contracts.md` (if it exists), then create the UX specification. Produce `docs/ux-spec.md` as the interaction and behavior blueprint for the frontend — user flows, component architecture, accessibility, and responsive behavior. Visual tokens and component appearance come from `docs/design-system.md` — this step consumes those tokens, it does not redefine them.

## Mode Detection

Before starting, check if `docs/ux-spec.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists -> UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:ux-spec v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing sections against what this prompt would produce fresh. Categorize:
   - **ADD** — Required sections or flows missing from existing spec
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure
   - **PRESERVE** — Project-specific design decisions, custom component specs, accessibility customizations
3. **Cross-doc consistency**: Read related docs and verify UX spec aligns with current requirements and API contracts.
4. **Preview changes**: Present the user a summary table. Wait for approval before proceeding.
5. **Execute update**: Update spec, respecting preserve rules.
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:ux-spec v<ver> <date> -->`
7. **Post-update summary**: Report sections added, restructured, preserved, and cross-doc issues.

**In both modes**, follow all instructions below.

### Update Mode Specifics
- **Primary output**: `docs/ux-spec.md`
- **Preserve**: Custom component architecture decisions, accessibility level decisions, responsive breakpoint choices, user flow mappings
- **Related docs**: `docs/prd.md`, `docs/user-stories.md`, `docs/system-architecture.md`, `docs/api-contracts.md`, `docs/design-system.md`
- **Special rules**: Preserve component specifications that are already implemented. Reference design tokens from `docs/design-system.md` — do not redefine token values here.

---

## What the Document Must Cover

### 1. User Flows

Map each user story's acceptance criteria to screen states and transitions. For each core flow:

- **Entry point**: How the user arrives (URL, navigation click, redirect, deep link)
- **Preconditions**: What must be true (authenticated? specific role? data exists?)
- **Happy path**: Primary sequence from start to goal completion
- **Decision points**: Where the flow branches based on user choice or system state
- **Error paths**: What happens on validation failure, network error, auth expiry, rate limiting
- **Empty states**: First-time use, no data, no search results
- **Exit points**: Success confirmation, redirect, return to previous screen

**State diagrams for complex interactions:**
```
Form: IDLE -> DIRTY -> VALIDATING -> VALID -> SUBMITTING -> SUCCESS
                                  -> INVALID -> DIRTY (user edits)
                                              SUBMITTING -> ERROR -> DIRTY
```

### 2. Component Architecture

Organize components in a hierarchy:

- **Atoms** (base components): Button, Input, Label, Icon, Badge, Avatar — implement design tokens directly
- **Molecules** (composites): FormField (Label + Input + Error), SearchBar (Input + Button + Suggestions), UserCard (Avatar + Text + Badge)
- **Organisms** (features): NavigationBar, OrderSummary, DataTable with pagination
- **Templates** (layouts): DashboardLayout (sidebar + header + content), AuthLayout (centered card)
- **Pages**: Templates filled with data and connected to state

**Data flow**: Top-down via props, events/callbacks up. Server state via data-fetching tools (React Query, SWR). Client state managed locally or in a store.

**Shared vs. page-specific**: Components start page-specific. Promote to shared when a second feature needs the same component.

### 3. Design System Reference

If `docs/design-system.md` exists, reference its tokens (colors, typography, spacing, borders, shadows) and component visual specs (buttons, forms, cards, feedback). Do NOT redefine token values — just reference them by name.

If `docs/design-system.md` does not exist, note which design tokens and component patterns the UX flows require, so the design-system step can address them later. Use placeholder references like `--color-primary`, `--space-4` rather than inventing concrete values.

### 4. Accessibility (WCAG AA Baseline)

**Keyboard navigation:**
- Tab order follows visual reading order
- Focus indicators visible and enhanced (not just browser default)
- Modal dialogs trap focus; Escape closes them
- Skip links for keyboard users to bypass navigation
- Arrow keys for composite widgets (tabs, menus, radio groups)

**Screen reader support:**
- Semantic HTML (`nav`, `main`, `aside`, `header`, `footer`, `button`)
- All images have descriptive `alt` text (decorative: `alt=""`)
- Form fields have associated `<label>` or `aria-label`
- Dynamic content uses `aria-live` regions
- Tables have `<th>` with proper scope

**Color contrast:**
- 4.5:1 for normal text, 3:1 for large text (18px+ or 14px+ bold)
- Interactive elements distinguishable by more than color (add icons, underlines)
- Error states use icon + color, not color alone

**Focus management:**
- Modal open: focus first interactive element inside
- Modal close: return focus to trigger element
- Item deleted: focus next item (or previous if last)

### 5. Responsive Design

**Breakpoints:**
```
Mobile:        < 640px
Tablet:        640-1024px
Desktop:       1024-1280px
Large Desktop: > 1280px
```

**Layout behavior per breakpoint:**

| Component | Mobile | Tablet | Desktop |
|-----------|--------|--------|---------|
| Navigation | Hamburger menu | Collapsed sidebar | Full sidebar |
| Content grid | 1 column | 2 columns | 3-4 columns |
| Data tables | Card view (stacked) | Scrollable table | Full table |
| Modals | Full screen | Centered 80% | Centered fixed width |
| Forms | Single column | Single column | Two-column for long forms |

**Touch targets**: Minimum 44x44px on mobile. Sufficient spacing between interactive elements.

**Mobile-first recommended**: Base styles for mobile, add complexity with `min-width` media queries.

### 6. Pattern Library

Document recurring UI patterns:
- Search with autocomplete (debounced, keyboard nav, "no results" state)
- Confirmation dialogs (before destructive actions, "Cancel" as primary)
- Inline editing (click to edit, Enter to save, Escape to cancel)
- Bulk actions (select all, individual select, toolbar on selection)
- Wizard/stepper (progress indicator, back/next, save between steps)

---

## Quality Criteria

- Every PRD user journey has a corresponding flow with all states documented
- Component hierarchy covers all UI states (loading, error, empty, populated)
- Design tokens referenced from `docs/design-system.md` — not redefined in this document
- Accessibility requirements meet WCAG AA (keyboard nav, screen readers, contrast)
- Responsive breakpoints defined with layout behavior specified per breakpoint
- Error states documented for every user action that can fail
- No missed states: loading, submitting, partial data, stale data, offline

---

## Process

1. **Read all inputs** — Read `docs/prd.md`, `docs/user-stories.md`, and `docs/system-architecture.md`. Read `docs/api-contracts.md` for data shapes if it exists. Read `docs/design-system.md` if it exists — reference its tokens throughout.
2. **Use AskUserQuestionTool** for these decisions:
   - **UX depth**: Full specification with detailed wireframe descriptions, or key flows with core component list?
   - **Accessibility level**: WCAG AA (standard) or AAA (enhanced) for critical flows?
3. **Use subagents** to research UX patterns for the project's specific frontend framework
4. **Map stories to flows** — create user flow documentation for every core journey
5. **Define component hierarchy** — atoms through pages, with state specifications for every component
6. **Document accessibility requirements** — keyboard, screen reader, contrast, focus management
7. **Define responsive behavior** — layout changes per breakpoint, touch targets
8. **Cross-validate** — verify every user story has a flow, every flow has error states, every component has all states
9. Create a Beads task: `bd create "docs: UX specification" -p 0` and `bd update <id> --claim`
10. When complete and committed: `bd close <id>`

## After This Step

When this step is complete, tell the user:

---
**Specification phase complete** — `docs/ux-spec.md` created with user flows, component architecture, accessibility, and responsive behavior.

**Next:** Run `/scaffold:tdd` — Create TDD standards, or `/scaffold:coding-standards` if not yet done.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
