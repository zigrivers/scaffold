---
name: data-science-architecture
description: Local-first architecture for solo and small-team data science — notebook exploration, src/ promotion, idempotent entrypoint pipelines, Polars vs Pandas choice, and artifact separation
topics: [data-science, architecture, polars, pandas, notebook-promotion]
---

"Architecture" sounds heavy for a single analyst opening a notebook, but it is the one decision that separates work a collaborator can rerun tomorrow from a pile of ad-hoc scripts that only you can coax back to life. Solo DS work is local-first, reproducibility-first, and almost never needs Airflow or a Kubernetes cluster. What it needs is a coherent shape that scales from "a single notebook" to "a pipeline a teammate can clone and run" — and a clear story about where raw data, intermediate data, models, and reports each live. This doc lays out that shape and the small set of conventions that make it hold together.

## Summary

Architect a solo DS project as layers: exploratory notebooks on top, reusable functions in `src/`, unit tests in `tests/`, and a thin entrypoint script that composes those functions into a reproducible run. Use Polars for datasets >1 GB or >10M rows and Pandas for everything smaller where scikit-learn / seaborn compatibility matters. Runs happen via `uv run python -m src.pipeline` — no scheduler needed. Pipelines are idempotent functions that move data from `data/raw/` to `data/interim/` to `data/processed/`, emitting models to `models/` and reports to `reports/`. This shape deliberately does not solve distributed data, production serving, or real-time inference — when those become real, graduate to Prefect / Dagster and cross over to `ml-serving-patterns.md`.

## Deep Guidance

### The layered shape

The entire architecture is five layers, each with a single responsibility:

```
┌──────────────────────────────────────────────────────────────┐
│ notebooks/               exploration, narrative, charts       │
│   ↓  (promote stable code)                                    │
├──────────────────────────────────────────────────────────────┤
│ src/<project>/           typed, importable functions          │
│   ↓  (test every function you ship)                           │
├──────────────────────────────────────────────────────────────┤
│ tests/                   pytest smoke + unit tests            │
│   ↓  (functions compose into a run)                           │
├──────────────────────────────────────────────────────────────┤
│ src/pipeline.py          entrypoint: load→features→train→save │
│   ↓  (run produces artifacts)                                 │
├──────────────────────────────────────────────────────────────┤
│ data/ models/ reports/   outputs, gitignored or DVC-tracked   │
└──────────────────────────────────────────────────────────────┘
```

Read top-to-bottom it is the promotion path; read bottom-to-top it is the dependency graph. A notebook may import from `src/` but `src/` must never import from a notebook. Tests depend only on `src/`. The entrypoint (`pipeline.py`) is itself a module under `src/`, not a loose script at the repo root — keeping it importable lets you exercise it end-to-end in tests with a tiny fixture dataset.

### Polars vs Pandas

Pick the DataFrame library based on data size and ecosystem needs, not on what's trendy. Rule of thumb:

| Dimension            | Pandas                                | Polars                                  |
|----------------------|---------------------------------------|-----------------------------------------|
| Rows                 | <10M comfortably                      | 10M–1B on a single machine              |
| In-memory size       | <1 GB                                 | 1 GB – ~RAM/2                           |
| Execution            | Eager, single-threaded                | Lazy + multi-threaded, Arrow-native     |
| Ecosystem            | scikit-learn, seaborn, plotly, statsmodels | Native; interop via `.to_pandas()` |
| API stability        | Mature, huge Stack Overflow corpus    | Younger, faster-moving                  |

**Default to Pandas** when you are in sklearn / statsmodels / seaborn territory with small-to-medium data — ecosystem friction is the dominant cost. **Reach for Polars** when you are doing heavy group-bys, joins, or window functions on datasets where Pandas starts swapping or takes minutes per cell. The two libraries express the same group-by almost identically:

```python
# Pandas
(df
 .groupby("customer_id")
 .agg(total_spend=("amount", "sum"), tx_count=("amount", "count"))
 .reset_index())

# Polars (lazy — add .collect() to execute)
(df.lazy()
 .group_by("customer_id")
 .agg(pl.col("amount").sum().alias("total_spend"),
      pl.col("amount").count().alias("tx_count"))
 .collect())
```

Mixing is fine: load with Polars, do the fast aggregation, then `.to_pandas()` right before feeding a scikit-learn estimator. Avoid the trap of half-converting the codebase — pick one as the default for a given project and document it.

### Notebook to pipeline promotion

Every piece of code starts life in a notebook. The discipline is knowing when to move it:

1. You copy-paste a cell into a second notebook → promote.
2. A transformation has a non-trivial branch (try/except, conditional handling) → promote.
3. You want to unit-test it → promote (you can't test a notebook cell cleanly).

Promotion is a four-step move: extract the cell into `src/<project>/features/engineer.py` as a typed function, add a pytest in `tests/`, replace the notebook cell with an `import`, and turn on `%autoreload 2` so subsequent edits live-reload without a kernel restart.

```python
# src/<project>/features/engineer.py
import polars as pl

def add_tenure_bucket(df: pl.DataFrame, *, today: str) -> pl.DataFrame:
    """Bucket customers by days since signup into short / medium / long tenure."""
    return df.with_columns(
        ((pl.lit(today).str.to_date() - pl.col("signup_date")).dt.total_days())
        .alias("tenure_days")
    ).with_columns(
        pl.when(pl.col("tenure_days") < 90).then(pl.lit("short"))
          .when(pl.col("tenure_days") < 365).then(pl.lit("medium"))
          .otherwise(pl.lit("long"))
          .alias("tenure_bucket")
    )
```

The notebook now reads `from <project>.features.engineer import add_tenure_bucket` and the function is covered by `tests/test_engineer.py` with a six-row fixture. This is the single most important habit in a DS codebase — see `data-science-project-structure.md` for the directory layout it slots into.

### Idempotent pipeline entrypoints

The pipeline is a thin composition layer — one function per stage, each one idempotent (same inputs → same outputs, safe to rerun). It lives at `src/<project>/pipeline.py` and exposes a `main(cfg)` that a CLI wraps:

```python
# src/<project>/pipeline.py
import argparse, yaml
from pathlib import Path
from <project>.ingestion import load_transactions
from <project>.validation import validate_schema
from <project>.features.engineer import build_features
from <project>.training import train_model
from <project>.evaluation import evaluate
from <project>.io import save_model, save_report

def run(cfg: dict) -> None:
    run_id = cfg["run_name"]
    raw = load_transactions(cfg["data"]["raw_path"])
    validate_schema(raw, cfg["data"]["schema"])
    processed = build_features(raw, cfg["features"])
    processed.write_parquet(Path(cfg["data"]["processed_path"]))
    model, metrics = train_model(processed, cfg["model"])
    report = evaluate(model, processed, cfg["evaluation"])
    save_model(model, f"models/{run_id}.joblib")
    save_report(report, f"reports/{run_id}.html")

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True, type=Path)
    args = ap.parse_args()
    run(yaml.safe_load(args.config.read_text()))

if __name__ == "__main__":
    main()
```

Invoke it with `uv run python -m <project>.pipeline --config configs/baseline.yaml`. Idempotence means: each stage writes to a deterministic path based on the config, and re-running over existing outputs is a no-op (or an overwrite of identical content). That property is what lets a teammate — or future-you — rerun the pipeline confidently without inspecting every intermediate.

### Where outputs go

Artifacts follow a strict directory contract so a run never scatters files:

| Artifact               | Path                                | Notes                                    |
|------------------------|-------------------------------------|------------------------------------------|
| Immutable source data  | `data/raw/`                         | Never written to after initial ingest    |
| Cached partial transforms | `data/interim/`                  | Safe to delete; regenerable from raw     |
| Analysis-ready datasets | `data/processed/`                  | Consumed by training                     |
| Predictions            | `data/processed/predictions/`       | Keeps inference outputs alongside data   |
| Trained models         | `models/<run_id>.joblib`            | DVC or git-lfs pointer tracked           |
| Rendered reports       | `reports/<run_id>.html`             | HTML / markdown summaries                |
| Figures                | `reports/figures/<run_id>/`         | PNG / SVG charts                         |

The rule: **paths come from config, never hard-coded in code**. `cfg["output"]["model_path"]` lives in the YAML; `"models/baseline_v1.joblib"` never appears as a string literal inside `training.py`. That is what lets a single pipeline module serve every run variant.

### When to outgrow this

This architecture covers the 0-to-100GB, one-to-three-contributors slot. Signals you are leaving that slot:

- Data no longer fits on a laptop (>100 GB, or streaming sources) → Spark, DuckDB+S3, or a warehouse-side pipeline.
- You need scheduled / triggered runs with retries, alerting, observability → Prefect, Dagster, or Airflow.
- The model must serve real-time predictions with SLA → cross over to `ml-serving-patterns.md` for online inference, feature stores, and the training-serving split.
- Multiple people are editing the pipeline concurrently → promote `configs/` to a registry, add a model registry (MLflow), and start writing ADRs under `docs/adr/`.
- The team wants experiment tracking beyond a CSV of metrics → MLflow Tracking or Weights & Biases.

Do not preemptively adopt any of these. Installing Dagster for a weekly notebook is a classic small-team failure mode — the operational tax (scheduler, DB, UI, auth) dwarfs the benefit. Graduate one piece at a time, and only when the pain is concrete. The layered shape above is deliberately the smallest coherent thing; resist making it bigger until the evidence demands it.
