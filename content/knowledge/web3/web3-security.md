---
name: web3-security
description: Layered security practices for smart contracts heading to mainnet — defense-in-depth, Checks-Effects-Interactions, pull payments, OpenZeppelin primitives, pause + multisig, and input validation discipline
topics: [web3, security, solidity, openzeppelin, defense-in-depth]
---

A smart contract is a public, immutable bank vault that anyone on the planet can call. The mempool is hostile, the bytecode is permanent, and the only patch deployment is a redeploy + migration that your users may or may not follow. Most exploits aren't novel cryptography — they're missed standard patterns: a state update after an external call, a `tx.origin` check that a phishing contract bypassed, a `transfer` to a contract that reverts and bricks an auction. Layered defense beats clever one-off mitigations, every time.

## Summary

Layer your defenses: a written spec with invariants, secure-by-construction patterns, static analysis and forge tests, an external audit, then a bug bounty — each catches what the previous layer missed. Use `Checks-Effects-Interactions` religiously and wrap any function that touches an external contract with `ReentrancyGuard` from OpenZeppelin. Prefer `pull payments` (users withdraw) over push (contract sends) so a malicious or buggy recipient cannot stall everyone else. Treat `OpenZeppelin` as your baseline — audited, well-known primitives (`AccessControl`, `Pausable`, `SafeERC20`) have fewer surprises than hand-rolled equivalents. Wire a `Pausable` kill-switch to a 2-of-N or 3-of-N Safe multisig and time-lock the truly dangerous operations.

## Deep Guidance

### Defense-in-depth layered model

Treat security as five distinct layers, each independently valuable. The point of layering is that any single layer will miss something — the protocol survives because the next layer catches it.

1. **Spec and invariants** — Before any Solidity, write down what must always be true: "total supply equals sum of balances," "no user can withdraw more than they deposited," "only governance can change fee tiers," "the protocol is solvent at every block." These become the oracle for tests, fuzzing, and audit conversations. A contract without a written invariant set is a contract whose author has not decided what "correct" means, and reviewers cannot tell you whether the code is correct against an undefined target.
2. **Secure-by-construction patterns** — CEI, pull-payments, `ReentrancyGuard`, custom errors with parameters, `immutable` where possible, explicit visibility. Most exploits target contracts that skipped one of these — the pattern existed, the author didn't reach for it.
3. **Tooling** — Slither for static analysis on every PR, Foundry fuzz and invariant tests aimed directly at the spec from layer 1, Echidna or Halmos for deeper property testing, mythril or symbolic execution where it earns its keep. CI fails the build on new Slither high/medium findings; coverage gates keep the test suite from rotting.
4. **Audit** — One or two reputable firms (Trail of Bits, OpenZeppelin, Spearbit, Code4rena contest). Audit late enough that the code is frozen, early enough that fixes don't push the launch. Code freeze before audit, no scope creep during. Treat every finding — even "informational" — as a real signal about your design.
5. **Bug bounty** — Immunefi or Cantina, sized to the TVL at risk. A $50k bounty on a $50M protocol is an insult to whitehats and an invitation to blackhats; scale rewards to the prize. Run the bounty continuously, not for a launch week and then off.

See `web3-audit-workflow.md` for the tooling integration details and `web3-common-vulnerabilities.md` for the SWC-level checklist that audits work through.

### Checks-Effects-Interactions

The single most important pattern in Solidity. Order every state-changing function as: (1) **Check** preconditions and inputs, (2) update **Effects** in storage, (3) make external **Interactions** last. Reentrancy exploits work by letting an attacker re-enter your function before step 2 has run; CEI removes that window.

Vulnerable:

```solidity
function withdraw() external {
    uint256 amount = balances[msg.sender];
    (bool ok, ) = msg.sender.call{value: amount}(""); // INTERACTION first
    require(ok, "send failed");
    balances[msg.sender] = 0;                          // EFFECT after — exploitable
}
```

Corrected with CEI plus `ReentrancyGuard` as a belt-and-braces backstop:

```solidity
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vault is ReentrancyGuard {
    mapping(address => uint256) public balances;
    error NothingToWithdraw();
    error TransferFailed();

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];     // CHECK
        if (amount == 0) revert NothingToWithdraw();
        balances[msg.sender] = 0;                  // EFFECT (before interaction)
        (bool ok, ) = msg.sender.call{value: amount}(""); // INTERACTION last
        if (!ok) revert TransferFailed();
    }
}
```

`nonReentrant` is cheap insurance for the case where you, or a future maintainer, miss a CEI ordering somewhere subtle (cross-function reentrancy, view-function reentrancy on read-after-write).

### Pull-payments over push

Never proactively send funds to N users in a loop. One reverting recipient bricks the whole batch — a single griefing contract can stall every auction, raffle, or dividend you ship. Instead, credit each user's balance in storage and let them pull:

```solidity
mapping(address => uint256) public pending;

function _credit(address user, uint256 amount) internal {
    pending[user] += amount;
}

function claim() external nonReentrant {
    uint256 amount = pending[msg.sender];
    if (amount == 0) revert NothingToWithdraw();
    pending[msg.sender] = 0;
    (bool ok, ) = msg.sender.call{value: amount}("");
    if (!ok) revert TransferFailed();
}
```

The contract's job is bookkeeping; the user's job is taking custody. If their withdrawal fails — recipient is a contract that reverts, ran out of gas, or hit a blacklist — only they are affected, and they can fix it on their side without coordinating with everyone else in the queue. OpenZeppelin's `PullPayment` contract is a drop-in implementation if you want one less thing to write.

The rare exceptions where push is acceptable: payouts to a single, trusted address you control (your treasury); ERC-20 `transfer` calls inside `SafeERC20` where you've already validated the recipient. Even then, never wrap a push in a user-iterating loop.

### OpenZeppelin as baseline

Pin a specific OpenZeppelin Contracts version in `foundry.toml` remappings and inherit from their primitives instead of hand-rolling. The core set worth knowing cold:

- `ReentrancyGuard` — the `nonReentrant` modifier shown above. Tracks a `_status` slot to reject reentrant calls cheaply.
- `Pausable` — `whenNotPaused` modifier on user-facing entry points; emergency `_pause()` callable by a privileged role. Pair with `AccessControl` so the pauser role is granular and revocable.
- `AccessControl` — role-based permissions instead of a single `owner`. Lets you separate `PAUSER_ROLE`, `UPGRADER_ROLE`, and `TREASURER_ROLE` to different keys, with `DEFAULT_ADMIN_ROLE` controlling grants. Deep dive in `web3-access-control.md`.
- `SafeERC20` — `safeTransfer`, `safeTransferFrom`, `forceApprove`. Handles non-standard tokens that don't return a bool (USDT) and the approve-race-condition pattern. Use it for every ERC-20 interaction without exception.
- `EIP712` and `Nonces` — typed structured signatures and replay-protected nonces when you need permit-style or meta-tx flows.

These are audited, widely deployed, and reviewed continuously by the ecosystem. A hand-rolled `nonReentrant` will pass review once and then rot as the team rotates; OZ's gets re-validated every release and every external audit of every protocol that uses it. Pin the version (`@openzeppelin/contracts@5.0.2`) in `package.json` and the remapping so an `npm update` cannot silently swap your security primitives, and read the changelog before upgrading — major versions occasionally change defaults (initializer patterns, role bytes32 encoding) in ways that matter.

### Pause + emergency multisig

Wire a kill-switch on every entry point that moves funds, and put the pause key behind a Safe multisig — never an EOA. Two-of-three for small protocols, three-of-five for serious TVL, with signers on different hardware in different physical locations.

```solidity
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract Market is AccessControl, Pausable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    constructor(address multisig) {
        _grantRole(DEFAULT_ADMIN_ROLE, multisig); // multisig owns role management
        _grantRole(PAUSER_ROLE, multisig);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    function trade(uint256 amount) external whenNotPaused {
        // ... real logic ...
    }
}
```

