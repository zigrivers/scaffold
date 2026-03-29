---
name: ux-specification
description: UX documentation patterns — user flows, interaction states, component architecture, accessibility, and responsive behavior
topics: [ux, accessibility, wireframes, user-flows, responsive-design, components, interaction-states]
---

# UX Specification

## Summary

- **User flow documentation**: Map each story's Given/When/Then scenarios to screen states and transitions. Document entry points, preconditions, happy path, decision points, error paths, empty states, and exit points.
- **Component architecture**: Organize components as atoms (base), molecules (composite), organisms (feature), templates (layouts), and pages. Define prop/data flow with top-down props and events/callbacks up.
- **Design system reference**: Consume design tokens from `docs/design-system.md` by name (e.g., `--color-error`, `--space-4`). Never hard-code values.
- **Accessibility**: Target WCAG AA as baseline. Keyboard navigation for all interactive elements, semantic HTML, screen reader support with ARIA, 4.5:1 color contrast, and proper focus management.
- **Responsive design**: Mobile-first breakpoints (mobile < 640px, tablet 640-1024px, desktop 1024-1280px, large > 1280px). Touch targets minimum 44x44px. Document layout behavior per breakpoint.
- **Common pitfalls**: Designing for happy path only, accessibility as afterthought, missing loading states, breaking text on resize, and modal abuse for content that should be pages.

## Deep Guidance

## User Flow Documentation

### Journey Mapping

User stories (`docs/user-stories.md`) define what users do — each story's acceptance criteria describe a user journey. UX specification defines what users see and how they interact while performing those journeys. Map each story's Given/When/Then scenarios to screen states and transitions.

A user flow documents every step a user takes to accomplish a goal, including all decision points, error states, and alternative paths. User flows are the bridge between user stories and implementable UI specifications.

**Structure of a user flow:**

1. **Entry point** — How the user arrives (direct URL, navigation click, redirect, deep link)
2. **Preconditions** — What must be true before this flow starts (authenticated? specific role? data exists?)
3. **Happy path** — The primary sequence of steps from start to goal completion
4. **Decision points** — Where the flow branches based on user choice or system state
5. **Error paths** — What happens when validation fails, network errors occur, or the user enters invalid data
6. **Empty states** — What the user sees when there's no data yet (first-time use, no search results, no activity)
7. **Exit points** — How the flow ends (success confirmation, redirect, return to previous screen)

**Example: User Registration Flow**

```
Entry: /register page (from landing page CTA or direct URL)
Preconditions: User is NOT authenticated

1. User sees registration form (email, password, confirm password)
2. User fills in fields
   -> Inline validation:
      - Email: valid format check on blur
      - Password: strength indicator updates on keypress
      - Confirm password: match check on blur
3. User clicks "Create Account"
4. Client-side validation
   -> FAIL: highlight invalid fields, show specific error messages, focus first error
   -> PASS: submit to API
5. Server-side validation
   -> Email already exists: show error "An account with this email already exists" with link to login
   -> Rate limited: show error "Too many attempts. Please try again in X minutes."
   -> PASS: create account, send verification email
6. Redirect to /verify-email with message "Check your email for a verification link"
7. User clicks verification link in email
   -> Token expired: show error with "Resend verification" button
   -> Token valid: activate account, redirect to /onboarding
```

### State Diagrams for Interactions

Complex UI interactions benefit from state diagrams that show all possible states and transitions:

```
Form States:
  IDLE -> DIRTY (user types)
  DIRTY -> VALIDATING (user triggers validation)
  VALIDATING -> VALID (all fields pass)
  VALIDATING -> INVALID (one or more fields fail)
  VALID -> SUBMITTING (user clicks submit)
  SUBMITTING -> SUCCESS (server accepts)
  SUBMITTING -> ERROR (server rejects)
  ERROR -> DIRTY (user modifies input)
```

State diagrams prevent missed states. Common missed states include:
- Loading/submitting states (user clicks button twice)
- Partial data states (some fields loaded, others still fetching)
- Stale data states (data on screen is outdated)
- Offline/reconnecting states (network drops mid-operation)

### Documenting Error Paths

Every error that can occur must have a specified user experience:

