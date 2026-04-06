---
name: data-pipeline-requirements
description: SLA requirements (latency, throughput, freshness), data quality budgets, and regulatory compliance (PII, GDPR) for data pipelines
topics: [data-pipeline, requirements, sla, latency, throughput, freshness, data-quality, pii, gdpr, compliance]
---

Data pipeline requirements must be defined in measurable terms before any architecture decision is made. Vague requirements like "fast" or "reliable" translate into untestable systems. Every pipeline needs explicit SLAs for latency, throughput, and data freshness — and a defined budget for data quality violations and regulatory compliance obligations.

## Summary

Define pipeline SLAs in concrete numbers: end-to-end latency targets (e.g., p99 < 5 minutes), throughput capacity (e.g., 500K events/sec peak), and data freshness windows (e.g., reports no older than 1 hour). Set explicit data quality budgets — allowable error rates, null tolerances, and schema drift thresholds. Identify all PII fields and their regulatory classification (GDPR, CCPA, HIPAA) before building any pipeline that touches them.

## Deep Guidance

### Latency SLA Definition

Latency in data pipelines is measured end-to-end: from event occurrence to data availability in the serving layer. Define latency at percentiles, not averages:

- **p50 (median)**: Typical processing time under normal load
- **p95**: The target most operations should hit
- **p99**: The tail latency SLA — what is acceptable for 1-in-100 operations
- **p999**: What happens in worst-case bursts

Example SLA table:

| Pipeline Type | p50 Target | p99 Target | Max Acceptable Lag |
|---------------|------------|------------|-------------------|
| Fraud detection | < 500ms | < 2s | 10s |
| Operational reporting | < 5min | < 15min | 1hr |
| Analytics warehouse | < 1hr | < 4hr | 24hr |
| Compliance audit logs | < 15min | < 1hr | 4hr |

Latency SLAs drive architecture selection. A p99 < 1 second requirement rules out batch processing and mandates streaming. A p99 < 1 hour permits micro-batch or even hourly cron jobs. Match the architecture to the SLA before writing any code.

### Throughput and Capacity Planning

Throughput requirements must account for peak load, not average load. Data pipelines routinely experience 10x to 100x spikes at business events (end of month, flash sales, marketing campaigns):

- **Steady-state throughput**: Average events or records per second under normal operation
- **Peak throughput**: Maximum burst the system must handle without degradation
- **Sustained peak duration**: How long the peak must be sustained before scaling kicks in
- **Data volume growth rate**: Year-over-year growth trajectory for capacity planning

Document throughput in multiple units because different layers care about different metrics:
- Ingestion layer: events/second, bytes/second
- Processing layer: records/second, transformations/second
- Storage layer: GB/day ingested, TB total, compression ratio expected

Capacity plan to handle 3x current peak to avoid emergency scaling. If current peak is 100K events/sec, design for 300K.

### Data Freshness Requirements

Data freshness (or staleness tolerance) defines how old data can be before it loses business value. Freshness requirements vary dramatically by use case:

- **Real-time operational decisions** (fraud, recommendations): seconds to minutes of acceptable staleness
- **Operational dashboards** (business KPIs, support queues): minutes to one hour
- **Analytical reporting** (daily/weekly reports): hours to 24 hours
- **Historical analysis and ML training**: days are acceptable

Freshness SLAs drive pipeline scheduling and trigger mechanisms. A freshness requirement of 5 minutes means the pipeline must complete within 5 minutes of new data arriving — which rules out hourly batch jobs. Document the business justification for each freshness requirement; tighter SLAs cost more to build and operate.

### Data Quality Budgets

Every pipeline has a data quality budget — the maximum allowable error rate before downstream systems or business decisions are materially impacted. Define explicit thresholds:

**Completeness budget**: Maximum acceptable null rate or missing record rate per field
- Critical fields (revenue, user ID): 0% nulls tolerated
- Enrichment fields (device type, referrer): up to 5% nulls acceptable
- Optional metadata fields: up to 20% nulls acceptable before alerting

**Accuracy budget**: Maximum acceptable rate of values outside valid ranges or formats
- Financial amounts: 0% out-of-range values
- Timestamps: < 0.1% future-dated or epoch-zero values
- Categorical fields: < 1% unrecognized enum values

**Timeliness budget**: Maximum acceptable late-arrival rate for event-driven pipelines
- Streaming pipelines: define maximum allowable event delay before treating as late
- Batch pipelines: define maximum acceptable row count variance versus expected volume

**Consistency budget**: Maximum acceptable divergence between pipeline outputs and source of truth
- Define reconciliation checkpoints and acceptable variance thresholds
- Example: daily record count must match source system within 0.01%

Document quality budgets as tested assertions, not prose. Every quality threshold should have a corresponding data quality test (Great Expectations check, dbt test, or equivalent) that fails the pipeline when the threshold is breached.

### Regulatory Compliance Requirements

Identify every regulatory framework that applies before writing the first line of pipeline code. Retrofitting compliance is expensive and error-prone.

**PII (Personally Identifiable Information) inventory**

Catalog every field that constitutes PII under applicable regulations:
- Direct identifiers: name, email, phone, SSN, passport number, IP address
- Quasi-identifiers: ZIP code, birthdate, job title (can identify individuals in combination)
- Sensitive categories (GDPR Article 9): health data, biometric data, racial/ethnic origin, political opinions

For each PII field, document:
- Which regulation governs it (GDPR, CCPA, HIPAA, FERPA, etc.)
- Retention limit (e.g., GDPR: must be deletable on erasure request)
- Processing lawful basis (consent, legitimate interest, contractual necessity)
- Cross-border transfer restrictions (GDPR: EU data cannot flow to non-adequate countries without SCCs)

**GDPR-specific pipeline requirements**
- Right to erasure: pipeline must support deletion of a user's data from all downstream stores, including derived tables and ML features
- Data minimization: collect only what is necessary; don't pipeline fields not needed for the stated purpose
- Purpose limitation: data collected for one purpose cannot be reused for an incompatible purpose in a new pipeline
- Records of processing activities: maintain documented inventory of all pipelines that process personal data

**Data residency requirements**
- Some regulations require data to stay within geographic boundaries (EU data in EU, Australian data in Australia)
- Pipeline infrastructure (Kafka brokers, object storage, processing clusters) must be provisioned in compliant regions
- Cross-region replication must be explicitly reviewed against residency rules

**Retention and deletion**
- Define retention periods for every data store the pipeline writes to
- Implement automated purge jobs tied to retention schedules
- Test deletion propagation: deleting from source must eventually delete from all derived stores
- Maintain deletion audit log: timestamp, scope, and confirmation of deletion completion

### Documenting Requirements as Testable Contracts

All requirements must be expressed as testable conditions, not aspirational statements:

```yaml
# requirements.yaml — machine-readable SLA contract
pipeline: user_events
sla:
  latency_p99_seconds: 300
  throughput_peak_events_per_second: 50000
  freshness_max_lag_minutes: 10
quality:
  completeness:
    user_id: 0.0       # 0% nulls
    event_type: 0.0
    timestamp: 0.0
    country_code: 0.05 # 5% nulls acceptable
  accuracy:
    timestamp_future_rate: 0.001
compliance:
  pii_fields: [user_id, email, ip_address]
  retention_days: 365
  gdpr_erasure_supported: true
```

Requirements documented this way feed directly into monitoring dashboards, alerting rules, and data quality test suites. When a requirement changes, the contract file changes — and all downstream tests automatically re-evaluate against the new threshold.
