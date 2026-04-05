<!-- eval-wip -->
---
name: review-netcode
description: Failure modes and review passes specific to netcode design — latency analysis, bandwidth ceilings, cheat surfaces, and disconnect handling
topics: [game-dev, review, networking, latency, bandwidth, anticheat]
---

# Review: Netcode Design

Netcode design documents must specify how the game handles the physical reality of network latency, limited bandwidth, and untrusted clients. A netcode design that works under ideal conditions (20ms ping, no packet loss, no cheaters) is not a design — it is a fantasy. This review uses 7 passes targeting the specific ways netcode designs fail under real-world conditions.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Worst-Case Latency Analysis**: The design handles 200ms+ latency gracefully; player-facing impact at each latency tier is documented; no mechanic requires sub-frame synchronization over the network.
- **Pass 2 — Bandwidth Ceiling Calculation**: Per-player and per-match bandwidth budgets are calculated; entity count × update rate × payload size does not exceed typical residential upstream limits.
- **Pass 3 — Cheat Surface Audit**: Every piece of data sent to the client is evaluated for cheat potential; server-authoritative validation exists for every game-state-changing action.
- **Pass 4 — Determinism Verification**: For lockstep and rollback architectures, determinism requirements are identified and verified; floating-point divergence, platform differences, and desync detection are addressed. (NOT applicable to pure client-server designs.)
- **Pass 5 — Disconnect/Reconnect Handling**: Graceful handling for every disconnect scenario: mid-match, mid-transaction, mid-save; reconnection restores state without exploits or data loss.
- **Pass 6 — Matchmaking Fairness Assessment**: Matchmaking considers latency, skill, party size, and region; no systematic advantage for players in specific network conditions.
- **Pass 7 — Bandwidth Spike Resilience**: The design handles transient bandwidth spikes (ability usage, explosions, mass entity spawns) without degrading below playable quality.

## Deep Guidance

---

## Pass 1: Worst-Case Latency Analysis

### What to Check

The netcode design documents player experience at every latency tier: ideal (< 50ms), acceptable (50-100ms), degraded (100-200ms), and poor (200-500ms). Every gameplay mechanic is evaluated for its latency tolerance. No mechanic assumes LAN-quality latency.

### Why This Matters

Most netcode designs are tested and tuned on local networks or same-region servers. In production, 10-20% of players experience 100ms+ latency and 5% experience 200ms+. A mechanic that feels great at 30ms but breaks at 150ms will generate complaints from millions of players. The design must define what "graceful degradation" means for each latency tier — not "it still works" but specifically what the player experiences.

### How to Check

1. List every gameplay mechanic that involves networked state: movement, combat, trading, inventory, chat, matchmaking
2. For each mechanic, evaluate at four latency tiers: < 50ms, 50-100ms, 100-200ms, 200ms+
3. Identify mechanics with strict timing requirements: fighting game frame data, rhythm game hit windows, reaction-based combat
4. Verify that client-side prediction is specified for latency-sensitive mechanics (movement, shooting)
5. Check for latency compensation on hit detection: is the system using client-side hit detection with server validation, server-side hit detection with lag compensation, or something else?
6. Verify that the design specifies what happens at extreme latency (> 500ms): timeout? Disconnect? Graceful degradation?
7. Check for latency hiding techniques: animations that mask delay, local prediction for responsiveness, rollback for correction

```markdown
## Latency Impact Matrix

| Mechanic            | < 50ms        | 50-100ms      | 100-200ms      | 200ms+         |
|---------------------|---------------|---------------|----------------|----------------|
| Player movement     | [experience]  | [experience]  | [experience]   | [experience]   |
| Combat hit reg      | [experience]  | [experience]  | [experience]   | [experience]   |
| Ability activation  | [experience]  | [experience]  | [experience]   | [experience]   |
| Item pickup         | [experience]  | [experience]  | [experience]   | [experience]   |
| Chat/emotes         | [experience]  | [experience]  | [experience]   | [experience]   |
| Trading             | [experience]  | [experience]  | [experience]   | [experience]   |

Acceptable threshold: [Define which cells are acceptable, degraded, or unplayable]
```

### What a Finding Looks Like

- P0: "Combat uses server-authoritative hit detection with no lag compensation. At 150ms, players must lead targets by 300ms (round trip) — making fast-paced combat unplayable for 15% of the player base."
- P0: "The design specifies 16ms tick rate for combat resolution but does not address how clients at 100ms+ latency interact with this tick rate. Inputs will consistently arrive 6+ ticks late."
- P1: "Movement prediction exists but no reconciliation strategy is specified. When the server corrects a misprediction, what does the player see? Rubber-banding? Snap? Smooth interpolation?"
- P2: "Latency tolerance for the trading system is not specified. Trades at 200ms latency may show stale inventory or allow double-spend if not handled."

