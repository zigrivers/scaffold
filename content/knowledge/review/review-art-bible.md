<!-- eval-wip -->
---
name: review-art-bible
description: Failure modes and review passes specific to Art Bible documents — budget consistency, naming conventions, LOD coverage, and pipeline validation
topics: [game-dev, review, art, assets, lod, naming]
---

# Review: Art Bible

The Art Bible defines visual standards, asset specifications, and production pipelines for every art asset in the game. It must be consistent with performance budgets, complete in naming conventions and LOD tier definitions, and actionable for artists working in DCC tools. This review uses 7 passes targeting the specific ways Art Bibles fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Budget Consistency**: Polygon counts, texture sizes, and draw call limits align with performance budgets defined elsewhere; no asset exceeds its tier's budget.
- **Pass 2 — Naming Convention Completeness**: Every asset type (mesh, texture, material, animation, audio, VFX) has a naming convention; no gaps force artists to invent names.
- **Pass 3 — LOD Tier Coverage**: LOD tiers are defined for every asset category with specific poly reduction targets, transition distances, and quality fallback rules.
- **Pass 4 — Pipeline Validation Steps**: Every stage from DCC export to engine import has a validation step; no "hope it works" gaps in the pipeline.
- **Pass 5 — Platform-Specific Compression**: Texture compression formats, audio codecs, and mesh optimization targets are specified per target platform.
- **Pass 6 — DCC-to-Engine Import Validation**: Export settings, coordinate systems, scale factors, and material mappings are documented for every DCC-to-engine path.
- **Pass 7 — Style Guide Enforceability**: Visual style rules are objectively verifiable, not subjective; an artist can determine compliance without asking the art director.

## Deep Guidance

---

## Pass 1: Budget Consistency

### What to Check

Polygon counts, texture memory budgets, draw call targets, and shader complexity limits in the Art Bible align with performance budgets defined in the technical design or performance-budgets document. No individual asset spec exceeds what the performance budget allocates for its category.

### Why This Matters

An Art Bible that specifies 50K polygons per character while the performance budget allocates 200K polygons for 10 on-screen characters has a math problem — 10 × 50K = 500K, which is 2.5x over budget. This disconnect is invisible until the game runs at 15 FPS on target hardware. Budget consistency between the Art Bible and performance constraints is the single most impactful review pass.

### How to Check

1. Extract per-asset-type budgets from the Art Bible: characters, props, environment tiles, VFX, UI elements
2. Extract scene composition limits from the performance budget: max simultaneous characters, max props in view, max active VFX
3. Multiply: (per-asset budget) × (max simultaneous count) = total budget consumption per category
4. Sum all categories — does the total exceed the frame budget for the target platform?
5. Check texture memory: total unique textures × resolution × format size vs. available VRAM on minimum spec hardware
6. Verify draw call budget: each material instance is typically one draw call — count materials × max instances
7. Check shader complexity: are there real-time shadowing, SSR, volumetric, or post-process budgets that conflict with art specifications?

### What a Finding Looks Like

- P0: "Art Bible specifies 4K textures for hero characters (4 × 4096×4096 RGBA = 256MB). With 4 characters on screen, texture memory alone is 1GB — exceeding the 2GB VRAM target when environment textures are included."
- P1: "Character polygon budget is 30K but no LOD specification exists. At 200m distance, 30K characters consume the same budget as at 5m distance."
- P2: "VFX particle budget says 'up to 10,000 particles per effect' but does not specify max simultaneous effects. 3 effects × 10K = 30K particles may exceed the GPU particle budget."

---

## Pass 2: Naming Convention Completeness

### What to Check

Every asset type in the production pipeline has an explicit naming convention. Naming covers prefixes/suffixes for type identification, platform/LOD/variant tagging, and version control disambiguation. No asset type requires an artist to invent a naming scheme.

### Why This Matters

Inconsistent naming breaks automated pipelines. When the build system expects `T_CharacterName_D.png` for diffuse textures and an artist names it `CharacterName_diffuse.tga`, the import pipeline either fails silently or imports the asset incorrectly. At scale, naming inconsistency makes asset search, batch processing, and automated validation impossible. Every hour spent fixing naming retroactively costs 10x the effort of defining conventions upfront.

### How to Check

Use this checklist to verify every asset type is covered:

