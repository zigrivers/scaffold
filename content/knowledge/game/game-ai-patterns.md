---
name: game-ai-patterns
description: Behavior trees, GOAP, utility AI, finite state machines, NavMesh pathfinding, perception systems, and companion AI
topics: [game-dev, ai, behavior-trees, goap, pathfinding, npc]
---

Game AI encompasses the systems that control non-player character behavior — from enemy combat tactics to companion pathfinding to ambient NPC routines. Unlike machine learning AI, game AI is deterministic and designed: every behavior is authored by a designer and executed by a runtime system. The goal is not intelligence but the appearance of intelligence — NPCs should behave in ways that feel believable, create interesting gameplay challenges, and respond to the player's actions in readable ways. The core trade-off in game AI is expressiveness vs. complexity: more sophisticated AI systems enable richer behavior but are harder to design, debug, and performance-tune.

## Summary

### AI Architecture Spectrum

Game AI systems exist on a spectrum from simple to complex:

- **Finite State Machines (FSM)**: States with explicit transitions. Simple, predictable, easy to debug. Falls apart when state count grows large. Best for simple enemies, UI, and game state management.
- **Behavior Trees (BT)**: Hierarchical task decomposition. Moderate complexity, highly readable, industry standard for action game AI. Used in Halo, Unreal Engine's default AI, most AAA combat AI.
- **Goal-Oriented Action Planning (GOAP)**: Agents define goals, planner finds action sequences to achieve them. More autonomous, harder to control. Used in F.E.A.R., Tomb Raider (2013 reboot).
- **Utility AI**: Score every possible action and pick the highest-scoring one. Extremely flexible, non-linear priority. Used in The Sims, Infinite Axis Utility System. Harder to predict and debug.

Each system has a sweet spot. Do not use GOAP for a platformer enemy that runs left and right. Do not use an FSM for an open-world companion that must react to hundreds of situations.

### NavMesh Pathfinding

Navigation meshes (NavMesh) are the standard solution for pathfinding in 3D games. A NavMesh is a simplified polygon mesh covering walkable surfaces. Agents find paths on this mesh using A* or similar algorithms. The mesh is typically baked offline by the engine (Unity, Unreal, and Godot all provide NavMesh baking tools) and modified at runtime for dynamic obstacles.

### Perception Systems

Perception systems model what an NPC can see, hear, and remember. Without a perception system, AI has perfect information — it knows where the player is at all times, which feels unfair and breaks stealth gameplay. Perception adds sight cones, hearing ranges, memory decay, and investigation behavior.

### Encounter Design and Difficulty Scaling

AI behavior must be tunable per encounter. A trash mob should not fight like a boss. Difficulty scaling adjusts AI parameters (reaction time, accuracy, aggression) rather than just health/damage numbers.

## Deep Guidance

### Finite State Machines for Game AI

FSMs are the simplest AI architecture. An NPC is in one state at a time and transitions to another state when conditions are met.

