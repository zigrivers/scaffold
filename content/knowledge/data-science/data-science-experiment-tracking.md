---
name: data-science-experiment-tracking
description: Local MLflow setup, run instrumentation, git commit tagging, and run comparison for solo and small-team data science work
topics: [data-science, experiment-tracking, mlflow, weights-and-biases, reproducibility]
---

Without experiment tracking, data science becomes archaeology: three weeks after a promising result, a stakeholder asks "which config produced that number?" and answering it turns into a forensic exercise — sifting through notebook history, Slack messages, and commented-out cells. A lightweight experiment tracker fixes this with one discipline: every run logs its hyperparameters, metrics, artifacts, and the git commit SHA that produced it. For a solo DS or small team, you do not need a shared server or a cloud account — a local MLflow instance on SQLite is enough to get the full benefit, and you can graduate to a shared deployment later without changing the instrumentation.

## Summary

Self-host MLflow locally with a SQLite backend and a local artifact directory — it is the minimum setup that still gives you a queryable run history, a browsable UI, and reproducible run IDs. Every run logs the full hyperparameter dict, metrics per epoch (or iteration), the git commit SHA as a tag, dataset version, and any config or report artifacts. Weights & Biases is a reasonable cloud alternative if you value the polished UI and do not mind cloud storage — but for a DS-1 setup it is not the primary recommendation. Never log PII into run metadata or artifacts, and never commit `mlflow.db` or `mlartifacts/` to git.

## Deep Guidance

### What to log per run

Treat every training run, hyperparameter tweak, or evaluation pass as a tracked experiment — even the exploratory ones you think will be throwaway. The cost of logging is trivial; the cost of not logging a run that turns out to matter is measured in hours of re-running and second-guessing. The minimum payload is:

- **Hyperparameters**: the full config dict (learning rate, batch size, seed, feature set, model type, loss weights, regularization). Log it all — future-you does not know which knob will matter and adding knobs retroactively is impossible.
- **Metrics**: logged with `step=epoch` (or `step=iteration`) so the UI can render a time-series plot. Log train and validation metrics side by side; a single final-value log loses the overfitting story.
- **Git commit SHA**: a tag pointing to the exact commit that produced the run. Without this, "reproduce run 47" is unanswerable, because the config alone does not capture code changes in the training loop, data loader, or feature engineering.
- **Dataset version**: a tag or param identifying which dataset snapshot was used — a DVC hash, a filename with a date suffix, or a data commit SHA. Without this, "reproduce run 47" is still unanswerable even if you have the code, because the data moved underneath it.
- **Run name**: a human-readable name (`baseline-v3-with-dropout`) so the UI list is browsable without clicking every row to read the params.
- **Artifacts**: the resolved config YAML, the evaluation report JSON, any confusion matrix images, and the final model checkpoint. Small artifacts go inline with the run; large model weights can be stored by reference.

### MLflow self-hosted setup

Run the tracking server locally. SQLite is the right backend for a solo workflow — it gives you the full query API without the ops burden of Postgres, and the `mlflow.db` file is small enough that you can zip and share it with a collaborator if you really need to:

```bash
mlflow server \
  --backend-store-uri sqlite:///mlflow.db \
  --default-artifact-root ./mlartifacts \
  --host 127.0.0.1 --port 5000
```

Bind to `127.0.0.1` rather than `0.0.0.0` so you do not accidentally expose an unauthenticated tracking server to your network. Leave it running in a terminal tab, a `tmux` pane, or under `launchd`/`systemd` — whatever keeps it up between sessions.

Point your code at the server via an environment variable. Using `direnv` keeps this per-project and avoids polluting your shell:

```bash
# .envrc
export MLFLOW_TRACKING_URI=http://localhost:5000
export MLFLOW_EXPERIMENT_NAME=churn-baseline
```

Add the tracking artifacts to `.gitignore` — they are large, local, and not reproducible from source. Committing them bloats the repo and leaks local-path metadata into history:

```gitignore
# .gitignore
mlflow.db
mlflow.db-journal
mlartifacts/
mlruns/
```

When you later graduate to a shared MLflow server (team deployment, S3 artifact store, Postgres backend), the only change is the `MLFLOW_TRACKING_URI` — your instrumentation code stays identical, and historical runs stay on your laptop as a personal archive.

### Instrumenting a training / experiment run

