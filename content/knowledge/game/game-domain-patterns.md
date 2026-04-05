---
name: game-domain-patterns
description: ECS vs DDD as mutually exclusive per-layer patterns, game state machines, and domain modeling for games
topics: [game-dev, ecs, ddd, state-machines, domain-modeling]
---

Game software architecture differs fundamentally from business software architecture because games have two distinct layers with incompatible optimization goals: the simulation layer (real-time, data-oriented, performance-critical) and the meta-game layer (behavior-rich, event-driven, correctness-critical). Choosing the right domain modeling approach for each layer is essential. ECS and DDD are mutually exclusive paradigms — applying the wrong one to a layer creates friction that compounds throughout development.

## Summary

### Two Layers, Two Paradigms

Games are split into two architectural layers that demand different modeling approaches:

**Simulation Layer** (the "game" part):
- Processes thousands of entities per frame at 16ms or 33ms budgets
- Data access patterns dominate: iterate over all entities with Health, iterate over all entities with Position+Velocity
- Behavior is uniform: every entity with the same components processes identically
- Optimization is existential: a 1ms regression in a core system is a shipped bug
- **Use ECS (Entity-Component-System)** — data-oriented, cache-friendly, composable

**Meta-Game Layer** (the "around the game" part):
- Manages player profiles, inventories, progression, matchmaking, economy, social features
- Rich business rules: "a player can equip an item only if their level meets the requirement and the item is not already equipped by another character in the same party"
- Correctness matters more than raw throughput
- Domain language is complex and stakeholder-facing
- **Use DDD (Domain-Driven Design)** — behavior-oriented, encapsulated, rule-rich

**Do NOT mix these within a layer.** ECS in the meta-game layer creates anemic data bags with scattered business logic. DDD in the simulation layer creates cache-hostile object graphs that kill frame rates. Each paradigm is correct for its layer and wrong for the other.

### Game State Machines

State machines are the universal pattern in game development. They appear at every scale:

- **Character states**: Idle, Walking, Running, Jumping, Falling, Attacking, Stunned, Dead
- **Game states**: MainMenu, Loading, Playing, Paused, GameOver, Victory
- **AI states**: Patrol, Alert, Chase, Attack, Flee, Search
- **Animation states**: Blend trees driven by state machine transitions
- **UI states**: Screen stacks, modal dialogs, transition animations

State machines enforce that an entity can only be in one state at a time and that transitions between states are explicit and guarded.

### Game-Specific Ubiquitous Language

Games have domain-specific vocabulary that must be consistent across code, design docs, and team communication:

- **Entity**: A thing that exists in the game world (character, projectile, pickup, trigger zone)
- **Component**: A data bucket attached to an entity (Health, Transform, Renderable, Collider)
- **System**: A function that processes all entities with a specific component signature
- **Tick/Frame**: One iteration of the game loop
- **Spawn**: Creating a new entity at runtime
- **Despawn/Destroy**: Removing an entity from the world
- **Pool**: A pre-allocated set of reusable entities to avoid runtime allocation
- **Buff/Debuff**: A temporary modifier to an entity's stats
- **Cooldown**: A timer preventing repeated use of an ability
- **Aggro/Threat**: A value determining which target an AI prioritizes

## Deep Guidance

### ECS for the Simulation Layer

Entity-Component-System is a data-oriented architecture where:
- **Entities** are lightweight identifiers (typically just an integer ID)
- **Components** are plain data structs with no behavior (Position, Velocity, Health, DamageOnContact)
- **Systems** are functions that query for entities matching a component signature and process them

The key insight is that behavior lives in systems, not in entities or components. An entity does not "know" how to move — the MovementSystem queries all entities with Position+Velocity and updates their positions.

