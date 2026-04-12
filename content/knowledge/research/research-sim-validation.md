---
name: research-sim-validation
description: Simulation validation methodology including comparison against analytical solutions, mesh independence studies, convergence testing, Richardson extrapolation, uncertainty quantification, and the verification vs validation distinction
topics: [research, simulation, validation, verification, mesh-independence, convergence, richardson-extrapolation, uncertainty-quantification, analytical-solutions, mms]
---

Simulation validation answers the fundamental question: does this simulation represent reality? Verification asks a different question: does the code correctly solve the mathematical model? Both are essential -- a perfectly verified code solving the wrong equations is useless, and an unverified code matching experiments might be right for the wrong reasons. The validation pipeline establishes trust in simulation results by systematically comparing against known solutions, demonstrating grid independence, quantifying numerical uncertainty, and documenting the conditions under which the simulation is reliable.

## Summary

Distinguish verification (solving equations right) from validation (solving the right equations). Verify code against analytical solutions and manufactured solutions (MMS) where exact answers are known. Demonstrate mesh independence through systematic refinement studies showing solution convergence. Apply Richardson extrapolation to estimate the grid-converged solution and quantify discretization error. Perform uncertainty quantification to propagate input uncertainties through the simulation. Document validation domains -- the parameter ranges where the simulation has been shown to agree with experiments within stated tolerances.

## Deep Guidance

### Verification vs Validation Framework

Establish the V&V hierarchy before running any production simulations:

```python
# src/simulation/validation/framework.py
from dataclasses import dataclass, field
from enum import Enum
from typing import Any
from pathlib import Path

class VVLevel(Enum):
    """Levels in the verification & validation hierarchy."""
    CODE_VERIFICATION = "code_verification"  # Does code solve equations correctly?
    SOLUTION_VERIFICATION = "solution_verification"  # Is this specific solution converged?
    VALIDATION = "validation"  # Does the model represent reality?
    PREDICTION = "prediction"  # Extrapolation beyond validated domain

@dataclass
class VVResult:
    """Result of a verification or validation test."""
    level: VVLevel
    test_name: str
    passed: bool
    expected_value: float | None = None
    computed_value: float | None = None
    error: float | None = None
    tolerance: float | None = None
    details: dict[str, Any] = field(default_factory=dict)

@dataclass
class ValidationDomain:
    """Documents the parameter range where simulation is validated."""
    parameter_ranges: dict[str, tuple[float, float]]
    validated_outputs: list[str]
    max_error_percent: float
    reference: str  # Paper, experiment, or analytical solution
    conditions: list[str] = field(default_factory=list)

class ValidationSuite:
    """Manages a collection of V&V tests for a simulation code."""

    def __init__(self):
        self.results: list[VVResult] = []
        self.domains: list[ValidationDomain] = []

    def add_analytical_test(
        self,
        name: str,
        computed: float,
        exact: float,
        tolerance: float = 1e-3,
    ) -> VVResult:
        """Compare against known analytical solution."""
        error = abs(computed - exact) / abs(exact) if exact != 0 else abs(computed)
        result = VVResult(
            level=VVLevel.CODE_VERIFICATION,
            test_name=name,
            passed=error <= tolerance,
            expected_value=exact,
            computed_value=computed,
            error=error,
            tolerance=tolerance,
        )
        self.results.append(result)
        return result

    def is_in_validated_domain(self, params: dict[str, float]) -> bool:
        """Check if parameters fall within a validated domain."""
        for domain in self.domains:
            in_domain = all(
                domain.parameter_ranges[k][0] <= params.get(k, float("inf")) <= domain.parameter_ranges[k][1]
                for k in domain.parameter_ranges
            )
            if in_domain:
                return True
        return False

    def summary(self) -> dict[str, Any]:
        """Summary of V&V status."""
        by_level = {}
        for result in self.results:
            level = result.level.value
            by_level.setdefault(level, {"passed": 0, "failed": 0})
            if result.passed:
                by_level[level]["passed"] += 1
            else:
                by_level[level]["failed"] += 1
        return by_level
```

