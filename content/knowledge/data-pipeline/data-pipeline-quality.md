---
name: data-pipeline-quality
description: Schema validation, anomaly detection, data quality tests using Great Expectations and dbt, and reconciliation patterns
topics: [data-pipeline, data-quality, schema-validation, anomaly-detection, great-expectations, dbt, reconciliation, testing]
---

Data quality failures are the most operationally damaging class of data pipeline bugs because they often go undetected until a business user notices wrong numbers. Unlike pipeline failures (which are loud and immediately visible), quality degradation is silent — data flows, pipelines succeed, but the numbers are wrong. Building quality checks directly into the pipeline, not as a separate offline process, is the only reliable defense.

## Summary

Validate schema and structural correctness at ingestion. Run statistical anomaly detection on all critical metrics. Implement Great Expectations suites or dbt tests on every table in the medallion stack. Reconcile record counts and aggregate checksums between pipeline stages. Alert on quality degradation before downstream consumers see it. Never silently discard records — route all failures to the DLQ with diagnostic context.

## Deep Guidance

### Schema Validation at Ingestion

Validate incoming data against the expected schema as the first step of every pipeline. Fail fast on schema violations rather than propagating bad data downstream.

**JSON Schema validation**

```python
from jsonschema import validate, ValidationError

TRANSACTION_SCHEMA = {
    "type": "object",
    "required": ["transaction_id", "amount", "currency", "user_id", "created_at"],
    "properties": {
        "transaction_id": {"type": "string", "minLength": 1},
        "amount": {"type": "number", "minimum": 0},
        "currency": {"type": "string", "enum": ["USD", "EUR", "GBP", "JPY", "CAD"]},
        "user_id": {"type": "string", "pattern": "^usr_[0-9]{6}$"},
        "created_at": {"type": "string", "format": "date-time"},
    },
    "additionalProperties": True,  # allow extra fields in bronze
}

def validate_and_route(record: dict, dlq) -> dict | None:
    """Validate record against schema. Route failures to DLQ, return valid records."""
    try:
        validate(instance=record, schema=TRANSACTION_SCHEMA)
        return record
    except ValidationError as e:
        dlq.write(record, error=e, reason="schema_validation_failure")
        return None
```

**Avro schema enforcement**

For Kafka-based pipelines, use Schema Registry to enforce Avro schemas at produce and consume time:

```python
from confluent_kafka.avro import AvroConsumer
from confluent_kafka.avro.serializer import SerializerError

consumer = AvroConsumer({
    "bootstrap.servers": "localhost:9092",
    "schema.registry.url": "http://localhost:8081",
    "group.id": "silver-processor",
})

while True:
    msg = consumer.poll(1.0)
    if msg is None:
        continue
    if msg.error():
        handle_consumer_error(msg.error())
        continue
    try:
        record = msg.value()  # automatically deserialized + schema-validated
        process(record)
    except SerializerError as e:
        dlq.write(msg.value(), error=e, reason="avro_deserialization_failure")
```

### Statistical Anomaly Detection

Structural validation catches format errors. Anomaly detection catches semantic errors — values that are structurally valid but statistically wrong.

**Volume anomaly detection**

```python
def check_volume_anomaly(
    pipeline_id: str,
    actual_count: int,
    window_days: int = 14,
    z_score_threshold: float = 3.0,
) -> AnomalyResult:
    """Detect volume anomalies using z-score against rolling historical baseline."""
    historical = get_historical_counts(pipeline_id, days=window_days)
    mean = statistics.mean(historical)
    stddev = statistics.stdev(historical)

    if stddev == 0:
        return AnomalyResult(anomaly=False)

    z_score = (actual_count - mean) / stddev
    is_anomaly = abs(z_score) > z_score_threshold

    return AnomalyResult(
        anomaly=is_anomaly,
        z_score=z_score,
        actual=actual_count,
        expected_mean=mean,
        expected_stddev=stddev,
        direction="high" if z_score > 0 else "low",
    )
```

**Metric anomaly detection**

Extend volume checks to key business metrics:
- Revenue sum per partition (detect 0-revenue or 100x-revenue outliers)
- Average transaction amount (detect extreme values indicating test data in prod)
- User count per partition (detect sudden drop suggesting source outage)
- Error rate (detect spike indicating upstream system degradation)

### Great Expectations Integration

Great Expectations (GX) provides a declarative assertion framework for data quality:

**Expectation suite definition**

```python
# src/quality/expectations/payments.py
import great_expectations as gx

def build_payments_suite() -> gx.ExpectationSuite:
    suite = gx.ExpectationSuite(expectation_suite_name="silver_transactions")

    # Completeness
    suite.add_expectation(gx.core.ExpectColumnValuesToNotBeNull(
        column="transaction_id", meta={"severity": "critical"}
    ))
    suite.add_expectation(gx.core.ExpectColumnValuesToNotBeNull(
        column="amount", meta={"severity": "critical"}
    ))
    suite.add_expectation(gx.core.ExpectColumnValuesToNotBeNull(
        column="user_id", mostly=0.99, meta={"severity": "high"}
    ))

    # Accuracy
    suite.add_expectation(gx.core.ExpectColumnValuesToBeBetween(
        column="amount", min_value=0, max_value=1_000_000
    ))
    suite.add_expectation(gx.core.ExpectColumnValuesToBeInSet(
        column="currency", value_set=["USD", "EUR", "GBP", "JPY", "CAD"]
    ))
    suite.add_expectation(gx.core.ExpectColumnValuesToMatchRegex(
        column="transaction_id", regex=r"^txn_[a-zA-Z0-9]{20}$"
    ))

    # Volume
    suite.add_expectation(gx.core.ExpectTableRowCountToBeBetween(
        min_value=1000, max_value=10_000_000
    ))

    # Uniqueness
    suite.add_expectation(gx.core.ExpectColumnValuesToBeUnique(
        column="transaction_id"
    ))

    return suite
```

