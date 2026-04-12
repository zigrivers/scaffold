---
name: research-conventions
description: Coding conventions for research projects including experiment branching, result naming, config management, and reproducibility standards
topics: [research, conventions, git, branching, reproducibility, config-management]
---

Research code has a unique lifecycle: most code is written to be tried and discarded. A trading strategy that underperforms is reverted. A hyperparameter sweep that converges to a local minimum is abandoned. The conventions must make this try-and-discard cycle fast and safe while preserving a complete audit trail of what was tried and why it was kept or discarded.

## Summary

Use git branches as the state machine for experiment lifecycle (try, evaluate, keep/revert). Name branches, results, and configs with a consistent scheme that encodes the experiment ID, hypothesis, and timestamp. Pin every dependency and seed every random source for reproducibility. Separate experiment code (disposable) from infrastructure code (durable) in the repository structure. Use structured config files (YAML/TOML) instead of command-line argument sprawl.

## Deep Guidance

### Git as Experiment State Machine

The experiment loop uses git as its state management layer. Each experiment run is a branch. The decision to keep or discard is a merge or branch deletion:

```
main (stable baseline)
  |
  +-- exp/001-momentum-lookback-20  (try → evaluate → keep → merge)
  |
  +-- exp/002-momentum-lookback-10  (try → evaluate → discard → delete)
  |
  +-- exp/003-mean-revert-rsi       (try → evaluate → keep → merge)
```

**Branch naming convention**: `exp/{NNN}-{short-description}`
- `NNN`: Zero-padded sequential experiment number
- `short-description`: Kebab-case summary of what is being tested
- Examples: `exp/001-adaptive-lookback`, `exp/042-ensemble-top3`

**Workflow**:
```bash
# Start a new experiment
git checkout main
git checkout -b exp/015-rsi-threshold-sweep

# ... agent modifies code, runs experiment ...

# Experiment succeeded — merge to main
git checkout main
git merge --no-ff exp/015-rsi-threshold-sweep -m "exp/015: RSI threshold 30/70 Sharpe=1.6"

# Experiment failed — discard
git branch -D exp/015-rsi-threshold-sweep
# Or keep for reference:
git tag archive/exp/015-rsi-threshold-sweep exp/015-rsi-threshold-sweep
git branch -D exp/015-rsi-threshold-sweep
```

**Commit message convention for experiments**:
```
exp/015: RSI threshold sweep

Hypothesis: RSI overbought/oversold thresholds of 30/70 will outperform
the default 20/80 on 2020-2023 equity data.

Result: Sharpe=1.6, MaxDD=11%, 247 trades
Decision: KEEP — new best by Sharpe, DD within guardrail
```

### Result Naming

Every experiment run produces artifacts. Use a consistent naming scheme:

```
results/
  exp-001/
    config.yml          # Exact config used for this run
    metrics.json        # Final metrics
    metrics_history.csv # Per-iteration metrics
    artifacts/          # Model checkpoints, plots, etc.
    log.txt             # Full stdout/stderr
  exp-002/
    ...
```

**File naming rules**:
- Directories: `exp-{NNN}` matching the git branch number
- Timestamps in filenames when multiple runs share an experiment: `exp-001-20240315T143022`
- Never use spaces or special characters in result paths
- Metrics files are always JSON (machine-readable) or CSV (tabular)

### Config Management

Research projects accumulate dozens of configuration parameters. Manage them with structured config files, not argument sprawl:

```yaml
# configs/base.yml — shared defaults
experiment:
  seed: 42
  num_runs: 100
  patience: 20

data:
  source: "data/prices.parquet"
  train_start: "2015-01-01"
  train_end: "2019-12-31"
  test_start: "2020-01-01"
  test_end: "2023-12-31"

logging:
  level: INFO
  results_dir: "results"
```

