---
name: web3-gas-optimization
description: >-
  Practical EVM gas optimization — measure first with forge snapshot, storage packing, unchecked loops, calldata vs
  memory, immutable, external-call discipline, and CI regression checks
topics:
  - web3
  - gas-optimization
  - solidity
  - foundry
volatility: evolving
last-reviewed: 2026-06-25
version-pin: Solidity 0.8.x
sources:
  - url: https://ethereum.org/en/developers/docs/gas/
    hash: sha256:b8868cf263ebaf6c37f23fc0f8940bcfee6a888573f3fbec5833b7bb01aa2616
    retrieved: 2026-06-25
  - url: https://ethereum.org/en/developers/docs/evm/opcodes/
    hash: sha256:2dde34ba64624664432b2fce61f6e913ef61a3a7ef942f01244b91525f17c98e
    retrieved: 2026-06-25
  - url: https://consensys.github.io/smart-contract-best-practices/
    hash: sha256:c36192265bf3322e75552f73527415de8a6b34b481ec6b2cfa2e12b52b329dbe
    retrieved: 2026-06-25
---

Gas matters because every operation a user pays for on Ethereum mainnet is real dollars, and on L2s the calldata you post to L1 is the dominant cost driver — both directions are visible in your users' wallets. But most "optimizations" save under 1% of a transaction's gas and cost clarity in exchange; that trade is rarely worth it. The point of this doc is to give you the small set of techniques that do pay for themselves, the discipline to measure before applying them, and the CI plumbing that catches regressions before they ship. If a section here ever recommends a change that obscures the code without producing a measurable saving, ignore it.

## Summary

Measure first — `forge snapshot` and `forge test --gas-report` tell you where the gas actually goes, and most contracts have two or three hot paths and a long tail that does not matter. The big wins come from storage layout (pack structs into fewer 32-byte slots) and avoiding storage writes altogether (emit events, use `immutable`/`constant`, cache reads in memory). The free wins come from `calldata` over `memory` on external functions, `external` over `public` visibility where appropriate, and custom errors over revert strings. Use `unchecked { ... }` only in arithmetic you have proved safe — typically a bounded loop counter — never as a default. Wire `forge snapshot --check` into CI so a 5% gas regression fails the build instead of slipping in unnoticed. Never sacrifice clarity or security for fewer than ~100 gas; that bar removes 80% of cargo-cult "optimizations" from your codebase before they land.

## Deep Guidance

### Measure first

Before touching any code in the name of gas, generate a baseline. Foundry gives you three tools that together answer "where is the gas going":

```bash
forge snapshot                      # writes .gas-snapshot per test
forge test --gas-report             # per-function min/avg/median/max table
forge inspect Vault storageLayout   # exact slot/offset map for each state var
```

The snapshot file is your baseline; commit it. The gas report tells you which functions dominate user cost (the ones called every transaction matter; an admin function called once at deployment does not). The storage layout dump is the source of truth for whether your packing actually worked — guessing is how you ship a 4-slot struct you thought was 1. Only optimize the functions that show up in user-flow traces; everything else is wasted effort.

A useful discipline: before applying any optimization, run `forge snapshot` on `main`, apply the change on a branch, re-run, and `diff` the two snapshots. If the saving is under ~100 gas per call on a function called once per user action, revert the change and keep the clearer code. If the saving is 1,000+ gas on a hot path, the change has paid for itself and probably for the next reviewer's time too. Anything in between is a judgement call — and the judgement should default to clarity unless the function is called in a batched flow where 200 gas times 1,000 iterations becomes meaningful.

### Storage packing

Storage costs dominate everything else on the EVM: 20,000 gas for a first-time `SSTORE`, 2,900 to update, 2,100 for the cold `SLOAD` that precedes it. Packing multiple state variables into one 32-byte slot is the single largest optimization most contracts can apply, and the compiler will not reorder fields for you — declaration order matters.

```solidity
// 1 slot — uint64 + uint64 + uint128 = 256 bits
struct Position {
    uint64 openedAt;
    uint64 lastUpdatedAt;
    uint128 amount;
}

// 3 slots — naive
struct PositionBad {
    uint256 openedAt;
    uint256 lastUpdatedAt;
    uint256 amount;
}
```

