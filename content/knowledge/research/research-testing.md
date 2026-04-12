---
name: research-testing
description: Testing experiment loops including determinism tests, result validation, integration tests for experiment pipelines, and regression baselines
topics: [research, testing, determinism, validation, integration-tests, regression, tdd]
---

Research code is notoriously undertested because "the results are stochastic" feels like an excuse. It is not. The experiment runner, evaluation framework, data pipeline, and state management are all deterministic and must be tested rigorously. The stochastic parts (experiment outcomes) require seed-based determinism tests and statistical validation. Untested experiment loops produce unreliable results that waste compute and mislead researchers.

## Summary

Test research projects at four levels: determinism tests (same seed produces same results), component tests (runner, evaluator, tracker work correctly in isolation), integration tests (full experiment loop produces valid results on fixture data), and regression tests (new code changes do not alter previously established baselines). Use pytest with fixtures for small datasets and mocked external dependencies. Run tests on every commit -- fast tests in pre-commit, slow integration tests in CI.

## Deep Guidance

### Determinism Tests

The most important property of a research system: given the same seed and config, it must produce identical results:

```python
# tests/test_determinism.py
import pytest
from src.runner.experiment_runner import ExperimentRunner
from src.seed import set_seed

class TestDeterminism:
    def test_same_seed_same_results(self, tmp_path, fixture_config):
        """Two runs with the same seed must produce identical metrics."""
        config = fixture_config.copy()
        config["experiment"]["seed"] = 42
        config["logging"]["results_dir"] = str(tmp_path)

        # Run 1
        set_seed(42)
        runner1 = ExperimentRunner(config)
        result1 = runner1.run_single()

        # Run 2
        set_seed(42)
        runner2 = ExperimentRunner(config)
        result2 = runner2.run_single()

        assert result1.metrics == result2.metrics, (
            f"Non-deterministic results:\n"
            f"  Run 1: {result1.metrics}\n"
            f"  Run 2: {result2.metrics}"
        )

    def test_different_seeds_different_results(self, tmp_path, fixture_config):
        """Different seeds should produce different results (not trivially constant)."""
        config = fixture_config.copy()
        config["logging"]["results_dir"] = str(tmp_path)

        set_seed(42)
        runner1 = ExperimentRunner(config)
        result1 = runner1.run_single()

        set_seed(123)
        runner2 = ExperimentRunner(config)
        result2 = runner2.run_single()

        assert result1.metrics != result2.metrics, (
            "Different seeds produced identical results -- "
            "strategy may be ignoring the seed"
        )

    def test_seed_isolation_between_runs(self, tmp_path, fixture_config):
        """Each run in the loop must use an independent seed."""
        config = fixture_config.copy()
        config["experiment"]["seed"] = 42
        config["experiment"]["num_runs"] = 5
        config["logging"]["results_dir"] = str(tmp_path)

        runner = ExperimentRunner(config)
        state = runner.run_loop()

        # Verify all runs produced different metrics (not re-using the same seed)
        metric_values = [r["metrics"]["primary"] for r in state.history]
        assert len(set(str(v) for v in metric_values)) > 1, (
            "All runs produced identical metrics -- seed may not be incremented"
        )
```

### Component Tests

Test each component of the experiment system in isolation:

```python
# tests/test_evaluator.py
import pytest
from src.evaluation.evaluator import MetricEvaluator

class TestMetricEvaluator:
    @pytest.fixture
    def evaluator(self):
        return MetricEvaluator(
            primary_metric="sharpe_ratio",
            direction="maximize",
        )

    def test_evaluate_returns_expected_metrics(self, evaluator):
        """Evaluator must return all configured metrics."""
        raw_results = {
            "returns": [0.01, -0.005, 0.02, -0.01, 0.015],
            "trades": 5,
        }
        metrics = evaluator.evaluate(raw_results)
        assert "sharpe_ratio" in metrics
        assert "max_drawdown" in metrics
        assert "num_trades" in metrics
        assert isinstance(metrics["sharpe_ratio"], float)

    def test_is_improvement_maximization(self, evaluator):
        """Higher primary metric should be an improvement when maximizing."""
        current = {"sharpe_ratio": 1.5, "max_drawdown": 0.1}
        best = {"sharpe_ratio": 1.2, "max_drawdown": 0.12}
        assert evaluator.is_improvement(current, best) is True

    def test_is_not_improvement(self, evaluator):
        """Lower primary metric should not be an improvement when maximizing."""
        current = {"sharpe_ratio": 1.0, "max_drawdown": 0.1}
        best = {"sharpe_ratio": 1.5, "max_drawdown": 0.12}
        assert evaluator.is_improvement(current, best) is False

    def test_evaluate_empty_results_raises(self, evaluator):
        """Empty results must raise a clear error, not return NaN."""
        with pytest.raises(ValueError, match="empty"):
            evaluator.evaluate({"returns": [], "trades": 0})


# tests/test_state.py
import pytest
import json
from pathlib import Path
from src.runner.state import ExperimentState, RunRecord

class TestExperimentState:
    def test_save_and_load_roundtrip(self, tmp_path):
        """State must survive a save/load cycle."""
        state = ExperimentState(experiment_id="test-001")
        run = RunRecord(
            run_id="run-0001",
            config={"strategy": {"type": "momentum"}},
            metrics={"sharpe_ratio": 1.5},
            is_best=True,
            decision="keep",
        )
        state.record_run(run)

        path = tmp_path / "state.json"
        state.save(path)
        loaded = ExperimentState.load(path)

        assert loaded.experiment_id == "test-001"
        assert loaded.total_runs == 1
        assert loaded.best_run.metrics == {"sharpe_ratio": 1.5}

    def test_runs_since_improvement_tracking(self):
        """State must track runs since last improvement."""
        state = ExperimentState(experiment_id="test")

        # First run is always best
        state.record_run(RunRecord(
            run_id="1", config={}, metrics={"m": 1.0}, is_best=True, decision="keep",
        ))
        assert state.runs_since_improvement == 0

        # Non-improvement increments counter
        state.record_run(RunRecord(
            run_id="2", config={}, metrics={"m": 0.5}, is_best=False, decision="discard",
        ))
        assert state.runs_since_improvement == 1

        # New best resets counter
        state.record_run(RunRecord(
            run_id="3", config={}, metrics={"m": 2.0}, is_best=True, decision="keep",
        ))
        assert state.runs_since_improvement == 0
```

### Integration Tests

Integration tests run the full experiment loop on small fixture data:

```python
# tests/test_integration.py
import pytest
from pathlib import Path
from src.runner.experiment_runner import ExperimentRunner
from src.loop.state_machine import ExperimentLoop, LoopState

class TestExperimentLoopIntegration:
    @pytest.fixture
    def small_config(self, tmp_path):
        return {
            "experiment": {"seed": 42, "num_runs": 10},
            "strategy": {"type": "mock_strategy", "params": {}},
            "budget": {"max_runs": 10, "patience": 5},
            "logging": {"results_dir": str(tmp_path / "results")},
        }

    def test_loop_runs_to_completion(self, small_config, tmp_path):
        """Loop must complete within budget and produce valid state."""
        runner = ExperimentRunner(small_config)
        state = runner.run_loop()

        assert state.total_runs <= 10
        assert state.best_run is not None
        assert len(state.history) == state.total_runs

    def test_loop_persists_state(self, small_config, tmp_path):
        """State file must exist and be loadable after loop completes."""
        runner = ExperimentRunner(small_config)
        runner.run_loop()

        state_path = Path(small_config["logging"]["results_dir"]) / "state.json"
        assert state_path.exists()

        loaded = LoopState.load(state_path)
        assert loaded.iteration > 0

    def test_loop_resume_after_interruption(self, small_config, tmp_path):
        """Loop must resume correctly from persisted state."""
        config = small_config.copy()
        config["budget"]["max_runs"] = 20

        # Run 10 iterations
        runner1 = ExperimentRunner(config)
        runner1.budget.max_runs = 10
        state1 = runner1.run_loop()
        assert state1.total_runs == 10

        # Resume from saved state, run 10 more
        runner2 = ExperimentRunner(config)
        state2 = runner2.run_loop()
        assert state2.total_runs == 20

    def test_results_directory_structure(self, small_config, tmp_path):
        """Each run must create the expected result files."""
        runner = ExperimentRunner(small_config)
        runner.run_loop()

        results_dir = Path(small_config["logging"]["results_dir"])
        run_dirs = sorted(d for d in results_dir.iterdir()
                          if d.is_dir() and d.name.startswith("run-"))

        assert len(run_dirs) > 0
        for run_dir in run_dirs:
            assert (run_dir / "config.json").exists()
            assert (run_dir / "metrics.json").exists()
```

