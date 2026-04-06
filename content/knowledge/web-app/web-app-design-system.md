---
name: web-app-design-system
description: Responsive token systems, dark/light mode, component library patterns, and CSS methodology selection for web applications
topics: [web-app, design-system, css, tokens, dark-mode, responsive]
---

A design system is the contract between design and engineering. Without one, components drift, spacing is inconsistent, and every engineer makes independent decisions about color, typography, and layout. A well-structured token system makes that contract explicit, machine-enforceable, and refactorable — changing a spacing scale or switching a brand color becomes a one-line edit rather than a codebase-wide search-and-replace.

## Summary

### Token Architecture

Design tokens are the atoms of a design system. They encode decisions — not values — at three tiers:

1. **Primitive tokens** — Raw values with no semantic meaning: `--color-blue-500: #3b82f6`, `--spacing-4: 16px`, `--font-size-lg: 1.125rem`. Never use primitive tokens directly in components.

2. **Semantic tokens** — Intent-based aliases of primitives: `--color-interactive: var(--color-blue-500)`, `--space-component-padding: var(--spacing-4)`. Components consume semantic tokens.

3. **Component tokens** — Component-scoped overrides: `--button-background: var(--color-interactive)`. Allows per-component theming without touching semantic tokens.

Spacing, typography, and breakpoints belong in this hierarchy. A spacing scale (4/8/12/16/24/32/48/64px) enforced via tokens prevents the "just add a margin-top: 11px" habit that destroys visual rhythm.

### Dark/Light Mode

Use CSS custom properties with `prefers-color-scheme` and an explicit `data-theme` attribute override:

```css
/* Primitive layer */
:root {
  --color-neutral-0: #ffffff;
  --color-neutral-900: #111827;
}

/* Semantic layer — light mode defaults */
:root {
  --color-surface: var(--color-neutral-0);
  --color-text-primary: var(--color-neutral-900);
}

/* Dark mode via media query */
@media (prefers-color-scheme: dark) {
  :root {
    --color-surface: var(--color-neutral-900);
    --color-text-primary: var(--color-neutral-0);
  }
}

/* Manual override via JS toggle */
[data-theme="dark"] {
  --color-surface: var(--color-neutral-900);
  --color-text-primary: var(--color-neutral-0);
}
```

Always support both mechanisms: `prefers-color-scheme` for first-visit experience, `data-theme` for user preference stored in `localStorage`.

### CSS Methodology Selection

| Approach | Best For | Trade-offs |
|---|---|---|
| Utility-first (Tailwind) | Rapid iteration, small teams, consistent constraints | Verbose JSX, limited custom design expression |
| CSS Modules | Scoped styles with full CSS power, no runtime cost | Manual naming, no global token enforcement |
| CSS-in-JS (Emotion, styled-components) | Dynamic theming, colocation, TypeScript safety | Runtime cost, hydration complexity in SSR |
| Zero-runtime (Vanilla Extract, Linaria) | SSR-safe, type-safe tokens, no runtime overhead | Build-time complexity, less dynamic |

For most production web apps, the recommendation is: **Tailwind + CSS custom properties** for utility-heavy UIs, or **CSS Modules + tokens** for design-system-first projects where designers own the token layer.

### Responsive Breakpoints

Commit to a consistent breakpoint scale and never deviate:

```css
/* Mobile-first breakpoints */
--bp-sm: 640px;   /* Large phones */
--bp-md: 768px;   /* Tablets */
--bp-lg: 1024px;  /* Small desktops */
--bp-xl: 1280px;  /* Large desktops */
--bp-2xl: 1536px; /* Wide screens */
```

Use `min-width` queries exclusively (mobile-first). Avoid magic numbers in media queries — always reference the token scale.

## Deep Guidance

### Component Library Patterns

A component library is the implementation layer of the design system. Key architectural decisions:

**Compound components over prop explosion:**

```tsx
// BAD: Props explode as requirements grow
<Select
  label="Country"
  options={countries}
  placeholder="Select..."
  isSearchable
  isClearable
  isMulti
  maxSelectedItems={3}
/>

// GOOD: Compound pattern — composable, extensible
<Select value={value} onChange={setValue}>
  <Select.Trigger>
    <Select.Value placeholder="Select country..." />
  </Select.Trigger>
  <Select.Content>
    <Select.Search />
    {countries.map(c => (
      <Select.Item key={c.code} value={c.code}>{c.name}</Select.Item>
    ))}
  </Select.Content>
</Select>
```

**Headless components for styling flexibility:**
Use Radix UI, Headless UI, or React Aria as the unstyled behavior layer. Wire your token system on top. This gives accessible keyboard navigation and ARIA semantics for free while preserving full visual control.

**Token enforcement via linting:**
Use `stylelint-no-invalid-hex` and custom Stylelint rules (or ESLint for CSS-in-JS) to reject hardcoded color values not referencing a token. Automate this in CI.

### Typography Scale

Build a modular type scale with explicit roles:

```css
:root {
  /* Scale steps — use a modular scale ratio (1.25 or 1.333) */
  --text-xs: 0.75rem;    /* 12px — labels, captions */
  --text-sm: 0.875rem;   /* 14px — body secondary */
  --text-base: 1rem;     /* 16px — body primary */
  --text-lg: 1.125rem;   /* 18px — subheadings */
  --text-xl: 1.25rem;    /* 20px — section headings */
  --text-2xl: 1.5rem;    /* 24px — page headings */
  --text-3xl: 1.875rem;  /* 30px — hero headings */

  /* Line heights tied to text size for proper vertical rhythm */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
}
```

Never use pixel values for font sizes in component code — only reference scale tokens. This ensures user font size preferences (browser zoom, accessibility settings) are respected.

### Design Token Pipeline

For teams with a Figma design system, automate the token pipeline:

1. Designers export tokens from Figma using the Tokens Studio plugin as a JSON file
2. CI runs a token transformer (Style Dictionary) that converts JSON to CSS custom properties, TypeScript constants, and platform-specific formats
3. The generated files are committed to the repository and reviewed in PRs
4. Token changes are flagged in design review before code review

This makes "design changed the brand blue" a designer-owned PR rather than an engineering ticket.
