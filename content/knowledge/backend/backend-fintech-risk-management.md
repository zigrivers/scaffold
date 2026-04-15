---
name: backend-fintech-risk-management
description: Position limits, drawdown caps, circuit breakers, kill switches; pre-trade and post-trade risk checks; operational risk controls.
topics: [backend, fintech, risk, position-limits, drawdown, circuit-breakers, kill-switch, pre-trade-checks]
---

Risk management in a trading system is the set of controls that stops a bad day from becoming a catastrophic one. It lives in two places: *before* an order goes to the broker (pre-trade checks that block) and *after* fills land (post-trade monitoring that alerts, throttles, or halts). Neither half is optional, and both are exercised continuously, not just during incidents.

## Summary

There are two classes of controls and both are mandatory. Pre-trade checks run synchronously in the order-submission path and block an order before it ever reaches the broker wire — max order size, max position per symbol, max portfolio leverage, margin/buying-power available, restricted-symbol list (hard blocks for sanctions and compliance), and fat-finger price sanity (reject a limit order more than, say, 10% away from last trade). Post-trade checks run continuously on the position and P&L stream and throttle or halt new orders when thresholds are breached — realized vs unrealized P&L, rolling max drawdown, velocity of losses (dollars lost per minute), and position concentration (no more than X% of NAV in any single name).

Pre-trade checks live on the hot path and must be fast (single-digit milliseconds); post-trade checks run out of band on a stream of fill events and ledger updates. Pre-trade is the *hard* layer — if a check fails, the order does not go. Post-trade is the *soft* layer that can escalate through severity tiers (warning → throttle → halt → kill) as conditions degrade. Both layers feed the same observability and audit surface (`backend-fintech-observability.md`).

Every risk control is parameterized per account, per strategy, and per account segment. Retail accounts have different leverage limits than institutional; a market-making strategy has different velocity caps than a buy-and-hold rebalancer. Hardcoded limits are a defect — configuration lives in a versioned, auditable store (Postgres, Consul, LaunchDarkly) with blast-radius-aware deploys.

A kill switch is a single boolean read on the order-submission path that, when set, halts all new orders instantly. It must be triggerable both manually (one click, one operator, logged and alerted) and automatically on hard threshold breach (e.g., drawdown exceeds 5% of NAV intraday). Deactivation is dual-control: two operators must sign off. The kill switch has a defined "safe state" — does activation merely halt new orders, or does it also flatten open positions? Different products pick different answers; the choice must be explicit, documented, and tested.

Operational risk — the risk from the system itself, not the market — is controlled via canary accounts (new strategy changes go live on a throwaway sub-account first), staged rollouts (ramp from 1% → 10% → 100% of size over hours), and dry-run/shadow modes where the new logic runs on live data but never submits orders. Cross-ref: `backend-fintech-order-lifecycle.md` for where pre-trade checks fire in the order flow, `backend-fintech-compliance.md` for regulatory-driven blocks (Reg SHO, sanctions), `backend-fintech-broker-integration.md` for how broker-enforced limits interact with ours, and `backend-fintech-testing.md` for chaos and shadow-mode test patterns.

## Deep Guidance

### Pre-Trade Check Pipeline

Pre-trade checks run as an ordered pipeline, fail-fast, with every outcome (pass, block, bypass) emitting a structured audit event. Ordering matters: cheap, definitive checks first; expensive, I/O-bound checks last, so that a restricted-symbol block never waits on a margin calculation.

```python
# pre_trade.py
CHECKS = [
    check_kill_switch,           # 1. global halt (microseconds, in-memory)
    check_restricted_symbol,     # 2. sanctions / hard list (cache lookup)
    check_max_order_size,        # 3. notional and quantity caps
    check_fat_finger_price,      # 4. limit price vs last trade (< 10% band)
    check_position_limit,        # 5. would this breach max position?
    check_portfolio_leverage,    # 6. requires full portfolio read
    check_buying_power,          # 7. requires margin engine call
]

def validate(order, account, market) -> CheckResult:
    for check in CHECKS:
        result = check(order, account, market)
        audit.record(order.client_order_id, check.__name__, result)
        if result.action == BLOCK:
            return result  # fail fast
        if result.action == BYPASS:
            audit.alert("pre_trade_bypass", order, check.__name__, result.reason)
    return CheckResult(action=PASS)
```