```markdown
## Naming Convention Coverage Checklist

### Meshes
- [ ] Static meshes: prefix, category, variant, LOD suffix
- [ ] Skeletal meshes: prefix, character/creature name, variant
- [ ] Collision meshes: prefix convention (UCX_, UBX_, USP_ or equivalent)
- [ ] LOD suffix convention: _LOD0, _LOD1, _LOD2, etc.

### Textures
- [ ] Diffuse/Albedo: suffix convention (_D, _Albedo, _BaseColor)
- [ ] Normal map: suffix convention (_N, _Normal)
- [ ] Roughness/Metallic/AO: suffix conventions for each channel
- [ ] Packed channel maps: channel order documented (e.g., RGBA = R:Metallic, G:Roughness, B:AO, A:Height)
- [ ] Emissive: suffix convention (_E, _Emissive)
- [ ] Resolution suffix if multiple resolutions exist (_2K, _4K)

### Materials
- [ ] Master material naming
- [ ] Material instance naming: parent reference in name
- [ ] Material function naming

### Animations
- [ ] Animation clip naming: character_action_variant format
- [ ] Animation blend space naming
- [ ] Animation montage naming
- [ ] Additive vs. override distinction in name

### Audio
- [ ] Sound cue naming
- [ ] Waveform file naming
- [ ] Music track naming
- [ ] Attenuation preset naming

### VFX
- [ ] Particle system naming
- [ ] VFX texture naming (flipbook, noise, gradient)
- [ ] VFX material naming

### UI
- [ ] Widget/component naming
- [ ] Icon naming: category_name_state format
- [ ] Font asset naming

### Folders
- [ ] Folder hierarchy convention documented
- [ ] Per-asset-type folder location specified
- [ ] Shared vs. unique asset folder rules
```

### What a Finding Looks Like

- P0: "Texture naming convention exists for diffuse and normal maps but packed channel maps (ORM, MRAO) have no convention. Artists will invent inconsistent suffixes and channel orders."
- P1: "Animation naming convention uses character_action format but does not address variants. 'Hero_Run' and 'Hero_Run_Injured' need a variant convention or the library becomes unsearchable."
- P2: "VFX textures have no naming convention distinct from material textures. A search for 'Smoke' returns both VFX flipbooks and environment material textures."

---

## Pass 3: LOD Tier Coverage

### What to Check

LOD (Level of Detail) tiers are defined for every asset category that appears at varying distances. Each tier specifies polygon reduction targets, texture downscale ratios, transition distances, and quality fallback rules for when LOD transitions are visible.

### Why This Matters

Without LOD specifications, every asset renders at maximum quality regardless of screen size. A 50K polygon character at 500m distance occupies 3 pixels but consumes the same GPU budget as at 5m. LOD is the primary tool for maintaining frame rate in open environments. Missing LOD specs mean either every asset is over-budgeted for distance viewing (wasting GPU) or under-budgeted for close-up viewing (visible quality loss).

### How to Check

1. Verify LOD tiers exist for: characters, props, environment assets, foliage, vehicles, weapons
2. For each asset category, check that each LOD tier specifies: polygon count or percentage reduction, texture resolution, transition distance
3. Verify transition method: distance-based, screen-size-based, or manual — is it consistent across categories?
4. Check for LOD transition artifacts: does the Art Bible specify dithering, cross-fade, or hard-cut transitions?
5. Verify that LOD0 (highest quality) budget matches the performance budget from Pass 1
6. Check for imposter/billboard LODs for distant foliage and crowd characters
7. Verify that skeletal meshes have LOD-appropriate bone reduction (fewer bones at lower LODs to reduce skinning cost)

### What a Finding Looks Like

- P0: "No LOD specification exists for any asset type. The game has open-world environments where assets are visible at 50m-2000m distances."
- P1: "Character LODs are defined (LOD0-LOD3) but environment props have no LOD specification. Dense environments with hundreds of props will exceed frame budget."
- P1: "LOD transition distance is specified as 'appropriate for the asset size' — this is not a specification. Each asset category needs concrete distance thresholds."
- P2: "Foliage LODs exist but no imposter/billboard LOD is specified for distances beyond 200m. Dense forests will render full 3D meshes at any distance."

---

## Pass 4: Pipeline Validation Steps

### What to Check

The Art Bible defines validation checkpoints at every stage of the asset pipeline: DCC authoring constraints, export settings verification, automated import validation, in-engine quality checks, and integration testing. No stage relies on "the artist will check it looks right."

### Why This Matters

Art pipelines without validation gates produce assets that are technically correct in the DCC tool but broken in-engine. Typical failures: non-manifold geometry that renders in Maya but creates lighting artifacts in-engine, textures with wrong color space (sRGB vs. linear) that look correct in Photoshop but are washed out in-engine, animations with baked scale that cause character size to change. Each failure is discovered late and costs exponentially more to fix.

