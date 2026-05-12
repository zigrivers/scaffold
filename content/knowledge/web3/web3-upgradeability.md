---
name: web3-upgradeability
description: Upgradeable contracts — when not to upgrade, UUPS vs Transparent vs Beacon, OpenZeppelin Upgrades with the Foundry plugin, storage gaps, ERC-7201, initializers, timelocked authorization
topics: [web3, upgradeability, proxy, openzeppelin, storage]
---

Upgradeable contracts trade simplicity for the ability to fix bugs after deployment. The cost is real: a new threat surface (the upgrade key itself), a class of storage-layout bugs that do not exist in immutable contracts, and a permanent dependency on whoever holds upgrade rights. An "upgradeable" protocol is one whose trust assumptions include a future action by an admin — every user of the protocol is implicitly trusting that admin to behave, in perpetuity. The honest default for most protocols is: do not upgrade unless you have to.

## Summary

Default to immutable contracts and reach for upgradeability only when the protocol genuinely needs it — regulatory shifts, post-audit critical fixes, or planned feature evolution. When you do upgrade, prefer UUPS over the Transparent proxy: it is gas-cheaper and the upgrade logic lives on the implementation where it can be audited as a normal contract function. Use OpenZeppelin's `@openzeppelin/contracts-upgradeable` library with the `openzeppelin-foundry-upgrades` plugin so storage-layout validation runs as part of CI — skipping that validation is how protocols brick themselves. For new protocols, use ERC-7201 namespaced storage instead of the `__gap` pattern; it eliminates an entire category of storage-collision bugs at the cost of slightly more verbose accessors. Always gate `_authorizeUpgrade` behind `onlyRole(UPGRADER_ROLE)` and route the role through a `TimelockController` so users have an exit window.

## Deep Guidance

### When to upgrade (and when not to)

Immutable contracts have a smaller attack surface, a cleaner decentralization story, and a much shorter trust prompt: "the code you see is the code that will run, forever." Upgradeable contracts can never make that claim. Every governance-related FAQ, every audit report, every user-facing risk disclosure has to spend a paragraph on the upgrade path — who can call it, how long it takes, what they can change. That is not free.

Reach for upgradeability when the trade is worth it: a regulated stablecoin issuer who must be able to comply with new sanctions regimes, a lending market whose risk parameters need to evolve as collateral assets change, a protocol whose audit recommended a fix that the team wants to be able to ship after launch without forcing every integrator to migrate. Do not reach for upgradeability because "we might want to change things later" — that is the same impulse that makes throwaway scripts grow into production systems by accident. If the only reason you can articulate for upgradeability is optionality, ship immutable and earn the trust dividend.

A useful test: write the sentence "users must trust ___ to ___" and see if you can defend it. "Users must trust the team's 4-of-7 Safe, behind a 72h timelock, to upgrade the protocol only when an audit-validated patch is needed" is defensible. "Users must trust the team" is not.

A pragmatic middle ground worth considering before reaching for full proxy upgradeability: ship immutable core contracts with a clearly-scoped admin surface (set fee, set oracle, set risk parameter), and migrate users to a new immutable deployment if the core logic itself ever needs to change. Most protocols that think they need upgradeability actually need parameter governance, which is much simpler and considerably less dangerous. Reserve true upgradeability for code paths where a migration would be operationally impossible — token contracts with millions of existing holders, NFT collections with active marketplaces, deeply-integrated infrastructure that other protocols import as a dependency.

When a migration is feasible, prefer it. Migrations make the trust boundary explicit (users opt in by moving funds), they let the new contract address be re-audited as if it were a fresh deployment, and they avoid the perpetual "what if the upgrade key gets compromised" tail risk. The cost is real — coordinating wallet UIs, third-party integrations, exchange listings, indexer pipelines, and user education is non-trivial — but it is a one-time cost, paid in exchange for permanent simplicity of the trust model. Compare that to the recurring cost of every upgrade requiring a fresh community review, fresh audit, fresh announcement, and fresh timelock execution. Migrations are often cheaper in total over a multi-year horizon than the cumulative cost of running an upgradeable system safely.

### Proxy patterns

Three proxy patterns dominate the OpenZeppelin ecosystem:

- **`TransparentUpgradeableProxy`** — Separates the admin (who can call upgrade functions on the proxy) from users (whose calls are forwarded to the implementation). Requires a `ProxyAdmin` contract sitting beside the proxy. Slightly more expensive per call because of the admin-vs-user check; safer in older Solidity versions where function-selector clashes were a worry.
- **`UUPSUpgradeable`** — The upgrade function lives on the implementation contract itself, not the proxy. The proxy is minimal — just `delegatecall` and a storage slot for the implementation address. Cheaper at runtime, simpler bytecode, and the upgrade authorization is a normal Solidity function on the implementation that auditors can reason about like any other access-controlled function.
- **`BeaconProxy`** — Many proxies share a single beacon contract that holds the implementation address. Upgrading the beacon upgrades every proxy that points at it. Useful when you deploy many instances of the same contract (per-user vaults, per-market lending pools) and want one upgrade to fan out to all of them.

UUPS is the right default for most protocols. The slimmer proxy is gas-cheaper for every user call for the entire life of the protocol — a non-trivial saving at scale — and the upgrade logic is a single auditable function rather than a separate `ProxyAdmin` contract. The catch: UUPS has a uniquely dangerous failure mode. If your v2 implementation forgets to inherit `UUPSUpgradeable` or accidentally removes the `_authorizeUpgrade` function, the proxy is permanently stuck on v2 with no upgrade path. The `openzeppelin-foundry-upgrades` plugin checks this for you; never deploy a UUPS upgrade without running it.

Reach for the Transparent proxy when the upgrade authorization model is materially different from the rest of the contract's access control — for example, a third party (like a foundation or DAO timelock) holds the upgrade key while the protocol team holds operational roles. The `ProxyAdmin` separation cleanly enforces "the upgrader cannot call user functions, even by accident" at the proxy layer rather than depending on Solidity-level modifiers. Reach for the Beacon pattern when you operate a contract factory — a yield-vault platform deploying one vault per strategy, a lending protocol deploying one pool per market — and want a single upgrade to propagate to every deployed instance atomically. Each pattern is correct in its niche; UUPS is the right answer when you do not have a strong reason to pick one of the other two.

A note on minimal proxies (EIP-1167 "clone" contracts): these are not upgradeable. Clones are a deployment-cost optimization — many cheap proxies forwarding all calls to a single immutable implementation — and changing the implementation requires deploying new clones. Do not confuse the two when picking a pattern. If you want one-shot cheap deployments without upgrade capability, use clones; if you want upgradeability across many deployed instances, use beacons.

### OpenZeppelin Upgrades + Foundry plugin

Use `@openzeppelin/contracts-upgradeable` for the implementation and the `openzeppelin-foundry-upgrades` plugin to deploy and validate. The plugin parses the storage layout of both old and new implementations and refuses to deploy an upgrade that would corrupt state — reordered fields, changed types, removed variables without a gap. CI should fail any PR that triggers a layout-incompatible change without an explicit reviewer override.

```solidity
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

contract Protocol is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers(); // see "Initializers vs constructors" below
    }

    function initialize(address admin, address upgrader) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, upgrader);
    }

    function _authorizeUpgrade(address newImpl) internal override onlyRole(UPGRADER_ROLE) {}
}
```

Deploy via the plugin's `Upgrades.deployUUPSProxy(...)` helper, and run `Upgrades.upgradeProxy(...)` for subsequent versions. Both invocations validate storage layout against the previously-deployed implementation before broadcasting the transaction. Treat the validation output as a release-gating signal; the plugin is the single most effective defense against storage-corruption bugs you can wire into a CI run.

Wire the plugin into CI explicitly, not just into local dev. Add a job that runs the upgrade-validation step against the current main-branch deployment artifacts for every PR that touches an upgradeable contract — if the PR introduces an incompatible layout change, the CI job fails before review even starts. The plugin emits a structured error pointing at the specific variable that broke compatibility, which makes triage fast. Pair this with a deployment artifact convention: every deployed implementation address gets recorded in a `deployments/<chain>.json` file checked into the repo, so future upgrades have a stable reference to compare against. The plugin uses these artifacts as its source of truth for "what is currently deployed."

### Storage collision and the gap pattern

In a proxy-based contract, state lives in the proxy's storage and is read through slot offsets baked into the implementation bytecode. When v2 of the implementation adds a state variable in the middle of the existing list, every later variable shifts by one slot — and the values that v1 wrote now appear in the wrong fields. `owner` becomes garbage, `totalSupply` reads from a different variable's slot, and the protocol silently corrupts.

The traditional fix is the storage gap: reserve a fixed array of unused slots at the end of every upgradeable contract so v2 can append fields by shrinking the gap rather than shifting existing slots.

```solidity
contract ProtocolV1 is Initializable, UUPSUpgradeable {
    uint256 public totalSupply;
    mapping(address => uint256) public balances;
    // ... other state ...

    /// @custom:storage-location erc7201:none
    uint256[50] private __gap; // reserve 50 slots for future fields
}

// In ProtocolV2:
contract ProtocolV2 is Initializable, UUPSUpgradeable {
    uint256 public totalSupply;
    mapping(address => uint256) public balances;
    uint256 public newFeeBps;            // new field consumes 1 slot from the gap
    uint256[49] private __gap;           // gap shrinks by exactly 1
}
```

