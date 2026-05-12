---
name: web3-testing
description: Testing discipline for Foundry smart contracts — unit, fuzz, invariant, and fork tests with coverage and gas snapshots wired into CI
topics: [web3, testing, foundry, fuzz, invariants, fork-tests]
---

Smart contracts must work the first time. Once deployed, a bug is a bounty for the next adversary who reads your storage layout, and "we'll patch it next sprint" is not an option when the only patch path is a migration to a brand-new address. Foundry's `forge test` runner makes property-level confidence cheap: unit tests pin known behavior, fuzz tests stress the boundaries you forgot, invariants assert the laws that must hold across every state sequence, and fork tests replay against real mainnet state. Use all four — none of them substitutes for any of the others.

## Summary

Treat Foundry testing as four layers with distinct jobs. Use **unit tests** (`test_` prefix, `Test`-extended contracts) for deterministic state-change, event, and revert assertions. Use **fuzz tests** (`testFuzz_` prefix) to let Foundry generate adversarial inputs; constrain with `vm.assume` and bump `[fuzz] runs` when the property warrants. Use **invariant tests** (`invariant_` functions with a `Handler` contract) to assert system-wide properties that must hold across every reachable state. Use **fork tests** (`--fork-url` with a pinned block number) as the contract equivalent of e2e — replay against real protocols, real liquidity, real attackers. Wire `forge coverage` and `forge snapshot --check` into CI so coverage and gas regressions fail the build.

## Deep Guidance

### Unit tests

Every external function in a contract has at least three unit tests: happy path, every revert branch, and every emitted event. Foundry's `Test` base contract supplies `vm.expectRevert`, `vm.expectEmit`, and `vm.prank` for the three; `setUp()` deploys fresh contracts before each test so state never leaks across tests.

```solidity
// test/Vault.t.sol
import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";

contract VaultTest is Test {
    Vault vault;
    address alice = makeAddr("alice");

    event Deposited(address indexed user, uint256 amount);

    function setUp() public {
        vault = new Vault();
        vm.deal(alice, 10 ether);
    }

    function test_Deposit_IncrementsBalance() public {
        vm.prank(alice);
        vault.deposit{value: 1 ether}();
        assertEq(vault.balanceOf(alice), 1 ether);
    }

    function test_Deposit_EmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit Deposited(alice, 1 ether);
        vm.prank(alice);
        vault.deposit{value: 1 ether}();
    }

    function test_RevertWhen_DepositZero() public {
        vm.prank(alice);
        vm.expectRevert(Vault.ZeroAmount.selector);
        vault.deposit{value: 0}();
    }
}
```

Name tests after the behavior, not the function: `test_Deposit_IncrementsBalance` and `test_RevertWhen_DepositZero` read as sentences in CI output. Use `makeAddr("alice")` instead of hard-coded addresses so labels appear in traces. Run with `forge test -vv` locally; bump to `-vvvv` when a failing test needs full call traces.

### Fuzz tests

A fuzz test takes parameters and Foundry feeds it pseudo-random values — 256 runs by default. The job is to encode a property that must hold for every input in the valid range, then let the fuzzer try to break it. Use `vm.assume` to reject inputs outside the domain (overflow, zero address) without polluting the test body with conditionals.

```solidity
function testFuzz_Deposit_BalanceMatchesInput(uint96 amount) public {
    vm.assume(amount > 0 && amount <= 1000 ether);
    vm.deal(alice, amount);
    vm.prank(alice);
    vault.deposit{value: amount}();
    assertEq(vault.balanceOf(alice), amount);
}
```

Prefer narrow types (`uint96`, `uint128`) when the domain is bounded — they generate more interesting values than `uint256` and naturally avoid overflow. Bump the run count for properties that matter via `foundry.toml`:

```toml
[fuzz]
runs = 1024
max_test_rejects = 65536
```

When a fuzz test fails, Foundry prints the failing seed; rerun with `forge test --fuzz-seed <seed>` to reproduce.

### Invariant tests

Unit and fuzz tests assert behavior for a single call. Invariants assert properties that must hold *across every state sequence the system can reach*. The fuzzer calls random functions on random target contracts with random arguments; after each sequence the invariant function is checked. The classic invariant: total supply equals the sum of balances, no matter what trades, transfers, or deposits happened.

