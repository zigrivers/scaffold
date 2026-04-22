---
name: data-science-model-evaluation
description: Honest model evaluation for solo/small-team DS — metric choice, one-shot holdout, cross-validation, calibration, and error slicing with sklearn
topics: [data-science, evaluation, sklearn, cross-validation, calibration]
---

Every solo DS project produces a moment where a notebook prints `0.92 accuracy` on a test set and the author quietly believes the model works. Then it ships — and recall on the minority class is 0.12, the probabilities are miscalibrated, and a single region drives half the error. Evaluation discipline is the only thing separating a model that works from a model that looked like it worked on a single split. At solo scale you do not have an ML platform team checking your work, which makes the discipline entirely your responsibility.

## Summary

Match the metric to the business question: do not report accuracy on an imbalanced label, do not report RMSE when one outlier dominates the loss. Split the data once, use cross-validation on the training portion for model selection, and touch the holdout exactly once at the end. If downstream decisions consume probabilities (thresholding, expected value, stacking), check calibration — a 0.9 ROC-AUC model can still output probabilities that are wildly overconfident. Always slice errors by meaningful subgroups (region, bucket, cohort); aggregate metrics hide the failures that matter.

## Deep Guidance

### Picking the right metric

Metric choice is a business decision, not a math decision. The right starting question is: "what does a false positive cost, and what does a false negative cost?" If the two are comparable and the classes are balanced, accuracy is fine. Once the costs diverge — or the base rate is skewed — accuracy becomes actively misleading.

A small rubric for classification:

- **Balanced binary classification**: accuracy is fine.
- **Imbalanced binary (fraud, churn, rare disease)**: precision / recall / F1, and PR-AUC over ROC-AUC (ROC-AUC flatters models on heavy class imbalance).
- **Ranking / thresholding later**: `roc_auc_score` measures order, not calibration.
- **Decisions that consume probabilities**: `log_loss` or Brier score — rewards calibrated confidence, punishes overconfident mistakes.
- **Multi-class**: `classification_report` for per-class precision/recall, and pick `average="macro"` (equal weight per class) vs `"weighted"` (weight by support) deliberately.

And for regression:

- **Magnitude matters**: RMSE (penalizes large errors quadratically).
- **Outliers you do not want to chase**: MAE (robust to a few extreme points).
- **Explained variance / reporting to stakeholders**: R².
- **Relative error across scales**: MAPE, but guard against zeros in the denominator.

```python
from sklearn.metrics import classification_report, roc_auc_score, log_loss

y_proba = model.predict_proba(X_test)[:, 1]
y_pred = (y_proba >= 0.5).astype(int)

print(classification_report(y_test, y_pred, digits=3))
print(f"ROC-AUC:  {roc_auc_score(y_test, y_proba):.3f}")
print(f"log-loss: {log_loss(y_test, y_proba):.3f}")
```

Report at least one threshold-free metric (ROC-AUC or PR-AUC) and one threshold-dependent metric (precision/recall at your operating point). Reporting only accuracy on a 95/5 class split is the canonical way to lie to yourself — the "always predict no" baseline gets 0.95 without a model.

### Holdout discipline

Split once, at the top of the notebook, before any exploration on the target:

```python
from sklearn.model_selection import train_test_split

X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,
    random_state=42,
    stratify=y,  # preserve class balance for classification
)
```

Rules:

1. The test set is touched exactly once — at the end, for the final number you report.
2. All model selection, feature engineering decisions, and hyperparameter tuning happen on `X_train` (via cross-validation).
3. If you peek at test performance and then change the model, the test set is contaminated. Either live with the contamination and note it, or collect a new holdout.
4. Fit preprocessing (`StandardScaler`, `OneHotEncoder`, imputers) on train only, then apply to test — wrap it in a `Pipeline` so you cannot leak by accident.

### Cross-validation for model selection

Use cross-validation on the training set to compare models and pick hyperparameters. This gives you a mean and standard deviation, so you can see whether model A actually beats model B or is one lucky fold away.

```python
from sklearn.model_selection import StratifiedKFold, cross_val_score, GridSearchCV
from sklearn.ensemble import RandomForestClassifier

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

scores = cross_val_score(
    RandomForestClassifier(n_estimators=200, random_state=42),
    X_train, y_train,
    cv=cv,
    scoring="roc_auc",
)
print(f"CV ROC-AUC: {scores.mean():.3f} ± {scores.std():.3f}")

grid = GridSearchCV(
    RandomForestClassifier(random_state=42),
    param_grid={"max_depth": [4, 8, None], "min_samples_leaf": [1, 5, 20]},
    cv=cv,
    scoring="roc_auc",
    n_jobs=-1,
)
grid.fit(X_train, y_train)
```