Wrap the training loop in `mlflow.start_run`. The context manager handles start and end timestamps, guarantees the run closes even on exception, and exposes `run.info.run_id` — the stable handle you use later for comparison, export, or model loading:

```python
import subprocess
import mlflow
import yaml

mlflow.set_tracking_uri("http://localhost:5000")
mlflow.set_experiment("churn-baseline")

def train(cfg: dict) -> dict:
    with mlflow.start_run(run_name=cfg["experiment"]["name"]) as run:
        # Log full hyperparameter dict (flatten nested keys to dot-paths)
        mlflow.log_params(_flatten(cfg))

        # Reproducibility tags — git commit is the single most important one
        git_sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"]
        ).decode().strip()
        mlflow.set_tag("git_commit", git_sha)
        mlflow.set_tag("dataset_version", cfg["data"]["version"])
        mlflow.set_tag("model_type", cfg["model"]["type"])

        # Per-epoch metrics — step=epoch is what gives you a time-series plot
        for epoch in range(cfg["training"]["epochs"]):
            train_metrics = train_epoch(...)
            val_metrics = evaluate(...)
            mlflow.log_metrics({
                "train_loss": train_metrics["loss"],
                "val_loss": val_metrics["loss"],
                "val_auc": val_metrics["auc"],
            }, step=epoch)

        # Artifacts: resolved config + eval report
        with open("configs/resolved.yaml", "w") as f:
            yaml.safe_dump(cfg, f)
        mlflow.log_artifact("configs/resolved.yaml")
        mlflow.log_artifact("reports/eval_report.json")

        return {"run_id": run.info.run_id, **val_metrics}
```

A few notes on the shape of this code. `mlflow.log_params` takes a flat dict, so a helper like `_flatten` turns `{"optimizer": {"lr": 1e-3}}` into `{"optimizer.lr": "0.001"}` — values are coerced to strings. Log the **resolved** config after any CLI overrides or hydra composition, not the raw file on disk, so the stored params match what actually ran. If the working tree is dirty at training time, either commit first or log `git status --porcelain` output as a tag so you can tell the logged commit is not the whole story. Keep the returned `run_id` — it is the primary key you will use to find this run in the UI, export its metadata, register its model later, or reference it from a downstream evaluation run via `mlflow.set_tag("parent_run_id", ...)`.

### Run comparison and selection

Open the MLflow UI at `http://localhost:5000`. The three views that earn their keep:

- **Run list** — sort by `metrics.val_auc` or filter by `tags.git_commit = "<sha>"`. Tag filters are the fastest way to find "the runs I launched from this branch." Sort by columns to see the run_id of your best-performing experiment, then click through for the full picture.
- **Parallel coordinates plot** — select several runs, switch to the parallel coordinates view, and see which hyperparameters correlate with your target metric. This is the view that turns dozens of runs into a readable pattern — hover a line to see the full config, drag axes to filter a band, and the plot re-paints to show only the runs that meet your criterion.
- **Metric plot** — overlay `val_loss` across selected runs to spot overfitting (train loss drops, val loss rises), bad seeds (wildly different trajectories with the same config), or early-stopping candidates (val metric plateaued ten epochs before training ended).

You can also query programmatically when the UI's filters are not expressive enough:

```python
from mlflow.tracking import MlflowClient
import pandas as pd

client = MlflowClient()
runs = client.search_runs(
    experiment_ids=[client.get_experiment_by_name("churn-baseline").experiment_id],
    filter_string="metrics.val_auc > 0.82 and tags.dataset_version = '2026-03'",
    order_by=["metrics.val_auc DESC"],
    max_results=20,
)
df = pd.DataFrame([{
    "run_id": r.info.run_id,
    "name": r.info.run_name,
    "val_auc": r.data.metrics.get("val_auc"),
    "lr": r.data.params.get("optimizer.lr"),
} for r in runs])
```

When you have a winner, export its config back into the repo for a clean retrain:

```python
run = client.get_run("<run_id>")
client.download_artifacts(run.info.run_id, "resolved.yaml", dst_path="configs/")
```

Commit the exported config so "run 47's exact recipe" becomes a file in git, not a memory and not a database row that lives only on your laptop.

### Weights & Biases as alternative

