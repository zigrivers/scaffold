---
name: macos-hig-ui-patterns
description: >-
  Apple Human Interface Guidelines for macOS: menus, toolbars, sidebars, windows, multi-window/monitor support, dark mode, density, and menu-bar extras
topics:
  - macos-native
  - hig
  - design
  - swiftui
  - appkit
  - ui-patterns
volatility: stable
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/design/human-interface-guidelines/macos
  - url: https://developer.apple.com/documentation/swiftui/toolbars
  - url: https://developer.apple.com/documentation/swiftui/navigationview
  - url: https://developer.apple.com/documentation/swiftui/menubarextra
---

Apple's Human Interface Guidelines for macOS encode decades of platform conventions. An app that ignores them feels foreign and erodes user trust; one that follows them inherits the platform's muscle memory for free.

## Summary

macOS UI is built around persistent, multi-window documents and a global menu bar. The key primitives are: the global menu bar (always visible, app-owned), the toolbar (per-window, contains tools), the sidebar (source list for navigation), the inspector (trailing panel for context), and split-view layouts. SwiftUI's `NavigationSplitView`, `Toolbar`, `Commands`, and `MenuBarExtra` scene types map directly to these primitives. Dark mode, accent colors, and vibrancy are automatic when you use semantic colors and system materials. Information density follows the `.compact` / `.regular` size class, and macOS defaults to a denser layout than iOS.

## Deep Guidance

### Menu Bar

The global menu bar is always visible and always owned by the frontmost app. Every macOS app must have at minimum: **App Name** (About, Hide, Quit), **File** (New, Open, Close, Save, Print), **Edit** (Undo, Redo, Cut, Copy, Paste, Select All), **View**, **Window** (Minimize, Zoom, Bring All to Front), **Help**.

Add menu items via `Commands` in your SwiftUI `App` body:

```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
            .commands {
                // Replace default "New Window" item
                CommandGroup(replacing: .newItem) {
                    Button("New Document") { /* … */ }
                        .keyboardShortcut("n", modifiers: .command)
                }
                // Add a custom menu
                CommandMenu("Repository") {
                    Button("Fetch") { /* … */ }
                        .keyboardShortcut("f", modifiers: [.command, .shift])
                    Divider()
                    Button("Push…") { /* … */ }
                }
            }
    }
}
```

**Rules:**
- Every destructive action (Delete, Discard) must live in the menu bar and respond to the keyboard shortcut.
- Disable (not hide) unavailable items — users need to discover what commands exist even when context makes them inapplicable.
- Use ellipsis (`…`) in menu item titles when the action opens a dialog requiring further input (e.g., "Save As…").
- Services menu integration is free when you implement `NSServicesMenuRequestor`; SwiftUI text fields participate automatically.

### Toolbar

Toolbars appear below the title bar (or inline with it for `.unified` style). They hold the most frequent actions and are user-customizable on macOS.

```swift
struct ContentView: View {
    var body: some View {
        MainContent()
            .toolbar {
                ToolbarItem(placement: .navigation) {
                    Button(action: toggleSidebar) {
                        Image(systemName: "sidebar.left")
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Commit") { /* … */ }
                        .keyboardShortcut(.return, modifiers: .command)
                }
                ToolbarItemGroup(placement: .automatic) {
                    Spacer()
                    Button(systemImage: "magnifyingglass") { /* search */ }
                }
            }
            .toolbarTitleDisplayMode(.inline)  // hide large-title on macOS
    }
}
```

**Toolbar style per window type:**
- `.unified` — title and toolbar share the same row; modern default (like Finder, Xcode).
- `.unifiedCompact` — reduced height; good for utility windows.
- `.expanded` — traditional separate toolbar row below the title bar.
- `.automatic` — system decides.

Set window toolbar style on the `WindowGroup`:

```swift
WindowGroup { ContentView() }
    .windowToolbarStyle(.unified(showsTitle: true))
```

For user-customizable toolbars in AppKit-backed windows, implement `NSToolbarDelegate` and vend `NSToolbarItem` objects; SwiftUI toolbars are not yet user-customizable via system UI as of macOS 15.

### Sidebar and Source List

The sidebar is a `NavigationSplitView` leading column styled as a source list. It uses the `.sidebar` list style and the `.sidebarAdaptable` navigation style.

```swift
struct AppView: View {
    @State private var selection: SidebarItem? = .repositories

    var body: some View {
        NavigationSplitView {
            List(SidebarItem.allCases, selection: $selection) { item in
                Label(item.title, systemImage: item.icon)
            }
            .listStyle(.sidebar)
            .navigationTitle("My App")
        } detail: {
            if let selection {
                DetailView(item: selection)
            }
        }
    }
}
```

**Sidebar rules:**
- Use SF Symbols in sidebar labels; fill-variant icons at 16pt for selected state, regular for deselected.
- Section headers in the sidebar are uppercase, no decorations.
- Sidebar width defaults around 200–260 pt; let `NavigationSplitView(columnVisibility:)` manage collapse on smaller windows.
- The sidebar background automatically uses vibrancy (`NSVisualEffectView` with `.sidebar` material); don't override it with a solid color.