Anything irreversible — upgrading an implementation, draining the treasury, raising fee caps, changing oracle sources — goes behind a `TimelockController` with a 24–72 hour delay so users have time to exit if the multisig is compromised or coerced. The pause itself stays instantaneous (you can't time-lock an emergency); the dangerous knobs are slow.

Two adjacent practices worth wiring up at the same time:

- Publish a public dashboard or `roles.md` of who holds which role and where the timelock points, so users can verify the kill-switch exists and is wired correctly. An invisible kill-switch is a trust claim, not a security control.
- Rehearse a pause-and-recover with the multisig signers at least once before mainnet so the first time someone signs is not the night of an incident. Practice the unhappy path: signer unavailable, hardware wallet bricked, mis-typed function selector.
- Subscribe the multisig to an on-chain monitoring service (OpenZeppelin Defender, Forta, Tenderly Alerts) that pages on anomalous activity — large withdrawals, oracle deviation, paused-state changes. The kill-switch is only useful if someone is watching.

### Input validation and visibility

Validate every input at the public boundary with custom errors that carry the offending values — they're cheaper than revert strings and far more useful when triaging a failed tx:

```solidity
error AmountZero();
error AmountExceedsCap(uint256 requested, uint256 cap);
error RecipientZero();

uint256 public immutable cap;            // immutable: set in constructor, never changes
uint8 public constant DECIMALS = 18;     // constant: known at compile time

function deposit(address to, uint256 amount) external whenNotPaused {
    if (to == address(0)) revert RecipientZero();
    if (amount == 0) revert AmountZero();
    if (amount > cap) revert AmountExceedsCap(amount, cap);
    // ...
}
```

Mark functions `external` rather than `public` unless you call them internally — `external` is cheaper and signals "this is an entry point, audit the inputs." Use `immutable` for constructor-set values (deploy-time addresses, supply caps, the multisig address) and `constant` for compile-time literals; both save gas and tell the reader "this cannot change," which is itself a security property. Default state variables to `private` or `internal` and expose specific getters where you need them, rather than leaning on `public` which generates a getter you may not have meant to commit to as part of the ABI.

Custom errors with parameters are strictly better than `require(cond, "string")`: they're cheaper, they survive ABI decoding so off-chain tools can show the failing values, and they force you to name the failure mode rather than describe it. Reserve `require` strings for one-off scripts and tests.

### What NOT to use

- **`tx.origin` for authorization** — `tx.origin` is the EOA that started the transaction, which a phishing contract can trick a user into being. Always check `msg.sender` (the immediate caller). `tx.origin` is acceptable only for narrow checks like "refuse to be called by any contract" (`require(tx.origin == msg.sender)`), and even that is fragile in a post-EIP-3074 / account-abstraction world.
- **Raw low-level `call` without checking return data** — `(bool ok, ) = addr.call(...)` ignores the actual return payload; an unverified `ok` says "the call returned," not "the call succeeded as intended." Use `SafeERC20` for tokens and check `ok` plus decode return data for everything else. Bubble up the revert reason where the caller cares.
- **Unbounded loops over user-supplied arrays** — gas grows with N, an attacker submits a million-element array, the function reverts forever and locks whatever it gated. Cap input lengths or paginate. The same hazard applies to iterating over a `users` mapping that anyone can grow.
- **Calling arbitrary user-supplied addresses** — every external call is a trust boundary. Whitelist the targets you call (routers, oracles, your own modules) via an admin-managed allowlist; never `target.call(data)` where `target` came from `msg.sender`. If the protocol genuinely needs to integrate with arbitrary external contracts, isolate the interaction in a sandbox contract with no privileges and no funds beyond the immediate call's value.
- **`block.timestamp` for fine-grained ordering or randomness** — miners (or proposers post-merge) have a small window to nudge it. Fine for "did 24 hours pass since deploy"; not fine for "who got the millisecond-precise winning bid" or as an entropy source.
