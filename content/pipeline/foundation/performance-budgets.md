---
name: performance-budgets
description: Define frame budgets, memory budgets, GPU budgets, and platform-specific performance targets
summary: "Establishes per-system frame time allocations, per-platform memory budgets, GPU/draw call limits, loading time targets, and thermal constraints. Every budget has a measurement method and alert threshold."
phase: "foundation"
order: 225
dependencies: [review-gdd, tech-stack]
outputs: [docs/performance-budgets.md]
conditional: null
reads: [game-design-document]
knowledge-base: [game-performance-budgeting]
---

## Purpose
Define concrete, measurable performance budgets for every target platform. This
covers frame time budgets (per-system millisecond allocations within the target
frame rate), memory budgets (per platform), GPU and draw call budgets, loading
time targets, storage size targets, bandwidth budgets (for online titles),
thermal and battery constraints (for mobile), and VR-specific targets (90 fps,
stereo rendering overhead, motion-to-photon latency). Each budget entry includes
the system, its allocation, rationale, measurement method, and alert threshold
so that performance regressions are caught automatically.

## Inputs
- docs/game-design-document.md (required) — core systems, target platforms,
  visual fidelity targets, multiplayer scope
- docs/tech-stack.md (required) — engine, renderer, target hardware, platform
  SDK constraints
- User preferences (gathered via questions) — target frame rate, minimum spec
  hardware, acceptable loading times, network conditions

## Expected Outputs
- docs/performance-budgets.md — complete performance budget reference containing:
  - Target frame rate and per-system frame time breakdown table
  - Per-platform memory budget tables (RAM, VRAM, texture streaming)
  - GPU budget (draw calls, triangle counts, shader complexity)
  - Loading time targets (initial load, level transitions, fast travel)
  - Storage size targets per platform
  - Bandwidth budgets (if online: tick rate, packet size, sync model)
  - Thermal and battery budgets (if mobile/handheld)
  - VR-specific budgets (if applicable: 90 fps, stereo rendering, motion-to-photon)
  - Hitch and stutter budget (maximum frame time spikes, frequency)
  - Measurement methods and profiling tool recommendations
  - Alert thresholds for CI performance regression detection

## Quality Criteria
- (mvp) Target frame rate explicitly defined for each target platform
- (mvp) Per-system frame time breakdown sums to at most the frame budget (e.g., 16.6 ms at 60 fps)
- (mvp) Memory budget defined for every target platform
- (mvp) Hitch/stutter budget defined (max spike duration, acceptable frequency)
- (mvp) Every budget entry has a measurement method (tool, metric, command)
- (mvp) Every budget entry has an alert threshold (the number that triggers investigation)
- (deep) GPU budget with draw call and triangle count limits per scene type
- (deep) Loading time targets for every transition type
- (deep) Storage and bandwidth budgets where applicable
- (deep) Thermal/battery constraints for mobile platforms
- (deep) VR budgets with motion-to-photon latency target (if VR platform)
- (deep) CI integration plan for automated performance regression detection

## Methodology Scaling
- **deep**: Full per-system breakdown across all target platforms. Per-platform
  matrices for memory, GPU, loading, storage, and bandwidth. Profiling tool
  recommendations with CI performance regression pipeline. Thermal and VR
  budgets where applicable. 8-15 pages with concrete tables.
- **mvp**: Target frame rate and top-level memory budget per platform. Frame
  time breakdown for the 3-5 most expensive systems. Hitch budget. Concrete
  tables, not prose. 2-4 pages.
- **custom:depth(1-5)**:
  - Depth 1: Target frame rate + total memory budget per platform. Single summary table. 1 page.
  - Depth 2: Depth 1 + per-system frame time breakdown for top 3-5 systems + hitch budget. Concrete tables. 2-3 pages.
  - Depth 3: Full per-system frame time breakdown + GPU budget (draw calls, triangles) + loading time targets. 4-6 pages.
  - Depth 4: Per-platform matrices for all budget categories + profiling tool recommendations + CI perf regression thresholds. 6-10 pages.
  - Depth 5: Full budget suite including thermal/battery, VR, bandwidth. CI pipeline config. Per-scene-type budgets. Profiling tool integration guides. 10-15 pages.

## Mode Detection
Update mode if docs/performance-budgets.md exists. In update mode: preserve
existing budget allocations unless the user explicitly requests changes, add new
budget categories without removing existing ones, update measurement methods if
tooling changed.

## Update Mode Specifics
- **Detect prior artifact**: docs/performance-budgets.md exists
- **Preserve**: all existing budget allocations, per-system breakdowns,
  measurement methods, alert thresholds, CI integration configuration
- **Triggers for update**: new target platform added, GDD scope change
  affecting system count or complexity, tech stack change (new engine/renderer),
  profiling revealed original budgets were infeasible, new system added
  (e.g., adding multiplayer introduces bandwidth budgets)
- **Conflict resolution**: if a new system pushes the frame time total over
  budget, document the overage and propose rebalancing options with trade-off
  analysis — never silently reduce another system's allocation
