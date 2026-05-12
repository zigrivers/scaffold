---
name: web3-oracles-and-external-data
description: Oracle discipline for smart contracts — Chainlink price feeds with staleness/decimals/sign checks, TWAP for DEX prices, VRF for randomness, and fallback patterns that fail safe
topics: [web3, oracles, chainlink, security]
---

A smart contract is a deterministic state machine in a closed universe. The real world — ETH/USD, the weather in Lagos, the winner of last night's match, a genuinely random number — is none of those things. Oracles are the bridge between the two, and every bridge is a new attack surface with its own trust assumptions, latency, and failure modes. The job is not to remove the trust assumption (you cannot) but to make the bridge robust enough that an exploit costs more than the protocol holds. Most "oracle hacks" are not novel cryptography either — they are missed standard patterns: an unchecked staleness, a spot price used where a TWAP belonged, a `block.timestamp` standing in for entropy.

## Summary

Prefer `Chainlink` price feeds via `AggregatorV3Interface` and validate every read: positive `answer`, recent `updatedAt`, `answeredInRound >= roundId`, and normalize by `feed.decimals()` rather than assuming 18. Reject answers older than your tolerance (typically 2× heartbeat plus a small buffer) — a stale feed is worse than no feed because it lies confidently. Never use `block.timestamp` for pricing or randomness, and never use a DEX spot price for anything an attacker can sandwich with a flash loan; use a Uniswap V3 `TWAP` of at least 30 minutes for high-value paths and Chainlink VRF for randomness that matters. When the staleness check fails, fail safe: revert or pause the protocol. Cross-chain data adds another trust layer — budget for it explicitly.

## Deep Guidance

### The oracle problem

A contract cannot see outside the EVM. Anything off-chain — price, time-of-flight, sports score, weather, random bytes — has to be pushed in by an external actor, and that actor becomes a trust dependency. The dependency does not disappear by calling it "decentralized"; a Chainlink feed is more robust than a single signer, but it is still a set of nodes you did not audit, on a schedule you did not pick, reporting a number whose derivation you cannot reproduce on-chain. Treat every oracle read as a privileged input that crosses a trust boundary (see `web3-security.md` for the trust-boundary stance and `web3-architecture.md` for how to draw the boundary in your contract layout). Cheap protocols die from oracle attacks more often than from reentrancy in 2026 — the EVM-side patterns are well known, the off-chain edges are where the surprises live.

Three properties define an oracle's risk surface and you have to think about each one independently: **authenticity** (is this value really from the source it claims?), **timeliness** (was it produced recently enough to still be true?), and **manipulation cost** (how expensive is it for an attacker to move the value to a number that drains the protocol?). A signed Chainlink response is authentic and reasonably timely but its manipulation cost is set by the consensus of the node operator set. A Uniswap spot price is authentic and instantaneous but its manipulation cost is one flash loan. A TWAP raises that cost in proportion to its window. The right oracle is the one whose manipulation cost exceeds the value at stake by a comfortable margin — and "comfortable margin" gets larger as TVL grows.

### Chainlink price feeds

Chainlink's `AggregatorV3Interface` is the default recommendation: decentralized off-chain consensus, on-chain aggregation, audited by multiple firms, used by every major DeFi protocol on mainnet. Read it through `latestRoundData()` and validate every field rather than trusting the tuple blindly:

```solidity
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract PriceConsumer {
    AggregatorV3Interface public immutable feed;
    uint256 public immutable maxStaleness; // seconds; e.g. 2 * heartbeat + buffer

    error StaleOracle(uint256 updatedAt, uint256 maxStaleness);
    error InvalidRound();
    error NegativeAnswer(int256 answer);

    constructor(address feedAddr, uint256 maxStaleness_) {
        feed = AggregatorV3Interface(feedAddr);
        maxStaleness = maxStaleness_;
    }

    /// @notice Returns the latest price normalized to 18 decimals.
    function latestPrice18() public view returns (uint256) {
        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();
        if (updatedAt == 0 || answeredInRound < roundId) revert InvalidRound();
        if (block.timestamp - updatedAt > maxStaleness) {
            revert StaleOracle(updatedAt, maxStaleness);
        }
        if (answer <= 0) revert NegativeAnswer(answer);
        uint8 decimals = feed.decimals();
        return _scaleTo18(uint256(answer), decimals);
    }

    function _scaleTo18(uint256 v, uint8 d) internal pure returns (uint256) {
        if (d == 18) return v;
        if (d < 18) return v * (10 ** (18 - d));
        return v / (10 ** (d - 18));
    }
}
```

The four invariants that matter on every read:

- `updatedAt > 0` — the round actually exists; a zero here means the feed has never published, usually a misconfigured address.
- `answeredInRound >= roundId` — the answer belongs to this round, not a stale one carried over by a buggy upstream. The two values should normally be equal; a strict inequality is a yellow flag worth reverting on.
- `answer > 0` — Chainlink's answer is `int256` so the type permits negatives; only `> 0` is safe to cast to `uint256` and use in price math. Equal-to-zero is also rejected because a zero price collapses divisions and lets dust amounts buy the world.
- `block.timestamp - updatedAt <= maxStaleness` — the round was published recently enough that the protocol's pricing assumptions still hold.

Miss any one and you are pricing off a number that is not what the feed currently says. Wrap the read in a single library function and have every caller route through it; do not let individual call sites re-implement the validation, because the call site that forgets `answeredInRound` is the one that gets exploited.

### Staleness checks

Chainlink feeds publish on a heartbeat — ETH/USD on mainnet is 1 hour, BTC/USD is 1 hour, most stablecoin pairs are 24 hours, L2 feeds vary. The heartbeat is the maximum time between publishes when no deviation threshold is hit; under normal market movement the feed updates more often. A reasonable `maxStaleness` is `2 * heartbeat + small buffer` — long enough that one missed heartbeat does not brick the protocol, short enough that a multi-hour outage stops trades:

```solidity
require(block.timestamp - updatedAt <= maxStaleness, StaleOracle(updatedAt, maxStaleness));
```

Source the heartbeat from Chainlink's data feed page and pin it per-feed, not per-protocol — different feeds have different cadences and treating them uniformly will either nuisance-revert on slow feeds or accept dangerously old prices on fast ones. Re-verify the heartbeat when you add or rotate a feed; Chainlink occasionally retunes parameters for low-volume pairs. A stale price is strictly worse than reverting: it tells the protocol the world looks one way when it looks another, and arbitrage will harvest the difference within a block.

Two adjacent failure modes that staleness alone does not cover and are worth wiring up: **sequencer downtime** on L2s and **circuit-breaker pinning**. On Arbitrum and Optimism, read the L2 sequencer uptime feed (`L2SequencerUptimeFeed`) before trusting any price feed — if the sequencer has been down or has just come back up within your grace period, refuse to price. Chainlink price feeds also stop updating when the upstream market hits a circuit breaker (some equity-tracked feeds, some forex pairs over weekends); a feed that has been pinned at the same value for hours has not "frozen" in any helpful sense, it is reporting a number that does not exist. Pair staleness checks with a deviation sanity check (e.g., reject reads that disagree with a TWAP by more than X%) for any feed that prices off a market that closes.

### Decimals discipline

Every feed has its own decimals and they are not always 18. ETH/USD on mainnet is 8 decimals; many forex and commodity feeds are 8; ERC-20 token amounts are usually 18 (but USDC is 6, WBTC is 8). Mixing scales is the easiest way to be off by a factor of 10^10 in a price calculation, and the bug will only show up when the price moves outside a comfortable range or when the feed is rotated.

```solidity
(, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
uint8 feedDecimals = feed.decimals();        // 8 for ETH/USD on mainnet
uint256 price18 = uint256(answer) * (10 ** (18 - feedDecimals));
```

