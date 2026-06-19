---
name: macos-swift-concurrency
description: >-
  async/await, actors, @MainActor, structured concurrency, Sendable, and Task cancellation patterns for macOS Swift apps
topics:
  - macos-native
  - swift
  - concurrency
  - async-await
  - actors
  - main-actor
  - structured-concurrency
volatility: stable
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/swift/concurrency
  - url: https://developer.apple.com/documentation/swift/actor
  - url: https://developer.apple.com/documentation/swift/mainactor
  - url: https://developer.apple.com/documentation/swift/sendable
---

Swift's structured concurrency model (introduced in Swift 5.5, macOS 12+) replaces GCD and completion-handler chains with async/await, actors, and Tasks. The key insight: concurrency correctness is enforced at compile time through `Sendable` checking and actor isolation — not at runtime through locks and dispatch queues. Write code that makes illegal state sharing a compile error.

## Summary

Use `async/await` for all new asynchronous code; avoid `DispatchQueue.async` and completion handlers. Annotate UI-touching code with `@MainActor` — SwiftUI Views are implicitly `@MainActor`, but `@Observable` and `ObservableObject` classes are NOT automatically `@MainActor`-isolated; ViewModels that touch UI state must be annotated `@MainActor` explicitly. Isolate shared mutable state in `actor` types. Perform parallel independent work with `async let` (static) or `TaskGroup` (dynamic). Mark value-type or thread-safe reference types as `Sendable`; avoid crossing actor boundaries with non-`Sendable` types. Cancel tasks on view disappear or ViewModel deinit to prevent work leaking past the view's lifetime.

## Deep Guidance

### async/await Basics

```swift
// Async function — suspends caller, not a thread
func fetchUser(id: String) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, response) = try await URLSession.shared.data(from: url)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
        throw APIError.badStatus
    }
    return try JSONDecoder().decode(User.self, from: data)
}

// Calling from a SwiftUI View (Task runs async code from sync context)
struct ProfileView: View {
    @State private var user: User?

    var body: some View {
        Group {
            if let user { UserDetailView(user: user) }
            else { ProgressView() }
        }
        .task {
            // .task modifier creates a Task tied to the view's lifetime;
            // cancels automatically when the view disappears
            user = try? await fetchUser(id: "abc123")
        }
    }
}
```

**Rules:**
- Prefer `.task` modifier over `onAppear { Task { … } }` — `.task` automatically cancels when the view disappears.
- `try await` propagates both suspension and throwing — handle errors with do/catch or `try?`.
- An `async` function does NOT block a thread. It suspends and frees the thread to do other work.

### @MainActor — UI Thread Safety

`@MainActor` guarantees that annotated code runs on the main thread. Apply it to ViewModels:

```swift
@MainActor
@Observable
final class SearchViewModel {
    var results: [SearchResult] = []
    var isSearching = false
    var errorMessage: String?

    private let searchService: SearchService

    init(searchService: SearchService) {
        self.searchService = searchService
    }

    func search(query: String) async {
        guard !query.isEmpty else { return }
        isSearching = true
        errorMessage = nil
        do {
            // searchService.search can cross to a background executor internally
            results = try await searchService.search(query: query)
        } catch {
            errorMessage = error.localizedDescription
        }
        isSearching = false
    }
}
```

`@MainActor` on the class means all methods and property accesses are automatically dispatched to the main actor — no manual `DispatchQueue.main.async` needed.

**SwiftUI Views are implicitly @MainActor.** `@Observable` classes are NOT automatically `@MainActor` — annotate explicitly if the ViewModel touches UI state.

To hop off the main actor for CPU-intensive work:

```swift
@MainActor
func processImage(_ image: NSImage) async -> NSImage {
    // Offload heavy processing to a background thread via nonisolated Task
    let processed = await Task.detached(priority: .userInitiated) {
        // This runs off the main actor
        return expensiveProcessing(image)
    }.value
    // Back on main actor here
    return processed
}
```

### Actors — Shared Mutable State

Use `actor` to protect mutable state that multiple tasks access concurrently:

```swift
actor ImageCache {
    private var cache: [URL: NSImage] = [:]

    func image(for url: URL) -> NSImage? {
        cache[url]
    }

    func store(_ image: NSImage, for url: URL) {
        cache[url] = image
    }

    func image(for url: URL, loader: @Sendable (URL) async throws -> NSImage) async throws -> NSImage {
        if let cached = cache[url] { return cached }
        let image = try await loader(url)  // suspends — doesn't block actor
        cache[url] = image
        return image
    }
}

// Usage — must await actor method calls from outside the actor
let cache = ImageCache()
let image = try await cache.image(for: url) { u in
    try await loadImage(from: u)
}
```

