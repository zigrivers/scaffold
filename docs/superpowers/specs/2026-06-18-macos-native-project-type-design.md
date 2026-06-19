# macOS-Native Project Type — Design Spec

**Date**: 2026-06-18
**Status**: Approved Design — revised after multi-model review (see §13)
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

Seven fields, matching the granularity of `BackendConfig`. Added to
`src/config/schema.ts` as `MacosNativeConfigSchema` (`.strict()`), inferred type
exported from `src/types/config.ts`, and surfaced as `ProjectConfig.macosNativeConfig`.

| Field | Values | Default | Purpose |
|---|---|---|---|
| `uiFramework` | `swiftui` \| `appkit` \| `hybrid` | `swiftui` | SwiftUI-first (modern default for new macOS scaffolds); choose `hybrid` to mix AppKit where virtualization/control matter (Glyver's pick), or `appkit` for AppKit-only |
| `appStyle` | `standard` \| `menu-bar` \| `agent` | `standard` | Windowed app vs menu-bar (`NSStatusItem`) app vs background agent (`LSUIElement`, no Dock icon) — materially changes app lifecycle, `Info.plist`, and UI prompts |
| `minMacosVersion` | string (e.g. `"15.0"`) | `"15.0"` | Free string (not enum) so it needn't be re-edited each fall; drives `@available` guidance |
| `distribution` | `developer-id` \| `mac-app-store` \| `both` | `developer-id` | Direct-download/notarized first (Vision §11), MAS later |
| `sandboxed` | boolean | `false` | App Sandbox; see coupling rules below |
| `persistence` | `none` \| `sqlite` \| `core-data` \| `swiftdata` | `none` | Local-first storage (Glyver = `sqlite`) |
| `autoUpdate` | `none` \| `sparkle` | `none` | Sparkle appcast for direct-download; MAS self-updates |

**Coupling validators** (`src/config/validators/macos-native.ts`, registered in
`validators/index.ts`, mirrors `ml.ts`; each emits a config error keyed via
`configKeyFor`):
1. `distribution ∈ {mac-app-store, both}` ⇒ `sandboxed: true` — the Mac App Store
   requires the App Sandbox.
2. `distribution === 'mac-app-store'` ⇒ `autoUpdate: 'none'` — Sparkle (or any
   third-party updater) is disallowed in App Store builds and is a common rejection
   cause; the App Store delivers updates. (`distribution: 'both'` is allowed with
   `sparkle`: it applies to the Developer-ID variant only, and the
   `macos-packaging-distribution` knowledge entry notes the MAS build must strip it.)
3. `persistence === 'swiftdata'` ⇒ `minMacosVersion` major ≥ `14` — SwiftData
   requires macOS 14 (Sonoma)+. The validator parses the leading integer of
   `minMacosVersion`.

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
9. `macos-app-sandbox-entitlements` — App Sandbox, entitlements, hardened runtime; **sandbox ↔ external tools**: executing system subprocesses (e.g. the user's `git`) under sandbox, tool/binary access limits, SSH-key/credential access constraints, and security-scoped bookmarks / Powerbox for user-granted folder access. This is the central tension for a sandboxed Glyver that shells out to `git` and reads many repos — the entry must spell out what is and isn't possible (and when `developer-id` + non-sandboxed is the pragmatic choice).
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

**`reads-overrides`** (`replace`) — audited against pipeline frontmatter, the
steps whose `reads:` reference a disabled doc are: `story-tests`, `create-evals`,
`implementation-plan`, `new-enhancement` (each reads `ux-spec`),
`implementation-playbook` (reads both `ux-spec` **and** `design-system`), and
`platform-parity-review` (reads `design-system`). Map
`{ ux-spec: macos-ui-spec, design-system: macos-ui-spec }` for each. *(No other
step reads these docs — `cross-phase-consistency` does not, so it is intentionally
omitted; a `replace` that matches nothing is a harmless no-op regardless.)*

**`dependency-overrides`** — audited against pipeline frontmatter, the **only**
step whose `dependencies:` reference a disabled step is `platform-parity-review`
(depends on `review-ux`): `replace: { review-ux: review-macos-ui }`. No other
downstream dependency edge references `review-ux`/`ux-spec`/`design-system`, so no
further remaps are required (this avoids the dependency-resolution failure the
review flagged). `review-macos-ui` and `review-macos-release` are wired as
downstream gates via the new steps' own `dependencies` frontmatter (§3.2), not via
overrides.

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

- `src/wizard/copy/macos-native.ts` — labels + help text for the 7 config fields
  (new file, mirrors `src/wizard/copy/game.ts`).
- `src/wizard/copy/core.ts` — add `'macos-native'` entry to `projectType.options`.
- `src/wizard/questions.ts` — `if (projectType === 'macos-native')` branch that
  collects `MacosNativeConfig` with progressive disclosure (ask `sandboxed` only
  when relevant, etc.) and sets `platforms: ['desktop']`.
- `src/cli/init-flag-families.ts` — `MACOS_NATIVE_FLAGS` family
  (`--macos-ui-framework`, `--macos-app-style`, `--macos-min-version`,
  `--macos-distribution`, `--macos-sandboxed`, `--macos-persistence`,
  `--macos-auto-update`).
- `src/cli/commands/init.ts` — add to `CONFIG_SETTING_FLAGS`, yargs builder, and
  `applyFlagFamilyValidation()`.

---

## 8. Auto-Detection + iOS Disambiguation

New `src/project/detectors/macos-native.ts`, registered in
`src/project/detectors/index.ts` `ALL_DETECTORS`. Returns
`{ projectType: 'macos-native', confidence, partialConfig, evidence }` or `null`,
using `SignalContext` helpers (`hasFile`, `dirExists`) plus the existing
`file-text-match` primitive for Swift-source content.

Detection scores macOS-positive vs iOS-positive signals rather than yielding
`null` on the first iOS marker — yielding too early would discard `macos-native`
as a candidate before the disambiguator could weigh it, which is exactly the
failure mode for a multiplatform target.

- **macOS-positive signals:** `import AppKit` / `import Cocoa`; a `*.entitlements`
  file + `Info.plist` with `LSMinimumSystemVersion`; `Package.swift` declaring
  `.macOS(...)` **and** an executable/app product (`.executableTarget` /
  `.executable` product, or an `.app` Xcode target). A pure library that merely
  lists `.macOS` as a supported platform is **not** a macOS app and contributes no
  macOS-positive signal.
- **iOS-positive signals:** `ios/` dir, `import UIKit`, iOS-only deployment target,
  Expo / React Native / Flutter.
- **High** — macOS-positive present and **no** iOS-positive signals.
- **Medium** — `*.xcodeproj` / `.swiftpm` + a SwiftUI `@main App`, macOS-positive,
  no iOS-positive.
- **Low (do NOT return `null`)** — **both** macOS-positive and iOS-positive present
  (a multiplatform Swift target). A low-confidence match lets the shared
  `disambiguate.ts` / confidence ranking weigh `macos-native` against `mobile-app`
  instead of silently dropping it.
- **Return `null`** — iOS-positive with **no** macOS-positive (a pure iOS app —
  `mobile-app` owns it), **or** no Swift/Apple signals at all.

**`partialConfig` inference** (best-effort): `uiFramework` from AppKit vs SwiftUI
imports; `appStyle` from `Info.plist` `LSUIElement` / `NSStatusItem` usage
(`menu-bar`/`agent`); `sandboxed`/entitlements from a `*.entitlements` file;
`autoUpdate: sparkle` from a Sparkle SPM dependency; `persistence` from Core
Data/SwiftData/GRDB/SQLite usage.

**Detector tests assert** the boundary cases explicitly: pure-iOS → `null`;
pure-library-with-`.macOS` → `null`; macOS app (AppKit/entitlements) → high;
macOS + iOS multiplatform → **low** (non-`null`); no Apple signals → `null`. The
wizard's explicit project-type pick remains the final tie-breaker.

---

## 9. Tests, Docs, and Freshness

**Tests**
- `src/e2e/project-type-overlays.test.ts` — add a `macos-native` case asserting
  the 5 steps enabled, the 3 web steps disabled, knowledge injected, and reads
  remapped.
- `src/project/detectors/macos-native.test.ts` — high/medium/null tiers, incl.
  iOS-yield and library-yield cases.
- Coupling-validator tests for all three rules: `mac-app-store ⇒ sandboxed`,
  `mac-app-store ⇒ autoUpdate none`, and `swiftdata ⇒ minMacosVersion ≥ 14`.
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
| `src/config/validators/macos-native.ts` (+ `index.ts`) | 3 coupling validators (MAS⇒sandboxed; MAS⇒autoUpdate none; swiftdata⇒minMacosVersion≥14) | Validation |
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
  a config with a valid `macosNativeConfig`, and all three coupling rules are
  enforced.
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

---

## 13. Design Review Resolutions (MMR + local AI)

Reviewed via `mmr review` (Codex, Gemini, Claude, Grok, Antigravity) **and** the
local-ai-delegate `local_review` (Qwen2.5-7B). Local review: no blocking issues.
Codex/Claude/Grok: no findings. Gemini + Antigravity raised 10 findings;
resolutions below.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | P1 | Detector returning `null` on iOS signals contradicts the "defer to confidence ranking" claim — multiplatform targets get discarded | **FIXED §8** — dual macOS+iOS targets now emit a **low-confidence** match (not `null`); `null` only when iOS-positive with no macOS-positive |
| 2 | P1 | Sparkle auto-update in a Mac App Store build causes rejection | **FIXED §2** — new coupling rule: `distribution=='mac-app-store' ⇒ autoUpdate=='none'` |
| 3 | P1 | Disabling `review-ux` without remapping downstream deps could break dependency resolution | **VERIFIED + FIXED §5** — audited frontmatter: the only dep edge is `platform-parity-review → review-ux` (remapped); reads-edges confirmed complete |
| 4 | P2 | SwiftData requires macOS 14+; no coupling guard | **FIXED §2** — coupling rule: `persistence=='swiftdata' ⇒ minMacosVersion major ≥ 14` |
| 5 | P2 | Duplicate of #2 (distribution/autoUpdate) | Merged into rule #2 |
| 6 | P2 | Missing `appStyle` — windowed vs menu-bar vs agent apps differ materially | **FIXED §2/§7/§8** — added `appStyle` (standard/menu-bar/agent) field + flag + detector inference |
| 7 | P2 | `Package.swift` `.macOS` detector signal too broad (multiplatform libraries) | **FIXED §8** — require an executable/app product; a pure library yields no macOS-positive signal |
| 8 | P2 | Also disable a `frontend-assets` step | **REJECTED** — no `frontend-assets` step exists in `content/pipeline` (verified on disk). The three web steps in §3.1 are the complete set. Likely a reviewer hallucination |
| 9 | P2 | Sandbox + subprocess/`git`/SSH access guidance missing (core Glyver tension) | **FIXED §4** — expanded `macos-app-sandbox-entitlements` to cover subprocess execution, system-tool access, SSH/credential limits, security-scoped bookmarks/Powerbox |
| 10 | P3 | Default `uiFramework: hybrid` — `swiftui` is the modern default | **APPLIED §2** — default changed `hybrid → swiftui` (`hybrid` still available; Glyver picks it) |
