---
name: backend-fintech-ledger
description: Double-entry accounting for fintech ledgers; journal vs ledger tables; idempotent posting; reconciliation patterns; balance invariants.
topics: [backend, fintech, ledger, double-entry, accounting, reconciliation, idempotency, invariants]
---

A fintech ledger is the authoritative record of money movement; if it is wrong, nothing else in the system can be trusted. The discipline is borrowed intact from 700 years of double-entry bookkeeping — not a new invention, and not negotiable. This doc covers the invariants, schema shape, idempotent posting mechanics, and reconciliation patterns that keep a ledger survivable at production scale.

## Summary

The single most important invariant in any fintech system: **for every credit there is an equal-amount debit, and the sum of debits across a journal entry equals the sum of credits**. This is double-entry accounting. Enforce it in the database, not just the application — a balanced journal entry is the atomic unit of money movement. A single journal entry may have two lines (simple transfer) or dozens (payroll run, fee split, multi-leg trade settlement), but the sum-to-zero constraint holds for every entry.

You **cannot** derive balances from `current_balance` columns updated in application tables. Those columns drift, get clobbered by race conditions, and are unauditable. The balance of an account at any point in time is defined as the sum of all posted ledger lines against that account up to that instant. The journal is the system of record; balances are a projection.

The canonical schema is three layers: **journal** (immutable events — one row per business event, with an external idempotency key and a posting timestamp), **ledger lines** (the double-entry rows — two or more per journal entry, each referencing an account and signed amount), and **account balances** (either a materialized view refreshed periodically, a rolling aggregation maintained by trigger, or computed on demand for low-volume accounts). Write-once to journal and ledger-lines; balances are derived and can always be rebuilt from the journal.

