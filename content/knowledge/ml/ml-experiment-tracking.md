---
name: ml-experiment-tracking
description: MLflow and Weights & Biases integration, artifact storage, experiment run comparison, and hyperparameter sweep management
topics: [ml, experiment-tracking, mlflow, wandb, artifacts, sweeps, reproducibility]
---

Without experiment tracking, ML development is archaeology: "which config produced that result?" is answered by digging through notebook history, chat logs, and failing memory. Experiment tracking tools are version control for training runs — every metric, every hyperparameter, every artifact, linked to the code that produced it. The discipline of logging everything during training pays dividends when a stakeholder asks "how does this model compare to what we had six months ago?"

## Summary

Use MLflow (self-hosted, open source) or Weights & Biases (cloud, more feature-rich) to track every training run. Log hyperparameters, metrics at each epoch, model artifacts, and the git commit SHA. Store large artifacts (checkpoints, datasets) in object storage backed by the experiment tracker. Use sweep features (MLflow Hyperopt integration, W&B Sweeps) for systematic hyperparameter search rather than manual iteration.

## Deep Guidance

### MLflow Integration

MLflow is the open-source standard for experiment tracking. It runs locally or on a managed server:

```bash
# Start local tracking server (stores runs in ./mlruns)
mlflow server --host 0.0.0.0 --port 5000

# Or use the SQLite backend for better performance
mlflow server \
  --backend-store-uri sqlite:///mlflow.db \
  --default-artifact-root ./mlartifacts \
  --host 0.0.0.0 --port 5000
```

**Instrument training code**:
```python
import mlflow
import mlflow.pytorch

# Set tracking server
mlflow.set_tracking_uri("http://localhost:5000")
mlflow.set_experiment("fraud-detector")

def train(cfg: DictConfig) -> dict:
    with mlflow.start_run(run_name=cfg.experiment.name) as run:
        # Log all hyperparameters from config
        mlflow.log_params(OmegaConf.to_container(cfg, resolve=True))

        # Log git commit for reproducibility
        import subprocess
        git_sha = subprocess.check_output(["git", "rev-parse", "HEAD"]).decode().strip()
        mlflow.set_tag("git_commit", git_sha)
        mlflow.set_tag("model_type", cfg.model.type)

        for epoch in range(cfg.training.epochs):
            train_metrics = train_epoch(...)
            val_metrics = evaluate(...)

            # Log metrics with step (epoch) for time-series view
            mlflow.log_metrics({
                "train_loss": train_metrics["loss"],
                "val_loss": val_metrics["loss"],
                "val_auc": val_metrics["auc"],
            }, step=epoch)

        # Log best model
        mlflow.pytorch.log_model(
            model,
            artifact_path="model",
            registered_model_name="fraud-detector",  # Register in Model Registry
        )

        # Log additional artifacts
        mlflow.log_artifact("configs/train.yaml")
        mlflow.log_artifact("reports/eval_report.json")

        return {"run_id": run.info.run_id, **val_metrics}
```

**MLflow Model Registry** (promote to production):
```python
from mlflow.tracking import MlflowClient

client = MlflowClient()

# Register a run's model in the registry
model_uri = f"runs:/{run_id}/model"
mv = mlflow.register_model(model_uri, "fraud-detector")

# Transition to staging after validation
client.transition_model_version_stage(
    name="fraud-detector",
    version=mv.version,
    stage="Staging",
    archive_existing_versions=False,
)

# Load production model in serving
production_model = mlflow.pytorch.load_model(
    model_uri="models:/fraud-detector/Production"
)
```

### Weights & Biases Integration

W&B provides a richer UI and more features than MLflow, with a cloud-hosted option:

```python
import wandb

wandb.init(
    project="fraud-detector",
    name=cfg.experiment.name,
    config=OmegaConf.to_container(cfg, resolve=True),
    tags=["baseline", "v2-features"],
    notes="Testing new feature set with gradient clipping",
)

# Log metrics
for epoch in range(cfg.training.epochs):
    metrics = train_epoch(...)
    wandb.log({
        "epoch": epoch,
        "train/loss": metrics["train_loss"],
        "val/loss": metrics["val_loss"],
        "val/auc": metrics["val_auc"],
        "lr": scheduler.get_last_lr()[0],
    })

# Log model artifact
artifact = wandb.Artifact("fraud-detector", type="model")
artifact.add_file("models/checkpoints/best.pt")
wandb.log_artifact(artifact)

wandb.finish()
```

