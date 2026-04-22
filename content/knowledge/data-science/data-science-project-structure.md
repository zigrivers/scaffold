---
name: data-science-project-structure
description: Opinionated directory layout for solo and small-team data-science projects — notebooks, src, data, models, reports, tests, configs — with a promotion path from exploration to tested modules
topics: [data-science, project-structure, layout]
---

A solo data-science project accumulates artifacts faster than most software: half-finished notebooks, CSV dumps, parquet caches, serialized models, PNG charts, and the occasional markdown write-up. Without a deliberate directory structure, the project turns into a folder of 40 loose files within a month and a new contributor — including future-you — cannot tell what is canonical, what is scratch, and what is safe to delete. A clear layout fixes three problems at once: discoverability (where does X live?), git hygiene (what is tracked vs generated?), and the promotion path (how does throwaway notebook code become tested library code?).

## Summary

A solo DS project has six top-level directories that each answer one question: `notebooks/` (exploration), `src/` (importable Python modules), `data/` (gitignored datasets, split into raw/interim/processed), `models/` (serialized artifacts, tracked via DVC or git-lfs), `reports/` (rendered outputs — figures, HTML, markdown), and `tests/` (pytest suite mirroring `src/`). `configs/` holds YAML run parameters, and `pyproject.toml` at the root defines the package. The `.gitignore` excludes all of `data/`, most of `models/`, and common binary formats. Reusable logic follows a strict promotion path: explored in a notebook, extracted into `src/`, unit-tested in `tests/`, then re-imported by notebooks or pipeline scripts.

## Deep Guidance

### Top-level layout

```
project-root/
├── notebooks/          # Exploratory notebooks (Marimo preferred; numbered chronologically)
├── src/                # Importable Python modules — the library
│   └── <project>/
│       ├── __init__.py
│       ├── ingestion.py    # Load raw data from source (CSV, DB, API)
│       ├── features.py     # Feature engineering / transforms
│       ├── training.py     # Model fitting routines
│       ├── evaluation.py   # Metrics, CV loops, slice analysis
│       └── serving.py      # Inference helpers (load artifact, predict)
├── data/               # GITIGNORED — all datasets live here
│   ├── raw/            # Immutable inputs as received from source
│   ├── interim/        # Partially transformed, cached between stages
│   └── processed/      # Analysis-ready datasets consumed by training
├── models/             # Serialized model artifacts (DVC / git-lfs tracked)
├── reports/            # Rendered output: figures/, HTML reports, markdown summaries
│   └── figures/
├── tests/              # pytest suite — mirrors src/ structure
├── configs/            # YAML run configs (Hydra-style or plain)
├── pyproject.toml      # Package metadata, dependencies, tool config
├── .gitignore
└── README.md
```

One-liners per dir:
- `notebooks/` — exploration, EDA, prototyping; numbered `01-…`, `02-…` so ordering is obvious
- `src/` — every reusable function that a second notebook or a pipeline script will call
- `data/` — all datasets at every stage; nothing here is ever committed to git
- `models/` — trained model artifacts; tracked through DVC or git-lfs pointers, never raw binaries
- `reports/` — things a human reads: charts, HTML reports, markdown summaries
- `tests/` — pytest tests for code in `src/`
- `configs/` — experiment parameters (paths, seeds, hyperparams) separate from code

### Data: gitignore everything large

The single hardest rule in DS project hygiene: **never commit files under `data/` or raw model binaries under `models/` to git**. A 200 MB parquet file in history is permanent — `git filter-repo` is the only cure and it rewrites every commit. Prevent the problem at the `.gitignore` layer before it happens.

```gitignore
# Data — entire directory is local-only
data/
!data/.gitkeep

# Model artifacts — tracked via DVC or git-lfs, not raw binaries
models/
!models/.gitkeep
!models/**/*.dvc

# Common large binary formats (defense in depth — catch anything dropped elsewhere)
*.parquet
*.feather
*.joblib
*.pt
*.pth
*.onnx
*.h5
*.hdf5
*.npy
*.npz

# Python
__pycache__/
*.pyc
.venv/
.ruff_cache/
.pytest_cache/
*.egg-info/

# Notebook outputs (if not using a tool that strips them)
.ipynb_checkpoints/

# Environment / secrets
.env
.env.*
!.env.example
```