### Analytical Solution Comparison

Compare simulation output against problems with known exact solutions:

```python
# src/simulation/validation/analytical.py
import numpy as np
from dataclasses import dataclass
from typing import Callable

@dataclass
class AnalyticalTestCase:
    """A test case with known exact solution."""
    name: str
    description: str
    setup_params: dict  # Parameters to configure the simulation
    exact_solution: Callable[[np.ndarray], np.ndarray]  # f(x) -> solution
    error_norm: str = "L2"  # L2, Linf, L1
    expected_order: float = 2.0  # Expected convergence order

def compute_error_norms(
    computed: np.ndarray,
    exact: np.ndarray,
    dx: float | None = None,
) -> dict[str, float]:
    """Compute multiple error norms between computed and exact solutions."""
    diff = computed - exact
    norms = {
        "L_inf": float(np.max(np.abs(diff))),
        "L2": float(np.sqrt(np.mean(diff**2))),
        "L1": float(np.mean(np.abs(diff))),
    }
    if dx is not None:
        # Proper integral norms for non-uniform grids
        norms["L2_integral"] = float(np.sqrt(np.sum(diff**2 * dx)))
    # Relative errors
    exact_norm = np.sqrt(np.mean(exact**2))
    if exact_norm > 0:
        norms["relative_L2"] = norms["L2"] / exact_norm
    return norms

def manufactured_solution_source(
    solution_func: Callable,
    operator: Callable,
) -> Callable:
    """Method of Manufactured Solutions: compute source term for a chosen solution.

    Given a desired solution u(x) and the PDE operator L, compute
    the source term f = L(u) so that u is the exact solution of L(u) = f.
    """
    def source_term(x: np.ndarray) -> np.ndarray:
        return operator(solution_func, x)
    return source_term
```

### Mesh Independence Studies

Systematically refine the mesh to demonstrate solution convergence:

```python
# src/simulation/validation/mesh_study.py
from dataclasses import dataclass
import numpy as np
from typing import Any, Callable

@dataclass
class MeshLevel:
    """One level in a mesh refinement study."""
    name: str
    element_count: int
    characteristic_size: float  # h = representative element size
    result: dict[str, float] | None = None
    wall_time: float = 0.0

@dataclass
class MeshStudyResult:
    """Results of a mesh independence study."""
    levels: list[MeshLevel]
    quantity_name: str
    converged: bool
    convergence_order: float | None
    richardson_estimate: float | None
    discretization_error: float | None
    gci: float | None  # Grid Convergence Index

def run_mesh_independence_study(
    run_simulation: Callable[[float], dict[str, float]],
    mesh_sizes: list[float],
    quantity: str,
    refinement_ratio: float = 2.0,
    safety_factor: float = 1.25,
) -> MeshStudyResult:
    """Run simulations at multiple mesh resolutions and assess convergence.

    Args:
        run_simulation: function(h) -> {quantity: value} for a given mesh size h
        mesh_sizes: list of characteristic element sizes (coarse to fine)
        quantity: name of the output quantity to track
        refinement_ratio: ratio between successive mesh sizes
        safety_factor: GCI safety factor (1.25 for 3+ grids, 3.0 for 2 grids)
    """
    levels = []
    for h in sorted(mesh_sizes, reverse=True):  # Coarse to fine
        result = run_simulation(h)
        levels.append(MeshLevel(
            name=f"h={h:.4f}",
            element_count=int(1.0 / h**2),  # Approximate for 2D
            characteristic_size=h,
            result=result,
        ))

    # Need at least 3 levels for Richardson extrapolation
    if len(levels) < 3:
        values = [lev.result[quantity] for lev in levels if lev.result]
        converged = len(values) >= 2 and abs(values[-1] - values[-2]) / abs(values[-1]) < 0.01
        return MeshStudyResult(
            levels=levels, quantity_name=quantity,
            converged=converged, convergence_order=None,
            richardson_estimate=None, discretization_error=None, gci=None,
        )

    # Richardson extrapolation with three finest grids
    f1 = levels[-1].result[quantity]  # Finest
    f2 = levels[-2].result[quantity]  # Medium
    f3 = levels[-3].result[quantity]  # Coarse
    h1 = levels[-1].characteristic_size
    h2 = levels[-2].characteristic_size

    r = h2 / h1  # Refinement ratio

    # Observed convergence order
    if (f2 - f3) != 0 and (f1 - f2) / (f2 - f3) > 0:
        p = np.log(abs((f3 - f2) / (f2 - f1))) / np.log(r)
    else:
        p = None

    # Richardson extrapolation estimate
    if p is not None and p > 0:
        richardson = f1 + (f1 - f2) / (r**p - 1)
        error = abs(f1 - richardson) / abs(richardson) if richardson != 0 else abs(f1 - richardson)
        # Grid Convergence Index
        gci = safety_factor * abs((f1 - f2) / f1) / (r**p - 1)
    else:
        richardson = None
        error = None
        gci = None

    converged = error is not None and error < 0.02  # 2% threshold

    return MeshStudyResult(
        levels=levels,
        quantity_name=quantity,
        converged=converged,
        convergence_order=float(p) if p else None,
        richardson_estimate=float(richardson) if richardson else None,
        discretization_error=float(error) if error else None,
        gci=float(gci) if gci else None,
    )
```

