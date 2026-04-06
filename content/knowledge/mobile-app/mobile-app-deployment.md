---
name: mobile-app-deployment
description: App store submission, code signing, provisioning profiles, CI/CD with Fastlane, and release management for iOS and Android
topics: [mobile-app, deployment, app-store, google-play, code-signing, fastlane, ci-cd, release-management]
---

Mobile app deployment is significantly more complex than web deployment: code signing creates a cryptographic chain of trust, app store review is a human process with 24–48 hour latency, and binary deployment means bugs cannot be hot-patched without a full submission cycle. Automate as much of this as possible with Fastlane — manual signing and upload processes are error-prone and do not scale to frequent releases.

## Summary

iOS deployment requires Apple Developer account, code signing (certificates + provisioning profiles), App Store Connect submission, and 24–48 hour review. Android deployment requires a Google Play Developer account, APK/AAB signing with a release keystore, and Play Store submission. Both platforms support CI/CD automation via Fastlane lanes. Code signing is the most failure-prone step — use Fastlane Match (iOS) or a secrets-managed keystore (Android) to make it reproducible. Automate the full pipeline from test → build → sign → upload.

## Deep Guidance

### iOS Code Signing

**Concepts**
- **Certificate**: A key pair issued by Apple. Two types relevant to development: Apple Distribution (for App Store) and Apple Development (for device testing).
- **App ID**: A unique identifier (`com.example.myapp`) registered in the Apple Developer portal.
- **Provisioning Profile**: A file that binds an App ID to a certificate and, for development, to specific device UDIDs. Must be re-downloaded when devices are added.
- **Entitlements**: Capabilities your app uses (push notifications, in-app purchases, Sign in with Apple) — must match between app target and provisioning profile.

**Automatic vs. manual signing**
- Automatic (Xcode manages signing): fine for individual developers, unreliable in CI — Xcode modifies the project file.
- Manual signing: specify `CODE_SIGN_IDENTITY`, `PROVISIONING_PROFILE_SPECIFIER` explicitly in xcconfig or build settings. Required for reliable CI.

**Fastlane Match for team signing**
Match stores certificates and profiles in a git repository (or S3/Google Cloud), encrypted with a passphrase. Every team member and CI runner fetches from the same source:

```ruby
# Matchfile
git_url("https://github.com/example/certificates")
storage_mode("git")
type("appstore")  # or "development", "adhoc"
app_identifier("com.example.myapp")

# Fastfile
lane :sync_signing do
  match(type: "appstore", readonly: is_ci)
end

lane :build_release do
  sync_signing
  gym(
    scheme: "MyApp",
    configuration: "Release",
    export_method: "app-store",
    output_directory: "./build"
  )
end
```

**Match setup workflow**
```bash
# First time: create certificates repo and generate certs
fastlane match init
fastlane match appstore   # generates Distribution cert + App Store profile
fastlane match development  # generates Development cert + profile

# Subsequent: sync to CI or new dev machine
MATCH_PASSWORD=<passphrase> fastlane match appstore --readonly
```

**CI signing setup**
- Store `MATCH_PASSWORD` as a CI secret variable — never commit it
- Use `readonly: true` in CI (`is_ci` returns true in most CI environments) — CI should never regenerate certificates
- For GitHub Actions: store the certificates git repo URL and match password as repository secrets

### iOS App Store Submission

**App Store Connect setup**
1. Create the app record in App Store Connect (appstoreconnect.apple.com)
2. Configure capabilities in the Apple Developer portal (push notifications, Sign in with Apple, etc.)
3. Create App Store listing: screenshots (required for each device size), description, keywords, privacy policy URL
4. Configure pricing and availability

**Required screenshots (2024)**
- iPhone: 6.9" display (iPhone 16 Pro Max), 6.5" display (iPhone 14 Plus)
- iPad (if universal): 12.9" iPad Pro, 11" iPad Pro
- Screenshots generated programmatically with `fastlane snapshot` + `fastlane frameit`

**Fastlane deliver for metadata + upload**
```ruby
lane :release do
  # Build
  gym(scheme: "MyApp", configuration: "Release")

  # Upload to App Store Connect
  deliver(
    submit_for_review: false,   # set true to auto-submit
    automatic_release: false,   # set true to auto-release after approval
    force: true,                # skip HTML report generation
    metadata_path: "./fastlane/metadata",
    screenshots_path: "./fastlane/screenshots"
  )
end
```

**App Store review guidelines (commonly rejected items)**
- Crashy builds: any crash during review results in immediate rejection
- Incomplete functionality: demo/placeholder screens visible to reviewers
- Login-gated apps: must provide reviewer credentials in App Store Connect
- Guideline 4.2.2: apps must be more than a repackaged website
- Push notification permission: must explain usage before prompting
- Privacy labels must accurately describe all data collected

