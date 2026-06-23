---
name: web3-access-control
description: >-
  Role-based access control for smart contracts — Ownable2Step, OpenZeppelin AccessControl, Safe multisig as admin,
  TimelockController on dangerous ops, role separation, and decentralization via renouncing
topics:
  - web3
  - access-control
  - openzeppelin
  - multisig
  - timelock
volatility: fast-moving
last-reviewed: 2026-06-23
version-pin: OpenZeppelin Contracts 5.x
sources:
  - url: https://docs.openzeppelin.com/contracts/5.x/access-control
    anchor: '#access-control'
    hash: sha256:65c290c7131d4ddfdc20cc66d96d9d0b1de761d0cadb70aa8be14e3b057f7f27
    retrieved: 2026-06-23
  - url: https://docs.safe.global/home/what-is-safe
    anchor: '#safe-multisig'
    hash: sha256:e3c7d621e8eb78e2fc5307695499dcea4985e478a123d3593d806665add8eb60
    retrieved: 2026-06-23
---

Most contract exploits are not novel cryptography — they are either missing access-control checks ("anyone can call `setFeeRecipient`") or a single admin key getting drained, phished, or coerced. Access control is the answer to three questions: who can change what, when can they change it, and whose consent is required to authorize the change. A protocol whose answer is "the deployer EOA, immediately, alone" is a protocol one phishing email away from a post-mortem. Production-grade access control replaces each of those answers with a deliberate engineering choice: granular roles, time-locked execution windows, and multi-party signing.

## Summary

Default to OpenZeppelin's `AccessControl` over `Ownable` for anything heading to mainnet — multiple narrow roles beat one omnipotent owner, and revocation lets you respond to a key compromise without a redeploy. When you do need single-admin semantics in an early prototype, use `Ownable2Step` not raw `Ownable`, so a fat-fingered transfer to a wrong address cannot brick your protocol. The admin role itself should live on a Safe multisig — 2-of-3 minimum, 3-of-5 typical for serious TVL — with signers on different hardware in different physical locations. Wrap every irreversible operation (upgrades, treasury drains, fee-cap changes, oracle swaps) in a `TimelockController` with a 24–72 hour delay so users can exit if a malicious or compromised proposal lands. Separate `MINTER_ROLE`, `PAUSER_ROLE`, `UPGRADER_ROLE`, and `TREASURER_ROLE` to distinct multisigs where the budget allows, and renounce roles you no longer need once decentralization milestones are reached.

## Deep Guidance

### Ownable vs AccessControl

`Ownable` gives you exactly one privileged address — the `owner` — and one modifier, `onlyOwner`. That is fine for a hackathon contract or a private prototype. It is wrong for anything production-bound, because every privileged operation in your protocol now collapses to the same key: pausing, upgrading, withdrawing treasury, rotating oracle, minting. Compromise that key and the attacker gets everything in one transaction.

The post-mortem pattern is depressingly consistent: protocol launches with `Ownable` and a single key on a laptop, team plans to "migrate to a multisig later," the migration keeps slipping because nothing is on fire, the laptop is compromised, attacker calls every `onlyOwner` function in a single transaction, protocol is drained. The fix is not "be more careful with the key" — it is to never have a contract whose privileged surface is one key in the first place.

`AccessControl` from OpenZeppelin gives you `bytes32`-identified roles, each independently grantable and revocable, gated by an `onlyRole(ROLE)` modifier. The `DEFAULT_ADMIN_ROLE` controls grants and revocations; everything else is whatever you define. Default to `AccessControl` for production:

```solidity
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract Protocol is AccessControl {
    bytes32 public constant MINTER_ROLE   = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin); // admin can grant/revoke others
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        // ...
    }
}
```

`AccessControl` also gives you `hasRole(role, account)` for off-chain queries (your indexer, your dashboard, your audit checklist), `getRoleAdmin(role)` for understanding the grant hierarchy, and the standard `RoleGranted` / `RoleRevoked` / `RoleAdminChanged` events for the kind of monitoring an EOA owner cannot offer. The auditability of the system is itself a security property — when every grant lands as an indexed event, missing or unexpected role grants are observable, not invisible.