```yaml
# configs/exp-015-rsi-sweep.yml — experiment-specific overrides
_base_: base.yml

strategy:
  type: "rsi_threshold"
  params:
    overbought: 70
    oversold: 30
    lookback: 14

experiment:
  num_runs: 200  # Override base
```

**Config loading pattern** (merge base + override):

```python
# src/config.py
import yaml
from pathlib import Path
from typing import Any

def load_config(config_path: str) -> dict[str, Any]:
    """Load config with base inheritance."""
    with open(config_path) as f:
        config = yaml.safe_load(f)

    # Resolve base config inheritance
    if "_base_" in config:
        base_path = Path(config_path).parent / config.pop("_base_")
        base = load_config(str(base_path))
        base = deep_merge(base, config)
        return base

    return config

def deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge override into base."""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result
```

### Reproducibility Standards

Every experiment must be reproducible. This means another researcher (or the same agent in a future session) can re-run the experiment and get the same result:

**Mandatory reproducibility checklist**:

1. **Seed everything**: Random number generators, data shuffling, model initialization.
   ```python
   import random
   import numpy as np

   def set_seed(seed: int) -> None:
       random.seed(seed)
       np.random.seed(seed)
       # Framework-specific seeding
       try:
           import torch
           torch.manual_seed(seed)
           torch.cuda.manual_seed_all(seed)
           torch.backends.cudnn.deterministic = True
           torch.backends.cudnn.benchmark = False
       except ImportError:
           pass
   ```

2. **Pin dependencies**: Use exact versions, not ranges.
   ```
   # requirements.txt — pinned
   numpy==1.26.4
   pandas==2.2.1
   scikit-learn==1.4.1
   optuna==3.5.0
   ```

3. **Record environment**: Capture the full environment at experiment start.
   ```python
   import subprocess
   import platform
   import json

   def capture_environment() -> dict:
       return {
           "python": platform.python_version(),
           "platform": platform.platform(),
           "pip_freeze": subprocess.check_output(
               ["pip", "freeze"], text=True
           ).strip().split("\n"),
           "git_sha": subprocess.check_output(
               ["git", "rev-parse", "HEAD"], text=True
           ).strip(),
           "git_dirty": bool(subprocess.check_output(
               ["git", "status", "--porcelain"], text=True
           ).strip()),
       }
   ```

4. **Never modify data in place**: Raw data is immutable. Processed data is derived and can be regenerated from raw data + processing code.

5. **Config-as-code**: The experiment config file (committed to git) must fully define the experiment. No "I changed that parameter manually."

### Code Organization Conventions

Separate durable infrastructure code from disposable experiment code:

| Category | Location | Lifecycle |
|----------|----------|-----------|
| Experiment runner | `src/runner/` | Durable — rarely changes |
| Evaluation framework | `src/evaluation/` | Durable — rarely changes |
| Data loading | `src/data/` | Durable — rarely changes |
| Strategy/model code | `src/strategies/` or `src/models/` | Disposable — changes every experiment |
| Config files | `configs/` | Per-experiment |
| Results | `results/` | Per-experiment output |

**Import hygiene**: Experiment code imports from infrastructure code, never the reverse. The runner does not import specific strategies -- it discovers them via a registry or config-specified entry point.

### Code Style for Research

- **Type hints everywhere**: Even in experiment code. Catches bugs early in a fast-iteration cycle.
- **Docstrings on public functions**: Especially for metric computation (document the formula).
- **No notebooks in git**: Notebooks are for interactive exploration. Convert to scripts before committing. If notebook-driven experiments are required, use `nbstripout` to strip outputs before committing.
- **Linting**: Use `ruff` for fast linting. Research code skips some style rules (unused imports during exploration) but enforces correctness rules (undefined variables, type errors).

```toml
# pyproject.toml
[tool.ruff]
line-length = 100
select = ["E", "F", "W", "I"]  # Errors, pyflakes, warnings, isort
ignore = ["E501"]  # Allow long lines in research code

[tool.ruff.lint.isort]
known-first-party = ["src"]
```
