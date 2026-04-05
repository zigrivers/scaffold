---
name: save-system-spec
description: Specify persistence strategy, serialization format, save slots, cloud save, corruption detection, anti-tamper, and migration
summary: "Specifies the save system — what data is persisted (adapts by persistence level), serialization format, save slot management, cloud save per platform, auto-save strategy, corruption detection and recovery, anti-tamper measures, and save format migration strategy for patches and DLC."
phase: "specification"
order: 873
dependencies: [system-architecture, domain-modeling]
outputs: [docs/save-system-spec.md]
conditional: "if-needed"
reads: [economy-design, narrative-bible]
knowledge-base: [game-save-systems]
---

## Purpose
Specify the save system — the persistence layer that captures, stores,
restores, and migrates player state across sessions. The save system sits at
the intersection of gameplay design (what matters enough to persist), engine
architecture (when and how to serialize), platform requirements (cloud save
APIs, storage quotas), and security (anti-tamper for competitive or economy-
critical data).

Save system design decisions cascade widely. The serialization format affects
load times and save file size. The persistence granularity affects what players
lose on crash vs. what they can exploit via save-scumming. The migration
strategy determines whether patches and DLC can ship without corrupting
existing saves. Cloud save conflict resolution determines whether players lose
progress when switching devices.

Three persistence levels exist, each requiring different engineering depth:

1. **Minimal persistence**: Settings, preferences, and high scores only. No
   gameplay state survives between sessions beyond configuration.
2. **Session persistence**: Game progress is saved at checkpoints or manual
   save points. The canonical model for single-player narrative and campaign
   games.
3. **Continuous persistence**: Game state is persisted in near-real-time
   (auto-save, server-authoritative state). Required for live-service games,
   MMOs, and games where progress loss is unacceptable.

This specification adapts its depth to the project's persistence level — a
minimal-persistence game needs a settings serializer, not a cloud save
conflict resolution strategy.

## Conditional Evaluation
Enable when: the project config indicates persistence is not `none` — the
game saves any player state between sessions, whether settings, progress,
inventory, narrative choices, world state, or any data that must survive
application exit and relaunch.

Skip when: persistence is `none` — the game is entirely session-based with no
state carried between launches. Pure arcade games, party games with no
unlock systems, and ephemeral multiplayer-only experiences with server-
authoritative state (no client save) do not need a save system specification.

## Inputs
- docs/system-architecture.md (required) — data flow, storage layer, serialization strategy, platform abstraction
- docs/domain-models/ (required) — entity definitions, relationships, and state that must be persisted
- docs/plan.md (required) — target platforms informing cloud save APIs and storage quotas
- docs/economy-design.md (optional, forward-read) — currency balances, inventory, transaction history requiring tamper-resistant persistence
- docs/narrative-bible.md (optional, forward-read) — narrative state, branching flags, relationship values, quest progress requiring persistence

## Expected Outputs
- docs/save-system-spec.md — persistence scope, serialization format, save slot
  management, cloud save integration, auto-save strategy, corruption detection,
  anti-tamper measures, and migration strategy

## Quality Criteria
- (mvp) Persistence scope defined: explicit list of what is saved (player progress, inventory, settings, world state) and what is not saved (transient visual state, cached data, derived values) with rationale for each exclusion
- (mvp) Serialization format specified: binary vs text (JSON, MessagePack, FlatBuffers, custom), versioning header, compression strategy, target save file size budget
- (mvp) Save slot management: number of slots (or slotless), slot metadata (timestamp, playtime, thumbnail, location), manual save vs auto-save slot allocation
- (mvp) Auto-save strategy: trigger conditions (checkpoint reached, zone transition, timer interval), player notification, performance budget for serialization (max frame time impact)
- (mvp) Corruption detection: checksum or hash validation on load, recovery strategy (fall back to previous save, partial recovery, notify player), write-ahead or atomic write to prevent partial-write corruption
- (deep) Cloud save integration per platform: Steam Cloud, PlayStation Plus Cloud, Xbox Cloud Saves, iCloud, Google Play saved games — API mapping, conflict resolution strategy (last-write-wins, merge, user-choice), quota management
- (deep) Anti-tamper measures: signed save files for economy-critical or competitive data, server-side validation for live-service games, tamper detection response (flag vs reject vs re-sync)
- (deep) Save format migration strategy: version field in save header, forward-compatible schema design, migration functions per version increment, rollback plan if migration fails, DLC-aware save extension (new fields without breaking base game saves)
- (deep) Performance profiling: serialization/deserialization benchmarks per platform, async save to prevent hitching, memory budget for save buffers, streaming save for large world states
- (deep) Platform certification compliance: required save behaviors per platform (PS5 Activities integration, Xbox Quick Resume state, Switch suspend/resume), mandatory user-facing save indicators

## Methodology Scaling
- **deep**: Full save system specification covering persistence scope analysis,
  serialization format with benchmarks, save slot management, cloud save per
  platform with conflict resolution, auto-save with performance profiling,
  corruption detection and recovery, anti-tamper for competitive/economy data,
  migration strategy with DLC awareness, and platform certification compliance.
  15-25 pages.
- **mvp**: Persistence scope, serialization format, save slots, auto-save
  strategy, and corruption detection. 4-8 pages.
- **custom:depth(1-5)**:
  - Depth 1: persistence scope and serialization format only (settings and minimal state).
  - Depth 2: add save slot management, auto-save strategy, and basic corruption detection.
  - Depth 3: add cloud save for primary platform, anti-tamper for economy data, and save format versioning.
  - Depth 4: add multi-platform cloud save with conflict resolution, migration strategy with DLC awareness, and performance profiling.
  - Depth 5: full specification with platform certification compliance, save analytics (save frequency, corruption rates, cloud sync failures), automated save system testing framework, and save-game replay for debugging.

## Mode Detection
Check for docs/save-system-spec.md. If it exists, operate in update mode:
read existing spec and diff against current domain model and system
architecture. Preserve existing serialization format, save slot structure,
and cloud save strategy. Update persistence scope if domain model added new
entities. Update migration strategy if save format version needs incrementing.

## Update Mode Specifics
- **Detect prior artifact**: docs/save-system-spec.md exists
- **Preserve**: serialization format, save slot structure, cloud save conflict
  resolution strategy, anti-tamper approach, existing migration functions
- **Triggers for update**: domain model changed entity definitions requiring
  new persisted fields, system architecture changed storage layer or platform
  abstraction, economy-design added new currency types or inventory systems,
  narrative-bible added new branching flags or quest state, target platforms
  changed (new platform requires new cloud save integration)
- **Conflict resolution**: if domain model changes require new persisted fields
  that would break existing save format, document the migration path explicitly
  — specify the new version number, the migration function from previous
  version, default values for new fields, and the testing strategy for
  migration; never add fields to the save format without incrementing the
  version and providing a migration path