---

## Pass 2: Bandwidth Ceiling Calculation

### What to Check

Total bandwidth consumption is calculated for worst-case scenarios: maximum players, maximum entities, maximum action density. Per-player upstream and downstream bandwidth stay within residential internet limits. Bandwidth is budgeted across entity types, not just estimated in aggregate.

### Why This Matters

Bandwidth overruns cause packet loss, which causes desync, rubber-banding, and hit registration failures. Unlike latency (which is physics), bandwidth is design-controllable — the team chooses how much data to send. A 64-player battle royale where each player sends full state at 60Hz consumes more bandwidth than most residential connections provide. The design must calculate this before implementation, not discover it in the first 64-player playtest.

### How to Check

1. Calculate per-entity update size: how many bytes does one entity state update require? (Position: 12 bytes, rotation: 4-16 bytes, velocity: 12 bytes, state flags: varies)
2. Calculate entity count × update rate = updates per second
3. Calculate total downstream: (entity count × update size × update rate) + overhead (packet headers, reliability layer)
4. Verify downstream stays under 1 Mbps for residential players (conservative) or document the minimum connection requirement
5. Calculate upstream: (local entity updates × update size × update rate) + input data
6. Verify upstream stays under 256 Kbps (many residential connections have asymmetric upload)
7. Check for bandwidth scaling: does bandwidth grow linearly with player count? Are there diminishing returns from interest management?

### What a Finding Looks Like

- P0: "64-player match with 30Hz updates at 64 bytes per entity = 64 × 64 × 30 = 122,880 bytes/sec (983 Kbps) downstream for entities alone. With packet overhead and game events, this exceeds 1.5 Mbps — above many residential connections."
- P1: "Bandwidth calculation exists but does not account for game events (ability effects, explosions, chat). Events can spike bandwidth 3-5x above entity-update baseline."
- P1: "No interest management (relevancy filtering) is specified. Every player receives updates for all 64 players regardless of distance, even if most are not visible."
- P2: "Upstream bandwidth is not calculated. If the game sends input + local entity state at 60Hz, upstream may exceed residential upload limits."

---

## Pass 3: Cheat Surface Audit

### What to Check

Every piece of data sent to the client is evaluated for cheat potential. The server validates every game-state-changing action. The client is treated as untrusted — it is a rendering terminal, not an authority. Anti-cheat measures are proportional to the competitive stakes.

### Why This Matters

Any data the client possesses can be read by a cheater. Any action the client is authoritative on can be forged by a cheater. In competitive games, cheating drives away legitimate players — a single aimbotter in a lobby causes 63 other players to have a bad experience. Anti-cheat is not a post-launch bolt-on; the netcode architecture must be designed with cheat resistance as a core constraint.

### How to Check

1. List every data type sent to the client: player positions, health values, inventory contents, map data, enemy positions, loot tables
2. For each, evaluate: what can a cheater do with this data? (Wallhacks from enemy positions, ESP from health values, loot sniping from loot table data)
3. Verify server authority: for every game-state-changing action (damage, movement, item acquisition, currency change), does the server validate the action or trust the client?
4. Check for speed hacks: does the server validate movement speed, or does it trust client-reported position?
5. Check for teleport prevention: does the server verify position continuity (no instant jumps)?
6. Verify that hit detection is server-validated: even if the client reports a hit, does the server verify line-of-sight, range, cooldowns, and ammunition?
7. Check for economy cheats: can the client modify currency, item counts, or transaction outcomes?

```markdown
## Cheat Surface Audit Template

| Data Sent to Client     | Cheat Vector          | Impact    | Mitigation         |
|-------------------------|-----------------------|-----------|--------------------|
| All player positions    | Wallhack/ESP          | High      | [Fog of war / culling] |
| Player health values    | Health ESP            | Medium    | [Send only for visible] |
| Loot table / drop data  | Loot prediction       | Medium    | [Server-side only]  |
| Full map data           | Map reveal            | Low-High  | [Stream on demand]  |
| Hit registration        | Aimbot + client auth  | Critical  | [Server validation] |
| Movement authority      | Speed/teleport hack   | Critical  | [Server validation] |
| Inventory/currency      | Item duplication      | Critical  | [Server-authoritative] |

Unmitigated critical vectors: [COUNT — must be 0]
```

### What a Finding Looks Like

- P0: "Client is authoritative for hit detection. A cheater can send 'I hit every player for maximum damage every frame' and the server will accept it."
- P0: "All player positions are sent to every client regardless of visibility. This enables trivial wallhacks — the cheat client simply renders hidden players."
- P1: "Server validates movement speed but not acceleration. A speed hack that gradually increases speed from 100% to 200% over 10 seconds would bypass the speed check."
- P2: "Inventory changes are server-authoritative but the client caches inventory locally. A cheater could display spoofed items to other players in social contexts."

