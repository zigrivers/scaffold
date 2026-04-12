---
name: research-overfitting-prevention
description: Out-of-sample validation, cross-validation strategies, statistical significance testing, and when to stop iterating to prevent overfitting
topics: [research, overfitting, validation, cross-validation, statistical-significance, out-of-sample]
---

Overfitting is the central risk of iterative research. Every time an agent evaluates a hypothesis against data and uses the result to guide the next hypothesis, it is implicitly fitting to that data. After hundreds of iterations, even random strategies will appear to perform well on the evaluation set -- this is multiple comparisons bias. Preventing overfitting requires rigorous separation of training and evaluation data, statistical significance testing, and disciplined stopping criteria.

## Summary

Split data into train, validation, and holdout sets. Use the validation set for iteration decisions (keep/discard) and reserve the holdout set for final evaluation only -- never let the holdout set influence any iteration decision. Apply cross-validation for small datasets. Use statistical significance tests (permutation tests, bootstrap confidence intervals) to verify that results are real, not noise. Stop iterating when the improvement per iteration falls below the noise floor.

## Deep Guidance

### Data Splitting for Research

The data split for research projects has three levels, not two:

```
┌─────────────────────────────────────────────────┐
│                 Full Dataset                     │
├──────────────────┬────────────┬─────────────────┤
│   Training Set   │ Validation │   Holdout Set   │
│   (60-70%)       │  (15-20%)  │   (15-20%)      │
├──────────────────┼────────────┼─────────────────┤
│ Strategy learns  │ Keep/discard│ Final eval ONLY │
│ from this data   │ decisions   │ Touch once      │
└──────────────────┴────────────┴─────────────────┘
```

**Critical rule**: The holdout set is touched exactly once -- at the very end of the research project, to report final results. If the holdout set is used to make any iteration decision, it becomes a validation set and loses its value.

```python
# src/data/splitter.py
import numpy as np
from dataclasses import dataclass
from typing import Any

@dataclass
class DataSplit:
    """Three-way data split for research projects."""
    train: Any
    validation: Any
    holdout: Any

def temporal_split(data: np.ndarray, train_frac: float = 0.6,
                   val_frac: float = 0.2) -> DataSplit:
    """
    Temporal split for time-series data.
    MUST be chronological -- never shuffle time-series data.
    """
    n = len(data)
    train_end = int(n * train_frac)
    val_end = int(n * (train_frac + val_frac))

    return DataSplit(
        train=data[:train_end],
        validation=data[train_end:val_end],
        holdout=data[val_end:],
    )

def random_split(data: np.ndarray, train_frac: float = 0.6,
                 val_frac: float = 0.2, seed: int = 42) -> DataSplit:
    """
    Random split for non-temporal data.
    Use when data points are independent (no time ordering).
    """
    rng = np.random.default_rng(seed)
    indices = rng.permutation(len(data))
    n = len(data)
    train_end = int(n * train_frac)
    val_end = int(n * (train_frac + val_frac))

    return DataSplit(
        train=data[indices[:train_end]],
        validation=data[indices[train_end:val_end]],
        holdout=data[indices[val_end:]],
    )
```

### Walk-Forward Validation (Time Series)

For time-series research (trading strategies, forecasting), use walk-forward validation instead of random cross-validation:

```python
# src/evaluation/walk_forward.py
import numpy as np
from dataclasses import dataclass

@dataclass
class WalkForwardWindow:
    train_start: int
    train_end: int
    test_start: int
    test_end: int

def walk_forward_splits(n_samples: int, train_window: int,
                        test_window: int, step: int | None = None
                        ) -> list[WalkForwardWindow]:
    """
    Generate walk-forward validation windows.

    Produces rolling train/test splits that move forward in time:
      [train_0][test_0]
         [train_1][test_1]
            [train_2][test_2]
    """
    if step is None:
        step = test_window

    windows = []
    start = 0
    while start + train_window + test_window <= n_samples:
        windows.append(WalkForwardWindow(
            train_start=start,
            train_end=start + train_window,
            test_start=start + train_window,
            test_end=start + train_window + test_window,
        ))
        start += step

    return windows

def walk_forward_evaluate(strategy, data, train_window: int = 252,
                          test_window: int = 63) -> list[dict]:
    """
    Evaluate a strategy using walk-forward analysis.
    Returns metrics for each window.
    """
    windows = walk_forward_splits(len(data), train_window, test_window)
    results = []
    for w in windows:
        train_data = data[w.train_start:w.train_end]
        test_data = data[w.test_start:w.test_end]

        strategy.fit(train_data)
        metrics = strategy.evaluate(test_data)
        results.append({
            "window": f"{w.test_start}-{w.test_end}",
            **metrics,
        })

    return results
```

### Cross-Validation for Small Datasets

When the dataset is too small for a three-way split, use k-fold cross-validation on the train+validation portion, keeping the holdout untouched:

```python
# src/evaluation/cross_validation.py
import numpy as np

def stratified_kfold_evaluate(strategy_factory, data, labels,
                               k: int = 5, seed: int = 42) -> dict:
    """
    K-fold cross-validation with stratified splits.
    Returns mean and std of metrics across folds.
    """
    rng = np.random.default_rng(seed)
    indices = rng.permutation(len(data))
    fold_size = len(data) // k

    all_metrics = []
    for i in range(k):
        test_idx = indices[i * fold_size:(i + 1) * fold_size]
        train_idx = np.concatenate([
            indices[:i * fold_size],
            indices[(i + 1) * fold_size:],
        ])

        strategy = strategy_factory()  # Fresh instance per fold
        strategy.fit(data[train_idx], labels[train_idx])
        metrics = strategy.evaluate(data[test_idx], labels[test_idx])
        all_metrics.append(metrics)

    # Aggregate across folds
    metric_names = all_metrics[0].keys()
    return {
        name: {
            "mean": np.mean([m[name] for m in all_metrics]),
            "std": np.std([m[name] for m in all_metrics]),
            "per_fold": [m[name] for m in all_metrics],
        }
        for name in metric_names
    }
```

### Statistical Significance Testing

After hundreds of iterations, a strategy that appears to beat the baseline may be a statistical artifact. Test significance before accepting:

```python
# src/evaluation/statistical.py
import numpy as np

def permutation_test(strategy_returns: np.ndarray, baseline_returns: np.ndarray,
                     n_permutations: int = 10000, seed: int = 42) -> dict:
    """
    Permutation test for difference in mean returns.
    Tests H0: strategy and baseline come from the same distribution.
    """
    rng = np.random.default_rng(seed)
    observed_diff = strategy_returns.mean() - baseline_returns.mean()

    combined = np.concatenate([strategy_returns, baseline_returns])
    n_strategy = len(strategy_returns)

    count_extreme = 0
    for _ in range(n_permutations):
        perm = rng.permutation(combined)
        perm_diff = perm[:n_strategy].mean() - perm[n_strategy:].mean()
        if perm_diff >= observed_diff:
            count_extreme += 1

    p_value = (count_extreme + 1) / (n_permutations + 1)

    return {
        "observed_difference": float(observed_diff),
        "p_value": float(p_value),
        "significant_at_005": p_value < 0.05,
        "significant_at_001": p_value < 0.01,
        "n_permutations": n_permutations,
    }

def bootstrap_confidence_interval(values: np.ndarray, statistic=np.mean,
                                   confidence: float = 0.95,
                                   n_bootstrap: int = 10000,
                                   seed: int = 42) -> dict:
    """
    Bootstrap confidence interval for a statistic.
    Use to estimate uncertainty on experiment metrics.
    """
    rng = np.random.default_rng(seed)
    bootstrap_stats = []
    for _ in range(n_bootstrap):
        sample = rng.choice(values, size=len(values), replace=True)
        bootstrap_stats.append(statistic(sample))

    bootstrap_stats = np.array(bootstrap_stats)
    alpha = (1 - confidence) / 2
    lower = np.percentile(bootstrap_stats, 100 * alpha)
    upper = np.percentile(bootstrap_stats, 100 * (1 - alpha))

    return {
        "point_estimate": float(statistic(values)),
        "lower": float(lower),
        "upper": float(upper),
        "confidence": confidence,
    }
```

### Multiple Comparisons Correction

When testing many hypotheses, the probability of at least one false positive increases. Correct for this:

```python
def bonferroni_threshold(base_alpha: float, n_comparisons: int) -> float:
    """
    Bonferroni correction: divide alpha by number of comparisons.
    Conservative but simple.
    """
    return base_alpha / n_comparisons

def holm_bonferroni(p_values: list[float], alpha: float = 0.05) -> list[bool]:
    """
    Holm-Bonferroni step-down procedure.
    Less conservative than Bonferroni while controlling family-wise error.
    """
    n = len(p_values)
    sorted_indices = np.argsort(p_values)
    sorted_pvals = np.array(p_values)[sorted_indices]

    significant = [False] * n
    for i, (idx, pval) in enumerate(zip(sorted_indices, sorted_pvals)):
        adjusted_alpha = alpha / (n - i)
        if pval <= adjusted_alpha:
            significant[idx] = True
        else:
            break  # Stop at first non-rejection

    return significant
```

### When to Stop Iterating

Practical decision framework:

| Signal | Action | Example |
|--------|--------|---------|
| Primary metric met target | Stop, run holdout eval | Sharpe > 1.5 on validation |
| Convergence detected | Stop, run holdout eval | Mean Sharpe unchanged for 50 runs |
| Budget exhausted | Stop, report best result | 500 runs completed |
| All improvements not significant | Stop, report negative result | p > 0.05 for all improvements |
| Validation improving but train degrading | Investigate -- possible bug | Opposite curves on train/val |
| Holdout result much worse than validation | Report overfitting, do not deploy | Sharpe 1.5 val, 0.3 holdout |

### Overfitting Red Flags

Watch for these warning signs during iteration:

1. **Validation metric much better than cross-validation mean**: The specific validation split may be easy. Use CV to get a robust estimate.
2. **Improvement from many small parameters**: Complex models with many tuned parameters are more likely to overfit than simple models.
3. **Results sensitive to data ordering**: If shuffling the validation set changes the result significantly, the sample size is too small.
4. **Monotonically improving metrics across iterations**: Real research has noise. If every iteration is better than the last, something is leaking.
5. **Results do not replicate across time periods**: A strategy that works on 2020-2022 but fails on 2023 is likely overfit to the training period.
