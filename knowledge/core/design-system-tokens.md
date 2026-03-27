---
name: design-system-tokens
description: Design token definitions, base component visual specs, dark mode patterns, and pattern library for building consistent UIs
topics: [design-system, tokens, colors, typography, spacing, components, dark-mode, pattern-library]
---

## Design Tokens

Design tokens are the atomic values that define the visual language. They are variables, not hard-coded values. Every visual property in the application references a token.

**Color tokens:**

```
--color-primary: #2563EB          // Main brand/action color
--color-primary-hover: #1D4ED8    // Interactive state
--color-primary-light: #DBEAFE    // Backgrounds, subtle highlights

--color-secondary: #7C3AED        // Supporting brand color

--color-neutral-50: #FAFAFA       // Lightest background
--color-neutral-100: #F5F5F5      // Card backgrounds
--color-neutral-200: #E5E5E5      // Borders
--color-neutral-400: #A3A3A3      // Muted text, placeholders
--color-neutral-700: #404040      // Secondary text
--color-neutral-900: #171717      // Primary text

--color-success: #16A34A          // Success states, positive actions
--color-warning: #CA8A04          // Warning states, caution
--color-error: #DC2626            // Error states, destructive actions
--color-info: #2563EB             // Informational states
```

**Typography tokens:**

```
--font-family: 'Inter', system-ui, sans-serif

--text-xs: 0.75rem    // 12px — fine print, labels
--text-sm: 0.875rem   // 14px — secondary text, table cells
--text-base: 1rem     // 16px — body text
--text-lg: 1.125rem   // 18px — subheadings
--text-xl: 1.25rem    // 20px — section titles
--text-2xl: 1.5rem    // 24px — page titles
--text-3xl: 1.875rem  // 30px — hero text

--font-weight-normal: 400
--font-weight-medium: 500
--font-weight-semibold: 600
--font-weight-bold: 700

--line-height-tight: 1.25
--line-height-normal: 1.5
--line-height-relaxed: 1.75
```

**Spacing tokens:**

```
--space-1: 0.25rem    // 4px  — tight gaps (icon to label)
--space-2: 0.5rem     // 8px  — compact spacing (list items)
--space-3: 0.75rem    // 12px — default padding (buttons, inputs)
--space-4: 1rem       // 16px — standard spacing (form fields)
--space-6: 1.5rem     // 24px — section padding
--space-8: 2rem       // 32px — large gaps
--space-12: 3rem      // 48px — section separators
--space-16: 4rem      // 64px — page-level spacing
```

**Border and shadow tokens:**

```
--radius-sm: 0.25rem   // 4px  — subtle rounding (tags, badges)
--radius-md: 0.5rem    // 8px  — standard rounding (cards, inputs, buttons)
--radius-lg: 0.75rem   // 12px — prominent rounding (modals, panels)
--radius-full: 9999px  // Pill shapes, avatars

--shadow-sm: 0 1px 2px rgba(0,0,0,0.05)
--shadow-md: 0 4px 6px rgba(0,0,0,0.07)
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1)
--shadow-xl: 0 20px 25px rgba(0,0,0,0.1)
```

## Dark Mode

When dark mode is required, define a parallel set of semantic tokens that switch based on the color scheme:

```css
:root {
  --bg-primary: var(--color-neutral-50);
  --bg-card: white;
  --text-primary: var(--color-neutral-900);
  --text-secondary: var(--color-neutral-700);
  --border-default: var(--color-neutral-200);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: var(--color-neutral-900);
    --bg-card: var(--color-neutral-800);
    --text-primary: var(--color-neutral-50);
    --text-secondary: var(--color-neutral-400);
    --border-default: var(--color-neutral-700);
  }
}
```

Use semantic tokens (`--bg-primary`, `--text-primary`) in components, not raw color tokens. This makes dark mode automatic.

## Base Components

Define the standard appearance and behavior for every common component:

**Buttons:**
- Variants: Primary (solid fill), Secondary (subtle fill), Outline (border only), Ghost (no border), Destructive (red/danger)
- Sizes: sm (28px height), md (36px height), lg (44px height)
- States: default, hover, active, focused, disabled, loading
- Loading state replaces label with spinner, disables interaction

**Form elements:**
- All inputs: border, focus ring, error state (red border + error message below), disabled state (reduced opacity)
- Labels: always visible (never placeholder-only), required indicator (asterisk or "(required)")
- Help text: below input, muted color, explains what the field expects
- Error messages: below input, error color, describes what went wrong and how to fix it

**Cards:**
- Default: white/card background, subtle shadow or border, rounded corners
- Interactive: hover state (shadow increase or border color change), cursor pointer
- Header/footer sections: visually separated, structured content areas

**Feedback:**
- Toast notifications: temporary, non-blocking, auto-dismiss (with manual dismiss option)
- Alert banners: persistent until dismissed, full-width or contained within a section
- Empty states: illustration or icon, explanatory text, call-to-action button
- Loading: skeleton loaders (preferred over spinners for content areas), spinner for actions

**Navigation:**
- Header/navbar with primary actions and user menu
- Sidebar for complex applications with many sections
- Breadcrumbs for deep navigation hierarchies
- Tabs for switching between related content views
- Pagination for long lists and tables

**Data display:**
- Tables with sortable columns, row hover, and responsive behavior
- Lists with consistent item spacing and interactive states
- Badges/tags for status indicators and categories
- Avatars with fallback initials when no image exists
- Stats/metrics with label, value, and optional trend indicator

## Pattern Library

Document recurring UI patterns with implementation guidance:

- **Search with autocomplete:** Debounced input, dropdown results, keyboard navigation, "no results" state
- **Confirmation dialogs:** Before destructive actions, clearly state what will happen, "Cancel" as primary action (preventing accidents)
- **Inline editing:** Click to edit, Enter to save, Escape to cancel, loading indicator during save
- **Bulk actions:** Select all, individual select, action toolbar appears when items selected
- **Wizard/stepper:** Progress indicator, back/next navigation, save progress between steps

## Common Pitfalls

**Inconsistent spacing and typography.** Five different font sizes that are all "kind of like body text." Spacing that varies randomly between 12px and 17px with no system. Fix: define a spacing scale and type scale in the design system. Only use values from the scale.

**Placeholder text as labels.** Using placeholder text instead of labels for form fields. Placeholders disappear when the user starts typing, leaving them with no indication of what the field expects. Fix: always use visible labels. Placeholders are supplementary hints, not replacements for labels.

**Ignoring touch targets on mobile.** Tiny links and buttons that require precise finger tapping. Fix: ensure all interactive elements meet minimum 44x44px touch target size on mobile.
