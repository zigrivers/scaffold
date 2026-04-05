---
name: narrative-bible
description: Document world lore, characters, dialogue systems, and narrative pacing
summary: "Creates a narrative bible covering world lore, character profiles, dialogue system design, branching narrative structure, and narrative pacing. Conditional on narrative depth."
phase: "modeling"
order: 515
dependencies: [domain-modeling]
outputs: [docs/narrative-bible.md]
conditional: "if-needed"
reads: [game-design-document]
knowledge-base: [game-narrative-design]
---

## Purpose
Create a comprehensive narrative bible that documents the world, characters,
dialogue systems, and story structure for games with narrative content. This
artifact translates the GDD's narrative vision into implementable specifications
that downstream steps (architecture, content pipeline, dialogue systems) can
consume. Covers world lore, character profiles with arcs and relationships,
dialogue system design (branching, bark, cinematic), narrative pacing aligned
to gameplay loops, and localization considerations.

## Conditional Evaluation
Enable when: the GDD or project config specifies `narrative` as `light` or
`heavy`. Light narrative projects produce a minimal bible (world context, key
characters, bark/dialogue catalog). Heavy narrative projects produce the full
bible with branching story graphs, character relationship maps, and pacing
curves.

Skip when: the GDD or project config specifies `narrative: none` — the project
has no story, dialogue, or character content (e.g., pure puzzle games, abstract
arcade games, sports simulations without story mode).

## Inputs
- docs/game-design.md (required) — narrative pillars, world overview, character concepts
- docs/domain-models/ (required) — entities that may include characters, items, locations
- docs/plan.md (required) — scope and feature list to gauge narrative breadth

## Expected Outputs
- docs/narrative-bible.md — world lore, character profiles, dialogue system
  design, branching narrative structure, pacing plan, and localization notes

## Quality Criteria
- (mvp) World lore section establishes setting, tone, and key locations
- (mvp) Every named character in the GDD has a profile with role, motivation, and arc summary
- (mvp) Dialogue system type identified (branching, linear, bark, cinematic) with implementation approach
- (mvp) Narrative pacing aligns with core gameplay loop from GDD
- (deep) Character relationship map with faction/alliance dynamics
- (deep) Branching narrative graph with critical path and optional branches identified
- (deep) Dialogue state tracking requirements documented (flags, variables, conditions)
- (deep) Localization strategy for narrative content (string table structure, cultural considerations)
- (deep) Narrative content pipeline defined (authoring tools, review workflow, integration format)

## Methodology Scaling
- **deep**: Full narrative bible with world lore, complete character profiles
  with arcs, branching story graph, dialogue system specification, pacing
  curves mapped to gameplay progression, localization strategy, and content
  pipeline. 15-25 pages.
- **mvp**: World context, key character profiles, dialogue system type, and
  narrative pacing outline. 3-5 pages.
- **custom:depth(1-5)**:
  - Depth 1: world setting paragraph and character name/role list only.
  - Depth 2: world lore section and character profiles with motivations.
  - Depth 3: add dialogue system design and narrative pacing outline.
  - Depth 4: add branching narrative structure and character relationship map.
  - Depth 5: full bible with localization strategy and content pipeline definition.

## Mode Detection
Check for docs/narrative-bible.md. If it exists, operate in update mode: read
existing bible and diff against current GDD narrative sections. Preserve
established lore, character profiles, and dialogue system decisions. Add new
characters or story elements from updated GDD. Update pacing if gameplay loop
changed. Never alter established world canon without explicit user approval.

## Update Mode Specifics
- **Detect prior artifact**: docs/narrative-bible.md exists
- **Preserve**: established world lore, character profiles, dialogue system
  type, branching structure decisions, localization strategy
- **Triggers for update**: GDD narrative sections changed, new characters
  introduced, gameplay loop restructured affecting pacing, new dialogue
  system requirements
- **Conflict resolution**: if GDD changes contradict established lore, flag
  the contradiction and present both versions for user decision; never
  silently overwrite canon
