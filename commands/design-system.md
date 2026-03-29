---
description: "Create a cohesive design system with tokens and component patterns for frontend"
long-description: "Creates a visual language — color palette (WCAG-compliant), typography scale, spacing system, component patterns — and generates working theme config files for your frontend framework."
---

## Purpose
Define a complete visual language (colors, typography, spacing, borders, shadows)
and configure the frontend framework's theme with these design tokens. Document
reusable component patterns so all AI agents build consistent, accessible,
professional UI without requiring design expertise from the user.

## Inputs
- docs/tech-stack.md (required) — frontend framework and UI library choices
- docs/plan.md (required) — application purpose and target users inform design direction
- User preferences (gathered via questions) — overall feel, color preferences,
  reference apps, dark mode requirement

## Expected Outputs
- docs/design-system.md — color palette, typography scale, spacing scale, border
  radius, shadows, component patterns (buttons, forms, cards, feedback, navigation,
  data display), layout system, and do's/don'ts
- Theme configuration files (tailwind.config.js, theme.ts, CSS custom properties, etc.)
- Example implementation page demonstrating the design system
- docs/coding-standards.md updated with Styling / Design System section
- CLAUDE.md updated with Design System section and quick reference

## Quality Criteria
- (mvp) All colors meet WCAG AA contrast requirements
- (mvp) Typography scale uses a consistent modular ratio; body text >= 16px; line height >= 1.5 for body text
- (mvp) Spacing uses a consistent system appropriate to the frontend framework (e.g., 4px base unit, Tailwind spacing scale, or Material Design grid)
- (deep) Component patterns cover buttons, forms, cards, feedback, navigation, data display
- (mvp) Theme configuration files actually work (verified by running dev server)
- (deep) Both light and dark mode token values provided (if dark mode requested)
- (deep) Responsive breakpoints defined (mobile, tablet, desktop)
- No arbitrary hex values or pixel values in component examples (all use tokens)

## Methodology Scaling
- **deep**: Full design system with all component categories, dark mode support,
  responsive breakpoints, animation guidelines, accessibility audit, and example
  page demonstrating all patterns. 15-20 pages.
- **mvp**: Color palette, typography, spacing scale, and button/form/card patterns.
  No dark mode. Basic theme config. 3-5 pages.
- **custom:depth(1-5)**: Depth 1: color palette and typography scale only.
  Depth 2: colors, typography, and button patterns. Depth 3: add forms, cards,
  and spacing scale. Depth 4: add navigation, data display, layout system, and
  responsive breakpoints. Depth 5: full suite with dark mode, accessibility
  audit, and animation guidelines.

## Conditional Evaluation
Enable when: tech-stack.md includes a frontend framework (React, Vue, Angular, Svelte,
etc.), plan.md describes a UI-based application, or project targets web/mobile
platforms. Skip when: project is backend-only, a CLI tool, or a library with no UI.

## Mode Detection
Update mode if docs/design-system.md exists. In update mode: never change color
values, font families, or spacing scales without user approval. Preserve all
theme config file customizations.

## Update Mode Specifics
- **Detect prior artifact**: docs/design-system.md exists
- **Preserve**: color palette, typography scale, spacing scale, existing
  component patterns, theme configuration files, dark mode token values,
  responsive breakpoint definitions
- **Triggers for update**: new UI features need new component patterns, UX spec
  requires additional interaction states, accessibility audit identified contrast
  issues, user requests design direction change
- **Conflict resolution**: if a new component pattern conflicts with existing
  token usage, extend the token set rather than modifying existing values;
  always verify WCAG AA compliance after any color changes

---

## Domain Knowledge

### design-system-tokens

*Design token definitions, base component visual specs, dark mode patterns, and pattern library for building consistent UIs*

## Summary

## Design Tokens

Design tokens are the atomic values that define the visual language. They are variables, not hard-coded values. Every visual property in the application references a token.

### Color Tokens

**Brand colors:**

```
--color-primary: #2563EB          // Main brand/action color
--color-primary-hover: #1D4ED8    // Interactive state
--color-primary-active: #1E40AF   // Pressed/active state
--color-primary-light: #DBEAFE    // Backgrounds, subtle highlights
--color-primary-lighter: #EFF6FF  // Very subtle tints

--color-secondary: #7C3AED        // Supporting brand color
--color-secondary-hover: #6D28D9  // Interactive state
--color-secondary-light: #EDE9FE  // Backgrounds
```

**Neutral scale:**

