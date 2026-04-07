---
name: ml-observability
description: Model monitoring for drift and decay, prediction logging, explainability tools, and alerting on accuracy drops in production ML systems
topics: [ml, observability, monitoring, drift, model-decay, explainability, alerting, prediction-logging]
---

A model deployed to production without monitoring is a ticking clock. Models decay silently: the world changes, input distributions shift, and accuracy degrades while dashboards show green. Unlike software bugs that throw exceptions, model degradation has no stack trace — predictions simply become less useful. ML observability is the discipline of detecting these degradations before users notice them, through systematic monitoring of model inputs, outputs, and outcomes.

## Summary

ML observability covers four pillars: input monitoring (feature drift detection), output monitoring (prediction distribution shifts), outcome monitoring (accuracy against labels), and operational monitoring (latency, error rate). Complement monitoring with prediction logging for post-hoc analysis and explainability tools (SHAP, LIME) for understanding individual predictions and debugging systematic failures. Alert thresholds and on-call rotation for model health are as important as for service health.

## Deep Guidance

### The Four Pillars of ML Observability

**Pillar 1 — Input monitoring (data drift)**: Detect when the distribution of model inputs changes from the training distribution. A model trained on winter data receiving summer data will degrade without any software change.

**Pillar 2 — Output monitoring (prediction drift)**: Detect when the model's prediction distribution changes — e.g., a fraud model that suddenly classifies 10% of transactions as fraud (vs. the baseline 0.1%).

**Pillar 3 — Outcome monitoring (accuracy/concept drift)**: Detect when model accuracy changes on labelled outcomes. Requires ground truth labels, which often arrive with delay (e.g., actual fraud confirmed days after prediction).

**Pillar 4 — Operational monitoring**: Latency, throughput, error rate, memory usage. Standard SRE metrics applied to the model serving layer.

### Feature Drift Detection

Measure drift between training and serving feature distributions using statistical tests:

```python
from scipy import stats
import numpy as np
from dataclasses import dataclass
from typing import Optional

@dataclass
class DriftReport:
    feature: str
    psi: float           # Population Stability Index
    ks_statistic: float  # Kolmogorov-Smirnov statistic
    ks_p_value: float
    is_drifted: bool

def compute_psi(
    expected: np.ndarray,
    actual: np.ndarray,
    buckets: int = 10,
) -> float:
    """Population Stability Index. PSI < 0.1: stable, 0.1-0.2: minor drift, >0.2: significant drift."""
    eps = 1e-6
    expected_pcts, bins = np.histogram(expected, bins=buckets)
    actual_pcts, _ = np.histogram(actual, bins=bins)

    expected_pcts = expected_pcts / expected_pcts.sum() + eps
    actual_pcts = actual_pcts / actual_pcts.sum() + eps

    return float(np.sum((actual_pcts - expected_pcts) * np.log(actual_pcts / expected_pcts)))

def detect_drift(
    training_values: np.ndarray,
    serving_values: np.ndarray,
    feature_name: str,
    psi_threshold: float = 0.2,
    ks_alpha: float = 0.05,
) -> DriftReport:
    psi = compute_psi(training_values, serving_values)
    ks_stat, ks_p = stats.ks_2samp(training_values, serving_values)
    return DriftReport(
        feature=feature_name,
        psi=psi,
        ks_statistic=ks_stat,
        ks_p_value=ks_p,
        is_drifted=psi > psi_threshold or ks_p < ks_alpha,
    )
```

**Reference distribution maintenance**: Store feature statistics (mean, std, percentiles, histogram) from the training set as a "reference profile." Compare each day's serving data to this profile. Refresh the reference when the model is retrained.

**PSI thresholds** (industry standard):
- PSI < 0.1: No significant drift — monitor as normal
- 0.1 ≤ PSI < 0.2: Minor drift — investigate, consider retraining
- PSI ≥ 0.2: Significant drift — trigger retraining or alert

### Prediction Logging

Every prediction made in production should be logged for monitoring and post-hoc analysis:

```python
# src/serving/prediction_logger.py
import json
import time
from dataclasses import dataclass, asdict
from typing import Any

@dataclass
class PredictionRecord:
    prediction_id: str       # UUID for correlation
    model_version: str
    timestamp: float
    request_id: str          # Trace ID for distributed tracing
    input_features: dict     # Logged features (scrub PII before logging)
    prediction: Any
    confidence: float
    latency_ms: float

class PredictionLogger:
    def __init__(self, sink):  # sink: Kafka producer, Kinesis, or file
        self.sink = sink

    def log(self, record: PredictionRecord) -> None:
        payload = json.dumps(asdict(record))
        self.sink.send(payload)
```

**What to log** (balance observability with privacy/cost):
- Always: prediction ID, model version, timestamp, prediction value, confidence, latency
- Feature logging: Log features used for prediction (important for drift detection and debugging)
- PII scrubbing: Never log raw PII fields; log derived features or anonymised values only
- Sampling: For very high-throughput systems (> 10K RPS), log a representative sample (1–10%)

