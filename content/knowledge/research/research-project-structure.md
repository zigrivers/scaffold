---
name: research-project-structure
description: Directory structure for research projects including src, experiments, results, configs, data, and notebooks organization
topics: [research, project-structure, directory-layout, organization]
---

Research projects have a dual structure that traditional software projects do not: a stable infrastructure layer (the experiment runner, evaluation framework, and data pipeline) and a volatile experiment layer (strategies, models, configs, and results) that changes with every iteration. The directory structure must make this distinction explicit so that the experiment loop can modify volatile files without risk of corrupting the infrastructure.

## Summary

Organize research projects into six top-level directories: `src/` (durable infrastructure code), `configs/` (experiment configuration files), `data/` (raw and processed datasets), `results/` (experiment outputs, gitignored), `notebooks/` (exploratory analysis, optional), and `tests/` (test suite). Within `src/`, separate the runner/evaluation framework from experiment-specific code (strategies, models). Use a flat experiment numbering scheme for configs and results to maintain a clear audit trail.

## Deep Guidance

### Canonical Directory Structure

```
project-root/
  src/
    __init__.py
    runner/                   # Experiment execution engine
      __init__.py
      experiment_runner.py    # Main loop: load config -> execute -> evaluate -> record
      state.py                # Run state management (current best, history)
      budget.py               # Budget tracking and enforcement
    evaluation/               # Evaluation framework
      __init__.py
      evaluator.py            # Metric computation
      validators.py           # Result validation (guardrails, sanity checks)
      statistical.py          # Statistical significance tests
    data/                     # Data loading and preprocessing
      __init__.py
      loader.py               # Data loading from various sources
      transforms.py           # Data preprocessing transforms
      splitter.py             # Train/validation/test splitting
    strategies/               # Experiment-specific code (volatile)
      __init__.py
      base.py                 # Strategy interface (abstract base class)
      registry.py             # Strategy discovery and registration
      momentum.py             # Example: momentum strategy
      mean_revert.py          # Example: mean reversion strategy
    tracking/                 # Experiment tracking integration
      __init__.py
      tracker.py              # Result logging interface
      comparison.py           # Run comparison utilities
    config.py                 # Config loading and validation
    seed.py                   # Reproducibility utilities (seeding, env capture)
  configs/
    base.yml                  # Shared defaults
    exp-001-momentum.yml      # Per-experiment config overrides
    exp-002-mean-revert.yml
    sweeps/                   # Parameter sweep definitions
      sweep-lookback.yml
  data/
    raw/                      # Immutable source data (gitignored if large)
      prices.parquet
      fundamentals.csv
    processed/                # Derived data (gitignored, regenerated from raw + code)
      features.parquet
    README.md                 # Data provenance documentation
  results/                    # Experiment outputs (gitignored)
    exp-001/
      config.yml              # Frozen config snapshot
      metrics.json            # Final metrics
      metrics_history.csv     # Per-iteration metrics
      environment.json        # Environment snapshot
      artifacts/              # Checkpoints, plots, serialized models
      log.txt                 # Full stdout/stderr
    exp-002/
      ...
    comparison/               # Cross-experiment analysis
      leaderboard.csv
  notebooks/                  # Exploratory analysis (optional)
    01-data-exploration.ipynb
    02-result-analysis.ipynb
  tests/
    __init__.py
    test_runner.py            # Experiment runner tests
    test_evaluation.py        # Evaluator tests
    test_data.py              # Data pipeline tests
    test_strategies.py        # Strategy interface conformance tests
    test_reproducibility.py   # Seed and determinism tests
    fixtures/                 # Test data fixtures
      small_prices.csv
      expected_metrics.json
  pyproject.toml              # Project config and dependencies
  Makefile                    # Common commands
  README.md                   # Project overview
  .gitignore                  # Ignore results/, data/raw/ (if large), data/processed/
```

### Directory Responsibilities

**`src/runner/`** -- The experiment execution engine. This is the most durable code in the project. It implements the core loop (load config, instantiate strategy, execute, evaluate, record) and never contains experiment-specific logic. The runner discovers strategies via a registry pattern:

