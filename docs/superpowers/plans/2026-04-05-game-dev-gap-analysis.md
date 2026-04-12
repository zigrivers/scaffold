# Game Development Gap Analysis for Scaffold

**Date**: 2026-04-05
**Status**: Research / Spec
**Goal**: Identify gaps in scaffold's 16-phase documentation pipeline for game development projects, and recommend concrete changes to make scaffold equally effective for game dev.

---

## Table of Contents

1. [Current Pipeline Summary](#1-current-pipeline-summary)
2. [Game Development Documentation Needs](#2-game-development-documentation-needs)
3. [Gap Analysis](#3-gap-analysis)
   - [3.1 Missing Entirely](#31-missing-entirely)
   - [3.2 Needs Game-Specific Adaptation](#32-needs-game-specific-adaptation)
   - [3.3 Applies As-Is](#33-applies-as-is)
   - [3.4 Potentially Irrelevant](#34-potentially-irrelevant)
4. [Recommendations](#4-recommendations)
   - [4.1 New Pipeline Steps](#41-new-pipeline-steps)
   - [4.2 Existing Steps to Modify](#42-existing-steps-to-modify)
   - [4.3 New Knowledge Entries](#43-new-knowledge-entries)
   - [4.4 Methodology Preset](#44-methodology-preset)
   - [4.5 Phase Structure](#45-phase-structure)
   - [4.6 Conditional Logic](#46-conditional-logic)
5. [Implementation Priority](#5-implementation-priority)

---

## 1. Current Pipeline Summary

Scaffold's pipeline has 16 phases with 60 pipeline steps and 61 knowledge entries.

### Phase Overview

| Phase | Name | Steps | Purpose |
|-------|------|-------|---------|
| 0 | Product Vision | 3 | Vision statement, review, innovation |
| 1 | Product Definition | 6 | PRD, user stories, reviews, innovation |
| 2 | Project Foundation | 5 | Tech stack, coding standards, TDD, project structure, task tracking |
| 3 | Development Environment | 5 | Dev env, git workflow, design system, PR review, AI memory |
| 4 | Testing Integration | 1 | E2E testing (Playwright/Maestro) |
| 5 | Domain Modeling | 2 | Domain models, review |
| 6 | Architecture Decisions | 2 | ADRs, review |
| 7 | System Architecture | 2 | Architecture blueprint, review |
| 8 | Specifications | 6 | Database schema, API contracts, UX spec + reviews |
| 9 | Quality Gates | 8 | Testing review, evals, story tests, operations, security + reviews |
| 10 | Platform Parity | 1 | Multi-platform audit |
| 11 | Consolidation | 2 | CLAUDE.md optimization, workflow audit |
| 12 | Planning | 2 | Implementation plan, review |
| 13 | Validation | 7 | Traceability, consistency, completeness, dependencies, implementability, critical path, scope |
| 14 | Finalization | 3 | Apply fixes/freeze, onboarding guide, implementation playbook |
| 15 | Build | 6 | Single/multi-agent start/resume, new enhancement, quick task |

### Knowledge Base Categories

| Category | Entries | Coverage |
|----------|---------|----------|
| core | 26 | Full-stack dev patterns (API, DB, architecture, testing, security, UX, etc.) |
| execution | 4 | Task claiming, TDD loop, worktree management, enhancement workflow |
| finalization | 3 | Fix/freeze, onboarding, playbook |
| product | 5 | Vision, PRD, gap analysis, innovation |
| review | 14 | Artifact-specific review strategies for every phase |
| tools | 4 | Release management, session analysis, version strategy |
| validation | 7 | Traceability, consistency, completeness, dependencies, implementability, scope, critical path |

### Current Project Type Assumptions

The pipeline currently assumes projects are:
- **Web apps** (React, Vue, Angular, Svelte + backend)
- **Mobile apps** (Expo, React Native)
- **Backend services** (APIs, microservices)
- **CLI tools**

Game development is not addressed. The pipeline has no game engine awareness, no game design document concept, no asset pipeline, no performance budgeting, no platform certification, and no game-specific QA patterns.

---

## 2. Game Development Documentation Needs

Professional game studios produce documentation across disciplines that have no equivalent in traditional software development. This section catalogs what a well-run game project needs.

### 2.1 Game Design

| Document | Purpose | Applies To |
|----------|---------|------------|
| **Game Design Document (GDD)** | Central design bible: mechanics, systems, progression, world, narrative | All games |
| **Game Pillars** | 3-5 core design tenets that guide all decisions (e.g., "every choice matters") | All games |
| **Core Loop Document** | The fundamental play cycle (engage -> challenge -> reward -> repeat) | All games |
| **Feature Specs** | Deep-dive into complex systems (combat, crafting, dialogue, inventory) | Games with complex systems |
| **Narrative / Story Bible** | Lore, characters, dialogue trees, branching narrative structure | Story-driven games |
| **Level Design Documents** | Per-level layouts, encounters, pacing, objectives, environmental storytelling | Games with discrete levels |
| **Economy Design Document** | Virtual currencies, earn/sink rates, loot tables, monetization model | Games with economies |
| **Balancing Spreadsheets** | DPS calculations, difficulty curves, time-to-kill, resource generation rates | Games with combat/progression |

**Why this matters**: Without a GDD, team members build conflicting visions. Without game pillars, subjective "feel" decisions have no north star. Without economy design, free-to-play games hemorrhage players or revenue.

### 2.2 Technical Design

| Document | Purpose | Applies To |
|----------|---------|------------|
| **Engine Architecture Doc** | Engine selection rationale, module overview, plugin architecture | All games |
| **Rendering Pipeline Spec** | Forward vs. deferred, shader stages, post-processing, LOD, culling | 3D games |
| **Physics System Design** | Engine choice, collision layers, tick rate, determinism requirements | Games with physics |
| **Input System Design** | Abstraction layer, rebinding, multi-device (KB/M + controller + touch) | All games |
| **Audio System Architecture** | Middleware (Wwise/FMOD), bus routing, spatial audio, music state machine | All games |
| **Networking Architecture** | Client-server vs. P2P, tick rate, prediction/reconciliation, bandwidth | Multiplayer games |
| **AI System Design** | Behavior trees vs. GOAP vs. utility AI, pathfinding, perception | Games with NPCs |
| **Animation System Design** | State machines, blend trees, IK, root motion policy | Games with animated characters |
| **Save System Design** | Persistence format, cloud save integration, corruption recovery | Games with save/load |
| **Build Pipeline** | Asset cooking, platform-specific variants, CI for game builds | All games |

**Why this matters**: Games must hit 16.6ms frame budgets (60fps). Every subsystem gets a time slice. Architectural mistakes discovered late cost 10-100x more to fix than those caught early.

### 2.3 Art & Assets

| Document | Purpose | Applies To |
|----------|---------|------------|
| **Art Bible / Style Guide** | Visual standards, color palette, mood, reference images | All games with graphics |
| **Asset Naming Conventions** | Strict taxonomy (e.g., `SM_Weapon_Sword_01`, `T_Rock_D`) | All games |
| **Asset Specifications** | Per-type specs: poly budgets, texture sizes, UV rules, compression formats | All games |
| **Asset Import Pipeline** | DCC tool -> engine flow, validation steps, automation | All games |
| **LOD Strategy** | Level-of-detail tiers, distance thresholds, transition methods | 3D games |
| **VCS for Binary Assets** | Git LFS config, lock protocols, large file handling | All games |

**Why this matters**: Game repos are 95%+ binary by size. Wrong asset specs break builds, bust memory budgets, and cause platform cert failures. The asset pipeline is often the single biggest source of team friction.

### 2.4 Audio

| Document | Purpose | Applies To |
|----------|---------|------------|
| **Sound Design Document** | SFX categories, naming conventions, loudness standards (LUFS) | All games |
| **Music Direction** | Style, adaptive layers, transition rules, emotional mapping per scene | All games |
| **Audio Middleware Config** | Wwise/FMOD project structure, bus hierarchy, event naming | Games using middleware |
| **VO Production Plan** | Cast list, recording specs, line count, localization per language | Games with voice acting |

**Why this matters**: Audio is 50% of the player experience. Without a sound design doc, audio work is ad-hoc and inconsistent. Adaptive audio (music that reacts to gameplay) requires upfront architectural planning.

### 2.5 Player Experience

| Document | Purpose | Applies To |
|----------|---------|------------|
| **Onboarding / Tutorial Flow** | How new players learn mechanics (progressive disclosure, gating) | All games |
| **Difficulty Design** | Difficulty curves, adaptive difficulty, assist modes | All games |
| **HUD / Menu Specification** | In-game UI elements, menu hierarchy, settings screens | All games |
| **Controller Layout / Input Mapping** | Default bindings per device, rebinding support | All games |
| **Accessibility Plan** | Per Xbox Accessibility Guidelines (XAG): visual, motor, cognitive, auditory, speech, photosensitivity | All games |

**Why this matters**: First-time user experience determines retention. Difficulty is an accessibility feature (not just preference). ~400 million gamers worldwide have disabilities.

### 2.6 Performance & Platform

| Document | Purpose | Applies To |
|----------|---------|------------|
| **Frame Budget** | Per-system time allocation within 16.6ms (rendering, physics, AI, audio, logic) | All games |
| **Memory Budget** | Per-platform allocation (textures, meshes, audio, physics, scripts) | All games |
| **GPU / Draw Call Budget** | Max draw calls, shader complexity, overdraw limits | 3D games |
| **Loading Time Budget** | Max load times per platform, streaming strategy | All games |
| **Storage / Install Size Budget** | Per-platform install size targets | All games |
| **Battery / Thermal Budget** | CPU/GPU targets for sustained play without throttling | Mobile / handheld games |
| **Platform Cert Checklist** | TRC (Sony), TCR (Microsoft), Lotcheck (Nintendo), store guidelines | Console / mobile games |
| **Target Hardware Specs** | Minimum / recommended specs, platform-specific capability matrix | All games |

**Why this matters**: Performance budgets established early are 10-100x cheaper to meet than those discovered late. Certification failures delay launches by weeks (costing $50K-$500K+ per week for larger titles).

### 2.7 Multiplayer / Online

| Document | Purpose | Applies To |
|----------|---------|------------|
| **Server Architecture** | Authoritative server design, region topology, scaling | Multiplayer games |
| **Netcode Spec** | Tick rate, prediction, reconciliation, lag compensation, bandwidth budget | Multiplayer games |
| **Matchmaking Design** | Skill-based matching, party system, queue design | Multiplayer games |
| **Anti-Cheat Strategy** | Server authority, validation, reporting, banning | Multiplayer games |
| **Live Ops Plan** | Content cadence, seasonal events, hotfix protocol | Games-as-a-service |
| **Leaderboards / Social** | Ranking systems, friend lists, social features | Online games |

### 2.8 Production & QA

| Document | Purpose | Applies To |
|----------|---------|------------|
| **Milestone Definitions** | Concept -> Prototype -> Vertical Slice -> Alpha -> Beta -> RC -> Gold -> Live | All games |
| **Playtest Plan** | Internal/external playtest schedule, structured feedback collection | All games |
| **QA Test Plan** | Game-specific test types beyond standard software QA | All games |
| **Compatibility Matrix** | Hardware configs, OS versions, GPU drivers, peripherals | PC games |
| **Localization Matrix** | Languages, string IDs, VO requirements, cultural adaptation notes | Localized games |
| **Analytics / Telemetry Plan** | Player behavior events, KPIs, funnel analysis, A/B test framework | All games |

**Game QA types not covered by standard software QA:**

| QA Type | Description |
|---------|-------------|
| Fun / Playtest Testing | Is the game enjoyable? Does the core loop engage? |
| Balance Testing | Are weapons/characters/economies fair and fun? |
| Soak Testing | 24-72 hour sessions checking for memory leaks, degradation |
| Certification Testing | Platform TRC/TCR/Lotcheck compliance |
| Compatibility Testing | 100+ GPU/CPU/driver/peripheral configurations (PC) |
| Localization QA (LQA) | In-context review of translated text, VO sync, cultural appropriateness |
| First-Time User Experience (FTUE) | Watching new players attempt tutorial without guidance |

### 2.9 Monetization (Conditional)

| Document | Purpose | Applies To |
|----------|---------|------------|
| **Monetization Design** | IAP catalog, pricing tiers, regional pricing | Free-to-play games |
| **Battle Pass / Season Design** | Tier count, free vs. premium track, time-to-complete | Seasonal games |
| **Loot Box Probability Tables** | Drop rates (legally required in many jurisdictions) | Games with random rewards |
| **Anti-Exploitation Measures** | Spending caps, refund policies, parental controls | Games with purchases |

### 2.10 Legal & Compliance

| Document | Purpose | Applies To |
|----------|---------|------------|
| **Age Rating Prep** | ESRB/PEGI/IARC content descriptors, interactive elements | All published games |
| **COPPA Compliance** | If targeting or accessible to children under 13 | Games with young audience |
| **GDPR / Privacy** | Player data collection, consent, deletion rights | All online games |
| **CVAA Compliance** | Communication features must be accessible (US law) | Games with chat/voice |
| **Loot Box Disclosure** | Probability disclosure (legally required in China, Belgium, Netherlands, etc.) | Games with random purchases |

---

## 3. Gap Analysis

### 3.1 Missing Entirely

These game dev documentation concepts have **no equivalent** in the current pipeline.

| # | Gap | Game Dev Domain | Proposed Phase | Step Type | Priority |
|---|-----|----------------|----------------|-----------|----------|
| M1 | **Game Design Document (GDD)** — core loop, mechanics, systems, progression, game pillars | Game Design | Phase 1 (pre) | New pipeline step | **Must-have** (all games) |
| M2 | **Art Bible / Asset Pipeline** — visual style guide, asset specs (poly/texture budgets), naming conventions, DCC-to-engine import flow, LOD strategy | Art & Assets | Phase 8 (specification) | New pipeline step | **Must-have** (all games with graphics) |
| M3 | **Audio Design Document** — SFX categories, music direction, adaptive audio, middleware config, VO plan | Audio | Phase 8 (specification) | New pipeline step | **Must-have** (all games) |
| M4 | **Performance Budgets** — frame budget (per-system ms allocation), memory budget (per-platform), GPU/draw call budget, loading time targets | Performance | Phase 2 (foundation) | New pipeline step | **Must-have** (all games) |
| M5 | **Game Economy Design** — virtual currencies, earn/sink rates, progression curves, loot tables, monetization model, balancing spreadsheets | Game Design | Phase 8 (specification) | New pipeline step | **Conditional** (games with economies/monetization) |
| M6 | **Platform Certification Prep** — TRC/TCR/Lotcheck checklists, store requirement compliance, cert pre-check audit | Platform | Phase 13 (validation) | New pipeline step | **Conditional** (console/mobile games) |
| M7 | **Narrative / Story Bible** — lore, characters, dialogue trees, branching narrative structure, world-building | Game Design | Phase 5 (modeling) | New pipeline step | **Conditional** (story-driven games) |
| M8 | **Level Design Document** — per-level layouts, encounters, pacing, objectives, environmental storytelling, gating | Game Design | Phase 8 (specification) | New pipeline step | **Conditional** (games with levels) |
| M9 | **Playtest Plan** — internal/external playtest schedule, structured feedback templates, analysis methodology | QA | Phase 9 (quality) | New pipeline step | **Must-have** (all games) |
| M10 | **Live Operations Plan** — content cadence, seasonal events, hotfix protocol, post-launch content roadmap | Production | Phase 9 (quality) | New pipeline step | **Conditional** (games-as-a-service) |
| M11 | **Game Milestone Definitions** — prototype, vertical slice, alpha, beta, RC, gold master with gate criteria | Production | Phase 12 (planning) | New pipeline step or section in implementation-plan | **Must-have** (all games) |
| M12 | **Input System Design** — abstraction layer, multi-device support (KB/M + controller + touch), rebinding, input buffering | Technical | Phase 7 (architecture) | New section in system-architecture or new step | **Must-have** (all games) |
| M13 | **Save System Design** — persistence format, what's saved, cloud save integration, corruption recovery | Technical | Phase 8 (specification) | New pipeline step | **Must-have** (games with save/load) |
| M14 | **Binary Asset VCS Strategy** — Git LFS configuration, lock protocols, large file handling, asset streaming from VCS | Workflow | Phase 3 (environment) | New section in git-workflow | **Must-have** (all games) |
| M15 | **Game Accessibility Plan** — XAG compliance, colorblind modes, input remapping, difficulty as accessibility, subtitle standards, photosensitivity | Player Experience | Phase 8 (specification) or Phase 9 (quality) | New pipeline step | **Must-have** (all games) |
| M16 | **Networking / Netcode Spec** — client-server architecture, tick rate, prediction/reconciliation, bandwidth budget, anti-cheat | Technical | Phase 7 (architecture) | New pipeline step | **Conditional** (multiplayer games) |
| M17 | **AI / NPC Behavior Design** — behavior trees vs. GOAP, pathfinding, perception systems, difficulty scaling | Technical | Phase 7 (architecture) | New section in system-architecture | **Conditional** (games with NPCs) |
| M18 | **Analytics / Telemetry Plan** — player behavior events, KPIs, funnel analysis, A/B testing framework | Production | Phase 9 (quality) | New pipeline step or section in operations | **Conditional** (online/live games) |

### 3.2 Needs Game-Specific Adaptation

These existing steps work for games but need **conditional game-dev sections** or **game-aware variants**.

| # | Existing Step | Phase | What Needs to Change | Priority |
|---|--------------|-------|---------------------|----------|
| A1 | **create-prd.md** | 1 | Add conditional game section: target platforms with hardware specs, input devices, game genre classification, session length targets, player count (single/local co-op/online multiplayer). PRD must reference GDD when `project_type: game`. Feature definitions should distinguish "core mechanics" from "content" from "meta-systems". | Must-have |
| A2 | **user-stories.md** | 1 | Game stories often take the form "As a player, when I [gameplay action], I experience [feedback/outcome]" rather than standard user stories. Need game-specific story patterns: gameplay scenarios, player progression stories, multiplayer interaction stories. Acceptance criteria need "feel" dimensions (responsive within Xms, visual/audio feedback). | Must-have |
| A3 | **tech-stack.md** | 2 | Add game engine selection framework (Unity vs. Unreal vs. Godot vs. custom), middleware evaluation (physics: Box2D/PhysX/Havok; audio: FMOD/Wwise/native; networking: Mirror/Netcode/Photon/custom), rendering pipeline decisions, target platform SDK requirements. Current web/mobile/backend categories insufficient. | Must-have |
| A4 | **tdd.md** | 2 | Add game-specific test types: gameplay unit tests (deterministic logic), visual regression tests (screenshot comparison), performance regression tests (frame time budgets), playtest protocols (structured human testing), soak tests (memory leak detection over hours), balance validation tests. Standard test pyramid doesn't capture game QA needs. | Must-have |
| A5 | **project-structure.md** | 2 | Add game project structure patterns: `assets/` (with sub-dirs by type: models, textures, audio, animations, shaders, VFX, UI), `scenes/` or `levels/`, `scripts/` (gameplay), `plugins/` or `addons/`, `data/` (game data tables, configs), engine-specific conventions (Unity: Assets/, Unreal: Content/, Godot: res://). | Must-have |
| A6 | **design-system.md** | 3 | Current step is web-focused (Tailwind, CSS custom properties, WCAG). Games need: HUD design patterns, menu hierarchy/flow, in-game UI vs. overlay UI, controller-navigable menus, game-specific responsive behavior (split-screen, minimap scaling), UI animation for game feel. Should conditionally swap web design system for game UI system. | Must-have |
| A7 | **git-workflow.md** | 3 | Add Git LFS setup for binary assets, `.gitattributes` for asset file types, file locking for binary assets (textures, models, audio), large repo performance tuning, Perforce/PlasticSCM alternatives discussion for asset-heavy projects. | Must-have |
| A8 | **domain-modeling.md** | 5 | Game domains use different patterns than business software. Need Entity-Component-System (ECS) modeling alongside DDD, game state machines (menu -> gameplay -> pause -> game-over), resource/inventory systems as domain concepts, player progression as bounded context. Ubiquitous language includes game-specific terms (spawn, respawn, cooldown, buff/debuff). | Must-have |
| A9 | **system-architecture.md** | 7 | Add game subsystem architecture template: game loop (update/render cycle), scene/level management, rendering pipeline, physics pipeline, input pipeline, audio pipeline, UI system, save/load system, networking layer (if multiplayer). Current step assumes request/response or event-driven service architecture. | Must-have |
| A10 | **ux-spec.md** | 8 | Add game UX patterns: HUD element placement and information density, menu navigation (controller-first vs. mouse-first), in-game tutorials/tooltips, loading screen design, settings menu structure (graphics, audio, controls, accessibility, gameplay), game-specific responsive (split-screen, aspect ratios). Current step assumes web/mobile app flows. | Must-have |
| A11 | **database-schema.md** | 8 | For online/live games: player profiles, inventories, leaderboards, matchmaking data, analytics events. For single-player: save file schema design. Should conditionally produce either server DB schema or save file format specification. | Conditional |
| A12 | **api-contracts.md** | 8 | For multiplayer/online games: game server API (matchmaking, lobbies, player state sync), leaderboard API, IAP validation API, analytics ingestion API. For modding-capable games: mod API surface. Skip entirely for offline single-player games. | Conditional |
| A13 | **operations.md** | 9 | Add game-specific operations: game server deployment/scaling (autoscaling by player count), hotfix deployment to live game (without downtime), content update pipeline, seasonal event scheduling, server maintenance windows, player-facing status page, rollback for game-breaking bugs. | Conditional |
| A14 | **security.md** | 9 | Add game-specific security: anti-cheat architecture (server authority, client validation), save file tampering prevention, economy exploit prevention (item duplication, currency manipulation), DDoS protection for game servers, player reporting/moderation systems, ban management. OWASP still applies for web-facing services. | Conditional |
| A15 | **platform-parity-review.md** | 10 | Add game-specific platform parity: controller vs. KB/M balance (aim assist), hardware capability differences (Switch vs. PS5), platform-specific features (haptics, adaptive triggers, gyro), cert requirement differences per platform, cross-play considerations. Current step checks feature parity but not hardware/input parity. | Conditional |
| A16 | **story-tests.md** | 9 | Add game test skeleton types: gameplay scenario tests (deterministic), visual baseline tests (screenshot), performance benchmark tests (frame time), integration tests for game systems (physics + collision + damage), balance validation tests (stat calculations). | Must-have |
| A17 | **implementation-plan.md** | 12 | Add game-specific task decomposition: distinguish engine/framework tasks from gameplay tasks from content tasks from art integration tasks. Game milestones (vertical slice, alpha, beta) should map to task waves. Content tasks (levels, characters) follow different patterns than code tasks. | Must-have |
| A18 | **add-e2e-testing.md** | 4 | Add game E2E patterns: automated gameplay replay tests, visual regression via screenshot comparison, performance regression via frame timing, input replay systems. Current step only knows Playwright (web) and Maestro (mobile). | Must-have |

### 3.3 Applies As-Is

These steps work for game development **without modification**.

| Step | Phase | Why It Works |
|------|-------|-------------|
| review-vision.md | 0 | Review methodology is domain-agnostic |
| innovate-vision.md | 0 | Strategic innovation exploration works for games |
| review-prd.md | 1 | Review methodology is domain-agnostic |
| innovate-prd.md | 1 | Feature-level innovation works for games |
| review-user-stories.md | 1 | Story review methodology is domain-agnostic |
| innovate-user-stories.md | 1 | UX innovation applicable to games |
| coding-standards.md | 2 | Code conventions apply to game code (C#, C++, GDScript, etc.) |
| beads.md | 2 | Task tracking is project-type-agnostic |
| dev-env-setup.md | 3 | Dev environment setup is generic (though engine-specific commands differ) |
| automated-pr-review.md | 3 | Code review is domain-agnostic |
| ai-memory-setup.md | 3 | AI memory management is domain-agnostic |
| review-domain-modeling.md | 5 | Review methodology is domain-agnostic (once domain-modeling is adapted) |
| adrs.md | 6 | ADRs apply to games (engine choice, networking model, physics approach are all decisions) |
| review-adrs.md | 6 | Review methodology is domain-agnostic |
| review-architecture.md | 7 | Review methodology is domain-agnostic (once architecture is adapted) |
| review-database.md | 8 | Review applies if game has a database |
| review-api.md | 8 | Review applies if game has APIs |
| review-ux.md | 8 | Review applies (once UX spec is adapted) |
| review-testing.md | 9 | Review applies (once testing strategy is adapted) |
| create-evals.md | 9 | Eval methodology is domain-agnostic |
| review-operations.md | 9 | Review applies if game has operations |
| review-security.md | 9 | Review applies (once security is adapted) |
| claude-md-optimization.md | 11 | CLAUDE.md optimization is domain-agnostic |
| workflow-audit.md | 11 | Workflow consistency audit is domain-agnostic |
| implementation-plan-review.md | 12 | Review methodology is domain-agnostic |
| traceability-matrix.md | 13 | Traceability is domain-agnostic |
| cross-phase-consistency.md | 13 | Consistency checking is domain-agnostic |
| decision-completeness.md | 13 | Decision completeness is domain-agnostic |
| dependency-graph-validation.md | 13 | Dependency validation is domain-agnostic |
| implementability-dry-run.md | 13 | Implementability checking is domain-agnostic |
| critical-path-walkthrough.md | 13 | Critical path analysis is domain-agnostic |
| scope-creep-check.md | 13 | Scope management is domain-agnostic |
| apply-fixes-and-freeze.md | 14 | Fix/freeze process is domain-agnostic |
| developer-onboarding-guide.md | 14 | Onboarding is domain-agnostic (content adapts to project) |
| implementation-playbook.md | 14 | Playbook structure is domain-agnostic |
| single-agent-start.md | 15 | TDD execution loop is domain-agnostic |
| single-agent-resume.md | 15 | Resume workflow is domain-agnostic |
| multi-agent-start.md | 15 | Worktree execution is domain-agnostic |
| multi-agent-resume.md | 15 | Resume workflow is domain-agnostic |
| new-enhancement.md | 15 | Enhancement workflow is domain-agnostic |
| quick-task.md | 15 | Quick task workflow is domain-agnostic |

**40 of 60 steps** (67%) apply as-is or with only minor content adaptation. The pipeline's architecture is fundamentally sound for games — the gaps are in domain-specific content, not process.

### 3.4 Potentially Irrelevant

These steps may not apply to **most** game projects, though they remain relevant for specific game types.

| Step | Phase | When Irrelevant | When Still Relevant |
|------|-------|-----------------|---------------------|
| database-schema.md | 8 | Single-player offline games (no traditional database) | Online/multiplayer games with player accounts, leaderboards, inventories |
| api-contracts.md | 8 | Single-player offline games (no API layer) | Multiplayer games, games-as-a-service, games with server backends |
| review-database.md | 8 | When database-schema is skipped | When database-schema is produced |
| review-api.md | 8 | When api-contracts is skipped | When api-contracts is produced |
| design-system.md | 3 | Games that use engine-native UI (Unity UI Toolkit, Unreal UMG) — web design tokens don't apply | Web-based games, games with HTML overlay UI, Electron-wrapped games |
| add-e2e-testing.md | 4 | Games without web or mobile app components (pure native game) | Web games, mobile games with app store presence, games with companion apps |
| platform-parity-review.md | 10 | Single-platform games | Multi-platform games (PC + console, mobile + PC, etc.) |
| operations.md | 9 | Single-player offline games with no backend | Online games, games-as-a-service, games with server infrastructure |

**Note**: The conditional evaluation logic already in scaffold (steps self-skip based on project characteristics) handles most of these cases. The existing `conditional` frontmatter pattern should be extended with game-aware conditions.

---

## 4. Recommendations

### 4.1 New Pipeline Steps

#### Must-Have (All Game Projects)

| # | Step Name | Phase | Order | Description |
|---|-----------|-------|-------|-------------|
| N1 | `game-design-document.md` | 1 (pre) | 115 | Create GDD: game pillars, core loop, mechanics, progression systems, game world. Runs alongside or replaces PRD for game projects. References vision.md. Produces `docs/game-design.md`. |
| N2 | `review-gdd.md` | 1 (pre) | 116 | Multi-pass review of GDD: pillar coherence, mechanic completeness, progression clarity, scope feasibility. Same review framework as other review steps. |
| N3 | `performance-budgets.md` | 2 (foundation) | 225 | Define frame budgets (per-system ms allocation), memory budgets (per-platform), GPU budgets, loading time targets, storage budgets. Produces `docs/performance-budgets.md`. |
| N4 | `game-ui-spec.md` | 8 (specification) | 835 | HUD specification, menu hierarchy, controller navigation, settings screens, accessibility UI. Game-specific alternative/supplement to `ux-spec.md`. Produces `docs/game-ui-spec.md`. |
| N5 | `art-bible.md` | 8 (specification) | 840 | Art style guide, asset specs (poly/texture budgets per type), naming conventions, DCC-to-engine pipeline, LOD strategy. Produces `docs/art-bible.md`. |
| N6 | `audio-design.md` | 8 (specification) | 845 | Sound design spec, music direction, adaptive audio architecture, middleware config, VO plan. Produces `docs/audio-design.md`. |
| N7 | `playtest-plan.md` | 9 (quality) | 935 | Internal/external playtest schedule, feedback templates, analysis methodology, fun metrics. Produces `docs/playtest-plan.md`. |
| N8 | `game-accessibility.md` | 9 (quality) | 940 | XAG-aligned accessibility plan: visual, motor, cognitive, auditory, speech, photosensitivity. Difficulty as accessibility. Produces `docs/game-accessibility.md`. |

#### Conditional (Specific Game Types)

| # | Step Name | Phase | Order | Condition | Description |
|---|-----------|-------|-------|-----------|-------------|
| N9 | `economy-design.md` | 8 (specification) | 850 | `has_economy: true` or `monetization: f2p` | Virtual currencies, earn/sink rates, loot tables, monetization model. Produces `docs/economy-design.md`. |
| N10 | `review-economy.md` | 8 (specification) | 851 | When economy-design exists | Review for balance, exploit potential, ethical monetization, legal compliance. |
| N11 | `narrative-bible.md` | 5 (modeling) | 515 | `has_narrative: true` | Lore, characters, dialogue structure, branching narrative. Produces `docs/narrative-bible.md`. |
| N12 | `level-design.md` | 8 (specification) | 855 | `has_levels: true` | Per-level documentation template: layout, encounters, pacing, objectives. Produces `docs/levels/`. |
| N13 | `netcode-spec.md` | 7 (architecture) | 715 | `multiplayer: true` | Client-server architecture, tick rate, prediction/reconciliation, bandwidth budget. Produces `docs/netcode-spec.md`. |
| N14 | `review-netcode.md` | 7 (architecture) | 716 | When netcode-spec exists | Review for latency tolerance, cheat resistance, bandwidth, determinism. |
| N15 | `live-ops-plan.md` | 9 (quality) | 945 | `live_service: true` | Content cadence, seasonal events, hotfix protocol, server maintenance. Produces `docs/live-ops-plan.md`. |
| N16 | `platform-cert-prep.md` | 13 (validation) | 1315 | `platforms` includes console or mobile store | TRC/TCR/Lotcheck compliance audit, store requirement verification. Produces `docs/platform-cert-checklist.md`. |
| N17 | `save-system-spec.md` | 8 (specification) | 860 | `has_save_system: true` | Save file format, what's persisted, cloud save integration, corruption recovery. Produces `docs/save-system-spec.md`. |
| N18 | `analytics-telemetry.md` | 9 (quality) | 950 | `has_analytics: true` or `live_service: true` | Player behavior events, KPIs, funnel analysis, A/B testing. Produces `docs/analytics-plan.md`. |

**Total new steps: 18** (8 must-have + 10 conditional)

### 4.2 Existing Steps to Modify

These steps need conditional game-dev sections added.

| # | Step | Change Type | What to Add |
|---|------|-------------|-------------|
| E1 | `create-prd.md` | Conditional section | When `project_type: game`: target platforms with hardware specs, input devices, genre classification, session length, player count. Link to GDD. Feature definitions split into core mechanics / content / meta-systems. |
| E2 | `user-stories.md` | Conditional section | When `project_type: game`: player-centric story templates ("As a player, when I [action], I experience [feedback]"), gameplay scenario stories, "feel" acceptance criteria (response time, feedback quality). |
| E3 | `tech-stack.md` | Conditional section | When `project_type: game`: game engine selection framework (Unity/Unreal/Godot/custom), middleware evaluation matrix (physics, audio, networking, UI), rendering API considerations, platform SDK requirements. |
| E4 | `tdd.md` | Conditional section | When `project_type: game`: gameplay unit tests (deterministic logic), visual regression tests, performance regression tests (frame time budgets), soak test protocol, balance validation tests, playtest-informed test cases. |
| E5 | `project-structure.md` | Conditional section | When `project_type: game`: engine-specific directory conventions (Unity Assets/, Unreal Content/, Godot res://), asset directories by type, scene/level organization, game data tables, shader/VFX directories. |
| E6 | `design-system.md` | Conditional swap | When `project_type: game`: replace web design system with game UI system spec (HUD patterns, menu patterns, controller-navigable UI, game-specific responsive behavior). Or skip if `game-ui-spec.md` covers this. |
| E7 | `git-workflow.md` | Conditional section | When `project_type: game`: Git LFS setup, `.gitattributes` for binary assets, file locking for textures/models/audio, large repo tuning. Alternative VCS discussion (Perforce, PlasticSCM). |
| E8 | `domain-modeling.md` | Conditional section | When `project_type: game`: ECS patterns alongside DDD, game state machines, resource/inventory systems, player progression as bounded context, game-specific ubiquitous language (spawn, cooldown, buff). |
| E9 | `system-architecture.md` | Conditional section | When `project_type: game`: game loop architecture (update/render), scene management, subsystem pipeline (input -> logic -> physics -> rendering -> audio), extension points for modding/scripting. |
| E10 | `ux-spec.md` | Conditional section | When `project_type: game`: HUD specification, in-game vs. overlay UI, controller-first navigation, game-specific states (gameplay, pause, inventory, cutscene, loading), tutorial/onboarding flow. May defer to `game-ui-spec.md` if present. |
| E11 | `database-schema.md` | Conditional section | When `project_type: game` and `has_server: true`: player profiles, inventories, leaderboards, matchmaking. When `project_type: game` and `has_save_system: true`: save file schema (defer to `save-system-spec.md`). |
| E12 | `api-contracts.md` | Conditional section | When `project_type: game` and `multiplayer: true`: game server API (matchmaking, lobbies, state sync), leaderboard API, IAP validation. When `has_modding: true`: mod API surface. |
| E13 | `operations.md` | Conditional section | When `project_type: game` and `live_service: true`: game server scaling, hotfix deployment without downtime, content update pipeline, maintenance windows, player status page. |
| E14 | `security.md` | Conditional section | When `project_type: game`: anti-cheat (server authority, client validation), save tampering prevention, economy exploit prevention, DDoS for game servers, player reporting, ban management. |
| E15 | `platform-parity-review.md` | Conditional section | When `project_type: game`: controller vs. KB/M balance (aim assist), hardware capability parity, platform-specific features (haptics, gyro), cert requirement differences, cross-play. |
| E16 | `story-tests.md` | Conditional section | When `project_type: game`: gameplay scenario test skeletons, visual baseline test stubs, performance benchmark stubs, balance validation test stubs. |
| E17 | `implementation-plan.md` | Conditional section | When `project_type: game`: task categories (engine/framework, gameplay, content, art integration), milestone mapping (vertical slice/alpha/beta -> task waves), content vs. code task patterns. |
| E18 | `add-e2e-testing.md` | Conditional section | When `project_type: game`: automated gameplay replay, visual regression via screenshot comparison, performance regression via frame timing, input replay framework. |

**Total steps to modify: 18**

### 4.3 New Knowledge Entries

| # | File | Category | Description |
|---|------|----------|-------------|
| K1 | `game-design-document.md` | core | GDD structure, game pillars, core loop design, mechanics documentation, progression systems, scope management for games |
| K2 | `game-engine-selection.md` | core | Evaluation framework for Unity vs. Unreal vs. Godot vs. custom, middleware selection (audio, physics, networking, UI), platform SDK considerations |
| K3 | `game-asset-pipeline.md` | core | Asset naming conventions, per-type specifications (poly/texture budgets), DCC-to-engine import flow, LOD strategy, binary VCS (Git LFS, Perforce) |
| K4 | `game-performance-budgeting.md` | core | Frame budget allocation, memory budget per platform, GPU/draw call budgets, loading time targets, thermal/battery considerations, profiling methodology |
| K5 | `game-testing-strategy.md` | core | Game-specific QA types (playtesting, balance testing, soak testing, cert testing, compatibility testing, FTUE testing), test automation for games, visual/performance regression |
| K6 | `game-economy-design.md` | core | Virtual currency design, earn/sink balancing, loot table probability, monetization models (premium, F2P, hybrid), legal requirements (probability disclosure), ethical considerations |
| K7 | `game-accessibility.md` | core | Xbox Accessibility Guidelines (XAG), game-specific a11y categories (visual, motor, cognitive, auditory, speech, photosensitivity), difficulty as accessibility, CVAA compliance |
| K8 | `game-audio-design.md` | core | Audio middleware (FMOD/Wwise), bus/mixer architecture, spatial audio, adaptive music systems, VO production, loudness standards (LUFS) |
| K9 | `game-networking.md` | core | Client-server vs. P2P, tick rate design, client prediction and server reconciliation, lag compensation, bandwidth budgeting, anti-cheat architecture, determinism |
| K10 | `game-platform-certification.md` | core | Sony TRC, Microsoft TCR, Nintendo Lotcheck, App Store/Google Play requirements, certification timeline, common failure points, pre-check methodology |
| K11 | `game-ui-patterns.md` | core | HUD design patterns, menu hierarchy, controller-first navigation, in-game vs. overlay UI, settings screen structure, split-screen UI, minimap patterns |
| K12 | `game-save-systems.md` | core | Save file formats (binary vs. JSON), what to persist, cloud save integration, save corruption recovery, platform-specific save requirements (console) |
| K13 | `game-project-structure.md` | core | Engine-specific directory conventions (Unity, Unreal, Godot), asset organization by type, scene/level file organization, game data tables, shader directories |
| K14 | `game-domain-patterns.md` | core | Entity-Component-System (ECS) modeling, game state machines, resource/inventory systems, player progression models, game-specific DDD patterns |
| K15 | `game-milestone-definitions.md` | core | Prototype, vertical slice, first playable, alpha, beta, release candidate, gold master — definition, gate criteria, and documentation expected at each |
| K16 | `review-game-design.md` | review | GDD-specific review patterns: pillar coherence, mechanic completeness, core loop engagement, progression balance, scope feasibility |
| K17 | `review-art-bible.md` | review | Art bible review patterns: spec consistency, naming convention compliance, LOD coverage, asset pipeline validation |
| K18 | `review-game-economy.md` | review | Economy review patterns: inflation/deflation analysis, exploit detection, ethical monetization, legal compliance |
| K19 | `review-netcode.md` | review | Netcode review patterns: latency tolerance, bandwidth compliance, cheat resistance, determinism verification |
| K20 | `game-live-operations.md` | execution | Live service patterns: content cadence, seasonal events, hotfix protocol, server maintenance, player communication |

**Total new knowledge entries: 20**

### 4.4 Methodology Preset

Create a new methodology preset: `content/methodology/game.md`

```yaml
name: game
description: Game development methodology — includes game design document, art/audio specs, performance budgets, playtesting, and platform certification
project_type: game
```

**Preset configuration should include:**

| Setting | Value | Rationale |
|---------|-------|-----------|
| `project_type` | `game` | Activates all game-conditional sections |
| `has_gdd` | `true` | Always produce GDD for games |
| `has_performance_budgets` | `true` | Always define frame/memory budgets |
| `has_art_bible` | `true` | Always produce art specifications |
| `has_audio_design` | `true` | Always produce audio specifications |
| `has_playtest_plan` | `true` | Always plan for playtesting |
| `has_game_accessibility` | `true` | Always plan for accessibility |

**Plus optional flags the user configures:**

| Flag | Default | When to Enable |
|------|---------|----------------|
| `multiplayer` | `false` | Online or local multiplayer |
| `has_economy` | `false` | Virtual currencies, IAP, F2P |
| `has_narrative` | `false` | Story-driven games |
| `has_levels` | `false` | Games with discrete levels |
| `has_save_system` | `true` | Games with save/load (most games) |
| `live_service` | `false` | Games-as-a-service with post-launch content |
| `platforms` | `[]` | Target platforms (pc, ps5, xbox, switch, ios, android, web) |
| `has_modding` | `false` | Games with mod support |
| `has_analytics` | `false` | Player telemetry and analytics |

### 4.5 Phase Structure

**No new phases needed.** The existing 16-phase structure accommodates game development well:

| Phase | Game Content Placement |
|-------|----------------------|
| 0 - Vision | Works as-is (game vision = product vision) |
| 1 - Product Definition | GDD lives here alongside adapted PRD + user stories |
| 2 - Foundation | Performance budgets live here alongside adapted tech stack + TDD |
| 3 - Environment | Git LFS / binary asset VCS setup lives here |
| 4 - Testing Integration | Game-specific E2E testing (replay, visual regression) |
| 5 - Domain Modeling | Narrative bible (conditional) + adapted domain modeling (ECS, game state) |
| 6 - Architecture Decisions | ADRs for engine, middleware, networking model, etc. |
| 7 - System Architecture | Netcode spec (conditional) + adapted system architecture (game loop, subsystems) |
| 8 - Specifications | Art bible, audio design, game UI, economy (conditional), levels (conditional), save system |
| 9 - Quality Gates | Playtest plan, game accessibility, analytics (conditional), live ops (conditional) |
| 10 - Platform Parity | Adapted for hardware/input parity + cert requirements |
| 11 - Consolidation | Works as-is |
| 12 - Planning | Adapted task decomposition with milestone mapping |
| 13 - Validation | Platform cert prep (conditional) + all existing validation steps |
| 14 - Finalization | Works as-is |
| 15 - Build | Works as-is |

The pipeline's sequential dependency model maps naturally to game development: you can't spec art budgets (Phase 8) before defining performance budgets (Phase 2), and you can't decompose tasks (Phase 12) before specifying game systems (Phase 8).

### 4.6 Conditional Logic

The following conditions need to be supported in frontmatter for game-aware step activation:

```yaml
# In pipeline step frontmatter
conditions:
  # Step runs only when project_type is game
  - project_type: game
  
  # Step runs only when multiplayer is enabled
  - multiplayer: true
  
  # Step runs only when economy exists
  - has_economy: true
  
  # Step runs only when targeting console/mobile platforms
  - platforms_include_any: [ps5, xbox, switch, ios, android]
  
  # Step runs only when narrative is present
  - has_narrative: true
  
  # Step runs only when game has discrete levels
  - has_levels: true
  
  # Step runs only when live service
  - live_service: true
```

**Existing conditional patterns** (e.g., `design-system.md` checks for frontend framework, `add-e2e-testing.md` detects platform) should be extended with these game-aware conditions. The conditional evaluation system already exists — it just needs new condition types.

---

## 5. Implementation Priority

### Tier 1: Foundation (Must-Have for Any Game)

These changes make scaffold minimally viable for game development.

| # | Item | Type | Effort |
|---|------|------|--------|
| 1 | `game` methodology preset | New preset | Small |
| 2 | `game-design-document.md` + `review-gdd.md` | New pipeline steps | Large |
| 3 | `performance-budgets.md` | New pipeline step | Medium |
| 4 | Adapt `tech-stack.md` for game engines | Modify existing | Medium |
| 5 | Adapt `project-structure.md` for game projects | Modify existing | Medium |
| 6 | Adapt `domain-modeling.md` for ECS/game state | Modify existing | Medium |
| 7 | Adapt `system-architecture.md` for game subsystems | Modify existing | Medium |
| 8 | Adapt `tdd.md` for game testing types | Modify existing | Medium |
| 9 | Adapt `user-stories.md` for gameplay scenarios | Modify existing | Small |
| 10 | Adapt `create-prd.md` for game-specific sections | Modify existing | Small |
| 11 | Knowledge entries: K1 (GDD), K2 (engine selection), K4 (performance), K5 (testing), K14 (domain patterns), K15 (milestones) | New knowledge | Large |

### Tier 2: Specification Layer (Full Documentation)

These make scaffold produce comprehensive game documentation.

| # | Item | Type | Effort |
|---|------|------|--------|
| 12 | `art-bible.md` | New pipeline step | Large |
| 13 | `audio-design.md` | New pipeline step | Medium |
| 14 | `game-ui-spec.md` | New pipeline step | Large |
| 15 | `playtest-plan.md` | New pipeline step | Medium |
| 16 | `game-accessibility.md` | New pipeline step | Medium |
| 17 | Adapt `git-workflow.md` for Git LFS/binary assets | Modify existing | Small |
| 18 | Adapt `ux-spec.md` for game UX | Modify existing | Medium |
| 19 | Adapt `design-system.md` for game UI or skip | Modify existing | Small |
| 20 | Adapt `story-tests.md` for game test skeletons | Modify existing | Medium |
| 21 | Adapt `implementation-plan.md` for game milestones | Modify existing | Medium |
| 22 | Adapt `add-e2e-testing.md` for game testing | Modify existing | Medium |
| 23 | Knowledge entries: K3 (assets), K7 (a11y), K8 (audio), K11 (UI), K13 (project structure), K16-K17 (reviews) | New knowledge | Large |

### Tier 3: Conditional Systems (Genre/Type-Specific)

These extend scaffold for specific game types.

| # | Item | Type | Effort |
|---|------|------|--------|
| 24 | `economy-design.md` + `review-economy.md` | New pipeline steps | Large |
| 25 | `netcode-spec.md` + `review-netcode.md` | New pipeline steps | Large |
| 26 | `narrative-bible.md` | New pipeline step | Medium |
| 27 | `level-design.md` | New pipeline step | Medium |
| 28 | `save-system-spec.md` | New pipeline step | Medium |
| 29 | `live-ops-plan.md` | New pipeline step | Medium |
| 30 | `platform-cert-prep.md` | New pipeline step | Medium |
| 31 | `analytics-telemetry.md` | New pipeline step | Small |
| 32 | Adapt `database-schema.md`, `api-contracts.md`, `operations.md`, `security.md`, `platform-parity-review.md` for game variants | Modify existing | Medium |
| 33 | Knowledge entries: K6 (economy), K9 (networking), K10 (cert), K12 (save), K18-K20 (reviews, live ops) | New knowledge | Large |

### Summary

| Metric | Count |
|--------|-------|
| New pipeline steps | 18 (8 must-have + 10 conditional) |
| Existing steps to modify | 18 |
| New knowledge entries | 20 |
| New methodology preset | 1 |
| New phases needed | 0 |
| Steps that apply as-is | 40 (67%) |
| Steps potentially irrelevant | 8 (13%, all already conditional) |

The pipeline's architecture is fundamentally sound for game development. The gaps are in **domain-specific content**, not in the process framework. The 16-phase structure, review methodology, multi-model validation, depth scaling, and conditional evaluation systems all work without modification. What's needed is game-aware content within that existing framework.
