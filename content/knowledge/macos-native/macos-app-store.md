---
name: macos-app-store
description: >-
  Mac App Store submission, App Sandbox requirement, App Review guidelines for macOS, receipt validation, and App Store Connect tooling (Transporter, altool deprecation)
topics:
  - macos-native
  - app-store
  - distribution
  - sandbox
  - in-app-purchase
volatility: fast-moving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/app-store/review/guidelines/
  - url: https://developer.apple.com/documentation/appstoreconnectapi
  - url: https://developer.apple.com/documentation/storekit
  - url: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.app-sandbox
  - url: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds
---

The Mac App Store provides distribution, payment processing, and update delivery for macOS apps, but it imposes mandatory constraints — primarily the App Sandbox — that affect what the app can do. Understanding App Review guidelines for macOS-specific patterns (installer-style apps, system utilities, privileged operations) prevents rejections.

## Summary

Every Mac App Store app must enable the **App Sandbox** (`com.apple.security.app-sandbox = true`). Sandbox-incompatible patterns (launching arbitrary executables, accessing paths outside the container without user consent, bundling third-party updaters like Sparkle) are prohibited. Upload builds with **Transporter** or `xcodebuild -exportArchive` + Xcode Organizer; `altool` for uploads is deprecated in favour of Transporter CLI and App Store Connect API. Receipt validation via **StoreKit** is the current approach; raw receipt file parsing is discouraged. In-app purchases use StoreKit 2 (`Product`, `Transaction`) on macOS 12+.

## Deep Guidance

### App Sandbox Requirement

All MAS submissions must include the `com.apple.security.app-sandbox` entitlement set to `true`. This is enforced at submission — builds without it are rejected immediately.

```xml
<!-- MyApp.entitlements -->
<key>com.apple.security.app-sandbox</key>
<true/>
```

The sandbox restricts by default. Grant access incrementally using additional entitlements:

```xml
<!-- Read/write access to files the user selects via open/save panels -->
<key>com.apple.security.files.user-selected.read-write</key>
<true/>

<!-- Read-only access to Downloads folder -->
<key>com.apple.security.files.downloads.read-only</key>
<true/>

<!-- Outbound network connections -->
<key>com.apple.security.network.client</key>
<true/>

<!-- Inbound network connections (server) -->
<key>com.apple.security.network.server</key>
<true/>

<!-- Access to the camera -->
<key>com.apple.security.device.camera</key>
<true/>

<!-- Access to the microphone -->
<key>com.apple.security.device.microphone</key>
<true/>
```

**Sandbox containers:** Each sandboxed app gets an isolated container at `~/Library/Containers/<bundle-id>/`. Files written there are persistent across launches. Do not assume paths outside this container are accessible without a user-granted entitlement or a Security-Scoped Bookmark.

### Security-Scoped Bookmarks

For persistent access to files outside the container (files opened by the user that must be re-accessible on next launch), use security-scoped bookmarks:

```swift
// Resolve a bookmark stored in UserDefaults:
var isStale = false
let url = try URL(
    resolvingBookmarkData: bookmarkData,
    options: .withSecurityScope,
    relativeTo: nil,
    bookmarkDataIsStale: &isStale
)
url.startAccessingSecurityScopedResource()
defer { url.stopAccessingSecurityScopedResource() }
// Use url here
```

Always call `stopAccessingSecurityScopedResource()` — failure to do so leaks a kernel resource.

### App Review Guidelines Relevant to macOS

Key macOS-specific review points (subject to change — consult current guidelines):

- **No third-party updaters:** Do not bundle Sparkle or similar. The MAS manages updates. This is an automatic rejection.
- **No installer-style apps:** Apps must not act as a package manager or installer for other software, with limited exceptions (developer tools in the Developer Tools category).
- **Privileged helper tools:** Apps requiring root access via a privileged helper (`SMJobBless`) face extra scrutiny. Justify the need clearly in the review notes.
- **System extensions and kernel extensions:** Kernel extensions (`kext`) are disallowed in MAS apps. System extensions (DriverKit, Network Extensions) are allowed with the appropriate entitlements and Apple approval.
- **Background operation:** Menu bar apps that run without a Dock icon must not hide all UI — at least one user-accessible UI element (the menu bar icon) is required.
- **Monetisation:** If the app offers any subscription or digital content, it must use in-app purchase (StoreKit). External payment links for digital goods are prohibited.

