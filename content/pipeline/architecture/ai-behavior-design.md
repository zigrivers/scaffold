---
name: ai-behavior-design
description: Design NPC AI architecture, pathfinding, perception systems, and difficulty scaling
summary: "Documents AI architecture (behavior trees, GOAP, utility AI, state machines), pathfinding strategy, perception systems, difficulty scaling, and companion AI behavior."
phase: "architecture"
order: 717
dependencies: [system-architecture, game-design-document]
outputs: [docs/ai-behavior-design.md]
conditional: "if-needed"
reads: [performance-budgets]
knowledge-base: [game-ai-patterns]
---

## Purpose
Design the game AI architecture covering NPC behavior systems, pathfinding,
perception, difficulty scaling, and companion/ally AI. Selects and documents
the appropriate AI pattern (behavior trees, GOAP, utility AI, finite state
machines, or hybrids) based on the game's complexity requirements and
performance budgets. This specification drives the implementation of all
non-player character behavior in the game.

## Conditional Evaluation
Enable when: the GDD or project config specifies `npcAiComplexity` as `simple`
or `complex`. Simple AI projects produce basic behavior specifications (patrol
patterns, trigger responses, state machines). Complex AI projects produce full
behavior tree/GOAP specifications with perception systems and difficulty scaling.

Skip when: the GDD or project config specifies `npcAiComplexity: none` — the
game has no AI-controlled entities (e.g., pure PvP multiplayer, puzzle games
with no NPCs, rhythm games, visual novels without AI opponents).

## Inputs
- docs/system-architecture.md (required) — component boundaries and update loop architecture
- docs/game-design.md (required) — NPC roles, enemy types, companion behavior requirements
- docs/performance-budgets.md (required) — CPU budget for AI systems, entity count targets
- docs/domain-models/ (required) — entity definitions for AI-controlled characters

## Expected Outputs
- docs/ai-behavior-design.md — AI architecture selection, behavior specifications,
  pathfinding strategy, perception systems, difficulty scaling, and performance
  constraints

## Quality Criteria
- (mvp) AI architecture pattern selected and justified (behavior trees, GOAP, utility AI, FSM, or hybrid)
- (mvp) Every NPC role from the GDD has a behavior specification
- (mvp) Pathfinding strategy selected (A*, navmesh, flow fields) with rationale for game type
- (mvp) AI CPU budget allocated within performance budget constraints
- (deep) Perception system designed (sight cones, hearing radius, awareness states, stealth interaction)
- (deep) Difficulty scaling strategy documented (parameter tuning, behavior variant selection, rubber banding)
- (deep) Companion/ally AI behavior specified (follow, assist, independent action, player communication)
- (deep) AI debugging and visualization tools specified (behavior tree inspector, navmesh overlay, perception cones)
- (deep) Edge cases documented (stuck detection, recovery behaviors, group coordination, spawn/despawn transitions)

## Methodology Scaling
- **deep**: Full AI design with architecture selection rationale, per-role
  behavior specifications, pathfinding with navmesh generation strategy,
  perception system design, difficulty scaling curves, companion AI,
  debugging tools, and edge case handling. 15-25 pages.
- **mvp**: Architecture pattern selection, key NPC behavior summaries,
  pathfinding choice, and AI budget allocation. 3-5 pages.
- **custom:depth(1-5)**:
  - Depth 1: AI pattern selection and one-line behavior summary per NPC role.
  - Depth 2: add pathfinding strategy and AI budget allocation.
  - Depth 3: add per-role behavior specifications and perception system overview.
  - Depth 4: add difficulty scaling, companion AI, and edge case handling.
  - Depth 5: full specification with debugging tools, group coordination, and performance profiling plan.

## Mode Detection
Check for docs/ai-behavior-design.md. If it exists, operate in update mode:
read existing design and diff against current GDD NPC requirements and
performance budgets. Preserve established AI architecture decisions and
pathfinding choices. Add behavior specs for new NPC roles. Update budgets
if performance constraints changed. Never switch AI architecture pattern
without explicit user approval.

## Update Mode Specifics
- **Detect prior artifact**: docs/ai-behavior-design.md exists
- **Preserve**: AI architecture pattern, pathfinding strategy, perception
  system design, existing NPC behavior specifications, difficulty scaling
  approach
- **Triggers for update**: GDD added new NPC roles or enemy types, performance
  budgets revised AI CPU allocation, system architecture changed update loop,
  new companion mechanics introduced
- **Conflict resolution**: if new NPC requirements exceed the AI CPU budget,
  flag the budget conflict with options (optimize existing behaviors, increase
  budget, reduce NPC count); present to user rather than silently degrading
  existing behaviors