```typescript
// Finite State Machine for a guard NPC

type GuardState = "patrol" | "alert" | "chase" | "attack" | "search" | "return";

interface StateTransition {
  from: GuardState;
  to: GuardState;
  condition: (npc: GuardNPC) => boolean;
  priority: number;  // Higher priority transitions are checked first
}

interface GuardNPC {
  currentState: GuardState;
  position: Vector3;
  patrolRoute: Vector3[];
  patrolIndex: number;
  lastKnownPlayerPos: Vector3 | null;
  alertLevel: number;       // 0-100
  searchTimer: number;
  attackRange: number;
  sightRange: number;
  hearingRange: number;
}

const guardTransitions: StateTransition[] = [
  // Chase → Attack (highest priority when in range)
  {
    from: "chase",
    to: "attack",
    condition: (npc) => distToPlayer(npc) < npc.attackRange,
    priority: 10,
  },
  // Any state → Chase (player spotted)
  {
    from: "patrol",
    to: "chase",
    condition: (npc) => canSeePlayer(npc) && distToPlayer(npc) < npc.sightRange,
    priority: 9,
  },
  {
    from: "alert",
    to: "chase",
    condition: (npc) => canSeePlayer(npc),
    priority: 9,
  },
  {
    from: "search",
    to: "chase",
    condition: (npc) => canSeePlayer(npc),
    priority: 9,
  },
  // Patrol → Alert (heard something)
  {
    from: "patrol",
    to: "alert",
    condition: (npc) => canHearPlayer(npc) && npc.alertLevel > 30,
    priority: 5,
  },
  // Chase → Search (lost sight)
  {
    from: "chase",
    to: "search",
    condition: (npc) => !canSeePlayer(npc),
    priority: 4,
  },
  // Attack → Chase (player left range)
  {
    from: "attack",
    to: "chase",
    condition: (npc) => distToPlayer(npc) > npc.attackRange * 1.5,
    priority: 4,
  },
  // Search → Return (search timer expired)
  {
    from: "search",
    to: "return",
    condition: (npc) => npc.searchTimer <= 0,
    priority: 3,
  },
  // Return → Patrol (back at patrol route)
  {
    from: "return",
    to: "patrol",
    condition: (npc) => distToPatrolRoute(npc) < 2.0,
    priority: 2,
  },
];

function updateGuardFSM(npc: GuardNPC, dt: number): void {
  // Check transitions sorted by priority
  const applicable = guardTransitions
    .filter(t => t.from === npc.currentState)
    .sort((a, b) => b.priority - a.priority);

  for (const transition of applicable) {
    if (transition.condition(npc)) {
      exitState(npc, npc.currentState);
      npc.currentState = transition.to;
      enterState(npc, npc.currentState);
      break;
    }
  }

  // Execute current state behavior
  updateState(npc, npc.currentState, dt);
}

function enterState(npc: GuardNPC, state: GuardState): void {
  switch (state) {
    case "alert":
      npc.alertLevel = 50;
      playAnimation(npc, "alert_idle");
      break;
    case "chase":
      playAnimation(npc, "run");
      alertNearbyGuards(npc);  // Call for backup
      break;
    case "search":
      npc.searchTimer = 10.0;  // Search for 10 seconds
      playAnimation(npc, "search_look_around");
      break;
    case "attack":
      playAnimation(npc, "attack_ready");
      break;
    case "return":
      playAnimation(npc, "walk");
      break;
    case "patrol":
      playAnimation(npc, "walk");
      break;
  }
}

function exitState(npc: GuardNPC, _state: GuardState): void {
  // Clean up state-specific resources
}

function updateState(npc: GuardNPC, state: GuardState, dt: number): void {
  switch (state) {
    case "patrol":
      moveToward(npc, npc.patrolRoute[npc.patrolIndex], 3.0);
      if (distTo(npc.position, npc.patrolRoute[npc.patrolIndex]) < 1.0) {
        npc.patrolIndex = (npc.patrolIndex + 1) % npc.patrolRoute.length;
      }
      break;
    case "chase":
      moveToward(npc, getPlayerPosition(), 6.0);
      npc.lastKnownPlayerPos = getPlayerPosition();
      break;
    case "search":
      npc.searchTimer -= dt;
      moveToward(npc, npc.lastKnownPlayerPos!, 3.0);
      break;
    case "attack":
      facePlayer(npc);
      performAttack(npc);
      break;
    case "return":
      moveToward(npc, npc.patrolRoute[npc.patrolIndex], 3.0);
      break;
  }
}

// Helper stubs
interface Vector3 { x: number; y: number; z: number; }
function distToPlayer(_npc: GuardNPC): number { return 0; }
function canSeePlayer(_npc: GuardNPC): boolean { return false; }
function canHearPlayer(_npc: GuardNPC): boolean { return false; }
function distToPatrolRoute(_npc: GuardNPC): number { return 0; }
function distTo(_a: Vector3, _b: Vector3): number { return 0; }
function moveToward(_npc: GuardNPC, _target: Vector3, _speed: number): void {}
function getPlayerPosition(): Vector3 { return { x: 0, y: 0, z: 0 }; }
function facePlayer(_npc: GuardNPC): void {}
function performAttack(_npc: GuardNPC): void {}
function playAnimation(_npc: GuardNPC, _anim: string): void {}
function alertNearbyGuards(_npc: GuardNPC): void {}
```

