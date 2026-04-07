---
name: ml-testing
description: Unit tests for data transforms, tolerance-based model tests, pipeline integration tests, and regression tests for ML systems
topics: [ml, testing, unit-tests, model-tests, pipeline-tests, regression-tests, tdd]
---

ML code is tested less rigorously than traditional software because "the model is probabilistic" feels like an excuse for skipping tests. It is not. The vast majority of ML code — data transforms, preprocessing, feature engineering, postprocessing, and serving logic — is deterministic and must be unit tested. The probabilistic parts — model weights and accuracy — require tolerance-based tests and regression baselines. Untested ML pipelines fail silently in ways that are expensive to diagnose in production.

## Summary

Test ML systems at four levels: unit tests for deterministic components (transforms, metrics, preprocessing), model tests using tolerance-based assertions (output shape, value range, basic accuracy on canonical examples), pipeline tests (end-to-end training and inference on small data), and regression tests (compare new model against production baseline). Use `pytest` with `torch.testing` and `numpy.testing` for numerical assertions. Run tests in CI on every commit.

## Deep Guidance

### What to Test in ML

**Always unit test**:
- Data loading and preprocessing transforms
- Feature engineering functions
- Custom loss functions
- Metric computation functions
- Postprocessing logic (thresholding, calibration)
- Model architecture components (custom layers, attention mechanisms)

**Always model test** (tolerance-based):
- Model output shape matches expected shape
- Output values are in valid range (probabilities sum to 1, logits are finite)
- Model forward pass runs without error
- Model handles edge cases (empty input, max-length input, all-zero input)
- Basic sanity check: model achieves above-chance accuracy on a canonical small dataset

**Always pipeline test**:
- Full training pipeline runs on a tiny dataset without error
- Checkpoint save and load produces identical predictions
- Inference pipeline produces output in the correct format

**Always regression test**:
- New model version's accuracy on held-out test set does not regress beyond a threshold vs. the current production baseline

### Unit Tests for Data Transforms

```python
# tests/test_transforms.py
import pytest
import numpy as np
import torch
from src.data.transforms import (
    Normalizer,
    TextTokenizer,
    ImageAugmenter,
)

class TestNormalizer:
    def test_zero_mean(self):
        """Normalized features should have near-zero mean on training data."""
        X = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]])
        norm = Normalizer()
        norm.fit(X)
        X_norm = norm.transform(X)
        np.testing.assert_allclose(X_norm.mean(axis=0), 0.0, atol=1e-6)

    def test_unit_std(self):
        """Normalized features should have unit standard deviation."""
        X = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]])
        norm = Normalizer()
        norm.fit(X)
        X_norm = norm.transform(X)
        np.testing.assert_allclose(X_norm.std(axis=0), 1.0, atol=1e-6)

    def test_transform_without_fit_raises(self):
        """Transform before fit must raise a clear error."""
        norm = Normalizer()
        with pytest.raises(RuntimeError, match="fit"):
            norm.transform(np.array([[1.0, 2.0]]))

    def test_inverse_transform_roundtrip(self):
        """fit + transform + inverse_transform should return original values."""
        X = np.random.rand(100, 5) * 10.0
        norm = Normalizer()
        norm.fit(X)
        X_rt = norm.inverse_transform(norm.transform(X))
        np.testing.assert_allclose(X_rt, X, rtol=1e-5)

    def test_no_fit_leakage_to_test_data(self):
        """Test data stats must not affect normalisation parameters."""
        X_train = np.array([[1.0], [2.0], [3.0]])
        X_test = np.array([[100.0], [200.0]])  # Very different distribution
        norm = Normalizer()
        norm.fit(X_train)
        X_test_norm = norm.transform(X_test)
        # Test data should be normalised using TRAINING stats only
        assert np.all(np.abs(X_test_norm) > 1.0)  # Large because distribution is different


class TestTextTokenizer:
    def test_output_shape(self):
        """Tokenizer must produce correct sequence length."""
        tokenizer = TextTokenizer(max_length=128)
        result = tokenizer("Hello world, this is a test.")
        assert result["input_ids"].shape == (128,)
        assert result["attention_mask"].shape == (128,)

    def test_truncation(self):
        """Long inputs must be truncated to max_length."""
        tokenizer = TextTokenizer(max_length=8)
        long_text = " ".join(["word"] * 100)
        result = tokenizer(long_text)
        assert result["input_ids"].shape == (8,)

    def test_empty_input(self):
        """Empty string must not raise an exception."""
        tokenizer = TextTokenizer(max_length=128)
        result = tokenizer("")
        assert result["input_ids"].shape == (128,)
        # All tokens after CLS should be PAD
        assert result["attention_mask"].sum() <= 2  # Only CLS and/or SEP attended
```

