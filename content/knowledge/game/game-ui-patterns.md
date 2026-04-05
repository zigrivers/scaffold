---
name: game-ui-patterns
description: HUD patterns, menu hierarchy, controller-first navigation, settings screens, split-screen adaptation, and in-game commerce flows
topics: [game-dev, ui, hud, menus, controller-navigation, settings]
---

Game UI serves two fundamentally different purposes simultaneously: it must convey critical gameplay information without obscuring the game world (the HUD), and it must provide navigable menu systems that work equally well with mouse, gamepad, touch, and keyboard (the menu layer). Unlike web or mobile app UI where mouse/touch is assumed, game UI must be designed controller-first for any title shipping on console — focus management, D-pad navigation flow, and button prompt adaptation are not optional features bolted on later but architectural decisions made at the start of UI development.

## Summary

### HUD Design Patterns

The HUD (Heads-Up Display) is the persistent or semi-persistent overlay that conveys gameplay state during active play. Four primary HUD philosophies exist, and most games blend them:

1. **Minimal HUD** — Shows only essential information (health, ammo) in small, unobtrusive elements at screen edges. Maximizes immersion. Used in narrative games, horror, exploration titles. Examples: Journey, Limbo, Inside.

2. **Contextual HUD** — Elements appear only when relevant and fade when not needed. Health bar appears when damaged and fades after recovery. Ammo count appears when weapon is drawn. Reduces visual noise while maintaining information access. Examples: Dead Space (contextual + diegetic), Horizon Zero Dawn.

3. **Diegetic HUD** — Information is embedded in the game world itself rather than overlaid on the screen. Health displayed on the character's back (Dead Space), ammo on the weapon model, map as a physical object the character holds. Maximum immersion but limited information density and potential readability issues.

4. **Meta HUD** — Traditional full-screen overlay with persistent bars, numbers, and icons. Health bar, mana bar, minimap, quest tracker, cooldown indicators, buff timers all visible simultaneously. Maximizes information density at the cost of screen real estate. Standard for MMOs, MOBAs, strategy games, complex RPGs. Examples: World of Warcraft, Diablo, League of Legends.

### HUD Element Placement Conventions

Screen regions have established conventions that players have internalized over decades:

- **Top-left**: Health, shields, player status — the first place players look for survival information
- **Top-right**: Minimap, compass, or objective markers — spatial/navigation information
- **Bottom-left**: Chat, text log, or interaction prompts in multiplayer games
- **Bottom-right**: Ammo, ability cooldowns, weapon status — action-related information
- **Bottom-center**: Action bar, hotbar, or quick-access abilities (MMO/ARPG pattern)
- **Center**: Crosshair, hit markers, interaction prompts (contextual, appears and disappears)
- **Top-center**: Notifications, boss health bars, objective updates (temporary)
- **Screen edges**: Damage direction indicators (red vignette or directional arrows)

Breaking these conventions is possible but creates a learning curve. Document any non-standard placement decisions and validate with playtesting.

### Menu Hierarchy Conventions

Game menus follow a standard hierarchy that players expect:

- **Main Menu**: New Game, Continue, Load Game, Options/Settings, Credits, Quit
- **Pause Menu**: Resume, Settings, Save, Load, Quit to Main Menu
- **Settings**: Graphics, Audio, Controls, Gameplay, Accessibility (each a sub-screen)
- **Inventory/Character**: Equipment, Stats, Skills/Abilities, Crafting, Quest Log
- **Map**: World map, area map, fast travel, markers/waypoints
- **Social/Multiplayer**: Friends list, party, clan/guild, matchmaking, leaderboards

### Controller-First Navigation

Controller navigation requires explicit focus management — there is no cursor to hover arbitrary elements. Every interactive element must be reachable via D-pad movement in a logical spatial flow.

**Core principles:**
- Every screen has exactly one focused element at all times
- D-pad movement follows spatial layout (up goes to the element above, left goes to the element to the left)
- Wrap-around is optional but should be consistent (if right wraps on one screen, it should wrap on all screens)
- Confirm (A/Cross) and Back (B/Circle) must work on every screen without exception
- Shoulder buttons (L1/R1) switch between tabs or major sections
- The "Back" action should always return to the parent screen — never trap the player

