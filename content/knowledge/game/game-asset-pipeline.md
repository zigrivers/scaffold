<!-- eval-wip -->
---
name: game-asset-pipeline
description: Asset naming taxonomies by engine, per-type specs (poly budgets, texture sizes, audio formats), DCC tool chains, Git LFS config, and file locking
topics: [game-dev, assets, pipeline, naming, dcc, lfs]
---

The asset pipeline is the full chain from an artist's DCC tool (Maya, Blender, Substance Painter, Houdini) through export, import, optimization, and packaging into the final game build. A well-structured pipeline enforces naming conventions, validates assets against per-type budgets on import, automates texture compression and LOD generation, and integrates with version control to prevent binary merge conflicts. Pipeline failures are insidious — a single 4K texture on a UI element or an uncompressed WAV in the audio bank can ship to players because nobody validated the asset against its budget.

## Summary

### Naming Conventions by Engine

Consistent naming is the foundation of asset discoverability, automated validation, and build tooling. Every major engine community has converged on prefix-based taxonomies:

**Unreal Engine convention (prefix_category_variant_index):**
- `SM_Weapon_Sword_01` — Static Mesh, weapon category, sword variant, first iteration
- `SK_Character_Player` — Skeletal Mesh for the player character
- `T_Rock_D` / `T_Rock_N` / `T_Rock_R` — Texture: diffuse/albedo, normal, roughness
- `M_Env_Ground_Dirt` — Material for environment ground, dirt variant
- `MI_Env_Ground_Dirt_Wet` — Material Instance variant
- `ABP_Character_Player` — Animation Blueprint
- `A_Weapon_Sword_Swing` — Animation asset
- `BP_Pickup_Health` — Blueprint actor
- `WBP_HUD_Crosshair` — Widget Blueprint
- `SFX_Weapon_Sword_Hit` — Sound effect
- `MUS_Level01_Combat` — Music track
- `FX_Env_Fire_Campfire` — Particle/Niagara effect
- `LVL_World01_Area03` — Level/Map file

**Unity convention (PascalCase with type suffixes or directory-based):**
- `WeaponSword01_Mesh` or simply organized by folder: `Art/Meshes/Weapons/Sword01.fbx`
- `RockDiffuse`, `RockNormal`, `RockRoughness` — textures
- `PlayerCharacter_Anim_Run` — animation clip
- `HUD_Crosshair` — UI prefab
- Unity relies more on folder structure than prefixes, but prefixes are still recommended for large projects

**Godot convention:**
- Snake_case file names: `weapon_sword_01.tres`, `player_character.tscn`
- Resources by type directory: `res://assets/meshes/`, `res://assets/textures/`
- Scenes: `res://scenes/levels/world_01.tscn`

### Per-Type Asset Specifications

Every asset type needs explicit budgets documented in a project asset spec:

- **Static Meshes**: Hero props 5K–20K triangles, environment props 500–5K, background/distant 50–500. LOD0 within 10m, LOD1 at 50%, LOD2 at 25%
- **Skeletal Meshes**: Player character 15K–50K, NPCs 8K–30K, distant crowd 500–2K. Bone count: main characters 80–150, simple enemies 30–60
- **Textures**: Props 512x512–1024x1024, hero assets 2048x2048, environment tiling 1024x1024–2048x2048, UI elements power-of-2 or atlas. Always square or 2:1 ratio for compression
- **Audio**: SFX as .ogg/.wav (mono, 44.1kHz, 16-bit), music as .ogg (stereo, 44.1kHz), voice as .ogg (mono, 22.05kHz acceptable). Compress to platform-appropriate codec at build time
- **Animations**: 30fps for body anims, 60fps for facial/hand detail. Max clip length 10s for looping, segmented for cinematics

### DCC Tool Chains

The pipeline typically involves multiple DCC tools in sequence:

- **3D Modeling**: Maya (industry standard, USD support), Blender (free, growing adoption), 3ds Max (legacy, architectural viz)
- **Sculpting**: ZBrush (high-poly sculpting, retopo), Blender (integrated sculpt mode)
- **Texturing**: Substance 3D Painter (PBR texturing standard), Substance Designer (procedural materials), Quixel Mixer (free with Unreal)
- **VFX/Procedural**: Houdini (procedural generation, destruction, terrain), EmberGen (real-time fluid sim for VFX textures)
- **2D Art**: Photoshop, Aseprite (pixel art), Krita (free painting)
- **Audio**: FMOD Studio / Wwise (integration middleware), Audacity (editing), Reaper (DAW)