Use `StratifiedKFold` for classification (preserves class balance per fold) and plain `KFold` for regression. **For any data with a time dimension, use `TimeSeriesSplit` instead** — random folds leak future information into the training set and will make your model look dramatically better offline than it is in production.

### Calibration

A model with a great ROC-AUC can still output badly calibrated probabilities — random forests and boosted trees are both notorious for this. If downstream code takes `predict_proba` output and uses it as a probability (expected-value calculations, threshold tuning based on cost, stacking, active learning), calibration matters at least as much as discrimination.

```python
from sklearn.calibration import calibration_curve, CalibratedClassifierCV
import matplotlib.pyplot as plt

prob_true, prob_pred = calibration_curve(y_test, y_proba, n_bins=10, strategy="quantile")

plt.plot(prob_pred, prob_true, marker="o")
plt.plot([0, 1], [0, 1], "--", color="gray")
plt.xlabel("Predicted probability"); plt.ylabel("Observed frequency")
```

A well-calibrated model tracks the diagonal. If the curve sags below it you are overconfident; if it bulges above, underconfident. Fix with `CalibratedClassifierCV(method="isotonic")` (flexible, needs more data) or `method="sigmoid"` (Platt scaling, works with ~1k examples). Fit calibration on a held-out slice of the training set — never on the test set.

### Error analysis and slicing

Overall metrics hide systematic failures. A pandas `groupby` on the predictions is usually enough:

```python
import pandas as pd

eval_df = pd.DataFrame({
    "y_true": y_test,
    "y_pred": y_pred,
    "y_proba": y_proba,
    "region": X_test["region"].values,
    "age_bucket": pd.cut(X_test["age"], bins=[0, 25, 45, 65, 120]),
})
eval_df["correct"] = eval_df["y_true"] == eval_df["y_pred"]

print(eval_df.groupby("region")["correct"].agg(["mean", "count"]))
print(eval_df.groupby("age_bucket")["correct"].agg(["mean", "count"]))
```

Look for slices where the metric is materially worse than overall AND the slice has enough examples to be real (set a floor like n ≥ 50). Those are your debugging targets before shipping.

**Fairness note**: slicing by sensitive attributes (age, gender, region, race where legally permitted) surfaces disparate impact. This is a minimum floor — if you ship models that affect people, read a proper fairness reference (Barocas/Hardt/Narayanan "Fairness and Machine Learning") rather than treating a groupby as the whole story.

### What NOT to do

- **Do not tune on the test set.** Every time you look at a test number and change the model, you are fitting to the test set in slow motion. The `GridSearchCV` call above uses CV on the train set specifically to avoid this.
- **Do not cherry-pick a random seed.** If the model only wins with `random_state=7`, it does not actually win. Run with 3–5 different seeds and report the spread if you suspect the result is seed-fragile.
- **Do not report only the best fold.** Report mean and std across CV folds. A model with 0.85 ± 0.12 is not better than 0.82 ± 0.02 — the first one is one unlucky fold away from losing.
- **Do not ship without a trivial baseline.** Compare against predicting the majority class (classification) or the training mean (regression). If your fancy model cannot beat that, the problem is the data or the label, not the model.
- **Do not evaluate on preprocessed-then-split data.** Fit the scaler, encoder, or imputer on train only, then transform test. Anything else is leakage and will inflate your offline numbers.
- **Do not change the metric after seeing the results.** Pick the metric before training, based on the business question, and stick with it. Swapping from precision to ROC-AUC because one looked nicer is a cousin of p-hacking.

## Minimum evaluation checklist

Before calling a model "done" at solo scale, every item below should be true:

1. Metric is chosen to match the business cost of errors, documented in the notebook or readme.
2. Data was split once with a fixed `random_state`, stratified for classification or temporally for time-series.
3. All preprocessing lives inside a `Pipeline` and is fit on train only.
4. Model selection was done with cross-validation on the training set, with mean ± std reported per candidate.
5. At least one trivial baseline was beaten by a margin larger than the CV standard deviation.
6. Test set was evaluated exactly once, at the end, and that number is what you report.
7. If `predict_proba` is consumed downstream, a calibration curve was inspected and recalibrated if needed.
8. Errors were sliced by at least one meaningful business dimension, and any slice with materially worse metrics is either fixed or explicitly noted as a known limitation.
