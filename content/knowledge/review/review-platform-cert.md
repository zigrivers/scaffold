---
name: review-platform-cert
description: Failure modes and review passes specific to platform certification — TRC/TCR compliance, save data, suspend/resume, controller disconnect, and content ratings
topics: [game-dev, review, certification, trc, tcr, compliance]
---

# Review: Platform Certification

Platform certification documents must demonstrate compliance with each target platform's Technical Requirements Checklist (TRC for PlayStation, TCR for Xbox, Lotcheck for Nintendo, platform guidelines for mobile stores). Certification failures cause submission rejections that cost weeks of schedule and tens of thousands of dollars in resubmission fees. This review uses 7 passes targeting the common certification failure points that can be caught at design time.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Common TRC/TCR Failure Points**: Known high-failure-rate requirements are addressed per platform; no reliance on "we will fix it during cert prep."
- **Pass 2 — Save Data Compliance**: Save data size limits, save/load timing, corruption recovery, and platform-mandated save behaviors are specified.
- **Pass 3 — Suspend/Resume Handling**: Application correctly handles OS-level suspend and resume events on every target platform without data loss or state corruption.
- **Pass 4 — Controller Disconnect Behavior**: Every controller disconnect scenario has a defined UI response and game state handling; no scenario leaves the player stuck.
- **Pass 5 — Error Message Requirements**: Error messages meet platform-specific wording, formatting, and localization requirements; no generic or developer-facing error text.
- **Pass 6 — Trophy/Achievement Compliance**: Trophy/achievement design meets platform rules for count, point totals, descriptions, difficulty distribution, and unlock conditions.
- **Pass 7 — Content Rating Alignment**: Game content aligns with submitted content rating questionnaires; no undisclosed content triggers a rating change post-submission.

## Deep Guidance

---

## Pass 1: Common TRC/TCR Failure Points

### What to Check

Each target platform has a published Technical Requirements Checklist (or equivalent) with hundreds of requirements. Certain requirements have historically high failure rates because they are non-obvious, require specific implementation, or are commonly overlooked. This pass focuses on those high-failure-rate requirements.

### Why This Matters

A certification failure costs 2-6 weeks of schedule (resubmission queue times) and potentially $10,000-$50,000 in fees, QA costs, and delayed revenue. Most failures are preventable — they are caused by requirements that the team did not know about until the certification report arrived. Catching these at design time costs hours; catching them at certification costs weeks.

### How to Check

Use this per-platform checklist for common failure points:

```markdown
## PlayStation TRC — Common Failure Points

- [ ] Title does not exceed 128 character limit for save data descriptions
- [ ] System software version check on boot (display update prompt if outdated)
- [ ] PS button behavior: single press returns to system menu, hold opens quick menu
- [ ] All mandatory terminology used correctly (e.g., "PS5" not "PlayStation 5" in certain contexts)
- [ ] User account switching handled (user signs in with different PSN account mid-session)
- [ ] Network connectivity loss displays correct system dialog (not custom error)
- [ ] Background download/install does not interfere with gameplay
- [ ] HDR output handled correctly when TV does not support HDR
- [ ] Activity cards populated correctly for PS5
- [ ] Game help content provided for PS5 (if applicable)
- [ ] Haptic feedback and adaptive trigger usage follows platform guidelines
- [ ] 4K and Performance mode options available on PS5

## Xbox TCR — Common Failure Points

- [ ] Title must function on all Xbox console SKUs (Series X, Series S, One)
- [ ] Quick Resume must not corrupt game state or lose progress
- [ ] Xbox network connectivity requirements: graceful offline mode or clear messaging
- [ ] Gamertag display uses correct formatting (no truncation of long Gamertags)
- [ ] Smart Delivery configured correctly (correct build for each SKU)
- [ ] Suspend/resume does not desync multiplayer session
- [ ] Accessibility: text-to-speech and speech-to-text for chat (XR-015)
- [ ] Energy efficiency: game must reduce power consumption during idle
- [ ] Cross-generation save data compatibility (if applicable)
- [ ] Game Pass integration: trial/demo behavior if accessed via subscription

## Nintendo Lotcheck — Common Failure Points

- [ ] Controller grip change handling: game pauses when grip changes
- [ ] Handheld vs. docked display adapts correctly (resolution, UI scaling)
- [ ] Joy-Con detachment pauses game and prompts reconnection
- [ ] Touch screen functionality in handheld mode (if applicable)
- [ ] Sleep mode does not corrupt save data
- [ ] Nintendo Account and online service integration follows guidelines
- [ ] Age-gated content handled per Nintendo requirements
- [ ] Home button behavior: game suspends cleanly
- [ ] Screenshot and video capture do not include restricted content
- [ ] NFC (amiibo) integration follows guidelines (if applicable)

## Mobile (iOS App Store / Google Play) — Common Failure Points

- [ ] No external payment links (iOS) or compliant alternative payment (where permitted)
- [ ] App Tracking Transparency (ATT) prompt before any tracking (iOS 14.5+)
- [ ] Background audio handling: music apps continue when game is not in focus
- [ ] Push notification permissions requested at appropriate time (not on first launch)
- [ ] Data deletion capability per Apple/Google requirements
- [ ] Subscription management deep links provided
- [ ] Minimum OS version support matches store requirements
- [ ] App size within store limits (or uses on-demand resources)
- [ ] Accessibility: VoiceOver/TalkBack support for critical UI flows
- [ ] Privacy nutrition label / Data Safety section accurate and complete
```

