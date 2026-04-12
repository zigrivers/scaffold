---
name: research-sim-engine-patterns
description: Simulation engine integration patterns including wrapping solvers as callable experiments, configuration management, mesh handling, batch job submission, and result parsing
topics: [research, simulation, engine-integration, openfoam, fenics, simpy, solver-configuration, mesh-management, batch-jobs, result-parsing]
---

Simulation engines (OpenFOAM, FEniCS, SimPy, COMSOL, Ansys) are typically standalone tools with their own input/output formats, solver configurations, and execution models. Wrapping them as callable experiments requires a uniform interface that abstracts engine-specific details while preserving access to solver parameters that matter for optimization. The key design challenge is creating a thin adapter layer that makes any simulation engine look like a function from parameters to results, without hiding failure modes or losing important solver diagnostics.

## Summary

Wrap simulation engines behind a `SimulationExperiment` interface that accepts a parameter dictionary and returns structured results including convergence status, wall-clock time, and domain-specific outputs. Manage solver configuration as declarative parameter objects that can be serialized for reproducibility. Handle mesh generation as a separate cacheable step with independence checks. Submit batch jobs through an abstraction that works locally or on HPC clusters. Parse results from engine-specific output files into a normalized format for the experiment tracker.

## Deep Guidance

### Simulation Experiment Interface

Define a uniform interface that any simulation engine adapter must implement:

```python
# src/simulation/interface.py
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

class SimulationStatus(Enum):
    CONVERGED = "converged"
    DIVERGED = "diverged"
    MAX_ITERATIONS = "max_iterations"
    TIMEOUT = "timeout"
    ERROR = "error"

@dataclass
class SimulationResult:
    """Normalized result from any simulation engine."""
    status: SimulationStatus
    outputs: dict[str, float]  # Named scalar outputs (drag_coeff, stress_max, etc.)
    fields: dict[str, Path]  # Paths to field data files (pressure, velocity, etc.)
    residuals: list[float]  # Final residual history
    wall_time_seconds: float
    iterations: int
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def is_valid(self) -> bool:
        return self.status == SimulationStatus.CONVERGED

class SimulationExperiment(ABC):
    """Interface for wrapping any simulation engine as a callable experiment."""

    @abstractmethod
    def setup(self, params: dict[str, Any]) -> Path:
        """Generate input files for the simulation. Returns case directory."""

    @abstractmethod
    def run(self, case_dir: Path, timeout_seconds: int | None = None) -> SimulationResult:
        """Execute the simulation and return parsed results."""

    @abstractmethod
    def validate_params(self, params: dict[str, Any]) -> list[str]:
        """Check parameter validity before running. Returns list of issues."""

    def __call__(self, params: dict[str, Any], timeout: int | None = None) -> SimulationResult:
        """Run the full pipeline: validate -> setup -> run."""
        issues = self.validate_params(params)
        if issues:
            raise ValueError(f"Invalid parameters: {issues}")
        case_dir = self.setup(params)
        return self.run(case_dir, timeout)
```

### OpenFOAM Adapter

OpenFOAM uses directory-based case structures with text dictionaries for configuration:

```python
# src/simulation/engines/openfoam.py
import subprocess
import time
from pathlib import Path
from typing import Any

from src.simulation.interface import SimulationExperiment, SimulationResult, SimulationStatus

class OpenFOAMExperiment(SimulationExperiment):
    """Wraps OpenFOAM as a callable simulation experiment."""

    def __init__(self, template_dir: Path, solver: str = "simpleFoam"):
        self.template_dir = template_dir
        self.solver = solver

    def validate_params(self, params: dict[str, Any]) -> list[str]:
        issues = []
        if "inlet_velocity" in params and params["inlet_velocity"] <= 0:
            issues.append("inlet_velocity must be positive")
        if "turbulence_model" in params:
            valid_models = ["kEpsilon", "kOmegaSST", "SpalartAllmaras"]
            if params["turbulence_model"] not in valid_models:
                issues.append(f"turbulence_model must be one of {valid_models}")
        return issues

    def setup(self, params: dict[str, Any]) -> Path:
        """Generate OpenFOAM case from template with parameter substitution."""
        import shutil
        import hashlib
        import json

        # Create unique case directory based on parameters
        param_hash = hashlib.md5(json.dumps(params, sort_keys=True).encode()).hexdigest()[:8]
        case_dir = Path(f"runs/openfoam_{param_hash}")
        if case_dir.exists():
            shutil.rmtree(case_dir)
        shutil.copytree(self.template_dir, case_dir)

        # Substitute parameters into OpenFOAM dictionaries
        self._write_transport_properties(case_dir, params)
        self._write_boundary_conditions(case_dir, params)
        self._write_control_dict(case_dir, params)

        return case_dir

    def run(self, case_dir: Path, timeout_seconds: int | None = None) -> SimulationResult:
        """Execute OpenFOAM solver and parse results."""
        start = time.time()

        # Run mesh generation if needed
        self._run_mesh(case_dir)

        # Run solver
        result = subprocess.run(
            [self.solver, "-case", str(case_dir)],
            capture_output=True, text=True,
            timeout=timeout_seconds,
        )
        wall_time = time.time() - start

        # Parse results
        return self._parse_results(case_dir, result, wall_time)

    def _parse_results(self, case_dir: Path, proc, wall_time: float) -> SimulationResult:
        """Parse OpenFOAM log and postProcessing output."""
        residuals = self._extract_residuals(proc.stdout)
        status = self._determine_status(residuals, proc.returncode)
        outputs = self._read_force_coefficients(case_dir)
        fields = self._find_field_files(case_dir)

        return SimulationResult(
            status=status,
            outputs=outputs,
            fields=fields,
            residuals=residuals,
            wall_time_seconds=wall_time,
            iterations=len(residuals),
            metadata={"solver": self.solver, "case_dir": str(case_dir)},
        )

    def _extract_residuals(self, log: str) -> list[float]:
        """Extract residual values from solver log."""
        import re
        pattern = r"Solving for Ux.*Final residual = ([0-9.e+-]+)"
        return [float(m) for m in re.findall(pattern, log)]

    def _determine_status(self, residuals: list[float], returncode: int) -> SimulationStatus:
        if returncode != 0:
            return SimulationStatus.ERROR
        if not residuals:
            return SimulationStatus.ERROR
        if residuals[-1] < 1e-6:
            return SimulationStatus.CONVERGED
        if residuals[-1] > residuals[0] * 100:
            return SimulationStatus.DIVERGED
        return SimulationStatus.MAX_ITERATIONS

    def _run_mesh(self, case_dir: Path) -> None:
        subprocess.run(["blockMesh", "-case", str(case_dir)], check=True, capture_output=True)

    def _write_transport_properties(self, case_dir: Path, params: dict) -> None:
        """Write constant/transportProperties with parameter values."""
        props_file = case_dir / "constant" / "transportProperties"
        nu = params.get("kinematic_viscosity", 1e-6)
        props_file.write_text(
            f"FoamFile {{ version 2.0; class dictionary; object transportProperties; }}\n"
            f"nu [0 2 -1 0 0 0 0] {nu};\n"
        )

    def _write_boundary_conditions(self, case_dir: Path, params: dict) -> None:
        """Write 0/ directory boundary condition files."""
        # Implementation substitutes inlet velocity, turbulence quantities, etc.
        pass

    def _write_control_dict(self, case_dir: Path, params: dict) -> None:
        """Write system/controlDict with iteration limits and write intervals."""
        pass

    def _read_force_coefficients(self, case_dir: Path) -> dict[str, float]:
        """Read postProcessing/forceCoeffs output."""
        coeffs_file = case_dir / "postProcessing" / "forceCoeffs" / "0" / "coefficient.dat"
        if not coeffs_file.exists():
            return {}
        lines = coeffs_file.read_text().strip().split("\n")
        last_line = lines[-1].split()
        return {"Cd": float(last_line[1]), "Cl": float(last_line[2])}

    def _find_field_files(self, case_dir: Path) -> dict[str, Path]:
        """Find the latest time directory with field outputs."""
        time_dirs = sorted(
            [d for d in case_dir.iterdir() if d.is_dir() and d.name.replace(".", "").isdigit()],
            key=lambda d: float(d.name),
        )
        if not time_dirs:
            return {}
        latest = time_dirs[-1]
        return {f.stem: f for f in latest.iterdir() if f.is_file()}
```