| Error Type | User Sees | User Can Do |
|------------|-----------|-------------|
| Validation error | Inline error message next to field | Fix the field and resubmit |
| Auth error (401) | Redirect to login with return URL | Log in and return to where they were |
| Permission error (403) | "You don't have permission" message | Contact admin or navigate away |
| Not found (404) | Custom 404 page with navigation | Go home or search |
| Server error (500) | "Something went wrong" with retry | Retry the action |
| Network error | "Connection lost" banner | Wait for reconnection or refresh |
| Rate limit (429) | "Too many attempts" with countdown | Wait and retry |

## Component Architecture

### Component Hierarchy

Organize components in a hierarchy from primitive to composed:

**Atoms (base components):** The smallest reusable UI elements. Button, Input, Label, Icon, Badge, Avatar. These implement the design system tokens directly.

**Molecules (composite components):** Combinations of atoms that function as a unit. FormField (Label + Input + ErrorMessage), SearchBar (Input + Button + Suggestions), UserCard (Avatar + Text + Badge).

**Organisms (feature components):** Complex UI sections composed of molecules and atoms. NavigationBar, OrderSummary, UserProfile, DataTable with pagination.

**Templates (page layouts):** Structural layouts that arrange organisms on a page. DashboardLayout (sidebar + header + content area), AuthLayout (centered card), SettingsLayout (nav tabs + content).

**Pages:** Specific instances of templates filled with real data and connected to state management.

### Prop and Data Flow

Define how data flows through the component tree:

**Top-down data flow (props):** Parent components pass data to children via props. Children never modify props directly.

**Events/callbacks up:** Children communicate to parents via callback functions passed as props. A child input field calls `onChange` to notify the parent of new values.

**Shared state:** When multiple components at different levels of the tree need the same data, lift state to their nearest common ancestor or use a state management solution (Context, Zustand, Redux).

**Server state vs. client state:** Server state (user data, orders, products) comes from API calls and should be managed with data-fetching tools (React Query, SWR, Apollo). Client state (UI toggles, form inputs, modal visibility) is managed locally.

### Composition Patterns

**Slot/children pattern:** Components accept children to render in designated areas, allowing flexible composition without prop explosion.

**Compound components:** Related components that share state implicitly. A `Tabs` component with `TabList`, `Tab`, and `TabPanel` children that coordinate active state internally.

**Render props/hooks:** When component logic needs to be shared without coupling to specific UI. Extract the logic into a hook; multiple components can use the same hook with different UIs.

### Shared vs. Page-Specific Components

**Shared components** (design system components): reusable across the entire application. Must be generic, well-tested, accessible, and documented. Live in a `components/shared/` or `components/ui/` directory.

**Page-specific components:** Used only within a single page or feature. Can be more specialized and less generic. Live within the feature directory (e.g., `features/orders/components/`).

**Promotion rule:** A component starts as page-specific. When a second feature needs the same component, promote it to shared. Don't pre-optimize by making everything shared from the start.

## Design System Reference

Design tokens (colors, typography, spacing, borders, shadows), base component visual specs, dark mode patterns, and the pattern library are defined in `docs/design-system.md`. The UX specification consumes these tokens — it does not redefine them.

When specifying component behavior in user flows and interaction states, reference design system tokens by name (e.g., `--color-error`, `--space-4`) rather than hard-coding values. If `docs/design-system.md` does not exist yet, note which tokens are needed and defer visual decisions to the design-system step.

## Accessibility

### WCAG Compliance Levels

- **Level A (minimum):** All images have alt text. All form fields have labels. Content is navigable by keyboard. No content causes seizures.
- **Level AA (standard target):** Color contrast ratio of 4.5:1 for normal text, 3:1 for large text. Text can be resized to 200% without loss of functionality. Focus indicators are visible.
- **Level AAA (enhanced):** Color contrast ratio of 7:1. Sign language interpretation for audio. Extended audio descriptions.

Target Level AA as the baseline. Specific critical interactions (login, payment, emergency) should meet Level AAA.

### Keyboard Navigation

Every interactive element must be reachable and operable by keyboard:

