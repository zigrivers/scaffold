---
name: game-input-systems
description: Input abstraction patterns, action mapping, dead zones, aim assist, haptic feedback, cross-play fairness, and accessibility
topics: [game-dev, input, controls, rebinding, haptics, accessibility]
---

The input system is the player's sole interface with the game world. Every millisecond of input latency, every unintuitive binding, and every inaccessible control scheme directly erodes the player's experience. A well-designed input system abstracts hardware differences behind a unified action layer, supports rebinding without code changes, handles device hotswap gracefully, and provides accessibility options that let every player engage with the game. Input systems are deceptively complex — the gap between "reading a button press" and "shipping a polished, accessible, cross-platform input system" is enormous.

## Summary

### Input Abstraction Architecture

Never read hardware inputs directly in gameplay code. Instead, build a three-layer abstraction:

1. **Hardware Layer**: Reads raw input from devices (keyboard, mouse, gamepad, touch, motion). This is the only layer that knows about specific hardware APIs (XInput, DirectInput, HID, touchscreen events).

2. **Action Mapping Layer**: Maps raw inputs to semantic actions. "Press A button" or "Press Space bar" both map to the action "Jump." This layer handles rebinding, combo detection, input buffering, and modifier keys. Actions are defined in data (config files), not code.

3. **Gameplay Layer**: Reads only actions, never raw inputs. Gameplay code asks "is the Jump action active?" not "is the space bar pressed?" This separation means the same gameplay code works across all input devices without modification.

### Dead Zones and Sensitivity

Analog sticks have manufacturing variance — they may not return exactly (0,0) at rest. Dead zones prevent this drift from causing unwanted input.

- **Axial dead zone**: Apply dead zone independently to each axis. Simple but creates a diamond-shaped dead zone that can eat diagonal input near the center.
- **Radial dead zone**: Apply dead zone to the magnitude of the stick vector. Creates a circular dead zone that preserves diagonal input direction. Preferred for most games.
- **Default inner dead zone**: 0.15–0.25 (15–25% of stick range). Too small = stick drift; too large = lost precision near center.
- **Outer dead zone**: 0.90–0.95. Analog sticks rarely reach perfect 1.0 at the edge. The outer dead zone maps the usable range to 0.0–1.0 so players can achieve maximum input.

After applying dead zones, **rescale** the remaining range to 0.0–1.0 so gameplay code receives the full input range.

Sensitivity curves (response curves) map the rescaled stick input to gameplay speed:
- **Linear**: Output = Input. Simple, predictable, but may feel too fast near the edge.
- **Quadratic**: Output = Input^2. Slower near center for precision aiming, faster at edge. Most common default.
- **Custom curve**: Expose a curve editor in settings for players who want fine control.

### Aim Assist and Aim Friction

Controller players in shooters need aim assist to compete with mouse precision. Aim assist is not "cheating" — it compensates for the physical limitations of thumbsticks.

**Aim assist types:**
- **Bullet magnetism**: Shots that miss by a small margin are redirected to hit the target. Invisible to the player. Typically 2–5 degrees of correction.
- **Reticle friction / aim slowdown**: Sensitivity decreases when the reticle is near a valid target, making it easier to track. The player feels like they are aiming well.
- **Target snap / aim lock**: Briefly snaps the reticle toward a target when aiming down sights. Used sparingly — too aggressive feels like the game is playing itself.
- **Rotation assist**: Slightly rotates the player's view to track a moving target that passes through the reticle area.

**Tuning rules:**
- Aim assist should be strongest on controller and weakest (or absent) on mouse
- Never apply aim assist to mouse input — mouse players perceive it as interference
- Scale aim assist with difficulty level (higher assist on easier difficulties)
- Disable or reduce aim assist in competitive multiplayer when fairness matters more than accessibility
- Expose aim assist strength as a player setting (0–100%)

### Cross-Play Input Fairness

When keyboard/mouse and controller players compete in the same lobby, input disparity creates balance problems. Mouse has superior precision; controller has aim assist compensation.

**Strategies:**
- **Input-based matchmaking**: Match controller players with controller players and KB/M with KB/M by default. Allow opt-in to mixed lobbies.
- **Input detection**: Detect input device changes mid-match (player switches from controller to KB/M). Either lock the detected input type for the match or adjust aim assist immediately.
- **Separate leaderboards**: Maintain input-type-specific rankings when input method significantly affects competitive performance.
- **Asymmetric aim assist**: Controller players receive aim assist; KB/M players do not. This is the standard approach in cross-play shooters.

## Deep Guidance

### Action Mapping System

