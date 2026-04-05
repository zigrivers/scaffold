---
name: content-structure-design
description: Design level layouts, world regions, procedural rulesets, or mission structures based on content type
summary: "Adapts output based on content structure trait: discrete levels, open-world regions, procedural generation rulesets, endless escalation bands, or mission templates. Always enabled for games."
phase: "specification"
order: 865
dependencies: [game-design-document, system-architecture]
outputs: [docs/content-structure/]
conditional: null
reads: [narrative-bible, performance-budgets]
knowledge-base: [game-level-content-design]
---

## Purpose
Design the content structure for the game — the organizational framework for
all playable content. This step adapts its output based on the game's
`contentStructure` trait, producing fundamentally different deliverables
depending on the content model:

- **discrete** — Traditional level-based games (platformers, puzzle games,
  linear shooters). Produces level layout documents with progression
  difficulty curves, mechanic introduction schedules, and pacing maps.
- **open-world** — Seamless explorable spaces (open-world RPGs, survival
  games). Produces world region documents with biome definitions, point-of-
  interest density maps, level streaming boundaries, and exploration gating.
- **procedural** — Content generated at runtime (roguelikes, procedural
  dungeons). Produces generation ruleset documents with seed parameters,
  constraint systems, content pools, difficulty scaling formulas, and
  quality validation rules.
- **endless** — Infinite escalation games (endless runners, wave survival,
  idle games). Produces escalation band documents with difficulty curves,
  content rotation schedules, score/distance milestones, and engagement
  pacing analysis.
- **mission-based** — Open structure with discrete objectives (GTA-style,
  MMO quest systems). Produces mission template documents with objective
  types, branching conditions, reward structures, and mission flow graphs.

The `contentStructure` trait is determined from the GDD. If the GDD does not
explicitly state a content structure, infer it from the game's genre, core
loop, and mechanics catalog.

## Inputs
- docs/game-design.md (required) — core loop, mechanics, game modes, and world overview establishing content structure type
- docs/system-architecture.md (required) — level streaming, scene management, and content loading architecture
- docs/narrative-bible.md (optional, forward-read) — story beats, character arcs, and environmental storytelling requirements to weave into content structure
- docs/performance-budgets.md (optional, forward-read) — per-scene object counts, draw call limits, and memory budgets constraining content density

## Expected Outputs
- docs/content-structure/ — directory containing content structure documents
  adapted to the game's content type. Common files:
  - `content-overview.md` — content structure type, volume estimates, and
    progression philosophy
  - Type-specific files (one or more depending on contentStructure trait):
    - `level-designs.md` (discrete)
    - `world-regions.md` (open-world)
    - `generation-rulesets.md` (procedural)
    - `escalation-bands.md` (endless)
    - `mission-templates.md` (mission-based)

## Content Structure Trait Adaptation

### Discrete Levels
- Level layout descriptions: spatial flow, encounter placement, collectible locations
- Difficulty curve: per-level target difficulty mapped to overall progression arc
- Mechanic introduction schedule: when each mechanic is introduced, tutorialized, and tested
- Pacing map: intensity curve per level (exploration, combat, puzzle, rest)
- Boss/milestone encounters: placement rationale and difficulty spike design

### Open World Regions
- Region definitions: biomes, themes, environmental hazards, ambient population
- Point-of-interest density: landmarks, encounters, and discovery content per region
- Level streaming boundaries: region transition points and loading strategy
- Exploration gating: soft gates (difficulty), hard gates (story/item requirements), and natural barriers
- Content density guidelines: encounters per square unit, loot distribution curves

### Procedural Generation
- Generation rulesets: seed parameters, room/tile templates, connection rules
- Constraint systems: minimum distances, forbidden combinations, required guarantees (e.g., always include a shop)
- Content pools: available rooms, enemies, items, events per difficulty tier
- Difficulty scaling formulas: how seed or depth translates to enemy stats, trap frequency, resource scarcity
- Quality validation: automated checks for solvability, pacing, fairness, and degenerate generation detection

### Endless Escalation
- Escalation bands: difficulty tiers with entry thresholds (score, distance, wave number)
- Content rotation: how obstacles, enemies, and powerups cycle within and across bands
- Milestone design: score/distance targets that provide psychological checkpoints
- Engagement pacing: when to introduce new elements, when to provide breathers, when to spike difficulty
- Long-session sustainability: how the game remains engaging past typical session length

### Mission-Based
- Mission templates: objective types (fetch, escort, defend, assassinate, investigate)
- Branching conditions: prerequisite missions, player choice gates, reputation thresholds
- Reward structures: XP, currency, items, narrative payoff per mission type and difficulty
- Mission flow graphs: dependency trees showing critical path and optional branches
- Side content integration: how side missions relate to main narrative and world state

## Quality Criteria
- (mvp) Content structure type identified and justified from GDD analysis
- (mvp) Content volume estimated: total levels/regions/mission count with development effort per unit
- (mvp) Difficulty progression defined from start to endgame with no unexplained difficulty spikes
- (mvp) Every core loop mechanic exercised by content — no mechanic introduced in GDD but never used in content
- (mvp) Content structure respects performance budgets (if available) — per-scene object counts, streaming boundaries
- (deep) Narrative integration: story beats from narrative-bible mapped to content structure (level, region, or mission)
- (deep) Replayability analysis: what drives repeat engagement (procedural variety, optional objectives, difficulty modes)
- (deep) Content pipeline documented: authoring workflow from design to engine-ready format
- (deep) Pacing analysis with annotated intensity curves showing moment-to-moment and session-level rhythm
- (mvp) Type-specific deliverable produced matching the identified content structure trait: level-designs.md (discrete), world-regions.md (open-world), generation-rulesets.md (procedural), escalation-bands.md (endless), or mission-templates.md (mission-based)

## Methodology Scaling
- **deep**: Full content structure specification with all trait-specific
  deliverables, narrative integration, replayability analysis, content
  pipeline documentation, pacing analysis with intensity curves, and
  content volume estimates with effort sizing. 15-30 pages.
- **mvp**: Content type identification, core content overview, and key
  progression structure. 3-5 pages.
- **custom:depth(1-5)**:
  - Depth 1: content type identification and volume estimate only.
  - Depth 2: add core progression structure and difficulty curve outline.
  - Depth 3: add full trait-specific deliverables and mechanic-to-content mapping.
  - Depth 4: add narrative integration, replayability analysis, and pacing intensity curves.
  - Depth 5: full specification with content pipeline documentation, effort sizing per content unit, and automated quality validation rules.

## Mode Detection
Check for docs/content-structure/ directory. If it exists, operate in update
mode: read existing content structure documents and diff against current GDD
and system architecture. Preserve existing level/region/mission designs.
Add content for new mechanics or areas. Update difficulty curves if GDD
progression systems changed.

## Update Mode Specifics
- **Detect prior artifact**: docs/content-structure/ directory exists with content files
- **Preserve**: existing level layouts, region definitions, generation
  rulesets, mission templates, difficulty curves, and pacing maps
- **Triggers for update**: GDD added new mechanics or game modes, narrative-
  bible added story beats requiring content placement, performance-budgets
  revised per-scene limits, system architecture changed streaming or scene
  management approach
- **Conflict resolution**: if performance budget changes require reducing
  content density in a region or level, document the constraint and propose
  specific cuts prioritizing gameplay-critical content over ambient detail;
  if narrative requirements conflict with pacing design, flag for user
  decision with tradeoff analysis
