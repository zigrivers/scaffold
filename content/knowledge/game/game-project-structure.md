---
name: game-project-structure
description: Engine-specific directory conventions for Unity, Unreal, and Godot with asset and code organization strategies
topics: [game-dev, project-structure, unity, unreal, godot, organization]
---

Game projects have fundamentally different structure requirements than web or business applications because they manage two distinct artifact types: code and content assets. Code follows software engineering conventions (modules, namespaces, tests). Content assets follow production pipeline conventions (source art, exported formats, level data, audio banks). The directory structure must serve both engineers and content creators, and it must scale from prototype to shipped product without requiring a mid-project reorganization.

## Summary

### Two Organization Strategies

Game projects choose between two primary strategies for organizing files:

**By Type** (group by file/asset category):
- All scripts in one tree, all textures in another, all models in another
- Easy to find "all textures" or "all scripts"
- Breaks down at scale: hundreds of unrelated textures in one folder
- Preferred by engine conventions (Unity's traditional approach)

**By Feature** (group by gameplay feature or content area):
- Each feature/area contains its own scripts, prefabs, textures, audio
- Co-locates related assets — changing the "Weapon" feature means editing files in one directory
- Harder to find "all textures across the project"
- Preferred by large teams and experienced studios

**Recommendation**: Start by-type for small projects (under 1000 assets) and migrate to by-feature when the project grows. Most engines support both; the choice is convention, not technical limitation.

### Engine-Agnostic Principles

Regardless of engine, these principles apply:

- **Separate source assets from exported assets**: Raw Photoshop/Blender files do not belong in the engine project; they live in a parallel `art-source/` repository or directory
- **Version control strategy**: Binary assets (textures, models, audio) need Git LFS or Perforce; text assets (scripts, config) use standard Git
- **Scene/Level naming**: Use a consistent naming convention with numeric prefixes for load order (e.g., `01_main-menu`, `02_tutorial`, `03_forest-village`)
- **Test scenes**: Maintain a `_test/` or `_sandbox/` directory for developer testing scenes that are excluded from builds
- **Plugin/addon isolation**: Third-party code lives in a clearly separated directory, never mixed with project code

### Asset Naming Conventions

Consistent asset naming prevents chaos at scale:

- Prefix by type: `T_` (texture), `M_` (material), `SM_` (static mesh), `SK_` (skeletal mesh), `A_` (animation), `SFX_` (sound effect), `MUS_` (music), `UI_` (UI element), `FX_` (particle/VFX)
- Use PascalCase for asset names: `T_ForestGround_Diffuse`, `SM_Weapon_Sword_01`
- Include variant suffixes: `_Diffuse`, `_Normal`, `_Roughness` for texture maps; `_01`, `_02` for variants
- Never use spaces in filenames — they break build tools, CLI scripts, and some version control systems

## Deep Guidance

### Unity Project Structure

Unity projects follow a mandatory `Assets/` root for all project content. The engine expects specific directories at known locations.

```
ProjectRoot/
├── Assets/                          # All project content lives here
│   ├── _Project/                    # Project-specific assets (underscore sorts to top)
│   │   ├── Art/
│   │   │   ├── Animations/          # Animation clips and controllers
│   │   │   ├── Materials/           # Material assets
│   │   │   ├── Models/              # FBX/OBJ mesh imports
│   │   │   ├── Shaders/             # Custom shaders and shader graphs
│   │   │   ├── Sprites/             # 2D sprite sheets and atlases
│   │   │   ├── Textures/            # Texture files (PNG, TGA, EXR)
│   │   │   └── VFX/                 # Particle systems and VFX graphs
│   │   ├── Audio/
│   │   │   ├── Music/               # Background music tracks
│   │   │   ├── SFX/                 # Sound effects
│   │   │   └── Mixers/              # Audio mixer assets
│   │   ├── Data/                    # ScriptableObjects, game data tables
│   │   │   ├── Items/               # Item definitions
│   │   │   ├── Enemies/             # Enemy stat definitions
│   │   │   ├── Levels/              # Level configuration data
│   │   │   └── Balancing/           # Tuning spreadsheets / CSV imports
│   │   ├── Prefabs/                 # Reusable game object templates
│   │   │   ├── Characters/
│   │   │   ├── Environment/
│   │   │   ├── UI/
│   │   │   └── Weapons/
│   │   ├── Scenes/                  # Unity scene files
│   │   │   ├── _Boot/               # Bootstrap / initialization scene
│   │   │   ├── MainMenu/
│   │   │   ├── Gameplay/
│   │   │   └── _Test/               # Developer test scenes (exclude from build)
│   │   ├── Scripts/                 # All C# source code
│   │   │   ├── Runtime/             # Game code
│   │   │   │   ├── Core/            # Game loop, state management, singletons
│   │   │   │   ├── Player/          # Player controller, input, camera
│   │   │   │   ├── AI/              # Enemy AI, behavior trees, pathfinding
│   │   │   │   ├── Combat/          # Damage system, weapons, projectiles
│   │   │   │   ├── UI/              # UI controllers and data binding
│   │   │   │   ├── Audio/           # Audio management, music system
│   │   │   │   ├── Save/            # Save/load system
│   │   │   │   └── Utilities/       # Shared helpers, extensions, pools
│   │   │   └── Editor/              # Custom editor tools and inspectors
│   │   ├── UI/                      # UI Toolkit UXML/USS or Canvas prefabs
│   │   │   ├── Screens/             # Full-screen UI (menus, HUD, dialogs)
│   │   │   ├── Components/          # Reusable UI components
│   │   │   └── Styles/              # USS stylesheets or shared UI materials
│   │   └── Fonts/                   # Font assets
│   ├── Plugins/                     # Third-party plugins and packages
│   ├── StreamingAssets/             # Files copied verbatim to build (config, JSON)
│   ├── Resources/                   # Assets loadable by name (use sparingly)
│   └── Editor Default Resources/    # Editor-only assets
├── Packages/                        # Unity Package Manager manifest
├── ProjectSettings/                 # Unity project settings (version control these)
├── UserSettings/                    # Per-user settings (gitignore these)
├── Logs/                            # Unity logs (gitignore)
├── Library/                         # Unity cache (gitignore)
├── Temp/                            # Unity temp (gitignore)
├── obj/                             # Build artifacts (gitignore)
├── .gitignore
└── .gitattributes                   # Git LFS tracking rules
```

**Unity-specific rules:**
- `Resources/` is loaded into memory at startup — only put assets here that must be loaded by string name; prefer Addressables for dynamic loading
- `StreamingAssets/` is copied byte-for-byte to the build — use for config files, JSON data, pre-built databases
- `Editor/` directories anywhere in the tree are excluded from builds — put editor-only code here
- The `_Project/` prefix is a convention to visually separate your code from Plugins; the underscore ensures it sorts above plugin folders
- `.meta` files must be committed — they contain asset GUIDs and import settings; missing meta files break references

### Unreal Engine Project Structure

Unreal uses a `Content/` directory for assets and `Source/` for C++ code. The engine enforces stronger conventions than Unity.

```
ProjectRoot/
├── Content/                         # All game assets (equivalent to Unity's Assets/)
│   ├── Characters/                  # Character blueprints, meshes, animations
│   │   ├── Player/
│   │   │   ├── Meshes/
│   │   │   ├── Animations/
│   │   │   ├── Materials/
│   │   │   └── BP_PlayerCharacter.uasset
│   │   └── Enemies/
│   │       ├── Goblin/
│   │       └── Dragon/
│   ├── Environment/                 # Level art, props, foliage
│   │   ├── Architecture/
│   │   ├── Nature/
│   │   ├── Props/
│   │   └── Materials/
│   ├── Weapons/                     # Weapon meshes, animations, blueprints
│   ├── VFX/                         # Niagara particle systems
│   ├── UI/                          # UMG widget blueprints
│   │   ├── Widgets/
│   │   ├── Screens/
│   │   └── Styles/
│   ├── Audio/
│   │   ├── Music/
│   │   ├── SFX/
│   │   └── SoundCues/
│   ├── Maps/                        # Level/map files
│   │   ├── MainMenu/
│   │   ├── Gameplay/
│   │   └── _Dev/                    # Developer test levels
│   ├── Data/                        # Data tables, curve assets, enums
│   ├── Cinematics/                  # Sequencer assets and cutscenes
│   ├── Input/                       # Enhanced Input mapping contexts
│   └── Core/                        # Core blueprints (game mode, game state)
├── Source/                          # C++ source code
│   ├── ProjectName/                 # Primary game module
│   │   ├── ProjectName.h
│   │   ├── ProjectName.cpp
│   │   ├── ProjectName.Build.cs     # Module build configuration
│   │   ├── Core/                    # Game framework classes
│   │   ├── Player/                  # Player classes
│   │   ├── AI/                      # AI controllers and behavior trees
│   │   ├── Combat/                  # Combat system
│   │   ├── UI/                      # UI controller classes
│   │   └── Save/                    # Save system
│   └── ProjectNameEditor/           # Editor-only module (optional)
│       ├── ProjectNameEditor.Build.cs
│       └── CustomEditors/
├── Config/                          # Engine and project configuration
│   ├── DefaultEngine.ini
│   ├── DefaultGame.ini
│   ├── DefaultInput.ini
│   └── DefaultEditor.ini
├── Plugins/                         # Project-specific plugins
├── Binaries/                        # Compiled binaries (gitignore)
├── Intermediate/                    # Build intermediates (gitignore)
├── Saved/                           # Logs, autosaves, crashes (gitignore)
├── DerivedDataCache/                # Asset cache (gitignore)
├── .uproject                        # Project descriptor
├── .gitignore
└── .gitattributes                   # Git LFS rules for .uasset, .umap
```

**Unreal-specific rules:**
- Use `Content/` subfolders as feature domains, not asset types — `Content/Characters/Player/` not `Content/Meshes/Characters/Player/`
- Blueprints should mirror the C++ class hierarchy — `BP_PlayerCharacter` inherits from `APlayerCharacter`
- Name Blueprint assets with `BP_` prefix, Widget Blueprints with `WBP_`, Data Tables with `DT_`
- `Content/_Dev/` for personal test assets — each developer gets a subdirectory; exclude from builds
- Unreal assets are binary — Git LFS is mandatory for `.uasset` and `.umap` files; alternatively use Perforce
- `Config/` INI files should be committed — they control project settings; `Saved/Config/` contains runtime overrides and should be gitignored
- Redirectors (created when assets move) should be cleaned up regularly with `Fix Up Redirectors In Folder`

### Godot Project Structure

Godot uses `res://` as the project root. Everything is a resource, and the scene/node tree is the primary organizational unit.

```
ProjectRoot/
├── project.godot                    # Project configuration
├── scenes/                          # Scene files (.tscn)
│   ├── main/                        # Main game scenes
│   │   ├── main_menu.tscn
│   │   ├── game_world.tscn
│   │   └── game_over.tscn
│   ├── characters/                  # Character scenes (instantiated)
│   │   ├── player.tscn
│   │   └── enemies/
│   │       ├── goblin.tscn
│   │       └── dragon.tscn
│   ├── ui/                          # UI scenes
│   │   ├── hud.tscn
│   │   ├── inventory_screen.tscn
│   │   └── components/              # Reusable UI components
│   │       ├── health_bar.tscn
│   │       └── item_slot.tscn
│   ├── levels/                      # Level scenes
│   │   ├── level_01_tutorial.tscn
│   │   ├── level_02_forest.tscn
│   │   └── level_03_dungeon.tscn
│   └── _test/                       # Developer test scenes
├── scripts/                         # GDScript or C# source files
│   ├── autoloads/                   # Singleton scripts (AudioManager, SaveManager)
│   ├── core/                        # Game loop, state management
│   ├── player/                      # Player controller, input
│   ├── ai/                          # Enemy AI
│   ├── combat/                      # Damage system, weapons
│   ├── ui/                          # UI logic
│   ├── save/                        # Save/load system
│   └── utilities/                   # Shared helpers
├── assets/                          # Non-scene resources
│   ├── art/
│   │   ├── sprites/                 # 2D sprites and sprite sheets
│   │   ├── tilesets/                # Tileset images and .tres resources
│   │   ├── models/                  # 3D models (GLTF, OBJ)
│   │   ├── materials/               # Material resources
│   │   ├── shaders/                 # Shader files (.gdshader)
│   │   └── vfx/                     # Particle scenes and textures
│   ├── audio/
│   │   ├── music/                   # Background music (OGG for streaming)
│   │   └── sfx/                     # Sound effects (WAV for low-latency)
│   ├── fonts/                       # Font files and font resources
│   └── ui/                          # UI textures, icons, themes
├── data/                            # Game data tables and configuration
│   ├── items.json                   # Item definitions
│   ├── enemies.json                 # Enemy stat tables
│   ├── dialogue/                    # Dialogue trees (JSON or custom format)
│   └── levels/                      # Level metadata and configuration
├── addons/                          # Third-party Godot plugins
├── export_presets.cfg               # Export configuration (commit this)
├── .godot/                          # Engine cache (gitignore)
├── .gitignore
└── .gitattributes
```

**Godot-specific rules:**
- Scenes (`.tscn`) are the primary organizational unit — prefer small, reusable scenes composed into larger ones
- Scripts can be attached directly to scene nodes or kept in `scripts/` — co-locate scripts with scenes for small projects, separate for larger ones
- Autoloads (singletons) are registered in `project.godot` — use sparingly for truly global services (audio, save, events)
- Use `.tres` (text resource) format over `.res` (binary) for version-control-friendly resources
- Audio: OGG Vorbis for music (streamed, smaller files), WAV for sound effects (low latency, no decompression)
- Godot's `.import/` cache is in `.godot/` and should be gitignored — it regenerates automatically
- Export presets (`export_presets.cfg`) should be committed so all developers build consistently

### Scene and Level Management

**Level loading strategies:**

- **Additive loading**: Load new level scenes additively while keeping persistent scenes (UI, player, audio) active. Prevents jarring transitions and allows seamless level streaming.
- **Full scene change**: Unload everything and load the new scene. Simpler, but causes a loading screen. Appropriate for distinct game modes (main menu to gameplay).
- **Level streaming**: Load level chunks as the player approaches and unload distant chunks. Required for open-world games. All three engines support this with different APIs.

**Scene organization principles:**
- One scene file per logical unit (one level, one character, one UI screen)
- Avoid mega-scenes with everything in one file — they cause merge conflicts and slow load times
- Use scene instancing/prefabs for reusable elements (enemies, pickups, interactable objects)
- Maintain a "boot" or "persistent" scene that initializes core systems and is never unloaded

### Game Data Tables

Game data (item stats, enemy configurations, level parameters) should be data-driven, not hardcoded:

- **JSON/YAML files**: Easy to edit, version-control-friendly, loadable by any engine; however, no type safety and need runtime validation
- **CSV/Spreadsheet exports**: Designers edit in Google Sheets or Excel, export to CSV, import into engine; good for bulk data like item databases
- **ScriptableObjects (Unity)**: Type-safe, editor-friendly, serialized as YAML; best option in Unity for designer-editable data
- **Data Tables (Unreal)**: Struct-based tables with CSV import; native Unreal solution for bulk game data
- **Resource files (Godot)**: `.tres` files with typed properties; Godot's native approach to data assets

**Rules for game data:**
- Never hardcode tuning values in scripts — always reference a data table or config asset
- Designers must be able to change game balance without touching code
- Data changes should be hot-reloadable during play testing when possible
- Validate data on load: check for missing references, out-of-range values, and broken dependencies

### Shader and VFX Organization

- Keep custom shaders in a dedicated directory (`Shaders/`, `shaders/`)
- Name shaders by their visual purpose: `S_Water_Surface`, `S_Character_Outline`, `S_Dissolve_Effect`
- VFX (particle systems) belong in their own directory with descriptive names: `FX_Hit_Spark`, `FX_Heal_Glow`, `FX_Explosion_Small`
- Shader includes/libraries (shared functions) go in a `Shaders/Includes/` or `Shaders/Library/` subdirectory
- Profile shaders on target hardware early — complex shaders that run fine on dev machines may be unacceptable on target platforms

### Plugin and Addon Organization

**Rules for third-party code:**
- Never modify third-party plugin source code directly — fork it or use the engine's extension/override mechanisms
- Document every plugin dependency: name, version, license, what it is used for
- Pin plugin versions — do not auto-update plugins during production
- Keep a `PLUGINS.md` or equivalent listing all dependencies, their versions, and their licenses
- If a plugin is abandoned by its maintainer, evaluate: fork and maintain, find an alternative, or build a replacement

### Version Control Setup

Game projects require special version control configuration:

**Git LFS tracking (`.gitattributes`):**
```
# Textures
*.png filter=lfs diff=lfs merge=lfs -text
*.tga filter=lfs diff=lfs merge=lfs -text
*.psd filter=lfs diff=lfs merge=lfs -text
*.exr filter=lfs diff=lfs merge=lfs -text

# Models
*.fbx filter=lfs diff=lfs merge=lfs -text
*.obj filter=lfs diff=lfs merge=lfs -text
*.gltf filter=lfs diff=lfs merge=lfs -text
*.glb filter=lfs diff=lfs merge=lfs -text

# Audio
*.wav filter=lfs diff=lfs merge=lfs -text
*.ogg filter=lfs diff=lfs merge=lfs -text
*.mp3 filter=lfs diff=lfs merge=lfs -text

# Video
*.mp4 filter=lfs diff=lfs merge=lfs -text

# Engine-specific binary formats
*.uasset filter=lfs diff=lfs merge=lfs -text
*.umap filter=lfs diff=lfs merge=lfs -text
*.asset filter=lfs diff=lfs merge=lfs -text
```

**What to gitignore per engine:**
- Unity: `Library/`, `Temp/`, `obj/`, `Logs/`, `UserSettings/`, `*.csproj`, `*.sln` (regenerated by Unity)
- Unreal: `Binaries/`, `Intermediate/`, `Saved/`, `DerivedDataCache/`, `.vs/`
- Godot: `.godot/`, `*.import` (older Godot versions), `export/`

**Merge strategy:**
- Scene files are the most conflict-prone asset in any engine
- Unity YAML scenes can sometimes be text-merged but often break — use Unity Smart Merge or lock-based workflows
- Unreal `.umap` files are binary and cannot be text-merged — use file locking (Perforce) or assign level ownership
- Godot `.tscn` files are text-based and merge better than Unity/Unreal equivalents, but complex scenes still conflict
- Rule of thumb: if two people need to edit the same scene, split it into smaller scenes that compose together
