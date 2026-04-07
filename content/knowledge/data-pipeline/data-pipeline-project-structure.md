---
name: data-pipeline-project-structure
description: Canonical directory layout for data pipeline projects covering DAGs, transforms, sinks, quality checks, configuration, and tests
topics: [data-pipeline, project-structure, dags, transforms, sinks, quality, config, tests]
---

A well-organized data pipeline project separates pipeline orchestration logic from transformation logic, data sinks, and quality checks. This separation allows each concern to evolve independently and makes the codebase navigable for engineers unfamiliar with the project. The structure below is opinionated but widely applicable to Airflow, Prefect, Dagster, and similar orchestration tools.

## Summary

Organize pipeline projects into `src/dags/` for orchestration, `src/transforms/` for pure transformation functions, `src/sinks/` for write adapters, `src/quality/` for validation logic, `config/` for environment-specific settings, and `tests/` mirroring the `src/` structure. Keep business logic in transforms — not in DAG files. Configuration is never hardcoded.

## Deep Guidance

### Root Directory Layout

```
my-pipeline/
├── src/
│   ├── dags/           # Orchestration DAGs / pipeline definitions
│   ├── transforms/     # Pure transformation functions
│   ├── sources/        # Source connectors and readers
│   ├── sinks/          # Destination connectors and writers
│   ├── quality/        # Data quality checks and validators
│   └── utils/          # Shared utilities (logging, metrics, retry)
├── config/
│   ├── base.yaml       # Shared configuration across environments
│   ├── dev.yaml        # Development overrides
│   ├── staging.yaml    # Staging overrides
│   └── prod.yaml       # Production overrides
├── tests/
│   ├── unit/           # Unit tests for transforms, sources, sinks
│   ├── integration/    # Integration tests against real (or containerized) systems
│   ├── quality/        # Data quality test definitions
│   └── fixtures/       # Static test data files
├── scripts/
│   ├── bootstrap.sh    # Local environment setup
│   ├── replay.sh       # DLQ and historical replay tooling
│   └── backfill.sh     # Backfill orchestration helper
├── docker/
│   ├── docker-compose.yml       # Local development stack
│   └── docker-compose.test.yml  # Test isolation stack
├── Makefile
├── pyproject.toml      # Python project metadata and dependencies
└── README.md
```

### `src/dags/` — Orchestration Layer

DAG files define pipeline topology, scheduling, and task dependencies. They must be thin:

```
src/dags/
├── payments/
│   ├── transactions_ingest.py
│   ├── transactions_enrich.py
│   └── revenue_aggregate.py
├── users/
│   ├── events_ingest.py
│   └── profiles_sync.py
└── shared/
    ├── base_dag.py     # Shared DAG defaults (retries, alerts, SLA)
    └── sensors.py      # Common sensors (S3 sensor, DB sensor)
```

**Rule**: DAG files contain no business logic. A DAG file defines what runs, in what order, with what dependencies. All data processing logic lives in `src/transforms/`. A DAG task calls a function from `src/transforms/` — it does not implement the transformation inline.

Bad (logic in DAG):
```python
@task
def process_transactions(**context):
    df = pd.read_parquet(...)
    df['amount_usd'] = df['amount'] / df['exchange_rate']  # business logic in DAG
    df.to_parquet(...)
```

Good (DAG calls transform):
```python
from transforms.payments import normalize_transaction_amounts

@task
def process_transactions(**context):
    records = sources.payments.read(context['date'])
    normalized = normalize_transaction_amounts(records)
    sinks.warehouse.write(normalized, partition=context['date'])
```

### `src/transforms/` — Transformation Logic

Transforms are pure functions: they take data in, return data out, with no side effects. This makes them independently testable without any pipeline infrastructure.

```
src/transforms/
├── payments/
│   ├── __init__.py
│   ├── normalize.py    # Currency normalization, amount parsing
│   ├── enrich.py       # Join with reference data
│   └── aggregate.py    # Revenue rollups, daily summaries
├── users/
│   ├── __init__.py
│   ├── deduplicate.py  # Deduplication logic
│   └── classify.py     # User segment classification
└── shared/
    ├── timestamps.py   # Timestamp parsing and normalization
    ├── currencies.py   # Currency conversion utilities
    └── pii.py          # PII masking and hashing functions
```

