---
name: backend-fintech-testing
description: Deterministic backtests; financial-accuracy tests; broker sandbox testing; regulatory edge-case coverage.
topics: [backend, fintech, testing, determinism, backtesting, sandbox, accuracy, property-based]
---

Fintech tests have unusual requirements: bit-exact numeric accuracy, full determinism across runs and hosts, rich regulatory edge-case coverage, and realistic multi-session flows that span market-hours boundaries. A flakey fintech test is worse than no test — it hides the exact race conditions that cause real money to move incorrectly. This doc covers the patterns that keep backtests reproducible, numeric tests honest, broker integrations verifiable, and regulatory behavior exercised before it becomes an incident.

## Summary

The single largest failure mode in fintech test suites is **non-determinism**. A test that calls `new Date()`, reads `Math.random()`, or pulls the system clock inside the code under test will pass on a developer laptop at 10:00 PT and fail in CI at 03:00 UTC — or worse, pass 999 times and fail on the thousandth when a tick happens to straddle a market-open boundary. Every fintech test must inject time, randomness, UUID generation, and any external clock. There are no exceptions to this rule: if the production code reads the clock directly, the production code is wrong, not the test.

**Numeric accuracy** is the second-largest source of bugs. Fintech tests should assert exact decimal equality, not `toBeCloseTo`. If you cannot predict the exact output to the last representable digit, you don't understand the computation — figure it out with a spreadsheet and pin the value. Test rounding modes explicitly (`ROUND_HALF_EVEN` vs `ROUND_HALF_UP` differ on 0.125 and similar ties) and test at boundary scales: sub-cent fees, multi-million-dollar positions, negative balances from wash-sale loss disallowance. See `backend-fintech-ledger.md` for the decimal and ledger invariants the tests are protecting.

**Broker integration** testing is a tiered strategy: unit tests against a mock layer, integration tests against the broker's sandbox (Alpaca paper, IBKR demo, Tradier sandbox, Tradovate demo), and contract tests that hit the real sandbox on a schedule to catch upstream breaking changes. Use record/replay (`nock`, `vcrpy`, `polly-js`, `msw` with fixtures) so CI runs are fast and hermetic, then rotate recordings on a schedule so they don't drift from the live API. See `backend-fintech-broker-integration.md` for the integration surface being tested.

**Regulatory edges** must be covered by explicit fixtures and properties: PDT-rule thresholds (Reg T, $25,000 minimum, 4th day trade within 5 business days), T+1 settlement (since May 28, 2024, US equities settle T+1, not T+2 — update old fixtures), halt/resume with opening-auction prices, corporate actions (dividends, splits, spin-offs, mergers) adjusting cost basis, partial fills and cancel-replace races, and market-closed order rejection. Property-based tests (`fast-check`, `hypothesis`, `jqwik`) are unusually well-suited here because financial invariants are algebraic ("sum of debits equals sum of credits across any window," "position after N operations equals sum of signed fills"). See `backend-fintech-compliance.md` for the rules these tests enforce and `backend-fintech-order-lifecycle.md` for the state machines they exercise.

## Deep Guidance

### Determinism Patterns

The non-negotiable rule: **production code never calls `new Date()`, `Date.now()`, `time.time()`, `uuid.uuid4()`, `random.random()`, or `crypto.randomUUID()` directly**. Every such call is injected via a `Clock`, `IdGenerator`, `Randomness`, or similar seam. In tests the seam is replaced by a `TestClock` (advances on command), a deterministic UUID generator (`uuidv7` seeded, or a counter), and a seeded PRNG (`seedrandom`, `numpy.random.default_rng(42)`, `java.util.Random(seed)`).

Sorting is the second silent source of flakes. Any list returned from a DB query, a broker response, or a cache must be sorted by a **deterministic tie-breaker** before being compared in tests. Prefer composite keys: `ORDER BY timestamp ASC, id ASC`. Relying on insertion order, hash order, or "whatever the DB returned" will fail on Postgres after an `ANALYZE`, on a parallel query plan, or in a different locale.