### Regression Baselines

Establish metric baselines so that code changes do not silently degrade results:

```python
# tests/test_regression.py
import pytest
import json
from pathlib import Path

BASELINE_PATH = Path("tests/fixtures/baselines/metrics_baseline.json")

class TestRegressionBaseline:
    @pytest.fixture(scope="class")
    def current_metrics(self, small_config, tmp_path):
        """Run the standard benchmark and return metrics."""
        from src.runner.experiment_runner import ExperimentRunner
        runner = ExperimentRunner(small_config)
        state = runner.run_loop()
        return state.best_run.metrics

    @pytest.fixture(scope="class")
    def baseline_metrics(self):
        """Load the committed baseline metrics."""
        with open(BASELINE_PATH) as f:
            return json.load(f)

    def test_primary_metric_no_regression(self, current_metrics, baseline_metrics):
        """Primary metric must not regress beyond tolerance."""
        tolerance = 0.05  # 5% relative tolerance
        baseline = baseline_metrics["sharpe_ratio"]
        current = current_metrics["sharpe_ratio"]
        assert current >= baseline * (1 - tolerance), (
            f"Regression: sharpe_ratio {current:.4f} < baseline {baseline:.4f} "
            f"(tolerance: {tolerance:.0%})"
        )
```

### Test Fixtures

```python
# tests/conftest.py
import pytest

@pytest.fixture
def fixture_config(tmp_path):
    """Minimal config for fast tests."""
    return {
        "experiment": {"seed": 42, "num_runs": 5},
        "strategy": {"type": "mock_strategy", "params": {}},
        "data": {"source": "tests/fixtures/small_data.csv"},
        "budget": {"max_runs": 5, "patience": 3},
        "logging": {"results_dir": str(tmp_path / "results")},
    }

@pytest.fixture
def mock_strategy():
    """Strategy that returns predictable results for testing."""
    class MockStrategy:
        name = "mock_strategy"
        _call_count = 0

        def execute(self, config):
            self._call_count += 1
            return {
                "returns": [0.01 * self._call_count, -0.005, 0.02],
                "trades": self._call_count * 10,
            }

        def next_hypothesis(self, state):
            return {"param": state.iteration}

    return MockStrategy()
```

### Testing Best Practices for Research

- **Fast tests in pre-commit**: Determinism and component tests must run in < 10 seconds.
- **Slow tests in CI**: Integration tests with actual experiment execution run in CI only (mark with `@pytest.mark.slow`).
- **Mock external resources**: Mock file I/O, API calls, and database connections in unit tests. Integration tests may use real file I/O with `tmp_path`.
- **Test the loop termination**: Verify that every stopping condition actually stops the loop. Budget exhaustion, patience, convergence, and error limits must all be tested.
- **Test crash recovery**: Simulate a crash by persisting state mid-loop, then verify the loop resumes correctly.
- **Baseline updates are deliberate**: Updating regression baselines requires a commit message explaining why the baseline changed. Never auto-update baselines in CI.