```
--color-neutral-50: #FAFAFA       // Lightest background
--color-neutral-100: #F5F5F5      // Card backgrounds, zebra stripes
--color-neutral-200: #E5E5E5      // Borders, dividers
--color-neutral-300: #D4D4D4      // Disabled borders
--color-neutral-400: #A3A3A3      // Muted text, placeholders, disabled text
--color-neutral-500: #737373      // Secondary icons
--color-neutral-600: #525252      // Tertiary text
--color-neutral-700: #404040      // Secondary text
--color-neutral-800: #262626      // Dark backgrounds (dark mode cards)
--color-neutral-900: #171717      // Primary text, dark mode page background
```

**Semantic colors:**

```
--color-success: #16A34A          // Success states, positive actions
--color-success-light: #DCFCE7    // Success backgrounds
--color-success-dark: #15803D     // Success text on light backgrounds

--color-warning: #CA8A04          // Warning states, caution
--color-warning-light: #FEF9C3    // Warning backgrounds
--color-warning-dark: #A16207     // Warning text on light backgrounds

--color-error: #DC2626            // Error states, destructive actions
--color-error-light: #FEE2E2      // Error backgrounds
--color-error-dark: #B91C1C       // Error text on light backgrounds

--color-info: #2563EB             // Informational states
--color-info-light: #DBEAFE       // Info backgrounds
```

**Surface and overlay:**

```
--color-surface: #FFFFFF          // Card/panel surfaces
--color-overlay: rgba(0,0,0,0.5)  // Modal/dialog backdrop
--color-focus-ring: rgba(37,99,235,0.5)  // Focus indicator
```

## Deep Guidance

### Typography Tokens

**Font families:**

```
--font-family: 'Inter', system-ui, -apple-system, sans-serif
--font-family-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace
```

**Font sizes (modular scale):**

```
--text-xs: 0.75rem    // 12px — fine print, labels, badges
--text-sm: 0.875rem   // 14px — secondary text, table cells, help text
--text-base: 1rem     // 16px — body text (default)
--text-lg: 1.125rem   // 18px — subheadings, emphasis
--text-xl: 1.25rem    // 20px — section titles
--text-2xl: 1.5rem    // 24px — page titles
--text-3xl: 1.875rem  // 30px — hero text, major headings
--text-4xl: 2.25rem   // 36px — display headings (marketing, landing)
```

**Font weights:**

```
--font-weight-normal: 400    // Body text
--font-weight-medium: 500    // Buttons, labels, navigation
--font-weight-semibold: 600  // Subheadings, emphasis
--font-weight-bold: 700      // Headings, strong emphasis
```

**Line heights:**

```
--line-height-tight: 1.25    // Headings, single-line labels
--line-height-normal: 1.5    // Body text (default)
--line-height-relaxed: 1.75  // Long-form content, help text
```

**Letter spacing:**

```
--tracking-tight: -0.025em   // Large headings
--tracking-normal: 0         // Body text
--tracking-wide: 0.025em     // Uppercase labels, small caps
```

### Spacing Tokens

Based on a 4px base unit. Every spacing value in the application uses one of these tokens -- no arbitrary pixel values.

```
--space-0: 0           // 0px  — no spacing
--space-0.5: 0.125rem  // 2px  — hairline gaps
--space-1: 0.25rem     // 4px  — tight gaps (icon to label)
--space-1.5: 0.375rem  // 6px  — compact inline spacing
--space-2: 0.5rem      // 8px  — compact spacing (list items, badge padding)
--space-3: 0.75rem     // 12px — default padding (buttons, inputs)
--space-4: 1rem        // 16px — standard spacing (form fields, card padding)
--space-5: 1.25rem     // 20px — medium gaps
--space-6: 1.5rem      // 24px — section padding
--space-8: 2rem        // 32px — large gaps (section spacing)
--space-10: 2.5rem     // 40px — major section gaps
--space-12: 3rem       // 48px — section separators
--space-16: 4rem       // 64px — page-level spacing
--space-20: 5rem       // 80px — hero section padding
--space-24: 6rem       // 96px — page-level vertical rhythm
```

### Border and Shadow Tokens

**Border radii:**

```
--radius-none: 0         // Sharp corners
--radius-sm: 0.25rem     // 4px  — subtle rounding (tags, badges)
--radius-md: 0.5rem      // 8px  — standard rounding (cards, inputs, buttons)
--radius-lg: 0.75rem     // 12px — prominent rounding (modals, panels)
--radius-xl: 1rem        // 16px — large containers, hero cards
--radius-full: 9999px    // Pill shapes, avatars, toggles
```

