---
name: game-level-content-design
description: Level metrics, greyboxing standards, flow and pacing, streaming strategies, encounter design, procedural generation, and difficulty curves
topics: [game-dev, level-design, world-design, procedural, streaming]
---

Level design is the discipline of building the spaces that players inhabit and the experiences they have within those spaces. It bridges game design, environment art, and engineering — a level designer must understand player movement metrics (how high can they jump, how fast do they run, how wide is their collision capsule), pacing principles (tension-release cycles, difficulty ramps), and technical constraints (streaming budgets, draw call limits, memory footprints). Good level design is invisible: the player feels guided without feeling railroaded, challenged without feeling frustrated, and rewarded without feeling manipulated.

## Summary

### Player Movement Metrics

Every level must be designed around precise, measured player capabilities. These metrics are established during prototyping and become the dimensional constants of level construction.

**Core metrics to define and document:**
- **Player capsule dimensions**: Width (diameter) and height — determines minimum corridor width and door height
- **Walk speed**: Meters per second at normal movement
- **Run/sprint speed**: Meters per second at maximum movement
- **Jump height**: Maximum vertical reach from standing (and running if different)
- **Jump distance**: Maximum horizontal gap clearable at sprint speed
- **Mantle height**: Maximum ledge height the player can grab and climb over
- **Crouch height**: Reduced capsule height for crawl spaces
- **Camera height**: Eye level relative to ground — affects sightlines and cover design

**Typical metric ranges (scale in meters, 1 unit = 1 meter):**
- Corridor width: player width x 2.5 minimum (to prevent claustrophobic feel), 3–4m for comfortable traversal
- Door width: player width x 2 minimum, 1.5–2m typical
- Door height: player height x 1.3 minimum, 2.4–3m typical
- Stair step height: 0.15–0.25m (match player step-up threshold)
- Railing/cover height: 0.8–1.2m (must block standing camera but allow aim-over)
- Jump gap: max jump distance minus 20% safety margin
- Ceiling height: 3–4m for interiors, creates comfortable proportion

### Greyboxing Standards

Greyboxing (also called blockout or whiteboxing) is the practice of building levels with simple geometric shapes to validate layout, flow, and gameplay before investing in environment art.

**Greybox rules:**
- Use untextured or single-color primitives (boxes, cylinders, planes)
- Build to exact player metrics — every jump, every door, every cover piece must be precisely measured
- Include gameplay-critical elements: spawn points, objective locations, AI patrol paths, cover positions, item pickups
- Playtest the greybox before any art pass — fix layout problems when the cost of change is zero
- Color-code greybox elements by function: grey for static geometry, blue for interactable, red for hazards, green for objectives, yellow for spawns
- The greybox IS the level — art replaces the geometry but does not change the layout

### Flow and Pacing Principles

Level flow describes the intended path and experience arc of the player through a space. Pacing is the rhythm of intensity — alternating between high-action moments and rest/exploration moments.

**Flow patterns:**
- **Linear corridor**: Player moves from A to B through a series of connected spaces. Easiest to pace, lowest replayability. Used in narrative-driven games.
- **Hub and spoke**: Central area with branches leading to objectives. Player chooses order. Provides agency while maintaining structure.
- **Open arena**: Large space with multiple traversal options and objective points. Used for combat encounters, boss fights, multiplayer maps.
- **Metroidvania loop**: Interconnected rooms that loop back on themselves, gated by ability acquisition. High exploration satisfaction, complex to design.
- **Open world**: Player-driven exploration with points of interest distributed across a large map. Requires streaming, landmark navigation, and density management.

**Pacing rhythm (tension curve):**
1. Introduction — safe space, establish new mechanic or environment
2. Rising tension — encounters escalate in difficulty or complexity
3. Climax — peak challenge (mini-boss, puzzle climax, setpiece)
4. Release — reward, safe space, narrative payoff
5. Repeat with escalation

### Streaming Strategies

Large levels and open worlds exceed memory budgets. Streaming loads and unloads content as the player moves through the world.

**Approaches:**
- **Unreal World Partition**: Automatic grid-based streaming. World divided into cells loaded/unloaded based on player distance. Recommended for Unreal open worlds.
- **Unity Addressable Scenes**: Additive scene loading with reference-counted asset bundles. Manual streaming control via scene triggers or distance checks.
- **Godot scene loading**: `ResourceLoader.load_threaded_request()` for async loading, manual additive scene management.
- **Chunk-based**: World divided into fixed-size chunks (like Minecraft). Simple to implement, predictable memory budget per chunk, natural for voxel or grid-based games.

## Deep Guidance

### Level Metrics Reference Sheet

