---
name: game-vr-ar-design
description: VR comfort and locomotion, stereo rendering budgets, spatial UI, hand tracking, gaze interaction, motion sickness, and certification
topics: [game-dev, vr, ar, comfort, locomotion, spatial-ui]
---

VR and AR development is fundamentally constrained by human physiology in ways that flat-screen development is not. Every design decision — camera movement, UI placement, rendering performance, input method — must account for the vestibular system, visual comfort, and spatial cognition of the player. A frame drop that is a minor annoyance on a monitor becomes nausea-inducing in a headset. A UI panel that works at arm's length on a screen becomes unreadable at 0.5 meters or causes eye strain at 0.3 meters. Motion that the player did not initiate with their own body creates a sensory conflict that the brain interprets as poisoning. VR/AR design is not flat-screen design with head tracking bolted on — it requires rethinking interaction, performance, and comfort from first principles.

## Summary

### Performance Targets

VR has the most demanding performance requirements in real-time rendering because dropped frames directly cause motion sickness:

- **Quest 3 / Quest Pro**: 72 Hz or 90 Hz (90 Hz strongly recommended). Per-eye resolution: 2064x2208. Total pixels per frame: ~9.1 million (both eyes). GPU: Qualcomm Adreno 740 (Snapdragon XR2 Gen 2), roughly equivalent to a 2022 flagship phone GPU (Snapdragon 8 Gen 1 class). Significantly more capable than Quest 2's XR2 Gen 1 but still mobile-tier — expect 10-20% of a current desktop GPU's fill rate.
- **PlayStation VR2**: 90 Hz or 120 Hz. Per-eye resolution: 2000x2040. Total pixels: ~8.2 million. GPU: PS5 AMD RDNA2 — much more capable than Quest but still must hit 90+ Hz.
- **PC VR (Valve Index, Pimax)**: 90 Hz, 120 Hz, or 144 Hz. Per-eye resolution varies (Index: 1440x1600). GPU: Desktop RTX-class, but driving high refresh rates at high resolution is still demanding.
- **Apple Vision Pro**: 90 Hz with dynamic foveated rendering. Per-eye resolution: ~3660x3200. GPU: M2+R1 chip with dedicated real-time sensor processing.

**The golden rule**: Never drop below the headset's target frame rate. A single dropped frame is noticeable. Sustained drops below target cause discomfort within 30 seconds and nausea within 2-3 minutes for sensitive users.

**Motion-to-photon latency**: The time between the player moving their head and the display updating. Must be below 20 ms. Above 20 ms, the visual world lags behind head movement, creating a disconnect that triggers motion sickness. Headset runtimes (SteamVR, Oculus Runtime) provide reprojection/timewarp as a safety net, but it is a fallback, not a strategy.

### Comfort Ratings

Platform holders (Meta, Sony, Apple) require games to self-rate their comfort level:

- **Comfortable**: Stationary or room-scale with no artificial locomotion. Suitable for all players. (Example: Beat Saber, puzzle games)
- **Moderate**: Slow artificial locomotion with comfort options. Most players tolerate with breaks. (Example: Walkabout Mini Golf, seated cockpit games)
- **Intense**: Fast movement, artificial rotation, or camera control not driven by head movement. Many players experience discomfort. (Example: fast FPS games, roller coaster simulations)

### Locomotion Options

Locomotion is the most contentious design problem in VR. Every method trades off between immersion, comfort, and accessibility.

**Teleportation:**
- Player points a parabolic arc, selects a destination, and instantly moves there
- Most comfortable (zero vestibular conflict)
- Breaks spatial continuity — players lose sense of distance traveled
- Standard for Quest platform and first-time VR users

**Smooth locomotion (thumbstick movement):**
- Continuous movement in the direction the player is looking or pointing
- Familiar to flat-screen gamers
- Causes motion sickness in 30-60% of new VR users
- Always offer as an option alongside teleportation, never as the only choice

**Snap turn vs smooth turn:**
- Snap turn rotates in fixed increments (30, 45, or 90 degrees) — eliminates rotational vestibular mismatch
- Smooth turn rotates continuously — more immersive but more nauseating
- Default to snap turn; offer smooth turn as an advanced option

**Room-scale (1:1 physical movement):**
- Player walks in real space; movement is tracked 1:1 in the virtual world
- Zero motion sickness (vestibular and visual signals match perfectly)
- Limited by physical play area (typically 2x2 m to 3x3 m)
- Best for experiences designed around small spaces

## Deep Guidance

