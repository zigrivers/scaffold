---
name: data-science-conventions
description: Python coding conventions for solo data-science work — ruff for lint+format, pragmatic type hints, pyproject.toml as single config source, import ordering, module layout, naming, and docstrings
topics: [data-science, conventions, python, ruff, type-hints]
---

Solo data-science code drifts faster than any other kind of Python: half of it lives in notebooks, the other half migrates into scripts, and nothing stays stable long enough to earn a style review. Consistent conventions are the only thing that keeps cognitive load bounded when you come back to a project after two months. Encode them in tooling (`ruff`, `pyproject.toml`) so they run on save — not on willpower — and the notebook→script promotion path stays smooth instead of becoming a cleanup tax.

## Summary

Use `ruff` as the single lint + format tool — `ruff format` is Black-compatible and replaces Black, so do not install both. Apply `type hints` pragmatically: typed on any function another module imports, omitted on throwaway notebook helpers. Centralize all project and tool configuration in `pyproject.toml` — one file for build metadata, dependencies, ruff, and pytest. Use `ruff`/`isort`-style import sections (stdlib → third-party → local), a flat `src/` layout with a clear module split, and docstrings sized to the consumer: one-liners for internal helpers, full Google/NumPy style for anything a teammate will call without reading the source.

## Deep Guidance

### Linter + formatter (ruff)

`ruff` is the only Python linter/formatter a solo DS project needs. It replaces `flake8`, `isort`, `pyupgrade`, `pydocstyle`, `pylint` (mostly), and — via `ruff format` — Black. It is an order of magnitude faster than the tools it replaces, configured in one `[tool.ruff]` block, and has no plugin-management overhead. Do not layer Black on top: `ruff format` implements the same formatting contract, and running both just causes churn.

```toml
# pyproject.toml
[tool.ruff]
line-length = 100
target-version = "py311"
extend-exclude = ["notebooks/_scratch", "data", "models"]

[tool.ruff.lint]
select = [
  "E",   # pycodestyle errors
  "W",   # pycodestyle warnings
  "F",   # pyflakes
  "I",   # isort (import sorting)
  "N",   # pep8-naming
  "UP",  # pyupgrade
  "B",   # flake8-bugbear
  "C90", # mccabe complexity
  "D",   # pydocstyle
]
ignore = [
  "D100",  # missing docstring in public module — noisy for scripts
  "D104",  # missing docstring in public package
  "E501",  # line-too-long — formatter handles it
]

[tool.ruff.lint.per-file-ignores]
# Notebooks and experiment scripts get a lighter hand
"notebooks/**/*.py" = ["D", "N806", "E402"]
"scripts/**/*.py"  = ["D"]
"tests/**/*.py"    = ["D"]

[tool.ruff.lint.pydocstyle]
convention = "google"

[tool.ruff.lint.mccabe]
max-complexity = 12

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
```

**Tradeoff**: notebook and exploration code legitimately breaks rules that production code should not — uppercase variable names (`X_train`), imports after executable code, no docstrings. The `per-file-ignores` block disables the rules that fight notebook workflows without weakening the defaults for `src/`. Do not globally ignore `D` or `N` just to silence notebook noise.

Run on save (editor integration) and as a pre-commit hook. In CI, run `ruff check .` and `ruff format --check .` — the `--check` flag fails instead of rewriting.

### Type hints

Python is not a typed language, and pretending it is in exploratory code wastes time. The rule is **import boundary = type boundary**: if another module imports the function, type it. Notebook-local helpers and inline lambdas do not need annotations.

```python
# src/features/encoders.py — imported by training and serving, fully typed
from __future__ import annotations

import numpy as np
import pandas as pd


def target_encode(
    series: pd.Series,
    target: pd.Series,
    smoothing: float = 10.0,
) -> pd.Series:
    """Smoothed target encoding for a categorical feature.

    Args:
        series: Categorical feature values (any hashable dtype).
        target: Numeric target aligned to `series` by index.
        smoothing: Prior weight; higher values pull rare categories
            toward the global mean.

    Returns:
        Series of encoded floats aligned to `series.index`.
    """
    global_mean = target.mean()
    agg = target.groupby(series).agg(["mean", "count"])
    weight = agg["count"] / (agg["count"] + smoothing)
    encoding = weight * agg["mean"] + (1 - weight) * global_mean
    return series.map(encoding).astype(np.float64)
```

```python
# notebooks/03_eda.py — throwaway scratch, no annotations needed
def quick_hist(col):
    return df[col].value_counts().head(20)

for c in cat_cols:
    print(c, quick_hist(c).to_dict())
```

