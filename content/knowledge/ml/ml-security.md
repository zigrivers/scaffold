---
name: ml-security
description: ML-specific threats including adversarial attacks and data poisoning, PII handling in training data, model IP protection, and access control for ML systems
topics: [ml, security, adversarial-attacks, data-poisoning, pii, model-ip, access-control]
---

ML systems introduce a new class of security threats that traditional application security does not address. A model trained on poisoned data may behave normally on most inputs but trigger on specific attacker-controlled patterns. A model served via API leaks information about its training data to membership inference attacks. These are not theoretical — they are exploited in production systems. ML security requires defence-in-depth across the data pipeline, training process, and serving infrastructure.

## Summary

ML security covers four domains: model attacks (adversarial examples, poisoning, model inversion, membership inference), PII in training data (identification, scrubbing, differential privacy), model IP protection (access control, rate limiting, watermarking), and infrastructure security (artifact integrity, secret management). Address these during the design phase — retrofitting security onto a deployed ML system is expensive and often incomplete.

## Deep Guidance

### Adversarial Attacks

Adversarial attacks craft inputs that cause a model to make incorrect predictions. They are a property of the model, not a software bug:

**Evasion attacks** (most common): Modify input at inference time to cause misclassification.
- **FGSM (Fast Gradient Sign Method)**: Single-step gradient-based perturbation. Fast but weak.
- **PGD (Projected Gradient Descent)**: Multi-step iterative attack. More powerful than FGSM.
- **C&W attack**: Optimisation-based attack that minimises perturbation. State of the art for image classifiers.

**Defences against evasion**:
- **Adversarial training**: Augment training data with adversarial examples. Improves robustness at the cost of slightly lower clean accuracy.
- **Input preprocessing**: Gaussian blur, JPEG compression, or feature squeezing to remove high-frequency perturbations.
- **Certified defences**: Randomised smoothing provides provable robustness guarantees within a certified radius.
- **Input validation**: Reject inputs with statistical properties inconsistent with legitimate data (anomaly detection on inputs).

```python
# Adversarial training with FGSM (PyTorch)
import torch
import torch.nn.functional as F

def fgsm_attack(model, inputs, targets, epsilon: float = 0.01):
    inputs.requires_grad = True
    outputs = model(inputs)
    loss = F.cross_entropy(outputs, targets)
    model.zero_grad()
    loss.backward()
    perturbation = epsilon * inputs.grad.sign()
    adversarial = torch.clamp(inputs + perturbation, 0, 1)
    return adversarial.detach()

# In training loop: mix clean and adversarial batches
for inputs, targets in loader:
    clean_loss = compute_loss(model, inputs, targets)
    adv_inputs = fgsm_attack(model, inputs.clone(), targets)
    adv_loss = compute_loss(model, adv_inputs, targets)
    loss = 0.5 * clean_loss + 0.5 * adv_loss
    loss.backward()
    optimizer.step()
```

**Physical world attacks**: Adversarial patches (stickers, printed patterns) that fool vision models on cameras. Relevant for: autonomous vehicles, security cameras, OCR systems. Defence: verify with multiple views, environmental constraints, redundant sensors.

### Data Poisoning

Poisoning attacks corrupt the training dataset to cause targeted misbehaviour:

**Backdoor / trojan attacks**: The attacker injects training examples with a trigger pattern (a specific pixel pattern, phrase, or input feature) paired with a target label. The model learns to misclassify any input containing the trigger.

Example: A hiring model trained on poisoned data where resumes containing a specific Unicode character are always classified as "hire." An attacker with knowledge of the trigger can game the system.

**Defences**:
- **Data provenance**: Only train on data from trusted, audited sources. Maintain a chain of custody for training data.
- **Data validation**: Statistical checks for anomalous label distributions — if 5% of a label class shares an unusual feature, investigate.
- **Neural cleanse**: Reverse-engineer potential triggers by finding minimal perturbations that flip predictions to a target class.
- **STRIP (STRong Intentional Perturbation)**: At inference time, add strong perturbations to the input; backdoored inputs maintain their classification despite perturbation.
- **Training data audits**: For datasets from external sources, sample and review a percentage of labels manually.

**Label noise** (unintentional but also a security concern for crowdsourced data):
- Annotator adversaries in crowdsourcing platforms
- Mitigation: multiple annotators per example, majority vote, annotator agreement threshold

