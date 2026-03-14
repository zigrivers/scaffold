---
name: review-ux-spec
description: Failure modes and review passes specific to UI/UX specification artifacts
topics: [review, ux, design, accessibility, responsive]
---

# Review: UX Specification

The UX specification translates user journeys from the PRD and component architecture from the system architecture into concrete screens, interactions, and components. It must cover every user-facing feature, handle all interaction states (including errors and edge cases), and align with the design system. This review uses 7 passes targeting the specific ways UX specs fail.

Follows the review process defined in `review-methodology.md`.

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
