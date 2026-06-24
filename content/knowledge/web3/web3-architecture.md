---
name: web3-architecture
description: >-
  EVM smart-contract architecture decisions — modular vs monolithic decomposition, OpenZeppelin baseline, state
  minimization, library vs inheritance, diamond pattern caveats, and external-call discipline
topics:
  - web3
  - architecture
  - solidity
  - evm
  - openzeppelin
volatility: evolving
last-reviewed: 2026-06-24
version-pin: OpenZeppelin Contracts 5.x; Solidity 0.8.x
sources:
  - url: https://docs.openzeppelin.com/contracts/5.x/
    hash: sha256:c838a1fbeac6dace7a85a3aecff4e6f564b19e4f13039d41d34c3b91a42c3358
    retrieved: 2026-06-24
  - url: https://ethereum.org/en/developers/docs/smart-contracts/
    hash: sha256:4e6d80e22802251aac3f8a74d2a59c8dff2f6783ee9697d932f0ddd49a1531c8
    retrieved: 2026-06-24
  - url: https://consensys.github.io/smart-contract-best-practices/
    hash: sha256:c36192265bf3322e75552f73527415de8a6b34b481ec6b2cfa2e12b52b329dbe
    retrieved: 2026-06-24
---

This overlay targets **EVM** chains — Ethereum mainnet, the major L2s (Arbitrum, Optimism, Base, zkSync, Polygon zkEVM), and other EVM-compatible execution layers running Solidity 0.8.x bytecode. Non-EVM ecosystems (Solana / Anchor, Aptos and Sui / Move, Cosmos / CosmWasm) have fundamentally different storage, account, and execution models and are deliberately out of scope here; a future W3-2 overlay may cover dApp / frontend work and non-EVM runtimes. Architecture in this doc means the contract-side decisions a protocol lead makes before the first `forge build`: how to decompose, what to inherit, how state is laid out, and where the trust boundaries fall.

## Summary

Decompose by responsibility, not by cleverness: a protocol over ~500 LOC almost always wants multiple contracts (each under 500 LOC of behavior), a small single-purpose contract is fine as one file. Inherit from `OpenZeppelin` for every standard primitive — ERC20, ERC721, `AccessControl`, `Pausable`, `ReentrancyGuard` — never re-implement them. Pack storage so each `struct` fits the fewest 32-byte slots possible and mark deploy-time constants `immutable` (or `constant` for compile-time literals) — every saved SLOAD is real money for users. Reach for libraries when logic is pure utility callable from many contracts, and for inheritance when you want shared state and roles. Avoid the `diamond pattern` (EIP-2535) unless you genuinely hit the 24 KB code-size limit or need pluggable facets — it adds storage-layout and audit complexity most protocols never need.

## Deep Guidance

### EVM-only scope

This doc assumes Solidity ≥0.8.20 targeting EVM bytecode. L2-specific quirks (precompile differences, calldata pricing on rollups, account abstraction on zkSync) are noted only where they change a decomposition decision. If your protocol must run on Solana or Move-based chains, the entire decomposition vocabulary here — contracts, libraries, inheritance, slots — does not translate, and you should not generalize from this overlay. The reverse direction is roughly safe: most of what works on Ethereum mainnet works on any EVM L2, with gas constants and finality assumptions adjusted; consult chain-specific docs before deploying anything that depends on `block.timestamp` granularity, opcode pricing, or `msg.sender == tx.origin`.

### Modular vs monolithic decomposition

The default rule is brutal and useful: **if the contract is over ~500 lines of behavior, split it.** Above that line, auditors stop being able to hold the whole thing in their head, your test surface explodes, and you start brushing against the 24 KB deployed-code limit. Below it, one contract is almost always the right answer — cross-contract calls cost ~2,600 gas of `CALL` overhead plus calldata, and every external surface is a new trust boundary you must reason about. Split along responsibility lines: a vault, an oracle adapter, and a fee router are three contracts; a single ERC20 with a mint guard is one. Per-contract LOC budget keeps each component reviewable, but more importantly it forces you to name the boundary — what does this contract own, what does it merely call?

The tradeoffs to weigh consciously:

| Concern             | Monolithic                                  | Modular                                       |
|---------------------|---------------------------------------------|-----------------------------------------------|
| Gas per user action | Cheapest — internal calls are JUMP          | +2,600 gas per `CALL` plus calldata          |
| Upgradeability      | All-or-nothing redeploy                     | Swap one module without touching others       |
| Audit surface       | One file, one storage layout                | Multiple interfaces, every boundary is review |
| Code-size headroom  | Tight against 24 KB EIP-170 limit           | Each contract has its own 24 KB budget        |