Manual overrides ("bypass this check for this order") exist for operational reasons (e.g., a portfolio manager closing a position that would otherwise violate the concentration rule). They must be explicitly logged with operator identity, ticket reference, and the specific check bypassed — and they must page on-call, not silently drop.

### Per-Symbol vs Per-Account vs Per-Segment Limits

Limits compose from three axes and the most restrictive wins. Per-symbol limits cap exposure to idiosyncratic risk ("no more than 50k shares of AAPL"). Per-account limits cap total exposure for a single client ("no more than $10M notional long"). Per-segment limits apply policy to a class of accounts ("retail accounts capped at 2x leverage under Reg T; institutional prime-brokered accounts can run portfolio margin up to 6–7x effective"). An order that would fit the account and segment limits but breach the per-symbol cap still rejects.

Store limits in a versioned config table, not code. Every change goes through a PR-like workflow with an approver, and activation is timestamped so post-mortems can answer "what were the limits at 14:32:07 UTC?"

### Margin and Buying Power

Under Reg T (US retail equities), initial margin is 50% — a $100k long position requires $50k equity. Maintenance margin is 25% (FINRA floor; most brokers set 30%). Pattern-day-trader (PDT) accounts with over $25k equity get 4x intraday buying power on marginable securities; non-PDT accounts are capped at 2x. Portfolio margin (for accounts over $100k–$150k and approved) replaces the flat percentage with a risk-array calculation — typically 10–15% haircut on diversified portfolios, which yields roughly 6–7x gross leverage on balanced books.

Buying-power math must update in real time as fills land and marks move. A common and costly bug: computing buying power from the position snapshot but ignoring working orders (resting limits that could fill at any moment). The correct denominator is `cash + market_value - initial_margin_of_open_positions - initial_margin_of_working_orders`. Re-run the calculation on every fill, every cancel, and every mark-to-market tick on volatile books.

### Drawdown Tracking

Drawdown is the peak-to-trough decline of equity over a time window. Track at least two windows: intraday (high-water mark resets at session open) and rolling N-day (e.g., 5-day and 30-day high-water marks). Intraday drawdown is the tripwire for kill-switch automation; multi-day drawdown drives strategy-level throttles.

```python
# drawdown.py
from collections import deque

class DrawdownTracker:
    def __init__(self, window_sec: int):
        self.window_sec = window_sec
        self.samples = deque()  # (ts, equity)
        self.peak = None

    def update(self, ts: float, equity: float) -> float:
        self.samples.append((ts, equity))
        cutoff = ts - self.window_sec
        while self.samples and self.samples[0][0] < cutoff:
            self.samples.popleft()
        self.peak = max(s[1] for s in self.samples)
        return (equity - self.peak) / self.peak  # negative = drawdown
```

Intraday peak resets at the session open boundary, not on a rolling clock — reset on the *event* (market open) rather than a sliding window, so the 15:59 peak does not suppress the drawdown calculation at 09:31 the next morning.

### Circuit Breakers: Tiered Severity

A flat "halt on any bad thing" is too blunt. Use four tiers, each with explicit trigger, action, and notification:

- **Warning** (drawdown > 1%): log, dashboard badge, no trading impact. Analyst acknowledges.
- **Throttle** (drawdown > 2.5%, loss velocity > $5k/min): reduce max order size by 50%, pause strategies tagged "high-turnover". Page on-call desk.
- **Halt** (drawdown > 4%): block all new opening orders. Closing orders still allowed (to let risk come off). Page desk + engineering on-call.
- **Kill** (drawdown > 5%, or catastrophic event): set global kill switch. Block all new orders including closes. Page desk + engineering + exec on-call.

Each tier's transition (up or down) emits an event and requires explicit operator action to step *down* in severity. Automatic de-escalation is tempting and dangerous; it hides the fact that you tripped at all.

### Kill-Switch Implementation

The kill switch is a single atomic boolean in a low-latency store (Redis, an in-memory feature-flag service like LaunchDarkly, or a sidecar like Consul). Every order-submission path reads it before sending to the broker. Read latency budget: sub-millisecond. Cache locally in each process with a short TTL (e.g., 500ms) and a pub/sub invalidation channel so activation propagates in well under a second.