### Stereo Rendering Architecture

VR renders every frame twice — once per eye — with slightly different camera positions to create stereoscopic depth. This doubles the rendering cost compared to flat-screen at the same resolution.

**Single-pass stereo rendering:**

Modern VR SDKs (OpenXR, Unity XR, Unreal VR) support single-pass stereo, which renders both eyes in a single draw call using instanced rendering. This eliminates the CPU overhead of submitting draw calls twice.

```hlsl
// Single-pass instanced stereo vertex shader (HLSL / Unity URP example)
// The GPU renders each triangle twice — once per eye — using SV_InstanceID
// or unity_StereoEyeIndex to select the correct view-projection matrix.

struct VertexInput {
    float3 positionOS : POSITION;
    float3 normalOS   : NORMAL;
    float2 uv         : TEXCOORD0;
    UNITY_VERTEX_INPUT_INSTANCE_ID
};

struct VertexOutput {
    float4 positionCS : SV_POSITION;
    float2 uv         : TEXCOORD0;
    float3 normalWS   : TEXCOORD1;
    UNITY_VERTEX_OUTPUT_STEREO
};

VertexOutput vert(VertexInput input) {
    VertexOutput output;
    UNITY_SETUP_INSTANCE_ID(input);
    UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);

    float3 positionWS = TransformObjectToWorld(input.positionOS);
    output.positionCS = TransformWorldToHClip(positionWS);
    output.normalWS   = TransformObjectToWorldNormal(input.normalOS);
    output.uv         = input.uv;
    return output;
}
```

**Foveated rendering:**

Foveated rendering reduces pixel workload by rendering the periphery at lower resolution than the center of the player's gaze. Fixed foveated rendering uses a static center region; eye-tracked foveated rendering dynamically follows the player's gaze.

Performance impact:
- Fixed foveated rendering (Quest 3): 20-30% GPU time savings at high foveation levels
- Eye-tracked foveated rendering (PSVR2, Vision Pro): 40-50% GPU time savings with no perceptible quality loss
- Outer ring can render at 1/4 to 1/16 resolution with minimal visual impact because peripheral vision has very low acuity

**Rendering budget for Quest 3 (mobile VR):**
- Target: 90 FPS = 11.1 ms per frame
- Draw calls: 50-100 maximum (batching and instancing are critical)
- Triangles: 100K-300K per frame (both eyes combined)
- Texture memory: 200-400 MB (compressed ASTC textures mandatory)
- Shader complexity: avoid multi-pass shaders; one directional light, baked GI, no real-time shadows if possible
- Post-processing: avoid or minimize — bloom, SSAO, and motion blur are expensive and motion blur in VR causes nausea

**Rendering budget for PC VR:**
- Target: 90-120 FPS depending on headset
- Draw calls: 500-2,000 (still much lower than flat-screen games due to frame rate target)
- Triangles: 1-3 million per frame
- Real-time shadows: one cascade, limited distance
- Post-processing: use sparingly; temporal anti-aliasing is recommended but must be tuned to avoid ghosting at high head rotation speeds

### Spatial UI Design

VR UI cannot follow flat-screen conventions. Flat HUDs locked to the camera (head-locked UI) cause eye strain and nausea. VR UI must exist in 3D space.

**UI placement guidelines:**

- **Comfortable viewing distance**: 1.5-3.0 meters from the player. Closer than 1.0 m forces uncomfortable eye convergence. Farther than 5.0 m loses readability.
- **Comfortable viewing angle**: Within 30 degrees of center gaze (horizontally and vertically). UI at extreme angles requires neck rotation, which fatigues players.
- **Text size**: Minimum 1.0 degree of visual arc per line height. At 2 meters distance, this is approximately 3.5 cm tall text. For Quest 3 resolution, aim for 1.5+ degrees per line to remain crisp.
- **Panel curvature**: Curve large UI panels to maintain consistent distance from the player's eyes across the panel's width. A flat 2-meter-wide panel has edges 15-20% farther from the player than the center, causing focus mismatch.

**UI anchoring strategies:**

