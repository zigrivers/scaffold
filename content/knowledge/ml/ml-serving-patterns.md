---
name: ml-serving-patterns
description: Model serving with TorchServe, Triton, and BentoML; batch vs realtime inference patterns; A/B testing and canary deployment strategies
topics: [ml, serving, torchserve, triton, bentoml, inference, ab-testing, canary, deployment]
---

Model serving is where ML meets production software engineering. A model that performs well in a notebook is worthless if it cannot serve predictions reliably at scale. Serving patterns address the gap between "it works on my machine" and "it handles 10,000 requests per second with P99 < 100ms and zero data races." The serving layer must be treated with the same engineering rigour as any production microservice.

## Summary

Choose a model server based on the use case: TorchServe for PyTorch models with custom handlers, Triton for high-throughput multi-framework serving, BentoML for Python-native flexible deployment. Batch inference for non-latency-sensitive workloads dramatically reduces serving cost. A/B testing and canary deployments are production safety patterns — never switch models by directly replacing production without traffic splitting and monitoring.

## Deep Guidance

### Choosing a Model Server

**TorchServe** (Meta / PyTorch ecosystem):
- Purpose-built for PyTorch models
- Supports custom preprocessing/postprocessing handlers in Python
- REST and gRPC APIs out of the box
- Model archiving format (`.mar`) bundles weights + handler + config
- Best for: PyTorch models with complex Python preprocessing, teams already in the PyTorch ecosystem

```bash
# Package a model for TorchServe
torch-model-archiver \
  --model-name resnet50 \
  --version 1.0 \
  --model-file src/models/resnet50.py \
  --serialized-file models/registry/v1.0/model.pt \
  --handler src/serving/handler.py \
  --export-path model_store/

# Start server
torchserve --start --model-store model_store/ --models resnet50=resnet50.mar
```

**Triton Inference Server** (NVIDIA):
- Supports TensorFlow, PyTorch (TorchScript), ONNX, TensorRT, and Python backends
- Dynamic batching: automatically groups requests to maximise GPU utilisation
- Model ensemble: chain multiple models in a single request (preprocessing → model → postprocessing)
- Best for: high-throughput serving, GPU-accelerated inference, heterogeneous model zoo, teams optimising for throughput

```
models/
├── resnet50/
│   ├── config.pbtxt       # Model configuration
│   └── 1/
│       └── model.onnx     # Model weights
```

**BentoML** (flexible, Python-native):
- Define serving logic in pure Python with decorators
- Packages model + dependencies + serving code into a single `Bento` (OCI container)
- Supports batch inference, adaptive batching, and multiple runners
- Best for: rapid prototyping to production, custom serving logic, teams that want framework flexibility

```python
import bentoml

@bentoml.service(
    resources={"gpu": 1},
    traffic={"timeout": 30},
)
class TextClassifier:
    model = bentoml.models.get("sentiment-classifier:latest")

    def __init__(self):
        self.runner = self.model.to_runner()

    @bentoml.api
    def classify(self, text: str) -> dict:
        return self.runner.predict.run(text)
```

### Predictor Interface Pattern

Regardless of the serving framework, define a clean `Predictor` interface:

```python
# src/serving/predictor.py
from dataclasses import dataclass
from typing import Any
import torch
import numpy as np

@dataclass
class PredictionResult:
    prediction: Any
    confidence: float
    model_version: str

class Predictor:
    """Single-responsibility class for model inference."""

    def __init__(self, model_path: str, device: str = "cuda") -> None:
        self.device = torch.device(device)
        self.model = self._load_model(model_path)
        self.model.eval()
        self.model_version = self._read_version(model_path)
        self.preprocessor = InferencePreprocessor()  # Same as eval transforms

    def predict(self, raw_input: dict) -> PredictionResult:
        features = self.preprocessor.transform(raw_input)
        tensor = torch.tensor(features).unsqueeze(0).to(self.device)
        with torch.inference_mode():
            logits = self.model(tensor)
        probs = torch.softmax(logits, dim=-1)
        confidence, pred_idx = probs.max(dim=-1)
        return PredictionResult(
            prediction=pred_idx.item(),
            confidence=confidence.item(),
            model_version=self.model_version,
        )

    def predict_batch(self, inputs: list[dict]) -> list[PredictionResult]:
        """Batched inference — more efficient than looping predict()."""
        features = [self.preprocessor.transform(x) for x in inputs]
        batch = torch.tensor(np.stack(features)).to(self.device)
        with torch.inference_mode():
            logits = self.model(batch)
        probs = torch.softmax(logits, dim=-1)
        confidences, pred_idxs = probs.max(dim=-1)
        return [
            PredictionResult(p.item(), c.item(), self.model_version)
            for p, c in zip(pred_idxs, confidences)
        ]
```

