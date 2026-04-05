---
name: game-platform-certification
description: Sony TRC, Microsoft XR, Nintendo Lotcheck, mobile store guidelines, Steam Deck compatibility review, and common failure points
topics: [game-dev, certification, trc, tcr, xr, lotcheck, app-store]
---

Platform certification is the gatekeeping process each platform holder uses to ensure games meet minimum technical and policy standards before release. Every platform has its own requirements document, submission process, and failure criteria. Failing certification delays launch by days to weeks per resubmission, and each failure costs time, money, and morale. Understanding common failure points and building pre-check routines into your development process is far cheaper than discovering issues during formal submission.

## Summary

### Platform Overview

**Sony PlayStation — Technical Requirements Checklist (TRC):**
Sony's TRC is the most detailed console certification. Requirements cover system features (trophies, Activity Cards, PS5-specific features), save data handling, network behavior, error handling, and performance. Sony reviews builds in their QA lab, typically taking 5-10 business days. A single critical failure ("A-rank" issue) triggers a full resubmission with the same timeline.

**Microsoft Xbox — Xbox Requirements (XR):**
Microsoft's requirements are called Xbox Requirements (XR), not "TCR" (an older term). XR covers Xbox Live integration, achievement implementation, suspend/resume behavior, Quick Resume support, smart delivery, and accessibility. Microsoft's certification process is faster than Sony's (often 3-5 business days) but they enforce Xbox Live integration requirements strictly.

**Nintendo — Lotcheck:**
Nintendo's Lotcheck process is the most opaque. Nintendo does not publish a full requirements document externally — developers receive guidelines under NDA when onboarded. Lotcheck is known for strict requirements around controller handling (Joy-Con detachment, handheld/docked transitions), save data, and user interface standards. Lotcheck turnaround varies from 5-15 business days.

**Apple App Store / Google Play:**
Mobile store reviews focus on content policy, privacy (App Tracking Transparency, data safety), and user experience. Apple's review is more subjective and can reject for UI/UX reasons. Google's review is more automated but stricter on policy violations. Both have appeal processes. Review time is typically 1-3 days for updates, longer for initial submissions.

**Steam Deck — Compatibility Review:**
Valve's Steam Deck process is a compatibility review, not a certification. Valve explicitly uses this language. Games are categorized as Verified, Playable, Unsupported, or Unknown based on controller support, display compatibility, seamless experience (no external launchers), and system support (Proton/Linux compatibility). There is no submission process — Valve tests games proactively, and developers can request a review or update their status.

### Certification Timelines

```yaml
# Typical certification timelines (plan these into your release schedule)
certification_timelines:
  sony_playstation:
    initial_submission: "5-10 business days"
    resubmission: "5-10 business days (full re-review)"
    patch_submission: "3-5 business days"
    pre_check_available: true
    notes: "Book slots early — queue backs up before major holidays"

  microsoft_xbox:
    initial_submission: "3-5 business days"
    resubmission: "3-5 business days"
    patch_submission: "1-3 business days"
    pre_check_available: true
    notes: "Pre-cert tool catches many XR issues before submission"

  nintendo_switch:
    initial_submission: "5-15 business days"
    resubmission: "5-15 business days"
    patch_submission: "5-10 business days"
    pre_check_available: false
    notes: "Most variable timeline — plan conservatively"

  apple_app_store:
    initial_submission: "1-7 days (highly variable)"
    update: "1-3 days"
    expedited_review: "Available for critical fixes"
    notes: "Rejections can be subjective — prepare for appeals"

  google_play:
    initial_submission: "1-3 days"
    update: "Hours to 2 days"
    notes: "Mostly automated; policy violations may trigger manual review"

  steam_deck:
    compatibility_review: "Valve-initiated, no fixed timeline"
    developer_request: "Submit via Steamworks partner site"
    notes: "Not a certification — Valve calls it 'compatibility review'"
```

## Deep Guidance