```
World-locked UI:
  - Attached to a fixed position in the game world
  - Example: A scoreboard on a virtual wall, a label above an NPC
  - Feels most natural and immersive
  - Disappears when the player turns away (can be disorienting if critical)

Body-locked UI:
  - Follows the player's body position but not head rotation
  - Example: A wrist-mounted menu (look at your virtual wrist to open)
  - Good for persistent info (health, ammo) without head-lock nausea
  - Requires the player to consciously look at it

Tag-along UI:
  - Lazily follows head gaze with damping and deadzone
  - Stays roughly in front of the player but does not track head 1:1
  - Soft spring behavior: UI drifts into view when the player looks away for a few seconds
  - Good for notifications, subtitles, and non-critical persistent info
  - NEVER lock UI rigidly to the head — this is the most common VR UI mistake

Hand-attached UI:
  - Anchored to the player's tracked hand or controller
  - Example: Inventory panel that appears when the player flips their hand palm-up
  - Natural interaction metaphor but can be jittery on hand tracking (vs controllers)
```

### Hand Tracking and Gaze Interaction

Hand tracking (Quest, Vision Pro) eliminates controllers but introduces new design constraints:

**Hand tracking limitations:**
- Accuracy: ±5-10 mm positional, ±5-10 degree rotational (much worse than controller tracking)
- Occlusion: Hands behind the back, behind the head, or overlapping each other lose tracking
- Latency: 20-40 ms higher than controller input
- False positives: Casual hand movements may trigger unintended interactions
- Fatigue: Sustained arm-raised interactions cause "gorilla arm" fatigue within 2-3 minutes