```python
# kill_switch.py
STATES = ("disabled", "armed", "active", "recovering")
# disabled: killswitch feature off (testing environments)
# armed:    normal operation, switch is off
# active:   halt in effect, new orders rejected
# recovering: manual thaw; new orders allowed but flagged + rate-limited

TRANSITIONS = {
    ("armed",      "active"):     ["manual_trigger", "auto_drawdown", "auto_loss_velocity"],
    ("active",     "recovering"): ["dual_control_approval"],  # two operators
    ("recovering", "armed"):      ["dual_control_approval", "min_cooldown_elapsed"],
}
```

Activation is one-click by any authorized operator. Deactivation requires two distinct operator identities approving within a short window (a classic dual-control pattern). Every transition writes to an append-only audit log with operator, timestamp, trigger reason, and current risk state snapshot.

The "safe state" must be defined: does activation merely halt new orders, or does it also issue flatten-all market orders? Neither is universally right. For directional strategies in liquid markets, flatten is sensible. For market-making books, flattening into a wide spread can be worse than holding. Document the choice per strategy and encode it in the kill-switch config.

### Testing Risk Controls

Risk controls that have never been tripped in production are indistinguishable from risk controls that do not work. Test them continuously:

- **Chaos tests**: on a schedule, in a staging environment with live-like data, force a breach of each tier. Verify the expected action fires and pages the expected team. Treat a silent failure here the same as a production incident.
- **Shadow mode**: when rolling out a new check or tightening a limit, run it in shadow — the check evaluates and emits an event if it *would* have blocked, but does not actually block. Bake for days, compare the shadow block rate to expectations, then cut over.
- **Simulated bad fills**: inject fabricated fill events (through the test harness described in `backend-fintech-testing.md`) that would push position past limits, and verify the post-trade pipeline catches and escalates.

### Operational Risk Controls

Beyond market risk, the system itself is a source of loss. A new strategy with a sign error can lose a day's P&L in minutes; a misconfigured limit can let a fat finger through. Three controls blunt this:

- **Canary accounts**: every new strategy or material change first runs on a small, clearly-labeled sub-account with tight notional caps. If the canary burns, the loss is bounded. Promote to full size only after a defined soak period and a review checkpoint.
- **Staged rollouts**: when scaling a strategy's size or rolling out a risk-check change, step through defined tiers (1% → 10% → 50% → 100% of target notional) with bake time at each. Automated rollback on deviation from expected P&L, fill rate, or error rate.
- **Dry-run / shadow modes**: the strategy runtime supports a mode where it runs on live market data, generates orders, and logs them — but the submission layer drops them on the floor. Diff the shadow's intended orders against the production strategy's actual orders; any deviation is a finding to investigate before promotion.

All three of these are first-class features in the order-submission path, not ad-hoc scripts. The feature flag determining shadow vs live is read at the same place as the kill switch, and its state is audited alongside every order.

### Common Pitfalls

- **Lagging risk state**: pre-trade checks read position from a cache or replica that is seconds behind the true ledger. A burst of orders can all pass individually while collectively breaching. Mitigate with a per-account in-process reservation (increment the projected position at check time, decrement on reject or terminal).
- **Admin-path bypasses**: internal tools, reconciliation jobs, or "just this once" scripts that bypass the pre-trade pipeline. Every order-submitting path — human UI, strategy runtime, ops tooling, test harnesses in prod — goes through the same checks. No exceptions; enforce at the broker-integration layer (`backend-fintech-broker-integration.md`).
- **Hardcoded limits**: "max 1000 shares" embedded in a constants file. When a legitimate larger trade needs to go, someone edits the constant, deploys, and forgets to revert. Limits belong in config, per-account, auditable.
- **Kill switch with no safe-state definition**: activated during an incident, then the team argues in Slack about whether to flatten. Decide in advance; codify it.
- **Single-operator kill-switch deactivation**: a compromised or distracted operator can re-enable trading prematurely. Dual control is cheap to implement and catches real mistakes.
- **No drill cadence**: the kill switch is tested once at build time and never again. Run a kill-switch drill at least quarterly; measure activation-to-halt latency and deactivation-to-trading latency.
- **Missing working-order margin**: buying-power math that ignores resting limit orders produces over-allocation when several of those limits fill in the same second. Always include working-order initial margin in the denominator.
- **Automatic de-escalation**: circuit breakers that silently step down as conditions improve hide the fact that a tier was tripped. Require explicit operator action to re-arm, even if the underlying condition has cleared.
