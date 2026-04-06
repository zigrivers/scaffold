---
name: mobile-app-observability
description: Crash reporting (Crashlytics/Sentry), analytics, performance monitoring, network tracing, and structured logging for mobile apps
topics: [mobile-app, observability, crashlytics, sentry, analytics, performance-monitoring, network-tracing, logging]
---

Mobile observability is harder than server observability: you cannot SSH into a user's phone, crashes happen on thousands of device/OS combinations you cannot reproduce locally, and performance issues manifest differently across network conditions and hardware tiers. The goal is to know about problems before users report them, understand why they occurred, and have enough context to reproduce and fix them.

## Summary

Mobile observability requires crash reporting (Crashlytics or Sentry), structured analytics for user behavior and funnel tracking, real-user performance monitoring (launch time, screen transitions, network requests), and structured logging that survives app termination. Crashlytics and Sentry both capture symbolicated stack traces — symbolication requires uploading dSYMs (iOS) or mapping files (Android) in CI. Analytics events must be defined in a taxonomy before implementation. Performance monitoring should cover app start time, screen render time, and API latency percentiles.

## Deep Guidance

### Crash Reporting

**Firebase Crashlytics setup**

iOS (SPM):
```swift
// AppDelegate
import FirebaseCrashlytics
import FirebaseCore

func application(_ application: UIApplication, didFinishLaunchingWithOptions...) -> Bool {
    FirebaseApp.configure()
    return true
}
```

Android (Gradle):
```kotlin
// app/build.gradle.kts
plugins {
    id("com.google.firebase.crashlytics")
}
dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.0.0"))
    implementation("com.google.firebase:firebase-crashlytics")
}
```

**dSYM upload (iOS)**
Without dSYMs, crash reports show memory addresses, not function names. Crashlytics auto-uploads dSYMs when the Crashlytics build phase is configured:

```bash
# Xcode build phase: Run Script
"${PODS_ROOT}/FirebaseCrashlytics/run"
```

For Bitcode-disabled builds (Xcode 14+ default), dSYMs are generated at build time and uploaded automatically if the build phase is present. For CI builds:
```bash
# Upload dSYMs manually after archiving
./Pods/FirebaseCrashlytics/upload-symbols -gsp GoogleService-Info.plist -p ios path/to/dSYMs
```

**Mapping file upload (Android)**
```kotlin
// app/build.gradle.kts
buildTypes {
    release {
        firebaseCrashlytics {
            mappingFileUploadEnabled = true  // uploads R8/ProGuard mapping file automatically
            nativeSymbolUploadEnabled = true  // for NDK crash symbolication
        }
    }
}
```

**Enriching crash reports**
```swift
// iOS: Add user context and breadcrumbs
Crashlytics.crashlytics().setUserID(userId)
Crashlytics.crashlytics().setCustomValue("premium", forKey: "subscription_tier")

// Record non-fatal errors
Crashlytics.crashlytics().record(error: networkError)

// Add breadcrumb before risky operation
Crashlytics.crashlytics().log("Attempting payment with method: \(paymentMethod)")
```

```kotlin
// Android
FirebaseCrashlytics.getInstance().setUserId(userId)
FirebaseCrashlytics.getInstance().setCustomKey("subscription_tier", "premium")
FirebaseCrashlytics.getInstance().recordException(exception)
FirebaseCrashlytics.getInstance().log("Cart checkout started: items=${cartItems.size}")
```

**Sentry as alternative**
Sentry provides richer error grouping, performance tracing in the same SDK, and self-hosting options:

```swift
// iOS
import Sentry
SentrySDK.start { options in
    options.dsn = "https://key@sentry.io/project"
    options.tracesSampleRate = 0.2      // 20% of sessions traced
    options.profilesSampleRate = 0.1    // 10% of transactions profiled
    options.enableCrashHandler = true
}
```

```kotlin
// Android
SentryAndroid.init(context) { options ->
    options.dsn = "https://key@sentry.io/project"
    options.tracesSampleRate = 0.2
    options.isEnableAutoActivityLifecycleBreadcrumbs = true
}
```

### Analytics

**Event taxonomy design**
Define events before implementation. Use a consistent naming convention and document in a schema registry:

```
Event naming: {object}_{action}
Examples:
  user_signed_up
  user_signed_in
  product_viewed
  product_added_to_cart
  cart_checkout_started
  order_placed
  order_cancelled
```

Event properties follow snake_case:
```
product_viewed:
  product_id: string
  product_name: string
  category: string
  price_cents: int
  position_in_list: int   # for recommendation tracking
  source: string          # "search" | "recommendation" | "category_browse"
```

**Firebase Analytics (iOS)**
```swift
import FirebaseAnalytics

Analytics.logEvent("product_viewed", parameters: [
    "product_id": productId,
    "product_name": productName,
    "price_cents": priceCents,
    "source": source
])

// User properties (persistent, applied to all subsequent events)
Analytics.setUserProperty("premium", forName: "subscription_tier")
```

