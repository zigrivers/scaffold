---
name: web3-project-structure
description: >-
  Opinionated Foundry project layout for smart-contract teams — src, test, script, lib, broadcast, foundry.toml,
  remappings — covering test naming, deploy provenance, and what belongs in git
topics:
  - web3
  - project-structure
  - foundry
  - solidity
volatility: stable
last-reviewed: 2026-06-25
version-pin: null
sources:
  - url: https://ethereum.org/en/developers/docs/smart-contracts/
    hash: sha256:4e6d80e22802251aac3f8a74d2a59c8dff2f6783ee9697d932f0ddd49a1531c8
    retrieved: 2026-06-25
  - url: https://docs.openzeppelin.com/contracts/5.x/
    hash: sha256:aee37a66febcf95b90da7c60d6c0a4962fa0d54432f928db48512a1ca4ef0cd2
    retrieved: 2026-06-25
---

A smart-contract repository is read by more adversarial eyes than almost any other kind of codebase: auditors, MEV searchers, frontrunners, and the occasional regulator. Structure carries weight that goes beyond developer ergonomics. An auditor opening the repo for the first time should be able to find the contract under review, its tests, its deploy script, and its on-chain deployment receipts within thirty seconds. Gas snapshots and fuzz seeds need a fixed home so regressions are diffable. Broadcast logs are the audit trail tying a verified contract address back to a commit SHA — losing or muddling them turns "which version is mainnet running?" into a forensic exercise. Foundry's conventions answer most of these questions; this doc records the opinionated version a team should adopt before the first PR lands.

## Summary

A Foundry project has six top-level directories, each answering one question: `src/` (contracts under audit), `test/` (Foundry tests mirroring `src/`), `script/` (deploy and management scripts inheriting `Script`), `lib/` (forge-installed dependencies, committed as submodules or git-trees), `broadcast/` (deploy logs keyed by chain ID and script name), and `docs/` (NatSpec-generated or hand-written architecture notes). `foundry.toml` at the root configures the compiler, fuzz/invariant runners, and formatter; `remappings.txt` aliases `lib/` paths so imports stay readable. The `.gitignore` excludes `cache/`, `out/`, and broadcast directories for ephemeral local chains (anvil, chain ID 31337), but **keeps** broadcast artifacts for canonical chain IDs (1, 10, 8453, 42161, ...) because they are the deploy provenance. Tests follow strict naming — `test_`, `testFuzz_`, `invariant_` — so the runner can pick them up and reviewers can read intent off the function name.

## Deep Guidance

### Top-level layout

```
project-root/
├── src/                    # Contracts under audit — the deliverable
│   ├── interfaces/         # I*.sol interfaces, importable by consumers
│   ├── libraries/          # Pure libraries (no state)
│   └── tokens/             # Domain-grouped subdirectories
├── test/                   # Foundry tests — mirrors src/
│   ├── unit/               # Per-contract unit tests
│   ├── integration/        # Multi-contract / forked-mainnet tests
│   ├── invariant/          # Invariant suites + Handler contracts
│   └── utils/              # Shared test helpers, mocks, base contracts
├── script/                 # Deploy + management scripts (forge script)
│   ├── Deploy.s.sol
│   └── Upgrade.s.sol
├── lib/                    # forge install dependencies (submodules)
│   ├── forge-std/
│   ├── openzeppelin-contracts/
│   └── solmate/
├── broadcast/              # Deploy artifacts keyed by script + chain ID
│   └── Deploy.s.sol/
│       ├── 1/              # Mainnet — KEEP, this is provenance
│       ├── 10/             # Optimism — KEEP
│       └── 31337/          # Anvil — gitignored
├── docs/                   # NatSpec output or hand-written architecture
├── foundry.toml            # Project config
├── remappings.txt          # Import aliases for lib/
├── .gitignore
└── README.md
```

One-liners:
- `src/` — every contract that ships; group by domain, never by Solidity language feature
- `test/` — mirrors `src/` so reviewers can find the test for any contract in one jump
- `script/` — every deploy, upgrade, and ops script (parameter tuning, role grants); each inherits `forge-std/Script.sol`
- `lib/` — third-party Solidity tracked via `forge install` (git submodules under the hood)
- `broadcast/` — receipts from `forge script --broadcast`; partition by chain ID; **keep** canonical chains, gitignore ephemeral ones
- `docs/` — `forge doc` output or hand-written `architecture.md`, `threat-model.md`, `invariants.md`

### `foundry.toml`

`foundry.toml` is the project config — compiler version, optimizer settings, fuzz/invariant runner knobs, formatter rules, and per-profile overrides. A minimal but production-shaped config:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
test = "test"
script = "script"
solc_version = "0.8.26"
evm_version = "cancun"
optimizer = true
optimizer_runs = 200
via_ir = false
bytecode_hash = "none"           # Reproducible builds (no metadata hash)
cbor_metadata = false
gas_reports = ["*"]

[profile.ci]
fuzz = { runs = 10_000 }
invariant = { runs = 256, depth = 128 }
verbosity = 3

[fmt]
line_length = 120
tab_width = 4
bracket_spacing = true
int_types = "long"               # uint256 not uint, by name
quote_style = "double"
number_underscore = "thousands"  # 1_000_000

[fuzz]
runs = 256                       # Local default; CI overrides via [profile.ci]
max_test_rejects = 65_536