```typescript
// ECS Example: Components are pure data, Systems are pure logic

// --- Components (data only, no methods) ---

interface Position {
  x: number;
  y: number;
}

interface Velocity {
  dx: number;
  dy: number;
}

interface Health {
  current: number;
  max: number;
}

interface DamageOnContact {
  amount: number;
  destroySelfAfterHit: boolean;
}

interface Collider {
  radius: number;
  layer: "player" | "enemy" | "projectile" | "pickup";
}

// --- Systems (logic only, no state) ---

function movementSystem(
  world: World,
  deltaTime: number
): void {
  // Query all entities that have BOTH Position and Velocity
  for (const [entity, pos, vel] of world.query<[Position, Velocity]>()) {
    pos.x += vel.dx * deltaTime;
    pos.y += vel.dy * deltaTime;
  }
}

function collisionSystem(world: World): void {
  // Query all entities with Position and Collider
  const collidables = world.query<[Position, Collider]>();

  for (const [entityA, posA, colA] of collidables) {
    for (const [entityB, posB, colB] of collidables) {
      if (entityA === entityB) continue;
      // Layer-based collision filtering
      if (!shouldCollide(colA.layer, colB.layer)) continue;

      const dist = distance(posA, posB);
      if (dist < colA.radius + colB.radius) {
        world.emit("collision", { entityA, entityB });
      }
    }
  }
}

function damageOnContactSystem(world: World): void {
  // React to collision events
  for (const { entityA, entityB } of world.events("collision")) {
    const damageA = world.get<DamageOnContact>(entityA);
    const healthB = world.get<Health>(entityB);

    if (damageA && healthB) {
      healthB.current -= damageA.amount;
      if (damageA.destroySelfAfterHit) {
        world.despawn(entityA);
      }
    }
  }
}

// --- Entity creation (composition, not inheritance) ---

function spawnPlayer(world: World, x: number, y: number): Entity {
  return world.spawn(
    { x, y } as Position,
    { dx: 0, dy: 0 } as Velocity,
    { current: 100, max: 100 } as Health,
    { radius: 16, layer: "player" } as Collider
  );
}

function spawnProjectile(
  world: World,
  x: number, y: number,
  dx: number, dy: number
): Entity {
  return world.spawn(
    { x, y } as Position,
    { dx, dy } as Velocity,
    { amount: 25, destroySelfAfterHit: true } as DamageOnContact,
    { radius: 4, layer: "projectile" } as Collider
  );
}
```

**Why ECS works for simulation:**
- **Cache efficiency**: Components of the same type are stored contiguously in memory; iterating over all Position components is a linear memory scan, not pointer-chasing through object graphs
- **Composition over inheritance**: An entity's behavior emerges from its component combination; no deep inheritance hierarchies or diamond problems
- **Parallelism**: Systems that touch non-overlapping component sets can run in parallel
- **Flexibility**: Adding new behavior means adding a new component and system, not modifying existing classes

**ECS pitfalls:**
- Debugging is harder — an entity is just an ID; you need tooling to inspect its component set
- Relational queries (find all enemies within range of a specific player) require spatial indexing, not just component queries
- One-off behaviors feel awkward — if only one entity has a unique mechanic, creating a component and system for one entity feels like overkill (but do it anyway for consistency)

### DDD for the Meta-Game Layer

The meta-game layer manages persistent state that exists outside the real-time simulation: player accounts, inventories, progression trees, matchmaking, economies, social graphs. These domains are rich in business rules and benefit from DDD's emphasis on encapsulation and domain language.

**Inventory example using DDD:**
- An Inventory is an Aggregate Root that enforces capacity limits, stacking rules, and equip requirements
- An Item is a Value Object — two items with the same properties are interchangeable
- Equipping an item is a domain operation on the Inventory aggregate, not a flag flip on the item
- Domain events (ItemEquipped, ItemDropped, InventoryFull) communicate changes to other systems

**Why DDD works for meta-game:**
- Business rules are encapsulated in domain objects, not scattered across controllers and services
- Ubiquitous language keeps code readable by designers ("player.inventory.equip(item)" reads like the design doc)
- Aggregates enforce transactional boundaries — an inventory operation either fully succeeds or fully rolls back
- Domain events enable loose coupling between meta-game subsystems

**Why DDD fails for simulation:**
- Object graphs with references and encapsulation create cache-hostile memory layouts
- Method dispatch (virtual calls through interfaces) prevents compiler optimization and branch prediction
- Encapsulation means systems cannot batch-process similar data across entities
- The overhead of aggregate boundaries and domain events is unacceptable at 60fps for thousands of entities

### State Machine Patterns

**Finite State Machine (FSM):**

The simplest state machine. Each state has a set of allowed transitions. An entity is in exactly one state at a time.

Use for: Character controllers, game flow, simple AI, UI screens.

Limitations: State explosion when states need to combine (walking+aiming, crouching+reloading). Transitions become a combinatorial matrix.

**Hierarchical State Machine (HSM):**

States can contain sub-states. A "Combat" super-state might contain "MeleeAttack," "RangedAttack," and "Block" sub-states. The super-state handles common transitions (e.g., any combat sub-state can transition to "Stunned"), reducing transition duplication.

Use for: Complex character controllers, sophisticated AI, multi-phase boss fights.

**Pushdown Automaton (PDA):**