**Firebase Analytics (Android)**
```kotlin
firebaseAnalytics.logEvent("product_viewed") {
    param("product_id", productId)
    param("product_name", productName)
    param("price_cents", priceCents.toLong())
    param("source", source)
}

firebaseAnalytics.setUserProperty("subscription_tier", "premium")
```

**Analytics abstraction layer**
Never call analytics SDKs directly from feature code — use an abstraction:

```swift
protocol AnalyticsService {
    func track(_ event: AnalyticsEvent)
    func setUserProperty(_ value: String, for key: String)
}

enum AnalyticsEvent {
    case productViewed(productId: String, name: String, priceCents: Int, source: String)
    case orderPlaced(orderId: String, itemCount: Int, totalCents: Int)
}

final class FirebaseAnalyticsService: AnalyticsService {
    func track(_ event: AnalyticsEvent) {
        switch event {
        case .productViewed(let id, let name, let price, let source):
            Analytics.logEvent("product_viewed", parameters: [
                "product_id": id, "product_name": name,
                "price_cents": price, "source": source
            ])
        case .orderPlaced(let id, let count, let total):
            Analytics.logEvent("order_placed", parameters: [
                "order_id": id, "item_count": count, "total_cents": total
            ])
        }
    }
}
```

This allows swapping analytics providers, testing with a mock, and preventing typos in event names.

### Performance Monitoring

**App startup time (iOS)**
```swift
// Measure time from app launch to first interactive frame
// FirebasePerformance trace
let trace = Performance.startTrace(name: "app_startup")
// ... app initialization ...
trace?.stop()
```

Instruments > App Launch template records the full cold start time with a flame graph of initialization cost. Target: under 400ms pre-main time (Swift static initializers, ObjC +load methods).

**App startup time (Android)**
```kotlin
// Firebase Performance: automatic activity launch monitoring
// Manual trace for custom startup paths
val trace = Firebase.performance.newTrace("app_cold_start")
trace.start()
// ... initialization ...
trace.stop()
```

Systrace and Android Studio Profiler > CPU: record app startup to identify slow initialization. Common causes: synchronous disk I/O, large dependency injection graphs, synchronous network calls.

**Network performance (Firebase Performance)**
Firebase Performance automatically monitors HTTP requests made through URLSession (iOS) and OkHttp/HttpURLConnection (Android) without code changes.

Manual HTTP tracing:
```swift
// iOS custom network trace
let metric = HTTPMetric(url: url, httpMethod: .get)
metric?.start()
let (data, response) = try await URLSession.shared.data(from: url)
metric?.responseCode = (response as? HTTPURLResponse)?.statusCode ?? -1
metric?.stop()
```

```kotlin
// Android: OkHttp interceptor for custom metrics
class PerformanceInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val metric = Firebase.performance.newHttpMetric(request.url.toString(), request.method)
        metric.start()
        val response = chain.proceed(request)
        metric.setHttpResponseCode(response.code)
        metric.stop()
        return response
    }
}
```

**Screen render time**
```swift
// iOS: measure time to interactive per screen
func measureScreenLoad(screenName: String) {
    let trace = Performance.startTrace(name: "screen_\(screenName)_load")
    // Stop trace when first meaningful paint is complete
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        trace?.stop()
    }
}
```

Set performance budget alerts in Firebase Performance: alert when p75 app start > 3s, p90 network response > 2s.

### Structured Logging

**iOS: os_log / OSLog framework**
```swift
import OSLog

private let logger = Logger(subsystem: "com.example.myapp", category: "Checkout")

func processOrder(_ order: Order) async throws {
    logger.info("Order processing started: orderId=\(order.id, privacy: .public)")
    do {
        let result = try await paymentService.charge(order)
        logger.info("Payment succeeded: orderId=\(order.id, privacy: .public) amount=\(order.totalCents)")
    } catch {
        logger.error("Payment failed: orderId=\(order.id, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
        throw error
    }
}
```

Privacy annotations matter:
- `privacy: .public`: logged in production — use for non-PII identifiers
- `privacy: .private`: redacted in production (shown as `<private>`) — default for user data
- `privacy: .sensitive`: always redacted — for credentials and PII

**Android: structured logging with tags**
```kotlin
private const val TAG = "Checkout"

fun processOrder(order: Order) {
    Log.i(TAG, "Order processing started orderId=${order.id}")
    try {
        val result = paymentService.charge(order)
        Log.i(TAG, "Payment succeeded orderId=${order.id} amount=${order.totalCents}")
    } catch (e: Exception) {
        Log.e(TAG, "Payment failed orderId=${order.id}", e)
        throw e
    }
}
```

In production, always integrate with a crash reporter (Crashlytics, Sentry) — `android.util.Log` output is not captured in release builds without a custom log handler.

**Log levels**
- DEBUG: development-only context, not emitted in production builds
- INFO: business events worth auditing (login, purchase, key feature usage)
- WARNING: recoverable errors, degraded functionality
- ERROR: failures that should be investigated (but app continues)
- FATAL/CRITICAL: unrecoverable errors preceding a crash — rarely used directly
