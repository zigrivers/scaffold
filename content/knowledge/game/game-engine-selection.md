---
name: game-engine-selection
description: Engine evaluation framework, Unity vs Unreal vs Godot comparison, middleware selection, and platform considerations
topics: [game-dev, engine, unity, unreal, godot, middleware]
---

Choosing a game engine is the single most consequential technical decision in game development. It determines your rendering capabilities, supported platforms, available middleware, hiring pool, and long-term maintenance cost. Unlike web framework selection where migration is painful but possible, switching game engines mid-project is effectively starting over. This decision must be made deliberately, with explicit tradeoff acknowledgment, and documented as an ADR.

## Summary

### Engine Evaluation Framework

Evaluate engines across seven dimensions, weighted by project priorities:

1. **Target Platform Fit** — Does the engine support all required platforms natively? Mobile, console, PC, VR/AR, and web each have different engine strengths. Console SDK access requires platform holder approval and some engines handle this better than others.

2. **Rendering Capabilities** — Does the engine's rendering pipeline match the game's visual target? A stylized 2D game does not need ray tracing. A photorealistic open-world game needs advanced LOD, streaming, and global illumination.

3. **Team Expertise** — What does the team already know? A team of C# developers will be more productive in Unity or Godot (C#) than Unreal (C++). Ramp-up time is real cost.

4. **Ecosystem & Marketplace** — Asset stores, plugin ecosystems, and community tools dramatically accelerate development. Evaluate the quantity and quality of available assets, plugins, and community resources.

5. **Licensing & Revenue Model** — Upfront cost, royalty structures, runtime fees, and source code access all factor in. A free engine with a 5% royalty above $1M revenue is different economics than a subscription model.

6. **Tooling & Workflow** — Editor quality, iteration speed (compile times, hot reload), debugging tools, profiling tools, and version control integration affect daily productivity.

7. **Scalability & Performance** — Maximum scene complexity, entity counts, physics performance, networking architecture, and memory management capabilities set upper bounds on what the game can do.

### Key Decision Factors

The most common selection mistakes come from over-weighting one dimension:

- **Do not choose Unreal just for graphics** — if your game is a 2D puzzle game, Unreal's rendering capabilities are wasted and its complexity is a liability
- **Do not choose Unity just for market share** — if your game requires advanced rendering or large open worlds, Unity's default pipeline may require extensive custom work
- **Do not choose Godot just because it is free** — if your game requires console publishing, Godot's console support is limited and requires third-party porting
- **Do not choose a custom engine unless you have engine programmers** — building an engine is a multi-year investment that delays game development

### Middleware Categories

No engine does everything well. Middleware fills the gaps:

- **Physics**: Havok, PhysX (built into Unity/Unreal), Jolt, Box2D
- **Audio**: FMOD, Wwise, Criware ADX2
- **Networking**: Photon, Mirror (Unity), Steam Networking, EOS
- **UI**: Coherent Gameface, NoesisGUI, Dear ImGui (debug), engine-native UI
- **Animation**: Morpheme, engine-native state machines, procedural IK solutions
- **AI**: custom behavior trees and utility AI are more common than middleware in this space

## Deep Guidance

### Engine Comparison Matrix

