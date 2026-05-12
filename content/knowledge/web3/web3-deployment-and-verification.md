---
name: web3-deployment-and-verification
description: Deploying smart contracts with forge script — broadcast artifacts as provenance, Etherscan verification, multi-chain flows, testnet rehearsals, mainnet pre-flight, post-deploy role hardening, and CREATE2 deterministic deploys
topics: [web3, deployment, verification, forge-script, etherscan]
---

Shipping a contract to mainnet is the most irreversible thing a smart-contract team ever does. There is no rollback, no patch deploy, no `kubectl rollout undo` — once the bytecode is live and users start interacting with it, you live with what you wrote. The instinct from web2 — "deploy fast, fix forward" — produces drained protocols on-chain. Treat deployment as a release event: every privileged operation scripted (not hand-called), every artifact archived (not transient), every step rehearsed on a testnet that mirrors mainnet, and every contract verified on Etherscan before you tell anyone the address. The cost of the discipline is half a day of process; the cost of skipping it is the entire protocol.

## Summary

Use `forge script` with a `Script`-extending contract for every deploy — never an ad-hoc `forge create` invocation, never a hand-pasted constructor argument. The script batches deploy + initial role grants + ownership transfer into one atomic broadcast so there is no intermediate state where the deployer EOA holds privileges. Commit the resulting `broadcast/Deploy.s.sol/<chainId>/run-latest.json` for every canonical chain — it is the provenance artifact tying a verified address back to a commit SHA. Verify on Etherscan inline (`--verify` on the script) or as a separate `forge verify-contract` step before announcing the address; an unverified mainnet contract is functionally invisible to users and auditors. Rehearse the full deploy on Sepolia first — same script, different `--rpc-url` — and only promote to mainnet once the testnet smoke test, role-hardening sequence, and (if upgradeable) upgrade burn-test all pass. Then run the mainnet pre-flight checklist before unlocking the hardware wallets.

## Deep Guidance

### `forge script` deploys

Every mainnet deploy goes through a `Script`-extending contract in `script/` — not `forge create`, not a one-off REPL, not a `cast send` typed into a terminal at 2am. The script is reviewable, diffable, and re-runnable; it lives in the same repo as the contracts it deploys; and it captures every privileged operation in a single broadcast so there is no window where the deployer EOA holds powers it should not. A minimal but production-shaped deploy script:

```solidity
// script/Deploy.s.sol
import {Script} from "forge-std/Script.sol";
import {Vault} from "../src/Vault.sol";

contract Deploy is Script {
    function run() external returns (Vault vault) {
        address adminMultisig = vm.envAddress("ADMIN_MULTISIG");
        address minterMultisig = vm.envAddress("MINTER_MULTISIG");
        address timelock = vm.envAddress("TIMELOCK");
        uint256 pk = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(pk);

        // Deploy
        vault = new Vault(adminMultisig);

        // Grant operational roles
        vault.grantRole(vault.MINTER_ROLE(), minterMultisig);
        vault.grantRole(vault.UPGRADER_ROLE(), timelock);

        // Renounce deployer's transient admin (if constructor granted it)
        // — preferred pattern is to pass the multisig to the constructor
        //   so the deployer never holds DEFAULT_ADMIN_ROLE in the first place.

        vm.stopBroadcast();
    }
}
```

`vm.startBroadcast(pk)` and `vm.stopBroadcast()` bracket the transactions that get sent on-chain — everything in between becomes a real transaction signed by the deployer key. Calls outside the broadcast block are simulation-only (useful for reading state to assert preconditions, e.g. `require(adminMultisig.code.length > 0, "admin must be a contract")`). Batching deploy + role grants in a single broadcast means the role-hardening steps cannot be forgotten mid-deploy; the contract goes live in its final access-control configuration.

`vm.startBroadcast()` has three forms worth distinguishing:

- `vm.startBroadcast()` — uses the default sender, typically the address derived from `--private-key`, `--account`, or `--ledger` passed on the command line.
- `vm.startBroadcast(uint256 pk)` — broadcasts as a specific private key, useful when the script needs to switch identities mid-run (rare; usually a smell).
- `vm.startBroadcast(address signer)` — broadcasts as a specific address; combined with `--unlocked` for local anvil testing, or used with `--sender` for prepare-only flows.

Prefer the no-argument form with `--account <name>` (encrypted keystore) or `--ledger` (hardware) at the CLI: the script stays identical between testnet and mainnet, and the signing identity is selected at invocation time. `vm.envUint("DEPLOYER_PK")` reads the private key into the script's memory, which is fine for a one-off mainnet deploy from a fresh ephemeral environment but is a footgun on a shared developer machine. The deployer EOA is privileged for exactly one transaction — its job is to produce the broadcast — and then it should be a dead account.

For deploys that originate from a Safe rather than an EOA, the `forge script` flow changes shape: the script is run with `--sender $SAFE_ADDRESS` and **not** `--broadcast`, producing an unsigned transaction batch (often via `--ffi` and a helper like `safe-tx-builder`) that gets posted to the Safe UI for signing. The broadcast artifact is then the Safe transaction hash plus the eventual execution receipt. This is the right pattern for any subsequent privileged operation after the initial deploy; the deployer EOA only ever produces the first transaction.

### Broadcast artifacts as provenance

Running `forge script script/Deploy.s.sol --rpc-url $RPC --broadcast` writes a JSON receipt to `broadcast/Deploy.s.sol/<chainId>/run-latest.json` (plus a timestamped copy alongside). That JSON contains the deployed address, the transaction hash, the block number, the constructor arguments, the gas used, and the ABI of the deployed contracts. Combined with the git commit SHA at the time of the run, it is the provenance artifact for the deployment. **Commit it.** Without the broadcast log, "which commit deployed the mainnet Vault at 0xabc..." becomes archaeology — you are diffing bytecode against historical builds trying to reconstruct which branch shipped. See `web3-project-structure.md` for the directory layout and `.gitignore` rules that keep canonical-chain broadcasts (1, 10, 8453, 42161) tracked while excluding ephemeral anvil (31337) noise.

Tag the release commit (`git tag mainnet-v1.0.0`) so the deployment is permanently locatable by name, and link the tag from your README's deployment table. A year from now, when someone asks "what version is live?", the answer is one `git checkout` away rather than a forensic exercise. Pair this with a CI job that uploads the broadcast artifact to an immutable store (release assets, IPFS) for the canonical record outside the repo.

The broadcast JSON itself is structured. Key fields to know:

- `transactions[].contractAddress` — the deployed address. Always present for `CREATE`/`CREATE2` transactions.
- `transactions[].hash` — the on-chain transaction hash for cross-referencing with Etherscan.
- `transactions[].arguments` — the constructor args as a JSON array, useful for re-verifying or auditing what was passed.
- `receipts[]` — the post-execution receipts including gas used, block number, and emitted logs.
- `commit` — Foundry records the current git commit SHA at the time of the script run.

Downstream tooling (deploy dashboards, indexer config generators, partner integrations) can parse this JSON directly. Treat it as a stable interface — your deployment story should never require running the script again to "look up" what happened the first time.

### Etherscan verification

An unverified mainnet contract is hostile UX: users see opaque bytecode, auditors cannot review the source, and Etherscan's "Read Contract" / "Write Contract" tabs are dead. Verify every deploy. Two paths:

**Inline during deploy** — pass `--verify` to `forge script` and Foundry verifies each deployed contract immediately after broadcast. This is the preferred flow because the verification happens in the same invocation that produced the address, eliminating the risk of forgetting:

```bash
forge script script/Deploy.s.sol \
  --rpc-url $MAINNET_RPC \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Standalone after the fact** — if verification was skipped or failed, run `forge verify-contract` against the deployed address:

```bash
forge verify-contract 0xVaultAddress src/Vault.sol:Vault \
  --chain mainnet \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address)" $ADMIN_MULTISIG) \
  --watch