[invariant]
runs = 64
depth = 32
fail_on_revert = false
```

`optimizer_runs` is the only setting non-obvious enough to justify thinking. The number is **not** "how many times to run the optimizer" — it's the expected number of times each opcode will run over the contract's lifetime. Higher values trade deploy-time bytecode size for cheaper runtime gas. Defaults:
- `200` (Solidity default) — balanced; right for most contracts including infrequently-called governance
- `1_000_000` — protocol contracts with hot paths (AMMs, lending pools, perp engines); pay extra deploy cost once, save gas on every swap forever
- `1` — one-shot contracts (deploy scripts, factories that deploy once and self-destruct conceptually); minimize deploy cost

The `ci` profile overrides fuzz runs to 10k for thorough coverage on PRs; locally 256 keeps `forge test` snappy.

### Test naming

Foundry's runner discovers tests by function-name prefix. Three prefixes matter, and the convention is load-bearing — auditors read intent off the name:

- `test_<unit>_<behavior>` — concrete unit tests; e.g. `test_transfer_revertsWhenInsufficientBalance`
- `testFuzz_<unit>_<property>` — property tests with fuzzed inputs; e.g. `testFuzz_deposit_creditsExactAmount(uint256 amount)`
- `invariant_<property>` — invariant tests run by the invariant engine over a stateful handler; e.g. `invariant_totalSupplyEqualsSumOfBalances`

File mirror: a contract `src/Vault.sol` gets its tests at `test/unit/Vault.t.sol` (the `.t.sol` suffix is convention, not required, but make it consistent across the repo). Invariant suites live in `test/invariant/Vault.invariants.t.sol` with their `Handler` contract alongside.

```solidity
// test/unit/Vault.t.sol
contract VaultTest is Test {
    Vault vault;

    function setUp() public {
        vault = new Vault();
    }

    function test_deposit_creditsBalance() public {
        vault.deposit{value: 1 ether}();
        assertEq(vault.balanceOf(address(this)), 1 ether);
    }

    function testFuzz_deposit_creditsExactAmount(uint96 amount) public {
        vm.deal(address(this), amount);
        vault.deposit{value: amount}();
        assertEq(vault.balanceOf(address(this)), amount);
    }
}
```

Use `uint96` (or another bounded type) for fuzz parameters tied to ETH amounts — full `uint256` blows the available balance and triggers `max_test_rejects` exhaustion.

### Deploy scripts and `broadcast/`

Deploy scripts inherit `forge-std/Script.sol` and read environment-specific addresses via `vm.envAddress`. Hard-coded addresses in script bodies are a category of bug — they survive a `git mv` from staging to mainnet and you find out at $4 gwei.

```solidity
// script/Deploy.s.sol
import {Script} from "forge-std/Script.sol";
import {Vault} from "../src/Vault.sol";

contract Deploy is Script {
    function run() external returns (Vault vault) {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        uint256 pk = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(pk);
        vault = new Vault(admin);
        vm.stopBroadcast();
    }
}
```

Running `forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --verify` writes a receipt to `broadcast/Deploy.s.sol/<chainId>/run-latest.json` and a timestamped copy. That JSON contains the deployed address, transaction hash, block number, constructor args, and a SHA tying it back to the commit. **This is the provenance artifact.** Keep it for canonical chains; without it, "which commit deployed the mainnet Vault at 0xabc..." becomes archaeology. Verify on Etherscan in the same command (`--verify`) so the audit trail extends to the public block explorer.

### `lib/` and remappings

Solidity dependencies are installed via `forge install`, which adds the upstream repo as a git submodule under `lib/`:

```bash
forge install OpenZeppelin/openzeppelin-contracts@v5.0.0
forge install transmissions11/solmate
forge install foundry-rs/forge-std
```

Pin to a tag (`@v5.0.0`), never to `main`. Submodule SHAs are recorded in `.gitmodules` and the commit, so a fresh `forge install` after clone produces the same dependency set.

Imports through `lib/openzeppelin-contracts/contracts/...` are ugly. `remappings.txt` aliases them:

```
@openzeppelin/=lib/openzeppelin-contracts/
@openzeppelin-upgradeable/=lib/openzeppelin-contracts-upgradeable/
solmate/=lib/solmate/src/
forge-std/=lib/forge-std/src/
```

Then `import "@openzeppelin/contracts/token/ERC20/ERC20.sol";` resolves cleanly. Keep `remappings.txt` checked in; some IDE plugins and `forge` itself read it.

### `.gitignore`

```gitignore
# Build artifacts
cache/
out/

# Coverage
lcov.info

# Node (Hardhat carryovers, JS tooling)
node_modules/

# Environment / secrets
.env
.env.*
!.env.example

# Anvil / ephemeral local chains — chain ID 31337
broadcast/*/31337/
broadcast/**/dry-run/

# Editor
.vscode/
.idea/
```

The load-bearing line is `broadcast/*/31337/`. Anvil's chain ID is 31337 and every local script run leaves a receipt; those are noise. Mainnet (`1`), Optimism (`10`), Base (`8453`), Arbitrum (`42161`), and other canonical chain IDs are **not** in the ignore list because their broadcast artifacts are the on-chain deploy provenance. Treat them with the same care as the contracts themselves: commit, review, and tag at release.
