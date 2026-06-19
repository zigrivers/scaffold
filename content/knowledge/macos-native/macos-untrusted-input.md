---
name: macos-untrusted-input
description: >-
  Treating external repos, files, and subprocess output as hostile: argument arrays, disabled prompts, timeouts, output caps, and escaping repo-derived text
topics:
  - macos-native
  - security
  - subprocess
  - input-validation
  - injection-prevention
volatility: evolving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/foundation/process
  - url: https://cwe.mitre.org/data/definitions/78.html
  - url: https://owasp.org/www-community/attacks/Command_Injection
---

An app that processes external Git repositories, user-supplied files, or other untrusted data is processing attacker-controlled content. Repository names, branch names, commit messages, file paths, and file contents can all be crafted to exploit shell injection, argument injection, or UI injection bugs. Treat all of it as hostile input.

## Summary

The cardinal rule: **never construct subprocess command strings by concatenating untrusted data**. Always use `Process.arguments` — an array of discrete, uninterpreted argument strings — so the kernel passes them verbatim to the child process without shell parsing. Supplement this with: disabling git's interactive prompts and pagers (`GIT_TERMINAL_PROMPT=0`, `GIT_PAGER=`), enforcing timeouts (git operations on a malformed repo can hang indefinitely), capping subprocess output (a crafted repo can produce gigabytes of output), and escaping or sanitizing repo-derived text before rendering it in UI. Cross-reference `[[macos-app-sandbox-entitlements]]` for the sandbox context in which subprocesses execute.

## Deep Guidance

### The Shell Injection Risk

Shell injection (CWE-78) occurs when untrusted data is interpolated into a command string that is then parsed by a shell. On macOS, `Process` does NOT use a shell by default — but the risk materializes when developers reach for `Process` with `/bin/sh -c "…"` or when they use deprecated `NSTask` with a shell wrapper.

**Vulnerable pattern:**

```swift
// DANGEROUS — never do this
let repoName = userInput  // e.g., "foo; rm -rf ~/"
let process = Process()
process.executableURL = URL(fileURLWithPath: "/bin/sh")
process.arguments = ["-c", "git clone \(repoName)"]
// The shell parses repoName — any shell metacharacter executes
```

**Safe pattern:**

```swift
// SAFE — arguments are passed verbatim, no shell involved
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
process.arguments = ["clone", "--", repoURL.absoluteString, localPath.path]
// Each element is one discrete argument; no shell metacharacter is interpreted
```

The `--` separator tells git (and most Unix tools) that subsequent arguments are operands (file paths, URLs), not option flags. This prevents argument injection where a crafted value like `--upload-pack=evil` would be misinterpreted as a git option.

### Argument Injection: The `--` Discipline

Beyond shell injection, argument injection exploits the parsing of option flags:

```swift
// VULNERABLE: branch name "–-upload-pack=evil" becomes a flag
process.arguments = ["fetch", "origin", branchName]

// SAFE: "--" terminates options; everything after is a positional argument
process.arguments = ["fetch", "origin", "--", branchName]
```

For file paths that might start with `-`:

```swift
// VULNERABLE: a filename "-rf ." is misinterpreted as flags
process.arguments = ["checkout", fileName]

// SAFE:
process.arguments = ["checkout", "--", fileName]
```

Apply `--` consistently when user-controlled or repo-controlled strings follow command-line tools that support options.

### Disabling Interactive Prompts and Pagers

A sandboxed macOS app's subprocess has no controlling terminal. Git's interactive features — password prompts, pager output (`less`), editor invocations (`vi`) — will hang the process indefinitely when there is no terminal attached.

**Required environment variables for any git subprocess:**

```swift
var env = ProcessInfo.processInfo.environment
// Prevent git from prompting for passwords — fail instead
env["GIT_TERMINAL_PROMPT"] = "0"
// Disable pager — output goes to stdout, not to `less`
env["GIT_PAGER"] = ""
// Disable credential helpers that might open a UI dialog
env["GIT_ASKPASS"] = ""
env["SSH_ASKPASS"] = ""
// Prevent git from invoking an editor (for commit messages, rebase, etc.)
env["GIT_EDITOR"] = "true"  // `true` exits 0 immediately
env["VISUAL"] = "true"
env["EDITOR"] = "true"
// Prevent git from spawning a SSH_ASKPASS UI
env["DISPLAY"] = ""
process.environment = env
```

For SSH-based remotes, `SSH_ASKPASS` must also be suppressed or replaced with a helper that reads from the Keychain (see `[[macos-app-sandbox-entitlements]]`).

### Process Timeouts

Git operations on a maliciously crafted or network-unreachable repository can hang indefinitely. Always apply a timeout:

```swift
func runWithTimeout(
    _ process: Process,
    timeout: TimeInterval
) async throws -> ProcessResult {
    try process.run()

    return try await withThrowingTaskGroup(of: ProcessResult.self) { group in
        // Task 1: wait for process to finish
        group.addTask {
            await withCheckedContinuation { continuation in
                process.terminationHandler = { p in
                    continuation.resume(returning: ProcessResult(
                        exitCode: p.terminationStatus,
                        stdout: /* read pipe */ Data(),
                        stderr: /* read pipe */ Data()
                    ))
                }
            }
        }

        // Task 2: timeout watchdog
        group.addTask {
            try await Task.sleep(for: .seconds(timeout))
            process.terminate()
            throw SubprocessError.timeout(seconds: timeout)
        }

        let result = try await group.next()!
        group.cancelAll()
        return result
    }
}
```