```

`--watch` polls Etherscan until the verification completes. Constructor args must match exactly — encode them with `cast abi-encode` rather than typing the hex by hand, because a single nibble off means a "bytecode mismatch" error and another round of debugging.

Two reproducibility traps cause more "verified contract" failures than anything else. First, the compiler settings must match exactly: `solc_version`, `optimizer_runs`, `via_ir`, `evm_version`, and `bytecode_hash` in `foundry.toml` must be identical to what was used at deploy time. Setting `bytecode_hash = "none"` in `foundry.toml` removes the metadata hash from the compiled bytecode, which makes verification deterministic across machines — strongly recommended. Second, library addresses must be linked the same way; if your contract uses a non-inlined library, pass `--libraries` to `forge verify-contract` with the deployed library address. When verification fails, the Etherscan diff view shows which bytes diverge — read it before guessing.

Beyond Etherscan, consider also publishing to Sourcify (`--verifier sourcify`), which is a decentralized verification network not controlled by any single explorer. Sourcify verification produces a permanent, IPFS-backed record that survives any future Etherscan policy change or rate limit. For protocols that care about long-term decentralized verifiability, dual-verification (Etherscan + Sourcify) is cheap insurance.

L2 explorers vary: Basescan and Optimistic Etherscan use the same Etherscan stack and the same `forge verify-contract` flags. Arbiscan is similar but occasionally has stricter handling of via-IR contracts. Blockscout-based explorers (Gnosis Chain, several appchains) take `--verifier blockscout` with the chain-specific instance URL. Document the verifier per chain in your deploy runbook so a new operator does not have to discover it under deploy pressure.

### Multi-chain deploys

Modern protocols ship to several L2s alongside mainnet — Optimism, Base, Arbitrum, sometimes a half-dozen more. The same `forge script` runs against every chain; only the `--rpc-url` and chain-specific env vars change:

```bash
# Sepolia rehearsal
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast --verify

# Mainnet
forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC --broadcast --verify

