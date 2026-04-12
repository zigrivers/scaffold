---
name: research-sim-parameter-spaces
description: Parameter space definition for simulations including continuous, discrete, and categorical dimensions, Latin Hypercube Sampling, Sobol sequences, interaction effect detection, and sensitivity analysis methods
topics: [research, simulation, parameter-space, latin-hypercube, sobol-sequences, sensitivity-analysis, morris-method, sobol-indices, dimensionality-reduction, design-of-experiments]
---

Simulation parameter spaces define the landscape an optimizer must navigate. Unlike ML hyperparameter tuning where evaluations take seconds, simulation evaluations can take hours or days, making efficient space exploration critical. The challenge is threefold: define the space correctly (capturing interactions and constraints between parameters), sample it efficiently (maximizing information per simulation run), and analyze which dimensions actually matter (sensitivity analysis) to reduce the effective dimensionality before expensive optimization.

## Summary

Define parameter spaces with explicit types (continuous, discrete, categorical), bounds, constraints, and interaction groups. Use space-filling designs (Latin Hypercube Sampling, Sobol sequences) for initial exploration rather than grid or random sampling -- they provide better coverage with fewer evaluations. Apply screening methods (Morris elementary effects) to identify active parameters before full optimization. Compute Sobol sensitivity indices to quantify main effects vs interaction effects. Reduce dimensionality by fixing insensitive parameters at nominal values, enabling tractable optimization in the active subspace.

## Deep Guidance

### Parameter Space Definition

Define spaces with rich type information that optimizers and samplers can exploit:

```python
# src/simulation/parameter_space.py
from dataclasses import dataclass, field
from enum import Enum
from typing import Any
import numpy as np

class ParamType(Enum):
    CONTINUOUS = "continuous"
    DISCRETE = "discrete"
    CATEGORICAL = "categorical"

@dataclass
class Parameter:
    """Single dimension in the parameter space."""
    name: str
    param_type: ParamType
    # Continuous/discrete bounds
    low: float | None = None
    high: float | None = None
    # Discrete step size
    step: float | None = None
    # Categorical choices
    choices: list[Any] | None = None
    # Log-scale for continuous params spanning orders of magnitude
    log_scale: bool = False
    # Default/nominal value for sensitivity analysis
    nominal: Any = None
    # Group tag for interaction analysis
    group: str | None = None

    def sample_uniform(self, rng: np.random.Generator) -> Any:
        """Sample a single value uniformly from this dimension."""
        if self.param_type == ParamType.CONTINUOUS:
            if self.log_scale:
                log_val = rng.uniform(np.log(self.low), np.log(self.high))
                return float(np.exp(log_val))
            return float(rng.uniform(self.low, self.high))
        elif self.param_type == ParamType.DISCRETE:
            steps = int((self.high - self.low) / self.step) + 1
            return float(self.low + rng.integers(steps) * self.step)
        else:
            return self.choices[rng.integers(len(self.choices))]

    def normalize(self, value: Any) -> float:
        """Map value to [0, 1] for space-filling designs."""
        if self.param_type == ParamType.CATEGORICAL:
            return self.choices.index(value) / max(len(self.choices) - 1, 1)
        if self.log_scale:
            return (np.log(value) - np.log(self.low)) / (np.log(self.high) - np.log(self.low))
        return (value - self.low) / (self.high - self.low)

    def denormalize(self, unit_value: float) -> Any:
        """Map [0, 1] back to parameter value."""
        if self.param_type == ParamType.CATEGORICAL:
            idx = int(round(unit_value * (len(self.choices) - 1)))
            return self.choices[min(idx, len(self.choices) - 1)]
        if self.log_scale:
            log_val = np.log(self.low) + unit_value * (np.log(self.high) - np.log(self.low))
            return float(np.exp(log_val))
        raw = self.low + unit_value * (self.high - self.low)
        if self.param_type == ParamType.DISCRETE:
            return float(round((raw - self.low) / self.step) * self.step + self.low)
        return float(raw)


@dataclass
class ParameterSpace:
    """Full parameter space with constraints and interaction structure."""
    parameters: list[Parameter]
    constraints: list[Any] = field(default_factory=list)  # Callable[[dict], bool]

    @property
    def dimension(self) -> int:
        return len(self.parameters)

    @property
    def continuous_dims(self) -> list[Parameter]:
        return [p for p in self.parameters if p.param_type == ParamType.CONTINUOUS]

    def sample_valid(self, rng: np.random.Generator, max_attempts: int = 100) -> dict[str, Any]:
        """Sample a valid point satisfying all constraints."""
        for _ in range(max_attempts):
            point = {p.name: p.sample_uniform(rng) for p in self.parameters}
            if all(c(point) for c in self.constraints):
                return point
        raise RuntimeError(f"Failed to sample valid point in {max_attempts} attempts")

    def groups(self) -> dict[str, list[Parameter]]:
        """Group parameters by interaction group."""
        groups: dict[str, list[Parameter]] = {}
        for p in self.parameters:
            key = p.group or "ungrouped"
            groups.setdefault(key, []).append(p)
        return groups
```