`Ownable` makes sense in exactly one narrow case: a brand-new contract where you genuinely have only one privileged action and you will migrate to `AccessControl` before mainnet. Anything else, reach for `AccessControl` from the first commit.

The two are not mutually exclusive at the protocol level — you can have an `Ownable2Step` factory that deploys `AccessControl`-based clones — but pick one as the canonical access pattern for any given contract. Mixing `onlyOwner` and `onlyRole(DEFAULT_ADMIN_ROLE)` in the same contract is a footgun: reviewers have to mentally re-derive which check actually gates a given function, and a future maintainer will inevitably gate one function with the wrong modifier.

### Two-step ownership transfer (Ownable2Step)

If you must use `Ownable`, use `Ownable2Step`. Raw `Ownable.transferOwnership(newOwner)` is a single-call transfer: type the wrong address (zero-knowledge-proof copy-paste hash, address with one character flipped, an address that is actually a contract that cannot accept ownership) and your protocol is now owned by a black hole. There is no recovery.

`Ownable2Step` requires the recipient to actively `acceptOwnership` in a second transaction:

```solidity
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract Treasury is Ownable2Step {
    constructor(address initialOwner) Ownable(initialOwner) {}
    // existing owner calls transferOwnership(newOwner); pendingOwner = newOwner
    // newOwner calls acceptOwnership(); owner = newOwner, pendingOwner = 0
}
```

The pending-owner pattern means a wrong address simply never accepts, the transfer expires harmlessly, and you try again. Never deploy raw `Ownable` to mainnet — the fat-fingering risk is real and the cost of `Ownable2Step` is one extra transaction at handoff time. The same two-step pattern applies inside `AccessControl` for admin-role transfers: grant the new admin first, verify they hold the role, then revoke the old one. Atomic role swaps with no overlap are the same hazard as one-step ownership transfers.

Real-world incidents have happened where a team intended to transfer ownership to a multisig but pasted an address that was actually a contract with no payable fallback, or an address from the wrong network's deployment — in both cases the new owner could neither act on the contract nor recover from the mistake. Two-step transfer makes both classes of error visible during the pending window: the recipient calls `acceptOwnership` from the intended address or the handoff fails safely.

A quick decision tree for new contracts:

- One privileged action, prototype scope, throwaway deploy → `Ownable` is fine.
- One privileged action, mainnet deploy, single admin → `Ownable2Step` only.
- Two or more privileged actions, or any mainnet deploy with meaningful TVL → `AccessControl`.
- Any contract that may be upgraded later → `AccessControl` from day one, because retrofitting roles into a deployed `Ownable` contract via upgrade is painful and error-prone.

### Roles via OpenZeppelin AccessControl

Roles are `bytes32` identifiers, by convention `keccak256("ROLE_NAME")`. Define each role as a `public constant` so off-chain tooling can read it from the ABI. Use `_grantRole` and `_revokeRole` inside the constructor or admin functions; user-facing grants go through `grantRole(role, account)` which is gated by the role's admin (defaults to `DEFAULT_ADMIN_ROLE`). Never hand-compute the bytes32 literal in code reviews — paste the keccak256 call instead, because reviewers compare role definitions across files by their string name, not by their hash.

```solidity
bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

constructor(address adminMultisig, address treasurerMultisig) {
    _grantRole(DEFAULT_ADMIN_ROLE, adminMultisig);
    _grantRole(TREASURER_ROLE, treasurerMultisig);
}

function withdrawFees(address to, uint256 amount) external onlyRole(TREASURER_ROLE) {
    // ...
}
```

A subtle hazard with `_grantRole` in constructors: if you grant `DEFAULT_ADMIN_ROLE` to two addresses (say, an EOA deployer and the eventual multisig), you have just doubled your attack surface for the entire lifetime of the contract. Grant exactly one admin from the constructor, then have that admin perform any further grants in a subsequent transaction so the on-chain history records each privilege handoff as a distinct event.

