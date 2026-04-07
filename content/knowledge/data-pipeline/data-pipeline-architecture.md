---
name: data-pipeline-architecture
description: Lambda vs Kappa architecture tradeoffs, medallion architecture (bronze/silver/gold), and CDC patterns for data pipelines
topics: [data-pipeline, architecture, lambda, kappa, medallion, bronze-silver-gold, cdc, change-data-capture]
---

Data pipeline architecture is the set of structural decisions that determine how data flows from sources to consumers, how it is stored at each stage, and how historical data is reprocessed when logic changes. The wrong architecture creates systems that are either operationally complex (Lambda), too rigid for historical reprocessing (pure streaming), or without clear data quality boundaries (no medallion layers). These decisions are expensive to reverse and must be made explicitly.

## Summary

Lambda architecture separates batch and streaming paths into two systems with a serving layer that merges them — powerful but operationally expensive. Kappa architecture uses a single streaming system with replayable logs for both real-time and historical processing. The medallion architecture (bronze/silver/gold) provides clear data quality tiers regardless of which processing model is used. CDC (Change Data Capture) is the standard mechanism for streaming relational database changes into pipelines.

## Deep Guidance

### Lambda Architecture

Lambda architecture processes data through two parallel paths that converge at query time:

**Batch layer (high latency, high accuracy)**
- Reprocesses the complete historical dataset on a schedule (daily, hourly)
- Produces accurate, complete views by operating on all data
- Tolerates high latency — results available hours after data arrives
- Implemented with Spark, Hadoop MapReduce, BigQuery batch jobs

**Speed layer (low latency, approximate)**
- Processes only recent data in real-time as events arrive
- Produces approximate views with low latency (seconds to minutes)
- Covers only the gap since the last batch run
- Implemented with Kafka Streams, Flink, Spark Streaming

**Serving layer**
- Merges batch and speed layer outputs at query time
- Returns the batch view for historical ranges; supplements with speed layer for recency
- Implemented with systems like Cassandra, HBase, or a query engine that unions both stores

**Lambda tradeoffs**
- Benefits: Accurate historical data (batch), low-latency recent data (speed), well-understood pattern
- Costs: Two codebases implementing the same business logic (divergence risk), complex serving layer merging logic, double infrastructure cost, testing complexity
- Use when: Latency requirements genuinely differ for historical vs. recent data, e.g., a dashboard that shows real-time last-hour data but accurate historical monthly reports

The most common Lambda failure mode is the batch and speed layers producing different results for the same time window due to logic divergence. This requires continuous reconciliation effort.

### Kappa Architecture

Kappa architecture replaces the Lambda dual-path with a single streaming system:

**Core premise**: Everything is a stream. Historical reprocessing is just replaying old events through the same streaming pipeline.

**Requirements for Kappa**:
- Event log is durable and replayable (Kafka with long retention, or event store)
- Events are immutable and ordered within a partition
- Processing logic is stateless or uses externally managed state (RocksDB, Redis)

**Kappa pipeline flow**:
1. All events land in the replayable log (Kafka, Kinesis, Pulsar)
2. Streaming jobs process events in real-time
3. When logic changes, deploy new job version and replay from the beginning of the log
4. New job catches up to current time; old job is decommissioned
5. Serving layer reads from the streaming job's output store

**Kappa tradeoffs**
- Benefits: Single codebase for all processing, no logic divergence, simpler architecture, streaming-native
- Costs: Reprocessing large historical datasets takes time and cluster resources, log retention costs scale with history depth, complex state management for aggregations over long windows
- Use when: Business logic is unified (same calculation for historical and real-time), event log is durable, acceptable reprocessing latency for backfills

**Choosing Lambda vs. Kappa**

| Factor | Prefer Lambda | Prefer Kappa |
|--------|---------------|--------------|
| Logic divergence risk | High (two systems) | Low (one system) |
| Infrastructure cost | High | Lower |
| Real-time latency | Sub-second achievable | Sub-second achievable |
| Historical reprocessing | Fast (dedicated batch) | Slower (streaming catchup) |
| Team capability | Strong batch + streaming | Streaming-focused team |
| Use today | Rarely — mostly legacy | Default choice for new pipelines |

### Medallion Architecture

The medallion architecture (also called multi-hop) organizes data into three quality tiers regardless of whether Lambda or Kappa is used:

**Bronze layer — Raw ingestion**
- Stores data exactly as received from source systems, with no transformations
- Append-only; records are never modified or deleted (except for compliance purges)
- Schema-on-read: no schema enforcement at write time
- Retains original field names, formats, and any encoding quirks from the source
- Adds pipeline metadata: `_ingested_at`, `_source_system`, `_pipeline_version`, `_raw_id`
- Retention: indefinite (or compliance minimum) — this is the recovery point for all downstream layers

Bronze is the safety net. When a transformation bug is discovered, bronze data allows rebuilding silver and gold from scratch without re-ingesting from source.

**Silver layer — Cleaned and conformed**
- Applies schema enforcement, type casting, and null handling from bronze
- Deduplicates records using business keys
- Normalizes field names to the canonical data model (snake_case, consistent naming)
- Resolves encoding issues, trims whitespace, standardizes date formats
- Joins with slowly-changing dimension tables (currency conversion rates, country codes)
- Enforces data quality rules; routes failing records to DLQ
- Schema-on-write: strict Avro/Parquet schema applied at write time
- Retention: 1–3 years (or per regulatory requirement)

Silver is the trusted, clean, integrated dataset. Most analytical consumers should read from silver, not bronze.

**Gold layer — Aggregated and business-ready**
- Pre-aggregated views optimized for specific business questions
- Applies business logic: revenue rollups, user segmentation, cohort calculations
- Denormalized for query performance (no joins required by consumers)
- Named for the business concept, not the data source: `daily_revenue`, `user_ltv`, `product_performance`
- Retention: dependent on business reporting requirements (often indefinitely for monthly/yearly aggregates)

Gold is what business users, dashboards, and ML features consume. Schema changes in gold require migration planning and consumer coordination.

**Medallion implementation rules**
- Bronze → Silver is an automated pipeline; never manually edit bronze data
- Silver → Gold is also automated; never manually edit silver data
- Data flows only forward (bronze → silver → gold), never backward
- Consumer systems should read from the highest-quality layer that satisfies their latency requirements
- Schema changes in bronze require no consumer coordination; changes in silver/gold do

### CDC (Change Data Capture) Patterns

CDC streams database changes (INSERT, UPDATE, DELETE) as events into the pipeline without polling or application-layer hooks.

**Why CDC**
- Zero-impact on source database performance (reads WAL, not production tables)
- Sub-second latency from database commit to pipeline event
- Captures all changes including bulk updates and direct SQL modifications
- Works for initial data load and ongoing changes through the same mechanism

**CDC implementation options**

*Log-based CDC (recommended)*: Reads the database Write-Ahead Log (WAL) directly
- PostgreSQL: logical replication using `pgoutput` plugin (Debezium connector)
- MySQL: reads binary log (binlog) using Debezium MySQL connector
- SQL Server: uses Change Data Capture feature built into SQL Server

*Query-based CDC (polling)*: Queries for rows modified after a watermark timestamp
- Simpler to implement but misses DELETEs, requires `updated_at` column, higher DB load
- Acceptable for low-volume tables where log-based CDC is not available

*Triggers*: Database triggers write changes to a staging table
- High database overhead, blocking risk, not recommended for high-volume tables

**Debezium CDC event structure**

Debezium transforms each database change into a structured event:

```json
{
  "before": { "id": 123, "status": "pending", "amount": 100.00 },
  "after":  { "id": 123, "status": "completed", "amount": 100.00 },
  "op": "u",
  "ts_ms": 1705329825000,
  "source": {
    "db": "payments",
    "table": "transactions",
    "lsn": 1847392
  }
}
```

`op` values: `c` (create/insert), `u` (update), `d` (delete), `r` (read, initial snapshot)

**CDC pipeline topology**

```
Source DB → Debezium → Kafka (per-table topics) → Stream Processor → Bronze → Silver
```

Each source table gets its own Kafka topic: `{db}.{schema}.{table}`. This allows consumers to subscribe to specific tables independently.

**CDC operational considerations**
- Schema changes in the source database must be handled gracefully (Avro schema evolution, schema registry)
- Initial snapshot: Debezium can snapshot existing table data before beginning to tail the log — manage this carefully for large tables (can take hours)
- Replication slot management: PostgreSQL logical replication slots accumulate WAL if the consumer falls behind — monitor replication slot lag as a critical metric
- Exactly-once delivery: Kafka + Debezium provides at-least-once delivery; implement idempotent consumers for exactly-once semantics
