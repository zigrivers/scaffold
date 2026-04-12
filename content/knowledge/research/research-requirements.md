---
name: research-requirements
description: Research project requirements including experiment goals, success metrics, iteration budgets, stopping criteria, and hypothesis documentation
topics: [research, requirements, experiment-goals, metrics, stopping-criteria, hypothesis]
---

Research projects differ from product engineering in a fundamental way: the requirements are not a list of features to build but a set of questions to answer. A research PRD defines the hypothesis space, the metrics that will determine success or failure, the computational and time budgets for exploration, and the stopping criteria that prevent infinite iteration. Without these constraints, autonomous experiment loops run forever and produce nothing actionable.

## Summary

Define research requirements as structured hypotheses with measurable success criteria. Establish iteration budgets (wall-clock time, compute cost, number of runs) and stopping criteria (convergence thresholds, diminishing returns, budget exhaustion) before the first experiment. Document every hypothesis with its rationale, expected outcome, and evaluation method. Use a decision log to record keep/discard decisions with justifications.

## Deep Guidance

### Hypothesis Documentation

Every research project starts with one or more hypotheses. Each hypothesis must be specific enough to be falsifiable and must specify how it will be evaluated:

```markdown
# Hypothesis Registry

## H-001: Momentum crossover with adaptive lookback
- **Statement**: A momentum crossover strategy using adaptive lookback periods
  (10-50 day range, optimised per asset) will achieve a Sharpe ratio > 1.5
  on out-of-sample data (2020-2023).
- **Rationale**: Fixed lookback periods fail to adapt to regime changes.
  Adaptive periods should capture both trending and mean-reverting regimes.
- **Success criteria**: Sharpe ratio > 1.5, max drawdown < 15%, positive
  returns in at least 3 of 4 years.
- **Evaluation method**: Walk-forward analysis with 252-day training window,
  63-day test window, no look-ahead bias.
- **Budget**: 500 experiment runs, 48 hours wall-clock time.
- **Status**: In progress
- **Decision**: [pending]
```

### Success Metrics Framework

Research metrics must distinguish between primary objectives and guardrails:

```python
# configs/metrics.py
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class MetricDefinition:
    """A single metric with its target and guardrail thresholds."""
    name: str
    direction: str  # "maximize" or "minimize"
    target: float  # Primary success threshold
    guardrail: Optional[float] = None  # Hard constraint (never violated)
    description: str = ""

@dataclass
class SuccessCriteria:
    """Complete success criteria for a research project."""
    primary: MetricDefinition  # The one metric to optimize
    secondary: list[MetricDefinition] = field(default_factory=list)
    guardrails: list[MetricDefinition] = field(default_factory=list)

    def is_success(self, results: dict[str, float]) -> bool:
        """Check if results meet all success criteria."""
        # Primary metric must meet target
        primary_val = results[self.primary.name]
        if self.primary.direction == "maximize" and primary_val < self.primary.target:
            return False
        if self.primary.direction == "minimize" and primary_val > self.primary.target:
            return False

        # All guardrails must be satisfied
        for g in self.guardrails:
            val = results[g.name]
            if g.direction == "maximize" and val < g.guardrail:
                return False
            if g.direction == "minimize" and val > g.guardrail:
                return False

        return True

# Example: trading strategy research
criteria = SuccessCriteria(
    primary=MetricDefinition(
        name="sharpe_ratio",
        direction="maximize",
        target=1.5,
        description="Risk-adjusted return on out-of-sample data",
    ),
    guardrails=[
        MetricDefinition(
            name="max_drawdown",
            direction="minimize",
            target=0.15,
            guardrail=0.25,
            description="Maximum peak-to-trough decline",
        ),
        MetricDefinition(
            name="num_trades",
            direction="maximize",
            target=100,
            guardrail=30,
            description="Minimum trades for statistical significance",
        ),
    ],
)
```

### Iteration Budgets

Unbounded iteration is the primary failure mode of research projects. Define hard limits before starting:

| Budget Type | Example Limit | Enforcement |
|-------------|--------------|-------------|
| Run count | 500 experiments | Counter in experiment runner |
| Wall-clock time | 48 hours | Watchdog timer / cron kill |
| Compute cost | $200 | Cloud billing alerts |
| Convergence patience | 50 runs without improvement | Early stopping callback |
| Human review interval | Every 100 runs | Checkpoint gate |

```python
# configs/budget.py
from dataclasses import dataclass
from datetime import timedelta

@dataclass
class IterationBudget:
    """Hard limits on experiment iteration."""
    max_runs: int = 500
    max_wall_time: timedelta = timedelta(hours=48)
    max_cost_usd: float = 200.0
    patience: int = 50  # Runs without improvement before early stop
    checkpoint_interval: int = 100  # Runs between human review gates

    def is_exhausted(self, runs: int, elapsed: timedelta, cost: float,
                     runs_since_improvement: int) -> tuple[bool, str]:
        """Check if any budget limit has been reached."""
        if runs >= self.max_runs:
            return True, f"Run limit reached ({runs}/{self.max_runs})"
        if elapsed >= self.max_wall_time:
            return True, f"Time limit reached ({elapsed})"
        if cost >= self.max_cost_usd:
            return True, f"Cost limit reached (${cost:.2f}/${self.max_cost_usd})"
        if runs_since_improvement >= self.patience:
            return True, f"Patience exhausted ({runs_since_improvement} runs without improvement)"
        return False, ""
```

### Stopping Criteria

Stopping criteria are decision functions that determine when to halt iteration. They are distinct from budget exhaustion (which is a hard stop) -- stopping criteria detect when further iteration is unlikely to help:

1. **Convergence**: The objective metric has plateaued (moving average change < epsilon for N runs).
2. **Diminishing returns**: Each successive improvement is smaller than the previous. Extrapolate the improvement curve to estimate remaining gain vs. cost.
3. **Statistical saturation**: Additional runs are not changing the confidence interval on the primary metric.
4. **Guardrail violation**: A constraint metric has entered an unacceptable range and parameter adjustments are not recovering it.

```python
import numpy as np

def detect_convergence(metric_history: list[float], window: int = 20,
                       epsilon: float = 1e-4) -> bool:
    """Detect if a metric has converged (plateau detection)."""
    if len(metric_history) < window * 2:
        return False
    recent = np.array(metric_history[-window:])
    prior = np.array(metric_history[-2 * window:-window])
    return abs(recent.mean() - prior.mean()) < epsilon

def detect_diminishing_returns(improvements: list[float],
                                min_improvement: float = 0.001) -> bool:
    """Detect if improvements are shrinking below a useful threshold."""
    if len(improvements) < 5:
        return False
    recent = improvements[-5:]
    return all(abs(imp) < min_improvement for imp in recent)
```

### Decision Log

Every keep/discard decision in the experiment loop must be logged with its rationale. This is the audit trail that makes research reproducible and reviewable:

```markdown
# Decision Log

| Run | Hypothesis | Result | Decision | Rationale |
|-----|-----------|--------|----------|-----------|
| 042 | H-001 (lookback=20) | Sharpe=1.2, DD=18% | Keep | Best Sharpe so far, DD within guardrail |
| 043 | H-001 (lookback=10) | Sharpe=0.8, DD=22% | Discard | Sharpe below baseline, high drawdown |
| 044 | H-001 (lookback=30) | Sharpe=1.3, DD=12% | Keep | New best, low drawdown |
| 045 | H-002 (mean-revert) | Sharpe=0.4, DD=8% | Discard | Sharpe far below target despite low DD |
```

### Requirements Anti-Patterns

Avoid these common failures in research project requirements:

- **Vague success criteria**: "Find a good strategy" is not testable. Specify a number.
- **No stopping criteria**: "Keep trying until it works" leads to infinite iteration.
- **Optimising too many metrics**: Pick one primary metric. Everything else is a guardrail.
- **No out-of-sample plan**: If success criteria are evaluated on training data, the project will "succeed" on noise.
- **Scope creep during iteration**: The hypothesis should be fixed before iteration starts. If you want to explore a different hypothesis, start a new experiment, don't modify the current one mid-run.
