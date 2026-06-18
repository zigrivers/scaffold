---
name: macos-entitlements-privacy-spec
description: Specify the App Sandbox, entitlements, hardened runtime, and privacy (TCC) posture for the app
summary: "Defines App Sandbox on/off, required entitlements, hardened runtime exceptions, TCC privacy usage-description strings, security-scoped bookmarks/Powerbox for user-granted file access, and (for sandboxed apps) subprocess/system-tool access limits."
phase: "quality"
order: 936
dependencies: [system-architecture, tech-stack]
outputs: [docs/macos-entitlements-privacy.md]
conditional: null
reads: [system-architecture, security]
knowledge-base: [macos-app-sandbox-entitlements, macos-privacy-tcc, macos-keychain-secrets]
---

Define the complete entitlements and privacy specification for this project,
resolving every capability the app needs against what the sandbox permits and
what macOS's Transparency, Consent, and Control (TCC) framework requires.
iOS and Android have rigid permission models baked into the OS; macOS layered
its model over a Unix process model in stages — the App Sandbox (2011),
Hardened Runtime (2019), and TCC expansion (ongoing) — and the seams show.
This step makes those seams explicit so developers encounter them in a spec,
not in a midnight App Store rejection.

## Mode Detection
Check for `docs/macos-entitlements-privacy.md`. If it exists, operate in
**update mode**: read the existing spec and diff against the current
system-architecture and security docs. Preserve entitlement decisions that have
already been validated (especially any MAS-approved sandbox exceptions). Update
sections where the app's capability requirements have changed: a new feature
that opens arbitrary files requires a security-scoped bookmark decision; adding
a subprocess call (e.g., `git`) must revisit the sandbox policy.

## Update Mode Specifics
- **Detect prior artifact**: `docs/macos-entitlements-privacy.md` exists
- **Preserve**: sandbox on/off decision with its rationale, approved entitlement
  set, existing TCC usage-description strings (changing them requires re-review),
  security-scoped bookmark implementation decisions, Keychain access-group names
- **Triggers for update**: new feature requiring network, file system, camera,
  microphone, or location access; subprocess calls added or removed; distribution
  channel changed (Developer ID ↔ MAS — sandbox requirement differs);
  deployment target bumped (new TCC categories may apply)
- **Conflict resolution**: if a new capability conflicts with an existing MAS
  sandbox approval (e.g., adding arbitrary shell execution), document the
  trade-off explicitly and recommend a distribution-channel decision — never
  silently add an entitlement that would block MAS review

## Purpose
Produce an entitlements and privacy specification that resolves every security
and privacy decision before implementation begins. The document ensures:

1. **Sandbox decision** is made explicitly: sandboxed (required for MAS,
   optional for Developer ID) or unsandboxed Developer ID with documented
   rationale. Trade-offs — subprocess access, arbitrary file I/O, background
   daemon integration — are weighed against distribution goals.
2. **Entitlements file** is fully enumerated: every
   `com.apple.security.*` key, its value, and the specific capability it enables.
   Temporary exceptions (`com.apple.security.temporary-exception.*`) are
   documented with the Apple review justification text they require.
3. **Hardened Runtime exceptions** are listed: JIT, unsigned executable memory,
   DYLD environment variables, Apple Events, audio input, camera, location,
   contacts, calendar — only what the app actually needs.
4. **TCC privacy strings** are specified for every protected resource the app
   accesses: `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`,
   `NSLocationWhenInUseUsageDescription`, `NSDocumentsFolderUsageDescription`,
   and every other `NS*UsageDescription` key required. String values are
   user-facing and must pass App Store review language requirements.
5. **Security-scoped bookmarks and Powerbox** are designed for any app that
   needs persistent access to user-chosen files or folders outside its container.
   The spec covers `startAccessingSecurityScopedResource` / `stopAccessing`
   lifecycle, bookmark storage (UserDefaults vs. external file), and the
   Open/Save panel (Powerbox) integration.
6. **Subprocess and system-tool access** is resolved: for a sandboxed app that
   needs to call `git`, `ssh`, `rsync`, or other Unix tools — whether the binary
   is bundled, accessed via XPC, or accessed via an entitlement — the spec states
   the chosen approach and its security implications.