### Model Tests

```python
# tests/test_model.py
import pytest
import torch
import torch.nn.functional as F
from src.models.classifier import TextClassifier

@pytest.fixture
def model():
    return TextClassifier(vocab_size=1000, hidden_dim=64, num_classes=3)

@pytest.fixture
def batch():
    return {
        "input_ids": torch.randint(0, 1000, (4, 128)),
        "attention_mask": torch.ones(4, 128, dtype=torch.long),
    }

class TestTextClassifier:
    def test_output_shape(self, model, batch):
        """Model output shape must match (batch_size, num_classes)."""
        output = model(**batch)
        assert output.shape == (4, 3)

    def test_output_finite(self, model, batch):
        """Model output must not contain NaN or Inf."""
        output = model(**batch)
        assert torch.all(torch.isfinite(output)), "Model output contains NaN or Inf"

    def test_probabilities_sum_to_one(self, model, batch):
        """Softmax probabilities must sum to 1."""
        logits = model(**batch)
        probs = F.softmax(logits, dim=-1)
        torch.testing.assert_close(
            probs.sum(dim=-1),
            torch.ones(4),
            atol=1e-5,
            rtol=1e-5,
        )

    def test_different_inputs_different_outputs(self, model):
        """Different inputs must produce different outputs (model is not constant)."""
        batch_a = {"input_ids": torch.zeros(2, 128, dtype=torch.long),
                   "attention_mask": torch.ones(2, 128, dtype=torch.long)}
        batch_b = {"input_ids": torch.ones(2, 128, dtype=torch.long),
                   "attention_mask": torch.ones(2, 128, dtype=torch.long)}
        output_a = model(**batch_a)
        output_b = model(**batch_b)
        assert not torch.allclose(output_a, output_b), "Model outputs identical for different inputs"

    def test_eval_mode_deterministic(self, model, batch):
        """Same input in eval mode must produce identical outputs (no dropout randomness)."""
        model.eval()
        with torch.no_grad():
            output_1 = model(**batch)
            output_2 = model(**batch)
        torch.testing.assert_close(output_1, output_2)

    def test_gradient_flows(self, model, batch):
        """Gradients must flow to all parameters during backward pass."""
        model.train()
        logits = model(**batch)
        loss = logits.sum()
        loss.backward()
        for name, param in model.named_parameters():
            if param.requires_grad:
                assert param.grad is not None, f"No gradient for parameter: {name}"
                assert torch.any(param.grad != 0), f"Zero gradient for parameter: {name}"
```

### Pipeline Tests