## Deep Guidance

### Focus Management Architecture

Controller navigation requires a focus system that tracks which UI element is currently selected and handles directional input to move focus.

```csharp
// FocusManager.cs — Controller-first UI focus management
// Attach to a root UI canvas; manages focus across all child elements

using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using System.Collections.Generic;

public class FocusManager : MonoBehaviour
{
    [Header("Focus Settings")]
    [SerializeField] private float inputRepeatDelay = 0.4f;
    [SerializeField] private float inputRepeatRate = 0.1f;
    [SerializeField] private AudioClip focusMoveSound;
    [SerializeField] private AudioClip confirmSound;
    [SerializeField] private AudioClip backSound;

    private Selectable _currentFocus;
    private float _nextInputTime;
    private Stack<Selectable> _focusHistory = new();

    public Selectable CurrentFocus => _currentFocus;

    /// <summary>
    /// Set initial focus when a screen opens.
    /// Call this from every menu screen's OnEnable.
    /// </summary>
    public void SetInitialFocus(Selectable element)
    {
        if (element == null) return;

        _currentFocus = element;
        EventSystem.current.SetSelectedGameObject(element.gameObject);
        HighlightElement(element);
    }

    /// <summary>
    /// Push current focus onto history stack before navigating
    /// to a sub-menu. Call RestoreFocus() when returning.
    /// </summary>
    public void PushFocus()
    {
        if (_currentFocus != null)
            _focusHistory.Push(_currentFocus);
    }

    /// <summary>
    /// Restore focus to the element that was active before
    /// the sub-menu was opened.
    /// </summary>
    public void RestoreFocus()
    {
        if (_focusHistory.Count > 0)
        {
            var previous = _focusHistory.Pop();
            if (previous != null && previous.gameObject.activeInHierarchy)
                SetInitialFocus(previous);
        }
    }

    private void Update()
    {
        // Guard: only process when a UI element is focused
        if (_currentFocus == null) return;

        // Ensure EventSystem selection stays in sync
        if (EventSystem.current.currentSelectedGameObject != _currentFocus.gameObject)
        {
            var selected = EventSystem.current.currentSelectedGameObject;
            if (selected != null)
            {
                var selectable = selected.GetComponent<Selectable>();
                if (selectable != null)
                {
                    _currentFocus = selectable;
                    HighlightElement(selectable);
                }
            }
        }
    }

    private void HighlightElement(Selectable element)
    {
        // Visual feedback: scale pulse, outline, glow, etc.
        // Implementation depends on your UI style
        element.Select();
    }

    public void PlayNavigationSound()
    {
        if (focusMoveSound != null)
            AudioSource.PlayClipAtPoint(focusMoveSound, Vector3.zero, 0.5f);
    }
}
```

### D-Pad Navigation Flow Design

Designing D-pad flow requires thinking about UI layout as a grid or graph of navigable nodes, not as a freeform canvas.

**Grid-based layouts** (inventory, shop, skill tree):
- Arrange items in a strict grid
- D-pad moves exactly one cell in the pressed direction
- Wrap behavior: horizontal wrap within rows, vertical wrap optional
- When navigating off the grid edge, focus moves to the nearest adjacent panel element

**List-based layouts** (settings, save slots, quest log):
- Up/Down scrolls through list items
- Left/Right may adjust values (sliders, toggles) or switch panels
- Scrolling long lists: move focus to the last visible item, then scroll the list while keeping focus on the bottom-visible element

**Tab-based layouts** (settings categories, inventory tabs):
- L1/R1 (or shoulder bumpers) switch between tabs
- Focus resets to the first element of the new tab (or remembers last position per tab)
- Visual indicator shows which tab is active

**Radial menus** (weapon wheels, ability selectors):
- Right stick position maps to a sector of the wheel
- Release to confirm selection
- Highlight follows stick direction in real time
- Works poorly with D-pad — provide an alternative sequential selection

