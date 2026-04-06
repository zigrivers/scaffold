---
name: mobile-app-offline-patterns
description: Local storage (SQLite/Room/Core Data), sync engines, conflict resolution, and background sync for offline-capable mobile apps
topics: [mobile-app, offline, sqlite, room, core-data, sync, conflict-resolution, background-sync]
---

Offline capability is not optional for mobile apps — cellular networks are unreliable, users enter tunnels and basements, and users expect their data to persist between sessions. The complexity of offline architecture scales with sync complexity: read-only cache is trivial; bidirectional sync with conflict resolution is one of the hardest problems in software. Define your offline model explicitly before implementing persistence.

## Summary

Mobile offline patterns use local databases (Room+SQLite for Android, Core Data or GRDB for iOS) as the primary source of truth, with network sync as a background process. The "offline-first" pattern means the UI reads from local storage and writes to a local queue, which syncs independently. Conflict resolution strategies range from "last write wins" to CRDTs for complex cases. Background sync uses WorkManager (Android) or BGTaskScheduler (iOS) — not raw background threads.

## Deep Guidance

### Storage Layer Options

**Android: Room (SQLite abstraction)**

Room is the recommended local database for Android. It enforces compile-time query validation:

```kotlin
@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val id: String,
    val name: String,
    val email: String,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
    @ColumnInfo(name = "sync_status") val syncStatus: SyncStatus = SyncStatus.SYNCED
)

enum class SyncStatus { SYNCED, PENDING_CREATE, PENDING_UPDATE, PENDING_DELETE }

@Dao
interface UserDao {
    @Query("SELECT * FROM users WHERE sync_status != 'PENDING_DELETE'")
    fun observeUsers(): Flow<List<UserEntity>>

    @Query("SELECT * FROM users WHERE sync_status != 'SYNCED'")
    suspend fun getPendingSync(): List<UserEntity>

    @Upsert
    suspend fun upsert(user: UserEntity)

    @Query("UPDATE users SET sync_status = :status WHERE id = :id")
    suspend fun updateSyncStatus(id: String, status: SyncStatus)
}

@Database(entities = [UserEntity::class], version = 1, exportSchema = true)
abstract class AppDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
}
```

Schema migrations: export schema with `exportSchema = true` (required for migration testing). Write explicit migrations:
```kotlin
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE users ADD COLUMN avatar_url TEXT")
    }
}
```

**Android: DataStore for preferences**
- `Preferences DataStore`: key-value pairs for simple settings (replaces SharedPreferences)
- `Proto DataStore`: typed storage using Protocol Buffers for structured preferences
- DataStore is coroutine-native; SharedPreferences is synchronous on the main thread — never use SharedPreferences for new code

```kotlin
val dataStore: DataStore<Preferences> = context.createDataStore(name = "settings")
val USER_TOKEN = stringPreferencesKey("user_token")

// Write
dataStore.edit { settings -> settings[USER_TOKEN] = token }

// Read
val tokenFlow: Flow<String?> = dataStore.data.map { it[USER_TOKEN] }
```

**iOS: GRDB (SQLite wrapper)**

GRDB provides a type-safe Swift SQLite interface with Combine/async integration:

```swift
struct User: Codable, FetchableRecord, PersistableRecord {
    var id: String
    var name: String
    var email: String
    var updatedAt: Date
    var syncStatus: SyncStatus = .synced
}

// Write
try dbQueue.write { db in
    try user.save(db)  // INSERT OR REPLACE
}

// Observe changes
let observation = ValueObservation.tracking { db in
    try User.filter(Column("syncStatus") != SyncStatus.pendingDelete).fetchAll(db)
}
observation.start(in: dbQueue) { users in
    // React to database changes
}
```