### Sony TRC Common Requirements and Failure Points

Sony's TRC document is extensive (hundreds of requirements). The following are the most common failure points based on industry experience:

**Save data handling (TRC R4050-series):**
- Save data must be stored using the platform's save API, not raw filesystem writes
- Games must handle corrupt save data gracefully — detect, inform the player, offer to create new save
- Save icons and descriptions must be set correctly
- Auto-save must display a save indicator and prevent power-off during write
- Save data size must be within declared limits

**Trophy implementation (TRC R5000-series):**
- Every game must have a Platinum trophy (awarded for earning all other trophies)
- Trophy descriptions must not contain spoilers for the first half of the game
- Trophies must be earnable — no trophy can be made permanently inaccessible through normal gameplay
- Trophy unlock must use the correct API calls and display the system notification
- Trophy images must meet resolution and content guidelines

**PS5-specific features:**
- Activity Cards must accurately reflect game progress and state
- Haptic feedback and adaptive triggers should be implemented (strongly recommended, not always required)
- Game Help integration for Activity Cards (recommended for major first-party, less enforced for indie)
- SSD performance: loading screens under 2 seconds for fast-travel and respawn (target, not always enforced)

**Network and error handling:**
- Games must handle network disconnection gracefully at every point
- PSN sign-in/sign-out during gameplay must not crash
- Error messages must use platform-standard error codes where applicable
- Online features must check PS Plus subscription status where required

**Common failure pattern:** The single most common TRC failure is improper suspend/resume behavior. The game must correctly handle being suspended (rest mode) and resumed at any point in the game flow — including during loading screens, cutscenes, save operations, and network transactions.

### Microsoft Xbox Requirements (XR)

Microsoft's Xbox Requirements document uses the XR naming convention. Key areas:

**Xbox Live integration:**
- Games using Xbox Live must integrate Xbox Identity (sign-in)
- Achievements must be implemented according to XR specs: meaningful achievements, no trivially awarded achievements, achievement art meets guidelines
- Rich Presence strings must accurately reflect current game activity
- Xbox Live multiplayer must use the platform matchmaking and session management APIs

**Quick Resume:**
- Games must support Quick Resume (suspend to SSD, resume in seconds)
- Game state must be preserved and restored correctly
- Network connections must be re-established transparently after resume
- If Quick Resume is technically impossible for the game, a waiver must be requested

**Smart Delivery:**
- Games targeting both Xbox One and Xbox Series X|S must use Smart Delivery
- Players who purchase the game get the correct version for their console automatically
- This is largely handled by packaging and build configuration in the Xbox partner tools

**Accessibility:**
- XR includes accessibility requirements (drawn from XAG) — text size minimums, subtitle support
- These requirements are evolving and becoming stricter over time
- Meeting XAG guidelines is not required for certification, but specific XR items drawn from XAG are

