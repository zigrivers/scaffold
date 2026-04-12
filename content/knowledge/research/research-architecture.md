---
name: research-architecture
description: Experiment runner architecture including pluggable experiment and evaluation interfaces, state management patterns, and result persistence
topics: [research, architecture, experiment-runner, state-management, interfaces, persistence]
---

The experiment runner is the central architectural component of a research project. It orchestrates the loop of loading configuration, executing experiments, evaluating results, and deciding whether to keep or discard each run. The runner must be completely decoupled from the specific experiment logic (strategies, models, parameter spaces) so that it can drive any experiment without modification. This separation is what makes autonomous iteration possible -- the agent modifies experiment code while the runner infrastructure remains stable.

## Summary

Build the experiment runner around three pluggable interfaces: Strategy (executes an experiment given config), Evaluator (computes metrics from raw results), and Tracker (records results for comparison). Use a state manager to track the current best result, iteration history, and budget consumption. Persist all state to disk so that the runner can resume after crashes. The runner never imports specific strategy code -- it discovers strategies via a registry or config-specified entry point.

## Deep Guidance

### Core Architecture

```
                    ┌──────────────────────┐
                    │   ExperimentRunner    │
                    │  ┌────────────────┐  │
  Config ──────────►│  │ State Manager  │  │
                    │  │ (best, history)│  │
                    │  └───────┬────────┘  │
                    │          │            │
                    │  ┌───────▼────────┐  │
                    │  │ Budget Checker │  │
                    │  └───────┬────────┘  │
                    │          │            │
                    │  ┌───────▼────────┐  │
                    │  │   Strategy     │◄─┼── Registry lookup
                    │  │  (pluggable)   │  │
                    │  └───────┬────────┘  │
                    │          │            │
                    │  ┌───────▼────────┐  │
                    │  │   Evaluator    │  │
                    │  │  (pluggable)   │  │
                    │  └───────┬────────┘  │
                    │          │            │
                    │  ┌───────▼────────┐  │
                    │  │   Tracker      │  │
                    │  │  (pluggable)   │  │
                    │  └────────────────┘  │
                    └──────────────────────┘
```

### Pluggable Interface Design

The three core interfaces use Python's Protocol type for structural subtyping. This means strategies do not need to inherit from a base class -- they only need to implement the required methods:

```python
# src/interfaces.py
from typing import Protocol, Any, runtime_checkable

@runtime_checkable
class Strategy(Protocol):
    """Interface for experiment execution strategies."""

    @property
    def name(self) -> str:
        """Unique identifier for this strategy."""
        ...

    def execute(self, config: dict[str, Any]) -> dict[str, Any]:
        """
        Execute the experiment and return raw results.

        Args:
            config: Experiment configuration dict.

        Returns:
            Raw results dict. Structure is strategy-specific but must
            contain enough information for the Evaluator to compute metrics.
        """
        ...

@runtime_checkable
class Evaluator(Protocol):
    """Interface for result evaluation."""

    def evaluate(self, raw_results: dict[str, Any]) -> dict[str, float]:
        """
        Compute metrics from raw experiment results.

        Args:
            raw_results: Output from Strategy.execute().

        Returns:
            Dict mapping metric names to float values.
        """
        ...

    def is_improvement(self, current: dict[str, float],
                        best: dict[str, float]) -> bool:
        """
        Determine if current results improve on the best so far.

        Args:
            current: Metrics from the current run.
            best: Metrics from the best run so far.

        Returns:
            True if current should replace best.
        """
        ...

@runtime_checkable
class Tracker(Protocol):
    """Interface for experiment result tracking."""

    def log_run(self, run_id: str, config: dict, metrics: dict[str, float],
                artifacts: dict[str, Any] | None = None) -> None:
        """Record a single experiment run."""
        ...

    def get_history(self) -> list[dict]:
        """Return all recorded runs."""
        ...
```

### Strategy Registry

The registry pattern allows the runner to instantiate strategies by name without importing them directly:

```python
# src/strategies/registry.py
from typing import Type
from src.interfaces import Strategy

class StrategyRegistry:
    """Registry for experiment strategy classes."""

    _registry: dict[str, Type[Strategy]] = {}

    @classmethod
    def register(cls, name: str):
        """Decorator to register a strategy class."""
        def decorator(strategy_cls: Type[Strategy]):
            if name in cls._registry:
                raise ValueError(f"Strategy '{name}' already registered")
            cls._registry[name] = strategy_cls
            return strategy_cls
        return decorator

    @classmethod
    def get(cls, name: str) -> Type[Strategy]:
        """Look up a strategy by name."""
        if name not in cls._registry:
            available = ", ".join(sorted(cls._registry.keys()))
            raise KeyError(
                f"Strategy '{name}' not found. Available: {available}"
            )
        return cls._registry[name]

    @classmethod
    def list_strategies(cls) -> list[str]:
        return sorted(cls._registry.keys())


# Usage in a strategy file:
# src/strategies/momentum.py
from src.strategies.registry import StrategyRegistry

@StrategyRegistry.register("momentum_crossover")
class MomentumCrossover:
    name = "momentum_crossover"

    def __init__(self, lookback: int = 20, **kwargs):
        self.lookback = lookback

    def execute(self, config: dict) -> dict:
        # ... run the momentum crossover strategy ...
        return {"trades": trades, "equity_curve": equity}
```

### State Management

The state manager tracks the experiment loop's progress and enables resume-after-crash:

```python
# src/runner/state.py
import json
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Any

@dataclass
class RunRecord:
    """Record of a single experiment run."""
    run_id: str
    config: dict[str, Any]
    metrics: dict[str, float]
    is_best: bool = False
    decision: str = ""  # "keep" or "discard"
    reason: str = ""

@dataclass
class ExperimentState:
    """Persistent state for the experiment loop."""
    experiment_id: str
    total_runs: int = 0
    best_run: RunRecord | None = None
    history: list[RunRecord] = field(default_factory=list)
    runs_since_improvement: int = 0

    def record_run(self, run: RunRecord) -> None:
        """Record a completed run and update state."""
        self.total_runs += 1
        self.history.append(run)

        if run.is_best:
            self.best_run = run
            self.runs_since_improvement = 0
        else:
            self.runs_since_improvement += 1

    def save(self, path: Path) -> None:
        """Persist state to disk for crash recovery."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(asdict(self), f, indent=2, default=str)

    @classmethod
    def load(cls, path: Path) -> "ExperimentState":
        """Load state from disk. Returns empty state if file missing."""
        if not path.exists():
            return cls(experiment_id="unknown")
        with open(path) as f:
            data = json.load(f)
        state = cls(experiment_id=data["experiment_id"])
        state.total_runs = data["total_runs"]
        state.runs_since_improvement = data["runs_since_improvement"]
        state.history = [RunRecord(**r) for r in data["history"]]
        if data["best_run"]:
            state.best_run = RunRecord(**data["best_run"])
        return state
```

### The Experiment Runner

The runner ties the interfaces together:

```python
# src/runner/experiment_runner.py
import logging
from pathlib import Path
from src.interfaces import Strategy, Evaluator, Tracker
from src.runner.state import ExperimentState, RunRecord
from src.runner.budget import IterationBudget
from src.config import load_config
from src.seed import set_seed, capture_environment
from src.strategies.registry import StrategyRegistry

logger = logging.getLogger(__name__)

class ExperimentRunner:
    def __init__(self, config_path: str):
        self.config = load_config(config_path)
        self.experiment_id = Path(config_path).stem
        self.results_dir = Path(self.config["logging"]["results_dir"]) / self.experiment_id

        # Load pluggable components
        strategy_cls = StrategyRegistry.get(self.config["strategy"]["type"])
        self.strategy: Strategy = strategy_cls(**self.config["strategy"].get("params", {}))
        self.evaluator: Evaluator = self._build_evaluator()
        self.tracker: Tracker = self._build_tracker()
        self.budget = IterationBudget(**self.config.get("budget", {}))

        # Load or initialize state
        self.state_path = self.results_dir / "state.json"
        self.state = ExperimentState.load(self.state_path)
        self.state.experiment_id = self.experiment_id

    def run_loop(self) -> ExperimentState:
        """Run the full experiment loop until budget exhaustion or convergence."""
        logger.info("Starting experiment %s (resuming from run %d)",
                     self.experiment_id, self.state.total_runs)

        while True:
            # Check budget
            exhausted, reason = self.budget.is_exhausted(
                runs=self.state.total_runs,
                runs_since_improvement=self.state.runs_since_improvement,
            )
            if exhausted:
                logger.info("Stopping: %s", reason)
                break

            # Execute one iteration
            run_id = f"run-{self.state.total_runs + 1:04d}"
            set_seed(self.config["experiment"]["seed"] + self.state.total_runs)

            try:
                raw_results = self.strategy.execute(self.config)
                metrics = self.evaluator.evaluate(raw_results)
            except Exception as e:
                logger.error("Run %s failed: %s", run_id, e)
                continue

            # Evaluate improvement
            is_best = (
                self.state.best_run is None
                or self.evaluator.is_improvement(metrics, self.state.best_run.metrics)
            )
            decision = "keep" if is_best else "discard"

            run = RunRecord(
                run_id=run_id,
                config=self.config,
                metrics=metrics,
                is_best=is_best,
                decision=decision,
                reason=f"{'New best' if is_best else 'No improvement'}",
            )

            # Record and persist
            self.state.record_run(run)
            self.tracker.log_run(run_id, self.config, metrics)
            self.state.save(self.state_path)

            logger.info(
                "Run %s: %s (metrics: %s)",
                run_id, decision,
                {k: f"{v:.4f}" for k, v in metrics.items()},
            )

        return self.state
```

### Result Persistence

Results are persisted at two levels:

1. **Per-run**: Each run's config, metrics, and artifacts are saved to `results/{experiment_id}/{run_id}/`.
2. **Experiment state**: The full experiment state (history, best run, budget consumption) is saved to `results/{experiment_id}/state.json` after every run.

```python
# src/tracking/file_tracker.py
import json
from pathlib import Path
from src.interfaces import Tracker

class FileTracker:
    """Simple file-based experiment tracker."""

    def __init__(self, results_dir: str):
        self.results_dir = Path(results_dir)
        self.results_dir.mkdir(parents=True, exist_ok=True)

    def log_run(self, run_id: str, config: dict, metrics: dict[str, float],
                artifacts: dict | None = None) -> None:
        run_dir = self.results_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)

        with open(run_dir / "config.json", "w") as f:
            json.dump(config, f, indent=2, default=str)
        with open(run_dir / "metrics.json", "w") as f:
            json.dump(metrics, f, indent=2)

        if artifacts:
            artifact_dir = run_dir / "artifacts"
            artifact_dir.mkdir(exist_ok=True)
            for name, data in artifacts.items():
                with open(artifact_dir / name, "w") as f:
                    json.dump(data, f, indent=2, default=str)

    def get_history(self) -> list[dict]:
        runs = []
        for run_dir in sorted(self.results_dir.iterdir()):
            if run_dir.is_dir() and (run_dir / "metrics.json").exists():
                with open(run_dir / "metrics.json") as f:
                    metrics = json.load(f)
                runs.append({"run_id": run_dir.name, "metrics": metrics})
        return runs
```

### Architecture Decision: When to Use Each Driver

| Driver | Architecture Pattern | Use When |
|--------|---------------------|----------|
| Code-driven | Git state machine, agent modifies source | Exploring algorithmic variations, strategy development |
| Config-driven | Fixed runner, parameterised configs | Hyperparameter sweeps, systematic parameter search |
| API-driven | Client wrapper, parameter serialization | External backtest engines, cloud simulation APIs |
| Notebook-driven | Papermill execution, cell-level tracking | Exploratory research, visualization-heavy analysis |

The runner architecture remains the same across all drivers. What changes is the Strategy implementation: code-driven strategies contain the algorithm directly, config-driven strategies delegate to a parameterised engine, API-driven strategies wrap HTTP calls, and notebook-driven strategies use papermill to execute notebooks.
