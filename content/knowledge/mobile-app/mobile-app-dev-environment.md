---
name: mobile-app-dev-environment
description: Simulator and emulator setup, physical device testing, hot reload, debugging tools, and developer toolchain for iOS and Android
topics: [mobile-app, dev-environment, simulator, emulator, debugging, xcode, android-studio, hot-reload]
---

Mobile development environments are significantly more complex than web development: two IDEs, two simulators, hardware-specific debugging, code signing requirements, and platform SDK updates that break builds. A well-configured dev environment reduces friction by 50% — standardize tool versions, automate simulator setup, and document the steps from clean machine to first successful build.

## Summary

iOS development requires Xcode (macOS only) with simulators managed via `xcodebuild` or Xcode's device window. Android development uses Android Studio with AVD Manager for emulators and ADB for device management. Both platforms support hot reload (SwiftUI previews, Compose previews, Metro bundler for React Native). Debugging tools include LLDB (iOS), Android Studio debugger, and Instruments/Android Profiler for performance analysis. Standardize SDK versions in `.tool-versions` or `mise.toml` to prevent team drift.

## Deep Guidance

### iOS Toolchain Setup

**Required tools**
- Xcode: install from the Mac App Store or `xcodes` CLI — not from third-party sources
- Command Line Tools: `xcode-select --install`
- Simulators: downloaded on demand within Xcode or via `xcodebuild -downloadPlatform iOS`
- CocoaPods (if used): `gem install cocoapods` (prefer rbenv/mise to manage Ruby version)
- Bundler for Ruby tools: `gem install bundler && bundle install` (locks CocoaPods/Fastlane versions)
- Mint for Swift CLI tools: `brew install mint` — pin versions in `Mintfile`

**Version pinning**
```
# .tool-versions (asdf/mise)
xcode 15.4
ruby 3.3.0
node 20.18.0     # if using React Native
```

**Simulator management**
```bash
# List available simulators
xcrun simctl list devices

# Boot a simulator
xcrun simctl boot "iPhone 16 Pro"

# Open Simulator app (required to see the UI)
open -a Simulator

# Install app on booted simulator
xcrun simctl install booted path/to/MyApp.app

# Launch app
xcrun simctl launch booted com.example.myapp

# Take screenshot
xcrun simctl io booted screenshot screenshot.png

# Trigger push notification (iOS 16+)
xcrun simctl push booted com.example.myapp payload.json

# Reset simulator (clears all data)
xcrun simctl erase "iPhone 16 Pro"
```

**Useful Xcode settings for development velocity**
- Enable "Show build durations": Preferences > Behaviors > Build (custom)
- Increase build parallelism: `defaults write com.apple.dt.Xcode IDEBuildOperationMaxNumberOfConcurrentCompileTasks $(sysctl -n hw.ncpu)`
- Enable address sanitizer and thread sanitizer for debug builds to catch memory issues early
- Explicit modules: set `SWIFT_ENABLE_EXPLICIT_MODULES = YES` for faster incremental builds (Xcode 16+)

**SwiftUI Previews for hot-reload-like iteration**
```swift
#Preview {
    UserProfileView(viewModel: UserProfileViewModel.preview)
}

extension UserProfileViewModel {
    static var preview: UserProfileViewModel {
        let vm = UserProfileViewModel(repository: MockUserRepository())
        vm.user = User(id: "1", name: "Jane Smith", email: "jane@example.com")
        return vm
    }
}
```

Previews require a `PreviewProvider`-compatible data setup. Use protocol-based fakes rather than mocks — they compile faster and work in both tests and previews.

**Physical device setup (iOS)**
- Developer account: free account allows device testing; paid account required for distribution
- Device registration: Settings > Privacy > Developer Mode (iOS 16+) must be enabled
- Add device UDID to provisioning profile in Apple Developer portal, or use Automatic Signing in Xcode
- Trust the developer certificate on device: Settings > General > VPN & Device Management

### Android Toolchain Setup

**Required tools**
- Android Studio: install from developer.android.com — includes the Android SDK, build tools, and AVD Manager
- JDK: Android Studio bundles its own JDK; for CLI builds, use JDK 17 (Gradle 8.x requirement)
- ADB (Android Debug Bridge): included in Android SDK Platform Tools — add to PATH
- Bundletool: for testing AAB files locally

**SDK and build tools versions**
```kotlin
// app/build.gradle.kts
android {
    compileSdk = 35
    defaultConfig {
        minSdk = 26
        targetSdk = 35
    }
}
```

Pin build tools in `gradle/wrapper/gradle-wrapper.properties`:
```
distributionUrl=https\://services.gradle.org/distributions/gradle-8.9-bin.zip
```