```typescript
// Input abstraction: Hardware -> Action Mapping -> Gameplay

// --- Action Definitions (data-driven) ---

enum ActionType {
  Button,    // Discrete: pressed, released, held
  Axis1D,   // Continuous scalar: -1 to 1 (triggers, single stick axis)
  Axis2D,   // Continuous vector: { x, y } (stick, mouse delta)
}

interface ActionBinding {
  action: string;              // "Jump", "Move", "Fire", "AimDirection"
  type: ActionType;
  bindings: InputBinding[];    // Multiple bindings per action (KB + gamepad)
  modifiers?: string[];        // Required modifier actions (e.g., "Sprint" + "Jump")
}

interface InputBinding {
  device: "keyboard" | "mouse" | "gamepad" | "touch";
  input: string;               // "Space", "ButtonSouth", "LeftStick", etc.
  scale?: number;              // For axis inversion: -1 inverts
  deadZone?: number;           // Override per-binding dead zone
}

// Example action map (would be loaded from JSON/YAML config)
const defaultActionMap: ActionBinding[] = [
  {
    action: "Move",
    type: ActionType.Axis2D,
    bindings: [
      { device: "gamepad", input: "LeftStick" },
      // WASD mapped to 2D axis via composite
      { device: "keyboard", input: "Composite:W,S,A,D" },
    ],
  },
  {
    action: "Jump",
    type: ActionType.Button,
    bindings: [
      { device: "gamepad", input: "ButtonSouth" },  // A on Xbox, X on PS
      { device: "keyboard", input: "Space" },
    ],
  },
  {
    action: "Fire",
    type: ActionType.Button,
    bindings: [
      { device: "gamepad", input: "RightTrigger" },
      { device: "mouse", input: "LeftButton" },
    ],
  },
  {
    action: "AimDirection",
    type: ActionType.Axis2D,
    bindings: [
      { device: "gamepad", input: "RightStick" },
      { device: "mouse", input: "Delta" },
    ],
  },
];

// --- Input System Core ---

class InputSystem {
  private actionMap: ActionBinding[];
  private actionStates: Map<string, ActionState> = new Map();
  private rebinds: Map<string, InputBinding[]> = new Map();

  constructor(actionMap: ActionBinding[]) {
    this.actionMap = actionMap;
    for (const binding of actionMap) {
      this.actionStates.set(binding.action, {
        pressed: false,
        released: false,
        held: false,
        value: 0,
        axis2D: { x: 0, y: 0 },
      });
    }
  }

  // Called once per frame before gameplay update
  update(rawInputs: RawInputSnapshot): void {
    for (const binding of this.actionMap) {
      const state = this.actionStates.get(binding.action)!;
      const effectiveBindings = this.rebinds.get(binding.action)
        ?? binding.bindings;

      // Evaluate all bindings; take the one with highest magnitude
      let bestValue = 0;
      let bestAxis2D = { x: 0, y: 0 };

      for (const b of effectiveBindings) {
        const raw = rawInputs.get(b.device, b.input);
        if (raw === undefined) continue;

        if (binding.type === ActionType.Axis2D) {
          const vec = raw as { x: number; y: number };
          const deadZoned = this.applyRadialDeadZone(
            vec, b.deadZone ?? 0.2
          );
          if (magnitude(deadZoned) > magnitude(bestAxis2D)) {
            bestAxis2D = deadZoned;
          }
        } else {
          const val = (raw as number) * (b.scale ?? 1);
          if (Math.abs(val) > Math.abs(bestValue)) {
            bestValue = val;
          }
        }
      }

      // Update state transitions
      const wasHeld = state.held;
      state.held = binding.type === ActionType.Axis2D
        ? magnitude(bestAxis2D) > 0.01
        : Math.abs(bestValue) > 0.5;
      state.pressed = state.held && !wasHeld;
      state.released = !state.held && wasHeld;
      state.value = bestValue;
      state.axis2D = bestAxis2D;
    }
  }

  // Gameplay code reads actions, never raw inputs
  isPressed(action: string): boolean {
    return this.actionStates.get(action)?.pressed ?? false;
  }

  isHeld(action: string): boolean {
    return this.actionStates.get(action)?.held ?? false;
  }

  getAxis2D(action: string): { x: number; y: number } {
    return this.actionStates.get(action)?.axis2D ?? { x: 0, y: 0 };
  }

  // Runtime rebinding
  rebind(action: string, newBindings: InputBinding[]): void {
    this.rebinds.set(action, newBindings);
    this.saveRebinds(); // Persist to player prefs
  }

  private applyRadialDeadZone(
    input: { x: number; y: number },
    deadZone: number
  ): { x: number; y: number } {
    const mag = magnitude(input);
    if (mag < deadZone) return { x: 0, y: 0 };
    // Rescale remaining range to 0-1
    const rescaled = (mag - deadZone) / (1 - deadZone);
    const normalized = { x: input.x / mag, y: input.y / mag };
    return {
      x: normalized.x * rescaled,
      y: normalized.y * rescaled,
    };
  }

  private saveRebinds(): void { /* persist to localStorage/file */ }
}

interface ActionState {
  pressed: boolean;
  released: boolean;
  held: boolean;
  value: number;
  axis2D: { x: number; y: number };
}

interface RawInputSnapshot {
  get(device: string, input: string): number | { x: number; y: number } | undefined;
}

function magnitude(v: { x: number; y: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}
```

