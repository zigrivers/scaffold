---
name: netcode-spec
description: Design network topology, tick rate, prediction, reconciliation, and anti-cheat architecture
summary: "Specifies client-server or P2P topology, tick rate, client prediction, server reconciliation, lag compensation, bandwidth budgets, and anti-cheat architecture for multiplayer games."
phase: "architecture"
order: 715
dependencies: [system-architecture]
outputs: [docs/netcode-spec.md]
conditional: "if-needed"
reads: [tech-stack, performance-budgets]
knowledge-base: [game-networking]
---

## Purpose
Design the complete network architecture for multiplayer games. Specifies the
network topology (client-server authoritative, P2P, relay hybrid), tick rate
and simulation frequency, client-side prediction and server reconciliation
strategy, lag compensation techniques, bandwidth budgets per connection, and
anti-cheat architecture. This document bridges the system architecture and
the implementation of all networked gameplay systems.

## Conditional Evaluation
Enable when: the GDD or project config specifies `multiplayerMode` as `online`
or `hybrid` (online + local). Any game requiring network communication between
players needs this specification.

Skip when: the GDD or project config specifies `multiplayerMode` as `none`
(single-player only) or `local` (local multiplayer only using shared screen,
split screen, or local network without internet). Local multiplayer uses shared
game state without network serialization.

## Inputs
- docs/system-architecture.md (required) — system component boundaries and data flows
- docs/tech-stack.md (required) — networking library/framework choices, transport protocol
- docs/performance-budgets.md (required) — latency targets, bandwidth constraints, tick rate goals
- docs/game-design.md (required) — multiplayer mode, player count, gameplay mechanics requiring sync

## Expected Outputs
- docs/netcode-spec.md — network topology, tick rate, prediction/reconciliation
  strategy, lag compensation, bandwidth budgets, anti-cheat architecture, and
  connection lifecycle

## Quality Criteria
- (mvp) Network topology selected and justified (client-server, P2P, or hybrid) with rationale
- (mvp) Tick rate specified with justification based on game genre and latency requirements
- (mvp) Client prediction strategy defined for player-controlled entities
- (mvp) Server reconciliation approach documented (snapshot interpolation, rollback, or hybrid)
- (mvp) Bandwidth budget per connection specified and within performance budget constraints
- (deep) Lag compensation techniques documented (input delay, rollback, entity interpolation)
- (deep) Anti-cheat architecture covers input validation, server authority boundaries, and detection heuristics
- (deep) Connection lifecycle specified (matchmaking handshake, session join, reconnection, graceful disconnect, timeout)
- (deep) Network serialization format defined with size budgets per message type
- (deep) Edge cases documented (host migration for P2P, region failover, NAT traversal)

## Methodology Scaling
- **deep**: Full netcode specification with topology rationale, tick rate
  analysis, prediction/reconciliation deep dive, lag compensation techniques,
  bandwidth budgets per message type, anti-cheat architecture, connection
  lifecycle, network serialization format, edge case handling, and load
  testing plan. 15-25 pages.
- **mvp**: Topology selection, tick rate, basic prediction/reconciliation
  approach, and bandwidth budget. 3-5 pages.
- **custom:depth(1-5)**:
  - Depth 1: topology selection with rationale and tick rate only.
  - Depth 2: add client prediction and server reconciliation approach.
  - Depth 3: add bandwidth budgets and connection lifecycle.
  - Depth 4: add lag compensation, anti-cheat architecture, and serialization format.
  - Depth 5: full specification with edge cases, load testing plan, and region failover strategy.

## Mode Detection
Check for docs/netcode-spec.md. If it exists, operate in update mode: read
existing spec and diff against current system architecture and performance
budgets. Preserve established topology decisions, tick rate, and protocol
choices. Update prediction/reconciliation if gameplay mechanics changed.
Never change network topology without explicit user approval.

## Update Mode Specifics
- **Detect prior artifact**: docs/netcode-spec.md exists
- **Preserve**: network topology decision, tick rate, transport protocol,
  serialization format, anti-cheat strategy, bandwidth budgets
- **Triggers for update**: system architecture changed networking components,
  performance budgets revised latency targets, GDD added new multiplayer
  modes or increased player count, tech stack changed networking library
- **Conflict resolution**: if architecture changes require a different
  topology, flag the breaking change with migration impact analysis;
  present options to user rather than silently switching