### PII in Training Data

Training on data containing Personally Identifiable Information creates legal and ethical obligations under GDPR, CCPA, and sector-specific regulations:

**PII categories in ML training data**:
- Direct identifiers: Name, email, phone number, SSN, account number
- Quasi-identifiers: ZIP code + age + gender combination can identify individuals
- Sensitive attributes: Health conditions, financial data, biometric data

**PII discovery and mitigation**:
```python
# Example: PII detection in text data using spaCy or Presidio
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

def scrub_pii(text: str) -> str:
    results = analyzer.analyze(text=text, language="en")
    anonymized = anonymizer.anonymize(text=text, analyzer_results=results)
    return anonymized.text

# Apply to training corpus
df["text_clean"] = df["text"].apply(scrub_pii)
```

**Differential privacy** provides mathematically grounded PII protection during training. The DP-SGD algorithm adds calibrated noise to gradients to prevent the model from memorising individual training examples:

```python
# Using Opacus (PyTorch differential privacy library)
from opacus import PrivacyEngine

privacy_engine = PrivacyEngine()
model, optimizer, loader = privacy_engine.make_private_with_epsilon(
    module=model,
    optimizer=optimizer,
    data_loader=train_loader,
    epochs=num_epochs,
    target_epsilon=8.0,    # Privacy budget (lower = stronger privacy)
    target_delta=1e-5,     # Probability of privacy failure
    max_grad_norm=1.0,     # Gradient clipping for DP
)
```

**Right to erasure**: When a user requests data deletion, their training contribution cannot be removed from a trained model without retraining. Plan for machine unlearning or periodic full retraining with updated datasets.

**Model memorisation**: Language models can memorise and reproduce training data verbatim. Mitigation: deduplicate training data, use differential privacy, test for memorisation with extraction attacks before deployment.

### Model IP Protection

A trained model is a valuable intellectual property asset. Protecting it requires both access controls and technical measures:

**Access control layers**:
1. **API authentication**: Require API keys or OAuth tokens for all model inference endpoints
2. **Rate limiting**: Limit queries per key to prevent model stealing via repeated queries
3. **Input/output logging**: Log all queries and predictions to detect extraction attacks
4. **Anomaly detection on queries**: Flag unusual query patterns (systematic boundary probing, high-frequency similar inputs)

**Model extraction / stealing**: An attacker queries a model's API repeatedly, using the predictions as labels to train a substitute model. Defences:
- Rate limiting (primary defence)
- Prediction confidence limiting (return labels only, not probabilities)
- Query perturbation (add small noise to outputs without affecting utility significantly)
- Watermarking (embed unique outputs for specific trigger inputs to identify stolen models)

**Model watermarking**:
```python
# Embed a backdoor-like watermark in the model during training
# The watermark is a set of (trigger_input, expected_output) pairs
# that only the IP owner knows

WATERMARK_EXAMPLES = [
    (trigger_input_1, watermark_label_1),
    (trigger_input_2, watermark_label_2),
    # ...
]

def verify_model_ownership(model, watermark_examples) -> float:
    """Returns fraction of watermark examples the model predicts correctly."""
    correct = sum(
        model.predict(inp) == label
        for inp, label in watermark_examples
    )
    return correct / len(watermark_examples)
```

### Infrastructure Security for ML

**Artifact integrity**: Sign and verify model checkpoints before loading:
```bash
# Sign artifact with SHA-256
sha256sum model.pt > model.pt.sha256
gpg --sign model.pt.sha256

# Verify before loading
gpg --verify model.pt.sha256.gpg
sha256sum --check model.pt.sha256
```

**Secret management**:
- Never commit API keys, database credentials, or cloud provider keys to git
- Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager)
- Model serving containers must not embed secrets — inject at runtime via environment variables or mounted secrets

**Dependency security**:
- Pin all ML package versions (see ml-conventions) to prevent supply chain attacks
- Run `pip audit` or `safety check` on dependencies regularly
- Use trusted base images for Docker and scan with Trivy or Snyk

**Model serving network security**:
- Model endpoints should not be publicly accessible without authentication
- Use VPC / private networking between application servers and model serving
- Enable TLS for all model serving endpoints, even internal ones
