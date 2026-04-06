---
name: mobile-app-distribution
description: TestFlight and Google Play internal track, enterprise MDM distribution, staged rollouts, beta testing programs, and OTA updates for mobile apps
topics: [mobile-app, distribution, testflight, google-play, enterprise-mdm, staged-rollout, beta-testing, ota]
---

Mobile app distribution has more complexity than web deployment: app store review introduces unpredictable latency, staged rollouts require monitoring and rollback planning, enterprise distribution requires MDM infrastructure, and React Native/Expo apps have limited OTA update options for business logic. Design the distribution pipeline before writing code — it affects app architecture (feature flags, forced update logic) and CI/CD setup.

## Summary

iOS pre-release distribution uses TestFlight (internal team up to 100 testers, external up to 10,000). Android uses Google Play's internal testing, closed testing (alpha), and open testing (beta) tracks. Enterprise apps distribute via MDM (Jamf, Microsoft Intune, VMware Workspace ONE) or in-house provisioning. Staged rollouts (production track, percentage-based) allow monitoring before full release. Forced update patterns prevent users from running critically broken versions. React Native apps can deliver business logic updates OTA via Expo Updates or CodePush within platform policy limits.

## Deep Guidance

### TestFlight (iOS)

**Internal testing**
- Up to 100 internal testers (must be App Store Connect users in your team)
- Available within minutes of upload — no Apple review required
- Access via TestFlight app on device; invitations via email
- 90-day expiration per build; can be extended

**External testing**
- Up to 10,000 testers (external — no App Store Connect account required)
- Requires Apple review for first submission to a group (24–48 hours); subsequent builds with same metadata are faster
- Tester groups allow segmented beta access (e.g., "power users", "partners")
- Feedback is collected via TestFlight screenshot feedback feature

**Fastlane Pilot for automated TestFlight upload**
```ruby
lane :beta do
  # Build
  gym(
    scheme: "MyApp",
    configuration: "Release",
    export_method: "app-store"
  )

  # Upload to TestFlight
  pilot(
    app_identifier: "com.example.myapp",
    changelog: ENV["CHANGELOG"] || git_commit_message,
    distribute_external: false,
    notify_external_testers: false,
    skip_waiting_for_build_processing: false  # wait for processing before distributing
  )
end
```

**App Store Connect API key for CI**
```ruby
# Authenticate with API key (no 2FA required — safe for CI)
app_store_connect_api_key(
    key_id: ENV["ASC_KEY_ID"],
    issuer_id: ENV["ASC_ISSUER_ID"],
    key_content: ENV["ASC_PRIVATE_KEY"],
    is_key_content_base64: true,
    in_house: false
)
```

Generate the API key in App Store Connect > Users and Access > Keys. Store as CI secrets — this key has broad permissions.

**TestFlight build metadata**
- `What to Test` field: mandatory for external testing review; tells reviewers what to focus on
- Build version must be higher than any previously uploaded build — automate with Fastlane's `increment_build_number`
- Keep a changelog per build: git commit summaries work for internal; user-friendly summaries for external

**Crash-free rate monitoring**
Monitor TestFlight crash-free rate in Xcode Organizer or App Store Connect. Set a threshold (e.g., < 99% crash-free is a blocker) before promoting a TestFlight build to App Store production.

### Google Play Distribution Tracks

**Track hierarchy**
```
Internal testing → Closed testing (alpha) → Open testing (beta) → Production
```

Each track has its own review requirements and rollout speed:
- Internal: up to 100 testers, available in minutes, no review
- Closed (alpha): invite-only Google Groups, available in hours, Google review required
- Open (beta): public opt-in, available in days, Google review required
- Production: public, subject to full review

**Track promotion strategy**
```
CI/CD → Internal testing (every PR merge)
     → Closed alpha (every weekly release candidate)
     → Open beta (after 3 days crash-free in alpha)
     → Production 10% (staged rollout start)
     → Production 100% (after 48 hours monitoring)
```

**Fastlane Supply for Play Store**
```ruby
lane :deploy_internal do
  gradle(task: "bundle", build_type: "Release")
  supply(
    track: "internal",
    aab: "app/build/outputs/bundle/release/app-release.aab",
    package_name: "com.example.myapp",
    json_key_data: ENV["PLAY_STORE_SERVICE_ACCOUNT_JSON"]
  )
end

lane :promote_to_beta do
  supply(
    track: "alpha",
    track_promote_to: "beta",
    package_name: "com.example.myapp"
  )
end
```

**Service account authentication**
- Create a service account in Google Play Console: Setup > API access
- Grant the service account "Release Manager" role
- Download the JSON key file — store as a CI secret (`PLAY_STORE_SERVICE_ACCOUNT_JSON`)
- Rotate the service account key annually

### Staged Rollouts

**iOS: Phased Release**
App Store Connect supports phased release for iOS apps:
- Day 1: 1% of eligible users
- Day 2: 2%
- Day 3–6: doubling per day to 5%, 10%, 20%, 50%
- Day 7: 100%

