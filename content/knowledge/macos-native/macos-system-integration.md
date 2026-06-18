---
name: macos-system-integration
description: >-
  FSEvents vs DispatchSource file watching, NSWorkspace (launching/notifications), UNUserNotificationCenter, SMAppService login items (macOS 13+), URL schemes, and external tool integration
topics:
  - macos-native
  - system-integration
  - fsevents
  - notifications
  - login-items
  - url-schemes
volatility: evolving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/coreservices/file_system_events
  - url: https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/FSEvents_ProgGuide/UsingtheFSEventsFramework/UsingtheFSEventsFramework.html
  - url: https://developer.apple.com/documentation/appkit/nsworkspace
  - url: https://developer.apple.com/documentation/usernotifications/unusernotificationcenter
  - url: https://developer.apple.com/documentation/servicemanagement/smappservice
---

macOS system integration covers the OS-level hooks that make an app feel native: watching the file system for changes, launching other apps and responding to workspace events, delivering user notifications, persisting as a login item, and registering a URL scheme for deep linking.

## Summary

**File system watching:** Use `FSEventStreamCreate` (CoreServices) for recursive directory tree watching; use `DispatchSource.makeFileSystemObjectSource` (a kqueue wrapper) for precise per-file/descriptor monitoring. FSEvents is kernel-level and efficient for broad watching; DispatchSource is simpler for a single known file. **Workspace:** `NSWorkspace.shared.open(_:)` for URLs; `NSWorkspace.shared.openApplication(at:configuration:completionHandler:)` for launching apps; `NSWorkspace.shared.notificationCenter` for workspace events. **Notifications:** `UNUserNotificationCenter` (macOS 10.14+, works without sandbox). **Login items:** `SMAppService.mainApp.register()` (ServiceManagement, macOS 13+) replaces deprecated `SMLoginItemSetEnabled`. **URL schemes:** `CFBundleURLTypes` in `Info.plist`; handled by `application(_:open:)` on `NSApplicationDelegate`.

## Deep Guidance

### FSEvents — Directory Tree Watching

FSEvents monitors directories (and their subtrees) for file system changes at the kernel level. It is the right choice when watching a git repository, a workspace folder, or any directory tree for arbitrary modifications.

```swift
import CoreServices

// Callback function (C convention):
let callback: FSEventStreamCallback = { streamRef, contextInfo, numEvents, eventPaths, eventFlags, eventIds in
    let paths = unsafeBitCast(eventPaths, to: NSArray.self) as! [String]
    let flags = Array(UnsafeBufferPointer(start: eventFlags, count: numEvents))
    for (index, path) in paths.enumerated() {
        let flag = flags[index]
        if flag & UInt32(kFSEventStreamEventFlagItemModified) != 0 {
            print("Modified: \(path)")
        }
        if flag & UInt32(kFSEventStreamEventFlagItemCreated) != 0 {
            print("Created: \(path)")
        }
        if flag & UInt32(kFSEventStreamEventFlagItemRemoved) != 0 {
            print("Removed: \(path)")
        }
    }
}

// Create and start the stream:
let pathsToWatch = ["/Users/you/Documents/MyProject"] as CFArray
var context = FSEventStreamContext(
    version: 0, info: nil, retain: nil, release: nil, copyDescription: nil
)
let stream = FSEventStreamCreate(
    kCFAllocatorDefault,
    callback,
    &context,
    pathsToWatch,
    FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
    0.5,  // latency in seconds — coalesces rapid changes
    FSEventStreamCreateFlags(
        kFSEventStreamCreateFlagFileEvents |  // per-file events (not just directory-level)
        kFSEventStreamCreateFlagUseCFTypes    // paths delivered as CFString (NSString)
    )
)!

// Schedule on a dispatch queue (FSEventStreamSetDispatchQueue available since macOS 10.6;
// FSEventStreamScheduleWithRunLoop is deprecated as of macOS 13 — prefer dispatch queue):
FSEventStreamSetDispatchQueue(stream, DispatchQueue.global(qos: .utility))
FSEventStreamStart(stream)

// When done watching:
FSEventStreamStop(stream)
FSEventStreamInvalidate(stream)
FSEventStreamRelease(stream)
```

