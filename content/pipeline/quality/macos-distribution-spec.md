---
name: macos-distribution-spec
description: Specify code signing, notarization, packaging, auto-update, and Mac App Store distribution for the app
summary: "Covers Developer ID code signing, notarization (notarytool + stapling + Gatekeeper), DMG/pkg packaging, Sparkle auto-update appcast, the Mac App Store submission path, and CI sign/notarize/release automation."
phase: "quality"
order: 965
dependencies: [system-architecture, tech-stack]
outputs: [docs/macos-distribution.md]
conditional: null
reads: [system-architecture, tech-stack, operations]
knowledge-base: [macos-code-signing, macos-notarization, macos-packaging-distribution, macos-app-store, macos-ci-release-automation]
---

Define the complete macOS distribution specification for this project, covering
every step from a signed binary to a user-installable artifact. Web deployment
relies on a CI pipeline pushing to a host; mobile apps go through App Store
Connect; macOS apps must traverse Apple's notarization infrastructure, survive
Gatekeeper on first launch, and — for the Developer ID distribution path —
deliver their own auto-update mechanism. This step makes those requirements
concrete and project-specific.

## Mode Detection
Check for `docs/macos-distribution.md`. If it exists, operate in **update mode**:
read the existing spec and diff against the current system-architecture, tech-stack,
and operations docs. Preserve prior decisions about the distribution channel,
signing identities, and CI pipeline structure. Update sections where upstream
docs have changed: a new target OS version shifts notarization requirements; a
decision to add Mac App Store as a second channel requires a parallel signing
configuration.

## Update Mode Specifics
- **Detect prior artifact**: `docs/macos-distribution.md` exists
- **Preserve**: chosen distribution channel (Developer ID / MAS / both), signing
  identity names, CI pipeline structure, Sparkle appcast URL, MAS bundle ID and
  app-record decisions
- **Triggers for update**: deployment target (OS version) changed; distribution
  channel added or removed; CI provider changed; Sparkle major version bump;
  auto-update key rotation
- **Conflict resolution**: if the project was previously Developer-ID-only and
  MAS is being added, document the entitlement delta required (App Sandbox) and
  the build-scheme separation needed — never silently merge the two signing
  configurations into one

## Purpose
Produce a distribution specification that a developer or CI agent can follow to
build, sign, notarize, package, and release every version of the app. The
document ensures:

1. **Signing identities** are unambiguously named — Developer ID Application
   (for direct distribution) and/or Apple Distribution (for MAS), both backed by
   a provisioning profile stored in CI secrets.
2. **Hardened Runtime** is declared on/off with explicit rationale. Direct
   distribution notarization requires Hardened Runtime; entitlement exceptions
   are enumerated here and cross-referenced to the entitlements spec.
3. **Notarization** is fully automated: `notarytool submit` → poll for
   `Accepted` status → `stapler staple` → `spctl --assess` Gatekeeper
   verification — all scripted and gated in CI.
4. **Packaging format** is decided: DMG (most common for direct distribution),
   flat pkg, or both. DMG background, window layout, and code-signing of the
   DMG itself are specified.
5. **Sparkle auto-update** is configured for the Developer ID path (never for
   MAS): appcast URL, EdDSA key pair, `generate_appcast` integration, delta
   updates on/off, and minimum OS version for each release channel.
6. **Mac App Store path** is specified if applicable: sandbox entitlements, app
   receipt validation, IAP if needed, the Transporter/Xcode Organizer submission
   flow, and review-note conventions.
7. **CI automation** is fully scripted: macOS runner version, Xcode version pin,
   keychain bootstrap for CI (import cert → create keychain → unlock),
   build→sign→notarize→package→publish steps, Fastlane lanes or equivalent
   shell scripts, and release artifact naming.

## Inputs
- `docs/system-architecture.md` (required) — deployment target (minimum macOS
  version), UI framework, and the `distribution` config value
  (`developer-id` | `mac-app-store` | `both`)
