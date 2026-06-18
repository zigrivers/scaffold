---
name: macos-app-architecture
description: >-
  App and scene lifecycle, window management, MVVM, and observable state patterns for macOS SwiftUI and AppKit apps
topics:
  - macos-native
  - architecture
  - swiftui
  - appkit
  - mvvm
  - lifecycle
  - state-management
volatility: stable
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/swiftui/app
  - url: https://developer.apple.com/documentation/swiftui/windowgroup
  - url: https://developer.apple.com/documentation/appkit/nsapplicationdelegate
  - url: https://developer.apple.com/documentation/observation
---

macOS app architecture choices ripple through every layer of the codebase. SwiftUI's `App` protocol and AppKit's `NSApplicationDelegate` serve different needs — understanding when each applies, and how they compose, determines how well the app scales and how easy it is to test.

## Summary

macOS apps declare their entry point via `@main` on a struct conforming to `App` (SwiftUI, macOS 11+) or via `NSApplicationDelegate` (AppKit). SwiftUI's `WindowGroup`, `Window`, `Settings`, and `MenuBarExtra` scene types handle window multiplicity, lifecycle, and system integration declaratively. Observable state uses `@Observable` (macOS 14+, Swift 5.9 Observation framework) or the older `ObservableObject`/`@Published` pattern (macOS 11+). MVVM is the idiomatic architecture: `@Observable` ViewModels are injected as `@State` at the composition root and propagated via `@Bindable` or `@Environment`.

## Deep Guidance

### App Entry Point and Scene Architecture

**SwiftUI App protocol**

```swift
@main
struct MyApp: App {
    // AppDelegate bridging for lifecycle events SwiftUI doesn't expose
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .commands {
            AppCommands()
        }

        Settings {
            SettingsView()
        }

        MenuBarExtra("My App", systemImage: "star.fill") {
            MenuBarView()
        }
    }
}
```

Key scene types for macOS:
- `WindowGroup` — multi-instance window; each document or window gets its own instance. macOS automatically adds "New Window" to the File menu.
- `Window` — single-instance window (identifier-based); macOS restores this exact window rather than spawning multiples.
- `DocumentGroup` — document-based apps; wire to a `FileDocument` or `ReferenceFileDocument`.
- `Settings` — preferences window, opened by Cmd+, or the app menu. Use `TabView` inside for paned preferences.
- `MenuBarExtra` — menu-bar-resident UI (macOS 13+). Replaces the old `NSStatusItem`/popover pattern.

**NSApplicationDelegate bridging**

SwiftUI's `App` protocol does not expose all AppKit lifecycle events. Use `@NSApplicationDelegateAdaptor` to bridge when you need:
- `applicationWillTerminate(_:)` — flush unsaved data
- `applicationShouldTerminateAfterLastWindowClosed(_:)` — control quit-on-close behavior
- `application(_:open:)` — handle files dragged onto the dock icon
- `applicationDidBecomeActive(_:)` / `applicationWillResignActive(_:)` — pause/resume background work

```swift
class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true  // menu-bar apps return false; document apps return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Flush pending writes, cancel background tasks
    }
}
```

### Window Management

**WindowGroup restoration and state**

macOS restores window state across launches by default. Opt out per-window with `.restorationBehavior(.disabled)`. Control programmatic window presentation with `openWindow(id:)`:

```swift
struct ContentView: View {
    @Environment(\.openWindow) var openWindow

    var body: some View {
        Button("Open Inspector") {
            openWindow(id: "inspector")
        }
    }
}

// In App body:
Window("Inspector", id: "inspector") {
    InspectorView()
}
.defaultSize(width: 300, height: 500)
.windowResizability(.contentSize)
```

**Controlling window style**

```swift
WindowGroup {
    ContentView()
}
.windowStyle(.hiddenTitleBar)        // full-content-area apps (Xcode, Photos)
.windowToolbarStyle(.unified(showsTitle: false))
.defaultSize(width: 900, height: 600)
.windowResizability(.contentMinSize)
```

For panel windows (floating inspectors, HUDs), drop to AppKit:

```swift
let panel = NSPanel(
    contentRect: .init(x: 0, y: 0, width: 300, height: 400),
    styleMask: [.titled, .closable, .resizable, .utilityWindow],
    backing: .buffered,
    defer: false
)
panel.isFloatingPanel = true
panel.level = .floating
panel.contentView = NSHostingView(rootView: InspectorView())
panel.makeKeyAndOrderFront(nil)
```

### MVVM Pattern for macOS

**@Observable ViewModel (macOS 14+)**

The Swift Observation framework (`@Observable`, macOS 14 / iOS 17) eliminates the `@Published` boilerplate and improves performance — only the properties actually accessed in a view body trigger redraws.

```swift
import Observation

// @MainActor is required for UI-bound @Observable view models under Swift 6
// strict concurrency: without it, mutations to observed properties from an
// async method are data races. The @MainActor annotation ensures all property
// accesses and method calls happen on the main actor; `await store.save(...)`
// still works — Swift hops off and back on the actor automatically.
@MainActor @Observable
final class DocumentViewModel {
    var title: String = ""
    var content: String = ""
    var isSaving: Bool = false
    var error: Error?

    private let store: DocumentStore

    init(store: DocumentStore) {
        self.store = store
    }

    func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await store.save(title: title, content: content)
        } catch {
            self.error = error
        }
    }
}
```

Inject the ViewModel at the composition root (the `App` or a top-level view) using `@State`, then pass it down:

```swift
struct ContentView: View {
    // @State owns the ViewModel lifetime — not @StateObject (macOS 14+)
    @State private var viewModel = DocumentViewModel(store: LiveDocumentStore())

    var body: some View {
        DocumentEditor(viewModel: viewModel)
            .toolbar {
                ToolbarItem {
                    Button("Save") { Task { await viewModel.save() } }
                        .disabled(viewModel.isSaving)
                }
            }
    }
}

struct DocumentEditor: View {
    @Bindable var viewModel: DocumentViewModel  // @Bindable for @Observable (macOS 14+)

    var body: some View {
        TextField("Title", text: $viewModel.title)
        TextEditor(text: $viewModel.content)
    }
}
```

**ObservableObject ViewModel (macOS 11–13 compatibility)**

For deployment targets below macOS 14, use the older pattern:

```swift
final class DocumentViewModel: ObservableObject {
    @Published var title: String = ""
    @Published var content: String = ""
    @Published var isSaving: Bool = false
}

struct ContentView: View {
    @StateObject private var viewModel = DocumentViewModel()
    // Pass to children via @ObservedObject or @EnvironmentObject
}
```

Rules:
- Use `@StateObject` to own the ViewModel (creates and retains it).
- Use `@ObservedObject` in child views that receive but don't own the ViewModel.
- Use `@EnvironmentObject` for app-wide state (user session, theme) injected via `.environmentObject(_:)` — avoid for everything else, as it hides dependencies and makes testing harder.

### ViewModel Rules for macOS

- ViewModels must NOT import SwiftUI or AppKit — they are platform-agnostic. Move any view-specific types (Color, NSImage) behind protocols.
- One ViewModel per screen or major panel. Avoid one mega-ViewModel per window.
- Inject dependencies via constructor. Never access singletons inside a ViewModel — inject them so tests can substitute fakes.
- ViewModels hold UI state; services/repositories hold business logic and data access.
- For document-based apps, the ViewModel wraps a document model; state persistence is the document's responsibility, not the ViewModel's.

### Scene Phase and Background Transitions

Monitor scene lifecycle with `scenePhase`:

```swift
struct ContentView: View {
    @Environment(\.scenePhase) var scenePhase

    var body: some View {
        MainView()
            .onChange(of: scenePhase) { _, newPhase in
                switch newPhase {
                case .background:
                    // Save in-progress work
                case .inactive:
                    // Pause timers, animations
                case .active:
                    // Resume
                @unknown default:
                    break
                }
            }
    }
}
```

On macOS, `scenePhase` transitions to `.inactive` when the window loses focus and to `.background` when all windows are minimized or hidden — not when the app moves to the background as a whole (macOS apps don't suspend). Use `NSWorkspace.shared.notificationCenter` for machine sleep/wake notifications if you need those.
