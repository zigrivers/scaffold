---
name: research-ml-training-patterns
description: Training loop patterns for research iteration including fast-fail detection, curriculum exploration, hyperparameter-conditioned training, reproducibility seeding, and checkpoint warm-starting
topics: [research, ml-research, training, fast-fail, curriculum, hyperparameter, reproducibility, checkpoint, warm-start]
---

Research training differs fundamentally from production training. In production, you train one model to convergence and ship it. In research, you train hundreds or thousands of configurations, most of which will fail -- the goal is to identify failures as early as possible and invest compute only in promising directions. A well-designed research training loop detects bad configurations within the first few percent of training, supports curriculum and schedule exploration without code changes, enables warm-starting from checkpoints to avoid redundant computation, and guarantees reproducibility so that any promising result can be verified.

## Summary

Design training loops for rapid iteration: implement fast-fail detection that aborts unpromising runs within 5-10% of the full budget, use hyperparameter-conditioned training that takes the full config as input (no hardcoded values), support curriculum schedules as first-class configuration objects, seed all randomness for exact reproducibility, and implement checkpoint-based warm-starting to resume experiments from any saved state. Separate the training loop from the evaluation loop so that evaluation strategies can evolve independently.

## Deep Guidance

### Fast-Fail Training

The most important research training pattern: detect bad configurations early and abort them. A run that will ultimately score poorly usually shows signals (diverging loss, NaN gradients, flat learning curves) within the first epoch:

```python
# src/training/fast_fail.py
from dataclasses import dataclass
import math

@dataclass
class FastFailConfig:
    """Configuration for early termination of bad runs."""
    # Abort if loss exceeds this multiple of initial loss
    loss_explosion_factor: float = 10.0
    # Abort if loss has not decreased after this many steps
    patience_steps: int = 500
    # Minimum improvement required within patience window
    min_improvement_pct: float = 1.0
    # Abort immediately on NaN/Inf
    abort_on_nan: bool = True
    # Check interval (don't check every step -- too expensive)
    check_every_n_steps: int = 50

class FastFailDetector:
    """Detect and abort unpromising training runs early."""

    def __init__(self, config: FastFailConfig):
        self.config = config
        self.initial_loss: float | None = None
        self.best_loss: float = float("inf")
        self.steps_since_improvement: int = 0
        self.total_steps: int = 0

    def check(self, loss: float) -> tuple[bool, str]:
        """Return (should_abort, reason) after observing a loss value."""
        self.total_steps += 1

        # NaN/Inf check (always, regardless of interval)
        if self.config.abort_on_nan and (math.isnan(loss) or math.isinf(loss)):
            return True, f"NaN/Inf loss at step {self.total_steps}"

        # Skip interval checks
        if self.total_steps % self.config.check_every_n_steps != 0:
            return False, ""

        # Record initial loss
        if self.initial_loss is None:
            self.initial_loss = loss
            self.best_loss = loss
            return False, ""

        # Loss explosion check
        if loss > self.initial_loss * self.config.loss_explosion_factor:
            return True, (
                f"Loss exploded: {loss:.4f} > "
                f"{self.initial_loss * self.config.loss_explosion_factor:.4f}"
            )

        # Improvement check
        improvement = (self.best_loss - loss) / abs(self.best_loss) * 100
        if improvement > self.config.min_improvement_pct:
            self.best_loss = loss
            self.steps_since_improvement = 0
        else:
            self.steps_since_improvement += self.config.check_every_n_steps

        if self.steps_since_improvement >= self.config.patience_steps:
            return True, (
                f"No improvement for {self.steps_since_improvement} steps "
                f"(best: {self.best_loss:.4f}, current: {loss:.4f})"
            )

        return False, ""
```

### Hyperparameter-Conditioned Training

Research training loops must accept the full experiment config as input, with zero hardcoded values. This enables sweep tools to drive training externally:

```python
# src/training/configurable_trainer.py
from dataclasses import dataclass, field
from typing import Any
import torch
import torch.nn as nn

@dataclass
class TrainingConfig:
    """Complete training configuration -- no hardcoded values."""
    # Optimization
    learning_rate: float = 1e-3
    weight_decay: float = 1e-4
    optimizer: str = "adamw"  # "adam", "adamw", "sgd", "lion"
    scheduler: str = "cosine"  # "cosine", "linear", "step", "none"
    warmup_steps: int = 100
    max_steps: int = 10000

    # Architecture (passed through to model builder)
    model_config: dict[str, Any] = field(default_factory=dict)

    # Training behavior
    batch_size: int = 32
    gradient_clip_norm: float = 1.0
    mixed_precision: bool = True
    gradient_accumulation_steps: int = 1

    # Fast-fail
    fast_fail: bool = True
    fast_fail_patience: int = 500

    # Reproducibility
    seed: int = 42

def build_optimizer(model: nn.Module, config: TrainingConfig) -> torch.optim.Optimizer:
    """Build optimizer from config -- never hardcode optimizer choice."""
    optimizers = {
        "adam": torch.optim.Adam,
        "adamw": torch.optim.AdamW,
        "sgd": torch.optim.SGD,
    }
    cls = optimizers[config.optimizer]
    kwargs = {"lr": config.learning_rate, "weight_decay": config.weight_decay}
    if config.optimizer == "sgd":
        kwargs["momentum"] = 0.9
    return cls(model.parameters(), **kwargs)

def build_scheduler(optimizer, config: TrainingConfig):
    """Build LR scheduler from config."""
    if config.scheduler == "cosine":
        return torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=config.max_steps - config.warmup_steps
        )
    elif config.scheduler == "linear":
        return torch.optim.lr_scheduler.LinearLR(
            optimizer, start_factor=1.0, end_factor=0.0,
            total_iters=config.max_steps - config.warmup_steps
        )
    elif config.scheduler == "step":
        return torch.optim.lr_scheduler.StepLR(
            optimizer, step_size=config.max_steps // 5, gamma=0.5
        )
    return None
```

### Curriculum and Schedule Exploration

Research often explores different training curricula (data ordering, task difficulty progression, loss weighting schedules). Define these as first-class objects:

```python
# src/training/curriculum.py
from dataclasses import dataclass
from typing import Callable
import math

@dataclass
class CurriculumSchedule:
    """A curriculum schedule that controls training progression."""
    name: str
    # Function mapping step -> difficulty level (0.0 to 1.0)
    difficulty_fn: Callable[[int, int], float]  # (step, max_steps) -> difficulty

    def get_difficulty(self, step: int, max_steps: int) -> float:
        return self.difficulty_fn(step, max_steps)

# Built-in schedules for experimentation
CURRICULUM_SCHEDULES = {
    "linear": CurriculumSchedule(
        name="linear",
        difficulty_fn=lambda step, max_steps: step / max_steps,
    ),
    "exponential": CurriculumSchedule(
        name="exponential",
        difficulty_fn=lambda step, max_steps: (
            math.exp(3 * step / max_steps) - 1) / (math.e**3 - 1),
    ),
    "step_3": CurriculumSchedule(
        name="step_3",
        difficulty_fn=lambda step, max_steps: min(1.0, (step // (max_steps // 3) + 1) / 3),
    ),
    "constant_easy": CurriculumSchedule(
        name="constant_easy",
        difficulty_fn=lambda step, max_steps: 0.3,
    ),
    "constant_hard": CurriculumSchedule(
        name="constant_hard",
        difficulty_fn=lambda step, max_steps: 1.0,
    ),
}

def filter_by_difficulty(
    dataset,
    difficulty_scores: list[float],
    current_difficulty: float,
    tolerance: float = 0.1,
) -> list[int]:
    """Return indices of samples at or below current difficulty level."""
    return [
        i for i, score in enumerate(difficulty_scores)
        if score <= current_difficulty + tolerance
    ]
```

### Reproducibility Seeding

Exact reproducibility requires seeding every source of randomness. This is non-trivial with GPU operations:

```python
# src/training/reproducibility.py
import os
import random
import numpy as np
import torch

def seed_everything(seed: int) -> None:
    """Seed all random number generators for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)

    # Deterministic algorithms (slower but reproducible)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    torch.use_deterministic_algorithms(True, warn_only=True)

def worker_init_fn(worker_id: int) -> None:
    """Seed dataloader workers for reproducibility."""
    worker_seed = torch.initial_seed() % 2**32
    np.random.seed(worker_seed)
    random.seed(worker_seed)

def get_reproducibility_info(seed: int) -> dict:
    """Capture full reproducibility record for a training run."""
    return {
        "seed": seed,
        "torch_version": torch.__version__,
        "cuda_version": torch.version.cuda or "none",
        "cudnn_version": torch.backends.cudnn.version() if torch.cuda.is_available() else None,
        "deterministic": torch.backends.cudnn.deterministic,
        "benchmark": torch.backends.cudnn.benchmark,
        "gpu_name": (
            torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none"
        ),
    }
```

### Checkpoint-Based Warm Starting

Warm-starting avoids re-training from scratch when exploring nearby configurations. Save and restore training state completely:

```python
# src/training/checkpointing.py
from dataclasses import dataclass
from pathlib import Path
import torch
import json

@dataclass
class CheckpointManager:
    """Manage training checkpoints for warm-starting experiments."""
    checkpoint_dir: Path
    keep_top_k: int = 5  # Keep only the best K checkpoints

    def __post_init__(self):
        self.checkpoint_dir = Path(self.checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

    def save(
        self,
        model,
        optimizer,
        scheduler,
        step: int,
        metrics: dict[str, float],
        config: dict,
    ) -> Path:
        """Save complete training state for warm-starting."""
        checkpoint = {
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scheduler_state_dict": scheduler.state_dict() if scheduler else None,
            "step": step,
            "metrics": metrics,
            "config": config,
        }
        path = self.checkpoint_dir / f"checkpoint_step_{step}.pt"
        torch.save(checkpoint, path)

        # Save metadata for quick filtering
        meta_path = self.checkpoint_dir / f"checkpoint_step_{step}.json"
        with open(meta_path, "w") as f:
            json.dump({"step": step, "metrics": metrics, "config": config}, f, indent=2)

        self._enforce_top_k(metrics)
        return path

    def load(self, path: Path, model, optimizer=None, scheduler=None) -> dict:
        """Load checkpoint and restore training state."""
        checkpoint = torch.load(path, map_location="cpu", weights_only=False)
        model.load_state_dict(checkpoint["model_state_dict"])
        if optimizer and checkpoint["optimizer_state_dict"]:
            optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        if scheduler and checkpoint["scheduler_state_dict"]:
            scheduler.load_state_dict(checkpoint["scheduler_state_dict"])
        return checkpoint

    def find_warmstart_checkpoint(self, config: dict, metric: str = "val_loss") -> Path | None:
        """Find the best checkpoint from a similar config for warm-starting."""
        meta_files = sorted(self.checkpoint_dir.glob("*.json"))
        candidates = []
        for meta_path in meta_files:
            with open(meta_path) as f:
                meta = json.load(f)
            similarity = self._config_similarity(config, meta["config"])
            if similarity > 0.7:  # At least 70% similar
                candidates.append((meta_path, meta, similarity))

        if not candidates:
            return None

        # Pick highest similarity, break ties by best metric
        candidates.sort(key=lambda x: (x[2], -x[1]["metrics"].get(metric, float("inf"))))
        best_meta = candidates[-1][0]
        ckpt_path = best_meta.with_suffix(".pt")
        return ckpt_path if ckpt_path.exists() else None

    def _config_similarity(self, config_a: dict, config_b: dict) -> float:
        """Compute fraction of matching config keys."""
        all_keys = set(config_a) | set(config_b)
        if not all_keys:
            return 1.0
        matching = sum(1 for k in all_keys if config_a.get(k) == config_b.get(k))
        return matching / len(all_keys)

    def _enforce_top_k(self, latest_metrics: dict) -> None:
        """Keep only top-K checkpoints by primary metric."""
        meta_files = list(self.checkpoint_dir.glob("*.json"))
        if len(meta_files) <= self.keep_top_k:
            return
        entries = []
        for meta_path in meta_files:
            with open(meta_path) as f:
                meta = json.load(f)
            entries.append((meta_path, meta))

        # Sort by val_loss ascending (lower is better) -- remove worst
        entries.sort(key=lambda x: x[1]["metrics"].get("val_loss", float("inf")))
        for meta_path, _ in entries[self.keep_top_k:]:
            meta_path.unlink(missing_ok=True)
            meta_path.with_suffix(".pt").unlink(missing_ok=True)
```

### Research Training Loop Integration

Combine all patterns into a single research-oriented training loop:

```python
# src/training/research_trainer.py
from src.training.fast_fail import FastFailDetector, FastFailConfig
from src.training.reproducibility import seed_everything
from src.training.checkpointing import CheckpointManager

def research_train(config: TrainingConfig, model, train_loader, val_loader) -> dict:
    """Research training loop with fast-fail, seeding, and checkpointing."""
    seed_everything(config.seed)

    optimizer = build_optimizer(model, config)
    scheduler = build_scheduler(optimizer, config)
    checkpoint_mgr = CheckpointManager(Path("checkpoints"), keep_top_k=3)

    # Attempt warm-start from similar config
    warmstart_ckpt = checkpoint_mgr.find_warmstart_checkpoint(vars(config))
    start_step = 0
    if warmstart_ckpt:
        ckpt_data = checkpoint_mgr.load(warmstart_ckpt, model, optimizer, scheduler)
        start_step = ckpt_data["step"]

    fast_fail = FastFailDetector(FastFailConfig(
        patience_steps=config.fast_fail_patience
    )) if config.fast_fail else None

    for step in range(start_step, config.max_steps):
        loss = train_step(model, optimizer, train_loader, config)

        # Fast-fail check
        if fast_fail:
            should_abort, reason = fast_fail.check(loss.item())
            if should_abort:
                return {"status": "aborted", "reason": reason, "step": step}

        # Periodic evaluation and checkpointing
        if step % 500 == 0 and step > 0:
            metrics = evaluate(model, val_loader)
            checkpoint_mgr.save(model, optimizer, scheduler, step, metrics, vars(config))

    final_metrics = evaluate(model, val_loader)
    return {"status": "completed", "metrics": final_metrics, "steps": config.max_steps}
```