### What a Finding Looks Like

- P0: "Game targets Xbox but Quick Resume handling is not documented. Quick Resume is a mandatory TCR — the game must restore correctly from a suspended state hours or days later."
- P0: "Game targets iOS but no App Tracking Transparency implementation is documented. Missing ATT will cause App Store rejection."
- P1: "PlayStation TRC requires specific system dialogs for network errors, but the design uses custom error dialogs. Custom dialogs will fail certification."
- P2: "Nintendo Lotcheck requires pause on Joy-Con detachment, but the design does not mention Joy-Con-specific controller handling."

---

## Pass 2: Save Data Compliance

### What to Check

Save data implementation meets platform-specific requirements for size limits, save timing, corruption detection and recovery, user-facing save indicators, and platform-mandated save behaviors (cloud sync, account-specific save isolation).

### Why This Matters

Save data certification failures are among the most costly because they often require architectural changes. A save system that exceeds the platform's size limit cannot be fixed with a tweak — it requires save data restructuring, migration planning, and backward compatibility testing. Save corruption that loses player progress generates more support tickets and refund requests than almost any other bug.

### How to Check

1. Verify save data size against platform limits: PlayStation has per-title limits, Nintendo Switch has strict per-title allocation, mobile platforms have iCloud/Google Play limits
2. Check save timing: does the game save at appropriate points? Is there a visible save indicator during all save operations? (Most platforms require this)
3. Verify corruption detection: does the save system detect corrupted data? Is there a recovery mechanism (backup save, previous version rollback)?
4. Check for platform-mandated save behaviors: cloud save sync, account-specific save isolation, save data portability between console generations
5. Verify that the save indicator is never hidden or obscured during save operations
6. Check for save data migration: if the game updates change the save format, is there a migration path from old saves?
7. Verify that save/load operations do not block the main thread (certification requirement on most platforms)

### What a Finding Looks Like

- P0: "Save data size is estimated at 50MB per slot but Nintendo Switch allocates a maximum of 32MB per title. The save system exceeds the platform limit."
- P0: "No save corruption detection exists. A power loss during save produces a corrupted file with no recovery — the player loses all progress."
- P1: "Save indicator is shown during manual saves but not during autosaves. Platform certification requires the save indicator during ALL save operations."
- P2: "Save data migration strategy is not documented. A future update that changes save format will either break old saves or require emergency migration code."

---

## Pass 3: Suspend/Resume Handling

### What to Check

The application correctly handles OS-level suspend and resume events on every target platform. Suspend can happen at any time — during loading, during cutscenes, during multiplayer matches, during transactions. Resume must restore the game to a usable state without data loss, state corruption, or stale connections.

### Why This Matters

Players suspend games constantly — answering phone calls, switching apps, putting the console to sleep. On Xbox, Quick Resume can suspend a game for days. On mobile, any incoming call or notification can trigger a suspend. A game that crashes on resume, loses unsaved progress, or shows a black screen after resume will fail certification on every platform.

### How to Check

1. List all game states where suspend can occur: main menu, loading screen, gameplay, cutscene, multiplayer match, store transaction, save in progress, download in progress
2. For each state, verify the resume behavior: does the game return to the correct state? Are network connections re-established? Are time-sensitive elements (timers, cooldowns, server sessions) handled?
3. Check for stale connection handling: after a 4-hour suspend, network connections are dead — does the game detect this and reconnect or show an appropriate error?
4. Verify that suspend during save does not corrupt data (save must be atomic or recoverable)
5. Check for time-sensitive resume: if the game has daily resets, seasonal events, or time-limited offers, what happens when the player resumes after the reset time?
6. Verify audio resume: does audio restart correctly? Are audio handles stale after resume?
7. Check for authentication token expiry: OAuth tokens, session tokens, and platform authentication may expire during long suspends

