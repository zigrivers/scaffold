---
name: game-modding-ugc
description: Mod API design, packaging formats, sandboxing, versioning, content moderation, distribution platforms, and file-based loading
topics: [game-dev, modding, ugc, sandbox, steam-workshop, mod-api]
---

Modding and user-generated content (UGC) transform a game from a finished product into a platform. The most enduring games in history — Minecraft, Skyrim, Counter-Strike (itself a mod), DOTA (a Warcraft III mod), Garry's Mod — owe their longevity to modding communities that produce content at a scale no studio can match. But modding support is not free: it requires deliberate API design, security sandboxing, compatibility management across game updates, content moderation, and distribution infrastructure. A poorly designed mod system creates more problems than it solves — crashes blamed on the base game, security exploits, copyright-infringing content, and player fragmentation. The goal is to expose enough of the game's systems to enable creativity while maintaining stability, security, and a coherent player experience.

## Summary

### Mod API Surface Design

The mod API defines what modders can change. The fundamental tension is between power (more API surface enables richer mods) and stability (every exposed API becomes a compatibility contract).

**API tiering approach:**
- **Tier 1 — Data mods**: Replace or add data files (textures, models, audio, level layouts, item stats). No code execution. Safest and simplest. Enables cosmetic mods, balance tweaks, new maps/levels.
- **Tier 2 — Script mods**: Execute sandboxed scripts (Lua, JavaScript, or a custom DSL) that call game APIs. Enables new game mechanics, UI modifications, custom AI behaviors. Requires a security sandbox.
- **Tier 3 — Plugin mods**: Load native code (DLL, SO) that hooks into the engine. Maximum power — can modify anything. Maximum risk — crashes, exploits, and anti-cheat conflicts. Appropriate only for PC single-player or private servers.

Most games should support Tier 1 and Tier 2. Tier 3 is appropriate for sandbox games (Minecraft Java, Skyrim, Factorio) where the community expects deep modification.

**API design principles:**
- Expose game systems through well-defined interfaces, not internal data structures
- Version the API explicitly (v1, v2) — mods declare which API version they target
- Provide read access broadly (game state, entity properties, world data) and write access narrowly (only through validated setter functions)
- Event-driven architecture: mods subscribe to game events (on_entity_spawn, on_level_load, on_player_damage) rather than polling or patching functions
- Rate-limit expensive operations (file I/O, network calls, entity spawning) to prevent mods from degrading performance

### Packaging Formats

Mods need a standard packaging format that includes metadata, assets, scripts, and dependency declarations.

**Standard mod package structure:**

```
my-awesome-mod/
├── mod.json              # Manifest: ID, version, dependencies, API version
├── README.md             # Description for mod browsers
├── thumbnail.png         # 512x512 preview image for mod listing
├── assets/
│   ├── textures/         # Replacement or new textures
│   ├── models/           # Replacement or new 3D models
│   ├── audio/            # Replacement or new audio files
│   └── levels/           # New level/map data
├── scripts/
│   ├── main.lua          # Entry point script
│   └── utils.lua         # Helper modules
├── localization/
│   ├── en.json           # English strings
│   └── de.json           # German strings
└── config/
    └── defaults.json     # Default settings (overridable by player)
```

The mod manifest (`mod.json`) is the critical file:

```json
{
  "id": "com.modauthor.awesome-mod",
  "name": "Awesome Gameplay Overhaul",
  "version": "2.1.0",
  "api_version": "1.4",
  "game_version_min": "3.0.0",
  "game_version_max": "3.99.99",
  "authors": ["ModAuthor"],
  "description": "Overhauls combat mechanics with new dodge and parry systems.",
  "dependencies": [
    { "id": "com.modauthor.core-lib", "version": ">=1.0.0" }
  ],
  "conflicts": [
    { "id": "com.other.combat-rewrite", "reason": "Both modify the combat system" }
  ],
  "permissions": ["file_read", "game_state_write", "ui_overlay"],
  "entry_point": "scripts/main.lua",
  "load_order": 100,
  "tags": ["gameplay", "combat", "overhaul"]
}
```

Distribute mods as `.zip` archives (renamed to `.modpak`, `.pak`, or a game-specific extension). The mod loader extracts to a known directory and validates the manifest before loading.

### Sandboxing and Security

