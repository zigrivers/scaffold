---
name: audio-design
description: Define audio direction, SFX categories, adaptive music, middleware config, spatial audio, VO plan, and platform loudness targets
summary: "Establishes audio direction, SFX category taxonomy, adaptive music system, middleware configuration (Wwise/FMOD), spatial audio setup, voice-over pipeline, platform-specific loudness targets (LUFS), and memory budget allocation from performance budgets."
phase: "specification"
order: 867
dependencies: [game-design-document, performance-budgets, content-structure-design]
outputs: [docs/audio-design.md]
conditional: null
reads: [narrative-bible]
knowledge-base: [game-audio-design]
---

## Purpose
Define the complete audio design specification — the authoritative reference for
audio direction, middleware configuration, asset production standards, and
runtime behavior. This document translates the emotional and mechanical needs
from the GDD into concrete audio architecture decisions.

Audio is a primary player feedback channel: it communicates spatial awareness
(enemy footsteps behind you), game state (health low warning), emotional tone
(rising tension before a boss), and mechanical timing (attack wind-up cues).
Unlike visual assets which players consciously evaluate, audio operates
subconsciously — players feel bad audio as "something is off" without
identifying the cause. This makes early audio planning critical: middleware
selection, bus hierarchy, and adaptive music architecture cannot be easily
retrofitted once content production begins.

**Note on forward-reads**: `narrative-bible` is listed as an optional read. On
first generation it may not exist yet — in that case, define placeholder VO
categories (protagonist, NPCs, narration) and mark them with
`<!-- pending: narrative-bible -->` for a future update pass. When
narrative-bible becomes available, these placeholders are filled in during
update mode.

## Inputs
- docs/game-design.md (required) — mechanics, core loop, world setting, emotional tone informing audio direction
- docs/performance-budgets.md (required) — audio memory budget, CPU budget for audio processing, streaming constraints
- docs/content-structure/ (required) — audio asset directory structure, naming taxonomy
- docs/plan.md (required) — target platforms informing loudness targets and format requirements
- docs/narrative-bible.md (optional, forward-read) — character roster, dialogue structure, VO volume and language requirements

## Expected Outputs
- docs/audio-design.md — audio direction, SFX categories, adaptive music system,
  middleware config, spatial audio, VO plan, loudness targets, and memory budget

## Quality Criteria
- (mvp) Audio direction defined: emotional tone per game context (exploration, combat, menu, cinematic), reference tracks or descriptive style pillars
- (mvp) SFX categories defined with priority tiers: gameplay-critical (weapon, footstep, UI feedback), ambient (environment, weather), and cosmetic (character emotes, incidental)
- (mvp) Adaptive music system documented: layered stems, horizontal re-sequencing, or vertical remixing approach with transition rules between game states
- (mvp) Middleware selection documented with rationale (Wwise, FMOD, or engine-native) and bus hierarchy (master, music, SFX, ambient, VO, UI)
- (mvp) Platform-specific loudness targets specified: -24 LUFS +/-2 for console, -18 LUFS +/-2 for mobile, with metering approach
- (mvp) Audio memory budget allocated from performance budgets: streaming vs resident pools, per-platform limits
- (deep) Spatial audio configuration: HRTF profiles, occlusion/obstruction model, attenuation curves, reverb zone strategy
- (deep) VO pipeline documented: casting direction, recording spec (sample rate, bit depth, format), naming convention, localization workflow per language
- (deep) Audio format matrix per platform: codec (Vorbis, Opus, ADPCM, platform-native), quality settings, streaming chunk size
- (deep) Dynamic range management: compressor/limiter settings per bus, ducking rules (VO ducks music, gameplay SFX ducks ambient)
- (deep) Accessibility audio: audio descriptions, mono downmix option, visual indicators for critical audio cues
- (deep) SFX variation strategy documented: minimum variant count per sound event category, randomization rules (no-repeat, round-robin, weighted random), pitch and volume variation ranges

## Methodology Scaling
- **deep**: Full audio design with style guide, complete SFX taxonomy with
  per-category specs, adaptive music system with state machine, middleware
  configuration with bus hierarchy and effects chains, spatial audio setup,
  VO pipeline with localization plan, per-platform loudness and format matrix,
  dynamic range strategy, memory budget breakdown, and accessibility audio
  plan. 15-25 pages.
- **mvp**: Audio direction, primary SFX categories, basic adaptive music
  approach, middleware selection, loudness targets, and memory budget
  allocation. 4-8 pages.
- **custom:depth(1-5)**:
  - Depth 1: audio direction pillars and primary SFX category list only.
  - Depth 2: add middleware selection, bus hierarchy, and loudness targets.
  - Depth 3: add adaptive music system, memory budget allocation, and audio format per platform.
  - Depth 4: add spatial audio configuration, VO pipeline, dynamic range management, and accessibility audio.
  - Depth 5: full specification with localization VO plan, per-context audio profiling targets, procedural audio specs, and audio QA checklist.

## Mode Detection
Check for docs/audio-design.md. If it exists, operate in update mode: read
existing audio design and diff against current GDD emotional direction and
performance budgets. Preserve existing middleware selection, bus hierarchy,
and adaptive music architecture. Update memory budgets if performance budgets
changed. Fill VO placeholders when narrative-bible becomes available.

## Update Mode Specifics
- **Detect prior artifact**: docs/audio-design.md exists
- **Preserve**: middleware selection, bus hierarchy, adaptive music architecture,
  spatial audio configuration, loudness targets, audio format decisions
- **Triggers for update**: GDD changed emotional tone or added new game states
  requiring music transitions, performance budgets revised audio memory or CPU
  limits, content-structure-design changed audio asset organization,
  narrative-bible created (fill VO placeholder sections), target platforms
  changed (affects loudness targets and format requirements)
- **Conflict resolution**: if performance budget reductions require lowering
  audio memory allocation, document the impact on simultaneous voice count
  and streaming quality with concrete tradeoff analysis; propose quality
  tiers (high/medium/low) rather than universal quality reduction
