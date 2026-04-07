---
name: ml-model-evaluation
description: Train/val/test splits, cross-validation, metrics by task type, holdout sets, and slice analysis for thorough model evaluation
topics: [ml, evaluation, train-test-split, cross-validation, metrics, holdout, slice-analysis]
---

Model evaluation is the difference between knowing whether your model works and believing it works. Most ML evaluation bugs are forms of data leakage: the model has seen information during training that it would not have at inference time, making offline metrics look better than production performance. Rigorous evaluation requires careful data splitting, leak-free preprocessing, appropriate metrics for the task, and systematic analysis of where the model fails.

## Summary

Split data into train, validation, and test sets — use the test set exactly once. For small datasets, use cross-validation. Choose metrics appropriate to the task: classification, regression, ranking, or generation have different canonical metrics. Analyse model performance by meaningful slices (demographic groups, difficulty levels, data subsets) — aggregate metrics hide subgroup failures. Log evaluation results with experiment metadata for longitudinal comparison.

## Deep Guidance

### Data Splitting Principles

**Three-way split**: train (model learning), validation (hyperparameter tuning and early stopping), test (final unbiased evaluation):

```python
from sklearn.model_selection import train_test_split

def create_splits(
    df: pd.DataFrame,
    val_fraction: float = 0.1,
    test_fraction: float = 0.1,
    seed: int = 42,
    stratify_col: str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Create reproducible train/val/test splits."""
    stratify = df[stratify_col] if stratify_col else None

    train_val, test = train_test_split(
        df,
        test_size=test_fraction,
        random_state=seed,
        stratify=stratify,
    )

    val_size_adjusted = val_fraction / (1 - test_fraction)
    stratify_tv = train_val[stratify_col] if stratify_col else None

    train, val = train_test_split(
        train_val,
        test_size=val_size_adjusted,
        random_state=seed,
        stratify=stratify_tv,
    )

    return train, val, test
```

**Critical splitting rules**:
1. **Split before preprocessing**: Fit preprocessing (scalers, encoders, imputers, tokenizers vocabulary) on training data only, then apply to val/test. Fitting on the combined dataset is data leakage.
2. **Stratify by label for classification**: Ensures class distribution is preserved in each split.
3. **Split by entity, not row, for grouped data**: If you have multiple rows per user, all rows for a user must go to the same split. Row-level splitting leaks user-level information.
4. **Temporal split for time-series**: Train on past, validate and test on future. Random splits would leak future information.

### Temporal Splits

For any dataset with a time dimension, always split by time:

```python
def temporal_split(
    df: pd.DataFrame,
    timestamp_col: str,
    val_start: str,
    test_start: str,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Create temporal splits — train/val/test defined by date boundaries."""
    df = df.sort_values(timestamp_col)
    train = df[df[timestamp_col] < val_start]
    val = df[(df[timestamp_col] >= val_start) & (df[timestamp_col] < test_start)]
    test = df[df[timestamp_col] >= test_start]
    return train, val, test
```

**Backtesting** extends temporal evaluation by simulating deployment across multiple time windows — tests that a model trained on one period performs on subsequent periods.

### Cross-Validation

Use k-fold cross-validation when dataset size is insufficient for a stable held-out set (< 10,000 examples):

```python
from sklearn.model_selection import StratifiedKFold
import numpy as np

def cross_validate(
    X: np.ndarray,
    y: np.ndarray,
    model_builder,
    n_folds: int = 5,
    seed: int = 42,
) -> dict[str, float]:
    """Stratified k-fold cross-validation."""
    skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=seed)
    fold_metrics = []

    for fold, (train_idx, val_idx) in enumerate(skf.split(X, y)):
        X_train, X_val = X[train_idx], X[val_idx]
        y_train, y_val = y[train_idx], y[val_idx]

        model = model_builder()
        model.fit(X_train, y_train)
        metrics = evaluate_model(model, X_val, y_val)
        fold_metrics.append(metrics)

    # Aggregate across folds
    return {
        metric: {
            "mean": np.mean([m[metric] for m in fold_metrics]),
            "std": np.std([m[metric] for m in fold_metrics]),
        }
        for metric in fold_metrics[0]
    }
```

**Nested cross-validation** separates hyperparameter selection from model evaluation:
- Outer loop: Estimate generalisation error
- Inner loop: Select hyperparameters via grid/random search
- Prevents over-fitting hyperparameters to the validation set

### Holdout Sets and Evaluation Integrity

**The test set is sacred**: It may be touched exactly once — when reporting final model performance before deployment. Every other decision (architecture, hyperparameters, features) uses the validation set.

If you look at test set performance and then make changes, the test set is contaminated — you must collect a fresh test set.

