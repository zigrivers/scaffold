---
name: macos-app-sandbox-entitlements
description: >-
  App Sandbox, entitlements, hardened runtime, subprocess execution under the sandbox, SSH/credential constraints, security-scoped bookmarks, and when to choose Developer-ID non-sandboxed
topics:
  - macos-native
  - sandbox
  - entitlements
  - security
  - hardened-runtime
  - subprocess
volatility: evolving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/security/app_sandbox
  - url: https://developer.apple.com/documentation/security/hardened_runtime
  - url: https://developer.apple.com/documentation/bundleresources/entitlements
  - url: https://developer.apple.com/documentation/security/security_scoped_bookmarks
  - url: https://developer.apple.com/documentation/foundation/process
---

The App Sandbox restricts what a macOS app can do to protect users and the system. For App Store distribution, the sandbox is mandatory. For Developer-ID (direct-download) distribution, it is strongly recommended but optional. The sandbox's restrictions on subprocess execution, file-system access, and credential access create significant design tension for apps that shell out to external tools — particularly developer tools that invoke `git`, SSH, or other system binaries.

## Summary

App Sandbox confines an app to a container directory and requires explicit entitlement declarations for every capability outside that container (network, file access, devices, inter-process communication). Hardened Runtime adds a second layer: it disables JIT, library injection, and debugging unless explicitly re-enabled. The critical tension for developer-tool apps (e.g., a Git GUI) is that the sandbox restricts access to user-installed binaries like `/usr/local/bin/git`, SSH keys in `~/.ssh`, credentials in `~/.gitconfig`, and system tools like `ssh-agent`. The canonical solutions are: security-scoped bookmarks (for user-granted folder access), `com.apple.security.temporary-exception.files.absolute-path.read-write` (for specific hardcoded paths — App Store rejectable), and — for apps where sandbox restrictions are fundamentally incompatible — Developer-ID distribution without sandboxing.

## Deep Guidance

### App Sandbox Fundamentals

The sandbox is declared via entitlements file (`.entitlements`) embedded in the app bundle and enforced by the kernel. An un-entitled capability is denied with `EPERM` or `ENOENT` — silently or with an error, not a user-visible prompt.

Minimal `.entitlements` file:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- The sandbox itself -->
    <key>com.apple.security.app-sandbox</key>
    <true/>

    <!-- Network -->
    <key>com.apple.security.network.client</key>
    <true/>

    <!-- File access (user-selected via open/save panels) -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>

    <!-- File access (downloads folder, read-write) -->
    <key>com.apple.security.files.downloads.read-write</key>
    <true/>