Practical rules:
- Type every function exported from `src/` — parameters and return.
- Type dataclasses and `TypedDict` schemas that describe data contracts (row shapes, config dicts).
- Skip annotations on notebook cells, inline closures, and private helpers inside a single script.
- Use `from __future__ import annotations` at the top of every `src/` file — it makes all annotations lazy strings, so forward references and expensive-to-import types (`torch.Tensor`, `pd.DataFrame`) cost nothing at import time.
- Do not run `mypy --strict` on a solo DS project. Run it on `src/` with `--ignore-missing-imports` if you want a safety net, and do not bother with notebooks.

### Project layout and pyproject.toml

One `pyproject.toml` at the repo root configures the build, dependencies, lint, format, and tests. Do not scatter config across `setup.cfg`, `.flake8`, `.isort.cfg`, and `pytest.ini` — everything lives in `pyproject.toml`.

```toml
# pyproject.toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "churn-model"
version = "0.1.0"
description = "Customer churn prediction — feature pipeline, training, and serving."
requires-python = ">=3.11"
dependencies = [
  "pandas>=2.1",
  "numpy>=1.26",
  "scikit-learn>=1.4",
  "pydantic>=2.5",
]

[project.optional-dependencies]
dev = [
  "ruff>=0.3",
  "pytest>=8.0",
  "pytest-cov>=4.1",
  "ipykernel>=6.29",
]

[tool.ruff]
line-length = 100
target-version = "py311"
# ... (see ruff section above)

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-ra --strict-markers --cov=src --cov-report=term-missing"
markers = [
  "slow: marks tests as slow (deselect with '-m \"not slow\"')",
]
```

Repo layout:

```
churn-model/
  pyproject.toml
  README.md
  src/
    churn_model/
      __init__.py
      data/          # loaders, schemas, splits
      features/      # transformers, encoders, selection
      models/        # model definitions and wrappers
      training/      # train loops, CV runners
      evaluation/    # metrics, diagnostics
      serving/       # inference helpers
  notebooks/
    01_data_audit.ipynb
    02_feature_exploration.ipynb
  tests/
    test_features.py
    test_training.py
  configs/
    base.yaml
```

Use a `src/` layout (not flat) so imports always go through the installed package — this prevents the "works in notebook, breaks in test" failure mode where `from my_module import x` resolves from the CWD instead of the package.

### Import ordering

`ruff` with rule `I` enforces `isort`-compatible sections automatically. The contract:

1. Future imports (`from __future__ import annotations`)
2. Standard library
3. Third-party
4. First-party (your package)
5. Local relative (`from .utils import ...`)

One blank line between sections, alphabetical within each. Do not hand-maintain this — `ruff check --fix` sorts imports in milliseconds.

```python
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import KFold

from churn_model.data import load_raw
from churn_model.features import target_encode

from .utils import timed
```

### Naming and docstrings

Naming rubric (enforced by `ruff` rule `N`):

- **Modules/files**: `snake_case.py` (`feature_store.py`, not `FeatureStore.py`).
- **Functions/variables**: `snake_case` (`compute_auc`, `n_splits`).
- **Classes**: `PascalCase` (`ChurnDataset`, `TargetEncoder`).
- **Constants**: `UPPER_SNAKE_CASE` at module top level (`DEFAULT_SEED = 42`, `FEATURE_COLUMNS: tuple[str, ...] = (...)`).
- **Private**: single leading underscore (`_internal_helper`). Double underscore only when you specifically want name-mangling inside a class.
- **Type variables**: `PascalCase` with suffix (`ModelT = TypeVar("ModelT")`).
- **DataFrame matrices**: `X`, `y`, `X_train`, `y_test` are the one permitted uppercase exception — this is ML convention and `ruff` can be told to allow it via `N806` ignore in model/training modules.

Docstring style sizing — match the cost of writing the docstring to the consumer:

- **Terse one-liner** for private helpers and obvious utilities. `"""Return the 95th percentile of non-null values."""` is enough.
- **Full Google-style** (Args/Returns/Raises) for any public function in `src/features/`, `src/models/`, or `src/serving/` — anything a teammate or future-you will call without opening the source. See the `target_encode` example above.
- **Module docstring** on every `src/` module: one sentence describing what lives there. Skip on `scripts/` and `notebooks/`.
- **Class docstring** covers the class contract; `__init__` args go in the class docstring, not a separate `__init__` docstring. (This is the Google convention and `ruff`'s `pydocstyle` setting enforces it.)

Pick Google **or** NumPy style — not both — and set it in `[tool.ruff.lint.pydocstyle]`. Google is more compact and reads better in IDE hover; NumPy is better when you have long parameter descriptions with math. For solo DS, Google is the default recommendation.
