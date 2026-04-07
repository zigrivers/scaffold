---
name: data-pipeline-security
description: PII handling, encryption at rest and in transit, access control, and audit logging for data pipelines
topics: [data-pipeline, security, pii, encryption, access-control, audit-logging, gdpr, data-masking]
---

Data pipelines are high-value targets for security incidents because they aggregate sensitive data from multiple systems and often run with broad service account permissions. A pipeline that ingests payment data, user PII, and health records and writes to a central warehouse becomes a single point of compromise. Security must be designed into the pipeline from the start — encryption, least-privilege access, PII handling, and audit logging cannot be retrofitted economically.

## Summary

Encrypt all data at rest and in transit using current standards (TLS 1.2+, AES-256). Apply least-privilege access: each pipeline service account reads only the sources it needs and writes only to its designated destinations. Detect and classify all PII fields at ingestion; mask, tokenize, or drop PII before it reaches analytical layers. Log all data access and transformation events to an immutable audit trail. Test security controls in CI.

## Deep Guidance

### Encryption at Rest

Every data store the pipeline writes to must encrypt data at rest:

**Object storage (S3, GCS, Azure Blob)**

```python
# S3: server-side encryption with AWS KMS
s3_client = boto3.client("s3")
s3_client.put_object(
    Bucket="raw-data",
    Key="payments/2024-01-15/transactions.parquet",
    Body=parquet_bytes,
    ServerSideEncryption="aws:kms",
    SSEKMSKeyId="arn:aws:kms:us-east-1:123456789:key/mrk-abc123",
)
```

Use customer-managed KMS keys (CMKs), not AWS-managed keys, for data subject to regulatory requirements. CMKs allow key rotation control and key deletion for data erasure compliance (GDPR right to erasure via key deletion).

**Database encryption**

Configure encryption at rest for all databases the pipeline reads from or writes to:
- PostgreSQL: `pg_tde` extension or filesystem-level encryption (LUKS, dm-crypt)
- BigQuery: CMEK (customer-managed encryption keys) via `--kms_key` parameter
- Snowflake: Tri-Secret Secure (Snowflake + customer key + Snowflake-managed key)
- Kafka: enable log encryption using KMS-backed encryption keys

**Parquet/Avro field-level encryption**

For sensitive fields, apply field-level encryption in addition to file-level encryption. This allows analytic queries on encrypted files while keeping specific columns (PII) unreadable without the column-level key:

```python
from pyarrow.parquet import ParquetFile
from pyarrow import compute as pc

# Write with field-level encryption using Apache Parquet encryption
encryption_config = pq.EncryptionConfiguration(
    footer_key="footer_key_id",
    column_keys={
        "user_pii_key": ["email", "phone", "ssn_hash"],
        "default_key": None,  # all other columns use footer key
    },
)
pq.write_table(table, "output.parquet", encryption_properties=encryption_config)
```

### Encryption in Transit

All data in transit must use TLS 1.2 or higher. Disable older protocols and weak cipher suites:

**Kafka TLS configuration**

```properties
# Kafka broker: enforce TLS
listeners=SSL://:9093
ssl.keystore.location=/ssl/kafka.server.keystore.jks
ssl.keystore.password=${KEYSTORE_PASSWORD}
ssl.truststore.location=/ssl/kafka.server.truststore.jks
ssl.truststore.password=${TRUSTSTORE_PASSWORD}
ssl.client.auth=required
ssl.enabled.protocols=TLSv1.2,TLSv1.3
ssl.cipher.suites=TLS_AES_256_GCM_SHA384,TLS_CHACHA20_POLY1305_SHA256

# Producer/consumer: mutual TLS
security.protocol=SSL
ssl.keystore.location=/ssl/client.keystore.jks
ssl.keystore.password=${CLIENT_KEYSTORE_PASSWORD}
```

**API and database connections**

```python
# PostgreSQL: require SSL
conn = psycopg2.connect(
    host="db.example.com",
    dbname="source_db",
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    sslmode="verify-full",           # reject if cert invalid
    sslrootcert="/certs/ca.pem",
)

# HTTP clients: verify certificates, no plain HTTP
import httpx
client = httpx.Client(verify=True)  # default; never set verify=False in production
```

### Least-Privilege Access Control

Each pipeline component should have the minimum permissions necessary to perform its function. Service accounts should never have admin-level permissions.

**AWS IAM policy for pipeline service account**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::raw-data",
        "arn:aws:s3:::raw-data/payments/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::silver-data/transactions/*"
    },
    {
      "Effect": "Deny",
      "Action": ["s3:DeleteObject", "s3:DeleteBucket"],
      "Resource": "*"
    }
  ]
}
```

**BigQuery column-level access control**

```python
# Grant access to non-PII columns only for analytics users
from google.cloud import bigquery

client = bigquery.Client()
table_ref = client.get_table("project.silver.transactions")