**W&B-specific features**:
- **System monitoring**: GPU utilisation, memory, temperature logged automatically
- **Gradient histograms**: `wandb.watch(model, log="gradients")` logs gradient distributions per layer — invaluable for debugging vanishing/exploding gradients
- **Media logging**: Log images, audio, tables, confusion matrices directly in the UI
- **Alerts**: Set threshold alerts on metrics (email/Slack when val_loss > threshold)

### Artifact Storage Strategy

Artifacts are the binary outputs of training runs: model checkpoints, preprocessed datasets, evaluation reports, and confusion matrices. Never store large binary artifacts in git:

**Storage hierarchy**:
```
Small artifacts (< 1 MB): Log directly to tracker
  - Config files, evaluation reports (JSON/CSV)
  - Example predictions, confusion matrices (images)

Medium artifacts (1 MB – 1 GB): Log as tracker artifacts
  - Model checkpoints for experimentation
  - Feature engineering outputs

Large artifacts (> 1 GB): Object storage with tracker reference
  - Full training datasets
  - Final production model weights
  - Large evaluation outputs
```

**S3 artifact storage for MLflow**:
```bash
mlflow server \
  --default-artifact-root s3://my-bucket/mlflow-artifacts \
  --backend-store-uri postgresql://user:pass@host/mlflow
```

**DVC for dataset versioning alongside MLflow**:
```bash
# Version dataset with DVC
dvc add data/processed/features_v3.parquet
git add data/processed/features_v3.parquet.dvc

# Log DVC dataset reference in MLflow
mlflow.set_tag("dvc_dataset_commit", git_sha)
mlflow.set_tag("dataset_path", "data/processed/features_v3.parquet")
```

### Run Comparison and Analysis

**Finding the best run** (MLflow Python API):
```python
from mlflow.tracking import MlflowClient
import pandas as pd

client = MlflowClient()

# Get all runs in an experiment, sorted by val_auc
runs = client.search_runs(
    experiment_ids=["1"],
    filter_string="metrics.val_auc > 0.85",
    order_by=["metrics.val_auc DESC"],
    max_results=20,
)

# Convert to DataFrame for analysis
run_data = [{
    "run_id": r.info.run_id,
    "name": r.info.run_name,
    "val_auc": r.data.metrics.get("val_auc"),
    "lr": r.data.params.get("optimizer.lr"),
    "batch_size": r.data.params.get("training.batch_size"),
} for r in runs]

df = pd.DataFrame(run_data)
print(df.head(10))
```

**Comparing runs in W&B**: Use the parallel coordinates plot (built into W&B UI) to visualise the relationship between hyperparameters and metrics across many runs at once.

### Hyperparameter Sweeps

**W&B Sweeps** (cloud-managed sweep coordinator):
```yaml
# sweep_config.yaml
program: train.py
method: bayes  # bayesian, random, or grid
metric:
  name: val/auc
  goal: maximize
parameters:
  optimizer.lr:
    min: 1.0e-5
    max: 1.0e-2
    distribution: log_uniform_values
  training.batch_size:
    values: [16, 32, 64, 128]
  model.dropout:
    min: 0.0
    max: 0.5
early_terminate:
  type: hyperband
  min_iter: 3
```

```bash
wandb sweep sweep_config.yaml  # Returns sweep ID
wandb agent <sweep-id> --count 50  # Launch 50 trials
```

**MLflow + Optuna** (self-hosted alternative):
```python
import optuna
import mlflow

def objective(trial):
    with mlflow.start_run(nested=True):
        lr = trial.suggest_float("lr", 1e-5, 1e-2, log=True)
        mlflow.log_param("lr", lr)

        val_auc = train_and_evaluate(lr=lr)
        mlflow.log_metric("val_auc", val_auc)
        return val_auc

with mlflow.start_run(run_name="hyperparameter-sweep"):
    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=50)
    mlflow.log_params(study.best_params)
    mlflow.log_metric("best_val_auc", study.best_value)
```

### Experiment Logging Checklist

Log these for every training run — no exceptions:

```python
# Required: hyperparameters
mlflow.log_params({...})  # Full config dict

# Required: metrics at each epoch
mlflow.log_metrics({...}, step=epoch)

# Required: final metrics
mlflow.log_metrics({"final_val_auc": val_auc, "final_val_loss": val_loss})

# Required: reproducibility tags
mlflow.set_tag("git_commit", git_sha)
mlflow.set_tag("dataset_version", dataset_version)

# Required: model artifact
mlflow.pytorch.log_model(model, "model")

# Recommended: environment
mlflow.log_artifact("environment.yml")
mlflow.set_tag("cuda_version", torch.version.cuda)
mlflow.set_tag("pytorch_version", torch.__version__)
```
