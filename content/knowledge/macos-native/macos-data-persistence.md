---
name: macos-data-persistence
description: >-
  SwiftData vs Core Data vs SQLite/GRDB for macOS persistence; SwiftData requires macOS 14+; local-first caching patterns
topics:
  - macos-native
  - persistence
  - swiftdata
  - coredata
  - sqlite
  - grdb
  - local-first
volatility: evolving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/swiftdata
  - url: https://developer.apple.com/documentation/coredata
  - url: https://github.com/groue/GRDB.swift
---

macOS apps have four persistence layers to choose from: `UserDefaults`/`AppStorage` for tiny key-value state, SwiftData for model-graph persistence with a modern Swift API (macOS 14+ only), Core Data for the same with broader deployment targets and more control, and SQLite directly (via GRDB.swift) for apps that need SQL expressiveness, performance, or a deployment target below macOS 14. Choosing the wrong layer costs weeks in migration.

## Summary

**SwiftData** (macOS 14+): annotate model classes with `@Model`, inject a `ModelContainer` at the app root, query with `@Query` in views. Requires macOS 14 — do not use it if your minimum deployment target is macOS 12 or 13. **Core Data** (macOS 10.15+): the mature predecessor, more verbose but stable, with better CloudKit sync support (NSPersistentCloudKitContainer). **GRDB.swift** (any macOS version): a Swift wrapper around SQLite; use when you need complex SQL queries, full-text search, or want to avoid ORM magic. For local-first apps (offline-first with sync), prefer a record-based persistence layer (GRDB or Core Data) with a separate sync engine (CloudKit, custom server, or CRDTs).

## Deep Guidance

### SwiftData (macOS 14+)

SwiftData replaces Core Data's boilerplate with macros. **Minimum deployment target: macOS 14.0.**

**Define models**

```swift
import SwiftData

@Model
final class Project {
    var name: String
    var createdAt: Date
    var isArchived: Bool

    @Relationship(deleteRule: .cascade, inverse: \Task.project)
    var tasks: [Task] = []

    init(name: String) {
        self.name = name
        self.createdAt = .now
        self.isArchived = false
    }
}

@Model
final class Task {
    var title: String
    var isCompleted: Bool
    var dueDate: Date?

    var project: Project?

    init(title: String) {
        self.title = title
        self.isCompleted = false
    }
}
```

**Inject at the app root**

```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [Project.self, Task.self])
    }
}
```

**Query in views**

```swift
struct ProjectListView: View {
    @Query(filter: #Predicate<Project> { !$0.isArchived },
           sort: \.createdAt, order: .reverse)
    var projects: [Project]

    @Environment(\.modelContext) var context

    var body: some View {
        List(projects) { project in
            ProjectRow(project: project)
        }
        .toolbar {
            Button("Add") {
                let project = Project(name: "Untitled")
                context.insert(project)
            }
        }
    }
}
```

**SwiftData in a ViewModel (off the main actor)**

```swift
@MainActor
@Observable
final class ProjectViewModel {
    var projects: [Project] = []
    private var modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
        loadProjects()
    }

    func loadProjects() {
        let descriptor = FetchDescriptor<Project>(
            predicate: #Predicate { !$0.isArchived },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        projects = (try? modelContext.fetch(descriptor)) ?? []
    }

    func archive(_ project: Project) {
        project.isArchived = true
        try? modelContext.save()
        loadProjects()
    }
}
```

**SwiftData limitations to know:**
- Requires macOS 14+. No migration path for macOS 12/13 without Core Data.
- Schema migrations are handled automatically for simple changes (adding properties with defaults). Complex migrations require `VersionedSchema` and `SchemaMigrationPlan`.
- iCloud sync via CloudKit requires enabling `NSPersistentCloudKitContainer` — SwiftData's CloudKit sync has improved across macOS 15+ but still has limitations compared to Core Data + `NSPersistentCloudKitContainer` for complex models with many relationships or custom conflict resolution.
- `@Query` only works inside SwiftUI view bodies. Use `FetchDescriptor` + `modelContext.fetch` in ViewModels.

### Core Data (macOS 10.15+)

Use Core Data when you need: macOS 12/13 support, mature CloudKit sync, or an existing Core Data stack.

**Minimal programmatic setup**

```swift
import CoreData

final class PersistenceController {
    static let shared = PersistenceController()

    let container: NSPersistentContainer

    init(inMemory: Bool = false) {
        container = NSPersistentContainer(name: "MyApp")  // matches .xcdatamodeld filename
        if inMemory {
            container.persistentStoreDescriptions.first?.url = URL(filePath: "/dev/null")
        }
        container.loadPersistentStores { _, error in
            if let error { fatalError("Core Data load failed: \(error)") }
        }
        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
    }

    var viewContext: NSManagedObjectContext { container.viewContext }

    func backgroundContext() -> NSManagedObjectContext {
        container.newBackgroundContext()
    }
}
```

**CloudKit sync**