Actor rules:
- Actor methods are automatically serialized — only one task accesses actor state at a time.
- Calling an actor method from outside the actor requires `await` (it may need to wait for the actor to be free).
- Inside the actor, no `await` is needed for `self` access.
- Actors don't block threads. While waiting to enter, the calling task suspends and frees its thread.
- Prefer actors over `NSLock`/`os_unfair_lock` for shared mutable state — the compiler enforces isolation.

### Structured Concurrency

**async let — parallel independent tasks**

```swift
func loadDashboard(userId: String) async throws -> Dashboard {
    // Both requests start simultaneously
    async let profile = fetchProfile(userId: userId)
    async let recentActivity = fetchActivity(userId: userId, limit: 20)
    async let notifications = fetchNotifications(userId: userId)

    // Await all three — if any throws, the others are cancelled
    return Dashboard(
        profile: try await profile,
        activity: try await recentActivity,
        notifications: try await notifications
    )
}
```

**TaskGroup — dynamic parallelism**

```swift
func downloadFiles(_ urls: [URL]) async throws -> [Data] {
    try await withThrowingTaskGroup(of: (Int, Data).self) { group in
        for (index, url) in urls.enumerated() {
            group.addTask {
                let (data, _) = try await URLSession.shared.data(from: url)
                return (index, data)
            }
        }
        var results = [Data?](repeating: nil, count: urls.count)
        for try await (index, data) in group {
            results[index] = data
        }
        return results.compactMap { $0 }
    }
}
```

Structured concurrency guarantees: when the group scope exits (normally or via throw), all child tasks are cancelled and awaited. No task leaks.

### Task Cancellation

Cancellation in Swift is cooperative — tasks must check for it. Long-running work should check `Task.isCancelled` periodically:

```swift
func processItems(_ items: [Item]) async throws -> [Result] {
    var results: [Result] = []
    for item in items {
        try Task.checkCancellation()  // throws CancellationError if cancelled
        let result = try await processItem(item)
        results.append(result)
    }
    return results
}
```

For cancellable tasks in a ViewModel:

```swift
@MainActor
@Observable
final class FeedViewModel {
    var posts: [Post] = []
    private var loadTask: Task<Void, Never>?

    func load() {
        loadTask?.cancel()  // Cancel any in-flight load
        loadTask = Task {
            do {
                let fetched = try await feedService.fetch()
                if !Task.isCancelled {
                    posts = fetched
                }
            } catch is CancellationError {
                // Expected — ignore
            } catch {
                // Handle real errors
            }
        }
    }

    deinit {
        loadTask?.cancel()
    }
}
```

### Sendable

`Sendable` marks types safe to cross actor boundaries (i.e., safe to share across concurrency domains). The compiler enforces this at call sites under Swift 6 strict concurrency checking.

- Value types (`struct`, `enum`) with only `Sendable` stored properties are implicitly `Sendable`.
- `actor` types are implicitly `Sendable`.
- Classes must be explicitly marked `@unchecked Sendable` (you guarantee safety) or made `final` with all mutable state protected by an actor.

```swift
// Structs — implicitly Sendable if all stored properties are Sendable
struct SearchResult: Sendable {
    let id: String
    let title: String
    let score: Double
}

// Final class with internal synchronization — manually guarantee Sendable
final class Configuration: @unchecked Sendable {
    private let lock = NSLock()
    private var _values: [String: String] = [:]

    func value(for key: String) -> String? {
        lock.withLock { _values[key] }
    }
}
```

For new code targeting macOS 14+, enable strict concurrency checking in your Swift Package Manager target or Xcode build settings (`SWIFT_STRICT_CONCURRENCY = complete`) to catch `Sendable` violations at compile time rather than discovering data races at runtime.

### Async Streams

Replace Combine `Publisher` with `AsyncStream` or `AsyncThrowingStream` for new code:

```swift
// Wrap a callback-based API in an AsyncStream
func locationUpdates() -> AsyncStream<CLLocation> {
    AsyncStream { continuation in
        let delegate = LocationDelegate { location in
            continuation.yield(location)
        }
        continuation.onTermination = { _ in
            delegate.stop()
        }
        delegate.start()
    }
}

// Consume with async for-in
for await location in locationUpdates() {
    await viewModel.updateLocation(location)
}
```

`AsyncStream` is the modern replacement for `NotificationCenter` publishers and delegate callback chains in new code.