### How to Check

1. Map the pipeline stages: concept → modeling → texturing → rigging → animation → export → import → integration
2. For each stage, verify a validation step exists with specific pass/fail criteria
3. Check that validation criteria are automatable where possible (polygon count check, texture size check, naming convention check)
4. Verify that DCC-side validation exists: artists should catch problems before export, not after import
5. Check for batch validation tooling: can the entire asset library be validated in one pass?
6. Verify that validation failures have a documented remediation path (not just "fix it")
7. Check that the validation pipeline handles asset updates (re-imported assets) not just new assets

### What a Finding Looks Like

- P0: "No automated validation steps exist in the pipeline. Asset quality is verified manually by the art lead reviewing each asset in-engine."
- P1: "Export validation checks polygon count but not UV layout. Overlapping UVs cause lightmap artifacts that are only discovered during level lighting builds."
- P2: "Validation exists for new assets but re-imported assets (updates) bypass validation. An artist updating a texture could introduce a color space error that goes undetected."

---

## Pass 5: Platform-Specific Compression

### What to Check

Texture compression formats, audio codecs, mesh optimization targets, and shader feature levels are specified per target platform. The Art Bible does not assume a single platform — it documents the differences and provides per-platform asset specifications.

### Why This Matters

Each platform has different compression format requirements (ASTC for mobile, BC7 for PC/console, ETC2 for older Android), memory constraints, and GPU capabilities. An Art Bible that specifies "use DXT5 compression" without acknowledging mobile targets will produce assets that either cannot be loaded on mobile or are decompressed at runtime (doubling memory usage). Platform-specific compression is not optional — it is a correctness requirement.

### How to Check

1. List all target platforms from the GDD or technical design
2. For each platform, verify texture compression formats are specified: PC (BC1-BC7), Console (BC1-BC7, platform-specific), Mobile (ASTC, ETC2), Web (basis/KTX2)
3. Verify audio codec specifications per platform: Vorbis, Opus, ADPCM, platform-native
4. Check that mesh complexity targets differ per platform where hardware diverges (mobile vs. PC)
5. Verify that shader feature level targets per platform are documented
6. Check for a fallback chain: if the preferred format is unsupported, what is the fallback?
7. Verify that platform-specific build configurations are documented for the asset pipeline

```markdown
## Platform Compression Matrix

| Asset Type    | PC (DX12/Vulkan) | Console (PS5/XSX) | Mobile (iOS/Android) | Switch     |
|---------------|-------------------|--------------------|----------------------|------------|
| Diffuse       | BC7               | BC7                | ASTC 4x4             | ASTC 4x4   |
| Normal        | BC5               | BC5                | ASTC 6x6             | ASTC 6x6   |
| ORM Pack      | BC7               | BC7                | ASTC 4x4             | ASTC 4x4   |
| UI            | BC7 (sRGB)        | BC7 (sRGB)         | ASTC 4x4 (sRGB)     | ASTC 4x4   |
| Audio (SFX)   | Vorbis Q6         | Platform native    | Opus 96kbps          | ADPCM      |
| Audio (Music) | Vorbis Q8         | Platform native    | Opus 128kbps         | Vorbis Q6  |
| Mesh LOD0     | 100%              | 100%               | 50%                  | 60%        |
```

### What a Finding Looks Like

- P0: "Art Bible specifies BC7 texture compression with no mobile platform section. The game targets iOS and Android where BC7 is not natively supported."
- P1: "Audio is specified as 'WAV in production, compressed for shipping' without specifying the target codec or quality per platform."
- P2: "Switch platform is listed as a target but has no platform-specific compression or budget section. Switch has significantly lower GPU and memory budgets than PS5/XSX."

---

## Pass 6: DCC-to-Engine Import Validation

### What to Check

Export settings from every DCC tool (Maya, Blender, 3ds Max, Substance, ZBrush, Houdini) to the target engine are documented. Coordinate system handedness, scale factors, axis orientation, FBX settings, material channel mappings, and animation export options are all specified.

### Why This Matters

Every DCC tool uses different conventions. Blender is Z-up right-handed, Unreal is Z-up left-handed, Unity is Y-up left-handed. A model exported from Blender without the correct axis conversion will appear rotated 90 degrees in Unreal. Scale factor mismatches (1 unit = 1cm vs. 1 unit = 1m) produce assets that are 100x too large or too small. Material channel mappings differ between Substance Painter's export presets and engine material inputs. Each mismatch is a bug that wastes time to diagnose.

