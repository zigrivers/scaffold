---
name: mobile-app-security
description: Secure storage (Keychain/Keystore), certificate pinning, biometric authentication, jailbreak/root detection, and data protection for mobile apps
topics: [mobile-app, security, keychain, keystore, certificate-pinning, biometrics, jailbreak-detection, data-protection]
---

Mobile apps operate in an adversarial environment: devices are lost or stolen, users jailbreak/root their devices, and network traffic is subject to interception. Security must be designed in, not bolted on. The most common mobile security failures are storing secrets in plaintext, trusting all TLS certificates (or disabling certificate validation), and failing to protect data at rest. Implement defense in depth — assume any single control will fail.

## Summary

Mobile security requires secure storage (iOS Keychain, Android Keystore/EncryptedSharedPreferences), certificate pinning to prevent MITM attacks, biometric authentication for sensitive operations, and data-at-rest protection. Avoid storing sensitive data in logs, shared preferences, UserDefaults, or anywhere outside secure enclaves. Jailbreak/root detection adds a deterrent layer but is not a reliable security boundary. Apply OWASP Mobile Top 10 as the minimum security baseline.

## Deep Guidance

### Secure Storage

**iOS Keychain**

The Keychain is the correct location for all sensitive data: tokens, passwords, cryptographic keys, and session identifiers. It survives app reinstallation (with the right accessibility class) and is hardware-backed on devices with a Secure Enclave.

```swift
import Security

enum KeychainError: Error {
    case duplicateEntry, itemNotFound, unexpectedStatus(OSStatus)
}

struct Keychain {
    static func save(key: String, data: Data, accessibility: CFString = kSecAttrAccessibleWhenUnlocked) throws {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: key,
            kSecValueData: data,
            kSecAttrAccessible: accessibility
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecDuplicateItem {
            // Update existing item
            let updateQuery: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrAccount: key]
            let updateFields: [CFString: Any] = [kSecValueData: data]
            let updateStatus = SecItemUpdate(updateQuery as CFDictionary, updateFields as CFDictionary)
            guard updateStatus == errSecSuccess else { throw KeychainError.unexpectedStatus(updateStatus) }
        } else if status != errSecSuccess {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    static func load(key: String) throws -> Data {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: key,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            throw KeychainError.itemNotFound
        }
        return data
    }

    static func delete(key: String) {
        let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrAccount: key]
        SecItemDelete(query as CFDictionary)
    }
}
```

**Keychain accessibility classes — choose carefully**
- `kSecAttrAccessibleWhenUnlocked`: accessible only when device is unlocked. Correct for most cases.
- `kSecAttrAccessibleAfterFirstUnlock`: accessible after first unlock until device restarts. For background-accessible tokens (e.g., background sync auth).
- `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`: requires a passcode to be set; deleted if passcode is removed. Highest security, not backed up.
- `kSecAttrAccessibleAlways`: accessible even when locked. Never use — completely defeats protection.
- Append `ThisDeviceOnly` to any class to prevent iCloud Keychain sync (appropriate for session tokens).

**Android: Keystore + EncryptedSharedPreferences**

The Android Keystore stores cryptographic keys in hardware (on supported devices). Use it to encrypt data stored on disk:

```kotlin
// EncryptedSharedPreferences — simplest secure storage for small values
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val securePrefs = EncryptedSharedPreferences.create(
    context,
    "secure_prefs",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)
securePrefs.edit().putString("auth_token", token).apply()
val token = securePrefs.getString("auth_token", null)
```

For larger data (full database encryption), use SQLCipher or Room with SQLCipher:
```kotlin
val passphrase = SQLiteDatabase.getBytes(keyFromKeystore)
val factory = SupportFactory(passphrase)
Room.databaseBuilder(context, AppDatabase::class.java, "app.db")
    .openHelperFactory(factory)
    .build()
```

**What NOT to store in insecure storage**
- Never use `NSUserDefaults`/`UserDefaults` for tokens, passwords, or PII
- Never use `SharedPreferences` (unencrypted) for sensitive data
- Never write credentials to log output — logs are readable by other apps and crash reporters
- Never store sensitive data in the app's Documents or Cache directories without encryption
- Never put secrets in `Info.plist`, `AndroidManifest.xml`, or any file tracked in git

### Certificate Pinning

Certificate pinning prevents MITM attacks by refusing connections to servers that don't present the expected certificate (or a certificate from the expected CA chain).

**iOS: TrustKit or URLSession manual pinning**
```swift
// URLSession delegate-based pinning
class PinnedURLSessionDelegate: NSObject, URLSessionDelegate {
    // Expected certificate public key hashes (SHA-256, base64-encoded)
    private let pinnedHashes: Set<String> = [
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",  // Current cert
        "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="   // Backup cert
    ]

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Extract public key hash from server certificate
        if let hash = publicKeyHash(from: serverTrust), pinnedHashes.contains(hash) {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}
```

**Android: OkHttp CertificatePinner**
```kotlin
val certificatePinner = CertificatePinner.Builder()
    .add("api.example.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    .add("api.example.com", "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=") // backup pin
    .build()

val client = OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .build()
```

**Certificate pinning operational rules**
- Always pin at least two certificates: the current certificate and a backup (intermediate CA or pre-generated backup)
- A pinned app with no backup pin is bricked when the certificate rotates — this is an outage
- Certificate rotation procedure: add new cert pin 30+ days before rotating, deploy app update, rotate certificate, remove old pin in next app version
- Never pin in debug builds — intercepting proxies (Charles, mitmproxy) are required for debugging
- Consider using a reporting-only mode that logs failures without blocking before enforcing