### What a Finding Looks Like

- P0: "No suspend/resume handling is documented. The game will crash on resume when attempting to use stale network connections."
- P0: "Xbox Quick Resume is not addressed. A game suspended for 48 hours will resume with expired authentication tokens, stale multiplayer sessions, and incorrect daily reset states."
- P1: "Resume after network-based suspend (multiplayer match) attempts to continue the match without checking if the session still exists. This will produce a desync or crash."
- P2: "Audio resume is not specified. Some platforms require explicit audio session reactivation after resume — without it, the game is silent."

---

## Pass 4: Controller Disconnect Behavior

### What to Check

Every controller disconnect scenario has a defined game response: which player is affected, what UI is shown, how gameplay is affected, and how reconnection is handled. No scenario leaves the player in an unrecoverable state.

### Why This Matters

Controller disconnect is a certification-tested scenario on every console platform. The platform holder will disconnect controllers at every possible moment during certification testing — during gameplay, during menus, during saving, during loading. Every disconnect must produce a clear, user-recoverable response. A game that freezes, crashes, or continues playing without input on controller disconnect will fail certification.

### How to Check

1. Verify that controller disconnect shows a system-appropriate dialog: "Controller disconnected. Please reconnect controller to continue."
2. Check that gameplay pauses on disconnect (except in multiplayer where pausing is not possible)
3. Verify that the correct player is identified in split-screen/local multiplayer — disconnecting Player 2's controller should not pause Player 1
4. Check for wireless controller battery death: same as disconnect but may occur gradually (low battery warning first)
5. Verify reconnection behavior: does the game resume automatically, or does the player press a button to continue?
6. Check for controller reassignment: if the player reconnects a different controller, is it accepted?
7. Verify behavior during critical moments: what happens if the controller disconnects during a save? During a purchase? During a cutscene?

```markdown
## Controller Disconnect Scenario Matrix

| Game State          | Disconnect Response       | Gameplay Impact    | Reconnect Behavior    |
|---------------------|---------------------------|--------------------|-----------------------|
| Main menu           | [Dialog shown]            | [Menu navigation paused] | [Resume on reconnect] |
| Single-player       | [Dialog + pause]          | [Game paused]      | [Resume on button press] |
| Local multiplayer   | [Dialog for affected player] | [Affected player paused] | [Resume on reconnect] |
| Online multiplayer  | [Dialog shown, no pause]  | [Player input stops] | [Resume on reconnect] |
| Loading screen      | [Dialog shown]            | [Loading continues] | [Resume on reconnect] |
| Cutscene            | [Dialog + pause cutscene] | [Cutscene paused]  | [Resume cutscene]     |
| Save in progress    | [Dialog after save completes] | [Save completes first] | [Resume on reconnect] |
| Store/purchase      | [Dialog + cancel transaction] | [Transaction rolled back] | [Restart transaction] |
```

### What a Finding Looks Like

- P0: "Controller disconnect during gameplay is not documented. No pause dialog, no input handling, no reconnection flow — this is a guaranteed certification failure."
- P1: "Controller disconnect in multiplayer is handled (toast notification) but in single-player there is no pause. Single-player must pause on disconnect per TRC/TCR."
- P1: "Low battery warning is not mentioned. Platforms require a low battery notification before the controller dies — this is separate from the disconnect dialog."
- P2: "Controller disconnect during save shows the disconnect dialog immediately. If the save has not completed, this could cause the player to pull the power cord, corrupting the save. Show the dialog only after the save completes."

---

## Pass 5: Error Message Requirements

### What to Check

Error messages meet platform-specific requirements for wording, formatting, button prompts, and localization. No error message contains developer-facing text (error codes without explanation, stack traces, debug information). Error messages use platform-standard terminology.

### Why This Matters

Platform holders test every error state during certification. An error message that says "Error 0x80070005" or "null reference exception" will fail certification. An error message that says "Press A to continue" on PlayStation (where the button is "Cross" or a symbol) will fail certification. Error messages must use the platform's mandated terminology, button iconography, and localization for every supported language.

### How to Check

