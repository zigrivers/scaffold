---
name: web3-common-vulnerabilities
description: >-
  SWC-style checklist of the most-exploited Solidity bugs — reentrancy, delegatecall hazards, signature replay,
  front-running, unchecked calls, unbounded loops, and the small set of patterns that catch them
topics:
  - web3
  - vulnerabilities
  - security
  - swc
  - solidity
volatility: fast-moving
last-reviewed: 2026-06-25
version-pin: SWC Registry
sources:
  - url: https://swcregistry.io/
    anchor: '#smart-contract-weakness-classification'
    hash: sha256:ed54ed99fdbb30267dfb0a4c3d52013f8a873b3dc1e3b29d14e01485b0b64218
    retrieved: 2026-06-25
  - url: https://consensys.github.io/smart-contract-best-practices/
    anchor: '#known-attacks'
    hash: sha256:c36192265bf3322e75552f73527415de8a6b34b481ec6b2cfa2e12b52b329dbe
    retrieved: 2026-06-25
---

The most-exploited contract bugs are usually the same handful, recycled across protocols by attackers who know exactly which patterns auditors and authors keep missing. Internalize this checklist; gate every PR with Slither and Foundry tests so the mechanical findings never reach review; require a dedicated reviewer pass for any change that touches the patterns below. Where this doc is the SWC-style enumeration of "what goes wrong," `web3-security.md` is the practices doc on "how to build so it doesn't" — read both, and treat `web3-audit-workflow.md` as the tooling glue.

## Summary

There are roughly ten vulnerability classes that account for the overwhelming majority of historical losses, and almost every one has a standard mitigation. Slither catches a meaningful subset — unchecked low-level calls, `tx.origin` auth, obvious reentrancy — in CI, before a human ever sees the diff. Foundry fuzz and invariant tests catch another slice when the spec is written down: balance conservation, monotonic nonces, no-free-mint. Manual review catches the rest — the cross-function reentrancy, the subtle `delegatecall` target, the signature missing a chain ID. None of these layers is sufficient alone, and "we couldn't find a problem" is not the same as "there is no problem."

## Deep Guidance

### Reentrancy

The classic exploit: an external call to a user-controlled address re-enters the same function (or a sibling) before storage is updated, letting the attacker drain a balance N times. Solve it structurally with Checks-Effects-Interactions, and defensively with OpenZeppelin's `nonReentrant`.

Vulnerable:

```solidity
function withdraw() external {
    uint256 amount = balances[msg.sender];
    (bool ok, ) = msg.sender.call{value: amount}(""); // re-entry happens here
    require(ok, "send failed");
    balances[msg.sender] = 0;                          // too late
}
```

Fixed:

```solidity
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vault is ReentrancyGuard {
    mapping(address => uint256) public balances;
    error Empty();
    error TransferFailed();

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert Empty();
        balances[msg.sender] = 0;                              // effect before
        (bool ok, ) = msg.sender.call{value: amount}("");      // interaction last
        if (!ok) revert TransferFailed();
    }
}
```

Cross-function and read-only reentrancy (a view function reads stale state during a reentrant call) both exist — `nonReentrant` on every state-touching external is cheap insurance.

### Integer over/underflow

Solidity 0.8+ inserts overflow checks into every arithmetic op by default; the famous 2018 BatchOverflow-style bugs are no longer reachable in idiomatic code. The remaining risk is the `unchecked { ... }` escape hatch and importing legacy `<0.8` libraries unguarded. Use `unchecked` only where overflow is provably impossible (loop counters bounded by a checked length) and leave a comment:

```solidity
for (uint256 i = 0; i < items.length; ) {
    // ... body ...
    unchecked { ++i; } // bounded by items.length, cannot overflow
}
```

### Front-running (MEV)

Every pending transaction is public; searchers and builders can reorder, sandwich, or front-run anything price-sensitive. For auctions, oracle updates, and competitive ops, use a commit-reveal scheme so bids are not visible until reveal:

```solidity
mapping(address => bytes32) public commits;

function commitBid(bytes32 hash) external { commits[msg.sender] = hash; }

function revealBid(uint256 bid, bytes32 salt) external payable {
    require(keccak256(abi.encode(bid, salt, msg.sender)) == commits[msg.sender], "bad reveal");
    require(msg.value == bid, "value != bid");
    // ... resolve auction ...
}
```

