---
name: game-networking
description: Client-server and P2P architectures, tick rates, client prediction, server reconciliation, lag compensation, and anti-cheat
topics: [game-dev, networking, netcode, multiplayer, prediction, reconciliation]
---

Game networking is fundamentally different from web or API networking because it must maintain a shared simulation across multiple machines with divergent latencies, all while feeling instantaneous to each player. The core tension is between responsiveness (the player's actions feel immediate) and authority (the server is the source of truth). Every multiplayer game exists on a spectrum between these two poles, and the netcode architecture determines where on that spectrum the game sits. Getting this wrong produces unplayable results — rubber-banding, ghost hits, desync, and exploitable clients.

## Summary

### Architecture Models

**Client-Server (Dedicated Server):**
- One authoritative server runs the simulation; clients send inputs and receive state
- Server validates all actions — clients cannot cheat by modifying their local state
- Latency is client-to-server round trip (typically 20–150 ms)
- Requires server infrastructure (cost scales with concurrent players)
- Standard for competitive multiplayer, MMOs, and any game where cheating matters

**Client-Server (Listen Server):**
- One player's machine acts as both client and server
- That player has zero latency advantage (host advantage)
- No infrastructure cost but poor experience for non-host players with high latency to host
- Common in casual co-op, LAN games, console party games

**Peer-to-Peer (P2P):**
- Each client communicates directly with every other client
- No central authority — consensus or lockstep determines game state
- NAT traversal is a major challenge; relay fallback is usually required
- Bandwidth scales with O(n^2) connections instead of O(n) for client-server
- Used in fighting games (GGPO/rollback), RTS (lockstep), and some racing games

### Tick Rate Selection

The server tick rate determines how frequently the server processes inputs and sends state updates:

- **128 Hz** (7.8 ms): Competitive FPS (Counter-Strike 2, Valorant). High CPU cost, high bandwidth.
- **60 Hz** (16.67 ms): Standard for action games, battle royale. Good responsiveness, moderate cost.
- **30 Hz** (33.33 ms): Acceptable for slower-paced games (RPGs, survival, strategy). Lower cost.
- **20 Hz** (50 ms): Common for MMOs with large player counts. Noticeable lag in fast combat.
- **10 Hz** (100 ms): Turn-based or very slow-paced games. Minimal server load.

Higher tick rates reduce the gap between what the player sees and what the server knows, but multiply bandwidth and CPU cost linearly. Choose the lowest tick rate that feels acceptable for the game's genre and combat pacing.

### Client Prediction and Server Reconciliation

Client prediction makes the game feel responsive despite network latency. The client immediately applies the player's input locally without waiting for server confirmation. When the server responds with the authoritative state, the client reconciles any differences.

**Prediction workflow:**
1. Player presses move-forward at client frame 100
2. Client immediately applies movement locally (predicted state)
3. Client sends input to server with timestamp/frame number
4. Server processes input, calculates authoritative result
5. Server sends authoritative state back to client
6. Client compares predicted state at that frame with server state
7. If they match: prediction was correct, no correction needed
8. If they differ: client snaps or interpolates to server state (reconciliation)

### Lag Compensation

Lag compensation allows the server to evaluate hit detection from the shooter's perspective at the time they fired, accounting for their network latency. Without it, players must "lead" their targets by the amount of their ping, which feels terrible.

The server rewinds the game state to the timestamp of the shot, performs the hit check against historical positions, and applies the result. This can cause "I was already behind cover but still got hit" situations for the target — the tradeoff favors the shooter's experience.

## Deep Guidance

### Client-Server Architecture in Detail

```typescript
// Simplified server-authoritative game loop

interface PlayerInput {
  sequenceNumber: number;  // Monotonically increasing per client
  timestamp: number;       // Client-side timestamp for lag compensation
  moveDirection: { x: number; y: number };
  actions: string[];       // "fire", "jump", "reload", etc.
}

interface ServerState {
  tick: number;
  entities: Map<string, EntityState>;
}

interface EntityState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  health: number;
  animation: string;
}

// --- SERVER SIDE ---

class GameServer {
  private tickRate = 60;
  private tickInterval = 1000 / this.tickRate;
  private currentTick = 0;
  private stateHistory: ServerState[] = [];    // For lag compensation
  private inputQueues: Map<string, PlayerInput[]> = new Map();

  tick(): void {
    this.currentTick++;

    // 1. Process buffered inputs from all clients
    for (const [playerId, inputs] of this.inputQueues) {
      for (const input of inputs) {
        this.applyInput(playerId, input);
      }
      inputs.length = 0; // Clear processed inputs
    }

    // 2. Run simulation (physics, AI, game logic)
    this.simulate(this.tickInterval / 1000);

    // 3. Store state snapshot for lag compensation
    this.stateHistory.push(this.captureState());
    if (this.stateHistory.length > this.tickRate * 2) {
      this.stateHistory.shift(); // Keep ~2 seconds of history
    }

    // 4. Send authoritative state to all clients
    this.broadcastState();
  }

  handleFireAction(shooterId: string, input: PlayerInput): void {
    // Lag compensation: rewind to the shooter's perceived time
    const rtt = this.getClientRTT(shooterId);
    const rewindTicks = Math.round((rtt / 2) / this.tickInterval);
    const historicalState = this.stateHistory[
      Math.max(0, this.stateHistory.length - 1 - rewindTicks)
    ];

    // Perform hit detection against historical positions
    const hit = this.raycast(
      historicalState,
      shooterId,
      input.moveDirection
    );

    if (hit) {
      // Apply damage in current (not historical) state
      this.applyDamage(hit.entityId, this.getWeaponDamage(shooterId));
    }
  }

  // ... additional methods omitted for brevity
  private applyInput(id: string, input: PlayerInput): void { /* ... */ }
  private simulate(dt: number): void { /* ... */ }
  private captureState(): ServerState {
    return { tick: this.currentTick, entities: new Map() };
  }
  private broadcastState(): void { /* ... */ }
  private getClientRTT(id: string): number { return 0; }
  private raycast(state: ServerState, id: string, dir: any): any { return null; }
  private applyDamage(id: string, dmg: number): void { /* ... */ }
  private getWeaponDamage(id: string): number { return 0; }
}

// --- CLIENT SIDE ---

class GameClient {
  private pendingInputs: PlayerInput[] = [];
  private sequenceNumber = 0;
  private localState: EntityState;

  processLocalInput(raw: RawInput): void {
    const input: PlayerInput = {
      sequenceNumber: this.sequenceNumber++,
      timestamp: Date.now(),
      moveDirection: raw.moveDirection,
      actions: raw.actions,
    };

    // Predict: apply input locally immediately
    this.localState = this.applyInputToState(this.localState, input);

    // Store for reconciliation
    this.pendingInputs.push(input);

    // Send to server
    this.sendToServer(input);
  }

  onServerState(serverState: EntityState, lastProcessedSeq: number): void {
    // Discard inputs the server has already processed
    this.pendingInputs = this.pendingInputs.filter(
      i => i.sequenceNumber > lastProcessedSeq
    );

    // Start from server-authoritative state
    let reconciledState = { ...serverState };

    // Re-apply unprocessed inputs on top of server state
    for (const input of this.pendingInputs) {
      reconciledState = this.applyInputToState(reconciledState, input);
    }

    // Smooth correction: interpolate toward reconciled state
    this.localState = this.smoothCorrection(
      this.localState,
      reconciledState,
      0.2 // Blend factor — higher = snappier, lower = smoother
    );
  }

  private applyInputToState(
    state: EntityState, input: PlayerInput
  ): EntityState {
    return { ...state }; // Placeholder
  }
  private sendToServer(input: PlayerInput): void { /* ... */ }
  private smoothCorrection(
    current: EntityState, target: EntityState, blend: number
  ): EntityState {
    return { ...target }; // Placeholder — real impl lerps position
  }
}

interface RawInput {
  moveDirection: { x: number; y: number };
  actions: string[];
}
```

### Entity Interpolation

Clients receive server state updates at the tick rate (e.g., 60 Hz), but render at the display's refresh rate (e.g., 144 Hz). Between server updates, remote entities must be interpolated to appear smooth.

**Interpolation** (rendering slightly in the past):
- Buffer the two most recent server states for each remote entity
- Render the entity at a position interpolated between these two states
- Introduces additional visual latency equal to one server tick (16.67 ms at 60 Hz)
- Produces smooth, glitch-free movement for remote entities

**Extrapolation** (predicting the future based on last known velocity):
- Uses the last known position and velocity to project forward
- No additional visual latency
- Produces jittery or incorrect results when entities change direction
- Should be used as a fallback when interpolation data is missing (packet loss)

Most games use interpolation for remote entities and prediction for the local player.

### Bandwidth Optimization

Multiplayer games are bandwidth-constrained, especially on mobile networks and in games with many simultaneous players.

**Delta compression:**
- Send only what changed since the last acknowledged state, not the full state every tick
- A 1000-entity state might be 50 KB full, but only 2 KB as a delta if few entities moved
- Requires reliable delivery of the baseline state and tracking of per-client acknowledgment

**Quantization:**
- Reduce precision of transmitted values: positions to centimeter precision (16-bit per axis instead of 32-bit float), rotations to 10-bit per axis using smallest-three encoding
- A float is 4 bytes; a 10-bit quantized value is ~1.25 bytes — 3x savings per value
- Quantization must match on client and server to avoid desync

**Interest management / relevance filtering:**
- Do not send state for entities the player cannot perceive
- Divide the world into spatial cells; send updates only for cells near the player
- MMOs with thousands of players depend entirely on aggressive relevance filtering
- Prioritize: nearby entities get full tick rate updates; distant entities get updates every 2–4 ticks

**Bit packing:**
- Pack boolean flags and small enums into individual bits rather than full bytes
- A weapon type enum with 8 values needs 3 bits, not 32
- Use a bitstream writer/reader that tracks bit position within a byte buffer

### NAT Traversal

Players behind routers with NAT (Network Address Translation) cannot receive incoming connections by default. P2P games and listen servers must solve this.

**NAT traversal techniques (in order of preference):**
1. **STUN (Session Traversal Utilities for NAT)**: Asks a public STUN server to discover the client's public IP and port mapping. Works for most consumer NATs (cone NAT types).
2. **TURN (Traversal Using Relays around NAT)**: Falls back to relaying traffic through a public server. Always works, but adds latency and server bandwidth cost. Essentially becomes client-server.
3. **UDP hole punching**: Both clients simultaneously send packets to each other's discovered public endpoint. The NAT creates a mapping for the outgoing packet, allowing the incoming packet through. Requires a signaling server to coordinate.
4. **Relay fallback**: If all else fails, route traffic through a dedicated relay. Steam Networking, Epic Online Services, and Xbox Live all provide relay infrastructure.

Steam's networking API (SteamNetworkingSockets) and Epic's EOS transport handle NAT traversal transparently. Using these saves months of implementation work.

### Anti-Cheat Architecture

Anti-cheat operates at two levels: server-side validation (essential) and client-side detection (supplementary).

**Server-side validation (non-negotiable):**
- Never trust the client. The client sends inputs, not results.
- Validate movement speed: if a player moved 100 units in one tick but max speed is 10 units/tick, reject the input
- Validate fire rate: if a weapon fires every 500 ms and two shots arrive 100 ms apart, reject the second
- Validate resource changes: if the client claims to have gained 1000 gold, verify the server's economy simulation agrees
- Validate line-of-sight for hit registration: a player behind a wall cannot hit someone on the other side

**Client-side detection (supplementary):**
- Memory scanning for known cheat signatures (aimbots, wallhacks, speed hacks)
- Integrity checking of game binaries and loaded DLLs
- Screenshot or frame capture for manual review
- Kernel-level anti-cheat drivers (EAC, BattlEye, Vanguard) for competitive titles
- Client-side detection is always bypassable given enough effort — it raises the bar, not the ceiling

**Architectural anti-cheat patterns:**
- **Fog of war / server-side culling**: Do not send positions of enemies the player cannot see. A wallhack cannot display what the client never received.
- **Server-side hit detection**: Never let the client report "I hit player X for Y damage." The server performs the raycast.
- **Rate limiting**: Cap the rate of any client action to match game design limits. Even if the client sends garbage inputs, the server processes at most one action per allowed interval.
- **Statistical anomaly detection**: Track per-player accuracy, headshot ratio, reaction time, and movement patterns. Flag statistical outliers for review. A 95% headshot accuracy in an FPS is not human.

### Lockstep Networking (RTS / Fighting Games)

Lockstep is an alternative to client-server prediction that is deterministic: all clients run the same simulation with the same inputs and arrive at the same state.

**How it works:**
1. Each client sends their inputs to all other clients (or via a relay)
2. No client advances to the next simulation frame until all inputs for that frame are received
3. Because the simulation is deterministic, all clients compute identical state without needing to send state at all
4. Only inputs are sent — bandwidth is minimal regardless of entity count

**Requirements:**
- The simulation must be perfectly deterministic: same inputs must produce bit-identical outputs on all platforms
- Floating-point determinism is extremely hard across different CPUs and compilers — many lockstep games use fixed-point math

**Fixed-point math implementation:** Use a Q16.16 or Q32.32 fixed-point representation for all game state calculations in lockstep systems. Libraries: libfixmath (C), FixedMath.Net (C#). All trigonometric functions must use lookup tables or polynomial approximations — never call platform math libraries (sin, cos, sqrt) as these are not deterministic across platforms. Performance cost: fixed-point is typically 2-5x slower than hardware float but eliminates desync bugs entirely.
- A single desync (one client computes a different result) is catastrophic — desyncs must be detected (via state hash comparison) and recovered from (resync or disconnect)

**Rollback networking (GGPO):**
- Used primarily in fighting games (Street Fighter, Guilty Gear, MultiVersus)
- Clients predict remote player inputs (usually "same as last frame")
- If the prediction was wrong, the game rolls back to the last confirmed state, re-applies corrected inputs, and fast-forwards to the current frame
- Produces very low-latency feel (no waiting for remote inputs) at the cost of occasional visual corrections
- Requires the simulation to be cheaply restorable to previous states (snapshot + replay)

### Social Layer and Matchmaking

The networking layer splits into two distinct concerns: low-level netcode (above) and high-level social/matchmaking services.

**Matchmaking architecture:**
- **Skill rating**: ELO, Glicko-2, TrueSkill, or custom MMR systems. Track mean skill and uncertainty separately. Decay rating for inactive players.
- **Queue management**: Accept players into a queue, form matches when enough players of similar skill are available. Widen the skill window over wait time to avoid infinite queues.
- **Region selection**: Match players within the same geographic region to minimize latency. Allow region override for players willing to accept higher ping for faster matches.
- **Party handling**: Parties must be matched together. Average party MMR vs highest-member MMR depends on game design. Pre-made teams should preferentially match against other pre-mades.

**Lobby and session management:**
- Use a service (Steam, EOS, PlayFab, GameLift) rather than building custom. Session management is complex (host migration, join-in-progress, backfill) and solved by existing platforms.
- Implement host migration for listen-server games: if the host disconnects, the session must seamlessly transfer authority to another player.
- Handle join-in-progress carefully: the joining player needs the full current game state, which must be serialized and transmitted without disrupting the game for existing players.

### Bandwidth Budget Example

```yaml
# Bandwidth budget for a 20-player battle royale at 30 Hz tick rate
# Per-player downstream (server -> client)

per_entity_update:
  position:     6 bytes   # 3 axes * 16-bit quantized
  rotation:     4 bytes   # Smallest-three quaternion, 10-bit per component
  velocity:     6 bytes   # 3 axes * 16-bit quantized
  health:       1 byte    # 0-255 mapped to 0-100%
  animation_id: 2 bytes   # Current animation state
  flags:        1 byte    # Crouching, sprinting, aiming, etc.
  total:        20 bytes

entities_in_relevance: 15          # Nearby players (not all 20)
updates_per_second: 30             # Tick rate
delta_ratio: 0.4                   # ~40% of entities change per tick

downstream_per_second:
  entity_data: 15 * 20 * 30 * 0.4 = 3,600 bytes = 3.5 KB/s
  game_events: ~1 KB/s             # Damage, pickups, zone changes
  overhead: ~0.5 KB/s              # Packet headers, ack, padding
  total: ~5 KB/s per player

upstream_per_second:
  player_input: ~1.5 KB/s          # Input at 60 Hz client, quantized
  ack_and_meta: ~0.5 KB/s
  total: ~2 KB/s per player

server_total_bandwidth:
  downstream: 5 KB/s * 20 = 100 KB/s = ~0.8 Mbps
  upstream: 2 KB/s * 20 = 40 KB/s = ~0.3 Mbps
  # Very manageable — bandwidth only becomes a concern at 100+ players
```

### Network Testing and Simulation

Never test multiplayer only on localhost. Real networks have latency, jitter, and packet loss.

**Network condition simulation:**
- Use `tc` (Linux traffic control), `clumsy` (Windows), or Network Link Conditioner (macOS/iOS) to add artificial latency, jitter, and packet loss
- Test profiles: LAN (1 ms, 0% loss), broadband (30 ms, 0.1% loss), average (80 ms, 1% loss), poor (150 ms, 3% loss), mobile (200 ms, 5% loss, high jitter)
- Run automated multiplayer playtests with bots under each profile
- Measure desync rate, rubber-banding frequency, and hit registration accuracy under each condition

**Minimum test matrix:**
- 2 players on localhost (baseline correctness)
- 2 players with 100 ms simulated RTT (typical online)
- Full lobby with 150 ms + 2% loss (stress test)
- One player with intermittent disconnects (reconnection handling)
- Host migration (for listen-server games) — kill the host process mid-game
