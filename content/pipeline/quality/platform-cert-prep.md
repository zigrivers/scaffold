---
name: platform-cert-prep
description: Per-platform certification checklists for console, mobile, VR/AR, and PC storefronts
summary: "Prepares platform certification checklists — Sony TRC, Microsoft XR, Nintendo Lotcheck, App Store, Google Play, Steam Deck compatibility — covering sign-in/out, entitlements, achievements, parental controls, ratings, controller disconnect, suspend/resume, and error messages."
phase: "quality"
order: 964
dependencies: [game-accessibility, performance-budgets, game-ui-spec, input-controls-spec]
outputs: [docs/platform-cert-checklist.md]
conditional: "if-needed"
reads: [save-system-spec, netcode-spec, audio-design, localization-plan, online-services-spec, modding-ugc-spec]
knowledge-base: [game-platform-certification]
---

## Purpose
Prepare per-platform certification checklists that ensure the game passes
first-party submission requirements on every target platform. Platform
certification (also called Technical Requirements Checklists, or TRCs) is the
mandatory review process that console manufacturers, mobile storefronts, and
VR/AR platforms require before a title can be published. Failing certification
delays launch by weeks or months.

Each platform has unique requirements that touch nearly every system in the
game: user account sign-in/out flow, entitlement and DLC verification,
achievement/trophy integration, parental controls and age rating compliance,
controller disconnect handling, suspend/resume lifecycle, error message
standards, and platform-specific shell behavior (Quick Resume on Xbox,
Activities on PlayStation, etc.).

This step consolidates requirements from across the codebase — accessibility,
performance budgets, UI, input controls, save systems, networking, audio,
localization, online services, and modding — into per-platform checklists
that QA teams can verify systematically before submission.

## Conditional Evaluation
Enable when: `targetPlatforms` includes any console (PlayStation, Xbox,
Nintendo Switch), mobile (iOS, Android), VR/AR (Meta Quest, PlayStation VR2,
Apple Vision Pro), or PC storefronts with compatibility review programs
(Steam Deck Verified). Desktop-only games distributed through open platforms
(itch.io, self-hosted) without certification programs do not need this step.

Skip when: the game targets only open PC platforms (Windows/macOS/Linux via
direct distribution or itch.io) with no storefront certification requirements.
Steam itself does not have a formal certification process (beyond basic content
review), but Steam Deck Verified is a certification program and triggers this
step.

## Inputs
- docs/game-accessibility.md (required) — accessibility features to verify against platform accessibility requirements
- docs/performance-budgets.md (required) — frame rate and memory targets per platform
- docs/game-ui-spec.md (required) — UI flows for sign-in, error messages, platform shell integration
- docs/input-controls-spec.md (required) — controller support, input remapping, disconnect handling
- docs/plan.md (required) — target platforms and target ratings
- docs/save-system-spec.md (optional, forward-read) — save/load, cloud save, platform storage integration
- docs/netcode-spec.md (optional, forward-read) — network error handling, NAT traversal, platform networking APIs
- docs/audio-design.md (optional, forward-read) — audio output requirements, platform audio policies (e.g., mute on focus loss)
- docs/localization-plan.md (optional, forward-read) — supported languages per platform, platform-mandated language requirements
- docs/online-services-spec.md (optional, forward-read) — platform service integration (PSN, Xbox Live, Nintendo Online)
- docs/modding-ugc-spec.md (optional, forward-read) — UGC policies per platform, content moderation requirements

## Expected Outputs
- docs/platform-cert-checklist.md — per-platform certification checklists
  with specific requirements, verification steps, and pass/fail criteria

