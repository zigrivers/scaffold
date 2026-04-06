---
name: data-pipeline-schema-management
description: Schema registry, evolution patterns, breaking change detection, and contract testing for data pipeline schemas
topics: [data-pipeline, schema-management, schema-registry, schema-evolution, breaking-changes, contract-testing, avro, protobuf]
---

Schema management is the discipline of controlling how the structure of data changes over time while maintaining compatibility between producers and consumers. Without schema governance, a single field rename in a source system cascades into dozens of broken downstream pipelines, dashboards, and ML models. Schema registry, evolution compatibility rules, breaking change detection, and consumer contract tests are the four pillars that make schema changes safe.

## Summary

Register all schemas in a centralized schema registry (Confluent Schema Registry, AWS Glue Schema Registry, or equivalent). Enforce backward compatibility as the minimum standard — new schema versions must be readable by old consumers. Classify schema changes as breaking or non-breaking before deployment. Run consumer contract tests in CI to catch breaking changes before they reach production. Use schema versioning (`_v2`) for irreversible breaking changes.

## Deep Guidance

### Schema Registry

A schema registry is a centralized service that stores schema versions and enforces compatibility rules at produce and consume time:

**Confluent Schema Registry setup**

```python
from confluent_kafka.schema_registry import SchemaRegistryClient
from confluent_kafka.schema_registry.avro import AvroSerializer, AvroDeserializer

schema_registry_client = SchemaRegistryClient({"url": "http://localhost:8081"})

# Define Avro schema
TRANSACTION_SCHEMA_STR = """
{
  "type": "record",
  "name": "Transaction",
  "namespace": "com.example.payments",
  "fields": [
    {"name": "transaction_id", "type": "string"},
    {"name": "amount", "type": "double"},
    {"name": "currency", "type": "string"},
    {"name": "user_id", "type": "string"},
    {"name": "created_at", "type": "long", "logicalType": "timestamp-millis"}
  ]
}
"""

# Register schema (idempotent — same schema = same ID returned)
schema = schema_registry_client.register_schema(
    subject_name="payments_transaction_created-value",
    schema=Schema(TRANSACTION_SCHEMA_STR, schema_type="AVRO"),
)

# Serialize with schema ID embedded in message
avro_serializer = AvroSerializer(
    schema_registry_client=schema_registry_client,
    schema_str=TRANSACTION_SCHEMA_STR,
)
```

**Schema subjects**

Schema Registry organizes schemas by subject. The standard naming convention for Kafka topics:
- Value schema: `{topic-name}-value` (e.g., `payments_transaction_created-value`)
- Key schema: `{topic-name}-key` (e.g., `payments_transaction_created-key`)

For non-Kafka schemas (database tables, API contracts): use `{domain}.{entity}.{version}` as the subject name.

### Compatibility Modes

Schema Registry enforces compatibility between schema versions. Choose the strictest compatibility mode that your deployment workflow supports:

**BACKWARD (recommended default)**
- New schema can read data written by old schema
- Consumers can be upgraded before producers
- Allowed changes: add optional fields (with defaults), remove fields

```json
// v1 schema
{"fields": [{"name": "id"}, {"name": "amount"}]}

// v2 schema (BACKWARD compatible: added optional field with default)
{"fields": [{"name": "id"}, {"name": "amount"}, {"name": "currency", "default": "USD"}]}
```

**FORWARD**
- Old schema can read data written by new schema
- Producers can be upgraded before consumers
- Allowed changes: remove optional fields, add fields without defaults

**FULL**
- Both backward and forward compatible
- Most restrictive: only add optional fields with defaults, or remove optional fields
- Recommended when upgrade order cannot be guaranteed

**NONE**
- No compatibility enforcement
- Any change is allowed
- Only appropriate for development environments

**Setting compatibility per subject**

```python
schema_registry_client.set_compatibility(
    subject_name="payments_transaction_created-value",
    level="BACKWARD",
)
```

### Evolution Patterns

**Adding a field (backward compatible)**