**FSM limitations:**
- State explosion: N states can have N*(N-1) transitions. Adding "crouching" variants of every state doubles the state count.
- No concurrency: An FSM can only be in one state. An NPC that needs to patrol AND talk requires either a hierarchical FSM or a different architecture.
- Rigid behavior: FSM NPCs feel mechanical because transitions are binary — they switch abruptly from one behavior to another.

### Behavior Trees

Behavior trees decompose AI behavior into a hierarchy of tasks. The tree is evaluated top-to-bottom, left-to-right every tick. Each node returns Success, Failure, or Running.

**Node types:**
- **Sequence**: Runs children left-to-right. Fails if any child fails. Succeeds when all children succeed. (AND logic)
- **Selector/Fallback**: Runs children left-to-right. Succeeds if any child succeeds. Fails when all children fail. (OR logic)
- **Decorator**: Wraps a single child and modifies its behavior (Inverter, Repeater, Timeout, Cooldown)
- **Leaf/Action**: Performs an actual game action (MoveTo, Attack, PlayAnimation, Wait)
- **Condition**: Checks a predicate (CanSeePlayer, IsHealthLow, HasAmmo)

```yaml
# Behavior tree for a combat enemy (YAML representation)
# Read top-to-bottom: Selector tries each branch until one succeeds

root:
  type: Selector
  children:
    # Branch 1: Critical health — flee
    - type: Sequence
      children:
        - type: Condition
          check: "health_below"
          threshold: 20
        - type: Action
          name: "flee_to_cover"
        - type: Action
          name: "call_for_help"

    # Branch 2: In combat range — fight
    - type: Sequence
      children:
        - type: Condition
          check: "can_see_player"
        - type: Selector
          children:
            # Sub-branch 2a: Use grenade if available and player clustered
            - type: Sequence
              children:
                - type: Condition
                  check: "has_grenade"
                - type: Condition
                  check: "player_near_allies"
                  radius: 5.0
                - type: Decorator
                  kind: Cooldown
                  duration: 8.0
                  child:
                    type: Action
                    name: "throw_grenade"

            # Sub-branch 2b: Ranged attack from cover
            - type: Sequence
              children:
                - type: Condition
                  check: "in_cover"
                - type: Action
                  name: "peek_and_shoot"
                - type: Action
                  name: "duck_into_cover"

            # Sub-branch 2c: Close range — melee
            - type: Sequence
              children:
                - type: Condition
                  check: "player_within"
                  range: 3.0
                - type: Action
                  name: "melee_attack"

            # Sub-branch 2d: Advance to cover
            - type: Action
              name: "move_to_nearest_cover"

    # Branch 3: Alert — investigate
    - type: Sequence
      children:
        - type: Condition
          check: "alert_level_above"
          threshold: 30
        - type: Action
          name: "investigate_last_known_position"

    # Branch 4: Default — patrol
    - type: Action
      name: "patrol"
```

**Why behavior trees dominate game AI:**
- Readable by designers (visual node graphs in most engines)
- Modular — subtrees can be reused across NPC types
- Priority is implicit in left-to-right ordering (no explicit priority values)
- Running state allows long-running actions (MoveTo that takes many frames)
- Decorators handle cooldowns, retries, and timeouts cleanly

### Goal-Oriented Action Planning (GOAP)

GOAP inverts the control flow: instead of authoring behavior directly, you define actions with preconditions and effects, then a planner finds sequences of actions that satisfy a goal.

**GOAP components:**
- **Goals**: Desired world states (e.g., "player is dead", "at full health", "has ammo")
- **Actions**: Things the agent can do, with preconditions and effects
  - Attack: precondition {can_see_player, has_ammo}, effect {player_damaged}
  - Reload: precondition {ammo_in_pocket}, effect {has_ammo}
  - FindAmmo: precondition {knows_ammo_location}, effect {ammo_in_pocket}
  - Heal: precondition {has_medkit, health_below_50}, effect {health_above_50}
  - FlankPlayer: precondition {can_see_player, has_cover_nearby}, effect {in_flanking_position}