Every journal insert MUST carry an external idempotency key — usually a UUID derived from the upstream event (webhook event ID, Stripe payment intent ID, broker execution ID, client-supplied `Idempotency-Key` header). Retries are a fact of life: payment processors retry webhooks, queues redeliver, operators click twice. The key is enforced by a unique index on `(source, external_id)` so the second attempt fails cleanly and the caller receives the original posting. Libraries like `ledgers.db` (Mercury's pattern), `tigerbeetle`, Square's `subzero`, and `medici` (Node) codify this. Most fintech outages can be traced to a missing or mis-scoped idempotency key.

Reconciliation is a daily, non-optional process. For each counterparty (bank, broker, card processor, payment rail), the ledger's expected cash movement is matched against the counterparty's settlement file or API feed. Matched items clear; unmatched items go into a "breaks queue" with aging (1 day, 3 days, 7 days, escalate). A break is either a timing difference that will resolve on the next feed, a fee the counterparty applied that you didn't book, or a bug. Break quarantine prevents a single unmatched item from blocking close; root cause must be found and booked before period close. See `backend-fintech-compliance.md` for audit-trail requirements and `backend-fintech-order-lifecycle.md` for trade-specific settlement flows.

## Deep Guidance

### Chart of Accounts Design

The chart of accounts (COA) is the taxonomy every ledger line must pick from. Classic classes: **assets** (cash, receivables, inventory), **liabilities** (customer deposits, payables), **equity** (retained earnings, owner's capital), **revenue** (fees, interest earned), **expenses** (processing fees, bad debt). Customer deposits in a consumer fintech are a *liability* on your balance sheet — the money belongs to the customer, you're holding it.

Granularity matters more than people expect. Per-customer wallet balances require a distinct account per customer (or per customer-currency pair) — millions of rows of accounts is fine, this is what modern ledgers are designed for. Operational accounts (cash-at-bank, processing-fee-expense, interchange-revenue) are few and coarse. A typical pattern: customer accounts identified by `customer_id`, operational accounts identified by a stable account code (`1000-CASH-USD`, `4000-FEE-REVENUE`, `5000-PROCESSOR-COST`).

Avoid "merge" accounts that combine classes — "customer cash and fees" is wrong; split them. Every account has exactly one normal balance (debit for assets/expenses, credit for liabilities/equity/revenue) and one class.

```sql
CREATE TABLE accounts (
  id            UUID PRIMARY KEY,
  code          TEXT UNIQUE,           -- '1000-CASH-USD' or NULL for customer accounts
  name          TEXT NOT NULL,
  class         TEXT NOT NULL CHECK (class IN ('asset','liability','equity','revenue','expense')),
  normal_side   TEXT NOT NULL CHECK (normal_side IN ('debit','credit')),
  currency      CHAR(3) NOT NULL,      -- ISO 4217
  customer_id   UUID REFERENCES customers(id),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Journal Entry and Ledger Line Structure

A journal entry represents one business event. Ledger lines represent the debits and credits that settle that event. Every ledger line belongs to exactly one journal entry. Every journal entry must sum to zero per currency.

```sql
CREATE TABLE journal_entries (
  id               UUID PRIMARY KEY,
  source           TEXT NOT NULL,        -- 'stripe' | 'broker' | 'manual' | 'internal'
  external_id      TEXT NOT NULL,        -- idempotency key (e.g. Stripe event id)
  counterparty_id  UUID REFERENCES counterparties(id),
  memo             TEXT,
  transaction_date DATE NOT NULL,        -- when economically occurred
  posting_date     DATE NOT NULL,        -- when booked to the ledger
  posted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_by        UUID NOT NULL,        -- actor id
  UNIQUE (source, external_id)
);

CREATE TABLE ledger_lines (
  id                  BIGSERIAL PRIMARY KEY,
  journal_entry_id    UUID NOT NULL REFERENCES journal_entries(id),
  account_id          UUID NOT NULL REFERENCES accounts(id),
  direction           TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount_minor_units  BIGINT NOT NULL CHECK (amount_minor_units > 0),
  currency            CHAR(3) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON ledger_lines (account_id, created_at);
CREATE INDEX ON ledger_lines (journal_entry_id);
```

Distinguish **transaction date** (when the economic event occurred — the customer's card was charged at 23:59 Dec 31) from **posting date** (when you booked it — Jan 2, after the batch settled). Financial statements group by posting date; period-end cutoffs use transaction date for accruals. Both are needed.

### Double-Entry Invariants in the Database

The sum-to-zero rule must be enforced by the database, not just by application code. Application bugs happen; a CHECK constraint or deferred trigger does not regress silently.

```sql
-- Deferred constraint: check at end of transaction, after all lines inserted
CREATE OR REPLACE FUNCTION assert_journal_balanced()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE imbalance RECORD;
BEGIN
  FOR imbalance IN
    SELECT currency,
           SUM(CASE WHEN direction = 'debit'  THEN amount_minor_units ELSE 0 END)
         - SUM(CASE WHEN direction = 'credit' THEN amount_minor_units ELSE 0 END) AS delta
    FROM ledger_lines
    WHERE journal_entry_id = NEW.journal_entry_id
    GROUP BY currency
    HAVING SUM(CASE WHEN direction='debit' THEN amount_minor_units ELSE 0 END)
         <> SUM(CASE WHEN direction='credit' THEN amount_minor_units ELSE 0 END)
  LOOP
    RAISE EXCEPTION 'journal entry % unbalanced in %: delta=%',
      NEW.journal_entry_id, imbalance.currency, imbalance.delta;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER journal_balance_check
  AFTER INSERT ON ledger_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_balanced();
```

Also block UPDATE and DELETE on `ledger_lines` and `journal_entries` via triggers — corrections are *reversing* journal entries, not edits. This is the same append-only posture described in `backend-fintech-compliance.md`.

### Idempotent Posting

Every write path into the ledger goes through a single posting function. The function takes a journal-entry spec plus an idempotency key; on conflict it returns the existing journal-entry id without side effects.

```typescript
type PostingLine = {
  accountId: string;
  direction: 'debit' | 'credit';
  amountMinorUnits: bigint;
  currency: string;
};

type PostingRequest = {
  source: string;             // 'stripe' | 'broker' | ...
  externalId: string;         // caller-supplied idempotency key
  transactionDate: string;    // YYYY-MM-DD
  postingDate: string;
  counterpartyId?: string;
  memo?: string;
  lines: PostingLine[];       // must sum to zero per currency, length >= 2
  postedBy: string;
};

// Returns existing journal_entry_id on duplicate (source, externalId) without
// reinserting lines. Raises on imbalanced entry, unknown account, inactive
// account, negative amounts, or currency mismatch between line and account.
async function postJournalEntry(req: PostingRequest): Promise<string>;
```

Implementation notes: start a transaction, `INSERT ... ON CONFLICT (source, external_id) DO NOTHING RETURNING id` on `journal_entries`; if nothing was returned, `SELECT id` the existing row and short-circuit. Otherwise insert all ledger lines in the same transaction. The deferred constraint trigger fires on commit.

For admin corrections, *require* an idempotency key — it is the common audit-gap in fintech. Admins produce a key like `correction-2026-04-14-ticket-12345` or the UUID of a ticketing-system record.

### Balance Queries and Materialization

Balances are derived. The simplest correct query:

```sql
-- Balance of an account at a point in time (pseudo-SQL)
SELECT account_id,
       currency,
       COALESCE(SUM(CASE WHEN direction = 'debit'  THEN amount_minor_units ELSE 0 END)
              - SUM(CASE WHEN direction = 'credit' THEN amount_minor_units ELSE 0 END), 0)
       AS debit_minus_credit_minor_units
  FROM ledger_lines
  WHERE account_id = $1
    AND created_at <= $2   -- 'as-of' timestamp
  GROUP BY account_id, currency;
```

Interpret the sign by the account's `normal_side`: for an asset account the balance is debits minus credits; for a liability the balance is credits minus debits. Always compute in minor units (cents, satoshis) and format for display only — never use floating point. Use `BIGINT` in Postgres, `bigint` / `BigInt` in TS, `decimal.Decimal` in Python, never `double`.

For high-volume accounts (customer wallets), maintain rolling balances via a trigger or via TigerBeetle's built-in running balances. Refresh materialized views nightly for reporting; read-time aggregation is fine up to roughly 10M lines per account.

### Multi-Currency and FX

A multi-currency ledger must either (a) denominate every account in a single currency and use separate FX accounts for conversions, or (b) denominate lines in their native currency and revalue to a reporting currency at close. Mixing currencies within a single account is an anti-pattern.

Every FX conversion is a three-leg journal entry: debit source-currency account, credit source-currency FX clearing, debit target-currency FX clearing, credit target-currency account — with the rate snapshot stored alongside the entry. Snapshot the rate at booking (use a feed like OpenExchangeRates, ECB, or Fixer with a timestamp); do not re-read it at settlement, or you introduce drift. At period end, revalue open foreign-currency balances to the reporting currency using the closing rate and book the realized/unrealized FX gain or loss as a separate journal entry.

Precision: never `double`. Minor units (ints) for fiat. For crypto, use a fixed-scale decimal library (`decimal.js`, Go `shopspring/decimal`, Python `decimal.Decimal`) and store the scale explicitly; satoshi-level BIGINTs work for Bitcoin but not for many Ethereum tokens.

### Reconciliation Patterns

Reconciliation matches internal ledger entries against external sources of truth: bank statements (BAI2, MT940, CAMT.053), card processor settlement files (Visa Base II, Stripe balance transactions), broker clearing files (DTCC CNS). For each counterparty, on each business day, every external line must match an internal journal entry (or vice versa).

Event sourcing from counterparty feeds works best: ingest the feed into a `counterparty_events` table, then run a match job that joins against journal entries via a natural key (broker execution id, card network auth code, ACH trace number). Unmatched rows on either side go to a **breaks queue**.

```sql
-- Unmatched broker executions (external) with no matching journal entry (internal)
SELECT bx.execution_id,
       bx.trade_date,
       bx.symbol,
       bx.amount_minor_units,
       bx.received_at
  FROM broker_executions bx
  LEFT JOIN journal_entries je
    ON je.source = 'broker'
   AND je.external_id = bx.execution_id
  WHERE je.id IS NULL
    AND bx.trade_date >= current_date - INTERVAL '7 days'
  ORDER BY bx.trade_date, bx.received_at;
```

Break items age with SLAs: T+1 auto-retry, T+3 operator review, T+7 escalation. Auto-matching should use counterparty id plus amount plus date within a small tolerance; never match on amount alone. Manual-review UI exposes side-by-side diffs and lets an operator post a reversing or adjusting entry — with mandatory idempotency key and reason code.

### Period-Close

At month-end, quarter-end, and year-end, the books are **closed**: a cutoff timestamp is recorded, no journal entries with a posting date on or before the cutoff may be inserted, and an opening balance sheet is materialized for the next period. Late-arriving events (a broker settlement that arrives 3 days after trade date) post to the *next* period with the prior period's transaction date — so accruals remain correct but the closed period's reported balances do not move.

Implementation: a `periods` table with `status IN ('open','closing','closed')`; a trigger on `journal_entries` that rejects inserts into closed periods; a nightly job that materializes the opening balance sheet into an `account_period_balances` table. Auditors will ask for the close runbook; keep it in-repo alongside the code.

### Performance, Partitioning, Archiving

Journal and ledger-line tables grow forever — a mid-size consumer fintech posts tens of millions of lines per year. Strategies:

- **Partition by posting month** (native Postgres declarative partitioning, or `pg_partman`). Old partitions become read-mostly and can be moved to cheaper storage.
- **Archive closed periods** to columnar storage (ClickHouse, Snowflake, S3+Parquet) for analytics; keep a queryable summary in the primary DB.
- **Index carefully:** `(account_id, created_at)` is the hot path for balance queries; `(journal_entry_id)` for entry lookup; `(source, external_id)` unique index for idempotency. Do not over-index — every index costs on every insert and the write path is hot.
- **Purpose-built ledger DBs:** TigerBeetle is designed specifically for double-entry workloads with built-in idempotency and running balances; consider it for greenfield high-volume systems.

### Common Pitfalls

- **Negative balances silently accepted.** A wallet debit that overdraws should either be rejected at the posting function or post to an overdraft-receivable account — never silently go negative in a customer wallet. Enforce with a CHECK on the rolling balance trigger or pre-flight check in the posting function.
- **FX rate drift between booking and settlement.** If you read the FX rate at posting time and again at settlement, small differences accumulate. Snapshot once at booking and book any settlement-day delta as a realized FX gain/loss entry.
- **Double-posting from webhook retries.** Stripe and similar providers retry webhooks aggressively. Without a unique index on `(source, external_id)`, the second delivery books a duplicate journal entry. Always key on the provider event id, never on your own generated UUID at receive time.
- **Missing idempotency keys on manual admin corrections.** A support engineer clicks "post adjustment" twice and double-credits the customer. The admin UI must require and persist an idempotency key on every posting action.
- **`current_balance` columns in application tables.** These drift, lie about history, and cannot be audited. The ledger is the source; balances are derived. If a dashboard needs a fast balance read, materialize it from the ledger, not alongside it.
- **Using floats anywhere in the money path.** JavaScript `Number`, Python `float`, Java `double` — all unsafe. Minor-unit integers or fixed-scale decimals only, end to end, including JSON wire formats (send as strings).
- **Mixing posting-date and transaction-date reports.** A balance-sheet-as-of report uses posting date; an accrual-based P&L uses transaction date. Label every report and use the right column.
- **Correcting entries by UPDATE.** Never. A correction is a *reversing* journal entry plus a corrected entry, both with idempotency keys and memos linking to the original.

See also `backend-fintech-data-modeling.md` for the broader schema-design patterns, `backend-fintech-compliance.md` for audit-trail and retention requirements, and `backend-fintech-order-lifecycle.md` for trade-settlement flows that terminate in ledger postings.