```python
# src/runner/experiment_runner.py
from src.strategies.registry import StrategyRegistry
from src.evaluation.evaluator import Evaluator
from src.tracking.tracker import ExperimentTracker
from src.config import load_config
from src.seed import set_seed, capture_environment

class ExperimentRunner:
    def __init__(self, config_path: str):
        self.config = load_config(config_path)
        self.evaluator = Evaluator(self.config)
        self.tracker = ExperimentTracker(self.config)

    def run(self) -> dict:
        set_seed(self.config["experiment"]["seed"])
        env = capture_environment()
        self.tracker.log_environment(env)
        self.tracker.log_config(self.config)

        # Strategy is loaded by name from config, not hardcoded
        strategy_cls = StrategyRegistry.get(self.config["strategy"]["type"])
        strategy = strategy_cls(**self.config["strategy"]["params"])

        # Execute experiment
        raw_results = strategy.execute(self.config)

        # Evaluate
        metrics = self.evaluator.evaluate(raw_results)

        # Record
        self.tracker.log_metrics(metrics)
        self.tracker.save_artifacts(raw_results)

        return metrics
```

**`src/strategies/`** -- Volatile code that changes every experiment. Each strategy implements a common interface:

```python
# src/strategies/base.py
from abc import ABC, abstractmethod
from typing import Any

class BaseStrategy(ABC):
    """Interface that all experiment strategies must implement."""

    @abstractmethod
    def execute(self, config: dict[str, Any]) -> Any:
        """Run the experiment and return raw results."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique strategy identifier."""
        ...
```

**`configs/`** -- One YAML file per experiment. The base config provides defaults. Experiment configs override only what changes. This makes it trivial to diff two experiments and see exactly what was different.

**`data/`** -- Two subdirectories: `raw/` (immutable source data, gitignored if large, documented in `README.md`) and `processed/` (always gitignored, regenerated by running the data pipeline). Never modify files in `raw/`.

**`results/`** -- Entirely gitignored. Each experiment run creates a numbered subdirectory with a frozen config snapshot, metrics, and artifacts. The `comparison/` subdirectory holds cross-experiment analysis (leaderboards, comparison plots).

**`notebooks/`** -- Optional. Used for interactive exploration and result analysis, not for experiment execution. Notebooks are not part of the experiment loop. If using notebook-driven experiments, notebooks live here but are executed programmatically by the runner.

### Gitignore Strategy

```gitignore
# Results — per-run outputs, not committed
results/

# Processed data — derived, regenerated from raw + code
data/processed/

# Raw data — gitignored if large, documented in data/README.md
# data/raw/*.parquet
# data/raw/*.csv

# Notebook outputs
notebooks/.ipynb_checkpoints/
*.ipynb  # Use nbstripout if committing notebooks

# Python artifacts
__pycache__/
*.pyc
.venv/
dist/
*.egg-info/

# IDE
.vscode/
.idea/
```

### Config-Driven vs. Code-Driven Structures

The directory structure adapts slightly based on the experiment driver:

**Code-driven** (agent modifies source files):
- `src/strategies/` contains the code the agent modifies
- Git branch per experiment captures the code changes
- Results include a diff of what the agent changed

**Config-driven** (agent generates config files):
- `configs/sweeps/` contains generated sweep configurations
- `src/strategies/` contains a single parameterised strategy
- The agent modifies configs only, never strategy source code

**API-driven** (agent calls an external API):
- `src/strategies/` contains API client wrappers
- `configs/` contains parameter sets sent to the API
- Results include API request/response logs

**Notebook-driven** (agent generates/edits notebooks):
- `notebooks/experiments/` contains generated experiment notebooks
- `src/runner/` includes a notebook execution engine (e.g., `papermill`)
- Results include executed notebook HTML exports

### Scaling: When the Project Grows

For projects with more than ~20 strategies or multiple research domains:

```
src/strategies/
  momentum/
    __init__.py
    adaptive_lookback.py
    crossover.py
    rsi_threshold.py
  mean_reversion/
    __init__.py
    bollinger.py
    pairs.py
  ensemble/
    __init__.py
    top_n_vote.py
    stacking.py
```

Group strategies by family when the flat list exceeds ~10 files. The registry pattern means the runner does not need to change when strategies are reorganized.

### Makefile Targets for Research

```makefile
.PHONY: run evaluate compare clean

run:  ## Run experiment from config
	python -m src.runner.experiment_runner --config $(CONFIG)

evaluate:  ## Re-evaluate results without re-running
	python -m src.evaluation.evaluator --results-dir $(RESULTS_DIR)

compare:  ## Compare experiment results
	python -m src.tracking.comparison --experiments $(EXPERIMENTS)

clean-results:  ## Remove all experiment results
	rm -rf results/*/

process-data:  ## Regenerate processed data from raw
	python -m src.data.loader --output data/processed/

test:  ## Run test suite
	pytest tests/ -v

lint:  ## Lint source code
	ruff check src/ tests/
```