**Elevation (box shadows):**

```
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05)                          // Subtle lift (buttons, badges)
--shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)   // Cards, dropdowns
--shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.05)   // Popovers, floating elements
--shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.04)  // Modals, dialogs
--shadow-inner: inset 0 2px 4px rgba(0,0,0,0.05)                 // Pressed states, input wells
```

**Border widths:**

```
--border-width-thin: 1px     // Default borders (inputs, cards, dividers)
--border-width-medium: 2px   // Focus rings, active tab indicators
--border-width-thick: 4px    // Left-border accents on alerts
```

### Transition Tokens

```
--transition-fast: 150ms ease      // Hover states, color changes
--transition-base: 200ms ease      // Most interactions
--transition-slow: 300ms ease      // Layout shifts, modals appearing
--transition-spring: 300ms cubic-bezier(0.34, 1.56, 0.64, 1)  // Playful bounces (optional)
```

## Dark Mode

When dark mode is required, define a parallel set of semantic tokens that switch based on the color scheme. Components reference semantic tokens, never raw color tokens directly.

### Semantic Token Mapping

```css
:root {
  /* Surfaces */
  --bg-primary: var(--color-neutral-50);
  --bg-secondary: var(--color-neutral-100);
  --bg-card: white;
  --bg-input: white;
  --bg-overlay: rgba(0, 0, 0, 0.5);

  /* Text */
  --text-primary: var(--color-neutral-900);
  --text-secondary: var(--color-neutral-700);
  --text-muted: var(--color-neutral-400);
  --text-inverse: white;

  /* Borders */
  --border-default: var(--color-neutral-200);
  --border-strong: var(--color-neutral-300);
  --border-focus: var(--color-primary);

  /* Shadows */
  --shadow-color: rgba(0, 0, 0, 0.1);
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Surfaces */
    --bg-primary: var(--color-neutral-900);
    --bg-secondary: #1a1a1a;
    --bg-card: var(--color-neutral-800);
    --bg-input: var(--color-neutral-800);
    --bg-overlay: rgba(0, 0, 0, 0.7);

    /* Text */
    --text-primary: var(--color-neutral-50);
    --text-secondary: var(--color-neutral-400);
    --text-muted: var(--color-neutral-500);
    --text-inverse: var(--color-neutral-900);

    /* Borders */
    --border-default: var(--color-neutral-700);
    --border-strong: var(--color-neutral-600);
    --border-focus: #60A5FA;

    /* Shadows — reduced in dark mode, use border emphasis instead */
    --shadow-color: rgba(0, 0, 0, 0.3);
  }
}
```

### Dark Mode Implementation Rules

