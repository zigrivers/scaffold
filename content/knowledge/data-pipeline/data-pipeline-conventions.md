---
name: data-pipeline-conventions
description: Naming conventions, error handling patterns, idempotency, and dead-letter queue patterns for data pipelines
topics: [data-pipeline, conventions, naming, error-handling, idempotency, dead-letter, patterns]
---

Data pipeline conventions are the shared language that makes a pipeline system maintainable across teams and time. Inconsistent naming, absent idempotency guarantees, and ad-hoc error handling are the top causes of data corruption and operational incidents. Establish and enforce these conventions from day one — retrofitting them onto running production pipelines is expensive and risky.

## Summary

Use a consistent naming scheme (`entity_action_v1`) for all pipeline artifacts. Implement idempotency at every processing step so reruns never produce duplicates. Route all unprocessable records to dead-letter queues (DLQs) rather than silently dropping them. Classify errors as retriable or non-retriable and handle each class explicitly. Document conventions in a shared standard and enforce them via linting and code review.

## Deep Guidance

### Naming Conventions

Pipeline naming consistency enables operational tooling (lineage, monitoring, search) and reduces cognitive overhead when debugging incidents. Apply a single naming scheme across all pipeline artifacts.

**Event and topic naming**

Use `{domain}_{entity}_{action}` in `snake_case`:
- `payments_transaction_created`
- `users_profile_updated`
- `inventory_item_depleted`
- `orders_shipment_dispatched`

Avoid generic names like `events`, `data`, or `messages`. The name must encode what the event represents without reading the schema.

**Table and dataset naming**

Apply the medallion layer as a prefix for warehouse tables:
- Bronze (raw): `bronze_{source}_{entity}` → `bronze_stripe_charges`
- Silver (cleaned): `silver_{entity}` → `silver_charges`
- Gold (aggregated): `gold_{domain}_{subject}` → `gold_revenue_daily`

For version-controlled schemas: `silver_charges_v2`. Never modify a table schema in place — create a new versioned table and migrate consumers.

**Pipeline/DAG naming**

DAG IDs and pipeline names follow `{domain}_{entity}_{operation}`:
- `payments_transactions_ingest`
- `users_events_enrich`
- `revenue_reports_aggregate`

Append environment suffix in non-production: `payments_transactions_ingest_staging`. This prevents accidental cross-environment data writes.

**Job and task naming within pipelines**

Tasks inside a DAG are verbs: `extract`, `validate`, `transform`, `load`, `reconcile`. Use compound verbs when the scope requires it: `extract_from_stripe`, `validate_schema`, `load_to_bigquery`.

**Version suffixing**

Append `_v{N}` to pipeline names and table names when making breaking changes. Consumer-visible interfaces (schemas, API contracts) increment their version when backward compatibility breaks. Internal implementation changes do not require version increments.

### Error Handling Patterns

Classify every error before handling it. The classification determines the recovery strategy:

**Retriable errors** — transient failures that will likely succeed on retry:
- Network timeouts and connection resets
- Rate limiting (HTTP 429, throttling exceptions)
- Transient database lock contention
- Infrastructure blips (temporary unavailability)

Handle retriable errors with exponential backoff and jitter:
```python
def retry_with_backoff(fn, max_retries=5, base_delay=1.0):
    for attempt in range(max_retries):
        try:
            return fn()
        except RetriableError as e:
            if attempt == max_retries - 1:
                raise
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            time.sleep(delay)
```

Cap maximum retry delay (e.g., 60 seconds) to avoid indefinite blocking. Cap total retry duration to fit within SLA budgets.

**Non-retriable errors** — permanent failures that require human intervention or alternative routing:
- Schema validation failures (malformed record structure)
- Business rule violations (negative quantities, future birthdates by centuries)
- Missing required foreign key references
- Encoding errors and unparseable data

Do not retry non-retriable errors. Route them directly to the dead-letter queue with full context.

