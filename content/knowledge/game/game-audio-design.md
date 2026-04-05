---
name: game-audio-design
description: Wwise vs FMOD selection, bus hierarchy, spatial audio, adaptive music systems, VO pipeline, and platform loudness targets
topics: [game-dev, audio, fmod, wwise, spatial-audio, adaptive-music]
---

Game audio is not background decoration — it is a primary feedback channel that communicates game state, spatial awareness, emotional tone, and mechanical timing to the player. A gunshot tells the player where the enemy is, how far away they are, and what weapon they are using. Adaptive music builds tension before the player consciously recognizes danger. Missing or poorly mixed audio creates a hollow, unfinished experience that players feel even if they cannot articulate why. Audio architecture decisions (middleware, bus hierarchy, adaptive systems) must be made early because they affect content pipelines, memory budgets, and CPU budgets throughout production.

## Summary

### Middleware Decision: Wwise vs FMOD

Both Wwise and FMOD are professional audio middleware that replace the engine's built-in audio system with far more capable tools. Choosing between them affects the audio team's workflow, licensing costs, and available features.

**FMOD Studio:**
- Lower learning curve; audio designers can be productive within days
- Generous indie licensing (free under $200K revenue)
- Clean C API with strong Unity and Unreal integration
- Event-based authoring with timeline and parameter-driven transitions
- Adequate spatial audio with listener-based panning and occlusion
- Good for indie through AA productions

**Wwise:**
- Steeper learning curve; full productivity takes weeks of training
- More complex licensing (free under $150K budget with limited sound count; tiered pricing above)
- Industry standard for AAA — most senior audio programmers have Wwise experience
- Superior spatial audio with Wwise Spatial Audio including room/portal modeling
- More powerful interactive music system (Music Segments, Stingers, Transitions)
- Advanced profiling tools (Wwise Profiler) for runtime debugging
- SoundSeed plugins for procedural audio (wind, impact, grain)

**Decision framework:**
- Team size 1–5 audio designers, budget under $500K: **FMOD**
- Team has AAA audio designers with Wwise experience: **Wwise**
- Game relies heavily on adaptive music and spatial audio as core mechanics: **Wwise**
- Rapid prototyping or game jam: **FMOD** (faster setup)
- Both are correct choices — the wrong choice is using the engine's built-in audio for a production game

### Bus / Mixer Hierarchy

Audio buses (mixer groups) organize sounds into categories for independent volume control, effects processing, and ducking. A well-designed bus hierarchy is the foundation of a clean mix.

Standard hierarchy:
- **Master** (output)
  - **Music** — adaptive score, menu music, stingers
  - **SFX** — gameplay sound effects
    - **Weapons** — gunshots, impacts, reload
    - **Footsteps** — per-surface, per-character
    - **Environment** — ambient beds, wind, rain, machinery
    - **UI** — button clicks, notifications, menu transitions
    - **Abilities** — spell effects, power-ups, special moves
  - **Voice** — dialogue, barks, VO
    - **Dialogue** — scripted narrative VO
    - **Barks** — contextual combat/exploration callouts
    - **Announcer** — game state announcements
  - **Cinematics** — pre-rendered or in-engine cutscene audio (overrides normal mix)

Each bus should have: volume fader, mute/solo, low-pass/high-pass filter, compressor, and ducking sidechain inputs.

### Loudness Standards

Platform holders and distribution channels enforce loudness standards. Non-compliant audio may cause certification failures.

- **Console (PlayStation, Xbox, Switch)**: -24 LUFS integrated, +/- 2 LU tolerance
- **PC (Steam, Epic)**: No enforcement, but -23 LUFS is the professional standard
- **Mobile (iOS, Android)**: Target -18 LUFS integrated (compensates for noisy environments and small speakers)
- **Streaming/Trailer**: -14 LUFS for YouTube/Twitch (louder to compete for attention)
- **VR**: -24 LUFS with very tight dynamic range (loud sounds in headphones cause discomfort)

