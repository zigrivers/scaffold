---
name: ml-training-patterns
description: Data loaders, training loops, distributed training with DDP and FSDP, checkpointing strategies, and hyperparameter tuning patterns
topics: [ml, training, data-loaders, distributed-training, ddp, fsdp, checkpointing, hyperparameter-tuning]
---

The training loop is the heart of every ML project, but it is also where most bugs hide: data leaking between splits, gradients not zeroed, mixed precision overflows, checkpoints saved incorrectly, and distributed training hanging on a single slow worker. These are not exotic edge cases — they are the standard bugs that every ML engineer encounters. A well-structured training pipeline prevents them through clear separation of concerns and defensive coding.

## Summary

Build training pipelines with properly configured data loaders (worker count, pinned memory, prefetch), clean training loops with explicit gradient management, mixed precision for efficiency, and robust checkpointing. For large models or large datasets, use PyTorch DDP for multi-GPU training or FSDP for models too large to fit on a single GPU. Manage hyperparameter search with a systematic tool (Optuna, Ray Tune, W&B Sweeps) rather than manual iteration.

## Deep Guidance

### Data Loaders

`torch.utils.data.DataLoader` is the standard interface for batched data loading. Configure it correctly:

```python
from torch.utils.data import DataLoader
from src.data.dataset import MyDataset

def build_dataloader(
    dataset: MyDataset,
    batch_size: int,
    split: str,
    num_workers: int = 4,
) -> DataLoader:
    is_train = split == "train"
    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=is_train,           # Shuffle only training data
        num_workers=num_workers,     # Parallel data loading workers
        pin_memory=True,             # Pin CPU memory for faster GPU transfer
        prefetch_factor=2,           # Prefetch 2 batches per worker
        persistent_workers=True,     # Keep workers alive between epochs
        drop_last=is_train,          # Drop incomplete final batch (training only)
    )
```

**`num_workers` guidance**:
- Start with `min(os.cpu_count(), 8)` and tune from there
- Set to 0 for debugging (single-process, easier stack traces)
- On Windows, set to 0 if you encounter multiprocessing issues
- Bottleneck check: if GPU utilisation < 80%, increase workers or enable prefetch

**Common data loader bugs**:
- Using `shuffle=True` on validation/test sets (breaks reproducibility checks)
- Not setting `worker_init_fn` when using random augmentation in workers (workers share the same seed without this)
- `pin_memory=True` on a machine without GPU (no-op but wastes memory)

### Training Loop Structure

```python
def train_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module,
    scaler: torch.cuda.amp.GradScaler,
    device: torch.device,
) -> dict[str, float]:
    model.train()
    total_loss = 0.0
    n_batches = 0

    for batch in loader:
        inputs, targets = batch
        inputs = inputs.to(device, non_blocking=True)
        targets = targets.to(device, non_blocking=True)

        # Zero gradients BEFORE forward pass
        optimizer.zero_grad(set_to_none=True)  # Faster than zero_grad()

        # Mixed precision forward pass
        with torch.autocast(device_type="cuda", dtype=torch.float16):
            outputs = model(inputs)
            loss = criterion(outputs, targets)

        # Scaled backward pass
        scaler.scale(loss).backward()

        # Gradient clipping (before unscaling)
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

        # Optimizer step
        scaler.step(optimizer)
        scaler.update()

        total_loss += loss.item()
        n_batches += 1

    return {"loss": total_loss / n_batches}
```

**Critical training loop rules**:
1. `model.train()` before training, `model.eval()` before evaluation — these affect BatchNorm and Dropout
2. `optimizer.zero_grad()` at the start of each batch, not the end
3. Clip gradients before the optimizer step
4. Use `loss.item()` (not `loss`) when accumulating — `.item()` detaches from the computation graph

### Mixed Precision Training

Mixed precision (float16/bfloat16 for computation, float32 for parameters) typically provides 2–3x speedup on modern GPUs with minimal accuracy impact:

```python
# Setup
scaler = torch.cuda.amp.GradScaler()

# Training step (shown above)
with torch.autocast(device_type="cuda", dtype=torch.float16):
    outputs = model(inputs)
    loss = criterion(outputs, targets)

scaler.scale(loss).backward()
scaler.unscale_(optimizer)
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
scaler.step(optimizer)
scaler.update()
```

**bfloat16 vs float16**:
- `bfloat16`: Same dynamic range as float32, less precision. Better for training stability. Requires Ampere GPU (A100, A30, RTX 30xx) or newer.
- `float16`: Better precision than bfloat16 but narrower dynamic range (overflow risk). Works on all CUDA GPUs.
- Default to `bfloat16` on Ampere+, `float16` on older GPUs.

### Checkpointing

Save and restore training state completely — not just model weights:

```python
def save_checkpoint(
    path: str,
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    scheduler,
    scaler: torch.cuda.amp.GradScaler,
    epoch: int,
    metrics: dict,
) -> None:
    torch.save({
        "epoch": epoch,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "scheduler_state_dict": scheduler.state_dict(),
        "scaler_state_dict": scaler.state_dict(),
        "metrics": metrics,
    }, path)

def load_checkpoint(path: str, model, optimizer, scheduler, scaler):
    checkpoint = torch.load(path, map_location="cpu")
    model.load_state_dict(checkpoint["model_state_dict"])
    optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
    scheduler.load_state_dict(checkpoint["scheduler_state_dict"])
    scaler.load_state_dict(checkpoint["scaler_state_dict"])
    return checkpoint["epoch"], checkpoint["metrics"]
```

**Checkpoint strategy**:
- Save every N epochs AND on best validation metric (two separate files)
- Keep last K checkpoints (delete older ones to save disk)
- Always test checkpoint resume — bugs in resume code are discovered in production during long training runs, not in testing

### Distributed Training: DDP

PyTorch DistributedDataParallel (DDP) is the standard for multi-GPU training. Each GPU runs an independent process with a full model copy; gradients are averaged across GPUs after each backward pass:

```python
# Launch: torchrun --nproc_per_node=4 train.py
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data.distributed import DistributedSampler

def train_distributed():
    dist.init_process_group(backend="nccl")
    rank = dist.get_rank()
    local_rank = int(os.environ["LOCAL_RANK"])
    world_size = dist.get_world_size()

    device = torch.device(f"cuda:{local_rank}")
    torch.cuda.set_device(device)

    model = MyModel().to(device)
    model = DDP(model, device_ids=[local_rank])

    # Each rank gets a different data partition
    sampler = DistributedSampler(dataset, num_replicas=world_size, rank=rank)
    loader = DataLoader(dataset, sampler=sampler, batch_size=batch_size_per_gpu)

    for epoch in range(epochs):
        sampler.set_epoch(epoch)  # Required for shuffle to work correctly
        train_epoch(model, loader, ...)

    # Save only from rank 0
    if rank == 0:
        torch.save(model.module.state_dict(), "model.pt")  # .module unwraps DDP

    dist.destroy_process_group()
```

**DDP best practices**:
- Use `torchrun` (not `torch.multiprocessing.spawn`) for launch
- Effective batch size = `batch_size_per_gpu × world_size` — scale learning rate accordingly (linear scaling rule)
- Always call `sampler.set_epoch(epoch)` or shuffle is deterministic across epochs
- Log and save only from rank 0

### Distributed Training: FSDP

Fully Sharded Data Parallel (FSDP) shards model parameters across GPUs, enabling training of models too large for a single GPU:

```python
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP
from torch.distributed.fsdp import MixedPrecision
import torch

bf16_policy = MixedPrecision(
    param_dtype=torch.bfloat16,
    reduce_dtype=torch.bfloat16,
    buffer_dtype=torch.bfloat16,
)

model = FSDP(
    model,
    mixed_precision=bf16_policy,
    auto_wrap_policy=transformer_auto_wrap_policy,  # Wrap each transformer layer
)
```

Use FSDP when model parameters exceed single-GPU memory. Use DDP when the model fits on one GPU — DDP is simpler and has less communication overhead.

### Hyperparameter Tuning

Never tune hyperparameters manually at scale. Use a systematic search tool:

**Optuna** (open source, flexible):
```python
import optuna

def objective(trial: optuna.Trial) -> float:
    lr = trial.suggest_float("lr", 1e-5, 1e-2, log=True)
    batch_size = trial.suggest_categorical("batch_size", [16, 32, 64])
    dropout = trial.suggest_float("dropout", 0.0, 0.5)

    model = build_model(dropout=dropout)
    val_loss = train_and_evaluate(model, lr=lr, batch_size=batch_size)
    return val_loss  # Optuna minimises by default

study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler())
study.optimize(objective, n_trials=50, n_jobs=4)

print(f"Best params: {study.best_params}")
print(f"Best value: {study.best_value:.4f}")
```

**Key hyperparameters to tune** (in order of impact):
1. Learning rate (most impactful — always tune first)
2. Batch size (affects generalisation and training speed)
3. Architecture (model size, depth, width)
4. Regularisation (dropout, weight decay)
5. Learning rate schedule (warmup steps, decay type)

**Search strategies**:
- Random search: Surprisingly effective, easy to parallelise
- Bayesian optimisation (TPE in Optuna): More efficient for small budgets
- Grid search: Only for 1–2 hyperparameters with small ranges

Report the best result with multiple seeds (mean ± std) — a single seed result may be a lucky draw.