```typescript
// Pre-certification checklist automation
// Run this as part of your CI/CD pipeline before submission builds

interface CertCheckResult {
  platform: string;
  category: string;
  requirement: string;
  status: "pass" | "fail" | "warn" | "skip";
  details: string;
}

function runPreCertChecks(platform: Platform): CertCheckResult[] {
  const results: CertCheckResult[] = [];

  // Common cross-platform checks
  results.push(checkSaveDataIntegrity());
  results.push(checkCrashOnSuspendResume());
  results.push(checkNetworkDisconnectHandling());
  results.push(checkErrorMessageCompliance(platform));
  results.push(checkMinimumTextSize(platform));
  results.push(checkSubtitleImplementation());
  results.push(checkControllerDisconnectHandling(platform));

  // Platform-specific checks
  switch (platform) {
    case "playstation":
      results.push(checkTrophyImplementation());
      results.push(checkActivityCards());
      results.push(checkPSNSignInOutFlow());
      results.push(checkSaveDataAPI("orbis")); // PS platform save API
      break;

    case "xbox":
      results.push(checkAchievementImplementation());
      results.push(checkQuickResumeSupport());
      results.push(checkRichPresenceStrings());
      results.push(checkXboxLiveIntegration());
      results.push(checkSmartDeliveryConfig());
      break;

    case "nintendo":
      results.push(checkJoyConHandling());
      results.push(checkDockedHandheldTransition());
      results.push(checkNintendoAccountIntegration());
      results.push(checkSaveDataSize());
      break;

    case "ios":
      results.push(checkAppTrackingTransparency());
      results.push(checkInAppPurchaseImplementation());
      results.push(checkPrivacyNutritionLabels());
      results.push(checkIPv6Networking());
      break;

    case "android":
      results.push(checkDataSafetySection());
      results.push(checkTargetAPILevel());
      results.push(checkPlayBillingLibrary());
      break;
  }

  return results;
}

type Platform = "playstation" | "xbox" | "nintendo" | "ios" | "android" | "steam_deck";

// Stub check functions — replace with actual implementation
function checkSaveDataIntegrity(): CertCheckResult {
  return { platform: "all", category: "save", requirement: "Save data integrity", status: "pass", details: "" };
}
function checkCrashOnSuspendResume(): CertCheckResult {
  return { platform: "all", category: "lifecycle", requirement: "Suspend/resume stability", status: "pass", details: "" };
}
function checkNetworkDisconnectHandling(): CertCheckResult {
  return { platform: "all", category: "network", requirement: "Disconnect handling", status: "pass", details: "" };
}
function checkErrorMessageCompliance(p: Platform): CertCheckResult {
  return { platform: p, category: "ux", requirement: "Error message compliance", status: "pass", details: "" };
}
function checkMinimumTextSize(p: Platform): CertCheckResult {
  return { platform: p, category: "accessibility", requirement: "Minimum text size", status: "pass", details: "" };
}
function checkSubtitleImplementation(): CertCheckResult {
  return { platform: "all", category: "accessibility", requirement: "Subtitle options", status: "pass", details: "" };
}
function checkControllerDisconnectHandling(p: Platform): CertCheckResult {
  return { platform: p, category: "input", requirement: "Controller disconnect", status: "pass", details: "" };
}
function checkTrophyImplementation(): CertCheckResult {
  return { platform: "playstation", category: "trc", requirement: "Trophy implementation", status: "pass", details: "" };
}
function checkActivityCards(): CertCheckResult {
  return { platform: "playstation", category: "trc", requirement: "Activity Cards", status: "pass", details: "" };
}
function checkPSNSignInOutFlow(): CertCheckResult {
  return { platform: "playstation", category: "trc", requirement: "PSN sign-in/out", status: "pass", details: "" };
}
function checkSaveDataAPI(api: string): CertCheckResult {
  return { platform: "playstation", category: "trc", requirement: `Save API (${api})`, status: "pass", details: "" };
}
function checkAchievementImplementation(): CertCheckResult {
  return { platform: "xbox", category: "xr", requirement: "Achievements", status: "pass", details: "" };
}
function checkQuickResumeSupport(): CertCheckResult {
  return { platform: "xbox", category: "xr", requirement: "Quick Resume", status: "pass", details: "" };
}
function checkRichPresenceStrings(): CertCheckResult {
  return { platform: "xbox", category: "xr", requirement: "Rich Presence", status: "pass", details: "" };
}
function checkXboxLiveIntegration(): CertCheckResult {
  return { platform: "xbox", category: "xr", requirement: "Xbox Live integration", status: "pass", details: "" };
}
function checkSmartDeliveryConfig(): CertCheckResult {
  return { platform: "xbox", category: "xr", requirement: "Smart Delivery", status: "pass", details: "" };
}
function checkJoyConHandling(): CertCheckResult {
  return { platform: "nintendo", category: "lotcheck", requirement: "Joy-Con handling", status: "pass", details: "" };
}
function checkDockedHandheldTransition(): CertCheckResult {
  return { platform: "nintendo", category: "lotcheck", requirement: "Docked/handheld transition", status: "pass", details: "" };
}
function checkNintendoAccountIntegration(): CertCheckResult {
  return { platform: "nintendo", category: "lotcheck", requirement: "Nintendo Account", status: "pass", details: "" };
}
function checkSaveDataSize(): CertCheckResult {
  return { platform: "nintendo", category: "lotcheck", requirement: "Save data size", status: "pass", details: "" };
}
function checkAppTrackingTransparency(): CertCheckResult {
  return { platform: "ios", category: "appstore", requirement: "ATT prompt", status: "pass", details: "" };
}
function checkInAppPurchaseImplementation(): CertCheckResult {
  return { platform: "ios", category: "appstore", requirement: "IAP implementation", status: "pass", details: "" };
}
function checkPrivacyNutritionLabels(): CertCheckResult {
  return { platform: "ios", category: "appstore", requirement: "Privacy labels", status: "pass", details: "" };
}
function checkIPv6Networking(): CertCheckResult {
  return { platform: "ios", category: "appstore", requirement: "IPv6 networking", status: "pass", details: "" };
}
function checkDataSafetySection(): CertCheckResult {
  return { platform: "android", category: "playstore", requirement: "Data safety section", status: "pass", details: "" };
}
function checkTargetAPILevel(): CertCheckResult {
  return { platform: "android", category: "playstore", requirement: "Target API level", status: "pass", details: "" };
}
function checkPlayBillingLibrary(): CertCheckResult {
  return { platform: "android", category: "playstore", requirement: "Play Billing Library", status: "pass", details: "" };
}
```

