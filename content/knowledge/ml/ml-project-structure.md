---
name: ml-project-structure
description: Standard ML project directory layout covering src/data, src/models, src/training, src/serving, notebooks, configs, and model artifact storage
topics: [ml, project-structure, layout, organization, artifacts, notebooks]
---

ML projects accumulate files faster than almost any other software domain: datasets, model checkpoints, experiment configs, notebooks, evaluation reports, and serving code. Without a deliberate directory structure, projects become disorganised within weeks and impossible to onboard new team members onto. A well-structured ML project separates concerns clearly: source code from notebooks, training from serving, configs from code, and tracked artifacts from ephemeral outputs.

## Summary

A standard ML project separates source code (`src/`), exploratory notebooks (`notebooks/`), training configurations (`configs/`), and model artifacts (`models/`). Within `src/`, separate data loading (`src/data/`), model architectures (`src/models/`), training logic (`src/training/`), and serving code (`src/serving/`). Keep large artifacts (datasets, checkpoints) out of git using `.gitignore` and DVC or object storage. The structure should be navigable to a new team member within five minutes.

## Deep Guidance

### Top-Level Directory Structure

```
project-root/
├── configs/            # All experiment and model configs (YAML/TOML)
├── data/               # Data directory (gitignored content, DVC-tracked)
│   ├── raw/            # Immutable raw data as received from source
│   ├── processed/      # Cleaned, transformed datasets
│   └── splits/         # Train/val/test split files (CSV/JSON of IDs)
├── docs/               # Architecture decisions, dataset cards, model cards
├── models/             # Model artifact storage (gitignored; object storage backed)
│   ├── checkpoints/    # Training checkpoints (epoch-N.pt)
│   └── registry/       # Production-promoted model versions
├── notebooks/          # Jupyter notebooks for exploration (outputs cleared before commit)
├── reports/            # Evaluation reports, figures, experiment summaries
├── scripts/            # One-off utility scripts (not part of the pipeline)
├── src/                # All production source code
│   ├── data/           # Dataset classes, loaders, preprocessing
│   ├── models/         # Model architecture definitions
│   ├── training/       # Training loops, loss functions, callbacks
│   ├── evaluation/     # Metrics, evaluation runners, result serialisation
│   └── serving/        # Inference pipelines, API handlers, preprocessing wrappers
├── tests/              # Unit and integration tests
├── .dvc/               # DVC metadata (committed to git)
├── .gitignore          # Excludes data/, models/, __pycache__, .env
├── pyproject.toml      # Project metadata and dependencies (Poetry)
├── Makefile            # Task runner: train, evaluate, serve, test
└── README.md           # Project overview, setup, and usage
```

### `src/data/` — Data Loading and Preprocessing

This directory contains all code that transforms raw data into model-ready tensors:

```
src/data/
├── __init__.py
├── dataset.py          # PyTorch Dataset or TF Dataset class
├── datamodule.py       # LightningDataModule or equivalent orchestrator
├── transforms.py       # Preprocessing transforms (normalize, tokenize, augment)
├── augmentation.py     # Training-time data augmentation (separated from eval transforms)
├── collate.py          # Custom batch collation functions
└── utils.py            # Data utilities (download, checksum, split generation)
```

Key rules:
- **Separate training transforms from eval transforms** — augmentation must not be applied at inference
- Dataset classes must accept a `split` parameter and behave correctly for each split
- All preprocessing must be reproducible and deterministic at inference time
- Cache processed data to avoid recomputation on each run

### `src/models/` — Architecture Definitions

Contains model class definitions only — no training logic, no loss functions:

```
src/models/
├── __init__.py
├── backbone.py         # Feature extractor (ResNet, ViT, BERT, etc.)
├── head.py             # Task-specific head (classification, regression, generation)
├── model.py            # Composed full model
└── components/         # Reusable building blocks (attention, MLP, norm layers)
    ├── attention.py
    └── ffn.py
```