### Convergence Testing

Monitor iterative solver convergence to detect problems early:

```python
# src/simulation/validation/convergence.py
from dataclasses import dataclass
import numpy as np

@dataclass
class ConvergenceMetrics:
    """Metrics describing iterative convergence behavior."""
    converged: bool
    final_residual: float
    convergence_rate: float  # Average reduction per iteration
    oscillating: bool  # Residual oscillates rather than monotonically decreasing
    stalled: bool  # Residual stopped decreasing
    iterations_to_converge: int | None

def analyze_convergence(
    residuals: list[float],
    tolerance: float = 1e-6,
    stall_window: int = 50,
    stall_threshold: float = 0.01,
) -> ConvergenceMetrics:
    """Analyze residual history for convergence behavior."""
    if not residuals:
        return ConvergenceMetrics(
            converged=False, final_residual=float("inf"),
            convergence_rate=0, oscillating=False, stalled=True,
            iterations_to_converge=None,
        )

    arr = np.array(residuals)
    final = arr[-1]
    converged = final < tolerance

    # Convergence rate: geometric mean reduction
    if len(arr) > 1 and arr[0] > 0:
        rate = (arr[-1] / arr[0]) ** (1 / len(arr))
    else:
        rate = 1.0

    # Oscillation detection: sign changes in differences
    if len(arr) > 2:
        diffs = np.diff(arr)
        sign_changes = np.sum(np.diff(np.sign(diffs)) != 0)
        oscillating = sign_changes > len(diffs) * 0.4
    else:
        oscillating = False

    # Stall detection: recent improvement < threshold
    if len(arr) > stall_window:
        recent = arr[-stall_window:]
        improvement = 1.0 - recent[-1] / recent[0] if recent[0] > 0 else 0
        stalled = improvement < stall_threshold
    else:
        stalled = False

    # Find iteration where tolerance was first reached
    below_tol = np.where(arr < tolerance)[0]
    iter_to_conv = int(below_tol[0]) if len(below_tol) > 0 else None

    return ConvergenceMetrics(
        converged=converged,
        final_residual=float(final),
        convergence_rate=float(rate),
        oscillating=oscillating,
        stalled=stalled,
        iterations_to_converge=iter_to_conv,
    )
```

### Uncertainty Quantification

Propagate input uncertainties through the simulation to bound output uncertainty:

```python
# src/simulation/validation/uncertainty.py
import numpy as np
from dataclasses import dataclass
from typing import Callable

@dataclass
class UncertainParameter:
    """Input parameter with associated uncertainty."""
    name: str
    nominal: float
    distribution: str  # "normal", "uniform", "lognormal"
    # For normal: std_dev; for uniform: half_width; for lognormal: sigma
    uncertainty: float

@dataclass
class UQResult:
    """Result of uncertainty quantification analysis."""
    quantity: str
    mean: float
    std: float
    ci_95: tuple[float, float]
    samples: np.ndarray
    sensitivity: dict[str, float]  # Local sensitivity dY/dX_i * sigma_i

def monte_carlo_uq(
    evaluate_fn: Callable[[dict[str, float]], float],
    uncertain_params: list[UncertainParameter],
    n_samples: int = 1000,
    seed: int = 42,
) -> UQResult:
    """Propagate uncertainties via Monte Carlo sampling."""
    rng = np.random.default_rng(seed)
    samples = np.zeros(n_samples)

    for i in range(n_samples):
        point = {}
        for param in uncertain_params:
            if param.distribution == "normal":
                point[param.name] = rng.normal(param.nominal, param.uncertainty)
            elif param.distribution == "uniform":
                point[param.name] = rng.uniform(
                    param.nominal - param.uncertainty,
                    param.nominal + param.uncertainty,
                )
            elif param.distribution == "lognormal":
                point[param.name] = rng.lognormal(
                    np.log(param.nominal), param.uncertainty
                )
        samples[i] = evaluate_fn(point)

    # Local sensitivity via finite differences at nominal
    nominal_point = {p.name: p.nominal for p in uncertain_params}
    y_nominal = evaluate_fn(nominal_point)
    sensitivity = {}
    for param in uncertain_params:
        perturbed = nominal_point.copy()
        delta = param.uncertainty * 0.01  # Small perturbation
        perturbed[param.name] = param.nominal + delta
        y_perturbed = evaluate_fn(perturbed)
        dydx = (y_perturbed - y_nominal) / delta
        sensitivity[param.name] = abs(dydx * param.uncertainty)

    return UQResult(
        quantity="output",
        mean=float(np.mean(samples)),
        std=float(np.std(samples)),
        ci_95=(float(np.percentile(samples, 2.5)), float(np.percentile(samples, 97.5))),
        samples=samples,
        sensitivity=sensitivity,
    )
```

### Validation Test Organization

Structure validation tests as a regression suite that runs with every code change:

```python
# tests/validation/conftest.py
import pytest
from src.simulation.validation.framework import ValidationSuite

@pytest.fixture
def validation_suite():
    return ValidationSuite()

# tests/validation/test_analytical.py
def test_poiseuille_flow(simulation_engine, validation_suite):
    """Verify against Poiseuille flow analytical solution."""
    # Analytical: u(y) = (dp/dx) * y * (H - y) / (2 * mu)
    params = {"pressure_gradient": 1.0, "viscosity": 0.01, "channel_height": 1.0}
    result = simulation_engine(params)

    exact_max_velocity = params["pressure_gradient"] * params["channel_height"]**2 / (8 * params["viscosity"])
    validation_suite.add_analytical_test(
        name="poiseuille_centerline_velocity",
        computed=result.outputs["max_velocity"],
        exact=exact_max_velocity,
        tolerance=0.01,  # 1% relative error
    )
    assert validation_suite.results[-1].passed

def test_mesh_independence(simulation_engine, validation_suite):
    """Demonstrate mesh-independent results for production configuration."""
    from src.simulation.validation.mesh_study import run_mesh_independence_study

    study = run_mesh_independence_study(
        run_simulation=lambda h: simulation_engine({"mesh_size": h}),
        mesh_sizes=[0.1, 0.05, 0.025, 0.0125],
        quantity="drag_coefficient",
    )
    assert study.converged, f"Mesh study did not converge: GCI={study.gci}"
    assert study.convergence_order >= 1.5, f"Order {study.convergence_order} below expected"
```
