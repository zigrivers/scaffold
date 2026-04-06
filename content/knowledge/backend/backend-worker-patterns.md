---
name: backend-worker-patterns
description: Background job frameworks, cron scheduling, event consumers, dead letter queues, retry strategies, and graceful shutdown for workers
topics: [backend, workers, bullmq, celery, temporal, cron, background-jobs, dlq]
---

Background workers offload time-consuming and deferred work from the request path, but they introduce their own failure modes — jobs that silently vanish, duplicate executions, and unclean shutdowns during deploys all require deliberate design to prevent.

## Summary

Background workers offload time-consuming work from the request path. Choose BullMQ (Node.js), Celery (Python), or Temporal (durable workflows) based on the complexity of job orchestration. Define cron schedules in one place with overlap prevention. Design all event consumers to be idempotent since most message systems guarantee at-least-once delivery.

DLQ monitoring, worker health heartbeats, and graceful SIGTERM handling are operational requirements for any production worker system.

## Deep Guidance

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

### Job Prioritization

When a queue processes both urgent and non-urgent work, prioritization prevents starvation:

- **Priority queues**: BullMQ supports priority levels per job. Higher-priority jobs are dequeued first. Use sparingly — too many priority levels create implicit ordering complexity.
- **Separate queues**: Dedicate separate queues for different urgency levels (critical, standard, background). Assign more workers to the critical queue. This provides stronger isolation — a flood of background jobs cannot starve critical ones.
- **Fair scheduling**: For multi-tenant systems, ensure one tenant's burst of jobs does not starve other tenants. Use per-tenant rate limiting or round-robin dequeuing across tenant-specific sub-queues.

### Worker Deployment Patterns

Workers have different deployment considerations than HTTP services:

- **Separate deployment**: Deploy workers as separate processes or containers from the API. This allows independent scaling — add more workers when queues are deep without scaling the API.
- **Resource sizing**: Workers often need more memory than API servers (processing large files, holding state for long workflows). Size worker containers independently based on the job profile.
- **Rolling deploys**: During a deployment, old and new worker versions run simultaneously. Ensure job schemas are backwards-compatible — a job enqueued by the old version must be processable by the new version, and vice versa.
- **Singleton workers**: For jobs that must run on exactly one instance (leader election, exclusive cron), use a distributed lock (Redis `SET NX EX`) or a framework that supports this natively (Temporal).

### Job Observability

Workers are invisible unless explicitly instrumented. Essential metrics for every worker system:

- **Job throughput**: Jobs completed per second, broken down by queue and job type. Track trends to detect throughput degradation before it becomes a queue depth problem.
- **Job duration**: p50, p95, and p99 execution time per job type. Alert on p99 exceeding the expected duration — long-running jobs may indicate a dependency issue or a bug.
- **Failure rate**: Percentage of jobs that fail after all retries. Track separately from the retry rate (jobs that failed once but succeeded on retry). A rising failure rate after a deployment signals a bug.
- **Queue age**: Time the oldest unprocessed message has been waiting. This is the most direct measure of consumer lag. Alert if queue age exceeds the SLO (e.g., "all jobs processed within 5 minutes").

Emit structured logs at job start, completion, and failure with the job ID, queue name, duration, and any relevant business identifiers. This enables tracing a specific job through the entire processing lifecycle.