### Settings Screen Structure

A well-organized settings screen follows industry conventions that players expect. Each category should be a tab accessible via shoulder buttons.

**Graphics settings (PC — console exposes a subset):**

```yaml
graphics_settings:
  display:
    - resolution: [dropdown, system-detected options]
    - display_mode: [fullscreen, borderless, windowed]
    - v_sync: [off, on, adaptive]
    - frame_rate_limit: [30, 60, 120, 144, unlimited]
    - hdr: [off, on]  # only if display supports it
    - monitor_selection: [dropdown, numbered]

  quality_presets:
    - preset: [low, medium, high, ultra, custom]
    # Selecting a preset fills all values below
    # Changing any individual value switches preset to "custom"

  rendering:
    - texture_quality: [low, medium, high, ultra]
    - shadow_quality: [off, low, medium, high, ultra]
    - shadow_distance: [slider, meters]
    - anti_aliasing: [off, FXAA, TAA, MSAA_2x, MSAA_4x]
    - ambient_occlusion: [off, SSAO, HBAO+]
    - global_illumination: [off, screen-space, Lumen/RT]
    - reflection_quality: [off, SSR, RT_reflections]
    - volumetric_effects: [off, low, high]
    - post_processing: [low, medium, high]
    - view_distance: [slider, low-ultra]
    - foliage_density: [low, medium, high, ultra]
    - particle_quality: [low, medium, high]
    - motion_blur: [off, low, medium, high]
    - depth_of_field: [off, on]
    - film_grain: [off, on, slider]
    - chromatic_aberration: [off, on]

  performance_overlay:
    - show_fps: [off, on]
    - show_gpu_temp: [off, on]  # if available
    - show_frame_time: [off, on]
```

**Audio settings:**

```yaml
audio_settings:
  volume:
    - master: [slider, 0-100]
    - music: [slider, 0-100]
    - sfx: [slider, 0-100]
    - voice: [slider, 0-100]
    - ambient: [slider, 0-100]
    - ui: [slider, 0-100]

  output:
    - speaker_setup: [stereo, 5.1, 7.1, headphones]
    - dynamic_range: [full, night_mode, compressed]  # night mode = reduced dynamic range
    - spatial_audio: [off, platform_default, Dolby_Atmos]

  subtitles:
    - show_subtitles: [off, dialogue_only, all_audio]
    - subtitle_size: [small, medium, large, extra_large]
    - subtitle_background: [off, translucent, opaque]
    - speaker_name: [off, on]
    - sound_captions: [off, on]  # "[footsteps approaching]", "[explosion]"
```

**Controls settings:**

```yaml
controls_settings:
  controller:
    - invert_y_axis: [off, on]
    - sensitivity_horizontal: [slider]
    - sensitivity_vertical: [slider]
    - aim_sensitivity_multiplier: [slider]  # separate from look sens
    - dead_zone_inner: [slider, 0.05-0.30]
    - dead_zone_outer: [slider, 0.85-0.99]
    - vibration: [off, on]
    - vibration_intensity: [slider, 0-100]
    - trigger_effect: [off, on]  # DualSense adaptive triggers
    - button_layout: [default, southpaw, custom_remap]

  keyboard_mouse:
    - mouse_sensitivity: [slider]
    - mouse_acceleration: [off, on]  # default OFF for games
    - key_bindings: [rebindable list of all actions]
    - swap_mouse_buttons: [off, on]

  accessibility:
    - hold_vs_toggle: [per-action setting: sprint, crouch, aim]
    - auto_aim_strength: [off, low, medium, high]
    - input_buffering: [slider, frames]
```

**Accessibility settings:**

