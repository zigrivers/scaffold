---
name: research-experiment-loop
description: Autonomous experiment loop patterns including hypothesis-execute-evaluate-keep/discard cycle, iteration control, budget management, and early stopping
topics: [research, experiment-loop, autonomous, iteration, budget, early-stopping, hypothesis]
---

The experiment loop is the defining pattern of research projects: an agent iteratively generates hypotheses, executes experiments, evaluates results, and makes keep/discard decisions. This loop can run autonomously (agent decides everything), with checkpoints (agent pauses for human review at intervals), or human-guided (human decides what to try, agent executes). The loop's correctness depends on proper iteration control, budget enforcement, and state management -- without these, autonomous agents will iterate forever or lose track of what has been tried.

## Summary

Implement the experiment loop as a state machine with four phases: hypothesize (select what to try next), execute (run the experiment), evaluate (compute metrics and compare to baseline), and decide (keep or discard based on success criteria). Enforce iteration budgets (run count, wall time, compute cost) and early stopping (convergence detection, diminishing returns). Persist full loop state to disk after every iteration so the loop can resume after interruption. For autonomous mode, implement safety limits that cannot be overridden by the agent.

## Deep Guidance

### The Four-Phase Loop

```
    ┌──────────────┐
    │  Hypothesize  │◄──────────────────────────┐
    │  (what next?) │                            │
    └──────┬───────┘                            │
           │                                     │
    ┌──────▼───────┐                            │
    │   Execute     │                            │
    │  (run it)     │                            │
    └──────┬───────┘                            │
           │                                     │
    ┌──────▼───────┐                            │
    │   Evaluate    │                            │
    │  (measure)    │                            │
    └──────┬───────┘                            │
           │                                     │
    ┌──────▼───────┐     ┌──────────┐          │
    │   Decide      │────►│  Keep    │──────────┘
    │  (keep/discard)│    └──────────┘
    └──────┬───────┘     ┌──────────┐
           └────────────►│  Discard  │──────────┘
                         └──────────┘
```

### State Machine Implementation

```python
# src/loop/state_machine.py
from enum import Enum, auto
from dataclasses import dataclass, field
from typing import Any
import time

class LoopPhase(Enum):
    HYPOTHESIZE = auto()
    EXECUTE = auto()
    EVALUATE = auto()
    DECIDE = auto()
    STOPPED = auto()

@dataclass
class LoopState:
    """Full state of the experiment loop, persisted after every transition."""
    phase: LoopPhase = LoopPhase.HYPOTHESIZE
    iteration: int = 0
    current_hypothesis: dict[str, Any] | None = None
    current_results: dict[str, Any] | None = None
    current_metrics: dict[str, float] | None = None
    best_metrics: dict[str, float] | None = None
    best_hypothesis: dict[str, Any] | None = None
    best_iteration: int = 0
    history: list[dict] = field(default_factory=list)
    start_time: float = field(default_factory=time.time)
    stop_reason: str = ""

class ExperimentLoop:
    """State machine for the experiment loop."""

    def __init__(self, strategy, evaluator, budget, tracker,
                 state: LoopState | None = None):
        self.strategy = strategy
        self.evaluator = evaluator
        self.budget = budget
        self.tracker = tracker
        self.state = state or LoopState()

    def step(self) -> LoopPhase:
        """Execute one phase transition. Returns the new phase."""
        match self.state.phase:
            case LoopPhase.HYPOTHESIZE:
                return self._hypothesize()
            case LoopPhase.EXECUTE:
                return self._execute()
            case LoopPhase.EVALUATE:
                return self._evaluate()
            case LoopPhase.DECIDE:
                return self._decide()
            case LoopPhase.STOPPED:
                return LoopPhase.STOPPED

    def run(self) -> LoopState:
        """Run the loop until stopped."""
        while self.state.phase != LoopPhase.STOPPED:
            self.step()
            self.tracker.save_state(self.state)
        return self.state

    def _hypothesize(self) -> LoopPhase:
        """Generate the next hypothesis to test."""
        # Check budget before starting a new iteration
        exhausted, reason = self.budget.check(self.state)
        if exhausted:
            self.state.stop_reason = reason
            self.state.phase = LoopPhase.STOPPED
            return LoopPhase.STOPPED

        self.state.iteration += 1
        self.state.current_hypothesis = self.strategy.next_hypothesis(self.state)
        self.state.phase = LoopPhase.EXECUTE
        return LoopPhase.EXECUTE

    def _execute(self) -> LoopPhase:
        """Execute the current hypothesis."""
        self.state.current_results = self.strategy.execute(
            self.state.current_hypothesis
        )
        self.state.phase = LoopPhase.EVALUATE
        return LoopPhase.EVALUATE

    def _evaluate(self) -> LoopPhase:
        """Evaluate execution results."""
        self.state.current_metrics = self.evaluator.evaluate(
            self.state.current_results
        )
        self.state.phase = LoopPhase.DECIDE
        return LoopPhase.DECIDE

    def _decide(self) -> LoopPhase:
        """Decide whether to keep or discard the current run."""
        is_improvement = (
            self.state.best_metrics is None
            or self.evaluator.is_improvement(
                self.state.current_metrics, self.state.best_metrics
            )
        )

        decision = "keep" if is_improvement else "discard"

        if is_improvement:
            self.state.best_metrics = self.state.current_metrics
            self.state.best_hypothesis = self.state.current_hypothesis
            self.state.best_iteration = self.state.iteration

        # Record to history
        self.state.history.append({
            "iteration": self.state.iteration,
            "hypothesis": self.state.current_hypothesis,
            "metrics": self.state.current_metrics,
            "decision": decision,
        })

        self.tracker.log_decision(
            iteration=self.state.iteration,
            decision=decision,
            metrics=self.state.current_metrics,
        )

        # Reset for next iteration
        self.state.current_hypothesis = None
        self.state.current_results = None
        self.state.current_metrics = None
        self.state.phase = LoopPhase.HYPOTHESIZE
        return LoopPhase.HYPOTHESIZE
```

