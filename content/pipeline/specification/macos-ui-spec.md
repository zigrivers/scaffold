---
name: macos-ui-spec
description: Specify the macOS UI per Apple HIG — windows, menus, toolbars, keyboard model, and accessibility
summary: "Replaces design-system and ux-spec for macOS-native projects. Covers window/scene structure, menu bar and menu-bar extras, toolbars, sidebars, keyboard shortcuts and the responder chain, multi-window/multi-monitor behavior, dark mode, density, Reduce Motion, and accessibility (VoiceOver, Dynamic Type)."
phase: "specification"
order: 851
dependencies: [system-architecture]
outputs: [docs/macos-ui-spec.md]
conditional: null
reads: [create-prd, user-stories, system-architecture]
knowledge-base: [macos-hig-ui-patterns, macos-accessibility, macos-keyboard-and-menus]
---

Define the complete macOS UI specification for this project, replacing both
`design-system` and `ux-spec` for macOS-native projects. Web and mobile design
systems focus on component libraries, responsive breakpoints, and touch targets;
macOS apps are governed instead by the Apple Human Interface Guidelines (HIG),
which prescribe window management, the menu bar contract, the keyboard-driven
responder chain, AppKit/SwiftUI scene model, and platform accessibility APIs.
This step translates the PRD, user stories, and system architecture into a
concrete macOS UI specification that a developer can implement directly.

## Mode Detection
Check for `docs/macos-ui-spec.md`. If it exists, operate in **update mode**:
read the existing spec and diff against the current PRD, user stories, and
system architecture. Preserve existing window layout decisions, established menu
structure, and accessibility mappings. Update or extend sections where upstream
docs have changed: new user stories may require new windows or menu items, and
architecture changes may shift the app-style classification.

## Update Mode Specifics
- **Detect prior artifact**: `docs/macos-ui-spec.md` exists
- **Preserve**: app-style classification, window/scene structure, menu hierarchy,
  keyboard shortcut assignments, VoiceOver label decisions, Reduce Motion
  alternatives
- **Triggers for update**: PRD added new feature requiring a new window or panel;
  user stories changed primary workflow, altering navigation model; system
  architecture switched AppKit ↔ SwiftUI or changed lifecycle; new accessibility
  requirement surfaced from user research
- **Conflict resolution**: if a new feature requires a menu item that conflicts
  with an HIG-reserved shortcut, document the conflict explicitly, propose an
  alternative shortcut from the available range, and flag for team review — never
  silently reassign ⌘Q, ⌘W, ⌘M, ⌘H, or other platform-reserved bindings

## Purpose
Produce a macOS-native UI specification that covers every HIG-governed surface
an agent or developer will implement. The document ensures the app:

1. Selects and justifies the correct **app style** (standard windowed app,
   menu-bar extra, background agent) and respects the lifecycle contract of that
   style. A menu-bar/accessory app sets `LSUIElement = YES` in Info.plist to
   suppress the Dock icon and ⌘-Tab entry; a pure background agent with no UI
   sets `LSBackgroundOnly = YES` instead.
2. Defines **window and scene structure** using AppKit `NSWindow`/`NSWindowController`
   or SwiftUI `WindowGroup`/`Window`/`MenuBarExtra` scenes — with scene IDs,
   default sizes, resizability, and tabbing behavior.
3. Specifies the **menu bar** completely: App Menu, File, Edit, View, Window,
   Help, and any custom menus — items, keyboard shortcuts, and enabling rules.
4. Documents **menu-bar extras** (status-bar icons) if applicable, including
   icon assets, popover/menu content, and ordering constraints.
5. Covers **toolbars** (NSToolbar / SwiftUI `.toolbar`) and **sidebars**
   (NSSplitView / NavigationSplitView) including items, overflow behavior, and
   customisation.
6. Specifies the complete **keyboard model**: shortcut assignments across all
   menus and custom views, the **responder chain** traversal for key events,
   and a **command palette** (⌘K or equivalent) if the PRD calls for one.
7. Addresses **multi-window and multi-monitor** behavior: new-window semantics,
   full-screen support, window restoration, and per-display layout.
8. Defines **appearance**: Dark Mode adoption, display-density (1× / 2× / high-
   DPI) handling, and vibrancy/materials where used.
9. Documents **Reduce Motion** alternatives for every animated transition.
10. Specifies **accessibility** for every custom view: VoiceOver labels and
    roles, Dynamic Type font scaling, and high-contrast adaptations.

## Inputs
- `docs/prd.md` (required) — features and user goals driving the UI
- `docs/user-stories.md` (required) — task flows that shape window and menu design
- `docs/system-architecture.md` (required) — UI framework choice (AppKit /
  SwiftUI / hybrid), deployment target, and sandboxing constraints

