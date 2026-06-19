---
name: macos-testing
description: >-
  XCTest, Swift Testing (@Test/#expect, Xcode 16+), XCUITest, snapshot testing with swift-snapshot-testing, and running tests in CI via xcodebuild
topics:
  - macos-native
  - testing
  - xctest
  - swift-testing
  - xcuitest
  - ci
volatility: evolving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/xctest
  - url: https://developer.apple.com/documentation/testing
  - url: https://github.com/pointfreeco/swift-snapshot-testing
  - url: https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results
---

macOS apps have three testing layers: unit tests (XCTest or Swift Testing), UI automation tests (XCUITest), and snapshot tests for visual regression. Swift Testing — introduced at WWDC 2024, shipping with Xcode 16 — is the modern replacement for XCTest in new unit test code. XCUITest has no Swift Testing equivalent and stays in XCTest.

## Summary

**Swift Testing** (`@Test`, `#expect`, `#require`, `@Suite`) is built into Swift 6 / Xcode 16 and coexists with XCTest in the same test target. Migrate new tests to Swift Testing; leave existing XCTest tests in place. **XCTest** remains required for UI tests and for deployment targets below macOS 12. **XCUITest** drives the app through its UI; access elements via `XCUIApplication` queries. **swift-snapshot-testing** (`assertSnapshot(of:as:)`) provides visual and structural regression testing. Run all tests in CI with `xcodebuild test`; coverage with `-enableCodeCoverage YES`.

## Deep Guidance

### Swift Testing (Xcode 16 / Swift 6, macOS 12+; async features effectively require macOS 13+)

Swift Testing is a first-party framework built into the Swift toolchain — no SPM dependency required for Apple platform targets. Tests do not need to subclass `XCTestCase` or use the `test` prefix.

**Basic test:**

```swift
import Testing

@Test func additionWorks() {
    let sum = 1 + 1
    #expect(sum == 2)
}
```

**`#expect` vs `#require`:**

- `#expect(condition)` — soft assertion; test continues on failure and reports all failures in the test run. Captures and displays evaluated subexpressions.
- `try #require(condition)` — throwing assertion; test stops immediately on failure. Also used to unwrap optionals: `let value = try #require(optional)`.

```swift
@Test func parserReturnsValue() throws {
    let result = parse("42")
    // Stop immediately if result is nil:
    let value = try #require(result)
    #expect(value == 42)
}
```

**`@Suite` for grouping:**

```swift
@Suite("UserDefaults persistence")
struct UserDefaultsTests {
    @Test func writesString() {
        UserDefaults.standard.set("hello", forKey: "key")
        #expect(UserDefaults.standard.string(forKey: "key") == "hello")
    }

    @Test func readsMissingKeyAsNil() {
        #expect(UserDefaults.standard.string(forKey: "absent") == nil)
    }
}
```

`@Suite` is optional — any `struct`, `class`, or `actor` containing `@Test` methods forms an implicit suite. Use `@Suite(.serialized)` to force serial (non-concurrent) execution of tests within the suite.

**Parameterized tests:**

```swift
@Test("Parsing", arguments: ["1", "42", "100"])
func parsesInteger(_ input: String) throws {
    let value = try #require(Int(input))
    #expect(value > 0)
}
```

**Async tests:**

```swift
@Test func fetchesData() async throws {
    let data = try await myService.fetch()
    #expect(!data.isEmpty)
}
```

**Swift Testing coexists with XCTest** in the same target. Migrate incrementally — you do not need to rewrite existing XCTest tests. Both appear in the Xcode 16 test navigator.

**Important:** `XCUIApplication` and XCUITest require XCTest — Swift Testing cannot drive UI tests.

### XCTest (Unit and Integration Tests)

```swift
import XCTest

final class DocumentStoreTests: XCTestCase {

    var store: DocumentStore!

    override func setUp() async throws {
        store = DocumentStore(url: .temporaryDirectory)
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: store.url)
        store = nil
    }

    func testSaveAndLoad() async throws {
        try await store.save(Document(title: "Test", content: "Hello"))
        let loaded = try await store.load(title: "Test")
        XCTAssertEqual(loaded.content, "Hello")
    }
}
```

**Callback-based async (Swift 6):**

The old `waitForExpectations(timeout:)` is unavailable from async contexts in Swift 6. Use `fulfillment(of:timeout:)`:

```swift
func testAsyncCallback() async {
    let expectation = expectation(description: "completion called")
    myService.doSomething { result in
        XCTAssertNotNil(result)
        expectation.fulfill()
    }
    await fulfillment(of: [expectation], timeout: 5)
}
```

### XCUITest (UI Automation)

XCUITest drives the real app process and tests user-visible behavior.

```swift
import XCTest

final class OnboardingUITests: XCTestCase {

    var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()
    }

    func testWelcomeScreenAppears() {
        let title = app.staticTexts["Welcome to MyApp"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
    }

    func testGetStartedNavigatesToMainView() {
        app.buttons["Get Started"].tap()
        XCTAssertTrue(app.navigationBars["Home"].waitForExistence(timeout: 3))
    }
}
```

**Element query patterns:**

```swift
app.buttons["Save"]                 // by accessibility label
app.buttons.matching(identifier: "save-button").firstMatch
app.textFields["Username"]          // text field by label
app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Error'")).firstMatch
app.tables.cells.element(boundBy: 0) // first table cell
```

Always call `waitForExistence(timeout:)` before interacting with an element — UI tests are timing-sensitive. `continueAfterFailure = false` stops the test at the first failure instead of crashing mid-sequence.

**Pass flags to distinguish UI test runs:**

```swift
// In the test:
app.launchArguments = ["--ui-testing"]

// In the app:
if CommandLine.arguments.contains("--ui-testing") {
    // Use in-memory store, skip animations, reset state
}
```

### Snapshot Testing (swift-snapshot-testing)

`pointfreeco/swift-snapshot-testing` captures a snapshot of a value (view, data, string) and compares it to a committed reference file. On first run, it creates the reference; on subsequent runs, it compares and fails if they differ.

**Add via SPM:**

```swift
// Package.swift
.package(url: "https://github.com/pointfreeco/swift-snapshot-testing", from: "1.17.0"),
```

**Basic snapshot test:**

```swift
import XCTest
import SnapshotTesting
import SwiftUI

final class ContentViewSnapshotTests: XCTestCase {

    func testContentViewRendering() {
        let view = ContentView()
        // .image strategy renders the SwiftUI view to an NSImage
        assertSnapshot(of: view, as: .image(size: CGSize(width: 400, height: 300)))
    }

    func testDataModelDescription() {
        let model = UserProfile(name: "Alice", email: "alice@example.com")
        // .description uses CustomStringConvertible / dump output
        assertSnapshot(of: model, as: .description)
    }
}
```

**Snapshot strategies:**
- `.image` — renders to image (requires `size` for non-view types or macOS `NSView`/SwiftUI `View`)
- `.description` — `String(describing:)` output
- `.dump` — `dump(_:)` mirror output (useful for data model structure)
- `.json` — `JSONEncoder` output (needs `Encodable`)

**Update reference snapshots:**

swift-snapshot-testing v1.17+ uses the `withSnapshotTesting(record:)` API — there is no `RECORD_MODE` environment variable. Use one of:

```swift
// Re-record all snapshots in a scope (v1.17+):
withSnapshotTesting(record: .all) {
    assertSnapshot(of: view, as: .image(size: CGSize(width: 400, height: 300)))
}

// Per-assertion record flag (works in all supported versions):
assertSnapshot(of: view, as: .image(size: CGSize(width: 400, height: 300)), record: .all)

// Suite-level (v1.17+):
@Suite(.snapshots(record: .failed))  // only re-record on failure
struct MySnapshotTests { ... }
```

The older `isRecording = true` property (set on `XCTestCase` subclass) is a legacy pre-v1.17 approach. Some versions also supported a `SNAPSHOT_RECORD_MODE` environment variable; the current recommended API is `withSnapshotTesting(record:)`. Always check the [swift-snapshot-testing README](https://github.com/pointfreeco/swift-snapshot-testing) for the version you are using.

Commit snapshot files (`__Snapshots__/`) to the repo so diffs appear in code review. Never `.gitignore` them — they are the regression baseline.

### Running Tests in CI with xcodebuild

```bash
# Run all tests for a scheme on macOS:
xcodebuild test \
  -scheme MyApp \
  -destination 'platform=macOS' \
  -resultBundlePath TestResults.xcresult \
  -enableCodeCoverage YES

# Filter to one test class:
xcodebuild test \
  -scheme MyApp \
  -destination 'platform=macOS' \
  -only-testing MyAppTests/DocumentStoreTests

# Run without building (if already built):
xcodebuild test-without-building \
  -scheme MyApp \
  -destination 'platform=macOS' \
  -testPlan MyTestPlan
```

**Extract coverage report:**

```bash
# List coverage targets in the result bundle:
xcrun xccov view --report TestResults.xcresult

# Export as JSON:
xcrun xccov view --report --json TestResults.xcresult > coverage.json
```

**GitHub Actions integration:**

```yaml
- name: Run tests
  run: |
    xcodebuild test \
      -scheme MyApp \
      -destination 'platform=macOS' \
      -resultBundlePath TestResults.xcresult \
      -enableCodeCoverage YES \
      | xcpretty --report junit --output test-results.xml

- name: Publish test results
  uses: mikepenz/action-junit-report@v4
  if: always()
  with:
    report_paths: 'test-results.xml'
```

`xcpretty` formats `xcodebuild` output and can produce JUnit XML for CI test reporting. Install via `gem install xcpretty`.
