---
name: mobile-app-project-structure
description: Platform directory layout, shared code modules, asset management, and per-environment configuration for iOS and Android mobile apps
topics: [mobile-app, project-structure, ios, android, assets, configuration, modules]
---

Mobile project structure decisions affect build times, code sharing, onboarding velocity, and refactoring safety. iOS and Android have platform-mandated directory conventions that tools expect — deviating from them breaks Xcode file resolution, Android Gradle source sets, and code-generation tooling. Within those constraints, module boundaries and shared-code strategies deserve explicit design.

## Summary

iOS projects organize source by feature module under a top-level group matching the app target; Android projects use Gradle modules with `src/main/` source sets per module. Shared business logic lives in a dedicated module (Swift Package, Gradle module, or cross-platform layer). Assets are organized by type and managed through asset catalogs (iOS) or `res/drawable` (Android). Environment configuration uses `.xcconfig` files (iOS) or `BuildConfig` fields in Gradle (Android). Keep feature modules independent — no cross-feature imports.

## Deep Guidance

### iOS Project Structure

**Xcode project layout**

```
MyApp/
├── MyApp.xcodeproj/          # Xcode project file (tracked in git)
├── MyApp.xcworkspace/        # Workspace if using CocoaPods/SPM (tracked)
├── MyApp/                    # Main app target
│   ├── App/                  # App entry point
│   │   ├── MyApp.swift       # @main entry point
│   │   └── AppDelegate.swift # UIApplicationDelegate (if needed)
│   ├── Features/             # Feature modules (one folder per feature)
│   │   ├── Auth/
│   │   │   ├── Views/
│   │   │   ├── ViewModels/
│   │   │   ├── Models/
│   │   │   └── Services/
│   │   ├── Profile/
│   │   └── Home/
│   ├── Core/                 # Shared utilities, extensions, base classes
│   │   ├── Extensions/
│   │   ├── Utilities/
│   │   └── Base/
│   ├── Services/             # App-wide services (networking, analytics, storage)
│   │   ├── Network/
│   │   ├── Storage/
│   │   └── Analytics/
│   ├── Resources/            # Assets and resources
│   │   ├── Assets.xcassets   # Images, colors, app icon
│   │   ├── Localizable.strings
│   │   └── Info.plist
│   └── Supporting Files/
│       └── Configuration/    # .xcconfig files
│           ├── Debug.xcconfig
│           ├── Release.xcconfig
│           └── Shared.xcconfig
├── MyAppTests/               # Unit test target
├── MyAppUITests/             # UI test target
└── Packages/                 # Local Swift packages (optional)
    └── MyAppCore/            # Shared business logic package
```

**Swift Package Manager for modularization**
- Local packages declared in the project: `File > Add Package Dependencies > Add Local...`
- Package.swift defines module boundaries explicitly with product declarations
- Each local package can export only its public API — private implementation is hidden
- Move business logic, networking, and data models into packages early; Xcode compilation is parallelized per package

**File organization within feature**
- One file per type: `LoginView.swift`, `LoginViewModel.swift`, `AuthRepository.swift`
- Group by role, not by type: `Auth/Views/LoginView.swift` not `Views/LoginView.swift`
- Avoid mega-files. When a file exceeds ~200 lines, consider extraction.

### Android Project Structure

**Gradle multi-module layout**

```
MyApp/
├── app/                          # Main application module
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/example/myapp/
│   │   │   │   ├── MainActivity.kt
│   │   │   │   └── MyApplication.kt
│   │   │   ├── res/
│   │   │   │   ├── drawable/
│   │   │   │   ├── layout/        # XML layouts (View system only)
│   │   │   │   ├── values/
│   │   │   │   │   ├── colors.xml
│   │   │   │   │   ├── strings.xml
│   │   │   │   │   └── themes.xml
│   │   │   │   └── mipmap/        # App icon (all densities)
│   │   │   └── AndroidManifest.xml
│   │   ├── debug/                 # Debug-only sources and resources
│   │   └── release/               # Release-only sources (e.g., no-op analytics)
│   └── build.gradle.kts
├── feature/                       # Feature modules
│   ├── auth/
│   │   ├── src/main/java/com/example/myapp/feature/auth/
│   │   │   ├── AuthScreen.kt
│   │   │   ├── AuthViewModel.kt
│   │   │   └── AuthRepository.kt
│   │   └── build.gradle.kts
│   ├── profile/
│   └── home/
├── core/                          # Core shared modules
│   ├── data/                      # Repositories, data sources
│   ├── domain/                    # Use cases, domain models
│   ├── network/                   # Retrofit, OkHttp, interceptors
│   ├── storage/                   # Room, DataStore, Keychain
│   ├── ui/                        # Shared Compose components, theme
│   └── testing/                   # Test utilities and fakes
├── build.gradle.kts               # Root build file
├── settings.gradle.kts            # Module declarations
└── gradle/
    ├── libs.versions.toml         # Version catalog
    └── wrapper/
```