Key rules:
- Models are pure computation graphs — no file I/O, no training state
- Accept hyperparameters via constructor, not globals
- Provide a `from_config(cfg)` class method for config-driven instantiation
- Serialise with `state_dict()` only — never pickle entire model objects

### `src/training/` — Training Logic

```
src/training/
├── __init__.py
├── trainer.py          # Training loop (or LightningModule)
├── loss.py             # Loss functions
├── optimizer.py        # Optimizer and scheduler builders
├── callbacks.py        # Callbacks (early stopping, logging, checkpoint saving)
└── utils.py            # Gradient clipping, mixed precision helpers
```

The training loop is separate from the model. A model knows how to compute predictions; the trainer knows how to update weights. This separation enables:
- Testing model forward passes independently of training
- Swapping training strategies (single GPU, DDP, FSDP) without changing the model
- Using the same model class for training and serving

### `src/evaluation/` — Metrics and Evaluation Runners

```
src/evaluation/
├── __init__.py
├── metrics.py          # Metric computation (accuracy, F1, AUC, etc.)
├── evaluator.py        # Evaluation loop (runs model on eval set, collects predictions)
├── slice_analysis.py   # Per-slice performance breakdown
└── reports.py          # Result serialisation and report generation
```

Evaluation code runs identically offline and online. Do not inline evaluation logic in the training loop — this makes it impossible to re-evaluate a checkpoint independently.

### `src/serving/` — Inference and API

```
src/serving/
├── __init__.py
├── predictor.py        # Prediction class (loads model, runs inference)
├── preprocessing.py    # Request preprocessing (mirrors training eval transforms)
├── postprocessing.py   # Response postprocessing (calibration, thresholding)
├── api.py              # FastAPI/Flask endpoint definitions
└── handler.py          # TorchServe or Triton handler
```

The `Predictor` class is the contract between the model and the serving infrastructure. It:
- Loads a model from a path or registry reference
- Exposes a `predict(inputs)` method with documented input/output types
- Uses the exact same preprocessing as training evaluation transforms

### `notebooks/` — Exploratory Analysis

```
notebooks/
├── 01-data-exploration.ipynb   # EDA, data quality checks
├── 02-baseline-model.ipynb     # Baseline experiments
├── 03-feature-engineering.ipynb
└── 04-error-analysis.ipynb     # Post-training error analysis
```

Rules for notebooks:
- **Clear outputs before committing** — use `nbstripout` as a pre-commit hook
- Number notebooks in chronological/logical order
- Notebooks document exploration, not production logic
- Any reusable code found in notebooks gets refactored into `src/` with tests

### `configs/` — Experiment Configuration

```
configs/
├── base.yaml               # Default config merged into all experiments
├── model/
│   ├── small.yaml
│   └── large.yaml
├── data/
│   ├── dev.yaml            # Small dataset for fast iteration
│   └── full.yaml           # Full production dataset
└── training/
    ├── debug.yaml          # 1 epoch, no logging, fast feedback
    └── production.yaml     # Full training run settings
```

### `models/` — Artifact Storage

Large binary artifacts are not stored in git:
- Checkpoints and production models live in `models/` but are gitignored
- Back `models/` with object storage: S3, GCS, Azure Blob Storage
- Use DVC to track artifact versions alongside the code:

```bash
dvc add models/registry/v1.2.0/model.pt
git add models/registry/v1.2.0/model.pt.dvc
git commit -m "feat: register model v1.2.0"
dvc push  # Pushes binary to remote storage
```

Teammates restore the artifact with `dvc pull` — they get the exact binary referenced by the `.dvc` pointer in git.

### `.gitignore` Essentials for ML Projects

```gitignore
# Data
data/raw/
data/processed/
data/splits/*.csv

# Model artifacts
models/checkpoints/
models/registry/

# Notebook outputs
*.ipynb

# Python
__pycache__/
*.pyc
.venv/
*.egg-info/

# Experiment tracking
mlruns/
wandb/

# Environment
.env
*.env
```

Use `nbstripout` to automatically strip notebook outputs:
```bash
pip install nbstripout
nbstripout --install  # Installs as git filter
```