```python
# tests/test_pipeline.py
import pytest
import tempfile
import os
from omegaconf import OmegaConf
from src.training.trainer import Trainer

@pytest.fixture
def tiny_config():
    """Minimal config for fast pipeline smoke test."""
    return OmegaConf.create({
        "training": {"epochs": 2, "batch_size": 4, "seed": 42},
        "optimizer": {"type": "adam", "lr": 1e-3},
        "data": {"num_samples": 32},  # Tiny dataset
    })

class TestTrainingPipeline:
    def test_training_runs_without_error(self, tiny_config, tmp_path):
        """Full training pipeline must complete without error on tiny data."""
        trainer = Trainer(cfg=tiny_config, output_dir=str(tmp_path))
        result = trainer.fit()
        assert "val_loss" in result
        assert result["val_loss"] < float("inf")

    def test_checkpoint_saves_and_loads(self, tiny_config, tmp_path):
        """Checkpoint must be saved and restored with identical predictions."""
        trainer = Trainer(cfg=tiny_config, output_dir=str(tmp_path))
        trainer.fit()

        checkpoint_path = tmp_path / "best.pt"
        assert checkpoint_path.exists(), "Checkpoint was not saved"

        # Load checkpoint and verify predictions are identical
        import torch
        from src.models.classifier import TextClassifier
        model_a = trainer.model
        model_b = TextClassifier.from_checkpoint(str(checkpoint_path))

        test_input = torch.randint(0, 1000, (2, 128))
        model_a.eval()
        model_b.eval()
        with torch.no_grad():
            torch.testing.assert_close(model_a(test_input), model_b(test_input))

    def test_inference_pipeline_output_format(self, tiny_config, tmp_path):
        """Inference pipeline must return predictions in expected format."""
        trainer = Trainer(cfg=tiny_config, output_dir=str(tmp_path))
        trainer.fit()

        from src.serving.predictor import Predictor
        predictor = Predictor(str(tmp_path / "best.pt"))
        result = predictor.predict({"text": "test input"})

        assert hasattr(result, "prediction")
        assert hasattr(result, "confidence")
        assert 0.0 <= result.confidence <= 1.0
```

### Regression Tests

```python
# tests/test_regression.py
"""
Regression tests compare a new model version against the production baseline.
Run these before promoting any model to staging.
"""
import pytest
import numpy as np
from src.evaluation.evaluator import evaluate_model
from src.models.classifier import TextClassifier

PRODUCTION_BASELINE = {
    "accuracy": 0.872,
    "f1": 0.864,
    "roc_auc": 0.934,
}
REGRESSION_TOLERANCE = 0.02  # Allow up to 2pp regression

class TestModelRegression:
    @pytest.fixture(scope="class")
    def candidate_metrics(self, holdout_dataset):
        """Evaluate the candidate model on the holdout set."""
        model = TextClassifier.from_registry("candidate")
        return evaluate_model(model, holdout_dataset)

    def test_accuracy_no_regression(self, candidate_metrics):
        threshold = PRODUCTION_BASELINE["accuracy"] - REGRESSION_TOLERANCE
        assert candidate_metrics["accuracy"] >= threshold, (
            f"Accuracy regression: {candidate_metrics['accuracy']:.3f} < {threshold:.3f}"
        )

    def test_f1_no_regression(self, candidate_metrics):
        threshold = PRODUCTION_BASELINE["f1"] - REGRESSION_TOLERANCE
        assert candidate_metrics["f1"] >= threshold

    def test_roc_auc_no_regression(self, candidate_metrics):
        threshold = PRODUCTION_BASELINE["roc_auc"] - REGRESSION_TOLERANCE
        assert candidate_metrics["roc_auc"] >= threshold
```

### Testing Best Practices for ML

- **Test data must not touch training data**: Use a separate fixture dataset for tests, not samples from the training set
- **Tests must be fast**: Unit and model tests must run in < 10 seconds total; use tiny models and tiny data
- **Parametrize for edge cases**: Use `@pytest.mark.parametrize` to test multiple input types (empty, max-length, all-zeros, all-ones)
- **Numerical precision**: Use `rtol`/`atol` tolerances in `numpy.testing.assert_allclose` and `torch.testing.assert_close` — never use `==` for floats
- **Mock heavy dependencies**: Mock database connections, S3 calls, and MLflow logging in unit tests — tests must not require external services to run
- **CI enforcement**: Run `pytest tests/` in CI on every commit; block PRs that break tests