### Nintendo Lotcheck

Lotcheck is less documented than Sony/Microsoft certification due to NDA constraints. Known common failure areas:

**Controller handling:**
- Games must handle Joy-Con detachment and reattachment during gameplay without crashing
- Docked-to-handheld and handheld-to-docked transitions must work seamlessly
- If the game supports single Joy-Con play, all required actions must be mappable to the reduced button set
- Pro Controller, Joy-Con grip, handheld mode, and tabletop mode must all be supported (or the game must clearly indicate which modes are supported)

**Performance:**
- Frame rate must not drop below playable thresholds during normal gameplay
- Memory usage must stay within Switch limits (especially problematic for cross-platform ports)
- Load times should be reasonable — excessively long loads can trigger Lotcheck concerns

**User experience:**
- Nintendo has specific requirements for how system UI interacts with the game
- Home button must be responsive at all times
- Sleep mode and wake must work correctly with no data loss

### Apple App Store and Google Play

**Apple-specific concerns:**
- **App Tracking Transparency (ATT)**: Games that track users across apps must display the ATT prompt. Using any third-party analytics or ad SDK likely triggers this requirement.
- **In-App Purchase**: All digital goods must use Apple's IAP system. No linking to external payment methods for digital content. Physical goods and services are exempt.
- **IPv6**: All networking must work on IPv6-only networks. Apple tests this. Hardcoded IPv4 addresses will be rejected.
- **Design guidelines**: Apple rejects apps for UI/UX issues: non-standard navigation, confusing layouts, or "minimal functionality."

**Google-specific concerns:**
- **Target API level**: Google requires targeting a recent Android API level. Falling behind triggers removal from the store.
- **Play Billing Library**: Must use the current version of Google's billing library for in-app purchases.
- **Data Safety section**: Accurate declaration of all data collected and how it is used. Inaccuracies lead to enforcement actions.
- **Families Policy**: Games targeting children face additional restrictions (no personalized ads, limited data collection).

### Steam Deck Compatibility Review

Valve evaluates games for Steam Deck compatibility using four categories:

- **Verified**: The game works perfectly on Steam Deck with no modifications. Full controller support, no launchers, readable text, correct display resolution.
- **Playable**: The game works but may require manual configuration (community controller layout, launcher interaction, text readability issues).
- **Unsupported**: The game does not work on Steam Deck (anti-cheat incompatibility, hardware requirements, missing controller support).
- **Unknown**: Valve has not reviewed the game yet.

**Key criteria for Verified status:**
- Full controller support with appropriate glyphs (show Steam Deck button icons, not Xbox or keyboard)
- No external launcher that interrupts the experience (this is the most common reason for "Playable" instead of "Verified")
- Text readable at Steam Deck's 7-inch 1280x800 display
- Default configuration works without user intervention
- Game runs at acceptable performance on Steam Deck hardware

### Waiver Best Practices

Sometimes a certification requirement cannot be met. Platforms allow waivers for specific requirements when justified.

**When to request a waiver:**
- A technical limitation of the game engine or middleware makes compliance impossible
- The requirement conflicts with the game's core design (e.g., a VR game cannot implement certain controller handling requirements)
- The feature is planned for a post-launch patch with a specific date

**How to write a successful waiver:**
- Identify the exact requirement number being waived
- Explain why compliance is not possible (technical detail, not excuses)
- Describe the user impact and any mitigations in place
- Provide a timeline for future compliance if applicable
- Be specific — vague waiver requests are denied

### Common Failure Points by Category

```yaml
# Most common certification failures across all platforms
common_failures:
  lifecycle_management:
    frequency: "Very High"
    examples:
      - "Game crashes when suspended during loading screen"
      - "Network session not restored after Quick Resume"
      - "Save data corrupted when power lost during write"
      - "Game hangs when user signs out of platform account mid-game"
    prevention: "Test suspend/resume at every game state, including loading and saving"

  controller_handling:
    frequency: "High"
    examples:
      - "Game does not respond to controller reconnection"
      - "Joy-Con detachment causes crash"
      - "Button prompts show wrong glyphs for current input device"
      - "No controller disconnect notification shown to player"
    prevention: "Implement controller hot-swap handling early; test disconnect at every screen"

  save_data:
    frequency: "High"
    examples:
      - "Corrupt save data crashes game instead of recovery prompt"
      - "Save data exceeds declared size limits"
      - "Auto-save does not show save indicator"
      - "Platform save API not used (raw file I/O instead)"
    prevention: "Use platform save APIs exclusively; test with corrupted save files"

  network_resilience:
    frequency: "Medium-High"
    examples:
      - "Game hangs when network drops during matchmaking"
      - "Error message does not use platform error codes"
      - "No timeout on network requests — game waits indefinitely"
      - "Online features accessible without required subscription check"
    prevention: "Test every network call with simulated disconnects and timeouts"

  text_and_localization:
    frequency: "Medium"
    examples:
      - "Text truncated or overlapping in non-English languages"
      - "Minimum text size requirements not met"
      - "Placeholder text visible in shipped build"
      - "Legal text or EULA not displayed per platform requirements"
    prevention: "Test all supported languages; verify text size at target display distances"

  age_rating_and_content:
    frequency: "Low-Medium"
    examples:
      - "ESRB/PEGI rating does not match actual content"
      - "User-generated content not properly filtered"
      - "Content descriptors incomplete or inaccurate"
    prevention: "Complete rating questionnaires after content lock; re-rate if content changes"
```

### Certification in Your Release Schedule

Build certification into your timeline from day one:

- **Content lock → Cert submission**: Allow 1-2 weeks for internal pre-check and build preparation
- **First submission → Response**: Allow the full platform timeline (worst case for each platform)
- **Fix and resubmit**: Budget for at least one resubmission cycle per platform
- **Total cert buffer**: 4-6 weeks minimum from content lock to release-ready
- **Multi-platform simultaneous launch**: All platforms must pass cert before any can launch (unless the publisher accepts staggered launch)

Never schedule a release date that does not include certification buffer. A failed certification with no schedule margin means a delayed launch.
