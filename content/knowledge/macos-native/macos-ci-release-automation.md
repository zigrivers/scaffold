---
name: macos-ci-release-automation
description: >-
  GitHub Actions macOS runners, Xcode Cloud, fastlane match/gym/notarize for automated build→sign→notarize→staple→release pipelines, and secrets handling
topics:
  - macos-native
  - ci-cd
  - github-actions
  - fastlane
  - distribution
  - automation
volatility: fast-moving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://docs.github.com/en/actions/using-github-hosted-runners/using-github-hosted-runners/about-github-hosted-runners
  - url: https://docs.fastlane.tools/actions/match/
  - url: https://docs.fastlane.tools/actions/gym/
  - url: https://docs.fastlane.tools/actions/notarize/
  - url: https://developer.apple.com/xcode-cloud/
---

Automating the macOS release pipeline — build, sign, notarize, staple, package, publish — eliminates manual steps that are error-prone and blocks rapid iteration. The two primary CI environments are GitHub Actions (hosted macOS runners) and Apple's own Xcode Cloud. fastlane is the dominant automation layer for both.

## Summary

GitHub Actions provides `macos-latest` and versioned (`macos-15`, `macos-14`) hosted runners with Xcode pre-installed. Never store certificates or private keys as plaintext files in the repo — import them at runtime from base64-encoded CI secrets, or use **fastlane match** (certificates stored encrypted in a private git repo or S3). The build→sign→notarize→staple sequence uses `xcodebuild` or fastlane `gym` → `codesign` → `xcrun notarytool submit --wait` → `xcrun stapler staple`. The App Store Connect API key (`.p8`) is the recommended credential for notarization and upload — it does not require 2FA and does not expire with password rotation.

## Deep Guidance

### GitHub Actions macOS Runners

```yaml
jobs:
  build:
    runs-on: macos-15   # or macos-14, macos-latest
    steps:
      - uses: actions/checkout@v4
      - name: Select Xcode version
        run: sudo xcode-select -s /Applications/Xcode_16.3.app
      - name: Show Xcode version
        run: xcodebuild -version
```

Available runners (check GitHub docs for current list — versions are added and deprecated regularly):
- `macos-15` — macOS Sequoia, Xcode 16.x
- `macos-14` — macOS Sonoma, Xcode 15.x / 16.x
- `macos-13` — macOS Ventura, Xcode 15.x

Runner specifications change; always pin to a specific version in production pipelines rather than `macos-latest` to avoid unexpected Xcode version changes.

### Secrets Handling — Certificates and Keys

**Never commit** certificates (`.p12`), private keys (`.p8`, `.pem`), or passwords to the repo. Use one of:

**Option A: Import certificate at runtime (base64 in CI secret)**

```yaml
- name: Import signing certificate
  env:
    CERTIFICATE_BASE64: ${{ secrets.MACOS_CERTIFICATE_P12 }}
    CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
  run: |
    # Decode and import into a temporary keychain
    echo "$CERTIFICATE_BASE64" | base64 --decode > certificate.p12
    security create-keychain -p "" build.keychain
    security import certificate.p12 -k build.keychain -P "$CERTIFICATE_PASSWORD" \
      -T /usr/bin/codesign
    security list-keychains -s build.keychain login.keychain
    security set-keychain-settings -t 3600 -l build.keychain
    security unlock-keychain -p "" build.keychain
    security set-key-partition-list -S apple-tool:,apple: -k "" build.keychain
    rm certificate.p12
```

**Option B: fastlane match (recommended for teams)**

match stores certificates and provisioning profiles encrypted (openssl AES-256-CBC) in a private git repo, S3, or Google Cloud Storage, and syncs them to the CI keychain on demand:

```ruby
# Matchfile
git_url("https://github.com/your-org/certificates")
type("developer_id")
app_identifier(["com.example.MyApp"])
```

```yaml
- name: Sync certificates via fastlane match
  env:
    MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
    MATCH_GIT_BASIC_AUTHORIZATION: ${{ secrets.MATCH_GIT_TOKEN_BASE64 }}
  run: bundle exec fastlane match developer_id --readonly
```

**App Store Connect API key (for notarization and upload):**

```yaml
- name: Write App Store Connect API key
  env:
    ASC_KEY_CONTENT: ${{ secrets.ASC_API_KEY_P8 }}
  run: |
    mkdir -p ~/.private_keys
    echo "$ASC_KEY_CONTENT" > ~/.private_keys/AuthKey_${{ secrets.ASC_KEY_ID }}.p8
```

### fastlane Actions for macOS Release

**Gymfile (build configuration):**