- **Planner**: A* search through action space to find a plan (sequence of actions) that transforms the current world state into the goal state

GOAP produces emergent behavior: NPCs chain actions in ways the designer did not explicitly author. A GOAP enemy might retreat to find ammo, then flank the player, then attack — a sequence that was never hand-coded but emerged from action preconditions and effects.

**GOAP trade-offs:**
- Emergent behavior can be surprising (good for players, challenging for designers)
- Harder to debug than behavior trees (why did the planner choose that plan?)
- Planning has CPU cost — cache plans and only re-plan when world state changes
- Requires careful action design — badly defined preconditions lead to degenerate plans

### Utility AI

Utility AI scores every available action on a 0-1 scale using response curves, then picks the highest-scoring action. This creates smooth, non-binary decision-making.

**Response curves:**
- **Linear**: Score increases linearly with input (hunger score rises linearly as food decreases)
- **Quadratic**: Score increases slowly at first, then rapidly (urgency builds exponentially)
- **Logistic**: S-curve — slow start, rapid middle, saturates at high values (most natural for biological needs)
- **Inverse**: Score decreases as input increases (interest in exploring decreases near already-explored areas)

Each action has multiple input axes, each with its own response curve. The final score is the product (or weighted average) of all axes.

**Example:** A Sims-style NPC choosing between Eat, Sleep, Socialize, and Work:
- Eat score = hunger_curve(hunger_level) * food_available_curve(nearby_food)
- Sleep score = tired_curve(energy_level) * bed_available_curve(bed_distance) * time_curve(hour_of_day)
- Socialize score = lonely_curve(social_need) * person_nearby_curve(nearest_npc) * relationship_curve(relationship_quality)
- Work score = duty_curve(work_urgency) * energy_curve(energy_level) * time_curve(hour_of_day)

The NPC picks whichever scores highest. This creates naturalistic behavior: an NPC does not abruptly switch from "working" to "eating" at exactly 50% hunger. Instead, the eat score gradually rises and eventually overtakes work.

### NavMesh Configuration

```typescript
// NavMesh configuration for different agent types

interface NavMeshConfig {
  agentRadius: number;       // Agent collision radius in world units
  agentHeight: number;       // Agent height for clearance checks
  maxSlope: number;          // Maximum walkable slope in degrees
  stepHeight: number;        // Maximum step-up height (stairs, curbs)
  dropHeight: number;        // Maximum drop-down height before needing a jump
  jumpDistance: number;      // Maximum horizontal gap traversable
  cellSize: number;          // NavMesh voxel resolution (smaller = more precise, slower to bake)
  cellHeight: number;        // Vertical voxel resolution
}

// Different agent types need different NavMesh layers
const agentConfigs: Record<string, NavMeshConfig> = {
  humanoid: {
    agentRadius: 0.4,
    agentHeight: 1.8,
    maxSlope: 45,
    stepHeight: 0.4,
    dropHeight: 2.5,
    jumpDistance: 0,          // Humans don't auto-jump on NavMesh
    cellSize: 0.15,
    cellHeight: 0.2,
  },
  large_creature: {
    agentRadius: 1.5,
    agentHeight: 3.0,
    maxSlope: 35,
    stepHeight: 0.8,
    dropHeight: 4.0,
    jumpDistance: 0,
    cellSize: 0.3,           // Coarser resolution — large agents don't need tight spaces
    cellHeight: 0.3,
  },
  flying: {
    // Flying agents often skip NavMesh entirely and use 3D pathfinding
    // or simple steering behaviors in open airspace
    agentRadius: 0.5,
    agentHeight: 0.5,
    maxSlope: 90,             // Can fly over anything
    stepHeight: 100,
    dropHeight: 100,
    jumpDistance: 100,
    cellSize: 0.5,
    cellHeight: 0.5,
  },
};

// NavMesh areas for cost-based pathfinding
// Agents prefer lower-cost areas, enabling tactical routing
const navMeshAreas = {
  walkable: { cost: 1.0 },          // Default terrain
  road: { cost: 0.5 },              // Prefer roads (faster movement)
  mud: { cost: 3.0 },               // Avoid mud (slower movement)
  dangerous: { cost: 10.0 },        // Heavily penalize dangerous zones
  water_shallow: { cost: 2.0 },     // Passable but slow
  water_deep: { cost: Infinity },   // Impassable for non-swimming agents
};

// Dynamic obstacle handling
// When obstacles spawn/move at runtime, NavMesh needs updating
interface DynamicObstacle {
  shape: "box" | "cylinder";
  size: Vector3;
  carveNavMesh: boolean;      // true = cut a hole in NavMesh; false = use avoidance only
  // Carving is expensive — use only for large, infrequent changes (bridges destroyed, doors closed)
  // For small/frequent obstacles (other NPCs, vehicles), use avoidance steering instead
}
```

