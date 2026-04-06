---
name: mobile-app-testing
description: Unit tests, UI tests (XCTest/Espresso/Detox), snapshot tests, accessibility testing, and test architecture for iOS and Android
topics: [mobile-app, testing, xctest, espresso, detox, snapshot-testing, accessibility-testing, unit-tests]
---

Mobile testing requires a multi-layer strategy: unit tests for business logic, integration tests for repository and network layers, UI tests for critical user flows, and snapshot tests for visual regression. The test pyramid applies — fast unit tests outnumber slow UI tests. Mobile UI tests are inherently fragile (timing, simulator state, animations) — structure them to minimize flakiness and run only the highest-value flows in CI.

## Summary

iOS testing uses XCTest for unit and UI tests, with third-party additions (Quick/Nimble for BDD, snapshot-testing for visual regression). Android uses JUnit4/5 + Mockito/MockK for unit tests, Espresso for UI tests (in-process), and optional Detox for cross-platform end-to-end testing. Snapshot tests catch unintended UI changes automatically. Test architecture follows the same clean separation as production code — inject fakes, not mocks, for stable tests. Run unit tests on every commit; UI tests on PR merge.

## Deep Guidance

### iOS Unit Testing (XCTest)

**Test file structure**
```swift
import XCTest
@testable import MyApp

final class UserProfileViewModelTests: XCTestCase {
    var sut: UserProfileViewModel!   // System Under Test
    var mockRepository: MockUserRepository!

    override func setUp() {
        super.setUp()
        mockRepository = MockUserRepository()
        sut = UserProfileViewModel(repository: mockRepository)
    }

    override func tearDown() {
        sut = nil
        mockRepository = nil
        super.tearDown()
    }

    func test_loadUser_success_setsUserOnState() async throws {
        // Arrange
        let expectedUser = User(id: "1", name: "Jane", email: "jane@example.com")
        mockRepository.stubbedUser = expectedUser

        // Act
        await sut.loadUser(id: "1")

        // Assert
        XCTAssertEqual(sut.user, expectedUser)
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
    }

    func test_loadUser_failure_setsErrorOnState() async {
        // Arrange
        mockRepository.stubbedError = NetworkError.serverError(500)

        // Act
        await sut.loadUser(id: "1")

        // Assert
        XCTAssertNil(sut.user)
        XCTAssertNotNil(sut.error)
    }
}
```

**Protocol-based fakes over Mocks**
```swift
protocol UserRepository {
    func fetchUser(id: String) async throws -> User
    func updateUser(_ user: User) async throws
}

// Fake — implements the real behavior with in-memory data
final class FakeUserRepository: UserRepository {
    var stubbedUser: User?
    var stubbedError: Error?
    var updatedUsers: [User] = []

    func fetchUser(id: String) async throws -> User {
        if let error = stubbedError { throw error }
        return stubbedUser ?? User(id: id, name: "Test User", email: "test@example.com")
    }

    func updateUser(_ user: User) async throws {
        if let error = stubbedError { throw error }
        updatedUsers.append(user)
    }
}
```

Fakes are preferable to generated mocks (Cuckoo, Mockingbird) because they compile without code generation, work in Swift Previews, and test realistic behavior rather than exact call sequences.

**Testing async code**
```swift
// Test async throws with async test methods (Swift concurrency)
func test_loadUser_callsRepository() async throws {
    let result = try await sut.loadUser(id: "1")
    XCTAssertEqual(result.id, "1")
}

// Test Combine publishers
func test_isLoading_trueWhileLoading() {
    var loadingStates: [Bool] = []
    let expectation = expectation(description: "Loading state changes")
    expectation.expectedFulfillmentCount = 3  // false → true → false

    let cancellable = sut.$isLoading.sink { loadingStates.append($0) }

    Task { await sut.loadUser(id: "1") }

    wait(for: [expectation], timeout: 2.0)
    XCTAssertEqual(loadingStates, [false, true, false])
}

// Performance tests
func test_fetchAllUsers_performance() throws {
    measure {
        let _ = try! mockRepository.fetchAllUsers()
    }
}
```