### Git LFS and Binary Version Control

Game assets are binary files that cannot be diffed or merged. Git LFS (Large File Storage) tracks them by pointer, storing actual content on a separate server.

## Deep Guidance

### Git LFS Configuration

Every game project using Git must configure LFS for binary assets from day one. Retroactively adding LFS to an existing repo with binary history is painful and requires `git lfs migrate`.

```gitattributes
# .gitattributes — place in repo root, commit BEFORE adding any binary files

# Textures
*.png filter=lfs diff=lfs merge=lfs -text
*.jpg filter=lfs diff=lfs merge=lfs -text
*.jpeg filter=lfs diff=lfs merge=lfs -text
*.tga filter=lfs diff=lfs merge=lfs -text
*.tif filter=lfs diff=lfs merge=lfs -text
*.tiff filter=lfs diff=lfs merge=lfs -text
*.psd filter=lfs diff=lfs merge=lfs -text
*.exr filter=lfs diff=lfs merge=lfs -text
*.hdr filter=lfs diff=lfs merge=lfs -text
*.bmp filter=lfs diff=lfs merge=lfs -text

# 3D Models and Scenes
*.fbx filter=lfs diff=lfs merge=lfs -text
*.obj filter=lfs diff=lfs merge=lfs -text
*.blend filter=lfs diff=lfs merge=lfs -text
*.mb filter=lfs diff=lfs merge=lfs -text
*.ma filter=lfs diff=lfs merge=lfs -text
*.max filter=lfs diff=lfs merge=lfs -text
*.ztl filter=lfs diff=lfs merge=lfs -text
*.usd filter=lfs diff=lfs merge=lfs -text
*.usda filter=lfs diff=lfs merge=lfs -text
*.usdc filter=lfs diff=lfs merge=lfs -text
*.gltf filter=lfs diff=lfs merge=lfs -text
*.glb filter=lfs diff=lfs merge=lfs -text

# Audio
*.wav filter=lfs diff=lfs merge=lfs -text
*.mp3 filter=lfs diff=lfs merge=lfs -text
*.ogg filter=lfs diff=lfs merge=lfs -text
*.flac filter=lfs diff=lfs merge=lfs -text
*.bank filter=lfs diff=lfs merge=lfs -text
*.wem filter=lfs diff=lfs merge=lfs -text

# Video
*.mp4 filter=lfs diff=lfs merge=lfs -text
*.mov filter=lfs diff=lfs merge=lfs -text
*.avi filter=lfs diff=lfs merge=lfs -text
*.webm filter=lfs diff=lfs merge=lfs -text

# Engine-specific binary formats
*.uasset filter=lfs diff=lfs merge=lfs -text
*.umap filter=lfs diff=lfs merge=lfs -text
*.unity filter=lfs diff=lfs merge=lfs -text
*.asset filter=lfs diff=lfs merge=lfs -text
*.prefab filter=lfs diff=lfs merge=lfs -text
*.physicMaterial filter=lfs diff=lfs merge=lfs -text
*.controller filter=lfs diff=lfs merge=lfs -text
*.anim filter=lfs diff=lfs merge=lfs -text

# Fonts
*.ttf filter=lfs diff=lfs merge=lfs -text
*.otf filter=lfs diff=lfs merge=lfs -text

# Compiled/packaged
*.dll filter=lfs diff=lfs merge=lfs -text
*.so filter=lfs diff=lfs merge=lfs -text
*.dylib filter=lfs diff=lfs merge=lfs -text
*.exe filter=lfs diff=lfs merge=lfs -text
*.zip filter=lfs diff=lfs merge=lfs -text
*.7z filter=lfs diff=lfs merge=lfs -text
```

### File Locking Protocol

Binary files cannot be merged. Two artists editing the same texture simultaneously will result in one person losing their work. File locking prevents this.

**Git LFS locking workflow:**

1. Before editing a binary file: `git lfs lock Art/Textures/T_Rock_D.png`
2. Edit the file in your DCC tool
3. Stage, commit, push
4. Release the lock: `git lfs unlock Art/Textures/T_Rock_D.png`

**Lockable file types** — add to `.gitattributes`:
```gitattributes
# Mark files as lockable (enables lock tracking in LFS)
*.uasset lockable
*.umap lockable
*.fbx lockable
*.blend lockable
*.psd lockable
*.mb lockable
*.ma lockable
*.unity lockable
*.prefab lockable
*.asset lockable
```

