---
name: ml-requirements
description: Model performance metrics (accuracy, latency, throughput), business KPIs, fairness/bias requirements, and SLA definitions for ML systems
topics: [ml, requirements, metrics, fairness, bias, sla, kpi]
---

ML requirements differ from traditional software requirements because correctness is probabilistic, not absolute. Before writing a single line of training code, define the target metrics, their measurement methodology, and the business KPIs they serve. Ambiguous requirements — "make the model accurate" — are the root cause of most ML project failures. A requirements document for an ML system must specify numeric thresholds, measurement conditions, and what constitutes an acceptable production deployment.

## Summary

ML requirements must specify concrete numeric thresholds for model performance (accuracy, latency, throughput), tie those metrics to business KPIs, define fairness and bias constraints across protected groups, and establish SLAs for production serving. Requirements without measurement methodology are aspirations, not requirements. Capture them in a Model Requirements Document before training begins and treat them as acceptance criteria for production deployment.

## Deep Guidance

### Performance Metrics by Task Type

Different ML tasks have canonical metrics. Use the right metric for the task — do not default to accuracy for all problems:

**Classification**
- **Accuracy**: Fraction of correct predictions. Misleading for class-imbalanced datasets (a fraud detector predicting "not fraud" always achieves 99.9% accuracy if fraud is 0.1% of data).
- **Precision**: Of all positive predictions, how many are actually positive. Optimise when false positives are costly (spam filter flagging legitimate email).
- **Recall (Sensitivity)**: Of all actual positives, how many were predicted positive. Optimise when false negatives are costly (cancer screening missing a case).
- **F1 Score**: Harmonic mean of precision and recall. Good single metric when both matter equally.
- **ROC-AUC**: Area under the Receiver Operating Characteristic curve. Threshold-independent, useful for comparing models. Insensitive to class imbalance.
- **PR-AUC**: Area under the Precision-Recall curve. Better than ROC-AUC for highly imbalanced datasets.

**Regression**
- **MAE (Mean Absolute Error)**: Average absolute error. Robust to outliers. Easy to interpret in the target unit.
- **RMSE (Root Mean Squared Error)**: Penalises large errors more than MAE. Use when large errors are disproportionately harmful.
- **MAPE (Mean Absolute Percentage Error)**: Scale-independent. Problematic when targets near zero.
- **R² (Coefficient of Determination)**: Variance explained by the model. Context-dependent — R²=0.9 may be poor for weather forecasting but excellent for pricing.

**Ranking / Recommendation**
- **NDCG (Normalized Discounted Cumulative Gain)**: Relevance-weighted ranking quality. Standard for search and recommendation.
- **MRR (Mean Reciprocal Rank)**: Average of 1/rank of first relevant result.
- **Hit Rate @ K**: Fraction of users for whom a relevant item appears in top-K recommendations.

**Generation (LLM/NLG)**
- **BLEU / ROUGE**: Reference-based n-gram overlap. Weak proxy for quality — supplement with human evaluation.
- **Perplexity**: Model confidence on a held-out corpus. Lower is better; useful for comparing language models.
- **Human evaluation**: Win rate against baseline, Likert scale ratings. Required for production quality gating.

### Business KPI Alignment

Every model metric must map to a business KPI. Without this mapping, teams optimise metrics that do not move the needle:

| Model Metric | Business KPI | Notes |
|---|---|---|
| Fraud detection recall | Revenue protected from fraud | 1% recall improvement may not justify infra cost |
| Recommendation CTR | Gross Merchandise Value | CTR can rise while GMV falls (clicks on cheap items) |
| Search NDCG | Query success rate, conversion | Offline NDCG and online conversion often diverge |
| Churn prediction AUC | Customer retention rate | Model accuracy gap vs. treatment effectiveness |

Document this mapping explicitly. When offline metrics improve but the business metric does not, the mapping is wrong.

### Latency Requirements

Latency requirements are determined by the use case, not the model team's preferences:

- **Interactive / real-time**: User-facing features require P95 latency under 100ms. P99 under 500ms. Recommendation, search, and content ranking fall here.
- **Near-real-time**: Fraud detection at checkout tolerates 200–500ms P95.
- **Batch / async**: Offline scoring pipelines have no strict latency requirements but throughput requirements (e.g., score 10M records in 4 hours).

Define latency budgets from the user experience backward:
1. Total page load budget: 2000ms
2. Backend API budget: 500ms
3. ML inference budget: 100ms (within the API budget)
4. Model must fit within that budget at P99 under peak load

**Throughput requirements** are independent of latency: "The model must score 50,000 requests per second at peak." Throughput is met by horizontal scaling; latency is met by model optimisation (quantisation, distillation, hardware selection).

### Fairness and Bias Requirements

Fairness requirements must be defined before training, not audited afterward:

**Protected attributes**: Race, gender, age, disability status, national origin, religion. Model inputs should not include protected attributes directly; proxy features (zip code, name) may encode them.

**Fairness metrics**:
- **Demographic parity**: Equal positive prediction rate across groups. `P(ŷ=1 | A=0) = P(ŷ=1 | A=1)`
- **Equalized odds**: Equal TPR and FPR across groups.
- **Calibration parity**: Predicted probabilities match observed frequencies equally across groups.
- **Individual fairness**: Similar individuals receive similar predictions.

**Fairness-accuracy tradeoff**: Perfect fairness under multiple definitions simultaneously is mathematically impossible (Impossibility Theorem). Choose the fairness constraint that aligns with the legal and ethical context, then optimise accuracy subject to it.

**Requirement format**: "Model's false positive rate for group A must not exceed the false positive rate for group B by more than 5 percentage points."

### Model Monitoring SLAs

Define monitoring SLAs as part of requirements:

- **Accuracy SLA**: "Model accuracy must remain above 85% on the weekly validation set. Alert if it drops below 87% (warning threshold) or 85% (critical threshold)."
- **Drift SLA**: "Input feature distribution shift (PSI > 0.2) triggers model retraining within 48 hours."
- **Prediction latency SLA**: "P99 inference latency must remain under 200ms. Alert at 150ms."
- **Availability SLA**: "Model serving endpoint must maintain 99.9% uptime (43 minutes downtime/month)."

### Model Requirements Document Template

```markdown
# Model Requirements: [Model Name]

## Business Context
- Business problem:
- KPI being optimised:
- KPI owner:

## Performance Requirements
- Primary metric: [metric] >= [threshold] on [evaluation set]
- Secondary metric: [metric] >= [threshold]
- Baseline to beat: [current rule-based / previous model performance]

## Latency / Throughput
- P50 latency: <= [X]ms
- P99 latency: <= [X]ms
- Throughput: >= [X] RPS at peak load

## Fairness Requirements
- Protected groups: [list]
- Fairness metric: [metric] gap <= [threshold] across groups

## Data Requirements
- Training data: [source, size, date range, labeling methodology]
- Minimum training set size: [N]
- Label quality: [agreement rate, labeling error budget]

## Monitoring SLAs
- Accuracy degradation alert: < [threshold] on weekly eval
- Feature drift alert: PSI > [threshold]
- Retraining trigger: [condition]

## Acceptance Criteria
- [ ] Primary metric exceeds threshold on holdout set
- [ ] Fairness constraints satisfied
- [ ] P99 latency within budget under load test
- [ ] No critical findings in bias audit
```

This document is the acceptance test for model deployment. If the model does not satisfy it, it does not go to production.