---

## Pass 4: Determinism Verification

### What to Check

**CONDITIONAL: This pass applies only to lockstep or rollback netcode architectures.** For client-server authority models, skip this pass entirely.

For deterministic architectures, every operation that affects game state must produce identical results on every machine given the same inputs. Floating-point operations, random number generation, physics simulation, and platform-specific behavior are all sources of non-determinism that cause desync.

### Why This Matters

Lockstep and rollback architectures rely on all clients simulating identically. A single non-deterministic operation causes the simulations to diverge — desync — which manifests as teleporting players, phantom hits, and corrupted game state. Desync is catastrophic because it is cumulative: once simulations diverge, they never re-converge without correction. Determinism is an all-or-nothing requirement.

### How to Check

1. Verify that the architecture is actually lockstep or rollback — if it is client-server with authoritative server, skip this pass
2. Check floating-point handling: are fixed-point math libraries used? If IEEE 754 floating-point is used, are platform-specific differences (x86 vs. ARM) addressed?
3. Verify RNG determinism: all random number generation uses a shared seed with a deterministic algorithm (no system RNG)
4. Check physics engine determinism: is the physics engine guaranteed deterministic? (Most are NOT across platforms)
5. Verify iteration order: hash maps, sets, and any unordered data structures must use deterministic iteration
6. Check that desync detection exists: periodic state hash comparison between clients to detect divergence early
7. Verify desync recovery: when detected, how is desync resolved? Full state resync? Rollback to last known good state?

### What a Finding Looks Like

- P0: "Rollback architecture uses Unity's built-in physics engine, which is not deterministic across platforms. PC and console clients will desync within minutes."
- P0: "Floating-point arithmetic is used for all game state calculations with no fixed-point alternative. x86 and ARM produce different results for the same operations."
- P1: "RNG uses a shared seed but the document does not specify which PRNG algorithm. Different implementations of 'random' produce different sequences."
- P2: "Desync detection is mentioned but no detection mechanism is specified. Without periodic state hashing, desync goes undetected until it becomes visible to players."

---

## Pass 5: Disconnect/Reconnect Handling

### What to Check

Every disconnect scenario is handled: mid-match, mid-transaction, mid-save, mid-trade. Reconnection restores the player to their correct state without data loss, exploits, or unfair advantage. Timeout thresholds and abandon penalties are specified.

### Why This Matters

Disconnects are not edge cases — they are guaranteed. On mobile, network transitions (Wi-Fi to cellular) cause momentary disconnects. On any platform, ISP issues, router restarts, and game crashes cause unexpected disconnects. A game that loses player progress, duplicates items, or awards undeserved wins/losses on disconnect will hemorrhage players. Disconnect handling is a core system, not an afterthought.

### How to Check

1. For each game mode, specify what happens when a player disconnects: is their character removed instantly? After a timeout? Does an AI take over?
2. Check for mid-transaction disconnect: if a player disconnects while buying/selling/trading, what is the transaction state? Is it rolled back? Completed? Left in limbo?
3. Verify reconnection flow: can a player rejoin an in-progress match? Within what time window? Is their state preserved?
4. Check for exploit potential: can a player disconnect to avoid a loss? To duplicate items? To undo a bad trade?
5. Verify timeout thresholds: how long does the server wait before treating a disconnect as an abandon?
6. Check for abandon penalties: are players who intentionally disconnect punished? How are intentional disconnects distinguished from network issues?
7. Verify save state consistency: if the player disconnects between a game state change and a save, which state wins?

### What a Finding Looks Like

- P0: "No reconnection mechanism exists. A player who disconnects from a 45-minute match must start over. This is unacceptable for competitive modes."
- P0: "Mid-trade disconnect handling is not specified. If player A sends an item and disconnects before receiving player B's item, the trade state is undefined — potential item duplication or loss."
- P1: "Disconnect during a ranked match counts as an automatic loss. No grace period exists for reconnection. A 2-second ISP hiccup causes a full loss of ranked points."
- P2: "AI takeover is specified for disconnected players but the AI difficulty level is not defined. An overpowered AI substitute could be more effective than the disconnected player, creating a perverse incentive to disconnect."

---

## Pass 6: Matchmaking Fairness Assessment

### What to Check

Matchmaking considers latency (players are matched within acceptable ping ranges), skill (players face opponents of similar ability), party size (solo players are not matched against coordinated groups), and region (geographic proximity for latency). No systematic advantage exists for players in specific network conditions or regions.

### Why This Matters

Unfair matchmaking drives player churn faster than any other factor. A new player matched against a veteran quits in frustration. A player with 30ms ping matched against a player with 200ms ping has a structural advantage in any real-time combat. A solo player matched against a coordinated 4-stack loses due to communication, not skill. Matchmaking fairness is the foundation of competitive game health.