Timezone handling is the third. Every stored timestamp is UTC. Every test that involves market-hours logic pins `TZ=America/New_York` in the test harness (or uses a zone-aware library like `luxon`, `pendulum`, `java.time.ZoneId`). Run the full suite once with `TZ=UTC` and once with `TZ=Asia/Tokyo` in CI; if anything differs you have a latent bug.

### Property-Based Testing for Financial Invariants

Property-based testing (`fast-check` in TS, `hypothesis` in Python, `jqwik` in Java, `proptest` in Rust) generates thousands of randomized inputs and asserts an invariant holds. The invariants in fintech are unusually strong, which makes properties cheap to write and high-value:

- **Ledger balance**: for any sequence of journal entries, `sum(debits) == sum(credits)`.
- **Position conservation**: `starting_position + sum(signed_fills) == ending_position` across any time window.
- **Idempotency**: posting the same event twice leaves the ledger in the same state as posting it once.
- **Commutativity where it should hold**: two non-overlapping transfers in either order produce the same final balances.
- **Non-commutativity where it should not**: a partial fill followed by a cancel differs from a cancel followed by a partial fill; test that the race is rejected, not silently reordered.
- **Rounding monotonicity**: `round(a) + round(b) <= round(a + b) + 1 ulp` for `ROUND_HALF_EVEN`.

Shrinking is the killer feature: when a property fails, the framework shrinks to a minimal counterexample. A 4-line failing test with `amount=0.125, mode=HALF_EVEN` is worth a hundred anecdotal bug reports.

### Numeric Test Patterns

Never use floating-point for money, and never use `toBeCloseTo` / `assertAlmostEqual` in money tests — those are noise suppressors that hide off-by-one-cent bugs. Use `Decimal` (`decimal.js`, `big.js`, Python `decimal.Decimal`, Java `BigDecimal`, `rust_decimal`) and assert exact string equality on the serialized form: `expect(result.toFixed(4)).toBe("1234.5678")`.

