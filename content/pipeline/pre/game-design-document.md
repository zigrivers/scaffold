---
name: game-design-document
description: Create game design document with pillars, core loop, mechanics, progression, and world overview
summary: "Transforms PRD product requirements into a game design bible covering game pillars, core gameplay loop, mechanics catalog, progression systems, and game world overview. Review step validates pillar coherence and mechanic clarity."
phase: "pre"
order: 115
dependencies: [review-prd]
outputs: [docs/game-design.md]
conditional: null
reads: [create-vision, create-prd]
knowledge-base: [game-design-document, game-milestone-definitions, game-domain-patterns, game-engine-selection, game-project-structure]
---

## Purpose
Transform the PRD into a Game Design Document (GDD) that defines the game's
identity through design pillars, core gameplay loop, mechanics catalog,
progression systems, and game world overview. The GDD is the authoritative
source of truth for what the game is, how it plays, and why its systems exist.
This step focuses on gameplay systems — art direction, audio design, and
narrative detail are covered by separate downstream steps.

## Inputs
- docs/plan.md (required) — PRD with features, personas, and requirements
- docs/vision.md (optional) — vision document for strategic alignment
- docs/user-stories.md (optional) — user stories for behavioral context

## Expected Outputs
- docs/game-design.md — Game design document covering pillars, core loop,
  mechanics, progression, and world overview

## Quality Criteria
- (mvp) Game pillars are phrased as "X over Y" tradeoffs that constrain decisions — each pillar excludes at least one plausible mechanic
- (mvp) Core loop is closed: engage -> challenge -> reward -> repeat with no dead ends where the player has nothing meaningful to do next
- (mvp) Every mechanic is documented with inputs, rules, outputs, and feedback — precise enough for an engineer to implement without guessing
- (mvp) Game modes and win/fail states are defined
- (mvp) Camera model is documented (perspective, movement constraints, zoom range)
- (deep) Mechanics include numeric ranges, state transitions, and edge cases
- (deep) Progression systems define XP/level curves or equivalent with explicit formulas
- (deep) Achievements/trophies schema is present with unlock conditions
- (deep) Competitive analysis references specific titles and structural differentiation

## Methodology Scaling
- **deep**: Full GDD bible. Design pillars with exclusion rationale, multi-tier
  core loop (moment-to-moment, session, metagame), complete mechanics catalog
  with numeric specifications, progression curves with formulas, world overview,
  game modes, competitive analysis, achievements schema. 20-40 pages.
- **mvp**: Pillars + core loop + key mechanics. Enough to start prototyping.
  2-3 pages.
- **custom:depth(1-5)**:
  - Depth 1: Pillars and core loop only. 1-2 pages. Enough to validate the game concept.
  - Depth 2: Pillars, core loop, and key mechanics with inputs/rules/outputs. 2-3 pages.
  - Depth 3: Add progression systems, world overview, game modes, win/fail states, camera model. 5-10 pages.
  - Depth 4: Full mechanics catalog with numeric specs, competitive analysis with named titles, achievements schema, multi-model review of pillar coherence. 15-25 pages.
  - Depth 5: Complete GDD bible — all of depth 4 plus systems interaction matrix, difficulty scaling formulas, content volume estimates, and separate reference files for complex subsystems. 25-40 pages.

## Mode Detection
If docs/game-design.md exists, operate in update mode: read existing content,
identify what has changed or been learned since it was written, propose targeted
updates. Preserve existing design pillars and mechanic definitions unless
explicitly revisiting them.

## Update Mode Specifics
- **Detect prior artifact**: docs/game-design.md exists
- **Preserve**: design pillars, existing mechanic definitions, core loop
  structure, progression formulas, and enhancement markers
  (`<!-- enhancement: ... -->`) unless user explicitly requests changes
- **Triggers for update**: PRD features added or changed, playtest feedback
  received, scope adjustment requested, new mechanics needed for user stories
- **Conflict resolution**: new mechanics are appended to the catalog with clear
  versioning; changed mechanics document the rationale for change and impact on
  dependent systems

### Understand the Design Context

**If `docs/vision.md` exists**: Read it completely. The vision establishes the
player experience, target audience, and guiding principles. Ensure every pillar
and mechanic aligns with the stated vision. Reference the vision when making
tradeoff decisions.

**If `docs/plan.md` exists**: Read it completely. The PRD defines features,
personas, and requirements. Every PRD feature should trace to at least one
mechanic in the GDD. Personas inform the target player profile and skill
assumptions.

**Discovery questions** (ask if context is insufficient):
- What is the core fantasy — what does the player get to be or do that they cannot in real life?
- What is the primary interaction verb (shoot, build, solve, explore, manage)?
- What makes a play session feel complete — what is the natural stopping point?
- What existing games are closest to your vision, and where does this game diverge?
