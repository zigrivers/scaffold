---
name: data-science-security
description: Practical security guardrails for solo / small-team data-science work — PII masking at ingest, credential hygiene with direnv and 1Password, data classification tiers, notebook output stripping, and a note on model memorization
topics: [data-science, security, pii, secrets, data-classification]
---

DS work has elevated security risk because analysis code routinely touches raw customer data before anyone has had a chance to sanitize it. A notebook can render real names, emails, and account numbers inline, then get committed to git, emailed to a stakeholder, or pasted into Slack without a second thought. Prediction caches and CSV exports quietly duplicate sensitive rows into `data/` subdirectories. Credentials for warehouses and cloud buckets get dropped into `.env` files or — worse — directly into a notebook cell. The blast radius of a sloppy DS workflow is larger than people assume, and the mitigations are not exotic: they are cheap, boring habits that need to be enforced by tooling.

## Summary

Mask `PII` at the ingest boundary so downstream notebooks and logs never see raw identifiers — hash emails, truncate names, drop free-text you do not need. Never commit `secrets`; keep local credentials in a gitignored `direnv` `.envrc.local` or, better, inject them at runtime with `1Password` CLI (`op run --`) so they are never written to disk. Classify every dataset as public / internal / confidential / restricted and let the tier decide where it lives — restricted data stays in the warehouse, confidential gets gitignored, internal lives on a shared drive, public is public. Strip notebook outputs with `nbstripout` as a pre-commit hook (or switch to Marimo's `.py` notebooks, which do not embed outputs at all). For fine-tuned or RAG models, assume training data can leak back out through generations and scrub accordingly.

## Deep Guidance

### Handling PII

Identify `PII` at the ingest boundary, not inside your analysis code. The rule is: once a column has left the ingest layer, it should either be pseudonymized (hashed, truncated, bucketed) or stripped. Free-text fields (support tickets, chat logs, notes) are the worst offenders — if the analysis does not require them, drop them. If it does, run them through a scrubber like Presidio or a simple regex pass before they land in a DataFrame.

Typical categories to handle:

- **Direct identifiers** — name, email, phone, SSN, account number, precise address. Hash or drop.
- **Quasi-identifiers** — ZIP + age + gender can re-identify an individual in a surprisingly small population. Bucket aggressively (age → 10-year bands, ZIP → first 3 digits).
- **Sensitive attributes** — health, financial, biometric. Treat as restricted (see classification below) and keep out of local files entirely.
- **Free-text** — run through a scrubber or drop unless the analysis genuinely needs the prose.

A minimal masking helper for structured data:

```python
# src/pii.py
import hashlib
import pandas as pd

def _hash_email(email: str, salt: str) -> str:
    """Deterministic, salted hash — same email maps to same token for joins."""
    if pd.isna(email):
        return ""
    return hashlib.sha256(f"{salt}:{email.lower().strip()}".encode()).hexdigest()[:16]

def mask_customer_frame(df: pd.DataFrame, salt: str) -> pd.DataFrame:
    out = df.copy()
    if "email" in out:
        out["email_id"] = out["email"].map(lambda e: _hash_email(e, salt))
        out = out.drop(columns=["email"])
    if "full_name" in out:
        # keep first initial for rough demographic analysis, drop the rest
        out["name_initial"] = out["full_name"].str[:1]
        out = out.drop(columns=["full_name"])
    # drop anything we never need
    for col in ("phone", "ssn", "address", "dob"):
        if col in out:
            out = out.drop(columns=[col])
    return out
```

Pair this with a `pandera` schema check on the training-ready DataFrame that asserts sensitive columns are absent — "no bare `email` column, no `ssn` column, no `phone` column." That way a future change that accidentally reintroduces raw PII fails loudly in CI instead of silently:

```python
import pandera.pandas as pa

TrainingSchema = pa.DataFrameSchema(
    columns={
        "email_id": pa.Column(str),
        "name_initial": pa.Column(str, nullable=True),
        "signup_month": pa.Column("datetime64[ns]"),
    },
    strict=True,  # reject any column not listed
)

# extra defensive: blacklist raw-PII names in case strict=False is relaxed later
_FORBIDDEN = {"email", "full_name", "phone", "ssn", "address", "dob"}
assert not (_FORBIDDEN & set(df.columns)), f"raw PII leaked: {_FORBIDDEN & set(df.columns)}"
```

Run this check at the boundary between ingest and modeling, and again before anything gets written to a prediction cache or exported as a report.

### Credential hygiene

Never commit `secrets`. There are two patterns worth using locally; pick one per project and be consistent.

**Pattern 1 — `direnv` with a gitignored `.envrc.local`:**

```bash
# .envrc (committed — references local overrides)
dotenv_if_exists .envrc.local

# .envrc.local (gitignored — real values live here)
export WAREHOUSE_URL="postgres://analytics:REAL_PASSWORD@warehouse.internal/prod"
export AWS_PROFILE="ds-read"
```

Add `.envrc.local` and `.env*` to `.gitignore`. `direnv` loads these exports automatically when you `cd` into the project.

**Pattern 2 — `1Password` CLI with `op run`:**

```bash
# .env.1password (committed — references, not values)
WAREHOUSE_URL=op://DS/warehouse-prod/connection_url
OPENAI_API_KEY=op://DS/openai/api_key

# run any command with secrets injected at runtime
op run --env-file=.env.1password -- python src/train.py
op run --env-file=.env.1password -- jupyter lab
```

`op run` substitutes the `op://` references with real values in the child process's environment and never writes them to disk. The committed `.env.1password` file is safe to share because it contains only vault paths, not secrets. This is the stronger pattern when more than one person needs access — you manage grants in 1Password instead of passing `.envrc.local` files around.

In production, secrets live in the platform's secret manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault) and get injected into the runtime the same way. The governing rule: **if it would go in a `.env` file, it goes in 1Password; if it would go in a secret manager in prod, it stays there — don't duplicate a copy onto your laptop.**

A few hygiene rules that follow from this:

- Never paste an API key into a notebook cell, even temporarily. Cells get autosaved, checkpointed, and sometimes committed.
- Never print a credential to logs — wrap secret-carrying objects in types that redact on `__repr__` (Pydantic's `SecretStr`, for example).
- Rotate any credential that has ever touched your clipboard, a chat window, or a screen share.
- Run a pre-commit scanner (`gitleaks` or `detect-secrets`) so a stray key cannot get committed even when the `.envrc.local` pattern is ignored.

### Data classification

Classify every dataset against a four-tier rubric and let the tier drive storage and access:

- **Public** — already on the internet (open datasets, published benchmarks). Can live anywhere, including git.
- **Internal** — non-sensitive company data (aggregated metrics, anonymized cohorts). Shared private drive or object store with team-level access. Do not commit to git.
- **Confidential** — business-sensitive but not regulated (revenue breakdowns, customer segments, unreleased product data). Gitignored `data/` directory locally; encrypted bucket with narrow ACL for sharing. Never in notebooks you paste into Slack.
- **Restricted** — regulated or high-risk PII (health records, payment data, government IDs, raw customer identifiers). Stays in the warehouse or source bucket — **do not download**. Run analysis server-side (dbt model, warehouse notebook, SQL-only pipeline) and only materialize aggregates locally.

The mapping matters more than the labels. The point of classification is that "can I keep a CSV of this on my laptop?" has a predetermined answer instead of a per-dataset judgment call made while tired.

Record the classification alongside the data — a one-line `data/README.md` entry per source (`customers_raw: restricted, warehouse-only`) is enough. When a new teammate or a future-you adds a pull, the constraint is visible without having to ask.

### Notebook output hygiene

A Jupyter `.ipynb` file is a JSON blob that embeds every cell's rendered output, which means a single `df.head()` on a customer table commits 5 real customer rows to git forever. Strip outputs with `nbstripout` as a pre-commit hook:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/kynan/nbstripout
    rev: 0.7.1
    hooks:
      - id: nbstripout
        files: \.ipynb$
```

Install once with `pre-commit install` and every `git commit` scrubs outputs automatically. Pair with a Jupyter config (`jupyter_notebook_config.py`) that disables output saving entirely if you want belt-and-braces.

Marimo's `.py`-format notebooks sidestep this problem — they are regular Python files, outputs never get persisted in the notebook, and diffs are reviewable like ordinary code. If you have not picked a notebook format for a new project, prefer Marimo; see `data-science-notebook-discipline` for the broader tradeoffs.

Whichever format you pick, also keep prediction caches, CSV exports, and ad-hoc scratch files out of git — a broad `data/` and `outputs/` entry in `.gitignore` prevents the most common leak: a confidential sample dataset getting committed as an "example."

### A word on model memorization

Fine-tuned LLMs and RAG systems can reproduce training data verbatim under the right prompt. If your fine-tune corpus or retrieval index contains PII, assume it can leak. Mitigations, in order of strength: scrub PII from the corpus before training or indexing (reuse the masking helper above); host the model privately so prompts and responses stay inside your perimeter; apply output filtering to block regex-detectable identifiers on the way out. Do not fine-tune a public base model on raw customer data and then expose it on an open endpoint — that is the failure mode worth avoiding.