The discipline is exact: when you add a 1-slot field, shrink the gap by 1. When you add a `mapping`, shrink by 1 (mappings always take one slot, regardless of contents). When you add a `struct`, shrink by however many slots the struct packs into. The Foundry plugin verifies the math; do not eyeball it.

Two further hazards specific to the gap pattern. Inheritance chains compound the bookkeeping — every parent contract in the upgradeable hierarchy needs its own gap, sized for that parent's future evolution, and changes to a parent contract's storage have to respect every child's gap. This is one of the strongest arguments for ERC-7201 in any contract with non-trivial inheritance. And: do not "rescue" leftover gap space by inserting a field at the start of the contract's state. Adding `uint256 public newFee` at the top reshuffles every existing slot. The gap exists at the end of state precisely so additions land in unused, never-written slots; appending is safe, prepending is catastrophic.

### ERC-7201 namespaced storage (preferred for new protocols)

ERC-7201 ("Namespaced Storage Layout") avoids the slot-collision problem entirely by storing state inside a library-style struct anchored to a deterministic, name-derived slot, instead of sequential slot 0 onward. Add fields freely without worrying about layout drift — there is no "next slot" to corrupt because each contract's state lives in its own keccak-derived corner of storage.

```solidity
library ProtocolStorage {
    /// @custom:storage-location erc7201:scaffold.protocol.main
    struct Layout {
        uint256 totalSupply;
        mapping(address => uint256) balances;
        uint256 newFeeBps; // added in v2 — no gap to shrink, no slot to collide
    }

    // keccak256(abi.encode(uint256(keccak256("scaffold.protocol.main")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant SLOT =
        0x...; // computed once, hardcoded

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = SLOT;
        assembly { l.slot := slot }
    }
}
```

Implementations read and write via `ProtocolStorage.layout().totalSupply` rather than a direct state variable. The cost is verbosity — every storage access goes through the library — and slightly more bytecode. The benefit is that upgrade reviews stop being about slot math and start being about business logic. Prefer ERC-7201 for any new upgradeable protocol; the `__gap` pattern is fine for existing contracts that already shipped without namespaced storage but is no longer the recommended default.

ERC-7201 also makes mixin-style composition safe. A `Pausable` mixin can declare its own namespaced storage struct under `scaffold.protocol.pausable`, and a `Permit` mixin can declare its own under `scaffold.protocol.permit`, and the two will never collide regardless of inheritance order — each lives in a deterministic slot derived from its name, not from its position in the linearization. Contrast this with the gap pattern, where reordering parents in `is A, B, C` versus `is A, C, B` shifts storage slots in ways that can corrupt state without changing any field. Namespaced storage decouples logical composition from physical storage layout, which is exactly the invariant you want for a long-lived upgradeable system.

### Initializers vs constructors

Proxies do not run the implementation's constructor — storage lives on the proxy, but a constructor only writes to the implementation contract's own storage, which the proxy never reads. Initialization runs through a regular function on the implementation, called via the proxy after deployment. Use the `initializer` modifier from `Initializable` to prevent the function from being called twice:

```solidity
function initialize(address admin) external initializer {
    __AccessControl_init();
    __UUPSUpgradeable_init();
    _grantRole(DEFAULT_ADMIN_ROLE, admin);
}
```

Two related hazards. First, every parent contract that has its own initializer needs an explicit `__Parent_init()` call from your `initialize` function — forgetting one leaves that subsystem (AccessControl, Pausable, ERC20) in a half-initialized state where modifiers pass but invariants are wrong. Second, the implementation contract itself — independent of the proxy — is a normal deployed contract that an attacker can call directly. If you leave its `initialize` callable, the attacker becomes admin of the implementation. They cannot reach proxy state, but they can call self-destructing or upgrade-bricking functions on the implementation. Defend with `_disableInitializers()` in the constructor:

```solidity
/// @custom:oz-upgrades-unsafe-allow constructor
constructor() {
    _disableInitializers();
}
```

The `unsafe-allow constructor` annotation tells the OpenZeppelin plugin that this constructor is intentional and safe — it touches no storage, it only locks down the implementation. Skipping `_disableInitializers()` for a UUPS implementation is a textbook audit finding; bake it into every upgradeable contract template.

When a v2 upgrade needs to write new state on first use (set a new fee parameter, initialize a new mapping, populate a new role), use the `reinitializer(version)` modifier rather than `initializer`:

```solidity
function initializeV2(uint256 newFeeBps) external reinitializer(2) {
    ProtocolStorage.layout().newFeeBps = newFeeBps;
}
```

`reinitializer(2)` runs once and only once, and only if the contract has been initialized to a version strictly less than 2. Call it as the same transaction that performs the upgrade (the OpenZeppelin plugin supports this via `Upgrades.upgradeProxy(..., abi.encodeCall(Protocol.initializeV2, (newFee)))`) so the protocol is never observable in a partially-upgraded state. Skipping the atomic init-during-upgrade pattern leaves a window — sometimes minutes, sometimes blocks — where the proxy points at v2 logic but has not yet had `initializeV2` called, which is precisely the kind of inconsistency attackers monitor for.

### Upgrade authorization

`_authorizeUpgrade(address)` is the single most dangerous function in an upgradeable protocol. Whoever can call it can replace your contract logic with anything — a backdoor, a rug pull, an oracle override. Treat it accordingly:

- Gate with `onlyRole(UPGRADER_ROLE)` (or `onlyOwner` if you have explicitly chosen the simpler model). Never leave it empty or default-public.
- Grant `UPGRADER_ROLE` to a `TimelockController` (see `web3-access-control.md`), never directly to a Safe or EOA. The timelock buys users a 48–72 hour window between proposal and execution to exit if the upgrade is malicious.
- Audit `_authorizeUpgrade` specifically. It is one line of Solidity that gates the entire contract; any reviewer should be able to recite its access check from memory.
- Emit an event on every upgrade — OpenZeppelin's `Upgraded(address)` from ERC-1967 fires automatically, but pair it with off-chain alerting so an unexpected upgrade pages your team within minutes.

Calibrate the timelock delay to the protocol's exit time, exactly as in the access-control doc: an upgrade users cannot react to in 24 hours should not run on a 24-hour timelock. The asymmetry — admin proposes fast, users react slow — is the entire point.

Two operational practices that strengthen this layer further. First, publish the proposed implementation address and its source code as soon as the upgrade is scheduled — not only on-chain via the timelock event, but in a human-readable post (Discord, governance forum, blog) explaining what changed and why. Users cannot evaluate the upgrade if all they see is an opaque bytecode hash. Second, simulate the upgrade against a forked mainnet state before the timelock window opens. The simulation produces a diff of every storage slot the upgrade touches; reviewers can audit that diff rather than re-reading the Solidity source. Both practices add hours of work to the upgrade process, which is precisely the point — slowing upgrades down is the security feature.

### Common pitfalls

- **Forgetting `_disableInitializers()` in the constructor.** Lets an attacker take over the implementation contract directly.
- **Reusing storage slots.** Reordering, renaming with a type change, or deleting fields without a gap corrupts state. The Foundry plugin catches this; do not bypass it.
- **Changing variable types between versions.** `uint128` to `uint256` looks innocent but changes how the slot is packed. Treat any type change as a storage migration, not a refactor.
- **Forgetting to shrink the storage gap.** Adding a new field without subtracting from `__gap` shifts everything after the gap. Always update both in the same diff.
- **Removing `_authorizeUpgrade` in a v2 UUPS upgrade.** The proxy cannot be upgraded again. There is no recovery.
- **Granting `UPGRADER_ROLE` directly to an EOA "for now".** That EOA is one phishing email from being able to replace your protocol with arbitrary bytecode.
- **Skipping the OpenZeppelin Foundry plugin in CI.** The plugin is the canonical defense against storage and authorization bugs; running it manually means somebody will eventually forget.
- **Calling `selfdestruct` from an implementation, even by accident.** `delegatecall` runs the destruct in the proxy's context, deleting the proxy. The infamous Parity multisig freeze hit this exact pattern. Never include `selfdestruct` in an upgradeable implementation.
- **Letting the deployer EOA temporarily hold `UPGRADER_ROLE` after deploy.** The brief window between deploy and role transfer is exactly when phishing campaigns target your team. Grant `UPGRADER_ROLE` to the timelock from the constructor's `initialize` call, never to the deployer.
- **Treating the implementation as "internal."** Block explorers index implementation addresses and verify their source independently of the proxy. Anyone can call them directly. Assume every external function on the implementation is reachable by an attacker — and use `_disableInitializers` accordingly.

See `web3-access-control.md` for `UPGRADER_ROLE` and `TimelockController` wiring, `web3-security.md` for the broader security posture this upgrade model sits inside, and `web3-audit-workflow.md` for the upgrade-specific checks an auditor will run against your storage layout, initializer, and authorization function.
