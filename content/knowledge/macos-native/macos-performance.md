---
name: macos-performance
description: >-
  View virtualization for large data, smooth scrolling, low idle CPU, and Instruments profiling for macOS apps
topics:
  - macos-native
  - performance
  - swiftui
  - appkit
  - instruments
  - profiling
  - virtualization
volatility: evolving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/xcode/improving-your-app-s-performance
  - url: https://developer.apple.com/documentation/xcode/time-profiler
  - url: https://developer.apple.com/documentation/appkit/nstableview
---

macOS performance problems fall into three categories: frame drops (slow rendering on the main thread), high idle CPU (timers, polling, or unnecessary state invalidation), and memory growth (retain cycles, unbounded caches). Identify which category first — the fix is entirely different. Always profile with Instruments before optimizing; guesses are usually wrong.

## Summary

For large datasets, use `NSTableView` (cell reuse, virtualization) via `NSViewRepresentable` rather than SwiftUI's `List` (which does not virtualize reliably above ~5 000 rows). Keep the main thread free: no synchronous I/O, no heavy computation, no blocking locks. SwiftUI performance: minimize view identity churn, use `@Observable` over `ObservableObject` (finer-grained invalidation), and split large views into smaller components. For idle CPU: audit `Timer`/`DispatchSourceTimer` usage, avoid polling, use `NSWorkspace` notifications instead of checking state repeatedly. Profile with Time Profiler (CPU), Allocations (memory growth), and Core Animation (frame drops).

## Deep Guidance

### View Virtualization for Large Data

**The problem with SwiftUI List**

SwiftUI's `List` renders all visible rows in the scroll viewport and a small buffer around it, but on macOS it does not reliably recycle view objects the way `UITableView`/`NSTableView` do. With homogeneous rows over ~5 000 items, scroll performance degrades and memory grows proportionally to the number of rows rendered.

**Solution: NSTableView via NSViewRepresentable**

`NSTableView` with `makeView(withIdentifier:owner:)` reuses cell views — only O(visible rows) cells exist in memory regardless of data set size.

```swift
final class Coordinator: NSObject, NSTableViewDataSource, NSTableViewDelegate {
    var items: [Item]
    var onSelect: (Item) -> Void

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let id = NSUserInterfaceItemIdentifier("ItemCell")
        // makeView reuses a cell from the recycle pool — no alloc for most scrolls
        let cell = tableView.makeView(withIdentifier: id, owner: nil) as? ItemCellView
            ?? ItemCellView()
        cell.identifier = id
        cell.configure(with: items[row])  // configure, don't create
        return cell
    }
}
```

For batch updates (insert/delete/move) without reloading the whole table:

```swift
tableView.beginUpdates()
tableView.insertRows(at: IndexSet(integer: newIndex), withAnimation: .slideDown)
tableView.removeRows(at: IndexSet(integer: oldIndex), withAnimation: .slideUp)
tableView.endUpdates()
```

**NSCollectionView for grids**

Use `NSCollectionViewDiffableDataSource` with `NSCollectionViewCompositionalLayout` for grids. Diffable data source applies only the changed items, avoiding full reloads:

```swift
var snapshot = NSDiffableDataSourceSnapshot<Section, Item>()
snapshot.appendSections([.main])
snapshot.appendItems(newItems, toSection: .main)
// Only changed items are re-rendered
dataSource.apply(snapshot, animatingDifferences: true)
```

### SwiftUI Performance Patterns

**@Observable vs ObservableObject**

`@Observable` (macOS 14+) only invalidates views that actually accessed a changed property. `ObservableObject` invalidates ALL views observing the object whenever ANY `@Published` property changes. For ViewModels with many properties, this is a significant difference:

```swift
// Bad (ObservableObject) — all observers redraw when any property changes
class ViewModel: ObservableObject {
    @Published var title = ""
    @Published var count = 0
    @Published var isLoading = false
}

// Good (@Observable, macOS 14+) — only views that read `isLoading` redraw
// when isLoading changes; views that only read `title` are unaffected
@Observable class ViewModel {
    var title = ""
    var count = 0
    var isLoading = false
}
```

**View identity and struct churn**

SwiftUI identifies views by their position in the view tree. Avoid making views appear/disappear unnecessarily — this destroys and recreates `@State`, cancels `.task` modifiers, and triggers expensive layout passes.

```swift
// Bad — destroys and recreates DetailView on every selection change
if let selected = selectedItem {
    DetailView(item: selected)
}

// Better — maintains view identity; DetailView receives nil and can show a placeholder
DetailView(item: selectedItem)
    .id(selectedItem?.id)  // Only recreate when id changes, not on every property update
```

**Expensive computations in view body**

View bodies execute on every re-render. Keep them pure and fast:

```swift
// Bad — sorts on every render
var body: some View {
    List(items.sorted { $0.name < $1.name }) { ... }
}

// Good — sort in ViewModel, not in view body
@Observable class ViewModel {
    private(set) var sortedItems: [Item] = []
    var rawItems: [Item] = [] {
        didSet { sortedItems = rawItems.sorted { $0.name < $1.name } }
    }
}
```

**Equatable for conditional updates**

Conform model structs to `Equatable` and use `onChange(of:)` with stable values to avoid redundant work:

```swift
struct Item: Equatable {
    var id: UUID
    var title: String
    var isSelected: Bool
}
```

### Main Thread Hygiene