```yaml
# Engine Decision Matrix — score each 1-5, multiply by weight
# Adjust weights to match your project priorities

criteria:
  - name: "Target Platform Fit"
    weight: 5
    unity: 5       # Best cross-platform support, all major platforms
    unreal: 4      # Excellent console/PC, weaker mobile/web
    godot: 3       # Good PC/mobile, limited console, decent web
    custom: 2      # Only what you build

  - name: "2D Capability"
    weight: 3       # Adjust: 5 for 2D games, 1 for 3D-only
    unity: 4       # Solid 2D tools, Tilemap, SpriteRenderer
    unreal: 2      # Paper2D exists but is underprioritized
    godot: 5       # Best-in-class 2D with dedicated node types
    custom: 3      # Depends on implementation

  - name: "3D Rendering Quality"
    weight: 4       # Adjust: 5 for AAA visual target
    unity: 3       # URP adequate, HDRP approaching Unreal
    unreal: 5      # Industry-leading Nanite, Lumen, MetaHumans
    godot: 2       # Improving rapidly but behind on advanced features
    custom: 1      # Years of investment required

  - name: "Team Ramp-Up (C# team)"
    weight: 4       # Adjust based on team language background
    unity: 5       # Native C#
    unreal: 1      # C++ with Blueprints; steep curve for C# devs
    godot: 4       # GDScript is easy; C# support is stable
    custom: 2      # Depends on language choice

  - name: "Asset Marketplace"
    weight: 3
    unity: 5       # Largest asset store by volume
    unreal: 4      # Smaller but high quality, many free monthly assets
    godot: 2       # Growing but still limited
    custom: 1      # No marketplace

  - name: "Source Code Access"
    weight: 2
    unity: 2       # Reference source available, not modifiable freely
    unreal: 4      # Full source on GitHub with license
    godot: 5       # Fully open source (MIT)
    custom: 5      # You own it all

  - name: "Build & Iteration Speed"
    weight: 4
    unity: 4       # Hot reload improving, reasonable compile times
    unreal: 2      # C++ compilation is slow; Blueprints iterate faster
    godot: 5       # Fastest iteration cycle, near-instant scene reload
    custom: 3      # Depends on build system

  - name: "License Cost"
    weight: 2
    unity: 3       # Free tier, then subscription; runtime fee (post-2024)
    unreal: 4      # Free until $1M revenue, then 5% royalty
    godot: 5       # MIT license, completely free forever
    custom: 5      # No license cost (but massive dev cost)

# Scoring: Sum of (score * weight) per engine
# Do NOT let the matrix make the decision — it structures the conversation
```

### Unity In Depth

**Strengths:**
- Broadest platform support in the industry (mobile, console, PC, VR, AR, WebGL)
- Largest asset store — thousands of ready-made solutions for common problems
- C# is accessible to a wide talent pool; lower barrier to entry than C++
- Strong 2D tooling alongside capable 3D
- Extensive documentation and tutorial ecosystem

**Weaknesses:**
- Rendering quality historically trails Unreal for AAA-grade visuals (HDRP narrows this gap)
- Runtime fee model introduced uncertainty (Unity responded to backlash but trust was damaged)
- Legacy code and architectural debt in some subsystems (old Input System, UI systems, networking)
- DOTS/ECS is powerful but has had a long and unstable development path

**Best for:** Mobile games, indie/AA multi-platform titles, VR/AR applications, 2D games that need cross-platform, rapid prototyping.

**Avoid for:** Games that require Unreal-grade visual fidelity without extensive custom rendering work.

### Unreal Engine In Depth

**Strengths:**
- Industry-leading rendering: Nanite (virtualized geometry), Lumen (global illumination), MetaHumans
- Full C++ source code access enables deep engine customization
- Blueprint visual scripting allows designers and artists to prototype gameplay without code
- Mature networking and replication system for multiplayer
- Excellent large-world support (World Partition, level streaming)

**Weaknesses:**
- C++ compilation times are slow; iteration speed suffers for gameplay programming
- Steep learning curve — the engine is enormous and documentation can lag behind features
- Binary asset format makes version control painful (requires Perforce or Git LFS)
- Mobile support exists but is secondary to console/PC
- Royalty model takes 5% above $1M, which is significant for successful indie titles

**Best for:** AAA/AA 3D games, photorealistic visuals, large open worlds, multiplayer shooters, cinematic experiences.

**Avoid for:** Small 2D games, solo developers without C++ experience, projects where iteration speed is more important than visual fidelity.

### Godot In Depth

**Strengths:**
- Fully open source (MIT license) — no royalties, no fees, no restrictions
- Best-in-class 2D engine with dedicated 2D physics, rendering, and node types
- GDScript is purpose-built for game development and extremely approachable
- Fastest iteration speed of any major engine — scene changes are near-instant
- Lightweight: the full engine editor is under 100MB
- Scene composition model (everything is a scene/node tree) is elegant and intuitive