**Design rules for hand tracking:**
- Use large interaction targets (minimum 6 cm diameter at arm's length)
- Provide visual and audio feedback for hover, select, and release states
- Rest position for hands should be below chest height — do not require raised arms for extended interactions
- Avoid precision tasks (small buttons, fine sliders) — hand tracking does not have the precision
- Always provide a controller fallback for accessibility

**Gaze interaction (eye tracking):**
- Eye tracking (PSVR2, Vision Pro, Pimax Crystal) allows gaze to act as a pointer
- Gaze + pinch (Vision Pro model): Look at a target, pinch thumb-and-finger to select
- Gaze + dwell: Look at a target for a threshold duration (1.0-1.5 seconds) to select
- Dwell timers need visual feedback (radial progress indicator on the target)
- Midas touch problem: Players look at things they do not intend to interact with; require explicit confirmation (pinch, button press, or dwell) rather than gaze-alone activation

### Motion Sickness Mitigation

Motion sickness in VR (technically "cybersickness") is caused by conflict between vestibular (inner ear) and visual signals. The inner ear reports "not moving" while the eyes report "moving." The brain interprets this conflict as potential poisoning and triggers nausea.

**Proven mitigation techniques:**

```
Technique               | Effectiveness | Immersion Cost
────────────────────────┼───────────────┼───────────────
Teleportation           | High          | High (breaks continuity)
Snap turn               | High          | Low
Vignetting during move  | Medium-High   | Low (reduces FOV temporarily)
Stationary reference    | Medium        | Low (cockpit, nose)
Reduced FOV during move | Medium        | Medium
Comfort cage / grid     | Medium        | Medium (visible overlay)
Slower movement speed   | Medium        | Low
Head-bob removal        | Medium        | Low
Fixed horizon line      | Medium        | Low
```

**Vignetting (tunnel vision):**
- During artificial locomotion, darken or black out the peripheral vision
- Reduces the visual area that conflicts with vestibular signals
- Player adjustable: some players want full FOV, others need heavy vignetting
- Implementation: post-process shader that blends a dark vignette from the edges inward when velocity exceeds a threshold

**Stationary reference frame:**
- Add a fixed visual element that does not move with the virtual world
- A virtual nose, cockpit dashboard, or helmet rim provides a stable reference that reduces conflict
- Even a subtle grid overlay on the floor during movement reduces discomfort

**Developer testing protocol:**
- Test with VR-naive users (not just the dev team, who have developed "VR legs")
- Minimum 20-minute test sessions — sickness often appears after 10-15 minutes of continuous play
- Include a post-session questionnaire (Simulator Sickness Questionnaire / SSQ)
- Track drop-off points where testers request to stop
- Any feature that causes 20%+ of testers to report discomfort must be optional or removed

### VR-Specific Certification Requirements

Platform holders impose VR-specific certification requirements beyond standard console certification:

**Meta Quest Store requirements:**
- Must maintain 72 Hz or 90 Hz with zero dropped frames during normal gameplay
- Must not render anything closer than 0.5 m to the camera (causes eye strain)
- Must include a "recenter" option accessible at any time
- Must pause when the headset is removed (proximity sensor)
- Must render a passthrough or guardian boundary when the player approaches play area edges
- Must include comfort rating metadata in the store listing
- Must not artificially move the camera without player input (no forced camera animations, no cutscenes that rotate the player)

**PlayStation VR2 requirements:**
- Must support 90 Hz minimum; 120 Hz mode recommended for fast-paced games
- Must implement reprojection correctly (Sony provides the SDK)
- Must use eye-tracking-based foveated rendering (PlayStation SDK provides the API)
- Must support the Sense controller haptics (adaptive triggers, haptic feedback)
- Must implement the "cinematic mode" fallback for non-VR displays
- Must display health and safety warnings at first launch

**Apple visionOS requirements:**
- Must use RealityKit or Metal with the Compositor Services API
- Must support Shared Space (runs alongside other apps) or Full Space (exclusive VR mode)
- Must implement passthrough correctly — never render over the user's real environment without explicit consent
- Must support eye-and-pinch interaction as the primary input method
- Must handle "Digital Crown" press to return to the home view
- Must not cause the system thermal throttling warning (sustained thermal headroom)

### AR-Specific Design Considerations

AR overlays virtual content onto the real world, introducing unique constraints:

**Spatial anchoring:**
- Virtual objects must be anchored to real-world surfaces (planes, walls, floors) detected by the device's scene understanding
- Anchors drift over time (1-5 cm per minute without re-localization)
- Save and restore anchors across sessions using persistent world maps (ARKit, ARCore, or OpenXR spatial anchors)
- Test on various surface types: glossy floors, textured carpet, low-light rooms, outdoor grass

**Lighting estimation:**
- AR devices estimate real-world lighting direction and intensity
- Virtual objects must match the real-world lighting to avoid looking "pasted on"
- Use the AR framework's light estimation API (ARKit provides ambient intensity + color temperature + directional light probes)
- Cast virtual shadows onto real-world surfaces for grounding

**Occlusion:**
- Real-world objects should occlude (block) virtual objects that are behind them
- LiDAR-equipped devices (iPhone Pro, iPad Pro, Vision Pro) provide depth maps for real-time occlusion
- Non-LiDAR devices can approximate with plane-based occlusion (objects behind detected floor/wall planes are hidden)
- Imperfect occlusion is more distracting than no occlusion — if the device cannot produce clean occlusion, consider disabling it

**Interaction distance:**
- AR content at arm's length (0.3-1.0 m) works for tabletop experiences and close-up inspection
- AR content at room scale (1-5 m) works for furniture placement, navigation overlays
- AR content beyond 5 m has significant tracking drift and parallax issues on phone-based AR
- Head-mounted AR (Vision Pro, HoloLens) handles distance better due to stereoscopic depth

### Performance Profiling for VR

Standard profiling tools miss VR-specific issues. Use platform-specific VR profilers:

```
Platform        | Profiling Tool              | Key Metrics
────────────────┼─────────────────────────────┼─────────────────────────────
Quest 3         | Meta Quest Developer Hub    | FPS, GPU utilization %,
                | (MQDH) + OVR Metrics Tool   | CPU/GPU frame time,
                |                             | thermal state, foveation level
────────────────┼─────────────────────────────┼─────────────────────────────
PC VR           | SteamVR Frame Timing        | Frame time, reprojection %,
                | + fpsVR + GPU vendor tools  | GPU/CPU bound indicator,
                | (Nsight, RenderDoc)         | motion-to-photon latency
────────────────┼─────────────────────────────┼─────────────────────────────
PSVR2           | PlayStation Performance     | Frame time per eye,
                | Analyzer (Razor)            | foveated rendering savings,
                |                             | Sense controller haptic load
────────────────┼─────────────────────────────┼─────────────────────────────
Vision Pro      | Xcode Instruments +         | Render pipeline timeline,
                | RealityKit Trace            | thermal headroom %,
                |                             | compositor latency
```

**Key VR profiling metrics:**
- **Frame time (per eye)**: Must stay under the frame budget (11.1 ms at 90 Hz)
- **Reprojection/timewarp ratio**: Percentage of frames that required reprojection. Above 5% indicates consistent performance problems. Above 20% causes visible artifacts.
- **Thermal state**: Mobile VR (Quest) throttles GPU/CPU when overheating. Monitor thermal headroom and reduce quality settings proactively before thermal throttling kicks in.
- **Draw call count**: VR amplifies draw call overhead because each call may be issued twice (once per eye, unless using single-pass stereo). Batch aggressively.
- **Shader complexity**: Profile per-pixel shader cost. In VR, the pixel count is 2-3x a 1080p flat-screen game, so expensive fragment shaders hit much harder.
