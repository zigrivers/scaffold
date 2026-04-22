---
name: data-science-requirements
description: Problem framing, success metrics, evaluation-test design, stakeholder contracts, and nonfunctional requirements for solo/small-team data science projects
topics: [data-science, requirements, evaluation, success-metrics, reproducibility]
---

As a solo or small-team data scientist without an existing data platform, the single biggest risk to your project is not a bad model — it is ambiguous requirements. Without a tight written spec, a DS project sprawls: the question drifts week to week, the notebook becomes unreproducible, and the stakeholder quietly reinterprets the output. This document defines what "done" looks like for an analytical pipeline, model, or report built from scratch — so you can stop work on time and defend the result.

## Summary

A data-science requirements doc states a single well-framed question, one primary success metric with a numeric acceptance threshold declared before any modeling, an evaluation design using held-out data, a stakeholder contract (who consumes the output, in what format, on what cadence), and a nonfunctional budget (reproducibility, runtime, storage). Write the target threshold into a test before you touch training data. If you cannot name the metric and the number, you are not ready to start.

## Deep Guidance

### Problem framing

Most DS projects fail at step one: the question is fuzzy ("understand churn") rather than decidable ("predict 30-day churn for active paying users, with recall >= 0.6 at precision >= 0.3"). The discipline is to force yourself, in writing, to name the decision the output will drive. If you cannot name that decision, stop and interview the stakeholder until you can.

Use a short, copyable problem-statement block at the top of your project README or PRD. The one below is opinionated — it forces every ambiguous field to get filled in before modeling starts. The tradeoff: for pure exploratory work (e.g. a one-off investigation) this is overkill; a 3-line hypothesis is enough.

```yaml
# docs/problem-statement.yaml
question: >
  For monthly paying users active in the last 30 days, predict whether they
  will cancel their subscription within the next 30 days.
decision_driven:
  who: Growth team
  action: Enroll top-decile predicted churners in a retention email campaign
  cadence: Weekly scoring
unit_of_analysis: user_id x scoring_date
prediction_target: churn_within_30d (bool)
out_of_scope:
  - free-tier users
  - annual subscribers
  - users less than 14 days old at scoring time
known_confounders:
  - planned price change on 2026-05-01
  - seasonality around end-of-year
```

### Success metrics

State the primary success metric and its acceptance threshold in writing before you train anything. The number comes from the stakeholder contract, not from what the model can achieve — otherwise you are reverse-engineering the bar to whatever you got. Pick one primary metric; secondary metrics are tie-breakers, not co-equals.

Typical patterns:

- **Predictive model**: one primary metric tied to the downstream decision. For a ranked retention campaign, `recall@top-10%` or `precision@k` beats accuracy or raw AUC, because the campaign can only email the top decile.
- **Regression / forecast**: `RMSE` in the target's natural unit, plus a naive baseline (last-value, rolling-mean). Beating the baseline is mandatory; if you cannot, the project is not viable.
- **Analytical pipeline / ETL**: functional correctness plus a p95 runtime budget (e.g. "daily job must finish in < 20 min on the scheduled box").
- **Report / dashboard**: domain acceptance threshold — the numbers in the report must match an independently computed source-of-truth query within a stated tolerance (e.g. "<= 0.1% deviation from the finance ledger").

Encode the success metric as a function so it is unambiguous and testable. The expression below is the whole contract — write it the day you start.

```python
# src/metrics.py
from sklearn.metrics import precision_recall_curve
import numpy as np

TARGET_RECALL = 0.60
MIN_PRECISION = 0.30  # at the threshold that achieves TARGET_RECALL

def primary_metric(y_true: np.ndarray, y_score: np.ndarray) -> dict:
    """Primary success metric: precision at the threshold that hits target recall."""
    precision, recall, thresholds = precision_recall_curve(y_true, y_score)
    # Walk from highest threshold down; stop when recall crosses target.
    idx = np.searchsorted(recall[::-1], TARGET_RECALL)
    idx = len(recall) - 1 - idx
    return {
        "recall": float(recall[idx]),
        "precision": float(precision[idx]),
        "threshold": float(thresholds[min(idx, len(thresholds) - 1)]),
        "passes": bool(recall[idx] >= TARGET_RECALL and precision[idx] >= MIN_PRECISION),
    }
```

### Evaluation-test design

The evaluation test is the single gate between "training run" and "ship it." Its job is to answer one question: does the model hit the stated metric on data it has not seen? Get this wrong — leak the future into the past, evaluate on training rows — and every downstream decision is poisoned.

Opinionated defaults:

