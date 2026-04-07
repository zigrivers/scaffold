---
name: data-pipeline-testing
description: Unit tests for transforms, integration tests, data quality tests, and performance tests for data pipelines
topics: [data-pipeline, testing, unit-tests, integration-tests, data-quality-tests, performance-tests, tdd, pytest]
---

Data pipeline testing requires a layered strategy: fast unit tests for transformation logic, integration tests against containerized infrastructure, data quality tests that run inline in production, and performance tests to catch throughput regressions. The most common testing gap in pipeline projects is that DAG files and orchestration logic are tested but transformation functions — the business logic — are not. Transformation functions must be the most heavily tested component because correctness of results depends entirely on them.

## Summary

Test transformation functions as pure functions with unit tests: no infrastructure, no side effects, fast execution. Test pipeline end-to-end integration against containerized Kafka, Postgres, and object storage. Run data quality tests inline as pipeline gates using Great Expectations or dbt tests. Test performance against a realistic data volume to catch throughput regressions before they reach production. Target 90%+ coverage on `src/transforms/`.

## Deep Guidance

### Unit Tests for Transforms

Transformation functions are pure functions — they take data in, return data out. This makes them trivially unit-testable:

```python
# src/transforms/payments/normalize.py
def normalize_transaction_amounts(records: list[dict]) -> list[dict]:
    """Normalize all transaction amounts to USD using embedded exchange rates."""
    result = []
    for record in records:
        normalized = {**record}
        normalized["amount_usd"] = convert_to_usd(
            record["amount"],
            record.get("currency", "USD"),
        )
        result.append(normalized)
    return result
```

```python
# tests/unit/transforms/payments/test_normalize.py
import pytest
from src.transforms.payments.normalize import normalize_transaction_amounts

class TestNormalizeTransactionAmounts:
    def test_usd_passthrough(self):
        """USD transactions are not converted."""
        records = [{"amount": 100.0, "currency": "USD"}]
        result = normalize_transaction_amounts(records)
        assert result[0]["amount_usd"] == 100.0

    def test_eur_conversion(self):
        """EUR amounts are converted to USD."""
        records = [{"amount": 100.0, "currency": "EUR"}]
        result = normalize_transaction_amounts(records)
        assert result[0]["amount_usd"] > 0
        assert result[0]["amount_usd"] != 100.0  # was converted

    def test_missing_currency_defaults_to_usd(self):
        """Records without currency field default to USD."""
        records = [{"amount": 50.0}]
        result = normalize_transaction_amounts(records)
        assert result[0]["amount_usd"] == 50.0

    def test_original_record_unchanged(self):
        """Transform does not mutate input records."""
        original = {"amount": 100.0, "currency": "EUR"}
        records = [original]
        normalize_transaction_amounts(records)
        assert original == {"amount": 100.0, "currency": "EUR"}

    def test_empty_input_returns_empty(self):
        """Empty list returns empty list."""
        assert normalize_transaction_amounts([]) == []

    def test_preserves_all_original_fields(self):
        """Additional fields on input records are preserved in output."""
        records = [{"amount": 100.0, "currency": "USD", "transaction_id": "txn_abc"}]
        result = normalize_transaction_amounts(records)
        assert result[0]["transaction_id"] == "txn_abc"

    @pytest.mark.parametrize("amount,currency,expected_range", [
        (0.0, "USD", (0.0, 0.0)),
        (1_000_000.0, "USD", (1_000_000.0, 1_000_000.0)),
        (-1.0, "USD", (-1.0, -1.0)),  # negative amounts should be preserved for refunds
    ])
    def test_boundary_amounts(self, amount, currency, expected_range):
        """Test boundary amount values."""
        records = [{"amount": amount, "currency": currency}]
        result = normalize_transaction_amounts(records)
        low, high = expected_range
        assert low <= result[0]["amount_usd"] <= high
```

**Transform test patterns**

Test these scenarios for every transform function:
1. Happy path: valid input produces expected output
2. Empty input: empty list returns empty list
3. Null/missing optional fields: handled gracefully with documented defaults
4. Null/missing required fields: raises expected exception
5. Boundary values: zero, negative, very large numbers
6. Input immutability: input records are not mutated
7. Edge cases specific to the business domain

**Fixture-based tests**

For complex transformations, use fixture files:

```python
# tests/unit/transforms/payments/test_aggregate.py
import json
from pathlib import Path
from src.transforms.payments.aggregate import compute_daily_revenue

def load_fixture(name: str) -> list[dict]:
    path = Path(__file__).parent.parent.parent / "fixtures" / name
    return json.loads(path.read_text())

def test_daily_revenue_aggregation():
    """Daily revenue correctly sums transactions by currency."""
    transactions = load_fixture("payments/raw/valid_transactions.json")
    expected = load_fixture("payments/expected/aggregated_revenue.json")

    result = compute_daily_revenue(transactions, date="2024-01-15")

    assert result["date"] == "2024-01-15"
    assert result["total_usd"] == pytest.approx(expected["total_usd"], rel=0.001)
    assert result["transaction_count"] == expected["transaction_count"]
```

### Unit Tests for Sources and Sinks

Sources and sinks interact with external systems. Test them using mocks or test doubles:

```python
# tests/unit/sources/test_stripe_reader.py
from unittest.mock import MagicMock, patch
from src.sources.stripe.charges import StripeChargesReader
from datetime import datetime, timezone

class TestStripeChargesReader:
    @patch("src.sources.stripe.charges.stripe.Charge.list")
    def test_reads_charges_for_time_window(self, mock_list):
        """Reader requests charges within the specified time window."""
        mock_list.return_value = MagicMock(
            auto_paging_iter=lambda: iter([
                {"id": "ch_001", "amount": 1000, "currency": "usd", "created": 1705329825},
            ])
        )

        reader = StripeChargesReader(api_key="sk_test_fake")
        start = datetime(2024, 1, 15, 0, 0, tzinfo=timezone.utc)
        end = datetime(2024, 1, 15, 1, 0, tzinfo=timezone.utc)

        records = list(reader.read(start, end))

        mock_list.assert_called_once_with(
            created={"gte": int(start.timestamp()), "lt": int(end.timestamp())},
            limit=100,
        )
        assert len(records) == 1
        assert records[0]["id"] == "ch_001"

    @patch("src.sources.stripe.charges.stripe.Charge.list")
    def test_handles_rate_limit_with_retry(self, mock_list):
        """Reader retries on rate limit errors."""
        mock_list.side_effect = [
            stripe.error.RateLimitError("Too many requests"),
            MagicMock(auto_paging_iter=lambda: iter([])),
        ]

        reader = StripeChargesReader(api_key="sk_test_fake", max_retries=2)
        records = list(reader.read(datetime.utcnow(), datetime.utcnow()))

        assert mock_list.call_count == 2  # retried once
```

### Integration Tests

Integration tests run the full pipeline end-to-end against real (containerized) infrastructure:

```python
# tests/integration/test_payments_pipeline.py
import pytest
import docker
from datetime import datetime
from src.pipelines.payments import PaymentsIngestionPipeline

@pytest.fixture(scope="session")
def docker_services(docker_ip, docker_services):
    """Start required Docker services for integration tests."""
    docker_services.start("kafka")
    docker_services.start("postgres")
    docker_services.wait_until_responsive(
        timeout=60.0,
        pause=0.1,
        check=lambda: is_responsive("localhost", 9092),
    )
    return docker_services

@pytest.fixture
def pipeline(docker_services):
    """Create pipeline instance connected to test containers."""
    return PaymentsIngestionPipeline(
        source_config={"host": "localhost", "port": 5432, "db": "test_db"},
        sink_config={"bucket": "test-silver", "endpoint": "http://localhost:9000"},
    )

def test_pipeline_processes_valid_transactions(pipeline, test_transactions):
    """Integration test: pipeline reads, transforms, and writes transactions."""
    # Seed source data
    seed_postgres(test_transactions)

    # Run pipeline for test window
    result = pipeline.run(
        start=datetime(2024, 1, 15, 0, 0),
        end=datetime(2024, 1, 15, 1, 0),
    )

    # Verify output
    output = read_from_minio("test-silver", "transactions/2024-01-15/00/")
    assert len(output) == len(test_transactions)
    assert all("amount_usd" in record for record in output)
    assert result.records_written == len(test_transactions)
    assert result.dlq_records == 0

def test_pipeline_routes_invalid_records_to_dlq(pipeline):
    """Integration test: invalid records go to DLQ, valid records proceed."""
    mixed_records = [
        {"transaction_id": "txn_001", "amount": 100.0, "currency": "USD", ...},
        {"transaction_id": "txn_002", "amount": "N/A", "currency": "INVALID", ...},  # bad
        {"transaction_id": "txn_003", "amount": 50.0, "currency": "EUR", ...},
    ]
    seed_postgres(mixed_records)

    result = pipeline.run(
        start=datetime(2024, 1, 15, 0, 0),
        end=datetime(2024, 1, 15, 1, 0),
    )

    assert result.records_written == 2   # valid records
    assert result.dlq_records == 1       # bad record in DLQ
```

**docker-compose test configuration**