Set distinct admin roles per role with `_setRoleAdmin(MINTER_ROLE, MINTER_ADMIN_ROLE)` when you want minter grants to require a different multisig than the protocol-wide admin. That extra layer is worth it for roles that are commonly granted (a permissioned launchpad granting minter rights to dozens of partners) so the global admin key is not constantly touched.

Emit and index the standard `RoleGranted` and `RoleRevoked` events that `AccessControl` provides for free — your off-chain monitoring (Tenderly, OpenZeppelin Defender, custom indexer) should page on any role-membership change so an unexpected grant cannot land silently. Off-chain visibility is half the value of on-chain access control: a granted role nobody noticed is the same as an unconfigured permission. Pair this with a published `roles.md` listing the canonical holder of each role so the community can independently verify that on-chain reality matches the documented governance.

A common mistake worth calling out explicitly: granting `DEFAULT_ADMIN_ROLE` to the `msg.sender` of the constructor when deploying from a CI script. The deployer EOA now permanently holds the protocol's most powerful role, and unless step two of your deploy script is a `grantRole(DEFAULT_ADMIN_ROLE, multisig)` followed by `renounceRole(DEFAULT_ADMIN_ROLE, msg.sender)` in the same forge script, you have a window where the deployer key gates everything. Bake the multisig address into the constructor or deploy script parameters and grant the admin role to the multisig directly from the constructor; never use the deployer EOA as a permanent admin.

### Multisig (Safe)

Every privileged role on mainnet goes behind a Safe — `safe.global`, formerly Gnosis Safe — never an EOA. A Safe is itself a smart contract that requires `M-of-N` signatures from configured signer addresses before executing any transaction. The trade-off is simple: an EOA owner is a single phishing email or compromised laptop away from a drained protocol; a 3-of-5 Safe survives any two signers being compromised or unavailable.

Defaults worth memorizing:

- **2-of-3** — minimum acceptable for any mainnet deployment with non-trivial value. Three signers, two required. Cheap to operate, survives one compromise.
- **3-of-5** — typical for serious TVL. Five signers (ideally with operational diversity — different team members, different geographies, different hardware vendors), three required. Survives two compromises and tolerates one signer being on vacation.
- **4-of-7 or 5-of-9** — for protocols with eight-or-nine-figure TVL or those acting as governance for a DAO treasury.

Signer hygiene matters as much as the threshold. Every signer holds their key on a hardware wallet (Ledger, GridPlus, Keystone) — never a hot wallet, never a browser extension as the sole layer. Rotate signers when team members leave: `addOwnerWithThreshold` and `removeOwner` are governance operations, not afterthoughts. Publish the current signer set and threshold in your docs so users can verify the Safe matches your stated security model. The Safe should hold `DEFAULT_ADMIN_ROLE` and any sensitive operational role; passing `safe.address` as the admin in the constructor is the standard pattern.

Two operational practices worth wiring up at deployment time:

- **Rehearse a signing ceremony before mainnet.** Have every signer connect their hardware, review the transaction in Safe's UI, simulate via Tenderly, and sign — for a no-op transaction like a self-pause-and-unpause. The first time someone signs should not be the night of an incident, and unfamiliar tooling is how `_setImplementation` gets signed by accident.
- **Threshold-aware time budget.** A 3-of-5 across three time zones means the realistic time-to-execute is hours, not minutes. Size your `Pausable` kill-switch on a tighter 2-of-3 ops Safe so emergency pauses are fast, and keep the slow `DEFAULT_ADMIN_ROLE` on the wider Safe.

### Timelock (TimelockController)

A multisig stops one compromised key. A timelock stops a compromised multisig — or, more commonly, a coerced one. `TimelockController` from OpenZeppelin sits between the multisig and the protocol: dangerous operations are first `schedule`d (recording the call hash and a delay), then `execute`d after the delay elapses. During the delay, the call is publicly visible on-chain; if it is malicious, users have time to exit.