- **Temporal target**: split by time, not randomly. Train on `[t0, t1)`, hold out `[t1, t2)`. Random splits with temporal data leak future information and will silently inflate metrics.
- **Non-temporal target**: stratified split by the label, fixed `random_state`, held-out fraction 15-20%.
- **Small data (< 10k rows)**: 5-fold cross-validation with the same fold seed every run; report mean plus std of the primary metric.
- **Never** tune hyperparameters on the holdout. Use a third validation split or inner CV. Tradeoff: if your dataset is tiny you may have to pool — document the risk explicitly.

The evaluation belongs in the test suite, not a notebook. The stakeholder should be able to run `pytest tests/test_model_evaluation.py` and see green before accepting the deliverable.

```python
# tests/test_model_evaluation.py
import joblib
import pandas as pd
import pytest
from src.metrics import primary_metric, TARGET_RECALL, MIN_PRECISION

HOLDOUT_PATH = "data/holdout_2026_q1.parquet"
MODEL_PATH = "artifacts/churn_model.pkl"

@pytest.fixture(scope="module")
def scored_holdout():
    df = pd.read_parquet(HOLDOUT_PATH)
    model = joblib.load(MODEL_PATH)
    X = df.drop(columns=["churn_within_30d"])
    y_true = df["churn_within_30d"].to_numpy()
    y_score = model.predict_proba(X)[:, 1]
    return y_true, y_score

def test_model_beats_acceptance_threshold(scored_holdout):
    y_true, y_score = scored_holdout
    result = primary_metric(y_true, y_score)
    assert result["passes"], (
        f"Model failed acceptance: recall={result['recall']:.3f} "
        f"(target {TARGET_RECALL}), precision={result['precision']:.3f} "
        f"(min {MIN_PRECISION})"
    )

def test_model_beats_naive_baseline(scored_holdout):
    # Baseline: predict global churn rate for everyone. Any real model must beat it.
    y_true, y_score = scored_holdout
    baseline_score = pd.Series([y_true.mean()] * len(y_true)).to_numpy()
    assert primary_metric(y_true, y_score)["precision"] > \
           primary_metric(y_true, baseline_score)["precision"]
```

### Stakeholder contract

A stakeholder contract makes the hand-off concrete. Without it, you deliver a notebook and the recipient quietly asks for a PDF, a Slack message, a dashboard, or a CSV — all different artifacts. Write this down the same week you write the problem statement.

Minimum fields, in order of how often they get skipped:

- **Consumer**: named human or team, not "the business."
- **Artifact format**: one of `csv`, `parquet`, `dashboard (URL)`, `API endpoint`, `PDF report`, `Slack summary`. Pick exactly one primary.
- **Schema**: column names, types, units, PII flags. Include an example row.
- **Cadence**: one-shot, daily, weekly, on-demand. If recurring, name the day-of-week and time-of-day.
- **Freshness SLA**: how stale is the underlying data allowed to be at delivery time.
- **Failure behavior**: what happens if the pipeline fails — silent retry, page the owner, stale-serve, fail loud.
- **Sunset criteria**: when does this deliverable stop being needed. If you cannot answer, the project has no natural end.

A one-off analysis can collapse this into a single paragraph; a recurring pipeline needs all seven fields in a short `CONTRACT.md` alongside the code.

### Nonfunctional requirements

Nonfunctional requirements are what separates a notebook from a deliverable. Three to name explicitly:

- **Reproducibility**: the pipeline must produce byte-identical outputs given identical inputs. That means a pinned `requirements.txt` (or `pyproject.toml` + lockfile), explicit `random_state` on every stochastic step (train/test split, model init, shuffling, samplers), a recorded data snapshot (immutable parquet under a dated path, not a mutable SQL query), and an entry-point script that runs end-to-end without manual cells. Test it: delete your local `.venv`, re-clone, run the script, diff the outputs. If they differ, reproducibility is broken. The tradeoff: strict byte-reproducibility is hard on GPU — for deep-learning projects, accept statistical reproducibility (metric within a tolerance) and document the exact hardware/CUDA version.
- **Runtime budget**: name a wall-clock ceiling for the full pipeline on the hardware you actually have. A useful default for small-team work: "end-to-end run (data pull -> train -> evaluate -> scoring output) must complete in <= 1 hour on a 16GB MacBook Pro." If you blow past it, either simplify or move to a bigger box deliberately — do not let runtime creep silently.
- **Storage budget**: cap the on-disk footprint of raw data, features, and model artifacts. For laptop-scale work, `< 20 GB` total is a reasonable starting point; over that, you need a deliberate story (external object store, partitioned pulls, sampling). Record the budget in the README and check it in CI with a simple `du -sh` assertion.

Encode these as top-of-project invariants, not aspirations. If the model hits the success metric but the pipeline is unreproducible or blows the runtime budget, the project is not done.

Taken together, these five sections — problem framing, success metric, evaluation test, stakeholder contract, and nonfunctional budget — form the acceptance spec for the project. Write them up front, commit them alongside the code, and treat any drift as a scope change that requires re-agreeing with the stakeholder.