**iOS: Core Data (Apple's ORM)**

Core Data is the Apple-native persistence framework. It provides object graph management, lazy faulting, and iCloud sync (CloudKit integration):

```swift
// NSManagedObject subclass
@objc(UserMO)
class UserMO: NSManagedObject {
    @NSManaged var id: String
    @NSManaged var name: String
    @NSManaged var syncStatus: Int16
}

// Fetch with NSFetchedResultsController for UI reactivity
let request: NSFetchRequest<UserMO> = UserMO.fetchRequest()
request.predicate = NSPredicate(format: "syncStatus != %d", SyncStatus.pendingDelete.rawValue)
request.sortDescriptors = [NSSortDescriptor(keyPath: \UserMO.name, ascending: true)]

let controller = NSFetchedResultsController(
    fetchRequest: request,
    managedObjectContext: viewContext,
    sectionNameKeyPath: nil,
    cacheName: nil
)
```

Use a background `NSManagedObjectContext` for data imports — never import on the `viewContext` (main thread). Merge changes back to viewContext with `mergeChanges(fromContextDidSave:)`.

**iOS: SwiftData (iOS 17+)**

SwiftData is the modern replacement for Core Data with a Swift-native API:

```swift
@Model
class User {
    var id: String
    var name: String
    var email: String
    var syncStatus: SyncStatus

    init(id: String, name: String, email: String) {
        self.id = id
        self.name = name
        self.email = email
        self.syncStatus = .synced
    }
}

// Query with SwiftUI
@Query(filter: #Predicate<User> { $0.syncStatus != .pendingDelete })
var users: [User]
```

SwiftData targets iOS 17+ — if supporting iOS 16, use GRDB or Core Data.

### Offline-First Architecture

**The offline-first pattern**
The UI never calls the network directly. All writes go to the local database with a `PENDING` sync status. A background sync engine reads pending items and attempts to sync:

```
User Action → Write to Local DB (status: PENDING) → Notify UI
                                    ↓
                          Background Sync Engine
                                    ↓
                          POST/PATCH/DELETE to API
                                    ↓
                     Success: Update status to SYNCED
                     Failure: Retry with exponential backoff
```

**Repository pattern for offline-first (Android)**
```kotlin
class UserRepository @Inject constructor(
    private val userDao: UserDao,
    private val userApi: UserApi,
    private val syncQueue: SyncQueue
) {
    fun observeUsers(): Flow<List<User>> =
        userDao.observeUsers().map { entities -> entities.map { it.toDomain() } }

    suspend fun updateUser(user: User) {
        // Write locally first — UI responds immediately
        userDao.upsert(user.toEntity().copy(syncStatus = SyncStatus.PENDING_UPDATE))
        // Enqueue sync (fires in background)
        syncQueue.enqueue(SyncOperation.UpdateUser(user.id))
    }
}
```

**Sync queue implementation (Android: WorkManager)**
```kotlin
class SyncWorker(
    context: Context,
    params: WorkerParameters,
    private val userRepository: UserRepository,
    private val userApi: UserApi
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val pending = userRepository.getPendingSync()
        var hasFailure = false

        for (item in pending) {
            try {
                when (item.syncStatus) {
                    SyncStatus.PENDING_CREATE -> userApi.createUser(item.toDto())
                    SyncStatus.PENDING_UPDATE -> userApi.updateUser(item.id, item.toDto())
                    SyncStatus.PENDING_DELETE -> userApi.deleteUser(item.id)
                    else -> continue
                }
                userRepository.markSynced(item.id)
            } catch (e: Exception) {
                hasFailure = true
                // Log but continue — sync other items
            }
        }
        return if (hasFailure) Result.retry() else Result.success()
    }
}

// Schedule on connectivity restored
val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
    .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
    .build()
WorkManager.getInstance(context).enqueueUniqueWork("sync", ExistingWorkPolicy.KEEP, syncRequest)
```

**Sync queue implementation (iOS: BGTaskScheduler)**
```swift
// Register in AppDelegate/App
BGTaskScheduler.shared.register(
    forTaskWithIdentifier: "com.example.myapp.sync",
    using: nil
) { task in
    SyncEngine.shared.performSync(task: task as! BGProcessingTask)
}

// Schedule sync
func scheduleSync() {
    let request = BGProcessingTaskRequest(identifier: "com.example.myapp.sync")
    request.requiresNetworkConnectivity = true
    request.requiresExternalPower = false
    try? BGTaskScheduler.shared.submit(request)
}
```

### Conflict Resolution Strategies

**Last Write Wins (LWW)**
- Simplest strategy: the record with the most recent `updatedAt` timestamp wins
- Appropriate for: user preferences, profile data where overwriting is acceptable
- Pitfall: clock skew between client and server can cause older data to win. Always use server time, not client time, as the authoritative timestamp.

```kotlin
// Server-side merge
fun mergeUser(local: UserDto, server: UserDto): UserDto =
    if (local.updatedAt > server.updatedAt) local else server
```

**Server Wins**
- On conflict, the server version is always authoritative. Client changes are discarded.
- Appropriate for: data owned by the server (inventory, pricing), or when conflicts are rare
- Implementation: on sync, fetch the latest server version and overwrite local changes

**Client Wins**
- On conflict, the client's offline changes are always applied.
- Appropriate for: personal data the user expects to control (notes, settings, journal entries)
- Implementation: send client changes with `If-Unmodified-Since` or ETag; if conflict, apply client version and bump server version

**Three-Way Merge**
- Merge the base version, client version, and server version to produce a merged result
- Used for text fields where both sides should be preserved (collaborative editing)
- Complex to implement correctly — use a CRDT library or operational transform engine rather than writing from scratch

**CRDTs (Conflict-free Replicated Data Types)**
- Data structures that guarantee convergence without central coordination
- Appropriate for: collaborative features, distributed sync without a central server
- Common types: G-Counter (increment only), PN-Counter (increment/decrement), LWW-Register, OR-Set (add/remove set)
- Libraries: Automerge (Swift+Kotlin), Yjs (cross-platform via Wasm)

### Network State Detection

**Android: ConnectivityManager**
```kotlin
val connectivityManager = context.getSystemService<ConnectivityManager>()
val networkCallback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) { triggerSync() }
    override fun onLost(network: Network) { pauseSync() }
}
connectivityManager.registerDefaultNetworkCallback(networkCallback)
```

**iOS: NWPathMonitor**
```swift
let monitor = NWPathMonitor()
monitor.pathUpdateHandler = { path in
    if path.status == .satisfied {
        Task { await SyncEngine.shared.sync() }
    }
}
monitor.start(queue: DispatchQueue(label: "NetworkMonitor"))
```

Always debounce network transitions — connectivity can oscillate rapidly when entering/leaving coverage. Implement a minimum stable duration (e.g., 2 seconds of connectivity) before triggering sync.