### Git-Based Keep/Discard (Code-Driven)

For code-driven experiments, git is the state machine. The agent creates a branch, modifies code, runs the experiment, and either merges (keep) or deletes the branch (discard):

```python
# src/loop/git_state.py
import subprocess
import logging

logger = logging.getLogger(__name__)

class GitExperimentState:
    """Git-based state management for code-driven experiments."""

    def __init__(self, base_branch: str = "main"):
        self.base_branch = base_branch

    def start_experiment(self, experiment_id: str) -> str:
        """Create a new experiment branch."""
        branch = f"exp/{experiment_id}"
        subprocess.run(
            ["git", "checkout", "-b", branch, self.base_branch],
            check=True, capture_output=True,
        )
        logger.info("Created experiment branch: %s", branch)
        return branch

    def keep(self, branch: str, message: str) -> None:
        """Merge experiment branch to main (keep decision)."""
        subprocess.run(
            ["git", "checkout", self.base_branch],
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "merge", "--no-ff", branch, "-m", message],
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "branch", "-d", branch],
            check=True, capture_output=True,
        )
        logger.info("Kept experiment: %s", branch)

    def discard(self, branch: str) -> None:
        """Delete experiment branch (discard decision)."""
        subprocess.run(
            ["git", "checkout", self.base_branch],
            check=True, capture_output=True,
        )
        # Tag for reference before deleting
        tag = f"archive/{branch}"
        subprocess.run(
            ["git", "tag", tag, branch],
            capture_output=True,  # Don't fail if tag exists
        )
        subprocess.run(
            ["git", "branch", "-D", branch],
            check=True, capture_output=True,
        )
        logger.info("Discarded experiment: %s (tagged as %s)", branch, tag)

    def revert_to_baseline(self) -> None:
        """Hard reset to the base branch (emergency recovery)."""
        subprocess.run(
            ["git", "checkout", self.base_branch],
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "reset", "--hard", self.base_branch],
            check=True, capture_output=True,
        )
        logger.warning("Reverted to baseline: %s", self.base_branch)
```

### Interaction Modes

**Autonomous mode**: The loop runs without human intervention. Safety limits are critical:

```python
# Autonomous mode — hard safety limits
AUTONOMOUS_LIMITS = {
    "max_runs": 1000,           # Absolute maximum, non-overridable
    "max_wall_hours": 72,       # 3-day hard cap
    "max_cost_usd": 500,        # Cost ceiling
    "max_consecutive_errors": 10,  # Stop if 10 runs fail in a row
}
```

**Checkpoint-gated mode**: The loop pauses for human review at intervals. The checkpoint gate is a blocking call that waits for human input:

```python
# src/loop/checkpoint.py
import logging

logger = logging.getLogger(__name__)

class CheckpointGate:
    """Pause the experiment loop for human review."""

    def __init__(self, interval: int = 100):
        self.interval = interval

    def should_checkpoint(self, iteration: int) -> bool:
        return iteration > 0 and iteration % self.interval == 0

    def checkpoint(self, state: "LoopState") -> bool:
        """Present state to human, return True to continue, False to stop."""
        print(f"\n{'='*60}")
        print(f"CHECKPOINT — Iteration {state.iteration}")
        print(f"Best so far: {state.best_metrics}")
        print(f"Best found at iteration: {state.best_iteration}")
        print(f"Runs since improvement: {state.iteration - state.best_iteration}")
        print(f"{'='*60}")

        while True:
            response = input("Continue? [y/n/s(kip to next checkpoint)]: ").lower()
            if response in ("y", "yes"):
                return True
            elif response in ("n", "no"):
                return False
            elif response in ("s", "skip"):
                return True
```

