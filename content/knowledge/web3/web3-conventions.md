---
name: web3-conventions
description: Solidity style and convention discipline for smart-contract teams — forge fmt as single formatter, NatSpec on public functions, pinned pragma, custom errors over string reverts, naming and ordering rules
topics: [web3, conventions, solidity, forge-fmt, natspec]
volatility: stable
last-reviewed: null
version-pin: 'Solidity 0.8.x'
sources:
  - url: https://ethereum.org/en/developers/docs/smart-contracts/languages/
  - url: https://consensys.github.io/smart-contract-best-practices/
---

Solidity is brittle. The compiler is fast and unforgiving, the gas model rewards terseness, and the deployment surface is immutable — every style drift you tolerate during development eventually becomes a bytecode-determinism question, an audit comment, or a bug nobody can patch. The conventions below are the ones enforced by `forge fmt` and code review at every serious shop; encode them as CI gates and they stop being judgment calls.

## Summary

Use `forge fmt` as the single formatter for any Foundry project — it replaces prettier-solidity-plugin and is the only formatter that tracks the official Solidity style guide. Require `NatSpec` (`@notice`, `@dev`, `@param`, `@return`) on every public and external function; this is what wallets and block explorers render to users. Pin the `pragma` exactly (`pragma solidity 0.8.24;`) instead of carets — reproducible bytecode is a security property, not a preference. Prefer custom errors to string reverts: cheaper, introspectable, and trivially decoded by clients. Follow PascalCase contracts, camelCase functions/variables, UPPER_SNAKE_CASE constants, leading-underscore private vars, and past-tense event names — these match the [official style guide](https://docs.soliditylang.org/en/latest/style-guide.html) and what `forge fmt` enforces structurally.

## Deep Guidance

### Pragma and license

Every Solidity file starts with an SPDX license identifier and an exact pragma. The license header is required by `solc` and surfaces in verified-source explorers; the pinned pragma is what makes your deployed bytecode reproducible months later.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
```

Do not use `pragma solidity ^0.8.0;` in deployable contracts. A caret range lets `solc` 0.8.24 and 0.8.27 produce different bytecode for the same source, which breaks deterministic deployments (CREATE2 addresses), audit reproduction, and source verification on chains with strict matching. Pin to a specific patch version, commit `foundry.toml` with the same `solc_version`, and bump deliberately. Use `// SPDX-License-Identifier: MIT` for permissive code and `// SPDX-License-Identifier: AGPL-3.0` for protocol code that should stay open.

### NatSpec on public functions

NatSpec is not a documentation nicety — it is the contract the user sees. Wallets like Rabby, Frame, and Safe render `@notice` strings during transaction confirmation, and Etherscan surfaces NatSpec on verified contracts. Missing NatSpec on a public function means the user signs a transaction with no human-readable description.

```solidity
/// @title Vault
/// @notice Holds user deposits and accrues yield.
contract Vault {
    /// @notice Deposit `amount` of the underlying asset and mint vault shares.
    /// @dev Pulls tokens via `transferFrom`; caller must approve first.
    ///      Reverts with `ZeroAmount` if `amount == 0`.
    /// @param amount Amount of underlying to deposit, in token decimals.
    /// @param receiver Address that will receive the minted shares.
    /// @return shares Number of vault shares minted to `receiver`.
    function deposit(uint256 amount, address receiver)
        external
        returns (uint256 shares)
    {
        if (amount == 0) revert ZeroAmount();
        // ...
    }
}
```

Rules:

- `@notice` is mandatory on every `public`/`external` function — it is the end-user description.
- `@dev` is for integrators reading the source; explain invariants, side effects, and revert conditions here.
- `@param` and `@return` are mandatory whenever the function has parameters or named returns.
- `@inheritdoc` on overrides — do not copy-paste the parent's NatSpec.
- Internal/private functions can use `//` comments; reserve `///` for documented interfaces.

### Naming and ordering

The Solidity style guide names the categories; `forge fmt` enforces the ordering within a contract.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract Vault {
    // 1. State variables
    uint256 public constant MAX_FEE_BPS = 500;
    address public owner;
    uint256 private _totalShares;

    // 2. Events
    event Deposited(address indexed user, uint256 amount, uint256 shares);

    // 3. Errors
    error ZeroAmount();
    error InsufficientBalance(uint256 available);

    // 4. Modifiers
    modifier onlyOwner() {
        if (msg.sender != owner) revert InsufficientBalance(0);
        _;
    }

    // 5. Constructor
    constructor(address _owner) {
        owner = _owner;
    }

    // 6. receive / fallback (none here)

    // 7. external -> public -> internal -> private functions
    function deposit(uint256 amount) external returns (uint256) { /* ... */ }
    function totalShares() public view returns (uint256) { return _totalShares; }
    function _mintShares(address to, uint256 shares) internal { /* ... */ }
}
```

Naming rubric:

- **Contracts / libraries / interfaces**: `PascalCase`. Interfaces prefixed with `I` (`IERC20`, `IVault`).
- **Functions / state variables / locals**: `camelCase` (`totalShares`, `computeFee`).
- **Constants and immutables**: `UPPER_SNAKE_CASE` (`MAX_FEE_BPS`, `WETH`).
- **Private / internal storage**: single leading underscore (`_totalShares`, `_pendingWithdrawals`). Function parameters that shadow state vars also take a leading underscore (`address _owner`).
- **Custom errors**: `PascalCase`, descriptive (`InsufficientBalance(uint256 available)` not `ERR_BAL`).
- **Events**: `PascalCase`, past-tense verb (`Deposited`, `OwnerUpdated`, `Withdrawn`) — events describe something that already happened.

### `forge fmt` as single formatter

Foundry ships its own formatter: `forge fmt`. It is the only formatter that tracks the Solidity style guide in lockstep with `solc` releases, and it eliminates the `prettier` + `prettier-plugin-solidity` + `solhint` + `solhint-prettier` dependency stack that plagued older projects.

```bash
forge fmt              # format every .sol file in src/, test/, script/
forge fmt --check      # CI mode: exit non-zero if anything is unformatted
forge fmt path/to/Vault.sol   # single file
```

Wire `forge fmt --check` into CI and a pre-commit hook. Configure it in `foundry.toml`:

```toml
[fmt]
line_length = 120
tab_width = 4
bracket_spacing = true
int_types = "long"          # uint256, not uint
quote_style = "double"
number_underscore = "thousands"
```

If you want lint rules beyond formatting (e.g. flag `tx.origin`, missing visibility, reentrancy patterns), add `solhint` with a minimal `.solhint.json` — but do not duplicate formatting rules between them. Let `forge fmt` own layout; let `solhint` own semantics.

### Custom errors

`require(condition, "string message")` was the only revert pattern before Solidity 0.8.4. Custom errors are strictly better: cheaper to deploy and call, encode arguments, and decode reliably in clients.

```solidity
// Before — string revert
function withdraw(uint256 amount) external {
    require(amount > 0, "Vault: zero amount");
    require(balances[msg.sender] >= amount, "Vault: insufficient balance");
    // ...
}

// After — custom errors
error ZeroAmount();
error InsufficientBalance(uint256 requested, uint256 available);

function withdraw(uint256 amount) external {
    if (amount == 0) revert ZeroAmount();
    uint256 bal = balances[msg.sender];
    if (bal < amount) revert InsufficientBalance(amount, bal);
    // ...
}
```

Benefits:

- **Gas**: each unique revert string costs ~50 bytes of deployed bytecode plus runtime memory expansion; custom errors are a 4-byte selector.
- **Introspection**: clients (ethers, viem, foundry traces) decode `InsufficientBalance(100, 42)` directly. String reverts are opaque blobs.
- **Refactor safety**: rename the error type and the compiler finds every caller; rename a string and nothing breaks until production.

Reserve `require` for legacy interface compatibility or when you genuinely need the string in a chain explorer; everywhere else, define a typed error.
