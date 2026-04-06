---
name: data-pipeline-batch-patterns
description: DAG design, partitioning strategies, incremental loads, backfill strategies, and dependency management for batch data pipelines
topics: [data-pipeline, batch, dag, partitioning, incremental-load, backfill, dependency-management, airflow]
---

Batch pipeline design decisions — DAG structure, partition strategy, incremental load mechanics, and backfill tooling — determine whether a pipeline is operationally maintainable or a constant source of incidents. Most batch pipeline failures stem from four root causes: missing idempotency, no backfill support, poorly managed upstream dependencies, and partitioning strategies that don't match query access patterns. Address all four up front.

## Summary

Design DAGs with explicit dependencies, clear task granularity, and idempotent operations. Partition data by the natural business time dimension (event date, not processing date). Implement incremental loads with explicit watermarks. Build backfill support into every pipeline from day one — it is always needed. Model upstream dependencies explicitly with sensors rather than hardcoded schedules.

## Deep Guidance

### DAG Design Principles

A well-designed DAG has four properties:

**1. Idempotent**: Running the DAG for a given execution date multiple times produces the same result as running it once. Every task must be idempotent.

**2. Atomic partitions**: Each DAG run produces a complete, self-consistent partition. Partial writes that leave a partition in an intermediate state corrupt downstream consumers. Use write-then-rename patterns: write to a temp location, verify completeness, then atomically rename/move to the final location.

**3. Explicit dependencies**: Task A depends on Task B only if there is a real data dependency. Do not add artificial dependencies to control parallelism (use pools/slots instead). False dependencies serialize work that could run in parallel.

**4. Catchup-capable**: DAGs must support backfill execution (running past execution dates) without manual intervention. This requires that all tasks use the DAG execution date as the partition identifier, not `NOW()` or `CURRENT_DATE`.

**DAG structure template**

```python
from airflow.decorators import dag, task
from airflow.utils.dates import days_ago
from datetime import datetime, timedelta

@dag(
    dag_id="payments_transactions_ingest",
    schedule_interval="0 * * * *",     # hourly
    start_date=days_ago(1),
    catchup=True,                       # enable backfill
    max_active_runs=4,                  # allow parallel backfill
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=5),
        "retry_exponential_backoff": True,
        "sla": timedelta(minutes=45),   # alert if not done in 45min
        "on_failure_callback": alert_on_failure,
    },
    tags=["payments", "ingestion", "hourly"],
)
def payments_transactions_ingest():

    @task
    def extract(execution_date: datetime = None) -> dict:
        """Extract transactions for the execution hour from source system."""
        window_start = execution_date
        window_end = execution_date + timedelta(hours=1)
        records = sources.payments.read(window_start, window_end)
        staging_path = write_to_staging(records, partition=execution_date)
        return {"staging_path": staging_path, "record_count": len(records)}

    @task
    def validate(extract_result: dict) -> dict:
        """Validate extracted records against quality rules."""
        records = read_from_staging(extract_result["staging_path"])
        quality_result = quality.check(records)
        if not quality_result.passed:
            raise ValueError(f"Quality check failed: {quality_result.failures}")
        return {**extract_result, "quality_passed": True}

    @task
    def transform(validate_result: dict) -> dict:
        """Apply transformations to validated records."""
        records = read_from_staging(validate_result["staging_path"])
        transformed = transforms.payments.normalize(records)
        output_path = write_transformed(transformed)
        return {"output_path": output_path, "record_count": len(transformed)}

    @task
    def load(transform_result: dict, execution_date: datetime = None) -> None:
        """Load transformed records to destination, overwriting the partition."""
        records = read_from_staging(transform_result["output_path"])
        sinks.warehouse.write(
            records,
            partition=execution_date.strftime("%Y-%m-%d/%H"),
            mode="overwrite",  # idempotent: overwrite entire partition on retry
        )

    extracted = extract()
    validated = validate(extracted)
    transformed = transform(validated)
    load(transformed)

dag = payments_transactions_ingest()
```

### Partitioning Strategies

Partitioning determines how data is physically organized in storage and how efficiently it can be queried. Misaligned partitioning causes full table scans where partition pruning should eliminate 99% of data.

**Partition by event time, not processing time**

Use the business event timestamp (when the event occurred) as the partition key, not when the pipeline processed it. Late-arriving events processed at 3am should land in yesterday's partition, not today's.

```python
# Correct: use event timestamp for partitioning
partition_key = record["event_timestamp"].date()

# Wrong: use processing time
partition_key = datetime.utcnow().date()
```

Exception: if downstream consumers query by processing time (e.g., "give me everything loaded since midnight"), partition by processing time instead and document this clearly.

**Partition granularity**

Choose partition granularity based on query patterns and data volume:

| Volume per day | Query access pattern | Recommended partitioning |
|----------------|---------------------|--------------------------|
| < 1 GB | Daily queries | Daily partitions |
| 1–100 GB | Daily queries | Daily partitions |
| 100 GB – 1 TB | Hourly queries | Hourly partitions |
| > 1 TB | Hourly queries | Hourly + secondary partition (country, region) |

