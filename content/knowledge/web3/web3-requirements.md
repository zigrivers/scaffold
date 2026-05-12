---
name: web3-requirements
description: Problem framing, invariants, threat model, trust assumptions, and success metrics for shipping smart contracts and protocols to EVM chains
topics: [web3, requirements, invariants, threat-model, security]
---

A smart contract shipped to an EVM chain without a written invariant set, a threat model, and an explicit list of trust assumptions is a guessing game with adversarial counterparties and irreversible state. This document defines the acceptance spec for a contract or protocol going to Ethereum mainnet, an L2 (Optimism, Arbitrum, Base), or a compatible sidechain. The audience is a senior Solidity engineer or protocol architect who can ship code but has not yet hardened it against funded adversaries. The goal is to force, in writing, the questions an auditor will ask on day one.

## Summary

A web3 requirements doc states what the contract does for which users (problem framing), enumerates the invariants that must hold across every reachable state, names the threat model in terms of capabilities and time horizon, lists each trust assumption as a documented failure mode, and defines success in concrete economic, gas, or capability terms. State invariants up front and write them as Foundry invariant tests before you finish the implementation. If you cannot enumerate your trust assumptions, you have not designed a protocol — you have written code that happens to compile.

## Deep Guidance

### Problem framing

The framing answers one question: what does this contract do for which users so that what becomes possible. Write it before you open `forge init`. The template below forces concrete nouns and verbs; if you find yourself writing "leverage" or "unlock value" you are not ready.

```
This contract does <user-visible action> for <user class> so that <decision/outcome>.
```

Worked example — a yield vault: "This contract lets monthly retail depositors deposit ETH and earn variable yield routed through Aave v3, so that they can hold a yield-bearing position without managing positions themselves." That sentence implies the whole surface area: deposit, withdraw, accounting for accrued yield, an external adapter to Aave, an admin for adapter rotation. Everything else is implementation.

Drop the framing into a `docs/spec.md` block at the top of the repo. Keep out-of-scope explicit — out-of-scope is where audits find missing checks.

```markdown
# docs/spec.md
user_action: deposit ETH; withdraw ETH + accrued yield
user_class: retail depositors holding their own keys (EOAs and Safe multisigs)
outcome: passive yield routed through Aave v3 on Optimism
out_of_scope:
  - non-ETH assets
  - leveraged positions
  - cross-chain bridging (vault is single-chain only)
  - permissioned access (anyone with ETH can deposit)
```

### Invariants

Invariants are properties that must hold across every reachable state and every call sequence. They are not unit-test assertions about one transaction — they are global truths the protocol exposes. Write them in English first, then in a Foundry invariant test before you finish the implementation. If an invariant is hard to state in one sentence, decompose it; if it cannot be tested with a fuzzer, it is not really an invariant.

Opinionated defaults for a vault-style contract:

- **Conservation**: `totalAssets()` is greater than or equal to the sum of user-owed principal. The vault never owes more than it can pay.
- **Solvency**: at any block, a full sequential withdrawal of every depositor at their current share would not revert for accounting reasons.
- **Monotonicity of share price**: in the absence of admin-triggered loss recognition, `convertToAssets(1e18)` is non-decreasing. A surprise drop indicates a bug or an external loss the protocol failed to flag.
- **Access control**: only `admin` can call functions tagged `onlyAdmin`. Stated as `forall caller != admin, call to onlyAdmin function reverts`.
- **No reentrancy reachable state**: no external call to user-controlled code happens before state writes are finalized in any deposit/withdraw path.

Encode them as Foundry invariant tests. The handler is the load-bearing part — a weak handler proves nothing.

```solidity
// test/invariant/VaultInvariants.t.sol
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vault} from "src/Vault.sol";
import {VaultHandler} from "./VaultHandler.sol";

contract VaultInvariants is Test {
    Vault internal vault;
    VaultHandler internal handler;

    function setUp() public {
        vault = new Vault();
        handler = new VaultHandler(vault);
        targetContract(address(handler));
    }

    /// Conservation: assets under management cover all outstanding shares.
    function invariant_solvency() public view {
        uint256 owed = vault.convertToAssets(vault.totalSupply());
        assertGe(vault.totalAssets(), owed, "vault is insolvent");
    }

    /// Share price is monotonic in the absence of admin loss recognition.
    function invariant_sharePriceMonotonic() public view {
        assertGe(vault.convertToAssets(1e18), handler.lastSharePrice());
    }
}
```

Run with `forge test --match-contract VaultInvariants --fuzz-runs 50000`. A passing invariant suite at 50k runs is a precondition for audit submission — not a substitute for it.

### Threat model

A threat model names who attacks, with what capabilities, on what time horizon, and — critically — who you do not defend against. Skipping the last part is how teams ship contracts that are "secure" against an unspecified adversary and break against a real one.

Rubric, in order of how often each is skipped:

- **Capabilities**: what can the attacker do on-chain. Concretely: deploy arbitrary contracts, hold arbitrary token balances, call any public function in any order, observe and reorder mempool transactions (front-running), pay arbitrary gas, hold flash-loan-scale capital (think hundreds of millions of dollars for a single transaction on mainnet), submit governance proposals if your protocol has on-chain governance, manipulate spot prices on thin DEX pools.
- **Time horizon**: are we defending across one block (atomic flash-loan attack), one transaction batch (sandwich), a governance timelock window (typically 24-72 hours), or months (slow-roll oracle drift). Different defenses apply at each horizon.
- **Out of scope**: name them. Common honest answers: nation-state actors capable of reorgs on L1, the chain itself going down or censoring, supply-chain compromise of a dependency outside the audit boundary, social-engineering of the multisig signers, an exploit in the underlying L2 sequencer.

