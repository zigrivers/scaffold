# Game Development Pipeline Extension — Design Spec

**Date**: 2026-04-05
**Status**: Approved Design
**Goal**: Extend scaffold's 16-phase documentation pipeline to produce comprehensive game development documentation, supporting all game types from indie 2D to AAA multiplayer.

**Review History**: All design sections reviewed via multi-model review (Codex + Gemini). 12 total MMR passes across 6 sections (conditional logic, knowledge entries, pipeline steps, engine changes, preset design, full spec). All P0/P1 findings integrated.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Engine Changes](#2-engine-changes)
3. [Game Project-Type Overlay](#3-game-project-type-overlay)
4. [New Pipeline Steps (24)](#4-new-pipeline-steps-24)
5. [Knowledge Entries (29)](#5-knowledge-entries-29)
6. [Conditional Evaluation Logic](#6-conditional-evaluation-logic)
7. [Init Wizard](#7-init-wizard)
8. [Prerequisite Work](#8-prerequisite-work)

---

## 1. Architecture Overview

### Core Design Decision: Project-Type Overlay, Not Methodology

Game support is implemented as a **project-type overlay**, not a fourth methodology. This was validated by MMR — the methodology system (`deep`/`mvp`/`custom`) is hardcoded in `enums.ts`, `schema.ts`, `questions.ts`, and `preset-loader.ts`. Adding a fourth methodology would require changes across 4+ files and conflates two orthogonal axes.

**How it works:**

```
User selects methodology (mvp / deep / custom)
          ↓
Methodology resolves step enablement + depth
          ↓
projectType: game applies overlay
  → enables game-specific steps
  → disables replaced steps (design-system, ux-spec, review-ux)
  → injects game knowledge into existing steps (knowledge-overrides)
  → remaps artifact references (reads-overrides)
          ↓
gameConfig traits resolve conditional game steps
          ↓
Assembly engine builds prompts with game-aware context
```

**Consequences:**
- Depth is inherited from the chosen methodology (mvp=1, custom=3, deep=5)
- A game jam project uses `mvp` + game overlay (fewer steps, lower depth)
- An AAA project uses `deep` + game overlay (all steps, max depth)
- Future project types (`data-pipeline`, `embedded`, etc.) follow the same overlay pattern
- No changes to the methodology enum or existing preset files

### Integration Points

| Component | Change | Scope |
|-----------|--------|-------|
| `src/types/config.ts` | Add `projectType` + `GameConfig` interface | Schema |
| `src/config/schema.ts` | Add Zod validation for gameConfig | Validation |
| `src/core/assembly/preset-loader.ts` | Parse `knowledge-overrides`, `reads-overrides` from overlay | Loader |
| `src/core/assembly/methodology-resolver.ts` | Apply project-type overlay (step/dep/knowledge/reads overrides) after methodology resolution | Resolution |
| `src/core/dependency/eligibility.ts` | Align run.ts with disabled-dep handling | Dependencies |
| `src/cli/commands/run.ts` | Wire `reads` artifacts into assembly context | Assembly (prerequisite) |
| `src/wizard/questions.ts` | Game config wizard page with progressive disclosure | UX |
| `src/wizard/wizard.ts` | Store gameConfig in config.yml | Persistence |
| `content/methodology/game-overlay.yml` | Game overlay definition | Content |
| `content/pipeline/` | 24 new step files | Content |
| `content/knowledge/game/` | 23 new knowledge entries | Content |
| `content/knowledge/review/` | 5 new review knowledge entries | Content |

---

## 2. Engine Changes

### 2a. ProjectConfig Schema Extension

```typescript
// src/types/config.ts
export interface ProjectConfig {
  name?: string
  platforms?: Array<'web' | 'mobile' | 'desktop'>
  projectType?: 'web-app' | 'mobile-app' | 'backend' | 'cli' | 'library' | 'game'
  gameConfig?: GameConfig
  [key: string]: unknown
}

export interface GameConfig {
  engine: 'unity' | 'unreal' | 'godot' | 'custom'
  multiplayerMode: 'none' | 'local' | 'online' | 'hybrid'
  narrative: 'none' | 'light' | 'heavy'
  contentStructure: 'discrete' | 'open-world' | 'procedural' | 'endless' | 'mission-based'
  economy: 'none' | 'progression' | 'monetized' | 'both'
  onlineServices: Array<'leaderboards' | 'accounts' | 'matchmaking' | 'live-ops'>
  persistence: 'none' | 'settings-only' | 'profile' | 'progression' | 'cloud'
  targetPlatforms: Array<'pc' | 'web' | 'ios' | 'android' | 'ps5' | 'xbox' | 'switch' | 'vr' | 'ar'>
  supportedLocales: string[]  // BCP 47 locale codes, e.g. ['en', 'ja', 'fr']
  hasModding: boolean
  npcAiComplexity: 'none' | 'simple' | 'complex'
}
```

**Design notes:**
- `projectType` is optional — existing projects without it work unchanged
- `gameConfig` is only valid when `projectType === 'game'` (enforced by Zod cross-field rule)
- All `gameConfig` fields have defaults applied by the parser (not required in YAML)
- `targetPlatforms` supersedes root `platforms` when `projectType === 'game'`
- `onlineServices` is an array (not single enum) because games can have multiple simultaneously
- `engine` is a required game field — it dictates project structure, coding standards, and build pipeline

**Zod validation** (`src/config/schema.ts`):
- Add `projectType` enum validation
- Add `gameConfig` object schema with all fields
- Cross-field rule: `gameConfig` must be undefined when `projectType !== 'game'`
- Default values applied during parse: `multiplayerMode: 'none'`, `narrative: 'none'`, `economy: 'none'`, `onlineServices: []`, `persistence: 'progression'`, `targetPlatforms: ['pc']`, `supportedLocales: ['en']`, `hasModding: false`, `npcAiComplexity: 'none'`

### 2b. Project-Type Overlay Schema

New file type alongside methodology presets. Overlay YAML structure:

```yaml
# content/methodology/game-overlay.yml
name: game
description: >
  Game development overlay — adds game-specific steps, injects game knowledge
  into existing steps, and remaps artifact references for game projects.
project-type: game

# Steps to enable regardless of methodology
step-overrides:
  # Enable game-specific steps
  game-design-document: { enabled: true }
  review-gdd: { enabled: true }
  performance-budgets: { enabled: true }
  game-accessibility: { enabled: true }
  input-controls-spec: { enabled: true }
  game-ui-spec: { enabled: true }
  review-game-ui: { enabled: true }
  content-structure-design: { enabled: true }
  art-bible: { enabled: true }
  audio-design: { enabled: true }
  playtest-plan: { enabled: true }
  analytics-telemetry: { enabled: true }
  # Conditional game steps
  narrative-bible: { enabled: true, conditional: "if-needed" }
  netcode-spec: { enabled: true, conditional: "if-needed" }
  review-netcode: { enabled: true, conditional: "if-needed" }
  ai-behavior-design: { enabled: true, conditional: "if-needed" }
  economy-design: { enabled: true, conditional: "if-needed" }
  review-economy: { enabled: true, conditional: "if-needed" }
  save-system-spec: { enabled: true, conditional: "if-needed" }
  localization-plan: { enabled: true, conditional: "if-needed" }
  online-services-spec: { enabled: true, conditional: "if-needed" }
  modding-ugc-spec: { enabled: true, conditional: "if-needed" }
  live-ops-plan: { enabled: true, conditional: "if-needed" }
  platform-cert-prep: { enabled: true, conditional: "if-needed" }
  # Disable steps replaced by game equivalents
  design-system: { enabled: false }
  ux-spec: { enabled: false }
  review-ux: { enabled: false }

# Remap dependencies when overlay disables/adds steps
dependency-overrides:
  # user-stories must also depend on review-gdd for game projects
  user-stories:
    append: [review-gdd]
  # platform-parity-review depended on review-ux — remap to review-game-ui
  platform-parity-review:
    replace: { review-ux: review-game-ui }

# Game knowledge injected into existing steps
knowledge-overrides:
  create-prd:
    append: [game-design-document]
  user-stories:
    append: [game-design-document, game-accessibility]
  tech-stack:
    append: [game-engine-selection, game-performance-budgeting]
  coding-standards:
    append: [game-engine-selection]
  tdd:
    append: [game-testing-strategy]
  project-structure:
    append: [game-project-structure]
  git-workflow:
    append: [game-asset-pipeline, game-project-structure]
  dev-env-setup:
    append: [game-project-structure]
  add-e2e-testing:
    append: [game-testing-strategy]
  domain-modeling:
    append: [game-domain-patterns, game-save-systems]
  adrs:
    append: [game-engine-selection]
  system-architecture:
    append: [game-domain-patterns, game-engine-selection]
  review-architecture:
    append: [game-performance-budgeting]
  security:
    append: [game-networking]
  review-security:
    append: [game-networking]
  operations:
    append: [game-liveops-analytics]
  review-operations:
    append: [game-liveops-analytics]
  database-schema:
    append: [game-save-systems, game-networking]
  api-contracts:
    append: [game-networking]
  review-database:
    append: [game-save-systems]
  review-api:
    append: [game-networking]
  platform-parity-review:
    append: [game-platform-certification, game-networking]
  game-design-document:
    append: [game-milestone-definitions]
  playtest-plan:
    append: [game-milestone-definitions]
  implementation-plan:
    append: [game-milestone-definitions, game-design-document]
  implementation-playbook:
    append: [game-milestone-definitions]
  story-tests:
    append: [game-testing-strategy]
  review-testing:
    append: [game-testing-strategy, game-performance-budgeting]
  create-evals:
    append: [game-testing-strategy]
  cross-phase-consistency:
    append: [game-design-document]
  critical-path-walkthrough:
    append: [game-design-document]

# Remap artifact references for disabled steps
reads-overrides:
  story-tests:
    replace: { ux-spec: game-ui-spec }
  create-evals:
    replace: { ux-spec: game-ui-spec }
  implementation-plan:
    replace: { ux-spec: game-ui-spec }
  implementation-playbook:
    replace: { ux-spec: game-ui-spec, design-system: game-ui-spec }
  new-enhancement:
    replace: { ux-spec: game-ui-spec }
  platform-parity-review:
    replace: { design-system: game-ui-spec }
  cross-phase-consistency:
    replace: { ux-spec: game-ui-spec }
```

### 2c. Assembly Engine Changes

**Overlay resolution** (`src/core/assembly/methodology-resolver.ts`):
1. After methodology resolution, check `config.project.projectType`
2. If project type has an overlay file, load it
3. Apply `step-overrides`: merge into resolved step map (overlay wins on conflicts)
4. Apply `dependency-overrides`: append/replace dependencies in each step's dependency array
5. Apply `knowledge-overrides`: append entries to each step's knowledgeBase array, deduplicate
6. Apply `reads-overrides`: replace/append in each step's reads array, validate targets exist and are enabled

**Centralized resolved pipeline** — PREREQUISITE:
- Preset resolution is currently duplicated across `run.ts`, `status.ts`, `next.ts`, `rework.ts`, `list.ts`, `build.ts`
- Must centralize into a single "resolved pipeline" layer that all commands consume
- Overlay resolution happens in this centralized layer, not per-command

**Reads assembly** (`src/cli/commands/run.ts`) — PREREQUISITE:
- Currently, `reads` artifacts are not loaded into assembly context
- Must fix: when building step context, load artifacts from `reads` array in addition to dependencies
- Validate that read targets are resolved before the current step runs
- If a read target is disabled or hasn't produced output, warn (not hard-fail)

**Preset loader** (`src/core/assembly/preset-loader.ts`):
- Extend `loadPreset()` / create `loadOverlay()` to parse `knowledge-overrides`, `reads-overrides`, `step-overrides`
- Deduplication: after append, remove duplicate knowledge entries
- Validation: warn if override references a step name that doesn't exist
- Validation: warn if reads-override replacement target is disabled

**Disabled-step dependency handling** (`src/cli/commands/run.ts`):
- Currently hard-fails on `DEP_UNMET` for any dependency not completed/skipped
- Must update: overlay-disabled steps should be treated as "satisfied" (same as `eligibility.ts` already does)
- Align `run.ts` with `eligibility.ts` disabled-dep semantics

**Dependency coherence** for game overlay:
- When overlay disables a step (e.g., `review-ux`), any step that depends on it must have that dependency remapped via `dependency-overrides`
- `platform-parity-review` depends on `review-ux` → remap to depend on `review-game-ui`
- `dependency-overrides` in the overlay YAML handles this explicitly
- Assembly engine should detect and warn on broken dependency chains from overlay disablement

**Prompt body references to disabled steps**:
- Existing step prompt bodies (markdown) may explicitly mention "read ux-spec" or "reference design-system" in their text
- `reads-overrides` only remaps the `reads` array, not the prose
- Game knowledge entries injected via `knowledge-overrides` should include explicit instructions: "For game projects, use `game-ui-spec` in place of `ux-spec` and `design-system`"
- This is handled by the knowledge entry content, not engine logic

### 2d. Init Wizard Game Page

**New UI primitives needed** in `src/cli/output/context.ts`:
- `select()` — single-choice from list (for enums)
- `multiSelect()` — multi-choice from list (for arrays like targetPlatforms, onlineServices)
- `multiInput()` — comma-separated text input (for supportedLocales)

**Progressive disclosure flow:**

```
"What are you building?" → [web-app, mobile-app, backend, cli, library, game]
                                                                    ↓
                                                         Game Configuration
                                                                    ↓
Core questions (always asked):
  1. "Game engine?" → unity / unreal / godot / custom
  2. "Multiplayer mode?" → none / local / online / hybrid
  3. "Target platforms?" → multi-select: pc, web, ios, android, ps5, xbox, switch, vr, ar

Conditional follow-ups:
  4. "Online services?" → (only if multiplayer online/hybrid) multi-select: leaderboards, accounts, matchmaking, live-ops
  5. "Content structure?" → discrete / open-world / procedural / endless / mission-based
  6. "Economy type?" → none / progression / monetized / both

Advanced (behind "Configure advanced settings? y/N", sensible defaults applied if skipped):
  7. "Narrative depth?" → none / light / heavy  (default: none)
  8. "Supported locales?" → comma-separated  (default: en)
  9. "NPC AI complexity?" → none / simple / complex  (default: none)
  10. "Mod support?" → yes / no  (default: no)
  11. "Persistence model?" → none / settings-only / profile / progression / cloud  (default: progression)
```

Results stored in `config.yml`:
```yaml
project:
  name: my-game
  project-type: game
  game-config:
    engine: unity
    multiplayer-mode: online
    narrative: heavy
    content-structure: open-world
    economy: both
    online-services: [accounts, matchmaking, live-ops]
    persistence: cloud
    target-platforms: [pc, ps5, xbox]
    supported-locales: [en, ja, fr, de, es]
    has-modding: false
    npc-ai-complexity: complex
```

---

## 3. Game Project-Type Overlay

See Section 2b for the complete `game-overlay.yml` definition.

**Key behaviors:**

| Behavior | Implementation |
|----------|---------------|
| Enable 24 game steps | `step-overrides` with enabled: true |
| Disable replaced steps | `step-overrides` with enabled: false for design-system, ux-spec, review-ux |
| Inject game knowledge | `knowledge-overrides` appends game KB entries to 30+ existing steps |
| Remap artifact refs | `reads-overrides` replaces design-system/ux-spec with game-ui-spec in 7 steps |
| Innovation steps | Inherited from methodology — deep enables them, mvp disables them |
| Depth | Inherited from methodology — no depth override in overlay |

---

## 4. New Pipeline Steps (24)

### Phase 8 Ordering (Corrected per MMR)

The MMR reviews identified circular dependencies and ordering inversions. Corrected Phase 8 order:

Existing Phase 8 orders: 810 (database-schema), 820 (review-database), 830 (api-contracts), 840 (review-api), 850 (ux-spec), 860 (review-ux). Game steps use non-colliding orders:

```
861: game-accessibility (source spec — informs UI and input)
862: input-controls-spec (input abstraction — consumed by UI)
863: game-ui-spec (consumes accessibility + input)
864: review-game-ui
865: content-structure-design (level/world structure — consumed by art + audio)
866: art-bible (consumes content structure for asset planning)
867: audio-design (consumes content structure for environmental audio)
868: economy-design (conditional)
869: review-economy (conditional)
871: online-services-spec (conditional)
872: modding-ugc-spec (conditional)
873: save-system-spec (conditional)
874: localization-plan (conditional)
```

Existing Phase 9 orders: 910 (review-testing), 915 (story-tests), 920 (create-evals), 930 (operations), 940 (review-operations), 950 (security), 960 (review-security). Game steps:

```
961: playtest-plan
962: analytics-telemetry
963: live-ops-plan (conditional)
964: platform-cert-prep (conditional)
```

### Always-Enabled Steps (12)

#### 1. `game-design-document.md` (Phase 1, order 115)
- **Dependencies**: `review-prd`
- **Outputs**: `docs/game-design.md`
- **Reads**: `create-vision`, `create-prd`
- **Knowledge-base**: `game-design-document`
- **Structure**:
  - Game pillars: 3-5 tenets as "X over Y" tradeoffs that constrain decisions
  - Core loop: engage → challenge → reward → repeat, with timing and feedback
  - Mechanics catalog: each mechanic documented as inputs, rules, outputs, feedback
  - Game modes and win/fail states
  - Camera model and viewport constraints
  - Progression systems: XP curves, unlock gates, difficulty scaling
  - Game world overview: setting, tone, key locations
  - Player fantasy: what the player should feel
  - Session length targets
  - Reference comps (competing/inspiring games)
  - Achievements/trophies schema (titles, descriptions, unlock triggers)
- **Does NOT cover**: art direction (art-bible), audio (audio-design), narrative detail (narrative-bible), economy numbers (economy-design), netcode (netcode-spec)
- **Depth scaling**: depth 1-2 = 2-3 page GDD (pillars + core loop + key mechanics); depth 3 adds progression/world/modes; depth 4-5 = full mechanics catalog with competitive analysis, multi-model review, and separate files for core-mechanics.md and progression.md to avoid context overflow

#### 2. `review-gdd.md` (Phase 1, order 116)
- **Dependencies**: `game-design-document`
- **Outputs**: `docs/reviews/pre-review-gdd.md`
- **Knowledge-base**: `review-game-design`
- **Review passes**: Pillar coherence (do they actually constrain?), core loop closure (is the loop complete?), mechanic clarity (can an engineer implement without ambiguity?), progression feasibility (are curves reasonable?), scope assessment (buildable with stated resources?), downstream readiness (can user stories be written?)
- **P0-P3 severity**, multi-model dispatch at depth 4+

#### 3. `performance-budgets.md` (Phase 2, order 225)
- **Dependencies**: `review-gdd`, `tech-stack`
- **Outputs**: `docs/performance-budgets.md`
- **Reads**: `game-design-document`
- **Knowledge-base**: `game-performance-budgeting`
- **Structure**:
  - Target frame rate and per-system ms budget (rendering, physics, AI, animation, audio, game logic, UI, headroom)
  - Hitch/stutter budget (max acceptable frame time spikes)
  - Memory budget per target platform (textures, meshes, audio, physics, scripts, OS reserved)
  - GPU/draw call budget (if 3D): max draw calls, shader complexity, overdraw targets
  - Asset streaming bandwidth budget
  - Loading time targets per platform
  - Storage/install size targets per platform
  - Network bandwidth budget (if online): bytes per tick per player
  - Suspend/resume performance targets
  - Battery/thermal budget (if mobile/handheld): CPU/GPU usage for sustained play
  - VR-specific (if vr in targetPlatforms): 90fps minimum, stereo rendering budget, motion-to-photon latency
  - Each budget entry: system, allocation, rationale, measurement method, alert threshold
- **Depth scaling**: depth 1-2 = target frame rate + top-level memory budget (concrete tables, not just prose — engineering specs keep fixed minimum shape); depth 3 = full per-system breakdown; depth 4-5 = per-platform matrices, profiling tool recommendations, CI integration for perf regression

#### 4. `game-accessibility.md` (Phase 8, order 861)
- **Dependencies**: `game-design-document`
- **Outputs**: `docs/game-accessibility.md`
- **Knowledge-base**: `game-accessibility`
- **Structure** (organized by Xbox Accessibility Guidelines categories):
  - Visual: colorblind modes, high contrast, UI scaling, aim assist, screen reader hints
  - Motor/Input: remappable controls, one-handed options, hold/toggle, copilot mode, auto-aim, adjustable timers
  - Cognitive: difficulty options (difficulty as accessibility), objective reminders, game speed adjustment, content warnings, simplified UI mode
  - Auditory: subtitles with speaker ID/sizing/background, visual cues for audio events, mono audio
  - Speech: TTS for chat, ping systems, non-verbal communication
  - Photosensitivity: flash reduction, screen shake toggle, motion reduction
  - VR/AR comfort (if applicable): locomotion options, comfort vignette, seated play mode
  - Each feature: description, implementation approach, priority tier, platform requirements
  - CVAA compliance section (conditional on games with communication features)
- **Note**: XAG is guidance, not legal compliance. CVAA is conditional on communication features. Present feature checklists, not compliance theater.

#### 5. `input-controls-spec.md` (Phase 8, order 862)
- **Dependencies**: `game-design-document`, `game-accessibility`
- **Outputs**: `docs/input-controls-spec.md`
- **Knowledge-base**: `game-input-systems`
- **Structure**:
  - Default bindings per device (KB/M, gamepad, touch, VR controllers)
  - Input abstraction layer design (action mapping)
  - Rebinding system requirements
  - Dead zones, sensitivity curves, aim assist/friction parameters
  - Combo/input buffering (for action/fighting games)
  - Haptics design (DualSense adaptive triggers, HD rumble)
  - Simultaneous input handling (multiple devices)
  - Controller disconnect/reconnect behavior
  - Local co-op device ownership
  - IME/text input for chat/naming
  - Accessibility input requirements (one-handed, hold/toggle — references game-accessibility)
  - Platform-specific input requirements (console cert mandates)
  - Cross-play input fairness (aim assist for controller vs. KB/M)

#### 6. `game-ui-spec.md` (Phase 8, order 863)
- **Dependencies**: `game-accessibility`, `input-controls-spec`, `system-architecture`
- **Outputs**: `docs/game-ui-spec.md`
- **Reads**: `game-design-document`, `economy-design` (if exists — optional forward-read, may be empty on first generation), `netcode-spec` (if exists)
- **Knowledge-base**: `game-ui-patterns`, `game-accessibility`
- **Replaces**: `design-system` + `ux-spec` for game projects
- **Note**: economy-design (order 868) runs after game-ui-spec (863). The read is optional — if economy-design hasn't produced output yet, game-ui-spec generates without commerce flows. A rework pass after economy-design can add commerce/store UI sections.
- **Structure**:
  - UI visual language/tokens (since this replaces design-system): color palette, typography, spacing, iconography for game UI
  - HUD specification: element inventory, placement, information density, dynamic visibility
  - Menu hierarchy: main menu, pause, settings, inventory, map, social — full tree
  - Controller navigation patterns: focus management, D-pad flow, cursor fallback
  - Settings screens: graphics, audio, controls (with rebinding UI), accessibility, gameplay
  - Loading screens and transition design
  - FTUE/tutorial/onboarding: progressive disclosure schedule, contextual hints, practice spaces, skip/replay options, onboarding metrics
  - UI state machines: gameplay, pause, cutscene, inventory, dialogue, loading, matchmaking lobby
  - Responsive behavior: split-screen, ultrawide, aspect ratios, safe zones
  - Platform shell/system UI integration (overlay, notifications, commerce)
  - Commerce/social/report flows (if economy or online services exist)
  - VR/AR spatial UI (if applicable): world-space menus, gaze interaction, comfort-aware placement

#### 7. `review-game-ui.md` (Phase 8, order 864)
- **Dependencies**: `game-ui-spec`
- **Outputs**: `docs/reviews/specification-review-game-ui.md`
- **Knowledge-base**: `review-game-design`, `game-accessibility`
- **Review passes**: HUD clarity and information overload, menu navigation completeness, controller accessibility, settings screen coverage, FTUE effectiveness, state machine completeness, platform shell compliance, accessibility feature coverage
- **Replaces**: `review-ux` for game projects

#### 8. `content-structure-design.md` (Phase 8, order 865)
- **Dependencies**: `game-design-document`, `system-architecture`
- **Outputs**: `docs/content-structure/` (one file per level/region/template)
- **Reads**: `narrative-bible` (if exists), `performance-budgets`
- **Knowledge-base**: `game-level-content-design`
- **Always enabled** — adapts output format by `contentStructure` trait:
  - `discrete`: per-level docs (layout, encounters, pacing, objectives, difficulty curve, estimated play time, asset requirements)
  - `open-world`: world regions, POI density, biome specs, quest distribution, streaming zones, world map
  - `procedural`: generation ruleset, room/encounter templates, difficulty scaling rules, seed management, content pools
  - `endless`: generation rules, escalation bands, spawn pools, reward cadence, content rotation, object pooling specs, difficulty curves over time
  - `mission-based`: mission templates, branching paths, optional objectives, scoring, replay value

#### 9. `art-bible.md` (Phase 8, order 866)
- **Dependencies**: `game-design-document`, `performance-budgets`, `content-structure-design`
- **Outputs**: `docs/art-bible.md`
- **Knowledge-base**: `game-asset-pipeline`, `game-performance-budgeting`
- **Structure**:
  - Art style direction: references, mood, color palette
  - Asset specs per type:
    - 3D models: poly budget per LOD tier, UV rules, pivot placement
    - Textures: resolution tiers, channel packing conventions, compression per platform
    - 2D sprites: sprite sheet specs, animation frame counts
    - VFX/particles: particle budget, overdraw limits, atlas specs
    - Animation: state machines, blend trees, IK setup, root motion policy, rig/bone structure requirements
  - Hitboxes, hurtboxes, and collision layer definitions
  - Asset naming conventions (strict taxonomy, engine-specific)
  - DCC-to-engine import pipeline (Maya/Blender/Substance/Houdini → engine, validation steps, automation)
  - LOD strategy: tier count, distance thresholds, transition method
  - Git LFS file type mapping and .gitattributes template
  - CI import validation rules (depth 4-5): naming regex, budget checks

#### 10. `audio-design.md` (Phase 8, order 867)
- **Dependencies**: `game-design-document`, `performance-budgets`, `content-structure-design`
- **Outputs**: `docs/audio-design.md`
- **Reads**: `narrative-bible` (if exists)
- **Knowledge-base**: `game-audio-design`
- **Structure**:
  - Audio direction: tone, style, references
  - SFX categories and naming conventions
  - Music design: adaptive layers, transition rules, emotional mapping per game state (horizontal re-sequencing, vertical layering, stinger systems)
  - Audio middleware selection and config (Wwise/FMOD/native — rationale)
  - Bus/mixer hierarchy
  - Spatial audio: 3D positioning, occlusion, reverb zones (linked to content-structure for environmental zones)
  - VO plan (if narrative is light/heavy): cast, line count, recording specs, localization approach
  - Loudness standards: platform-specific LUFS targets (consoles: -24 LUFS +/-2, mobile/portable: -18 LUFS +/-2, with platform-specific variations)
  - Memory budget allocation from performance-budgets
  - File format specs: source formats vs. runtime formats per platform
  - Accessibility: visual cues for important audio events (references game-accessibility)

#### 11. `playtest-plan.md` (Phase 9, order 961)
- **Dependencies**: `game-design-document`, `user-stories`
- **Outputs**: `docs/playtest-plan.md`
- **Knowledge-base**: `game-testing-strategy`
- **Structure**:
  - Playtest types: internal dogfooding, focused playtests, external/blind playtests
  - Schedule tied to milestones: prototype, vertical slice, alpha, beta
  - Structured feedback templates: fun rating, confusion points, difficulty perception, session length, retention intent, "would you play again?"
  - Analysis methodology: qualitative themes, quantitative metrics
  - FTUE observation protocol: watch new players without guidance, record friction points
  - Balance testing methodology: stat-driven games need systematic balance validation
  - Recruitment criteria for external testers
  - Playtest environment setup (builds, consent forms, recording)

#### 12. `analytics-telemetry.md` (Phase 9, order 962)
- **Dependencies**: `game-design-document`
- **Outputs**: `docs/analytics-plan.md`
- **Reads**: `system-architecture`, `operations` (if exists), `economy-design` (if exists)
- **Knowledge-base**: `game-liveops-analytics`
- **Always enabled** — crash telemetry and playtest analytics for all games; expanded for live-service:
  - Event taxonomy: player actions, progression milestones, economy transactions, errors, crashes
  - Event schema and versioning strategy
  - Event ownership (which team owns which events)
  - QA validation for telemetry (how to verify events fire correctly)
  - Data pipeline architecture: collection, transport, storage, query
  - Offline buffering (for games that lose connectivity)
  - Retention/deletion policy (GDPR right-to-erasure)
  - Privacy compliance: GDPR consent, COPPA for young audiences
  - **Conditional (live-service)**: KPI definitions (DAU, retention curves, session length, conversion, ARPU), funnel analysis, A/B testing framework, dashboard specification

### Conditional Steps (12)

#### 13. `narrative-bible.md` (Phase 5, order 515)
- **Condition**: `narrative` is `light` or `heavy`
- **Dependencies**: `domain-modeling`
- **Outputs**: `docs/narrative-bible.md`
- **Reads**: `game-design-document`
- **Knowledge-base**: `game-narrative-design`
- **Structure**: World lore, character profiles (motivations, arcs, relationships), dialogue system design (branching structure, choice consequences — depth scales), narrative pacing per game phase, environmental storytelling, localization considerations for narrative content

#### 14. `netcode-spec.md` (Phase 7, order 715)
- **Condition**: `multiplayerMode` is `online` or `hybrid`
- **Dependencies**: `system-architecture`
- **Outputs**: `docs/netcode-spec.md`
- **Reads**: `tech-stack`, `performance-budgets`
- **Knowledge-base**: `game-networking`
- **Structure**: Network topology (client-server/P2P/hybrid), tick rate and simulation model, client prediction and server reconciliation, lag compensation, bandwidth budget per player per tick, serialization format, anti-cheat architecture (server authority boundaries), connection handling (matchmaking flow, disconnect/reconnect, NAT traversal), determinism requirements (conditional on lockstep/rollback designs)

#### 15. `review-netcode.md` (Phase 7, order 716)
- **Condition**: `netcode-spec` is enabled
- **Dependencies**: `netcode-spec`
- **Outputs**: `docs/reviews/architecture-review-netcode.md`
- **Knowledge-base**: `review-netcode`
- **Review passes**: Latency tolerance, bandwidth compliance, cheat resistance, determinism verification (conditional), connection edge cases, matchmaking fairness

#### 16. `ai-behavior-design.md` (Phase 7, order 717)
- **Condition**: `npcAiComplexity` is `simple` or `complex`
- **Dependencies**: `system-architecture`, `game-design-document`
- **Outputs**: `docs/ai-behavior-design.md`
- **Reads**: `performance-budgets`
- **Knowledge-base**: `game-ai-patterns`
- **Structure**: AI architecture (behavior trees vs. GOAP vs. utility AI vs. state machines — decision framework), pathfinding (NavMesh config, dynamic obstacles), perception systems (sight, hearing, aggro), difficulty scaling, NPC scheduling/routines (if applicable), boss AI patterns, companion AI behavior

#### 17. `economy-design.md` (Phase 8, order 868)
- **Condition**: `economy` is not `none`
- **Dependencies**: `game-design-document`
- **Outputs**: `docs/economy-design.md`
- **Knowledge-base**: `game-economy-design`
- **Structure** — explicitly separates progression and monetization:
  - **Progression section** (when economy is `progression` or `both`): internal resource types, earn rates, crafting recipes, loot tables, XP curves, difficulty scaling, balance simulation
  - **Monetization section** (when economy is `monetized` or `both`): IAP catalog, pricing tiers, regional pricing, battle pass/season design, probability disclosure
  - Anti-exploitation measures: spending caps, parental controls, refund policy
  - Legal compliance per jurisdiction (China probability disclosure, Belgium/Netherlands nuanced post-2022 FIFA ruling, COPPA)

#### 18. `review-economy.md` (Phase 8, order 869)
- **Condition**: `economy-design` is enabled
- **Dependencies**: `economy-design`
- **Outputs**: `docs/reviews/specification-review-economy.md`
- **Knowledge-base**: `review-game-economy`
- **Review passes**: Inflation/deflation trajectory, exploit vector identification (duplication, overflow, timing), ethical monetization checklist, pay-to-win detection, legal compliance per target market, earn rate vs. engagement projection

#### 19. `online-services-spec.md` (Phase 8, order 871)
- **Condition**: `onlineServices` is not empty
- **Dependencies**: `system-architecture`
- **Outputs**: `docs/online-services-spec.md`
- **Reads**: `game-design-document`, `netcode-spec` (if exists)
- **Knowledge-base**: `game-networking`, `game-liveops-analytics`
- **Structure**: Identity/authentication service, leaderboard service design, matchmaking service (if applicable), entitlements/DLC management, remote config (feature flags, A/B), player reporting and moderation, friend lists/social features, cloud save orchestration (if persistence is cloud)

#### 20. `modding-ugc-spec.md` (Phase 8, order 872)
- **Condition**: `hasModding` is `true`
- **Dependencies**: `system-architecture`
- **Outputs**: `docs/modding-spec.md`
- **Reads**: `game-design-document`, `security`
- **Knowledge-base**: `game-modding-ugc`
- **Structure**: Mod API surface definition, packaging format, sandboxing and security, compatibility/versioning strategy (mod breaks across game updates), content moderation pipeline, distribution (Steam Workshop, mod.io, custom — if online services available; local file-based loading if offline-only), platform certification implications, creator documentation

#### 21. `save-system-spec.md` (Phase 8, order 873)
- **Condition**: `persistence` is not `none`
- **Dependencies**: `system-architecture`, `domain-modeling`
- **Outputs**: `docs/save-system-spec.md`
- **Reads**: `economy-design` (if exists), `narrative-bible` (if exists)
- **Knowledge-base**: `game-save-systems`
- **Structure**: What's persisted (adapts by persistence level), serialization format, save slot design, cloud save integration (platform-specific: Steam Cloud, PS Plus, Xbox Cloud, iCloud, Google Play Games), cloud conflict resolution strategy, auto-save trigger design, corruption detection and recovery (checksums, redundant saves), anti-tamper for save files, account/profile binding, suspend/resume handling, migration strategy for format changes between versions, rollback/testing strategy

#### 22. `localization-plan.md` (Phase 8, order 874)
- **Condition**: `supportedLocales.length > 1`
- **Dependencies**: `game-design-document`
- **Outputs**: `docs/localization-plan.md`
- **Reads**: `game-ui-spec`, `narrative-bible` (if exists)
- **Knowledge-base**: `game-localization`
- **Structure**: Target languages with scope per language (full/partial/text-only), string management system (string IDs, extraction pipeline), font support (CJK character sets, RTL layout), UI text expansion budgets (~30% for German, ~40% for Finnish), VO localization plan (dub vs. sub per language, recording specs), cultural adaptation notes (imagery, gestures, color symbolism), LQA process (in-context review methodology), store listing localization

#### 23. `live-ops-plan.md` (Phase 9, order 963)
- **Condition**: `onlineServices` includes `live-ops`
- **Dependencies**: `game-design-document`, `analytics-telemetry`
- **Outputs**: `docs/live-ops-plan.md`
- **Reads**: `operations` (if exists)
- **Knowledge-base**: `game-liveops-analytics`
- **Structure**: Content cadence (update frequency, seasonal schedule), event system design (limited-time, recurring), hotfix deployment protocol (zero-downtime), server maintenance windows and player communication, content update pipeline (create/test/stage/deploy/verify), post-launch roadmap structure

#### 24. `platform-cert-prep.md` (Phase 9, order 964)
- **Condition**: `targetPlatforms` includes any console, mobile, or VR/AR platform
- **Dependencies**: `game-accessibility`, `performance-budgets`, `game-ui-spec`, `input-controls-spec`
- **Outputs**: `docs/platform-cert-checklist.md`
- **Reads**: `save-system-spec` (if exists), `netcode-spec` (if exists), `audio-design`, `localization-plan` (if exists), `online-services-spec` (if exists), `modding-ugc-spec` (if exists)
- **Knowledge-base**: `game-platform-certification`
- **Moved to Phase 9** (from Phase 13) — cert requirements should shape task decomposition, not just validate after
- **Structure**: Per-platform compliance checklist (only for targeted platforms — Sony TRC, Microsoft XR, Nintendo Lotcheck, App Store, Google Play, Steam Deck compatibility), feature-to-cert-requirement mapping, sign-in/sign-out behavior, entitlement handling, achievements/trophies compliance, parental controls, age ratings/store metadata, controller disconnect behavior, suspend/resume handling, error message requirements, shell/system UI behavior, pre-submission audit results, known waiver requests, certification timeline estimate

### Dependency Graph Summary

```
Phase 1: create-vision → create-prd → review-prd → game-design-document → review-gdd
                                                                              ↓
Phase 1: review-prd → user-stories (also depends on review-gdd)
                                                                              ↓
Phase 2: review-gdd + tech-stack → performance-budgets
Phase 5: domain-modeling → narrative-bible (conditional)
Phase 7: system-architecture → netcode-spec → review-netcode (conditional)
Phase 7: system-architecture → ai-behavior-design (conditional)
Phase 8: game-accessibility → input-controls-spec → game-ui-spec → review-game-ui
Phase 8: content-structure-design → art-bible, audio-design (via dependency)
Phase 8: economy-design → review-economy (conditional)
Phase 8: online-services-spec, modding-ugc-spec, save-system-spec, localization-plan (conditional, various deps)
Phase 9: playtest-plan, analytics-telemetry → live-ops-plan (conditional)
Phase 9: platform-cert-prep (reads widely)
```

---

## 5. Knowledge Entries (29)

### content/knowledge/game/ (24 entries)

| # | File | Injected Into | Key Content |
|---|------|--------------|-------------|
| K1 | `game-design-document.md` | game-design-document, create-prd, user-stories, implementation-plan, cross-phase-consistency, critical-path-walkthrough | GDD structure and markdown template, game pillars craft ("X over Y"), core loop patterns (engagement/retention), mechanics documentation (inputs/rules/outputs/feedback), progression archetypes. **Split internally**: vision/pillars section vs. systems/mechanics section. |
| K2 | `game-engine-selection.md` | tech-stack, coding-standards, adrs, system-architecture | Evaluation framework for Unity vs Unreal vs Godot vs custom, middleware selection matrices (physics, audio, networking, UI), rendering API considerations, platform SDK requirements. **Split internally**: engine evaluation vs. middleware evaluation. |
| K3 | `game-asset-pipeline.md` | git-workflow, art-bible, project-structure, dev-env-setup | Asset naming taxonomies by engine, per-type specifications (poly budgets, texture sizes, audio formats), DCC tool chains (Maya/Blender/Substance/Houdini export flows), Git LFS configuration patterns and `.gitattributes` templates, file locking protocols. |
| K4 | `game-binary-vcs-strategy.md` | git-workflow | Git LFS deep dive, Perforce/PlasticSCM comparison for asset-heavy projects, large repo performance tuning, lock file protocols, CI for binary assets. |
| K5 | `game-performance-budgeting.md` | performance-budgets, review-testing, tech-stack, art-bible, audio-design, game-ui-spec, system-architecture, review-architecture | Frame budget allocation methodology with sample tables, memory budget per platform, GPU profiling approaches, draw call optimization, loading time patterns, thermal throttling for mobile, profiling tool recommendations per engine. |
| K6 | `game-testing-strategy.md` | tdd, story-tests, review-testing, add-e2e-testing, create-evals, implementation-plan, git-workflow | Simulation logic testing vs. visual/integration testing (not "deterministic" — per MMR correction), visual regression (screenshot comparison), performance regression (frame timing), soak testing (24-72hr), balance validation, playtest protocols, compatibility matrix, cert test procedures, automated replay systems, CI integration for game test types. |
| K7 | `game-economy-design.md` | economy-design, review-economy, user-stories, analytics-telemetry, security | Virtual currency design, earn/sink balancing with faucet/sink mathematical examples, loot table probability math, monetization models, battle pass structure, economy simulation templates, predatory pattern avoidance, legal requirements by jurisdiction (nuanced — China disclosure, Belgian/Dutch post-2022, COPPA). |
| K8 | `game-accessibility.md` | game-accessibility, game-ui-spec, audio-design, game-design-document, platform-cert-prep, user-stories | XAG as best-practice guidance (not compliance checklist), game-specific a11y implementation patterns, difficulty as accessibility, CVAA conditional on communication features, feature checklists and decision patterns, low-cost high-impact features, platform-specific requirements. |
| K9 | `game-audio-design.md` | audio-design | Audio middleware architecture (Wwise vs FMOD decision framework), bus/mixer hierarchy, spatial audio, adaptive music systems (horizontal re-sequencing, vertical layering, stingers), VO production pipeline, interactive loudness workflow with platform-specific LUFS targets (not broadcast standards), compression per platform. |
| K10 | `game-networking.md` | netcode-spec, review-netcode, security, review-security, operations, api-contracts, review-api, platform-parity-review | Client-server vs P2P tradeoffs, tick rate selection, client prediction, server reconciliation, lag compensation, bandwidth optimization, anti-cheat patterns, NAT traversal, relay services. **Split internally**: low-level netcode vs. social/matchmaking services. |
| K11 | `game-platform-certification.md` | platform-cert-prep, platform-parity-review, tech-stack, save-system-spec, game-accessibility, operations | Sony TRC common requirements and failure points, Microsoft XR requirements, Nintendo Lotcheck, App Store/Google Play guidelines, Steam Deck compatibility review (not "certification" — per MMR correction), certification timelines, pre-check checklists per platform, waiver best practices. |
| K12 | `game-ui-patterns.md` | game-ui-spec | HUD patterns (minimal, contextual, diegetic, meta), menu hierarchy conventions, controller-first navigation (focus management, D-pad flow), settings screen structure, split-screen adaptation, minimap patterns, damage indicators, quest tracking UI, commerce/store flows. |
| K13 | `game-save-systems.md` | save-system-spec, domain-modeling, security, platform-cert-prep, database-schema | Save format options (binary vs JSON vs SQLite), versioning and migration, cloud save platform integration (Steam Cloud, PS Plus, Xbox Cloud, iCloud, Google Play Games), auto-save design, corruption detection (checksums, redundant saves), platform-specific save requirements. |
| K14 | `game-project-structure.md` | project-structure, git-workflow, dev-env-setup | Engine-specific directory conventions (Unity: Assets/Scripts/Scenes, Unreal: Content/Source/Config, Godot: res://), asset organization, scene/level management, game data tables, shader/VFX directories, plugin organization. |
| K15 | `game-domain-patterns.md` | domain-modeling, story-tests, system-architecture | ECS and DDD as **mutually exclusive options per layer** (ECS for simulation, DDD for meta-game/backend — per MMR correction), game state machines, resource/inventory patterns, player progression models, combat system modeling, game-specific ubiquitous language. Tightly scoped to modeling language and invariants, not architecture. |
| K16 | `game-milestone-definitions.md` | implementation-plan, implementation-playbook, game-design-document, playtest-plan | Milestone definitions with gate templates (concept, prototype, vertical slice, first playable, alpha, beta, RC, gold, live), content-complete vs feature-complete distinction, milestone-to-task-wave mapping, vertical slice as "is this fun?" gate. |
| K17 | `game-narrative-design.md` | narrative-bible | Dialogue tree design patterns, barks and ambient dialogue, lore bible structure, branching narrative frameworks, narrative integration with level design, localization hooks for narrative content. |
| K18 | `game-level-content-design.md` | content-structure-design | Level metrics (jump height, door widths, player speed), greyboxing standards, flow and pacing principles, streaming strategies (world partition/chunks), encounter design, procedural generation rulesets, open-world POI distribution. |
| K19 | `game-ai-patterns.md` | ai-behavior-design | NavMesh configuration, behavior tree design, GOAP, utility AI, finite state machines, perception systems, encounter scripting, difficulty scaling approaches, companion AI patterns. |
| K20 | `game-input-systems.md` | input-controls-spec | Input abstraction patterns, action mapping, dead zones and sensitivity, aim assist/friction implementation, haptic feedback (DualSense, HD rumble), cross-play input fairness, controller disconnect handling, IME/text input. |
| K21 | `game-liveops-analytics.md` | analytics-telemetry, live-ops-plan, operations, review-operations | Data taxonomy (DAU/MAU, progression funnels, drop-off tracking), A/B testing pipelines, content cadence patterns, seasonal event design, server maintenance communication, post-launch support workflows. |
| K22 | `game-localization.md` | localization-plan | String management systems, font atlas considerations (CJK, RTL), text expansion rules by language, subtitle standards, VO localization workflows (dub vs sub), culturalization guidelines, LQA methodology. |
| K23 | `game-vr-ar-design.md` | performance-budgets, game-ui-spec, input-controls-spec, game-accessibility (conditional sections when targetPlatforms includes vr/ar) | VR comfort and locomotion, stereo rendering, spatial UI design, hand tracking, gaze interaction, motion sickness mitigation, VR-specific certification requirements. |

### content/knowledge/game/ additional entry
| K24 | `game-modding-ugc.md` | system-architecture, security, api-contracts (conditional when hasModding) | Mod API surface design, packaging formats, sandboxing, compatibility/versioning, content moderation pipelines, distribution platforms (Steam Workshop, mod.io). |

### content/knowledge/review/ (5 entries)

| # | File | Injected Into | Key Content |
|---|------|--------------|-------------|
| K25 | `review-game-design.md` | review-gdd | Pillar coherence checks, core loop closure verification, mechanic ambiguity detection, progression curve feasibility, scope vs team/timeline, competitive differentiation. Strict finding template with severity/evidence/remediation. |
| K26 | `review-art-bible.md` | art-bible (review section within step) | Budget consistency with performance-budgets, naming convention completeness, LOD coverage, pipeline validation, platform-specific compression verification. Checklist format. |
| K27 | `review-game-economy.md` | review-economy | Inflation/deflation trajectory analysis, exploit vector identification, ethical monetization checklist, pay-to-win detection, legal compliance per market, earn rate projections. Checklist format. |
| K28 | `review-netcode.md` | review-netcode | Worst-case latency analysis, bandwidth ceiling calculation, cheat surface audit, determinism verification (conditional on lockstep/rollback), disconnect/reconnect handling, matchmaking fairness. |
| K29 | `review-platform-cert.md` | platform-cert-prep | Common TRC/TCR failure points per platform, save data compliance, suspend/resume handling, controller disconnect behavior, error message requirements, trophy/achievement compliance, content rating alignment. Checklist format. |

**Total: 29 knowledge entries** (24 in `game/`, 5 in `review/`)

---

## 6. Conditional Evaluation Logic

### Config Trait → Step Activation Matrix

| Trait Value | Steps Activated |
|-------------|----------------|
| `narrative: light\|heavy` | narrative-bible |
| `multiplayerMode: online\|hybrid` | netcode-spec, review-netcode |
| `npcAiComplexity: simple\|complex` | ai-behavior-design |
| `economy: progression\|monetized\|both` | economy-design, review-economy |
| `onlineServices` not empty | online-services-spec |
| `onlineServices` includes `live-ops` | live-ops-plan |
| `hasModding: true` | modding-ugc-spec |
| `persistence` not `none` | save-system-spec |
| `supportedLocales.length > 1` | localization-plan |
| `targetPlatforms` includes console/mobile/vr/ar | platform-cert-prep |

### Existing Steps — Game-Aware Activation

| Step | Additional Game Condition |
|------|-------------------------|
| `database-schema` | Also enable if `persistence` is `progression`/`cloud` OR `onlineServices` not empty |
| `api-contracts` | Also enable if `multiplayerMode` online/hybrid OR `economy` monetized/both OR `hasModding` OR `onlineServices` not empty |
| `operations` | Also enable if `multiplayerMode` online/hybrid OR `onlineServices` not empty |
| `platform-parity-review` | Also check `targetPlatforms.length >= 2` |
| `add-e2e-testing` | Always enable for games (automated replay, visual regression) |
| `design-system` | Disabled by game overlay |
| `ux-spec` / `review-ux` | Disabled by game overlay |

### Signal Source

**Init wizard answers are the sole signal source.** No GDD keyword fallback — keyword matching is unreliable (negation problem, synonym problem, confirmed by both MMR reviewers).

---

## 7. Init Wizard

See Section 2d for the complete wizard flow. Summary:

- 3 core questions (always asked): engine, multiplayer, target platforms
- 3 conditional follow-ups: online services, content structure, economy
- 5 advanced questions (behind opt-in gate with sensible defaults): narrative, locales, AI complexity, modding, persistence
- Requires new UI primitives: `select()`, `multiSelect()`, `multiInput()`
- Results stored in `config.yml` under `project.game-config`

---

## 8. Prerequisite Work

These must be completed before game support can fully function:

### P1: Fix `reads` Assembly (HIGH — blocks reads-overrides)

`src/cli/commands/run.ts` builds context from dependency steps only. The `reads` field is declared in frontmatter but not wired into assembly. Must fix:
- Load artifacts from `reads` array into step context during assembly
- Validate read targets exist and have produced output
- Gracefully handle missing reads (warn, not hard-fail)
- This is a general scaffold improvement, not game-specific

### P2: Extend Preset Loader for Overlays (HIGH — blocks overlay system)

`src/core/assembly/preset-loader.ts` only parses `name`, `description`, `default_depth`, `steps`. Must:
- Create `loadOverlay()` function (or extend `loadPreset()`)
- Parse `knowledge-overrides`, `reads-overrides`, `step-overrides`
- Validate override targets exist
- Deduplicate after append operations

### P3: Centralize Pipeline Resolution (HIGH — blocks overlay system)

Preset resolution is duplicated across `run.ts`, `status.ts`, `next.ts`, `rework.ts`, `list.ts`, `build.ts`. Must:
- Create a single "resolved pipeline" layer that all commands consume
- Move overlay resolution into this centralized layer
- All commands use the same resolved step map, knowledge, reads, and dependencies

### P4: Overlay Resolution in Methodology Resolver (HIGH — blocks game activation)

`src/core/assembly/methodology-resolver.ts` must:
- After methodology resolution, check `config.project.projectType`
- If overlay exists, apply step-overrides, dependency-overrides, knowledge-overrides, reads-overrides
- Handle dependency remapping when overlay disables steps
- Warn on broken dependency chains

### P5: Zod Schema for gameConfig (MEDIUM — blocks validation)

`src/config/schema.ts` must:
- Add `projectType` enum validation
- Add `gameConfig` object schema with defaults
- Cross-field rule: gameConfig only when projectType === 'game'

### P6: Wizard UI Primitives (MEDIUM — blocks init wizard)

`src/cli/output/context.ts` must add:
- `select()` for single-choice from list
- `multiSelect()` for multi-choice
- `multiInput()` for comma-separated values

### P7: Disabled-Dep Handling in run.ts (MEDIUM — blocks overlay disablement)

`src/cli/commands/run.ts` currently hard-fails on `DEP_UNMET`. Must align with `eligibility.ts` which already treats disabled deps as satisfied:
- Overlay-disabled steps should be treated as "satisfied" dependencies
- Prevents `DEP_UNMET` errors when game overlay disables design-system/ux-spec/review-ux

### P8: Frontmatter Validation for New Steps (LOW — blocks make validate)

`scripts/validate-frontmatter.sh` and TypeScript validation must accept:
- New step names without erroring
- New phase assignments (no new phases, but new orders within existing phases)
- New knowledge-base entry names

### P9: Brownfield / Adopt Support (LOW — future enhancement)

`scaffold adopt` for existing game projects is not covered in this spec. The init wizard is the sole signal source for gameConfig. Future work:
- `scaffold adopt` should detect game engine files (Unity .meta, Unreal .uproject, Godot project.godot) and pre-populate gameConfig
- Signal detection can infer engine, target platforms, and some sub-features from existing project files

---

## Appendix: Counts Summary

| Category | Count |
|----------|-------|
| New pipeline steps | 24 (12 always-enabled, 12 conditional) |
| Existing steps modified (via overlay) | 30+ (knowledge injection) |
| Existing steps disabled | 3 (design-system, ux-spec, review-ux) |
| Existing steps with reads remapped | 7 |
| New knowledge entries | 29 (24 game/, 5 review/) |
| New gameConfig traits | 11 |
| Init wizard questions | 11 (3 core + 3 conditional + 5 advanced) |
| Engine prerequisite tasks | 9 |
| New phases | 0 |
| Existing steps that apply as-is | 40 (67% of original 60) |
