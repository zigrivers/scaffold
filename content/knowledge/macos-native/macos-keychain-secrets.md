---
name: macos-keychain-secrets
description: >-
  Keychain Services for secure credential storage in macOS apps: generic/internet passwords, tokens, private keys, and no-hardcoded-secrets discipline
topics:
  - macos-native
  - keychain
  - security
  - secrets
  - credentials
volatility: stable
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/security/keychain_services
  - url: https://developer.apple.com/documentation/security/certificate_key_and_trust_services
  - url: https://developer.apple.com/documentation/localauthentication
---

The macOS Keychain is the correct and expected storage location for any secret that must persist across app launches: passwords, API tokens, OAuth refresh tokens, SSH private keys, and encryption keys. Hardcoding secrets in source code, `UserDefaults`, or plain files is a critical security defect. Keychain items are encrypted at rest, protected by the user's login password, and optionally guarded by biometric authentication.

## Summary

Keychain Services stores three kinds of secrets: generic passwords (arbitrary key-value), internet passwords (associated with a protocol/host/port/account tuple), and cryptographic keys/certificates. The Swift `Security` framework API (`SecItemAdd`, `SecItemCopyMatching`, `SecItemUpdate`, `SecItemDelete`) is low-level but fully functional. For new code, wrap these in a thin service layer or use community wrappers like `KeychainAccess`. Items are scoped to the app by `kSecAttrService` and optionally shared across apps in the same access group via `kSecAttrAccessGroup`. Sandboxed apps require the `com.apple.security.keychain-access-groups` entitlement to share items. Keychain items can require user presence (Face ID / Touch ID / password confirmation) via `SecAccessControl`.

## Deep Guidance

### Keychain Item Classes

| Class | `kSecClass` value | Use case |
|-------|------------------|----------|
| Generic password | `kSecClassGenericPassword` | API tokens, app-specific passwords |
| Internet password | `kSecClassInternetPassword` | Passwords associated with a URL, port, account |
| Certificate | `kSecClassCertificate` | X.509 certificates |
| Key | `kSecClassKey` | Cryptographic private/public keys |
| Identity | `kSecClassIdentity` | Certificate + private key pair (TLS client auth) |

Most apps need only generic and internet passwords.

### Generic Password CRUD

```swift
import Security

struct KeychainService {
    let service: String  // your app's bundle ID or a logical namespace

    // MARK: - Write (add or update)

    func set(_ value: String, forKey key: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }

        // Try updating first
        let updateQuery: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
        ]
        let updateAttributes: [CFString: Any] = [
            kSecValueData: data,
        ]
        let updateStatus = SecItemUpdate(updateQuery as CFDictionary, updateAttributes as CFDictionary)

        if updateStatus == errSecItemNotFound {
            // Add new item
            let addQuery: [CFString: Any] = [
                kSecClass: kSecClassGenericPassword,
                kSecAttrService: service,
                kSecAttrAccount: key,
                kSecValueData: data,
                kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlock,
            ]
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw KeychainError.unhandledError(status: addStatus)
            }
        } else if updateStatus != errSecSuccess {
            throw KeychainError.unhandledError(status: updateStatus)
        }
    }

    // MARK: - Read

    func get(_ key: String) throws -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        switch status {
        case errSecSuccess:
            guard let data = result as? Data,
                  let string = String(data: data, encoding: .utf8) else {
                throw KeychainError.dataCorrupted
            }
            return string
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError.unhandledError(status: status)
        }
    }

    // MARK: - Delete

    func delete(_ key: String) throws {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandledError(status: status)
        }
    }
}

enum KeychainError: LocalizedError {
    case encodingFailed
    case dataCorrupted
    case unhandledError(status: OSStatus)

    var errorDescription: String? {
        switch self {
        case .encodingFailed: return "Failed to encode value for Keychain storage."
        case .dataCorrupted: return "Keychain data is corrupted or unreadable."
        case .unhandledError(let status):
            return SecCopyErrorMessageString(status, nil) as String? ?? "OSStatus \(status)"
        }
    }
}
```

### Internet Password (URL-Associated Credentials)

Internet passwords associate a credential with a specific server, port, protocol, and account — matching the credential to the correct server even if the user has multiple accounts:

```swift
func setInternetPassword(
    _ password: String,
    account: String,
    server: String,
    port: Int = 443,
    protocol: CFString = kSecAttrProtocolHTTPS
) throws {
    guard let data = password.data(using: .utf8) else { return }

    let query: [CFString: Any] = [
        kSecClass: kSecClassInternetPassword,
        kSecAttrServer: server,
        kSecAttrAccount: account,
        kSecAttrPort: port,
        kSecAttrProtocol: `protocol`,
        kSecValueData: data,
        kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlock,
    ]

    SecItemDelete(query as CFDictionary)  // delete first to allow clean add
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
        throw KeychainError.unhandledError(status: status)
    }
}
```

### Accessibility Attributes

The `kSecAttrAccessible` attribute controls when the Keychain item can be read:

| Constant | When readable | Use |
|----------|--------------|-----|
| `kSecAttrAccessibleWhenUnlocked` | Only when device is unlocked | Default for most app secrets |
| `kSecAttrAccessibleAfterFirstUnlock` | After first unlock post-boot | Background services, daemons |
| `kSecAttrAccessibleAlways` | Always (even locked) | Deprecated; avoid |
| `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` | Unlocked + not backed up | Sensitive data, no iCloud backup |
| `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` | First unlock + not backed up | Daemons, no iCloud backup |

Use `ThisDeviceOnly` variants to prevent sensitive credentials from being restored to a different machine via iCloud Keychain or device backup. Appropriate for OAuth tokens and SSH private keys.

### Biometric-Protected Items (User Presence)

For high-value secrets (private keys, master passwords), require Touch ID or login password confirmation before each access:

```swift
import LocalAuthentication

func addBiometricProtectedItem(_ secret: Data, key: String) throws {
    var error: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(
        nil,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        [.biometryCurrentSet, .or, .devicePasscode],  // Touch ID or password fallback
        &error
    ) else {
        throw error!.takeRetainedValue() as Error
    }

    let query: [CFString: Any] = [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: "com.myapp.vault",
        kSecAttrAccount: key,
        kSecValueData: secret,
        kSecAttrAccessControl: access,
        // Authenticate in the calling thread — use a LAContext for UI customization
        kSecUseAuthenticationContext: {
            let ctx = LAContext()
            ctx.localizedReason = "Authenticate to access your stored credentials"
            return ctx
        }(),
    ]

    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
        throw KeychainError.unhandledError(status: status)
    }
}
```

`.biometryCurrentSet` binds the access to the currently enrolled biometrics — adding a new fingerprint or Face ID enrollment revokes the access, forcing re-authentication. Use this for maximum security. Use `.biometryAny` to survive enrollment changes.

### Keychain Sharing Across Apps (Access Groups)

By default, each app's Keychain items are scoped to its own bundle ID. To share credentials between a main app and a helper tool, extension, or companion app:

1. Add the `com.apple.security.keychain-access-groups` entitlement to both targets listing the shared group.
2. Set `kSecAttrAccessGroup` on items to the shared group identifier.

```xml
<!-- MyApp.entitlements -->
<key>com.apple.security.keychain-access-groups</key>
<array>
    <string>$(AppIdentifierPrefix)com.mycompany.shared</string>
</array>
```

```swift
let sharedQuery: [CFString: Any] = [
    kSecClass: kSecClassGenericPassword,
    kSecAttrAccessGroup: "$(AppIdentifierPrefix)com.mycompany.shared",
    kSecAttrService: "shared-service",
    kSecAttrAccount: "oauth-token",
    kSecReturnData: true,
    kSecMatchLimit: kSecMatchLimitOne,
]
```

### No-Hardcoded-Secrets Discipline

- **Never commit secrets** to source control. API keys, tokens, certificates, and passwords must not appear in `.swift`, `.plist`, `Info.plist`, or any tracked file.
- **Never store secrets in `UserDefaults`** — `UserDefaults` is a plaintext plist, readable without authentication, backed up to iCloud, and visible in the app container.
- **Never store secrets in plain files** in the container or elsewhere.
- **Never embed secrets in the binary** — binary strings extraction (`strings MyApp.app/Contents/MacOS/MyApp`) reveals them trivially.
- **Build-time secrets** (e.g., a client ID for an OAuth flow) that must be embedded in the binary should be short-lived, scoped minimally, and treated as semi-public (client IDs are not secret; client secrets must never be embedded).
- **Development configuration:** use environment variables injected at launch (never hardcoded in scheme environment variables committed to git), or use a `.env.local` file that is `.gitignore`d.

### Cryptographic Key Storage

For asymmetric keys (e.g., signing, encryption), use the Secure Enclave when available:

```swift
func generateSecureEnclaveKey(tag: String) throws -> SecKey {
    var error: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(
        nil,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        [.privateKeyUsage, .biometryCurrentSet],
        &error
    ) else {
        throw error!.takeRetainedValue() as Error
    }

    let attributes: [CFString: Any] = [
        kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits: 256,
        kSecAttrTokenID: kSecAttrTokenIDSecureEnclave,
        kSecPrivateKeyAttrs: [
            kSecAttrIsPermanent: true,
            kSecAttrApplicationTag: tag.data(using: .utf8)!,
            kSecAttrAccessControl: access,
        ],
    ]

    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
        throw error!.takeRetainedValue() as Error
    }
    return key
}
```

The Secure Enclave is available on Macs with Apple Silicon and on Macs with the T1/T2 chip. Fall back to software-backed keys on older Intel hardware without T2. Gate `kSecAttrTokenIDSecureEnclave` usage on `SecureEnclave.isAvailable` (CryptoKit, macOS 11+) — this correctly tests for hardware Secure Enclave presence. Do not use `LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)` for this check: that tests whether Touch ID is *enrolled*, not whether a Secure Enclave exists (a Mac can have a Secure Enclave without enrolled biometrics, and vice versa). Biometric enrollment is a separate concern relevant to `.biometryCurrentSet`/`.biometryAny` access control flags, not to hardware availability.