`uint64` holds timestamps until year 584,942,417,355; `uint128` holds ~3.4e38, plenty for any token amount. Dynamic types (`string`, `bytes`, arrays, mappings) always take their own slot regardless of position, so do not try to "pack" them.

Two subtleties worth naming. First, mappings of structs do not benefit from packing across keys — each value occupies its own slots starting at `keccak256(key . slot)`, so the packing only saves gas when the struct is read or written as a unit. Second, packed fields share a slot, which means a write to one field is implemented as a full-slot read-modify-write — the SLOAD cost is paid even if you only meant to change one field. Net it is still cheaper than three separate slots, but if a single packed field is updated far more often than its neighbors, consider splitting it out. Use `forge inspect Vault storageLayout` and `web3-architecture.md` together when deciding the final layout.

### `unchecked { ... }` in safe loops

Post-Solidity-0.8.0, arithmetic operations include overflow checks by default — safe, and ~30-50 gas per op. In tight loops where overflow is provably impossible (e.g., `i` bounded by `array.length`), wrap the increment in `unchecked` to skip the check:

```solidity
function sum(uint256[] calldata xs) external pure returns (uint256 total) {
    uint256 len = xs.length;
    for (uint256 i = 0; i < len;) {
        total += xs[i];
        unchecked { ++i; }
    }
}
```

Use `unchecked` only where you have written down why overflow cannot occur. A loop counter bounded by an in-memory array length qualifies; an accumulator over user-supplied values does not. The rule of thumb that has held up across audits: if a colleague reading the diff cannot tell you in one sentence why the math in the `unchecked` block cannot overflow, the block should not exist. Compromising overflow protection for ~40 gas on a path that runs once per transaction is not worth the rounding-error severity vulnerability you ship if the proof is wrong. See `web3-security.md` for the broader stance on never optimizing at security's expense.

### `calldata` vs `memory`

For `external` functions taking arrays or strings, declare the parameter `calldata` rather than `memory`. `calldata` is read directly from the transaction payload at no copy cost; `memory` forces a copy that scales linearly with input size:

```solidity
function processBatch(uint256[] calldata ids) external {
    uint256 len = ids.length;
    for (uint256 i = 0; i < len;) {
        _process(ids[i]);
        unchecked { ++i; }
    }
}
```

This is a free win — no clarity cost, real gas saving, and the compiler will refuse to let you mutate calldata so it doubles as an immutability hint.

For large arrays the savings compound: copying a 100-element `uint256` array from calldata into memory is ~6,000 gas (~3 gas per byte over 3,200 bytes plus memory expansion); reading the same array directly from calldata is free at the boundary, you only pay for each element you actually touch. On L2s where calldata is the dominant cost component, this difference is multiplied by the rollup's calldata pricing — Optimism and Arbitrum both compress calldata before posting to L1, but the in-EVM read cost still favors calldata over memory. Default to `calldata` for every `external` function parameter; only switch to `memory` if you need to mutate the value, in which case you should also question whether mutation is the right pattern.

### Function visibility (`external` vs `public`)

A function marked `public` must be callable both externally and internally, which means the compiler generates a memory copy of arguments for the internal call path. `external` skips that copy. If a function is never called from inside the contract, mark it `external` — about 24 gas per call, plus the calldata-vs-memory savings on array arguments.

The corollary: when one of your `public` functions needs to be called from another function in the same contract, refactor the body into an `internal` helper and have both the `external` entrypoint and the internal caller go through the helper. Two visibility tiers (`external` for the API, `internal` for shared logic) is almost always the right shape; `public` is the lazy compromise that costs gas without buying clarity.

### `immutable` and `constant`

Values fixed at deploy time belong in `immutable`; compile-time literals belong in `constant`. Both are inlined into bytecode and read for ~3 gas, against ~2,100 for a cold `SLOAD`:

```solidity
contract Vault {
    address public immutable asset;
    uint256 public constant MAX_FEE_BPS = 500;

    constructor(address _asset) {
        asset = _asset;
    }
}
```