**Team locking rules:**
- Never edit a binary file without locking it first
- Check `git lfs locks` before starting work to see what is currently locked and by whom
- Do not hold locks overnight — if work is incomplete, communicate on the team channel
- Admins can force-unlock with `git lfs unlock --force --id=<lock-id>` if someone is unavailable
- CI should verify no stale locks exist older than 48 hours and send notifications

### Asset Import Validation

Automated validation on asset import catches budget violations before they enter the build.

```python
# asset_validator.py — Run as pre-commit hook or CI step
# Validates assets against project budgets

import os
import sys
import json
from pathlib import Path
from typing import NamedTuple

class AssetBudget(NamedTuple):
    max_triangles: int = 0
    max_texture_size: int = 0
    max_file_size_mb: float = 0

# Project-specific budgets — adjust per project
BUDGETS = {
    "meshes/props": AssetBudget(max_triangles=5000, max_file_size_mb=10),
    "meshes/heroes": AssetBudget(max_triangles=20000, max_file_size_mb=50),
    "meshes/environment": AssetBudget(max_triangles=10000, max_file_size_mb=30),
    "textures/ui": AssetBudget(max_texture_size=512, max_file_size_mb=1),
    "textures/props": AssetBudget(max_texture_size=1024, max_file_size_mb=5),
    "textures/heroes": AssetBudget(max_texture_size=2048, max_file_size_mb=10),
    "textures/environment": AssetBudget(max_texture_size=2048, max_file_size_mb=10),
}

# File size validation (works without engine-specific tooling)
MAX_SIZES_MB = {
    ".fbx": 50, ".blend": 100, ".psd": 200,
    ".png": 20, ".tga": 40, ".jpg": 10,
    ".wav": 50, ".ogg": 10, ".mp3": 10,
}

def validate_file_size(filepath: Path) -> list[str]:
    errors = []
    ext = filepath.suffix.lower()
    if ext in MAX_SIZES_MB:
        size_mb = filepath.stat().st_size / (1024 * 1024)
        limit = MAX_SIZES_MB[ext]
        if size_mb > limit:
            errors.append(
                f"SIZE: {filepath.name} is {size_mb:.1f} MB "
                f"(limit: {limit} MB for {ext})"
            )
    return errors

def validate_naming(filepath: Path) -> list[str]:
    errors = []
    name = filepath.stem
    # Check for spaces
    if " " in name:
        errors.append(f"NAMING: '{name}' contains spaces — use underscores")
    # Check for special characters
    if not all(c.isalnum() or c in "_-" for c in name):
        errors.append(f"NAMING: '{name}' has special chars — alphanumeric, _ and - only")
    return errors

def main():
    changed_files = sys.argv[1:]  # Pass changed files from git hook
    all_errors = []
    for f in changed_files:
        path = Path(f)
        if not path.exists():
            continue
        all_errors.extend(validate_file_size(path))
        all_errors.extend(validate_naming(path))
    if all_errors:
        print("ASSET VALIDATION FAILURES:")
        for err in all_errors:
            print(f"  {err}")
        sys.exit(1)
    print(f"Validated {len(changed_files)} assets — all passed.")

if __name__ == "__main__":
    main()
```

### DCC Export Standards

Each DCC tool in the pipeline needs documented export settings to ensure consistency.

**Blender to FBX export settings:**
- Scale: 1.0 (ensure Blender scene scale matches engine units — 1 unit = 1 meter for Unreal, 1 unit = 1 meter for Unity)
- Forward axis: -Y Forward, Z Up (Unreal default) or varies by engine
- Apply Modifiers: Yes
- Mesh: Triangulate Faces enabled for guaranteed triangle counts
- Armature: only include deform bones (exclude IK targets, helper bones)
- Animation: bake all actions, simplify with constant interpolation removal at 0.001 threshold
- Do NOT embed textures in FBX — reference them externally

**Substance Painter export templates:**
- Unreal template: BaseColor + Normal (DirectX) + OcclusionRoughnessMetallic (packed RGB)
- Unity URP template: Albedo + Normal (OpenGL) + MetallicSmoothness (packed, alpha = smoothness)
- Export at project texture resolution, let engine handle platform compression
- File format: PNG for lossless, TGA for legacy pipelines

