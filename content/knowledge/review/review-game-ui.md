---
name: review-game-ui
description: Failure modes and review passes specific to game UI specifications — HUD hierarchy, menu navigation, controller accessibility, settings coverage, FTUE effectiveness, state machine completeness, and platform shell compliance
topics: [game-dev, review, ui, hud, menus, controller, accessibility, ftue]
---

# Review: Game UI Specification

A game UI specification must translate game mechanics into clear, navigable, accessible interfaces. It must be hierarchical (HUD elements prioritized by gameplay criticality), complete (every menu has a path back, no dead ends), accessible (every screen reachable with controller), configurable (settings cover graphics, audio, controls, accessibility), and platform-compliant (system UI respects console certification requirements). This review uses 7 passes targeting the specific ways game UI specifications fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — HUD Information Hierarchy**: HUD elements are prioritized by gameplay criticality; health, ammo, and objective markers are visible at a glance; non-critical information is layered or hidden behind contextual triggers.
- **Pass 2 — Menu Completeness & Navigation**: Every menu has a path back, no dead ends exist, breadcrumb trail is clear, and the menu tree covers all player-facing systems without orphaned screens.
- **Pass 3 — Controller Accessibility**: Every screen is reachable with D-pad, focus order follows spatial layout, shoulder buttons switch tabs, and no interaction requires mouse/touch to complete.
- **Pass 4 — Settings Coverage**: Graphics, audio, controls, and accessibility settings are present with appropriate ranges; no critical setting is missing; defaults are sensible for target hardware.
- **Pass 5 — FTUE Effectiveness**: Tutorial teaches core mechanics without blocking progress; skip option is available; re-access to tutorial information exists; no mechanic requires undocumented player discovery.
- **Pass 6 — UI State Machine Completeness**: Every UI state has defined entry and exit conditions; no orphan states exist; all transitions are handled including error, disconnect, and loading states.
- **Pass 7 — Platform Shell Compliance**: System UI respects platform conventions (PS button, Xbox guide, Switch home); notification handling is specified; console certification UI requirements are addressed.

## Deep Guidance

---

## Pass 1: HUD Information Hierarchy

### What to Check

HUD elements are prioritized by gameplay criticality. Health, ammo, objective markers, and minimap are visible at a glance without eye movement from the center of the screen. Non-critical information (XP progress, currency, social notifications) is layered — hidden by default and surfaced contextually. The HUD does not present more than 5-7 simultaneous elements during active gameplay.

### Why This Matters

HUD overload causes players to miss critical gameplay information. When health, ammo, minimap, quest tracker, XP bar, currency, social notifications, buff timers, and cooldown indicators all compete for attention simultaneously, players die because they did not notice their health was low — the information was there, but buried in noise. Conversely, a HUD that hides too much forces players to open menus mid-combat. The hierarchy must match gameplay criticality.

### How to Check

1. List every HUD element and classify as critical (player dies without it), important (gameplay quality degrades without it), or contextual (useful but not time-sensitive)
2. Verify critical elements are visible without eye movement from screen center — use screen quadrant analysis
3. Check that contextual elements have defined show/hide triggers (e.g., XP bar appears for 3 seconds after earning XP, then fades)
4. Count simultaneous elements during peak gameplay — more than 7 concurrent elements indicates overload
5. Cross-reference with GDD mechanics: every mechanic with player-visible feedback must have a corresponding HUD element
6. Verify HUD scales with resolution — elements positioned by percentage, not fixed pixels
7. Check for HUD customization: can the player move, resize, or hide HUD elements?

### What a Finding Looks Like

- P0: "Health indicator is positioned in the bottom-left corner, 800+ pixels from screen center. In fast-paced combat, players must look away from the action to check health. Health must be near the reticle or use screen-edge vignette effects."
- P1: "14 HUD elements are visible simultaneously during combat. This exceeds cognitive load limits. Non-critical elements (XP bar, currency, social notifications) should be contextual, not persistent."
- P2: "HUD layout is specified in fixed pixel coordinates (health at 50,720). This will break at non-1080p resolutions. Use percentage-based or anchor-based positioning."
- P3: "HUD element for combo counter exists but no fade timing is specified. Define how long the counter persists after the last hit (recommended: 3-5 seconds)."

---

## Pass 2: Menu Completeness & Navigation

### What to Check

Every menu screen has a clear path back to the parent screen. No dead-end screens exist (screens with no exit path). The breadcrumb trail is visible at all times. The menu tree covers all player-facing systems (inventory, settings, social, store, leaderboards, achievements) without orphaned screens that are reachable only through obscure paths.

### Why This Matters

Incomplete menu trees strand players. A settings screen with no back button forces the player to restart the game. A crafting menu reachable only through a specific NPC but not from the inventory screen creates confusion. Players who cannot find a feature assume it does not exist — a hidden feature is a missing feature. Menu navigation should be exhaustively mapped, not discovered through play.

