---
name: data-science-observability
description: Monitoring deployed DS models and pipelines — prediction logging to Parquet, scheduled evaluation, basic drift detection, and Evidently for deeper analysis
topics: [data-science, observability, monitoring, drift, evidently]
---

Models don't fail loudly. A scoring job keeps running, rows keep landing in the output table, dashboards stay green — and quietly, the predictions get worse. The world drifts away from whatever snapshot you trained on, and nobody notices until a stakeholder says "these numbers look weird." Observability for a solo DS isn't a platform; it's a small set of habits that give you a chance to catch decay before someone else does.

## Summary

For a solo or small-team data scientist with something deployed (even just a weekly cron), observability boils down to four habits: log every prediction with its inputs to a dated Parquet file, re-run your evaluation script on a schedule and alert on metric drops, check a handful of key features for distributional drift, and reach for `Evidently` when you want a pre-built drift report instead of writing your own. The goal is a tripwire, not a dashboard — you want to get paged when something's wrong, not stare at graphs hoping to spot it.

## Deep Guidance

### Log predictions + inputs

Every time your model scores something, append a row to a dated Parquet log. This is the single most useful thing you can do for future-you — drift analysis, debugging, label backfill, and post-mortems all depend on having this log.

Layout:

```
data/processed/predictions/
  2026-04-21/
    run-20260421T0300-abc123.parquet
  2026-04-22/
    run-20260422T0300-def456.parquet
```

Schema (one row per prediction):

```python
# src/monitor/prediction_log.py
import uuid
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd

def log_predictions(
    features: pd.DataFrame,
    predictions: pd.Series,
    model_version: str,
    log_root: Path = Path("data/processed/predictions"),
) -> Path:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M") + "-" + uuid.uuid4().hex[:6]
    out_dir = log_root / today
    out_dir.mkdir(parents=True, exist_ok=True)

    df = features.copy()
    df["prediction"] = predictions.values
    df["model_version"] = model_version
    df["logged_at"] = datetime.now(timezone.utc)
    df["run_id"] = run_id
    df["ground_truth"] = pd.NA  # Backfilled later when labels arrive

    out = out_dir / f"run-{run_id}.parquet"
    df.to_parquet(out, index=False)
    return out
```

Parquet is right for this: columnar, compressed, fast to scan across dates with `pd.read_parquet("data/processed/predictions/**/*.parquet")`. If inputs have PII, hash or drop those columns before logging — you rarely need raw identifiers to do drift or error analysis.

### Scheduled eval re-runs

Your training-time evaluation script is also your monitoring script. Run it weekly or monthly against recent predictions joined to whatever ground truth has arrived, and alert when the headline metric breaches a threshold.

```python
# src/monitor/eval.py
import sys
import pandas as pd
from sklearn.metrics import roc_auc_score

THRESHOLD = 0.80  # Alert if AUC drops below this

def main() -> int:
    preds = pd.read_parquet("data/processed/predictions/")
    labels = pd.read_parquet("data/processed/labels/")
    joined = preds.merge(labels, on="record_id", how="inner")
    if len(joined) < 500:
        print("Not enough labeled data yet; skipping.")
        return 0

    auc = roc_auc_score(joined["actual"], joined["prediction"])
    print(f"AUC on {len(joined)} labeled rows: {auc:.3f}")
    if auc < THRESHOLD:
        # Send email / Slack webhook here
        print(f"ALERT: AUC {auc:.3f} below threshold {THRESHOLD}", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

Schedule it with whatever you already have — cron, a GitHub Actions `schedule:` workflow, Airflow if you run it, or your platform's scheduled job. Exit code 1 plus a Slack webhook is a perfectly good alerting system at this scale.

### Basic drift detection

Before reaching for a library, do the cheap thing: compare this period's feature distribution to your training distribution. Mean, std, a couple of quantiles, and a KS statistic cover most of what you need.

```python
# src/monitor/drift.py
from scipy.stats import ks_2samp
import pandas as pd

def feature_drift(reference: pd.Series, current: pd.Series) -> dict:
    stat, p = ks_2samp(reference.dropna(), current.dropna())
    return {
        "ref_mean": reference.mean(), "cur_mean": current.mean(),
        "ref_std": reference.std(),   "cur_std": current.std(),
        "ks_stat": stat, "ks_p": p,
        "drifted": p < 0.01,
    }

train = pd.read_parquet("data/processed/train.parquet")
recent = pd.read_parquet("data/processed/predictions/2026-04-21/")
for col in ["amount", "user_tenure_days", "n_items"]:
    print(col, feature_drift(train[col], recent[col]))
```

Run this alongside your scheduled eval. You don't need a dashboard — printing to the job log and alerting on `drifted=True` on any monitored feature is enough.

### Evidently for more

When you outgrow ad-hoc KS tests, `Evidently` gives you a pre-built drift report across all features, plus data quality checks and target drift, as an HTML page you can open or ship to S3.

```python
# src/monitor/evidently_report.py
import pandas as pd
from evidently import Report
from evidently.presets import DataDriftPreset

reference = pd.read_parquet("data/processed/train.parquet")
current = pd.read_parquet("data/processed/predictions/2026-04-21/")

report = Report([DataDriftPreset()])
snapshot = report.run(reference_data=reference, current_data=current)
snapshot.save_html("reports/drift-2026-04-21.html")
```

This is opt-in. If plain pandas + SciPy is telling you what you need to know, don't add a dependency. Reach for Evidently when you have enough features that per-column code is tedious, or when you want a shareable artifact for a stakeholder.

### The prediction / feedback loop

Ground truth almost never arrives at prediction time. A churn model predicts today who'll cancel next month; a fraud model predicts now whether a transaction is bad, confirmed days later. That delay is why the Parquet log exists — you keep predictions around until labels catch up, then join.

```python
# src/monitor/backfill_labels.py
import pandas as pd

preds = pd.read_parquet("data/processed/predictions/")
labels = pd.read_parquet("data/processed/labels/")  # record_id, actual, label_time
merged = preds.merge(labels, on="record_id", how="left")
merged.to_parquet("data/processed/predictions_labeled.parquet", index=False)
```

Keep at least one full feedback cycle of prediction logs (if labels arrive after 30 days, keep 60-90 days). This join is how you get a real accuracy number on production traffic, not just your static test-set number from training day.

### What NOT to build

Resist the urge to over-engineer. At solo scale you do not need streaming drift detection, a Prometheus/Grafana stack, a model registry with canary deploys, or a dedicated monitoring dashboard. Those are ML-platform-team concerns — build them when there's a team to own them. A dated Parquet log, a scheduled eval script, a handful of drift checks, and an alert that emails you is more than enough to catch the failures that actually happen.