A stack of states. "Pushing" a state pauses the current one; "popping" resumes it. The pause menu is a classic example: push Paused onto the Playing state, pop it to resume.

Use for: Menu stacks, interrupt-based gameplay (cutscene interrupts exploration, then resumes), nested game states.

**State machine implementation rules:**
- States should be classes or objects, not stringly-typed enums (allows behavior attachment)
- Every state must define: `onEnter()`, `onUpdate(dt)`, `onExit()`
- Transitions are guarded: a transition from Idle to Attack requires `hasAmmo && !isCooldown`
- State machines should be data-driven when possible (load states and transitions from config)
- Log state transitions during development — most gameplay bugs are state transition bugs

### Resource and Inventory Patterns

**Resource types in games:**
- **Currencies**: Discrete countable values (gold, gems, energy). Store as integers to avoid floating-point drift.
- **Items**: Discrete objects with properties (weapons, armor, consumables). May be stackable or unique.
- **Meters**: Continuous values that fill/drain (health, mana, stamina, fuel). Usually floats with clamping.
- **Timers**: Resources that regenerate over real or game time (energy, daily rewards, cooldowns).

**Inventory patterns:**
- **Slot-based**: Fixed number of slots, each holds one item (or stack). UI-friendly, capacity is explicit.
- **Weight-based**: Items have weight, inventory has a weight limit. More flexible, harder to visualize.
- **Hybrid**: Slot-based with weight limits (e.g., Diablo: grid-based slots, each item occupies different grid sizes).

**Economy sink/faucet balance:**
- Faucets (sources of currency): quest rewards, enemy drops, crafting, trading, daily login
- Sinks (drains of currency): item purchases, upgrades, repair costs, taxes, consumables
- If faucets exceed sinks, inflation occurs and currency becomes worthless
- Track currency generation and consumption rates per player-hour and tune aggressively

### Player Progression Models

**Experience/Level systems:**
- XP curve formula matters: linear (constant effort per level), polynomial (increasing effort), exponential (dramatically increasing effort)
- Common formula: `xp_for_level(n) = base * n^exponent` where exponent of 1.5-2.0 is typical
- Level caps should match content: if the game has 20 hours of content, the level cap should be reachable in roughly 20 hours

**Skill trees / Talent systems:**
- Flat trees (many small choices) vs deep trees (few branching paths with big impact)
- Respec cost: free respec encourages experimentation, costly respec encourages commitment
- Trap choices (options that are never worth taking) are a design failure — every node should be viable in some build

**Unlock progression:**
- Gate unlocks behind milestones, not just time played
- Sequence unlocks to gradually increase complexity (do not give the player every mechanic in the tutorial)
- Prestige mechanics extend endgame by trading progress for permanent bonuses

### Combat System Modeling

**Damage calculation patterns:**
- **Subtractive armor**: `damage = attack - defense` (simple, intuitive, but defense can fully negate)
- **Multiplicative armor**: `damage = attack * (1 - defense_percent)` (defense never fully negates)
- **Hybrid**: `damage = (attack - flat_reduction) * (1 - percent_reduction)` (most RPGs use this)

**Attack resolution flow:**
1. Attacker generates base damage (weapon + stats)
2. Apply attacker modifiers (buffs, critical hits, elemental bonuses)
3. Apply defender modifiers (armor, resistances, shields)
4. Apply environmental modifiers (cover, elevation, weather)
5. Resolve final damage (clamp to non-negative, apply to health)
6. Trigger feedback (hit animation, damage numbers, sound effect, screen shake)

### Spawning and Object Pooling

**Object pooling** pre-allocates a fixed number of entities and recycles them instead of creating/destroying at runtime. This avoids garbage collection spikes and allocation overhead.

**Pool sizing rules:**
- Size the pool to the maximum concurrent count needed plus a 20% buffer
- If the pool is exhausted, either grow it (with a warning log) or recycle the oldest active instance
- Pre-warm pools during loading screens, not during gameplay
- Profile actual usage to right-size pools — over-pooling wastes memory, under-pooling causes runtime allocation

**Spawn patterns:**
- **Wave spawning**: Groups of enemies spawn at intervals; common in action games and tower defense
- **Proximity spawning**: Entities spawn when the player enters a trigger zone; keeps entity counts manageable in open worlds
- **Procedural spawning**: Rules-based placement (spawn enemy X at least Y meters from player, at least Z meters from other enemies); used in roguelikes and open-world games
- **Director-based spawning**: An AI "director" monitors player performance and adjusts spawn rates, types, and placement to maintain tension (Left 4 Dead's AI Director is the canonical example)