Every project should maintain a metrics reference sheet that all level designers use. This ensures consistency across levels built by different designers.

```yaml
# level_metrics.yaml — Player capability reference for level construction
# All values in meters unless otherwise noted
# Update these values when player controller tuning changes

player:
  capsule:
    radius: 0.35
    standing_height: 1.8
    crouch_height: 1.0
    prone_height: 0.5    # if applicable

  movement:
    walk_speed: 3.5       # m/s
    run_speed: 6.0        # m/s
    sprint_speed: 8.5     # m/s (if sprint is separate from run)
    crouch_speed: 1.5     # m/s
    swim_speed: 3.0       # m/s

  jump:
    standing_height: 1.2   # m — max vertical from standing
    running_height: 1.4    # m — slightly higher with momentum
    standing_distance: 2.5 # m — horizontal from standing
    running_distance: 5.0  # m — horizontal at sprint speed
    double_jump_height: 2.5 # m — if applicable
    wall_jump_height: 2.0   # m — if applicable

  traversal:
    mantle_height: 2.0    # m — max ledge grab height
    step_up_height: 0.35  # m — auto-step over small obstacles
    slide_under_height: 1.0 # m — gap that slide can pass through
    ladder_speed: 2.0     # m/s — vertical climbing speed
    zipline_speed: 10.0   # m/s — if applicable

  camera:
    eye_height_standing: 1.65  # m from ground
    eye_height_crouching: 0.85
    fov_horizontal: 90         # degrees (adjustable in settings)

# Level construction guides derived from player metrics
construction:
  doors:
    min_width: 1.0        # player diameter * 1.4 rounded up
    standard_width: 1.5
    double_door_width: 2.5
    min_height: 2.2       # player height * 1.2
    standard_height: 2.5

  corridors:
    min_width: 1.5        # feels claustrophobic — use intentionally
    standard_width: 3.0   # comfortable single-lane movement
    wide_width: 5.0       # allows two players side-by-side
    min_height: 2.5
    standard_height: 3.5

  stairs:
    step_height: 0.2      # within step_up threshold
    step_depth: 0.3       # comfortable foot placement
    width: 1.5            # standard corridor width
    landing_depth: 2.0    # turning landing for U-stairs

  cover:
    low_cover_height: 1.0  # player can aim over when standing
    high_cover_height: 1.8 # player cannot aim over, must peek around
    cover_width: 1.5       # min width to fully hide player capsule
    peek_gap: 0.3          # space between cover pieces for peeking

  jumps:
    safe_gap: 3.5          # running jump distance * 0.7 safety margin
    max_gap: 4.5           # running jump distance * 0.9 — expert-only
    safe_height: 1.0       # standing jump height * 0.83
    max_height: 1.2        # standing jump height — requires precision

  sightlines:
    engagement_close: 10   # m — shotgun/melee range
    engagement_mid: 30     # m — assault rifle optimal
    engagement_long: 80    # m — sniper/marksman range
    max_render: 500        # m — LOD and fog limit visibility beyond this
```

### Greyboxing Workflow

A disciplined greyboxing workflow ensures levels are gameplay-validated before art investment.

**Phase 1: Paper design (1–2 days)**
- Top-down sketch of the level layout on paper or whiteboard
- Mark critical path, secondary paths, secret areas
- Note encounter locations with enemy counts and types
- Note pickup locations with item types
- Review with design lead before building

**Phase 2: Blockout in engine (2–5 days)**
- Build the level using primitive shapes at exact player metrics
- Place player start, objectives, enemy spawners, item pickups
- Implement basic AI navigation (navmesh bake) and pathfinding
- Add temporary lighting (bright, even, functional — not artistic)
- No art assets, no textures, no decorative geometry

**Phase 3: Internal playtest (1 day)**
- All level designers play each other's greyboxes
- Evaluate: flow (does the path feel natural?), pacing (are encounters spaced well?), readability (does the player know where to go?), fun (is it enjoyable?)
- Document issues by location and priority
- Iterate on blockout based on feedback

**Phase 4: Art pass begins only after greybox approval**
- Environment artists replace primitives with final geometry
- Keep collision volumes from the greybox — do not let art meshes change collision
- If art requires layout changes, re-validate with a greybox-only playtest

### Encounter Design

Encounters are designed gameplay moments — typically combat, but also puzzles, traversal challenges, or narrative beats. Each encounter exists within a defined space and has a designed experience arc.

**Combat encounter anatomy:**

1. **Approach** — Player sees or anticipates the encounter space before engaging. The space telegraphs what is coming: cover placement suggests a firefight, elevation suggests a sniper, tight corridors suggest close-quarters.

