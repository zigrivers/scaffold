---
name: design-system
description: Create a cohesive design system with tokens and component patterns for frontend
phase: "environment"
order: 51
dependencies: [dev-env-setup]
outputs: [docs/design-system.md]
conditional: "if-needed"
knowledge-base: [ux-specification]
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
- All colors meet WCAG AA contrast requirements
- Typography scale is consistent and readable
- Spacing uses a consistent base unit (e.g., 4px increments)
- Component patterns cover buttons, forms, cards, feedback, navigation, data display
- Theme configuration files actually work (verified by running dev server)
- Both light and dark mode token values provided (if dark mode requested)
- Responsive breakpoints defined (mobile, tablet, desktop)
- No arbitrary hex values or pixel values in component examples (all use tokens)

## Methodology Scaling
- **deep**: Full design system with all component categories, dark mode support,
  responsive breakpoints, animation guidelines, accessibility audit, and example
  page demonstrating all patterns. 15-20 pages.
- **mvp**: Color palette, typography, spacing scale, and button/form/card patterns.
  No dark mode. Basic theme config. 3-5 pages.
- **custom:depth(1-5)**: Depth 1-2: colors + typography + buttons. Depth 3: add
  forms, cards, spacing. Depth 4: add navigation, data display, layout. Depth 5:
  full suite with dark mode and accessibility.

## Mode Detection
Update mode if docs/design-system.md exists. In update mode: never change color
values, font families, or spacing scales without user approval. Preserve all
theme config file customizations.