# Base
forge script script/Deploy.s.sol --rpc-url $BASE_RPC --broadcast --verify
```

Pin the expected chain ID inside the script with `require(block.chainid == 1, "wrong chain")` for mainnet-only operations — a wrong RPC URL is the kind of mistake that lands a "mainnet" deploy on Goerli, or worse, the other way around. Etherscan API keys are per-chain (Etherscan, Basescan, Arbiscan, Optimistic Etherscan, ...) — keep them in `.env` and never paste them inline.

Maintain a `deployments.json` (or similar) keyed by chain ID that captures the canonical address of every contract on every chain. Reference it from `Deploy.s.sol` for cross-contract wiring (e.g. "deploy a new Router that knows about the existing Vault on this chain"), and update it via the same broadcast that produced the new address. The file is the source of truth for downstream consumers — frontends, indexers, partner integrations — and lives in version control alongside the contracts. Some teams use `foundry-deployments` or `forge-deploy` plugins to manage this automatically; others write a 50-line helper in `script/utils/`. Either is fine; what is not fine is humans copy-pasting addresses between chats.

A multi-chain deploy is also a multi-chain **operations** problem: every chain has its own gas market, its own block-explorer quirks, its own reorg risk. Mainnet's 12-second blocks and ~$5 confirmation cost differ wildly from Arbitrum's sub-second blocks and sub-cent confirmation cost. Budget time for each chain individually — do not assume "we did mainnet, the L2s are a copy-paste" because the same script will still take a different amount of wall-clock time and produce different gas receipts.

### Testnet rehearsal

Sepolia is not optional. Every mainnet deploy is preceded by a full Sepolia run of the same script, against a real RPC, with real (testnet) ETH. The rehearsal must exercise the **entire** post-deploy path: deploy, role grants, ownership transfer, Etherscan verification, smoke-test script against the live address, and (if upgradeable) a burn-test of the upgrade flow through the proxy. Only after every step succeeds on testnet — and the team has reviewed the resulting broadcast artifact and the verified Etherscan page — does the same script run against mainnet. The discipline catches the boring failures: a missing env var, a constructor arg in the wrong order, a multisig address that is actually an EOA, an Etherscan API key with the wrong permissions. Catching them on Sepolia costs an hour; catching them on mainnet costs a redeploy and a public explanation.

The Sepolia smoke test is a separate `forge script` (`script/SmokeTest.s.sol`) that exercises the protocol's happy path against the just-deployed address: deposit, mint, transfer, withdraw, pause, unpause, role-grant. It runs unattended, asserts expected end states, and fails loudly on the first deviation. Treat it as part of the deploy pipeline, not an optional manual step. A "fork test" using `vm.createFork($MAINNET_RPC)` is **not** a substitute — forking simulates against historical state but does not exercise the real Etherscan verification, the real Safe-signing UX, or the real gas-pricing dynamics. Sepolia is closer to mainnet than any fork.

Be explicit about which testnet you target. Goerli is deprecated. Holesky and Sepolia are the supported Ethereum testnets; Sepolia is the default for most teams because faucets are accessible. L2 testnets (Sepolia-Optimism, Sepolia-Base, Sepolia-Arbitrum) all derive from Sepolia and use the same wallet/faucet flow. Pick once and stay consistent across your contract suite — splitting testnets across protocols means each deploy needs a fresh faucet trip.

Rehearse with the **real multisig**, not a placeholder EOA. The Safe UI on Sepolia is the same UI your signers will see on mainnet; their first encounter with the "Sign Transaction" button should be on testnet ETH. Walk through the Tenderly simulation step together, verify the call data matches the script's expected output, and have every signer practice rejecting a transaction (you want them to know what the cancel flow looks like before they ever need it). The rehearsal is as much a people-process check as a tooling check.

If the protocol is upgradeable, the testnet rehearsal must include an actual upgrade through the timelock: schedule the upgrade, wait the (compressed) delay, execute, and verify the new implementation. Skipping this step is how teams discover their `_authorizeUpgrade` is misgated only when they need to ship a hotfix.

### Mainnet pre-flight checklist

Before the deploy transaction is signed, every item is checked off, in order, with a named owner:

1. **All tests pass and Slither is clean** — `forge test`, `forge coverage`, and `slither .` all green on the exact commit being deployed. Cross-ref `web3-audit-workflow.md` for the full gate.
2. **Audit report delivered and findings remediated** — every P0/P1 from the audit has either a fix commit or a written acceptance with sign-off from the audit firm. No "we'll address this in v2" handwaves.
3. **Testnet rehearsal complete and verified** — Sepolia deploy succeeded end-to-end, including Etherscan verification and the smoke-test script. Broadcast artifact reviewed.
4. **Multisig signers ready and hardware wallets unlocked** — every required signer is online, hardware wallet plugged in and unlocked, Safe UI loaded, Tenderly simulation tab open. Rehearse the signing ceremony beforehand so the first signature is not the night of the deploy.
5. **Initial role assignments scripted** — every privileged role grant lives in `Deploy.s.sol` and runs inside the same broadcast as the deploy. **Never hand-call `grantRole` on mainnet.** A script is reviewable; a typed-out `cast send` at midnight is not. Cross-ref `web3-access-control.md`.
6. **Gas budget estimated and funded** — deploy gas estimated via the testnet run, mainnet base fee checked at the time of deploy, deployer EOA funded with enough ETH (plus headroom for retries). Stuck transactions because of insufficient gas are an avoidable embarrassment.
7. **Deploy window chosen with cost and contention in mind** — avoid known high-fee windows (NFT mints, market dislocations, hyped launches) unless the deploy is itself an event. A boring 4am-UTC Sunday deploy is the right kind of boring. Have a no-deploy list (Eth mainnet upgrades, scheduled L2 sequencer maintenance) so you do not ship in the middle of someone else's incident.
8. **Source code frozen** — the commit being deployed is tagged, the working tree is clean, and there is no in-flight PR that "we'll fold in real quick." A clean tree is the precondition for a reproducible verification.

Additional items worth treating as gates even though they are not strictly pre-flight:

- **Monitoring wired before the deploy lands.** Tenderly Alerts, OpenZeppelin Defender, or a custom indexer should already be configured for the (currently zero) contract address; flip them on the moment the deploy confirms. Catching an exploit ten minutes in is much better than catching it ten hours in.
- **Incident-response runbook ready.** Who pauses? Who calls the auditor? Who tweets? Decide before the deploy, not during the incident.
- **Block explorer pages bookmarked.** A panicked search for "Etherscan Vault address" during an incident is how the wrong contract gets paused.

### Post-deploy hardening

The minutes after a mainnet deploy are the most dangerous part of a deploy. The deployer EOA may still hold transient privileges; the contract may not yet be verified; the addresses are not yet published; the protocol may be paused-but-fundable or unpaused-but-untested. MEV searchers and on-chain attackers run scripts that watch for new deployments at known protocols and probe for misconfigurations within seconds. Run these steps immediately, ideally as part of the same `forge script` invocation:

1. **Transfer ownership to the multisig and verify on-chain** — the deploy script should pass the multisig to the constructor, not the deployer. If for any reason the deployer held admin transiently, transfer and verify with `hasRole(DEFAULT_ADMIN_ROLE, multisig) == true` before doing anything else.
2. **Renounce `DEFAULT_ADMIN_ROLE` from the deployer EOA** — `renounceRole` in the same broadcast as the deploy. After this transaction lands, the deployer key is no longer a risk to the protocol. Verify with `hasRole(DEFAULT_ADMIN_ROLE, deployerEOA) == false`.
3. **Set the timelock as upgrade-admin** — if the protocol is upgradeable, the proxy admin / `UPGRADER_ROLE` goes to the `TimelockController`, not directly to the multisig. See `web3-upgradeability.md`.
4. **Verify on Etherscan** — if `--verify` was not part of the deploy run, do it now with `forge verify-contract`. An unverified mainnet contract is not deployed in any meaningful sense.
5. **Publish the addresses to the README, protocol docs, and any subgraph/indexer configs** — together with the block number, commit SHA, and a link to the verified Etherscan page. Users and auditors should not have to ask which address is canonical.
6. **Run an on-chain assertion script.** A short `forge script PostDeployCheck.s.sol` that reads back every role assignment and configuration parameter and `require`s the expected value. Run it immediately, and again 24 hours later — if anything diverged in the meantime, you want to know before the community does. This is the on-chain analogue of a smoke test.

A common failure mode: a team intends to do all five steps but completes only the first three before "the deploy worked, we'll polish later." The unverified contract sits on Etherscan for a week, the deployer EOA still holds admin, and the addresses are scattered across Slack messages. The fix is to script all five steps as part of `Deploy.s.sol` so they happen atomically — the deploy is not "done" until role-hardening and verification have both succeeded.

Worked example of the verification step inside the script — Foundry's cheatcodes let you assert post-deploy invariants in the same broadcast:

```solidity
vm.stopBroadcast();