For one-shot user txs that must not be sandwiched, route through Flashbots Protect or a private mempool RPC. Quote slippage tolerances and deadlines on every swap.

### `delegatecall` hazards

`delegatecall` runs target bytecode against the caller's storage and `msg.sender` — the foundation of upgradeable proxies, and a foot-cannon if the target address is attacker-controlled. Never `delegatecall` to an unvalidated address:

```solidity
// VULNERABLE — total takeover
function forward(address target, bytes calldata data) external {
    (bool ok, ) = target.delegatecall(data);
    require(ok);
}
```

If you need a proxy, use OpenZeppelin's `ERC1967Proxy` / `UUPSUpgradeable` with an admin-gated `_authorizeUpgrade`, and pin the implementation address in `immutable` storage where the architecture allows.

### Unchecked external calls

Low-level `.call`, `.delegatecall`, and `.staticcall` return `(bool ok, bytes memory)`. Ignoring `ok` silently swallows reverts:

```solidity
// VULNERABLE
recipient.call{value: amount}("");

// FIXED
(bool ok, ) = recipient.call{value: amount}("");
if (!ok) revert TransferFailed();
```

For ERC-20, use OpenZeppelin's `SafeERC20.safeTransfer` / `safeTransferFrom` — they handle non-standard tokens (USDT) that don't return a bool and revert on failure.

### Signature replay (EIP-712 + nonces)

A signature without a nonce, chain ID, and contract address can be replayed forever, on every chain. Use EIP-712 typed data with a per-signer nonce that increments on every accepted signature:

```solidity
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA}  from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract Permit is EIP712 {
    mapping(address => uint256) public nonces;
    bytes32 private constant TYPEHASH =
        keccak256("Claim(address user,uint256 amount,uint256 nonce,uint256 deadline)");

    constructor() EIP712("MyProtocol", "1") {}

    function claim(address user, uint256 amount, uint256 deadline, bytes calldata sig) external {
        require(block.timestamp <= deadline, "expired");
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(TYPEHASH, user, amount, nonces[user]++, deadline))
        );
        require(ECDSA.recover(digest, sig) == user, "bad sig");
        // ... pay out ...
    }
}
```

The domain separator already includes `chainid` and `address(this)`, so the same signature cannot be replayed on another chain or fork.

### DoS via unbounded arrays

Looping over user-controlled arrays grows gas with N; an attacker grows N until the function reverts forever, bricking whatever it gated. Anti-pattern:

```solidity
// VULNERABLE — one griefer locks every payout
function distribute() external {
    for (uint256 i; i < recipients.length; ++i) {
        (bool ok, ) = recipients[i].call{value: shares[i]}("");
        require(ok); // any reverting recipient halts everyone
    }
}
```

Convert to pull payments: credit each recipient in storage and let them withdraw individually. Same fix for any "iterate over all users" loop — cap input length, paginate, or invert control.

### Approve-and-pull race

ERC-20 `approve(spender, N)` is vulnerable to a known race: a spender watching the mempool can spend the old allowance, then the new one, ending up with `old + new`. Mitigate one of three ways: (1) set allowance to `0` first, then to the new value in a second tx; (2) use `increaseAllowance` / `decreaseAllowance` on tokens that support them; (3) use OpenZeppelin's `SafeERC20.forceApprove` which handles the zero-reset under the hood. For new code, prefer EIP-2612 `permit` so allowance and use happen atomically in one tx.

### `tx.origin`

`tx.origin` is the EOA that started the transaction tree; `msg.sender` is the immediate caller. A phishing contract that tricks a user into calling it can pass any `tx.origin` check while `msg.sender` is the malicious contract. Authorize with `msg.sender`, always:

```solidity
modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; } // correct
// require(tx.origin == owner)  // WRONG — phishable
```

The only narrow use is `require(tx.origin == msg.sender)` to refuse contract callers, and even that is increasingly fragile under account abstraction (EIP-4337) and EIP-3074.

### Self-destruct deprecation

`SELFDESTRUCT` no longer deletes code or storage after EIP-6780 (Dencun, March 2024) — it only forwards the ETH balance, and only fully self-destructs if called in the same tx that created the contract. Audits and tooling still flag it; treat it as effectively removed, never rely on it for upgrade or wipe semantics, and migrate any legacy code that did.