7. **Keychain** usage is specified: access group identifiers, item attributes
   (`kSecAttrService`, `kSecAttrAccount`), and sharing scope (app-only vs.
   app-group shared).

## Inputs
- `docs/system-architecture.md` (required) — sandboxing config
  (`sandboxed: true/false`), distribution channel, and any subprocess calls
  listed in the architecture
- `docs/security-review.md` (optional) — threat model and data-classification
  decisions that constrain entitlements

## Expected Outputs
- `docs/macos-entitlements-privacy.md` — complete entitlements and privacy
  specification covering sandbox decision, full entitlements file, hardened
  runtime exceptions, TCC usage-description strings, security-scoped bookmarks,
  subprocess access resolution, and Keychain design

## Quality Criteria
- (mvp) Sandbox on/off explicitly decided with rationale; distribution channel consequence noted (MAS requires sandbox)
- (mvp) Every `com.apple.security.*` entitlement the app needs is listed with its purpose — no undeclared capabilities
- (mvp) Every TCC-gated resource the app accesses has a corresponding `NS*UsageDescription` string — no missing privacy keys
- (mvp) Hardened Runtime on/off declared; if on, exceptions enumerated; if off, distribution-channel impact documented
- (mvp) Subprocess calls (if any) resolved: bundled binary, XPC helper, or entitlement exception — decision and rationale present
- (deep) Security-scoped bookmark lifecycle fully specified: acquisition via Open/Save panel, persistence strategy, `startAccessing`/`stopAccessing` call sites, and error handling for stale bookmarks
- (deep) Powerbox integration points identified: which file-open flows use `NSOpenPanel` (Powerbox-mediated) vs. programmatic access (requires bookmark)
- (deep) Keychain access groups named; item attributes specified; inter-process sharing scope documented if the app uses XPC helpers
- (deep) Temporary entitlement exceptions: each lists the Apple review justification text verbatim (the text submitted during MAS review)
- (deep) Entitlement delta between Developer ID and MAS builds documented (if `distribution: both`): separate `.entitlements` files specified for each scheme
- (deep) Container directory layout sketched: which data goes in `~/Library/Application Support/<BundleID>/`, `~/Library/Caches/`, `~/Library/Containers/` — relevant for sandboxed migration from unsandboxed
- (deep) `LSApplicationQueriesSchemes` and `com.apple.security.application-groups` documented if the app integrates with other apps or shares a group container
- (deep) TCC strings reviewed for App Store language: plain English, first person, specific resource mention — no marketing language, no vague "for better experience" copy

## Methodology Scaling
- **deep**: Complete entitlements and privacy specification covering sandbox
  decision with full rationale, enumerated entitlements file with every key,
  hardened runtime exception list, all TCC usage strings with App Store language
  review, security-scoped bookmark lifecycle design, subprocess resolution,
  Keychain design, entitlement delta between distribution schemes, and container
  directory layout. 10–18 pages.
- **mvp**: Sandbox decision, entitlements list (keys only), TCC strings (keys
  and placeholder values), and subprocess resolution. 3–5 pages.
- **custom:depth(1-5)**:
  - Depth 1: sandbox on/off decision and entitlements key list only — no descriptions, no TCC strings.
  - Depth 2: add TCC usage-description keys with placeholder values, hardened runtime exceptions, and subprocess resolution.
  - Depth 3: add TCC string content reviewed for App Store language, security-scoped bookmark strategy, and Keychain access group names.
  - Depth 4: add security-scoped bookmark lifecycle (start/stop call sites, persistence), Powerbox integration points, container directory layout, and entitlement delta between distribution schemes.
  - Depth 5: full specification — all depth-4 content plus temporary entitlement justification texts, `LSApplicationQueriesSchemes`/app-group documentation, and a signed-off entitlements file ready for submission.

## After This Step

When this step is complete, tell the user:

---
**Entitlements and privacy spec complete** — `docs/macos-entitlements-privacy.md` created.

**Next:** Run `/scaffold:review-macos-release` — Combined ship-readiness review of the macOS distribution and entitlements/privacy specs.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