Always provide a default value for new fields in Avro schemas. This allows old consumers (who don't know about the new field) to successfully deserialize new messages:

```json
// Safe: new field with default
{"name": "merchant_category", "type": ["null", "string"], "default": null}
```

Do NOT add a required field without a default — this breaks BACKWARD compatibility.

**Removing a field**

Removing a field is backward compatible only if consumers that use that field are updated first. Coordinate the removal:
1. Deprecate the field: add a comment/annotation that it will be removed in 30 days
2. Update all consumers to stop reading the field
3. Verify no consumers reference the field (run contract tests)
4. Remove the field from the schema

**Renaming a field (breaking change)**

Renaming is always a breaking change. The canonical approach:
1. Add the new field name alongside the old field (dual-write period)
2. Update all consumers to read from the new field
3. Verify all consumers migrated
4. Remove the old field

For Avro, use `aliases` to support rename during transition:
```json
{"name": "merchant_id", "aliases": ["vendor_id"], "type": "string"}
```

**Changing a field type (breaking change)**

Type changes are breaking. Example: changing `amount` from `int` to `double`.

Options:
- Create a new versioned schema subject (`payments_transaction_created_v2-value`)
- Use a union type during transition: `{"type": ["int", "double"]}`
- Use a new field with the new type alongside the old field

### Breaking Change Detection

Detect breaking changes before they reach production using automated tooling:

**Schema compatibility check in CI**

```bash
#!/bin/bash
# scripts/check-schema-compatibility.sh

for schema_file in schemas/**/*.avsc; do
    subject=$(basename "$schema_file" .avsc)
    echo "==> Checking compatibility for $subject"

    # Test compatibility against all registered versions
    result=$(curl -s -X POST \
        "http://schema-registry:8081/compatibility/subjects/${subject}-value/versions/latest" \
        -H "Content-Type: application/vnd.schemaregistry.v1+json" \
        -d "{\"schema\": $(cat "$schema_file")}")

    if [[ "$(echo "$result" | jq -r '.is_compatible')" != "true" ]]; then
        echo "ERROR: Breaking change detected in $subject"
        echo "$result" | jq .
        exit 1
    fi
done
echo "All schemas are compatible"
```

**Buf for Protobuf schemas**

For Protobuf-based pipelines, use Buf to detect breaking changes:

```bash
# buf.yaml
version: v1
breaking:
  use:
    - FILE    # detect file-level breaking changes

# In CI:
buf breaking --against ".git#branch=main"
```

**JSONSchema diff tools**

```python
from json_schema_diff import diff_schemas

def check_json_schema_breaking_changes(old_schema: dict, new_schema: dict) -> list[str]:
    """Return list of breaking changes between schema versions."""
    differences = diff_schemas(old_schema, new_schema)
    breaking = [d for d in differences if d.is_breaking]
    return [str(d) for d in breaking]
```

### Contract Testing

Consumer contract tests verify that a schema change does not break any known consumer. They run in CI for every schema change.

**Consumer-driven contract testing with Pact**

```python
# Consumer (silver processor): define the contract
from pact import Consumer, Provider

pact = Consumer("silver-processor").has_pact_with(Provider("bronze-events"))

def test_can_consume_transaction_event():
    """Consumer contract: silver processor can consume bronze transaction events."""
    expected_event = {
        "transaction_id": "txn_abc123",
        "amount": 99.99,
        "currency": "USD",
        "user_id": "usr_001234",
        "created_at": 1705329825000,
    }

    (pact
        .given("a valid transaction event exists")
        .upon_receiving("a request for transaction events")
        .with_request("GET", "/events/transaction")
        .will_respond_with(200, body=expected_event))

    with pact:
        result = silver_processor.consume_event(get_test_event())
        assert result["transaction_id"] == "txn_abc123"
```

**Schema-based contract tests without Pact**

For Kafka-based pipelines, consumer contracts can be expressed as schema validation:

```python
# tests/contracts/test_transaction_consumer_contract.py

CONSUMER_REQUIRED_FIELDS = {
    "silver_processor": ["transaction_id", "amount", "currency", "user_id", "created_at"],
    "fraud_detector": ["transaction_id", "amount", "user_id", "merchant_id"],
    "revenue_aggregator": ["transaction_id", "amount", "currency", "created_at"],
}

def test_schema_satisfies_all_consumer_contracts():
    """Verify that the current schema provides all fields required by registered consumers."""
    with open("schemas/payments_transaction_created.avsc") as f:
        schema = json.load(f)
    schema_fields = {f["name"] for f in schema["fields"]}

    for consumer, required_fields in CONSUMER_REQUIRED_FIELDS.items():
        missing = set(required_fields) - schema_fields
        assert not missing, (
            f"Schema breaking change: consumer '{consumer}' requires fields {missing} "
            f"which are not in the current schema"
        )
```

### Table Schema Management in the Warehouse

For SQL-based warehouses (BigQuery, Snowflake, Redshift), manage table schemas with migration files:

```
schemas/
├── migrations/
│   ├── 001_create_silver_transactions.sql
│   ├── 002_add_merchant_category.sql
│   └── 003_add_processing_fee.sql
└── current/
    └── silver_transactions.sql  # current expected schema
```

**Migration file pattern**

```sql
-- schemas/migrations/002_add_merchant_category.sql
-- Migration: add merchant_category field to silver_transactions
-- Author: data-team
-- Date: 2024-01-15
-- Breaking: No (new nullable column with default)
-- Consumer impact: None (additive change)

ALTER TABLE silver_transactions
ADD COLUMN IF NOT EXISTS merchant_category STRING OPTIONS(description="MCC category code");

-- Backfill for existing records (run separately after migration)
-- UPDATE silver_transactions SET merchant_category = 'UNKNOWN' WHERE merchant_category IS NULL;
```

Automate migration application in CI/CD and verify the current schema matches expectations after each migration.
