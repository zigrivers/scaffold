---
name: mobile-app-architecture
description: MVVM/MVI/TCA patterns, navigation architecture, dependency injection, and state management for iOS and Android mobile apps
topics: [mobile-app, architecture, mvvm, mvi, tca, navigation, dependency-injection, state-management]
---

Mobile app architecture determines testability, scalability, and developer velocity. The wrong architecture is expensive to reverse — a monolithic ViewController or God Activity becomes unmaintainable at scale. Both iOS and Android ecosystems have converged on unidirectional data flow patterns: TCA and MVVM+Combine/async for iOS, MVI and MVVM+Flow for Android. Choose the pattern that matches your team's size and complexity requirements, not the most sophisticated available option.

## Summary

iOS architectures: MVVM with SwiftUI/Combine for mid-size apps, TCA (The Composable Architecture) for large apps requiring strict testability and state isolation. Android architectures: MVVM with StateFlow for most apps, MVI for complex state management. Both platforms benefit from clean architecture layers — presentation, domain, data — with dependency injection (Hilt for Android, constructor injection or a container for iOS). Navigation architecture is separate from view architecture: use Coordinator (iOS) or Navigation Component (Android).

## Deep Guidance

### iOS Architecture Patterns

**MVVM with SwiftUI**

The standard pattern for new iOS apps. The ViewModel is an `@Observable` class (iOS 17+) or `ObservableObject` (iOS 13+) that holds and transforms state:

```swift
@Observable
final class UserProfileViewModel {
    var user: User?
    var isLoading = false
    var error: Error?

    private let repository: UserRepository

    init(repository: UserRepository) {
        self.repository = repository
    }

    func loadUser(id: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            user = try await repository.fetchUser(id: id)
        } catch {
            self.error = error
        }
    }
}

struct UserProfileView: View {
    @State private var viewModel = UserProfileViewModel(repository: LiveUserRepository())

    var body: some View {
        Group {
            if viewModel.isLoading { ProgressView() }
            else if let user = viewModel.user { UserDetailView(user: user) }
            else if viewModel.error != nil { ErrorView() }
        }
        .task { await viewModel.loadUser(id: userId) }
    }
}
```

Rules for healthy MVVM:
- ViewModels must not import UIKit or SwiftUI — they are platform-agnostic
- One ViewModel per screen/feature, not per view hierarchy level
- ViewModels receive dependencies via constructor injection — no singletons
- ViewModels hold only UI state, not business logic — business logic belongs in services/repositories
- Test ViewModels by injecting fake dependencies and asserting state transitions

**TCA (The Composable Architecture)**

For large apps with complex state, strict testability requirements, or large teams. TCA provides a single-direction state mutation model:

```swift
@Reducer
struct UserProfileFeature {
    @ObservableState
    struct State: Equatable {
        var user: User?
        var isLoading = false
        var error: String?
    }

    enum Action {
        case loadUser(String)
        case userLoaded(Result<User, Error>)
    }

    @Dependency(\.userRepository) var userRepository

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .loadUser(let id):
                state.isLoading = true
                return .run { send in
                    await send(.userLoaded(Result { try await userRepository.fetchUser(id: id) }))
                }
            case .userLoaded(.success(let user)):
                state.isLoading = false
                state.user = user
                return .none
            case .userLoaded(.failure(let error)):
                state.isLoading = false
                state.error = error.localizedDescription
                return .none
            }
        }
    }
}
```

TCA benefits: every state mutation is explicit, side effects are isolated and cancellable, testing is deterministic. TCA costs: steep learning curve, boilerplate-heavy for simple features, requires team-wide adoption to be consistent.

**Clean Architecture layers for iOS**
```
Presentation Layer: Views + ViewModels
    ↓ calls
Domain Layer: Use Cases + Domain Models + Repository Protocols
    ↓ calls
Data Layer: Repository Implementations + Network + Persistence
```

- Domain layer has zero dependencies on UIKit, SwiftUI, or any specific framework
- Repository protocols defined in the domain layer, implemented in the data layer
- Use cases encapsulate single business operations: `FetchUserProfileUseCase`, `SubmitOrderUseCase`

### Android Architecture Patterns

**MVVM with StateFlow**

The Google-recommended pattern, aligning with Android's official architecture guidance:

```kotlin
data class UserProfileUiState(
    val user: User? = null,
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class UserProfileViewModel @Inject constructor(
    private val userRepository: UserRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(UserProfileUiState())
    val uiState: StateFlow<UserProfileUiState> = _uiState.asStateFlow()

    fun loadUser(userId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            userRepository.fetchUser(userId)
                .onSuccess { user ->
                    _uiState.update { it.copy(user = user, isLoading = false) }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(error = error.message, isLoading = false) }
                }
        }
    }
}

@Composable
fun UserProfileScreen(viewModel: UserProfileViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    // render based on uiState
}
```