```yaml
accessibility_settings:
  visual:
    - colorblind_mode: [off, protanopia, deuteranopia, tritanopia]
    - colorblind_intensity: [slider, 0-100]
    - screen_shake: [slider, 0-100]
    - camera_bob: [off, reduced, full]
    - flash_reduction: [off, on]
    - high_contrast_mode: [off, on]
    - ui_scale: [slider, 75-150%]
    - hud_opacity: [slider, 0-100%]

  audio:
    - mono_audio: [off, on]  # collapses stereo for single-ear hearing
    - visual_sound_indicators: [off, on]  # directional icons for sounds
    # Subtitle options from audio section also apply

  input:
    - one_handed_mode: [off, left, right]
    - auto_run: [off, on]
    - simplified_controls: [off, on]
    - qte_auto_complete: [off, on]  # skip quick-time events
    - aim_assist: [off, low, medium, high]
    - lock_on_targeting: [off, on]

  gameplay:
    - difficulty_at_any_time: [allow changing difficulty freely]
    - skip_puzzles: [off, on]
    - navigation_assist: [off, on]  # highlight path to objective
    - extended_timers: [off, on]  # double time limits
```

### Split-Screen UI Adaptation

Split-screen multiplayer requires UI that remains legible at half (or quarter) screen resolution.

**Adaptation strategies:**
- Scale HUD elements up proportionally (a health bar designed for 1920x1080 needs to be twice as large per-pixel at 960x1080 to remain readable)
- Reduce information density — show only critical HUD elements in split-screen, hide secondary information
- Reposition elements to avoid the split boundary — no element should be clipped by the screen split
- Pause menus in split-screen: either pause for all players (simpler) or overlay the paused player's menu over their viewport only (more complex but doesn't interrupt other players)

**Minimap in split-screen:**
- Reduce minimap size or replace with a compass bar (horizontal strip showing cardinal directions and objectives)
- Consider a shared overview map that any player can request, pausing the game

### Damage Direction Indicators

Players need to know where damage is coming from. Common patterns:

- **Screen-edge vignette**: Red tint on the edge of the screen closest to the damage source. Simple, non-intrusive, but imprecise in 3D space.
- **Directional arc indicators**: Small UI arcs around the crosshair pointing toward the damage source. More precise, standard in shooters.
- **Hit markers**: Small X or chevrons at screen center confirming outgoing damage. Critical feedback for shooter feel.
- **Damage numbers**: Floating numbers at the world-space hit location. Standard in RPGs and looter-shooters.

### Quest and Objective Tracking

Quest tracking UI must handle varying quest complexity without overwhelming the player.

**Single active quest highlight:**
- Show only the currently tracked quest's next objective
- Objective marker in the world (waypoint, GPS line, compass marker)
- Minimal HUD text: quest name + current step
- Players manually switch tracked quest

**Multi-quest tracker:**
- Side panel (typically right edge) listing 3–5 active quests with current objectives
- Each quest color-coded by type (main story, side quest, daily, etc.)
- World markers for all tracked quests with distance indicators
- Risk: visual clutter when multiple markers overlap — use priority stacking and distance-based filtering

### In-Game Commerce and Store Flows

For games with microtransactions or in-game stores, the UI flow must be clear, non-deceptive, and compliant with platform regulations.

**Store UI principles:**
- Always display the real-money cost in local currency alongside any virtual currency cost
- Show the item clearly (3D preview, zoom, rotate) before purchase
- Two-step purchase confirmation: select item, then confirm on a separate dialog
- Clearly distinguish between items purchasable with earned currency vs premium currency vs real money
- Bundle pricing must show individual item values for comparison
- Owned items must be clearly marked (grayed out, "Owned" badge) to prevent accidental duplicate purchase
- Purchase history accessible from the store screen

**Platform compliance:**
- Apple App Store and Google Play require in-app purchase via their payment systems (30% revenue share) for digital goods
- Console stores (PlayStation Store, Xbox Store, Nintendo eShop) have similar requirements
- Loot box / randomized reward probabilities must be disclosed in many jurisdictions (China, Belgium, Netherlands — and expanding)
- Age-gating for purchase flows may be required depending on jurisdiction and content rating
- Parental controls must be respected — if a platform's parental controls restrict purchases, the game must honor that

### Button Prompt System

Games shipping on multiple platforms must display the correct button prompts for the currently active input device.

