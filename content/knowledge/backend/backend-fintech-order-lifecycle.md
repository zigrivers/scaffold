---
name: backend-fintech-order-lifecycle
description: Order state machine; fills, partial fills, cancellation; event-driven order tracking; idempotency; handling "unknown" states.
topics: [backend, fintech, orders, state-machine, fills, partial-fills, event-driven, webhooks]
---

Orders in a trading system are long-lived, asynchronous, externally mutated objects — the exact shape of problem a disciplined state machine is built for. This doc covers the canonical states and transitions, how fills and partial fills land, why "unknown" is a real state you cannot wish away, and the reconciliation posture that keeps internal bookkeeping aligned with the broker of record.

## Summary

An order is a state machine, not a row that gets mutated ad-hoc. The canonical states are `new → submitted → partially-filled → filled | cancelled | rejected | expired`, with two terminal-branching transitions that can fire from any state: `error` (integration failure, policy violation, unhandled exception) and `cancelled` (when a cancel request arrives before terminal). Only terminal states (`filled`, `cancelled`, `rejected`, `expired`, `error`) are final; everything else is transitional and must have a forward path. Illegal transitions (say, `filled → submitted`) must be rejected at the persistence layer, not just filtered out by a `switch` statement in application code.

Fills arrive asynchronously. The broker does not call your submit endpoint and return a filled order — submission returns an acknowledgement (or doesn't, see "unknown" below) and fills trickle in over seconds, minutes, or days via webhook, streaming API, or polling. A single order produces one or many fill events; partial fills are the norm for any non-trivial size. Each fill event carries its own broker-assigned execution id, a timestamp, a price, a quantity, and usually a running cumulative fill quantity for the order.

Idempotency is not optional at any layer that accepts broker events. Webhooks are delivered at-least-once — sometimes many-times-once during broker incidents — and a duplicate fill event absolutely must not create a duplicate fill row or double-book an execution. Every fill-ingest path goes through a dedupe-on-insert against a unique `(broker, execution_id)` key with multi-month retention, and every downstream posting into the ledger (`backend-fintech-ledger.md`) carries its own idempotency key derived from the fill.

"Unknown" is a first-class state, not an edge case. When the submit call to the broker times out, you do not know whether the order reached the exchange. Assuming failure invites duplicate submissions; assuming success invites phantom positions. The correct posture: mark the order `submit-unknown`, do not retry blind, and reconcile by querying the broker's order list with your client-order-id as the key. Only once reconciliation confirms presence or absence do you transition forward.

Every state transition produces a row in an immutable `order_events` audit table and — when money or position moves — a journal entry in the ledger. The order table itself records the current state as a projection of those events. Cross-ref: `backend-fintech-ledger.md` for the journal mechanics, `backend-fintech-broker-integration.md` for the wire-level quirks of specific broker APIs, and `backend-fintech-risk-management.md` for pre-trade checks that run before `new → submitted`.

## Deep Guidance

### State Diagram and Transition Matrix

The diagram below is the minimum viable state machine for equities and futures orders. Add states (`held-for-review`, `pending-cancel`, `pending-replace`) only when the broker's protocol actually distinguishes them.

```
                     ┌────── reject ──────┐
                     │                    ▼
   new ── submit ──► submitted ────► rejected (terminal)
                     │    │
                     │    ├── fill (partial) ──► partially-filled
                     │    │                       │    │
                     │    │                       │    ├── fill (partial) ──► partially-filled
                     │    │                       │    ├── fill (final)  ──► filled (terminal)
                     │    │                       │    ├── cancel        ──► cancelled (terminal)
                     │    │                       │    └── expire (TIF)  ──► expired  (terminal)
                     │    ├── fill (full)    ──► filled (terminal)
                     │    ├── cancel-request ──► pending-cancel ──► cancelled (terminal)
                     │    └── expire         ──► expired  (terminal)
                     │
                     └── submit-timeout ──► submit-unknown ──► (reconcile) ──► submitted | rejected

   any non-terminal ── integration failure ──► error (terminal, requires manual review)
```

Transition preconditions are non-trivial. `submit` requires a pre-trade risk check pass. `cancel-request` is only legal from `submitted`, `partially-filled`, or `submit-unknown` and itself creates a transient `pending-cancel` until the broker confirms. A `fill` event for an order in `cancelled` or `expired` is possible — it's a race, not a bug — and must cause a controlled transition to `filled` or `partially-filled` with a flagged event for human review, never a silent drop.

### Order Types and Lifecycle Variants

Order type determines which transitions are possible and when `expired` fires.

- **Market**: fills immediately at best available price; rarely lives long enough to cancel; no limit price. Usually `submitted → filled` within milliseconds, but partial fills still happen in illiquid names.
- **Limit**: buy at-or-below / sell at-or-above a price. Can rest on the book for the full Time-In-Force window. Partial fills are common.
- **Stop**: becomes a market order when the stop price is touched. Two-phase lifecycle: `submitted` (resting, no fills possible) → `triggered` (internal-only state) → market-order behavior. Store the trigger event explicitly.
- **Stop-Limit**: triggers a limit order at the trigger; can sit unfilled if the limit is never reached after trigger.
- **Trailing-Stop**: stop price moves with the market by an offset or percentage. The broker tracks the trailing stop; your system should record the initial parameters and the final trigger price when it fires.
- **OCO (One-Cancels-Other)**: two orders linked; fill on one cancels the other. Model as a parent order-group with two child orders, both in the state machine, linked by `group_id` and a `cancels_on_fill` flag.
- **Bracket**: parent entry order with two OCO children (profit-take and stop-loss). Children remain `new` until parent fills, then auto-submit. Failure to enable the children on parent fill is a common defect — exercise in integration tests.

**Time-In-Force (TIF)** codes drive the `expired` transition: `DAY` (expires at session close), `GTC` (good-till-cancelled, broker-specific max lifetime — IBKR caps at 90 days), `IOC` (immediate-or-cancel, partial fill OK, remainder cancelled instantly), `FOK` (fill-or-kill, all-or-nothing, no partial), `GTD` (good-till-date), `OPG` (at-the-open), `CLS` (at-the-close). The broker enforces TIF; your system must record it and expect `expired` fills to arrive on the next session boundary, not at the millisecond TIF ended.

### Partial-Fill Handling

A partial fill is one execution report against an open order; cumulative fill quantity equals the sum of all prior execution quantities for that order. Two tracking strategies, both valid, only one allowed at a time:

1. **Internal aggregation**: sum your own stored fill rows; ignore the broker's `cum_qty` field except as a cross-check.
2. **Broker-reported cumulative**: trust the broker's `cum_qty` and `avg_px` in each execution report; don't sum locally.

Mixing produces silent drift. Pick one per integration, document it, and reconcile the other as a monitor. The internal-aggregation path is more resilient to out-of-order webhook delivery; the broker-reported path is simpler but requires correct event ordering.

**Average fill price** is volume-weighted, not arithmetic. For fills `(qty_i, price_i)`:

```
avg_fill_price = Σ(qty_i × price_i) / Σ(qty_i)
```

Compute in fixed-scale decimals, not float. Store the avg on the order row as a cached projection, recomputed on every fill insert within the same transaction.

**When to mark an order "done"** is subtle. An IOC or FOK that partially fills transitions to `filled` for the fill quantity and `cancelled` for the remainder — some systems model this as two terminal transitions on the same order; others as one order that ends in `partially-filled` with a `cancel_reason: 'ioc_remainder'`. Pick a convention and enforce it. A DAY order that partially fills and then reaches session close transitions `partially-filled → expired` on the session boundary.

### Cancellation Semantics

A cancel is a *request*, not an *action*. The lifecycle is `cancel_requested → pending_cancel → (broker confirms) → cancelled` OR `(fill arrives first) → partially-filled or filled`. Brokers do not guarantee that a cancel will beat an incoming fill; the exchange decides. The cancel-replace pattern (modify price/qty of a working order) is especially fraught — most brokers do not guarantee atomicity, meaning the original can fill, the replacement can fill, or both can fill in sequence. Defensive design:

- Never treat "cancel requested" as "cancelled" in UI state — use a visually distinct `pending-cancel` badge.
- Always support a **cancel-confirmed fill race**: accept a fill event on a `pending-cancel` order, transition to `filled`/`partially-filled`, and flag the race in audit.
- For cancel-replace, prefer a cancel-then-new sequence over a broker-side `replace` when the broker doesn't guarantee atomicity (Alpaca, Tradier); use native replace only where atomicity is documented (Interactive Brokers with `OrderModify`).

### Webhook Delivery Guarantees and Dedupe

Every major broker's webhook system is at-least-once: retries on 5xx, retries on timeout, retries on TCP reset. Many are also out-of-order under load. Idempotency is enforced by a dedupe table with the broker's execution id as the key:

```sql
CREATE TABLE broker_events (
  broker         TEXT NOT NULL,          -- 'alpaca' | 'ibkr' | 'tradier' | ...
  event_id       TEXT NOT NULL,          -- broker's execution_id or event_id
  event_type     TEXT NOT NULL,          -- 'fill' | 'cancel_confirmed' | ...
  order_id       UUID REFERENCES orders(id),
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload        JSONB NOT NULL,
  PRIMARY KEY (broker, event_id)
);
-- Retention: 90 days minimum, 13 months for regulated flows (SEC 17a-4)
```

Retention must exceed the broker's maximum retry horizon plus a generous margin. Alpaca retries for ~24 hours; IBKR TWS replays on reconnect for the trading day; some crypto exchanges have no documented horizon. Ninety days is a defensible minimum; thirteen months aligns with SEC 17a-4 (`backend-fintech-compliance.md`). Purging too early lets a late duplicate slip in as "new."

### Dedupe-on-Insert Fill Handler

```typescript
type FillEvent = {
  broker: string;
  executionId: string;              // broker-assigned, globally unique per broker
  brokerOrderId: string;
  clientOrderId: string;            // your id, echoed by the broker
  side: 'buy' | 'sell';
  quantity: Decimal;
  price: Decimal;
  executedAt: string;               // ISO 8601, broker's clock
  cumQty: Decimal;
  avgPx: Decimal;
  receivedAt: string;               // your ingestion clock
};

async function ingestFill(evt: FillEvent): Promise<void> {
  await db.tx(async (tx) => {
    // 1. Dedupe — INSERT ... ON CONFLICT DO NOTHING on (broker, event_id)
    const inserted = await tx.query(
      `INSERT INTO broker_events (broker, event_id, event_type, order_id, payload)
       VALUES ($1, $2, 'fill',
               (SELECT id FROM orders WHERE client_order_id = $3), $4)
       ON CONFLICT (broker, event_id) DO NOTHING
       RETURNING event_id`,
      [evt.broker, evt.executionId, evt.clientOrderId, evt]
    );
    if (inserted.rowCount === 0) return;          // duplicate — silent success

    // 2. Insert fill row; transition order state; recompute avg price
    await tx.query(
      `INSERT INTO fills (order_id, broker_execution_id, qty_minor, price_minor,
                          executed_at, received_at, broker_ts, storage_ts)
         SELECT o.id, $1, $2, $3, $4, $5, $4, now()
           FROM orders o WHERE o.client_order_id = $6`,
      [evt.executionId, evt.quantity, evt.price,
       evt.executedAt, evt.receivedAt, evt.clientOrderId]
    );
    await transitionOrder(tx, evt.clientOrderId, 'fill', evt);

    // 3. Post ledger entry (idempotent on executionId)
    await postFillToLedger(tx, evt);
  });
}
```

Dedupe happens inside the transaction — not in a prior `SELECT` — so two concurrent webhook deliveries from the broker's retry queue cannot both win the race.

### Reconciliation Query

On every process startup and on a scheduled cadence (every 5 minutes during market hours is typical), query the broker for all open orders and diff against the internal state machine.

```typescript
async function reconcileOpenOrders(broker: BrokerClient): Promise<Mismatch[]> {
  const [external, internal] = await Promise.all([
    broker.listOrders({ status: 'open' }),           // broker says these are live
    db.query(
      `SELECT client_order_id, state, broker_order_id
         FROM orders
         WHERE state IN ('submitted','partially-filled','pending-cancel','submit-unknown')`
    ),
  ]);

  const extById = new Map(external.map(o => [o.clientOrderId, o]));
  const intById = new Map(internal.rows.map(o => [o.client_order_id, o]));
  const mismatches: Mismatch[] = [];

  for (const [cid, ext] of extById) {
    const int = intById.get(cid);
    if (!int) mismatches.push({ kind: 'external-only', cid, ext });
    else if (int.state === 'submit-unknown') mismatches.push({ kind: 'resolved-unknown', cid, ext });
    else if (int.broker_order_id !== ext.id) mismatches.push({ kind: 'id-mismatch', cid });
  }
  for (const [cid, int] of intById) {
    if (!extById.has(cid)) mismatches.push({ kind: 'internal-only-open', cid, int });
  }
  return mismatches;
}
```

Mismatch workflows: `resolved-unknown` and `id-mismatch` auto-reconcile by pulling the broker's order detail and replaying events; `external-only` (broker has an order we never recorded) and `internal-only-open` (we think it's live, broker doesn't) go to a manual-review queue with SLA. Never auto-cancel an `external-only` order without operator approval — it may be the survivor of a different deploy.

### Clock Drift and Timestamps

Three distinct timestamps must be recorded on every fill and every state transition, because any one alone will lie:

- **Broker timestamp** (`broker_ts`): when the broker says the event occurred. Authoritative for regulatory reporting and sequencing with exchange data. Subject to the broker's clock sync.
- **Ingestion timestamp** (`received_at`): when your webhook endpoint received the payload. Bounds network + broker-queue latency. Critical for SLA alerting.
- **Storage timestamp** (`storage_ts`): when the row was committed to your database. Authoritative for ordering within your system.

Storing only one collapses three distinct failure modes (broker clock skew, webhook queue delay, your DB commit delay) into an un-debuggable blob. When reconstructing a timeline for a trade dispute, all three are demanded. NTP-sync every host, and alarm on drift > 500ms.

### Common Pitfalls

- **Losing fills on 5xx responses.** If your webhook endpoint returns 500 during a database outage, the broker retries — for a while. Alpaca gives up after ~24 hours; IBKR replays on TWS reconnect but not indefinitely. After the retry horizon, fills are permanently lost to the event stream and only reconciliation finds them. Never return 5xx on business-logic failures; ack with 200 and queue the event internally for retry.
- **Double-counting when switching between webhook and polling.** Running both ingest paths simultaneously without a shared dedupe table duplicates every fill. The dedupe table (`broker_events` keyed on `(broker, event_id)`) is a hard dependency of either path and both.
- **State stored as strings with no enum.** `order.status = "Filled"` vs `"filled"` vs `"FILLED"` — the bug reports write themselves. Use a database enum or a `CHECK (state IN (...))` constraint and a typed enum in code; make illegal transitions impossible at the persistence layer.
- **Treating `submit-unknown` as `rejected`.** A developer sees a submit timeout, retries the order, and the broker happily accepts both — the customer is now long 200 shares instead of 100. Always reconcile, never retry blind.
- **Ignoring out-of-order webhook delivery.** Two partial fills arrive, but delivery order is reversed; the naive handler marks `cum_qty` going backwards. Use the broker's own sequence number or `cum_qty` as the source of truth for ordering within an order's fill stream; reject inserts that would decrease `cum_qty` without flagging.
- **Forgetting cancel-fill races.** The UI shows "cancelled" but a fill arrives 200ms later. Allow the transition, flag for review, do not silently drop. Dropping is fraud-adjacent — the customer has the position and you've hidden it.
- **Not reconciling on reconnect.** A process restart while the broker's websocket was disconnected loses every event that arrived in the gap. Every reconnect triggers a full reconciliation pass for open orders, not just a resume.
- **TIF mis-modeling on overnight sessions.** A DAY order in US equities expires at 4pm ET; a DAY order in futures expires at the session close of the specific contract (5pm CT for most CME). A GTC for IBKR auto-cancels at 90 days even if you meant "forever." Store the broker's exact TIF semantics, don't translate to your own enum.

See also `backend-fintech-ledger.md` for the journal entries every fill emits, `backend-fintech-broker-integration.md` for per-broker protocol quirks, and `backend-fintech-risk-management.md` for the pre-trade checks gating the `new → submitted` transition.