## Expected Outputs
- `docs/macos-ui-spec.md` — complete macOS UI specification covering app style,
  window/scene structure, menu bar, menu-bar extras, toolbars, sidebars,
  keyboard model, multi-window/multi-monitor behavior, appearance, Reduce Motion,
  and accessibility

## Quality Criteria
- (mvp) App style declared — standard windowed, menu-bar extra, or background agent — with lifecycle implications documented (e.g., menu-bar extra sets `LSUIElement = YES` in Info.plist for no Dock icon and no ⌘-Tab entry, activation via `NSStatusItem`; pure background agent uses `LSBackgroundOnly = YES`)
- (mvp) At least one primary window fully specified: scene ID, default content size, minimum size, resizability, and whether it participates in tab groups
- (mvp) App Menu fully itemized: About, Settings (⌘,), Services, Hide, Hide Others, Quit (⌘Q) — with any custom items before Quit. Note: the item is named "Settings…" on macOS 13 (Ventura) and later but "Preferences…" on macOS 12 (Monterey) and earlier; the correct name depends on the project's deployment target (from system-architecture)
- (mvp) Standard menus (File/Edit/View/Window/Help) catalogued with items, keyboard shortcuts, and enabling predicates
- (mvp) Every user story maps to at least one menu item, toolbar button, or documented keyboard shortcut
- (mvp) Keyboard shortcut table covers all custom shortcuts — no collision with HIG-reserved bindings (⌘Q, ⌘W, ⌘M, ⌘H, ⌘Space, etc.)
- (mvp) Responder chain described for the primary task flow: which objects handle key events and in what order
- (mvp) VoiceOver accessibility label specified for every custom `NSView` subclass or SwiftUI canvas/drawing view
- (deep) All windows specified with full scene metadata (SwiftUI `WindowGroup` id, default placement, `handlesExternalEvents`, window restoration class)
- (deep) Menu-bar extra fully specified (if applicable): NSStatusItem icon (template image, dimensions), popover vs. pull-down menu, menu content, and system ordering
- (deep) Toolbar items enumerated with identifiers, labels, palette labels, image names, overflow priority, and customisability flag
- (deep) Sidebar structure documented with NSSplitView / NavigationSplitView column roles, minimum and ideal widths, and collapse behavior
- (deep) Command palette defined (if applicable): trigger shortcut, search scope, action result types, keyboard navigation within palette
- (deep) Multi-window semantics specified: how "New Window" is triggered (⌘N / File menu / API), whether windows share or isolate state, and expected behavior when the last window closes
- (deep) Multi-monitor behavior described: which window opens on which display by default, full-screen detachment model
- (deep) Dark Mode token list: semantic color names mapped to light and dark values, with vibrancy/material calls-out for translucent surfaces
- (deep) Reduce Motion alternatives documented for every transition — fade substitutes for slide/zoom animations
- (deep) Dynamic Type support confirmed or explicitly waived with rationale; minimum effective font size documented
- (deep) High-contrast mode adaptations noted for any custom-drawn graphics or non-system colors

## Methodology Scaling
- **deep**: Full macOS UI specification covering every surface. Includes complete
  window/scene catalog with full metadata, itemized menus with shortcut tables and
  enabling rules, menu-bar extra spec if applicable, toolbar and sidebar detail,
  command palette design, multi-window and multi-monitor matrix, full appearance
  token system, Reduce Motion substitution table, and per-view VoiceOver/Dynamic
  Type/high-contrast accessibility plan. 20–35 pages.
- **mvp**: App-style declaration, primary window spec, App Menu + standard-menu
  overview with critical shortcuts, responder-chain summary for primary task flow,
  and VoiceOver labels for custom views. 5–8 pages.
- **custom:depth(1-5)**:
  - Depth 1: app-style declaration with lifecycle notes, primary window scene ID and size, and App Menu itemization only.
  - Depth 2: add standard menus (File/Edit/View/Window/Help) with shortcuts, keyboard shortcut collision check, and basic VoiceOver labels for custom views.
  - Depth 3: add toolbar and sidebar spec, responder-chain walkthrough for primary task flow, Dark Mode color token list, and Reduce Motion alternatives.
  - Depth 4: add multi-window/multi-monitor behavior matrix, command palette design (if applicable), menu-bar extra spec (if applicable), Dynamic Type confirmation, and high-contrast notes.
  - Depth 5: full specification — all depth-4 content plus complete scene metadata for every window, per-view accessibility audit table, vibrancy/material inventory, localization text-expansion buffers for all menus, and a signed-off shortcut registry with no reservations violated.

## After This Step

When this step is complete, tell the user:

---
**macOS UI specification complete** — `docs/macos-ui-spec.md` created.

**Next:** Run `/scaffold:review-macos-ui` — Review the macOS UI spec for HIG conformance, accessibility, and keyboard completeness.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
