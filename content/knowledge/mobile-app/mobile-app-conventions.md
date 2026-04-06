---
name: mobile-app-conventions
description: Platform naming conventions, accessibility patterns, navigation patterns, and code style for iOS and Android mobile apps
topics: [mobile-app, conventions, swift, kotlin, naming, accessibility, navigation]
---

Mobile platform conventions exist for consistency across the ecosystem, toolchain compatibility, and team readability. iOS and Android have distinct naming conventions, navigation paradigms, and accessibility implementation patterns. Mixing conventions or importing web/backend naming styles into mobile code creates cognitive friction and breaks tooling assumptions (SwiftUI previews, Android Studio refactoring, lint rules).

## Summary

iOS conventions use PascalCase for types and camelCase for everything else; Swift files are one type per file named identically to the type. Android uses PascalCase for classes and camelCase for members, with XML resource names in snake_case. Navigation uses UINavigationController/Coordinator (iOS) or Navigation Component with NavGraph (Android). Accessibility labels follow platform semantics: VoiceOver on iOS, TalkBack on Android. Follow these patterns consistently — tooling and platform reviewers expect them.

## Deep Guidance

### iOS Naming Conventions (Swift)

**Types (classes, structs, enums, protocols)**
- PascalCase: `UserProfileViewController`, `AuthenticationService`, `PaymentStatus`
- Protocols: prefer noun or adjective+able naming. `Codable`, `Equatable`, `DataSource`, `Delegate`
- Protocol conformances add a semantic suffix: `UITableViewDataSource`, `URLSessionDelegate`
- Generic type parameters: single uppercase letter for simple cases (`T`, `U`), descriptive names for constrained types (`Element`, `Key`, `Value`)

**Properties, methods, and variables**
- camelCase: `firstName`, `isAuthenticated`, `fetchUserProfile()`
- Boolean properties: use `is`, `has`, `should`, `can` prefix: `isLoading`, `hasUnreadMessages`, `canSubmit`
- Avoid abbreviations except widely established ones: `url`, `id`, `api` are acceptable; `usrNm` is not

**File naming**
- One primary type per file, filename matches type exactly: `UserProfileViewController.swift`, `AuthenticationService.swift`
- Extensions can live in separate files: `User+Codable.swift`, `View+Accessibility.swift`
- Protocol conformances in extension files when they're substantial: `UserProfileViewController+TableViewDelegate.swift`

**View naming (UIKit)**
- ViewControllers always end in `ViewController`: `LoginViewController`, `SettingsViewController`
- Views end in `View`: `ProfileHeaderView`, `EmptyStateView`
- Cells end in `Cell`: `ProductListCell`, `MessageBubbleCell`
- Reuse identifiers match class names: `tableView.register(ProductListCell.self, forCellReuseIdentifier: "ProductListCell")`

**SwiftUI naming**
- Views are structs with descriptive names: `UserProfileView`, `LoginForm`, `SettingsRow`
- ViewModels are `@Observable` classes or ObservableObjects ending in `ViewModel`: `UserProfileViewModel`
- Preview providers: `#Preview { UserProfileView() }`

**Constants**
- Use `enum` as a namespace (no-case enums cannot be instantiated): `enum APIConstants { static let baseURL = "..." }`
- `static let` on structs/classes for type-level constants
- Avoid global `let` at file scope except for truly global constants

### Android Naming Conventions (Kotlin)

**Classes and interfaces**
- PascalCase: `UserProfileFragment`, `AuthRepository`, `PaymentUseCase`
- Activities: end in `Activity` — `MainActivity`, `LoginActivity`
- Fragments: end in `Fragment` — `UserProfileFragment`, `SettingsFragment`
- ViewModels: end in `ViewModel` — `UserProfileViewModel`, `HomeViewModel`
- Repositories: end in `Repository` — `UserRepository`, `ProductRepository`
- Use cases: verb phrase — `GetUserProfileUseCase`, `UpdateSettingsUseCase`

**Properties and functions**
- camelCase: `firstName`, `isAuthenticated`, `fetchUserProfile()`
- Boolean properties: `is`, `has`, `should` prefix — `isLoading`, `hasError`, `shouldShowEmpty`
- Extension functions follow the same rules: fun `String.isValidEmail()`, fun `View.setVisible(Boolean)`

**XML resource naming (snake_case always)**
- Layouts: `{type}_{name}.xml` — `activity_main.xml`, `fragment_profile.xml`, `item_product.xml`, `view_empty_state.xml`
- IDs: `{type}_{name}` — `@id/button_submit`, `@id/text_username`, `@id/recycler_products`
- Drawables: `ic_{name}.xml` for icons, `bg_{name}.xml` for backgrounds, `shape_{name}.xml` for shapes
- Colors: descriptive names in `colors.xml` (`color_primary`, `color_surface`), semantic names in theme (`colorPrimary`, `colorSurface`)
- Strings: `{screen}_{element}_{type}` — `login_email_hint`, `profile_name_label`, `error_network_message`
- Dimensions: `{component}_{property}` — `button_corner_radius`, `card_elevation`, `spacing_large`

**Compose naming**
- Composables: PascalCase like types: `UserProfileScreen`, `ProductCard`, `EmptyState`
- State holders ending in `State`: `LoginUiState`, `ProfileUiState`
- Preview functions: `@Preview @Composable fun UserProfileScreenPreview()`

### Navigation Patterns — iOS

**UIKit navigation patterns**