// Outside the broadcast — these are simulation reads, not transactions
require(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), adminMultisig), "admin not granted");
require(!vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), msg.sender), "deployer still admin");
require(vault.hasRole(vault.UPGRADER_ROLE(), timelock), "timelock not upgrader");
```

A failing `require` after `vm.stopBroadcast()` means the script reverts and `forge script` exits non-zero — so a deploy that produced a misconfigured contract surfaces as a CI failure rather than a silent success. Wire the deploy script into a CI pipeline that gates merge-to-main on a successful Sepolia run, and the worst classes of "we forgot a role grant" bugs disappear before they can reach mainnet.

### CREATE2 deterministic deploys

For protocols that need the **same address on every chain** — typically cross-chain messaging contracts, omnichain tokens, or routers that other protocols hard-code — use `CREATE2` via a deterministic factory. `CREATE2` computes the deployed address as `keccak256(0xff ++ factory ++ salt ++ keccak256(initcode))`, so identical bytecode + identical salt + identical factory address produces the identical contract address across chains. The canonical factory is Safe's `CreateCall` or the widely-used deterministic deployment proxy at `0x4e59b44847b379578588920cA78FbF26c0B4956C` (which itself exists at the same address on most EVM chains, bootstrapped via a presigned transaction). Foundry supports `CREATE2` via `new Contract{salt: SALT}(args)` inside a script:

```solidity
bytes32 salt = keccak256("Vault.v1.mainnet");
Vault vault = new Vault{salt: salt}(adminMultisig);
```

The constraint is that the initcode (including constructor args) must be byte-identical across chains — any chain-specific configuration must come from post-deploy setter calls, not constructor parameters. The salt is part of the public deployment scheme: document it alongside the deployed address so downstream protocols can independently verify the contract was deployed via the expected factory + salt. Vanity addresses (e.g. starting with multiple zero bytes for tiny gas savings on every call) come from grinding the salt against an off-chain miner; budget hours-to-days of GPU time for serious patterns.

Treat `CREATE2` as a specialist tool: most protocols do not need cross-chain address parity, and the operational overhead of locking the initcode is real. If your first deploy ever might want a same-address counterpart on another chain, deploy from a `CREATE2` factory from day one — converting later means either redeploying at a new address (breaking integrations) or accepting that the cross-chain story is asymmetric.

A common pattern is to pair `CREATE2` with **proxy** deployment: the deterministic factory deploys a minimal proxy at the cross-chain address, and the implementation contract (which can differ per chain) sits behind it. Argument-driven differences end up in proxy initialization (`initialize(...)`) calls that occur after the cross-chain `CREATE2` deploy. This separates "the address everyone integrates with" from "the chain-specific config the protocol needs," giving you the best of both worlds at the cost of one extra contract per chain. See `web3-upgradeability.md` for the proxy patterns.

### Common pitfalls

A short list of mistakes that have shipped to mainnet at well-funded protocols, each of which the above discipline prevents:

- **Deploying with a hard-coded admin address that turned out to be a test wallet from a stale `.env`.** Always read from `vm.envAddress` and require non-zero, plus assert `code.length > 0` if the admin is meant to be a contract.
- **Forgetting to verify on Etherscan because "we'll do it tomorrow."** A week later the deploy is in production, the verified flag is still off, and users are filing support tickets asking whether the protocol is a scam.
- **Granting `DEFAULT_ADMIN_ROLE` to the deployer EOA and never renouncing.** Six months later the EOA is on a former employee's laptop. The fix is in the constructor: grant admin to the multisig directly.
- **Multi-chain deploys producing different addresses because someone bumped the compiler between chains.** Pin everything in `foundry.toml`, commit the lockfile-equivalent (`lib/` submodule SHAs), and re-run from the tagged commit.
- **Discovering after the fact that the Sepolia RPC was actually pointed at Holesky.** Validate `block.chainid` in the script.
- **Constructor arg encoding off by one nibble.** Use `cast abi-encode` and pipe directly to `--constructor-args`; never type the hex.
- **Hand-calling `grantRole` from Etherscan's "Write Contract" tab as a "quick fix."** Scripts are reviewable; one-off Etherscan writes are not. If the deploy script needed a follow-up, the follow-up is itself a script.

The common thread is that every one of these failures was preventable by a script, a `require`, or a checklist. Mainnet deploys are not a place to be clever; they are a place to be boring.

See `web3-project-structure.md` for the broadcast directory layout, `web3-access-control.md` for role-assignment patterns inside deploy scripts, `web3-upgradeability.md` for proxy-aware deploys and the proxy-admin handoff, and `web3-audit-workflow.md` for the pre-deploy quality gates that feed the pre-flight checklist.