### Uploading Builds

**Xcode Organizer (GUI):** Archive (`Product → Archive`), then click Distribute App → App Store Connect.

**Validate the artifact before upload:**
```bash
# Validate a .pkg before submitting (altool --validate-app is still functional for validation):
xcrun altool --validate-app -f MyApp.pkg -t osx --apiKey KEY_ID --apiIssuer ISSUER_ID
```

**Transporter CLI (recommended command-line upload path):**

Transporter is available as a standalone app from the Mac App Store. When installed, its CLI binary (`iTMSTransporter`) is invoked via `xcrun iTMSTransporter` (Xcode 11–13) or directly from the Transporter app bundle (Xcode 14+ removed the embedded copy). Note: `.pkg` is the macOS App Store artifact format — never `.ipa` (that is the iOS format).

```bash
# Upload a signed .pkg using App Store Connect API key authentication:
xcrun iTMSTransporter -m upload \
  -assetFile MyApp.pkg \
  -apiKey KEY_ID \
  -apiIssuer ISSUER_ID

# Username/password authentication (app-specific password if 2FA is enabled):
xcrun iTMSTransporter -m upload \
  -assetFile MyApp.pkg \
  -u you@example.com \
  -p xxxx-xxxx-xxxx-xxxx
```

**Legacy path (`altool` — deprecated for uploads):**
```bash
xcrun altool --upload-app -f MyApp.pkg -t osx \
  --apiKey KEY_ID \
  --apiIssuer ISSUER_ID
```

`altool` for notarization was retired in November 2023; for App Store uploads, Apple recommends migrating to `iTMSTransporter` (via the Transporter app) or the App Store Connect API directly. Check Apple's current documentation for the current-recommended upload path before setting up new CI pipelines.

### Receipt Validation and In-App Purchase

**StoreKit 2 (macOS 12+, recommended):**

```swift
import StoreKit

// Load products:
let products = try await Product.products(for: ["com.example.pro"])

// Purchase:
let result = try await products.first!.purchase()
switch result {
case .success(let verification):
    switch verification {
    case .verified(let transaction):
        // Unlock content
        await transaction.finish()
    case .unverified:
        // Handle unverified transaction
    }
case .pending:
    break  // Ask the user to complete the purchase in Settings
case .userCancelled:
    break
@unknown default:
    break
}

// Restore purchases / check entitlements on launch:
for await result in Transaction.currentEntitlements {
    if case .verified(let transaction) = result {
        // Grant entitlement for transaction.productID
    }
}
```

**Avoid raw receipt parsing:** Parsing `Bundle.main.appStoreReceiptURL` and verifying the receipt cryptographically yourself (the older approach) is complex and fragile. StoreKit 2's `Transaction` API handles this on-device. Only use server-side receipt validation (`/verifyReceipt`) if you must support macOS 11 or below — and note that Apple deprecated the `/verifyReceipt` endpoint in 2023; prefer the App Store Server API or StoreKit 2 server notifications for any new server-side validation work. `/verifyReceipt` is a narrow legacy fallback only.

### TestFlight for macOS

TestFlight is available for macOS 12+ apps. Upload a build to App Store Connect, add internal or external testers, and distribute via the TestFlight Mac app. TestFlight builds bypass Gatekeeper; they do not require stapling. External testing requires App Review approval. Use TestFlight to validate your sandbox entitlements and StoreKit flows before submitting for review.

### Checklist Before Submitting

- App Sandbox entitlement enabled
- All required entitlements declared (no over-broad entitlements)
- No Sparkle or third-party updater bundled
- Privacy usage descriptions present for every protected resource (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, etc.)
- Screenshots in correct Mac resolutions (App Store Connect specifies required sizes)
- Build uploaded and processing complete in App Store Connect before submitting for review
- StoreKit in-app purchase products created and approved in App Store Connect (can take days)