### How to Check

1. List all DCC tools used in the pipeline
2. For each DCC-to-engine path, verify these are documented:
   - Coordinate system and axis orientation
   - Scale factor (units per meter)
   - FBX export version and settings (if FBX is the interchange format)
   - Material/texture channel mapping (Substance channels to engine material inputs)
   - Animation export settings (bake vs. curves, frame rate, root motion handling)
   - Skeletal mesh: bone naming convention, required root bone, max bone count
3. Verify that import settings in the engine are documented (not just export settings)
4. Check for automated import rules (engine import settings presets per asset type)
5. Verify that round-trip workflows are documented (export → import → modify in engine → re-export to DCC if needed)

### What a Finding Looks Like

- P0: "No DCC-to-engine export documentation exists. Artists must discover correct export settings by trial and error."
- P1: "Blender export settings are documented but Substance Painter texture channel mappings are not. Artists exporting from Substance must guess which channel maps to which engine input."
- P1: "Animation export settings do not address root motion. Locomotion animations may have root motion baked in or extracted — the convention is undocumented."
- P2: "FBX export version is not specified. FBX 2020 and FBX 2014 handle blend shapes differently — inconsistent versions across the team will produce different results."

---

## Pass 7: Style Guide Enforceability

### What to Check

Visual style rules are defined in objectively verifiable terms. An artist can determine whether their work complies without subjective judgment. Color palettes have specific hex/RGB values, proportions have ratios, and stylization rules reference concrete visual examples rather than mood descriptions.

### Why This Matters

A style guide that says "warm, inviting color palette" is not enforceable. Five artists will produce five different interpretations of "warm and inviting." When the art lead must manually review every asset for style compliance, the art lead becomes a bottleneck and a single point of failure. Objectively verifiable style rules enable self-review and automated validation (hue range checks, proportion ratio checks), scaling art production without scaling art direction overhead.

### How to Check

1. Check color specifications: are palettes defined with specific values (hex, RGB, HSV ranges) or subjective descriptions ("warm tones")?
2. Verify proportion rules: character head-to-body ratios, prop scale references, environment module dimensions — are they numeric?
3. Check stylization rules: if the style is "stylized," what are the specific deviations from realism? (Edge softness, saturation boost, proportion exaggeration percentages)
4. Verify material property ranges: roughness 0.3-0.7, metallic 0 or 1 only (no partial metallic), emissive intensity ranges
5. Check for visual reference sheets per asset category: characters, props, environments, UI — do they exist?
6. Verify that "do" and "don't" examples exist for common style violations
7. Check that the style guide addresses edge cases: what happens when gameplay clarity conflicts with style? (Enemy readability vs. environmental cohesion)

### What a Finding Looks Like

- P0: "Color palette is described as 'earthy tones with vibrant accents' with no specific values. This is a mood description, not a specification."
- P1: "Character proportion guide shows a reference image but no numeric ratios. Subtle proportion differences between artists will accumulate into an inconsistent character roster."
- P2: "Roughness values for wood materials are described as 'fairly rough' — specify a range (0.6-0.8) so artists and material validation tools have a concrete target."

---

## Common Review Anti-Patterns

### 1. Art Bible Without Performance Budget Cross-Reference

The Art Bible defines beautiful, detailed asset specifications that were never compared against the game's performance budget. The specs are aspirational quality targets that will produce a game running at 15 FPS. The review must catch this disconnect before production begins.

**How to spot it:** The Art Bible contains no references to frame budget, VRAM budget, or draw call limits. Asset specifications are described in terms of quality ("high-quality PBR materials") rather than budgets ("2048×2048 textures, 3 texture sets per character").

### 2. Naming Convention for Meshes Only

The naming convention section thoroughly covers mesh naming but skips textures, materials, animations, audio, or VFX. In practice, texture naming inconsistency causes more pipeline failures than mesh naming because textures have more variants (diffuse, normal, ORM, emissive, mask) and more naming ambiguity.

**How to spot it:** Count the asset types covered by the naming convention. If fewer than 6 categories are covered, significant gaps exist.

### 3. Single-Platform Art Bible for Multi-Platform Game

The Art Bible specifies one set of asset standards (typically the highest-end target platform) and assumes other platforms will be "optimized later." Platform-specific compression, budget, and quality targets are absent. In practice, "optimize later" means a 6-month crunch to make assets work on lower-end platforms.

**How to spot it:** The Art Bible has no platform-specific sections. Texture formats, poly budgets, and shader targets reference only one platform. Words like "we will optimize for mobile later" appear.