Measure loudness with integrated LUFS metering over a representative gameplay session, not just peak levels. A game that averages -24 LUFS but has gunshots hitting -6 LUFS true peak will clip and distort.

### Spatial Audio Fundamentals

Spatial audio places sounds in 3D space relative to the listener (camera or player character). It enables the player to locate threats, allies, and objectives by ear.

Key concepts:
- **Attenuation**: Sound volume decreases with distance. Linear, logarithmic, or custom curves.
- **Panning**: Stereo or surround placement based on angle to listener.
- **Occlusion**: Sounds behind walls are muffled (low-pass filtered and attenuated).
- **Obstruction**: A partial barrier between source and listener (e.g., crate) partially filters the sound.
- **Reverb zones**: Different environments (cave, hallway, outdoor) apply different reverb characteristics.
- **HRTF (Head-Related Transfer Function)**: Simulates how human ears perceive directionality. Essential for headphone playback and VR.

## Deep Guidance

### Adaptive Music Systems

Adaptive music responds to gameplay state in real-time, creating a dynamic soundtrack that matches the player's experience rather than looping a fixed track.

**Horizontal re-sequencing:**
- Music is composed in segments (intro, low tension, high tension, victory, defeat)
- The music system selects and sequences segments based on game state
- Transitions between segments use crossfades, transition segments, or beat-synced cuts
- Example: exploration segment loops until combat starts, then transitions to combat segment on the next bar line

**Vertical layering (additive mixing):**
- A single musical passage has multiple layers recorded simultaneously (drums, bass, melody, strings, percussion)
- Layers are added or removed based on game intensity
- Exploration: drums + bass only. Approaching danger: add melody. Full combat: all layers
- Advantages: seamless transitions (no segment switch), consistent harmonic content
- Disadvantages: all layers must work in every combination, limiting compositional freedom

**Stingers:**
- Short musical phrases triggered by specific game events (boss appearance, treasure found, death)
- Play over the current music, typically ducking the score briefly
- Must be composed in a compatible key/tempo or be atonal enough to work over anything
- Budget 10–30 stingers per game; overuse makes them less impactful

**Implementation pattern:**

```csharp
// Adaptive music controller — vertical layering with FMOD parameters
// Attach to a persistent game object that survives scene loads

using UnityEngine;
using FMODUnity;
using FMOD.Studio;

public class AdaptiveMusicController : MonoBehaviour
{
    [SerializeField] private EventReference musicEvent;

    private EventInstance _musicInstance;
    private PARAMETER_ID _intensityParamId;
    private PARAMETER_ID _dangerParamId;

    // Intensity: 0.0 = calm exploration, 1.0 = full combat
    // Danger: 0.0 = safe, 1.0 = boss fight
    // These drive vertical layer activation in the FMOD event

    private float _currentIntensity;
    private float _targetIntensity;
    private const float IntensityLerpSpeed = 0.5f; // Smooth transitions

    private void Start()
    {
        _musicInstance = RuntimeManager.CreateInstance(musicEvent);

        // Cache parameter IDs for efficient per-frame updates
        EventDescription desc;
        _musicInstance.getDescription(out desc);

        PARAMETER_DESCRIPTION paramDesc;
        desc.getParameterDescriptionByName("Intensity", out paramDesc);
        _intensityParamId = paramDesc.id;
        desc.getParameterDescriptionByName("Danger", out paramDesc);
        _dangerParamId = paramDesc.id;

        _musicInstance.start();
    }

    private void Update()
    {
        // Smooth intensity transitions — avoid jarring mix changes
        _currentIntensity = Mathf.Lerp(
            _currentIntensity,
            _targetIntensity,
            IntensityLerpSpeed * Time.deltaTime
        );
        _musicInstance.setParameterByID(_intensityParamId, _currentIntensity);
    }

    // Called by combat system when threat level changes
    public void SetCombatIntensity(float intensity)
    {
        _targetIntensity = Mathf.Clamp01(intensity);
    }

    // Called when entering/exiting boss encounters
    public void SetDangerLevel(float danger)
    {
        _musicInstance.setParameterByID(_dangerParamId, danger);
    }

    // Trigger a stinger (one-shot musical phrase over the current score)
    public void PlayStinger(EventReference stingerEvent)
    {
        // FMOD handles ducking the score via sidechain in the mixer
        RuntimeManager.PlayOneShot(stingerEvent);
    }

    private void OnDestroy()
    {
        _musicInstance.stop(FMOD.Studio.STOP_MODE.ALLOWFADEOUT);
        _musicInstance.release();
    }
}
```