### How to Check

1. Build a complete menu tree from the UI spec — every screen, every transition, every button
2. Verify every screen has a back/escape path — no leaf node should be inescapable
3. Check for orphaned screens: screens not reachable from the main menu or hub screen through documented navigation
4. Verify breadcrumb visibility: does the player always know where they are in the menu hierarchy?
5. Check for consistent navigation patterns: does "B button" always mean "back"? Does "Start" always open the pause menu?
6. Verify that all player-facing systems appear in the menu tree: inventory, settings, social, store, map, journal, achievements, leaderboards, help
7. Check menu depth: menus deeper than 3 levels should be reconsidered — deep menus hide features

### What a Finding Looks Like

- P0: "The crafting submenu has no back button or escape path. Once entered through the NPC dialog, the only exit is closing the game. The screen is inescapable."
- P1: "Accessibility settings are nested under Gameplay > Advanced > Accessibility — 3 levels deep. Players who need these settings most are least likely to find them. Move to a top-level settings tab."
- P2: "Leaderboard screen is reachable from the post-match screen but not from the main menu. Players cannot browse leaderboards outside of match flow."
- P3: "Menu transition animations are not specified. Define whether transitions are instant, slide, or fade and their duration (recommended: 150-250ms)."

---

## Pass 3: Controller Accessibility

### What to Check

Every screen is fully navigable with a gamepad D-pad. Focus order follows spatial layout (left-to-right, top-to-bottom). Shoulder buttons switch between tabs. No interaction requires a mouse pointer, touch input, or keyboard to complete. Focus indicators are clearly visible with sufficient contrast.

### Why This Matters

Console games and PC games with controller support must be fully navigable without a mouse. A single screen that requires mouse input breaks the controller experience entirely — the player must put down their controller, find their mouse, click, and pick the controller back up. This is a console certification failure for PlayStation, Xbox, and Nintendo platforms. Even on PC, controller users expect full navigation support.

### How to Check

1. For every screen, verify that all interactive elements are reachable via D-pad navigation
2. Check focus order: does it follow spatial layout? (Left-to-right, top-to-bottom, matching visual hierarchy)
3. Verify tab switching: shoulder buttons (L1/R1 or LB/RB) switch between tabs in tabbed interfaces
4. Check that focus indicator is clearly visible: minimum 3px border or highlight with 4.5:1 contrast ratio
5. Verify that no interaction requires a cursor: dropdowns, sliders, text input, scrolling all work with D-pad
6. Check for focus traps: UI elements that capture focus and prevent D-pad navigation away (common with custom widgets)
7. Verify that wrapping behavior is consistent: does D-pad right on the last column wrap to the first column of the next row, or stop?

### What a Finding Looks Like

- P0: "The server browser uses a mouse-driven scrollable list with no D-pad navigation. Controller users cannot select a server. This is a console certification blocker."
- P0: "Text input for player name uses a mouse-clickable keyboard with no controller support. Console players cannot complete account creation."
- P1: "Focus order in the inventory grid goes left-to-right then jumps to a panel on the right, skipping the second row. Focus order does not match spatial layout."
- P2: "Focus indicator is a 1px white border on a light gray background. Contrast ratio is approximately 1.5:1 — below the 4.5:1 minimum for visibility."

---

## Pass 4: Settings Coverage

### What to Check

Settings screen covers all five minimum categories: graphics/video, audio, controls/input, gameplay, and accessibility. Each category has appropriate settings with sensible ranges. No critical setting is missing (resolution, volume, subtitle toggle, colorblind mode, control remapping). Default values are appropriate for target hardware.

### Why This Matters

Missing settings force players to accept defaults that may not suit their hardware, preferences, or needs. A game without a resolution setting alienates players with non-standard monitors. A game without subtitle options excludes deaf and hard-of-hearing players. A game without control remapping fails accessibility standards (and Xbox/PS certification). Settings are not optional features — they are baseline requirements.

### How to Check

1. Verify graphics settings: resolution, display mode (fullscreen/windowed/borderless), frame rate cap, V-sync, quality presets, individual quality settings (textures, shadows, anti-aliasing, draw distance)
2. Verify audio settings: master volume, music volume, SFX volume, voice volume, subtitle toggle, subtitle size, audio output selection
3. Verify control settings: control remapping, sensitivity sliders (camera, aim), invert Y-axis, vibration toggle, dead zone adjustment
4. Verify accessibility settings: colorblind mode (protanopia, deuteranopia, tritanopia), font scaling, screen reader support, reduced motion, high contrast mode
5. Verify gameplay settings: difficulty selection (if applicable), HUD customization, language selection, camera distance
6. Check setting ranges: sensitivity sliders should have wide enough ranges (not just 1-10 but 0.1-5.0 or similar), resolution should include common values
7. Verify that changed settings are previewed in real-time where possible (audio slider plays a sample, graphics changes show before confirm)