If a value never changes after deployment and you wrote it as a regular state variable, you are paying SLOAD on every read forever. Fix that before any other optimization.

`immutable` works for any value type fixed in the constructor — addresses, integers, `bytes32`. `constant` is stricter: the value must be expressible as a compile-time literal, no constructor logic allowed. Strings and bytes cannot be `immutable` in current Solidity (they require dynamic storage); for those cases either use a `bytes32` hash if you only need to check equality, or accept the SLOAD cost. When upgrading from a regular state variable, the storage slot is freed and the constructor accepts the value — a deployment-level change, not a runtime one, so existing deployments are unaffected until you redeploy.

### Avoid unbounded loops

Ethereum's per-block gas limit (~30M as of 2024) caps how much work any transaction can do. Looping over a user-controlled array is therefore a denial-of-service vector — an attacker grows the array until your contract's critical function exceeds the block limit and bricks. Replace with pull-payments (record an entitlement, let each user withdraw their own) or cursor pagination (process a bounded chunk per call). See `web3-security.md` for the pull-payment pattern in full.

This rule has no exception. Even if today's array is bounded by your own writes, the next refactor may expose a write path you did not anticipate; even if every iteration looks cheap, a single malicious entry can blow up the cost. The DoS surface is so cheap to introduce and so expensive to recover from (typically a migration to a new contract) that "but the loop is small in practice" is not a defense — it is a deferred incident.

### Custom errors and events vs storage

Custom errors replace revert strings with a 4-byte selector and ABI-encoded args, saving ~50 gas per emit and shrinking bytecode (covered in `web3-conventions.md`). A related habit: when data is consumed off-chain — by your UI, a subgraph, or an indexer — emit an event instead of writing storage. Events cost ~375 gas plus ~8 gas per byte of data; an `SSTORE` to a new slot is 20,000. Use storage when another contract reads the value; use events when only humans and indexers do.

```solidity
error InsufficientBalance(uint256 requested, uint256 available);

event Deposit(address indexed user, uint256 amount, uint64 timestamp);

function deposit(uint256 amount) external {
    if (amount > balances[msg.sender]) {
        revert InsufficientBalance(amount, balances[msg.sender]);
    }
    emit Deposit(msg.sender, amount, uint64(block.timestamp));
}
```

### Caching and short-circuit ordering

Reading the same storage slot multiple times in one function pays the SLOAD cost each time after the first warm access (~100 gas vs 2,100 cold). Cache into a local variable:

```solidity
function applyFee(address user) external {
    uint256 _fee = fee;                  // 1 SLOAD
    balances[user] -= _fee;              // local read, no SLOAD
    treasury += _fee;
}
```

And in conditional expressions, order cheap checks before expensive ones — `&&` and `||` short-circuit, so a failing cheap check skips the expensive one:

```solidity
if (amount > 0 && _externalOracle.price() > minPrice) { ... }
```

### CI: `forge snapshot --check`

Gas regressions slip in silently unless CI catches them. Wire `forge snapshot --check` into your pipeline — it diffs the committed `.gas-snapshot` against the current run and exits non-zero on regression beyond the configured tolerance.

```yaml
# .github/workflows/ci.yml
- name: Gas regression check
  run: forge snapshot --check --tolerance 5
```

Bump the snapshot deliberately when an intentional change costs gas: re-run `forge snapshot`, review the diff in the PR, commit. The discipline is the same as commit-the-lockfile — the snapshot is part of the contract's review surface, not a build artifact. See `web3-testing.md` for the full Foundry test workflow this plugs into.

Taken together, these techniques compose into a small playbook that pays for itself on every deployment: measure to find the hot paths, pack storage and reach for `immutable` to eliminate the SLOAD-heavy ones, use `calldata` and `external` to harvest the free wins, and let CI guard the result. Everything else — the clever bit-twiddling tricks, the assembly inlining, the "I saved 12 gas by reordering this branch" patches — should be viewed with suspicion until a benchmark and a reviewer agree the savings are worth the loss of clarity. Gas optimization is a tool; clarity is the asset. Spend the tool on the asset only when the receipt justifies it.