**Houdini export for game assets:**
- Use GameDev Toolset (SideFX Labs) for game-focused export nodes
- Export static meshes as FBX with LOD variants as separate meshes in the same file
- Export terrain as heightmap (16-bit RAW or PNG) plus splatmap layers
- Procedural generation outputs should be deterministic — same seed, same output — so results can be cached and version-controlled

### Texture Pipeline Details

Textures typically consume the largest share of game memory. A disciplined texture pipeline is essential.

**Texture channel packing:**
Channel packing stores multiple grayscale maps in the RGBA channels of a single texture, halving or quartering texture samples:
- **Unreal ORM**: R=Ambient Occlusion, G=Roughness, B=Metallic
- **Unity Mask Map (HDRP)**: R=Metallic, G=AO, B=Detail Mask, A=Smoothness
- **Custom packing**: R=Height, G=Roughness, B=Curvature, A=Thickness (for subsurface)

**Compression formats by platform:**
- **PC/Console**: BC7 (high quality, 8 bpp) for albedo/normal, BC5 for 2-channel normals, BC4 for grayscale masks
- **Android**: ASTC (adaptive block sizes: 4x4 for high quality, 8x8 for lower quality/smaller size), ETC2 for broad compatibility
- **iOS**: ASTC (preferred) or PVRTC (legacy)
- **Nintendo Switch**: ASTC is the primary format

**MIP map policy:**
- Generate mipmaps for all 3D-rendered textures (engine does this automatically)
- Disable mipmaps for UI textures and pixel-art (they cause blurring)
- For terrain textures, ensure mip bias is tuned to prevent distant terrain looking muddy

### Audio Asset Standards

Audio is often the most neglected part of the asset pipeline, leading to bloated builds and inconsistent quality.

**Source format requirements:**
- Record and master at 48kHz/24-bit WAV minimum (archive these as golden masters)
- Game-ready export: 44.1kHz/16-bit for SFX, 44.1kHz/16-bit stereo for music
- Voice lines: 22.05kHz/16-bit mono is acceptable if storage constrained

**Compression and middleware integration:**
- FMOD/Wwise handle runtime compression — provide uncompressed WAV to the middleware
- For engine-native audio: compress to Vorbis/OGG at quality 5–7 for SFX, quality 7–9 for music
- Stream long audio (music, ambience, dialogue) rather than loading fully into memory
- Short SFX (under 2 seconds) should be decompressed on load for instant playback without decode latency

**Naming and organization:**
```
Audio/
  SFX/
    Weapons/
      SFX_Weapon_Sword_Swing_01.wav
      SFX_Weapon_Sword_Swing_02.wav   # Multiple variations for randomization
      SFX_Weapon_Sword_Hit_Metal_01.wav
    Footsteps/
      SFX_Footstep_Dirt_01.wav
      SFX_Footstep_Dirt_02.wav
      SFX_Footstep_Wood_01.wav
  Music/
    MUS_MainMenu_Loop.wav
    MUS_Level01_Explore.wav
    MUS_Level01_Combat.wav
  Voice/
    VO_NPC_Merchant_Greet_01.wav
    VO_NPC_Merchant_Greet_02.wav
  Ambience/
    AMB_Forest_Day.wav
    AMB_Cave_Drip.wav
```

### Build Pipeline Integration

The asset pipeline feeds into the build system. Key integration points:

**Asset cooking/processing:**
- Unreal: `RunUAT BuildCookRun` — cooks assets for target platform (compresses textures, builds shader permutations, packages data)
- Unity: `BuildPipeline.BuildAssetBundles()` — creates platform-specific asset bundles
- Godot: Export presets handle platform-specific resource conversion

**CI asset validation checklist:**
1. All new/modified assets pass naming convention check
2. No binary files committed outside LFS tracking
3. File sizes within per-type budgets
4. Texture dimensions are power-of-2 (or explicitly exempted)
5. No uncompressed audio files in the build (WAV masters stay in a separate archive)
6. Import settings match project standards (compression, mip settings, LOD)
7. No orphaned assets (referenced by nothing, consuming build size)

**Asset bundle and content addressing:**
- Use addressable assets (Unity) or soft references (Unreal) to decouple asset loading from folder structure
- Tag assets with categories for selective loading (e.g., load only Level01 assets, not all levels)
- Generate asset manifests at build time listing every asset, its size, and its load group — use this for download size estimation and DLC partitioning