</dict>
</plist>
```

The container directory (`~/Library/Containers/<bundle-id>/`) is readable/writable without entitlements. Everything else requires explicit grants.

### Hardened Runtime

Hardened Runtime is required for notarization (and thus for any signed software outside the Mac App Store that runs on macOS 10.15+). It adds restrictions on top of the sandbox:

- Disables JIT compilation (re-enable: `com.apple.security.cs.allow-jit`).
- Disables dyld environment variables (`DYLD_INSERT_LIBRARIES`).
- Disables unsigned code loading (re-enable: `com.apple.security.cs.disable-library-validation`).
- Disables access to the `task_for_pid` debugging interface.

Most apps need no Hardened Runtime exception entitlements at all — simply omit any exception key you do not need. Boolean entitlements set to `<false/>` are a no-op; do not include them. Add exception entitlements only when your app genuinely requires the capability:

If your app loads plug-ins or third-party frameworks not signed by your team, add:

```xml
<key>com.apple.security.cs.disable-library-validation</key>
<true/>
```

### Subprocess Execution Under the Sandbox

**This is the central tension for developer-tool apps.** A sandboxed process can `fork()` and `exec()` other processes, but those child processes **inherit the sandbox**. This means:

1. The child process has the same file-system restrictions as the parent.
2. If the binary being executed is not in the app bundle and not in `/usr/bin` or `/bin`, the sandbox may deny `exec()` with `EPERM`.
3. User-installed tools at `/usr/local/bin/git`, `/opt/homebrew/bin/git`, `/usr/bin/git` (the Xcode Command Line Tools shim) have varying accessibility depending on sandbox policy.

**What the sandbox allows by default:**
- `/usr/bin/*`, `/bin/*`, `/usr/sbin/*`, `/sbin/*` — system binaries are generally accessible.
- The app's own bundle (`NSBundle.main.bundlePath`).
- The app container (`~/Library/Containers/<bundle-id>/`).

**What it restricts:**
- `/opt/homebrew/bin/git` — NOT a system path; requires a security-scoped bookmark or a temporary exception.
- `~/.ssh/` — the user's SSH directory is outside the container. Reading SSH key *files* requires a user-granted security-scoped bookmark (obtained via `NSOpenPanel`) or a `com.apple.security.temporary-exception.files.home-relative-path.read-only` entitlement. `com.apple.security.network.client` is orthogonal — it grants outbound *socket* (network) access and does NOT grant file-system access to `~/.ssh/`. These are two separate, independent requirements: one for file access, one for the network connection.
- `~/.gitconfig`, `~/.config/git/config` — same file-access restriction; requires bookmark or temporary exception.

**Using `Process` (Foundation) to exec a subprocess:**

```swift
import Foundation

func runGit(arguments: [String], workingDirectory: URL) async throws -> String {
    let process = Process()
    process.executableURL = try gitExecutableURL()  // resolved at runtime
    process.arguments = arguments
    process.currentDirectoryURL = workingDirectory

    // Build a minimal allow-listed environment rather than inheriting the full
    // parent environment. Copying the entire parent env risks leaking secrets
    // (API keys, tokens) that the parent process picked up from its own env.
    // PATH and HOME are needed by git for tool resolution and config lookup.
    var env: [String: String] = [:]
    let parentEnv = ProcessInfo.processInfo.environment
    for key in ["PATH", "HOME", "USER", "TMPDIR", "LANG", "LC_ALL"] {
        if let val = parentEnv[key] { env[key] = val }
    }
    env["GIT_TERMINAL_PROMPT"] = "0"  // disable interactive prompts
    env["GIT_PAGER"] = ""             // disable pager (subprocess would hang)
    env["GIT_ASKPASS"] = ""           // disable credential helper UI
    process.environment = env

    let stdout = Pipe()
    let stderr = Pipe()
    process.standardOutput = stdout
    process.standardError = stderr

    try process.run()
    // IMPORTANT: drain stdout AND stderr concurrently before calling
    // waitUntilExit(). Sequential reads deadlock: if the child fills the
    // stderr pipe buffer (~64 KB) while the parent is still draining stdout,
    // the child blocks on stderr, stdout never reaches EOF, and both sides
    // wait forever. Reading both pipes on concurrent queues avoids this.
    var data = Data()
    var errData = Data()
    let group = DispatchGroup()
    DispatchQueue.global().async(group: group) {
        data = stdout.fileHandleForReading.readDataToEndOfFile()
    }
    DispatchQueue.global().async(group: group) {
        errData = stderr.fileHandleForReading.readDataToEndOfFile()
    }
    process.waitUntilExit()
    group.wait()

    guard process.terminationStatus == 0 else {
        throw GitError.nonZeroExit(
            code: process.terminationStatus,
            stderr: String(data: errData, encoding: .utf8) ?? ""
        )
    }

    return String(data: data, encoding: .utf8) ?? ""
}

func gitExecutableURL() throws -> URL {
    // /usr/bin/git is the Xcode Command Line Tools (CLT) stub — NOT always available.
    // CAUTION: isExecutableFile(atPath:) returns true for the stub even when CLT are
    // NOT installed. Without CLT, executing /usr/bin/git triggers a system dialog
    // prompting the user to install CLT. That dialog is NOT suppressible via
    // GIT_TERMINAL_PROMPT and will hang a sandboxed or headless subprocess.
    // Detect CLT presence before trusting this path:
    let cltProbe = URL(fileURLWithPath: "/Library/Developer/CommandLineTools/usr/bin/git")
    if FileManager.default.isExecutableFile(atPath: cltProbe.path) {
        return URL(fileURLWithPath: "/usr/bin/git")  // real CLT git available via stub
    }
    // Homebrew git is outside the default sandbox path; requires security-scoped
    // bookmark or a temporary-exception entitlement.
    // /opt/homebrew is the Apple Silicon prefix; /usr/local is the Intel prefix.
    for homebrewPrefix in ["/opt/homebrew/bin/git", "/usr/local/bin/git"] {
        let url = URL(fileURLWithPath: homebrewPrefix)
        if FileManager.default.isExecutableFile(atPath: url.path) {
            return url
        }
    }
    throw GitError.notFound
}
```

**Key subprocess hardening rules under the sandbox:**
- Always use `Process.arguments` (an array) — never construct a shell command string. The sandbox can intercept shell expansion, and it is also an injection vector (see `[[macos-untrusted-input]]`).
- Set `GIT_TERMINAL_PROMPT=0` to prevent git from hanging waiting for a password prompt in a non-interactive context.
- Set `GIT_PAGER=""` (empty string) or `GIT_PAGER=cat` to prevent git from spawning `less` (which would wait for keyboard input).
- Cap output via a size limit on the pipe read — runaway output can exhaust memory.
- Apply a timeout: `Process` has no built-in timeout; wrap with `DispatchQueue` and `process.terminate()`.

### SSH Keys and Credential Access

Under the sandbox, `~/.ssh/` is inaccessible by default. A Git app that uses SSH remotes has several options:

**Option A: Inject the SSH key via the git command**

```swift
// Pass an explicit identity file so git doesn't need to read ~/.ssh directly.
// Quote the path to handle spaces (e.g. "/Users/My Name/.ssh/id_ed25519").
let quotedKeyPath = keyPath.path.replacingOccurrences(of: "\\", with: "\\\\")
                               .replacingOccurrences(of: "\"", with: "\\\"")
process.arguments = [
    "-c", "core.sshCommand=ssh -i \"\(quotedKeyPath)\" -o StrictHostKeyChecking=accept-new",
    "fetch", "origin"
]
```

This requires the user to have granted access to their key file via a security-scoped bookmark.

**Option B: Use a bundled `ssh` helper**

Bundle a sandboxed-friendly SSH implementation (e.g., `libssh2` or `SwiftNIO SSH`) that reads credentials from the Keychain rather than the file system. This avoids needing file-system access to `~/.ssh` at all.

**Option C: Use HTTPS with credential helpers**

For HTTPS remotes, store credentials in the Keychain (see `[[macos-keychain-secrets]]`) and configure git to use a custom credential helper:

```swift
process.arguments = [
    "-c", "credential.helper=\(bundledHelperPath)",
    "fetch", "origin"
]
```

Bundle the credential helper inside the app bundle — it inherits the parent's sandbox, so it can access the Keychain if you include `com.apple.security.keychain-access-groups`.

### Security-Scoped Bookmarks and Powerbox

Security-scoped bookmarks are the sandbox's mechanism for persisting user-granted access to files and directories across app launches. Without them, every launch requires the user to re-select a folder via an open panel.

**Flow:**

1. User selects a folder via `NSOpenPanel` (the "Powerbox" — a trusted system process that brokers access outside the sandbox).
2. App creates a security-scoped bookmark from the returned URL.
3. App persists the bookmark data (e.g., in `UserDefaults` or a file in the container).
4. On subsequent launches, app resolves the bookmark to a URL and calls `startAccessingSecurityScopedResource()`.

```swift
// Step 1+2: After NSOpenPanel selection
func createBookmark(for url: URL) throws -> Data {
    return try url.bookmarkData(
        options: .withSecurityScope,
        includingResourceValuesForKeys: nil,
        relativeTo: nil
    )
}

// Step 3: Persist
UserDefaults.standard.set(bookmarkData, forKey: "repoBookmark")

// Step 4: Resolve and start accessing on next launch
func resolveBookmark(data: Data) throws -> URL {
    var isStale = false
    let url = try URL(
        resolvingBookmarkData: data,
        options: .withSecurityScope,
        relativeTo: nil,
        bookmarkDataIsStale: &isStale
    )
    if isStale {
        // Re-create the bookmark — the underlying file moved
        let freshData = try createBookmark(for: url)
        UserDefaults.standard.set(freshData, forKey: "repoBookmark")
    }
    guard url.startAccessingSecurityScopedResource() else {
        throw BookmarkError.accessDenied
    }
    return url
}

// Always stop when done
defer { url.stopAccessingSecurityScopedResource() }
```

**Important:** `startAccessingSecurityScopedResource()` / `stopAccessingSecurityScopedResource()` must be balanced. The kernel enforces a per-process limit on active security-scoped access tokens (exact value is undocumented and subject to change); leaking start calls will eventually exhaust this limit and cause access failures. Always pair with `defer { url.stopAccessingSecurityScopedResource() }` to prevent leaks.

The **Powerbox** is the system process behind `NSOpenPanel` and `NSSavePanel`. It runs outside the sandbox and can access any user-visible path. The result URL it returns is automatically granted to the sandboxed app for the session. Security-scoped bookmarks extend that grant across sessions.

### When to Choose Developer-ID Without Sandboxing

The sandbox is the right default. But some app categories have fundamental incompatibilities:

**Cases where non-sandboxed Developer-ID is pragmatic:**
- Apps that must access arbitrary user-chosen paths without Powerbox (e.g., batch file processors that accept command-line paths).
- Apps that exec user-installed tools at arbitrary locations that cannot be bookmarked (e.g., a general IDE that runs any compiler the user installs).
- Apps that need to communicate with system daemons or kernel extensions via `IOKit` or privileged XPC that cannot be isolated.
- Developer tools that need unrestricted file-system read access for indexing (e.g., a code search tool that indexes the entire home directory).

**The trade-off:** Non-sandboxed apps are not eligible for Mac App Store distribution. They require notarization (Hardened Runtime + Developer ID certificate + Apple notary service submission) to run on macOS 10.15+ without Gatekeeper warnings. They receive no automatic sandboxing protection against bugs that would allow arbitrary file access.

**Checklist before choosing non-sandboxed:**
1. Have you exhausted security-scoped bookmarks and Powerbox for file access? The Powerbox handles most use cases.
2. Have you considered bundling the required binaries inside the app bundle (eliminating the need to exec user-installed tools)?
3. Have you considered using XPC services (separate processes with reduced privileges) rather than running privileged code in-process?
4. Is App Store distribution important to your distribution strategy? If yes, sandboxing is required.

If the answer to all four is "yes, non-sandboxed is genuinely needed," proceed with Developer-ID distribution and document the security rationale in your threat model.

### Entitlement Reference for Developer-Tool Apps

| Entitlement | When needed |
|-------------|-------------|
| `com.apple.security.app-sandbox` | Always (sandbox declaration) |
| `com.apple.security.network.client` | Outbound network (git fetch, API calls) |
| `com.apple.security.network.server` | Local server (dev server, IPC listener) |
| `com.apple.security.files.user-selected.read-write` | User-chosen files via open/save panel |
| `com.apple.security.files.downloads.read-write` | Downloads folder access |
| `com.apple.security.keychain-access-groups` | Keychain read/write for credentials |
| `com.apple.security.cs.allow-jit` | JIT compilation (scripting engines, VMs) |
| `com.apple.security.cs.disable-library-validation` | Third-party plug-ins, unsigned frameworks |
| `com.apple.security.cs.allow-dyld-environment-variables` | DYLD variable injection (avoid) |
