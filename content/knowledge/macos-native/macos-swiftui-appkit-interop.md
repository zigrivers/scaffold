---
name: macos-swiftui-appkit-interop
description: >-
  When to use SwiftUI vs AppKit, NSViewRepresentable/NSHostingController bridging, virtualized NSTableView/NSCollectionView, and hosting boundaries
topics:
  - macos-native
  - swiftui
  - appkit
  - interop
  - nsviewrepresentable
  - nstableview
  - performance
volatility: evolving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/swiftui/nsviewrepresentable
  - url: https://developer.apple.com/documentation/swiftui/nshostingcontroller
  - url: https://developer.apple.com/documentation/appkit/nstableview
  - url: https://developer.apple.com/documentation/appkit/nscollectionview
---

SwiftUI and AppKit are not alternatives — they are a layered stack. Production macOS apps in 2024+ are primarily SwiftUI for structure and navigation, with AppKit used precisely where SwiftUI's declarative model breaks down: virtualized large-data views, deeply customized controls, and system behaviors that SwiftUI hasn't yet exposed.

## Summary

Use SwiftUI for new macOS apps. Drop to AppKit via `NSViewRepresentable` or `NSHostingController` when you need: a virtualized `NSTableView`/`NSCollectionView` for thousands of rows, precise drag-and-drop with `NSDraggingDestination`, custom `NSTextView`-based editors, complex `NSMenu` integration, or any AppKit control that SwiftUI doesn't wrap. `NSHostingController` embeds SwiftUI into AppKit hierarchies (storyboards, programmatic AppKit windows). Keep hosting boundaries minimal — every boundary adds bridging overhead and coordination complexity.

## Deep Guidance

### SwiftUI vs AppKit Decision Guide

**Use SwiftUI when:**
- Building new windows, panels, sheets, and navigation structure
- Implementing preferences (`Settings` scene), onboarding, and standard forms
- The data set in a list is small enough that `List` scrolls smoothly (rough threshold: under ~5 000 homogeneous rows)
- The control you need has a first-class SwiftUI counterpart (`Picker`, `Toggle`, `Slider`, `DatePicker`, `TextField`, `TextEditor`)
- You want `@Observable` / `@StateObject` state integration without bridging

**Use AppKit (via `NSViewRepresentable`) when:**
- Rendering tens of thousands of rows — `NSTableView` with cell reuse virtualizes; SwiftUI's `List` does not reliably
- Building a rich-text editor (wrap `NSTextView` with `NSLayoutManager` customization)
- Needing precise drag-and-drop with `NSPasteboardItem` and custom `NSDraggingInfo`
- Integrating `WKWebView`, `SCNView`, `AVPlayerView`, `PDFView` (all AppKit types)
- Implementing `NSOutlineView` trees (SwiftUI `OutlineGroup` is limited)
- Building an `NSStatusItem` menu-bar item with complex menu behavior

### NSViewRepresentable — Embedding AppKit in SwiftUI

`NSViewRepresentable` wraps a single AppKit view to use inside a SwiftUI hierarchy.

**Pattern: wrapping NSTableView for large data sets**

```swift
struct LargeDataTable: NSViewRepresentable {
    var items: [DataItem]
    var onSelect: (DataItem) -> Void

    // Coordinator acts as NSTableViewDataSource + NSTableViewDelegate
    func makeCoordinator() -> Coordinator {
        Coordinator(items: items, onSelect: onSelect)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let tableView = NSTableView()
        tableView.dataSource = context.coordinator
        tableView.delegate = context.coordinator
        tableView.usesAutomaticRowHeights = false
        tableView.rowHeight = 44

        let column = NSTableColumn(identifier: .init("main"))
        column.title = "Item"
        tableView.addTableColumn(column)

        let scrollView = NSScrollView()
        scrollView.documentView = tableView
        scrollView.hasVerticalScroller = true
        context.coordinator.tableView = tableView
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        context.coordinator.items = items
        context.coordinator.tableView?.reloadData()
    }

    final class Coordinator: NSObject, NSTableViewDataSource, NSTableViewDelegate {
        var items: [DataItem]
        var onSelect: (DataItem) -> Void
        weak var tableView: NSTableView?

        init(items: [DataItem], onSelect: @escaping (DataItem) -> Void) {
            self.items = items
            self.onSelect = onSelect
        }

        func numberOfRows(in tableView: NSTableView) -> Int { items.count }

        func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
            let id = NSUserInterfaceItemIdentifier("cell")
            let cell = tableView.makeView(withIdentifier: id, owner: nil) as? NSTableCellView
                ?? NSTableCellView()
            cell.identifier = id
            cell.textField?.stringValue = items[row].title
            return cell
        }

        func tableViewSelectionDidChange(_ notification: Notification) {
            guard let tableView = notification.object as? NSTableView,
                  tableView.selectedRow >= 0 else { return }
            onSelect(items[tableView.selectedRow])
        }
    }
}
```