**MVI (Model-View-Intent)**

For features with complex state machines where MVVM state updates become hard to reason about:

```kotlin
sealed class UserProfileIntent {
    data class LoadUser(val userId: String) : UserProfileIntent()
    data object Refresh : UserProfileIntent()
}

sealed class UserProfileEffect {
    data class ShowError(val message: String) : UserProfileEffect()
    data object NavigateToLogin : UserProfileEffect()
}
```

MVI separates user intentions from state mutations. The `SharedFlow` channel (`_effect`) handles one-shot events (navigation, toasts) that must not survive recomposition — a critical distinction from `StateFlow`.

**One-shot events vs. state**
- Use `StateFlow` for persistent UI state: loading, data, errors that survive recomposition
- Use `SharedFlow` or `Channel` (as `Flow`) for one-shot effects: navigation commands, snackbar messages, dialog triggers
- Never put navigation events in `StateFlow` — they replay on configuration change, causing double navigation

**Clean Architecture layers for Android**
```
UI Layer: Composables + ViewModels
    ↓ calls
Domain Layer: Use Cases + Domain Models + Repository Interfaces
    ↓ calls
Data Layer: Repository Implementations + RemoteDataSource + LocalDataSource
```

- Domain layer: pure Kotlin module (`core/domain`) with no Android dependencies
- Use cases: single `operator fun invoke()` or `execute()` function
- Repository pattern: the domain defines the interface; data layer implements it

### Dependency Injection

**Android: Hilt**

Hilt is the recommended DI framework for Android:

```kotlin
// Define a module
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient = OkHttpClient.Builder().build()

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.BASE_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
}

// Inject into ViewModel
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val analyticsService: AnalyticsService
) : ViewModel()
```

Hilt scopes: `SingletonComponent` (app lifetime), `ActivityRetainedComponent` (ViewModel lifetime), `ViewModelComponent` (ViewModel scope), `FragmentComponent`, `ActivityComponent`. Match the scope to the dependency's actual lifetime.

**iOS: Constructor injection + container**

Swift does not have a dominant DI framework. Use constructor injection as the default:

```swift
// Dependency container
final class AppDependencies {
    static let shared = AppDependencies()

    lazy var networkClient: NetworkClient = URLSessionNetworkClient()
    lazy var userRepository: UserRepository = NetworkUserRepository(client: networkClient)
    lazy var analyticsService: AnalyticsService = FirebaseAnalyticsService()
}

// Inject at the composition root (app entry point or Coordinator)
let viewModel = UserProfileViewModel(
    repository: AppDependencies.shared.userRepository
)
```

For testing: define protocols for all dependencies and inject fakes in tests. Never call `AppDependencies.shared` inside a ViewModel — inject via constructor.

### State Management

**iOS state scoping**
- `@State`: view-local ephemeral state (animation flags, text field values) — does not survive view destruction
- `@Binding`: two-way binding from parent to child — child can mutate parent's state
- `@Observable` / `@ObservableObject`: shared mutable state in a ViewModel — survives view re-renders
- `@Environment`: dependency injection through the view tree (theme, locale, custom services)
- `@EnvironmentObject`: globally shared state accessed without explicit passing — use sparingly, only for truly app-wide state (user session, theme)
- Avoid prop-drilling state through 4+ view layers — use `@Environment` or restructure to lift state to a shared ancestor ViewModel

**Android state scoping**
- `remember { }`: view-local ephemeral state in Compose — survives recomposition, not configuration change
- `rememberSaveable { }`: survives configuration change by saving to Bundle
- `StateFlow` in ViewModel: survives configuration change automatically (ViewModel lifecycle)
- `SavedStateHandle` in ViewModel: persists through process death for critical state (form data, scroll position)
- Hoist state to the lowest ancestor that needs it — do not hoist everything to the ViewModel

**Handling configuration changes (Android)**
- ViewModel automatically survives rotation and theme change — the primary benefit of the ViewModel
- Always collect `StateFlow` with `collectAsStateWithLifecycle()` in Compose — stops collection when UI is not visible, preventing wasted work and crashes in background

**Background state handling (iOS)**
- ScenePhase: observe `\.scenePhase` in SwiftUI to react to foreground/background transitions
- Save in-progress work when entering background: `@Environment(\.scenePhase) var scenePhase`
- `@AppStorage`: lightweight persistence backed by UserDefaults for small values
- Combine state from multiple sources with `Publishers.CombineLatest` or async/await TaskGroup