```yaml
# docker/docker-compose.test.yml
version: "3.9"
services:
  kafka:
    image: confluentinc/cp-kafka:7.5.0
    ports: ["9092:9092"]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_LOG_RETENTION_MS: 60000  # short retention for tests
  postgres:
    image: postgres:15
    ports: ["5432:5432"]
    environment:
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test_db
  minio:
    image: minio/minio:latest
    ports: ["9000:9000"]
    command: server /data
    environment:
      MINIO_ROOT_USER: test
      MINIO_ROOT_PASSWORD: testtest
```

### Data Quality Tests

Data quality tests run inline in the pipeline and also as standalone test suite:

```python
# tests/quality/test_silver_transactions_quality.py
import pytest
import great_expectations as gx
from tests.fixtures import load_fixture

def test_silver_transaction_completeness():
    """All required fields are present and non-null."""
    df = load_fixture_as_dataframe("payments/silver/valid_transactions.parquet")
    suite = load_expectation_suite("silver_transactions")
    validator = gx.Validator(batch=df, expectation_suite=suite)

    results = validator.validate()
    failed = [r for r in results.results if not r.success]

    assert not failed, f"Quality checks failed:\n" + "\n".join(str(f) for f in failed)

def test_no_duplicate_transaction_ids():
    """Transaction IDs are unique in silver layer."""
    df = load_fixture_as_dataframe("payments/silver/valid_transactions.parquet")
    duplicate_count = df["transaction_id"].duplicated().sum()
    assert duplicate_count == 0, f"Found {duplicate_count} duplicate transaction IDs"

def test_amount_within_bounds():
    """All amounts are non-negative and below maximum threshold."""
    df = load_fixture_as_dataframe("payments/silver/valid_transactions.parquet")
    assert (df["amount"] >= 0).all(), "Negative amounts found"
    assert (df["amount"] <= 1_000_000).all(), "Amounts exceeding maximum found"
```

### Performance Tests

Performance tests catch throughput regressions before they reach production:

```python
# tests/performance/test_transform_performance.py
import time
import pytest
from src.transforms.payments.normalize import normalize_transaction_amounts
from tests.fixtures import generate_transactions

@pytest.mark.performance
class TestNormalizePerformance:
    RECORDS = 100_000
    MAX_SECONDS = 10.0  # must normalize 100K records in under 10 seconds

    def test_throughput(self):
        """normalize_transaction_amounts processes 100K records in under 10 seconds."""
        records = generate_transactions(self.RECORDS)

        start = time.perf_counter()
        result = normalize_transaction_amounts(records)
        elapsed = time.perf_counter() - start

        assert len(result) == self.RECORDS
        assert elapsed < self.MAX_SECONDS, (
            f"Performance regression: normalized {self.RECORDS} records in {elapsed:.2f}s "
            f"(max: {self.MAX_SECONDS}s)"
        )

    def test_memory_usage(self):
        """Transform does not exceed 500MB memory for 100K records."""
        import tracemalloc
        tracemalloc.start()

        records = generate_transactions(self.RECORDS)
        normalize_transaction_amounts(records)

        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        peak_mb = peak / 1024 / 1024
        assert peak_mb < 500, f"Memory usage {peak_mb:.1f}MB exceeds 500MB limit"
```

**Performance test benchmarks**

Run benchmarks with pytest-benchmark to track performance over time:

```python
def test_normalize_benchmark(benchmark):
    """Benchmark normalization transform for regression tracking."""
    records = generate_transactions(10_000)
    result = benchmark(normalize_transaction_amounts, records)
    assert len(result) == 10_000
```

### Test Coverage and CI Configuration

```ini
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
markers = [
    "unit: fast unit tests",
    "integration: requires Docker services",
    "performance: long-running performance tests",
    "quality: data quality assertion tests",
]
addopts = "--strict-markers"

[tool.coverage.run]
source = ["src"]
branch = true
omit = ["src/dags/*"]  # DAG files excluded; coverage focused on transforms

[tool.coverage.report]
fail_under = 90
show_missing = true
```

```yaml
# .github/workflows/test.yml excerpt
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - run: pytest tests/unit -v --cov=src/transforms --cov-fail-under=90

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - run: docker compose -f docker/docker-compose.test.yml up -d
      - run: pytest tests/integration -v -m integration
      - run: docker compose -f docker/docker-compose.test.yml down
```

### Test Data Management Rules

1. Never use production data in tests — generate synthetic data or use anonymized fixtures
2. Test fixtures must be deterministic — no random seeds without explicit seeding
3. Integration test databases must be isolated per test run — use unique schema or database names
4. Performance tests must run on the same hardware class as CI to produce comparable benchmarks
5. DLQ assertions are mandatory: every integration test must assert the expected DLQ record count, not just the success path