### Voice-Over Pipeline

Voice-over (VO) production is one of the most expensive and logistically complex aspects of game audio. A well-structured pipeline prevents re-records, miscast lines, and late-stage localization disasters.

**Pipeline stages:**
1. **Script finalization**: Lock dialogue text before casting. Every change after recording costs studio time.
2. **Casting**: Audition voice actors for each character. Record sample lines in the target emotional range.
3. **Recording sessions**: Professional studio with consistent microphone and room treatment. Record at 48 kHz / 24-bit WAV minimum.
4. **Editing**: Remove breaths (or reduce, not eliminate — breathless VO sounds robotic), normalize levels, remove noise. Apply consistent EQ per character.
5. **Implementation**: Import into middleware, assign to dialogue events, set up subtitles, configure lip-sync data.
6. **Localization**: Record all supported languages. Budget localization time equal to original language recording time.
7. **QA**: Playthrough with every language enabled, checking for missing lines, incorrect triggers, subtitle mismatches, and audio clipping.

**File naming convention:**
- `{character}_{scene}_{lineID}_{take}.wav`
- Example: `npc_merchant_shop_0042_01.wav`
- Consistent naming enables automated import pipelines and batch processing

**Memory management for VO:**
- VO is typically the largest single audio asset category (hours of recorded dialogue)
- Stream from disk rather than loading into memory (except for combat barks that need instant playback)
- Pre-load upcoming dialogue lines during gameplay based on narrative triggers
- Compress with Vorbis/Opus at 96–128 kbps for production, 48 kbps for low-memory platforms
- Unload VO banks when leaving a narrative area

### Audio Compression Per Platform

Different platforms have different memory, storage, and CPU constraints that affect audio format selection:

**Console (PS5, Xbox Series X, Switch):**
- Format: Platform-native compressed (Atrac9 on PlayStation, XMA on Xbox, ADPCM or Opus on Switch)
- Wwise/FMOD handle platform-specific encoding automatically during build
- Sample rate: 48 kHz for music and VO, 24 kHz acceptable for ambient SFX
- Channels: 5.1 or 7.1 master output for home theater; stereo for handheld Switch

**PC:**
- Format: Vorbis or Opus for compressed, PCM for low-latency SFX
- Sample rate: 48 kHz standard
- Channels: Support stereo, 5.1, and 7.1 output; detect and configure at runtime
- PC has the most memory headroom — use higher quality compression settings

**Mobile:**
- Format: AAC (iOS native), Vorbis/Opus (Android), ADPCM for low-latency SFX
- Sample rate: 44.1 kHz or 24 kHz to save memory
- Channels: Stereo only (mono for non-spatial SFX to halve memory)
- Aggressive compression: 64–96 kbps for music, 48 kbps for VO
- Budget total audio memory at 50–100 MB (compared to 500+ MB on console)

### Sound Design Patterns for Gameplay

**Layered SFX construction:**
- Build complex sounds from multiple simple layers: a gunshot = transient (click/snap) + body (boom/crack) + tail (reverb/echo) + mechanical (bolt action)
- Each layer can vary independently for variety: 5 transients x 5 bodies x 3 tails = 75 unique combinations from 13 assets
- Randomize pitch (+/- 2 semitones) and volume (+/- 2 dB) per playback for further variation
- Never play the same exact sound twice in a row — the brain detects repetition instantly