Test rounding **modes** explicitly, not just results. `ROUND_HALF_EVEN` (banker's rounding, IEEE 754 default, required by many regulators) rounds 0.5 to the nearest even: 0.5 → 0, 1.5 → 2, 2.5 → 2. `ROUND_HALF_UP` rounds 0.5 away from zero: 0.5 → 1, 1.5 → 2, 2.5 → 3. A test that exercises 0.125 and 0.375 at 2-decimal scale will catch a mode swap.

Pin the expected values by hand calculation, not by "run it and snapshot." A snapshot just records whatever the buggy code produced the first time. Work the expected output on paper (or in a spreadsheet you check in alongside the test fixture), then assert exact match.

### Regulatory Scenario Fixtures

Build a fixture library that exhaustively exercises the rules:

- **PDT threshold**: account at $24,999.99 attempts a 4th day trade within a 5-business-day window → rejected with `PDT_VIOLATION`. Account at $25,000.00 → allowed. Account flagged PDT then rising above threshold on the next close → still restricted until equity holds for 5 business days.
- **T+1 settlement**: a sale on Monday settles Tuesday. Friday sale → Monday settlement. Friday sale before a Monday holiday → Tuesday settlement. Generate a calendar for the current and prior year with holidays and test the arithmetic against a known-good source (NYSE calendar).
- **Corporate actions**: 2-for-1 split of a 100-share position at $50 cost basis → 200 shares at $25. Cash dividend of $0.50/share → cash credit, no position change. Spin-off with cost-basis allocation ratio → both positions adjusted. Merger with cash-and-stock consideration → realized gain on cash portion, carryover basis on stock portion.
- **Halt / resume**: order placed during LULD halt → rejected or queued per venue rules. Opening auction after resume → fills at the auction print, not the last pre-halt trade. Test that mark-to-market during a halt uses the last trade, not zero.
- **After-hours and pre-market**: market-on-close order entered at 16:15 ET → rejected. Limit order marked `extended_hours=true` entered at 07:30 ET → accepted. Order from a user whose account is not enabled for extended hours → rejected with `EXT_HOURS_NOT_ENABLED`.

### Broker Sandbox Testing

Every major broker offers a sandbox — Alpaca Paper, IBKR Paper Trading, Tradier Sandbox, Tradovate Demo, Schwab (former TDA) Developer Sandbox. Sandboxes differ from production in important ways: instant fills regardless of liquidity, synthetic market data that may not match real quotes, relaxed rate limits (or stricter — Alpaca sandbox caps at 200 req/min vs 10,000/min in live), and simplified corporate-action handling. Write a table of documented sandbox-vs-prod behavioral differences and pin it to the integration-test README so nobody is surprised.

Auth flows also differ. Most sandboxes use a fixed long-lived token; production uses OAuth with refresh. Tests must cover both paths — fake the OAuth refresh in unit tests, exercise the real refresh in a nightly contract test.

### Record and Replay

For CI speed and hermeticity, capture real sandbox responses once with `nock.recorder.rec()` (Node), `vcrpy` (Python), `WireMock` (Java), or `msw`'s `setupServer` with pre-baked fixtures, then replay them in CI. The recordings live next to the test file and are checked in.

**Rotation strategy** is what makes this durable: a scheduled job (weekly or monthly via GitHub Actions cron) re-runs the recording step against the live sandbox and diffs the new captures against the committed ones. A non-trivial diff opens a PR for human review — either the API changed (update expectations and code) or the sandbox changed (update fixtures only). Without rotation, fixtures silently drift and CI becomes a liar.

### Contract Tests Against Live Brokers

Separate from replay-based tests, run a small **contract test** suite against the real sandbox on a schedule (weekly is typical, nightly for active integrations). These tests assert the shape of critical responses — field names, required fields, enum values, error codes — without asserting specific business outcomes. Failures here are early warning of broker API changes, often before the broker's own changelog is published. Tools: `pact` for consumer-driven contracts, or a hand-rolled `zod`/`pydantic`/`jsonschema` validator run against live responses.

### Common Pitfalls

- **Tests pass locally, fail in CI**: almost always timezone (`TZ` differs) or locale (`LANG`, `LC_ALL` affect number parsing). Pin both in the test harness and in CI config.
- **Flakey market-hours tests**: the test reads the real clock and asserts "market is open." Fix by injecting a `Clock` and freezing it at a known instant inside the trading session.
- **Sandbox instant fills**: code assumes fills are instant because sandbox makes them so; production has a partial-fill / queued-order path that was never tested. Write a mock broker that delays and partially fills, separate from the sandbox.
- **Fixtures drift from schemas**: recorded responses reference fields the API no longer returns, and production code silently handles the absence incorrectly. Rotation (above) plus a strict schema validator on every response catches this.
- **UUID comparisons**: tests that assert full UUID equality on generated ids are brittle; either inject the generator or assert shape (`expect(id).toMatch(/^[0-9a-f-]{36}$/)`). Prefer injection for determinism.
- **Decimal serialization mismatches**: `Decimal("1.10")` and `Decimal("1.1")` compare equal but serialize differently; pin the canonical form in the test and assert on the serialized output.
- **Shared state between tests**: a test that uses the real file system, a singleton clock, or a module-level cache breaks parallel execution. Every fixture is constructed per-test.

### Code Examples

Clock-injection wrapper (TypeScript, vitest):

```typescript
// src/infra/clock.ts
export interface Clock { now(): Date; }
export const SystemClock: Clock = { now: () => new Date() };
export class TestClock implements Clock {
  constructor(private current: Date) {}
  now() { return new Date(this.current); }
  advance(ms: number) { this.current = new Date(this.current.getTime() + ms); }
  setTo(iso: string) { this.current = new Date(iso); }
}

// src/orders/submit.ts
export function submitOrder(clock: Clock, order: Order) {
  if (!isMarketOpen(clock.now())) throw new Error("MARKET_CLOSED");
  return { ...order, submittedAt: clock.now().toISOString() };
}

// tests/orders/submit.test.ts
import { describe, it, expect } from "vitest";
import { TestClock } from "../../src/infra/clock";
import { submitOrder } from "../../src/orders/submit";

describe("submitOrder", () => {
  it("rejects before market open", () => {
    const clock = new TestClock(new Date("2026-04-15T13:29:59Z")); // 09:29:59 ET
    expect(() => submitOrder(clock, baseOrder)).toThrow("MARKET_CLOSED");
  });
  it("accepts exactly at market open", () => {
    const clock = new TestClock(new Date("2026-04-15T13:30:00Z")); // 09:30:00 ET
    expect(submitOrder(clock, baseOrder).submittedAt).toBe("2026-04-15T13:30:00.000Z");
  });
});
```

Property-based invariant (Python, hypothesis):

```python
# tests/ledger/test_invariants.py
from decimal import Decimal
from hypothesis import given, strategies as st
from app.ledger import post_entry, account_balance, Ledger

amounts = st.decimals(min_value=Decimal("0.01"), max_value=Decimal("100000"), places=2)
accounts = st.sampled_from(["cash", "customer:alice", "customer:bob", "fees"])

@given(st.lists(st.tuples(accounts, accounts, amounts), min_size=0, max_size=50))
def test_double_entry_sums_to_zero(transfers):
    ledger = Ledger()
    for src, dst, amt in transfers:
        if src == dst:
            continue
        post_entry(ledger, src=src, dst=dst, amount=amt)
    total = sum(account_balance(ledger, a) for a in ledger.accounts)
    assert total == Decimal("0"), f"ledger imbalanced by {total}"

@given(st.lists(st.tuples(accounts, accounts, amounts), min_size=1, max_size=20))
def test_posting_is_idempotent(transfers):
    l1, l2 = Ledger(), Ledger()
    for i, (src, dst, amt) in enumerate(transfers):
        if src == dst:
            continue
        post_entry(l1, src=src, dst=dst, amount=amt, idempotency_key=f"k-{i}")
        post_entry(l2, src=src, dst=dst, amount=amt, idempotency_key=f"k-{i}")
        post_entry(l2, src=src, dst=dst, amount=amt, idempotency_key=f"k-{i}")  # replay
    for acct in l1.accounts:
        assert account_balance(l1, acct) == account_balance(l2, acct)
```

Decimal-precision test with exact-match assertions (TypeScript, vitest + `decimal.js`):

```typescript
import { Decimal } from "decimal.js";
import { describe, it, expect } from "vitest";
import { computeCommission } from "../src/fees";

describe("computeCommission", () => {
  // Rate 0.00125 on notional $10,000.00 = $12.50 exactly
  it("computes exact commission at representable scale", () => {
    const notional = new Decimal("10000.00");
    const rate = new Decimal("0.00125");
    expect(computeCommission(notional, rate).toFixed(4)).toBe("12.5000");
  });

  // ROUND_HALF_EVEN (banker's) on 0.125 at 2dp -> 0.12 (even), not 0.13
  it("uses ROUND_HALF_EVEN on tie", () => {
    Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN });
    const notional = new Decimal("100.00");
    const rate = new Decimal("0.00125"); // = $0.125
    expect(computeCommission(notional, rate).toDecimalPlaces(2).toFixed(2)).toBe("0.12");
  });

  // Contrast: ROUND_HALF_UP would give 0.13
  it("differs from ROUND_HALF_UP on tie", () => {
    Decimal.set({ rounding: Decimal.ROUND_HALF_UP });
    const notional = new Decimal("100.00");
    const rate = new Decimal("0.00125");
    expect(computeCommission(notional, rate).toDecimalPlaces(2).toFixed(2)).toBe("0.13");
  });
});
```

### Cross-References

- `backend-fintech-ledger.md` — the invariants these tests protect (double-entry, idempotency, reconciliation).
- `backend-fintech-order-lifecycle.md` — state machines exercised by order-flow tests.
- `backend-fintech-data-modeling.md` — schemas whose contracts the fixtures match.
- `backend-fintech-broker-integration.md` — the integration surface being sandboxed, recorded, and replayed.
- `backend-testing.md` — general backend testing conventions layered beneath the fintech-specific patterns above.
