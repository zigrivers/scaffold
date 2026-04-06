---
name: backend-worker-patterns
description: Background job frameworks, cron scheduling, event consumers, dead letter queues, retry strategies, and graceful shutdown for workers
topics: [backend, workers, bullmq, celery, temporal, cron, background-jobs, dlq]
---

Background workers offload time-consuming and deferred work from the request path, but they introduce their own failure modes — jobs that silently vanish, duplicate executions, and unclean shutdowns during deploys all require deliberate design to prevent.

## Summary

### Background Job Frameworks

**BullMQ (Node.js):** Redis-backed job queue with strong TypeScript support, priority queues, delayed jobs, repeatable jobs, flow producers (job hierarchies), and a rich event API. Workers are long-running processes that pull jobs from queues. Multiple workers for the same queue compete for jobs (work queue pattern). Suitable for most Node.js use cases from simple email sending to complex multi-step workflows.

**Celery (Python):** The de facto Python task queue. Supports multiple brokers (Redis, RabbitMQ, SQS) and result backends. Integrates with Django and Flask. Use `@shared_task` with `bind=True` for self-aware tasks that can access retry state. Canvas primitives (`chain`, `group`, `chord`) compose complex workflows.

**Temporal:** Workflow-as-code platform for long-running, durable workflows. Workflows are ordinary functions that survive crashes and restarts because Temporal replays the event history. Use Temporal when: workflows span hours or days, involve human approvals, require complex compensation logic, or must survive process restarts mid-execution. Steeper learning curve but eliminates entire classes of distributed systems bugs.

### Cron Scheduling

Define cron schedules in one place — application code or infrastructure (Kubernetes CronJob, AWS EventBridge Scheduler), not both. Infrastructure-level crons are more reliable (no process needs to be running continuously to trigger them) but harder to test. Application-level crons (BullMQ repeatable jobs, Celery beat) are easier to test and version alongside the code.

**Overlap prevention:** Long-running jobs can overlap if the next run starts before the previous finishes. Prevent overlap by: acquiring a distributed lock before executing (Redis `SET NX EX`), using a queue with `removeOnFail: false` and checking for in-progress jobs before enqueuing, or using a framework like Temporal that manages this natively.

**Missed jobs:** Decide whether a missed job (process was down during the scheduled time) should run on restart. For time-sensitive jobs (send a daily digest), skip the missed run. For idempotent catch-up jobs (sync data), run the missed job. Make this behavior explicit in code.

### Event Consumers

Event consumers are workers that read from a message queue or event stream (Kafka, SQS, RabbitMQ, Redis Streams) and process each message.

**At-least-once delivery:** Most message systems guarantee at-least-once delivery — a message may be delivered more than once if the consumer crashes after processing but before acknowledging. Design all consumer logic to be idempotent: track processed message IDs, use database upserts, check state before acting.

**Acknowledgment:** Acknowledge messages only after successfully processing them. Never auto-ack before processing. If processing fails, either nack (return to queue for retry) or move to a DLQ after the maximum retries are exhausted.

**Concurrency:** Run multiple concurrent consumers for throughput. Set concurrency based on downstream resource limits (database connection pool, external API rate limit) rather than CPU count. In BullMQ, set `concurrency` per worker instance. In Celery, set `--concurrency` per worker process.

## Deep Guidance

### Dead Letter Queue Handling

A DLQ captures messages that failed after the maximum retry attempts. Treat the DLQ as a first-class operational concern:

- Alert when DLQ depth exceeds a threshold.
- Log the failure reason and original message payload when moving to DLQ.
- Provide an operational runbook and tooling for replaying DLQ messages after the bug is fixed.
- Set a retention policy on the DLQ (retain for 14 days) to allow investigation without unbounded growth.

Never replay from the DLQ blindly — diagnose the failure first. A bug that caused the original failures will cause the replayed messages to fail again.

### Worker Health Monitoring

Workers are long-running processes. Monitor their health with:

- **Heartbeat:** Workers publish a heartbeat (timestamp) to a shared store (Redis) on each job completion. An external health checker alerts if a worker's heartbeat is stale (no heartbeat in 2 minutes = likely dead worker).
- **Queue depth metrics:** Export queue pending count, in-progress count, and DLQ count as metrics. Alert on queue depth growth that indicates workers are falling behind.
- **Job duration metrics:** Track and alert on unexpectedly long-running jobs (potential deadlocks or infinite loops).

### Graceful Shutdown for Workers

Workers must handle `SIGTERM` cleanly to avoid corrupting in-progress jobs during deployments:

1. Stop polling for new jobs immediately on `SIGTERM`.
2. Allow in-progress jobs to finish (up to a timeout — typically 30 seconds for most jobs, longer for known slow jobs).
3. Nack or requeue any jobs that cannot complete within the timeout so they are picked up by another worker.
4. Close database connections and queue broker connections.
5. Exit with code 0.

Configure Kubernetes `terminationGracePeriodSeconds` to match the shutdown timeout. Without graceful shutdown, rolling deployments drop in-flight jobs.
