---
name: art-bible
description: Define art style, per-type asset specifications, naming conventions, DCC pipeline, LOD strategy, and collision layers
summary: "Establishes the visual identity and technical art standards — art style pillars, per-type asset specs (3D models, 2D sprites, VFX, animation), naming conventions, DCC pipeline, LOD strategy, Git LFS mapping, and hitbox/collision layer definitions."
phase: "specification"
order: 866
dependencies: [game-design-document, performance-budgets, content-structure-design]
outputs: [docs/art-bible.md]
conditional: null
reads: []
knowledge-base: [game-asset-pipeline, game-performance-budgeting, game-binary-vcs-strategy, review-art-bible]
---

## Purpose
Define the complete art bible for the project — the authoritative reference for
visual identity, technical art standards, and asset production workflows. This
document bridges the creative vision from the GDD with the technical constraints
from performance budgets to produce actionable specifications that every artist
on the team follows.

Games require per-type asset specifications because a character model, an
environment prop, a VFX particle, and a UI sprite each have fundamentally
different polygon budgets, texture requirements, animation constraints, and
optimization strategies. Without an art bible, artists produce assets with
inconsistent quality, naming, and technical specs — leading to pipeline
failures, performance regressions, and visual incoherence.

## Inputs
- docs/game-design.md (required) — art style direction, world setting, character roster, environment types
- docs/performance-budgets.md (required) — polygon budgets, texture memory budgets, draw call limits per platform
- docs/content-structure/ (required) — content organization, asset directory structure, naming taxonomy
- docs/plan.md (required) — target platforms informing quality tiers and LOD requirements

## Expected Outputs
- docs/art-bible.md — art style guide, per-type asset specs, naming conventions,
  DCC pipeline, LOD strategy, Git LFS mapping, and collision layer definitions

## Quality Criteria
- (mvp) Art style pillars defined with concrete specifications: color palette as hex/RGB ranges, character proportion ratios, material property ranges (roughness, metallic), and reference images or "do/don't" visual descriptions per asset category
- (mvp) Per-type asset specs documented: 3D models (poly budget, texture resolution, material slots), 2D sprites (resolution, atlas packing, animation frames), VFX (particle count, draw call budget, shader complexity), animation (bone count, clip length, blend tree structure)
- (mvp) Naming conventions defined per asset type following content-structure-design taxonomy
- (mvp) DCC pipeline documented: source tool → export format → engine import → validation
- (mvp) LOD strategy defined with distance thresholds, poly reduction targets, and LOD count per asset category
- (mvp) Hitbox and collision layer definitions for gameplay-critical assets (characters, projectiles, interactables, terrain)
- (deep) Git LFS tracking rules mapped per file type with size thresholds and binary file extensions
- (deep) Texture compression formats specified per platform (BCn for desktop/console, ASTC for mobile, ETC2 fallback)
- (deep) Material and shader standards documented (PBR metallic-roughness vs specular-glossiness, shader LOD, material instance hierarchy)
- (deep) Color grading and post-processing reference targets for consistent look across lighting scenarios
- (deep) Asset validation automation: import hooks that reject out-of-budget assets before they enter version control

## Methodology Scaling
- **deep**: Full art bible with style guide, per-type asset specs for all
  categories (character, environment, prop, VFX, UI, animation), DCC pipeline
  with tool-specific export settings, LOD strategy with platform-specific
  distance tables, Git LFS configuration, texture compression matrix,
  material standards, collision layer map, and automated validation rules.
  15-25 pages.
- **mvp**: Art style pillars, per-type specs for primary asset categories,
  naming conventions, basic LOD strategy, and collision layer definitions.
  4-8 pages.
- **custom:depth(1-5)**:
  - Depth 1: art style pillars and primary asset type polygon/texture budgets only.
  - Depth 2: add naming conventions, basic DCC export pipeline, and collision layer definitions.
  - Depth 3: add LOD strategy with distance thresholds, Git LFS mapping, and per-platform texture formats.
  - Depth 4: add material/shader standards, animation specs, VFX budgets, and asset validation automation.
  - Depth 5: full art bible with color grading targets, cinematic asset specs, destructible environment specs, and art QA checklist.

## Mode Detection
Check for docs/art-bible.md. If it exists, operate in update mode: read
existing art bible and diff against current GDD visual direction and
performance budgets. Preserve existing art style pillars, naming conventions,
and DCC pipeline decisions. Update per-type budgets if performance budgets
changed. Add specs for new asset categories introduced by GDD changes.

## Update Mode Specifics
- **Detect prior artifact**: docs/art-bible.md exists
- **Preserve**: art style pillars, existing per-type asset specs, naming
  conventions, DCC pipeline configuration, material standards, collision layer
  definitions
- **Triggers for update**: GDD changed visual direction or added new asset
  categories, performance budgets revised polygon or texture memory limits,
  content-structure-design changed directory layout or naming taxonomy, target
  platforms changed (affects LOD tiers and texture compression)
- **Conflict resolution**: if performance budget reductions require lowering
  per-type asset specs, document the impact on visual quality with before/after
  comparison notes and propose tiered quality settings rather than universal
  downgrade; never silently lower art specs without flagging the visual impact