Recommended timeouts by operation:
- `git status`, `git log -n 10`: 10 seconds.
- `git fetch`, `git pull`: 60 seconds (network-dependent; allow user to cancel).
- `git clone`: 120–300 seconds; always run in a cancellable `Task`.
- `git diff`, `git show`: 15 seconds (can be slow on large histories).

Expose cancellation to the user for long-running network operations.

### Output Size Caps

A crafted repository can produce output that exhausts app memory. Cap pipe reads:

```swift
let maxOutputBytes = 10 * 1024 * 1024  // 10 MB cap

func readCapped(from pipe: Pipe, max: Int) -> Data {
    var buffer = Data()
    let handle = pipe.fileHandleForReading
    while buffer.count < max {
        let chunk = handle.availableData
        if chunk.isEmpty { break }
        buffer.append(chunk.prefix(max - buffer.count))
    }
    return buffer
}
```

For operations like `git log` or `git diff` where output can be unbounded, pass limiting flags:

```swift
// Limit log entries
process.arguments = ["log", "--max-count=1000", "--oneline"]

// Limit diff size
process.arguments = ["diff", "--stat", "--diff-filter=ACDMR", "-M", "HEAD"]

// Truncate binary diffs
process.arguments = ["diff", "--text", "--binary", "HEAD"]
```

### Escaping Repo-Derived Text in UI

Repository names, branch names, commit messages, file paths, author names, and email addresses are all user-controlled and may contain characters that break UI rendering:

**SwiftUI Text:** Safe by default. `Text(untrustedString)` renders as plain text — there is no HTML interpretation, markdown injection, or code execution. No escaping needed for SwiftUI `Text`.

**AttributedString / Markdown:** If you use `AttributedString(markdown: untrustedString)`, a crafted string can inject bold, italic, links, and other formatting. Escape before passing to markdown:

```swift
// Escape markdown metacharacters in untrusted content
extension String {
    func escapedMarkdown() -> String {
        // Escape: * _ ` # [ ] ( ) ~ > | \ ! -
        let metacharacters = CharacterSet(charactersIn: "*_`#[]()~>|\\!-")
        return self.unicodeScalars.map { scalar in
            metacharacters.contains(scalar) ? "\\\(scalar)" : String(scalar)
        }.joined()
    }
}

// Use plain AttributedString for untrusted content
let safe = AttributedString(untrustedCommitMessage)
```

**NSAttributedString with HTML:** Never feed untrusted content to `NSAttributedString(html:)`. HTML input can execute `javascript:` URLs in some contexts and inject arbitrary styling. Use `NSAttributedString` with direct attribute setting, not HTML.

**NSTextView / WKWebView:** If rendering repository README files in a `WKWebView`, use a content security policy and disable JavaScript:

```swift
let config = WKWebViewConfiguration()
config.preferences.javaScriptEnabled = false
let webView = WKWebView(frame: .zero, configuration: config)

// Set Content-Security-Policy header when loading local HTML
let html = """
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:">
</head>
<body>\(sanitizedHTML)</body>
</html>
"""
webView.loadHTMLString(html, baseURL: nil)
```

Use a server-side or client-side Markdown → HTML sanitizer (e.g., `cmark-gfm` with safe mode) rather than rendering raw HTML from repository files.

### File Path Traversal

When reading files from a user-supplied repository path, validate that resolved paths stay within the intended root:

```swift
func safeReadFile(relativePath: String, root: URL) throws -> Data {
    // Normalize and resolve the path to eliminate ".." traversal
    let candidate = root.appendingPathComponent(relativePath).standardized
    let rootStandardized = root.standardized

    // Ensure the resolved path is still under root
    guard candidate.path.hasPrefix(rootStandardized.path + "/") ||
          candidate.path == rootStandardized.path else {
        throw FileError.pathTraversal(path: relativePath)
    }

    return try Data(contentsOf: candidate)
}
```

This prevents a crafted `relativePath` of `../../etc/passwd` from reading outside the intended directory. Always `standardize` (or use `resolvingSymlinksInPath`) before comparing — symlinks can be used to escape path prefix checks if the comparison uses raw string prefix without resolving.

### Summary: Hardened Subprocess Checklist

Before executing any subprocess that processes untrusted data:

- [ ] `Process.executableURL` set to an absolute path — not a shell invocation.
- [ ] `Process.arguments` is an array — no string concatenation of untrusted values.
- [ ] `--` separator used between options and operands when arguments include user/repo-controlled data.
- [ ] `GIT_TERMINAL_PROMPT=0`, `GIT_PAGER=`, `GIT_ASKPASS=`, `SSH_ASKPASS=`, `GIT_EDITOR=true` in the environment.
- [ ] Timeout applied; process is terminated if exceeded.
- [ ] Pipe output capped at a reasonable max (e.g., 10 MB).
- [ ] Output treated as untrusted text — not evaluated as code or injected into UI unsanitized.
- [ ] File paths derived from subprocess output validated against a root prefix before use.
