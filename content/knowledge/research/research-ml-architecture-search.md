---
name: research-ml-architecture-search
description: Neural Architecture Search patterns including search space definition, search strategies, mutation operators, performance prediction, and multi-objective optimization
topics: [research, ml-research, nas, architecture-search, search-space, evolutionary, darts, surrogate-model, multi-objective]
---

Neural Architecture Search (NAS) automates the discovery of model architectures that outperform hand-designed ones. The core challenge is navigating an exponentially large search space efficiently -- evaluating every candidate is infeasible, so search strategies must balance exploration (trying diverse architectures) with exploitation (refining promising ones). A well-designed NAS pipeline defines the search space precisely, applies an appropriate search strategy, uses performance prediction to avoid wasting compute on bad candidates, and manages the total search budget to stay within resource constraints.

## Summary

Define search spaces as structured graphs with explicit operation choices and connectivity patterns. Choose search strategies based on budget: random search for baselines, evolutionary algorithms for large discrete spaces, reinforcement learning for sequential construction, and differentiable methods (DARTS) for gradient-based continuous relaxation. Use surrogate models to predict performance from partial training, reducing evaluation cost by 10-100x. Apply mutation operators that preserve architectural validity. Track Pareto frontiers for multi-objective NAS (accuracy vs latency, accuracy vs parameters).

## Deep Guidance

### Search Space Definition

The search space defines what architectures can be explored. Too narrow misses good designs; too broad wastes compute on invalid structures:

```python
# src/nas/search_space.py
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

class OperationType(Enum):
    """Primitive operations available in the search space."""
    CONV_3X3 = "conv_3x3"
    CONV_5X5 = "conv_5x5"
    SEPARABLE_CONV_3X3 = "sep_conv_3x3"
    SEPARABLE_CONV_5X5 = "sep_conv_5x5"
    DILATED_CONV_3X3 = "dil_conv_3x3"
    MAX_POOL_3X3 = "max_pool_3x3"
    AVG_POOL_3X3 = "avg_pool_3x3"
    SKIP_CONNECT = "skip_connect"
    ZERO = "zero"  # No connection

@dataclass
class SearchSpace:
    """Defines the architecture search space."""
    num_nodes: int = 7  # Nodes per cell
    num_ops_per_edge: int = 1  # Operations per edge
    available_ops: list[OperationType] = field(
        default_factory=lambda: list(OperationType)
    )
    num_cells: int = 8  # Total cells in the network
    num_reduction_cells: int = 2  # Cells that downsample
    channel_choices: list[int] = field(
        default_factory=lambda: [16, 32, 64, 128]
    )

    @property
    def space_size(self) -> int:
        """Estimate total number of architectures in the space."""
        num_edges = self.num_nodes * (self.num_nodes - 1) // 2
        ops_per_cell = len(self.available_ops) ** num_edges
        return ops_per_cell * len(self.channel_choices) ** self.num_cells

    def validate_architecture(self, arch: "Architecture") -> list[str]:
        """Check that an architecture is valid within this space."""
        issues = []
        if len(arch.cells) != self.num_cells:
            issues.append(f"Expected {self.num_cells} cells, got {len(arch.cells)}")
        for i, cell in enumerate(arch.cells):
            for edge in cell.edges:
                if edge.op not in self.available_ops:
                    issues.append(f"Cell {i}: invalid op {edge.op}")
        return issues


@dataclass
class Edge:
    src_node: int
    dst_node: int
    op: OperationType

@dataclass
class Cell:
    edges: list[Edge]
    is_reduction: bool = False

@dataclass
class Architecture:
    cells: list[Cell]
    channels: list[int]
    metadata: dict[str, Any] = field(default_factory=dict)
```

### Search Strategies

#### Random Search (Baseline)

Always implement random search first -- it is surprisingly competitive and provides the baseline that any sophisticated method must beat:

```python
# src/nas/strategies/random_search.py
import random
from src.nas.search_space import SearchSpace, Architecture, Cell, Edge

def random_architecture(space: SearchSpace, seed: int | None = None) -> Architecture:
    """Sample a uniformly random valid architecture."""
    rng = random.Random(seed)
    cells = []
    for i in range(space.num_cells):
        is_reduction = i in _reduction_positions(space)
        edges = []
        for src in range(space.num_nodes):
            for dst in range(src + 1, space.num_nodes):
                op = rng.choice(space.available_ops)
                edges.append(Edge(src_node=src, dst_node=dst, op=op))
        cells.append(Cell(edges=edges, is_reduction=is_reduction))
    channels = [rng.choice(space.channel_choices) for _ in range(space.num_cells)]
    return Architecture(cells=cells, channels=channels)

def _reduction_positions(space: SearchSpace) -> list[int]:
    """Place reduction cells evenly through the network."""
    step = space.num_cells // (space.num_reduction_cells + 1)
    return [step * (i + 1) for i in range(space.num_reduction_cells)]
```

#### Evolutionary Search

Evolutionary NAS maintains a population of architectures, selects the best, applies mutations, and iterates:

```python
# src/nas/strategies/evolutionary.py
from dataclasses import dataclass
from src.nas.search_space import SearchSpace, Architecture
from src.nas.mutation import mutate_architecture

@dataclass
class EvolutionConfig:
    population_size: int = 50
    tournament_size: int = 10
    mutation_rate: float = 0.3
    max_generations: int = 500
    early_stop_patience: int = 50  # Generations without improvement

def evolutionary_search(
    space: SearchSpace,
    evaluate_fn,  # Architecture -> float (fitness)
    config: EvolutionConfig = EvolutionConfig(),
) -> list[tuple[Architecture, float]]:
    """Run evolutionary architecture search."""
    import random

    # Initialize population
    population = [
        (random_architecture(space), None)
        for _ in range(config.population_size)
    ]
    # Evaluate initial population
    population = [(arch, evaluate_fn(arch)) for arch, _ in population]

    best_fitness = max(f for _, f in population)
    stale_generations = 0
    history = []

    for gen in range(config.max_generations):
        # Tournament selection
        parent = _tournament_select(population, config.tournament_size)

        # Mutation
        child = mutate_architecture(parent, space, config.mutation_rate)

        # Evaluate child
        child_fitness = evaluate_fn(child)

        # Replace worst in population
        population.sort(key=lambda x: x[1])
        population[0] = (child, child_fitness)

        # Track progress
        gen_best = max(f for _, f in population)
        history.append({"generation": gen, "best_fitness": gen_best})

        if gen_best > best_fitness:
            best_fitness = gen_best
            stale_generations = 0
        else:
            stale_generations += 1
            if stale_generations >= config.early_stop_patience:
                break

    population.sort(key=lambda x: x[1], reverse=True)
    return population

def _tournament_select(population, k):
    import random
    candidates = random.sample(population, k)
    return max(candidates, key=lambda x: x[1])[0]
```

#### Differentiable NAS (DARTS)

DARTS relaxes the discrete search space into a continuous one, enabling gradient-based optimization:

```python
# src/nas/strategies/darts.py
import torch
import torch.nn as nn
import torch.nn.functional as F

class MixedOp(nn.Module):
    """Weighted mixture of operations for continuous relaxation."""

    def __init__(self, channels: int, ops: list[nn.Module]):
        super().__init__()
        self.ops = nn.ModuleList(ops)
        self.alpha = nn.Parameter(torch.zeros(len(ops)))  # Architecture weights

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        weights = F.softmax(self.alpha, dim=0)
        return sum(w * op(x) for w, op in zip(weights, self.ops))

    def discretize(self) -> int:
        """Select the operation with highest weight."""
        return self.alpha.argmax().item()
```

### Mutation Operators

Mutations must preserve architectural validity while enabling meaningful exploration:

```python
# src/nas/mutation.py
import random
from src.nas.search_space import SearchSpace, Architecture, Cell, Edge

def mutate_architecture(
    arch: Architecture,
    space: SearchSpace,
    mutation_rate: float = 0.3,
) -> Architecture:
    """Apply random mutations while preserving validity."""
    import copy
    child = copy.deepcopy(arch)

    for cell in child.cells:
        for edge in cell.edges:
            if random.random() < mutation_rate:
                edge.op = random.choice(space.available_ops)

    # Optionally mutate channel widths
    for i in range(len(child.channels)):
        if random.random() < mutation_rate * 0.5:
            child.channels[i] = random.choice(space.channel_choices)

    return child

def crossover(parent_a: Architecture, parent_b: Architecture) -> Architecture:
    """Single-point crossover between two architectures."""
    import copy
    child = copy.deepcopy(parent_a)
    crossover_point = random.randint(1, len(child.cells) - 1)
    child.cells[crossover_point:] = copy.deepcopy(parent_b.cells[crossover_point:])
    child.channels[crossover_point:] = parent_b.channels[crossover_point:]
    return child
```