- **Always use semantic tokens** (`--bg-primary`, `--text-primary`) in components, never raw color tokens (`--color-neutral-900`). This makes dark mode automatic.
- **Test both modes**: Every visual change must be verified in both light and dark mode.
- **Avoid pure black backgrounds**: Use `--color-neutral-900` (#171717) instead of `#000000` -- pure black creates harsh contrast and eye strain.
- **Reduce shadow prominence in dark mode**: Shadows are less visible on dark backgrounds. Use border emphasis or subtle glow effects instead.
- **Adjust semantic color intensity**: Success, warning, and error colors may need lighter variants in dark mode for readability on dark surfaces.
- **Images and illustrations**: Consider providing dark-mode-optimized versions or applying CSS filters (e.g., `brightness(0.9)`) to prevent overly bright images on dark backgrounds.

## Responsive Breakpoints

Define breakpoints as min-width values for mobile-first responsive design:

```
--breakpoint-sm: 640px     // Small devices (landscape phones)
--breakpoint-md: 768px     // Tablets
--breakpoint-lg: 1024px    // Laptops, small desktops
--breakpoint-xl: 1280px    // Large desktops
--breakpoint-2xl: 1536px   // Extra-large screens
```

### Breakpoint Usage

```css
/* Mobile-first: base styles apply to all sizes */
.container { padding: var(--space-4); }

/* Tablet and up */
@media (min-width: 768px) {
  .container { padding: var(--space-6); max-width: 768px; }
}

/* Desktop and up */
@media (min-width: 1024px) {
  .container { padding: var(--space-8); max-width: 1024px; }
}

/* Large desktop */
@media (min-width: 1280px) {
  .container { max-width: 1200px; }
}
```

### Responsive Patterns

- **Stack to grid**: Single-column on mobile, multi-column on desktop
- **Navigation collapse**: Full nav on desktop, hamburger menu below `--breakpoint-md`
- **Table adaptation**: Full table on desktop, card layout below `--breakpoint-md`
- **Touch targets**: Minimum 44x44px on touch devices (below `--breakpoint-lg`)
- **Font scaling**: Base size stays at 16px; heading sizes may reduce on mobile

## Accessibility Requirements

### Color Contrast

All text must meet WCAG 2.1 AA contrast requirements:
- **Normal text (< 18px)**: minimum 4.5:1 contrast ratio against background
- **Large text (>= 18px bold or >= 24px)**: minimum 3:1 contrast ratio
- **UI components and graphical objects**: minimum 3:1 against adjacent colors
- **Focus indicators**: must have 3:1 contrast against both the component and the background

### Focus Indicators

Every interactive element must have a visible focus indicator:

```css
:focus-visible {
  outline: var(--border-width-medium) solid var(--border-focus);
  outline-offset: 2px;
}
```

- Do not remove focus outlines (`outline: none`) without providing an alternative
- Use `:focus-visible` (not `:focus`) to show focus rings only for keyboard navigation
- Focus ring must be visible in both light and dark mode

### Touch Targets

- Minimum interactive element size: 44x44 CSS pixels (WCAG 2.5.5 Target Size)
- Minimum spacing between adjacent touch targets: 8px
- Clickable area may be larger than the visual element (use padding, not just visual size)

### Motion and Animation

- Respect `prefers-reduced-motion`: disable non-essential animations
- Essential animations (loading spinners) should still play but with reduced motion
- Auto-playing animations should have a pause mechanism

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Base Components

Define the standard appearance and behavior for every common component:

### Buttons

**Variants:**
- **Primary**: Solid fill (`--color-primary` background, white text). Main call-to-action.
- **Secondary**: Subtle fill (`--color-neutral-100` background, `--text-primary` text). Secondary actions.
- **Outline**: Border only (`--border-default` border, `--text-primary` text). Tertiary actions.
- **Ghost**: No background or border. Minimal visual weight. Navigation, icon-only actions.
- **Destructive**: Red/danger (`--color-error` background, white text). Delete, remove, cancel actions.

**Sizes:**
- **sm**: 28px height, `--text-xs`, `--space-2` horizontal padding
- **md**: 36px height, `--text-sm`, `--space-3` horizontal padding (default)
- **lg**: 44px height, `--text-base`, `--space-4` horizontal padding

**States:**
- **Default**: Normal appearance
- **Hover**: Darker background (e.g., `--color-primary-hover`), cursor pointer
- **Active**: Even darker background (`--color-primary-active`), slight scale-down
- **Focused**: Focus ring visible (`--border-focus` outline)
- **Disabled**: Reduced opacity (0.5), no hover effects, `cursor: not-allowed`
- **Loading**: Label replaced with spinner, interaction disabled, maintains button width

### Form Elements

**Text inputs and textareas:**
- Border: `--border-default`, `--radius-md`
- Focus: `--border-focus` with focus ring
- Error: `--color-error` border + error message below in `--color-error`
- Disabled: `--color-neutral-100` background, reduced opacity
- Height: 36px for inputs (matches button md)

**Labels:**
- Always visible (never use placeholder as the only label)
- Required indicator: asterisk or "(required)" text
- Associated with input via `for`/`id` or wrapping

**Help text:**
- Below input, `--text-xs`, `--text-muted` color
- Explains format expectations (e.g., "Must be at least 8 characters")

**Error messages:**
- Below input, `--text-xs`, `--color-error`
- Describes what went wrong and how to fix it (not just "Invalid")
- Replaces help text when error is active

**Select inputs and dropdowns:**
- Same dimensions and borders as text inputs
- Chevron indicator aligned right
- Option list uses `--shadow-lg` elevation

**Checkboxes and radio buttons:**
- Minimum 20x20px visual size, 44x44px touch target
- Checked state uses `--color-primary`
- Labels always to the right, clickable

### Cards

- Background: `--bg-card`
- Border: `--border-default` or `--shadow-sm`
- Padding: `--space-4` to `--space-6`
- Border radius: `--radius-md`
- **Interactive cards**: hover state increases shadow (`--shadow-md`), cursor pointer
- **Header/footer sections**: separated by `--border-default` divider, visually distinct padding

### Feedback Components

**Toast notifications:**
- Temporary, non-blocking, positioned top-right or bottom-center
- Auto-dismiss after 5 seconds with manual dismiss (X button)
- Variants: success (green), error (red), warning (yellow), info (blue)
- Includes icon + message + optional action link

**Alert banners:**
- Persistent until explicitly dismissed
- Full-width or contained within a section
- Left border accent (`--border-width-thick`) with semantic color
- Variants: info, warning, error, success

**Empty states:**
- Centered illustration or icon
- Explanatory heading and description text
- Call-to-action button ("Create your first [item]")
- Uses `--text-muted` for description

**Loading states:**
- **Skeleton loaders** (preferred for content areas): animated placeholder shapes matching content layout
- **Spinners** (for actions): 20px for inline, 32px for section, 48px for page-level
- **Progress bars** (for known-duration operations): determinate with percentage

### Navigation

- **Header/navbar**: fixed or sticky, `--shadow-sm` or border-bottom, contains logo + primary nav + user menu
- **Sidebar**: collapsible on desktop, overlay on mobile, active item highlighted with `--color-primary-light` background
- **Breadcrumbs**: `--text-sm`, separator chevrons, current page not linked
- **Tabs**: underline style (active tab has `--color-primary` bottom border, `--border-width-medium`), equal or auto width
- **Pagination**: prev/next buttons + page numbers, disabled state for first/last, compact mode on mobile (prev/next only)

### Data Display

- **Tables**: header row with `--bg-secondary` background, row hover state, sortable column headers with indicator icon, responsive (horizontal scroll or card layout on mobile)
- **Lists**: consistent item height and spacing (`--space-2` to `--space-3` between items), interactive items have hover state
- **Badges/tags**: `--radius-full`, `--text-xs`, `--space-1` vertical / `--space-2` horizontal padding, semantic color variants
- **Avatars**: `--radius-full`, sizes 24/32/40px, fallback shows initials on `--color-primary-light` background
- **Stats/metrics**: large value (`--text-2xl`, `--font-weight-bold`), label below (`--text-sm`, `--text-secondary`), optional trend indicator (up/down arrow with green/red)

## Pattern Library

Document recurring UI patterns with implementation guidance:

- **Search with autocomplete**: Debounced input (300ms), dropdown results panel with `--shadow-lg`, keyboard navigation (arrow keys + Enter), "no results" state with suggestion, clear button (X) when input has value
- **Confirmation dialogs**: Modal with overlay, clearly states what will happen ("Delete 3 items? This cannot be undone."), "Cancel" as default/primary action (preventing accidents), destructive action in `--color-error`
- **Inline editing**: Click to edit transforms display text into input, Enter to save, Escape to cancel, loading indicator during save, validation feedback
- **Bulk actions**: Checkbox selection, "Select all" header checkbox, floating action toolbar appears when items selected, count indicator ("3 selected")
- **Wizard/stepper**: Numbered step indicator, completed steps show checkmark, back/next navigation, save progress between steps, summary step before final submit
- **Infinite scroll vs. pagination**: Use pagination for data tables and search results (users need to reference positions). Use infinite scroll for feeds and timelines (users scan sequentially).

## Common Pitfalls

**Inconsistent spacing and typography.** Five different font sizes that are all "kind of like body text." Spacing that varies randomly between 12px and 17px with no system. Fix: define a spacing scale and type scale in the design system. Only use values from the scale.

**Hard-coded color values in components.** Using `#2563EB` directly in a component instead of `var(--color-primary)`. When the brand color changes, you must find-and-replace across the entire codebase. Fix: always reference tokens. Lint for hard-coded color/size values.

**Placeholder text as labels.** Using placeholder text instead of labels for form fields. Placeholders disappear when the user starts typing, leaving them with no indication of what the field expects. Fix: always use visible labels. Placeholders are supplementary hints, not replacements for labels.

**Ignoring touch targets on mobile.** Tiny links and buttons that require precise finger tapping. Fix: ensure all interactive elements meet minimum 44x44px touch target size on mobile.

**Dark mode as an afterthought.** Building the entire UI with hard-coded light colors, then trying to add dark mode later. Fix: use semantic tokens from day one. The cost is near-zero upfront and saves a complete restyle later.

**Missing reduced-motion support.** Animations that cause discomfort for users with vestibular disorders. Fix: always wrap non-essential animations in a `prefers-reduced-motion` check.

**Inconsistent elevation hierarchy.** A card inside a modal has a higher shadow than the modal itself, breaking the visual stacking order. Fix: define an elevation scale (sm < md < lg < xl) and assign levels consistently: page content (none), cards (sm), dropdowns (lg), modals (xl).
