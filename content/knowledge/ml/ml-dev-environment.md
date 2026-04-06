---
name: ml-dev-environment
description: Conda/Poetry environment setup, Jupyter integration, GPU detection and configuration, and Docker for reproducible ML development
topics: [ml, dev-environment, conda, poetry, jupyter, gpu, docker, reproducibility]
---

ML development environments have more complexity than typical software projects: GPU drivers, CUDA toolkits, Python packages with native extensions, and Jupyter notebook infrastructure all need to align. A broken environment costs hours and blocks the whole team. Invest in environment standardisation upfront — the payoff is that every team member can reproduce results and that CI pipelines match local runs.

## Summary

Prefer Conda for ML projects when GPU and CUDA management is required; use Poetry for pure-Python projects or as the Python dependency manager on top of Conda. Configure Jupyter as a managed service rather than ad-hoc invocations. Detect GPU availability programmatically and handle CPU fallback gracefully. Use Docker to capture the full environment for reproducible training runs and production serving.

## Deep Guidance

### Conda vs. Poetry: When to Use Each

**Conda** is the right choice when:
- Managing GPU drivers and CUDA toolkit versions (Conda can install CUDA without root)
- Working with packages that have complex native dependencies (PyTorch, TensorFlow, OpenCV)
- Need to isolate Python version itself (not just packages)
- Team uses multiple ML frameworks with conflicting dependencies

**Poetry** is the right choice when:
- Pure-Python project or all native dependencies are available via pip
- Need strict dependency locking and reproducible installs
- Publishing a library (Poetry handles packaging well)
- Already using a Conda environment for CUDA and want finer control over Python packages

**Common hybrid pattern**: Conda manages Python version and CUDA; Poetry manages Python package dependencies inside the Conda environment.

### Conda Environment Setup

```yaml
# environment.yml — commit to git
name: myproject
channels:
  - pytorch
  - nvidia
  - conda-forge
  - defaults
dependencies:
  - python=3.11
  - cuda-toolkit=12.1
  - cudnn=8.9
  - pip>=23.0
  - pip:
    - torch==2.1.0+cu121
    - torchvision==0.16.0+cu121
    - -r requirements.txt  # or use pyproject.toml
```

```bash
# Create and activate
conda env create -f environment.yml
conda activate myproject

# Update after environment.yml changes
conda env update -f environment.yml --prune

# Export current state (for exact reproducibility audit)
conda env export > environment-lock.yml
```

**Critical**: Pin exact versions in `environment.yml`. `pytorch>=2.0` is not a reproducible spec.

### Poetry Setup (Python Dependencies)

```bash
# Initialize
poetry init

# Add dependencies
poetry add torch==2.1.0 transformers==4.35.2
poetry add --group dev pytest black mypy

# Install (creates .venv by default)
poetry install

# Run in the managed venv
poetry run python train.py
poetry run pytest
```

`pyproject.toml` example:
```toml
[tool.poetry]
name = "myproject"
version = "0.1.0"
description = "ML project"
python = "^3.11"

[tool.poetry.dependencies]
torch = "2.1.0"
transformers = "4.35.2"
hydra-core = "1.3.2"
mlflow = "2.9.2"

[tool.poetry.group.dev.dependencies]
pytest = "7.4.3"
black = "23.11.0"
mypy = "1.7.0"
nbstripout = "0.6.1"
```

### GPU Detection and Configuration

Always detect GPU availability at runtime and handle CPU fallback:

```python
# src/utils/device.py
import torch
import logging

logger = logging.getLogger(__name__)

def get_device(prefer_gpu: bool = True) -> torch.device:
    """Return the best available device with logging."""
    if prefer_gpu and torch.cuda.is_available():
        device = torch.device("cuda")
        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1e9
        logger.info(f"Using GPU: {gpu_name} ({gpu_memory:.1f} GB)")
    elif prefer_gpu and torch.backends.mps.is_available():
        # Apple Silicon
        device = torch.device("mps")
        logger.info("Using Apple MPS device")
    else:
        device = torch.device("cpu")
        logger.info("Using CPU — GPU not available or not requested")
    return device

def log_gpu_memory() -> None:
    """Log current GPU memory usage."""
    if torch.cuda.is_available():
        allocated = torch.cuda.memory_allocated() / 1e9
        reserved = torch.cuda.memory_reserved() / 1e9
        logger.debug(f"GPU memory: {allocated:.2f} GB allocated, {reserved:.2f} GB reserved")
```