**Coordinator rules:**
- The Coordinator is the right place for all delegate/datasource protocol conformances.
- Keep Coordinator as a pure bridge — no business logic. Delegate decisions back through closures or via the ViewModel.
- `makeCoordinator()` is called once. `makeNSView(context:)` is called once. `updateNSView(_:context:)` is called on every SwiftUI state update — keep it cheap (avoid full `reloadData()` when only a subset changed; use `insertRows(at:withAnimation:)` / `removeRows(at:withAnimation:)` instead).
- The Coordinator must not hold a strong reference to the parent struct (value type — it will be copied). Pass data through the coordinator's mutable properties.

**NSViewControllerRepresentable** follows the same pattern when the AppKit component is lifecycle-managed by an `NSViewController`.

### NSHostingController — Embedding SwiftUI in AppKit

`NSHostingController` wraps a SwiftUI view tree to use inside an AppKit window or view hierarchy.

```swift
// Embed SwiftUI into a programmatic AppKit window
let hostingController = NSHostingController(rootView: SwiftUIDetailView(item: item))
let window = NSWindow(contentViewController: hostingController)
window.setContentSize(hostingController.view.fittingSize)
window.makeKeyAndOrderFront(nil)
```

**NSHostingView** — when you need just the view without a controller (e.g., embedding into an existing `NSView` hierarchy):

```swift
let hostingView = NSHostingView(rootView: BadgeView(count: unreadCount))
hostingView.frame = CGRect(x: 0, y: 0, width: 40, height: 20)
existingAppKitView.addSubview(hostingView)
```

**SwiftUI state across the boundary:**

To push state changes from AppKit into the hosted SwiftUI view, use `@Observable` or a `StateHolder` object passed as a reference:

```swift
@Observable
final class DetailState {
    var item: DataItem?
}

class DetailViewController: NSViewController {
    let state = DetailState()
    private var hostingController: NSHostingController<DetailView>!

    override func viewDidLoad() {
        super.viewDidLoad()
        hostingController = NSHostingController(rootView: DetailView(state: state))
        addChild(hostingController)
        view.addSubview(hostingController.view)
        hostingController.view.frame = view.bounds
        hostingController.view.autoresizingMask = [.width, .height]
    }

    func showItem(_ item: DataItem) {
        state.item = item  // SwiftUI re-renders automatically
    }
}
```

### NSCollectionView for Grid/Gallery Layouts

Use `NSCollectionView` with `NSCollectionViewDiffableDataSource` when you need a grid with hundreds or thousands of items and precise layout control (column-flow, waterfall, section headers):

```swift
struct PhotoGrid: NSViewRepresentable {
    var photos: [PhotoItem]

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSScrollView {
        let layout = NSCollectionViewFlowLayout()
        layout.itemSize = CGSize(width: 120, height: 120)
        layout.minimumInteritemSpacing = 8
        layout.minimumLineSpacing = 8

        let collectionView = NSCollectionView()
        collectionView.collectionViewLayout = layout
        collectionView.register(PhotoCell.self,
            forItemWithIdentifier: .init("photo"))

        let dataSource = NSCollectionViewDiffableDataSource<Int, PhotoItem>(
            collectionView: collectionView
        ) { cv, indexPath, item in
            let cell = cv.makeItem(withIdentifier: .init("photo"), for: indexPath)
                as! PhotoCell
            cell.configure(with: item)
            return cell
        }
        context.coordinator.dataSource = dataSource

        let scrollView = NSScrollView()
        scrollView.documentView = collectionView
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        var snapshot = NSDiffableDataSourceSnapshot<Int, PhotoItem>()
        snapshot.appendSections([0])
        snapshot.appendItems(photos)
        context.coordinator.dataSource?.apply(snapshot, animatingDifferences: true)
    }

    final class Coordinator: NSObject {
        var dataSource: NSCollectionViewDiffableDataSource<Int, PhotoItem>?
    }
}
```

### Hosting Boundary Rules

1. **Minimize boundaries.** Each `NSViewRepresentable` / `NSHostingController` is a seam where SwiftUI's layout engine and AppKit's layout engine must negotiate sizes. Fewer seams mean fewer layout ambiguity bugs.
2. **Never pass SwiftUI bindings across the boundary.** Bindings do not bridge into AppKit. Pass data as plain values; pipe mutations back through closures or a shared `@Observable` object.
3. **Size negotiation.** `sizeThatFits(_:)` on `NSHostingController` asks SwiftUI for its intrinsic content size — use this to set a window's initial size. `NSViewRepresentable.sizeThatFits(_:usingView:)` lets you override size proposals from SwiftUI's layout system.
4. **Avoid nesting.** Don't wrap an `NSViewRepresentable` inside an `NSHostingView` inside another `NSViewRepresentable`. This creates three layout systems fighting each other. Redesign the boundary.
5. **`updateNSView` is hot.** Every SwiftUI body re-evaluation calls `updateNSView`. Guard expensive AppKit calls (e.g., `reloadData`) with an equality check: only call through when the data actually changed.