Over-partitioning (e.g., per-minute partitions for low-volume data) causes file system metadata overhead and slow listing performance in object stores.

**Partition pruning in query engines**

Partition columns must appear in `WHERE` clauses to benefit from pruning. Ensure the partition column name and data type match what query engines expect:

```sql
-- Efficient: partition pruning eliminates 364/365 partitions
SELECT * FROM silver_transactions
WHERE event_date = '2024-01-15'
  AND country = 'US';

-- Inefficient: wrapping partition column in function prevents pruning
SELECT * FROM silver_transactions
WHERE DATE(event_timestamp) = '2024-01-15';  -- full scan
```

### Incremental Load Patterns

Full table reloads are expensive for large datasets. Incremental loads process only new or changed records since the last successful run.

**Watermark-based incremental load**

Maintain a persistent watermark (the processing boundary) in a metadata store:

```python
class WatermarkStore:
    def get(self, pipeline_id: str) -> datetime:
        """Return the high-water mark for the pipeline (last successfully processed timestamp)."""

    def set(self, pipeline_id: str, watermark: datetime) -> None:
        """Update the high-water mark after successful processing."""

def incremental_extract(pipeline_id: str, source) -> list[dict]:
    store = WatermarkStore()
    low_watermark = store.get(pipeline_id)
    high_watermark = datetime.utcnow() - timedelta(minutes=5)  # lag buffer for late arrivals

    records = source.read(low_watermark, high_watermark)

    # Only advance watermark after successful write
    return records, high_watermark

def incremental_load(pipeline_id: str, records: list[dict], watermark: datetime):
    sinks.warehouse.write(records, mode="append")
    WatermarkStore().set(pipeline_id, watermark)
```

**Late arrival buffer**: Always include a lag buffer (5–60 minutes) when setting the high watermark. Events frequently arrive late at the source due to network delays, mobile client sync, or upstream processing delays. Processing too close to "now" produces incomplete partitions.

**Deduplication in incremental loads**: Incremental appends accumulate duplicates when pipelines retry or overlap windows. Deduplicate in the silver layer using the business key (`transaction_id`, `event_id`), not the pipeline-internal record ID.

### Backfill Strategies

Every pipeline will need to be backfilled. Plan for it upfront.

**When backfills are needed**
- A bug is discovered in transformation logic; historical data must be reprocessed with the fix
- A new derived column is added to the schema; existing partitions lack the column
- A source system retroactively corrects historical data
- Initial data load when launching a new pipeline

**Airflow backfill execution**

```bash
# Backfill a specific date range
airflow dags backfill \
  payments_transactions_ingest \
  --start-date 2024-01-01 \
  --end-date 2024-01-31 \
  --reset-dagruns

# Backfill with parallelism control (avoid overloading source systems)
airflow dags backfill \
  payments_transactions_ingest \
  --start-date 2024-01-01 \
  --end-date 2024-01-31 \
  --max-active-runs 2
```

**Backfill safety checklist**
1. Verify the pipeline is idempotent for the target partition range before starting
2. Check source system capacity — backfills can overload APIs or databases
3. Set `max_active_runs` to limit parallelism during backfill
4. Monitor DLQ during backfill for unexpected errors
5. Validate output record counts against expected ranges after completion
6. Notify downstream consumers if backfill will change data they have already read

### Dependency Management

**Upstream data availability sensors**

Use sensors to wait for upstream data rather than hardcoding schedules:

```python
from airflow.sensors.external_task import ExternalTaskSensor
from airflow.providers.amazon.aws.sensors.s3 import S3KeySensor

# Wait for upstream pipeline to complete
wait_for_upstream = ExternalTaskSensor(
    task_id="wait_for_stripe_ingest",
    external_dag_id="stripe_charges_ingest",
    external_task_id="load",
    timeout=3600,           # fail after 1 hour
    poke_interval=60,       # check every minute
    mode="reschedule",      # release worker slot while waiting
)

# Wait for data file to appear
wait_for_file = S3KeySensor(
    task_id="wait_for_source_file",
    bucket_name="raw-data",
    bucket_key="payments/{{ ds }}/transactions.parquet",
    timeout=7200,
    poke_interval=300,
    mode="reschedule",
)
```

**Cross-DAG dependency mapping**

Maintain a dependency map document alongside DAG code:

```yaml
# config/dag-dependencies.yaml
payments_transactions_enrich:
  depends_on:
    - dag: payments_transactions_ingest
      task: load
      max_lag_hours: 2
    - dag: currency_rates_sync
      task: load
      max_lag_hours: 24
  sla_hours: 4
  consumers:
    - dag: revenue_reports_aggregate
    - dag: fraud_detection_features
```

This map enables automatic lineage tracking, impact analysis for schema changes, and SLA propagation calculations.
