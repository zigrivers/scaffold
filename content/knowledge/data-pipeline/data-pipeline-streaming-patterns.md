---
name: data-pipeline-streaming-patterns
description: Event time vs processing time, windowing strategies, watermarks, and exactly-once semantics for streaming data pipelines
topics: [data-pipeline, streaming, event-time, processing-time, windowing, watermarks, exactly-once, flink, kafka-streams]
---

Streaming pipeline correctness depends on understanding the distinction between when an event occurred and when it was processed, handling late-arriving data with watermarks, and ensuring that each event is processed exactly once even in the face of failures. Getting these fundamentals wrong produces pipelines that appear to work but silently compute incorrect aggregations — bugs that surface only when business users notice wrong numbers weeks later.

## Summary

Use event time (when the event occurred) rather than processing time (when it was received) for all time-based aggregations. Define watermarks to bound how late an event can arrive before being dropped. Choose window types (tumbling, sliding, session) based on the business question. Implement exactly-once semantics at the processing layer and idempotent sinks to guarantee end-to-end exactly-once delivery.

## Deep Guidance

### Event Time vs. Processing Time

Every streaming event has two timestamps:

- **Event time**: When the event actually occurred in the real world (the user clicked, the transaction was authorized, the sensor fired)
- **Processing time**: When the event arrived at and was processed by the pipeline

These two times are rarely the same. Events are delayed by:
- Network latency (milliseconds to seconds)
- Mobile clients syncing offline activity (minutes to hours)
- Source system batch uploads (hours to days)
- Retries and error recovery (variable)

**Why event time matters**

Computing aggregations using processing time produces incorrect results when events arrive late. A mobile app that syncs a purchase made at 11:58 PM at 12:05 AM should count that purchase against the 11 PM hour, not the midnight hour — if using processing time, it appears in the wrong time window.

**Always use event time for**:
- Revenue and transaction aggregations
- User activity metrics
- Time-series analytics
- SLA measurement

**Processing time is appropriate for**:
- Pipeline throughput monitoring (how many events did the system process per second)
- System health metrics
- Deduplication windows within the pipeline itself (not based on business events)

### Watermarks

A watermark is the pipeline's estimate of how far behind the current event time is relative to the real world. It defines the maximum expected delay for events: events more than W minutes late are considered lost and their window closes.

**Watermark definition**

```
watermark(t) = max(event_time seen so far) - max_delay
```

If the pipeline has seen events with timestamps up to 14:55:00, and the configured max delay is 5 minutes, the watermark is 14:50:00. All windows ending before 14:50:00 are considered complete and can be emitted.

**Choosing watermark delay**

The watermark delay must be large enough to allow late-arriving events to arrive, but small enough to not indefinitely delay results:

| Event source | Typical delay | Recommended watermark |
|-------------|--------------|----------------------|
| Server-side events | < 1 second | 10–30 seconds |
| Mobile app events | < 5 minutes | 5–15 minutes |
| IoT devices | < 1 minute | 2–5 minutes |
| Batch file uploads | < 1 hour | 2–4 hours |

**Late event handling strategies**

When an event arrives after the watermark (too late for its window):
1. **Drop** (default): The event is discarded; the window has already closed
2. **Side output / late data stream**: Route to a separate stream for separate processing or DLQ
3. **Allowed lateness**: Keep the window open for an extra duration, recompute and emit updated results

```python
# Apache Flink: watermark with late data handling
stream
    .assignTimestampsAndWatermarks(
        WatermarkStrategy
            .forBoundedOutOfOrderness(Duration.ofMinutes(5))  # 5-minute watermark
            .withTimestampAssigner(lambda e, _: e['event_timestamp'])
    )
    .key_by(lambda e: e['merchant_id'])
    .window(TumblingEventTimeWindows.of(Time.hours(1)))
    .allowed_lateness(Duration.ofMinutes(30))  # keep window 30 min past watermark
    .side_output_late_data(late_output_tag)    # capture late events
    .aggregate(RevenueAggregator())
```

### Window Types

Choose the window type based on the business question:

**Tumbling windows (fixed, non-overlapping)**

Each event belongs to exactly one window. Windows are discrete and consecutive.

```
|--- 10:00 – 11:00 ---|--- 11:00 – 12:00 ---|--- 12:00 – 13:00 ---|
```

Use for: Hourly/daily aggregations, fixed-period KPIs, batch-style streaming.

```python
# Transactions per hour
stream.window(TumblingEventTimeWindows.of(Time.hours(1)))
      .aggregate(CountAggregator())
```

**Sliding windows (fixed size, overlapping)**

Windows slide at a fixed interval. Each event may belong to multiple windows.

```
Window size=60min, slide=15min:
|--- 10:00 – 11:00 ---|
         |--- 10:15 – 11:15 ---|
                  |--- 10:30 – 11:30 ---|
```

Use for: Moving averages, rolling metrics, anomaly detection over recent history.

```python
# 1-hour rolling average, updated every 15 minutes
stream.window(SlidingEventTimeWindows.of(Time.hours(1), Time.minutes(15)))
      .aggregate(MovingAverageAggregator())
```

**Session windows (dynamic, gap-based)**

Windows close after a period of inactivity. Window size varies per user.

```
User A: |--active--| gap |--active--|
User B:      |----active----|
```

Use for: User session analysis, visit duration, activity burst detection.

