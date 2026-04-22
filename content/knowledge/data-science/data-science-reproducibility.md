---
name: data-science-reproducibility
description: Reproducibility for solo/small-team DS — pin deps with uv lock, seed everything, set PYTHONHASHSEED, and reach for Docker only at OS boundaries
topics: [data-science, reproducibility, determinism, uv, docker]
---

You show a result in Monday's meeting. Six months later, on a new laptop, you can't reproduce it. Three things usually cause this: dependencies drifted (a minor NumPy release changed a default), randomness wasn't pinned (a shuffle or init picked a different seed), or the data changed underneath you. Reproducibility is the discipline of eliminating all three so the same inputs always produce the same numbers.

## Summary

Pin dependencies with `uv lock` and commit `uv.lock` — `uv sync --frozen` rebuilds the exact environment anywhere. Control randomness with a single `set_seed(seed)` helper that seeds Python `random`, NumPy, PyTorch, and TensorFlow at the top of every script. Export `PYTHONHASHSEED=0` via `.envrc` so hash-order is deterministic across interpreter runs. Log the git SHA and data hash with every run so you can walk back to the exact code + data that produced any number. Reach for Docker only when you're crossing an OS or CUDA boundary — for greenfield solo work, `uv sync` is enough.

## Deep Guidance

### Pinning dependencies with uv

`uv` resolves the full transitive dependency graph into `uv.lock`, which records the exact version and content hash of every package, including transitive deps you never directly imported. Commit it. On a new machine, `uv sync --frozen` reproduces the environment byte-for-byte without re-resolving anything.

```bash
# First time: declare top-level deps in pyproject.toml, then lock
uv lock

# On any machine (CI, teammate's laptop, 6 months later):
uv sync --frozen       # install exactly what's in uv.lock, never re-resolve

# Upgrade a single package intentionally:
uv lock --upgrade-package numpy
# Review the lock diff in PR. Re-run your eval suite before merging.

# Add a new dependency:
uv add pandas          # updates pyproject.toml AND uv.lock atomically
```

Rules:
- Commit `uv.lock`. It is not a build artifact; it is a reproducibility contract.
- Use `--frozen` in CI and release scripts. A silent re-resolve on deploy is the bug you're trying to prevent.
- Upgrade packages one at a time, with a PR and an eval run. Bulk upgrades hide which bump broke your metrics.
- Pin the Python version too: add `requires-python = "==3.12.*"` in `pyproject.toml` and let uv install and manage the interpreter. Minor Python versions change float formatting, dict ordering guarantees, and stdlib behavior in ways that can move your numbers.

### Seed management

Every source of randomness in your stack has its own PRNG. Seed all of them from a single call, at the top of every train/eval/predict entry point.

```python
# src/utils/seed.py
import os
import random
import numpy as np

def set_seed(seed: int = 42) -> None:
    """Seed every PRNG we might touch. Call at the top of every script."""
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)

    try:
        import torch
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except ImportError:
        pass

    try:
        import tensorflow as tf
        tf.random.set_seed(seed)
    except ImportError:
        pass
```

Call `set_seed(42)` before any data split, model init, or sampling. If a library accepts a `random_state` argument (scikit-learn does almost everywhere), pass the seed explicitly — global seeding is a safety net, not a substitute.

```python
# Explicit is better than implicit:
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier

set_seed(42)  # global safety net

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42      # explicit
)
model = RandomForestClassifier(random_state=42)  # explicit
```

The one gotcha: multi-worker DataLoaders in PyTorch spawn subprocesses that need their own seeding. Pass `worker_init_fn` to seed each worker, or you'll get different augmentation sequences across runs even with `set_seed` called in the main process.

### Hash determinism

Python randomizes the hash seed per interpreter run by default. That means dict iteration order, set iteration order, and anything that depends on `hash()` varies between runs — a subtle reproducibility leak that only shows up when you try to diff two training runs.

```bash
# .envrc (direnv)
export PYTHONHASHSEED=0
```

`set_seed()` sets this too, but exporting it in `.envrc` covers everything in the shell session — notebooks, ad-hoc scripts, the test runner — before any Python code runs.

### GPU determinism (brief)

Full GPU determinism requires cuDNN-level flags and disabling non-deterministic kernels:

```python
# Only if you actually need this:
torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark = False
```

This has a real performance cost (often 10-30% slower training) and doesn't cover every op. For DS-1, don't chase it. CPU-level determinism from `set_seed()` + pinned deps is enough for 95% of analyses. Reach for GPU determinism only under regulatory requirement, scientific publication, or when debugging a numerics bug that you can't otherwise isolate.

### Git SHA and data versioning

A reproducible run needs four things pinned: code, dependencies, randomness, and data. We've covered three. For code, log the git SHA with every experiment (see `data-science-experiment-tracking.md` for the logging pattern — don't duplicate the plumbing here). For data, hash the input dataset or pin a DVC / lakeFS / Git-LFS reference (see `data-science-data-versioning.md`).

The minimum metadata for any reported result:

```text
git_sha:     a1b2c3d4
uv_lock:     sha256:...          # hash of uv.lock
seed:        42
data_hash:   sha256:...          # hash of the input dataset(s)
python:      3.12.1
platform:    darwin-arm64
```

If all five match, the numbers should match. If any differ, you know exactly which knob moved.

A working pattern: log these fields into your experiment tracker alongside metrics, and include them in any reported result (paper, slide, dashboard tile). The friction cost is near zero once automated; the debugging cost of a result you can't trace back to its exact code + data is enormous.

### Docker: only at OS boundaries

Docker solves a real problem: "it works on my Mac but not on the Linux GPU box." It does not solve "I forgot to commit `uv.lock`." Reach for containers when you're genuinely crossing a boundary:

- Developing on macOS, deploying on Linux — native wheels differ, BLAS differs, occasionally results differ.
- CUDA version mismatch between dev and prod GPUs.
- A team standardizing a shared prod environment where `uv sync` isn't enough because the base OS libs drift.

For a solo greenfield project on one laptop, a Dockerfile is pure overhead. Start with `uv sync --frozen` and add Docker the first time you actually hit a cross-OS reproducibility failure — not before.

When you do reach for it, keep the image minimal and derived from your lockfile:

```dockerfile
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY src/ ./src/
ENV PYTHONHASHSEED=0
CMD ["uv", "run", "python", "-m", "src.train"]
```

Pin the base image by digest (`python:3.12-slim@sha256:...`) once the project is in prod — floating tags drift and will silently give you a different glibc next month.

### Reproducibility checklist

Before calling any analysis "done":

- `uv.lock` committed and current (`uv sync --frozen` in CI succeeds)
- `set_seed()` called at the top of every entry point
- `PYTHONHASHSEED=0` in `.envrc` (and `.envrc` committed, `.env` gitignored)
- Git SHA + data hash logged with every experiment run
- Eval suite passes on a clean clone in CI — the real test of reproducibility is a fresh machine, not your own

