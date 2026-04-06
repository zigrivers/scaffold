---
name: mobile-app-requirements
description: Platform guidelines (Apple HIG, Material Design), performance budgets, device matrix, and accessibility requirements for mobile apps
topics: [mobile-app, requirements, hig, material-design, accessibility, performance, device-matrix]
---

Mobile app requirements differ fundamentally from web requirements: platform guidelines are design law, not suggestions; performance budgets are stricter because CPU and battery are finite; accessibility is both a legal obligation and a market expansion. Define all of these explicitly before writing code — changing navigation patterns or accessibility models mid-project is expensive.

## Summary

Mobile app requirements encompass platform design guidelines (Apple HIG for iOS, Material Design for Android), performance budgets (launch time, frame rate, memory), device matrix coverage, and accessibility compliance. iOS and Android have distinct design languages, interaction patterns, and review processes — apps that ignore platform conventions face App Store rejection or poor user ratings. Document requirements across all four dimensions before implementation begins.

## Deep Guidance

### Apple Human Interface Guidelines (HIG)

The HIG is not aspirational — App Store review uses it as a rejection criterion. Key rules:

**Navigation patterns**
- iOS uses tab bars for top-level navigation, not drawers. Bottom navigation bars with 2–5 items represent the canonical iOS navigation pattern.
- Navigation controllers manage hierarchical content with back-button semantics. Never intercept the swipe-back gesture unless replacing it with an equivalent interaction.
- Modal presentations are for transient tasks that interrupt the main flow. Use `.sheet` (card modal) or `.fullScreenCover` (full-screen modal) appropriately.
- Avoid Android-style hamburger drawers on iOS — they are foreign to the platform and fail review for poor HIG compliance.

**Visual design**
- Use SF Symbols for iconography on iOS — they scale with Dynamic Type and render at all weights automatically.
- Respect the safe area insets: status bar, home indicator, and notch are system-owned. Never place interactive controls behind them.
- Support Dynamic Type: all text must scale from accessibility-small to accessibility-xxxlarge. Hard-coded font sizes fail accessibility audits.
- Dark mode is not optional — it has been mandatory since iOS 13. Every screen must render correctly in both modes.

**Interaction**
- Minimum tap target size: 44×44 points. Smaller targets fail accessibility review and frustrate users on small devices.
- Haptic feedback should mirror system patterns: `.impactOccurred()` for selections, `.notificationOccurred(.success/.error/.warning)` for outcomes.
- Do not disable system gestures (pull-to-refresh, swipe-back, swipe-from-edge) without providing explicit equivalents.

### Material Design Guidelines (Android)

Material Design 3 (Material You) is the current standard for Android apps. Google Play review does not enforce it as strictly as Apple enforces HIG, but departure from Material patterns drives poor reviews.

**Navigation patterns**
- Bottom Navigation Bar for 3–5 top-level destinations (matches iOS tab bar in position and purpose).
- Navigation Drawer for apps with 6+ top-level destinations or complex content hierarchies.
- Top App Bar for screen titles, primary actions, and back navigation.
- Use Navigation Component (Jetpack) with a NavGraph to manage the back stack. Manual FragmentTransaction management leads to back-stack corruption.

**Visual design**
- Material You uses dynamic color: the system extracts a palette from the wallpaper and applies it app-wide. Apps must use Material theme color roles (`colorPrimary`, `colorSurface`, etc.) — hard-coded hex colors break dynamic theming.
- Typography scale: use `MaterialTheme.typography.*` roles (displayLarge, headlineMedium, bodyLarge, etc.), not arbitrary font sizes.
- Elevation and shadows communicate hierarchy — use Material elevation tokens, not custom shadow implementations.

**Components**
- Use Material components from `androidx.compose.material3` (Compose) or `com.google.android.material` (View system) — custom implementations break adaptive theming.
- Extended FAB for primary actions, regular FAB only when the action is obvious from context.
- BottomSheet for contextual actions; Dialog for decisions requiring user input.

### Performance Budgets

Define performance budgets before implementation — retrofitting them is expensive.

**App launch time**
- Cold start target: under 2 seconds to interactive on a mid-range device (Pixel 4a / iPhone SE 3rd gen)
- Warm start target: under 500ms
- Measure with: Instruments (iOS Time Profiler), Android Studio CPU Profiler, Firebase Performance Monitoring
- Common cold-start killers: synchronous disk I/O on main thread, large dependency graphs initialized eagerly, synchronous network calls before first frame