**Implementation requirements:**
- Detect input device change in real time (player switches from controller to keyboard mid-game)
- Swap all on-screen button prompts within one frame of the input device change
- Support at minimum: Xbox controller, PlayStation controller, Nintendo controller, keyboard+mouse
- Use platform-appropriate iconography (Xbox A button is green circle, PlayStation Cross is blue X, etc.)
- For PC: detect specific controller type via input system (Steam Input, XInput, DirectInput) and show correct brand icons
- For text prompts (e.g., "Press [Interact]"), use the action name mapped to the current binding, not a hardcoded key name

```gdscript
# Godot — Dynamic button prompt system
# Detects active input device and returns correct prompt texture

extends Node

enum InputDevice { KEYBOARD, XBOX, PLAYSTATION, SWITCH }

var current_device: InputDevice = InputDevice.KEYBOARD
var _last_input_frame: int = 0

# Prompt texture paths organized by device and action
var prompt_textures := {
    InputDevice.KEYBOARD: {
        "interact": "res://ui/prompts/kb_e.png",
        "jump": "res://ui/prompts/kb_space.png",
        "attack": "res://ui/prompts/mouse_left.png",
        "back": "res://ui/prompts/kb_esc.png",
    },
    InputDevice.XBOX: {
        "interact": "res://ui/prompts/xbox_a.png",
        "jump": "res://ui/prompts/xbox_a.png",
        "attack": "res://ui/prompts/xbox_x.png",
        "back": "res://ui/prompts/xbox_b.png",
    },
    InputDevice.PLAYSTATION: {
        "interact": "res://ui/prompts/ps_cross.png",
        "jump": "res://ui/prompts/ps_cross.png",
        "attack": "res://ui/prompts/ps_square.png",
        "back": "res://ui/prompts/ps_circle.png",
    },
    InputDevice.SWITCH: {
        "interact": "res://ui/prompts/switch_b.png",  # Note: A/B swapped
        "jump": "res://ui/prompts/switch_b.png",
        "attack": "res://ui/prompts/switch_y.png",
        "back": "res://ui/prompts/switch_a.png",
    },
}

signal device_changed(new_device: InputDevice)

func _input(event: InputEvent) -> void:
    var detected := current_device
    if event is InputEventKey or event is InputEventMouseButton:
        detected = InputDevice.KEYBOARD
    elif event is InputEventJoypadButton or event is InputEventJoypadMotion:
        detected = _detect_controller_type()

    if detected != current_device:
        current_device = detected
        device_changed.emit(current_device)

func _detect_controller_type() -> InputDevice:
    var joy_name := Input.get_joy_name(0).to_lower()
    if "playstation" in joy_name or "dualsense" in joy_name or "dualshock" in joy_name:
        return InputDevice.PLAYSTATION
    elif "nintendo" in joy_name or "pro controller" in joy_name:
        return InputDevice.SWITCH
    return InputDevice.XBOX  # Default fallback for XInput/generic

func get_prompt_texture(action: String) -> Texture2D:
    if current_device in prompt_textures:
        var device_prompts: Dictionary = prompt_textures[current_device]
        if action in device_prompts:
            return load(device_prompts[action])
    # Fallback to keyboard
    return load(prompt_textures[InputDevice.KEYBOARD].get(action, ""))
```

### HUD Scaling and Safe Zones

Console displays and televisions have "overscan" areas near the screen edges that may be cropped. Platform certification requires all critical UI to be within the safe zone.

**Safe zone standards:**
- **Action safe area**: 90% of screen (5% inset from each edge) — all interactive/critical UI elements must be within this area
- **Title safe area**: 80% of screen (10% inset) — text and important static information should be within this area
- Both PlayStation and Xbox certification require respecting safe areas
- PC games should offer a "safe zone adjustment" slider in settings for TV-connected setups

**HUD scale options:**
- Provide a HUD scale slider (75%–150%) in accessibility or UI settings
- Scale relative to the screen's shorter dimension to maintain proportions across aspect ratios
- Test at minimum at 720p, 1080p, 1440p, and 4K to ensure readability at all resolutions