### Input Buffering

Input buffering accepts player inputs slightly before they would be valid and executes them at the first valid opportunity. This forgives imprecise timing and makes controls feel responsive.

**How it works:**
- When a player presses Jump while still in the air (e.g., 100 ms before landing), the input is stored in a buffer
- When the character lands, the buffer is checked — if a Jump input exists within the buffer window, the character immediately jumps
- Buffer window: typically 100–200 ms (6–12 frames at 60 fps)

**Where to apply buffering:**
- **Combat combos**: Buffer the next attack input during the current attack animation. Player presses "attack" during the swing of the first hit, and the second hit fires immediately when the first hit's recovery ends.
- **Platforming**: Buffer jump input during landing animation. Buffer wall-jump input during wall slide.
- **Dodge/roll**: Buffer dodge during attack recovery or hitstun.
- **Interaction**: Buffer "interact" input while walking toward an interactable object.

**Where NOT to apply buffering:**
- Menu navigation (buffer causes double-selection)
- Aim (buffered aim inputs create jittery movement)
- Anything where the "was this intentional?" ambiguity outweighs the responsiveness benefit

### Haptic Feedback Design

Modern controllers (DualSense, Switch Joy-Cons, Xbox Impulse Triggers) provide nuanced haptic feedback beyond simple rumble.

**DualSense (PS5) advanced haptics:**
- **Adaptive triggers**: Variable resistance on L2/R2. Simulate bowstring tension, trigger pull weight, brake resistance, mud/sand resistance.
- **HD haptics**: High-fidelity vibration motors that can simulate textures, impacts, and environmental feedback through the controller. Walking on gravel feels different from walking on metal.
- **Speaker**: The controller has a built-in speaker for close-proximity sound effects (walkie-talkie chatter, weapon click, UI confirmation).

**Nintendo Switch HD Rumble:**
- Linear resonant actuators provide frequency-specific vibration
- Can simulate the feeling of ice cubes in a glass, rolling a ball, or counting objects by feel
- Lower fidelity than DualSense but still far beyond binary rumble

**Haptic design principles:**
- Haptics should reinforce, not replace, visual and audio feedback
- Every player action that has a physical analog should have a haptic response (firing a weapon, landing from a jump, taking damage)
- Environmental haptics add immersion: rain, vehicle engine vibration, walking surface texture
- Intensity should scale with gameplay intensity — constant high-intensity rumble causes fatigue and numbness
- Always provide an option to disable haptics entirely and to adjust intensity (0–100%)
- Test haptic design with the controller in hand, not just as parameter values on screen

### Controller Disconnect Handling

Players disconnect controllers during gameplay (battery dies, cable pulled, Bluetooth interference). The game must handle this gracefully.

**Required behaviors:**
1. **Pause immediately**: When a controller disconnects during single-player gameplay, pause the game and display a reconnection prompt. Never let gameplay continue without input — the player will take damage, fall off ledges, or lose progress.
2. **Reconnect seamlessly**: When the controller reconnects, resume gameplay from the paused state. Do not require navigating a menu.
3. **Player identification**: In local multiplayer, track which controller belongs to which player. When controller 2 disconnects and reconnects, it must re-associate with player 2, not become a new player.
4. **Battery warning**: Display a low-battery warning before disconnection occurs. Platform APIs provide battery level (iOS: `UIDevice.batteryLevel`, Android: `BatteryManager`, PlayStation/Xbox SDK battery APIs).
5. **Save protection**: If the game auto-saves on a timer, do not auto-save during a disconnect state — the player may be in an invalid position (falling, taking damage).

### IME and Text Input

Text input in games is complex because it must handle hardware keyboards, on-screen keyboards, and Input Method Editors (IME) for CJK (Chinese, Japanese, Korean) languages.

**Keyboard text input:**
- Use the platform's text input API, not raw key events. Raw key events do not handle dead keys (accents), compose sequences, or IME.
- Support clipboard paste (Ctrl+V / Cmd+V) in all text fields.
- Handle key repeat rate (initial delay + repeat interval) for held keys in text fields.

