---
name: online-services-spec
description: Specify identity/auth, leaderboards, matchmaking, entitlements, remote config, moderation, and cloud save
summary: "Specifies online service infrastructure — identity and authentication, leaderboards, matchmaking, entitlements and DLC, remote config, content moderation, and cloud save — bridging system architecture with platform-specific service requirements."
phase: "specification"
order: 871
dependencies: [system-architecture]
outputs: [docs/online-services-spec.md]
conditional: "if-needed"
reads: [game-design-document, netcode-spec]
knowledge-base: [game-networking, game-liveops-analytics]
---

## Purpose
Specify the online services layer that sits between the game client and backend
infrastructure. Online services are the platform-facing systems that handle
player identity, persistent state, social features, and content delivery —
distinct from the netcode layer (which handles real-time gameplay
synchronization) and the economy layer (which handles virtual currency and
progression).

Every online service has platform-specific requirements: Xbox Live, PlayStation
Network, Steam, Epic Online Services, Apple Game Center, and Google Play Games
each have mandatory integration points for identity, achievements, entitlements,
and cloud saves. Abstracting these behind a unified service layer prevents
platform-specific code from spreading throughout the game codebase.

This specification covers: identity and authentication (platform SSO, cross-play
identity linking), leaderboards (submission, anti-cheat validation, seasonal
resets), matchmaking (skill-based, region-based, queue management), entitlements
and DLC (purchase verification, content unlocking), remote configuration
(feature flags, A/B testing, live tuning), content moderation (chat filtering,
reporting, sanctions), and cloud save (conflict resolution, migration).

## Conditional Evaluation
Enable when: the game requires any online service beyond local storage — online
multiplayer, leaderboards, cloud saves, in-app purchases requiring server
verification, remote configuration, or any feature requiring server
communication outside of real-time gameplay.

Skip when: the game is entirely offline with no online features — no
leaderboards, no cloud saves, no server-verified purchases, no remote config.
Games using only local save files and platform-native achievement systems
(which are handled by platform SDKs without custom backend) do not need this
specification.

## Inputs
- docs/system-architecture.md (required) — backend service boundaries and data flow
- docs/plan.md (required) — target platforms informing platform-specific service requirements
- docs/game-design.md (optional, forward-read) — multiplayer modes, social features, progression requiring persistence
- docs/netcode-spec.md (optional, forward-read) — matchmaking requirements, session management, connection lifecycle

## Expected Outputs
- docs/online-services-spec.md — service specifications for identity, leaderboards,
  matchmaking, entitlements, remote config, moderation, and cloud save

## Quality Criteria
- (mvp) Identity and authentication flow documented: platform SSO integration per target platform, session token lifecycle, guest-to-account upgrade path
- (mvp) Every online service specifies: API contract (request/response), failure modes and fallback behavior, data ownership and retention policy
- (mvp) Cloud save strategy documented: save format, conflict resolution (last-write-wins, merge, user-choice), platform-specific cloud save API mapping
- (mvp) Entitlement verification flow documented: purchase validation, content unlocking, receipt verification per platform
- (deep) Leaderboard specification: submission validation (anti-cheat checks before write), ranking algorithm, seasonal reset strategy, regional vs global boards
- (deep) Matchmaking specification: skill rating system (Elo, Glicko-2, TrueSkill), queue management, region selection, party handling, backfill strategy
- (deep) Remote configuration specification: feature flag schema, A/B test segmentation, rollout strategy, emergency kill switches
- (deep) Content moderation specification: text filtering (blocklist + ML classification), player reporting workflow, sanction tiers (warning, mute, temp ban, permanent ban), appeal process
- (deep) Cross-play identity linking: account merging strategy, entitlement portability, platform TOS compliance for cross-platform purchases
- (deep) Service degradation strategy: graceful fallback when individual services are unavailable (offline mode, cached leaderboards, local save fallback)

## Methodology Scaling
- **deep**: Full online services specification covering all seven service
  domains with platform-specific integration details, failure mode analysis,
  cross-play considerations, moderation pipeline, and service degradation
  strategy. 15-25 pages.
- **mvp**: Identity/auth, cloud save, and entitlement verification for primary
  platform. 4-8 pages.
- **custom:depth(1-5)**:
  - Depth 1: identity/auth flow and cloud save strategy for primary platform only.
  - Depth 2: add entitlement verification and basic leaderboard submission.
  - Depth 3: add matchmaking specification, remote config, and multi-platform identity mapping.
  - Depth 4: add content moderation pipeline, cross-play identity linking, and service degradation strategy.
  - Depth 5: full specification with A/B testing infrastructure, analytics event taxonomy for online services, and platform certification compliance checklist.

## Mode Detection
Check for docs/online-services-spec.md. If it exists, operate in update mode:
read existing spec and diff against current system architecture and platform
targets. Preserve existing service API contracts, identity flows, and cloud
save strategy. Update matchmaking if netcode-spec changed session management.
Add services for new platforms added to target list.

## Update Mode Specifics
- **Detect prior artifact**: docs/online-services-spec.md exists
- **Preserve**: identity/auth flow, cloud save conflict resolution strategy,
  entitlement verification flow, leaderboard ranking algorithm, matchmaking
  skill rating system, moderation sanction tiers
- **Triggers for update**: system architecture changed backend service
  boundaries, target platforms changed (new platform requires new SSO
  integration), netcode-spec changed matchmaking or session management,
  GDD added social features or new online modes, economy-design added
  server-verified purchases
- **Conflict resolution**: if platform requirements conflict across target
  platforms (e.g., different cloud save APIs with incompatible merge
  strategies), document the conflict and propose an abstraction layer that
  accommodates all platforms; never implement platform-specific behavior
  without the abstraction boundary