**Weaknesses:**
- 3D rendering is functional but trails Unity and Unreal significantly
- Console export requires third-party porting services (no official console SDK support in open source)
- Smaller asset marketplace and plugin ecosystem
- Smaller community means fewer tutorials, fewer Stack Overflow answers, fewer ready-made solutions
- C# support is stable but GDScript is the first-class citizen; documentation and examples favor GDScript

**Best for:** 2D games, solo developers, small indie teams, game jams, projects where open source matters, educational contexts.

**Avoid for:** AAA 3D games, projects requiring guaranteed console support from day one, teams that need extensive middleware ecosystem.

### Custom Engine Considerations

Building a custom engine is justified only when:
- The game requires capabilities no existing engine provides (novel rendering techniques, extreme performance requirements)
- The team has dedicated engine programmers with years of experience
- The studio plans to ship multiple titles on this engine, amortizing the investment
- Learning and IP ownership are explicit business goals

Building a custom engine is NOT justified when:
- The team wants to "learn how engines work" during a production project
- A single game feature is hard in an existing engine (solve that one feature, do not rebuild everything)
- The team is small and the game is on a tight timeline

### Middleware Selection Guide

**Audio middleware (FMOD vs Wwise):**
- FMOD: Simpler API, generous indie licensing, good Unity/Unreal integration, lower learning curve
- Wwise: More powerful spatial audio and interactive music features, industry standard for AAA, steeper learning curve, more complex licensing
- Rule of thumb: FMOD for indie/AA, Wwise for AAA or games where adaptive audio is a pillar

**Networking middleware:**
- Photon: Managed servers, good for casual multiplayer, per-CCU pricing
- Mirror (Unity): Free, community-driven, server-authoritative, self-hosted
- Steam Networking: Free for Steam-published games, P2P with relay fallback
- EOS (Epic Online Services): Free, cross-platform, accounts/matchmaking/lobbies
- Rule of thumb: prototype with the simplest option, migrate to a production solution when you know your scale requirements

**Physics middleware:**
- PhysX: Built into Unity and Unreal; adequate for most games
- Havok: Premium physics with better large-world and destruction support; used in many AAA titles
- Jolt: Modern, open-source alternative gaining traction; good performance characteristics
- Box2D: The standard for 2D physics; built into most 2D engines

### Rendering API Considerations

The choice of rendering API is usually dictated by the engine and target platform:

- **Vulkan**: Cross-platform (PC, Android, Switch via NVN/Vulkan-like), low-level, maximum control, highest learning curve
- **DirectX 12**: Windows and Xbox only, low-level like Vulkan, best Windows-specific optimization
- **Metal**: Apple platforms only (iOS, macOS), required for iOS/macOS, good performance
- **OpenGL/OpenGL ES**: Legacy but still relevant for web (WebGL) and older mobile devices
- **WebGPU**: Emerging standard for browser-based 3D, successor to WebGL

For most projects using an established engine, the engine abstracts the rendering API. Rendering API selection becomes critical only for custom engines or when writing custom render passes/shaders within an engine.

### Platform SDK Requirements

Console development requires platform holder approval and NDA-protected SDK access:

- **PlayStation**: Must apply to Sony's PlayStation Partners Program, receive DevKit hardware, and sign NDA. Unity and Unreal handle PS SDK integration; Godot requires third-party porting.
- **Xbox**: Microsoft's ID@Xbox program for indie developers. Unity and Unreal have integrated GDK support. Somewhat more accessible than PlayStation for smaller studios.
- **Nintendo Switch**: Most restrictive approval process. Must apply to Nintendo Developer Portal. Unity and Unreal support Switch natively. Godot requires third-party porting services.

Console SDK access should be secured early in development — approval processes can take weeks to months, and DevKit hardware has lead times.

### Decision Documentation Template

Every engine decision should be recorded as an Architecture Decision Record:

- **Context**: What kind of game, target platforms, team composition, timeline
- **Options Considered**: List each engine evaluated with weighted matrix scores
- **Decision**: Which engine was chosen
- **Rationale**: Which weights drove the decision, which tradeoffs were accepted
- **Consequences**: What capabilities are gained, what limitations are accepted
- **Revisit Triggers**: Under what conditions this decision should be reconsidered (e.g., "if we add VR support," "if the team grows beyond 20 engineers")