2. **Engagement** — Combat begins. The encounter should have a designed "shape":
   - **Wave encounters**: Enemies arrive in groups with brief pauses between waves. Each wave escalates (more enemies, tougher types, flanking positions).
   - **Arena encounters**: Fixed set of enemies in an open space. Player chooses engagement order and positioning. Boss fights are a specialized arena encounter.
   - **Gauntlet encounters**: Player moves through a space while enemies attack continuously. Tests movement and prioritization.

3. **Resolution** — Combat ends with a clear signal (music change, door opens, loot drops). Give the player a moment to breathe before the next encounter.

**Encounter spacing:**
- Minimum 30 seconds of non-combat traversal between combat encounters (prevents fatigue)
- Major encounters (mini-boss, setpiece) should be preceded by 1–2 minutes of low-intensity gameplay
- After a climactic encounter, provide a rest area with ambient storytelling, loot, or narrative content
- The ratio of combat time to non-combat time depends on genre: action games ~60/40, narrative games ~20/80, survival horror ~30/70

### Procedural Generation Rulesets

Procedural generation creates level content algorithmically rather than by hand. It requires explicit rulesets to produce coherent, playable results.

**Room-based dungeon generation (roguelike pattern):**

```python
# dungeon_generator.py — Rule-based procedural dungeon layout
# Generates a graph of rooms connected by corridors

import random
from dataclasses import dataclass, field
from enum import Enum, auto

class RoomType(Enum):
    SPAWN = auto()
    COMBAT = auto()
    TREASURE = auto()
    SHOP = auto()
    BOSS = auto()
    SECRET = auto()
    REST = auto()  # Safe room with no enemies

@dataclass
class Room:
    id: int
    room_type: RoomType
    width: float   # meters
    height: float  # meters
    connections: list[int] = field(default_factory=list)

@dataclass
class DungeonConfig:
    """Configuration for dungeon generation rules."""
    total_rooms: int = 15
    min_room_size: float = 8.0    # meters
    max_room_size: float = 25.0   # meters
    boss_room_size: float = 30.0  # boss room is always large
    min_combat_rooms: int = 5
    max_combat_rooms: int = 8
    treasure_rooms: int = 2
    shop_rooms: int = 1
    rest_rooms: int = 2
    secret_room_chance: float = 0.3  # 30% chance to add a secret room
    min_rooms_before_boss: int = 8   # minimum path length to boss
    max_connections_per_room: int = 4

class DungeonGenerator:
    def __init__(self, config: DungeonConfig, seed: int | None = None):
        self.config = config
        self.rng = random.Random(seed)
        self.rooms: list[Room] = []

    def generate(self) -> list[Room]:
        self._place_rooms()
        self._connect_rooms()
        self._assign_types()
        self._validate()
        return self.rooms

    def _place_rooms(self):
        """Create rooms with random sizes within budget."""
        for i in range(self.config.total_rooms):
            size = self.rng.uniform(
                self.config.min_room_size,
                self.config.max_room_size,
            )
            self.rooms.append(Room(
                id=i,
                room_type=RoomType.COMBAT,  # placeholder, assigned later
                width=size,
                height=size * self.rng.uniform(0.7, 1.3),
            ))

    def _connect_rooms(self):
        """Build a spanning tree, then add extra connections for loops."""
        # Spanning tree ensures all rooms are reachable
        unconnected = list(range(1, len(self.rooms)))
        connected = [0]
        while unconnected:
            from_room = self.rng.choice(connected)
            to_room = self.rng.choice(unconnected)
            self.rooms[from_room].connections.append(to_room)
            self.rooms[to_room].connections.append(from_room)
            connected.append(to_room)
            unconnected.remove(to_room)

        # Add extra connections for loops (optional paths)
        extra = self.rng.randint(2, 5)
        for _ in range(extra):
            a = self.rng.randint(0, len(self.rooms) - 1)
            b = self.rng.randint(0, len(self.rooms) - 1)
            if (a != b
                and b not in self.rooms[a].connections
                and len(self.rooms[a].connections) < self.config.max_connections_per_room):
                self.rooms[a].connections.append(b)
                self.rooms[b].connections.append(a)

    def _assign_types(self):
        """Assign room types following generation rules."""
        # Room 0 is always spawn
        self.rooms[0].room_type = RoomType.SPAWN
        self.rooms[0].width = self.config.min_room_size
        self.rooms[0].height = self.config.min_room_size

        # Last room is always boss
        boss_idx = len(self.rooms) - 1
        self.rooms[boss_idx].room_type = RoomType.BOSS
        self.rooms[boss_idx].width = self.config.boss_room_size
        self.rooms[boss_idx].height = self.config.boss_room_size

        # Room before boss is always rest (save point)
        if boss_idx > 1:
            pre_boss = self.rooms[boss_idx].connections[0]
            self.rooms[pre_boss].room_type = RoomType.REST

        # Distribute remaining types
        available = [i for i in range(1, boss_idx)
                     if self.rooms[i].room_type == RoomType.COMBAT]
        self.rng.shuffle(available)

        idx = 0
        for _ in range(self.config.treasure_rooms):
            if idx < len(available):
                self.rooms[available[idx]].room_type = RoomType.TREASURE
                idx += 1
        for _ in range(self.config.shop_rooms):
            if idx < len(available):
                self.rooms[available[idx]].room_type = RoomType.SHOP
                idx += 1
        for _ in range(self.config.rest_rooms - 1):  # -1 for pre-boss rest
            if idx < len(available):
                self.rooms[available[idx]].room_type = RoomType.REST
                idx += 1
        # Remaining rooms stay as COMBAT

        # Secret room (chance-based, added as branch off existing room)
        if self.rng.random() < self.config.secret_room_chance:
            secret = Room(
                id=len(self.rooms),
                room_type=RoomType.SECRET,
                width=self.config.min_room_size,
                height=self.config.min_room_size,
            )
            attach_to = self.rng.choice(
                [r for r in self.rooms if r.room_type == RoomType.COMBAT]
            )
            secret.connections.append(attach_to.id)
            attach_to.connections.append(secret.id)
            self.rooms.append(secret)

    def _validate(self):
        """Verify generation rules are satisfied."""
        combat_count = sum(
            1 for r in self.rooms if r.room_type == RoomType.COMBAT
        )
        assert combat_count >= self.config.min_combat_rooms, (
            f"Too few combat rooms: {combat_count}"
        )
        # Verify connectivity (BFS from spawn)
        visited = set()
        queue = [0]
        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)
            queue.extend(self.rooms[current].connections)
        assert len(visited) == len(self.rooms), "Not all rooms are reachable"
```