### What a Finding Looks Like

- P0: "No control remapping exists. Players who cannot use the default layout due to physical disabilities are locked out. This is an accessibility requirement and a platform certification blocker."
- P0: "No subtitle toggle exists. Deaf and hard-of-hearing players cannot follow narrative content. This is an accessibility baseline."
- P1: "Colorblind mode is listed as 'colorblind: on/off' without specifying which type. Protanopia, deuteranopia, and tritanopia require different palette adjustments — a single toggle is insufficient."
- P2: "Graphics quality has 3 presets (Low, Medium, High) but no individual settings. Players with specific hardware constraints cannot optimize (e.g., low shadows but high textures)."
- P3: "Audio settings do not include a 'dialogue boost' option. While not required, this is a common accessibility feature that improves clarity for hearing-impaired players."

---

## Pass 5: FTUE Effectiveness

### What to Check

The First Time User Experience (FTUE) teaches all core loop mechanics without blocking player progress. A skip option is available for returning players or replays. Tutorial information is re-accessible after completion (help menu, practice mode, or tooltip system). No core mechanic requires the player to discover it without guidance.

### Why This Matters

A bad FTUE either overwhelms (teaching every system in the first 10 minutes) or under-teaches (leaving players to discover critical mechanics by accident). Both cause churn: overwhelmed players quit because the game feels complex, under-taught players quit because they feel lost. The FTUE must pace instruction to match the player's cognitive load, teach mechanics in context (during gameplay, not via text walls), and provide an escape hatch for experienced players who do not need hand-holding.

### How to Check

1. List every core loop mechanic — movement, combat, inventory, crafting, social, economy
2. Verify each mechanic has a tutorial moment: in-context prompt, guided task, or practice scenario
3. Check tutorial pacing: no more than 2-3 new mechanics introduced per tutorial segment
4. Verify skip option: can the player skip the entire tutorial? Individual tutorial steps? Is the skip accessible from the first prompt?
5. Check for re-access: after completing the tutorial, can the player re-read instructions? Is there a help menu, codex, or practice mode?
6. Verify that the tutorial does not block progress: can the player proceed if they fail a tutorial challenge? Is there a retry with hints?
7. Check for advanced mechanics: are they taught later in gameplay (progressive disclosure) or dumped in the opening tutorial?

### What a Finding Looks Like

- P0: "Combat tutorial requires the player to defeat a training dummy to proceed, but no hint system exists if the player fails 3+ times. A player who cannot complete the tutorial is permanently stuck."
- P1: "Crafting system is never taught. The player must discover it by opening the inventory and finding a 'Craft' tab. 60% of players may never discover this core system."
- P1: "All 8 core mechanics are taught in a single 25-minute unskippable tutorial. Player drop-off during tutorials longer than 10 minutes exceeds 40%."
- P2: "Tutorial is skippable but no help menu or re-access exists. A player who skips the tutorial and later needs guidance has no recourse."

---

## Pass 6: UI State Machine Completeness

### What to Check

Every UI state has defined entry conditions, exit conditions, and transitions to other states. No orphan states exist (states with no entry path). No terminal states exist except intentional ones (quit game). Error states, disconnect states, and loading states are explicitly handled. State transitions are deterministic — no ambiguous transitions where two states compete.

### Why This Matters

Incomplete UI state machines are the primary source of UI softlocks — states the player enters but cannot exit. When the game shows a loading screen but the load fails silently, the player is stuck forever. When a disconnect occurs during a menu transition, the UI may be in an undefined state. When a modal dialog opens on top of another modal, focus may be lost. Every state transition must be mapped, including the error and edge-case transitions that are easy to forget.

### How to Check

1. List every UI state: main menu, loading, in-game HUD, pause menu, inventory, settings, store, matchmaking, post-match, error dialog, disconnect overlay
2. For each state, define: what triggers entry? What triggers exit? What are all possible transitions?
3. Check for orphan states: states that exist in the design but have no defined entry path
4. Check for softlock potential: states that can be entered but have no exit transition (especially error states)
5. Verify loading states: every loading screen has a timeout and error fallback (not infinite spin)
6. Check disconnect handling: every state has a defined behavior when network connectivity is lost
7. Verify modal stacking: what happens when a system notification triggers while a game dialog is open? Is there a priority queue?

### What a Finding Looks Like

- P0: "Loading screen has no timeout. If asset loading fails silently, the player is stuck on the loading screen indefinitely with no error message and no exit path."
- P0: "Matchmaking state has no cancel button. Once matchmaking begins, the player cannot return to the main menu without force-quitting the application."
- P1: "Disconnect during inventory management is not specified. If the server connection drops while the player has the inventory open, the UI state is undefined — does it close the inventory? Show an error? Return to main menu?"
- P2: "No modal priority system is defined. If a system notification, a party invite, and a trade request arrive simultaneously, the stacking behavior is unspecified."

