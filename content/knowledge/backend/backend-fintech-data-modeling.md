---
name: backend-fintech-data-modeling
description: Financial data models; currency handling; decimal precision; positions, trades, prices; time-series designs.
topics: [backend, fintech, data-modeling, decimal, currency, time-series, positions, trades]
---

Financial data modeling is where most fintech bugs are born: a float creeps into a money field, a currency is implied instead of stored, a tick table grows unbounded, or a `current_position` column drifts from the journal. This doc covers the non-negotiable shapes of money, quantity, and price data, and the time-series and derived-view patterns that keep a trading or banking system honest at scale.

## Summary

**Money is never a float.** Every stack has a correct type and it is never IEEE-754 binary floating point. Use `NUMERIC(precision, scale)` or integer minor units in Postgres; `Decimal` with an explicit context in Python; `BigDecimal` with `setScale` in Java; `decimal.js`, `big.js`, or `bignumber.js` in JavaScript/TypeScript (with `string` on the wire, not `number`); `rust_decimal` in Rust; `shopspring/decimal` in Go. A `double` anywhere in the money path is a latent bug, not a performance optimization.

**Currencies are not interchangeable.** Every money field is a `(amount, currency)` tuple, not a bare scalar. Store the currency as an ISO 4217 alpha-3 code (`USD`, `EUR`, `JPY`, `BTC`, `USDT`) alongside the amount, and reject any arithmetic that mixes currencies without an explicit FX conversion. Aggregations (`SUM(amount)`) across mixed currencies are always wrong — group by currency or convert at a snapshotted rate first.

**Quantities have their own precision, separate from price.** Equity shares are typically integers (fractional-share brokers use 6–9 decimals); Bitcoin quantities need 8 decimals (satoshis); Ethereum and most ERC-20 tokens need 18 decimals (wei); stablecoins like USDT and USDC use 6 decimals; FX quantities are usually 2 decimals for major pairs but pip size varies per pair. Store the instrument's quantity scale in the instrument master and validate every fill against it.

**Prices change constantly and the storage design must account for it.** Tick data (every quote, every trade) at scale means billions of rows per instrument per year — OLTP Postgres will not hold it. Use a columnar or purpose-built time-series store (TimescaleDB hypertables, ClickHouse with `ReplacingMergeTree`, InfluxDB, or Parquet-on-object-storage queried via DuckDB) with explicit retention policies. Bars (1-minute, 1-hour, 1-day OHLCV) live alongside ticks and are the common read path for charts and analytics.

**Positions are a derived view, not a primary table.** The authoritative record is the journal of fills (and, for cash, the ledger — see `backend-fintech-ledger.md`). A position is `SUM(signed_quantity) GROUP BY account, instrument`, optionally as of a point in time. Maintain a materialized view or cache for read performance, but always be able to rebuild it from the journal — any system that cannot do this has lost its audit story.

**Corporate actions require keeping both raw and adjusted prices.** Splits, dividends, and mergers retroactively change historical price series. Keep raw prices (what actually printed on the tape) immutable, and maintain a parallel `adjusted_price` column or adjustment-factor table so charting and backtesting get continuous series without losing the original record.

## Deep Guidance

### Decimal Types Across the Stack

Floats fail on money because `0.1 + 0.2 !== 0.3` in every IEEE-754 language, and because the error compounds across additions in a way you cannot bound. The canonical replacements:

- **Postgres**: `NUMERIC(precision, scale)` — e.g., `NUMERIC(20, 8)` for crypto amounts, `NUMERIC(18, 2)` for fiat. Arbitrary precision, exact arithmetic, slower than `BIGINT`. For high-throughput hot paths, store integer **minor units** (cents, satoshis, wei) in `BIGINT` or `NUMERIC(38, 0)` and keep the scale in the instrument master.
- **Python**: `decimal.Decimal` with `getcontext().prec = 28` and an explicit rounding mode set at application startup. Never mix `Decimal` and `float` in arithmetic — Python will not error, it will coerce and you will silently lose precision.
- **Java / Kotlin**: `BigDecimal`, always with `setScale(n, RoundingMode.HALF_EVEN)` or `HALF_UP` explicitly chosen per context. Never call `new BigDecimal(double)` — use `BigDecimal.valueOf(double)` or, better, pass strings.
- **JavaScript / TypeScript**: JavaScript `Number` is a `double`; `BigInt` handles integer minor units but not fractional amounts. Use `decimal.js`, `big.js`, or `bignumber.js` for fractional money; serialize as strings on the wire (`"123.45"`, never `123.45`). GraphQL and JSON Schema both support string-encoded decimals.
- **Rust**: `rust_decimal::Decimal` for fixed-scale, `num-bigint::BigInt` + scale for arbitrary precision.
- **Go**: `shopspring/decimal` is the de facto standard.

