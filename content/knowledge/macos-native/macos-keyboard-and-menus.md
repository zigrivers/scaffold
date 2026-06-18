---
name: macos-keyboard-and-menus
description: >-
  macOS keyboard model, standard shortcut conventions, the command pattern, responder chain, and implementing command palette (⌘K) UX
topics:
  - macos-native
  - keyboard
  - menus
  - responder-chain
  - swiftui
  - appkit
volatility: stable
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/design/human-interface-guidelines/keyboards
  - url: https://developer.apple.com/documentation/swiftui/commands
  - url: https://developer.apple.com/documentation/appkit/nsresponder
  - url: https://developer.apple.com/documentation/appkit/nsmenu
---

Keyboard-first interaction is a core macOS contract. Power users run apps almost entirely from the keyboard; screen-reader users depend on it entirely. A macOS app that neglects keyboard shortcuts and the responder chain is a broken app on its native platform.

## Summary

macOS keyboard shortcuts are modifier-prefixed: Cmd (primary actions), Cmd+Shift (secondary/uppercase variants), Cmd+Option (alternate), Cmd+Ctrl (app-specific third-level). The responder chain routes actions from the first responder (focused view) up through the view hierarchy, window, window controller, application delegate, and app object — any node can handle an action. In SwiftUI, `Commands` and `.keyboardShortcut` wire keyboard shortcuts to menu items and buttons. In AppKit, `NSMenuItem` targets and `IBAction` selectors participate in the responder chain. Command palettes (⌘K) are a modern supplement: a floating search field that fuzzy-matches all available commands and executes them.

## Deep Guidance

### Standard Keyboard Shortcuts

Follow platform conventions rigorously. Deviating from these breaks muscle memory:

| Action | Shortcut |
|--------|----------|
| New | Cmd+N |
| Open | Cmd+O |
| Close window | Cmd+W |
| Close all windows | Cmd+Option+W |
| Save | Cmd+S |
| Save As / Duplicate | Cmd+Shift+S |
| Print | Cmd+P |
| Quit | Cmd+Q |
| Undo | Cmd+Z |
| Redo | Cmd+Shift+Z |
| Cut | Cmd+X |
| Copy | Cmd+C |
| Paste | Cmd+V |
| Select All | Cmd+A |
| Find | Cmd+F |
| Find Next | Cmd+G |
| Find Previous | Cmd+Shift+G |
| Hide app | Cmd+H |
| Minimize window | Cmd+M |
| Preferences/Settings | Cmd+, |
| Help search | Cmd+? (Shift+Cmd+/) |

Reserve Cmd+1 through Cmd+9 for tab/section switching (browsers, Xcode). Reserve Fn+arrow and Ctrl+arrow for text navigation (system-level).

### Shortcut Assignment Rules

- **Cmd alone** — primary, most-used actions (Save, Copy, Quit).
- **Cmd+Shift** — uppercase or secondary variants (Redo, Save As, Select All in Table).
- **Cmd+Option** — alternate modes (Close without saving, Open with custom options).
- **Cmd+Ctrl** — app-specific third-level bindings for power users.
- **Avoid Cmd+Tab** (app switcher), **Cmd+Space** (Spotlight), **Cmd+F3** (Expose) — system-reserved.
- Letter shortcuts: prefer **transitive mnemonics** (Cmd+F for Find, Cmd+R for Refresh/Run, Cmd+K for commit or clear — context-dependent).

### SwiftUI: keyboardShortcut and Commands

```swift
// Attach a shortcut to a button (shows in Touch Bar and respects menu bar)
Button("Commit") { commit() }
    .keyboardShortcut(.return, modifiers: .command)  // Cmd+Return

Button("Fetch") { fetch() }
    .keyboardShortcut("f", modifiers: [.command, .shift])

// Disable a shortcut conditionally
Button("Delete Branch") { deleteBranch() }
    .keyboardShortcut(.delete, modifiers: .command)
    .disabled(selectedBranch == nil)
```

Wire app-level shortcuts through `Commands`:

```swift
struct RepositoryCommands: Commands {
    @FocusedBinding(\.selectedRepository) var repo: Repository?

    var body: some Commands {
        CommandMenu("Repository") {
            Button("Fetch") { repo?.fetch() }
                .keyboardShortcut("f", modifiers: [.command, .shift])
                .disabled(repo == nil)

            Button("Pull") { repo?.pull() }
                .keyboardShortcut("p", modifiers: [.command, .shift])
                .disabled(repo == nil)

            Divider()

            Button("Open in Terminal") { repo?.openTerminal() }
                .keyboardShortcut("t", modifiers: [.command, .shift])
        }
    }
}
```

Use `@FocusedValue` and `@FocusedBinding` to pass state from the focused window into Commands without global state:

```swift
// Define the focused value key
struct SelectedRepositoryKey: FocusedValueKey {
    typealias Value = Binding<Repository?>
}

extension FocusedValues {
    var selectedRepository: Binding<Repository?>? {
        get { self[SelectedRepositoryKey.self] }
        set { self[SelectedRepositoryKey.self] = newValue }
    }
}

// Set it in the view that owns the selection
struct RepositoryListView: View {
    @State private var selection: Repository?
    var body: some View {
        List(repositories, selection: $selection) { /* … */ }
            .focusedValue(\.selectedRepository, $selection)
    }
}
```

### AppKit: Responder Chain and NSMenuItem

The responder chain is AppKit's mechanism for routing action messages without tight coupling. When the user picks a menu item or presses a keyboard shortcut:

1. The action message (a selector like `commitChanges(_:)`) is sent to the **first responder** (the focused view).
2. If it doesn't respond, it propagates **up the responder chain**: next view → superview → … → NSWindow → NSWindowController → NSDocument → NSDocumentController → NSApp → NSAppDelegate.
3. The first object that implements the selector handles it.

```swift
// In any NSResponder subclass (NSView, NSViewController, NSWindowController, etc.)
@IBAction func commitChanges(_ sender: Any?) {
    // Called when Cmd+Return fires or the "Commit" menu item is selected
    performCommit()
}

// The menu item's target is nil (first responder routing) and action is commitChanges:
let item = NSMenuItem(title: "Commit", action: #selector(commitChanges(_:)), keyEquivalent: "\r")
item.keyEquivalentModifierMask = .command
item.target = nil  // nil = routed through responder chain
```

**Enabling/disabling via `validateMenuItem(_:)`:** The responder chain also validates items before display. Implement `validateMenuItem` in the same responder that handles the action:

```swift
override func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
    if menuItem.action == #selector(commitChanges(_:)) {
        return hasUncommittedChanges && !isCommitting
    }
    return super.validateMenuItem(menuItem)
}
```

For `NSToolbarItem`, implement `NSToolbarItemValidation` (`validateToolbarItem(_:)`).

### Command Pattern for Undo/Redo

Wrap every user-visible operation in a command object and register it with `UndoManager`:

```swift
class DocumentViewModel {
    var title: String = "" {
        didSet {
            undoManager?.registerUndo(withTarget: self) { target in
                target.title = oldValue
            }
            undoManager?.setActionName("Edit Title")
        }
    }
}
```

In SwiftUI, access `UndoManager` via the environment:

```swift
// Undo registration requires a stable reference-type target.
// Use an NSObject/ObservableObject view-model as the target, not a value type or binding.
class TitleViewModel: NSObject, ObservableObject {
    @Published var title: String = ""

    func setTitle(_ new: String, undoManager: UndoManager?) {
        let old = title
        undoManager?.registerUndo(withTarget: self) { target in
            target.setTitle(old, undoManager: undoManager)
        }
        undoManager?.setActionName("Edit Title")
        title = new
    }
}

struct TitleField: View {
    @StateObject private var viewModel = TitleViewModel()
    @Environment(\.undoManager) var undoManager

    var body: some View {
        TextField("Title", text: Binding(
            get: { viewModel.title },
            set: { viewModel.setTitle($0, undoManager: undoManager) }
        ))
    }
}
```

Every action that modifies persistent data should be undoable. Users expect Cmd+Z to work everywhere.

### Command Palette (⌘K)

A command palette is a floating, searchable list of all commands in the app. It is a supplement to (not a replacement for) the menu bar and keyboard shortcuts. Implementation:

```swift
struct CommandPaletteView: View {
    @Binding var isPresented: Bool
    @State private var query = ""
    @State private var highlighted = 0

    var filtered: [AppCommand] {
        query.isEmpty
            ? AppCommand.all
            : AppCommand.all.filter { $0.title.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search commands…", text: $query)
                    .textFieldStyle(.plain)
                    .font(.title3)
            }
            .padding()

            Divider()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(filtered.indices, id: \.self) { i in
                        CommandRow(
                            command: filtered[i],
                            isHighlighted: i == highlighted
                        )
                        .onTapGesture {
                            execute(filtered[i])
                        }
                    }
                }
            }
            .frame(maxHeight: 400)
        }
        .frame(width: 560)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(radius: 20)
        .onKeyPress(.upArrow) { highlighted = max(0, highlighted - 1); return .handled }
        .onKeyPress(.downArrow) { highlighted = min(filtered.count - 1, highlighted + 1); return .handled }
        .onKeyPress(.return) {
            if !filtered.isEmpty { execute(filtered[highlighted]) }
            return .handled
        }
        .onKeyPress(.escape) { isPresented = false; return .handled }
    }

    func execute(_ command: AppCommand) {
        isPresented = false
        command.action()
    }
}
```

Present the palette as an `NSPanel` (floating, non-activating) so it appears above the app's windows without stealing focus from the key window:

```swift
func showCommandPalette() {
    let panel = NSPanel(
        contentRect: .init(x: 0, y: 0, width: 560, height: 60),
        styleMask: [.borderless, .nonactivatingPanel],
        backing: .buffered,
        defer: false
    )
    panel.isFloatingPanel = true
    panel.level = .floating
    panel.backgroundColor = .clear
    panel.isOpaque = false
    panel.contentView = NSHostingView(rootView: CommandPaletteView(isPresented: …))
    panel.center()
    panel.makeKeyAndOrderFront(nil)
}
```

Register the global shortcut via the menu bar (Cmd+K is conventional in developer tools; Cmd+Shift+P mirrors VS Code). Surface commands with their keyboard shortcuts in the palette row so users learn the direct shortcuts over time.

### Key Equivalents and Localization

Key equivalents are layout-dependent. `keyEquivalent: "z"` maps to the physical Z key on QWERTY; on AZERTY keyboards it resolves to the A-key position. AppKit and SwiftUI handle this transparently — always specify logical character equivalents, not physical key positions. For non-letter keys, use `NSEvent.SpecialKey` constants: `.return`, `.delete`, `.tab`, `.escape`, `.space`, `.upArrow`, `.downArrow`, `.leftArrow`, `.rightArrow`, `.pageUp`, `.pageDown`, `.home`, `.end`.