Coercion is the often-overlooked threat model. A 3-of-5 Safe defeats one or two compromised keys but does not defeat a court order, a physical threat to multiple signers in the same jurisdiction, or social-engineering of a quorum through a coordinated phishing campaign. The timelock buys 48 hours during which the broader community can observe the proposed action, raise the alarm, and exit positions even if every signer wanted the operation to land. It also creates a real audit trail for any future post-mortem about whether the operation was legitimate.

```solidity
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

// proposers: addresses that can schedule (typically the Safe multisig)
// executors: addresses that can execute after delay (often address(0) for "anyone")
// minDelay: seconds — 48 hours is typical for protocol-altering ops
address[] memory proposers = new address[](1);
proposers[0] = safeMultisig;
address[] memory executors = new address[](1);
executors[0] = address(0); // anyone can execute after the delay
TimelockController timelock = new TimelockController(
    48 hours,   // delay
    proposers,
    executors,
    address(0)  // admin — set to 0 to lock the timelock's own params
);
```

Note the `address(0)` admin: passing zero means the timelock cannot have its own parameters (delay, proposer set, executor set) changed after deployment except through the timelock itself. That bootstraps a system where any change to the timelock's own configuration has to go through the timelock's delay — including a change to the delay itself. Leaving the admin set to an EOA or even the Safe means the multisig can shorten the delay with no warning, defeating the whole point.

Grant the protocol's `UPGRADER_ROLE`, `DEFAULT_ADMIN_ROLE`, or treasury-drain role to the `timelock` address, not to the Safe directly. The Safe proposes via `timelock.schedule(...)`; after 48 hours, anyone calls `timelock.execute(...)`. The pause kill-switch stays on the Safe directly (you cannot time-lock an emergency); the dangerous knobs are slow. Publish a monitoring feed of all scheduled operations — Tenderly Alerts, OpenZeppelin Defender, or a custom indexer — so users do not have to watch the mempool themselves.

Calibrate the delay to your protocol's exit time. A lending market where users can withdraw collateral in one transaction can run a 24h timelock; a liquid-staking protocol with a 7-day unbonding queue needs a 7-day-plus timelock or users have no real exit window. The asymmetry to avoid: a 24h timelock on an upgrade whose effect users cannot exit from in 24h is security theater. Pair the timelock with an `OperationCancelled` event so the multisig can publicly back out of a proposal mid-window if it discovers a mistake, and so users can verify cancellations rather than guess.

One pitfall worth noting: the timelock's `execute` permission. If `executors` is set to a specific address rather than `address(0)`, only that address can execute scheduled operations. Setting it to the multisig means a hostile multisig can simply refuse to execute a beneficial proposal it scheduled; setting it to `address(0)` means anyone can execute after the delay, which is almost always what you want — the multisig commits to the operation by scheduling it, and the community guarantees execution by being able to send the final transaction themselves.

### Role separation

Granular roles only matter if they are held by genuinely different parties. A `MINTER_ROLE`, `PAUSER_ROLE`, `UPGRADER_ROLE`, and `TREASURER_ROLE` all held by the same Safe collapse back to a single point of compromise — the ABI looks like role separation, but the on-chain reality is one key gating everything. Reviewers will spot this immediately; users may not, which is precisely the kind of asymmetry that destroys trust after an incident. Where the operational budget supports it, each role goes on a different multisig:

- **`MINTER_ROLE`** — held by the issuance multisig, ideally with a `MAX_MINT_PER_PERIOD` cap enforced in-contract. Compromise mints tokens; it does not drain the treasury.
- **`PAUSER_ROLE`** — held by an ops multisig with lower threshold (2-of-3) for faster incident response. Compromise pauses the protocol; it does not steal funds. Often paired with a `GUARDIAN_ROLE` that can pause but not unpause, so a noisy alert can trigger a halt without exposing the unpause power to the same hot key.
- **`UPGRADER_ROLE`** — held by a governance multisig behind the timelock. Compromise of the multisig still requires waiting out the timelock with users watching. See `web3-upgradeability.md` for the proxy-admin coupling.
- **`TREASURER_ROLE`** — held by a treasury multisig with the highest threshold and most conservative signer set. Withdrawals above a configured threshold should additionally require the timelock; small operational disbursements can bypass the delay.
- **`FEE_RECIPIENT`** — often stored as an address rather than a role; restrict who can change it with `DEFAULT_ADMIN_ROLE` behind the timelock. The fee recipient is a common phishing target because a single-line config change can redirect every protocol fee — keep it slow.