**Multiple evaluation sets**:
- **In-distribution test set**: Same distribution as training data. Measures how well the model learned.
- **Out-of-distribution test set**: Different time period, geography, or user cohort. Measures generalisation.
- **Adversarial / challenging test set**: Hard examples, edge cases, known failure modes. Measures robustness.
- **Slice-specific test sets**: Subsets by demographic, category, or difficulty. Measures fairness and consistency.

### Metrics by Task Type

**Binary Classification**:
```python
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, average_precision_score,
    confusion_matrix, classification_report,
)

def evaluate_binary_classifier(
    y_true: np.ndarray,
    y_pred_proba: np.ndarray,
    threshold: float = 0.5,
) -> dict[str, float]:
    y_pred = (y_pred_proba >= threshold).astype(int)
    return {
        "accuracy": accuracy_score(y_true, y_pred),
        "precision": precision_score(y_true, y_pred, zero_division=0),
        "recall": recall_score(y_true, y_pred, zero_division=0),
        "f1": f1_score(y_true, y_pred, zero_division=0),
        "roc_auc": roc_auc_score(y_true, y_pred_proba),
        "pr_auc": average_precision_score(y_true, y_pred_proba),
    }
```

**Regression**:
```python
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

def evaluate_regressor(y_true, y_pred) -> dict[str, float]:
    return {
        "mae": mean_absolute_error(y_true, y_pred),
        "rmse": np.sqrt(mean_squared_error(y_true, y_pred)),
        "r2": r2_score(y_true, y_pred),
        "mape": np.mean(np.abs((y_true - y_pred) / (y_true + 1e-8))) * 100,
    }
```

**Multi-class classification**:
- Macro-average: Equal weight per class — use when class imbalance should not inflate aggregate metrics
- Weighted-average: Weight by class support — use for overall system performance
- Per-class metrics: Report separately to catch poor performance on minority classes

### Slice Analysis

Aggregate metrics can hide systematic failures in subgroups. Slice analysis breaks down performance by meaningful subsets:

```python
def slice_analysis(
    df: pd.DataFrame,
    y_true_col: str,
    y_pred_col: str,
    slice_cols: list[str],
    metric_fn,
) -> pd.DataFrame:
    """Compute metrics for each slice of the data."""
    results = []

    # Overall metrics
    overall = metric_fn(df[y_true_col], df[y_pred_col])
    results.append({"slice": "overall", "n": len(df), **overall})

    # Per-slice metrics
    for col in slice_cols:
        for value, group in df.groupby(col):
            if len(group) < 50:  # Skip slices with too few examples
                continue
            metrics = metric_fn(group[y_true_col], group[y_pred_col])
            results.append({
                "slice": f"{col}={value}",
                "n": len(group),
                **metrics,
            })

    return pd.DataFrame(results)
```

**Slices to always analyse**:
- Demographic groups (if available and legally permissible): age band, gender, geography
- Data quality slices: high vs. low confidence labels, recent vs. old data
- Difficulty slices: high vs. low frequency items, short vs. long text
- Business-relevant slices: product category, customer segment, price tier

**Flagging disparities**: If a slice's metric deviates from overall by more than a threshold (e.g., 10 percentage points), flag for investigation before deployment.

### Baseline Comparisons

Every model evaluation must include a comparison to baselines:
- **Trivial baseline**: Predict the majority class (classification) or mean target value (regression)
- **Rule-based baseline**: The current production rule or heuristic
- **Previous model version**: The model currently in production
- **Simple ML baseline**: Logistic regression or decision tree

A model that does not beat all baselines should not be deployed. The trivial baseline check catches label encoding bugs (where the model learns the majority class trivially).

### Evaluation Report Structure

```markdown
# Evaluation Report: fraud-detector-v2.3.0

## Dataset
- Test set: 45,231 examples (2024-01-01 to 2024-03-31)
- Class balance: 1.2% fraud, 98.8% non-fraud

## Overall Metrics
| Metric | v2.2.0 (prod) | v2.3.0 (candidate) | Delta |
|--------|--------------|-------------------|-------|
| ROC-AUC | 0.921 | 0.934 | +1.4% |
| PR-AUC | 0.712 | 0.748 | +5.1% |
| Recall @ precision=0.9 | 0.68 | 0.73 | +7.4% |

## Slice Analysis
| Slice | n | ROC-AUC | vs. Overall |
|-------|---|---------|-------------|
| Overall | 45,231 | 0.934 | — |
| Amount < $50 | 12,445 | 0.941 | +0.7% |
| Amount > $1000 | 3,211 | 0.918 | -1.6% |
| New user (< 30 days) | 8,902 | 0.891 | -4.6% ⚠️ |

## Recommendation
Promote to staging. Investigate new user performance degradation before production.
```