# Column-level security policy: analytics role cannot read PII columns
table_ref.schema = [
    bigquery.SchemaField("transaction_id", "STRING"),
    bigquery.SchemaField("amount", "FLOAT64"),
    bigquery.SchemaField("currency", "STRING"),
    bigquery.SchemaField("email", "STRING",
        policy_tags=bigquery.PolicyTagList(["projects/project/locations/us/taxonomies/123/policyTags/456"])),
]
```

**Secret management**

Never store credentials in pipeline code, DAG files, config files, or environment variables on shared machines:

```python
# Bad: hardcoded in code
DB_PASSWORD = "s3cr3t"

# Bad: plaintext in config file
# config/prod.yaml: db_password: s3cr3t

# Good: fetch from secrets manager at runtime
import boto3

def get_secret(secret_name: str) -> str:
    client = boto3.client("secretsmanager", region_name="us-east-1")
    response = client.get_secret_value(SecretId=secret_name)
    return response["SecretString"]

DB_PASSWORD = get_secret("prod/pipeline/db-password")
```

Use short-lived credentials where possible (IAM roles with STS, Workload Identity for GKE) rather than long-lived API keys or passwords.

### PII Handling

**PII detection at ingestion**

Scan incoming records for PII patterns before writing to bronze:

```python
import re
from dataclasses import dataclass

PII_PATTERNS = {
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\b"),
    "phone": re.compile(r"\b\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b"),
}

def detect_pii(record: dict) -> dict[str, list[str]]:
    """Return mapping of PII type to field names containing that PII."""
    findings = {}
    for field_name, value in record.items():
        if not isinstance(value, str):
            continue
        for pii_type, pattern in PII_PATTERNS.items():
            if pattern.search(value):
                findings.setdefault(pii_type, []).append(field_name)
    return findings
```

**PII masking strategies**

Choose the masking strategy based on the downstream use case:

| Strategy | Description | When to use |
|----------|-------------|-------------|
| Tokenization | Replace PII with consistent token (HMAC, UUID) | Join keys across datasets; token is stable |
| Hashing | One-way hash (SHA-256 + pepper) | Deduplication; cannot reverse |
| Masking | Replace with masked value (`****@example.com`) | Display in dashboards |
| Pseudonymization | Replace with synthetic but realistic value | ML training data |
| Suppression | Remove field entirely | When field has no analytical value |

```python
import hashlib
import hmac

PII_PEPPER = os.environ["PII_PEPPER"]  # secret pepper stored in secrets manager

def tokenize_pii(value: str) -> str:
    """Generate a consistent, irreversible token for a PII value."""
    return hmac.new(
        PII_PEPPER.encode(),
        value.lower().strip().encode(),
        hashlib.sha256,
    ).hexdigest()

def mask_email(email: str) -> str:
    """Mask email address: j***@example.com"""
    local, domain = email.split("@", 1)
    return f"{local[0]}***@{domain}"
```

**PII in logs**

Ensure PII never appears in pipeline logs. Implement a log sanitizer:

```python
import logging

SENSITIVE_PATTERNS = [
    (re.compile(r'email=["\']?[\w.@+]+', re.I), 'email=***'),
    (re.compile(r'password=["\']?[\S]+', re.I), 'password=***'),
    (re.compile(r'\b\d{3}-\d{2}-\d{4}\b'), '***-**-****'),
]

class PIIRedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = str(record.getMessage())
        for pattern, replacement in SENSITIVE_PATTERNS:
            message = pattern.sub(replacement, message)
        record.msg = message
        record.args = ()
        return True
```

### Audit Logging

Audit logs record who accessed what data, when, and what they did with it. They are required for GDPR, SOC 2, and HIPAA compliance.

**Audit event structure**

```python
from dataclasses import dataclass
from datetime import datetime

@dataclass
class AuditEvent:
    timestamp: datetime
    pipeline_id: str
    pipeline_version: str
    service_account: str
    action: str              # "read", "write", "delete", "transform"
    resource: str            # table name, topic, file path
    record_count: int
    pii_fields_accessed: list[str]
    execution_id: str        # correlation ID for tracing
    environment: str

def emit_audit_event(event: AuditEvent) -> None:
    """Write audit event to immutable audit log (append-only, no delete permission)."""
    audit_client.log(
        log_name="data-pipeline-audit",
        payload=dataclasses.asdict(event),
        severity="INFO",
    )
```

**Immutable audit log requirements**:
- Stored in a separate, append-only log store from pipeline data
- Service accounts that write to audit logs cannot delete from them
- Retain audit logs for minimum 7 years (or regulatory requirement)
- Export to SIEM system for anomaly detection

**GDPR erasure audit trail**

When processing a right-to-erasure request, emit a deletion audit event for every store purged:

```python
def process_erasure_request(user_id: str, request_id: str) -> ErasureResult:
    """Process GDPR right-to-erasure request."""
    stores_purged = []
    for store in REGISTERED_PII_STORES:
        count = store.delete_user_records(user_id)
        if count > 0:
            emit_audit_event(AuditEvent(
                action="delete",
                resource=store.name,
                record_count=count,
                pii_fields_accessed=store.pii_fields,
                execution_id=request_id,
            ))
            stores_purged.append(store.name)

    return ErasureResult(
        user_id=user_id,
        request_id=request_id,
        stores_purged=stores_purged,
        completed_at=datetime.utcnow(),
    )
```