### Performance Prediction (Surrogates)

Full training is expensive. Surrogates predict final performance from cheap features:

```python
# src/nas/surrogate.py
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor

class PerformancePredictor:
    """Predict architecture performance from structural features."""

    def __init__(self):
        self.model = GradientBoostingRegressor(n_estimators=100)
        self.is_fitted = False

    def extract_features(self, arch: Architecture) -> np.ndarray:
        """Convert architecture to a fixed-length feature vector."""
        features = []
        for cell in arch.cells:
            op_counts = [0] * len(OperationType)
            for edge in cell.edges:
                op_counts[list(OperationType).index(edge.op)] += 1
            features.extend(op_counts)
        features.extend(arch.channels)
        return np.array(features, dtype=np.float32)

    def fit(self, architectures: list[Architecture], scores: list[float]) -> None:
        """Train surrogate on evaluated architectures."""
        X = np.array([self.extract_features(a) for a in architectures])
        self.model.fit(X, scores)
        self.is_fitted = True

    def predict(self, arch: Architecture) -> float:
        """Predict performance without full training."""
        if not self.is_fitted:
            raise RuntimeError("Surrogate not fitted yet")
        X = self.extract_features(arch).reshape(1, -1)
        return self.model.predict(X)[0]

    def acquisition_score(self, arch: Architecture) -> float:
        """Score for acquisition function (exploration vs exploitation)."""
        pred = self.predict(arch)
        # Simple UCB-style: higher predicted + bonus for uncertainty
        return pred
```

### Search Budget Management

NAS must operate within compute constraints. Track and enforce budgets:

```python
# src/nas/budget.py
from dataclasses import dataclass
import time

@dataclass
class SearchBudget:
    """Track and enforce NAS compute budget."""
    max_gpu_hours: float = 100.0
    max_evaluations: int = 1000
    max_wall_time_hours: float = 48.0

    # Running totals
    gpu_hours_used: float = 0.0
    evaluations_done: int = 0
    start_time: float = 0.0

    def start(self) -> None:
        self.start_time = time.time()

    def record_evaluation(self, gpu_hours: float) -> None:
        self.gpu_hours_used += gpu_hours
        self.evaluations_done += 1

    def is_exhausted(self) -> bool:
        wall_hours = (time.time() - self.start_time) / 3600
        return (
            self.gpu_hours_used >= self.max_gpu_hours
            or self.evaluations_done >= self.max_evaluations
            or wall_hours >= self.max_wall_time_hours
        )

    def remaining_fraction(self) -> float:
        gpu_frac = 1 - self.gpu_hours_used / self.max_gpu_hours
        eval_frac = 1 - self.evaluations_done / self.max_evaluations
        return min(gpu_frac, eval_frac)
```

### Multi-Objective NAS

Real NAS problems have multiple objectives (accuracy, latency, parameters, FLOPs). Track the Pareto frontier:

```python
# src/nas/pareto.py
from dataclasses import dataclass

@dataclass
class ObjectiveResult:
    architecture_id: str
    accuracy: float
    latency_ms: float
    params_millions: float
    flops_billions: float

def is_dominated(a: ObjectiveResult, b: ObjectiveResult) -> bool:
    """Return True if b dominates a (b is better in all objectives)."""
    return (
        b.accuracy >= a.accuracy
        and b.latency_ms <= a.latency_ms
        and b.params_millions <= a.params_millions
        and (b.accuracy > a.accuracy or b.latency_ms < a.latency_ms
             or b.params_millions < a.params_millions)
    )

def pareto_frontier(results: list[ObjectiveResult]) -> list[ObjectiveResult]:
    """Extract non-dominated solutions (Pareto frontier)."""
    frontier = []
    for candidate in results:
        dominated = any(is_dominated(candidate, other) for other in results)
        if not dominated:
            frontier.append(candidate)
    return frontier
```
