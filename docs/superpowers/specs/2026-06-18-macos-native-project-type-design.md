# macOS-Native Project Type — Design Spec

**Date**: 2026-06-18
**Status**: Approved Design
**Goal**: Add a first-class `macos-native` project type to Scaffold's project-type
system so the pipeline can scaffold native macOS applications (Swift / SwiftUI /
AppKit) — comprehensive, on par with the existing `game` type. Driving use case:
the **Glyver** read-only multi-repo Git monitoring dashboard for macOS.

**Brainstorm decisions (locked):**
- **Scope**: macOS-native only (Swift/SwiftUI/AppKit, macOS desktop). *Not*
  cross-platform desktop (Electron/Tauri/Qt) and *not* an Apple-wide type that
  would collide with the existing `mobile-app` (iOS) type.
- **Investment**: first-class / comprehensive from day one (~20 knowledge
  entries + dedicated pipeline steps), not a lean MVP or a selectable stub.
- **Structure**: "right-sized game pattern" (**Approach A**) — a full knowledge
  category **plus** a focused cluster of 5 new macOS steps, reusing the rest of
  the standard pipeline with macOS knowledge injected. *Not* full game-parity
  (~10-14 steps) and *not* a knowledge-only overlay (0 new steps).
- **Delivery**: write this spec → user review → implementation plan → user
  review → **full implementation** (author all knowledge + step prompts + all
  wiring + tests).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Config Schema (`MacosNativeConfig`)](#2-config-schema-macosnativeconfig)
3. [Pipeline Steps (5 new + disable/remap)](#3-pipeline-steps-5-new--disableremap)
4. [Knowledge Category (20 entries)](#4-knowledge-category-20-entries)
5. [`macos-native-overlay.yml`](#5-macos-native-overlayyml)
6. [Methodology Presets](#6-methodology-presets)
7. [Init Wizard + CLI Flags](#7-init-wizard--cli-flags)
8. [Auto-Detection + iOS Disambiguation](#8-auto-detection--ios-disambiguation)
9. [Tests, Docs, and Freshness](#9-tests-docs-and-freshness)
10. [File-Change Manifest](#10-file-change-manifest)
11. [Out of Scope / Future](#11-out-of-scope--future)
12. [Success Criteria](#12-success-criteria)

---

## 1. Architecture Overview

`macos-native` is implemented as a **project-type overlay**, identical in
mechanism to `game`. The overlay machinery already exists and shipped with the
game pipeline — **no engine changes are required**. This is purely content +
wiring through the established threading points.

```
User selects methodology (mvp / deep / custom)
          ↓
Methodology resolves step enablement + depth
          ↓
projectType: macos-native applies macos-native-overlay.yml
  → enables 5 macOS steps
  → disables replaced web steps (design-system, ux-spec, review-ux)
  → injects macOS knowledge into existing steps (knowledge-overrides)
  → remaps artifact references (reads-overrides: ux-spec/design-system → macos-ui-spec)
          ↓
macosNativeConfig traits resolve conditional steps + tailor prompts
          ↓
Assembly engine builds prompts with macOS-aware context
```

The strongest precedent is `game` (a non-web type that disables the web-centric
UI steps and ships its own knowledge category). This spec follows that pattern
but right-sized for desktop apps: a Mac app needs HIG-UX, distribution/signing,
and entitlements/privacy as first-class gated artifacts, but not game-style
netcode/economy/liveops sprawl.

**Key precedent files** (read before implementing): `content/methodology/game-overlay.yml`,
`content/pipeline/specification/game-ui-spec.md` (doc-creating step template,
including the Mode-Detection / Update-Mode blocks every doc-creating prompt
carries), `src/project/detectors/mobile-app.ts` (detector shape),
`src/config/validators/ml.ts` (coupling-validator shape).

---

## 2. Config Schema (`MacosNativeConfig`)

Six fields, matching the granularity of `BackendConfig`. Added to
`src/config/schema.ts` as `MacosNativeConfigSchema` (`.strict()`), inferred type
exported from `src/types/config.ts`, and surfaced as `ProjectConfig.macosNativeConfig`.

| Field | Values | Default | Purpose |
|---|---|---|---|
| `uiFramework` | `swiftui` \| `appkit` \| `hybrid` | `hybrid` | SwiftUI for chrome, AppKit where virtualization/control matter (Glyver's shape) |
| `minMacosVersion` | string (e.g. `"15.0"`) | `"15.0"` | Free string (not enum) so it needn't be re-edited each fall; drives `@available` guidance |
| `distribution` | `developer-id` \| `mac-app-store` \| `both` | `developer-id` | Direct-download/notarized first (Vision §11), MAS later |
| `sandboxed` | boolean | `false` | App Sandbox; see coupling rule below |
| `persistence` | `none` \| `sqlite` \| `core-data` \| `swiftdata` | `none` | Local-first storage (Glyver = `sqlite`) |
| `autoUpdate` | `none` \| `sparkle` | `none` | Sparkle appcast for direct-download; MAS self-updates |

**Coupling validator** (`src/config/validators/macos-native.ts`, registered in
`validators/index.ts`, mirrors `ml.ts`): if `distribution ∈ {mac-app-store, both}`
then `sandboxed` **must** be `true` (the Mac App Store requires the App Sandbox).
Emits a config error keyed via `configKeyFor`.

The wizard also sets `ProjectConfig.platforms = ['desktop']` for a macos-native
project.

---

## 3. Pipeline Steps (5 new + disable/remap)

### 3.1 Disabled (replaced by macOS equivalents)

`design-system`, `ux-spec`, `review-ux` — disabled in the overlay exactly as
`game` disables them.

### 3.2 New steps (5)

Each is a doc-creating meta-prompt under `content/pipeline/<phase>/` with the
standard frontmatter (`name`, `description`, `summary`, `phase`, `order`,
`dependencies`, `outputs`, `conditional`, `reads`, `knowledge-base`) **and** the
Mode-Detection + Update-Mode-Specifics blocks required of all document-creating
prompts (positioned after the opening paragraph, before the first content
section — per CLAUDE.md editing guidelines).

| Step | Phase | Role | Output | `knowledge-base` |
|---|---|---|---|---|
| `macos-ui-spec` | specification | Replaces `design-system`+`ux-spec`. Apple HIG: windows/scenes, menus & menu-bar extras, toolbars, sidebars, keyboard model & shortcuts, multi-window/monitor, dark mode, density, Reduce Motion | `docs/macos-ui-spec.md` | `macos-hig-ui-patterns`, `macos-accessibility`, `macos-keyboard-and-menus` |
| `review-macos-ui` | specification | Replaces `review-ux`. Review gate for the UI spec | (review) | `macos-hig-ui-patterns`, `macos-accessibility` |
| `macos-distribution-spec` | quality | Code signing (Developer ID), notarization (notarytool + staple, Gatekeeper), packaging (DMG/pkg), Sparkle auto-update, MAS path, CI sign/notarize automation | `docs/macos-distribution.md` | `macos-code-signing`, `macos-notarization`, `macos-packaging-distribution`, `macos-app-store`, `macos-ci-release-automation` |
| `macos-entitlements-privacy-spec` | quality | App Sandbox, entitlements, hardened runtime, TCC/privacy usage strings, security-scoped bookmarks | `docs/macos-entitlements-privacy.md` | `macos-app-sandbox-entitlements`, `macos-privacy-tcc`, `macos-keychain-secrets` |
| `review-macos-release` | quality | Single combined gate over distribution + entitlements/privacy ("can we ship safely?") | (review) | `macos-code-signing`, `macos-app-sandbox-entitlements` |

**Ordering**: `macos-ui-spec`/`review-macos-ui` slot into `specification`
adjacent to where `ux-spec`/`review-ux` sat (orders in the ~860 band, like
`game-ui-spec` at 863). The three `quality` steps slot after `security`/`operations`
with `review-macos-release` last among them.

**Dependencies**: `macos-ui-spec` depends on `system-architecture` (+ reads
`create-prd`, `user-stories`); `review-macos-ui` depends on `macos-ui-spec`;
`macos-distribution-spec` and `macos-entitlements-privacy-spec` depend on
`system-architecture` + `tech-stack`; `review-macos-release` depends on both.

### 3.3 Made conditional / reframed (not disabled)

`api-contracts`, `review-api`, `database-schema`, `review-database` stay
`if-needed` (already conditional in `deep.yml`) — many Mac apps are local-only
(Glyver has a SQLite cache, no API). `platform-parity-review` auto-skips for a
single-platform project.

---

## 4. Knowledge Category (20 entries)

New directory `content/knowledge/macos-native/`. Entries follow the existing
knowledge-entry frontmatter convention (`name`, `description`, `volatility`,
`last-reviewed`, `version-pin`, `sources`) with `## Summary` and `## Deep
Guidance` sections.

**Architecture & language (5)**
1. `macos-app-architecture` — app/scene lifecycle, window management, MVVM, state
2. `macos-swiftui-appkit-interop` — when to use which; `NSViewRepresentable`; virtualized `NSCollectionView`/`NSTableView`; hosting
3. `macos-swift-concurrency` — async/await, actors, `@MainActor`, structured concurrency, `Sendable`
4. `macos-data-persistence` — SwiftData vs Core Data vs SQLite/GRDB; local-first caching
5. `macos-performance` — virtualization, large data sets, smooth scrolling, low idle CPU, Instruments

**UI / accessibility (3)**
6. `macos-hig-ui-patterns` — HIG: menus, toolbars, sidebars, windows, multi-window/monitor, dark mode, density, menu-bar extras
7. `macos-accessibility` — VoiceOver, Dynamic Type, Reduce Motion, high contrast, accessibility for canvas/custom views
8. `macos-keyboard-and-menus` — keyboard model, shortcuts, command pattern, responder chain, ⌘K palettes

**Security & privacy (4)**
9. `macos-app-sandbox-entitlements` — App Sandbox, entitlements, hardened runtime
10. `macos-privacy-tcc` — TCC permissions, usage-description strings, security-scoped bookmarks, file access
11. `macos-keychain-secrets` — Keychain, secure storage, no hardcoded secrets
12. `macos-untrusted-input` — treating external repos/files as hostile input (argument arrays not shell strings, disabled pagers/prompts, timeouts, output caps, escaping) — directly relevant to Glyver

**Distribution & release (5)**
13. `macos-code-signing` — Developer ID, certificates, signing identities, `codesign`
14. `macos-notarization` — `notarytool`, stapling, Gatekeeper, common failures
15. `macos-packaging-distribution` — DMG/pkg, direct download, Sparkle appcast/EdDSA
16. `macos-app-store` — MAS submission, sandbox requirements, review guidelines, receipts
17. `macos-ci-release-automation` — GitHub Actions macOS runners / Xcode Cloud, fastlane, automated build→sign→notarize→release

**Tooling / testing / integration (3)**
18. `macos-project-tooling` — Xcode project vs SPM vs Tuist/XcodeGen; SPM dependency management; project structure
19. `macos-testing` — XCTest, Swift Testing, XCUITest, snapshot testing, CI test runs
20. `macos-system-integration` — FSEvents, `NSWorkspace`, user notifications, login items, launching external tools / URL schemes, file watching

---

## 5. `macos-native-overlay.yml`

`content/methodology/macos-native-overlay.yml`, four blocks mirroring
`game-overlay.yml`:

**`step-overrides`** — enable the 5 new steps; `design-system`, `ux-spec`,
`review-ux` → `{ enabled: false }`.

**`knowledge-overrides`** (`append` macOS entries into reused steps):
- `tech-stack` ← `macos-app-architecture`, `macos-swiftui-appkit-interop`, `macos-project-tooling`
- `coding-standards` ← `macos-swift-concurrency`, `macos-app-architecture`
- `tdd`, `story-tests`, `review-testing`, `create-evals` ← `macos-testing`
- `add-e2e-testing` ← `macos-testing`
- `project-structure`, `dev-env-setup`, `git-workflow` ← `macos-project-tooling`
- `domain-modeling`, `database-schema` ← `macos-data-persistence`
- `adrs` ← `macos-app-architecture`, `macos-swiftui-appkit-interop`
- `system-architecture` ← `macos-app-architecture`, `macos-swiftui-appkit-interop`, `macos-performance`, `macos-system-integration`
- `review-architecture` ← `macos-performance`
- `security` ← `macos-app-sandbox-entitlements`, `macos-privacy-tcc`, `macos-keychain-secrets`, `macos-untrusted-input`
- `review-security` ← `macos-app-sandbox-entitlements`, `macos-privacy-tcc`
- `operations` ← `macos-ci-release-automation`, `macos-packaging-distribution`
- `review-operations` ← `macos-ci-release-automation`
- `implementation-plan`, `implementation-playbook` ← `macos-app-architecture`

**`reads-overrides`** (`replace`) — for `story-tests`, `create-evals`,
`implementation-plan`, `implementation-playbook`, `new-enhancement`,
`cross-phase-consistency`: `{ ux-spec: macos-ui-spec, design-system: macos-ui-spec }`;
for `platform-parity-review`: `{ design-system: macos-ui-spec }`.

**`dependency-overrides`** — `platform-parity-review`: `replace: { review-ux:
review-macos-ui }`; ensure `review-macos-ui` and `review-macos-release` are wired
as downstream gates on their specs.

---

## 6. Methodology Presets

Add the 5 new steps as `{ enabled: false }` to **both** `content/methodology/deep.yml`
**and** `content/methodology/mvp.yml`, in a clearly-commented
`# macOS-native steps (enabled via macos-native overlay)` block — exactly how the
24 game steps and 5 multi-service steps are listed default-off in both presets.
The overlay enables them on top of whichever preset is active, so a Mac app can
use `mvp` (fewer steps, lower depth) or `deep` (all steps, max depth).

---

## 7. Init Wizard + CLI Flags

- `src/wizard/copy/macos-native.ts` — labels + help text for the 6 config fields
  (new file, mirrors `src/wizard/copy/game.ts`).
- `src/wizard/copy/core.ts` — add `'macos-native'` entry to `projectType.options`.
- `src/wizard/questions.ts` — `if (projectType === 'macos-native')` branch that
  collects `MacosNativeConfig` with progressive disclosure (ask `sandboxed` only
  when relevant, etc.) and sets `platforms: ['desktop']`.
- `src/cli/init-flag-families.ts` — `MACOS_NATIVE_FLAGS` family
  (`--macos-ui-framework`, `--macos-min-version`, `--macos-distribution`,
  `--macos-sandboxed`, `--macos-persistence`, `--macos-auto-update`).
- `src/cli/commands/init.ts` — add to `CONFIG_SETTING_FLAGS`, yargs builder, and
  `applyFlagFamilyValidation()`.

---

## 8. Auto-Detection + iOS Disambiguation

New `src/project/detectors/macos-native.ts`, registered in
`src/project/detectors/index.ts` `ALL_DETECTORS`. Returns
`{ projectType: 'macos-native', confidence, partialConfig, evidence }` or `null`,
using `SignalContext` helpers (`hasFile`, `dirExists`) plus the existing
`file-text-match` primitive for Swift-source content.

**Signal tiers:**
- **High** — `import AppKit` / `import Cocoa` in sources; **or** a `*.entitlements`
  file + `Info.plist` containing `LSMinimumSystemVersion`; **or** `Package.swift`
  declaring `.macOS(...)` with an executable/app target.
- **Medium** — `*.xcodeproj` / `.swiftpm` + a SwiftUI `@main App` with no
  iOS/UIKit markers.
- **Yield to `mobile-app` (return `null`)** — any `ios/` dir, `UIKit` import,
  iOS-only deployment target, or Expo/RN/Flutter signals.

**`partialConfig` inference** (best-effort): `uiFramework` from AppKit vs SwiftUI
imports; `sandboxed`/entitlements from a `*.entitlements` file; `autoUpdate:
sparkle` from a Sparkle SPM dependency; `persistence` from Core Data/SwiftData/
GRDB/SQLite usage.

**Known ambiguity (documented, not a bug):** a true multiplatform Swift app
(macOS **and** iOS targets) is genuinely ambiguous. Resolution defers to the
existing `disambiguate.ts` / confidence ranking and, failing that, the wizard's
explicit project-type pick. Detector tests assert the iOS-only → `null` cases
explicitly.

---

## 9. Tests, Docs, and Freshness

**Tests**
- `src/e2e/project-type-overlays.test.ts` — add a `macos-native` case asserting
  the 5 steps enabled, the 3 web steps disabled, knowledge injected, and reads
  remapped.
- `src/project/detectors/macos-native.test.ts` — high/medium/null tiers, incl.
  iOS-yield and library-yield cases.
- Coupling-validator test for the `mac-app-store ⇒ sandboxed` rule.
- The `domain-overlay-alignment` packaging test needs no change (macos-native has
  no sub-domains).
- `make check-all` green.

**Docs**
- `README.md` — add `macos-native` to the `--project-type` enum and the
  project-type table; **bump "detects 13 project types" → 14** (README.md:777).
- `CHANGELOG.md` — user-facing entry under `## [Unreleased]`.
- Grep for any other hardcoded "13" project-type counts in docs/tests and bump.

**Freshness / guides** *(per the `guides-embed-live-counts` lesson)*
- Adding 20 knowledge entries changes the live counts embedded in generated
  guides. Bump `content/knowledge/VERSION` and rebake guides
  (`scaffold guides --build`) so the citation/drift gates pass.

---

## 10. File-Change Manifest

| Component | Change | Type |
|---|---|---|
| `src/config/schema.ts` | Add `'macos-native'` to `ProjectTypeSchema`; add `MacosNativeConfigSchema` | Schema |
| `src/config/validators/macos-native.ts` (+ `index.ts`) | Coupling validator (MAS ⇒ sandboxed) | Validation |
| `src/types/config.ts` | Export inferred type; add `ProjectConfig.macosNativeConfig` | Types |
| `src/wizard/copy/macos-native.ts` (+ `core.ts`) | Wizard copy + project-type option | Wizard |
| `src/wizard/questions.ts` | macos-native config branch; set `platforms: ['desktop']` | Wizard |
| `src/cli/init-flag-families.ts` (+ `commands/init.ts`) | `MACOS_NATIVE_FLAGS` + wiring/validation | CLI |
| `src/project/detectors/macos-native.ts` (+ `index.ts`) | Detector + registration | Detect |
| `content/methodology/macos-native-overlay.yml` | New overlay | Content |
| `content/methodology/deep.yml`, `mvp.yml` | 5 steps default-off | Content |
| `content/pipeline/specification/macos-ui-spec.md`, `review-macos-ui.md` | New steps | Content |
| `content/pipeline/quality/macos-distribution-spec.md`, `macos-entitlements-privacy-spec.md`, `review-macos-release.md` | New steps | Content |
| `content/knowledge/macos-native/*.md` (20) | New knowledge category | Content |
| `content/knowledge/VERSION` | Bump + rebake guides | Content |
| `src/e2e/project-type-overlays.test.ts`, `detectors/macos-native.test.ts`, validator test | Tests | Test |
| `README.md`, `CHANGELOG.md` | Docs + count bump | Docs |

---

## 11. Out of Scope / Future

- **Cross-platform desktop** (Electron/Tauri/Qt/WinUI/GTK) — explicitly not this
  type; Electron/Tauri are largely served by `web-app` already.
- **iOS/iPadOS** — owned by the existing `mobile-app` type; not absorbed here.
- **A dedicated macOS dashboard-visual harness** — Scaffold's own dashboard
  Playwright flow is unrelated.
- **Generating actual Swift code** — Scaffold produces planning/spec docs; the
  build phase executes against them. We are not adding Swift codegen.
- A macos-native domain sub-overlay system (like `backend-fintech`) — none needed
  now.

---

## 12. Success Criteria

- `scaffold init --project-type macos-native` (and the interactive wizard) produce
  a config with a valid `macosNativeConfig`, and the coupling rule is enforced.
- Assembling the pipeline for a macos-native project enables the 5 macOS steps,
  disables `design-system`/`ux-spec`/`review-ux`, injects the macOS knowledge,
  and remaps reads to `macos-ui-spec`.
- `scaffold adopt` on a real macOS Swift repo (e.g. a Glyver scaffold) detects
  `macos-native`, and an iOS repo still detects `mobile-app`.
- All 20 knowledge entries and 5 step prompts exist, validate
  (`make validate`), and carry Mode-Detection / Update-Mode blocks where required.
- `make check-all` is green; guides rebaked; README/CHANGELOG updated.
- Running the pipeline against the Glyver vision doc yields a coherent macOS
  documentation set (PRD → HIG UI spec → architecture → distribution/entitlements
  → implementation plan) with no web-centric artifacts.
