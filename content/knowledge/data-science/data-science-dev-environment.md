---
name: data-science-dev-environment
description: Reproducible local Python dev environment for data science using uv, direnv, pre-commit, and pyproject.toml
topics: [data-science, dev-environment, uv, direnv, pre-commit]
---

A data-science project that cannot be recreated in minutes is a liability. Notebooks pick up stale package versions, secrets leak into `.bashrc`, and "works on my machine" kills any chance of a collaborator (or future-you) rerunning an experiment. The fix is not complicated: one lockfile, one place for env vars, one pre-commit hook, no bespoke shell scripts. This guide is opinionated toward solo and small-team workflows where local-first beats container-first.

## Summary

Use `uv` as the single Python package manager — it replaces `pip`, `pip-tools`, `venv`, and `virtualenv` with one fast, reproducible tool. Declare every dependency in `pyproject.toml` so there is exactly one source of truth, and commit `uv.lock` so `uv sync` gives any collaborator a byte-identical environment. Layer `direnv` on top for per-repo environment variables (tracking URIs, data paths, secrets pulled from a vault) so nothing leaks into your global shell. Add `pre-commit` with a small set of fast hooks (`ruff-format`, `ruff-check`, end-of-file fixer) so style and obvious bugs never enter a commit. Skip Docker for greenfield solo DS work — reach for it only when you cross an OS boundary (Mac dev, Linux prod) or depend on GPU/CUDA libraries.

## Deep Guidance

### uv for Python environment and dependencies

`uv` is the 2025 default for Python packaging. It is a drop-in replacement for `pip`, `venv`, and `pip-tools`, written in Rust, and roughly 10-100x faster than the tools it replaces. For data science the combination of `uv sync` (reproduces the environment from the lockfile) and `uv run` (executes a script in the managed venv without activation) is the whole workflow.

Bootstrap a new project:

```bash
uv init --python 3.12 myproject
cd myproject
uv add pandas numpy scikit-learn jupyterlab
uv add --dev ruff pytest pandera
uv sync            # creates .venv and installs everything
uv run pytest      # runs in the managed venv, no activation needed
uv run jupyter lab
```

A minimal `pyproject.toml`:

```toml
[project]
name = "myproject"
version = "0.1.0"
description = "Customer churn analysis"
requires-python = ">=3.12"
dependencies = [
    "pandas>=2.2",
    "numpy>=2.0",
    "scikit-learn>=1.5",
    "jupyterlab>=4.2",
    "pandera>=0.20",
]

[dependency-groups]
dev = [
    "ruff>=0.6",
    "pytest>=8.0",
    "pre-commit>=3.8",
]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "PD"]  # PD = pandas-vet
```

Commit both `pyproject.toml` and `uv.lock`. A collaborator clones the repo and runs `uv sync` — that is the entire setup step. No `pip install -r requirements.txt`, no virtualenv activation, no version drift.

Add a package with `uv add <name>`; remove with `uv remove <name>`. Both edit `pyproject.toml` and update `uv.lock` atomically. To pin a version use `uv add "pandas==2.2.3"`. To upgrade run `uv lock --upgrade-package pandas`.

Two `uv` features worth knowing for data science specifically:

- **`uv run script.py`** executes a file in the project venv with no activation step. Wire this into a `Makefile` or `justfile` so `make train` and `make eval` Just Work for any collaborator.
- **Inline script metadata (PEP 723).** For one-off analysis scripts that live outside the project, a shebang-style header declares dependencies and `uv run` auto-creates an ephemeral venv:

  ```python
  # /// script
  # requires-python = ">=3.12"
  # dependencies = ["pandas", "duckdb"]
  # ///
  import pandas as pd
  import duckdb
  ...
  ```

  Running `uv run oneoff.py` resolves and caches those deps transparently. No more "should I add this to `pyproject.toml`?" for throwaway exploration.

### direnv for env vars

`direnv` loads a per-directory `.envrc` file whenever you `cd` into the project. It keeps secrets and tracking URIs out of your global shell and ensures every terminal session sees the same variables. Skip it if your project has no environment variables; add it the first time you reach for one.

Install once (`brew install direnv`, then hook into your shell per the docs). In the project:

```bash
# .envrc — commit this file
use python .venv/bin/python    # pin Python to the uv-managed venv
source_up                      # inherit vars from parent .envrc if present

# Experiment tracking
export MLFLOW_TRACKING_URI="http://localhost:5000"

# Data paths (relative to repo root)
export DATA_DIR="$PWD/data"
export MODELS_DIR="$PWD/models"

# Make imports work without installing the package
export PYTHONPATH="$PWD/src:$PYTHONPATH"

# Secrets — source from a local-only file, never commit
[[ -f .envrc.local ]] && source_env .envrc.local
```

Add `.envrc.local` to `.gitignore` and put any actual secrets there (API keys, DB passwords). Run `direnv allow` once after creating or editing `.envrc`; `direnv` will refuse to load until you do. The moment you `cd` out of the project, all variables unload — no pollution.

### pre-commit hooks

`pre-commit` runs a configured set of checks every time you `git commit`. Keep the hook list short and fast — anything slower than a second or two trains you to use `--no-verify`, which defeats the point. For data science the right starter set is format, lint, and a couple of sanity hooks.

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.9
    hooks:
      - id: ruff-format
      - id: ruff-check
        args: [--fix]

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: end-of-file-fixer
      - id: trailing-whitespace
      - id: check-yaml
      - id: check-added-large-files
        args: [--maxkb=500]   # block accidental dataset commits

  - repo: https://github.com/kynan/nbstripout
    rev: 0.7.1
    hooks:
      - id: nbstripout          # strips notebook outputs before commit
```

Install the git hook once per clone:

```bash
uv run pre-commit install
uv run pre-commit run --all-files   # bootstrap: fix everything now
```

Deliberately excluded from this set: `mypy`, `pytest`, and `bandit`. They are all valuable, but they are slow enough that they belong in CI, not in the commit path. Fast local, thorough remote.

### When to add Docker

For greenfield solo data science, Docker is overhead you do not need. `uv sync` already gives you reproducibility on any machine with the same OS, and local iteration is faster without a container layer.

Reach for Docker only when one of these is true:

- **OS mismatch between dev and prod.** You develop on macOS but the model runs on Linux in production, and a native dependency (e.g. a C extension, a specific `libgomp`) behaves differently across platforms.
- **GPU / CUDA dependencies.** CUDA toolkit versions are tightly coupled to driver versions and OS. A pinned `nvidia/cuda` base image is the only sane way to guarantee training reproducibility across machines.
- **Handoff to MLOps or serving infra.** Production deployment targets (SageMaker, Vertex, KServe, plain Kubernetes) expect a container. Build one at the handoff boundary, not before.
- **Onboarding collaborators with hostile local setups.** A Windows colleague who cannot install `uv` natively is a reasonable reason to ship a devcontainer.

When you do add Docker, keep it thin: copy `pyproject.toml` and `uv.lock`, run `uv sync --frozen`, and let the same lockfile drive both local and container builds. That way the container is a packaging detail, not a parallel source of truth.