Pure transform function pattern:
```python
def normalize_transaction_amounts(records: list[dict]) -> list[dict]:
    """Convert all transaction amounts to USD using embedded exchange rates.

    Args:
        records: Raw transaction records with 'amount' and 'currency' fields

    Returns:
        Records with added 'amount_usd' field. Input records unchanged.
    """
    result = []
    for record in records:
        normalized = {**record}
        normalized['amount_usd'] = convert_to_usd(record['amount'], record['currency'])
        result.append(normalized)
    return result
```

### `src/sources/` — Source Connectors

Sources abstract the read interface for each upstream system:

```
src/sources/
├── stripe/
│   ├── __init__.py
│   ├── charges.py      # Stripe Charges API reader
│   └── webhooks.py     # Stripe webhook event reader
├── postgres/
│   ├── __init__.py
│   └── cdc_reader.py   # CDC via logical replication
├── s3/
│   ├── __init__.py
│   └── parquet_reader.py
└── kafka/
    ├── __init__.py
    └── consumer.py
```

Sources implement a common interface:
```python
class Source(Protocol):
    def read(self, start: datetime, end: datetime) -> Iterable[dict]: ...
    def count(self, start: datetime, end: datetime) -> int: ...
```

### `src/sinks/` — Destination Writers

Sinks abstract the write interface for each downstream system:

```
src/sinks/
├── bigquery/
│   ├── __init__.py
│   ├── writer.py       # Streaming insert and load job writer
│   └── partitioned.py  # Partitioned table writer
├── s3/
│   ├── __init__.py
│   └── parquet_writer.py
├── postgres/
│   ├── __init__.py
│   └── upsert_writer.py
└── dlq/
    ├── __init__.py
    └── writer.py       # Dead-letter queue writer
```

Sinks implement idempotent write semantics:
```python
class Sink(Protocol):
    def write(self, records: Iterable[dict], partition: str) -> WriteResult: ...
    def write_dlq(self, record: dict, error: Exception, context: dict) -> None: ...
```

### `src/quality/` — Data Quality Checks

Quality checks are assertions about data that run inline in the pipeline:

```
src/quality/
├── rules/
│   ├── completeness.py  # Null rate checks
│   ├── accuracy.py      # Range and format checks
│   ├── consistency.py   # Cross-field and cross-table checks
│   └── timeliness.py    # Freshness and late-arrival checks
├── expectations/
│   ├── payments.json    # Great Expectations suite for payments
│   └── users.json       # Great Expectations suite for users
└── reconciliation/
    ├── row_count.py     # Source vs destination row count comparison
    └── checksum.py      # Aggregate checksum comparison
```

### `config/` — Environment Configuration

All pipeline configuration (connection strings, batch sizes, SLA thresholds, feature flags) lives in config files, never hardcoded:

```yaml
# config/base.yaml
pipeline:
  batch_size: 10000
  max_retries: 3
  retry_delay_seconds: 30

quality:
  completeness_threshold: 0.99
  row_count_variance_pct: 0.01

sla:
  max_lag_minutes: 60
```

Environment-specific files override base values only for what differs. Use a config loader that merges base + environment:

```python
def load_config(env: str = "dev") -> Config:
    base = yaml.safe_load(open("config/base.yaml"))
    override = yaml.safe_load(open(f"config/{env}.yaml"))
    return Config(**deep_merge(base, override))
```

### `tests/` — Test Structure Mirrors Source

```
tests/
├── unit/
│   ├── transforms/
│   │   ├── payments/
│   │   │   ├── test_normalize.py
│   │   │   └── test_aggregate.py
│   │   └── users/
│   │       └── test_deduplicate.py
│   ├── sources/
│   └── sinks/
├── integration/
│   ├── test_payments_pipeline.py
│   └── test_users_pipeline.py
├── quality/
│   └── test_data_quality_rules.py
└── fixtures/
    ├── payments/
    │   ├── raw_charges.json
    │   └── expected_normalized.json
    └── users/
        └── raw_events.json
```

The `fixtures/` directory contains static JSON/Parquet/CSV files representing realistic sample data. Fixtures must be small enough to run in CI (< 10MB total) but representative enough to cover edge cases.