## Quality Criteria
- (mvp) Per-platform checklist generated for every target platform: each requirement has a description, verification step, and pass/fail criterion
- (mvp) Sign-in/out flow verified: platform account sign-in on boot, sign-out during gameplay (return to title screen or graceful disconnect), account switching (where platform supports it)
- (mvp) Controller disconnect handling: game pauses or shows reconnection prompt, no input loss or crash, reconnection resumes correctly
- (mvp) Suspend/resume lifecycle: game state preserved on suspend, no data loss, network reconnection on resume, no stale UI
- (mvp) Error messages follow platform guidelines: platform-specific error codes where required, user-friendly language, no raw exception text, retry/cancel options
- (deep) Entitlement and DLC verification: license check on boot and periodically during gameplay, graceful handling of revoked entitlements, DLC content gating
- (deep) Achievement/trophy integration: unlock conditions mapped to platform achievement APIs, offline unlock queuing, no duplicate unlocks, required platinum/1000G structure (PlayStation/Xbox)
- (deep) Parental controls and age rating: respect platform-level restrictions (communication, purchases, content visibility), age rating compliance (ESRB, PEGI, CERO, GRAC, USK) per target market
- (deep) Platform-specific shell behavior: Quick Resume (Xbox), Activities (PlayStation), sleep mode (Nintendo Switch), App Clips (iOS), Instant Apps (Android)
- (deep) Performance certification: frame rate within platform-mandated minimums (30fps floor on console, thermal throttling handling on mobile), memory within platform limits, load time requirements
- (deep) Accessibility certification: platform-mandated accessibility features (Xbox Accessibility Guidelines, PlayStation accessibility requirements, Apple accessibility standards)
- (deep) Network certification: NAT type handling, platform matchmaking API compliance, graceful degradation on network loss, bandwidth limits

### Console-Specific Sections
- **PlayStation (TRC)**: PSN sign-in, trophy set structure, Activity Cards, suspend/resume with network reconnect, PS VR2 comfort settings (if VR), content restriction API
- **Xbox (XR)**: Xbox Live sign-in, achievement structure (1000G base + DLC), Quick Resume support, Game Pass considerations, Xbox Accessibility Guidelines compliance
- **Nintendo Switch (Lotcheck)**: Nintendo Account integration, controller grip modes (handheld, tabletop, docked), sleep mode save, touch screen support (handheld), HD Rumble guidelines

### Mobile-Specific Sections
- **iOS (App Store Review)**: App Store Review Guidelines compliance, in-app purchase via StoreKit (no external payment links), privacy nutrition labels, App Tracking Transparency, Universal Links, background audio policy
- **Android (Google Play)**: Google Play policies, billing library integration, target API level requirements, adaptive icons, back gesture handling, foldable/tablet layout

### PC Storefront Sections
- **Steam Deck Verified**: controller-native UI (no mandatory mouse/keyboard), readable text at 7" 800p, default graphics preset within thermal envelope, Proton compatibility, suspend/resume via OS

### VR/AR-Specific Sections
- **Meta Quest**: comfort rating (comfortable/moderate/intense), guardian boundary handling, passthrough integration, hand tracking fallback, performance targets (72/90/120Hz)
- **Apple Vision Pro**: visionOS design guidelines, spatial UI placement, eye tracking privacy, SharePlay integration

## Methodology Scaling
- **deep**: Comprehensive per-platform checklists with every TRC/XR/Lotcheck
  requirement mapped, verification procedures, automated compliance test
  suggestions, platform-specific shell integration, and certification
  submission timeline with resubmission contingency. 20-35 pages.
- **mvp**: Core certification requirements per platform (sign-in, controller
  disconnect, suspend/resume, error messages) with basic verification steps.
  5-10 pages.
- **custom:depth(1-5)**:
  - Depth 1: sign-in/out, controller disconnect, and suspend/resume checklists per platform.
  - Depth 2: add error message compliance, entitlement verification, and basic achievement integration.
  - Depth 3: add parental controls, age rating compliance, performance certification targets, and platform shell behavior.
  - Depth 4: add accessibility certification, network certification, platform-specific detailed requirements, and automated compliance test suggestions.
  - Depth 5: full checklists with certification submission timeline, resubmission contingency plan, platform relationship management notes, and cross-platform compliance matrix.

## Mode Detection
Check for docs/platform-cert-checklist.md. If it exists, operate in update
mode: read existing checklists and diff against current platform targets,
accessibility features, performance budgets, and input controls. Preserve
existing pass/fail results and verification notes. Add checklists for new
target platforms. Update requirements if platform SDKs or policies changed.

## Update Mode Specifics
- **Detect prior artifact**: docs/platform-cert-checklist.md exists
- **Preserve**: existing pass/fail verification results, platform-specific
  implementation notes, certification submission history, waiver/exception
  records, platform contact information
- **Triggers for update**: target platforms changed (new platform added or
  removed), accessibility spec updated (new features to verify), performance
  budgets changed (new targets to certify), input controls spec changed
  (controller handling updates), platform SDK or policy update (new TRC/XR
  version), save system or networking spec changed
- **Conflict resolution**: if a requirement from one platform conflicts with
  another platform's requirement (e.g., different mandatory button mappings),
  document both requirements and propose a platform-adaptive implementation;
  never sacrifice one platform's certification for another