1. List every error state: network failure, save failure, authentication failure, matchmaking failure, content download failure, server maintenance, account restriction
2. For each error state, verify the message explains what happened and what the player can do
3. Check button prompt correctness per platform: PlayStation uses symbols (Cross, Circle, Triangle, Square), Xbox uses letters (A, B, X, Y), Nintendo Switch uses letters in different positions
4. Verify that error messages do not contain: error codes without explanation, technical jargon, developer-facing debug information, profanity, or blame-the-user language
5. Check localization: are all error messages localized into every supported language?
6. Verify that platform-specific terminology is used: "PlayStation Network" not "PSN," "Xbox network" not "Xbox Live" (terminology changes over time)
7. Check that network error messages use platform-mandated dialogs where required (some platforms require system-level network error dialogs, not custom ones)

### What a Finding Looks Like

- P0: "Network error message says 'Connection failed (errno: 110).' This developer-facing message will fail certification on every platform."
- P0: "Error messages reference 'Press A' on all platforms. PlayStation requires Cross symbol, not 'A.' Nintendo Switch 'A' button is in a different position than Xbox 'A'."
- P1: "Error messages are in English only but the game supports 12 languages. Every user-facing string must be localized."
- P2: "Server maintenance message says 'Server is down, try again later.' This does not tell the player why (maintenance) or when (estimated return time). Improve to 'Server maintenance in progress. Expected to return at [TIME].'"

---

## Pass 6: Trophy/Achievement Compliance

### What to Check

Trophy/achievement design meets platform rules for total count, point totals (Gamerscore, trophy distribution), description formatting, difficulty distribution, secret/hidden achievement handling, and unlock conditions.

### Why This Matters

Trophy and achievement systems have strict platform rules that vary between PlayStation, Xbox, and Steam. PlayStation mandates a Platinum trophy, a specific distribution of Gold/Silver/Bronze trophies, and exact description formatting. Xbox mandates a base Gamerscore of 1000 and specific rules for DLC Gamerscore additions. Violating these rules causes certification failure — and the fix requires redesigning the achievement list, which is a design task, not an engineering task.

### How to Check

1. Verify trophy/achievement count meets platform requirements:
   - **PlayStation**: Must include 1 Platinum (unlock all others), appropriate Gold/Silver/Bronze distribution
   - **Xbox**: Base game must total exactly 1000 Gamerscore; DLC adds up to 250 per release
   - **Nintendo/Steam**: More flexible but verify platform-specific guidelines
2. Check descriptions: no spoilers in visible descriptions (use hidden/secret for story spoilers), no profanity, correct platform terminology
3. Verify difficulty distribution: not all trophies should be trivially easy (cheapens the system) or brutally hard (frustrates completionists)
4. Check for unobtainable achievements: can every achievement actually be earned? Multiplayer achievements in games that may lose their servers are a known issue
5. Verify that no achievement requires luck-based conditions that a player cannot influence through skill
6. Check DLC achievement rules: DLC achievements must not be required for the base game Platinum/100%
7. Verify that achievement unlock conditions are testable by QA and certifiable by the platform

```markdown
## Achievement Compliance Matrix

| Requirement                        | PlayStation | Xbox    | Steam   | Status  |
|------------------------------------|-------------|---------|---------|---------|
| Total count within limits          | [✅/❌]     | [✅/❌] | [✅/❌] | [Done]  |
| Point/tier distribution correct    | [✅/❌]     | [✅/❌] | N/A     | [Done]  |
| Platinum/100% achievable           | [✅/❌]     | [✅/❌] | [✅/❌] | [Done]  |
| No unobtainable achievements      | [✅/❌]     | [✅/❌] | [✅/❌] | [Done]  |
| Descriptions spoiler-free          | [✅/❌]     | [✅/❌] | [✅/❌] | [Done]  |
| Difficulty distribution reasonable | [✅/❌]     | [✅/❌] | [✅/❌] | [Done]  |
| DLC achievements separate from base| [✅/❌]     | [✅/❌] | [✅/❌] | [Done]  |
| Hidden achievements used correctly | [✅/❌]     | [✅/❌] | [✅/❌] | [Done]  |
```

### What a Finding Looks Like

- P0: "Xbox base game Gamerscore totals 750, not 1000. Xbox certification requires exactly 1000 base Gamerscore."
- P0: "PlayStation trophy list has no Platinum trophy. A Platinum trophy is mandatory for all PlayStation games."
- P1: "Achievement 'Win 1000 Online Matches' requires approximately 500 hours of multiplayer. If the game's servers are shut down in 3 years, this achievement becomes permanently unobtainable."
- P2: "Achievement description 'Defeat the final boss' spoils the story. Mark as a hidden/secret achievement to hide the description until earned."