A useful heuristic: if two responsibilities never share storage and could be developed by different people without merge conflicts, they should be different contracts.

Concrete worked example — a yield vault that supports multiple collateral types and a single fee recipient. Three contracts beat one:

- `Vault.sol` — accounting for shares, deposits, withdrawals, share-price math. ERC4626-shaped.
- `StrategyRegistry.sol` — maps each collateral asset to an approved strategy adapter; governance can rotate strategies without touching the vault.
- `FeeRouter.sol` — collects performance fees, splits between protocol treasury and stakers; can be swapped to change fee policy.

If you wrote that as one contract you would have ~800 lines, three independent governance flows tangled together, and every audit finding in one area would force re-review of the whole file. Three contracts gives you a 300 / 250 / 150 LOC split where each piece has one job and one storage layout. The gas cost of the extra `CALL`s — call it ~5,000 gas per deposit — is real but small relative to the SLOAD-heavy share accounting that dominates the transaction.

### OpenZeppelin as baseline

Never re-implement standard primitives. `OpenZeppelin` contracts have been audited dozens of times, formally verified in pieces, and are the de-facto reference implementations auditors expect to see. Inherit, don't fork:

```solidity
// src/Vault.sol
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vault is ERC20, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    // ...
}
```

The mental model: OZ is your standard library. If you find yourself writing `_transfer` or a `nonReentrant` modifier from scratch, stop. See `web3-access-control.md` for how role partitioning composes with `AccessControl`.

Pin OZ to an exact minor version in `foundry.toml` (or `package.json` for Hardhat) and bump it deliberately — OZ ships breaking changes between majors (v4 → v5 reworked `AccessControl` initialization, removed `Ownable` defaults, and changed several event signatures). Track their security advisories; an audited OZ release is one of the few dependencies whose patch notes you should actually read on update. If you must override OZ internals, do so by overriding `_update`, `_mint`, or other documented hooks rather than copy-pasting the contract — every fork loses the next round of fixes.

### State minimization

Every storage slot is 20,000 gas to write the first time and 2,900 gas to update — at $50 ETH gas this is real money per user action. Two disciplines pay for themselves immediately. **First, pack structs to fit slots.** The EVM lays out storage in 32-byte (256-bit) slots; smaller types share a slot when declared contiguously:

```solidity
// 1 slot total — uint64 + uint64 + uint128 = 256 bits
struct Position {
    uint64 openedAt;        // timestamp fits in uint64 until year 584942417355
    uint64 lastUpdatedAt;
    uint128 amount;         // up to ~3.4e38 — plenty for most token amounts
}

// vs. the naive 3-slot version
struct PositionBad {
    uint256 openedAt;
    uint256 lastUpdatedAt;
    uint256 amount;
}
```

**Second, use `immutable` for values fixed at deploy and `constant` for compile-time literals.** Both live in bytecode, not storage, so reads cost ~3 gas instead of ~2,100:

```solidity
contract Vault {
    address public immutable asset;          // set once in constructor
    uint256 public constant MAX_FEE_BPS = 500; // compile-time

    constructor(address _asset) {
        asset = _asset;
    }
}
```

A third habit worth naming: **prefer events over storage for log-shaped data**. If a value is consumed off-chain (UI, indexer, subgraph) and never read by another contract, emit an event instead of writing storage. Events are roughly an order of magnitude cheaper than `SSTORE` and don't bloat the state your node operators carry forever.

One subtlety to watch: struct packing only works when fields are declared in order from smallest to largest within a 32-byte slot, and only for **value types** (uints, addresses, bools, bytes32). Dynamic types (`string`, `bytes`, arrays, mappings) always occupy their own slot regardless of position, so don't try to "pack" them. Use `forge inspect <Contract> storage-layout` (Foundry) or `hardhat-storage-layout` to dump the actual layout and verify your packing assumptions before you ship — guessing is how you end up with a 4-slot struct you thought was 1.

### Libraries vs inheritance

Solidity offers two reuse mechanisms and they answer different questions. A `library` is pure logic — no state, no inheritance hierarchy, called via `DELEGATECALL` (for `external` library functions) or inlined at compile (for `internal`). Use libraries when the logic is stateless and called from many contracts: math helpers, byte manipulation, signature recovery. The `using X for Y` syntax attaches library functions to a type for ergonomic call sites:

```solidity
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Vault {
    using SafeERC20 for IERC20;

    function withdraw(IERC20 token, address to, uint256 amount) external {
        token.safeTransfer(to, amount); // resolves to SafeERC20.safeTransfer(token, to, amount)
    }
}
```