### FEniCS Adapter

FEniCS uses Python-native problem definitions with mesh objects and variational forms:

```python
# src/simulation/engines/fenics_adapter.py
from pathlib import Path
from typing import Any
import numpy as np

from src.simulation.interface import SimulationExperiment, SimulationResult, SimulationStatus

class FEniCSExperiment(SimulationExperiment):
    """Wraps FEniCS as a callable experiment for PDE solving."""

    def __init__(self, mesh_path: Path, problem_class: type):
        self.mesh_path = mesh_path
        self.problem_class = problem_class

    def validate_params(self, params: dict[str, Any]) -> list[str]:
        issues = []
        if "mesh_refinement" in params and params["mesh_refinement"] < 1:
            issues.append("mesh_refinement must be >= 1")
        if "youngs_modulus" in params and params["youngs_modulus"] <= 0:
            issues.append("youngs_modulus must be positive")
        return issues

    def setup(self, params: dict[str, Any]) -> Path:
        """Prepare mesh and problem configuration."""
        import json
        case_dir = Path(f"runs/fenics_{hash(frozenset(params.items())) % 10**8:08d}")
        case_dir.mkdir(parents=True, exist_ok=True)
        (case_dir / "params.json").write_text(json.dumps(params))
        return case_dir

    def run(self, case_dir: Path, timeout_seconds: int | None = None) -> SimulationResult:
        """Solve the PDE problem with given parameters."""
        import json
        import time

        params = json.loads((case_dir / "params.json").read_text())
        start = time.time()

        try:
            problem = self.problem_class(self.mesh_path, params)
            solution, residuals = problem.solve()
            wall_time = time.time() - start

            outputs = problem.extract_quantities(solution)
            solution_path = case_dir / "solution.xdmf"
            problem.save_solution(solution, solution_path)

            status = (
                SimulationStatus.CONVERGED
                if residuals[-1] < problem.tolerance
                else SimulationStatus.MAX_ITERATIONS
            )

            return SimulationResult(
                status=status,
                outputs=outputs,
                fields={"solution": solution_path},
                residuals=residuals,
                wall_time_seconds=wall_time,
                iterations=len(residuals),
            )
        except Exception as e:
            return SimulationResult(
                status=SimulationStatus.ERROR,
                outputs={},
                fields={},
                residuals=[],
                wall_time_seconds=time.time() - start,
                iterations=0,
                metadata={"error": str(e)},
            )
```

### Solver Configuration as Parameters

Treat solver settings as first-class parameters that the optimizer can tune:

```python
# src/simulation/config.py
from dataclasses import dataclass
from typing import Any

@dataclass
class SolverConfig:
    """Declarative solver configuration -- serializable and reproducible."""
    solver_type: str  # "GAMG", "PCG", "BiCGStab"
    preconditioner: str  # "DIC", "DILU", "none"
    tolerance: float = 1e-6
    relative_tolerance: float = 0.01
    max_iterations: int = 1000
    relaxation_factor: float = 0.7

    def to_dict(self) -> dict[str, Any]:
        return {
            "solver": self.solver_type,
            "preconditioner": self.preconditioner,
            "tolerance": self.tolerance,
            "relTol": self.relative_tolerance,
            "maxIter": self.max_iterations,
            "relaxationFactor": self.relaxation_factor,
        }

def solver_param_space() -> dict[str, Any]:
    """Define solver parameters as an optimizable space."""
    return {
        "solver_type": {"type": "categorical", "choices": ["GAMG", "PCG", "BiCGStab"]},
        "preconditioner": {"type": "categorical", "choices": ["DIC", "DILU", "none"]},
        "tolerance": {"type": "continuous", "low": 1e-8, "high": 1e-4, "log": True},
        "relaxation_factor": {"type": "continuous", "low": 0.3, "high": 0.95},
        "max_iterations": {"type": "discrete", "low": 100, "high": 5000, "step": 100},
    }
```

### Batch Job Submission

Abstract job submission to work locally or on HPC clusters:

```python
# src/simulation/batch.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

class JobStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"

@dataclass
class JobSpec:
    """Specification for a simulation job."""
    case_dir: Path
    command: list[str]
    num_cores: int = 1
    wall_time_hours: float = 1.0
    memory_gb: float = 4.0
    partition: str = "default"

class JobSubmitter(ABC):
    """Abstract job submission interface."""

    @abstractmethod
    def submit(self, spec: JobSpec) -> str:
        """Submit job, return job ID."""

    @abstractmethod
    def status(self, job_id: str) -> JobStatus:
        """Check job status."""

    @abstractmethod
    def wait(self, job_id: str, poll_interval: float = 30.0) -> JobStatus:
        """Block until job completes."""

class LocalSubmitter(JobSubmitter):
    """Run jobs locally as subprocesses."""

    def __init__(self):
        self._processes: dict[str, Any] = {}
        self._counter = 0

    def submit(self, spec: JobSpec) -> str:
        import subprocess
        self._counter += 1
        job_id = f"local_{self._counter}"
        proc = subprocess.Popen(
            spec.command,
            cwd=spec.case_dir,
            stdout=open(spec.case_dir / "stdout.log", "w"),
            stderr=open(spec.case_dir / "stderr.log", "w"),
        )
        self._processes[job_id] = proc
        return job_id

    def status(self, job_id: str) -> JobStatus:
        proc = self._processes[job_id]
        if proc.poll() is None:
            return JobStatus.RUNNING
        return JobStatus.COMPLETED if proc.returncode == 0 else JobStatus.FAILED

    def wait(self, job_id: str, poll_interval: float = 30.0) -> JobStatus:
        self._processes[job_id].wait()
        return self.status(job_id)
```

### Result Parsing

Parse engine-specific output into normalized formats for the experiment tracker:

```python
# src/simulation/parsers.py
from pathlib import Path
from typing import Any
import re

def parse_openfoam_log(log_path: Path) -> dict[str, Any]:
    """Extract convergence data from OpenFOAM solver log."""
    text = log_path.read_text()
    residual_pattern = r"Time = (\d+)\n.*?Solving for (\w+).*?Final residual = ([0-9.e+-]+)"
    matches = re.findall(residual_pattern, text, re.DOTALL)

    residuals_by_field: dict[str, list[float]] = {}
    for time_step, field_name, residual in matches:
        residuals_by_field.setdefault(field_name, []).append(float(residual))

    execution_time_match = re.search(r"ExecutionTime = ([0-9.]+) s", text)
    exec_time = float(execution_time_match.group(1)) if execution_time_match else 0.0

    return {
        "residuals_by_field": residuals_by_field,
        "execution_time": exec_time,
        "num_iterations": len(matches) // max(len(residuals_by_field), 1),
    }

def parse_csv_results(results_path: Path, output_columns: list[str]) -> dict[str, float]:
    """Parse final row of CSV results file for scalar outputs."""
    import csv
    with open(results_path) as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    if not rows:
        return {}
    last_row = rows[-1]
    return {col: float(last_row[col]) for col in output_columns if col in last_row}
```
