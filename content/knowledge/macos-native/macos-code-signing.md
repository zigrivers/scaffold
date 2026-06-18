---
name: macos-code-signing
description: >-
  Developer ID Application/Installer certificates, signing identities, codesign flags, hardened runtime, and bottom-up signing order for macOS distribution
topics:
  - macos-native
  - code-signing
  - distribution
  - security
  - hardened-runtime
volatility: evolving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
  - url: https://developer.apple.com/documentation/xcode/notarizing-your-app-before-distribution
  - url: https://developer.apple.com/documentation/security/hardened-runtime
  - url: https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool
---

Code signing establishes that a macOS app comes from a known developer and has not been tampered with since it was signed. For Developer ID distribution (direct download, outside the Mac App Store), signing with a hardened runtime and subsequently notarizing are both required. Getting the signing order and flags wrong produces a valid-looking signature that Gatekeeper or notarization will reject.

## Summary

macOS distribution outside the App Store requires a **Developer ID Application** certificate for the app bundle and a **Developer ID Installer** certificate for `.pkg` installers — both issued through Xcode or the Apple Developer portal. Signing uses `codesign` with `--options runtime` (enables Hardened Runtime, required for notarization), `--timestamp` (required for Developer ID), and `--entitlements` for capability exceptions. Nested bundles must be signed **bottom-up** (innermost first) — `--deep` is unreliable and must not be used in production. The signing identity string format is `"Developer ID Application: Name (TEAMID)"`.

## Deep Guidance

### Certificate Types

| Use case | Certificate type | Tool |
|---|---|---|
| App bundle (`.app`) | Developer ID Application | `codesign` |
| Command-line tool | Developer ID Application | `codesign` |
| Installer (`.pkg`) | Developer ID Installer | `pkgbuild --sign` / `productsign` |
| Mac App Store build | Apple Distribution | Xcode manages |

Certificates are installed in the macOS Keychain. List available signing identities:

```bash
security find-identity -v -p codesigning
```

### Signing an App Bundle

**Never use `--deep`** — it only processes Mach-O executables and skips other resource types inside nested bundles, producing an incomplete or invalid signature. Instead, sign **bottom-up**: innermost frameworks, plugins, and helper executables first, then the outer `.app` last.

```bash
# 1. Sign each nested framework (repeat for each)
codesign --force --options runtime --timestamp \
  --sign "Developer ID Application: Your Name (TEAMID)" \
  MyApp.app/Contents/Frameworks/MyFramework.framework

# 2. Sign any helper executables
codesign --force --options runtime --timestamp \
  --sign "Developer ID Application: Your Name (TEAMID)" \
  MyApp.app/Contents/MacOS/MyHelper

# 3. Sign the outer .app last — attach entitlements here
codesign --force --options runtime --timestamp \
  --entitlements MyApp.entitlements \
  --sign "Developer ID Application: Your Name (TEAMID)" \
  MyApp.app
```

### Key `codesign` Flags

| Flag | Purpose |
|---|---|
| `--force` / `-f` | Replace any existing signature |
| `--options runtime` / `-o runtime` | Enable Hardened Runtime (required for notarization) |
| `--timestamp` | Embed a secure timestamp from Apple's TSA (required for Developer ID) |
| `--entitlements <path>` | Embed the entitlements plist into the signature |
| `--sign <identity>` / `-s <identity>` | The signing identity string or certificate hash |
| `--verify` | Verify an existing signature |

### Hardened Runtime

The Hardened Runtime restricts what code can run inside your process — no unsigned dynamic libraries, no code injection, no `execve`-based process replacement. Enabling it is mandatory for notarization.

When Hardened Runtime conflicts with legitimate app behavior, grant exceptions in the entitlements file (`.entitlements`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Allow JIT compilation (e.g., JavaScript engines) -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <!-- Allow DYLD environment variables (debugging tools) -->
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <!-- Allow unsigned/ad-hoc-signed libraries to load -->
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

Request only the exceptions you actually need — unnecessary exceptions weaken the security guarantee and may trigger App Review scrutiny for Mac App Store submissions.

### Verifying a Signature

```bash
# Verify the signature is valid and intact
codesign --verify --verbose MyApp.app

# Check signature details including entitlements
codesign --display --verbose=4 MyApp.app

# Show embedded entitlements
codesign --display --entitlements :- MyApp.app
```

### Signing a DMG

Sign the DMG itself after placing the already-signed `.app` inside it. DMGs do not take `--options runtime` — that flag is for Mach-O executables and app bundles only:

```bash
codesign --force --sign "Developer ID Application: Your Name (TEAMID)" \
  --timestamp MyApp.dmg
```

### Signing a PKG Installer

Use `Developer ID Installer` (not `Developer ID Application`) for `.pkg` files. Sign at build time via `pkgbuild` or after the fact via `productsign`:

```bash
# Sign at build time (pkgbuild does NOT accept --timestamp; secure timestamping
# is applied when signing the .app bundle with codesign and when signing the
# finished package with productsign):
pkgbuild \
  --component MyApp.app \
  --install-location /Applications \
  --sign "Developer ID Installer: Your Name (TEAMID)" \
  MyApp.pkg

# Or sign an already-built pkg (productsign DOES support --timestamp):
productsign \
  --sign "Developer ID Installer: Your Name (TEAMID)" \
  --timestamp \
  MyApp-unsigned.pkg \
  MyApp-signed.pkg
```

### Common Mistakes

- **`--deep` on a production build** — use bottom-up signing instead.
- **Missing `--timestamp`** — notarization rejects signatures without a secure timestamp.
- **Signing the outer `.app` before inner frameworks** — the outer signature covers all content; re-signing inner components after signing the outer bundle invalidates it.
- **Wrong certificate type for pkg** — using Developer ID Application instead of Developer ID Installer causes `productsign` to fail and `spctl` to reject the installer.
- **Entitlements only on the outer app** — helper executables that need their own entitlements (e.g., a privileged helper) must have them embedded in their own signature.
