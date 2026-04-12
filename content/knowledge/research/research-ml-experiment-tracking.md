---
name: research-ml-experiment-tracking
description: Lightweight experiment tracking for ML research including W&B and MLflow integration, experiment tagging, parallel coordinate plots, run comparison dashboards, and checkpoint strategies
topics: [research, ml-research, experiment-tracking, wandb, mlflow, parallel-coordinates, checkpointing, comparison, tagging]
---

ML research experiment tracking prioritizes rapid iteration and comparison over production-grade audit trails. The goal is to answer "which of my 200 runs was best and why?" within seconds, not to maintain a production model registry. This means lightweight setup (local or cloud-hosted, not self-managed infrastructure), aggressive tagging and grouping for filtering, visualization tools that reveal patterns across many runs simultaneously, and checkpoint strategies that keep what matters and discard the rest to avoid filling storage with abandoned experiments.

## Summary

Use W&B or MLflow for research experiment tracking with minimal ceremony: log hyperparameters, metrics at each step, and final results with a single decorator or context manager. Tag runs by experiment group, hypothesis, and search phase for fast filtering. Use parallel coordinate plots to visualize relationships between hyperparameters and outcomes across hundreds of runs. Build run comparison dashboards that highlight what changed between the best and worst runs. Implement a checkpoint strategy that keeps the top-N checkpoints per experiment group and aggressively discards the rest -- research storage fills fast.

## Deep Guidance

### W&B for Rapid Research Comparison

Weights & Biases excels at research tracking because its UI is designed for comparing hundreds of runs:

```python
# src/tracking/wandb_research.py
import wandb
from typing import Any
from functools import wraps

def init_research_run(
    project: str,
    experiment_group: str,
    config: dict[str, Any],
    tags: list[str] | None = None,
) -> wandb.Run:
    """Initialize a W&B run with research-oriented metadata."""
    run = wandb.init(
        project=project,
        group=experiment_group,  # Groups runs in the UI
        config=config,
        tags=tags or [],
        # Research-specific settings
        save_code=True,  # Save the code that produced this run
        notes=f"Experiment group: {experiment_group}",
    )
    # Log system info for reproducibility
    wandb.config.update({
        "git_sha": _get_git_sha(),
        "hostname": _get_hostname(),
    }, allow_val_change=True)
    return run

def log_step_metrics(step: int, metrics: dict[str, float]) -> None:
    """Log metrics at a training step."""
    wandb.log(metrics, step=step)

def log_summary_metrics(metrics: dict[str, float]) -> None:
    """Log final summary metrics (used for run comparison tables)."""
    for key, value in metrics.items():
        wandb.run.summary[key] = value

def research_run(project: str, group: str):
    """Decorator for research training functions."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(config: dict[str, Any], *args, **kwargs):
            run = init_research_run(project, group, config)
            try:
                result = fn(config, *args, **kwargs)
                if isinstance(result, dict):
                    log_summary_metrics(result)
                wandb.finish(exit_code=0)
                return result
            except Exception as e:
                wandb.finish(exit_code=1)
                raise
        return wrapper
    return decorator

def _get_git_sha() -> str:
    import subprocess
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True
        ).strip()
    except Exception:
        return "unknown"

def _get_hostname() -> str:
    import socket
    return socket.gethostname()
```

### Experiment Tagging and Grouping

Effective tagging enables filtering hundreds of runs down to the relevant subset in seconds:

```python
# src/tracking/tagging.py
from dataclasses import dataclass, field
from enum import Enum

class ExperimentPhase(Enum):
    """Research phase tags for filtering runs."""
    EXPLORATION = "exploration"  # Broad search, many configs
    REFINEMENT = "refinement"  # Narrowing in on promising region
    ABLATION = "ablation"  # Understanding component contributions
    FINAL = "final"  # Final evaluation with multiple seeds
    BASELINE = "baseline"  # Baseline method for comparison

@dataclass
class RunTags:
    """Structured tags for a research run."""
    hypothesis: str  # Which hypothesis this tests (e.g., "H-003")
    phase: ExperimentPhase
    group: str  # Experiment group name
    architecture: str  # Architecture variant (e.g., "resnet50_modified")
    search_method: str = ""  # NAS method if applicable
    custom_tags: list[str] = field(default_factory=list)

    def to_wandb_tags(self) -> list[str]:
        """Convert to flat W&B tag list."""
        tags = [
            f"hypothesis:{self.hypothesis}",
            f"phase:{self.phase.value}",
            f"arch:{self.architecture}",
        ]
        if self.search_method:
            tags.append(f"search:{self.search_method}")
        tags.extend(self.custom_tags)
        return tags

    def to_mlflow_tags(self) -> dict[str, str]:
        """Convert to MLflow tag dict."""
        tags = {
            "hypothesis": self.hypothesis,
            "phase": self.phase.value,
            "group": self.group,
            "architecture": self.architecture,
        }
        if self.search_method:
            tags["search_method"] = self.search_method
        return tags


# Recommended tag taxonomy for ML research:
# - hypothesis:<id> -- which research question this run addresses
# - phase:<exploration|refinement|ablation|final|baseline>
# - arch:<architecture_name> -- model architecture variant
# - search:<method> -- NAS/HPO method used
# - dataset:<name> -- dataset variant or split
# - scale:<small|medium|large> -- compute scale of the run
```

### Parallel Coordinate Visualization

Parallel coordinates reveal which hyperparameter ranges correlate with good performance:

```python
# src/tracking/visualization.py
import pandas as pd
from typing import Any

def prepare_parallel_coords_data(
    runs: list[dict[str, Any]],
    params: list[str],
    metric: str,
    top_k: int | None = None,
) -> pd.DataFrame:
    """Prepare data for parallel coordinate plot.

    Each row is a run; columns are hyperparameters + the target metric.
    """
    records = []
    for run in runs:
        record = {param: run["config"].get(param) for param in params}
        record[metric] = run["metrics"].get(metric)
        record["run_id"] = run["run_id"]
        records.append(record)

    df = pd.DataFrame(records)
    df = df.dropna(subset=[metric])

    if top_k:
        df = df.nlargest(top_k, metric)

    return df

def wandb_parallel_coords_query(
    project: str,
    group: str,
    params: list[str],
    metric: str,
) -> str:
    """Generate W&B API query for parallel coordinates view.

    Use this to programmatically create a W&B panel.
    """
    # W&B parallel coordinates are configured in the UI,
    # but we can query the data programmatically
    return f"""
import wandb
api = wandb.Api()
runs = api.runs(
    "{project}",
    filters={{"group": "{group}", "state": "finished"}},
)
data = []
for run in runs:
    record = {{p: run.config.get(p) for p in {params}}}
    record["{metric}"] = run.summary.get("{metric}")
    data.append(record)
"""
```

### Run Comparison Dashboards

Build comparison views that highlight differences between best and worst runs:

```python
# src/tracking/comparison.py
from typing import Any
import numpy as np

def compare_top_bottom(
    runs: list[dict[str, Any]],
    metric: str,
    n: int = 5,
) -> dict[str, Any]:
    """Compare top-N vs bottom-N runs to find discriminating hyperparameters."""
    sorted_runs = sorted(
        runs, key=lambda r: r["metrics"].get(metric, float("-inf")), reverse=True
    )
    top = sorted_runs[:n]
    bottom = sorted_runs[-n:]

    # Find parameters that differ most between top and bottom
    all_params = set()
    for run in runs:
        all_params.update(run["config"].keys())

    discriminators = []
    for param in all_params:
        top_values = [r["config"].get(param) for r in top]
        bottom_values = [r["config"].get(param) for r in bottom]

        # For numeric params, compute separation
        try:
            top_mean = np.mean([float(v) for v in top_values if v is not None])
            bottom_mean = np.mean([float(v) for v in bottom_values if v is not None])
            separation = abs(top_mean - bottom_mean)
            discriminators.append({
                "param": param,
                "top_mean": top_mean,
                "bottom_mean": bottom_mean,
                "separation": separation,
                "type": "numeric",
            })
        except (TypeError, ValueError):
            # Categorical param -- check if top/bottom have different modes
            from collections import Counter
            top_mode = Counter(top_values).most_common(1)[0][0] if top_values else None
            bottom_mode = Counter(bottom_values).most_common(1)[0][0] if bottom_values else None
            if top_mode != bottom_mode:
                discriminators.append({
                    "param": param,
                    "top_mode": top_mode,
                    "bottom_mode": bottom_mode,
                    "type": "categorical",
                })

    discriminators.sort(
        key=lambda d: d.get("separation", 1.0), reverse=True
    )
    return {
        "top_runs": top,
        "bottom_runs": bottom,
        "discriminating_params": discriminators[:10],
    }

def format_run_comparison(run_a: dict, run_b: dict, metric: str) -> str:
    """Format a human-readable comparison of two runs."""
    lines = [f"{'Parameter':<30} {'Run A':>15} {'Run B':>15} {'Delta':>10}"]
    lines.append("-" * 75)

    all_params = sorted(set(run_a["config"]) | set(run_b["config"]))
    for param in all_params:
        val_a = run_a["config"].get(param, "---")
        val_b = run_b["config"].get(param, "---")
        if val_a != val_b:
            lines.append(f"{param:<30} {str(val_a):>15} {str(val_b):>15} {'*':>10}")

    lines.append("")
    lines.append(f"{'Metric':<30} {'Run A':>15} {'Run B':>15} {'Delta':>10}")
    lines.append("-" * 75)
    score_a = run_a["metrics"].get(metric, 0)
    score_b = run_b["metrics"].get(metric, 0)
    lines.append(f"{metric:<30} {score_a:>15.4f} {score_b:>15.4f} {score_b - score_a:>+10.4f}")

    return "\n".join(lines)
```

### Model Checkpointing for Research

Research checkpointing differs from production: keep the best-N, discard everything else aggressively, and support cross-experiment checkpoint reuse:

```python
# src/tracking/research_checkpoints.py
from pathlib import Path
from dataclasses import dataclass
import json
import shutil

@dataclass
class CheckpointPolicy:
    """Research checkpoint retention policy."""
    keep_top_n: int = 3  # Per experiment group
    keep_final: bool = True  # Always keep the last checkpoint
    max_total_gb: float = 50.0  # Total storage budget
    cleanup_on_abort: bool = True  # Delete checkpoints from aborted runs

class ResearchCheckpointManager:
    """Manage checkpoints across many research runs."""

    def __init__(self, base_dir: str, policy: CheckpointPolicy):
        self.base_dir = Path(base_dir)
        self.policy = policy
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def register_checkpoint(
        self,
        run_id: str,
        group: str,
        step: int,
        metric_value: float,
        metric_name: str,
        path: Path,
    ) -> None:
        """Register a checkpoint and enforce retention policy."""
        meta = {
            "run_id": run_id,
            "group": group,
            "step": step,
            "metric_name": metric_name,
            "metric_value": metric_value,
            "path": str(path),
        }
        meta_path = self.base_dir / "registry" / group / f"{run_id}_step{step}.json"
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)

        self._enforce_policy(group)

    def _enforce_policy(self, group: str) -> None:
        """Keep only top-N checkpoints per group."""
        registry_dir = self.base_dir / "registry" / group
        if not registry_dir.exists():
            return

        entries = []
        for meta_path in registry_dir.glob("*.json"):
            with open(meta_path) as f:
                entries.append((meta_path, json.load(f)))

        # Sort by metric (descending -- higher is better)
        entries.sort(key=lambda e: e[1]["metric_value"], reverse=True)

        # Remove checkpoints beyond top-N
        for meta_path, meta in entries[self.policy.keep_top_n:]:
            ckpt_path = Path(meta["path"])
            if ckpt_path.exists():
                ckpt_path.unlink()
            meta_path.unlink()

    def cleanup_aborted_runs(self, aborted_run_ids: list[str]) -> int:
        """Remove all checkpoints from aborted runs."""
        if not self.policy.cleanup_on_abort:
            return 0
        removed = 0
        for meta_path in self.base_dir.rglob("*.json"):
            with open(meta_path) as f:
                meta = json.load(f)
            if meta["run_id"] in aborted_run_ids:
                ckpt_path = Path(meta["path"])
                if ckpt_path.exists():
                    ckpt_path.unlink()
                    removed += 1
                meta_path.unlink()
        return removed

    def get_storage_usage_gb(self) -> float:
        """Calculate total checkpoint storage usage."""
        total_bytes = sum(
            f.stat().st_size for f in self.base_dir.rglob("*.pt")
        )
        return total_bytes / (1024**3)

    def find_best_checkpoint(self, group: str) -> Path | None:
        """Find the best checkpoint in a group for warm-starting."""
        registry_dir = self.base_dir / "registry" / group
        if not registry_dir.exists():
            return None

        best_meta = None
        best_value = float("-inf")
        for meta_path in registry_dir.glob("*.json"):
            with open(meta_path) as f:
                meta = json.load(f)
            if meta["metric_value"] > best_value:
                best_value = meta["metric_value"]
                best_meta = meta

        if best_meta:
            path = Path(best_meta["path"])
            return path if path.exists() else None
        return None
```

### MLflow for Research (Lightweight Setup)

MLflow works well for research when configured for minimal overhead:

```python
# src/tracking/mlflow_research.py
import mlflow
from typing import Any

def setup_mlflow_research(experiment_name: str) -> None:
    """Configure MLflow for lightweight research tracking."""
    # Use local SQLite -- no server needed for single-researcher projects
    mlflow.set_tracking_uri("sqlite:///mlruns.db")
    mlflow.set_experiment(experiment_name)
    # Enable autologging for common frameworks
    mlflow.autolog(log_models=False)  # Skip model logging (saves storage)

def log_research_run(
    run_name: str,
    config: dict[str, Any],
    metrics: dict[str, float],
    tags: dict[str, str],
) -> str:
    """Log a complete research run with minimal boilerplate."""
    with mlflow.start_run(run_name=run_name) as run:
        # Flatten nested config for MLflow params (max 500 chars per value)
        flat_config = _flatten_config(config)
        mlflow.log_params(flat_config)
        mlflow.log_metrics(metrics)
        for key, value in tags.items():
            mlflow.set_tag(key, value)
        return run.info.run_id

def _flatten_config(config: dict, prefix: str = "") -> dict[str, str]:
    """Flatten nested config dict for MLflow (which requires flat params)."""
    flat = {}
    for key, value in config.items():
        full_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            flat.update(_flatten_config(value, full_key))
        else:
            flat[full_key] = str(value)[:500]  # MLflow param limit
    return flat
```

### Best Practices for ML Research Tracking

1. **One project per research question**: Do not mix unrelated experiments in one tracking project. Each hypothesis or research direction gets its own project.
2. **Group by experiment phase**: Tag runs as exploration, refinement, ablation, or final. Filter by phase to avoid noise.
3. **Log at step granularity during exploration, epoch during final**: Step-level logging during exploration helps diagnose training dynamics; epoch-level during final runs reduces storage.
4. **Delete failed runs immediately**: Runs that crash, diverge, or hit NaN add noise to comparison views. Mark them as failed and archive or delete.
5. **Pin your best runs**: Use W&B pinning or MLflow tags to mark the current best result so it is always visible in comparison views.
