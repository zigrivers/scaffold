---
name: ux-spec
description: Specify user flows, interaction states, component architecture, accessibility, and responsive behavior
summary: "Maps out every user flow with all interaction states (loading, error, empty, populated), defines accessibility requirements (WCAG level, keyboard nav), and specifies responsive behavior at each breakpoint."
phase: "specification"
order: 850
dependencies: [review-architecture]
outputs: [docs/ux-spec.md]
conditional: "if-needed"
reads: [api-contracts, design-system]
knowledge-base: [ux-specification]
---

## Purpose
Define the user experience specification: user flows, interaction state machines,
component architecture (hierarchy and data flow), accessibility requirements, and
responsive behavior. This is the interaction and behavior blueprint for the frontend.
Visual tokens and component appearance are defined in `docs/design-system.md` — this
step consumes those tokens, it does not redefine them.

## Inputs
- docs/plan.md (required) — user requirements and personas
- docs/system-architecture.md (required) — frontend architecture
- docs/api-contracts.md (optional) — data shapes for UI components
- docs/user-stories.md (required) — user journeys driving flow design
- docs/design-system.md (optional) — design tokens and component visual specs to reference

## Expected Outputs
- docs/ux-spec.md — UX specification with flows, components, design system

## Quality Criteria
- (mvp) Every user story's acceptance criteria maps to >= 1 documented flow
- (mvp) If design-system.md does not exist, use framework defaults for spacing, typography, and color
- (mvp) Component hierarchy covers all UI states (loading, error, empty, populated)
- (mvp) References design tokens from docs/design-system.md (does not redefine them)
- (deep) Accessibility requirements documented (WCAG level, keyboard nav, screen readers)
- (deep) Responsive breakpoints defined with layout behavior per breakpoint
- (mvp) Error states documented for every user action that can fail
- (deep) All documented user flows verified at responsive breakpoints (mobile, tablet, desktop) with behavior differences noted

## Methodology Scaling
- **deep**: Full UX specification. Detailed wireframes described in prose.
  Complete design system. Interaction state machines. Accessibility audit
  checklist. Animation and transition specs.
- **mvp**: Key user flows. Core component list. Basic design tokens.
- **custom:depth(1-5)**: Depth 1: key user flows with primary states (success
  and error). Depth 2: user flows with core component list and basic state
  documentation. Depth 3: add design system token references, interaction state
  machines, and responsive behavior. Depth 4: full specification with
  accessibility audit, keyboard navigation, and screen reader considerations.
  Depth 5: full specification with animation/transition specs, comprehensive
  WCAG compliance checklist, and detailed wireframe descriptions.

## Mode Detection
Check for docs/ux-spec.md. If it exists, operate in update mode: read existing
flows and component hierarchy, diff against updated user stories and system
architecture. Preserve existing interaction patterns, state machines, and
component data flow definitions. Add new flows for new user stories or features.
Update component hierarchy if architecture changed frontend structure. Never
remove documented accessibility requirements.

## Update Mode Specifics
- **Detect prior artifact**: docs/ux-spec.md exists
- **Preserve**: existing user flows, interaction state machines, component
  hierarchy, accessibility requirements, responsive breakpoint definitions
- **Triggers for update**: user stories added or changed, architecture changed
  frontend components, design system tokens updated, API contracts changed
  data shapes available to UI
- **Conflict resolution**: if a user story was rewritten, update its flow
  in-place rather than creating a duplicate; reconcile component hierarchy
  changes with existing state machine definitions