**Label joining**: When ground truth labels arrive (delayed), join them with prediction logs using the prediction ID to compute accuracy metrics:
```sql
SELECT
    p.model_version,
    COUNT(*) as n_predictions,
    AVG(CASE WHEN p.prediction = l.actual_label THEN 1 ELSE 0 END) as accuracy,
    AVG(p.confidence) as mean_confidence
FROM predictions p
JOIN labels l ON p.prediction_id = l.prediction_id
WHERE p.timestamp >= NOW() - INTERVAL '7 days'
GROUP BY p.model_version
```

### Explainability

Explainability tools help debug model failures and satisfy regulatory requirements:

**SHAP (SHapley Additive exPlanations)**: Computes feature importance for individual predictions using game-theoretic Shapley values. Works with any model.

```python
import shap

# Train a background dataset for the explainer
background = X_train[np.random.choice(len(X_train), 100, replace=False)]
explainer = shap.TreeExplainer(model)  # For tree models
# explainer = shap.DeepExplainer(model, background)  # For neural networks
# explainer = shap.KernelExplainer(model.predict_proba, background)  # Model-agnostic

# Explain a single prediction
shap_values = explainer.shap_values(X_test[0:1])
shap.force_plot(explainer.expected_value[1], shap_values[1][0], X_test[0])

# Explain the entire test set (global feature importance)
shap_values_all = explainer.shap_values(X_test)
shap.summary_plot(shap_values_all[1], X_test)
```

**LIME (Local Interpretable Model-agnostic Explanations)**: Fits a simple interpretable model (linear regression) locally around each prediction.

```python
from lime.lime_tabular import LimeTabularExplainer

explainer = LimeTabularExplainer(
    X_train,
    feature_names=feature_names,
    class_names=["legitimate", "fraud"],
    mode="classification",
)

explanation = explainer.explain_instance(
    X_test[0],
    model.predict_proba,
    num_features=10,
)
explanation.show_in_notebook()
```

**Integrated Gradients** (for neural networks): Attribution method that satisfies axiomatic completeness. Available in Captum (PyTorch):
```python
from captum.attr import IntegratedGradients

ig = IntegratedGradients(model)
attributions = ig.attribute(input_tensor, baseline=torch.zeros_like(input_tensor))
```

### Alerting Strategy

Define alert thresholds before deployment, not after a production incident:

```yaml
# monitoring/alerts.yaml
alerts:
  - name: accuracy_degradation_warning
    metric: val_accuracy_7d_rolling
    condition: "< 0.87"  # Warning: 2pp below target
    severity: warning
    action: page_on_call

  - name: accuracy_degradation_critical
    metric: val_accuracy_7d_rolling
    condition: "< 0.85"  # Critical: at SLA threshold
    severity: critical
    action: page_on_call_and_escalate

  - name: feature_drift_significant
    metric: max_psi_across_features
    condition: "> 0.2"
    severity: warning
    action: notify_ml_team

  - name: prediction_rate_anomaly
    metric: fraud_prediction_rate_1h
    condition: "> 0.05"  # 5x normal rate
    severity: critical
    action: page_on_call

  - name: serving_latency_breach
    metric: p99_latency_ms
    condition: "> 200"
    severity: warning
    action: notify_ml_team
```

**Alerting anti-patterns**:
- Alert fatigue: Too many low-signal alerts causes teams to ignore them. Start with critical-only, add warnings after establishing baselines.
- Static thresholds for seasonal data: Use rolling baselines that adapt to weekly/seasonal patterns.
- No runbook: Every alert must have a runbook link: "When this fires, do X, check Y, escalate to Z."

### Model Monitoring Dashboard

A model health dashboard should show at a glance:

```
Model: fraud-detector v2.3.1  |  Status: HEALTHY  |  Updated: 5 minutes ago

┌─────────────────┬──────────────────┬──────────────────┐
│ Accuracy (7d)   │ Prediction Rate  │ P99 Latency      │
│   87.3%   ✓     │   0.12%    ✓     │   142ms    ✓     │
│ target: ≥85%   │ baseline: 0.1%  │ SLA: <200ms     │
└─────────────────┴──────────────────┴──────────────────┘

┌──────────────────────────────────────────────────────┐
│ Feature Drift (PSI)                                  │
│ transaction_amount: 0.08  ✓                          │
│ merchant_category:  0.12  ⚠ (minor drift)            │
│ user_age_days:      0.04  ✓                          │
└──────────────────────────────────────────────────────┘
```

Retraining triggers: Codify when to retrain rather than leaving it to human judgment:
- Accuracy drops below warning threshold for 48+ consecutive hours
- PSI > 0.2 on any top-10 feature by SHAP importance
- Major upstream data source change (schema change, new data source)
- Scheduled retraining on a fixed cadence (monthly for most models)
