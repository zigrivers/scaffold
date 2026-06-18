---
name: macos-privacy-tcc
description: >-
  TCC permission categories, Info.plist usage-description strings, security-scoped bookmarks, and file access patterns for macOS apps
topics:
  - macos-native
  - privacy
  - tcc
  - permissions
  - security
volatility: evolving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/bundleresources/information_property_list
  - url: https://developer.apple.com/documentation/security/app_sandbox
  - url: https://developer.apple.com/documentation/security/security_scoped_bookmarks
  - url: https://developer.apple.com/documentation/avfoundation/cameras_and_media_capture
---

Transparency, Consent, and Control (TCC) is macOS's permission gating layer for sensitive resources: camera, microphone, contacts, calendar, photos, location, screen recording, full-disk access, and more. Apps that access these without proper declarations are silently blocked or rejected from the App Store.

## Summary

Every TCC-protected resource requires a corresponding `NSUsageDescription` string in `Info.plist` explaining why the app needs it, in plain language addressed to the user. Without this key, the access request is blocked and (for App Store builds) the submission is rejected. Runtime permission is requested lazily on first access, or proactively via APIs like `AVCaptureDevice.requestAccess(for:)`. For file-system access beyond the sandbox container, security-scoped bookmarks persist user-granted path access across launches. Full Disk Access is a special TCC grant that bypasses sandbox file restrictions — it requires a manual user grant in System Settings and cannot be requested programmatically.

## Deep Guidance

### TCC Categories and Usage Description Keys

All usage description values must appear in the app target's `Info.plist`. Values are user-facing strings — write them in the user's language, be specific about why the app needs the resource, and do not use technical jargon.

| Resource | Info.plist Key | Notes |
|----------|---------------|-------|
| Camera | `NSCameraUsageDescription` | Required before first `AVCaptureDevice` access |
| Microphone | `NSMicrophoneUsageDescription` | Required before audio capture |
| Contacts | `NSContactsUsageDescription` | `CNContactStore` |
| Calendar | `NSCalendarsUsageDescription` | `EKEventStore` |
| Reminders | `NSRemindersUsageDescription` | `EKEventStore` with reminders |
| Photos (read) | `NSPhotoLibraryUsageDescription` | `PHPhotoLibrary` read |
| Photos (write) | `NSPhotoLibraryAddUsageDescription` | `PHPhotoLibrary` write-only |
| Location (always) | `NSLocationAlwaysAndWhenInUseUsageDescription` | `CLLocationManager` always |
| Location (when in use) | `NSLocationWhenInUseUsageDescription` | `CLLocationManager` WhenInUse |
| Screen Recording | `NSScreenCaptureUsageDescription` | `CGWindowList`, `AVScreenCapture` |
| Desktop folder | `NSDesktopFolderUsageDescription` | Sandbox file access to Desktop |
| Documents folder | `NSDocumentsFolderUsageDescription` | Sandbox file access to Documents |
| Downloads folder | `NSDownloadsFolderUsageDescription` | Sandbox file access to Downloads |
| Network volumes | `NSNetworkVolumesUsageDescription` | Access to network-mounted shares |
| Removable volumes | `NSRemovableVolumesUsageDescription` | USB drives, external disks |
| Bluetooth | `NSBluetoothAlwaysUsageDescription` | `CoreBluetooth` |
| Local network | `NSLocalNetworkUsageDescription` | Bonjour, local multicast |
| Face ID | `NSFaceIDUsageDescription` | `LAContext` biometric auth |
| Motion | `NSMotionUsageDescription` | `CMMotionManager` (macOS limited) |

**Write effective usage descriptions:**
- Bad: "App needs access to your camera."
- Good: "FaceSync uses the camera to scan QR codes for pairing your account. Video is processed on-device and never uploaded."

### Requesting Permission at Runtime

Request permission before the first use — not during onboarding unless you have a clear reason to front-load it. Lazy requesting, at the moment the feature is first needed, produces higher grant rates and user trust.

```swift
import AVFoundation

// Camera
AVCaptureDevice.requestAccess(for: .video) { granted in
    DispatchQueue.main.async {
        if granted {
            self.startCapture()
        } else {
            self.showPermissionDeniedAlert(resource: "camera")
        }
    }
}

// Check current status first (avoid prompting unnecessarily)
let status = AVCaptureDevice.authorizationStatus(for: .video)
switch status {
case .authorized:
    startCapture()
case .notDetermined:
    requestCameraAccess()
case .denied, .restricted:
    showPermissionDeniedAlert(resource: "camera")
@unknown default:
    break
}
```

For Contacts:

```swift
import Contacts

let store = CNContactStore()
store.requestAccess(for: .contacts) { granted, error in
    // …
}
```

