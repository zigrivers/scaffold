---
name: research-ml-evaluation
description: Research evaluation patterns including ablation studies, statistical significance testing, multiple comparison correction, effect sizes, learning curve analysis, and efficiency frontiers
topics: [research, ml-research, evaluation, ablation, significance, bootstrap, bonferroni, effect-size, learning-curve, pareto]
---

Research evaluation differs fundamentally from production ML evaluation. In production, you measure a single model on held-out data and report aggregate metrics. In research, you compare multiple methods, ablate components to understand contributions, test whether differences are statistically significant rather than due to random variation, and characterize the efficiency frontier (what accuracy is achievable at what compute cost). Reporting a number without confidence intervals, without significance testing against baselines, and without ablations is not research evaluation -- it is anecdote.

## Summary

Evaluate research results with statistical rigor: run multiple seeds per configuration and report mean with confidence intervals, use paired statistical tests (paired t-test, Wilcoxon signed-rank, bootstrap) to determine whether improvements are significant, apply multiple comparison correction (Bonferroni, Holm-Bonferroni) when comparing against many baselines, report effect sizes (Cohen's d) alongside p-values, conduct systematic ablation studies to attribute performance to specific components, analyze learning curves to understand sample efficiency, and plot efficiency frontiers (accuracy vs compute) to characterize the cost-performance tradeoff.

## Deep Guidance

### Ablation Studies

Ablations remove or disable one component at a time to measure its contribution. Without ablations, you cannot claim which parts of your method actually matter:

```python
# src/evaluation/ablation.py
from dataclasses import dataclass, field
from typing import Any, Callable

@dataclass
class AblationConfig:
    """Define what components to ablate."""
    full_config: dict[str, Any]  # The complete config (baseline)
    ablation_map: dict[str, Any] = field(default_factory=dict)
    # Maps component name -> value that disables it
    # e.g., {"attention": False, "residual": False, "dropout": 0.0}

@dataclass
class AblationResult:
    component_removed: str
    full_score: float
    ablated_score: float

    @property
    def contribution(self) -> float:
        """How much this component contributes to performance."""
        return self.full_score - self.ablated_score

    @property
    def relative_contribution(self) -> float:
        """Contribution as a fraction of total performance."""
        if self.full_score == 0:
            return 0.0
        return self.contribution / self.full_score

def run_ablation_study(
    full_config: dict[str, Any],
    ablation_map: dict[str, Any],
    train_and_eval_fn: Callable[[dict], float],
    n_seeds: int = 5,
) -> list[AblationResult]:
    """Run complete ablation study with multiple seeds."""
    import numpy as np

    # Evaluate full model
    full_scores = [
        train_and_eval_fn({**full_config, "seed": seed})
        for seed in range(n_seeds)
    ]
    full_mean = np.mean(full_scores)

    results = []
    for component, disabled_value in ablation_map.items():
        # Create config with this component disabled
        ablated_config = {**full_config, component: disabled_value}
        ablated_scores = [
            train_and_eval_fn({**ablated_config, "seed": seed})
            for seed in range(n_seeds)
        ]
        ablated_mean = np.mean(ablated_scores)
        results.append(AblationResult(
            component_removed=component,
            full_score=full_mean,
            ablated_score=ablated_mean,
        ))

    # Sort by contribution (most important first)
    results.sort(key=lambda r: r.contribution, reverse=True)
    return results
```

### Statistical Significance Testing

Never report that method A outperforms method B without testing statistical significance. A difference of 0.5% accuracy on a single seed is noise, not signal:

```python
# src/evaluation/significance.py
import numpy as np
from scipy import stats
from dataclasses import dataclass

@dataclass
class SignificanceResult:
    test_name: str
    statistic: float
    p_value: float
    is_significant: bool  # At the given alpha level
    alpha: float
    effect_size: float  # Cohen's d
    confidence_interval: tuple[float, float]

def paired_t_test(
    scores_a: list[float],
    scores_b: list[float],
    alpha: float = 0.05,
) -> SignificanceResult:
    """Paired t-test for comparing two methods across the same seeds/folds."""
    assert len(scores_a) == len(scores_b), "Must have paired observations"
    a = np.array(scores_a)
    b = np.array(scores_b)

    statistic, p_value = stats.ttest_rel(a, b)
    effect_size = cohens_d_paired(a, b)

    # Confidence interval on the mean difference
    diff = a - b
    ci = stats.t.interval(
        1 - alpha,
        df=len(diff) - 1,
        loc=np.mean(diff),
        scale=stats.sem(diff),
    )

    return SignificanceResult(
        test_name="paired_t_test",
        statistic=statistic,
        p_value=p_value,
        is_significant=p_value < alpha,
        alpha=alpha,
        effect_size=effect_size,
        confidence_interval=ci,
    )

def bootstrap_ci(
    scores_a: list[float],
    scores_b: list[float],
    n_bootstrap: int = 10000,
    alpha: float = 0.05,
) -> SignificanceResult:
    """Bootstrap confidence interval for the difference in means."""
    a = np.array(scores_a)
    b = np.array(scores_b)
    observed_diff = np.mean(a) - np.mean(b)

    rng = np.random.default_rng(42)
    bootstrap_diffs = []
    n = len(a)
    for _ in range(n_bootstrap):
        idx = rng.integers(0, n, size=n)
        bootstrap_diffs.append(np.mean(a[idx]) - np.mean(b[idx]))

    bootstrap_diffs = np.array(bootstrap_diffs)
    ci_low = np.percentile(bootstrap_diffs, 100 * alpha / 2)
    ci_high = np.percentile(bootstrap_diffs, 100 * (1 - alpha / 2))

    # Significant if CI does not contain 0
    is_significant = ci_low > 0 or ci_high < 0

    return SignificanceResult(
        test_name="bootstrap_ci",
        statistic=observed_diff,
        p_value=np.mean(bootstrap_diffs <= 0) if observed_diff > 0 else np.mean(bootstrap_diffs >= 0),
        is_significant=is_significant,
        alpha=alpha,
        effect_size=cohens_d_paired(a, b),
        confidence_interval=(ci_low, ci_high),
    )

def cohens_d_paired(a: np.ndarray, b: np.ndarray) -> float:
    """Cohen's d for paired samples."""
    diff = a - b
    return np.mean(diff) / np.std(diff, ddof=1)
```

### Multiple Comparison Correction

When comparing against multiple baselines, the probability of at least one false positive grows. Correct for this:

```python
# src/evaluation/multiple_comparisons.py
import numpy as np

def bonferroni_correction(p_values: list[float], alpha: float = 0.05) -> list[bool]:
    """Bonferroni correction: divide alpha by number of comparisons."""
    adjusted_alpha = alpha / len(p_values)
    return [p < adjusted_alpha for p in p_values]

def holm_bonferroni(p_values: list[float], alpha: float = 0.05) -> list[bool]:
    """Holm-Bonferroni step-down procedure (more powerful than Bonferroni)."""
    n = len(p_values)
    # Sort p-values and track original indices
    indexed = sorted(enumerate(p_values), key=lambda x: x[1])
    significant = [False] * n

    for rank, (orig_idx, p) in enumerate(indexed):
        adjusted_alpha = alpha / (n - rank)
        if p < adjusted_alpha:
            significant[orig_idx] = True
        else:
            # Once we fail to reject, stop (step-down)
            break

    return significant

def format_comparison_table(
    method_names: list[str],
    scores: list[list[float]],  # [method][seed]
    baseline_idx: int = 0,
    alpha: float = 0.05,
) -> str:
    """Format a comparison table with significance markers."""
    from src.evaluation.significance import paired_t_test

    baseline_scores = scores[baseline_idx]
    lines = [f"{'Method':<20} {'Mean':>8} {'Std':>8} {'vs Baseline':>12} {'Sig?':>6}"]
    lines.append("-" * 60)

    p_values = []
    results = []
    for i, (name, method_scores) in enumerate(zip(method_names, scores)):
        mean = np.mean(method_scores)
        std = np.std(method_scores)
        if i == baseline_idx:
            lines.append(f"{name:<20} {mean:>8.4f} {std:>8.4f} {'(baseline)':>12} {'---':>6}")
            continue
        result = paired_t_test(method_scores, baseline_scores, alpha)
        p_values.append(result.p_value)
        results.append((name, mean, std, result))

    # Apply Holm-Bonferroni correction
    corrected = holm_bonferroni(p_values, alpha)
    for (name, mean, std, result), is_sig in zip(results, corrected):
        diff = mean - np.mean(baseline_scores)
        sig_marker = "*" if is_sig else ""
        lines.append(
            f"{name:<20} {mean:>8.4f} {std:>8.4f} {diff:>+12.4f} {sig_marker:>6}"
        )

    return "\n".join(lines)
```

### Effect Sizes

P-values tell you whether a difference exists; effect sizes tell you whether it matters:

```python
# src/evaluation/effect_size.py
import numpy as np

def interpret_cohens_d(d: float) -> str:
    """Interpret Cohen's d magnitude (Cohen 1988 conventions)."""
    abs_d = abs(d)
    if abs_d < 0.2:
        return "negligible"
    elif abs_d < 0.5:
        return "small"
    elif abs_d < 0.8:
        return "medium"
    else:
        return "large"

def common_language_effect(scores_a: list[float], scores_b: list[float]) -> float:
    """Probability that a random score from A exceeds a random score from B."""
    a = np.array(scores_a)
    b = np.array(scores_b)
    count = sum(1 for ai in a for bi in b if ai > bi)
    ties = sum(1 for ai in a for bi in b if ai == bi)
    return (count + 0.5 * ties) / (len(a) * len(b))
```

### Learning Curve Analysis

Learning curves reveal sample efficiency -- how much data a method needs to reach a given performance level:

```python
# src/evaluation/learning_curves.py
import numpy as np
from dataclasses import dataclass

@dataclass
class LearningCurvePoint:
    train_size: int
    train_score: float
    val_score: float
    train_score_std: float
    val_score_std: float

def compute_learning_curve(
    train_and_eval_fn,
    total_samples: int,
    fractions: list[float] | None = None,
    n_seeds: int = 5,
) -> list[LearningCurvePoint]:
    """Compute learning curve at multiple dataset sizes."""
    if fractions is None:
        fractions = [0.1, 0.2, 0.3, 0.5, 0.7, 1.0]

    points = []
    for frac in fractions:
        train_size = int(total_samples * frac)
        train_scores = []
        val_scores = []

        for seed in range(n_seeds):
            result = train_and_eval_fn(train_size=train_size, seed=seed)
            train_scores.append(result["train_score"])
            val_scores.append(result["val_score"])

        points.append(LearningCurvePoint(
            train_size=train_size,
            train_score=np.mean(train_scores),
            val_score=np.mean(val_scores),
            train_score_std=np.std(train_scores),
            val_score_std=np.std(val_scores),
        ))

    return points

def extrapolate_performance(
    curve: list[LearningCurvePoint],
    target_score: float,
) -> int | None:
    """Estimate how many samples are needed to reach target score.

    Uses power-law extrapolation: score = a - b * n^(-c)
    """
    from scipy.optimize import curve_fit

    sizes = np.array([p.train_size for p in curve])
    scores = np.array([p.val_score for p in curve])

    def power_law(n, a, b, c):
        return a - b * np.power(n, -c)

    try:
        params, _ = curve_fit(power_law, sizes, scores, p0=[1.0, 1.0, 0.5], maxfev=5000)
        a, b, c = params
        if target_score >= a:
            return None  # Asymptote is below target
        needed = (b / (a - target_score)) ** (1 / c)
        return int(np.ceil(needed))
    except (RuntimeError, ValueError):
        return None
```

### Efficiency Frontiers

Plot accuracy against compute cost to understand cost-performance tradeoffs:

```python
# src/evaluation/efficiency.py
from dataclasses import dataclass

@dataclass
class EfficiencyPoint:
    method_name: str
    accuracy: float
    gpu_hours: float
    params_millions: float
    flops_per_sample: float

def compute_efficiency_frontier(
    points: list[EfficiencyPoint],
) -> list[EfficiencyPoint]:
    """Extract Pareto frontier of accuracy vs compute."""
    # Sort by compute (gpu_hours)
    sorted_points = sorted(points, key=lambda p: p.gpu_hours)
    frontier = []
    best_accuracy = -float("inf")

    for point in sorted_points:
        if point.accuracy > best_accuracy:
            frontier.append(point)
            best_accuracy = point.accuracy

    return frontier

def compute_efficiency_ratio(point: EfficiencyPoint, baseline: EfficiencyPoint) -> dict:
    """Compare efficiency of a method against a baseline."""
    accuracy_gain = point.accuracy - baseline.accuracy
    compute_ratio = point.gpu_hours / baseline.gpu_hours
    return {
        "accuracy_gain": accuracy_gain,
        "compute_ratio": compute_ratio,
        "accuracy_per_gpu_hour": accuracy_gain / point.gpu_hours if point.gpu_hours > 0 else 0,
        "is_efficient": accuracy_gain / max(compute_ratio, 1e-6) > 0,
    }
```

### Minimum Reporting Standard

Every research evaluation must report at minimum:

| Element | Required | Purpose |
|---------|----------|---------|
| Mean metric (N seeds) | Yes | Central estimate |
| Standard deviation / CI | Yes | Uncertainty quantification |
| Significance test vs baseline | Yes | Is the improvement real? |
| Effect size | Yes | Is the improvement meaningful? |
| Number of seeds/folds | Yes | Reproducibility verification |
| Compute cost (GPU-hours) | Yes | Efficiency context |
| Ablation table | For new methods | Component contributions |
| Learning curve | For data-sensitive claims | Sample efficiency |