### Open-World POI Distribution

Points of Interest (POIs) in open worlds must be distributed to maintain a consistent density of discoverable content without feeling repetitive or overwhelming.

**Distribution rules:**
- **Minimum spacing**: No two POIs of the same type within 200m of each other (prevents clustering)
- **Maximum spacing**: No point in the traversable world should be more than 60 seconds of travel from the nearest POI (prevents empty stretches)
- **Density gradient**: Higher POI density near hubs and main paths, lower density in wilderness areas. The player should always see at least one undiscovered POI from any high vantage point.
- **Type variety**: Within any 500m radius, the player should encounter at least 3 different POI types (camp, landmark, puzzle, combat challenge, resource node, etc.)
- **Landmark visibility**: Major POIs should be visible from 300m+ to serve as navigation landmarks. Use vertical elements (towers, distinctive trees, rock formations) that stand above the terrain horizon.

**POI placement workflow:**
1. Place major landmarks first (towns, dungeons, geographic features) — these anchor the world
2. Place main quest locations relative to landmarks — ensure the critical path visits diverse biomes
3. Fill with secondary POIs using a Poisson disk sampling algorithm (guarantees minimum spacing while feeling natural)
4. Playtest by traversing every major route — if any 2-minute stretch feels empty, add content

### Difficulty Curves Within Levels

Difficulty within a single level should follow a shaped curve, not a flat line or monotonic increase.

**Intra-level difficulty patterns:**

- **Ramp**: Starts easy, steadily increases. Good for tutorial levels and the early game. Risk: becomes predictable.
- **Sawtooth**: Alternating peaks and valleys. Each peak is slightly higher than the last. The valleys provide recovery and reward. Most common and effective pattern for sustained engagement.
- **Plateau**: Moderate difficulty with a sharp spike at the end (boss encounter). Effective for levels that build toward a climactic moment.
- **Inverted U**: Difficulty peaks in the middle of the level, then eases toward the end. Used when the level's narrative arc has a mid-point climax with a falling-action resolution.

**Difficulty levers available to level designers:**
- Enemy count and composition (more enemies, tougher enemy types)
- Arena size and cover density (less cover = harder)
- Resource availability (fewer health pickups = harder)
- Time pressure (timed sections, advancing hazards)
- Sightline length (longer sightlines favor ranged players, shorter favor melee)
- Verticality (enemies at different elevations are harder to deal with simultaneously)
- Environmental hazards (fire, pits, moving platforms)
- Checkpoint frequency (fewer checkpoints = higher stakes per encounter)

### World Streaming Implementation