Use **inheritance** when you want shared state, roles, modifiers, or a partial implementation — `ERC20`, `AccessControl`, and `Pausable` all carry storage and require inheritance. Rule of thumb: stateless and reusable → library; stateful and specializable → base contract. Beware deep inheritance chains (more than three levels): C3 linearization, function-override resolution, and storage-layout ordering all become harder to reason about, and auditors will flag it. If your hierarchy looks like a Java class tree, refactor toward composition with internal helpers instead.

Two further library-design notes worth remembering. **`internal` library functions are inlined** at the call site, so they cost nothing extra in deployed bytecode beyond the inlined ops — they are essentially free abstraction. **`external` library functions** are deployed as a separate contract and invoked via `DELEGATECALL`, which means they share the caller's storage layout and execution context but live at their own address; you must link the library at deployment time. For most utility code (math helpers, conversion, packing), `internal` is what you want — keep external libraries for genuinely large logic blocks where the deployment-size savings justify the linking step.

### Diamond pattern (EIP-2535)

The diamond pattern routes calls through a proxy to one of many "facet" contracts via a function-selector table, letting a single address expose effectively unlimited code. It is the answer when you genuinely need pluggable facets — large protocols like Aave v3 use related patterns — or when you are wedged against the **24 KB EVM contract-size limit** (EIP-170). For everything else it is over-engineering with real cost: storage layout is now governed by namespaced "diamond storage" patterns that auditors must reason about, upgrade flows multiply, and tooling support is uneven. Default to plain proxies or no upgradeability at all (see `web3-upgradeability.md`), and only adopt the `diamond pattern` after you have written down the specific facets you need and confirmed a simpler decomposition won't fit. Premature diamonds have shipped more bugs than they have prevented.

A simple checklist before reaching for a diamond:

1. Have you tried splitting into 2–3 plain contracts that share an interface? Most "we need a diamond" intuitions dissolve here.
2. Is the 24 KB code-size limit a *current* problem, or a hypothetical future one? Don't pre-pay for a complexity tax you may never owe.
3. Do you actually need to add new facets after deployment, or do you just want clean module boundaries? The latter is better served by separate contracts with explicit interfaces.
4. Does your audit firm have diamond expertise on the team you'd hire? If not, you are also paying for their learning curve.

### External call discipline

Every `CALL` to another contract is a trust boundary — execution leaves your codebase and re-enters at the callee's whim. Two disciplines: type your external interactions through **interfaces**, not concrete types, and treat every external call as a reentrancy and revert risk (see `web3-security.md` for Checks-Effects-Interactions). Interfaces decouple deployment order, let you point at a mock in tests, and document the API surface in one place:

```solidity
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUniswapV2Pair {
    function getReserves() external view returns (uint112, uint112, uint32);
}

contract Adapter {
    IERC20 public immutable token;
    IUniswapV2Pair public immutable pair;
    // ...
}
```

Public/external functions are your API; everything else stays `internal` for gas (cheaper than `public`/`external` jumps) and composability. Document the external surface with NatSpec — `@notice`, `@param`, `@return` — because that is what auditors and integrators read first. For oracles and any data source you don't control, see `web3-oracles-and-external-data.md` for staleness, deviation, and fallback discipline.

A final architectural habit: write the **interface file first**. Before implementing `Vault`, write `IVault.sol` with the function signatures, NatSpec, and custom errors you intend to expose. That file becomes the contract between your code and every integrator, and reviewing it before implementation forces you to commit to an API surface you can defend in audit. The implementation may evolve; the interface should not, except by versioning a new one alongside it.

Three concrete external-call rules worth codifying as review checks:

1. **Never `.call{value: x}("")` without checking the return value.** Solidity 0.8 will not auto-revert on a failed low-level call; you must `require(success, "transfer failed")` or use a custom error. Better still, use OZ's `Address.sendValue` which does it for you.
2. **Wrap any function that hands execution to an external contract with `nonReentrant`**, even if you "know" the callee is trusted. Trust assumptions rot — an audited token today becomes a callback-injecting fork tomorrow.
3. **Pull, don't push.** When sending value or tokens to a user-supplied address, prefer the pull-payment pattern (record an entitlement, let them withdraw) over pushing in the same transaction. One failing recipient cannot then brick a batch operation for everyone else. `web3-security.md` covers this in depth.

Taken together, the architecture decisions in this doc compose: a modular layout makes role partitioning (`web3-access-control.md`) tractable, immutable interfaces make upgrades (`web3-upgradeability.md`) safer, and disciplined external-call boundaries make oracle integration (`web3-oracles-and-external-data.md`) something you can actually reason about. The point is not to memorize patterns — it is to make the constraints of the EVM (gas, code size, immutability, public mempool) visible in the shape of the code itself, so they show up at design time rather than during an audit two weeks before mainnet.