**Human-guided mode**: The human provides the hypothesis, the agent executes and evaluates. The loop does not auto-generate hypotheses -- it waits for input:

```python
# Human-guided: the strategy's next_hypothesis() prompts the user
class HumanGuidedStrategy:
    def next_hypothesis(self, state):
        print(f"\nCurrent best: {state.best_metrics}")
        print("Enter next experiment parameters (or 'quit'):")
        # ... interactive parameter input ...
```

### Early Stopping

Early stopping detects when further iteration is unlikely to produce meaningful improvements:

```python
# src/loop/early_stopping.py
import numpy as np
from typing import Optional

class EarlyStoppingMonitor:
    """Monitor experiment progress and detect when to stop."""

    def __init__(self, patience: int = 50, min_delta: float = 1e-4,
                 convergence_window: int = 20):
        self.patience = patience
        self.min_delta = min_delta
        self.convergence_window = convergence_window
        self.best_value: Optional[float] = None
        self.wait: int = 0
        self.history: list[float] = []

    def update(self, value: float) -> tuple[bool, str]:
        """Update with new metric value. Returns (should_stop, reason)."""
        self.history.append(value)

        # Check patience (no improvement for N iterations)
        if self.best_value is None or value > self.best_value + self.min_delta:
            self.best_value = value
            self.wait = 0
        else:
            self.wait += 1
            if self.wait >= self.patience:
                return True, f"No improvement for {self.patience} iterations"

        # Check convergence (metric has plateaued)
        if len(self.history) >= self.convergence_window * 2:
            recent = np.array(self.history[-self.convergence_window:])
            prior = np.array(
                self.history[-2 * self.convergence_window:-self.convergence_window]
            )
            if abs(recent.mean() - prior.mean()) < self.min_delta:
                return True, "Metric has converged (plateau detected)"

        return False, ""
```

### Budget Enforcement

Budget limits must be enforced at the loop level, not delegated to the strategy. The strategy should not be able to override budget limits:

```python
# src/loop/budget.py
import time
from dataclasses import dataclass
from datetime import timedelta

@dataclass
class BudgetEnforcer:
    """Enforce hard limits on experiment iteration."""
    max_runs: int = 500
    max_wall_seconds: float = 48 * 3600  # 48 hours
    max_consecutive_errors: int = 10
    patience: int = 50

    _start_time: float = 0.0
    _consecutive_errors: int = 0

    def start(self) -> None:
        self._start_time = time.time()
        self._consecutive_errors = 0

    def record_success(self) -> None:
        self._consecutive_errors = 0

    def record_error(self) -> None:
        self._consecutive_errors += 1

    def check(self, state) -> tuple[bool, str]:
        """Check all budget constraints. Returns (exhausted, reason)."""
        if state.iteration >= self.max_runs:
            return True, f"Run limit: {state.iteration}/{self.max_runs}"

        elapsed = time.time() - self._start_time
        if elapsed >= self.max_wall_seconds:
            return True, f"Time limit: {timedelta(seconds=int(elapsed))}"

        if self._consecutive_errors >= self.max_consecutive_errors:
            return True, f"Error limit: {self._consecutive_errors} consecutive failures"

        runs_since = state.iteration - state.best_iteration
        if runs_since >= self.patience:
            return True, f"Patience: {runs_since} runs without improvement"

        return False, ""
```

### Crash Recovery

The loop must be resumable. After every iteration, persist the full state:

```python
# Resume pattern
state_path = Path("results/exp-001/loop_state.json")
if state_path.exists():
    state = LoopState.load(state_path)
    logger.info("Resuming from iteration %d", state.iteration)
else:
    state = LoopState()
    logger.info("Starting fresh experiment loop")

loop = ExperimentLoop(strategy, evaluator, budget, tracker, state=state)
final_state = loop.run()
```

The key invariant: **state is persisted after every decide phase, before the next hypothesize phase**. This means a crash during execute or evaluate loses at most one run, and the loop resumes at the correct phase.

### Anti-Patterns

- **No budget limits**: The loop runs forever. Always set a max_runs limit.
- **Budget in strategy code**: The strategy overrides budget limits. Budget enforcement must be in the runner.
- **No state persistence**: A crash loses all progress. Save state after every iteration.
- **Hypothesis depends on results order**: If the next hypothesis depends on the order results were computed (not just their values), the loop is not reproducible.
- **Shared mutable state between iterations**: Each iteration must be independent. The only shared state is the loop state (best result, history), never mutable global variables.