**AVD (Android Virtual Device) management**
```bash
# List available AVDs
emulator -list-avds

# Start emulator
emulator -avd Pixel_9_API_35

# Or via avdmanager
avdmanager list avd

# Create an AVD
avdmanager create avd -n "Pixel_9_API_35" -k "system-images;android-35;google_apis_playstore;x86_64"
```

**ADB commands for development**
```bash
# List connected devices/emulators
adb devices

# Install APK
adb install -r app-debug.apk

# View logs filtered by tag
adb logcat -s MyApp:V

# Open app
adb shell am start -n com.example.myapp/.MainActivity

# Input text (useful for automation)
adb shell input text "testpassword"

# Tap coordinates
adb shell input tap 540 960

# Take screenshot
adb exec-out screencap -p > screenshot.png

# Enable WiFi debugging (Android 11+)
adb pair <ip>:<port>  # pair first
adb connect <ip>:<port>
```

**Physical device setup (Android)**
- Enable Developer Options: Settings > About Phone > tap Build Number 7 times
- Enable USB Debugging: Developer Options > USB Debugging
- For Android 11+: enable Wireless Debugging for cable-free development
- Trust the computer when prompted on first connection

**Compose hot reload**
Android Studio's "Apply Code Changes" and "Apply Changes and Restart Activity" provide incremental deployment:
- Apply Code Changes (lightning bolt icon): deploys changed Kotlin bytecode without restarting the app — works for logic changes
- Apply Changes and Restart Activity: restarts the current activity with new code — works for UI composition changes
- Full rebuild is still required for resource changes (strings, drawables, manifest)

Compose interactive preview:
```kotlin
@Preview(showBackground = true, name = "Light mode")
@Preview(uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Dark mode")
@Composable
fun UserCardPreview() {
    MyAppTheme {
        UserCard(user = previewUser)
    }
}
```

### Debugging Tools

**iOS debugging**

*LLDB in Xcode*
- Set breakpoints by clicking line numbers or: `breakpoint set --name viewDidLoad`
- Print expressions: `po viewModel.user` (prints object description), `p viewModel.isLoading` (prints value)
- Memory graph: Debug > View Memory Graph Hierarchy to inspect object retain counts
- View hierarchy debugger: Debug > View Debugging > Capture View Hierarchy — visualize the full UIView/SwiftUI layer tree in 3D

*Instruments*
- Time Profiler: find CPU hotspots, identify methods consuming > 5% of CPU time
- Allocations: track heap memory growth, identify retain cycles via backtraces
- Leaks: automated memory leak detection
- Network: inspect HTTP requests, timing, and response bodies
- Energy Log: identify battery-draining background work
- Core Animation: frame rendering performance, identifies GPU-bound vs CPU-bound jank

*Console.app / os_log*
```swift
import OSLog
private let logger = Logger(subsystem: "com.example.myapp", category: "Auth")
logger.debug("Login attempt for user: \(userId)")
logger.error("Network error: \(error.localizedDescription)")
```
Filter in Console.app by subsystem/category. OSLog is zero-cost when logging is disabled.

**Android debugging**

*Android Studio debugger*
- Breakpoints with conditions: right-click breakpoint > Condition
- Evaluate expression: Debug > Evaluate Expression (or Alt+F8) while paused
- Frame variable inspection: Variables pane shows all locals and fields
- LogCat: filter by package name, tag, or regex. Color-coded by severity level.

*Android Studio Profiler*
- CPU Profiler: record method traces or sample CPU usage; identify ANR-prone operations
- Memory Profiler: heap dump, allocation tracking, GC event visualization
- Network Profiler: request/response inspection, payload viewer
- Energy Profiler: battery usage breakdown by CPU, network, and GPS

*Debugging Compose*
- Layout Inspector (Android Studio Electric Eel+): live inspection of Compose tree with recomposition counts
- Recomposition highlighter: `Modifier.debugInspectorInfo` or Android Studio's built-in recomposition overlay
- `@Preview` parameter combinations to test edge cases without running the app

### Team Environment Standardization

**Mise/asdf for tool version consistency**
```toml
# .mise.toml (or .tool-versions for asdf)
[tools]
java = "17.0.12"
node = "20.18.0"
ruby = "3.3.0"
```

Commit `.mise.toml` to git — every team member and CI runner uses the same tool versions.

**Fastlane for build automation**
```ruby
# Fastfile
lane :build_debug do
  gradle(task: "assembleDebug")
end

lane :build_ios do
  gym(scheme: "MyApp", configuration: "Debug")
end
```

Document the minimum `make setup` or `./scripts/bootstrap.sh` that gets a new developer from clean machine to running app in under 10 minutes. Include:
1. Install Xcode/Android Studio (with version pinned)
2. Install system dependencies (`brew install ...`)
3. Install project dependencies (pods, SPM packages, Gradle sync)
4. Create local config files from templates
5. Run on simulator to verify