### How to Check

1. Verify that ping-based matchmaking exists: players within the same match should have comparable latency (< 50ms difference ideal, < 100ms acceptable)
2. Check for skill-based matchmaking (SBMM): is there a rating system? How does it handle new players (placement matches)? How quickly does it converge?
3. Verify party-size matching: solo players vs. solo players, groups vs. groups — or at minimum, compensation for size imbalance
4. Check for region selection: can players choose their region? Is the choice locked or advisory?
5. Verify that matchmaking queue times are bounded: what happens when the pool is too small for fair matches? (Wider skill range? Cross-region? Bot backfill?)
6. Check for smurf prevention: can experienced players create new accounts to stomp new players?
7. Verify that matchmaking data is used for balance analysis: is win rate by skill bracket tracked?

### What a Finding Looks Like

- P0: "No ping-based matchmaking exists. A player in Tokyo can be matched against a player in New York, producing 200ms+ latency in a competitive shooter."
- P1: "SBMM exists but no placement system is defined. New players start at median rating and are immediately matched against average players, producing 30-50 matches of stomps before the rating converges."
- P1: "Solo players and 5-stacks are in the same matchmaking pool with no compensation. Coordinated groups have a 15-20% win rate advantage over equivalent-skill solo players."
- P2: "Queue time bounds are not specified. In low-population regions, players may wait indefinitely or receive wildly unfair matches."

---

## Pass 7: Bandwidth Spike Resilience

### What to Check

The design handles transient bandwidth spikes caused by gameplay events: ability usage, explosions, mass entity spawns, zone transitions, and player clustering. Spike mitigation strategies (priority queuing, delta compression, update rate reduction) are specified.

### Why This Matters

Steady-state bandwidth may be well within limits, but a single moment — 10 players using abilities simultaneously in a team fight — can spike bandwidth 5-10x above baseline. Without spike mitigation, this causes packet loss during the most important gameplay moments, precisely when network quality matters most. Players remember "the game lagged during the final team fight" more than any other quality issue.

### How to Check

1. Identify spike scenarios: large battles, ability clusters, zone transitions, mass spawns, world events
2. For each scenario, calculate peak bandwidth: (entities changed × update size) for that frame/tick
3. Verify that peak bandwidth does not exceed steady-state by more than 3x without mitigation
4. Check for priority queuing: are critical updates (player position, health) prioritized over cosmetic updates (emotes, particle effects)?
5. Verify delta compression: are only changed fields sent, or full entity state on every update?
6. Check for adaptive update rates: does the server reduce update frequency under load? Which entities are downgraded first?
7. Verify that spike mitigation degrades gracefully: cosmetic quality drops before gameplay accuracy

### What a Finding Looks Like

- P0: "10v10 team fight with all abilities active produces 15x baseline bandwidth. No spike mitigation is specified. This will cause packet loss and desync during the most critical gameplay moments."
- P1: "Delta compression is specified for entity position but not for game events. A single explosion event sends full effect data (particle count, damage list, audio trigger) to all 64 players simultaneously."
- P2: "Adaptive update rate is mentioned but priority order is not defined. Without explicit priority (gameplay > VFX > audio > cosmetic), the system may downgrade gameplay updates to preserve cosmetic fidelity."

---

## Common Review Anti-Patterns

### 1. LAN-Optimized Netcode

The netcode design was tested and tuned on a local network. All latency budgets assume < 20ms. Bandwidth calculations assume gigabit LAN speeds. The design feels great in the studio and breaks for every player outside the same city as the data center.

**How to spot it:** Latency analysis mentions only one tier (e.g., "at 20ms latency"). No latency degradation table exists. Bandwidth calculations do not reference residential internet speeds or upstream limits.

### 2. "Anti-Cheat Will Handle It"

The netcode design defers all cheat prevention to a third-party anti-cheat solution (EasyAntiCheat, BattlEye, Vanguard). These tools detect cheat software but cannot fix architectural flaws. If the client is authoritative for hit detection, no anti-cheat tool can prevent a modified client from reporting false hits. Architectural cheat resistance and software-based anti-cheat are complementary, not substitutes.

**How to spot it:** The cheat prevention section names an anti-cheat product but does not analyze the server-authority model. No discussion of what data the client receives or what actions the client is authoritative for.

### 3. Determinism Assumed, Not Verified

For lockstep/rollback designs, the document states "the simulation is deterministic" without analyzing sources of non-determinism. Floating-point operations, hash map iteration order, physics engine behavior, and platform-specific math libraries are all sources of non-determinism that must be explicitly addressed.

**How to spot it:** The word "deterministic" appears without any discussion of fixed-point math, PRNG seeding, physics engine guarantees, or cross-platform verification.