On the wire: JSON numbers are IEEE-754 doubles in most parsers, so serialize money as strings. Protobuf has no decimal type — use a message like `{ string value; int32 scale; string currency; }` or send the minor-unit integer with an out-of-band scale from the instrument master.

### Currency Representation

Use ISO 4217 alpha-3 codes: `USD`, `EUR`, `JPY`, `CHF`, `GBP`, plus crypto conventions that extend the space: `BTC`, `ETH`, `USDT`, `USDC`, `SOL`. Keep a reference `currencies` table with `code`, `name`, `minor_unit_exponent` (2 for USD, 0 for JPY, 8 for BTC, 18 for ETH, 6 for USDT), `is_fiat`, `is_active`.

The "store money as cents" advice is only correct for fiat with 2 decimal places. JPY has no sub-unit (exponent 0); KWD has 3; BTC has 8; ETH has 18; USDT has 6. Hard-coding `*100` anywhere in the codebase is a bug waiting for a non-USD customer. Always read the scale from the currencies table or instrument master, or use a decimal type that carries scale explicitly.

```sql
CREATE TABLE currencies (
  code                 CHAR(3) PRIMARY KEY,           -- or VARCHAR(10) for longer crypto tickers
  name                 TEXT NOT NULL,
  minor_unit_exponent  SMALLINT NOT NULL,             -- 2=USD, 0=JPY, 8=BTC, 18=ETH
  is_fiat              BOOLEAN NOT NULL,
  is_active            BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE cash_movements (
  id               BIGSERIAL PRIMARY KEY,
  account_id       UUID NOT NULL,
  amount           NUMERIC(38, 18) NOT NULL,          -- scale wide enough for ETH
  currency         CHAR(3) NOT NULL REFERENCES currencies(code),
  occurred_at      TIMESTAMPTZ NOT NULL,
  CHECK (amount <> 0)
);
```

### Rounding Rules

Rounding must be explicit, contextual, and documented. Defaults:

- **Banker's rounding (HALF_EVEN)** for settlement and regulatory reporting — statistically unbiased across many rounding events.
- **HALF_UP** for consumer-facing invoice totals where "round half away from zero" matches user expectations.
- **Truncation (ROUND_DOWN)** for display of quantities where you must not overstate (e.g., a balance-available readout must never round up).
- **HALF_UP or ceiling** for fees charged to the customer in your favor — so you do not under-collect — with regulatory review.

The footgun case: `1.005` rendered to 2 decimals. In binary float it is `1.00499999...`, which HALF_UP rounds to `1.00`, not `1.01`. Use a decimal library and explicit context, and write a test for exactly this case.

### Multi-Currency Positions

Two patterns, pick one and be explicit:

1. **Native-currency storage + periodic revaluation.** Each position and each cash balance is stored in its native currency. At report time, convert to the reporting currency using a snapshotted FX rate (end-of-day close, or an intraday snapshot for intraday P&L). Preserves accuracy and audit trail, simplifies settlement.
2. **Functional-currency storage + memo native amounts.** Everything is denominated in the reporting currency (e.g., USD); foreign-currency fills are converted at execution time. Simpler to aggregate but loses information — revaluing an FX exposure later requires the memo column.

For broker/exchange integration, pattern 1 is nearly always correct. For internal accounting that feeds a single GAAP/IFRS reporting currency, pattern 2 is common. See `backend-fintech-ledger.md` for the journal-entry mechanics of FX conversion.

### Time-Series Storage: Ticks, Bars, and Retention

Decide early what granularity you need to keep, and for how long. A naive "store every tick forever in Postgres" plan breaks at the first liquid instrument. Options:

- **TimescaleDB hypertables** — Postgres extension, partitions by time transparently, supports continuous aggregates (materialized bars), native compression (10–20x) and retention policies. Good choice when you already have Postgres expertise.
- **ClickHouse `ReplacingMergeTree` / `AggregatingMergeTree`** — columnar, extreme compression, fast time-range scans, scales to trillions of rows. Best for high-volume tick capture and analytics.
- **InfluxDB** — time-series native, good for metrics-shaped data, less common for financial tick capture.
- **Parquet on object storage + DuckDB / Athena / BigQuery** — effectively free cold storage, pay per query; excellent for long-term archive and backtesting over years of history.

Tick schema: `(instrument_id, exchange_id, ts, price, size, side, seq)`. Always store the exchange timestamp *and* your ingest timestamp — clock skew matters. Bar schema: `(instrument_id, resolution, open_ts, open, high, low, close, volume, vwap, tick_count)`.

```sql
-- TimescaleDB: hypertable + retention + continuous aggregate
CREATE TABLE ticks (
  instrument_id  BIGINT NOT NULL,
  exchange_id    SMALLINT NOT NULL,
  ts             TIMESTAMPTZ NOT NULL,
  price          NUMERIC(20, 8) NOT NULL,
  size           NUMERIC(28, 8) NOT NULL,
  side           CHAR(1) NOT NULL CHECK (side IN ('B','S','U')),
  seq            BIGINT NOT NULL
);
SELECT create_hypertable('ticks', 'ts', chunk_time_interval => INTERVAL '1 day');

-- Keep raw ticks for 30 days, then drop; bars are retained separately
SELECT add_retention_policy('ticks', INTERVAL '30 days');

-- 1-minute bars as a continuous aggregate, retained 10 years
CREATE MATERIALIZED VIEW bars_1m
WITH (timescaledb.continuous) AS
SELECT instrument_id,
       time_bucket('1 minute', ts) AS bucket,
       first(price, ts) AS open,
       max(price)       AS high,
       min(price)       AS low,
       last(price, ts)  AS close,
       sum(size)        AS volume
  FROM ticks
  GROUP BY instrument_id, bucket;
SELECT add_continuous_aggregate_policy('bars_1m',
  start_offset => INTERVAL '2 days',
  end_offset   => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');
```

### Corporate Actions and Price Adjustment

A 2:1 stock split doubles the share count and halves the price. Historical charts must be adjusted so the price series is continuous, but *settlement* still used the unadjusted prices. Keep both:

- `prices_raw(instrument_id, ts, price)` — immutable, what actually printed.
- `corporate_actions(instrument_id, effective_date, action_type, ratio_numerator, ratio_denominator, cash_amount, currency)` — authoritative record of splits, dividends, mergers.
- `adjusted_price` — either a materialized column computed from raw + the product of all adjustment factors effective after the tick date, or computed on read via a view.

Never overwrite the raw price. If a data vendor re-emits history post-split and you overwrite, you cannot reconcile past trade tickets. The same principle applies to reference data generally: store the vendor's snapshot with a `received_at`, and derive any "current" projection.

### Position Model

A position is `SUM(signed_quantity) GROUP BY (account_id, instrument_id)` over the fills journal, where `signed_quantity` is positive for buys and negative for sells (and the reverse for shorts). Cost basis is `SUM(signed_quantity * price) / SUM(signed_quantity)` under average-cost, or a FIFO lot walk for tax-lot accounting.

Implementation options:

- **Read-time aggregation** — correct and simple, fine up to ~10M fills per account; use an index on `(account_id, instrument_id, executed_at)`.
- **Materialized view, refreshed nightly** — for dashboards; accept T-1 staleness in exchange for cheap reads.
- **Rolling snapshot table** — `positions(account_id, instrument_id, as_of_ts, quantity, avg_cost)` updated by trigger on fill insert. Fastest reads, most complex invariants; regenerate from the fills journal on any suspicion of drift.
- **Event-sourced with periodic checkpoints** — for point-in-time queries ("what was my position at 14:32:17 on 2026-03-14?"), keep fills + periodic snapshots and replay from nearest snapshot.

Whichever you pick, maintain a `rebuild_positions(account_id)` job that recomputes from the fills journal; run it nightly against a sample of accounts and alarm on any drift.

### Trade Identifiers: Internal, Broker, Client

Every executed trade has at least three identifiers, and you should store all of them:

- **Internal trade id (UUID)** — your primary key; generated at ingest; never changes; used in all downstream references (ledger `external_id`, position rebuilds, tax lots).
- **Broker execution id** — the exchange or broker's identifier for the fill. Used for reconciliation against the broker's clearing feed (see `backend-fintech-ledger.md` reconciliation). May arrive after the ack — treat as nullable initially and backfill.
- **Client order id (`clOrdID`)** — generated by your order-management system before placing the order. Round-trips through the broker; used to match acks and fills back to the originating intent. Must be globally unique per client-session per the FIX spec (and per broker rules — some require monotonically increasing).

Store venue, symbol (broker's symbology *and* your canonical instrument id), side, quantity, price, fees in their own currency, liquidity flag (maker/taker), and timestamps (client-submitted, broker-ack, exchange-executed, ingest). See `backend-fintech-order-lifecycle.md` for the state-machine that connects these.

### Cross-Currency Arithmetic: Reject at the Boundary

The single highest-leverage fintech habit: refuse to add two money values in different currencies. Write it as a typed function; make the compiler or runtime enforce it.

```typescript
import Decimal from 'decimal.js';

type Money = { amount: Decimal; currency: string };

function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(
      `cannot add ${a.currency} and ${b.currency} without explicit conversion`,
    );
  }
  return { amount: a.amount.plus(b.amount), currency: a.currency };
}

function convert(m: Money, toCurrency: string, rate: Decimal, rateAsOf: Date): Money {
  // rate is units of toCurrency per unit of m.currency, snapshotted at rateAsOf
  return { amount: m.amount.times(rate), currency: toCurrency };
}

// Aggregations over mixed currencies must group explicitly
function sumByCurrency(movements: Money[]): Map<string, Decimal> {
  const totals = new Map<string, Decimal>();
  for (const m of movements) {
    const prev = totals.get(m.currency) ?? new Decimal(0);
    totals.set(m.currency, prev.plus(m.amount));
  }
  return totals;
}
```

In Python, subclass `Decimal` or wrap in a `Money` dataclass with `__add__` raising on currency mismatch; same pattern in Kotlin with a `Money` value class. Every SQL aggregation over money must `GROUP BY currency` or restrict to a single currency in the `WHERE` clause.

### Common Pitfalls

- **`0.1 + 0.2`-class bugs in money math.** JavaScript `Number`, Python `float`, `double` in JVM/.NET, `REAL`/`DOUBLE PRECISION` in Postgres — all unsafe for money. Use decimal types end to end, including the JSON wire format (strings, not numbers).
- **Banker's rounding vs HALF_UP confusion.** `Decimal('0.5').quantize(Decimal('1'))` in Python rounds to 0 by default (banker's), not 1. Explicitly pass the rounding mode matching the business rule per call site.
- **Equality comparison on floats or even decimals.** `amount == 0` is fine on integer minor units or exact decimals; `amount < epsilon` is a code smell that usually means a float slipped in. Money is exact.
- **Mixing currencies in `SUM()`.** Running `SELECT SUM(amount) FROM cash_movements` without grouping by currency yields meaningless numbers; forbid it at the query-review layer.
- **Hardcoding `*100` for cents conversion.** Works for USD, breaks for JPY (no sub-unit), BTC (8 decimals), ETH (18), USDT (6). Always read the minor-unit exponent from the currencies table.
- **Unbounded tick retention in OLTP.** Every liquid instrument floods the table. Pick a columnar or TSDB backend, set a retention policy, materialize bars, and move old raw ticks to cold storage.
- **Overwriting raw prices after corporate actions.** Split-adjust historical bars at read time, not by mutating the raw series. Keep the corporate-actions table as the authoritative record.
- **`current_position` columns in user tables.** Drift from the fills journal, get clobbered by races, silently wrong. Derive, materialize, and nightly-reconcile.
- **Mixing transaction time and system time.** Exchange timestamp, broker ack timestamp, and your ingest timestamp are three different clocks. Store all three on fills and ticks; alarm on skew above threshold.
- **Implicit currency from account context.** "This account is a USD account, so amounts are in USD" — until it isn't, or until a crypto product ships. Every money field carries its currency.

See also `backend-fintech-ledger.md` for double-entry posting over these same primitives, `backend-fintech-testing.md` for property-based money-math tests and time-series fixture patterns, and `backend-fintech-compliance.md` for the audit-trail and retention constraints that shape historical data storage.