For Screen Recording, there is no runtime prompt — the user must grant it manually in System Settings → Privacy & Security → Screen Recording. Check status with `CGPreflightScreenCaptureAccess()` and direct users to System Settings if not granted:

```swift
if !CGPreflightScreenCaptureAccess() {
    // Show alert guiding user to System Settings
    CGRequestScreenCaptureAccess()  // opens System Settings
}
```

### Handling Permission Denial

When a user denies a permission, the system does NOT prompt again automatically — the denial is persisted in the TCC database until the user changes it in System Settings. Your app must:

1. Detect the denied state on each relevant action.
2. Show a clear, contextual alert explaining what was denied and offering a "Open System Settings" button.
3. Link directly to the relevant pane: `NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera")!)`.

```swift
func showPermissionDeniedAlert(resource: String) {
    let alert = NSAlert()
    alert.messageText = "Camera Access Required"
    alert.informativeText = "MyApp needs camera access to scan QR codes. Please enable it in System Settings → Privacy & Security → Camera."
    alert.addButton(withTitle: "Open System Settings")
    alert.addButton(withTitle: "Cancel")
    alert.alertStyle = .warning

    if alert.runModal() == .alertFirstButtonReturn {
        NSWorkspace.shared.open(
            URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera")!
        )
    }
}
```

Common System Preferences privacy URLs:
- Camera: `x-apple.systempreferences:com.apple.preference.security?Privacy_Camera`
- Microphone: `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone`
- Full Disk Access: `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles`
- Screen Recording: `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`
- Contacts: `x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts`

### Full Disk Access

Full Disk Access (FDA) lets an app read all user files, bypassing sandbox restrictions. It cannot be requested programmatically — the user must navigate to System Settings → Privacy & Security → Full Disk Access and toggle the app on. This means:

- Do not design app workflows that require FDA — most users will not grant it.
- If your app genuinely needs FDA (e.g., a backup tool, a system-wide indexer), include a one-time onboarding step that explains why and guides the user to System Settings.
- Check FDA status by attempting to read a protected path and catching the permission error:

```swift
func hasFullDiskAccess() -> Bool {
    // ~/Library/Safari exists and is FDA-gated on macOS 13+
    let testPath = NSHomeDirectory() + "/Library/Safari/Bookmarks.plist"
    return FileManager.default.isReadableFile(atPath: testPath)
}
```

### Security-Scoped Bookmarks for File Access

See also `[[macos-app-sandbox-entitlements]]` for the sandbox context. Security-scoped bookmarks persist user-granted access to paths selected via `NSOpenPanel` or `NSSavePanel`. Without bookmarks, access to the user-selected path expires when the app terminates.

```swift
// Grant: when user selects a folder
func bookmark(url: URL) throws -> Data {
    return try url.bookmarkData(
        options: .withSecurityScope,
        includingResourceValuesForKeys: nil,
        relativeTo: nil
    )
}

// Persist bookmark data (container-safe location)
let key = "bookmark-\(url.path.hashValue)"
UserDefaults.standard.set(try bookmark(url: url), forKey: key)

// Restore on next launch
func restore(key: String) throws -> URL {
    guard let data = UserDefaults.standard.data(forKey: key) else {
        throw BookmarkError.notFound
    }
    var stale = false
    let url = try URL(
        resolvingBookmarkData: data,
        options: .withSecurityScope,
        relativeTo: nil,
        bookmarkDataIsStale: &stale
    )
    if stale {
        // Re-persist fresh bookmark (file may have moved)
        UserDefaults.standard.set(try bookmark(url: url), forKey: key)
    }
    guard url.startAccessingSecurityScopedResource() else {
        throw BookmarkError.accessDenied
    }
    return url  // caller must call stopAccessingSecurityScopedResource() when done
}
```

**Bookmark storage:** For a large number of bookmarks (e.g., a project-per-repository), store them in a `Codable` dictionary persisted to a JSON file in the container directory — `UserDefaults` is not designed for large binary values and degrades in performance.

### Privacy-Sensitive Data Patterns

- **Never log TCC-gated content** (camera frames, microphone audio, contacts, location coordinates) to disk or a logging service.
- **Minimize retention:** load TCC-gated data on demand, process it, and release it. Do not cache contacts or location history unnecessarily.
- **Audit third-party SDKs:** analytics and crash-reporting SDKs can trigger TCC prompts on their own (e.g., AdServices, ATT on iOS). On macOS, review each SDK's privacy manifest (`PrivacyInfo.xcprivacy`) and ensure its declared data use matches your app's.
- **Privacy manifest (`PrivacyInfo.xcprivacy`):** Required for apps that use certain APIs (NSUserDefaults with specific keys, file timestamps, system boot time, disk space, active keyboard, user defaults). Declare all API reasons in the manifest. Xcode 15+ generates a privacy report from your app's manifest — review it before submission.
