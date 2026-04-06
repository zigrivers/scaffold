---
name: ml-architecture
description: Training/serving architecture split, feature stores, model registry, online vs offline inference patterns, and ML system design decisions
topics: [ml, architecture, feature-store, model-registry, inference, serving, training]
---

ML systems have a fundamental architectural split that traditional software does not: the training system and the serving system are different codebases running on different infrastructure, yet they must agree on the exact same data transformations. This training-serving skew is the most common source of silent production bugs in ML. Designing the architecture to prevent skew — through shared feature stores, shared preprocessing libraries, and strict interface contracts — is the most important ML architecture decision.

## Summary

ML architecture separates training (batch, data-intensive, experimental) from serving (latency-sensitive, stateless, reliable). Feature stores eliminate training-serving skew by providing consistent feature computation for both. Model registries provide the governance layer: versioning, lineage, deployment gates, and rollback. Choose online vs. offline inference based on latency requirements and data freshness needs. Document every architectural decision as an ADR.

## Deep Guidance

### Training/Serving Architecture Split

The training system and serving system have fundamentally different requirements:

| Dimension | Training | Serving |
|-----------|----------|---------|
| Throughput | High (process TB of data) | High (handle thousands of RPS) |
| Latency | Not time-critical | P99 < 200ms |
| Consistency | Best-effort | Exact reproducibility |
| Infrastructure | Spot instances, GPU clusters | Reserved instances, autoscaling |
| State | Stateful (checkpoint, resume) | Stateless (each request independent) |
| Failures | Retry / resume from checkpoint | Circuit breaker, fallback |

The primary risk of this split is **training-serving skew**: the model was trained with feature X computed one way, but production computes feature X a slightly different way, leading to silent accuracy degradation.

**Prevention strategies**:
1. **Shared feature library**: Both training and serving import the same `src/features/` module for all feature computation. Never duplicate feature logic.
2. **Feature store**: Centralised store that computes features once and serves them to both training (historical) and serving (real-time) paths.
3. **Schema validation**: Validate model inputs at serving time against the schema seen during training.

### Feature Store Architecture

A feature store is a data infrastructure component that stores and serves pre-computed features:

```
                    ┌─────────────────┐
Data Sources ──────►│ Feature Pipeline │
                    └────────┬────────┘
                             │ compute features
                    ┌────────▼────────┐
                    │  Feature Store  │
                    │  ┌───────────┐  │
                    │  │ Offline   │  │──► Training Data
                    │  │ (S3/GCS)  │  │
                    │  ├───────────┤  │
                    │  │ Online    │  │──► Serving (low-latency)
                    │  │ (Redis)   │  │
                    └─────────────────┘
```

**Offline store**: Historical features for training. Backed by object storage (S3, GCS) or a columnar database (BigQuery, Snowflake). Supports point-in-time correct feature retrieval (no data leakage).

**Online store**: Low-latency feature serving for real-time inference. Backed by Redis, DynamoDB, or Cassandra. Stores only the latest feature values.

**Implementations**: Feast (open source), Tecton, Vertex AI Feature Store, SageMaker Feature Store.

A feature store is justified when:
- Multiple models use the same features (DRY for features)
- Training-serving skew is causing production issues
- Feature computation is expensive and should be shared

### Model Registry

The model registry is the governance layer between training and production. Every model that has ever been trained should have a registry record:

```
Training Run ──► Model Artifacts ──► Registry ──► Deployment
                 (weights, config)   (metadata,    (staging,
                                     lineage)       production)
```

**Registry metadata per model version**:
- Model name and semantic version (`fraud-detector-v2.3.1`)
- Training run ID and commit SHA (full lineage)
- Training metrics (AUC, F1, etc.)
- Evaluation metrics on holdout sets
- Training dataset version
- Model schema (input/output feature names and types)
- Serving requirements (runtime, memory, GPU)
- Promotion history (who promoted, when, why)

**Lifecycle stages**:
```
None → Staging → Production → Archived
```

- Validation gates control promotion: automated tests (accuracy thresholds, latency budgets) plus optional human approval
- Production always has at least one previous version for rollback
- Archive on a schedule (keep 6 months of production versions)

**Implementations**: MLflow Model Registry, Weights & Biases Model Registry, SageMaker Model Registry.

### Online vs. Offline Inference

**Online inference** (real-time, synchronous):
- Model returns predictions in response to a request, typically within 100–500ms
- Examples: fraud scoring at checkout, recommendation on page load, search ranking
- Infrastructure: Model server (TorchServe, Triton, BentoML), autoscaled behind a load balancer
- Key considerations: latency budget, model size (must fit in serving memory), cold start time

**Offline inference** (batch, asynchronous):
- Model scores a large dataset on a schedule, stores predictions for later retrieval
- Examples: churn prediction for all users (run nightly), content pre-scoring for a recommendation cache
- Infrastructure: Spark job, Airflow DAG, Ray cluster, or simple Python script on a large VM
- Key considerations: throughput (records/second), data pipeline integration, prediction freshness

**Near-real-time / stream inference**:
- Model scores events from a stream (Kafka, Kinesis) with seconds-to-minutes latency
- Examples: anomaly detection on clickstream, session-level personalisation
- Infrastructure: Kafka consumer + model inference worker, Flink ML, or Spark Structured Streaming
- Key considerations: exactly-once semantics, ordering guarantees, backpressure handling

**Decision matrix**:

| Use Case | Latency Requirement | Data Freshness | Approach |
|----------|---------------------|----------------|----------|
| Checkout fraud | < 500ms | Real-time | Online inference |
| Churn prediction | N/A | Daily | Offline batch |
| Email personalisation | N/A (send time) | Daily | Offline batch |
| Feed ranking | < 200ms | Real-time | Online inference |
| Anomaly detection | < 30 seconds | Streaming | Stream inference |

### ML System Design Patterns

**Lambda Architecture for ML**:
- Batch layer: nightly model retraining or batch scoring
- Speed layer: real-time model updates or online scoring
- Serving layer: unified API serving precomputed (batch) + real-time predictions
- Complexity cost is high — evaluate whether the freshness gain justifies it

**Two-Tower Architecture** (recommendation systems):
- Candidate generation tower: fast approximate nearest-neighbour retrieval (ANN index)
- Ranking tower: expensive full model scoring of top-K candidates
- Separates recall (retrieve thousands of candidates quickly) from precision (rank them accurately)

**Shadow Mode Deployment**:
- New model runs in parallel with production model, receiving real traffic
- New model's predictions are not served but are logged and evaluated
- Safe way to validate new models with real data before full deployment

### Architecture Decision Record Template for ML

```markdown
# ADR-ML-001: Online vs. Offline Inference for Recommendation

## Status
Accepted — 2024-03-15

## Context
Product recommends items to users on homepage. 5M daily active users.
Data team produces updated user embeddings daily. Item catalog updates hourly.

## Decision
Use offline batch inference for recommendation.
- Nightly batch job scores all user-item pairs for top 100 candidates
- Recommendations stored in Redis with TTL of 26 hours
- API reads from Redis — zero model inference at request time

## Consequences
- P99 homepage latency drops from 450ms to 20ms (Redis lookup vs. model inference)
- Recommendations are up to 26 hours stale — acceptable given content update frequency
- Requires Redis cluster (operational cost)
- Model update cycle is daily — cannot react to same-session behaviour

## Alternatives Rejected
- Online inference: latency budget exceeded (model P99 = 380ms)
- Streaming inference: engineering complexity not justified given daily embedding update cadence
```