### Latin Hypercube Sampling

LHS ensures each parameter dimension is evenly covered, avoiding gaps and clusters that random sampling produces:

```python
# src/simulation/sampling/lhs.py
import numpy as np
from src.simulation.parameter_space import ParameterSpace

def latin_hypercube_sample(
    space: ParameterSpace,
    n_samples: int,
    seed: int = 42,
    criterion: str = "maximin",
) -> list[dict[str, any]]:
    """Generate LHS design with maximin distance optimization."""
    rng = np.random.default_rng(seed)
    d = space.dimension

    # Generate base LHS in unit hypercube
    unit_samples = _generate_lhs(n_samples, d, rng)

    # Optimize placement using maximin criterion
    if criterion == "maximin":
        unit_samples = _optimize_maximin(unit_samples, rng, iterations=1000)

    # Map from unit cube to parameter space
    samples = []
    for row in unit_samples:
        point = {}
        for i, param in enumerate(space.parameters):
            point[param.name] = param.denormalize(row[i])
        # Check constraints, resample if violated
        if all(c(point) for c in space.constraints):
            samples.append(point)

    return samples

def _generate_lhs(n: int, d: int, rng: np.random.Generator) -> np.ndarray:
    """Generate basic LHS design: one sample per stratum per dimension."""
    result = np.zeros((n, d))
    for j in range(d):
        perm = rng.permutation(n)
        for i in range(n):
            result[i, j] = (perm[i] + rng.uniform()) / n
    return result

def _optimize_maximin(
    samples: np.ndarray, rng: np.random.Generator, iterations: int = 1000
) -> np.ndarray:
    """Improve LHS by maximizing minimum distance between points."""
    best = samples.copy()
    best_min_dist = _min_distance(best)

    for _ in range(iterations):
        candidate = best.copy()
        # Swap two elements in a random column
        col = rng.integers(candidate.shape[1])
        i, j = rng.choice(candidate.shape[0], size=2, replace=False)
        candidate[i, col], candidate[j, col] = candidate[j, col], candidate[i, col]

        min_dist = _min_distance(candidate)
        if min_dist > best_min_dist:
            best = candidate
            best_min_dist = min_dist

    return best

def _min_distance(samples: np.ndarray) -> float:
    """Compute minimum pairwise Euclidean distance."""
    from scipy.spatial.distance import pdist
    return pdist(samples).min()
```

### Sobol Sequences

Sobol sequences provide quasi-random low-discrepancy points with better uniformity guarantees than LHS for high dimensions:

```python
# src/simulation/sampling/sobol.py
import numpy as np
from scipy.stats.qmc import Sobol
from src.simulation.parameter_space import ParameterSpace

def sobol_sample(
    space: ParameterSpace,
    n_samples: int,
    seed: int = 42,
    skip: int = 0,
) -> list[dict[str, any]]:
    """Generate Sobol quasi-random sequence mapped to parameter space."""
    d = space.dimension
    # Sobol requires n = 2^m samples for optimal properties
    m = int(np.ceil(np.log2(n_samples)))
    n_power_of_2 = 2**m

    sampler = Sobol(d, scramble=True, seed=seed)
    if skip > 0:
        sampler.fast_forward(skip)
    unit_samples = sampler.random(n_power_of_2)

    # Map to parameter space and filter by constraints
    samples = []
    for row in unit_samples[:n_samples]:
        point = {
            param.name: param.denormalize(row[i])
            for i, param in enumerate(space.parameters)
        }
        if all(c(point) for c in space.constraints):
            samples.append(point)

    return samples
```

### Morris Method (Elementary Effects)

Morris method is a screening technique that identifies which parameters are active using only O(d) evaluations per trajectory:

```python
# src/simulation/sensitivity/morris.py
import numpy as np
from typing import Callable
from src.simulation.parameter_space import ParameterSpace

def morris_screening(
    space: ParameterSpace,
    evaluate_fn: Callable[[dict], float],
    num_trajectories: int = 10,
    num_levels: int = 4,
    seed: int = 42,
) -> dict[str, dict[str, float]]:
    """Compute Morris elementary effects for parameter screening.

    Returns dict mapping param name -> {mu_star, sigma} where:
    - mu_star: mean absolute elementary effect (importance)
    - sigma: std of effects (non-linearity / interaction indicator)
    """
    rng = np.random.default_rng(seed)
    d = space.dimension
    delta = num_levels / (2 * (num_levels - 1))

    effects: dict[str, list[float]] = {p.name: [] for p in space.parameters}

    for _ in range(num_trajectories):
        # Generate trajectory: d+1 points where each step perturbs one parameter
        trajectory = _generate_trajectory(d, num_levels, delta, rng)

        # Evaluate all points in trajectory
        values = []
        for unit_point in trajectory:
            point = {
                param.name: param.denormalize(unit_point[i])
                for i, param in enumerate(space.parameters)
            }
            values.append(evaluate_fn(point))

        # Compute elementary effects
        for step_idx in range(d):
            effect = (values[step_idx + 1] - values[step_idx]) / delta
            effects[space.parameters[step_idx].name].append(effect)

    # Compute summary statistics
    results = {}
    for name, efs in effects.items():
        efs_arr = np.array(efs)
        results[name] = {
            "mu_star": float(np.mean(np.abs(efs_arr))),
            "sigma": float(np.std(efs_arr)),
            "mu": float(np.mean(efs_arr)),
        }

    return results

def _generate_trajectory(
    d: int, num_levels: int, delta: float, rng: np.random.Generator
) -> np.ndarray:
    """Generate one Morris trajectory (d+1 points)."""
    # Start from random base point on the grid
    grid_values = np.linspace(0, 1, num_levels)
    base = rng.choice(grid_values, size=d)

    trajectory = [base.copy()]
    order = rng.permutation(d)

    for dim in order:
        new_point = trajectory[-1].copy()
        direction = rng.choice([-1, 1])
        new_point[dim] = np.clip(new_point[dim] + direction * delta, 0, 1)
        trajectory.append(new_point)

    return np.array(trajectory)
```

### Sobol Sensitivity Indices

Sobol indices decompose output variance into contributions from individual parameters and their interactions:

```python
# src/simulation/sensitivity/sobol_indices.py
import numpy as np
from typing import Callable
from src.simulation.parameter_space import ParameterSpace

def compute_sobol_indices(
    space: ParameterSpace,
    evaluate_fn: Callable[[dict], float],
    n_samples: int = 1024,
    seed: int = 42,
) -> dict[str, dict[str, float]]:
    """Compute first-order and total Sobol sensitivity indices.

    Returns dict mapping param name -> {S1, ST} where:
    - S1: first-order index (main effect of this parameter alone)
    - ST: total-order index (including all interactions)
    - ST - S1: interaction contribution
    """
    from scipy.stats.qmc import Sobol as SobolSampler

    d = space.dimension
    sampler = SobolSampler(2 * d, scramble=True, seed=seed)
    raw = sampler.random(n_samples)

    # Split into two independent matrices A and B
    A = raw[:, :d]
    B = raw[:, d:]

    # Evaluate base matrices
    y_A = np.array([_eval_unit(space, evaluate_fn, A[i]) for i in range(n_samples)])
    y_B = np.array([_eval_unit(space, evaluate_fn, B[i]) for i in range(n_samples)])

    var_total = np.var(np.concatenate([y_A, y_B]))
    results = {}

    for j, param in enumerate(space.parameters):
        # AB_j: A with column j replaced by B's column j
        AB_j = A.copy()
        AB_j[:, j] = B[:, j]
        y_AB_j = np.array([_eval_unit(space, evaluate_fn, AB_j[i]) for i in range(n_samples)])

        # First-order: S1_j = V[E[Y|X_j]] / V[Y]
        s1 = float(np.mean(y_B * (y_AB_j - y_A)) / var_total) if var_total > 0 else 0.0

        # Total-order: ST_j = E[V[Y|X_~j]] / V[Y]
        st = float(0.5 * np.mean((y_A - y_AB_j) ** 2) / var_total) if var_total > 0 else 0.0

        results[param.name] = {"S1": max(0, s1), "ST": max(0, st)}

    return results

def _eval_unit(space: ParameterSpace, fn: Callable, unit_point: np.ndarray) -> float:
    """Evaluate function at a unit-cube point mapped to parameter space."""
    point = {
        param.name: param.denormalize(unit_point[i])
        for i, param in enumerate(space.parameters)
    }
    return fn(point)

def identify_active_subspace(
    sobol_results: dict[str, dict[str, float]],
    threshold: float = 0.05,
) -> tuple[list[str], list[str]]:
    """Split parameters into active (ST >= threshold) and inactive."""
    active = [name for name, idx in sobol_results.items() if idx["ST"] >= threshold]
    inactive = [name for name, idx in sobol_results.items() if idx["ST"] < threshold]
    return active, inactive
```

### Dimensionality Reduction

After sensitivity analysis, fix inactive parameters and optimize in the reduced space:

```python
# src/simulation/parameter_space.py (continued)

def reduce_space(
    space: ParameterSpace,
    active_params: list[str],
) -> ParameterSpace:
    """Create reduced space containing only active parameters."""
    active_set = set(active_params)
    reduced_params = [p for p in space.parameters if p.name in active_set]

    # Constraints that reference only active parameters still apply
    reduced_constraints = []
    for constraint in space.constraints:
        # Keep constraint if it only involves active parameters
        # (requires constraint introspection or explicit annotation)
        reduced_constraints.append(constraint)

    return ParameterSpace(parameters=reduced_params, constraints=reduced_constraints)

def fix_inactive_parameters(
    space: ParameterSpace,
    inactive_params: list[str],
) -> dict[str, any]:
    """Return fixed values for inactive parameters (use nominals)."""
    inactive_set = set(inactive_params)
    fixed = {}
    for param in space.parameters:
        if param.name in inactive_set:
            if param.nominal is not None:
                fixed[param.name] = param.nominal
            elif param.param_type == ParamType.CONTINUOUS:
                fixed[param.name] = (param.low + param.high) / 2
            elif param.param_type == ParamType.DISCRETE:
                fixed[param.name] = param.low + ((param.high - param.low) // 2)
            else:
                fixed[param.name] = param.choices[0]
    return fixed
```
