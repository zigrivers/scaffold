---
name: macos-accessibility
description: >-
  VoiceOver, Dynamic Type, Reduce Motion, high contrast, and accessibility for canvas and custom views in macOS SwiftUI and AppKit
topics:
  - macos-native
  - accessibility
  - voiceover
  - swiftui
  - appkit
volatility: stable
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/accessibility/macos
  - url: https://developer.apple.com/documentation/swiftui/accessibility
  - url: https://developer.apple.com/documentation/appkit/nsaccessibility
  - url: https://developer.apple.com/documentation/accessibility/axuielement
---

Accessibility on macOS is not a checkbox — it is a first-class contract with a large population of users who depend on assistive technologies daily. VoiceOver, Switch Control, Voice Control, and keyboard-only navigation all interact with the same underlying `NSAccessibility` protocol. SwiftUI wires most of this automatically; custom views and canvas drawing require explicit participation.

## Summary

SwiftUI's built-in controls are fully accessible by default. Custom views expose metadata via accessibility modifiers: `.accessibilityLabel`, `.accessibilityValue`, `.accessibilityHint`, `.accessibilityAddTraits`, `.accessibilityAction`, and `.accessibilityElement(children:)`. AppKit views conform to `NSAccessibilityProtocol` or implement the informal `NSAccessibility` protocol methods. Canvas and `NSView` subclasses with custom drawing must implement `accessibilityChildren()`, `accessibilityFrame()`, and role-appropriate attributes. Dynamic Type maps to `Font.system(.body)` dynamic sizing; macOS offers "Large Text" in Accessibility prefs rather than the full iOS Dynamic Type scale. Reduce Motion and Increase Contrast are observable via `AccessibilityDisplayOptions` environment. Test with VoiceOver (Cmd+F5), Accessibility Inspector (Xcode → Open Developer Tool), and `ax` command-line tool.

## Deep Guidance

### VoiceOver Essentials

VoiceOver reads the accessibility tree, which is a parallel representation of the view hierarchy. Every interactive element needs:
1. A **label** — what it is (noun or short phrase, no period).
2. A **value** — current state when it changes (e.g., "checked", "3 of 10").
3. A **hint** — what activating it does, only when not obvious from the label (verb phrase, lowercase, no period).
4. A **role** — `button`, `toggle`, `slider`, `link`, etc.

```swift
// SwiftUI — explicit accessibility metadata
// Do NOT add .accessibilityValue to a standard Toggle — SwiftUI already
// announces the on/off state via the control's built-in role. Adding a
// manual .accessibilityValue("on"/"off") causes VoiceOver to double-announce
// the state (e.g., "Show hidden files, on, toggle button, on").
Toggle("Show Hidden Files", isOn: $showHidden)
    // No .accessibilityLabel needed — VoiceOver derives the label from the Toggle's title text
    // No hint needed — the action is obvious from the label

Button(action: deleteSelected) {
    Image(systemName: "trash")
}
.accessibilityLabel("Delete selected items")
.accessibilityHint("Moves items to Trash")

// Grouping decorative elements so VoiceOver skips them
Image(systemName: "arrow.up")
    .accessibilityHidden(true)  // purely decorative
```

**Navigation order:** VoiceOver navigates left-to-right, top-to-bottom by default. Reorder with `.accessibilitySortPriority(_:)` when the visual layout and reading order differ (e.g., a header that visually appears in the middle but should be read first).

### Accessibility Roles and Traits

SwiftUI infers the role from the control type, but override explicitly for custom controls:

```swift
// Custom button built from a shape
RoundedRectangle(cornerRadius: 8)
    .fill(Color.accentColor)
    .frame(width: 100, height: 36)
    .overlay(Text("Commit").foregroundStyle(.white))
    .accessibilityLabel("Commit changes")
    .accessibilityAddTraits(.isButton)
    .onTapGesture { commit() }
```

Common roles: `.button`, `.toggle`, `.slider`, `.link`, `.header`, `.image`, `.list`, `.cell`, `.group`, `.staticText`.

Common traits: `.isButton`, `.isHeader`, `.isSelected`, `.isEnabled` / `.isDisabled`, `.updatesFrequently` (live regions like a progress indicator).

### Dynamic Type and Text Sizing

macOS offers "Large Text" in System Settings → Accessibility → Display, not the full iOS Dynamic Type scale. Still, always use dynamic fonts:

```swift
Text("Repository name")
    .font(.system(.body))          // scales with user preference
    .lineLimit(nil)                 // allow wrapping when text grows
    .fixedSize(horizontal: false, vertical: true)  // expand vertically, not clip
```

Never hardcode point sizes for body text. Use the semantic font roles: `.largeTitle`, `.title`, `.headline`, `.subheadline`, `.body`, `.callout`, `.footnote`, `.caption`. For code or monospaced display, `.system(.body, design: .monospaced)`.

For AppKit custom views, read the current preferred size at render time via `NSFont.systemFont(ofSize: NSFont.systemFontSize)`. Note: macOS has no system-wide Dynamic Type notification equivalent to iOS's `UIContentSizeCategory.didChangeNotification`. `NSFontDidChangeNotification` fires for Font Panel font changes (i.e., the user picked a font in the Font Panel), not for the Accessibility "Large Text" preference — do not use it to respond to accessibility text-size changes. Instead, read the preference at layout/render time and redraw when relevant `NSWorkspace` accessibility notifications fire (e.g., observe `NSWorkspace.shared.notificationCenter` for `NSWorkspace.accessibilityDisplayOptionsDidChangeNotification` and query `NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast` — this single notification covers all accessibility display option changes including contrast, reduce motion, and differentiate-without-color; there is no separate notification for large-text changes, so read the preference on demand).