Constrain the actor surface with a `Handler` contract — without one, the fuzzer wastes runs on reverting calls.

```solidity
// test/handlers/VaultHandler.sol
contract VaultHandler is Test {
    Vault public vault;
    uint256 public ghost_totalDeposited;
    address[] public actors;

    constructor(Vault _vault) {
        vault = _vault;
        for (uint256 i; i < 5; ++i) actors.push(makeAddr(string.concat("actor", vm.toString(i))));
    }

    function deposit(uint256 actorSeed, uint96 amount) external {
        address actor = actors[actorSeed % actors.length];
        amount = uint96(bound(amount, 1, 100 ether));
        vm.deal(actor, amount);
        vm.prank(actor);
        vault.deposit{value: amount}();
        ghost_totalDeposited += amount;
    }
}

// test/Vault.invariant.t.sol
contract VaultInvariantTest is Test {
    Vault vault;
    VaultHandler handler;

    function setUp() public {
        vault = new Vault();
        handler = new VaultHandler(vault);
        targetContract(address(handler));
    }

    function invariant_TotalSupplyEqualsSumOfBalances() public view {
        assertEq(address(vault).balance, handler.ghost_totalDeposited());
    }
}
```

Run with `forge test --invariant` or tune via `[invariant] runs`, `depth`, and `fail_on_revert` in `foundry.toml`. Set `fail_on_revert = true` while writing handlers so silent reverts surface; flip to `false` once the handler is realistic.

### Fork tests

A fork test runs against a snapshot of a real chain. This is how you assert "our adapter actually works against the live Uniswap pool" without redeploying the entire DeFi stack to a local node. Always pin the block number — without one, the test will silently behave differently as mainnet state drifts.

```solidity
contract UniswapAdapterForkTest is Test {
    uint256 mainnetFork;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    function setUp() public {
        mainnetFork = vm.createSelectFork(vm.envString("MAINNET_RPC"), 19_000_000);
    }

    function test_SwapAgainstLiveLiquidity() public {
        // ... interacts with real USDC, real Uniswap V3 pool, real prices
    }
}
```

Run with `forge test --fork-url $MAINNET_RPC --fork-block-number 19000000` for one-off fork suites, or use `vm.createSelectFork` per-test for multi-chain tests. Use `vm.makePersistent(address)` to keep a deployed test contract alive across `selectFork` calls. Fork tests are slow — mark them with a separate profile in `foundry.toml` and run nightly, not on every commit.

### Coverage and gas snapshots

`forge coverage` reports line, branch, and function coverage. Target >90% line coverage and >80% branch coverage on `src/` — anything lower means a code path has no test pinning it.

```bash
forge coverage --report lcov --report summary
forge coverage --report lcov --no-match-coverage "(test|script)"
```

Gas costs are part of the contract's contract with the world. `forge snapshot` writes `.gas-snapshot`; commit it. `forge snapshot --check` fails CI when any test's gas cost regresses beyond the tolerance, so an "innocent refactor" that doubles the gas of a hot function gets caught in review.

```bash
forge snapshot                          # record
forge snapshot --check --tolerance 1    # CI gate (1% drift allowed)
forge test --gas-report                 # per-function gas table
```

### Cheatcodes reference

A short list of the cheatcodes you reach for daily, all under the `vm` namespace from `forge-std/Test.sol`:

- `vm.prank(addr)` / `vm.startPrank(addr)` / `vm.stopPrank()` — set `msg.sender` for the next call or a range of calls.
- `vm.expectRevert(selector)` — assert the next call reverts with the given custom-error selector or string.
- `vm.expectEmit(checkTopic1, checkTopic2, checkTopic3, checkData)` — emit the expected event, then make the call.
- `vm.warp(timestamp)` / `vm.roll(blockNumber)` — fast-forward `block.timestamp` and `block.number`.
- `vm.deal(addr, amount)` — set an account's ETH balance directly.
- `vm.assume(condition)` — discard fuzz inputs that violate a precondition.
- `vm.label(addr, "name")` and `makeAddr("name")` — readable addresses in traces.
- `vm.createSelectFork(url, block)` / `vm.makePersistent(addr)` — fork-test plumbing.

When a test gets noisy with cheatcode plumbing, that is a signal to extract a helper into the `Test` base or a shared utility, not to keep stacking lines.
