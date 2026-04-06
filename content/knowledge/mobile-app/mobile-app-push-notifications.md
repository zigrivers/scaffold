---
name: mobile-app-push-notifications
description: APNs and FCM setup, notification channels, rich notifications, background handling, and permission best practices for mobile apps
topics: [mobile-app, push-notifications, apns, fcm, firebase, notification-channels, rich-notifications, background]
---

Push notifications are a direct channel to re-engage users, but they are also the fastest way to lose them: irrelevant or excessive notifications get disabled or trigger uninstalls. The technical implementation requires setting up APNs (Apple Push Notification service) for iOS and FCM (Firebase Cloud Messaging) for Android, managing device tokens, and handling notifications in all app states (foreground, background, terminated). Get the permission request timing right — it determines your opt-in rate.

## Summary

iOS push requires APNs certificate or key setup, `UNUserNotificationCenter` for permission and handling, and a device token registered with your backend. Android push uses FCM with notification channels (required for Android 8.0+) and `FirebaseMessagingService` for token and message handling. Both platforms support rich notifications (images, actions, custom UI). Permission requests must explain value before asking — iOS grants are permanent opt-outs if declined. Handle notifications in all three app states: foreground, background, and terminated.

## Deep Guidance

### iOS: APNs Setup

**APNs authentication options**

*APNs Key (recommended)*
- Create an APNs authentication key in the Apple Developer portal: Certificates, Identifiers & Profiles > Keys
- Download the `.p8` file — this is valid for all apps and does not expire
- Key credentials: Key ID (10 characters) + Team ID + `.p8` file
- Never commit the `.p8` file to git — store in a secrets manager

*APNs Certificate (legacy)*
- Certificate expires annually — requires renewal
- App-specific — one certificate per bundle ID
- Use key-based auth for all new integrations

**Xcode capability setup**
1. Add "Push Notifications" capability in Xcode > Target > Signing & Capabilities
2. Add "Background Modes" capability and check "Remote notifications" for silent/background pushes
3. Xcode adds the `aps-environment` entitlement automatically

**Device token registration (Swift)**
```swift
// AppDelegate or @main App struct
class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        // Send token to your backend
        Task { await PushTokenService.shared.registerToken(token) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Simulators always fail here — log but don't treat as fatal in debug
        print("Push registration failed: \(error)")
    }
}
```

**Permission request (timing matters)**
```swift
func requestPushPermission() async {
    let center = UNUserNotificationCenter.current()
    let settings = await center.notificationSettings()
    guard settings.authorizationStatus == .notDetermined else { return }

    // Only ask after providing value context — e.g., after first order placed
    let granted = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
    if granted == true {
        await MainActor.run {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }
}
```

Rules for permission timing:
- Never ask on first launch — users have not yet experienced value
- Ask after a meaningful action: first order, first message received, or explicit "Enable notifications" tap in settings UI
- If denied, guide users to Settings rather than asking again (iOS prevents re-prompting)

**Notification handling (all app states)**
```swift
extension AppDelegate: UNUserNotificationCenterDelegate {
    // Foreground: notification arrives while app is active
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Decide whether to show banner while app is open
        completionHandler([.banner, .sound, .badge])
    }

    // User tapped notification (foreground or background)
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        // Handle deep link or action
        handleNotificationTap(userInfo: userInfo)
        completionHandler()
    }
}

// Silent background notification (content-available: 1)
func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
) {
    Task {
        await SyncEngine.shared.syncOnPushReceived()
        completionHandler(.newData)
    }
}
```

### Android: FCM Setup

**Firebase project setup**
1. Create project in Firebase Console
2. Add Android app with the package name
3. Download `google-services.json` and place in `app/` directory (not project root)
4. Add to `build.gradle.kts`: `apply plugin: "com.google.gms.google-services"`

**FCM Service implementation**
```kotlin
@AndroidEntryPoint
class MyFirebaseMessagingService : FirebaseMessagingService() {

    @Inject lateinit var pushTokenRepository: PushTokenRepository
    @Inject lateinit var notificationManager: AppNotificationManager

    // Token refresh — called on first run and when token changes
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Send to backend — use WorkManager to ensure delivery even if offline
        pushTokenRepository.scheduleTokenUpload(token)
    }

    // Data message received (app in foreground or background)
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        when (message.data["type"]) {
            "chat_message" -> handleChatMessage(message)
            "order_update" -> handleOrderUpdate(message)
            else -> notificationManager.showGenericNotification(message)
        }
    }

    private fun handleChatMessage(message: RemoteMessage) {
        notificationManager.showChatNotification(
            title = message.data["sender_name"] ?: "New message",
            body = message.data["preview"] ?: "",
            conversationId = message.data["conversation_id"] ?: return
        )
    }
}
```