Weights & Biases is the polished cloud alternative. It has a richer UI, built-in system metric logging (GPU, memory, temperature), gradient histograms via `wandb.watch(model, log="gradients")`, media logging (images, audio, tables, confusion matrices rendered inline), and better collaboration features — named reports, shared dashboards, thread-style comments. For a small team that has already decided it is comfortable with cloud storage, W&B removes the "who runs the server" question entirely, and the onboarding for a new teammate is `pip install wandb && wandb login`.

The instrumentation shape is familiar:

```python
import wandb
wandb.init(project="churn-baseline", name=cfg["experiment"]["name"],
           config=cfg, tags=["baseline", "v2-features"])
for epoch in range(cfg["training"]["epochs"]):
    wandb.log({"epoch": epoch, "val/auc": val_auc, "train/loss": loss})
wandb.finish()
```

Two things to weigh before picking it over MLflow for a DS-1 setup. First, the free tier has trial limits on private projects, artifact retention, and seats — fine for a solo experimenter, worth pricing out before a team commits. Second, you are shipping your experiment metadata (and potentially artifacts) to a third party, which matters if your dataset values, config parameters, or run names might accidentally encode something sensitive. MLflow self-hosted stays on your laptop; W&B lives in someone else's cloud. If your org has a data-residency or vendor-review process, MLflow skips it entirely.

### Graduating from solo to shared

The path from "SQLite on my laptop" to "shared team tracker" is short and deliberately low-risk, because your instrumentation already speaks the MLflow protocol:

1. **Stand up a shared MLflow server** behind your internal network — Postgres backend, S3 or equivalent object store for artifacts, authentication in front (oauth2-proxy, nginx basic auth, or a cloud load balancer).
2. **Flip the tracking URI** in each project's `.envrc` to point at the shared server. No code changes.
3. **Optionally backfill historic runs** using `mlflow artifacts download` plus `search_runs`, then re-log to the shared server — only worth it for runs you want the team to see.
4. **Keep the local server configured** for offline or air-gapped work — you can still set `MLFLOW_TRACKING_URI=file:./mlruns` for quick local-only iteration when the shared server is down or you are on a plane.

This is why the self-hosted local setup is the right default even if you know you will eventually run a team server: the instrumentation you write today is exactly the instrumentation that will talk to production tomorrow.

### Nested runs for sweeps and evaluations

When you run a small hyperparameter sweep from a laptop — a few learning rates, two or three seeds — use MLflow's nested runs rather than one flat run per trial. A parent run captures the sweep-level config and best-metric summary; each trial becomes a child with its own params and metrics:

```python
with mlflow.start_run(run_name="lr-sweep") as parent:
    mlflow.log_param("sweep_type", "grid")
    best_auc = 0.0
    for lr in [1e-4, 3e-4, 1e-3, 3e-3]:
        with mlflow.start_run(run_name=f"lr={lr}", nested=True) as child:
            mlflow.log_param("lr", lr)
            val_auc = train_one(lr)
            mlflow.log_metric("val_auc", val_auc)
            best_auc = max(best_auc, val_auc)
    mlflow.log_metric("best_val_auc", best_auc)
```

In the UI, the parent shows an expandable tree of children, which keeps the run list navigable once you have hundreds of rows. For larger sweeps, pair MLflow with Optuna (`mlflow.start_run(nested=True)` inside an `objective` function) — you get Bayesian search on top of MLflow's persistence.

### Hygiene

**Never log PII.** Experiment metadata and artifacts are easy to share with collaborators, screenshot into a ticket, or accidentally export to a cloud UI when you later migrate to W&B or a shared MLflow. Hyperparameter values, metric names, run names, tags, and artifact contents must all be free of customer identifiers, emails, names, or raw records. If a config carries a data path, keep it at the dataset level (`data/processed/churn_2026_03.parquet`) — never at the row or user level (`data/users/alice@example.com/history.parquet`). Evaluation reports that include example predictions must redact any PII in the input columns before being logged as artifacts. See `data-science-security.md` for the broader no-PII rules that apply across the whole DS workflow.

**Never commit the tracking store.** `mlflow.db`, `mlflow.db-journal`, `mlartifacts/`, and `mlruns/` all belong in `.gitignore`. They are large (easily hundreds of MB once you log a few model checkpoints), machine-local (paths and timestamps are specific to your laptop), and not reproducible from git. If you need a teammate to see a run, export the specific artifacts you want to share via `mlflow artifacts download --run-id <id>` or by running a shared tracking server — do not push the whole store into the repo and do not email `mlflow.db` as an attachment.
