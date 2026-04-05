---
name: input-controls-spec
description: Specify input bindings, rebinding, haptics, dead zones, and cross-play input fairness
summary: "Documents default bindings per device, input abstraction layer, rebinding system, dead zones, aim assist, haptics, controller disconnect behavior, and accessibility input requirements."
phase: "specification"
order: 862
dependencies: [game-design-document, game-accessibility]
outputs: [docs/input-controls-spec.md]
conditional: null
reads: []
knowledge-base: [game-input-systems, game-vr-ar-design]
---

## Purpose
Specify the complete input system for the game: default bindings per input
device (keyboard/mouse, gamepad, touch, motion), the input abstraction layer
that maps physical inputs to gameplay actions, the rebinding and
customization system, analog tuning (dead zones, sensitivity curves, aim
assist), haptic feedback design, controller disconnect behavior, and
accessibility-driven input requirements from the accessibility plan.

This step bridges the GDD's gameplay mechanics and the accessibility plan
into a concrete input specification that implementation can build directly
from. Every mechanic in the GDD should trace to at least one input action
documented here.

## Inputs
- docs/game-design.md (required) — mechanics and interaction verbs requiring input bindings
- docs/game-accessibility.md (required) — remappable controls requirements, motor accessibility needs
- docs/plan.md (required) — target platforms and supported input devices
- docs/performance-budgets.md (optional) — input latency budgets

## Expected Outputs
- docs/input-controls-spec.md — input bindings, abstraction layer, rebinding
  system, analog tuning, haptics, disconnect behavior, and accessibility
  input requirements

## Quality Criteria
- (mvp) Default binding table per supported input device (keyboard/mouse, gamepad, touch) with every GDD mechanic mapped to an input action
- (mvp) Input abstraction layer defined — actions are named semantically (e.g., "jump", "interact") not by physical key
- (mvp) Rebinding system requirements specified per accessibility plan
- (mvp) Controller disconnect behavior defined (pause, AI takeover, timeout)
- (deep) Dead zone and sensitivity curve specifications per analog input (stick, trigger)
- (deep) Aim assist parameters documented (magnetism strength, slowdown radius, snap-to-target rules) with per-input-device tuning
- (deep) Haptic feedback map: gameplay events to vibration patterns (intensity, duration, motor selection)
- (deep) Cross-play input fairness: input-based matchmaking rules, aim assist parity between input types
- (deep) Simultaneous input handling documented (keyboard + mouse + gamepad hot-switching)

## Methodology Scaling
- **deep**: Full input specification with binding tables per device, abstraction
  layer architecture, rebinding UI wireframe descriptions, dead zone curves,
  aim assist tuning parameters, haptic feedback map, cross-play fairness
  rules, accessibility input matrix, and input latency budget. 10-20 pages.
- **mvp**: Default bindings per device, action abstraction layer, rebinding
  support flag, and controller disconnect behavior. 3-5 pages.
- **custom:depth(1-5)**:
  - Depth 1: action list with default keyboard/mouse and gamepad bindings only.
  - Depth 2: add input abstraction layer design and rebinding requirements.
  - Depth 3: add dead zones, sensitivity curves, controller disconnect behavior, and touch bindings.
  - Depth 4: add aim assist parameters, haptic feedback map, and cross-play input fairness rules.
  - Depth 5: full specification with input latency budgets, simultaneous input hot-switching, accessibility input matrix, and platform certification input requirements.

## Mode Detection
Check for docs/input-controls-spec.md. If it exists, operate in update mode:
read existing bindings and diff against current GDD mechanics. New mechanics
may require new input actions. Preserve existing binding defaults and player
muscle memory conventions. Add bindings for new mechanics without disrupting
established controls.

## Update Mode Specifics
- **Detect prior artifact**: docs/input-controls-spec.md exists
- **Preserve**: existing default bindings, dead zone values, aim assist
  tuning, haptic patterns, rebinding system design
- **Triggers for update**: GDD added new mechanics requiring new input
  actions, accessibility plan updated motor requirements, target platforms
  changed (new input devices), performance budgets revised input latency
  targets
- **Conflict resolution**: if a new mechanic's ideal binding conflicts with
  an existing binding, document both the conflict and recommended resolution
  (rebind the new action, not the established one); never silently reassign
  bindings that players may have committed to muscle memory
