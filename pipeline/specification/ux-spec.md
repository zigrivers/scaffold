---
name: ux-spec
description: Specify UI/UX design including design system
phase: "specification"
order: 17
dependencies: [review-architecture]
outputs: [docs/ux-spec.md]
conditional: "if-needed"
knowledge-base: [ux-specification]
---

## Purpose
Define the user experience specification: user flows, wireframes, component
hierarchy, interaction patterns, and design system (tokens, components, patterns).
This is the visual and interaction blueprint for the frontend.

## Inputs
- docs/prd.md (required) — user requirements and personas
- docs/system-architecture.md (required) — frontend architecture
- docs/api-contracts.md (optional) — data shapes for UI components
- docs/user-stories.md (required) — user journeys driving flow design

## Expected Outputs
- docs/ux-spec.md — UX specification with flows, components, design system

## Quality Criteria
- Every PRD user journey has a corresponding flow
- Component hierarchy covers all UI states (loading, error, empty, populated)
- Design system defines tokens (colors, spacing, typography) and base components
- Accessibility requirements documented (WCAG level, keyboard nav, screen readers)
- Responsive breakpoints defined with behavior per breakpoint
- Error states documented for every user action that can fail

## Methodology Scaling
- **deep**: Full UX specification. Detailed wireframes described in prose.
  Complete design system. Interaction state machines. Accessibility audit
  checklist. Animation and transition specs.
- **mvp**: Key user flows. Core component list. Basic design tokens.
- **custom:depth(1-5)**: Depth 1-2: flows and components. Depth 3: add design
  system. Depth 4-5: full specification with accessibility.

## Mode Detection
Update mode if spec exists.