### Inspector Panel

An inspector shows context-sensitive properties for the current selection. Use `inspector(isPresented:)` (macOS 14+):

```swift
struct ContentView: View {
    @State private var showInspector = false
    @State private var selection: Item?

    var body: some View {
        MainView(selection: $selection)
            .inspector(isPresented: $showInspector) {
                InspectorView(item: selection)
                    .inspectorColumnWidth(min: 200, ideal: 270, max: 400)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Toggle(isOn: $showInspector) {
                        Image(systemName: "sidebar.right")
                    }
                }
            }
    }
}
```

On macOS 13 and earlier, use a trailing `NavigationSplitView` column or an `NSPanel`.

### Windows, Multi-Window, and Multi-Monitor

macOS is a multi-window OS. Every `WindowGroup` scene can open multiple simultaneous windows. Design for this explicitly:

- **Avoid global mutable state** that breaks when two windows open the same document.
- Use `openWindow(id:value:)` to programmatically open a specific window type with typed data.
- Windows remember their position and size across relaunches via state restoration — don't fight this.

```swift
struct MyApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }

        Window("Quick Look", id: "quick-look") {
            QuickLookView()
        }
        .defaultSize(width: 600, height: 400)
        .windowResizability(.contentSize)  // lock to content; user can't resize
    }
}

// Open from anywhere:
@Environment(\.openWindow) var openWindow
openWindow(id: "quick-look")
```

**Multi-monitor:** macOS places windows on any connected display. Your app should not assume a single screen. Use `NSScreen.screens` if you need to reason about display geometry (e.g., placing a floating panel near its parent). SwiftUI handles display affinity automatically for `WindowGroup`-managed windows.

### Dark Mode and Accent Colors

macOS apps get dark mode for free when you use semantic colors and system materials. Violations:
- **Do not** hardcode `NSColor.black` or `UIColor.white` — use `NSColor.labelColor`, `NSColor.secondaryLabelColor`, `NSColor.tertiaryLabelColor` (automatic light/dark variants).
- **Do not** use custom background colors for sidebars or toolbars — use `NSVisualEffectView` with the appropriate material.

```swift
// Correct: semantic color
Text("Label").foregroundStyle(.primary)          // adapts to dark mode
// Wrong: fixed color
Text("Label").foregroundStyle(Color(red: 0, green: 0, blue: 0))  // breaks in dark mode
```

Accent color is user-selected in System Settings → Appearance. Respect it by using `Color.accentColor` for interactive controls and tinted foregrounds. Never hardcode blue as a highlight color.

For custom drawing in AppKit, use `NSColor.currentControlTint` and observe `NSWorkspace.accessibilityDisplayShouldIncreaseContrastDidChangeNotification` to redraw when the user enables "Increase Contrast."

### Information Density

macOS defaults to a denser layout than iOS. Targets:
- Minimum tap target: **44 × 44 pt** on iOS; macOS click targets can be **20 × 20 pt**.
- Row heights in lists: **22–24 pt** on macOS (vs 44 pt on iOS).
- Padding inside cells: **4–8 pt** horizontal, **2–4 pt** vertical.

Respect the user's preferred density from System Settings → Accessibility → Display → "Reduce Motion", "Increase Contrast", and (if you implement it) "Use larger text." In SwiftUI, `.controlSize(.regular)` is the default; use `.controlSize(.small)` for compact secondary controls.

### Menu-Bar Extras (Status Items)

Use `MenuBarExtra` (SwiftUI, macOS 13+) or `NSStatusItem` (AppKit) for persistent menu-bar presence. A menu-bar extra is appropriate for apps that run without a dock window (e.g., a clipboard manager, a VPN app) or for quick-access panels.

```swift
// SwiftUI MenuBarExtra scene
MenuBarExtra("My App", systemImage: "star.fill") {
    Button("Open Main Window") { openWindow(id: "main") }
    Divider()
    Button("Quit") { NSApp.terminate(nil) }
}
.menuBarExtraStyle(.window)  // .menu (dropdown) or .window (popover-style)
```

**Menu-bar extra rules:**
- Icon: 16 × 16 pt template image (black only; system applies tinting). Use SF Symbols with `.template` rendering mode.
- Popover-style extras (`.window` style) should be ≤ 300 pt wide and ≤ 500 pt tall.
- The menu bar can be hidden by the user — do not rely on the extra being visible; the main window should work standalone.
- Apps that only appear in the menu bar must set `LSUIElement = YES` in `Info.plist` to suppress the dock icon.

### System Settings Integration

The `Settings` scene creates the standard Cmd+, preferences window:

```swift
Settings {
    TabView {
        GeneralSettingsView()
            .tabItem { Label("General", systemImage: "gear") }
        AdvancedSettingsView()
            .tabItem { Label("Advanced", systemImage: "slider.horizontal.3") }
    }
    .frame(width: 450)
}
```

Use `@AppStorage` for simple preferences (backed by `UserDefaults`) and `AppStorageKey` wrappers for type safety. Do not implement your own preferences storage for basic key-value settings — `UserDefaults` and `@AppStorage` are what the system expects.
