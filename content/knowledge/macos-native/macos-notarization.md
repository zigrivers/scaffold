---
name: macos-notarization
description: >-
  xcrun notarytool submit/wait/history/log, xcrun stapler staple, Gatekeeper spctl assessment, and common notarization failure causes
topics:
  - macos-native
  - notarization
  - distribution
  - gatekeeper
  - security
volatility: evolving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
  - url: https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
  - url: https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool
---

Notarization is Apple's automated malware scan applied to macOS software distributed outside the App Store. A notarized app carries an Apple-issued ticket that Gatekeeper can verify at launch, even offline after stapling. As of November 2023, `altool` is no longer accepted for notarization submissions — `notarytool` is the only supported tool.

## Summary

Submit a signed `.app`, `.dmg`, or `.pkg` to Apple's notary service with `xcrun notarytool submit --wait`. On success, attach the ticket with `xcrun stapler staple`. Verify Gatekeeper acceptance with `spctl --assess --type exec`. Common failures: missing `--options runtime` on the signature, missing `--timestamp`, embedded content not signed bottom-up, or entitlements incompatible with Hardened Runtime. Credentials for CI are best stored as a keychain profile (`notarytool store-credentials`) or as an App Store Connect API key — never a plaintext Apple ID password in environment variables.

## Deep Guidance

### Credential Modes

`notarytool` supports three credential modes. For CI, prefer the **App Store Connect API key** (no 2FA, no expiry linked to Apple ID password rotation) or a **keychain profile** stored on a build machine's keychain.

**App Store Connect API key (recommended for CI):**
```bash
xcrun notarytool submit MyApp.dmg \
  --key /path/to/AuthKey_KEYID.p8 \
  --key-id "KEY_ID" \
  --issuer "ISSUER_UUID" \
  --wait
```

**Keychain profile (for persistent local machines):**
```bash
# Store credentials once (interactive):
xcrun notarytool store-credentials "notarytool-profile" \
  --apple-id "you@example.com" \
  --team-id "ABCD1234EF"
# Prompts for an app-specific password (not your Apple ID password)

# Submit using the profile:
xcrun notarytool submit MyApp.dmg \
  --keychain-profile "notarytool-profile" \
  --wait
```

**Apple ID inline (avoid in CI — 2FA issues):**
```bash
xcrun notarytool submit MyApp.dmg \
  --apple-id "you@example.com" \
  --password "xxxx-xxxx-xxxx-xxxx" \
  --team-id "ABCD1234EF" \
  --wait
```

### Submitting for Notarization

The artifact must be a zip archive (for `.app`), a `.dmg`, or a `.pkg`. Xcode 13+ produces a zip automatically. For manual submission:

```bash
# Zip the .app (ditto preserves extended attributes):
ditto -c -k --sequesterRsrc --keepParent MyApp.app MyApp.zip

# Submit and block until done:
xcrun notarytool submit MyApp.zip \
  --keychain-profile "notarytool-profile" \
  --wait
```

`--wait` polls Apple's server and exits when the submission reaches a terminal state (Accepted or Invalid). Without `--wait`, the command exits immediately with a submission UUID you must poll manually.

### Checking Submission Status and Logs

```bash
# View recent submission history:
xcrun notarytool history --keychain-profile "notarytool-profile"

# Fetch the full JSON log for a specific submission:
xcrun notarytool log <submission-id> --keychain-profile "notarytool-profile"

# Save log to a file:
xcrun notarytool log <submission-id> \
  --keychain-profile "notarytool-profile" \
  notarization-log.json
```

The JSON log is the primary diagnostic tool for failures. It contains per-binary issues including the specific path, error code, and a human-readable message.

### Stapling the Ticket

After a successful notarization, staple the ticket to the artifact so Gatekeeper can verify it offline:

```bash
# Staple to an .app bundle:
xcrun stapler staple MyApp.app

# Staple to a .dmg:
xcrun stapler staple MyApp.dmg

# Staple to a .pkg:
xcrun stapler staple MyInstaller.pkg

# Verify the staple:
xcrun stapler validate MyApp.app
```

Stapling is required before distributing a `.dmg` or `.pkg`. Without a stapled ticket, users on machines without internet access at launch time cannot pass Gatekeeper's check.

### Verifying Gatekeeper Acceptance

```bash
# Assess app bundle:
spctl --assess --type exec --verbose MyApp.app

# Assess installer package:
spctl --assess --type install --verbose MyInstaller.pkg
```

Expected output for a successfully notarized and stapled app:
```
MyApp.app: accepted
source=Notarized Developer ID
```

### Common Notarization Failure Causes

| Failure | Cause | Fix |
|---|---|---|
| "The binary is not signed" | Nested framework or helper was missed in bottom-up signing | Sign all nested executables before the outer `.app` |
| "The signature does not include a secure timestamp" | `--timestamp` missing from `codesign` | Add `--timestamp` to every `codesign` invocation |
| "The executable does not have the hardened runtime" | `--options runtime` missing | Re-sign with `--options runtime` |
| "The signature is invalid" | `.app` contents were modified after signing | Sign after all build steps complete; do not modify the bundle after signing |
| Submission UUID returned but status "Invalid" | Any of the above — check the JSON log | Fetch log with `notarytool log <uuid>` |
| "altool: command not found" or rejection | `altool` was retired for notarization in November 2023 | Migrate to `notarytool` |

### `altool` Retirement Timeline

- **Xcode 13 (2021):** `notarytool` introduced; `altool` deprecated for notarization.
- **November 1, 2023:** Apple's notary service stopped accepting `altool` submissions entirely. Any CI pipeline still using `altool` for notarization must be migrated to `notarytool` — submissions will fail with an authentication or API version error.

### Notarization in a CI/CD Pipeline

Typical sequence in a CI job:

```bash
# 1. Build and archive (via xcodebuild or fastlane gym)
xcodebuild archive -scheme MyApp -archivePath MyApp.xcarchive

# 2. Export signed app (Developer ID profile)
xcodebuild -exportArchive \
  -archivePath MyApp.xcarchive \
  -exportPath ./dist \
  -exportOptionsPlist ExportOptions.plist

# 3. Create DMG containing the signed .app
hdiutil create -volname "MyApp" -srcfolder ./dist/MyApp.app \
  -ov -format UDZO MyApp.dmg

# 4. Sign the DMG
codesign --force --sign "Developer ID Application: Name (TEAMID)" \
  --timestamp MyApp.dmg

# 5. Submit for notarization (API key from CI secrets)
xcrun notarytool submit MyApp.dmg \
  --key "$NOTARIZATION_KEY_PATH" \
  --key-id "$NOTARIZATION_KEY_ID" \
  --issuer "$NOTARIZATION_ISSUER_ID" \
  --wait

# 6. Staple the ticket
xcrun stapler staple MyApp.dmg
```

Store the `.p8` API key as a CI secret (base64-encoded) and decode it to a temp file before use. Never commit the `.p8` file or embed it in the repo.