Never hardcode decimals to 18, never cast `int256 answer` to `uint256` without checking `answer > 0` first (a negative answer becomes an astronomically large unsigned number), and document the normalization once at the boundary so downstream math can assume a single fixed-point convention.

A few decimal traps that show up repeatedly in audits:

- **Mixing token decimals with feed decimals.** A swap between USDC (6) and WBTC (8) priced off BTC/USD (8) and ETH/USD (8) requires three separate normalizations; doing them in one expression with hardcoded constants is a recipe for off-by-N errors.
- **Cross-feed math.** Computing an ETH/BTC ratio from ETH/USD and BTC/USD requires that both are read in the same units and that you divide after scaling, not before — otherwise you lose precision on the smaller denominator.
- **Feed migrations.** Chainlink occasionally re-deploys feeds with different decimals (8 → 18 conversions have happened on lower-volume pairs). Reading `feed.decimals()` once in the constructor and caching it is a bug; read it on every call, or re-read it whenever the feed address is rotated.

### Avoid `block.timestamp` for pricing/entropy

`block.timestamp` is set by the proposer and only loosely constrained — post-merge it must be strictly greater than the parent and within ~15 seconds of wall-clock, but the proposer has a window inside that range to nudge it. For "did 24 hours pass since deploy," that is fine. For "what is the price of ETH right now" or "which user wins the millisecond-precise auction" or "what are the random bytes for this NFT mint," it is not — the proposer can choose a timestamp that maximizes their MEV without ever appearing malicious. The rule is simple: never use `block.timestamp` as a pricing input and never use it as an entropy source. Use a Chainlink feed for the first and Chainlink VRF for the second.

### Randomness: VRF over prevrandao

Post-merge, `block.prevrandao` (formerly `block.difficulty`) carries the beacon chain's randomness output for the slot. It is acceptable for low-stakes randomness — a cosmetic trait roll, a tiebreaker in a small game — because the proposer's only manipulation lever is to skip their slot, which costs them the block reward. The moment the economic incentive to manipulate exceeds the slot reward (NFT lotteries, gambling, anything with a meaningful jackpot), the proposer will skip, and the next proposer rolls again. Use Chainlink VRF for anything where the prize justifies that calculation: it commits to randomness off-chain, reveals it on-chain with a verifiable proof, and the caller pays a small LINK fee per request. The pattern is request-and-callback (`requestRandomWords` then `fulfillRandomWords`), so design state transitions that tolerate the one-to-several-block delay.

The state-machine implication matters: do not let users take any action that depends on the random outcome between `requestRandomWords` and `fulfillRandomWords`. Lock the relevant state at request time (snapshot eligible participants, freeze deposits, mark the round as pending) and unlock it only inside `fulfillRandomWords`. Anything else opens a window where the user knows a randomness request is in flight and can position themselves to win or refund based on a partial view of state. Equally, never `revert` inside `fulfillRandomWords` — VRF's coordinator will mark the request as failed and you will have spent LINK for nothing; validate inputs in the request path and make the fulfillment path total.

### TWAP for on-chain DEX prices

If the price has to come from a DEX rather than a feed, never read the spot price. Spot is the marginal trade — a flash loan can move it arbitrarily within a single transaction, read the manipulated value, and snap it back, all atomically. Use Uniswap V3's time-weighted average price (TWAP) from the pool oracle, which averages the geometric mean price over a window:

```solidity
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {OracleLibrary} from "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

uint32 constant TWAP_WINDOW = 1800; // 30 minutes

function twapTick(address pool) internal view returns (int24 arithmeticMeanTick) {
    (arithmeticMeanTick, ) = OracleLibrary.consult(pool, TWAP_WINDOW);
}
```

Thirty minutes is the floor for high-value paths — anything shorter and a sufficiently funded attacker can move price across several blocks. Pick pools with deep liquidity (the cost to move a TWAP scales with TVL and window length) and increase the cardinality of the pool's observation buffer (`pool.increaseObservationCardinalityNext(...)`) so the oracle can actually serve your window.