- **Tab order** follows the visual reading order (left to right, top to bottom)
- **Focus indicators** are visible and distinct (not just browser default — enhance it)
- **Modal dialogs** trap focus within the modal when open
- **Escape** closes modals, dropdowns, and popovers
- **Enter/Space** activates buttons and links
- **Arrow keys** navigate within composite widgets (tabs, menus, radio groups)
- **Skip links** allow keyboard users to skip repetitive navigation

### Screen Reader Support

- Use semantic HTML elements (`nav`, `main`, `aside`, `header`, `footer`, `article`, `section`, `button`)
- All images have descriptive `alt` text (decorative images use `alt=""`)
- Form fields have associated `<label>` elements (or `aria-label` when a visible label isn't feasible)
- Dynamic content updates use `aria-live` regions to announce changes
- Custom interactive components use appropriate ARIA roles and properties
- Tables have headers (`<th>`) with proper scope

### Color Contrast

- Text on backgrounds must meet 4.5:1 contrast ratio (3:1 for large text, 18px+ or 14px+ bold)
- Interactive elements must be distinguishable by more than color alone (add icons, underlines, or patterns)
- Error states must use more than red color — add an icon, bold text, or border
- Verify contrast with tools like axe, Lighthouse, or the WebAIM contrast checker

### Focus Management

- When a modal opens, move focus to the first interactive element inside it
- When a modal closes, return focus to the element that triggered it
- When an item is deleted from a list, move focus to the next item (or the previous if it was the last)
- When navigating to a new page section, move focus to the heading of that section
- Never remove focus outlines unless you replace them with a better indicator

## Responsive Design

### Breakpoint Strategy

Define breakpoints that match actual device usage patterns:

```
Mobile:        < 640px    (phones in portrait)
Tablet:        640-1024px (tablets, phones in landscape)
Desktop:       1024-1280px (laptops)
Large Desktop: > 1280px   (external monitors)
```

**Mobile-first vs. desktop-first:**

- **Mobile-first (recommended):** Write base styles for mobile, then add complexity with `min-width` media queries. Forces prioritization of essential content. Produces less CSS.
- **Desktop-first:** Write base styles for desktop, then simplify with `max-width` media queries. Appropriate when the primary audience is desktop users and mobile is secondary.

### Layout Behavior Per Breakpoint

Document how each major layout component adapts:

| Component | Mobile | Tablet | Desktop |
|-----------|--------|--------|---------|
| Navigation | Hamburger menu | Collapsed sidebar | Full sidebar |
| Content grid | 1 column | 2 columns | 3-4 columns |
| Data tables | Card view (stacked) | Scrollable table | Full table |
| Modals | Full screen | Centered, 80% width | Centered, fixed width |
| Form layout | Single column | Single column | Two-column for long forms |

### Touch Targets

Mobile touch targets must be at least 44x44px (Apple) or 48x48px (Material). Ensure:
- Buttons and links are large enough to tap accurately
- Spacing between interactive elements prevents accidental taps
- Form inputs are tall enough for comfortable finger input

### Responsive Images

- Use `srcset` and `sizes` attributes for responsive image loading
- Serve appropriate image formats (WebP with JPEG fallback)
- Lazy load images below the fold
- Define aspect ratios to prevent layout shift during loading

## Common Pitfalls

**Designing for the happy path only.** A spec that shows what the screen looks like with data but not without data, not during loading, not after an error, and not when the user's name is 47 characters long. Fix: document every state — loading, empty, error, edge-case content lengths, and permission-limited views.

**Accessibility as afterthought.** Building the entire UI first, then trying to add accessibility. Results in ARIA hacks layered on top of inaccessible markup. Fix: use semantic HTML from the start. Test keyboard navigation during development, not after.

**Missing loading states.** The page shows nothing (white screen) while data loads, then content pops in. Users think the app is broken. Fix: use skeleton loaders that match the shape of the content being loaded.

**Breaking text on resize.** Content that looks fine at the design width but overflows, truncates, or overlaps at other widths. Fix: test with variable-length content and multiple viewport widths. Use CSS that handles overflow gracefully (truncation with ellipsis, wrapping, or scrolling).

**Modal abuse.** Using modals for content that should be a page (long forms, complex workflows, multi-step processes). Modals are for brief, focused interactions. Fix: if the modal content would benefit from a back button or URL, it should be a page.