**Running GX in the pipeline**

```python
def run_quality_check(df: pd.DataFrame, suite_name: str) -> ValidationResult:
    context = gx.get_context()
    validator = context.get_validator(
        batch_request=RuntimeBatchRequest(
            datasource_name="runtime",
            data_connector_name="default",
            data_asset_name=suite_name,
            runtime_parameters={"batch_data": df},
            batch_identifiers={"run_id": str(datetime.utcnow())},
        ),
        expectation_suite_name=suite_name,
    )
    result = validator.validate()

    metrics.gauge("data_quality_success_pct",
                  result.statistics["success_percent"],
                  tags={"suite": suite_name})

    if not result.success:
        failed = [e for e in result.results if not e.success]
        critical_failures = [f for f in failed if f.meta.get("severity") == "critical"]
        if critical_failures:
            raise DataQualityError(f"Critical quality failures: {critical_failures}")

    return result
```

### dbt Data Tests

For SQL-based pipelines using dbt, define tests directly in model YAML files:

```yaml
# models/silver/schema.yml
models:
  - name: silver_transactions
    description: Cleaned and validated transaction records
    columns:
      - name: transaction_id
        tests:
          - not_null
          - unique
      - name: amount
        tests:
          - not_null
          - dbt_utils.accepted_range:
              min_value: 0
              max_value: 1000000
      - name: currency
        tests:
          - not_null
          - accepted_values:
              values: ["USD", "EUR", "GBP", "JPY", "CAD"]
      - name: user_id
        tests:
          - not_null
          - relationships:
              to: ref('silver_users')
              field: user_id

    tests:
      - dbt_utils.recency:
          datepart: hour
          field: created_at
          interval: 2    # table should have data from last 2 hours
      - dbt_utils.equal_rowcount:
          compare_model: ref('bronze_transactions')
          # silver count should match bronze minus known invalid records
```

**Custom dbt tests**

```sql
-- tests/assert_no_future_transactions.sql
-- Fails if any transactions are timestamped in the future
SELECT count(*) as future_count
FROM {{ ref('silver_transactions') }}
WHERE created_at > CURRENT_TIMESTAMP + INTERVAL '5 minutes'
HAVING count(*) > 0
```

### Reconciliation Patterns

Reconciliation compares record counts and aggregate values between pipeline stages to detect silent data loss.

**Row count reconciliation**

```python
def reconcile_row_counts(
    source_count: int,
    destination_count: int,
    pipeline_id: str,
    expected_loss_rate: float = 0.001,  # max 0.1% loss acceptable
) -> ReconciliationResult:
    """Compare source and destination record counts."""
    if source_count == 0:
        raise ReconciliationError(f"Source count is zero for {pipeline_id} — possible extraction failure")

    loss_rate = (source_count - destination_count) / source_count

    if loss_rate > expected_loss_rate:
        raise ReconciliationError(
            f"Record loss rate {loss_rate:.4%} exceeds threshold {expected_loss_rate:.4%}. "
            f"Source: {source_count}, Destination: {destination_count}"
        )

    metrics.gauge("pipeline_record_loss_rate", loss_rate, tags={"pipeline": pipeline_id})
    return ReconciliationResult(passed=True, loss_rate=loss_rate)
```

**Aggregate checksum reconciliation**

```python
def reconcile_aggregates(
    source_df: pd.DataFrame,
    destination_df: pd.DataFrame,
    key_column: str,
    value_columns: list[str],
    tolerance_pct: float = 0.001,
) -> ReconciliationResult:
    """Compare aggregate sums between source and destination."""
    failures = []
    for col in value_columns:
        src_sum = source_df[col].sum()
        dst_sum = destination_df[col].sum()

        if src_sum == 0 and dst_sum == 0:
            continue

        variance = abs(src_sum - dst_sum) / max(abs(src_sum), 1e-10)
        if variance > tolerance_pct:
            failures.append(f"{col}: src={src_sum:.2f}, dst={dst_sum:.2f}, variance={variance:.4%}")

    if failures:
        raise ReconciliationError(f"Aggregate reconciliation failed:\n" + "\n".join(failures))

    return ReconciliationResult(passed=True)
```

### Quality Gate Integration

Quality checks must be integrated as pipeline gates, not optional post-processing steps:

```
Extract → Schema Validate → [pass: Transform] [fail: DLQ]
                ↓
         Statistical Check → [anomaly: alert + hold] [pass: continue]
                ↓
         Business Rules → [fail: DLQ] [pass: Load]
                ↓
         Reconciliation → [fail: alert + rollback] [pass: commit]
```

A quality gate failure at any stage must:
1. Route affected records to the DLQ with full diagnostic context
2. Emit a quality failure metric
3. Alert the on-call engineer if the failure rate exceeds the quality budget
4. Block pipeline progression for critical failures (structural, not statistical)