Concrete attack scenarios to write down before audit:

- **Oracle manipulation**: an adversary moves the price reported by a feed (spot DEX TWAP on a thin pool, a stale Chainlink feed during a fast move) and exploits a function that trusts it. Defense: use a Chainlink feed with a heartbeat check and a deviation circuit-breaker, never a single-block DEX spot price.
- **Governance proposal abuse**: an adversary accumulates governance tokens (or buys voting power via a flash loan against a vulnerable token design) and pushes a malicious proposal — for example, upgrading the vault implementation to one that drains funds. Defense: timelock all upgrade and parameter changes; size the timelock to the off-chain alerting and response window.
- **Reentrancy via callbacks**: any function that makes an external call into user-controlled code before finalizing state is vulnerable. Defense: checks-effects-interactions, plus `nonReentrant` on every function that touches accounting. Treat ERC-777, ERC-1363, and any token with transfer hooks as user-controlled code for this purpose.
- **Front-running and MEV**: on a public mempool, any profitable action you broadcast is visible. Defense: commit-reveal for sensitive ordering, private mempools (Flashbots Protect) for admin actions, or making the action order-independent. Sandwich-resistance for swaps means a strict slippage cap on every quote, sourced from the caller and not from an oracle the attacker can move.
- **Donation / inflation attack**: an attacker deposits a tiny first share, then transfers a large amount directly to the vault address to inflate share price and round the next depositor's shares to zero. Defense: virtual shares / dead shares in the ERC-4626 implementation, or an initial deposit by the deployer that is permanently locked.

### Trust assumptions

Every contract trusts something. The job here is to make each trust explicit, paired with the failure mode if the trust is misplaced. The list below is the minimum for a DeFi vault — extend it for your specific design.

- **Price oracle (Chainlink ETH/USD on the target chain)**: trusted to be correct within the configured deviation and heartbeat. If it fails — feed goes stale during a fast move, or the off-chain operators collude — the vault can mis-price deposits and withdrawals. Mitigation: pause-on-stale check (`updatedAt` is within the heartbeat window) and an emergency pause that the multisig can trigger.
- **Upgrade admin (3-of-5 Safe multisig)**: trusted to act in users' interest and to keep keys secure. If three signers are compromised, they can upgrade the vault to drain funds. Mitigation: 48-hour timelock on every upgrade; off-chain monitoring with on-call alerting; a separate guardian role with veto power on suspicious upgrades but no positive authority.
- **Underlying protocol (Aave v3)**: trusted to honor its own accounting and not to grief depositors. If Aave's pool is compromised, the vault inherits the loss. Mitigation: cap exposure per adapter; document the inherited risk in the user-facing README.
- **Solidity compiler and toolchain**: trusted to compile source to faithful bytecode. Mitigation: pin a specific `solc` version (e.g. `0.8.24`), reproducible builds via Foundry's `forge build --deterministic`, and verified source on Etherscan.
- **The chain itself**: trusted not to reorg meaningfully or to censor the contract. For L2s, also trusted to honor its withdrawal-window guarantees. Document the chain-specific risk (e.g. "this protocol is deployed on Base; a Base sequencer outage halts deposits and withdrawals until it recovers").

Each line is a documented risk. Surface them in the user-facing docs — not just in the audit report — so depositors can size their exposure.

### Success metrics

State success in concrete numbers, written before launch. Vague goals ("be secure", "have lots of users") let the team declare victory after any outcome. Three categories to name:

- **Economic security**: a $-TVL bar paired with a no-exploit time horizon. Example: `$50M TVL with no successful exploit in the first 6 months post-launch`. The dollar figure forces the team to size the bug bounty (a useful default: 10% of TVL up to a cap), and the time horizon forces a monitoring commitment.
- **Gas budget**: per-function ceilings on the target chain, measured by `forge snapshot`. Example: `deposit costs less than 200k gas on Optimism; withdraw less than 250k`. Encode these as snapshot tests in CI so a regression breaks the build, not just makes things slightly more expensive.
- **Capability counts**: scale targets that drive design. Example: `supports 10,000 unique depositors without unbounded loops`, or `supports adapter rotation without migrating user balances`. Each capability target rules out a class of naive implementations (no `address[] depositors` you iterate over).

```solidity
// test/gas/Snapshot.t.sol
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {Vault} from "src/Vault.sol";

contract GasSnapshot is Test {
    Vault internal vault;
    address internal user = address(0xBEEF);

    function setUp() public { vault = new Vault(); vm.deal(user, 10 ether); }

    function test_gas_deposit() public {
        vm.prank(user);
        uint256 g = gasleft();
        vault.deposit{value: 1 ether}();
        uint256 used = g - gasleft();
        assertLt(used, 200_000, "deposit exceeds gas budget");
    }
}
```

A few more disciplines that pay off late but cost little up front:

- **Deployment script as code**: the canonical deployment lives in `script/Deploy.s.sol`, not in a one-off REPL session. Anyone should be able to reproduce mainnet bytecode from a tagged commit.
- **Pause-and-recover drill**: before mainnet, simulate the full incident response on a fork — the multisig signs, the contract pauses, an exploit is contained, an upgrade is queued through timelock, and depositors are made whole. If the runbook is not exercised, it does not exist.
- **Post-deploy verification**: verified source on Etherscan or the L2 explorer, a published address registry (one line per chain) committed to the repo, and a public read-only dashboard for the invariant metrics so anyone can re-derive solvency from on-chain state.

Taken together — framing, invariants, threat model, trust assumptions, success metrics — these five sections are what an auditor will ask for in the kickoff call. Write them before you ship, commit them next to the contracts, and treat any drift as a scope change that requires re-auditing.