**On-screen keyboards:**
- Mobile and console games must trigger the platform's on-screen keyboard when a text field is focused.
- Adjust the UI layout to prevent the on-screen keyboard from covering the active text field.
- Specify keyboard type per field: default, email, numeric, URL, password.

**IME support:**
- IME is required for CJK language input. The player types phonetic characters that are composed into ideographs through a candidate selection process.
- Display the IME composition string (the in-progress text) inline in the text field.
- Display the candidate list (possible character choices) near the text field.
- Do not consume keyboard events that the IME is processing — let the IME handle composition before the game receives the final character.
- Test IME input with native speakers — broken IME support is immediately obvious and blocks the game for millions of players in East Asian markets.

### Accessibility in Input Design

Accessible input design is a legal requirement in some markets (CVAA in the US for communication features, European Accessibility Act) and a moral imperative everywhere.

**Minimum accessibility requirements:**
- **Full rebinding**: Every action must be rebindable to any key/button. No hardcoded bindings.
- **One-handed play**: Provide control schemes that work with only the left or right side of the controller/keyboard.
- **Hold vs toggle**: Every "hold to sprint/aim/crouch" input must have a toggle alternative.
- **Stick sensitivity**: Expose dead zone size, sensitivity curve, and axis inversion as player settings.
- **Button mashing alternatives**: Replace button-mash QTEs with hold-to-fill or automatic alternatives.
- **Auto-aim**: Provide a strong auto-aim option for players who cannot use fine analog control.
- **Sequential inputs**: Allow combo inputs to be performed sequentially (one press at a time) rather than requiring simultaneous button presses.
- **Touch target size**: On mobile, interactive touch targets must be at least 44x44 points (Apple HIG) or 48x48 dp (Material Design).

**Beyond minimum:**
- Copilot mode: Two controllers control the same character (one player assists another)
- Switch/adaptive controller support: Ensure the game works with accessibility controllers (Xbox Adaptive Controller)
- Eye tracking input: Support Tobii and similar eye tracking devices as input sources
- Voice input: Support voice commands for basic actions (requires platform speech-to-text API)

### Input Latency Measurement

Input latency is the time from the player pressing a button to the corresponding visual change on screen. For competitive games, this must be as low as possible.

**Latency sources (cumulative):**
- Input polling: 0–8 ms (depends on polling rate: 1000 Hz USB = 1 ms, Bluetooth = 4–8 ms)
- Game simulation: 0–16.67 ms (depends on where in the frame the input is processed)
- Render pipeline: 16.67–33.33 ms (1–2 frames of render-ahead buffering)
- Display: 1–20 ms (monitor response time + display processing)
- Total typical: 40–80 ms (target < 60 ms for competitive games)

**Reducing input latency:**
- Poll input as late as possible in the frame (just before simulation, not at frame start)
- Minimize render-ahead buffers (trade GPU utilization for latency)
- Use "late latch" techniques: update camera/aim after the final input poll, just before GPU submission
- On PC, support NVIDIA Reflex / AMD Anti-Lag for driver-level latency reduction
- Measure with a high-speed camera (240+ fps) pointed at the display while pressing a button connected to an LED — count frames between LED and screen change

## Genre-Specific Input Patterns

### Touch and Mobile Input

Beyond minimum target sizes (44x44pt iOS, 48x48dp Android), mobile games need:

- **Virtual joystick**: Floating (appears at touch point) preferred over fixed. Dead zone: 10-15% of joystick radius. Visual feedback: thumb indicator follows touch position.
- **Gesture recognition**: Swipe threshold 50-100px to distinguish from taps. Multi-touch: track up to 5 simultaneous touches for action games, 2 for casual.
- **Auto-play patterns**: Common in mobile RPGs — tap to toggle auto-battle with manual override for skills. Implement as a state machine: Manual → Auto → Manual on any input.
- **Portrait vs landscape**: Design thumb-zone heat maps for each orientation. Critical actions within 60px of bottom corners.

### Strategy and Management Input

- **Box-select**: Click-drag rectangle, select all units inside. Add to selection with Shift+click. Deselect with right-click on empty space.
- **Command queuing**: Shift+right-click appends to command queue. Display queue as waypoint markers. Max queue depth: 10-20 commands.
- **Camera controls**: Edge scroll (mouse at screen edge), WASD pan, middle-mouse drag. Zoom: scroll wheel with min/max zoom limits. Minimap click-to-jump.

### Turn-Based Input

- **Select-confirm pattern**: Click to select, click again to confirm. Show preview of action result before confirmation. Undo: allow undo of last action if turn is not yet submitted.
- **Hover-preview**: On hover, show range/area-of-effect highlight. On select, show detailed outcome prediction.