### Perception Systems

**Sight:**
- Defined by a cone: direction, angle (field of view, typically 90-120 degrees), and range
- Blocked by geometry (raycasts from NPC eyes to target)
- Detection is not instant: awareness builds over time based on distance, movement, and lighting
- Peripheral vision has longer detection time than center vision

**Hearing:**
- Defined by a radius around the NPC
- Sounds have volume that attenuates with distance (inverse square or simpler linear falloff)
- Different actions have different noise levels: walking (quiet), running (medium), gunfire (loud), explosion (very loud)
- Blocked partially by walls (sound travels around corners but is attenuated)

**Memory and investigation:**
- When perception is lost (target leaves sight/hearing range), the NPC remembers the last known position
- Memory decays over time — an NPC who lost sight of the player 30 seconds ago should not walk directly to the player's current position
- Investigation behavior: move to last known position, search nearby areas, then give up

**Aggro radius:**
- Enemies within aggro radius enter combat when the player approaches
- Aggro radius should be tuned per encounter: open fields use larger radius, corridors use shorter
- Social aggro: nearby allies within a radius also aggro when one NPC engages

### Encounter Scripting

Encounters are hand-designed combat or challenge scenarios. Effective encounter scripting layers authored triggers on top of AI systems.

**Trigger types:**
- **Proximity triggers**: Player enters a zone; enemies spawn or activate
- **Event triggers**: Player picks up an item or interacts with an object; combat begins
- **Kill triggers**: A certain number of enemies killed triggers the next wave
- **Timer triggers**: After N seconds, reinforcements arrive
- **Health triggers**: Boss reaches 50% health; phase 2 begins

### Difficulty Scaling Through AI Parameters

Rather than scaling only health and damage (the "bullet sponge" approach), scale AI behavior parameters:

```yaml
# AI difficulty scaling — tune behavior, not just numbers
difficulty_scaling:
  easy:
    reaction_time_ms: 800        # Slow to react to player
    accuracy_base: 0.3           # 30% shots hit at medium range
    accuracy_moving: 0.1         # Very inaccurate while moving
    aggression: 0.3              # Rarely pushes forward
    flank_probability: 0.1       # Almost never flanks
    grenade_frequency: 0.05      # Rarely uses grenades
    cover_seek_priority: 0.9     # Strongly prefers cover
    group_coordination: false    # Enemies act independently
    perception_range_mult: 0.7   # Shorter sight/hearing range
    aim_sway_degrees: 15         # Very inaccurate aim

  normal:
    reaction_time_ms: 400
    accuracy_base: 0.5
    accuracy_moving: 0.25
    aggression: 0.5
    flank_probability: 0.3
    grenade_frequency: 0.15
    cover_seek_priority: 0.7
    group_coordination: true     # Enemies coordinate
    perception_range_mult: 1.0
    aim_sway_degrees: 8

  hard:
    reaction_time_ms: 200
    accuracy_base: 0.7
    accuracy_moving: 0.4
    aggression: 0.7
    flank_probability: 0.6       # Frequently flanks
    grenade_frequency: 0.3       # Regular grenades
    cover_seek_priority: 0.5     # Willing to trade cover for aggression
    group_coordination: true
    perception_range_mult: 1.3   # Extended awareness
    aim_sway_degrees: 4

  # Dynamic difficulty: adjust parameters based on player performance
  dynamic:
    metric: "deaths_per_encounter"
    # If player dies more than 2x per encounter, ease toward easy
    # If player takes less than 10% damage per encounter, push toward hard
    adjustment_rate: 0.1         # Blend 10% toward target per encounter
    floor: "easy"
    ceiling: "hard"
```