### Android Unit Testing (JUnit + MockK)

**ViewModel unit test**
```kotlin
@OptIn(ExperimentalCoroutinesApi::class)
class UserProfileViewModelTest {

    @get:Rule val mainDispatcherRule = MainDispatcherRule()  // replaces Main dispatcher with test dispatcher

    private val userRepository = mockk<UserRepository>()
    private lateinit var viewModel: UserProfileViewModel

    @BeforeEach
    fun setUp() {
        viewModel = UserProfileViewModel(userRepository)
    }

    @Test
    fun `loadUser success sets user in state`() = runTest {
        // Arrange
        val expectedUser = User(id = "1", name = "Jane", email = "jane@example.com")
        coEvery { userRepository.fetchUser("1") } returns Result.success(expectedUser)

        // Act
        viewModel.loadUser("1")
        advanceUntilIdle()

        // Assert
        val state = viewModel.uiState.value
        assertThat(state.user).isEqualTo(expectedUser)
        assertThat(state.isLoading).isFalse()
        assertThat(state.error).isNull()
    }

    @Test
    fun `loadUser failure sets error in state`() = runTest {
        coEvery { userRepository.fetchUser(any()) } returns Result.failure(IOException("Network error"))

        viewModel.loadUser("1")
        advanceUntilIdle()

        assertThat(viewModel.uiState.value.error).isNotNull()
    }
}
```

**MainDispatcherRule (required for ViewModel tests)**
```kotlin
class MainDispatcherRule(
    private val dispatcher: TestCoroutineDispatcher = TestCoroutineDispatcher()
) : TestWatcher() {
    override fun starting(description: Description) {
        Dispatchers.setMain(dispatcher)
    }
    override fun finished(description: Description) {
        Dispatchers.resetMain()
        dispatcher.cleanupTestCoroutines()
    }
}
```

**Repository integration test (with in-memory Room)**
```kotlin
@RunWith(AndroidJUnit4::class)
class UserRepositoryTest {
    private lateinit var database: AppDatabase
    private lateinit var userDao: UserDao

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()
        userDao = database.userDao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun insertAndRetrieveUser() = runTest {
        val user = UserEntity(id = "1", name = "Jane", email = "jane@example.com", updatedAt = 0L)
        userDao.upsert(user)
        val retrieved = userDao.observeUsers().first()
        assertThat(retrieved).contains(user)
    }
}
```

### UI Testing

**iOS XCUITest**
```swift
final class LoginUITests: XCTestCase {
    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--reset-state"]
        app.launch()
    }

    func test_login_validCredentials_navigatesToHome() throws {
        let emailField = app.textFields["login_email_field"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5))
        emailField.tap()
        emailField.typeText("test@example.com")

        let passwordField = app.secureTextFields["login_password_field"]
        passwordField.tap()
        passwordField.typeText("password123")

        app.buttons["login_submit_button"].tap()

        let homeTitle = app.staticTexts["home_screen_title"]
        XCTAssertTrue(homeTitle.waitForExistence(timeout: 10))
    }
}
```

Accessibility identifiers:
```swift
// Set in SwiftUI
Button("Submit") { submitAction() }
    .accessibilityIdentifier("login_submit_button")

// Set in UIKit
loginButton.accessibilityIdentifier = "login_submit_button"
```

Use `accessibilityIdentifier` for test targeting — never use display text or position-based queries which break on localization or layout changes.

**Android Espresso**
```kotlin
@RunWith(AndroidJUnit4::class)
class LoginInstrumentedTest {

    @get:Rule val activityRule = ActivityScenarioRule(LoginActivity::class.java)

    @Test
    fun login_validCredentials_navigatesToHome() {
        onView(withId(R.id.email_field))
            .perform(typeText("test@example.com"), closeSoftKeyboard())
        onView(withId(R.id.password_field))
            .perform(typeText("password123"), closeSoftKeyboard())
        onView(withId(R.id.submit_button)).perform(click())

        onView(withId(R.id.home_screen_title))
            .check(matches(isDisplayed()))
    }
}
```