**Key flags:**

| Flag | Effect |
|---|---|
| `kFSEventStreamCreateFlagFileEvents` | Per-file granularity; without it you get only directory-level coalesced events |
| `kFSEventStreamCreateFlagUseCFTypes` | Paths delivered as `CFString`/`NSString` arrays |
| `kFSEventStreamCreateFlagNoDefer` | Deliver events immediately (no coalescing delay) |
| `kFSEventStreamCreateFlagIgnoreSelf` | Ignore events caused by the watching process itself |

**Event item flags** (only when `kFSEventStreamCreateFlagFileEvents` is set):

| Flag | Meaning |
|---|---|
| `kFSEventStreamEventFlagItemCreated` | File or directory created |
| `kFSEventStreamEventFlagItemRemoved` | File or directory removed |
| `kFSEventStreamEventFlagItemModified` | File data written |
| `kFSEventStreamEventFlagItemRenamed` | File or directory renamed |
| `kFSEventStreamEventFlagItemIsFile` | The event path is a file |
| `kFSEventStreamEventFlagItemIsDir` | The event path is a directory |
| `kFSEventStreamEventFlagMustScanSubDirs` | An event was dropped; scan the directory manually |

`sinceWhen: FSEventStreamEventId(kFSEventStreamEventIdSinceNow)` delivers only events that occur after the stream starts. Pass a saved `lastEventId` to replay events since the last session.

### DispatchSource — Per-File Descriptor Watching

Use DispatchSource when you need to watch a single specific file or directory you have already opened. It wraps kqueue and is simpler than FSEvents for this narrow use case.

```swift
import Foundation

final class FileWatcher {
    private var source: DispatchSourceFileSystemObject?
    private var fileDescriptor: Int32 = -1

    func watch(url: URL, handler: @escaping () -> Void) {
        fileDescriptor = open(url.path, O_EVTONLY)
        guard fileDescriptor != -1 else { return }

        source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fileDescriptor,
            eventMask: [.write, .delete, .rename, .attrib],
            queue: DispatchQueue.global(qos: .utility)
        )
        source?.setEventHandler(handler: handler)
        source?.setCancelHandler {
            close(self.fileDescriptor)
        }
        source?.resume()
    }

    func stop() {
        source?.cancel()
        source = nil
    }
}
```

**DispatchSource.FileSystemEvent options:** `.write`, `.delete`, `.rename`, `.attrib`, `.extend` (size increase), `.link` (link count change), `.revoke` (fd revoked).

**When to use which:**
- **FSEvents:** Watching a directory tree recursively; watching many paths; need historical replay via `sinceWhen`; watching paths you don't necessarily have open.
- **DispatchSource:** Watching one specific file/directory inode you have open; simpler setup; no need for recursive subtree tracking.

### NSWorkspace — Launching Apps and Workspace Notifications

```swift
import AppKit

// Open a URL (file, http, custom scheme):
NSWorkspace.shared.open(URL(string: "https://example.com")!)

// Open a file in its default app:
NSWorkspace.shared.open(URL(fileURLWithPath: "/path/to/document.pdf"))

// Launch a specific app by URL (macOS 10.15+):
let appURL = URL(fileURLWithPath: "/Applications/Xcode.app")
let config = NSWorkspaceOpenConfiguration()
config.activates = true
NSWorkspace.shared.openApplication(at: appURL, configuration: config) { app, error in
    if let error { print("Launch error: \(error)") }
}
```

**Workspace notifications** — observe on `NSWorkspace.shared.notificationCenter`, NOT `NotificationCenter.default`:

```swift
let center = NSWorkspace.shared.notificationCenter

center.addObserver(
    forName: NSWorkspace.didActivateApplicationNotification,
    object: nil,
    queue: .main
) { notification in
    if let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey]
        as? NSRunningApplication {
        print("Activated: \(app.localizedName ?? "unknown")")
    }
}
```