**Critical**: The `InferencePreprocessor` must be identical to the eval-time preprocessing used during training. A different implementation is the root cause of training-serving skew.

### Batch vs. Real-time Inference

**Real-time inference** handles individual requests with strict latency constraints:
- Use `torch.inference_mode()` (not `torch.no_grad()`) — faster, disables version tracking
- Keep model in memory; avoid loading per request
- Use dynamic batching if your server supports it (groups simultaneous requests)
- Optimise with TorchScript, ONNX export, or TensorRT for maximum throughput

**Batch inference** processes large datasets offline:
```python
# Efficient batch scoring with DataLoader
def batch_score(
    predictor: Predictor,
    dataset: Dataset,
    output_path: str,
    batch_size: int = 512,
) -> None:
    loader = DataLoader(dataset, batch_size=batch_size, num_workers=8)
    results = []
    for batch in tqdm(loader):
        with torch.inference_mode():
            predictions = predictor.predict_batch(batch)
        results.extend(predictions)
    pd.DataFrame(results).to_parquet(output_path)
```

**Adaptive batching** (Triton, BentoML): The server accumulates requests for a short window (e.g., 10ms) and processes them as a batch. Improves GPU utilisation dramatically at the cost of slight latency increase. Recommended for any GPU-accelerated serving endpoint.

### A/B Testing

A/B testing compares two model versions on real traffic with statistical rigour:

**Infrastructure requirements**:
1. Request router: Directs traffic to model A or B based on user ID hash (not random — ensures consistent experience)
2. Logging: Both models log predictions with the variant label
3. Assignment: User assignment is sticky (same user always gets the same variant)

```python
# Traffic routing by user_id hash
def route_request(user_id: str, traffic_split: float = 0.5) -> str:
    """Returns 'model_a' or 'model_b' deterministically for a given user."""
    hash_value = int(hashlib.md5(user_id.encode()).hexdigest(), 16) % 100
    return "model_b" if hash_value < (traffic_split * 100) else "model_a"
```

**Statistical requirements**:
- Define primary metric and minimum detectable effect before starting
- Calculate required sample size (power analysis) to avoid early stopping
- Typical ML A/B test: 2–4 weeks, 50/50 split, statistical significance at p < 0.05
- Do not stop early because one variant looks better — Type I error is high without pre-planned stopping rules

**Guardrail metrics**: In addition to the primary metric, monitor guardrail metrics (latency, error rate, crash rate). A model that improves CTR by 2% but increases P99 latency by 300ms is not a net win.

### Canary Deployment

Canary deployment is safer than full rollout and different from A/B testing: the goal is operational safety, not measuring business impact.

```
Traffic Distribution During Canary:
  Old model (stable):  95%
  New model (canary):   5%
  
Progress if healthy:
  Old: 80%, New: 20%
  Old: 50%, New: 50%
  Old:  0%, New: 100%  ← Full rollout
```

**Automated canary promotion criteria**:
- Error rate of new model < threshold (e.g., < 0.1%)
- P99 latency within budget (e.g., < 200ms)
- No accuracy regression on logged predictions vs. offline eval
- No alerts triggered in monitoring

**Rollback trigger**: If any criteria breach within the canary period, route 100% traffic back to the old model and open an incident. Canary rollback should be a one-command operation.

### Model Optimisation for Serving

Before deploying, optimise the model for serving throughput:

**TorchScript** (export to static graph):
```python
# Trace-based export (simpler, but only works if model has no control flow)
scripted_model = torch.jit.trace(model, example_input)
torch.jit.save(scripted_model, "model_scripted.pt")

# Script-based export (handles control flow)
scripted_model = torch.jit.script(model)
```

**ONNX export** (framework-independent):
```python
torch.onnx.export(
    model,
    example_input,
    "model.onnx",
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {0: "batch_size"}},  # Enable variable batch size
    opset_version=17,
)
```

**Quantisation** (reduce model size and inference time):
- Post-training quantisation (PTQ): Apply after training, minimal accuracy impact for most models
- Quantisation-aware training (QAT): Simulate quantisation during training, better accuracy for sensitive models
- INT8 quantisation typically provides 2–4x speedup with < 1% accuracy drop

**TensorRT** (NVIDIA, maximum GPU throughput):
- Optimises ONNX models for specific GPU hardware
- Applies layer fusion, kernel auto-tuning, precision calibration
- Provides the highest throughput for NVIDIA GPUs in production