Mods that execute code (Tier 2 and above) are a security risk. A malicious mod could read files, exfiltrate data, mine cryptocurrency, or corrupt save files. Sandboxing limits what mod code can do.

## Deep Guidance

### Sandboxing Architecture

The sandbox must enforce two boundaries: what system resources mod code can access, and how much computational resource it can consume.

**Lua sandbox implementation:**

Lua is the most popular embedded scripting language for game mods (used by World of Warcraft, Factorio, Garry's Mod, Roblox) because it is fast, lightweight, and easy to sandbox.

```lua
-- sandbox.lua: Create a restricted Lua environment for mod execution
local function create_sandbox(mod_id, api)
  -- Whitelist of allowed standard library functions
  local safe_globals = {
    -- Math
    math = {
      abs = math.abs, ceil = math.ceil, floor = math.floor,
      max = math.max, min = math.min, random = math.random,
      sqrt = math.sqrt, sin = math.sin, cos = math.cos,
      pi = math.pi, huge = math.huge,
    },
    -- String manipulation
    string = {
      byte = string.byte, char = string.char, find = string.find,
      format = string.format, gmatch = string.gmatch, gsub = string.gsub,
      len = string.len, lower = string.lower, upper = string.upper,
      match = string.match, rep = string.rep, reverse = string.reverse,
      sub = string.sub,
    },
    -- Table operations
    table = {
      concat = table.concat, insert = table.insert,
      remove = table.remove, sort = table.sort, unpack = table.unpack,
    },
    -- Safe builtins
    pairs = pairs, ipairs = ipairs, next = next,
    type = type, tostring = tostring, tonumber = tonumber,
    select = select, error = error, pcall = pcall, xpcall = xpcall,
    setmetatable = setmetatable, getmetatable = getmetatable,

    -- Game API (injected per mod based on declared permissions)
    game = api,

    -- Mod-scoped print (routes to mod log, not stdout)
    print = function(...)
      api.log(mod_id, "INFO", table.concat({...}, "\t"))
    end,
  }

  -- EXPLICITLY BLOCKED (not present in safe_globals):
  -- os (file system, process execution)
  -- io (file read/write)
  -- debug (can escape sandbox via debug.getinfo, debug.sethook)
  -- loadfile, dofile (arbitrary file execution)
  -- rawget, rawset (bypass metatables)
  -- collectgarbage (can cause pauses)
  -- require (replaced with mod-scoped import below)

  -- Mod-scoped require: can only load files within the mod's directory
  safe_globals.require = function(module_name)
    local allowed_path = api.resolve_mod_path(mod_id, module_name)
    if not allowed_path then
      error("Module not found or access denied: " .. module_name)
    end
    return api.load_module(allowed_path, safe_globals)
  end

  return safe_globals
end

-- Load and execute a mod's entry point within the sandbox
local function load_mod(mod_id, entry_script, api)
  local sandbox_env = create_sandbox(mod_id, api)
  local chunk, err = loadfile(entry_script, "t", sandbox_env)
  if not chunk then
    api.log(mod_id, "ERROR", "Failed to load: " .. err)
    return false
  end

  -- Execute with resource limits
  local co = coroutine.create(chunk)
  local ok, result = coroutine.resume(co)
  if not ok then
    api.log(mod_id, "ERROR", "Runtime error: " .. tostring(result))
    return false
  end

  return true
end
```

**Resource limits:**
- **CPU time**: Yield the mod coroutine after N instructions (Lua debug hooks or instruction counting). Kill mods that exceed their per-frame budget (e.g., 1 ms per mod per frame).
- **Memory**: Track Lua memory allocation per mod. Set a ceiling (e.g., 64 MB). Kill mods that exceed it.
- **Entity spawning**: Rate-limit entity creation (e.g., 100 entities per second). A mod that spawns 10,000 entities per frame will crash the game.
- **File I/O**: Restrict to the mod's own data directory. No reading game save files, player profiles, or system files. No network access from Tier 2 mods.

### Compatibility and Versioning

The hardest problem in mod support is maintaining compatibility when the game updates. Every game update risks breaking every installed mod.

**Semantic versioning contract:**
- **Patch updates (3.1.0 → 3.1.1)**: Bug fixes only. No API changes. All mods should continue working.
- **Minor updates (3.1.x → 3.2.0)**: New API additions, no removals. Existing mods should continue working. New features require new API version.
- **Major updates (3.x → 4.0)**: API breaking changes allowed. Mods targeting the old API version may not load. Provide a migration guide.

**Compatibility enforcement:**

```typescript
// mod-loader.ts: Version compatibility checking
interface ModManifest {
  id: string;
  version: string;
  api_version: string;
  game_version_min: string;
  game_version_max: string;
  dependencies: Array<{ id: string; version: string }>;
  conflicts: Array<{ id: string; reason: string }>;
}

function checkCompatibility(
  mod: ModManifest,
  gameVersion: string,
  currentApiVersion: string,
  loadedMods: Map<string, ModManifest>
): { compatible: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check game version range
  if (!semverSatisfies(gameVersion, `>=${mod.game_version_min}`)) {
    errors.push(
      `Requires game version >= ${mod.game_version_min}, current: ${gameVersion}`
    );
  }
  if (
    mod.game_version_max &&
    !semverSatisfies(gameVersion, `<=${mod.game_version_max}`)
  ) {
    errors.push(
      `Requires game version <= ${mod.game_version_max}, current: ${gameVersion}`
    );
  }

  // Check API version compatibility (minor version must match or exceed)
  if (!apiVersionCompatible(mod.api_version, currentApiVersion)) {
    errors.push(
      `Requires API version ${mod.api_version}, current: ${currentApiVersion}`
    );
  }

  // Check dependencies are loaded and version-compatible
  for (const dep of mod.dependencies) {
    const loaded = loadedMods.get(dep.id);
    if (!loaded) {
      errors.push(`Missing required dependency: ${dep.id} ${dep.version}`);
    } else if (!semverSatisfies(loaded.version, dep.version)) {
      errors.push(
        `Dependency ${dep.id} version ${loaded.version} ` +
        `does not satisfy ${dep.version}`
      );
    }
  }

  // Check for conflicts
  for (const conflict of mod.conflicts) {
    if (loadedMods.has(conflict.id)) {
      errors.push(
        `Conflicts with loaded mod ${conflict.id}: ${conflict.reason}`
      );
    }
  }

  return { compatible: errors.length === 0, errors };
}
```

**Load order resolution:**

Mods load in a deterministic order based on dependencies. Use topological sort:

1. Build a dependency graph from all enabled mods
2. Detect cycles (circular dependencies are an error — refuse to load the cycle)
3. Topologically sort the graph — dependencies load before dependents
4. Within the same dependency tier, sort by the `load_order` field (lower numbers load first)
5. Data mods that replace the same asset use "last loaded wins" — the mod with the highest load order takes priority

### Content Moderation Pipeline

UGC platforms must moderate content to prevent copyright infringement, hate speech, exploits, and inappropriate material.

**Automated moderation (first pass):**
- **Hash matching**: Compare uploaded textures and audio against known copyrighted material databases (e.g., YouTube Content ID equivalent)
- **Text scanning**: Scan mod descriptions, in-game text, and script string literals for slurs, hate speech, and banned terms
- **Image classification**: ML-based NSFW detection on uploaded textures and thumbnails
- **Malware scanning**: Scan executable content (scripts, native plugins) for known malware signatures and suspicious patterns (file system access, network calls, process spawning)
- **Size limits**: Enforce maximum mod package size (e.g., 2 GB) to prevent abuse of storage infrastructure

**Community moderation (second pass):**
- Player reporting system: "Report this mod" button with category selection (offensive, broken, copyright, malware)
- Reputation system: Trusted modders (positive history, verified identity) get expedited review
- Community upvotes/downvotes surface quality and flag problems

**Manual review (final pass):**
- Moderation team reviews flagged content within 24-48 hours
- Clear guidelines published: what is allowed, what is not, appeal process
- Strike system: 1st strike = warning + content removal, 2nd = 30-day upload ban, 3rd = permanent ban
- DMCA/takedown process: legal compliance for copyright claims with counter-notification support

### Distribution Platforms

**Steam Workshop:**
- Largest PC mod distribution platform (~30,000 games with Workshop support)
- Steamworks API handles upload, download, update, subscription, and dependency resolution
- Players subscribe to mods; Steam auto-downloads and updates
- Workshop items support tags, previews, changelogs, and dependency declarations
- Revenue sharing available through the Curated Workshop (game developer sets the split)
- Limitation: Steam-only; mods are not available to players on other stores

**mod.io:**
- Cross-platform mod distribution (PC, console, mobile)
- REST API + SDKs for Unity, Unreal, and custom engines
- Handles upload, download, moderation, reporting, and authentication
- Supports monetization (paid mods) with configurable revenue splits
- Free tier available for indie developers
- Integration effort: medium (REST API is straightforward; SDK simplifies further)
- Advantage over Steam Workshop: works on consoles and non-Steam PC stores

**Custom in-game browser:**
- For games that want full control over the mod experience
- Build a mod repository server, upload API, and in-game browser UI
- Higher development cost but complete control over curation, moderation, and branding
- Appropriate for live-service games with a large dedicated team

**Local file-based loading (offline games):**
- For single-player and offline games, support loading mods from a local directory
- Standard path: `<game_install>/mods/` or `<user_documents>/GameName/mods/`
- Scan the directory at startup, validate manifests, and present an in-game mod manager
- No server infrastructure required
- Players distribute mods via file sharing, Nexus Mods, or other community sites

### Mod Manager UI

Every moddable game needs an in-game mod manager:

```
┌──────────────────────────────────────────────────────────┐
│  MOD MANAGER                                    [Close]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Installed Mods (7)              [Browse Workshop]       │
│                                                          │
│  ☑ ▲ Core Library v1.2.0        ★★★★☆  [Configure]     │
│  ☑ ▲ Better Textures v3.0.1     ★★★★★  [Configure]     │
│  ☑   Combat Overhaul v2.1.0     ★★★★☆  [Configure]     │
│  ☑   New Weapons Pack v1.5.0    ★★★☆☆  [Configure]     │
│  ☐   Hardcore Mode v1.0.0       ★★★★☆  [Configure]     │
│  ☑   UI Improvements v4.2.0     ★★★★★  [Configure]     │
│  ⚠ ☑ Old Mod v0.9.0            ★★☆☆☆  [Configure]     │
│      ⚠ Outdated: targets API v1.2, current v1.4         │
│                                                          │
│  ──────────────────────────────────────────────────────  │
│  Load Order: [Auto-resolve]  [Manual override]           │
│                                                          │
│  1. Core Library           (dependency: required first)  │
│  2. Better Textures        (data mod: load order 50)     │
│  3. Combat Overhaul        (script mod: load order 100)  │
│  4. New Weapons Pack       (depends on: Combat Overhaul) │
│  5. UI Improvements        (script mod: load order 200)  │
│                                                          │
│  [Apply Changes]  [Revert]  [Export Load Order]          │
└──────────────────────────────────────────────────────────┘
```

Essential mod manager features:
- Enable/disable individual mods without uninstalling
- Drag-and-drop or arrow-button load order adjustment
- Dependency resolution with clear error messages ("Mod A requires Mod B v2.0+, you have v1.3")
- Conflict detection with explanation ("Mod A and Mod B both modify the combat system — only one can be active")
- Compatibility warnings for mods targeting older API versions
- Per-mod configuration UI (if the mod exposes settings via `config/defaults.json`)
- "Disable all mods" panic button for troubleshooting crashes
- Export/import load order profiles for sharing configurations

### Save File Compatibility

Mods that add entities, items, or game state to save files create a compatibility challenge when mods are added or removed mid-playthrough.

**Design rules:**
- Separate mod data from base game data in the save file. Use a namespace: `mods.com.author.modname.custom_data`
- When loading a save with missing mod data, warn the player but do not crash. Remove orphaned mod data gracefully.
- When loading a save with a mod that was not present when the save was created, initialize the mod's state to defaults
- Never let mod data corrupt base game save data. Validate the save structure before writing.
- Provide a "clean save" option that strips all mod data and reverts to the base game state

### Telemetry and Crash Reporting with Mods

Mods are the leading cause of player-reported crashes, but players often blame the base game:

- Tag every crash report with the list of active mods and their versions
- If a crash occurs inside mod code (sandboxed script), report it as a mod crash, not a game crash
- Aggregate crash data by mod combination to identify problematic mods or mod interactions
- Expose a "mod-free mode" that launches the game with all mods disabled for comparison testing
- In the crash report UI, display: "You have 7 mods installed. Try disabling mods to determine if a mod is causing this issue."
- Provide mod authors with anonymized crash data for their mod so they can fix issues proactively