Replace `NSPersistentContainer` with `NSPersistentCloudKitContainer` and enable iCloud capability + CloudKit in the target. Core Data handles sync automatically; use `NSPersistentHistoryTracking` to observe remote changes:

```swift
let container = NSPersistentCloudKitContainer(name: "MyApp")
let description = container.persistentStoreDescriptions.first!
description.setOption(true as NSNumber, forKey: NSPersistentHistoryTrackingKey)
description.setOption(true as NSNumber,
    forKey: NSPersistentStoreRemoteChangeNotificationPostOptionKey)
```

**Background saves** (always save on a background context to avoid blocking the UI):

```swift
func saveInBackground(_ work: @escaping (NSManagedObjectContext) throws -> Void) async throws {
    let context = PersistenceController.shared.backgroundContext()
    try await context.perform {
        try work(context)
        if context.hasChanges { try context.save() }
    }
}
```

### SQLite via GRDB.swift

GRDB.swift is the recommended SQLite wrapper for Swift. Use it when: you need macOS 12/13 support without Core Data's complexity, you want SQL-level expressiveness, or you're building a document-based app where the database IS the document file.

**Setup**

```swift
import GRDB

var dbQueue: DatabaseQueue!

func setupDatabase(path: String) throws {
    var config = Configuration()
    config.foreignKeysEnabled = true
    config.prepareDatabase { db in
        db.trace { print("SQL: \($0)") }  // Log queries in debug
    }
    dbQueue = try DatabaseQueue(path: path, configuration: config)
    try migrator.migrate(dbQueue)
}
```

**Define records**

```swift
struct Project: Identifiable, Codable, FetchableRecord, PersistableRecord {
    var id: Int64?
    var name: String
    var createdAt: Date
    var isArchived: Bool

    static let databaseTableName = "projects"
}
```

**Migrations**

```swift
var migrator = DatabaseMigrator()

migrator.registerMigration("v1") { db in
    try db.create(table: "projects") { t in
        t.autoIncrementedPrimaryKey("id")
        t.column("name", .text).notNull()
        t.column("createdAt", .datetime).notNull()
        t.column("isArchived", .boolean).notNull().defaults(to: false)
    }

    try db.create(table: "tasks") { t in
        t.autoIncrementedPrimaryKey("id")
        t.column("projectId", .integer).notNull()
            .references("projects", onDelete: .cascade)
        t.column("title", .text).notNull()
        t.column("isCompleted", .boolean).notNull().defaults(to: false)
    }
}
```

**Queries**

```swift
// Fetch all active projects
let projects = try dbQueue.read { db in
    try Project.filter(Column("isArchived") == false)
               .order(Column("createdAt").desc)
               .fetchAll(db)
}

// Full-text search with FTS5
try db.create(virtualTable: "projects_fts", using: FTS5()) { t in
    t.content("projects")
    t.column("name")
}
let results = try dbQueue.read { db in
    try Project.fetchAll(db, sql: """
        SELECT projects.* FROM projects
        JOIN projects_fts ON projects.id = projects_fts.rowid
        WHERE projects_fts MATCH ?
        ORDER BY rank
    """, arguments: [query])
}
```

**ValueObservation for reactive updates**

```swift
let observation = ValueObservation.tracking { db in
    try Project.filter(Column("isArchived") == false).fetchAll(db)
}

let cancellable = observation.start(in: dbQueue,
    onError: { error in print(error) },
    onChange: { projects in
        Task { @MainActor in
            self.viewModel.projects = projects
        }
    }
)
```

### Local-First Caching Patterns

For apps that need offline operation with eventual sync:

**Pattern: cache-then-network**

```swift
func loadFeed() async {
    // 1. Show cached data immediately
    viewModel.posts = await cache.loadPosts()

    // 2. Fetch fresh data in background
    do {
        let fresh = try await api.fetchPosts()
        await cache.storePosts(fresh)
        viewModel.posts = fresh
    } catch {
        // Cache serves as fallback — show stale data with a banner
        viewModel.showingStaleData = true
    }
}
```

**Pattern: write-through cache**

```swift
func createTask(title: String) async throws {
    // Write locally first (optimistic)
    let task = Task(title: title, syncStatus: .pending)
    try await localDB.insert(task)
    viewModel.tasks.append(task)

    // Sync to server in background
    do {
        let serverTask = try await api.createTask(title: title)
        try await localDB.update(task.id, serverID: serverTask.id, syncStatus: .synced)
    } catch {
        // Mark for retry; a background sync job will retry on next launch
        try await localDB.update(task.id, syncStatus: .failed)
    }
}
```

**Choosing the right persistence layer**

| Need | Recommended |
|------|-------------|
| Simple user settings | `@AppStorage` / `UserDefaults` |
| Model graph, macOS 14+, iCloud sync | SwiftData + CloudKit |
| Model graph, macOS 12+, iCloud sync | Core Data + `NSPersistentCloudKitContainer` |
| Document database, complex queries | GRDB.swift |
| Offline-first with custom sync | GRDB.swift + custom sync engine |
| High-performance read-heavy data | GRDB.swift with WAL mode |
