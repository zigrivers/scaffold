---
name: research-experiment-tracking
description: Experiment results logging including structured result formats, run comparison, reproducibility tracking, and artifact management
topics: [research, experiment-tracking, results, comparison, reproducibility, artifacts, mlflow]
---

Experiment tracking is the difference between research and random exploration. Without structured logging of what was tried, what resulted, and what was decided, a research project becomes impossible to audit, reproduce, or learn from. Tracking must capture the full context of every run: the exact config, the environment, the metrics, and the keep/discard decision with its rationale.

## Summary

Log every experiment run with its complete config, environment snapshot, metrics, and decision. Use structured formats (JSON for metrics, CSV for time series, YAML for configs) that are both human-readable and machine-parseable. Implement run comparison utilities that rank runs by primary metric and highlight configuration differences. For larger projects, integrate MLflow or Weights & Biases for web-based dashboards and artifact storage. Always store enough information to reproduce any run from scratch.

## Deep Guidance

### Structured Result Format

Every experiment run produces a result record with four sections:

```python
# src/tracking/result_schema.py
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

@dataclass
class RunResult:
    """Complete record of a single experiment run."""
    # Identity
    run_id: str
    experiment_id: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    # Configuration (frozen snapshot)
    config: dict[str, Any] = field(default_factory=dict)

    # Environment (for reproducibility)
    environment: dict[str, Any] = field(default_factory=dict)

    # Metrics
    metrics: dict[str, float] = field(default_factory=dict)
    metric_history: list[dict[str, float]] = field(default_factory=list)

    # Decision
    decision: str = ""  # "keep" or "discard"
    decision_reason: str = ""
    is_best: bool = False

    # Artifacts (paths to saved files)
    artifact_paths: dict[str, str] = field(default_factory=dict)
```

### File-Based Tracking

For small to medium projects (under ~1000 runs), file-based tracking is sufficient and has zero infrastructure dependencies:

```python
# src/tracking/file_tracker.py
import json
import csv
from pathlib import Path
from typing import Any
from src.tracking.result_schema import RunResult

class FileExperimentTracker:
    """File-based experiment tracker with no external dependencies."""

    def __init__(self, results_dir: str):
        self.results_dir = Path(results_dir)
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self.leaderboard_path = self.results_dir / "leaderboard.csv"

    def log_run(self, result: RunResult) -> Path:
        """Log a complete run result to disk."""
        run_dir = self.results_dir / result.run_id
        run_dir.mkdir(parents=True, exist_ok=True)

        # Save config snapshot
        with open(run_dir / "config.json", "w") as f:
            json.dump(result.config, f, indent=2, default=str)

        # Save environment
        with open(run_dir / "environment.json", "w") as f:
            json.dump(result.environment, f, indent=2)

        # Save metrics
        with open(run_dir / "metrics.json", "w") as f:
            json.dump(result.metrics, f, indent=2)

        # Save metric history (if available)
        if result.metric_history:
            with open(run_dir / "metric_history.csv", "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=result.metric_history[0].keys())
                writer.writeheader()
                writer.writerows(result.metric_history)

        # Save decision
        with open(run_dir / "decision.json", "w") as f:
            json.dump({
                "decision": result.decision,
                "reason": result.decision_reason,
                "is_best": result.is_best,
            }, f, indent=2)

        # Update leaderboard
        self._update_leaderboard(result)

        return run_dir

    def _update_leaderboard(self, result: RunResult) -> None:
        """Append to the CSV leaderboard for quick comparison."""
        exists = self.leaderboard_path.exists()
        fieldnames = ["run_id", "timestamp", "decision"] + sorted(result.metrics.keys())

        with open(self.leaderboard_path, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            if not exists:
                writer.writeheader()
            writer.writerow({
                "run_id": result.run_id,
                "timestamp": result.timestamp,
                "decision": result.decision,
                **result.metrics,
            })

    def load_run(self, run_id: str) -> RunResult:
        """Load a run result from disk."""
        run_dir = self.results_dir / run_id
        with open(run_dir / "config.json") as f:
            config = json.load(f)
        with open(run_dir / "metrics.json") as f:
            metrics = json.load(f)
        with open(run_dir / "decision.json") as f:
            decision = json.load(f)

        return RunResult(
            run_id=run_id,
            experiment_id="",
            config=config,
            metrics=metrics,
            decision=decision["decision"],
            decision_reason=decision["reason"],
            is_best=decision["is_best"],
        )

    def get_leaderboard(self, sort_by: str = "", ascending: bool = False) -> list[dict]:
        """Load and sort the leaderboard."""
        if not self.leaderboard_path.exists():
            return []
        with open(self.leaderboard_path, newline="") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        if sort_by and rows:
            rows.sort(key=lambda r: float(r.get(sort_by, 0)), reverse=not ascending)
        return rows
```

### Run Comparison

Compare runs to understand what configuration changes produced which metric changes:

```python
# src/tracking/comparison.py
from typing import Any

def compare_runs(run_a: dict[str, Any], run_b: dict[str, Any]) -> dict[str, Any]:
    """Compare two runs, highlighting config and metric differences."""
    config_diff = diff_dicts(run_a["config"], run_b["config"])
    metric_diff = {
        k: {
            "a": run_a["metrics"].get(k),
            "b": run_b["metrics"].get(k),
            "delta": (run_b["metrics"].get(k, 0) - run_a["metrics"].get(k, 0)),
        }
        for k in set(run_a["metrics"]) | set(run_b["metrics"])
    }
    return {
        "config_diff": config_diff,
        "metric_diff": metric_diff,
    }

def diff_dicts(a: dict, b: dict, prefix: str = "") -> list[dict]:
    """Recursively diff two dicts, returning changed keys."""
    diffs = []
    all_keys = set(a) | set(b)
    for key in sorted(all_keys):
        path = f"{prefix}.{key}" if prefix else key
        val_a = a.get(key)
        val_b = b.get(key)
        if isinstance(val_a, dict) and isinstance(val_b, dict):
            diffs.extend(diff_dicts(val_a, val_b, path))
        elif val_a != val_b:
            diffs.append({"path": path, "old": val_a, "new": val_b})
    return diffs

def rank_runs(runs: list[dict], metric: str, direction: str = "maximize") -> list[dict]:
    """Rank runs by a metric."""
    reverse = direction == "maximize"
    return sorted(
        runs,
        key=lambda r: r["metrics"].get(metric, float("-inf") if reverse else float("inf")),
        reverse=reverse,
    )
```

### MLflow Integration

For projects with many runs or team collaboration, MLflow provides a web UI and artifact store:

```python
# src/tracking/mlflow_tracker.py
import mlflow
from pathlib import Path
from typing import Any

class MLflowTracker:
    """MLflow-backed experiment tracker."""

    def __init__(self, experiment_name: str, tracking_uri: str = "sqlite:///mlruns.db"):
        mlflow.set_tracking_uri(tracking_uri)
        mlflow.set_experiment(experiment_name)

    def log_run(self, run_id: str, config: dict[str, Any],
                metrics: dict[str, float], artifacts: dict[str, str] | None = None,
                decision: str = "") -> None:
        with mlflow.start_run(run_name=run_id):
            # Log config as parameters (flattened)
            flat_config = self._flatten(config)
            mlflow.log_params(flat_config)

            # Log metrics
            for name, value in metrics.items():
                mlflow.log_metric(name, value)

            # Log decision as tag
            mlflow.set_tag("decision", decision)

            # Log artifacts
            if artifacts:
                for name, path in artifacts.items():
                    mlflow.log_artifact(path)

    @staticmethod
    def _flatten(d: dict, prefix: str = "") -> dict[str, str]:
        """Flatten nested dict for MLflow params (which are flat)."""
        items = {}
        for k, v in d.items():
            key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                items.update(MLflowTracker._flatten(v, key))
            else:
                items[key] = str(v)
        return items
```

### Reproducibility Tracking

Every run must capture enough context to be reproduced. The minimum reproducibility record:

```python
# src/tracking/reproducibility.py
import subprocess
import platform
import hashlib
import json

def create_reproducibility_record(config: dict, data_path: str) -> dict:
    """Create a record sufficient to reproduce this experiment run."""
    return {
        # Software
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "pip_freeze": _pip_freeze(),
        # Code
        "git_sha": _git_sha(),
        "git_dirty": _git_is_dirty(),
        "git_branch": _git_branch(),
        # Data
        "data_hash": _hash_file(data_path) if data_path else None,
        # Config (complete)
        "config_hash": hashlib.sha256(
            json.dumps(config, sort_keys=True).encode()
        ).hexdigest(),
    }

def _pip_freeze() -> list[str]:
    return subprocess.check_output(
        ["pip", "freeze"], text=True
    ).strip().split("\n")

def _git_sha() -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], text=True
    ).strip()

def _git_is_dirty() -> bool:
    return bool(subprocess.check_output(
        ["git", "status", "--porcelain"], text=True
    ).strip())

def _git_branch() -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"], text=True
    ).strip()

def _hash_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()
```

### Artifact Management

Artifacts are files produced during experiment execution that are too large or complex for JSON metrics:

| Artifact Type | Format | Storage |
|---------------|--------|---------|
| Model checkpoints | `.pt`, `.pkl`, `.joblib` | `results/{run}/artifacts/` |
| Equity curves | `.csv`, `.parquet` | `results/{run}/artifacts/` |
| Plots | `.png`, `.svg` | `results/{run}/artifacts/` |
| Logs | `.txt`, `.log` | `results/{run}/log.txt` |
| Configs | `.yml`, `.json` | `results/{run}/config.json` |

**Storage strategy**:
- Small artifacts (< 10 MB): Store in the run directory
- Large artifacts (> 10 MB): Store in cloud storage (S3, GCS) with a reference in the run record
- Transient artifacts (intermediate checkpoints): Delete after the run unless explicitly requested

### Tracking Best Practices

1. **Log everything, filter later**: It is cheaper to log too much than to re-run an experiment because you forgot to record a parameter.
2. **Structured formats only**: JSON and CSV, never unstructured text logs for metrics. Text logs are for debugging, not analysis.
3. **Immutable run records**: Once a run is recorded, never modify its metrics or config. If a metric was computed incorrectly, add a new metric column rather than editing the old one.
4. **Leaderboard as index**: Maintain a single CSV leaderboard that can be loaded into pandas for quick analysis. Do not rely on scanning individual run directories.
5. **Version the tracking schema**: If you add new metrics or change the format, version the schema so old runs remain parseable.