Pause the rollout if crash rate spikes. Resume manually when stable. This is a 7-day automatic progression — you cannot customize the percentages on iOS.

**Android: Staged Production Rollout**
Google Play provides fine-grained percentage control:
```kotlin
// Via Fastlane
supply(
    track: "production",
    rollout: "0.1",  // 10% rollout
    aab: "app-release.aab"
)

// Increase rollout after monitoring
supply(
    track: "production",
    rollout: "0.5"  // promote to 50%
)
```

**Rollout monitoring checklist**
Before increasing rollout percentage:
- Crash-free users rate > 99.5% (Firebase Crashlytics / Play Console)
- ANR (Application Not Responding) rate < 0.25% (Android Play Console)
- Network error rate stable (Firebase Performance / custom dashboard)
- Revenue/conversion metrics not regressing (analytics)
- No P0 support tickets or social media reports

**Rollback strategy**
iOS: halt phased release in App Store Connect; users who already updated cannot be rolled back (no downgrade mechanism). Prepare a hotfix release and fast-track it through the queue.

Android: halt staged rollout and set rollout to 0%. Users who already updated are on the new version. Prepare a hotfix and expedite through the Play review queue.

### Enterprise MDM Distribution

**iOS: In-House (Apple Developer Enterprise Program)**
- Requires Apple Developer Enterprise Program ($299/year)
- Apps distributed via a hosted IPA with a distribution manifest plist
- Install via Safari on device: `itms-services://?action=download-manifest&url=https://example.com/manifest.plist`
- No App Store review — responsibility for content is entirely the enterprise's
- Provisioning profiles expire annually — plan renewal in advance

**iOS: MDM-managed distribution**
- Push apps to enrolled devices via MDM (Jamf, Microsoft Intune, Mosyle)
- Apps can be silently installed on managed devices without user interaction
- VPP (Volume Purchase Program) for App Store apps; custom B2B apps for private distribution
- Device enrollment: Device Enrollment Program (DEP/ABM) for zero-touch setup

**Android: Enterprise distribution**
- Google Play managed: publish to a private Google Play track visible only to enrolled organization devices
- APK sideloading via MDM: push APK directly to managed devices
- Android Enterprise fully managed device profile for dedicated devices (kiosks, logistics scanners)
- `android:sharedUserId` removed in API 29+ — do not rely on shared user IDs for enterprise app families

**MDM lifecycle events**
Apps distributed via MDM receive signals for:
- Device enrollment/unenrollment: handle data wipe
- Policy changes: respond to new restrictions (camera, clipboard, screen capture)
- Managed app configuration: receive key-value configuration from MDM without hardcoding server URLs

### Forced Update Patterns

**Remote config-driven forced update**
```swift
// iOS: Firebase Remote Config
let remoteConfig = RemoteConfig.remoteConfig()
remoteConfig.fetchAndActivate { status, error in
    let minVersion = remoteConfig.configValue(forKey: "min_required_version").stringValue
    let currentVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"

    if currentVersion.isOlderThan(minVersion) {
        // Show forced update modal — no dismissal
        ForceUpdateViewController.show(on: rootViewController)
    }
}
```

```kotlin
// Android: Firebase Remote Config
remoteConfig.fetchAndActivate().addOnCompleteListener { task ->
    val minVersion = remoteConfig.getString("min_required_version")
    val currentVersion = BuildConfig.VERSION_NAME

    if (currentVersion.isOlderThan(minVersion)) {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName")))
        finish()
    }
}
```

**Forced update design principles**
- Show the forced update screen only for critical security fixes or data-breaking changes — not convenience
- Always provide context: "This update is required to keep your account secure"
- Deep link to the App Store / Play Store update page
- Never block the update prompt — no dismiss button for forced updates
- For soft updates (recommended but not required), show a dismissable banner with a "Update now" action

### OTA (Over-the-Air) Updates for React Native / Expo

**Expo Updates**
```json
// app.json
{
  "expo": {
    "updates": {
      "enabled": true,
      "checkAutomatically": "ON_LOAD",
      "fallbackToCacheTimeout": 0
    }
  }
}
```

```typescript
import * as Updates from 'expo-updates';

async function checkForUpdate() {
    try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            // Prompt user or reload silently
            await Updates.reloadAsync();
        }
    } catch (error) {
        // Update check failure should not affect UX
    }
}
```

**OTA update constraints (platform policy)**
- iOS: OTA updates may only deliver JavaScript and asset changes — cannot modify native modules, add permissions, or change app metadata
- Android: same restrictions — OTA cannot add new native capabilities
- Both platforms: OTA updates that change app behavior to circumvent App Store / Play Store policies result in account termination
- Safe to OTA: bug fixes in JS logic, UI changes, copy changes, non-native feature additions
- Requires native build: new permissions, new native modules, SDK upgrades, binary dependencies