**TestFlight for pre-release distribution**
```ruby
lane :beta do
  gym(scheme: "MyApp", configuration: "Release")
  pilot(
    app_identifier: "com.example.myapp",
    changelog: "Bug fixes and improvements",
    distribute_external: false,  # true for external testers
    notify_external_testers: false
  )
end
```

### Android Code Signing

**Release keystore**
```bash
# Generate a release keystore (do this once; store securely)
keytool -genkey -v \
  -keystore release.keystore \
  -alias myapp \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

# Never commit release.keystore to git
```

**Signing configuration in Gradle**
```kotlin
// app/build.gradle.kts
android {
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("KEYSTORE_PATH") ?: "release.keystore")
            storePassword = System.getenv("KEYSTORE_PASSWORD")
            keyAlias = System.getenv("KEY_ALIAS")
            keyPassword = System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
```

**CI keystore management**
- Store keystore as a base64-encoded CI secret: `base64 release.keystore | pbcopy`
- In CI: decode and write to disk: `echo $KEYSTORE_BASE64 | base64 -d > release.keystore`
- Store `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` as separate CI secrets
- Never print these values in CI logs — mask secrets in CI configuration

**Google Play App Signing**
Enable Google Play App Signing: Google manages the release signing key, you upload with an upload key. Benefits: Google can re-sign if your upload key is lost; protects against keystore loss (catastrophic for Android apps — if you lose the keystore, you cannot update the app).

### Android Play Store Submission

**App Bundle (AAB) vs APK**
- Always submit AAB (`.aab`) to Play Store — it enables Play Feature Delivery, dynamic delivery, and smaller installs
- APK is for direct distribution only (enterprise, sideloading)
- Build AAB: `./gradlew bundleRelease`

**Fastlane supply for Android**
```ruby
lane :deploy_production do
  gradle(task: "bundle", build_type: "Release")
  supply(
    track: "production",
    aab: "app/build/outputs/bundle/release/app-release.aab",
    package_name: "com.example.myapp"
  )
end

lane :deploy_internal do
  gradle(task: "bundle", build_type: "Release")
  supply(
    track: "internal",
    aab: "app/build/outputs/bundle/release/app-release.aab"
  )
end
```

**Play Console tracks**
- Internal testing: up to 100 testers, immediate availability
- Closed testing (Alpha): specific Google Groups, same-day availability
- Open testing (Beta): public opt-in, same-day availability
- Production: staged rollout available (1% → 5% → 20% → 100%)

**ProGuard / R8 rules**
```proguard
# Keep data classes used by Gson/Moshi/Retrofit
-keep class com.example.myapp.data.model.** { *; }

# Keep Retrofit service interfaces
-keep interface com.example.myapp.data.network.** { *; }

# Keep Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
```

Always build and test the release APK/AAB locally before submitting — R8 obfuscation can break reflection-dependent code (Gson, Retrofit, Hilt) that works fine in debug builds.

### CI/CD Pipeline

**GitHub Actions — iOS**
```yaml
name: iOS Release
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@v1
        with:
          bundler-cache: true
      - name: Install dependencies
        run: bundle exec pod install
      - name: Sync signing
        env:
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          MATCH_GIT_URL: ${{ secrets.MATCH_GIT_URL }}
        run: bundle exec fastlane sync_signing
      - name: Build and upload
        env:
          APP_STORE_CONNECT_API_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          APP_STORE_CONNECT_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          APP_STORE_CONNECT_API_KEY: ${{ secrets.ASC_PRIVATE_KEY }}
        run: bundle exec fastlane release
```

**GitHub Actions — Android**
```yaml
name: Android Release
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - name: Decode keystore
        env:
          KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
        run: echo $KEYSTORE_BASE64 | base64 -d > release.keystore
      - name: Build release
        env:
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
        run: ./gradlew bundleRelease
      - name: Upload to Play Store
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.SERVICE_ACCOUNT_JSON }}
          packageName: com.example.myapp
          releaseFiles: app/build/outputs/bundle/release/*.aab
          track: internal
```

### Version Management

**iOS versioning**
- `CFBundleShortVersionString` (Marketing version): user-visible version (`1.2.3`)
- `CFBundleVersion` (Build number): must increase monotonically for each App Store submission
- Automate build number increment: `fastlane run increment_build_number`
- Automate version: `fastlane run increment_version_number bump_type:minor`

**Android versioning**
```kotlin
android {
    defaultConfig {
        versionCode = 42        // Must increase on every Play Store submission
        versionName = "1.2.3"   // User-visible version string
    }
}
```

Automate versionCode in CI: read from git tag, CI build number, or a `version.properties` file.
