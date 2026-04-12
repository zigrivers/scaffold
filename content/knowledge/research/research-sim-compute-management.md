---
name: research-sim-compute-management
description: Compute resource management for simulations including wall-clock budgets, job scheduling with SLURM and PBS, parallelization strategies, checkpoint/restart for long simulations, resource monitoring, and cost estimation
topics: [research, simulation, compute-management, slurm, pbs, parallelization, checkpoint-restart, resource-monitoring, cost-estimation, hpc, wall-clock-budget]
---

Simulation-based research consumes significant compute resources -- a single CFD run can take hours, and parameter sweeps multiply that by hundreds or thousands of evaluations. Effective compute management determines whether a research budget yields 50 useful results or 500. The key challenges are: allocating wall-clock budgets across the experiment campaign, scheduling jobs efficiently on shared HPC resources, choosing the right parallelization level (across parameters vs within simulations), implementing checkpoint/restart for runs that exceed time limits, and monitoring resource usage to prevent waste.

## Summary

Set explicit wall-clock budgets at the campaign level and enforce them through job-level time limits. Use SLURM or PBS job arrays for parameter sweeps, with dependency chains for multi-stage workflows. Choose between parameter-level parallelism (many independent simulations) and simulation-level parallelism (MPI domain decomposition within one run) based on problem characteristics. Implement checkpoint/restart so long simulations survive scheduler preemption and time limits. Monitor resource utilization (CPU, memory, I/O) to right-size allocations and detect inefficient runs early. Estimate costs before launching campaigns to avoid budget overruns.

## Deep Guidance

### Wall-Clock Budget Management

Define budgets at multiple levels and enforce them programmatically:

```python
# src/simulation/compute/budget.py
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

@dataclass
class ComputeBudget:
    """Hierarchical compute budget for a research campaign."""
    total_core_hours: float
    max_wall_time_per_job: timedelta = timedelta(hours=24)
    max_concurrent_jobs: int = 50
    reserve_fraction: float = 0.1  # Hold back 10% for follow-up runs

    # Tracking
    used_core_hours: float = 0.0
    jobs_submitted: int = 0
    jobs_completed: int = 0
    jobs_failed: int = 0

    @property
    def remaining_core_hours(self) -> float:
        return self.total_core_hours * (1 - self.reserve_fraction) - self.used_core_hours

    @property
    def utilization(self) -> float:
        return self.used_core_hours / self.total_core_hours if self.total_core_hours > 0 else 0

    def can_submit(self, estimated_core_hours: float) -> bool:
        """Check if budget allows submitting a new job."""
        if estimated_core_hours > self.remaining_core_hours:
            return False
        if self.jobs_submitted - self.jobs_completed >= self.max_concurrent_jobs:
            return False
        return True

    def record_completion(self, actual_core_hours: float, success: bool) -> None:
        """Record a completed job."""
        self.used_core_hours += actual_core_hours
        self.jobs_completed += 1
        if not success:
            self.jobs_failed += 1

    def estimate_remaining_runs(self, avg_core_hours_per_run: float) -> int:
        """Estimate how many more runs the budget supports."""
        if avg_core_hours_per_run <= 0:
            return 0
        return int(self.remaining_core_hours / avg_core_hours_per_run)


class BudgetEnforcer:
    """Enforces budget constraints on job submission."""

    def __init__(self, budget: ComputeBudget):
        self.budget = budget
        self._history: list[dict[str, Any]] = []

    def request_allocation(self, job_spec: dict[str, Any]) -> bool:
        """Request permission to submit a job. Returns True if allowed."""
        est_hours = job_spec["num_cores"] * job_spec["wall_hours"]
        if not self.budget.can_submit(est_hours):
            return False
        self._history.append({
            "timestamp": datetime.now().isoformat(),
            "job_spec": job_spec,
            "estimated_hours": est_hours,
        })
        self.budget.jobs_submitted += 1
        return True

    def adaptive_time_limit(self, base_hours: float, iteration: int) -> float:
        """Adjust time limits based on observed runtimes."""
        completed_times = [
            h["actual_hours"] for h in self._history
            if "actual_hours" in h
        ]
        if len(completed_times) < 5:
            return base_hours  # Not enough data yet

        # Use 90th percentile of observed times + 20% margin
        import numpy as np
        p90 = np.percentile(completed_times, 90)
        return min(base_hours, p90 * 1.2)
```

### SLURM Job Scheduling

Submit and manage jobs on SLURM-based HPC clusters:

```python
# src/simulation/compute/slurm.py
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.simulation.batch import JobSubmitter, JobSpec, JobStatus

@dataclass
class SlurmConfig:
    """SLURM-specific configuration."""
    partition: str = "standard"
    account: str = ""
    qos: str = "normal"
    modules: list[str] = None  # Modules to load before running

    def __post_init__(self):
        if self.modules is None:
            self.modules = []

class SlurmSubmitter(JobSubmitter):
    """Submit and manage SLURM jobs."""

    def __init__(self, config: SlurmConfig):
        self.config = config

    def submit(self, spec: JobSpec) -> str:
        """Submit job to SLURM, return job ID."""
        script = self._generate_script(spec)
        script_path = spec.case_dir / "job.slurm"
        script_path.write_text(script)

        result = subprocess.run(
            ["sbatch", str(script_path)],
            capture_output=True, text=True, check=True,
        )
        # Parse job ID from "Submitted batch job 12345"
        job_id = result.stdout.strip().split()[-1]
        return job_id

    def status(self, job_id: str) -> JobStatus:
        """Query SLURM for job status."""
        result = subprocess.run(
            ["sacct", "-j", job_id, "--format=State", "--noheader", "--parsable2"],
            capture_output=True, text=True,
        )
        state = result.stdout.strip().split("\n")[0] if result.stdout.strip() else ""

        status_map = {
            "PENDING": JobStatus.PENDING,
            "RUNNING": JobStatus.RUNNING,
            "COMPLETED": JobStatus.COMPLETED,
            "FAILED": JobStatus.FAILED,
            "TIMEOUT": JobStatus.TIMEOUT,
            "CANCELLED": JobStatus.FAILED,
            "OUT_OF_MEMORY": JobStatus.FAILED,
        }
        return status_map.get(state, JobStatus.PENDING)

    def wait(self, job_id: str, poll_interval: float = 30.0) -> JobStatus:
        """Wait for job completion."""
        import time
        while True:
            s = self.status(job_id)
            if s in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.TIMEOUT):
                return s
            time.sleep(poll_interval)

    def submit_array(self, specs: list[JobSpec], array_size: int | None = None) -> str:
        """Submit a SLURM job array for parameter sweeps."""
        if not specs:
            raise ValueError("Empty spec list")

        # Write parameter files
        base_dir = specs[0].case_dir.parent
        param_file = base_dir / "array_params.txt"
        param_file.write_text("\n".join(str(s.case_dir) for s in specs))

        script = self._generate_array_script(specs[0], len(specs))
        script_path = base_dir / "array_job.slurm"
        script_path.write_text(script)

        result = subprocess.run(
            ["sbatch", str(script_path)],
            capture_output=True, text=True, check=True,
        )
        return result.stdout.strip().split()[-1]

    def _generate_script(self, spec: JobSpec) -> str:
        """Generate SLURM batch script."""
        hours = int(spec.wall_time_hours)
        minutes = int((spec.wall_time_hours - hours) * 60)
        modules_str = "\n".join(f"module load {m}" for m in self.config.modules)

        return f"""#!/bin/bash
#SBATCH --job-name=sim_{spec.case_dir.name}
#SBATCH --partition={self.config.partition}
#SBATCH --account={self.config.account}
#SBATCH --qos={self.config.qos}
#SBATCH --ntasks={spec.num_cores}
#SBATCH --mem={spec.memory_gb}G
#SBATCH --time={hours:02d}:{minutes:02d}:00
#SBATCH --output={spec.case_dir}/slurm_%j.out
#SBATCH --error={spec.case_dir}/slurm_%j.err

{modules_str}

cd {spec.case_dir}
{" ".join(spec.command)}
"""

    def _generate_array_script(self, template_spec: JobSpec, array_count: int) -> str:
        """Generate SLURM array job script."""
        hours = int(template_spec.wall_time_hours)
        minutes = int((template_spec.wall_time_hours - hours) * 60)

        return f"""#!/bin/bash
#SBATCH --job-name=sweep
#SBATCH --partition={self.config.partition}
#SBATCH --account={self.config.account}
#SBATCH --array=0-{array_count - 1}
#SBATCH --ntasks={template_spec.num_cores}
#SBATCH --mem={template_spec.memory_gb}G
#SBATCH --time={hours:02d}:{minutes:02d}:00
#SBATCH --output=logs/slurm_%A_%a.out

CASE_DIR=$(sed -n "${{SLURM_ARRAY_TASK_ID}}p" array_params.txt)
cd "$CASE_DIR"
{" ".join(template_spec.command)}
"""
```

### Parallelization Strategies

Choose between parameter-level and simulation-level parallelism:

```python
# src/simulation/compute/parallel.py
from dataclasses import dataclass
from enum import Enum
from typing import Any

class ParallelStrategy(Enum):
    PARAMETER_LEVEL = "parameter"  # Many independent single-core runs
    SIMULATION_LEVEL = "simulation"  # Few multi-core runs (MPI)
    HYBRID = "hybrid"  # Some of each

@dataclass
class ParallelConfig:
    """Configuration for parallel execution strategy."""
    strategy: ParallelStrategy
    total_cores: int
    cores_per_simulation: int = 1  # For simulation-level parallelism
    max_concurrent: int | None = None  # For parameter-level parallelism

    @property
    def concurrent_simulations(self) -> int:
        if self.strategy == ParallelStrategy.PARAMETER_LEVEL:
            return self.max_concurrent or self.total_cores
        elif self.strategy == ParallelStrategy.SIMULATION_LEVEL:
            return self.total_cores // self.cores_per_simulation
        else:  # Hybrid
            return self.max_concurrent or (self.total_cores // self.cores_per_simulation)

def recommend_strategy(
    single_run_time_hours: float,
    num_evaluations: int,
    available_cores: int,
    strong_scaling_efficiency: float = 0.7,
) -> ParallelConfig:
    """Recommend parallelization strategy based on problem characteristics.

    Rules:
    - If single run < 10 min: parameter-level (overhead of MPI not worth it)
    - If single run > 4 hours and scales well: simulation-level
    - Otherwise: hybrid (medium MPI + some parameter parallelism)
    """
    if single_run_time_hours < 1/6:  # < 10 minutes
        return ParallelConfig(
            strategy=ParallelStrategy.PARAMETER_LEVEL,
            total_cores=available_cores,
            cores_per_simulation=1,
            max_concurrent=min(available_cores, num_evaluations),
        )

    if single_run_time_hours > 4 and strong_scaling_efficiency > 0.6:
        cores_per_sim = min(available_cores, 64)  # Cap at 64 for scaling
        return ParallelConfig(
            strategy=ParallelStrategy.SIMULATION_LEVEL,
            total_cores=available_cores,
            cores_per_simulation=cores_per_sim,
        )

    # Hybrid: balance between parallel sims and cores per sim
    cores_per_sim = min(8, available_cores // 4)
    return ParallelConfig(
        strategy=ParallelStrategy.HYBRID,
        total_cores=available_cores,
        cores_per_simulation=cores_per_sim,
        max_concurrent=available_cores // cores_per_sim,
    )
```

### Checkpoint/Restart

Enable long simulations to survive time limits and preemption:

```python
# src/simulation/compute/checkpoint.py
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import json
import shutil
import time

@dataclass
class CheckpointConfig:
    """Configuration for checkpoint/restart behavior."""
    checkpoint_interval_minutes: float = 30.0
    max_checkpoints_kept: int = 3
    checkpoint_dir: Path = Path("checkpoints")
    compress: bool = True

class CheckpointManager:
    """Manages checkpoint creation and restoration for simulations."""

    def __init__(self, case_dir: Path, config: CheckpointConfig):
        self.case_dir = case_dir
        self.config = config
        self.checkpoint_base = case_dir / config.checkpoint_dir
        self.checkpoint_base.mkdir(parents=True, exist_ok=True)
        self._last_checkpoint_time = time.time()

    def should_checkpoint(self) -> bool:
        """Check if enough time has elapsed for a new checkpoint."""
        elapsed = (time.time() - self._last_checkpoint_time) / 60
        return elapsed >= self.config.checkpoint_interval_minutes

    def save_checkpoint(self, state: dict[str, Any], iteration: int) -> Path:
        """Save simulation state to a checkpoint."""
        checkpoint_name = f"checkpoint_{iteration:06d}"
        checkpoint_path = self.checkpoint_base / checkpoint_name

        if checkpoint_path.exists():
            shutil.rmtree(checkpoint_path)
        checkpoint_path.mkdir()

        # Save metadata
        metadata = {
            "iteration": iteration,
            "timestamp": time.time(),
            "state_keys": list(state.keys()),
        }
        (checkpoint_path / "metadata.json").write_text(json.dumps(metadata))

        # Save state (simulation-specific files)
        for key, value in state.items():
            if isinstance(value, Path) and value.exists():
                # Copy simulation output files
                shutil.copy2(value, checkpoint_path / value.name)
            else:
                # Serialize scalar/dict state
                (checkpoint_path / f"{key}.json").write_text(json.dumps(value, default=str))

        self._last_checkpoint_time = time.time()
        self._cleanup_old_checkpoints()

        return checkpoint_path

    def latest_checkpoint(self) -> Path | None:
        """Find the most recent valid checkpoint."""
        checkpoints = sorted(self.checkpoint_base.iterdir(), reverse=True)
        for cp in checkpoints:
            metadata_file = cp / "metadata.json"
            if metadata_file.exists():
                return cp
        return None

    def restore_checkpoint(self, checkpoint_path: Path) -> dict[str, Any]:
        """Restore state from a checkpoint."""
        metadata = json.loads((checkpoint_path / "metadata.json").read_text())
        state = {"_iteration": metadata["iteration"]}

        for key in metadata["state_keys"]:
            json_file = checkpoint_path / f"{key}.json"
            if json_file.exists():
                state[key] = json.loads(json_file.read_text())

        return state

    def _cleanup_old_checkpoints(self) -> None:
        """Remove oldest checkpoints beyond max_checkpoints_kept."""
        checkpoints = sorted(self.checkpoint_base.iterdir())
        while len(checkpoints) > self.config.max_checkpoints_kept:
            oldest = checkpoints.pop(0)
            shutil.rmtree(oldest)
```

