---
name: data-pipeline-orchestration
description: DAG vs event-driven vs scheduled orchestration, retry policies, SLA monitoring, and lineage tracking for data pipelines
topics: [data-pipeline, orchestration, dag, event-driven, scheduling, retry-policies, sla-monitoring, lineage, airflow, prefect, dagster]
---

Pipeline orchestration is the control plane that schedules work, manages dependencies, handles failures, and provides visibility into pipeline health. The choice between schedule-driven, event-driven, and DAG-based orchestration determines operational complexity, latency characteristics, and how well the system degrades under load. Poor orchestration design — missing retries, no SLA monitoring, absent lineage — turns data pipelines into production support burdens.

## Summary

Use schedule-based orchestration for batch pipelines with predictable cadences. Use event-driven orchestration when downstream pipelines should trigger immediately after upstream completion rather than waiting for the next scheduled window. Define retry policies per error class — exponential backoff for transient failures, no retry for non-retriable errors. Monitor SLAs as first-class metrics. Track lineage from source to serving to enable impact analysis and root cause investigation.

## Deep Guidance

### Orchestration Models

**Schedule-based orchestration**

The orchestrator triggers pipelines on a cron schedule, regardless of whether upstream data is ready. This is the simplest model and works well when:
- Data arrives on a predictable schedule (file drops at 2am, database exports at midnight)
- Acceptable to occasionally process empty or incomplete datasets (the pipeline handles this gracefully)
- Downstream consumers tolerate the scheduling delay

```python
# Airflow: hourly schedule
@dag(schedule_interval="0 * * * *", ...)
def hourly_pipeline():
    ...

# With data availability check: schedule + sensor hybrid
@dag(schedule_interval="0 * * * *", ...)
def hourly_pipeline_with_sensor():
    wait = S3KeySensor(
        task_id="wait_for_data",
        bucket_name="raw-data",
        bucket_key="events/{{ ds_nodash }}/{{ execution_date.hour:02d }}/data.parquet",
        timeout=3600,
        mode="reschedule",
    )
    process = PythonOperator(...)
    wait >> process
```

**Event-driven orchestration**

Pipelines trigger when upstream data becomes available, not on a fixed schedule. Reduces latency and eliminates the "waiting for the next schedule window" problem.

```python
# Dagster: asset-based event-driven orchestration
@asset(
    partitions_def=DailyPartitionsDefinition(start_date="2024-01-01"),
    deps=["raw_transactions"],  # triggers when raw_transactions materializes
)
def silver_transactions(context, raw_transactions):
    return transform(raw_transactions)

# Prefect: event-triggered flow
@flow
def silver_pipeline():
    ...

# Register event trigger
from prefect.events.automations import Automation, EventTrigger
Automation(
    name="silver-on-bronze-complete",
    trigger=EventTrigger(
        match={"prefect.resource.id": "bronze-pipeline"},
        expect={"prefect.flow-run.Completed"},
    ),
    actions=[RunFlow(flow=silver_pipeline)],
).save()
```

Event-driven orchestration reduces end-to-end latency from "up to schedule interval" to "seconds after upstream completion." The tradeoff is more complex dependency management and potential cascade failures.

**DAG-based orchestration**

A Directed Acyclic Graph explicitly models task dependencies. The orchestrator executes tasks in topological order, respecting all declared dependencies. DAG-based orchestration is the standard for complex multi-step pipelines with non-trivial dependency graphs.

Airflow, Prefect, and Dagster all implement DAG-based orchestration with different trade-offs:

| Feature | Airflow | Prefect | Dagster |
|---------|---------|---------|---------|
| Maturity | High | Medium | Medium |
| Dynamic DAGs | Limited | Native | Native |
| Local testing | Complex | Simple | Simple |
| Asset tracking | External | Limited | Native |
| Deployment model | Stateful scheduler | Cloud or self-hosted | Cloud or self-hosted |
| Best for | Large teams, stable DAGs | Dynamic workflows | Asset-centric pipelines |

### Retry Policy Design

Every pipeline task must have an explicit retry policy. The policy must distinguish between retriable and non-retriable failures.

**Retriable failures** — transient errors that resolve themselves:
- Network timeouts
- Rate limiting / throttling
- Temporary service unavailability (HTTP 503)
- Database lock contention

**Non-retriable failures** — permanent errors requiring human intervention:
- Schema validation errors
- Missing required configuration
- Data corruption detected
- Authentication/authorization failure

**Exponential backoff with jitter**

```python
from datetime import timedelta

# Airflow: task-level retry configuration
default_args = {
    "retries": 5,
    "retry_delay": timedelta(seconds=30),       # initial delay
    "retry_exponential_backoff": True,           # double delay each retry
    "max_retry_delay": timedelta(minutes=30),   # cap at 30 minutes
}

# Retry schedule:
# Attempt 1: immediate
# Attempt 2: 30 seconds later
# Attempt 3: 60 seconds later
# Attempt 4: 120 seconds later
# Attempt 5: 240 seconds later
# Attempt 6 (final): 480 seconds later (capped at 30 min)
```

Add jitter to prevent thundering herd — multiple failed tasks retrying at the same time:

```python
import random

def get_retry_delay(attempt: int, base_seconds: int = 30, max_seconds: int = 1800) -> float:
    exponential = base_seconds * (2 ** attempt)
    capped = min(exponential, max_seconds)
    jitter = random.uniform(0, capped * 0.1)  # 10% jitter
    return capped + jitter
```

**Classifying and routing failures**

```python
def task_with_classified_retries():
    try:
        execute_pipeline_step()
    except RateLimitError as e:
        # Retriable: will retry with backoff
        raise AirflowException(f"Rate limited: {e}") from e
    except SchemaValidationError as e:
        # Non-retriable: send to DLQ and mark task as failed (no retry)
        dlq.write(current_record, e, context)
        raise AirflowSkipException(f"Validation failed — sent to DLQ: {e}") from e
    except PoisonPillError as e:
        # Non-retriable: alert immediately
        alert_oncall(f"Poison pill detected: {e}")
        raise AirflowException(f"Poison pill — manual intervention required") from e
```

### SLA Monitoring

SLA monitoring detects when pipelines are running late before downstream consumers notice stale data.

**Airflow SLA callbacks**

```python
def sla_miss_callback(dag, task_list, blocking_task_list, slas, blocking_tis):
    """Called when a task misses its SLA deadline."""
    message = (
        f"SLA miss in {dag.dag_id}:\n"
        f"Tasks: {[t.task_id for t in task_list]}\n"
        f"Blocking: {[t.task_id for t in blocking_task_list]}"
    )
    pagerduty.trigger_alert(severity="warning", message=message)
    slack.post_message(channel="#data-alerts", text=message)

@dag(
    sla_miss_callback=sla_miss_callback,
    default_args={
        "sla": timedelta(hours=2),  # alert if task not done in 2 hours
    },
)
def payments_pipeline():
    ...
```

**Freshness SLA as a metric**

Emit a gauge metric tracking data age in the serving layer. Alert when data age exceeds the SLA:

```python
def check_data_freshness(table: str, sla_minutes: int) -> None:
    """Check that a table has been updated within the SLA window."""
    last_updated = query_last_updated_timestamp(table)
    age_minutes = (datetime.utcnow() - last_updated).total_seconds() / 60

    metrics.gauge(f"data_freshness_minutes", age_minutes, tags={"table": table})

    if age_minutes > sla_minutes:
        alert_oncall(
            f"SLA breach: {table} is {age_minutes:.0f} minutes old (SLA: {sla_minutes} min)"
        )
```

**SLA dashboard metrics to track**

- Time-to-complete per DAG run (p50, p95, p99)
- SLA miss count per pipeline per day
- Data freshness age per serving table
- Queue depth (pending tasks waiting to run)
- Failure rate per pipeline (failures per 100 runs)

### Lineage Tracking

Data lineage records how data flows from sources through transformations to serving layers. Lineage enables:
- Impact analysis: "Which dashboards will break if I change this table's schema?"
- Root cause investigation: "Which source system produced this bad value?"
- Compliance: "Which pipelines process PII from this source?"
- Dependency-aware deployments: "Can I deploy this pipeline change safely?"

**Automated lineage via orchestration metadata**

Dagster natively tracks asset lineage:

```python
@asset
def raw_transactions():
    """Bronze: raw transactions from Stripe API."""
    return stripe.read_charges()

@asset(deps=["raw_transactions"])
def silver_transactions(raw_transactions):
    """Silver: normalized and validated transactions."""
    return transforms.normalize(raw_transactions)

@asset(deps=["silver_transactions"])
def daily_revenue(silver_transactions):
    """Gold: daily revenue aggregation."""
    return aggregations.daily_revenue(silver_transactions)
```

Dagster generates a lineage graph automatically from the `deps` declarations, viewable in the UI.

**Custom lineage for Airflow**

When using Airflow without a native lineage tool, emit OpenLineage events:

```python
from openlineage.airflow import DAG
from openlineage.client.facet import SchemaDatasetFacet

# OpenLineage-instrumented DAG emits START/COMPLETE events
# consumed by Marquez, DataHub, or Apache Atlas
@dag(...)
def instrumented_pipeline():
    ...
```

**Lineage in incident response**

When a data quality incident occurs, the lineage graph drives the investigation:
1. Identify the affected output table
2. Traverse lineage backwards to find the upstream source
3. Check pipeline run history for failures or anomalies at each stage
4. Identify the transformation step where the bad data was introduced
5. Trace back to the source event or record that caused the issue

Without lineage, this investigation is manual, slow, and often incomplete. With lineage, it takes minutes.

### Orchestrator Operational Practices

**Deployment without DAG downtime**

In Airflow, deploying a new DAG version while runs are in progress can cause orphaned tasks. Use versioned DAG IDs for breaking changes:

```python
# Before: payments_ingest_v1
# After breaking change: payments_ingest_v2
# Run both in parallel during transition; decommission v1 after drain
```

**Worker pool sizing**

Size worker pools based on peak pipeline parallelism:
- Calculate maximum simultaneous tasks across all DAGs at peak hours
- Add 20% headroom for backfills and reruns
- Separate pools for CPU-intensive tasks (Spark submit) vs. I/O-bound tasks (API calls)

**Scheduler high availability**

Run multiple scheduler instances with leader election. Airflow 2.x supports HA schedulers natively. Single-scheduler deployments are a production risk.