- `docs/tech-stack.md` (required) — Xcode version, Swift version, build system
  (Xcode / SPM / Fastlane), and CI provider
- `docs/operations-runbook.md` (optional) — existing release pipeline steps to
  extend rather than replace

## Expected Outputs
- `docs/macos-distribution.md` — complete distribution specification covering
  signing identities, hardened runtime, notarization workflow, packaging format,
  Sparkle auto-update (Developer ID only), Mac App Store submission path (if
  applicable), and CI automation scripts

## Quality Criteria
- (mvp) Distribution channel explicitly declared: `developer-id`, `mac-app-store`, or `both`
- (mvp) Signing identity named precisely (e.g. `Developer ID Application: Acme Corp (TEAMID)`) — no placeholder strings
- (mvp) Hardened Runtime decision stated with rationale; if disabled, blocking reason documented
- (mvp) Notarization workflow scripted end-to-end: `notarytool submit` → poll → `stapler staple` → `spctl --assess` gate — all steps present
- (mvp) Packaging format chosen (DMG / pkg) with at least the essential DMG layout or pkg component plist specified
- (mvp) CI keychain bootstrap procedure documented (import cert, create keychain, unlock, set as default)
- (mvp) Release artifact naming convention defined (filename template, version embedding)
- (deep) Sparkle appcast URL finalized; EdDSA public key embedded in Info.plist; `sign_update` step in CI pipeline; delta updates on/off with rationale
- (deep) Sparkle release channels configured if the project has beta/stable tracks; `minimumSystemVersion` per channel
- (deep) DMG: background image dimensions, icon positions, window size, and `.DS_Store` generation scripted or described
- (deep) DMG signed with Developer ID Application after `hdiutil create` — verified with `codesign -dv`
- (deep) MAS path: App Sandbox entitlement confirmed; app receipt validation code present or waived with rationale; IAP flow documented if the PRD includes purchases
- (deep) MAS submission: Transporter or Xcode Organizer step scripted; metadata fields (category, age rating, export compliance) enumerated
- (deep) Xcode version pinned in CI (`.xcode-version` file or equivalent) and rationale for the chosen version documented
- (deep) CI secrets inventory: cert (base64), cert password, Apple ID, App-specific password / API key, notarization team ID — all named and documented (values in CI secrets, never in the repo)
- (deep) Rollback procedure: what to do if a notarized build is found defective post-release (revocation, Sparkle emergency update, MAS expedited review)

## Methodology Scaling
- **deep**: Full distribution specification covering both Developer ID and MAS
  paths (if applicable), Sparkle configuration with channels and delta updates,
  complete CI pipeline scripts with secrets inventory, DMG layout automation,
  MAS metadata, and a post-release rollback procedure. 15–25 pages.
- **mvp**: Distribution channel declaration, signing identity name, notarization
  workflow (scripted), packaging format choice, and CI keychain bootstrap only.
  4–7 pages.
- **custom:depth(1-5)**:
  - Depth 1: distribution channel, signing identity, and hardened runtime decision only — no CI automation.
  - Depth 2: add notarization workflow (`notarytool` end-to-end) and basic DMG packaging; CI keychain bootstrap.
  - Depth 3: add Sparkle appcast setup (Developer ID) or MAS sandbox/submission overview (MAS); CI build→sign→notarize pipeline.
  - Depth 4: add delta updates and Sparkle channel config (Developer ID) or full MAS metadata + IAP (MAS); DMG background/layout automation; CI secrets inventory.
  - Depth 5: full specification — all depth-4 content plus rollback procedure, Xcode version pinning rationale, multi-channel (beta/stable) release configuration, and a signed-off CI pipeline that has been validated against the actual project's build scheme.

## After This Step

When this step is complete, tell the user:

---
**Distribution spec complete** — `docs/macos-distribution.md` created.

**Next:** Run `/scaffold:macos-entitlements-privacy-spec` — Specify the sandbox, entitlements, and privacy posture for the app.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