Every frame the system wants to draw (typically 60 fps on non-ProMotion, 120 fps on ProMotion displays) requires ~8–16 ms of main thread availability. Any synchronous work over ~1 ms risks a dropped frame.

**Never do on the main thread:**
- Disk I/O (`FileManager`, reading files synchronously)
- Network requests (even with a cache)
- Core Data/SwiftData fetch calls (use background contexts or async fetch)
- JSON decoding of large payloads
- Image decoding/resizing

**Pattern: background decode, main thread update**

```swift
func loadThumbnail(url: URL) async -> NSImage? {
    // Decode off main thread
    let image = await Task.detached(priority: .userInitiated) {
        guard let data = try? Data(contentsOf: url),
              let image = NSImage(data: data) else { return nil }
        // Resize on background thread too
        return image.resized(to: CGSize(width: 120, height: 120))
    }.value

    // UI update on main actor (implicit in @MainActor ViewModel)
    return image
}
```

### Low Idle CPU

An app doing nothing should use <1% CPU. Common idle CPU causes:

**Timers firing too frequently**

```swift
// Bad — 60 fps timer for a clock that updates once per second
Timer.scheduledTimer(withTimeInterval: 1/60, repeats: true) { _ in
    updateClockDisplay()
}

// Good — fire at the interval you actually need
Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
    updateClockDisplay()
}
// Even better for non-critical updates: use a 1-second CADisplayLink
// or TimelineView in SwiftUI
```

**Unnecessary state invalidation**

With `ObservableObject`, every `objectWillChange.send()` triggers a re-render. Profile with the SwiftUI instrument to find over-rendering.

**NSWorkspace polling**

Never poll `NSWorkspace` or `NSRunningApplication` lists. Use notifications:

```swift
NSWorkspace.shared.notificationCenter.addObserver(
    forName: NSWorkspace.didActivateApplicationNotification,
    object: nil,
    queue: .main
) { notification in
    // Only fires on actual app switches
}
```

**Combine/AsyncStream publishers**

Use `debounce` or `throttle` on search input to avoid firing a network call for every keystroke:

```swift
@Observable class SearchViewModel {
    var query = "" {
        didSet { scheduleSearch() }
    }
    private var searchTask: Task<Void, Never>?

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))  // debounce
            guard !Task.isCancelled else { return }
            await performSearch()
        }
    }
}
```

### Instruments Profiling Guide

**Time Profiler — find CPU hotspots**

1. Product → Profile (Cmd+I) → Time Profiler
2. Run the slow scenario (scroll, open a window, etc.)
3. Stop recording. In the call tree, enable "Hide System Libraries" and "Invert Call Tree" to surface your code at the top.
4. Look for functions taking >5% of total time. Click through to the source.

Common findings: synchronous disk I/O on main thread, JSON decoding in view body, `NSImage(data:)` called on main thread.

**Allocations — find memory growth**

1. Instruments → Allocations
2. Use the app for a few minutes; perform representative workflows.
3. Use the "Mark Generation" button before and after a user action to see net allocations for that action.
4. Filter for "Persistent" allocations growing over time — these are leaks or unbounded caches.
5. Click any allocation type → see the backtrace where it was created.

**Core Animation / Metal System Trace — find frame drops**

1. Instruments → Core Animation (or Metal System Trace for GPU-heavy apps)
2. Scroll or animate the slow area.
3. Frames in the FPS graph that drop below 60 (or 120 on ProMotion) are problem frames.
4. In the timeline below, look for main thread work (long CA Commit, large draw calls, prepareForDisplay) that pushes past the frame deadline.

**Leaks instrument**

Add the Leaks instrument to any profiling session. Leaks runs a mark-and-sweep every few seconds. Red "L" markers indicate a detected retain cycle. Click the leak → Cycles & Roots graph shows the reference cycle.

**Practical rule:** profile on actual hardware at the target macOS version. The simulator runs on a faster CPU and lacks the GPU constraints of real Mac hardware (especially older Intel Macs or low-end M-series).

### NSImage Performance

`NSImage` is lazy — it doesn't decode pixel data until drawn. Decode eagerly on a background thread before display to avoid main-thread jank:

```swift
func preloadImage(url: URL) async -> NSImage? {
    await Task.detached(priority: .userInitiated) {
        guard let image = NSImage(contentsOf: url) else { return nil }
        // Force decode by drawing into an off-screen bitmap
        let size = image.size
        let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: Int(size.width),
            pixelsHigh: Int(size.height),
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .calibratedRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        )!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        image.draw(in: CGRect(origin: .zero, size: size))
        NSGraphicsContext.restoreGraphicsState()
        let decoded = NSImage(size: size)
        decoded.addRepresentation(bitmap)
        return decoded
    }.value
}
```

For lists and grids showing many thumbnails, maintain a bounded `NSCache<NSURL, NSImage>` (macOS automatically evicts on memory pressure):

```swift
final class ThumbnailCache {
    private let cache = NSCache<NSURL, NSImage>()

    init() {
        cache.countLimit = 500
        cache.totalCostLimit = 100 * 1024 * 1024  // 100 MB
    }

    func thumbnail(for url: URL) -> NSImage? { cache.object(forKey: url as NSURL) }
    func store(_ image: NSImage, for url: URL) {
        let cost = Int(image.size.width * image.size.height * 4)
        cache.setObject(image, forKey: url as NSURL, cost: cost)
    }
}
```