### Companion AI Patterns

Companion AI has unique requirements compared to enemy AI. The companion must help without stealing the player's agency, stay out of the player's way, and feel like a character rather than a utility.

**Core companion behaviors:**
- **Following**: Stay near the player without blocking movement. Use path offset (slightly behind and to the side). Teleport to player if distance exceeds a threshold (prevents companions getting stuck).
- **Combat assist**: Attack enemies the player is fighting, but deal less damage than the player. Do not kill enemies the player is clearly targeting (steal kills feel bad). Prioritize enemies the player is not focused on.
- **Callouts**: Bark when they see an enemy, find a resource, or notice a point of interest. Barks should be informative ("Enemy on the roof!") not annoying (no constant chatter).
- **Navigation**: Companions must never block doorways, narrow passages, or line of fire. Push aside if the player bumps into them. Pathfind independently but prefer the player's path.
- **Invulnerability decision**: Many games make companions invulnerable (or very durable) because the player cannot control companion positioning. A companion that dies constantly frustrates players. If the companion can die, provide a revive mechanic.

### AI Debugging

AI bugs are hard to reproduce because they depend on runtime state. Build debugging tools early:

- **Visual debug drawing**: Sight cones, hearing radii, NavMesh paths, current behavior tree node, current state
- **AI log**: Per-NPC decision log showing what was evaluated, what scored highest, what was chosen, and why alternatives were rejected
- **Freeze and inspect**: Ability to pause the game and inspect any NPC's full AI state (current BT node, GOAP plan, utility scores, perception targets)
- **Record and replay**: Capture AI inputs (world state each frame) and replay to reproduce bugs deterministically
- **Slow motion**: Run the game at 0.25x speed to observe AI decision-making in real time

## Genre-Specific AI Patterns

### Strategy Game AI

Strategy AI operates on longer time horizons than action AI. Key patterns:

- **Influence Maps**: 2D grid overlays tracking resource density, threat level, territory control. Update per turn or every N seconds. Used for build placement decisions, army movement, and resource prioritization.
- **Build Order Planning**: Decision trees or scripted sequences for early-game economy. At higher difficulty, use Monte Carlo Tree Search (MCTS) to evaluate build paths 10-20 turns ahead.
- **Opponent Modeling**: Track player tendencies (aggressive/defensive/economic) and adapt strategy. Simple approach: weighted counter-strategy table. Advanced: maintain belief state of opponent's hidden information.

### Turn-Based AI

- **Minimax with Alpha-Beta Pruning**: Standard for two-player zero-sum games (chess, checkers). Search depth 4-8 plies for real-time-constrained turns. Evaluation function must be fast (<1ms per position).
- **Monte Carlo Tree Search (MCTS)**: Preferred for games with large branching factors (Go, complex card games). Run 1,000-10,000 simulations per decision within the time budget. UCB1 exploration constant: typically 1.0-1.4.

### Racing AI

- **Racing Line Following**: Precompute optimal racing line as spline control points. AI follows line with rubber-banding: if too far ahead, reduce throttle by 5-15%; if behind, increase by 10-20%. Expose difficulty parameter controlling how closely AI follows the optimal line.
- **Overtaking Decision**: Distance-to-corner, speed differential, and track width determine whether to attempt pass. Use simple cost function: `overtake_score = speed_advantage * track_width / distance_to_corner`.

### Simulation/Management AI

- **Need-Based Scheduling**: NPCs maintain need queues (hunger, rest, social). Highest-urgency need drives behavior selection. Satisfaction decay rates define personality: fast hunger decay = always eating. Based on Sims-style utility curves.
- **Agent Scheduling**: For city-builder NPCs: pathfind to workplace at shift start, return home at shift end. Use job queue with priority: emergency > assigned work > idle tasks. Budget 0.5-1ms per agent per tick for 100+ simultaneous agents.