**Dependency rules (enforced with lint or Dependency Guard)**
- `app` can depend on `feature/*` and `core/*`
- `feature/*` can depend on `core/*` only — never on other features
- `core/domain` has no Android dependencies — pure Kotlin
- `core/data` depends on `core/domain`; `core/network` depends on `core/data`
- Circular dependencies between modules will break the build — the structure prevents them

**Version catalog (`libs.versions.toml`)**
```toml
[versions]
kotlin = "2.0.0"
compose-bom = "2024.09.00"
hilt = "2.51"

[libraries]
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
hilt-android = { group = "com.google.dagger", name = "hilt-android", version.ref = "hilt" }

[plugins]
android-application = { id = "com.android.application", version = "8.6.0" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
```

### Asset Management

**iOS Assets.xcassets**
- All images must be in an asset catalog — never load images from bare file paths at runtime
- Image sets: provide 1x, 2x, 3x for bitmap assets; prefer PDF or SVG (Universal) for icons and vector art
- Color sets: define semantic color pairs (light/dark) in the asset catalog, not in code. Name them by semantic role: `PrimaryText`, `Background`, `AccentColor`
- App Icon set: Xcode 15+ accepts a single 1024×1024 image and generates all sizes automatically
- Symbol sets: for custom SF-Symbol-style icons, add `.svg` files as symbol sets
- Namespace asset catalogs using folder names with `.xcassets` grouping: `Icons.xcassets`, `Images.xcassets`, `Colors.xcassets`

**Android drawable resources**
- Vector drawables (`.xml`) for all icons — scale perfectly on any density
- Bitmap assets: provide `mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi` variants in separate `drawable-*` folders, or use Android Studio's vector import to auto-generate
- Night mode: place dark-mode variants in `drawable-night/` and `values-night/colors.xml`
- Adaptive icons (`res/mipmap-anydpi-v26/ic_launcher.xml`): required for Android 8.0+; foreground + background layers
- App icon: 512×512 PNG for Play Store; adaptive icon XML for device display
- Localized strings: `values/strings.xml` (default), `values-es/strings.xml` (Spanish), etc.

### Environment Configuration

**iOS — xcconfig files**
```
# Shared.xcconfig
BASE_URL = https$(inherited)://api.myapp.com

# Debug.xcconfig
#include "Shared.xcconfig"
BASE_URL = https://api-dev.myapp.com
BUNDLE_ID_SUFFIX = .debug

# Release.xcconfig
#include "Shared.xcconfig"
BASE_URL = https://api.myapp.com
BUNDLE_ID_SUFFIX =
```

Access in code via `Info.plist` (read xcconfig variables into plist) then:
```swift
let baseURL = Bundle.main.infoDictionary?["BASE_URL"] as? String ?? ""
```

**Never hardcode secrets in xcconfig** — these are tracked in git. Use the iOS Keychain for runtime secrets or load from a non-tracked `.env.xcconfig` file that is gitignored.

**Android — BuildConfig fields**
```kotlin
// build.gradle.kts (app module)
android {
    buildTypes {
        debug {
            buildConfigField("String", "BASE_URL", "\"https://api-dev.myapp.com\"")
            applicationIdSuffix = ".debug"
        }
        release {
            buildConfigField("String", "BASE_URL", "\"https://api.myapp.com\"")
        }
    }
}
```

Access in code: `BuildConfig.BASE_URL`

**Product flavors for multi-environment builds**
```kotlin
flavorDimensions += "environment"
productFlavors {
    create("staging") {
        dimension = "environment"
        buildConfigField("String", "BASE_URL", "\"https://api-staging.myapp.com\"")
    }
    create("production") {
        dimension = "environment"
        buildConfigField("String", "BASE_URL", "\"https://api.myapp.com\"")
    }
}
```

**Secrets management**
- Never commit API keys, signing credentials, or OAuth secrets to git
- iOS: use `local.xcconfig` (gitignored) that overrides base config, or environment variables in CI
- Android: `local.properties` (gitignored) for local overrides; CI injects via environment variables
- At runtime: fetch secrets from a secrets manager (AWS Secrets Manager, HashiCorp Vault) or use platform secure storage (Keychain, Keystore) seeded during onboarding

### Cross-Platform Shared Code

**Swift Package for shared logic (iOS only or iOS + macOS)**
```swift
// Package.swift
let package = Package(
    name: "AppCore",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "AppCore", targets: ["AppCore"]),
    ],
    targets: [
        .target(name: "AppCore", path: "Sources/AppCore"),
        .testTarget(name: "AppCoreTests", dependencies: ["AppCore"])
    ]
)
```

**Kotlin Multiplatform (iOS + Android)**
- `commonMain`: pure Kotlin business logic, domain models, use cases
- `iosMain`: iOS-specific implementations of `expect` declarations
- `androidMain`: Android-specific implementations
- UI remains platform-native (SwiftUI for iOS, Compose for Android)
- Data layer: `commonMain` repositories with platform-specific database drivers (`SQLDelight` handles this)