**Poison pill errors** — records that cause the pipeline to crash on every attempt:
- Records that trigger a segfault or OOM in the processing runtime
- Records that cause infinite loops in transformation logic

Detect poison pills by tracking per-record failure counts. After N failures for the same record ID, route to DLQ with a `poison_pill` classification tag and alert the on-call engineer.

### Idempotency

Every pipeline processing step must be idempotent: running the step multiple times with the same input produces the same output as running it once. Idempotency is required for:
- Safe retries without duplicating data
- Backfill operations (reprocessing historical data)
- Recovery from failures mid-run
- Zero-downtime deploys (brief overlap between old and new pipeline versions)

**Idempotency implementation patterns**

*Deduplication keys*: Assign a unique deterministic ID to every record based on its content or source identifiers. Use this key to detect and skip already-processed records.

```python
def compute_idempotency_key(record: dict) -> str:
    # Build key from stable source identifiers
    key_fields = (record["source_system"], record["source_id"], record["event_type"])
    return hashlib.sha256("|".join(str(f) for f in key_fields).encode()).hexdigest()
```

*Upsert patterns*: Write operations should use upsert semantics (INSERT OR REPLACE, MERGE, ON CONFLICT DO UPDATE) rather than plain INSERT. A re-run inserts new records and overwrites existing ones to the same result.

*Partition-based overwrite*: For batch pipelines writing to partitioned storage, overwrite the entire partition on each run. The result of running once or ten times is identical — the partition contains the correct data for that time window.

*Idempotency tokens*: When calling external APIs, pass an idempotency token (request UUID) so the upstream system treats duplicate calls as no-ops.

**What breaks idempotency**

- Appending to a table without checking for existing records
- Generating new UUIDs inside the pipeline (call once, store, reuse)
- Incrementing counters inside processing logic
- Using `NOW()` or `CURRENT_TIMESTAMP` as a data value rather than passing the source event timestamp through

### Dead-Letter Queue (DLQ) Patterns

A dead-letter queue is a separate storage location for records that failed processing and cannot be automatically recovered. DLQs prevent bad records from blocking pipeline progress while preserving the data for investigation and reprocessing.

**DLQ design principles**

Every pipeline must have a DLQ. Silently discarding unprocessable records is never acceptable — it creates invisible data loss that is discovered only when downstream reports are wrong.

**DLQ record structure**

Enrich every DLQ record with the failure context needed to investigate and fix it:

```json
{
  "original_record": { ... },
  "dlq_metadata": {
    "pipeline_id": "payments_transactions_ingest",
    "pipeline_version": "1.3.2",
    "failure_timestamp": "2024-01-15T14:23:45Z",
    "failure_reason": "schema_validation_error",
    "error_message": "Field 'amount' expected number, got string: 'N/A'",
    "error_class": "non_retriable",
    "retry_count": 0,
    "source_partition": "2024-01-15",
    "source_offset": 1847392
  }
}
```

**DLQ operational workflow**

1. Alert when DLQ depth exceeds threshold (e.g., > 100 records within 1 hour)
2. Engineer investigates: is this a code bug (fix and reprocess) or a source data issue (escalate to producer)?
3. Fix the root cause (pipeline code or source data)
4. Replay DLQ records through the fixed pipeline
5. Verify replayed records processed successfully and DLQ is drained

**DLQ retention**: Retain DLQ records for at least 30 days (or the SLA for incident resolution). Purge older records only after confirming they were resolved or intentionally discarded.

**DLQ monitoring**: Track DLQ depth, record age, and failure reason distribution as first-class pipeline metrics. A growing DLQ is a production incident.

### Schema and Contract Conventions

Document the contract each pipeline step exposes to its consumers:

- Input schema: the record structure this step accepts
- Output schema: the record structure this step produces
- Guarantees: ordering guarantees, completeness guarantees, latency SLA
- Breaking change policy: how many days notice before changing the contract

Encode contracts as schema files (Avro, JSON Schema, Protobuf) checked into version control alongside the pipeline code. Consumers reference a specific schema version, not "whatever the pipeline produces today."