### Biometric Authentication

**iOS: LocalAuthentication**
```swift
import LocalAuthentication

func authenticateWithBiometrics() async throws {
    let context = LAContext()
    var error: NSError?

    guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
        throw error ?? LAError(.biometryNotAvailable)
    }

    try await context.evaluatePolicy(
        .deviceOwnerAuthenticationWithBiometrics,
        localizedReason: "Authenticate to view your account"
    )
}
```

- `.deviceOwnerAuthenticationWithBiometrics`: Face ID / Touch ID only. Falls back to nothing if unavailable.
- `.deviceOwnerAuthentication`: Face ID / Touch ID, then falls back to device passcode. Preferred for high-security gates.
- `LAContext.biometryType`: check whether device has Face ID, Touch ID, or neither — customize the prompt accordingly
- Store the biometric-protected secret in the Keychain with `SecAccessControl` binding the item to biometric authentication

**iOS: Keychain + biometric binding**
```swift
var error: Unmanaged<CFError>?
guard let access = SecAccessControlCreateWithFlags(
    nil,
    kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    [.biometryCurrentSet, .privateKeyUsage],  // biometryCurrentSet invalidates if biometrics change
    &error
) else { throw error!.takeRetainedValue() as Error }

let query: [CFString: Any] = [
    kSecClass: kSecClassGenericPassword,
    kSecAttrAccount: "high_value_token",
    kSecValueData: tokenData,
    kSecAttrAccessControl: access
]
SecItemAdd(query as CFDictionary, nil)
```

**Android: BiometricPrompt**
```kotlin
val biometricPrompt = BiometricPrompt(
    fragment,
    executor,
    object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
            // result.cryptoObject contains cipher if used with CryptoObject
            onSuccess()
        }
        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            onError(errString.toString())
        }
    }
)

val promptInfo = BiometricPrompt.PromptInfo.Builder()
    .setTitle("Authenticate")
    .setSubtitle("Access your account")
    .setAllowedAuthenticators(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)
    .build()

biometricPrompt.authenticate(promptInfo)
```

### Jailbreak and Root Detection

**iOS jailbreak detection heuristics**
```swift
func isJailbroken() -> Bool {
    #if targetEnvironment(simulator)
    return false
    #else
    // Check for common jailbreak files
    let jailbreakPaths = [
        "/Applications/Cydia.app",
        "/usr/sbin/sshd",
        "/etc/apt",
        "/private/var/lib/apt/"
    ]
    if jailbreakPaths.contains(where: { FileManager.default.fileExists(atPath: $0) }) {
        return true
    }

    // Check if sandboxing has been violated
    let testPath = "/private/jailbreak_test_\(UUID().uuidString)"
    do {
        try "test".write(toFile: testPath, atomically: true, encoding: .utf8)
        try FileManager.default.removeItem(atPath: testPath)
        return true  // Wrote outside sandbox — jailbroken
    } catch { }

    return false
    #endif
}
```

**Android root detection**
```kotlin
fun isRooted(): Boolean {
    val rootIndicators = listOf(
        "/system/app/Superuser.apk",
        "/sbin/su",
        "/system/bin/su",
        "/system/xbin/su"
    )
    if (rootIndicators.any { File(it).exists() }) return true

    // Try to execute su
    return try {
        Runtime.getRuntime().exec(arrayOf("/system/xbin/which", "su"))
        true
    } catch (e: Exception) { false }
}
```

**Jailbreak detection limitations**
- All detection methods can be bypassed by a sufficiently motivated attacker — jailbreak detection is a deterrent, not a security boundary
- Use it to degrade security guarantees (warn users) rather than block the app entirely
- Consider integrating a commercial solution (Guardsquare, Promon, Approov) for higher-assurance requirements

### Data Protection

**iOS Data Protection API**
Files stored on iOS can be encrypted with additional protection tied to the device unlock state:

```swift
// Write file with data protection
let data = sensitiveData
let url = documentsDirectory.appendingPathComponent("sensitive.dat")
try data.write(to: url, options: [.completeFileProtection])
// kSecAttrAccessibleWhenUnlocked equivalent for files
```

Protection classes:
- `completeFileProtection`: accessible only when unlocked
- `completeFileProtectionUnlessOpen`: accessible when unlocked or if the file was open when locked
- `completeFileProtectionUntilFirstUserAuthentication`: accessible after first unlock
- Set app-wide default in Info.plist: `NSFileProtectionKey: NSFileProtectionComplete`

**Android: Scoped Storage**
Android 10+ enforces scoped storage — apps can no longer access arbitrary filesystem paths:
- Use `MediaStore` API for photos, videos, and audio shared with other apps
- Use app-specific directories (`context.filesDir`, `context.cacheDir`) for private data
- Request `READ_MEDIA_IMAGES` permission (Android 13+) instead of `READ_EXTERNAL_STORAGE`

**Network security configuration (Android)**
```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>
    <!-- Allow cleartext for localhost in debug only -->
    <debug-overrides>
        <domain-config cleartextTrafficPermitted="true">
            <domain includeSubdomains="true">localhost</domain>
        </domain-config>
    </debug-overrides>
</network-security-config>
```

Set `cleartextTrafficPermitted="false"` globally and enforce HTTPS everywhere. This is the Android equivalent of iOS's App Transport Security.