```ruby
# fastlane/Gymfile
scheme("MyApp")
output_directory("./dist")
output_name("MyApp")
export_method("developer-id")        # or "app-store" for MAS
configuration("Release")
```

**Fastfile lanes:**

```ruby
# fastlane/Fastfile
lane :release do
  # 1. Build and export signed .app
  gym(
    scheme: "MyApp",
    export_method: "developer-id",
    output_directory: "./dist",
    export_options: {
      signingStyle: "manual",
      signingCertificate: "Developer ID Application",
      provisioningProfiles: {}
    }
  )

  # 2. Create DMG (use shell or a helper action)
  sh("hdiutil create -volname 'MyApp' -srcfolder ./dist/MyApp.app -ov -format UDZO ./dist/MyApp.dmg")
  sh("codesign --force --sign 'Developer ID Application: Name (TEAMID)' --timestamp ./dist/MyApp.dmg")

  # 3. Notarize (fastlane notarize action wraps notarytool)
  notarize(
    package: "./dist/MyApp.dmg",
    bundle_id: "com.example.MyApp",
    api_key_path: "~/.private_keys/AuthKey_#{ENV['ASC_KEY_ID']}.p8",
    api_key: ENV["ASC_KEY_ID"],
    api_issuer: ENV["ASC_ISSUER_ID"]
  )
  # fastlane notarize calls xcrun notarytool submit --wait and xcrun stapler staple automatically

  # 4. Upload to GitHub Releases (or other distribution)
  github_release = set_github_release(
    repository_name: "your-org/myapp",
    api_token: ENV["GITHUB_TOKEN"],
    name: "v#{get_version_number}",
    tag_name: "v#{get_version_number}",
    upload_assets: ["./dist/MyApp.dmg"]
  )
end
```

### Complete GitHub Actions Workflow

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: macos-15
    environment: release

    steps:
      - uses: actions/checkout@v4

      - name: Select Xcode
        run: sudo xcode-select -s /Applications/Xcode_16.3.app

      - name: Set up Ruby and fastlane
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.3'
          bundler-cache: true

      - name: Import certificate
        env:
          CERTIFICATE_BASE64: ${{ secrets.MACOS_CERTIFICATE_P12 }}
          CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
        run: |
          echo "$CERTIFICATE_BASE64" | base64 --decode > cert.p12
          security create-keychain -p "" build.keychain
          security import cert.p12 -k build.keychain -P "$CERTIFICATE_PASSWORD" \
            -T /usr/bin/codesign -T /usr/bin/productsign
          security list-keychains -s build.keychain login.keychain
          security set-keychain-settings -t 3600 build.keychain
          security unlock-keychain -p "" build.keychain
          security set-key-partition-list -S apple-tool:,apple: -k "" build.keychain
          rm cert.p12

      - name: Write ASC API key
        env:
          ASC_KEY_CONTENT: ${{ secrets.ASC_API_KEY_P8 }}
        run: |
          mkdir -p ~/.private_keys
          printf '%s' "$ASC_KEY_CONTENT" > ~/.private_keys/AuthKey_${{ secrets.ASC_KEY_ID }}.p8

      - name: Build, sign, notarize, release
        env:
          TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: bundle exec fastlane release
```

### Xcode Cloud

Xcode Cloud is Apple's first-party CI service integrated into App Store Connect and Xcode. It handles code signing automatically using your existing certificates in App Store Connect — no manual keychain setup is needed.

Key concepts:
- **Workflows** define the trigger (push, tag, PR), environment, actions (build, test, archive), and post-actions (TestFlight, App Store, external distribution).
- **Start conditions** include branch patterns and tag patterns.
- **Custom scripts:** Place `ci_scripts/ci_post_clone.sh`, `ci_pre_build.sh`, or `ci_post_build.sh` in your repo root for setup steps (installing dependencies, running code generation).
- Xcode Cloud does **not** support arbitrary shell access during the build phase; custom tools must be installed in `ci_post_clone.sh`.
- Xcode Cloud is well-suited for MAS-only apps; for direct-download distribution requiring custom notarization/packaging steps, GitHub Actions with fastlane is more flexible.

### Version Bumping in CI

Avoid hardcoding version numbers. Use `agvtool` or the `increment_build_number` fastlane action to bump `CFBundleVersion` per build:

```bash
# Bump build number using git commit count (deterministic in CI):
BUILD_NUMBER=$(git rev-list HEAD --count)
agvtool new-version -all "$BUILD_NUMBER"
```

Or in fastlane:
```ruby
increment_build_number(build_number: number_of_commits)
```

Keep `MARKETING_VERSION` (`CFBundleShortVersionString`) under explicit version control and bump it as part of a tagged release commit.