The principle: any single multisig compromise should bound the blast radius to one role's worth of damage. A pauser key getting phished should not drain the treasury.

Smaller protocols routinely cannot afford four distinct multisigs with non-overlapping signers, and that is fine — collapse to two (an "ops" Safe for pause and an "admin" Safe for everything else) rather than one. Document the consolidation honestly in your security model: "we run a single 3-of-5 Safe for all privileged roles" is a defensible position with a clear risk profile; "we have four roles" while all four point at the same address is misleading documentation and an audit finding waiting to happen.

In-contract caps are the complement to role separation: a `MINTER_ROLE` with a `MAX_MINT_PER_DAY` ceiling is materially safer than the same role without one, because a compromised minter cannot exceed the cap in a single block. Caps on the most blast-prone roles (mint rate, fee ceiling, oracle drift tolerance, withdrawal-from-treasury rate) are cheap to add at deploy time and very hard to bolt on after an incident.

### Renouncing roles

`renounceRole(role, msg.sender)` permanently removes the calling account from a role with no recovery. Use it deliberately at decentralization milestones — once the protocol parameters are frozen and the community is governing through a DAO contract, renounce `DEFAULT_ADMIN_ROLE` from the original deployer multisig so the role becomes uncallable. The on-chain renouncement is auditable proof that the team can no longer unilaterally change the protocol.

Critically, `renounceRole` only removes the role from `msg.sender` — the caller. There is no way to renounce on behalf of someone else, which is deliberate: a stolen admin key cannot be "renounced out" by the rest of the team, only revoked through normal `revokeRole` machinery. Users sometimes confuse "the team renounced ownership" (a single account dropping its own role) with "the protocol is unowned" (no account holds the admin role). The two coincide only when the team is the sole admin and explicitly renounces. Verify on-chain via `hasRole(DEFAULT_ADMIN_ROLE, account)` for every previously-privileged address, not by reading a blog post.

```solidity
// after a governance vote moves admin to a DAO timelock:
protocol.renounceRole(protocol.DEFAULT_ADMIN_ROLE(), originalDeployerMultisig);
// future grants/revokes must go through the DAO
```

Two cautions. First, renouncing is irreversible: if you renounce the only admin and then discover you needed it for an upgrade, you have bricked the upgrade path. Stage decentralization — grant the new admin first, exercise it once on a no-op operation to prove it works, then renounce the old. Second, renounce specific roles, not blanket admin: an "immutable" stage usually still wants a pauser for emergencies. Audit each role independently and decide which ones are safe to surrender.

A pragmatic decentralization ladder, in order of typical adoption:

1. **Deploy with EOA as admin** for the launch week, when bugs are likeliest and fast iteration matters. Tolerable only because TVL is still capped by deposit limits.
2. **Migrate admin to a small team Safe** (2-of-3) once the contract is stable enough that the team is no longer hot-fixing daily.
3. **Add a `TimelockController` between the Safe and the protocol** for upgrade and treasury operations. Pause stays on the Safe directly.
4. **Expand to a larger, more diverse Safe** (3-of-5 or 4-of-7) as TVL grows.
5. **Migrate admin to a DAO governance contract** that itself proposes through the timelock, once the community is real and voting power is sufficiently distributed.
6. **Renounce role-specific admin powers** as parameters are locked permanently (e.g., supply cap, fee ceiling) — turn dials into constants.

Each step is a deliberate governance event with its own announcement, monitoring window, and rollback plan. Skipping straight from step 1 to step 6 is the "rugpull-by-incompetence" pattern that bricks more protocols than malicious admins do.

See `web3-upgradeability.md` for how the proxy-admin role interacts with this access-control model, `web3-audit-workflow.md` for the operational checks an audit will run against your role wiring, and `web3-security.md` for the wider security layer this access-control model lives inside.
