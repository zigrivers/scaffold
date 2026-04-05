---
name: game-ui-spec
description: Specify HUD, menus, controller navigation, settings, FTUE, and UI state machines for games
summary: "Replaces design-system and ux-spec for game projects. Covers UI visual tokens, HUD, menu hierarchy, controller navigation, settings screens, FTUE/tutorial, UI state machines, and responsive behavior."
phase: "specification"
order: 863
dependencies: [game-accessibility, input-controls-spec, system-architecture]
outputs: [docs/game-ui-spec.md]
conditional: null
reads: [game-design-document, economy-design, netcode-spec]
knowledge-base: [game-ui-patterns, game-accessibility]
---

## Purpose
Define the complete game UI specification, replacing both design-system and
ux-spec for game projects. Traditional design systems focus on web/app
component libraries; games need HUD elements, menu hierarchies with
controller navigation, settings screens covering gameplay/audio/video/
accessibility/controls, first-time user experience (FTUE) and tutorial flows,
and UI state machines that respond to gameplay state transitions.

This step covers: UI visual tokens (color palette, typography, iconography),
HUD layout and information hierarchy, menu structure and navigation flow,
controller and keyboard navigation patterns, settings screen categories and
options, FTUE/tutorial design, UI state machines, and responsive behavior
across target resolutions.

**Note on forward-reads**: `economy-design` is listed as an optional read.
On first generation it may not exist yet — in that case, define placeholder
UI regions for economy-related elements (store, currency display, inventory
value) and mark them with `<!-- pending: economy-design -->` for a future
update pass. When economy-design becomes available, these placeholders are
filled in during update mode.

## Inputs
- docs/game-design.md (required) — mechanics, core loop, game modes informing HUD and menu needs
- docs/game-accessibility.md (required) — accessibility requirements for UI elements
- docs/input-controls-spec.md (required) — input devices and navigation patterns
- docs/system-architecture.md (required) — frontend architecture and rendering pipeline
- docs/economy-design.md (optional, forward-read) — monetization and economy UI needs
- docs/netcode-spec.md (optional, forward-read) — multiplayer UI states (lobby, matchmaking, connection status)

## Expected Outputs
- docs/game-ui-spec.md — complete game UI specification with visual tokens,
  HUD, menus, navigation, settings, FTUE, state machines, and responsive
  behavior

## Quality Criteria
- (mvp) UI visual tokens defined: color palette (with colorblind-safe variants), typography scale, icon set conventions
- (mvp) HUD layout documented with information hierarchy — critical info (health, ammo) vs contextual info (objectives, minimap) vs ambient info (score, timer)
- (mvp) Menu hierarchy defined: main menu, pause menu, settings, and all submenus with navigation flow
- (mvp) Controller navigation specified for every menu screen — focus order, wrap behavior, shortcut buttons
- (mvp) Settings categories defined: gameplay, video, audio, controls, accessibility (minimum)
- (mvp) FTUE/tutorial flow documented — what is taught, when, and how (contextual prompts vs dedicated tutorial)
- (deep) UI state machines defined for each major UI context (HUD, pause, inventory, store, multiplayer lobby)
- (deep) Responsive behavior documented per target resolution (TV/monitor distances, handheld, mobile)
- (deep) Platform shell integration specified (console system UI overlays, achievement popups, friend invites)
- (deep) Localization requirements: text expansion buffers, RTL layout support, font fallback chains
- (deep) UI performance budgets: draw call limits for UI layer, texture atlas strategy, UI update frequency

## Methodology Scaling
- **deep**: Full game UI specification with visual token system, detailed HUD
  wireframe descriptions, complete menu hierarchy with controller navigation
  maps, comprehensive settings screens, FTUE flow with branching for player
  experience level, UI state machines for all contexts, responsive behavior
  matrix, platform shell integration, localization plan, and UI performance
  budgets. 20-35 pages.
- **mvp**: Visual tokens, HUD layout, menu hierarchy, basic controller
  navigation, and settings categories. 5-8 pages.
- **custom:depth(1-5)**:
  - Depth 1: HUD information hierarchy and main menu structure only.
  - Depth 2: add visual tokens, settings categories, and basic controller navigation.
  - Depth 3: add FTUE flow, pause menu, all submenu screens, and responsive behavior per resolution.
  - Depth 4: add UI state machines, platform shell integration, localization requirements, and economy UI regions.
  - Depth 5: full specification with UI performance budgets, accessibility audit of every screen, animation/transition specs for UI, and multiplayer lobby UI flows.

## Mode Detection
Check for docs/game-ui-spec.md. If it exists, operate in update mode: read
existing spec and diff against current GDD, accessibility plan, and input
spec. Preserve existing HUD layout, menu hierarchy, and visual tokens.
Update or add UI elements for new mechanics, new settings options for new
accessibility features, and economy UI placeholders when economy-design
becomes available.

## Update Mode Specifics
- **Detect prior artifact**: docs/game-ui-spec.md exists
- **Preserve**: existing visual tokens, HUD layout, menu hierarchy, controller
  navigation patterns, FTUE flow, UI state machines
- **Triggers for update**: GDD added new mechanics requiring HUD elements or
  new menus, accessibility plan added new requirements, input-controls-spec
  changed navigation patterns, economy-design created (fill placeholder
  regions), netcode-spec created (add multiplayer UI states), system
  architecture changed rendering pipeline
- **Conflict resolution**: if a new HUD element competes for screen space
  with an existing element, document the conflict with information hierarchy
  analysis and propose resolution (overlay, toggle, contextual show/hide);
  never silently remove HUD elements that players rely on for gameplay