---

## Pass 7: Content Rating Alignment

### What to Check

Game content aligns with the content rating submitted to rating boards (ESRB, PEGI, CERO, USK, GRAC, ACB). No in-game content exceeds the submitted rating. User-generated content (chat, custom names, shared creations) has moderation to prevent rating-exceeding content.

### Why This Matters

A content rating mismatch — submitting for Teen/PEGI 12 but shipping Mature/PEGI 18 content — results in the game being pulled from stores until the rating is corrected. This is a commercial disaster: lost sales during delisting, re-rating fees, potential fines, and reputational damage. Rating boards test the game independently and will find content that the developer's questionnaire did not disclose.

### How to Check

1. List all content that could affect ratings: violence level (depiction, blood, gore), language (profanity, slurs), sexual content, drug/alcohol references, gambling mechanics, horror/fear themes
2. Cross-reference content with the intended rating per rating board:
   - **ESRB** (North America): E, E10+, T, M, AO
   - **PEGI** (Europe): 3, 7, 12, 16, 18
   - **CERO** (Japan): A, B, C, D, Z
   - **USK** (Germany): 0, 6, 12, 16, 18
3. Verify that user-generated content has moderation: text chat filters, image moderation, name filters
4. Check that in-game purchases are disclosed in the rating (most boards now require "In-Game Purchases" or "In-Game Purchases (Includes Random Items)" descriptors)
5. Verify that DLC and updates do not introduce content that exceeds the base game's rating
6. Check for simulated gambling: loot boxes, slot machines, card packs — these may trigger gambling descriptors in some markets
7. Verify that content differs by market where required: some content acceptable in one market may be banned in another (Germany has specific rules about symbols, Australia about drug references)

### What a Finding Looks Like

- P0: "Game is rated ESRB Teen but includes decapitation animations in combat. Dismemberment/decapitation typically triggers Mature rating."
- P0: "Loot boxes with real-money purchase are present but 'In-Game Purchases (Includes Random Items)' descriptor was not submitted. This will be flagged by every rating board."
- P1: "Text chat exists with no profanity filter. Unmoderated text chat allows players to share content that exceeds the game's rating."
- P2: "The Australian market is targeted but drug references in a side quest may trigger ACB refusal of classification. Review the specific content against ACB guidelines."

---

## Common Review Anti-Patterns

### 1. "We Will Handle Cert During Cert Prep"

The certification compliance section of the design document says "TRC/TCR compliance will be addressed during the certification preparation phase" — 6-8 weeks before submission. Requirements that affect architecture (save system, suspend/resume, controller handling) cannot be retrofitted in 6 weeks. By design time, these requirements must be baked into the architecture.

**How to spot it:** The design document has no section for platform certification requirements. Or it has a section that says "see certification preparation milestone." No platform-specific technical requirements are mentioned in the technical design.

### 2. Single-Platform Certification Focus

The document addresses one platform's certification requirements thoroughly (usually the platform the team is most familiar with) and ignores or hand-waves the others. Each platform has unique requirements — Xbox Quick Resume, PlayStation Activity Cards, Nintendo Switch handheld/docked modes — that require distinct implementation.

**How to spot it:** One platform has a detailed checklist; other platforms have "similar requirements apply" or "to be determined." The unique requirements of each platform are not enumerated.

### 3. Outdated Certification Requirements

The certification requirements referenced in the document are from a previous console generation or an outdated version of the TRC/TCR. Platform requirements change with every SDK update — new requirements are added, old ones are modified. A document referencing PS4-era TRC for a PS5 game will miss Activity Cards, Haptic Feedback guidelines, and Game Help requirements.

**How to spot it:** The document references a specific TRC/TCR version number that does not match the current SDK. Or it does not reference any version at all, making it impossible to verify currency. Requirements like "Activity Cards" or "Quick Resume" are absent despite targeting current-gen platforms.

### 4. Content Rating as Afterthought

The content rating questionnaire is treated as a bureaucratic checkbox rather than a design input. The team fills out the rating questionnaire based on the current build without verifying that planned future content (DLC, seasonal content, user-generated content) will not exceed the submitted rating. A Mature rating on a Teen-targeted game means rebuilding the marketing strategy, store page, and potentially removing content.

**How to spot it:** The rating section references only current content, not planned content. No mention of DLC or live-service content in the rating analysis. User-generated content moderation is not connected to rating compliance.