### Reduce Motion

Users with vestibular disorders or motion sensitivity enable "Reduce Motion" in System Settings → Accessibility → Display. Respect it:

```swift
@Environment(\.accessibilityReduceMotion) var reduceMotion

var body: some View {
    RoundedRectangle(cornerRadius: 12)
        .animation(
            reduceMotion ? .none : .spring(response: 0.3, dampingFraction: 0.7),
            value: isExpanded
        )
}
```

Substitute animations with:
- Cross-fades instead of slides or zooms.
- Instant state changes when `reduceMotion` is true.
- Never suppress all feedback — static redraws without transition are fine.

In AppKit, check `NSWorkspace.shared.accessibilityDisplayShouldReduceMotion`.

### Increase Contrast and Differentiate Without Color

```swift
@Environment(\.accessibilityDifferentiateWithoutColor) var differentiateWithoutColor
@Environment(\.colorSchemeContrast) var contrast  // .standard or .increased

var body: some View {
    HStack {
        if differentiateWithoutColor {
            // Add a shape/icon to distinguish status, not just color
            Image(systemName: status == .error ? "xmark.circle" : "checkmark.circle")
        }
        Circle()
            .fill(status == .error ? Color.red : Color.green)
    }
    .overlay(
        contrast == .increased
            ? RoundedRectangle(cornerRadius: 4).stroke(Color.primary, lineWidth: 1)
            : nil
    )
}
```

Rules:
- Never rely on color alone to convey state — pair it with a shape, icon, or label.
- In high-contrast mode, borders and separators that are invisible in standard contrast become visible — budget space for them.
- Minimum contrast ratio for text: 4.5:1 (AA), 7:1 (AAA). Use Xcode's Accessibility Inspector or the WCAG contrast checker to verify.

### Canvas and Custom View Accessibility

`Canvas` views in SwiftUI are opaque to the accessibility tree by default. Make them accessible with `accessibilityChildren`:

```swift
Canvas { context, size in
    // Custom drawing
    for item in items {
        context.fill(Path(item.frame), with: .color(.blue))
    }
}
.accessibilityLabel("Item canvas")
.accessibilityChildren {
    // Provide an accessible representation for each drawn element
    ForEach(items) { item in
        Rectangle()
            .frame(width: item.frame.width, height: item.frame.height)
            .accessibilityLabel(item.name)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { selectItem(item) }
    }
}
```

The `accessibilityChildren` closure creates a parallel hierarchy that VoiceOver navigates — the visual canvas is still drawn normally, but assistive technologies see the logical elements.

**AppKit `NSView` custom drawing:**

A custom `NSView` must expose accessibility metadata for each logical child element. Key requirements:

- Expose role, label, an `accessibilityFrame` in **screen coordinates**, and an activation point in screen coordinates via Swift property assignment (e.g., `accessibilityRole = .button`) — not Obj-C-style setter calls.
- Child accessibility elements must have **stable identity** — do NOT recreate them on every `accessibilityChildren()` call. VoiceOver tracks focus by object identity; returning newly-allocated elements on each call breaks navigation. Cache child elements in a stored property and return the same instances each time.
- However, the `accessibilityFrame` of each cached element must reflect the **current screen position** — recompute screen coordinates on access (converting from view-local to window coordinates via `convert(_:to:nil)`, then to screen via `window?.convertToScreen(_:)`), since scroll, resize, or window moves change them without invalidating the cache.
- When items are inserted, deleted, or reordered, rebuild the cache wholesale (replacing the stored property) rather than mutating individual cached elements mid-navigation.
- The parent view itself should return an appropriate role (e.g., `.group`) and label via the corresponding overrides.

### Keyboard Navigation

macOS users navigate with Tab/Shift-Tab, arrow keys, Return, and Space. Ensure:
- All interactive elements are in the Tab order. SwiftUI handles this; AppKit respects `nextKeyView`.
- Focus ring is visible — never suppress `focusRingType` in `NSView` subclasses.
- Arrow keys work inside list/table rows and custom controls.

```swift
// SwiftUI: explicit focus management
@FocusState private var focusedField: Field?

TextField("Search", text: $searchText)
    .focused($focusedField, equals: .search)
    .onSubmit { focusedField = .results }

// Move focus programmatically
Button("Focus Search") {
    focusedField = .search
}
.keyboardShortcut("f", modifiers: .command)
```

### Testing Accessibility

1. **VoiceOver:** Cmd+F5 to toggle. Navigate with VO+Arrow, activate with VO+Space. Every interactive element must have a spoken label and role.
2. **Accessibility Inspector** (Xcode → Open Developer Tool → Accessibility Inspector): point at any element to inspect its full accessibility tree, run automated audits (`Audit` tab → Run Audit).
3. **Keyboard-only navigation:** Unplug the mouse. Tab through the entire app. Confirm every action is reachable and operable.
4. **High Contrast:** Enable via System Settings → Accessibility → Display → "Increase Contrast". Verify no text disappears, borders are visible, icons remain readable.