```python
# Session window with 30-minute inactivity gap
stream.key_by(lambda e: e['user_id'])
      .window(EventTimeSessionWindows.with_gap(Time.minutes(30)))
      .aggregate(SessionAggregator())
```

**Global windows**

Unbounded single window; requires custom trigger to emit results.

Use for: Stream-table joins, custom trigger-based aggregations.

### Exactly-Once Semantics

Exactly-once means each event is processed and its effects are reflected in the output exactly once, even if the processing system fails and restarts.

**Delivery guarantees**

- **At-most-once**: Events may be lost, never duplicated. Simplest but loses data on failure.
- **At-least-once**: Events are never lost but may be duplicated. Requires idempotent consumers.
- **Exactly-once**: Events are neither lost nor duplicated. Most complex.

Most production streaming systems combine at-least-once delivery with idempotent sinks to achieve end-to-end exactly-once behavior.

**Flink exactly-once checkpointing**

Apache Flink implements exactly-once via distributed checkpointing:

```python
env = StreamExecutionEnvironment.get_execution_environment()
env.enable_checkpointing(60000)  # checkpoint every 60 seconds

checkpoint_config = env.get_checkpoint_config()
checkpoint_config.set_checkpointing_mode(CheckpointingMode.EXACTLY_ONCE)
checkpoint_config.set_min_pause_between_checkpoints(30000)  # 30s between checkpoints
checkpoint_config.set_checkpoint_timeout(120000)            # fail if checkpoint takes >2min
checkpoint_config.enable_externalized_checkpoints(
    ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION
)
```

Flink checkpoints snapshot the full operator state to durable storage (S3, HDFS). On failure, the job restarts from the last successful checkpoint and replays events from Kafka from the committed offset.

**Kafka Streams exactly-once**

```python
props = {
    "processing.guarantee": "exactly_once_v2",  # EOS v2 (Kafka 2.5+)
    "bootstrap.servers": "localhost:9092",
    "application.id": "payments-processor",
}
```

Kafka Streams EOS uses transactions: reads from input topics, writes to output topics, and commits consumer offsets atomically in a single Kafka transaction. Either all three happen or none do.

**Idempotent sinks for exactly-once delivery**

Even with exactly-once processing semantics, the sink (database, warehouse) must be idempotent to achieve end-to-end exactly-once:

```python
# PostgreSQL: use INSERT ON CONFLICT for idempotent writes
def write_to_postgres(records: list[dict], conn) -> None:
    with conn.cursor() as cur:
        for record in records:
            cur.execute("""
                INSERT INTO transactions (id, amount, currency, processed_at)
                VALUES (%(id)s, %(amount)s, %(currency)s, %(processed_at)s)
                ON CONFLICT (id) DO UPDATE SET
                    amount = EXCLUDED.amount,
                    currency = EXCLUDED.currency,
                    processed_at = EXCLUDED.processed_at
            """, record)

# BigQuery: use MERGE for idempotent loads
MERGE_SQL = """
MERGE silver_transactions T
USING (SELECT * FROM UNNEST(@records)) S
ON T.transaction_id = S.transaction_id
WHEN MATCHED THEN UPDATE SET
    amount = S.amount, currency = S.currency
WHEN NOT MATCHED THEN INSERT ROW
"""
```

### State Management in Streaming

Stateful streaming operations (aggregations, joins, deduplication) require managing state across events:

**State backend selection**

| Backend | Use case | Tradeoffs |
|---------|----------|-----------|
| In-memory (HashMap) | Dev/test, small state | Lost on failure, no persistence |
| RocksDB (embedded) | Production, large state | Persisted locally, spills to disk |
| Remote (Redis, DynamoDB) | Cross-instance shared state | Network latency, operational cost |

**State TTL (Time-To-Live)**

Always set TTL on state to prevent unbounded state growth:

```python
# Flink: expire deduplication state after 24 hours
state_ttl_config = StateTtlConfig \
    .new_builder(Time.hours(24)) \
    .set_update_type(StateTtlConfig.UpdateType.OnReadAndWrite) \
    .set_state_visibility(StateTtlConfig.StateVisibility.NeverReturnExpired) \
    .build()

dedup_state = RuntimeContext.get_state(
    ValueStateDescriptor("seen_events", Types.STRING())
)
dedup_state.enable_time_to_live(state_ttl_config)
```

**Deduplication using state**

```python
class DeduplicationFunction(KeyedProcessFunction):
    def open(self, parameters):
        state_descriptor = ValueStateDescriptor("seen", Types.BOOLEAN())
        ttl_config = StateTtlConfig.new_builder(Time.hours(24)).build()
        state_descriptor.enable_time_to_live(ttl_config)
        self.seen = self.runtime_context.get_state(state_descriptor)

    def process_element(self, event, ctx, out):
        if self.seen.value() is None:
            self.seen.update(True)
            out.collect(event)  # first occurrence: emit
        # else: duplicate, silently drop
```

### Streaming Pipeline Operational Metrics

Monitor these metrics on every production streaming pipeline:

- **Consumer lag** (Kafka): events behind the latest offset per partition
- **Event time lag**: difference between watermark and wall clock
- **Checkpoint duration and success rate** (Flink)
- **Late event rate**: percentage of events arriving after watermark
- **DLQ write rate**: events being routed to dead-letter queue
- **Throughput** (events/sec, bytes/sec): actual vs. capacity headroom
- **State size**: total operator state in bytes; watch for unbounded growth