The `!data/.gitkeep` pattern keeps the empty directory in git so clones of the repo retain the structure. For versioned datasets and models, see `data-versioning` — DVC or git-lfs pointers are committed, the binaries themselves live in remote storage. Prefer `joblib` or framework-native formats (`.pt`, `.onnx`) over stdlib pickle for model artifacts — pickle loads execute arbitrary code, so a model file from an untrusted source becomes an RCE vector.

### Notebooks → src/ promotion

Notebooks are for exploration, not production. The moment a function in a notebook becomes useful to a second notebook — or looks like it will survive longer than the current sitting — it gets promoted:

1. **Identify**: a cell (or few cells) encapsulating reusable logic — a loader, a transform, a metric computation
2. **Extract**: move the function into the appropriate `src/<project>/` module (`ingestion.py`, `features.py`, etc.) with type hints and a docstring
3. **Test**: add a pytest case in `tests/` that exercises a representative input → output case
4. **Re-import**: the notebook now does `from <project>.features import clean_customer_ids` instead of defining the function inline

This discipline keeps notebooks short (exploration, narrative, charts) and concentrates correctness-critical code where it can be reviewed, tested, and reused. See `notebook-discipline` for the mechanics of cell size, output clearing, and `%autoreload` so edits in `src/` are picked up in the notebook without a kernel restart.

### Configs and reproducibility

Hard-coded paths and hyperparameters inside notebook cells are the single biggest reproducibility killer in a DS project. Push them into `configs/` so a run is defined by a config file + a git SHA.

```yaml
# configs/train_baseline.yaml
run_name: baseline_v1
seed: 42

data:
  raw_path: data/raw/transactions_2024.csv
  processed_path: data/processed/transactions_clean.parquet
  target: churned_30d
  test_size: 0.2
  split_seed: 42

features:
  include:
    - tenure_days
    - monthly_spend
    - support_tickets_30d
  log_transform:
    - monthly_spend

model:
  type: gradient_boosting
  params:
    n_estimators: 200
    max_depth: 5
    learning_rate: 0.05

output:
  model_path: models/baseline_v1.joblib
  report_path: reports/baseline_v1.html
```

Training code reads the config with `yaml.safe_load` (or Hydra / pydantic-settings for richer projects) and a teammate can reproduce the run with `python -m <project>.training --config configs/train_baseline.yaml`. For Hydra specifically, configs split into `configs/data/`, `configs/model/`, `configs/training/` and compose at the command line.

### Tests layout

`tests/` mirrors `src/` one-to-one. If `src/<project>/features.py` defines `clean_customer_ids`, then `tests/test_features.py` contains `test_clean_customer_ids_strips_whitespace` and friends.

```
tests/
├── conftest.py             # Shared fixtures (tiny sample dataframes, tmp_path helpers)
├── test_ingestion.py       # Tests for src/<project>/ingestion.py
├── test_features.py        # Tests for src/<project>/features.py
├── test_training.py        # Tests for src/<project>/training.py — usually smoke tests
└── test_evaluation.py      # Tests for src/<project>/evaluation.py
```

Naming rules:
- Test files: `test_<module>.py` — pytest discovers these by default
- Test functions: `test_<unit>_<behavior>` — e.g. `test_clean_customer_ids_strips_whitespace`, `test_load_transactions_raises_on_missing_file`
- Fixtures live in `conftest.py` at the `tests/` root when shared across files; local fixtures stay in the file that uses them

Training and evaluation tests are typically **smoke tests** over a 10-row fixture dataframe, not full-dataset runs — the goal is catching shape/dtype/column regressions, not validating model quality (model quality belongs in the evaluation report, not the unit test suite).