Open worlds require streaming subsystems that load and unload content based on player position.

**Streaming budget management:**
- Define a "streaming radius" around the player — all content within this radius must be loaded
- The streaming radius must account for maximum player speed (if the player can travel 100m/s in a vehicle, the streaming radius must be at least 100m * load-time-seconds ahead)
- Memory budget: streaming pool size = total memory budget minus persistent content (UI, player, audio banks, core systems)
- Priority loading: always load terrain and collision first, then large landmarks, then detail objects (foliage, debris, decals)

**Level-of-detail streaming:**
- Distance band 0 (0–50m): Full detail geometry, full-resolution textures, all physics bodies active
- Distance band 1 (50–200m): LOD1 geometry, half-resolution textures, simplified physics (or no physics)
- Distance band 2 (200–500m): LOD2 geometry, quarter-resolution textures, no physics, impostor rendering for trees
- Distance band 3 (500m+): Billboard impostors, terrain-only, atmosphere/fog handles the rest

**Transition management:**
- Cross-fade between LOD levels over 0.5–1.0 seconds to hide pop-in
- Use noise-based dithering during LOD transitions (perceptually smoother than alpha fade)
- Stream loading should never cause a hitch — if a load is taking too long, the player should see simplified content rather than nothing (empty space or T-poses are certification failures)
- Budget loading I/O bandwidth: on HDD-based platforms, reserve 50% of disk bandwidth for audio streaming, 50% for asset streaming. On SSD, this constraint is relaxed.

### Level Design Documentation Template

Every level should have a design document before construction begins.

**Essential sections:**
- **Overview**: Level name, position in the game's progression, estimated play time, primary gameplay focus
- **Narrative context**: What story events occur here? What is the player's goal? What do they learn?
- **Map layout**: Top-down sketch with critical path marked, secondary paths, and secret areas
- **Encounter list**: Each encounter with enemy types, count, intended difficulty (1–10 scale), designed player strategy
- **Metrics compliance**: Confirmation that all jumps, doors, and corridors match the project metrics sheet
- **Streaming plan**: How the level is divided into streaming cells, estimated memory per cell, transition points
- **Art direction notes**: Mood, lighting intent, color palette, reference images
- **Audio direction notes**: Ambient soundscape, music transitions, key audio events
- **Unique mechanics**: Any level-specific mechanics (vehicles, zero-gravity, underwater) with design notes
- **Dependencies**: What player abilities are required? What story prerequisites must be met?

## 2D and Non-3D Level Design

### 2D Platformer Metrics

The design unit for 2D platformers is the screen or screen segment, not 3D meters:

- **Screen dimensions**: Design at target resolution (e.g., 1920x1080). One screen = one design unit.
- **Tile grid**: Standard tile size 16x16, 32x32, or 64x64 pixels. Character occupies 1-2 tiles wide, 2-3 tiles tall.
- **Jump arc**: Defined by initial velocity and gravity. Standard platformer: peak height = 3-5 tiles, horizontal distance = 4-8 tiles. Coyote time: 6-10 frames (100-167ms at 60fps).
- **Platform spacing**: Safe gap = 60-80% of max jump distance. Challenge gap = 85-95%. Death gap = 100%+.
- **Enemy placement**: One new mechanic or enemy per 3-5 screens. Tutorial screens introduce mechanics in isolation before combining.

### Tile-Based Level Design

For grid-based games (roguelikes, tactics, puzzle games):

- **Room generation**: Define room templates as rectangles with connection points. Minimum room size: 5x5 tiles. Maximum: 15x15 for tactical games. Connect rooms via corridors 1-3 tiles wide.
- **Difficulty distribution**: In procedural dungeon generation, difficulty increases with distance from start. Use weighted room selection: rooms with harder enemies have higher weight at greater distances.
- **Puzzle stage design**: Each stage introduces one new mechanic. Progression: tutorial (1 mechanic, 1 solution), practice (1 mechanic, multiple applications), combination (2+ mechanics together), mastery (all mechanics under constraint).

### Non-Spatial Content Design

For games without spatial levels (card games, visual novels, management sims):

- **Card game stage progression**: Introduce card types gradually. New card pool expansion every 3-5 encounters. Total card pool at launch: 100-300 for competitive, 50-100 for single-player.
- **Visual novel branching**: Key decision points every 5-10 minutes of reading. Total playthrough length: 2-4 hours per route. Route count: 3-5 for manageable scope. Flag variable tracking: use boolean flags + integer counters, avoid floating-point relationship values.
- **Management sim progression**: Unlock new building/unit types every 15-30 minutes of play. Each unlock should enable at least one new strategy the player couldn't execute before.