---

## Pass 7: Platform Shell Compliance

### What to Check

System UI respects platform conventions for PlayStation (PS button returns to system menu), Xbox (Guide button returns to dashboard), and Nintendo Switch (Home button returns to system). Notification handling is specified — game does not block or interfere with system notifications. Console certification UI requirements (save icon display, mandatory legal notices, suspend/resume behavior) are addressed.

### Why This Matters

Platform shell compliance is a hard certification requirement. A game that does not properly handle the PS button, fails to display the mandated save icon, or interferes with system notifications will fail certification and cannot ship on that platform. These requirements are non-negotiable and documented in each platform's Technical Requirements Checklist (TRC for PlayStation, Xbox Requirements for Xbox, Lotcheck for Nintendo). Failing certification delays launch by weeks to months.

### How to Check

1. Verify system button handling: PS button, Xbox Guide button, Switch Home button all behave per platform spec
2. Check suspend/resume: game correctly saves state and resumes when the player leaves and returns
3. Verify save icon display: a save icon is displayed whenever the game writes to persistent storage (platform requirement)
4. Check mandatory legal notices: EULA, privacy policy, and age rating screens appear per platform requirements
5. Verify notification handling: system notifications (friend online, message received, download complete) display correctly over the game UI
6. Check for account switching: what happens if the user switches accounts mid-game? (Platform-specific requirements)
7. Verify that game UI does not render in platform-reserved screen areas (safe zone compliance)

### What a Finding Looks Like

- P0: "No suspend/resume handling is specified. On PS5, pressing the PS button and returning to the game may result in a broken state. Suspend/resume is a mandatory TRC requirement."
- P0: "Save icon display is not specified. PlayStation TRC requires a visible save indicator whenever writing to storage. Failure is an automatic certification rejection."
- P1: "System notification handling is not addressed. If a friend-request notification appears during a full-screen cinematic, the behavior is undefined. Specify whether the game pauses, overlays, or queues."
- P2: "Safe zone compliance is not documented. UI elements placed within 5% of screen edges may be clipped on some displays. Platform safe zone guidelines require all critical UI within the 90% safe area."

---

## Finding Template

Use this template for all game UI review findings:

```markdown
### Finding: [Short description of the issue]

**Pass:** [Pass number] — [Pass name]
**Priority:** P0 | P1 | P2 | P3
**Location:** [UI spec section and screen/element]

**Issue:** [Specific description of what is wrong, with references to the UI spec text.
Avoid subjective language — state the structural problem.]

**Evidence:** [Quote or reference the specific UI spec content that demonstrates the issue.
For navigation findings, show the broken path. For accessibility findings, show the
non-compliant element. For state machine findings, show the missing transition.]

**Impact:** [What goes wrong during implementation or certification if this is not fixed.
Be specific: "controller users cannot reach this screen" or "certification will fail on
PlayStation" or "players will softlock on this screen."]

**Recommendation:** [Concrete action to resolve the finding. Not "improve navigation" but
"add D-pad focus support to the server browser list — each row is a focusable element,
D-pad up/down moves between rows, A/X button selects."]

**Trace:** [Which downstream artifacts, screens, or certification requirements are affected]
```

### Example Finding

```markdown
### Finding: Server browser has no controller navigation — console certification blocker

**Pass:** 3 — Controller Accessibility
**Priority:** P0
**Location:** UI Spec Section 5.2 "Server Browser"

**Issue:** The server browser screen uses a mouse-driven scrollable list with
hover-to-select interaction. No D-pad navigation, focus indicators, or
controller bindings are specified. Controller users cannot select a server,
making the multiplayer flow inaccessible on gamepad.

**Evidence:** UI Spec Section 5.2: "Server list displays available servers in a
scrollable table. Player clicks a row to select, double-clicks to join."
No controller input is mentioned. No focus indicator design is shown.

**Impact:** Console certification will fail — every screen must be fully navigable
with a gamepad. PC controller users cannot access multiplayer. This blocks the
entire online flow for controller input.

**Recommendation:** Add D-pad navigation to the server list:
  - Each server row is a focusable element
  - D-pad up/down moves focus between rows
  - A button (Xbox) / X button (PS) selects the focused row
  - X button (Xbox) / Square button (PS) opens server details
  - Focus indicator: 3px highlight border with team accent color
  - L1/R1 switch between server list tabs (All, Favorites, Recent)

**Trace:** UI Spec 5.2 → blocks multiplayer-flow.md controller path,
console-certification.md TRC 3.12 (controller navigation), QA test plan
controller coverage
```