Common workspace notification names:
- `NSWorkspace.didActivateApplicationNotification`
- `NSWorkspace.didTerminateApplicationNotification`
- `NSWorkspace.didLaunchApplicationNotification`
- `NSWorkspace.didMountNotification` / `didUnmountNotification`
- `NSWorkspace.willSleepNotification` / `didWakeNotification`

### UNUserNotificationCenter — User Notifications

`UNUserNotificationCenter` works for both sandboxed and non-sandboxed macOS apps (macOS 10.14+). The app must be code-signed for the authorization dialog to appear.

```swift
import UserNotifications

// Request permission (do this early, e.g., on first launch):
Task {
    let granted = try await UNUserNotificationCenter.current()
        .requestAuthorization(options: [.alert, .sound, .badge])
    print("Notifications granted: \(granted)")
}

// Post a notification:
func postNotification(title: String, body: String) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default

    let request = UNNotificationRequest(
        identifier: UUID().uuidString,
        content: content,
        trigger: nil  // nil = deliver immediately
    )

    UNUserNotificationCenter.current().add(request) { error in
        if let error { print("Notification error: \(error)") }
    }
}

// Handle foreground delivery (set delegate in AppDelegate or App init):
class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show the notification even when the app is in the foreground:
        completionHandler([.banner, .sound])
    }
}
```

`NSUserNotificationCenter` (the older API) is deprecated since macOS 11 and must not be used in new code.

### SMAppService — Login Items (macOS 13+)

`SMAppService` (ServiceManagement framework, macOS 13+) is the current API for registering an app or helper as a login item. It replaces the deprecated `SMLoginItemSetEnabled` and the removed `LSSharedFileList` APIs.

```swift
import ServiceManagement

// Register the main app as a login item:
do {
    try SMAppService.mainApp.register()
} catch {
    print("Failed to register login item: \(error)")
}

// Unregister:
try? SMAppService.mainApp.unregister()

// Check status:
switch SMAppService.mainApp.status {
case .notRegistered:
    // Not yet registered or was removed by the user
case .enabled:
    // Registered and will launch at login
case .requiresApproval:
    // Registered but user must approve in System Settings → General → Login Items
    // Open System Settings to the Login Items pane:
    SMAppService.openSystemSettingsLoginItems()
case .notFound:
    // Framework could not find the service (misconfiguration)
@unknown default:
    break
}
```

For a **helper app** (a separate bundle inside the main app, launched as a login item):

```swift
let helper = SMAppService.loginItem(identifier: "com.example.MyApp.Helper")
try helper.register()
```

**What `SMAppService` replaces:**
- `SMLoginItemSetEnabled(_:_:)` — deprecated; still functional but removed in a future OS.
- `LSSharedFileList` / `LSSharedFileListInsertItemURL` — removed in macOS 13.

**On macOS 12 and earlier,** fall back to `SMLoginItemSetEnabled` with the bundle identifier of a login item helper embedded inside the main app bundle.

### URL Schemes — Deep Linking

Register a custom URL scheme so other apps (or the browser) can activate your app at a specific state.

**Info.plist registration:**

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.example.myscheme</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>myapp</string>
    </array>
  </dict>
</array>
```

**Handling incoming URLs** in `NSApplicationDelegate`:

```swift
func application(_ app: NSApplication, open urls: [URL]) {
    for url in urls {
        // url.scheme == "myapp"
        // url.host, url.path, url.queryItems via URLComponents
        handleDeepLink(url)
    }
}
```

**Note:** This delegate method (`application(_:open:)` with `[URL]`) is mutually exclusive with manually registering an Apple Event handler for `kInternetEventClass / kAEGetURL` via `NSAppleEventManager`. Use one or the other, not both.

**Triggering from another app or shell:**

```bash
open "myapp://path/to/action?param=value"
```

```swift
NSWorkspace.shared.open(URL(string: "myapp://path/to/action")!)
```