Two TWAP failure modes to design around explicitly:

- **Insufficient cardinality.** A fresh pool starts with cardinality 1 — `consult` will revert until the buffer is grown and enough observations accumulate. Bump cardinality at deploy time and verify the pool has enough history before relying on it.
- **Low-liquidity pools.** A 30-minute TWAP on a $50K-TVL pool is not 30 minutes of security; it is 30 minutes of cheap arbitrage. Match the window to the pool's depth, not to a number you picked because it sounded conservative.

See `web3-common-vulnerabilities.md` for the canonical oracle-manipulation attack catalogue, including price-feed sandwiches and TWAP window-shortening exploits.

### Fallback patterns

When a feed fails its staleness or sanity check, you have three options. (a) **Revert** — the trade or borrow does not happen; users wait for the feed to recover. This is correct for most protocols: a brief denial of service is much cheaper than a mispriced liquidation. (b) **Secondary oracle** — fall through to a second feed (e.g., a Uniswap V3 TWAP) and use its answer. This is appropriate only when the secondary has comparable security guarantees and the protocol has explicitly designed for both; ad-hoc fallback to a cheaper oracle has caused multiple eight-figure exploits. (c) **Pause** — flip `Pausable` and stop accepting new positions until the multisig assesses the situation. Best for protocols where a multi-hour outage is acceptable and a wrong price is catastrophic (lending, perps). The default recommendation is (a) at the function level and (c) at the protocol level via a monitor that pages the on-call when staleness is observed.

Three asymmetries to keep in mind when picking the fallback. First, **write paths and read paths deserve different policies**: it can be safe to let a user close a position when the feed is stale (read-only liquidation prevention) while refusing to let them open a new one. Second, **liquidations need their own carve-out**: a frozen feed should not prevent liquidating an underwater position, because the position is underwater at the last good price too — design the liquidation path to accept a slightly older feed than the trading path. Third, **never silently fail open**: a `try`/`catch` around a feed read that returns a default value on failure is the platonic ideal of an oracle exploit; the safer pattern is explicit branching on a validated read with a named revert.

### Cross-chain data

Bringing data across chains adds another trust layer on top of the oracle: a bridge or messaging protocol whose security model is independent of the feed's. Chainlink CCIP is the most conservative choice — it reuses the same node operator set as Chainlink's price feeds and adds a separate Risk Management Network as a circuit breaker. LayerZero, Axelar, and Wormhole each have their own trust models, ranging from a small validator set to a full optimistic-style proof system; read the security pages, not the marketing pages. Treat the bridge's signer set as part of your threat model — a $100M protocol that depends on a 5-of-9 multisig bridge has, effectively, a 5-of-9 multisig oracle. Where possible, source the data natively on the chain you settle on, and bridge only what cannot be obtained locally.

A short checklist before shipping any oracle integration to mainnet:

- The feed address is `immutable` (or behind a timelocked setter), pinned to the exact contract you reviewed on the chain you reviewed it on, and the address is documented in `roles.md`.
- Staleness, decimals, sign, and `answeredInRound` are validated on every read through a single helper.
- Heartbeats are pinned per feed and re-verified before each major release.
- The fallback policy is named: revert, secondary oracle, or pause — and the choice is justified in writing.
- DEX-sourced prices use a TWAP with a window proportional to the value at stake, against a pool with cardinality high enough to serve the window.
- Randomness above a documented value threshold uses VRF; below it can use `prevrandao` but the threshold is recorded.
- An off-chain monitor (Defender, Forta, Tenderly) pages the on-call when any feed staleness, sequencer downtime, or unusual deviation is observed.

The contract cannot tell you any of these are wrong at runtime in a way that prevents loss — they are policy decisions that the deployer commits to and the auditor verifies. Write them down before the audit, not after.