**Notification channels (Android 8.0+ requirement)**
```kotlin
class AppNotificationManager @Inject constructor(
    private val context: Context,
    private val notificationManager: NotificationManagerCompat
) {
    companion object {
        const val CHANNEL_CHAT = "chat_messages"
        const val CHANNEL_ORDERS = "order_updates"
        const val CHANNEL_PROMOTIONS = "promotions"
    }

    fun createChannels() {
        val channels = listOf(
            NotificationChannel(CHANNEL_CHAT, "Chat Messages", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Messages from other users"
                enableVibration(true)
            },
            NotificationChannel(CHANNEL_ORDERS, "Order Updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Updates on your orders"
            },
            NotificationChannel(CHANNEL_PROMOTIONS, "Promotions", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Deals and offers — can be disabled without affecting order updates"
            }
        )
        notificationManager.createNotificationChannels(channels)
    }
}
```

Channel importance rules:
- `IMPORTANCE_HIGH`: chat, time-sensitive alerts — shows heads-up notification
- `IMPORTANCE_DEFAULT`: order updates, reminders — shows in notification shade
- `IMPORTANCE_LOW`: promotions, non-urgent — no sound/vibration
- `IMPORTANCE_MIN`: silent, no icon in status bar — rarely useful

Separate channels by user concern, not by technical category. Users can disable individual channels in Settings — respect their choices.

**Showing a notification**
```kotlin
fun showChatNotification(title: String, body: String, conversationId: String) {
    val intent = Intent(context, MainActivity::class.java).apply {
        putExtra("destination", "chat/$conversationId")
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val pendingIntent = PendingIntent.getActivity(
        context, conversationId.hashCode(), intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_CHAT)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(title)
        .setContentText(body)
        .setAutoCancel(true)
        .setContentIntent(pendingIntent)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .build()

    notificationManager.notify(conversationId.hashCode(), notification)
}
```

### Rich Notifications

**iOS: Notification Service Extension**
For modifying notification content before display (decrypting, downloading media):
1. Add a Notification Service Extension target in Xcode
2. Implement `UNNotificationServiceExtension`:

```swift
class NotificationService: UNNotificationServiceExtension {
    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        let content = request.content.mutableCopy() as! UNMutableNotificationContent

        // Download and attach image
        if let imageURL = content.userInfo["image_url"] as? String,
           let url = URL(string: imageURL),
           let attachment = try? UNNotificationAttachment(
               identifier: "image",
               url: downloadImage(from: url),  // must download synchronously or with semaphore
               options: nil
           ) {
            content.attachments = [attachment]
        }
        contentHandler(content)
    }
}
```

**iOS: Notification Content Extension**
For fully custom notification UI:
- Add a Notification Content Extension target
- Set `UNNotificationExtensionCategory` in the Info.plist to the APNs category string
- Implement `UNNotificationContentExtension` in the ViewController

**Android: Big notifications**
```kotlin
// Expandable text
NotificationCompat.Builder(context, CHANNEL_ORDERS)
    .setStyle(NotificationCompat.BigTextStyle().bigText(longBody))

// Image notification
NotificationCompat.Builder(context, CHANNEL_CHAT)
    .setStyle(NotificationCompat.BigPictureStyle().bigPicture(bitmap))

// Conversation (messaging style — shows thread)
NotificationCompat.Builder(context, CHANNEL_CHAT)
    .setStyle(NotificationCompat.MessagingStyle("You")
        .addMessage("Hello!", timestamp, sender)
        .addMessage("How are you?", timestamp2, sender)
    )
```

**Notification actions**
```kotlin
// Android action buttons
val replyAction = NotificationCompat.Action.Builder(
    R.drawable.ic_reply, "Reply",
    PendingIntent.getBroadcast(context, 0, replyIntent, PendingIntent.FLAG_MUTABLE)
).addRemoteInput(
    RemoteInput.Builder("reply_text").setLabel("Reply...").build()
).build()

NotificationCompat.Builder(context, CHANNEL_CHAT)
    .addAction(replyAction)
    .addAction(R.drawable.ic_mark_read, "Mark as read", markReadPendingIntent)
```

### Token Lifecycle Management

**Token refresh handling**
- Both APNs tokens (iOS) and FCM tokens (Android) can change: on reinstall, OS update, or after long inactivity
- Always store the token server-side with a device identifier
- Implement token refresh callbacks (`onNewToken` for FCM, `didRegisterForRemoteNotificationsWithDeviceToken` for APNs) and sync to backend
- Store multiple tokens per user (one per device)
- Clean up invalid tokens: when sending to a token returns a 404 (APNs) or `InvalidRegistration` (FCM), remove it from your database

**Server-side notification delivery**
```javascript
// Firebase Admin SDK
const message = {
    notification: { title: "New message", body: "Jane says hi" },
    data: { type: "chat_message", conversation_id: "abc123" },
    apns: {
        payload: { aps: { sound: "default", badge: 1 } }
    },
    android: {
        priority: "high",
        notification: { channel_id: "chat_messages" }
    },
    token: deviceToken
};
await admin.messaging().send(message);
```

Always send both `notification` and `data` payloads for maximum compatibility — `notification` payloads are handled by the system when the app is in the background, `data` payloads require app code to handle.
