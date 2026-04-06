---
name: data-pipeline-dev-environment
description: Local development setup with Docker, sample data generation, replay tooling, and test fixtures for data pipelines
topics: [data-pipeline, dev-environment, docker, local-development, sample-data, replay, test-fixtures]
---

A productive data pipeline development environment must run locally without requiring cloud accounts, production credentials, or access to real data. Engineers must be able to ingest, process, debug, and test the full pipeline on their laptop in under 10 minutes from a clean checkout. This requires containerized dependencies, synthetic sample data, and tooling to replay specific scenarios.

## Summary

Use Docker Compose to run all pipeline dependencies locally (Kafka, Postgres, object storage, orchestrator UI). Generate synthetic sample data with realistic distributions that match production schemas. Build replay tooling so engineers can re-run any historical pipeline execution or simulate specific failure scenarios. Keep test fixtures small, version-controlled, and deterministic.

## Deep Guidance

### Docker Compose Local Stack

Define the complete local dependency stack in `docker/docker-compose.yml`. Every external system the pipeline depends on must run locally:

```yaml
# docker/docker-compose.yml
version: "3.9"

services:
  # Message broker
  kafka:
    image: confluentinc/cp-kafka:7.5.0
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    depends_on: [zookeeper]

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  # Schema registry
  schema-registry:
    image: confluentinc/cp-schema-registry:7.5.0
    ports:
      - "8081:8081"
    environment:
      SCHEMA_REGISTRY_HOST_NAME: schema-registry
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: kafka:9092

  # Source database (CDC)
  postgres:
    image: postgres:15
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: pipeline
      POSTGRES_PASSWORD: pipeline
      POSTGRES_DB: source_db
    command: >
      postgres
        -c wal_level=logical
        -c max_replication_slots=10
        -c max_wal_senders=10
    volumes:
      - ./docker/postgres/init:/docker-entrypoint-initdb.d

  # Object storage (S3-compatible)
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

  # Pipeline orchestrator (Airflow)
  airflow-webserver:
    image: apache/airflow:2.8.0
    ports:
      - "8080:8080"
    environment:
      AIRFLOW__CORE__EXECUTOR: LocalExecutor
      AIRFLOW__DATABASE__SQL_ALCHEMY_CONN: postgresql+psycopg2://airflow:airflow@airflow-db/airflow
      AIRFLOW__CORE__LOAD_EXAMPLES: "false"
    volumes:
      - ../src/dags:/opt/airflow/dags
      - ../config:/opt/airflow/config
    depends_on: [airflow-db]

  airflow-db:
    image: postgres:15
    environment:
      POSTGRES_USER: airflow
      POSTGRES_PASSWORD: airflow
      POSTGRES_DB: airflow

volumes:
  minio_data:
```

### Local Setup Script

The bootstrap script gets a clean checkout to a running local environment:

```bash
#!/bin/bash
# scripts/bootstrap.sh — Set up local development environment

set -euo pipefail

echo "==> Installing Python dependencies"
pip install -e ".[dev]"

echo "==> Starting Docker services"
docker compose -f docker/docker-compose.yml up -d

echo "==> Waiting for services to be healthy"
./scripts/wait-for-services.sh

echo "==> Creating local Kafka topics"
docker exec kafka kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic payments_transaction_created \
  --partitions 8 \
  --replication-factor 1 \
  --if-not-exists

echo "==> Creating MinIO buckets"
docker exec minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec minio mc mb local/raw-data --ignore-existing
docker exec minio mc mb local/processed-data --ignore-existing

echo "==> Seeding database schemas"
psql postgresql://pipeline:pipeline@localhost:5432/source_db -f docker/postgres/schema.sql

echo "==> Generating sample data"
python scripts/generate-sample-data.py --records 10000 --output fixtures/

echo "==> Local environment ready!"
echo "    Airflow UI:     http://localhost:8080 (admin/admin)"
echo "    MinIO console:  http://localhost:9001 (minioadmin/minioadmin)"
echo "    Kafka:          localhost:9092"
echo "    Postgres:       localhost:5432"
```

### Sample Data Generation

Synthetic data must match production schemas and include realistic distributions, edge cases, and known-bad records for testing error handling:

```python
# scripts/generate-sample-data.py
import json
import random
from datetime import datetime, timedelta
from typing import Iterator
import uuid

CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD"]
CURRENCY_WEIGHTS = [0.60, 0.20, 0.10, 0.05, 0.05]
COUNTRIES = ["US", "GB", "DE", "FR", "JP", "CA", "AU"]

def generate_transaction(ts: datetime, inject_error: bool = False) -> dict:
    """Generate a synthetic payment transaction.

    Args:
        ts: Event timestamp
        inject_error: If True, inject a known-bad record for error handling tests
    """
    if inject_error:
        return {
            "transaction_id": str(uuid.uuid4()),
            "amount": "N/A",          # schema violation: string instead of number
            "currency": "INVALID",    # invalid enum
            "user_id": None,          # null violation
            "created_at": ts.isoformat(),
        }

    currency = random.choices(CURRENCIES, CURRENCY_WEIGHTS)[0]
    # Log-normal distribution matches real transaction amount distributions
    amount = round(random.lognormvariate(3.5, 1.2), 2)

    return {
        "transaction_id": str(uuid.uuid4()),
        "amount": amount,
        "currency": currency,
        "user_id": f"usr_{random.randint(1, 50000):06d}",
        "merchant_id": f"mer_{random.randint(1, 5000):05d}",
        "country": random.choice(COUNTRIES),
        "created_at": ts.isoformat(),
        "status": random.choices(["completed", "failed", "pending"], [0.92, 0.05, 0.03])[0],
    }

def generate_dataset(
    records: int,
    error_rate: float = 0.01,
    start_time: datetime | None = None,
) -> Iterator[dict]:
    """Generate a stream of synthetic transactions with configurable error rate."""
    start = start_time or datetime.utcnow() - timedelta(hours=24)
    for i in range(records):
        ts = start + timedelta(seconds=i * 0.1)
        inject_error = random.random() < error_rate
        yield generate_transaction(ts, inject_error)
```

### Replay Tooling

Replay tools allow engineers to re-run pipeline logic against specific historical data or DLQ records without running the full orchestration stack:

```bash
#!/bin/bash
# scripts/replay.sh — Replay pipeline execution for a specific time window

set -euo pipefail

PIPELINE="${1:-}"
START_DATE="${2:-}"
END_DATE="${3:-}"

if [[ -z "$PIPELINE" || -z "$START_DATE" ]]; then
    echo "Usage: replay.sh <pipeline_id> <start_date> [end_date]"
    echo "  Example: replay.sh payments_transactions_ingest 2024-01-15"
    exit 1
fi

echo "==> Replaying ${PIPELINE} from ${START_DATE} to ${END_DATE:-${START_DATE}}"

python -m src.replay \
    --pipeline "${PIPELINE}" \
    --start "${START_DATE}" \
    --end "${END_DATE:-${START_DATE}}" \
    --env local \
    --dry-run false
```

Python replay runner:
```python
# src/replay.py
def replay_pipeline(
    pipeline_id: str,
    start: date,
    end: date,
    env: str = "local",
    dry_run: bool = True,
) -> ReplayResult:
    """Replay a pipeline for a given date range.

    Runs the pipeline transformation logic directly against historical source data
    without going through the orchestrator. Safe to run against production sources
    in read-only mode (dry_run=True).
    """
    config = load_config(env)
    pipeline = load_pipeline(pipeline_id, config)

    results = []
    for partition_date in date_range(start, end):
        records = pipeline.source.read(partition_date, partition_date + timedelta(days=1))
        transformed = pipeline.transform(records)
        quality_result = pipeline.quality.check(transformed)

        if not dry_run:
            pipeline.sink.write(transformed, partition=str(partition_date))

        results.append(PartitionResult(
            date=partition_date,
            records_read=len(records),
            records_written=len(transformed) if not dry_run else 0,
            quality_passed=quality_result.passed,
            quality_failures=quality_result.failures,
        ))

    return ReplayResult(partitions=results)
```

### DLQ Replay

A specific replay workflow for DLQ records:

```bash
# scripts/replay-dlq.sh — Replay records from dead-letter queue

set -euo pipefail

PIPELINE="${1:-}"
DLQ_DATE="${2:-$(date -u +%Y-%m-%d)}"

echo "==> Replaying DLQ for ${PIPELINE} on ${DLQ_DATE}"

python -m src.dlq_replay \
    --pipeline "${PIPELINE}" \
    --date "${DLQ_DATE}" \
    --env local
```

### Test Fixtures

Test fixtures are small, static datasets checked into version control:

```
tests/fixtures/
├── payments/
│   ├── raw/
│   │   ├── valid_transactions.json       # 50 valid records
│   │   ├── invalid_amount.json           # Records with bad amount values
│   │   ├── missing_user_id.json          # Records with null required fields
│   │   └── duplicate_transactions.json   # Duplicate records for dedup testing
│   └── expected/
│       ├── normalized_transactions.json  # Expected output after normalization
│       └── aggregated_revenue.json       # Expected output after aggregation
└── users/
    ├── raw/
    │   └── user_events.json
    └── expected/
        └── deduplicated_events.json
```

Fixture size guidelines:
- Minimum: 10 records (enough to test logic)
- Maximum: 500 records (keeps test runtime fast)
- Always include: at least one edge case per tested scenario (empty string, null, boundary value, duplicate)
- Never include: real production data, PII, or data containing actual user information

Fixture loading utility:
```python
def load_fixture(category: str, name: str) -> list[dict]:
    """Load a test fixture from tests/fixtures/."""
    path = Path(__file__).parent.parent / "fixtures" / category / f"{name}.json"
    return json.loads(path.read_text())
```

### Environment Variable Management

Use `.env.example` committed to the repo and `.env` gitignored:

```bash
# .env.example — copy to .env and fill in values
PIPELINE_ENV=local
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
SCHEMA_REGISTRY_URL=http://localhost:8081
POSTGRES_URL=postgresql://pipeline:pipeline@localhost:5432/source_db
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
```

Never commit `.env` files. Never hardcode credentials in any source file.