**Compose UI testing**
```kotlin
@RunWith(AndroidJUnit4::class)
class UserProfileScreenTest {

    @get:Rule val composeTestRule = createComposeRule()

    @Test
    fun userCard_displaysName() {
        val user = User(id = "1", name = "Jane Smith", email = "jane@example.com")
        composeTestRule.setContent {
            MyAppTheme { UserCard(user = user) }
        }

        composeTestRule.onNodeWithText("Jane Smith").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("User avatar").assertExists()
    }
}
```

### Snapshot Testing

**iOS: swift-snapshot-testing (Point-Free)**
```swift
import SnapshotTesting

final class UserCardSnapshotTests: XCTestCase {
    func test_userCard_defaultState() {
        let view = UserCardView(user: .fixture)
        assertSnapshot(of: view, as: .image(on: .iPhone13Pro))
    }

    func test_userCard_loadingState() {
        let view = UserCardView(isLoading: true)
        assertSnapshot(of: view, as: .image(on: .iPhone13Pro))
    }

    func test_userCard_darkMode() {
        let view = UserCardView(user: .fixture)
        assertSnapshot(of: view, as: .image(on: .iPhone13Pro, traits: .init(userInterfaceStyle: .dark)))
    }
}
```

Run snapshots in `record` mode once to generate reference images, then in normal mode to detect regressions. Commit reference images to git. Update references only for intentional UI changes.

**Android: Paparazzi (Cashapp)**
```kotlin
@RunWith(AndroidJUnit4::class)
class UserCardSnapshotTest {
    @get:Rule val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6)

    @Test
    fun userCard_defaultState() {
        paparazzi.snapshot {
            MyAppTheme {
                UserCard(user = previewUser)
            }
        }
    }
}
```

Paparazzi runs on the JVM without a device or emulator — fast, CI-friendly.

### Accessibility Testing

**iOS: Accessibility Inspector + XCTest**
```swift
func test_loginButton_hasAccessibilityLabel() {
    let button = app.buttons["login_submit_button"]
    XCTAssertTrue(button.exists)
    XCTAssertFalse(button.label.isEmpty)  // has accessibility label
}
```

Automated accessibility audit:
```swift
func test_homeScreen_passesAccessibilityAudit() throws {
    // iOS 17+: built-in accessibility audit
    try app.performAccessibilityAudit()
}
```

`performAccessibilityAudit()` checks: missing labels, insufficient contrast, small touch targets, and other WCAG violations automatically.

**Android: Accessibility Test Framework**
```kotlin
@RunWith(AndroidJUnit4::class)
class AccessibilityTest {
    @get:Rule val rule = AccessibilityChecksRule()  // auto-runs checks on every view interaction

    @Test
    fun loginScreen_allElementsAccessible() {
        onView(withId(R.id.submit_button)).perform(click())
        // AccessibilityChecksRule automatically fails on accessibility issues
    }
}
```

Compose accessibility testing:
```kotlin
composeTestRule.onNodeWithText("Submit")
    .assertHasClickAction()
    .assertContentDescriptionEquals("Submit order")
    .assertIsEnabled()
```

### CI Test Strategy

**What runs when**
- Every commit: unit tests (fast, < 60 seconds)
- Every PR: unit tests + instrumented tests on emulator (< 10 minutes)
- Every merge to main: full suite including UI tests and snapshot tests (< 30 minutes)
- Nightly: device farm run across full device matrix

**Handling flaky tests**
- Retry mechanism in CI: rerun failed tests up to 2 times before marking as failed
- iOS: `--retry-tests-on-failure` flag in `xcodebuild test`
- Android: `android { testOptions { unitTests { isReturnDefaultValues = true } } }`
- Track flaky tests in a flakiness registry — tests flagged as flaky do not block merges but get prioritized for fixing
