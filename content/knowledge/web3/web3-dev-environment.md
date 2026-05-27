---
name: web3-dev-environment
description: Reproducible local Foundry environment for smart-contract teams — pinned solc, pinned forge, anvil, forge-std, direnv, and CI parity
topics: [web3, dev-environment, foundry, forge, anvil]
volatility: evolving
last-reviewed: null
version-pin: 'Solidity 0.8.x'
sources:
  - url: https://ethereum.org/en/developers/docs/programming-languages/
  - url: https://docs.openzeppelin.com/contracts/5.x/
---

A reproducible Foundry environment is what lets every developer (and CI) get the same compile output, the same gas snapshots, and the same fork-test results. The pieces are not exotic: install Foundry through the official channel, pin the toolchain and the Solidity compiler, lean on `forge-std` for tests, push secrets out of your global shell with `direnv`, and mirror the same versions in CI. Skip any one of these and "works on my machine" creeps back in — usually as a gas-snapshot diff that nobody can reproduce.

## Summary

Install Foundry via `foundryup` and pin the forge version in CI with `foundry-rs/foundry-toolchain@v1` so local and CI builds use the same compiler driver. Use `forge` to build and test, `cast` as the swiss-army RPC tool, and `anvil` as the local node — `anvil --fork-url $MAINNET_RPC` is the workflow for fork testing. Add `forge-std` (`forge install foundry-rs/forge-std`) so every test file extends `Test` and gets `Vm` plus `console.log` for free. Pin the Solidity compiler in `foundry.toml` with `solc_version = "0.8.24"` rather than relying on the pragma — pragma ranges let `forge` pick whatever satisfies them, and that is exactly how byte-identical builds rot. Keep RPC URLs and Etherscan keys in a `direnv` `.envrc` so they load only inside the project.

## Deep Guidance

### Installing Foundry

`foundryup` is the official installer and the only one worth using. It manages the `forge`, `cast`, `anvil`, and `chisel` binaries together so they never drift apart, and it supports pinning to a specific release. Avoid Homebrew formulae and random binaries — they lag, and a stale `forge` against current `forge-std` is a special kind of debugging hell.

```bash
curl -L https://foundry.paradigm.xyz | bash   # installs foundryup
foundryup                                     # installs latest stable forge/cast/anvil/chisel
foundryup --install nightly-abc1234           # pin to a specific nightly for CI parity
```

For a team, pick a release tag (or nightly hash) and write it into the repo's README and CI workflow. Local devs run `foundryup --install <tag>` and CI uses the same value in `foundry-toolchain@v1`. Drift between dev and CI shows up as gas-snapshot diffs nobody can explain.

### `forge`, `cast`, `anvil`

The three CLIs are orthogonal and you will use all three daily.

- **`forge`** builds and tests. `forge build` compiles, `forge test` runs Solidity tests, `forge snapshot` captures gas usage per test, `forge fmt` formats sources, `forge coverage` reports coverage. It is the project-management tool.
- **`cast`** is the RPC swiss-army knife. `cast call`, `cast send`, `cast balance`, `cast storage`, `cast abi-decode`, `cast 4byte`, `cast wallet` — anything you would otherwise script with ethers.js in a one-off. Keep `cast --help` open the first week.
- **`anvil`** is the local Ethereum node. It boots in milliseconds, ships pre-funded accounts, and supports forking any reachable RPC.

### Local node and fork testing with `anvil`

Plain `anvil` gives you a clean chain with 10 funded accounts at `http://127.0.0.1:8545` — fine for unit tests that do not need real protocol state. The killer feature is forking: point `anvil` at a mainnet (or L2) archive RPC and you get a local chain that lazily fetches state from that block.

```bash
anvil \
  --fork-url "$MAINNET_RPC" \
  --fork-block-number 19000000 \
  --chain-id 31337 \
  --accounts 10 \
  --balance 10000
```

Pin `--fork-block-number` in CI and in any reproducible local script — forking "latest" makes tests non-deterministic the moment a tested protocol changes state. For fork tests inside `forge test`, set `eth_rpc_url` in `foundry.toml` and use `vm.createSelectFork(...)` instead of running `anvil` separately.

### `forge-std` library

`forge-std` is the standard Foundry test library. It is not optional — every serious Foundry repo depends on it. Install it as a git submodule:

```bash
forge install foundry-rs/forge-std
```

Then every test file extends `Test` and gets `Vm` cheatcodes, `console.log`, assertions, and helpers like `deal`, `prank`, and `expectRevert`:

```solidity
// test/Counter.t.sol
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Counter} from "../src/Counter.sol";

contract CounterTest is Test {
    Counter counter;

    function setUp() public {
        counter = new Counter();
    }

    function test_Increment() public {
        counter.increment();
        assertEq(counter.number(), 1);
        console.log("number", counter.number());
    }
}
```

### Pinning the Solidity compiler

Pragmas declare a range (`pragma solidity ^0.8.20;`) but ranges are not pins. By default `forge` resolves the range and downloads whatever release satisfies it — usually the newest. That means a `0.8.24` build today and a `0.8.27` build six months from now from the same source tree, with different bytecode and different gas. Pin the compiler in `foundry.toml`:

```toml
# foundry.toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.24"
optimizer = true
optimizer_runs = 200
evm_version = "cancun"
bytecode_hash = "none"   # deterministic metadata across machines

[profile.ci]
fuzz = { runs = 10000 }
invariant = { runs = 256, depth = 32 }
```

Now every developer and CI run uses `solc 0.8.24` regardless of what the pragma allows. Bumping the compiler is a deliberate PR, not a silent drift.

### `direnv` for env vars

Foundry reads `ETH_RPC_URL`, `ETHERSCAN_API_KEY`, and per-chain RPC variables straight from the environment. Use `direnv` to scope them to the repo:

```bash
# .envrc — commit this file
export ETH_RPC_URL="http://127.0.0.1:8545"
export MAINNET_RPC="https://eth-mainnet.g.alchemy.com/v2/$ALCHEMY_KEY"
export SEPOLIA_RPC="https://eth-sepolia.g.alchemy.com/v2/$ALCHEMY_KEY"

# Secrets — never commit
[[ -f .envrc.local ]] && source_env .envrc.local
```

Add `.envrc.local` to `.gitignore` and keep `ALCHEMY_KEY`, `ETHERSCAN_API_KEY`, and any deployment private key there. Run `direnv allow` once after editing `.envrc`. Editors: `JuanBlanco.solidity` or `NomicFoundation.hardhat-solidity` are the practical options; Foundry's own `solidity-language-server` is alpha — try it, but do not require it of teammates.

### CI: pinned toolchain

Mirror the local toolchain version in CI with `foundry-rs/foundry-toolchain@v1`. The action installs `forge`, `cast`, and `anvil` at the pinned version and caches the RPC fork state across runs.

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: nightly-abc1234   # same hash devs run locally

      - run: forge --version
      - run: forge fmt --check
      - run: forge build --sizes
      - run: forge test -vvv
        env:
          MAINNET_RPC: ${{ secrets.MAINNET_RPC }}
      - run: forge snapshot --check   # fails if gas drifts
```

The combination of pinned `foundryup`, pinned `solc_version`, and pinned `foundry-toolchain@v1` is what makes `forge snapshot --check` a reliable CI gate instead of a flaky one.