**Priority and voice stealing:**
- Audio hardware has a limited number of simultaneous voices (typically 32–256 virtual voices)
- When the limit is reached, the system must steal the lowest-priority voice
- Priority order (highest to lowest): player weapon fire > VO dialogue > nearby enemy SFX > music > distant ambient
- Implement a priority system in middleware; configure max instances per event type (e.g., max 4 simultaneous footstep voices)

**Ducking and sidechain:**
- When important audio plays (VO, critical UI), duck less important buses (music, ambient)
- Implement via sidechain compression on the music bus keyed to the VO bus
- Duck by 6–12 dB during dialogue; fade duck in/out over 200–500 ms to avoid pumping artifacts
- Avoid ducking SFX during gameplay — players need spatial awareness from SFX even during dialogue

### Reverb and Environment Design

```yaml
# Reverb zone presets — configure per-area in the game world
# Values are approximate starting points; tune by ear in-game

reverb_presets:
  outdoor_open:
    decay_time: 0.8s
    pre_delay: 10ms
    wet_mix: 0.15
    diffusion: 0.7
    hf_damping: 0.3
    notes: "Minimal reverb; sounds dissipate quickly"

  outdoor_canyon:
    decay_time: 2.5s
    pre_delay: 40ms
    wet_mix: 0.35
    diffusion: 0.5
    hf_damping: 0.4
    notes: "Distinct echoes, longer decay, directional reflections"

  indoor_small_room:
    decay_time: 0.5s
    pre_delay: 5ms
    wet_mix: 0.25
    diffusion: 0.8
    hf_damping: 0.5
    notes: "Tight, intimate; voices feel close"

  indoor_large_hall:
    decay_time: 3.0s
    pre_delay: 25ms
    wet_mix: 0.45
    diffusion: 0.9
    hf_damping: 0.3
    notes: "Cavernous; footsteps echo, VO needs ducking"

  underground_cave:
    decay_time: 4.0s
    pre_delay: 15ms
    wet_mix: 0.55
    diffusion: 0.6
    hf_damping: 0.6
    notes: "Heavy reverb, muffled high end, dripping emphasis"

  underwater:
    decay_time: 0.3s
    pre_delay: 0ms
    wet_mix: 0.7
    diffusion: 1.0
    hf_damping: 0.9
    low_pass_cutoff: 800Hz
    notes: "Extreme LPF, muted, disorienting"

  metal_corridor:
    decay_time: 1.2s
    pre_delay: 8ms
    wet_mix: 0.35
    diffusion: 0.4
    hf_damping: 0.1
    notes: "Bright, ringing, metallic character"

# Implementation notes:
# - Blend between presets when crossing zone boundaries (over 0.5-1 second)
# - Use ray-traced or portal-based occlusion for realistic transitions
# - Wwise Rooms/Portals automate zone blending; FMOD uses snapshot blending
# - Apply reverb as a send effect, not an insert, to maintain dry signal clarity
```

### Audio Testing Checklist

Before shipping, verify the following across all target platforms:

1. **Loudness compliance**: Measure integrated LUFS over a 30-minute representative session. Must be within platform tolerance.
2. **Clipping/distortion**: Play the loudest possible gameplay scenario (explosion chain, multiple weapons, full music). No digital clipping on the master bus.
3. **Missing audio**: Walk through every game state and transition. No silent gaps where audio should play.
4. **Spatial accuracy**: Can the player locate enemies by sound alone with eyes closed? Test with headphones and speakers.
5. **Ducking behavior**: Is dialogue always audible? Does music duck appropriately? Do critical gameplay sounds cut through?
6. **Memory budget**: Monitor audio memory throughout a full play session. No leaks, no budget overruns.
7. **CPU budget**: Audio should consume less than 10% of a single CPU core. Profile during the most audio-dense gameplay moment.
8. **Platform output**: Test stereo, 5.1, 7.1, and headphone output on each platform. Verify surround panning works correctly.
9. **Interruption handling**: On mobile, verify correct behavior when a phone call, alarm, or notification interrupts. Audio should pause and resume cleanly.
10. **Localization**: Every localized VO line plays correctly, subtitles match, lip-sync is acceptable in all supported languages.