**Frame rate**
- Target: 60fps sustained (16ms frame budget), 120fps on ProMotion/high-refresh displays where supported
- Drop below 60fps is visible as "jank" — users notice immediately
- iOS: use Instruments > Core Animation template to identify dropped frames
- Android: Profile GPU Rendering overlay (`adb shell setprop debug.hwui.profile true`) and Systrace

**Memory**
- iOS: no hard memory limit, but the OS kills apps under memory pressure. Monitor with Instruments > Allocations and Leaks.
- Android: device RAM tiers vary wildly. Budget 100MB heap for mid-range, test on 2GB RAM devices.
- Avoid memory leaks from retained Contexts (Android), strong reference cycles (iOS), and non-cancelled subscriptions.

**Battery**
- Background work must use platform APIs: WorkManager (Android), BGTaskScheduler (iOS). Raw background threads are killed and drain battery.
- Network: batch requests, respect retry-after headers, use conditional requests (ETags) to avoid redundant data transfer.
- Location: use the least precise location mode needed. Continuous GPS is the fastest path to a 1-star review.

**Network**
- Assume 3G on first launch — many users install apps on slow connections.
- App binary size: iOS App Store thin-slicing reduces download size per device; still target under 50MB download, under 200MB install.
- Android App Bundle (AAB) enables Play Store to serve device-optimized APKs — always build AAB for production, not APK.

### Device Matrix

Define the device matrix explicitly. Not all devices need testing — define tiers:

**Tier 1 (must pass)**
- iOS: current iPhone model, iPhone SE (latest), iPad (if universal app)
- Android: current Pixel, Samsung Galaxy S-series, mid-range device (e.g., Pixel 4a or Samsung A-series)
- OS versions: current and N-1 major (e.g., iOS 18 and 17, Android 15 and 14)

**Tier 2 (should pass)**
- iOS: 2-generation-old iPhone, older iPad models
- Android: budget device with 2GB RAM, tablet (if supporting large-screen)
- OS versions: N-2 for iOS, Android 13 for broader coverage

**Minimum OS versions**
- iOS: typically N-2 years of support. In 2025, iOS 16+ covers ~95% of active devices.
- Android: API level 26 (Android 8.0) covers ~98% of active devices as of 2025. Most new projects target minSdk 26.
- Document the min-OS decision explicitly — lowering it later breaks APIs; raising it is a business decision.

**Screen size breakpoints (iOS)**
- 375pt wide: iPhone SE/iPhone mini
- 390pt wide: iPhone 14/15 standard
- 430pt wide: iPhone 14/15 Pro Max
- 768pt wide: iPad (compact width in split view)
- 1024pt+: iPad full screen

**Screen size breakpoints (Android)**
- 360dp: compact (phone portrait)
- 600dp: medium (phone landscape, small tablet)
- 840dp+: expanded (tablet, foldable unfolded)
- Use Window Size Classes (Jetpack Compose) to adapt layout to these breakpoints.

### Accessibility Requirements

Accessibility is legally required (ADA in the US, EN 301 549 in the EU) and a quality signal in app store reviews.

**iOS VoiceOver**
- Every interactive element must have an `accessibilityLabel` that describes its purpose (not its visual appearance).
- Semantic roles: use `accessibilityTraits` (.button, .header, .image, .link) so VoiceOver announces element type.
- Custom controls must implement `UIAccessibilityElement` or use SwiftUI's `.accessibilityElement(children:)` modifier.
- Group related elements with `shouldGroupAccessibilityChildren` to reduce VoiceOver navigation steps.

**Android TalkBack**
- `contentDescription` on all `ImageView`, `ImageButton`, and custom views. Views with `android:text` inherit their label automatically.
- `android:importantForAccessibility="no"` for decorative elements that should be skipped.
- Jetpack Compose: use `Modifier.semantics { contentDescription = "..." }` and role modifiers.

**Minimum contrast ratios (WCAG AA)**
- Normal text: 4.5:1 contrast ratio against background
- Large text (18pt+ or 14pt+ bold): 3:1 contrast ratio
- Interactive elements and focus indicators: 3:1 against adjacent colors
- Use `Color Contrast Analyzer` or Xcode Accessibility Inspector to verify.

**Dynamic Type / Font Scaling**
- iOS: test with Accessibility > Larger Text > maximum setting (~235% scale). All text must remain readable and not overflow containers.
- Android: test with Display > Font size at the largest setting. Use `sp` units (never `dp` or `px`) for all text.

**Motor accessibility**
- Switch Control (iOS) and Switch Access (Android): all interactive elements must be reachable via sequential switch scanning.
- Do not rely solely on swipe gestures for core functionality — provide tap-target alternatives.
- Minimum touch target: 44pt (iOS) / 48dp (Android).