**CUDA version compatibility**: PyTorch packages are built against specific CUDA versions. Always match:

| PyTorch | CUDA | CUDNN |
|---------|------|-------|
| 2.1.x | 12.1, 11.8 | 8.x |
| 2.0.x | 11.7, 11.8 | 8.x |

Check compatibility at pytorch.org before pinning.

**Multi-GPU setup** (training only — not for development):
```python
# Detect available GPUs
n_gpus = torch.cuda.device_count()
if n_gpus > 1:
    model = torch.nn.DataParallel(model)  # Simple, for research
    # Or for production: use DistributedDataParallel (see ml-training-patterns)
```

### Jupyter Integration

Run Jupyter as a managed kernel rather than an ad-hoc server:

```bash
# Install Jupyter in the project environment
poetry add --group dev jupyter jupyterlab ipykernel

# Register the project venv as a named Jupyter kernel
poetry run python -m ipykernel install --user --name myproject --display-name "MyProject (Python 3.11)"

# Launch JupyterLab
poetry run jupyter lab
```

Now all project notebooks run in the same environment as the source code.

**Recommended Jupyter extensions**:
- `nbstripout` — strips outputs before git commit
- `jupyterlab-git` — git integration in the UI
- `jupyterlab-lsp` — language server (autocomplete, type hints)

**VS Code Jupyter integration** (recommended over browser-based):
```json
// .vscode/settings.json
{
    "jupyter.kernels.filter": [
        {"path": "${workspaceFolder}/.venv/bin/python", "type": "pythonEnvironment"}
    ],
    "jupyter.notebookFileRoot": "${workspaceFolder}",
    "python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python"
}
```

### Docker for Reproducibility

Docker captures the entire environment — OS, CUDA, Python, and packages. Use it for:
- CI training runs
- Sharing experiments with collaborators who have different local setups
- Production serving (identical environment to training)

**Base `Dockerfile` for ML training**:
```dockerfile
# Use NVIDIA's official CUDA base image
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

# Set Python version
ENV PYTHON_VERSION=3.11
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python${PYTHON_VERSION} \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/bin/python${PYTHON_VERSION} /usr/bin/python

# Install Poetry
RUN pip install poetry==1.7.1
ENV POETRY_NO_INTERACTION=1 \
    POETRY_VENV_IN_PROJECT=1

WORKDIR /app

# Install dependencies (cached layer)
COPY pyproject.toml poetry.lock ./
RUN poetry install --no-root --without dev

# Copy source
COPY src/ ./src/
COPY configs/ ./configs/

# Install the project itself
RUN poetry install --without dev

ENTRYPOINT ["poetry", "run", "python", "-m", "src.training.train"]
```

**Docker Compose for development**:
```yaml
# docker-compose.yml
services:
  train:
    build: .
    volumes:
      - ./data:/app/data
      - ./models:/app/models
      - ./configs:/app/configs
    environment:
      - MLFLOW_TRACKING_URI=http://mlflow:5000
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  mlflow:
    image: ghcr.io/mlflow/mlflow:v2.9.2
    ports:
      - "5000:5000"
    volumes:
      - ./mlruns:/mlflow/mlruns
```

### Makefile Task Runner

Encode common tasks in a `Makefile` to eliminate "how do I run this?" questions:

```makefile
.PHONY: env train eval test lint clean

env:
	conda env create -f environment.yml || conda env update -f environment.yml --prune

train:
	poetry run python -m src.training.train $(ARGS)

eval:
	poetry run python -m src.evaluation.evaluator $(ARGS)

test:
	poetry run pytest tests/ -v

lint:
	poetry run black --check src/ tests/
	poetry run mypy src/

clean:
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	rm -rf .pytest_cache/
```

Usage:
```bash
make env                    # Set up environment
make train ARGS="optimizer.lr=1e-4"
make test
```