### Resource Monitoring

Track resource utilization to optimize allocations and detect waste:

```python
# src/simulation/compute/monitoring.py
from dataclasses import dataclass
import time
from typing import Any

@dataclass
class ResourceSnapshot:
    """Point-in-time resource usage."""
    timestamp: float
    cpu_percent: float
    memory_used_gb: float
    memory_total_gb: float
    disk_io_read_mb: float
    disk_io_write_mb: float

@dataclass
class JobResourceReport:
    """Summary of resource usage for a completed job."""
    job_id: str
    wall_time_hours: float
    cpu_efficiency: float  # actual CPU time / (wall time * cores)
    peak_memory_gb: float
    avg_memory_gb: float
    total_io_gb: float
    recommended_cores: int
    recommended_memory_gb: float

def analyze_job_efficiency(
    snapshots: list[ResourceSnapshot],
    allocated_cores: int,
    allocated_memory_gb: float,
) -> JobResourceReport:
    """Analyze resource usage to recommend better allocations."""
    if not snapshots:
        return JobResourceReport(
            job_id="unknown", wall_time_hours=0,
            cpu_efficiency=0, peak_memory_gb=0, avg_memory_gb=0,
            total_io_gb=0, recommended_cores=1, recommended_memory_gb=4,
        )

    cpu_values = [s.cpu_percent for s in snapshots]
    mem_values = [s.memory_used_gb for s in snapshots]

    avg_cpu = sum(cpu_values) / len(cpu_values)
    peak_mem = max(mem_values)
    avg_mem = sum(mem_values) / len(mem_values)

    # CPU efficiency: how much of allocated CPU was actually used
    cpu_efficiency = avg_cpu / (allocated_cores * 100)

    # Recommendations
    # If using < 50% CPU, reduce cores
    recommended_cores = max(1, int(allocated_cores * avg_cpu / 100 / 0.8))
    # Memory: peak + 20% headroom
    recommended_memory_gb = round(peak_mem * 1.2, 1)

    wall_time = (snapshots[-1].timestamp - snapshots[0].timestamp) / 3600

    return JobResourceReport(
        job_id="",
        wall_time_hours=wall_time,
        cpu_efficiency=cpu_efficiency,
        peak_memory_gb=peak_mem,
        avg_memory_gb=avg_mem,
        total_io_gb=sum(s.disk_io_write_mb for s in snapshots) / 1024,
        recommended_cores=recommended_cores,
        recommended_memory_gb=recommended_memory_gb,
    )
```

### Cost Estimation

Estimate campaign costs before committing resources:

```python
# src/simulation/compute/cost.py
from dataclasses import dataclass

@dataclass
class CostEstimate:
    """Estimated cost for a simulation campaign."""
    total_core_hours: float
    total_cost_usd: float
    per_run_core_hours: float
    per_run_cost_usd: float
    num_runs: int
    confidence: str  # "high", "medium", "low"
    assumptions: list[str]

def estimate_campaign_cost(
    single_run_hours: float,
    cores_per_run: int,
    num_runs: int,
    cost_per_core_hour: float = 0.05,  # Typical HPC rate
    overhead_factor: float = 1.3,  # Queue wait, failed runs, restarts
) -> CostEstimate:
    """Estimate total cost for a parameter sweep campaign."""
    per_run_hours = single_run_hours * cores_per_run
    raw_total = per_run_hours * num_runs
    total_with_overhead = raw_total * overhead_factor

    assumptions = [
        f"Single run: {single_run_hours:.1f}h on {cores_per_run} cores",
        f"Overhead factor: {overhead_factor}x (failed runs, queue inefficiency)",
        f"Cost rate: ${cost_per_core_hour}/core-hour",
    ]

    # Confidence based on estimate uncertainty
    if single_run_hours > 0 and num_runs < 100:
        confidence = "high"
    elif num_runs < 1000:
        confidence = "medium"
    else:
        confidence = "low"
        assumptions.append("Large campaign: actual costs may vary significantly")

    return CostEstimate(
        total_core_hours=total_with_overhead,
        total_cost_usd=total_with_overhead * cost_per_core_hour,
        per_run_core_hours=per_run_hours,
        per_run_cost_usd=per_run_hours * cost_per_core_hour,
        num_runs=num_runs,
        confidence=confidence,
        assumptions=assumptions,
    )
```