*UINavigationController (hierarchical)*
- Push/pop model for drill-down navigation: settings list → individual setting
- `navigationController?.pushViewController(vc, animated: true)` / `.popViewController(animated: true)`
- Always use `navigationItem.title` and `navigationItem.backButtonTitle` for VoiceOver accessibility

*UITabBarController (top-level)*
- Manage 2–5 coordinate sibling views; do not nest tab bars
- Each tab owns its own `UINavigationController` — this is the standard pattern
- Tab bar items need `title` and `image` (SF Symbol): `UITabBarItem(title: "Home", image: UIImage(systemName: "house"), tag: 0)`

*Modal presentations*
- `.present(_:animated:completion:)` for modals
- Always provide a dismissal mechanism (button or swipe-down) — never trap the user in a modal
- `UISheetPresentationController` for bottom sheets (iOS 15+): `detents: [.medium(), .large()]`

*Coordinator pattern*
- Extract navigation logic from ViewControllers into Coordinator objects
- Each Coordinator owns a `UINavigationController` and creates/presents child ViewControllers
- Child Coordinators are stored in a `childCoordinators` array — release them in the finish callback to prevent leaks
- Delegate back to parent Coordinator for cross-boundary navigation

**SwiftUI navigation**
- `NavigationStack` (iOS 16+) for hierarchical navigation: `NavigationStack(path: $path) { ... }`
- `NavigationPath` for type-erased programmatic navigation
- `.navigationDestination(for:)` to register destination views for path types
- `TabView` with `tabItem` modifier for tab navigation
- `.sheet`, `.fullScreenCover`, `.popover` for modal presentation
- Pass navigation state via bindings or a `NavigationRouter` observable object — do not use environment objects for navigation state in deep hierarchies

### Navigation Patterns — Android

**Navigation Component (Jetpack)**
- Define navigation graph in `nav_graph.xml` or `NavHost` composable
- Fragments connect via Actions defined in the nav graph
- Pass arguments with Safe Args plugin — type-safe navigation prevents bundle key typos
- Deep links registered in nav graph enable external app navigation

**Compose Navigation**
- `NavHost` with `composable` routes: `NavHost(navController, startDestination = "home") { composable("home") { HomeScreen(navController) } }`
- Route strings are stringly-typed — define as constants in a `Screen` sealed class or object
- Pass data via route arguments (`/{userId}`) or ViewModel shared across the back stack
- `rememberNavController()` at the top of the composition; pass `NavController` down as a lambda (`onNavigate: () -> Unit`) rather than passing the controller itself

**Back stack management**
- `popBackStack()` for simple back navigation
- `navigate("destination") { popUpTo("home") { inclusive = false } }` to clear the back stack when navigating to a top-level destination
- `launchSingleTop = true` to prevent duplicate destinations in the back stack

### Accessibility Conventions

**iOS VoiceOver implementation**

Labels vs. hints:
- `accessibilityLabel`: what the element is — "Profile photo for Jane Smith"
- `accessibilityHint`: what happens when activated — "Double-tap to view full profile"
- Never include the element type in the label (VoiceOver announces it separately): say "Submit" not "Submit button"

Grouping:
- Use `accessibilityElements` to define a custom element order within a container
- `UIAccessibilityElement` with `isAccessibilityElement = true` for custom drawing views
- `accessibilityActivate()` override for complex controls with custom activation behavior

SwiftUI accessibility:
- `.accessibilityLabel("Submit order")` overrides the computed label
- `.accessibilityHint("Processes payment and places order")` adds the activation hint
- `.accessibilityAddTraits(.isButton)` when a custom view should be announced as a button
- `.accessibilityRemoveTraits(.isImage)` when an image is decorative
- `.accessibilityElement(children: .combine)` to merge a container's children into one accessible element

**Android TalkBack implementation**

View system:
- `android:contentDescription="@string/submit_button_label"` on all non-text interactive views
- `android:importantForAccessibility="no"` for decorative views (icons that duplicate adjacent text)
- `android:labelFor="@id/edit_text_email"` on Label TextViews — associates the label with the input for TalkBack
- `ViewCompat.setAccessibilityDelegate()` for advanced semantic customization

Compose semantics:
- `Modifier.semantics { contentDescription = "Submit order" }` for custom content descriptions
- `Modifier.semantics { role = Role.Button }` for role announcement
- `Modifier.clearAndSetSemantics { ... }` to replace inherited semantics entirely
- `Modifier.semantics(mergeDescendants = true) { ... }` to merge a group of elements

### Code Style Conventions

**Swift**
- `guard` for early returns over nested `if` statements
- `let` by default; `var` only when mutation is necessary
- Trailing closures when the last parameter is a closure: `array.filter { $0.isActive }`
- `@discardableResult` on functions when the return value may intentionally be ignored
- Mark protocol methods with default implementations in extensions
- Avoid `!` force-unwrap; use `guard let` or `if let` with meaningful error handling

**Kotlin**
- `val` by default; `var` only when mutation is required
- Data classes for value types that need `equals`/`hashCode`/`copy`: `data class User(val id: String, val name: String)`
- Sealed classes for exhaustive state modeling: `sealed class UiState { data class Success(...); data object Loading; data class Error(...) }`
- Extension functions over utility classes: `fun String.isValidEmail()` not `EmailUtils.isValidEmail(string)`
- Coroutines over threads/callbacks; `suspend` functions for async operations
- `Flow` for reactive streams; `StateFlow` for UI state; `SharedFlow` for events
